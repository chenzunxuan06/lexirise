// ============================================================
// tests/audit-fresh-visitor.mjs —— 评委视角审计（全新访客 + 手机视口）
// 用法: node tests/audit-fresh-visitor.mjs [地址]
//
// 为什么需要它：我们自己浏览器里有 localStorage、有登录态、有缓存，
// **看到的永远不是评委看到的**。这个脚本用全新 profile + 手机尺寸，
// 逐页记录：控制台报错 / 未捕获异常 / 卡在"加载中" / 页面里出现 undefined、NaN。
// ============================================================
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.argv[2] || 'https://www.chenzx.asia';
const PORT = 9357;
const OUT = 'E:\\初二\\挑战杯-2026\\_shots\\audit';
mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'vaudit-'));
const child = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=390,844', 'about:blank'], { stdio: 'ignore' });
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
const errors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails || {};
    errors.push('异常: ' + (d.exception && d.exception.description ? d.exception.description.split('\n')[0] : d.text));
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    errors.push('console.error: ' + (m.params.args || []).map((a) => a.value || a.description || '').join(' ').slice(0, 140));
  }
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
};
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.value;
const shot = async (n) => { const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); writeFileSync(join(OUT, n), Buffer.from(s.data, 'base64')); };

await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

const PAGES = [
  ['/', 'home'],
  ['/unit?grade=8&semester=1&unit=3', 'unit'],
  ['/forms?grade=8&semester=1&unit=3', 'forms'],
  ['/cloze?grade=8&semester=1&unit=3', 'cloze'],
  ['/stats', 'stats'],
  ['/evidence', 'evidence'],
  ['/plan', 'plan'],
  ['/settings', 'settings'],
  // 2026-10-07 补：这三个页面此前没进审计，其中 /phrases 一进就是半空的
  ['/phrases', 'phrases'],
  ['/vocab?grade=8&semester=1', 'vocab'],
  ['/affixes', 'affixes'],
  ['/mywords', 'mywords'],
  ['/review', 'review'],
];

let bad = 0;
for (const [path, name] of PAGES) {
  errors.length = 0;
  await send('Page.navigate', { url: BASE + path });
  await sleep(6500);
  for (let k = 0; k < 3; k++) {
    const c = await ev('(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "跳过"); if (b) { b.click(); return true; } return false; })()');
    if (c) { await sleep(1200); break; }
    await sleep(600);
  }
  const info = await ev('(() => { const t = document.body.innerText || ""; return { len: t.length, head: t.slice(0, 90).replace(/\\n/g, " / "), undef: /undefined|NaN|\\[object Object\\]/.test(t), loading: /加载中|Loading\\.\\.\\./.test(t) }; })()');
  await shot(name + '.png');
  const flags = [];
  if (!info || info.len < 120) flags.push('正文过短(' + (info ? info.len : 0) + ')');
  if (info && info.undef) flags.push('出现 undefined/NaN');
  if (info && info.loading) flags.push('停在加载中');
  if (errors.length) flags.push('报错 x' + errors.length);
  if (flags.length) bad++;
  console.log((flags.length ? '  ⚠ ' : '  OK ') + name.padEnd(10) + path.padEnd(34) + (flags.join(' · ') || '正常'));
  console.log('      首屏: ' + (info ? info.head : ''));
  errors.slice(0, 3).forEach((e) => console.log('      ' + e));
}

console.log('');
console.log(bad === 0 ? '全部页面无异常' : (bad + ' 个页面有可疑迹象'));
ws.close(); try { child.kill(); } catch {}
await sleep(500); try { rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(0);
