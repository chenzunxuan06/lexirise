"use client";

import { useEffect, useState } from "react";
import { onToast } from "@/lib/game";

/**
 * 全局奖励反馈 Toast（S1）
 * 订阅 lib/game.js 的 toast 流：升级 / 进化 / 每日上限 / 任务完成 / 测验奖励
 * 挂载一次于 RootLayout，全站通用，自动消失。
 */
export default function RewardToast() {
  const [list, setList] = useState([]);

  useEffect(() => {
    let idc = 0;
    const off = onToast((item) => {
      const id = ++idc;
      setList((l) => [...l, { ...item, id }]);
      setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), 3000);
    });
    return off;
  }, []);

  if (!list.length) return null;
  return (
    <div className="rtoast-stack">
      {list.map((t) => (
        <div key={t.id} className={"rtoast" + (t.tone ? " " + t.tone : "")}>
          <span className="rt-ic">{t.icon}</span>
          <div>
            <div className="rt-t">{t.title}</div>
            {t.sub && <div className="rt-s">{t.sub}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}