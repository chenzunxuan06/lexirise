// ============================================================
// tests/timing.test.mjs —— 反应时
// 用法（在 web/ 目录下）:  node --test "tests/timing.test.mjs"
//
// 这个文件真正的价值不是测 elapsedSince（它太简单了），
// 而是**那道静态防线**：
//
//   elapsed 这个字段空了一整天 —— memory.js 里写着 elapsed: ctx.elapsed || 0，
//   日志表、上报白名单、证据层全建好了，但全仓 7 个 memory.record 调用点
//   一个都没传。而路线图说它是「支撑线 1 的核心输入」「唯一不能加速的东西」。
//
//   补上 7 处只解决今天。要让它不再烂，就得有东西**在下次有人加调用点时报警**。
//   下面第二个 test 干的就是这件事。
// ============================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { elapsedSince } from "../lib/timing.js";

test("elapsedSince：正常情况返回真实间隔", () => {
  const t0 = (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - 1234;
  const d = elapsedSince(t0);
  assert.ok(d >= 1234 && d < 1400, "应该约等于 1234ms，实际 " + d);
});

test("elapsedSince：时钟往回跳时夹成 0，绝不产生负的反应时", () => {
  const future = (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) + 999999;
  assert.equal(elapsedSince(future), 0);
});

test("elapsedSince：返回整数毫秒", () => {
  const t0 = (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - 5;
  assert.equal(elapsedSince(t0), Math.round(elapsedSince(t0)));
});

// ---- 静态防线：app/ 里每个 memory.record 调用都必须带 elapsed ----
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|jsx)$/.test(name)) out.push(p);
  }
  return out;
}

test("app/ 里每个 memory.record 调用都传了 elapsed", () => {
  const missing = [];
  const files = walk(join(process.cwd(), "app"));
  for (const f of files) {
    const lines = readFileSync(f, "utf8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      const code = lines[i].split("//")[0]; // 去掉行内注释，免得注释里的示例被当成真调用
      if (code.indexOf("memory.record(") < 0) continue;
      // 调用可能跨行，往后看两行；**不往前看** —— 往前会误把上一处调用的 elapsed 当成这一处的
      const window = lines.slice(i, i + 3).join("\n");
      if (!/elapsed\s*:/.test(window)) {
        missing.push(f.replace(process.cwd(), "") + ":" + (i + 1) + "  " + lines[i].trim().slice(0, 80));
      }
    }
  }
  assert.deepEqual(missing, [], "这些调用点没传 elapsed（反应时是支撑线 1 的核心输入）：\n" + missing.join("\n"));
});

// ---- 第二道：自评模式必须记 rating ----
// 支撑线 1 要比对的是「他这次说自己认识」和「这个词后来在客观题里到底对不对」。
// 少了 rating，这条线就没有左边那一半 —— 而它在 review / recite 里就是那一句自评。
const SELF_REPORT_PAGES = ["review", "recite"];

test("自评模式（review / recite）的 memory.record 都传了 rating", () => {
  const missing = [];
  const files = walk(join(process.cwd(), "app"));
  for (const f of files) {
    const norm = f.replace(/\\/g, "/");
    if (!SELF_REPORT_PAGES.some((p) => norm.indexOf("/app/" + p + "/") >= 0)) continue;
    const lines = readFileSync(f, "utf8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      const code = lines[i].split("//")[0];
      if (code.indexOf("memory.record(") < 0) continue;
      const window = lines.slice(i, i + 3).join("\n");
      if (!/rating\s*:/.test(window)) {
        missing.push(norm + ":" + (i + 1) + "  " + lines[i].trim().slice(0, 80));
      }
    }
  }
  assert.deepEqual(missing, [], "自评模式没传 rating（支撑线 1 的另一半输入）：\n" + missing.join("\n"));
});
