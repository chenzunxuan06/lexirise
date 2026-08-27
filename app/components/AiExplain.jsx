"use client";

import { useState } from "react";

/**
 * 错题对比讲解（F3）：ids = [正确词 id, 选错词 id]
 * 用于训练/测验答错后"为什么错了"。
 */
export function ContrastBox({ ids }) {
  const [s, setS] = useState({ state: "idle", data: null, error: "" });

  async function ask() {
    if (s.state === "loading") return;
    setS({ state: "loading", data: null, error: "" });
    try {
      const r = await fetch("/api/ai/contrast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "讲解失败");
      setS({ state: "done", data: d.data, error: "" });
    } catch (e) {
      setS({ state: "error", data: null, error: e.message });
    }
  }

  if (s.state === "idle") {
    return (
      <button className="ghost-btn ai-ask-btn" onClick={ask} title="AI 解释这道题为什么选它">
        💡 为什么错了
      </button>
    );
  }
  if (s.state === "loading") {
    return <div className="ai-block busy">⏳ AI 解析中（约 10~20 秒）…</div>;
  }
  if (s.state === "error") {
    return (
      <div className="ai-block error">
        ✗ {s.error}
        {s.state === "error" && (
          <button className="ghost-btn" style={{ marginLeft: 8 }} onClick={ask}>
            重试
          </button>
        )}
      </div>
    );
  }
  const d = s.data;
  return (
    <div className="ai-block">
      <div className="ai-title">💡 为什么是 {d.correct_word}？</div>
      <div className="ai-explain">{d.why}</div>
      {d.wrong_point && (
        <div className="ai-row">✗ 「{d.wrong_word}」错在哪：{d.wrong_point}</div>
      )}
      {d.tip && <div className="ai-row">🧠 {d.tip}</div>}
    </div>
  );
}

/**
 * 单词讲解卡（F1）：单词 id → AI 讲解
 * 用于词库弹窗以外的场景：复习错题本、测验错题报告。
 */
export function AiExplainCard({ id, label = "AI 讲解" }) {
  const [s, setS] = useState({ state: "idle", data: null, error: "" });

  async function ask() {
    if (s.state === "loading") return;
    setS({ state: "loading", data: null, error: "" });
    try {
      const r = await fetch("/api/ai/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "讲解失败");
      setS({ state: "done", data: d.data, error: "" });
    } catch (e) {
      setS({ state: "error", data: null, error: e.message });
    }
  }

  if (s.state === "idle") {
    return (
      <button className="mini-ai-btn" onClick={ask}>
        ✨ {label}
      </button>
    );
  }
  if (s.state === "loading") {
    return <div className="ai-block busy">⏳ AI 生成中…</div>;
  }
  if (s.state === "error") {
    return (
      <div className="ai-block error">
        ✗ {s.error}
        <button className="ghost-btn" style={{ marginLeft: 8, padding: "4px 10px" }} onClick={ask}>
          重试
        </button>
      </div>
    );
  }
  const d = s.data;
  return (
    <div className="ai-block">
      <div className="ai-title">✨ AI 讲解</div>
      <div className="ai-explain">{d.explain}</div>
      {d.memory_tip && <div className="ai-row">🧠 {d.memory_tip}</div>}
      {d.examples &&
        d.examples.map((e, i) => (
          <div className="ai-example" key={i}>
            <div className="ai-en">{e.en}</div>
            {e.zh && <div className="ai-zh">{e.zh}</div>}
          </div>
        ))}
      {d.confusable &&
        d.confusable.map((c, i) => (
          <div className="ai-conf-item" key={i}>
            <b>⚠️ {c.word}</b>：{c.note}
          </div>
        ))}
    </div>
  );
}

export default AiExplainCard;