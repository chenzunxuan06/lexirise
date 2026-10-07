// ============================================================
// tests/srs.test.mjs —— memory.js 的集成测试 + 黄金基准
// 用法（在 web/ 目录下）:  node --test "tests/srs.test.mjs"
//
// 分工：
//   model.test.mjs  —— 纯函数单元测试（算法契约、概率层），不需要 shim
//   本文件          —— 只验证两件事：
//                      ① 委托链路：memory.record 确实调用了 nextState 并落盘
//                      ② 行为未变：480 次作答的仿真结果逐字节复现黄金基准
// ============================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import store from "./_shim.mjs";
import { simulate, fingerprint, DAY } from "./_sim.mjs";

const { memory } = await import("../lib/memory.js");
const here = dirname(fileURLToPath(import.meta.url));
const T0 = Date.UTC(2026, 0, 1, 12, 0, 0);

test("集成：memory.record 委托 nextState，并把状态写进 localStorage", () => {
  store.clear();
  Date.now = () => T0;

  const ret = memory.record(1, true, true);
  assert.deepEqual(ret, memory.get(1), "返回值应与再读一次的结果一致");
  assert.equal(ret.lv, 1);
  assert.equal(ret.due, T0 + DAY);
  assert.equal(ret.first, T0);

  // 关键：状态必须真的落盘（不是只改了个内存对象）
  const persisted = JSON.parse(store.get("lexirise:memory"));
  assert.equal(persisted["1"].lv, 1, "状态必须写进 localStorage");
});

test("集成：连续作答会累积，而不是覆盖", () => {
  store.clear();
  Date.now = () => T0;

  memory.record(2, true, true);
  memory.record(2, true, false);
  const s = memory.get(2);
  assert.equal(s.lv, 2);
  assert.equal(s.ok, 2);
  assert.equal(s.total, 2);
  assert.equal(s.due, T0 + 2 * DAY, "lv=2 对应间隔 2 天");
});

test("黄金：480 次作答的仿真结果必须复现 fixture", () => {
  store.clear();
  const expected = readFileSync(join(here, "fixtures", "golden-memory.json"), "utf8");
  const { final } = simulate(memory);
  const actual = fingerprint(final);
  assert.equal(
    actual,
    expected,
    "算法行为已偏离黄金基准 —— 若是有意改动，请重跑 node tests/srs-golden.mjs 并说明原因"
  );
});
