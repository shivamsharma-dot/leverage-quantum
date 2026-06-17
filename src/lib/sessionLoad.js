// src/lib/sessionLoad.js
// In-memory, per-tab session store for dashboard "fetch once per session" behaviour.
// A full page reload (F5) creates a fresh module instance => empty store => one auto-load.
// While the SPA stays mounted, navigating between pages reuses cached data and never
// re-fetches automatically. Only an explicit Refresh (force) re-fetches and updates the store.

const STORE = {}

// Returns the cached entry for a key, or undefined if this key has not loaded this session.
export function getSession(key) {
  return STORE[key]
}

// True only if the key has already been loaded once this session.
export function hasLoaded(key) {
  return Object.prototype.hasOwnProperty.call(STORE, key)
}

// Store the latest successfully-fetched data for a key.
export function setSession(key, data) {
  STORE[key] = { data, ts: Date.now() }
}

// Drop a key (rarely needed; kept for completeness).
export function clearSession(key) {
  delete STORE[key]
}
