// ============================================================
// tests/screenshots.mjs —— 给关键页面拍截图（真浏览器）
// ------------------------------------------------------------
// 用途：验收"给人看的那几屏"是否真的渲染出来了，并留下演示素材。
// 用法（先另开终端跑 npm run dev 或 npm run start）:
//   node tests/screenshots.mjs
// 输出：E:\初二\挑战杯-2026\_shots\{plan,compare}.png
//
// 备注：无痕配置下每次都会弹新手引导，脚本会自动点"跳过"。
// ============================================================

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9337;
const OUT = 'E:\\初二\\挑战杯-2026\\_shots';
mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'shot-'));
const child = spawn(EDGE, ['--headless=new','--remote-debugging-port='+PORT,'--user-data-dir='+profile,
  '--no-first-run','--no-default-browser-check','--disable-gpu','--window-size=1000,1500','about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let target = null;
for (let i = 0; i < 40; i++) { await sleep(500);
  try { const l = await (await fetch('http://127.0.0.1:'+PORT+'/json/list')).json();
        target = l.find(t => t.type === 'page'); if (target) break; } catch {} }
if (!target) { console.log('NO_TARGET'); child.kill(); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.value;

await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 1400, deviceScaleFactor: 1, mobile: false });

for (const [name, url] of [['plan', 'http://localhost:3000/plan'], ['compare', 'http://localhost:3000/compare?demo=1'], ['evidence', 'http://localhost:3000/evidence']]) {
  console.log('→ ' + url);
  await send('Page.navigate', { url });
  await sleep(7000);
  // 关掉新手引导弹窗（无痕配置下每次都会弹）
  for (let k = 0; k < 6; k++) {
    const clicked = await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '跳过'); if (b) { b.click(); return true } return false })()`);
    if (clicked) { console.log('   已跳过新手引导'); await sleep(2500); break }
    await sleep(1500);
  }
  const text = await ev('document.body.innerText.slice(0, 260).replace(/\\n+/g," | ")');
  console.log('   文本: ' + text);
  const probe = await ev(`(() => { const out=[]; document.querySelectorAll('div[style*="background"]').forEach(d => { const t=(d.textContent||'').trim().slice(0,10); const bg=getComputedStyle(d).backgroundColor; if(t) out.push(t+'='+bg); }); return out.slice(0,7).join(' | '); })()`);
  console.log('   色块探测: ' + probe);
  // 折线图探测：SVG 真的画出来了没有、每条线有几个点（0 个点 = 图画空了）
  const svg = await ev(`(() => { const ps=[...document.querySelectorAll('svg polyline')];
    const cs=[...document.querySelectorAll('svg circle')];
    return 'polyline='+ps.length+' points=['+ps.map(p=>(p.getAttribute('points')||'').trim().split(/\\s+/).length).join(',')+'] circle='+cs.length; })()`);
  console.log('   图形探测: ' + svg);
  // ⚠️ 不能直接用 captureBeyondViewport 抓长页面：
  //    页壳（ShellHost）是按视口高度布局的，把文档撑到 3700px 之后，
  //    视口之外那一段是【没画过的】——实拍出来是一张几乎空白的图
  //    （实测证据页前 1400 行着墨率 0.0%，而 plan/compare 是 2–3%）。
  //    正确做法：先把视口调高到整页高度，让浏览器真的把它画一遍，再抓。
  const pageH = await ev('document.documentElement.scrollHeight');
  await send('Emulation.setDeviceMetricsOverride', { width: 1000, height: Math.min(pageH + 20, 8000), deviceScaleFactor: 1, mobile: false });
  await sleep(1200);
  const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  // 还原视口，免得影响下一个页面
  await send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 1400, deviceScaleFactor: 1, mobile: false });
  const buf = Buffer.from(s.data, "base64");
  writeFileSync(join(OUT, name + ".png"), buf);
  // 空屏守卫：整页截图如果只有几十 KB，多半是没画出来（实测空屏 23KB / 正常 370KB）。
  // 光看 HTTP 200 是看不出来的 —— 这正是「验收必须看页面，不能看状态码」那条纪律。
  const kb = Math.round(buf.length / 1024);
  console.log('   截图已存 ' + name + '.png（' + kb + ' KB）' + (kb < 60 ? '  ⚠️ 疑似空屏，请人工看一眼！' : ''));
}

ws.close(); try { child.kill(); } catch {}
await sleep(600); try { rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(0);
