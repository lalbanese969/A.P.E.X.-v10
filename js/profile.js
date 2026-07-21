/* ============================================================================
   [MODULE: profile.js]
   The PERSONAL-ASSISTANT / health-profile memory — the durable "what Apex knows
   about me" store. This is NOT a separate app: it lives in the same localStorage
   the rest of Apex's memory uses (storage.js, "apex." namespace) and is the fitness
   side of the same assistant.

   Design goals (from the product brief):
   - Every fact/measurement/goal/estimate is a categorized RECORD with provenance,
     confidence, timestamps and an effective date.
   - HISTORY IS APPEND-ONLY. Changing weight 165 -> 162 adds a new dated measurement;
     it never erases that you once weighed 165.
   - FACTS are clearly distinguished from ESTIMATES and AI RECOMMENDATIONS (via
     `status`), so the coach never passes off a guess as a confirmed fact.
   - ALLERGIES are a protected, high-risk field — never silently overwritten.
   - Everything stays on THIS device (localStorage). Nothing is committed to git or
     uploaded anywhere; only summarized data is ever handed to the AI (see pipeline).

   Storage keys:
     apex.profile.items        -> array of profile records (the memory)
     apex.logs.profileAudit    -> append-only audit of what changed & why

   Testable in Node with a localStorage shim: this module imports ONLY storage.js
   (no AI / DOM), so the AI-driven parts live in pipeline.js instead.
   ============================================================================ */

import { getItem, setItem, ensureSeeded, appendLog } from "./storage.js";

const ITEMS_KEY = "profile.items";
const AUDIT_KEY = "logs.profileAudit";

/* status vocabulary — how sure/what-kind each value is */
export const STATUS = {
  FACT: "confirmed_user_fact",
  PREFERENCE: "user_preference",
  GOAL: "user_goal",
  MEASUREMENT: "user_reported_measurement",
  IMPORTED: "imported_measurement",
  ESTIMATE: "working_estimate",
  RECOMMENDATION: "coach_recommendation",
  UNKNOWN: "unknown",
  ARCHIVED: "archived",
};

const nowIso = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);
let _seq = 0;
const uid = () => "p_" + Date.now().toString(36) + "_" + (_seq++).toString(36);

function makeItem(o) {
  const t = nowIso();
  return {
    id: uid(),
    category: o.category,
    field: o.field,
    value: o.value,
    unit: o.unit ?? null,
    status: o.status ?? STATUS.UNKNOWN,
    source: o.source ?? "seed",
    confidence: o.confidence ?? null,
    created: t,
    updated: t,
    effective_date: o.effective_date ?? null,
    confirmed: o.confirmed ?? false,
    active: o.active ?? true,
    notes: o.notes ?? null,
  };
}

/* ---------------------------------------------------------------------------
   SEED — the initial profile from the brief. Facts are facts; calorie/macro
   targets are explicitly WORKING ESTIMATES / COACH RECOMMENDATIONS, not facts.
   Unknowns are stored as UNKNOWN, never guessed.
   --------------------------------------------------------------------------- */
