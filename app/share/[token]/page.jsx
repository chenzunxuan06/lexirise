// 家长周报分享页（服务端组件）——无效 token 走 notFound() → 真 404 + 纸墨风页面
// 原为客户端 fetch 方案：页面 URL 永远返回 200，无效 token 无法体现 404。
// 改为服务端直读数据库，与 /api/share/[token] 共用 buildShareReport，语义一致。
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { buildShareReport } from "@/lib/share-report";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: "家长周报 · 词跃 LexiRise" };
}

export default async function SharePage({ params }) {
  const { token } = params;
  const db = await getDb();
  const data = await buildShareReport(db, token);
  if (!data) notFound();

  const w = data.week;
  const o = data.overall;
  const maxDay = Math.max(1, ...w.days.map((d) => d.n + d.review));

  return (
    <div className="wrap">
      <header className="hero share-hero">
        <div className="brand">
          <h1>📊 本周学习报告</h1>
          <span className="en">词跃 LexiRise · 家长周报</span>
        </div>
      </header>

      <section className="share-cards">
        <div className="sc"><b>{w.activeDays}</b><span>本周学习天数</span></div>
        <div className="sc"><b>{w.newWords}</b><span>新学单词</span></div>
        <div className="sc"><b>{w.review}</b><span>复习次数</span></div>
        <div className="sc"><b>{w.correctRate != null ? w.correctRate + "%" : "—"}</b><span>正确率</span></div>
      </section>

      <section className="share-block">
        <div className="sec-title"><span>📅 每日学习量</span></div>
        <div className="share-bars">
          {w.days.map((d) => (
            <div className="sb" key={d.key} title={`${d.label}：新学 ${d.n} / 复习 ${d.review}`}>
              <div className="sb-stack">
                <i className="new" style={{ height: Math.round((d.n / maxDay) * 100) + "%" }} />
                <i className="rev" style={{ height: Math.round((d.review / maxDay) * 100) + "%" }} />
              </div>
              <span>{d.label}</span>
            </div>
          ))}
        </div>
        <div className="share-legend"><span><i className="new" />新学</span><span><i className="rev" />复习</span></div>
      </section>

      <section className="share-block">
        <div className="sec-title"><span>📝 本周测验</span></div>
        <div className="share-line">
          {w.examCount === 0 ? (
            <span className="sec-sub">本周暂无测验</span>
          ) : (
            <span>共 {w.examCount} 次 · 平均 {w.examAvg} 分 · 最高 {w.examBest} 分</span>
          )}
        </div>
      </section>

      <section className="share-block">
        <div className="sec-title"><span>🏆 总体进度</span></div>
        <div className="share-line">
          <span>累计已学 <b>{o.learned}</b> 词 · 已掌握 <b>{o.mastered}</b> 词 · 连续打卡 <b>{o.streak}</b> 天</span>
        </div>
      </section>

      <footer className="footer">由「词跃 LexiRise」自动生成 · 数据仅来自孩子账号</footer>
    </div>
  );
}