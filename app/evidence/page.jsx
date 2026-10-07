"use client";

// ============================================================
// app/evidence/page.jsx —— 证据页：仿真对照（T26/T27 + 核心交付物）
// ------------------------------------------------------------
// 这一屏要回答的是作品的中心问题，也是唯一一个"评委不需要懂算法、
// 5 秒内能看懂结论"的画面：
//
//   「同样的学生、同样的每日预算，只把调度器换掉，一学期下来
//     听写当天的保持率和覆盖率会差多少？」
//
// 三个刻意的设计选择：
//   ① 数据是【离线算好的】—— scripts/replay.mjs 写 public/sim-report.json。
//      不在浏览器里现算：一是慢（几千次调度），二是答辩现场必须每次都一样。
//   ② 必须写明"这是仿真"。路线图 §8 把"别把仿真结果说成真实实验"列为红线。
//   ③ 【把对自己不利的数字也放上来】—— 到期积压和期末掌握度上词跃是输的。
//      这一页的说服力恰恰来自它没有只挑好看的说。
// ============================================================

import { useEffect, useState } from "react";

const T = {
  ink: "var(--ink)",
  soft: "var(--soft)",
  faint: "var(--faint)",
  edge: "var(--edge)",
  hair: "var(--hair)",
  fox: "var(--fox)",
  foxInk: "var(--fox-ink)",
  paper: "var(--paper)",
  surface: "var(--surface)",
  green: "var(--seal-g)",
  red: "var(--seal)",
};

const pct = (x) => (x * 100).toFixed(1) + "%";
const num = (x, n = 1) => Number(x).toFixed(n);

/** 指标定义：key 对应 sim-report.json 里 summary 的字段名 */
const METRICS = [
  { key: "dictationRetention", label: "听写当天 · 范围内平均保持率", unit: "pct", better: "high" },
  { key: "dictationCoverage", label: "听写当天 · 范围内覆盖率", unit: "pct", better: "high" },
  { key: "peakForgotten", label: "欠账峰值（学过但已忘 · 词）", unit: "num", better: "low" },
  { key: "peakDue", label: "到期积压峰值（产品记账口径 · 词）", unit: "num", better: "tradeoff" },
  { key: "mastered", label: "期末已掌握 lv≥4（词）", unit: "num", better: "high" },
];

