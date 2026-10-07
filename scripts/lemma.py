#!/usr/bin/env python
# ============================================================
# scripts/lemma.py —— 词形还原（T15 的内核）
# ------------------------------------------------------------
# 思路（来自任务单）：
#   规则还原会产出一堆垃圾候选（bigg / mak / studie），
#   但**只有真正的原形能在 1535 词库里命中** —— 词库本身就是最好的消歧器。
#   所以这里只生成候选，不做判断；判断交给调用方拿词库去筛。
#
# 用法：
#   from lemma import candidates, resolve
#   candidates("studies")            -> ["studies", "study", "studie", ...]
#   resolve("studies", vocab_set)    -> "study"   （按优先级返回第一个命中的）
#
# 为什么不用 nltk / spacy：
#   ① 要联网装大包，答辩现场是个风险点；
#   ② 面向的是初中教材里有限、规则化的词形，规则表 + 词库消歧足够；
#   ③ 出错时我看得懂自己的规则，看得懂才好修。
# ============================================================

# 不规则变化：词形 -> 原形。只收初中教材里真会出现的。
IRREGULAR = {
    # be / have / do
    "am": "be", "is": "be", "are": "be", "was": "be", "were": "be", "been": "be", "being": "be",
    "has": "have", "had": "have", "having": "have",
    "does": "do", "did": "do", "done": "do", "doing": "do",
    # 高频不规则动词
    "went": "go", "gone": "go", "goes": "go",
    "said": "say", "says": "say",
    "made": "make", "took": "take", "taken": "take",
    "came": "come", "got": "get", "gotten": "get",
    "gave": "give", "given": "give",
    "found": "find", "thought": "think", "told": "tell",
    "became": "become", "left": "leave", "felt": "feel",
    "brought": "bring", "began": "begin", "begun": "begin",
    "kept": "keep", "held": "hold",
    "wrote": "write", "written": "write",
    "stood": "stand", "heard": "hear", "meant": "mean",
    "met": "meet", "ran": "run", "paid": "pay", "sat": "sit",
    "spoke": "speak", "spoken": "speak", "led": "lead",
    "grew": "grow", "grown": "grow", "lost": "lose",
    "fell": "fall", "fallen": "fall", "sent": "send",
    "built": "build", "understood": "understand",
    "drew": "draw", "drawn": "draw",
    "broke": "break", "broken": "break", "spent": "spend",
    "rose": "rise", "risen": "rise",
    "drove": "drive", "driven": "drive",
    "bought": "buy", "wore": "wear", "worn": "wear",
    "chose": "choose", "chosen": "choose",
    "ate": "eat", "eaten": "eat",
    "flew": "fly", "flown": "fly", "flew": "fly",
    "forgot": "forget", "forgotten": "forget",
    "taught": "teach", "caught": "catch",
    "threw": "throw", "thrown": "throw",
    "slept": "sleep", "swam": "swim", "swum": "swim",
    "rode": "ride", "ridden": "ride", "won": "win",
    "shone": "shine", "hung": "hang",
    "hid": "hide", "hidden": "hide",
    "blew": "blow", "blown": "blow",
    "bent": "bend", "bit": "bite", "bitten": "bite",
    "bled": "bleed", "lay": "lie", "lain": "lie",
    "sang": "sing", "sung": "sing",
    "drank": "drink", "drunk": "drink",
    "rang": "ring", "rung": "ring",
    "rose_": "rise", "shook": "shake", "shaken": "shake",
    "spread": "spread", "cost": "cost", "hurt": "hurt",
    "cut": "cut", "put": "put", "let": "let", "set": "set",
    "read": "read", "hit": "hit", "shut": "shut",
    # 名词不规则复数
    "children": "child", "men": "man", "women": "woman",
    "feet": "foot", "teeth": "tooth", "mice": "mouse",
    "geese": "goose", "people": "person",
    # 比较级 / 最高级
    "better": "good", "best": "good",
    "worse": "bad", "worst": "bad",
    "more": "many", "most": "many",
    "less": "little", "least": "little",
    "further": "far", "furthest": "far",
    "farther": "far", "farthest": "far",
}

VOWELS = "aeiou"

# 以 s 结尾但**不是复数**的词 —— 砍掉 s 会造出另一个真词。
# 实测踩到的：sometimes（有时）被砍成 sometime（在某时），两个都是词库里的词条。
NO_STRIP_S = {
    "sometimes", "always", "perhaps", "towards", "across", "else", "this", "his",
    "its", "us", "yes", "thus", "plus", "series", "news", "means", "outdoors",
    "upstairs", "downstairs", "afterwards", "backwards", "forwards", "besides",
    "unless", "themselves", "ourselves", "yourselves", "themselves", "as", "is",
    "was", "has", "does", "goes",
}


