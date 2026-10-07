#!/usr/bin/env python
# ============================================================
# scripts/build_corpus.py —— 从官方教材 PDF 抽课文句子（T14 / T16）
# ------------------------------------------------------------
# 输入：挑战杯-2026\_textbook\*.pdf（有文本层的用 pypdf 直读）
# 输出：public/corpus/{册}.json —— sentences + byWord 反向索引
#
# 三条设计决定：
#   ① 单元归属靠**单元扉页**（正文里 "Unit objectives" 那一页），不靠猜。
#      顺带解决 D4（七下/九下词库缺页码）—— 单元边界从书里现读。
#      七上/八上/八下/九上有页码，正好拿来交叉验证。
#   ② 只留句子级引用（每词最多 3 句 + 出处），不做全文入库 ——
#      这是 词跃-课文语料索引方案.md 里定死的版权红线。
#   ③ 源头是扫描件时直接跳过并说明，不偷偷塞空数据。
#
# 【踩过的两个坑，别再踩】
#   坑 1：一开始用"页面里出现 Unit N"当单元起点 —— 目录页把 Unit 1…8 连排，
#         8 个单元全被定位到前几页，七上只抽出 109 句、覆盖率 9%。
#   坑 2：words.json 的 page 字段是字符串 "p.4"，不是数字 4。
#         按 isinstance(int) 判断会全军覆没，必须正则取数。
# ============================================================
import json, re, sys, os, logging
from collections import defaultdict, Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lemma import resolve   # T15 词形还原
from corpus_clean import clean as clean_sentence, single_letter_break, fragment_mash   # 语料清洗（修复 + 闸门 + 两条引用闸门）

logging.getLogger("pypdf").setLevel(logging.CRITICAL)
from pypdf import PdfReader

sys.stdout.reconfigure(encoding="utf-8")

ROOT = r"E:\初二"
TEXTBOOK = ROOT + r"\挑战杯-2026\_textbook"
OUTDIR = ROOT + r"\web\public\corpus"

# 六册（用哪个年度版见 manifest.json）
#   前四册 PDF 自带文本层，直接抽。
#   九上（9A）是**真扫描件**（166 页，每页 0 字符文本 + 1 张图）—— 必须走 OCR。
#      OCR 用 **Windows 自带的 OCR 引擎**（零下载），但**必须指定 en-US 引擎**：
#      默认的中文引擎会把 o 认成 0（d0 / whO / tO），还会往英文里插汉字，那样出来的
#      文本根本没法做词匹配。文本落在 _server_scripts/ocr_9A_txt/page-NNN.txt。
#   九下（9B）**有完整文本层**，只是加了密 —— 空密码即可解开，不需要 OCR。
BOOKS = [
    ("7A", "7A-2025.pdf", 7, 1),
    ("7B", "7B.pdf",      7, 2),
    ("8A", "8A-2024.pdf", 8, 1),
    ("8B", "8B.pdf",      8, 2),
    ("9A", "9A.pdf",      9, 1),
    ("9B", "9B.pdf",      9, 2),
]

# 没有文本层的册 -> OCR 结果目录
OCR_DIRS = {
    "9A": ROOT + r"\_server_scripts\ocr_9A_txt",
}

WM = re.compile(r"7A00\d+\d?秋备案|\d?秋备案")
# 单元扉页：行首可能带印刷页码，而且**可能印两遍**。
# 七上写 "2 Unit objectives…"，七下写 "2 2 Unit objectives…" ——
# 只允许一个数字的正则会在七下全军覆没（实测：8 个单元一个都没匹配上）。
OPENER = re.compile(r"^\s*((?:\d{1,3}\s+)*)Unit\s+objectives\b", re.I)
ABBR = r"(?:Mr|Mrs|Ms|Dr|Prof|St|vs|etc|e\.g|i\.e|No|Fig|p|pp)"


def page_num(v):
    """words.json 的 page 是 "p.4" 这种字符串 —— 必须正则取数。"""
    if isinstance(v, int):
        return v
    if isinstance(v, str):
        m = re.search(r"(\d+)", v)
        return int(m.group(1)) if m else None
    return None


# PDF 抽出来的文本有两类系统性杂质。不处理的话会一路带进学生看到的句子里，
# 而且看不太出来（"ﬁ nd" 和 "find" 长得太像了）。
#   ⚠️ 这个 bug 是 T20 抽样出题时发现的 —— 其实 T18 展示的原句里一直都有。
LIGATURES = {"\ufb00": "ff", "\ufb01": "fi", "\ufb02": "fl",
             "\ufb03": "ffi", "\ufb04": "ffl", "\ufb05": "st", "\ufb06": "st"}
