"use client";

// ============================================================
// BottomTab —— 移动端底部导航栏（方案 1B：5 Tab 平铺）
// 首页 / 训练(带到期角标) / 复习 / 成就 / 我的(抽屉)
// 桌面端（>900px）不渲染；侧边栏抽屉仍通过汉堡按钮保留全量入口
// ============================================================

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { loadWords } from "@/lib/loadWords";
import { memory, onChange } from "@/lib/memory";
import { sync } from "@/lib/sync";

const ONBOARD_FLAG = "lexirise:onboarded";

export default function BottomTab() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(sync.user);
  const [meOpen, setMeOpen] = useState(false);
  const [dueN, setDueN] = useState(0); // 训练角标：到期复习数

  // 登录态
  useEffect(() => {
    sync.init().then(() => setUser(sync.user));
    const unsub = sync.subscribe(() => setUser(sync.user));
    return unsub;
  }, []);

  // 训练角标（到期复习词数）
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

  const isActive = (href) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  // 页面切换时收起"我的"抽屉
  useEffect(() => {
    setMeOpen(false);
  }, [pathname]);

  function replayOnboard() {
    try {
      localStorage.removeItem(ONBOARD_FLAG);
    } catch { /* ignore */ }
    router.push("/");
    router.refresh();
  }

  async function logout() {
    setMeOpen(false);
    await sync.logout();
    router.push("/");
    router.refresh();
  }

  const tabs = useMemo(
    () => [
      { href: "/", label: "首页" },
      { href: "/train", label: "训练", badge: dueN },
      { href: "/review", label: "复习" },
      { href: "/achievements", label: "成就" },
      { href: "#me", label: "我的", more: true },
    ],
    [dueN]
  );

  return (
    <>
      <nav className="btab" aria-label="底部导航">
        {tabs.map((t) =>
          t.more ? (
            <button
              key={t.label}
              className={"btab-item" + (meOpen ? " on" : "")}
              onClick={() => setMeOpen((v) => !v)}
            >
              <span className="bt-lb">{t.label}</span>
            </button>
          ) : (
            <Link
              key={t.href}
              href={t.href}
              className={"btab-item" + (isActive(t.href) ? " on" : "")}
            >
              <span className="bt-ic">
                {t.badge > 0 && <em>{t.badge > 99 ? "99+" : t.badge}</em>}
              </span>
              <span className="bt-lb">{t.label}</span>
            </Link>
          )
        )}
      </nav>

      {/* “我的”抽屉 */}
      <div
        className={"bt-sheet-wrap" + (meOpen ? " open" : "")}
        onClick={() => setMeOpen(false)}
      >
        <div className="bt-sheet" onClick={(e) => e.stopPropagation()}>
          <div className="bt-sheet-handle" />
          <div className="bt-sheet-title">我的</div>

          {user ? (
            <div className="bt-me">
              <span className="bt-me-avatar" aria-hidden="true" />
              <div>
                <b>{user.nickname || user.username}</b>
                <small>登录中 · 学习记录云端同步</small>
              </div>
            </div>
          ) : (
            <Link className="bt-me bt-login" href="/login" onClick={() => setMeOpen(false)}>
              <span className="bt-me-avatar" aria-hidden="true" />
              <div>
                <b>登录 / 注册</b>
                <small>登录后学习记录云端同步</small>
              </div>
            </Link>
          )}

          <div className="bt-sheet-list">
            <Link href="/settings" onClick={() => setMeOpen(false)}>
              设置 <i>主题 · 目标 · 音效</i>
            </Link>
            <Link href="/stats" onClick={() => setMeOpen(false)}>
              学习统计 <i>打卡 · 进度</i>
            </Link>
            <Link href="/ai" onClick={() => setMeOpen(false)}>
              AI 学习 <i>复习包 · 练习</i>
            </Link>
            <Link href="/vocab" onClick={() => setMeOpen(false)}>
              词料库 <i>词库 · 短语 · 词根</i>
            </Link>
            <button onClick={replayOnboard}>
              重新观看新手指引 <i>5 步 · 约 1 分钟</i>
            </button>
          </div>

          {user && (
            <button className="bt-sheet-logout" onClick={logout}>
              退出登录
            </button>
          )}
        </div>
      </div>
    </>
  );
}