// ============================================================
// lib/builtin-kb.js —— 内置知识（对全站用户生效，开发期一次编写）
// 词跃 LexiRise · 数智化模块
// ------------------------------------------------------------
// 易混词对表：中考/教材高频辨析点。a/b 为词或短语（与词库 word_en
// 严格匹配，任何一边在词库命中即参与该词讲解的检索）。
// note 为考点一句话，AI 会基于它展开讲解，不另行编造事实。
// ============================================================

export const CONFUSABLES = [
  { a: "result in", b: "as a result of", note: "result in 是动词短语\"导致\"；as a result of 是介词短语\"由于\"，后接名词" },
  { a: "guard", b: "guide", note: "guard 守卫、卫兵、防范（guard against 提防）；guide 向导、指引" },
  { a: "spend", b: "cost", note: "spend 主语是人（spend ... on sth / (in) doing）；cost 主语是物（sth costs ...）" },
  { a: "pay", b: "take", note: "pay 人付款（pay for）；take 常用 it takes sb ... to do（花费时间）" },
  { a: "borrow", b: "lend", note: "borrow 借入（borrow ... from）；lend 借出（lend ... to）" },
  { a: "bring", b: "take", note: "bring 带来（朝说话者方向）；take 带走（远离说话者方向）" },
  { a: "carry", b: "fetch", note: "carry 搬运、携带（无方向）；fetch 去取来" },
  { a: "hear", b: "listen", note: "hear 听见（结果，不一定主动）；listen 听（动作，listen to）" },
  { a: "see", b: "look", note: "see 看见（结果）；look 看（动作，look at）" },
  { a: "watch", b: "read", note: "watch 观看（比赛/电视）；read 阅读（书/报）" },
  { a: "say", b: "speak", note: "say 说内容（say sth）；speak 说语言/发言（speak English）" },
  { a: "talk", b: "tell", note: "talk 交谈（talk to/with/about）；tell 告诉（tell sb sth）" },
  { a: "arrive", b: "reach", note: "arrive 不及物（arrive in/at）；reach 及物（reach sp.）" },
  { a: "get to", b: "reach", note: "get to + 地点=到达；reach 直接加地点" },
  { a: "join", b: "take part in", note: "join 加入组织/人群；take part in 参加活动" },
  { a: "attend", b: "join", note: "attend 出席（会议/学校）；join 加入（团体）" },
  { a: "look for", b: "find", note: "look for 寻找（过程）；find 找到（结果）" },
  { a: "receive", b: "accept", note: "receive 收到（客观）；accept 接受（主观同意）" },
  { a: "raise", b: "rise", note: "raise 及物（举起/筹集，raise money）；rise 不及物（上升，太阳升起）" },
  { a: "win", b: "beat", note: "win 赢（比赛/奖品，win the game）；beat 打败（对手，beat sb）" },
  { a: "used to do", b: "be used to doing", note: "used to do 过去常常；be used to doing 习惯于（to 是介词）" },
  { a: "a few", b: "few", note: "a few 少数几个（肯定）；few 几乎没有（否定），修饰可数名词" },
  { a: "a little", b: "little", note: "a little 一点儿（肯定）；little 几乎没有（否定），修饰不可数名词" },
  { a: "some time", b: "sometimes", note: "some time 一段时间；sometimes 有时（频率副词）" },
  { a: "sometime", b: "sometimes", note: "sometime 某时；sometimes 有时" },
  { a: "another", b: "other", note: "another 另一个（三者以上中的又一个）；other 其他的（后接复数）" },
  { a: "others", b: "the other", note: "others 其他的人/物（泛指）；the other 两者中的另一个" },
  { a: "both", b: "either", note: "both 两者都（+复数动词）；either 两者之一（+单数动词）" },
  { a: "between", b: "among", note: "between 两者之间；among 三者及以上之中" },
  { a: "across", b: "through", note: "across 横穿（表面，go across the road）；through 穿过（内部，through the forest）" },
  { a: "dress", b: "wear", note: "dress 给穿衣（dress sb / dress oneself）；wear 穿着（状态）" },
  { a: "put on", b: "wear", note: "put on 穿上（动作）；wear 穿着（状态）" },
  { a: "hope", b: "wish", note: "hope 可实现（hope to do / hope that）；wish 愿望/难以实现（wish sb to do 也可）" },
  { a: "except", b: "besides", note: "except 除...之外（排除）；besides 除...之外还（包含）" },
  { a: "real", b: "true", note: "real 真实的（非假货）；true 符合事实的（非谎言，come true 实现）" },
  { a: "interesting", b: "interested", note: "interesting 令人感兴趣（事物）；interested 感到有兴趣（人，be interested in）" },
  { a: "exciting", b: "excited", note: "exciting 令人兴奋（事物）；excited 感到兴奋（人）" },
  { a: "already", b: "yet", note: "already 已经（肯定句）；yet 还（疑问/否定，句尾）" },
  { a: "still", b: "yet", note: "still 仍然（肯定/疑问，句中）；yet 尚、还（否定/疑问）" },
  { a: "have been to", b: "have gone to", note: "have been to 去过（已回来）；have gone to 去了（未回来）" },
  { a: "stop to do", b: "stop doing", note: "stop to do 停下来去做另一件事；stop doing 停止正在做的事" },
  { a: "remember to do", b: "remember doing", note: "remember to do 记得去做（未做）；remember doing 记得做过（已做）" },
  { a: "noise", b: "sound", note: "noise 噪音（难听）；sound 声音（泛指）" },
  { a: "voice", b: "sound", note: "voice 嗓音（人声）；sound 声音（一切声响）" },
  { a: "problem", b: "question", note: "problem 难题（有待解决，solve the problem）；question 问题（有待回答，answer the question）" },
  { a: "work", b: "job", note: "work 工作（不可数）；job 职业/岗位（可数）" },
  { a: "journey", b: "travel", note: "journey 旅程（一次具体行程）；travel 旅行（泛指，不可数）" },
  { a: "trip", b: "journey", note: "trip 短途出行（go on a trip）；journey 较长旅程" },
  { a: "so", b: "such", note: "so + 形容词/副词（so beautiful）；such + 名词短语（such a beautiful girl）" },
  { a: "too", b: "very", note: "too 太（超出程度，too ... to 太...而不能）；very 很（程度加强）" },
  { a: "agree with", b: "agree to", note: "agree with 同意某人/观点；agree to 同意某项计划/建议" },
];

/** 根据单词（词库 word_en，转小写）找命中的易混对 */
export function confusablesFor(wordEn) {
  const w = String(wordEn || "").trim().toLowerCase();
  if (!w) return [];
  return CONFUSABLES.filter(
    (c) => String(c.a).toLowerCase() === w || String(c.b).toLowerCase() === w
  );
}

export default { CONFUSABLES, confusablesFor };