FOOTNOTE_MARKS = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮"


def clean(t):
    t = WM.sub(" ", t or "")
    # 连字：PDF 里 fi/fl/ff 是**一个字符**；更糟的是有时后面还跟着一个空格
    # （"ﬁ nd"），所以先去空格再还原。
    t = re.sub("([" + "".join(LIGATURES.keys()) + "])\\s+", r"\1", t)
    for _k, _v in LIGATURES.items():
        t = t.replace(_k, _v)
    # 脚注序号
    t = re.sub("[" + FOOTNOTE_MARKS + "]", "", t)
    t = t.replace("\u2019", "'").replace("\u2018", "'")
    t = t.replace("\u201c", '"').replace("\u201d", '"')
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\s*\n\s*", "\n", t)
    return t.strip()


def split_sentences(block):
    """切句。规则保守：宁可少切，不可乱切。"""
    b = " ".join(block.split())
    parts = re.split(r"(?<=[.!?])\s+(?=[\"'(]?[A-Z0-9])", b)
    out = []
    for p in parts:
        p = p.strip()
        if not p:
            continue
        if out and re.search(ABBR + r"\.$", out[-1], re.I):
            out[-1] = out[-1] + " " + p     # 缩写词被误切，粘回去
        else:
            out.append(p)
    return out


# 板块标题 —— 词跃-课文语料索引方案.md 要求出处是"册次 · 单元 · 页码 · 板块"。
# 顺序有讲究：**更具体的放前面**（先认 "Reading comprehension" 再认 "Reading"）。
SECTIONS = [
    ("Reading comprehension", r"Reading comprehension"),
    ("Vocabulary practice",  r"Vocabulary practice"),
    ("Focusing on culture",  r"Focusing on culture"),
    ("Cross-curricular",     r"Cross-curricular connection"),
    ("Checking your progress", r"Checking your progress"),
    ("First thoughts",       r"First thoughts"),
    ("Listening",            r"\bListening\b"),
    ("Speaking",             r"\bSpeaking\b"),
    ("Writing",              r"\bWriting\b"),
    ("Reading",              r"\bReading\b"),
    ("Grammar",              r"\bGrammar\b"),
    ("Project",              r"\bProject\b"),
    ("Extending",            r"\bExtending\b"),
    # Section 1–4 的大标题放最后当兜底（子标题更具体，优先）。
    # 少了这几条，一个单元中段会一直沿用前面那个板块 ——
    # 实测七上 15–18 页（语法页）被误判成 "Vocabulary practice"。
    ("Section 2 · 语法运用",   r"Exploring and applying rules"),
    ("Section 3 · 表达交流",   r"Expressing and communicating ideas"),
    ("Section 4 · 拓展与检查", r"Extending and checking your progress"),
    ("学习方式",              r"LEARNING IN"),
]
SECTION_RE = [(name, re.compile(pat)) for name, pat in SECTIONS]


def section_of_page(text):
    """页面开头出现哪个板块标题。找不到返回 None（沿用上一页的板块）。"""
    head = text[:220]
    for name, rx in SECTION_RE:
        if rx.search(head):
            return name
    return None


# 练习题句首的标记。**该剥掉它，而不是把整句判死** ——
# 实测被质量底线挡掉的句子里，一多半只是因为这个前缀：
#   "T / F (3) It is painted mostly by hand."   -> "It is painted mostly by hand."
#   "(1) Trees use their branches to communicate with each other."
# 真正的垃圾（"• eat food • go shopping"）剥完还是垃圾，照样被底线拦下。
LEAD_MARKER = re.compile(
    r"^\s*(?:"
    r"T\s*/\s*F|True\s*/\s*False|[A-Z]\s*/\s*[A-Z]"      # T / F 判断标记
    r"|\(\s*\d+\s*\)|\d+\s*[.)]"                          # (1)  1.  2)
    r")\s*",
    re.I,
)


def strip_marker(s):
    """反复剥句首标记（"T / F (3) " 这种是两层）。"""
    for _ in range(3):
        t = LEAD_MARKER.sub("", s).strip()
        if t == s:
            break
        s = t
    return s.strip()


