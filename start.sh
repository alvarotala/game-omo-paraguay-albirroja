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
GPIO_DEBUG="${GPIO_DEBUG:-0}"
CHROMIUM_BIN="${CHROMIUM_BIN:-}"
CHROMIUM_USER_DATA_DIR="${CHROMIUM_USER_DATA_DIR:-/tmp/omo-chromium-profile}"
EFFECTS_SCALE="${EFFECTS_SCALE:-0.7}"

if [[ -z "$CHROMIUM_BIN" ]]; then
  if command -v chromium >/dev/null 2>&1; then
    CHROMIUM_BIN="chromium"
  elif command -v chromium-browser >/dev/null 2>&1; then
    CHROMIUM_BIN="chromium-browser"
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

export GPIO_WS_HOST GPIO_WS_PORT GPIO_LEFT_PIN GPIO_RIGHT_PIN GPIO_DEBOUNCE GPIO_PULL_UP GPIO_STDIN_SIM GPIO_DEBUG

python3 gpio_ws_bridge.py &
GPIO_PID="$!"

python3 kiosk_http_server.py "$HTTP_PORT" --bind 127.0.0.1 --directory "$ROOT_DIR" &
HTTP_PID="$!"

mkdir -p "$CHROMIUM_USER_DATA_DIR"

sleep 1

GAME_URL="http://127.0.0.1:${HTTP_PORT}/?bridge=ws://127.0.0.1:${GPIO_WS_PORT}&effects=${EFFECTS_SCALE}"
echo "HTTP server: http://127.0.0.1:${HTTP_PORT}/"
echo "GPIO bridge: ws://127.0.0.1:${GPIO_WS_PORT}"
echo "GPIO pins BCM: left=${GPIO_LEFT_PIN}, right=${GPIO_RIGHT_PIN}, HIGH press, debounce=${GPIO_DEBOUNCE}s"
echo "Effects scale: ${EFFECTS_SCALE}"
echo "Opening Chromium kiosk: $GAME_URL"

"$CHROMIUM_BIN" \
  --kiosk \
  --start-fullscreen \
  --noerrdialogs \
  --no-first-run \
  --no-default-browser-check \
  --disable-infobars \
  --disable-translate \
  --disable-features=Translate,TranslateUI \
  --lang=es-PY \
  --accept-lang=es-PY,es,en-US,en \
  --disable-session-crashed-bubble \
  --disable-background-networking \
  --disable-sync \
  --disable-component-update \
  --disable-domain-reliability \
  --disable-crash-reporter \
  --disable-crashpad \
  --metrics-recording-only \
  --user-data-dir="$CHROMIUM_USER_DATA_DIR" \
  --autoplay-policy=no-user-gesture-required \
  --check-for-update-interval=31536000 \
  ${CHROMIUM_EXTRA_FLAGS:-} \
  "$GAME_URL"
