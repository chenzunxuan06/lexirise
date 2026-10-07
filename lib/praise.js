// ============================================================
// lib/praise.js —— 收工那一刻的一句话（2026-10-05 与用户定的设计）
// ------------------------------------------------------------
// 用户原话（这次的设计依据，别改跑偏）：
//   「就是这些真棒，可以是不同的夸赞话语，你可以叫他的名字 ——
//     你今天很厉害了、你今天做的好快呀，是不同的快乐的情绪语句」
//   「夸赞是最后一次收工吧」
//   「换掉『你已经超越了多少人』，改成『超越过去的自己』—— 这个是对的」
//
// 四条纪律：
//   ① **每次收工都给，但话不一样** —— 同一句反复出现就不值钱了
//   ② **带名字**（sync.user.nickname；没登录就为空的版本）
//   ③ **夸赞只是半句，后面必须跟一件可核实的事实** ——
//      项目自己的展示纪律写着「数字是优点，字是缺点」，
//      空的「真棒」没有分量；夸过程比夸人有用。
//   ④ **参照物是昨天的自己，不是别人** —— 排行榜对上面的人是糖、对下面的人是刀，
//      而且现在真实用户还很少，榜单要么是空的要么得造假。
// ============================================================

const ROTATE_KEY = "lexirise:praise-i";

/** 内存里的兜底计数器：localStorage 不可用时也要能轮换 */
let memIndex = 0;

/**
 * 取一个会自增的轮换下标，保证连着两次收工不重样。
 *
 * ⚠️ 不能只依赖 localStorage：隐私模式、SSR、Node 测试里它都不在，
 *    那样每次都会返回 0 —— 于是"每次收工话不一样"直接失效，永远同一句。
 *    （这个 bug 是被 tests/praise.test.mjs 抓出来的。）
 */
function nextIndex(len) {
  if (len <= 0) return 0;
  let i = memIndex;
  try {
    i = Number(localStorage.getItem(ROTATE_KEY) || memIndex) || 0;
    localStorage.setItem(ROTATE_KEY, String((i + 1) % 100000));
  } catch {
    /* 隐私模式 / 无 localStorage：用内存计数，照样轮换 */
  }
  memIndex = i + 1;
  return i % len;
}

/** 把 {name} 填进去；没名字时顺手清掉多余的空格和逗号 */
function fill(s, name) {
  if (!name) {
    return s.replace(/，?\{name\}，?/g, "").replace(/\s{2,}/g, " ").replace(/^[，、]\s*/, "").trim();
  }
  return s.replace(/\{name\}/g, name);
}

// ---- 按"这一轮长什么样"分组，不是按分数高低 ----
// 用"这一轮的样子"而不是"你考了多少分"，是为了不把收工变成一个评分现场。
const HELLO = {
  // 干净利落：这一轮没错词
  clean: [
    "真棒，{name}",
    "{name}，这一轮干干净净",
    "{name}，你今天很厉害了",
    "一个都没错，{name}",
    "{name}，这波稳",
  ],
  // 啃硬骨头：错得不少，但确实做了
  tough: [
    "{name}，今天这几个确实硬",
    "啃下来就是你的了，{name}",
    "{name}，错的那几个明天会好一些",
    "难的都让你碰上了，{name}",
    "{name}，这几个词下次就认你了",
  ],
  // 做得多
  big: [
    "{name}，你今天做得好快呀",
    "{name}，今天这一轮量不小",
    "一口气做了这么多，{name}",
  ],
  // 隔了几天才回来
  back: [
    "{name}，你回来啦",
    "好久不见，{name}",
    "{name}，接着上次的往下走",
  ],
  // 今天的头一轮
  first: [
    "{name}，今天开了个头",
    "开始了，{name}",
    "{name}，慢慢来",
  ],
  // 纸间专注结束（2026-10-05 加）
  // 注意：这一组**不许用"答对/错题本"那套说法** —— 纸间记的是屏幕外的事，
  // 和答题是两回事。混用会让两处都变得不可信。
  focus: [
    "记下了，{name}",
    "{name}，这一段时间是你的",
    "这段时间只属于你",
    "{name}，收好了",
    "你自己安排的，{name}",
  ],
  // 其他
  plain: [
    "{name}，今天也来啦",
    "做完了，{name}",
    "{name}，收工",
    "{name}，辛苦了",
  ],
};

