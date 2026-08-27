// POST /api/ai/practice —— F4 每日个性化练习
// 输入: { count=10, source:'auto'|'unit', grade?, semester?, unit? }
// 选词: auto=登录用户读 user_data.memory（到期词）+ wrong（高频错词），
//       不足由词库随机补足；游客/单元模式按单元或默认年级随机。
// 年级控制: 句子难度按目标词实际年级校准；干扰词只从同年级词里选（保证水平一致）
// 输出: { questions: [{wordId, word, definition_zh, type, q, q_zh, options?, answer, explain}] }
// 缓存: 按 用户+日期+版本（auto）/ 用户+单元+日期+版本（unit）
import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { aiConfigured, chatRobust } from "@/lib/ai";
import { aiCacheGet, aiCacheSet } from "@/lib/ai-cache";
import { aiConsume, LimitError } from "@/lib/limits";
import { bank, wordById, unitWords } from "@/lib/kb";
import { practiceMessages } from "@/lib/prompts";

const CACHE_VER = "v3";
const DEFAULT_GRADE = 8; // 默认按初二水平出题（本项目面向初中生，优先低年级起步）

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 服务端从该用户学习数据选词（到期优先，错题其次），不足随机补 */
function pickPersonal(memRaw, wrongRaw, count, levelGrade) {
  const now = Date.now();
  let mem = {};
  let wrong = {};
  try {
    mem = JSON.parse(memRaw || "{}");
  } catch {
    /* ignore */
  }
  try {
    wrong = JSON.parse(wrongRaw || "{}");
  } catch {
    /* ignore */
  }
  const due = Object.entries(mem)
    .filter(([, s]) => s && s.lv > 0 && s.due <= now)
    .sort((a, b) => (a[1].due || 0) - (b[1].due || 0))
    .map(([id]) => Number(id));
  const weak = Object.entries(wrong)
    .sort((a, b) => (b[1] && b[1].n || 0) - (a[1] && a[1].n || 0))
    .map(([id]) => Number(id));
  const picked = [];
  const seen = new Set();
  const take = (ids) => {
    for (const id of ids) {
      if (picked.length >= count) break;
      if (seen.has(id)) continue;
      const w = wordById(id);
      if (!w || w.entry_type === "phrase") continue;
      // 若用户显式指定了年级，只取该年级（±1 内）的词
      if (levelGrade && w.grade && Math.abs(w.grade - levelGrade) > 1) continue;
      seen.add(id);
      picked.push(w);
    }
  };
  take(due);
  take(weak);
  return picked;
}

/** 从词库抽指定年级的单词池 */
function wordsOfGrade(grade) {
  return bank().words.filter((w) => w.entry_type !== "phrase" && (!grade || w.grade === grade));
}

