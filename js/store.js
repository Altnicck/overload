// App state: one immutable tree, tiny subscribe/select hook, actions that persist to IndexedDB.
import { useState, useEffect, useRef } from './preact.js';
import * as db from './db.js';
import { readSnapshot, writeSnapshot, markWritten, clearSnapshot } from './snapshot.js';
import { buildIndex, uid, num, e1rm, bestBefore, hasHistory, lastSession, weekKey, addDays, keyToDate, isDone, fmt } from './logic.js';

export const DEFAULT_SETTINGS = {
  name: '',
  weekGoal: 4,
  prGoal: 3,
  baseBeforeJefit: 0,
  baseJefit: 0,
  streakBase: null,
  sound: true,
  haptics: true,
  lastBackup: null,
  lastRecapSeen: null,
  lastGymId: null,
  onboarded: false,
  importedJefit: false,
  installSkipped: false,
};

let state = {
  ready: false,
  error: null,
  settings: { ...DEFAULT_SETTINGS },
  gyms: [], exercises: [], routines: [], workouts: [],
  active: null,
  ui: {
    tab: 'summary',
    stacks: { summary: [], workout: [], machines: [], progress: [] },
    sheets: [],
    workoutOpen: false,
    banners: [],
    toast: null,
    update: false,
  },
};
const subs = new Set();
let indexCache = { w: null, e: null, idx: null };

export const getState = () => state;
// Plain listener for non-Preact code (the glass refraction controller). Returns an unsubscribe function.
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
// Records that are saved. A change to any of them is copied to the local snapshot right away (the active
// workout, which changes on every keystroke, a moment later), before its IndexedDB write starts.
const SAVED = ['settings', 'gyms', 'exercises', 'routines', 'workouts'];
let snapReady = false;
let activeSnapTimer = 0;
export function setState(fnOrPatch) {
  const patch = typeof fnOrPatch === 'function' ? fnOrPatch(state) : fnOrPatch;
  if (!patch) return;
  const prev = state;
  state = { ...state, ...patch };
  if (snapReady) {
    const changed = SAVED.filter(k => prev[k] !== state[k]);
    if (changed.length) {
      clearTimeout(activeSnapTimer);
      writeSnapshot(state, prev.active !== state.active ? [...changed, 'active'] : changed);
    } else if (prev.active !== state.active) {
      clearTimeout(activeSnapTimer);
      activeSnapTimer = setTimeout(() => writeSnapshot(state, ['active']), 120);
    }
  }
  for (const fn of subs) fn();
}
export function flushSnapshot() {
  clearTimeout(activeSnapTimer);
  if (snapReady) writeSnapshot(state);
}
export function setUI(fnOrPatch) {
  setState(s => ({ ui: { ...s.ui, ...(typeof fnOrPatch === 'function' ? fnOrPatch(s.ui) : fnOrPatch) } }));
}

function shallowEq(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!Object.is(a[k], b[k])) return false;
  return true;
}

export function useStore(sel = s => s) {
  const [, force] = useState(0);
  const selRef = useRef(sel);
  selRef.current = sel;
  const val = sel(state);
  const valRef = useRef(val);
  valRef.current = val;
  useEffect(() => {
    const fn = () => {
      const v = selRef.current(state);
      if (!shallowEq(v, valRef.current)) { valRef.current = v; force(x => x + 1); }
    };
    subs.add(fn);
    fn();   // catch a change made between this render and the subscription (boot sets state synchronously)
    return () => subs.delete(fn);
  }, []);
  return val;
}

export function getIndex(s = state) {
  if (indexCache.w !== s.workouts || indexCache.e !== s.exercises) {
    indexCache = { w: s.workouts, e: s.exercises, idx: buildIndex(s.workouts, s.exercises) };
  }
  return indexCache.idx;
}
export function useIndex() {
  const { workouts, exercises } = useStore(s => ({ workouts: s.workouts, exercises: s.exercises }));
  return getIndex({ workouts, exercises });
}

// ---------- boot ----------
function shape(d) {
  return {
    settings: { ...DEFAULT_SETTINGS, ...(d.settings || {}) },
    active: d.active || null,
    gyms: (d.gyms || []).slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)),
    exercises: d.exercises || [],
    routines: (d.routines || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    workouts: d.workouts || [],
  };
}

