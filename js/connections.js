/* ============================================================================
   [MODULE: connections.js]
   Mock email + calendar "hands" — ported from backend/connections/{email,calendar}/mock.py.
   Same mock-first philosophy: sample data now (incl. the DocuSign email), real
   Gmail/Outlook/Google Calendar OAuth (browser-side, like the old mailcal
   project) is a deliberate later step — see docs/BUILD_PLAN.md.

   Storage keys:
     apex.connections.accounts            -> { accounts: [...], calendars: [...] }  (settings.js owns this)
     apex.connections.emailMessages.<id>  -> array of mock messages for that account
     apex.connections.calendarEvents      -> array of mock events
     apex.connections.drafts              -> array of saved drafts (never sent)
   ============================================================================ */

import { getItem, setItem, ensureSeeded } from "./storage.js";
import { SEED_EMAIL_MESSAGES, buildSeedCalendarEvents, buildSeedLogs, SEED_TIMERS } from "./seedData.js";
import { listAccounts } from "./settings.js";

for (const [acctId, msgs] of Object.entries(SEED_EMAIL_MESSAGES)) {
  ensureSeeded(`connections.emailMessages.${acctId}`, msgs);
}
ensureSeeded("connections.calendarEvents", buildSeedCalendarEvents());
ensureSeeded("logs.backend", buildSeedLogs());
ensureSeeded("automation.timers", SEED_TIMERS);

/* ---- email ------------------------------------------------------------------ */

export function listRecentEmail(accountId, limit = 10) {
  const acctId = accountId || (listAccounts()[0] || {}).id;
  const msgs = getItem(`connections.emailMessages.${acctId}`, []);
  return [...msgs].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, limit);
}

export function searchEmail(query, accountId, limit = 10) {
  const acctId = accountId || (listAccounts()[0] || {}).id;
  const msgs = getItem(`connections.emailMessages.${acctId}`, []);
  const terms = (query || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const scored = msgs.map((m) => {
    const hay = `${m.sender} ${m.subject} ${m.body}`.toLowerCase();
    const score = terms.reduce((s, t) => s + (hay.split(t).length - 1), 0);
    return { m, score };
  }).filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.m);
}

export function getEmail(accountId, messageId) {
  const msgs = getItem(`connections.emailMessages.${accountId}`, []);
  return msgs.find((m) => m.id === messageId) || null;
}

/** Save a draft (mock store, logged, NEVER sent). Returns the saved draft with an id. */
export function createDraft({ to, subject, body, accountId, inReplyTo }) {
  const drafts = getItem("connections.drafts", []);
  const draft = {
    id: `draft_${Date.now()}`,
    to, subject, body,
    account_id: accountId || (listAccounts()[0] || {}).id,
    in_reply_to: inReplyTo || null,
    created_at: new Date().toISOString(),
    status: "mock_draft",
  };
  drafts.push(draft);
  setItem("connections.drafts", drafts);
  return draft;
}

export function listDrafts() {
  return getItem("connections.drafts", []);
}

/* ---- calendar ----------------------------------------------------------------- */

export function allEvents() {
  return getItem("connections.calendarEvents", []);
}

export function upcomingEvents(days = 7) {
  const events = allEvents();
  const now = new Date();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + days);
  cutoff.setHours(23, 59, 59, 999);
  const todayStr = localDateStr(now);
  return events
    .filter((e) => {
      const start = new Date(e.start);
      return (start >= startOfToday(now) && start <= cutoff) || e.start.startsWith(todayStr);
    })
    .sort((a, b) => (a.start < b.start ? -1 : 1));
}

/** All events whose start falls in the given month (0-based month), sorted. */
export function eventsForMonth(year, month) {
  return allEvents()
    .filter((e) => {
      const d = new Date(e.start);
      return d.getFullYear() === year && d.getMonth() === month;
    })
    .sort((a, b) => (a.start < b.start ? -1 : 1));
}

/** Create a calendar event (mock — stored locally, nothing sent to a real calendar). */
export function addCalendarEvent({ title, start, end, location = "", colorId = "7", notes = "" }) {
  const events = allEvents();
  const ev = {
    id: `evt_${Date.now()}`,
    calendar_id: "gcal_primary",
    title, start, end, location, notes, colorId,
  };
  events.push(ev);
  setItem("connections.calendarEvents", events);
  return ev;
}

function startOfToday(d) {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return s;
}
function localDateStr(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* ---- backend logs + automation timers (mock, for the Logs page) ------------- */

export function listBackendLogs() {
  return getItem("logs.backend", []);
}

export function listTimers() {
  return getItem("automation.timers", []);
}