def keep(s):
    """什么样的句子能当课文原句：够长、够干净、真的是英文句子。"""
    if len(s) < 18 or len(s) > 240:
        return False
    words = re.findall(r"[A-Za-z][A-Za-z'\-]*", s)
    if len(words) < 5:
        return False
    if sum(1 for c in s if ord(c) < 128) / len(s) < 0.95:   # 混了太多中文 = 题干
        return False
    if s.count("_") >= 3:                                    # 填空线
        return False
    if re.match(r"^(Write|Listen|Discuss|Complete|Fill|Choose|Read|Work|Talk|Think)\b", s) and s.endswith(":"):
        return False
    letters = sum(1 for c in s if c.isalpha())
    if letters / max(1, len(s)) < 0.6:                       # 符号太多
        return False
    # 竖排的 "Section 4" 被抽成一串单字母："S S S S e e e c c t t i i o o n"。
    # 判据：单独成词的单字母出现 3 次以上。
    singles = len(re.findall(r"(?<![A-Za-z])[A-Za-z](?![A-Za-z])", s))
    if singles >= 3:
        return False
    return True


# 板块分两类 —— 这是"这句是课文还是题目"最可靠的信号。
# 踩过的坑：只按句长打分时，练习题里的**词堆**会刷到榜首。
# 实测 patient 抽出来的第一句是
#   "What personal qualities does your friend have? caring helpful kind polite funny honest patient ..."
# —— 这是词汇练习的单词串，不是句子；而课本里明明有
#   "He waited patiently for the big day to come."
# 修法：按句子所在板块加减分，课文段落优先。
PROSE_SECTIONS = {"Reading", "Reading comprehension", "First thoughts",
                  "Focusing on culture", "Cross-curricular", "Section 4 · 拓展与检查"}
# 练习板块不再单独扣分（见 quality() 里的说明）；这份名单留着备查。


