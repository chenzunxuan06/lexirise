# -*- coding: utf-8 -*-
"""scan_single_letter.py —— 扫「单字母断词」（repair() 修不到的那一类）

    python scripts/scan_single_letter.py

为什么单列一个脚本：
  语料清洗里最显眼的缺陷类型是"PDF 把词劈成两半"（exciti ng -> exciting）。
  它由 corpus_clean.repair() 自动修，**但有一类它修不到**：
  碎片恰好是单个字母，而 words_alpha 词典里收了 y / n / o / s / t 这些单字母，
  于是 repair 的前提"碎片不是词"不成立，"Y es" 被原样放过。

  实测全语料命中 93 句（2026-10-07，六册 8952 句）：
      P eople like to / enjoy ...   /   N ine white tigers ...   /   S ome places are very hot ...

  判定逻辑在 corpus_clean.single_letter_break()，**本脚本不另写一份** ——
  它只负责统计与抽样，供人眼复核（放宽/收紧规则之前必须先抽样，这是项目纪律）。
"""
import json, glob, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from corpus_clean import single_letter_break

sys.stdout.reconfigure(encoding="utf-8")
CORPUS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "corpus")

tot = 0
sent_total = 0
per_book = {}
samples = []
for p in sorted(glob.glob(os.path.join(CORPUS, "*.json"))):
    c = json.load(open(p, encoding="utf-8"))
    hit = 0
    for s in c["sentences"]:
        sent_total += 1
        if single_letter_break(s):
            hit += 1
            if len(samples) < 20:
                samples.append((os.path.basename(p), s[:100]))
    per_book[os.path.basename(p)] = hit
    tot += hit

print("语料总句数：%d" % sent_total)
print("单字母断词句数：%d（%.2f%%）" % (tot, 100.0 * tot / max(1, sent_total)))
print("按册：%s" % per_book)
print()
print("抽样 20 句（人眼复核：是真的断词，还是 a/b/c/d 标号那种误报）：")
for f, s in samples:
    print("   [%s] %s" % (f, s))