export default function EvidencePage() {
  const [rep, setRep] = useState(null);
  const [sceneIdx, setSceneIdx] = useState(1);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/sim-report.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
      .then(setRep)
      .catch((e) => setErr(String(e.message || e)));
  }, []);

  if (err) {
    return (
      <Wrap>
        <p style={{ color: T.red }}>读不到仿真报告（{err}）。</p>
        <p style={{ color: T.soft, fontSize: 14 }}>
          先在本机跑一次：<code>node scripts/replay.mjs</code>
        </p>
      </Wrap>
    );
  }
  if (!rep) {
    return (
      <Wrap>
        <p style={{ color: T.faint }}>正在加载仿真报告…</p>
      </Wrap>
    );
  }

  const scene = rep.scenes[sceneIdx] || rep.scenes[0];
  const primary = rep.scenes[rep.primary] || rep.scenes[0];

  return (
    <Wrap>
      <h1 style={{ fontSize: 24, margin: "0 0 6px", color: T.ink }}>证据：只换调度器，其他都不动</h1>
      <p style={{ color: T.soft, fontSize: 14, margin: "0 0 10px", lineHeight: 1.8 }}>
        {rep.scene.story}。候选池 {rep.pool.words} 词 / {rep.pool.units} 个单元，
        {rep.reproducible.students} 个仿真学生做【配对】对照 ——
        每个学生用同一串随机数各跑一遍两种调度，所以差异只可能来自"选了哪些词"。
      </p>

      <Badge>仿真结果，不是真实用户数据</Badge>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "16px 0 12px" }}>
        {rep.scenes.map((s, i) => (
          <button
            key={s.name}
            onClick={() => setSceneIdx(i)}
            style={{
              fontSize: 13,
              padding: "5px 12px",
              borderRadius: 999,
              cursor: "pointer",
              border: "1px solid " + (i === sceneIdx ? T.fox : T.edge),
              background: i === sceneIdx ? T.fox : "transparent",
              color: i === sceneIdx ? "#fff" : T.soft,
            }}
          >
            {s.name}
          </button>
        ))}
      </div>

      <Card title="一个对比表" note={"每天 " + scene.budget.count + " 词的预算，一学期 8 周"}>
        <Head />
        {METRICS.map((m) => {
          const s = scene.summary[m.key];
          const fmt = m.unit === "pct" ? pct : num;
          const win = m.better === "low" ? s.diff.mean < 0 : s.diff.mean > 0;
          const good = m.better !== "tradeoff" && win;
          const bad = m.better !== "tradeoff" && !win;
          const betterCount = m.better === "low" ? s.losses : s.wins;
          return (
            <div
              key={m.key}
              style={{ display: "grid", gridTemplateColumns: GRID, gap: 8, padding: "8px 0", borderBottom: "1px solid " + T.hair, alignItems: "baseline" }}
            >
              <span style={{ fontSize: 13, color: T.soft }}>{m.label}</span>
              <span style={{ fontSize: 14, color: T.soft, textAlign: "right" }}>
                {fmt(s.baseline.mean)} <span style={{ fontSize: 11, color: T.faint }}>±{fmt(s.baseline.sd)}</span>
              </span>
              <span style={{ fontSize: 15, color: good ? T.green : bad ? T.red : T.ink, fontWeight: 600, textAlign: "right" }}>
                {fmt(s.constrained.mean)} <span style={{ fontSize: 11, color: T.faint, fontWeight: 400 }}>±{fmt(s.constrained.sd)}</span>
              </span>
              <span style={{ fontSize: 13, color: T.soft, textAlign: "right" }}>
                {s.diff.mean >= 0 ? "+" : ""}{fmt(s.diff.mean)}
              </span>
              <span style={{ fontSize: 12, color: good ? T.green : bad ? T.red : T.faint, textAlign: "right" }}>
                {m.better === "tradeoff" ? "权衡" : betterCount + "/" + s.students}
              </span>
            </div>
          );
        })}
        <p style={{ fontSize: 12.5, color: T.faint, margin: "12px 0 0", lineHeight: 1.9 }}>
          <b style={{ color: T.foxInk }}>这一页没有只挑好看的说。</b>
          词跃在"到期积压（产品记账口径）"和"期末掌握度"上是【输】的，原因也清楚：
          它把预算压在当前单元上，所以学过的词更多、要还的账也更多；
          而在"欠账（学过但已忘）"这个与记账方式无关的口径上，它明显更低。
          换言之：<b>它换来的是覆盖与应考，代价是深度与清账。</b>
        </p>
      </Card>

      <Card title="一张双线图" note="横轴：学期里的每一天　纵轴：当周听写单元的词，平均还有几成记得">
        <LineChart
          days={scene.series.days}
          dictationDays={scene.series.dictationDays}
          lines={[
            { name: rep.policyLabel.baselineShuffled, color: T.hair, data: scene.series.baseline.map((d) => d.retention) },
            { name: rep.policyLabel.constrained, color: T.fox, data: scene.series.constrained.map((d) => d.retention) },
          ]}
          yLabel="保持率"
        />
        <div style={{ height: 14 }} />
        <LineChart
          days={scene.series.days}
          dictationDays={scene.series.dictationDays}
          lines={[
            { name: "普通做法 · 覆盖率", color: T.hair, data: scene.series.baseline.map((d) => d.coverage) },
            { name: "词跃 · 覆盖率", color: T.fox, data: scene.series.constrained.map((d) => d.coverage) },
          ]}
          yLabel="覆盖率"
        />
        <p style={{ fontSize: 12.5, color: T.faint, margin: "12px 0 0", lineHeight: 1.9 }}>
          竖直虚线 = 每周五的听写日。两条线的差距从第 1 周就出现，之后没有被追平：
          普通的到期排序一直在复习"碰巧到期的词"，而听写考的是"这周教的那个单元"。
        </p>
      </Card>

      <Card
        title="校准曲线：产品对记忆的信念准不准"
        note={"按预测保持率分箱，比较平均预测与实际正确率；共 " + primary.calibration.n + " 个样本（仅 lv>0）"}
      >
        <CalibrationChart bins={primary.calibration.bins} />
        <p style={{ fontSize: 12.5, color: T.faint, margin: "12px 0 0", lineHeight: 1.9 }}>
          点落在对角线上 = 模型说自己记得几成，学生就真的记得几成。
          这里的点普遍落在对角线的<b>上方</b>（实际正确率高于预测），
          说明产品当前的模型是<b>偏保守</b>的：它以为学生忘得更快。
          加权偏差 {pct(primary.calibration.error)}，样本量还小，只能当作方向性证据。
          <br />
          <b style={{ color: T.foxInk }}>模型的盲区：</b>
          lv=0 时 retrievability 返回 0，也就是把"学过但没学会"和"从没见过"当成同一件事。
          仿真里这种情形出现了 {primary.blindSpot.n} 次，学生的实际正确率是 
          {pct(primary.blindSpot.rate)} —— 模型说 0%，实际不是 0%。
          这正是"给 lv 补一个连续的可提取性估计"要解决的问题。
        </p>
      </Card>

      <Card title="稳健性：换一组假设，方向还成立吗" note="只换仿真学生有多强，调度器一个字没改">
        <MiniTable
          note="数值为「普通做法 → 词跃」"
          head={["参数组", "保持率", "覆盖率", "欠账峰值"]}
          rows={rep.robustness.map((r) => [
            r.name,
            pct(r.summary.dictationRetention.baseline.mean) + " → " + pct(r.summary.dictationRetention.constrained.mean),
            pct(r.summary.dictationCoverage.baseline.mean) + " → " + pct(r.summary.dictationCoverage.constrained.mean),
            num(r.summary.peakForgotten.baseline.mean) + " → " + num(r.summary.peakForgotten.constrained.mean),
          ])}
        />
        <div style={{ height: 16 }} />
        <MiniTable
          note="数值为「普通做法 → 词跃」"
          head={["基线口径（怎么给普通做法挑新词）", "保持率", "覆盖率", "欠账峰值"]}
          rows={rep.baselines.map((b) => [
            b.name,
            pct(b.summary.dictationRetention.baseline.mean) + " → " + pct(b.summary.dictationRetention.constrained.mean),
            pct(b.summary.dictationCoverage.baseline.mean) + " → " + pct(b.summary.dictationCoverage.constrained.mean),
            num(b.summary.peakForgotten.baseline.mean) + " → " + num(b.summary.peakForgotten.constrained.mean),
          ])}
        />
        <p style={{ fontSize: 12.5, color: T.faint, margin: "12px 0 0", lineHeight: 1.9 }}>
          第一张表：把仿真学生换成"底子好 / 一般 / 底子弱"三档，结论方向不变 ——
          这是防"你是不是挑了一组对自己有利的参数"的。<br />
          第二张表：普通做法有两种合理口径。默认用"新词打乱"，因为那才是线上
          lib/progress.js 的真实行为；另一种"新词按词表顺序"是 T12 对比视图用的。
          两种都列出来，读者可以自己判断。
        </p>
      </Card>

      <Card title="怎么复现" note="这一节是给较真的评委（和三个月后的自己）看的">
        <pre style={PRE}>{PROMPT}</pre>
        <ul style={{ fontSize: 13, color: T.soft, lineHeight: 2, margin: "12px 0 0", paddingLeft: 20 }}>
          <li>
            <b>真值模型与产品模型不是同一个。</b>
            如果仿真学生也用 lv/间隔表遗忘，"到期那天正好剩 36.8%"就成了恒等式，谈不上验证。
            所以仿真学生用的是另一套：稳定度连续增长 S ← S×
            {rep.model.truth.GROW}，回忆概率 R = exp(−Δ/S)。
            两者只在"隔得越久越容易忘"这一点上一致。
          </li>
          <li><b>配对设计。</b>同一个学生在同一天对同一个词，抽到的是同一个随机数；差异只可能来自"选了哪些词"。</li>
          <li>
            <b>欠账用真值口径，不用产品记账口径。</b>
            产品口径有个漏洞：答错的词会掉回 lv=0，于是不再算"到期"，积压凭空少一块 ——
            结果是"越学不会的人积压越小"，这个指标就没法用了。
          </li>
          <li><b>指纹</b>：{rep.digest}。同样的命令应该得到同样的指纹；对不上说明代码或参数变过。</li>
          <li>
            <b>已知缺陷（下一步要改的）。</b>
            现在的打分公式对"反复答错的 lv=0 词"给的分过高（新词补贴、错误率补贴、逾期补贴同时拿满），
            成熟的 lv=1–2 词反而要拖到很逾期才排得上队。
            仿真里重复接触共落在 lv&gt;0 的只有 {primary.calibration.n} 次，其余 
            {primary.blindSpot.n} 次都是 lv=0 —— 这就是那个问题的痕迹。
            它也是"按数据改 SM-2"（T28）的入口。
          </li>
        </ul>
      </Card>

      <div style={{ marginTop: 18, fontSize: 14, display: "flex", gap: 18 }}>
        <a href="/compare?demo=1" style={{ color: T.foxInk }}>← 看色块对比（5 秒版）</a>
        <a href="/plan" style={{ color: T.foxInk }}>备考计划 →</a>
      </div>
    </Wrap>
  );
}

