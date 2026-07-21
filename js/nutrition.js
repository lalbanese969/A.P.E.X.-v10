/* ============================================================================
   [MODULE: nutrition.js]
   Food memory + daily logging + reusable recipes/meal templates — the nutrition
   half of Apex's personal-assistant memory. Same localStorage store as everything
   else (storage.js, "apex." namespace). Imports ONLY storage.js so it's testable
   in Node (the AI estimation lives in pipeline.js).

   FOOD MEMORY is the key idea: once a food's macros are known, Apex remembers them
   so logging the same thing again is CONSISTENT (and free of a re-estimate). Foods
   are matched by normalized name/alias.

   Storage keys:
     apex.nutrition.foods        -> remembered foods [{name, per, calories, macros, ...}]
     apex.nutrition.recipes      -> saved recipes / meal templates
     apex.nutrition.log.<date>   -> that day's log { foods[], water_oz, creatine, ... }
   ============================================================================ */

import { getItem, setItem, ensureSeeded, removeItem } from "./storage.js";

const FOODS_KEY = "nutrition.foods";
const RECIPES_KEY = "nutrition.recipes";
const dayKey = (d) => `nutrition.log.${d}`;

const nowIso = () => new Date().toISOString();
export const todayStr = () => new Date().toISOString().slice(0, 10);
let _seq = 0;
const uid = (p) => p + Date.now().toString(36) + (_seq++).toString(36);
const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
// A precise match key: drop articles + trailing plural "s" per word. So "a banana",
// "banana", "bananas" all key to "banana" — but "ham" ("ham") ≠ "ham rolls" ("ham roll"),
// which stops a plain "ham" from wrongly matching (and poisoning) "ham rolls".
const ARTICLES = /\b(a|an|the|some|of|my|his|her|our)\b/g;
const keyOf = (s) => norm(s).replace(ARTICLES, " ").replace(/\s+/g, " ").trim()
  .split(" ").filter(Boolean).map((w) => w.replace(/s$/, "")).join(" ");

const ZERO = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0 };
const MACROS = ["calories", "protein", "carbs", "fat", "fiber", "sodium"];
function addMacros(a, b, mult = 1) {
  const out = {};
  for (const k of MACROS) out[k] = Math.round(((a[k] || 0) + (b[k] || 0) * mult) * 10) / 10;
  return out;
}

/* ---------------------------------------------------------------------------
   SEED — the two favorite meal templates. Totals are COMPUTED from ingredients
   (never hard-coded), each ingredient carries its own macros + raw/cooked flag,
   and everything is marked as an estimate until real labels/amounts are entered.
   --------------------------------------------------------------------------- */
function ing(name, qty, unit, m, extra = {}) {
  return { name, amount: { qty, unit }, grams: extra.grams ?? null, raw_or_cooked: extra.raw_or_cooked ?? null,
           source: extra.source ?? "estimate", ...m };
}
function buildRecipeSeed() {
  return [
    {
      id: "recipe_breakfast_sandwiches",
      name: "Two breakfast sandwiches",
      aliases: ["breakfast sandwich", "breakfast sandwiches", "egg sandwich"],
      servings: 2, source: "estimate", dairy_free: true,
      notes: "Both sandwiches combined. Target ~1000 kcal — but recompute from actual bread/eggs/turkey bacon/oil. Often ~60-75 g protein.",
      ingredients: [
        ing("Eggs", 7, "eggs", { calories: 490, protein: 42, carbs: 3, fat: 33, fiber: 0, sodium: 490 }),
        ing("Turkey bacon", 6, "slices", { calories: 180, protein: 18, carbs: 2, fat: 12, fiber: 0, sodium: 1080 }),
        ing("Bread (dairy-free)", 4, "slices", { calories: 320, protein: 12, carbs: 60, fat: 4, fiber: 4, sodium: 560 }),
        ing("Cooking oil", 1, "tbsp", { calories: 120, protein: 0, carbs: 0, fat: 14, fiber: 0, sodium: 0 }),
      ],
    },
    {
      id: "recipe_pork_fried_rice",
      name: "Pork tenderloin fried rice",
      aliases: ["pork fried rice", "fried rice", "pork rice"],
      servings: 2, source: "estimate", dairy_free: true,
      notes: "Whole batch. A practical serving is ~half. Track oils & sauces separately. Ask/record if pork was weighed raw or cooked. Check packaged sauces/marinades for milk.",
      ingredients: [
        ing("Pork tenderloin", 12, "oz", { calories: 425, protein: 79, carbs: 0, fat: 11, fiber: 0, sodium: 220 }, { raw_or_cooked: "unknown" }),
        ing("Jasmine rice (boil-in-bag)", 1, "bag", { calories: 350, protein: 7, carbs: 77, fat: 1, fiber: 1, sodium: 0 }),
        ing("Olive oil", 1, "tbsp", { calories: 120, protein: 0, carbs: 0, fat: 14, fiber: 0, sodium: 0 }),
        ing("Sesame oil", 1, "tsp", { calories: 40, protein: 0, carbs: 0, fat: 4.5, fiber: 0, sodium: 0 }),
        ing("Soy sauce", 2, "tbsp", { calories: 20, protein: 3, carbs: 2, fat: 0, fiber: 0, sodium: 1720 }),
        ing("Hoisin sauce", 1, "tbsp", { calories: 35, protein: 0.5, carbs: 7, fat: 0.5, fiber: 0.5, sodium: 260 }),
        ing("Green onions", 2, "stalks", { calories: 10, protein: 0.5, carbs: 2, fat: 0, fiber: 1, sodium: 5 }),
      ],
    },
  ];
}
ensureSeeded(RECIPES_KEY, buildRecipeSeed());

