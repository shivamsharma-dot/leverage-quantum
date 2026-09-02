// Warms Overall's Sheet-mode CSV fetch ahead of an actual navigation (sidebar
// hover/focus on the Overall nav link -- see routePrefetch.js's prefetchRoute,
// which already calls this) -- so by the time OverallDashboard.jsx actually
// mounts and calls its own loadData(), the ~43MB download may already be
// finished (or well underway), instead of starting cold at mount time.
//
// Deliberately its own tiny, dependency-free module rather than living inside
// OverallDashboard.jsx: routePrefetch.js's hover handlers need to call this
// WITHOUT forcing OverallDashboard.jsx's own large, code-split chunk to load
// eagerly (a static import from routePrefetch.js into that page would defeat
// the whole point of it being lazy-loaded). The URL-resolution logic here
// necessarily duplicates a few lines of OverallDashboard.jsx's own
// resolveOverallUrlFast() -- kept low-risk by sharing the exact same
// sessionStorage memoisation key, so both converge on the same resolved URL
// in practice rather than silently drifting apart.
//
// Also a hard-learned constraint (see App.jsx's own comment on the Summary
// page's idle-prefetch, which once regressed Overall's own first paint to
// 76-86s by racing competing fetches): this must NEVER fire while already on
// the Overall route itself, and must never run on a generic app-wide idle
// timer -- only on a specific, deliberate "about to navigate there" signal
// (nav-link hover/focus), so it can never contend with a page's own critical
// fetch the way that regression did.

const DEFAULT_URL = 'https://docs.google.com/spreadsheets/d/1kaoWMGBbttOtaeVfaSXhrxcs0_pe5xLXltMulG8mHG4/gviz/tq?tqx=out:csv&sheet=MainData'
const URL_CACHE_KEY = 'lq_overall_sheet_url'

async function resolveUrl() {
  try {
    const cached = sessionStorage.getItem(URL_CACHE_KEY)
    if (cached) return cached
  } catch (_) { /* private mode etc -- fall through to a live resolve */ }
  try {
    const r = await fetch('/api/preferences?resolveOverallSheet=1', { credentials: 'include' })
    if (r.ok) {
      const { url } = await r.json()
      if (url) return url
    }
  } catch (_) { /* fall back to the default below */ }
  return DEFAULT_URL
}

// One in-flight prefetch at a time -- a second hover while one is already
// running (or already consumed) is a harmless no-op, not a duplicate fetch.
let pending = null

export function prefetchOverallCsv() {
  if (pending) return
  pending = (async () => {
    try {
      const url = await resolveUrl()
      const res = await fetch(url)
      const text = await res.text()
      return { url, text, ok: res.ok }
    } catch (_) {
      return null
    }
  })()
}

// Consumed (at most) once, by OverallDashboard.jsx's own loadData(). Returns
// null if nothing was prefetched, or if the prefetched URL doesn't match the
// one the real page actually resolved (e.g. an admin changed the sheet
// override mid-session) -- either way, the caller falls straight through to
// its own normal fetch, so this can never be the ONLY path to real data.
export function consumePrefetchedOverallCsv(expectedUrl) {
  const p = pending
  pending = null
  if (!p) return Promise.resolve(null)
  return p.then(r => (r && r.url === expectedUrl) ? r : null)
}
