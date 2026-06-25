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
import { SEED_EMAIL_MESSAGES, buildSeedCalendarEvents } from "./seedData.js";
import { listAccounts } from "./settings.js";

for (const [acctId, msgs] of Object.entries(SEED_EMAIL_MESSAGES)) {
  ensureSeeded(`connections.emailMessages.${acctId}`, msgs);
}
ensureSeeded("connections.calendarEvents", buildSeedCalendarEvents());

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

export function upcomingEvents(days = 7) {
  const events = getItem("connections.calendarEvents", []);
  const now = new Date();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + days);
  cutoff.setHours(23, 59, 59, 999);
  const todayStr = now.toISOString().slice(0, 10);
  return events
    .filter((e) => {
      const start = new Date(e.start);
      return (start >= startOfToday(now) && start <= cutoff) || e.start.startsWith(todayStr);
    })
    .sort((a, b) => (a.start < b.start ? -1 : 1));
}

function startOfToday(d) {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return s;
}
