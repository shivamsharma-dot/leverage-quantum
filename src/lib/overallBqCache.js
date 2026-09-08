// src/lib/overallBqCache.js
// Client-side reader for the Overall (BigQuery) dashboard's cached data.
//
// Written by : .github/workflows/overall-bq-sync.yml -- cron '5,35 * * * *', i.e.
//              twice an hour (GitHub throttles scheduled workflows on low-activity
//              repos, so observed real spacing on this repo is 2-3.5 hours).
// Schema     : supabase/sql/overall_bq_cache_setup.sql -- the 16 columns of the
//              BigQuery saved query "Overall", plus row_key / lead_date_iso /
//              sync_id / synced_at, in Supabase's overall_bq_daily table.
// Read by    : the admin-only /dashboard/overall-bigquery page.
//
// 2026-09-08 -- moved off a direct-from-browser Supabase read.
// This used to fetch overall_bq_daily straight from the browser with the public
// Supabase anon key, one request per page of up to 1000 rows. Investigated live via
// Supabase's own Logs Explorer (grouped by request path, last 24h): overall_bq_daily
// alone was generating ~6,451 requests/day -- by a wide margin the single biggest
// table on the whole project -- and the math lines up almost exactly with the org's
// real measured egress (~580MB/day average against Supabase's 5GB/month free-tier
// cap), which is what pushed the account over its usage quota two billing cycles
// running. See api/crm-leads.js's handleBigQuery (mode=overall_bq_*) for the fix: a
// small server-side endpoint that keeps a short (5-minute) in-memory copy of whatever
// was last fetched for a given (since, until, sources) combination, instead of every
// browser tab re-querying Supabase from scratch. The underlying table only actually
// changes 2-3x/day (the sync workflow above), so a 5-minute-old cached answer is
// never meaningfully stale -- nobody using the page can tell the difference.
//
// Every exported function below keeps its EXACT original name, arguments and return
// shape, so OverallDashboard.jsx (the only consumer) needed zero changes for this.
// The two rules the old direct-Supabase version had to learn the hard way (PostgREST
// caps every response at 1000 rows regardless of 'limit', and paging must be keyed on
// row_key or page boundaries are not stable) still apply -- they just now live
// server-side, in api/crm-leads.js, instead of here.

const API = '/api/crm-leads?source=bigquery'

// The toggle is a per-device preference, like every other lq_* setting (theme, SR
// fee, number format...). Kept here even though nothing in the app currently reads
// it -- OverallDashboard.jsx moved to two separate fixed routes (see its own comment,
// "Which source this page instance reads is now fixed by the dataSource prop") rather
// than a per-device toggle, but these are cheap to leave in place.
export const BQ_BETA_KEY = 'lq_overall_bq_beta'
export const BQ_BETA_EVENT = 'lq:overall-bq-beta-changed'

export function readBqBeta() {
  try { return localStorage.getItem(BQ_BETA_KEY) === '1' } catch (_) { return false }
}
export function writeBqBeta(on) {
  try { localStorage.setItem(BQ_BETA_KEY, on ? '1' : '0') } catch (_) {}
  try { window.dispatchEvent(new CustomEvent(BQ_BETA_EVENT, { detail: { on: !!on } })) } catch (_) {}
}

async function apiGet(mode, params) {
  const qs = new URLSearchParams(Object.assign({ mode }, params || {}))
  const r = await fetch(API + '&' + qs.toString())
  const j = await r.json().catch(() => null)
  if (!r.ok) throw new Error((j && j.error) || ('overall_bq ' + mode + ' failed (' + r.status + ')'))
  return j || {}
}

// since / until are inclusive 'YYYY-MM-DD' strings, matched server-side against
// lead_date_iso. sources may be omitted, empty, or ['All'] to mean "no Source filter".
export async function fetchOverallBqRows({ since, until, sources }) {
  if (!since || !until) throw new Error('fetchOverallBqRows needs both since and until')
  const list = (sources || []).filter(s => s && s !== 'All')
  const j = await apiGet('overall_bq_rows', { since, until, sources: list.join(',') })
  return Array.isArray(j.rows) ? j.rows : []
}

// Same contract as fetchOverallBqRows, against the pre-aggregated day+Source
// companion table instead -- callers that only need Source/Month/Day-level numbers
// (not per-campaign) get the same date-range behaviour, just fast regardless of how
// wide the range is.
export async function fetchOverallBqAggRows({ since, until, sources }) {
  if (!since || !until) throw new Error('fetchOverallBqAggRows needs both since and until')
  const list = (sources || []).filter(s => s && s !== 'All')
  const j = await apiGet('overall_bq_agg_rows', { since, until, sources: list.join(',') })
  return Array.isArray(j.rows) ? j.rows : []
}

// Oldest and newest lead_date_iso in the cache -- the page's Month dropdown is built
// from these, since (unlike the CSV path) this one deliberately never holds the whole
// table in memory.
export async function fetchOverallBqBounds() {
  const j = await apiGet('overall_bq_bounds')
  return { min: j.min || null, max: j.max || null }
}

// Newest synced_at stamp, shown as the page's "Synced" time -- so the header reports
// when the CACHE last ran, not when this tab happened to fetch. Best-effort: a
// failure here must not block the actual data.
export async function fetchOverallBqSyncedAt() {
  try {
    const j = await apiGet('overall_bq_synced_at')
    return j.synced_at ? new Date(j.synced_at) : null
  } catch (_) { return null }
}
