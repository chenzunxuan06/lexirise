// ============================================================
// lib/kb.js —— 内置知识库（RAG 检索层，服务端专用）
// 词跃 LexiRise · 数智化模块
// ------------------------------------------------------------
// 三层知识库：
//   L0 词库层  public/words.json（1535 词）+ public/affixes.json（391 词根词缀）
//   L1 内置层  lib/builtin-kb.js（易混词对表）
//   L2 个人层  记忆/错题数据（在路由层直读 user_data，不在这里）
// 检索通道（无需向量库，单词即天然检索键）：
//   A 精确键：词 id / word_en / 单元号 / affix_keys
//   B 关联键：同词根词、同单元词、拼写近邻（编辑距离<=2）、易混表命中
// ============================================================
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CONFUSABLES, confusablesFor } from "./builtin-kb.js";

let _bank = null;

/** 懒加载词库（服务端内存索引，与前端同一份数据） */
export function bank() {
  if (_bank) return _bank;
  const words = JSON.parse(
    readFileSync(join(process.cwd(), "public", "words.json"), "utf8")
  );
  const affixes = JSON.parse(
    readFileSync(join(process.cwd(), "public", "affixes.json"), "utf8")
  );
  const byId = new Map();
  const byWord = new Map();
  const byUnit = new Map();
  for (const w of words.words) {
    byId.set(w.id, w);
    const key = String(w.word_en || "").trim().toLowerCase();
    if (key && !byWord.has(key)) byWord.set(key, w);
    const ukey = `${w.grade ?? 0}-${w.semester ?? 0}-${w.unit ?? 0}`;
    if (!byUnit.has(ukey)) byUnit.set(ukey, []);
    byUnit.get(ukey).push(w);
  }
  _bank = {
    meta: words.meta,
    words: words.words,
    affixes,
    byId,
    byWord,
    byUnit,
  };
  return _bank;
}

export function wordById(id) {
  return bank().byId.get(Number(id)) || null;
}

export function wordByText(wordEn) {
  const key = String(wordEn || "").trim().toLowerCase();
  return key ? bank().byWord.get(key) || null : null;
}

/** 单元内词条（按 id 排序，可过滤类型） */
export function unitWords(grade, semester, unit, type) {
  const ws = bank().byUnit.get(`${grade}-${semester}-${unit}`) || [];
  const list = ws.slice().sort((a, b) => a.id - b.id);
  if (type === "word") return list.filter((w) => w.entry_type !== "phrase");
  if (type === "phrase") return list.filter((w) => w.entry_type === "phrase");
  return list;
}

/** 编辑距离（小写比较） */
function editDist(a, b) {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 9;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[m][n];
}

/** 拼写近邻（编辑距离 1~2，限数量） */
function nearMisses(entry, limit = 3) {
  const target = String(entry.word_en).toLowerCase();
  const out = [];
  for (const w of bank().words) {
    if (w.id === entry.id || w.entry_type === "phrase") continue;
    const t = String(w.word_en).toLowerCase();
    if (Math.abs(t.length - target.length) > 1) continue;
    const d = editDist(target, t);
    if (d >= 1 && d <= 2) {
      out.push(w);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/**
 * 检索一个词的讲解上下文（通道 A + B）
 * 返回 { entry, sameRoot, sameUnit, confusables, nearMiss }
 */
export function searchWord(entry) {
  const rootKeys = entry.affix_keys || [];
  const sameRoot = [];
  for (const w of bank().words) {
    if (w.id === entry.id) continue;
    const ks = w.affix_keys || [];
    if (rootKeys.length && ks.some((k) => rootKeys.includes(k))) {
      sameRoot.push(w);
      if (sameRoot.length >= 6) break;
    }
  }
  const sameUnit = (bank().byUnit.get(`${entry.grade ?? 0}-${entry.semester ?? 0}-${entry.unit ?? 0}`) || [])
    .filter((w) => w.id !== entry.id)
    .slice(0, 8);
  const confusables = confusablesFor(entry.word_en);
  const nearMiss = nearMisses(entry);

  // 去重（同 unit 与近邻可能重叠）
  const seen = new Set();
  const uniq = (arr) => arr.filter((w) => (seen.has(w.id) ? false : (seen.add(w.id), true)));
  const unitNeighbors = uniq([...sameUnit, ...nearMiss]);

  return {
    entry,
    sameRoot,
    sameUnit: unitNeighbors,
    confusables,
  };
}

/** 从正文中匹配词库单词（通道 A：F2 我的词表/笔记提取用） */
export function matchWords(text) {
  const b = bank();
  const out = [];
  const seen = new Set();
  const tokens = String(text || "").match(/[A-Za-z][A-Za-z'-]*/g) || [];
  for (const tok of tokens) {
    const t = tok.toLowerCase();
    const hit = b.byWord.get(t);
    if (hit && hit.entry_type !== "phrase" && !seen.has(hit.id)) {
      seen.add(hit.id);
      out.push({ id: hit.id, word: hit.word_en, definition_zh: hit.definition_zh });
    }
  }
  return out;
}

/** 知识库当前规模统计（管理后台用） */
export function kbStats() {
  const b = bank();
  return {
    words: b.words.length,
    withExample: b.meta.with_example_en ?? null,
    withAffix: b.meta.with_affix_hint ?? null,
    confusables: confusablesTotal(),
  };
}

function confusablesTotal() {
  return CONFUSABLES.length;
}

export default { bank, wordById, wordByText, unitWords, searchWord, matchWords, kbStats };