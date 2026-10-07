// 验「课本词汇」出处这一块：搜索一个"只在词表/词汇练习里出现"的词 → 打开 → 看标签
// 用法: node tests/verify-vocab-ref-ui.mjs [地址]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.argv[2] || 'https://www.chenzx.asia';
const PORT = 9373;
const OUT = 'E:\\初二\\挑战杯-2026\\_shots';
mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'vvoc-'));
const child = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile, '--no-first-run', '--disable-gpu', '--no-proxy-server', '--window-size=1200,1000', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target = null;
for (let i = 0; i < 40; i++) { await sleep(500); try { const l = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json(); target = l.find((t) => t.type === 'page'); if (target) break; } catch {} }
if (!target) { console.log('NO_TARGET'); child.kill(); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; const t = setTimeout(() => { pending.delete(i); rej(new Error('CDP 超时 ' + method)); }, 20000); pending.set(i, { res: (v) => { clearTimeout(t); res(v); }, rej: (e) => { clearTimeout(t); rej(e); } }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.value;
const shot = async (n) => { const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); writeFileSync(join(OUT, n), Buffer.from(s.data, 'base64')); };
await send('Page.enable'); await send('Runtime.enable');
let fail = 0;
const check = (n, ok, extra) => { console.log((ok ? '  OK   ' : '  FAIL ') + n + (extra ? '  -> ' + extra : '')); if (!ok) fail++; };

console.log('-> ' + BASE + '/vocab');
await send('Page.navigate', { url: BASE + '/vocab' });
await sleep(7000);
// 全新 profile 会弹新手引导（问年级）—— 它是正常的，但会挡住截图。
// 真实用户点「跳过」就好，这里也照做，否则截图里只能看到引导层。
for (let k = 0; k < 4; k++) {
  const c = await ev('(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "跳过"); if (b) { b.click(); return true; } return false; })()');
  if (c) { await sleep(1500); break; }
  await sleep(800);
}

// 从语料里挑一个"只有词表出处"的词（页面自己就能告诉我们它是哪个）
const vocabWord = await ev(`(async () => {
  const c = await (await fetch("/corpus/7A.json")).json();
  const w = await (await fetch("/words.json")).json();
  const sent = new Set([...Object.keys(c.byWordForm || {}), ...Object.keys(c.byWordAny || {})]);
  for (const id of Object.keys(c.byVocab || {})) {
    if (sent.has(id)) continue;
    const hit = w.words.find((x) => String(x.id) === id);
    if (hit) return hit.word_en;
  }
  return null;
})()`);
check('语料里能找到只有词表出处的词', !!vocabWord, String(vocabWord));

// 搜索它 → 点结果
if (vocabWord) {
  await ev(`(() => { const el = document.querySelector(".search"); const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; set.call(el, ${JSON.stringify(vocabWord)}); el.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
  await sleep(1500);
  // 搜索结果就是 .word-card（onClick 打开详情）—— 直接点它，别去猜父元素
  const hit = await ev(`(() => { const cards = [...document.querySelectorAll(".word-card")]; if (!cards.length) return false; const c = cards.find((x) => (x.textContent || "").indexOf(${JSON.stringify(vocabWord)}) >= 0) || cards[0]; c.click(); return true; })()`);
  check('搜索得到结果并点开', hit === true);
  await sleep(3000);
  const txt = await ev('document.body.innerText || ""');
  check('打开的词详情里有「课本词汇」这一块', txt.indexOf('课本词汇') >= 0);
  check('说明写的是"正文里没有用到"（不是假装有原句）', txt.indexOf('课本正文里没有用到这个词') >= 0);
  check('这一块没有朗读按钮（它不是一个句子）', await ev('(() => { const blk = [...document.querySelectorAll(".tb-ex")][0]; if (!blk) return null; return blk.querySelectorAll(".mini-speak").length; })()') === 0);
  await shot('vocab-ref.png');
}
console.log('');
ws.close(); try { child.kill(); } catch {}
await sleep(400); try { rmSync(profile, { recursive: true, force: true }); } catch {}
console.log(fail === 0 ? '课本词汇出处渲染通过' : (fail + ' 项未通过'));
process.exit(fail === 0 ? 0 : 1);
