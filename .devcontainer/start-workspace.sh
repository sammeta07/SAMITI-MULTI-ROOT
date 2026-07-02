#!/usr/bin/env bash
set -euo pipefail

LOG_DIR="/tmp/samiti-workspace-logs"
mkdir -p "$LOG_DIR"

port_is_listening() {
  local port="$1"
  ss -ltn 2>/dev/null | grep -q ":$port "
}

start_if_missing() {
  local port="$1"
  local workdir="$2"
  local command="$3"
  local logfile="$4"

  if port_is_listening "$port"; then
    echo "Port $port already in use, skipping $command"
    return
  fi

  (
    cd "$workdir"
    nohup bash -lc "$command" >"$LOG_DIR/$logfile" 2>&1 &
  )
}

start_if_missing 3000 "BE2" "npm run dev" "backend.log"
start_if_missing 4200 "samiti" "npm start -- --host 0.0.0.0" "frontend.log"

echo "Frontend log: $LOG_DIR/frontend.log"
echo "Backend log: $LOG_DIR/backend.log"