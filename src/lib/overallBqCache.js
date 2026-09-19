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
// 2026-09-08 -- moved off a direct-from-browser Supabase read, WITH a fallback.
// This used to fetch overall_bq_daily straight from the browser with the public
// Supabase anon key, one request per page of up to 1000 rows. Investigated live via
// Supabase's own Logs Explorer (grouped by request path, last 24h): overall_bq_daily
// alone was generating ~6,451 requests/day -- by a wide margin the single biggest
// table on the whole project -- and the math lines up almost exactly with the org's
// real measured egress (~580MB/day average against Supabase's 5GB/month free-tier
// cap), which is what pushed the account over its usage quota two billing cycles
// running. See api/crm-leads.js's handleBigQuery (mode=overall_bq_*) for the main
// fix: a small server-side endpoint that keeps a short (5-minute) in-memory copy of
// whatever was last fetched for a given (since, until, sources) combination, instead
// of every browser tab re-querying Supabase from scratch.
//
// REAL BUG FOUND LIVE, SAME DAY: a wide range against the raw overall_bq_daily table
// (one row per campaign, not the small pre-aggregated companion) can need far more
// sequential keyset pages than the server function's own 60-second ceiling allows --
// the OLD direct-from-browser version had no such ceiling and would just take longer.
// A 2-month range genuinely timed out (502) the first time this shipped. Fixed by
// having the server bail out cleanly at a safe time budget with `truncated:true`, and
// having fetchRowsWithFallback below pick up exactly where it left off via the same
// direct-to-Supabase pagination the old version always used -- so a wide query still
// always succeeds, it just does not get the caching benefit for whatever tail the
// server couldn't finish in time. The two rules that direct path had to learn the hard
// way still apply here: PostgREST caps every response at 1000 rows regardless of
// 'limit', and paging must be keyed on row_key (the table's primary key) or page
// boundaries are not stable.
//
// 2026-09-19 -- the server side of this (api/crm-leads.js's handleBigQuery) now splits
// a wide [since,until] range into calendar-month chunks and fetches them CONCURRENTLY
// (capped at 3 at once) instead of one long sequential pagination -- cut a normal MTD
// load (current month + prior month for the delta %s, often 50,000+ rows) roughly in
// half. If the shared time budget still runs out, the server reports each incomplete
// CHUNK's own [since,until,cursor] as `remainingRanges` (a chunk's own range may not
// reach the overall `until`) instead of one flat cursor -- fetchRowsWithFallback below
// fetches each of those tails in parallel too. No COUNT(*) query anywhere in this --
// an earlier parallel attempt (2026-09-13) needed one to plan offset/limit batches, and
// that COUNT itself started timing out under real load; splitting by a boundary the
// caller already controls (calendar months) sidesteps that class of failure entirely.
//
// Every exported function below keeps its EXACT original name, arguments and return
// shape, so OverallDashboard.jsx (the only consumer) needed zero changes for any of
// this -- caching, the chunking, or the fallback.

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

async function apiGet(mode, params, signal) {
  const qs = new URLSearchParams(Object.assign({ mode }, params || {}))
  const r = await fetch(API + '&' + qs.toString(), signal ? { signal } : undefined)
  const j = await r.json().catch(() => null)
  if (!r.ok) throw new Error((j && j.error) || ('overall_bq ' + mode + ' failed (' + r.status + ')'))
  return j || {}
}

