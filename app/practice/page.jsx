import { redirect } from "next/navigation";

/**
 * AI 个性化练习 · 旧地址兼容（S2：入口合一到 /ai）
 * 所有 /practice 深链（含 ?unit=grade=semester= 复习包跳题、?mode= 题型）原样转发到
 * /ai?tab=practice&...，由 AI 学习中心的「AI 练习」Tab 承载。
 */
export default async function PracticePage({ searchParams }) {
  const sp = (await searchParams) || {};
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v == null) continue;
    const val = Array.isArray(v) ? v[0] : v;
    if (val) q.set(k, String(val));
  }
  q.set("tab", "practice");
  redirect(`/ai?${q.toString()}`);
}