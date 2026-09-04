#!/usr/bin/env python3
"""표준입력의 Vercel 일별 JSON(줄당 하나)을 일별 기록 표에 병합한다.

같은 날짜가 이미 있으면 새 값으로 교체하고, 없으면 추가한다.
표는 항상 최신 날짜가 위로 오게 다시 정렬해 쓴다.

사용법: ... | merge-daily.py <파일> <기록시각>
"""
import io
import json
import sys
from datetime import date

WEEKDAYS = "월화수목금토일"
START = "2026-09-02"  # 집계 시작일. 이전 날짜는 기록하지 않는다
SEPARATOR = "|---|"


def main():
    path, recorded_at = sys.argv[1], sys.argv[2]
    rows = {}

    # 기존 표 읽기
    lines = io.open(path, encoding="utf-8").read().split("\n")
    head_end = next(i for i, l in enumerate(lines) if l.startswith(SEPARATOR))
    for l in lines[head_end + 1:]:
        cells = [c.strip() for c in l.strip().strip("|").split("|")]
        if len(cells) >= 5 and cells[0][:2] == "20" and cells[0] >= START:
            rows[cells[0]] = cells

    # 새 수치로 갱신
    changed = 0
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        d = json.loads(line)
        day = d["timestamp"][:10]
        if day < START:
            continue
        y, m, dd = (int(x) for x in day.split("-"))
        new = [day, WEEKDAYS[date(y, m, dd).weekday()],
               str(d.get("pageviews", 0)), str(d.get("visitors", 0)), recorded_at]
        if rows.get(day, [])[:4] != new[:4]:
            changed += 1
        rows[day] = new

    # 최신 날짜가 위로
    body = ["| " + " | ".join(rows[k]) + " |" for k in sorted(rows, reverse=True)]
    io.open(path, "w", encoding="utf-8").write(
        "\n".join(lines[:head_end + 1] + body) + "\n")
    print(f"{len(rows)}일치 기록 (이번에 갱신 {changed}일)")
    for r in body[:5]:
        print(r)


if __name__ == "__main__":
    main()
