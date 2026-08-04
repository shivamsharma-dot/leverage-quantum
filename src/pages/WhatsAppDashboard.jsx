import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { getSession, setSession } from '../lib/sessionLoad'
import { resolveSheetUrl } from '../lib/dataSources'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, ComposedChart, Line, CartesianGrid, Legend, LabelList,
} from 'recharts'
import Sidebar from '../components/Sidebar'
import Dropdown from '../components/Dropdown'
import { DashboardSkeleton } from '../components/SkeletonLoader'
import { C, FONT, BRAND_RAMP, brandColor, PAGE_SIZE, fmtN, pct, Card, PremKPI, KPI_ICONS, RankedBars, BarGrad, barFill, BAR_RADIUS, BAR_RADIUS_H, BAR_MAX, NEUTRAL_TRACK } from '../ui/dashboardKit'
import Button from '../components/Button'

const CSV_DEFAULT = 'https://docs.google.com/spreadsheets/d/1r-e6pBCN5ysfeD3Eq6sxgLmf97mdeTtloMPylqnx6Ew/gviz/tq?tqx=out:csv&sheet=whatsapp'
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function parseDate(s) {
  if (!s) return null
  const clean = s.replace(/"/g, '').trim()
  const m = clean.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/)
  if (m) {
    const dy = +m[1]
    const moIdx = MONTHS_SHORT.findIndex((x) => x.toLowerCase() === m[2].toLowerCase())
    let y = +m[3]
    if (y < 100) y += 2000
    if (moIdx === -1) return null
    return new Date(y, moIdx, dy)
  }
  const d = new Date(clean)
  return isNaN(d.getTime()) ? null : d
}
function isoDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
function shortSource(s) {
  if (!s) return 'OTHER'
  const parts = s.split('_')
  return parts[0] || s
}
function fmtC(n) {
  if (!n && n !== 0) return '—'
  const v = Math.abs(n)
  if (v >= 1e7) return '₹' + (n / 1e7).toFixed(2) + 'Cr'
  if (v >= 1e5) return '₹' + (n / 1e5).toFixed(2) + 'L'
  if (v >= 1e3) return '₹' + (n / 1e3).toFixed(1) + 'K'
  return '₹' + Math.round(n).toLocaleString('en-IN')
}

