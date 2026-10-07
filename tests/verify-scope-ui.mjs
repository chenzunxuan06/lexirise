// ============================================================
// tests/verify-scope-ui.mjs —— 「分单元出题」验收（T20/T21 出题范围）
// 用法（先另开终端 npm run start）：
//   node tests/verify-scope-ui.mjs                 # 本地 http://localhost:3000
//   node tests/verify-scope-ui.mjs https://www.chenzx.asia
//
// 这个脚本只回答一件事：**出来的题是不是真的都落在指定的那个单元里**。
// 光看"页面没报错"是不够的 —— 全册随机抽 10 道也是"没报错"。
// ============================================================
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.argv[2] || 'http://localhost:3000';
const PORT = 9353;
const OUT = 'E:\\初二\\挑战杯-2026\\_shots';
mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'vscope-'));
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
const go = async (path) => {
  await send('Page.navigate', { url: BASE + path });
  await sleep(6500);
  for (let k = 0; k < 4; k++) {
    const c = await ev('(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "跳过"); if (b) { b.click(); return true; } return false; })()');
    if (c) { await sleep(1200); break; }
    await sleep(800);
  }
};

await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 1000, deviceScaleFactor: 1, mobile: false });

let fail = 0;
const check = (name, ok, extra) => { console.log((ok ? '  OK   ' : '  FAIL ') + name + (extra ? '  -> ' + extra : '')); if (!ok) fail++; };

/** 当前这组题各自的出处（每题的 .fm-src） */
const sources = () => ev('[...document.querySelectorAll(".fm-src")].map(e => e.textContent.trim())');
/** 顶部范围条上的那颗范围标签 */
const tag = () => txt('.fm-scope-tag');
/** 从题库里核对：页面上这句原句属于哪个单元（对不上就返回 null） */
const unitOfRendered = (file) => ev('(async () => {' +
  ' const b = await (await fetch("/" + ' + JSON.stringify(file) + ' + "")).json();' +
  ' const el = document.querySelector(".fm-sent");' +
  ' if (!el) return null;' +
  ' const shown = el.textContent.replace(/\\s+/g, " ").trim();' +
  // 课文挖空的空白在页面上是 ①②③（不是下划线），所以两边都要还原再比
  ' const CIRC = ["\\u2460", "\\u2461", "\\u2462", "\\u2463"];' +
  ' const circ = (t) => { let i = 0; return t.replace(/______/g, () => CIRC[i++]); };' +
  ' const norm = (t) => t.replace(/\\s+/g, " ").trim();' +
  // forms 的空白渲染成一串  nbsp（检查后才有字），cloze 渲染成 ①②③ —— 三种形态都还原了再比
  ' const hit = (b.items || []).find((it) => {' +
  '   const cands = [norm(it.blanked.replace(/______/g, " ")), norm(circ(it.blanked)), norm(it.full || "")];' +
  '   return cands.indexOf(shown) >= 0;' +
  ' });' +
  ' return hit ? hit.unit : null;' +
'})()');

// ---------- 1. 单个单元：出来的题必须都在这个单元 ----------
console.log('-> /forms?grade=7&semester=1&unit=1');
await go('/forms?grade=7&semester=1&unit=1');
check('/forms 渲染出题目', !!(await ev('!!document.querySelector(".fm-sent")')));
check('范围标签 = 七上 U1', (await tag()) === '七上 U1', await tag());
const src1 = await sources();
check('每题出处都写着「七上 U1」', Array.isArray(src1) && src1.length === 1 && src1[0].indexOf('七上 U1') === 0, JSON.stringify(src1));
const u1 = await unitOfRendered('forms.json');
check('题面确实来自 7-1-1 的题库（不是碰巧）', u1 === '7-1-1', String(u1));
const chips = await ev('[...document.querySelectorAll(".fm-chip")].map(e => e.textContent.trim())');
check('列出了本册各单元供切换', Array.isArray(chips) && chips.length === 8, JSON.stringify(chips));
await shot('scope-forms-u1.png');

// ---------- 2. 换单元：点 U2 ----------
await ev('(() => { const a = [...document.querySelectorAll(".fm-chip")].find(x => x.textContent.trim().startsWith("U2")); if (a) a.click(); })()');
await sleep(2500);
check('点 U2 → 范围标签变成 七上 U2', (await tag()) === '七上 U2', await tag());
const src2 = await sources();
check('换单元后每题出处都变成「七上 U2」', Array.isArray(src2) && src2.length === 1 && src2[0].indexOf('七上 U2') === 0, JSON.stringify(src2));
const u2 = await unitOfRendered('forms.json');
check('换单元后题面也来自 7-1-2', u2 === '7-1-2', String(u2));

