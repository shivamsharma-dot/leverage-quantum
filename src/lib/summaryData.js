// src/lib/summaryData.js
// Powers the Summary page's live analysis (Meta Ads / QL Ops / MTD CPL+CPQL).
// Fetches once per session via the shared in-memory cache (lib/sessionLoad.js) --
// prefetched right after login (see App.jsx) so the Summary page renders instantly
// with no repeat network calls on every visit. A manual Refresh forces a re-fetch.

import { getSession, setSession, hasLoaded } from './sessionLoad'
import { resolveSheetUrl } from './dataSources'

const SUPABASE_URL = 'https://tsyekthwthxszmsgqfej.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzeWVrdGh3dGh4c3ptc2dxZmVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NjkzMDIsImV4cCI6MjA5NTM0NTMwMn0.bdM9h5c3PDu9hgggjBdbA-eb7kfF-79c6txOnCUxRhY'
const AD_ACCOUNT = 'act_641914389215638'
const QLOPS_DAILY_DEFAULT = 'https://docs.google.com/spreadsheets/d/1r-e6pBCN5ysfeD3Eq6sxgLmf97mdeTtloMPylqnx6Ew/gviz/tq?tqx=out:csv&sheet=Qlops'

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
    const tk = await fetch(SUPABASE_URL + '/rest/v1/meta_tokens?select=token&order=created_at.desc&limit=1', {
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }
    }).then(r => (r.ok ? r.json() : []))
    const token = tk && tk[0] && tk[0].token
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

function buildSeries(metaDaily, qlDaily) {
  const days = {}
  const ensure = (k) => (days[k] = days[k] || { date: k, spend: 0, clicks: 0, impressions: 0, metaLeads: 0, ql: 0, futwork: 0, superbot: 0 })
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
  const dayRows = Object.keys(days).sort().map((k) => days[k])

  const months = {}
  dayRows.forEach((r) => {
    const mk = r.date.slice(0, 7)
    months[mk] = months[mk] || { month: mk, spend: 0, clicks: 0, impressions: 0, metaLeads: 0, ql: 0, futwork: 0, superbot: 0 }
    const m = months[mk]
    m.spend += r.spend
    m.clicks += r.clicks
    m.impressions += r.impressions
    m.metaLeads += r.metaLeads
    m.ql += r.ql
    m.futwork += r.futwork
    m.superbot += r.superbot
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
    const results = await Promise.all([fetchMetaDaily(), fetchQlopsDaily()])
    const built = buildSeries(results[0], results[1])
    const result = { dayRows: built.dayRows, monthRows: built.monthRows, ts: new Date() }
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
