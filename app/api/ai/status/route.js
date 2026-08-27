// GET /api/ai/status —— AI 服务状态（前端据此降级）
// 注意：必须 force-dynamic！否则 Next 会在构建期把该 GET 路由静态预渲染，
// 输出会被"烤死"（构建时无 key → 永久返回未配置，重启也无效）。
import { NextResponse } from "next/server";
import { aiConfigured } from "@/lib/ai";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    configured: aiConfigured(),
    model: process.env.LLM_MODEL || "deepseek-chat",
  });
}