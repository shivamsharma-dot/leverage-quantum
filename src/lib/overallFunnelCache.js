// src/lib/overallFunnelCache.js
// Client-side reader for the overall_funnel_daily Supabase cache (Phase 0 of the
// agent-upgrade roadmap -- see api/ask-ai.mjs / .github/workflows/overall-funnel-sync.yml).
// Same anon-key REST pattern used everywhere else in this app (report_logs, source_health,
// ask_ai_usage, etc) -- RLS is disabled on this table, matching every other non-credential
// table.
//
// IMPORTANT: Supabase's hosted PostgREST caps every response at 1000 rows server-side
// regardless of any client `limit` -- see api/ask-ai.mjs's fetchOverallCampaignTotalsFromCache
// for the exact bug this caused in production (a 7-day window silently truncated to an
// arbitrary first-1000-row slice, producing a wrong Total QL figure with the WRONG SIGN).
// Every reader here paginates with the Range header until a page comes back short, and
// ALWAYS sorts by a stable key -- pagination without an explicit order is a second,
// independent bug (page boundaries aren't guaranteed stable across requests otherwise).

const SB_URL = 'https://tsyekthwthxszmsgqfej.supabase.co'
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzeWVrdGh3dGh4c3ptc2dxZmVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NjkzMDIsImV4cCI6MjA5NTM0NTMwMn0.bdM9h5c3PDu9hgggjBdbA-eb7kfF-79c6txOnCUxRhY'

// NOTE (2026-09-10): the sheet's own 'source' label for organic traffic was renamed
// from 'Content+Brand' to 'Organic' at some point before 2026-08-01 (confirmed live:
// 'Content+Brand' rows exist for every date from 2026-01-01 through 2026-07-29 and
// NONE after; 'Organic' rows exist from 2026-01-01 onward). This was NOT a clean
// chronological handoff -- a live query confirmed every (campaign, date) that has a
// 'Content+Brand' row ALSO has a same-leads 'Organic' row for the identical date
// (the sheet's historical rows were re-labeled and re-synced wholesale, and the old
// 'Content+Brand' rows were never pruned since this sync has no stale-row deletion
// step). Mapping BOTH labels to 'Organic' would therefore double-count every lead in
// that Jan-Jul'26 window. Only 'Organic' is mapped going forward; the old
// 'Content+Brand' rows fall through to 'Other' (harmless duplication, not double
// counted as Organic) rather than being aliased.
const CHANNEL_LABELS = {
  Facebook: 'Meta Ads',
  Google: 'Google Ads',
  Remarketing: 'Remarketing',
  Affiliate: 'Affiliate',
  Organic: 'Organic',
}
export function mapChannel(source) { return CHANNEL_LABELS[(source || '').trim()] || 'Other' }
export const CHANNELS = ['Meta Ads', 'Google Ads', 'Remarketing', 'Affiliate', 'Organic', 'Other']

async function fetchAllPaginated(params) {
  const PAGE = 1000
  let offset = 0
  let allRows = []
  for (let guard = 0; guard < 200; guard++) { // 200k row safety valve
    const r = await fetch(`${SB_URL}/rest/v1/overall_funnel_daily?${params.toString()}`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Range: `${offset}-${offset + PAGE - 1}` },
    })
    if (!r.ok) throw new Error(`overall_funnel_daily fetch failed (${r.status})`)
    const page = await r.json()
    if (!Array.isArray(page)) throw new Error('overall_funnel_daily returned a non-array response')
    allRows = allRows.concat(page)
    if (page.length < PAGE) break
    offset += PAGE
  }
  return allRows
}

// Returns [{ date, leads, queued, total_ql, spend, apps, offers, deposits, raus }], one row
// per date, summed across every campaign/channel in range (since, until inclusive).
export async function fetchDailyTotals({ since, until }) {
  const params = new URLSearchParams({
    select: 'date,leads,queued,total_ql,spend,apps,offers,deposits,raus',
    order: 'date.asc,campaign.asc',
  })
  if (since) params.set('date', `gte.${since}`)
  if (until) params.append('date', `lte.${until}`)
  const rows = await fetchAllPaginated(params)
  const byDate = {}
  for (const row of rows) {
    const d = row.date
    const e = byDate[d] || { date: d, leads: 0, queued: 0, total_ql: 0, spend: 0, apps: 0, offers: 0, deposits: 0, raus: 0 }
    e.leads += Number(row.leads) || 0
    e.queued += Number(row.queued) || 0
    e.total_ql += Number(row.total_ql) || 0
    e.spend += Number(row.spend) || 0
    e.apps += Number(row.apps) || 0
    e.offers += Number(row.offers) || 0
    e.deposits += Number(row.deposits) || 0
    e.raus += Number(row.raus) || 0
    byDate[d] = e
  }
  return Object.values(byDate).sort((a, b) => a.date < b.date ? -1 : 1)
}

// Returns the same shape as fetchDailyTotals, but scoped to one channel (or 'All').
export async function fetchDailyTotalsByChannel({ since, until, channel }) {
  const params = new URLSearchParams({
    select: 'date,source,leads,queued,total_ql,spend,apps,offers,deposits,raus',
    order: 'date.asc,campaign.asc',
  })
  if (since) params.set('date', `gte.${since}`)
  if (until) params.append('date', `lte.${until}`)
  const rows = await fetchAllPaginated(params)
  const byDate = {}
  for (const row of rows) {
    if (channel && channel !== 'All' && mapChannel(row.source) !== channel) continue
    const d = row.date
    const e = byDate[d] || { date: d, leads: 0, queued: 0, total_ql: 0, spend: 0, apps: 0, offers: 0, deposits: 0, raus: 0 }
    e.leads += Number(row.leads) || 0
    e.queued += Number(row.queued) || 0
    e.total_ql += Number(row.total_ql) || 0
    e.spend += Number(row.spend) || 0
    e.apps += Number(row.apps) || 0
    e.offers += Number(row.offers) || 0
    e.deposits += Number(row.deposits) || 0
    e.raus += Number(row.raus) || 0
    byDate[d] = e
  }
  return Object.values(byDate).sort((a, b) => a.date < b.date ? -1 : 1)
}
