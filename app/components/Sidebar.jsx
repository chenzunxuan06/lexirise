"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { sync } from "@/lib/sync";
import { track } from "@/lib/analytics";
import { game, onGameChange } from "@/lib/game";
import PetImage from "./PetImage";

// 三段分组：学习 / 发现 / 工具（词库·短语·词根词缀三合一为"词料库"）
const GROUPS = [
  {
    label: "学习",
    items: [
      { href: "/", label: "首页", desc: "每日任务" },
      { href: "/train", label: "训练", desc: "今日模式" },
      { href: "/review", label: "复习", desc: "记忆曲线·错题本" },
      { href: "/exam", label: "单元测验", desc: "按单元" },
      { href: "/recite", label: "背书", desc: "按单元学期" },
    ],
  },
  {
    label: "发现",
    items: [
      { href: "/achievements", label: "成就", desc: "等级·图鉴·徽章" },
      { href: "/ai", label: "AI 学习", desc: "复习包·练习" },
      { href: "/stats", label: "统计", desc: "打卡·进度" },
    ],
  },
  {
    label: "工具",
    items: [
      { href: "/vocab", label: "词料库", desc: "词库·短语·词根" },
      { href: "/settings", label: "设置", desc: "主题·目标·音效" },
    ],
  },
];

const isMobile = () => typeof window !== "undefined" && window.innerWidth <= 900;

function closeDrawer() {
  const el = document.getElementById("app-sidebar");
  if (el && isMobile()) el.classList.remove("open");
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(sync.user);
  const [gs, setGs] = useState(null); // 游戏状态（品牌位实时形象）

  useEffect(() => {
    sync.init().then(() => setUser(sync.user));
    const unsub = sync.subscribe(() => setUser(sync.user));
    return unsub;
  }, []);

  // 品牌位跃跃实时联动（形态随等级、挨饿换帧）
  useEffect(() => {
    setGs(game.state());
    return onGameChange(() => setGs(game.state()));
  }, []);

  // 页面访问打点（后台分析）
  useEffect(() => {
    track("page_view", { path: pathname });
  }, [pathname]);

  const isActive = (href) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const showAdmin = user && user.role === "admin";

  function toggleMenu() {
    const el = document.getElementById("app-sidebar");
    if (!el) return;
    if (isMobile()) {
      el.classList.toggle("open");
    } else {
      el.classList.toggle("collapsed");
    }
  }

  return (
    <>
      <button className="sb-hamburger" onClick={toggleMenu} aria-label="打开菜单" title="菜单">
        ☰
      </button>

      <aside className="sidebar" id="app-sidebar">
        <button
          className="sb-toggle"
          onClick={toggleMenu}
          title="收起 / 展开菜单"
        >
          «
        </button>

        <Link href="/" className="sb-brand" onClick={closeDrawer}>
          <span className="sb-logo" title={`${(gs && gs.pet && gs.pet.name) || "跃跃"} · 实时状态`}>
            <PetImage
              stage={(gs && gs.stage) || 1}
              action={gs && gs.pet && gs.pet.hunger < 30 ? "hungry" : "idle"}
              size={34}
              round
            />
          </span>
          <span className="sb-name">词跃 LexiRise</span>
        </Link>

        <nav className="sb-nav">
          {GROUPS.map((grp) => (
            <div className="sb-group" key={grp.label}>
              <div className="sb-group-label">{grp.label}</div>
              {grp.items.map((it) => (
                <Link
                  key={it.href}
                  href={it.href}
                  className={"sb-item" + (isActive(it.href) ? " active" : "")}
                  title={it.label}
                  data-label={it.label}
                  onClick={closeDrawer}
                >
                  <span className="sb-text">
                    <span className="sb-label">{it.label}</span>
                    <span className="sb-desc">{it.desc}</span>
                  </span>
                </Link>
              ))}
            </div>
          ))}
          {showAdmin && (
            <div className="sb-group">
              <div className="sb-group-label">管理</div>
              <Link
                href="/admin"
                className={"sb-item" + (isActive("/admin") ? " active" : "")}
                title="管理后台"
                data-label="管理后台"
                onClick={closeDrawer}
              >
                <span className="sb-text">
                  <span className="sb-label">管理后台</span>
                  <span className="sb-desc">用户 · 备份</span>
                </span>
              </Link>
            </div>
          )}
        </nav>

        <div className="sb-user">
          {user ? (
            <div className="sb-user-in">
              <span className="sb-user-name" title={user.nickname || user.username}>
                {user.nickname || user.username}
              </span>
              <button
                className="sb-logout"
                onClick={async () => {
                  await sync.logout();
                  router.push("/");
                  router.refresh();
                }}
              >
                退出
              </button>
            </div>
          ) : (
            <Link className="sb-login" href="/login" onClick={closeDrawer}>
              登录 / 注册
            </Link>
          )}
        </div>

        <div className="sb-foot">沪教牛津版 · 同步课本</div>
      </aside>

      <div className="sb-overlay" onClick={closeDrawer} />
    </>
  );
}