/* ---- recipes / meal templates -------------------------------------------- */
export function recipes() { return getItem(RECIPES_KEY, []); }
export function getRecipe(id) { return recipes().find((r) => r.id === id) || null; }

/** Sum a recipe's ingredients -> total + per-serving macros. Editing one
    ingredient and recomputing never requires rebuilding the whole recipe. */
export function recipeTotals(recipe) {
  let total = { ...ZERO };
  for (const it of recipe.ingredients || []) total = addMacros(total, it);
  const servings = recipe.servings || 1;
  const perServing = {};
  for (const k of MACROS) perServing[k] = Math.round((total[k] / servings) * 10) / 10;
  return { total, servings, perServing };
}

export function saveRecipe(recipe) {
  const list = recipes();
  const idx = list.findIndex((r) => r.id === recipe.id);
  recipe.updated = nowIso();
  if (idx >= 0) list[idx] = recipe; else { recipe.id = recipe.id || uid("recipe_"); list.push(recipe); }
  setItem(RECIPES_KEY, list);
  return recipe;
}

/* ---- food memory ---------------------------------------------------------- */
export function foods() { return getItem(FOODS_KEY, []); }

/** Find a remembered food by name or code word — PRECISE (key-based) match only,
    so "ham rolls" no longer collides with a saved "ham". */
export function findFood(name) {
  const k = keyOf(name);
  if (!k) return null;
  const list = foods();
  return list.find((f) => keyOf(f.name) === k)
      || list.find((f) => (f.aliases || []).some((a) => keyOf(a) === k))
      || null;
}

/** Remember a food's macros so future logs are consistent. Dedupes by name OR
    alias/code word (bumps the existing record instead of duplicating). */
export function rememberFood(food) {
  const list = foods();
  const idx = findIndexFor(list, food.name, food.aliases || []);
  const existing = idx >= 0 ? list[idx] : null;
  if (existing) {
    // keep known good macros; fill any gaps; bump usage
    for (const k of MACROS) if (existing[k] == null && food[k] != null) existing[k] = food[k];
    if (food.per && !existing.per) existing.per = food.per;
    existing.timesLogged = (existing.timesLogged || 0) + 1;
    existing.lastUsed = nowIso();
    setItem(FOODS_KEY, list);
    return existing;
  }
  const rec = {
    id: uid("food_"), name: food.name, aliases: food.aliases || [],
    per: food.per || null,           // e.g. { qty:1, unit:"sandwich" } the macros are "per"
    calories: food.calories ?? 0, protein: food.protein ?? 0, carbs: food.carbs ?? 0,
    fat: food.fat ?? 0, fiber: food.fiber ?? 0, sodium: food.sodium ?? 0,
    dairy: !!food.dairy, source: food.source || "user", confidence: food.confidence ?? null,
    timesLogged: 1, created: nowIso(), lastUsed: nowIso(),
  };
  list.push(rec);
  setItem(FOODS_KEY, list);
  return rec;
}

/* Find the index of a remembered food matching any of these names/aliases (key-based). */
function findIndexFor(list, name, aliases = []) {
  const keys = [name, ...(aliases || [])].map(keyOf).filter(Boolean);
  if (!keys.length) return -1;
  return list.findIndex((f) => keys.includes(keyOf(f.name)) || (f.aliases || []).some((a) => keys.includes(keyOf(a))));
}

/** Upsert a food with EXPLICIT macros/aliases (used to teach or correct a food).
    Unlike rememberFood (which only fills gaps), this overrides the provided fields. */
