#!/usr/bin/env python
# ============================================================
# scripts/check_corpus.py —— 语料索引验收（T16 的那条验收标准）
# ------------------------------------------------------------
# 随机抽词，检查：① 每个词有没有课文原句  ② 原句的出处页码对不对。
# 页码的裁判是 words.json 里的 page 字段（已用九上单词页逐条人工核对过）。
# 用法: python scripts/check_corpus.py [每册抽样数]
# ============================================================
import json, sys, os, random, re
sys.stdout.reconfigure(encoding='utf-8')
ROOT = r'E:\初二'
words = json.load(open(os.path.join(ROOT, 'web', 'public', 'words.json'), encoding='utf-8'))['words']
def pnum(v):
    if isinstance(v, int): return v
    m = re.search(r'(\d+)', v) if isinstance(v, str) else None
    return int(m.group(1)) if m else None
N = int(sys.argv[1]) if len(sys.argv) > 1 else 5
random.seed(20261005)
SLOT = {'7A': '7-1', '7B': '7-2', '8A': '8-1', '8B': '8-2'}
hit = 0; miss = 0; okp = 0; badp = 0; cmp = 0
print('=== T16 验收：每册随机 5 词，看原句与印刷页码 ===')
for bk in ['7A', '7B', '8A', '8B']:
    c = json.load(open(os.path.join(ROOT, 'web', 'public', 'corpus', bk + '.json'), encoding='utf-8'))
    g, s = SLOT[bk].split('-')
    vocab = [w for w in words if str(w['grade']) == g and str(w['semester']) == s and w['entry_type'] == 'word']
    print()
    print('--- ' + bk + '  ' + c['source'] + '  偏移 ' + str(c['printPageOffset']) + '  ' + str(len(c['sentences'])) + ' 句 ---')
    for w in random.sample(vocab, N):
        ids = c['byWord'].get(str(w['id']), [])
        wl = str(w['word_en']).lstrip('*')
        if not ids:
            print('  [无原句] ' + wl.ljust(15) + ' 词库页码 ' + str(w.get('page')))
            miss += 1; continue
        hit += 1
        si = ids[0]; m = c['meta'][si]; s2 = c['sentences'][si]
        pp = m.get('printPage'); wp = pnum(w.get('page'))
        tag = ''
        if pp is not None and wp is not None:
            cmp += 1
            d = abs(pp - wp)
            if d <= 3: okp += 1; tag = '  [页码吻合 差' + str(d) + ']'
            else: badp += 1; tag = '  [页码差 ' + str(d) + ' <<<]'
        print('  ' + wl.ljust(15) + ' ' + m['unit'] + ' 印刷p' + str(pp) + ' 词库' + str(w.get('page')) + tag)
        print('        ' + (s2[:104] + ('...' if len(s2) > 104 else '')))
print()
print('有原句 ' + str(hit) + ' / 无原句 ' + str(miss))
print('页码可比 ' + str(cmp) + '，吻合 ' + str(okp) + '，差得远 ' + str(badp))