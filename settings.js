// ค่าตั้งของแต่ละเซิร์ฟ (ทำให้บอทใช้ได้หลายเซิร์ฟ)
//  - เซิร์ฟ "บ้านเรา" = เซิร์ฟที่ GUILD_ID ใน .env ตรงกัน → ถ้ายังไม่ได้ตั้งอะไร จะใช้ค่าเริ่มต้นใน config.js
//  - เซิร์ฟอื่น → ไม่มีค่าเริ่มต้น ต้องตั้งเองด้วย /setup (เก็บใน db.settings[guildId])
import { PermissionFlagsBits as P } from 'discord.js';
import { BANNER_URL, BIRTHDAY_ROLE, GROUPS, HUB_NAME, LEVEL_ROLES, MEMBER_ROLE, UTC_OFFSET_HOURS } from './config.js';
import { db } from './db.js';

export const isHome = (guildId) => Boolean(process.env.GUILD_ID) && guildId === process.env.GUILD_ID;

// สำหรับ "เขียน" ค่า (สร้างให้ถ้ายังไม่มี) | สำหรับอ่านใช้ db.settings[guildId]?.xxx
export const settingsOf = (guildId) => (db.settings[guildId] ??= {});

// ---------- ฉายา ----------
// def หนึ่งตัวคือ { roleId } (ตั้งเอง) หรือ { name } (ค่าเริ่มต้นใน config.js ที่หาจากชื่อ)
export function resolveRole(guild, def) {
  if (!def) return null;
  if (def.roleId) return guild.roles.cache.get(def.roleId) ?? null;
  return guild.roles.cache.find((r) => r.name === def.name) ?? null;
}

// หมวดฉายาของแผงกดรับฉายา: ตั้งเองถ้ามี ไม่งั้นใช้ค่าเริ่มต้น (เฉพาะเซิร์ฟบ้านเรา)
export function groupsOf(guild) {
  const custom = db.settings[guild.id]?.groups;
  if (custom?.length) return custom;
  return isHome(guild.id) ? GROUPS : [];
}
export const usingDefaultGroups = (guild) => !db.settings[guild.id]?.groups?.length;

export function findRoleDef(guild, key) {
  for (const group of groupsOf(guild)) {
    const role = group.roles.find((r) => r.key === key);
    if (role) return { group, role };
  }
  return null;
}

export function roleByKey(guild, key) {
  const found = findRoleDef(guild, key);
  return found ? resolveRole(guild, found.role) : null;
}

export function memberRoleOf(guild) {
  const id = db.settings[guild.id]?.memberRoleId;
  if (id) return guild.roles.cache.get(id) ?? null;
  return isHome(guild.id) ? resolveRole(guild, { name: MEMBER_ROLE }) : null;
}

export function birthdayRoleOf(guild) {
  const id = db.settings[guild.id]?.birthdayRoleId;
  if (id) return guild.roles.cache.get(id) ?? null;
  return isHome(guild.id) ? resolveRole(guild, { name: BIRTHDAY_ROLE }) : null;
}

// ฉายาตามเลเวล เรียงจากน้อยไปมาก: [{ level, role (อาจเป็น null ถ้าฉายาถูกลบ), name }]
export function levelRolesOf(guild) {
  const custom = db.settings[guild.id]?.levelRoles;
  const defs = custom?.length ? custom : isHome(guild.id) ? LEVEL_ROLES : [];
  return defs
    .map((d) => {
      const role = resolveRole(guild, d);
      return { level: d.level, role, name: role?.name ?? d.name ?? '(ฉายาถูกลบ)' };
    })
    .sort((a, b) => a.level - b.level);
}

// ---------- ห้องเสียงส่วนตัว ----------
export function isHub(channel) {
  if (!channel?.guild) return false;
  const hubId = db.settings[channel.guild.id]?.hubId;
  if (hubId) return channel.id === hubId;
  return isHome(channel.guild.id) && channel.name === HUB_NAME;
}

// ---------- อื่นๆ ----------
export const offsetOf = (guildId) => db.settings[guildId]?.utcOffset ?? UTC_OFFSET_HOURS;

export const bannerOf = (guildId) => db.settings[guildId]?.bannerUrl ?? (isHome(guildId) ? BANNER_URL : '');

// ฉายาที่มีสิทธิ์สูง ห้ามเอาไปให้คนกดรับเอง (กันตั้งพลาดแล้วใครก็กดเป็นแอดมินได้)
const DANGEROUS = [
  P.Administrator, P.ManageGuild, P.ManageRoles, P.ManageChannels, P.ManageWebhooks, P.ManageMessages,
  P.ManageNicknames, P.ManageEvents, P.KickMembers, P.BanMembers, P.ModerateMembers, P.MentionEveryone,
  P.ViewAuditLog, P.MoveMembers, P.MuteMembers, P.DeafenMembers,
];
export const isDangerousRole = (role) => role.permissions.any(DANGEROUS);
