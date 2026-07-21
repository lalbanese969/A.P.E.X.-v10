/* ============================================================================
   [MODULE: pipeline.js]
   The A.P.E.X. chat pipeline — ported from backend/pipeline.py. Per message:
     1. memory.buildPacket()           -> small, relevant memory only
     2. classify intent                -> HEURISTIC ONLY (see note below)
     3. run the matching action        -> calendar / email search / draft / refine / chat
     4. build a context block          -> memory + calendar/email results
     5. aiCenter.runTask("user_answer") -> the real reply (Groq, Gemini fallback)
     6. memory.reviewInteraction()      -> non-destructive write-proposal log

   Simplification vs. the Python version: that version used a small local Ollama
   model to break ties when the heuristic was unsure. We dropped local Ollama in
   the browser migration (mixed-content blocking), and the heuristic alone
   already covers the demo's intents reliably, so this module is heuristic-only
   — one fewer network call per message, and one fewer thing that can fail.
   ============================================================================ */

import * as memory from "./memory.js";
import * as connections from "./connections.js";
import * as settingsMod from "./settings.js";
import * as profile from "./profile.js";
import * as nutrition from "./nutrition.js";
import { runTask, AIError } from "./aiCenter.js";

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

export async function handlePrompt(userPrompt, { priorDraft = null } = {}) {
  const prompt = (userPrompt || "").trim();
  const packet = memory.buildPacket(prompt);
  const { intent, params } = heuristicIntent(prompt, !!priorDraft);

  const result = { user_prompt: prompt, memory_packet: packet, intent };
  let aiMeta = { provider: null, model: null };

  try {
    if (intent === "calendar_add") {
      // Deterministic action (no AI call needed): create the event with the
      // color matched from its category.
      const r = addEvent(prompt);
      result.event = r.event;
      result.apex_response = r.message;
    } else if (intent === "calendar_query") {
      const events = connections.upcomingEvents(params.days);
      result.calendar = events;
      const r = await answer(prompt, packet, { calendar: events });
      result.apex_response = r.text;
      aiMeta = r;
    } else if (intent === "email_search") {
      const matches = connections.searchEmail(params.query || prompt);
      result.email_matches = matches;
      const r = await answer(prompt, packet, { emails: matches });
      result.apex_response = r.text;
      aiMeta = r;
    } else if (intent === "email_draft") {
      const { draft, matches, ai } = await draftEmail(prompt, params, packet, null);
      result.draft = draft;
      result.email_matches = matches;
      result.apex_response = "Drafted it for you, sir. Take a look and tell me what to tweak — tone, length, wording, anything.";
      aiMeta = ai;
    } else if (intent === "email_refine") {
      const learned = await learnStyle(prompt);
      const { draft, ai } = await draftEmail(prompt, params, packet, priorDraft);
      result.draft = draft;
      result.style_learned = learned;
      result.apex_response = "Tweaked it, sir — and I'll remember that for next time. Anything else?";
      aiMeta = ai;
    } else {
      // plain chat — but first, food memory works here too (only when it's clearly
      // nutrition, or resolving a pending confirmation; calendar/email above win).
      let handledNutrition = false;
      if (looksNutrition(prompt) || nutrition.getPendingAction()) {
        try {
          const nres = await handleNutrition(prompt);
          if (nres) {
            result.intent = nres.intent;
            result.apex_response = nres.response;
            result.nutrition = nres.data;
            aiMeta = nres.ai_meta;
            handledNutrition = true;
          }
        } catch (e) { /* fall through to normal chat */ }
      }
      if (!handledNutrition) {
        const r = await answer(prompt, packet, {});
        result.apex_response = r.text;
        aiMeta = r;
      }
    }
  } catch (e) {
    if (e instanceof AIError) {
      result.apex_response = memoryOnlyFallback(packet, e.message);
    } else {
      throw e;
    }
  }

  result.ai_meta = aiMeta;
  // Learn from this interaction in the BACKGROUND (silent, fire-and-forget) so it
  // never delays the reply and shows nothing in the UI. See memory.learnFromInteraction.
  memory.learnFromInteraction(prompt, result.apex_response || "").catch(() => {});
  return result;
}

/* ============================================================================
   COACH MODE — the lightweight path behind the /big "Workout APEX" chat.
   Deliberately does NOT classify intents or run any email/calendar actions (that
   heavy machinery isn't wanted in the trainer view). It's a single AI call with a
   personal-trainer/health system prompt plus the user's own facts and today's
   fitness snapshot, so APEX can coach on training, nutrition, sleep, hydration.
   Memory still learns from it in the background (health facts are worth keeping).
   ============================================================================ */
