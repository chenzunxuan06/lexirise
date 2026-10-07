// web/tests/_sim.mjs —— 确定性仿真内核（被 golden / test / mutation-demo 共用）
//
// DAY 从实现层引入，避免在测试里另抄一份常量 —— 抄一份就多一个会悄悄跑偏的地方。
// 注意：必须【先 import 再 export】，不能用 `export { DAY } from "..."` ——
// 那是纯再导出，不会在本模块建立绑定，而下面的 simulate() 自己要用 DAY。
import { DAY } from "../lib/srs/model.js";
export { DAY };

export const N_WORDS = 40;
export const N_DAYS = 60;
export const SEED = 20261004;

/** mulberry32：确定性伪随机 */
export function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 用固定种子的作答序列驱动一个 memory 实现。
 * 冻结 Date.now 以保证可复现。
 * @param {{record:Function, load:Function, get?:Function}} impl
 */
export function simulate(impl, { seed = SEED, days = N_DAYS, words = N_WORDS } = {}) {
  const rand = rng(seed);
  let t = Date.UTC(2026, 0, 1, 12, 0, 0);
  const realNow = Date.now;
  Date.now = () => t;
  try {
    for (let d = 0; d < days; d++) {
      for (let k = 0; k < 8; k++) {
        const id = 1 + Math.floor(rand() * words);
        const prev = impl.get ? impl.get(id) : null;
        const lv = prev ? prev.lv : 0;
        const p = Math.min(0.95, 0.55 + 0.045 * lv); // 越熟练越可能答对
        impl.record(id, rand() < p, !prev || prev.lv === 0);
      }
      t += DAY + Math.floor(rand() * 6 * 3600000);
    }
    return { final: impl.load(), tEnd: t };
  } finally {
    Date.now = realNow;
  }
}

/** 只保留可比字段并按键排序，便于逐字节比较 */
export function fingerprint(mem) {
  const out = {};
  for (const k of Object.keys(mem).sort((a, b) => Number(a) - Number(b))) {
    const s = mem[k];
    out[k] = { lv: s.lv, lapses: s.lapses, ok: s.ok, total: s.total, due: s.due, first: s.first, last: s.last };
  }
  return JSON.stringify(out, null, 1);
}
