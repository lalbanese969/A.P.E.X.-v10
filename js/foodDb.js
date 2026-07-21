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

  // --- more proteins (dairy-free) ---
  chicken_thigh:    { unit: "oz",   calories: 52,  protein: 8,   carbs: 0,  fat: 2   },
  ground_turkey:    { unit: "oz",   calories: 43,  protein: 7,   carbs: 0,  fat: 2   },
  deli_turkey:      { unit: "oz",   calories: 30,  protein: 5,   carbs: 1,  fat: 1   },
  turkey_bacon:     { unit: "slice",calories: 30,  protein: 2,   carbs: 0,  fat: 2   },
  bacon:            { unit: "slice",calories: 43,  protein: 3,   carbs: 0,  fat: 3   },
  cod:              { unit: "oz",   calories: 26,  protein: 6,   carbs: 0,  fat: 0   },
  tilapia:          { unit: "oz",   calories: 36,  protein: 7,   carbs: 0,  fat: 1   },
  tofu:             { unit: "oz",   calories: 20,  protein: 2,   carbs: 1,  fat: 1   },
  tempeh:           { unit: "oz",   calories: 54,  protein: 5,   carbs: 3,  fat: 3   },
  edamame:          { unit: "cup",  calories: 188, protein: 18,  carbs: 14, fat: 8   },
  black_beans:      { unit: "cup",  calories: 227, protein: 15,  carbs: 41, fat: 1   },
  chickpeas:        { unit: "cup",  calories: 269, protein: 15,  carbs: 45, fat: 4   },
  lentils:          { unit: "cup",  calories: 230, protein: 18,  carbs: 40, fat: 1   },

  // --- more carbs ---
  oats_dry:         { unit: "cup",  calories: 307, protein: 11,  carbs: 55, fat: 5   },
  oatmeal_cooked:   { unit: "cup",  calories: 150, protein: 5,   carbs: 27, fat: 3   },
  pasta_cooked:     { unit: "cup",  calories: 220, protein: 8,   carbs: 43, fat: 1   },
  flour_tortilla:   { unit: "each", calories: 140, protein: 4,   carbs: 24, fat: 4   },
  corn_tortilla:    { unit: "each", calories: 50,  protein: 1,   carbs: 11, fat: 1   },
  english_muffin:   { unit: "each", calories: 130, protein: 5,   carbs: 25, fat: 1   },
  quinoa_cooked:    { unit: "cup",  calories: 222, protein: 8,   carbs: 39, fat: 4   },
  rice_cake:        { unit: "each", calories: 35,  protein: 1,   carbs: 7,  fat: 0   },
  pretzels:         { unit: "oz",   calories: 108, protein: 3,   carbs: 23, fat: 1   },
  cereal:           { unit: "cup",  calories: 120, protein: 2,   carbs: 27, fat: 1   },
  tortilla_chips:   { unit: "oz",   calories: 140, protein: 2,   carbs: 18, fat: 7   },

  // --- more fruit / veg ---
  avocado:          { unit: "each", calories: 240, protein: 3,   carbs: 12, fat: 22  },
  spinach:          { unit: "cup",  calories: 7,   protein: 1,   carbs: 1,  fat: 0   },
  bell_pepper:      { unit: "each", calories: 25,  protein: 1,   carbs: 6,  fat: 0   },
  tomato:           { unit: "each", calories: 22,  protein: 1,   carbs: 5,  fat: 0   },
  cucumber:         { unit: "each", calories: 45,  protein: 2,   carbs: 11, fat: 0   },
  mushrooms:        { unit: "cup",  calories: 15,  protein: 2,   carbs: 2,  fat: 0   },
  corn:             { unit: "cup",  calories: 130, protein: 5,   carbs: 27, fat: 2   },
  peas:             { unit: "cup",  calories: 118, protein: 8,   carbs: 21, fat: 0   },
  pineapple:        { unit: "cup",  calories: 82,  protein: 1,   carbs: 22, fat: 0   },
  mango:            { unit: "each", calories: 200, protein: 3,   carbs: 50, fat: 1   },
  watermelon:       { unit: "cup",  calories: 46,  protein: 1,   carbs: 11, fat: 0   },

  // --- fats, sauces, condiments (dairy-free) ---
  mayo:             { unit: "tbsp", calories: 90,  protein: 0,   carbs: 0,  fat: 10  },
  ketchup:          { unit: "tbsp", calories: 20,  protein: 0,   carbs: 5,  fat: 0   },
  mustard:          { unit: "tbsp", calories: 10,  protein: 1,   carbs: 1,  fat: 0   },
  soy_sauce:        { unit: "tbsp", calories: 10,  protein: 1,   carbs: 1,  fat: 0   },
  hoisin_sauce:     { unit: "tbsp", calories: 35,  protein: 1,   carbs: 7,  fat: 1   },
  teriyaki:         { unit: "tbsp", calories: 15,  protein: 1,   carbs: 3,  fat: 0   },
  bbq_sauce:        { unit: "tbsp", calories: 30,  protein: 0,   carbs: 7,  fat: 0   },
  marinara:         { unit: "cup",  calories: 90,  protein: 3,   carbs: 15, fat: 3   },
  salsa:            { unit: "tbsp", calories: 5,   protein: 0,   carbs: 1,  fat: 0   },
  hot_sauce:        { unit: "tsp",  calories: 1,   protein: 0,   carbs: 0,  fat: 0   },
  honey:            { unit: "tbsp", calories: 64,  protein: 0,   carbs: 17, fat: 0   },
  maple_syrup:      { unit: "tbsp", calories: 52,  protein: 0,   carbs: 13, fat: 0   },
  jam:              { unit: "tbsp", calories: 50,  protein: 0,   carbs: 13, fat: 0   },
  hummus:           { unit: "tbsp", calories: 35,  protein: 1,   carbs: 3,  fat: 2   },
  guacamole:        { unit: "tbsp", calories: 25,  protein: 0,   carbs: 2,  fat: 2   },
  coconut_oil:      { unit: "tbsp", calories: 117, protein: 0,   carbs: 0,  fat: 14  },

  // --- nuts / snacks ---
  almonds:          { unit: "oz",   calories: 164, protein: 6,   carbs: 6,  fat: 14  },
  peanuts:          { unit: "oz",   calories: 161, protein: 7,   carbs: 5,  fat: 14  },
  cashews:          { unit: "oz",   calories: 157, protein: 5,   carbs: 9,  fat: 12  },
  beef_jerky:       { unit: "oz",   calories: 116, protein: 9,   carbs: 3,  fat: 7   },
  protein_bar:      { unit: "each", calories: 210, protein: 20,  carbs: 22, fat: 7   },
  dark_chocolate:   { unit: "oz",   calories: 170, protein: 2,   carbs: 13, fat: 12  },
  popcorn:          { unit: "cup",  calories: 31,  protein: 1,   carbs: 6,  fat: 0   },
  trail_mix:        { unit: "oz",   calories: 140, protein: 4,   carbs: 13, fat: 9   },

  // --- beverages (dairy-free) ---
  orange_juice:     { unit: "cup",  calories: 112, protein: 2,   carbs: 26, fat: 0   },
  almond_milk:      { unit: "cup",  calories: 40,  protein: 1,   carbs: 2,  fat: 3   },
  oat_milk:         { unit: "cup",  calories: 120, protein: 3,   carbs: 16, fat: 5   },
  soda:             { unit: "can",  calories: 140, protein: 0,   carbs: 39, fat: 0   },
  sports_drink:     { unit: "cup",  calories: 80,  protein: 0,   carbs: 21, fat: 0   },
  pea_protein_shake:{ unit: "scoop",calories: 120, protein: 24,  carbs: 3,  fat: 2   },
  coffee:           { unit: "cup",  calories: 2,   protein: 0,   carbs: 0,  fat: 0   },

  // --- breakfast ---
  pancake:          { unit: "each", calories: 90,  protein: 2,   carbs: 15, fat: 3   },
  waffle:           { unit: "each", calories: 100, protein: 2,   carbs: 15, fat: 3   },
  hash_browns:      { unit: "cup",  calories: 200, protein: 2,   carbs: 25, fat: 11  },

  belvita_chocolate_sandwich: { unit: "pack", calories: 230, protein: 3, carbs: 27, fat: 8 },
};

