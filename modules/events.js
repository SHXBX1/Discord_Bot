// กิจกรรมในเซิร์ฟ: /event (นัดดูหนัง/เล่นเกม) , /vote (โหวต) , /lfg (หาเพื่อนเล่นเกม)
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  PermissionFlagsBits as P,
  SectionBuilder,
  SlashCommandBuilder,
} from 'discord.js';
import { EVENT_TYPES } from '../config.js';
import { db, save } from '../db.js';
import { isHome, offsetOf, roleByKey } from '../settings.js';
import { EPHEMERAL, V2, divider, localParts, text, unix } from '../util.js';

// ---------- /event ----------
const eventSub = (name, desc, titleDesc) => (s) =>
  s
    .setName(name)
    .setDescription(desc)
    .addStringOption((o) => o.setName('title').setDescription(titleDesc).setRequired(true).setMaxLength(80))
    .addStringOption((o) => o.setName('date').setDescription('วันที่ เช่น 25/10 หรือ 25/10/2026').setRequired(true))
    .addStringOption((o) => o.setName('time').setDescription('เวลา เช่น 20:30').setRequired(true))
    .addChannelOption((o) =>
      o
        .setName('channel')
        .setDescription('ห้องเสียงที่นัดกัน (ไม่เลือก = ห้องเริ่มต้นของกิจกรรมนี้ ถ้ามี)')
        .addChannelTypes(ChannelType.GuildVoice),
    )
    .addRoleOption((o) => o.setName('ping').setDescription('ฉายาที่จะแท็กในประกาศ (ไม่เลือก = ฉายา Movie/Game Night ถ้ามี)'))
    .addStringOption((o) => o.setName('detail').setDescription('รายละเอียดเพิ่มเติม').setMaxLength(500));

export const commands = [
  new SlashCommandBuilder()
    .setName('event')
    .setDescription('สร้างนัดดูหนัง / นัดเล่นเกม (สตาฟ)')
    .setDefaultMemberPermissions(P.ManageEvents)
    .setDMPermission(false)
    .addSubcommand(eventSub('movie', 'นัดดูหนังด้วยกัน', 'ชื่อหนัง/ซีรีส์/อนิเมะ'))
    .addSubcommand(eventSub('game', 'นัดเล่นเกมด้วยกัน', 'ชื่อเกม/กิจกรรม')),

  new SlashCommandBuilder()
    .setName('vote')
    .setDescription('สร้างโหวตให้ทุกคนกดเลือก')
    .setDMPermission(false)
    .addStringOption((o) => o.setName('question').setDescription('คำถามหรือหัวข้อโหวต').setRequired(true).setMaxLength(300))
    .addStringOption((o) =>
      o.setName('options').setDescription('ตัวเลือก 2-10 ข้อ คั่นด้วย , หรือ |  เช่น Spy x Family, Frieren, Dandadan').setRequired(true),
    )
    .addIntegerOption((o) => o.setName('hours').setDescription('เปิดโหวตกี่ชั่วโมง (ค่าเริ่มต้น 24)').setMinValue(1).setMaxValue(168))
    .addBooleanOption((o) => o.setName('multi').setDescription('เลือกได้หลายข้อไหม (ค่าเริ่มต้น ไม่ได้)')),

  new SlashCommandBuilder()
    .setName('lfg')
    .setDescription('โพสต์หาเพื่อนเล่นเกมด้วย')
    .setDMPermission(false)
    .addStringOption((o) => o.setName('game').setDescription('ชื่อเกม').setRequired(true).setMaxLength(60))
    .addIntegerOption((o) => o.setName('players').setDescription('จำนวนผู้เล่นทั้งหมด (รวมคุณ)').setRequired(true).setMinValue(2).setMaxValue(25))
    .addStringOption((o) => o.setName('when').setDescription('เล่นเมื่อไหร่ เช่น ตอนนี้ / 2 ทุ่มคืนนี้').setMaxLength(60))
    .addStringOption((o) => o.setName('note').setDescription('หมายเหตุ เช่น แรงค์ ห้องเสียง').setMaxLength(200)),
];

