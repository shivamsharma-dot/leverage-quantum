// src/lib/appsCache.js
// Client-side reader for the public.apps_feed Supabase cache.
//
// Written by : .github/workflows/apps-sync.yml, once a day (9am IST) -- it
//              just POSTs a GET to api/crm-leads.js's own apps_sync mode
//              (that endpoint owns the BigQuery query + the Supabase upsert
//              + the prune step; this file only ever reads what it wrote).
// Schema     : supabase/sql/apps_feed_setup.sql -- one row per application
//              (user_id_uuid, destination_country[_group/_original],
//              intake_category, intake_date, school_name, course_name,
//              first_app_submitted_at, first_app_month, first_app_date,
//              prospect_id, opportunity_id, source, vertical, country2,
//              futwork_human, futwork_ai, sub_source, opp_first_campaign_name),
//              plus row_key / sync_id / synced_at. first_app_submitted_at
//              (added with appv2, 2026-09-07) is a real 'YYYY-MM-DD' date --
//              the one to filter a date range on, rather than re-parsing
//              first_app_date's 'DD-Mon-YY' display string.
// Read by    : src/pages/AppsDashboard.jsx.
//
// No since/until on this table -- the underlying BigQuery query has none
// either (its own WHERE floor is fixed), and it's a full-snapshot cache
// wholesale-replaced by every sync run, not a date-bucketed additive one
// like overall_bq_daily/leverage_careers_daily. Same keyset-pagination rules
// as those two, carried over verbatim because both were real production
// bugs there first:
//   1. Supabase's hosted PostgREST caps every response at 1000 rows
//      regardless of 'limit', so a multi-row read pages with a keyset cursor.
//   2. Paging without an explicit ORDER BY is a second, independent bug --
//      every read here orders by row_key, the table's primary key.

const SB_URL = 'https://tsyekthwthxszmsgqfej.supabase.co'
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzeWVrdGh3dGh4c3ptc2dxZmVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NjkzMDIsImV4cCI6MjA5NTM0NTMwMn0.bdM9h5c3PDu9hgggjBdbA-eb7kfF-79c6txOnCUxRhY'
const TABLE = 'apps_feed'
const SELECT = 'user_id_uuid,destination_country,destination_country_group,destination_country_original,intake_category,intake_date,school_name,course_name,first_app_submitted_at,first_app_month,first_app_date,prospect_id,opportunity_id,source,vertical,country2,futwork_human,futwork_ai,sub_source,opp_first_campaign_name'

const headers = extra => Object.assign({ apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY }, extra || {})

// Both throws below include the response body, not just the status -- a
// PostgREST error for a column the migration hasn't added yet ('column
// apps_feed.first_app_submitted_at does not exist') only shows up in the
// body, and AppsDashboard.jsx's own error-message matching needs that exact
// text to tell "the table isn't set up at all" apart from "the table exists
// but is missing the newer appv2 columns" -- a bare '(400)' collapses both
// into the same unhelpful message.
async function sbGet(params, extraHeaders) {
  const r = await fetch(SB_URL + '/rest/v1/' + TABLE + '?' + params.toString(), { headers: headers(extraHeaders) })
  if (!r.ok) throw new Error(TABLE + ' read failed (' + r.status + '): ' + await r.text())
  const j = await r.json()
  if (!Array.isArray(j)) throw new Error(TABLE + ' returned a non-array response')
  return j
}

const PAGE = 1000

async function sbGetPage(cursor) {
  const p = new URLSearchParams({ select: SELECT + ',row_key', order: 'row_key.asc', limit: String(PAGE) })
  if (cursor != null) p.set('row_key', 'gt.' + cursor)
  const r = await fetch(SB_URL + '/rest/v1/' + TABLE + '?' + p.toString(), { headers: headers() })
  if (!r.ok) throw new Error(TABLE + ' read failed (' + r.status + '): ' + await r.text())
  const rows = await r.json()
  if (!Array.isArray(rows)) throw new Error(TABLE + ' returned a non-array response')
  return rows
}

async function sbGetPageRetry(cursor, attempts = 3, delay = 400) {
  let lastErr
  for (let i = 0; i < attempts; i++) {
    try { return await sbGetPage(cursor) }
    catch (e) { lastErr = e; if (i < attempts - 1) await new Promise(res => setTimeout(res, delay * (i + 1))) }
  }
  throw lastErr
}

// Fetches the WHOLE cache -- there's no date range to narrow by, this is a
// full snapshot refreshed once a day. Returns rows shaped exactly like the
// real BigQuery query's own output (camelCase-free, same keys as the SQL's
// column aliases lower-cased) so AppsDashboard.jsx reads them directly.
export async function fetchAppsCacheRows() {
  let all = []
  let cursor = null
  for (let guard = 0; guard < 2000; guard++) { // 20,00,000-row safety valve
    const rows = await sbGetPageRetry(cursor)
    if (!rows.length) break
    all = all.concat(rows)
    if (rows.length < PAGE) break
    cursor = rows[rows.length - 1].row_key
  }
  return all.map(r => { const { row_key, ...rest } = r; return rest })
}

// Newest synced_at stamp, so the page can show when the cache last ran
// rather than when this tab happened to fetch. Best-effort: a failure here
// must never block the actual data.
export async function fetchAppsCacheSyncedAt() {
  try {
    const p = new URLSearchParams({ select: 'synced_at', order: 'synced_at.desc', limit: '1' })
    const j = await sbGet(p)
    return j[0] && j[0].synced_at ? new Date(j[0].synced_at) : null
  } catch (_) { return null }
}

// A plain count of applications since a given 'YYYY-MM-DD' (first_app_submitted_at),
// e.g. for Overall's own MTD Scorecard Slack report (2026-09-10) -- that report only
// needs "how many applications this month," not the ~7,000+ full rows fetchAppsCacheRows
// pulls and pages through. One Prefer:count=exact request with limit=1 gets the total
// off the response's own Content-Range header without downloading a single row body.
export async function fetchAppsCountSince(sinceIso) {
  const p = new URLSearchParams({ select: 'row_key', first_app_submitted_at: 'gte.' + sinceIso, limit: '1' })
  const r = await fetch(SB_URL + '/rest/v1/' + TABLE + '?' + p.toString(), { headers: headers({ Prefer: 'count=exact' }) })
  if (!r.ok) throw new Error(TABLE + ' count failed (' + r.status + '): ' + await r.text())
  const range = r.headers.get('content-range') || ''
  const total = range.includes('/') ? parseInt(range.split('/')[1], 10) : NaN
  if (!Number.isFinite(total)) throw new Error(TABLE + ' count: unexpected content-range "' + range + '"')
  return total
}
