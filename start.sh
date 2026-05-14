#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

HTTP_PORT="${HTTP_PORT:-8000}"
GPIO_WS_HOST="${GPIO_WS_HOST:-127.0.0.1}"
GPIO_WS_PORT="${GPIO_WS_PORT:-8765}"
GPIO_LEFT_PIN="${GPIO_LEFT_PIN:-17}"
GPIO_RIGHT_PIN="${GPIO_RIGHT_PIN:-27}"
GPIO_DEBOUNCE="${GPIO_DEBOUNCE:-0.03}"
GPIO_POLL_SECONDS="${GPIO_POLL_SECONDS:-0.005}"
GPIO_PULL_UP="${GPIO_PULL_UP:-1}"
GPIO_BUTTON_MODE="${GPIO_BUTTON_MODE:-NC}"
GPIO_STDIN_SIM="${GPIO_STDIN_SIM:-0}"
GPIO_DEBUG="${GPIO_DEBUG:-0}"
CHROMIUM_BIN="${CHROMIUM_BIN:-}"
CHROMIUM_USER_DATA_DIR="${CHROMIUM_USER_DATA_DIR:-/tmp/omo-chromium-profile}"
GAME_RENDER_PROFILE="${GAME_RENDER_PROFILE:-raspberry-light}"
GAME_FPS="${GAME_FPS:-30}"
EFFECTS_SCALE="${EFFECTS_SCALE:-0.35}"
HIDE_MOUSE="${HIDE_MOUSE:-1}"

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
  [[ -n "${UNCLUTTER_PID:-}" ]] && kill "$UNCLUTTER_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

export GPIO_WS_HOST GPIO_WS_PORT GPIO_LEFT_PIN GPIO_RIGHT_PIN GPIO_DEBOUNCE GPIO_POLL_SECONDS GPIO_PULL_UP GPIO_BUTTON_MODE GPIO_STDIN_SIM GPIO_DEBUG

python3 gpio_ws_bridge.py &
GPIO_PID="$!"

python3 kiosk_http_server.py "$HTTP_PORT" --bind 127.0.0.1 --directory "$ROOT_DIR" &
HTTP_PID="$!"

mkdir -p "$CHROMIUM_USER_DATA_DIR/Default"

python3 - "$CHROMIUM_USER_DATA_DIR" <<'CHROMIUM_PREFS_PY'
import json
import sys
from pathlib import Path

profile = Path(sys.argv[1])
default = profile / "Default"
default.mkdir(parents=True, exist_ok=True)

preferences_path = default / "Preferences"
try:
    preferences = json.loads(preferences_path.read_text())
except Exception:
    preferences = {}

preferences.setdefault("translate", {})["enabled"] = False
preferences.setdefault("intl", {})["accept_languages"] = "es-PY,es-419,es,en-US,en"
preferences.setdefault("browser", {})["enable_spellchecking"] = False
profile_prefs = preferences.setdefault("profile", {})
content_settings = profile_prefs.setdefault("default_content_setting_values", {})
content_settings["notifications"] = 2
preferences_path.write_text(json.dumps(preferences, separators=(",", ":")))

local_state_path = profile / "Local State"
try:
    local_state = json.loads(local_state_path.read_text())
except Exception:
    local_state = {}

local_state.setdefault("intl", {})["app_locale"] = "es-PY"
local_state.setdefault("translate", {})["enabled"] = False
local_state_path.write_text(json.dumps(local_state, separators=(",", ":")))
CHROMIUM_PREFS_PY

sleep 1


if [[ "$HIDE_MOUSE" == "1" ]]; then
  if command -v unclutter >/dev/null 2>&1; then
    unclutter -idle 0.1 -root >/dev/null 2>&1 &
    UNCLUTTER_PID="$!"
    echo "Mouse cursor hider: unclutter pid=${UNCLUTTER_PID}"
  else
    echo "Mouse cursor hider: unclutter not found. Install with: sudo apt install -y unclutter" >&2
  fi
fi

GAME_URL="http://127.0.0.1:${HTTP_PORT}/?bridge=ws://127.0.0.1:${GPIO_WS_PORT}&profile=${GAME_RENDER_PROFILE}&effects=${EFFECTS_SCALE}&fps=${GAME_FPS}"
echo "HTTP server: http://127.0.0.1:${HTTP_PORT}/"
echo "GPIO bridge: ws://127.0.0.1:${GPIO_WS_PORT}"
GPIO_ACTIVE_LEVEL="LOW"
case "$GPIO_PULL_UP" in
  0|false|False|FALSE|no|No|NO) GPIO_ACTIVE_LEVEL="HIGH" ;;
esac
GPIO_BUTTON_MODE_LABEL="NC"
case "$GPIO_BUTTON_MODE" in
  no|NO|normally_open|NORMALLY_OPEN|normal_open|NORMAL_OPEN|open|OPEN) GPIO_BUTTON_MODE_LABEL="NO" ;;
esac
GPIO_PRESS_LEVEL="$GPIO_ACTIVE_LEVEL"
if [[ "$GPIO_BUTTON_MODE_LABEL" == "NC" ]]; then
  if [[ "$GPIO_ACTIVE_LEVEL" == "LOW" ]]; then
    GPIO_PRESS_LEVEL="HIGH"
  else
    GPIO_PRESS_LEVEL="LOW"
  fi
fi
echo "GPIO pins BCM: left=${GPIO_LEFT_PIN}, right=${GPIO_RIGHT_PIN}, mode=${GPIO_BUTTON_MODE_LABEL}, pressed=${GPIO_PRESS_LEVEL}, debounce=${GPIO_DEBOUNCE}s, poll=${GPIO_POLL_SECONDS}s"
echo "Render profile: ${GAME_RENDER_PROFILE}, fps=${GAME_FPS}"
echo "Effects scale: ${EFFECTS_SCALE}"
echo "Opening Chromium kiosk: $GAME_URL"

"$CHROMIUM_BIN" \
  --kiosk \
  --start-fullscreen \
  --noerrdialogs \
  --no-first-run \
  --no-default-browser-check \
  --password-store=basic \
  --use-mock-keychain \
  --disable-infobars \
  --disable-translate \
  --disable-features=Translate,TranslateUI,TranslateSubFrames \
  --lang=es-419 \
  --accept-lang=es-PY,es-419,es,en-US,en \
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
