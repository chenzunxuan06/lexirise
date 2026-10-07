# -*- coding: utf-8 -*-
"""coverage_report.py —— 课本出处覆盖率：多少词有出处，没有的缺在哪

数据来源**只有 public/corpus/*.json**（已经发布出去的语料），不读 PDF。

【三档口径，2026-10-07 起】
  A 有原句        —— byWordForm / byWordAny 里有它（界面显示「课本原句 + 出处」）
  B 仅词表出处    —— 只在词表/词框里出现过（byVocab；界面标「课本词汇表 + 页码」）
  C 真缺口        —— 两样都没有

为什么分三档：碎片拼接的假句子被挡掉之后，只有 A 会掉一截；
但那些词**并不是没有出处**，只是出处性质不同（词表 ≠ 句子）。
把 B 算进来，覆盖率才反映「这个词在课本里能不能被核实」，
同时**界面不会拿一句假句子冒充课文原句**。
"""
import json, os, random
from collections import Counter

ROOT = r"E:\初二"
CORPUS = os.path.join(ROOT, "web", "public", "corpus")
words = json.load(open(os.path.join(ROOT, "web", "public", "words.json"), encoding="utf-8"))["words"]

BOOKS = {"7A": (7, 1), "7B": (7, 2), "8A": (8, 1), "8B": (8, 2), "9A": (9, 1), "9B": (9, 2)}

print("=" * 80)
print("一、逐册覆盖率")
print("=" * 80)
print("  %-4s %-7s %-7s %-7s %-7s %-11s %-12s" % ("册", "单词", "有原句", "仅词表", "真缺口", "出处覆盖率", "短语(有出处)"))
tot = Counter()
for bk, (g, s) in BOOKS.items():
    p = os.path.join(CORPUS, bk + ".json")
    if not os.path.exists(p):
        print("  %-4s [缺语料文件]" % bk)
        continue
    c = json.load(open(p, encoding="utf-8"))
    sent = set(c.get("byWordForm") or {}) | set(c.get("byWordAny") or {})
    vocab = set(c.get("byVocab") or {})
    ws = [w for w in words if w["grade"] == g and w["semester"] == s and w["entry_type"] == "word"]
    ps = [w for w in words if w["grade"] == g and w["semester"] == s and w["entry_type"] == "phrase"]
    a = [w for w in ws if str(w["id"]) in sent]
    b = [w for w in ws if str(w["id"]) not in sent and str(w["id"]) in vocab]
    cgap = [w for w in ws if str(w["id"]) not in sent and str(w["id"]) not in vocab]
    phit = [w for w in ps if str(w["id"]) in sent or str(w["id"]) in vocab]
    tot["w"] += len(ws); tot["a"] += len(a); tot["b"] += len(b); tot["gap"] += len(cgap)
    tot["p"] += len(ps); tot["ph"] += len(phit)
    print("  %-4s %-7d %-7d %-7d %-7d %-11s %d / %d" % (
        bk, len(ws), len(a), len(b), len(cgap),
        "%.1f%%" % (100.0 * (len(a) + len(b)) / max(1, len(ws))), len(phit), len(ps)))
print("  " + "-" * 76)
print("  合计：单词 %d —— 有原句 %d、仅词表 %d、真缺口 %d → **出处覆盖率 %.1f%%**" % (
    tot["w"], tot["a"], tot["b"], tot["gap"], 100.0 * (tot["a"] + tot["b"]) / max(1, tot["w"])))
print("        短语 %d —— 有出处 %d → %.1f%%" % (tot["p"], tot["ph"], 100.0 * tot["ph"] / max(1, tot["p"])))

print()
print("=" * 80)
print("二、真缺口（教材正文与词表里都没用过）：%d 个" % tot["gap"])
print("=" * 80)
gap = []
for bk, (g, s) in BOOKS.items():
    p = os.path.join(CORPUS, bk + ".json")
    if not os.path.exists(p):
        continue
    c = json.load(open(p, encoding="utf-8"))
    sent = set(c.get("byWordForm") or {}) | set(c.get("byWordAny") or {})
    vocab = set(c.get("byVocab") or {})
    for w in words:
        if (w["grade"] == g and w["semester"] == s and w["entry_type"] == "word"
                and str(w["id"]) not in sent and str(w["id"]) not in vocab):
            gap.append((bk, w))
print("  按册：%s" % dict(Counter(bk for bk, _ in gap)))
print("  按词性：%s" % dict(Counter((w.get("pos") or "?") for _, w in gap)))
print("  其中带 * 前缀（非四会词）：%d" % len([1 for _, w in gap if str(w["word_en"]).startswith("*")]))
random.seed(3)
for bk, w in random.sample(gap, min(18, len(gap))):
    print("    [%s] %-16s %-6s %s" % (bk, w["word_en"], w.get("pos") or "", (w.get("definition_zh") or "")[:20]))
