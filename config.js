// ============================================================
//  MeowPailong Bot - ตั้งค่าฉายาทั้งหมดอยู่ที่ไฟล์นี้
//  ค่าเริ่มต้นของเซิร์ฟ "บ้านเรา" (เซิร์ฟที่ GUILD_ID ใน .env ตรงกัน)
//  เซิร์ฟอื่นที่เชิญบอทไปไม่ใช้ค่าในไฟล์นี้ ต้องตั้งเองด้วย /setup
// ============================================================

// true = ชื่อฉายาใช้ฟอนต์ตัวหนา 𝐋𝐢𝐤𝐞 𝐓𝐡𝐢𝐬 | false = ตัวอักษรธรรมดา (ปลอดภัยกับทุกเครื่อง)
const FANCY = true;

const bold = (s) =>
  [...s]
    .map((c) => {
      const code = c.codePointAt(0);
      if (code >= 65 && code <= 90) return String.fromCodePoint(0x1d400 + code - 65);
      if (code >= 97 && code <= 122) return String.fromCodePoint(0x1d41a + code - 97);
      return c;
    })
    .join('');

const nm = (emoji, text) => `${emoji} ${FANCY ? bold(text) : text}`;

// ---------- หน้าตาแผงรับฉายา (Components V2) ----------
export const PANEL_COLOR = 0xf15bb5; // สีแถบด้านซ้ายของการ์ด
export const BANNER_URL = 'https://media.discordapp.net/attachments/796645548429017109/1559119247223947334/MeowPailong_Neon_Roles_Banner.png?ex=6acdea73&is=6acc98f3&hm=9086c4b5594c666afd512020ed87434740eececfdd208d00a42e6088753ab1ea&=&format=webp&quality=lossless&width=2048&height=683'; // ใส่ลิงก์รูปแบนเนอร์ตรงนี้ (https://...) เว้นว่าง = ไม่แสดงแบนเนอร์

// ---------- ฉายาที่กดรับเองผ่านการ์ด ----------
// exclusive: true = เลือกได้ทีละอัน (กดอันใหม่จะถอดอันเก่าให้)
// ui: 'buttons' = แถวปุ่ม | 'select' = เมนู dropdown | 'toggle' = แถวละฉายา มีปุ่มสลับรับ/ถอดด้านขวา
export const GROUPS = [
  {
    id: 'gender',
    ui: 'buttons',
    exclusive: true,
    color: 0xf15bb5,
    title: '👤 เลือกเพศของคุณ',
    description: 'เลือกได้ **1 อย่าง** กดซ้ำเพื่อถอดฉายา',
    roles: [
      { key: 'tomcat', emoji: '♂️', label: 'Tomcat', name: nm('♂️', 'Tomcat'), color: '#4CC9F0' },
      { key: 'queencat', emoji: '♀️', label: 'Queen Cat', name: nm('♀️', 'Queen Cat'), color: '#F15BB5' },
      { key: 'rainbowcat', emoji: '🌈', label: 'Rainbow Cat', name: nm('🌈', 'Rainbow Cat'), color: '#FEE440' },
      { key: 'mysterycat', emoji: '❔', label: 'Mystery Cat', name: nm('❔', 'Mystery Cat'), color: '#8D99AE' },
    ],
  },
  {
    id: 'interest',
    ui: 'select',
    exclusive: false,
    color: 0x9b5de5,
    title: '🎯 เลือกความสนใจ',
    description: 'เลือกได้ **หลายอย่าง** เลือกใหม่ได้ทุกครั้ง ฉายาจะอัปเดตให้ตรงกับที่เลือก',
    roles: [
      { key: 'gamer', emoji: '🎮', label: 'Gamer Cat', name: nm('🎮', 'Gamer Cat'), color: '#9B5DE5' },
      { key: 'movie', emoji: '🎬', label: 'Movie Cat', name: nm('🎬', 'Movie Cat'), color: '#F15BB5' },
      { key: 'music', emoji: '🎵', label: 'Music Cat', name: nm('🎵', 'Music Cat'), color: '#00BBF9' },
      { key: 'art', emoji: '🎨', label: 'Art Cat', name: nm('🎨', 'Art Cat'), color: '#F77F00' },
      { key: 'foodie', emoji: '🍜', label: 'Foodie Cat', name: nm('🍜', 'Foodie Cat'), color: '#FEE440' },
      { key: 'anime', emoji: '📚', label: 'Anime Cat', name: nm('📚', 'Anime Cat'), color: '#00F5D4' },
    ],
  },
  {
    id: 'notify',
    ui: 'toggle',
    exclusive: false,
    color: 0x00bbf9,
    title: '🔔 รับแจ้งเตือน',
    description: 'อยากให้เรียกตอนมีอะไร กดรับได้เลย',
    roles: [
      { key: 'alert', emoji: '🔔', label: 'Meow Alert', desc: 'แจ้งเตือนข่าวและประกาศทั่วไป', name: nm('🔔', 'Meow Alert'), color: '#FFD166' },
      { key: 'movienight', emoji: '🍿', label: 'Movie Night', desc: 'เรียกตอนมีนัดดูหนังด้วยกัน', name: nm('🍿', 'Movie Night Crew'), color: '#EF476F' },
      { key: 'gamenight', emoji: '🎯', label: 'Game Night', desc: 'เรียกตอนมีนัดเล่นเกมด้วยกัน', name: nm('🎯', 'Game Night Crew'), color: '#06D6A0' },
    ],
  },
];

