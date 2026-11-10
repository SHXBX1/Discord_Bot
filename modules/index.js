// รวมทุกระบบไว้ที่เดียว: index.js ใช้โหลดบอท, deploy-commands.js ใช้ลงทะเบียนคำสั่ง
// อยากปิดระบบไหน ลบบรรทัดนั้นออกจาก modules ด้านล่าง แล้วรัน npm run deploy ใหม่
import * as setup from './setup.js';
import * as panel from './panel.js';
import * as rooms from './rooms.js';
import * as levels from './levels.js';
import * as logs from './logs.js';
import * as events from './events.js';
import * as fun from './fun.js';
import * as birthday from './birthday.js';
import * as music from './music.js';
import * as valorant from './valorant.js';
import * as announce from './announce.js';
import * as warp from './warp.js';
import * as clear from './clear.js';

export const modules = [setup, panel, rooms, levels, logs, events, fun, birthday, music, valorant, announce, warp, clear];

export const commands = modules.flatMap((m) => m.commands ?? []);