import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.argv[2] || 'https://www.chenzx.asia';
const PORT = 9357;
const OUT = 'E:\\初二\\挑战杯-2026\\_shots';
mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'vnav-'));
const child = spawn(EDGE, ['--headless=new','--remote-debugging-port=' + PORT,'--user-data-dir=' + profile,
  '--no-first-run','--no-default-browser-check','--disable-gpu','--window-size=1200,1000','about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target = null;
for (let i = 0; i < 40; i++) { await sleep(500);
  try { const l = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json(); target = l.find(t => t.type === 'page'); if (target) break; } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.value;
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 1000, deviceScaleFactor: 1, mobile: false });

console.log('-> ' + BASE + '/forms');
await send('Page.navigate', { url: BASE + '/forms' });
await sleep(9000);
for (let k = 0; k < 6; k++) {
  const c = await ev('(()=>{const b=[...document.querySelectorAll("button")].find(x=>x.textContent.trim()==="跳过");if(b){b.click();return true}return false})()');
  if (c) { await sleep(1500); break; } await sleep(1000);
}
console.log('  进入时 URL: ' + await ev('location.pathname'));
console.log('  「先不练了」存在: ' + await ev('!!document.querySelector(".fm-foot a")') + '  文本=' + await ev('(document.querySelector(".fm-foot a")||{}).textContent'));
console.log('  SW 已注册: ' + await ev('!!navigator.serviceWorker.controller'));
console.log('  SW 控制器脚本: ' + await ev('navigator.serviceWorker.controller ? navigator.serviceWorker.controller.scriptURL : "(无)"'));
console.log('  现有缓存: ' + JSON.stringify(await ev('(async()=>{const k=await caches.keys();return k})()')));

// 点击「先不练了」
const clicked = await ev('(()=>{const a=document.querySelector(".fm-foot a");if(!a)return false;a.click();return true})()');
console.log('  点击返回: ' + clicked);
await sleep(3500);
const path = await ev('location.pathname');
const body = await ev('document.body.innerText.slice(0,60).replace(/\n/g," | ")');
console.log('  点击后 URL: ' + path);
console.log('  点击后正文: ' + body);
console.log(path === '/' ? '  => 导航成功' : '  => **导航失败，仍停在 ' + path + '**');
// 再试直接访问根
await send('Page.navigate', { url: BASE + '/' });
await sleep(6000);
console.log('  直接访问 / => URL ' + await ev('location.pathname') + '  正文 ' + (await ev('document.body.innerText.slice(0,40).replace(/\n/g," | ")')));
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(join(OUT, 'nav-check.png'), Buffer.from(shot.data, 'base64'));
ws.close(); try { child.kill(); } catch {}
await sleep(400); try { rmSync(profile, { recursive: true, force: true }); } catch {}
