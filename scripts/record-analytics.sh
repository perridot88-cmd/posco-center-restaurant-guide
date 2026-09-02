#!/usr/bin/env bash
# 지난달(또는 지정한 달)의 Vercel Web Analytics 수치를 analytics-log.md 에 한 줄 기록한다.
# 필요: VERCEL_TOKEN (환경변수). projectId/teamId 는 토큰으로 자동 조회.
set -euo pipefail
PROJECT_NAME="posco-center-restaurant-guide"
API="https://api.vercel.com"
AUTH=(-H "Authorization: Bearer ${VERCEL_TOKEN:?VERCEL_TOKEN 이 없습니다}")

# ── 대상 월 (KST 기준). 인자가 없으면 지난달 ──
if [ -n "${1:-}" ]; then MONTH="$1"; else MONTH=$(TZ=Asia/Seoul date -d "$(TZ=Asia/Seoul date +%Y-%m-01) -1 day" +%Y-%m); fi
SINCE="${MONTH}-01"
UNTIL=$(date -d "${SINCE} +1 month -1 day" +%Y-%m-%d)
echo "대상 월: $MONTH ($SINCE ~ $UNTIL)"

# ── projectId / teamId 자동 조회 ──
TEAM_IDS=$(curl -fsS "${AUTH[@]}" "$API/v2/teams?limit=50" | jq -r '.teams[].id')
PROJECT_ID=""; TEAM_ID=""
for t in "" $TEAM_IDS; do
  q=""; [ -n "$t" ] && q="?teamId=$t"
  if pid=$(curl -fsS "${AUTH[@]}" "$API/v9/projects/$PROJECT_NAME$q" 2>/dev/null | jq -r '.id // empty'); then
    if [ -n "$pid" ]; then PROJECT_ID="$pid"; TEAM_ID="$t"; break; fi
  fi
done
[ -n "$PROJECT_ID" ] || { echo "프로젝트를 찾지 못했습니다"; exit 1; }
echo "projectId=$PROJECT_ID teamId=${TEAM_ID:-(personal)}"
TQ=(); [ -n "$TEAM_ID" ] && TQ=(--data-urlencode "teamId=$TEAM_ID")

# ── 일별 집계 → 월 합계 ──
AGG=$(curl -fsS --get "$API/v1/query/web-analytics/visits/aggregate" "${AUTH[@]}" "${TQ[@]}" \
  --data-urlencode "projectId=$PROJECT_ID" --data-urlencode "since=$SINCE" --data-urlencode "until=$UNTIL" --data-urlencode "by=day")
PV=$(echo "$AGG" | jq '[.data[].pageviews] | add // 0')
VD=$(echo "$AGG" | jq '[.data[].visitors] | add // 0')
DAYS=$(echo "$AGG" | jq '[.data[] | select(.pageviews>0)] | length')
PEAK=$(echo "$AGG" | jq -r 'if (.data|length)>0 then (.data | max_by(.pageviews) | "\(.timestamp[0:10]) (\(.pageviews)뷰)") else "-" end')

# ── 월 순방문자 (count 엔드포인트가 기간을 받으면 사용, 아니면 "-") ──
UV=$(curl -fsS --get "$API/v1/query/web-analytics/visits/count" "${AUTH[@]}" "${TQ[@]}" \
  --data-urlencode "projectId=$PROJECT_ID" --data-urlencode "since=$SINCE" --data-urlencode "until=$UNTIL" 2>/dev/null | jq -r '.data.visitors // "-"' || echo "-")

NOW=$(TZ=Asia/Seoul date +"%Y-%m-%d %H:%M")
ROW="| $MONTH | $PV | $UV | $VD | $DAYS | $PEAK | $NOW |"
echo "$ROW"

# ── 기록 (같은 달이 이미 있으면 교체) ──
F=analytics-log.md
if grep -q "^| $MONTH |" "$F"; then
  python3 - "$F" "$MONTH" "$ROW" <<'PY'
import sys,io
f,m,row=sys.argv[1:]; lines=io.open(f,encoding='utf-8').read().split('\n')
io.open(f,'w',encoding='utf-8').write('\n'.join(row if l.startswith(f'| {m} |') else l for l in lines))
PY
else
  echo "$ROW" >> "$F"
fi
