#!/usr/bin/env python3
"""Extract a review queue of room attributes from public dormitory articles.

Never imports or publishes candidate facts. A reviewer must inspect each source URL,
including context, year and campus, then manually add a paraphrased record.
No source paragraphs or images are stored.
"""
import argparse
import csv
import html
import re
import time
from datetime import date
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / 'tasks' / '2026-09-25_宿舍来源候选索引.csv'
OUTPUT = ROOT / 'tasks' / '2026-09-25_宿舍事实提取候选.csv'
FIELDS = ['学校', '来源页', '页面更新日', '候选人数', '候选床型', '候选卫浴线索', '校区线索', '状态']
ROOM = re.compile(r'(?<!\d)([2-9]|10|两|二|三|四|五|六|七|八|九|十)(?:\s*[-—~至]\s*([2-9]|10|四|五|六|七|八))?\s*人(?:间|寝|一间)')
CAMPUS = re.compile(r'([\u4e00-\u9fff]{2,10}校区)')


class Text(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.ignored = 0

    def handle_starttag(self, tag, attrs):
        if tag in {'script', 'style'}:
            self.ignored += 1

    def handle_endtag(self, tag):
        if tag in {'script', 'style'} and self.ignored:
            self.ignored -= 1

    def handle_data(self, text):
        if not self.ignored:
            self.parts.append(text)


def text(fragment):
    parser = Text()
    parser.feed(fragment)
    return ' '.join(html.unescape(''.join(parser.parts)).split())


def fetch(url):
    request = Request(url, headers={'User-Agent': 'Eggworld dormitory research/1.0 (public text; no images)'})
    for attempt in range(3):
        try:
            with urlopen(request, timeout=18) as response:
                return response.read().decode('utf-8', errors='replace')
        except (HTTPError, URLError, TimeoutError):
            if attempt == 2:
                raise
            time.sleep(attempt + 1)


def extract(page):
    update = re.search(r'<div class="update">\s*更新：(\d{4}-\d{1,2}-\d{1,2})', page)
    update_day = update.group(1) if update else ''
    if update_day and date(*map(int, update_day.split('-'))) > date(2026, 9, 25):
        return update_day, '', '', '', '', '未来更新日；跳过'
    match = re.search(r'<div class="content">(.*?)</div>\s*<div class="mark">', page, re.S)
    if not match:
        return update_day, '', '', '', '', '正文小节未找到'
    content = match.group(1)
    # Some headings wrap their visible title in spans; do not rely on raw HTML text.
    headings = list(re.finditer(r'<h2[^>]*>.*?</h2>', content, re.S))
    section = next((i for i, heading in enumerate(headings)
                    if '宿舍条件' in text(heading.group(0))), None)
    if section is None:
        return update_day, '', '', '', '', '宿舍小节未找到'
    begin = headings[section].end()
    end = headings[section + 1].start() if section + 1 < len(headings) else len(content)
    body = text(content[begin:end])
    # Candidate signals only: multiple campuses or mixed room types need individual human review.
    rooms = sorted(set(a + ('至' + b if b else '') + '人间' for a, b in ROOM.findall(body)))
    bed = '、'.join(x for x in ['上床下桌', '上下铺', '上床下铺'] if x in body)
    baths = '、'.join(x for x in ['独立卫浴', '独立卫生间', '公共卫生间', '公共浴室', '淋浴间'] if x in body)
    campuses = sorted(set(CAMPUS.findall(body)))
    return update_day, '、'.join(rooms), bed, baths, '、'.join(campuses), '待人工核查；不可自动入站'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--limit', type=int, default=200)
    parser.add_argument('--delay', type=float, default=0.5)
    args = parser.parse_args()
    if args.limit < 1 or args.delay < 0.4:
        parser.error('limit positive and delay >= 0.4 required')
    with INDEX.open(encoding='utf-8-sig', newline='') as source:
        index = list(csv.DictReader(source))
    existing = {}
    if OUTPUT.exists():
        with OUTPUT.open(encoding='utf-8-sig', newline='') as old:
            existing = {row['学校']: row for row in csv.DictReader(old)}
    new_count = 0
    for row in index:
        name = row['学校']
        if name in existing and existing[name]['状态'] == '待人工核查；不可自动入站':
            continue
        try:
            update, occupancy, bed, baths, campuses, status = extract(fetch(row['候选来源页']))
        except (HTTPError, URLError, TimeoutError) as error:
            update = occupancy = bed = baths = campuses = ''
            status = '访问失败；需重试：' + type(error).__name__
        existing[name] = dict(zip(FIELDS, [name, row['候选来源页'], update, occupancy, bed, baths, campuses, status]))
        new_count += 1
        if new_count % 25 == 0:
            print(f'new {new_count}/{args.limit}; total {len(existing)}/{len(index)}', flush=True)
        time.sleep(args.delay)
        if new_count >= args.limit:
            break
    temp = OUTPUT.with_suffix('.tmp')
    with temp.open('w', encoding='utf-8-sig', newline='') as target:
        writer = csv.DictWriter(target, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(existing.values())
    temp.replace(OUTPUT)
    print(f'candidate attributes collected for {len(existing)}/{len(index)} schools; none auto-published')


if __name__ == '__main__':
    main()
