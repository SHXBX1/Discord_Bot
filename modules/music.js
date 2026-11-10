// ระบบเพลง: /music /setconsole /play /pause /resume /skip /stop /leave /queue /clearqueue /nowplaying /loop /shuffle /volume /remove /favorite /history /autoplay + ปุ่มควบคุม
// ดึงเสียงด้วย yt-dlp → แปลงด้วย ffmpeg → ส่งเข้าห้องเสียงด้วย @discordjs/voice
// ต้องติดตั้ง yt-dlp บนเครื่องที่รันบอท (ดู README) | ตัวแปรใน .env: YTDLP_PATH, YTDLP_JS_RUNTIME, YTDLP_COOKIES, YTDLP_COOKIES_FROM_BROWSER
import { execFile, spawn } from 'node:child_process';
import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
} from '@discordjs/voice';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  Events,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits as P,
  SectionBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  ThumbnailBuilder,
} from 'discord.js';
import { db, save } from '../db.js';
import { EPHEMERAL, V2, divider, shuffle, text } from '../util.js';

const YTDLP = process.env.YTDLP_PATH || 'yt-dlp';
const JS_RUNTIME = process.env.YTDLP_JS_RUNTIME; // เช่น node (ถ้าไม่ได้ติดตั้ง deno)
const COOKIES_BROWSER = process.env.YTDLP_COOKIES_FROM_BROWSER; // เช่น firefox (ใช้ได้เมื่อบอทรันบนเครื่องเดียวกับเบราว์เซอร์ที่ล็อกอิน YouTube)
const COOKIES = process.env.YTDLP_COOKIES; // ไฟล์ cookies.txt (ถ้า YouTube ขอให้ล็อกอิน/ยืนยันว่าไม่ใช่บอท)

const MAX_QUEUE = 200;
const FAV_MAX = 100; // เพลงโปรดต่อคน
const HISTORY_MAX = 25; // ประวัติเพลงต่อเซิร์ฟ
const HEART = '\u2764\uFE0E'; // ❤︎ (แบบตัวอักษร ไม่ใช่อีโมจิสี)
const HOURGLASS = '\u231B\uFE0E'; // ⌛︎
const PLAYLIST_LIMIT = 50;
const IDLE_LEAVE_MS = 3 * 60_000; // คิวหมดแล้วอยู่ต่ออีก 3 นาทีก่อนออก
const ALONE_LEAVE_MS = 60_000; // ไม่มีคนอยู่ในห้อง 1 นาทีแล้วออก
const ALLOWED_HOSTS = ['youtube.com', 'youtu.be', 'soundcloud.com', 'bandcamp.com'];
// แนวเพลงในเมนูของคอนโซล: อยากเพิ่ม/แก้ ก็แก้รายการนี้ได้เลย (key ห้ามซ้ำ, สูงสุด 24 แนว)
// queries = คำค้นหาบน YouTube (สุ่มใช้ทีละคำ) เพลงที่ยาวเกิน 10 นาทีหรือสั้นกว่า 1 นาทีจะถูกข้าม (กันเจอคลิปมิกซ์ยาวเป็นชั่วโมง)
const GENRES = [
  { key: 'thaihits', label: 'เพลงไทยฮิต', queries: ['เพลงไทยฮิต', 'เพลงไทยเพราะๆ ฟังสบาย', 'เพลงไทยยอดนิยม'] },
  { key: 'thaiindie', label: 'ไทยอินดี้', queries: ['เพลงไทยอินดี้', 'thai indie songs'] },
  { key: 'thaiesan', label: 'ไทยอีสาน', queries: ['เพลงไทยอีสาน', 'thai mor lam songs'] },
  { key: 'thairock', label: 'ไทยร็อก', queries: ['เพลงไทยร็อก', 'thai rock songs'] },
  { key: 'thaisongforlife', label: 'ไทยเพื่อชีวิต', queries: ['เพลงเพื่อชีวิต', 'thai phuea chiwit songs'] },
  { key: 'lofi', label: 'Lofi', queries: ['lofi hip hop songs', 'lofi chill beats', 'lofi study songs'] },
  { key: 'phonk', label: 'Phonk', queries: ['phonk music', 'brazilian phonk songs', 'drift phonk songs'] },
  { key: 'hiphop', label: 'Conscious Hip Hop', queries: ['conscious hip hop songs', 'lyrical hip hop songs'] },
  { key: 'trap', label: 'Modern Trap', queries: ['modern trap songs', 'trap music hits'] },
  { key: 'edm', label: 'EDM', queries: ['edm songs', 'electronic dance music hits'] },
  { key: 'pop', label: 'Pop', queries: ['pop hits songs', 'best pop songs'] },
  { key: 'rock', label: 'Rock', queries: ['rock songs', 'alternative rock hits'] },
  { key: 'kpop', label: 'K-Pop', queries: ['kpop songs', 'kpop hits'] },
];

const NOT_FOUND_MSG = '✕ ไม่พบโปรแกรม';

const voiceOnly = (b) => b.setDMPermission(false);
export const commands = [
  voiceOnly(new SlashCommandBuilder().setName('music').setDescription('เปิดคอนโซลเพลง คิดไม่ออกว่าจะฟังอะไรเลือกแนวเพลงได้')),
  voiceOnly(
    new SlashCommandBuilder()
      .setName('setconsole')
      .setDescription('ตั้งห้องนี้เป็นห้องคอนโซลเพลง (การ์ดค้างไว้ถาวร เลือกแนวเพลงได้เลย)')
      .setDefaultMemberPermissions(P.ManageGuild)
      .addBooleanOption((o) => o.setName('remove').setDescription('ยกเลิกคอนโซลเพลงของเซิร์ฟนี้')),
  ),
  voiceOnly(
    new SlashCommandBuilder()
      .setName('play')
      .setDescription('เล่นเพลง พิมพ์ชื่อเพลงเพื่อค้นหา หรือใส่ลิงก์ YouTube / SoundCloud / Bandcamp')
      .addStringOption((o) => o.setName('query').setDescription('ชื่อเพลง หรือลิงก์ (รองรับเพลย์ลิสต์)').setRequired(true).setMaxLength(300)),
  ),
  voiceOnly(new SlashCommandBuilder().setName('pause').setDescription('หยุดเพลงชั่วคราว')),
  voiceOnly(new SlashCommandBuilder().setName('resume').setDescription('เล่นเพลงต่อ')),
  voiceOnly(new SlashCommandBuilder().setName('skip').setDescription('ข้ามเพลงนี้')),
  voiceOnly(new SlashCommandBuilder().setName('stop').setDescription('หยุดเล่น ล้างคิว และให้บอทออกจากห้อง')),
  voiceOnly(new SlashCommandBuilder().setName('leave').setDescription('ให้บอทออกจากห้องเสียง (ล้างคิวด้วย)')),
  voiceOnly(new SlashCommandBuilder().setName('queue').setDescription('ดูคิวเพลง')),
  voiceOnly(new SlashCommandBuilder().setName('clearqueue').setDescription('ล้างคิวเพลงที่รออยู่ทั้งหมด (เพลงที่กำลังเล่นจะเล่นต่อ)')),
  voiceOnly(new SlashCommandBuilder().setName('nowplaying').setDescription('ดูว่ากำลังเล่นเพลงอะไร')),
  voiceOnly(
    new SlashCommandBuilder()
      .setName('loop')
      .setDescription('ตั้งโหมดวนเพลง')
      .addStringOption((o) =>
        o
          .setName('mode')
          .setDescription('โหมด')
          .setRequired(true)
          .addChoices({ name: 'ปิด', value: 'off' }, { name: 'วนเพลงเดียว', value: 'track' }, { name: 'วนทั้งคิว', value: 'queue' }),
      ),
  ),
  voiceOnly(new SlashCommandBuilder().setName('shuffle').setDescription('สับเรียงเพลงในคิวใหม่')),
  voiceOnly(
    new SlashCommandBuilder()
      .setName('volume')
      .setDescription('ปรับเสียงของบอท')
      .addIntegerOption((o) => o.setName('level').setDescription('0-100 (ค่าเริ่มต้น 50) หรือกดปุ่ม VOL บนการ์ดแทนได้').setRequired(true).setMinValue(0).setMaxValue(100)),
  ),
  voiceOnly(
    new SlashCommandBuilder()
      .setName('remove')
      .setDescription('เอาเพลงออกจากคิวทีละเพลง (ไม่ใส่ลำดับ = เลือกจากเมนู)')
      .addIntegerOption((o) => o.setName('position').setDescription('ลำดับในคิว (ดูจาก /queue)').setMinValue(1)),
  ),
  voiceOnly(
    new SlashCommandBuilder()
      .setName('favorite')
      .setDescription('เพลงโปรดของคุณ')
      .addSubcommand((c) => c.setName('add').setDescription('เพิ่มเพลงที่กำลังเล่นเข้าเพลงโปรด'))
      .addSubcommand((c) => c.setName('list').setDescription('ดูเพลงโปรด เลือกเล่นหรือลบได้'))
      .addSubcommand((c) => c.setName('play').setDescription('เล่นเพลงโปรดทั้งหมด').addBooleanOption((o) => o.setName('shuffle').setDescription('สุ่มลำดับ'))),
  ),
  voiceOnly(new SlashCommandBuilder().setName('history').setDescription('ดูเพลงที่เพิ่งเล่นไป เลือกเล่นซ้ำได้')),
  voiceOnly(
    new SlashCommandBuilder()
      .setName('autoplay')
      .setDescription('เปิด/ปิดเล่นเพลงที่คล้ายกันต่ออัตโนมัติเมื่อคิวหมด')
      .addStringOption((o) => o.setName('mode').setDescription('ไม่เลือก = สลับสถานะ').addChoices({ name: 'เปิด', value: 'on' }, { name: 'ปิด', value: 'off' })),
  ),
];

