"use client";

// ============================================================
// app/demo/page.jsx —— 设计评审页（2026-09-16）
// 用户点单：① 左栏（导航/附录）太密、想做大一点；② 上栏「今日/复习」跑到右边、
// 找不着北。这里并排给出各 3 版方案 + 现行基线，供挑选后再落到真壳。
// 说明：本页脱离书壳渲染（ShellHost 对 /demo 直接放行），只用真实数量级做视觉判断。
// ============================================================

import { useEffect, useState } from "react";
import { loadWords } from "@/lib/loadWords";
import { memory, wrongBook, stats } from "@/lib/memory";
import { game } from "@/lib/game";
import { todaySummary } from "@/lib/progress";
import { TocRail, useCatalog } from "../components/BookShell";
import s from "./demo.module.css";

const APX = [
  { k: "A", t: "复习中心", icon: "◉" },
  { k: "B", t: "学习统计", icon: "▤" },
  { k: "C", t: "成就图鉴", icon: "★" },
  { k: "D", t: "AI 学习", icon: "✦" },
  { k: "E", t: "易混词对比", icon: "⇄" },
];

// 样例数据：本地库刚重置时真实数据全是「未开始」，看不出密度差异；
// 评审页可切「样例」看真实使用一段时间后的样子（真壳永远用真数据）。
const BOOK_LIST = [
  { g: 7, s: 1, short: "七上", name: "七年级上册" },
  { g: 7, s: 2, short: "七下", name: "七年级下册" },
  { g: 8, s: 1, short: "八上", name: "八年级上册" },
  { g: 8, s: 2, short: "八下", name: "八年级下册" },
  { g: 9, s: 1, short: "九上", name: "九年级上册" },
  { g: 9, s: 2, short: "九下", name: "九年级下册" },
];
const SAMPLE = {
  七上: { n: 138, done: 96, pct: 70 },
  七下: { n: 142, done: 54, pct: 38 },
  八上: { n: 110, done: 42, pct: 38 },
  八下: { n: 118, done: 9, pct: 8 },
  九上: { n: 126, done: 0, pct: 0 },
  九下: { n: 96, done: 0, pct: 0 },
};
const SAMPLE_UNITS = [
  { unit: 1, n: 16, done: 16, pct: 100 },
  { unit: 2, n: 18, done: 12, pct: 67 },
  { unit: 3, n: 17, done: 9, pct: 53 },
  { unit: 4, n: 15, done: 4, pct: 27 },
  { unit: 5, n: 14, done: 1, pct: 7 },
];

// ============================================================
// 整页对比（2026-09-21）：用户反馈「demo 展现不出网站的大」——
// 前几节只画了「上栏那一条」，看不出它在整页里的位置与比例。
// 这里把各版上栏装进同一个真实尺寸整页骨架（1240 × (上栏高 + 22 + 694)）。
// 真壳数值来源 app/bs.css：.bs-cols = 286px | 694px | 240px。
// ============================================================
const HEAD_H = { base: 48, ca: 68, cb: 46, d: 40, e: 46 };
const RULER_H = 22;
const COLS_H = 694;

const FRAMES = [
  { v: "base", name: "单行 + 书签右贴（放大字号）", note: "上栏 56px", tip: "✅ 现在本机用的就是这个：页签 15px、品牌 17px" },
  { v: "ca", name: "丙A · 紧凑双行", note: "上栏 68px", tip: "❌ 试过并回退：真实宽度下页签缩在左下角，又小又空" },
  { v: "cb", name: "丙B · 单行索引", note: "上栏 46px", tip: "未采用：与单行差别不明显，却要重做样式" },
  { v: "d", name: "丁 · 索引入左栏", note: "上栏 40px", tip: "未采用：入口与左栏同侧，切换要跨屏" },
  { v: "e", name: "戊 · 单行书签 + 标题下沉", note: "上栏 46px", tip: "未采用：活页本的索引味最弱" },
];

