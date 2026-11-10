// วันเกิด: สมาชิกตั้งวันเกิดเอง (เก็บแค่วัน/เดือน) → ถึงวันนั้นบอทประกาศและแจกฉายาวันเกิด ถอดฉายาให้วันถัดไป
import { Events, SlashCommandBuilder } from 'discord.js';
import { db, save } from '../db.js';
import { birthdayRoleOf, offsetOf } from '../settings.js';
import { EPHEMERAL, dateKey, localParts, sendTo } from '../util.js';

const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MONTH_NAMES = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

export const commands = [
  new SlashCommandBuilder()
    .setName('birthday')
    .setDescription('วันเกิดสมาชิก')
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName('set')
        .setDescription('ตั้งวันเกิดของคุณ (เก็บแค่วันกับเดือน ไม่เก็บปี)')
        .addIntegerOption((o) => o.setName('day').setDescription('วันที่').setRequired(true).setMinValue(1).setMaxValue(31))
        .addIntegerOption((o) => o.setName('month').setDescription('เดือน (1-12)').setRequired(true).setMinValue(1).setMaxValue(12)),
    )
    .addSubcommand((s) => s.setName('remove').setDescription('ลบวันเกิดของคุณออกจากระบบ'))
    .addSubcommand((s) => s.setName('next').setDescription('ดูวันเกิดที่กำลังจะถึง')),
];

function daysUntil(d, m, offset) {
  const t = localParts(new Date(), offset);
  const today = Date.UTC(t.year, t.month - 1, t.day);
  let target = Date.UTC(t.year, m - 1, d);
  if (target < today) target = Date.UTC(t.year + 1, m - 1, d);
  return Math.round((target - today) / 86400000);
}

// วันเกิด 29 ก.พ. ในปีที่ไม่มี 29 ก.พ. ให้ฉลองวันที่ 28 ก.พ. แทน
function isToday(b, offset) {
  const t = localParts(new Date(), offset);
  const leap = new Date(Date.UTC(t.year, 1, 29)).getUTCDate() === 29;
  if (b.d === 29 && b.m === 2 && !leap) return t.month === 2 && t.day === 28;
  return b.d === t.day && b.m === t.month;
}

async function birthdayCommand(i) {
  const sub = i.options.getSubcommand();
  const all = (db.birthdays[i.guild.id] ??= {});

  if (sub === 'set') {
    const d = i.options.getInteger('day', true);
    const m = i.options.getInteger('month', true);
    if (d > MONTH_DAYS[m - 1]) return i.reply({ content: '❌ เดือนนี้ไม่มีวันที่นี้นะ', ...EPHEMERAL });
    all[i.user.id] = { d, m };
    save();
    return i.reply({ content: `🎂 บันทึกวันเกิดของคุณเป็น **${d} ${MONTH_NAMES[m - 1]}** แล้ว`, ...EPHEMERAL });
  }

  if (sub === 'remove') {
    delete all[i.user.id];
    save();
    return i.reply({ content: '🗑️ ลบวันเกิดของคุณแล้ว', ...EPHEMERAL });
  }

  const upcoming = Object.entries(all)
    .map(([id, b]) => ({ id, b, days: daysUntil(b.d, b.m, offsetOf(i.guild.id)) }))
    .sort((a, z) => a.days - z.days)
    .slice(0, 8);
  if (!upcoming.length) return i.reply({ content: 'ยังไม่มีใครตั้งวันเกิดเลย ใช้ `/birthday set` ได้นะ 🎂', ...EPHEMERAL });

  const lines = upcoming.map(({ id, b, days }) => `🎂 <@${id}> • ${b.d} ${MONTH_NAMES[b.m - 1]} ${days === 0 ? '(วันนี้!)' : `(อีก ${days} วัน)`}`);
  return i.reply({ content: lines.join('\n'), allowedMentions: { parse: [] } });
}

// ตรวจวันเกิดวันละครั้ง (ทำซ้ำได้ปลอดภัย: จำวันที่ตรวจล่าสุดไว้ จึงไม่ประกาศซ้ำแม้บอทรีสตาร์ต)
async function runBirthdayCheck(client) {
  const checked = (db.meta.birthdayChecked ??= {});

  for (const guild of client.guilds.cache.values()) {
    const offset = offsetOf(guild.id);
    const today = dateKey(new Date(), offset);
    if (checked[guild.id] === today) continue;
    try {
      const entries = Object.entries(db.birthdays[guild.id] ?? {});
      const todayIds = new Set(entries.filter(([, b]) => isToday(b, offset)).map(([id]) => id));
      const role = birthdayRoleOf(guild);

      if (role?.editable) {
        await guild.members.fetch().catch(() => {});
        for (const member of role.members.values()) {
          if (!todayIds.has(member.id)) await member.roles.remove(role).catch(() => {});
        }
      }

      for (const id of todayIds) {
        const member = await guild.members.fetch(id).catch(() => null);
        if (!member) continue; // ออกจากเซิร์ฟไปแล้ว
        if (role?.editable) await member.roles.add(role).catch(() => {});
        await sendTo(guild, 'birthday', {
          content: `🎂🎉 วันนี้เป็นวันเกิดของ <@${id}>! ขอให้มีความสุขมากๆ นะ 🐾`,
          allowedMentions: { users: [id] },
        });
      }
      checked[guild.id] = today;
      save();
    } catch (err) {
      console.error('ตรวจวันเกิดไม่สำเร็จ:', err);
    }
  }
}

export const commandHandlers = { birthday: birthdayCommand };

export function register(client) {
  client.once(Events.ClientReady, () => {
    runBirthdayCheck(client);
    setInterval(() => runBirthdayCheck(client), 15 * 60 * 1000).unref();
  });
}
