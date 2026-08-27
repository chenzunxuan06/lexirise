// ============================================================
// lib/prompts.js —— 各场景 prompt 模板（服务端专用）
// 词跃 LexiRise · 数智化模块
// ------------------------------------------------------------
// 铁律：只依据提供的知识库内容；不编造；输出 JSON。
// 所有生成面向初中生（沪教牛津版，初二水平）。
// ============================================================

const SYS_CORE =
  "你是「词跃」——初中英语词汇学习网站的 AI 讲解员。学生是初中生（沪教牛津版教材）。" +
  "规则：1) 只能依据下方提供的知识库内容作答，资料里没有的信息直接说'知识库里没有'，绝不编造词义、例句或考点；" +
  "2) 语言用简体中文，表达通俗、简短、适合初中生；" +
  "3) 只输出一个 JSON 对象，不要任何其他文字；" +
  "4) 凡是生成英文例句，必须非常简单：只使用初中最基础的词汇（如 I, you, we, he, she, they, the, a, an, like, go, come, school, friend, home, day, time, want, can, have 等），" +
  "句子不超过 8~10 个词，绝不用生僻词或复杂从句（例如 skiing、amount、professional、environment 这类超纲词，除非它本身就是题目/讲解的目标词）；" +
  "知识库例句如果对初中生太难，必须改写为简单句；每条英文例句都要给中文翻译。";

const ENTRY_LINES = (entry) =>
  `词条：${entry.word_en}${entry.phonetic ? " 音标 " + entry.phonetic : ""}${
    entry.pos ? " 词性 " + entry.pos : ""
  } 释义「${entry.definition_zh || ""}」` +
  (entry.affix_hint ? ` 词根词缀「${entry.affix_hint}」` : "") +
  (entry.example_en ? ` 例句「${entry.example_en}」（中文：${entry.example_zh || ""}）` : "") +
  `（来自 ${entry.grade || "?"}年级${entry.semester === 1 ? "上" : entry.semester === 2 ? "下" : "?"}册 Unit ${entry.unit ?? "?"}）`;

function entryBrief(entry) {
  return {
    word: entry.word_en,
    phonetic: entry.phonetic || null,
    pos: entry.pos || null,
    definition_zh: entry.definition_zh || null,
    affix_hint: entry.affix_hint || null,
    example_en: entry.example_en || null,
    example_zh: entry.example_zh || null,
    grade: entry.grade || null,
    semester: entry.semester || null,
    unit: entry.unit ?? null,
  };
}

/** F1 单词讲解 */
export function explainMessages(ctx) {
  const { entry, sameRoot, sameUnit, confusables } = ctx;
  const kb = [
    "【知识库-本词】",
    ENTRY_LINES(entry),
    "【知识库-同根词】" +
      (sameRoot.length
        ? sameRoot.map((w) => ` ${w.word_en}「${w.definition_zh}」${w.affix_hint ? "（" + w.affix_hint + "）" : ""}`).join("；")
        : " 无"),
    "【知识库-关联词（同单元/近形）】" +
      (sameUnit.length
        ? sameUnit.map((w) => ` ${w.word_en}「${w.definition_zh}」`).join("；")
        : " 无"),
    "【知识库-易混词】" +
      (confusables.length
        ? confusables.map((c) => ` ${c.a} / ${c.b}：${c.note}`).join("；")
        : " 无"),
  ].join("\n");

  return [
    { role: "system", content: SYS_CORE },
    {
      role: "user",
      content:
        kb +
        "\n\n请输出关于「" +
        entry.word_en +
        "」的讲解 JSON：\n" +
        '{"explain": "一句话通俗讲解（含本词在本册课本中的核心义项，40~80字）", ' +
        '"memory_tip": "记忆方法（结合提供的词根词缀/音标/联想，30~60字；没有可靠依据就填 null）", ' +
        '"examples": [{"en": "课本难度的英文例句（优先改写知识库例句，让它简单易懂；没有就原创一句用上这个词）", "zh": "中文翻译"}], ' +
        '"confusable": [{"word": "易混词", "note": "一句话说清区别（只在知识库提供了易混词时输出，否则空数组）"}]}\n' +
        "要求：例句不超过 10 个词，必须是初二学生读得懂的简单句；数组长度按需，不要空泛。",
    },
  ];
}

