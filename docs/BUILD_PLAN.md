# A.P.E.X. Build Plan (Phased)

Build philosophy: **step by step**, clean structure, mocked tools, local JSON first, readable modular
files, never break the UI, no needless dependencies, secrets isolated.

Status legend: ✅ done · 🔜 next · ⬜ later

---

## Phase 0 — Foundation & Docs ✅
- Repo structure, `CLAUDE.md`, `docs/`, `.gitignore`, `secrets/` template.
- Data vs. code separation (`core_memory/` vs. `backend/`).

## Phase 1 — Memory V1 ✅  *(current)*
Local JSON memory + efficient read path + non-destructive write path.
- `core_memory/memory_catalog.json` — table of contents (cards only).
- `people/` — `person_schema.json` + `example_person_taylor.json`.
- `projects/` — `project_schema.json` + `example_project_apex.json`.
- `apex_self/apex_profile.json` — evolving self-profile (0–10 levels, evidence, history).
- `logs/memory_write_log.jsonl` — proposed writes.
- `backend/memory/` engine: `paths, schemas, catalog, resolver, packet_builder, writer, profile, demo`.
- CLI: `python -m backend.memory.demo "<prompt>"`.
- **Constraints honored:** stdlib only, no AI calls, no embeddings, writer never auto-edits memory,
  UI untouched.

## Phase 2 — Backend Server + AI Wire-up 🟡 *(in progress — memory connected, AI still mocked)*
Done so far:
- ✅ Zero-dependency stdlib server (`backend/server.py`) serves the UI + `POST /api/chat`.
- ✅ Chat pipeline (`backend/pipeline.py`): prompt → resolver → Memory Packet → **mock** response.
- ✅ UI `[JS:CHAT]` posts to `/api/chat` (with offline fallback) instead of local echo.
- ✅ Memory Packet (small, section-scoped) is what flows into the response — not all memory.
- ✅ Resolution logging → `core_memory/logs/memory_resolution_log.jsonl`.
- ✅ Writer still runs each turn (log-only, non-destructive).

Phase 2 completed by the AI Center step below.

## Phase 2b — AI Center + Connections (Ollama + Gemini, email/calendar mock-first) ✅
The mock brain is replaced by a real, cost-aware AI Center, and email/calendar "hands" exist (mock data).
- ✅ **AI Center** (`backend/ai/`): `providers/{ollama,gemini}.py` (stdlib HTTP, no deps),
  `center.py` routes tasks — **Gemini** for the user-facing answer (budget 1/turn, hard cap from
  config), **Ollama** for all internal work, auto-falling-back to an installed model. Usage logged to
  `core_memory/logs/ai_usage_log.jsonl`.
- ✅ **Cloud-ready Ollama**: host + optional auth header in `config/ai_center.json` → local↔cloud is a config change.
- ✅ **Connections** (`backend/connections/`): labeled account registry (`config/accounts.json`),
  email + calendar connectors with **mock** implementations (incl. a DocuSign email).
- ✅ **Pipeline**: intent router (heuristic-first, Ollama tiebreak) → actions (calendar query, email
  search, **email draft**, **email refine**) → real brain answer. Calendar events injected into context.
- ✅ **Writing-style learning loop**: draft feedback → Ollama extracts a preference → appended to
  `core_memory/apex_self/writing_style.json` (seeded friendly+professional) → future drafts use it.
- ✅ **UI**: center view switcher (chat / **calendar view** / **email view**), in-chat editable draft
  card, connection **status strip** (shows configured ✅/❌, never secret values).
- ✅ Endpoints: `/api/chat`, `/api/calendar`, `/api/email`, `/api/accounts`, `/api/status`, `/api/email/draft`.

Still pending (separate gated steps):
- ⬜ **Phase C** — real OAuth connectors (Gmail/Outlook/Google Calendar) + the dependency decision.
- ⬜ Autonomy (proactive email noticing, auto-drafts, follow-ups, reminders) — Phase D.
- ⬜ Cloud deploy — Phase E.

## Phase 3 — Self-Profile Adaptation + Reflection AI ⬜
- Reflection pass proposes profile updates: append evidence, nudge confidence, version in
  `update_history`. Controlled and logged — never free rewrite.
- Begin promoting reviewed `memory_write_log.jsonl` proposals into real records (with approval).

## Phase 4 — Actions System V1 ⬜
- Action-job model + Tool Router + **mocked** tools (calendar/email/files as fakes).
- "Working on that → job created → Done" flow, with a job log.

## Phase 5 — Tools Registry + Permissions ⬜
- Registry describing each tool's capabilities, risk level, and approval requirement.
- Approval system for high-risk actions.

## Phase 6 — Autonomy / Triggers ⬜
- Recurring + event triggers with limits (max/day, max/hour, quiet hours), logs, permission rules.

## Phase 7 — Real Integrations ⬜
- Email, calendar, Raspberry Pi, smart lights, 3D printer — one at a time. OAuth/tokens in `secrets/`.

## Phase 8 — Hardening + Self-Improvement ⬜
- Prompt optimizer; upgrade resolver to real semantic search (embeddings); broader logging/observability.

---

## Open Decisions (carried forward)
- **Backend framework** for Phase 2: FastAPI (Python) vs Node/Express.
- **AI provider** for the main brain: Anthropic (Claude) vs OpenAI (GPT) vs switchable.

These do not block Memory V1 and are resolved at the start of Phase 2.