// --- Direct-to-Supabase fallback, used ONLY to finish a range the cached server
// endpoint above couldn't complete inside its own time budget. Same technique the
// whole file used to run unconditionally: keyset pagination on row_key, PostgREST's
// 1000-row page cap, quoting rule for the Source IN-list.
const SB_URL = 'https://tsyekthwthxszmsgqfej.supabase.co'
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzeWVrdGh3dGh4c3ptc2dxZmVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NjkzMDIsImV4cCI6MjA5NTM0NTMwMn0.bdM9h5c3PDu9hgggjBdbA-eb7kfF-79c6txOnCUxRhY'
const BQ_COLUMNS = [
  'lead_date', 'month', 'Source', 'Sub_Source', 'campaign_name',
  'Total Leads Generated', 'floor_queued', 'Queued on Futwork Human', 'Queued on Futwork AI', 'Queued on Superbot',
  'Futwork Human QL', 'Futwork AI QL', 'Superbot AI QL',
  'Total_Spends', 'Total Apps', 'Total Offers', 'Total Deposits', 'Total RAUs',
]
const AGG_COLUMNS = [
  'lead_date', 'month', 'Source',
  'Total Leads Generated', 'floor_queued', 'Queued on Futwork Human', 'Queued on Futwork AI', 'Queued on Superbot',
  'Futwork Human QL', 'Futwork AI QL', 'Superbot AI QL',
  'Total_Spends', 'Total Apps', 'Total Offers', 'Total Deposits', 'Total RAUs',
]
const inList = vals => '(' + vals.map(v => '"' + String(v).replace(/"/g, '') + '"').join(',') + ')'
// Was 1000 -- matches the server-side PAGE bump in api/crm-leads.js (2026-09-19),
// now that the Supabase project's Data API "Max rows" setting has been raised to
// 10,000. This path is only ever used to finish the TAIL of a chunk the server
// itself couldn't complete in time -- keeping it in step with the server's own
// page size means a fallback read costs the same number of round trips per row
// as the primary path, not a regression back to the old 10x-more-requests rate.
const PAGE = 2000

async function fetchTailDirect({ table, columns, since, until, sources, cursor, signal }) {
  const select = columns.map(c => (/^[a-z_]+$/.test(c) ? c : '"' + c + '"')).join(',')
  const headers = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY }
  const rows = []
  let cur = cursor || null
  for (let guard = 0; guard < 2000; guard++) { // 20,00,000-row safety valve
    const p = new URLSearchParams({ select: select + ',row_key', order: 'row_key.asc', limit: String(PAGE) })
    p.set('lead_date_iso', 'gte.' + since)
    p.append('lead_date_iso', 'lte.' + until)
    const list = (sources || []).filter(s => s && s !== 'All')
    if (list.length) p.set('Source', 'in.' + inList(list))
    if (cur != null) p.set('row_key', 'gt.' + cur)
    const r = await fetch(SB_URL + '/rest/v1/' + table + '?' + p.toString(), signal ? { headers, signal } : { headers })
    if (!r.ok) throw new Error(table + ' fallback read failed (' + r.status + ')')
    const page = await r.json()
    if (!Array.isArray(page)) throw new Error(table + ' returned a non-array response')
    if (!page.length) break
    for (const row of page) { const { row_key, ...rest } = row; rows.push(rest) }
    if (page.length < PAGE) break
    cur = page[page.length - 1].row_key
  }
  return rows
}

