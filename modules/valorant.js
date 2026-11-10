// /valorant — สถิติผู้เล่น (แรงค์ KDA ACS ADR HS%), ข่าวสาร/แพตช์โน้ต, ตารางแข่ง esports, ข้อมูลปืน
//
// แหล่งข้อมูล (Riot ไม่เปิด API สถิติผู้เล่นให้ใช้ทั่วไป จึงใช้บริการของชุมชนแทน):
//  • HenrikDev API (https://api.henrikdev.xyz) — สถิติ แรงค์ ข่าว ตารางแข่ง ต้องมี API key ฟรี (ใส่ HENRIK_API_KEY ใน .env)
//  • valorant-api.com — ข้อมูลปืน/ไอคอนแรงค์ ไม่ต้องใช้ key
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ComponentType,
  ContainerBuilder,
  EmbedBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  SectionBuilder,
  SlashCommandBuilder,
  ThumbnailBuilder,
} from 'discord.js';
import { db, save } from '../db.js';
import { EPHEMERAL, V2, divider, text } from '../util.js';

const HENRIK = 'https://api.henrikdev.xyz';
const CONTENT = 'https://valorant-api.com/v1';
const REGIONS = ['ap', 'na', 'eu', 'kr', 'br', 'latam'];
const NO_PING = { parse: [] };
const RED = 0xff4655; // สีแบรนด์ Valorant

const apiKey = () => process.env.HENRIK_API_KEY;
const defaultRegion = () => (process.env.VALORANT_DEFAULT_REGION || 'ap').toLowerCase();
const links = () => (db.valorant ??= { links: {} }).links;

const MODES = {
  competitive: 'Competitive',
  unrated: 'Unrated',
  swiftplay: 'Swiftplay',
  spikerush: 'Spike Rush',
  premier: 'Premier',
};
const regionChoices = REGIONS.map((r) => ({ name: r.toUpperCase(), value: r }));
const modeChoices = [{ name: 'ทุกโหมด', value: 'all' }, ...Object.entries(MODES).map(([value, name]) => ({ name, value }))];

// ตัวเลือกร่วมของคำสั่งสถิติ (agentstats / weaponstats)
const statOptions = (s) =>
  s
    .addStringOption((o) => o.setName('riot_id').setDescription('Riot ID เช่น Name#TAG (ไม่ใส่ = ใช้บัญชีที่ผูกไว้)').setMaxLength(40))
    .addUserOption((o) => o.setName('user').setDescription('ดูของเพื่อนที่ผูกบัญชีไว้'))
    .addStringOption((o) => o.setName('region').setDescription('เซิร์ฟเวอร์').addChoices(...regionChoices))
    .addStringOption((o) => o.setName('mode').setDescription('โหมดที่จะนับ (ค่าเริ่มต้น ทุกโหมด)').addChoices(...modeChoices))
    .addIntegerOption((o) => o.setName('matches').setDescription('จำนวนแมตช์ล่าสุดที่นับ 1-30 (ค่าเริ่มต้น 20)').setMinValue(1).setMaxValue(30));

