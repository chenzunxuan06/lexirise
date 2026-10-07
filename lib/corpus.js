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
    if (!ids || !ids.length) continue;
    out[w.id] = ids.slice(0, limit).map((i) => itemOf(book, i));
  }
  return out;
}

/** 单个词的课本原句（ExampleBlock 用） */
export async function sentencesForWord(w, limit = 2) {
  if (!w || w.id === undefined) return [];
  const map = await corpusForWords([w], { limit });
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

export default { bookSlot, loadCorpus, loadCorpusBySlot, corpusForWords, sentencesForWord, formatSource, loadMorphology };