// signal (optional AbortSignal) lets a caller genuinely cancel this instead of just
// discarding its eventual result. Real bug found live (2026-09-08): on a cold Overall
// (BigQuery) load, bqRange can briefly compute a full-history fallback range (its own
// month-lookup table hasn't loaded yet) and fire a request for it, then moments later
// recompute the correct narrow range and fire a second, better one -- but without a way
// to actually cancel the first, it kept paging through the whole ~1.5-year table in the
// background even after its result became irrelevant, competing for the same Supabase/
// Vercel resources as the fetch that was actually going to be shown and stalling the
// page for 40+ seconds. The caller aborts the stale one from its effect cleanup once a
// newer bqSince/bqUntil supersedes it.
async function fetchRowsWithFallback(mode, table, columns, { since, until, sources, signal }) {
  const list = (sources || []).filter(s => s && s !== 'All')
  const j = await apiGet(mode, { since, until, sources: list.join(',') }, signal)
  const rows = Array.isArray(j.rows) ? j.rows : []
  if (!j.truncated) return rows
  // The server now fetches the requested range as several calendar-month chunks IN
  // PARALLEL (2026-09-19, to cut the page's load time) instead of one long sequential
  // pagination -- see api/crm-leads.js's own comment for why (a COUNT-based parallel
  // attempt on 2026-09-13 caused real Postgres timeouts and was reverted; this one
  // never needs a COUNT at all). If the shared time budget still runs out, the server
  // reports each INCOMPLETE chunk's own [since,until,cursor] separately
  // (remainingRanges), since a truncated chunk's own range may not even reach the
  // overall `until` -- fetch each of those tails directly from Supabase in parallel too,
  // same proven keyset-pagination technique as before. Falls back to the older single-
  // cursor shape if an unbusted server response ever sends it instead.
  const ranges = Array.isArray(j.remainingRanges) && j.remainingRanges.length
    ? j.remainingRanges
    : [{ since, until, cursor: j.cursor }]
  const tails = await Promise.all(ranges.map(rr => fetchTailDirect({ table, columns, since: rr.since, until: rr.until, sources, cursor: rr.cursor, signal })))
  return rows.concat(...tails)
}

// since / until are inclusive 'YYYY-MM-DD' strings, matched server-side against
// lead_date_iso. sources may be omitted, empty, or ['All'] to mean "no Source filter".
// signal: optional AbortSignal -- see the comment on fetchRowsWithFallback.
export async function fetchOverallBqRows({ since, until, sources, signal }) {
  if (!since || !until) throw new Error('fetchOverallBqRows needs both since and until')
  return fetchRowsWithFallback('overall_bq_rows', 'overall_bq_daily', BQ_COLUMNS, { since, until, sources, signal })
}

// The Overall (BigQuery) page's own DEFAULT-view snapshot (2026-09-19) -- see
// the sync workflow's own comment for the full story (stored under
// app_preferences, key 'overall_bq_prewarm_default' -- not a dedicated table,
// to avoid needing a manual one-time SQL-editor step). ONE fast Supabase read
// (a single row, not a paginated per-campaign
// scan), so a genuinely first-ever click of the day can be fast too, not just a
// repeat visit (which the IndexedDB cache in OverallDashboard.jsx already covers).
// Rows come back POSITIONAL (an array of arrays in BQ_COLUMNS' own fixed order,
// written that way by the sync to avoid repeating 18 verbose column names on
// every one of 50,000-100,000+ rows) -- zipped back into the same keyed-object
// shape fetchOverallBqRows already returns, so callers need no special-casing.
// Returns null (never throws) on any failure or an empty/missing prewarm row --
// this is purely a speed optimisation the caller can always safely skip.
export async function fetchOverallBqPrewarm(signal) {
  try {
    const j = await apiGet('overall_bq_prewarm', {}, signal)
    if (!j || !Array.isArray(j.rows) || !j.since || !j.until) return null
    const rows = j.rows.map(arr => {
      const o = {}
      BQ_COLUMNS.forEach((col, i) => { o[col] = arr[i] })
      return o
    })
    return { since: j.since, until: j.until, rows }
  } catch (_) {
    return null
  }
}

// Same contract as fetchOverallBqRows, against the pre-aggregated day+Source
// companion table instead -- callers that only need Source/Month/Day-level numbers
// (not per-campaign) get the same date-range behaviour, just fast regardless of how
// wide the range is (this table stays at most a few thousand rows for the whole
// history, so it is not expected to ever hit the server's time budget in practice).
export async function fetchOverallBqAggRows({ since, until, sources, signal }) {
  if (!since || !until) throw new Error('fetchOverallBqAggRows needs both since and until')
  return fetchRowsWithFallback('overall_bq_agg_rows', 'overall_bq_daily_agg', AGG_COLUMNS, { since, until, sources, signal })
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