export const commands = [
  new SlashCommandBuilder()
    .setName('valorant')
    .setDescription('Valorant: สถิติ แรงค์ ข่าว ตารางแข่ง และข้อมูลปืน')
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName('link')
        .setDescription('ผูกบัญชี Riot ของคุณ เพื่อใช้ /valorant stats ได้โดยไม่ต้องพิมพ์ชื่อ')
        .addStringOption((o) => o.setName('riot_id').setDescription('Riot ID เช่น Name#TAG').setRequired(true).setMaxLength(40))
        .addStringOption((o) => o.setName('region').setDescription('เซิร์ฟเวอร์ (ไม่เลือก = ตรวจให้อัตโนมัติ)').addChoices(...regionChoices)),
    )
    .addSubcommand((s) => s.setName('unlink').setDescription('เลิกผูกบัญชี Riot ของคุณ'))
    .addSubcommand((s) =>
      s
        .setName('stats')
        .setDescription('ดูแรงค์ KDA ACS ADR HS% และแมตช์ล่าสุด')
        .addStringOption((o) => o.setName('riot_id').setDescription('Riot ID เช่น Name#TAG (ไม่ใส่ = ใช้บัญชีที่ผูกไว้)').setMaxLength(40))
        .addUserOption((o) => o.setName('user').setDescription('ดูของเพื่อนที่ผูกบัญชีไว้'))
        .addStringOption((o) => o.setName('region').setDescription('เซิร์ฟเวอร์').addChoices(...regionChoices))
        .addStringOption((o) => o.setName('mode').setDescription('โหมดที่จะนับสถิติ (ค่าเริ่มต้น Competitive)').addChoices(...modeChoices))
        .addIntegerOption((o) => o.setName('matches').setDescription('จำนวนแมตช์ล่าสุดที่นับ 1-10 (ค่าเริ่มต้น 10)').setMinValue(1).setMaxValue(10)),
    )
    .addSubcommand((s) =>
      s
        .setName('lastmatch')
        .setDescription('ดูสกอร์บอร์ดของแมตช์ล่าสุด')
        .addStringOption((o) => o.setName('riot_id').setDescription('Riot ID เช่น Name#TAG (ไม่ใส่ = ใช้บัญชีที่ผูกไว้)').setMaxLength(40))
        .addUserOption((o) => o.setName('user').setDescription('ดูของเพื่อนที่ผูกบัญชีไว้'))
        .addStringOption((o) => o.setName('region').setDescription('เซิร์ฟเวอร์').addChoices(...regionChoices))
        .addStringOption((o) => o.setName('mode').setDescription('โหมด (ค่าเริ่มต้น ทุกโหมด)').addChoices(...modeChoices)),
    )
    .addSubcommand((s) =>
      s
        .setName('news')
        .setDescription('ข่าวสารและอัปเดตล่าสุดจากเว็บ Valorant (แพตช์โน้ต เอเจนต์ใหม่ ปืนใหม่ ฯลฯ)')
        .addStringOption((o) => o.setName('category').setDescription('หมวดข่าว (ไม่เลือก = ทั้งหมด)').setAutocomplete(true))
        .addStringOption((o) =>
          o.setName('lang').setDescription('ภาษา (ค่าเริ่มต้น ไทย)').addChoices({ name: 'ไทย', value: 'th' }, { name: 'English', value: 'en' }),
        ),
    )
    .addSubcommand((s) => statOptions(s.setName('agentstats').setDescription('สถิติแยกตามเอเจนต์ (เล่นกี่เกม ชนะกี่ % K/D/A ฯลฯ)')))
    .addSubcommand((s) => statOptions(s.setName('weaponstats').setDescription('สถิติแยกตามปืน (คิล K/D อัตราซื้อ)')))
    .addSubcommand((s) => s.setName('emojis').setDescription('(แอดมิน) สร้างอีโมจิแรงค์/เอเจนต์ให้บอท ใช้ครั้งเดียว'))
    .addSubcommand((s) =>
      s
        .setName('newsfeed')
        .setDescription('ตั้งช่องให้บอทโพสต์ข่าว Valorant ใหม่อัตโนมัติ (ต้องมีสิทธิ์จัดการเซิร์ฟเวอร์)')
        .addStringOption((o) =>
          o
            .setName('action')
            .setDescription('ต้องการทำอะไร')
            .setRequired(true)
            .addChoices({ name: 'เปิด / เปลี่ยนช่อง', value: 'on' }, { name: 'ปิด', value: 'off' }, { name: 'ดูสถานะ', value: 'status' }, { name: 'ทดสอบ (ส่งข่าวล่าสุดเข้าช่อง)', value: 'test' }),
        )
        .addChannelOption((o) => o.setName('channel').setDescription('ช่องที่จะโพสต์ (ไม่เลือก = ช่องนี้)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
        .addRoleOption((o) => o.setName('role').setDescription('role ที่จะแท็กเมื่อมีข่าวใหม่ (ไม่บังคับ)'))
        .addStringOption((o) => o.setName('lang').setDescription('ภาษา (ค่าเริ่มต้น ไทย)').addChoices({ name: 'ไทย', value: 'th' }, { name: 'English', value: 'en' })),
    )
    .addSubcommand((s) =>
      s
        .setName('matches')
        .setDescription('รายการแข่ง Valorant Esports ที่กำลังจะเกิดขึ้นและกำลังแข่งอยู่')
        .addStringOption((o) => o.setName('league').setDescription('กรองตามลีก เช่น VCT (ไม่เลือก = ทั้งหมด)').setAutocomplete(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('weapon')
        .setDescription('ข้อมูลปืน: ราคา อัตรายิง ดาเมจตามระยะ (ไม่ใส่ชื่อ = ดูรายการทั้งหมด)')
        .addStringOption((o) => o.setName('name').setDescription('ชื่อปืน เช่น Vandal').setAutocomplete(true)),
    ),
];

// ---------- เรียก API ----------
class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

const NO_KEY_MSG =
  '🔑 ยังไม่ได้ตั้งค่า **HENRIK_API_KEY** ในไฟล์ .env\nขอ key ฟรีได้ที่ช่อง #get-a-key ในดิสคอร์ด HenrikDev (เลือก "VALORANT (Basic Key)") แล้วรีสตาร์ตบอท';

const cache = new Map(); // url -> { exp, data }
const MAX_CACHE = 300;

function remember(url, data, ttl) {
  cache.set(url, { exp: Date.now() + ttl, data });
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
}
const peek = (url) => {
  const hit = cache.get(url);
  return hit && hit.exp > Date.now() ? hit.data : null;
};

function httpError(res) {
  switch (res.status) {
    case 401:
      return new ApiError('🔑 API key ไม่ถูกต้องหรือหมดอายุ ตรวจสอบ **HENRIK_API_KEY** ใน .env', 401);
    case 403:
      return new ApiError('⛔ บริการข้อมูลปฏิเสธการเชื่อมต่อ (Riot อาจกำลังปิดปรับปรุง/อัปเดตแพตช์) ลองใหม่ภายหลัง', 403);
    case 404:
      return new ApiError('ไม่พบข้อมูล', 404);
    case 408:
      return new ApiError('⏳ ดึงข้อมูลจาก Riot ช้าเกินไป ลองใหม่อีกครั้ง', 408);
    case 429: {
      const wait = Number(res.headers.get('x-ratelimit-reset') ?? res.headers.get('retry-after'));
      return new ApiError(`🚦 ใช้งานถี่เกินไป ${Number.isFinite(wait) && wait > 0 ? `รออีกประมาณ ${Math.ceil(wait)} วินาที` : 'รอสักครู่'}แล้วลองใหม่`, 429);
    }
    default:
      return new ApiError(res.status >= 500 ? `🛠️ บริการข้อมูลหรือ Riot ขัดข้องชั่วคราว ลองใหม่ภายหลัง (HTTP ${res.status})` : `เรียกข้อมูลไม่สำเร็จ (HTTP ${res.status})`, res.status);
  }
}

// auth=true ใช้ HENRIK_API_KEY | คืนค่า json.data (ถ้ามี) | ผลลัพธ์ถูกแคชตาม ttl เพื่อประหยัดโควต้า
async function getJson(url, { auth = true, ttl = 120_000, timeout = 12_000 } = {}) {
  const hit = peek(url);
  if (hit) return hit;
  if (auth && !apiKey()) throw new ApiError(NO_KEY_MSG, 0);

  let res;
  try {
    res = await fetch(url, {
      headers: { Accept: 'application/json', ...(auth ? { Authorization: apiKey() } : {}) },
      signal: AbortSignal.timeout(timeout),
    });
  } catch {
    throw new ApiError('🌐 เชื่อมต่อบริการข้อมูลไม่ได้ (หมดเวลา) ลองใหม่อีกครั้ง', 0);
  }
  if (!res.ok) throw httpError(res);

  const json = await res.json().catch(() => null);
  if (json == null) throw new ApiError('ข้อมูลที่ได้กลับมาอ่านไม่ได้ ลองใหม่อีกครั้ง', res.status);
  const data = json.data !== undefined ? json.data : json;
  remember(url, data, ttl);
  return data;
}

const enc = encodeURIComponent;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- ตัวช่วย ----------
function parseRiotId(raw) {
  const i = raw.lastIndexOf('#');
  if (i < 1) return null;
  const name = raw.slice(0, i).trim();
  const tag = raw.slice(i + 1).trim();
  if (!name || name.length > 32 || !/^[A-Za-z0-9]{2,6}$/.test(tag)) return null;
  return { name, tag };
}

const ts = (iso) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
};
const when = (iso) => {
  const t = ts(iso);
  return t ? `<t:${t}:R>` : '';
};
const trunc = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s ?? '');
const fmt1 = (n) => (Number.isFinite(n) ? n.toFixed(2) : '-');
const mdSafe = (s) => String(s ?? '').replace(/([\\*_`~|<>[\]])/g, '\\$1');
const httpsUrl = (u) => (typeof u === 'string' && u.startsWith('https://') ? u : null);

function replyError(i, err) {
  const msg = err instanceof ApiError ? err.message : '❌ เกิดข้อผิดพลาดที่ไม่คาดคิด ลองใหม่อีกครั้ง';
  if (!(err instanceof ApiError)) console.error('valorant error:', err);
  return i.deferred || i.replied ? i.editReply({ content: msg, allowedMentions: NO_PING }) : i.reply({ content: msg, ...EPHEMERAL, allowedMentions: NO_PING });
}

const card = (color = RED) => new ContainerBuilder().setAccentColor(color);
const send = (c) => ({ components: [c], flags: V2, allowedMentions: NO_PING });

function withThumb(c, content, url) {
  const t = httpsUrl(url);
  if (t) c.addSectionComponents(new SectionBuilder().addTextDisplayComponents(text(content)).setThumbnailAccessory(new ThumbnailBuilder().setURL(t)));
  else c.addTextDisplayComponents(text(content));
  return c;
}

// ไอคอน/สีแรงค์จาก valorant-api.com (ใช้ชุดล่าสุด) — ถ้าดึงไม่ได้ก็แค่ไม่มีไอคอน
async function tierInfo(tierId) {
  try {
    const data = await getJson(`${CONTENT}/competitivetiers`, { auth: false, ttl: 6 * 3600_000, timeout: 6_000 });
    const latest = Array.isArray(data) ? data.at(-1) : null;
    return latest?.tiers?.find((t) => t.tier === tierId) ?? null;
  } catch {
    return null;
  }
}

// ---------- ผูกบัญชี ----------
async function linkCommand(i) {
  const id = parseRiotId(i.options.getString('riot_id', true));
  if (!id) return i.reply({ content: '❌ รูปแบบ Riot ID ไม่ถูกต้อง ต้องเป็น `Name#TAG` เช่น `Neko#TH1`', ...EPHEMERAL });
  await i.deferReply(EPHEMERAL);
  try {
    const acc = await getJson(`${HENRIK}/valorant/v2/account/${enc(id.name)}/${enc(id.tag)}`, { ttl: 5 * 60_000 });
    const region = i.options.getString('region') ?? (REGIONS.includes(acc.region) ? acc.region : defaultRegion());
    links()[i.user.id] = { name: acc.name ?? id.name, tag: acc.tag ?? id.tag, region };
    save();
    return i.editReply(`✅ ผูกบัญชี **${mdSafe(acc.name ?? id.name)}#${mdSafe(acc.tag ?? id.tag)}** (${region.toUpperCase()}) แล้ว ต่อไปพิมพ์ \`/valorant stats\` ได้เลย`);
  } catch (err) {
    if (err.status === 404) return i.editReply('❌ ไม่พบบัญชีนี้ ตรวจชื่อและแท็กอีกครั้ง (ตัวพิมพ์เล็กใหญ่ไม่ต้องตรงก็ได้)');
    return replyError(i, err);
  }
}

function unlinkCommand(i) {
  if (!links()[i.user.id]) return i.reply({ content: 'คุณยังไม่ได้ผูกบัญชีไว้นะ', ...EPHEMERAL });
  delete links()[i.user.id];
  save();
  return i.reply({ content: '🗑️ เลิกผูกบัญชีแล้ว', ...EPHEMERAL });
}

// ---------- หา Riot ID ที่จะดู ----------
function resolveTarget(i) {
  const raw = i.options.getString('riot_id');
  const user = i.options.getUser('user');
  const regionOpt = i.options.getString('region');

  if (raw) {
    const id = parseRiotId(raw);
    if (!id) return { error: '❌ รูปแบบ Riot ID ไม่ถูกต้อง ต้องเป็น `Name#TAG` เช่น `Neko#TH1`' };
    return { ...id, region: regionOpt ?? links()[i.user.id]?.region ?? defaultRegion() };
  }
  const owner = user ?? i.user;
  const link = links()[owner.id];
  if (!link) {
    return { error: user ? `${user.displayName ?? user.username} ยังไม่ได้ผูกบัญชี ให้เขาใช้ \`/valorant link\` ก่อน หรือพิมพ์ Riot ID เอง` : 'ใส่ Riot ID (`Name#TAG`) หรือผูกบัญชีไว้ก่อนด้วย `/valorant link`' };
  }
  return { name: link.name, tag: link.tag, region: regionOpt ?? link.region };
}

// กันกดรัวๆ จนโควต้า API หมด (โควต้านับรวมทั้งบอท)
const lastUse = new Map();
function onCooldown(userId, ms = 8_000) {
  const now = Date.now();
  if (now - (lastUse.get(userId) ?? 0) < ms) return Math.ceil((ms - (now - lastUse.get(userId))) / 1000);
  lastUse.set(userId, now);
  if (lastUse.size > 500) lastUse.delete(lastUse.keys().next().value);
  return 0;
}

// ---------- คำนวณสถิติจากแมตช์ ----------
function playerRows(matches, who) {
  const isMe = (p) =>
    (who.puuid && p.puuid === who.puuid) || (p.name?.toLowerCase() === who.name.toLowerCase() && p.tag?.toLowerCase() === who.tag.toLowerCase());
  const rows = [];
  for (const m of matches ?? []) {
    const p = m.players?.find(isMe);
    if (!p) continue;
    const mine = m.teams?.find((t) => t.team_id === p.team_id);
    const theirs = m.teams?.find((t) => t.team_id !== p.team_id);
    const rounds = m.rounds?.length || (mine ? mine.rounds.won + mine.rounds.lost : 0) || 1;
    const s = p.stats ?? {};
    const shots = (s.headshots ?? 0) + (s.bodyshots ?? 0) + (s.legshots ?? 0);
    let result = null; // 'win' | 'loss' | 'draw'
    if (mine && theirs) result = mine.won ? 'win' : theirs.won ? 'loss' : 'draw';
    rows.push({
      map: m.metadata?.map?.name ?? '?',
      queue: m.metadata?.queue?.name ?? m.metadata?.queue?.id ?? '',
      agent: p.agent?.name ?? '?',
      k: s.kills ?? 0,
      d: s.deaths ?? 0,
      a: s.assists ?? 0,
      hs: s.headshots ?? 0,
      shots,
      acs: (s.score ?? 0) / rounds,
      adr: (s.damage?.dealt ?? 0) / rounds,
      result,
      scoreText: mine ? `${mine.rounds.won}-${mine.rounds.lost}` : '',
      startedAt: m.metadata?.started_at,
      level: p.account_level,
      card: p.customization?.card,
      puuid: p.puuid,
      mates: (m.players ?? []).filter((x) => x.team_id === p.team_id && x !== p).map((x) => `${x.name}#${x.tag}`),
    });
  }
  return rows;
}

function summarize(rows) {
  const n = rows.length;
  const sum = (f) => rows.reduce((t, r) => t + f(r), 0);
  const K = sum((r) => r.k);
  const D = sum((r) => r.d);
  const A = sum((r) => r.a);
  const shots = sum((r) => r.shots);
  const decided = rows.filter((r) => r.result);
  const wins = decided.filter((r) => r.result === 'win').length;
  const losses = decided.filter((r) => r.result === 'loss').length;
  const agents = new Map();
  for (const r of rows) agents.set(r.agent, (agents.get(r.agent) ?? 0) + 1);
  return {
    n,
    kd: K / Math.max(D, 1),
    kda: (K + A) / Math.max(D, 1),
    avgK: K / n,
    avgD: D / n,
    avgA: A / n,
    acs: sum((r) => r.acs) / n,
    adr: sum((r) => r.adr) / n,
    hsPct: shots ? (sum((r) => r.hs) / shots) * 100 : 0,
    wins,
    losses,
    draws: decided.length - wins - losses,
    winRate: decided.length ? (wins / decided.length) * 100 : null,
    topAgents: [...agents.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3),
  };
}

const modeParam = (mode) => (mode && mode !== 'all' ? `&mode=${enc(mode)}` : '');
const hexColor = (h) => (typeof h === 'string' && /^[0-9a-f]{6}/i.test(h) ? parseInt(h.slice(0, 6), 16) : RED);

// ---------- /valorant stats (หน้าตาแบบ ValoTracker: embed + ช่อง inline เป็นกริด) ----------
// หมายเหตุ: Components V2 ใส่ embed/ช่อง inline ไม่ได้ การ์ดนี้จึงใช้ embed แบบคลาสสิก
const ANSI = { red: 31, green: 32, yellow: 33, blue: 34, pink: 35, cyan: 36, white: 37 };
const ansi = (s, color = 'white') => `\`\`\`ansi\n\u001b[2;${ANSI[color]}m${String(s).replace(/`/g, "'")}\u001b[0m\n\`\`\``;
const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);
const prettySeason = (s) => String(s ?? '').toUpperCase().replace(/^(E\d+)(A\d+)$/, '$1:$2');

// เพื่อนร่วมทีมที่เล่นด้วยบ่อยสุด / ชนะด้วยบ่อยสุด (ต้องเล่นด้วยกัน ≥ 2 เกม)
function teammateStats(rows) {
  const map = new Map();
  for (const r of rows) {
    for (const name of r.mates ?? []) {
      const s = map.get(name) ?? { g: 0, w: 0 };
      s.g++;
      if (r.result === 'win') s.w++;
      map.set(name, s);
    }
  }
  const list = [...map.entries()].filter(([, s]) => s.g >= 2);
  if (!list.length) return null;
  const most = list.reduce((a, b) => (b[1].g > a[1].g ? b : a));
  const best = list.reduce((a, b) => (b[1].w / b[1].g > a[1].w / a[1].g || (b[1].w / b[1].g === a[1].w / a[1].g && b[1].g > a[1].g) ? b : a));
  return { most, best };
}

async function statsCommand(i) {
  const t = resolveTarget(i);
  if (t.error) return i.reply({ content: `❌ ${t.error.replace(/^❌ /, '')}`, ...EPHEMERAL, allowedMentions: NO_PING });
  const wait = onCooldown(i.user.id);
  if (wait) return i.reply({ content: `⏳ ใจเย็นนิดนึง รออีก ${wait} วินาทีแล้วลองใหม่นะ`, ...EPHEMERAL });

  const mode = i.options.getString('mode') ?? 'competitive';
  const size = i.options.getInteger('matches') ?? 10;
  await i.deferReply();

  const base = `${enc(t.region)}/pc/${enc(t.name)}/${enc(t.tag)}`;
  const [mmrRes, matchRes] = await Promise.allSettled([
    getJson(`${HENRIK}/valorant/v3/mmr/${base}`, { ttl: 3 * 60_000 }),
    getJson(`${HENRIK}/valorant/v4/matches/${base}?size=${size}${modeParam(mode)}`, { ttl: 3 * 60_000 }),
  ]);
  for (const r of [mmrRes, matchRes]) {
    if (r.status === 'rejected' && r.reason?.status !== 404) return replyError(i, r.reason);
  }
  const mmr = mmrRes.status === 'fulfilled' ? mmrRes.value : null;
  const matches = matchRes.status === 'fulfilled' ? matchRes.value : null;
  if (!mmr && !matches) {
    return i.editReply(`❌ ไม่พบผู้เล่น **${mdSafe(t.name)}#${mdSafe(t.tag)}** ในเซิร์ฟ **${t.region.toUpperCase()}**\nตรวจชื่อ/แท็ก หรือลองเลือกเซิร์ฟ (region) ให้ตรงกับบัญชี`);
  }

  const who = { name: t.name, tag: t.tag, puuid: mmr?.account?.puuid };
  const rows = playerRows(matches, who);
  const sm = rows.length ? summarize(rows) : null;
  const cur = mmr?.current;
  const tier = await tierInfo(cur?.tier?.id ?? 0);
  const modeLabel = mode === 'all' ? 'All Modes' : MODES[mode] ?? mode;
  const displayName = `${mmr?.account?.name ?? t.name}#${mmr?.account?.tag ?? t.tag}`;

  // ----- ข้อมูลที่ใช้ซ้ำ -----
  const topAgent = sm?.topAgents[0];
  const mapCount = new Map();
  for (const r of rows) mapCount.set(r.map, (mapCount.get(r.map) ?? 0) + 1);
  const topMap = [...mapCount.entries()].sort((a, b) => b[1] - a[1])[0];
  const mates = sm ? teammateStats(rows) : null;
  const seasonal = Array.isArray(mmr?.seasonal) ? mmr.seasonal : [];
  const totalGames = seasonal.reduce((n, s) => n + (s.games ?? 0), 0);
  const totalWins = seasonal.reduce((n, s) => n + (s.wins ?? 0), 0);
  const lastTs = ts(rows[0]?.startedAt);
  const link = `https://tracker.gg/valorant/profile/riot/${enc(`${t.name}#${t.tag}`)}/overview`;

  const build = (expanded = false, disabled = false) => {
    const e = new EmbedBuilder()
      .setColor(tier ? hexColor(tier.color) : RED)
      .setAuthor({ name: `Valorant ${modeLabel} Statistics`, ...(httpsUrl(tier?.smallIcon) ? { iconURL: tier.smallIcon } : {}) })
      .setTitle(displayName)
      .setFooter({ text: 'ข้อมูลจาก HenrikDev API • ไม่ใช่ข้อมูลทางการของ Riot Games' })
      .setTimestamp();
    if (rows[0]?.card) e.setThumbnail(`https://media.valorant-api.com/playercards/${rows[0].card}/smallart.png`);

    e.setDescription(
      sm
        ? `อิงจาก **${sm.n} เกมล่าสุด** ของโหมด **${modeLabel}**\nยอดรวมทั้งหมด (Total Games) นับจาก **ทุกซีซัน**`
        : `_ไม่พบแมตช์โหมด ${modeLabel} ล่าสุด (ลองเลือก \`mode: ทุกโหมด\`)_`,
    );

    const f = [];
    const add = (name, value, inline = true) => f.push({ name, value, inline });

    if (cur) {
      const ch = cur.last_change ? ` (${cur.last_change > 0 ? '+' : ''}${cur.last_change} last game)` : '';
      add('Rank Rating (RR)', ansi(`${cur.rr ?? 0}/100${ch}`, 'green'), false);
      add('Rank', `**${mdSafe(cur.tier?.name ?? 'Unranked')}**`);
      add('Peaked Rank', mmr.peak?.tier?.name ? `**${mdSafe(mmr.peak.tier.name)}**${mmr.peak.season?.short ? `\n${prettySeason(mmr.peak.season.short)}` : ''}` : '-');
      add('Level', ansi(rows[0]?.level ?? '-', 'blue'));
    }

    if (sm) {
      add('Kills/Deaths Ratio', ansi(fmt1(sm.kd), sm.kd >= 1 ? 'green' : 'red'));
      add('Headshot %', ansi(`${sm.hsPct.toFixed(2)}%`, 'blue'));
      add('Winrate %', sm.winRate == null ? ansi('-', 'white') : ansi(`${sm.winRate.toFixed(2)}%`, sm.winRate >= 50 ? 'green' : 'red'));

      add('ACS', ansi(Math.round(sm.acs), 'yellow'));
      add('ADR', ansi(Math.round(sm.adr), 'yellow'));
      add('KDA', ansi(fmt1(sm.kda), 'blue'));

      add(topAgent ? mdSafe(topAgent[0]) : 'Agent', ansi(topAgent ? `Played ${pct(topAgent[1], sm.n)}%` : '-', 'green'));
      add(topMap ? mdSafe(topMap[0]) : 'Map', ansi(topMap ? `Played ${pct(topMap[1], sm.n)}%` : '-', 'green'));
      add('Record', ansi(`${sm.wins}W ${sm.losses}L${sm.draws ? ` ${sm.draws}D` : ''}`, 'cyan'));

      if (mates) {
        add('Highest Winrate W/', ansi(`${mates.best[0]} (${pct(mates.best[1].w, mates.best[1].g)}%)`, 'yellow'));
        add('Most Played W/', ansi(`${mates.most[0]} (${mates.most[1].g} Games)`, 'yellow'));
      }
      if (lastTs) add('Last Played', `<t:${lastTs}:R>\n<t:${lastTs}:F>`);
    }

    if (totalGames) {
      add('Total Competitive Games', ansi(`${totalGames} Games`, 'pink'));
      add('Total Competitive Wins', ansi(`${totalWins} Wins (${pct(totalWins, totalGames)}%)`, 'pink'));
    }

    if (expanded && rows.length) {
      const icon = { win: '✅', loss: '❌', draw: '➖', null: '▫️' };
      const list = rows.map((r) => `${icon[r.result]} **${mdSafe(r.map)}** ${r.scoreText} • ${mdSafe(r.agent)} • ${r.k}/${r.d}/${r.a} • ACS ${Math.round(r.acs)} ${when(r.startedAt)}`);
      let out = '';
      for (const l of list) if ((out + l).length < 1000) out += `${l}\n`;
      add('แมตช์ล่าสุด', out.trim() || '-', false);
    }
    add('TIP', 'ดูสกอร์บอร์ดทั้งแมตช์ได้ด้วย `/valorant lastmatch`', false);
    e.addFields(f);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('vs_expand').setLabel(expanded ? 'Collapse' : 'Expand').setEmoji(expanded ? '🔼' : '🔽').setStyle(ButtonStyle.Primary).setDisabled(disabled),
      new ButtonBuilder().setCustomId('vs_remove').setLabel('Remove').setEmoji('🗑️').setStyle(ButtonStyle.Danger).setDisabled(disabled),
      new ButtonBuilder().setLabel('tracker.gg').setStyle(ButtonStyle.Link).setURL(link),
    );
    return { embeds: [e], components: [row], allowedMentions: NO_PING };
  };

  let expanded = false;
  const msg = await i.editReply(build(false));

  // ปุ่ม Expand/Remove ใช้ได้เฉพาะคนที่พิมพ์คำสั่ง (5 นาที) — ไม่ต้องไปแก้ index.js
  const col = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 5 * 60_000, filter: (x) => x.user.id === i.user.id });
  col.on('collect', async (x) => {
    if (x.customId === 'vs_remove') {
      col.stop('removed');
      return x.deferUpdate().then(() => i.deleteReply()).catch(() => {});
    }
    expanded = !expanded;
    return x.update(build(expanded)).catch(() => {});
  });
  col.on('ignore', (x) => x.reply({ content: 'ปุ่มนี้ใช้ได้เฉพาะคนที่พิมพ์คำสั่งนะ', ...EPHEMERAL }).catch(() => {}));
  col.on('end', (_, reason) => {
    if (reason !== 'removed') i.editReply(build(expanded, true)).catch(() => {});
  });
}

