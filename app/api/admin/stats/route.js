// GET /api/admin/stats —— 网站概览统计（仅管理员）
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/auth";

export async function GET(req) {
  if (!(await getAdminFromRequest(req))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const db = await getDb();
  const d = new Date();
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

  const users = (await db.prepare("SELECT COUNT(*) AS c FROM users").get()).c;
  const todayActive = (await db.prepare("SELECT COUNT(*) AS c FROM users WHERE last_active >= ?").get(dayStart)).c;
  const admins = (await db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").get()).c;

  const rows = await db.prepare("SELECT memory, exams FROM user_data").all();
  let totalLearned = 0;
  let totalExams = 0;
  for (const r of rows) {
    try {
      totalLearned += Object.keys(JSON.parse(r.memory)).length;
      totalExams += (JSON.parse(r.exams) || []).length;
    } catch {
      /* ignore */
    }
  }
  const customWords = (await db.prepare("SELECT COUNT(*) AS c FROM custom_words").get()).c;

  // AI 模块统计
  const aiDate = new Date();
  const aiDateStr = `${aiDate.getFullYear()}-${String(aiDate.getMonth() + 1).padStart(2, "0")}-${String(aiDate.getDate()).padStart(2, "0")}`;
  let aiToday = 0;
  let aiCached = 0;
  try {
    aiToday = Number((await db.prepare("SELECT COALESCE(SUM(calls),0) AS c FROM ai_usage WHERE date = ?").get(aiDateStr)).c) || 0;
    aiCached = Number((await db.prepare("SELECT COUNT(*) AS c FROM ai_cache").get()).c) || 0;
  } catch {
    /* 旧库尚无 AI 表 */
  }

  return NextResponse.json({
    stats: { users, admins, todayActive, totalLearned, totalExams, customWords, aiToday, aiCached },
  });
}
