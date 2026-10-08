"use client";

// ============================================================
// BottomTab —— 移动端底部导航（≤900px 才渲染）
// ------------------------------------------------------------
// 五项全部来自 lib/nav.js，与桌面书签条**同一份定义**：
//   今日 / 复习 / 词料库 / 成长 / 我的
//
// 2026-10-08（M4）：「我的」从"打开一个底部弹层（.bt-sheet）"改成"跳 /me"。
//   那一页与桌面共用，弹层里的 7 项内容全部在那里 ——
//   同一件事不再有两处实现（弹层与 /me 并存必然走形）。
//   顺带：五项从此结构一致（都是 <Link>，都有 .bt-ic），
//   M1②「我的」比别的项高 24px 的那个毛病不再是"补了个占位"，
//   而是根本不会发生。
//
// 到期角标落在「复习」上（到期 / 错题的家在那里）。
// 「训练」不在底栏：它仍可从「今日」的首屏主动作与单元页进入。
// ============================================================

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { loadWords } from "@/lib/loadWords";
import { NAV_TABS, navTabActive } from "@/lib/nav";
import { memory, onChange } from "@/lib/memory";

export default function BottomTab() {
  const pathname = usePathname();
  const [dueN, setDueN] = useState(0); // 「复习」角标：到期复习词数

  useEffect(() => {
    let words = [];
    loadWords()
      .then((d) => {
        words = d.words || [];
        setDueN(memory.dueWords(words).length);
      })
      .catch(() => {});
    const off = onChange(() => setDueN(memory.dueWords(words).length));
    return off;
  }, []);

  const tabs = useMemo(
    () => NAV_TABS.map((t) => ({ ...t, badge: t.key === "review" ? dueN : 0 })),
    [dueN]
  );

  return (
    <nav className="btab" aria-label="底部导航">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={"btab-item" + (navTabActive(t, pathname) ? " on" : "")}
        >
          <span className="bt-ic">
            {t.badge > 0 && <em>{t.badge > 99 ? "99+" : t.badge}</em>}
          </span>
          <span className="bt-lb">{t.label}</span>
        </Link>
      ))}
    </nav>
  );
}
