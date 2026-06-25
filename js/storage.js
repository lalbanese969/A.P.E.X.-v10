/* ============================================================================
   [MODULE: storage.js]
   Tiny localStorage wrapper — replaces the Python backend's file-based storage
   (core_memory/*.json, config/*.json). Everything APEX remembers lives in this
   browser's localStorage, namespaced under "apex.".

   Why localStorage: simplest option, synchronous (no async ceremony for small
   JSON blobs), and this project intentionally has zero build tools/frameworks —
   localStorage needs none. No cross-device sync (by design, for now) — see
   docs/APEX_ARCHITECTURE.md.
   ============================================================================ */

const NS = "apex.";

/** Read a JSON value. Returns `fallback` if missing or unparseable. */
export function getItem(key, fallback = null) {
  try {
    const raw = localStorage.getItem(NS + key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

/** Write a JSON value. */
export function setItem(key, value) {
  localStorage.setItem(NS + key, JSON.stringify(value));
}

/** Write a value ONLY if the key doesn't exist yet (used to seed default/demo data once). */
export function ensureSeeded(key, seedValue) {
  if (localStorage.getItem(NS + key) === null) {
    setItem(key, seedValue);
  }
}

/** Append one entry to a JSON-array-backed log key (mirrors the old *.jsonl log files). */
export function appendLog(key, entry, maxEntries = 500) {
  const log = getItem(key, []);
  log.push(entry);
  // keep logs bounded so localStorage doesn't grow forever
  while (log.length > maxEntries) log.shift();
  setItem(key, log);
}

export function removeItem(key) {
  localStorage.removeItem(NS + key);
}
