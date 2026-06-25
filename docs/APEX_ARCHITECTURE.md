# A.P.E.X. Architecture

**A.P.E.X. = Adaptive Personal Executive Xpert** — a custom personal AI assistant.

To the user it is **one assistant**. Behind the scenes it is **modular**: separate systems for
memory, actions, tools, autonomy, security, and self-improvement, built **step by step**.

---

## User Experience Flow (target end state)

1. User sends a prompt through the UI (`index.html`).
2. A.P.E.X. responds naturally.
3. If an action is needed, A.P.E.X. acknowledges quickly ("Working on that").
4. The backend creates an **action job**.
5. A **Tool Router** sends the job to the correct tool (calendar, email, files, API, Raspberry Pi,
   lights, 3D printer, …).
6. The tool runs the job.
7. A.P.E.X. follows up ("Done, I scheduled that for you").
8. High-risk actions go through an **approval system** (later phase).

---

## The 9 Concepts

### 1. Main A.P.E.X. AI
The single personality/voice. From the user's view they talk to one assistant. It receives a small
**Memory Packet** (not the whole memory store) plus the self-profile guidance, and decides whether
an action is needed.

### 2. Memory Resolver  ✅ V1 implemented
Reads memory **efficiently**. It does NOT load all memory into the prompt. Instead:
`memory_catalog.json` (table of contents) → score relevant cards → suggest which sections to load.
V1 uses alias/tag/name/summary matching as a stand-in for future semantic search (stable interface
so embeddings can be added later).

### 3. Memory Writer AI  ✅ V1 placeholder
After an interaction, decides whether anything should be saved (people, birthdays, relationships,
preferences, gift ideas, projects, notes). **V1 is a non-destructive placeholder**: it logs
*proposed* writes to `core_memory/logs/memory_write_log.jsonl` and never edits memory automatically.
Real AI extraction + approval come later.

### 4. A.P.E.X. Self-Profile  ✅ V1 implemented
A separate, evolving profile of **how A.P.E.X. should behave**: tone, humor (0–10), directness
(0–10), detail level, pacing, communication style, liked/disliked response patterns, evidence,
confidence scores, and update history. It **grows by adding evidence**, never by blind overwrite
(`backend/memory/profile.py:add_evidence`).

### 5. Reflection / Prompt Optimizer  — later
After interactions, suggests controlled, logged, **versioned** updates to the self-profile and later
to prompts. Never freely rewrites the system.

### 6. Actions System  — later
Real assistant jobs: understand request → acknowledge → create action job → Tool Router → execute →
report back.

### 7. Tools Layer  — later
A.P.E.X.'s "hands": email, calendar, files, browser/search, APIs, Raspberry Pi, lights, 3D printer.
A **tool registry** describes each tool's capabilities, permissions, risk level, and whether
approval is required.

### 8. Autonomy / Triggers  — later
Recurring and event triggers that run backend tasks on a schedule/event, with hard limits (max
triggers/day, max runs/hour, quiet hours) and logs.

### 9. Security / Control  — ongoing
Secrets, API keys, OAuth tokens, and passwords **never** live in memory files or code — only in
`secrets/` (git-ignored). Tools have permission levels; high-risk actions require approval;
autonomy has limits and logs.

---

## Memory V1 — What's Implemented

### Data store — `core_memory/` (local JSON, hand-editable)
- `memory_catalog.json` — lightweight **table of contents**. Cards only (id, type, display_name,
  aliases, relationship_to_user, summary_card, memory_file, available_sections, tags, importance,
  last_updated). No full memory.
- `people/person_schema.json` + `people/example_person_taylor.json` — person records.
- `projects/project_schema.json` + `projects/example_project_apex.json` — project records.
- `apex_self/apex_profile.json` — the self-profile.
- `logs/memory_write_log.jsonl` — append-only proposed writes.

### Engine — `backend/memory/` (Python standard library only)
| Module | Responsibility |
|---|---|
| `paths.py` | Single source of truth for file locations. |
| `schemas.py` | Record templates, validation, `compute_age()`. |
| `catalog.py` | Load/scan the catalog; open a record a card points to. |
| `resolver.py` | Score catalog cards vs. the prompt; suggest sections to load. |
| `packet_builder.py` | Load only suggested sections → compact **Memory Packet**. |
| `writer.py` | Non-destructive writer placeholder (logs proposals). |
| `profile.py` | Safe, append-only self-profile updates. |
| `demo.py` | CLI tester. |

### The Memory Packet (what the main AI receives)
```json
{
  "memory_needed": true,
  "query": "What should I get Taylor for her birthday?",
  "loaded_records": [
    {
      "id": "person_taylor_001",
      "type": "person",
      "display_name": "Taylor",
      "relationship_to_user": "girlfriend",
      "sections_loaded": ["identity", "birthday", "gift_ideas"],
      "summary": { "...only the loaded sections..." }
    }
  ]
}
```

### Read path
```
prompt ─▶ resolver.resolve() ─▶ packet_builder.build_packet() ─▶ Memory Packet ─▶ main AI
            (scan catalog cards)   (open matched files,
                                    load only needed sections)
```