const GRID = "2fr 1.15fr 1.15fr 1fr 0.7fr";
const PRE = {
  background: "var(--paper)",
  border: "1px solid var(--edge)",
  borderRadius: "var(--radius)",
  padding: "10px 12px",
  fontSize: 12.5,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  color: "var(--ink)",
  margin: 0,
};
const PROMPT = "cd web\nnode scripts/replay.mjs --students 12 --seed 20261005\n（约 0.5 秒跑完，写出 public/sim-report.json）";

function Wrap({ children }) {
  return <div style={{ maxWidth: 980, margin: "0 auto", padding: "24px 16px 64px" }}>{children}</div>;
}

function Badge({ children }) {
  return (
    <div style={{ display: "inline-block", fontSize: 12.5, color: "var(--seal)", border: "1px solid var(--seal)", borderRadius: 999, padding: "2px 12px" }}>
      {children}
    </div>
  );
}

function Head() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 8, fontSize: 12, color: "var(--faint)", padding: "0 0 6px", borderBottom: "1px solid var(--hair)" }}>
      <span>指标</span>
      <span style={{ textAlign: "right" }}>普通做法</span>
      <span style={{ textAlign: "right" }}>词跃</span>
      <span style={{ textAlign: "right" }}>配对差值</span>
      <span style={{ textAlign: "right" }}>更好</span>
    </div>
  );
}

