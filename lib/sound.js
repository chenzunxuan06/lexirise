// ============================================================
// lib/sound.js —— 轻量游戏音效（WebAudio 合成，零外部资源）
// 答对 / 答错 / 连对 / 开箱 / 升级；受 settings.sound 开关控制
// 首次调用在用户手势后创建 AudioContext（浏览器自动播放策略）
// ============================================================

import { readSettings } from "./settings";

let ctx = null;

function sndEnabled() {
  try {
    return readSettings().sound !== false;
  } catch {
    return true;
  }
}

function ensure() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(freq, delay, dur, type = "sine", vol = 0.14) {
  const c = ensure();
  if (!c) return;
  try {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    const t0 = c.currentTime + delay;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(c.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  } catch {
    /* ignore */
  }
}

export const sound = {
  ok() {
    if (!sndEnabled()) return;
    tone(660, 0, 0.15, "sine");
    tone(880, 0.07, 0.2, "sine", 0.11);
  },
  bad() {
    if (!sndEnabled()) return;
    tone(233, 0, 0.24, "triangle", 0.13);
  },
  combo(n) {
    if (!sndEnabled()) return;
    [523, 659, 784, 1046].slice(0, Math.max(1, Math.min(n, 4))).forEach((f, i) =>
      tone(f, i * 0.06, 0.18, "sine", 0.12)
    );
  },
  chest() {
    if (!sndEnabled()) return;
    [660, 880, 1046, 1318].forEach((f, i) => tone(f, i * 0.08, 0.24, "sine", 0.12));
  },
  level() {
    if (!sndEnabled()) return;
    [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, i * 0.09, 0.28, "sine", 0.12));
  },
};

export default sound;