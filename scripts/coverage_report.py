# -*- coding: utf-8 -*-
"""coverage_report.py —— 课本原句覆盖率：多少词拿得到原句，没拿到的缺在哪

数据来源**只有 public/corpus/*.json**（已经发布出去的语料），不读 PDF：
  ① 跑得快，可以在每次改出题/建索引后随手跑一遍；
  ② 量到的正是"学生实际能看到的东西" —— 覆盖率是说给学生和评委听的那个数，
     它必须等于已发布语料能给出的东西，而不是"理论上能抽到多少"。

没覆盖到的词分两类，这是本报告的重点（原版只统计了"多少"，没回答"为什么"）：
  A 语料里**有**含它的句子，但那些句子过不了"可以展示给学生"的标准
    （质量分低于底线 / 是词框模板 / 带单字母断词）→ **这是取舍，不是缺陷**
  B 语料里**没有**这样的句子 → 它只出现在单元词汇表/表格/题干里（教材编排决定）

【A 类的措辞在 2026-10-07 改过，必须说明】
  改之前 A 类写的是"索引没收到（可修，属于缺陷）"，而且当时确实是个缺陷：
  选句逻辑是 if 本单元有候选: … else: 看别的单元，于是"本单元的候选全不合格"
  的词一条原句都拿不到。**那条已经修了**（build_corpus.py 的兜底路径）。
  修完之后 A 类仍然有 19 个 —— 但性质变了：它们的句子是**主动不要**的，
  因为按"显示一句错的比不显示更糟"这条纪律，那些句子不该出现在学生眼前。
  数字没变、结论变了，所以措辞必须跟着改：**不能拿一个已经修好的缺陷当挡箭牌。**
"""
import json, os, re, random
from collections import Counter

ROOT = r"E:\初二"
CORPUS = os.path.join(ROOT, "web", "public", "corpus")
words = json.load(open(os.path.join(ROOT, "web", "public", "words.json"), encoding="utf-8"))["words"]

BOOKS = {"7A": (7, 1), "7B": (7, 2), "8A": (8, 1), "8B": (8, 2), "9A": (9, 1), "9B": (9, 2)}


def has_sentence(book, term):
    """已发布语料里有没有含这个词（词边界、忽略大小写）的句子。"""
    pat = re.compile(r"(?<![A-Za-z])" + re.escape(term) + r"(?![A-Za-z])", re.I)
    return any(pat.search(s) for s in book["sentences"])


print("=" * 74)
print("一、逐册覆盖率（按已发布语料算）")
print("=" * 74)
print("  %-4s %-9s %-9s %-9s %-14s" % ("册", "单词", "有原句", "覆盖率", "短语(有原句)"))
tot_w = tot_hit = tot_p = tot_phit = 0
missing = []
for bk, (g, s) in BOOKS.items():
    p = os.path.join(CORPUS, bk + ".json")
    if not os.path.exists(p):
        print("  %-4s [缺语料文件]" % bk)
        continue
    c = json.load(open(p, encoding="utf-8"))
    keys = set(c.get("byWordForm") or {}) | set(c.get("byWordAny") or {})
    ws = [w for w in words if w["grade"] == g and w["semester"] == s and w["entry_type"] == "word"]
    ps = [w for w in words if w["grade"] == g and w["semester"] == s and w["entry_type"] == "phrase"]
    hit = [w for w in ws if str(w["id"]) in keys]
    phit = [w for w in ps if str(w["id"]) in keys]
    tot_w += len(ws); tot_hit += len(hit); tot_p += len(ps); tot_phit += len(phit)
    print("  %-4s %-9d %-9d %-9s %d / %d" % (bk, len(ws), len(hit),
          "%.1f%%" % (100.0 * len(hit) / max(1, len(ws))), len(phit), len(ps)))
    for w in ws:
        if str(w["id"]) not in keys:
            missing.append((bk, c, w))
print("  " + "-" * 66)
print("  合计：单词 %d，有原句 %d，覆盖率 %.1f%%；短语 %d / %d = %.1f%%" % (
    tot_w, tot_hit, 100.0 * tot_hit / max(1, tot_w),
    tot_phit, tot_p, 100.0 * tot_phit / max(1, tot_p)))

print()
print("=" * 74)
print("二、没覆盖到的词，缺在哪（共 %d 个）" % len(missing))
print("=" * 74)
repair = [(bk, w) for bk, c, w in missing if has_sentence(c, str(w["word_en"]).lstrip("*").strip())]
absent = [(bk, w) for bk, c, w in missing if not has_sentence(c, str(w["word_en"]).lstrip("*").strip())]
print("  A 语料里有句子、但那些句子不该展示（质量底线/词框模板/单字母断词）：%d" % len(repair))
for bk, w in repair[:25]:
    print("      [%s] %-16s %s" % (bk, w["word_en"], (w.get("definition_zh") or "")[:16]))
print()
print("  B 语料里没有这样的句子（只在词汇表/表格/题干里出现）：%d" % len(absent))
print("      按词性：%s" % dict(Counter((w.get("pos") or "?") for _, w in absent)))
print("      其中带 * 前缀（非四会词）：%d" % len([1 for _, w in absent if str(w["word_en"]).startswith("*")]))
print("      按册：%s" % dict(Counter(bk for bk, _ in absent)))
print("      这说明教材把一部分词只放进了单元词汇表、没在正文里用过 ——")
print("      覆盖率的天花板由教材编排决定，不是索引漏了。")

print()
print("=" * 74)
print("三、B 类抽样 18 个（人眼复核用）")
print("=" * 74)
random.seed(3)
for bk, w in random.sample(absent, min(18, len(absent))):
    print("  [%s] %-16s %-6s %s" % (bk, w["word_en"], w.get("pos") or "", (w.get("definition_zh") or "")[:20]))
