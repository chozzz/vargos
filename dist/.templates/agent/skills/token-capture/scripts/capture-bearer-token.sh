#!/usr/bin/env bash
# purpose: capture Claude bearer token via local MITM proxy
# inputs:  -v (verbose), -p <port>, prompt text (optional), TIMEOUT_SECONDS (optional)
# outputs: bearer token to stdout
# last-used: 2026-05-07
set -euo pipefail

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: required command '$1' was not found in PATH." >&2
    exit 1
  fi
}

usage() {
  echo "Usage: $(basename "$0") [-v] [-p port] [prompt]" >&2
}

log() {
  if [[ "${VERBOSE:-0}" == "1" ]]; then
    echo "[token-capture] $*" >&2
  fi
}

require_cmd claude
require_cmd mitmdump

VERBOSE=0
PORT="${PORT:-9121}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-30}"

while getopts ":vp:h" opt; do
  case "$opt" in
    v) VERBOSE=1 ;;
    p) PORT="$OPTARG" ;;
    h)
      usage
      exit 0
      ;;
    :)
      echo "Error: -$OPTARG requires a value." >&2
      usage
      exit 1
      ;;
    \?)
      echo "Error: invalid option -$OPTARG" >&2
      usage
      exit 1
      ;;
  esac
done
shift "$((OPTIND - 1))"

PROMPT="${1:-hello}"

WORK_DIR="$(mktemp -d)"
ADDON_FILE="$WORK_DIR/capture_auth.py"
TOKEN_FILE="$WORK_DIR/token.txt"
MITM_LOG="$WORK_DIR/mitm.log"
CLAUDE_LOG="$WORK_DIR/claude.log"

cleanup() {
  if [[ -n "${MITM_PID:-}" ]]; then
    kill "$MITM_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "${CLAUDE_PID:-}" ]]; then
    kill "$CLAUDE_PID" >/dev/null 2>&1 || true
  fi
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

cat > "$ADDON_FILE" <<'PY'
from mitmproxy import ctx, http
import os

TOKEN_OUT = os.environ["TOKEN_OUT"]

class CaptureAuth:
    def request(self, flow: http.HTTPFlow) -> None:
        if "/v1/messages" not in flow.request.pretty_url:
            return
        auth = flow.request.headers.get("Authorization", "").strip()
        if not auth:
            return
        with open(TOKEN_OUT, "w", encoding="utf-8") as f:
            f.write(auth)
        ctx.master.shutdown()

addons = [CaptureAuth()]
PY

TOKEN_OUT="$TOKEN_FILE" mitmdump --mode regular --listen-port "$PORT" -s "$ADDON_FILE" >"$MITM_LOG" 2>&1 &
MITM_PID=$!
log "mitmdump started (pid=$MITM_PID, port=$PORT)"

sleep 1

NODE_TLS_REJECT_UNAUTHORIZED=0 \
HTTPS_PROXY="http://127.0.0.1:$PORT" \
HTTP_PROXY="http://127.0.0.1:$PORT" \
claude -p "$PROMPT" >"$CLAUDE_LOG" 2>&1 &
CLAUDE_PID=$!
log "claude started (pid=$CLAUDE_PID)"

START_TIME="$(date +%s)"
while [[ ! -s "$TOKEN_FILE" ]]; do
  NOW="$(date +%s)"
  if (( NOW - START_TIME >= TIMEOUT_SECONDS )); then
    break
  fi
  if ! kill -0 "$MITM_PID" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$CLAUDE_PID" >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done

if [[ ! -s "$TOKEN_FILE" ]]; then
  echo "Error: failed to capture Authorization header from /v1/messages." >&2
  echo "Check that Claude made a request and proxy port $PORT was reachable." >&2
  if [[ "$VERBOSE" == "1" ]]; then
    echo "--- mitmdump log ---" >&2
    sed -n '1,120p' "$MITM_LOG" >&2 || true
    echo "--- claude log ---" >&2
    sed -n '1,120p' "$CLAUDE_LOG" >&2 || true
  fi
  exit 2
fi

AUTH_HEADER="$(<"$TOKEN_FILE")"
AUTH_HEADER="${AUTH_HEADER//$'\r'/}"
if [[ "$AUTH_HEADER" == Bearer\ * ]]; then
  printf '%s\n' "${AUTH_HEADER#Bearer }"
else
  printf '%s\n' "$AUTH_HEADER"
fi
