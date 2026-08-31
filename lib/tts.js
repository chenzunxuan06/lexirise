// lib/tts.js —— 三层发音引擎（全站复用，调用方无需改动）
//
// 背景：原实现 100% 依赖浏览器 Web Speech API（speechSynthesis），
// 鸿蒙 ArkWeb 内核未实现该 API，导致全站朗读/听力/听写在鸿蒙上静默失效。
//
// 发音优先级（自动降级）：
//   1. 预生成音频文件  /audio/t/<sha1(text)[:16]>.mp3   —— 音色统一、离线可用（scripts/gen_audio.py 生成）
//   2. 浏览器 speechSynthesis                            —— 未预生成的文本（自定义词/中文等）
//   3. 有道在线接口 dict.youdao.com/dictvoice            —— 词/短语在线兜底
// 自动播放策略：失败时挂起，等下一次用户手势自动重放；unlockAudio() 供点击时提前解锁。
//
// speak(text, { lang, rate, onend })

// 已被确认缺失的音频文件（避免每次朗读都白等一次网络请求）
const MISSING_FILES = new Set();
// 被自动播放策略拦截、等待用户手势重放的播放任务
let pendingPlay = [];
let unlockArmed = false;
// 当前正在播放的 Audio 元素（stopSpeak 用）
let currentAudio = null;
// speechSynthesis 慢速时需 rate；与文件播放统一
const hasTTS = () => typeof window !== "undefined" && "speechSynthesis" in window;

/** 文本 → 预生成音频路径（与 scripts/gen_audio.py 的 sha1[:16] 规则一致） */
async function audioPathFor(text) {
  try {
    const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
    const hex = Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 16);
    return `/audio/t/${hex}.mp3`;
  } catch {
    return null;
  }
}

/** 播放挂起的任务（用户手势时调用） */
function flushPending() {
  const q = pendingPlay;
  pendingPlay = [];
  q.forEach((fn) => fn());
}

/** 用户手势中调用：解锁后续自动播放（媒体策略）。幂等，可重复调用。 */
let unlockCtx = null;
export function unlockAudio() {
  try {
    if (!unlockCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) {
        unlockCtx = new Ctx();
        unlockCtx.resume().catch(() => {});
      }
    } else {
      unlockCtx.resume().catch(() => {});
    }
  } catch {}
  try {
    // 静音片段占位播放，向浏览器宣告“本页需要出声”
    const a = new Audio(
      "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAACAgICA"
    );
    a.volume = 0;
    a.play().catch(() => {});
  } catch {}
  flushPending();
}

/** 初次 speak 失败被拦后，注册一次性全局手势监听来重放 */
function armUnlock() {
  if (unlockArmed) return;
  unlockArmed = true;
  const fire = () => {
    unlockArmed = false;
    window.removeEventListener("pointerdown", fire);
    window.removeEventListener("touchstart", fire);
    window.removeEventListener("keydown", fire);
    unlockAudio();
  };
  window.addEventListener("pointerdown", fire);
  window.addEventListener("touchstart", fire);
  window.addEventListener("keydown", fire);
}

/**
 * 用 <audio> 播放（预生成文件 / 在线地址）。
 * resolve(next) 在“播放失败（文件缺失/网络/被拦）”时调用；onend 在真正播完时调用。
 */
function playAudio(url, rate, onend, next) {
  const a = new Audio(url);
  currentAudio = a;
  a.preload = "auto";
  a.volume = 1;
  a.playbackRate = Math.max(0.4, Math.min(2, rate));
  let settled = false;
  const end = () => {
    if (settled) return;
    settled = true;
    if (onend) onend();
  };
  a.onended = end;
  a.onerror = () => {
    if (settled) return;
    settled = true;
    if (next) next();
    else if (onend) onend();
  };
  const p = a.play();
  if (p && p.catch) {
    p.catch((e) => {
      if (settled) return;
      settled = true;
      if (e && e.name === "NotAllowedError") {
        // 自动播放策略：挂起等手势
        pendingPlay.push(() => playAudio(url, rate, onend, next));
        armUnlock();
        return;
      }
      if (next) next();
      else if (onend) onend();
    });
  }
  return a;
}

/** 朗读文本规范化 —— 与 scripts/gen_audio.py 的 norm_text 逐字节一致（两侧改动必须同步！）
 *  目的：*wrapper / switch-off / leave ... behind / rise (rose, risen) 等
 *  教材标注词条，生成端与浏览器端对同一文本算出同一音频文件名。 */
function speakText(t) {
  return String(t)
    .replace(/^\*+/, "")
    .replace(/…+|\.{2,}/g, " something ")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 有道在线发音（仅词/短语，句子的接口返回 500） */
function youdaoUrl(text) {
  const t = speakText(text);
  if (t.length < 1 || t.length > 80) return null;
  if (!/^[a-zA-Z][a-zA-Z'’\- ]+$/.test(t)) return null;
  return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(t)}&type=2`;
}

/** 系统 TTS 朗读；返回是否可用并接管 */
function speakViaTTS(text, opts, onend) {
  if (!hasTTS()) return false;
  try {
    const u = new SpeechSynthesisUtterance(String(text));
    u.lang = opts.lang;
    u.rate = opts.rate;
    if (onend) u.onend = onend;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    return true;
  } catch {
    return false;
  }
}

export function speak(text, opts = {}) {
  if (typeof window === "undefined" || !text) return;
  const { lang = "en-US", rate = 0.95, onend } = opts;
  const isEn = lang.toLowerCase().startsWith("en");
  // 统一规范化朗读文本（与预生成音频/有道的寻址一致），空则放弃
  const st = speakText(text);
  if (!st) return;
  // 新朗读开始前停掉上一次（保持原实现 "speak 先 cancel" 的语义，防叠读）
  stopSpeak();

  // 第 1 层：预生成音频（一致音色 + 离线可用）
  if (isEn) {
    audioPathFor(st).then((path) => {
      if (!path || MISSING_FILES.has(path)) {
        const u = youdaoUrl(st);
        if (u) playAudio(u, rate, onend, () => {
          speakViaTTS(st, opts, onend);
        });
        else if (!speakViaTTS(st, opts, onend) && onend) onend();
        return;
      }
      playAudio(path, rate, onend, () => {
        MISSING_FILES.add(path);
        const u = youdaoUrl(st);
        if (u) playAudio(u, rate, onend, () => {
          speakViaTTS(st, opts, onend);
        });
        else speakViaTTS(st, opts, onend);
      });
    });
    return;
  }

  // 中文/其他：预生成文件（若未来生成）→ speechSynthesis
  audioPathFor(st).then((path) => {
    if (path && !MISSING_FILES.has(path)) {
      playAudio(path, rate, onend, () => {
        MISSING_FILES.add(path);
        speakViaTTS(st, opts, onend);
      });
    } else {
      speakViaTTS(st, opts, onend);
    }
  });
}

/** 慢速朗读（听写辅助）：预生成文件用 playbackRate 变速，TTS 用 rate 参数 */
export function speakSlow(text, opts = {}) {
  speak(text, { ...opts, rate: 0.6 });
}

/** 朗读中文 */
export function speakZh(text, opts = {}) {
  speak(text, { ...opts, lang: "zh-CN", rate: 0.9 });
}

export function stopSpeak() {
  if (typeof window === "undefined") return;
  if (hasTTS()) {
    try {
      window.speechSynthesis.cancel();
    } catch {}
  }
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio = null;
    } catch {}
  }
  pendingPlay = [];
}