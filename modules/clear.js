// /clear: ลบข้อความในห้องนี้ (ไม่ใส่จำนวน = ลบทั้งห้อง มีปุ่มให้ยืนยันก่อน)
// ข้ามข้อความที่ปักหมุด และข้ามข้อความคอนโซลเพลงของ /setconsole ถ้าห้องนี้เป็นห้องคอนโซล
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits as P, SlashCommandBuilder } from 'discord.js';
import { db } from '../db.js';
import { EPHEMERAL } from '../util.js';

export const commands = [
  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('ลบข้อความในห้องนี้ (ไม่ใส่จำนวน = ลบทั้งห้อง)')
    .setDMPermission(false)
    .setDefaultMemberPermissions(P.ManageMessages)
    .addIntegerOption((o) => o.setName('amount').setDescription('จำนวนข้อความที่จะลบ (ไม่ใส่ = ลบทั้งหมด)').setMinValue(1).setMaxValue(1000)),
];

const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;
const MAX_RUN_MS = 10 * 60_000; // ข้อความเก่ากว่า 14 วันต้องลบทีละข้อความ (ช้า) เลยจำกัดเวลารอบละ 10 นาที

async function wipe(channel, limit = Infinity) {
  const keep = db.musicConsole?.[channel.guild.id];
  const keepId = keep?.channelId === channel.id ? keep.messageId : null;
  const deadline = Date.now() + MAX_RUN_MS;
  const bulkCutoff = Date.now() - FOURTEEN_DAYS + 60_000;
  let deleted = 0;
  let before;
  let finished = false;

  while (deleted < limit && Date.now() < deadline) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (!batch.size) {
      finished = true;
      break;
    }
    before = batch.last().id;

    const targets = [...batch.values()].filter((m) => !m.pinned && m.id !== keepId).slice(0, limit - deleted);
    const fresh = targets.filter((m) => m.createdTimestamp > bulkCutoff);
    const old = targets.filter((m) => m.createdTimestamp <= bulkCutoff);

    if (fresh.length) deleted += (await channel.bulkDelete(fresh, true)).size;
    for (const m of old) {
      if (Date.now() > deadline) break;
      if (await m.delete().then(() => true, () => false)) deleted++;
    }
  }
  return { deleted, finished };
}

const missingPerms = (i) => {
  const perms = i.channel.permissionsFor(i.guild.members.me);
  return !perms?.has([P.ViewChannel, P.ReadMessageHistory, P.ManageMessages]);
};

async function clearCommand(i) {
  if (!i.channel?.isTextBased() || missingPerms(i)) {
    return i.reply({ content: 'บอทต้องมีสิทธิ์ View Channel, Read Message History และ Manage Messages ในห้องนี้', ...EPHEMERAL });
  }

  const amount = i.options.getInteger('amount');
  if (amount) {
    await i.deferReply(EPHEMERAL);
    const { deleted } = await wipe(i.channel, amount);
    return i.editReply(`ลบไป ${deleted} ข้อความ`);
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`clear:yes:${i.user.id}`).setStyle(ButtonStyle.Secondary).setLabel('ยืนยันลบทั้งหมด'),
    new ButtonBuilder().setCustomId(`clear:no:${i.user.id}`).setStyle(ButtonStyle.Secondary).setLabel('ยกเลิก'),
  );
  return i.reply({ content: `ลบข้อความ**ทั้งหมด**ในห้อง <#${i.channel.id}> ? (ข้อความที่ปักหมุดจะไม่ถูกลบ ย้อนกลับไม่ได้)`, components: [row], ...EPHEMERAL });
}

async function clearButton(i) {
  const [, action, ownerId] = i.customId.split(':');
  if (i.user.id !== ownerId) return i.reply({ content: 'ปุ่มนี้ของคนที่สั่งคำสั่งเท่านั้น', ...EPHEMERAL });
  if (action === 'no') return i.update({ content: 'ยกเลิกแล้ว', components: [] });

  if (missingPerms(i)) return i.update({ content: 'บอทไม่มีสิทธิ์ในห้องนี้แล้ว', components: [] });
  await i.update({ content: 'กำลังลบข้อความ...', components: [] });
  try {
    const { deleted, finished } = await wipe(i.channel);
    return i.editReply(finished ? `ลบไป ${deleted} ข้อความ` : `ลบไป ${deleted} ข้อความ (ยังเหลืออีก ข้อความเก่าลบช้า สั่ง /clear อีกรอบเพื่อลบต่อ)`);
  } catch (err) {
    console.error('/clear ผิดพลาด:', err.message);
    return i.editReply('ลบไม่สำเร็จ ลองใหม่อีกครั้งนะ');
  }
}

export const commandHandlers = { clear: clearCommand };
export const componentHandlers = { clear: clearButton };