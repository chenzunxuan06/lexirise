"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { sync } from "@/lib/sync";

const ITEMS = [
  { href: "/", label: "首页", icon: "🏠", desc: "每日一词 · 任务" },
  { href: "/recite", label: "背书", icon: "📖", desc: "按单元学期背诵" },
  { href: "/train", label: "训练", icon: "🎯", desc: "选择·闪卡·听写" },
  { href: "/review", label: "复习", icon: "🔁", desc: "记忆曲线·错题本" },
  { href: "/vocab", label: "词库", icon: "📚", desc: "查词·例句·收藏" },
  { href: "/phrases", label: "短语", icon: "💬", desc: "固定搭配专项" },
  { href: "/mywords", label: "我的词表", icon: "📋", desc: "导入·自建词表" },
  { href: "/affixes", label: "词根词缀", icon: "🧩", desc: "前缀·后缀·词根" },
  { href: "/ai", label: "AI 学习", icon: "✨", desc: "复习包·AI讲解" },
  { href: "/stats", label: "统计", icon: "📈", desc: "打卡·进度" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(sync.user);

  useEffect(() => {
    sync.init().then(() => setUser(sync.user));
    const unsub = sync.subscribe(() => setUser(sync.user));
    return unsub;
  }, []);

  const isActive = (href) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const showAdmin = user && user.role === "admin";

  return (
    <aside className="sidebar" id="app-sidebar">
      <button
        className="sb-toggle"
        onClick={() => {
          const el = document.getElementById("app-sidebar");
          el.classList.toggle("collapsed");
        }}
        title="收起 / 展开菜单"
      >
        «
      </button>

      <Link href="/" className="sb-brand">
        <span className="sb-logo">词</span>
        <span className="sb-name">词跃 LexiRise</span>
      </Link>

      <nav className="sb-nav">
        {ITEMS.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className={"sb-item" + (isActive(it.href) ? " active" : "")}
            title={it.label}
            data-label={it.label}
          >
            <span className="sb-icon">{it.icon}</span>
            <span className="sb-text">
              <span className="sb-label">{it.label}</span>
              <span className="sb-desc">{it.desc}</span>
            </span>
          </Link>
        ))}
        {showAdmin && (
          <Link
            href="/admin"
            className={"sb-item" + (isActive("/admin") ? " active" : "")}
            title="管理后台"
            data-label="管理后台"
          >
            <span className="sb-icon">⚙️</span>
            <span className="sb-text">
              <span className="sb-label">管理后台</span>
              <span className="sb-desc">用户 · 备份</span>
            </span>
          </Link>
        )}
      </nav>

      <div className="sb-user">
        {user ? (
          <div className="sb-user-in">
            <span className="sb-user-name" title={user.nickname || user.username}>
              👤 {user.nickname || user.username}
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
          <Link className="sb-login" href="/login">
            🔐 登录 / 注册
          </Link>
        )}
      </div>

      <div className="sb-foot">沪教牛津版 · 1535 词</div>
    </aside>
  );
}
