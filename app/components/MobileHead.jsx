"use client";

// ============================================================
// app/components/MobileHead.jsx —— 手机端窄头（≤900px）
// ------------------------------------------------------------
// 它取代的是原先**浮在内容上**的 ☰（position:fixed / 12,12 / 42×42 / z-index:70）：
// 实测（390×844，13 个页面逐页量）有 7 个页面的正文被它压住，其中 /unit 的
// 「‹ 返回目录」被压掉 65%，而且那片区域点下去开的是侧边栏、不是返回。
//
// 现在它是**正文流里的第一块**，不再有任何悬浮层压内容：
//   [☰ 菜单] [当前册 ▾] … [Lv.N] [专注]
//
// · ☰ 菜单：复用 Sidebar 导出的 toggleDrawer（唯一一份实现），
//   抽屉没变 —— 登录/退出/单元测验/背书/管理后台一个都没少。
// · 当前册：只有知道的时候才显示（/unit、/recite 由 URL 决定；首页取目录页
//   一直以来的默认"八上"）。/stats、/settings 这类跟册无关的页面**留空**，不撒谎。
//   点它弹「换一册」六格 —— 落点复用 ShellHost 的 pickBook，与桌面左栏同一个行为。
// · 专注：纸间专注是全屏覆盖层（见 FocusLayer.jsx，z-index 200 > 底栏 80），
//   这里只是它缺了很久的那个手机入口。
// ============================================================

import { useEffect, useState } from "react";
import { game, onGameChange } from "@/lib/game";
import { openFocus } from "@/lib/focus-ui";
import { toggleDrawer } from "./Sidebar";

export default function MobileHead({ book, books = [], onPick }) {
  const [gs, setGs] = useState(null);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    setGs(game.state());
    return onGameChange(() => setGs(game.state()));
  }, []);

  const level = gs && gs.level ? gs.level : null;

  return (
    <>
      <header className="m-head">
        <button type="button" className="m-head-btn" onClick={toggleDrawer} aria-label="打开菜单" title="菜单">
          ☰
        </button>

        {book ? (
          <button
            type="button"
            className="m-head-book"
            onClick={() => setPicking(true)}
            aria-label={`当前 ${book.name}，点一下换一册`}
            title="换一册"
          >
            {book.name}
          </button>
        ) : (
          <span className="m-head-book" />
        )}

        <span className="m-head-sp" />

        {level !== null && <span className="m-head-lv">Lv.{level}</span>}

        <button
          type="button"
          className="m-head-focus"
          onClick={openFocus}
          title="纸间专注 —— 去背书、写试卷，我帮你记着"
        >
          专注
        </button>
      </header>

      {picking && (
        <div className="m-sheet-wrap" onClick={() => setPicking(false)}>
          <div className="m-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="m-sheet-hnd" />
            <div className="m-sheet-ttl">换一册</div>
            <div className="m-sheet-grid">
              {books.map((b) => (
                <button
                  key={b.short}
                  type="button"
                  className={"m-bk" + (book && b.short === book.short ? " on" : "")}
                  onClick={() => {
                    if (onPick) onPick(b);
                    setPicking(false);
                  }}
                >
                  <b>{b.name}</b>
                  <span>
                    已背 {b.done} 词 · {b.pct}%
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
