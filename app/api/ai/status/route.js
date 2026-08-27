// GET /api/ai/status —— AI 服务状态（前端据此降级）
import { NextResponse } from "next/server";
import { aiConfigured } from "@/lib/ai";

export async function GET() {
  return NextResponse.json({
    configured: aiConfigured(),
    model: process.env.LLM_MODEL || "deepseek-chat",
  });
}