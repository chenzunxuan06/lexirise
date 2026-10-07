// web/tests/srs-golden.mjs —— 用【当前真实代码】生成黄金基准
// 用法（在 web/ 目录下）:  node tests/srs-golden.mjs
// 原理：不碰任何产品代码，只补 localStorage shim + 冻结 Date.now，
//       用固定种子的作答序列驱动 lib/memory.js，把结果存成 fixture。
// 之后任何重构都必须复现这份 fixture —— 这就是"改坏了立刻知道"。
import "./_shim.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { simulate, fingerprint } from "./_sim.mjs";

const { memory } = await import("../lib/memory.js");
const here = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(here, "fixtures"), { recursive: true });

const { final } = simulate(memory);
const fp = fingerprint(final);
writeFileSync(join(here, "fixtures", "golden-memory.json"), fp, "utf8");

const ids = Object.keys(final);
const answers = ids.reduce((s, k) => s + final[k].total, 0);
console.log("黄金基准已生成：词数 =", ids.length, "｜ 总作答 =", answers);
console.log("→ tests/fixtures/golden-memory.json (" + fp.length + " 字节)");
