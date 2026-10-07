// ============================================================
// tests/model.test.mjs —— lib/srs/model.js 的纯函数单元测试
// 用法（在 web/ 目录下）:  node --test "tests/model.test.mjs"
//
// 这一层直接跑纯函数，不需要 localStorage shim。
// 委托链路（memory.record → nextState）与黄金基准在 tests/srs.test.mjs。
// ============================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { nextState, stabilityOf, retrievability, DAY, EMPTY } from "../lib/srs/model.js";

const T0 = Date.UTC(2026, 0, 1, 12, 0, 0);
const RELEARN = 10 * 60000;

/** 连续答对 n 次后的状态 */
function afterCorrect(n, start = null) {
  let s = start;
  for (let i = 0; i < n; i++) s = nextState(s, true, T0, i === 0 && !start).state;
  return s;
}

// ---------- 行为规格（这些是算法契约，改动必须是有意识的） ----------

test("规格：首次答对 → lv=1，间隔 1 天，写入 first", () => {
  const { state } = nextState(null, true, T0, true);
  assert.equal(state.lv, 1);
  assert.equal(state.ok, 1);
  assert.equal(state.total, 1);
  assert.equal(state.lapses, 0);
  assert.equal(state.due, T0 + 1 * DAY);
  assert.equal(state.first, T0);
});

test("规格：lv 封顶 8，间隔 120 天", () => {
  const s = afterCorrect(12);
  assert.equal(s.lv, 8, "lv 不得超过 8");
  assert.equal(s.due, T0 + 120 * DAY);
});

test("规格：答错回退 2 级且 10 分钟后复现", () => {
  const before = afterCorrect(5);
  assert.equal(before.lv, 5);
  const s = nextState(before, false, T0, false).state;
  assert.equal(s.lv, 3, "5 - 2 = 3");
  assert.equal(s.lapses, 1);
  assert.equal(s.due, T0 + RELEARN);
});

test("规格：低等级答错钳到 0（lv=1 与 lv=2 都归零）", () => {
  const a = nextState(afterCorrect(1), false, T0, false).state;
  assert.equal(a.lv, 0, "lv=1 答错 → 0");
  const b = nextState(afterCorrect(2), false, T0, false).state;
  assert.equal(b.lv, 0, "lv=2 答错 → 0");
});

test("规格：满级答错只掉到 6", () => {
  const s = nextState(afterCorrect(10), false, T0, false).state;
  assert.equal(s.lv, 6);
});

test("规格：isNew=false 时不写 first", () => {
  const { state } = nextState(null, true, T0, false);
  assert.equal(state.first, 0, "非首次学习应保持 first=0");
});

// ---------- 纯函数性质 ----------

test("纯函数：不修改传入的 prev，且返回新对象", () => {
  const prev = { ...EMPTY, lv: 3, ok: 2, total: 3, last: T0 - DAY };
  const snapshot = JSON.stringify(prev);
  const { state } = nextState(prev, true, T0, false);
  assert.equal(JSON.stringify(prev), snapshot, "prev 不应被就地修改");
  assert.notEqual(state, prev, "应返回新对象");
  assert.equal(state.lv, 4);
});

test("纯函数：log 记录了迁移前后的关键字段", () => {
  const { log } = nextState({ ...EMPTY, lv: 5, due: T0 - 1000 }, false, T0, false);
  assert.equal(log.lv_before, 5);
  assert.equal(log.lv_after, 3);
  assert.equal(log.due_before, T0 - 1000);
  assert.equal(log.due_after, T0 + RELEARN);
});

// ---------- 概率解释层 ----------

test("stabilityOf：把 lv 映射到间隔表，并做边界钳制", () => {
  assert.equal(stabilityOf(0), 0);
  assert.equal(stabilityOf(1), 1);
  assert.equal(stabilityOf(4), 7);
  assert.equal(stabilityOf(8), 120);
  assert.equal(stabilityOf(99), 120, "超上限应钳到 120");
  assert.equal(stabilityOf(-1), 0, "负数应钳到 0");
});

test("retrievability：到期时刻恒为 e⁻¹（约 0.3679）", () => {
  const st = { ...EMPTY, lv: 4, last: T0, ok: 4, total: 4 }; // S = 7 天
  assert.equal(retrievability(st, T0), 1, "刚答完时 R = 1");
  const rDue = retrievability(st, T0 + 7 * DAY);
  assert.ok(Math.abs(rDue - Math.exp(-1)) < 1e-9, "到期时 R 应为 e⁻¹");
  assert.ok(retrievability(st, T0 + 14 * DAY) < rDue, "放得越久 R 越低");
  assert.equal(retrievability(st, T0 - DAY), 1, "时间倒流也不应超过 1");
});

test("retrievability：未学过的词为 0", () => {
  assert.equal(retrievability(null, T0), 0);
  assert.equal(retrievability({ ...EMPTY }, T0), 0);
  assert.equal(retrievability({ ...EMPTY, lv: 3, last: 0 }, T0), 0, "没有 last 视为无有效状态");
});
