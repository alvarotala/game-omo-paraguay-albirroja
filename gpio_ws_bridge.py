#!/usr/bin/env python3
import asyncio
import base64
import hashlib
import json
import os
import signal
import struct
import sys
import time
from email.utils import formatdate

HOST = os.environ.get("GPIO_WS_HOST", "127.0.0.1")
PORT = int(os.environ.get("GPIO_WS_PORT", "8765"))
LEFT_PIN = int(os.environ.get("GPIO_LEFT_PIN", "17"))
RIGHT_PIN = int(os.environ.get("GPIO_RIGHT_PIN", "27"))
DEBOUNCE_SECONDS = float(os.environ.get("GPIO_DEBOUNCE", "0.03"))
POLL_SECONDS = float(os.environ.get("GPIO_POLL_SECONDS", "0.005"))
PULL_UP = os.environ.get("GPIO_PULL_UP", "1").lower() in {"1", "true", "yes"}
BUTTON_MODE = os.environ.get("GPIO_BUTTON_MODE", "NC").strip().lower().replace("-", "_")
BUTTON_NO = BUTTON_MODE in {"no", "normally_open", "normal_open", "open"}
BUTTON_NC = not BUTTON_NO
BUTTON_MODE_LABEL = "NC" if BUTTON_NC else "NO"
STDIN_SIM = os.environ.get("GPIO_STDIN_SIM", "0").lower() in {"1", "true", "yes"}
GPIO_DEBUG = os.environ.get("GPIO_DEBUG", "0").lower() in {"1", "true", "yes"}

GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
clients = set()
queue = None
buttons = {}


def log(message):
    print(f"[{formatdate(localtime=True)}] {message}", flush=True)


def debug_log(message):
    if GPIO_DEBUG:
        log(message)


def make_frame(text):
    payload = text.encode("utf-8")
    length = len(payload)
    if length < 126:
        header = struct.pack("!BB", 0x81, length)
    elif length < 65536:
        header = struct.pack("!BBH", 0x81, 126, length)
    else:
        header = struct.pack("!BBQ", 0x81, 127, length)
    return header + payload


def decode_frame(data):
    if len(data) < 2:
        return None
    opcode = data[0] & 0x0F
    masked = data[1] & 0x80
    length = data[1] & 0x7F
    offset = 2
    if length == 126:
        if len(data) < 4:
            return None
        length = struct.unpack("!H", data[offset:offset + 2])[0]
        offset += 2
    elif length == 127:
        if len(data) < 10:
            return None
        length = struct.unpack("!Q", data[offset:offset + 8])[0]
        offset += 8
    if masked:
        if len(data) < offset + 4:
            return None
        mask = data[offset:offset + 4]
        offset += 4
    else:
        mask = b""
    payload = data[offset:offset + length]
    if masked:
        payload = bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload))
    return opcode, payload


async def broadcast(side, pressed=True, source="gpio"):
    event = {
        "type": "button",
        "side": side,
        "pressed": pressed,
        "source": source,
        "timestamp": time.time(),
    }
    frame = make_frame(json.dumps(event, separators=(",", ":")))
    dead = []
    for writer in list(clients):
        try:
            writer.write(frame)
            await writer.drain()
        except Exception:
            dead.append(writer)
    for writer in dead:
        clients.discard(writer)
    debug_log(f"button {side} pressed={pressed} from {source} sent to {len(clients)} client(s)")


def emit(side, pressed=True, source="gpio"):
    if queue:
        queue.put_nowait((side, pressed, source))


async def event_pump():
    while True:
        side, pressed, source = await queue.get()
        await broadcast(side, pressed, source)


async def handle_client(reader, writer):
    try:
        request = await reader.readuntil(b"\r\n\r\n")
    except Exception:
        writer.close()
        await writer.wait_closed()
        return

    headers = {}
    lines = request.decode("utf-8", "ignore").split("\r\n")
    for line in lines[1:]:
        if ":" in line:
            key, value = line.split(":", 1)
            headers[key.strip().lower()] = value.strip()

    key = headers.get("sec-websocket-key")
    if not key:
        writer.close()
        await writer.wait_closed()
        return

    accept = base64.b64encode(hashlib.sha1((key + GUID).encode("ascii")).digest()).decode("ascii")
    response = (
        "HTTP/1.1 101 Switching Protocols\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Accept: {accept}\r\n\r\n"
    )
    writer.write(response.encode("ascii"))
    await writer.drain()
    clients.add(writer)
    peer = writer.get_extra_info("peername")
    log(f"client connected from {peer}")

    try:
        while True:
            data = await reader.read(2048)
            if not data:
                break
            decoded = decode_frame(data)
            if decoded and decoded[0] == 8:
                break
    finally:
        clients.discard(writer)
        writer.close()
        await writer.wait_closed()
        log("client disconnected")


