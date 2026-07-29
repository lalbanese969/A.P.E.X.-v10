/* ============================================================================
   [MODULE: google.js]
   Browser-side Google sign-in (Google Identity Services) + Gmail REST API.

   WHY THIS EXISTS / HOW IT FITS APEX:
   APEX has no backend. Google supports OAuth entirely in the browser: the
   Google Identity Services (GIS) library hands us a SHORT-LIVED access token
   (~1 hour), and we call the Gmail REST API directly with `fetch()` + that
   token. Nothing goes through a server; no secret is ever written to a file.

   SECURITY MODEL (same spirit as settings.js):
     - The only thing stored in localStorage is your OAuth **Client ID**, which
       is NOT a secret (it's a public identifier, safe to keep in the browser).
     - The access token lives in memory + **sessionStorage** (this tab/session
       only) and is cleared on sign-out / tab close. It is sent ONLY to Google.
     - Scopes are read + compose (draft/send) — see SCOPES below.

   EXTERNAL DEPENDENCY (unavoidable for OAuth, and NOT an npm/build dependency):
   we inject Google's official GIS script tag on demand. That's the one script
   Google requires to run the sign-in flow client-side.

   Storage keys:
     apex.settings.googleClientId  (via settings.js)  -> your OAuth Client ID
     sessionStorage "apex.google.token"               -> { access_token, expires_at, email }
   ============================================================================ */

import { getSettings, updateSettings } from "./settings.js";

// Google's official browser sign-in library (loaded on demand, once).
const GIS_SRC = "https://accounts.google.com/gsi/client";

// What we ask permission for. gmail.compose covers BOTH creating drafts AND
// sending; gmail.readonly covers search/read. (These are "restricted" scopes —
// for a personal app in "Testing" mode you just add yourself as a test user and
// click through Google's "unverified app" screen once.)
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
].join(" ");

const TOKEN_KEY = "apex.google.token"; // sessionStorage (not localStorage — session-scoped)
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

let _gisReady = null;    // Promise that resolves once the GIS script is loaded
let _tokenClient = null; // GIS token client (re-created if the Client ID changes)
let _token = null;       // { access_token, expires_at, email }
let _pending = null;     // { resolve, reject } for the in-flight token request

/* ---- Client ID (public identifier, kept in settings) ------------------------ */
export function getClientId() { return (getSettings().googleClientId || "").trim(); }
export function setClientId(id) { updateSettings({ googleClientId: (id || "").trim() }); }

/* ---- load the Google sign-in script once ------------------------------------ */
function loadGis() {
  if (_gisReady) return _gisReady;
  _gisReady = new Promise((resolve, reject) => {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) return resolve();
    const s = document.createElement("script");
    s.src = GIS_SRC; s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => { _gisReady = null; reject(new Error("Couldn't load Google sign-in (offline or blocked).")); };
    document.head.appendChild(s);
  });
  return _gisReady;
}

/* ---- token storage (session only) ------------------------------------------- */
function readStoredToken() {
  try {
    const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || "null");
    if (t && t.access_token && t.expires_at > Date.now() + 30000) return t;
  } catch (e) { /* ignore */ }
  return null;
}
function storeToken(t) { _token = t; try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify(t)); } catch (e) {} }
function clearToken() { _token = null; try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) {} }

/* ---- connection state (for the UI) ------------------------------------------ */
export function isConnected() {
  if (!_token) _token = readStoredToken();
  return !!(_token && _token.expires_at > Date.now());
}
export function connectedEmail() {
  if (!_token) _token = readStoredToken();
  return (_token && _token.email) || "";
}

/* ---- build / reuse the GIS token client ------------------------------------- */
async function ensureTokenClient() {
  const clientId = getClientId();
  if (!clientId) throw new Error("No Google Client ID yet — paste it into Settings → Connect Gmail first.");
  await loadGis();
  if (!_tokenClient || _tokenClient.__clientId !== clientId) {
    _tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      // callback + error_callback resolve/reject whatever token request is in flight
      callback: (resp) => {
        const p = _pending; _pending = null;
        if (!p) return;
        if (resp && resp.error) p.reject(new Error(resp.error));
        else p.resolve(resp);
      },
      error_callback: (err) => {
        const p = _pending; _pending = null;
        if (p) p.reject(new Error((err && (err.type || err.message)) || "sign-in was cancelled"));
      },
    });
    _tokenClient.__clientId = clientId;
  }
  return _tokenClient;
}