export async function POST(req) {
  if (!aiConfigured()) {
    return NextResponse.json({ error: "AI 服务未配置" }, { status: 501 });
  }
  let body;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const count = Math.max(5, Math.min(20, Number(body.count) || 10));
  const source = body.source === "unit" ? "unit" : "auto";
  const grade = Number(body.grade) || 0;
  const semester = Number(body.semester);
  const unit = Number(body.unit);
  const useUnit = source === "unit" && grade && semester && unit;

  const user = await getUserFromRequest(req);
  const uid = user ? user.id : 0;
  const today = new Date().toISOString().slice(0, 10);
  const cacheKey = useUnit
    ? `practice:${uid}:${grade}-${semester}-${unit}:${CACHE_VER}:${today}`
    : `practice:${uid}:auto:${grade || "x"}:${CACHE_VER}:${today}`;
  const cached = await aiCacheGet(cacheKey);
  if (cached) {
    return NextResponse.json({ questions: cached, cached: true });
  }

  try {
    await aiConsume(user ? user.id : 0, 1);
  } catch (e) {
    if (e instanceof LimitError) {
      return NextResponse.json({ error: e.message }, { status: 429 });
    }
    throw e;
  }

  // ---- 选词 ----
  let picked = [];
  let levelGrade = useUnit ? grade : (grade || DEFAULT_GRADE);
  if (useUnit) {
    picked = shuffle(unitWords(grade, semester, unit).filter((w) => w.entry_type !== "phrase")).slice(0, count);
  } else if (user) {
    const db = await getDb();
    const row = await db.prepare("SELECT memory, wrong FROM user_data WHERE user_id = ?").get(user.id);
    picked = pickPersonal(row ? row.memory : null, row ? row.wrong : null, count, grade || 0);
    // 用户有学习数据时，句子难度按"所学词的主流年级"校准；无数据则默认初二
    if (picked.length) {
      const cnt = {};
      picked.forEach((w) => {
        const g = w.grade || 0;
        cnt[g] = (cnt[g] || 0) + 1;
      });
      levelGrade = Number(Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0]) || DEFAULT_GRADE;
    } else {
      levelGrade = grade || DEFAULT_GRADE;
    }
  }

  // 补足到 count（同年级为主，其次低一个年级，再不够才用相邻年级）
  if (picked.length < count) {
    const seen = new Set(picked.map((w) => w.id));
    const gradSeq = [levelGrade, levelGrade + 1, levelGrade - 1].filter((g) => g >= 7 && g <= 9);
    for (const g of gradSeq) {
      for (const w of shuffle(wordsOfGrade(g))) {
        if (picked.length >= count) break;
        if (seen.has(w.id)) continue;
        seen.add(w.id);
        picked.push(w);
      }
    }
  }
  if (!picked.length) {
    return NextResponse.json({ error: "词库数据为空，请稍后再试" }, { status: 500 });
  }

  // ---- 干扰词池：只从目标词所在年级选（保证选项水平一致） ----
  const allowedGrades = new Set((picked.map((w) => w.grade)).filter(Boolean));
  let gradePool = [];
  {
    const seen = new Set(picked.map((w) => w.id));
    for (const w of bank().words) {
      if (w.entry_type === "phrase") continue;
      if (allowedGrades.size && w.grade && !allowedGrades.has(w.grade)) continue;
      if (seen.has(w.id)) continue;
      seen.add(w.id);
      gradePool.push(w);
    }
    // 兜底：同年级词不够时放宽
    if (gradePool.length < 16) {
      for (const w of bank().words) {
        if (w.entry_type === "phrase" || seen.has(w.id)) continue;
        seen.add(w.id);
        gradePool.push(w);
        if (gradePool.length >= 24) break;
      }
    }
  }
  const pool = shuffle(gradePool).slice(0, 24);

  const unitLabelText = useUnit ? `${grade}年级${semester === 1 ? "上" : "下"}册 Unit ${unit}` : "";
  const gradeLabel = `${levelGrade}年级`;

  // ---- 生成 ----
  try {
    const data = await chatRobust(
      practiceMessages(picked, pool, unitLabelText, gradeLabel),
      { json: true, maxTokens: 2600, temperature: 0.5, timeoutMs: 90000 }
    );
    const raw = Array.isArray(data.questions) ? data.questions : [];
    const questions = [];
    const types = new Set(["fill", "recall", "transform"]);
    for (let i = 0; i < raw.length && i < picked.length; i++) {
      const q = raw[i];
      const w = picked[i];
      const type = types.has(q.type) ? q.type : "recall";
      // 词库个别词条带 * 等模板标记，答案判定前清理（*captain → captain）
      const cleanWord = String(w.word_en).replace(/^\*+|\*+$/g, "").trim();
      questions.push({
        wordId: w.id,
        word: cleanWord,
        definition_zh: w.definition_zh,
        type,
        q: String(q.q || "").trim(),
        q_zh: String(q.q_zh || "").trim(),
        options:
          type === "fill" && Array.isArray(q.options) && q.options.length >= 2
            ? q.options.slice(0, 4).map((o) => String(o).trim()).filter(Boolean)
            : null,
        answer: String(q.answer || "").trim().toLowerCase().replace(/^\*+|\*+$/g, ""),
        explain: String(q.explain || "").trim(),
      });
    }
    if (!questions.length) {
      return NextResponse.json({ error: "AI 返回内容为空，请重试" }, { status: 502 });
    }
    await aiCacheSet(cacheKey, questions, 1);
    return NextResponse.json({ questions, cached: false });
  } catch (e) {
    return NextResponse.json(
      { error: e.message || "AI 服务暂时不可用" },
      { status: e.status || 503 }
    );
  }
}