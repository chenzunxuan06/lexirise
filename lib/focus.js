// ============================================================
// lib/focus.js —— 纸间专注的数据层（localStorage，零后端）
// 词跃 LexiRise
// ------------------------------------------------------------
// 存储键：lexirise:focus
// 结构：{ sessions: [{ use, mode, planMs, actualMs, done, at }], custom: ["..."] }
//
// 「纸间专注」记的是【屏幕外】的事：背单词、背课文、写试卷、看纸质书……
// 所以这里只存"什么时候、做什么、多久"，不产出任何对错、评分、完成率。
//
// ⚠️ 两条留给后人的边界（写进注释，别让后人以为能做）：
//   1. 时长是学生【自己申报】的，不是测量出来的 —— 研究报告里只能当
//      "自我报告的使用记录"，不能当专注度证据。
//   2. 正因为不是测量数据，它【不能】喂给记忆调度器 —— 所以这个文件
//      永远不该 import lib/srs 那一层。
//
// 本文件的导出是【契约冻结】的（方向文档 §6.1）：界面按同一份契约同步开工，
// 改一个导出名就会同时打断两边，所以名称/签名/返回结构都不许动。
//
// 所有函数都不抛异常：隐私模式下 localStorage 会直接抛，而"记没记上"远没有
// "计时界面还能不能跑"重要 —— 一次抛出去就能把整个专注页带崩。
// ============================================================

// 必须写全 `.js` 扩展名：本文件同时被 Next 和 Node 测试直接 import，
// 只有显式扩展名两边都能解析（理由同 lib/memory.js 头部）。
import { stats, notifyDataChange } from "./memory.js";

const KEY = "lexirise:focus";

// 契约上限。localStorage 不是数据库：塞太满会让整个键写入失败，
// 与其一条都存不下，不如只留最近的。
const MAX_SESSIONS = 200;
// 自定义用途是"下次直接可选"的快捷入口，本质是最近用过的几个，不是收藏夹。
const MAX_CUSTOM = 8;
// 用途名要塞进按钮里，超长会撑破布局。
const MAX_USE_LEN = 20;

// 顺序照方向文档 §3 写死：前两项是英语学习，后两项是学生真实生活 ——
// 顺序本身就是主张，别按字母或使用频率重排。
export const USES = ["背单词", "背课文", "写试卷", "看纸质书", "其他"];
export const PRESETS = [15, 30, 45, 60, 90]; // 分钟
export const MODES = [
  { key: "stopwatch", label: "正计时" },
  { key: "countdown", label: "倒计时" },
  { key: "clock", label: "定时" },
];

// USES 末项"其他"是自定义用途的兜底桶。取末项而不是再写一遍字面量，
// 免得将来改 USES 时两处对不上。
const OTHER_USE = USES[USES.length - 1];

/** 契约里的空结构。readLog() 任何情况下都得给出这个形状，不能给 null。 */
function emptyLog() {
  return { sessions: [], custom: [] };
}

/**
 * 把读回来的东西收敛成契约形状。
 * 需要它是因为里面装的不一定是本文件写的：同步层 pull() 给没有数据的账号
 * 写的就是一个 "{}"（见 lib/sync.js），用户手改、旧版本残留同理，
 * 不收敛的话界面拿到的是 undefined.sessions 而不是空数组。
 */
function normalize(raw) {
  const out = emptyLog();
  if (!raw || typeof raw !== "object") return out;
  if (Array.isArray(raw.sessions)) {
    out.sessions = raw.sessions.filter((s) => s && typeof s === "object");
  }
  if (Array.isArray(raw.custom)) {
    out.custom = raw.custom.filter((n) => typeof n === "string" && n !== "");
  }
  return out;
}

function readRaw() {
  try {
    const v = localStorage.getItem(KEY);
    return v ? JSON.parse(v) : null;
  } catch {
    // 隐私模式、JSON 损坏、连 localStorage 这个全局都没有 —— 一律当作没数据
    return null;
  }
}

function writeRaw(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* 存不下就算了，绝不把异常扔给计时界面 */
  }
}

/** 时长只认非负有限数：时钟回拨或暂停累加写错会算出负数，负时长会把"共 N 分钟"算少 */
function durationMs(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 按【字符】截断而不是按 UTF-16 码元，否则第 20 个字是 emoji 时会被切成半个代理对 */
function clip(s) {
  return Array.from(s).slice(0, MAX_USE_LEN).join("");
}

/** -> { sessions: [...], custom: [] }；永远是对象，不会是 null */
export function readLog() {
  return normalize(readRaw());
}

/**
 * 记一笔。
 * @param {{ use?: string, mode?: string, planMs?: number, actualMs?: number, done?: boolean }} rec
 * @returns {object} 落库的那一条（含本层补上的 at）
 */
export function addSession(rec) {
  const r = rec && typeof rec === "object" ? rec : {};
  const log = readLog();
  const session = {
    // 用途为空时落到"其他"：它就是这个含义，比在界面上渲染出一个空按钮诚实
    use: String(r.use ?? "").trim() || OTHER_USE,
    mode: String(r.mode ?? ""),
    planMs: durationMs(r.planMs),
    actualMs: durationMs(r.actualMs),
    done: !!r.done,
    at: Date.now(),
  };
  log.sessions.push(session);
  log.sessions = log.sessions.slice(-MAX_SESSIONS);
  writeRaw(log);
  notifyDataChange(); // 不通知同步层，这些记录就只活在这台设备上
  return session;
}

/** -> { count, ms, byUse: { [use]: { count, ms } } }，只算今天 */
export function todaySummary() {
  // 日期口径必须和 stats 完全一致（本地日期，不是 UTC），否则晚上八点之后
  // 记的这一笔会被算到"明天"去。这里用 Date.now() 而不是 new Date()：
  // 前者在单测里可以被替换，后者永远读真实时钟，就造不出"今天"这个场景。
  const today = stats.keyOf(new Date(Date.now()));
  const out = { count: 0, ms: 0, byUse: {} };
  for (const s of readLog().sessions) {
    if (stats.keyOf(new Date(s.at)) !== today) continue;
    // 老账或手改过的数据可能是脏的：脏了算 0，别让一个 NaN 把整天的合计吃掉
    const d = durationMs(s.actualMs);
    const u = typeof s.use === "string" && s.use ? s.use : OTHER_USE;
    const cell = out.byUse[u] || (out.byUse[u] = { count: 0, ms: 0 });
    cell.count += 1;
    cell.ms += d;
    out.count += 1;
    out.ms += d;
  }
  return out;
}

/**
 * 记住一个自定义用途。
 * @param {string} name
 * @returns {string} 落库后的名字（被 trim / 截断过的）；空名字返回 "" 且不落库
 */
export function addCustomUse(name) {
  const clean = clip(String(name ?? "").trim());
  // 空名字不进列表：它会在界面上变成一个点不动的空按钮
  if (!clean) return "";
  const log = readLog();
  // 去掉旧的同名片再插到最前 —— 这样"最近用过的在前"不需要额外的排序字段
  log.custom = [clean, ...log.custom.filter((n) => n !== clean)].slice(0, MAX_CUSTOM);
  writeRaw(log);
  notifyDataChange();
  return clean;
}

/** -> string[]，最近用过的在前，最多 8 个 */
export function customUses() {
  // 存的时候已经封顶了，这里再切一次是为了兜住同步回来的旧数据
  return readLog().custom.slice(0, MAX_CUSTOM);
}