function parseCSV(t) {
  const rows = []
  let i = 0, field = '', row = [], inq = false
  while (i < t.length) {
    const c = t[i]
    if (inq) {
      if (c === '"') { if (t[i + 1] === '"') { field += '"'; i++ } else inq = false }
      else field += c
    } else {
      if (c === '"') inq = true
      else if (c === ',') { row.push(field); field = '' }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
      else if (c === '\r') { /* skip */ }
      else field += c
    }
    i++
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  if (!rows.length) return []
  const hdr = rows[0].map((h) => h.replace(/"/g, '').toLowerCase().trim())
  const idx = (k) => hdr.indexOf(k)
  const iSrc = idx('source_table'), iMonth = idx('month'), iDate = idx('date')
  const iDeliv = idx('delivered_messages'), iMkt = idx('marketing_spend'), iUtil = idx('utility_spend'), iTotal = idx('total_spend')
  return rows.slice(1).filter((r) => r.length > 1 && r.some((c) => c && c.trim())).map((r) => {
    const clean = (v) => (v || '').replace(/"/g, '').trim()
    const dateRaw = clean(r[iDate])
    const d = parseDate(dateRaw)
    const mkt = parseFloat(clean(r[iMkt])) || 0
    const util = parseFloat(clean(r[iUtil])) || 0
    const totalRaw = parseFloat(clean(r[iTotal]))
    return {
      source: clean(r[iSrc]) || 'OTHER',
      month: clean(r[iMonth]),
      date: d,
      dateStr: d ? isoDate(d) : dateRaw,
      delivered: parseFloat(clean(r[iDeliv])) || 0,
      mktSpend: mkt,
      utilSpend: util,
      totalSpend: isNaN(totalRaw) ? (mkt + util) : totalRaw,
    }
  }).filter((r) => r.dateStr)
}

export default function WhatsAppDashboard() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [lastSync, setLastSync] = useState(null)
  const [selSource, setSelSource] = useState('All')
  const [selMonth, setSelMonth] = useState('All')
  const [tab, setTab] = useState('overview')
  const [search, setSearch] = useState('')
  const [sortCol, setSortCol] = useState('dateStr')
  const [sortDir, setSortDir] = useState('desc')
  const [page, setPage] = useState(0)

  const loadData = useCallback(async (bust) => {
    try {
      if (!bust) {
        const cached = getSession('whatsapp_v2')
        if (cached) { setRows(cached.rows); setLastSync(cached.ts); setLoading(false); return }
      }
      const url = await resolveSheetUrl('whatsapp', CSV_DEFAULT)
      const txt = await fetch(url).then((r) => (r.ok ? r.text() : ''))
      if (!txt) throw new Error('empty response')
      const parsed = parseCSV(txt)
      const ts = new Date()
      setSession('whatsapp_v2', { rows: parsed, ts })
      setRows(parsed)
      setLastSync(ts)
      setError('')
    } catch (e) {
      console.error('WhatsApp fetch', e)
      setError('Could not load WhatsApp data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { loadData(false) }, [loadData])

  const handleRefresh = () => { setRefreshing(true); loadData(true) }

  const sourceList = useMemo(() => {
    const set = new Set(rows.map((r) => r.source))
    return Array.from(set).sort((a, b) => shortSource(a).localeCompare(shortSource(b)))
  }, [rows])

  const monthList = useMemo(() => {
    const map = {}
    rows.forEach((r) => { if (r.month) map[r.month] = r.date ? r.date.getFullYear() * 100 + r.date.getMonth() : 0 })
    return Object.keys(map).sort((a, b) => map[a] - map[b])
  }, [rows])

  const filtered = useMemo(() => {
    return rows.filter((r) => (selSource === 'All' || r.source === selSource) && (selMonth === 'All' || r.month === selMonth))
  }, [rows, selSource, selMonth])

  const totals = useMemo(() => {
    const t = { delivered: 0, mkt: 0, util: 0, total: 0 }
    filtered.forEach((r) => { t.delivered += r.delivered; t.mkt += r.mktSpend; t.util += r.utilSpend; t.total += r.totalSpend })
    return { ...t, cpd: t.delivered > 0 ? t.total / t.delivered : 0 }
  }, [filtered])

  const bySource = useMemo(() => {
    const map = {}
    filtered.forEach((r) => {
      if (!map[r.source]) map[r.source] = { source: r.source, label: shortSource(r.source), delivered: 0, mkt: 0, util: 0, total: 0 }
      map[r.source].delivered += r.delivered
      map[r.source].mkt += r.mktSpend
      map[r.source].util += r.utilSpend
      map[r.source].total += r.totalSpend
    })
    return Object.values(map).sort((a, b) => b.delivered - a.delivered)
  }, [filtered])

  const bySourceRanked = useMemo(() => bySource.map((s) => ({ label: s.label, count: s.delivered })), [bySource])
  const maxBySource = useMemo(() => Math.max(1, ...bySourceRanked.map((s) => s.count)), [bySourceRanked])

  const spendSplit = useMemo(() => [
    { name: 'Marketing', value: totals.mkt, fill: C.blue },
    { name: 'Utility', value: totals.util, fill: C.navy },
  ].filter((d) => d.value > 0), [totals])

  const dailyTrend = useMemo(() => {
    const map = {}
    filtered.forEach((r) => {
      if (!r.dateStr) return
      if (!map[r.dateStr]) map[r.dateStr] = { date: r.dateStr, Delivered: 0, Spend: 0 }
      map[r.dateStr].Delivered += r.delivered
      map[r.dateStr].Spend += r.totalSpend
    })
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date)).map((d) => ({ ...d, label: d.date.slice(5) }))
  }, [filtered])

  const monthTrend = useMemo(() => {
    const map = {}
    filtered.forEach((r) => {
      if (!r.month) return
      if (!map[r.month]) map[r.month] = { month: r.month, Delivered: 0, Spend: 0 }
      map[r.month].Delivered += r.delivered
      map[r.month].Spend += r.totalSpend
    })
    return monthList.filter((m) => map[m]).map((m) => map[m])
  }, [filtered, monthList])

  const searched = useMemo(() => {
    if (!search.trim()) return filtered
    const q = search.toLowerCase()
    return filtered.filter((r) => shortSource(r.source).toLowerCase().indexOf(q) !== -1 || r.source.toLowerCase().indexOf(q) !== -1)
  }, [filtered, search])

  const sorted = useMemo(() => {
    const arr = [...searched]
    arr.sort((a, b) => {
      let av = a[sortCol], bv = b[sortCol]
      if (typeof av === 'string') { av = av || ''; bv = bv || ''; return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av) }
      av = av || 0; bv = bv || 0
      return sortDir === 'asc' ? av - bv : bv - av
    })
    return arr
  }, [searched, sortCol, sortDir])

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const pageRows = sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const axis = { fontSize: 11, fill: C.muted, fontFamily: FONT }
  const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }
  const selectStyle = {
    fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: C.text, background: 'var(--card)',
    border: '0.5px solid ' + C.border, borderRadius: 9, padding: '7px 10px', cursor: 'pointer', outline: 'none',
  }
  const tabBtn = (active) => ({
    padding: '8px 16px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
    fontFamily: FONT, border: '0.5px solid ' + (active ? C.navy : C.border),
    background: active ? C.navy : 'var(--card)', color: active ? '#fff' : C.sub, transition: 'all .15s',
  })

  function BrandTooltip({ active, payload, label }) {
    if (!active || !payload || !payload.length) return null
    return (
      <div style={{ background: '#fff', border: '0.5px solid #E5E7EB', borderRadius: 10, padding: '9px 13px', fontFamily: FONT, boxShadow: '0 8px 24px rgba(15,23,42,0.12)' }}>
        <div style={{ fontSize: 11.5, fontWeight: 800, color: '#0F1B33', marginBottom: 4 }}>{label}</div>
        {payload.map((p, i) => (
          <div key={i} style={{ fontSize: 11.5, color: '#475569', display: 'flex', justifyContent: 'space-between', gap: 18 }}>
            <span style={{ color: p.color || p.fill }}>{p.name}</span>
            <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{/spend/i.test(p.name) ? fmtC(p.value) : fmtN(p.value)}</span>
          </div>
        ))}
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.bg, fontFamily: FONT }}>
        <Sidebar />
        <div style={{ flex: 1, overflow: 'auto' }}><DashboardSkeleton /></div>
      </div>
    )
  }

  return (
    <div className='lq-page-shell' style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.bg, fontFamily: FONT }}>
      <Sidebar />
      <div style={{ margin: '12px 14px 0', borderRadius: 14, border: '1px solid #EEF1F6', boxShadow: '0 1px 3px rgba(31,60,132,0.06)', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* HEADER BAR */}
        <div style={{ background: 'var(--card)', borderBottom: '0.5px solid ' + C.border, padding: '0 28px', minHeight: 56, height: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0, flexWrap: 'wrap' }}>
          <div style={{ padding: '10px 0' }}>
            <p style={{ fontSize: 10.5, color: C.muted, margin: 0, letterSpacing: '0.05em', textTransform: 'uppercase', fontFamily: FONT }}>Dashboards / WhatsApp</p>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: '2px 0 0', letterSpacing: '-0.4px', fontFamily: FONT }}>WhatsApp</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 0' }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, letterSpacing: 0.5 }}>SOURCE</span>
            <Dropdown minWidth={150} value={selSource} options={[{ value: 'All', label: 'All sources' }].concat(sourceList.map((s) => ({ value: s, label: shortSource(s) })))} onChange={(v) => { setSelSource(v); setPage(0) }} />
            <span style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, letterSpacing: 0.5, marginLeft: 6 }}>MONTH</span>
            <Dropdown minWidth={130} value={selMonth} options={[{ value: 'All', label: 'All months' }].concat(monthList.map((m) => ({ value: m, label: m })))} onChange={(v) => { setSelMonth(v); setPage(0) }} />
            {lastSync && <span style={{ fontSize: 11, color: C.muted, marginLeft: 4 }}>Synced {lastSync.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>}
            <Button size='sm' variant='secondary' onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? 'Refreshing' : 'Refresh'}
            </Button>
          </div>
        </div>

        {/* TAB NAV */}
        <div style={{ display: 'flex', gap: 8, padding: '14px 28px 0', flexShrink: 0 }}>
          <div style={tabBtn(tab === 'overview')} onClick={() => setTab('overview')}>Overview</div>
          <div style={tabBtn(tab === 'raw')} onClick={() => setTab('raw')}>Raw Data</div>
        </div>

        {/* SCROLLABLE CONTENT */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 28px 28px' }}>
          {error && <div style={{ padding: '10px 14px', borderRadius: 10, background: '#FEF2F2', color: '#DC2626', fontSize: 12.5, fontWeight: 600, marginBottom: 16 }}>{error}</div>}

          {tab === 'overview' && (
            <>
              <div className="lq-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 14, marginBottom: 20 }}>
                <PremKPI label='DELIVERED MESSAGES' value={fmtN(totals.delivered)} sub='all sources' accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.total} />
                <PremKPI label='MARKETING SPEND' value={fmtC(totals.mkt)} sub={pct(totals.mkt, totals.total) + ' of total spend'} accent={C.blue} accentBg={C.blueBg} icon={KPI_ICONS.globe} />
                <PremKPI label='UTILITY SPEND' value={fmtC(totals.util)} sub={pct(totals.util, totals.total) + ' of total spend'} accent={C.cyan} accentBg={C.cyanBg} icon={KPI_ICONS.bot} />
                <PremKPI label='TOTAL SPEND' value={fmtC(totals.total)} sub='marketing + utility' accent={C.green} accentBg={C.greenBg} icon={KPI_ICONS.ai} />
                <PremKPI label='COST / DELIVERED' value={fmtC(totals.cpd)} sub='spend per message' accent={C.amber} accentBg={'#FEF3C7'} icon={KPI_ICONS.agent} />
              </div>

              <div className="lq-grid2" style={grid2}>
                <Card title='By Source' sub='Delivered messages per WhatsApp number'>
                  <div style={{ padding: '16px 20px' }}>
                    <RankedBars data={bySourceRanked} labelKey='label' max={maxBySource} showRank />
                  </div>
                </Card>
                <Card title='Utility vs Marketing Spend' sub='Cost breakdown by message category'>
                  <div style={{ padding: '10px 20px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                    <ResponsiveContainer width='55%' height={200}>
                      <PieChart>
                        <Pie data={spendSplit} dataKey='value' nameKey='name' innerRadius={52} outerRadius={80} paddingAngle={3}>
                          {spendSplit.map((d, i) => <Cell key={i} fill={d.fill} />)}
                        </Pie>
                        <Tooltip content={<BrandTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {spendSplit.map((d, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 10, height: 10, borderRadius: 3, background: d.fill, flexShrink: 0 }} />
                          <div style={{ flex: 1, fontSize: 12.5, color: C.sub, fontFamily: FONT }}>{d.name}</div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: FONT }}>{fmtC(d.value)}</div>
                        </div>
                      ))}
                      <div style={{ borderTop: '0.5px solid ' + C.border, paddingTop: 8, marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, color: C.muted, fontWeight: 700 }}>Total</span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{fmtC(totals.total)}</span>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>

              <div style={{ marginTop: 16 }}>
                <Card title='Daily Trend' sub='Delivered messages and spend by day'>
                  <div style={{ padding: '16px 20px' }}>
                    <ResponsiveContainer width='100%' height={280}>
                      <ComposedChart data={dailyTrend} margin={{ left: 0, right: 10, top: 10, bottom: 4 }}>
                <defs><BarGrad id="g-b0-2" color={C.cyan}/></defs>
                        <CartesianGrid vertical={false} stroke={C.border} />
                        <XAxis dataKey='label' tick={axis} axisLine={false} tickLine={false} />
                        <YAxis yAxisId='left' tick={axis} axisLine={false} tickLine={false} allowDecimals={false} />
                        <YAxis yAxisId='right' orientation='right' tick={axis} axisLine={false} tickLine={false} />
                        <Tooltip content={<BrandTooltip />} cursor={{ fill: 'rgba(31,60,132,0.04)' }} />
                        <Legend wrapperStyle={{ fontSize: 11.5, fontFamily: FONT }} iconType='circle' />
                        <Bar yAxisId='left' dataKey='Delivered' name='Delivered' fill={barFill('g-b0-2')} radius={BAR_RADIUS} barSize={14} />
                        <Line yAxisId='right' type='monotone' dataKey='Spend' name='Spend' stroke={C.navy} strokeWidth={2.5} dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>

              <div style={{ marginTop: 16 }}>
                <Card title='Month on Month' sub='Delivered messages and spend by month'>
                  <div style={{ padding: '16px 20px' }}>
                    <ResponsiveContainer width='100%' height={240}>
                      <ComposedChart data={monthTrend} margin={{ left: 0, right: 10, top: 10, bottom: 4 }} barCategoryGap='30%'>
                <defs><BarGrad id="g-b1-1" color={C.blue}/></defs>
                        <CartesianGrid vertical={false} stroke={C.border} />
                        <XAxis dataKey='month' tick={axis} axisLine={false} tickLine={false} />
                        <YAxis yAxisId='left' tick={axis} axisLine={false} tickLine={false} allowDecimals={false} />
                        <YAxis yAxisId='right' orientation='right' tick={axis} axisLine={false} tickLine={false} />
                        <Tooltip content={<BrandTooltip />} cursor={{ fill: 'rgba(31,60,132,0.04)' }} />
                        <Legend wrapperStyle={{ fontSize: 11.5, fontFamily: FONT }} iconType='circle' />
                        <Bar yAxisId='left' dataKey='Delivered' name='Delivered' fill={barFill('g-b1-1')} radius={BAR_RADIUS} barSize={28}>
                          <LabelList dataKey='Delivered' position='top' style={{ fontSize: 10, fontWeight: 700, fill: C.muted }} />
                        </Bar>
                        <Line yAxisId='right' type='monotone' dataKey='Spend' name='Spend' stroke={C.green} strokeWidth={2.5} dot={{ r: 4 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>
            </>
          )}

          {tab === 'raw' && (
            <Card title='Raw Data' sub={sorted.length + ' rows'} action={
              <input placeholder='Search source...' value={search} onChange={(e) => { setSearch(e.target.value); setPage(0) }}
                style={{ fontFamily: FONT, fontSize: 12, padding: '6px 10px', borderRadius: 8, border: '0.5px solid ' + C.border, outline: 'none', width: 200 }} />
            }>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FONT }}>
                  <thead>
                    <tr>
                      {[['dateStr', 'Date'], ['source', 'Source'], ['month', 'Month'], ['delivered', 'Delivered'], ['mktSpend', 'Marketing'], ['utilSpend', 'Utility'], ['totalSpend', 'Total Spend']].map(([key, lbl]) => (
                        <th key={key} onClick={() => toggleSort(key)} style={{ padding: '10px 16px', textAlign: key === 'source' || key === 'month' || key === 'dateStr' ? 'left' : 'right', fontSize: 10.5, fontWeight: 800, color: C.muted, letterSpacing: '0.04em', textTransform: 'uppercase', cursor: 'pointer', borderBottom: '1px solid #F1F4F9', whiteSpace: 'nowrap' }}>
                          {lbl}{sortCol === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #F8FAFC' }}>
                        <td style={{ padding: '9px 16px', fontSize: 12.5, color: C.sub }}>{r.dateStr}</td>
                        <td style={{ padding: '9px 16px', fontSize: 12.5, color: C.text, fontWeight: 600 }} title={r.source}>{shortSource(r.source)}</td>
                        <td style={{ padding: '9px 16px', fontSize: 12.5, color: C.sub }}>{r.month}</td>
                        <td style={{ padding: '9px 16px', fontSize: 12.5, color: C.text, textAlign: 'right', fontWeight: 700 }}>{fmtN(r.delivered)}</td>
                        <td style={{ padding: '9px 16px', fontSize: 12.5, color: C.sub, textAlign: 'right' }}>{fmtC(r.mktSpend)}</td>
                        <td style={{ padding: '9px 16px', fontSize: 12.5, color: C.sub, textAlign: 'right' }}>{fmtC(r.utilSpend)}</td>
                        <td style={{ padding: '9px 16px', fontSize: 12.5, color: C.navy, textAlign: 'right', fontWeight: 800 }}>{fmtC(r.totalSpend)}</td>
                      </tr>
                    ))}
                    {pageRows.length === 0 && (
                      <tr><td colSpan={7} style={{ padding: '24px 16px', textAlign: 'center', color: C.muted, fontSize: 13 }}>No rows match the current filters</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid #F1F4F9' }}>
                <span style={{ fontSize: 11.5, color: C.muted }}>{page * PAGE_SIZE + 1}-{Math.min(sorted.length, (page + 1) * PAGE_SIZE)} of {sorted.length} rows</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} style={{ padding: '5px 12px', borderRadius: 7, border: '0.5px solid ' + C.border, background: '#fff', fontSize: 12, fontFamily: FONT, cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? 0.5 : 1 }}>Prev</button>
                  <button onClick={() => setPage(Math.min(pageCount - 1, page + 1))} disabled={page >= pageCount - 1} style={{ padding: '5px 12px', borderRadius: 7, border: '0.5px solid ' + C.border, background: '#fff', fontSize: 12, fontFamily: FONT, cursor: page >= pageCount - 1 ? 'default' : 'pointer', opacity: page >= pageCount - 1 ? 0.5 : 1 }}>Next</button>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
