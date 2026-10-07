// ============================================================
// lib/loadWords.js —— 客户端加载本地词库数据层（words.json / affixes.json）
// ------------------------------------------------------------
// ⚠️ 2026-10-07 修正：**加模块级 Promise 缓存**（此前每次调用都真发一次 fetch）
//
// 怎么发现的：做"评委视角审计"时（tests/audit-fresh-visitor.mjs），
//   手机上打开首页 **5.1 秒**才就绪，资源时间线里同一个 words.json 出现了 **7 次**。
//   原因：全站有 22 处 loadWords() 调用，而首页一次就同时挂载
//   BookShell / BottomTab / 首页 / Onboarding 四个调用方，每个都各拉一遍。
//   文件本身 763 KB（gzip 后 99 KB）—— 7 次就是 7 个往返 + 7 次 763 KB 的 JSON 解析，
//   在手机上这是实打实的秒级浪费，而**评委扫二维码看到的第一屏就是它**。
//
// 为什么缓存 Promise 而不是结果：并发调用（首页那四个同时发起）只会打一次网络。
//   这与 lib/corpus.js 的懒加载缓存是同一个做法，两处口径一致。
//
// 为什么失败时要清掉缓存：否则一次网络抖动会把"加载失败"永久钉在这个会话里，
//   后面所有重试都直接拿到同一个 rejected promise。
// ============================================================

/** 在飞的请求（Promise），成功后长期复用 */
let wordsPromise = null;
let affixesPromise = null;

/**
 * 拉一个静态 JSON，带 Promise 缓存。
 * @param {string} url
 * @param {(p:Promise|null)=>void} setSlot 清缓存用（失败时置空）
 * @param {string} label 报错文案里用的文件名
 */
function fetchOnce(url, setSlot, label) {
  const p = fetch(url).then((res) => {
    if (!res.ok) throw new Error("加载 " + label + " 失败: " + res.status);
    return res.json();
  });
  // 失败不缓存：清掉槽位，允许下一次调用重试
  const guarded = p.catch((e) => {
    setSlot(null);
    throw e;
  });
  setSlot(guarded);
  return guarded;
}

export function loadWords() {
  if (!wordsPromise) fetchOnce("/words.json", (p) => (wordsPromise = p), "words.json");
  return wordsPromise;
}

export function loadAffixes() {
  if (!affixesPromise) fetchOnce("/affixes.json", (p) => (affixesPromise = p), "affixes.json");
  return affixesPromise;
}

/** 按 id 快速查词 */
export function wordById(words, id) {
  return words.find((w) => w.id === id);
}

/** 每日一词：按日期确定性取词 */
export function wordOfTheDay(words) {
  if (!words || !words.length) return null;
  const d = new Date();
  const dayNum =
    d.getFullYear() * 372 + (d.getMonth() + 1) * 31 + d.getDate();
  return words[dayNum % words.length];
}
