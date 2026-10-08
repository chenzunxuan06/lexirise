"use client";

// ============================================================
// app/unit/page.jsx —— 单元页（方向C 阶段 2 · 方案乙 + 这次背多少）
// URL: /unit?grade=8&semester=1&unit=3
// 结构：回目录 → 大号章号 03 → 进度条 → 三个等重动作 + 状态行
//       「另一类·拼写」听写 → 「这次背多少」选择器 → 本单元词表预览
// ============================================================

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { loadWords } from "@/lib/loadWords";
import { memory, exams, onChange } from "@/lib/memory";
import PetEmpty from "../components/PetEmpty";
import { StBar, ARow, ZoomList, WRow } from "../components/rows";
import QuantityPick from "../components/QuantityPick";
import { dotFor } from "../components/BookShell";

export default function UnitPage() {
  return (
    <Suspense fallback={<div className="wrap"><PetEmpty title="加载单元…" /></div>}>
      <UnitPageInner />
    </Suspense>
  );
}

function UnitPageInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const grade = Number(sp.get("grade")) || 8;
  const semester = Number(sp.get("semester")) || 1;
  const unit = Number(sp.get("unit")) || 1;

  const [data, setData] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    loadWords().then(setData).catch(() => {});
    const off = onChange(() => setTick((x) => x + 1));
    return off;
  }, []);

  const unitWords = useMemo(() => {
    if (!data) return [];
    return data.words
      .filter(
        (w) =>
          w.grade === grade &&
          w.semester === semester &&
          w.unit === unit &&
          w.word_en
      )
      .sort((a, b) => a.id - b.id);
  }, [data, grade, semester, unit, tick]);

  if (!data) {
    return (
      <div className="wrap">
        <PetEmpty title="加载单元…" sub="跃跃在翻书" />
      </div>
    );
  }

  const m = memory.load();
  const done = unitWords.filter((w) => m[w.id] && m[w.id].lv > 0).length;
  const mastered = unitWords.filter((w) => m[w.id] && m[w.id].lv >= 6).length;
  const left = unitWords.length - done;
  const pct = unitWords.length ? Math.round((done / unitWords.length) * 100) : 0;
  const phrases = unitWords.filter((w) => w.entry_type === "phrase").length;
  const wordsOnly = unitWords.length - phrases;

  const exs = exams.list();
  const lastExam = exs.find(
    (e) => e.grade === grade && e.semester === semester && e.unit === unit
  );

  function startQuantity(sel) {
    if (!sel) return;
    // 按选择跳背书（背书按顺序，量 = 选择数量；all → 全部）
    router.push(
      `/recite?grade=${grade}&semester=${semester}&unit=${unit}${
        sel.kind === "custom" || sel.kind === "n" || sel.kind === "left"
          ? `&count=${Math.min(
              sel.value,
              sel.kind === "left" ? Math.max(1, left) : unitWords.length
            )}`
          : ""
      }`
    );
  }

  const bookName = `${grade} 年级${semester === 1 ? "上" : "下"}册`;

  return (
    <div className="bs-unit">
      <button className="bs-back" onClick={() => router.push("/")}>
        ‹ 返回目录
      </button>

      {/* 章头：大号 03（章号，不触数字纪律） */}
      <div className="bs-unit-h">
        <div className="bs-unit-num">{String(unit).padStart(2, "0")}</div>
        <div className="bs-unit-tx">
          <em>UNIT {["ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT"][unit - 1] || `UNIT ${unit}`} · {bookName}</em>
          <h3>Unit {unit}</h3>
          <p>
            {unitWords.length} 词（单词 {wordsOnly} · 短语 {phrases}）· 已背 {done} 词 · 其中 {mastered} 个已掌握
          </p>
        </div>
      </div>
      <div className="bs-uprog">
        <div className="bs-uprog-track">
          <i style={{ width: pct + "%" }} />
        </div>
        <span>{pct}%</span>
      </div>

      {/* 本节练习：三个等重动作 */}
      <div className="bs-sect">本 节 练 习</div>
      <ZoomList className="bs-unit-acts">
        <ARow
          icon="▶"
          title="接着背"
          desc={left > 0 ? `剩 ${left} 词 · 约 ${Math.max(2, Math.round(left * 0.35))} 分钟` : "本单元已背完，可重背"}
          onClick={() =>
            router.push(`/recite?grade=${grade}&semester=${semester}&unit=${unit}`)
          }
        />
        <ARow
          icon="▶"
          title="专项训练"
          desc="选中文 / 选单词 / 闪卡 / 听力"
          onClick={() =>
            router.push(`/train?grade=${grade}&semester=${semester}&unit=${unit}`)
          }
        />
        <ARow
          icon="▶"
          title="单元测验"
          desc={
            lastExam
              ? `上次 ${lastExam.score} 分 · ${new Date(lastExam.at).getMonth() + 1}月${new Date(lastExam.at).getDate()}日`
              : "限时 · 100 分制"
          }
          onClick={() =>
            router.push(`/exam?grade=${grade}&semester=${semester}&unit=${unit}`)
          }
        />
      </ZoomList>
      <StBar
        variant="guide"
        icon="▸"
        title="另一类 · 拼写"
        desc={phrases > 0 ? `听写 ${wordsOnly} 个单词（短语 ${phrases} 条不考拼写）` : "听写要把词写出来，单独一类"}
        go="去听写"
        onGo={() =>
          router.push(`/train?grade=${grade}&semester=${semester}&unit=${unit}&mode=dictation`)
        }
      />

      {/* 本单元的「课文考点」两题 —— T20 挖变形 / T21 挖原形，
          两套题取的是同一份语料索引里互补的两半。
          入口放在单元页，是因为学生要练的从来不是"六册随机十道"，
          而是"这周听写这个单元"（2026-10-07 补的分单元出题）。 */}
      <div className="bs-sect" style={{ marginTop: 26 }}>
        本 单 元 考 点
      </div>
      <ZoomList className="bs-unit-acts">
        <ARow
          icon="✎"
          title="用所给词的适当形式填空"
          desc="课文原句挖空 · 答案就是课文里的那个形式"
          onClick={() =>
            router.push(`/forms?grade=${grade}&semester=${semester}&unit=${unit}`)
          }
        />
        <ARow
          icon="▤"
          title="课文挖空"
          desc="给中文意思，填课文里的那个词"
          onClick={() =>
            router.push(`/cloze?grade=${grade}&semester=${semester}&unit=${unit}`)
          }
        />
      </ZoomList>

      {/* 这次背多少 */}
      <div className="bs-sect" style={{ marginTop: 26 }}>
        这 次 背 多 少
      </div>
      <QuantityPick
        grade={grade}
        semester={semester}
        unit={unit}
        unitWords={unitWords.length}
        left={left}
        onStart={startQuantity}
      />

      {/* 本单元词表（预览前 6，去词表页看全部） */}
      <div className="bs-sect" style={{ marginTop: 26 }}>
        本 单 元 词 表
      </div>
      <div className="bs-unit-words">
        {unitWords.slice(0, 6).map((w, i) => (
          <WRow
            key={w.id}
            no={String(i + 1).padStart(2, "0")}
            word={w.word_en}
            phonetic={w.phonetic}
            pos={w.pos}
            def={w.definition_zh}
            dot={dotFor(m[w.id] && m[w.id].lv >= 6 ? 100 : m[w.id] && m[w.id].lv > 0 ? 50 : 0)}
          />
        ))}
        <div className="bs-unit-words-foot">
          <span>
            还有 {unitWords.length - 6 > 0 ? unitWords.length - 6 : 0} 条
          </span>
          <span className="bs-only">
            <Link href={`/unit/words?grade=${grade}&semester=${semester}&unit=${unit}`}>
              查看全部 {unitWords.length} 词 ›
            </Link>
            <Link href={`/unit/words?grade=${grade}&semester=${semester}&unit=${unit}&print=1`}>
              ⎙ 打印
            </Link>
          </span>
        </div>
      </div>
    </div>
  );
}