// Read IndexedDB with time limits; a stuck read is retried once on a fresh connection.
async function loadDatabase() {
  try { return await db.withTimeout(db.readAll(), 7000, 'Reading your data took too long'); }
  catch (e) {
    db.close();
    return db.withTimeout(db.readAll(), 9000, 'Reading your data took too long');
  }
}

export async function boot() {
  // 1. Open instantly from the local snapshot when there is one.
  const snap = readSnapshot();
  if (snap) {
    setState({ ready: true, error: null, ...shape(snap) });
    markWritten(state);
    snapReady = true;
  }
  // 2. Load IndexedDB. Without a snapshot it is the data; with one it only has to be brought in line.
  let data = null;
  try { data = await loadDatabase(); } catch (err) {
    console.warn('IndexedDB did not answer', err);
    if (!snapReady) setState({ ready: true, error: String((err && err.message) || err) });
    return;
  }
  if (!snapReady) {
    setState({ ready: true, error: null, ...shape(data) });
    snapReady = true;
    markWritten({});
    writeSnapshot(state);
  } else {
    // The snapshot is never older than the database; copy over anything a stalled write lost.
    const cur = { settings: state.settings, active: state.active, gyms: state.gyms, exercises: state.exercises, routines: state.routines, workouts: state.workouts };
    db.replaceAll(cur, data).then(n => { if (n) console.info(`Database brought up to date (${n} changes)`); }).catch(e => console.warn('Could not update the database', e));
  }
  db.requestPersist();
}

export function retryBoot() {
  db.close();
  setState({ ready: false, error: null });
  boot();
}

// ---------- settings ----------
export function updateSettings(patch) {
  const settings = { ...state.settings, ...patch };
  setState({ settings });
  db.kvSet('settings', settings);
}

// ---------- gyms ----------
export function saveGym(gym) {
  const g = { createdAt: Date.now(), ...gym, id: gym.id || uid('g') };
  const gyms = state.gyms.some(x => x.id === g.id) ? state.gyms.map(x => (x.id === g.id ? g : x)) : [...state.gyms, g];
  setState({ gyms });
  db.put('gyms', g);
  return g;
}
export function deleteGym(id) {
  const fallback = state.gyms.find(g => g.id !== id);
  const exercises = state.exercises.map(e => (e.gymId === id ? { ...e, gymId: fallback ? fallback.id : null } : e));
  setState({ gyms: state.gyms.filter(g => g.id !== id), exercises });
  db.del('gyms', id);
  db.putMany('exercises', exercises.filter(e => e.gymId === (fallback ? fallback.id : null)));
  if (state.settings.lastGymId === id) updateSettings({ lastGymId: fallback ? fallback.id : null });
}

// ---------- exercises / machines ----------
export function saveExercise(ex) {
  const e = { createdAt: Date.now(), notes: '', mode: 'total', muscle: 'other', gymId: null, photoId: null, movement: '', ...ex, id: ex.id || uid('x') };
  e.updatedAt = Date.now();
  const exercises = state.exercises.some(x => x.id === e.id) ? state.exercises.map(x => (x.id === e.id ? e : x)) : [...state.exercises, e];
  setState({ exercises });
  db.put('exercises', e);
  return e;
}
export function deleteExercise(id) {
  const ex = state.exercises.find(e => e.id === id);
  setState({
    exercises: state.exercises.filter(e => e.id !== id),
    routines: state.routines.map(r => ({ ...r, items: (r.items || []).filter(i => i.exId !== id) })),
  });
  db.del('exercises', id);
  for (const r of state.routines) db.put('routines', r);
  if (ex && ex.photoId && !state.exercises.some(e => e.photoId === ex.photoId)) deletePhoto(ex.photoId);
}

