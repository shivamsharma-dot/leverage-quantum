import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList,
  CartesianGrid, LineChart, Line, Legend,
} from 'recharts'
import Sidebar from '../components/Sidebar'
import Button from '../components/Button'
import ExportButton from '../components/ExportButton'
import DateRangePicker from '../components/DateRangePicker'
import Dropdown from '../components/Dropdown'
import { InlineLoader } from '../components/SkeletonLoader'
import { toast } from '../components/ToastHost'
import { C, FONT, fmtN, pct, Card, PremKPI, KPI_ICONS, BarGrad, barFill, BAR_RADIUS_H } from '../ui/dashboardKit'
import styles from './LeverageCareersDashboard.module.css'

// Separate ad account -- "Leverage Careers" -- distinct from the main Meta Ads
// page's act_641914389215638. Same shared Meta user token (meta_tokens table)
// grants access to both accounts, so no separate Connect flow is needed here:
// if the main Meta Ads page has ever been connected, this page just works.
const AD_ACCOUNT_ID = 'act_1321251219606731'

// ---- Pure calendar-date arithmetic on 'YYYY-MM-DD' strings (Date.UTC keeps
// this immune to local-timezone/DST shifts) -- same pattern as CeoB2CDashboard.
function ist(off) { return new Date(Date.now() + (off || 0) * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) }
function shiftDate(iso, days) {
  const p = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(p[0], p[1] - 1, p[2]))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}
function isoToDate(iso) { if (!iso) return null; const p = iso.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]) }
function addMonthsIso(iso, n) {
  const p = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(p[0], p[1] - 1 + n, p[2]))
  return dt.toISOString().slice(0, 10)
}
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthKeyOf = iso => iso.slice(0, 7)
const monthLabelOf = key => { const [y, m] = key.split('-'); return MN[Number(m) - 1] + "'" + y.slice(2) }
const dayLabelOf = iso => { const [, m, d] = iso.split('-'); return Number(d) + ' ' + MN[Number(m) - 1] }
function isoWeekStart(iso) {
  const p = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(p[0], p[1] - 1, p[2]))
  const dow = (dt.getUTCDay() + 6) % 7 // Monday = 0
  dt.setUTCDate(dt.getUTCDate() - dow)
  return dt.toISOString().slice(0, 10)
}

// ---- Meta Graph fetch helpers (small, self-contained duplicate of
// MetaAdsDashboard.jsx's own -- every other Ads page in this app keeps its
// own copy rather than sharing one giant file). ----
async function loadTokenFromSupabase() {
  try {
    const res = await fetch('/api/meta-token', { credentials: 'include' })
    if (!res.ok) return null
    const data = await res.json()
    return data && data.token ? data.token : null
  } catch { return null }
}
async function graphGet(path, token, params = {}, retries = 3) {
  const qs = new URLSearchParams({ access_token: token, ...params }).toString()
  const res = await fetch(`https://graph.facebook.com/v19.0/${path}?${qs}`)
  const d = await res.json()
  if (d.error) {
    const msg = d.error.message || ''
    const rateLimited = [1, 4, 17, 32, 613].includes(d.error.code) || /reduce|too large|too many/.test(msg)
    if (retries > 0 && rateLimited) {
      await new Promise(r => setTimeout(r, 1200 + Math.random() * 700))
      return graphGet(path, token, params, retries - 1)
    }
    throw new Error(msg)
  }
  return d
}
async function graphGetAll(path, token, params = {}, maxPages = 40) {
  let all = []
  const first = await graphGet(path, token, { ...params, limit: 500 })
  all = first.data || []
  let next = first.paging && first.paging.next
  let page = 0
  while (next && page < maxPages) {
    page++
    try {
      const r = await fetch(next)
      const d = await r.json()
      if (d.error) break
      all = all.concat(d.data || [])
      next = d.paging && d.paging.next
    } catch { break }
  }
  return all
}
function metaLeadsFromActions(actions) {
  if (!Array.isArray(actions)) return 0
  const hit = actions.find(a => a.action_type === 'onsite_conversion.lead_grouped') || actions.find(a => a.action_type === 'lead')
  return hit ? Number(hit.value) || 0 : 0
}
// Ad name <-> BigQuery career_campaign_name join key -- exact match, case/whitespace
// insensitive. Same normalization the rest of the app applies for name-based joins.
const normName = s => String(s || '').trim().toLowerCase()

const PRESETS = [
  { id: 'ld', label: 'Last Day' },
  { id: 'l7d', label: 'Last 7D' },
  { id: 'mtd', label: 'MTD' },
]

// Granular fetch: one row per (date, campaign-name), for any window -- shared by
// the main page, Trend Analysis, and Compare, so all three can never disagree
// about what a number means. Meta's own day-level insights (time_increment=1)
// give the (date, ad) side; BigQuery's careers_leads mode (now grouped by
// day+campaign, see api/crm-leads.js) gives the (date, campaign) side. Joined
// by exact normalized name, same convention as every other name-based join in
// this app -- a row is "matched" only where BOTH sides have real data for that
// exact day, never a whole-window match bleeding across days.
async function fetchGranular(token, since, until) {
  const timeRange = JSON.stringify({ since, until })
  const [metaDaily, bq] = await Promise.all([
    graphGetAll(`${AD_ACCOUNT_ID}/insights`, token, {
      level: 'ad', time_increment: 1, time_range: timeRange,
      fields: 'ad_id,ad_name,date_start,spend,impressions,clicks,actions',
    }),
    fetch(`/api/crm-leads?source=bigquery&mode=careers_leads&since=${since}&until=${until}`, { credentials: 'include' }).then(r => r.json()),
  ])
  if (bq && bq.error) throw new Error(bq.error)
  const map = new Map()
  const cell = (date, key, name) => {
    const k = date + '|' + key
    let row = map.get(k)
    if (!row) { row = { date, name: name || key, spend: 0, impressions: 0, clicks: 0, metaLeads: 0, crmLeads: 0, interested: 0, won: 0, hasMeta: false, hasCrm: false }; map.set(k, row) }
    return row
  }
  ;(metaDaily || []).forEach(a => {
    if (!a.date_start) return
    const row = cell(a.date_start, normName(a.ad_name), a.ad_name)
    row.spend += Number(a.spend) || 0
    row.impressions += Number(a.impressions) || 0
    row.clicks += Number(a.clicks) || 0
    row.metaLeads += metaLeadsFromActions(a.actions)
    row.hasMeta = true
  })
  ;((bq && bq.rows) || []).forEach(r => {
    if (!r.lead_date) return
    const row = cell(r.lead_date, normName(r.campaign), r.campaign)
    row.crmLeads += Number(r.total_leads) || 0
    row.interested += Number(r.total_interested) || 0
    row.won += Number(r.won) || 0
    row.hasCrm = true
  })
  return Array.from(map.values())
}

