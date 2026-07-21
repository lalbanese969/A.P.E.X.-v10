# Profile Memory — Apex's personal-assistant / health brain

This is the durable "what Apex knows about me" store for the fitness/health side of
Apex. It is **not a separate app** — it lives in the same on-device `localStorage`
memory the rest of Apex uses (`js/storage.js`, `apex.` namespace).

## Where things live

| Concern | Module | Storage key(s) |
| --- | --- | --- |
| Structured profile (facts, measurements, goals, allergy, targets, training, open questions) | `js/profile.js` | `apex.profile.items`, `apex.logs.profileAudit` |
| Food memory, daily log, recipes/meal templates | `js/nutrition.js` | `apex.nutrition.foods`, `apex.nutrition.recipes`, `apex.nutrition.log.<date>` |

Both modules import **only** `storage.js` (no AI, no DOM), so they're unit-testable
in Node — see `tests/nutrition-profile.test.mjs` (`node tests/nutrition-profile.test.mjs`).
The AI-driven parts (parsing "I ate…"/"I drank…" from chat) live in `js/pipeline.js`.

## The profile record

Every profile item is a record with provenance and history metadata:

```
{ id, category, field, value, unit, status, source, confidence,
  created, updated, effective_date, confirmed, active, notes }
```

### `status` — how Apex distinguishes facts from guesses

- `confirmed_user_fact` — you told us; confirmed. (age, sex, height, dairy allergy)
- `user_preference`, `user_goal`
- `user_reported_measurement` / `imported_measurement` — a dated data point
- `working_estimate` — a starting guess (e.g. calorie/macro targets). **Not a fact.**
- `coach_recommendation` — Apex's advice
- `unknown` — we don't know; stored, never guessed
- `archived` — superseded, kept for history

The coach's AI context (`profile.profileBrief()`) labels targets as **[ESTIMATE]** so
Apex never presents a guess as a confirmed fact.

## Core rules

- **History is append-only.** `addMeasurement("body_weight", 162, "lb")` adds a new
  dated record; the old 165 lb entry is preserved. `currentWeight()` returns the
  newest; `weightHistory()` returns them all.
- **Allergies are protected.** `recordAllergy()` refuses to change an existing allergy
  unless `explicit: true` is passed, and logs the refusal to the audit trail.
- **Estimates stay adjustable.** Nutrition targets are `working_estimate`s meant to
  move with real ≥7-day trends, not single weigh-ins.
- **Unknowns are stored as unknown** (`openQuestions()`), never invented.

## Food memory (consistency)

When you log a food, its macros are remembered (`nutrition.rememberFood`). Logging the
same thing again reuses those macros (`nutrition.findFood`) so the numbers stay
consistent instead of being re-estimated. Foods are matched by normalized name/alias
and deduped (usage count bumped).

## Meal templates

Two seeded, editable recipes: **two breakfast sandwiches** and **pork tenderloin fried
rice**. Totals are **computed from the ingredients** (never hard-coded), each
ingredient carries its own macros + a raw/cooked flag, and `recipeTotals()` returns
`{ total, perServing }`. Oils and sauces are tracked as separate ingredients.

## Privacy

- Everything is **on this device** (localStorage). Nothing is committed to git or
  uploaded. `.gitignore` blocks any exported profile/health files.
- Only **summarized** profile data is sent to the AI provider (Groq/Gemini) when you
  chat — never the raw store.
- You can export everything (`profile.exportAll()`), and delete records
  (`profile.deleteItem`, `nutrition.removeFoodEntry`).

## What each seeded value is

- Facts: age 21, male, 70 in.
- Measurement: body weight 165 lb, **date unconfirmed** (post-Philmont).
- Goal: body recomposition (lean, athletic; not "as big as possible", not zero body fat).
- Allergy: **dairy / milk-protein** — avoid list incl. whey & casein; lactose-free is
  *not* considered safe; severity & cross-contact = unknown.
- Nutrition targets: **estimates** (~2650 kcal avg, 160–170 g protein, 30–40 g fiber,
  ~3.0–3.5 L water; hard-day vs rest-day splits).
- Supplement: creatine monohydrate 5 g/day (no loading/cycling).
- Training: 3 full-body strength + easy aerobic + interval + long easy endurance + rest.

## Still to build (later phases)

- Chat-driven logging UI polish + the fun nutrition dashboard (Phase 2, in progress).
- Profile viewer/editor screen (Phase 3).
- Apple Health import: "Export All Health Data" XML/ZIP + a free Shortcut → importer
  (Phase 4). No third-party paid app; compare recovery to *your* baseline.
- Weekly summaries + automatic application of the nutrition-adjustment rules (Phase 5).
