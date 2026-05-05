#!/usr/bin/env python3
import argparse
import os
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class KioskRequestHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "application/javascript",
        ".mp4": "video/mp4",
        ".ogg": "audio/ogg",
        ".oga": "audio/ogg",
        ".wav": "audio/wav",
    }

    def log_message(self, format, *args):
        if self.path == "/favicon.ico":
            return
        super().log_message(format, *args)

    def do_GET(self):
        if self.path == "/favicon.ico":
            self.send_response(HTTPStatus.NO_CONTENT)
            self.end_headers()
            return
        super().do_GET()

    def copyfile(self, source, outputfile):
        try:
            super().copyfile(source, outputfile)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def send_head(self):
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            return super().send_head()
        if not os.path.exists(path):
            return super().send_head()

        file_size = os.path.getsize(path)
        range_header = self.headers.get("Range")
        if not range_header or not range_header.startswith("bytes="):
            return super().send_head()

        try:
            start_text, end_text = range_header.removeprefix("bytes=").split("-", 1)
            start = int(start_text) if start_text else 0
            end = int(end_text) if end_text else file_size - 1
            end = min(end, file_size - 1)
            if start < 0 or end < start:
                raise ValueError
        except ValueError:
            self.send_error(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
            return None

        content_type = self.guess_type(path)
        file = open(path, "rb")
        file.seek(start)
        self.send_response(HTTPStatus.PARTIAL_CONTENT)
        self.send_header("Content-type", content_type)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.send_header("Last-Modified", self.date_time_string(os.path.getmtime(path)))
        self.end_headers()
        return _RangeLimitedFile(file, end - start + 1)


class _RangeLimitedFile:
    def __init__(self, file, remaining):
        self.file = file
        self.remaining = remaining

    def read(self, size=-1):
        if self.remaining <= 0:
            return b""
        if size < 0 or size > self.remaining:
            size = self.remaining
        data = self.file.read(size)
        self.remaining -= len(data)
        return data

    def close(self):
        self.file.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("port", type=int, nargs="?", default=8000)
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--directory", default=os.getcwd())
    args = parser.parse_args()

    handler = lambda *handler_args, **handler_kwargs: KioskRequestHandler(
        *handler_args,
        directory=args.directory,
        **handler_kwargs,
    )
    server = ThreadingHTTPServer((args.bind, args.port), handler)
    print(f"Serving kiosk HTTP on {args.bind} port {args.port} ({args.directory}) ...", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
