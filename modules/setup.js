// /setup — ตั้งค่าบอทสำหรับเซิร์ฟนี้ (แอดมินเท่านั้น)
//   เซิร์ฟบ้านเรา: พิมพ์ /setup panel ครั้งเดียวจบ (ใช้ค่าจาก config.js และสร้างฉายาที่ยังไม่มีให้เอง)
//   เซิร์ฟอื่น:   ตั้งทีละขั้นด้วย /setup group add → /setup role add → /setup panel
import { ChannelType, PermissionFlagsBits as P, SlashCommandBuilder } from 'discord.js';
import { EXTRA_ROLES, GROUPS } from '../config.js';
import { db, save } from '../db.js';
import { EPHEMERAL } from '../util.js';
import {
  bannerOf,
  birthdayRoleOf,
  groupsOf,
  isDangerousRole,
  isHome,
  isHub,
  levelRolesOf,
  memberRoleOf,
  offsetOf,
  settingsOf,
  usingDefaultGroups,
} from '../settings.js';
import { MAX_COMPONENTS, buildPanel, countComponents } from './panel.js';

const STYLES = {
  buttons: 'แถวปุ่ม',
  select: 'เมนู dropdown (เลือกได้หลายอัน)',
  toggle: 'ปุ่มสลับรับ/ถอด (มีคำอธิบายใต้ชื่อ)',
};
const MAX_GROUPS = 5;
const MAX_LEVEL_ROLES = 25;
const ROLE_LIMIT = { buttons: 10, select: 25, toggle: 8 };
const EMOJI =
  /^(?:<a?:\w{2,32}:\d{17,20}>|[0-9#*]\uFE0F?\u20E3|\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|\p{Emoji_Modifier})*)$/u;

export const commands = [
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('ตั้งค่าบอทสำหรับเซิร์ฟนี้ (แอดมินเท่านั้น)')
    .setDefaultMemberPermissions(P.Administrator)
    .setDMPermission(false)
    .addSubcommand((s) => s.setName('panel').setDescription('ส่งแผงกดรับฉายาในช่องนี้'))
    .addSubcommand((s) => s.setName('show').setDescription('ดูการตั้งค่าทั้งหมดของเซิร์ฟนี้ และขั้นตอนที่เหลือ'))
    .addSubcommandGroup((g) =>
      g
        .setName('group')
        .setDescription('จัดการหมวดฉายาในแผง')
        .addSubcommand((s) =>
          s
            .setName('add')
            .setDescription('สร้างหมวดฉายาใหม่ เช่น "เพศ" "ความสนใจ"')
            .addStringOption((o) => o.setName('key').setDescription('รหัสหมวด (a-z 0-9 _ -) เช่น gender').setRequired(true).setMaxLength(20))
            .addStringOption((o) => o.setName('title').setDescription('หัวข้อที่โชว์ในแผง เช่น 🎯 เลือกความสนใจ').setRequired(true).setMaxLength(80))
            .addStringOption((o) =>
              o
                .setName('style')
                .setDescription('รูปแบบการกดรับ')
                .setRequired(true)
                .addChoices(...Object.entries(STYLES).map(([value, name]) => ({ name, value }))),
            )
            .addBooleanOption((o) => o.setName('exclusive').setDescription('เลือกได้ทีละอัน? (ใช้กับปุ่ม/สลับ) ค่าเริ่มต้น ไม่'))
            .addStringOption((o) => o.setName('description').setDescription('คำอธิบายใต้หัวข้อ').setMaxLength(150)),
        )
        .addSubcommand((s) =>
          s
            .setName('remove')
            .setDescription('ลบหมวดฉายา (ไม่ได้ลบฉายาในเซิร์ฟ)')
            .addStringOption((o) => o.setName('group').setDescription('หมวดที่จะลบ').setRequired(true).setAutocomplete(true)),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName('role')
        .setDescription('จัดการฉายาในแผง (ต้องมีฉายาอยู่ในเซิร์ฟแล้ว)')
        .addSubcommand((s) =>
          s
            .setName('add')
            .setDescription('ใส่ฉายาที่มีอยู่แล้วเข้าหมวด')
            .addStringOption((o) => o.setName('group').setDescription('หมวด').setRequired(true).setAutocomplete(true))
            .addRoleOption((o) => o.setName('role').setDescription('ฉายาที่ให้คนกดรับ').setRequired(true))
            .addStringOption((o) => o.setName('label').setDescription('ชื่อบนปุ่ม (ไม่ใส่ = ใช้ชื่อฉายา)').setMaxLength(80))
            .addStringOption((o) => o.setName('emoji').setDescription('อีโมจิบนปุ่ม (ไม่ใส่ก็ได้)').setMaxLength(60))
            .addStringOption((o) => o.setName('desc').setDescription('คำอธิบายสั้นๆ (แสดงเฉพาะแบบปุ่มสลับ)').setMaxLength(100)),
        )
        .addSubcommand((s) =>
          s
            .setName('remove')
            .setDescription('เอาฉายาออกจากแผง (ไม่ได้ลบฉายาในเซิร์ฟ)')
            .addRoleOption((o) => o.setName('role').setDescription('ฉายาที่จะเอาออก').setRequired(true)),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('hub')
        .setDescription('ตั้งห้องเสียงที่ใครเข้าแล้วบอทสร้างห้องส่วนตัวให้ (ไม่เลือก = ปิดระบบ)')
        .addChannelOption((o) => o.setName('channel').setDescription('ห้องเสียงสำหรับสร้างห้อง').addChannelTypes(ChannelType.GuildVoice)),
    )
    .addSubcommand((s) =>
      s
        .setName('memberrole')
        .setDescription('ฉายาที่แจกอัตโนมัติให้คนเข้าเซิร์ฟใหม่ (ไม่เลือก = ปิด)')
        .addRoleOption((o) => o.setName('role').setDescription('ฉายาสมาชิก')),
    )
    .addSubcommand((s) =>
      s
        .setName('birthdayrole')
        .setDescription('ฉายาที่แจกในวันเกิดสมาชิก (ไม่เลือก = ไม่แจกฉายา)')
        .addRoleOption((o) => o.setName('role').setDescription('ฉายาวันเกิด')),
    )
    .addSubcommandGroup((g) =>
      g
        .setName('levelrole')
        .setDescription('ฉายาที่ได้ตามเลเวล')
        .addSubcommand((s) =>
          s
            .setName('add')
            .setDescription('ตั้งฉายาที่จะได้เมื่อถึงเลเวลที่กำหนด (ตั้งเลเวลเดิมซ้ำ = เปลี่ยนฉายา)')
            .addIntegerOption((o) => o.setName('level').setDescription('เลเวลที่เริ่มได้ฉายา').setRequired(true).setMinValue(0).setMaxValue(1000))
            .addRoleOption((o) => o.setName('role').setDescription('ฉายา').setRequired(true)),
        )
        .addSubcommand((s) =>
          s
            .setName('remove')
            .setDescription('เอาฉายาของเลเวลนี้ออก')
            .addIntegerOption((o) => o.setName('level').setDescription('เลเวล').setRequired(true).setMinValue(0).setMaxValue(1000)),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('timezone')
        .setDescription('ตั้งเขตเวลาของเซิร์ฟ (ใช้กับวันเกิดและเวลานัดกิจกรรม)')
        .addNumberOption((o) => o.setName('utc').setDescription('ชั่วโมงจาก UTC เช่น ไทย = 7, ญี่ปุ่น = 9, UK = 0').setRequired(true).setMinValue(-12).setMaxValue(14)),
    )
    .addSubcommand((s) =>
      s
        .setName('banner')
        .setDescription('ตั้งรูปแบนเนอร์บนแผงรับฉายา (ไม่ใส่ลิงก์ = เอาออก)')
        .addStringOption((o) => o.setName('url').setDescription('ลิงก์รูป https://...').setMaxLength(500)),
    )
    .addSubcommand((s) => s.setName('reset').setDescription('ล้างค่าที่ตั้งไว้ทั้งหมดของเซิร์ฟนี้ (ช่อง /log และข้อมูล XP/วันเกิดไม่ถูกลบ)')),
];

const say = (i, content) => i.reply({ content, ...EPHEMERAL, allowedMentions: { parse: [] } });

const STEPS = [
  '**ตั้งค่าทีละขั้น**',
  '1️⃣ สร้างฉายาใน *Server Settings → Roles* ให้ครบก่อน (บอทไม่สร้างฉายาให้เซิร์ฟอื่น)',
  '2️⃣ `/setup group add` สร้างหมวด เช่น เพศ, ความสนใจ',
  '3️⃣ `/setup role add` ใส่ฉายาที่สร้างไว้เข้าหมวด (ทำซ้ำทีละฉายา)',
  '4️⃣ ลากฉายา **บอท** ให้อยู่เหนือฉายาที่จะแจก (ไม่งั้นบอทแจกไม่ได้)',
  '5️⃣ ไปที่ช่องที่อยากวางแผง แล้วพิมพ์ `/setup panel`',
  '',
  '**ตัวเลือกเสริม:** `/setup hub` ห้องสร้างห้องส่วนตัว • `/setup memberrole` ฉายาสมาชิกใหม่ • `/setup birthdayrole` • `/setup levelrole add` • `/setup timezone` • `/log set` ช่องแจ้งเตือนต่างๆ',
].join('\n');

// ---------- /setup panel ----------
// เซิร์ฟบ้านเรา + ยังใช้ค่าเริ่มต้น → สร้างฉายาที่ยังไม่มีให้ก่อน (แทน /setup roles เดิม)
async function ensureDefaultRoles(guild) {
  await guild.roles.fetch();
  const all = [
    ...GROUPS.flatMap((g) => g.roles.map((r) => ({ name: r.name, color: r.color, hoist: false }))),
    ...EXTRA_ROLES,
  ];
  let created = 0;
  for (const def of all) {
    if (guild.roles.cache.some((r) => r.name === def.name)) continue;
    await guild.roles.create({ name: def.name, color: def.color, hoist: def.hoist, mentionable: false, reason: 'บอท: /setup panel' });
    created++;
  }
  return created;
}

async function panelCommand(i) {
  const { guild } = i;
  if (!groupsOf(guild).length) return say(i, `ยังไม่มีหมวดฉายาในแผงเลย\n\n${STEPS}`);

  const me = guild.members.me;
  if (!i.channel?.permissionsFor(me)?.has([P.ViewChannel, P.SendMessages])) {
    return say(i, '❌ บอทไม่มีสิทธิ์ส่งข้อความในช่องนี้ ให้สิทธิ์ View Channel และ Send Messages ก่อนนะ');
  }

  await i.deferReply(EPHEMERAL);
  const notes = [];

  if (isHome(guild.id) && usingDefaultGroups(guild)) {
    try {
      const created = await ensureDefaultRoles(guild);
      if (created) notes.push(`สร้างฉายาใหม่ให้ ${created} ฉายา (ฉายาสตาฟ/พิเศษไม่มีสิทธิ์อะไรเลย ไปตั้งเองใน Server Settings)`);
    } catch (err) {
      console.error('สร้างฉายาไม่สำเร็จ:', err.message);
      notes.push('สร้างฉายาที่ยังไม่มีไม่สำเร็จ (บอทต้องมีสิทธิ์ Manage Roles)');
    }
  }
  await guild.roles.fetch();

  const { payload, missing, groups } = buildPanel(guild);
  if (!groups.length) return i.editReply('❌ ไม่มีฉายาที่ใช้งานได้ในแผงเลย (ฉายาอาจถูกลบไปหมด) ลองใส่ใหม่ด้วย `/setup role add`');
  if (countComponents(groups) > MAX_COMPONENTS) {
    return i.editReply('❌ แผงใหญ่เกินที่ Discord ให้ส่งได้ในข้อความเดียว ลองลดฉายา หรือเปลี่ยนบางหมวดเป็นแบบ dropdown');
  }

  try {
    await i.channel.send(payload);
  } catch (err) {
    console.error('ส่งแผงไม่สำเร็จ:', err.message);
    return i.editReply('❌ ส่งแผงในช่องนี้ไม่ได้ ตรวจสอบสิทธิ์ของบอทในช่องนี้');
  }
  settingsOf(guild.id).panelChannelId = i.channel.id;
  save();

  const guildRoles = groups.flatMap((g) => g.roles.map((r) => guild.roles.cache.get(r.roleId) ?? guild.roles.cache.find((x) => x.name === r.name)));
  const stuck = guildRoles.filter((r) => r && !r.editable).map((r) => r.name);
  const risky = guildRoles.filter((r) => r && isDangerousRole(r)).map((r) => r.name);
  if (stuck.length) notes.push(`บอทยังแจกฉายาเหล่านี้ไม่ได้ ให้ลากฉายาบอทขึ้นไปไว้เหนือฉายา: ${stuck.join(', ')}`);
  if (risky.length) notes.push(`ฉายาเหล่านี้มีสิทธิ์สูง บอทจะไม่ยอมแจกให้คนกดรับเอง: ${risky.join(', ')}`);
  if (missing.length) notes.push(`ข้ามฉายาที่ถูกลบไปแล้ว: ${missing.join(', ')}`);

  return i.editReply(`✅ ส่งแผงกดรับฉายาเรียบร้อย!${notes.length ? `\n\n📝 หมายเหตุ:\n${notes.map((n) => `• ${n}`).join('\n')}` : ''}`);
}

// ---------- /setup group ----------
function groupAdd(i) {
  const key = i.options.getString('key', true).toLowerCase();
  const title = i.options.getString('title', true).trim();
  const ui = i.options.getString('style', true);
  const description = i.options.getString('description')?.trim() ?? '';
  const exclusive = ui === 'select' ? false : i.options.getBoolean('exclusive') ?? false;

  if (!/^[a-z0-9_-]{2,20}$/.test(key)) return say(i, '❌ รหัสหมวดใช้ได้เฉพาะ a-z, 0-9, `_`, `-` ยาว 2-20 ตัว เช่น `gender`');
  const s = settingsOf(i.guild.id);
  const groups = (s.groups ??= []);
  if (groups.length >= MAX_GROUPS) return say(i, `❌ มีหมวดได้สูงสุด ${MAX_GROUPS} หมวด`);
  if (groups.some((g) => g.id === key)) return say(i, `❌ มีหมวด \`${key}\` อยู่แล้ว`);

  groups.push({ id: key, title, description, ui, exclusive, roles: [] });
  save();
  const home = isHome(i.guild.id) && groups.length === 1 ? '\n⚠️ ตั้งแผงเองแล้ว ต่อจากนี้จะไม่ใช้แผงเริ่มต้นจาก config.js (กลับไปใช้ได้ด้วย `/setup reset`)' : '';
  return say(i, `✅ สร้างหมวด **${title}** แล้ว (${STYLES[ui]}${exclusive ? ' • เลือกได้ทีละอัน' : ''})\nต่อไปใส่ฉายาด้วย \`/setup role add\`${home}`);
}

function groupRemove(i) {
  const key = i.options.getString('group', true);
  const groups = db.settings[i.guild.id]?.groups ?? [];
  const idx = groups.findIndex((g) => g.id === key);
  if (idx < 0) return say(i, '❌ ไม่พบหมวดนี้ (เลือกจากรายการที่ขึ้นมาให้)');
  const [gone] = groups.splice(idx, 1);
  save();
  return say(i, `🗑️ ลบหมวด **${gone.title}** แล้ว (ฉายาในเซิร์ฟยังอยู่) • แผงที่ส่งไปแล้วต้องส่งใหม่ด้วย \`/setup panel\``);
}

// ---------- /setup role ----------
function checkPickable(role, guild) {
  if (role.id === guild.id) return '❌ ใช้ @everyone ไม่ได้';
  if (role.managed) return '❌ ฉายานี้ผูกกับบอทหรือระบบอื่น แจกให้คนไม่ได้';
  if (isDangerousRole(role)) return `❌ ฉายา **${role.name}** มีสิทธิ์สูง (เช่น จัดการเซิร์ฟ/แบน/จัดการฉายา) ไม่ควรให้คนกดรับเอง`;
  return null;
}

function roleAdd(i) {
  const { guild } = i;
  const groups = db.settings[guild.id]?.groups ?? [];
  const group = groups.find((g) => g.id === i.options.getString('group', true));
  if (!group) return say(i, '❌ ไม่พบหมวดนี้ สร้างก่อนด้วย `/setup group add` (แล้วเลือกจากรายการที่ขึ้นมาให้)');

  const role = i.options.getRole('role', true);
  const bad = checkPickable(role, guild);
  if (bad) return say(i, bad);
  if (groups.some((g) => g.roles.some((r) => r.roleId === role.id))) return say(i, `❌ ฉายา **${role.name}** อยู่ในแผงแล้ว`);
  if (group.roles.length >= ROLE_LIMIT[group.ui]) return say(i, `❌ หมวดแบบ${STYLES[group.ui]}ใส่ได้สูงสุด ${ROLE_LIMIT[group.ui]} ฉายา`);

  const emoji = i.options.getString('emoji')?.trim() || null;
  if (emoji && !EMOJI.test(emoji)) return say(i, '❌ อีโมจิไม่ถูกต้อง ใส่อีโมจิปกติ 1 ตัว หรืออีโมจิเซิร์ฟแบบ `<:ชื่อ:ไอดี>`');

  const entry = {
    key: role.id,
    roleId: role.id,
    label: (i.options.getString('label')?.trim() || role.name).slice(0, 80),
    emoji,
    desc: i.options.getString('desc')?.trim() || '',
  };
  group.roles.push(entry);
  if (countComponents(groups) > MAX_COMPONENTS) {
    group.roles.pop();
    return say(i, '❌ แผงเต็มแล้ว Discord ให้ส่งได้ไม่เกิน 40 ชิ้นส่วนต่อข้อความ ลองใช้แบบ dropdown ที่ประหยัดที่สุด หรือลดฉายา');
  }
  save();
  const warn = role.editable ? '' : '\n⚠️ ฉายานี้สูงกว่าฉายาบอท ให้ลากฉายาบอทขึ้นไปไว้เหนือฉายานี้ ไม่งั้นแจกไม่ได้';
  return say(i, `✅ เพิ่ม **${role.name}** เข้าหมวด **${group.title}** แล้ว (${group.roles.length} ฉายา)\nพร้อมแล้วใช้ \`/setup panel\` ส่งแผง (ถ้าเคยส่งแล้วให้ส่งใหม่)${warn}`);
}

function roleRemove(i) {
  const role = i.options.getRole('role', true);
  for (const g of db.settings[i.guild.id]?.groups ?? []) {
    const idx = g.roles.findIndex((r) => r.roleId === role.id);
    if (idx >= 0) {
      g.roles.splice(idx, 1);
      save();
      return say(i, `🗑️ เอา **${role.name}** ออกจากหมวด **${g.title}** แล้ว (ฉายาในเซิร์ฟยังอยู่)`);
    }
  }
  return say(i, '❌ ฉายานี้ไม่ได้อยู่ในแผงที่ตั้งเอง');
}

// ---------- ฉายาเดี่ยวๆ / ช่อง / อื่นๆ ----------
function simpleRoleSetting(field, label) {
  return (i) => {
    const role = i.options.getRole('role');
    const s = settingsOf(i.guild.id);
    if (!role) {
      delete s[field];
      save();
      return say(i, `🔕 ปิด **${label}** แล้ว${isHome(i.guild.id) ? ' (เซิร์ฟหลักจะกลับไปใช้ค่าเริ่มต้นจาก config.js)' : ''}`);
    }
    const bad = checkPickable(role, i.guild);
    if (bad) return say(i, bad);
    s[field] = role.id;
    save();
    return say(i, `✅ ตั้ง **${label}** เป็น **${role.name}** แล้ว${role.editable ? '' : '\n⚠️ ฉายานี้สูงกว่าฉายาบอท บอทจะแจกไม่ได้จนกว่าจะลากฉายาบอทขึ้นไปไว้เหนือฉายานี้'}`);
  };
}

function hubCommand(i) {
  const ch = i.options.getChannel('channel');
  const s = settingsOf(i.guild.id);
  if (!ch) {
    delete s.hubId;
    save();
    return say(i, '🔕 ปิดระบบห้องส่วนตัวแล้ว');
  }
  s.hubId = ch.id;
  save();
  const perms = ch.permissionsFor(i.guild.members.me);
  const missing = [
    [P.ManageChannels, 'Manage Channels'],
    [P.MoveMembers, 'Move Members'],
  ].filter(([f]) => !perms?.has(f)).map(([, n]) => n);
  return say(i, `✅ ใครเข้า <#${ch.id}> บอทจะสร้างห้องส่วนตัวให้ (ห้องจะอยู่หมวดเดียวกัน)${missing.length ? `\n⚠️ บอทยังขาดสิทธิ์: ${missing.join(', ')}` : ''}`);
}

function levelRoleAdd(i) {
  const level = i.options.getInteger('level', true);
  const role = i.options.getRole('role', true);
  const bad = checkPickable(role, i.guild);
  if (bad) return say(i, bad);

  const s = settingsOf(i.guild.id);
  const list = (s.levelRoles ??= []);
  const existing = list.findIndex((r) => r.level === level);
  if (existing < 0 && list.length >= MAX_LEVEL_ROLES) return say(i, `❌ ตั้งฉายาเลเวลได้สูงสุด ${MAX_LEVEL_ROLES} ระดับ`);
  const entry = { level, roleId: role.id };
  if (existing >= 0) list[existing] = entry;
  else list.push(entry);
  save();
  const home = isHome(i.guild.id) && list.length === 1 ? '\n⚠️ ตั้งเองแล้ว ต่อจากนี้จะไม่ใช้ฉายาเลเวลเริ่มต้นจาก config.js (กลับไปใช้ได้ด้วย `/setup reset`)' : '';
  return say(i, `✅ ถึงเลเวล **${level}** จะได้ฉายา **${role.name}**${role.editable ? '' : '\n⚠️ ฉายานี้สูงกว่าฉายาบอท ให้ลากฉายาบอทขึ้นไปไว้เหนือฉายานี้'}${home}`);
}

function levelRoleRemove(i) {
  const level = i.options.getInteger('level', true);
  const list = db.settings[i.guild.id]?.levelRoles ?? [];
  const idx = list.findIndex((r) => r.level === level);
  if (idx < 0) return say(i, `❌ ไม่มีฉายาที่ตั้งไว้ที่เลเวล ${level}`);
  list.splice(idx, 1);
  save();
  return say(i, `🗑️ เอาฉายาของเลเวล ${level} ออกแล้ว`);
}

function timezoneCommand(i) {
  const utc = i.options.getNumber('utc', true);
  settingsOf(i.guild.id).utcOffset = utc;
  save();
  const now = new Date(Date.now() + utc * 3600e3);
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mm = String(now.getUTCMinutes()).padStart(2, '0');
  return say(i, `✅ ตั้งเขตเวลาเป็น **UTC${utc >= 0 ? '+' : ''}${utc}** แล้ว (ตอนนี้ที่เซิร์ฟคือ ${hh}:${mm})`);
}

function bannerCommand(i) {
  const url = i.options.getString('url')?.trim();
  const s = settingsOf(i.guild.id);
  if (!url) {
    delete s.bannerUrl;
    save();
    return say(i, '🗑️ เอาแบนเนอร์ออกแล้ว (ส่งแผงใหม่ด้วย `/setup panel` เพื่อให้เห็นผล)');
  }
  if (!/^https:\/\/\S+$/.test(url)) return say(i, '❌ ต้องเป็นลิงก์รูปที่ขึ้นต้นด้วย https://');
  s.bannerUrl = url;
  save();
  return say(i, '✅ ตั้งแบนเนอร์แล้ว ส่งแผงใหม่ด้วย `/setup panel` เพื่อให้เห็นผล\n-# ลิงก์รูปจาก Discord (cdn.discordapp.com / media.discordapp.net) มีวันหมดอายุ ถ้าจะใช้นานๆ ให้อัปโหลดไว้ที่อื่น');
}

function resetCommand(i) {
  delete db.settings[i.guild.id];
  save();
  return say(i, `🧹 ล้างค่าที่ตั้งไว้ทั้งหมดแล้ว${isHome(i.guild.id) ? ' (เซิร์ฟหลักกลับไปใช้ค่าเริ่มต้นจาก config.js)' : ''}`);
}

// ---------- /setup show ----------
const roleText = (guild, def) => {
  const r = def.roleId ? guild.roles.cache.get(def.roleId) : guild.roles.cache.find((x) => x.name === def.name);
  return r ? `<@&${r.id}>` : `~~${def.label ?? def.name ?? 'ฉายาที่ถูกลบ'}~~`;
};

function showCommand(i) {
  const { guild } = i;
  const s = db.settings[guild.id] ?? {};
  const lines = [`## ⚙️ การตั้งค่าของ ${guild.name}`];

  const groups = groupsOf(guild);
  if (groups.length) {
    lines.push(`**🎭 แผงรับฉายา** ${usingDefaultGroups(guild) ? '_(ค่าเริ่มต้นจาก config.js)_' : ''}`);
    for (const g of groups) {
      const shown = g.roles.slice(0, 8).map((r) => roleText(guild, r));
      lines.push(`• ${g.title} — ${STYLES[g.ui]}\n  ${shown.join(' ') || '_ยังไม่มีฉายา_'}${g.roles.length > 8 ? ` +${g.roles.length - 8}` : ''}`);
    }
  } else {
    lines.push('**🎭 แผงรับฉายา:** _ยังไม่ได้ตั้ง_');
  }

  const hubCh = s.hubId ? guild.channels.cache.get(s.hubId) : guild.channels.cache.find((c) => isHub(c));
  lines.push(`**🔊 ห้องสร้างห้องส่วนตัว:** ${hubCh ? `<#${hubCh.id}>` : '_ปิดอยู่_'}`);
  const mr = memberRoleOf(guild);
  lines.push(`**🐾 ฉายาสมาชิกใหม่:** ${mr ? `<@&${mr.id}>` : '_ไม่ได้ตั้ง_'}`);
  const br = birthdayRoleOf(guild);
  lines.push(`**🎂 ฉายาวันเกิด:** ${br ? `<@&${br.id}>` : '_ไม่ได้ตั้ง (ยังประกาศวันเกิดได้ถ้าตั้งช่องด้วย /log set)_'}`);
  const lv = levelRolesOf(guild);
  lines.push(`**🏅 ฉายาเลเวล:** ${lv.length ? lv.map((r) => `Lv${r.level} ${r.role ? `<@&${r.role.id}>` : `~~${r.name}~~`}`).join(' • ').slice(0, 600) : '_ไม่ได้ตั้ง (เลเวลยังนับ XP ปกติ)_'}`);
  const off = offsetOf(guild.id);
  lines.push(`**🕒 เขตเวลา:** UTC${off >= 0 ? '+' : ''}${off}`);
  lines.push(`**🖼️ แบนเนอร์:** ${bannerOf(guild.id) ? 'มี' : 'ไม่มี'}`);
  lines.push('**📢 ช่องแจ้งเตือน:** ดูด้วย `/log list`');

  if (!isHome(guild.id) && !groups.length) lines.push('', STEPS);
  return say(i, lines.join('\n').slice(0, 1990));
}

// ---------- ตัวแจกคำสั่ง ----------
const sub = {
  panel: panelCommand,
  show: showCommand,
  'group add': groupAdd,
  'group remove': groupRemove,
  'role add': roleAdd,
  'role remove': roleRemove,
  hub: hubCommand,
  memberrole: simpleRoleSetting('memberRoleId', 'ฉายาสมาชิกใหม่'),
  birthdayrole: simpleRoleSetting('birthdayRoleId', 'ฉายาวันเกิด'),
  'levelrole add': levelRoleAdd,
  'levelrole remove': levelRoleRemove,
  timezone: timezoneCommand,
  banner: bannerCommand,
  reset: resetCommand,
};

async function setupCommand(i) {
  const g = i.options.getSubcommandGroup(false);
  const name = g ? `${g} ${i.options.getSubcommand()}` : i.options.getSubcommand();
  return sub[name](i);
}

async function setupAutocomplete(i) {
  const focused = i.options.getFocused(true);
  if (focused.name !== 'group') return i.respond([]);
  const q = focused.value.toLowerCase();
  const groups = db.settings[i.guild.id]?.groups ?? [];
  return i.respond(
    groups
      .filter((g) => g.id.includes(q) || g.title.toLowerCase().includes(q))
      .slice(0, 25)
      .map((g) => ({ name: `${g.title} (${g.id})`.slice(0, 100), value: g.id })),
  );
}

export const commandHandlers = { setup: setupCommand };
export const autocompleteHandlers = { setup: setupAutocomplete };