// ---------- yt-dlp ----------
// alt = ใช้ client ทางเลือกของ YouTube (android_vr, web_embedded) ที่มักไม่โดนเช็ก "ยืนยันว่าไม่ใช่บอท"
const commonArgs = (alt = false) => [
  '--no-warnings',
  '--remote-components', 'ejs:github',
  ...(JS_RUNTIME ? ['--js-runtimes', JS_RUNTIME] : []),
  ...(COOKIES ? ['--cookies', COOKIES] : COOKIES_BROWSER ? ['--cookies-from-browser', COOKIES_BROWSER] : []),
  ...(alt ? ['--extractor-args', 'youtube:player_client=android_vr,web_embedded'] : []),
];

const BOT_RE = /sign in to confirm|not a bot/i;
let lastBotHint = 0;
function botHint(stderr) {
  if (!BOT_RE.test(String(stderr ?? '')) || Date.now() - lastBotHint < 10 * 60_000) return;
  lastBotHint = Date.now();
  console.warn('[music] YouTube ขอให้ยืนยันว่าไม่ใช่บอท: ส่งออก cookies จากเบราว์เซอร์เป็นไฟล์ cookies.txt แล้วตั้ง YTDLP_COOKIES=./cookies.txt ใน .env (หรือ YTDLP_COOKIES_FROM_BROWSER=firefox) และอัปเดต yt-dlp ให้ล่าสุด (yt-dlp -U)');
}

const execYtdlp = (extra, args, timeout) =>
  new Promise((resolve, reject) => {
    execFile(YTDLP, [...extra, ...args], { maxBuffer: 64 * 1024 * 1024, timeout, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        err.stderr = stderr;
        return reject(err);
      }
      resolve(stdout);
    });
  });

// โดนเช็กบอท = ลองใหม่อีกรอบด้วย client ทางเลือกก่อน ถ้ายังไม่ผ่านค่อยโยน error
function runYtdlp(args, timeout = 45_000) {
  return execYtdlp(commonArgs(), args, timeout).catch((err) => {
    if (!BOT_RE.test(err.stderr)) throw err;
    return execYtdlp(commonArgs(true), args, timeout).catch((err2) => {
      botHint(err2.stderr);
      throw err2;
    });
  });
}

function lastError(stderr, fallback = '') {
  const line = String(stderr ?? '')
    .split('\n')
    .filter((l) => l.startsWith('ERROR'))
    .at(-1);
  const msg = (line ?? fallback).replace(/^ERROR:\s*/, '').split('\n')[0].slice(0, 200);
  return BOT_RE.test(msg) ? 'YouTube บล็อกเซิร์ฟเวอร์ของบอท (ขอให้ยืนยันว่าไม่ใช่บอท) แจ้งเจ้าของบอทให้ตั้งค่า cookies' : msg;
}

