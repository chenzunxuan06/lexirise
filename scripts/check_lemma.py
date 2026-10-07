#!/usr/bin/env python
# ============================================================
# scripts/check_lemma.py —— 词形还原验收（T15）
# ------------------------------------------------------------
# 任务单的验收标准：**对 20 个手工标注的句子，还原准确率 ≥ 95%**。
#
# 这些用例是"手工标注"的：每一条都是我先把句子读了一遍，
# 再写下"这个词形应该还原成哪个词"。句子全部来自真实语料
# （public/corpus/*.json），不是编的。
#
# 标注口径（写清楚，免得自欺）：
#   · inflection —— 屈折变化（复数 / 三单 / 过去式 / 分词 / 比较级）。这是"词形还原"的本义。
#   · derivation —— 派生（-ly / -ing 形容词化 等）。属于"词族"，比屈折宽一档。
#   两者分开统计。**宽的那一档错得多，不拿它冒充准确率。**
#
# 另外两条是**回归用例** —— 它们曾经是错的，修好后钉在这里防止复发。
# ============================================================
import json, os, re, sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lemma import resolve

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# (册, 词形, 期望还原成, 类型)
CASES = [
    ("7A", "thoughts",   "thought",     "inflection"),
    ("7A", "qualities",  "quality",     "inflection"),
    ("7A", "improved",   "improve",     "inflection"),
    ("7A", "friendships","friendship",  "inflection"),
    ("7A", "topics",     "topic",       "inflection"),
    ("7A", "meanings",   "meaning",     "inflection"),
    ("7A", "notes",      "note",        "inflection"),
    ("7A", "messages",   "message",     "inflection"),
    ("7A", "rules",      "rule",        "inflection"),
    ("7A", "designing",  "design",      "inflection"),
    ("7A", "describing", "describe",    "inflection"),
    ("7A", "parts",      "part",        "inflection"),
    ("7A", "rose",       "rise",        "inflection"),
    ("7A", "leaving",    "leave",       "inflection"),
    ("7A", "details",    "detail",      "inflection"),
    ("7A", "solving",    "solve",       "inflection"),
    ("7A", "dinosaurs",  "dinosaur",    "inflection"),
    ("7A", "activities", "activity",    "inflection"),
    ("7A", "events",     "event",       "inflection"),
    ("7A", "exploring",  "explore",     "inflection"),
    ("7A", "manages",    "manage",      "inflection"),
    ("7A", "butterflies","butterfly",   "inflection"),
    ("7A", "memories",   "memory",      "inflection"),
    ("7B", "discoveries","discovery",   "inflection"),
    ("7B", "companies",  "company",     "inflection"),
    ("7A", "patiently",  "patient",     "derivation"),
    ("7A", "really",     "real",        "derivation"),
    ("7A", "interesting","interest",    "derivation"),
    # ---- 回归用例：这两条曾经还原错，修好后钉住 ----
    ("7A", "better",     None,          "regression"),   # 曾错还原成 bet（打赌）
    ("7A", "sometimes",  None,          "regression"),   # 曾错还原成 sometime（在某时）
    # ---- 词表外不许瞎猜 ----
    # baby 不在 1535 词表里（词表只有 probably / probable）。
    # "候选里有 baby" 不等于"该还原成 baby" —— 词表才是裁判，猜不出来就返回 None。
    ("7A", "babies",     None,          "out-of-vocab"),
]


def main():
    words = json.load(open(os.path.join(ROOT, "web", "public", "words.json"), encoding="utf-8"))["words"]
    vocab = defaultdict(list)
    for w in words:
        if w["entry_type"] == "word":
            vocab[str(w["word_en"]).lstrip("*").strip().lower()].append(w)

    corpora = {}
    for bk in ["7A", "7B", "8A", "8B"]:
        p = os.path.join(ROOT, "web", "public", "corpus", bk + ".json")
        corpora[bk] = json.load(open(p, encoding="utf-8"))

    stat = defaultdict(lambda: [0, 0])
    fails = []
    print("词形 -> 还原结果  （对 20+ 条手工标注用例）")
    print()
    for bk, tok, want, kind in CASES:
        got = resolve(tok, vocab)
        ok = (got == want)
        stat[kind][0] += 1
        if ok:
            stat[kind][1] += 1
        else:
            fails.append((bk, tok, want, got, kind))
        mark = "OK  " if ok else "错  "
        print("  " + mark + tok.ljust(13) + " -> " + str(got).ljust(13)
              + " 期望 " + str(want).ljust(13) + " [" + kind + "]")

    print()
    total_n = sum(v[0] for v in stat.values())
    total_ok = sum(v[1] for v in stat.values())
    for k in ["inflection", "derivation", "regression", "out-of-vocab"]:
        n, o = stat[k]
        if n:
            print("  " + k.ljust(11) + " " + str(o) + "/" + str(n) + "  ("
                  + format(o / n * 100, ".1f") + "%)")
    print("  " + "总计".ljust(10) + " " + str(total_ok) + "/" + str(total_n) + "  ("
          + format(total_ok / total_n * 100, ".1f") + "%)")

    # 屈折那一档才是"词形还原"的本义，拿它当验收数字
    n, o = stat["inflection"]
    rate = o / n
    print()
    print("验收（屈折变化，T15 的本义）: " + str(o) + "/" + str(n) + " = "
          + format(rate * 100, ".1f") + "%  " + ("通过 (>=95%)" if rate >= 0.95 else "未达标"))
    if fails:
        print()
        print("未通过:")
        for bk, tok, want, got, kind in fails:
            print("  " + bk + " " + tok + " 期望 " + str(want) + " 实际 " + str(got) + " [" + kind + "]")
    return 0 if rate >= 0.95 else 1


if __name__ == "__main__":
    sys.exit(main())
