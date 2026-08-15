// POST /api/admin/promote —— 首位管理员引导（仅当系统还没有任何管理员时可用）
// 场景：Vercel/远程数据库模式下无法用命令行脚本设管理员，
//       第一位注册的用户在管理后台点"成为管理员"即可完成引导。
// 安全：一旦存在管理员，接口永久关闭（返回 403）。
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

export async function POST(req) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const db = await getDb();
  const adminCount = (
    await db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").get()
  ).c;
  if (adminCount > 0) {
    return NextResponse.json({ error: "系统已有管理员，该引导已关闭" }, { status: 403 });
  }
  await db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(user.id);
  return NextResponse.json({ ok: true });
}
