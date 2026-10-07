// ============================================================
// tests/verify-praise-ui.mjs —— 验收：收工那一屏真的出现了那句夸赞
// ------------------------------------------------------------
// 为什么要真浏览器：文案逻辑有单测（tests/praise.test.mjs），
// 但「它到底有没有画在收工屏上、名字有没有读到」单测证明不了。
// 这个项目的既有教训：/evidence 第一次截图是一张白图，构建却全绿。
//
// 用法（先另开终端 npm run start）：
//   node tests/verify-praise-ui.mjs
// ============================================================
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9343;
const OUT = 'E:\\初二\\挑战杯-2026\\_shots';
mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'vpraise-'));
const child = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1000,1500', 'about:blank'], { stdio: 'ignore' });
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
const ev = async (x) => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result?.value;

await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 1500, deviceScaleFactor: 1, mobile: false });

console.log('-> http://localhost:3000/train?mode=daily');
await send('Page.navigate', { url: 'http://localhost:3000/train?mode=daily' });
await sleep(7000);
for (let k = 0; k < 6; k++) {
  const c = await ev("(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='跳过'); if(b){b.click();return true} return false })()");
  if (c) { await sleep(2000); break; }
  await sleep(1200);
}

// 一步：优先看有没有到收工屏；否则点「下一题」/选项/开始
const STEP = "(() => {"
  + " if (document.querySelector('.bs-praise')) return 'DONE';"
  + " const next = document.querySelector('button.next-btn'); if (next) { next.click(); return 'NEXT'; }"
  + " const opt = document.querySelector('button.opt'); if (opt) { opt.click(); return 'OPT'; }"
  // ⚠️ 必须以「开始」**开头**：宽松的 /开始/ 会匹配到侧边栏的「七上未开始327 词」——
  //    第一版就栽在这，一直点侧边栏，永远开不了局。
  + " const start = [...document.querySelectorAll('button')].find((b) => /^(开始|继续|进入)/.test((b.textContent || '').trim())); if (start) { start.click(); return 'START'; }"
  + " return 'STUCK:' + (document.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 80);"
  + "})()";

let done = false;
const trace = [];
for (let i = 0; i < 90; i++) {
  const s = await ev(STEP);
  if (i < 30) trace.push(i + ":" + s);
  if (s === 'DONE') { done = true; break; }
  if (String(s).startsWith('STUCK')) { trace.push(i + ":" + s); break; }
  await sleep(650);
}
console.log("步骤轨迹: " + trace.join(" "));
const dom = await ev("(() => { const q = (s) => document.querySelectorAll(s).length; return JSON.stringify({ opt: q('button.opt'), next: q('button.next-btn'), resolve: q('.bs-resolve'), praise: q('.bs-praise'), text: (document.body.innerText||'').replace(/\\s+/g,' ').slice(0,180) }); })()");
console.log("结束时的 DOM: " + dom);

if (!done) {
  console.log('没走到收工屏');
} else {
  const probe = "(() => {"
    + " const p = document.querySelector('.bs-praise');"
    + " const hello = p ? (p.querySelector('.bs-praise-hello') || {}).textContent : null;"
    + " const fact = p ? (p.querySelector('.bs-praise-fact') || {}).textContent : null;"
    + " const stamp = (document.querySelector('.bs-stbar') || {}).textContent;"
    + " return JSON.stringify({ hello: hello, fact: fact, stamp: stamp ? stamp.slice(0, 40) : null });"
  + "})()";
  console.log("收工屏探测: " + (await ev(probe)));
  const pageH = await ev('document.documentElement.scrollHeight');
  await send('Emulation.setDeviceMetricsOverride', { width: 1000, height: Math.min(pageH + 20, 3000), deviceScaleFactor: 1, mobile: false });
  await sleep(800);
  const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const buf = Buffer.from(s.data, 'base64');
  writeFileSync(join(OUT, 'praise.png'), buf);
  console.log('截图已存 praise.png（' + Math.round(buf.length / 1024) + ' KB）');
}

ws.close(); try { child.kill(); } catch {}
await sleep(500); try { rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(0);