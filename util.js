import {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from 'discord.js';
import { UTC_OFFSET_HOURS } from './config.js';
import { db } from './db.js';

export const EPHEMERAL = { flags: MessageFlags.Ephemeral };
export const V2 = MessageFlags.IsComponentsV2;
export const V2_EPHEMERAL = { flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral };

export const text = (content) => new TextDisplayBuilder().setContent(content);
export const divider = () => new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);

// การ์ด Components V2 แบบง่าย: แถบสี + ข้อความ
export function simpleCard(color, ...lines) {
  return new ContainerBuilder().setAccentColor(color).addTextDisplayComponents(text(lines.join('\n')));
}

export const rand = (n) => Math.floor(Math.random() * n);
export const pick = (arr) => arr[rand(arr.length)];
export const unix = (date) => Math.floor(date.getTime() / 1000);

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// วันที่/เวลาตามเขตเวลาของเซิร์ฟ (offset = ชั่วโมงจาก UTC ดูค่าของเซิร์ฟด้วย offsetOf() ใน settings.js)
export function localParts(date = new Date(), offset = UTC_OFFSET_HOURS) {
  const d = new Date(date.getTime() + offset * 3600e3);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function dateKey(date = new Date(), offset = UTC_OFFSET_HOURS) {
  const { year, month, day } = localParts(date, offset);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export const findRole = (guild, name) => guild.roles.cache.find((r) => r.name === name) ?? null;

export const displayNameOf = (user, member) => member?.displayName ?? user.globalName ?? user.username;

// ช่องที่แอดมินตั้งไว้ด้วย /log set  (type: welcome | join | leave | voice | birthday | levelup)
export async function getLogChannel(guild, type) {
  const id = db.channels[guild.id]?.[type];
  if (!id) return null;
  const ch = guild.channels.cache.get(id) ?? (await guild.channels.fetch(id).catch(() => null));
  return ch?.isTextBased() ? ch : null;
}

export async function sendTo(guild, type, payload) {
  const ch = await getLogChannel(guild, type);
  if (!ch) return null;
  try {
    return await ch.send(payload);
  } catch (err) {
    console.error(`ส่งข้อความไปช่อง ${type} ไม่ได้:`, err.message);
    return null;
  }
}
