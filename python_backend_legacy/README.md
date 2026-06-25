# A.P.E.X. — Python Backend (Archived)

This is the **original A.P.E.X. backend**, written in Python: memory engine, the AI Center
(Groq/Gemini/Ollama routing), the action pipeline (calendar/email/draft), mock email+calendar
connectors, and a Settings/server layer.

## Why this is archived, not deleted

APEX moved to a **pure client-side JavaScript** app (see the repo root) so it could be hosted free
on GitHub Pages, run without depending on a personal computer staying on, and avoid needing a paid
or sleep-prone cloud server. That migration meant rewriting this logic in JavaScript to run in the
browser instead.

This folder is kept because:
- It's a **working, tested** implementation — useful as a reference while porting logic to JS.
- It supports things the browser version currently does **not**: real **local Ollama** as a model
  fallback (a browser on a public HTTPS page can't call `http://localhost:11434` — mixed-content
  blocking), and a more battle-tested action pipeline.
- It's a safety net — if the client-side version hits a wall, this still runs standalone.

## How to run it

```bash
cd python_backend_legacy
python -m backend.server
# open http://localhost:8765   (note: index.html lives at the repo root, not in here —
# copy it into this folder, or point a separate static server at the repo root, if you want
# the old UI back; the API at /api/* works regardless)
```

### Secrets

`secrets/secrets.json` lives at the **true repo root** (one level up from this folder), not inside
`python_backend_legacy/`. If you bring this backend back into active use, either:
- set `GROQ_API_KEY` / `GEMINI_API_KEY` as environment variables before running, **or**
- copy your `secrets.json` into `python_backend_legacy/secrets/secrets.json`.

### Tests

```bash
cd python_backend_legacy
python scripts/test_memory.py
python scripts/test_ai_center.py
```

Both verified passing right after the archive move.

## What's in here

Same structure as it always had — nothing was changed during the move, only relocated (`git mv`,
so file history is preserved):

```
backend/        memory/, ai/, connections/, pipeline.py, server.py, settings.py
core_memory/     local JSON memory store (catalog, people, projects, apex_self, logs)
config/          ai_center.json, accounts.json
scripts/         test_memory.py, test_ai_center.py
requirements.txt (empty — stdlib only)
render.yaml      (Render deploy config, never finished — see repo STATUS.md history)
```

See the repo root's `docs/APEX_ARCHITECTURE.md` and `docs/BUILD_PLAN.md` (as of the migration) for
the full design this backend implements.
