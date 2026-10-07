// ============================================================
// tests/verify-focus-ui.mjs —— 纸间专注的真浏览器验收
// ------------------------------------------------------------
// 按 方向文档 §6.2 的 DOM 契约选元素。契约是**先冻结后分工**的，
// 所以这个脚本可以在实现完成之前就写好。
//
// 重点验的是一件事：**秒在跳**。
// 计时用时间戳差值而不是 setInterval 累加（§5.3），但"用差值"这件事
// 从代码上看不出来 —— 只能盯着屏幕看它是不是真的在走。
//
// 用法（先另开终端 npm run start）：
//   node tests/verify-focus-ui.mjs
// ============================================================
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9347;
const OUT = 'E:\\初二\\挑战杯-2026\\_shots';
mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'vfocus-'));
const child = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1200,900', 'about:blank'], { stdio: 'ignore' });
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
const q = (sel) => JSON.stringify(sel);
const click = (sel) => ev('(() => { const e = document.querySelector(' + q(sel) + '); if (!e) return false; e.click(); return true; })()');
const txt = (sel) => ev('(() => { const e = document.querySelector(' + q(sel) + '); return e ? (e.textContent || "").trim() : null; })()');

await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });

console.log('-> http://localhost:3000/');
await send('Page.navigate', { url: 'http://localhost:3000/' });
await sleep(7000);
for (let k = 0; k < 6; k++) {
  const c = await ev('(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "跳过"); if (b) { b.click(); return true; } return false; })()');
  if (c) { await sleep(2000); break; }
  await sleep(1200);
}

let fail = 0;
const check = (name, ok, extra) => {
  console.log((ok ? '  OK   ' : '  FAIL ') + name + (extra ? '  -> ' + extra : ''));
  if (!ok) fail++;
};

check('顶栏有「专注」入口', !!(await ev('!!document.querySelector(".bs-focus-tab")')));
check('点得开', await click('.bs-focus-tab'));
await sleep(600);

check('① 选择屏出现', !!(await ev('!!document.querySelector(".focus-pick")')));
const nUse = await ev('document.querySelectorAll(".focus-use").length');
check('用途按钮有 5 个', nUse === 5, String(nUse));
const nMode = await ev('document.querySelectorAll(".focus-mode").length');
check('计时方式有 3 个', nMode === 3, String(nMode));

const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(join(OUT, name), Buffer.from(s.data, 'base64'));
};
await shot('focus-pick.png');

await click('.focus-use[data-use="背单词"]');
await click('.focus-mode[data-mode="countdown"]');
await sleep(300);
check('点得动「开始」', await click('.focus-start'));
await sleep(1500);
check('② 计时屏出现', !!(await ev('!!document.querySelector(".focus-run")')));

const t1 = await txt('.focus-clock');
await sleep(2600);
const t2 = await txt('.focus-clock');
check('大屏时间在跳（秒真的在走）', !!t1 && !!t2 && t1 !== t2, String(t1) + ' -> ' + String(t2));
await shot('focus-run.png');

const hasWord = await ev('(/[A-Za-z]{4,}/).test(((document.querySelector(".focus-run") || {}).innerText) || "")');
check('计时屏上不出现单词', !hasWord, '只应有中文与时间');

check('点得动「完成」', await click('.focus-finish'));
await sleep(900);
check('③ 完成屏出现', !!(await ev('!!document.querySelector(".focus-done")')));
const hello = await txt('.focus-praise-hello');
const fact = await txt('.focus-praise-fact');
check('有收工话', !!hello, String(hello));
check('事实句提到纸间', !!fact && String(fact).indexOf('纸间') >= 0, String(fact));

await shot('focus-done.png');

// ---- 端到端最后一环：刚记的这一笔，统计页看得到吗 ----
console.log('');
console.log('-> http://localhost:3000/stats');
await send('Page.navigate', { url: 'http://localhost:3000/stats' });
await sleep(6000);
const statsTxt = await ev('(document.body.innerText || "").replace(/\\s+/g, " ")');
check('统计页有「纸间专注」一块', String(statsTxt).indexOf('纸间专注') >= 0);
check('刚记的「背单词」出现在统计页', String(statsTxt).indexOf('背单词 1') >= 0, '（今天在纸间记过 1 次背单词）');
await shot('focus-stats.png');

// ---- 今日页也要看得见（用户 2026-10-05 反馈：收好了之后就没地方找了）----
console.log('');
console.log('-> http://localhost:3000/ （今日页）');
await send('Page.navigate', { url: 'http://localhost:3000/' });
await sleep(6500);
const homeTxt = await ev('(document.body.innerText || "").replace(/\\s+/g, " ")');
// 书壳模式下首页右栏是「今日 · 进度」，纸间记录显示在那里（每一页都在）
check('首页右栏有纸间记录', String(homeTxt).indexOf('纸间 · 今天') >= 0);
check('右栏看得到「背单词」的次数', String(homeTxt).indexOf('背单词') >= 0 && String(homeTxt).indexOf('次') >= 0);
await shot('focus-today.png');

console.log('');
console.log(fail === 0 ? '全部通过' : (fail + ' 项未通过'));
ws.close(); try { child.kill(); } catch {}
await sleep(500); try { rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(fail === 0 ? 0 : 1);
