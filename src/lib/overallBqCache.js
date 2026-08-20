// src/lib/overallBqCache.js
// Client-side reader for the public.overall_bq_daily Supabase cache.
//
// Written by : .github/workflows/overall-bq-sync.yml -- cron '5,35 * * * *', i.e.
//              twice an hour (GitHub throttles scheduled workflows on low-activity
//              repos, so observed real spacing on this repo is 2-3.5 hours).
// Schema     : supabase/sql/overall_bq_cache_setup.sql -- the 16 columns of the
//              BigQuery saved query "Overall", plus row_key / lead_date_iso /
//              sync_id / synced_at.
// Read by    : the admin-only, off-by-default "Data source: BigQuery (beta)" toggle
//              on /dashboard/overall (src/pages/OverallDashboard.jsx).
//
// WHY THIS EXISTS
// /dashboard/overall normally downloads the entire "Overall PM" Google Sheet
// (2,05,720 rows) as CSV and parses every row in the browser -- the documented
// reason that page is slow. With the toggle on, the same numbers come from this
// table with the date range and the Source filter already applied SERVER-SIDE, so
// the browser only ever receives the rows the view on screen actually needs.
//
// Two rules carried over verbatim from src/lib/overallFunnelCache.js, both of which
// were real production bugs there first:
//   1. Supabase's hosted PostgREST caps EVERY response at 1000 rows server-side, no
//      matter what 'limit' asks for. So every multi-row read here pages through with
//      the Range header (see fetchAllPaginated for how, and why it is not sequential).
//   2. Paginating without an explicit ORDER BY is a second, independent bug -- page
//      boundaries are not guaranteed stable across requests. Every read below orders
//      by row_key, the table's primary key.
//
// This file does NOT read, write or reference public.overall_funnel_daily. That table
// still feeds Ask AI's analyze_campaign_contribution tool, the Marketing Performance
// report and both agents. The two pipelines are deliberately parallel.

const SB_URL = 'https://tsyekthwthxszmsgqfej.supabase.co'
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzeWVrdGh3dGh4c3ptc2dxZmVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NjkzMDIsImV4cCI6MjA5NTM0NTMwMn0.bdM9h5c3PDu9hgggjBdbA-eb7kfF-79c6txOnCUxRhY'
const TABLE = 'overall_bq_daily'
// Pre-aggregated day+Source companion, populated by the same sync run --
// see supabase/sql/overall_bq_agg_setup.sql for why this exists. At most a
// few thousand rows for the entire history (vs. TABLE's one-row-per-campaign
// growth), which is what makes fetchOverallBqAggRows() fast regardless of
// the date range picked.
const AGG_TABLE = 'overall_bq_daily_agg'

// The toggle is a per-device preference, like every other lq_* setting (theme, SR
// fee, number format...). The key and the event name live here, not in either page,
// so Settings and OverallDashboard cannot drift apart on them.
export const BQ_BETA_KEY = 'lq_overall_bq_beta'
// localStorage's own 'storage' event only fires in OTHER tabs, so flipping the toggle
// in Settings needs an explicit same-tab event too -- the same lesson already learned
// with 'lq:hidden-pages-changed'.
export const BQ_BETA_EVENT = 'lq:overall-bq-beta-changed'

export function readBqBeta() {
  try { return localStorage.getItem(BQ_BETA_KEY) === '1' } catch (_) { return false }
}
export function writeBqBeta(on) {
  try { localStorage.setItem(BQ_BETA_KEY, on ? '1' : '0') } catch (_) {}
  try { window.dispatchEvent(new CustomEvent(BQ_BETA_EVENT, { detail: { on: !!on } })) } catch (_) {}
}

// The 18 columns of the saved query, named EXACTLY as BigQuery returns them -- spaces
// and capitals included, because the sync keeps them byte-identical. That is the
// whole point: OverallDashboard's existing mapRow() reads these same header names off
// the CSV, so a row from here drops into it unchanged. No mapping layer means no way
// for the two paths to disagree about what a column means.
// Sub_Source added 2026-08-17 (sub_source_updated in BigQuery), matching the Overall
// PM sheet's own Sub_Source column added the same day -- see
// supabase/sql/overall_bq_add_sub_source.sql.
// 'Queued on Futwork' renamed to 'Queued on Futwork Human' and 'Queued on Futwork AI'
// added 2026-08-20 (same underlying leads, the label now names the Futwork channel
// explicitly now that a second one exists) -- see
// supabase/sql/overall_bq_add_futwork_ai_queued.sql. Selecting the old column name here
// would 400 against the renamed table and silently fall the whole page back to the CSV.
const BQ_COLUMNS = [
  'lead_date', 'month', 'Source', 'Sub_Source', 'campaign_name',
  'Total Leads Generated', 'floor_queued', 'Queued on Futwork Human', 'Queued on Futwork AI', 'Queued on Superbot',
  'Futwork Human QL', 'Futwork AI QL', 'Superbot AI QL',
  'Total_Spends', 'Total Apps', 'Total Offers', 'Total Deposits', 'Total RAUs',
]
// PostgREST needs double quotes around any column name that is not plain lowercase.
const SELECT = BQ_COLUMNS.map(c => (/^[a-z_]+$/.test(c) ? c : '"' + c + '"')).join(',')

