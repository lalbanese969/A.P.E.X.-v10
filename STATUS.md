# A.P.E.X. — Status / Running Notes

> Quick-glance tracker: what's working, what's paused, what's next. For the formal phased
> roadmap see [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md); for design see
> [`docs/APEX_ARCHITECTURE.md`](docs/APEX_ARCHITECTURE.md). Update this file as things change —
> keep it short.

_Last updated: 2026-06-25_

## ✅ Working now
- **UI** — orange/black theme, animated honeycomb, chat / calendar / email / settings views.
- **Memory** — catalog + resolver + packet builder (loads only relevant memory, never everything).
- **AI Center** — **Groq** is the primary brain (fast, cloud, free-tier — fixed a Cloudflare
  403/User-Agent bug that was silently falling back to slow local Ollama). Ollama = local fallback.
  Gemini = optional alt brain. All keys set via the in-app **Settings** page.
- **Actions (mock data)** — calendar Q&A, email search, email drafting with a style-learning loop
  (drafts tune to feedback over time). Accounts are mock/sample until real OAuth is connected.
- **Settings page** — add/label/remove email accounts, set AI provider keys, pick Ollama models.
- **GitHub repo**: https://github.com/lalbanese969/A.P.E.X.-v10 (pushed, secrets excluded).
- **LAN access** — server binds `0.0.0.0`, reachable from other devices on the same WiFi (e.g. the
  iPad) via `http://<this-PC's-LAN-IP>:8765/index.html`.
- **Public access (temporary)** — a Cloudflare Tunnel (`cloudflared`, installed via winget) exposes
  the locally-running backend at a public `*.trycloudflare.com` URL, reachable from anywhere (not
  just home WiFi). Free, no account. **Requires this PC to stay on and the backend running** — the
  URL changes every time the tunnel restarts.
- **Password gate built, not yet turned on** — `backend/server.py` checks the `APEX_ACCESS_PASSWORD`
  env var via HTTP Basic Auth on *every* route (static + API). If unset (normal local/LAN case),
  no password required — verified unchanged. If set, verified it correctly blocks/allows. Needed
  before anything goes on a permanent public URL.
- **Render deploy files added** (`render.yaml`, `requirements.txt`) — not deployed yet. Render runs
  the backend on its own servers (no payment needed on the free tier; free tier sleeps after ~15 min
  idle, ~30-50s to wake on next request) — this is the real fix for "don't want to depend on my PC."

## ⏸️ Paused
- **Tuya smart strip lights** — direct local control via `tinytuya` (no Pi/hub). User created the
  Tuya IoT cloud project (Smart Home method) but paused before linking the Smart Life app account
  / pulling device keys. See memory note `lights-integration` for exact resume point.

## 🔜 Next up (in rough order, not committed)
1. **Deploy to Render** — create free Render account (GitHub login), connect this repo (Render reads
   `render.yaml`), set `GROQ_API_KEY` / `GEMINI_API_KEY` / `APEX_ACCESS_PASSWORD` in Render's
   dashboard (never in git), deploy. Gives a stable always-on URL, no PC required, no payment.
   **Caveat to remember:** Render's free tier filesystem is ephemeral (resets on
   restart/redeploy) — fine for now since the Memory Writer is still a non-destructive placeholder,
   but matters once real memory-writing or persistent drafts are built.
2. **Real email/calendar OAuth** (Phase C) — Gmail + Google Calendar first (one OAuth covers both),
   Outlook after. Needs a Google Cloud OAuth client + a dependency decision
   (`google-api-python-client` etc.).
3. **Tuya lights** — resume where paused (link app account → pull keys via tinytuya wizard → build
   the `lights` tool/action).
4. **Speed/UX polish** — skip the redundant intent-classify call for plain chat, response streaming.
5. Autonomy/triggers, tools registry/permissions — later phases, not started.

## Notes for future sessions
- Backend run command: `python -m backend.server` (binds `0.0.0.0:8765` by default; override with
  `APEX_HOST` / `PORT` env vars). Ollama host must be `127.0.0.1`, not `localhost` (the latter is
  ~2s slower to resolve via Python's urllib on this Windows machine — fixed in config already).
- Tests: `python scripts/test_memory.py`, `python scripts/test_ai_center.py`.
- Secrets live only in `secrets/secrets.json` (git-ignored) or env vars — never commit real keys.
- GitHub cannot run the backend itself (Pages = static-only; Actions = CI/CD only, not for hosting
  persistent services) — code lives on GitHub, but *running* it always requires a separate host
  (tunnel for now, Render next).
