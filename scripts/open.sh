#!/bin/sh
# Start the PR desk server if it isn't running, then open it in the browser.
# Prints the PID of a server it started, so PR Desk.app can stop it on quit.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-8765}"
URL="http://127.0.0.1:$PORT"
LOG="$HOME/Library/Logs/pr-desk.log"

running() { curl -fs -o /dev/null --max-time 2 "$URL/api/status"; }

if ! running; then
  cd "$ROOT" || exit 1
  nohup python3 server.py --port "$PORT" >>"$LOG" 2>&1 </dev/null &
  echo $!
  for _ in $(seq 20); do running && break; sleep 0.5; done
fi
open "$URL"
