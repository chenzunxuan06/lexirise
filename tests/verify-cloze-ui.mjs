// ============================================================
// tests/verify-cloze-ui.mjs —— 「课文挖空」验收（T21）
// 用法（先另开终端 npm run start）：node tests/verify-cloze-ui.mjs
// ============================================================
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
// 第一个参数可指定地址（默认本地）：
//   本地  node tests/verify-cloze-ui.mjs
//   线上  node tests/verify-cloze-ui.mjs https://www.chenzx.asia
const BASE = process.argv[2] || 'http://localhost:3000';
const PORT = 9351;
const OUT = 'E:\\初二\\挑战杯-2026\\_shots';
mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'vcloze-'));
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

const typeIn = (sel, val, idx) => ev('(() => { const els = document.querySelectorAll(' + JSON.stringify(sel) + '); const el = els[' + (idx || 0) + ']; if (!el) return false;' +
  ' const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;' +
  ' set.call(el, ' + JSON.stringify(val) + ');' +
  ' el.dispatchEvent(new Event("input", { bubbles: true })); return true; })()');
const clickText = (t) => ev('(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === ' + JSON.stringify(t) + '); if (b) { b.click(); return true; } return false; })()');

/** 从题库里找出当前这道题，返回它的答案数组 */
const findAnswers = () => ev(`(async () => {
  const b = await (await fetch('/cloze.json')).json();
  const rendered = document.querySelector('.fm-sent').textContent;
  const CIRC = ['\\u2460','\\u2461','\\u2462','\\u2463'];
  for (const it of b.items) {
    let t = it.blanked, i = 0;
    while (t.indexOf('______') >= 0) { t = t.replace('______', CIRC[i]); i++; }
    if (t === rendered) return it.blanks.map((x) => x.answer);
  }
  return null;
})()`);

await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 1000, deviceScaleFactor: 1, mobile: false });

console.log('-> ' + BASE + '/cloze');
await send('Page.navigate', { url: BASE + '/cloze' });
await sleep(7000);
for (let k = 0; k < 6; k++) {
  const c = await ev('(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "跳过"); if (b) { b.click(); return true; } return false; })()');
  if (c) { await sleep(1500); break; }
  await sleep(1000);
}

let fail = 0;
const check = (name, ok, extra) => { console.log((ok ? '  OK   ' : '  FAIL ') + name + (extra ? '  -> ' + extra : '')); if (!ok) fail++; };

check('句子渲染出来了', !!(await ev('!!document.querySelector(".fm-sent")')));
check('有输入框', (await ev('document.querySelectorAll(".cl-input").length')) > 0);
check('每个空都有中文提示', (await ev('[...document.querySelectorAll(".cl-hint")].every(e => e.textContent.trim().length > 0)')) === true);
check('显示了课文出处', !!((await txt('.fm-src')) || '').length, await txt('.fm-src'));
check('提示里写明答案只认课文', ((await txt('.fm-hint')) || '').includes('课文'));

const ans1 = await findAnswers();
check('能从题库里定位到当前题（验收脚本自检）', Array.isArray(ans1), JSON.stringify(ans1));
check('输入框数量 == 空的数量', (await ev('document.querySelectorAll(".cl-input").length')) === (ans1 ? ans1.length : -1));

// ---- 填错 ----
if (ans1) { for (let i = 0; i < ans1.length; i++) await typeIn('.cl-input', 'zzz-wrong', i); }
await sleep(300);
await clickText('检查');
await sleep(1200);
check('填错判错', (await ev('!!document.querySelector(".fm-fb.no")')) === true);
check('错时把正确写法显示出来', (await ev('document.querySelectorAll(".fm-blank").length')) === (ans1 ? ans1.length : -1));
await shot('cloze-wrong.png');

await clickText('下一题');
await sleep(1500);

// ---- 填对 ----
const ans2 = await findAnswers();
if (ans2) { for (let i = 0; i < ans2.length; i++) await typeIn('.cl-input', ans2[i], i); }
await sleep(300);
await clickText('检查');
await sleep(1200);
const okFb = await ev('!!document.querySelector(".fm-fb.ok")');
check('填对判对', okFb === true, okFb ? '' : JSON.stringify(ans2));
await shot('cloze-ok.png');

// ---- 走完一轮 ----
// ⚠️ 必须"先检查、再下一题"交替推进。
//    第一版只反复点「下一题」，而没检查的题上根本没有这个按钮 ->
//    循环原地打转、一轮永远走不完（脚本自己错，不是产品错）。
for (let i = 0; i < 40; i++) {
  if (await ev('document.body.textContent.includes("正确率")')) break;
  const pending = await ev('document.querySelectorAll(".cl-input:not([disabled])").length');
  if (pending > 0) {
    const a = await findAnswers();
    if (a) for (let k = 0; k < a.length; k++) await typeIn('.cl-input', a[k], k);
    await sleep(250);
    await clickText('检查');
  } else {
    const nx = await clickText('下一题');
    if (!nx) await clickText('看结果');
  }
  await sleep(800);
}
check('一轮能走到结算面板', (await ev('document.body.textContent.includes("正确率")')) === true);
await shot('cloze-done.png');

console.log('');
ws.close(); try { child.kill(); } catch {}
await sleep(500); try { rmSync(profile, { recursive: true, force: true }); } catch {}
console.log(fail === 0 ? 'ALL PASS' : (fail + ' FAILED'));
process.exit(fail === 0 ? 0 : 1);
