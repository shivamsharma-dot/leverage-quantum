// src/lib/sessionLoad.js
// In-memory, per-tab session store for dashboard "fetch once per session" behaviour.
// A full page reload (F5) creates a fresh module instance => empty store => one auto-load.
// While the SPA stays mounted, navigating between pages reuses cached data and never
// re-fetches automatically. Only an explicit Refresh (force) re-fetches and updates the store.
//
// Also mirrors each entry to localStorage so a full page reload / cold first-visit can
// paint instantly from the last-known-good snapshot (via getPersisted) instead of staring
// at a blank spinner for as long as a big CSV takes to download + parse. Callers that want
// this "stale-while-revalidate" behaviour: on mount, if !hasLoaded(key), check getPersisted(key)
// -- if present, render it immediately and kick a normal (non-blocking) fetch in the background
// to bring the view fully current; if absent, fall back to the original blocking-fetch path.

const STORE = {}
const PERSIST_PREFIX = 'lq_session:'
const PERSIST_TTL = 24 * 60 * 60 * 1000 // 24h -- how long a persisted snapshot stays usable

// Returns the cached entry for a key, or undefined if this key has not loaded this session.
export function getSession(key) {
  return STORE[key]
}

// True only if the key has already been loaded once this session.
export function hasLoaded(key) {
  return Object.prototype.hasOwnProperty.call(STORE, key)
}

// Store the latest successfully-fetched data for a key (in-memory + best-effort localStorage).
export function setSession(key, data) {
  const ts = Date.now()
  STORE[key] = { data, ts }
  try { localStorage.setItem(PERSIST_PREFIX + key, JSON.stringify({ data, ts })) } catch (_) { /* quota/disabled -- ignore */ }
}

// Drop a key (rarely needed; kept for completeness).
export function clearSession(key) {
  delete STORE[key]
}

// Reads a persisted snapshot from a PRIOR session/tab (survives full page reload), for
// instant-paint on cold load. Returns { data, ts } or null. Does not touch the in-memory STORE.
export function getPersisted(key) {
  try {
    const raw = localStorage.getItem(PERSIST_PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed.ts !== 'number') return null
    if (Date.now() - parsed.ts > PERSIST_TTL) return null
    return parsed
  } catch (_) {
    return null
  }
}
