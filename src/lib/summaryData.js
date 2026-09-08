// src/lib/summaryData.js
// Powers the Summary page's live analysis (Meta Ads / QL Ops / MTD CPL+CPQL).
// Fetches once per session via the shared in-memory cache (lib/sessionLoad.js) --
// prefetched right after login (see App.jsx) so the Summary page renders instantly
// with no repeat network calls on every visit. A manual Refresh forces a re-fetch.

import { getSession, setSession, hasLoaded } from './sessionLoad'
import { resolveSheetUrl } from './dataSources'
import { fetchMonthlyQlsRows } from './monthlyQlsCache'

const AD_ACCOUNT = 'act_641914389215638'
const QLOPS_DAILY_DEFAULT = 'https://docs.google.com/spreadsheets/d/1r-e6pBCN5ysfeD3Eq6sxgLmf97mdeTtloMPylqnx6Ew/gviz/tq?tqx=out:csv&sheet=Qlops'
const GOOGLE_LEADS_DEFAULT = 'https://docs.google.com/spreadsheets/d/1r-e6pBCN5ysfeD3Eq6sxgLmf97mdeTtloMPylqnx6Ew/gviz/tq?tqx=out:csv&sheet=googleleads'
const GLEAD_MON = { Jan:'01', Feb:'02', Mar:'03', Apr:'04', May:'05', Jun:'06', Jul:'07', Aug:'08', Sep:'09', Oct:'10', Nov:'11', Dec:'12' }
function parseGoogleLeadDate(raw) {
  const m = String(raw || '').trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/)
  if (!m) return null
  const mo = GLEAD_MON[m[2]]
  if (!mo) return null
  return m[3] + '-' + mo + '-' + m[1].padStart(2, '0')
}
const MQ_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const periodKey = (p) => { const m = String(p || '').match(/([A-Za-z]{3})[a-z]*-(\d{4})/); return m ? (parseInt(m[2], 10) * 12 + MQ_MON.indexOf(m[1])) : 0 }

export const CACHE_KEY = 'summary_analysis'
let inflight = null

function parseCsvRow(line) {
  const cols = []
  let buf = ''
  let inQ = false
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ }
    else if (ch === ',' && !inQ) { cols.push(buf.trim()); buf = '' }
    else buf += ch
  }
  cols.push(buf.trim())
  return cols
}

function normalizeDate(raw) {
  if (!raw) return null
  const s = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) {
    const mo = m[1].padStart(2, '0')
    const da = m[2].padStart(2, '0')
    return m[3] + '-' + mo + '-' + da
  }
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}
async function fetchMetaDaily() {
  try {
    const tk = await fetch('/api/meta-token', { credentials: 'include' }).then(r => (r.ok ? r.json() : {}))
    const token = tk && tk.token
    if (!token) return []
    const until = new Date()
    const since = new Date()
    since.setDate(since.getDate() - 210)
    const fmt = (d) => d.toISOString().slice(0, 10)
    const timeRange = encodeURIComponent(JSON.stringify({ since: fmt(since), until: fmt(until) }))
    let url = 'https://graph.facebook.com/v19.0/' + AD_ACCOUNT + '/insights?fields=spend,impressions,clicks,ctr,actions&time_increment=1&time_range=' + timeRange + '&level=account&limit=100&access_token=' + token
    let all = []
    let pages = 0
    while (url && pages < 10) {
      const res = await fetch(url)
      if (!res.ok) break
      const json = await res.json()
      all = all.concat(json.data || [])
      url = json.paging && json.paging.next ? json.paging.next : null
      pages++
    }
    const findAct = (acc, t) => parseInt((acc.actions && acc.actions.find(a => a.action_type === t) || {}).value || 0, 10)
    return all.map((d) => {
      const leads = findAct(d, 'onsite_conversion.lead_grouped') || findAct(d, 'onsite_web_lead') || findAct(d, 'offsite_complete_registration_add_meta_leads') || findAct(d, 'lead') || 0
      return {
        date: d.date_start,
        spend: parseFloat(d.spend || 0),
        clicks: parseInt(d.clicks || 0, 10),
        impressions: parseInt(d.impressions || 0, 10),
        leads: leads
      }
    })
  } catch (e) {
    console.error('summaryData: meta fetch failed', e)
    return []
  }
}

