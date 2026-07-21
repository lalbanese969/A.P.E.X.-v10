# A.P.E.X. — Status / Running Notes

> Quick-glance tracker: what's working, what's paused, what's next. For the formal phased
> roadmap see [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md); for design see
> [`docs/APEX_ARCHITECTURE.md`](docs/APEX_ARCHITECTURE.md). Update this file as things change —
> keep it short.

_Last updated: 2026-06-25_

## 🔄 Major change: migrated to a client-side (browser-only) app
APEX no longer has a backend server. Everything (memory, AI Center, action pipeline) now runs as
plain JavaScript in the browser, backed by `localStorage`. Why: the user wanted APEX free, always
reachable, and not dependent on a personal computer staying on — a prior personal project of
theirs proved a pure client-side app does exactly that (free GitHub Pages hosting), and it was
confirmed technically viable (Groq + Gemini both allow direct browser calls — verified live via
CORS preflight tests). The original Python backend is **archived, not deleted**, at
`python_backend_legacy/` (still runs standalone — see its README) — useful if local Ollama or a
more mature pipeline is ever needed again.

## ✅ Working now
- **UI** — orange/black theme, animated honeycomb, chat / calendar / email / settings views.
  Unchanged visually by the migration.
- **Memory** (`js/memory.js`) — catalog + resolver + packet builder (read path), plus **Memory
  Writing v1**: APEX now actually **saves facts** silently in the background. After each turn,
  a gated Groq extraction pass (fast model, JSON mode; only fires when the message plausibly
  contains a fact, so normal chat costs nothing) pulls structured facts and writes them — **safely**:
  append-only to lists with dedup, scalars set-only-if-empty (never overwrites a conflicting value),
  every write logged to `apex.memory.writes` and reversible via `undoLastWrite()`. New facts about
  *the user* land in a new `user` self-record (`apex.memory.user`), injected into context every turn.
  Unknown people are logged as proposals, not auto-created (catalog stays safe). No UI/confirmation —
  fully background. (Verified: save/dedup/conflict/undo all pass; live extraction needs a valid Groq
  key in Settings.)
- **AI Center** (`js/aiCenter.js`) — **Groq** is the primary brain (called directly from the
  browser via `fetch()`, no server). **Gemini** is the fallback. No local Ollama (mixed-content
  blocking on HTTPS pages rules it out for the browser version).
- **Actions (mock data)** (`js/pipeline.js`, `js/connections.js`) — calendar Q&A, email search,
  email drafting with a style-learning loop. Verified end-to-end: the DocuSign find-and-draft flow
  and a draft refine that updates the learned writing style both work against live Groq.