function FpHead({ v }) {
  if (v === "ca") {
    return (
      <div className={s.headCa}>
        <div className={s.headCaTop}>
          <span className={s.brandT}>词跃</span>
          <span className={s.brandS}>LEXIRISE</span>
          <span className={s.right}>9月21日 · ⚙</span>
        </div>
        <div className={s.indexRowTight}>
          <span className={`${s.indexTabTight} ${s.indexOnTight}`}>今日</span>
          <span className={s.indexTabTight}>复习</span>
          <span className={s.indexTabTight}>词料库</span>
          <span className={s.indexTabTight}>成长</span>
        </div>
      </div>
    );
  }
  if (v === "cb") {
    return (
      <div className={s.headCb}>
        <div className={s.brandWrap}>
          <span className={s.brandT}>词跃</span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 5 }}>
          <span className={`${s.indexTabInline} ${s.indexOnInline}`}>今日</span>
          <span className={s.indexTabInline}>复习</span>
          <span className={s.indexTabInline}>词料库</span>
          <span className={s.indexTabInline}>成长</span>
        </div>
        <span className={s.right}>9月21日 · ⚙</span>
      </div>
    );
  }
  if (v === "d") {
    return (
      <div className={s.headD}>
        <span className={s.brandT}>词跃</span>
        <span className={s.brandS}>LEXIRISE · 活页本</span>
        <span className={s.right}>9月21日 · ⚙</span>
      </div>
    );
  }
  if (v === "e") {
    return (
      <div className={s.headE}>
        <span className={s.brandT}>词跃</span>
        <nav className={s.tabsL}>
          <span className={`${s.tabBase} ${s.tabOn}`}>今日</span>
          <span className={s.tabBase}>复习</span>
          <span className={s.tabBase}>词料库</span>
          <span className={s.tabBase}>成长</span>
        </nav>
        <span className={s.right}>9月21日 · ⚙</span>
      </div>
    );
  }
  return (
    <div className={s.headBase}>
      <span className={s.brandT}>词跃</span>
      <span className={s.brandS}>LEXIRISE · 活页本</span>
      <nav className={s.fpTabs}>
        <span className={`${s.fpBaseTab} ${s.fpBaseTabOn}`}>今日</span>
        <span className={s.fpBaseTab}>复习</span>
        <span className={s.fpBaseTab}>词料库</span>
        <span className={s.fpBaseTab}>成长 Lv.2</span>
        <span className={`${s.fpBaseTab} ${s.fpGear}`}>⚙</span>
      </nav>
      <span className={s.fpMeta}>9月22日</span>
    </div>
  );
}

