// src/lib/leverageCareersCache.js
// Client-side reader for the public.leverage_careers_daily Supabase cache.
//
// Written by : .github/workflows/leverage-careers-sync.yml, which just POSTs a
//              GET to api/crm-leads.js's own careers_sync mode (that endpoint
//              owns the BigQuery query + the Supabase upsert + the prune step;
//              this file only ever reads what it wrote).
// Schema     : supabase/sql/leverage_careers_daily_setup.sql -- campaign,
//              lead_date, source, channel, total_leads, total_interested, won,
//              plus row_key / sync_id / synced_at.
// Read by    : src/pages/LeverageCareersDashboard.jsx's fetchGranular(), which
//              the main page, Trend Analysis and Compare all share -- so
//              wiring that one function to this reader fixes all three at once.
//
// WHY THIS EXISTS
// lsq_careers_opprtunities isn't partitioned in a way careersLeadsSql()'s WHERE
// clause can prune, so every live call -- whatever since/until window is asked
// for -- scans the whole table. The page's main fetch, Trend Analysis and
// Compare each computed their own window and called BigQuery live with no
// caching beyond BigQuery's own exact-string 24h cache, so ordinary
// interactive use (switching Trend's dimension, opening Compare, picking a
// custom range) multiplied full-table-scan cost by however many distinct
// windows got touched -- the documented cause of the Aug 2026 cost spikes
// (e.g. 22 Aug: 60 jobs / 387GB / ~Rs208 in one day). This cache is synced
// 3x/day (matching how often the underlying LeadSquared export actually
// refreshes) so ordinary page use costs nothing extra in BigQuery.
//
// Same keyset-pagination rules as src/lib/overallBqCache.js, carried over
// verbatim because both were real production bugs there first:
//   1. Supabase's hosted PostgREST caps every response at 1000 rows regardless
//      of 'limit', so a multi-row read pages with a keyset cursor.
//   2. Paging without an explicit ORDER BY is a second, independent bug --
//      every read here orders by row_key, the table's primary key.

const SB_URL = 'https://tsyekthwthxszmsgqfej.supabase.co'
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzeWVrdGh3dGh4c3ptc2dxZmVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NjkzMDIsImV4cCI6MjA5NTM0NTMwMn0.bdM9h5c3PDu9hgggjBdbA-eb7kfF-79c6txOnCUxRhY'
const TABLE = 'leverage_careers_daily'
const SELECT = 'campaign,lead_date,source,channel,total_leads,total_interested,won'

const headers = extra => Object.assign({ apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY }, extra || {})

async function sbGet(params, extraHeaders) {
  const r = await fetch(SB_URL + '/rest/v1/' + TABLE + '?' + params.toString(), { headers: headers(extraHeaders) })
  if (!r.ok) throw new Error(TABLE + ' read failed (' + r.status + ')')
  const j = await r.json()
  if (!Array.isArray(j)) throw new Error(TABLE + ' returned a non-array response')
  return j
}

const PAGE = 1000

async function sbGetPage(params, cursor) {
  const p = new URLSearchParams(params)
  if (cursor != null) p.set('row_key', 'gt.' + cursor)
  p.set('limit', String(PAGE))
  const r = await fetch(SB_URL + '/rest/v1/' + TABLE + '?' + p.toString(), { headers: headers() })
  if (!r.ok) throw new Error(TABLE + ' read failed (' + r.status + ')')
  const rows = await r.json()
  if (!Array.isArray(rows)) throw new Error(TABLE + ' returned a non-array response')
  return rows
}

async function sbGetPageRetry(params, cursor, attempts = 3, delay = 400) {
  let lastErr
  for (let i = 0; i < attempts; i++) {
    try { return await sbGetPage(params, cursor) }
    catch (e) { lastErr = e; if (i < attempts - 1) await new Promise(res => setTimeout(res, delay * (i + 1))) }
  }
  throw lastErr
}

async function fetchAllPaginated(params) {
  const p = new URLSearchParams(params)
  const sel = p.get('select') || ''
  if (!/(^|,)row_key(,|$)/.test(sel)) p.set('select', sel ? sel + ',row_key' : 'row_key')

  let all = []
  let cursor = null
  for (let guard = 0; guard < 2000; guard++) { // 20,00,000-row safety valve
    const rows = await sbGetPageRetry(p, cursor)
    if (!rows.length) break
    all = all.concat(rows)
    if (rows.length < PAGE) break
    cursor = rows[rows.length - 1].row_key
  }
  return all.map(r => { const { row_key, ...rest } = r; return rest })
}

// since/until are inclusive 'YYYY-MM-DD' strings, matched against the real
// DATE column. Returns rows shaped exactly like the live careers_leads
// BigQuery API's own rows -- { campaign, lead_date, source, channel,
// total_leads, total_interested, won } -- so fetchGranular() in
// LeverageCareersDashboard.jsx needs no change beyond where it gets them from.
export async function fetchCareersCacheRows({ since, until }) {
  if (!since || !until) throw new Error('fetchCareersCacheRows needs both since and until')
  const params = new URLSearchParams({ select: SELECT, order: 'row_key.asc' })
  params.set('lead_date', 'gte.' + since)
  params.append('lead_date', 'lte.' + until)
  return fetchAllPaginated(params)
}

// Newest synced_at stamp, so the page can show when the cache last ran rather
// than when this tab happened to fetch. Best-effort: a failure here must
// never block the actual data.
export async function fetchCareersCacheSyncedAt() {
  try {
    const p = new URLSearchParams({ select: 'synced_at', order: 'synced_at.desc', limit: '1' })
    const j = await sbGet(p)
    return j[0] && j[0].synced_at ? new Date(j[0].synced_at) : null
  } catch (_) { return null }
}
