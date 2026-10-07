// ============================================================
// tests/verify-forms-ui.mjs —— 「用所给词的适当形式填空」验收（T20）
// 用法（先另开终端 npm run start）：node tests/verify-forms-ui.mjs
// ============================================================
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
// 第一个参数可指定地址（默认本地）：
//   线上  node tests/verify-forms-ui.mjs https://www.chenzx.asia
const BASE = process.argv[2] || 'http://localhost:3000';
const PORT = 9348;
const OUT = 'E:\\初二\\挑战杯-2026\\_shots';
mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'vforms-'));
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
const txt = (sel) => ev('(() => { const e = document.querySelector(' + JSON.stringify(sel) + '); return e ? (e.textContent || "").trim() : null; })()');
const shot = async (n) => { const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); writeFileSync(join(OUT, n), Buffer.from(s.data, 'base64')); };

// 用原生 setter 写 React 受控输入（直接赋 value 不触发 onChange）
const typeIn = (sel, val) => ev('(() => { const el = document.querySelector(' + JSON.stringify(sel) + '); if (!el) return false;' +
  ' const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;' +
  ' set.call(el, ' + JSON.stringify(val) + ');' +
  ' el.dispatchEvent(new Event("input", { bubbles: true })); return true; })()');
const pressEnter = (sel) => ev('(() => { const el = document.querySelector(' + JSON.stringify(sel) + '); if (!el) return false;' +
  ' el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); return true; })()');

await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 1000, deviceScaleFactor: 1, mobile: false });

console.log('-> ' + BASE + '/forms');
await send('Page.navigate', { url: BASE + '/forms' });
await sleep(7000);
for (let k = 0; k < 6; k++) {
  const c = await ev('(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "跳过"); if (b) { b.click(); return true; } return false; })()');
  if (c) { await sleep(1500); break; }
  await sleep(1000);
}

let fail = 0;
const check = (name, ok, extra) => { console.log((ok ? '  OK   ' : '  FAIL ') + name + (extra ? '  -> ' + extra : '')); if (!ok) fail++; };

check('题目渲染出来了', !!(await ev('!!document.querySelector(".fm-sent")')));
const noTxt = await txt('.fm-no');
check('一组题数是满的（10 题）', !!noTxt && noTxt.indexOf('/ 10 题') >= 0, noTxt);
check('有挖空处', !!(await ev('!!document.querySelector(".fm-blank")')));
const hint = await txt('.fm-hint');
check('给了原形提示（括号形式）', !!hint && hint.indexOf('(') >= 0, hint);
const src = await txt('.fm-src');
check('显示了出处', !!src && src.indexOf('课本 p.') >= 0, src);
await shot('forms-question.png');

// 故意填错，看反馈里有没有正确答案 + 完整原句
await typeIn('.fm-input', 'zzzz');
await sleep(250);
await click('.fm-btn.primary');
await sleep(600);
check('答错有反馈', !!(await ev('!!document.querySelector(".fm-fb.no")')));
const fb = await txt('.fm-fb-t');
check('反馈里给出正确形式', !!fb && fb.indexOf('正确形式是') >= 0, fb);
const fbs = await txt('.fm-fb-s');
check('反馈里给出完整课文原句', !!fbs && fbs.split(' ').length >= 5, fbs ? fbs.slice(0, 60) : null);
await shot('forms-wrong.png');

// 一路走到底，看结算屏
let reached = false;
for (let i = 0; i < 30; i++) {
  if (await ev('!!document.querySelector(".bs-resolve")')) { reached = true; break; }
  const advanced = await click('.fm-btn.primary');
  if (!advanced) break;
  await sleep(400);
  if (await ev('!!document.querySelector(".fm-input")')) {
    await typeIn('.fm-input', 'zzzz');
    await sleep(200);
    await click('.fm-btn.primary');
    await sleep(300);
  }
}
check('走完一组能到结算屏', reached);
if (reached) {
  const hello = await txt('.bs-praise-hello');
  check('结算屏带着收工那一声', !!hello, hello);
  await shot('forms-done.png');
}

console.log('');
console.log(fail === 0 ? '全部通过' : (fail + ' 项未通过'));
ws.close(); try { child.kill(); } catch {}
await sleep(500); try { rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(fail === 0 ? 0 : 1);