// ---------- อีโมจิ แรงค์/เอเจนต์/คลาส (Application Emojis ของบอท) ----------
// อีโมจิยังไม่มี = ข้อความธรรมดาแทน ไม่พัง | สร้างครั้งเดียวด้วย /valorant emojis (แอดมิน)
const slug = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const emojiStore = () => ((db.valorant ??= { links: {} }).emojis ??= {});
const agentEmoji = (name) => emojiStore()[`va_${slug(name)}`] ?? '';
const rankEmoji = (id) => emojiStore()[`vr_${id}`] ?? '';
const roleEmoji = (role) => emojiStore()[`vc_${slug(role)}`] ?? '';

async function emojisCommand(i) {
  if (!i.memberPermissions?.has(PermissionFlagsBits.Administrator)) return i.reply({ content: '⛔ ต้องเป็นแอดมินเซิร์ฟเวอร์', ...EPHEMERAL });
  if (!i.client.application?.emojis) return i.reply({ content: '❌ discord.js เวอร์ชันนี้ยังไม่รองรับ Application Emojis (ต้อง 14.17 ขึ้นไป) → `npm i discord.js@latest`', ...EPHEMERAL });
  await i.deferReply(EPHEMERAL);
  try {
    const [agents, tiers] = await Promise.all([
      getJson(`${CONTENT}/agents?isPlayableCharacter=true`, { auth: false, ttl: 6 * 3600_000, timeout: 10_000 }),
      getJson(`${CONTENT}/competitivetiers`, { auth: false, ttl: 6 * 3600_000, timeout: 10_000 }),
    ]);
    const wanted = new Map();
    for (const a of agents ?? []) {
      if (a.displayIcon) wanted.set(`va_${slug(a.displayName)}`, a.displayIcon);
      if (a.role?.displayIcon) wanted.set(`vc_${slug(a.role.displayName)}`, a.role.displayIcon);
    }
    for (const t of (Array.isArray(tiers) ? tiers.at(-1)?.tiers : null) ?? []) if (t.tier >= 3 && t.smallIcon) wanted.set(`vr_${t.tier}`, t.smallIcon);

    const store = emojiStore();
    const existing = await i.client.application.emojis.fetch();
    for (const e of existing.values()) if (/^v[arc]_/.test(e.name)) store[e.name] = `<:${e.name}:${e.id}>`;

    const todo = [...wanted].filter(([name]) => !store[name]);
    let added = 0;
    const failed = [];
    for (const [name, url] of todo) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        const e = await i.client.application.emojis.create({ attachment: Buffer.from(await res.arrayBuffer()), name });
        store[e.name] = `<:${e.name}:${e.id}>`;
        added++;
      } catch (err) {
        failed.push(name);
        console.error('valorant emoji', name, err.message);
      }
      await sleep(700);
    }
    save();
    return i.editReply(`✅ พร้อมใช้ ${Object.keys(store).length} อีโมจิ (เพิ่มใหม่ ${added}${failed.length ? ` • ล้มเหลว ${failed.length}: ${failed.slice(0, 8).join(', ')}` : ''})`);
  } catch (err) {
    return replyError(i, err);
  }
}

