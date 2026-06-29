/* ============================================================================
   [MODULE: memory.js]
   Ported from the Python backend's backend/memory/{catalog,resolver,packet_builder,
   schemas,profile}.py. Same design: a small CATALOG (table of contents) is scanned,
   a RESOLVER scores which records are relevant to a prompt, and a PACKET BUILDER
   loads only the relevant sections — never the whole memory store — into a small
   Memory Packet for the AI.

   Storage keys (see storage.js):
     apex.memory.catalog            -> { cards: [...] }
     apex.memory.people.<id>        -> person record
     apex.memory.projects.<id>      -> project record
     apex.memory.profile            -> apex self-profile
     apex.memory.writingStyle       -> learned writing style
     apex.logs.memoryWrite          -> proposed writes (non-destructive, like the old writer.py)
     apex.logs.memoryResolution     -> one entry per resolution (like memory_resolution_log.jsonl)
   ============================================================================ */

import { getItem, setItem, ensureSeeded, appendLog } from "./storage.js";
import { SEED_CATALOG, SEED_PEOPLE, SEED_PROJECTS, SEED_PROFILE, SEED_WRITING_STYLE, SEED_USER } from "./seedData.js";
import { getSettings } from "./settings.js";
import { runTask } from "./aiCenter.js";

/* ---- seed once on first load -------------------------------------------- */
ensureSeeded("memory.catalog", SEED_CATALOG);
for (const [id, rec] of Object.entries(SEED_PEOPLE)) ensureSeeded(`memory.people.${id}`, rec);
for (const [id, rec] of Object.entries(SEED_PROJECTS)) ensureSeeded(`memory.projects.${id}`, rec);
ensureSeeded("memory.profile", SEED_PROFILE);
ensureSeeded("memory.writingStyle", SEED_WRITING_STYLE);
ensureSeeded("memory.user", SEED_USER);

/* ---- catalog -------------------------------------------------------------- */

export function loadCatalog() {
  return getItem("memory.catalog", SEED_CATALOG);
}

export function iterCards() {
  return loadCatalog().cards || [];
}

export function loadRecord(card) {
  const bucket = card.type === "person" ? "memory.people" : "memory.projects";
  return getItem(`${bucket}.${card.id}`, null);
}

/* ---- resolver --------------------------------------------------------------
   V1 strategy (unchanged from the Python version): score each catalog card by
   overlap between the prompt and its aliases/display_name/relationship/tags/
   summary_card. A clearly-labeled stand-in for future semantic search. */

const W_DISPLAY_NAME = 5.0;
const W_ALIAS = 5.0;
const W_RELATIONSHIP = 4.0;
const W_TAG = 2.0;
const W_SUMMARY = 1.0;
const MIN_SCORE = 1.0;

const SECTION_KEYWORDS = {
  birthday: ["birthday", "born", "age", "old", "how old"],
  gift_ideas: ["gift", "present", "buy", "get her", "get him", "get them", "birthday"],
  preferences: ["prefer", "preference", "like", "likes", "favorite", "favourite"],
  likes: ["like", "likes", "into", "enjoy"],
  dislikes: ["dislike", "hate", "hates", "avoid"],
  favorite_foods: ["food", "eat", "restaurant", "dinner", "lunch", "sushi"],
  hobbies: ["hobby", "hobbies", "does for fun", "free time"],
  important_notes: ["allergy", "allergic", "note", "important", "remember"],
  goals: ["goal", "goals", "trying to", "aim"],
  status: ["status", "progress", "where are we"],
  components: ["component", "parts", "subsystem", "modules"],
  decisions: ["decision", "decided", "chose"],
  open_questions: ["open question", "undecided", "question"],
};
const DEFAULT_SECTIONS = ["identity", "preferences", "summary", "status", "goals"];

