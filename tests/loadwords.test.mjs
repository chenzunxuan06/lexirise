// ============================================================
// tests/loadwords.test.mjs —— 词库加载必须只发一次网络
// 用法: node --test "tests/loadwords.test.mjs"
//
// 为什么值得测：这不是"性能优化"，是**首页第一屏**。
// 实测未加缓存时手机上一次打开会拉 7 次同一个 763 KB 文件（首屏 5.1 秒）。
// 缓存写错又不会报错 —— 只会安静地多拉几次，或者反过来把失败永久钉住。
// ============================================================
import { test } from "node:test";
import assert from "node:assert/strict";

/** 用假的 fetch 统计调用次数；返回的数据带标记便于断言 */
function stubFetch(behavior) {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    const b = behavior(url, calls.length);
    if (b instanceof Error) throw b;
    if (b && b.fail) return { ok: false, status: b.fail, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ url, n: calls.length }) };
  };
  return calls;
}

test("并发 5 次只打一次网络（首页就是这么调的）", async () => {
  const calls = stubFetch(() => null);
  const mod = await import("../lib/loadWords.js?case=1");
  const rs = await Promise.all([mod.loadWords(), mod.loadWords(), mod.loadWords(), mod.loadWords(), mod.loadWords()]);
  assert.equal(calls.length, 1, "只应发一次请求，实际 " + calls.length + " 次");
  assert.equal(new Set(rs.map((r) => r.n)).size, 1, "五个调用方拿到同一份结果");
});

test("先 await 再调用，仍然不再发网络", async () => {
  const calls = stubFetch(() => null);
  const mod = await import("../lib/loadWords.js?case=2");
  await mod.loadWords();
  await mod.loadWords();
  await mod.loadWords();
  assert.equal(calls.length, 1, "实际 " + calls.length + " 次");
});

test("words 与 affixes 各一份缓存，互不串味", async () => {
  const calls = stubFetch(() => null);
  const mod = await import("../lib/loadWords.js?case=3");
  const w = await mod.loadWords();
  const a = await mod.loadAffixes();
  assert.equal(calls.length, 2);
  assert.equal(w.url, "/words.json");
  assert.equal(a.url, "/affixes.json");
  await mod.loadWords();
  await mod.loadAffixes();
  assert.equal(calls.length, 2, "第二次不应再发");
});

test("HTTP 失败会抛错，且**不缓存失败**（允许重试）", async () => {
  let mode = "fail";
  const calls = stubFetch(() => (mode === "fail" ? { fail: 500 } : null));
  const mod = await import("../lib/loadWords.js?case=4");
  await assert.rejects(() => mod.loadWords(), /加载 words.json 失败: 500/);
  mode = "ok";
  const ok = await mod.loadWords();
  assert.ok(ok && ok.url === "/words.json", "失败之后必须还能重试成功");
  assert.equal(calls.length, 2, "失败那次 + 重试那次 = 2");
});

test("网络抛异常同样清缓存（不允许一次抖动钉死整个会话）", async () => {
  let mode = "throw";
  const calls = stubFetch(() => (mode === "throw" ? new Error("network down") : null));
  const mod = await import("../lib/loadWords.js?case=5");
  await assert.rejects(() => mod.loadWords(), /network down/);
  mode = "ok";
  assert.ok(await mod.loadWords());
  assert.equal(calls.length, 2);
});
