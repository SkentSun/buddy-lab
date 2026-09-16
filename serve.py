"""Threaded static server for the mascot playground.

The stock `python3 -m http.server` handles one request at a time: a single
request that never completes blocks every later one, which used to leave the
mascot stuck on "正在对齐角色素材" forever. This one threads instead, and sends
no-cache headers so an edit is never hidden behind a stale module.

    python3 serve.py            # http://127.0.0.1:8793
"""

import functools
import http.server
import socketserver
from pathlib import Path

PORT = 8793
ROOT = Path(__file__).resolve().parent


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Demo assets change often; never let a cached copy win.
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(
            ('127.0.0.1', PORT), functools.partial(Handler, directory=ROOT)) as httpd:
        print(f'mascot-lab serving http://127.0.0.1:{PORT}')
        httpd.serve_forever()
