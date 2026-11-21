"""Shared test helpers: serve the app over HTTP (needed for on-demand episode JSON)."""
import http.server, functools, threading, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
class _H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
def start_server():
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(_H, directory=str(ROOT)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return f'http://127.0.0.1:{httpd.server_address[1]}/'
