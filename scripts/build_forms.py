# -*- coding: utf-8 -*-
"""
build_forms.py —— 生成「用所给词的适当形式填空」题库（T20）

依据：词跃-亮点升级-课文考点层.md §5①
    课文是 "She sings beautifully."，目标词 beautiful
    → 挖掉 beautifully，括号给 (beautiful)，**答案就是课文里的那个形式**。
依据：词跃-课文语料索引方案.md §4
    「建立索引时必然要记录课文里用的是哪个形式 —— 而这个形式，
      就是用所给词的适当形式填空的标准答案。」

⚠️ 为什么不能直接拿 byWordForm 出题：
   现有语料的质量闸门是给**展示例句**用的（学生看到一句课本原句就够了），
   而考题的要求高得多 —— 句子必须**自己站得住**。
   第一版直接拿 byWordForm 试，出来的题是这样的：
       First thoughts 3 Things my friend likes doing ...     ← 目录页
       Personal qualities of my good friend helpful, kind ... ← 碎片
       Speaking Describing your friend Work in pairs ...      ← 指令语
   学生看到这种题只会懵。所以这里另设一套闸门，并且**每条被挡掉的都要能说出理由**
   （项目纪律：一个「更严」的规则上线前，必须去看它到底挡掉了什么）。

输出：web/public/forms.json
"""
import json
import os
import re
from collections import Counter, defaultdict
from corpus_clean import gate as clean_gate   # 与 T21 共用同一套质量闸门

ROOT = r"E:\初二"
CORPUS_DIR = os.path.join(ROOT, "web", "public", "corpus")
OUT = os.path.join(ROOT, "web", "public", "forms.json")

# ---- 闸门 1：这句得是个句子 ----
SENT_END = re.compile(r"[.!?]$")
FUNCTION_WORDS = (" the ", " a ", " an ", " is ", " are ", " was ", " were ",
                  " to ", " of ", " in ", " and ", " that ", " for ", " with ")

# ---- 闸门 2：这些是教材的"指令语/栏目语"，不是句子 ----
BAN_PHRASES = (
    "work in pairs", "work in groups", "in pairs", "in groups",
    "look at", "listen to", "read the", "read and", "complete the",
    "fill in", "write about", "write a", "discuss", "choose", "match ",
    "tick ", "circle", "answer the", "ask and", "say it", "how to",
    "study skills", "unit objectives", "first thoughts", "getting ready",
    "more practice", "let's", "we will", "you will", "speaking", "listening",
    "find out", "take notes", "check your", "work out",
    # 抽样时漏网的（第一版闸门没挡住，学生看到只会懵）：
    "reading comprehension", "comprehension", "summarize", "summarise",
    "with the information", "on page", "according to the", "in your notebook",
    "the article", "the passage", "answer the question", "in the article",
)


def is_real_sentence(t):
    """这句话能不能独立当一道题？返回 (ok, 理由)"""
    t = t.strip()
    if len(t) < 30:
        return False, "太短"
    if "..." in t or "…" in t:
        return False, "省略号（多半是碎片）"
    if "/" in t or "•" in t:
        return False, "含分隔符（栏目语）"
    if not SENT_END.search(t):
        return False, "结尾不是句号/问号/叹号"
    if not t[0].isupper():
        return False, "不是大写开头"
    if re.search(r"[\u4e00-\u9fff]", t):
        return False, "含中文"
    n = len(t.split())
    if n < 6:
        return False, "词数少于 6"
    if n > 26:
        return False, "词数多于 26"
    low = " " + t.lower() + " "
    if not any(f in low for f in FUNCTION_WORDS):
        return False, "没有虚词（不像句子）"
    for b in BAN_PHRASES:
        if b in low:
            return False, "含栏目语：" + b.strip()
    # 标题和正文被 PDF 粘成一句 —— 例如
    #   "The steam engine and the Industrial Revolution Watt added wheels and cogs ..."
    # （"The steam engine and the Industrial Revolution" 是标题，后半句才是正文）
    # 特征：去掉开头两个词之后，还出现连续三个大写开头的词。
    # 逗号分隔的专有名词列（"China, America, Canada"）不算，因为中间有逗号。
    rest = " ".join(t.split()[2:])
    if re.search(r"\b[A-Z][a-z]+\s+[A-Z][a-z]+\s+[A-Z][a-z]+\b", rest):
        return False, "疑似标题与正文粘连"
    return True, "ok"


