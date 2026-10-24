#!/usr/bin/env python3
"""Search remaining catalogue schools for public dormitory leads.

This script stores search-result leads only; it never treats a snippet or a
successor-school hit as verified dormitory fact. A later review step must decide
whether a resolved page actually belongs to the catalogue school.
"""
from __future__ import annotations
import concurrent.futures, html, json, re, time
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
FACTS = ROOT / 'js' / 'dormitory-facts.js'
OUT = ROOT / 'tasks' / '2026-09-25_宿舍剩余学校公开搜索线索.json'
UA = 'Eggworld dormitory research/1.0 (public search leads; no images)'

def get(url: str) -> str:
    req = Request(url, headers={'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9'})
    with urlopen(req, timeout=25) as response:
        return response.read().decode('utf-8', errors='replace')

def notice_names() -> list[str]:
    source = FACTS.read_text(encoding='utf-8')
    names = re.findall(r'"name":\s*"([^"]+)"', source)
    # research_notice entries are the final 180 entries; identify by nearby sourceType.
    rows = re.findall(r'\{\s*"name":\s*"([^"]+)".*?"sourceType":\s*"research_notice"', source, re.S)
    return list(dict.fromkeys(rows))

def clean(fragment: str) -> str:
    fragment = re.sub(r'<script.*?</script>|<style.*?</style>', ' ', fragment, flags=re.S|re.I)
    fragment = re.sub(r'<[^>]+>', ' ', fragment)
    return re.sub(r'\s+', ' ', html.unescape(fragment)).strip()

def parse_results(page: str, school: str) -> list[dict]:
    rows = []
    matches = list(re.finditer(r'<h3\s+class="vr-title[^>]*>(.*?)</h3>', page, re.S|re.I))
    for i, match in enumerate(matches[:12]):
        raw = match.group(1)
        title = clean(raw)
        href_match = re.search(r'href="([^"]+)"', raw)
        if not href_match:
            continue
        href = html.unescape(href_match.group(1))
        end = matches[i + 1].start() if i + 1 < len(matches) else min(len(page), match.end() + 2800)
        tail = page[match.end():end]
        snippets = re.findall(r'<p[^>]*>(.*?)</p>', tail, re.S|re.I)
        snippet = clean(' '.join(snippets[:2]))
        # Keep dormitory-relevant hits; exact school title is preferred later.
        if not any(k in (title + ' ' + snippet) for k in ('宿舍', '寝室', '公寓', '住宿')):
            continue
        rows.append({'title': title, 'searchUrl': href, 'snippet': snippet[:900], 'exactNameInTitle': school in title})
    return rows

def resolve(href: str) -> str:
    url = href if href.startswith('http') else 'https://www.sogou.com' + href
    try:
        body = get(url)
    except Exception:
        return url
    match = re.search(r'location\.replace\("([^"]+)"', body)
    if match:
        return html.unescape(match.group(1))
    match = re.search(r"URL='([^']+)'", body)
    return html.unescape(match.group(1)) if match else url

def one(school: str) -> dict:
    query = f'"{school}" 宿舍条件 几人间 上床下桌 独立卫浴'
    url = 'https://www.sogou.com/web?query=' + quote(query)
    try:
        page = get(url)
        results = parse_results(page, school)
        for row in results[:8]:
            row['resolvedUrl'] = resolve(row['searchUrl'])
        return {'school': school, 'query': query, 'results': results, 'status': 'ok'}
    except Exception as exc:
        return {'school': school, 'query': query, 'results': [], 'status': 'error:' + type(exc).__name__}

def main() -> None:
    names = notice_names()
    previous = {}
    if OUT.exists():
        try:
            previous = {row['school']: row for row in json.loads(OUT.read_text(encoding='utf-8'))}
        except Exception:
            previous = {}
    todo = [name for name in names if name not in previous]
    print(f'remaining notices={len(names)} cached={len(previous)} to_search={len(todo)}', flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for idx, row in enumerate(pool.map(one, todo), 1):
            previous[row['school']] = row
            if idx % 10 == 0:
                print(f'searched {idx}/{len(todo)}', flush=True)
            time.sleep(0.12)
    rows = [previous[name] for name in names if name in previous]
    OUT.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
    exact = sum(any(r.get('exactNameInTitle') for r in row['results']) for row in rows)
    useful = sum(bool(row['results']) for row in rows)
    print(f'wrote {len(rows)} rows; useful={useful}; exact-title={exact}; output={OUT}')

if __name__ == '__main__':
    main()
