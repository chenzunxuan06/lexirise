# -*- coding: utf-8 -*-
"""
build_cloze.py —— 生成「课文挖空」题库（T21）

依据：词跃-任务单.md  T21「课文挖空」：句长 8–20 词、每句挖 1–2 个；挖空后句子仍可读

与 T20 的关系（互补，不是重复）：
    T20 挖的是**变形**（课文 "She sings beautifully."，括号给 beautiful，答案 beautifully）
    T21 挖的是**原形**（课文用的就是原形那 921 处）—— 考"能不能在语境里想起这个词"

素材来源：corpus/*.json 的 byWordForm 里 asked == False 的那些（surface == lemma）。
    这批料 T20 的出题器当初**明确挡掉了**，理由就是「属于课文挖空，不是本题型」。
    所以本脚本不是另起炉灶，是把已经分好类的那一堆接过来用。

闸门：与 T20 同一套（is_real_sentence），外加 T21 自己的两条：
    · 句长按 T21 规格收窄到 8–20 词
    · 挖空必须给得出中文提示 —— 没提示的挖空是猜谜，不是考题

输出：web/public/cloze.json
"""
import json
import os
import re
from collections import Counter

ROOT = r"E:\初二"
CORPUS_DIR = os.path.join(ROOT, "web", "public", "corpus")
WORDS = os.path.join(ROOT, "web", "public", "words.json")
OUT = os.path.join(ROOT, "web", "public", "cloze.json")

SENT_END = re.compile(r"[.!?]$")
FUNCTION_WORDS = (" the ", " a ", " an ", " is ", " are ", " was ", " were ",
                  " to ", " of ", " in ", " and ", " that ", " for ", " with ")

BAN_PHRASES = (
    "work in pairs", "work in groups", "in pairs", "in groups",
    "look at", "listen to", "read the", "read and", "complete the",
    "fill in", "write about", "write a", "discuss", "choose", "match ",
    "tick ", "circle", "answer the", "ask and", "say it", "how to",
    "study skills", "unit objectives", "first thoughts", "getting ready",
    "more practice", "let's", "we will", "you will", "speaking", "listening",
    "find out", "take notes", "check your", "work out",
    "reading comprehension", "comprehension", "summarize", "summarise",
    "with the information", "on page", "according to the", "in your notebook",
    "the article", "the passage", "answer the question", "in the article",
)

# 只挖实词：虚词挖掉了句子也读不通，而且考不出词汇
CONTENT_POS = ("n.", "v.", "adj.", "adv.")

# 以这些词开头的句子是"作业指令"，不是课文句子（"Read her article and..."）。
# "white" 是语料里 "Write about..." 的错字，一并挡掉。
# 课文栏目名。抽样发现 "Reading Before you read 1 Role models are people we admire."
# 这种 —— 页眉/小节名被 PDF 抽取粘到了正文前面。只看开头三个词就够：
# 这种粘连一定发生在句首。
SECTION_LABELS = {
    "reading", "listening", "speaking", "writing", "grammar", "project",
    "vocabulary", "culture", "revision", "unit", "module", "before", "after",
    "warm", "lead", "task", "exercise", "practice", "section", "part",
    "appendix", "contents", "review", "pre", "post", "more", "getting",
    "focusing", "cross-curricular", "integrated", "skills", "strategy",
}

INSTRUCTION_OPENERS = {
    "read", "write", "white", "look", "listen", "complete", "fill", "choose",
    "match", "circle", "tick", "answer", "discuss", "work", "find", "take",
    "check", "study", "say", "ask", "put", "use", "make", "draw", "underline",
    "translate", "copy", "label", "number", "order", "retell", "act",
}


def normalize(t):
    """修掉 PDF 抽取留下的空格，而不是把整句丢掉。

    ⚠️ 这是**排版规整**，不动任何一个词 —— 所以它不违反「答案只认课文里的那个形式」。
    抽样时发现语料里有 "near the equator ." 这种（空格在标点前），
    8+25 条，读起来像排版事故，会让学生以为题目出错了。
    """
    t = re.sub(r"\s+([,.;:!?])", r"\1", t)
    t = re.sub(r"\s{2,}", " ", t)
    return t.strip()


# 词表里出现过的所有英文词（小写），用于识别 PDF 断词artifact。
# 由 main() 载入；单独在这里声明是为了让 is_real_sentence 保持纯函数式调用。
KNOWN_WORDS = set()


