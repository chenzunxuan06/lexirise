#!/usr/bin/env python
# ============================================================
# scripts/build_morphology.py —— 生成 public/morphology.json（T17）
# ------------------------------------------------------------
# 任务单验收：**patient 家族能找到 patiently / patience**。
#
# 【这一版是重写过的，第一版思路错了，记下来免得再错】
#   第一版是"正向生成所有可能形式，然后只留课文语料里出现过的"。
#   结果 patient 家族只剩 patiently —— 因为 **patience 在四册课本里出现 0 次**。
#   错在哪：语料筛是个太粗的筛子。正向规则会产出 patientable / patiention
#   这种怪词，我用语料去挡它们，代价是把"课本没用过但确实存在的词"也挡掉了。
#
#   正确做法：**用词性（pos 字段）约束规则**，从源头少产怪词，就不必靠语料筛：
#     · n.   → 复数（安全）
#     · v.   → 三单 / 过去式 / 现在分词（安全）
#     · adj. → -ly / -ily（跳过本身以 ly 结尾的，否则 friendly -> friendlyly）
#     · adj. → **-ent → -ence / -ant → -ance**（英语里近乎零误报的两条规律：
#              patient→patience、different→difference、confident→confidence、
#              important→importance、distant→distance）
#     · 比较级只给短词（<= 6 字母）—— 英语里长形容词用 more/most，
#       "patienter" 不是人话
#   其余派生（-ness / -ment / -er / -ion / -ful / -less / -able / -ity…）
#   仍然只在**语料里出现过**或**本身就在 1535 词表里**时才收。
#
# id 的含义（来自任务单）：
#   id 有值  -> 这个形式本身也是 1535 词表里的一个词条
#   id = null -> 它不在 1535 词表里 —— 这本身就是重要信息：
#                只是"认得即可"的派生词，不是四会词（例如 patiently）
# ============================================================
import json, os, re, sys
from collections import defaultdict

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))

VOWELS = "aeiou"
BOOKS = ["7A", "7B", "8A", "8B"]


def _cons_before_y(w):
    return len(w) > 1 and w[-2] not in VOWELS


# ---- 安全规则：形态上几乎不可能产怪词，无条件保留 ----
def safe_forms(w, pos):
    out = set()
    if pos == "n.":
        if w.endswith(("s", "x", "z", "ch", "sh")):
            out.add(w + "es")
        elif w.endswith("y") and _cons_before_y(w):
            out.add(w[:-1] + "ies")
        elif w.endswith("f"):
            out.add(w[:-1] + "ves")
        elif w.endswith("fe"):
            out.add(w[:-2] + "ves")
        else:
            out.add(w + "s")
    elif pos == "v.":
        if w.endswith(("s", "x", "z", "ch", "sh")):
            out.add(w + "es")
        elif w.endswith("y") and _cons_before_y(w):
            out.add(w[:-1] + "ies")
        else:
            out.add(w + "s")
        if w.endswith("e"):
            out.add(w + "d")
        elif w.endswith("y") and _cons_before_y(w):
            out.add(w[:-1] + "ied")
        else:
            out.add(w + "ed")
            out.add(w + w[-1] + "ed")
        if w.endswith("e") and not w.endswith("ee"):
            out.add(w[:-1] + "ing")
        else:
            out.add(w + "ing")
            out.add(w + w[-1] + "ing")
    elif pos == "adj.":
        # -ent -> -ence / -ant -> -ance：英语里近乎零误报
        if w.endswith("ent"):
            out.add(w[:-3] + "ence")
        if w.endswith("ant"):
            out.add(w[:-3] + "ance")
        # 副词化；本身以 ly 结尾的跳过（friendly -> friendlyly 不是词）
        if not w.endswith("ly"):
            if w.endswith("y") and _cons_before_y(w):
                out.add(w[:-1] + "ily")
            elif w.endswith("le"):
                out.add(w[:-1] + "y")       # possible -> possibly
            elif w.endswith("ic"):
                out.add(w + "ally")         # basic -> basically
            else:
                out.add(w + "ly")
        # 比较级 / 最高级只给短词（长形容词英语里用 more / most）
        if len(w) <= 6:
            if w.endswith("e"):
                out.add(w + "r"); out.add(w + "st")
            elif w.endswith("y") and _cons_before_y(w):
                out.add(w[:-1] + "ier"); out.add(w[:-1] + "iest")
            else:
                out.add(w + "er"); out.add(w + "est")
    return out


