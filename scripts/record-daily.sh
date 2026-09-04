#!/usr/bin/env bash
# 최근 며칠간의 Vercel Web Analytics 일별 수치를 analytics-daily.md 에 갱신한다.
# 필요: VERCEL_TOKEN (환경변수). projectId/teamId 는 토큰으로 자동 조회.
#
# 사용법: record-daily.sh [SINCE] [UNTIL]   (YYYY-MM-DD, 비우면 최근 7일)
# 최근 7일을 매번 다시 읽어 덮어쓰므로 월 경계와 늦게 들어온 수치를 모두 흡수한다.
set -euo pipefail
PROJECT_NAME="posco-center-restaurant-guide"
API="https://api.vercel.com"
AUTH=(-H "Authorization: Bearer ${VERCEL_TOKEN:?VERCEL_TOKEN 이 없습니다}")

UNTIL="${2:-$(TZ=Asia/Seoul date +%Y-%m-%d)}"
SINCE="${1:-$(TZ=Asia/Seoul date -d "$UNTIL -7 day" +%Y-%m-%d)}"
echo "대상 기간: $SINCE ~ $UNTIL"

# ── projectId / teamId 자동 조회 (record-analytics.sh 와 동일한 방식) ──
PROJECT_ID=""; TEAM_ID=""
lookup() { local q=""; [ -n "$1" ] && q="?teamId=$1"
  curl -sS "${AUTH[@]}" "$API/v9/projects/$PROJECT_NAME$q" | jq -r '.id // empty'; }
PROJECT_ID=$(lookup "") || true
if [ -z "$PROJECT_ID" ]; then
  TEAMS_JSON=$(curl -sS "${AUTH[@]}" "$API/v2/teams?limit=50" || echo '{}')
  for t in $(echo "$TEAMS_JSON" | jq -r '.teams[]?.id'); do
    pid=$(lookup "$t"); if [ -n "$pid" ]; then PROJECT_ID="$pid"; TEAM_ID="$t"; break; fi
  done
fi
[ -n "$PROJECT_ID" ] || { echo "프로젝트 '$PROJECT_NAME' 을 찾지 못했습니다."; exit 1; }
echo "projectId=$PROJECT_ID teamId=${TEAM_ID:-(personal)}"
TQ=(); [ -n "$TEAM_ID" ] && TQ=(--data-urlencode "teamId=$TEAM_ID")

AGG=$(curl -fsS --get "$API/v1/query/web-analytics/visits/aggregate" "${AUTH[@]}" "${TQ[@]}" \
  --data-urlencode "projectId=$PROJECT_ID" --data-urlencode "since=$SINCE" \
  --data-urlencode "until=$UNTIL" --data-urlencode "by=day")

NOW=$(TZ=Asia/Seoul date +"%Y-%m-%d %H:%M")
echo "$AGG" | jq -c '.data[]?' | python3 scripts/merge-daily.py analytics-daily.md "$NOW"
