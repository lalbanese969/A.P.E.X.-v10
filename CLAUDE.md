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
3. If an action is needed, A.P.E.X. acknowledges ("Working on that"), a backend **action job** is
   created, a **tool** runs it, and A.P.E.X. follows up ("Done, I scheduled that").
4. High-risk actions go through an approval system (later phase).

## Build philosophy (follow these)

- Go **step by step**; do not build every advanced feature at once.
- Start with clean structure, **mocked tools**, and **local JSON** files.
- Prefer **readable, modular** files. Keep code easy to inspect and change.
- **Do not break the existing UI** (`index.html`).
- **Do not add dependencies** without explaining why. Memory V1 is Python **standard library only**.
- **Never store secrets** (API keys, OAuth tokens, passwords) in memory files or in code. Secrets
  live only in `secrets/` (git-ignored).
- Before major changes, explain the plan first.

## Repo layout

```
index.html              # The UI (orange/black, honeycomb bg). Chat logic is in the [JS:CHAT] block.
CLAUDE.md               # This file.
docs/
  APEX_ARCHITECTURE.md  # The full system design (9 concepts) + what's implemented.
  BUILD_PLAN.md         # Phased milestones (P0..P8). Check current phase here.
secrets/                # GIT-IGNORED. secrets.example.json is a template; real keys go in secrets.json.
core_memory/            # The memory DATA store (local JSON, hand-editable).
  memory_catalog.json   #   Lightweight table of contents (cards only, no full memory).
  people/               #   person_schema.json + one JSON file per person.
  projects/             #   project_schema.json + one JSON file per project.
  apex_self/            #   apex_profile.json — how APEX should behave/adapt (evolving).
  logs/                 #   memory_write_log.jsonl — proposed memory writes (append-only).
backend/                # The CODE (the brain). Grows each phase.
  memory/               #   Memory engine: catalog, resolver, packet_builder, writer, profile, schemas, demo.
```

**Key principle:** `core_memory/` is **data**, `backend/` is **code**. Keep them separate.

## How memory works (V1)

Do NOT dump all memory into the AI prompt. Instead:
`memory_catalog.json` (table of contents) → **resolver** finds relevant cards →
**packet_builder** loads only the needed sections → returns a small **Memory Packet**.

The **Memory Writer** is a placeholder: it logs *proposed* writes to
`core_memory/logs/memory_write_log.jsonl` and never auto-edits memory.

## How to run things

- **Run A.P.E.X. (UI + brain + connections):** `python -m backend.server`, then open
  `http://localhost:8765/index.html`. This serves the UI *and* the `/api/*` routes.
  (A plain `python -m http.server 8765` still serves the UI, but the API/brain won't work — the UI
  falls back to an offline placeholder.)
- **Brains:** Gemini = user-facing answers (key in `secrets/secrets.json` → `ai_providers.gemini_api_key`),
  Ollama = internal tasks + fallback (install Ollama, `ollama pull` a model, set names in
  `config/ai_center.json`). Cloud Ollama = change `ollama_host` there.
- **Tests:**
  ```
  python scripts/test_memory.py        # memory structure + pipeline
  python scripts/test_ai_center.py     # AI Center routing + Gemini budget
  python -m backend.memory.demo "What should I get Taylor for her birthday?"
  ```
  Run all from the repo root so the `backend` package imports correctly.

## Current status

Phase 1 (Memory V1) — local JSON memory + resolver + packet builder + writer placeholder.
No web server, no AI provider, no real tools yet. See `docs/BUILD_PLAN.md` for what's next.
