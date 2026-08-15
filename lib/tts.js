// lib/tts.js —— 浏览器内置语音朗读（无需音频文件），全站复用
// speak(text, { lang, rate, onend })

export function speak(text, opts = {}) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  if (!text) return;
  const { lang = "en-US", rate = 0.95, onend } = opts;
  const u = new SpeechSynthesisUtterance(String(text));
  u.lang = lang;
  u.rate = rate;
  if (typeof onend === "function") u.onend = onend;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

/** 慢速朗读（听写辅助） */
export function speakSlow(text) {
  speak(text, { rate: 0.6 });
}

/** 朗读中文 */
export function speakZh(text) {
  speak(text, { lang: "zh-CN", rate: 0.9 });
}

export function stopSpeak() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
}
