// ============================================================
// lib/corpus.js —— 课文语料索引的客户端数据层（T18）
// ------------------------------------------------------------
// 数据来自 scripts/build_corpus.py 生成的 public/corpus/{册}.json：
//   { book, sentences: [...], meta: [{id, unit, page, printPage, section}],
//     byWord: { 词id: [句子下标] }, byWordAny: {...} }
//
// 三条设计决定：
//   ① **按册懒加载 + Promise 缓存**。四册加起来 ~700KB，任何页面都不该
//      无条件加载它们；而且同一个册被多个组件请求时只发一次请求
//      （缓存的是 Promise，不是结果 —— 并发调用也只会打一次网络）。
//   ② **加载失败一律当"没有数据"**。九上九下还没做语料索引，
//      fetch 会 404；这时区块自动隐藏，而不是报错或显示空白框。
//      这也是 词跃-课文语料索引方案.md §5 的展示优先级第③条。
//   ③ 出处文案复用 lib/srs/explain.js 的 unitLabel（"七上 U3"），
//      **不在这里另写一套册次映射** —— 同一个格式抄两处，改一处就会悄悄对不上。
// ============================================================

import { unitLabel } from "./srs/explain.js";
// 册次映射（7/1 -> "7A"）现在住在 lib/units.js —— 出题范围也要用它，
// 同一份口径不能有两处。这里再 export 一次，调用方不用改。
import { bookSlot } from "./units.js";
export { bookSlot };

/** 模块级缓存：册名 -> Promise<语料|null> */
const cache = new Map();

/** 按册加载（带缓存）。加载不到返回 null，不抛。 */
export function loadCorpusBySlot(slot) {
  if (!slot) return Promise.resolve(null);
  if (!cache.has(slot)) {
    cache.set(
      slot,
      fetch("/corpus/" + slot + ".json")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
    );
  }
  return cache.get(slot);
}

/** 按 (年级, 学期) 加载 */
export function loadCorpus(grade, semester) {
  return loadCorpusBySlot(bookSlot(grade, semester));
}

/** 把 meta.unit（"7-1-3"）拆成 unitLabel 要的形状 */
function parseUnitKey(key) {
  const [grade, semester, unit] = String(key || "").split("-").map(Number);
  return { grade, semester, unit };
}

/**
 * 出处的可读说法："七上 U1 · Reading · 课本 p.6"
 * 板块可能为 null（识别不出），页码可能缺（七下/九下词库无页码，但印刷页是从页眉算的）。
 */
export function formatSource(meta) {
  if (!meta) return "";
  const parts = [unitLabel(parseUnitKey(meta.unit))];
  if (meta.section) parts.push(meta.section);
  if (meta.printPage) parts.push("课本 p." + meta.printPage);
  return parts.filter(Boolean).join(" · ");
}

function itemOf(book, i) {
  const meta = (book.meta && book.meta[i]) || {};
  return { id: meta.id || book.book + "-" + i, text: book.sentences[i], source: formatSource(meta), meta };
}

/**
 * 「课本词汇表」出处（byVocab）：这个词在课本正文里没有可引用的句子，
 * 只出现在本单元词表/词框那一页。
 *
 * ⚠️ 它**不是句子**，所以 text 故意留空 —— 展示层看到 vocab: true
 * 就换一种说法（"课本词汇表"），绝不能把它当课文原句渲染。
 * 为什么要有它：挡掉"碎片拼接"的假句子之后，这类词的覆盖率会凭空掉 1.8 个百分点；
 * 但它们的出处是真实可核实的，只是**性质不同**。句子归句子，词表归词表。
 */
function vocabItemOf(book, i) {
  const meta = (book.meta && book.meta[i]) || {};
  return {
    id: (meta.id || book.book + "-" + i) + "-vocab",
    text: "",
    source: formatSource(meta),
    meta,
    vocab: true,
  };
}

/**
 * 批量取"这些词的课本原句"。
 *
 * @param {Array} words 词条（需要 grade / semester / id）
 * @param {object} [opts]
 * @param {number} [opts.limit] 每个词最多几句（默认 2）
 * @param {boolean} [opts.allowCrossUnit] 本单元没有时是否退而用别的单元的句子（默认 false）
 * @returns {Promise<Object<number, Array>>} 词 id -> [{id, text, source, meta}]
 */
export async function corpusForWords(words, opts = {}) {
  const list = Array.isArray(words) ? words.filter(Boolean) : [];
  const limit = opts.limit === undefined ? 2 : opts.limit;
  if (!list.length || limit <= 0) return {};

  const slots = [...new Set(list.map((w) => bookSlot(w.grade, w.semester)).filter(Boolean))];
  const books = new Map();
  await Promise.all(
    slots.map(async (s) => books.set(s, await loadCorpusBySlot(s)))
  );

  const out = {};
  for (const w of list) {
    const book = books.get(bookSlot(w.grade, w.semester));
    if (!book) continue;
    let ids = (book.byWord && book.byWord[String(w.id)]) || null;
    if (!ids && opts.allowCrossUnit) ids = (book.byWordAny && book.byWordAny[String(w.id)]) || null;
    if (ids && ids.length) {
      out[w.id] = ids.slice(0, limit).map((i) => itemOf(book, i));
      continue;
    }
    // 没有可引用的句子 → 看它是不是只在词表里出现过（byVocab）。
    // opts.sentencesOnly 的调用方（只想要句子）可以关掉这条路。
    if (opts.sentencesOnly) continue;
    const vs = (book.byVocab && book.byVocab[String(w.id)]) || null;
    if (vs && vs.length) out[w.id] = [vocabItemOf(book, vs[0])];
  }
  return out;
}

/**
 * 单个词的课本原文（ExampleBlock 用）：先是本单元原句，没有就用跨单元兜底，
 * 再没有就退到「课本词汇表」出处。
 *
 * ⚠️ 这里必须传 allowCrossUnit —— 覆盖率口径（byWordAny 也算覆盖）与展示口径
 * 此前不一致：报告说这个词有原句，学生却看不到。出处那一行本来就写着
 * "八上 U2 · Reading · 课本 p.33"，指向的是句子真正所在的那一页，可翻书核实。
 */
export async function sentencesForWord(w, limit = 2) {
  if (!w || w.id === undefined) return [];
  const map = await corpusForWords([w], { limit, allowCrossUnit: true });
  return map[w.id] || [];
}

/** 变形族（T17 的 morphology.json，懒加载 + 缓存） */
let morphoPromise = null;
export function loadMorphology() {
  if (!morphoPromise) {
    morphoPromise = fetch("/morphology.json")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return morphoPromise;
}

export default { bookSlot, loadCorpus, loadCorpusBySlot, corpusForWords, sentencesForWord, formatSource, loadMorphology, vocabItemOf };
