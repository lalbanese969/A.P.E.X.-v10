/* ============================================================================
   [MODULE: foodDb.js]
   A.P.E.X. default nutrition database (USDA-based, per base unit). These are the
   REFERENCE values fed to the coach so its estimates are accurate and consistent
   (e.g. turkey breast is ~9g protein/oz, not 100g). The AI multiplies by the
   quantity the user gives, assumes COOKED weight for meats unless told raw, and
   rounds to whole numbers.

   Precedence at log time: a food you've CORRECTED (in food memory) > this database
   > a fresh AI estimate. Edit freely — it's just data.
   ============================================================================ */

export const FOOD_DB = {
  // --- meats: LEAN cuts, cooked, per oz (minimal fat assumed unless a fattier cut
  //     like ribeye or 80/20 is named). "turkey"/"steak"/"beef" default to these. ---
  chicken_breast:   { unit: "oz",   calories: 47,  protein: 9,   carbs: 0,  fat: 1   },
  turkey_breast:    { unit: "oz",   calories: 38,  protein: 9,   carbs: 0,  fat: 1   },
  ground_beef_90_10:{ unit: "oz",   calories: 50,  protein: 8,   carbs: 0,  fat: 2   },
  ground_beef_80_20:{ unit: "oz",   calories: 72,  protein: 5,   carbs: 0,  fat: 6   },
  sirloin_steak:    { unit: "oz",   calories: 49,  protein: 9,   carbs: 0,  fat: 2   },
  ribeye_steak:     { unit: "oz",   calories: 83,  protein: 7,   carbs: 0,  fat: 6   },
  pork_tenderloin:  { unit: "oz",   calories: 41,  protein: 8,   carbs: 0,  fat: 1   },
  pork_chop:        { unit: "oz",   calories: 52,  protein: 8,   carbs: 0,  fat: 2   },
  ham:              { unit: "oz",   calories: 34,  protein: 6,   carbs: 1,  fat: 1   },
  salmon:           { unit: "oz",   calories: 52,  protein: 8,   carbs: 0,  fat: 2   },
  tuna:             { unit: "oz",   calories: 33,  protein: 7,   carbs: 0,  fat: 0   },
  shrimp:           { unit: "oz",   calories: 28,  protein: 6,   carbs: 0,  fat: 0   },
  egg:              { unit: "each", calories: 70,  protein: 6,   carbs: 0,  fat: 5   },
  egg_white:        { unit: "each", calories: 17,  protein: 4,   carbs: 0,  fat: 0   },
  white_rice_cooked:{ unit: "cup",  calories: 205, protein: 4,   carbs: 45, fat: 0   },
  brown_rice_cooked:{ unit: "cup",  calories: 216, protein: 5,   carbs: 45, fat: 2   },
  fried_rice:       { unit: "cup",  calories: 330, protein: 8,   carbs: 40, fat: 15  },
  baby_potato:      { unit: "each", calories: 25,  protein: 0.5, carbs: 6,  fat: 0   },
  russet_potato:    { unit: "100g", calories: 93,  protein: 2.5, carbs: 21, fat: 0   },
  sweet_potato:     { unit: "100g", calories: 86,  protein: 1.6, carbs: 20, fat: 0   },
  white_bread:      { unit: "slice",calories: 80,  protein: 3,   carbs: 15, fat: 1   },
  wheat_bread:      { unit: "slice",calories: 80,  protein: 4,   carbs: 13, fat: 1   },
  bagel:            { unit: "each", calories: 280, protein: 11,  carbs: 56, fat: 2   },
  hamburger_bun:    { unit: "each", calories: 150, protein: 5,   carbs: 28, fat: 2   },
  peanut_butter:    { unit: "tbsp", calories: 95,  protein: 4,   carbs: 3,  fat: 8   },
  almond_butter:    { unit: "tbsp", calories: 98,  protein: 3,   carbs: 3,  fat: 9   },
  olive_oil:        { unit: "tbsp", calories: 119, protein: 0,   carbs: 0,  fat: 14  },
  butter:           { unit: "tbsp", calories: 102, protein: 0,   carbs: 0,  fat: 12  },
  sesame_oil:       { unit: "tsp",  calories: 40,  protein: 0,   carbs: 0,  fat: 4.5 },
  banana:           { unit: "each", calories: 105, protein: 1,   carbs: 27, fat: 0   },
  apple:            { unit: "each", calories: 95,  protein: 0,   carbs: 25, fat: 0   },
  orange:           { unit: "each", calories: 62,  protein: 1,   carbs: 15, fat: 0   },
  strawberry:       { unit: "each", calories: 4,   protein: 0,   carbs: 1,  fat: 0   },
  blueberries:      { unit: "cup",  calories: 84,  protein: 1,   carbs: 21, fat: 0   },
  grapes:           { unit: "cup",  calories: 104, protein: 1,   carbs: 27, fat: 0   },
  broccoli:         { unit: "cup",  calories: 31,  protein: 3,   carbs: 6,  fat: 0   },
  green_beans:      { unit: "cup",  calories: 31,  protein: 2,   carbs: 7,  fat: 0   },
  carrot:           { unit: "each", calories: 25,  protein: 1,   carbs: 6,  fat: 0   },
  onion:            { unit: "100g", calories: 40,  protein: 1,   carbs: 9,  fat: 0   },
  green_onion:      { unit: "stalk",calories: 5,   protein: 0,   carbs: 1,  fat: 0   },
  belvita_chocolate_sandwich: { unit: "pack", calories: 230, protein: 3, carbs: 27, fat: 8 },
};