// ---------- photos ----------
const photoUrls = new Map(); // id -> {thumb, full}
const photoWaiters = new Map();
export async function savePhoto(full, thumb) {
  const id = uid('p');
  await db.withTimeout(db.put('photos', { id, full, thumb, createdAt: Date.now() }), 12000, 'Saving the photo took too long');
  photoUrls.set(id, { thumb: URL.createObjectURL(thumb), full: URL.createObjectURL(full) });
  return id;
}
export async function deletePhoto(id) {
  const u = photoUrls.get(id);
  if (u) { URL.revokeObjectURL(u.thumb); URL.revokeObjectURL(u.full); photoUrls.delete(id); }
  await db.del('photos', id);
}
export function photoUrl(id, kind = 'thumb') {
  if (!id) return Promise.resolve(null);
  const u = photoUrls.get(id);
  if (u) return Promise.resolve(u[kind]);
  if (!photoWaiters.has(id)) {
    photoWaiters.set(id, db.get('photos', id).then(rec => {
      if (!rec) return null;
      const urls = { thumb: URL.createObjectURL(rec.thumb || rec.full), full: URL.createObjectURL(rec.full || rec.thumb) };
      photoUrls.set(id, urls);
      return urls;
    }).finally(() => photoWaiters.delete(id)));
  }
  return photoWaiters.get(id).then(u2 => (u2 ? u2[kind] : null));
}
export function usePhoto(id, kind = 'thumb') {
  const cached = id && photoUrls.get(id);
  const [url, setUrl] = useState(cached ? cached[kind] : null);
  useEffect(() => {
    let alive = true;
    if (!id) { setUrl(null); return; }
    photoUrl(id, kind).then(u => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [id, kind]);
  return id ? url : null;
}

// ---------- routines ----------
export function saveRoutine(r) {
  const order = r.order ?? state.routines.length;
  const x = { items: [], createdAt: Date.now(), ...r, order, id: r.id || uid('r') };
  const routines = state.routines.some(y => y.id === x.id) ? state.routines.map(y => (y.id === x.id ? x : y)) : [...state.routines, x];
  setState({ routines });
  db.put('routines', x);
  return x;
}
// Drag-to-reorder on the Workout tab: renumber every routine so the order sticks.
export function moveRoutine(from, to) {
  const list = [...state.routines];
  const [r] = list.splice(from, 1);
  if (!r) return;
  list.splice(to, 0, r);
  const routines = list.map((x, i) => (x.order === i ? x : { ...x, order: i }));
  const changed = routines.filter((x, i) => x !== list[i]);
  setState({ routines });
  if (changed.length) db.putMany('routines', changed);
}
export function deleteRoutine(id) {
  setState({ routines: state.routines.filter(r => r.id !== id) });
  db.del('routines', id);
}

// ---------- workouts ----------
export function saveWorkout(w) {
  const workouts = state.workouts.some(x => x.id === w.id) ? state.workouts.map(x => (x.id === w.id ? w : x)) : [...state.workouts, w];
  setState({ workouts });
  db.put('workouts', w);
}
export function deleteWorkout(id) {
  setState({ workouts: state.workouts.filter(w => w.id !== id) });
  db.del('workouts', id);
}

// ---------- active workout ----------
let activeTimer = null;
let activeDirty = false;
function persistActive() {
  activeDirty = true;
  clearTimeout(activeTimer);
  activeTimer = setTimeout(() => {
    activeDirty = false;
    if (state.active) db.kvSet('active', state.active); else db.kvDel('active');
  }, 250);
}
// Save the active workout now. Only touches IndexedDB when there is an unsaved change: a write that is still
// running when iOS suspends the app can hold up the next launch.
export function flushActive() {
  clearTimeout(activeTimer);
  flushSnapshot();
  if (!activeDirty) return Promise.resolve();
  activeDirty = false;
  return state.active ? db.kvSet('active', state.active) : db.kvDel('active');
}
function setActive(active) { setState({ active }); persistActive(); }
export function updateActive(fn) { if (state.active) setActive(fn(state.active)); }

function plannedSets(exId, reps, count) {
  const idx = getIndex();
  const last = lastSession(idx, exId);
  const n = Math.max(count || 0, last ? last.sets.length : 0, 1);
  return Array.from({ length: n }, () => ({ w: '', r: '', done: false }));
}
export function newEntry(exId, reps, count) {
  return { id: uid('e'), exId, sets: plannedSets(exId, reps, count), target: reps || null };
}

export function startWorkout({ routine = null, gymId = null } = {}) {
  if (state.active) { setUI({ workoutOpen: true }); return; }
  const gym = gymId || (routine && routine.gymId) || state.settings.lastGymId || (state.gyms[0] && state.gyms[0].id) || null;
  const entries = routine ? (routine.items || []).filter(i => state.exercises.some(e => e.id === i.exId)).map(i => newEntry(i.exId, i.reps, (i.reps || []).length)) : [];
  setActive({
    id: uid('w'), name: routine ? routine.name : 'Workout', routineId: routine ? routine.id : null,
    gymId: gym, startedAt: new Date().toISOString(), endedAt: null, entries, notes: '', source: 'app',
  });
  if (gym) updateSettings({ lastGymId: gym });
  setUI({ workoutOpen: true });
}

export function discardActive() {
  setActive(null);
  setUI({ workoutOpen: false });
}

// Returns the e1RM PR info if checking this set makes a new record, else null.
export function checkSetPR(active, entryIdx, setIdx) {
  const en = active.entries[entryIdx];
  const s = en.sets[setIdx];
  const e = e1rm(s.w, s.r);
  if (!(e > 0)) return null;
  const idx = getIndex();
  if (!hasHistory(idx, en.exId, active.id)) return null;
  let prev = bestBefore(idx, en.exId, Infinity, active.id);
  // other completed sets of this exercise earlier in this workout
  active.entries.forEach((en2, i) => {
    if (en2.exId !== en.exId) return;
    en2.sets.forEach((s2, j) => {
      if ((i === entryIdx && j === setIdx) || !s2.done) return;
      const v = e1rm(s2.w, s2.r);
      if (v > prev) prev = v;
    });
  });
  if (e > prev + 1e-6) return { e, prev, w: num(s.w), r: num(s.r), exId: en.exId };
  return null;
}

export function finishActive() {
  const a = state.active;
  if (!a) return null;
  const entries = a.entries
    .map(en => ({ ...en, sets: en.sets.filter(s => s.done && num(s.r) > 0 && !Number.isNaN(num(s.w))).map(s => ({ w: num(s.w), r: num(s.r), done: true, pr: !!s.pr })) }))
    .filter(en => en.sets.length);
  const w = { ...a, entries, endedAt: new Date().toISOString() };
  // Past-dated logs keep their chosen start; duration falls back to the planned length.
  if (new Date(w.endedAt) - new Date(w.startedAt) > 6 * 3600e3) w.endedAt = new Date(new Date(w.startedAt).getTime() + 60 * 60e3).toISOString();
  saveWorkout(w);
  setActive(null);
  return w;
}

// ---------- navigation ----------
export function go(tab) {
  const ui = state.ui;
  if (ui.tab === tab) {
    if (ui.stacks[tab].length) setUI({ stacks: { ...ui.stacks, [tab]: [] } });
    else document.querySelector(`.tabview[data-tab="${tab}"] .scroller`)?.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  setUI({ tab });
}
export function push(route, tab = state.ui.tab) {
  const ui = state.ui;
  setUI({ tab, stacks: { ...ui.stacks, [tab]: [...ui.stacks[tab], { key: uid('v'), ...route }] } });
}
export function pop(tab = state.ui.tab) {
  const ui = state.ui;
  setUI({ stacks: { ...ui.stacks, [tab]: ui.stacks[tab].slice(0, -1) } });
}
export function openSheet(name, props = {}) {
  setUI(ui => ({ sheets: [...ui.sheets, { key: uid('s'), name, props }] }));
}
export function closeSheet(key) {
  setUI(ui => ({ sheets: key ? ui.sheets.filter(s => s.key !== key) : ui.sheets.slice(0, -1) }));
}
export function closeAllSheets() { setUI({ sheets: [] }); }

let toastTimer = null;
export function toast(text, opts = {}) {
  clearTimeout(toastTimer);
  setUI({ toast: { text, ...opts, key: uid('t') } });
  toastTimer = setTimeout(() => setUI({ toast: null }), opts.ms || 2400);
}
export function banner(b) {
  const item = { key: uid('b'), ms: 4800, ...b };
  // A newer PR on the same exercise replaces the older banner.
  setUI(ui => ({ banners: [...ui.banners.filter(x => !(item.kind === 'pr' && x.kind === 'pr' && x.exId === item.exId)), item].slice(-2) }));
  setTimeout(() => dismissBanner(item.key), item.ms);
}
export function dismissBanner(key) { setUI(ui => ({ banners: ui.banners.filter(b => b.key !== key) })); }

// ---------- import / backup ----------
export async function applyImport(data, { replace = false } = {}) {
  if (!data || (data.app !== 'overload')) throw new Error('This is not an Overload file.');
  const keep = (list, incoming) => {
    const m = new Map(list.map(x => [x.id, x]));
    for (const x of incoming || []) m.set(x.id, x);
    return [...m.values()];
  };
  const gyms = replace ? (data.gyms || []) : keep(state.gyms, data.gyms);
  const exercises = replace ? (data.exercises || []) : keep(state.exercises, data.exercises);
  const routines = replace ? (data.routines || []) : keep(state.routines, data.routines);
  const workouts = replace ? (data.workouts || []) : keep(state.workouts, data.workouts);
  const base = replace ? { ...DEFAULT_SETTINGS } : state.settings;
  const settings = { ...base, ...(data.settings || {}) };
  if (data.kind === 'jefit-import') settings.importedJefit = true;
  if (replace) settings.onboarded = true;
  const active = replace ? (data.active || null) : state.active;
  // Memory and the snapshot first, so the app never waits on IndexedDB for this.
  setState({
    gyms: gyms.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)),
    exercises, routines: routines.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), workouts, settings, active,
  });
  const writes = (async () => {
    if (replace) await db.wipeAll();
    await db.putMany('gyms', data.gyms || []);
    await db.putMany('exercises', data.exercises || []);
    await db.putMany('routines', data.routines || []);
    await db.putMany('workouts', data.workouts || []);
    if (data.photos && data.photos.length) {
      for (const p of data.photos) {
        const full = await (await fetch(p.full)).blob();
        const thumb = p.thumb ? await (await fetch(p.thumb)).blob() : full;
        await db.put('photos', { id: p.id, full, thumb, createdAt: p.createdAt || Date.now() });
      }
    }
    await db.kvSet('settings', settings);
    if (replace && active) await db.kvSet('active', active);
  })();
  try { await db.withTimeout(writes, 20000, 'Saving the import took too long'); }
  catch (e) { console.warn('Import is still being saved', e); }
}