- **Settings page** — paste a Groq/Gemini key (saved only in this browser's `localStorage`), add/
  label/remove email accounts. No server, nothing uploaded.
- **Calendar** — Google-Calendar-style, with a **Week view (Sun→Sat, default) + Month view toggle**
  (prev/next/today, today circled, week view is an hour time-grid),
  events colored with the **exact 11 Google Calendar colors** (Lavender…Tomato). Settings has a
  **color → category** mapping: assign keywords to a color (e.g. green = "lunch, food"), and APEX
  picks the color when you say "add Lunch with Taylor". Uncategorized events use the default
  "Other" blue (Peacock #039BE5, changeable). New `calendar_add` intent creates events
  (deterministic, no AI call) into local mock data.
- **Logs page** — "Recent backend activity" feed is still mock display data, but **Scheduled
  timers is now a real settings UI**: add/edit/toggle/delete timers (daily/weekly/every-N-hours),
  stored in `localStorage`. **Config only — no automation engine runs them yet**, by design; this
  is the settings surface for that future system.
- Removed the last literal placeholder content in the app (the fake "Placeholder task" rows in
  the right sidebar) — now an honest "No tasks yet." empty state.
- **Personality, v1** — APEX now always addresses the user as "sir" and has a witty/best-friend
  voice (`js/pipeline.js:systemBase()`), with a pool of ~15 random greetings shown on page load and
  "New Chat" (`js/seedData.js:APEX_GREETINGS`) so it's never the same line twice. **Important
  isolation**: email drafts use a *separate* system prompt (not `systemBase()`) that explicitly
  forbids calling the recipient "sir" or injecting jokes into the email body — APEX's personality
  is how it talks to the user, never how it writes on his behalf to someone else. A bigger
  personality/voice overhaul is still planned separately (prompt being drafted by another AI) and
  may extend or replace this.
- **Slash commands + fullscreen "takeover" modes** — type `/` in the chat box for a command
  palette. `/open sim` opens the Simulations lab (embedded iframe); `/big` opens **Workout APEX**.
  Both use one shared `[JS:TAKEOVER]` factory in `index.html`: the honeycomb **grows out of the live
  background blobs** (seeded via `window.APEX.honeycombSeeds()`, branching organically), fills, then
  clears from the center until **every** hex is gone (no edge frame), revealing the content; Esc /
  Exit reverses it. Timing knobs live at the top of the factory.
- **Workout APEX (`/big`) — APEX's personal-trainer mode.** Left = a **coach chat** on a *lighter*
  path (`pipeline.handleCoachPrompt`): fitness/nutrition-focused, **skips the email/calendar action
  machinery**, and is fed a one-line snapshot of today's numbers so it can coach on what you ate /
  your water / your session. Right = **tabbed panels** (switch by click or **←/→ arrows**):
  **Nutrition** (macros vs. goal that sum from the food log, a **water jug that fills orange** logged
  in **fl oz**, and the food log), **Workout** (today's exercises, tap to check off, progress), and
  **Metrics** (sleep/steps/HR/weight — **sample data; Apple Watch sync is a later phase**). Today's
  nutrition/water/workout are **tracked in `localStorage` (`apex.big.day`) and reset each new day**.
  Units are **imperial (oz/lb/ft)**. **Responsive & auto-detected**: iPad/desktop = chat left + tabs
  right; **iPhone = stacked with the panels on top and the chat at the bottom**. Food estimates are
  still mock (real nutrition/workout logic is the next function pass). (Verified via Playwright:
  tabs, arrow-nav, water jug + macro totals, check-off, per-day persistence across reload, and the
  iPhone-stacked order — no console errors.) *Noted for later: a separate installable
  "today's workout" PWA you add to your phone's home screen for the gym.*
- **GitHub repo**: https://github.com/lalbanese969/A.P.E.X.-v10.

## 📦 Archived (not deleted)
- **`python_backend_legacy/`** — the original Python backend (memory engine, AI Center w/ Groq/
  Gemini/Ollama routing, action pipeline, mock connectors, Settings server, password gate, Render
  deploy config). Runs standalone (`cd python_backend_legacy && python -m backend.server`),
  verified working right after the archive move. Kept for reference and as a fallback — it
  supports real local Ollama, which the browser version can't reach.
- The in-progress **Render deployment** (config still in `python_backend_legacy/render.yaml`) is
  parked, not finished — superseded by the simpler GitHub Pages + client-side approach.
- The **Cloudflare Tunnel** approach (`cloudflared`, used briefly for testing on the iPad over the
  internet) is no longer needed — GitHub Pages will serve the same purpose for free, permanently.

## ⏸️ Paused
- **Tuya smart strip lights** — direct local control via `tinytuya` (no Pi/hub). User created the
  Tuya IoT cloud project (Smart Home method) but paused before linking the Smart Life app account
  / pulling device keys. See memory note `lights-integration` for exact resume point. (Note: this
  would need rethinking in the client-side world — `tinytuya` is a Python library; a browser can't
  run it. Likely candidate for a future small serverless function, or stays in the archived Python
  backend's domain.)

## 🔜 Next up (in rough order, not committed)
1. **Enable GitHub Pages** — Settings → Pages → deploy from `main`. Get the real public URL, test
   from the iPad/phone with zero PC involvement.
2. **Real email/calendar OAuth, browser-side** — Gmail + Google Calendar via Google Identity
   Services, Outlook via MSAL.js — directly from the browser, no backend relay. Proven pattern
   (the user's prior project already does this).
3. **Tuya lights** — revisit given the client-side architecture (see note above).
4. Cross-device memory sync (optional, would need something like Supabase), autonomy/triggers,
   tools registry/permissions — later phases, not started.

## Notes for future sessions
- Run it: any static file server, e.g. `python -m http.server 8765`, then open
  `http://localhost:8765/index.html`. ES modules need `http(s)://`, not `file://`.
- No backend, no Python required for the live app. `python_backend_legacy/` is independent and
  optional — see its own README for how to run/test it.
- Secrets: there is no secrets file for the live app — keys live in the browser's `localStorage`,
  entered via Settings. (`secrets/` at the repo root only matters for the archived Python backend.)
- Both Groq and Gemini confirmed CORS-friendly for direct browser calls (tested via `curl -i -X
  OPTIONS` with an `Origin` header against their real endpoints) — this is *why* the migration was
  possible; re-verify if either provider's policy ever seems to change.