// แยกว่าเป็นลิงก์หรือคำค้นหา + กันลิงก์แปลกๆ (บอทที่อยู่หลายเซิร์ฟไม่ควรไปเปิดลิงก์อะไรก็ได้ที่คนส่งมา)
function classify(query, count = 1) {
  const q = query.trim();
  if (!/^https?:\/\//i.test(q)) return { target: `ytsearch${count}:${q}`, noPlaylist: false };

  let url;
  try {
    url = new URL(q);
  } catch {
    return { error: '✕ ลิงก์ไม่ถูกต้อง' };
  }
  const host = url.hostname.toLowerCase();
  if (host === 'spotify.com' || host.endsWith('.spotify.com')) {
    return { error: '✕ ยังเล่นลิงก์ Spotify ไม่ได้ ลองพิมพ์ชื่อเพลง หรือใช้ลิงก์ YouTube/SoundCloud แทนนะ' };
  }
  if (!ALLOWED_HOSTS.some((d) => host === d || host.endsWith(`.${d}`))) {
    return { error: '✕ รองรับเฉพาะลิงก์ YouTube / SoundCloud / Bandcamp (หรือพิมพ์ชื่อเพลงเพื่อค้นหา)' };
  }
  // ลิงก์ YouTube ที่แนบ list= มา = ดึงทั้งเพลย์ลิสต์ (ยกเว้น Mix ที่ YouTube สร้างให้อัตโนมัติ ซึ่งยาวไม่รู้จบ)
  const list = url.searchParams.get('list');
  const isYoutube = host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com');
  if (isYoutube && list && !/^RD(?!CLAK)/.test(list)) {
    return { target: `https://www.youtube.com/playlist?list=${encodeURIComponent(list)}`, noPlaylist: false };
  }
  return { target: q, noPlaylist: url.searchParams.has('v') || host === 'youtu.be' };
}

async function resolveTracks(query, requestedBy, count = 1) {
  const c = classify(query, count);
  if (c.error) throw Object.assign(new Error(c.error), { friendly: true });

 const out = await runYtdlp([
  '-J',
  ...(c.target.startsWith('ytsearch') || c.target.includes('/playlist?') ? ['--flat-playlist'] : []),
  '--playlist-end',
  String(PLAYLIST_LIMIT),
  ...(c.noPlaylist ? ['--no-playlist'] : []),
  '--',
  c.target,
]);
  const info = JSON.parse(out);
  const entries = (info.entries ?? [info]).filter(Boolean);

  return entries.map((e) => toTrack(e, requestedBy)).filter(validTrack);
}

const newUid = () => Math.random().toString(36).slice(2, 8); // ไอดีสั้นๆ ของเพลงในคิว ไว้เลือกลบทีละเพลง
const stamp = (t, requestedBy) => ({ url: t.url, title: t.title, author: t.author ?? null, duration: t.duration ?? null, thumbnail: t.thumbnail ?? null, requestedBy, uid: newUid() });

function toTrack(e, requestedBy) {
  const url = e.webpage_url ?? (e.url?.startsWith('http') ? e.url : e.id ? `https://www.youtube.com/watch?v=${e.id}` : null);
  return {
    uid: newUid(),
    url,
    title: e.title ?? 'ไม่ทราบชื่อเพลง',
    duration: Number.isFinite(e.duration) ? e.duration : null,
    author: e.uploader ?? e.channel ?? e.playlist_uploader ?? null,
    thumbnail: e.thumbnail ?? e.thumbnails?.at(-1)?.url ?? null,
    requestedBy,
  };
}

const validTrack = (t) => t.url && !/^\[(Private|Deleted) video\]$/i.test(t.title);

// ดึงเพลงตามแนว: ค้นหา 40 ผลลัพธ์ → ตัดเพลงที่เคยเล่นแล้ว/สั้น-ยาวเกินไป → สุ่มเอา 15 เพลง
async function genreTracks(genre, requestedBy, seen) {
  const q = genre.queries[Math.floor(Math.random() * genre.queries.length)];
  const out = await runYtdlp(['-J', '--flat-playlist', '--', `ytsearch40:${q}`], 60_000);
  const all = (JSON.parse(out).entries ?? [])
    .filter(Boolean)
    .map((e) => toTrack(e, requestedBy))
    .filter((t) => validTrack(t) && t.duration >= 60 && t.duration <= 600);

  let fresh = all.filter((t) => !seen.has(t.url));
  if (!fresh.length && all.length) {
    seen.clear(); // เล่นครบทุกเพลงที่หาเจอแล้ว เริ่มวนใหม่
    fresh = all;
  }
  const picked = shuffle(fresh).slice(0, 15).map((t) => ({ ...t, auto: true }));
  picked.forEach((t) => seen.add(t.url));
  return picked;
}

// เติมคิวอัตโนมัติเมื่ออยู่ในโหมดแนวเพลง คืน true ถ้าได้เพลงเพิ่ม
async function refillGenre(g) {
  if (!g.genre || g.refilling) return false;
  g.refilling = true;
  try {
    const tracks = await genreTracks(g.genre, g.genre.by, g.genreSeen);
    if (states.get(g.guildId) !== g || !g.genre) return false;
    g.queue.push(...tracks.slice(0, Math.max(0, MAX_QUEUE - g.queue.length)));
    return tracks.length > 0;
  } catch (err) {
    console.error('ดึงเพลงตามแนวไม่สำเร็จ:', err.message);
    return false;
  } finally {
    g.refilling = false;
  }
}

// ---------- ตัวช่วยแสดงผล ----------
function youtubeId(u) {
  try {
    const url = new URL(u);
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return url.pathname.slice(1) || null;
    if (host === 'youtube.com' || host.endsWith('.youtube.com')) return url.searchParams.get('v');
  } catch {}
  return null;
}

// หาเพลงที่คล้ายกับเพลงล่าสุด: ใช้ YouTube Mix ของเพลงนั้นก่อน ถ้าไม่ได้ค่อยค้นหาตามชื่อศิลปิน
async function relatedTracks(seed, played) {
  const fetchList = async (target, end) => {
    const out = await runYtdlp(['-J', '--flat-playlist', '--playlist-end', String(end), '--', target], 45_000);
    return (JSON.parse(out).entries ?? [])
      .filter(Boolean)
      .map((e) => toTrack(e, seed.requestedBy))
      .filter((t) => validTrack(t) && t.duration >= 60 && t.duration <= 900 && !played.has(t.url));
  };
  const id = youtubeId(seed.url);
  if (id) {
    try {
      const mix = await fetchList(`https://www.youtube.com/watch?v=${id}&list=RD${id}`, 25);
      if (mix.length) return mix;
    } catch {}
  }
  return fetchList(`ytsearch20:${seed.author ? `${seed.author} songs` : seed.title}`, 20);
}

async function refillAutoplay(g, seed) {
  if (g.refilling) return false;
  g.refilling = true;
  try {
    const tracks = (await relatedTracks(seed, g.played)).slice(0, 5).map((t) => ({ ...t, autoplay: true }));
    if (states.get(g.guildId) !== g || !g.autoplay) return false;
    g.queue.push(...tracks.slice(0, Math.max(0, MAX_QUEUE - g.queue.length)));
    return tracks.length > 0;
  } catch (err) {
    console.error('หาเพลงต่อ (autoplay) ไม่สำเร็จ:', err.message);
    return false;
  } finally {
    g.refilling = false;
  }
}

function setAutoplay(guild, on) {
  db.musicAuto ??= {};
  db.musicAuto[guild.id] = on;
  save();
  const g = states.get(guild.id);
  if (g) {
    g.autoplay = on;
    refreshCard(g);
  }
}

// ---------- เพลงโปรด (ต่อคน) / ประวัติ (ต่อเซิร์ฟ) ----------
const favsOf = (userId) => db.musicFavorites?.[userId] ?? [];
const recentOf = (guildId) => db.musicHistory?.[guildId] ?? [];

// สลับสถานะเพลงโปรด: true = เพิ่มแล้ว, false = เอาออกแล้ว
function toggleFavorite(userId, track) {
  db.musicFavorites ??= {};
  const list = (db.musicFavorites[userId] ??= []);
  const at = list.findIndex((f) => f.url === track.url);
  if (at >= 0) {
    list.splice(at, 1);
    save();
    return false;
  }
  list.unshift({ url: track.url, title: track.title, author: track.author ?? null, duration: track.duration ?? null, thumbnail: track.thumbnail ?? null });
  if (list.length > FAV_MAX) list.length = FAV_MAX;
  save();
  return true;
}

function addHistory(guildId, track) {
  db.musicHistory ??= {};
  const list = (db.musicHistory[guildId] ??= []);
  const at = Date.now();
  if (list[0]?.url === track.url) {
    list[0].at = at;
    return;
  }
  const dup = list.findIndex((h) => h.url === track.url);
  if (dup > 0) list.splice(dup, 1);
  list.unshift({ url: track.url, title: track.title, author: track.author ?? null, duration: track.duration ?? null, thumbnail: track.thumbnail ?? null, at });
  if (list.length > HISTORY_MAX) list.length = HISTORY_MAX;
  save();
}

const clean = (s) => String(s ?? '').replace(/([\\*_`~|<>[\]])/g, '\\$1').slice(0, 120);
const link = (t) => `[${clean(t.title)}](${t.url})`;

function fmt(sec) {
  if (sec == null) return 'สด/ไม่ทราบ';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

const LOOP_LABEL = { off: 'ปิด', track: 'วนเพลงเดียว', queue: 'วนทั้งคิว' };
const NO_PING = { parse: [] };

// ---------- สถานะของแต่ละเซิร์ฟ ----------
const states = new Map(); // guildId -> state

function notify(g, content) {
  g.textChannel?.send({ content, allowedMentions: NO_PING }).catch(() => {});
}

function killProc(g) {
  const p = g.proc;
  g.proc = null; // เคลียร์ก่อน kill เพื่อให้ event ของโปรเซสที่ถูกฆ่าไม่ถูกนับเป็น error
  p?.kill();
}

function destroyState(g) {
  if (states.get(g.guildId) !== g) return;
  states.delete(g.guildId);
  stopTicker(g);
  clearTimeout(g.idleTimer);
  clearTimeout(g.aloneTimer);
  killProc(g);
  g.queue = [];
  g.current = null;
  g.player.stop(true);
  if (g.connection.state.status !== VoiceConnectionStatus.Destroyed) g.connection.destroy();
  releaseCard(g);
}

function createState(guild, vc, textChannel) {
  const connection = joinVoiceChannel({
    channelId: vc.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true,
  });
  const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
  const g = {
    guildId: guild.id,
    guild,
    channelId: vc.id,
    connection,
    player,
    queue: [],
    history: [], // เพลงที่เล่นไปแล้ว ไว้ใช้ปุ่มย้อนกลับ
    noHistory: false,
    autoplay: !!db.musicAuto?.[guild.id], // เล่นเพลงที่คล้ายกันต่อเมื่อคิวหมด
    played: new Set(), // url เพลงที่เล่นไปแล้วในรอบนี้ (กัน autoplay เล่นซ้ำ)
    preferAlt: false, // เคยโดนเช็กบอท = ใช้ client ทางเลือกของ YouTube ต่อไป
    genre: null, // โหมดเล่นตามแนว: { key, label, queries, by }
    genreSeen: null,
    refilling: false,
    current: null,
    loop: 'off',
    volume: 0.5,
    lastVolume: 0.5,
    ticker: null,
    textChannel,
    nowMsg: null,
    persistent: false, // nowMsg เป็นข้อความคอนโซลถาวร (ห้ามลบ)
    proc: null,
    resource: null,
    skipFlag: false,
    failFlag: false,
    noted: false, // แจ้ง error ของเพลงนี้ไปแล้ว (กันแจ้งซ้ำ)
    lastErr: '',
    startedAt: 0,
    idleTimer: null,
    aloneTimer: null,
  };

  connection.subscribe(player);

  // โดนเตะ/ย้ายห้อง: รอดูว่ากำลังย้ายไปห้องอื่นไหม ถ้าไม่ใช่ถือว่าหลุดจริง
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      destroyState(g);
    }
  });
  connection.on(VoiceConnectionStatus.Destroyed, () => destroyState(g));

  player.on(AudioPlayerStatus.Idle, () => onIdle(g));
  player.on('error', (err) => {
    console.error('เครื่องเล่นเพลงผิดพลาด:', err.message);
    g.failFlag = true;
    if (!g.noted && g.current) {
      g.noted = true;
      notify(g, `! เล่น **${clean(g.current.title)}** ไม่ได้ (${err.message.slice(0, 120)}) ข้ามให้แล้ว`);
    }
  });

  states.set(guild.id, g);
  return g;
}

// ---------- คิว ----------
function advance(g, { skipped = false, failed = false } = {}) {
  const prev = g.current;
  if (prev && !failed) {
    if (g.loop === 'track' && !skipped) return startTrack(g, prev);
    if (!g.noHistory) {
      g.history.push(prev);
      if (g.history.length > 20) g.history.shift();
    }
    g.noHistory = false;
    if (g.loop === 'queue') g.queue.push(prev);
  }
  g.current = g.queue.shift() ?? null;
  if (!g.current) {
    // คิวหมด: โหมดแนวเพลง / autoplay ไปหาเพลงใหม่มาต่อ ถ้าหาไม่ได้ค่อยจบ
    const seed = prev && !failed ? prev : g.history.at(-1);
    const refill = g.genre ? () => refillGenre(g) : g.autoplay && seed ? () => refillAutoplay(g, seed) : null;
    if (!refill) return queueEnded(g);
    refill().then((ok) => {
      if (states.get(g.guildId) !== g || g.current) return;
      if (ok) advance(g);
      else queueEnded(g);
    });
    return;
  }
  if (g.genre && g.queue.length < 3) refillGenre(g); // เหลือน้อยก็เติมล่วงหน้า
  return startTrack(g, g.current);
}

function onIdle(g) {
  if (states.get(g.guildId) !== g || !g.current) return;

  const skipped = g.skipFlag;
  let failed = g.failFlag;
  g.skipFlag = false;
  g.failFlag = false;

  // เพลงจบเร็วผิดปกติ (ไม่ถึง 3 วิ ทั้งที่เพลงยาวกว่านั้น) = ดึงเสียงไม่สำเร็จ
  const quick = Date.now() - g.startedAt < 3_000 && (g.current.duration ?? 60) > 10;
  if (!skipped && !failed && quick) {
    if (BOT_RE.test(g.lastErr) && !g.preferAlt) {
      g.preferAlt = true; // โดนเช็กบอท: ลองใหม่ด้วย client ทางเลือก และใช้แบบนี้กับเพลงถัดไปด้วย
      return startTrack(g, g.current);
    }
    botHint(g.lastErr);
    failed = true;
    if (!g.noted) {
      const why = lastError(g.lastErr);
      notify(g, `! เล่น **${clean(g.current.title)}** ไม่ได้${why ? `: ${why}` : ' (ลองอัปเดต yt-dlp ให้เป็นเวอร์ชันล่าสุด)'} ข้ามให้แล้ว`);
    }
  }
  advance(g, { skipped, failed });
}

function queueEnded(g) {
  stopTicker(g);
  g.current = null;
  g.resource = null;
  killProc(g);
  releaseCard(g);
  clearTimeout(g.idleTimer);
  g.idleTimer = setTimeout(() => {
    if (states.get(g.guildId) === g && !g.current) {
      notify(g, 'ไม่มีเพลงต่อแล้ว บอทขอออกจากห้องเสียงนะ');
      destroyState(g);
    }
  }, IDLE_LEAVE_MS);
  g.idleTimer.unref?.();
}

function startTrack(g, track) {
  clearTimeout(g.idleTimer);
  killProc(g);
  g.noted = false;
  g.lastErr = '';
  g.startedAt = Date.now();

  g.played.add(track.url);
  addHistory(g.guildId, track);

  const proc = spawn(YTDLP, [...commonArgs(g.preferAlt), '-f', 'bestaudio/best', '--no-playlist', '-q', '-o', '-', '--', track.url], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  g.proc = proc;
  proc.stdout.on('error', () => {});
  proc.stderr.on('data', (d) => {
    g.lastErr = (g.lastErr + d).slice(-1500);
  });
  proc.on('error', (err) => {
    if (g.proc !== proc) return;
    g.failFlag = true;
    g.noted = true;
    notify(g, err.code === 'ENOENT' ? NOT_FOUND_MSG : `! เปิด yt-dlp ไม่ได้: ${err.message}`);
  });

  const resource = createAudioResource(proc.stdout, { inputType: StreamType.Arbitrary, inlineVolume: true });
  resource.volume.setVolume(g.volume);
  g.resource = resource;
  g.player.play(resource);
  postNowPlaying(g);
  startTicker(g);
}

// ---------- การ์ดกำลังเล่น (แดชบอร์ดสไตล์เทค) ----------
const EQ_CHARS = '▁▂▃▄▅▆▇█';
const VOL_STEP = 10; // กดปุ่ม VOL −/+ ครั้งละกี่ %

// อีควอไลเซอร์หลอกๆ ขยับทุกครั้งที่การ์ดถูกอัปเดต (เล่นอยู่=ขยับ, หยุด=ราบเรียบ)
const eqLine = (playing) =>
  Array.from({ length: 16 }, () => (playing ? EQ_CHARS[Math.floor(Math.random() * EQ_CHARS.length)] : EQ_CHARS[0])).join('');

function progressLine(g) {
  const t = g.current;
  const pos = Math.floor((g.resource?.playbackDuration ?? 0) / 1000);
  const len = 16;
  if (!(t.duration > 0)) return `${fmt(pos)} ${'▰'.repeat(len - 1)}◉ LIVE`;
  const head = Math.min(len - 1, Math.floor((Math.min(pos, t.duration) / t.duration) * len));
  return `${fmt(Math.min(pos, t.duration))} ${'▰'.repeat(head)}◉${'▱'.repeat(len - 1 - head)} ${fmt(t.duration)}`;
}

function volumeLine(g) {
  const pct = Math.round(g.volume * 100);
  const filled = Math.round(g.volume * 10);
  return `VOL ${'▮'.repeat(filled)}${'▯'.repeat(10 - filled)} ${String(pct).padStart(3)}%`;
}

function nowPlayingPayload(g) {
  const t = g.current;
  const paused = g.player.state.status === AudioPlayerStatus.Paused;
  const pct = Math.round(g.volume * 100);

  const dash = [
    '```',
    `${eqLine(!paused)}  ${paused ? '❚❚ PAUSED' : '▸ PLAYING'}`,
    progressLine(g),
    volumeLine(g),
    `LOOP ${g.loop.toUpperCase().padEnd(5)} │ QUEUE ${g.queue.length}`,
    '```',
  ].join('\n');

  const card = new ContainerBuilder().setAccentColor(paused ? 0x6b6b6b : 0xffffff);
  const head = [`### ◢◤ NOW PLAYING ◥◣`, `**${link(t)}**`, `-# ${t.author ? `${clean(t.author)} • ` : ''}${t.autoplay ? 'Autoplay • เริ่มโดย' : t.auto && g.genre ? `แนว ${g.genre.label} • เริ่มโดย` : 'ขอโดย'} <@${t.requestedBy}>`].join('\n');
  if (t.thumbnail?.startsWith('https://')) {
    card.addSectionComponents(new SectionBuilder().addTextDisplayComponents(text(head)).setThumbnailAccessory(new ThumbnailBuilder().setURL(t.thumbnail)));
  } else {
    card.addTextDisplayComponents(text(head));
  }
  card.addActionRowComponents(new ActionRowBuilder().addComponents(genreMenu(g)));
  card.addSeparatorComponents(divider()).addTextDisplayComponents(text(dash));

  const btn = (id, label) => new ButtonBuilder().setCustomId(`music:${id}`).setStyle(ButtonStyle.Secondary).setLabel(label);
  card
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text('### ▸ Quick Actions'))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        btn('pause', paused ? '▷ Resume' : '❚❚ Stop'),
        btn('skip', '⏭ Skip'),
        btn('add', '✚ Add Music'),
        btn('search', '🔎︎ Search'),
        btn('queue', '☰ Queue'),
      ),
      new ActionRowBuilder().addComponents(btn('fav', `${HEART} Favorite`), btn('hist', `${HOURGLASS} History`), btn('auto', `Auto: ${g.autoplay ? 'On' : 'Off'}`)),
      new ActionRowBuilder().addComponents(btn('volmodal', '၊၊||၊ Volume'), btn('controls', 'Controls')),
      
    );
  return { components: [card], flags: V2, allowedMentions: NO_PING };
}