// Aggregate granular rows into one of three shapes -- Campaign (one row per ad
// name, spend-first), Month (one row per calendar month), Day (one row per
// date) -- mirroring the Overall dashboard's own Source/Campaign/Month/Day
// grouping-tab pattern. Every derived ratio is re-computed from the summed
// totals here, never averaged across rows, so a TOTAL line built the same way
// always reconciles exactly.
function groupRows(rows, dim) {
  const map = new Map()
  ;(rows || []).forEach(r => {
    const key = dim === 'campaign' ? r.name : dim === 'day' ? r.date : monthKeyOf(r.date)
    const label = dim === 'campaign' ? r.name : dim === 'day' ? r.date : monthKeyOf(r.date)
    let g = map.get(key)
    if (!g) { g = { key, label, spend: 0, impressions: 0, clicks: 0, metaLeads: 0, crmLeads: 0, interested: 0, won: 0, hasMeta: false, hasCrm: false }; map.set(key, g) }
    g.spend += r.spend; g.impressions += r.impressions; g.clicks += r.clicks
    g.metaLeads += r.metaLeads; g.crmLeads += r.crmLeads; g.interested += r.interested; g.won += r.won
    g.hasMeta = g.hasMeta || r.hasMeta; g.hasCrm = g.hasCrm || r.hasCrm
  })
  return Array.from(map.values()).map(g => ({
    ...g,
    matched: g.hasMeta && g.hasCrm,
    cpl: g.metaLeads > 0 ? g.spend / g.metaLeads : null,
    cplCrm: g.crmLeads > 0 ? g.spend / g.crmLeads : null,
    cpi: g.interested > 0 ? g.spend / g.interested : null,
    cps: g.won > 0 ? g.spend / g.won : null,
  }))
}
function sortGroup(dim, arr) {
  if (dim === 'day' || dim === 'month') return [...arr].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  return [...arr].sort((a, b) => b.spend - a.spend)
}
function sumTotals(rows) {
  const spend = rows.reduce((s, r) => s + r.spend, 0)
  const impressions = rows.reduce((s, r) => s + r.impressions, 0)
  const clicks = rows.reduce((s, r) => s + r.clicks, 0)
  const metaLeads = rows.reduce((s, r) => s + r.metaLeads, 0)
  const crmLeads = rows.reduce((s, r) => s + r.crmLeads, 0)
  const interested = rows.reduce((s, r) => s + r.interested, 0)
  const won = rows.reduce((s, r) => s + r.won, 0)
  return {
    spend, impressions, clicks, metaLeads, crmLeads, interested, won,
    cpl: metaLeads > 0 ? spend / metaLeads : null,
    cplCrm: crmLeads > 0 ? spend / crmLeads : null,
    cpi: interested > 0 ? spend / interested : null,
    cps: won > 0 ? spend / won : null,
  }
}
const fmtINR = n => n == null ? '—' : '₹' + Math.round(n).toLocaleString('en-IN')
const deltaPct = (cur, prev) => (prev == null || prev === 0) ? (cur > 0 ? 100 : null) : ((cur - prev) / prev) * 100

function BrandTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null
  return (
    <div style={{ background: '#fff', border: '0.5px solid #E5E7EB', borderRadius: 10, padding: '9px 13px', fontFamily: FONT, boxShadow: '0 8px 24px rgba(15,23,42,0.12)' }}>
      <div style={{ fontSize: 11.5, fontWeight: 800, color: '#0F1B33', marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ fontSize: 11.5, color: '#475569', display: 'flex', justifyContent: 'space-between', gap: 18 }}>
          <span style={{ color: p.color || p.fill }}>{p.name}</span>
          <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtN(p.value)}</span>
        </div>
      ))}
    </div>
  )
}
const sectionTitle = (t, s) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ fontSize: 14, fontWeight: 800, color: C.text, letterSpacing: '-0.2px' }}>{t}</div>
    {s && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{s}</div>}
  </div>
)
const axis = { fontSize: 11, fill: C.muted, fontFamily: FONT }

const TABLE_TABS = [['campaign', 'Campaign'], ['month', 'Month'], ['day', 'Day']]
const METRICS = [
  { key: 'spend', label: 'Spend', fmt: fmtINR },
  { key: 'metaLeads', label: 'Meta Leads', fmt: fmtN },
  { key: 'crmLeads', label: 'CRM Leads', fmt: fmtN },
  { key: 'interested', label: 'Interested', fmt: fmtN },
  { key: 'won', label: 'Won', fmt: fmtN },
  { key: 'cpl', label: 'CPL (Meta)', fmt: fmtINR },
  { key: 'cplCrm', label: 'CPL (CRM)', fmt: fmtINR },
  { key: 'cpi', label: 'CPI', fmt: fmtINR },
  { key: 'cps', label: 'CPS', fmt: fmtINR },
]
function labelForDim(dim, key) {
  if (dim === 'day') return dayLabelOf(key)
  if (dim === 'month') return monthLabelOf(key)
  return key
}

