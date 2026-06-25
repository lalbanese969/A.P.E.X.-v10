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
  iPad) via `http://<this-PC's-LAN-IP>:8765/index.html`. Not reachable over the internet yet.

## ⏸️ Paused
- **Tuya smart strip lights** — direct local control via `tinytuya` (no Pi/hub). User created the
  Tuya IoT cloud project (Smart Home method) but paused before linking the Smart Life app account
  / pulling device keys. See memory note `lights-integration` for exact resume point.

## 🔜 Next up (in rough order, not committed)
1. **Cloud hosting** — deploy the backend (Render/Railway, since Groq removed the local-Ollama
   blocker) so APEX has a real public link, works from anywhere (not just home WiFi), and can stay
   up 24/7. **User plans to buy a cloud server eventually** — until then, LAN access is the
   workaround. Needs: env-var secrets, a simple access password before going public, host config file.
2. **Real email/calendar OAuth** (Phase C) — Gmail + Google Calendar first (one OAuth covers both),
   Outlook after. Needs a Google Cloud OAuth client + a dependency decision
   (`google-api-python-client` etc.).
3. **Tuya lights** — resume where paused (link app account → pull keys via tinytuya wizard → build
   the `lights` tool/action).
4. **Speed/UX polish** — skip the redundant intent-classify call for plain chat, response streaming.
5. Autonomy/triggers, tools registry/permissions — later phases, not started.

## Notes for future sessions
- Backend run command: `python -m backend.server` (binds `0.0.0.0:8765` by default; override with
  `APEX_HOST` / `PORT` env vars).
- Tests: `python scripts/test_memory.py`, `python scripts/test_ai_center.py`.
- Secrets live only in `secrets/secrets.json` (git-ignored) or env vars — never commit real keys.