function blobToDataURL(blob) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
}
export async function buildBackup() {
  const photos = [];
  for (const rec of await db.getAll('photos')) {
    if (!state.exercises.some(e => e.photoId === rec.id)) continue;
    photos.push({ id: rec.id, createdAt: rec.createdAt, full: await blobToDataURL(rec.full), thumb: rec.thumb ? await blobToDataURL(rec.thumb) : null });
  }
  return {
    app: 'overload', kind: 'backup', v: 1, exportedAt: new Date().toISOString(),
    settings: state.settings, gyms: state.gyms, exercises: state.exercises, routines: state.routines,
    workouts: state.workouts, active: state.active, photos,
  };
}

export async function eraseEverything() {
  for (const u of photoUrls.values()) { URL.revokeObjectURL(u.thumb); URL.revokeObjectURL(u.full); }
  photoUrls.clear();
  setState({ settings: { ...DEFAULT_SETTINGS }, gyms: [], exercises: [], routines: [], workouts: [], active: null });
  setUI({ sheets: [], stacks: { summary: [], workout: [], machines: [], progress: [] }, tab: 'summary', workoutOpen: false });
  try { await db.withTimeout(db.wipeAll(), 15000, 'Erasing took too long'); }
  catch (e) { console.warn('Erase still running', e); }
}

// helpers used by screens
export const exName = id => { const e = state.exercises.find(x => x.id === id); return e ? e.name : 'Deleted exercise'; };
export const gymName = id => { if (!id) return 'Any gym'; const g = state.gyms.find(x => x.id === id); return g ? g.name : 'Any gym'; };
export function recapKeyToShow(now = new Date()) {
  // Most recent completed week (the week before this one).
  return weekKey(addDays(keyToDate(weekKey(now)), -7));
}
export { isDone, fmt };
