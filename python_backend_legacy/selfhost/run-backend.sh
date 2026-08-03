#!/usr/bin/env bash
# Track B — run the A.P.E.X. Python backend (stdlib only, no pip installs).
# Exposes /api/chat etc. and falls back to local Ollama per config/ai_center.json.
# Loads settings/keys from .env in this folder. Ctrl-C to stop.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"   # python_backend_legacy/

# load .env (PORT, APEX_HOST, APEX_ACCESS_PASSWORD, GROQ_API_KEY, GEMINI_API_KEY)
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a; . "$SCRIPT_DIR/.env"; set +a
else
  echo "note: no .env found in $SCRIPT_DIR — running with defaults (no password, no cloud keys)."
fi

cd "$BACKEND_DIR"
echo "Starting A.P.E.X. backend from: $BACKEND_DIR  (port ${PORT:-8765})"
[ -n "${APEX_ACCESS_PASSWORD:-}" ] && echo "  access password: ON" || echo "  access password: OFF (set APEX_ACCESS_PASSWORD before exposing!)"
exec python3 -m backend.server
