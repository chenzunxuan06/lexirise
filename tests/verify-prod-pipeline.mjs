// ============================================================
// tests/verify-prod-pipeline.mjs —— 生产环境的答题日志管道，端到端
// ------------------------------------------------------------
// 这是整件事的最后一环，也是最要紧的一环：
//
//   以前所有验证都停在"本地跑通了"。但在生产环境上，
//   **答题日志这条管道从来没有一条数据流过** ——
//   旧版连 /api/events 路由都没有（404）。
//
//   所以必须证明：真人在线上答一道题 → 事件带着 elapsed / r_pred
//   真的落进服务器数据库。**证明不了，前面全是白干。**
//
// 做法：用真浏览器打开 https://www.chenzx.asia/forms 答一题，
//       触发收尾上报，然后去服务器查库（查库由调用方用 ssh 做）。
//
// 用法:  node tests/verify-prod-pipeline.mjs
// ============================================================
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] || 'https://www.chenzx.asia';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9353;
const profile = mkdtempSync(join(tmpdir(), 'vprod-'));
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
const click = (sel) => ev('(() => { const e = document.querySelector(' + JSON.stringify(sel) + '); if (!e) return false; e.click(); return true; })()');
const typeIn = (sel, val) => ev('(() => { const el = document.querySelector(' + JSON.stringify(sel) + '); if (!el) return false;' +
  ' const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;' +
  ' set.call(el, ' + JSON.stringify(val) + ');' +
  ' el.dispatchEvent(new Event("input", { bubbles: true })); return true; })()');

let fail = 0;
const check = (name, ok, extra) => { console.log((ok ? '  OK   ' : '  FAIL ') + name + (extra ? '  -> ' + extra : '')); if (!ok) fail++; };

await send('Page.enable'); await send('Runtime.enable');
console.log('-> ' + BASE + '/forms');
await send('Page.navigate', { url: BASE + '/forms' });
await sleep(9000);

check('题目出来了', !!(await ev('!!document.querySelector(".fm-input")')));
const hint = await ev('(() => { const e = document.querySelector(".fm-hint"); return e ? e.textContent.trim() : null; })()');
console.log('  本次作答: ' + hint);

// 想一会儿再答（让反应时是一个可信的两位数）
await sleep(3200);
await typeIn('.fm-input', 'zzzz-smoke');
await sleep(300);
await click('.fm-btn.primary');
await sleep(1200);
check('答错有反馈', !!(await ev('!!document.querySelector(".fm-fb.no")')));

// 触发收尾上报：analytics 在 pagehide / visibilitychange 时清空缓冲
await ev('window.dispatchEvent(new Event("pagehide")); true');
await sleep(2500);

console.log('');
console.log('本地动作完成。接下来去服务器查库（由调用方 ssh 执行）。');
ws.close(); try { child.kill(); } catch {}
await sleep(500); try { rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(fail === 0 ? 0 : 1);
