#!/usr/bin/env node
// ============================================================
// tests/e2e-smoke.mjs —— 端到端冒烟测试（真浏览器 + 真数据库）
// ------------------------------------------------------------
// 为什么需要它：单测用的是**假 fetch**，测不到服务端那一层。
//   2026-10-04 就靠端到端才发现 /api/events 的白名单漏了 "answer" ——
//   前端看着上报成功，后端一条没存，而单测全绿、构建也通过。
//
// 它验证的完整链路：
//   页面渲染 → todaySummary() → recordShadow() → track()
//   → pagehide 收尾上报 → POST /api/events → 白名单 → SQLite
//
// 用法（先另开一个终端跑 npm run dev）:
//   node tests/e2e-smoke.mjs                  # 跑一遍并报告
//   node tests/e2e-smoke.mjs --clean          # 跑完删掉本次产生的行
//   node tests/e2e-smoke.mjs --url http://localhost:3000
// ============================================================
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const CDP_PORT = 9336;
const args = process.argv.slice(2);
const CLEAN = args.includes("--clean");
const urlIdx = args.indexOf("--url");
const URL_TARGET = urlIdx >= 0 ? args[urlIdx + 1] : "http://localhost:3000/";
const DB = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "user.db");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), "smoke-"));
const startedAt = Date.now();

// ---------- 1) 起浏览器，走一遍首页 ----------
const child = spawn(EDGE, [
  "--headless=new", "--remote-debugging-port=" + CDP_PORT, "--user-data-dir=" + profile,
  "--no-first-run", "--no-default-browser-check", "--disable-gpu", "about:blank",
], { stdio: "ignore" });

let target = null;
for (let i = 0; i < 40; i++) {
  await sleep(500);
  try {
    const list = await (await fetch("http://127.0.0.1:" + CDP_PORT + "/json/list")).json();
    target = list.find((t) => t.type === "page");
    if (target) break;
  } catch { /* 还没起来 */ }
}
if (!target) { console.error("❌ 浏览器没起来"); child.kill(); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
  }
};
const send = (method, params = {}) =>
  new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) =>
  (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;

await send("Page.enable");
await send("Runtime.enable");
console.log("→ 打开 " + URL_TARGET);
await send("Page.navigate", { url: URL_TARGET });
await sleep(14000); // 等页面渲染 + 今日口径计算 + 影子调度

const title = await evaluate("document.title");
console.log("  标题：" + JSON.stringify(title));

// 触发 pagehide —— 这正是 T01 修的那条收尾上报路径
await send("Page.navigate", { url: "about:blank" });
await sleep(3000);

ws.close();
try { child.kill(); } catch { /* 已退出 */ }
await sleep(500);
try { rmSync(profile, { recursive: true, force: true }); } catch { /* Windows 偶发占用 */ }

// ---------- 2) 查库 ----------
const db = new DatabaseSync(DB, { readOnly: true });
const rows = db.prepare("SELECT id, event, meta FROM events WHERE ts >= ? ORDER BY id").all(startedAt);

const fail = [];
const find = (name) => rows.filter((r) => r.event === name);

console.log("\n本次产生的行：" + rows.length);
for (const r of rows) console.log("  #" + r.id + "  " + r.event.padEnd(18) + String(r.meta).slice(0, 90));

// 断言 1：收尾上报生效（T01）
if (!rows.length) fail.push("没有任何事件落库 —— pagehide 收尾上报没生效？");

// 断言 2：影子日志存在且内容非空（T09）
const shadows = find("shadow_schedule");
if (!shadows.length) {
  fail.push("没有 shadow_schedule —— 白名单漏登记？或 todaySummary 没触发？");
} else {
  const m = JSON.parse(shadows.at(-1).meta);
  if (!m.units || !m.units.length) fail.push("shadow_schedule 的 units 为空 —— 空词表调用没被拦住？");
  if (!m.shadow || !m.shadow.length) fail.push("shadow_schedule 的 shadow 为空 —— 调度器没选出词？");
  console.log("\n影子对比：");
  console.log("  范围   units  = " + JSON.stringify(m.units));
  console.log("  影子   shadow = " + JSON.stringify((m.shadow || []).slice(0, 10)));
  console.log("  现行   real   = " + JSON.stringify((m.real || []).slice(0, 10)));
}

// ---------- 3) 结论 ----------
if (CLEAN && rows.length) {
  const w = new DatabaseSync(DB);
  const ids = rows.map((r) => r.id);
  const del = w.prepare("DELETE FROM events WHERE id = ?");
  let n = 0;
  for (const i of ids) n += del.run(i).changes;
  console.log("\n🧹 已清理本次产生的 " + n + " 行");
}

if (fail.length) {
  console.log("\n❌ 冒烟失败：");
  for (const f of fail) console.log("   · " + f);
  process.exit(1);
}
console.log("\n✅ 冒烟通过：页面渲染 → 影子调度 → 收尾上报 → 白名单 → 数据库，全链路通。");
