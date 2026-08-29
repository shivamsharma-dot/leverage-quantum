/* Leverage Quantum — Activity Logger
 * Comprehensive tracking: page views, clicks, tab switches, sessions.
 * Writes to Supabase `activity_log` table. Throttled + batched to avoid flooding.
 *
 * activity_log columns: email, action, page, detail (text), created_at
 *   action ∈ 'view' | 'click' | 'tab' | 'login' | 'logout' | 'search' | 'export' | 'leave'
 *   detail = human-readable context (label clicked, tab name, time spent, etc.)
 */
const SUPABASE_URL = 'https://tsyekthwthxszmsgqfej.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzeWVrdGh3dGh4c3ptc2dxZmVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NjkzMDIsImV4cCI6MjA5NTM0NTMwMn0.bdM9h5c3PDu9hgggjBdbA-eb7kfF-79c6txOnCUxRhY'

const SBH = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal',
}

/* ── core write ─────────────────────────────────────────────── */
// Confirmed live 2026-08-29: this POST intermittently comes back 503 under real
// page-load conditions (reproducible via the app itself), while an identical,
// isolated request (same key, same payload, same headers, from outside the
// browser) succeeds every time -- points at a transient connection-pool/edge
// hiccup on Supabase's side under the real page's concurrent-request burst, not
// a config problem here. There is no error-monitoring tool wired into this app
// (confirmed: no Sentry/PostHog, nothing), and the old bare `catch {}` swallowed
// every failure with zero trace anywhere -- the activity log for a tool that
// writes to production LeadSquared had been silently going dark with nobody
// notified. One retry gives a transient blip a real second chance (matches the
// same pattern useAuth.jsx's refreshUser() already uses for its own Supabase-
// adjacent call), and a real console.error on total failure means this is now at
// least visible in DevTools/any future monitoring instead of invisible always.
export async function logActivity(email, action, page, detail = '') {
  if (!email) return
  const payload = JSON.stringify({
    email,
    action,
    page,
    detail: String(detail).slice(0, 240),
    created_at: new Date().toISOString(),
  })
  const attempt = () => fetch(`${SUPABASE_URL}/rest/v1/activity_log`, { method: 'POST', headers: SBH, body: payload })
  try {
    let r = await attempt()
    if (!r.ok) r = await attempt()
    if (!r.ok) console.error(`[activity_log] write failed after retry: ${r.status} ${r.statusText}`, { action, page })
  } catch (e) {
    console.error('[activity_log] write threw (network-level failure)', e)
  }
}

/* ── read ───────────────────────────────────────────────────── */
// IST midnight for a given day offset (0 = today, -1 = yesterday, ...), returned
// as a UTC ISO string so it compares correctly against created_at (stored UTC).
function istMidnightIso(dayOffset = 0) {
  const now = new Date()
  const istNow = new Date(now.getTime() + 5.5 * 3600000) // shift to IST wall-clock
  istNow.setUTCDate(istNow.getUTCDate() + dayOffset)
  istNow.setUTCHours(0, 0, 0, 0)
  return new Date(istNow.getTime() - 5.5 * 3600000).toISOString() // shift back to real UTC instant
}

// The whole calendar day (IST), not a flat row cap -- Supabase's hosted PostgREST
// caps any single response at 1000 rows regardless of `limit`, so a genuinely busy
// day is paginated via the Range header (same pattern src/lib/overallBqCache.js and
// leverageCareersCache.js already use for exactly this reason) rather than silently
// truncated. Capped at 20 pages (20,000 rows) as a runaway-query backstop only --
// real daily volume is nowhere near that.
export async function getActivityLogForDay(dayOffset = 0) {
  const since = istMidnightIso(dayOffset)
  const until = istMidnightIso(dayOffset + 1)
  const rows = []
  for (let page = 0; page < 20; page++) {
    const from = page * 1000, to = from + 999
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/activity_log?select=*&created_at=gte.${since}&created_at=lt.${until}&order=created_at.desc`,
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, Range: `${from}-${to}` } }
      )
      if (!res.ok) break
      const batch = await res.json()
      rows.push(...batch)
      if (batch.length < 1000) break
    } catch { break }
  }
  return rows
}

/* ── human-readable label for the current route ─────────────── */
const PAGE_LABELS = {
  '/': 'Summary',
  '/dashboard/meta-ads': 'Meta Ads',
  '/dashboard/google-ads': 'Google Ads',
  '/dashboard/roas': 'ROAS',
  '/dashboard/mtd': 'MTD',
  '/dashboard/lead-quality': 'Lead Quality',
  '/dashboard/channel-mix': 'Channel Mix',
  '/dashboard/revenue': 'Revenue',
  '/dashboard/lq-ops': 'QL Ops',
  '/dashboard/whatsapp': 'WhatsApp',
  '/dashboard/referral': 'Referral',
  '/dashboard/chat': 'Ask AI',
  '/settings': 'Settings',
}
export function pageLabel(pathname) {
  return PAGE_LABELS[pathname] || pathname
}

/* ── global interaction tracker ─────────────────────────────────
 * Installs document-level listeners that capture meaningful clicks
 * (buttons, links, tabs, nav items) and tab/visibility changes.
 * Throttled so rapid clicks don't spam the DB. Call once after login.
 * Returns a cleanup fn.
 */
let _installed = false
export function installActivityTracker(getEmail, getPathname) {
  if (_installed || typeof window === 'undefined') return () => {}
  _installed = true

  let lastSig = ''
  let lastAt = 0
  const THROTTLE_MS = 1200   // ignore identical events within this window

  const fire = (action, detail) => {
    const email = getEmail()
    if (!email) return
    const sig = action + '|' + detail
    const now = Date.now()
    if (sig === lastSig && now - lastAt < THROTTLE_MS) return
    lastSig = sig; lastAt = now
    logActivity(email, action, getPathname(), detail)
  }

  /* Click capture — find the most meaningful label for what was clicked */
  const onClick = (e) => {
    const el = e.target?.closest?.('button, a, [role="tab"], [role="button"], [data-track]')
    if (!el) return

    // Explicit override
    const explicit = el.getAttribute('data-track')

    // Detect a tab switch (role=tab, or common tab class patterns)
    const isTab = el.getAttribute('role') === 'tab' ||
                  /tab/i.test(el.className || '') ||
                  el.closest?.('[role="tablist"]')

    // Best-effort human label
    let label = explicit
      || el.getAttribute('aria-label')
      || el.getAttribute('title')
      || (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60)
      || el.tagName.toLowerCase()

    if (!label) return
    // Skip noise
    if (label.length < 2) return

    fire(isTab ? 'tab' : 'click', label)
  }

  /* Tab/window visibility — track when user switches away/back */
  const onVisibility = () => {
    const email = getEmail()
    if (!email) return
    if (document.visibilityState === 'hidden') {
      logActivity(email, 'tab', getPathname(), 'Switched away from Quantum')
    } else if (document.visibilityState === 'visible') {
      logActivity(email, 'tab', getPathname(), 'Returned to Quantum')
    }
  }

  document.addEventListener('click', onClick, true)
  document.addEventListener('visibilitychange', onVisibility)

  return () => {
    document.removeEventListener('click', onClick, true)
    document.removeEventListener('visibilitychange', onVisibility)
    _installed = false
  }
}