// ---------- ตัวช่วยร่วม ----------
const BLUE = 0x3498db;
const TEAM_SQ = { Blue: '🟦', Red: '🟥' };
const PARTY_DOT = ['🔴', '🔵', '🟢', '🟡', '🟣', '🟠'];
const RESULT_TH = { Elimination: 'กำจัดครบทีม', Detonate: 'สไปก์ระเบิด', Defuse: 'ปลดสไปก์สำเร็จ', Surrendered: 'ยอมแพ้', 'Round timer expired': 'หมดเวลา' };
const clock = (ms) => `${Math.floor((ms ?? 0) / 60000)}:${String(Math.floor((ms ?? 0) / 1000) % 60).padStart(2, '0')}`;
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, k) => arr.slice(k * n, k * n + n));
const meMatcher = (who) => (p) => (who.puuid && p.puuid === who.puuid) || (p.name?.toLowerCase() === who.name.toLowerCase() && p.tag?.toLowerCase() === who.tag.toLowerCase());
const trackerLink = (name, tag) => `https://tracker.gg/valorant/profile/riot/${enc(`${name}#${tag}`)}/overview`;
const modeText = (mode) => (mode === 'all' ? 'ทุกโหมด' : MODES[mode] ?? mode);

// ตารางตัวเลขในกล่อง ansi: cols = [[หัวข้อ, ค่า], ...]
function table(cols) {
  const w = cols.map(([l, v]) => Math.max(l.length, String(v).length));
  const head = cols.map(([l], k) => l.padEnd(w[k])).join(' | ');
  const val = cols.map(([, v], k) => String(v).padEnd(w[k])).join(' | ');
  return `\`\`\`ansi\n\u001b[2;34m${head}\u001b[0m\n\u001b[2;33m${val}\u001b[0m\n\`\`\``;
}

// แถบสี 20 ช่องตามสัดส่วน: parts = [[สี, จำนวน], ...]
function colorBar(parts, len = 20) {
  const total = parts.reduce((n, [, c]) => n + c, 0);
  if (!total) return '';
  const widths = parts.map(([, c]) => Math.max(c > 0 ? 1 : 0, Math.round((c / total) * len)));
  let diff = len - widths.reduce((a, b) => a + b, 0);
  const big = widths.indexOf(Math.max(...widths));
  widths[big] = Math.max(1, widths[big] + diff);
  return parts.map(([sq], k) => sq.repeat(widths[k])).join('');
}