def blank_out(text, surface):
    """把 surface 挖成空格。整词匹配，大小写不敏感，只挖第一次出现。"""
    pat = re.compile(r"\b" + re.escape(surface) + r"\b", re.IGNORECASE)
    m = pat.search(text)
    if not m:
        return None
    return text[:m.start()] + "______" + text[m.end():]


def main():
    items = []
    dropped = Counter()
    by_book = {}
    seen = set()

    for bk in ("7A", "7B", "8A", "8B", "9A", "9B"):
        path = os.path.join(CORPUS_DIR, bk + ".json")
        if not os.path.exists(path):
            continue
        c = json.load(open(path, encoding="utf-8"))
        sents = c["sentences"]
        metas = c["meta"]
        n_book = 0
        for wid, forms in (c.get("byWordForm") or {}).items():
            for f in forms:
                if not f.get("asked"):
                    dropped["课文用的就是原形（属于课文挖空，不是本题型）"] += 1
                    continue
                si = f["si"]
                if not (0 <= si < len(sents)):
                    continue
                full = sents[si]
                surf = f["surface"]
                lem = f["lemma"]
                key = (bk, si, wid)
                if key in seen:
                    dropped["重复"] += 1
                    continue

                ok, why = is_real_sentence(full)
                if not ok:
                    dropped[why] += 1
                    continue
                # 语料层已改成"只修不丢"，质量闸门必须在这里补上：
                # 句首粘页眉 / 引号不配对 / 冠词后跟代词 —— 三种都会让学生看到残句。
                ok2, why2 = clean_gate(full)
                if not ok2:
                    dropped["闸门：" + why2] += 1
                    continue

                # 同一个形式在句子里出现两次 → 挖一个另一个就把答案露出来了
                if len(re.findall(r"\b" + re.escape(surf) + r"\b", full, re.IGNORECASE)) != 1:
                    dropped["同一个词出现多次（挖一个会露另一个）"] += 1
                    continue
                # 原形也在句子里 → 等于把答案摆在旁边
                if lem.lower() != surf.lower() and re.search(r"\b" + re.escape(lem) + r"\b", full, re.IGNORECASE):
                    dropped["原形也在句子里（答案被露）"] += 1
                    continue

                blanked = blank_out(full, surf)
                if blanked is None:
                    dropped["挖空失败"] += 1
                    continue
                # 空格不能在句首（"______ is ..." 读不通）
                if blanked.startswith("______"):
                    dropped["空格在句首"] += 1
                    continue
                # 挖完还得剩够词，否则读不出语境
                if len(blanked.replace("______", " ").split()) < 4:
                    dropped["挖完剩词太少"] += 1
                    continue

                m = metas[si] if si < len(metas) else {}
                seen.add(key)
                items.append({
                    "id": bk + "-s" + str(si) + "-w" + str(wid),
                    "book": bk,
                    "grade": c.get("grade"),
                    "semester": c.get("semester"),
                    "unit": m.get("unit"),
                    "section": m.get("section"),
                    "printPage": m.get("printPage"),
                    "wid": wid,
                    "lemma": lem,
                    "surface": surf,
                    "blanked": blanked,
                    "full": full,
                })
                n_book += 1
        by_book[bk] = n_book

    # 去重：同一句 + 同一个词只留一条
    out = {
        "meta": {
            "count": len(items),
            "byBook": by_book,
            "dropped": dict(dropped.most_common()),
        },
        "items": items,
    }
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

    print("生成 " + str(len(items)) + " 道题 -> " + OUT)
    for k, v in by_book.items():
        print("  " + k + ": " + str(v))
    print()
    print("被挡掉的（按数量排）：")
    for k, v in dropped.most_common(12):
        print("  " + str(v).rjust(5) + "  " + k)


if __name__ == "__main__":
    main()