// อัปเดตการ์ดเองทุก 10 วิ ให้แถบเวลาเดินและอีควอไลเซอร์ขยับ (ตอนหยุดชั่วคราวไม่ต้องอัปเดต)
function startTicker(g) {
  stopTicker(g);
  g.ticker = setInterval(() => {
    if (g.current && g.player.state.status === AudioPlayerStatus.Playing) refreshCard(g);
  }, 10_000);
  g.ticker.unref?.();
}
function stopTicker(g) {
  clearInterval(g.ticker);
  g.ticker = null;
}

function setVolume(g, v) {
  g.volume = Math.min(1, Math.max(0, v));
  g.resource?.volume?.setVolume(g.volume);
  if (g.volume > 0) g.lastVolume = g.volume; // จำไว้ใช้ตอนกดเลิก mute
}

function queuePayload(g, ephemeral = false) {
  const known = g.queue.reduce((sum, t) => sum + (t.duration ?? 0), 0);
  const lines = ['### ◢◤ QUEUE ◥◣'];
  lines.push(g.current ? `**กำลังเล่น:** ${link(g.current)} \`${fmt(g.current.duration)}\`` : '_ไม่มีเพลงที่กำลังเล่น_');
  if (g.queue.length) {
    lines.push('', ...g.queue.slice(0, 10).map((t, n) => `**${n + 1}.** ${link(t)} \`${fmt(t.duration)}\` • <@${t.requestedBy}>`));
    if (g.queue.length > 10) lines.push(`_...และอีก ${g.queue.length - 10} เพลง_`);
    lines.push(`-# ในคิว ${g.queue.length} เพลง • ความยาวรวมประมาณ ${fmt(known)}`);
  } else {
    lines.push('', '_คิวว่าง ใช้ `/play` เพื่อเพิ่มเพลง_');
  }
  lines.push(`-# Loop: ${LOOP_LABEL[g.loop]} • Vol ${Math.round(g.volume * 100)}%`);
  const card = new ContainerBuilder().setAccentColor(0xffffff).addTextDisplayComponents(text(lines.join('\n').slice(0, 3800)));
  if (g.queue.length) {
    // เมนูลบเพลงทีละเพลง (แสดง 25 เพลงแรกของคิว)
    card.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('music:rm')
          .setPlaceholder('เลือกเพลงที่จะลบออกจากคิว')
          .addOptions(
            g.queue.slice(0, 25).map((t, n) => ({
              label: `${n + 1}. ${t.title}`.slice(0, 100),
              description: `${t.author ?? 'ไม่ทราบศิลปิน'} • ${fmt(t.duration)}`.slice(0, 100),
              value: t.uid,
            })),
          ),
      ),
    );
  }
  return { components: [card], flags: ephemeral ? V2 | MessageFlags.Ephemeral : V2, allowedMentions: NO_PING };
}

// เมนูเลือกแนวเพลง (ใช้ทั้งบนการ์ด Now Playing และคอนโซลตอนยังไม่เล่น)
function genreMenu(g) {
  const cur = g?.genre?.key;
  const options = GENRES.map((x) => ({ label: x.label, value: x.key, default: x.key === cur }));
  if (cur) options.push({ label: 'ปิดโหมดเล่นตามแนว', value: 'off' });
  return new StringSelectMenuBuilder()
    .setCustomId('music:genre')
    .setPlaceholder(cur ? `แนวเพลง: ${g.genre.label}` : 'เลือกแนวเพลง (เล่นต่อเรื่อยๆ)')
    .addOptions(options);
}

// คอนโซลตอนยังไม่มีเพลงเล่น: เลือกแนวเพลง หรือกดเพิ่ม/ค้นหาเพลงเอง
function idleConsolePayload() {
  const mb = (id, label) => new ButtonBuilder().setCustomId(`music:${id}`).setStyle(ButtonStyle.Secondary).setLabel(label);
  const card = new ContainerBuilder()
    .setAccentColor(0xffffff)
    .addTextDisplayComponents(text('### ◢◤ MUSIC CONSOLE ◥◣\n-# ยังไม่มีเพลงเล่น เข้าห้องเสียงแล้วเลือกแนวเพลงด้านล่าง บอทจะเล่นต่อให้เรื่อยๆ หรือกดเพิ่มเพลงเองก็ได้'))
    .addActionRowComponents(new ActionRowBuilder().addComponents(genreMenu(null)))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text('### ▸ Quick Actions'))
    .addActionRowComponents(new ActionRowBuilder().addComponents(mb('add', '✚ Add Music'), mb('search', '🔎︎ Search')));
  return { components: [card], flags: V2, allowedMentions: NO_PING };
}

