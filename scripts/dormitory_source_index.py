#!/usr/bin/env python3
"""Collect *candidate links*, never publish third-party dormitory claims automatically.

The index is a work queue. Each article must be opened and its actual dormitory
section checked before a human-readable, attributed fact is added to the site.
No photos or source article bodies are retained.
"""
import argparse
import csv
import html
import re
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

BASE = 'https://www.dxsbb.com'
ARTICLE = re.compile(r'<a[^>]+href=[\'\"](/news/\d+\.html)[\'\"][^>]*>(.*?)</a>', re.S)
SCHOOL = re.compile(r'^(.+?)宿舍条件怎么样')
SCHOOL_LIST = Path(__file__).resolve().parents[1] / 'js' / 'bl-schools.js'
DEFAULT_OUTPUT = Path(__file__).resolve().parents[1] / 'tasks' / '2026-09-25_宿舍来源候选索引.csv'


def fetch(url):
    request = Request(url, headers={'User-Agent': 'Eggworld dormitory research/1.0 (public index; no images)'})
    for attempt in range(3):
        try:
            with urlopen(request, timeout=15) as response:
                return response.read().decode('utf-8', errors='replace')
        except (HTTPError, URLError, TimeoutError):
            if attempt == 2:
                raise
            time.sleep(2 * (attempt + 1))


def school_names():
    return set(re.findall(r"^\s*'([^']+)',?\s*$", SCHOOL_LIST.read_text(encoding='utf-8'), re.M))


def candidates(index_html, names):
    rows = []
    for path, content in ARTICLE.findall(index_html):
        title = html.unescape(re.sub(r'<[^>]*>', '', content)).strip()
        match = SCHOOL.match(title)
        if not match or match.group(1) not in names:
            continue
        rows.append((match.group(1), BASE + path, match.group(1) + '宿舍条件'))
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pages', type=int, default=51)
    parser.add_argument('--delay', type=float, default=0.5)
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    if args.pages < 1 or args.delay < 0.4:
        parser.error('pages must be positive; delay must be >= 0.4 seconds')
    names = school_names()
    found = {}
    for page in range(1, args.pages + 1):
        path = '/news/list_814.html' if page == 1 else f'/news/list_814_{page}.html'
        try:
            rows = candidates(fetch(BASE + path), names)
        except (HTTPError, URLError, TimeoutError) as error:
            print(f'Fetch failed on page {page}: {error}; no incomplete index was written', file=sys.stderr)
            return 1
        for name, url, title in rows:
            found.setdefault(name, (url, title))
        print(f'index page {page}/{args.pages}: {len(rows)} matching links; unique {len(found)}', flush=True)
        time.sleep(args.delay)
    # Write atomically only after all requested pages succeed; keep the old index on failure.
    temporary = args.output.with_suffix('.tmp')
    with temporary.open('w', encoding='utf-8-sig', newline='') as output:
        writer = csv.writer(output)
        writer.writerow(['学校', '候选来源页', '来源标题', '状态'])
        for name in sorted(found):
            url, title = found[name]
            writer.writerow([name, url, title, '待核查事实；非预置描述'])
    temporary.replace(args.output)
    print(f'{len(found)}/{len(names)} schools have candidate links; {len(names) - len(found)} need other sources', flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
