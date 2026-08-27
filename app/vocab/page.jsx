"use client";

import { useEffect, useMemo, useState } from "react";
import { speak, speakZh } from "@/lib/tts";
import { favs } from "@/lib/memory";
import ExampleBlock from "../components/ExampleBlock";

const GRADES = [
  { value: 0, label: "全部" },
  { value: 7, label: "七年级" },
  { value: 8, label: "八年级" },
  { value: 9, label: "九年级" },
];

function gradeName(g) {
  return g === 7 ? "七年级" : g === 8 ? "八年级" : g === 9 ? "九年级" : "";
}

function WordModal({ w, onClose }) {
  const [fav, setFav] = useState(favs.has(w.id));
  // AI 讲解状态：idle | loading | done | error
  const [ai, setAi] = useState({ state: "idle", data: null, error: "" });

  useEffect(() => {
    setAi({ state: "idle", data: null, error: "" });
  }, [w && w.id]);

  async function askAi() {
    if (ai.state === "loading") return;
    setAi({ state: "loading", data: null, error: "" });
    try {
      const r = await fetch("/api/ai/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: w.id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "AI 讲解失败");
      setAi({ state: "done", data: d.data, error: "" });
    } catch (e) {
      setAi({ state: "error", data: null, error: e.message });
    }
  }

  if (!w) return null;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose}>✕</button>
        <div className="top">
          <h2 className="word">{w.word_en}</h2>
          <button className="speak" title="朗读" onClick={() => speak(w.word_en)}>🔊</button>
          <button
            className={"modal-star" + (fav ? " on" : "")}
            title={fav ? "取消收藏" : "收藏到生词本"}
            onClick={() => setFav(favs.toggle(w.id))}
          >
            {fav ? "★ 已收藏" : "☆ 收藏"}
          </button>
          <button className="ai-btn" onClick={askAi} disabled={ai.state === "loading"} title="AI 讲解（生成一次后全站缓存）">
            {ai.state === "loading" ? "⏳ 生成中" : "✨ AI 讲解"}
          </button>
        </div>
        {w.phonetic ? (
          <p className="phon">{w.phonetic}</p>
        ) : (
          <p className="phon missing">音标待补充</p>
        )}
        {w.pos && <span className="pos">{w.pos}</span>}
        <p className="def">{w.definition_zh}</p>
        <button className="speak zh" onClick={() => speakZh(w.definition_zh)}>
          🔊 读释义
        </button>

        {w.affix_hint ? (
          <div className="affix-block">
            <div className="affix-title">🧩 词根词缀记忆</div>
            <div className="affix-text">{w.affix_hint}</div>
          </div>
        ) : (
          <div className="affix-block empty">词根词缀提示整理中…</div>
        )}

        <ExampleBlock w={w} />

        {ai.state === "idle" && (
          <div className="ai-block hint">
            点击 ✨ AI 讲解：生成课本难度例句、记忆法和易混词辨析（结果全站共享缓存）
          </div>
        )}
        {ai.state === "loading" && <div className="ai-block busy">⏳ AI 讲解生成中，约 10~30 秒…</div>}
        {ai.state === "error" && (
          <div className="ai-block error">
            ✗ {ai.error}
            {ai.error && ai.error.includes("未配置") && (
              <div className="ai-block hint">管理员在服务器设置 API key 后即可使用</div>
            )}
          </div>
        )}
        {ai.state === "done" && ai.data && (
          <div className="ai-block">
            <div className="ai-title">✨ AI 讲解</div>
            <div className="ai-explain">{ai.data.explain}</div>
            {ai.data.memory_tip && (
              <div className="ai-row">🧠 {ai.data.memory_tip}</div>
            )}
            {ai.data.examples && ai.data.examples.length > 0 && (
              <div className="ai-examples">
                {ai.data.examples.map((e, i) => (
                  <div className="ai-example" key={i}>
                    <div className="ai-en">{e.en}</div>
                    {e.zh && <div className="ai-zh">{e.zh}</div>}
                  </div>
                ))}
              </div>
            )}
            {ai.data.confusable && ai.data.confusable.length > 0 && (
              <div className="ai-confusable">
                {ai.data.confusable.map((c, i) => (
                  <div className="ai-conf-item" key={i}>
                    <b>⚠️ {c.word}</b>：{c.note}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="modal-foot">
          <span className="modal-meta">
            {w.grade ? gradeName(w.grade) : ""}
            {(w.semester ? (w.semester === 1 ? "上" : "下") : "") + (w.unit ? ` · Unit ${w.unit}` : "")}
          </span>
          <span className="modal-meta">{w.entry_type === "phrase" ? "短语搭配" : "单词"}</span>
        </div>
      </div>
    </div>
  );
}

function unitLearnedCount(ws) {
  let n = 0;
  try {
    const m = JSON.parse(localStorage.getItem("lexirise:memory") || "{}");
    ws.forEach((w) => {
      if (m[w.id] && m[w.id].lv > 0) n += 1;
    });
  } catch {
    /* ignore */
  }
  return n;
}

export default function VocabPage() {
  const [data, setData] = useState(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(null);

  const [grade, setGrade] = useState(0);
  const [semester, setSemester] = useState(null);
  const [unit, setUnit] = useState(null);
  const [typeFilter, setTypeFilter] = useState("all"); // all | word | phrase
  const [tick, setTick] = useState(0);

  useEffect(() => {
    fetch("/words.json")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch((e) => console.error("load words.json failed", e));
    const t = setInterval(() => setTick((x) => x + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const words = data ? data.words : [];

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return words.filter(
      (w) =>
        (w.word_en && w.word_en.toLowerCase().includes(q)) ||
        (w.definition_zh && w.definition_zh.includes(query.trim())) ||
        (w.affix_hint && w.affix_hint.includes(query.trim()))
    );
  }, [words, query]);

  const semesters = useMemo(() => {
    if (!grade) return [];
    const s = new Set();
    words.forEach((w) => {
      if (w.grade === grade && w.semester) s.add(w.semester);
    });
    return [...s].sort((a, b) => a - b);
  }, [words, grade]);

  const units = useMemo(() => {
    if (!grade || !semester) return [];
    const map = new Map();
    words.forEach((w) => {
      if (w.grade === grade && w.semester === semester && w.unit) {
        if (!map.has(w.unit)) map.set(w.unit, []);
        map.get(w.unit).push(w);
      }
    });
    return [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([u, ws]) => ({
        unit: u,
        words: ws.sort((a, b) => a.id - b.id),
        learned: unitLearnedCount(ws),
      }));
  }, [words, grade, semester, tick]);

  const unitWords = useMemo(() => {
    if (!unit) return [];
    const u = units.find((x) => x.unit === unit);
    if (!u) return [];
    if (typeFilter === "word") return u.words.filter((w) => w.entry_type !== "phrase");
    if (typeFilter === "phrase") return u.words.filter((w) => w.entry_type === "phrase");
    return u.words;
  }, [units, unit, typeFilter]);

  const searching = query.trim().length > 0;
  const m = data ? data.meta : null;

  return (
    <div className="wrap">
      <header className="hero">
        <div className="brand">
          <h1>词库</h1>
          <span className="en">Word Bank</span>
        </div>
        <p className="tagline">按 年级 → 册 → 单元 浏览 · 搜索全库 · 点卡片看详情</p>
        {m && (
          <div className="stats">
            <span className="stat">单词 <b>{m.total}</b></span>
            <span className="stat">带音标 <b>{m.with_phonetic}</b></span>
            <span className="stat">词根词缀 <b>{m.with_affix_hint}</b></span>
            <span className="stat">例句 <b>{m.with_example_en}</b></span>
          </div>
        )}
      </header>

      <div className="controls">
        <input
          className="search"
          placeholder="搜索单词 / 中文释义 / 词根词缀，如 international"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {!data && <div className="empty-state">加载词库中…</div>}

      {data && searching && (
        <section className="grade-block">
          <h2 className="grade-title">搜索结果 · {searchResults.length} 个</h2>
          {searchResults.length === 0 ? (
            <div className="empty-state">没有匹配的单词，换个关键词试试。</div>
          ) : (
            <div className="cards">
              {searchResults.slice(0, 120).map((w) => (
                <div className="word-card" key={w.id} onClick={() => setActive(w)}>
                  <div className="w">
                    {w.word_en}
                    {w.affix_hint && <span className="affix-dot" title={w.affix_hint}>🧩</span>}
                    {w.entry_type === "phrase" && <span className="badge phrase">短语</span>}
                    {favs.has(w.id) && <span className="affix-dot">★</span>}
                  </div>
                  {w.phonetic ? (
                    <div className="ph">{w.phonetic}</div>
                  ) : (
                    <div className="ph missing">{w.entry_type === "phrase" ? "整句朗读" : "音标待补充"}</div>
                  )}
                  <div className="def">{w.definition_zh}</div>
                  {w.pos && <span className="badge">{w.pos}</span>}
                </div>
              ))}
              {searchResults.length > 120 && (
                <div className="review-more">…还有 {searchResults.length - 120} 个，请用更精确的关键词</div>
              )}
            </div>
          )}
        </section>
      )}

      {data && !searching && !unit && (
        <div className="setup-card">
          <div className="setup-label">① 选择年级</div>
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

          {grade > 0 && (
            <>
              <div className="setup-label">② 选择册</div>
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
            </>
          )}

          {semester && (
            <>
              <div className="setup-label">③ 选择单元</div>
              <div className="vocab-units">
                {units.map((u) => {
                  const phrases = u.words.filter((w) => w.entry_type === "phrase").length;
                  const pct = Math.round((u.learned / u.words.length) * 100);
                  return (
                    <button className="vocab-unit" key={u.unit} onClick={() => setUnit(u.unit)}>
                      <div className="vocab-unit-main">
                        <span className="vocab-unit-name">Unit {u.unit}</span>
                        <span className="vocab-unit-count">
                          {u.words.length} 词 · 含短语 {phrases} · 已背 {u.learned}
                        </span>
                        <span className="vocab-unit-bar">
                          <span style={{ width: pct + "%" }} />
                        </span>
                      </div>
                      <span className="vocab-unit-go">进入 →</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {!semester && (
            <div className="empty-state small">
              {grade === 0 ? "先选一个年级开始浏览" : "再选一册，然后进入单元"}
            </div>
          )}
        </div>
      )}

      {data && !searching && unit && (
        <section className="grade-block">
          <div className="vocab-crumb">
            <button className="crumb-link" onClick={() => setUnit(null)}>
              ← {gradeName(grade)} {semester === 1 ? "上册" : "下册"}
            </button>
            <span className="crumb-here">Unit {unit}</span>
            <div className="tabs mini-tabs vocab-type">
              {[
                { k: "all", label: "全部" },
                { k: "word", label: "单词" },
                { k: "phrase", label: "短语" },
              ].map((f) => (
                <button
                  key={f.k}
                  className={"tab" + (typeFilter === f.k ? " active" : "")}
                  onClick={() => setTypeFilter(f.k)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="cards">
            {unitWords.map((w) => (
              <div className="word-card" key={w.id} onClick={() => setActive(w)}>
                <div className="w">
                  {w.word_en}
                  {w.affix_hint && <span className="affix-dot" title={w.affix_hint}>🧩</span>}
                  {w.entry_type === "phrase" && <span className="badge phrase">短语</span>}
                  {favs.has(w.id) && <span className="affix-dot">★</span>}
                </div>
                {w.phonetic ? (
                  <div className="ph">{w.phonetic}</div>
                ) : (
                  <div className="ph missing">{w.entry_type === "phrase" ? "整句朗读" : "音标待补充"}</div>
                )}
                <div className="def">{w.definition_zh}</div>
                {w.pos && <span className="badge">{w.pos}</span>}
              </div>
            ))}
          </div>
          {unitWords.length === 0 && <div className="empty-state">该分类下暂无内容</div>}
        </section>
      )}

      <footer className="footer">
        词跃 LexiRise · 沪教牛津版 · 数据 {m ? m.total : "…"} 词
      </footer>

      {active && <WordModal w={active} onClose={() => setActive(null)} />}
    </div>
  );
}