// เลื่อนหน้า: << < 1/3 > >> + Remove (ใช้ได้เฉพาะคนสั่ง 10 นาที)
async function paginate(i, pages, link) {
  let idx = 0;
  const rows = (disabled = false) => {
    const last = pages.length - 1;
    const out = [];
    if (pages.length > 1) {
      out.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('pg_first').setLabel('<<').setStyle(ButtonStyle.Primary).setDisabled(disabled || idx === 0),
          new ButtonBuilder().setCustomId('pg_prev').setLabel('<').setStyle(ButtonStyle.Success).setDisabled(disabled || idx === 0),
          new ButtonBuilder().setCustomId('pg_count').setLabel(`${idx + 1}/${pages.length}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
          new ButtonBuilder().setCustomId('pg_next').setLabel('>').setStyle(ButtonStyle.Success).setDisabled(disabled || idx === last),
          new ButtonBuilder().setCustomId('pg_last').setLabel('>>').setStyle(ButtonStyle.Primary).setDisabled(disabled || idx === last),
        ),
      );
    }
    out.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('pg_remove').setLabel('Remove').setEmoji('🗑️').setStyle(ButtonStyle.Danger).setDisabled(disabled),
        new ButtonBuilder().setLabel('tracker.gg').setStyle(ButtonStyle.Link).setURL(link),
      ),
    );
    return out;
  };
  const view = (disabled) => ({ embeds: [pages[idx]], components: rows(disabled), allowedMentions: NO_PING });

  const msg = await i.editReply(view(false));
  const col = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 10 * 60_000, filter: (x) => x.user.id === i.user.id });
  col.on('collect', async (x) => {
    if (x.customId === 'pg_remove') {
      col.stop('removed');
      return x.deferUpdate().then(() => i.deleteReply()).catch(() => {});
    }
    if (x.customId === 'pg_first') idx = 0;
    else if (x.customId === 'pg_prev') idx = Math.max(0, idx - 1);
    else if (x.customId === 'pg_next') idx = Math.min(pages.length - 1, idx + 1);
    else if (x.customId === 'pg_last') idx = pages.length - 1;
    return x.update(view(false)).catch(() => {});
  });
  col.on('ignore', (x) => x.reply({ content: 'ปุ่มนี้ใช้ได้เฉพาะคนที่พิมพ์คำสั่งนะ', ...EPHEMERAL }).catch(() => {}));
  col.on('end', (_, reason) => {
    if (reason !== 'removed') i.editReply(view(true)).catch(() => {});
  });
}

// ---------- ดึงแมตช์หลายหน้า + หาตัวผู้เล่น ----------
async function fetchMatches(base, mode, total) {
  const out = [];
  for (let start = 0; start < total; start += 10) {
    const size = Math.min(10, total - start);
    try {
      const page = await getJson(`${HENRIK}/valorant/v4/matches/${base}?size=${size}&start=${start}${modeParam(mode)}`, { ttl: 3 * 60_000 });
      if (!Array.isArray(page) || !page.length) break;
      out.push(...page);
      if (page.length < size) break;
    } catch (err) {
      if (start === 0) throw err;
      break; // หน้าหลังพังก็ใช้เท่าที่ได้
    }
  }
  return out;
}

function locate(matches, who) {
  const isMe = meMatcher(who);
  const out = [];
  for (const m of matches ?? []) {
    const p = m.players?.find(isMe);
    if (!p) continue;
    const mine = m.teams?.find((t) => t.team_id === p.team_id);
    const rounds = m.rounds?.length || (mine ? (mine.rounds?.won ?? 0) + (mine.rounds?.lost ?? 0) : 0) || 1;
    out.push({ m, p, rounds, won: mine ? !!mine.won : null });
  }
  return out;
}

async function loadMyMatches(i) {
  const t = resolveTarget(i);
  if (t.error) {
    await i.reply({ content: `❌ ${t.error.replace(/^❌ /, '')}`, ...EPHEMERAL, allowedMentions: NO_PING });
    return null;
  }
  const wait = onCooldown(i.user.id);
  if (wait) {
    await i.reply({ content: `⏳ ใจเย็นนิดนึง รออีก ${wait} วินาทีแล้วลองใหม่นะ`, ...EPHEMERAL });
    return null;
  }
  const mode = i.options.getString('mode') ?? 'all';
  const total = i.options.getInteger('matches') ?? 20;
  await i.deferReply();
  try {
    const matches = await fetchMatches(`${enc(t.region)}/pc/${enc(t.name)}/${enc(t.tag)}`, mode, total);
    const entries = locate(matches, { name: t.name, tag: t.tag });
    if (!entries.length) {
      await i.editReply(`😿 ไม่พบแมตช์ของ **${mdSafe(t.name)}#${mdSafe(t.tag)}** ในโหมด ${modeText(mode)} (ลองเลือก \`mode: ทุกโหมด\`)`);
      return null;
    }
    return { t, mode, entries, link: trackerLink(t.name, t.tag) };
  } catch (err) {
    if (err.status === 404) await i.editReply(`❌ ไม่พบผู้เล่น **${mdSafe(t.name)}#${mdSafe(t.tag)}** ในเซิร์ฟ **${t.region.toUpperCase()}**`);
    else await replyError(i, err);
    return null;
  }
}

function statEmbed(kind, d) {
  const e = new EmbedBuilder()
    .setColor(RED)
    .setAuthor({ name: `Valorant ${kind} Statistics` })
    .setTitle(`${d.t.name}#${d.t.tag}`)
    .setDescription(`อิงจาก **${d.entries.length} เกมล่าสุด** (${modeText(d.mode)})${kind === 'Agents' ? '\nค่า K / D / A / Plants / Defuses เฉลี่ยต่อ **20 รอบ**' : '\nKills/Round = คิลต่อรอบที่ซื้อ/ถือปืนนั้น • Died to = ตายตอนถือปืนนั้น'}`)
    .setFooter({ text: 'ข้อมูลจาก HenrikDev API • ไม่ใช่ข้อมูลทางการของ Riot Games' })
    .setTimestamp();
  const card = d.entries[0].p.customization?.card;
  if (card) e.setThumbnail(`https://media.valorant-api.com/playercards/${card}/smallart.png`);
  return e;
}

// ---------- /valorant agentstats ----------
async function agentRoleMap() {
  try {
    const data = await getJson(`${CONTENT}/agents?isPlayableCharacter=true`, { auth: false, ttl: 6 * 3600_000, timeout: 8_000 });
    return new Map((Array.isArray(data) ? data : []).map((a) => [a.displayName, a.role?.displayName ?? '']));
  } catch {
    return new Map();
  }
}
const ROLE_SQ = { Controller: '🟥', Sentinel: '🟦', Initiator: '🟩', Duelist: '🟨' };

async function agentStatsCommand(i) {
  const d = await loadMyMatches(i);
  if (!d) return;
  try {
    const roles = await agentRoleMap();
    const by = new Map();
    for (const { m, p, rounds, won } of d.entries) {
      const name = p.agent?.name ?? '?';
      const a = by.get(name) ?? { name, g: 0, w: 0, l: 0, rounds: 0, k: 0, dd: 0, a: 0, score: 0, plants: 0, defuses: 0 };
      a.g++;
      if (won === true) a.w++;
      else if (won === false) a.l++;
      a.rounds += rounds;
      a.k += p.stats?.kills ?? 0;
      a.dd += p.stats?.deaths ?? 0;
      a.a += p.stats?.assists ?? 0;
      a.score += p.stats?.score ?? 0;
      for (const r of m.rounds ?? []) {
        if (r.plant?.player && meMatcher({ puuid: p.puuid, name: p.name, tag: p.tag })(r.plant.player)) a.plants++;
        if (r.defuse?.player && meMatcher({ puuid: p.puuid, name: p.name, tag: p.tag })(r.defuse.player)) a.defuses++;
      }
      by.set(name, a);
    }
    const list = [...by.values()].sort((x, y) => y.g - x.g);
    const totalGames = d.entries.length;
    const legend = [...new Set(list.map((a) => roles.get(a.name)).filter(Boolean))].map((r) => `${ROLE_SQ[r] ?? '⬜'} ${roleEmoji(r)} ${r}`).join('  ');
    const roleCount = new Map();
    for (const a of list) {
      const r = roles.get(a.name) ?? '?';
      roleCount.set(r, (roleCount.get(r) ?? 0) + a.g);
    }
    const bar = colorBar([...roleCount].map(([r, c]) => [ROLE_SQ[r] ?? '⬜', c]));

    const pages = chunk(list, 3).map((group, pi) => {
      const e = statEmbed('Agents', d);
      group.forEach((a, k) => {
        const f = 20 / a.rounds;
        const role = roles.get(a.name) ?? '';
        const decided = a.w + a.l;
        e.addFields(
          {
            name: `#${pi * 3 + k + 1} ${agentEmoji(a.name)} ${a.name}${role ? ` (${roleEmoji(role)} ${role})` : ''}`.replace(/\s+/g, ' ').replace('( ', '(').trim(),
            value:
              table([
                ['Played', a.g],
                ['W/L%', decided ? `${((a.w / decided) * 100).toFixed(2)}%` : '-'],
                ['Plants', (a.plants * f).toFixed(2)],
                ['Defuses', (a.defuses * f).toFixed(2)],
                ['Played %', `${((a.g / totalGames) * 100).toFixed(2)}%`],
              ]) +
              '\n' +
              table([
                ['K', Math.round(a.k * f)],
                ['D', Math.round(a.dd * f)],
                ['A', Math.round(a.a * f)],
                ['Combat Score', Math.round(a.score / a.rounds)],
                ['K/D', (a.k / Math.max(a.dd, 1)).toFixed(2)],
              ]),
            inline: false,
          },
        );
      });
      e.addFields({ name: '\u200b', value: `${legend}\n${bar}`.trim() || '\u200b', inline: false });
      return e;
    });
    return paginate(i, pages, d.link);
  } catch (err) {
    return replyError(i, err);
  }
}

// ---------- /valorant weaponstats ----------
const WEAPON_SQ = ['🟥', '🟦', '🟩', '🟨'];

async function weaponStatsCommand(i) {
  const d = await loadMyMatches(i);
  if (!d) return;
  try {
    const by = new Map();
    let totalRounds = 0;
    for (const { m, p } of d.entries) {
      const isMe = (x) => x && ((p.puuid && x.puuid === p.puuid) || (x.name === p.name && x.tag === p.tag));
      const heldIn = new Map(); // รอบ -> ปืนที่ถืออยู่ (จากที่ซื้อ/ถือต้นรอบ)
      (m.rounds ?? []).forEach((r, idx) => {
        totalRounds++;
        const me = r.stats?.find((s) => isMe(s.player));
        const w = me?.economy?.weapon;
        if (!w?.name) return;
        heldIn.set(idx, w.name);
        const rec = by.get(w.name) ?? { name: w.name, type: w.type ?? '', kills: 0, died: 0, bought: 0 };
        rec.bought++;
        if (w.type && !rec.type) rec.type = w.type;
        by.set(w.name, rec);
      });
      for (const k of m.kills ?? []) {
        const wk = k.weapon;
        if (isMe(k.killer) && wk?.name && wk.type !== 'Ability') {
          const rec = by.get(wk.name) ?? { name: wk.name, type: wk.type ?? '', kills: 0, died: 0, bought: 0 };
          rec.kills++;
          by.set(wk.name, rec);
        }
        if (isMe(k.victim)) {
          const held = heldIn.get(k.round);
          if (held && by.has(held)) by.get(held).died++;
        }
      }
    }
    const list = [...by.values()].filter((w) => w.kills || w.bought).sort((a, b) => b.kills - a.kills || b.bought - a.bought);
    if (!list.length) return i.editReply('😿 ไม่พบข้อมูลปืนในแมตช์เหล่านี้ (API อาจยังไม่ส่งข้อมูลรอบ/คิลมาให้)');

    const top = list.slice(0, 4);
    const legend = top.map((w, k) => `${WEAPON_SQ[k]} ${w.name}`).join(', ');
    const bar = colorBar(top.map((w, k) => [WEAPON_SQ[k], w.kills]));

    const pages = chunk(list, 3).map((group, pi) => {
      const e = statEmbed('Weapons', d);
      group.forEach((w, k) => {
        e.addFields({
          name: `#${pi * 3 + k + 1} ${w.name}${w.type ? ` (${w.type})` : ''}`,
          value: table([
            ['Kills', w.kills],
            ['Died to', w.died],
            ['K/D', (w.kills / Math.max(w.died, 1)).toFixed(2)],
            ['Kills/Round', (w.kills / Math.max(w.bought, 1)).toFixed(2)],
            ['Bought %', `${((w.bought / Math.max(totalRounds, 1)) * 100).toFixed(2)}%`],
          ]),
          inline: false,
        });
      });
      e.addFields({ name: '\u200b', value: `${legend}\n${bar}`, inline: false });
      return e;
    });
    return paginate(i, pages, d.link);
  } catch (err) {
    return replyError(i, err);
  }
}

// ---------- /valorant lastmatch (หน้าตาแบบ ValoTracker) ----------
function matchEmbed(m, me) {
  const md = m.metadata ?? {};
  const rounds = m.rounds?.length ?? 0;
  const lenMs = md.game_length_in_ms ?? 0;
  const startTs = ts(md.started_at);
  const endTs = startTs ? startTs + Math.round(lenMs / 1000) : null;
  const mine = m.teams?.find((t) => t.team_id === me?.team_id);
  const anyWinner = (m.teams ?? []).some((t) => t.won);
  const color = !mine ? 0x95a5a6 : mine.won ? 0x2ecc71 : anyWinner ? RED : 0x95a5a6;
  const score = (m.teams ?? []).map((t) => `${t.team_id} ${t.rounds?.won ?? 0}`).join(' - ');
  const totalRounds = Math.max(rounds, 1);

  // ปาร์ตี้ (คนที่เข้าห้องมาด้วยกัน ≥ 2 คน)
  const parties = new Map();
  for (const p of m.players ?? []) if (p.party_id) parties.set(p.party_id, [...(parties.get(p.party_id) ?? []), p]);
  const partyDot = new Map();
  [...parties.values()].filter((g) => g.length > 1).forEach((g, k) => g.forEach((p) => partyDot.set(p.puuid, PARTY_DOT[k % PARTY_DOT.length])));
  const partyLine = [...parties.values()]
    .filter((g) => g.length > 1)
    .map((g, k) => `${PARTY_DOT[k % PARTY_DOT.length]} ${g.map((p) => mdSafe(trunc(p.name, 12))).join(', ')}`)
    .join(' • ');

  const e = new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: `Valorant ${md.queue?.name ?? 'Match'}` })
    .setTitle(`${md.queue?.name ?? ''} ${md.map?.name ?? '?'} - ${rounds} รอบ`.trim())
    .setDescription(
      [
        `**(${score})**`,
        `เริ่ม ${startTs ? `<t:${startTs}:R>` : '-'}${endTs ? ` จบ <t:${endTs}:R>` : ''} ใช้เวลา **${Math.floor(lenMs / 60000)} นาที ${Math.round(lenMs / 1000) % 60} วินาที**`,
        md.match_id ? `Match ID: \`${md.match_id}\`` : '',
        partyLine ? `**Parties:** ${partyLine}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .setFooter({ text: 'ข้อมูลจาก HenrikDev API • ไม่ใช่ข้อมูลทางการของ Riot Games' })
    .setTimestamp();
  if (md.map?.id) e.setThumbnail(`https://media.valorant-api.com/maps/${md.map.id}/splash.png`);

  for (const team of m.teams ?? []) {
    const members = (m.players ?? []).filter((p) => p.team_id === team.team_id).sort((a, b) => (b.stats?.score ?? 0) - (a.stats?.score ?? 0));
    if (!members.length) continue;
    e.addFields({ name: `${TEAM_SQ[team.team_id] ?? '▫️'} ทีม ${team.team_id}${team.won ? ' 🏆' : ''} — ${team.rounds?.won ?? 0} รอบ`, value: '\u200b', inline: false });
    for (const p of members) {
      const s = p.stats ?? {};
      const shots = (s.headshots ?? 0) + (s.bodyshots ?? 0) + (s.legshots ?? 0);
      const hs = shots ? ((s.headshots ?? 0) / shots) * 100 : 0;
      const rank = rankEmoji(p.tier?.id);
      e.addFields({
        name: `${p === me ? '▶ ' : ''}${partyDot.get(p.puuid) ?? ''}${rank}${agentEmoji(p.agent?.name)} ${p.agent?.name ?? '?'}`.replace(/\s+/g, ' ').trim(),
        value:
          `**${mdSafe(trunc(p.name ?? '?', 14))}** #${mdSafe(p.tag ?? '')}\n` +
          `\`\`\`ansi\n\u001b[2;34mK/D/A\u001b[0m \u001b[2;33m${s.kills ?? 0}/${s.deaths ?? 0}/${s.assists ?? 0}\u001b[0m\n\u001b[2;34mACS\u001b[0m ${Math.round((s.score ?? 0) / totalRounds)} \u001b[2;34mHS\u001b[0m \u001b[2;33m${hs.toFixed(1)}%\u001b[0m\n\`\`\`` +
          (!rank && p.tier?.name ? `\n-# ${mdSafe(p.tier.name)}` : ''),
        inline: true,
      });
    }
  }

  if (rounds) {
    const strip = (m.rounds ?? []).map((r, idx) => `${idx === 12 || (idx > 23 && idx % 2 === 0) ? ' / ' : ''}${TEAM_SQ[r.winning_team] ?? '⬛'}`).join('');
    e.addFields({ name: 'Summary ( / = สลับข้าง )', value: trunc(strip, 1024), inline: false });
  }
  return e;
}

function roundEmbed(m, idx) {
  const r = m.rounds[idx];
  const win = r.winning_team;
  const players = new Map((m.players ?? []).map((p) => [p.puuid, p]));
  const tag = (x) => {
    const full = players.get(x?.puuid);
    return `${TEAM_SQ[x?.team ?? full?.team_id] ?? ''} **${mdSafe(trunc(x?.name ?? full?.name ?? '?', 14))}**${full?.agent?.name ? ` (${agentEmoji(full.agent.name)}${mdSafe(full.agent.name)})` : ''}`;
  };
  const loadout = {};
  for (const s of r.stats ?? []) {
    const team = s.player?.team ?? players.get(s.player?.puuid)?.team_id;
    if (team) loadout[team] = (loadout[team] ?? 0) + (s.economy?.loadout_value ?? 0);
  }
  const lines = [`ผล: **${RESULT_TH[r.result] ?? r.result ?? '-'}**`];
  if (r.plant?.player) lines.push(`💣 วางสไปก์: **${mdSafe(r.plant.player.name ?? '?')}**${r.plant.site ? ` (ไซต์ ${mdSafe(r.plant.site)})` : ''}`);
  if (r.defuse?.player) lines.push(`🔧 ปลดสไปก์: **${mdSafe(r.defuse.player.name ?? '?')}**`);
  if (Object.keys(loadout).length) lines.push(`Loadout: ${Object.entries(loadout).map(([t, v]) => `${TEAM_SQ[t] ?? t} $${v}`).join(' • ')}`);

  const kills = (m.kills ?? []).filter((k) => k.round === idx).sort((a, b) => (a.time_in_round_in_ms ?? 0) - (b.time_in_round_in_ms ?? 0));
  const feed = kills.map((k) => `\`${clock(k.time_in_round_in_ms)}\` ${tag(k.killer)} ➜ ${tag(k.victim)} • ${mdSafe(k.weapon?.name || 'Ability')}`);

  return new EmbedBuilder()
    .setColor(win === 'Blue' ? BLUE : RED)
    .setAuthor({ name: `${m.metadata?.map?.name ?? ''} • รอบที่ ${idx + 1} จาก ${m.rounds.length}` })
    .setTitle(`${TEAM_SQ[win] ?? ''} ทีม ${win ?? '?'} ชนะรอบนี้`)
    .setDescription(trunc([...lines, '', '**Kill feed**', ...(feed.length ? feed : ['_ไม่มีข้อมูลคิล_'])].join('\n'), 4000))
    .setFooter({ text: 'ข้อมูลจาก HenrikDev API' });
}

async function lastMatchCommand(i) {
  const t = resolveTarget(i);
  if (t.error) return i.reply({ content: `❌ ${t.error.replace(/^❌ /, '')}`, ...EPHEMERAL, allowedMentions: NO_PING });
  const wait = onCooldown(i.user.id);
  if (wait) return i.reply({ content: `⏳ ใจเย็นนิดนึง รออีก ${wait} วินาทีแล้วลองใหม่นะ`, ...EPHEMERAL });

  const mode = i.options.getString('mode') ?? 'all';
  await i.deferReply();
  try {
    const list = await getJson(`${HENRIK}/valorant/v4/matches/${enc(t.region)}/pc/${enc(t.name)}/${enc(t.tag)}?size=1${modeParam(mode)}`, { ttl: 3 * 60_000 });
    const m = list?.[0];
    if (!m) return i.editReply('😿 ไม่พบแมตช์ล่าสุดของผู้เล่นคนนี้ (ในโหมดที่เลือก)');

    const me = m.players?.find(meMatcher({ name: t.name, tag: t.tag }));
    const n = m.rounds?.length ?? 0;
    const overview = matchEmbed(m, me);
    const matchLink = m.metadata?.match_id ? `https://tracker.gg/valorant/match/${m.metadata.match_id}` : trackerLink(t.name, t.tag);
    let round = null; // null = หน้าสรุปแมตช์

    const comps = (disabled = false) => {
      const rows = [];
      for (let a = 0; a < n && rows.length < 3; a += 25) {
        const b = Math.min(a + 25, n);
        rows.push(
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`lm_sel_${a}`)
              .setPlaceholder(`เลือกรอบที่จะดู (${a + 1} - ${b})`)
              .setDisabled(disabled)
              .addOptions(
                Array.from({ length: b - a }, (_, k) => {
                  const idx = a + k;
                  const r = m.rounds[idx];
                  return { label: `รอบที่ ${idx + 1}`, description: `${r.winning_team ?? ''} • ${RESULT_TH[r.result] ?? r.result ?? ''}`.slice(0, 100), value: String(idx), default: round === idx };
                }),
              ),
          ),
        );
      }
      const btns =
        round === null
          ? [new ButtonBuilder().setCustomId('lm_remove').setLabel('Remove').setEmoji('🗑️').setStyle(ButtonStyle.Danger).setDisabled(disabled), new ButtonBuilder().setLabel('tracker.gg').setStyle(ButtonStyle.Link).setURL(matchLink)]
          : [
              new ButtonBuilder().setCustomId('lm_back').setLabel('สรุปแมตช์').setEmoji('📋').setStyle(ButtonStyle.Primary).setDisabled(disabled),
              new ButtonBuilder().setCustomId('lm_rprev').setLabel('<').setStyle(ButtonStyle.Success).setDisabled(disabled || round === 0),
              new ButtonBuilder().setCustomId('lm_rnext').setLabel('>').setStyle(ButtonStyle.Success).setDisabled(disabled || round === n - 1),
              new ButtonBuilder().setCustomId('lm_remove').setLabel('Remove').setEmoji('🗑️').setStyle(ButtonStyle.Danger).setDisabled(disabled),
            ];
      rows.push(new ActionRowBuilder().addComponents(...btns));
      return rows;
    };
    const render = (disabled = false) => ({ embeds: [round === null ? overview : roundEmbed(m, round)], components: comps(disabled), allowedMentions: NO_PING });

    const msg = await i.editReply(render());
    const col = msg.createMessageComponentCollector({ time: 10 * 60_000, filter: (x) => x.user.id === i.user.id });
    col.on('collect', async (x) => {
      try {
        if (x.customId === 'lm_remove') {
          col.stop('removed');
          await x.deferUpdate();
          return i.deleteReply();
        }
        if (x.isStringSelectMenu()) round = Number(x.values[0]);
        else if (x.customId === 'lm_back') round = null;
        else if (x.customId === 'lm_rprev') round = Math.max(0, (round ?? 0) - 1);
        else if (x.customId === 'lm_rnext') round = Math.min(n - 1, (round ?? -1) + 1);
        await x.update(render());
      } catch (err) {
        console.error('valorant lastmatch ui:', err.message);
      }
    });
    col.on('ignore', (x) => x.reply({ content: 'ปุ่มนี้ใช้ได้เฉพาะคนที่พิมพ์คำสั่งนะ', ...EPHEMERAL }).catch(() => {}));
    col.on('end', (_, reason) => {
      if (reason !== 'removed') i.editReply(render(true)).catch(() => {});
    });
  } catch (err) {
    if (err.status === 404) return i.editReply(`❌ ไม่พบผู้เล่น **${mdSafe(t.name)}#${mdSafe(t.tag)}** ในเซิร์ฟ **${t.region.toUpperCase()}**`);
    return replyError(i, err);
  }
}

