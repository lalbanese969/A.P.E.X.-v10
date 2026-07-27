/* ============================================================================
   [MODULE: supplements.js]
   Track supplements + medications and check off what you took each day. Same
   localStorage store as everything else (storage.js, "apex." namespace). Imports
   only storage.js (Node-testable).

   Storage keys:
     apex.supplements.list       -> [{ id, name, dose, notes, kind }]  (your list)
     apex.supplements.day.<date> -> { date, taken: { <id>: true } }    (per LOCAL day)

   kind is "supplement" or "medication" (prescription). Seeded with the creatine
   from your profile so it's there on first run.
   ============================================================================ */

import { getItem, setItem, ensureSeeded } from "./storage.js";

const LIST_KEY = "supplements.list";
const dayKey = (d) => `supplements.day.${d}`;
let _seq = 0;
const uid = () => "supp_" + Date.now().toString(36) + (_seq++).toString(36);
export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function buildSeed() {
  return [
    { id: "supp_creatine", name: "Creatine monohydrate", dose: "5 g", notes: "Daily — training & rest days, no loading.", kind: "supplement" },
  ];
}
ensureSeeded(LIST_KEY, buildSeed());

/* ---- the list you track ---- */
export function list() { return getItem(LIST_KEY, []); }
function saveList(l) { setItem(LIST_KEY, l); }
export function addSupp({ name, dose = "", notes = "", kind = "supplement" }) {
  const l = list();
  const s = { id: uid(), name: (name || "").trim(), dose: (dose || "").trim(), notes: (notes || "").trim(), kind };
  l.push(s); saveList(l); return s;
}
export function updateSupp(id, patch) {
  const l = list();
  const s = l.find((x) => x.id === id);
  if (!s) return null;
  Object.assign(s, patch);
  saveList(l);
  return s;
}
export function removeSupp(id) { saveList(list().filter((x) => x.id !== id)); }

/* ---- per-day taken tracking ---- */
export function getDay(d = todayStr()) {
  const day = getItem(dayKey(d), { date: d, taken: {} });
  if (!day.taken || typeof day.taken !== "object") day.taken = {};
  return day;
}
function saveDay(day) { setItem(dayKey(day.date), day); }
export function toggle(id, d = todayStr()) {
  const day = getDay(d);
  day.taken[id] = !day.taken[id];
  saveDay(day);
  return day;
}
export function isTaken(id, d = todayStr()) { return !!getDay(d).taken[id]; }
export function takenCount(d = todayStr()) {
  const day = getDay(d), all = list();
  return { done: all.filter((s) => day.taken[s.id]).length, total: all.length };
}
