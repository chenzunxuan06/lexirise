// ============================================================
// lib/prompts.js —— 各场景 prompt 模板（服务端专用）
// 词跃 LexiRise · 数智化模块
// ------------------------------------------------------------
// 铁律：只依据提供的知识库内容；不编造；输出 JSON。
// 所有生成面向初中生（沪教牛津版，初二水平）。
// ============================================================

const SYS_CORE =
  "你是「词跃」——初中英语词汇学习网站的 AI 讲解员。学生是初中生（沪教牛津版教材，初二水平）。" +
  "规则：1) 只能依据下方提供的知识库内容作答，资料里没有的信息直接说'知识库里没有'，绝不编造词义、例句或考点；" +
  "2) 语言用简体中文，表达通俗、简短、适合初中生；" +
  "3) 只输出一个 JSON 对象，不要任何其他文字。";

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

/** F4 每日练习生成 */
export function practiceMessages(pickEntries, distractorPool, unitLabel) {
  const pick = pickEntries
    .map((w, i) => `${i + 1}. ${w.word_en}${w.phonetic ? "（" + w.phonetic + "）" : ""} ${w.pos || ""}「${w.definition_zh}」` + (w.example_en ? ` 例句「${w.example_en}」(${w.example_zh || ""})` : ""))
    .join("\n");
  const dists = distractorPool
    .map((w) => ` ${w.word_en}「${w.definition_zh}」`)
    .join("\n");
  return [
    { role: "system", content: SYS_CORE },
    {
      role: "user",
      content:
        `【今日练习目标词（按序编号，每题以其中一个为目标）】\n${pick}\n` +
        `【备选干扰词池（填空选项从这里选）】\n${dists || " 无"}\n` +
        (unitLabel ? `【关联单元】${unitLabel}\n` : "") +
        "\n请为这组目标词生成练习题 JSON（题目数=目标词数，每词一题，按顺序）：\n" +
        '{"questions": [{"type": "fill", "q": "题目文本", "options": ["四选一选项（fill 必填，其他题型为 null）"], "answer": "标准答案", "explain": "一句话解析"}]}\n' +
        "题型 type 只允许三个值：fill（选词填空）、recall（看释义拼单词）、transform（词形变化）。" +
        "fill=英文短句挖空+4个英文选项（干扰项从备选池选，答案词性/语法得放得进去；无法保证唯一就改为 recall）；" +
        "recall=看中文释义拼单词（q 给释义+首字母提示，如'环境，保护____'不要给完整词），answer 是单词本身；" +
        "transform=给原词与要求（如 protect → (n.) ），answer 是变形结果（只出 -tion/-ment/-ful/-ly/-ing/-ed/-er/-or/-y/-ness/un- 等常见派生，必须唯一确定）。" +
        "每题的 q 都是初二可读懂的完整短句；answer 全部小写；fill 的 options 四选一且包含 answer。",
    },
  ];
}

/** 给路由层复用：词条简报 */
export { entryBrief, ENTRY_LINES };

export default { explainMessages, contrastMessages, enrichMessages, unitSummaryMessages, practiceMessages };