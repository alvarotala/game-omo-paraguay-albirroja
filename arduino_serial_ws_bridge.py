#!/usr/bin/env python3
import asyncio
import base64
import hashlib
import json
import os
import signal
import struct
import threading
import time
from email.utils import formatdate

HOST = os.environ.get("ARDUINO_WS_HOST", os.environ.get("GPIO_WS_HOST", "127.0.0.1"))
PORT = int(os.environ.get("ARDUINO_WS_PORT", os.environ.get("GPIO_WS_PORT", "8765")))
SERIAL_PORT = os.environ.get("ARDUINO_SERIAL_PORT", "").strip()
SERIAL_BAUD = int(os.environ.get("ARDUINO_SERIAL_BAUD", "115200"))
SERIAL_RECONNECT_SECONDS = float(os.environ.get("ARDUINO_RECONNECT_SECONDS", "2.0"))
DEBUG = os.environ.get("ARDUINO_DEBUG", "0").lower() in {"1", "true", "yes", "on"}

GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
clients = set()
queue = None
main_loop = None
stop_threads = threading.Event()


def log(message):
    print(f"[{formatdate(localtime=True)}] {message}", flush=True)


def debug_log(message):
    if DEBUG:
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


def normalize_side(value):
    raw = str(value or "").strip().lower()
    if raw in {"left", "l", "izquierda"}:
        return "left"
    if raw in {"right", "r", "derecha"}:
        return "right"
    return None


def normalize_pressed(value, default=True):
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    raw = str(value or "").strip().lower()
    if raw in {"down", "press", "pressed", "1", "true", "on", "high", "low-active"}:
        return True
    if raw in {"up", "release", "released", "0", "false", "off", "low"}:
        return False
    return default


def parse_serial_line(line):
    text = line.strip()
    if not text:
        return None

    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        payload = None

    if isinstance(payload, dict):
        if payload.get("type") == "ready":
            log(f"arduino ready: {text}")
            return None

        side = normalize_side(payload.get("side") or payload.get("button") or payload.get("key"))
        if not side:
            debug_log(f"ignored serial json: {text}")
            return None

        pressed = normalize_pressed(
            payload.get("pressed", payload.get("down", payload.get("state", payload.get("action")))),
            default=True,
        )
        return {
            "type": "button",
            "side": side,
            "pressed": pressed,
            "source": payload.get("source", "arduino"),
            "timestamp": time.time(),
        }

    normalized = text.lower().replace("_", " ").replace(":", " ").replace(",", " ")
    parts = [part for part in normalized.split() if part]
    if not parts:
        return None

    side = normalize_side(parts[0])
    if not side and len(parts) >= 2:
        side = normalize_side(parts[1])
    if not side:
        debug_log(f"ignored serial line: {text}")
        return None

    pressed = True
    for part in parts:
        if part in {"down", "press", "pressed", "1", "true", "on"}:
            pressed = True
        elif part in {"up", "release", "released", "0", "false", "off"}:
            pressed = False

    return {
        "type": "button",
        "side": side,
        "pressed": pressed,
        "source": "arduino",
        "timestamp": time.time(),
    }


def find_serial_port(serial_module):
    if SERIAL_PORT:
        return SERIAL_PORT

    from serial.tools import list_ports

    ports = list(list_ports.comports())
    if not ports:
        raise RuntimeError("No encontre puertos serial. Conecta el Arduino Nano o define ARDUINO_SERIAL_PORT=COM3.")

    preferred_terms = ("arduino", "nano", "ch340", "wch", "usb serial", "usb-serial", "cp210", "ftdi")
    for port in ports:
        haystack = " ".join(
            str(value or "")
            for value in (port.device, port.description, port.manufacturer, port.hwid)
        ).lower()
        if any(term in haystack for term in preferred_terms):
            return port.device

    return ports[0].device


def enqueue_event(event):
    if not queue or not main_loop:
        return
    main_loop.call_soon_threadsafe(queue.put_nowait, event)


def serial_reader():
    try:
        import serial
    except Exception as exc:
        log(f"pyserial no esta instalado: {exc}")
        log("Instalar en Windows con: py -m pip install pyserial")
        enqueue_event({"type": "status", "source": "arduino", "status": "pyserial_missing", "timestamp": time.time()})
        return

    while not stop_threads.is_set():
        serial_connection = None
        try:
            port = find_serial_port(serial)
            log(f"Opening Arduino serial {port} at {SERIAL_BAUD} baud")
            serial_connection = serial.Serial(port, SERIAL_BAUD, timeout=0.25)
            time.sleep(1.6)
            serial_connection.reset_input_buffer()
            log(f"Arduino serial connected on {port}")

            while not stop_threads.is_set():
                raw_line = serial_connection.readline()
                if not raw_line:
                    continue
                line = raw_line.decode("utf-8", "replace").strip()
                event = parse_serial_line(line)
                if event:
                    debug_log(f"serial event {event}")
                    enqueue_event(event)
        except Exception as exc:
            log(f"Arduino serial unavailable: {exc}")
            time.sleep(SERIAL_RECONNECT_SECONDS)
        finally:
            if serial_connection:
                try:
                    serial_connection.close()
                except Exception:
                    pass


async def broadcast_event(event):
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
    if event.get("type") == "button":
        debug_log(
            f"button {event.get('side')} pressed={event.get('pressed')} sent to {len(clients)} client(s)"
        )


async def event_pump():
    while True:
        event = await queue.get()
        await broadcast_event(event)


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


async def main():
    global queue, main_loop
    try:
        import serial  # noqa: F401
    except Exception as exc:
        log(f"pyserial no esta instalado: {exc}")
        log("Instalar en Windows con: py -m pip install pyserial")
        raise SystemExit(2)

    main_loop = asyncio.get_running_loop()
    queue = asyncio.Queue()

    server = await asyncio.start_server(handle_client, HOST, PORT)
    log(f"Arduino WebSocket bridge listening on ws://{HOST}:{PORT}")
    asyncio.create_task(event_pump())

    reader_thread = threading.Thread(target=serial_reader, name="arduino-serial-reader", daemon=True)
    reader_thread.start()

    stop = asyncio.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            asyncio.get_running_loop().add_signal_handler(sig, stop.set)
        except NotImplementedError:
            signal.signal(sig, lambda *_args: stop.set())

    async with server:
        await stop.wait()

    stop_threads.set()
    log("stopping Arduino bridge")


if __name__ == "__main__":
    asyncio.run(main())