def has_broken_word(t):
    """识别 'The sm allest plant ...' 这种：PDF 把一个词拆成了两段。

    判据：相邻两个小写词 a b，拼起来 (a+b) 恰好是词表里的词，且 a 很短。
    'sm' + 'allest' = 'smallest' ✓
    """
    toks = [w for w in t.split() if w.isalpha() and w.islower()]
    for a, b in zip(toks, toks[1:]):
        if len(a) <= 3 and (a + b) in KNOWN_WORDS:
            return True
    return False


def is_real_sentence(t):
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
    if n < 8:
        return False, "词数少于 8（T21 规格）"
    if n > 20:
        return False, "词数多于 20（T21 规格）"
    low = " " + t.lower() + " "
    if not any(f in low for f in FUNCTION_WORDS):
        return False, "没有虚词（不像句子）"
    for b in BAN_PHRASES:
        if b in low:
            return False, "含栏目语：" + b.strip()
    rest = " ".join(t.split()[2:])
    if re.search(r"\b[A-Z][a-z]+\s+[A-Z][a-z]+\s+[A-Z][a-z]+\b", rest):
        return False, "疑似标题与正文粘连"
    # ---- 以下三条是抽样后新加的（第一版没挡，学生看到的是残句/指令）----
    # ① 开头是指令动词："Read her article and see how..." 是作业要求，不是课文句子
    if t.split()[0].lower() in INSTRUCTION_OPENERS:
        return False, "以指令动词开头（作业要求，不是课文句子）"
    # ② 引号不配对：多半是从对话中间截出来的（'...single nail!" he explained.'）
    if t.count('"') % 2 == 1:
        return False, "引号不配对（从对话中间截出）"
    # ③ 句子中间还有句末标点：说明是"正文 + 粘上来的署名/时间"（'...and trust. Chen Ming, 13 8:00 p.m.'）
    if re.search(r'[.!?]\s+[A-Z"]', t[:-1]):
        return False, "句中还有句末标点（正文与署名/说明粘连）"
    # ④ 开头三个词里有栏目名：页眉/小节名被粘到正文前
    #    （'Reading Before you read 1 Role models are people we admire.'）
    if any(w.strip('.,:;!?"').lower() in SECTION_LABELS for w in t.split()[:3]):
        return False, "句首粘连了栏目名（页眉/小节名）"
    # ⑤ 数字后紧跟大写词：多半是"1 Role models"这种题号碎片
    if re.search(r"\b\d+\s+[A-Z][a-z]", t):
        return False, "含题号碎片（数字 + 大写词）"
    # ⑥ 冠词后面直接跟代词/限定词：'...very curious a our understanding...'
    #    —— PDF 把两栏文字交错抽出来的典型痕迹
    if re.search(r"\b(?:a|an|the)\s+(?:our|your|their|his|her|my|its|you|we|they)\b", t, re.IGNORECASE):
        return False, "冠词后跟代词（两栏文字交错）"
    # ⑦ 断词：'sm allest' / 'fi nd'（fi 是连字，见语料交付文档）
    if has_broken_word(t):
        return False, "疑似 PDF 断词（拼起来才是词表里的词）"
    return True, "ok"


def count_occurrences(text, word):
    return len(re.findall(r"\b" + re.escape(word) + r"\b", text, re.IGNORECASE))


def blank_positions(text, words):
    """把 text 里若干整词替换成 ______，从后往前替换避免位移。返回 (结果, 成功数)"""
    spans = []
    for w in words:
        m = re.search(r"\b" + re.escape(w) + r"\b", text, re.IGNORECASE)
        if not m:
            return None, 0
        spans.append((m.start(), m.end()))
    spans.sort(reverse=True)
    out = text
    for s, e in spans:
        out = out[:s] + "______" + out[e:]
    return out, len(spans)


