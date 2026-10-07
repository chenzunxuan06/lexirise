# -*- coding: utf-8 -*-
"""
build_phrases.py —— 给语料补【短语索引】（第二版：容忍占位符与词形变化）

第一版只做字面匹配，278 条里只命中 178 条（64%）。
看剩下 100 条，缺的原因分四类，其中三类是可以修的：

  ① 占位符：take one's eyes off something / cheer somebody up / add ... to...
     —— 词表写的是"某人的/某人"，正文里是 my/his/them，字面永远匹配不上
  ② 首词变形：take off -> took off / be based on -> is based on / go missing -> went missing
  ③ 尾词复数：life jacket -> life jackets
  ④ 真正不在正文里（这类补不了，也不该硬凑）

所以本版：首词允许词形变化（含常见不规则动词），尾词允许复数，be 允许各种形式，
one's/somebody/... 换成对应的正则。**中间词一律保持精确** —— 放宽只放该放的地方。
"""
import json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from corpus_clean import fragment_mash   # 与 build_corpus 共用同一道闸门（不要另写一份判据）

ROOT = r"E:\初二"
CORPUS = os.path.join(ROOT, "web", "public", "corpus")
WORDS = os.path.join(ROOT, "web", "public", "words.json")
BOOKS = {"7A": (7, 1), "7B": (7, 2), "8A": (8, 1), "8B": (8, 2), "9A": (9, 1), "9B": (9, 2)}

BE_FORMS = r"(?:be|am|is|are|was|were|been|being|'s|'re)"
PRON = r"(?:my|your|his|her|its|our|their|one's|somebody's|someone's|sb's|the)"
SB = r"(?:somebody|someone|sb|him|her|them|us|me|you|it|people)"

IRREGULAR = {
    "take": ["took", "taken", "takes", "taking"],
    "make": ["made", "makes", "making"],
    "get": ["got", "gotten", "gets", "getting"],
    "go": ["went", "gone", "goes", "going"],
    "come": ["came", "comes", "coming"],
    "give": ["gave", "given", "gives", "giving"],
    "find": ["found", "finds", "finding"],
    "keep": ["kept", "keeps", "keeping"],
    "leave": ["left", "leaves", "leaving"],
    "feel": ["felt", "feels", "feeling"],
    "hold": ["held", "holds", "holding"],
    "think": ["thought", "thinks", "thinking"],
    "bring": ["brought", "brings", "bringing"],
    "buy": ["bought", "buys", "buying"],
    "catch": ["caught", "catches", "catching"],
    "choose": ["chose", "chosen", "chooses", "choosing"],
    "fall": ["fell", "fallen", "falls", "falling"],
    "grow": ["grew", "grown", "grows", "growing"],
    "know": ["knew", "known", "knows", "knowing"],
    "lose": ["lost", "loses", "losing"],
    "meet": ["met", "meets", "meeting"],
    "pay": ["paid", "pays", "paying"],
    "put": ["puts", "putting"],
    "ride": ["rode", "ridden", "rides", "riding"],
    "rise": ["rose", "risen", "rises", "rising"],
    "run": ["ran", "runs", "running"],
    "say": ["said", "says", "saying"],
    "see": ["saw", "seen", "sees", "seeing"],
    "sell": ["sold", "sells", "selling"],
    "send": ["sent", "sends", "sending"],
    "set": ["sets", "setting"],
    "show": ["showed", "shown", "shows", "showing"],
    "sit": ["sat", "sits", "sitting"],
    "speak": ["spoke", "spoken", "speaks", "speaking"],
    "spend": ["spent", "spends", "spending"],
    "stand": ["stood", "stands", "standing"],
    "teach": ["taught", "teaches", "teaching"],
    "tell": ["told", "tells", "telling"],
    "turn": ["turned", "turns", "turning"],
    "write": ["wrote", "written", "writes", "writing"],
}


def head_pattern(word):
    """首词：允许词形变化"""
    lw = word.lower()
    opts = [re.escape(word)]
    if lw == "be":
        opts.append(BE_FORMS)
    if lw in IRREGULAR:
        opts.extend(re.escape(v) for v in IRREGULAR[lw])
    opts.append(re.escape(word) + r"(?:s|es|ed|d|ing)")
    return "(?:" + "|".join(sorted(set(opts), key=len, reverse=True)) + ")"


def tail_pattern(word):
    """尾词：允许复数"""
    return "(?:" + re.escape(word) + r"(?:s|es)?)"


