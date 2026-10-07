// ============================================================
// tests/verify-rating-live.mjs —— 自评模式的 rating 真的上报了吗
// ------------------------------------------------------------
// elapsed 有 tests/verify-timing-live.mjs 现场验过；
// rating 只验过"管道通"（tests/logging.test.mjs 传了 rating 能到负载）
// 和"调用点写了"（tests/timing.test.mjs 的静态防线）。
// 中间那一段 —— **真人点一下自评，它到底有没有带上自评原值** —— 还没验过。
//
// 路径走既有流程，不造数据：
//   训练答错 → 进错题本 → /review?tab=wrong 有得练 → 翻卡 → 点「不认识」→ 上报
//
// 用法（先另开终端 npm run start）：node tests/verify-rating-live.mjs
// ============================================================
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9350;
const profile = mkdtempSync(join(tmpdir(), 'vrating-'));
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
const has = (sel) => ev('!!document.querySelector(' + JSON.stringify(sel) + ')');
const skipOnboarding = async () => {
  for (let k = 0; k < 6; k++) {
    const c = await ev('(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "跳过"); if (b) { b.click(); return true; } return false; })()');
    if (c) { await sleep(1500); return; }
    await sleep(900);
  }
};

await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 1000, deviceScaleFactor: 1, mobile: false });

let fail = 0;
const check = (name, ok, extra) => { console.log((ok ? '  OK   ' : '  FAIL ') + name + (extra ? '  -> ' + extra : '')); if (!ok) fail++; };

// ---- 第一步：在训练里答错几题，把词送进错题本 ----
console.log('-> /train?mode=daily （答错几题，制造错题本）');
await send('Page.navigate', { url: 'http://localhost:3000/train?mode=daily' });
await sleep(7000);
await skipOnboarding();
for (let i = 0; i < 14; i++) {
  const step = await ev('(() => { if (document.querySelector(".bs-resolve")) return "DONE";' +
    ' const n = document.querySelector("button.next-btn"); if (n) { n.click(); return "NEXT"; }' +
    ' const o = document.querySelector("button.opt"); if (o) { o.click(); return "OPT"; }' +
    ' const s = [...document.querySelectorAll("button")].find((b) => /^(开始|继续|进入)/.test((b.textContent || "").trim()));' +
    ' if (s) { s.click(); return "START"; } return "STUCK"; })()');
  if (step === 'DONE' || step === 'STUCK') break;
  await sleep(700);
}

// ---- 第二步：去错题本练一遍并自评 ----
console.log('-> /review?tab=wrong （翻卡 + 自评）');
await send('Page.navigate', { url: 'http://localhost:3000/review?tab=wrong' });
await sleep(6500);

// ⚠️ 拦截器必须**在这一页装**。Page.navigate 会换一个全新的 window，
//    在上一页装的钩子不会跟过来 —— 第一版就栽在这，抓到的永远是 0 条。
await ev('(() => { window.__events = []; const of = window.fetch;' +
  ' window.fetch = function () { try { const a = arguments;' +
  '   const u = String(a[0] && a[0].url ? a[0].url : a[0]);' +
  '   if (u.indexOf("/api/events") >= 0 && a[1] && a[1].body) window.__events.push(String(a[1].body));' +
  ' } catch (e) {} return of.apply(this, arguments); }; return true; })()');
await skipOnboarding();
if (!(await has('.flash-card'))) {
  // ⚠️ 必须锚定开头。宽松的 /开始|练|复习/ 会先匹到「**到期**复习」那个 tab，
  //    于是切到一个空的页签上，永远等不到卡片 —— 和之前 /开始/ 匹到侧边栏
  //    「七上未开始327 词」是同一类错误。今天第三次了。
  await ev('(() => { const b = [...document.querySelectorAll("button")].find((x) => /^重练/.test((x.textContent || "").trim())); if (b) { b.click(); return true; } return false; })()');
  await sleep(2500);
}
check('错题本里有得练（走通了既有流程）', await has('.flash-card'));
if (await has('.flash-card')) {
  await click('.flash-card');
  await sleep(600);
  check('翻卡后出现自评按钮', await has('.known-no'));
  await click('.known-no');   // 点「不认识」，自评原值应为 0
  await sleep(800);
}
await ev('window.dispatchEvent(new Event("pagehide")); true');
await sleep(1200);

const raw = await ev('JSON.stringify(window.__events)');
let batches = [];
try { const one = JSON.parse(raw); batches = Array.isArray(one) ? one : []; } catch (e) { batches = []; }
const all = [];
for (const b of batches) { try { const j = JSON.parse(b); for (const e of (j.events || [])) all.push(e); } catch (e2) {} }
const rev = all.filter((e) => e && e.event === 'answer' && e.meta && e.meta.mode === 'review');
console.log('');
console.log('抓到 answer 事件 ' + all.length + ' 条，其中 review 的 ' + rev.length + ' 条');
for (const a of rev.slice(0, 3)) {
  console.log('   mode=review  ok=' + a.meta.ok + '  rating=' + JSON.stringify(a.meta.rating) + '  elapsed=' + a.meta.elapsed + 'ms');
}
check('自评模式上报了 answer 事件', rev.length > 0);
check('rating 不再是 null（记下了他自己说的那句）', rev.length > 0 && rev[0].meta.rating !== null,
  JSON.stringify(rev.length ? rev[0].meta.rating : null));
check('点了「不认识」，rating 就该是 0', rev.length > 0 && rev[0].meta.rating === 0,
  JSON.stringify(rev.length ? rev[0].meta.rating : null));
check('自评模式同时也在记反应时', rev.length > 0 && Number(rev[0].meta.elapsed) >= 0,
  rev.length ? rev[0].meta.elapsed + 'ms' : null);

console.log('');
console.log(fail === 0 ? '全部通过' : (fail + ' 项未通过'));
ws.close(); try { child.kill(); } catch {}
await sleep(500); try { rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(fail === 0 ? 0 : 1);
