// /api/admin/users —— 用户列表 / 删除用户（仅管理员）
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/auth";

function fmt(d) {
  return d
    ? new Date(d).toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
}

export async function GET(req) {
  if (!(await getAdminFromRequest(req))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const db = await getDb();
  const users = await db
    .prepare("SELECT id, username, nickname, role, created_at, last_active FROM users ORDER BY id")
    .all();
  const dataRows = await db.prepare("SELECT user_id, memory, exams FROM user_data").all();
  const learnedMap = {};
  const examsMap = {};
  for (const r of dataRows) {
    try {
      learnedMap[r.user_id] = Object.keys(JSON.parse(r.memory)).length;
      examsMap[r.user_id] = (JSON.parse(r.exams) || []).length;
    } catch {
      learnedMap[r.user_id] = 0;
      examsMap[r.user_id] = 0;
    }
  }

  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      nickname: u.nickname,
      role: u.role || "user",
      created_at: fmt(u.created_at),
      last_active: fmt(u.last_active),
      learned: learnedMap[u.id] || 0,
      exams: examsMap[u.id] || 0,
    })),
  });
}

export async function DELETE(req) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: "无权限" }, { status: 403 });
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  if (id === admin.id) {
    return NextResponse.json({ error: "不能删除自己的账号" }, { status: 400 });
  }
  const db = await getDb();
  const target = await db.prepare("SELECT username, role FROM users WHERE id = ?").get(id);
  if (!target) return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  if (target.role === "admin") {
    return NextResponse.json({ error: "不能删除管理员账号" }, { status: 400 });
  }
  await db.prepare("DELETE FROM users WHERE id = ?").run(id);
  return NextResponse.json({ ok: true, deleted: target.username });
}
