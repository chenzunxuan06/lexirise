// GET /api/admin/backup —— 下载数据库备份（仅管理员）
// 本地模式：SQLite VACUUM INTO 生成一致性快照（.db 文件）
// 远程模式（Turso）：导出四张表的 JSON 备份（Turso 控制台也提供快照/导出）
import { NextResponse } from "next/server";
import { getDb, isRemote } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/auth";
import { readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const TABLES = ["users", "sessions", "user_data", "custom_words"];

export async function GET(req) {
  if (!(await getAdminFromRequest(req))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const db = await getDb();
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);

  if (isRemote()) {
    // 远程模式：JSON 全量导出
    const dump = { exportedAt: new Date().toISOString(), tables: {} };
    for (const t of TABLES) {
      dump.tables[t] = await db.prepare(`SELECT * FROM ${t}`).all();
    }
    const buf = Buffer.from(JSON.stringify(dump, null, 1), "utf-8");
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="lexirise-backup-${stamp}.json"`,
      },
    });
  }

  // 本地模式：VACUUM INTO 一致性快照
  const tmp = join(process.cwd(), "data", `backup-${stamp}.db`);
  try {
    db.vacuumInto(tmp);
    const buf = readFileSync(tmp);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="lexirise-backup-${stamp}.db"`,
      },
    });
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}