export function setFood(food) {
  const list = foods();
  const i = findIndexFor(list, food.name, food.aliases || []);
  if (i >= 0) {
    const ex = list[i];
    for (const k of MACROS) if (food[k] != null) ex[k] = food[k];
    if (food.aliases) ex.aliases = [...new Set([...(ex.aliases || []), ...food.aliases])];
    if (food.per) ex.per = food.per;
    if (food.dairy != null) ex.dairy = !!food.dairy;
    if (food.source) ex.source = food.source;
    if (food.confidence != null) ex.confidence = food.confidence;
    ex.lastUsed = nowIso();
    setItem(FOODS_KEY, list);
    return ex;
  }
  const rec = {
    id: uid("food_"), name: food.name, aliases: food.aliases || [], per: food.per || null,
    calories: food.calories ?? 0, protein: food.protein ?? 0, carbs: food.carbs ?? 0,
    fat: food.fat ?? 0, fiber: food.fiber ?? 0, sodium: food.sodium ?? 0,
    dairy: !!food.dairy, source: food.source || "user", confidence: food.confidence ?? null,
    timesLogged: 0, created: nowIso(), lastUsed: nowIso(),
  };
  list.push(rec);
  setItem(FOODS_KEY, list);
  return rec;
}

/** Teach a code word: `alias` now also refers to the food named `foodName`. */
export function addAlias(foodName, alias) {
  const list = foods();
  const i = findIndexFor(list, foodName);
  if (i < 0) return null;
  const a = String(alias || "").trim();
  if (a && !(list[i].aliases || []).some((x) => norm(x) === norm(a))) {
    list[i].aliases = [...(list[i].aliases || []), a];
    list[i].lastUsed = nowIso();
    setItem(FOODS_KEY, list);
  }
  return list[i];
}

/** Correct a food's macros (user-confirmed): update the remembered food AND fix any
    of today's log entries that used it. `per` holds only the macros to change (per unit). */
export function correctLoggedFood(nameOrAlias, per, d = todayStr()) {
  const list0 = foods();
  const idx = findIndexFor(list0, nameOrAlias);
  const canonical = idx >= 0 ? list0[idx].name : nameOrAlias;
  const food = setFood({ name: canonical, ...per, source: "user_confirmed", confidence: 1 });
  const names = [food.name, ...(food.aliases || []), nameOrAlias].map(norm);
  const day = getDay(d);
  let changed = 0;
  for (const e of day.foods) {
    if (names.includes(norm(e.name))) {
      const qty = e.qty || 1;
      for (const k of MACROS) if (per[k] != null) e[k] = Math.round(per[k] * qty);
      e.source = "user_confirmed";
      changed++;
    }
  }
  if (changed) saveDay(day);
  return { food, entriesUpdated: changed };
}

/* Pending "unknown food" the coach asked to confirm (so a follow-up correction can resolve "it"). */
export function setPending(p) { setItem("nutrition.pending", p); }
export function getPending() { return getItem("nutrition.pending", null); }

/* ---- daily log ------------------------------------------------------------ */
function freshDay(d) {
  return { date: d, foods: [], water_oz: 0, creatine: false, supplements: [], notes: [] };
}
export function getDay(d = todayStr()) { return getItem(dayKey(d), freshDay(d)); }
function saveDay(day) { setItem(dayKey(day.date), day); }

/** Log a food entry (already has macros). `qty` multiplies the stored macros.
    Also remembers the food (so next time it's consistent). Returns the entry. */
export function logFood(entry, d = todayStr()) {
  const day = getDay(d);
  const qty = entry.qty ?? 1;
  const e = {
    id: uid("log_"), name: entry.name, qty, unit: entry.unit || null,
    calories: Math.round((entry.calories || 0) * qty),
    protein: Math.round((entry.protein || 0) * qty),
    carbs: Math.round((entry.carbs || 0) * qty),
    fat: Math.round((entry.fat || 0) * qty),
    fiber: Math.round((entry.fiber || 0) * qty),
    sodium: Math.round((entry.sodium || 0) * qty),
    source: entry.source || "user", confidence: entry.confidence ?? null,
    recipeId: entry.recipeId || null, ts: nowIso(),
  };
  day.foods.push(e);
  saveDay(day);
  if (entry.remember !== false) {
    rememberFood({ name: entry.name, calories: entry.calories, protein: entry.protein, carbs: entry.carbs,
      fat: entry.fat, fiber: entry.fiber, sodium: entry.sodium, per: entry.unit ? { qty: 1, unit: entry.unit } : null,
      source: entry.source, confidence: entry.confidence, dairy: entry.dairy });
  }
  return e;
}

