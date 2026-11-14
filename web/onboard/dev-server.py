"""Local server for the onboard front end.

Serves this folder as static files and proxies /api/* to the Go API, so the
browser sees one origin (no CORS). Standard library only.

Usage:
    python dev-server.py [--port 8090] [--api http://127.0.0.1:8080]

Binds to 127.0.0.1 only. Not a production server.
"""
import argparse
import http.server
import mimetypes
import os
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
MAX_BODY = 256 * 1024


class Handler(http.server.SimpleHTTPRequestHandler):
    api_base = "http://127.0.0.1:8080"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, fmt, *args):
        # Keep the console quiet; errors still appear through send_error.
        return

    def do_POST(self):
        if not self.path.startswith("/api/"):
            self.send_error(404, "not found")
            return
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length > MAX_BODY:
            self.send_error(413, "request too large")
            return
        body = self.rfile.read(length)
        req = urllib.request.Request(
            self.api_base + self.path,
            data=body,
            method="POST",
            headers={"Content-Type": self.headers.get("Content-Type", "application/json")},
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                status, payload = resp.status, resp.read()
                ctype = resp.headers.get("Content-Type", "application/json")
        except urllib.error.HTTPError as err:
            status, payload = err.code, err.read()
            ctype = err.headers.get("Content-Type", "text/plain")
        except (urllib.error.URLError, OSError) as err:
            self.send_error(502, "API indisponível: %s" % err)
            return
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path.startswith("/api/"):
            try:
                with urllib.request.urlopen(self.api_base + self.path, timeout=15) as resp:
                    payload = resp.read()
                    status = resp.status
                    ctype = resp.headers.get("Content-Type", "application/json")
            except urllib.error.HTTPError as err:
                status, payload, ctype = err.code, err.read(), "text/plain"
            except (urllib.error.URLError, OSError) as err:
                self.send_error(502, "API indisponível: %s" % err)
                return
            self.send_response(status)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        super().do_GET()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8090)
    parser.add_argument("--api", default="http://127.0.0.1:8080")
    args = parser.parse_args()
    Handler.api_base = args.api.rstrip("/")
    mimetypes.add_type("application/javascript", ".js")
    server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print("Front end: http://127.0.0.1:%d  ->  API: %s" % (args.port, Handler.api_base))
    server.serve_forever()


if __name__ == "__main__":
    main()