// แผงควบคุมเต็ม (ปุ่ม Controls) แสดงแบบ ephemeral เห็นคนเดียว
const LOOP_SHORT = { off: 'Off', track: 'Track', queue: 'Queue' };
function controlsPayload(g, ephemeral = false) {
  const paused = g.player.state.status === AudioPlayerStatus.Paused;
  const pct = Math.round(g.volume * 100);
  const b = (id, label) => new ButtonBuilder().setCustomId(`music:${id}:p`).setStyle(ButtonStyle.Secondary).setLabel(label);
  const row = (...btns) => new ActionRowBuilder().addComponents(...btns);

  const card = new ContainerBuilder()
    .setAccentColor(0xffffff)
    .addTextDisplayComponents(text(`### ◢◤ CONTROLS ◥◣\n-# ${g.current ? clean(g.current.title) : 'ไม่มีเพลงที่กำลังเล่น'}`))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text('**Playback**'))
    .addActionRowComponents(row(b('prev', '◀'), b('pause', paused ? '▷' : '❚❚'), b('skip', '▶'), b('stop', '◼')))
    .addTextDisplayComponents(text('**Music**'))
    .addActionRowComponents(row(b('queue', 'Queue'), b('add', 'Add'), b('search', 'Search'), b('clear', 'Clear'), b('shuffle', 'Shuffle')))
    .addTextDisplayComponents(text(`**Controls** • Vol ${pct}%`))
    .addActionRowComponents(
      row(
        b('loop', `Loop: ${LOOP_SHORT[g.loop]}`),
        b('vdown', 'Vol −').setDisabled(pct <= 0),
        b('mute', pct === 0 ? 'Unmute' : 'Mute'),
        b('vup', 'Vol +').setDisabled(pct >= 100),
        b('leave', 'Leave'),
      ),
    )
    .addTextDisplayComponents(text('**Library**'))
    .addActionRowComponents(row(b('fav', `${HEART} Favorite`), b('hist', `${HOURGLASS} History`), b('auto', `Auto: ${g.autoplay ? 'On' : 'Off'}`), b('rmsong', '— Remove Song')));
  return { components: [card], flags: ephemeral ? V2 | MessageFlags.Ephemeral : V2, allowedMentions: NO_PING };
}

// ---------- ห้องคอนโซลถาวร (/setconsole) ----------
// การ์ดเดียวที่ค้างไว้ในห้องที่ตั้ง: ตอนว่าง = เมนูเลือกแนวเพลง, ตอนเล่น = Now Playing, เพลงหมด = กลับเป็นหน้าว่าง
const consoleCfg = (guild) => db.musicConsole?.[guild.id] ?? null;

async function consoleChannel(guild) {
  const cfg = consoleCfg(guild);
  if (!cfg) return null;
  const ch = await guild.channels.fetch(cfg.channelId).catch(() => null);
  return ch?.isTextBased() ? ch : null;
}

async function consoleMessage(guild) {
  const ch = await consoleChannel(guild);
  return ch ? ch.messages.fetch(consoleCfg(guild).messageId).catch(() => null) : null;
}

// เอาข้อความคอนโซลมา ถ้าโดนลบไปแล้วให้โพสต์ใหม่
async function ensureConsole(guild) {
  const ch = await consoleChannel(guild);
  if (!ch) return null;
  const cfg = consoleCfg(guild);
  const old = await ch.messages.fetch(cfg.messageId).catch(() => null);
  if (old) return old;
  try {
    const msg = await ch.send(idleConsolePayload());
    cfg.messageId = msg.id;
    save();
    return msg;
  } catch (err) {
    console.error('โพสต์คอนโซลเพลงใหม่ไม่สำเร็จ:', err.message);
    return null;
  }
}

async function resetConsole(guild) {
  const msg = await ensureConsole(guild);
  if (!msg || states.get(guild.id)?.current) return; // มีเพลงเล่นอยู่ = ไม่ต้องรีเซ็ต
  msg.edit(idleConsolePayload()).catch(() => {});
}

// เลิกใช้การ์ดเพลงปัจจุบัน: ถ้าเป็นคอนโซลถาวรให้กลับเป็นหน้าว่าง ถ้าเป็นการ์ดธรรมดาให้ลบทิ้ง
function releaseCard(g) {
  const msg = g.nowMsg;
  g.nowMsg = null;
  if (!msg) return;
  if (g.persistent) resetConsole(g.guild);
  else msg.delete().catch(() => {});
}

// ห้องที่บอทจะส่งการ์ด/แจ้งเตือนเพลง: ห้องคอนโซลถ้าตั้งไว้ ไม่งั้นห้องที่สั่ง
function textChannelFor(i) {
  const cfg = consoleCfg(i.guild);
  const ch = cfg && i.guild.channels.cache.get(cfg.channelId);
  return ch?.isTextBased() ? ch : i.channel;
}

async function postNowPlaying(g) {
  const home = await ensureConsole(g.guild);
  if (!g.current || states.get(g.guildId) !== g) return;
  if (home) {
    try {
      await home.edit(nowPlayingPayload(g));
      if (states.get(g.guildId) === g) {
        if (g.nowMsg && g.nowMsg.id !== home.id && !g.persistent) g.nowMsg.delete().catch(() => {});
        g.nowMsg = home;
        g.persistent = true;
      }
      return;
    } catch (err) {
      console.error('อัปเดตคอนโซลเพลงไม่สำเร็จ:', err.message);
    }
  }
  const old = g.nowMsg;
  g.nowMsg = null;
  if (old && !g.persistent) old.delete().catch(() => {});
  g.persistent = false;
  try {
    const msg = await g.textChannel.send(nowPlayingPayload(g));
    if (states.get(g.guildId) !== g) return msg.delete().catch(() => {});
    g.nowMsg = msg;
  } catch (err) {
    console.error('ส่งการ์ดเพลงไม่สำเร็จ:', err.message);
  }
}

// รายการเพลงโปรดของคนนั้น: เมนูเลือกเล่น / เมนูเลือกลบ / ปุ่มเล่นทั้งหมด
function favoritesPayload(userId, ephemeral = false) {
  const flags = ephemeral ? V2 | MessageFlags.Ephemeral : V2;
  const list = favsOf(userId);
  const card = new ContainerBuilder().setAccentColor(0xffffff);
  if (!list.length) {
    card.addTextDisplayComponents(text(`### ◢◤ FAVORITES ◥◣\n_ยังไม่มีเพลงโปรด กดปุ่ม ${HEART} Favorite ตอนเพลงกำลังเล่นเพื่อเพิ่ม_`));
    return { components: [card], flags, allowedMentions: NO_PING };
  }
  const shown = list.filter((t) => t.url.length <= 100).slice(0, 25); // ค่าของตัวเลือกยาวได้ไม่เกิน 100 ตัวอักษร
  const lines = ['### ◢◤ FAVORITES ◥◣', ...shown.slice(0, 15).map((t, n) => `**${n + 1}.** [${clean(t.title)}](${t.url}) \`${fmt(t.duration)}\``)];
  if (shown.length > 15) lines.push(`_...และอีก ${shown.length - 15} เพลง_`);
  lines.push(`-# ทั้งหมด ${list.length} เพลง • เมนูแสดง 25 เพลงล่าสุดที่เพิ่ม`);
  const options = () =>
    shown.map((t) => ({ label: t.title.slice(0, 100), description: `${t.author ?? 'ไม่ทราบศิลปิน'} • ${fmt(t.duration)}`.slice(0, 100), value: t.url }));
  const bt = (id, label) => new ButtonBuilder().setCustomId(`music:${id}`).setStyle(ButtonStyle.Secondary).setLabel(label);
  card
    .addTextDisplayComponents(text(lines.join('\n').slice(0, 3800)))
    .addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('music:favplay').setPlaceholder('เลือกเพลงเพื่อเล่น').addOptions(options())))
    .addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('music:favrm').setPlaceholder('เลือกเพลงเพื่อลบออกจากเพลงโปรด').addOptions(options())))
    .addActionRowComponents(new ActionRowBuilder().addComponents(bt('favall', '▸ Play All'), bt('favshuf', 'Shuffle Play')));
  return { components: [card], flags, allowedMentions: NO_PING };
}

// เพลงที่เพิ่งเล่นในเซิร์ฟนี้ เลือกเล่นซ้ำได้
function historyPayload(guildId, ephemeral = false) {
  const flags = ephemeral ? V2 | MessageFlags.Ephemeral : V2;
  const list = recentOf(guildId).filter((t) => t.url.length <= 100).slice(0, 25);
  const card = new ContainerBuilder().setAccentColor(0xffffff);
  if (!list.length) {
    card.addTextDisplayComponents(text('### ◢◤ HISTORY ◥◣\n_ยังไม่มีประวัติการเล่นเพลง_'));
    return { components: [card], flags, allowedMentions: NO_PING };
  }
  const lines = [
    '### ◢◤ HISTORY ◥◣',
    ...list.slice(0, 15).map((t, n) => `**${n + 1}.** [${clean(t.title)}](${t.url}) \`${fmt(t.duration)}\` • <t:${Math.floor(t.at / 1000)}:R>`),
  ];
  if (list.length > 15) lines.push(`_...และอีก ${list.length - 15} เพลง_`);
  card
    .addTextDisplayComponents(text(lines.join('\n').slice(0, 3800)))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('music:hist')
          .setPlaceholder('เลือกเพลงเพื่อเล่นซ้ำ')
          .addOptions(list.map((t) => ({ label: t.title.slice(0, 100), description: `${t.author ?? 'ไม่ทราบศิลปิน'} • ${fmt(t.duration)}`.slice(0, 100), value: t.url }))),
      ),
    );
  return { components: [card], flags, allowedMentions: NO_PING };
}

