# CLAUDE.md — A.P.E.X. project instructions

> Read this first. It tells future Claude Code sessions what A.P.E.X. is, how the repo is laid out,
> and the rules to follow when changing it.

## What A.P.E.X. is

**A.P.E.X. = Adaptive Personal Executive Xpert** — a custom personal AI assistant.

From the user's perspective it is **one assistant**. Behind the scenes it is **modular**: separate
systems for memory, actions, tools, autonomy, security, and self-improvement. We build these
**step by step**, not all at once.

Core experience (target end state):
1. User sends a prompt through the UI.
2. A.P.E.X. responds naturally.
3. If an action is needed, A.P.E.X. acknowledges ("Working on that"), an **action** runs (calendar/
   email/etc.), and A.P.E.X. follows up ("Done, I scheduled that").
4. High-risk actions go through an approval system (later phase).

## Architecture: runs entirely client-side (no backend server)

APEX was originally a Python backend + web UI, then **migrated to pure client-side JavaScript** so
it could be hosted free (GitHub Pages), not depend on a personal computer staying on, and avoid a
sleep-prone/paid server. Everything — memory, the AI Center, the action pipeline — now runs as
plain JS modules in `js/`, backed by `localStorage`. **There is no server-side anything in the
live app.** Both Groq and Gemini were verified (live CORS preflight test) to allow direct browser
calls, which is what makes this possible.

The original Python backend still works standalone and is kept (not deleted) at
`python_backend_legacy/` — see its own README for why and how to run it. It supports things the
browser version can't (real local Ollama; a browser on HTTPS can't call `localhost` — mixed-content
blocking).

## Build philosophy (follow these)

- Go **step by step**; do not build every advanced feature at once.
- Start with clean structure, **mocked tools**, and **simple storage** (`localStorage`).
- Prefer **readable, modular** files. Keep code easy to inspect and change.
- **Do not break the existing UI** (`index.html`).
- **Zero dependencies, no build step.** Plain ES modules, no frameworks/bundlers/npm. Don't add
  any without explaining why.
- **Never store secrets in a committed file.** API keys are typed into the Settings UI and live
  only in the user's own browser `localStorage` — never written to a file, never sent anywhere
  except directly to the AI provider's own API.
- Before major changes, explain the plan first.

## Repo layout

```
index.html              # The UI (orange/black, honeycomb bg) + the <script type="module"> that wires it up.
CLAUDE.md               # This file.
STATUS.md               # Living tracker: what's working, paused, next. Update as things change.
docs/
  APEX_ARCHITECTURE.md  # The full system design (9 concepts) + what's implemented.
  BUILD_PLAN.md         # Phased milestones. Check current phase here.
js/                      # THE BRAIN. Plain ES modules, zero dependencies, no build step.
  storage.js             #   localStorage wrapper (namespaced "apex.*" keys).
  seedData.js            #   Default/demo data written on first run (Taylor, mock emails, events).
  memory.js              #   Catalog + resolver + packet builder + self-profile/writing-style.
  aiCenter.js             #   Groq (primary) + Gemini (fallback) — called directly from the browser.
  connections.js          #   Mock email + calendar data, search, drafts (real OAuth = later phase).
  settings.js             #   User-configurable keys + labeled accounts.
  pipeline.js             #   Orchestrates: memory -> intent -> action -> AI Center -> response.
secrets/                 # GIT-IGNORED. Only matters if you run python_backend_legacy/ standalone.
python_backend_legacy/  # ARCHIVED original Python backend. Not part of the live app. See its README.md.
```

**Key principle:** every `js/*.js` file replaced one Python module — when in doubt about intended
behavior, the original is right there in `python_backend_legacy/backend/` to compare against.

## How memory works

Do NOT dump all memory into the AI prompt. Instead:
`memory.js`'s catalog (table of contents) → **resolver** finds relevant cards → only the needed
sections are loaded → a small **Memory Packet** is built for the AI.

The **Memory Writer** (`memory.reviewInteraction`) is a placeholder: it logs *proposed* writes to
`localStorage` (`apex.logs.memoryWrite`) and never auto-edits memory.

## How to run things

- **Run A.P.E.X.:** any static file server, e.g. `python -m http.server 8765`, then open
  `http://localhost:8765/index.html`. ES modules require `http(s)://`, not `file://`.
- **Brains:** add a Groq key (free, console.groq.com) in the Settings page — that's the primary
  brain. Gemini is an optional fallback. Both keys live only in this browser's `localStorage`.
- **Tests:** there's no Python test suite for the live app anymore (see
  `python_backend_legacy/scripts/` for the old ones, still runnable standalone). For the JS modules,
  smoke-test via the browser DevTools console, e.g.:
  ```js
  import * as pipeline from "./js/pipeline.js";
  await pipeline.handlePrompt("What should I get Taylor for her birthday?");
  ```

## Current status

See `STATUS.md` for the up-to-date snapshot of what's working, paused, and next.
