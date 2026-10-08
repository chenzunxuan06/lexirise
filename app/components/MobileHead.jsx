"use client";

// ============================================================
// app/components/MobileHead.jsx —— 手机端窄头（≤900px）
// ------------------------------------------------------------
// 它取代的是原先**浮在内容上**的 ☰（position:fixed / 12,12 / 42×42 / z-index:70）：
// 实测（390×844，13 个页面逐页量）有 7 个页面的正文被它压住，其中 /unit 的
// 「‹ 返回目录」被压掉 65%，而且那片区域点下去开的是侧边栏、不是返回。
//
// 现在把入口搬进窄头：它是**正文流里的第一块**，不再有任何悬浮层压内容。
// 这么做同时保住了"经典侧边栏"这个抽屉（手机端登录/退出/单元测验/背书/
// 管理后台都在里面），也不会动既有的验收断言。
//
// 结构：[☰ 菜单] [当前册（知道才显示）] … [Lv.N]
//   · 当前册：/unit、/recite 这类带 grade/semester 的地址才有，
//     没有就不显示 —— 宁可空着，也不要在一个跟册无关的页面上撒谎。
//   · 切册（点册名弹六格）与「专注」在 M3 加，本批不放不能用的控件。
// ============================================================

import { useEffect, useState } from "react";
import { game, onGameChange } from "@/lib/game";
import { toggleDrawer } from "./Sidebar";

export default function MobileHead({ book }) {
  const [gs, setGs] = useState(null);

  useEffect(() => {
    setGs(game.state());
    return onGameChange(() => setGs(game.state()));
  }, []);

  const level = gs && gs.level ? gs.level : null;

  return (
    <header className="m-head">
      <button type="button" className="m-head-btn" onClick={toggleDrawer} aria-label="打开菜单" title="菜单">
        ☰
      </button>
      {book ? <span className="m-head-book">{book.name}</span> : <span className="m-head-book" />}
      <span className="m-head-sp" />
      {level !== null && <span className="m-head-lv">Lv.{level}</span>}
    </header>
  );
}
