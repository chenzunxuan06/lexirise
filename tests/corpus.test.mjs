// ============================================================
// tests/corpus.test.mjs —— 语料索引的形状与纪律
// 用法: node --test "tests/corpus.test.mjs"
//
// 这里测的不是"覆盖率高不高"，而是**几条不能破的纪律**：
//   ① 引用的句子不能是"碎片拼接"（词框被抽平那种）
//   ② 标成「课本词汇表」的（byVocab）必须真的是碎片句 —— 不能拿真句子冒充词表
//   ③ byVocab 与"有原句"互斥（有句子就不该再给词表兜底）
//   ④ 每一条出处都能定位到单元与页码（可翻书核实）
// 这些破掉都不会报错，只会安静地给学生看错东西 —— 所以必须钉住。
// ============================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const DIR = new URL("../public/corpus/", import.meta.url);
const BOOKS = ["7A", "7B", "8A", "8B", "9A", "9B"];
const has = (b) => existsSync(new URL(b + ".json", DIR));
const load = (b) => JSON.parse(readFileSync(new URL(b + ".json", DIR), "utf8"));

/** 与 scripts/corpus_clean.py 的 fragment_mash 同一判据（句末标点后接小写） */
const isMash = (s) => /[.!?]\s+[a-z]/.test(s);

test("六册语料都在，且句数合理", () => {
  let total = 0;
  for (const b of BOOKS) {
    if (!has(b)) continue;
    const c = load(b);
    assert.ok(Array.isArray(c.sentences) && c.sentences.length > 500, b + " 句数异常");
    total += c.sentences.length;
  }
  assert.ok(total > 8000, "六册句子总数应超过 8000（实测 8952），实际 " + total);
});

test("纪律①：被引用的句子不能是碎片拼接", () => {
  let bad = 0, checked = 0;
  const samples = [];
  for (const b of BOOKS) {
    if (!has(b)) continue;
    const c = load(b);
    for (const key of ["byWord", "byWordAny", "byPhrase"]) {
      for (const [wid, idxs] of Object.entries(c[key] || {})) {
        for (const si of idxs) {
          checked++;
          if (isMash(c.sentences[si])) {
            bad++;
            if (samples.length < 3) samples.push(b + "/" + key + " " + c.sentences[si].slice(0, 70));
          }
        }
      }
    }
  }
  assert.ok(checked > 3000, "被引用条目太少，测试可能在空跑：" + checked);
  assert.equal(bad, 0, "有 " + bad + " 条引用指向碎片拼接句，例如：" + samples.join(" | "));
});

test("纪律②：标成「课本词汇表」的必须是碎片句，不能是真句子", () => {
  let bad = 0, checked = 0;
  for (const b of BOOKS) {
    if (!has(b)) continue;
    const c = load(b);
    for (const [wid, idxs] of Object.entries(c.byVocab || {})) {
      for (const si of idxs) {
        checked++;
        if (!isMash(c.sentences[si])) bad++;
      }
    }
  }
  assert.ok(checked > 0, "byVocab 是空的 —— 词表出处这条链路没接上");
  assert.equal(bad, 0, "有 " + bad + " 条「词表出处」指向的是真句子（那就不该标成词表）");
});

test("纪律③：词表出处与「有原句」互斥", () => {
  for (const b of BOOKS) {
    if (!has(b)) continue;
    const c = load(b);
    const have = new Set([...Object.keys(c.byWordForm || {}), ...Object.keys(c.byWordAny || {})]);
    const overlap = Object.keys(c.byVocab || {}).filter((id) => have.has(id));
    assert.equal(overlap.length, 0, b + " 里同时有原句和词表出处：" + overlap.slice(0, 5).join(","));
  }
});

test("契约：有原句的词返回句子，只有词表的词返回 vocab 标记（且 text 为空）", async () => {
  // 把 fetch 桩到磁盘上，直接驱动真实的 lib/corpus.js ——
  // 比在真浏览器里点开某个词稳得多，而且测的正是"数据 → 展示"这个契约。
  const { readFileSync: rf } = await import("node:fs");
  // ⚠️ 基准必须是 public/ 而不是 public/corpus/ —— 否则 "/corpus/7A.json"
  //    会被解析成 public/corpus/corpus/7A.json，全都 404，测试变成空跑。
  const PUB = new URL("../public/", import.meta.url);
  globalThis.fetch = async (url) => {
    const p = new URL(String(url).replace(/^\//, ""), PUB);
    try {
      const txt = rf(p, "utf8");
      return { ok: true, json: async () => JSON.parse(txt) };
    } catch {
      return { ok: false, status: 404, json: async () => ({}) };
    }
  };
  const { sentencesForWord } = await import("../lib/corpus.js");
  const words = JSON.parse(rf(new URL("../public/words.json", import.meta.url), "utf8")).words;

  // 找一个"只有词表出处"的词、一个"有原句"的词
  let vocabWord = null, sentWord = null;
  for (const b of BOOKS) {
    if (!has(b)) continue;
    const c = load(b);
    const sent = new Set([...Object.keys(c.byWordForm || {}), ...Object.keys(c.byWordAny || {})]);
    for (const id of Object.keys(c.byVocab || {})) {
      const w = words.find((x) => String(x.id) === id);
      if (w && !sent.has(id) && !vocabWord) vocabWord = w;
    }
    for (const id of Object.keys(c.byWordAny || {})) {
      const w = words.find((x) => String(x.id) === id);
      if (w && !sentWord) sentWord = w;
    }
  }
  assert.ok(vocabWord, "语料里找不到只有词表出处的词");
  assert.ok(sentWord, "语料里找不到有原句的词");

  const a = await sentencesForWord(vocabWord, 2);
  assert.equal(a.length, 1, "词表出处只应给一条");
  assert.equal(a[0].vocab, true, "必须打上 vocab 标记，展示层才知道换标签");
  assert.equal(a[0].text, "", "词表出处不是句子，text 必须为空（防止被当原句渲染）");
  assert.ok(a[0].source && a[0].source.length > 0, "词表出处也要有可核实的出处");

  const b = await sentencesForWord(sentWord, 2);
  assert.ok(b.length >= 1 && b[0].text.length > 0, "有原句的词必须返回真句子");
  assert.ok(!b[0].vocab, "真句子不能被标成词表出处");
});

test("纪律④：每条出处都能定位到单元（可翻书核实）", () => {
  for (const b of BOOKS) {
    if (!has(b)) continue;
    const c = load(b);
    const metas = c.meta || [];
    const idxs = new Set();
    for (const key of ["byWord", "byWordAny", "byPhrase", "byVocab"]) {
      for (const list of Object.values(c[key] || {})) for (const si of list) idxs.add(si);
    }
    let noUnit = 0, noPage = 0;
    for (const si of idxs) {
      const m = metas[si] || {};
      if (!m.unit) noUnit++;
      if (!m.printPage) noPage++;
    }
    assert.equal(noUnit, 0, b + " 有 " + noUnit + " 条出处没有单元");
    // 页码允许缺（个别册的印刷页算不出来），但不能过半
    assert.ok(noPage <= idxs.size * 0.5, b + " 缺页码的出处过多：" + noPage + "/" + idxs.size);
  }
});
