// Tiny IndexedDB layer. Every record store is keyed by `id`; `kv` holds settings and the active workout.
const DB_NAME = 'overload-db';
const DB_VERSION = 1;
export const STORES = ['gyms', 'exercises', 'routines', 'workouts', 'photos'];
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Database blocked by another tab'));
  });
  return dbp;
}

function run(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const os = tx.objectStore(store);
    let out;
    const r = fn(os);
    if (r && 'onsuccess' in r) r.onsuccess = () => { out = r.result; };
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  }));
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
