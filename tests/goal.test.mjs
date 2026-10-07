// ============================================================
// tests/goal.test.mjs —— 学习目标与进度推断
// 用法（在 web/ 目录下）:  node --test "tests/goal.test.mjs"
// 需要 localStorage shim（readGoal/saveGoal 走 localStorage）。
// ============================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import store from "./_shim.mjs";
import {
  inferCurrentUnit,
  effectiveScope,
  describeScope,
  readGoal,
  saveGoal,
  clearGoal,
} from "../lib/goal.js";

/** 造词条 */
const W = (id, grade, semester, unit, entry_type = "word") => ({ id, grade, semester, unit, entry_type });

const WORDS = [
  W(1, 7, 1, 1), W(2, 7, 1, 1),
  W(3, 7, 1, 2), W(4, 7, 1, 2),
  W(5, 7, 1, 3),
  W(100, 7, 1, 1, "phrase"), // 短语：不应影响进度判断
];

function reset() {
  store.clear();
}

// ---------- 进度推断 ----------

test("推断：什么都没有学过时，当前单元是第一个单元", () => {
  reset();
  assert.equal(inferCurrentUnit(WORDS, {}), "7-1-1");
});

test("推断：Unit1 学完后，前进到 Unit2", () => {
  reset();
  const states = { 1: { lv: 5 }, 2: { lv: 3 } };
  assert.equal(inferCurrentUnit(WORDS, states), "7-1-2");
});

test("推断：全部学完时停在最后一个单元（不越界）", () => {
  reset();
  const states = { 1: { lv: 5 }, 2: { lv: 5 }, 3: { lv: 5 }, 4: { lv: 5 }, 5: { lv: 5 } };
  assert.equal(inferCurrentUnit(WORDS, states), "7-1-3");
});

test("推断：短语不参与进度判断", () => {
  reset();
  assert.equal(inferCurrentUnit([W(100, 7, 1, 1, "phrase")], {}), null, "只有短语时没有可推断的单元");
});

test("推断：lv=0 视为没学过（答错归零的词会让进度退回该单元）", () => {
  reset();
  const states = { 1: { lv: 5 }, 2: { lv: 0 } };
  assert.equal(inferCurrentUnit(WORDS, states), "7-1-1", "Unit1 里还有 lv=0 的词，就还停在这里");
});

// ---------- 范围解析 ----------

test("范围：没有目标时用进度推断，并标记 inferred", () => {
  reset();
  assert.deepEqual(effectiveScope(WORDS, {}), ["7-1-1"]);
  const d = describeScope(WORDS, {});
  assert.equal(d.inferred, true);
  assert.deepEqual(d.units, ["7-1-1"]);
});

test("范围：有目标时优先用目标，不再推断", () => {
  reset();
  saveGoal({ at: 1793000000000, kind: "dictation", units: ["7-1-3", "7-1-2"] });
  assert.deepEqual(effectiveScope(WORDS, {}), ["7-1-3", "7-1-2"]);
  assert.equal(describeScope(WORDS, {}).inferred, false);
});

// ---------- 存取往返 ----------

test("目标：写入后能读回，并带上 updatedAt", () => {
  reset();
  saveGoal({ at: 1793000000000, kind: "quiz", units: ["7-1-5"] });
  const g = readGoal();
  assert.equal(g.at, 1793000000000);
  assert.equal(g.kind, "quiz");
  assert.deepEqual(g.units, ["7-1-5"]);
  assert.ok(g.updatedAt > 0, "应记录写入时间");
});

test("目标：清除后退回推断模式", () => {
  reset();
  saveGoal({ at: 1793000000000, units: ["7-1-5"] });
  assert.ok(readGoal());
  clearGoal();
  assert.equal(readGoal(), null);
  assert.deepEqual(effectiveScope(WORDS, {}), ["7-1-1"], "清除后应回到进度推断");
});

test("目标：脏数据（units 为空）视为没有目标", () => {
  reset();
  saveGoal({ at: 1, units: [] });
  assert.equal(readGoal(), null, "空范围不算有效目标");
});

test("目标：落盘在 plan 里（这样才会跟着账号同步）", () => {
  reset();
  saveGoal({ at: 1793000000000, units: ["7-1-2"] });
  const raw = JSON.parse(store.get("lexirise:plan"));
  assert.ok(raw.goal, "goal 必须存在 lexirise:plan 中（该键在 DATA_KEYS 里，会同步）");
  assert.ok(!store.get("lexirise:settings"), "不应该写进不同步的 settings");
});
