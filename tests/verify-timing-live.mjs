// ============================================================
// tests/verify-timing-live.mjs —— 反应时真的上报了吗（端到端）
// ------------------------------------------------------------
// 单测只能证明"调用点写了 elapsed"（tests/timing.test.mjs 的静态防线），
// 证明不了它**真的带着一个大于 0 的数上了网** ——
// 中间还隔着 memory.record → track → 缓冲 → flushNow → fetch 一整条链。
//
// 做法：在页面里把 fetch 换掉，把发往 /api/events 的原始 body 抄下来。
// 这是唯一能看见"线上到底传了什么"的地方。
//
// 用法（先另开终端 npm run start）：node tests/verify-timing-live.mjs
// ============================================================
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9349;
const profile = mkdtempSync(join(tmpdir(), 'vtiming-'));
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
const click = (sel) => ev('(() => { const e = document.querySelector(' + JSON.stringify(sel) + '); if (!e) return false; e.click(); return true; })()');
const typeIn = (sel, val) => ev('(() => { const el = document.querySelector(' + JSON.stringify(sel) + '); if (!el) return false;' +
  ' const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;' +
  ' set.call(el, ' + JSON.stringify(val) + ');' +
  ' el.dispatchEvent(new Event("input", { bubbles: true })); return true; })()');

await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 1000, deviceScaleFactor: 1, mobile: false });

console.log('-> http://localhost:3000/forms');
await send('Page.navigate', { url: 'http://localhost:3000/forms' });
await sleep(7000);
for (let k = 0; k < 6; k++) {
  const c = await ev('(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "跳过"); if (b) { b.click(); return true; } return false; })()');
  if (c) { await sleep(1500); break; }
  await sleep(1000);
}

// 把上报的原始 body 抄下来
const hooked = await ev('(() => { window.__events = []; const of = window.fetch;' +
  ' window.fetch = function () { try { const a = arguments;' +
  '   const u = String(a[0] && a[0].url ? a[0].url : a[0]);' +
  '   if (u.indexOf("/api/events") >= 0 && a[1] && a[1].body) window.__events.push(String(a[1].body));' +
  ' } catch (e) {} return of.apply(this, arguments); }; return true; })()');
console.log('拦截器已装:', hooked);

let fail = 0;
const check = (name, ok, extra) => { console.log((ok ? '  OK   ' : '  FAIL ') + name + (extra ? '  -> ' + extra : '')); if (!ok) fail++; };

check('题目出来了', !!(await ev('!!document.querySelector(".fm-input")')));

// 第 1 题：想久一点（约 2.5 秒）
await sleep(2500);
await typeIn('.fm-input', 'zzzz');
await sleep(200);
await click('.fm-btn.primary');
await sleep(500);

// 第 2 题：马上答（约 0.4 秒）
await click('.fm-btn.primary');
await sleep(400);
await typeIn('.fm-input', 'zzzz');
await sleep(150);
await click('.fm-btn.primary');
await sleep(500);

// 触发收尾上报（analytics 在 pagehide / visibilitychange 时清空缓冲）
await ev('window.dispatchEvent(new Event("pagehide")); true');
await sleep(1200);

const raw = await ev('JSON.stringify(window.__events)');
// raw 已经是 JSON 字符串（ev 里 stringify 过一次），别再 parse 两遍 ——
// 第二遍会把数组强转成字符串再解析，得到一个对象，然后 for...of 直接炸。
let parsed = [];
try {
  const one = JSON.parse(raw);
  parsed = Array.isArray(one) ? one : [];
} catch (e) { parsed = []; }
const all = [];
for (const body of parsed) {
  try { const j = JSON.parse(body); for (const e of (j.events || [])) all.push(e); } catch (e2) {}
}
const answers = all.filter((e) => e && e.event === 'answer');
console.log('');
console.log('抓到的上报批次: ' + parsed.length + '，其中 answer 事件 ' + answers.length + ' 条');
for (const a of answers.slice(0, 4)) {
  console.log('   mode=' + a.meta.mode + '  ok=' + a.meta.ok + '  elapsed=' + a.meta.elapsed + 'ms  rating=' + JSON.stringify(a.meta.rating));
}

check('真的上报了 answer 事件', answers.length > 0);
check('elapsed 不再是 0', answers.some((a) => Number(a.meta.elapsed) > 0),
  '（这个字段此前一直是 0）');
// ⚠️ 不要断言第 1 题「应该是 2.5 秒」—— 第一版就是这么写的，然后失败了：
//    实测 11129ms。看着像 bug，其实**产品是对的、断言是错的**：
//    计时起点是「这道题出现在屏幕上」，而脚本在那之后才去点它
//    （前面还有等页面、找跳过按钮、装拦截器）。
//
//    这个数字顺带暴露了一个**真实的数据质量问题**：
//    **每个会话的第 1 题，用时天然偏高**（页面刚加载、人还没坐定）。
//    分析时必须处理（剔除首题、或按分位数截尾），否则第一题会稳定地拉高整体反应时。
//    已记进交付文档。
const e0 = answers.length ? Number(answers[0].meta.elapsed) : 0;
const e1 = answers.length > 1 ? Number(answers[1].meta.elapsed) : 0;
check('慢的那题用时明显更长（真的在计时，不是常量）', answers.length > 1 && e0 > e1 * 3, e0 + 'ms vs ' + e1 + 'ms');
check('马上作答的那题用时在合理区间（0.2~2 秒）', e1 >= 200 && e1 < 2000, e1 + 'ms');
check('forms 是客观题，rating 应为 null 而不是假的 0',
  !answers.length || answers[0].meta.rating === null, JSON.stringify(answers.length ? answers[0].meta.rating : null));

console.log('');
console.log(fail === 0 ? '全部通过' : (fail + ' 项未通过'));
ws.close(); try { child.kill(); } catch {}
await sleep(500); try { rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(fail === 0 ? 0 : 1);