def quality(s, section=None):
    """句子当"课文原句"的成色。用于每词多句候选时挑最好的那句。"""
    q = 0
    # 课文段落加正分；练习板块**不加不减** ——
    # 第一版给练习 -2，等于把所有"练习里的句子"一律判死，七下覆盖率掉了近 10 个点。
    # 但练习里的句子不一定差（"Describe in pairs what your new friends are like." 就挺好），
    # 所以只惩罚【明确有问题】的特征，见下面各条。
    if section in PROSE_SECTIONS:
        q += 3
    if re.match(r"^\(?\d+\)?\s", s):     q -= 2   # 题号开头 = 练习题
    if "•" in s:                          q -= 1   # 项目符号 = 题干
    if " / " in s:                        q -= 1
    if s.count("?") > 1:                  q -= 1
    if re.search(r"\b(T|F)\b", s):        q -= 1
    if re.search(r"\b\d{2,3}\b", s):      q -= 1   # 混进了页码
    if re.search(r"\b(below|following|blank|complete the)\b", s, re.I): q -= 1
    if re.search(r"\bStep\s*[123]\b", s):  q -= 2   # 写作步骤说明
    if s.count("•") >= 2:                  q -= 2   # 项目符号成串 = 提纲不是句子
    if s.rstrip().endswith(("...", "…")): q -= 2   # 被截断的题干
    q += min(3, len(re.findall(r"[A-Za-z]+", s)) // 8)   # 更喜欢长句
    return q


def prose_like(s):
    """这句看起来像"课文里的一句话"吗（兜底路径专用）。

    为什么单列一条：质量分 quality() 是**排序**用的，它奖励长句
    （+min(3, 词数//8)），于是一句又长又杂的表格串能靠长度把分数顶到 0 以上。
    实测（scripts/newly_covered.py 逐句人眼复核）残留下来的两句就是这类：

      "Change the form if necessary. failure pay ... back pilot public speaker regard (l) The main characte"
      "Scene: Aunt Polly's yard Characters: Tom Sawyer, Ben Rogers Plot: Step 3 Step 4 Step 5 Tom: (Sitting"

    两种都是**词框/表格/写作模板被 PDF 抽平**的结果，不是句子。判据只留三条，
    每条都对应上面这句话里的可见特征，不猜：
      · 省略号   —— 模板占位或被截断
      · 括号     —— 词框/说明栏（正文句子不会用括号夹词性）
      · 项目符号 —— 提纲
      · 指令开头 —— "Step 1 Plan …" / "Discuss the questions …" 是作业要求，不是课文

    第三条与 keep() 里那条同源（那边按冒号结尾判定，这边因为它后面还跟着一整句
    模板文字、不以冒号结尾，所以单列）。
    """
    if "..." in s or "\u2026" in s:
        return False
    if "(" in s or ")" in s:
        return False
    if "\u2022" in s:
        return False
    if re.match(r"^\s*(?:Step\s*\d|Discuss|Write|Listen|Choose|Complete|Read|Work|Talk|"
                r"Think|Answer|Look|Match|Fill|Ask|Tell|Share|Make|Plan|Note|Put|Tick|Circle)\b",
                s, re.I):
        return False
    return True


# 质量底线：低于它就不给这个词配"课本原句"。
# 理由与展示优先级第③条一致 —— **显示一句错的，比不显示更糟**：
#   学生看到 "Step 1 Plan Draw your own mind map." 当"课本原句"，
#   会以为索引坏了；而这一块本来就有兜底（旧的 568 条例句）。
QUALITY_FLOOR = 0

# 兜底（跨单元）那一路的质量底线。
#
# 【为什么最后定在 0，而不是更松】
#   第一版放到了 -2，覆盖率从 87.1% 涨到 89.2%（多 23 个词），**数字很好看**。
#   但按纪律做了人眼抽样（scripts/newly_covered.py 列出每一句），23 句里 11 句不能用：
#     · 词汇/提纲串：  "Characteristics: friendly helpful kind patient supportive ..."
#     · 写作模板：    "A significant milestone in his / her life was when ..."
#     · 作业指令：    "3 Listen again and complete the fact sheet about the Fuxing ..."
#     · 栏目语：      "Speaking • Learn to talk about illness and health. • Conduct a survey ..."
#     · 被截断的：    "What we can do to save trees: • Tell others why trees are important. • Call ..."
#   这些当"课本原句"显示出来，学生会以为索引坏了 —— 正是 QUALITY_FLOOR 注释里说的那件事。
#   **覆盖率是给别人看的数，句子是给学生看的**；两者冲突时按后者。
#   放宽的另一半收益（真句子）在 0 这一档已经全部拿到，所以这里与正选同档。
ANY_FLOOR = 0


# 页眉形如 "Unit 3 Trees and us 38 Reading comprehension ..."，那个 38 就是印刷页码。
# 比"扉页行首的数字"可靠得多，八上/八下没有扉页数字时靠它。
# 页眉有两种印法，两种都要认：
#   八上： "Unit 3 Our digital lives 34 Unit objectives ..."   —— 页码在标题后
#   八下： "34 ① animation /.../ Key question ... Unit 3 Comics" —— 页码在行首
HEADER_PAGE = re.compile(r"Unit\s*[1-8]\b[^\n]{0,44}?\s(\d{1,3})\s")
LEAD_NUM = re.compile(r"^\s*(\d{1,3})\s+\S")


def offset_from_header(pages):
    """用页眉里的印刷页码算 PDF 页偏移；多数投票，抗单页噪声。"""
    offs = []
    for i, t in enumerate(pages):
        p = None
        m = HEADER_PAGE.search(t[:140])
        if m:
            p = int(m.group(1))
        else:
            m2 = LEAD_NUM.match(t)
            if m2:
                p = int(m2.group(1))
        if p is not None and 1 <= p <= 400:
            offs.append(i + 1 - p)
    if not offs:
        return None
    return Counter(offs).most_common(1)[0][0]


OPENER_ANY = re.compile(r"Unit\s+objectives\b", re.I)
LEAD_NUMS = re.compile(r"^\s*((?:\d{1,3}\s+)*)")


def find_openers(pages):
    """
    单元扉页 = 页面【开头一小段】里出现 "Unit objectives" 的那一页。

    ⚠️ 不能要求它在行首。三家印法不一样，实测：
        七上  "2 Unit objectives I can: ..."                    行首是页码
        七下  "2 2 Unit objectives I can: ..."                  页码印了两遍
        八上  "Unit 3 Our digital lives 34 Unit objectives ..."  前面挂着页眉
    要求行首的话，八上八下一个扉页都认不出来 —— 只能退回"词库页码法"，
    而那个方法定出的单元边界是【少一截】的，于是本单元句子大量判到单元外
    （实测八上本单元覆盖从 87% 掉到 63%）。
    """
    hits = []
    for i, t in enumerate(pages):
        head = t[:150]
        if not OPENER_ANY.search(head):
            continue
        m = LEAD_NUMS.match(head)
        nums = re.findall(r"\d{1,3}", m.group(1) or "")
        page = int(nums[-1]) if nums else None
        if page is None:
            m2 = HEADER_PAGE.search(head)
            if m2:
                page = int(m2.group(1))
        hits.append((i, page))
    return hits


# ------------------------------------------------------------
# 九下（9B）专用定位
# ------------------------------------------------------------
# 九下是**另一套排版**：以 Module 分节，单元扉页长这样
#     Module 1 Explorations and exchanges
#     1
#     Unit
#     1
#      Great explorations
# 全册 0 页含 "Unit objectives"，所以前四册的"单元扉页法"在这里必然失败；
# 词库页码法也兜不住（九下词条没有页码）。
#
# 但它有个更稳的特征：**每一页的页眉里都带单元号** ——
# 页眉的形态是「印刷页码，换行，Unit 空格 单元号」，正文紧随其后。
# 所以改用页眉定位。
HEADER_UNIT = re.compile(r"^\s*(\d{1,3})\s*\n\s*Unit\s+(\d{1,2})\b")
OPENER_UNIT = re.compile(r"^Module\s+\d+[^\n]*\n\s*(\d{1,3})\s*\n\s*Unit\s*\n?\s*(\d{1,2})\b")


def unit_of_page_9b(pages):
    n = len(pages)
    assign = {}
    starts = {}
    offs = []
    cur = None
    for i, t in enumerate(pages):
        head = t[:220]
        m = OPENER_UNIT.match(head) or HEADER_UNIT.match(head)
        if m:
            printed = int(m.group(1))
            u = int(m.group(2))
            if 1 <= u <= 8:
                cur = u
                if u not in starts:
                    starts[u] = i + 1
                offs.append((i + 1) - printed)
        if cur is not None:
            assign[i] = cur
    if len(starts) < 4:
        return {}, "无法定位(九下)", {}, None
    offset = Counter(offs).most_common(1)[0][0] if offs else None
    return assign, "九下页眉法", starts, offset


def unit_of_page(pages, word_pages):
    """
    返回 (assign, method, starts_1based, offset)
      assign        页索引 -> 单元号
      starts_1based 单元号 -> 起始页（1 起，PDF 页）
      offset        PDF 页号 - 印刷页号（用于把出处换算成书上印的页码）
    """
    n = len(pages)
    offset = None
    hits = find_openers(pages)
    # 合理性检查：至少 6 个、严格递增、且整体铺开（不能全挤在前 20 页）
    if len(hits) >= 6 and all(hits[k][0] < hits[k + 1][0] for k in range(len(hits) - 1)) \
            and hits[min(7, len(hits) - 1)][0] - hits[0][0] >= 20:
        hits = hits[:8]
    else:
        hits = []
    if len(hits) >= 6:
        starts = {k + 1: h[0] for k, h in enumerate(hits[:8])}
        offs = [h[0] + 1 - h[1] for h in hits[:8] if h[1]]
        offset = Counter(offs).most_common(1)[0][0] if offs else None
        method = "单元扉页法"
    else:
        # 兜底：用词库页码区间（七上/八上/八下/九上有页码）
        starts = {}
        for u in range(1, 9):
            pgs = word_pages.get(u)
            if pgs:
                starts[u] = min(pgs) - 1
        if len(starts) < 6:
            return {}, "无法定位", {}, None
        method = "词库页码法"

    order = sorted(starts)
    assign = {}
    for k, u in enumerate(order):
        lo = starts[u]
        hi = starts[order[k + 1]] if k + 1 < len(order) else n
        for i in range(max(0, lo), min(n, hi)):
            assign[i] = u
    return assign, method, {u: starts[u] + 1 for u in order}, offset


def offset_from_tail(pages):
    """扫描册的印刷页码在**页尾**（OCR 会把页脚一起认出来），不在页首。

    实测：PDF 第 41 页结尾是 "...34"，第 80 页结尾是 "...73" —— 两者都指向偏移 7，
    和前四册一致。但页首读法算出来是 79，会把 출处显示成 "课本 p.-66"（负数）。
    """
    offs = []
    for i, t in enumerate(pages):
        m = re.search(r"(\d{1,3})\s*$", (t or "").strip())
        if m:
            offs.append((i + 1) - int(m.group(1)))
    return Counter(offs).most_common(1)[0][0] if offs else None


def page_texts(book, path):
    """取每一页的文字：优先 PDF 文本层，取不到就回落到 OCR 结果。

    两处必须处理：
      · 9B 加密：空密码解开；不解密的话 pypdf 会直接报错。
      · 9A 扫描件：extract_text 逐页返回空串，回落到 OCR 文本文件。
    """
    r = PdfReader(path)
    if r.is_encrypted:
        try:
            r.decrypt("")
        except Exception:
            pass
    ocr_dir = OCR_DIRS.get(book)
    out = []
    for i, p in enumerate(r.pages):
        try:
            t = clean(p.extract_text() or "")
        except Exception:
            t = ""
        if not t.strip() and ocr_dir:
            f = os.path.join(ocr_dir, "page-%03d.txt" % (i + 1))
            if os.path.exists(f):
                t = clean(open(f, encoding="utf-8").read())
        out.append(t)
    return out


def build(book, fname, grade, semester, words):
    path = os.path.join(TEXTBOOK, fname)
    pages = page_texts(book, path)
    if sum(len(p) for p in pages) < 2000:
        print("  [跳过] " + fname + " 提不出文字（扫描件且无 OCR 结果）")
        return None

    word_pages = defaultdict(list)
    if book == "9B":
        # 九下是另一套排版（以 Module 分节，全册 0 页含 "Unit objectives"），
        # 所以走专用定位；定位完照常往下走（板块识别、建索引、输出都一样）。
        assign, method, starts, offset = unit_of_page_9b(pages)
        if not assign:
            print("  [跳过] " + fname + " " + method)
            return None
    else:
        for w in words:
            if w["grade"] != grade or w["semester"] != semester:
                continue
            p = page_num(w.get("page"))
            if p:
                word_pages[w["unit"]].append(p)
        assign, method, starts, offset = unit_of_page(pages, word_pages)
        if book in OCR_DIRS:
            # 扫描册的页码在页尾，页首那套偏移不可信 —— 换成页尾众数
            ocr_off = offset_from_tail(pages)
            if ocr_off is not None:
                offset = ocr_off
    # 板块：逐页看开头，认不出就沿用上一页（板块是连续的一段）
    page_section = {}
    cur = None
    for i, t in enumerate(pages):
        s = section_of_page(t)
        if s:
            cur = s
        elif assign.get(i) != assign.get(i - 1 if i else i):
            cur = cur          # 跨单元时不清空：真实板块名会重新出现
        page_section[i] = cur
    if offset is None:
        offset = offset_from_header(pages)      # 兜底：页眉里的印刷页码

    sentences = []
    DROP_REASONS = {}
    FIX_REASONS = {}
    for i, t in enumerate(pages):
        u = assign.get(i)
        if u is None:
            continue
        # 安全阀：算出来的印刷页码不合理（<1 或超过 400）就当作没有，
        # 宁可只显示单元、也不要给学生一个 "课本 p.-66" 这种翻不到书的出处。
        print_page = (i + 1 - offset) if offset else None
        if print_page is not None and not (1 <= print_page <= 400):
            print_page = None
        for raw in split_sentences(t):
            s = strip_marker(raw)
            if not keep(s):
                continue
            # ---- 清洗（必须在建索引之前！索引存的是句子的下标）----
            # 见 corpus_clean.py 顶部说明：先建索引再删句子，下标会整体错位且不报错。
            # 【2026-10-06 政策变更：只修不丢】
            # 语料是"课本说了什么"的真相。不能因为一句话不好出题，就把课本的句子删掉 ——
            # 那会让"课本原句覆盖率"无谓下降，而覆盖率正是"教材原生"最硬的证据。
            # 坏句子**保留、但打质量标记 q**；用不用它由【出题器】自己决定。
            s, _ok, _why, _fixes = clean_sentence(s)
            if not _ok:
                DROP_REASONS[_why] = DROP_REASONS.get(_why, 0) + 1   # 只计数，不丢
            for _f in _fixes:
                FIX_REASONS[_f.split(" ")[0]] = FIX_REASONS.get(_f.split(" ")[0], 0) + 1
            sentences.append({
                "q": _why,
                "text": s,
                "unit": str(grade) + "-" + str(semester) + "-" + str(u),
                "page": i + 1,
                "printPage": print_page,
                "section": page_section.get(i),
            })

    # ⚠️ 一个词形可能对应【多个词条】（词库里有 86 组跨单元/跨册重复），
    # 所以是 list 不是单个词 —— 早先写成 vocab[term] = w 会把前面的悄悄覆盖掉。
    vocab = defaultdict(list)
    id2unit = {}
    for w in words:
        if w["grade"] == grade and w["semester"] == semester and w["entry_type"] == "word":
            vocab[str(w["word_en"]).lstrip("*").strip().lower()].append(w)
            id2unit[str(w["id"])] = str(grade) + "-" + str(semester) + "-" + str(w["unit"])

    # 先把"句子 -> 命中的词"收集齐，再按句子成色排序取前 3 ——
    # 直接按出现顺序截前 3 的话，练习题里的词库行会挤掉真正的课文句子。
    # 收集时**连"课文里用的是哪个形式"一起记**。
    # 词跃-课文语料索引方案.md §4 写得很清楚：
    #   「建立索引时必然要记录课文里用的是哪个形式 ——
    #     而这个形式，就是用所给词的适当形式填空的标准答案。」
    # 换句话说，建索引这件事顺手就把 T20 的题库一起建好了。
    # ⚠️ 第一版只记了句子下标、没记形式，等于把这份便宜丢了。
    cand = defaultdict(list)                  # wid -> [(句子下标, 命中的实际形式)]
    mash_by_token = defaultdict(list)         # 词条 id -> [含它的碎片句下标]（词表出处 byVocab 的原料）
    for si, s in enumerate(sentences):
        # 【2026-10-07 补】碎片拼接的句子**不参与"原句"引用**（原句、兜底、T20 题库都不行）。
        #   为什么在这里挡而不是在 keep() 里：这类句子本身是课本的一页内容（词框/表格），
        #   删掉它会白白拉低"课本原句覆盖率"这个真实数字；但它**不能当句子引用给学生看**。
        #   实测：4336 条引用里 404 条是这类；挡掉之后有 36 个词会失去原句
        #   （它们本来就只在词汇表里出现过 —— 那正是"B 类"的真实情况，不是索引漏了）。
        #
        #   ⚠️ 但**不能因此让这些词的覆盖率凭空掉掉**：它们的出处是真实可核实的
        #   （就在本单元词表那一页）。所以碎片句里出现的词另外登记进 byVocab，
        #   界面按"课本词汇表"单独标注 —— 句子归句子，词表归词表。
        if fragment_mash(s["text"]):
            # ⚠️ 这里也要过一遍词形还原：词框里写的常常是变形
            #    （"conducted" / "shelves"），按裸词匹配会漏掉那些词。
            for t in set(re.findall(r"[A-Za-z][A-Za-z'\-]*", s["text"].lower())):
                lem = resolve(t, vocab)
                if lem is None:
                    continue
                for w in vocab[lem]:
                    mash_by_token[str(w["id"])].append(si)
            continue
        for t in set(re.findall(r"[A-Za-z][A-Za-z'\-]*", s["text"].lower())):
            lem = resolve(t, vocab)           # T15：词形还原，词库负责消歧
            if lem is None:
                continue
            for w in vocab[lem]:
                cand[str(w["id"])].append((si, t))

    # 选句顺序：**先看是不是这个词自己单元里的句子**，再看句子成色。
    # 为什么这条最重要：同一个词形常常在好几个单元都出现（词库里有 86 组跨单元重复），
    # 只按"最先找到"挑的话，八上 except 会拿到 Unit 2 的语法句，而它属于 Unit 6 ——
    # 出处就指错了地方。
    unit_of_sentence = [s["unit"] for s in sentences]
    id2term = {}
    for term, ws in vocab.items():
        for w in ws:
            id2term[str(w["id"])] = term

    by_word = {}       # 只收【本单元】的句子 —— 前端出处的正选
    by_word_any = {}   # 跨单元也收，留作备用
    by_word_form = {}  # wid -> [{si, surface, lemma, asked}] —— T20 的题库
    by_vocab = {}      # wid -> [si]：正文里没有可引用的句子，但**词表那一页有这个词**
    for wid, pairs in cand.items():
        wu = id2unit.get(wid)
        key = lambda p: (-quality(sentences[p[0]]["text"], sentences[p[0]]["section"]), p[0])
        same = sorted([p for p in pairs if unit_of_sentence[p[0]] == wu], key=key)
        chosen = []
        if same:
            ok = [p for p in same if quality(sentences[p[0]]["text"], sentences[p[0]]["section"]) >= QUALITY_FLOOR]
            if ok:
                by_word[wid] = [p[0] for p in ok[:3]]
                by_word_any[wid] = [p[0] for p in ok[:3]]
                chosen = ok[:3]
        # 【2026-10-07 补】本单元的候选**全部不合格**时，必须再看别的单元。
        #
        #   原写法是 if same: … else: …，于是"本单元有候选、但候选都过不了质量底线"
        #   这个词就一条原句都没有 —— 而它在别的单元里可能有一句很好的。
        #   实测（_residual_reason.py）：146 个"找不到原句"的词里，22 个属于这一类。
        #
        #   兜底放宽到什么程度：正选（byWord，本单元原句）仍然守着 QUALITY_FLOOR=0，
        #   兜底这条路放到 ANY_FLOOR。理由和 QUALITY_FLOOR 的注释一致 ——
        #   显示一句错的比不显示更糟，但"练习板块里的正常句子"不是错的
        #   （quality 为负大多只是因为它在练习板块、带题号或项目符号）。
        #   ANY_FLOOR 具体取值由 build_corpus 的抽样复核脚本盯住（见 _new_quotes.py）。
        if not chosen:
            other = sorted(pairs, key=key)
            ok = [p for p in other
                  if quality(sentences[p[0]]["text"], sentences[p[0]]["section"]) >= ANY_FLOOR
                  and prose_like(sentences[p[0]]["text"])
                  # 兜底引用的句子必须是干净的：repair() 修不到的单字母断词
                  # （"Y es" 这种）不能出现在学生看到的"课本原句"里。
                  and not single_letter_break(sentences[p[0]]["text"])]
            if ok:
                by_word_any[wid] = [ok[0][0]]
                chosen = ok[:1]

        if chosen:
            lemma = id2term.get(wid, "")
            by_word_form[wid] = [
                {
                    "si": p[0],
                    "surface": p[1],
                    "lemma": lemma,
                    # asked=True 才是"适当形式填空"的好题：课文用的不是原形。
                    # 课文本来就用原形的句子，出不成这种题（那是"课文挖空"的地盘）。
                    "asked": p[1] != lemma,
                }
                for p in chosen
            ]

    # 【2026-10-07 补】词表出处：正文里没有可引用句子的词，如果它在某页"词框/词表"
    # 里出现过，就把那一页记下来 —— 界面上标成「课本词汇表」，不冒充课文句子。
    #
    # 为什么要有它：碎片句被挡在"原句"之外以后，这些词的覆盖率会凭空掉 1.8 个百分点
    # （994 → 973）。但它们**并不是没有出处** —— 出处就是本单元词表那一页，
    # 而且可翻书核实。所以覆盖率不该由"能不能凑出一句假句子"来决定：
    #   句子归句子（byWord / byWordAny），词表归词表（byVocab），界面分开标注。
    for term, ws in vocab.items():
        for w in ws:
            wid = str(w["id"])
            if wid in by_word_any or wid in by_word_form:
                continue                      # 已经有真句子了，不用词表兜底
            idxs = mash_by_token.get(wid)
            if not idxs:
                continue
            wu = id2unit.get(wid)
            same = [si for si in idxs if unit_of_sentence[si] == wu]
            by_vocab[wid] = (same or idxs)[:1]

    # 句子 id 自描述：册-单元-页-序号，便于人工校对与定位
    # （对齐 词跃-课文语料索引方案.md §3 的 "7A-U1-R-003" 思路，这里把板块换成页码，更稳）
    for n, s in enumerate(sentences):
        s["id"] = book + "-U" + s["unit"].split("-")[-1] + "-p" + str(s["printPage"] or s["page"]) + "-" + str(n)

    os.makedirs(OUTDIR, exist_ok=True)
    out = {
        "book": book, "grade": grade, "semester": semester, "source": fname,
        "unitMethod": method, "printPageOffset": offset,
        "sentences": [s["text"] for s in sentences],
        "meta": [{"id": s["id"], "unit": s["unit"], "page": s["page"],
                  "printPage": s["printPage"], "section": s["section"],
                  # q != "ok"：这句是课本原句，但机器读出来有瑕疵（断词已修，其余只标记）。
                  # 出题器据此过滤；展示层可优先选 q == "ok" 的句子。
                  "q": s.get("q")} for s in sentences],
        "byWord": dict(by_word),           # 本单元原句（正选）
        "byWordAny": dict(by_word_any),    # 含跨单元兜底（备用；出处可能不在本单元）
        "byWordForm": by_word_form,        # T20：课文里用的是哪个形式（适当形式填空的答案）
        "byVocab": by_vocab,               # 只在词表/词框里出现过的词 → 那一页的出处
    }
    with open(os.path.join(OUTDIR, book + ".json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    cov = len(by_word) / max(1, len(vocab))
    cov_all = len(set(by_word_any) | set(by_vocab)) / max(1, len(vocab))
    cov_any = len(by_word_any) / max(1, len(vocab))
    print("  " + book + "  " + str(len(pages)) + " 页 -> " + str(len(sentences)) + " 句；"
          "本单元原句 " + str(len(by_word)) + " 词 (" + format(cov * 100, ".1f") + "%)"
          + " / 含跨单元兜底 " + str(len(by_word_any)) + " 词 (" + format(cov_any * 100, ".1f") + "%)"
          + " / 含词表出处 " + str(len(set(by_word_any) | set(by_vocab))) + " 词 (" + format(cov_all * 100, ".1f") + "%)"
          + "；定位法=" + method
          + ("；印刷页偏移=" + str(offset) if offset else ""))

    if method == "单元扉页法" and word_pages:
        rows = []
        for u in sorted(starts):
            pgs = word_pages.get(u)
            if not pgs:
                continue
            printed_start = starts[u] - offset if offset else None
            rows.append("U" + str(u) + " 扉页" + str(starts[u]) + "/词库首词p" + str(min(pgs))
                        + ("" if printed_start is None else "(印刷p" + str(printed_start) + ")"))
        print("     交叉验证: " + "  ".join(rows))
    return out


def main():
    words = json.load(open(ROOT + r"\web\public\words.json", encoding="utf-8"))["words"]
    print("词库 " + str(len(words)) + " 条")
    for book, fname, g, s in BOOKS:
        if not os.path.exists(os.path.join(TEXTBOOK, fname)):
            print("  [缺文件] " + fname)
            continue
        build(book, fname, g, s, words)


if __name__ == "__main__":
    main()
