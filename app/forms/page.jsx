"use client";

// ============================================================
// app/forms/page.jsx —— 「用所给词的适当形式填空」（T20）
// ------------------------------------------------------------
// 依据：词跃-亮点升级-课文考点层.md §5①（学校考得最多的题型，词跃此前完全空白）
//   课文是 "She sings beautifully."，目标词 beautiful
//   → 挖掉 beautifully，括号给 (beautiful)，**答案就是课文里的那个形式**
//
// 题库来自 scripts/build_forms.py（249 道），而题库的地基是**建语料索引时顺手记下的**
// 「课文里用的是哪个形式」—— 见 词跃-课文语料索引方案.md §4。
//
// ⚠️ 三条不能动的：
//   ① 答案**只认课文里的那个形式**。不要自己派生"标准答案"，那会造出课本上没有的题。
//   ② 出处必须显示（和 T18 同一个道理：每个数字、每句话都要能翻书核实）。
//   ③ 作答走 memory.record（mode="forms"）—— 这样它既进记忆曲线，也进证据层的日志，
//      顺手还给 T22「词形诊断」备好了数据。**不要另写一套记录。**
//
// 【出题范围（2026-10-07 补）】
//   默认还是全册随机 10 道；带 ?grade=&semester=[&unit=] 就按册 / 按单元出题。
//   范围口径只在 lib/bank.js 一处，与 /cloze 共用。
// ============================================================

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { loadWords } from "@/lib/loadWords";
import { memory } from "@/lib/memory";
import { useQuestionTimer } from "@/lib/timing";
import { formatSource } from "@/lib/corpus";
import { parseScope, filterScope, scopeText, unitOptions } from "@/lib/bank";
import ResolvePanel from "../components/ResolvePanel";
import ScopeBar from "../components/ScopeBar";

const ROUND = 10;

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

/** 把句子按挖空处切开，好让空格单独渲染 */
function pieces(text) {
  return String(text || "").split("______");
}

export default function FormsPage() {
  // useSearchParams 在 App Router 里必须待在 Suspense 边界内
  return (
    <Suspense
      fallback={
        <div className="wrap">
          <div className="empty-state">加载题库中…</div>
        </div>
      }
    >
      <FormsInner />
    </Suspense>
  );
}

