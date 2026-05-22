#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Workday Journal — Task Reminder
# Fires native macOS notifications for tasks due today, overdue, and tomorrow.
#
# Dependencies: curl, jq  (jq: brew install jq)
# Token stored in macOS Keychain — run install-reminder.sh to set up.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

API_BASE="https://workday-journal.vercel.app/api/gpt"
TODAY=$(date +%Y-%m-%d)
TOMORROW=$(date -v+1d +%Y-%m-%d)   # macOS date syntax

# ── Token ────────────────────────────────────────────────────────────────────

TOKEN=$(security find-generic-password \
    -a "workday-journal" \
    -s "workday-journal-api" \
    -w 2>/dev/null) || {
  notify "Workday Journal" "Setup needed" \
    "No API token found. Run scripts/install-reminder.sh."
  exit 1
}

# ── Helpers ───────────────────────────────────────────────────────────────────

notify() {
  local title="$1"
  local subtitle="$2"
  local msg="$3"
  # Escape backslashes and double-quotes for osascript
  msg="${msg//\\/\\\\}"
  msg="${msg//\"/\\\"}"
  subtitle="${subtitle//\"/\\\"}"
  osascript -e \
    "display notification \"$msg\" with title \"$title\" subtitle \"$subtitle\" sound name \"Ping\"" \
    2>/dev/null || true
}

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*"; }

# ── Test mode (run with --test to verify connection without notifying) ────────

TEST_MODE=false
[[ "${1:-}" == "--test" ]] && TEST_MODE=true

if $TEST_MODE; then
  log "Testing connection to $API_BASE/health ..."
  result=$(curl -sf --max-time 10 "$API_BASE/health" 2>&1) || {
    log "ERROR: Could not reach API — $result"
    exit 1
  }
  log "Health check: $result"
  log "Fetching tasks..."
  curl -sf --max-time 10 \
    -H "Authorization: Bearer $TOKEN" \
    "$API_BASE/tasks?limit=5" | \
    python3 -c "import sys,json; d=json.load(sys.stdin); print(f'  Found {len(d[\"tasks\"])} tasks (showing up to 5)')"
  log "Connection OK ✓"
  exit 0
fi

# ── Fetch tasks ───────────────────────────────────────────────────────────────

log "Fetching tasks..."
TASKS=$(curl -sf --max-time 15 \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/tasks?limit=250" 2>/dev/null) || {
  log "WARNING: Failed to fetch tasks — skipping reminder"
  exit 0
}

# ── Filter by due date ────────────────────────────────────────────────────────

OVERDUE=$(echo "$TASKS" | jq -r --arg today "$TODAY" \
  '[.tasks[] | select(.status != "completed" and .dueDate != null and .dueDate < $today)] | sort_by(.dueDate)')

DUE_TODAY=$(echo "$TASKS" | jq -r --arg today "$TODAY" \
  '[.tasks[] | select(.status != "completed" and .dueDate == $today)]')

DUE_TOMORROW=$(echo "$TASKS" | jq -r --arg tmrw "$TOMORROW" \
  '[.tasks[] | select(.status != "completed" and .dueDate == $tmrw)]')

OVERDUE_COUNT=$(echo "$OVERDUE"   | jq 'length')
TODAY_COUNT=$(echo "$DUE_TODAY"   | jq 'length')
TOMORROW_COUNT=$(echo "$DUE_TOMORROW" | jq 'length')

log "Overdue: $OVERDUE_COUNT  |  Due today: $TODAY_COUNT  |  Due tomorrow: $TOMORROW_COUNT"

# Nothing relevant? Exit quietly.
if [[ "$OVERDUE_COUNT" -eq 0 && "$TODAY_COUNT" -eq 0 && "$TOMORROW_COUNT" -eq 0 ]]; then
  log "Nothing due — no notifications sent."
  exit 0
fi

# ── Overdue tasks (summary) ───────────────────────────────────────────────────

if [[ "$OVERDUE_COUNT" -gt 0 ]]; then
  if [[ "$OVERDUE_COUNT" -eq 1 ]]; then
    title=$(echo "$OVERDUE" | jq -r '.[0].title')
    due=$(echo "$OVERDUE"   | jq -r '.[0].dueDate')
    notify "Workday Journal" "⚠️  Overdue (was due $due)" "$title"
  else
    notify "Workday Journal" "⚠️  $OVERDUE_COUNT tasks overdue" \
      "$(echo "$OVERDUE" | jq -r '.[0].title') + $((OVERDUE_COUNT - 1)) more"
  fi
  sleep 0.8
fi

# ── Due today (one notification per task, up to 5) ───────────────────────────

if [[ "$TODAY_COUNT" -gt 0 ]]; then
  limit=$([[ "$TODAY_COUNT" -gt 5 ]] && echo 5 || echo "$TODAY_COUNT")
  while IFS= read -r task_title; do
    notify "Workday Journal" "Due today" "$task_title"
    sleep 0.5
  done < <(echo "$DUE_TODAY" | jq -r ".[0:$limit] | .[].title")

  if [[ "$TODAY_COUNT" -gt 5 ]]; then
    remaining=$((TODAY_COUNT - 5))
    notify "Workday Journal" "Due today" "…and $remaining more"
    sleep 0.5
  fi
fi

# ── Due tomorrow (heads-up) ───────────────────────────────────────────────────

if [[ "$TOMORROW_COUNT" -gt 0 ]]; then
  if [[ "$TOMORROW_COUNT" -eq 1 ]]; then
    title=$(echo "$DUE_TOMORROW" | jq -r '.[0].title')
    notify "Workday Journal" "Due tomorrow" "$title"
  else
    notify "Workday Journal" "Due tomorrow" \
      "$TOMORROW_COUNT tasks due tomorrow"
  fi
fi

log "Done."