def mid_pattern(word):
    """中间词：精确"""
    return re.escape(word)


def pattern_for(phrase):
    """把短语变成正则。占位符按语义展开；其余按位置区别对待。"""
    s = phrase.strip()
    # 占位符先换掉（整体替换，不参与分词）
    s = re.sub(r"\bone'?s\b", "\x01", s, flags=re.I)
    s = re.sub(r"\b(?:somebody|someone|sb)\b", "\x02", s, flags=re.I)
    s = re.sub(r"\s*\.\.\.\s*", " \x03 ", s)
    toks = [t for t in re.split(r"[\s\-]+", s) if t]
    if not toks:
        return None
    out = []
    for i, t in enumerate(toks):
        if t == "\x01":
            out.append(PRON)
        elif t == "\x02":
            out.append(SB)
        elif t == "\x03":
            out.append(r".{0,40}?")
        elif i == 0:
            out.append(head_pattern(t))
        elif i == len(toks) - 1:
            out.append(tail_pattern(t))
        else:
            out.append(mid_pattern(t))
    core = r"[\s\-]+".join(out)
    return re.compile(r"(?<![A-Za-z])" + core + r"(?![A-Za-z])", re.I)


def main():
    words = json.load(open(WORDS, encoding="utf-8"))["words"]
    grand_ph = grand_hit = 0
    for bk, (g, s) in BOOKS.items():
        path = os.path.join(CORPUS, bk + ".json")
        c = json.load(open(path, encoding="utf-8"))
        sents = c["sentences"]
        phrases = [w for w in words if w["grade"] == g and w["semester"] == s and w["entry_type"] == "phrase"]
        by_phrase, hit = {}, 0
        for w in phrases:
            pat = pattern_for(w["word_en"])
            if pat is None:
                continue
            # ⚠️ 与 build_corpus 用同一道闸门：碎片拼接的句子不能当"课文原句"引用。
            #    第一版漏了这里 —— 结果 61 条短语引用指向
            #    "Why or why not? end glad heart rise wake up watch over Your ideas 4 Discuss ..."
            #    这种词框串（而且它还会被并进 byWordAny，把词条那边也带脏）。
            found = [i for i, t in enumerate(sents) if pat.search(t) and not fragment_mash(t)]
            if found:
                by_phrase[str(w["id"])] = found[:3]
                hit += 1
        c["byPhrase"] = by_phrase
        # ⚠️ 这里是**替换**短语那部分，不是累加。
        #    第一版写成 anyk = dict(byWordAny); anyk.update(by_phrase) —— 于是
        #    上一轮合并进去的短语条目永远留在文件里：**改了判据也清不掉旧结果**。
        #    实测：给短语加上"碎片拼接"闸门后重跑，脏引用一条没少（因为旧的那批还在）。
        #    正确做法 = 先删掉所有短语 id 的条目（词的条目由 build_corpus 负责，保持不动），再合并本轮结果。
        phrase_ids = {str(w["id"]) for w in phrases}
        anyk = {k: v for k, v in (c.get("byWordAny") or {}).items() if k not in phrase_ids}
        anyk.update(by_phrase)
        c["byWordAny"] = anyk

        # 词表出处兜底（与 build_corpus 的 byVocab 同一口径）：
        # 正文里没有可引用的句子，但短语出现在词框/词表页里 —— 那一页就是它的出处。
        # 同样是"替换短语那部分"，避免上一轮的条目残留。
        by_vocab = {}
        for w in phrases:
            pid = str(w["id"])
            if pid in by_phrase:
                continue
            pat = pattern_for(w["word_en"])
            if pat is None:
                continue
            got = [i for i, t in enumerate(sents) if pat.search(t) and fragment_mash(t)]
            if got:
                by_vocab[pid] = got[:1]
        vk = {k: v for k, v in (c.get("byVocab") or {}).items() if k not in phrase_ids}
        vk.update(by_vocab)
        c["byVocab"] = vk
        json.dump(c, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
        print("  %s 短语 %d，命中 %d (%.1f%%)" % (bk, len(phrases), hit, 100.0 * hit / max(1, len(phrases))))
        grand_ph += len(phrases); grand_hit += hit
    print("四册短语合计 %d，命中 %d，覆盖率 %.1f%%" % (grand_ph, grand_hit, 100.0 * grand_hit / max(1, grand_ph)))


if __name__ == "__main__":
    main()
