// ลงทะเบียนคำสั่งสแลช
//   npm run deploy         → ลงทะเบียนแบบ global (ใช้ได้ทุกเซิร์ฟที่เชิญบอท อาจใช้เวลาสักพักกว่าจะขึ้น)
//   npm run deploy:guild   → ลงทะเบียนเฉพาะเซิร์ฟใน GUILD_ID (ขึ้นทันที เหมาะตอนทดสอบ)
import { REST, Routes } from 'discord.js';
import { commands } from './modules/index.js';

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
const guildOnly = process.argv.includes('--guild');

if (!DISCORD_TOKEN || !CLIENT_ID || (guildOnly && !GUILD_ID)) {
  console.error(`❌ ต้องตั้งค่า DISCORD_TOKEN, CLIENT_ID${guildOnly ? ', GUILD_ID' : ''} ในไฟล์ .env ก่อน`);
  process.exit(1);
}

const body = commands.map((c) => c.toJSON());
const rest = new REST().setToken(DISCORD_TOKEN);

if (guildOnly) {
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body });
  console.log(`✅ ลงทะเบียน ${body.length} คำสั่งให้เซิร์ฟ ${GUILD_ID} แล้ว`);
} else {
  // Discord ไม่ให้ลบคำสั่ง Entry Point (type 4) ของแอปด้วย bulk update
  // เลยดึงตัวเดิมมาต่อท้ายรายการด้วย
  const existing = await rest.get(Routes.applicationCommands(CLIENT_ID));
  const entryPoint = existing.find((c) => c.type === 4);
  if (entryPoint) {
    body.push({
      id: entryPoint.id,
      name: entryPoint.name,
      description: entryPoint.description,
      type: entryPoint.type,
      handler: entryPoint.handler,
      integration_types: entryPoint.integration_types,
      contexts: entryPoint.contexts,
    });
  }

  await rest.put(Routes.applicationCommands(CLIENT_ID), { body });
  // ล้างคำสั่งที่เคยลงเฉพาะเซิร์ฟไว้ ไม่งั้นจะเห็นคำสั่งซ้ำสองชุดในเซิร์ฟนั้น
  if (GUILD_ID) await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [] });
  console.log(`✅ ลงทะเบียน ${body.length} คำสั่งแบบ global แล้ว`);
}