"""TopoPuzzle dev server: static files + lead capture.

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
    print(f"TopoPuzzle server on http://localhost:{PORT} (leads -> {LEADS.name})")
    ThreadingHTTPServer(("", PORT), Handler).serve_forever()
