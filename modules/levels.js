// ระบบเลเวล: ได้ XP จากการพิมพ์ (มีคูลดาวน์) + ฉายาตามเลเวล + /rank + /leaderboard
import {
  ContainerBuilder,
  Events,
  SectionBuilder,
  SlashCommandBuilder,
  ThumbnailBuilder,
} from 'discord.js';
import { XP } from '../config.js';
import { db, save } from '../db.js';
import { levelRolesOf } from '../settings.js';
import { EPHEMERAL, V2, divider, displayNameOf, getLogChannel, rand, text } from '../util.js';

export const commands = [
  new SlashCommandBuilder()
    .setName('rank')
    .setDescription('ดูเลเวลและ XP ของคุณ (หรือของคนอื่น)')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('คนที่อยากดู (ไม่ใส่ = ตัวเอง)')),
  new SlashCommandBuilder().setName('leaderboard').setDescription('อันดับเลเวลสูงสุดของเซิร์ฟ').setDMPermission(false),
];

// XP ที่ต้องใช้เพื่อขึ้นจากเลเวล lvl ไป lvl+1
const xpToNext = (lvl) => 5 * lvl * lvl + 50 * lvl + 100;

export function levelFromXp(total) {
  let level = 0;
  let rest = total;
  while (rest >= xpToNext(level)) {
    rest -= xpToNext(level);
    level++;
  }
  return { level, current: rest, needed: xpToNext(level) };
}

const cooldowns = new Map(); // "guildId:userId" -> timestamp

async function syncLevelRole(member, level) {
  const list = levelRolesOf(member.guild).filter((r) => r.role); // ข้ามฉายาที่ถูกลบไปแล้ว
  const eligible = list.filter((r) => r.level <= level).at(-1);
  if (!eligible) return null;

  const target = eligible.role;
  if (!target.editable) return null;

  const others = list
    .map((r) => r.role)
    .filter((r) => r.id !== target.id && r.editable && member.roles.cache.has(r.id));

  let gained = null;
  if (!member.roles.cache.has(target.id)) {
    await member.roles.add(target);
    gained = target.name;
  }
  if (others.length) await member.roles.remove(others);
  return gained;
}

async function onMessage(m) {
  if (!m.guild || m.author.bot || m.system) return;

  const key = `${m.guild.id}:${m.author.id}`;
  const now = Date.now();
  if (now - (cooldowns.get(key) ?? 0) < XP.cooldownMs) return;
  cooldowns.set(key, now);

  const users = (db.xp[m.guild.id] ??= {});
  const user = (users[m.author.id] ??= { xp: 0 });
  const before = levelFromXp(user.xp).level;
  user.xp += XP.min + rand(XP.max - XP.min + 1);
  const after = levelFromXp(user.xp).level;
  save();

  if (after <= before) return;

  try {
    const member = m.member ?? (await m.guild.members.fetch(m.author.id).catch(() => null));
    const gained = member ? await syncLevelRole(member, after) : null;
    const channel = (await getLogChannel(m.guild, 'levelup')) ?? m.channel;
    await channel.send({
      content: `🎉 <@${m.author.id}> เลเวลอัปเป็น **${after}** แล้ว!${gained ? `\n🏅 ได้รับฉายา **${gained}**` : ''}`,
      allowedMentions: { users: [m.author.id] },
    });
  } catch (err) {
    console.error('ประกาศเลเวลอัปไม่สำเร็จ:', err.message);
  }
}

const bar = (cur, need) => {
  const filled = Math.min(10, Math.round((cur / need) * 10));
  return '▰'.repeat(filled) + '▱'.repeat(10 - filled);
};

async function rankCommand(i) {
  const target = i.options.getUser('user') ?? i.user;
  if (target.bot) return i.reply({ content: '🤖 บอทไม่มีเลเวลนะ', ...EPHEMERAL });

  const users = db.xp[i.guild.id] ?? {};
  const total = users[target.id]?.xp ?? 0;
  const { level, current, needed } = levelFromXp(total);
  const position = Object.entries(users).sort((a, b) => b[1].xp - a[1].xp).findIndex(([id]) => id === target.id) + 1;
  const next = levelRolesOf(i.guild).find((r) => r.level > level);
  const member = i.options.getMember('user') ?? i.member;

  const info = [
    `## ${displayNameOf(target, member)}`,
    `**เลเวล ${level}**${position ? ` • อันดับ #${position}` : ''}`,
    `${bar(current, needed)} ${current}/${needed} XP`,
    `-# XP รวม ${total.toLocaleString('en-US')}${next ? ` • ฉายาถัดไป ${next.name} ที่เลเวล ${next.level}` : ''}`,
  ].join('\n');

  const card = new ContainerBuilder().setAccentColor(0x9b5de5).addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(text(info))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(target.displayAvatarURL({ size: 128 }))),
  );
  return i.reply({ components: [card], flags: V2, allowedMentions: { parse: [] } });
}

async function leaderboardCommand(i) {
  const top = Object.entries(db.xp[i.guild.id] ?? {})
    .sort((a, b) => b[1].xp - a[1].xp)
    .slice(0, 10);

  const medals = ['🥇', '🥈', '🥉'];
  const lines = top.length
    ? top.map(([id, u], n) => `${medals[n] ?? `**${n + 1}.**`} <@${id}> • เลเวล ${levelFromXp(u.xp).level} (${u.xp.toLocaleString('en-US')} XP)`)
    : ['ยังไม่มีใครได้ XP เลย ลองพิมพ์คุยกันดูสิ 🐾'];

  const card = new ContainerBuilder()
    .setAccentColor(0xfee440)
    .addTextDisplayComponents(text('## 🏆 อันดับเลเวล'))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(lines.join('\n')));
  return i.reply({ components: [card], flags: V2, allowedMentions: { parse: [] } });
}

export const commandHandlers = { rank: rankCommand, leaderboard: leaderboardCommand };

export function register(client) {
  client.on(Events.MessageCreate, onMessage);
}
