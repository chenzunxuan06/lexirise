// ============================================================
// tests/verify-offline.mjs —— 断网演练（10/11 彩排要用的那种）
// 用法: node tests/verify-offline.mjs [地址]
//
// 为什么必须有它：答辩现场网络不可靠，离线是兜底。
// 而"离线能开"这件事**只能这样验**：先在线把资源缓存下来，
// 再真的把网断掉，看页面还出不出得来。
//
// 2026-10-07 之前这里是坏的，而且坏得很隐蔽：
//   · /forms、/cloze 不在 Service Worker 预缓存里 → 断网点进去会掉回首页
//   · 带查询串的地址（?grade=&unit=）连"按路径名回退"都没有 → 必然 miss
//   · forms.json / cloze.json / corpus/*.json 压根没进缓存 → 题库与课文原句全空
// ============================================================
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.argv[2] || 'https://www.chenzx.asia';
const PORT = 9361;
const OUT = 'E:\\初二\\挑战杯-2026\\_shots';
mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'voff-'));
// ⚠️ --no-proxy-server：本机开着加速器时，走代理会让同一个文件慢 4.7 倍
//    （实测 words.json：直连 0.30s / 代理 1.38s）—— 而评委是直连。
//    带着代理测，会把"SW 安装慢"误读成"缓存没生效"。
const child = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--no-proxy-server', '--window-size=1200,900', 'about:blank'], { stdio: 'ignore' });
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
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.value;
const shot = async (n) => { const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); writeFileSync(join(OUT, n), Buffer.from(s.data, 'base64')); };
const go = async (path, wait) => { await send('Page.navigate', { url: BASE + path }); await sleep(wait || 6000); };

await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });

let fail = 0;
const check = (name, ok, extra) => { console.log((ok ? '  OK   ' : '  FAIL ') + name + (extra ? '  -> ' + extra : '')); if (!ok) fail++; };

// ---------- 第一步：在线把该缓存的东西都走一遍 ----------
// ⚠️ 只预热**一轮** —— 这是最严的口径，也对应真实场景：
//    "打开看一眼，然后断网演示"。能做到是因为 sw.js 在 activate 之后
//    主动预热了 words/affixes/forms/cloze/morphology 这五个数据文件
//    （首次访问的文档不受 SW 控制，光靠"访问过才缓存"是不够的）。
console.log('== 在线预热（一轮，模拟"打开一次就断网"）==');
for (const p of ['/', '/forms?grade=8&semester=1&unit=3', '/cloze?grade=8&semester=1&unit=3', '/plan', '/unit?grade=8&semester=1&unit=3']) {
  await go(p, 5500);
  console.log('   预热 ' + p + ' → ' + (await ev('document.body.innerText.length')) + ' 字符');
}
// 等 SW 接管 + 预热写盘
await sleep(3000);
const swState = await ev('(async () => { const r = await navigator.serviceWorker.getRegistration(); return r ? { scope: r.scope, active: !!r.active, state: r.active && r.active.state } : null; })()');
check('Service Worker 已接管', !!(swState && swState.active), JSON.stringify(swState));
const cacheKeys = await ev('(async () => { const ks = await caches.keys(); const out = {}; for (const k of ks) { const c = await caches.open(k); const reqs = await c.keys(); out[k] = reqs.map(r => new URL(r.url).pathname).sort(); } return out; })()');
const cached = Object.values(cacheKeys).flat();
check('预缓存里有 /forms 页面壳', cached.includes('/forms'), '共 ' + cached.length + ' 项');
check('预缓存里有 /cloze 页面壳', cached.includes('/cloze'));
check('缓存里有题库 forms.json', cached.includes('/forms.json'));
check('缓存里有题库 cloze.json', cached.includes('/cloze.json'));

// ---------- 第二步：真的断网 ----------
console.log('== 断网 ==');
await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
// ⚠️ 探测断网必须用一个 **SW 不接管的地址**：
//    拿 /words.json 去探是探不出来的 —— 它正好会被 SW 从缓存里端出来（那是好事）。
const reallyOffline = await ev('(async () => { try { await fetch("/offline-probe-" + Date.now() + ".txt", { cache: "no-store" }); return false; } catch (e) { return true; } })()');
check('网络确实断了（直连 fetch 会失败）', reallyOffline === true);

// ---------- 第三步：断网下逐页验证 ----------
const CASES = [
  ['/cloze?grade=8&semester=1&unit=3', '课文挖空（带单元参数）', '.fm-sent', '八上 U3'],
  ['/forms?grade=7&semester=1&unit=1', '适当形式填空（带单元参数）', '.fm-sent', '七上 U1'],
  ['/', '首页', null, null],
  ['/plan', '备考计划', null, null],
];
for (const [path, name, sel, mustHave] of CASES) {
  await go(path, 6500);
  const loc = await ev('location.pathname + location.search');
  const txt = await ev('document.body.innerText || ""');
  const notBlank = txt.length > 200;
  const stayedOnPage = String(loc).indexOf(path.split('?')[0]) === 0;
  let ok = notBlank && stayedOnPage;
  let extra = '路径=' + loc + ' 正文=' + txt.length + ' 字符';
  if (sel) {
    const has = await ev('!!document.querySelector(' + JSON.stringify(sel) + ')');
    ok = ok && has;
    extra += ' 题目渲染=' + has;
  }
  if (mustHave) {
    const has = txt.indexOf(mustHave) >= 0;
    ok = ok && has;
    extra += ' 含「' + mustHave + '」=' + has;
  }
  check('断网可打开：' + name, ok, extra);
  if (path.indexOf('cloze') >= 0) await shot('offline-cloze.png');
  if (path.indexOf('forms') >= 0) await shot('offline-forms.png');
}

// ---------- 第四步：恢复网络 ----------
await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
await go('/', 4000);
check('恢复联网后首页仍正常', (await ev('document.body.innerText.length')) > 200);

console.log('');
ws.close(); try { child.kill(); } catch {}
await sleep(600); try { rmSync(profile, { recursive: true, force: true }); } catch {}
console.log(fail === 0 ? '断网演练全部通过' : (fail + ' 项未通过'));
process.exit(fail === 0 ? 0 : 1);
