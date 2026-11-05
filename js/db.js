// Tiny IndexedDB layer. Every record store is keyed by `id`; `kv` holds settings and the active workout.
//
// Safari's IndexedDB can stall: the first open of a page may never be answered until IndexedDB is poked
// (WebKit bug 226547), iOS drops connections of apps in the background, and a transaction left running when the
// app is suspended can hold up the next launch. So every wait here has a time limit, a dropped connection is
// reopened, and the app itself starts from a local snapshot (store.js) instead of waiting for this.
const DB_NAME = 'overload-db';
const DB_VERSION = 1;
export const STORES = ['gyms', 'exercises', 'routines', 'workouts', 'photos'];
let dbp = null;
let conn = null;

function timeoutError(msg) { const e = new Error(msg); e.name = 'TimeoutError'; return e; }
export function withTimeout(p, ms, msg = 'Timed out') {
  let t;
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(timeoutError(msg)), ms); })]).finally(() => clearTimeout(t));
}

// Poke IndexedDB until it answers (the Safari "first open hangs" workaround), for at most 1.5 s.
function wake() {
  if (typeof indexedDB === 'undefined' || !indexedDB.databases) return Promise.resolve();
  let t = 0;
  return Promise.race([
    new Promise(res => { const poke = () => { try { indexedDB.databases().then(res, res); } catch (e) { res(); } }; poke(); t = setInterval(poke, 120); }),
    new Promise(res => setTimeout(res, 1500)),
  ]).finally(() => clearInterval(t));
}

function openOnce(ms) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { reject(e); return; }
    const timer = setTimeout(() => { if (!settled) { settled = true; reject(timeoutError('Opening the database took too long')); } }, ms);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const db = req.result;
      if (settled) { try { db.close(); } catch (e) { /* late answer to an attempt we gave up on */ } return; }
      settled = true;
      clearTimeout(timer);
      const drop = () => { if (conn === db) { conn = null; dbp = null; } };
      db.onversionchange = () => { db.close(); drop(); };
      db.onclose = drop;   // the system closed it (iOS does this to apps in the background)
      conn = db;
      resolve(db);
    };
    req.onerror = () => { if (!settled) { settled = true; clearTimeout(timer); reject(req.error || new Error('Could not open the database')); } };
    req.onblocked = () => { /* wait for the other connection; the timer decides */ };
  });
}

export function open() {
  if (dbp) return dbp;
  const p = (async () => {
    await wake();
    let last = null;
    for (const ms of [2500, 4000, 6000]) {
      try { return await openOnce(ms); } catch (e) { last = e; if (e.name !== 'TimeoutError') break; await wake(); }
    }
    throw last || new Error('Could not open the database');
  })();
  dbp = p;
  p.catch(() => { if (dbp === p) dbp = null; });
  return p;
}

// Close the connection so a page that replaces this one (update, reload) can open its own cleanly.
export function close() {
  const c = conn;
  conn = null;
  dbp = null;
  try { c && c.close(); } catch (e) { /* already closed */ }
}

function txOn(db, stores, mode) {
  try { return db.transaction(stores, mode); }
  catch (e) {
    if (e && e.name === 'InvalidStateError') return null;   // connection is closing: caller reopens
    throw e;
  }
}

function run(store, mode, fn) {
  const attempt = retry => open().then(db => {
    const tx = txOn(db, store, mode);
    if (!tx) {
      if (conn === db) { conn = null; dbp = null; }
      if (retry) return attempt(false);
      throw new Error('The database connection was closed');
    }
    return new Promise((resolve, reject) => {
      const os = tx.objectStore(store);
      let out;
      const r = fn(os);
      if (r && 'onsuccess' in r) r.onsuccess = () => { out = r.result; };
      tx.oncomplete = () => resolve(out);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    });
  });
  return attempt(true);
}

export const getAll = store => run(store, 'readonly', os => os.getAll());
export const get = (store, key) => run(store, 'readonly', os => os.get(key));
export const put = (store, value) => run(store, 'readwrite', os => os.put(value));
export const del = (store, key) => run(store, 'readwrite', os => os.delete(key));
export const clear = store => run(store, 'readwrite', os => os.clear());
export const kvGet = key => run('kv', 'readonly', os => os.get(key));
export const kvSet = (key, value) => run('kv', 'readwrite', os => os.put(value, key));
export const kvDel = key => run('kv', 'readwrite', os => os.delete(key));

export function putMany(store, values) {
  return run(store, 'readwrite', os => { for (const v of values) os.put(v); });
}

const DATA = ['kv', 'gyms', 'exercises', 'routines', 'workouts'];

// Everything the app needs to start, in one transaction.
export function readAll() {
  return open().then(db => new Promise((resolve, reject) => {
    const tx = txOn(db, DATA, 'readonly');
    if (!tx) { close(); reject(new Error('The database connection was closed')); return; }
    const out = {};
    const kv = tx.objectStore('kv');
    kv.get('settings').onsuccess = e => { out.settings = e.target.result; };
    kv.get('active').onsuccess = e => { out.active = e.target.result; };
    for (const s of DATA.slice(1)) tx.objectStore(s).getAll().onsuccess = e => { out[s] = e.target.result; };
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  }));
}

// Make the stored records match `data` exactly (records not in it are deleted), in one transaction.
// Used to bring the database back in line with the snapshot after writes were lost.
export function replaceAll(data, current) {
  return open().then(db => new Promise((resolve, reject) => {
    const tx = txOn(db, DATA, 'readwrite');
    if (!tx) { close(); reject(new Error('The database connection was closed')); return; }
    let writes = 0;
    const kv = tx.objectStore('kv');
    for (const key of ['settings', 'active']) {
      const want = data[key] ?? null, have = current[key] ?? null;
      if (JSON.stringify(want) === JSON.stringify(have)) continue;
      writes++;
      if (want === null) kv.delete(key); else kv.put(want, key);
    }
    for (const s of DATA.slice(1)) {
      const os = tx.objectStore(s);
      const have = new Map((current[s] || []).map(r => [r.id, JSON.stringify(r)]));
      const want = new Set();
      for (const r of data[s] || []) {
        want.add(r.id);
        if (have.get(r.id) !== JSON.stringify(r)) { os.put(r); writes++; }
      }
      for (const id of have.keys()) if (!want.has(id)) { os.delete(id); writes++; }
    }
    tx.oncomplete = () => resolve(writes);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  }));
}

export async function wipeAll() {
  await clear('kv');
  for (const s of STORES) await clear(s);
}

export async function requestPersist() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch (e) { /* not supported */ }
  return false;
}