// ---------- /valorant news ----------
const newsUrl = (locale) => `${HENRIK}/valorant/v1/website/${locale}`;

async function fetchNews(lang) {
  const locales = lang === 'en' ? ['en-us'] : ['th-th', 'en-us']; // ถ้าไม่มีเว็บภาษาไทยจะถอยไปภาษาอังกฤษเอง
  let lastErr;
  for (const locale of locales) {
    try {
      const data = await getJson(newsUrl(locale), { ttl: 15 * 60_000 });
      if (Array.isArray(data) && data.length) return { items: data, locale };
    } catch (err) {
      if ([0, 401, 429].includes(err.status)) throw err;
      lastErr = err;
    }
  }
  throw lastErr ?? new ApiError('ไม่พบข่าวในตอนนี้', 404);
}

const articleUrl = (a) => {
  const u = a.external_link || a.url;
  if (!u) return null;
  return /^https?:\/\//i.test(u) ? u : `https://playvalorant.com${u.startsWith('/') ? '' : '/'}${u}`;
};

async function newsCommand(i) {
  const category = i.options.getString('category');
  await i.deferReply();
  try {
    const { items } = await fetchNews(i.options.getString('lang') ?? 'th');
    let list = [...items].sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
    if (category) list = list.filter((a) => a.category?.toLowerCase() === category.toLowerCase());
    if (!list.length) return i.editReply(`😿 ไม่พบข่าวในหมวด **${mdSafe(category)}** (ลองพิมพ์ \`/valorant news\` แล้วเลือกหมวดจากรายการที่ขึ้นมา)`);
    list = list.slice(0, 5);

    const c = card();
    const banner = list.map((a) => httpsUrl(a.banner_url)).find(Boolean); // รูปแบนเนอร์ของข่าวแรกที่มีรูป
    if (banner) c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(banner)));
    c.addTextDisplayComponents(text(`## 📰 ข่าว Valorant ล่าสุด${category ? ` • ${mdSafe(category)}` : ''}`));
    for (const a of list) {
      const url = articleUrl(a);
      const t = ts(a.date);
      c.addSeparatorComponents(divider());
      c.addTextDisplayComponents(
        text(
          [
            `**${url ? `[${mdSafe(trunc(a.title, 120))}](${url})` : mdSafe(trunc(a.title, 120))}**`,
            `-# ${mdSafe(a.category ?? '')}${t ? ` • <t:${t}:D>` : ''}`,
            a.description ? mdSafe(trunc(a.description, 140)) : '',
          ]
            .filter(Boolean)
            .join('\n'),
        ),
      );
    }
    return i.editReply(send(c));
  } catch (err) {
    return replyError(i, err);
  }
}