/** F3 错题对比讲解 */
export function contrastMessages(a, b, infoA, infoB) {
  const parts = ["【知识库-正确词】", infoA, "【知识库-选错词】", infoB].join("\n");
  return [
    { role: "system", content: SYS_CORE },
    {
      role: "user",
      content:
        parts +
        "\n\n学生答错：" +
        b +
        "（错误选项）≠ " +
        a +
        "（正确答案）。请输出 JSON：\n" +
        '{"why": "为什么正确答案是 a（30~60字，扣住词义/搭配/语境）", ' +
        '"wrong_point": "选 b 错在哪里（20~50字，可能两者确实易混，也可能语境不搭）", ' +
        '"tip": "一条记忆诀窍帮助区分（20~50字，没有可靠依据就填 null）"}\n' +
        "如果知识库没有 b 的词条，wrong_point 就基于 b 的拼写/词义常识性说明（b 原词会提供）。",
    },
  ];
}

/** F2 我的词表批量补全 */
export function enrichMessages(items) {
  const list = items
    .map(
      (it, i) =>
        `${i + 1}. ${it.word_en}${it.phonetic ? " 音标" + it.phonetic : ""}${
          it.pos ? " 词性" + it.pos : ""
        } 释义「${it.definition_zh}」`
    )
    .join("\n");
  return [
    { role: "system", content: SYS_CORE },
    {
      role: "user",
      content:
        "以下是学生'我的词表'里待补全的词（只列词形、词性、中文释义，知识库可能没有这些词条）：\n" +
        list +
        "\n\n请为每个词输出 JSON：\n" +
        '{"results": [{"word": "原词原样", "phonetic_hint": "音标（IPA，如 /lɜːn/；无法确定就填 null）", ' +
        '"memory_tip": "记忆方法 20~50字（基于词形/词性/中文释义联想，不要编造不存在的词根；想不出填 null）", ' +
        '"example_en": "初二难度的英文例句（≤10词，原创或基于释义）", "example_zh": "中文翻译"}]}\n' +
        "results 必须与输入的词一一对应，不许漏词、不许改名。",
    },
  ];
}

/** F5 单元复习包：引导语 + 重点词例句 */
export function unitSummaryMessages(unitLabel, entries, phrases, confusablePairs) {
  const wordLines = entries
    .slice(0, 15)
    .map((w) => ` ${w.word_en}${w.phonetic ? "（" + w.phonetic + "）" : ""} ${w.pos || ""}「${w.definition_zh}」`)
    .join("\n");
  const phraseLines = phrases
    .map((p) => ` ${p.word_en}「${p.definition_zh}」`)
    .join("\n");
  const confLines = confusablePairs
    .map((c) => ` ${c.a} / ${c.b}：${c.note}`)
    .join("\n");
  return [
    { role: "system", content: SYS_CORE },
    {
      role: "user",
      content:
        `【单元】${unitLabel}\n【无单元主题信息，不要编造单元标题】\n【本单元重点词】\n${wordLines}\n` +
        (phraseLines ? `【本单元短语】\n${phraseLines}\n` : "") +
        (confLines ? `【本单元易混考点】\n${confLines}\n` : "") +
        "\n请输出 JSON：\n" +
        '{"intro": "本单元复习建议（2~3句，提醒学生重点攻克哪些类型）", ' +
        '"key_words": [{"word": "单词原样（只从前15个重点词里选，全部输出）", ' +
        '"sentence_en": "用该词造的初二难度短句（≤10词，可参考知识库例句改写）", "sentence_zh": "中文翻译"}]}\n' +
        "key_words 顺序与输入一致，不许漏词。",
    },
  ];
}

