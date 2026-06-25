# A.P.E.X. Architecture

**A.P.E.X. = Adaptive Personal Executive Xpert** — a custom personal AI assistant.

To the user it is **one assistant**. Behind the scenes it is **modular**: separate systems for
memory, actions, tools, autonomy, security, and self-improvement, built **step by step**.

---

## Runs entirely client-side — no backend server

APEX started as a Python backend + web UI. It was **migrated to pure client-side JavaScript**
(see `js/`) so it could be hosted free (GitHub Pages), not depend on a personal computer staying
on, and avoid a sleep-prone/paid server. Everything — memory, the AI Center, the action pipeline —
now runs as plain ES modules in the browser, backed by `localStorage`. There is no server in the
live app.

This was viable because both **Groq** and **Gemini** were confirmed, via a live CORS preflight
test against their real APIs, to allow direct browser-origin requests — so the browser can call
them straight, no relay server needed.

The original Python backend is **archived, not deleted**, at `python_backend_legacy/` (its own
README explains why and how to run it standalone). It still supports things the browser version
can't — notably real **local Ollama** as a model (a page served over HTTPS can't call
`http://localhost:11434`; browsers block that as mixed content).

---

## User Experience Flow (target end state)

1. User sends a prompt through the UI (`index.html`).
2. A.P.E.X. responds naturally.
3. If an action is needed, A.P.E.X. acknowledges quickly ("Working on that"), runs the action
   (calendar/email/etc.), and follows up ("Done, I scheduled that for you").
4. High-risk actions go through an **approval system** (later phase).

---

## The 9 Concepts

### 1. Main A.P.E.X. AI
The single personality/voice. It receives a small **Memory Packet** (not the whole memory store)
plus self-profile guidance, and decides whether an action is needed. Implemented as
`js/pipeline.js` calling `js/aiCenter.js`.

### 2. Memory Resolver  ✅ implemented
Reads memory **efficiently** — never loads everything into the prompt. A catalog (table of
contents) is scored against the prompt; only matching sections are loaded. `js/memory.js` —
alias/tag/name/summary matching, a stand-in for future semantic search (stable interface so
embeddings could be added later).

### 3. Memory Writer AI  ✅ placeholder
After an interaction, decides whether anything should be saved (people, birthdays, preferences,
gift ideas, projects, notes). **Still a non-destructive placeholder**: `js/memory.js:reviewInteraction`
logs *proposed* writes to `localStorage` (`apex.logs.memoryWrite`) and never edits memory
automatically. Real AI extraction + approval come later.

### 4. A.P.E.X. Self-Profile  ✅ implemented
A separate, evolving profile of **how A.P.E.X. should behave** (tone, etc.), stored under
`apex.memory.profile`. Grows by adding evidence, never blind overwrite.

### 5. Reflection / Prompt Optimizer — later
Controlled, versioned updates to the self-profile/prompts. Never freely rewrites the system.

### 6. Actions System  🟡 partial
Calendar Q&A, email search/draft/refine are real (against mock data). The full
acknowledge → job → tool → report-back flow for arbitrary actions is a later phase.

### 7. Tools Layer  — later
A.P.E.X.'s "hands": email, calendar (mock now), files, browser/search, smart home, etc. A tool
registry describing capabilities/risk/approval requirements is a later phase.

### 8. Autonomy / Triggers  — later
Recurring/event triggers with hard limits (max/day, quiet hours) and logs.

### 9. Security / Control  — ongoing, model changed by the migration
There's no server, so there's no server-side secret store. API keys are typed into the Settings UI
and live **only in the user's own browser `localStorage`** — never written to a committed file,
never sent anywhere except directly to the AI provider's own API. (The archived Python backend's
model — secrets in a git-ignored file — still applies if you run it standalone.)

---

## Memory — What's Implemented (`js/memory.js`)

### Storage (localStorage, namespaced under `apex.`)
- `apex.memory.catalog` — lightweight **table of contents**. Cards only (id, type, display_name,
  aliases, relationship_to_user, summary_card, available_sections, tags, importance). No full memory.
- `apex.memory.people.<id>` / `apex.memory.projects.<id>` — full records.
- `apex.memory.profile` — the self-profile. `apex.memory.writingStyle` — learned draft preferences.
- `apex.logs.memoryWrite` / `apex.logs.memoryResolution` — append-only logs (arrays in localStorage).
- Seed/demo data (Taylor, the APEX project record) ships in `js/seedData.js` and is written once,
  the first time the app runs with nothing stored yet.

### The Memory Packet (what the AI receives)
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
prompt → memory.resolve() → memory.buildPacket() → Memory Packet → pipeline → AI Center
           (scan catalog cards)   (load only needed sections)
```

### Write path
```
interaction → memory.reviewInteraction() → append PROPOSED write → apex.logs.memoryWrite
                                           (never edits memory records)
```

---

## AI Center + Connections (`js/aiCenter.js`, `js/connections.js`)

### AI Center
- **Groq** = primary brain (fast, generous free tier), called directly from the browser via
  `fetch()`. Used for both the user-facing answer and internal tasks (style learning).
- **Gemini** = fallback if Groq has no key or fails. Also confirmed CORS-friendly.
- **No local Ollama** in the browser version (mixed-content blocking) — see
  `python_backend_legacy/` if you need that.
- Every call is logged to `apex.logs.aiUsage` (task, provider, model, ok/error).
- Keys: typed into Settings, stored only in `apex.settings` (`localStorage`). Never committed,
  never sent anywhere but directly to the provider's own API.

### Connections (mock-first)
- `apex.connections.accounts` — labeled accounts (Gmail/Outlook) + calendars. Add/remove/label
  from the Settings UI.
- `apex.connections.emailMessages.<accountId>` / `apex.connections.calendarEvents` — mock data
  (incl. a DocuSign email, and calendar events generated relative to "today"). Real Gmail/Outlook/
  Google Calendar OAuth — **directly from the browser**, the same pattern proven by an earlier
  personal project — is a deliberate later step (see `docs/BUILD_PLAN.md`).
- `apex.connections.drafts` — saved drafts. **Nothing is ever sent.**

### Pipeline flow (`js/pipeline.js`, per prompt)
```
prompt → memory packet
       → INTENT (heuristic only — no AI tiebreak; simplified since dropping Ollama)
       → ACTION: calendar_query | email_search | email_draft | email_refine | chat
       → CONTEXT (memory + profile + writing style + calendar/email results)
       → ANSWER via AI Center (Groq, Gemini fallback)
       → memory writer (log-only) + style learning (Groq) + usage/resolution logs
```

### Email drafting + style learning
- `email_draft`: finds a reference email, the brain writes the body, a structured draft (to/
  subject/body) is shown in the UI for review/edit.
- `email_refine`: feedback on a draft → the brain distills a lasting **writing preference** →
  appended to `apex.memory.writingStyle` → re-draft applies it. Drafts tune to the user over time.

### Reading vs writing
Still separate: memory **reading** (resolver+packet) feeds the prompt; memory **writing** stays a
non-destructive placeholder. The writing-**style** profile is its own append-only store.

---

## Constraints (all phases)
- Don't break the UI (`index.html`).
- Zero dependencies, no build step — plain ES modules.
- Never store secrets in a committed file. Keys live only in the user's browser.
- Mock tools first; real integrations one at a time, later.
- Explain plans before major changes.

See `BUILD_PLAN.md` for the phased roadmap and current status, and `STATUS.md` for the live
quick-glance tracker.
