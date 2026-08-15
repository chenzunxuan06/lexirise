"use client";

import { useEffect, useMemo, useState } from "react";
import { loadWords } from "@/lib/loadWords";
import { memory, wrongBook, favs, stats, exams } from "@/lib/memory";

export default function StatsPage() {
  const [data, setData] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    loadWords().then(setData).catch((e) => console.error(e));
    const t = setInterval(() => setTick((x) => x + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const learned = memory.learnedCount();
  const mastered = memory.masteredCount();
  const wrongN = wrongBook.count();
  const favN = favs.count();
  const streak = stats.streakDays();
  const totalDays = stats.totalDays();
  const today = stats.today();
  const examList = useMemo(() => exams.list(), [tick]);
  const avgScore = examList.length
    ? Math.round(examList.reduce((s, e) => s + (e.score || 0), 0) / examList.length)
    : 0;
  const lastBest = examList.length ? Math.max(...examList.map((e) => e.score || 0)) : 0;

  // 成绩趋势折线（最近 12 次）
  const trend = useMemo(() => {
    const list = examList.slice(0, 12).reverse();
    if (list.length < 2) return null;
    const W = 560;
    const H = 150;
    const PAD = 24;
    const pts = list.map((e, i) => {
      const x = PAD + (i * (W - PAD * 2)) / Math.max(1, list.length - 1);
      const y = H - PAD - ((e.score || 0) / 100) * (H - PAD * 2);
      return { x, y };
    });
    const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    return { list, pts, path, W, H, PAD };
  }, [examList]);

  // 最近 8 周打卡热力图
  const heat = useMemo(() => {
    const s = stats.load();
    const days = [];
    const todayD = new Date();
    const dayStart = new Date(todayD);
    dayStart.setDate(todayD.getDate() - 55); // 8 周
    for (let i = 0; i < 56; i++) {
      const d = new Date(dayStart);
      d.setDate(dayStart.getDate() + i);
      const k = stats.keyOf(d);
      const rec = s[k] || { total: 0, n: 0, review: 0 };
      days.push({ key: k, total: rec.total, n: rec.n, review: rec.review, label: `${d.getMonth() + 1}/${d.getDate()}` });
    }
    return days;
  }, [tick]);

  const weekRows = useMemo(() => {
    const rows = [];
    for (let i = 0; i < 8; i++) rows.push(heat.slice(i * 7, i * 7 + 7));
    return rows;
  }, [heat]);

  const last7 = useMemo(() => stats.days(7), [tick]);
  const max7 = Math.max(1, ...last7.map((d) => d.total));

  function heatClass(total) {
    if (!total) return "";
    if (total >= 20) return "l4";
    if (total >= 10) return "l3";
    if (total >= 5) return "l2";
    return "l1";
  }

  const words = data ? data.words : [];
  const dueN = useMemo(() => memory.dueWords(words).length, [words, tick]);
  const dist = useMemo(() => memory.distribution(words), [words, tick]);
  const distPct = (v) => (dist.total ? Math.round((v / dist.total) * 100) : 0);

  return (
    <div className="wrap">
      <header className="hero">
        <div className="brand">
          <h1>学习统计</h1>
          <span className="en">My Progress</span>
        </div>
        <p className="tagline">记录每一次学习 · 见证词汇量成长</p>
      </header>

      <div className="stat-cards">
        <div className="stat-card big">
          <div className="stat-num">{streak}</div>
          <div className="stat-name">🔥 连续打卡（天）</div>
        </div>
        <div className="stat-card">
          <div className="stat-num">{totalDays}</div>
          <div className="stat-name">累计学习天数</div>
        </div>
        <div className="stat-card">
          <div className="stat-num">{learned}</div>
          <div className="stat-name">已学单词</div>
        </div>
        <div className="stat-card">
          <div className="stat-num">{mastered}</div>
          <div className="stat-name">已掌握（熟练度≥6）</div>
        </div>
        <div className="stat-card">
          <div className="stat-num">{dueN}</div>
          <div className="stat-name">待复习</div>
        </div>
        <div className="stat-card">
          <div className="stat-num">{wrongN}</div>
          <div className="stat-name">错题本</div>
        </div>
        <div className="stat-card">
          <div className="stat-num">{favN}</div>
          <div className="stat-name">生词本</div>
        </div>
      </div>

      <section className="home-section">
        <div className="section-row">
          <h2 className="section-h">记忆状态分布</h2>
          <span className="section-sub">全词库 {dist.total} 词 · 新词 → 学习中 → 已掌握</span>
        </div>
        <div className="dist-card">
          <div className="dist-bar">
            <div
              className="dist-seg dist-new"
              style={{ width: distPct(dist.n) + "%" }}
              title={`新词 ${dist.n}（${distPct(dist.n)}%）`}
            />
            <div
              className="dist-seg dist-learning"
              style={{ width: distPct(dist.learning) + "%" }}
              title={`学习中 ${dist.learning}（${distPct(dist.learning)}%）`}
            />
            <div
              className="dist-seg dist-mastered"
              style={{ width: distPct(dist.mastered) + "%" }}
              title={`已掌握 ${dist.mastered}（${distPct(dist.mastered)}%）`}
            />
          </div>
          <div className="dist-legend">
            <span className="dist-item">
              <i className="dist-dot new" /> 新词 <b>{dist.n}</b>（{distPct(dist.n)}%）
            </span>
            <span className="dist-item">
              <i className="dist-dot learning" /> 学习中 <b>{dist.learning}</b>（{distPct(dist.learning)}%）
            </span>
            <span className="dist-item">
              <i className="dist-dot mastered" /> 已掌握 <b>{dist.mastered}</b>（{distPct(dist.mastered)}%）
            </span>
          </div>
          <div className="dist-hint">
            💡 学习中（{dist.learning} 词）是记忆的关键期：去
            <a className="link" href="/review?tab=due">复习中心</a>
            把它们巩固到"已掌握"！
          </div>
        </div>
      </section>

      <section className="home-section">
        <div className="section-row">
          <h2 className="section-h">考试成绩</h2>
          <span className="section-sub">
            {examList.length > 0
              ? `共 ${examList.length} 次 · 平均 ${avgScore} 分 · 最高 ${lastBest} 分`
              : "完成单元测验后自动记录"}
          </span>
        </div>
        {examList.length === 0 ? (
          <div className="empty-state small">
            还没有考试记录，去 <a className="link" href="/exam">单元测验</a> 测一次吧
          </div>
        ) : (
          <div className="exam-stats">
            {trend && (
              <div className="trend-card">
                <svg viewBox={`0 0 ${trend.W} ${trend.H}`} className="trend-svg">
                  <line x1={trend.PAD} y1={trend.H - trend.PAD} x2={trend.W - trend.PAD} y2={trend.H - trend.PAD} stroke="var(--border)" />
                  <polyline points={trend.pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  {trend.pts.map((p, i) => (
                    <g key={i}>
                      <circle cx={p.x} cy={p.y} r="3.5" fill="var(--primary)" />
                      <text x={p.x} y={p.y - 9} textAnchor="middle" className="trend-val">
                        {trend.list[i].score}
                      </text>
                    </g>
                  ))}
                </svg>
                <div className="trend-axis">
                  {trend.list.map((e, i) => (
                    <span key={i}>{e.unit ? `U${e.unit}` : "U?"}</span>
                  ))}
                </div>
              </div>
            )}
            <div className="exam-history">
              {examList.slice(0, 15).map((e, i) => (
                <div className="exam-hist-row" key={i}>
                  <span className="exam-hist-label">{e.label || "单元测验"}</span>
                  <span className="exam-hist-time">
                    {new Date(e.at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className={"exam-hist-score" + (e.score >= 80 ? " good" : e.score >= 60 ? " mid" : " bad")}>
                    {e.score} 分
                  </span>
                  <span className="exam-hist-sub">
                    {e.correct}/{e.total} · {Math.floor(e.seconds / 60)}:{String(e.seconds % 60).padStart(2, "0")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="home-section">
        <div className="section-row">
          <h2 className="section-h">最近 8 周打卡热力图</h2>
          <span className="section-sub">颜色越深学得越多</span>
        </div>
        <div className="heat-wrap">
          <div className="heat-legend">
            <span>少</span>
            <i className="heat-cell" />
            <i className="heat-cell l1" />
            <i className="heat-cell l2" />
            <i className="heat-cell l3" />
            <i className="heat-cell l4" />
            <span>多</span>
          </div>
          <table className="heat-table">
            <tbody>
              {weekRows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((d) => (
                    <td key={d.key}>
                      <div
                        className={"heat-cell " + heatClass(d.total)}
                        title={`${d.label}：学习 ${d.total} 词`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="heat-days">
            {heat.slice(-7).map((d) => (
              <span key={d.key}>{d.label}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="home-section">
        <div className="section-row">
          <h2 className="section-h">最近 7 天学习量</h2>
          <span className="section-sub">今日：新学 {today.n} · 复习 {today.review} · 正确 {today.correct}</span>
        </div>
        <div className="bar-chart">
          {last7.map((d) => (
            <div className="bar-col" key={d.key}>
              <div className="bar-val">{d.total > 0 ? d.total : ""}</div>
              <div
                className="bar"
                style={{ height: Math.max(4, (d.total / max7) * 120) + "px" }}
                title={`${d.label}：${d.total} 词`}
              />
              <div className="bar-label">{d.label}</div>
            </div>
          ))}
        </div>
      </section>

      {data && data.meta && (
        <section className="home-section">
          <h2 className="section-h">词库数据</h2>
          <div className="stats">
            <span className="stat">词库 <b>{data.meta.total}</b></span>
            <span className="stat">音标 <b>{data.meta.with_phonetic}</b></span>
            <span className="stat">词根词缀 <b>{data.meta.with_affix_hint}</b></span>
          </div>
        </section>
      )}

      <footer className="footer">
        学习记录保存在本机浏览器（localStorage），换设备或清缓存会丢失
      </footer>
    </div>
  );
}