# ---- 有风险的派生：只在"语料出现过"或"本身在词表里"时才收 ----
def risky_forms(w, pos):
    out = set()
    if pos == "n.":
        out |= {w + "ful", w + "less", w + "ous", w + "al", w + "ly"}
    elif pos == "v.":
        out |= {w + "ment", w + "er", w + "or", w + "ion", w + "ness"}
        if w.endswith("e"):
            out |= {w[:-1] + "ion", w[:-1] + "ation", w[:-1] + "er"}
    elif pos == "adj.":
        out |= {w + "ness", w + "ity", w + "able", w + "ive", w + "ous"}
        if w.endswith("e"):
            out |= {w[:-1] + "ity", w[:-1] + "ness"}
        if w.endswith("y") and _cons_before_y(w):
            out |= {w[:-1] + "iness"}
    return out


def relation(base, form):
    """粗分屈折 / 派生。屈折 = 语法变化；派生 = 造出了新词。"""
    rest = form[len(base):] if form.startswith(base) else form
    return "inflection" if rest in ("s", "es", "ies", "ves", "ed", "d", "ied", "ing",
                                    "er", "est", "ier", "iest", "r", "st") else "derivation"


def main():
    words = json.load(open(os.path.join(ROOT, "web", "public", "words.json"), encoding="utf-8"))["words"]
    vocab = defaultdict(list)
    for w in words:
        if w["entry_type"] == "word":
            vocab[str(w["word_en"]).lstrip("*").strip().lower()].append(w)

    tokens = set()
    for bk in BOOKS:
        p = os.path.join(ROOT, "web", "public", "corpus", bk + ".json")
        if os.path.exists(p):
            for s in json.load(open(p, encoding="utf-8"))["sentences"]:
                tokens |= set(re.findall(r"[A-Za-z][A-Za-z'\-]*", s.lower()))

    out = {}
    n_safe = n_attest = 0
    for term in sorted(vocab):
        pos = str(vocab[term][0].get("pos") or "").strip()
        fam = []
        for f, kind in [(x, "safe") for x in sorted(safe_forms(term, pos))] + \
                       [(x, "risky") for x in sorted(risky_forms(term, pos))]:
            if f == term or len(f) < 4:
                continue
            hit = vocab.get(f)
            if kind == "risky" and not hit and f not in tokens:
                continue                      # 有风险的规则：没人用过就不收
            if any(x["form"] == f for x in fam):
                continue
            fam.append({"form": f, "rel": relation(term, f),
                        "id": hit[0]["id"] if hit else None,
                        "inCorpus": f in tokens})
            if kind == "safe":
                n_safe += 1
            else:
                n_attest += 1
        if fam:
            out[term] = {"id": vocab[term][0]["id"], "pos": pos, "forms": fam}

    dest = os.path.join(ROOT, "web", "public", "morphology.json")
    with open(dest, "w", encoding="utf-8") as f:
        json.dump({
            "note": "变形族：form 的 id 为 null 表示该形式不在 1535 词表里（认得即可，不是四会词）；"
                    "inCorpus 表示这个形式在四册课文的语料里真的出现过",
            "source": "由 scripts/build_morphology.py 生成",
            "families": out,
        }, f, ensure_ascii=False, separators=(",", ":"))

    print("词表 " + str(len(vocab)) + " 个词形；" + str(len(out)) + " 个有变形族；"
          "共 " + str(n_safe + n_attest) + " 个形式（安全规则 " + str(n_safe)
          + " + 语料/词表佐证 " + str(n_attest) + "）")
    print("写入 " + dest + "  (" + str(round(os.path.getsize(dest) / 1024)) + " KB)")
    print()
    print("任务单点名的验收：")
    for probe in ["patient", "possible", "different", "important", "confident", "improve", "quality"]:
        fam = out.get(probe)
        if not fam:
            print("  " + probe + ": 没有变形族")
            continue
        print("  " + probe + " [" + fam["pos"] + "] -> "
              + ", ".join(x["form"] + ("#" + str(x["id"]) if x["id"] else "")
                          + ("" if x["inCorpus"] else "(课本未用)")
                          for x in fam["forms"]))


if __name__ == "__main__":
    main()