// แปลง "25/10" + "20:30" เป็นเวลาตามเขตเวลาของเซิร์ฟ (รับปี พ.ศ. ด้วย)
function parseWhen(dateStr, timeStr, offset) {
  const d = /^(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?$/.exec(dateStr.trim());
  const t = /^(\d{1,2})[:.](\d{2})$/.exec(timeStr.trim());
  if (!d || !t) return { error: '❌ รูปแบบไม่ถูก ใส่วันที่แบบ `25/10` หรือ `25/10/2026` และเวลาแบบ `20:30`' };

  const day = Number(d[1]);
  const month = Number(d[2]);
  const hour = Number(t[1]);
  const minute = Number(t[2]);
  const hasYear = Boolean(d[3]);
  let year = hasYear ? Number(d[3]) : localParts(new Date(), offset).year;
  if (year < 100) year += 2000;
  if (year > 2400) year -= 543;
  if (month < 1 || month > 12 || hour > 23 || minute > 59) return { error: '❌ วันที่หรือเวลาไม่ถูกต้อง' };

  const valid = (y) => {
    const c = new Date(Date.UTC(y, month - 1, day));
    return c.getUTCMonth() === month - 1 && c.getUTCDate() === day;
  };
  const build = (y) => new Date(Date.UTC(y, month - 1, day, hour, minute) - offset * 3600e3);

  if (!valid(year)) return { error: '❌ ไม่มีวันที่นี้ในปฏิทิน' };
  let when = build(year);
  // ไม่ใส่ปีและวันนั้นผ่านไปแล้ว → ถือว่าหมายถึงปีหน้า
  if (!hasYear && when.getTime() < Date.now() && valid(year + 1)) when = build(year + 1);
  return { when };
}

async function eventCommand(i) {
  const kind = i.options.getSubcommand();
  const cfg = EVENT_TYPES[kind];
  await i.deferReply(EPHEMERAL);

  const parsed = parseWhen(i.options.getString('date', true), i.options.getString('time', true), offsetOf(i.guild.id));
  if (parsed.error) return i.editReply(parsed.error);
  const start = parsed.when;
  if (start.getTime() < Date.now() + 60_000) return i.editReply('❌ เวลานี้ผ่านไปแล้วหรือใกล้เกินไป ต้องเป็นอนาคตอย่างน้อย 1 นาที');

  const guild = i.guild;
  const title = i.options.getString('title', true);
  const detail = i.options.getString('detail');
  const vc =
    i.options.getChannel('channel') ??
    (isHome(guild.id) ? guild.channels.cache.find((c) => c.type === ChannelType.GuildVoice && c.name === cfg.voiceName) : null) ??
    null;

  // ฉายาที่จะแท็ก: ที่สตาฟเลือก หรือฉายา Movie/Game Night ของเซิร์ฟ (ถ้ามี)
  const picked = i.options.getRole('ping');
  let role = picked ?? roleByKey(guild, cfg.roleKey);
  if (role?.id === guild.id) role = null; // ไม่รับ @everyone
  // ฉายาที่ปกติแท็กไม่ได้ ต้องมีสิทธิ์ Mention Everyone ถึงจะสั่งแท็กผ่านบอทได้ (กันใช้บอทเลี่ยงสิทธิ์)
  if (picked && role && !role.mentionable && !i.memberPermissions.has(P.MentionEveryone)) {
    return i.editReply(`❌ ฉายา **${role.name}** ตั้งไว้ว่าแท็กไม่ได้ และคุณไม่มีสิทธิ์ Mention Everyone เลือกฉายาอื่นหรือไม่ต้องเลือกนะ`);
  }

  const base = {
    name: `${cfg.emoji} ${title}`.slice(0, 100),
    scheduledStartTime: start,
    privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
    description: detail ?? undefined,
    reason: `${cfg.label} โดย ${i.user.tag}`,
  };

  let ev;
  try {
    ev = vc
      ? await guild.scheduledEvents.create({ ...base, entityType: GuildScheduledEventEntityType.Voice, channel: vc })
      : await guild.scheduledEvents.create({
          ...base,
          entityType: GuildScheduledEventEntityType.External,
          entityMetadata: { location: guild.name },
          scheduledEndTime: new Date(start.getTime() + 3 * 3600e3),
        });
  } catch (err) {
    console.error('สร้างอีเวนต์ไม่สำเร็จ:', err);
    return i.editReply('❌ สร้างอีเวนต์ไม่ได้ ตรวจสอบว่าบอทมีสิทธิ์ **Manage Events** และ **Create Events**');
  }

  // ประกาศในช่องที่พิมพ์คำสั่ง พร้อมแท็กฉายา
  if (role && !role.mentionable && role.editable) await role.setMentionable(true).catch(() => {});

  const when = unix(start);
  const body = [
    `## ${cfg.emoji} ${cfg.label}: ${title}`,
    detail ?? '',
    `🕒 <t:${when}:F> (<t:${when}:R>)`,
    `📍 ${vc ? `<#${vc.id}>` : guild.name}`,
    role ? `\n<@&${role.id}>` : '',
  ]
    .filter((l) => l !== '')
    .join('\n');

  const card = new ContainerBuilder().setAccentColor(cfg.color).addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(text(body))
      .setButtonAccessory(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('กดสนใจ').setURL(ev.url)),
  );

  try {
    await i.channel.send({ components: [card], flags: V2, allowedMentions: { roles: role ? [role.id] : [] } });
  } catch (err) {
    console.error('ประกาศอีเวนต์ไม่สำเร็จ:', err.message);
    return i.editReply(`✅ สร้างอีเวนต์แล้ว (${ev.url}) แต่ส่งประกาศในช่องนี้ไม่ได้`);
  }
  return i.editReply('✅ สร้างอีเวนต์และประกาศเรียบร้อย');
}