function FormsInner() {
  const sp = useSearchParams();
  const scope = useMemo(() => parseScope(sp), [sp]);
  const [bank, setBank] = useState(null);
  const [words, setWords] = useState(null);
  const [deck, setDeck] = useState([]);
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState("");
  const [checked, setChecked] = useState(null); // null | { ok }
  const [results, setResults] = useState([]);
  const [done, setDone] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch("/forms.json").then((r) => r.json()),
      loadWords(),
    ])
      .then(([b, w]) => {
        if (!alive) return;
        setBank((b && b.items) || []);
        setWords((w && w.words) || []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // 范围筛过之后的题池 —— 组题、计数、空状态全部只看它
  const scoped = useMemo(() => (bank ? filterScope(bank, scope) : null), [bank, scope]);
  const units = useMemo(() => (bank ? unitOptions(bank, scope) : []), [bank, scope]);

  const buildDeck = useMemo(
    () => () => {
      if (!scoped || !words) return;
      const byId = new Map(words.map((w) => [String(w.id), w]));
      const started = [];
      const fresh = [];
      for (const it of scoped) {
        if (!byId.has(String(it.wid))) continue;
        const st = memory.get(String(it.wid));
        // 优先已经学过的词 —— 这样它接得上一日一轮的节奏，不是随机抽查
        if (st && st.lv > 0) started.push(it);
        else fresh.push(it);
      }
      // ⚠️ 补位必须补到满，不能只补固定 4 个。
      //    第一版写的是 pick(fresh, 4)，结果**一个词都没学过的新账号整组只有 4 题**
      //    （学过的 0 个 + 没学过的 4 个）—— 验收脚本没抓到，是看截图里
      //    「第 1 / 4 题」才发现的。教训：走通流程 ≠ 数量对。
      const pick = (arr, n) => shuffle(arr).slice(0, Math.max(0, n));
      const s = pick(started, ROUND - 4);
      const d = [...s, ...pick(fresh, ROUND - s.length)].slice(0, ROUND);
      setDeck(d.length ? d : pick(scoped, ROUND));
      setIdx(0);
      setInput("");
      setChecked(null);
      setResults([]);
      setDone(false);
    },
    [scoped, words]
  );

  // 范围一变就重新组题（不然从"整册"切到"U3"会继续出上一个范围的题）
  useEffect(() => {
    if (scoped && words) buildDeck();
  }, [scoped, words, buildDeck]);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, [idx, done]);

  const cur = deck[idx] || null;
  const elapsedMs = useQuestionTimer(idx);

  function check() {
    if (!cur || checked) return;
    const ok = input.trim().toLowerCase() === String(cur.surface).toLowerCase();
    // 走既有记录链路：进记忆曲线 + 进证据层日志（mode="forms"）
    memory.record(String(cur.wid), ok, false, { mode: "forms", elapsed: elapsedMs() });
    setChecked({ ok });
    setResults((prev) => [...prev, { id: String(cur.wid), correct: ok, item: cur }]);
  }

  function next() {
    if (idx + 1 >= deck.length) {
      setDone(true);
      return;
    }
    setIdx(idx + 1);
    setInput("");
    setChecked(null);
  }

  if (!bank) {
    return (
      <div className="wrap">
        <div className="empty-state">加载题库中…</div>
      </div>
    );
  }

  if (bank.length === 0) {
    return (
      <div className="wrap">
        <div className="empty-state">
          还没生成题库。先在 web/ 目录跑一次：
          <br />
          <code>python scripts/build_corpus.py &amp;&amp; python scripts/build_forms.py</code>
        </div>
      </div>
    );
  }

  // 这个范围一道题都没有 —— 不能说"题库空了"，那会让学生以为产品坏了
  if (scoped && scoped.length === 0) {
    return (
      <div className="wrap fm-wrap">
        <ScopeBar scope={scope} units={units} base="/forms" allHref="/forms" />
        <div className="empty-state" style={{ marginTop: 18 }}>
          <b>{scopeText(scope)}</b> 还没有题 —— 这个单元的课文里没有用到变形的地方。
          <br />
          先练全册（共 {bank.length} 道），或者换一个单元。
        </div>
      </div>
    );
  }

  if (done) {
    const correct = results.filter((r) => r.correct).length;
    const wrong = results.filter((r) => !r.correct);
    const pct = results.length ? Math.round((correct / results.length) * 100) : 0;
    return (
      <div className="wrap">
        <ResolvePanel
          kind="judge"
          stamp={"正确率 " + pct + "%"}
          stampTone={pct >= 80 ? "fin" : "normal"}
          kpis={[
            { label: "答对", value: correct },
            { label: "答错", value: results.length - correct },
            { label: "本组", value: results.length },
          ]}
          title="错过的词形（答案就是课文里的那个形式）"
          list={wrong.slice(0, 12).map((r) => ({
            word: r.item.surface,
            mark: "错",
            def: r.item.lemma + " → " + r.item.surface + " · " + formatSource(r.item),
            tag: "词形",
          }))}
          actions={[
            { label: "再来一组", primary: true, onClick: buildDeck },
            { label: "返回首页", href: "/" },
          ]}
        />
      </div>
    );
  }

  if (!cur) {
    return (
      <div className="wrap">
        <div className="empty-state">正在组题…</div>
      </div>
    );
  }

  const segs = pieces(cur.blanked);
  const src = formatSource(cur);

  return (
    <div className="wrap fm-wrap">
      <ScopeBar scope={scope} units={units} base="/forms" allHref="/forms" />

      <div className="fm-head">
        <span className="fm-no">
          第 {idx + 1} / {deck.length} 题
        </span>
        <span className="fm-src">{src}</span>
      </div>

      <div className="fm-body">
        <p className="fm-sent">
          {segs.map((seg, i) => (
            <span key={i}>
              {seg}
              {i < segs.length - 1 && (
                <span className={"fm-blank" + (checked ? (checked.ok ? " ok" : " no") : "")}>
                  {checked ? cur.surface : "\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0"}
                </span>
              )}
            </span>
          ))}
        </p>

        <div className="fm-hint">
          用所给词的适当形式填空：<b>({cur.lemma})</b>
        </div>

        <div className="fm-answer">
          <input
            ref={inputRef}
            className={"fm-input" + (checked ? (checked.ok ? " ok" : " no") : "")}
            value={input}
            disabled={!!checked}
            placeholder="在这里写答案"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              if (checked) next();
              else check();
            }}
          />
          {!checked && (
            <button className="fm-btn primary" onClick={check} disabled={!input.trim()}>
              检查
            </button>
          )}
          {checked && (
            <button className="fm-btn primary" onClick={next}>
              {idx + 1 >= deck.length ? "看结果" : "下一题"}
            </button>
          )}
        </div>

        {checked && (
          <div className={"fm-fb" + (checked.ok ? " ok" : " no")}>
            <div className="fm-fb-t">
              {checked.ok ? "对了 —— 就是课文里这个形式" : "正确形式是 " + cur.surface}
            </div>
            <div className="fm-fb-s">{cur.full}</div>
            <div className="fm-fb-s fm-fb-src">{src}</div>
          </div>
        )}
      </div>

      <div className="fm-foot">
        <Link href="/">先不练了</Link>
        <span className="fm-tip">答案只认课文里的那个形式 —— 可以翻书核对</span>
      </div>
    </div>
  );
}
