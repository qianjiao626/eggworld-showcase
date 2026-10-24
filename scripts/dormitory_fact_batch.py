#!/usr/bin/env python3
"""Build a conservative, source-linked third-party dormitory fact batch.

The script reads public article pages from the candidate index, extracts only the
"宿舍条件" section, and writes structured summaries rather than copying source
paragraphs or images. Every row remains third-party/unverified and must retain
its source URL and access date in the site.
"""
from __future__ import annotations
import argparse, concurrent.futures, csv, html, json, re
from datetime import date
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / 'tasks' / '2026-09-25_宿舍来源候选索引.csv'
DEFAULT_OUTPUT = ROOT / 'tasks' / '2026-09-25_宿舍事实批次五.json'
ACCESS_DATE = '2026-09-25'

class Text(HTMLParser):
    def __init__(self):
        super().__init__(); self.ignored = 0; self.parts = []
    def handle_starttag(self, tag, attrs):
        if tag in {'script', 'style'}: self.ignored += 1
    def handle_endtag(self, tag):
        if tag in {'script', 'style'} and self.ignored: self.ignored -= 1
    def handle_data(self, data):
        if not self.ignored: self.parts.append(data)

def text(fragment: str) -> str:
    p = Text(); p.feed(fragment)
    return ' '.join(html.unescape(''.join(p.parts)).split())

def fetch(url: str) -> str:
    req = Request(url, headers={'User-Agent': 'Eggworld dormitory research/1.0 (public text; no images)'})
    with urlopen(req, timeout=20) as response:
        return response.read().decode('utf-8', errors='replace')

def existing_names() -> set[str]:
    source = (ROOT / 'js' / 'dormitory-facts.js').read_text(encoding='utf-8')
    return set(re.findall(r'"name":\s*"([^"]+)"', source)) | set(re.findall(r"facts\[['\"]([^'\"]+)['\"]", source))

def room_values(body: str) -> list[str]:
    patterns = [
        r'(?<!\d)(?:[2-9]|10|两|二|三|四|五|六|七|八|九|十)(?:\s*[-—~至]\s*(?:[2-9]|10|两|二|三|四|五|六|七|八|九|十))?\s*(?:人间|人寝|人宿舍|人一间)',
        r'(?<!\d)(?:[2-9]|10)\s*[人名]\s*/\s*(?:间|寝)',
        r'(?<!\d)(?:[2-9]|10)\s*人(?:标准)?(?:学生)?公寓',
        r'(?:双|两|三|四|五|六|七|八|九|十|[2-9]|10)\s*人(?:寝室|寝|间)',
    ]
    values = []
    for pattern in patterns:
        for match in re.finditer(pattern, body):
            value = re.sub(r'\s+', '', match.group(0)).replace('双人寝室', '2人间').replace('两人寝室', '2人间').replace('人寝室', '人间').replace('人寝', '人间').replace('人宿舍', '人间').replace('人一间', '人间').replace('人/间', '人间').replace('人/寝', '人寝')
            if value not in values: values.append(value)
    return values

def first_terms(body: str, terms: list[str]) -> list[str]:
    return [term for term in terms if term in body]

def normalized_rooms(values: list[str]) -> list[str]:
    digits = {'两': '2', '二': '2', '三': '3', '四': '4', '五': '5', '六': '6', '七': '7', '八': '8', '九': '9', '十': '10'}
    normalized = []
    for value in values:
        for old, new in digits.items(): value = value.replace(old, new)
        if value not in normalized: normalized.append(value)
    return normalized

def bathroom_summary(body: str) -> str:
    no_private = any(term in body for term in ['无独立卫生间', '没有独立卫生间', '无独立卫浴', '没有独立卫浴'])
    private = any(term in body for term in ['独立卫生间', '独立卫浴', '独立浴室']) and not no_private
    public = any(term in body for term in ['公共卫生间', '公共浴室'])
    if no_private and private:
        return '不同楼栋或房型存在差异（原页同时提到独立与非独立卫浴）'
    values = []
    if no_private: values.append('无独立卫浴/卫生间')
    elif private: values.append('独立卫浴/卫生间')
    if public: values.append('公共卫生间/浴室')
    return '、'.join(values)

