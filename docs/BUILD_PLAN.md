# A.P.E.X. Build Plan (Phased)

Build philosophy: **step by step**, clean structure, mocked tools first, readable modular files,
never break the UI, no needless dependencies, secrets isolated.

Status legend: ✅ done · 🟡 in progress · 🔜 next · ⬜ later

---

## History (Phases 0–2b) — built in Python, now archived

APEX's foundation (memory system, AI Center, action pipeline, mock connections, Settings) was
originally built as a **Python backend** (`backend/server.py` + supporting modules). That work is
**preserved, not lost** — it's archived at `python_backend_legacy/` (still runs standalone; see its
README) — and was the direct basis for the JavaScript port described below. Condensed history:

- **Phase 0 — Foundation & Docs**: repo structure, `CLAUDE.md`, `docs/`, data/code separation.
- **Phase 1 — Memory V1**: local JSON memory store + efficient resolver/packet-builder read path +
  non-destructive writer placeholder.
- **Phase 2 — Backend + mock AI wire-up**: a zero-dependency stdlib server, chat pipeline, Memory
  Packet flowing into a (then-mocked) response.
- **Phase 2b — AI Center + Connections**: real Gemini/Ollama routing with a cost budget, mock
  email/calendar connectors (incl. a DocuSign email), intent-routed actions (calendar query, email
  search/draft/refine), a writing-style learning loop, a Settings page, and a password gate +
  Render deploy config for self-hosting.

What ended Phase 2b: the user wanted APEX reachable **without depending on a personal computer
staying on**, for **free**. A Render deploy was started but is more friction than necessary; a
prior personal project of the user's proved a **pure client-side** (browser-only, GitHub-Pages-
hosted) app was a simpler fit — confirmed technically viable by testing that both Groq and Gemini
allow direct browser calls (CORS).

---

## Phase 3 — Migrate to client-side (browser-only) ✅
- ✅ Archived the Python backend to `python_backend_legacy/` (`git mv`, history preserved, verified
  still runs standalone).
- ✅ Ported the engine to plain ES modules in `js/`: `storage.js` (localStorage), `seedData.js`
  (demo data), `memory.js` (catalog/resolver/packet/profile/writing-style/writer-placeholder),
  `aiCenter.js` (Groq primary + Gemini fallback, called directly via `fetch()`), `connections.js`
  (mock email/calendar + drafts), `settings.js` (keys + labeled accounts), `pipeline.js`
  (heuristic intent → actions → AI Center → response).
- ✅ Rewired `index.html`'s chat/calendar/email/settings/status UI to call these modules directly —
  no more `fetch("/api/...")` anywhere.
- ✅ Verified: live Groq calls from the browser runtime, the four core scenarios (Taylor's
  birthday, calendar "today", DocuSign find-and-draft, draft refine + style learning) all produce
  correct results matching the original Python version.
- ✅ Dropped local Ollama (mixed-content blocking on HTTPS pages — see Architecture doc) and the
  AI-tiebreak step in intent classification (heuristic alone is reliable and one fewer network call).
- ✅ Docs updated to describe this as the current architecture.

**Zero dependencies, no build step** — same philosophy as the Python version, just applied to the browser.

## Phase 4 — Go live on GitHub Pages 🔜
- Enable GitHub Pages on the repo (Settings → Pages → deploy from `main`).
- Open the real public URL, add a Groq key in Settings, confirm it works from a phone/tablet with
  no PC involved.
- No password gate needed (see Architecture doc's Security/Control section) — but document clearly
  that the page is public and an empty UI until a visitor's own browser has its own key.

## Phase 5 — Real email/calendar OAuth (browser-side) ⬜
- Gmail + Google Calendar (one OAuth covers both) via **Google Identity Services**, directly from
  the browser — the same pattern already proven by the user's prior project. Outlook via **MSAL.js**
  similarly. No backend relay needed (this is actually *simpler* than the server-side OAuth flow
  that would've been needed in the Python version).
- Account `status` flips `mock → live` per account once connected.

## Phase 6 — Self-Profile Adaptation + Reflection ⬜
- A controlled, logged, versioned reflection pass over the self-profile (append evidence, nudge
  confidence) — ported from the same idea in the Python version, now client-side.

## Phase 7 — Tools Registry + Permissions ⬜
- Registry describing each tool's capabilities, risk level, and approval requirement.
- Approval system for high-risk actions (relevant once real send/write actions exist).

## Phase 8 — Autonomy / Triggers ⬜
- Recurring + event triggers with limits (max/day, max/hour, quiet hours), logs, permission rules.
  Browser-only triggers are inherently limited to "while a tab is open" unless paired with a
  service worker — revisit then.

## Phase 9 — Cross-device sync (optional) ⬜
- Today, memory/settings live in one browser's `localStorage` only. If syncing across devices
  becomes important, add something like Supabase (the same piece the user's prior project used) —
  a deliberate, separate decision, not assumed.

## Phase 10 — Hardening + Self-Improvement ⬜
- Prompt optimizer; upgrade the resolver to real semantic search (embeddings); broader
  logging/observability.

---

## Out of scope / explicitly deferred
- Real local Ollama in the live app (archived backend supports it; browser version doesn't).
- The Render deployment (config still exists in `python_backend_legacy/render.yaml` if ever needed).
- Cross-device sync, autonomy, tool permissions/approval — each a deliberate later phase, not assumed.

See `STATUS.md` for the live, quick-glance tracker of what's currently working/paused/next.
