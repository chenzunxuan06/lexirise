// ============================================================
// tests/focus.test.mjs —— 纸间专注数据层的单测
// 用法（在 web/ 目录下）:  node --test "tests/focus.test.mjs"
// 覆盖方向文档 §6.1 的契约：读回、按本地日期统计、byUse 分组、
// 自定义用途的去重/trim/截断/最近在前、200 条上限、全空不是 null，
// 以及"localStorage 不可用时任何函数都不许抛异常"。
// ============================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import store from "./_shim.mjs";

const { USES, PRESETS, MODES, readLog, addSession, todaySummary, addCustomUse, customUses } =
  await import("../lib/focus.js");

// 固定在 UTC 正午：这个时刻在全世界绝大多数时区都还是同一天，
// 所以"今天/昨天"的断言不会因为跑测试的机器在哪个时区而翻。
const T0 = Date.UTC(2026, 0, 1, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

/** 每个用例都从干净状态开始 */
function reset() {
  store.clear();
  Date.now = () => T0;
}

/** 造一笔记录，只写关心的字段 */
function rec(over = {}) {
  return { use: "背单词", mode: "stopwatch", planMs: 0, actualMs: 60000, done: true, ...over };
}

test("契约：USES / PRESETS / MODES 与方向文档 §6.1 一字不差", () => {
  reset();
  // 顺序本身就是主张（前两项英语学习，后两项学生真实生活），所以连顺序一起锁住
  assert.deepEqual(USES, ["背单词", "背课文", "写试卷", "看纸质书", "其他"]);
  assert.deepEqual(PRESETS, [15, 30, 45, 60, 90]);
  assert.deepEqual(
    MODES.map((m) => m.key),
    ["stopwatch", "countdown", "clock"]
  );
  assert.deepEqual(
    MODES.map((m) => m.label),
    ["正计时", "倒计时", "定时"]
  );
});

test("记一笔之后 readLog() 能读回来，字段一个不少", () => {
  reset();
  const saved = addSession(rec({ use: "背单词", mode: "countdown", planMs: 900000, actualMs: 720000 }));

  const log = readLog();
  assert.equal(log.sessions.length, 1);
  assert.deepEqual(log.sessions[0], {
    use: "背单词",
    mode: "countdown",
    planMs: 900000,
    actualMs: 720000,
    done: true,
    at: T0,
  });
  assert.equal(saved.at, T0, "返回的应该是落库的那一条");
});

test("readLog() 全空时给 { sessions: [], custom: [] }，绝不返回 null", () => {
  reset();
  assert.deepEqual(readLog(), { sessions: [], custom: [] });
  assert.notEqual(readLog(), null);

  // 同步层 pull() 对"服务器上没有数据的账号"写进来的就是一个 {}（见 lib/sync.js），
  // 界面不能因为这个拿到 undefined.sessions
  store.set("lexirise:focus", "{}");
  assert.deepEqual(readLog(), { sessions: [], custom: [] });

  // 用户手改坏了 / 旧版本残留的半截 JSON，也只当没数据
  store.set("lexirise:focus", "{ 这不是 JSON");
  assert.deepEqual(readLog(), { sessions: [], custom: [] });
});

test("todaySummary() 只统计今天：昨天那一笔不进账", () => {
  reset();
  addSession(rec({ actualMs: 60000 })); // 今天

  Date.now = () => T0 - DAY;
  addSession(rec({ actualMs: 600000 })); // 昨天
  Date.now = () => T0;

  const s = todaySummary();
  assert.equal(s.count, 1, "昨天那笔不能算进今天");
  assert.equal(s.ms, 60000, "合计里也不许有昨天的时间");
  assert.deepEqual(s.byUse, { 背单词: { count: 1, ms: 60000 } });
});

test("todaySummary() 按用途分组，ms 是求和不是覆盖", () => {
  reset();
  addSession(rec({ use: "背单词", actualMs: 600000 }));
  addSession(rec({ use: "看纸质书", actualMs: 900000 }));
  addSession(rec({ use: "背单词", actualMs: 300000 }));

  const s = todaySummary();
  assert.equal(s.count, 3);
  assert.equal(s.ms, 1800000);
  assert.deepEqual(s.byUse, {
    背单词: { count: 2, ms: 900000 },
    看纸质书: { count: 1, ms: 900000 },
  });
});

test("取消的那一笔也照记：数据层只负责记下来，不替用户判断值不值得记", () => {
  reset();
  addSession(rec({ use: "写试卷", mode: "clock", planMs: 1800000, actualMs: 420000, done: false }));

  const log = readLog();
  assert.equal(log.sessions.length, 1, "取消也是真的坐了一段时间");
  assert.equal(log.sessions[0].done, false, "done=false 要如实存下来，界面才知道它是取消的");
  assert.equal(todaySummary().ms, 420000);
});

test("addCustomUse()：trim + 去重 + 截断 20 字，空白名字不落库", () => {
  reset();
  assert.equal(addCustomUse("  抄笔记  "), "抄笔记");
  assert.equal(addCustomUse("抄笔记"), "抄笔记");
  assert.deepEqual(customUses(), ["抄笔记"], "重复的名字不能存两条");

  const long = "一二三四五六七八九十一二三四五六七八九十壹"; // 21 个字
  assert.equal(Array.from(long).length, 21, "先确认素材真的是 21 个字");
  const got = addCustomUse(long);
  assert.equal(Array.from(got).length, 20, "第 21 个字要丢掉");
  assert.equal(got, "一二三四五六七八九十一二三四五六七八九十");

  assert.equal(addCustomUse("   "), "", "空白名字返回空串，不落库");
  assert.equal(addCustomUse(undefined), "");
  assert.equal(customUses().length, 2);
});

test("customUses()：最近用过的在前，最多 8 个", () => {
  reset();
  addCustomUse("甲");
  addCustomUse("乙");
  addCustomUse("丙");
  assert.deepEqual(customUses(), ["丙", "乙", "甲"]);

  addCustomUse("甲"); // 再用一次 = 提到最前
  assert.deepEqual(customUses(), ["甲", "丙", "乙"]);

  for (let i = 1; i <= 12; i++) addCustomUse(`用途${i}`);
  const list = customUses();
  assert.equal(list.length, 8, "最多给 8 个");
  assert.equal(list[0], "用途12", "最新的在最前");
  assert.equal(list[7], "用途5", "更早用过的被挤出去");
});

test("sessions 只保留最近 200 条", () => {
  reset();
  for (let i = 0; i < 205; i++) addSession(rec({ actualMs: i }));

  const list = readLog().sessions;
  assert.equal(list.length, 200, "上限就是 200");
  assert.equal(list[0].actualMs, 5, "最老的 5 条应该被挤出去");
  assert.equal(list[199].actualMs, 204, "最新那条必须还在");
});

test("隐私模式：localStorage 抛异常时全部静默，一个异常都不许冒出来", () => {
  reset();
  const real = globalThis.localStorage;
  globalThis.localStorage = {
    getItem() {
      throw new Error("隐私模式禁用了存储");
    },
    setItem() {
      throw new Error("隐私模式禁用了存储");
    },
  };
  try {
    assert.deepEqual(readLog(), { sessions: [], custom: [] });
    const saved = addSession(rec());
    assert.equal(saved.at, T0, "存不进去也要把这次结果还给界面，否则计时页会崩");
    assert.deepEqual(todaySummary(), { count: 0, ms: 0, byUse: {} });
    assert.equal(addCustomUse("抄笔记"), "抄笔记", "存不下也要回一个能用的名字");
    assert.deepEqual(customUses(), []);
  } finally {
    globalThis.localStorage = real;
  }
});

test("连 localStorage 这个全局都没有（SSR / 老浏览器）也不抛异常", () => {
  reset();
  const real = globalThis.localStorage;
  delete globalThis.localStorage;
  try {
    assert.deepEqual(readLog(), { sessions: [], custom: [] });
    addSession(rec({ use: "其他" }));
    assert.deepEqual(customUses(), []);
  } finally {
    globalThis.localStorage = real;
  }
});