async function fetchGoogleDaily() {
  try {
    const until = new Date()
    const since = new Date()
    since.setDate(since.getDate() - 210)
    const fmt = (d) => d.toISOString().slice(0, 10)
    const res = await fetch('/api/google-ads?tab=trend&mode=day&from=' + fmt(since) + '&to=' + fmt(until), { credentials: 'include' })
    if (!res.ok) return []
    const json = await res.json()
    if (json.error || json.notConnected) return []
    return (json.points || []).map((p) => ({
      date: p.period,
      spend: p.spend || 0,
      clicks: p.clicks || 0,
      impressions: p.impressions || 0,
      conversions: p.conversions || 0,
    }))
  } catch (e) {
    console.error('summaryData: google ads fetch failed', e)
    return []
  }
}

async function fetchGoogleLeadsDaily() {
  try {
    const url = await resolveSheetUrl('googleLeads', GOOGLE_LEADS_DEFAULT)
    const csv = await fetch(url).then(r => (r.ok ? r.text() : ''))
    if (!csv) return []
    const rows = csv.trim().split('\n').map(parseCsvRow)
    const [hdr, ...data] = rows
    const low = hdr.map((x) => x.toLowerCase().trim())
    const h = (k) => low.indexOf(k)
    const iDate = h('lead_created_date')
    const iLeads = h('leads')
    if (iDate === -1) return []
    return data
      .map((r) => ({ date: parseGoogleLeadDate(r[iDate]), leads: parseFloat(String(r[iLeads] || '1').replace(/[^0-9.-]/g, '')) || 1 }))
      .filter((r) => r.date)
  } catch (e) {
    console.error('summaryData: google leads fetch failed', e)
    return []
  }
}

async function fetchQlopsDaily() {
  try {
    const url = await resolveSheetUrl('qlopsDaily', QLOPS_DAILY_DEFAULT)
    const csv = await fetch(url).then(r => (r.ok ? r.text() : ''))
    if (!csv) return []
    const rows = csv.trim().split('\n').map(parseCsvRow)
    const hdr = rows[0]
    const data = rows.slice(1)
    const low = hdr.map((x) => x.toLowerCase().trim())
    const h = (k) => low.indexOf(k)
    const iDate = h('qualified_date')
    const iProvider = h('provider')
    if (iDate === -1) return []
    return data
      .map((r) => ({ date: normalizeDate(r[iDate]), provider: (r[iProvider] || '').toLowerCase().indexOf('fut') !== -1 ? 'futwork' : 'superbot' }))
      .filter((r) => r.date)
  } catch (e) {
    console.error('summaryData: qlops fetch failed', e)
    return []
  }
}

// Reads the same public.monthly_qls_daily Supabase cache LeadQualificationDashboard.jsx's
// Monthly QLs view reads (src/lib/monthlyQlsCache.js) -- no more Google Sheet CSV here.
// See CLAUDE.md, 2026-09-08, "do not depend on sheet now": that migration only covered
// the dashboard page itself; this is the Summary page's own independent consumer of the
// old QLSnapshot sheet, now moved onto the same pipeline.
async function fetchQlopsMonthly() {
  try {
    const rows = await fetchMonthlyQlsRows()
    return rows.map((r) => ({
      period: r.period,
      source: r.source,
      oppCount: r.opp_count,
      floorQueued: r.floor_queued,
      futworkQualified: r.futwork_qualified,
      superbotQualified: r.superbot_qualified,
      futworkAiQualified: r.futwork_ai_qualified,
    }))
  } catch (e) {
    console.error('summaryData: qlops monthly fetch failed', e)
    return []
  }
}

