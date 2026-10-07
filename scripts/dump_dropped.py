# -*- coding: utf-8 -*-
"""dump_dropped.py —— 把每条"丢弃规则"命中的句子抽样出来，供人眼复核。
项目纪律：一个"更严"的规则上线前，必须去看它到底挡掉了什么。"""
import json, os, re, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from corpus_audit import load_dict, find_broken, header_glue, SECTION_LABELS

CORPUS_DIR = r"E:\初二\web\public\corpus"
OUT = r"E:\初二\_server_scripts\dropped_samples.txt"

D = load_dict()
buckets = {k: [] for k in ["A_句首栏目名", "B_引号不配对", "C_冠词后跟代词", "D_断词(修复类)", "E_空格在标点前(修复类)"]}
for bk in ("7A", "7B", "8A", "8B"):
    c = json.load(open(os.path.join(CORPUS_DIR, bk + ".json"), encoding="utf-8"))
    for s in c["sentences"]:
        if header_glue(s):
            buckets["A_句首栏目名"].append(s)
        if s.count('"') % 2 == 1:
            buckets["B_引号不配对"].append(s)
        if re.search(r"\b(?:a|an|the)\s+(?:our|your|their|his|her|my|its|you|we|they)\b", s, re.I):
            buckets["C_冠词后跟代词"].append(s)
        if find_broken(s, D):
            buckets["D_断词(修复类)"].append(s)
        if re.search(r"\s+[,;:!?]", s) or re.search(r"\s\.$", s):
            buckets["E_空格在标点前(修复类)"].append(s)

random.seed(7)
lines = []
for k, v in buckets.items():
    lines.append("=" * 78)
    lines.append(k + "   命中 " + str(len(v)) + " 句，下面随机抽 " + str(min(28, len(v))) + " 句")
    lines.append("=" * 78)
    for s in random.sample(v, min(28, len(v))):
        lines.append("  · " + s[:150])
    lines.append("")
open(OUT, "w", encoding="utf-8").write("\n".join(lines))
print("written " + OUT)
for k, v in buckets.items():
    print(k, len(v))