// ---------- /vote (ใช้ระบบโหวตของ Discord เอง) ----------
async function voteCommand(i) {
  await i.deferReply(EPHEMERAL);
  const options = i.options
    .getString('options', true)
    .split(/[,|]/)
    .map((o) => o.trim())
    .filter(Boolean);

  if (options.length < 2 || options.length > 10) return i.editReply('❌ ต้องมีตัวเลือก 2-10 ข้อ คั่นด้วย `,` หรือ `|`');
  if (options.some((o) => o.length > 55)) return i.editReply('❌ ตัวเลือกยาวเกิน 55 ตัวอักษร');

  try {
    await i.channel.send({
      poll: {
        question: { text: i.options.getString('question', true) },
        answers: options.map((t) => ({ text: t })),
        duration: i.options.getInteger('hours') ?? 24,
        allowMultiselect: i.options.getBoolean('multi') ?? false,
      },
    });
  } catch (err) {
    console.error('สร้างโหวตไม่สำเร็จ:', err);
    return i.editReply('❌ สร้างโหวตไม่ได้ ตรวจสอบว่าบอทมีสิทธิ์ **Send Messages** และ **Send Polls** ในช่องนี้');
  }
  return i.editReply('✅ สร้างโหวตแล้ว');
}

// ---------- /lfg ----------
function lfgMessage(s) {
  const full = s.members.length >= s.max;
  const header = [
    `## 🎮 หาเพื่อนเล่น: ${s.game}`,
    `👑 โฮสต์: <@${s.host}>`,
    s.when ? `🕒 ${s.when}` : '',
    s.note ? `📝 ${s.note}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const status = s.closed ? '\n\n🔒 ปิดรับแล้ว' : full ? '\n\n✅ ครบแล้ว' : '';
  const roster = `**ผู้เล่น (${s.members.length}/${s.max})**\n${s.members.map((id, n) => `${n + 1}. <@${id}>`).join('\n')}${status}`;

  const card = new ContainerBuilder()
    .setAccentColor(s.closed ? 0x8d99ae : 0x00bbf9)
    .addTextDisplayComponents(text(header))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(roster));

  if (!s.closed) {
    card.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('lfg:join').setLabel('เข้าร่วม').setEmoji('🙋').setStyle(ButtonStyle.Success).setDisabled(full),
        new ButtonBuilder().setCustomId('lfg:leave').setLabel('ออก').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('lfg:close').setLabel('ปิดโพสต์').setEmoji('🔒').setStyle(ButtonStyle.Danger),
      ),
    );
  }
  return { components: [card], flags: V2, allowedMentions: { parse: [] } };
}

async function lfgCommand(i) {
  await i.deferReply(EPHEMERAL);
  const state = {
    game: i.options.getString('game', true),
    max: i.options.getInteger('players', true),
    when: i.options.getString('when'),
    note: i.options.getString('note'),
    host: i.user.id,
    members: [i.user.id],
    closed: false,
    createdAt: Date.now(),
  };

  try {
    const msg = await i.channel.send(lfgMessage(state));
    db.lfg[msg.id] = state;
    save();
  } catch (err) {
    console.error('โพสต์ LFG ไม่สำเร็จ:', err.message);
    return i.editReply('❌ ส่งโพสต์ในช่องนี้ไม่ได้ ตรวจสอบสิทธิ์ของบอท');
  }
  return i.editReply('✅ โพสต์หาเพื่อนเล่นแล้ว');
}

async function lfgButton(i) {
  const action = i.customId.split(':')[1];
  const s = db.lfg[i.message.id];
  if (!s) return i.reply({ content: '❌ โพสต์นี้หมดอายุแล้ว ลองสร้างใหม่ด้วย `/lfg`', ...EPHEMERAL });
  if (s.closed) return i.reply({ content: '🔒 โพสต์นี้ปิดรับแล้ว', ...EPHEMERAL });

  if (action === 'join') {
    if (s.members.includes(i.user.id)) return i.reply({ content: 'คุณอยู่ในรายชื่อแล้ว 🐾', ...EPHEMERAL });
    if (s.members.length >= s.max) return i.reply({ content: 'ครบจำนวนแล้ว 😿', ...EPHEMERAL });
    s.members.push(i.user.id);
  } else if (action === 'leave') {
    if (i.user.id === s.host) return i.reply({ content: 'คุณเป็นโฮสต์ ถ้าไม่เล่นแล้วให้กด **ปิดโพสต์** แทน', ...EPHEMERAL });
    if (!s.members.includes(i.user.id)) return i.reply({ content: 'คุณไม่ได้อยู่ในรายชื่อ', ...EPHEMERAL });
    s.members = s.members.filter((id) => id !== i.user.id);
  } else if (action === 'close') {
    if (i.user.id !== s.host && !i.memberPermissions.has(P.ManageMessages)) {
      return i.reply({ content: '❌ เฉพาะโฮสต์หรือสตาฟที่ปิดโพสต์ได้', ...EPHEMERAL });
    }
    s.closed = true;
  }
  save();
  return i.update(lfgMessage(s));
}

export const commandHandlers = { event: eventCommand, vote: voteCommand, lfg: lfgCommand };
export const componentHandlers = { lfg: lfgButton };

export function register(client) {
  // ลบโพสต์ LFG ที่เก่าเกิน 7 วันตอนเริ่มทำงาน
  const limit = Date.now() - 7 * 24 * 3600e3;
  for (const [id, s] of Object.entries(db.lfg)) if (s.createdAt < limit) delete db.lfg[id];
  save();
}
