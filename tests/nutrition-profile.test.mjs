/* ============================================================================
   Node test for the profile + nutrition memory (no deps, no browser).
   Run:  node tests/nutrition-profile.test.mjs
   Uses a tiny in-memory localStorage shim so the modules run outside a browser.
   ============================================================================ */

// --- localStorage shim (must exist BEFORE importing the modules, which seed on load) ---
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const profile = await import("../js/profile.js");
const nutrition = await import("../js/nutrition.js");

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✗ " + name); } }
function eq(name, a, b) { ok(name + ` (${JSON.stringify(a)} == ${JSON.stringify(b)})`, JSON.stringify(a) === JSON.stringify(b)); }

console.log("\n[1] Historical weight preservation");
{
  const before = profile.currentWeight();
  ok("seed weight is 165 lb", before && before.value === 165);
  profile.addMeasurement("body_weight", 162, "lb", { date: "2026-07-25" });
  const hist = profile.weightHistory();
  ok("history keeps BOTH 165 and 162", hist.some(w => w.value === 165) && hist.some(w => w.value === 162));
  eq("current weight is now the newest (162)", profile.currentWeight().value, 162);
  ok("history is not destructive (>=2 entries)", hist.length >= 2);
}

console.log("\n[2] Allergy field is protected");
{
  const before = profile.getAllergens();
  ok("dairy allergens seeded (includes whey & casein)", before.includes("whey") && before.includes("casein"));
  const res = profile.recordAllergy("dairy", { type: "none" }, { explicit: false });
  ok("changing an allergy WITHOUT explicit=true is refused", res && res.refused === true);
  eq("allergen list unchanged after refused attempt", profile.getAllergens(), before);
}

console.log("\n[3] Facts vs estimates are distinguished");
{
  const age = profile.current("basic", "age");
  const targets = profile.current("nutrition_target", "targets");
  eq("age is a confirmed_user_fact", age.status, profile.STATUS.FACT);
  ok("age.confirmed === true", age.confirmed === true);
  eq("calorie/macro targets are a working_estimate", targets.status, profile.STATUS.ESTIMATE);
  ok("targets.confirmed === false (NOT a fact)", targets.confirmed === false);
}

console.log("\n[4] Recipe serving calculations");
{
  const bfast = nutrition.getRecipe("recipe_breakfast_sandwiches");
  const t = nutrition.recipeTotals(bfast);
  eq("breakfast total kcal = sum of ingredients", t.total.calories, 1110);
  eq("per-serving kcal = total / servings", t.perServing.calories, Math.round((t.total.calories / t.servings) * 10) / 10);
  const pork = nutrition.getRecipe("recipe_pork_fried_rice");
  const pt = nutrition.recipeTotals(pork);
  eq("pork fried rice total kcal", pt.total.calories, 1000);
  eq("pork per-serving kcal (half batch)", pt.perServing.calories, 500);
  ok("pork tracks oils/sauces as separate ingredients", pork.ingredients.some(i => i.name === "Sesame oil") && pork.ingredients.some(i => i.name === "Soy sauce"));
}

console.log("\n[5] Food memory: reuse + dedup (consistency)");
{
  nutrition.logFood({ name: "Banana", calories: 105, protein: 1, carbs: 27, fat: 0, fiber: 3 });
  nutrition.logFood({ name: "banana", calories: 105, protein: 1, carbs: 27, fat: 0, fiber: 3 }); // same food, different case
  const remembered = nutrition.foods().filter(f => f.name.toLowerCase() === "banana");
  eq("only ONE remembered 'banana' (deduped)", remembered.length, 1);
  ok("timesLogged incremented to 2", remembered[0].timesLogged === 2);
  const found = nutrition.findFood("BANANA");
  ok("findFood reuses the remembered macros (105 kcal)", found && found.calories === 105);
}

console.log("\n[6] Daily totals + water");
{
  nutrition.logWater(32);
  nutrition.logWater(16);
  const tot = nutrition.dayTotals();
  eq("water totals 48 oz", tot.water_oz, 48);
  ok("calories summed from logged foods (>=210 from 2 bananas)", tot.calories >= 210);
}

console.log("\n[7] Export + delete");
{
  const exp = profile.exportAll();
  ok("exportAll returns items + audit", Array.isArray(exp.items) && exp.items.length > 0 && Array.isArray(exp.audit));
  const id = exp.items[0].id;
  ok("deleteItem removes a record", profile.deleteItem(id) === true && !profile.allItems().some(x => x.id === id));
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
