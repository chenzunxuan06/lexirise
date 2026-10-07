// ============================================================
// tests/logging.test.mjs —— 作答日志的集成测试
// 用法（在 web/ 目录下）:  node --test "tests/logging.test.mjs"
// 验证 memory.record() 真的会把一条 answer 事件推进上报通道。
// ============================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import store from "./_shim.mjs";

// 用假的 fetch 捕获上报内容（必须在任何 flush 之前定义）
const sent = [];
globalThis.fetch = async (url, opts) => {
  sent.push({ url, body: JSON.parse(opts.body) });
  return { ok: true, json: async () => ({ ok: true }) };
};

const { memory } = await import("../lib/memory.js");
const { flushNow } = await import("../lib/analytics.js");
const { DAY } = await import("../lib/srs/model.js");

const T0 = Date.UTC(2026, 0, 1, 12, 0, 0);

/** 每个用例都从干净状态开始 */
function reset() {
  flushNow(); // 排空可能残留的缓冲
  sent.length = 0;
  store.clear();
  Date.now = () => T0;
}

test("日志：一次作答产生一条 answer 事件，字段齐全", () => {
  reset();
  memory.record(7, true, true, { mode: "recite" });
  flushNow(); // 不满 10 条不会自动发，收尾上报才会发

  assert.equal(sent.length, 1, "应触发一次上报");
  assert.equal(sent[0].url, "/api/events");
  const ev = sent[0].body.events[0];
  assert.equal(ev.event, "answer");
  assert.equal(ev.meta.w, 7);
  assert.equal(ev.meta.ok, 1);
  assert.equal(ev.meta.isNew, 1);
  assert.equal(ev.meta.mode, "recite");
  assert.equal(ev.meta.lv_before, 0);
  assert.equal(ev.meta.lv_after, 1);
  assert.equal(ev.meta.due_before, 0);
  assert.equal(ev.meta.due_after, T0 + 1 * DAY);
  assert.equal(ev.meta.elapsed, 0);
  assert.equal(ev.meta.rating, null);
});

test("日志：向后兼容 —— 不传 ctx 也能跑（mode 为空串）", () => {
  reset();
  memory.record(8, false, false);
  flushNow();

  const meta = sent[0].body.events[0].meta;
  assert.equal(meta.mode, "");
  assert.equal(meta.w, 8);
  assert.equal(meta.ok, 0);
  assert.equal(meta.lv_after, 0);
  assert.equal(meta.due_after, T0 + 10 * 60000, "答错走 10 分钟复现");
});

test("日志：ctx 里的 elapsed / rating 会原样带上", () => {
  reset();
  memory.record(9, true, false, { mode: "exam", elapsed: 2345, rating: 1 });
  flushNow();

  const meta = sent[0].body.events[0].meta;
  assert.equal(meta.mode, "exam");
  assert.equal(meta.elapsed, 2345);
  assert.equal(meta.rating, 1);
});

test("日志：连着答多题会合并在一次上报里", () => {
  reset();
  memory.record(1, true, true, { mode: "train" });
  memory.record(2, true, true, { mode: "train" });
  memory.record(3, false, true, { mode: "train" });
  flushNow();

  assert.equal(sent.length, 1, "应合并成一次请求");
  assert.equal(sent[0].body.events.length, 3);
  assert.deepEqual(
    sent[0].body.events.map((e) => e.meta.w),
    [1, 2, 3]
  );
  assert.ok(
    sent[0].body.events.every((e) => e.event === "answer"),
    "全部应是 answer 事件"
  );
});

test("日志：上报失败必须是静默的（不能抛 unhandledRejection）", async () => {
  reset();
  const good = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("模拟断网");
  };

  let unhandled = null;
  const onUnhandled = (e) => {
    unhandled = e;
  };
  process.on("unhandledRejection", onUnhandled);

  memory.record(11, true, true, { mode: "recite" });
  flushNow();
  await new Promise((r) => setTimeout(r, 30)); // 给异步 reject 一点时间冒出来

  process.off("unhandledRejection", onUnhandled);
  globalThis.fetch = good;

  assert.equal(unhandled, null, "断网时不应产生 unhandledRejection");
  assert.equal(memory.get(11).lv, 1, "上报失败不能影响学习状态");
});

// ------------------------------------------------------------
// T25：作答日志附带"模型预测的保持率 r_pred"与"实际是否答对 r_actual"
// 这是校准曲线（T26）唯一的输入。没有它，就只能谈"用了 SM-2"，
// 不能谈"SM-2 在这里准不准"。
// ------------------------------------------------------------

test("日志：从没学过的词，r_pred 必须是 null（模型给不出预测，不是预测为 0）", () => {
  reset();
  memory.record(21, true, true, { mode: "recite" });
  flushNow();

  const meta = sent[0].body.events[0].meta;
  assert.equal(meta.r_pred, null, "首次学习没有可谈的预测");
  assert.equal(meta.r_actual, 1);
});

test("日志：学过之后再看同一个词，r_pred 是模型算出的保持率，且随时间衰减", () => {
  reset();
  // 第一次：答对 → lv=1，稳定度 = INTERVALS[1] = 1 天
  memory.record(22, true, true, { mode: "recite" });
  flushNow();
  sent.length = 0;

  // 隔半天再答一次：r_pred = exp(−0.5 / 1) ≈ 0.6065
  Date.now = () => T0 + 0.5 * DAY;
  memory.record(22, true, false, { mode: "recite" });
  flushNow();

  const meta = sent[0].body.events[0].meta;
  assert.ok(meta.r_pred !== null, "学过之后必须有预测");
  assert.ok(
    Math.abs(meta.r_pred - Math.exp(-0.5)) < 1e-9,
    "应为 exp(−0.5/1)，实际 " + meta.r_pred
  );
  assert.equal(meta.r_actual, 1);
  assert.equal(meta.lv_before, 1, "预测取的是作答【之前】的状态");
  assert.equal(meta.lv_after, 2);
});

test("日志：lv=0 的重复接触仍然记 null —— 那是模型的盲区，不能用 0 冒充预测", () => {
  reset();
  // 第一次答错 → lv 仍是 0
  memory.record(23, false, true, { mode: "train" });
  flushNow();
  sent.length = 0;

  Date.now = () => T0 + DAY;
  memory.record(23, false, false, { mode: "train" });
  flushNow();

  const meta = sent[0].body.events[0].meta;
  assert.equal(meta.r_pred, null, "lv=0 时模型没有预测，不能记 0");
  assert.equal(meta.r_actual, 0);
  assert.equal(meta.ok, 0);
});

test("日志：记忆状态仍然正确写入（埋点没有影响学习逻辑）", () => {
  reset();
  memory.record(5, true, true);
  memory.record(5, true, false);
  const s = memory.get(5);
  assert.equal(s.lv, 2);
  assert.equal(s.ok, 2);
  assert.equal(s.total, 2);
  assert.equal(s.due, T0 + 2 * DAY);
});
