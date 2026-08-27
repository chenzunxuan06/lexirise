"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { sync } from "@/lib/sync";

function fmtTs(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminPage() {
  const [user, setUser] = useState(sync.user);
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [detail, setDetail] = useState(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    sync.init().then(() => setUser(sync.user));
    const unsub = sync.subscribe(() => setUser(sync.user));
    return unsub;
  }, []);

  async function load() {
    try {
      const [s, u] = await Promise.all([
        fetch("/api/admin/stats").then((r) => r.json()),
        fetch("/api/admin/users").then((r) => r.json()),
      ]);
      setStats(s.stats);
      setUsers(u.users || []);
    } catch {
      setError("加载失败");
    }
  }

  useEffect(() => {
    if (user && user.role === "admin") load();
  }, [user]);

  async function showDetail(id) {
    const r = await fetch(`/api/admin/users/${id}`);
    if (r.ok) setDetail(await r.json());
  }

  async function delUser(id, username) {
    if (!window.confirm(`确定删除用户「${username}」？其全部学习数据将一并删除，无法恢复。`)) return;
    const r = await fetch(`/api/admin/users?id=${id}`, { method: "DELETE" });
    const d = await r.json();
    if (r.ok) {
      setMsg(`已删除用户 ${d.deleted}`);
      load();
    } else {
      setError(d.error || "删除失败");
    }
  }

  async function backup() {
    const r = await fetch("/api/admin/backup");
    if (!r.ok) return setError("备份失败");
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (r.headers.get("Content-Disposition") || "").match(/filename="([^"]+)"/)?.[1] || "lexirise-backup.db";
    a.click();
    URL.revokeObjectURL(a.href);
    setMsg("数据库备份已下载 ✅ 请妥善保存，最好复制到另一台设备");
  }

  if (!user) {
    return (
      <div className="wrap">
        <div className="empty-state">
          <p>请先登录</p>
          <Link className="start-btn" href="/login" style={{ display: "inline-block", marginTop: 14 }}>去登录 →</Link>
        </div>
      </div>
    );
  }
  if (user.role !== "admin") {
    return (
      <div className="wrap">
        <div className="empty-state">
          <p>⛔ 无权限访问管理后台</p>
          <p style={{ fontSize: 13 }}>需要管理员账号。请联系网站所有者。</p>
          <button
            className="start-btn"
            style={{ marginTop: 14 }}
            onClick={async () => {
              const r = await fetch("/api/admin/promote", { method: "POST" });
              const d = await r.json();
              if (r.ok) {
                sync.notify();
                window.location.reload();
              } else {
                setError(d.error || "无法成为管理员");
              }
            }}
          >
            🎉 我是第一个用户，成为管理员
          </button>
          <p style={{ fontSize: 12, color: "var(--text-soft)", marginTop: 10 }}>
            仅当系统还没有管理员时可用（首个注册用户引导）
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
      <header className="hero">
        <div className="brand">
          <h1>管理后台</h1>
          <span className="en">Admin</span>
        </div>
        <p className="tagline">查看用户与学习数据 · 删除违规账号 · 一键备份数据库</p>
        {msg && <div className="import-ok">{msg}</div>}
        {error && <div className="auth-error">{error}</div>}
      </header>

      {stats && (
        <div className="stat-cards">
          <div className="stat-card big">
            <div className="stat-num">{stats.users}</div>
            <div className="stat-name">注册用户</div>
          </div>
          <div className="stat-card">
            <div className="stat-num">{stats.todayActive}</div>
            <div className="stat-name">今日活跃</div>
          </div>
          <div className="stat-card">
            <div className="stat-num">{stats.totalLearned}</div>
            <div className="stat-name">累计学习词次</div>
          </div>
          <div className="stat-card">
            <div className="stat-num">{stats.totalExams}</div>
            <div className="stat-name">考试次数</div>
          </div>
          <div className="stat-card">
            <div className="stat-num">{stats.customWords}</div>
            <div className="stat-name">自定义词条</div>
          </div>
          <div className="stat-card">
            <div className="stat-num">{stats.aiToday ?? 0}</div>
            <div className="stat-name">今日 AI 调用</div>
          </div>
          <div className="stat-card">
            <div className="stat-num">{stats.aiCached ?? 0}</div>
            <div className="stat-name">AI 缓存条数</div>
          </div>
        </div>
      )}

      <div className="section-row admin-actions">
        <h2 className="section-h">用户管理（{users.length}）</h2>
        <button className="start-btn" onClick={backup}>
          💾 下载数据库备份
        </button>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>用户名</th>
              <th>昵称</th>
              <th>角色</th>
              <th>注册时间</th>
              <th>最后活跃</th>
              <th>已学词</th>
              <th>考试</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.id}</td>
                <td>
                  <b>{u.username}</b>
                  {u.role === "admin" && <span className="badge admin-badge">管理员</span>}
                </td>
                <td>{u.nickname || "—"}</td>
                <td>{u.role}</td>
                <td>{u.created_at}</td>
                <td>{u.last_active}</td>
                <td>{u.learned}</td>
                <td>{u.exams}</td>
                <td>
                  <div className="admin-btns">
                    <button className="mini-x" onClick={() => showDetail(u.id)}>详情</button>
                    {u.role !== "admin" && (
                      <button className="mini-x del" onClick={() => delUser(u.id, u.username)}>删除</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detail && (
        <div className="overlay" onClick={() => setDetail(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setDetail(null)}>✕</button>
            <div className="top">
              <h2 className="word" style={{ fontSize: 22 }}>{detail.user.nickname || detail.user.username}</h2>
            </div>
            <p className="admin-detail-line">
              @{detail.user.username} · {detail.user.role === "admin" ? "管理员" : "普通用户"} · 注册于 {detail.user.created_at}
            </p>
            <div className="stats" style={{ marginTop: 8 }}>
              <span className="stat">已学 <b>{detail.user.learned}</b></span>
              <span className="stat">已掌握 <b>{detail.user.mastered}</b></span>
              <span className="stat">学习天数 <b>{detail.user.totalDays}</b></span>
              <span className="stat">我的词表 <b>{detail.customCount}</b></span>
            </div>
            <div className="admin-detail-block">
              <div className="affix-title">📝 最近考试（{detail.exams.length}）</div>
              {detail.exams.length === 0 ? (
                <div className="admin-detail-empty">暂无考试记录</div>
              ) : (
                <div className="exam-history">
                  {detail.exams.map((e, i) => (
                    <div className="exam-hist-row" key={i}>
                      <span className="exam-hist-label">{e.label || "单元测验"}</span>
                      <span className="exam-hist-time">{fmtTs(e.at)}</span>
                      <span className={"exam-hist-score" + (e.score >= 80 ? " good" : e.score >= 60 ? " mid" : " bad")}>
                        {e.score} 分
                      </span>
                      <span className="exam-hist-sub">{e.correct}/{e.total}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="admin-detail-block">
              <div className="affix-title">📋 我的词表（{detail.customCount}，前 50）</div>
              {detail.customWords.length === 0 ? (
                <div className="admin-detail-empty">暂无自定义词</div>
              ) : (
                <div className="admin-tags">
                  {detail.customWords.map((w, i) => (
                    <span className="admin-tag" key={i}>{w}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <footer className="footer">
        管理操作会立即生效 · 删除用户不可恢复，请谨慎操作
      </footer>
    </div>
  );
}
