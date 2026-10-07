// ============================================================
// tests/mutation-demo.mjs —— 证明测试网真的能抓到算法改动
// ------------------------------------------------------------
// 做法：把 lib/srs/model.js 的源码复制一份、只改一个字符，再跑同一仿真。
//      产品代码一个字节都不动。
//
// 【2026-10-04 更新】算法已从 lib/memory.js 抽到 lib/srs/model.js（纯函数层），
// 所以变异目标改为 model.js。附带好处：纯函数层不需要 localStorage shim。
//
// 用法（在 web/ 目录下）:  node tests/mutation-demo.mjs
// ============================================================
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { simulate, fingerprint, DAY } from "./_sim.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const expected = readFileSync(join(here, "fixtures", "golden-memory.json"), "utf8");
const src = readFileSync(join(here, "..", "lib", "srs", "model.js"), "utf8");

// 变异：把"答错回退 2 级"改成"回退 1 级"
const MUT_FROM = "cur.lv >= 2 ? cur.lv - 2 : 0";
const MUT_TO = "cur.lv >= 1 ? cur.lv - 1 : 0";

if (!src.includes(MUT_FROM)) {
  console.error("变异点未找到，model.js 可能已改动：", MUT_FROM);
  process.exit(1);
}

/** 用纯函数包一个最小实现，供 simulate() 驱动 */
function wrap(nextState) {
  const mem = {};
  return {
    load: () => mem,
    get: (id) => mem[id] || null,
    record: (id, ok, isNew) => {
      const { state } = nextState(mem[id], ok, Date.now(), isNew);
      mem[id] = state;
      return state;
    },
  };
}

const tmp = join(here, "_mutant.mjs");
writeFileSync(tmp, src.replace(MUT_FROM, MUT_TO), "utf8");

try {
  const { nextState } = await import(pathToFileURL(tmp).href);
  const { final } = simulate(wrap(nextState));
  const actual = fingerprint(final);

  if (actual === expected) {
    console.log("❌ 变异未被发现 —— 测试网无效，需要加强");
    process.exit(1);
  }

  const a = JSON.parse(actual);
  const e = JSON.parse(expected);
  const diffs = [];
  for (const k of Object.keys(e)) {
    if (JSON.stringify(a[k]) !== JSON.stringify(e[k])) diffs.push({ id: k, e: e[k], a: a[k] });
  }
  console.log("✅ 变异被测试网捕获");
  console.log("   变异点：" + MUT_FROM + "  →  " + MUT_TO);
  console.log("   受影响词数：" + diffs.length + " / " + Object.keys(e).length);
  console.log("   前 3 处差异：");
  for (const d of diffs.slice(0, 3)) {
    console.log(
      "     #" + d.id + " 期望 lv=" + d.e.lv + " → 变异后 lv=" + d.a.lv +
      " | due 差 " + Math.round((d.a.due - d.e.due) / DAY) + " 天"
    );
  }
} finally {
  try { unlinkSync(tmp); } catch {}
}
