// ห้องเสียงส่วนตัว: เข้าห้อง "➕｜Create Room" แล้วบอทสร้างห้องให้ ลบเองเมื่อว่าง
import { ChannelType, Events, OverwriteType, PermissionFlagsBits as P, SlashCommandBuilder } from 'discord.js';
import { db, save } from '../db.js';
import { isHub } from '../settings.js';
import { EPHEMERAL } from '../util.js';

export const commands = [
  new SlashCommandBuilder()
    .setName('room')
    .setDescription('จัดการห้องเสียงส่วนตัวของคุณ')
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName('name')
        .setDescription('เปลี่ยนชื่อห้อง')
        .addStringOption((o) => o.setName('name').setDescription('ชื่อใหม่').setRequired(true).setMaxLength(80)),
    )
    .addSubcommand((s) =>
      s
        .setName('limit')
        .setDescription('จำกัดจำนวนคนในห้อง')
        .addIntegerOption((o) =>
          o.setName('limit').setDescription('จำนวนคนสูงสุด (0 = ไม่จำกัด)').setRequired(true).setMinValue(0).setMaxValue(99),
        ),
    )
    .addSubcommand((s) => s.setName('lock').setDescription('ล็อกห้อง ไม่ให้คนอื่นเข้าเพิ่ม'))
    .addSubcommand((s) => s.setName('unlock').setDescription('เปิดห้องให้ทุกคนเข้าได้'))
    .addSubcommand((s) =>
      s
        .setName('transfer')
        .setDescription('โอนความเป็นเจ้าของห้องให้คนอื่นที่อยู่ในห้อง')
        .addUserOption((o) => o.setName('user').setDescription('เจ้าของคนใหม่').setRequired(true)),
    ),
];

const RENAME_LIMIT = 2; // Discord จำกัดการเปลี่ยนชื่อช่อง 2 ครั้งต่อ 10 นาที
const RENAME_WINDOW = 10 * 60 * 1000;
const renameLog = new Map(); // channelId -> [timestamps]
const createCooldown = new Map(); // userId -> timestamp

const ownerPerms = [P.ViewChannel, P.Connect, P.MoveMembers];

function ownedRoom(i) {
  const vc = i.member?.voice?.channel;
  const room = vc ? db.rooms[vc.id] : null;
  if (!room) return { error: '❌ ต้องอยู่ในห้องเสียงส่วนตัวของคุณก่อน ถึงจะใช้คำสั่งนี้ได้ (เข้าห้อง Create Room เพื่อสร้างห้อง)' };
  if (room.owner !== i.user.id && !i.memberPermissions.has(P.ManageChannels)) {
    return { error: `❌ ห้องนี้เป็นของ <@${room.owner}> เฉพาะเจ้าของห้องเท่านั้นที่ใช้คำสั่งนี้ได้` };
  }
  return { vc, room };
}

async function roomCommand(i) {
  const { vc, room, error } = ownedRoom(i);
  if (error) return i.reply({ content: error, ...EPHEMERAL });

  switch (i.options.getSubcommand()) {
    case 'name': {
      const name = i.options.getString('name', true).trim().slice(0, 90);
      if (!name) return i.reply({ content: '❌ ชื่อห้องว่างไม่ได้', ...EPHEMERAL });

      const now = Date.now();
      const recent = (renameLog.get(vc.id) ?? []).filter((t) => now - t < RENAME_WINDOW);
      if (recent.length >= RENAME_LIMIT) {
        const wait = Math.ceil((RENAME_WINDOW - (now - recent[0])) / 60000);
        return i.reply({ content: `⏳ เปลี่ยนชื่อห้องได้ ${RENAME_LIMIT} ครั้งต่อ 10 นาที รออีกประมาณ ${wait} นาที`, ...EPHEMERAL });
      }
      await i.deferReply(EPHEMERAL);
      await vc.setName(name);
      recent.push(now);
      renameLog.set(vc.id, recent);
      return i.editReply(`✅ เปลี่ยนชื่อห้องเป็น **${name}** แล้ว`);
    }
    case 'limit': {
      const n = i.options.getInteger('limit', true);
      await vc.setUserLimit(n);
      return i.reply({ content: n === 0 ? '✅ ยกเลิกการจำกัดจำนวนคนแล้ว' : `✅ จำกัดห้องไว้ที่ **${n}** คน`, ...EPHEMERAL });
    }
    case 'lock': {
      await vc.permissionOverwrites.edit(i.guild.roles.everyone, { Connect: false });
      return i.reply({ content: '🔒 ล็อกห้องแล้ว คนที่อยู่ในห้องยังอยู่ต่อได้ แต่คนนอกเข้าไม่ได้', ...EPHEMERAL });
    }
    case 'unlock': {
      await vc.permissionOverwrites.edit(i.guild.roles.everyone, { Connect: null });
      return i.reply({ content: '🔓 เปิดห้องแล้ว ทุกคนเข้าได้', ...EPHEMERAL });
    }
    case 'transfer': {
      const target = i.options.getMember('user');
      if (!target || target.user.bot || target.id === room.owner || !vc.members.has(target.id)) {
        return i.reply({ content: '❌ ต้องเลือกคนอื่น (ไม่ใช่บอท) ที่อยู่ในห้องนี้ตอนนี้', ...EPHEMERAL });
      }
      await vc.permissionOverwrites.edit(target, { ViewChannel: true, Connect: true, MoveMembers: true });
      await vc.permissionOverwrites.delete(room.owner).catch(() => {});
      room.owner = target.id;
      save();
      return i.reply({ content: `👑 โอนห้องให้ <@${target.id}> แล้ว`, ...EPHEMERAL, allowedMentions: { parse: [] } });
    }
  }
}

