// สายสนุก: /cat /8ball /choose /roll /coinflip /xo /guess /trivia
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { TRIVIA } from '../config.js';
import { EPHEMERAL, pick, rand, shuffle } from '../util.js';

const NO_PING = { parse: [] };

export const commands = [
  new SlashCommandBuilder().setName('cat').setDescription('สุ่มรูปแมวน่ารักๆ 🐱').setDMPermission(false),
  new SlashCommandBuilder()
    .setName('8ball')
    .setDescription('ถามลูกแก้วทำนาย')
    .setDMPermission(false)
    .addStringOption((o) => o.setName('question').setDescription('คำถาม (ตอบได้แบบใช่/ไม่ใช่)').setRequired(true).setMaxLength(200)),
  new SlashCommandBuilder()
    .setName('choose')
    .setDescription('ให้บอทเลือกให้ จากตัวเลือกที่คั่นด้วย , หรือ |')
    .setDMPermission(false)
    .addStringOption((o) => o.setName('options').setDescription('เช่น ข้าวมันไก่, ก๋วยเตี๋ยว, ส้มตำ').setRequired(true)),
  new SlashCommandBuilder()
    .setName('roll')
    .setDescription('ทอยลูกเต๋า')
    .setDMPermission(false)
    .addStringOption((o) => o.setName('dice').setDescription('เช่น d6, 2d6, d20 (ไม่ใส่ = d6)').setMaxLength(10)),
  new SlashCommandBuilder().setName('coinflip').setDescription('โยนเหรียญ หัว/ก้อย').setDMPermission(false),
  new SlashCommandBuilder()
    .setName('xo')
    .setDescription('ชวนเพื่อนเล่นเกม XO')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('opponent').setDescription('คู่แข่ง').setRequired(true)),
  new SlashCommandBuilder()
    .setName('guess')
    .setDescription('เกมทายเลข ทุกคนในช่องช่วยกันทายได้')
    .setDMPermission(false)
    .addIntegerOption((o) => o.setName('max').setDescription('ทายตั้งแต่ 1 ถึงเลขนี้ (ค่าเริ่มต้น 100)').setMinValue(10).setMaxValue(1000)),
  new SlashCommandBuilder().setName('trivia').setDescription('ตอบคำถามความรู้รอบตัว คนแรกที่ตอบถูกชนะ').setDMPermission(false),
];

// ---------- คำสั่งเล็กๆ ----------
async function catCommand(i) {
  await i.deferReply();
  try {
    const res = await fetch('https://api.thecatapi.com/v1/images/search', { signal: AbortSignal.timeout(6000) });
    const [cat] = await res.json();
    if (!cat?.url) throw new Error('no image');
    return i.editReply({ content: '🐱 เมี๊ยว~', embeds: [new EmbedBuilder().setColor(0xf15bb5).setImage(cat.url)] });
  } catch {
    return i.editReply('😿 หารูปแมวไม่เจอตอนนี้ ลองใหม่อีกทีนะ');
  }
}

const EIGHT_BALL = [
  'แน่นอนอยู่แล้ว ✅', 'ชัวร์เลย ✅', 'ไม่ต้องสงสัยเลย ✅', 'ใช่ ไปเลย ✅', 'น่าจะใช่นะ 👍',
  'ดูแล้วเป็นไปได้ 👍', 'ท่าทางดี 👍', 'ยังไม่แน่ใจ ถามใหม่อีกที 🤔', 'ตอนนี้ยังบอกไม่ได้ 🤔',
  'ไปคิดมาก่อนแล้วค่อยถามใหม่ 🤔', 'อย่าไปหวังเลย ❌', 'ไม่น่าจะใช่ ❌', 'คำตอบคือไม่ ❌',
  'ดูแล้วไม่ค่อยดี ❌', 'แหล่งข่าวของฉันบอกว่าไม่ ❌',
];

const splitOptions = (s) => s.split(/[,|]/).map((x) => x.trim()).filter(Boolean);

async function rollCommand(i) {
  const raw = (i.options.getString('dice') ?? 'd6').toLowerCase().replace(/\s/g, '');
  const m = /^(\d{0,2})d(\d{1,4})$/.exec(raw);
  if (!m) return i.reply({ content: '❌ ใส่แบบ `d6`, `2d6`, `d20` นะ (ทอยได้สูงสุด 20 ลูก ลูกละไม่เกิน 1000 หน้า)', ...EPHEMERAL });

  const count = m[1] === '' ? 1 : Number(m[1]);
  const sides = Number(m[2]);
  if (count < 1 || count > 20 || sides < 2 || sides > 1000) {
    return i.reply({ content: '❌ ทอยได้ 1-20 ลูก และลูกเต๋ามี 2-1000 หน้า', ...EPHEMERAL });
  }
  const rolls = Array.from({ length: count }, () => 1 + rand(sides));
  const total = rolls.reduce((a, b) => a + b, 0);
  return i.reply(`🎲 ทอย **${count}d${sides}**: ${count > 1 ? `[${rolls.join(', ')}] รวม ` : ''}**${total}**`);
}

