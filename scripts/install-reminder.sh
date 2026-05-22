#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Workday Journal — Task Reminder Installer
#
# Sets up the daily task reminder by:
#   1. Checking dependencies (curl, jq)
#   2. Storing your API token securely in macOS Keychain
#   3. Copying the reminder script to a stable location
#   4. Installing a launchd agent to fire it on schedule
#   5. Running a quick connection test
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMINDER_SRC="$SCRIPT_DIR/task-reminder.sh"
INSTALL_DIR="$HOME/.local/share/workday-journal"
INSTALL_SCRIPT="$INSTALL_DIR/task-reminder.sh"
PLIST_NAME="com.workdayjournal.task-reminder"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"
LOG_PATH="$HOME/Library/Logs/workday-journal-reminder.log"

bold()  { printf '\033[1m%s\033[0m' "$*"; }
green() { printf '\033[32m%s\033[0m' "$*"; }
red()   { printf '\033[31m%s\033[0m' "$*"; }
dim()   { printf '\033[2m%s\033[0m' "$*"; }

echo ""
echo "$(bold 'Workday Journal — Task Reminder Setup')"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── Check dependencies ────────────────────────────────────────────────────────

echo "Checking dependencies..."

if ! command -v curl &>/dev/null; then
  echo "  $(red '✗') curl not found (should be built into macOS)"
  exit 1
fi
echo "  $(green '✓') curl"

if ! command -v jq &>/dev/null; then
  echo "  $(red '✗') jq not found"
  echo ""
  echo "  Install it with:  brew install jq"
  echo "  Then re-run this installer."
  exit 1
fi
echo "  $(green '✓') jq"

echo ""

# ── API token ─────────────────────────────────────────────────────────────────

echo "$(bold 'API Token')"
echo "Get yours from the app:  Settings → API Token"
echo ""

# Check if one is already stored
EXISTING=""
EXISTING=$(security find-generic-password \
  -a "workday-journal" -s "workday-journal-api" -w 2>/dev/null) || true

if [[ -n "$EXISTING" ]]; then
  echo "  An existing token is already stored in Keychain."
  read -rp "  Replace it? (y/N): " REPLACE
  REPLACE="${REPLACE:-n}"
  if [[ ! "$REPLACE" =~ ^[Yy]$ ]]; then
    echo "  Keeping existing token."
    TOKEN="$EXISTING"
  else
    EXISTING=""
  fi
fi

if [[ -z "$EXISTING" ]]; then
  read -rsp "  Paste your API token (input hidden): " TOKEN
  echo ""
  if [[ -z "$TOKEN" ]]; then
    echo "  $(red 'Error:') Token cannot be empty."
    exit 1
  fi
  security delete-generic-password \
    -a "workday-journal" -s "workday-journal-api" 2>/dev/null || true
  security add-generic-password \
    -a "workday-journal" -s "workday-journal-api" -w "$TOKEN"
  echo "  $(green '✓') Token saved to macOS Keychain"
fi

echo ""

# ── Schedule ──────────────────────────────────────────────────────────────────

echo "$(bold 'Reminder Schedule')"
echo "When should the reminder fire each day?"
echo ""

read -rp "  Morning hour   (0-23, default 9):  " HOUR1
HOUR1="${HOUR1:-9}"
read -rp "  Morning minute (0-59, default 0):  " MIN1
MIN1="${MIN1:-0}"

echo ""
read -rp "  Add an afternoon reminder too? (y/N): " ADD_PM
ADD_PM="${ADD_PM:-n}"

HOUR2=""
MIN2=""
if [[ "$ADD_PM" =~ ^[Yy]$ ]]; then
  read -rp "  Afternoon hour   (0-23, default 13): " HOUR2
  HOUR2="${HOUR2:-13}"
  read -rp "  Afternoon minute (0-59, default 0):  " MIN2
  MIN2="${MIN2:-0}"
fi

echo ""

# ── Install script ────────────────────────────────────────────────────────────

mkdir -p "$INSTALL_DIR"
cp "$REMINDER_SRC" "$INSTALL_SCRIPT"
chmod +x "$INSTALL_SCRIPT"
echo "$(green '✓') Reminder script installed to $INSTALL_DIR"

# ── Write launchd plist ───────────────────────────────────────────────────────

mkdir -p "$HOME/Library/LaunchAgents"

# Build StartCalendarInterval block
if [[ -n "$HOUR2" ]]; then
  SCHEDULE_BLOCK="
    <key>StartCalendarInterval</key>
    <array>
      <dict>
        <key>Hour</key>    <integer>$HOUR1</integer>
        <key>Minute</key>  <integer>$MIN1</integer>
      </dict>
      <dict>
        <key>Hour</key>    <integer>$HOUR2</integer>
        <key>Minute</key>  <integer>$MIN2</integer>
      </dict>
    </array>"
else
  SCHEDULE_BLOCK="
    <key>StartCalendarInterval</key>
    <dict>
      <key>Hour</key>    <integer>$HOUR1</integer>
      <key>Minute</key>  <integer>$MIN1</integer>
    </dict>"
fi

cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$PLIST_NAME</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$INSTALL_SCRIPT</string>
  </array>
  $SCHEDULE_BLOCK

  <key>StandardOutPath</key>
  <string>$LOG_PATH</string>
  <key>StandardErrorPath</key>
  <string>$LOG_PATH</string>

  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
PLIST

echo "$(green '✓') LaunchAgent plist written"

# ── Load the agent ────────────────────────────────────────────────────────────

# Unload first in case it was previously installed
launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load -w "$PLIST_PATH"
echo "$(green '✓') LaunchAgent loaded"

echo ""

# ── Test connection ───────────────────────────────────────────────────────────

echo "$(bold 'Testing connection...')"
if "$INSTALL_SCRIPT" --test; then
  echo ""
  echo "$(green '✓') All good!"
else
  echo ""
  echo "$(red 'Warning:') Connection test failed."
  echo "Check that your API token is correct and the app is deployed."
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [[ -n "$HOUR2" ]]; then
  echo "$(bold "Reminders will fire daily at $(printf '%02d:%02d' "$HOUR1" "$MIN1") and $(printf '%02d:%02d' "$HOUR2" "$MIN2").")"
else
  echo "$(bold "Reminders will fire daily at $(printf '%02d:%02d' "$HOUR1" "$MIN1").")"
fi
echo ""
echo "Logs:    $LOG_PATH"
echo "Script:  $INSTALL_SCRIPT"
echo "Agent:   $PLIST_PATH"
echo ""
echo "$(dim 'To uninstall:')"
echo "$(dim "  launchctl unload $PLIST_PATH")"
echo "$(dim "  rm $PLIST_PATH $INSTALL_SCRIPT")"
echo "$(dim "  security delete-generic-password -a workday-journal -s workday-journal-api")"
echo ""
