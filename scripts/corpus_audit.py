# -*- coding: utf-8 -*-
"""
corpus_audit.py —— 语料缺陷体检（需要一部英文词典）

为什么需要词典：
    没有词典就无法回答"sm 是不是一个词"。前面试过三种不依赖词典的判据，
    全部失败（误报 fat rat / dive into / ball game，或漏掉 sm allest）。
    词典到位后，"碎片 + 下一段 = 一个真词"这条判据才是可靠的。

用法:
    python scripts/corpus_audit.py                 # 体检 + 给出可修复建议
    python scripts/corpus_audit.py --fix           # 直接输出修复后的语料（另存）
"""
import json, os, re, sys
from collections import Counter

ROOT = r"E:\初二"
CORPUS_DIR = os.path.join(ROOT, "web", "public", "corpus")
DICT = os.path.join(ROOT, "挑战杯-2026", "_dict", "words_alpha.txt")

SECTION_LABELS = {
    "reading", "listening", "speaking", "writing", "grammar", "project",
    "vocabulary", "culture", "revision", "unit", "module", "before", "after",
    "warm", "lead", "task", "exercise", "practice", "section", "part",
    "appendix", "contents", "review", "pre", "post", "more", "getting",
    "focusing", "cross-curricular", "integrated", "skills", "strategy",
}


def load_dict():
    if not os.path.exists(DICT):
        print("缺词典：" + DICT)
        print("先下载：https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt")
        sys.exit(2)
    words = set()
    with open(DICT, encoding="utf-8", errors="ignore") as f:
        for line in f:
            w = line.strip().lower()
            if w.isalpha():
                words.add(w)
    return words


def tokens(s):
    return s.split()


def header_glue(s):
    """句子开头是不是粘了页码/栏目名（页眉）。

    ⚠️ 第一版只看"第一个词在栏目名词表里"，误报约 18%：
       After that, he spent many years...   /  Warm rain falls on...  /  Before modern times,...
       全是好句子，只因为 after / warm / before 也在词表里就被扔了。
    **误报的统计比没有统计更糟**，所以加了第二个条件：粘住的页眉后面
    一定还跟着大写开头的词或数字（"Vocabulary practice 1 ..." / "Listening A space hotel ..."）。
    """
    toks = s.split()
    if not toks:
        return False
    if toks[0].strip('.,:;!?"()').lower() not in SECTION_LABELS:
        return False
    if len(toks) > 1 and toks[1].strip('.,:;!?"()').isdigit():
        return True
    for t in toks[1:6]:
        w = t.strip('.,:;!?"()')
        if w[:1].isupper():
            return True
    return False


def find_broken(s, D):
    """返回 [(碎片a, 碎片b, 合成词, a在句中的原始大小写)]"""
    hits = []
    toks = tokens(s)
    for i in range(len(toks) - 1):
        a = toks[i].strip('.,;:!?"()')
        b = toks[i + 1].strip('.,;:!?"()')
        if not (a.isalpha() and b.isalpha()):
            continue
        al, bl = a.lower(), b.lower()
        if al in D:
            continue                      # a 本身就是词 -> 不是断词
        if (al + bl) in D:
            hits.append((a, b, al + bl))
    return hits


def audit():
    D = load_dict()
    print("词典载入：" + str(len(D)) + " 词")
    counts = Counter()
    examples = {}
    total = 0
    for bk in ("7A", "7B", "8A", "8B"):
        p = os.path.join(CORPUS_DIR, bk + ".json")
        if not os.path.exists(p):
            continue
        c = json.load(open(p, encoding="utf-8"))
        for s in c["sentences"]:
            total += 1
            def rec(kind, sample):
                counts[kind] += 1
                examples.setdefault(kind, [])
                if len(examples[kind]) < 4:
                    examples[kind].append(sample)
            b = find_broken(s, D)
            if b:
                rec("断词（碎片+下一段=真词）", b[0][0] + " " + b[0][1] + " -> " + b[0][2])
            # ⚠️ 三条规则都收紧过。第一版太宽，误报严重（把 "Read his post about..."
            #    当成"句首粘栏目名"，因为 post 在栏目名词表里）——
            #    **误报的统计比没有统计更糟**，所以宁可窄。
            if re.search(r"\s+[,;:!?]", s) or re.search(r"\s\.$", s):
                rec("空格在标点前", s[:70])
            if s.count('"') % 2 == 1:
                rec("引号不配对", s[:70])
            if header_glue(s):
                rec("句首粘栏目名", s[:70])
            # 这一条量的是"多句"，不必然是缺陷，单独归类
            if re.search(r'[.!?]\s+[A-Z"]', s[:-1]):
                rec("【参考】含多句（不必然是缺陷）", s[:70])
            if re.search(r"\b(?:a|an|the)\s+(?:our|your|their|his|her|my|its|you|we|they)\b", s, re.I):
                rec("冠词后跟代词（两栏交错）", s[:70])
    print("\n语料总句数：" + str(total))
    print("=" * 60)
    for k, v in counts.most_common():
        print(("  %-34s %5d  (%.2f%%)" % (k, v, 100.0 * v / total)))
        for e in examples.get(k, []):
            print("        · " + e)
    tot = sum(counts.values())
    print("=" * 60)
    print("带缺陷的句子合计（按类计，同句可能多类）：" + str(tot))


if __name__ == "__main__":
    audit()
