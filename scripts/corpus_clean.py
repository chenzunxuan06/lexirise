# -*- coding: utf-8 -*-
"""
corpus_clean.py —— 语料清洗（修复 + 闸门）

⚠️ 必须在【收集句子时】调用，也就是在建 byWord / byWordForm 索引【之前】。
   那些索引存的是句子的下标；先建索引再删句子，下标会整体错位，
   而错位不会报错 —— 只会让"课本原句"随机对到别的句子上。

两条处理路径：
  repair(s)  能修的修：PDF 断词（exciti ng -> exciting）、空格在标点前
  gate(s)    修不了的挡：句首粘页眉、引号不配对、冠词后跟代词
             每一条被挡掉的都必须能说出理由（项目纪律）

词典（用于断词判定）缺失时**降级**：跳过断词修复并告警，而不是让整条流水线挂掉。
"""
import os
import re

ROOT = r"E:\初二"
DICT = os.path.join(ROOT, "挑战杯-2026", "_dict", "words_alpha.txt")

SECTION_LABELS = {
    "reading", "listening", "speaking", "writing", "grammar", "project",
    "vocabulary", "culture", "revision", "unit", "module", "before", "after",
    "warm", "lead", "task", "exercise", "practice", "section", "part",
    "appendix", "contents", "review", "pre", "post", "more", "getting",
    "focusing", "cross-curricular", "integrated", "skills", "strategy",
}

_D = None
_D_WARNED = False


def _dict():
    global _D, _D_WARNED
    if _D is None:
        _D = set()
        if os.path.exists(DICT):
            with open(DICT, encoding="utf-8", errors="ignore") as f:
                for line in f:
                    w = line.strip().lower()
                    if w.isalpha():
                        _D.add(w)
        elif not _D_WARNED:
            print("[corpus_clean] 警告：缺词典 " + DICT + " —— 跳过断词修复")
            _D_WARNED = True
    return _D


def repair(s):
    """返回 (修好的句子, [做过的修复])。不改变任何词，只把断开的接回去、把空格归位。"""
    fixes = []
    # ① 断词：碎片不是词，碎片+下一段才是词 -> 接回去
    D = _dict()
    if D:
        toks = s.split()
        out = []
        i = 0
        while i < len(toks):
            if i + 1 < len(toks):
                a = toks[i].strip('.,;:!?"()')
                b = toks[i + 1].strip('.,;:!?"()')
                # ①b 带连字符的换行断词："dif- ferent" -> "different"
                #    为什么原来漏了：下一行那条规则要求 a.isalpha()，而 "dif-" 末尾带连字符，
                #    于是它连判断都没进 —— 实测语料里还留着 "dif ferent" 这种（出现在被引用的原句里）。
                if a.endswith("-") and a[:-1].isalpha() and b.isalpha() and (a[:-1] + b).lower() in D:
                    out.append(a[:-1] + b)
                    fixes.append("断词(连字符) " + a + "+" + b)
                    i += 2
                    continue
                if a.isalpha() and b.isalpha() and a.lower() not in D and (a.lower() + b.lower()) in D:
                    out.append(a + b)
                    fixes.append("断词 " + a + "+" + b)
                    i += 2
                    continue
            out.append(toks[i])
            i += 1
        s = " ".join(out)
    # ② 空格在标点前（"near the equator ." -> "near the equator."）
    s2 = re.sub(r"\s+([,;:!?])", r"\1", s)
    s2 = re.sub(r"\s+\.(?![.\s])", ".", s2)
    if s2 != s:
        fixes.append("空格在标点前")
    s = s2
    s = re.sub(r"\s{2,}", " ", s).strip()
    return s, fixes


def fragment_mash(s):
    """这句是不是"把不相干的几段拼成了一句"（词框/表格/题干被 PDF 抽平）。

    判据只有一条：**句末标点后面直接跟小写字母**。
      "Why or why not? end glad heart rise wake up watch over Your ideas 4 Discuss the question below."
      "What did Simon do in the art class? diary luckily pack realize success In Australia, students go ..."

    正文里不会出现 ". " 后面接小写（英文句子首字母必大写）。
    唯一会误伤的是缩写（Mr. / e.g. / etc.）—— 教材正文里极少，实测抽样 12 条全是真拼接。

    为什么单列：quality() 是**排序**用的，它奖励长句，于是这种又长又杂的串反而容易排到前面，
    被当成"课本原句"显示给学生。实测 4336 条引用里 404 条是这类（9.3%）。
    """
    return bool(re.search(r"[.!?]\s+[a-z]", s))


def single_letter_break(s):
    """这句里有没有"单字母 + 小写碎片 = 一个真词"的断词（如 "Y es" / "P eople"）。

    ⚠️ 这是 repair() 修不到的一类，而且原因是**词典本身**：
      repair 的前提是"碎片 a 不是词"，但 words_alpha 里收了 y / n / o / s / t
      这些单字母，于是 "Y es" 会被当成"Y 是个词"而放过。
    实测（本函数扫全语料）：93 句命中，形如
      "P eople like to / enjoy ..." / "N ine white tigers ..." / "S ome places are very hot ..."

    为什么只判定、不自动接回去：同形里混着**不是**断词的情况 ——
      配对练习用 a/b/c/d 当标号："If you tie something, d it is not very high."
    一刀切接回去会制造新错（**误报的统计比没有统计更糟**）。
    所以这里只给判定，要不要引用这句话，由调用方决定（见 build_corpus 的兜底路径）。
    """
    D = _dict()
    if not D:
        return False
    toks = s.split()
    for i in range(len(toks) - 1):
        a = toks[i].strip('.,;:!?"()')
        b = toks[i + 1].strip('.,;:!?"()')
        if len(a) != 1 or not a.isalpha() or not b.isalpha():
            continue
        al, bl = a.lower(), b.lower()
        if al in ("a", "i"):
            continue
        if (al + bl) in D:
            return True
    return False


def header_glue(s):
    """开头粘了页眉：第一个词是栏目名，且后面还跟着大写词或数字。

    只看"第一个词是栏目名"会误报约 18%（After that... / Warm rain falls... / Before modern times...），
    所以必须加第二个条件。见 corpus_audit.py 里的同一段说明。
    """
    toks = s.split()
    if not toks:
        return False
    if toks[0].strip('.,:;!?"()').lower() not in SECTION_LABELS:
        return False
    if len(toks) > 1 and toks[1].strip('.,:;!?"()').isdigit():
        return True
    for t in toks[1:6]:
        if t.strip('.,:;!?"()')[:1].isupper():
            return True
    return False


def gate(s):
    """返回 (能不能用, 理由)。修不了的句子在这里挡掉。"""
    if header_glue(s):
        return False, "句首粘页眉"
    if s.count('"') % 2 == 1:
        return False, "引号不配对（从对话中间截出）"
    if re.search(r"\b(?:a|an|the)\s+(?:our|your|their|his|her|my|its|you|we|they)\b", s, re.I):
        return False, "冠词后跟代词（两栏文字交错）"
    return True, "ok"


def clean(s):
    """一步到位：先修，再判。返回 (句子, ok, 理由, 修复列表)。"""
    fixed, fixes = repair(s)
    ok, why = gate(fixed)
    return fixed, ok, why, fixes