/**
 * 造一句收工话。
 *
 * @param {object} o
 * @param {string} [o.name]          学生昵称（没有就不带名字）
 * @param {"judge"|"self"} [o.kind]  judge = 判定对错（训练/测验）；self = 自评（复习/背诵）
 * @param {number} [o.total]         这一轮做了几题
 * @param {number} [o.correct]       对了几个（self 模式传"记得住"的个数）
 * @param {number} [o.cleared]       消灭错词个数
 * @param {number} [o.streak]        连续打卡天数
 * @param {number} [o.daysAway]      距上次学习隔了几天（>=3 才算"回来了"）
 * @param {number} [o.firstToday]    今天是不是第一轮
 * @param {number} [o.yesterday]     昨天做了几题（用来"超越过去的自己"）
 * @param {number} [o.todayTotal]    今天累计做了几题（含这一轮）
 * @returns {{hello:string, fact:string}}
 */
export function praiseFor(o = {}) {
  const name = (o.name || "").trim();
  const total = Math.max(0, Number(o.total) || 0);
  const correct = Math.max(0, Number(o.correct) || 0);
  const cleared = Math.max(0, Number(o.cleared) || 0);
  const streak = Math.max(0, Number(o.streak) || 0);
  const daysAway = Math.max(0, Number(o.daysAway) || 0);
  const rate = total > 0 ? correct / total : 0;

  // ---- 选哪一组 ----
  let pool;
  if (daysAway >= 3) pool = HELLO.back;
  else if (total > 0 && correct === total) pool = HELLO.clean;
  else if (total > 0 && rate <= 0.5) pool = HELLO.tough;
  else if (total >= 25) pool = HELLO.big;
  else if (o.firstToday) pool = HELLO.first;
  else pool = HELLO.plain;

  const hello = fill(pool[nextIndex(pool.length)], name);

  // ---- 后面那半句：可核实的事实，参照物是昨天的自己 ----
  let fact = "";
  if (cleared > 0) {
    fact = "有 " + cleared + " 个词连对 2 次，从错题本搬走了";
  } else if (total > 0 && correct === total) {
    fact = "这 " + total + " 个，一个没错";
  } else if (total > 0 && rate >= 0.8) {
    fact = "这 " + total + " 个里对了 " + correct + " 个";
  } else if (o.yesterday > 0 && o.todayTotal > o.yesterday) {
    fact = "昨天做了 " + o.yesterday + " 个，今天已经 " + o.todayTotal + " 个了";
  } else if (streak >= 2) {
    fact = "连续 " + streak + " 天没断";
  } else if (total > 0) {
    fact = "这一轮做了 " + total + " 个";
  }
  return { hello, fact };
}

/**
 * 纸间专注结束时的那一声。
 *
 * 和 praiseFor 分开，是因为**两件事不一样**：
 *   答题收工说的是"你答得怎么样"，纸间说的是"这段时间你做了什么"。
 * 混用一套话会让两处都变得不可信。
 *
 * @param {object} o
 * @param {string} [o.name]
 * @param {number} o.minutes      这一段待了多少分钟
 * @param {number} [o.todayMs]    今天在纸间累计多少毫秒（用来给"今天一共"那句）
 * @returns {{hello:string, fact:string}}
 */
export function focusPraiseFor(o = {}) {
  const name = (o.name || "").trim();
  const minutes = Math.max(0, Math.round(Number(o.minutes) || 0));
  const hello = fill(HELLO.focus[nextIndex(HELLO.focus.length)], name);

  // ⚠️ 不足 1 分钟也要给一句。
  //    第一版是 minutes > 0 才写事实，结果几十秒的时段收工屏上只有"记下了"、
  //    后面空着 —— 那是被验收脚本抓出来的（tests/verify-focus-ui.mjs）。
  //    短时段也得有个交代，否则学生以为自己白坐了。
  let fact = "";
  const todayMin = Math.round((Number(o.todayMs) || 0) / 60000);
  if (minutes >= 1) {
    fact = "在纸间待了 " + minutes + " 分钟";
    if (todayMin > minutes) fact += " · 今天一共 " + todayMin + " 分钟";
  } else {
    fact = "在纸间坐了不到 1 分钟";
  }
  return { hello, fact };
}

export default { praiseFor, focusPraiseFor };