export async function handleCoachPrompt(userPrompt, health = "") {
  const prompt = (userPrompt || "").trim();
  const packet = memory.buildPacket(prompt);
  const result = { user_prompt: prompt, intent: "coach", ai_meta: { provider: null, model: null } };

  // NUTRITION PATH: log food/water, learn code words, corrections, removals — and
  // resolve any pending confirmation (a bare "yes"/"just one" must reach it too).
  // Falls through to normal coaching if it wasn't actually a nutrition message.
  if (looksNutrition(prompt) || nutrition.getPendingAction()) {
    try {
      const res = await handleNutrition(prompt);
      if (res) {
        result.intent = res.intent;
        result.apex_response = res.response;
        result.nutrition = res.data;
        result.ai_meta = res.ai_meta;
        memory.learnFromInteraction(prompt, "").catch(() => {});
        return result;
      }
    } catch (e) { /* fall through to normal coaching */ }
  }

  try {
    const snapshot = profile.profileBrief() + "  Today so far: " + nutritionTodayLine();
    const system = coachSystem() + "\n\n" + contextBlock(packet, { user: memory.userBrief(), health: snapshot });
    const r = await runTask("user_answer", [{ role: "system", content: system }, { role: "user", content: prompt }]);
    result.apex_response = r.text;
    result.ai_meta = { provider: r.provider, model: r.model };
  } catch (e) {
    if (e instanceof AIError) result.apex_response = memoryOnlyFallback(packet, e.message);
    else throw e;
  }

  memory.learnFromInteraction(prompt, result.apex_response || "").catch(() => {});
  return result;
}

function coachSystem() {
  const allergens = profile.getAllergens();
  const allergyLine = allergens.length
    ? ` IMPORTANT: sir has a DAIRY (milk-protein) allergy — never suggest whey, casein, or dairy foods (${allergens.slice(0, 6).join(", ")}…), and remind him to check labels.`
    : "";
  return systemBase() +
    ` Right now you are in WORKOUT & HEALTH mode — you are sir's personal trainer and nutrition ` +
    `coach. Keep the focus on training, nutrition, recovery, sleep, hydration and motivation. ` +
    `Coach from his profile + today's numbers in the snapshot below; treat calorie/macro TARGETS as ` +
    `estimates, not gospel, and judge trends over weeks, not one reading. Suggest specific tweaks and ` +
    `be encouraging without the fluff. You are NOT handling email or calendar here — send him back to ` +
    `the main chat for those.` + allergyLine;
}

/* ============================================================================
   NUTRITION FROM CHAT — logging, code words (aliases), and corrections.
   One Groq JSON call classifies + extracts, then we apply it against the food
   memory: reuse remembered foods (and their code words) for consistent macros,
   estimate unknowns but ASK to confirm them, learn aliases ("when I say belvita
   I mean the chocolate Belvita sandwich"), and accept corrections ("belvita is
   230 cal"). Shared by BOTH the main chat and the /big trainer chat.
   ============================================================================ */

// Cheap gate: is this plausibly about food/drink/aliases/corrections/removals?
function looksNutrition(p) {
  const t = (p || "").toLowerCase();
  return /\b(i (ate|had|eat|drank|consumed|made)|just (ate|had|drank|made)|for (breakfast|lunch|dinner)|as a snack|had a|ate a|log (this|that|it|my)|drank|drinking)\b/.test(t)
    || /\bwhen i say\b|\bcode ?word\b|\b(means|refers to)\b/.test(t)
    || /\b(is|was|has|=)\s*\d+\s*(cal|calorie|calories|kcal|g|grams?|oz)\b/.test(t)
    || /\b(remove|delete|undo|scratch|clear|reset|wipe|start over|restart|take (off|out))\b|\bdidn'?t (actually |really )?(eat|have|drink)\b/.test(t)
    || (/\b\d+(\.\d+)?\s*(oz|ounce|ounces|ml|l|liter|litre|cup|cups|glass|glasses|bottle|bottles)\b/.test(t)
        && /\b(water|drank|drink|drinking|hydrat|fluids?)\b/.test(t));
}

