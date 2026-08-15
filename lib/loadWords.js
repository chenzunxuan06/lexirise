// 客户端加载本地词库数据层（words.json / affixes.json）
export async function loadWords() {
  const res = await fetch("/words.json");
  if (!res.ok) throw new Error("加载 words.json 失败: " + res.status);
  return res.json();
}

export async function loadAffixes() {
  const res = await fetch("/affixes.json");
  if (!res.ok) throw new Error("加载 affixes.json 失败: " + res.status);
  return res.json();
}

/** 按 id 快速查词 */
export function wordById(words, id) {
  return words.find((w) => w.id === id);
}

/** 每日一词：按日期确定性取词 */
export function wordOfTheDay(words) {
  if (!words || !words.length) return null;
  const d = new Date();
  const dayNum =
    d.getFullYear() * 372 + (d.getMonth() + 1) * 31 + d.getDate();
  return words[dayNum % words.length];
}
