"use client";

import { useEffect, useMemo, useState } from "react";
import { loadWords } from "@/lib/loadWords";
import { memory, wrongBook, stats, exams } from "@/lib/memory";
import { game, onGameChange, ACHIEVEMENTS, petInfo, petStageName } from "@/lib/game";
import PetImage from "../components/PetImage";
import PetEmpty from "../components/PetEmpty";

export default function AchievementsPage() {
  const [data, setData] = useState(null);
  const [gs, setGs] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    loadWords().then(setData).catch(() => {});
    setGs(game.state());
    const off = onGameChange(() => setGs(game.state()));
    return off;
  }, []);

  const words = data ? data.words.filter((w) => w.entry_type !== "phrase") : [];
  const total = words.length; // 图鉴分母 = 当前词库真实词数（数字纪律：不作为"总量"文案展示）

  // 图鉴进度（从记忆曲线 lv 实时推导，lv≥3 点亮 / ≥7 金边）
  const album = useMemo(() => {
    if (!words.length) return { lit: 0, gold: 0, pct: 0 };
    const m = memory.load();
    let lit = 0, gold = 0;
    for (const w of words) {
      const s = m[w.id];
      if (!s || s.lv === 0) continue;
      if (s.lv >= 3) lit += 1;
      if (s.lv >= 7) gold += 1;
    }
    return { lit, gold, pct: Math.round((lit / total) * 100) };
  }, [words, total, tick]);

  // 刷新成就并返回新获得的
  const [newBadges, setNewBadges] = useState([]);
  useEffect(() => {
    if (!data) return;
    const exs = exams.list();
    const examBest = exs.length ? Math.max(...exs.map((e) => e.score || 0)) : 0;
    const n = game.refreshAchievements({
      learnedCount: memory.learnedCount(),
      masteredCount: memory.masteredCount(),
      wrongCount: wrongBook.count(),
      streak: stats.streakDays(),
      examBest,
      level: game.state().level,
      totalWords: total,
    });
    if (n.length) setNewBadges(n);
    setTick((x) => x + 1);
  }, [data, total]);

  const g = gs || game.state();
  const pet = petInfo();
  const earned = new Set(g.badges || []);
  const earnedCount = ACHIEVEMENTS.filter((a) => earned.has(a.id)).length;

  // 水合安全：首帧（含 SSR）不渲染 localStorage 数据，挂载后再渲染
  if (!gs || !data) {
    return (
      <div className="wrap">
        <PetEmpty action="book" title="加载成就中…" sub="跃跃在帮你翻成绩册" />
      </div>
    );
  }

  return (
    <div className="wrap">
      <header className="hero ach-hero">
        <div className="brand">
          <h1>我的成就</h1>
          <span className="en">游戏化成长 · 图鉴收集</span>
        </div>
      </header>

      {/* 等级卡 */}
      <section className="ach-level">
        <div className="al-mascot">
          <PetImage
            stage={pet.stage}
            action={pet.hungry ? "hungry" : "idle"}
            size={72}
            className="pet-float"
          />
        </div>
        <div className="al-main">
          <div className="al-row">
            <span className="al-lv">Lv.{g.level}</span>
            <span className="al-title">{g.title}</span>
            <span className="al-pet">{pet.name} · {petStageName(pet.stage)}</span>
          </div>
          <div className="al-bar">
            <i style={{ width: (g.levelPct || 0) + "%" }} />
          </div>
          <div className="al-xp">
            <span>⭐ {g.xp} XP</span>
            <span>🪙 {g.coins} 金币</span>
            <span>距下一级还需 {g.xpNeed} XP</span>
          </div>
          <div className="ach-evol">
            <span><PetImage stage={1} action="idle" size={26} round /></span>
            <em>▶</em>
            <span><PetImage stage={2} action="idle" size={26} round /></span>
            <em>▶</em>
            <span><PetImage stage={3} action="idle" size={26} round /></span>
            <b>成长记录</b>
          </div>
        </div>
      </section>

      {/* 图鉴收集 */}
      <section className="ach-album">
        <div className="sec-title">
          <span>单词图鉴</span>
          <span className="sec-sub">{album.lit} / {total}</span>
        </div>
        <div className="album-bar">
          <i className="lit" style={{ width: album.pct + "%" }} />
        </div>
        <div className="album-meta">
          <span>已点亮 <b>{album.lit}</b></span>
          <span>金边（已掌握）<b>{album.gold}</b></span>
        </div>
        <p className="album-tip">背到熟练度 ≥3 点亮图鉴，≥7 升级金边，集齐整本有惊喜</p>
      </section>

      {/* 徽章墙 */}
      <section className="ach-badges">
        <div className="sec-title">
          <span>徽章</span>
          <span className="sec-sub">{earnedCount} / {ACHIEVEMENTS.length}</span>
        </div>
        <div className="badge-grid">
          {ACHIEVEMENTS.map((a) => {
            const has = earned.has(a.id);
            const isNew = newBadges.includes(a.id);
            return (
              <div key={a.id} className={"badge" + (has ? " on" : "") + (isNew ? " new" : "")}>
                <div className="badge-ic">{has ? a.icon : "🔒"}</div>
                <div className="badge-name">{a.name}</div>
                <div className="badge-desc">{a.desc}</div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
