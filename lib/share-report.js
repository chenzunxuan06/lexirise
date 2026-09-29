// ============================================================
// lib/share-report.js —— 家长周报数据构建（服务端专用）
// 页面（app/share/[token]）与 API（app/api/share/[token]）共用，
// 保证「无效 token → 404」的语义两处完全一致。
// ============================================================
import { getDb } from "@/lib/db";

const DAY = 86400000;

function safeJson(s, fb) {
  try {
    return JSON.parse(s);
  } catch {
    return fb;
  }
}
function keyOf(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * 构建周报数据。token 无效 / 用户无数据时返回 null（调用方据此返回 404）。
 * @param {object} db 已打开的数据库（getDb() 返回值）
 * @param {string} token 分享 token
 * @returns {Promise<object|null>} { week, overall } 或 null
 */
export async function buildShareReport(db, token) {
  const share = await db.prepare("SELECT user_id FROM shares WHERE token = ?").get(String(token));
  if (!share) return null;
  const row = await db.prepare("SELECT memory, stats, exams FROM user_data WHERE user_id = ?").get(share.user_id);
  if (!row) return null;

  const statsObj = safeJson(row.stats, {});
  const exams = safeJson(row.exams, []);
  const mem = safeJson(row.memory, {});

  // 最近 7 天统计
  const now = Date.now();
  const days = [];
  let weekNew = 0,
    weekReview = 0,
    weekCorrect = 0,
    weekTotal = 0,
    activeDays = 0;
  for (let i = 6; i >= 0; i--) {
    const k = keyOf(now - i * DAY);
    const d = statsObj[k] || { n: 0, review: 0, correct: 0, total: 0 };
    if (d.total > 0) activeDays += 1;
    weekNew += d.n || 0;
    weekReview += d.review || 0;
    weekCorrect += d.correct || 0;
    weekTotal += d.total || 0;
    days.push({
      key: k,
      label: `${new Date(now - i * DAY).getMonth() + 1}/${new Date(now - i * DAY).getDate()}`,
      n: d.n || 0,
      review: d.review || 0,
    });
  }

  const learned = Object.keys(mem).length;
  const mastered = Object.values(mem).filter((s) => s && s.lv >= 6).length;

  // 最近 7 天测验
  const recentExams = exams.filter((e) => now - (e.at || 0) < 7 * DAY);
  const examAvg = recentExams.length
    ? Math.round(recentExams.reduce((s, e) => s + (e.score || 0), 0) / recentExams.length)
    : null;
  const examBest = recentExams.length ? Math.max(...recentExams.map((e) => e.score || 0)) : null;

  // 连续打卡
  let streak = 0;
  const d0 = new Date();
  if (!statsObj[keyOf(d0)]) d0.setDate(d0.getDate() - 1);
  while (statsObj[keyOf(d0)]) {
    streak += 1;
    d0.setDate(d0.getDate() - 1);
  }

  return {
    week: {
      activeDays,
      newWords: weekNew,
      review: weekReview,
      correctRate: weekTotal ? Math.round((weekCorrect / weekTotal) * 100) : null,
      examCount: recentExams.length,
      examAvg,
      examBest,
      days,
    },
    overall: { learned, mastered, streak },
  };
}