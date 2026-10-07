// ============================================================
// tests/verify-deploy-live-ui.mjs —— 线上 UI 层验收（真浏览器）
// ------------------------------------------------------------
// 为什么必须有这个：本机铁律 §11 ——
//   「说『正常』前必须验证 UI 层；HTTP 200 只是半句话。」
//
// HTTP 验收（verify-deploy-live.mjs）能证明文件在、接口在，
// 证明不了**评委打开网址到底看见什么**。尤其这个项目：
//   活页本外壳、纸间专注、适当形式填空 —— 全是客户端渲染的，
//   curl 一个都看不见。
//
// 用法:  node tests/verify-deploy-live-ui.mjs
// ============================================================
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] || 'https://www.chenzx.asia';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9352;
const OUT = 'E:\\初二\\挑战杯-2026\\_shots';
mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'vlive-'));
const child = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1400,1000', 'about:blank'], { stdio: 'ignore' });
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
const shot = async (n) => { const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); writeFileSync(join(OUT, n), Buffer.from(s.data, 'base64')); };

let fail = 0;
const check = (name, ok, extra) => { console.log((ok ? '  OK   ' : '  FAIL ') + name + (extra ? '  -> ' + extra : '')); if (!ok) fail++; };

await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });

console.log('线上 UI 验收: ' + BASE);
console.log('');

// ---- 首页 ----
console.log('-> 首页');
await send('Page.navigate', { url: BASE + '/' });
await sleep(9000);
for (let k = 0; k < 6; k++) {
  const c = await ev('(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "跳过"); if (b) { b.click(); return true; } return false; })()');
  if (c) { await sleep(1500); break; }
  await sleep(800);
}
const homeTxt = await ev('(document.body.innerText || "").replace(/\s+/g, " ")');
check('活页本外壳渲染出来了（SSR 里没有，只能这样查）', String(homeTxt).indexOf('活页本') >= 0);
check('左栏有六册目录', String(homeTxt).indexOf('七上') >= 0 && String(homeTxt).indexOf('九下') >= 0);
check('顶栏有「专注」入口（纸间专注是新版才有的）', !!(await ev('!!document.querySelector(".bs-focus-tab")')));
await shot('live-home.png');

// ---- 纸间专注：点开、开始、看秒在跳 ----
console.log('-> 纸间专注');
let focusOk = await click('.bs-focus-tab');
await sleep(800);
check('纸间专注能打开', focusOk && !!(await ev('!!document.querySelector(".focus-pick")')));
if (await ev('!!document.querySelector(".focus-pick")')) {
  await click('.focus-use[data-use="背单词"]');
  await click('.focus-mode[data-mode="countdown"]');
  await sleep(300);
  await click('.focus-start');
  await sleep(1500);
  const t1 = await ev('(() => { const e = document.querySelector(".focus-clock"); return e ? e.textContent.trim() : null; })()');
  await sleep(2500);
  const t2 = await ev('(() => { const e = document.querySelector(".focus-clock"); return e ? e.textContent.trim() : null; })()');
  check('计时屏出来且秒在跳', !!t1 && !!t2 && t1 !== t2, t1 + ' -> ' + t2);
  await shot('live-focus.png');
  await click('.focus-cancel');
  await sleep(600);
}

// ---- 适当形式填空：真的有题 ----
console.log('-> /forms');
await send('Page.navigate', { url: BASE + '/forms' });
await sleep(8000);
check('题目渲染出来了', !!(await ev('!!document.querySelector(".fm-sent")')));
const hint = await ev('(() => { const e = document.querySelector(".fm-hint"); return e ? e.textContent.trim() : null; })()');
check('给了原形提示', !!hint && hint.indexOf('(') >= 0, hint);
const src = await ev('(() => { const e = document.querySelector(".fm-src"); return e ? e.textContent.trim() : null; })()');
check('显示了课本出处', !!src && src.indexOf('课本 p.') >= 0, src);
await shot('live-forms.png');

console.log('');
console.log(fail === 0 ? '线上 UI 全部通过 —— 评委打开网址能看到新版。' : (fail + ' 项未通过'));
ws.close(); try { child.kill(); } catch {}
await sleep(500); try { rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(fail === 0 ? 0 : 1);
