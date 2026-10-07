// ============================================================
// tests/verify-corpus-ui.mjs —— 验收 T18：单词详情页真的显示出「课本原句 + 出处」
// ------------------------------------------------------------
// 为什么要这个脚本：这一层**单元测试测不到**。
//   · lib/corpus.js 单测能证明"取数正确"，但证明不了"区块真的画出来了"；
//   · 构建通过也证明不了 —— 上一轮的 /evidence 页第一次截图出来就是一张白图。
//   所以真浏览器 + 真点击 + 真读 DOM，是这一层的唯一验收方式。
//
// 用法（先另开终端 npm run start）：
//   node tests/verify-corpus-ui.mjs
// ============================================================
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9341;
const OUT = 'E:\\初二\\挑战杯-2026\\_shots';
mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'vcorpus-'));
const child = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1000,1400', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let target = null;
for (let i = 0; i < 40; i++) {
  await sleep(500);
  try { const l = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json(); target = l.find((t) => t.type === 'page'); if (target) break; } catch {}
}
if (!target) { console.log('NO_TARGET'); child.kill(); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map(); const net = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); return; }
  if (m.method === 'Network.responseReceived' && /corpus|morphology/.test(m.params.response.url)) {
    net.push(m.params.response.status + ' ' + m.params.response.url.replace('http://localhost:3000', ''));
  }
};
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.value;

await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 1400, deviceScaleFactor: 1, mobile: false });

console.log('→ http://localhost:3000/vocab');
await send('Page.navigate', { url: 'http://localhost:3000/vocab' });
await sleep(6000);
for (let k = 0; k < 6; k++) {
  const c = await ev("(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='跳过'); if(b){b.click();return true} return false })()");
  if (c) { await sleep(2000); break; }
  await sleep(1200);
}

// 搜索一个 7A 的词（patient 在词库 id=3，语料里配到 patiently 的那句）
const typed = await ev(`(() => {
  const inp = [...document.querySelectorAll('input')].find(i => (i.placeholder||'').includes('搜索')) || document.querySelector('input');
  if (!inp) return 'NO_INPUT';
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(inp, 'patient');
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  return 'OK';
})()`);
console.log('搜索框: ' + typed);
await sleep(2500);

const clicked = await ev(`(() => {
  const card = document.querySelector('.word-card');
  if (!card) return 'NO_CARD';
  card.click();
  return 'CLICKED: ' + (card.textContent || '').trim().slice(0, 24);
})()`);
console.log('点开 patient: ' + clicked);
await sleep(3000);

const probe = await ev(`(() => {
  const tb = document.querySelector('.tb-ex');
  const ex = document.querySelector('.example');
  return JSON.stringify({
    hasTb: !!tb,
    tbText: tb ? (tb.querySelector('.en')||{}).textContent : null,
    tbSrc: tb ? (tb.querySelector('.src')||{}).textContent : null,
    tbCount: document.querySelectorAll('.tb-ex').length,
    hasExample: !!ex,
    modal: !!document.querySelector('.modal'),
  });
})()`);
console.log('页面探测: ' + probe);
console.log('语料请求: ' + (net.length ? net.join(' | ') : '(没有请求 corpus) '));

// ---------- 第二个接点：/plan 的理由卡（explain() 里预留的 corpus 扩展位）----------
console.log('');
console.log('→ http://localhost:3000/plan');
await send('Page.navigate', { url: 'http://localhost:3000/plan' });
await sleep(7000);
// 挑一个【确实有课本原句】的词来点：guitar 这类词只在被过滤掉的词堆里出现过，
// 它没有原句是正确行为，拿它验证会误判成失败。
const opened = await ev(`(() => {
  const rows = [...document.querySelectorAll('div')].filter(d => /cursor: pointer/.test(d.getAttribute('style') || '') && d.querySelector('b'));
  if (!rows.length) return 'NO_ROW';
  const prefer = ['patient', 'improve', 'quality', 'friendship'];
  const pick = rows.find(r => prefer.includes((r.querySelector('b').textContent || '').trim().replace(/^\\*/, ''))) || rows[0];
  pick.click();
  return 'OPENED: ' + (pick.querySelector('b').textContent || '').trim();
})()`);
console.log('点开第一个词的理由: ' + opened);
await sleep(3000);
const planProbe = await ev(`(() => {
  const tb = document.querySelector('.tb-ex');
  return JSON.stringify({ hasTb: !!tb, tbText: tb ? (tb.querySelector('.en')||{}).textContent : null,
    tbSrc: tb ? (tb.querySelector('.src')||{}).textContent : null });
})()`);
console.log('plan 页探测: ' + planProbe);

const pageH = await ev('document.documentElement.scrollHeight');
await send('Emulation.setDeviceMetricsOverride', { width: 1000, height: Math.min(pageH + 20, 4000), deviceScaleFactor: 1, mobile: false });
await sleep(900);
const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
const buf = Buffer.from(s.data, 'base64');
writeFileSync(join(OUT, 'corpus-ui.png'), buf);
console.log('截图已存 corpus-ui.png（' + Math.round(buf.length / 1024) + ' KB）');

ws.close(); try { child.kill(); } catch {}
await sleep(500); try { rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(0);
