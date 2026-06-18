// src/lib/sheetCache.js
// Shared in-memory CSV fetch cache — prevents 4+ simultaneous fetches of the same sheet
// TTL: 2 minutes. All components share one fetch per URL.
// Resilience: successful responses are mirrored to localStorage so that a transient
// network/fetch failure can fall back to the last known-good data instead of breaking
// the dashboard. localStorage access is always best-effort and never throws.

const CACHE = {}
const TTL = 2 * 60 * 1000 // 2 minutes
const PERSIST_PREFIX = 'qsheet:' // localStorage key prefix
const PERSIST_TTL = 24 * 60 * 60 * 1000 // 24h — how long a persisted fallback stays usable

function lsGet(url) {
  try {
    const raw = localStorage.getItem(PERSIST_PREFIX + url)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed.data !== 'string') return null
    if (Date.now() - (parsed.ts || 0) > PERSIST_TTL) return null
    return parsed
  } catch (_) {
    return null
  }
}

function lsSet(url, data, ts) {
  try {
    localStorage.setItem(PERSIST_PREFIX + url, JSON.stringify({ data, ts }))
  } catch (_) {
    // quota exceeded / disabled storage — ignore, in-memory cache still works
  }
}

function lsRemove(url) {
  try {
    localStorage.removeItem(PERSIST_PREFIX + url)
  } catch (_) { /* ignore */ }
}

export async function fetchCSV(url) {
  const now = Date.now()
  const cached = CACHE[url]

  // Return cached data if fresh
  if (cached && now - cached.ts < TTL) {
    return cached.data
  }

  // If already fetching, wait for the same promise (deduplication)
  if (cached && cached.pending) {
    return cached.pending
  }

  // Start new fetch
  const promise = fetch(url)
    .then(r => { if (!r.ok) throw new Error(`CSV fetch failed: ${r.status}`); return r.text() })
    .then(text => {
      CACHE[url] = { data: text, ts: Date.now(), pending: null }
      lsSet(url, text, CACHE[url].ts)
      return text
    })
    .catch(err => {
      delete CACHE[url]
      // Graceful degradation: serve last known-good data from localStorage if available
      const fallback = lsGet(url)
      if (fallback) {
        CACHE[url] = { data: fallback.data, ts: fallback.ts, pending: null }
        return fallback.data
      }
      throw err
    })

  CACHE[url] = { data: cached?.data || null, ts: cached?.ts || 0, pending: promise }
  return promise
}

export function invalidateCache(url) {
  delete CACHE[url]
  lsRemove(url)
}

export function invalidateAll() {
  Object.keys(CACHE).forEach(k => delete CACHE[k])
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith(PERSIST_PREFIX))
      .forEach(k => localStorage.removeItem(k))
  } catch (_) { /* ignore */ }
}
