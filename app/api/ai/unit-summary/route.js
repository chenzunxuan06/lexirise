// POST /api/ai/unit-summary —— F5 单元复习包
// 输入: { grade, semester, unit }
// 输出: { unit, intro, key_words, dictation, mindmap, words }
// 说明: dictation（听写单）与 mindmap（知识导图）由词库真数据确定性生成，
//       AI 只负责 intro（复习建议）与 key_words（重点词例句），不编造词条。
// 缓存: unit:<g-s-u>:<日期>（每天刷新一次）
import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { aiConfigured, chatRobust } from "@/lib/ai";
import { aiCacheGet, aiCacheSet } from "@/lib/ai-cache";
import { aiConsume, LimitError } from "@/lib/limits";
import { unitWords } from "@/lib/kb";
import { unitSummaryMessages } from "@/lib/prompts";
import { confusablesFor } from "@/lib/builtin-kb";

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function unitLabel(grade, semester, unit) {
  return `${grade}年级${semester === 1 ? "上" : "下"}册 Unit ${unit}`;
}

export async function POST(req) {
  if (!aiConfigured()) {
    return NextResponse.json({ error: "AI 服务未配置" }, { status: 501 });
  }
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
  const grade = Number(body.grade);
  const semester = Number(body.semester);
  const unit = Number(body.unit);
  if (!grade || !semester || !unit) {
    return NextResponse.json({ error: "缺少年级/册/单元" }, { status: 400 });
  }
  const words = unitWords(grade, semester, unit);
  if (!words.length) {
    return NextResponse.json({ error: "该单元没有词条数据" }, { status: 404 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const cacheKey = `unit:v2:${grade}-${semester}-${unit}:${today}`;
  const cached = await aiCacheGet(cacheKey);
  if (cached) return NextResponse.json(cached);

  const user = await getUserFromRequest(req);
  try {
    await aiConsume(user ? user.id : 0, 1);
  } catch (e) {
    if (e instanceof LimitError) {
      return NextResponse.json({ error: e.message }, { status: 429 });
    }
    throw e;
  }

  const entries = words.filter((w) => w.entry_type !== "phrase");
  const phrases = words.filter((w) => w.entry_type === "phrase");
  const unitWordsSet = new Set(words.map((w) => String(w.word_en).trim().toLowerCase()));
  // 易混考点：易混对任意一边在本单元
  const confPairs = [];
  for (const w of words) {
    for (const c of confusablesFor(w.word_en)) {
      const key = `${c.a}|${c.b}`;
      if (!confPairs.some((x) => `${x.a}|${x.b}` === key)) confPairs.push(c);
    }
  }

  let intro = null;
  let keyWords = [];
  let aiError = null;
  try {
    const data = await chatRobust(
      unitSummaryMessages(unitLabel(grade, semester, unit), entries, phrases, confPairs),
      { json: true, maxTokens: 2600, temperature: 0.6, timeoutMs: 90000 }
    );
    intro = String(data.intro || "").trim() || null;
    keyWords = Array.isArray(data.key_words)
      ? data.key_words
          .map((k) => ({
            word: String(k.word || "").trim(),
            sentence_en: String(k.sentence_en || "").trim(),
            sentence_zh: String(k.sentence_zh || "").trim(),
          }))
          .filter((k) => k.word && k.sentence_en)
          .slice(0, 15)
      : [];
  } catch (e) {
    // AI 失败不阻塞复习包：确定性部分照常返回
    aiError = e.message;
  }

  // ---- 确定性部分 ----
  const dictation = shuffle(entries)
    .slice(0, 30)
    .map((w, i) => ({
      no: i + 1,
      word: w.word_en,
      phonetic: w.phonetic || "",
      definition_zh: w.definition_zh,
    }));

  const affixFamilies = [];
  const familyMap = new Map();
  for (const w of entries) {
    const keys = w.affix_keys || [];
    if (!keys.length) continue;
    const fam = keys[0];
    if (!familyMap.has(fam)) {
      familyMap.set(fam, { family: fam, words: [] });
      affixFamilies.push(familyMap.get(fam));
    }
    familyMap.get(fam).words.push({
      word: w.word_en,
      definition_zh: w.definition_zh,
      hint: w.affix_hint || null,
    });
  }
  // 有词根提示（affix_hint 无 familyKey 兜底）的归入"其他"
  const hintedOthers = entries.filter((w) => w.affix_hint && !(w.affix_keys || []).length);

  const result = {
    unit: { grade, semester, unit, label: unitLabel(grade, semester, unit) },
    intro,
    ai_error: aiError,
    key_words: keyWords,
    dictation,
    mindmap: {
      core_words: entries.map((w) => ({
        word: w.word_en,
        phonetic: w.phonetic || "",
        pos: w.pos || "",
        definition_zh: w.definition_zh,
      })),
      affix_families: affixFamilies,
      hinted_others: hintedOthers.map((w) => ({
        word: w.word_en,
        definition_zh: w.definition_zh,
        hint: w.affix_hint,
      })),
      phrases: phrases.map((p) => ({ word: p.word_en, definition_zh: p.definition_zh })),
      confusables: confPairs,
    },
    words: entries.map((w) => ({
      id: w.id,
      word: w.word_en,
      phonetic: w.phonetic || "",
      pos: w.pos || "",
      definition_zh: w.definition_zh,
      affix_hint: w.affix_hint || null,
      example_en: w.example_en || null,
      example_zh: w.example_zh || null,
    })),
  };
  await aiCacheSet(cacheKey, result, 1);
  return NextResponse.json(result);
}