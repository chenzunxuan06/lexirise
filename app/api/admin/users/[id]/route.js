// GET /api/admin/users/[id] —— 用户详情（仅管理员）
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/auth";

function safeParse(s, fallback) {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

export async function GET(req, { params }) {
  if (!(await getAdminFromRequest(req))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });

  const db = await getDb();
  const user = await db
    .prepare("SELECT id, username, nickname, role, created_at, last_active FROM users WHERE id = ?")
    .get(id);
  if (!user) return NextResponse.json({ error: "用户不存在" }, { status: 404 });

  const ud = await db.prepare("SELECT * FROM user_data WHERE user_id = ?").get(id);
  const memory = ud ? safeParse(ud.memory, {}) : {};
  const exams = ud ? safeParse(ud.exams, []) : [];
  const statsDay = ud ? safeParse(ud.stats, {}) : {};
  const customRows = await db
    .prepare("SELECT id, word_en, pos, definition_zh, created_at FROM custom_words WHERE user_id = ? ORDER BY id DESC LIMIT 200")
    .all(id);

  const levels = Object.values(memory);
  const dist = {
    new: 0,
    learning: levels.filter((s) => s.lv >= 1 && s.lv < 6).length,
    mastered: levels.filter((s) => s.lv >= 6).length,
  };
  dist.new = 1535 - levels.length + levels.filter((s) => !s.lv).length;

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      role: user.role,
      created_at: new Date(user.created_at).toLocaleString("zh-CN"),
      last_active: new Date(user.last_active).toLocaleString("zh-CN"),
      learned: levels.length,
      mastered: dist.mastered,
      totalDays: Object.keys(statsDay).length,
    },
    exams: exams.slice(-20).reverse(),
    customWords: customRows.slice(0, 50).map((w) => w.word_en),
    customCount: customRows.length,
  });
}