// Did the user actually SAY they ate/drank something (vs just asking about a food)?
// This is a deterministic guard so a question ("how many calories in a belvita?")
// never gets logged even if the model tries to.
function hasConsumptionSignal(p) {
  const t = (p || "").toLowerCase();
  return /\b(ate|eaten|eating|had|have (a|some|the|my)|having|drank|drinking|finished|consumed|snacked|grabbed|made myself|log(ged)?|add(ed|ing)?|track)\b/.test(t)
    || /\bfor (breakfast|lunch|dinner)\b|\bas a snack\b/.test(t);
}
// Is the message a question / hypothetical (asking about a food, not logging it)?
function isQuestionish(p) {
  const t = (p || "").trim().toLowerCase();
  return t.endsWith("?")
    || /^(how|what|what'?s|is|are|does|do|can|should|would|which|why|how many|how much|whats)\b/.test(t)
    || /\b(going to|gonna|planning to|thinking of|should i|can i have)\b/.test(t);
}

// Compact "today so far vs goal" line for coaching context.
function nutritionTodayLine() {
  const t = nutrition.dayTotals(), g = profile.dailyGoal();
  return `${t.calories}/${g.kcal} kcal, protein ${t.protein}/${g.protein}g, carbs ${t.carbs}/${g.carbs}g, ` +
    `fat ${t.fat}/${g.fat}g, fiber ${t.fiber}/${g.fiber}g, water ${t.water_oz}/${g.water_oz} oz.`;
}

const MACRO_KEYS = ["calories", "protein", "carbs", "fat", "fiber"];

/* ---- confirmation-reply detection ---- */
function isAffirmative(p) {
  return /^\s*(y(es|eah|ep|up|a)|sure|correct|right|do it|go ahead|confirm|ok(ay)?|please|that'?s?\s+(right|it|correct)|all( of them)?|both|just one|only one|the (last|latest|recent|most recent) one|one)\b/i.test(p || "");
}
function isNegative(p) {
  return /^\s*(no|nope|nah|cancel|never\s?mind|leave it|forget it|don'?t|do not)\b/i.test(p || "");
}
function removeModeFrom(p) {
  const t = (p || "").toLowerCase();
  if (/\ball\b|\bevery\b|\bboth\b/.test(t)) return "all";
  if (/\b(one|just one|only one|latest|last|recent|most recent)\b/.test(t)) return "one";
  return null;
}

/** Parse a nutrition message with the FULL model (more accurate than the fast one) —
    returns a parsed intent, {empty:true} if not nutrition, or null on parse failure. */
async function parseNutrition(prompt) {
  const allergens = profile.getAllergens();
  const sys =
    "You process a NUTRITION message for a food tracker and reply ONLY with JSON: " +
    "{\"foods\":[{\"name\":str,\"qty\":num,\"unit\":str,\"calories\":num,\"protein\":num,\"carbs\":num,\"fat\":num,\"fiber\":num,\"maybe_dairy\":bool}]," +
    "\"water_oz\":num,\"remove\":[str],\"alias\":{\"word\":str,\"means\":str}|null," +
    "\"correction\":{\"food\":str,\"calories\":num,\"protein\":num,\"carbs\":num,\"fat\":num,\"fiber\":num}|null," +
    "\"confident\":bool,\"question\":str}.\n" +
    "RULES:\n" +
    "- Put a food in `foods` ONLY if the user is reporting they ACTUALLY ATE or DRANK it (\"I ate\", \"I had\", " +
    "\"for lunch I had\", \"just finished\"). If they are ASKING about a food, its calories, whether it's dairy-free, " +
    "considering it, or it's hypothetical/future — DO NOT log it; foods:[].\n" +
    "- Macros are PER ONE unit; qty = how many. ALWAYS give realistic protein/carbs/fat/fiber — NEVER 0 protein for " +
    "meat/eggs/fish/beans (e.g. 3 oz ham ≈ 90 kcal, 15g protein, 1g carb, 3g fat; 2 large eggs ≈ 140 kcal, 12g protein).\n" +
    "- water_oz = fluids in fl oz ('a bottle'≈20, 'a glass'≈8, '1 L'≈34).\n" +
    "- remove = foods to REMOVE from today's log ('remove the ham', 'undo the belvita').\n" +
    "- alias = a CODE WORD ('when I say X I mean Y', 'call it X'): word=short code, means=full food name.\n" +
    "- correction = the REAL macros of a food ('belvita is 230 cal'): per-unit; food=its name or 'it'.\n" +
    "- confident: set FALSE and put a short clarifying question in `question` if the message is AMBIGUOUS — " +
    "unclear whether they ate it or are just asking, a vague/unclear food, an odd quantity, or you're unsure which item " +
    "they mean. When you're sure, confident:true and question:\"\". Prefer asking over guessing.\n" +
    "- Use [] / 0 / null for anything absent. maybe_dairy=true if it usually has milk/cheese/butter/cream/whey/casein " +
    "(user has a DAIRY allergy: " + allergens.slice(0, 8).join(", ") + ").\n" +
    "Examples: 'I had 2 eggs and a bagel' -> foods eggs+bagel, confident:true. " +
    "'how many calories in a chocolate belvita?' -> foods:[], confident:true. " +
    "'that thing I made earlier' -> confident:false, question:'Which meal, sir, and what was in it?'";
  // No fast-model override -> uses the primary full model (Groq 70B) with Gemini fallback.
  const r = await runTask("nutrition_parse",
    [{ role: "system", content: sys }, { role: "user", content: prompt }], { jsonMode: true });

  let p; try { p = JSON.parse(stripFences(r.text)); } catch (e) { return null; }
  const ai_meta = { provider: r.provider, model: r.model };
  let foods = Array.isArray(p.foods) ? p.foods : [];
  const water = Math.max(0, Number(p.water_oz) || 0);
  const remove = Array.isArray(p.remove) ? p.remove.filter(Boolean) : [];
  const alias = (p.alias && p.alias.word && p.alias.means) ? p.alias : null;
  const correction = (p.correction && p.correction.food) ? p.correction : null;

  // GUARD: never log foods from a question/mention.
  if (foods.length && (!hasConsumptionSignal(prompt) || isQuestionish(prompt))) foods = [];

  if (!foods.length && !water && !remove.length && !alias && !correction) return { empty: true, ai_meta };
  return { foods, water, remove, alias, correction,
    confident: p.confident !== false, question: typeof p.question === "string" ? p.question.trim() : "", ai_meta };
}

/** Apply a parsed nutrition intent. removeMode "all" | "one" governs removals. */
function applyNutrition(parsed, { removeMode = "one" } = {}) {
  const parts = [], data = {};

  // removals
  if (parsed.remove && parsed.remove.length) {
    const gone = [], notFound = [];
    for (const name of parsed.remove) {
      const matches = nutrition.findLoggedByName(name);
      if (!matches.length) { notFound.push(name); continue; }
      const n = removeMode === "all" ? nutrition.removeFoodByName(name) : nutrition.removeOneFoodByName(name);
      if (n) gone.push(name + (removeMode === "all" && n > 1 ? ` (all ${n})` : ""));
    }
    if (gone.length) { parts.push(`Removed ${gone.join(", ")} from today's log.`); data.removed = gone; }
    if (notFound.length) parts.push(`Didn't find ${notFound.join(", ")} to remove.`);
  }

  // code word / alias
  if (parsed.alias) {
    const a = parsed.alias;
    if (nutrition.findFood(a.means)) nutrition.addAlias(a.means, a.word);
    else nutrition.setFood({ name: a.means, aliases: [a.word], source: "user" });
    parts.push(`Got it — when you say "${a.word}" I'll take that as ${a.means}.`);
    data.alias = { word: a.word, means: a.means };
  }

  // correction
  if (parsed.correction) {
    let name = String(parsed.correction.food).trim();
    if (/^(it|that|this|the last one)$/i.test(name)) name = (nutrition.getPending()?.names || [])[0] || name;
    const per = {};
    for (const k of MACRO_KEYS) if (parsed.correction[k] != null) per[k] = +parsed.correction[k];
    const res = nutrition.correctLoggedFood(name, per);
    parts.push(`Updated ${res.food.name}${per.calories != null ? ` to ~${per.calories} kcal` : ""}` +
      `${res.entriesUpdated ? ` (fixed ${res.entriesUpdated} in today's log)` : ""} — I'll remember that.`);
    data.correction = res.food.name;
  }

  // log foods
  const logged = [], dairy = [], unknown = [];
  for (const f of (parsed.foods || [])) {
    if (!f || !f.name) continue;
    const qty = Number(f.qty) || 1;
    const known = nutrition.findFood(f.name);
    // only REUSE remembered macros if they're actually valid — a saved food with all
    // zeros (e.g. a bad earlier estimate) must NOT poison this log.
    const knownUsable = known && (known.calories > 0 || known.protein > 0 || known.carbs > 0 || known.fat > 0);
    const name = known ? known.name : f.name;
    const aiPer = { calories: +f.calories || 0, protein: +f.protein || 0, carbs: +f.carbs || 0, fat: +f.fat || 0, fiber: +f.fiber || 0, sodium: 0 };
    const per = knownUsable
      ? { calories: known.calories, protein: known.protein, carbs: known.carbs, fat: known.fat, fiber: known.fiber, sodium: known.sodium || 0 }
      : aiPer;
    // heal a blank/zero memory with the fresh estimate so it's right next time
    if (known && !knownUsable && (aiPer.calories > 0 || aiPer.protein > 0)) {
      nutrition.setFood({ name: known.name, ...aiPer, source: "ai_estimate" });
    }
    nutrition.logFood({ name, qty, unit: f.unit || null, ...per,
      source: knownUsable ? "memory" : "ai_estimate", confidence: knownUsable ? 0.9 : 0.4, dairy: !!f.maybe_dairy });
    logged.push({ name, qty, calories: Math.round(per.calories * qty), fromMemory: knownUsable });
    if (f.maybe_dairy) dairy.push(name);
    // ask to confirm a brand-new food, or when we still couldn't get real numbers (all zero)
    const allZero = per.calories === 0 && per.protein === 0 && per.carbs === 0 && per.fat === 0;
    if (!known || allZero) unknown.push(name);
  }
  const water = parsed.water || 0;
  if (water > 0) nutrition.logWater(water);

  if (logged.length) {
    parts.push("Logged, sir — " + logged.map((l) =>
      `${l.qty > 1 ? l.qty + "× " : ""}${l.name} (~${l.calories} kcal${l.fromMemory ? ", remembered" : ""})`).join(", ") + ".");
  }
  if (water > 0) parts.push(`+${water} oz water.`);
  if (logged.length || water > 0 || (data.removed && data.removed.length)) {
    const t = nutrition.dayTotals(), g = profile.dailyGoal();
    const pLeft = Math.max(0, g.protein - t.protein);
    parts.push(`Day: ${t.calories}/${g.kcal} kcal · protein ${t.protein}/${g.protein}g` +
      `${pLeft > 0 ? ` (${pLeft}g to go)` : " ✓"} · water ${t.water_oz}/${g.water_oz} oz.`);
  }
  if (dairy.length) parts.push(`Heads up — ${dairy.join(", ")} may contain dairy; check the label (milk-protein allergy).`);
  if (unknown.length) {
    nutrition.setPending({ names: unknown, date: nutrition.todayStr() });
    parts.push(`I don't have ${unknown.join(", ")} saved yet, so that's an estimate — tell me the real numbers ` +
      `(e.g. "${unknown[0]} is 230 cal, 4g protein") or give me a code word and I'll lock it in.`);
  }

  const intent = (logged.length || water) ? "nutrition_log"
    : (data.removed && data.removed.length) ? "nutrition_remove"
    : parsed.correction ? "nutrition_correct" : "nutrition_alias";
  return { intent, response: parts.join(" ") || "Done, sir.", data, ai_meta: parsed.ai_meta };
}

// "clear today" / "reset my log" / "start today over" — a deterministic wipe (no AI call).
function isClearToday(p) {
  const t = (p || "").toLowerCase();
  return (/\b(clear|reset|wipe|erase|start over|restart)\b/.test(t)
          && /\b(today|day|log|count|everything|it all|the food|my food)\b/.test(t))
      || /\bclear (my )?(food )?log\b/.test(t) || /\bstart (the )?day over\b/.test(t);
}

/** Top-level: resolve any pending confirmation, else parse and (ASK if unsure/ambiguous) apply. */
async function handleNutrition(prompt) {
  // 0) explicit "clear today" — reset the day (deterministic, no AI)
  if (isClearToday(prompt)) {
    nutrition.clearDay();
    nutrition.clearPendingAction();
    return { intent: "nutrition_clear", response: "Cleared today's log, sir — fresh start, everything's back to zero.", data: { cleared: true }, ai_meta: { provider: null, model: null } };
  }

  // 1) resolve a pending confirmation first (expires after 5 min so it's never stale)
  let pending = nutrition.getPendingAction();
  if (pending && pending.ts && Date.now() - pending.ts > 300000) { nutrition.clearPendingAction(); pending = null; }
  if (pending) {
    const mode = removeModeFrom(prompt);
    if (isNegative(prompt)) { nutrition.clearPendingAction(); return { intent: "nutrition_cancel", response: "Okay, sir — left it as it was.", data: {}, ai_meta: { provider: null, model: null } }; }
    if (isAffirmative(prompt) || mode) {
      nutrition.clearPendingAction();
      return applyNutrition(pending.parsed, { removeMode: mode || pending.defaultRemoveMode || "one" });
    }
    nutrition.clearPendingAction();   // unrelated reply -> drop the question, parse the new message
  }

  // 2) parse
  const parsed = await parseNutrition(prompt);
  if (!parsed || parsed.empty) return null;

  // 3) removal ambiguity: >1 matching entry and no explicit "all"/"one" -> ASK first
  const explicitMode = removeModeFrom(prompt);
  if (!explicitMode) {
    for (const name of parsed.remove) {
      const matches = nutrition.findLoggedByName(name);
      if (matches.length > 1) {
        nutrition.setPendingAction({ parsed, defaultRemoveMode: "one", ts: Date.now() });
        return { intent: "nutrition_confirm",
          response: `You've got ${matches.length} ${name} logged today, sir — remove all ${matches.length}, or just the most recent one? (say "all" or "just one")`,
          data: {}, ai_meta: parsed.ai_meta };
      }
    }
  }

  // 4) low confidence -> ASK before doing anything (so it's not jumpy)
  if (!parsed.confident && parsed.question) {
    nutrition.setPendingAction({ parsed, defaultRemoveMode: "one", ts: Date.now() });
    return { intent: "nutrition_confirm", response: parsed.question, data: {}, ai_meta: parsed.ai_meta };
  }

  // 5) confident -> apply
  return applyNutrition(parsed, { removeMode: explicitMode || "one" });
}

function stripFences(s) {
  return String(s || "").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

/* ---- intent heuristic (regex rules, ported from pipeline.py:_heuristic_intent) --- */

function heuristicIntent(prompt, hasPriorDraft) {
  const p = prompt.toLowerCase();
  let days = 7;
  if (p.includes("today")) days = 1;
  else if (p.includes("tomorrow")) days = 2;
  else if (p.includes("week")) days = 7;

  const params = { days, query: searchQuery(prompt) };

  const refineWords = ["change", "shorter", "longer", "make it", "instead", "tone", "reword", "tweak", "more formal", "less formal"];
  if (hasPriorDraft && refineWords.some((w) => p.includes(w))) return { intent: "email_refine", params };

  // calendar_add: an "add/schedule" verb + an event noun / time / the word calendar
  const addVerbs = ["add", "schedule", "create", "put", "set up", "book", "plan"];
  const eventNouns = ["lunch", "dinner", "breakfast", "brunch", "coffee", "meeting", "appointment",
                      "event", "call", "party", "date", "gym", "workout", "flight", "reminder"];
  const timeish = ["today", "tomorrow", "monday", "tuesday", "wednesday", "thursday", "friday",
                   "saturday", "sunday", " at ", "pm", "am", " on "];
  if (addVerbs.some((w) => p.includes(w)) &&
      (p.includes("calendar") || eventNouns.some((n) => p.includes(n)) || timeish.some((t) => p.includes(t)))) {
    return { intent: "calendar_add", params };
  }

  const draftWords = ["draft", "reply", "respond", "write an email", "compose", "resend", "follow up"];
  if (draftWords.some((w) => p.includes(w))) return { intent: "email_draft", params };

  if ((p.includes("email") || p.includes("inbox")) && ["find", "search", "look for", "show"].some((w) => p.includes(w))) {
    return { intent: "email_search", params };
  }
  const calWords = ["calendar", "schedule", "agenda", "appointment", "meeting"];
  const askingToday = p.includes("today") && ["anything", "what", "have", "do i"].some((w) => p.includes(w));
  if (calWords.some((w) => p.includes(w)) || askingToday) return { intent: "calendar_query", params };

  return { intent: "chat", params };
}

function searchQuery(prompt) {
  const stop = new Set(["find", "the", "old", "email", "emails", "that", "about", "a", "an", "for", "to", "me", "my",
    "and", "help", "draft", "resend", "please", "can", "you", "from", "with", "of", "in", "on", "search", "look", "show"]);
  const words = (prompt.toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => !stop.has(w) && w.length > 2);
  return words.slice(0, 6).join(" ");
}

/* ---- answering (chat / calendar / email_search) -------------------------------- */

async function answer(prompt, packet, { calendar, emails } = {}) {
  const system = systemBase() + "\n\n" + contextBlock(packet, { calendar, emails, user: memory.userBrief() });
  const r = await runTask("user_answer", [{ role: "system", content: system }, { role: "user", content: prompt }]);
  return { text: r.text, provider: r.provider, model: r.model };
}

/* ---- drafting + style learning --------------------------------------------- */

async function draftEmail(prompt, params, packet, priorDraft) {
  const matches = params.query ? connections.searchEmail(params.query) : [];
  const ref = matches[0] || null;

  const to = pickRecipient(ref, priorDraft);
  const subject = pickSubject(ref, priorDraft);
  const style = memory.writingStyleBrief();

  // NOTE: deliberately does NOT use systemBase() here. APEX's own witty/"sir" voice
  // (see systemBase()) is how it talks to the USER — it must never leak into an email
  // body addressed to someone else. This prompt is isolated on purpose.
  const system =
    "You are A.P.E.X., drafting an email on the user's behalf to send to SOMEONE ELSE. " +
    "This email is addressed to the recipient, not to the user — do not call the recipient " +
    "\"sir\", and do not inject jokes or personality into the email body itself. Write ONLY the " +
    "email body (no subject line, no commentary), following the writing style below.\n\n" +
    "Writing style to follow: " + style +
    "\n\n" + contextBlock(packet, { emails: matches });

  let instruction = prompt;
  if (priorDraft) {
    instruction = `Revise this previous draft based on the feedback.\n\nPREVIOUS DRAFT:\n${priorDraft.body || ""}\n\nFEEDBACK: ${prompt}`;
  }

  const r = await runTask("user_answer", [{ role: "system", content: system }, { role: "user", content: instruction }]);
  const draft = connections.createDraft({
    to, subject, body: cleanDraftBody(r.text),
    accountId: (ref || {}).account_id, inReplyTo: (ref || {}).id,
  });
  return { draft, matches, ai: { provider: r.provider, model: r.model } };
}

async function learnStyle(feedback) {
  try {
    const system = { role: "system", content:
      "The user gave feedback on an email draft. Express the lasting WRITING PREFERENCE it implies " +
      "as one short imperative sentence (e.g. 'Keep emails shorter and more direct.'). Reply with ONLY that sentence." };
    const r = await runTask("extract_style", [system, { role: "user", content: feedback }]);
    const pref = (r.text || "").trim().split("\n")[0].trim();
    if (pref) {
      memory.addStylePreference(pref, "user_feedback");
      return pref;
    }
  } catch (e) {
    // best-effort — a failed style-learning call shouldn't break the draft refine
  }
  return null;
}

const PREAMBLE_LINE_RE = /^\s*(here'?s|here is|sure|okay|got it)\b.*:\s*$/i;
// Some models prepend a chatty multi-sentence intro before the actual marker line
// (e.g. "I found the email... Here's a draft email:\n\n<body>") rather than putting
// the marker on its own first line. This catches that broader case.
const PREAMBLE_MARKER_RE = /^[\s\S]*?\b(here'?s|here is)\b[^\n]*\b(draft|email)\b[^\n]*:\s*\n+/i;

function cleanDraftBody(text) {
  let t = (text || "").trim();
  const marker = PREAMBLE_MARKER_RE.exec(t);
  if (marker) {
    return t.slice(marker[0].length).trim();
  }
  const lines = t.split("\n");
  if (lines.length && PREAMBLE_LINE_RE.test(lines[0])) lines.shift();
  while (lines.length && !lines[0].trim()) lines.shift();
  return lines.join("\n").trim();
}

function pickRecipient(ref, priorDraft) {
  if (priorDraft?.to) return priorDraft.to;
  if (ref) {
    const m = EMAIL_RE.exec(ref.body || "") || EMAIL_RE.exec(ref.sender || "");
    if (m) return m[0];
  }
  return "";
}

function pickSubject(ref, priorDraft) {
  if (priorDraft?.subject) return priorDraft.subject;
  if (ref) return ref.subject.toLowerCase().startsWith("re:") ? ref.subject : `Re: ${ref.subject}`;
  return "(no subject)";
}

/* ---- calendar add (deterministic, no AI) ------------------------------------ */

function addEvent(prompt) {
  const { title, start, end, dateLabel, timeLabel } = parseEvent(prompt);
  const colorId = settingsMod.colorIdForTitle(title);
  const color = settingsMod.getColorById(colorId);
  const ev = connections.addCalendarEvent({ title, start, end, colorId });
  const isDefault = colorId === settingsMod.getDefaultColorId();
  const colorNote = isDefault ? `${color.name} — default/Other` : color.name;
  return {
    event: ev,
    message: `Done, sir — "${title}" is on the calendar for ${dateLabel} at ${timeLabel} (color: ${colorNote}).`,
  };
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function parseEvent(prompt) {
  const p = prompt.toLowerCase();
  const day = new Date();

  // --- which day ---
  if (p.includes("tomorrow")) {
    day.setDate(day.getDate() + 1);
  } else {
    for (let i = 0; i < 7; i++) {
      if (p.includes(WEEKDAYS[i])) {
        const delta = (i - day.getDay() + 7) % 7 || 7; // next occurrence of that weekday
        day.setDate(day.getDate() + delta);
        break;
      }
    }
  }

  // --- what time (default noon) ---
  let hour = 12, min = 0;
  const tm = p.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
  if (tm) {
    hour = (parseInt(tm[1], 10) % 12) + (tm[3] === "pm" ? 12 : 0);
    min = tm[2] ? parseInt(tm[2], 10) : 0;
  } else {
    const at = p.match(/\bat\s+(\d{1,2})(?::(\d{2}))?/);
    if (at) { hour = parseInt(at[1], 10); min = at[2] ? parseInt(at[2], 10) : 0; }
  }
  day.setHours(hour, min, 0, 0);
  const endDate = new Date(day.getTime() + 60 * 60 * 1000);

  return {
    title: cleanEventTitle(prompt),
    start: localIso(day),
    end: localIso(endDate),
    dateLabel: day.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" }),
    timeLabel: day.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
  };
}

function cleanEventTitle(prompt) {
  let t = prompt
    .replace(/^(can you|could you|please|hey apex|apex|yo)\b[,:]?\s*/i, "")
    .replace(/\b(add|schedule|create|put|set up|book|plan)\b/i, "")
    .replace(/\b(to|on|in)\s+(my\s+)?(google\s+)?calendar\b/i, "")
    .replace(/\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/ig, "")
    .replace(/\bat\s+\d{1,2}(?::\d{2})?\s*(am|pm)?/ig, "")
    .replace(/\b\d{1,2}(?::\d{2})?\s*(am|pm)\b/ig, "")
    .replace(/\bnext\b/ig, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,–-]+|[\s,–-]+$/g, "")
    .trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "New event";
}

function localIso(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ---- prompt building blocks -------------------------------------------------- */

// APEX's personality when talking DIRECTLY TO THE USER (chat, calendar/email
// summaries, confirmations). Deliberately NOT used for drafting emails to other
// people — see the isolated prompt in draftEmail() — "sir" and the wit are how
// APEX talks to its own user, never how it talks to someone else on his behalf.
function systemBase() {
  return `You are A.P.E.X. (Adaptive Personal Executive Xpert) — the user's personal AI ` +
    `assistant, and basically his best friend. Always address him as "sir", woven in ` +
    `naturally (greetings, acknowledgments, sign-offs) — don't force it into every single ` +
    `sentence. Your voice is witty, warm, a little playful and confident, like a sharp friend ` +
    `who also happens to be a world-class executive assistant. Be genuinely funny AND ` +
    `genuinely useful — never sacrifice usefulness for the joke. Stay concise. Use the CONTEXT ` +
    `below when relevant; never invent facts that aren't given.`;
}

function contextBlock(packet, { calendar, emails, user, health } = {}) {
  const parts = ["CONTEXT:"];
  if (user) parts.push("About the user (sir): " + user);
  if (health) parts.push("Today's fitness snapshot: " + health);
  if (packet.memory_needed && packet.loaded_records?.length) {
    parts.push("Memory: " + JSON.stringify(packet.loaded_records));
  }
  if (calendar !== undefined) {
    parts.push(calendar.length
      ? "Calendar (upcoming):\n" + calendar.map((e) => `- ${e.title} (${e.start} to ${e.end})${e.location ? ` @ ${e.location}` : ""}`).join("\n")
      : "Calendar: no events in range.");
  }
  if (emails !== undefined) {
    parts.push(emails.length
      ? "Emails found:\n" + emails.map((m) => `- [${m.id}] from ${m.sender} | ${m.subject} | ${m.snippet}`).join("\n")
      : "Emails: no matches found.");
  }
  return parts.join("\n");
}

function memoryOnlyFallback(packet, err) {
  const base = "(A.P.E.X., running on fumes, sir — no AI brain reachable right now) ";
  if (packet.memory_needed && packet.loaded_records?.length) {
    const names = packet.loaded_records.map((r) => r.display_name).join(", ");
    return base + `Here's what I remember: ${names}. Add a Groq or Gemini key in Settings and I'll be properly useful again.`;
  }
  return base + "Add a Groq or Gemini key in Settings, sir, and we'll be back in business.";
}