function tokens(text) {
  return (text || "").toLowerCase().match(/[a-z0-9']+/g) || [];
}

function collapse(text) {
  return (text || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** True if `phrase` is present — substring for multi-word, token match for single words,
    punctuation-collapsed fallback (>=4 chars) so "A.P.E.X."/"apex" match each other. */
function phraseIn(phrase, promptLower, promptTokenSet, promptCollapsed) {
  if (!phrase) return false;
  phrase = phrase.toLowerCase().trim();
  if (phrase.includes(" ")) {
    if (promptLower.includes(phrase)) return true;
  } else if (promptTokenSet.has(phrase)) {
    return true;
  }
  const collapsed = collapse(phrase);
  if (promptCollapsed && collapsed.length >= 4 && promptCollapsed.includes(collapsed)) return true;
  return false;
}

function suggestSections(promptLower, card) {
  const available = new Set(card.available_sections || []);
  const chosen = available.has("identity") ? ["identity"] : [];
  for (const [section, keywords] of Object.entries(SECTION_KEYWORDS)) {
    if (!available.has(section)) continue;
    if (keywords.some((kw) => promptLower.includes(kw)) && !chosen.includes(section)) {
      chosen.push(section);
    }
  }
  if (chosen.length <= 1) {
    for (const section of DEFAULT_SECTIONS) {
      if (available.has(section) && !chosen.includes(section)) chosen.push(section);
    }
  }
  return chosen;
}

export function resolve(prompt, sessionContext = null, limit = 5) {
  const haystack = `${prompt} ${sessionContext || ""}`;
  const promptLower = haystack.toLowerCase();
  const promptTokenSet = new Set(tokens(haystack));
  const promptCollapsed = collapse(promptLower);

  const candidates = [];
  for (const card of iterCards()) {
    let score = 0;
    const matchedOn = [];

    if (phraseIn(card.display_name, promptLower, promptTokenSet, promptCollapsed)) {
      score += W_DISPLAY_NAME;
      matchedOn.push(`name:${card.display_name}`);
    }
    for (const alias of card.aliases || []) {
      if (phraseIn(alias, promptLower, promptTokenSet, promptCollapsed)) {
        score += W_ALIAS;
        matchedOn.push(`alias:${alias}`);
        break;
      }
    }
    if (card.relationship_to_user && phraseIn(card.relationship_to_user, promptLower, promptTokenSet, promptCollapsed)) {
      score += W_RELATIONSHIP;
      matchedOn.push(`relationship:${card.relationship_to_user}`);
    }
    for (const tag of card.tags || []) {
      if (promptTokenSet.has(tag.toLowerCase())) {
        score += W_TAG;
        matchedOn.push(`tag:${tag}`);
      }
    }
    const summaryTokens = new Set(tokens(card.summary_card));
    const meaningful = [...promptTokenSet].filter((w) => summaryTokens.has(w) && w.length > 3);
    if (meaningful.length) {
      score += W_SUMMARY * meaningful.length;
      matchedOn.push(`summary:${meaningful.sort().join(",")}`);
    }

    if (score >= MIN_SCORE) {
      candidates.push({ card, score: Math.round(score * 100) / 100, matchedOn, suggestedSections: suggestSections(promptLower, card) });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, limit);
}

/* ---- packet builder --------------------------------------------------------- */

const PERSON_SECTIONS = {
  identity: ["display_name", "first_name", "last_name", "aliases", "relationship_to_user"],
  birthday: ["birthday"],
  preferences: ["preferences"],
  likes: ["likes"],
  dislikes: ["dislikes"],
  favorite_foods: ["favorite_foods"],
  favorite_places: ["favorite_places"],
  hobbies: ["hobbies"],
  gift_ideas: ["gift_ideas"],
  important_notes: ["important_notes"],
};
const PROJECT_SECTIONS = {
  identity: ["display_name", "status"],
  status: ["status"],
  summary: ["summary"],
  goals: ["goals"],
  components: ["components"],
  decisions: ["decisions"],
  open_questions: ["open_questions"],
};
const SECTION_MAPS = { person: PERSON_SECTIONS, project: PROJECT_SECTIONS };

export function computeAge(birthday, on = new Date()) {
  if (!birthday) return null;
  const b = new Date(birthday + "T00:00:00");
  if (isNaN(b.getTime())) return null;
  let years = on.getFullYear() - b.getFullYear();
  const beforeBday = on.getMonth() < b.getMonth() ||
    (on.getMonth() === b.getMonth() && on.getDate() < b.getDate());
  if (beforeBday) years -= 1;
  return years;
}

function extractSections(record, recordType, sections) {
  const fieldMap = SECTION_MAPS[recordType] || {};
  const out = {};
  for (const section of sections) {
    const fields = fieldMap[section];
    if (!fields) continue;
    const chunk = {};
    for (const f of fields) {
      const v = record[f];
      if (v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0)) chunk[f] = v;
    }
    if (section === "birthday" && record.birthday) {
      chunk.birthday = record.birthday;
      chunk.age = computeAge(record.birthday);
    }
    if (Object.keys(chunk).length) out[section] = chunk;
  }
  return out;
}

export function buildPacket(prompt, sessionContext = null) {
  const candidates = resolve(prompt, sessionContext);
  if (!candidates.length) return { memory_needed: false, query: prompt, loaded_records: [] };

  const loadedRecords = candidates.map(({ card, score, matchedOn, suggestedSections }) => {
    const record = loadRecord(card) || {};
    const summary = extractSections(record, card.type, suggestedSections);
    return {
      id: card.id,
      type: card.type,
      display_name: card.display_name,
      relationship_to_user: card.relationship_to_user,
      sections_loaded: suggestedSections.filter((s) => s in summary),
      summary,
      _match: { score, matchedOn },
    };
  });

  logResolution(prompt, candidates, loadedRecords);
  return { memory_needed: true, query: prompt, loaded_records: loadedRecords };
}

function logResolution(prompt, candidates, loadedRecords) {
  const packetJson = JSON.stringify(loadedRecords);
  appendLog("logs.memoryResolution", {
    timestamp: new Date().toISOString(),
    user_prompt: prompt,
    records_considered: candidates.map((c) => ({ id: c.card.id, score: c.score, matchedOn: c.matchedOn })),
    records_loaded: loadedRecords.map((r) => r.id),
    approx_tokens: Math.round(packetJson.length / 4),
  });
}

/* ---- self profile + writing style (apex_self) -------------------------------- */

export function profileSummary() {
  const p = getItem("memory.profile", SEED_PROFILE);
  return { identity: p.identity, tone: p.tone?.value };
}

export function writingStyleBrief() {
  const s = getItem("memory.writingStyle", SEED_WRITING_STYLE);
  const d = s.defaults || {};
  const parts = [
    `Tone: ${s.tone || "friendly and professional"}.`,
    `Length: ${d.length || "concise"}, formality: ${d.formality || "medium"}.`,
    `Sign-off: '${d.sign_off || "Thanks,"}'.`,
  ];
  if (s.learned_preferences?.length) {
    parts.push("Learned preferences: " + s.learned_preferences.map((p) => p.preference).filter(Boolean).join("; "));
  }
  return parts.join(" ");
}

export function addStylePreference(preference, source = "user_feedback") {
  const style = getItem("memory.writingStyle", SEED_WRITING_STYLE);
  style.learned_preferences = style.learned_preferences || [];
  style.learned_preferences.push({ date: new Date().toISOString().slice(0, 10), preference: preference.trim(), source });
  setItem("memory.writingStyle", style);
  return style;
}

/* ---- writer placeholder (non-destructive, like the old writer.py) ------------ */

const PATTERNS = [
  { kind: "explicit_remember", re: /\bremember that\b(.+)/i, note: "User explicitly asked to remember something." },
  { kind: "birthday", re: /\b(?:my|her|his|their)?\s*birthday is\b(.+)/i, note: "Possible birthday fact." },
  { kind: "preference_like", re: /\b(\w+) (?:likes|loves|enjoys|prefers)\b(.+)/i, note: "Possible preference/like." },
];

export function reviewInteraction(userPrompt, assistantResponse = "") {
  const candidates = [];
  for (const pat of PATTERNS) {
    const m = pat.re.exec(userPrompt || "");
    if (m) {
      const snippet = (m[1] || m[0]).trim();
      candidates.push({ kind: pat.kind, note: pat.note, snippet, source: "user_prompt" });
    }
  }
  if (candidates.length) {
    appendLog("logs.memoryWrite", {
      timestamp: new Date().toISOString(), status: "proposed",
      candidates, user_prompt: userPrompt, assistant_response: assistantResponse,
    });
  }
  return { should_write: candidates.length > 0, candidates };
}

/* ============================================================================
   MEMORY WRITING v1 — actually saves facts (silent, background).
   Flow: learnFromInteraction() -> extractFacts() [Groq, gated] -> resolve target
   -> applyFact() [safe append-only / set-if-empty]. Every applied change is logged
   to apex.memory.writes so undoLastWrite() can revert it. Nothing is shown in the UI.
   ============================================================================ */

const USER_KEY = "memory.user";

// attribute -> { record field, op }. Everything ambiguous/descriptive routes to
// important_notes (safe append). Only birthday is a scalar (set-if-empty).
const ATTR_FIELD = {
  like:           { field: "likes",           op: "array" },
  dislike:        { field: "dislikes",        op: "array" },
  favorite_food:  { field: "favorite_foods",  op: "array" },
  hobby:          { field: "hobbies",         op: "array" },
  gift_idea:      { field: "gift_ideas",      op: "array" },
  important_date: { field: "important_dates", op: "array" },
  birthday:       { field: "birthday",        op: "scalar" },
  note:           { field: "important_notes", op: "array" },
  preference:     { field: "important_notes", op: "array" },
  name_part:      { field: "important_notes", op: "array" },
  location:       { field: "important_notes", op: "array" },
};

const nowIso = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const factValueString = (v) => (typeof v === "string" ? v : (v && v.value) ? String(v.value) : JSON.stringify(v)).trim();
const displayName = (rec) => rec.display_name || (rec.type === "user" ? "you" : "someone");

/** Compact string of known facts about the USER — injected into every prompt's context. */
export function userBrief() {
  const u = getItem(USER_KEY, SEED_USER);
  const parts = [];
  if (u.birthday) parts.push(`birthday ${u.birthday}`);
  if (u.likes?.length) parts.push(`likes: ${u.likes.join(", ")}`);
  if (u.dislikes?.length) parts.push(`dislikes: ${u.dislikes.join(", ")}`);
  if (u.favorite_foods?.length) parts.push(`favorite foods: ${u.favorite_foods.join(", ")}`);
  if (u.hobbies?.length) parts.push(`hobbies: ${u.hobbies.join(", ")}`);
  if (u.important_notes?.length) parts.push(`notes: ${u.important_notes.join("; ")}`);
  return parts.length ? parts.join(" | ") : "";
}

function resolveTargetKey(fact) {
  const t = String(fact.target || "").trim().toLowerCase();
  if (fact.targetType === "user" || !t || ["user", "me", "myself", "i"].includes(t)) return USER_KEY;
  const cands = resolve(fact.target);
  if (cands.length && cands[0].card.type === "person") return `memory.people.${cands[0].card.id}`;
  return null; // unknown person — not auto-created in v1
}

/** Apply one fact to the record at `recordKey`. Returns a summary string if it
    wrote something, else null. Append-only for arrays, set-if-empty for scalars. */
export function applyFact(recordKey, fact) {
  const map = ATTR_FIELD[fact.attribute];
  if (!map) return null;
  const record = getItem(recordKey, null);
  if (!record) return null;
  const val = factValueString(fact.value);
  if (!val) return null;

  if (map.op === "array") {
    record[map.field] = record[map.field] || [];
    const dup = record[map.field].some((x) => factValueString(x).toLowerCase() === val.toLowerCase());
    if (dup) return null;
    record[map.field].push(val);
    record.last_updated = today();
    setItem(recordKey, record);
    appendLog("memory.writes", { ts: nowIso(), recordKey, field: map.field, op: "array_append", value: val, prevValue: null });
    return `${displayName(record)} · ${map.field} += ${val}`;
  }

  // scalar: set only if empty; never overwrite a conflicting value
  const cur = record[map.field];
  if (cur && String(cur).toLowerCase() === val.toLowerCase()) return null;
  if (cur) {
    appendLog("memory.writes", { ts: nowIso(), recordKey, field: map.field, op: "conflict", value: val, prevValue: cur, applied: false });
    return null;
  }
  record[map.field] = val;
  record.last_updated = today();
  setItem(recordKey, record);
  appendLog("memory.writes", { ts: nowIso(), recordKey, field: map.field, op: "scalar_set", value: val, prevValue: cur ?? null });
  return `${displayName(record)} · ${map.field} = ${val}`;
}

/** Cheap gate so the extraction AI call only fires when there's plausibly a fact. */
function hasFactSignal(p) {
  const t = (p || "").toLowerCase();
  return /\b(remember|don'?t forget|note that|for the record|fyi|keep in mind|by the way)\b/.test(t)
    || /\b(my|his|her|their|our)\b[^.?!]*\b(is|are|was|likes?|loves?|hates?|prefers?|birthday|allerg|favou?rite|name|lives?)\b/.test(t)
    || /\b\w+\s+(likes|loves|hates|prefers|is allergic)\b/.test(t)
    || /\bbirthday\b/.test(t)
    || /\b(sister|brother|mom|mother|dad|father|friend|coworker|colleague|boss|girlfriend|boyfriend|wife|husband|partner|son|daughter)\b/.test(t);
}

function stripFences(s) {
  return String(s || "").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

/** Ask Groq (fast model, JSON) to extract durable facts. Returns [] if gated out / on any error. */
export async function extractFacts(userPrompt, apexResponse = "") {
  if (!hasFactSignal(userPrompt)) return [];
  const sys =
    "You extract durable personal facts worth remembering from a chat, as JSON. " +
    "Return ONLY a JSON object: {\"facts\":[{\"target\":string,\"targetType\":\"user\"|\"person\"," +
    "\"attribute\":string,\"value\":string,\"confidence\":number}]}. " +
    "targetType is \"user\" if the fact is about the user himself, else \"person\". " +
    "target is the person's name, or \"user\". attribute is ONE of: like, dislike, favorite_food, " +
    "hobby, gift_idea, note, preference, birthday, important_date, name_part, location. " +
    "value is a short string. confidence is 0-1. Only include facts EXPLICITLY stated by the user. " +
    "If there are none, return {\"facts\":[]}.";
  const user = `User said: "${userPrompt}"\nAssistant replied: "${apexResponse}"\nExtract the facts as JSON.`;
  try {
    const model = getSettings().groqFastModel;
    const r = await runTask("extract_memory", [
      { role: "system", content: sys }, { role: "user", content: user },
    ], { model, jsonMode: true });
    const parsed = JSON.parse(stripFences(r.text));
    const facts = Array.isArray(parsed) ? parsed : (parsed.facts || []);
    return facts.filter((f) => f && f.attribute && f.value);
  } catch (e) {
    return [];
  }
}

/** Orchestrate: extract -> resolve -> apply. Silent. Returns {saved, proposals}. */
export async function learnFromInteraction(userPrompt, apexResponse = "") {
  reviewInteraction(userPrompt, apexResponse); // keep the cheap regex proposal log too
  let facts = [];
  try { facts = await extractFacts(userPrompt, apexResponse); } catch (e) { facts = []; }

  const saved = [], proposals = [];
  for (const f of facts) {
    if ((f.confidence ?? 1) < 0.6) { proposals.push(f); continue; }
    const key = resolveTargetKey(f);
    if (!key) {
      appendLog("logs.memoryWrite", { timestamp: nowIso(), status: "proposed_unknown_target", fact: f });
      proposals.push(f);
      continue;
    }
    const summary = applyFact(key, f);
    if (summary) saved.push(summary);
  }
  return { saved, proposals };
}

/** Revert the most recent applied write (internal safety; no UI). */
export function undoLastWrite() {
  const writes = getItem("memory.writes", []);
  for (let i = writes.length - 1; i >= 0; i--) {
    const w = writes[i];
    if (w.op === "conflict") continue;
    const record = getItem(w.recordKey, null);
    if (record) {
      if (w.op === "array_append") {
        record[w.field] = (record[w.field] || []).filter(
          (x) => factValueString(x).toLowerCase() !== factValueString(w.value).toLowerCase());
      } else if (w.op === "scalar_set") {
        record[w.field] = w.prevValue;
      }
      setItem(w.recordKey, record);
    }
    writes.splice(i, 1);
    setItem("memory.writes", writes);
    return w;
  }
  return null;
}
