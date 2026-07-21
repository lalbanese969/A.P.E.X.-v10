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
  chicken_breast:   { unit: "oz",   calories: 47,  protein: 9,   carbs: 0,  fat: 1   },
  turkey_breast:    { unit: "oz",   calories: 42,  protein: 9,   carbs: 0,  fat: 1   },
  ground_beef_90_10:{ unit: "oz",   calories: 56,  protein: 7,   carbs: 0,  fat: 3   },
  ground_beef_80_20:{ unit: "oz",   calories: 72,  protein: 5,   carbs: 0,  fat: 6   },
  sirloin_steak:    { unit: "oz",   calories: 58,  protein: 8,   carbs: 0,  fat: 3   },
  ribeye_steak:     { unit: "oz",   calories: 83,  protein: 7,   carbs: 0,  fat: 6   },
  pork_tenderloin:  { unit: "oz",   calories: 41,  protein: 8,   carbs: 0,  fat: 1   },
  pork_chop:        { unit: "oz",   calories: 58,  protein: 7,   carbs: 0,  fat: 3   },
  ham:              { unit: "oz",   calories: 46,  protein: 6,   carbs: 1,  fat: 2   },
  salmon:           { unit: "oz",   calories: 59,  protein: 6,   carbs: 0,  fat: 4   },
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
  "ground beef": "ground_beef_90_10", hamburger: "ground_beef_90_10", pork: "pork_tenderloin",
  rice: "white_rice_cooked", potato: "russet_potato", bread: "white_bread",
  eggs: "egg", "egg whites": "egg_white", pb: "peanut_butter", belvita: "belvita_chocolate_sandwich",
};

/** Compact reference block to drop into the AI prompt. */
export function foodDbPromptBlock() {
  return Object.entries(FOOD_DB)
    .map(([k, v]) => `${k.replace(/_/g, " ")} (per ${v.unit}): ${v.calories} kcal, ${v.protein}p, ${v.carbs}c, ${v.fat}f`)
    .join("\n");
}
