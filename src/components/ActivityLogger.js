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
export async function logActivity(email, action, page, detail = '') {
  if (!email) return
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, {
      method: 'POST',
      headers: SBH,
      body: JSON.stringify({
        email,
        action,
        page,
        detail: String(detail).slice(0, 240),
        created_at: new Date().toISOString(),
      }),
    })
  } catch {}
}

/* ── read ───────────────────────────────────────────────────── */
export async function getActivityLog(limit = 200) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/activity_log?select=*&order=created_at.desc&limit=${limit}`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    )
    if (!res.ok) return []
    return await res.json()
  } catch { return [] }
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