function buildMonthlyQlSeries(monthlyQl) {
  const periods = {}
  monthlyQl.forEach((r) => {
    const p = (periods[r.period] = periods[r.period] || { period: r.period, oppCount: 0, floorQueued: 0, totalQL: 0 })
    p.oppCount += r.oppCount
    p.floorQueued += r.floorQueued
    p.totalQL += r.futworkQualified + r.superbotQualified + r.futworkAiQualified
  })
  const periodRows = Object.values(periods).sort((a, b) => periodKey(a.period) - periodKey(b.period))
  const latestPeriod = periodRows.length ? periodRows[periodRows.length - 1].period : null
  const bySource = {}
  monthlyQl.filter((r) => r.period === latestPeriod).forEach((r) => {
    const s = (bySource[r.source || 'Unknown'] = bySource[r.source || 'Unknown'] || { source: r.source || 'Unknown', totalQL: 0 })
    s.totalQL += r.futworkQualified + r.superbotQualified + r.futworkAiQualified
  })
  const bySourceRows = Object.values(bySource).sort((a, b) => b.totalQL - a.totalQL).slice(0, 6)
  return { periodRows, bySourceRows }
}

function buildSeries(metaDaily, qlDaily, googleDaily, googleLeadsDaily) {
  const days = {}
  const ensure = (k) => (days[k] = days[k] || { date: k, spend: 0, clicks: 0, impressions: 0, metaLeads: 0, ql: 0, futwork: 0, superbot: 0, googleSpend: 0, googleClicks: 0, googleImpressions: 0, googleConversions: 0, googleLeads: 0 })
  metaDaily.forEach((d) => {
    const row = ensure(d.date)
    row.spend += d.spend
    row.clicks += d.clicks
    row.impressions += d.impressions
    row.metaLeads += d.leads
  })
  qlDaily.forEach((r) => {
    const row = ensure(r.date)
    row.ql += 1
    row[r.provider] += 1
  })
  googleDaily.forEach((d) => {
    const row = ensure(d.date)
    row.googleSpend += d.spend
    row.googleClicks += d.clicks
    row.googleImpressions += d.impressions
    row.googleConversions += d.conversions
  })
  googleLeadsDaily.forEach((r) => {
    const row = ensure(r.date)
    row.googleLeads += r.leads
  })
  const dayRows = Object.keys(days).sort().map((k) => days[k])

  const months = {}
  dayRows.forEach((r) => {
    const mk = r.date.slice(0, 7)
    months[mk] = months[mk] || { month: mk, spend: 0, clicks: 0, impressions: 0, metaLeads: 0, ql: 0, futwork: 0, superbot: 0, googleSpend: 0, googleClicks: 0, googleImpressions: 0, googleConversions: 0, googleLeads: 0 }
    const m = months[mk]
    m.spend += r.spend
    m.clicks += r.clicks
    m.impressions += r.impressions
    m.metaLeads += r.metaLeads
    m.ql += r.ql
    m.futwork += r.futwork
    m.superbot += r.superbot
    m.googleSpend += r.googleSpend
    m.googleClicks += r.googleClicks
    m.googleImpressions += r.googleImpressions
    m.googleConversions += r.googleConversions
    m.googleLeads += r.googleLeads
  })
  const monthRows = Object.keys(months).sort().map((k) => months[k])
  return { dayRows: dayRows, monthRows: monthRows }
}

export async function loadSummaryAnalysis(bust) {
  bust = !!bust
  if (!bust) {
    const cached = getSession(CACHE_KEY)
    if (cached) return cached.data
    if (inflight) return inflight
  }
  inflight = (async () => {
    const results = await Promise.all([fetchMetaDaily(), fetchQlopsDaily(), fetchQlopsMonthly(), fetchGoogleDaily(), fetchGoogleLeadsDaily()])
    const built = buildSeries(results[0], results[1], results[3], results[4])
    const monthlyQl = buildMonthlyQlSeries(results[2])
    const result = { dayRows: built.dayRows, monthRows: built.monthRows, monthlyQlPeriods: monthlyQl.periodRows, monthlyQlBySource: monthlyQl.bySourceRows, ts: new Date() }
    setSession(CACHE_KEY, result)
    inflight = null
    return result
  })()
  return inflight
}

// Fire-and-forget warmup -- safe to call from anywhere, anytime; only fetches once per session.
export function prefetchSummaryAnalysis() {
  if (hasLoaded(CACHE_KEY) || inflight) return
  loadSummaryAnalysis().catch(() => {})
}