// ---------- XO ----------
const xoGames = new Map(); // messageId -> { x, o, board, turn, ts }
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

function xoRows(game, over = false) {
  return [0, 1, 2].map((r) =>
    new ActionRowBuilder().addComponents(
      [0, 1, 2].map((c) => {
        const idx = r * 3 + c;
        const cell = game.board[idx];
        return new ButtonBuilder()
          .setCustomId(`xo:${idx}`)
          .setEmoji(cell === 'x' ? '❌' : cell === 'o' ? '⭕' : '⬜')
          .setStyle(cell === 'x' ? ButtonStyle.Danger : cell === 'o' ? ButtonStyle.Primary : ButtonStyle.Secondary)
          .setDisabled(over || Boolean(cell));
      }),
    ),
  );
}

async function xoCommand(i) {
  const opp = i.options.getUser('opponent', true);
  if (opp.bot || opp.id === i.user.id) return i.reply({ content: '❌ ต้องเลือกเพื่อนอีกคน (ไม่ใช่ตัวเองหรือบอท)', ...EPHEMERAL });

  const game = { x: i.user.id, o: opp.id, board: Array(9).fill(null), turn: 'x', ts: Date.now() };
  await i.reply({
    content: `❌ <@${game.x}> vs ⭕ <@${game.o}>\nตาของ ❌ <@${game.x}>`,
    components: xoRows(game),
    allowedMentions: { users: [game.x, game.o] },
  });
  const msg = await i.fetchReply();
  xoGames.set(msg.id, game);
}

async function xoButton(i) {
  const game = xoGames.get(i.message.id);
  if (!game) return i.reply({ content: 'เกมนี้หมดอายุแล้ว เริ่มใหม่ด้วย `/xo` ได้เลย', ...EPHEMERAL });

  const turnId = game[game.turn];
  if (i.user.id !== game.x && i.user.id !== game.o) return i.reply({ content: 'คุณไม่ได้เล่นเกมนี้ 🐾', ...EPHEMERAL });
  if (i.user.id !== turnId) return i.reply({ content: 'ยังไม่ถึงตาคุณ รอก่อนนะ ⏳', ...EPHEMERAL });

  const idx = Number(i.customId.split(':')[1]);
  if (game.board[idx]) return i.reply({ content: 'ช่องนี้ถูกเลือกแล้ว', ...EPHEMERAL });
  game.board[idx] = game.turn;

  const header = `❌ <@${game.x}> vs ⭕ <@${game.o}>`;
  const won = LINES.some((l) => l.every((k) => game.board[k] === game.turn));
  if (won) {
    xoGames.delete(i.message.id);
    return i.update({ content: `${header}\n🏆 <@${turnId}> ชนะ!`, components: xoRows(game, true) });
  }
  if (game.board.every(Boolean)) {
    xoGames.delete(i.message.id);
    return i.update({ content: `${header}\n🤝 เสมอกัน!`, components: xoRows(game, true) });
  }

  game.turn = game.turn === 'x' ? 'o' : 'x';
  game.ts = Date.now();
  return i.update({
    content: `${header}\nตาของ ${game.turn === 'x' ? '❌' : '⭕'} <@${game[game.turn]}>`,
    components: xoRows(game),
  });
}

// ---------- ทายเลข ----------
const guessGames = new Map(); // messageId -> { number, max, tries, ts }

async function guessCommand(i) {
  const max = i.options.getInteger('max') ?? 100;
  await i.reply({
    content: `🔢 **เกมทายเลข!** ฉันคิดเลขไว้ตั้งแต่ **1 ถึง ${max}** ใครทายถูกคนแรกชนะ\nกดปุ่มด้านล่างเพื่อทาย (บอกใบ้ให้เฉพาะคนทาย)`,
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('guess:open').setLabel('ทายเลข').setEmoji('🔢').setStyle(ButtonStyle.Primary),
      ),
    ],
  });
  const msg = await i.fetchReply();
  guessGames.set(msg.id, { number: 1 + rand(max), max, tries: 0, ts: Date.now() });
}