async function createRoom(state) {
  const { guild, member, channel: hub } = state;
  if (!member || member.user.bot) return;

  const now = Date.now();
  if (now - (createCooldown.get(member.id) ?? 0) < 5000) return;
  createCooldown.set(member.id, now);

  const room = await guild.channels.create({
    name: `🐾｜${member.displayName}`.slice(0, 90),
    type: ChannelType.GuildVoice,
    parent: hub.parentId,
    permissionOverwrites: [
      {
        id: guild.members.me.id,
        type: OverwriteType.Member,
        allow: [P.ViewChannel, P.Connect, P.ManageChannels, P.MoveMembers],
      },
      { id: member.id, type: OverwriteType.Member, allow: ownerPerms },
    ],
    reason: `ห้องส่วนตัวของ ${member.user.tag}`,
  });

  db.rooms[room.id] = { guildId: guild.id, owner: member.id };
  save();

  try {
    await member.voice.setChannel(room);
  } catch {
    // คนกดออกไปก่อนบอทย้ายทัน → ลบห้องทิ้ง
    delete db.rooms[room.id];
    save();
    await room.delete().catch(() => {});
  }
}

async function leaveRoom(oldState) {
  const room = db.rooms[oldState.channelId];
  const ch = oldState.channel;
  if (!room) return;
  if (!ch) {
    delete db.rooms[oldState.channelId];
    save();
    return;
  }

  const humans = ch.members.filter((m) => !m.user.bot);
  if (humans.size === 0) {
    delete db.rooms[ch.id];
    save();
    await ch.delete('ห้องว่าง').catch((err) => console.error('ลบห้องไม่สำเร็จ:', err.message));
    return;
  }

  // เจ้าของออกแต่ยังมีคนอยู่ → โอนให้คนที่เหลือคนแรก
  if (room.owner === oldState.id) {
    const next = humans.first();
    await ch.permissionOverwrites.edit(next, { ViewChannel: true, Connect: true, MoveMembers: true }).catch(() => {});
    await ch.permissionOverwrites.delete(oldState.id).catch(() => {});
    room.owner = next.id;
    save();
  }
}

async function onVoice(oldState, newState) {
  try {
    if (newState.channelId && newState.channelId !== oldState.channelId && isHub(newState.channel)) {
      await createRoom(newState);
    }
    if (oldState.channelId && oldState.channelId !== newState.channelId && db.rooms[oldState.channelId]) {
      await leaveRoom(oldState);
    }
  } catch (err) {
    console.error('ห้องเสียงส่วนตัวผิดพลาด:', err);
  }
}

export const commandHandlers = { room: roomCommand };

export function register(client) {
  client.on(Events.VoiceStateUpdate, onVoice);

  // ตอนบอทเปิด: เก็บกวาดห้องที่ค้างอยู่ (เช่น บอทดับตอนห้องว่าง)
  client.once(Events.ClientReady, async () => {
    for (const [id, room] of Object.entries(db.rooms)) {
      const ch = client.guilds.cache.get(room.guildId)?.channels.cache.get(id);
      if (!ch) {
        delete db.rooms[id];
      } else if (ch.members.filter((m) => !m.user.bot).size === 0) {
        delete db.rooms[id];
        await ch.delete('ห้องว่างตอนบอทเริ่มทำงาน').catch(() => {});
      }
    }
    save();
  });
}