export default function LeverageCareersDashboard() {
  const [preset, setPreset] = useState('mtd')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [customOpen, setCustomOpen] = useState(false)

  const [token, setToken] = useState(null)
  const [tokenChecked, setTokenChecked] = useState(false)
  const [dayRows, setDayRows] = useState(null) // granular (date, name) rows for activeWindow
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [synced, setSynced] = useState(null)

  const [tableDim, setTableDim] = useState('campaign')
  const [tableSearch, setTableSearch] = useState('')
  const [tableSort, setTableSort] = useState({ key: 'spend', dir: 'desc' })

  const [trendOpen, setTrendOpen] = useState(false)
  const [trendDim, setTrendDim] = useState('Month')
  const [trendGranularity, setTrendGranularity] = useState('Day')
  const [trendPeriods, setTrendPeriods] = useState(6)
  const [trendMetric, setTrendMetric] = useState('Spend')
  const [trendRows, setTrendRows] = useState(null)
  const [trendLoading, setTrendLoading] = useState(false)
  const [trendError, setTrendError] = useState('')

  const [compareOpen, setCompareOpen] = useState(false)
  const [compareMode, setCompareMode] = useState('prev')
  const [cFromA, setCFromA] = useState('')
  const [cToA, setCToA] = useState('')
  const [cFromB, setCFromB] = useState('')
  const [cToB, setCToB] = useState('')
  const [compareRowsA, setCompareRowsA] = useState(null)
  const [compareRowsB, setCompareRowsB] = useState(null)
  const [compareLoading, setCompareLoading] = useState(false)
  const [compareError, setCompareError] = useState('')

  const d1 = ist(0)
  const activeWindow = useMemo(() => {
    if (preset === 'ld') return { from: shiftDate(d1, -1), to: shiftDate(d1, -1) }
    if (preset === 'l7d') return { from: shiftDate(d1, -7), to: shiftDate(d1, -1) }
    if (preset === 'custom' && customFrom && customTo) {
      return customFrom <= customTo ? { from: customFrom, to: customTo } : { from: customTo, to: customFrom }
    }
    return { from: d1.slice(0, 8) + '01', to: d1 } // mtd
  }, [preset, d1, customFrom, customTo])

  const windowLabel = preset === 'ld' ? 'Last Day' : preset === 'l7d' ? 'Last 7D' : preset === 'custom' ? (customFrom + ' → ' + customTo) : 'MTD'

  useEffect(() => {
    (async () => {
      const t = await loadTokenFromSupabase()
      setToken(t)
      setTokenChecked(true)
    })()
  }, [])

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true); setError('')
    try {
      const rows = await fetchGranular(token, activeWindow.from, activeWindow.to)
      setDayRows(rows)
      setSynced(new Date())
    } catch (e) {
      setError(e.message || 'Failed to load')
      toast('Leverage Careers: ' + (e.message || 'load failed'), { type: 'muted' })
    } finally {
      setLoading(false)
    }
  }, [token, activeWindow.from, activeWindow.to])

  useEffect(() => { if (token) load() }, [token, activeWindow.from, activeWindow.to]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- main-page aggregates ----
  const campaignRows = useMemo(() => sortGroup('campaign', groupRows(dayRows || [], 'campaign')), [dayRows])
  const totals = useMemo(() => sumTotals(dayRows || []), [dayRows])
  const matchedCount = useMemo(() => campaignRows.filter(r => r.matched).length, [campaignRows])
  const unmatchedCrmLeads = useMemo(() => campaignRows.filter(r => !r.hasMeta && r.crmLeads > 0).reduce((s, r) => s + r.crmLeads, 0), [campaignRows])

  const funnel = useMemo(() => ([
    { stage: 'CRM Leads', count: totals.crmLeads },
    { stage: 'Interested', count: totals.interested },
    { stage: 'Won', count: totals.won },
  ]), [totals])

  const tableRowsRaw = useMemo(() => groupRows(dayRows || [], tableDim), [dayRows, tableDim])
  const tableRows = useMemo(() => {
    let list = tableRowsRaw
    if (tableSearch.trim()) {
      const q = tableSearch.trim().toLowerCase()
      list = list.filter(r => String(r.label).toLowerCase().includes(q))
    }
    const dir = tableSort.dir === 'asc' ? 1 : -1
    return [...list].sort((a, b) => {
      const av = a[tableSort.key], bv = b[tableSort.key]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      return av < bv ? -dir : av > bv ? dir : 0
    })
  }, [tableRowsRaw, tableSearch, tableSort])
  const tableTotals = useMemo(() => sumTotals(dayRows || []), [dayRows])
  const toggleSort = key => setTableSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' })

  const exportRows = useMemo(() => tableRows.map(r => ({
    [tableDim === 'campaign' ? 'Campaign' : tableDim === 'month' ? 'Month' : 'Date']: labelForDim(tableDim, r.label),
    Spend: fmtINR(r.spend), Impressions: fmtN(r.impressions), Clicks: fmtN(r.clicks),
    'Meta Leads': fmtN(r.metaLeads), 'CRM Leads': fmtN(r.crmLeads), Interested: fmtN(r.interested), Won: fmtN(r.won),
    'CPL (Meta)': fmtINR(r.cpl), 'CPL (CRM)': fmtINR(r.cplCrm), CPI: fmtINR(r.cpi), CPS: fmtINR(r.cps),
    ...(tableDim === 'campaign' ? { Matched: r.matched ? 'Yes' : 'No' } : {}),
  })), [tableRows, tableDim])
  const exportRawRows = useMemo(() => tableRows.map(r => ({
    [tableDim === 'campaign' ? 'Campaign' : tableDim === 'month' ? 'Month' : 'Date']: labelForDim(tableDim, r.label),
    Spend: Math.round(r.spend), Impressions: r.impressions, Clicks: r.clicks,
    'Meta Leads': r.metaLeads, 'CRM Leads': r.crmLeads, Interested: r.interested, Won: r.won,
    'CPL (Meta)': r.cpl != null ? Math.round(r.cpl) : '', 'CPL (CRM)': r.cplCrm != null ? Math.round(r.cplCrm) : '',
    CPI: r.cpi != null ? Math.round(r.cpi) : '', CPS: r.cps != null ? Math.round(r.cps) : '',
  })), [tableRows, tableDim])

  // ---- Trend Analysis ----
  const trendPeriodUnit = trendDim === 'Day' ? 'days' : trendDim === 'Month' ? 'months'
    : trendGranularity === 'Week' ? 'weeks' : trendGranularity === 'Month' ? 'months' : 'days'
  const trendWindow = useMemo(() => {
    const anchor = shiftDate(d1, -1) // last complete day -- avoids a half-finished today skewing a trend
    if (trendDim === 'Day') return { from: shiftDate(anchor, -(trendPeriods - 1)), to: anchor }
    if (trendDim === 'Month') return { from: addMonthsIso(anchor.slice(0, 8) + '01', -(trendPeriods - 1)), to: anchor }
    // Campaign dimension -- bucketed by the chosen granularity
    const n = trendGranularity === 'Month' ? trendPeriods : trendGranularity === 'Week' ? trendPeriods * 7 : trendPeriods
    return { from: shiftDate(anchor, -(n - 1)), to: anchor }
  }, [trendDim, trendGranularity, trendPeriods, d1])

  useEffect(() => {
    if (!trendOpen || !token) return
    let cancelled = false
    setTrendLoading(true); setTrendError('')
    fetchGranular(token, trendWindow.from, trendWindow.to)
      .then(rows => { if (!cancelled) setTrendRows(rows) })
      .catch(e => { if (!cancelled) setTrendError(e.message || 'Failed to load trend data') })
      .finally(() => { if (!cancelled) setTrendLoading(false) })
    return () => { cancelled = true }
  }, [trendOpen, token, trendWindow.from, trendWindow.to])

  const trendResult = useMemo(() => {
    const rows = trendRows || []
    const metric = METRICS.find(m => m.label === trendMetric) || METRICS[0]
    if (trendDim === 'Day' || trendDim === 'Month') {
      const dim = trendDim === 'Day' ? 'day' : 'month'
      const buckets = sortGroup(dim, groupRows(rows, dim))
      const chart = buckets.map(b => ({ period: labelForDim(dim, b.key), value: b[metric.key] }))
      const exportRows2 = buckets.map(b => ({
        Period: labelForDim(dim, b.key), Spend: Math.round(b.spend), Impressions: b.impressions, Clicks: b.clicks,
        'Meta Leads': b.metaLeads, 'CRM Leads': b.crmLeads, Interested: b.interested, Won: b.won,
        'CPL (Meta)': b.cpl != null ? Math.round(b.cpl) : '', 'CPL (CRM)': b.cplCrm != null ? Math.round(b.cplCrm) : '',
        CPI: b.cpi != null ? Math.round(b.cpi) : '', CPS: b.cps != null ? Math.round(b.cps) : '',
      }))
      return { single: true, chart, table: buckets, exportRows: exportRows2, metric }
    }
    // Campaign dimension: bucket by day/week/month, top 8 campaigns by total metric as lines
    const bucketKey = r => trendGranularity === 'Month' ? monthKeyOf(r.date) : trendGranularity === 'Week' ? isoWeekStart(r.date) : r.date
    const bucketLabel = k => trendGranularity === 'Month' ? monthLabelOf(k) : trendGranularity === 'Week' ? ('wk ' + dayLabelOf(k)) : dayLabelOf(k)
    const byCampaign = sortGroup('campaign', groupRows(rows, 'campaign'))
    const top = byCampaign.slice(0, 8).map(c => c.label)
    const bucketMap = new Map()
    rows.forEach(r => {
      const bk = bucketKey(r)
      if (!bucketMap.has(bk)) bucketMap.set(bk, new Map())
      const inner = bucketMap.get(bk)
      const cur = inner.get(r.name) || { spend: 0, impressions: 0, clicks: 0, metaLeads: 0, crmLeads: 0, interested: 0, won: 0 }
      cur.spend += r.spend; cur.impressions += r.impressions; cur.clicks += r.clicks
      cur.metaLeads += r.metaLeads; cur.crmLeads += r.crmLeads; cur.interested += r.interested; cur.won += r.won
      inner.set(r.name, cur)
    })
    const bucketKeys = Array.from(bucketMap.keys()).sort()
    const derive = c => ({
      ...c,
      cpl: c.metaLeads > 0 ? c.spend / c.metaLeads : null,
      cplCrm: c.crmLeads > 0 ? c.spend / c.crmLeads : null,
      cpi: c.interested > 0 ? c.spend / c.interested : null,
      cps: c.won > 0 ? c.spend / c.won : null,
    })
    const chart = bucketKeys.map(bk => {
      const row = { period: bucketLabel(bk) }
      top.forEach(name => {
        const c = bucketMap.get(bk).get(name)
        row[name] = c ? derive(c)[metric.key] : 0
      })
      return row
    })
    const exportRows2 = bucketKeys.flatMap(bk => top.map(name => {
      const c = bucketMap.get(bk).get(name)
      const d2 = c ? derive(c) : { spend: 0, impressions: 0, clicks: 0, metaLeads: 0, crmLeads: 0, interested: 0, won: 0, cpl: null, cplCrm: null, cpi: null, cps: null }
      return {
        Period: bucketLabel(bk), Campaign: name, Spend: Math.round(d2.spend), Impressions: d2.impressions, Clicks: d2.clicks,
        'Meta Leads': d2.metaLeads, 'CRM Leads': d2.crmLeads, Interested: d2.interested, Won: d2.won,
        'CPL (Meta)': d2.cpl != null ? Math.round(d2.cpl) : '', 'CPL (CRM)': d2.cplCrm != null ? Math.round(d2.cplCrm) : '',
        CPI: d2.cpi != null ? Math.round(d2.cpi) : '', CPS: d2.cps != null ? Math.round(d2.cps) : '',
      }
    }))
    return { single: false, chart, lines: top, exportRows: exportRows2, metric, coveredOf: byCampaign.length }
  }, [trendRows, trendDim, trendGranularity, trendMetric])

  // ---- Compare ----
  const compareSpanA = useMemo(() => {
    if (compareMode === 'custom') return (cFromA && cToA) ? { from: cFromA, to: cToA } : activeWindow
    return activeWindow
  }, [compareMode, cFromA, cToA, activeWindow])
  const compareSpanB = useMemo(() => {
    const days = (new Date(compareSpanA.to) - new Date(compareSpanA.from)) / 86400000 + 1
    if (compareMode === 'yoy') return { from: addMonthsIso(compareSpanA.from, -12), to: addMonthsIso(compareSpanA.to, -12) }
    if (compareMode === 'custom') return (cFromB && cToB) ? { from: cFromB, to: cToB } : { from: shiftDate(compareSpanA.from, -days), to: shiftDate(compareSpanA.from, -1) }
    return { from: shiftDate(compareSpanA.from, -days), to: shiftDate(compareSpanA.from, -1) } // prev
  }, [compareMode, compareSpanA, cFromB, cToB])

  useEffect(() => {
    if (!compareOpen || !token) return
    let cancelled = false
    setCompareLoading(true); setCompareError('')
    Promise.all([
      fetchGranular(token, compareSpanA.from, compareSpanA.to),
      fetchGranular(token, compareSpanB.from, compareSpanB.to),
    ]).then(([a, b]) => { if (!cancelled) { setCompareRowsA(a); setCompareRowsB(b) } })
      .catch(e => { if (!cancelled) setCompareError(e.message || 'Failed to load comparison data') })
      .finally(() => { if (!cancelled) setCompareLoading(false) })
    return () => { cancelled = true }
  }, [compareOpen, token, compareSpanA.from, compareSpanA.to, compareSpanB.from, compareSpanB.to])

  const compareResult = useMemo(() => {
    const a = sumTotals(compareRowsA || [])
    const b = sumTotals(compareRowsB || [])
    const groupA = new Map(groupRows(compareRowsA || [], 'campaign').map(r => [r.label, r]))
    const groupB = new Map(groupRows(compareRowsB || [], 'campaign').map(r => [r.label, r]))
    const names = new Set([...groupA.keys(), ...groupB.keys()])
    const rows = Array.from(names).map(name => {
      const ra = groupA.get(name) || { spend: 0, metaLeads: 0, crmLeads: 0, interested: 0, won: 0, cpl: null, cplCrm: null, cpi: null, cps: null }
      const rb = groupB.get(name) || { spend: 0, metaLeads: 0, crmLeads: 0, interested: 0, won: 0, cpl: null, cplCrm: null, cpi: null, cps: null }
      return { name, a: ra, b: rb, dWon: ra.won - rb.won, dCrmLeads: ra.crmLeads - rb.crmLeads }
    }).sort((x, y) => Math.abs(y.dWon) - Math.abs(x.dWon) || Math.abs(y.dCrmLeads) - Math.abs(x.dCrmLeads))
    const wonDelta = deltaPct(a.won, b.won)
    const cpsDelta = deltaPct(a.cps || 0, b.cps || 0)
    const verdict = a.won === 0 && b.won === 0
      ? `No Won leads in either period — comparing on CRM Leads instead: ${deltaPct(a.crmLeads, b.crmLeads) == null ? '—' : (deltaPct(a.crmLeads, b.crmLeads) >= 0 ? 'up' : 'down') + ' ' + Math.abs(deltaPct(a.crmLeads, b.crmLeads)).toFixed(1) + '%'}.`
      : `Won is ${wonDelta == null ? 'flat' : (wonDelta >= 0 ? 'up' : 'down') + ' ' + Math.abs(wonDelta).toFixed(1) + '%'}${cpsDelta == null ? '' : `, and cost per Won is ${cpsDelta >= 0 ? 'up' : 'down'} ${Math.abs(cpsDelta).toFixed(1)}%`}.`
    return { a, b, rows, verdict }
  }, [compareRowsA, compareRowsB])
  const compareExportRows = useMemo(() => compareResult.rows.map(r => ({
    Campaign: r.name,
    [`Spend (${windowLabel})`]: Math.round(r.a.spend), 'Spend (compare)': Math.round(r.b.spend),
    'CRM Leads (this)': r.a.crmLeads, 'CRM Leads (compare)': r.b.crmLeads,
    'Interested (this)': r.a.interested, 'Interested (compare)': r.b.interested,
    'Won (this)': r.a.won, 'Won (compare)': r.b.won, 'Δ Won': r.dWon, 'Δ CRM Leads': r.dCrmLeads,
  })), [compareResult, windowLabel])

  return (
    <div className={styles.layout}>
      <Sidebar />
      <div className={styles.main}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.breadcrumb}>Meta Ads</div>
            <h1 className={styles.pageTitle}>Leverage Careers</h1>
          </div>
          <div className={styles.headerRight}>
            <div className={styles.presetRow}>
              {PRESETS.map(p => (
                <button key={p.id} type="button" className={preset === p.id ? styles.presetPillActive : styles.presetPill} onClick={() => setPreset(p.id)}>{p.label}</button>
              ))}
              <div style={{ position: 'relative' }}>
                <button type="button" className={preset === 'custom' ? styles.presetPillActive : styles.presetPill} onClick={() => { setPreset('custom'); setCustomOpen(true) }}>
                  {preset === 'custom' && customFrom && customTo ? customFrom + ' → ' + customTo : 'Custom range'}
                </button>
                {customOpen ? (
                  <>
                    <div onClick={() => { setCustomOpen(false); if (!(customFrom && customTo)) setPreset('mtd') }} style={{ position: 'fixed', inset: 0, zIndex: 399 }} />
                    <div style={{ position: 'absolute', top: '110%', right: 0, zIndex: 400 }}>
                      <DateRangePicker
                        from={isoToDate(customFrom)} to={isoToDate(customTo)}
                        onChange={(f, t) => { setCustomFrom(f); setCustomTo(t); if (f && t) setCustomOpen(false) }}
                        onClose={() => { setCustomOpen(false); if (!(customFrom && customTo)) setPreset('mtd') }}
                      />
                    </div>
                  </>
                ) : null}
              </div>
            </div>
            {synced ? <span className={styles.note} style={{ margin: 0 }}>Synced {synced.toLocaleTimeString()}</span> : null}
            <Button size="sm" variant="secondary" onClick={load} disabled={loading || !token}>Refresh</Button>
            <Button size="sm" variant="secondary" onClick={() => setTrendOpen(true)} disabled={!token}>Trend</Button>
            <Button size="sm" variant="secondary" onClick={() => setCompareOpen(true)} disabled={!token}>Compare</Button>
            <ExportButton data={exportRows} rawData={exportRawRows} filename="leverage_careers" dashboardId="leverage_careers" />
          </div>
        </div>

        <div className={styles.content}>
          {!tokenChecked ? (
            <InlineLoader label="Checking Meta connection" />
          ) : !token ? (
            <div className={styles.connectWrap}>
              <div className={styles.connectTitle}>Meta Ads is not connected yet</div>
              <div className={styles.connectDesc}>
                This page reuses the same Meta connection as the main Meta Ads page --
                connect there first (it grants access to every ad account the signed-in
                Meta user manages, including Leverage Careers).
              </div>
              <a href="/dashboard/meta-ads"><Button variant="primary">Go to Meta Ads</Button></a>
            </div>
          ) : loading && !dayRows ? (
            <InlineLoader label="Loading Leverage Careers data" />
          ) : error && !dayRows ? (
            <div className={styles.card}>
              <div className={styles.empty}>{error}</div>
            </div>
          ) : (
            <>
              <div className={styles.kpis}>
                <PremKPI label="SPEND" value={fmtINR(totals.spend)} sub={windowLabel} accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.total} />
                <PremKPI label="META LEADS" value={fmtN(totals.metaLeads)} sub="onsite_conversion.lead_grouped" accent={C.blue} accentBg={C.blueBg} icon={KPI_ICONS.agent} />
                <PremKPI label="CRM LEADS" value={fmtN(totals.crmLeads)} sub={matchedCount + ' of ' + campaignRows.length + ' names matched'} accent={C.cyan} accentBg={C.cyanBg} icon={KPI_ICONS.bot} />
                <PremKPI label="INTERESTED" value={fmtN(totals.interested)} sub={pct(totals.interested, totals.crmLeads) + ' of CRM leads'} accent={C.green} accentBg={C.greenBg} icon={KPI_ICONS.ai} />
                <PremKPI label="WON" value={fmtN(totals.won)} sub={pct(totals.won, totals.interested) + ' of interested'} accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.total} />
              </div>
              <div className={styles.kpis}>
                <PremKPI label="CPL (META)" value={fmtINR(totals.cpl)} sub="spend / Meta leads" accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.globe} invert />
                <PremKPI label="CPL (CRM)" value={fmtINR(totals.cplCrm)} sub="spend / CRM leads" accent={C.blue} accentBg={C.blueBg} icon={KPI_ICONS.globe} invert />
                <PremKPI label="CPI" value={fmtINR(totals.cpi)} sub="spend / interested" accent={C.cyan} accentBg={C.cyanBg} icon={KPI_ICONS.globe} invert />
                <PremKPI label="CPS" value={fmtINR(totals.cps)} sub="spend / Won" accent={C.green} accentBg={C.greenBg} icon={KPI_ICONS.globe} invert />
              </div>

              <Card noPad>
                <div style={{ padding: '16px 20px' }}>
                  {sectionTitle('Leverage Careers funnel', windowLabel + ' — CRM leads → Interested → Won')}
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={funnel} layout="vertical" margin={{ left: 20, right: 50, top: 4, bottom: 4 }}>
                      <defs><BarGrad id="g-lc-funnel" color={C.navy} dir="h" /></defs>
                      <CartesianGrid horizontal={false} stroke={C.border} />
                      <XAxis type="number" tick={axis} axisLine={false} tickLine={false} tickFormatter={fmtN} />
                      <YAxis type="category" dataKey="stage" tick={axis} axisLine={false} tickLine={false} width={90} />
                      <Tooltip content={<BrandTooltip />} cursor={{ fill: 'rgba(31,60,132,0.04)' }} />
                      <Bar dataKey="count" name="Count" fill={barFill('g-lc-funnel')} radius={BAR_RADIUS_H} barSize={22}>
                        <LabelList dataKey="count" position="right" formatter={fmtN} style={{ fontSize: 12.5, fontWeight: 700, fill: C.sub }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card
                action={
                  <div style={{ display: 'flex', gap: 6 }}>
                    {TABLE_TABS.map(([v, l]) => (
                      <button key={v} onClick={() => setTableDim(v)} style={{ padding: '7px 14px', borderRadius: 8, border: '0.5px solid ' + (tableDim === v ? C.navy : '#E5E7EB'), background: tableDim === v ? C.navy : '#fff', color: tableDim === v ? '#fff' : '#374151', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>{l}</button>
                    ))}
                  </div>
                }
              >
                {sectionTitle('Ads ↔ LeadSquared, by ' + (tableDim === 'campaign' ? 'campaign' : tableDim), windowLabel + ' — joined by exact name = career_campaign_name')}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: `0.5px solid ${C.border}`, background: 'var(--card)', flex: '1 1 200px', minWidth: 160, maxWidth: 280 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
                    <input value={tableSearch} onChange={e => setTableSearch(e.target.value)} placeholder={`Search ${tableDim === 'campaign' ? 'campaign' : tableDim}…`}
                      style={{ border: 'none', outline: 'none', background: 'transparent', fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: C.text, width: '100%' }} />
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        {[
                          ['label', tableDim === 'campaign' ? 'Ad Name' : tableDim === 'month' ? 'Month' : 'Date'],
                          ['spend', 'Spend'], ['impressions', 'Impr.'], ['clicks', 'Clicks'],
                          ['metaLeads', 'Meta Leads'], ['crmLeads', 'CRM Leads'], ['interested', 'Interested'], ['won', 'Won'],
                          ['cpl', 'CPL (Meta)'], ['cplCrm', 'CPL (CRM)'], ['cpi', 'CPI'], ['cps', 'CPS'],
                        ].map(([key, label]) => (
                          <th key={key} onClick={() => toggleSort(key)} style={{ cursor: 'pointer', userSelect: 'none' }}>
                            {label}{tableSort.key === key ? (tableSort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                          </th>
                        ))}
                        {tableDim === 'campaign' && <th>Matched</th>}
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ fontWeight: 800 }}>
                        <td>TOTAL</td>
                        <td>{fmtINR(tableTotals.spend)}</td><td>{fmtN(tableTotals.impressions)}</td><td>{fmtN(tableTotals.clicks)}</td>
                        <td>{fmtN(tableTotals.metaLeads)}</td><td>{fmtN(tableTotals.crmLeads)}</td><td>{fmtN(tableTotals.interested)}</td><td>{fmtN(tableTotals.won)}</td>
                        <td>{fmtINR(tableTotals.cpl)}</td><td>{fmtINR(tableTotals.cplCrm)}</td><td>{fmtINR(tableTotals.cpi)}</td><td>{fmtINR(tableTotals.cps)}</td>
                        {tableDim === 'campaign' && <td>—</td>}
                      </tr>
                      {tableRows.length === 0 ? (
                        <tr><td colSpan={13} className={styles.empty}>No data in this window.</td></tr>
                      ) : tableRows.map(r => (
                        <tr key={r.key}>
                          <td>{labelForDim(tableDim, r.label)}</td>
                          <td>{fmtINR(r.spend)}</td><td>{fmtN(r.impressions)}</td><td>{fmtN(r.clicks)}</td>
                          <td>{fmtN(r.metaLeads)}</td><td>{fmtN(r.crmLeads)}</td><td>{fmtN(r.interested)}</td><td>{fmtN(r.won)}</td>
                          <td>{fmtINR(r.cpl)}</td><td>{fmtINR(r.cplCrm)}</td><td>{fmtINR(r.cpi)}</td><td>{fmtINR(r.cps)}</td>
                          {tableDim === 'campaign' && <td><span className={r.matched ? styles.badgeYes : styles.badgeNo}>{r.matched ? 'Matched' : 'No match'}</span></td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {tableDim === 'campaign' && unmatchedCrmLeads > 0 ? (
                  <p className={styles.note}>
                    {fmtN(unmatchedCrmLeads)} LeadSquared lead(s) in this window carry a campaign name that
                    didn't match any Meta ad with spend on the same day (name changed/removed on Meta) -- included in the totals above, but not attributable to a specific ad.
                  </p>
                ) : null}
              </Card>
            </>
          )}
        </div>
      </div>

      {trendOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setTrendOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', borderRadius: 16, width: 'min(1100px, 96vw)', maxHeight: '92vh', overflowY: 'auto', padding: 24, fontFamily: FONT, boxShadow: '0 24px 60px rgba(0,0,0,0.28)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>Trend Analysis</div>
                <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>Leverage Careers — trailing periods, real day-level data</div>
              </div>
              <button onClick={() => setTrendOpen(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.muted, fontSize: 20, lineHeight: 1 }}>×</button>
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
              <Dropdown label="Dimension" options={['Month', 'Day', 'Campaign']} value={trendDim} onChange={setTrendDim} minWidth={110} />
              {trendDim === 'Campaign' && <Dropdown label="Bucket" options={['Day', 'Week', 'Month']} value={trendGranularity} onChange={setTrendGranularity} minWidth={100} />}
              <Dropdown
                label="Trailing"
                options={[3, 6, 12, 24].map(n => n + ' ' + trendPeriodUnit)}
                value={trendPeriods + ' ' + trendPeriodUnit}
                onChange={v => setTrendPeriods(Number(v.split(' ')[0]))}
                minWidth={110}
              />
              <Dropdown label="Metric" options={METRICS.map(m => m.label)} value={trendMetric} onChange={setTrendMetric} minWidth={120} />
            </div>

            {trendLoading && !trendRows ? (
              <InlineLoader label="Loading trend data" />
            ) : trendError ? (
              <div className={styles.empty}>{trendError}</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={trendResult.chart} margin={{ left: 10, right: 20, top: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                    <XAxis dataKey="period" tick={axis} axisLine={false} tickLine={false} />
                    <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={trendResult.metric.fmt} width={70} />
                    <Tooltip content={<BrandTooltip />} />
                    {trendResult.single ? (
                      <Line type="monotone" dataKey="value" name={trendResult.metric.label} stroke={C.navy} strokeWidth={2.5} dot={{ r: 3 }} strokeDasharray={trendLoading ? '5 4' : undefined} />
                    ) : (
                      <>
                        <Legend wrapperStyle={{ fontSize: 11, fontFamily: FONT }} />
                        {trendResult.lines.map((name, i) => (
                          <Line key={name} type="monotone" dataKey={name} stroke={['#1F3C84', '#1C9FD4', '#29B9C3', '#4CAE6F', '#3A5BA0', '#52B5DC', '#5BCAD2', '#73C58E'][i % 8]} strokeWidth={2} dot={false} strokeDasharray={trendLoading ? '5 4' : undefined} />
                        ))}
                      </>
                    )}
                  </LineChart>
                </ResponsiveContainer>
                {!trendResult.single && (
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
                    Charting the top {trendResult.lines.length} of {trendResult.coveredOf} campaigns by {trendResult.metric.label} — every one is in the export below.
                  </div>
                )}
                <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
                  <ExportButton data={trendResult.exportRows} filename="leverage_careers_trend" dashboardId="leverage_careers" />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {compareOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setCompareOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', borderRadius: 16, width: 'min(1000px, 96vw)', maxHeight: '92vh', overflowY: 'auto', padding: 24, fontFamily: FONT, boxShadow: '0 24px 60px rgba(0,0,0,0.28)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>Compare periods</div>
                <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>Leverage Careers — breakdown by campaign (Month/Day aren't meaningful when the comparison itself is across time)</div>
              </div>
              <button onClick={() => setCompareOpen(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.muted, fontSize: 20, lineHeight: 1 }}>×</button>
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
              <Dropdown label="Compare to" options={['Previous period', 'Same period last year', 'Custom']} value={compareMode === 'prev' ? 'Previous period' : compareMode === 'yoy' ? 'Same period last year' : 'Custom'} onChange={v => setCompareMode(v === 'Previous period' ? 'prev' : v === 'Same period last year' ? 'yoy' : 'custom')} minWidth={190} />
            </div>
            {compareMode === 'custom' && (
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14, fontSize: 12.5, color: C.sub }}>
                <div>This: <input type="date" value={cFromA} onChange={e => setCFromA(e.target.value)} /> → <input type="date" value={cToA} onChange={e => setCToA(e.target.value)} /></div>
                <div>Vs: <input type="date" value={cFromB} onChange={e => setCFromB(e.target.value)} /> → <input type="date" value={cToB} onChange={e => setCToB(e.target.value)} /></div>
              </div>
            )}
            <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 14 }}>
              This: {compareSpanA.from} → {compareSpanA.to} &nbsp;·&nbsp; Vs: {compareSpanB.from} → {compareSpanB.to}
            </div>

            {compareLoading && !compareRowsA ? (
              <InlineLoader label="Loading comparison data" />
            ) : compareError ? (
              <div className={styles.empty}>{compareError}</div>
            ) : (
              <>
                <div style={{ background: C.navyBg, borderRadius: 12, padding: '14px 16px', marginBottom: 16, fontSize: 13.5, fontWeight: 700, color: C.navy }}>{compareResult.verdict}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
                  <PremKPI label="SPEND" value={fmtINR(compareResult.a.spend)} sub={'vs ' + fmtINR(compareResult.b.spend)} delta={deltaPct(compareResult.a.spend, compareResult.b.spend)} invert accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.total} />
                  <PremKPI label="CRM LEADS" value={fmtN(compareResult.a.crmLeads)} sub={'vs ' + fmtN(compareResult.b.crmLeads)} delta={deltaPct(compareResult.a.crmLeads, compareResult.b.crmLeads)} accent={C.cyan} accentBg={C.cyanBg} icon={KPI_ICONS.bot} />
                  <PremKPI label="INTERESTED" value={fmtN(compareResult.a.interested)} sub={'vs ' + fmtN(compareResult.b.interested)} delta={deltaPct(compareResult.a.interested, compareResult.b.interested)} accent={C.green} accentBg={C.greenBg} icon={KPI_ICONS.ai} />
                  <PremKPI label="WON" value={fmtN(compareResult.a.won)} sub={'vs ' + fmtN(compareResult.b.won)} delta={deltaPct(compareResult.a.won, compareResult.b.won)} accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.total} />
                </div>

                <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, marginBottom: 8 }}>What's driving it — by campaign, ranked by |Δ Won|</div>
                <div style={{ overflowX: 'auto', marginBottom: 16 }}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Campaign</th><th>Spend (this)</th><th>Spend (vs)</th>
                        <th>CRM Leads (this)</th><th>CRM Leads (vs)</th>
                        <th>Won (this)</th><th>Won (vs)</th><th>Δ Won</th>
                      </tr>
                    </thead>
                    <tbody>
                      {compareResult.rows.slice(0, 30).map(r => (
                        <tr key={r.name}>
                          <td>{r.name}</td>
                          <td>{fmtINR(r.a.spend)}</td><td>{fmtINR(r.b.spend)}</td>
                          <td>{fmtN(r.a.crmLeads)}</td><td>{fmtN(r.b.crmLeads)}</td>
                          <td>{fmtN(r.a.won)}</td><td>{fmtN(r.b.won)}</td>
                          <td style={{ color: r.dWon >= 0 ? C.green : C.navy, fontWeight: 700 }}>{r.dWon >= 0 ? '+' : ''}{r.dWon}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {compareResult.rows.length > 30 && (
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>Showing top 30 of {compareResult.rows.length} campaigns by |Δ Won| — every one is in the export below.</div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <ExportButton data={compareExportRows} filename="leverage_careers_compare" dashboardId="leverage_careers" />
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
