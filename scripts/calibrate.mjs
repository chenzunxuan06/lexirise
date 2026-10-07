// ============================================================
// scripts/calibrate.mjs —— 用【真实日志】回答两个问题
// ------------------------------------------------------------
// 问题 1：产品给出的"还剩几成记得"（r_pred）准不准？        -> 校准曲线
// 问题 2：反应时（elapsed）到底有没有额外信息？            -> 分层对比
//
// 为什么必须用真实数据回答：
//   仿真里"用时"是我自己生成的。"用时越接近遗忘越慢"这个前提
//   正是要被检验的东西 —— 拿它去生成数据、再拿它去验证模型，
//   就是循环论证。仿真只能告诉我们"如果前提成立会怎样"，
//   不能告诉我们"前提是否成立"。后者只有真实日志能回答。
//
// 用法:
//   node scripts/calibrate.mjs <user.db 路径>
//   node scripts/calibrate.mjs            # 默认读 web/data/user.db
// ============================================================
import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { calibrationCurve, calibrationError } from "../lib/srs/sim.js";

const dbPath = process.argv[2] || new URL("../data/user.db", import.meta.url).pathname.replace(/^\//, "");
if (!existsSync(dbPath)) {
  console.error("找不到数据库：" + dbPath);
  process.exit(2);
}

const db = new DatabaseSync(dbPath, { readOnly: true });
const rows = db.prepare("SELECT event, meta, ts FROM events WHERE event = 'answer' ORDER BY id").all();
db.close();

const answers = [];
for (const r of rows) {
  let m;
  try { m = JSON.parse(r.meta); } catch { continue; }
  answers.push({ ...m, ts: r.ts });
}
console.log("answer 事件总数：" + answers.length);

const withPred = answers.filter((a) => a.r_pred !== null && a.r_pred !== undefined && Number.isFinite(Number(a.r_pred)));
const withElapsed = answers.filter((a) => Number.isFinite(Number(a.elapsed)) && Number(a.elapsed) > 0);
console.log("其中带模型预测(r_pred)的：" + withPred.length + "　带反应时的：" + withElapsed.length);

// ---- 问题 1：校准 ----
console.log("\n=== 1. 校准曲线（预测 vs 实际）===");
if (withPred.length < 200) {
  console.log("样本不足（" + withPred.length + " < 200），先积累。下面是当前能算的部分：");
}
const curve = calibrationCurve(withPred.map((a) => ({ r_pred: Number(a.r_pred), r_actual: Number(a.r_actual) })));
for (const b of curve) {
  if (!b.n) continue;
  console.log("  预测 " + (b.lo * 100).toFixed(0).padStart(3) + "-" + (b.hi * 100).toFixed(0).padStart(3) + "%  n=" +
    String(b.n).padStart(4) + "  平均预测 " + (b.predicted * 100).toFixed(1).padStart(5) + "%  实际 " +
    (b.actual * 100).toFixed(1).padStart(5) + "%");
}
if (withPred.length) console.log("  加权校准误差 = " + calibrationError(curve).toFixed(4) + "  (0 = 完美)");

// ---- 问题 2：反应时有没有额外信息 ----
// 做法：只看 r_pred 落在同一档的样本，把它们按用时快/慢对半切，
//       比较两半的"实际答对率"。若两半没有差别，说明用时不含额外信息。
console.log("\n=== 2. 反应时是否携带额外信息 ===");
const both = answers.filter((a) =>
  Number.isFinite(Number(a.r_pred)) && Number.isFinite(Number(a.elapsed)) && Number(a.elapsed) > 0);
console.log("同时有 r_pred 与 elapsed 的样本：" + both.length);
if (both.length < 200) {
  console.log("样本不足（< 200），**现在无法回答**。这是预期结果 —— 该字段 2026-10-06 才开始积累。");
  console.log("等样本够了再跑本脚本；不要用仿真替代这一步（理由见文件头）。");
} else {
  const bins = 5;
  for (let i = 0; i < bins; i++) {
    const lo = i / bins, hi = (i + 1) / bins;
    const seg = both.filter((a) => Number(a.r_pred) >= lo && Number(a.r_pred) < (i === bins - 1 ? 1.01 : hi));
    if (seg.length < 20) { console.log("  预测 " + lo + "-" + hi + "：样本太少(" + seg.length + ")，跳过"); continue; }
    const sorted = [...seg].sort((a, b) => a.elapsed - b.elapsed);
    const half = Math.floor(sorted.length / 2);
    const fast = sorted.slice(0, half), slow = sorted.slice(half);
    const acc = (arr) => arr.reduce((s, a) => s + (Number(a.r_actual) ? 1 : 0), 0) / arr.length;
    console.log("  预测 " + (lo * 100).toFixed(0).padStart(3) + "-" + (hi * 100).toFixed(0).padStart(3) + "%  n=" +
      String(seg.length).padStart(4) + "  快答对率 " + (acc(fast) * 100).toFixed(1).padStart(5) + "%   慢答对率 " +
      (acc(slow) * 100).toFixed(1).padStart(5) + "%   差 " + ((acc(fast) - acc(slow)) * 100).toFixed(1) + " 个百分点");
  }
  console.log("  判读：若「慢」那一列持续低于「快」，说明用时含额外信息，值得接进掌握判断；");
  console.log("        若两列基本一致，说明在这个产品里用时不含额外信息，不该接。");
}