function buildSeed() {
  const S = [];
  const add = (o) => S.push(makeItem({ source: "user_provided", ...o }));

  // --- basic confirmed facts ---
  add({ category: "basic", field: "age", value: 21, unit: "years", status: STATUS.FACT, confirmed: true });
  add({ category: "basic", field: "sex", value: "male", status: STATUS.FACT, confirmed: true });
  add({ category: "basic", field: "height", value: 70, unit: "in", status: STATUS.FACT, confirmed: true,
        notes: "5 ft 10 in ≈ 177.8 cm" });

  // --- body weight as a DATED time-series measurement (date not yet confirmed) ---
  add({ category: "measurement", field: "body_weight", value: 165, unit: "lb",
        status: STATUS.MEASUREMENT, confirmed: false, effective_date: null,
        notes: "Initial known weight; measurement date NOT yet confirmed. Recently finished ~82 mi backpacking at Philmont and lost weight on the trip. Do not assume 165 is always current — supersede with a newer dated measurement." });

  // --- primary goal ---
  add({ category: "goal", field: "primary", status: STATUS.GOAL, confirmed: true,
        value: { type: "body_recomposition",
          wants: ["reduce excess body fat gradually", "maintain or gain lean muscle", "get stronger and more athletic", "improve cardio/endurance", "look & perform lean, capable, athletic"],
          avoid: ["becoming much larger", "reaching zero body fat", "crash dieting", "chronic under-fueling", "dehydration", "all-out training every day"],
          style: "demanding but sustainable mix of strength + cardio" } });

  // --- DAIRY ALLERGY (protected, high-risk) ---
  add({ category: "allergy", field: "dairy", status: STATUS.FACT, confirmed: true, source: "user_provided",
        value: { type: "milk_protein_allergy",
          avoid: ["milk", "whey", "whey protein isolate", "whey protein concentrate", "casein", "caseinates", "milk protein", "cheese", "yogurt", "cream", "butter", "ghee", "lactose-free cow's milk"],
          lactose_free_not_safe: true, whey_casein_not_safe: true,
          safe_protein_categories_if_labeled_dairy_free: ["pea protein", "soy protein", "egg-white protein", "pea-and-rice blends"] },
        notes: "Treat as a milk-protein allergy unless the user clarifies otherwise. ALWAYS remind to check the actual ingredient/allergen label (brands & recipes change). Never recommend whey or casein." });
  add({ category: "open_question", field: "dairy_reaction_severity", value: null, status: STATUS.UNKNOWN,
        notes: "Reaction severity not yet documented — do not invent." });
  add({ category: "open_question", field: "dairy_cross_contact_tolerance", value: null, status: STATUS.UNKNOWN });

  // --- nutrition targets: WORKING ESTIMATES / RECOMMENDATIONS, adjustable ---
  add({ category: "nutrition_target", field: "targets", status: STATUS.ESTIMATE, confirmed: false, source: "coach_estimate",
        value: {
          maintenance_kcal: [2600, 3000],
          hard_day:  { kcal: 2775, kcal_range: [2600, 2800], protein_g: [160, 170], fat_g: [70, 80], carb_g: [340, 370] },
          rest_day:  { kcal: 2480, kcal_range: [2400, 2550], protein_g: [160, 170], fat_g: [75, 85], carb_g: [260, 290] },
          weekly_avg_kcal: [2650, 2700],
          protein_g_daily: [160, 170],
          fiber_g_daily: [30, 40],
          hydration_normal_l: [3.0, 3.5],
          hydration_hard_l: [3.5, 4.5] },
        notes: "Initial working estimates, NOT medical facts. Adjustable from real trends (>=7-day, ideally 2-3 wk). Don't push excessive water just to hit a number; electrolytes matter mainly for long/hot/sweaty sessions." });

  // --- supplements ---
  add({ category: "supplement", field: "creatine", status: STATUS.PREFERENCE, confirmed: true,
        value: { name: "creatine monohydrate", dose_g: 5, daily: true, training_and_rest_days: true, loading_phase: false, cycling: false },
        notes: "Track daily adherence. Creatine can shift scale weight — never auto-call that fat gain. Check full allergen label on any flavored/blended creatine (dairy)." });
  add({ category: "supplement", field: "protein_powder", status: STATUS.RECOMMENDATION, confirmed: false,
        value: { optional: true, purpose: "convenience for hitting protein target", only_if: "verified dairy-free (pea/soy/egg-white/pea-rice)" } });
  add({ category: "note", field: "supplements_to_avoid_by_default", status: STATUS.RECOMMENDATION,
        value: ["fat burners", "testosterone boosters", "BCAAs when protein is already sufficient", "large vitamin/mineral stacks", "high-dose calcium/D/zinc/iron/magnesium without a reason"],
        notes: "Track calcium & vitamin D intake (no dairy) but don't assume high-dose supplements are needed." });

  // --- training preferences ---
  add({ category: "training", field: "weekly_structure", status: STATUS.PREFERENCE, confirmed: true,
        value: { sessions: ["3 full-body strength", "1-2 easy aerobic", "1 interval", "1 longer easy endurance (hike/run/bike/swim)", ">=1 full rest or very light day"],
          movement_categories: ["squat or split-squat", "hip hinge", "horizontal or vertical press", "horizontal or vertical pull", "core / loaded carry / functional"],
          principle: "not every workout is all-out; intense enough to progress, sustainable enough to recover" } });
  add({ category: "training", field: "progress_signals", status: STATUS.PREFERENCE,
        value: ["strength performance", "cardio performance", "waist circumference", "progress photos (voluntary)", "energy", "recovery", "sleep", "7-day avg body weight", "training consistency"],
        notes: "Do not judge success from scale weight alone." });

  // --- nutrition adjustment rules (coaching guidance, not auto medical calls) ---
  add({ category: "coaching_rule", field: "nutrition_adjustment", status: STATUS.RECOMMENDATION,
        value: {
          evaluate_over: ">=7-day averages, ideally 2-3 weeks",
          rules: [
            "weight ~stable + waist down + performance up -> hold calories",
            "avg weight dropping >0.5-0.75 lb/wk -> +150-200 kcal (mostly carbs)",
            "weight & waist unchanged ~3 wk -> -150 kcal",
            "weight up >0.5 lb/wk AND waist up -> -100-150 kcal",
            "sleep/mood/energy/strength/recovery/performance down -> add calories or cut training stress BEFORE cutting calories" ],
          never: "change the plan on one scale reading (creatine, sodium, carbs, hydration, soreness, food volume all move it)" } });

  // --- open questions (unknowns — do not guess) ---
  for (const q of ["current_waist_circumference", "current_body_fat_estimate", "exact_weekly_schedule",
                    "available_gym_equipment", "current_sleep_schedule", "current_injuries_or_conditions",
                    "date_of_165lb_measurement"]) {
    add({ category: "open_question", field: q, value: null, status: STATUS.UNKNOWN });
  }

  return S;
}

