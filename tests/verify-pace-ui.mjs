// ============================================================
// tests/verify-pace-ui.mjs —— 「学习节奏」两档预算验收
// 用法（先另开终端 npm run start）：
//   node tests/verify-pace-ui.mjs                  # 本地
//   node tests/verify-pace-ui.mjs https://www.chenzx.asia
//
// 为什么值得单测：这个开关**直接改学生每天背多少**。
// 它错了既不报错也不崩 —— 只是安静地让所有人每天多背一倍。
// 而且它写的是 localStorage，只有真浏览器能验证"写完刷新还在"。
// ============================================================
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.argv[2] || 'http://localhost:3000';
const PORT = 9355;
const OUT = 'E:\\初二\\挑战杯-2026\\_shots';
mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'vpace-'));
const child = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1200,1000', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let target = null;
for (let i = 0; i < 40; i++) {
  await sleep(500);
  try { const l = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json(); target = l.find((t) => t.type === 'page'); if (target) break; } catch {}
}
if (!target) { console.log('NO_TARGET'); child.kill(); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.value;
const txt = (sel) => ev('(() => { const e = document.querySelector(' + JSON.stringify(sel) + '); return e ? (e.textContent || "").trim() : null; })()');
const shot = async (n) => { const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); writeFileSync(join(OUT, n), Buffer.from(s.data, 'base64')); };
const clickTab = (label) => ev('(() => { const b = [...document.querySelectorAll(".tab")].find((x) => x.textContent.trim() === ' + JSON.stringify(label) + '); if (!b) return false; b.click(); return true; })()');
const go = async (path) => { await send('Page.navigate', { url: BASE + path }); await sleep(6000);
  for (let k = 0; k < 4; k++) { const c = await ev('(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "跳过"); if (b) { b.click(); return true; } return false; })()'); if (c) { await sleep(1200); break; } await sleep(800); } };

/** 页面上「每日目标」那个 stepper 显示的数字 */
const goalShown = () => ev('(() => { const s = [...document.querySelectorAll(".settings-stepper")].map(e => e.querySelector("b")?.textContent.trim()); return s[s.length - 1] || null; })()');
/** 直接读 localStorage 里真正生效的两个数 */
const stored = () => ev('(() => { const p = JSON.parse(localStorage.getItem("lexirise:plan") || "{}"); return { dailyNew: p.dailyNew, reviewCap: p.reviewCap }; })()');

await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 1000, deviceScaleFactor: 1, mobile: false });

let fail = 0;
const check = (name, ok, extra) => { console.log((ok ? '  OK   ' : '  FAIL ') + name + (extra ? '  -> ' + extra : '')); if (!ok) fail++; };

console.log('-> ' + BASE + '/settings');
await go('/settings');

const body = await ev('document.body.textContent');
check('有「学习节奏」这一节', !!body && body.indexOf('学习节奏') >= 0);
check('两个档位都在', !!body && body.indexOf('考前模式') >= 0 && body.indexOf('假期模式') >= 0);
check('写明了两个目标互相挤占（丙：取舍摆在明面上）', !!body && body.indexOf('互相挤占') >= 0);
check('写明了实测门槛（12 词 / 24–30 词）', !!body && body.indexOf('24–30') >= 0);
await shot('pace-before.png');

console.log('-- 切到假期模式 --');
check('点得中「假期模式」', (await clickTab('假期模式')) === true);
await sleep(1200);
const s1 = await stored();
check('每日新词真的写成 20', s1.dailyNew === 20, JSON.stringify(s1));
check('复习上限真的写成 60', s1.reviewCap === 60, JSON.stringify(s1));
check('下方「每日目标」跟着变成 20（两个数字不能各说各话）', (await goalShown()) === '20', await goalShown());
check('当前节奏显示为 假期模式', ((await ev('document.body.textContent')) || '').indexOf('目前：假期模式') >= 0);
await shot('pace-holiday.png');

console.log('-- 刷新后还在吗（localStorage 才算数）--');
await go('/settings');
const s2 = await stored();
check('刷新后新词还是 20', s2.dailyNew === 20, JSON.stringify(s2));
check('刷新后复习上限还是 60', s2.reviewCap === 60, JSON.stringify(s2));
check('刷新后仍显示 假期模式', ((await ev('document.body.textContent')) || '').indexOf('目前：假期模式') >= 0);

console.log('-- 切回考前模式 --');
check('点得中「考前模式」', (await clickTab('考前模式')) === true);
await sleep(1200);
const s3 = await stored();
check('切回后新词是 10（= 线上原默认值，一个字没改）', s3.dailyNew === 10, JSON.stringify(s3));
check('切回后复习上限是 40', s3.reviewCap === 40, JSON.stringify(s3));

console.log('-- 手动微调 → 应当变成自定义 --');
await ev('(() => { const rows = [...document.querySelectorAll(".settings-stepper")]; const r = rows[rows.length - 1]; const b = [...r.querySelectorAll("button")].find(x => x.textContent.trim() === "+"); b.click(); })()');
await sleep(1200);
const s4 = await stored();
check('按 + 之后每日目标变成 11', s4.dailyNew === 11, JSON.stringify(s4));
check('手动调过之后节奏显示为 自定义', ((await ev('document.body.textContent')) || '').indexOf('目前：自定义') >= 0);
check('手动调过只动了一个旋钮（复习上限仍 40）', s4.reviewCap === 40, JSON.stringify(s4));
await shot('pace-custom.png');

console.log('');
ws.close(); try { child.kill(); } catch {}
await sleep(500); try { rmSync(profile, { recursive: true, force: true }); } catch {}
console.log(fail === 0 ? '全部通过' : (fail + ' 项未通过'));
process.exit(fail === 0 ? 0 : 1);