// ---------- ข่าวอัตโนมัติ (/valorant newsfeed) ----------
// บอทเช็กข่าวใหม่ทุก 15 นาที ถ้ามีบทความใหม่ก็โพสต์การ์ด (รูป + คำอธิบาย + ปุ่มอ่านต่อ) ลงช่องที่ตั้งไว้เอง
const FEED_INTERVAL = 15 * 60_000;
const FEED_MAX_PER_POLL = 3; // กันบอทรัวข่าวถ้าหยุดไปนาน
const feeds = () => ((db.valorant ??= { links: {} }).newsfeeds ??= {}); // guildId -> { channelId, roleId, lang, seen[] }
const articleKey = (a) => articleUrl(a) || `${a.title}|${a.date}`;

const decodeHtml = (s) =>
  String(s ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .trim();

function metaTag(html, prop) {
  const a = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*?content=["']([^"']*)["']`, 'i').exec(html);
  const b = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*?(?:property|name)=["']${prop}["']`, 'i').exec(html);
  return decodeHtml((a ?? b)?.[1]);
}

// อ่าน og:description / og:image จากหน้าบทความ (API ข่าวไม่ส่งคำอธิบายมาให้) — พังก็ไม่เป็นไร ข้ามไป
const metaCache = new Map();
async function fetchMeta(url) {
  if (!url || !url.startsWith('https://')) return {};
  if (metaCache.has(url)) return metaCache.get(url);
  let meta = {};
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MeowPailongBot)', Accept: 'text/html' }, signal: AbortSignal.timeout(8_000) });
    if (res.ok) {
      const html = (await res.text()).slice(0, 300_000);
      meta = { description: metaTag(html, 'og:description') || metaTag(html, 'description'), image: metaTag(html, 'og:image') };
    }
  } catch {
    /* ใช้ข้อมูลเท่าที่มี */
  }
  metaCache.set(url, meta);
  if (metaCache.size > 100) metaCache.delete(metaCache.keys().next().value);
  return meta;
}

async function buildNewsMessage(a, roleId) {
  const url = articleUrl(a);
  const meta = await fetchMeta(url);
  const image = httpsUrl(a.banner_url) ?? httpsUrl(meta.image);
  const desc = a.description || meta.description;
  const t = ts(a.date);

  const c = card();
  if (image) c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(image)));
  c.addTextDisplayComponents(
    text(
      [
        `## ${mdSafe(trunc(a.title, 200))}`,
        `-# 📰 ${mdSafe(a.category ?? 'news')}${t ? ` • <t:${t}:D>` : ''}`,
        desc ? mdSafe(trunc(desc, 350)) : '',
      ]
        .filter(Boolean)
        .join('\n'),
    ),
  );
  if (url) c.addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('อ่านต่อ').setEmoji('🔗').setStyle(ButtonStyle.Link).setURL(url)));

  return {
    components: [...(roleId ? [text(`<@&${roleId}>`)] : []), c],
    flags: V2,
    allowedMentions: roleId ? { roles: [roleId] } : NO_PING,
  };
}

// คืน 'ok' | 'gone' (ช่องหาย) | 'fail' (ลองใหม่รอบหน้า)
async function postArticle(client, cfg, a) {
  const channel = await client.channels.fetch(cfg.channelId).catch(() => null);
  if (!channel?.isTextBased()) return 'gone';
  try {
    await channel.send(await buildNewsMessage(a, cfg.roleId));
    return 'ok';
  } catch (err) {
    console.error('valorant newsfeed send:', err.code ?? '', err.message);
    return err.code === 10003 ? 'gone' : 'fail';
  }
}

let feedBusy = false;
async function pollNews(client) {
  if (feedBusy) return;
  feedBusy = true;
  try {
    const entries = Object.entries(feeds());
    if (!entries.length) return;
    const byLang = new Map();
    let dirty = false;

    for (const [guildId, cfg] of entries) {
      if (!byLang.has(cfg.lang)) {
        byLang.set(cfg.lang, await fetchNews(cfg.lang).then((r) => r.items).catch((e) => (console.error('valorant newsfeed fetch:', e.message), [])));
      }
      const items = byLang.get(cfg.lang);
      if (!items.length) continue;

      const seen = new Set(cfg.seen ?? []);
      const fresh = items.filter((a) => !seen.has(articleKey(a))).sort((a, b) => (Date.parse(a.date) || 0) - (Date.parse(b.date) || 0));
      if (!fresh.length) continue;

      const toPost = fresh.slice(-FEED_MAX_PER_POLL);
      const done = fresh.slice(0, fresh.length - toPost.length).map(articleKey); // เก่ากว่าโควตา → ข้ามไปเลย
      for (const a of toPost) {
        const r = await postArticle(client, cfg, a);
        if (r === 'gone') {
          delete feeds()[guildId];
          break;
        }
        if (r === 'ok') done.push(articleKey(a));
        await sleep(1_500);
      }
      if (feeds()[guildId]) cfg.seen = [...new Set([...done, ...(cfg.seen ?? [])])].slice(0, 300);
      dirty = true;
    }
    if (dirty) save();
  } finally {
    feedBusy = false;
  }
}

let feedTimer = null;
// เรียกครั้งเดียวตอนบอทพร้อม (ดูตัวอย่างใน index.js)
export function startNewsFeed(client) {
  if (feedTimer) return;
  const run = () => pollNews(client).catch((e) => console.error('valorant newsfeed:', e));
  setTimeout(run, 30_000);
  feedTimer = setInterval(run, FEED_INTERVAL);
  feedTimer.unref?.();
}

async function newsfeedCommand(i) {
  if (!i.inGuild()) return i.reply({ content: 'ใช้ได้เฉพาะในเซิร์ฟเวอร์', ...EPHEMERAL });
  if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return i.reply({ content: '⛔ ต้องมีสิทธิ์ **จัดการเซิร์ฟเวอร์** ถึงจะตั้งค่าข่าวอัตโนมัติได้', ...EPHEMERAL });

  const action = i.options.getString('action', true);
  const cfg = feeds()[i.guildId];
  await i.deferReply(EPHEMERAL);

  try {
    if (action === 'status') {
      if (!cfg) return i.editReply('📴 ยังไม่ได้เปิดข่าวอัตโนมัติ ใช้ `/valorant newsfeed action:เปิด` ได้เลย');
      return i.editReply(`📡 เปิดอยู่ → <#${cfg.channelId}>${cfg.roleId ? ` • แท็ก <@&${cfg.roleId}>` : ''} • ภาษา ${cfg.lang === 'en' ? 'English' : 'ไทย'}\nเช็กข่าวใหม่ทุก ${FEED_INTERVAL / 60_000} นาที`);
    }

    if (action === 'off') {
      if (!cfg) return i.editReply('ยังไม่ได้เปิดอยู่แล้วนะ');
      delete feeds()[i.guildId];
      save();
      return i.editReply('📴 ปิดข่าวอัตโนมัติแล้ว');
    }

    if (action === 'test') {
      if (!cfg) return i.editReply('ยังไม่ได้เปิดข่าวอัตโนมัติ ใช้ `action:เปิด` ก่อน');
      const { items } = await fetchNews(cfg.lang);
      const latest = [...items].sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0))[0];
      const r = await postArticle(i.client, cfg, latest);
      return i.editReply(r === 'ok' ? `✅ ส่งข่าวล่าสุดไปที่ <#${cfg.channelId}> แล้ว` : '❌ ส่งไม่สำเร็จ ตรวจสิทธิ์บอทในช่องนั้น (ดู/ส่งข้อความ/ฝังลิงก์)');
    }

    // action === 'on'
    const channel = i.options.getChannel('channel') ?? i.channel;
    const me = i.guild.members.me;
    const need = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages];
    if (!channel?.permissionsFor(me)?.has(need)) return i.editReply(`❌ บอทไม่มีสิทธิ์ดู/ส่งข้อความใน <#${channel?.id}> ให้สิทธิ์ก่อนแล้วลองใหม่`);

    const lang = i.options.getString('lang') ?? cfg?.lang ?? 'th';
    const { items } = await fetchNews(lang);
    // ข่าวที่มีอยู่ตอนนี้ถือว่า "เห็นแล้ว" — จะโพสต์เฉพาะข่าวที่ออกใหม่หลังจากนี้
    feeds()[i.guildId] = { channelId: channel.id, roleId: i.options.getRole('role')?.id ?? cfg?.roleId ?? null, lang, seen: items.map(articleKey).slice(0, 300) };
    save();
    const f = feeds()[i.guildId];
    return i.editReply(`✅ เปิดข่าวอัตโนมัติ → <#${f.channelId}>${f.roleId ? ` (แท็ก <@&${f.roleId}>)` : ''}\nข่าวที่มีอยู่ตอนนี้จะไม่โพสต์ซ้ำ มีข่าวใหม่เมื่อไหร่บอทจะโพสต์เอง (ลอง \`action:ทดสอบ\` เพื่อดูหน้าตา)`);
  } catch (err) {
    return replyError(i, err);
  }
}

