#!/usr/bin/env python3
"""Parse manually reviewed alias pages into source-linked dormitory facts."""
from __future__ import annotations
import argparse, html, json, re, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from dormitory_fact_batch import fetch, text, normalized_rooms, room_values, first_terms, bathroom_summary, summarize, ACCESS_DATE

def parse(item: dict) -> dict | None:
    page = fetch(item['url'])
    title_match = re.search(r'<title[^>]*>(.*?)</title>', page, re.S | re.I)
    title = text(title_match.group(1)) if title_match else ''
    if not title.startswith(item['actual']) or '宿舍条件' not in title:
        raise ValueError(f"title mismatch: {title[:120]}")
    update = re.search(r'(?:更新|更新时间)：?\s*(\d{4}-\d{1,2}-\d{1,2})', page, re.S | re.I)
    year = int(update.group(1)[:4]) if update else None
    if not year or not 2020 <= year <= 2026:
        raise ValueError(f'unsupported update year: {year}')
    start = re.search(r'<div\s+class=["\']content["\'][^>]*>', page, re.I)
    if not start: raise ValueError('content not found')
    tail = page[start.end():]
    end = re.search(r'<div\s+class=["\']mark["\'][^>]*>', tail, re.I)
    content = tail[:end.start()] if end else tail
    headings = list(re.finditer(r'<h2[^>]*>.*?</h2>', content, re.S | re.I))
    selected=[]
    for i,h in enumerate(headings):
        ht=text(h.group(0))
        if '宿舍条件' not in ht and not ('宿舍' in ht and '评价' in ht): continue
        e=headings[i+1].start() if i+1<len(headings) else len(content)
        sec=text(content[h.end():e])
        sec=re.split(r'(?:食堂|餐饮条件|餐厅条件)\s*[:：]',sec,maxsplit=1)[0]
        if sec and sec not in selected: selected.append(sec)
    if not selected: raise ValueError('dormitory section not found')
    body=' '.join(selected)
    rooms=normalized_rooms(room_values(body))
    beds=first_terms(body,['上床下桌','上铺下桌','上床下柜','上床下铺','上下铺'])
    bathroom=bathroom_summary(body)
    campuses=[]
    for campus in re.findall(r'[\u4e00-\u9fff]{2,12}校区',body):
        if campus not in campuses: campuses.append(campus)
    desc=summarize(body,rooms,beds,[bathroom] if bathroom else [],campuses)
    if not desc: raise ValueError('no structured dormitory content')
    description=f"目录学校名为{item['name']}，公开页面对应{item['actual']}。{desc}。页面未逐栋核实，当前分配待核实。"
    return {
      'name':item['name'],'campus':'、'.join(campuses),'building':'','scope':f"{item['mapping']}；原页未逐栋列明；当前分配及具体配置年份待核实；第三方资料仅供参考",
      'occupancy':'、'.join(rooms),'bedType':'、'.join(beds),'bathroom':bathroom,'description':description,
      'sourceType':'third_party','sourceTitle':f"大学生必备网·{item['actual']}宿舍条件（目录校名：{item['name']}）",
      'sourceUrl':item['url'],'sourceYear':year,'sourceYearLabel':f"页面更新于{update.group(1)}；宿舍配置年份未注明；目录校名沿革按人工核对保留",
      'accessedAt':ACCESS_DATE
    }

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--input',type=Path,required=True); ap.add_argument('--output',type=Path,required=True)
    args=ap.parse_args(); out=[]; errors=[]
    for item in json.loads(args.input.read_text(encoding='utf-8')):
      try: out.append(parse(item))
      except Exception as e: errors.append({'name':item['name'],'url':item['url'],'error':str(e)})
    args.output.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'parsed={len(out)} errors={len(errors)}')
    if errors:
      print(json.dumps(errors,ensure_ascii=False,indent=2))
      raise SystemExit(2)
if __name__=='__main__': main()
