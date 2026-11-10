import { Client, Events, GatewayIntentBits, MessageFlags, Partials } from 'discord.js';
import { modules } from './modules/index.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // ⚠️ Privileged: ต้องเปิด "Server Members Intent" ใน Developer Portal (คนเข้า/ออก, วันเกิด)
    GatewayIntentBits.GuildVoiceStates, // ห้องส่วนตัว, log ห้องเสียง, เพลง
    GatewayIntentBits.GuildMessages, // นับ XP จากการพิมพ์ (ไม่อ่านเนื้อหาข้อความ จึงไม่ต้องใช้ Message Content)
  ],
  // ให้ได้ event ตอนคนออกแม้บอทไม่เคยเห็นเขามาก่อน (ไม่งั้น log คนออกจะหายเป็นช่วงๆ)
  partials: [Partials.GuildMember],
});

const commandHandlers = {};
const componentHandlers = {}; // key = ส่วนหน้า customId ก่อนเครื่องหมาย ":"  (ปุ่ม เมนู modal)
const autocompleteHandlers = {};
for (const m of modules) {
  Object.assign(commandHandlers, m.commandHandlers);
  Object.assign(componentHandlers, m.componentHandlers);
  Object.assign(autocompleteHandlers, m.autocompleteHandlers);
}

client.once(Events.ClientReady, (c) => {
  console.log(`🐱 บอทออนไลน์แล้วในชื่อ ${c.user.tag} • อยู่ใน ${c.guilds.cache.size} เซิร์ฟ`);
});

client.on(Events.InteractionCreate, async (i) => {
  try {
    if (i.isAutocomplete()) return await autocompleteHandlers[i.commandName]?.(i);

    if (i.isChatInputCommand()) {
      const handler = commandHandlers[i.commandName];
      if (!handler) return;
      if (!i.inGuild()) return await i.reply({ content: 'คำสั่งนี้ใช้ได้ในเซิร์ฟเวอร์เท่านั้นนะ', flags: MessageFlags.Ephemeral });
      return await handler(i);
    }

    if (i.isMessageComponent() || i.isModalSubmit()) {
      const handler = componentHandlers[i.customId.split(':')[0]];
      if (!handler) return;
      if (!i.inGuild()) return;
      return await handler(i);
    }
  } catch (err) {
    console.error(err);
    if (i.isAutocomplete()) return;
    const msg = '❌ เกิดข้อผิดพลาดบางอย่าง ลองอีกครั้ง หรือแจ้งแอดมินนะ';
    if (i.deferred || i.replied) await i.editReply(msg).catch(() => {});
    else await i.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
  }
});

for (const m of modules) m.register?.(client);

// ไม่ให้บอทดับทั้งตัวเพราะ error ที่หลุดมาจากงานเบื้องหลัง
process.on('unhandledRejection', (err) => console.error('unhandledRejection:', err));
client.on(Events.Error, (err) => console.error('client error:', err));

client.login(process.env.DISCORD_TOKEN);
