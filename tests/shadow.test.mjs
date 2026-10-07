// ============================================================
// tests/shadow.test.mjs —— 影子模式（新调度"只算不用"）
// 用法（在 web/ 目录下）:  node --test "tests/shadow.test.mjs"
// ============================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import store from "./_shim.mjs";

const sent = [];
globalThis.fetch = async (url, opts) => {
  sent.push({ url, body: JSON.parse(opts.body) });
  return { ok: true, json: async () => ({ ok: true }) };
};

const { recordShadow, __resetThrottle, DEFAULT_BUDGET } = await import("../lib/srs/shadow.js");
const { flushNow } = await import("../lib/analytics.js");
const { saveGoal, clearGoal } = await import("../lib/goal.js");

const T0 = Date.UTC(2026, 0, 1, 12, 0, 0);
const W = (id, unit, entry_type = "word") => ({ id, grade: 7, semester: 1, unit, entry_type });
const WORDS = [W(1, 1), W(2, 2), W(3, 3), W(100, 1, "phrase")];

function reset() {
  flushNow();
  sent.length = 0;
  store.clear();
  __resetThrottle();
}

function lastMeta() {
  const ev = sent.at(-1)?.body.events.find((e) => e.event === "shadow_schedule");
  return ev ? ev.meta : null;
}

test("影子：记录一条 shadow_schedule，含范围 / 影子结果 / 现行结果", () => {
  reset();
  saveGoal({ at: T0 + 3 * 86400000, units: ["7-1-2"] });

  const res = recordShadow(WORDS, {}, { force: true, now: T0, realIds: [1, 3] });
  flushNow();

  assert.ok(res, "应返回影子调度结果");
  assert.deepEqual(res.ordered.includes(2), true, "范围内(7-1-2)的 #2 应该被选中");

  const meta = lastMeta();
  assert.ok(meta, "应上报 shadow_schedule 事件");
  assert.deepEqual(meta.units, ["7-1-2"]);
  assert.deepEqual(meta.real, [1, 3]);
  assert.ok(Array.isArray(meta.shadow));
  assert.deepEqual(meta.budget, DEFAULT_BUDGET);
});

test("影子：只算不用 —— 不修改传入的 words / states", () => {
  reset();
  clearGoal();
  const words = WORDS.map((w) => ({ ...w }));
  const states = { 1: { lv: 3, due: T0, ok: 2, total: 3 } };
  const wSnap = JSON.stringify(words);
  const sSnap = JSON.stringify(states);

  recordShadow(words, states, { force: true, now: T0 });
  flushNow();

  assert.equal(JSON.stringify(words), wSnap, "words 不应被修改");
  assert.equal(JSON.stringify(states), sSnap, "states 不应被修改");
});

test("影子：没有目标时自动回落到进度推断的范围", () => {
  reset();
  clearGoal();
  recordShadow(WORDS, {}, { force: true, now: T0 });
  flushNow();

  const meta = lastMeta();
  assert.deepEqual(meta.units, ["7-1-1"], "无目标时应推断出第一个未学完的单元");
});

test("影子：空词表直接跳过，且不消耗节流额度", () => {
  reset();
  clearGoal();
  assert.equal(recordShadow([], {}, { now: T0 }), null, "空词表不应产出记录");
  assert.equal(sent.length, 0, "不应上报任何东西");
  // 关键：上面那次空调用不能把节流额度吃掉，否则词表加载后的真调用会被跳过
  const real = recordShadow(WORDS, {}, { now: T0 + 1000 });
  assert.ok(real, "紧随其后的非空调用必须能正常执行");
});

test("影子：节流生效 —— 未到间隔的第二次调用直接跳过", () => {
  reset();
  clearGoal();
  const a = recordShadow(WORDS, {}, { force: true, now: T0 });
  assert.ok(a, "第一次应执行");
  const b = recordShadow(WORDS, {}, { now: T0 + 1000 });
  assert.equal(b, null, "1 秒后应被节流跳过");
  const c = recordShadow(WORDS, {}, { now: T0 + 31 * 60 * 1000 });
  assert.ok(c, "超过 30 分钟应再次执行");
});

test("影子：日志失败不影响返回（上报是静默的）", async () => {
  reset();
  clearGoal();
  const good = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("模拟断网"); };

  let unhandled = null;
  const onUnhandled = (e) => { unhandled = e; };
  process.on("unhandledRejection", onUnhandled);

  const res = recordShadow(WORDS, {}, { force: true, now: T0 });
  flushNow();
  await new Promise((r) => setTimeout(r, 30));

  process.off("unhandledRejection", onUnhandled);
  globalThis.fetch = good;

  assert.ok(res, "断网时仍应返回调度结果");
  assert.equal(unhandled, null, "断网不应产生 unhandledRejection");
});