/* seed once on first load */
ensureSeeded(ITEMS_KEY, buildSeed());

/* ---- low-level access ----------------------------------------------------- */
function load() { return getItem(ITEMS_KEY, []); }
function saveAll(items) { setItem(ITEMS_KEY, items); }
function audit(event, detail = {}) { appendLog(AUDIT_KEY, { ts: nowIso(), event, ...detail }); }

export function allItems() { return load(); }
export function exportAll() {
  return { exported: nowIso(), items: load(), audit: getItem(AUDIT_KEY, []) };
}

/** All records for a field (history included), newest first. */
export function history(category, field) {
  return load()
    .filter((r) => r.category === category && r.field === field)
    .sort((a, b) => (b.effective_date || b.created).localeCompare(a.effective_date || a.created));
}

/** The current (latest active) value record for a category+field. */
export function current(category, field) {
  const h = history(category, field).filter((r) => r.active && r.status !== STATUS.ARCHIVED);
  return h[0] || null;
}

/* ---- writes (all preserve history + audit) -------------------------------- */

/** Add a new dated measurement (weight, waist, body fat, steps, sleep, …).
    Never overwrites — appends a new dated record; the latest becomes "current". */
export function addMeasurement(field, value, unit = null, opts = {}) {
  const items = load();
  const item = makeItem({
    category: opts.category || "measurement", field, value, unit,
    status: opts.status || STATUS.MEASUREMENT,
    source: opts.source || "user_reported",
    effective_date: opts.date || today(),
    confirmed: opts.confirmed ?? false,
    confidence: opts.confidence ?? null,
    notes: opts.notes ?? null,
  });
  items.push(item);
  saveAll(items);
  audit("measurement_added", { field, value, unit, effective_date: item.effective_date, id: item.id });
  return item;
}

/** Set/replace a preference or goal. Archives the prior active record (kept in history). */
export function setPreference(field, value, opts = {}) {
  const items = load();
  for (const r of items) {
    if (r.category === (opts.category || "preference") && r.field === field && r.active) {
      r.active = false; r.status = STATUS.ARCHIVED; r.updated = nowIso();
    }
  }
  const item = makeItem({
    category: opts.category || "preference", field, value,
    status: opts.status || STATUS.PREFERENCE, source: opts.source || "user_provided",
    confirmed: opts.confirmed ?? true, notes: opts.notes ?? null,
  });
  items.push(item);
  saveAll(items);
  audit("preference_set", { field, id: item.id });
  return item;
}

/** Allergies are HIGH-RISK: never silently overwrite. Adding requires explicit=true.
    An attempt to change an existing allergy without explicit confirmation is logged
    and refused (returns {refused:true}). */
export function recordAllergy(field, value, { explicit = false, source = "user_provided", notes = null } = {}) {
  const items = load();
  const existing = items.find((r) => r.category === "allergy" && r.field === field && r.active);
  if (existing && !explicit) {
    audit("allergy_change_refused", { field, reason: "not explicitly confirmed", existingId: existing.id });
    return { refused: true, existing };
  }
  if (existing) { existing.active = false; existing.status = STATUS.ARCHIVED; existing.updated = nowIso(); }
  const item = makeItem({ category: "allergy", field, value, status: STATUS.FACT, source, confirmed: true, notes });
  items.push(item);
  saveAll(items);
  audit("allergy_recorded", { field, id: item.id, explicit });
  return item;
}

export function archiveItem(id) {
  const items = load();
  const r = items.find((x) => x.id === id);
  if (!r) return false;
  r.active = false; r.status = STATUS.ARCHIVED; r.updated = nowIso();
  saveAll(items); audit("archived", { id });
  return true;
}

export function deleteItem(id) {
  const items = load();
  const idx = items.findIndex((x) => x.id === id);
  if (idx < 0) return false;
  items.splice(idx, 1);
  saveAll(items); audit("deleted", { id });
  return true;
}

/* ---- reads / summaries ---------------------------------------------------- */

/** The list of dairy allergens the coach must flag (or [] if none). */
export function getAllergens() {
  const a = current("allergy", "dairy");
  return a?.value?.avoid || [];
}

