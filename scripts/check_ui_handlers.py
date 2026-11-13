#!/usr/bin/env python3
"""Pemeriksa XSS handler inline untuk UI EAP (CI/lokal):  python eap/scripts/check_ui_handlers.py   (exit 1 bila ada pelanggaran)

Aturan: data TIDAK boleh disisipkan ke dalam string JavaScript di atribut HTML (onclick="App.fn('${x}')"), termasuk lewat esc() — entitas HTML didekode
SEBELUM JavaScript diparse, sehingga  ' (ditulis &#39;)  tetap memutus literal. Gunakan  window.jsArg(x)  (assets/app.js):  onclick="App.fn(${window.jsArg(x)})".
Dua pemindaian:
  1) nilai atribut on*="..." : ${...} yang berada DI DALAM literal berkutip, atau tepat diapit kutip, dan bukan window.jsArg(...)
  2) argumen App.<fn>( ... ) di mana pun (string handler yang dirakit di luar atribut): literal '...' yang memuat ${...}
"""
import glob, os, re, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'ui')
ATTR = re.compile(r'\bon(?:click|change|input|submit|keyup|keydown|focus|blur)\s*=\s*"')
CALL = re.compile(r'\bApp\.[A-Za-z_]\w*\(')


def skip_expr(s, i):
    i += 2; depth = 1
    while i < len(s):
        c = s[i]
        if c in '"\'':
            q = c; i += 1
            while i < len(s) and s[i] != q: i += 2 if s[i] == '\\' else 1
            i += 1; continue
        if c == '`': i = skip_tpl(s, i); continue
        if c == '{': depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0: return i + 1
        i += 1
    raise ValueError('ekspresi ${ tidak tertutup')


def skip_tpl(s, i):
    i += 1
    while i < len(s):
        if s[i] == '\\': i += 2; continue
        if s[i] == '`': return i + 1
        if s.startswith('${', i): i = skip_expr(s, i); continue
        i += 1
    raise ValueError('template literal tidak tertutup')


def attr_end(s, i):
    while i < len(s):
        if s.startswith('${', i): i = skip_expr(s, i); continue
        if s[i] == '"': return i
        if s[i] == '\\': i += 2; continue
        i += 1
    raise ValueError('atribut tidak tertutup')


def is_safe(seg): return seg.startswith('${window.jsArg(')


def scan_attrs(src):
    bad = []
    for m in ATTR.finditer(src):
        start = m.end()
        try: end = attr_end(src, start)
        except ValueError: continue
        val = src[start:end]; i = 0; in_sq = False
        while i < len(val):
            if val.startswith('${', i):
                j = skip_expr(val, i); seg = val[i:j]
                prev = val[i - 1] if i else ''; nxt = val[j] if j < len(val) else ''
                if not is_safe(seg) and (in_sq or (prev == "'" and nxt == "'")): bad.append((src.count('\n', 0, start + i) + 1, seg[:80]))
                i = j; continue
            if val[i] == "'": in_sq = not in_sq
            i += 1
    return bad


def scan_calls(src):
    bad = []; pos = 0
    for m in CALL.finditer(src):
        if m.start() < pos: continue
        k = m.end(); depth = 1
        try:
            while k < len(src) and depth > 0:
                c = src[k]
                if src.startswith('${', k): k = skip_expr(src, k); continue
                if c == "'":
                    j = k + 1; has = False
                    while j < len(src):
                        if src.startswith('${', j): has = True; j = skip_expr(src, j); continue
                        if src[j] == '\\': j += 2; continue
                        if src[j] == "'": break
                        j += 1
                    if has: bad.append((src.count('\n', 0, k) + 1, src[k:min(j + 1, k + 80)]))
                    k = j + 1; continue
                if c in '"`': break
                if c == '(': depth += 1
                elif c == ')': depth -= 1
                k += 1
        except ValueError:
            continue
        pos = k
    return bad


def main():
    total = 0
    for f in sorted(glob.glob(os.path.join(ROOT, 'assets', '*.js')) + [os.path.join(ROOT, 'index.html')]):
        src = open(f, encoding='utf-8').read()
        issues = sorted(set(scan_attrs(src) + scan_calls(src)))
        for ln, seg in issues:
            print(f'{os.path.relpath(f, ROOT)}:{ln}: data disisipkan ke string JS handler -> pakai window.jsArg(): {seg}'.encode('ascii', 'replace').decode())
        total += len(issues)
    print(f'check_ui_handlers: {"OK — tidak ada interpolasi berbahaya" if not total else str(total) + " pelanggaran"}')
    return 1 if total else 0


if __name__ == '__main__':
    sys.exit(main())