function Card({ title, note, children }) {
  return (
    <section style={{ marginTop: 20, background: "var(--surface)", border: "1px solid var(--edge)", borderRadius: "var(--radius)", padding: "16px 18px" }}>
      <h2 style={{ fontSize: 16, margin: "0 0 2px", color: "var(--ink)" }}>{title}</h2>
      {note ? <div style={{ fontSize: 12.5, color: "var(--faint)", marginBottom: 12 }}>{note}</div> : <div style={{ height: 10 }} />}
      {children}
    </section>
  );
}

function MiniTable({ head, note, rows }) {
  return (
    <div>
      {note ? <div style={{ fontSize: 11.5, color: "var(--faint)", marginBottom: 4 }}>{note}</div> : null}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "34%" }} />
          <col style={{ width: "22%" }} />
          <col style={{ width: "22%" }} />
          <col style={{ width: "22%" }} />
        </colgroup>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={h} style={{ textAlign: i === 0 ? "left" : "right", color: "var(--faint)", fontWeight: 400, padding: "4px 6px", borderBottom: "1px solid var(--hair)", fontSize: 11.5 }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, j) => (
            <tr key={j}>
              {r.map((c, i) => (
                <td key={i} style={{ textAlign: i === 0 ? "left" : "right", color: i === 0 ? "var(--soft)" : "var(--ink)", padding: "6px 4px", borderBottom: "1px solid var(--hair)", wordBreak: "keep-all", lineHeight: 1.5 }}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------
// 双线图（纯 SVG，不引任何图表库）
// 不引库的理由：整个项目的依赖只有 next/react。为了两张折线图装一个
// 300KB 的图表库不划算，而且离线答辩时少一个东西要加载。
// ------------------------------------------------------------
const W = 900;
const H = 260;
const PAD = { l: 52, r: 16, t: 16, b: 30 };

function LineChart({ days, lines, dictationDays = [], yLabel }) {
  const n = days.length;
  if (!n) return null;
  const x = (i) => PAD.l + (i / Math.max(1, n - 1)) * (W - PAD.l - PAD.r);
  const y = (v) => PAD.t + (1 - Math.min(1, Math.max(0, v))) * (H - PAD.t - PAD.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const xTicks = [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4), n - 1];

  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={"0 0 " + W + " " + H} width="100%" style={{ minWidth: 560, display: "block" }} role="img" aria-label={yLabel + "曲线"}>
        {ticks.map((g) => (
          <g key={g}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(g)} y2={y(g)} stroke="var(--hair)" strokeWidth="0.6" opacity="0.5" />
            <text x={PAD.l - 8} y={y(g) + 4} textAnchor="end" fontSize="11" fill="var(--faint)">
              {Math.round(g * 100) + "%"}
            </text>
          </g>
        ))}
        {dictationDays.map((d) => (
          <line key={"d" + d} x1={x(d)} x2={x(d)} y1={PAD.t} y2={H - PAD.b} stroke="var(--dot-line)" strokeWidth="0.8" strokeDasharray="3 4" opacity="0.75" />
        ))}
        {lines.map((ln) => (
          <polyline
            key={ln.name}
            fill="none"
            stroke={ln.color}
            strokeWidth="2"
            strokeLinejoin="round"
            points={ln.data.map((v, i) => x(i) + "," + y(v)).join(" ")}
          />
        ))}
        {xTicks.map((i) => (
          <text key={"x" + i} x={x(i)} y={H - PAD.b + 16} textAnchor="middle" fontSize="11" fill="var(--faint)">
            {"第 " + (Math.floor(i / 7) + 1) + " 周"}
          </text>
        ))}
        <text x={PAD.l - 8} y={PAD.t - 3} textAnchor="end" fontSize="11" fill="var(--faint)">{yLabel}</text>
      </svg>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 12.5, color: "var(--soft)", marginTop: 4 }}>
        {lines.map((ln) => (
          <span key={ln.name}>
            <span style={{ display: "inline-block", width: 16, height: 3, background: ln.color, verticalAlign: 3, marginRight: 6, borderRadius: 2 }} />
            {ln.name}
          </span>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// 校准曲线
// ------------------------------------------------------------
const W2 = 420;
const H2 = 320;
const P2 = { l: 56, r: 16, t: 16, b: 40 };

function CalibrationChart({ bins }) {
  const used = (bins || []).filter((b) => b.n > 0);
  const x = (v) => P2.l + v * (W2 - P2.l - P2.r);
  const y = (v) => P2.t + (1 - v) * (H2 - P2.t - P2.b);
  const maxN = used.reduce((m, b) => Math.max(m, b.n), 1);

  return (
    <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
      <svg viewBox={"0 0 " + W2 + " " + H2} width={W2} style={{ maxWidth: "100%" }} role="img" aria-label="校准曲线">
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <g key={g}>
            <line x1={P2.l} x2={W2 - P2.r} y1={y(g)} y2={y(g)} stroke="var(--hair)" strokeWidth="0.6" opacity="0.5" />
            <line x1={x(g)} x2={x(g)} y1={P2.t} y2={H2 - P2.b} stroke="var(--hair)" strokeWidth="0.6" opacity="0.5" />
            <text x={P2.l - 8} y={y(g) + 4} textAnchor="end" fontSize="11" fill="var(--faint)">{Math.round(g * 100) + "%"}</text>
            <text x={x(g)} y={H2 - P2.b + 16} textAnchor="middle" fontSize="11" fill="var(--faint)">{Math.round(g * 100) + "%"}</text>
          </g>
        ))}
        <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke="var(--dot-line)" strokeWidth="1" strokeDasharray="4 4" />
        {used.map((b) => (
          <circle
            key={b.lo}
            cx={x(b.predicted)}
            cy={y(b.actual)}
            r={4 + 10 * Math.sqrt(b.n / maxN)}
            fill="var(--fox)"
            fillOpacity="0.5"
            stroke="var(--fox-ink)"
            strokeWidth="1"
          />
        ))}
        <text x={(P2.l + W2 - P2.r) / 2} y={H2 - 6} textAnchor="middle" fontSize="11" fill="var(--faint)">产品预测的保持率</text>
        <text x={12} y={P2.t + 10} fontSize="11" fill="var(--faint)">实际</text>
      </svg>
      <div style={{ fontSize: 12.5, color: "var(--soft)", minWidth: 250 }}>
        <div style={{ color: "var(--faint)", marginBottom: 6 }}>圆点越大 = 该箱样本越多；虚线是对角线（完美校准）</div>
        {used.map((b) => (
          <div key={b.lo} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "3px 0", borderBottom: "1px solid var(--hair)" }}>
            <span style={{ color: "var(--faint)" }}>{pct(b.lo) + "–" + pct(b.hi)}</span>
            <span>预测 {pct(b.predicted)}</span>
            <span style={{ color: "var(--fox-ink)" }}>实际 {pct(b.actual)}</span>
            <span style={{ color: "var(--faint)" }}>n={b.n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
