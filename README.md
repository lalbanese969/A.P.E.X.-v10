# A.P.E.X. v10

**A.P.E.X. — Adaptive Personal Executive Xpert.** A custom personal AI assistant: one assistant to
the user, with modular backend systems for memory, a multi-model AI brain, and connections
(email/calendar) that grow step by step.

> Status: early build. Memory + AI brain (Ollama/Gemini) + email/calendar **mock** connectors + a
> web UI are working locally. Real OAuth connections, autonomy, and cloud hosting are planned. See
> [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md).

## What works today
- **Web UI** (`index.html`) — orange/black theme, animated honeycomb background, chat + calendar +
  email + settings views.
- **Memory** — a catalog/resolver/packet system that loads only the *relevant* memory per prompt
  (never dumps everything into the model).
- **AI Center** — routes work between **Gemini** (paid, user-facing answers, used sparingly) and
  **Ollama** (local/free, internal tasks), with auto-fallback.
- **Actions (mock-first)** — calendar Q&A, email search, and email **drafting** with a writing-style
  learning loop. Data is sample/mock until real accounts are connected.
- **Settings page** — set the Gemini key, choose Ollama models/host, add & label email accounts.

## Requirements
- **Python 3.13+** (standard library only — no pip dependencies yet).
- Optional brains: **[Ollama](https://ollama.com)** running locally (`ollama pull llama3.1:8b`)
  and/or a **Gemini API key**. Without either, the UI still loads with an offline placeholder.

## Run it
```bash
python -m backend.server
# then open http://localhost:8765/index.html
```

## Tests
```bash
python scripts/test_memory.py        # memory structure + pipeline
python scripts/test_ai_center.py     # AI routing + Gemini budget
```

## Layout
```
index.html        # the web UI
backend/          # the brain: memory/, ai/, connections/, pipeline.py, server.py, settings.py
core_memory/      # local JSON memory store (example data) + runtime logs
config/           # ai_center.json, accounts.json (non-secret config)
secrets/          # git-ignored; API keys/tokens go in secrets.json (see secrets.example.json)
docs/             # APEX_ARCHITECTURE.md, BUILD_PLAN.md
```

## Configuration & secrets
- Non-secret config: `config/ai_center.json`, `config/accounts.json`.
- **Secrets** (Gemini key, future OAuth tokens) live only in `secrets/secrets.json`, which is
  **git-ignored**. Copy `secrets/secrets.example.json` to get started. Never commit real secrets.

See [`CLAUDE.md`](CLAUDE.md) and [`docs/APEX_ARCHITECTURE.md`](docs/APEX_ARCHITECTURE.md) for the
full design.
