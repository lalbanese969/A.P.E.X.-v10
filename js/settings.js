/* ============================================================================
   [MODULE: settings.js]
   User-configurable settings: AI provider keys + models, and labeled email/
   calendar accounts. Replaces backend/settings.py + config/*.json.

   Security model (intentional, discussed at length): there is NO server, so
   there is no server-side secret store. Your Groq/Gemini key is typed into
   THIS browser's Settings UI and lives only in THIS browser's localStorage —
   never written to any file that could be committed to git, never sent
   anywhere except directly to Groq/Gemini's own API when you chat.
   ============================================================================ */

import { getItem, setItem, ensureSeeded } from "./storage.js";
import { SEED_ACCOUNTS, GOOGLE_CALENDAR_COLORS, DEFAULT_CALENDAR_COLOR_ID, SEED_CALENDAR_CATEGORIES } from "./seedData.js";

ensureSeeded("connections.accounts", SEED_ACCOUNTS);
ensureSeeded("calendar.categories", SEED_CALENDAR_CATEGORIES);
ensureSeeded("calendar.defaultColorId", DEFAULT_CALENDAR_COLOR_ID);

const DEFAULT_SETTINGS = {
  groqApiKey: "",
  geminiApiKey: "",
  groqModel: "llama-3.3-70b-versatile",
  // cheaper/faster Groq model for internal background tasks (e.g. memory extraction)
  groqFastModel: "llama-3.1-8b-instant",
  geminiModel: "gemini-2.0-flash",
};
ensureSeeded("settings", DEFAULT_SETTINGS);

export function getSettings() {
  return { ...DEFAULT_SETTINGS, ...getItem("settings", {}) };
}

/** Shallow-merge a patch into settings (blank/undefined values are ignored so they don't clear an existing key). */
export function updateSettings(patch) {
  const current = getSettings();
  for (const [k, v] of Object.entries(patch)) {
    if (v !== "" && v !== undefined && v !== null) current[k] = v;
  }
  setItem("settings", current);
  return current;
}

/* ---- accounts (email + calendar) ------------------------------------------- */

export function listAccounts() {
  return getItem("connections.accounts", SEED_ACCOUNTS).accounts || [];
}

export function listCalendars() {
  return getItem("connections.accounts", SEED_ACCOUNTS).calendars || [];
}

export function getAccount(id) {
  return listAccounts().find((a) => a.id === id) || null;
}

export function addAccount({ type, address, label, purpose }) {
  const data = getItem("connections.accounts", SEED_ACCOUNTS);
  const t = ["gmail", "outlook"].includes((type || "").toLowerCase()) ? type.toLowerCase() : "gmail";
  const local = (address || "").split("@")[0].toLowerCase().replace(/[^a-z0-9]+/g, "_") || "account";
  const existingIds = new Set(data.accounts.map((a) => a.id));
  let id = `${t}_${local}`, n = 2;
  while (existingIds.has(id)) { id = `${t}_${local}_${n}`; n++; }
  data.accounts.push({ id, label: label || address || t, type: t, address: address || "", purpose: purpose || "", status: "not_connected" });
  setItem("connections.accounts", data);
  return id;
}

export function removeAccount(id) {
  const data = getItem("connections.accounts", SEED_ACCOUNTS);
  data.accounts = data.accounts.filter((a) => a.id !== id);
  setItem("connections.accounts", data);
}

export function updateAccountLabels(updates) {
  const data = getItem("connections.accounts", SEED_ACCOUNTS);
  const byId = new Map(updates.map((u) => [u.id, u]));
  for (const acct of data.accounts) {
    const u = byId.get(acct.id);
    if (u) {
      if (u.label !== undefined) acct.label = u.label;
      if (u.purpose !== undefined) acct.purpose = u.purpose;
    }
  }
  setItem("connections.accounts", data);
  return data.accounts;
}

/* ---- calendar colors + categories ------------------------------------------
   The exact Google Calendar colors, plus a colorId -> category-keywords map so
   APEX can pick the right color when you ask it to add an event. */

export function getCalendarColors() {
  return GOOGLE_CALENDAR_COLORS;
}

export function getColorById(id) {
  return GOOGLE_CALENDAR_COLORS.find((c) => c.id === String(id))
      || GOOGLE_CALENDAR_COLORS.find((c) => c.id === getDefaultColorId());
}

export function getCalendarCategories() {
  return getItem("calendar.categories", SEED_CALENDAR_CATEGORIES);
}

export function setCalendarCategories(map) {
  setItem("calendar.categories", map);
}

export function getDefaultColorId() {
  return getItem("calendar.defaultColorId", DEFAULT_CALENDAR_COLOR_ID);
}

export function setDefaultColorId(id) {
  setItem("calendar.defaultColorId", String(id));
}

/** Pick a Google colorId for an event title by matching category keywords;
    falls back to the default ("Other") color when nothing matches. */
export function colorIdForTitle(title) {
  const t = (title || "").toLowerCase();
  const cats = getCalendarCategories();
  for (const [colorId, kws] of Object.entries(cats)) {
    const words = String(kws).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (words.some((w) => w && t.includes(w))) return colorId;
  }
  return getDefaultColorId();
}

/** Status snapshot for the UI's status strip — booleans only, never key values. */
export function statusSnapshot() {
  const s = getSettings();
  return {
    groq: { configured: !!s.groqApiKey },
    gemini: { configured: !!s.geminiApiKey },
    accounts: listAccounts().map((a) => ({ id: a.id, label: a.label, type: a.type, status: a.status })),
    calendars: listCalendars().map((c) => ({ id: c.id, label: c.label, status: c.status })),
  };
}