const headers = extra => Object.assign({ apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY }, extra || {})

async function sbGet(params, extraHeaders, table = TABLE) {
  const r = await fetch(SB_URL + '/rest/v1/' + table + '?' + params.toString(), { headers: headers(extraHeaders) })
  if (!r.ok) throw new Error(table + ' read failed (' + r.status + ')')
  const j = await r.json()
  if (!Array.isArray(j)) throw new Error(table + ' returned a non-array response')
  return j
}

// One page is 1000 rows and that is not negotiable. Pages used to be fetched by OFFSET
// (via a Range header) and batched 8-at-a-time for speed -- a July-sized window (40,284
// rows / 41 pages) measured 5.0s that way, versus 22.6s fetched one at a time.
//
// Live-verified (2026-08-06) that OFFSET pagination is exactly what broke on a WIDE range
// (e.g. Trend Analysis' 6-month window): 'OFFSET N LIMIT 1000' makes Postgres walk and
// discard N rows in sorted order before it can return page N+1, so cost grows with how
// deep into the result set a page sits. A 6-month range reaches offsets in the hundreds
// of thousands; the 2-month range this page normally needs never gets past a few tens of
// thousands. That is exactly the shape of what broke: the narrow range never failed once
// across dozens of real fetches that session, while the wide range failed on roughly HALF
// of every page, in whole concurrent batches -- and got WORSE, not better, once failed
// pages started retrying, because each retry is just another expensive deep-OFFSET query
// stacked on an already-overloaded resource.
//
// Fixed by paging on row_key itself: 'WHERE row_key > <last seen key> ORDER BY row_key
// LIMIT 1000'. A keyset seek on an indexed primary key costs about the same whether it is
// page 1 or page 200, so failures stop scaling with range width. The trade-off: a cursor
// page needs the PREVIOUS page's last key, so pages are fetched one after another rather
// than in parallel batches -- slower in the best case, but the parallel path was never
// reliably finishing a wide fetch at all, so this trades peak speed for actually working.
const PAGE = 1000

async function sbGetPage(params, cursor, table = TABLE) {
  const p = new URLSearchParams(params)
  if (cursor != null) p.set('row_key', 'gt.' + cursor)
  p.set('limit', String(PAGE))
  const r = await fetch(SB_URL + '/rest/v1/' + table + '?' + p.toString(), { headers: headers() })
  if (!r.ok) throw new Error(table + ' read failed (' + r.status + ')')
  const rows = await r.json()
  if (!Array.isArray(rows)) throw new Error(table + ' returned a non-array response')
  return rows
}

// A cursor seek is cheap regardless of depth, so a page should rarely fail at all now --
// this is a light safety net for a genuine one-off network blip, not the primary
// reliability mechanism the way retrying used to be under OFFSET pagination.
async function sbGetPageRetry(params, cursor, table, attempts = 3, delay = 400) {
  let lastErr
  for (let i = 0; i < attempts; i++) {
    try { return await sbGetPage(params, cursor, table) }
    catch (e) { lastErr = e; if (i < attempts - 1) await new Promise(res => setTimeout(res, delay * (i + 1))) }
  }
  throw lastErr
}

async function fetchAllPaginated(params, table = TABLE) {
  // row_key is the cursor column -- make sure it rides along even if a caller's own
  // select list never asked for it, then strip it back off before returning so every
  // caller still sees exactly the row shape mapRow() has always expected.
  const p = new URLSearchParams(params)
  const sel = p.get('select') || ''
  if (!/(^|,)row_key(,|$)/.test(sel)) p.set('select', sel ? sel + ',row_key' : 'row_key')

  let all = []
  let cursor = null
  for (let guard = 0; guard < 2000; guard++) { // 20,00,000-row safety valve
    const rows = await sbGetPageRetry(p, cursor, table)
    if (!rows.length) break
    all = all.concat(rows)
    if (rows.length < PAGE) break
    cursor = rows[rows.length - 1].row_key
  }
  return all.map(r => { const { row_key, ...rest } = r; return rest })
}