// short spoken names -> db key (the coach also knows these)
export const FOOD_ALIASES = {
  chicken: "chicken_breast", turkey: "turkey_breast", steak: "sirloin_steak",
  beef: "ground_beef_90_10", "ground beef": "ground_beef_90_10", hamburger: "ground_beef_90_10",
  pork: "pork_tenderloin", rice: "white_rice_cooked", potato: "russet_potato", bread: "white_bread",
  eggs: "egg", "egg whites": "egg_white", pb: "peanut_butter", belvita: "belvita_chocolate_sandwich",
};

/** Compact reference block to drop into the AI prompt. */
export function foodDbPromptBlock() {
  return Object.entries(FOOD_DB)
    .map(([k, v]) => `${k.replace(/_/g, " ")} (per ${v.unit}): ${v.calories} kcal, ${v.protein}p, ${v.carbs}c, ${v.fat}f`)
    .join("\n");
}

// same precise key as nutrition.js: drop articles + trailing plural "s" per word
const _key = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ")
  .replace(/\b(a|an|the|some|of|my|his|her|our)\b/g, " ").trim()
  .split(/\s+/).filter(Boolean).map((w) => w.replace(/s$/, "")).join(" ");

/** Look up a spoken food name against the database (aliases + exact + token overlap).
    Returns { key, unit, calories, protein, carbs, fat, fiber } per ONE base unit, or null.
    This is used to compute nutrition IN CODE (per-unit × qty), so the AI never has to
    do the multiplication (which is where it went wrong: "10 oz turkey" -> 4200 kcal). */
export function lookupFood(name) {
  const k = _key(name);
  if (!k) return null;
  const pack = (key) => { const v = FOOD_DB[key]; return { key, unit: v.unit, calories: v.calories, protein: v.protein, carbs: v.carbs, fat: v.fat, fiber: 0 }; };

  // 1) alias exact
  for (const [al, key] of Object.entries(FOOD_ALIASES)) if (_key(al) === k) return pack(key);
  // 2) db key exact
  for (const key of Object.keys(FOOD_DB)) if (_key(key.replace(/_/g, " ")) === k) return pack(key);
  // 3) best token overlap where one name's tokens fully contain the other's
  const kt = new Set(k.split(" "));
  let best = null, bestScore = 0;
  for (const key of Object.keys(FOOD_DB)) {
    const dt = new Set(_key(key.replace(/_/g, " ")).split(" "));
    const inter = [...dt].filter((x) => kt.has(x)).length;
    if ((inter === dt.size || inter === kt.size) && inter > bestScore) { best = key; bestScore = inter; }
  }
  for (const [al, key] of Object.entries(FOOD_ALIASES)) {
    const at = new Set(_key(al).split(" "));
    const inter = [...at].filter((x) => kt.has(x)).length;
    if (inter === at.size && inter > bestScore) { best = key; bestScore = inter; }
  }
  return best ? pack(best) : null;
}