// ---------- /valorant matches (esports) ----------
const scheduleUrl = `${HENRIK}/valorant/v1/esports/schedule`;

async function matchesCommand(i) {
  const league = i.options.getString('league')?.toLowerCase();
  await i.deferReply();
  try {
    let all = [];
    let schedErr = null;
    try {
      all = await getJson(scheduleUrl, { ttl: 5 * 60_000, timeout: 15_000 });
    } catch (err) {
      if ([0, 401, 429].includes(err.status)) throw err; // key/เน็ต/rate limit แจ้งตรงๆ
      schedErr = err; // 5xx/404 จากตารางทางการ → ถอยไปใช้ VLR แทน
      console.error('valorant schedule:', err.status, err.message);
    }
    const now = Date.now();
    const rows = (Array.isArray(all) ? all : [])
      .map((e) => ({ e, t: Date.parse(e.date) }))
      .filter(({ e, t }) => Number.isFinite(t) && !/complet/i.test(e.state ?? '') && t > now - 6 * 3600_000)
      .filter(({ e }) => !league || e.league?.name?.toLowerCase().includes(league) || e.league?.identifier?.toLowerCase().includes(league))
      .sort((a, b) => a.t - b.t)
      .slice(0, 8);

    const c = card();
    c.addTextDisplayComponents(text(`## 🏟️ ตารางแข่ง Valorant Esports${league ? ` • ${mdSafe(league)}` : ''}`));

    if (rows.length) {
      for (const { e, t } of rows) {
        const live = /progress|live/i.test(e.state ?? '');
        const teams = (e.match?.teams ?? []).map((x) => `**${mdSafe(x.code || x.name || 'TBD')}**`);
        const bo = e.match?.game_type?.count ? ` • Bo${e.match.game_type.count}` : '';
        const unixT = Math.floor(t / 1000);
        c.addSeparatorComponents(divider());
        c.addTextDisplayComponents(
          text(
            [
              `${live ? '🔴 **LIVE** • ' : ''}${teams.length ? teams.join(' vs ') : 'TBD'}${bo}`,
              `-# ${mdSafe(e.league?.name ?? '')}${e.tournament?.name ? ` — ${mdSafe(e.tournament.name)}` : ''}`,
              `🕒 <t:${unixT}:f> (<t:${unixT}:R>)`,
            ].join('\n'),
          ),
        );
      }
    } else {
      // ตารางทางการว่าง → ถอยไปดูรายการทัวร์นาเมนต์ที่กำลังจะมาจาก VLR
      let evErr = null;
      const events = await getJson(`${HENRIK}/valorant/v2/esports/vlr/events?type=upcoming`, { ttl: 30 * 60_000 }).catch((e) => ((evErr = e), console.error('valorant vlr events:', e.status, e.message), []));
      if (schedErr && evErr) throw schedErr; // ทั้งสองแหล่งพัง → แจ้ง error จริง
      const list = (Array.isArray(events) ? events : []).slice(0, 6);
      c.addSeparatorComponents(divider());
      if (!list.length) {
        c.addTextDisplayComponents(text(`😿 ยังไม่พบรายการแข่งที่กำลังจะมาถึง${league ? ' ในลีกนี้' : ''}`));
      } else {
        c.addTextDisplayComponents(text(schedErr ? '_ตารางแข่งทางการดึงไม่ได้ชั่วคราว นี่คือทัวร์นาเมนต์ที่กำลังจะมาถึง/กำลังแข่งจาก VLR:_' : '_ไม่มีแมตช์ในตารางทางการตอนนี้ นี่คือทัวร์นาเมนต์ที่กำลังจะมาถึง:_'));
        for (const ev of list) {
          const link = ev.id && ev.slug ? `https://www.vlr.gg/event/${ev.id}/${ev.slug}` : null;
          c.addTextDisplayComponents(
            text(`${ev.status === 'ongoing' ? '🔴 ' : ''}**${link ? `[${mdSafe(ev.title)}](${link})` : mdSafe(ev.title)}**\n-# ${mdSafe(ev.region ?? '')}${ev.dates?.start ? ` • ${mdSafe(ev.dates.start)}${ev.dates.end ? ` → ${mdSafe(ev.dates.end)}` : ''}` : ''}${ev.price ? ` • ${mdSafe(ev.price)}` : ''}`),
          );
        }
      }
    }
    c.addTextDisplayComponents(text('-# เวลาแสดงตามเขตเวลาในเครื่องของคุณ'));
    return i.editReply(send(c));
  } catch (err) {
    return replyError(i, err);
  }
}

// ---------- /valorant weapon ----------
const weaponsList = async () => {
  const data = await getJson(`${CONTENT}/weapons`, { auth: false, ttl: 6 * 3600_000, timeout: 10_000 });
  return Array.isArray(data) ? data : [];
};
const stripEnum = (s) => String(s ?? '').replace(/^.*::/, '');

async function weaponCommand(i) {
  const name = i.options.getString('name')?.trim();
  await i.deferReply();
  try {
    const list = await weaponsList();
    if (!list.length) return i.editReply('😿 ดึงข้อมูลปืนไม่ได้ในตอนนี้ ลองใหม่ภายหลัง');

    if (!name) {
      const byCat = new Map();
      for (const w of list) {
        const cat = stripEnum(w.category);
        if (!byCat.has(cat)) byCat.set(cat, []);
        byCat.get(cat).push(w);
      }
      const c = card();
      c.addTextDisplayComponents(text('## 🔫 รายการปืนทั้งหมด\n-# ใช้ `/valorant weapon name:<ชื่อ>` เพื่อดูรายละเอียดและดาเมจตามระยะ'));
      for (const [cat, ws] of byCat) {
        c.addSeparatorComponents(divider());
        const lines = ws.sort((a, b) => (a.shopData?.cost ?? 0) - (b.shopData?.cost ?? 0)).map((w) => `• **${mdSafe(w.displayName)}**${w.shopData?.cost ? ` — ${w.shopData.cost}` : ''}`);
        c.addTextDisplayComponents(text(`### ${mdSafe(cat)}\n${lines.join('\n')}`));
      }
      return i.editReply(send(c));
    }

    const w = list.find((x) => x.displayName?.toLowerCase() === name.toLowerCase()) ?? list.find((x) => x.displayName?.toLowerCase().includes(name.toLowerCase()));
    if (!w) return i.editReply(`😿 ไม่พบปืนชื่อ **${mdSafe(name)}** (ลองพิมพ์แล้วเลือกจากรายการที่ขึ้นมา)`);

    const st = w.weaponStats;
    const c = card();
    withThumb(c, [`## 🔫 ${mdSafe(w.displayName)}`, `-# ${mdSafe(stripEnum(w.category))}${w.shopData?.cost != null ? ` • 💰 ${w.shopData.cost} เครดิต` : ''}`].join('\n'), w.displayIcon);

    if (st) {
      c.addSeparatorComponents(divider());
      const spec = [
        `อัตรายิง        ${st.fireRate ?? '-'} นัด/วินาที`,
        `ความจุกระสุน   ${st.magazineSize ?? '-'}`,
        `รีโหลด          ${st.reloadTimeSeconds != null ? `${st.reloadTimeSeconds} วิ` : '-'}`,
        `ชักปืน          ${st.equipTimeSeconds != null ? `${st.equipTimeSeconds} วิ` : '-'}`,
        `ความเร็วเดิน    ×${st.runSpeedMultiplier ?? '-'}`,
        `ทะลุกำแพง       ${stripEnum(st.wallPenetration) || '-'}`,
      ];
      c.addTextDisplayComponents(text(['### ⚙️ สเปก', '```', ...spec, '```'].join('\n')));

      const ranges = st.damageRanges ?? [];
      if (ranges.length) {
        c.addSeparatorComponents(divider());
        const rows = ranges.map((r) => {
          const range = `${r.rangeStartMeters}-${r.rangeEndMeters}m`.padEnd(9);
          return `${range} หัว ${String(Math.round(r.headDamage)).padStart(3)} │ ตัว ${String(Math.round(r.bodyDamage)).padStart(3)} │ ขา ${String(Math.round(r.legDamage)).padStart(3)}`;
        });
        c.addTextDisplayComponents(text(['### 🎯 ดาเมจตามระยะ', '```', ...rows, '```'].join('\n')));
      }
    } else {
      c.addTextDisplayComponents(text('_อาวุธนี้ไม่มีสเปกยิง_'));
    }
    c.addTextDisplayComponents(text('-# ข้อมูลจาก valorant-api.com (อัปเดตตามแพตช์) • ไม่ใช่ข้อมูลทางการของ Riot Games'));
    return i.editReply(send(c));
  } catch (err) {
    return replyError(i, err);
  }
}

// ---------- autocomplete ----------
const pickChoices = (values, q) =>
  [...new Set(values.filter(Boolean))]
    .filter((v) => v.toLowerCase().includes(q))
    .slice(0, 25)
    .map((v) => ({ name: v.slice(0, 100), value: v.slice(0, 100) }));

async function valorantAutocomplete(i) {
  const f = i.options.getFocused(true);
  const q = f.value.toLowerCase();
  const sub = i.options.getSubcommand();

  if (sub === 'news' && f.name === 'category') {
    const cats = ['th-th', 'en-us'].flatMap((l) => (peek(newsUrl(l)) ?? []).map((a) => a.category));
    return i.respond(pickChoices(cats, q));
  }
  if (sub === 'matches' && f.name === 'league') {
    const leagues = (peek(scheduleUrl) ?? []).map((e) => e.league?.name);
    return i.respond(pickChoices(leagues, q));
  }
  if (sub === 'weapon' && f.name === 'name') {
    // ต้องตอบภายใน 3 วิ ไม่งั้น Discord ตัดทิ้ง
    const list = await Promise.race([weaponsList().catch(() => []), sleep(2_500).then(() => [])]);
    return i.respond(pickChoices(list.map((w) => w.displayName), q));
  }
  return i.respond([]);
}

const handlers = {
  link: linkCommand,
  unlink: unlinkCommand,
  stats: statsCommand,
  lastmatch: lastMatchCommand,
  news: newsCommand,
  newsfeed: newsfeedCommand,
  agentstats: agentStatsCommand,
  weaponstats: weaponStatsCommand,
  emojis: emojisCommand,
  matches: matchesCommand,
  weapon: weaponCommand,
};

export const commandHandlers = { valorant: (i) => handlers[i.options.getSubcommand()](i) };
export const autocompleteHandlers = { valorant: valorantAutocomplete };