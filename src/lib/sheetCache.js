// src/lib/sheetCache.js
// Shared in-memory CSV fetch cache — prevents 4+ simultaneous fetches of the same sheet
// TTL: 2 minutes. All components share one fetch per URL.

const CACHE = {}
const TTL = 2 * 60 * 1000 // 2 minutes

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
      return text
    })
    .catch(err => {
      delete CACHE[url]
      throw err
    })

  CACHE[url] = { data: cached?.data || null, ts: cached?.ts || 0, pending: promise }
  return promise
}

export function invalidateCache(url) {
  delete CACHE[url]
}

export function invalidateAll() {
  Object.keys(CACHE).forEach(k => delete CACHE[k])
}
