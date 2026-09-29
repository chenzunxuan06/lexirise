// ============================================================
// lib/settings.js —— 用户设置层（localStorage）
// theme: light（深色模式已下线，固定浅色；字段保留以便将来恢复）
// sound: true | false（答题/连对/开箱/升级提示音）
// ============================================================

const KEY = "lexirise:settings";
const DEFAULTS = { theme: "light", sound: true, shell: "book" };

const subs = new Set();
export function onSettingsChange(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}
function emit() {
  subs.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

export function readSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(patch) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readSettings(), ...patch }));
  } catch {
    /* 隐私模式静默失败 */
  }
  emit();
}

export default { readSettings, saveSettings, onSettingsChange };