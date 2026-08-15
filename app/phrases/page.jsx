"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { loadWords } from "@/lib/loadWords";
import { speak } from "@/lib/tts";

const GRADES = [
  { value: 7, label: "七年级" },
  { value: 8, label: "八年级" },
  { value: 9, label: "九年级" },
];

function gradeName(g) {
  return g === 7 ? "七年级" : g === 8 ? "八年级" : g === 9 ? "九年级" : "";
}

export default function PhrasesPage() {
  const [data, setData] = useState(null);
  const [grade, setGrade] = useState(7);
  const [semester, setSemester] = useState(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    loadWords().then(setData).catch((e) => console.error(e));
  }, []);

  const words = data ? data.words.filter((w) => w.entry_type === "phrase") : [];

  const semesters = useMemo(() => {
    const s = new Set();
    words.forEach((w) => {
      if (w.grade === grade && w.semester) s.add(w.semester);
    });
    return [...s].sort((a, b) => a - b);
  }, [words, grade]);

  const groups = useMemo(() => {
    if (!semester) return [];
    const q = query.trim().toLowerCase();
    const map = new Map();
    words.forEach((w) => {
      if (w.grade !== grade || w.semester !== semester || !w.unit) return;
      if (q && !(w.word_en.toLowerCase().includes(q) || w.definition_zh.includes(query.trim()))) return;
      if (!map.has(w.unit)) map.set(w.unit, []);
      map.get(w.unit).push(w);
    });
    return [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([u, ws]) => ({ unit: u, words: ws.sort((a, b) => a.id - b.id) }));
  }, [words, grade, semester, query]);

  const totalPhrases = words.length;

  if (!data) {
    return <div className="wrap"><div className="empty-state">加载词库中…</div></div>;
  }

  return (
    <div className="wrap">
      <header className="hero">
        <div className="brand">
          <h1>短语专项</h1>
          <span className="en">Phrases</span>
        </div>
        <p className="tagline">
          教材固定搭配共 <b>{totalPhrases}</b> 条 · 中考单选/完形高频考点 · 点条目朗读
        </p>
      </header>

      <div className="controls">
        <input
          className="search"
          placeholder="搜索短语，如 take / 照顾"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="tabs">
          {GRADES.map((g) => (
            <button
              key={g.value}
              className={"tab" + (grade === g.value ? " active" : "")}
              onClick={() => {
                setGrade(g.value);
                setSemester(null);
              }}
            >
              {g.label}
            </button>
          ))}
        </div>
        {semesters.length > 0 && (
          <div className="tabs">
            {semesters.map((s) => (
              <button
                key={s}
                className={"tab" + (semester === s ? " active" : "")}
                onClick={() => setSemester(s)}
              >
                {s === 1 ? "上册" : "下册"}
              </button>
            ))}
          </div>
        )}
      </div>

      {!semester && <div className="empty-state">先选择年级和册，查看该册短语</div>}

      {semester &&
        groups.map((g) => (
          <section className="grade-block" key={g.unit}>
            <div className="section-row">
              <h2 className="grade-title">Unit {g.unit}</h2>
              <span className="section-sub">{g.words.length} 条 · 含在教材 {gradeName(grade)} {semester === 1 ? "上册" : "下册"}</span>
            </div>
            <div className="cards">
              {g.words.map((w) => (
                <div className="word-card" key={w.id}>
                  <div className="w">
                    {w.word_en}
                    <button className="mini-speak" onClick={() => speak(w.word_en)}>🔊</button>
                  </div>
                  <div className="ph">{w.pos || "固定搭配"}</div>
                  <div className="def">{w.definition_zh}</div>
                </div>
              ))}
            </div>
          </section>
        ))}

      {semester && groups.length === 0 && (
        <div className="empty-state">没有匹配的短语</div>
      )}

      {semester && (
        <div className="phrase-actions">
          <Link className="start-btn" href={`/train?type=phrase&grade=${grade}&semester=${semester}`}>
            训练本册全部短语 →
          </Link>
          <Link className="ghost-btn" href="/train?type=phrase">
            训练全库短语 →
          </Link>
        </div>
      )}

      <footer className="footer">
        短语为教材词表中的固定搭配 · 无音标，用整句朗读代替
      </footer>
    </div>
  );
}
