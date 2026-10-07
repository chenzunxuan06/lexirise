// ============================================================
// tests/pace.test.mjs —— 学习节奏（每日预算两档预设）
// 用法（在 web/ 目录下）:  node --test "tests/pace.test.mjs"
// 需要 localStorage shim（写的是 plan）。
//
// 为什么值得测：这一档直接决定"学生每天背多少"。
// 写错了不会报错 —— 只会安静地让所有人每天多背一倍，或者让预设变成摆设。
// ============================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import store from "./_shim.mjs";
import { PACES, PACE_KEYS, paceOf, paceLabel, getPace, applyPace, readPace } from "../lib/pace.js";
import { plan } from "../lib/memory.js";
import { readReviewCap, REVIEW_CAP_CHOICES, DEFAULT_REVIEW_CAP } from "../lib/progress.js";

function reset() {
  store.clear();
}

test("两档预设：必须先真的不一样，否则预设是摆设", () => {
  assert.equal(PACES.length, 2);
  const [a, b] = PACES;
  assert.notEqual(a.dailyNew, b.dailyNew, "两档的每日新词不能相同");
  assert.notEqual(a.reviewCap, b.reviewCap, "两档的复习上限不能相同");
  assert.ok(b.dailyNew > a.dailyNew && b.reviewCap > a.reviewCap, "假期档必须比考前档更重");
});

test("两档预设：数字都落在各自允许的范围内（设置页上限 50 / 复习上限选项）", () => {
  for (const p of PACES) {
    assert.ok(p.dailyNew >= 1 && p.dailyNew <= 50, p.key + " 的新词目标超出设置页范围 1–50");
    assert.ok(REVIEW_CAP_CHOICES.includes(p.reviewCap), p.key + " 的复习上限不在 REVIEW_CAP_CHOICES 里");
    assert.ok(p.label && p.desc, p.key + " 必须有给人看的名字和说明");
  }
});

test("考前档 = 线上现状：默认值一个字都没改", () => {
  reset();
  const exam = getPace("exam");
  assert.equal(exam.dailyNew, 10, "默认 dailyNew 就是 10（memory.plan 的默认值）");
  assert.equal(exam.reviewCap, DEFAULT_REVIEW_CAP, "默认复习上限就是 40");
});

test("反推节奏：正好等于某档才算命中，否则是自定义", () => {
  assert.equal(paceOf(10, 40).key, "exam");
  assert.equal(paceOf(20, 60).key, "holiday");
  assert.equal(paceOf(10, 60), null, "只对上半个不算命中");
  assert.equal(paceOf(15, 40), null);
  assert.equal(paceLabel(15, 40), "自定义");
  assert.equal(paceLabel(20, 60), "假期模式");
});

test("反推节奏：不封顶（reviewCap = 0）不是任何一档", () => {
  assert.equal(paceOf(10, 0), null, "0 表示不封顶，与预设的 40/60 都不是一回事");
});

test("应用节奏：两个旋钮一起写，写完再反推能对上", () => {
  reset();
  const r = applyPace("holiday");
  assert.deepEqual(r, { dailyNew: 20, reviewCap: 60 });
  assert.equal(plan.load().dailyNew, 20, "新词目标要真的落库");
  assert.equal(readReviewCap(), 60, "复习上限要真的落库");
  assert.equal(readPace().key, "holiday", "读完要认得出是假期档");
  assert.equal(readPace().label, "假期模式");
});

test("应用节奏：来回切换不残留（切回考前档就是原样）", () => {
  reset();
  applyPace("holiday");
  applyPace("exam");
  assert.deepEqual(readPace(), { key: "exam", label: "考前模式", dailyNew: 10, reviewCap: 40 });
});

test("应用节奏：微调其中一个旋钮后，自动变成自定义（不会假称还在某一档）", () => {
  reset();
  applyPace("holiday");
  plan.setDailyNew(25);
  assert.equal(readPace().key, null);
  assert.equal(readPace().label, "自定义");
});

test("未知节奏：直接报错，不静默回落到某一档", () => {
  reset();
  assert.throws(() => getPace("nope"), /未知的学习节奏/);
  assert.throws(() => applyPace(""), /未知的学习节奏/);
  assert.deepEqual(PACE_KEYS, ["exam", "holiday"]);
});