const refreshCard = (g) => g.current && g.nowMsg?.edit(nowPlayingPayload(g)).catch(() => {});

// ---------- คำสั่ง ----------
function guardControl(i) {
  const g = states.get(i.guild.id);
  if (!g) return { error: '✕ ตอนนี้ไม่ได้เล่นเพลงอยู่เลย' };
  if (i.member?.voice?.channelId !== g.channelId) return { error: `✕ ต้องอยู่ในห้องเสียงเดียวกับบอท (<#${g.channelId}>) ก่อนนะ` };
  return { g };
}

async function playQuery(i, query, { genre = null, ephemeral = false, preset = null } = {}) {
  const vc = i.member?.voice?.channel;
  if (!vc) return i.reply({ content: '✕ เข้าห้องเสียงก่อนแล้วค่อยสั่งเล่นเพลงนะ', ...EPHEMERAL });
  if (vc.type !== ChannelType.GuildVoice) return i.reply({ content: '✕ เล่นเพลงได้เฉพาะห้องเสียงปกติ (ยังไม่รองรับ Stage)', ...EPHEMERAL });

  let g = states.get(i.guild.id);
  if (g && g.channelId !== vc.id) {
    return i.reply({ content: `✕ บอทกำลังเล่นเพลงอยู่ที่ห้อง <#${g.channelId}> เข้าห้องนั้นก่อน หรือรอให้เล่นจบนะ`, ...EPHEMERAL });
  }
  if (!g) {
    const me = i.guild.members.me;
    const perms = vc.permissionsFor(me);
    if (!perms?.has([P.ViewChannel, P.Connect, P.Speak])) {
      return i.reply({ content: `✕ บอทไม่มีสิทธิ์เข้าหรือพูดในห้อง <#${vc.id}> (ต้องมี View Channel, Connect, Speak)`, ...EPHEMERAL });
    }
    if (vc.userLimit && vc.members.size >= vc.userLimit && !perms.has(P.ManageChannels)) {
      return i.reply({ content: '✕ ห้องนี้เต็มแล้ว บอทเข้าไม่ได้', ...EPHEMERAL });
    }
  }

  await i.deferReply(ephemeral ? EPHEMERAL : undefined);

  const seen = new Set();
  let tracks;
  try {
    tracks = preset ?? (genre ? await genreTracks(genre, i.user.id, seen) : await resolveTracks(query, i.user.id));
  } catch (err) {
    if (err.friendly) return i.editReply(err.message);
    if (err.code === 'ENOENT') return i.editReply(NOT_FOUND_MSG);
    console.error('ค้นหาเพลงไม่สำเร็จ:', err.message);
    return i.editReply(`ค้นหาเพลงไม่สำเร็จ: ${lastError(err.stderr, err.killed ? 'ใช้เวลานานเกินไป' : 'เกิดข้อผิดพลาด')}`);
  }
  if (!tracks.length) return i.editReply('ไม่พบเพลงที่ค้นหา ลองเปลี่ยนคำค้นหา หรือใช้ลิงก์ตรงๆ');

  // ระหว่างค้นหา สถานะอาจเปลี่ยน (เช่น มีคนอื่นสั่ง /play ก่อน หรือมีคน /stop)
  g = states.get(i.guild.id);
  if (g && g.channelId !== vc.id) return i.editReply(`✕ บอทกำลังเล่นเพลงอยู่ที่ห้อง <#${g.channelId}> เข้าห้องนั้นก่อนนะ`);
  if (!g) {
    g = createState(i.guild, vc, textChannelFor(i));
    try {
      await entersState(g.connection, VoiceConnectionStatus.Ready, 20_000);
    } catch {
      destroyState(g);
      return i.editReply('✕ บอทเข้าห้องเสียงไม่สำเร็จ ลองใหม่อีกครั้งนะ');
    }
  }
  g.textChannel = textChannelFor(i);

  if (genre) {
    g.queue = []; // เปลี่ยนแนว = เริ่มคิวใหม่ตามแนวนั้น
    g.genre = { ...genre, by: i.user.id };
    g.genreSeen = seen;
  }

  const room = MAX_QUEUE - g.queue.length;
  if (room <= 0) return i.editReply(`✕ คิวเต็มแล้ว (สูงสุด ${MAX_QUEUE} เพลง)`);
  const added = tracks.slice(0, room);
  const wasIdle = !g.current;
  const position = g.queue.length + (g.current ? 1 : 0) + 1;
  g.queue.push(...added);
  if (wasIdle) advance(g);
  else if (genre) skipTrack(g); // กำลังเล่นอยู่ = ข้ามไปเพลงแรกของแนวใหม่เลย

  const first = added[0];
  if (genre) {
    return i.editReply({ content: `เปิดแนว **${genre.label}** แล้ว บอทจะเล่นต่อให้เรื่อยๆ (ปิดโหมดได้จากเมนูแนวเพลง หรือสั่ง /stop)`, allowedMentions: NO_PING });
  }
  if (added.length > 1) {
    return i.editReply({ content: `เพิ่ม **${added.length}** เพลงเข้าคิวแล้ว${added.length < tracks.length ? ' (คิวเต็มจึงเพิ่มได้เท่านี้)' : ''}`, allowedMentions: NO_PING });
  }
  return i.editReply({
    content: wasIdle ? `เริ่มเล่น **${clean(first.title)}**` : `+ เพิ่ม **${clean(first.title)}** เข้าคิวแล้ว (ลำดับที่ ${position} • ${fmt(first.duration)})`,
    allowedMentions: NO_PING,
  });
}

const playCommand = (i) => playQuery(i, i.options.getString('query', true));

async function setConsoleCommand(i) {
  const cfg = consoleCfg(i.guild);

  if (i.options.getBoolean('remove')) {
    if (!cfg) return i.reply({ content: 'ยังไม่ได้ตั้งห้องคอนโซลเพลง', ...EPHEMERAL });
    await i.deferReply(EPHEMERAL);
    (await consoleMessage(i.guild))?.delete().catch(() => {});
    delete db.musicConsole[i.guild.id];
    save();
    const g = states.get(i.guild.id);
    if (g?.persistent) {
      g.nowMsg = null;
      g.persistent = false;
      if (g.current) postNowPlaying(g);
    }
    return i.editReply('ยกเลิกห้องคอนโซลเพลงแล้ว');
  }

  const perms = i.channel.permissionsFor(i.guild.members.me);
  if (!perms?.has([P.ViewChannel, P.SendMessages])) return i.reply({ content: 'บอทไม่มีสิทธิ์ส่งข้อความในห้องนี้', ...EPHEMERAL });

  await i.deferReply(EPHEMERAL);
  const old = await consoleMessage(i.guild);
  let msg;
  try {
    msg = await i.channel.send(idleConsolePayload());
  } catch (err) {
    console.error('โพสต์คอนโซลเพลงไม่สำเร็จ:', err.message);
    return i.editReply('โพสต์คอนโซลไม่สำเร็จ ตรวจสิทธิ์ของบอทในห้องนี้ดูนะ');
  }
  old?.delete().catch(() => {});
  db.musicConsole ??= {};
  db.musicConsole[i.guild.id] = { channelId: i.channel.id, messageId: msg.id };
  save();

  const g = states.get(i.guild.id);
  if (g) {
    g.textChannel = i.channel;
    g.nowMsg = null;
    g.persistent = false;
    if (g.current) postNowPlaying(g); // กำลังเล่นอยู่ = ย้ายการ์ดมาไว้ในคอนโซลใหม่
  }
  return i.editReply(`ตั้งห้อง <#${i.channel.id}> เป็นคอนโซลเพลงแล้ว การ์ดจะค้างอยู่ในห้องนี้ตลอด`);
}

async function musicConsole(i) {
  const cfg = consoleCfg(i.guild);
  if (cfg) {
    const url = `https://discord.com/channels/${i.guild.id}/${cfg.channelId}/${cfg.messageId}`;
    return i.reply({ content: `คอนโซลเพลงอยู่ที่ <#${cfg.channelId}> ${url}`, ...EPHEMERAL });
  }
  const g = states.get(i.guild.id);
  if (g?.current) {
    if (i.member?.voice?.channelId !== g.channelId) return i.reply({ content: `✕ ต้องอยู่ในห้องเสียงเดียวกับบอท (<#${g.channelId}>) ก่อนนะ`, ...EPHEMERAL });
    g.textChannel = i.channel;
    await i.reply({ content: 'เปิดคอนโซลในห้องนี้แล้ว', ...EPHEMERAL });
    return postNowPlaying(g); // ย้ายการ์ดมาไว้ห้องที่สั่ง
  }
  return i.reply(idleConsolePayload());
}

function skipTrack(g) {
  if (g.player.state.status === AudioPlayerStatus.Idle) return advance(g, { skipped: true });
  g.skipFlag = true;
  g.player.stop(true);
}

function togglePause(g) {
  if (g.player.state.status === AudioPlayerStatus.Paused) {
    g.player.unpause();
    return false;
  }
  g.player.pause();
  return true;
}

function cycleLoop(g) {
  g.loop = g.loop === 'off' ? 'track' : g.loop === 'track' ? 'queue' : 'off';
}

function playFavorites(i, doShuffle) {
  let list = favsOf(i.user.id).slice(0, MAX_QUEUE).map((t) => stamp(t, i.user.id));
  if (!list.length) return i.reply({ content: `ยังไม่มีเพลงโปรด กดปุ่ม ${HEART} Favorite ตอนเพลงกำลังเล่นเพื่อเพิ่ม`, ...EPHEMERAL });
  if (doShuffle) list = shuffle(list);
  return playQuery(i, '', { preset: list });
}

