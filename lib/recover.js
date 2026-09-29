// ============================================================
// lib/recover.js —— 出错恢复的公共逻辑
//
// 为什么需要它（2026-09-22 实测）：
//   Next 的 chunk 文件名带内容 hash，每次 build 后 hash 会变。
//   浏览器如果还拿着「上一次 build 的页面壳」，就会去请求已经不存在的 chunk，
//   报 `Loading chunk N failed`。
//   这类错误**不能用 React 的 reset() 救** —— reset 只是拿同一个旧 bundle 重渲染，
//   那段代码仍然会去要那个 404 的 chunk，于是「再试一次」永远失败、用户看到的
//   就是「反复出现」。唯一有效的动作是让浏览器整页重新加载，取一份新的页面壳。
//
// 抽取成模块的原因：app/error.js 与 app/global-error.js 都要用同一套判断，
// 且这段逻辑必须能被单测（见 ui-check/check_recover.js）。
// ============================================================

const RELOAD_KEY = "lexirise:auto-reload-at";
const COOLDOWN_MS = 60000; // 同一分钟内只自动重载一次，杜绝「旧壳→重载→旧壳」死循环

/** 判断是否属于「chunk / 模块拿不到」这一类错误（各浏览器文案不同，全都覆盖） */
export function isChunkLoadError(err) {
  if (!err) return false;
  const name = String(err.name || "");
  const msg = String(err.message || err.reason || err || "");
  const s = name + " " + msg;
  return (
    /ChunkLoadError/i.test(s) ||
    /Loading chunk \d+ failed/i.test(s) ||
    /Loading CSS chunk \d+ failed/i.test(s) ||
    /Failed to fetch dynamically imported module/i.test(s) ||
    /Importing a module script failed/i.test(s) ||
    /error loading dynamically imported module/i.test(s)
  );
}

/** 距离上次自动重载是否已超过冷却时间（拿不到 sessionStorage 时按「可以重载」处理） */
export function canAutoReload(now) {
  try {
    const raw = sessionStorage.getItem(RELOAD_KEY);
    if (!raw) return true;
    const last = Number(raw);
    if (!Number.isFinite(last)) return true;
    return (Number.isFinite(now) ? now : Date.now()) - last > COOLDOWN_MS;
  } catch (e) {
    return true; // 隐私模式 / 禁用 storage：不拦，宁可重载
  }
}

/** 记录一次自动重载 */
export function markAutoReloaded(now) {
  try {
    sessionStorage.setItem(RELOAD_KEY, String(Number.isFinite(now) ? now : Date.now()));
  } catch (e) {
    /* 忽略 */
  }
}

/** 强制整页重载；返回是否成功发起 */
export function forceReload() {
  try {
    if (typeof location !== "undefined" && location.reload) {
      location.reload();
      return true;
    }
  } catch (e) {
    /* 忽略 */
  }
  return false;
}

/**
 * 尝试自动恢复：只在冷却期外重载一次。
 * @returns {boolean} true = 已经发起重载（调用方别再做别的）；false = 处于冷却期，交给用户手动
 */
export function autoRecover(err, now) {
  if (!isChunkLoadError(err)) return false;
  if (!canAutoReload(now)) return false;
  markAutoReloaded(now);
  return forceReload();
}
