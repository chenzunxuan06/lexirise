# -*- coding: utf-8 -*-
"""newly_covered.py —— 新旧两版语料一比：这次"新救回来"的词有哪些、原句长什么样

用法（在 web/ 目录下）：
    python scripts/newly_covered.py <旧语料目录> [新语料目录]
例：
    python scripts/newly_covered.py "E:\初二\挑战杯-2026\_bak_corpus_20261007\corpus" public/corpus

为什么要有它：**放宽规则之前必须先人眼抽样**。
  "更严"的规则会误伤好句子；"更松"的规则会放进坏句子 —— 两个方向都会翻车，
  而机器指标（覆盖率）在两个方向上**都是变好的**。所以数字涨了不算数，
  得把新进来的句子逐条看一遍。
"""
import json, os, sys

ROOT = r"E:\初二"
BOOKS = ["7A", "7B", "8A", "8B", "9A", "9B"]


def load(dirpath, book):
    p = os.path.join(dirpath, book + ".json")
    if not os.path.exists(p):
        return None
    return json.load(open(p, encoding="utf-8"))


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    old_dir = sys.argv[1]
    new_dir = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, "web", "public", "corpus")

    words = json.load(open(os.path.join(ROOT, "web", "public", "words.json"), encoding="utf-8"))["words"]
    byid = {str(w["id"]): w for w in words}

    total_new = 0
    for bk in BOOKS:
        old, new = load(old_dir, bk), load(new_dir, bk)
        if not old or not new:
            print("  [跳过] %s 缺文件" % bk)
            continue
        ok = set(old.get("byWordForm") or {}) | set(old.get("byWordAny") or {})
        nk = set(new.get("byWordForm") or {}) | set(new.get("byWordAny") or {})
        gained = sorted(nk - ok, key=lambda x: int(x) if x.isdigit() else 0)
        lost = sorted(ok - nk, key=lambda x: int(x) if x.isdigit() else 0)
        total_new += len(gained)
        print("=" * 88)
        print("%s：新覆盖 %d 个，丢掉 %d 个" % (bk, len(gained), len(lost)))
        print("=" * 88)
        sents = new["sentences"]
        for wid in gained:
            w = byid.get(wid) or {}
            rec = (new.get("byWordForm") or {}).get(wid) or []
            si = rec[0]["si"] if rec else ((new.get("byWordAny") or {}).get(wid) or [None])[0]
            quote = sents[si] if si is not None and si < len(sents) else "(?)"
            print("  + %-16s %s" % (w.get("word_en", "?"), quote[:100]))
        for wid in lost:
            w = byid.get(wid) or {}
            print("  - %-16s  ** 丢了，必须查 **" % w.get("word_en", "?"))
        print()

    print("合计新覆盖 %d 个词" % total_new)


if __name__ == "__main__":
    main()
