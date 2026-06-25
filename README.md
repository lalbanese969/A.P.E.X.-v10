# A.P.E.X. v10

**A.P.E.X. — Adaptive Personal Executive Xpert.** A custom personal AI assistant: one assistant to
the user, with memory, a multi-provider AI brain, and connections (email/calendar) that grow step
by step.

> Status: runs **entirely in the browser** — no backend server. Memory, the AI Center, and the
> action pipeline all execute as client-side JavaScript, backed by `localStorage`. See
> [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md) and [`STATUS.md`](STATUS.md).

## What works today
- **Web UI** (`index.html`) — orange/black theme, animated honeycomb background, chat + calendar +
  email + settings views.
- **Memory** (`js/memory.js`) — a catalog/resolver/packet system that loads only the *relevant*
  memory per prompt (never dumps everything into the model).
- **AI Center** (`js/aiCenter.js`) — calls **Groq** (primary, fast, free-tier) and **Gemini**
  (fallback) directly from the browser. Both confirmed CORS-friendly for direct browser calls.
- **Actions (mock-first)** (`js/pipeline.js`, `js/connections.js`) — calendar Q&A, email search, and
  email **drafting** with a writing-style learning loop. Data is sample/mock until real accounts are
  connected.
- **Settings page** — paste your Groq/Gemini key, add & label email accounts. Everything is saved
  only in **this browser's `localStorage`** — no server, nothing uploaded anywhere.

## Requirements
Just a browser. No Python, no Node, no build step, no install.

## Run it
Any static file server works (or just open `index.html` directly — ES modules need `http(s)://`,
not `file://`, so a tiny server is easiest):
```bash
python -m http.server 8765
# then open http://localhost:8765/index.html
```
Or once pushed to GitHub: enable **GitHub Pages** (Settings → Pages → deploy from `main`) for a
free, permanent public URL — no server to keep running.

First time in Settings, paste a **Groq API key** (free at console.groq.com) so APEX has a brain.

## Layout
```
index.html             # the web UI
js/                     # the brain: storage, memory, aiCenter, pipeline, connections, settings
secrets/                # git-ignored; only relevant if you resurrect the legacy Python backend
docs/                   # APEX_ARCHITECTURE.md, BUILD_PLAN.md
python_backend_legacy/  # the original Python backend (archived, not deleted) — see its README.md
```

## Architecture note
APEX was originally a Python backend + web UI. It was migrated to a pure client-side app so it
could be hosted free (GitHub Pages), not depend on a personal computer staying on, and avoid a
sleep-prone/paid server. The Python version still works standalone — see
[`python_backend_legacy/README.md`](python_backend_legacy/README.md) — and is kept for reference
(it supports real local Ollama, which the browser version can't reach due to mixed-content
blocking).

See [`CLAUDE.md`](CLAUDE.md) and [`docs/APEX_ARCHITECTURE.md`](docs/APEX_ARCHITECTURE.md) for the
full design.
