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

// The 16 columns of the saved query, named EXACTLY as BigQuery returns them -- spaces
// and capitals included, because the sync keeps them byte-identical. That is the
// whole point: OverallDashboard's existing mapRow() reads these same header names off
// the CSV, so a row from here drops into it unchanged. No mapping layer means no way
// for the two paths to disagree about what a column means.
const BQ_COLUMNS = [
  'lead_date', 'month', 'Source', 'campaign_name',
  'Total Leads Generated', 'floor_queued', 'Queued on Futwork', 'Queued on Superbot',
  'Futwork Human QL', 'Futwork AI QL', 'Superbot AI QL',
  'Total_Spends', 'Total Apps', 'Total Offers', 'Total Deposits', 'Total RAUs',
]
// PostgREST needs double quotes around any column name that is not plain lowercase.
const SELECT = BQ_COLUMNS.map(c => (/^[a-z_]+$/.test(c) ? c : '"' + c + '"')).join(',')

const headers = extra => Object.assign({ apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY }, extra || {})

async function sbGet(params, extraHeaders) {
  const r = await fetch(SB_URL + '/rest/v1/' + TABLE + '?' + params.toString(), { headers: headers(extraHeaders) })
  if (!r.ok) throw new Error('overall_bq_daily read failed (' + r.status + ')')
  const j = await r.json()
  if (!Array.isArray(j)) throw new Error('overall_bq_daily returned a non-array response')
  return j
}

// One page is 1000 rows and that is not negotiable, so a July-sized window (40,284
// rows) is 41 requests. Fetched strictly one after another that measured 22.6s in the
// browser -- slower than the CSV path this is supposed to replace. So the first page
// asks for 'Prefer: count=exact', which makes PostgREST return the real total in the
// Content-Range header ('0-999/40284'), and the remaining pages are then fetched in
// parallel batches. The same window measured 5.0s that way.
//
// Ordering stays deterministic: every page carries its own explicit offset against the
// same 'order=row_key.asc', and the pages are reassembled by offset -- never by the
// order the responses happen to come back in.
const PAGE = 1000
const CONCURRENCY = 8

async function sbGetPage(params, offset, wantCount) {
  const h = { Range: offset + '-' + (offset + PAGE - 1) }
  if (wantCount) h.Prefer = 'count=exact'
  const r = await fetch(SB_URL + '/rest/v1/' + TABLE + '?' + params.toString(), { headers: headers(h) })
  if (!r.ok) throw new Error('overall_bq_daily read failed (' + r.status + ')')
  const rows = await r.json()
  if (!Array.isArray(rows)) throw new Error('overall_bq_daily returned a non-array response')
  const total = Number(String(r.headers.get('content-range') || '').split('/')[1])
  return { rows: rows, total: Number.isFinite(total) ? total : null }
}

async function fetchAllPaginated(params) {
  const first = await sbGetPage(params, 0, true)
  if (first.rows.length < PAGE) return first.rows

  const offsets = []
  if (first.total != null) { for (let o = PAGE; o < first.total; o += PAGE) offsets.push(o) }
  const pages = new Array(offsets.length)
  for (let i = 0; i < offsets.length; i += CONCURRENCY) {
    const batch = await Promise.all(offsets.slice(i, i + CONCURRENCY).map(o => sbGetPage(params, o, false)))
    batch.forEach((b, k) => { pages[i + k] = b.rows })
  }
  let all = first.rows
  for (const p of pages) all = all.concat(p || [])

  // Belt and braces: if the count header were ever missing we would have no offsets to
  // parallelise over, so walk sequentially from wherever we got to. A short read must
  // never pass silently -- that is exactly the class of bug that produced a wrong
  // Total QL figure off overall_funnel_daily.
  if (first.total == null) {
    let offset = all.length
    for (let guard = 0; guard < 400; guard++) { // 4,00,000-row safety valve
      const page = await sbGetPage(params, offset, false)
      all = all.concat(page.rows)
      if (page.rows.length < PAGE) break
      offset += PAGE
    }
  }
  return all
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