def main():
    words = json.load(open(WORDS, encoding="utf-8"))["words"]
    by_id = {str(w["id"]): w for w in words}
    # 供 has_broken_word 判断"拼起来是不是一个真词"
    for w in words:
        for key in ("word_en",):
            v = (w.get(key) or "").strip().lower()
            if v.isalpha():
                KNOWN_WORDS.add(v)

    items = []
    dropped = Counter()
    by_book = {}
    seen = set()

    for bk in ("7A", "7B", "8A", "8B", "9A", "9B"):
        path = os.path.join(CORPUS_DIR, bk + ".json")
        if not os.path.exists(path):
            continue
        c = json.load(open(path, encoding="utf-8"))
        sents, metas = c["sentences"], c["meta"]

        # 先把这一册里"原形出现"的候选按句子归拢：
        # 一句话里可能有多个可挖的词，挖 1 个还是 2 个由后面决定
        per_sent = {}
        for wid, forms in (c.get("byWordForm") or {}).items():
            for f in forms:
                if f.get("asked"):
                    continue  # 变形 -> 属于 T20
                si = f["si"]
                if not (0 <= si < len(sents)):
                    continue
                w = by_id.get(str(wid))
                if not w:
                    dropped["词不在 1535 词表里"] += 1
                    continue
                if (w.get("pos") or "") not in CONTENT_POS:
                    dropped["不是实词（虚词挖掉读不通）"] += 1
                    continue
                if not (w.get("definition_zh") or "").strip():
                    dropped["没有中文释义（给不出提示）"] += 1
                    continue
                per_sent.setdefault(si, []).append((str(wid), f["surface"], w))

        n_book = 0
        for si, cands in per_sent.items():
            full = normalize(sents[si])
            ok, why = is_real_sentence(full)
            if not ok:
                dropped[why] += 1
                continue

            # 去重：同一句同一个词只留一次
            uniq, seenw = [], set()
            for wid, surf, w in cands:
                if wid in seenw:
                    continue
                seenw.add(wid)
                uniq.append((wid, surf, w))

            # 只保留在这句里恰好出现一次的词（出现两次挖一个会露另一个）
            usable = [(wid, surf, w) for wid, surf, w in uniq if count_occurrences(full, surf) == 1]
            if not usable:
                dropped["可用词都出现多次或缺失"] += 1
                continue

            # ⚠️ 必须按【在句子里的位置】从左到右取，不能按候选顺序取。
            #    候选顺序来自 byWordForm 的字典序，与句子里谁在前谁在后无关。
            #    第一版就栽在这里：一句 "a ___ of traditional Chinese and ___ styles"
            #    的答案数组是 [western, mix]，正好反了 —— 而 UI 是按数组顺序贴到
            #    第 1、2 个空上的，**会直接把对的判成错的**。
            withpos = []
            for wid, surf, w in usable:
                m = re.search(r"\b" + re.escape(surf) + r"\b", full, re.IGNORECASE)
                withpos.append((m.start(), wid, surf, w))
            withpos.sort(key=lambda x: x[0])
            chosen = [(wid, surf, w) for _, wid, surf, w in withpos[:2]]
            surfaces = [s for _, s, _ in chosen]

            blanked, n = blank_positions(full, surfaces)
            if not blanked or n != len(surfaces):
                dropped["挖空失败"] += 1
                continue
            if blanked.startswith("______"):
                dropped["空格在句首"] += 1
                continue
            if len(blanked.replace("______", " ").split()) < 5:
                dropped["挖完剩词太少"] += 1
                continue

            # ---- 自检：把第 k 个空填回第 k 个答案，必须逐字还原原句 ----
            # 这一条是上面那个顺序 bug 的防线。顺序错了，这里一定还原不出来。
            probe = blanked
            for b in chosen:
                probe = probe.replace("______", b[1], 1)
            if probe != full:
                dropped["自检失败（填空顺序与原句对不上）"] += 1
                continue

            key = (bk, si, tuple(sorted(surfaces)))
            if key in seen:
                dropped["重复"] += 1
                continue
            seen.add(key)

            m = metas[si] if si < len(metas) else {}
            items.append({
                "id": bk + "-s" + str(si) + "-c" + str(len(chosen)),
                "book": bk,
                "grade": c.get("grade"),
                "semester": c.get("semester"),
                "unit": m.get("unit"),
                "section": m.get("section"),
                "printPage": m.get("printPage"),
                "blanks": [
                    {"wid": wid, "answer": surf, "hint": w.get("definition_zh"),
                     "pos": w.get("pos")}
                    for wid, surf, w in chosen
                ],
                "blanked": blanked,
                "full": full,
            })
            n_book += 1
        by_book[bk] = n_book

    out = {
        "meta": {
            "count": len(items),
            "byBook": by_book,
            "oneBlank": sum(1 for i in items if len(i["blanks"]) == 1),
            "twoBlank": sum(1 for i in items if len(i["blanks"]) == 2),
            "dropped": dict(dropped.most_common()),
            "note": "答案只认课文里的那个词；出处可翻书核实",
        },
        "items": items,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    print("写出 " + OUT)
    print("题目数 = " + str(len(items)) + "  分册 = " + json.dumps(by_book, ensure_ascii=False))
    print("挖 1 空 = " + str(out["meta"]["oneBlank"]) + "　挖 2 空 = " + str(out["meta"]["twoBlank"]))
    print("--- 挡掉的（每条都要能说出理由）---")
    for k, v in dropped.most_common():
        print("  " + str(v).rjust(5) + "  " + k)


if __name__ == "__main__":
    main()
