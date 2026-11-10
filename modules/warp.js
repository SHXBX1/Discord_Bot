// /warp: โพสต์การ์ดแชร์โพสต์จากที่อื่น (หัวข้อ + คำอธิบาย + รูปหลายรูปเป็นคอลลาจ + ปุ่มเปิดโพสต์ต้นฉบับ)
// รูปที่ใส่เข้ามาเป็น URL ได้สูงสุด 10 รูป คั่นด้วยช่องว่าง ขึ้นบรรทัดใหม่ หรือ comma
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SlashCommandBuilder,
} from 'discord.js';
import { EPHEMERAL, V2, text } from '../util.js';

const MAX_IMAGES = 10; // ลิมิตของ Discord Media Gallery

export const commands = [
  new SlashCommandBuilder()
    .setName('warp')
    .setDescription('โพสต์การ์ดแชร์โพสต์พร้อมรูปแบบคอลลาจ')
    .setDMPermission(false)
    .addStringOption((o) => o.setName('title').setDescription('หัวโพสต์').setRequired(true).setMaxLength(200))
    .addStringOption((o) =>
      o.setName('images').setDescription(`URL รูป (ได้สูงสุด ${MAX_IMAGES} รูป คั่นด้วยช่องว่างหรือ comma)`).setRequired(true).setMaxLength(2000),
    )
    .addStringOption((o) => o.setName('url').setDescription('ลิงก์ต้นฉบับของโพสต์').setRequired(true).setMaxLength(1000))
    .addStringOption((o) => o.setName('description').setDescription('คำอธิบาย (ไม่ใส่ก็ได้)').setMaxLength(1500)),
];

const httpUrl = (s) => {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
};

async function warpCommand(i) {
  const title = i.options.getString('title', true).trim();
  const description = i.options.getString('description')?.trim();
  const postUrl = httpUrl(i.options.getString('url', true).trim().replace(/^<|>$/g, ''));
  if (!postUrl) return i.reply({ content: '❌ ลิงก์ต้นฉบับของโพสต์ไม่ถูกต้อง (ต้องขึ้นต้นด้วย http:// หรือ https://)', ...EPHEMERAL });

  const raw = i.options.getString('images', true).split(/[\s,]+/).filter(Boolean);
  const images = [...new Set(raw.map((s) => httpUrl(s.replace(/^<|>$/g, ''))))];
  if (images.includes(null)) return i.reply({ content: '❌ มี URL รูปที่ไม่ถูกต้อง (ต้องขึ้นต้นด้วย http:// หรือ https://)', ...EPHEMERAL });
  if (images.length > MAX_IMAGES) return i.reply({ content: `❌ ใส่รูปได้สูงสุด ${MAX_IMAGES} รูป`, ...EPHEMERAL });

  const body = [`**${title}**`, description].filter(Boolean).join('\n');

  const card = new ContainerBuilder()
    .addTextDisplayComponents(text(body))
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(images.map((url) => new MediaGalleryItemBuilder().setURL(url))),
    );

  const button = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('เปิดโพสต์').setURL(postUrl),
  );

  try {
    return await i.reply({ components: [card, button], flags: V2, allowedMentions: { parse: [] } });
  } catch (err) {
    console.error('/warp ส่งไม่สำเร็จ:', err.message);
    return i.reply({ content: '❌ ส่งการ์ดไม่สำเร็จ ลองตรวจว่า URL รูปและลิงก์ถูกต้องไหม', ...EPHEMERAL });
  }
}

export const commandHandlers = { warp: warpCommand };