// short spoken names -> db key (the coach also knows these)
export const FOOD_ALIASES = {
  chicken: "chicken_breast", turkey: "turkey_breast", steak: "sirloin_steak",
  beef: "ground_beef_90_10", "ground beef": "ground_beef_90_10", hamburger: "ground_beef_90_10",
  "ground turkey": "ground_turkey", "deli turkey": "deli_turkey", "turkey slices": "deli_turkey",
  pork: "pork_tenderloin", rice: "white_rice_cooked", potato: "russet_potato", bread: "white_bread",
  eggs: "egg", "egg whites": "egg_white", pb: "peanut_butter", belvita: "belvita_chocolate_sandwich",
  oats: "oats_dry", oatmeal: "oatmeal_cooked", pasta: "pasta_cooked", tortilla: "flour_tortilla",
  wrap: "flour_tortilla", quinoa: "quinoa_cooked", chips: "tortilla_chips", beans: "black_beans",
  oj: "orange_juice", "protein shake": "pea_protein_shake", "protein powder": "pea_protein_shake",
  shake: "pea_protein_shake", hoisin: "hoisin_sauce",
};

/** Full per-value reference block (kept for debugging / future use). */
export function foodDbPromptBlock() {
  return Object.entries(FOOD_DB)
    .map(([k, v]) => `${k.replace(/_/g, " ")} (per ${v.unit}): ${v.calories} kcal, ${v.protein}p, ${v.carbs}c, ${v.fat}f`)
    .join("\n");
}

/** Just the food NAMES — the app computes exact nutrition from the DB in code, so the
    AI only needs to pick a matching name (keeps the prompt small). */
export function foodDbNames() {
  return Object.keys(FOOD_DB).map((k) => k.replace(/_/g, " ")).join(", ");
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