def summarize(body: str, rooms: list[str], beds: list[str], baths: list[str], campuses: list[str]) -> str:
    parts = []
    if rooms: parts.append('房型线索：' + '、'.join(rooms))
    if beds: parts.append('床型线索：' + '、'.join(beds))
    if baths: parts.append('卫浴线索：' + '、'.join(baths))
    amenities = []
    for label, terms in [
        ('空调', ['空调']), ('热水', ['热水', '热水器']), ('阳台', ['阳台']),
        ('洗衣设施', ['洗衣机', '洗衣房']), ('网络', ['无线网络', '校园WiFi', 'WIFI', '宽带']),
        ('书桌/衣柜', ['书桌', '写字桌', '衣柜', '书柜']), ('电梯', ['电梯']),
    ]:
        if any(term in body for term in terms) and label not in amenities: amenities.append(label)
    if amenities: parts.append('配套线索：' + '、'.join(amenities))
    if campuses: parts.append('校区线索：' + '、'.join(campuses))
    buildings = []
    for value in re.findall(r'(?:第)?[0-9一二三四五六七八九十]+(?:至|-)[0-9一二三四五六七八九十]+号楼|(?:第)?[0-9一二三四五六七八九十]+号楼|[0-9一二三四五六七八九十]+幢', body):
        if value not in buildings: buildings.append(value)
    if buildings: parts.append('楼栋线索：' + '、'.join(buildings[:12]) + ('等' if len(buildings) > 12 else '') + '（原页未逐楼对应全部房型）')
    if parts:
        return '；'.join(parts)
    # A large number of public school pages disclose only a management rule or
    # a fee, which is still useful as a source-backed status but must not be
    # upgraded into an invented room configuration.
    if re.search(r'住宿费|住宿标准|收费|每人每年|每学年', body):
        return '原页仅披露住宿收费或住宿标准，未说明房型、床型、卫浴、校区和楼栋；当前配置待核实。'
    if re.search(r'国家统一标准|统一标准|标准的住宿管理|公寓化管理|学生公寓', body):
        return '原页仅说明实行统一/公寓化住宿管理，未说明房型、床型、卫浴、校区和楼栋；当前配置待核实。'
    if re.search(r'设施|环境|网络|配套|卫生|供电|断电|开门|锁门', body):
        return '原页披露了宿舍管理或配套线索，但未形成房型、床型、卫浴、校区和楼栋的完整说明；当前配置待核实。'
    return ''

def parse(row: dict) -> dict | None:
    page = fetch(row['候选来源页'])
    title_match = re.search(r'<title>(.*?)</title>', page, re.S)
    title = text(title_match.group(1)) if title_match else ''
    if not title.startswith(row['学校']) or '宿舍条件' not in title:
        return None
    update = re.search(r'<div\s+class="update">.*?更新：\s*(\d{4}-\d{1,2}-\d{1,2})', page, re.S)
    year = int(update.group(1)[:4]) if update else None
    if not year or year < 2020 or year > 2026:
        return None
    # Article pages frequently contain malformed/nested div markup. Do not use a
    # non-greedy div regex here: it stops at the first nested </div> and loses the
    # actual h2/body. Slice by the stable article markers instead.
    content_start = re.search(r'<div\s+class="content"[^>]*>', page, re.I)
    if not content_start: return None
    content_end = re.search(r'<div\s+class="mark"[^>]*>', page[content_start.end():], re.I)
    if not content_end: return None
    content = page[content_start.end():content_start.end() + content_end.start()]
    headings = list(re.finditer(r'<h2[^>]*>.*?</h2>', content, re.S))
    # Some pages put only a generic sentence under “宿舍条件” and place the
    # concrete room details under a following “学生对宿舍评价” section. Keep
    # both dorm-related sections, but never ingest the food section.
    selected = []
    for i, heading in enumerate(headings):
        heading_text = text(heading.group(0))
        if '宿舍条件' not in heading_text and not ('宿舍' in heading_text and '评价' in heading_text):
            continue
        end = headings[i + 1].start() if i + 1 < len(headings) else len(content)
        section = text(content[heading.end():end])
        section = re.split(r'(?:食堂|餐饮条件|餐厅条件)\s*[:：]', section, maxsplit=1)[0]
        # Student-review paragraphs often switch to food without a colon.
        food_pos = re.search(r'(?:学校|本校|校园)?食堂(?:实惠|丰富|环境|的|有|菜|用餐)', section)
        if food_pos and food_pos.start() > 20:
            section = section[:food_pos.start()].rstrip(' ，。；')
        if section and section not in selected:
            selected.append(section)
    if not selected: return None
    body = ' '.join(selected)
    rooms = normalized_rooms(room_values(body))
    beds = first_terms(body, ['上床下桌', '上铺下桌', '上床下柜', '上床下铺', '上下铺'])
    bathroom = bathroom_summary(body)
    campuses = []
    for campus in re.findall(r'[\u4e00-\u9fff]{2,12}校区', body):
        if campus not in campuses: campuses.append(campus)
    description = summarize(body, rooms, beds, [bathroom] if bathroom else [], campuses)
    if not description: return None
    return {
        'name': row['学校'], 'campus': '、'.join(campuses), 'building': '',
        'scope': '原页未逐栋列明；当前分配及具体配置年份待核实；第三方资料仅供参考',
        'occupancy': '、'.join(rooms), 'bedType': '、'.join(beds), 'bathroom': bathroom,
        'description': description, 'sourceType': 'third_party',
        'sourceTitle': '大学生必备网·' + row['学校'] + '宿舍条件',
        'sourceUrl': row['候选来源页'], 'sourceYear': year,
        'sourceYearLabel': f'页面更新于{update.group(1)}；宿舍配置年份未注明',
        'accessedAt': ACCESS_DATE,
    }

def safe_parse(row: dict) -> dict | None:
    try:
        return parse(row)
    except Exception:
        return None

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    ap.add_argument('--index', type=Path, default=INDEX)
    ap.add_argument('--workers', type=int, default=12)
    args = ap.parse_args()
    rows = list(csv.DictReader(args.index.open(encoding='utf-8-sig')))
    old = existing_names(); results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        for result in pool.map(safe_parse, rows):
            if result and result['name'] not in old:
                results.append(result)
    results.sort(key=lambda item: item['name'])
    args.output.write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'{len(results)} new source-backed third-party summaries written to {args.output}')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