function FpLeft({ books, cur, apxNum, railTop }) {
  return (
    <div className={s.fpL}>
      {railTop ? (
        <div className={s.railTopMock} style={{ borderRadius: 6, marginBottom: 4 }}>
          <span className={`${s.mini} ${s.on}`}>
            <i>▤</i>今日
          </span>
          <span className={s.mini}>
            <i>◉</i>复习
          </span>
          <span className={s.mini}>
            <i>❐</i>词料库
          </span>
          <span className={s.mini}>
            <i>★</i>成长
          </span>
        </div>
      ) : null}
      <div className={s.railH}>全 书 · 大 纲</div>
      {books.map((b) => (
        <div
          key={b.short}
          className={`${s.bookRow} ${cur && b.short === cur.short ? s.bookRowOn : ""}`}
        >
          <div className={s.bookTop}>
            <span className={s.bookName}>{b.short}</span>
            <span className={s.bookNum}>
              {b.done === 0 ? "未开始" : b.pct >= 100 ? "已背完" : `${b.pct}%`}
            </span>
          </div>
          <div className={s.bookBar}>
            <i style={{ width: Math.min(100, b.pct) + "%" }} />
          </div>
          <div className={s.bookSub}>
            {b.done === 0 ? `${b.n} 词 · 还没开始` : `已背 ${b.done} 词 · 还剩 ${b.n - b.done}`}
          </div>
        </div>
      ))}
      <div className={s.railH} style={{ marginTop: 6 }}>附 录</div>
      <div className={s.appGrid}>
        {APX.map((a) => (
          <div className={s.appTile} key={a.k} style={a.k === "E" ? { gridColumn: "1 / -1" } : undefined}>
            <span className={s.appTileT}>
              <b className={s.appTileK}>{a.k}</b> {a.t}
            </span>
            <span className={s.appTileN}>{apxNum[a.k]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FpCenter({ books, cur, n }) {
  const units = (cur && cur.unitList && cur.unitList.length ? cur.unitList : SAMPLE_UNITS).slice(0, 6);
  return (
    <div className={s.fpC}>
      <div className={s.fpCbar}>
        <b>今天该背 {n.todo} 词</b>
        <em>{cur ? cur.name : "八年级上册"}</em>
      </div>
      <div className={s.fpSecH}>六 册 目 录</div>
      {books.map((b) => (
        <div
          key={b.short}
          className={`${s.fpDirRow} ${cur && b.short === cur.short ? s.fpDirOn : ""}`}
        >
          <span className={s.fpDirName}>{b.short}</span>
          <span className={s.fpDirSub}>{b.n} 词</span>
          <span className={s.fpDirPct}>
            {b.done === 0 ? "未开始" : b.pct >= 100 ? "已背完" : `${b.pct}%`}
          </span>
        </div>
      ))}
      <div className={s.fpSecH}>{cur ? cur.name : "八年级上册"} · 单元</div>
      {units.map((u) => (
        <div className={s.fpUnitRow} key={u.unit}>
          <b>{String(u.unit).padStart(2, "0")}</b>
          <span>Unit {u.unit}</span>
          <i />
          <em>{u.n} 词</em>
          <span className={s.fpActs}>接着背 · 训练 · 测验</span>
        </div>
      ))}
    </div>
  );
}

function FpRight({ n }) {
  return (
    <div className={s.fpR}>
      <div className={s.fpCard} style={{ textAlign: "center" }}>
        <div className={s.fpRing}>
          <div className={s.fpRingIn}>38%</div>
        </div>
        <div className={s.fpBig} style={{ marginTop: 10 }}>
          今天该背 <b>{n.todo}</b> 词
        </div>
        <div className={s.fpSub}>到期 {n.due} · 新词 4</div>
      </div>
      <div className={s.fpCard}>
        <div className={s.fpSub}>连续打卡</div>
        <div className={s.fpBig}>7 天</div>
        <div className={s.fpQuick}>
          <div className={s.fpQuickRow}>接着背</div>
          <div className={s.fpQuickRow}>复习到期</div>
          <div className={s.fpQuickRow}>错题本 {n.wrong}</div>
        </div>
      </div>
    </div>
  );
}

export default function DemoPage() {
  const catalog = useCatalog();
  const [nums, setNums] = useState(null);
  const [sample, setSample] = useState(true); // 默认样例（真实数据为空时看不出密度）
  const [zoom, setZoom] = useState(0.8); // 整页对比缩放：1 = 真机尺寸（1240px 宽）

  useEffect(() => {
    loadWords()
      .then((d) => {
        const sum = todaySummary(d.words);
        const m = memory.load();
        const due = d.words.filter((w) => {
          const st = m[w.id];
          return st && st.lv > 0 && st.due <= Date.now();
        }).length;
        const totalQ = Object.values(stats.load()).reduce((a, x) => a + (x.total || 0), 0);
        const g = game.state();
        setNums({
          due,
          todo: sum.todo,
          wrong: wrongBook.count(),
          totalQ,
          lv: g.level || 1,
          title: g.title || "单词新手",
        });
      })
      .catch(() => {});
  }, []);

  const baseBooks = catalog && catalog.books.length ? catalog.books : BOOK_LIST.map((b) => ({ ...b, n: 0, done: 0, pct: 0, unitList: [] }));
  const books = sample
    ? baseBooks.map((b) => ({
        ...b,
        ...(SAMPLE[b.short] || {}),
        unitList: b.unitList && b.unitList.length ? b.unitList : SAMPLE_UNITS,
      }))
    : baseBooks;
  const cur = books[2] || null; // 八上
  const n = nums || { due: 12, todo: 16, wrong: 5, totalQ: 340, lv: 4, title: "单词新手" };
  const apxNum = { A: `到期 ${n.due} · 错题 ${n.wrong}`, B: `累计 ${n.totalQ} 题`, C: `Lv.${n.lv} ${n.title}`, D: "复习包 · 练习", E: "51 对辨析" };

  return (
    <div className={`demo-page ${s.page}`}>
      <div className={s.pageHead}>
        <h1>界面方案评审</h1>
        <span className={s.en}>DESIGN REVIEW</span>
        <button className={s.modeBtn} onClick={() => setSample((v) => !v)}>
          数据：{sample ? "样例（看密度）" : "真实（本地库）"} ⇄
        </button>
        <span className={s.hint}>
          同一份数据的几种排法 · 选一版我再落到真壳（左栏 / 上栏可分别选）
        </span>
      </div>

      {/* ================= 零、整页对比（真实尺寸） ================= */}
      <section className={s.sec}>
        <div className={s.secH}>
          零、整页对比（真实尺寸）
          <small>整页宽 1240px = 左栏 286 + 中栏 694 + 右栏 240（居中，两侧各留 10px）</small>
        </div>
        <div className={s.secNote}>
          前面几节只画了「上栏那一条」，看不出它在整页里占多大、在什么位置。这里把 5 版上栏分别装进
          <b>同一个完整的活页本页面</b>（上栏 + 三栏宽度标尺 + 左栏大纲 / 中栏目录 / 右栏今日进度），
          按真壳数值排布 —— 标尺那一行就是三栏的位置与宽度。左栏用的都是<b>已定稿的甲案</b>，所以上下对比只差上栏。
        </div>
        <div className={s.fpToolbar}>
          <span className={s.fpTip}>缩放</span>
          {[[1, "100% 真实"], [0.8, "80%"], [0.62, "62%"]].map(([z, t]) => (
            <button
              key={t}
              className={`${s.fpZoom} ${zoom === z ? s.fpZoomOn : ""}`}
              onClick={() => setZoom(z)}
            >
              {t}
            </button>
          ))}
          <span className={s.fpTip}>100% 就是手机横屏 / 电脑上的真实大小；面板不够宽就切 62%</span>
        </div>
        <div className={s.fpStack}>
          {FRAMES.map((f) => {
            const H = HEAD_H[f.v] + RULER_H + COLS_H;
            return (
              <div key={f.v}>
                <div className={s.fpCap}>
                  <b>{f.name}</b>
                  <span>{f.note}</span>
                  <em>{f.tip}</em>
                </div>
                <div className={s.fpClip} style={{ width: 1240 * zoom, height: H * zoom }}>
                  <div
                    className={s.fpFrame}
                    style={{ height: H, transform: `scale(${zoom})`, transformOrigin: "top left" }}
                  >
                    <FpHead v={f.v} />
                    <div className={s.fpRuler}>
                      <div className={s.fpRulerCell}>左栏 286px</div>
                      <div className={s.fpRulerCell}>中栏 694px</div>
                      <div className={s.fpRulerCell}>右栏 240px</div>
                    </div>
                    <div className={s.fpCols}>
                      <FpLeft books={books} cur={cur} apxNum={apxNum} railTop={f.v === "d"} />
                      <FpCenter books={books} cur={cur} n={n} />
                      <FpRight n={n} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ================= 上栏 ================= */}
      <section className={s.sec}>
        <div className={s.secH}>
          一、上栏（书签条）
          <small>现行问题：品牌在左、书签偏右、日期最右 → 视线没有固定锚点</small>
        </div>
        <div className={s.secNote}>
          <b>结论（2026-09-22 实机定案）：三版上栏方案都试过，最后回到「单行 · 原布局」——
          品牌在左、书签在右（甲/乙/丙三版都不采用），只把字号整体放大一档
          （页签 13.5→15px、品牌 15→17px、高度 48→56px）。</b><br />
          丙A 双行版曾于 09-21 选定并落真壳，实机后发现「页签缩在左下角、又小又空」被否 →
          已回退（见「零」区第 2 帧）。<em>教训：评审卡片只有 640px 宽，控件看着饱满；
          放到 1240px 真实宽度会「缩水」——看方案必须按真实宽度 + 真实字号。</em>
        </div>
        <div className={s.row}>
          {/* 甲案 */}
          <div className={s.card}>
            <div className={s.cardCap}>
              <b>甲案 · 书签左贴</b>
              <span>Anchor Left</span>
              <span className={s.cardTag}>改动最小</span>
            </div>
            <div className={s.headBox}>
              <div className={s.headA}>
                <span className={s.brandT}>词跃</span>
                <span className={s.brandS}>LEXIRISE</span>
                <nav className={s.tabsL}>
                  <span className={`${s.tabBase} ${s.tabOn}`}>今日</span>
                  <span className={s.tabBase}>复习</span>
                  <span className={s.tabBase}>词料库</span>
                  <span className={s.tabBase}>成长</span>
                </nav>
                <span className={s.date}>9月16日 · ⚙</span>
              </div>
            </div>
            <div className={s.pros}>
              <em>优点</em>：品牌与书签连成一条左边线，眼睛永远从左上开始；日期退到最后，不抢注意力。<br />
              <em>代价</em>：几乎不用重排，把导航从右挪到品牌旁边即可。
            </div>
          </div>

          {/* 乙案 */}
          <div className={s.card}>
            <div className={s.cardCap}>
              <b>乙案 · 三段居中</b>
              <span>Classic Three-Band</span>
              <span className={s.cardTag}>最稳</span>
            </div>
            <div className={s.headBox}>
              <div className={s.headB}>
                <span className={s.brandT}>词跃</span>
                <nav className={`${s.tabsL} ${s.center}`}>
                  <span className={`${s.tabBase} ${s.tabOn}`}>今日</span>
                  <span className={s.tabBase}>复习</span>
                  <span className={s.tabBase}>词料库</span>
                  <span className={s.tabBase}>成长</span>
                </nav>
                <span className={s.right}>9月16日 · ⚙</span>
              </div>
            </div>
            <div className={s.pros}>
              <em>优点</em>：左中右三块对称，「今日/复习」固定在正中，宽屏窄屏都不会跑位。<br />
              <em>代价</em>：居中在窄屏会和品牌挤，需要 900px 以下改成左贴。
            </div>
          </div>

          {/* 丙案 */}
          <div className={s.card}>
            <div className={s.cardCap}>
              <b>丙案 · 活页索引双行</b>
              <span>Index Tabs</span>
              <span className={s.cardTag}>最像活页本</span>
            </div>
            <div className={s.headBox}>
              <div className={s.headC}>
                <div className={s.headCtop}>
                  <span className={s.brandT}>词跃</span>
                  <span className={s.brandS}>LEXIRISE · 活页本</span>
                  <span className={s.right}>9月16日 · ⚙</span>
                </div>
                <div className={s.indexRow}>
                  <span className={`${s.indexTab} ${s.indexOn}`}>今日</span>
                  <span className={s.indexTab}>复习</span>
                  <span className={s.indexTab}>词料库</span>
                  <span className={s.indexTab}>成长</span>
                </div>
              </div>
            </div>
            <div className={s.pros}>
              <em>优点</em>：书签做成「索引页签」贴在底部，当前页凸出压线 —— 一眼看出自己在哪一页；和「活页本」气质最贴。<br />
              <em>代价</em>：头部高 52 → 84px，纵向更占位置；移动端要简化。
            </div>
          </div>
        </div>
      </section>

      {/* ================= 上栏 · 第二轮（紧凑版） ================= */}
      <section className={s.sec}>
        <div className={s.secH}>
          一·B、上栏「丙案」的紧凑改良
          <small>你的顾虑：丙案上方留白多 → 这里把头部从 84px 压到 68 / 46 / 40px 四种</small>
        </div>
        <div className={s.secNote}>
          留白来自「品牌一行 + 页签一行」两排之间的空档。四种压法：
          <b>丙A</b> 保留双行但每排压到 32px（页签贴底压线）；
          <b>丙B</b> 合成一行、页签仍做索引凸出；
          <b>丁</b> 把 5 个入口搬进左栏顶部（上栏只剩 40px 品牌条，最省纵向）；
          <b>戊</b> 一行书签 + 当前页名称下沉到内容页头。
        </div>
        <div className={s.row}>
          {/* 原丙案（参考） */}
          <div className={s.card}>
            <div className={s.cardCap}>
              <b>丙案（原版）</b>
              <span>84px</span>
              <span className={s.cardTag}>你选的 · 留白多</span>
            </div>
            <div className={s.headBox}>
              <div className={s.headC}>
                <div className={s.headCtop}>
                  <span className={s.brandT}>词跃</span>
                  <span className={s.brandS}>LEXIRISE · 活页本</span>
                  <span className={s.right}>9月16日 · ⚙</span>
                </div>
                <div className={s.indexRow}>
                  <span className={`${s.indexTab} ${s.indexOn}`}>今日</span>
                  <span className={s.indexTab}>复习</span>
                  <span className={s.indexTab}>词料库</span>
                  <span className={s.indexTab}>成长</span>
                </div>
              </div>
            </div>
            <div className={s.pros}>
              留白来自两排之间的空档 + 页签自身 padding 过厚。
            </div>
          </div>

          {/* 丙A */}
          <div className={s.card}>
            <div className={s.cardCap}>
              <b>丙A · 紧凑双行</b>
              <span>68px</span>
              <span className={s.locked}>✅ 已定 · 已落真壳</span>
            </div>
            <div className={s.headBox}>
              <div className={s.headCa}>
                <div className={s.headCaTop}>
                  <span className={s.brandT}>词跃</span>
                  <span className={s.brandS}>LEXIRISE</span>
                  <span className={s.right}>9月16日 · ⚙</span>
                </div>
                <div className={s.indexRowTight}>
                  <span className={`${s.indexTabTight} ${s.indexOnTight}`}>今日</span>
                  <span className={s.indexTabTight}>复习</span>
                  <span className={s.indexTabTight}>词料库</span>
                  <span className={s.indexTabTight}>成长</span>
                </div>
              </div>
            </div>
            <div className={s.pros}>
              <em>做法</em>：上排 32px（品牌 15px + 小字日期），下排 36px，页签 padding 7→5px、选中页签只多凸 3px。<br />
              <em>结果</em>：比原版矮 16px，索引与压线效果都在。
            </div>
          </div>

          {/* 丙B */}
          <div className={s.card}>
            <div className={s.cardCap}>
              <b>丙B · 单行索引</b>
              <span>46px</span>
              <span className={s.cardTag}>最省又保留索引</span>
            </div>
            <div className={s.headBox}>
              <div className={s.headCb}>
                <div className={s.brandWrap}>
                  <span className={s.brandT}>词跃</span>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 5 }}>
                  <span className={`${s.indexTabInline} ${s.indexOnInline}`}>今日</span>
                  <span className={s.indexTabInline}>复习</span>
                  <span className={s.indexTabInline}>词料库</span>
                  <span className={s.indexTabInline}>成长</span>
                </div>
                <span className={s.right}>9月16日 · ⚙</span>
              </div>
            </div>
            <div className={s.pros}>
              <em>做法</em>：品牌与页签同一行，页签用「上圆角 + 无下边」贴住分隔线，选中那格往上凸 4px。<br />
              <em>结果</em>：高度与普通单行栏一样（46px），但仍一眼看出「我在第几页」。
            </div>
          </div>

          {/* 丁 */}
          <div className={s.card}>
            <div className={s.cardCap}>
              <b>丁 · 索引入左栏</b>
              <span>40px</span>
              <span className={s.cardTag}>最省纵向</span>
            </div>
            <div className={s.headBox}>
              <div className={s.headD}>
                <span className={s.brandT}>词跃</span>
                <span className={s.brandS}>LEXIRISE · 活页本</span>
                <span className={s.right}>9月16日 · ⚙</span>
              </div>
              <div className={s.railTopMock}>
                <span className={`${s.mini} ${s.on}`}>
                  <i>▤</i>今日
                </span>
                <span className={s.mini}>
                  <i>◉</i>复习
                </span>
                <span className={s.mini}>
                  <i>❐</i>词料库
                </span>
                <span className={s.mini}>
                  <i>★</i>成长
                </span>
              </div>
              <div className={s.headDNote}>
                ↑ 这排圆钮是「左栏顶部」的样式（配合你已定的左栏甲案）；上栏只留品牌条
              </div>
            </div>
            <div className={s.pros}>
              <em>优点</em>：上栏压到 40px，5 个入口和左栏同侧，切换不用来回扫。<br />
              <em>代价</em>：右栏那本「今日进度」仍在右侧，视线要跨屏；入口图标需要认。
            </div>
          </div>

          {/* 戊 */}
          <div className={s.card}>
            <div className={s.cardCap}>
              <b>戊 · 单行书签 + 标题下沉</b>
              <span>46px</span>
              <span className={s.cardTag}>最直白</span>
            </div>
            <div className={s.headBox}>
              <div className={s.headE}>
                <span className={s.brandT}>词跃</span>
                <nav className={s.tabsL}>
                  <span className={`${s.tabBase} ${s.tabOn}`}>今日</span>
                  <span className={s.tabBase}>复习</span>
                  <span className={s.tabBase}>词料库</span>
                  <span className={s.tabBase}>成长</span>
                </nav>
                <span className={s.right}>9月16日 · ⚙</span>
              </div>
              <div className={s.pgHeadMock}>
                <span>词跃 LexiRise · 八年级上册</span>
                <span>· 八上</span>
              </div>
            </div>
            <div className={s.pros}>
              <em>做法</em>：书签做普通按钮（不再是索引页签），当前页名称交给内容页头（本来就有一行「词跃 LexiRise · 八年级上册」）。<br />
              <em>优点</em>：最简单、最不容易出错；<em>代价</em>：活页本的「索引」味道弱一些。
            </div>
          </div>
        </div>
      </section>

      {/* ================= 左栏 ================= */}
      <section className={s.sec}>
        <div className={s.secH}>
          二、左栏（全书大纲 + 附录）
          <small>✅ 甲案已定稿并已落到真壳；乙/丙两版保留备查</small>
        </div>
        <div className={s.secNote}>
          密不密的根子是「每行都长一样、都是灰字」。甲案用 <b>加宽留白</b>（286px + 进度条 + 附录小卡）解决；
          乙案（当前册聚焦）与丙案（书脊卡片）作为备选留档，将来若嫌 286px 占位可再切。
        </div>
        <div className={s.row}>
          {/* 基线 */}
          <div className={s.card}>
            <div className={s.cardCap}>
              <b>现行基线</b>
              <span>216px</span>
              <span className={s.cardTag}>对比用</span>
            </div>
            <div className={`${s.rail} ${s.railNarrow}`}>
              <TocRail catalog={catalog} current={cur} onPick={() => {}} />
            </div>
            <div className={s.pros}>
              <em>问题</em>：册行也是两段灰字、附录也是两段灰字，六册 + 五行附录堆出 11 行同质信息。
            </div>
          </div>

          {/* 甲案 */}
          <div className={s.card}>
            <div className={s.cardCap}>
              <b>甲案 · 加宽留白</b>
              <span>286px · 两行式册行 + 附录小卡</span>
              <span className={s.locked}>✅ 已定 · 已落真壳</span>
            </div>
            <div className={`${s.rail} ${s.railWide}`}>
              <div className={s.railH}>全 书 · 大 纲</div>
              {books.map((b) => (
                <div
                  key={b.short}
                  className={`${s.bookRow} ${cur && b.short === cur.short ? s.bookRowOn : ""}`}
                >
                  <div className={s.bookTop}>
                    <span className={s.bookName}>{b.short}</span>
                    <span className={s.bookNum}>
                      {b.done === 0 ? "未开始" : b.pct >= 100 ? "已背完" : `${b.pct}%`}
                    </span>
                  </div>
                  <div className={s.bookBar}>
                    <i style={{ width: Math.min(100, b.pct) + "%" }} />
                  </div>
                  <div className={s.bookSub}>
                    {b.done === 0 ? `${b.n} 词 · 还没开始` : `已背 ${b.done} 词 · 还剩 ${b.n - b.done}`}
                  </div>
                </div>
              ))}
              <div className={s.railH} style={{ marginTop: 6 }}>附 录</div>
              <div className={s.appGrid}>
                {APX.map((a) => (
                  <div className={s.appTile} key={a.k} style={a.k === "E" ? { gridColumn: "1 / -1" } : undefined}>
                    <span className={s.appTileT}>
                      <b className={s.appTileK}>{a.k}</b> {a.t}
                    </span>
                    <span className={s.appTileN}>{apxNum[a.k]}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className={s.pros}>
              <em>已落地</em>：左栏 286px、六册两行式（册名+% / 进度条 / 已背·还剩）、附录 5 张小卡（A/B/C/D/E 同排文字 + 数字行）。<br />
              <em>说明</em>：真壳里卡片标题与字母在同一行（"A 复习中心"），与验收脚本的文本匹配一致。
            </div>
          </div>

          {/* 乙案 */}
          <div className={s.card}>
            <div className={s.cardCap}>
              <b>乙案 · 当前册聚焦</b>
              <span>286px · 其他册折叠成一行</span>
            </div>
            <div className={`${s.rail} ${s.railWide}`}>
              <div className={s.focusCard}>
                <div className={s.focusHead}>
                  <div className={s.ring}>
                    <div className={s.ringIn}>{cur ? cur.pct : 38}%</div>
                  </div>
                  <div>
                    <div className={s.focusT}>{cur ? cur.name : "八年级上册"}</div>
                    <div className={s.focusS}>
                      {cur ? `已背 ${cur.done} 词 · 还剩 ${cur.n - cur.done}` : "已背 42 词 · 还剩 68"}
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 8 }}>
                  {(cur ? cur.unitList.slice(0, 5) : []).map((u) => (
                    <div className={s.unitLine} key={u.unit}>
                      <span>Unit {u.unit}</span>
                      <i />
                      <b>{u.pct >= 100 ? "已背完" : `还剩 ${u.n - u.done}`}</b>
                    </div>
                  ))}
                </div>
              </div>
              <div className={s.railH} style={{ marginTop: 4 }}>其 他 册</div>
              <div className={s.chipRow}>
                {books
                  .filter((b) => !cur || b.short !== cur.short)
                  .map((b) => (
                    <span className={s.chip} key={b.short}>
                      {b.short}
                    </span>
                  ))}
              </div>
              <div className={s.fold} style={{ marginTop: 6 }}>
                ▸ 附 录
                <span>5 项 · 点开</span>
              </div>
            </div>
            <div className={s.pros}>
              <em>优点</em>：一屏只讲「我现在这本 + 它的单元」，附录默认收起 → 左栏立刻清爽；切换册靠一行小 chips。<br />
              <em>代价</em>：想换册要多看一眼 chips 区；单元列表要限制条数（这里显示 5 个 + 「展开」）。
            </div>
          </div>

          {/* 丙案 */}
          <div className={s.card}>
            <div className={s.cardCap}>
              <b>丙案 · 书脊卡片</b>
              <span>236px · 六册小卡 + 附录圆钮</span>
            </div>
            <div className={`${s.rail} ${s.railNarrow}`} style={{ width: 236 }}>
              <div className={s.railH}>六 册 书 脊</div>
              <div className={s.spineGrid}>
                {books.map((b) => (
                  <div
                    key={b.short}
                    className={`${s.spine} ${cur && b.short === cur.short ? s.spineOn : ""}`}
                  >
                    <span className={s.spineT}>{b.short}</span>
                    <span className={s.spineN}>
                      {b.done === 0 ? "未开始" : `${b.pct}%`}
                    </span>
                  </div>
                ))}
              </div>
              <div className={s.railH} style={{ marginTop: 6 }}>附 录</div>
              <div className={s.iconRow}>
                {APX.map((a) => (
                  <span className={s.iconBtn} key={a.k} title={a.t}>
                    {a.icon}
                    <b>{a.k}</b>
                  </span>
                ))}
              </div>
            </div>
            <div className={s.pros}>
              圆钮对应：A 复习中心 · B 学习统计 · C 成就图鉴 · D AI 学习 · E 易混词（hover 出现全名）<br />
              <em>优点</em>：六册变 3×2 卡片墙（有「书脊」质感），附录压成 5 个圆钮 —— 行数从 11 行降到 4 行 + 图标，最不密。<br />
              <em>代价</em>：图标需要认（靠 hover 文字兜底）；册的进度信息比甲案少。
            </div>
          </div>
        </div>
      </section>

      <div className={s.legend}>
        <span>※ 数据为真实口径（今日待背 / 到期 / 错题 / 累计题数 / 等级）</span>
        <span>※ 选定后我改真壳：左栏与上栏可各选一版</span>
      </div>
    </div>
  );
}
