#!/usr/bin/env python3
"""Find publicly indexed dormitory source candidates; this never publishes facts.

Search snippets and ranking are leads only. Review the original article and school
continuity before adding any statement to js/dormitory-facts.js.
"""
from __future__ import annotations
import argparse, csv, html, re, time
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
MISSING = ROOT / 'tasks' / '2026-09-25_宿舍待补学校批次九.csv'

class Results(HTMLParser):
    def __init__(self):
        super().__init__(); self.in_title = 0; self.current = None; self.hits = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'h3' and 'res-title' in a.get('class', ''): self.in_title += 1
        if self.in_title and tag == 'a': self.current = [a.get('data-mdurl') or a.get('href', ''), '']
    def handle_data(self, data):
        if self.current: self.current[1] += data
    def handle_endtag(self, tag):
        if tag == 'a' and self.current:
            self.hits.append(tuple(self.current)); self.current = None
        if tag == 'h3' and self.in_title: self.in_title -= 1

def search(name: str) -> tuple[str, list[tuple[str, str]], str]:
    url = 'https://www.so.com/s?q=' + quote(name + ' 宿舍条件')
    for attempt in range(2):
        try:
            with urlopen(Request(url, headers={'User-Agent': 'Mozilla/5.0 (compatible; research/1.0)'}), timeout=18) as r:
                content = r.read(700_000).decode('utf-8', 'replace')
            if any(marker in content for marker in ['请输入验证码', '安全验证', '访问验证', '人机验证']):
                return name, [], '搜索受限：遇到验证页，未继续请求；结果不可判定'
            p = Results(); p.feed(content)
            hits = []
            for source, title in p.hits:
                source = html.unescape(source)
                if urlparse(source).scheme not in ('https','http'): continue
                title = ' '.join(html.unescape(title).split())
                if source not in [h[0] for h in hits] and ('宿舍' in title or '住宿' in title):
                    hits.append((source, title))
            return name, hits[:7], '' if hits else '该次未见结果；不能据此判定无资料'
        except Exception as e:
            if attempt: return name, [], f'{type(e).__name__}: {e}'
            time.sleep(1)
    return name, [], 'unknown'

def main():
    p = argparse.ArgumentParser();p.add_argument('--limit',type=int,default=20);p.add_argument('--output',type=Path,required=True);args=p.parse_args()
    with MISSING.open(encoding='utf-8-sig',newline='') as f:names=[r['学校'] for r in csv.DictReader(f)]
    if args.limit:names=names[:args.limit]
    args.output.parent.mkdir(parents=True,exist_ok=True)
    with args.output.open('w',encoding='utf-8',newline='') as f:
        w=csv.writer(f);w.writerow(['学校','候选标题','候选原页','搜索结果性质','备注'])
        for name in names:
            name,hits,error=search(name)
            if not hits:w.writerow([name,'','','搜索受限/未检出，不代表无资料',error])
            for url,title in hits:
                relation='标题含原校名' if name in title else '标题不含原校名，须核校名沿革'
                w.writerow([name,title,url,relation,'仅线索，未核对原页与学校对应关系；不得自动预置'])
            if error.startswith('搜索受限'):
                print('停止检索：遇到搜索验证；没有绕过验证。')
                break
    print('searched',len(names),'schools; source candidates saved to',args.output)
if __name__=='__main__':main()
