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
      const r = await answer(prompt, packet, {});
      result.apex_response = r.text;
      aiMeta = r;
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

  // NUTRITION-LOGGING PATH: "I ate 2 eggs and a bagel" / "drank another 32 oz" ->
  // extract, reuse remembered foods for consistency, write to today's log, and
  // confirm with the running totals. Falls through to normal coaching on failure.
  if (looksLikeNutritionLog(prompt)) {
    try {
      const res = await logNutritionFromText(prompt);
      if (res && (res.logged.length || res.water_oz)) {
        result.intent = "nutrition_log";
        result.apex_response = res.message;
        result.nutrition = res;
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

/* ---- nutrition logging from chat -------------------------------------------- */

// Cheap gate: does this message look like the user logging food/drink?
function looksLikeNutritionLog(p) {
  const t = (p || "").toLowerCase();
  return /\b(i (ate|had|eat|drank|consumed|made)|just (ate|had|drank|made)|log (this|that|it|my)|(for )?(breakfast|lunch|dinner)|as a snack|had a|ate a)\b/.test(t)
    || (/\b\d+(\.\d+)?\s*(oz|ounce|ounces|ml|l|liter|litre|cup|cups|glass|glasses|bottle|bottles)\b/.test(t)
        && /\b(water|drank|drink|drinking|hydrat|fluids?)\b/.test(t));
}

// Compact "today so far vs goal" line for coaching context.
function nutritionTodayLine() {
  const t = nutrition.dayTotals(), g = profile.dailyGoal();
  return `${t.calories}/${g.kcal} kcal, protein ${t.protein}/${g.protein}g, carbs ${t.carbs}/${g.carbs}g, ` +
    `fat ${t.fat}/${g.fat}g, fiber ${t.fiber}/${g.fiber}g, water ${t.water_oz}/${g.water_oz} oz.`;
}

async function logNutritionFromText(prompt) {
  const allergens = profile.getAllergens();
  const sys =
    "Extract food/drink LOGGING from the user's message as JSON, for a nutrition tracker. Return ONLY: " +
    "{\"foods\":[{\"name\":string,\"qty\":number,\"unit\":string,\"calories\":number,\"protein\":number," +
    "\"carbs\":number,\"fat\":number,\"fiber\":number,\"maybe_dairy\":boolean}],\"water_oz\":number}. " +
    "MACROS ARE PER ONE UNIT (one item/serving); qty is how many. Estimate realistic US values. " +
    "Water in fl oz: 'a bottle'≈20, 'a glass'≈8, '1 L'≈34. maybe_dairy=true if it commonly contains " +
    "milk/cheese/butter/cream/whey/casein (user has a dairy allergy: " + allergens.slice(0, 8).join(", ") + "). " +
    "If no food, foods=[]. If no drink, water_oz=0.";
  const model = settingsMod.getSettings().groqFastModel;
  const r = await runTask("nutrition_extract",
    [{ role: "system", content: sys }, { role: "user", content: prompt }], { model, jsonMode: true });
  const parsed = JSON.parse(stripFences(r.text));
  const foods = Array.isArray(parsed.foods) ? parsed.foods : [];
  const water = Math.max(0, Number(parsed.water_oz) || 0);

  const logged = [], dairy = [];
  for (const f of foods) {
    if (!f || !f.name) continue;
    const qty = Number(f.qty) || 1;
    // FOOD MEMORY: if we've logged this before, reuse its macros for consistency.
    const known = nutrition.findFood(f.name);
    const per = known
      ? { calories: known.calories, protein: known.protein, carbs: known.carbs, fat: known.fat, fiber: known.fiber, sodium: known.sodium || 0 }
      : { calories: +f.calories || 0, protein: +f.protein || 0, carbs: +f.carbs || 0, fat: +f.fat || 0, fiber: +f.fiber || 0, sodium: 0 };
    nutrition.logFood({ name: f.name, qty, unit: f.unit || null, ...per,
      source: known ? "memory" : "ai_estimate", confidence: known ? 0.9 : 0.5, dairy: !!f.maybe_dairy });
    logged.push({ name: f.name, qty, unit: f.unit || null, calories: Math.round(per.calories * qty), fromMemory: !!known });
    if (f.maybe_dairy) dairy.push(f.name);
  }
  if (water > 0) nutrition.logWater(water);

  const totals = nutrition.dayTotals(), goal = profile.dailyGoal();
  return { logged, water_oz: water, dairy, totals, goal,
    message: buildLogMessage(logged, water, dairy, totals, goal),
    ai_meta: { provider: r.provider, model: r.model } };
}

function buildLogMessage(logged, water, dairy, totals, goal) {
  const bits = [];
  if (logged.length) {
    bits.push("Logged, sir — " + logged.map((l) =>
      `${l.qty > 1 ? l.qty + "× " : ""}${l.name} (~${l.calories} kcal${l.fromMemory ? ", remembered" : ""})`).join(", ") + ".");
  }
  if (water > 0) bits.push(`+${water} oz water.`);
  const pLeft = Math.max(0, goal.protein - totals.protein);
  bits.push(`Day: ${totals.calories}/${goal.kcal} kcal · protein ${totals.protein}/${goal.protein}g` +
    `${pLeft > 0 ? ` (${pLeft}g to go)` : " ✓"} · water ${totals.water_oz}/${goal.water_oz} oz.`);
  if (dairy.length) bits.push(`Heads up — ${dairy.join(", ")} may contain dairy; check the label (milk-protein allergy).`);
  return bits.join(" ");
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