def setup_gpio():
    try:
        from gpiozero import DigitalInputDevice
    except Exception as exc:
        log(f"gpiozero unavailable: {exc}. GPIO input disabled on this machine.")
        return False

    buttons["left"] = DigitalInputDevice(LEFT_PIN, pull_up=PULL_UP)
    buttons["right"] = DigitalInputDevice(RIGHT_PIN, pull_up=PULL_UP)
    pull = "pull-up" if PULL_UP else "pull-down"
    active_level = "LOW" if PULL_UP else "HIGH"
    pressed_level = ("HIGH" if PULL_UP else "LOW") if BUTTON_NC else active_level
    log(
        "GPIO polling ready. "
        f"left=BCM{LEFT_PIN}, right=BCM{RIGHT_PIN}, {pull}, "
        f"active={active_level}, button_mode={BUTTON_MODE_LABEL}, "
        f"pressed_level={pressed_level}, debounce={DEBOUNCE_SECONDS}s, poll={POLL_SECONDS}s"
    )
    left_initial = int(buttons["left"].value)
    right_initial = int(buttons["right"].value)
    log(f"Initial GPIO pressed states: left={left_initial}, right={right_initial}")
    return True


def gpio_pressed(device):
    active = bool(device.value)
    return not active if BUTTON_NC else active


async def gpio_poll_loop():
    now = time.monotonic()
    raw_pressed = {side: gpio_pressed(device) for side, device in buttons.items()}
    stable_pressed = dict(raw_pressed)
    changed_at = {side: now for side in buttons}

    while True:
        now = time.monotonic()
        for side, device in buttons.items():
            pressed = gpio_pressed(device)
            if pressed != raw_pressed[side]:
                raw_pressed[side] = pressed
                changed_at[side] = now
                debug_log(f"GPIO {side} changed pressed={pressed}")

            if pressed == stable_pressed[side]:
                continue

            if now - changed_at[side] < DEBOUNCE_SECONDS:
                continue

            stable_pressed[side] = pressed
            emit(side, pressed, "gpio")
        await asyncio.sleep(POLL_SECONDS)


async def stdin_simulator():
    loop = asyncio.get_running_loop()
    while True:
        line = await loop.run_in_executor(None, sys.stdin.readline)
        if not line:
            await asyncio.sleep(0.2)
            continue
        value = line.strip().lower()
        if value in {"l", "left", "izquierda"}:
            emit("left", True, "stdin")
            emit("left", False, "stdin")
        elif value in {"r", "right", "derecha"}:
            emit("right", True, "stdin")
            emit("right", False, "stdin")
        elif value in {"ld", "left down", "izquierda down"}:
            emit("left", True, "stdin")
        elif value in {"lu", "left up", "izquierda up"}:
            emit("left", False, "stdin")
        elif value in {"rd", "right down", "derecha down"}:
            emit("right", True, "stdin")
        elif value in {"ru", "right up", "derecha up"}:
            emit("right", False, "stdin")


async def main():
    global queue
    queue = asyncio.Queue()
    gpio_ready = setup_gpio()
    server = await asyncio.start_server(handle_client, HOST, PORT)
    log(f"WebSocket bridge listening on ws://{HOST}:{PORT}")
    asyncio.create_task(event_pump())
    if gpio_ready:
        asyncio.create_task(gpio_poll_loop())
    if STDIN_SIM:
        asyncio.create_task(stdin_simulator())
        log("stdin simulation enabled. Type l or r and press Enter.")

    stop = asyncio.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            asyncio.get_running_loop().add_signal_handler(sig, stop.set)
        except NotImplementedError:
            signal.signal(sig, lambda *_args: stop.set())
    async with server:
        await stop.wait()
    log("stopping bridge")


if __name__ == "__main__":
    asyncio.run(main())
