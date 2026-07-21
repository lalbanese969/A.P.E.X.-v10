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

console.log("\n[8] Food code words (aliases) + corrections");
{
  // teach a food with a code word
  nutrition.setFood({ name: "Chocolate Belvita sandwich", aliases: ["belvita"], calories: 230, protein: 4, carbs: 40, fat: 7, fiber: 3 });
  const byAlias = nutrition.findFood("belvita");
  ok("findFood('belvita') resolves the aliased food", byAlias && byAlias.name === "Chocolate Belvita sandwich");
  eq("aliased food carries the taught calories", byAlias.calories, 230);
  nutrition.addAlias("Chocolate Belvita sandwich", "choco belvita");
  ok("addAlias adds a second code word", nutrition.findFood("choco belvita")?.name === "Chocolate Belvita sandwich");
  // log by the code word, then correct it
  nutrition.logFood({ name: "belvita", qty: 1, calories: 230, protein: 4, carbs: 40, fat: 7, fiber: 3, source: "memory" });
  const res = nutrition.correctLoggedFood("belvita", { calories: 250, protein: 5 });
  eq("correction updates remembered calories", nutrition.findFood("belvita").calories, 250);
  ok("correction fixed today's log entry", res.entriesUpdated >= 1);
  ok("setFood does not duplicate the aliased food", nutrition.foods().filter(f => f.name === "Chocolate Belvita sandwich").length === 1);
}

console.log("\n[9] Remove a logged food (undo)");
{
  nutrition.logFood({ name: "Ham", qty: 1, calories: 90, protein: 15, carbs: 1, fat: 3, fiber: 0 });
  const beforeCal = nutrition.dayTotals().calories;
  ok("ham is in today's log", nutrition.getDay().foods.some(f => f.name.toLowerCase() === "ham"));
  const removed = nutrition.removeFoodByName("ham");
  ok("removeFoodByName removes matching entries", removed >= 1);
  ok("day calories dropped after removal", nutrition.dayTotals().calories < beforeCal);
  ok("ham no longer in today's log", !nutrition.getDay().foods.some(f => f.name.toLowerCase() === "ham"));
}

console.log("\n[10] Safe removal (one vs all) + pending confirmation store");
{
  nutrition.removeFoodByName("belvita");   // clear any belvita left from earlier sections
  nutrition.logFood({ name: "Chocolate Belvita sandwich", qty: 1, calories: 230, protein: 4, carbs: 40, fat: 7, fiber: 3 });
  nutrition.logFood({ name: "Chocolate Belvita sandwich", qty: 1, calories: 230, protein: 4, carbs: 40, fat: 7, fiber: 3 });
  ok("findLoggedByName finds both via the code word", nutrition.findLoggedByName("belvita").length === 2);
  ok("removeOneFoodByName removes exactly ONE", nutrition.removeOneFoodByName("belvita") === 1 && nutrition.findLoggedByName("belvita").length === 1);
  ok("removeFoodByName clears the rest", nutrition.removeFoodByName("belvita") === 1 && nutrition.findLoggedByName("belvita").length === 0);
  nutrition.setPendingAction({ parsed: { remove: ["belvita"] }, ts: Date.now() });
  ok("pending confirmation persists", !!nutrition.getPendingAction());
  nutrition.clearPendingAction();
  ok("pending confirmation clears", nutrition.getPendingAction() === null);
}

console.log("\n[11] Precise matching (no 'ham rolls' -> 'ham' collision) + clear today");
{
  nutrition.setFood({ name: "Ham", calories: 90, protein: 15, carbs: 1, fat: 3, fiber: 0 });
  ok("'ham rolls' does NOT resolve to the saved 'ham'", nutrition.findFood("ham rolls") === null);
  ok("plural/article still match: 'the bananas' -> banana", nutrition.findFood("the bananas")?.name?.toLowerCase() === "banana");
  // clear today
  nutrition.logFood({ name: "Test food", qty: 1, calories: 200, protein: 10, carbs: 20, fat: 5, fiber: 2 });
  nutrition.logWater(20);
  ok("something is logged before clear", nutrition.dayTotals().calories > 0 || nutrition.dayTotals().water_oz > 0);
  nutrition.clearDay();
  const t = nutrition.dayTotals();
  ok("clearDay zeroes calories + water + entries", t.calories === 0 && t.water_oz === 0 && t.entries === 0);
}

console.log("\n[12] Edit a logged entry + learn it into food memory");
{
  nutrition.clearDay();
  const e = nutrition.logFood({ name: "Chicken bowl", qty: 1, unit: "each", calories: 500, protein: 30, carbs: 50, fat: 15 });
  const updated = nutrition.updateFoodEntry(e.id, { calories: 650, protein: 45 });   // user corrects it
  eq("entry calories updated to 650", updated.calories, 650);
  ok("entry flagged user_edited", updated.source === "user_edited");
  nutrition.learnFromEntry(updated);
  const mem = nutrition.findFood("chicken bowl");
  ok("memory learned the corrected values (650 kcal / 45p)", mem && mem.calories === 650 && mem.protein === 45);
  // qty > 1: per-unit learned = total / qty
  const e2 = nutrition.logFood({ name: "Protein waffles", qty: 3, unit: "each", calories: 100, protein: 10, carbs: 14, fat: 2 });
  const u2 = nutrition.updateFoodEntry(e2.id, { calories: 360 });   // I say the 3 were 360 total
  nutrition.learnFromEntry(u2);
  const mem2 = nutrition.findFood("protein waffles");
  ok("per-unit learned = total/qty (360/3 = 120)", mem2 && mem2.calories === 120);
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