// Ask GIS for a token. prompt:"consent" forces the permission screen (first
// connect); prompt:"" tries silently (refresh) and only pops up if it must.
async function requestToken(prompt) {
  const tc = await ensureTokenClient();
  const resp = await new Promise((resolve, reject) => {
    _pending = { resolve, reject };
    try { tc.requestAccessToken({ prompt }); }
    catch (e) { _pending = null; reject(e); }
  });
  const expires_at = Date.now() + (Number(resp.expires_in || 3600) - 60) * 1000; // 1-min safety margin
  const email = (_token && _token.email) || await fetchEmailAddress(resp.access_token);
  storeToken({ access_token: resp.access_token, expires_at, email });
  return resp.access_token;
}

/* ---- public: connect / disconnect (call from a user click) ------------------ */
export async function signIn() {
  await requestToken("consent"); // explicit consent on the user-initiated connect
  return { email: connectedEmail() };
}
export function signOut() {
  const t = _token;
  clearToken();
  try {
    if (t && t.access_token && window.google && window.google.accounts && window.google.accounts.oauth2) {
      window.google.accounts.oauth2.revoke(t.access_token, () => {});
    }
  } catch (e) { /* ignore */ }
}

// Return a valid access token, refreshing silently if the stored one is stale.
async function token() {
  if (isConnected()) return _token.access_token;
  return requestToken(""); // silent refresh; pops up only if Google requires it
}

/* ---- low-level Gmail fetch -------------------------------------------------- */
async function gapi(path, opts = {}) {
  const t = await token();
  const r = await fetch(`${GMAIL}/${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (r.status === 401) { clearToken(); throw new Error("Google session expired, sir — reconnect Gmail."); }
  if (!r.ok) throw new Error(`Gmail API ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
  return r.json();
}

async function fetchEmailAddress(accessToken) {
  try {
    const r = await fetch(`${GMAIL}/profile`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (r.ok) return (await r.json()).emailAddress || "";
  } catch (e) { /* ignore */ }
  return "";
}

/* ---- read: search / list / get (mapped to APEX's message shape) ------------- */
// APEX message shape used everywhere else: { id, sender, subject, snippet, body, date, unread }
export async function searchMessages(query, limit = 10) {
  const list = await gapi(`messages?q=${encodeURIComponent(query || "")}&maxResults=${limit}`);
  return hydrate(list.messages);
}
export async function listRecent(limit = 10) {
  const list = await gapi(`messages?maxResults=${limit}`);
  return hydrate(list.messages);
}
export async function getMessageById(id) {
  return parseMessage(await gapi(`messages/${id}?format=full`));
}
// turn [{id}] stubs into full parsed messages, in parallel
function hydrate(stubs) {
  const ids = (stubs || []).map((m) => m.id);
  return Promise.all(ids.map(getMessageById));
}

function header(payload, name) {
  const h = (payload.headers || []).find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : "";
}
// Gmail encodes bodies as base64url; decode to a UTF-8 string.
function decodeB64Url(data) {
  try { return decodeURIComponent(escape(atob(data.replace(/-/g, "+").replace(/_/g, "/")))); }
  catch (e) { try { return atob(data.replace(/-/g, "+").replace(/_/g, "/")); } catch (e2) { return ""; } }
}
// Walk the MIME tree; prefer text/plain, fall back to the first part with a body.
function extractBody(payload) {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body && payload.body.data) return decodeB64Url(payload.body.data);
  if (payload.parts && payload.parts.length) {
    const plain = payload.parts.find((p) => p.mimeType === "text/plain");
    if (plain && plain.body && plain.body.data) return decodeB64Url(plain.body.data);
    for (const p of payload.parts) { const b = extractBody(p); if (b) return b; }
  }
  if (payload.body && payload.body.data) return decodeB64Url(payload.body.data);
  return "";
}
function parseMessage(m) {
  const p = m.payload || {};
  return {
    id: m.id,
    sender: header(p, "From"),
    subject: header(p, "Subject") || "(no subject)",
    snippet: m.snippet || "",
    body: extractBody(p) || m.snippet || "",
    date: header(p, "Date") || new Date(Number(m.internalDate || Date.now())).toISOString(),
    unread: (m.labelIds || []).includes("UNREAD"),
  };
}

/* ---- write: draft / send ---------------------------------------------------- */
// Build an RFC-2822 message and base64url-encode it (what Gmail's API wants).
function buildRaw({ to, subject, body }) {
  const msg = [
    `To: ${to || ""}`,
    `Subject: ${subject || ""}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    body || "",
  ].join("\r\n");
  return btoa(unescape(encodeURIComponent(msg))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
// Creates a REAL draft in the user's Gmail Drafts folder (nothing is sent).
export async function createDraft({ to, subject, body }) {
  return gapi("drafts", { method: "POST", body: JSON.stringify({ message: { raw: buildRaw({ to, subject, body }) } }) });
}
// Actually SENDS the email. Irreversible — callers must confirm first.
export async function sendMessage({ to, subject, body }) {
  return gapi("messages/send", { method: "POST", body: JSON.stringify({ raw: buildRaw({ to, subject, body }) }) });
}
