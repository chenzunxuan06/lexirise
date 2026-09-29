// GET /api/share/[token] —— 家长周报（只读、匿名，通过分享链接访问）
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { buildShareReport } from "@/lib/share-report";

export async function GET(_req, { params }) {
  const { token } = params;
  const db = await getDb();
  const report = await buildShareReport(db, token);
  if (!report) {
    return NextResponse.json({ error: "分享链接无效或已失效" }, { status: 404 });
  }
  return NextResponse.json(report);
}