// ---------- ฉายาอื่นๆ ที่ /setup panel จะสร้างให้ถ้ายังไม่มี (เฉพาะเซิร์ฟบ้านเรา) ----------
// ฉายาเหล่านี้ "ไม่ได้ให้สิทธิ์พิเศษ" อะไรเลย ไปตั้งสิทธิ์เองใน Server Settings
export const EXTRA_ROLES = [
  // สตาฟ
  { name: nm('🐉', 'Pailong Lord'), color: '#9B5DE5', hoist: true },
  { name: nm('👑', 'Cat King'), color: '#F15BB5', hoist: true },
  { name: nm('🛡', 'Cat Guard'), color: '#00BBF9', hoist: true },
  { name: nm('🧶', 'Cat Assistant'), color: '#00F5D4', hoist: true },
  // พิเศษ
  { name: nm('💎', 'Sponsor Cat'), color: '#FF9EE5', hoist: true },
  { name: nm('⭐', 'VIP Kitten'), color: '#FEE440', hoist: true },
  { name: nm('🎨', 'Creator Cat'), color: '#F77F00', hoist: false },
  // สมาชิก + เลเวล
  { name: nm('🐾', 'Meow Member'), color: '#B8C0FF', hoist: false },
  { name: nm('🎂', 'Birthday Cat'), color: '#FFADAD', hoist: false },
  { name: nm('🥛', 'Newborn Kitten'), color: '#E0E1DD', hoist: false },
  { name: nm('🐱', 'Kitten'), color: '#CDB4DB', hoist: false },
  { name: nm('😸', 'House Cat'), color: '#BDE0FE', hoist: false },
  { name: nm('😼', 'Street Cat'), color: '#A2D2FF', hoist: false },
  { name: nm('🐈‍⬛', 'Night Prowler'), color: '#7B2CBF', hoist: false },
  { name: nm('🐅', 'Wild Cat'), color: '#F77F00', hoist: false },
  { name: nm('🐉', 'Meow Dragon'), color: '#FF006E', hoist: false },
];

// ---------- ค่าอื่นๆ ของเซิร์ฟบ้านเรา ----------
export const MEMBER_ROLE = nm('🐾', 'Meow Member'); // แจกอัตโนมัติตอนเข้าเซิร์ฟ
export const BIRTHDAY_ROLE = nm('🎂', 'Birthday Cat'); // แจกในวันเกิด
export const HUB_NAME = '➕｜Create Room'; // เข้าห้องเสียงชื่อนี้ = บอทสร้างห้องส่วนตัวให้

// เขตเวลาเริ่มต้น (ชั่วโมงจาก UTC) ไทย = 7 | เซิร์ฟอื่นปรับได้ด้วย /setup timezone
export const UTC_OFFSET_HOURS = 7;

// XP จากการพิมพ์ (ได้ครั้งละ min-max ทุกๆ cooldownMs)
export const XP = { min: 15, max: 25, cooldownMs: 60_000 };

// ฉายาตามเลเวล (ได้ฉายาล่าสุดที่ถึงเลเวลแล้ว ฉายาอื่นในลิสต์นี้จะถูกถอดให้)
const lv = (level, emoji, text) => ({ level, name: nm(emoji, text) });
export const LEVEL_ROLES = [
  lv(0, '🥛', 'Newborn Kitten'),
  lv(5, '🐱', 'Kitten'),
  lv(10, '😸', 'House Cat'),
  lv(20, '😼', 'Street Cat'),
  lv(30, '🐈‍⬛', 'Night Prowler'),
  lv(40, '🐅', 'Wild Cat'),
  lv(50, '🐉', 'Meow Dragon'),
];

