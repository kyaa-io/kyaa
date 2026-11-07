#!/usr/bin/env python3
"""Split the Pencil "Pretendard UI" TTFs into two WOFF files per weight and print the unicode-range lists.

The full TTFs are 3MB each and took ~30s on a 4G link, starving the page scripts and images. core holds Latin,
common symbols and the 2,350 KS X 1001 Hangul syllables; rest holds every other glyph. The @font-face rules in
apps/web/app/globals.css declare rest first and core last with these ranges, so
the browser fetches rest only for a page that shows one of its characters. No glyph is dropped.

usage: python3 scripts/subset-pencil-fonts.py   (needs fontTools; writes next to the TTFs, ranges to stdout)
"""
from pathlib import Path
import subprocess

from fontTools.ttLib import TTFont

FONT_DIR = Path(__file__).resolve().parent.parent / "apps/web/public/fonts/pencil"
WEIGHTS = ("550", "650", "850")
BASE = [(0x20, 0x7E), (0xA0, 0xFF), (0x2000, 0x206F), (0x20A9, 0x20A9), (0x20AC, 0x20AC), (0x2100, 0x21FF),
        (0x2460, 0x24FF), (0x25A0, 0x26FF), (0x3000, 0x303F), (0x3131, 0x318E), (0xFF01, 0xFF5E)]


def ks_x_1001_hangul():
    out = []
    for code in range(0xAC00, 0xD7A4):
        encoded = chr(code).encode("euc-kr")
        if len(encoded) == 2 and encoded[0] >= 0xB0 and encoded[1] >= 0xA1:
            out.append(code)
    return out


def to_ranges(codes):
    codes = sorted(codes)
    out, start, prev = [], codes[0], codes[0]
    for code in codes[1:]:
        if code == prev + 1:
            prev = code
            continue
        out.append((start, prev))
        start = prev = code
    out.append((start, prev))
    return out


def fmt(ranges):
    return ",".join(f"U+{a:04X}" if a == b else f"U+{a:04X}-{b:04X}" for a, b in ranges)


def main():
    core_ranges = BASE + to_ranges(ks_x_1001_hangul())
    core = {code for a, b in core_ranges for code in range(a, b + 1)}
    core_text = fmt(core_ranges)
    for weight in WEIGHTS:
        source = FONT_DIR / f"PretendardUI{weight}.ttf"
        rest = sorted(set(TTFont(source).getBestCmap()) - core)
        common = ["pyftsubset", str(source), "--flavor=woff", "--layout-features=*"]
        subprocess.run([*common, f"--unicodes={core_text}", f"--output-file={FONT_DIR / f'PretendardUI{weight}-core.woff'}"], check=True)
        subprocess.run([*common, f"--unicodes={fmt(to_ranges(rest))}", f"--output-file={FONT_DIR / f'PretendardUI{weight}-rest.woff'}"], check=True)
    # rest range: every run of non-core code points that holds a rest glyph (gaps without glyphs are merged in).
    rest_codes = set(TTFont(FONT_DIR / f"PretendardUI{WEIGHTS[0]}.ttf").getBestCmap()) - core
    last = 0x10FFFF
    runs, start, holds = [], None, False
    for code in range(0, last + 2):
        if code in core or code > last:
            if start is not None and holds:
                runs.append((start, code - 1))
            start, holds = None, False
            continue
        if start is None:
            start = code
        holds = holds or code in rest_codes
    print("core:", core_text)
    print("rest:", fmt(runs))


if __name__ == "__main__":
    main()
