// A small, generic IndexedDB key/value cache -- the persisted-cache mechanism
// sessionLoad.js already offers (getPersisted/setSession) is localStorage-
// backed, and localStorage's quota (a handful of MB, confirmed live via a 6MB
// probe write throwing immediately) cannot hold a genuinely large payload --
// the Overall dashboard's Sheet-mode CSV alone runs ~43MB. IndexedDB has no
// such practical ceiling for a payload this size, so this exists specifically
// for pages whose real data is too big for sessionLoad.js's own persist layer,
// without changing what sessionLoad.js already does for every smaller page.
//
// Deliberately tiny and framework-free: one object store, one key per entry,
// get/set/delete. Every call degrades to a silent no-op/null on any failure
// (private browsing, disabled storage, an old browser with no indexedDB) --
// this is a speed optimisation, never something a caller can depend on
// actually working.

const DB_NAME = 'lq_idb_cache'
const DB_VERSION = 1
const STORE_NAME = 'entries'

let dbPromise = null
function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB not available')); return }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE_NAME)) req.result.createObjectStore(STORE_NAME) }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

// Returns the stored value for `key`, or null if absent/on any failure.
export async function idbGet(key) {
  try {
    const db = await openDb()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(key)
      req.onsuccess = () => resolve(req.result === undefined ? null : req.result)
      req.onerror = () => reject(req.error)
    })
  } catch (_) {
    return null
  }
}

// Stores `value` under `key`. Best-effort -- a failure here is swallowed, not
// thrown, since this is only ever a speed optimisation on top of a real fetch
// that already succeeded.
export async function idbSet(key, value) {
  try {
    const db = await openDb()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(value, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (_) { /* best effort only */ }
}

export async function idbDelete(key) {
  try {
    const db = await openDb()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (_) { /* best effort only */ }
}
