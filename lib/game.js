// ============================================================
// lib/game.js —— 游戏化引擎（XP/金币/宠物/宝箱/徽章）
// ------------------------------------------------------------
// 状态存 localStorage（key = lexirise:game），随账号同步（见 lib/sync.js DATA_KEYS）
// 所有学习行为统一走 game.reward()，在此结算 XP/金币、喂食宠物、触发升级与徽章
// 设计规格：web/docs/gamification-design.md
// ============================================================

import { GAME_KEY, notifyDataChange } from "./memory";
import { sound } from "./sound";

const KEY = GAME_KEY;
const DAILY_XP_CAP = 200;
const DAILY_COIN_CAP = 60;

const DAY = 86400000;

// ---------- 全局奖励反馈（RewardToast 组件订阅） ----------
const toastSubs = new Set();
export function onToast(fn) {
  toastSubs.add(fn);
  return () => toastSubs.delete(fn);
}
function toast(item) {
  toastSubs.forEach((fn) => {
    try {
      fn(item);
    } catch {
      /* ignore */
    }
  });
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function defaults() {
  return {
    xp: 0,
    coins: 0,
    pet: { name: "跃跃", hunger: 80, mood: "happy", stage: 1, outfit: "default", lastFed: Date.now() },
    skins: ["default"],
    currentSkin: "default",
    badges: [],
    frags: {},
    streakProtect: 0,
    chestLastDate: "",
    daily: { date: todayKey(), xp: 0, coins: 0, tasks: {}, capNotified: false, firstBonus: false },
  };
}

function load() {
  try {
    const v = localStorage.getItem(KEY);
    if (!v) return defaults();
    const g = JSON.parse(v);
    return {
      ...defaults(),
      ...g,
      pet: { ...defaults().pet, ...(g.pet || {}) },
      daily: { ...defaults().daily, ...(g.daily || {}) },
      frags: g.frags || {},
      badges: g.badges || [],
      skins: g.skins || ["default"],
    };
  } catch {
    return defaults();
  }
}

function save(g) {
  try {
    localStorage.setItem(KEY, JSON.stringify(g));
  } catch { /* 隐私模式静默失败 */ }
  notifyDataChange();
}

const subs = new Set();
export function onGameChange(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}
function notify() {
  subs.forEach((fn) => {
    try { fn(); } catch { /* ignore */ }
  });
}

// ---------- 等级与称号 ----------
export function levelOf(xp) {
  let n = 0;
  while (50 * (n + 1) * (n + 1) <= xp) n += 1;
  return n; // Lv.0 ~ 越高越好
}
export function xpForLevel(n) {
  return 50 * n * n; // 达到 Lv.n 所需累计 XP
}
export function xpToNext(xp) {
  const lv = levelOf(xp);
  const cur = xpForLevel(lv);
  const next = xpForLevel(lv + 1);
  return { level: lv, cur, next, need: next - cur, inLevel: xp - cur, pct: Math.round(((xp - cur) / (next - cur)) * 100) };
}

export const TITLES = ["单词新手", "词汇学徒", "单词达人", "词汇高手", "词汇大师", "词汇宗师", "词霸"];

export function titleOf(level) {
  return TITLES[Math.min(level, TITLES.length - 1)];
}

// 宠物形态（随等级进化）
export function petStageOf(level) {
  if (level >= 12) return 3;
  if (level >= 5) return 2;
  return 1;
}
const PET_EMOJI = { 1: "🦊", 2: "🐺", 3: "🦁" };
const STAGE_NAME = { 1: "幼狐", 2: "少年狐", 3: "词霸狐" };
export function petEmoji(stage) {
  return PET_EMOJI[stage] || "🦊";
}
export function petStageName(stage) {
  return STAGE_NAME[stage] || "幼狐";
}

// ---------- 奖励规则（唯一入口） ----------
// kind: correct | review | wrong_cleared | task_done | exam | onboard | combo
const REWARDS = {
  correct: { xp: 2 },
  review: { xp: 3 },
  wrong_cleared: { xp: 10 },
  task_done: { xp: 15, coins: 5 },
  onboard: { xp: 30 },
  combo10: { xp: 5 },
  exam: { xp: 0 }, // 特殊：由 opts.score 决定
};

/** 按日期滚动每日限额（新的一天清零） */
function rollDaily(g) {
  const t = todayKey();
  if (g.daily.date !== t) {
    g.daily = { date: t, xp: 0, coins: 0 };
    // 宠物隔天饥饿衰减
    g.pet.hunger = Math.max(0, g.pet.hunger - 30);
    g.pet.lastFed = Date.now();
    g.pet.mood = g.pet.hunger < 30 ? "hungry" : "normal";
  }
  return g;
}

/**
 * 结算一次学习奖励
 * @param {string} kind 奖励类型
 * @param {object} opts { score?: number }
 * @returns {object} { xp, coins, leveledUp, level, totalXp, totalCoins, capped }
 */
export function reward(kind, opts = {}) {
  const g = rollDaily(load());
  let xpGain = 0;
  let coinGain = 0;

  if (kind === "exam") {
    const s = Number(opts.score) || 0;
    if (s >= 90) xpGain = 40;
    else if (s >= 60) xpGain = 20;
  } else {
    const r = REWARDS[kind];
    if (r) {
      xpGain = r.xp || 0;
      coinGain = r.coins || 0;
    }
  }

  // 每日软上限
  let capped = false;

  // 今日首答双倍：每天第一次 correct/review 奖励 ×2（计入每日上限）
  let firstBonus = false;
  if ((kind === "correct" || kind === "review") && !g.daily.firstBonus && xpGain > 0) {
    xpGain *= 2;
    g.daily.firstBonus = true;
    firstBonus = true;
  }

  if (g.daily.xp >= DAILY_XP_CAP) {
    xpGain = 0;
    capped = true;
  } else if (g.daily.xp + xpGain > DAILY_XP_CAP) {
    xpGain = DAILY_XP_CAP - g.daily.xp;
    capped = true;
  }
  if (g.daily.coins >= DAILY_COIN_CAP) {
    coinGain = 0;
  } else if (g.daily.coins + coinGain > DAILY_COIN_CAP) {
    coinGain = DAILY_COIN_CAP - g.daily.coins;
  }

  const beforeLevel = levelOf(g.xp);
  const beforeStage = petStageOf(beforeLevel);
  const capJustHit = capped && !g.daily.capNotified;
  g.xp += xpGain;
  g.coins += coinGain;
  g.daily.xp += xpGain;
  g.daily.coins += coinGain;

  // 学习行为喂食宠物
  if (xpGain > 0) {
    g.pet.hunger = Math.min(100, g.pet.hunger + 10);
    g.pet.lastFed = Date.now();
  }
  g.pet.mood = g.pet.hunger < 30 ? "hungry" : g.pet.hunger >= 70 ? "happy" : "normal";
  g.pet.stage = petStageOf(levelOf(g.xp));

  // 触达每日 XP 软上限：当天首次提示“今天收获满满”
  if (capJustHit) {
    g.daily.capNotified = true;
    toast({ tone: "cap", icon: "🏡", title: "今天收获满满，明天继续！" });
  }

  save(g);

  const afterLevel = levelOf(g.xp);
  const afterStage = petStageOf(afterLevel);
  // 首答双倍反馈
  if (firstBonus) {
    toast({
      tone: "bonus",
      icon: "✨",
      title: "今日首答加成 ×2！",
      sub: `本次 +${xpGain} XP`,
    });
  }
  if (afterLevel > beforeLevel) {
    // 记录"最近里程碑"（首页左下角号外角标读取）
    g.lastMilestone = {
      type: "level",
      title: `Lv.${afterLevel} · ${titleOf(afterLevel)}`,
      sub: `累计 ${g.xp} XP`,
      at: Date.now(),
      read: false,
    };
    sound.level();
    toast({
      tone: "level",
      icon: "🎉",
      title: `升级啦！Lv.${afterLevel} · ${titleOf(afterLevel)}`,
      sub: `本次 +${xpGain} XP`,
    });
  } else if (afterStage !== beforeStage) {
    g.lastMilestone = {
      type: "evolve",
      title: `跃跃进化成「${petStageName(afterStage)}」`,
      sub: `${petStageName(beforeStage)} → ${petStageName(afterStage)}`,
      beforeStage,
      afterStage,
      at: Date.now(),
      read: false,
    };
    sound.level();
    toast({
      tone: "evolve",
      icon: "🌟",
      title: `跃跃进化成「${petStageName(afterStage)}」啦！`,
      sub: `Lv.${afterLevel} 解锁新形态`,
    });
  }
  if (kind === "exam" && xpGain > 0) {
    toast({
      tone: "exam",
      icon: "📝",
      title: Number(opts.score) >= 90 ? "测验高分 +40 XP！" : "测验通过 +20 XP",
    });
  }
  notify();
  return {
    xp: xpGain,
    coins: coinGain,
    capped,
    firstBonus,
    leveledUp: afterLevel > beforeLevel,
    level: afterLevel,
    title: titleOf(afterLevel),
    totalXp: g.xp,
    totalCoins: g.coins,
    pet: { ...g.pet },
  };
}

// ---------- 每日任务（今日三件事）一次性奖励 ----------
const TASK_LABEL = { review: "复习到期词", wrong: "消灭错词", new: "新词学习" };

/**
 * 结算一次“今日三件事”完成奖励（每件每天只结算一次，幂等）
 * @param {"review"|"wrong"|"new"} name
 * @returns {object|null} { xp, coins, capped, level, title } 已结算过则 null
 */
export function claimTask(name) {
  if (!TASK_LABEL[name]) return null;
  const g = rollDaily(load());
  g.daily.tasks = g.daily.tasks || {};
  if (g.daily.tasks[name]) return null;

  let xpGain = 15;
  let coinGain = 5;
  let capped = false;
  if (g.daily.xp >= DAILY_XP_CAP) {
    xpGain = 0;
    capped = true;
  } else if (g.daily.xp + xpGain > DAILY_XP_CAP) {
    xpGain = DAILY_XP_CAP - g.daily.xp;
    capped = true;
  }
  if (g.daily.coins >= DAILY_COIN_CAP) {
    coinGain = 0;
  } else if (g.daily.coins + coinGain > DAILY_COIN_CAP) {
    coinGain = DAILY_COIN_CAP - g.daily.coins;
  }

  g.xp += xpGain;
  g.coins += coinGain;
  g.daily.xp += xpGain;
  g.daily.coins += coinGain;
  if (xpGain > 0) {
    g.pet.hunger = Math.min(100, g.pet.hunger + 10);
    g.pet.lastFed = Date.now();
  }
  g.pet.mood = g.pet.hunger < 30 ? "hungry" : g.pet.hunger >= 70 ? "happy" : "normal";
  g.pet.stage = petStageOf(levelOf(g.xp));
  g.daily.tasks[name] = true;
  save(g);

  notify();
  toast({
    tone: "task",
    icon: "✅",
    title: `完成：${TASK_LABEL[name]}`,
    sub: capped ? "已达成今日收获上限，先休息一下吧 🏡" : `+${xpGain} XP · +${coinGain} 金币`,
  });
  return {
    xp: xpGain,
    coins: coinGain,
    capped,
    level: levelOf(g.xp),
    title: titleOf(levelOf(g.xp)),
  };
}

// ---------- 宠物 ----------
export function petInfo() {
  const g = rollDaily(load());
  const lv = levelOf(g.xp);
  const stage = petStageOf(lv);
  const hungry = g.pet.hunger < 30;
  const line = hungry
    ? `${g.pet.name} 饿了，背几个词喂喂它吧 🥺`
    : g.pet.mood === "happy"
    ? `${g.pet.name} 今天也很开心～`
    : `${g.pet.name} 在等你一起学习`;
  return {
    name: g.pet.name,
    hunger: g.pet.hunger,
    mood: g.pet.mood,
    stage,
    stageName: petStageName(stage),
    emoji: petEmoji(stage),
    hungry,
    line,
  };
}

export function setPetName(name) {
  const g = load();
  g.pet.name = (name || "跃跃").trim().slice(0, 8) || "跃跃";
  save(g);
  notify();
}

// ---------- 宝箱 ----------
export function chestAvailable() {
  return load().chestLastDate !== todayKey();
}
/** 补签卡（streakProtect）：只由宝箱产出；消费一张用于恢复连击 */
export function useStreakProtect() {
  const g = load();
  if ((g.streakProtect || 0) < 1) return { ok: false, reason: "没有补签卡" };
  g.streakProtect -= 1;
  save(g);
  notify();
  return { ok: true };
}
export function openChest() {
  const g = load();
  if (g.chestLastDate === todayKey()) return null;
  const r = Math.random();
  let reward;
  if (r < 0.6) {
    const coins = 5 + Math.floor(Math.random() * 46); // 5~50
    g.coins += coins;
    reward = { type: "coins", value: coins, label: `${coins} 金币` };
  } else if (r < 0.85) {
    const fragId = "skin_frag";
    g.frags[fragId] = (g.frags[fragId] || 0) + 1;
    reward = { type: "frag", value: g.frags[fragId], label: "皮肤碎片 ×1" };
  } else if (r < 0.95) {
    g.streakProtect = (g.streakProtect || 0) + 1;
    reward = { type: "protect", value: g.streakProtect, label: "补签卡 ×1" };
  } else {
    // 这一档原先是"限定徽章·幸运星"。徽章删了，但宝箱的奖励闭环要保住 ——
    // 改成一份明显更大的金币，让开到这一档仍然是"今天运气不错"。
    const coins = 60 + Math.floor(Math.random() * 41); // 60~100
    g.coins += coins;
    reward = { type: "coins", value: coins, label: coins + " 金币（手气不错）" };
  }
  g.chestLastDate = todayKey();
  save(g);
  notify();
  sound.chest();
  return reward;
}

// ---------- 徽章/成就 ----------
export const ACHIEVEMENTS = [
  { id: "first_study", name: "初次启程", icon: "🌱", desc: "完成第一次学习" },
  { id: "learn_100", name: "百词斩", icon: "💯", desc: "累计学习 100 个词" },
  { id: "learn_500", name: "词库小成", icon: "📚", desc: "累计学习 500 个词" },
  // 「词库全通」改成「一册全通」（2026-10-05）：
  // 原来的「学完全部词库」对初一学生是**一把挂三年的锁** —— 天天看见一个永远不亮的徽章，
  // 那不是激励，是另一种"数字债务"。改成"任意一册学完"，一个学期就够得着，
  // 而且和作品"教材原生"的主张一致：进度是按册走的。
  { id: "book_done", name: "一册全通", icon: "🏆", desc: "把任意一册学完" },
  { id: "master_100", name: "百词精通", icon: "⭐", desc: "掌握 100 个词（熟练度≥6）" },
  { id: "streak_3", name: "坚持三天", icon: "🔥", desc: "连续打卡 3 天" },
  { id: "streak_7", name: "一周连击", icon: "📅", desc: "连续打卡 7 天" },
  { id: "streak_30", name: "月冠", icon: "👑", desc: "连续打卡 30 天" },
  { id: "wrong_zero", name: "错题清零", icon: "🧹", desc: "错题本清零一次" },
  { id: "exam_full", name: "满分达人", icon: "🎯", desc: "单元测验得满分" },
  { id: "evolve_1", name: "初次进化", icon: "🐺", desc: "跃跃进化到少年狐（Lv.5）" },
  { id: "level_10", name: "单词达人", icon: "💪", desc: "达到 Lv.10" },
  // 原来的「幸运星」（在宝箱开出限定徽章）删掉了：
  // 它和学习没有任何关系，是纯粹的抽卡 —— 用户 2026-10-05 定："贴纸没什么实际作用"。
];

/**
 * 根据上下文刷新成就（惰性评估，写入 game.badges 并返回本次新获得的徽章）
 * @param {object} ctx { learnedCount, masteredCount, wrongCount, streak, examBest, totalWords, level }
 * @returns {array} 新获得的徽章
 */
export function refreshAchievements(ctx = {}) {
  const g = load();
  const had = new Set(g.badges);
  const earned = new Set();
  const check = (id, cond) => { if (cond) earned.add(id); };

  // ⚠️ 这里原来写死 1535 —— 既违反数字纪律（"数字只来自算，禁止硬编码"），
  //    也是个真 bug：词库一变，这个判定就悄悄错了。
  //    现在 totalWords 缺失时**不判定**。宁可不解锁，也不瞎解锁。
  const total = Number(ctx.totalWords) || 0;
  check("first_study", (ctx.learnedCount || 0) >= 1);
  check("learn_100", (ctx.learnedCount || 0) >= 100);
  check("learn_500", (ctx.learnedCount || 0) >= 500);
  check("book_done", ctx.bookDone === true);   // 有没有哪一册整册学完（调用方算好传进来）
  check("master_100", (ctx.masteredCount || 0) >= 100);
  check("streak_3", (ctx.streak || 0) >= 3);
  check("streak_7", (ctx.streak || 0) >= 7);
  check("streak_30", (ctx.streak || 0) >= 30);
  check("wrong_zero", ctx.wrongCount === 0 && (ctx.learnedCount || 0) > 0);
  check("exam_full", (ctx.examBest || 0) >= 100);
  check("evolve_1", (ctx.level || 0) >= 5);
  check("level_10", (ctx.level || 0) >= 10);

  let newOnes = [];
  for (const id of earned) {
    if (!had.has(id)) {
      g.badges.push(id);
      newOnes.push(id);
      // 成就奖励金币
      const def = ACHIEVEMENTS.find((a) => a.id === id);
      if (def) g.coins += { first_study: 20, learn_100: 30, learn_500: 50, book_done: 60, master_100: 40, streak_3: 20, streak_7: 30, streak_30: 80, wrong_zero: 20, exam_full: 30, evolve_1: 30, level_10: 50 }[id] || 20;
    }
  }

  save(g);
  if (newOnes.length) notify();
  return newOnes;
}

/** 读取当前状态（含派生字段） */
export function state() {
  const g = load();
  const lv = levelOf(g.xp);
  const xpN = xpToNext(g.xp);
  return {
    ...g,
    level: lv,
    title: titleOf(lv),
    levelPct: xpN.pct,
    xpNeed: xpN.need,
    xpInLevel: xpN.inLevel,
    stage: petStageOf(lv),
  };
}

/** 标记"最近里程碑"已读（首页号外角标收起） */
export function markMilestoneRead() {
  const g = load();
  if (g.lastMilestone) {
    g.lastMilestone.read = true;
    save(g);
    notify();
  }
}

export const game = {
  load,
  state,
  reward,
  claimTask,
  petInfo,
  setPetName,
  chestAvailable,
  openChest,
  useStreakProtect,
  refreshAchievements,
  markMilestoneRead,
  levelOf,
  titleOf,
  xpToNext,
  onToast,
};

export default game;