/** The nutrition targets object (an ESTIMATE), or null. */
export function getTargets() {
  return current("nutrition_target", "targets")?.value || null;
}

/** A simple daily macro/water goal derived from the targets estimate.
    dayType: "hard" | "rest" | "default". Water goal returned in fl oz (imperial). */
export function dailyGoal(dayType = "default") {
  const t = getTargets();
  const mid = (a) => Array.isArray(a) ? Math.round((a[0] + a[1]) / 2) : a;
  if (!t) return { kcal: 2650, protein: 165, carbs: 300, fat: 78, fiber: 35, water_oz: 115 };
  const d = dayType === "hard" ? t.hard_day : dayType === "rest" ? t.rest_day : null;
  const litersToOz = (l) => Math.round(l * 33.814);
  return {
    kcal: d ? (Array.isArray(d.kcal) ? mid(d.kcal) : d.kcal) : mid(t.weekly_avg_kcal),
    protein: mid(t.protein_g_daily),
    carbs: d ? mid(d.carb_g) : 300,
    fat: d ? mid(d.fat_g) : 78,
    fiber: mid(t.fiber_g_daily),
    water_oz: litersToOz((t.hydration_normal_l[0] + t.hydration_normal_l[1]) / 2),
  };
}

/** Current body weight (latest measurement), {value, unit, date} or null. */
export function currentWeight() {
  const w = current("measurement", "body_weight");
  return w ? { value: w.value, unit: w.unit, date: w.effective_date, confirmed: w.confirmed } : null;
}

/** Full dated weight history (newest first). */
export function weightHistory() {
  return history("measurement", "body_weight").map((r) => ({ value: r.value, unit: r.unit, date: r.effective_date, id: r.id }));
}

/** Items updated on/after a date (for "what changed this week"). */
export function changedSince(dateStr) {
  return load().filter((r) => (r.updated || r.created).slice(0, 10) >= dateStr);
}

/** Everything currently unknown (open questions + null-value unknowns). */
export function openQuestions() {
  return load().filter((r) => r.status === STATUS.UNKNOWN || r.category === "open_question")
    .map((r) => r.field);
}

/** Compact one-block brief for the coach's AI context (facts vs estimates labeled). */
export function profileBrief() {
  const parts = [];
  const w = currentWeight();
  const age = current("basic", "age")?.value, sex = current("basic", "sex")?.value, ht = current("basic", "height");
  if (age || sex || ht) parts.push(`Basics: ${[age && age + "y", sex, ht && `${ht.value}in`].filter(Boolean).join(", ")}.`);
  if (w) parts.push(`Weight: ${w.value} ${w.unit}${w.date ? " (" + w.date + ")" : " (date unconfirmed)"} [measurement].`);
  const goal = current("goal", "primary")?.value;
  if (goal) parts.push(`Goal: ${goal.type} — ${goal.wants.slice(0, 3).join(", ")}.`);
  const allergens = getAllergens();
  if (allergens.length) parts.push(`DAIRY ALLERGY (milk-protein) — must avoid: ${allergens.join(", ")}. Never suggest whey/casein; always say to check labels.`);
  const g = dailyGoal();
  parts.push(`Targets [ESTIMATE, adjustable]: ~${g.kcal} kcal, ${g.protein}g protein, ${g.carbs}g carb, ${g.fat}g fat, ${g.fiber}g fiber, ~${g.water_oz} oz water.`);
  const cr = current("supplement", "creatine")?.value;
  if (cr) parts.push(`Creatine ${cr.dose_g}g daily.`);
  return parts.join(" ");
}

/** Human-readable "what do you currently know about me" (for a viewer / chat answer). */
export function summaryText() {
  const lines = [];
  const w = currentWeight();
  lines.push("— Basics —");
  lines.push(`Age ${current("basic","age")?.value ?? "?"}, ${current("basic","sex")?.value ?? "?"}, height ${current("basic","height")?.value ?? "?"} in.`);
  if (w) lines.push(`Current weight: ${w.value} ${w.unit}${w.confirmed ? "" : " (date unconfirmed)"}.`);
  const goal = current("goal", "primary")?.value;
  if (goal) lines.push("— Goal — " + goal.type + ".");
  const al = getAllergens();
  if (al.length) lines.push("— Allergy — dairy (milk protein). Avoid: " + al.join(", ") + ".");
  const g = dailyGoal();
  lines.push(`— Targets (ESTIMATES) — ~${g.kcal} kcal, ${g.protein}g protein, ${g.carbs}g carbs, ${g.fat}g fat, ${g.fiber}g fiber, ~${g.water_oz} oz water.`);
  const oq = openQuestions();
  if (oq.length) lines.push("— Still unknown — " + oq.join(", ") + ".");
  return lines.join("\n");
}
