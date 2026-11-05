// A copy of the app's records in localStorage, so Overload opens instantly and keeps working even when Safari's
// IndexedDB is slow to answer (it can stall for minutes after an update or when iOS suspended the app mid-write).
//
// It is written synchronously on every change, before the IndexedDB write for that change starts, so it is never
// older than the database. If a write ever fails (storage full), the snapshot is removed rather than left stale,
// and the app falls back to IndexedDB alone. Photos are not included; they stay in IndexedDB.
const P = 'overload.snap.';
const PARTS = ['settings', 'gyms', 'exercises', 'routines', 'workouts', 'active'];
const LIMIT = 3000000;   // characters; Safari allows about 5 MB per site
let last = {};           // part -> object last written
let sizes = {};
let off = false;

function store() { try { return window.localStorage || null; } catch (e) { return null; } }

export function readSnapshot() {
  const s = store();
  if (!s) return null;
  try {
    const meta = JSON.parse(s.getItem(P + 'meta') || 'null');
    if (!meta || meta.v !== 1) return null;
    const out = { at: meta.at };
    for (const p of PARTS) {
      const raw = s.getItem(P + p);
      if (raw === null) return null;   // incomplete
      out[p] = JSON.parse(raw);
      sizes[p] = raw.length;
    }
    if (!out.settings || !Array.isArray(out.workouts) || !Array.isArray(out.exercises)) return null;
    return out;
  } catch (e) { return null; }
}

// Note what is already stored, so later writes only touch the parts that changed.
export function markWritten(state) { for (const p of PARTS) last[p] = state[p]; }

export function writeSnapshot(state, parts = PARTS) {
  if (off) return false;
  const s = store();
  if (!s) { off = true; return false; }
  const todo = parts.filter(p => PARTS.includes(p) && last[p] !== state[p]);
  if (!todo.length) return true;
  try {
    const json = {};
    for (const p of todo) json[p] = JSON.stringify(state[p] === undefined ? null : state[p]);
    let total = 0;
    for (const p of PARTS) total += json[p] !== undefined ? json[p].length : (sizes[p] || 0);
    if (total > LIMIT) throw new Error('Snapshot too large');
    s.removeItem(P + 'meta');   // marks it incomplete until every part is written
    for (const p of todo) { s.setItem(P + p, json[p]); sizes[p] = json[p].length; last[p] = state[p]; }
    s.setItem(P + 'meta', JSON.stringify({ v: 1, at: Date.now() }));
    return true;
  } catch (e) {
    clearSnapshot();
    off = true;
    return false;
  }
}

export function clearSnapshot() {
  const s = store();
  try { if (s) for (const p of [...PARTS, 'meta']) s.removeItem(P + p); } catch (e) { /* storage blocked */ }
  last = {};
  sizes = {};
}

export const snapshotParts = PARTS;
