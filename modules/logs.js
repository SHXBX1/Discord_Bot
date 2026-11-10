// ช่องแจ้งเตือน: พิมพ์ /log set ในช่องไหน ช่องนั้นจะรับการแจ้งเตือนประเภทนั้น
// + ต้อนรับสมาชิกใหม่ + log คนเข้า/ออกเซิร์ฟ + log เข้า/ออก/ย้ายห้องเสียง
import {
  ContainerBuilder,
  Events,
  PermissionFlagsBits as P,
  SectionBuilder,
  SlashCommandBuilder,
  ThumbnailBuilder,
} from 'discord.js';
import { db, save } from '../db.js';
import { isHome, isHub, memberRoleOf } from '../settings.js';
import { EPHEMERAL, V2, getLogChannel, sendTo, simpleCard, text, unix } from '../util.js';

const TYPES = {
  welcome: { label: '👋 ต้อนรับสมาชิกใหม่', desc: 'ข้อความต้อนรับตอนมีคนเข้าเซิร์ฟ' },
  join: { label: '📥 log คนเข้าเซิร์ฟ', desc: 'บันทึกว่าใครเข้ามา' },
  leave: { label: '📤 log คนออกเซิร์ฟ', desc: 'บันทึกว่าใครออกไป' },
  voice: { label: '🔊 log ห้องเสียง', desc: 'บันทึกคนเข้า/ออก/ย้ายห้องเสียง' },
  birthday: { label: '🎂 ประกาศวันเกิด', desc: 'ประกาศวันเกิดสมาชิก' },
  levelup: { label: '🏅 ประกาศเลเวลอัป', desc: 'ไม่ตั้ง = ประกาศในช่องที่พิมพ์' },
};

const typeChoices = Object.entries(TYPES).map(([value, t]) => ({ name: t.label.replace(/^\S+\s/, ''), value }));

export const commands = [
  new SlashCommandBuilder()
    .setName('log')
    .setDescription('ตั้งช่องแจ้งเตือนของบอท (แอดมินเท่านั้น)')
    .setDefaultMemberPermissions(P.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName('set')
        .setDescription('ใช้ช่องที่พิมพ์คำสั่งนี้เป็นช่องแจ้งเตือนประเภทที่เลือก')
        .addStringOption((o) => o.setName('type').setDescription('ประเภท').setRequired(true).addChoices(...typeChoices)),
    )
    .addSubcommand((s) =>
      s
        .setName('off')
        .setDescription('ปิดการแจ้งเตือนประเภทนี้')
        .addStringOption((o) => o.setName('type').setDescription('ประเภท').setRequired(true).addChoices(...typeChoices)),
    )
    .addSubcommand((s) => s.setName('list').setDescription('ดูว่าตอนนี้แต่ละประเภทส่งไปที่ช่องไหน')),
];

