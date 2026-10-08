"use client";

// ============================================================
// app/me/page.jsx —— 「我的」（2026-10-08 · M4）
// ------------------------------------------------------------
// 为什么有这个页面：
//   · 手机端此前把这几件事塞在一个底部弹层里（.bt-sheet，从底栏第 5 项打开）；
//   · 桌面活页本更差 —— **完全没有账号入口**（书签条第 5 项只是个 ⚙，直接跳设置）。
//   现在两边共用这一页：手机底栏第 5 项 → /me，桌面书签条第 5 项 → /me。
//   于是"我的"这件事只有一处实现，设置页也回到了它该在的位置（偏好里的一条）。
//
// 一段一件事，四段：账号 / 学习 / 偏好 / 管理。
// ⚠️ 管理段用 {isAdmin && ...} —— 非管理员**不产生 DOM**（不是 CSS 藏起来）。
//
// 刻意不做（用户已拍板）：邮箱 / 手机号 / 第三方登录；多账号并存。
// 也刻意不放「分享周报」：它其实是 /stats 页里的一块（stats/page.jsx:406），
// 在这里再开一个入口等于把同一件事说两遍 —— 所以并进「学习统计」那行的说明里。
// ============================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sync } from "@/lib/sync";

const ONBOARD_FLAG = "lexirise:onboarded";

export default function MePage() {
  const router = useRouter();
  const [user, setUser] = useState(sync.user);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    sync.init().then(() => {
      setUser(sync.user);
      setReady(true);
    });
    const unsub = sync.subscribe(() => setUser(sync.user));
    return unsub;
  }, []);

  async function logout() {
    await sync.logout();
    router.push("/");
    router.refresh();
  }

  function replayOnboard() {
    try {
      localStorage.removeItem(ONBOARD_FLAG);
    } catch {
      /* 隐私模式下写不了，忽略 */
    }
    router.push("/");
    router.refresh();
  }

  const isAdmin = !!(user && user.role === "admin");

  return (
    <div className="wrap me-page">
      <section className="me-card">
        <div className="me-h">账号</div>
        {user ? (
          <>
            <div className="me-account">
              <span className="me-avatar" aria-hidden="true" />
              <div>
                <b>{user.nickname || user.username}</b>
                <small>@{user.username} · 学习记录已云端同步</small>
              </div>
            </div>
            <div className="me-actions">
              <button type="button" className="me-btn" onClick={logout}>
                退出登录
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="me-note">
              {ready ? "还没有登录，学习记录只存在这台设备上。" : "正在读取账号…"}
            </p>
            <Link className="me-btn me-btn-primary" href="/login">
              登录 / 注册
            </Link>
          </>
        )}
      </section>

      <div className="me-h me-h-out">学习</div>
      <div className="me-list">
        <Link className="me-row" href="/stats">
          <span>学习统计</span>
          <em>打卡 · 进度 · 分享周报</em>
          <i aria-hidden="true">›</i>
        </Link>
        <Link className="me-row" href="/ai">
          <span>AI 学习</span>
          <em>复习包 · 练习</em>
          <i aria-hidden="true">›</i>
        </Link>
        <Link className="me-row" href="/mywords">
          <span>我的词表</span>
          <em>导入 · 导出</em>
          <i aria-hidden="true">›</i>
        </Link>
      </div>

      <div className="me-h me-h-out">偏好</div>
      <div className="me-list">
        <Link className="me-row" href="/settings">
          <span>设置</span>
          <em>主题 · 目标 · 音效</em>
          <i aria-hidden="true">›</i>
        </Link>
        <button type="button" className="me-row" onClick={replayOnboard}>
          <span>新手指引</span>
          <em>5 步 · 约 1 分钟</em>
          <i aria-hidden="true">›</i>
        </button>
      </div>

      {isAdmin && (
        <>
          <div className="me-h me-h-out">管理</div>
          <div className="me-list">
            <Link className="me-row" href="/admin">
              <span>管理后台</span>
              <em>用户 · 数据 · 备份</em>
              <i aria-hidden="true">›</i>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
