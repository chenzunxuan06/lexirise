"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { speak } from "@/lib/tts";
import { sync } from "@/lib/sync";

const TRAIN_MODES = [
  { key: "quiz", label: "选中文" },
  { key: "reverse", label: "选单词" },
  { key: "flashcard", label: "闪卡" },
  { key: "dictation", label: "听写" },
  { key: "listening", label: "听力" },
];

/** 解析导入文本：每行 单词, [音标], [词性], 中文释义 */
function parseText(text) {
  const out = [];
  const lines = String(text).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  for (const line of lines) {
    const parts = line.split(/[,，\t]/).map((s) => s.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    const word_en = parts[0];
    if (!/^[a-zA-Z][a-zA-Z\-' ]{0,60}$/.test(word_en)) continue;
    let phonetic = null;
    let rest = parts.slice(1);
    if (rest.length && rest[0].startsWith("/")) {
      phonetic = rest[0];
      rest = rest.slice(1);
    }
    if (!rest.length) continue;
    const definition_zh = rest[rest.length - 1];
    const pos = rest.length > 1 ? rest.slice(0, -1).join(" ") : null;
    out.push({ word_en, phonetic, pos, definition_zh });
  }
  return out;
}

export default function MyWordsPage() {
  const [user, setUser] = useState(sync.user);
  const [words, setWords] = useState([]);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // AI 补全状态
  const [busyAi, setBusyAi] = useState(false);
  const [msgAi, setMsgAi] = useState("");
  const [errAi, setErrAi] = useState("");

  const missingAi = words.filter((w) => !w.ai).length;

  async function doEnrich() {
    setBusyAi(true);
    setMsgAi("");
    setErrAi("");
    try {
      const r = await fetch("/api/ai/enrich-words", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "补全失败");
      setMsgAi(`✅ AI 补全 ${d.enriched} 个词条${d.pending ? `（还有 ${d.pending} 个待补全）` : ""}`);
      refresh();
    } catch (e) {
      setErrAi(e.message);
    } finally {
      setBusyAi(false);
    }
  }

  async function refresh() {
    try {
      const r = await fetch("/api/words");
      if (!r.ok) return;
      const d = await r.json();
      setWords(d.words || []);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    sync.init().then(() => setUser(sync.user));
    const unsub = sync.subscribe(() => setUser(sync.user));
    if (sync.user) refresh();
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user) refresh();
    else setWords([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function doImport() {
    const parsed = parseText(text);
    if (!parsed.length) {
      setError("没有解析到有效词条。每行格式：单词, 词性, 中文释义（词性可省略）");
      return;
    }
    setBusy(true);
    setMsg("");
    setError("");
    try {
      const r = await fetch("/api/words", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ words: parsed }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "导入失败");
      setMsg(`成功导入 ${d.added} 个单词${d.skipped ? `（跳过重复/无效 ${d.skipped} 个）` : ""}`);
      setText("");
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function doDelete(id) {
    await fetch(`/api/words?id=${id}`, { method: "DELETE" });
    refresh();
  }

  function doExport() {
    const lines = words.map((w) => [w.word_en, w.pos, w.definition_zh].filter(Boolean).join(", "));
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "我的词表.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (!user) {
    return (
      <div className="wrap">
        <header className="hero">
          <div className="brand">
            <h1>我的词表</h1>
            <span className="en">My Words</span>
          </div>
          <p className="tagline">导入你自己的生词，和教材词库一起背</p>
        </header>
        <div className="empty-state">
          <p>需要先登录才能使用我的词表（数据保存到你的账号）</p>
          <Link className="start-btn" href="/login" style={{ display: "inline-block", marginTop: 14 }}>
            去登录 →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
      <header className="hero">
        <div className="brand">
          <h1>我的词表</h1>
          <span className="en">My Words</span>
        </div>
        <p className="tagline">
          已收录 <b>{words.length}</b> 词 · 存于账号，换设备同步 · 可进训练与记忆曲线
        </p>
      </header>

      <div className="setup-card">
        <div className="setup-label">📥 导入单词</div>
        <div className="import-hint">
          每行一个：<code>单词, [音标], [词性], 中文释义</code>（音标、词性可省略），支持逗号/空格/Tab 分隔。示例：
          <pre>apple, n., 苹果{"\n"}learn, /lɜːn/, v., 学习{"\n"}take care of, 照顾</pre>
        </div>
        <textarea
          className="import-area"
          placeholder={"apple, n., 苹果\nlearn, v., 学习\n..."}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
        />
        {error && <div className="auth-error">{error}</div>}
        {msg && <div className="import-ok">✅ {msg}</div>}
        <div className="import-actions">
          <button className="start-btn" disabled={busy || !text.trim()} onClick={doImport}>
            {busy ? "导入中…" : "导入"}
          </button>
          {words.length > 0 && (
            <button className="ghost-btn" onClick={doExport}>
              ⬇ 导出词表
            </button>
          )}
        </div>
      </div>

      <div className="section-row">
        <h2 className="section-h">我的单词（{words.length}）</h2>
        <div className="review-actions">
          {missingAi > 0 && (
            <button className="ai-btn" disabled={busyAi} onClick={doEnrich} title="AI 为缺音标/例句的词生成补全内容（每日 2 次）">
              {busyAi ? "⏳ AI 补全中（约 30 秒）…" : `✨ AI 补全（${missingAi} 个待补）`}
            </button>
          )}
          {TRAIN_MODES.map((m) => (
            <Link key={m.key} className="ghost-btn small-btn" href={`/train?custom=1&mode=${m.key}`}>
              {m.label}
            </Link>
          ))}
        </div>
      </div>
      {msgAi && <div className="import-ok">{msgAi}</div>}
      {errAi && <div className="auth-error">{errAi}</div>}

      {words.length === 0 ? (
        <div className="empty-state">还没有单词，先在上面导入吧（如老师发的生词表）</div>
      ) : (
        <div className="cards">
          {words.map((w) => (
            <div className="word-card" key={w.id}>
              <div className="w">
                {w.word_en}
                <button className="mini-speak" onClick={() => speak(w.word_en)}>🔊</button>
              </div>
              {w.phonetic ? (
                <div className="ph">{w.phonetic}</div>
              ) : w.ai && w.ai.phonetic_hint ? (
                <div className="ph ai-ph">{w.ai.phonetic_hint} <em>AI</em></div>
              ) : (
                <div className="ph missing">音标待补充（可点 AI 补全）</div>
              )}
              <div className="def">{w.definition_zh}</div>
              {w.ai && w.ai.memory_tip && <div className="affix-dot-line">🧠 {w.ai.memory_tip}</div>}
              {w.ai && w.ai.example_en && (
                <div className="fb-ex">
                  <span className="fb-muted">✍️ </span>
                  {w.ai.example_en}
                  {w.ai.example_zh && <div className="ai-zh">{w.ai.example_zh}</div>}
                </div>
              )}
              <div className="wrong-ai-row">
                {w.pos && <span className="badge">{w.pos}</span>}
                <button className="mini-x" onClick={() => doDelete(w.id)}>
                  删除 ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <footer className="footer">
        我的词表与教材词库独立存放，不互相影响 · 未填音标时用浏览器朗读发音
      </footer>
    </div>
  );
}
