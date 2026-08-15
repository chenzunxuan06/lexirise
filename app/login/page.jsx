"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { sync, ApiError } from "@/lib/sync";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState("login"); // login | register
  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const go = () => {
      if (sync.user) router.replace("/");
    };
    const unsub = sync.subscribe(go);
    sync.init().then(go);
    return unsub;
  }, [router]);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!username.trim()) return setError("请输入用户名");
    if (password.length < 6) return setError("密码至少 6 位");
    if (mode === "register" && password !== password2) return setError("两次输入的密码不一致");
    setLoading(true);
    try {
      if (mode === "login") {
        await sync.login(username.trim(), password);
      } else {
        await sync.register(username.trim(), password, nickname.trim());
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="wrap auth-wrap">
      <div className="auth-card">
        <div className="auth-logo">词</div>
        <h1 className="auth-title">词跃 LexiRise</h1>
        <p className="auth-sub">
          {mode === "login" ? "登录后，你的背词进度、错题本、考试记录会同步到账号" : "注册账号，学习数据云端保存"}
        </p>

        <div className="auth-mode">
          <button
            className={"auth-mode-btn" + (mode === "login" ? " on" : "")}
            onClick={() => {
              setMode("login");
              setError("");
            }}
          >
            登录
          </button>
          <button
            className={"auth-mode-btn" + (mode === "register" ? " on" : "")}
            onClick={() => {
              setMode("register");
              setError("");
            }}
          >
            注册
          </button>
        </div>

        <form onSubmit={submit} className="auth-form">
          {mode === "register" && (
            <input
              className="auth-input"
              placeholder="昵称（可选）"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={20}
            />
          )}
          <input
            className="auth-input"
            placeholder="用户名（2~20 位，中英文数字下划线）"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={20}
            autoFocus
          />
          <input
            className="auth-input"
            type="password"
            placeholder="密码（至少 6 位）"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={64}
          />
          {mode === "register" && (
            <input
              className="auth-input"
              type="password"
              placeholder="确认密码"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              maxLength={64}
            />
          )}

          {error && <div className="auth-error">{error}</div>}

          <button className="start-btn auth-submit" disabled={loading}>
            {loading ? "请稍候…" : mode === "login" ? "登 录" : "注册并登录"}
          </button>
        </form>

        <div className="auth-tip">
          学习数据保存在本服务器 · 换设备登录同一账号即可同步
        </div>
        <Link className="auth-back" href="/">← 先不登录，继续浏览</Link>
      </div>
    </div>
  );
}