// 'in.(...)' is a comma-separated list, so every value is quoted: Source values
// contain spaces and '+' ('Content+Brand', ...) and an unquoted list would split on
// any comma inside one. Embedded double quotes are dropped rather than escaped --
// Source is a bucketed CASE output in the saved query and never contains one, and a
// silent drop is safer here than emitting a malformed filter.
const inList = vals => '(' + vals.map(v => '"' + String(v).replace(/"/g, '') + '"').join(',') + ')'

// since / until are inclusive 'YYYY-MM-DD' strings, matched against lead_date_iso --
// the indexed DATE the sync derives from lead_date. (lead_date itself stays byte-exact
// as BigQuery returned it, 'DD-Mon-YYYY', which is what mapRow() parses.)
// sources may be omitted, empty, or ['All'] to mean "no Source filter".
export async function fetchOverallBqRows({ since, until, sources }) {
  if (!since || !until) throw new Error('fetchOverallBqRows needs both since and until')
  const params = new URLSearchParams({ select: SELECT, order: 'row_key.asc' })
  params.set('lead_date_iso', 'gte.' + since)
  params.append('lead_date_iso', 'lte.' + until)
  const list = (sources || []).filter(s => s && s !== 'All')
  if (list.length) params.set('Source', 'in.' + inList(list))
  return fetchAllPaginated(params)
}

// Same 11 metric columns as BQ_COLUMNS, minus campaign_name (aggregated away --
// see supabase/sql/overall_bq_agg_setup.sql) -- lead_date/month/Source carried
// straight through so mapRow() (src/pages/OverallDashboard.jsx) needs no changes
// at all; campaign_name simply comes back as undefined, which mapRow() already
// treats as ''.
const AGG_COLUMNS = [
  'lead_date', 'month', 'Source',
  'Total Leads Generated', 'floor_queued', 'Queued on Futwork Human', 'Queued on Futwork AI', 'Queued on Superbot',
  'Futwork Human QL', 'Futwork AI QL', 'Superbot AI QL',
  'Total_Spends', 'Total Apps', 'Total Offers', 'Total Deposits', 'Total RAUs',
]
const AGG_SELECT = AGG_COLUMNS.map(c => (/^[a-z_]+$/.test(c) ? c : '"' + c + '"')).join(',')

// The fast path: reads overall_bq_daily_agg (at most a few thousand rows for the
// whole history) instead of overall_bq_daily (one row per campaign, only grows).
// Same since/until/sources contract as fetchOverallBqRows() -- callers that only
// need Source/Month/Day-level numbers (KPI cards, the funnel chart, everything
// except the Campaign and Corridor groupings, which need per-campaign rows and
// must keep using fetchOverallBqRows) can swap straight to this for the same
// date-range behaviour, just fast regardless of how wide the range is.
export async function fetchOverallBqAggRows({ since, until, sources }) {
  if (!since || !until) throw new Error('fetchOverallBqAggRows needs both since and until')
  const params = new URLSearchParams({ select: AGG_SELECT, order: 'row_key.asc' })
  params.set('lead_date_iso', 'gte.' + since)
  params.append('lead_date_iso', 'lte.' + until)
  const list = (sources || []).filter(s => s && s !== 'All')
  if (list.length) params.set('Source', 'in.' + inList(list))
  return fetchAllPaginated(params, AGG_TABLE)
}

// Oldest and newest lead_date_iso in the cache, as two single-row reads. The CSV path
// knows every month for free because it holds the whole sheet in memory; this path
// deliberately does not, so the page's Month dropdown is built from these bounds.
export async function fetchOverallBqBounds() {
  const one = async dir => {
    const p = new URLSearchParams({ select: 'lead_date_iso', order: 'lead_date_iso.' + dir, limit: '1' })
    p.set('lead_date_iso', 'not.is.null')
    const j = await sbGet(p)
    return j[0] ? j[0].lead_date_iso : null
  }
  const [min, max] = await Promise.all([one('asc'), one('desc')])
  return { min, max }
}

// Newest synced_at stamp, shown as the page's "Synced" time while the toggle is on --
// so the header reports when the CACHE last ran, not when this tab happened to fetch.
// Best-effort: a failure here must not block the actual data.
export async function fetchOverallBqSyncedAt() {
  try {
    const p = new URLSearchParams({ select: 'synced_at', order: 'synced_at.desc', limit: '1' })
    const j = await sbGet(p)
    return j[0] && j[0].synced_at ? new Date(j[0].synced_at) : null
  } catch (_) { return null }
}
