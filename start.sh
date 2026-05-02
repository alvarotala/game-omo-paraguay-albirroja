#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

HTTP_PORT="${HTTP_PORT:-8000}"
GPIO_WS_HOST="${GPIO_WS_HOST:-127.0.0.1}"
GPIO_WS_PORT="${GPIO_WS_PORT:-8765}"
GPIO_LEFT_PIN="${GPIO_LEFT_PIN:-17}"
GPIO_RIGHT_PIN="${GPIO_RIGHT_PIN:-27}"
GPIO_DEBOUNCE="${GPIO_DEBOUNCE:-0.16}"
GPIO_PULL_UP="${GPIO_PULL_UP:-0}"
GPIO_STDIN_SIM="${GPIO_STDIN_SIM:-0}"
CHROMIUM_BIN="${CHROMIUM_BIN:-}"

if [[ -z "$CHROMIUM_BIN" ]]; then
  if command -v chromium-browser >/dev/null 2>&1; then
    CHROMIUM_BIN="chromium-browser"
  elif command -v chromium >/dev/null 2>&1; then
    CHROMIUM_BIN="chromium"
  else
    echo "No encuentro chromium-browser ni chromium en PATH" >&2
    exit 1
  fi
fi

cleanup() {
  [[ -n "${HTTP_PID:-}" ]] && kill "$HTTP_PID" >/dev/null 2>&1 || true
  [[ -n "${GPIO_PID:-}" ]] && kill "$GPIO_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

export GPIO_WS_HOST GPIO_WS_PORT GPIO_LEFT_PIN GPIO_RIGHT_PIN GPIO_DEBOUNCE GPIO_PULL_UP GPIO_STDIN_SIM

python3 gpio_ws_bridge.py &
GPIO_PID="$!"

python3 -m http.server "$HTTP_PORT" --bind 127.0.0.1 &
HTTP_PID="$!"

sleep 1

GAME_URL="http://127.0.0.1:${HTTP_PORT}/?bridge=ws://127.0.0.1:${GPIO_WS_PORT}"
echo "HTTP server: http://127.0.0.1:${HTTP_PORT}/"
echo "GPIO bridge: ws://127.0.0.1:${GPIO_WS_PORT}"
echo "GPIO pins BCM: left=${GPIO_LEFT_PIN}, right=${GPIO_RIGHT_PIN}, HIGH press, debounce=${GPIO_DEBOUNCE}s"
echo "Opening Chromium kiosk: $GAME_URL"

"$CHROMIUM_BIN"   --kiosk   --start-fullscreen   --noerrdialogs   --disable-infobars   --disable-session-crashed-bubble   --autoplay-policy=no-user-gesture-required   --check-for-update-interval=31536000   "$GAME_URL"
