#!/usr/bin/env bash
set -euo pipefail

backend_pid=""
frontend_pid=""

cleanup() {
  trap - EXIT INT TERM HUP

  for pid in "$backend_pid" "$frontend_pid"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill -TERM -- "-$pid" 2>/dev/null || true
    fi
  done

  for pid in "$backend_pid" "$frontend_pid"; do
    if [[ -n "$pid" ]]; then
      wait "$pid" 2>/dev/null || true
    fi
  done
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

(
  cd BE2
  exec setsid npm run dev
) &
backend_pid=$!

(
  cd samiti
  exec setsid npm start
) &
frontend_pid=$!

wait -n "$backend_pid" "$frontend_pid"
