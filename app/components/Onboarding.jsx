"use client";

// ============================================================
// Onboarding —— 新手指引（首次访问自动弹出，完成后永不出现）
// 流程：选年级 → 领养跃跃（起名）→ 3 题体验 → 记忆曲线说明 → 完成
// 标记：localStorage "lexirise:onboarded"
// ============================================================

import { useEffect, useRef, useState } from "react";
import { loadWords } from "@/lib/loadWords";
import { speak } from "@/lib/tts";
import { memory, stats, plan } from "@/lib/memory";
import { game } from "@/lib/game";

const FLAG_KEY = "lexirise:onboarded";
const TOTAL_STEPS = 5;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const CURVE_STEPS = [
  { d: "今天", t: "第一次学会这个词", s: "答对 → 熟练度 +1" },
  { d: "1天后", t: "自动再考你一次", s: "答对 → 下次 3 天后见" },
  { d: "3天后", t: "快忘了？再来一遍", s: "答错 → 降级，很快重练" },
  { d: "7天后", t: "间隔越来越长", s: "直到彻底记住 🎉" },
];

export default function Onboarding() {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(1);
  const [grade, setGrade] = useState(0);
  const [petName, setPetName] = useState("跃跃");
  const [quiz, setQuiz] = useState([]); // [{word, options, answer}]
  const [qi, setQi] = useState(0);
  const [picked, setPicked] = useState(null);
  const [okCount, setOkCount] = useState(0);
  const [combo, setCombo] = useState(0);
  const [curveIn, setCurveIn] = useState(0);
  const wordsRef = useRef([]);
  const rewardedRef = useRef(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(FLAG_KEY)) return;
    } catch { /* 隐私模式照常显示 */ }
    setShow(true);
    loadWords()
      .then((d) => { wordsRef.current = d.words || []; })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (step !== 4) return;
    setCurveIn(0);
    const timers = CURVE_STEPS.map((_, i) => setTimeout(() => setCurveIn(i + 1), 400 + i * 500));
    return () => timers.forEach(clearTimeout);
  }, [step]);

  if (!show) return null;

  function finish() {
    // 完成教学关（走到第 5 步）才发新手奖励
    if (step === 5 && !rewardedRef.current) {
      rewardedRef.current = true;
      game.reward("onboard");
      game.refreshAchievements({
        learnedCount: memory.learnedCount(),
        masteredCount: memory.masteredCount(),
        wrongCount: 0,
        streak: stats.streakDays(),
      });
    }
    try { localStorage.setItem(FLAG_KEY, String(Date.now())); } catch { /* ignore */ }
    setShow(false);
  }

  function pickGrade(g) {
    setGrade(g);
    plan.setGrade(g);
  }

  function savePetName() {
    const p = plan.load();
    p.petName = (petName || "跃跃").trim().slice(0, 8) || "跃跃";
    plan.save(p);
    game.setPetName(p.petName);
    setPetName(p.petName);
  }

  function buildQuiz() {
    const pool = wordsRef.current.filter(
      (w) => w.grade === grade && w.entry_type !== "phrase" && w.definition_zh && w.phonetic
    );
    const src = pool.length >= 20 ? pool : wordsRef.current.filter((w) => w.entry_type !== "phrase" && w.definition_zh);
    const pickedWords = shuffle(src).slice(0, 3);
    setQuiz(
      pickedWords.map((w) => {
        const others = shuffle(src.filter((x) => x.id !== w.id)).slice(0, 3).map((x) => x.definition_zh);
        const options = shuffle([w.definition_zh, ...others]);
        return { word: w, options, answer: w.definition_zh };
      })
    );
    setQi(0);
    setOkCount(0);
    setCombo(0);
    setPicked(null);
  }

  function answer(opt) {
    if (picked) return;
    setPicked(opt);
    const q = quiz[qi];
    const ok = opt === q.answer;
    const prev = memory.get(q.word.id);
    memory.record(q.word.id, ok, !prev || prev.lv === 0);
    stats.add({ n: !prev || prev.lv === 0 ? 1 : 0, review: 0, correct: ok ? 1 : 0, total: 1 });
    if (ok) { setOkCount((c) => c + 1); setCombo((c) => c + 1); }
    else setCombo(0);
    setTimeout(() => {
      if (qi + 1 < quiz.length) { setQi(qi + 1); setPicked(null); }
      else setStep(4);
    }, 850);
  }

  const q = quiz[qi];

  return (
    <div className="ob-overlay">
      <div className="ob-card">
        <div className="ob-dots">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <i key={i} className={step === i + 1 ? "on" : ""} />
          ))}
        </div>
        <button className="ob-skip" onClick={finish}>跳过</button>

        {/* 第 1 步：欢迎 + 选年级 */}
        {step === 1 && (
          <div className="ob-step">
            <div className="ob-mascot">🦊</div>
            <h2>欢迎来到词跃！</h2>
            <p className="ob-sub">先告诉我你读几年级<br />后面的内容会自动跟上学校课本</p>
            <div className="ob-grades">
              {[
                { g: 7, e: "🌱", s: "刚开始初中英语" },
                { g: 8, e: "🌿", s: "词汇量快速上涨期" },
                { g: 9, e: "🌳", s: "中考冲刺阶段" },
              ].map((x) => (
                <button
                  key={x.g}
                  className={"ob-grade" + (grade === x.g ? " sel" : "")}
                  onClick={() => pickGrade(x.g)}
                >
                  <span className="e">{x.e}</span>
                  <span>{x.g} 年级<small>{x.s}</small></span>
                  <span className="ck">✓</span>
                </button>
              ))}
            </div>
            <button className="ob-btn" disabled={!grade} style={{ opacity: grade ? 1 : 0.4 }} onClick={() => setStep(2)}>
              下一步 →
            </button>
          </div>
        )}

        {/* 第 2 步：领养跃跃 */}
        {step === 2 && (
          <div className="ob-step">
            <div className="ob-mascot">🦊</div>
            <h2>领养你的背词搭子</h2>
            <p className="ob-sub">它会陪你每天背单词、慢慢长大<br />给它起个名字吧</p>
            <input
              className="ob-input"
              value={petName}
              maxLength={8}
              onChange={(e) => setPetName(e.target.value)}
              placeholder="跃跃"
            />
            <button className="ob-btn" onClick={() => { savePetName(); buildQuiz(); setStep(3); }}>
              就叫这个名字！→
            </button>
          </div>
        )}

        {/* 第 3 步：3 题体验 */}
        {step === 3 && q && (
          <div className="ob-step">
            <div className="ob-qbar"><i style={{ width: (qi / quiz.length) * 100 + "%" }} /></div>
            <div className="ob-qmeta"><span>先来体验 {quiz.length} 道题</span><span>第 {qi + 1} / {quiz.length} 题</span></div>
            <div className="ob-qword">
              <b>{q.word.word_en}</b>
              {q.word.phonetic && <div className="ph">{q.word.phonetic}</div>}
              <button className="ob-spk" onClick={() => speak(q.word.word_en)}>🔊</button>
            </div>
            <div className="ob-opts">
              {q.options.map((o) => (
                <button
                  key={o}
                  className={
                    "ob-opt" +
                    (picked ? (o === q.answer ? " ok" : o === picked ? " no" : "") : "")
                  }
                  onClick={() => answer(o)}
                >
                  {o}
                </button>
              ))}
            </div>
            <div className={"ob-combo" + (combo >= 2 ? " pop" : "")}>
              {combo >= 2 ? `🔥 连对 x${combo}！` : ""}
            </div>
          </div>
        )}

        {/* 第 4 步：记忆曲线 */}
        {step === 4 && (
          <div className="ob-step">
            <div className="ob-mascot">🧠</div>
            <h2>为什么会越背越牢？</h2>
            <p className="ob-sub">{petName}会记住你每个词的熟练度<br />在<b>快忘记的时候</b>自动安排复习</p>
            <div className="ob-curve">
              {CURVE_STEPS.map((c, i) => (
                <div key={c.d} className={"ob-cstep" + (curveIn > i ? " in" : "")}>
                  <div className="ob-cdot">{c.d}</div>
                  <div className="tx"><b>{c.t}</b><div>{c.s}</div></div>
                </div>
              ))}
            </div>
            <button className="ob-btn" onClick={() => setStep(5)}>明白了 →</button>
          </div>
        )}

        {/* 第 5 步：完成 */}
        {step === 5 && (
          <div className="ob-step">
            <div className="ob-mascot">🏆</div>
            <h2>太棒了，教学关通过！</h2>
            <div className="ob-badges">
              <div className="bd"><b>{quiz.length}</b>体验题</div>
              <div className="bd"><b>{okCount}</b>答对</div>
              <div className="bd"><b>{grade}</b>年级</div>
            </div>
            <p className="ob-sub">现在开始你的第一轮正式学习吧<br />每天 10 分钟，{petName}陪你背完整本书</p>
            <a className="ob-btn ob-link" href="/train?mode=daily" onClick={finish}>🚀 开始正式学习</a>
            <button className="ob-ghost" onClick={finish}>先随便逛逛，稍后再注册</button>
            <p className="ob-note">💡 不注册也能用；注册后换手机学习记录不丢</p>
          </div>
        )}
      </div>
    </div>
  );
}