async function guessHandler(i) {
  const parts = i.customId.split(':');

  if (i.isButton()) {
    const game = guessGames.get(i.message.id);
    if (!game) return i.reply({ content: 'เกมนี้จบหรือหมดอายุแล้ว เริ่มใหม่ด้วย `/guess`', ...EPHEMERAL });
    const modal = new ModalBuilder()
      .setCustomId(`guess:modal:${i.message.id}`)
      .setTitle(`ทายเลข 1-${game.max}`)
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('num')
            .setLabel('ตัวเลขของคุณ')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(4),
        ),
      );
    return i.showModal(modal);
  }

  // ส่งคำตอบจาก modal
  const game = guessGames.get(parts[2]);
  if (!game) return i.reply({ content: 'เกมนี้จบหรือหมดอายุแล้ว', ...EPHEMERAL });

  const n = Number(i.fields.getTextInputValue('num').trim());
  if (!Number.isInteger(n) || n < 1 || n > game.max) {
    return i.reply({ content: `❌ ใส่ตัวเลข 1-${game.max} เท่านั้นนะ`, ...EPHEMERAL });
  }
  game.tries++;

  if (n !== game.number) {
    return i.reply({ content: n < game.number ? `${n} → สูงกว่านี้ ⬆️` : `${n} → ต่ำกว่านี้ ⬇️`, ...EPHEMERAL });
  }

  guessGames.delete(parts[2]);
  const win = `🎉 <@${i.user.id}> ทายถูก! คำตอบคือ **${game.number}** (ทายกันไป ${game.tries} ครั้ง)`;
  if (i.isFromMessage()) return i.update({ content: win, components: [] });
  return i.reply(win);
}

// ---------- Trivia ----------
const triviaGames = new Map(); // messageId -> { order, wrong:Set, ts }

function triviaRows(qi, order, over = false) {
  const q = TRIVIA[qi];
  return [
    new ActionRowBuilder().addComponents(
      order.map((idx) =>
        new ButtonBuilder()
          .setCustomId(`trivia:${qi}:${idx}`)
          .setLabel(q.choices[idx].slice(0, 80))
          .setStyle(over && idx === q.answer ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setDisabled(over),
      ),
    ),
  ];
}

async function triviaCommand(i) {
  const qi = rand(TRIVIA.length);
  const order = shuffle([...TRIVIA[qi].choices.keys()]);
  await i.reply({
    content: `❓ **${TRIVIA[qi].q}**\n-# คนแรกที่ตอบถูกชนะ • ตอบผิดแล้วตอบซ้ำไม่ได้`,
    components: triviaRows(qi, order),
  });
  const msg = await i.fetchReply();
  triviaGames.set(msg.id, { order, wrong: new Set(), ts: Date.now() });
}

async function triviaButton(i) {
  const [, qi, picked] = i.customId.split(':');
  const q = TRIVIA[Number(qi)];
  const game = triviaGames.get(i.message.id);
  if (!q || !game) return i.reply({ content: 'คำถามนี้หมดอายุแล้ว ลอง `/trivia` ใหม่ได้เลย', ...EPHEMERAL });
  if (game.wrong.has(i.user.id)) return i.reply({ content: 'คุณตอบผิดไปแล้ว รอดูคนอื่นนะ 😼', ...EPHEMERAL });

  if (Number(picked) === q.answer) {
    triviaGames.delete(i.message.id);
    return i.update({
      content: `✅ <@${i.user.id}> ตอบถูกเป็นคนแรก!\n**${q.q}**\nคำตอบ: **${q.choices[q.answer]}**`,
      components: triviaRows(Number(qi), game.order, true),
    });
  }
  game.wrong.add(i.user.id);
  return i.reply({ content: '❌ ผิดนะ ตอบซ้ำไม่ได้แล้ว', ...EPHEMERAL });
}

export const commandHandlers = {
  cat: catCommand,
  '8ball': (i) => i.reply({ content: `🎱 **${i.options.getString('question', true)}**\n${pick(EIGHT_BALL)}`, allowedMentions: NO_PING }),
  choose: (i) => {
    const options = splitOptions(i.options.getString('options', true));
    if (options.length < 2) return i.reply({ content: '❌ ใส่ตัวเลือกอย่างน้อย 2 อย่าง คั่นด้วย `,` หรือ `|`', ...EPHEMERAL });
    return i.reply({ content: `🤔 ฉันเลือก... **${pick(options)}**`, allowedMentions: NO_PING });
  },
  roll: rollCommand,
  coinflip: (i) => i.reply(`🪙 ${Math.random() < 0.5 ? '**หัว**' : '**ก้อย**'}!`),
  xo: xoCommand,
  guess: guessCommand,
  trivia: triviaCommand,
};

export const componentHandlers = { xo: xoButton, guess: guessHandler, trivia: triviaButton };

export function register() {
  // เก็บกวาดเกมที่ค้างนานเกินไปทุก 10 นาที
  setInterval(() => {
    const now = Date.now();
    for (const [map, ttl] of [[xoGames, 3600e3], [guessGames, 1800e3], [triviaGames, 1800e3]]) {
      for (const [id, g] of map) if (now - g.ts > ttl) map.delete(id);
    }
  }, 10 * 60 * 1000).unref();
}
