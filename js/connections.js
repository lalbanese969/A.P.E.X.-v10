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
import * as google from "./google.js";

for (const [acctId, msgs] of Object.entries(SEED_EMAIL_MESSAGES)) {
  ensureSeeded(`connections.emailMessages.${acctId}`, msgs);
}
ensureSeeded("connections.calendarEvents", buildSeedCalendarEvents());
ensureSeeded("logs.backend", buildSeedLogs());
ensureSeeded("automation.timers", SEED_TIMERS);

/* ---- email -------------------------------------------------------------------
   These are Gmail-aware: when the user has connected their real Gmail (js/google.js),
   they hit the live Gmail API; otherwise they fall back to the local MOCK data so
   the app still works with zero setup. All four are ASYNC (a real network call when
   connected), so callers must await them.

   Connection state for the UI: */
export function isEmailConnected() { return google.isConnected(); }
export function connectedEmailAddress() { return google.connectedEmail(); }

export async function listRecentEmail(accountId, limit = 10) {
  if (google.isConnected()) {
    try { return await google.listRecent(limit); }
    catch (e) { console.warn("Gmail listRecent failed — falling back to mock:", e); }
  }
  const acctId = accountId || (listAccounts()[0] || {}).id;
  const msgs = getItem(`connections.emailMessages.${acctId}`, []);
  return [...msgs].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, limit);
}

export async function searchEmail(query, accountId, limit = 10) {
  if (google.isConnected()) {
    try { return await google.searchMessages(query, limit); }
    catch (e) { console.warn("Gmail search failed — falling back to mock:", e); }
  }
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

export async function getEmail(accountId, messageId) {
  if (google.isConnected()) {
    try { return await google.getMessageById(messageId); }
    catch (e) { console.warn("Gmail get failed — falling back to mock:", e); }
  }
  const msgs = getItem(`connections.emailMessages.${accountId}`, []);
  return msgs.find((m) => m.id === messageId) || null;
}

/** Save a draft. Connected → creates a REAL draft in the user's Gmail Drafts (nothing
    sent). Not connected → local mock store. Returns a draft object with an id/status. */
export async function createDraft({ to, subject, body, accountId, inReplyTo }) {
  if (google.isConnected()) {
    try {
      const d = await google.createDraft({ to, subject, body });
      return { id: d.id, to, subject, body, account_id: accountId || null,
        in_reply_to: inReplyTo || null, created_at: new Date().toISOString(),
        status: "gmail_draft", gmail_draft_id: d.id };
    } catch (e) { console.warn("Gmail draft failed — saving a local mock draft instead:", e); }
  }
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

/** Actually SEND an email through the connected Gmail. Irreversible — callers must
    confirm first. Throws if Gmail isn't connected (we never "mock-send"). */
export async function sendEmail({ to, subject, body }) {
  if (!google.isConnected()) throw new Error("Connect Gmail first, sir — I won't pretend-send.");
  const res = await google.sendMessage({ to, subject, body });
  return { id: (res && res.id) || null, to, subject, body, status: "sent", sent_at: new Date().toISOString() };
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

export function getEventById(id) {
  return allEvents().find((e) => e.id === id) || null;
}

export function deleteCalendarEvent(id) {
  setItem("connections.calendarEvents", allEvents().filter((e) => e.id !== id));
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

/* ---- backend logs + automation timers ---------------------------------------
   Timers are configuration ONLY right now — there is no scheduler/executor
   wired up yet, so enabling a timer here doesn't make anything run. This is the
   settings surface for the automation system described in BUILD_PLAN.md. */

export function listBackendLogs() {
  return getItem("logs.backend", []);
}

export function listTimers() {
  return getItem("automation.timers", []);
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function fmtTimeOfDay(hhmm) {
  const [h, m] = (hhmm || "00:00").split(":").map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** Human-readable description of a timer's schedule (display only). */
export function describeSchedule(t) {
  if (t.type === "daily") return `Daily · ${fmtTimeOfDay(t.time)}`;
  if (t.type === "weekly") return `Weekly · ${WEEKDAY_NAMES[t.day]} · ${fmtTimeOfDay(t.time)}`;
  if (t.type === "interval") return `Every ${t.intervalHours} hour${t.intervalHours === 1 ? "" : "s"}`;
  return "Custom";
}

/** Best-effort "next run" estimate for display — cosmetic only, nothing actually schedules this. */
export function estimateNext(t) {
  const now = new Date();
  if (t.type === "interval") {
    const next = new Date(now.getTime() + (t.intervalHours || 1) * 3600000);
    return `~${next.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}`;
  }
  const [h, m] = (t.time || "00:00").split(":").map(Number);
  const next = new Date(now);
  next.setHours(h, m, 0, 0);
  if (t.type === "weekly") {
    const delta = ((t.day ?? 0) - next.getDay() + 7) % 7;
    next.setDate(next.getDate() + delta);
    if (delta === 0 && next <= now) next.setDate(next.getDate() + 7);
  } else if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  return next.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
}

export function addTimer({ name, type, time, day, intervalHours }) {
  const timers = listTimers();
  const t = {
    id: `timer_${Date.now()}`, name: name || "New timer", type: type || "daily",
    time: time || "08:00", day: day !== undefined ? Number(day) : 0,
    intervalHours: intervalHours ? Number(intervalHours) : 6, enabled: true,
  };
  timers.push(t);
  setItem("automation.timers", timers);
  return t;
}

export function updateTimer(id, patch) {
  const timers = listTimers();
  const t = timers.find((x) => x.id === id);
  if (t) Object.assign(t, patch);
  setItem("automation.timers", timers);
  return t;
}

export function toggleTimer(id) {
  const t = listTimers().find((x) => x.id === id);
  if (t) updateTimer(id, { enabled: !t.enabled });
}

export function removeTimer(id) {
  setItem("automation.timers", listTimers().filter((x) => x.id !== id));
}