/** F4 每日练习生成（rolePlan: 每题的题型指派表，AI 不得自行更换） */
export function practiceMessages(pickEntries, distractorPool, unitLabel, gradeLabel, rolePlan) {
  const TYPE_LABEL = {
    fill: "选词填空（四选一）",
    "fill-in": "首字母填空",
    recall: "看释义拼词",
    transform: "词形变化",
  };
  const TYPE_RULE = {
    fill:
      "q=带 ____ 的英文短句；options=4 个英文选项（含 answer，干扰项从备选池选，词性/语法要放得进句子）；q_zh=中文翻译；answer=标准答案；explain=一句话解析",
    "fill-in":
      "q=带 首字母+____ 的英文短句（如 The box is e____.）；q_zh=中文翻译；answer=完整单词（小写）；explain=一句话解析；不给选项",
    recall:
      "q=中文释义 + 首字母提示（如「打败（首字母 b）」）；answer=完整单词（小写）；explain=一句话解析；不给选项",
    transform:
      "q=原词与要求（如 protect → (n.) ）；answer=变形结果，必须是一个单词、小写，只允许 -tion/-ment/-ful/-ly/-ness/-y/-er/-or/-ing/-ed/un-/re- 等确定派生的常见后缀，禁止含空格的短语；explain=一句话解析；不给选项",
  };
  const pick = pickEntries
    .map(
      (w, i) =>
        `${i + 1}. ${w.word_en}${w.phonetic ? "（" + w.phonetic + "）" : ""} ${w.pos || ""}「${w.definition_zh}」` +
        (w.example_en ? ` 例句「${w.example_en}」(${w.example_zh || ""})` : "") +
        (rolePlan && rolePlan[i] ? `【指派题型：${TYPE_LABEL[rolePlan[i]] || "看释义拼词"}】` : "")
    )
    .join("\n");
  const dists = distractorPool
    .map((w) => ` ${w.word_en}「${w.definition_zh}」`)
    .join("\n");
  const rules = (rolePlan || [])
    .map((t, i) => `第 ${i + 1} 题（目标词 ${pickEntries[i] ? pickEntries[i].word_en : "?"}）：${TYPE_RULE[t] || TYPE_RULE.recall}`)
    .join("\n");
  return [
    { role: "system", content: SYS_CORE },
    {
      role: "user",
      content:
        `【学生年级】${gradeLabel || "初中"}（沪教牛津版教材）\n` +
        `【今日练习目标词（按序编号，每题以其中一个为目标；题型已由系统指派，严格按指派出题，不许换题型）】\n${pick}\n` +
        `【备选干扰词池（fill 的选项从这里选）】\n${dists || " 无"}\n` +
        (unitLabel ? `【关联单元】${unitLabel}\n` : "") +
        "\n每道题的出题要求如下（顺序与目标词一一对应）：\n" +
        rules +
        "\n\n请输出 JSON：\n" +
        '{"questions": [{"type": "fill（按指派填对应值）", "q": "题目文本", "q_zh": "中文翻译", "options": ["四选一选项；fill 必填，其他题型为 null"], "answer": "标准答案", "explain": "一句话解析"}]}\n' +
        "硬性要求：\n" +
        "1. questions 数量 = 目标词数量，顺序与指派表一致；\n" +
        "2. 英文 q 必须符合【学生年级】水平——只允许出现 目标词/选项词 + 最基础的常用词（I/you/we/the/a/like/go/school/friend/home 等），" +
        "**禁止出现 skiing/amount/professional/necessary 这类超纲词**，句子 ≤ 8 个词；\n" +
        "3. fill 与 fill-in 必须给 q_zh（中文翻译）；\n" +
        "4. answer 一律小写；fill 的 options 必须包含 answer。",
    },
  ];
}

/** 给路由层复用：词条简报 */
export { entryBrief, ENTRY_LINES };

export default { explainMessages, contrastMessages, enrichMessages, unitSummaryMessages, practiceMessages };