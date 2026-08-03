#!/usr/bin/env bash
# Track A — serve the existing client-side APEX app from this machine.
# Serves the REPO ROOT (where index.html + js/ live) over HTTP.
# Pair with the Cloudflare tunnel for a public link. Ctrl-C to stop.
set -euo pipefail

# repo root = two levels up from this script (python_backend_legacy/selfhost/ -> repo root)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# load .env if present (for PORT)
if [ -f "$SCRIPT_DIR/.env" ]; then set -a; . "$SCRIPT_DIR/.env"; set +a; fi
PORT="${PORT:-8765}"

echo "Serving APEX from: $REPO_ROOT"
echo "  local:   http://localhost:$PORT/index.html"
echo "  network: http://<this-machine-ip>:$PORT/index.html"
cd "$REPO_ROOT"
exec python3 -m http.server "$PORT" --bind "${APEX_HOST:-0.0.0.0}"
