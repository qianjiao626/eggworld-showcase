#!/usr/bin/env python3
"""Generate a human-review discovery queue for every directory school.

This script only creates search URLs. It does not scrape, publish, or infer dormitory facts.
Each result must be opened and checked against the school, campus, building and publication date
before it can be promoted into js/dormitory-facts.js.
"""
from __future__ import annotations
import argparse
import csv
import re
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
SCHOOL_SOURCE = ROOT / "js" / "bl-schools.js"
DEFAULT_OUTPUT = ROOT / "tasks" / "2026-09-25_宿舍平台检索队列.csv"

PLATFORMS = [
    ("阳光高考", "https://gaokao.chsi.com.cn/zyck/dxsh?keyword={query}"),
    ("百度", "https://www.baidu.com/s?wd={query}"),
    ("必应", "https://www.bing.com/search?q={query}"),
    ("搜狗", "https://www.sogou.com/web?query={query}"),
    ("知乎", "https://www.zhihu.com/search?type=content&q={query}"),
    ("百度贴吧", "https://tieba.baidu.com/f?kw={query}"),
    ("抖音", "https://www.douyin.com/search/{query}"),
    ("小红书", "https://www.xiaohongshu.com/search_result?keyword={query}"),
]


def school_names() -> list[str]:
    text = SCHOOL_SOURCE.read_text(encoding="utf-8")
    names = re.findall(r"^\s*'([^']+)',?\s*$", text, flags=re.M)
    return list(dict.fromkeys(names))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--limit", type=int, default=0, help="仅生成前 N 所，0 表示全部")
    args = parser.parse_args()
    names = school_names()
    if args.limit:
        names = names[: args.limit]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["学校", "平台", "检索词", "搜索入口", "证据状态", "处理规则"])
        for name in names:
            search_term = f"{name} 宿舍 房型 楼号 上床下桌 独立卫浴 实拍"
            encoded = quote(search_term, safe="")
            for platform, template in PLATFORMS:
                writer.writerow([
                    name,
                    platform,
                    search_term,
                    template.format(query=encoded),
                    "待人工核验",
                    "只记录原页可核实内容；搜索摘要、平台图片和用户评论不得直接当作校方事实；冲突资料保留不确定性",
                ])
    print(f"generated {len(names)} schools x {len(PLATFORMS)} platforms = {len(names) * len(PLATFORMS)} queue rows")
    print(args.output)


if __name__ == "__main__":
    main()
