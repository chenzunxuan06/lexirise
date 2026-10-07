// ============================================================
// tests/verify-audio.mjs —— 发音验收（词 + 课文句子）
// 用法: node tests/verify-audio.mjs [地址]
//
// 为什么要有它："喇叭按了没声音"是**最难自查**的一类 bug ——
// 它不报错、不白屏，只是安静地什么都不发生。2026-10-07 用户实测反馈了它。
//
// 这个脚本查三件事：
//   ① 词库 1535 条：预生成音频文件是否齐全（这条一直是全的）
//   ② 课文句子：被引用的句子有没有预生成音频（**这条当天才补上**）
//   ③ 真浏览器点一次句子喇叭：服务器到底有没有把 mp3 发出来
// ============================================================
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] || 'https://www.chenzx.asia';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PUB = new URL('../public/', import.meta.url);

/** 与 lib/tts.js 的 speakText、gen_audio.py 的 norm_text 必须逐字节一致 */
function speakText(t) {
  return String(t).replace(/^\*+/, '').replace(/…+|\.{2,}/g, ' something ').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
}
const hashOf = (t) => createHash('sha1').update(speakText(t), 'utf8').digest('hex').slice(0, 16);
const urlOf = (t) => BASE + '/audio/t/' + hashOf(t) + '.mp3';

let fail = 0;
const check = (name, ok, extra) => { console.log((ok ? '  OK   ' : '  FAIL ') + name + (extra ? '  -> ' + extra : '')); if (!ok) fail++; };

const words = JSON.parse(readFileSync(new URL('words.json', PUB), 'utf8')).words;
const corpus = ['7A', '7B', '8A', '8B', '9A', '9B'].map((b) => JSON.parse(readFileSync(new URL('corpus/' + b + '.json', PUB), 'utf8')));
const cited = new Set();
for (const c of corpus) {
  for (const key of ['byWord', 'byWordAny', 'byPhrase']) {
    for (const idxs of Object.values(c[key] || {})) for (const si of idxs) cited.add(c.sentences[si]);
  }
}

/** 并发 HEAD 一批地址，返回 200 的数量 */
async function headCount(urls, concurrency = 8) {
  // ⚠️ 这里的 wait 不能复用文件后面那个 sleep：那是 const，在上面这段执行时还在 TDZ 里
  //    （实测报 "Cannot access 'sleep' before initialization"）。
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let ok = 0; const bad = [];
  let i = 0;
  /** 一次 HEAD，失败重试 2 次（网络抖动 vs 真缺文件，必须分开 —— 否则测试会乱报） */
  async function head(u) {
    for (let a = 0; a < 3; a++) {
      try { const r = await fetch(u, { method: 'HEAD' }); return r.ok ? null : 'HTTP ' + r.status; }
      catch (e) { if (a === 2) return '网络失败: ' + String(e.message).slice(0, 24); await wait(300 * (a + 1)); }
    }
    return '网络失败';
  }
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (i < urls.length) {
      const u = urls[i++];
      const err = await head(u);
      if (err) bad.push(u.slice(-24) + ' -> ' + err); else ok++;
    }
  }));
  return { ok, bad };
}

console.log('线上地址: ' + BASE);
console.log('');

// ---------- ① 词库 ----------
const wordUrls = [...new Set(words.map((w) => speakText(w.word_en)).filter(Boolean))].map(urlOf);
const w1 = await headCount(wordUrls);
check('词条预生成音频齐全', w1.ok === wordUrls.length, w1.ok + ' / ' + wordUrls.length + (w1.bad.length ? '  缺: ' + w1.bad.slice(0, 3).join(', ') : ''));

// ---------- ② 课文句子 ----------
const sentUrls = [...cited].map(urlOf);
const w2 = await headCount(sentUrls);
const pct = (100 * w2.ok / Math.max(1, sentUrls.length)).toFixed(1);
check('课文句子预生成音频（今天之前是 0%）', w2.ok === sentUrls.length, w2.ok + ' / ' + sentUrls.length + ' = ' + pct + '%' + (w2.bad.length ? '  缺: ' + w2.bad.slice(0, 3).join(', ') : ''));

// ---------- ③ 真浏览器点一次 ----------
const profile = mkdtempSync(join(tmpdir(), 'vaud-'));
const CDP = 9369;
const child = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + CDP, '--user-data-dir=' + profile, '--no-first-run', '--disable-gpu', '--no-proxy-server', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target = null;
for (let i = 0; i < 40; i++) { await sleep(500); try { const l = await (await fetch('http://127.0.0.1:' + CDP + '/json/list')).json(); target = l.find((t) => t.type === 'page'); if (target) break; } catch {} }
if (!target) { console.log('NO_TARGET'); child.kill(); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map(); const audio = [];
ws.onmessage = (e) => { const m = JSON.parse(e.data);
  if (m.method === 'Network.responseReceived' && /\.mp3/.test(m.params.response.url)) audio.push({ url: m.params.response.url, status: m.params.response.status, mime: m.params.response.mimeType });
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
// ⚠️ 每个 CDP 调用都加超时：不加的话，WS 一旦断了就会**永久挂住**整个脚本
//    （本地第一次跑就挂在这里，看起来像"产品有问题"，其实是脚本自己的坑）。
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = ++id;
  const t = setTimeout(() => { pending.delete(i); rej(new Error('CDP 超时: ' + method)); }, 20000);
  pending.set(i, { res: (v) => { clearTimeout(t); res(v); }, rej: (e) => { clearTimeout(t); rej(e); } });
  ws.send(JSON.stringify({ id: i, method, params }));
});
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.value;
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');

// /phrases 短语页：一进页面每行就带喇叭，不用先展开（原来用 /vocab 要先点开例句，慢且脆）
await send('Page.navigate', { url: BASE + '/phrases?grade=8&semester=1' });
await sleep(7000);
// ⚠️ 短语页是**两步筛选**：先选年级、再选册，否则列表是空的（页面会提示"先选择年级和册"）。
//    我第一版没点这一步，看到 0 个喇叭就以为是产品坏了 —— 其实是没按它的流程走。
const picked = await ev('(() => { const b = [...document.querySelectorAll(".tab")].find((x) => x.textContent.trim() === "上册"); if (!b) return false; b.click(); return true; })()');
await sleep(2000);
const clicked = await ev('(() => { const els = [...document.querySelectorAll(".mini-speak")]; if (!els.length) return 0; els[0].click(); return els.length; })()');
await sleep(4000);
// ⚠️ 音频是**流式**加载的：真实响应是 206 Partial Content，不是 200。
//    第一版只认 200，于是"其实放出来了"被报成失败 —— 断言写窄了也是假警报。
const ok200 = audio.filter((a) => a.status >= 200 && a.status < 300 && /audio/.test(a.mime || ''));
check('选了册之后有喇叭可点', clicked > 0, '喇叭数=' + clicked + (picked ? '' : '（没找到「上册」按钮）'));
check('点下去服务器确实发了音频（2xx + audio/mpeg）', ok200.length > 0, audio.length ? JSON.stringify(audio.slice(0, 2)) : '没有任何 mp3 请求');

ws.close(); try { child.kill(); } catch {}
await sleep(400); try { rmSync(profile, { recursive: true, force: true }); } catch {}
console.log('');
console.log(fail === 0 ? '发音验收全部通过' : (fail + ' 项未通过'));
process.exit(fail === 0 ? 0 : 1);