### Write path (V1)
```
interaction ─▶ writer.review_interaction() ─▶ append PROPOSED write ─▶ core_memory/logs/memory_write_log.jsonl
                                              (never edits memory records)
```

---

## Memory V1 is now CONNECTED to the chat flow

As of this step, memory is wired into the live chat pipeline (the AI itself is still
mocked — no provider connected yet).

### Runtime flow
```
UI (index.html) ──POST /api/chat──▶ backend/server.py ──▶ backend/pipeline.handle_prompt()
                                                              │
                                                              ├─ resolver.resolve()         (relevant cards)
                                                              ├─ packet_builder.build_packet()  (small packet)
                                                              ├─ mock_apex_response(packet, profile)
                                                              ├─ writer.review_interaction()    (log-only)
                                                              └─ log to memory_resolution_log.jsonl
                                                              ▼
UI shows apex_response  ◀──────────  { user_prompt, memory_packet, apex_response }
```

### Key points
- **The main AI receives Memory Packets, not all memory.** Only the sections relevant
  to the prompt are loaded; the whole store is never injected.
- **Reading and writing are separate systems.** Reading happens in the pipeline
  (`resolver` + `packet_builder`). Writing is handled by `writer.py` and is still a
  **non-destructive placeholder** — it logs *proposed* writes and never edits memory.
- **The response is mocked.** `pipeline.mock_apex_response()` stitches the packet into a
  readable sentence to prove the pipeline. Replace it with a real model call in Phase 2;
  callers don't change.
- **No new dependencies.** `backend/server.py` uses only the Python standard library
  (`http.server`). It serves the UI *and* the `/api/chat` route. A framework can replace
  it later if needed — the logic lives in `pipeline.py`, not the server.

### New files this step
| File | Role |
|---|---|
| `backend/pipeline.py` | `handle_prompt()` — memory → mock response → logging. |
| `backend/server.py` | Zero-dependency server: serves UI + `POST /api/chat`. |
| `scripts/test_memory.py` | Verifies structure/JSON and runs the test prompts. |
| `core_memory/logs/memory_resolution_log.jsonl` | One line per resolution (considered/loaded/sections/size). |

### Endpoint contract
`POST /api/chat`  body `{ "prompt": "...", "prior_draft": {...}? }`  →
```json
{ "user_prompt": "...", "memory_packet": { ... }, "apex_response": "...",
  "intent": "...", "ai_meta": {"provider": "...", "model": "..."},
  "draft": {...}?, "calendar": [...]?, "email_matches": [...]? }
```

---

## AI Center + Connections (Ollama + Gemini, email/calendar)

The mock brain is replaced by a real, cost-aware **AI Center**, and A.P.E.X. has the start of
"hands" (email + calendar), built mock-first.

### AI Center — `backend/ai/`
- **Gemini** = the paid, user-facing brain. Used **sparingly**: a per-turn budget guard caps Gemini
  calls (default 1). Over budget / no key / offline → falls back to local Ollama.
- **Ollama** = local/free, does all internal work (intent classify, style extraction), routed to a
  model tier (small/medium/large). If a tier's model isn't installed, the Center auto-falls-back to an
  installed one.
- **Cloud-ready**: Ollama host + optional auth header live in `config/ai_center.json`, so pointing at
  a remote/cloud Ollama is a config change, not code.
- Every call is logged to `core_memory/logs/ai_usage_log.jsonl` (task, provider, model, tokens, ms).
- Secrets: Gemini key in `secrets/secrets.json` (`ai_providers.gemini_api_key`). No memory/connector
  code reads secrets.

### Connections — `backend/connections/` (mock-first)
- `config/accounts.json` — labeled accounts (multiple Gmail/Outlook, each with label/purpose) + calendars.
- `email/` + `calendar/` — connector interfaces with **mock** implementations now (incl. a DocuSign
  email and today-relative events). Real OAuth (Gmail/Outlook/Google Calendar) is a later, gated step
  that slots in behind the same interfaces.

### Pipeline flow (per prompt)
```
prompt → memory packet
       → INTENT (heuristic-first; Ollama tiebreak for ambiguous "chat")
       → ACTION: calendar_query | email_search | email_draft | email_refine | chat
       → CONTEXT (memory + profile + writing style + calendar/email results)
       → ANSWER via AI Center (Gemini budgeted, Ollama fallback)
       → writer (memory, log-only) + style learning (Ollama) + logs
```

### Email drafting + style learning
- `email_draft`: finds a reference email, the brain writes the body, a structured draft (to/subject/
  body) is returned and shown in the UI. **Nothing is sent.**
- `email_refine`: user feedback → Ollama distills a lasting **writing preference** → appended to
  `core_memory/apex_self/writing_style.json` → re-draft applies it. Drafts tune to the user over time.

### Reading vs writing
Still separate: memory **reading** (resolver+packet) feeds the prompt; memory **writing** stays a
non-destructive placeholder (logs proposals). The writing-**style** profile is its own append-only store.

---

## Constraints (all phases)
- Don't break the UI (`index.html`).
- No dependencies without justification (Memory V1 = stdlib only).
- Never store secrets in memory or code.
- Mock tools first; real integrations one at a time, later.
- Explain plans before major changes.

See `BUILD_PLAN.md` for the phased roadmap and current status.