// ---------- 3. 整册 ----------
console.log('-> /forms?grade=7&semester=1');
await go('/forms?grade=7&semester=1');
check('整册范围标签 = 七上 · 整册', (await tag()) === '七上 · 整册', await tag());
const src3 = await sources();
check('整册时每题仍带出处', Array.isArray(src3) && src3.length === 1 && String(src3[0]).indexOf('七上') === 0, JSON.stringify(src3));

// ---------- 4. 全册（不带参数）：老行为不变 ----------
console.log('-> /cloze（不带参数）');
await go('/cloze');
check('全册范围标签 = 六册混合', (await tag()) === '六册混合', await tag());
check('全册时给的是「按单元练」的入口', (await txt('.fm-scope-x')) === '按单元练', await txt('.fm-scope-x'));

// ---------- 5. 课文挖空按单元 ----------
console.log('-> /cloze?grade=8&semester=1&unit=3');
await go('/cloze?grade=8&semester=1&unit=3');
check('/cloze 渲染出题目', !!(await ev('!!document.querySelector(".fm-sent")')));
check('/cloze 范围标签 = 八上 U3', (await tag()) === '八上 U3', await tag());
const csrc = await sources();
check('/cloze 每题出处都写着「八上 U3」', Array.isArray(csrc) && csrc.length === 1 && csrc[0].indexOf('八上 U3') === 0, JSON.stringify(csrc));
const uc = await unitOfRendered('cloze.json');
check('/cloze 题面来自 8-1-3', uc === '8-1-3', String(uc));
await shot('scope-cloze-u3.png');

// ---------- 6. 空范围：必须给走得通的路，不能白屏 ----------
console.log('-> /forms?grade=9&semester=1&unit=1（这个单元没有题）');
await go('/forms?grade=9&semester=1&unit=1');
const emptyTxt = await txt('.empty-state');
check('空范围给的是空状态而不是白屏', !!emptyTxt, (emptyTxt || '').slice(0, 60));
check('空状态里告诉学生怎么办（练全册/换单元）', !!emptyTxt && emptyTxt.indexOf('练全册') >= 0, (emptyTxt || '').slice(0, 80));
check('空范围时范围条仍在（能换单元）', !!(await ev('!!document.querySelector(".fm-scope")')));
await shot('scope-empty.png');

// ---------- 7. 入口：单元页 →「本单元考点」→ 真的带着单元参数进题库页 ----------
// 这一段测的是**入口**而不是页面本身。入口错了，功能再对学生也找不到。
console.log('-> /unit?grade=8&semester=1&unit=3（单元页入口）');
await go('/unit?grade=8&semester=1&unit=3');
const unitTxt = await ev('document.body.textContent');
check('单元页有「本单元考点」一节', !!unitTxt && unitTxt.indexOf('本 单 元 考 点') >= 0);
check('单元页有「用所给词的适当形式填空」入口', !!unitTxt && unitTxt.indexOf('用所给词的适当形式填空') >= 0);
check('单元页有「课文挖空」入口', !!unitTxt && unitTxt.indexOf('课文挖空') >= 0);
await shot('scope-unit-entry.png');

// 点「课文挖空」那一行，应当带着 grade/semester/unit 跳到 /cloze
const clicked = await ev('(() => { const el = [...document.querySelectorAll("*")].find((x) => x.children.length === 0 && x.textContent.trim() === "课文挖空"); if (!el) return false; const row = el.closest("[class*=row], li, a, div"); (row || el).click(); return true; })()');
check('能点中「课文挖空」入口', clicked === true);
await sleep(3500);
const url = await ev('location.pathname + location.search');
check('跳到 /cloze 并带着 unit=3', /\/cloze/.test(String(url)) && /unit=3/.test(String(url)), String(url));
check('进去之后范围标签已经是 八上 U3', (await tag()) === '八上 U3', await tag());
check('进去之后题目出处也是 八上 U3', String(((await sources()) || [])[0] || '').indexOf('八上 U3') === 0, JSON.stringify(await sources()));

console.log('');
ws.close(); try { child.kill(); } catch {}
await sleep(500); try { rmSync(profile, { recursive: true, force: true }); } catch {}
console.log(fail === 0 ? '全部通过' : (fail + ' 项未通过'));
process.exit(fail === 0 ? 0 : 1);