const control = (fn) => async (i) => {
  const { g, error } = guardControl(i);
  if (error) return i.reply({ content: error, ...EPHEMERAL });
  return fn(i, g);
};

const commandHandlers = {
  play: playCommand,
  music: musicConsole,
  setconsole: setConsoleCommand,

  pause: control((i, g) => {
    if (!g.current) return i.reply({ content: '✕ ไม่มีเพลงที่กำลังเล่น', ...EPHEMERAL });
    if (g.player.state.status === AudioPlayerStatus.Paused) return i.reply({ content: 'หยุดอยู่แล้ว ใช้ `/resume` เพื่อเล่นต่อ', ...EPHEMERAL });
    togglePause(g);
    refreshCard(g);
    return i.reply('หยุดเพลงชั่วคราวแล้ว');
  }),

  resume: control((i, g) => {
    if (g.player.state.status !== AudioPlayerStatus.Paused) return i.reply({ content: 'เพลงไม่ได้หยุดอยู่นะ', ...EPHEMERAL });
    togglePause(g);
    refreshCard(g);
    return i.reply('เล่นต่อแล้ว');
  }),

  skip: control((i, g) => {
    if (!g.current) return i.reply({ content: '✕ ไม่มีเพลงที่กำลังเล่น', ...EPHEMERAL });
    const title = clean(g.current.title);
    skipTrack(g);
    return i.reply({ content: `ข้าม **${title}** แล้ว`, allowedMentions: NO_PING });
  }),

  stop: control((i, g) => {
    destroyState(g);
    return i.reply('หยุดเล่น ล้างคิว และออกจากห้องเสียงแล้ว');
  }),

  leave: control((i, g) => {
    destroyState(g);
    return i.reply('บอทออกจากห้องเสียงแล้ว');
  }),

  queue: control((i, g) => i.reply(queuePayload(g))),

  clearqueue: control((i, g) => {
    const n = g.queue.length;
    if (!n) return i.reply({ content: '✕ ในคิวไม่มีเพลงให้ล้าง', ...EPHEMERAL });
    g.queue = [];
    refreshCard(g);
    return i.reply(`ล้างคิวแล้ว (เอาออก ${n} เพลง) เพลงที่กำลังเล่นยังเล่นต่อ`);
  }),

  nowplaying: control((i, g) => {
    if (!g.current) return i.reply({ content: '✕ ไม่มีเพลงที่กำลังเล่น', ...EPHEMERAL });
    return i.reply(nowPlayingPayload(g));
  }),

  loop: control((i, g) => {
    g.loop = i.options.getString('mode', true);
    refreshCard(g);
    return i.reply(`โหมดวนเพลง: **${LOOP_LABEL[g.loop]}**`);
  }),

  shuffle: control((i, g) => {
    if (g.queue.length < 2) return i.reply({ content: '✕ ในคิวมีไม่ถึง 2 เพลง ไม่ต้องสับ', ...EPHEMERAL });
    g.queue = shuffle(g.queue);
    refreshCard(g);
    return i.reply('สับคิวเพลงใหม่แล้ว');
  }),

  volume: control((i, g) => {
    const level = i.options.getInteger('level', true);
    setVolume(g, level / 100);
    refreshCard(g);
    return i.reply(`ปรับเสียงเป็น **${level}%**`);
  }),

  favorite: async (i) => {
    const sub = i.options.getSubcommand();
    if (sub === 'list') return i.reply(favoritesPayload(i.user.id, true));
    if (sub === 'add') {
      const g = states.get(i.guild.id);
      if (!g?.current) return i.reply({ content: '✕ ไม่มีเพลงที่กำลังเล่น', ...EPHEMERAL });
      if (favsOf(i.user.id).some((f) => f.url === g.current.url)) return i.reply({ content: 'เพลงนี้อยู่ในเพลงโปรดแล้ว', ...EPHEMERAL });
      toggleFavorite(i.user.id, g.current);
      return i.reply({ content: `เพิ่ม **${clean(g.current.title)}** เข้าเพลงโปรดแล้ว`, allowedMentions: NO_PING, ...EPHEMERAL });
    }
    return playFavorites(i, i.options.getBoolean('shuffle') ?? false);
  },

  history: (i) => i.reply(historyPayload(i.guild.id, true)),

  autoplay: async (i) => {
    const g = states.get(i.guild.id);
    if (g) {
      const { error } = guardControl(i);
      if (error) return i.reply({ content: error, ...EPHEMERAL });
    }
    const mode = i.options.getString('mode');
    const next = mode ? mode === 'on' : !(g ? g.autoplay : db.musicAuto?.[i.guild.id]);
    setAutoplay(i.guild, next);
    return i.reply(next ? 'Autoplay: **เปิด** เมื่อคิวหมด บอทจะหาเพลงที่คล้ายกันมาเล่นต่อให้' : 'Autoplay: **ปิด**');
  },

  remove: control((i, g) => {
    const pos = i.options.getInteger('position');
    if (!pos) return i.reply(queuePayload(g, true)); // ไม่ใส่ลำดับ = ขึ้นเมนูให้เลือกเพลงที่จะลบ
    if (pos > g.queue.length) return i.reply({ content: `✕ ในคิวมี ${g.queue.length} เพลง (ดูลำดับจาก /queue)`, ...EPHEMERAL });
    const [gone] = g.queue.splice(pos - 1, 1);
    refreshCard(g);
    return i.reply({ content: `เอา **${clean(gone.title)}** ออกจากคิวแล้ว`, allowedMentions: NO_PING });
  }),
};

// ---------- ปุ่ม / เมนู / ฟอร์ม บนการ์ด ----------
const modal = (id, title, label, placeholder, { max = 300, value } = {}) => {
  const input = new TextInputBuilder().setCustomId('value').setLabel(label).setStyle(TextInputStyle.Short).setPlaceholder(placeholder).setRequired(true).setMaxLength(max);
  if (value) input.setValue(value);
  return new ModalBuilder().setCustomId(`music:${id}`).setTitle(title).addComponents(new ActionRowBuilder().addComponents(input));
};

const errorText = (err) => {
  if (err.friendly) return err.message;
  if (err.code === 'ENOENT') return NOT_FOUND_MSG;
  return `ค้นหาเพลงไม่สำเร็จ: ${lastError(err.stderr, err.killed ? 'ใช้เวลานานเกินไป' : 'เกิดข้อผิดพลาด')}`;
};

// ตรวจเฉพาะว่าอยู่ห้องเสียง (ใช้กับปุ่มที่กดได้แม้ยังไม่มีเพลงเล่น)
function memberVoiceError(i) {
  if (!i.member?.voice?.channel) return '✕ เข้าห้องเสียงก่อนนะ';
  const g = states.get(i.guild.id);
  if (g && i.member.voice.channelId !== g.channelId) return `✕ บอทอยู่ที่ห้อง <#${g.channelId}> เข้าห้องนั้นก่อนนะ`;
  return null;
}

async function pickGenre(i) {
  const key = i.values[0];
  if (key === 'off') {
    const { g, error } = guardControl(i);
    if (error) return i.reply({ content: error, ...EPHEMERAL });
    g.genre = null;
    refreshCard(g);
    return i.reply({ content: 'ปิดโหมดเล่นตามแนวแล้ว (เพลงที่เหลือในคิวยังเล่นต่อจนหมด)', ...EPHEMERAL });
  }
  const genre = GENRES.find((x) => x.key === key);
  if (!genre) return i.deferUpdate();

  await playQuery(i, genre.label, { genre, ephemeral: true });

  // ถ้าเลือกจากคอนโซลตอนว่าง ลบข้อความคอนโซลทิ้ง (การ์ด Now Playing จะโผล่แทน)
  const g = states.get(i.guild.id);
  if (g?.genre?.key === key && i.message && i.message.id !== g.nowMsg?.id && i.message.id !== consoleCfg(i.guild)?.messageId) i.message.delete().catch(() => {});
}

// เมนูเลือก (select) ทั้งหมดของระบบเพลง
async function musicSelect(i) {
  const value = i.values[0];
  switch (i.customId) {
    case 'music:genre':
      return pickGenre(i);

    case 'music:rm': {
      // ลบเพลงที่เลือกออกจากคิว (ระบุด้วย uid ไม่ใช่ลำดับ กันลบผิดเพลงถ้าคิวขยับระหว่างนั้น)
      const { g, error } = guardControl(i);
      if (error) return i.reply({ content: error, ...EPHEMERAL });
      const at = g.queue.findIndex((t) => t.uid === value);
      if (at >= 0) {
        g.queue.splice(at, 1);
        refreshCard(g);
      }
      return i.update(queuePayload(g));
    }

    case 'music:favrm': {
      const list = db.musicFavorites?.[i.user.id];
      const at = list?.findIndex((f) => f.url === value) ?? -1;
      if (at >= 0) {
        list.splice(at, 1);
        save();
      }
      return i.update(favoritesPayload(i.user.id));
    }

    case 'music:favplay':
    case 'music:hist': {
      const source = i.customId === 'music:hist' ? recentOf(i.guild.id) : favsOf(i.user.id);
      const saved = source.find((t) => t.url === value);
      return playQuery(i, value, { preset: saved ? [stamp(saved, i.user.id)] : null });
    }

    default:
      return playQuery(i, value); // music:pick = เลือกจากผลค้นหา
  }
}

