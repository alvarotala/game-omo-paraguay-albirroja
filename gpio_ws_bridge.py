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
DEBOUNCE_SECONDS = float(os.environ.get("GPIO_DEBOUNCE", "0.16"))
PULL_UP = os.environ.get("GPIO_PULL_UP", "0").lower() in {"1", "true", "yes"}
STDIN_SIM = os.environ.get("GPIO_STDIN_SIM", "0").lower() in {"1", "true", "yes"}

GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
clients = set()
last_press = {"left": 0.0, "right": 0.0}
queue = None
buttons = []


def log(message):
    print(f"[{formatdate(localtime=True)}] {message}", flush=True)


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


async def broadcast(side, source="gpio"):
    event = {
        "type": "button",
        "side": side,
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
    log(f"button {side} from {source} sent to {len(clients)} client(s)")


def emit(side, source="gpio"):
    now = time.monotonic()
    if now - last_press[side] < DEBOUNCE_SECONDS:
        return
    last_press[side] = now
    if queue:
        queue.put_nowait((side, source))


async def event_pump():
    while True:
        side, source = await queue.get()
        await broadcast(side, source)


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
        from gpiozero import Button
    except Exception as exc:
        log(f"gpiozero unavailable: {exc}. GPIO input disabled on this machine.")
        return

    left = Button(LEFT_PIN, pull_up=PULL_UP, bounce_time=DEBOUNCE_SECONDS)
    right = Button(RIGHT_PIN, pull_up=PULL_UP, bounce_time=DEBOUNCE_SECONDS)
    left.when_pressed = lambda: emit("left", "gpio")
    right.when_pressed = lambda: emit("right", "gpio")
    buttons.extend([left, right])
    pull = "pull-up" if PULL_UP else "pull-down"
    log(f"GPIO ready. left=BCM{LEFT_PIN}, right=BCM{RIGHT_PIN}, {pull}, HIGH press expected")


async def stdin_simulator():
    loop = asyncio.get_running_loop()
    while True:
        line = await loop.run_in_executor(None, sys.stdin.readline)
        if not line:
            await asyncio.sleep(0.2)
            continue
        value = line.strip().lower()
        if value in {"l", "left", "izquierda"}:
            emit("left", "stdin")
        elif value in {"r", "right", "derecha"}:
            emit("right", "stdin")


async def main():
    global queue
    queue = asyncio.Queue()
    setup_gpio()
    server = await asyncio.start_server(handle_client, HOST, PORT)
    log(f"WebSocket bridge listening on ws://{HOST}:{PORT}")
    asyncio.create_task(event_pump())
    if STDIN_SIM:
        asyncio.create_task(stdin_simulator())
        log("stdin simulation enabled. Type l or r and press Enter.")

    stop = asyncio.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        asyncio.get_running_loop().add_signal_handler(sig, stop.set)
    async with server:
        await stop.wait()
    log("stopping bridge")


if __name__ == "__main__":
    asyncio.run(main())