export function logWater(oz, d = todayStr()) {
  const day = getDay(d);
  day.water_oz = Math.max(0, (day.water_oz || 0) + oz);
  saveDay(day);
  return day.water_oz;
}
export function setWater(oz, d = todayStr()) { const day = getDay(d); day.water_oz = Math.max(0, oz); saveDay(day); return day.water_oz; }
export function setCreatine(taken, d = todayStr()) { const day = getDay(d); day.creatine = !!taken; saveDay(day); return day.creatine; }

/** Remove a logged food entry by id (undo). */
export function removeFoodEntry(id, d = todayStr()) {
  const day = getDay(d);
  const before = day.foods.length;
  day.foods = day.foods.filter((f) => f.id !== id);
  saveDay(day);
  return day.foods.length < before;
}

function matchKeys(nameOrAlias) {
  const f = findFood(nameOrAlias);
  return [nameOrAlias, ...(f ? [f.name, ...(f.aliases || [])] : [])].map(keyOf);
}

/** Today's log entries matching a food name or its code word (used to decide if a
    removal is ambiguous — more than one entry — so the coach can ask first). */
export function findLoggedByName(nameOrAlias, d = todayStr()) {
  const keys = matchKeys(nameOrAlias);
  return getDay(d).foods.filter((e) => keys.includes(keyOf(e.name)));
}

/** Remove ALL today's entries matching a food name/code word ("remove all the ham"). */
export function removeFoodByName(nameOrAlias, d = todayStr()) {
  const day = getDay(d);
  const before = day.foods.length;
  const keys = matchKeys(nameOrAlias);
  day.foods = day.foods.filter((e) => !keys.includes(keyOf(e.name)));
  const removed = before - day.foods.length;
  if (removed) saveDay(day);
  return removed;
}

/** Remove only the MOST RECENT matching entry (the safe default for "remove the X"). */
export function removeOneFoodByName(nameOrAlias, d = todayStr()) {
  const day = getDay(d);
  const keys = matchKeys(nameOrAlias);
  for (let i = day.foods.length - 1; i >= 0; i--) {
    if (keys.includes(keyOf(day.foods[i].name))) { day.foods.splice(i, 1); saveDay(day); return 1; }
  }
  return 0;
}

/** Wipe today's log back to empty (food, water, creatine). For "clear today". */
export function clearDay(d = todayStr()) {
  setItem(dayKey(d), freshDay(d));
  return getDay(d);
}

/** Edit a logged entry in place. `patch` may set name/qty/unit and the entry's TOTAL
    macros (calories/protein/carbs/fat/fiber for the whole entry). Returns the entry. */
export function updateFoodEntry(id, patch, d = todayStr()) {
  const day = getDay(d);
  const e = day.foods.find((f) => f.id === id);
  if (!e) return null;
  if (patch.name != null && String(patch.name).trim()) e.name = String(patch.name).trim();
  if (patch.qty != null) e.qty = Number(patch.qty) || 1;
  if (patch.unit !== undefined) e.unit = patch.unit || null;
  for (const k of MACROS) if (patch[k] != null) e[k] = Math.max(0, Math.round(+patch[k] || 0));
  e.source = "user_edited";
  saveDay(day);
  return e;
}

/** Learn a food's PER-UNIT nutrition from an (edited) entry, so future logs of it are
    accurate and consistent. Divides the entry's totals by its qty and saves to memory. */
export function learnFromEntry(entry) {
  const qty = entry.qty || 1;
  const food = { name: entry.name, per: { qty: 1, unit: entry.unit || null }, source: "user_confirmed", confidence: 1 };
  for (const k of MACROS) food[k] = Math.round((entry[k] || 0) / qty);
  return setFood(food);
}

/* Pending CONFIRMATION: a parsed nutrition action we asked the user to confirm before
   applying (keeps it from being "jumpy"). Resolved by their next yes/no/"all"/"one". */
export function setPendingAction(a) { setItem("nutrition.pendingAction", a); }
export function getPendingAction() { return getItem("nutrition.pendingAction", null); }
export function clearPendingAction() { removeItem("nutrition.pendingAction"); }

/** Totals for a day: summed macros + water. */
export function dayTotals(d = todayStr()) {
  const day = getDay(d);
  let m = { ...ZERO };
  for (const f of day.foods) m = addMacros(m, f);
  return { ...m, water_oz: day.water_oz || 0, creatine: !!day.creatine, entries: day.foods.length };
}
