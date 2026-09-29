"use client";

// ============================================================
// GameBar —— 全局迷你等级条（克制版）
// 每个学习页面页头一行：Lv.X · XP 进度条 · 称号 · 累计 XP
// 答题获得 XP 时数字跳动 + "+N" 浮起（多邻国式即时反馈）
// ============================================================

import { useEffect, useRef, useState } from "react";
import { game, onGameChange } from "@/lib/game";

export default function GameBar() {
  const [gs, setGs] = useState(null);
  const [fly, setFly] = useState(null); // "+N" 浮起
  const prevXp = useRef(null);

  useEffect(() => {
    const s0 = game.state();
    setGs(s0);
    prevXp.current = s0.xp;
    return onGameChange(() => {
      const s = game.state();
      setGs(s);
      if (prevXp.current != null) {
        const d = s.xp - prevXp.current;
        if (d > 0) {
          setFly(`+${d}`);
          setTimeout(() => setFly(null), 850);
        }
      }
      prevXp.current = s.xp;
    });
  }, []);

  const g = gs || game.state();
  const pct = Math.max(0, Math.min(100, g.levelPct || 0));

  return (
    <div className="gamebar" title={`距下一级还需 ${g.xpNeed} XP`}>
      <span className="gb-lv">Lv.{g.level}</span>
      <div className="gb-track">
        <i style={{ width: pct + "%" }} />
      </div>
      <span className="gb-title">{g.title}</span>
      <span className="gb-xp">
        {g.xp} XP
        {fly && <em className="gb-fly">{fly}</em>}
      </span>
    </div>
  );
}