// /event movie | game  (voiceName = ห้องเสียงเริ่มต้น, roleKey = ฉายาที่แท็กตอนประกาศ)
export const EVENT_TYPES = {
  movie: { emoji: '🍿', label: 'นัดดูหนัง', color: 0xef476f, voiceName: '🎬｜Cinema', roleKey: 'movienight' },
  game: { emoji: '🎮', label: 'นัดเล่นเกม', color: 0x06d6a0, voiceName: '🎮｜Gaming 1', roleKey: 'gamenight' },
};

// คำถาม /trivia  (answer = ลำดับตัวเลือกที่ถูก เริ่มจาก 0 | ตัวเลือกไม่เกิน 5 ข้อ)
export const TRIVIA = [
  { q: 'ดาวเคราะห์ดวงใดใหญ่ที่สุดในระบบสุริยะ?', choices: ['ดาวพฤหัสบดี', 'ดาวเสาร์', 'ดาวเนปจูน', 'โลก'], answer: 0 },
  { q: 'เมืองหลวงของประเทศญี่ปุ่นคือที่ใด?', choices: ['โอซาก้า', 'เกียวโต', 'โตเกียว', 'นาโกย่า'], answer: 2 },
  { q: 'ใครเป็นผู้แต่งนิยายชุด "แฮร์รี่ พอตเตอร์"?', choices: ['เจ.เค. โรว์ลิ่ง', 'สตีเฟน คิง', 'ซูซาน คอลลินส์', 'ทอลคีน'], answer: 0 },
  { q: 'ธาตุที่มีสัญลักษณ์ทางเคมีว่า "Au" คือธาตุใด?', choices: ['เงิน', 'ทองคำ', 'อะลูมิเนียม', 'ทองแดง'], answer: 1 },
  { q: 'มหาสมุทรใดใหญ่ที่สุดในโลก?', choices: ['แอตแลนติก', 'อินเดีย', 'แปซิฟิก', 'อาร์กติก'], answer: 2 },
  { q: 'หนวดของแมวมีหน้าที่หลักคืออะไร?', choices: ['รับสัมผัสและช่วยวัดระยะ', 'ช่วยฟังเสียง', 'ช่วยย่อยอาหาร', 'ช่วยให้ตัวอุ่น'], answer: 0 },
  { q: 'สัตว์บกที่วิ่งเร็วที่สุดในโลกคือสัตว์ชนิดใด?', choices: ['สิงโต', 'เสือชีตาห์', 'ม้า', 'กวาง'], answer: 1 },
  { q: 'น้ำบริสุทธิ์เดือดที่กี่องศาเซลเซียส (ที่ระดับน้ำทะเล)?', choices: ['90', '100', '110', '120'], answer: 1 },
  { q: 'ภาพ "โมนาลิซา" เป็นผลงานของใคร?', choices: ['ปาโบล ปิกัสโซ', 'วินเซนต์ แวน โก๊ะ', 'เลโอนาร์โด ดา วินชี', 'มีเกลันเจโล'], answer: 2 },
  { q: 'แม่น้ำสายใดไหลผ่านกรุงเทพมหานคร?', choices: ['แม่น้ำโขง', 'แม่น้ำเจ้าพระยา', 'แม่น้ำปิง', 'แม่น้ำมูล'], answer: 1 },
  { q: 'ผลไม้ชนิดใดได้ฉายาว่า "ราชาแห่งผลไม้"?', choices: ['มะม่วง', 'มังคุด', 'ทุเรียน', 'ลำไย'], answer: 2 },
  { q: 'ดาวเคราะห์ดวงใดได้ฉายาว่า "ดาวเคราะห์สีแดง"?', choices: ['ดาวศุกร์', 'ดาวอังคาร', 'ดาวพุธ', 'ดาวยูเรนัส'], answer: 1 },
  { q: 'ร่างกายผู้ใหญ่ปกติมีกระดูกประมาณกี่ชิ้น?', choices: ['186', '206', '226', '306'], answer: 1 },
  { q: 'ภาษาโปรแกรมใดตั้งชื่อตามรายการตลก Monty Python?', choices: ['Java', 'Python', 'Ruby', 'Rust'], answer: 1 },
  { q: 'ทวีปใดมีพื้นที่ใหญ่ที่สุด?', choices: ['แอฟริกา', 'เอเชีย', 'อเมริกาเหนือ', 'ยุโรป'], answer: 1 },
  { q: 'แมวใช้เวลานอนวันละกี่ชั่วโมงโดยประมาณ?', choices: ['2-4 ชั่วโมง', '6-8 ชั่วโมง', '12-16 ชั่วโมง', '20-22 ชั่วโมง'], answer: 2 },
];