async function logCommand(i) {
  const sub = i.options.getSubcommand();
  const settings = (db.channels[i.guild.id] ??= {});

  if (sub === 'list') {
    const lines = Object.entries(TYPES).map(([key, t]) => `${t.label}: ${settings[key] ? `<#${settings[key]}>` : '_ยังไม่ตั้ง_'}`);
    return i.reply({ content: lines.join('\n'), ...EPHEMERAL, allowedMentions: { parse: [] } });
  }

  const type = i.options.getString('type', true);
  const label = TYPES[type].label;

  if (sub === 'off') {
    delete settings[type];
    save();
    return i.reply({ content: `🔕 ปิด **${label}** แล้ว`, ...EPHEMERAL });
  }

  const me = i.guild.members.me;
  const perms = i.channel.permissionsFor(me);
  if (!perms?.has([P.ViewChannel, P.SendMessages])) {
    return i.reply({ content: '❌ บอทไม่มีสิทธิ์ส่งข้อความในช่องนี้ ให้สิทธิ์ View Channel และ Send Messages ก่อนนะ', ...EPHEMERAL });
  }

  settings[type] = i.channel.id;
  save();
  return i.reply({ content: `✅ ตั้งช่องนี้ (<#${i.channel.id}>) เป็น **${label}** แล้ว\n-# ${TYPES[type].desc}`, ...EPHEMERAL });
}

// ---------- สมาชิกเข้า/ออก ----------
async function onJoin(member) {
  const { guild, user } = member;

  if (!user.bot) {
    const role = memberRoleOf(guild);
    if (role?.editable) await member.roles.add(role).catch((err) => console.error('แจกฉายาสมาชิกไม่สำเร็จ:', err.message));
  }

  // ข้อความต้อนรับ
  if (!user.bot) {
    // ช่องที่ส่งแผงรับฉายาไว้ล่าสุด (/setup panel) | เซิร์ฟบ้านเรามีสำรองเป็นช่องที่ชื่อมี get-roles
    const panelId = db.settings[guild.id]?.panelChannelId;
    const rolesChannel =
      (panelId && guild.channels.cache.get(panelId)) ||
      (isHome(guild.id) ? guild.channels.cache.find((c) => c.name.includes('get-roles')) : null);
    const welcome = new ContainerBuilder().setAccentColor(0xf15bb5).addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          text(
            [
              `## 🐾 ยินดีต้อนรับสู่ ${guild.name}`,
              `<@${user.id}> เป็นแมวตัวที่ **${guild.memberCount}** แล้ว!`,
              rolesChannel ? `-# ไปรับฉายาที่ <#${rolesChannel.id}> ได้เลย` : '',
            ]
              .filter(Boolean)
              .join('\n'),
          ),
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(user.displayAvatarURL({ size: 128 }))),
    );
    await sendTo(guild, 'welcome', { components: [welcome], flags: V2, allowedMentions: { users: [user.id] } });
  }

  // log
  await sendTo(guild, 'join', {
    components: [
      simpleCard(
        0x06d6a0,
        '### 📥 แมวเข้าเซิร์ฟ',
        `<@${user.id}> (${user.tag})${user.bot ? ' 🤖' : ''}`,
        `-# ID ${user.id} • สร้างบัญชี <t:${unix(user.createdAt)}:R> • แมวทั้งหมด ${guild.memberCount}`,
      ),
    ],
    flags: V2,
    allowedMentions: { parse: [] },
  });
}

async function onLeave(member) {
  const { guild } = member;
  const user = member.user;
  if (!user) return;

  const roles = member.roles?.cache?.filter((r) => r.id !== guild.id).map((r) => r.name) ?? [];
  const lines = [
    '### 📤 แมวออกจากเซิร์ฟ',
    `**${user.tag}**${user.bot ? ' 🤖' : ''} (<@${user.id}>)`,
    `-# ID ${user.id}${member.joinedAt ? ` • เข้ามาเมื่อ <t:${unix(member.joinedAt)}:R>` : ''} • แมวเหลือ ${guild.memberCount}`,
  ];
  if (roles.length) lines.push(`-# ฉายา: ${roles.slice(0, 10).join(', ')}${roles.length > 10 ? ` และอีก ${roles.length - 10} ฉายา` : ''}`);

  await sendTo(guild, 'leave', {
    components: [simpleCard(0xef476f, ...lines)],
    flags: V2,
    allowedMentions: { parse: [] },
  });
}

// ---------- ห้องเสียง ----------
async function onVoice(oldState, newState) {
  if (oldState.channelId === newState.channelId) return; // แค่ปิด/เปิดไมค์ ไม่ log
  const { guild } = newState;
  const user = (newState.member ?? oldState.member)?.user;
  if (!user || !(await getLogChannel(guild, 'voice'))) return;

  const from = oldState.channel;
  const to = newState.channel;
  let line;

  if (!from && to) {
    if (isHub(to)) return; // เข้าห้อง Create Room: รอดูตอนถูกย้ายเข้าห้องส่วนตัวแทน
    line = `🔊 <@${user.id}> เข้าห้อง **${to.name}**`;
  } else if (from && !to) {
    if (isHub(from)) return;
    line = `🔇 <@${user.id}> ออกจากห้อง **${from.name}**`;
  } else if (from && to) {
    if (isHub(to)) return;
    line = isHub(from) ? `🔊 <@${user.id}> เข้าห้อง **${to.name}**` : `🔀 <@${user.id}> ย้ายจาก **${from.name}** ไป **${to.name}**`;
  } else {
    return;
  }

  await sendTo(guild, 'voice', {
    components: [simpleCard(0x00bbf9, `${line}\n-# <t:${unix(new Date())}:T>`)],
    flags: V2,
    allowedMentions: { parse: [] },
  });
}

export const commandHandlers = { log: logCommand };

export function register(client) {
  client.on(Events.GuildMemberAdd, (m) => onJoin(m).catch((err) => console.error('onJoin:', err)));
  client.on(Events.GuildMemberRemove, (m) => onLeave(m).catch((err) => console.error('onLeave:', err)));
  client.on(Events.VoiceStateUpdate, (a, b) => onVoice(a, b).catch((err) => console.error('onVoice:', err)));
}