async function musicComponent(i) {
  if (i.isModalSubmit()) return; // ฟอร์มจัดการใน musicModal() ด้านล่าง
  if (i.isStringSelectMenu()) return musicSelect(i);

  const [, action, from] = i.customId.split(':');

  // ปุ่มที่ใช้ได้แม้ยังไม่มีเพลงเล่น (คอนโซลตอนว่าง)
  if (action === 'add' || action === 'search') {
    const err = memberVoiceError(i);
    if (err) return i.reply({ content: err, ...EPHEMERAL });
    return i.showModal(
      action === 'add'
        ? modal('addmodal', 'Add Music', 'ชื่อเพลง หรือ ลิงก์', 'ชื่อเพลง / ลิงก์ YouTube, SoundCloud (เพลย์ลิสต์ได้)')
        : modal('searchmodal', 'Search Music', 'ค้นหาเพลง', 'ชื่อเพลง หรือศิลปิน', { max: 200 }),
    );
  }

  // ปุ่มคลังเพลง: ไม่ต้องอยู่ห้องเสียงก็กดได้
  if (action === 'fav') {
    const cur = states.get(i.guild.id)?.current;
    if (!cur) return i.reply({ content: '✕ ไม่มีเพลงที่กำลังเล่น', ...EPHEMERAL });
    const added = toggleFavorite(i.user.id, cur);
    return i.reply({ content: `${added ? 'เพิ่ม' : 'เอา'} **${clean(cur.title)}** ${added ? 'เข้า' : 'ออกจาก'}เพลงโปรดแล้ว`, allowedMentions: NO_PING, ...EPHEMERAL });
  }
  if (action === 'hist') return i.reply(historyPayload(i.guild.id, true));
  if (action === 'favall' || action === 'favshuf') return playFavorites(i, action === 'favshuf');

  const { g, error } = guardControl(i);
  if (error) return i.reply({ content: error, ...EPHEMERAL });
  if (!g.current) return i.reply({ content: '✕ ไม่มีเพลงที่กำลังเล่น', ...EPHEMERAL });

  const fromPanel = from === 'p'; // กดมาจากแผง Controls
  const done = () => {
    if (fromPanel) {
      refreshCard(g);
      return i.update(controlsPayload(g));
    }
    return i.update(nowPlayingPayload(g));
  };
  const closed = (msg) =>
    fromPanel ? i.update({ components: [new ContainerBuilder().addTextDisplayComponents(text(msg))], flags: V2 }) : i.deferUpdate();

  switch (action) {
    case 'pause':
      togglePause(g);
      return done();
    case 'loop':
      cycleLoop(g);
      return done();
    case 'shuffle':
      if (g.queue.length >= 2) g.queue = shuffle(g.queue);
      return done();
    case 'vdown':
      setVolume(g, Math.max(0, Math.round(g.volume * 100) - VOL_STEP) / 100);
      return done();
    case 'vup':
      setVolume(g, Math.min(100, Math.round(g.volume * 100) + VOL_STEP) / 100);
      return done();
    case 'mute':
      setVolume(g, g.volume > 0 ? 0 : g.lastVolume);
      return done();
    case 'clear': {
      if (!g.queue.length) return i.reply({ content: '✕ ในคิวไม่มีเพลงให้ล้าง', ...EPHEMERAL });
      g.queue = [];
      return done();
    }
    case 'prev': {
      const prev = g.history.pop();
      if (!prev) return i.reply({ content: '✕ ไม่มีเพลงก่อนหน้า', ...EPHEMERAL });
      g.noHistory = true; // เพลงที่ถูกย้อนออกมาไม่ต้องนับเข้าประวัติ
      g.queue.unshift(...(g.loop === 'queue' ? [prev] : [prev, g.current]));
      skipTrack(g); // การ์ดนี้จะถูกแทนที่ด้วยการ์ดเพลงที่ย้อนกลับ
      return i.deferUpdate();
    }
    case 'skip':
      skipTrack(g); // การ์ดนี้จะถูกแทนที่ด้วยการ์ดเพลงถัดไป
      return i.deferUpdate();
    case 'stop':
      destroyState(g);
      return closed('หยุดเล่น ล้างคิว และออกจากห้องเสียงแล้ว');
    case 'leave':
      destroyState(g);
      return closed('บอทออกจากห้องเสียงแล้ว');
    case 'queue':
      return i.reply(queuePayload(g, true));
    case 'controls':
      return i.reply(controlsPayload(g, true));
    case 'auto':
      setAutoplay(g.guild, !g.autoplay);
      return done();
    case 'rmsong':
      return i.reply(queuePayload(g, true)); // มีเมนูเลือกลบเพลงทีละเพลงอยู่ในนั้น
    case 'volmodal':
      return i.showModal(modal('volmodal', '၊၊||၊ Volume', 'ระดับเสียง (0-100)', 'เช่น 30', { max: 3, value: String(Math.round(g.volume * 100)) }));
  }
}

// ฟอร์ม (modal) ที่เด้งจากปุ่ม Add Music / Search / ၊၊||၊ Volume
async function musicModal(i) {
  if (!i.isModalSubmit() || !i.customId.startsWith('music:')) return;
  const kind = i.customId.split(':')[1];
  const value = i.fields.getTextInputValue('value').trim();

  try {
    if (kind === 'addmodal') return await playQuery(i, value);

    if (kind === 'volmodal') {
      const { g, error } = guardControl(i);
      if (error) return i.reply({ content: error, ...EPHEMERAL });
      const level = Number(value);
      if (!Number.isInteger(level) || level < 0 || level > 100) return i.reply({ content: '✕ ใส่ตัวเลข 0-100 เท่านั้นนะ', ...EPHEMERAL });
      setVolume(g, level / 100);
      refreshCard(g);
      return i.reply({ content: `ปรับเสียงเป็น **${level}%**`, ...EPHEMERAL });
    }

    if (kind === 'searchmodal') {
      const err = memberVoiceError(i);
      if (err) return i.reply({ content: err, ...EPHEMERAL });
      if (/^https?:\/\//i.test(value)) return await playQuery(i, value); // ถ้าใส่ลิงก์มา เล่นเลย

      await i.deferReply(EPHEMERAL);
      let tracks;
      try {
        tracks = await resolveTracks(value, i.user.id, 5);
      } catch (err) {
        if (!err.friendly && err.code !== 'ENOENT') console.error('ค้นหาเพลงไม่สำเร็จ:', err.message);
        return i.editReply(errorText(err));
      }
      tracks = tracks.filter((t) => t.url.length <= 100); // ค่าของตัวเลือกยาวได้ไม่เกิน 100 ตัวอักษร
      if (!tracks.length) return i.editReply('ไม่พบเพลงที่ค้นหา ลองเปลี่ยนคำค้นหา');

      const menu = new StringSelectMenuBuilder()
        .setCustomId('music:pick')
        .setPlaceholder('เลือกเพลงที่จะเพิ่มเข้าคิว')
        .addOptions(
          tracks.map((t) => ({
            label: t.title.slice(0, 100),
            description: `${t.author ?? 'ไม่ทราบศิลปิน'} • ${fmt(t.duration)}`.slice(0, 100),
            value: t.url,
          })),
        );
      return i.editReply({ content: `ผลการค้นหา **${clean(value)}** เลือกเพลงที่ต้องการได้เลย`, components: [new ActionRowBuilder().addComponents(menu)] });
    }
  } catch (err) {
    console.error('ฟอร์มเพลงผิดพลาด:', err.message);
  }
}

// ---------- ออกจากห้องเมื่อไม่มีคนอยู่ ----------
function checkAlone(g) {
  const ch = g.guild.channels.cache.get(g.channelId);
  const humans = ch?.members?.filter((m) => !m.user.bot).size ?? 0;
  if (humans > 0) {
    clearTimeout(g.aloneTimer);
    g.aloneTimer = null;
    return;
  }
  if (g.aloneTimer) return;
  g.aloneTimer = setTimeout(() => {
    g.aloneTimer = null;
    if (states.get(g.guildId) !== g) return;
    const room = g.guild.channels.cache.get(g.channelId);
    if ((room?.members?.filter((m) => !m.user.bot).size ?? 0) > 0) return;
    notify(g, 'ไม่มีใครอยู่ในห้องเสียงแล้ว บอทขอออกนะ');
    destroyState(g);
  }, ALONE_LEAVE_MS);
  g.aloneTimer.unref?.();
}

function onVoiceState(oldState, newState) {
  const g = states.get(newState.guild.id);
  if (!g) return;
  if (newState.id === newState.guild.members.me?.id) {
    if (newState.channelId) g.channelId = newState.channelId; // ถูกย้ายห้อง
    else return; // หลุดออกจากห้อง ให้ connection จัดการเอง
  } else if (oldState.channelId !== g.channelId && newState.channelId !== g.channelId) {
    return;
  }
  checkAlone(g);
}

export { commandHandlers };
export const componentHandlers = { music: musicComponent };

export function register(client) {
  client.on(Events.VoiceStateUpdate, onVoiceState);
  client.on(Events.InteractionCreate, musicModal);
  // เปิดบอทใหม่ = คอนโซลที่ค้างอยู่ให้กลับเป็นหน้าว่าง (ปุ่มเก่าจะใช้ไม่ได้แล้ว)
  const resetAll = () => {
    for (const guildId of Object.keys(db.musicConsole ?? {})) {
      const guild = client.guilds.cache.get(guildId);
      if (guild) resetConsole(guild);
    }
  };
  if (client.isReady()) resetAll();
  else client.once(Events.ClientReady, resetAll);
  client.on(Events.GuildDelete, (guild) => {
    const g = states.get(guild.id);
    if (g) destroyState(g);
  });
}