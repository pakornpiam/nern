"""Nern dev server: static files + lead capture.

Serves the app like `python -m http.server 5177` and additionally accepts
POST /api/lead with JSON {"name": ..., "email": ...}, appending each
submission to leads.csv (created with a header on first write).

Run:  python server.py
"""
import csv
import json
import re
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = 5177
LEADS = Path(__file__).parent / "leads.csv"
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class Handler(SimpleHTTPRequestHandler):
    # SimpleHTTPRequestHandler sends Last-Modified but no Cache-Control, and with neither
    # Cache-Control nor Expires a browser falls back to HEURISTIC freshness: Chrome may
    # reuse a stale copy for a while without revalidating at all. Editing a file then
    # reloading can therefore still run the OLD app, which presents as features that are
    # plainly in the source simply not existing on the page. "no-cache" means "store it,
    # but revalidate every time" — the conditional request still answers 304, so the
    # wasm is not re-downloaded on every reload; it is only ever confirmed fresh.
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, must-revalidate")
        super().end_headers()

    def do_POST(self):
        if self.path != "/api/lead":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            data = json.loads(self.rfile.read(length))
            name = str(data.get("name", "")).strip()[:200]
            email = str(data.get("email", "")).strip()[:200]
            if not name or not EMAIL_RE.match(email):
                self.send_error(400, "name and valid email required")
                return
        except (ValueError, json.JSONDecodeError):
            self.send_error(400, "invalid JSON")
            return

        new_file = not LEADS.exists()
        with LEADS.open("a", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            if new_file:
                w.writerow(["timestamp", "name", "email"])
            w.writerow([datetime.now(timezone.utc).isoformat(timespec="seconds"), name, email])

        self.send_response(204)
        self.end_headers()


if __name__ == "__main__":
    print(f"Nern server on http://localhost:{PORT} (leads -> {LEADS.name})")
    ThreadingHTTPServer(("", PORT), Handler).serve_forever()
