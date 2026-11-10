# MeowPailong Bot

## ติดตั้ง
1. ต้องใช้ **Node.js 22.12 ขึ้นไป** (ไลบรารีเสียงบังคับ)
2. `npm install`
3. คัดลอก `.env.example` เป็น `.env` แล้วกรอก `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID` (GUILD_ID = เซิร์ฟบ้านเรา)
4. Discord Developer Portal → Bot → เปิด **Server Members Intent** (ไม่งั้นบอทไม่ออนไลน์: error "disallowed intents")
5. `npm run deploy` ลงทะเบียนคำสั่งแบบ global (ใช้ได้ทุกเซิร์ฟ) | ทดสอบเร็วๆ ใช้ `npm run deploy:guild`
6. `npm start`

เชิญบอทด้วยสิทธิ์: Manage Roles, Manage Channels, Move Members, Manage Events, Create Events, Send Messages, Send Polls, Embed Links, Connect, Speak + scope `bot` และ `applications.commands`

## /setup
**เซิร์ฟบ้านเรา (GUILD_ID):** ไปช่องที่ต้องการแล้วพิมพ์ `/setup panel` ครั้งเดียว บอทสร้างฉายาที่ยังไม่มีให้เอง
แล้วส่งแผงตามค่าใน `config.js` (แก้ชื่อ/สี/อีโมจิในไฟล์นั้นได้) ห้อง Create Room, ฉายาเลเวล ฯลฯ ใช้ค่าจาก config.js ด้วย

**เซิร์ฟอื่น:** ตั้งทีละขั้น
1. สร้างฉายาใน Server Settings → Roles
2. `/setup group add` สร้างหมวด → `/setup role add` ใส่ฉายาเข้าหมวด (ทำซ้ำ)
3. ลากฉายาบอทให้อยู่เหนือฉายาที่จะแจก
4. `/setup panel` ในช่องที่ต้องการ

เสริม: `/setup hub` (ห้องสร้างห้องส่วนตัว) • `/setup memberrole` • `/setup birthdayrole` • `/setup levelrole add` • `/setup timezone` • `/setup banner` • `/setup show` (ดูสถานะ) • `/setup reset` • `/log set` (ช่องแจ้งเตือน)

ฉายาที่มีสิทธิ์สูง (Administrator, Manage Roles, Ban ฯลฯ) บอทไม่ยอมให้ใส่ในแผง/แจกให้คนกดเอง

## ระบบเพลง
คำสั่ง: `/play /pause /resume /skip /stop /queue /nowplaying /loop /shuffle /volume /remove` + แดชบอร์ดบนการ์ด (ปุ่มควบคุม, หลอดเสียง, แถบเวลา, ปุ่ม VOL −/+ และ MUTE ไม่ต้องพิมพ์ /volume)
รองรับชื่อเพลง (ค้นหา YouTube) และลิงก์ YouTube / SoundCloud / Bandcamp รวมเพลย์ลิสต์ (สูงสุด 50 เพลงต่อครั้ง) ยังไม่รองรับ Spotify

ต้องติดตั้งบนเครื่องที่รันบอท:
- **yt-dlp** (https://github.com/yt-dlp/yt-dlp/releases) ให้อยู่ใน PATH หรือตั้ง `YTDLP_PATH` ใน .env — อัปเดตบ่อยๆ ด้วย `yt-dlp -U` เพราะ YouTube เปลี่ยนบ่อย
- **JS runtime สำหรับ YouTube**: ติดตั้ง **Deno** (yt-dlp ใช้อัตโนมัติ) หรือถ้ามี Node 22+ อยู่แล้วตั้ง `YTDLP_JS_RUNTIME=node`
- ffmpeg มากับ `npm install` แล้ว (ffmpeg-static)

ถ้าเจอ "Sign in to confirm you're not a bot" (มักเกิดบน VPS/โฮสต์) ให้ export cookies ของบัญชี YouTube เป็น `cookies.txt` แล้วตั้ง `YTDLP_COOKIES=cookies.txt` (ใช้บัญชีสำรอง ไม่ใช่บัญชีหลัก)

## Valorant (/valorant)
| คำสั่ง | ทำอะไร |
|---|---|
| `/valorant link` | ผูกบัญชี Riot (ตรวจว่ามีจริงและหาเซิร์ฟเวอร์ให้เอง) |
| `/valorant stats` | แรงค์ + RR + Peak, K/D, KDA, ACS, ADR, HS%, W/L, เอเจนต์ที่เล่นบ่อย, แมตช์ล่าสุด (เลือกโหมดและจำนวนแมตช์ได้) |
| `/valorant lastmatch` | สกอร์บอร์ดแมตช์ล่าสุดทั้งสองทีม |
| `/valorant news` | ข่าว/แพตช์โน้ต/เอเจนต์-ปืนใหม่ จากเว็บ Valorant (ภาษาไทยก่อน ถ้าไม่มีถอยไปอังกฤษ) กรองหมวดได้ |
| `/valorant matches` | รายการแข่ง Esports ที่กำลังแข่ง/กำลังจะแข่ง เวลาแสดงตามเขตเวลาของแต่ละคน |
| `/valorant weapon` | ข้อมูลปืน: ราคา อัตรายิง รีโหลด ดาเมจหัว/ตัว/ขาตามระยะ (ไม่ใส่ชื่อ = รายการทั้งหมด) |

ต้องมี **API key ฟรี** จาก HenrikDev (ยกเว้น `weapon`): เข้าดิสคอร์ด HenrikDev → ช่อง #get-a-key → เลือก "VALORANT (Basic Key)"
แล้วใส่ `HENRIK_API_KEY=...` ใน `.env` (ดู `.env.example`) จากนั้น `npm run deploy` ใหม่ (มีคำสั่งใหม่)

ข้อควรรู้: Riot ไม่เปิด API สถิติผู้เล่นให้ใช้ทั่วไป ข้อมูลจึงมาจากบริการของชุมชน (HenrikDev, valorant-api.com) ที่ไม่ใช่ของ Riot
โควต้าของ key นับรวมทั้งบอท บอทจึงแคชผลไว้ 3-15 นาทีและกันกดรัว (8 วินาที/คน) | ถ้าบอทอยู่หลายเซิร์ฟและคนใช้เยอะ ให้ขอ key ระดับ Advanced

## โครงสร้าง
`config.js` ค่าเริ่มต้นเซิร์ฟบ้านเรา • `settings.js` ค่าตั้งแต่ละเซิร์ฟ • `db.js` เก็บข้อมูลที่ `data/db.json` (สำรองด้วยการคัดลอกไฟล์)
`modules/` แต่ละระบบ — อยากปิดระบบไหน ลบบรรทัดใน `modules/index.js` แล้ว `npm run deploy` ใหม่


## run
npm install -g pm2
pm2 start bun --name meowpailong -- run start

แก้โค้ด
pm2 restart meowpailong

รันใหม่
pm2 start meowpailong

