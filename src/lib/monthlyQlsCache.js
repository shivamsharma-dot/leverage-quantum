// src/lib/monthlyQlsCache.js
// Client-side reader for the public.monthly_qls_daily Supabase cache.
//
// Written by : .github/workflows/monthly-qls-sync.yml -- that workflow owns
//              the BigQuery query ("Monthly QLs (with Vertical SR/AC)" in
//              Settings > Data > BigQuery Console) + the Supabase upsert + the
//              prune step; this file only ever reads what it wrote.
// Schema     : supabase/sql/monthly_qls_daily_setup.sql -- period, lead_date
//              (display string), lead_date_iso (real DATE), source, plus the
//              14 count fields (opp_count ... futwork_ai_qualified_ac), plus
//              row_key / sync_id / synced_at.
// Read by    : src/pages/LeadQualificationDashboard.jsx's Monthly QLs view,
//              replacing the previous fetch of a published Google Sheet CSV
//              (see CLAUDE.md, 2026-09-08, "do not depend on sheet now").
//
// DELIBERATE DESIGN CHOICE: every existing Monthly QLs filter (period, source,
// the Days/custom-range window) already runs entirely client-side over the
// FULL row set -- there was never a server-side since/until fetch to begin
// with. Rather than rewire all of that (monthlyFiltered / monthlyByDate /
// monthlyByPeriodScoped / the period dropdown, etc.), fetchMonthlyQlsRows()
// just returns every row, shaped EXACTLY like parseMonthlyCSV's old CSV-parsed
// output (same field names, same 'date' key, sub_source still present as a
// harmless empty string for backward compatibility) -- a drop-in replacement
// for the one call site that used to build monthlyRows from CSV text.
//
// Same keyset-pagination rules as overallBqCache.js / leverageCareersCache.js,
// carried over verbatim because both were real production bugs there first:
//   1. Supabase's hosted PostgREST caps every response at 1000 rows regardless
//      of 'limit', so a multi-row read pages with a keyset cursor.
//   2. Paging without an explicit ORDER BY is a second, independent bug --
//      every read here orders by row_key, the table's primary key.

const SB_URL = 'https://tsyekthwthxszmsgqfej.supabase.co'
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzeWVrdGh3dGh4c3ptc2dxZmVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NjkzMDIsImV4cCI6MjA5NTM0NTMwMn0.bdM9h5c3PDu9hgggjBdbA-eb7kfF-79c6txOnCUxRhY'
const TABLE = 'monthly_qls_daily'
const SELECT = [
  'period', 'lead_date', 'source',
  'opp_count', 'floor_queued', 'futwork_queued', 'superbot_queued', 'futwork_ai_queued',
  'futwork_qualified', 'futwork_qualified_sr', 'futwork_qualified_ac',
  'superbot_qualified',
  'futwork_ai_qualified', 'futwork_ai_qualified_sr', 'futwork_ai_qualified_ac',
].join(',')

const headers = extra => Object.assign({ apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY }, extra || {})

async function sbGet(params, extraHeaders) {
  const r = await fetch(SB_URL + '/rest/v1/' + TABLE + '?' + params.toString(), { headers: headers(extraHeaders) })
  if (!r.ok) throw new Error(TABLE + ' read failed (' + r.status + ') ' + (await r.text().catch(() => '')))
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
  if (!r.ok) throw new Error(TABLE + ' read failed (' + r.status + ') ' + (await r.text().catch(() => '')))
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

// Returns every row, shaped exactly like the old parseMonthlyCSV()'s output --
// { period, date, source, sub_source, opp_count, floor_queued, futwork_queued,
// superbot_queued, futwork_ai_queued, futwork_qualified, futwork_qualified_sr,
// futwork_qualified_ac, superbot_qualified, futwork_ai_qualified,
// futwork_ai_qualified_sr, futwork_ai_qualified_ac } -- so the one call site
// that used to build monthlyRows from CSV text needs no other change.
export async function fetchMonthlyQlsRows() {
  const params = new URLSearchParams({ select: SELECT, order: 'row_key.asc' })
  const rows = await fetchAllPaginated(params)
  return rows.map(r => ({
    period: r.period || '',
    date: r.lead_date || '',
    source: r.source || '',
    sub_source: '',
    opp_count: Number(r.opp_count) || 0,
    floor_queued: Number(r.floor_queued) || 0,
    futwork_queued: Number(r.futwork_queued) || 0,
    superbot_queued: Number(r.superbot_queued) || 0,
    futwork_ai_queued: Number(r.futwork_ai_queued) || 0,
    futwork_qualified: Number(r.futwork_qualified) || 0,
    futwork_qualified_sr: Number(r.futwork_qualified_sr) || 0,
    futwork_qualified_ac: Number(r.futwork_qualified_ac) || 0,
    superbot_qualified: Number(r.superbot_qualified) || 0,
    futwork_ai_qualified: Number(r.futwork_ai_qualified) || 0,
    futwork_ai_qualified_sr: Number(r.futwork_ai_qualified_sr) || 0,
    futwork_ai_qualified_ac: Number(r.futwork_ai_qualified_ac) || 0,
  }))
}

// Same shape as fetchMonthlyQlsRows() above, but scoped to a lead_date_iso range --
// for a caller that only needs a recent window (e.g. Overall's own MTD Scorecard
// Slack report, 2026-09-10) rather than the whole growing table (1000+ rows and
// climbing, unlike this table's own page which genuinely needs full history for its
// Month dropdown).
export async function fetchMonthlyQlsRowsSince(sinceIso, untilIso) {
  const params = new URLSearchParams({ select: SELECT, order: 'row_key.asc' })
  params.set('lead_date_iso', 'gte.' + sinceIso)
  params.append('lead_date_iso', 'lte.' + untilIso)
  const rows = await fetchAllPaginated(params)
  return rows.map(r => ({
    period: r.period || '',
    date: r.lead_date || '',
    source: r.source || '',
    futwork_qualified_sr: Number(r.futwork_qualified_sr) || 0,
    futwork_qualified_ac: Number(r.futwork_qualified_ac) || 0,
    superbot_qualified: Number(r.superbot_qualified) || 0,
    futwork_ai_qualified_sr: Number(r.futwork_ai_qualified_sr) || 0,
    futwork_ai_qualified_ac: Number(r.futwork_ai_qualified_ac) || 0,
  }))
}

// Newest synced_at stamp, so the page can show when the cache last ran rather
// than when this tab happened to fetch. Best-effort: a failure here must
// never block the actual data.
export async function fetchMonthlyQlsSyncedAt() {
  try {
    const p = new URLSearchParams({ select: 'synced_at', order: 'synced_at.desc', limit: '1' })
    const j = await sbGet(p)
    return j[0] && j[0].synced_at ? new Date(j[0].synced_at) : null
  } catch (_) { return null }
}
