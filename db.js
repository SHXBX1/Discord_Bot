// ที่เก็บข้อมูลของบอท (ไฟล์ JSON ธรรมดา ไม่ต้องติดตั้งฐานข้อมูล)
// ไฟล์อยู่ที่ data/db.json  สำรองไว้ได้เลยด้วยการคัดลอกไฟล์นี้
// เปลี่ยนที่เก็บได้ด้วยตัวแปร DB_FILE ใน .env
import fs from 'node:fs';
import path from 'node:path';

const FILE = process.env.DB_FILE || path.join(process.cwd(), 'data', 'db.json');

const defaults = () => ({
  channels: {}, // { guildId: { welcome, join, leave, voice, birthday, levelup } }
  xp: {}, // { guildId: { userId: { xp } } }
  rooms: {}, // { voiceChannelId: { guildId, owner } }
  lfg: {}, // { messageId: { ... } }
  birthdays: {}, // { guildId: { userId: { d, m } } }
  meta: {}, // { birthdayChecked: { guildId: 'YYYY-MM-DD' } }
  settings: {}, // { guildId: {...} } ค่าที่ตั้งด้วย /setup (ดู settings.js)
  valorant: { links: {} }, // { links: { discordUserId: { name, tag, region } } } บัญชี Riot ที่ผูกด้วย /valorant link
});

function load() {
  let raw;
  try {
    raw = fs.readFileSync(FILE, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('อ่านไฟล์ข้อมูลไม่ได้:', err.message);
    return defaults();
  }
  try {
    return { ...defaults(), ...JSON.parse(raw) };
  } catch {
    // ไฟล์เสีย: เก็บของเดิมไว้ก่อน แล้วเริ่มใหม่ เพื่อไม่ให้ทับข้อมูลที่กู้ได้
    const backup = `${FILE}.corrupt-${Date.now()}`;
    fs.renameSync(FILE, backup);
    console.error(`⚠️ ไฟล์ข้อมูลเสีย ย้ายไปเก็บที่ ${backup} แล้วเริ่มใหม่`);
    return defaults();
  }
}

export const db = load();

export function saveNow() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, FILE);
  } catch (err) {
    console.error('บันทึกข้อมูลไม่สำเร็จ:', err.message);
  }
}

// รวมการบันทึกถี่ๆ ให้เหลือครั้งเดียวทุก 2 วินาที
let timer = null;
export function save() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    saveNow();
  }, 2000);
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    saveNow();
    process.exit(0);
  });
}
