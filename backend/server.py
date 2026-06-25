"""
server.py — the smallest possible A.P.E.X. backend.

ZERO external dependencies — uses only Python's standard-library http.server. It:
  - serves the existing UI (index.html and other static files) from the repo root,
  - exposes ONE API route:  POST /api/chat  { "prompt": "..." }
        -> returns { "user_prompt", "memory_packet", "apex_response" }

Run from the repo root:

    python -m backend.server          (or)   python backend/server.py

Then open  http://localhost:8765/index.html  on THIS computer, or
           http://<this-PC's-LAN-IP>:8765/index.html  from another device on the same WiFi
           (e.g. an iPad) — find the IP with `ipconfig` (Windows) and look for "IPv4 Address".

Binds to 0.0.0.0 (all network interfaces) by default — reachable from other devices on your
LAN. This also happens to be the correct bind address for cloud hosts later (Render/Railway
etc. expect 0.0.0.0 + the PORT they assign). Override with the APEX_HOST / PORT env vars.

This intentionally avoids a web framework (FastAPI/Flask/Express) for now so we add
no dependencies. When Phase 2 wires in a real AI provider, this can be swapped for a
framework if we decide we need one — the pipeline logic lives in pipeline.py, not here.
"""

from __future__ import annotations

import base64
import hmac
import json
import os
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

# make the repo root importable so `from backend...` works no matter how we launch
REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from urllib.parse import urlparse, parse_qs  # noqa: E402

from backend.pipeline import handle_prompt  # noqa: E402
from backend.connections import accounts, registry  # noqa: E402
from backend.ai.center import AICenter  # noqa: E402
from backend.ai import config as ai_config  # noqa: E402
from backend import settings as settings_mod  # noqa: E402

PORT = int(os.environ.get("PORT", 8765))
HOST = os.environ.get("APEX_HOST", "0.0.0.0")  # 0.0.0.0 = reachable on your LAN (and cloud hosts)

# --- Access password ---------------------------------------------------------
# If APEX_ACCESS_PASSWORD is set (e.g. on a public host like Render), every request
# requires that password via HTTP Basic Auth (browser shows its native login prompt).
# If it's NOT set (the normal local/LAN case), no password is required — unchanged
# behavior. This protects ALL routes, including static files (e.g. memory JSON).
ACCESS_PASSWORD = os.environ.get("APEX_ACCESS_PASSWORD", "")


class ApexHandler(SimpleHTTPRequestHandler):
    """Serves static files (inherited) + the /api/* routes."""

    # ----- access control ----------------------------------------------------
    def _authorized(self) -> bool:
        """True if no password is configured, or the request supplies the right one."""
        if not ACCESS_PASSWORD:
            return True
        header = self.headers.get("Authorization", "")
        if not header.startswith("Basic "):
            return False
        try:
            decoded = base64.b64decode(header[6:]).decode("utf-8")
            _, _, supplied = decoded.partition(":")
        except Exception:
            return False
        return hmac.compare_digest(supplied, ACCESS_PASSWORD)

    def _require_auth(self) -> bool:
        """If unauthorized, send the 401 challenge and return False."""
        if self._authorized():
            return True
        body = b"Access password required."
        self.send_response(401)
        self.send_header("WWW-Authenticate", 'Basic realm="A.P.E.X."')
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
        return False

    # ----- routing ----------------------------------------------------------
    def do_GET(self):
        if not self._require_auth():
            return
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")
        if path.startswith("/api"):
            self._handle_api_get(path, parse_qs(parsed.query))
        else:
            super().do_GET()  # static files (index.html, etc.)

    def do_POST(self):
        if not self._require_auth():
            return
        path = urlparse(self.path).path.rstrip("/")
        if path == "/api/chat":
            self._handle_chat()
        elif path == "/api/email/draft":
            self._handle_email_draft()
        elif path == "/api/settings":
            self._handle_settings_save()
        else:
            self._send_json(404, {"error": "not found"})

    def do_OPTIONS(self):  # CORS preflight (harmless; lets the UI call us from any origin)
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    # ----- GET API ----------------------------------------------------------
    def _handle_api_get(self, path, query):
        try:
            if path == "/api/accounts":
                self._send_json(200, {"accounts": accounts.list_accounts(),
                                      "calendars": accounts.list_calendars()})
            elif path == "/api/calendar":
                days = int((query.get("days", ["7"])[0]))
                cal = registry.calendar_connector()
                self._send_json(200, {"events": [e.to_dict() for e in cal.upcoming(days)]})
            elif path == "/api/email":
                acct = query.get("account", [None])[0]
                ec = registry.email_connector(acct)
                self._send_json(200, {"messages": [m.to_dict() for m in ec.list_recent()]})
            elif path == "/api/status":
                self._send_json(200, self._status())
            elif path == "/api/settings":
                self._send_json(200, settings_mod.get_settings())
            else:
                self._send_json(404, {"error": "not found"})
        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def _status(self):
        """What's configured — booleans only, NEVER the secret values."""
        center = AICenter()
        return {
            "groq": {"configured": center.groq.available()},
            "ollama": {"host": ai_config.ollama_settings()[0], "reachable": center.ollama.available()},
            "gemini": {"configured": center.gemini.available()},
            "accounts": [{"id": a["id"], "label": a["label"], "type": a["type"],
                          "status": a.get("status")} for a in accounts.list_accounts()],
            "calendars": [{"id": c["id"], "label": c["label"], "status": c.get("status")}
                          for c in accounts.list_calendars()],
        }

    # ----- POST handlers ----------------------------------------------------
    def _read_json(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length else b"{}"
        return json.loads(body or b"{}")

    def _handle_chat(self):
        try:
            data = self._read_json()
            prompt = (data.get("prompt") or data.get("user_prompt") or "").strip()
            prior_draft = data.get("prior_draft")
        except Exception:
            prompt, prior_draft = "", None

        if not prompt:
            self._send_json(400, {"error": "missing 'prompt'"})
            return

        try:
            result = handle_prompt(prompt, prior_draft=prior_draft)
            self._send_json(200, result)
        except Exception as e:  # never crash the server on a bad prompt
            self._send_json(500, {"error": f"pipeline error: {e}"})

    def _handle_settings_save(self):
        """Apply a settings patch from the Settings page (writes config/secrets files)."""
        try:
            patch = self._read_json()
            fresh = settings_mod.update_settings(patch)
            self._send_json(200, fresh)
        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def _handle_email_draft(self):
        """Manually save a draft (used by the UI 'save draft' button)."""
        try:
            data = self._read_json()
            from backend.connections.email.base import EmailDraft
            draft = EmailDraft(to=data.get("to", ""), subject=data.get("subject", ""),
                               body=data.get("body", ""), account_id=data.get("account_id", "gmail_personal"))
            saved = registry.email_connector(draft.account_id).create_draft(draft)
            self._send_json(200, {"draft": saved.to_dict()})
        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def _send_json(self, code: int, obj: dict):
        payload = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *args):  # keep the console quiet
        pass


def main():
    handler = partial(ApexHandler, directory=str(REPO_ROOT))
    httpd = ThreadingHTTPServer((HOST, PORT), handler)
    print(f"A.P.E.X. backend running:  http://localhost:{PORT}/index.html")
    print(f"  API: POST http://localhost:{PORT}/api/chat   body: {{\"prompt\": \"...\"}}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nshutting down.")
        httpd.shutdown()


if __name__ == "__main__":
    main()