def _doubled_undouble(stem):
    """running -> runr 这种，把结尾重复辅音去掉一个。"""
    if len(stem) >= 2 and stem[-1] == stem[-2] and stem[-1] not in VOWELS:
        return [stem[:-1], stem]
    return [stem]


def candidates(tok):
    """
    给出这个词形所有可能的原形候选（含它自己），按"可能性从高到低"排序。
    宁滥勿缺 —— 判断交给词库。
    """
    out = []

    def add(*xs):
        for x in xs:
            if x and len(x) >= 2 and x not in out:
                out.append(x)

    t = str(tok).strip().lower()
    add(t)

    # ① 不规则表：**命中就到此为止**，不再走规则。
    #    为什么必须短路：better 在不规则表里映射到 good，但如果 good 恰好不在词库里，
    #    继续走 -er 规则会砍出 bett -> bet —— 而 bet（打赌）真在词库里。
    #    实测就是这么把 "this makes us feel better" 挂到"打赌"上的。
    if t in IRREGULAR:
        add(IRREGULAR[t])
        return out

    # ② 所有格 / 缩写
    if t.endswith("'s") or t.endswith("s'"):
        add(t[:-2])
    if t.endswith("n't"):
        add(t[:-3])

    # ③ 复数 / 第三人称单数
    if t.endswith("ies") and len(t) > 3:
        add(t[:-3] + "y")                      # studies -> study
    if t.endswith("ves") and len(t) > 3:
        add(t[:-3] + "f", t[:-3] + "fe")       # knives -> knife / wolves -> wolf
    # ⚠️ NO_STRIP_S 的守卫必须**同时**加在 -es 和 -s 两条规则上。
    #    only 加在 -s 上是不够的：sometimes 也以 es 结尾，会被 -es 规则砍成 sometime。
    if t.endswith("es") and len(t) > 2 and t not in NO_STRIP_S:
        add(t[:-2], t[:-1])                    # watches -> watch, goes -> go
    if t.endswith("s") and not t.endswith("ss") and len(t) > 2 and t not in NO_STRIP_S:
        add(t[:-1])                            # books -> book

    # ④ 过去式 / 过去分词
    if t.endswith("ied") and len(t) > 3:
        add(t[:-3] + "y")                      # carried -> carry
    if t.endswith("ed") and len(t) > 2:
        stem = t[:-2]
        # ⚠️ 顺序很重要：**先试 stem+"e"**。
        #    liked  -> stem "lik"  → 先 "like"（对），否则会先给 "lik"；
        #    used   -> stem "us"   → 先 "use"（对），否则会先给 "us" —— 而 "us" 真在词库里。
        add(stem + "e", stem)                  # liked -> like, walked -> walk
        for s in _doubled_undouble(stem):
            add(s)                             # stopped -> stop
        if stem.endswith("i"):
            add(stem[:-1] + "y")               # studied -> study

    # ⑤ 现在分词 / 动名词
    if t.endswith("ing") and len(t) > 3:
        stem = t[:-3]
        add(stem + "e", stem)                  # making -> make, walking -> walk
        for s in _doubled_undouble(stem):
            add(s)                             # running -> run
        if stem.endswith("y"):
            add(stem)

    # ⑥ 副词 -ly
    if t.endswith("ily") and len(t) > 3:
        add(t[:-3] + "y")                      # happily -> happy
    if t.endswith("ly") and len(t) > 2:
        add(t[:-2])                            # quickly -> quick
        if t.endswith("bly"):
            add(t[:-3] + "ble")                # possibly -> possible
        if t.endswith("ally") and len(t) > 4:
            add(t[:-4], t[:-4] + "al", t[:-4] + "e")   # basically -> basic

    # ⑦ 比较级 / 最高级
    if t.endswith("ier") and len(t) > 3:
        add(t[:-3] + "y")
    if t.endswith("iest") and len(t) > 4:
        add(t[:-4] + "y")
    if t.endswith("er") and len(t) > 2:
        stem = t[:-2]
        add(stem, stem + "e")
        for s in _doubled_undouble(stem):
            add(s)
    if t.endswith("est") and len(t) > 3:
        stem = t[:-3]
        add(stem, stem + "e")
        for s in _doubled_undouble(stem):
            add(s)

    return out


def resolve(tok, vocab):
    """
    在候选里挑出真正的原形：**第一个命中词库的候选**。
    命中不了就返回 None（说明这个词形还原不出来，不硬猜）。

    vocab 可以是 set，也可以是 term -> 词条 的 dict/list（只用到 in）。
    """
    cs = candidates(tok)
    for c in cs:
        if c in vocab:
            return c
    # 候选本身还可能是不规则形式（children's -> children -> child）
    for c in cs:
        irr = IRREGULAR.get(c)
        if irr and irr in vocab:
            return irr
    return None
