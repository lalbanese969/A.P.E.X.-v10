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
import { SEED_ACCOUNTS } from "./seedData.js";

ensureSeeded("connections.accounts", SEED_ACCOUNTS);

const DEFAULT_SETTINGS = {
  groqApiKey: "",
  geminiApiKey: "",
  groqModel: "llama-3.3-70b-versatile",
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
