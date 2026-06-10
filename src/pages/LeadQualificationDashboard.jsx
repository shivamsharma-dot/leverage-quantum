import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, Cell, PieChart, Pie
} from 'recharts'
import Sidebar from '../components/Sidebar'

const SHEET_CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRVF7R3Me4QPVaRS_n_OufcMrrgYvCt3Rs7yJUG0u4gEMd0cVL9IyP2aV6J8HDjOZrvWzcemgHwZaHs/pub?gid=0&single=true&output=csv'

const C = {
  navy:'#1F3C84', blue:'#1C9FD4', cyan:'#29B9C3', green:'#4CAE6F',
  amber:'#F59E0B', navyBg:'#E8EFF9', blueBg:'#E3F5FD', cyanBg:'#E4F8F9', greenBg:'#E9F8EF',
  border:'#E5E7EB', text:'#0F172A', muted:'#94A3B8', sub:'#475569', bg:'#F4F6F9',
}
const PROVIDER_COLORS = { Futwork: C.navy, Superbot: C.blue }
const FONT = "'Plus Jakarta Sans','Inter',sans-serif"
const PAGE_SIZE = 10

function fmtN(n) {
  if (!n && n !== 0) return '—'
  return Math.round(n).toLocaleString('en-IN')
}
function pct(a, b) { return b > 0 ? ((a / b) * 100).toFixed(1) + '%' : '—' }

function parseCSV(csv) {
  const rows = csv.trim().split('\n').map(r => {
    const cols = []; let buf = '', inQ = false
    for (const ch of r) {
      if (ch === '"') { inQ = !inQ }
      else if (ch === ',' && !inQ) { cols.push(buf.trim()); buf = '' }
      else buf += ch
    }
    cols.push(buf.trim()); return cols
  })
  const [hdr, ...data] = rows
  const h = k => hdr.indexOf(k)
  return data.filter(r => r[h('provider')]).map(r => ({
    provider:    r[h('provider')] || '',
    month_start: r[h('month_start')] || '',
    month:       r[h('qualified_month')] || '',
    campaign:    (r[h('opp_first_campaign_name')] || '').trim(),
    source:      (r[h('source')] || 'Others').trim(),
    sub_source:  (r[h('sub_source')] || '').trim(),
    count:       parseInt(r[h('qualified_count')]) || 0,
  }))
}

/* ── Shared UI components ────────────────────────────────────────────── */

const KPICard = ({ label, value, sub, accent = C.navy, delta }) => (
  <div style={{
    background: '#fff', border: `0.5px solid ${C.border}`, borderRadius: 12,
    padding: '18px 20px', borderTop: `3px solid ${accent}`,
    boxShadow: '0 1px 4px rgba(15,23,42,0.04)',
  }}>
    <div style={{ fontSize: 9.5, fontWeight: 700, color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8, fontFamily: FONT }}>{label}</div>
    <div style={{ fontSize: 26, fontWeight: 800, color: C.text, letterSpacing: '-0.8px', lineHeight: 1, fontFamily: FONT }}>{value}</div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7, minHeight: 20 }}>
      {sub && <div style={{ fontSize: 11.5, color: C.muted, fontFamily: FONT }}>{sub}</div>}
      {delta != null && (
        <span style={{
          fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
          background: delta >= 0 ? C.greenBg : '#FEF2F2',
          color: delta >= 0 ? '#059669' : '#DC2626', fontFamily: FONT,
        }}>
          {delta >= 0 ? '▲' : '▼'}{Math.abs(delta).toFixed(1)}%
        </span>
      )}
    </div>
  </div>
)

const Card = ({ title, sub, children, action, noPad }) => (
  <div style={{
    background: '#fff', border: `0.5px solid ${C.border}`, borderRadius: 14,
    overflow: 'hidden', boxShadow: '0 1px 4px rgba(15,23,42,0.04)',
  }}>
    <div style={{
      padding: '14px 20px 12px', borderBottom: `0.5px solid #F1F5F9`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: FONT }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 2, fontFamily: FONT }}>{sub}</div>}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
    <div style={noPad ? {} : { padding: '16px 20px' }}>{children}</div>
  </div>
)

/* Custom tooltip */
const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#fff', border: `0.5px solid ${C.border}`, borderRadius: 10,
      padding: '10px 14px', fontSize: 12, fontFamily: FONT,
      boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
    }}>
      {label && <div style={{ fontWeight: 700, color: C.text, marginBottom: 7, fontSize: 12 }}>{label}</div>}
      {payload.map(p => (
        <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: p.color, flexShrink: 0 }} />
          <span style={{ color: C.sub }}>{p.name}</span>
          <span style={{ fontWeight: 700, color: C.text, marginLeft: 'auto', paddingLeft: 12 }}>{fmtN(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

/* Custom legend chip */
const ChartLegend = ({ items }) => (
  <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 10 }}>
    {items.map(({ name, color }) => (
      <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 10, height: 10, borderRadius: 3, background: color }} />
        <span style={{ fontSize: 11.5, fontWeight: 500, color: C.sub, fontFamily: FONT }}>{name}</span>
      </div>
    ))}
  </div>
)

/* Custom donut centre label */
const DonutLabel = ({ cx, cy, total, label }) => (
  <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontFamily={FONT}>
    <tspan x={cx} dy="-8" style={{ fontSize: 20, fontWeight: 800, fill: C.text }}>{fmtN(total)}</tspan>
    <tspan x={cx} dy="22" style={{ fontSize: 10.5, fontWeight: 500, fill: C.muted }}>{label}</tspan>
  </text>
)

const SelBtn = ({ options, value, onChange, label }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    {label && <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT, whiteSpace: 'nowrap' }}>{label}</span>}
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{
        padding: '6px 28px 6px 10px', borderRadius: 8, border: `0.5px solid ${C.border}`,
        fontSize: 12, fontWeight: 600, fontFamily: FONT, background: '#fff', color: C.text,
        cursor: 'pointer', outline: 'none', appearance: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%239CA3AF'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat', backgroundPosition: 'right 9px center',
      }}>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  </div>
)

/* ── Main dashboard ─────────────────────────────────────────────────── */
export default function LeadQualificationDashboard() {
  const [rows, setRows]             = useState([])
  const [months, setMonths]         = useState([])
  const [selMonth, setSelMonth]     = useState('')
  const [selProvider, setSelProvider] = useState('All')
  const [selSource, setSelSource]   = useState('All')
  const [loading, setLoading]       = useState(true)
  const [lastSync, setLastSync]     = useState(null)
  const [search, setSearch]         = useState('')
  const [sortCol, setSortCol]       = useState('count')
  const [sortDir, setSortDir]       = useState('desc')
  const [page, setPage]             = useState(0)
  const [showInfo, setShowInfo]       = useState(false)
  const [datePreset, setDatePreset]   = useState('MTD')   // 'YTD','L7D','MTD','custom','month'
  const [customFrom, setCustomFrom]   = useState('')
  const [customTo, setCustomTo]       = useState('')
  const [showCustom, setShowCustom]   = useState(false)

  const loadData = useCallback(async (bust = false) => {
    setLoading(true)
    const t0 = Date.now()
    try {
      const url = bust ? SHEET_CSV + '&_=' + Date.now() : SHEET_CSV
      const res = await fetch(url)
      const csv = await res.text()
      const parsed = parseCSV(csv)
      setRows(parsed)
      // Build month list sorted by actual date using month_start column
      const monthMap = {}
      parsed.forEach(r => { if (r.month && r.month_start) monthMap[r.month] = r.month_start })
      const ms = [...new Set(parsed.map(r => r.month))].filter(Boolean)
        .sort((a, b) => new Date(monthMap[a] || 0) - new Date(monthMap[b] || 0))
      setMonths(ms)
      setSelMonth(prev => prev || ms[ms.length - 1] || '')
      setLastSync(new Date())
    } catch (e) { console.error('QL fetch', e) }
    finally { setTimeout(() => setLoading(false), Math.max(0, 750 - (Date.now() - t0))) }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const monthRows = useMemo(() => rows.filter(r => r.month === selMonth), [rows, selMonth])
  // alias for rest of dashboard: when a date preset is active, use dateFilteredRows
  const providers = useMemo(() => ['All', ...[...new Set(monthRows.map(r => r.provider))].filter(Boolean).sort()], [monthRows])
  const sources   = useMemo(() => ['All', ...[...new Set(monthRows.map(r => r.source))].filter(Boolean).sort()], [monthRows])
  const filtered  = useMemo(() => dateFilteredRows.filter(r =>
    (selProvider === 'All' || r.provider === selProvider) &&
    (selSource === 'All' || r.source === selSource)
  ), [dateFilteredRows, selProvider, selSource])

  /* Effective date window from preset */
  const dateWindow = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0)
    if (datePreset === 'YTD') {
      const from = new Date(today.getFullYear(), 0, 1)
      return { from, to: today, label: 'YTD (' + today.getFullYear() + ')' }
    }
    if (datePreset === 'L7D') {
      const from = new Date(today); from.setDate(today.getDate() - 6)
      return { from, to: today, label: 'Last 7 days' }
    }
    if (datePreset === 'MTD') {
      const from = new Date(today.getFullYear(), today.getMonth(), 1)
      return { from, to: today, label: 'MTD ' + today.toLocaleString('default',{month:'short',year:'numeric'}) }
    }
    if (datePreset === 'custom' && customFrom && customTo) {
      return { from: new Date(customFrom), to: new Date(customTo), label: customFrom + ' → ' + customTo }
    }
    // 'month' preset — filter by selected month only
    return null
  }, [datePreset, customFrom, customTo])

  /* Row filter: either by date window or by selected month */
  const dateFilteredRows = useMemo(() => {
    if (!dateWindow) return rows.filter(r => r.month === selMonth)
    return rows.filter(r => {
      if (!r.month_start) return false
      const d = new Date(r.month_start); d.setHours(0,0,0,0)
      return d >= dateWindow.from && d <= dateWindow.to
    })
  }, [rows, dateWindow, selMonth])

  /* KPIs always from full monthRows (not filtered) */
  const totals = useMemo(() => {
    const fw  = dateFilteredRows.filter(r => r.provider === 'Futwork').reduce((s, r) => s + r.count, 0)
    const sb  = dateFilteredRows.filter(r => r.provider === 'Superbot').reduce((s, r) => s + r.count, 0)
    const prevM    = months[months.indexOf(selMonth) - 1]
    const prevRows = prevM ? rows.filter(r => r.month === prevM) : []
    const prevFw   = prevRows.filter(r => r.provider === 'Futwork').reduce((s, r) => s + r.count, 0)
    const prevSb   = prevRows.filter(r => r.provider === 'Superbot').reduce((s, r) => s + r.count, 0)
    const prevTot  = prevFw + prevSb; const curTot = fw + sb
    return {
      fw, sb, total: curTot,
      totalDelta: prevTot > 0 ? ((curTot - prevTot) / prevTot * 100) : null,
      fwDelta:    prevFw  > 0 ? ((fw - prevFw) / prevFw * 100)       : null,
      sbDelta:    prevSb  > 0 ? ((sb - prevSb) / prevSb * 100)       : null,
    }
  }, [dateFilteredRows, rows, months, selMonth])

  /* Charts — respect filters */
  const sourceBar = useMemo(() => {
    const map = {}
    filtered.forEach(r => {
      const s = r.source || 'Others'
      if (!map[s]) map[s] = { source: s, Futwork: 0, Superbot: 0 }
      map[s][r.provider] = (map[s][r.provider] || 0) + r.count
    })
    return Object.values(map).sort((a, b) => (b.Futwork + b.Superbot) - (a.Futwork + a.Superbot)).slice(0, 8)
  }, [filtered])

  /* Donut always from full month (shows whole picture) */
  const provPie = useMemo(() => [
    { name: 'Futwork', value: totals.fw },
    { name: 'Superbot', value: totals.sb },
  ].filter(d => d.value > 0), [totals])

  const trend = useMemo(() => months.map(m => {
    const mr = rows.filter(r => r.month === m)
    return {
      month: m,
      Futwork:  mr.filter(r => r.provider === 'Futwork').reduce((s, r) => s + r.count, 0),
      Superbot: mr.filter(r => r.provider === 'Superbot').reduce((s, r) => s + r.count, 0),
    }
  }), [rows, months])

  const topCampaigns = useMemo(() => {
    const map = {}
    filtered.forEach(r => {
      const k = r.campaign + '||' + r.provider
      if (!map[k]) map[k] = { campaign: r.campaign, provider: r.provider, count: 0 }
      map[k].count += r.count
    })
    return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 10)
  }, [filtered])

  const tableRows = useMemo(() => {
    const q = search.toLowerCase()
    return filtered
      .filter(r => !q || r.campaign.toLowerCase().includes(q) || r.source.toLowerCase().includes(q) || r.provider.toLowerCase().includes(q))
      .sort((a, b) => {
        const av = sortCol === 'count' ? a.count : a[sortCol] || ''
        const bv = sortCol === 'count' ? b.count : b[sortCol] || ''
        if (typeof av === 'number') return sortDir === 'desc' ? bv - av : av - bv
        return sortDir === 'desc' ? bv.localeCompare(av) : av.localeCompare(bv)
      })
  }, [filtered, search, sortCol, sortDir])

  const totalPages = Math.ceil(tableRows.length / PAGE_SIZE)
  const pageRows   = tableRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const sortBy   = col => { setSortCol(col); setSortDir(d => sortCol === col ? (d === 'desc' ? 'asc' : 'desc') : 'desc'); setPage(0) }
  const onSearch = v  => { setSearch(v); setPage(0) }

  const thS = col => ({
    fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: '0.07em',
    textTransform: 'uppercase', padding: '10px 12px', cursor: 'pointer',
    userSelect: 'none', fontFamily: FONT, whiteSpace: 'nowrap',
    background: sortCol === col ? '#F8FAFF' : 'transparent',
    borderBottom: `0.5px solid ${C.border}`,
  })

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.bg, fontFamily: FONT }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* ── HEADER ───────────────────────────────────────────────── */}
        <div style={{
          background: '#fff', borderBottom: `0.5px solid ${C.border}`,
          padding: '11px 28px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 12, flexShrink: 0,
        }}>
          <div>
            <p style={{ fontSize: 10.5, color: C.muted, margin: 0, letterSpacing: '0.05em', textTransform: 'uppercase', fontFamily: FONT }}>Dashboards / QL Ops</p>
            <h1 style={{ fontSize: 17, fontWeight: 800, color: C.text, margin: '2px 0 0', letterSpacing: '-0.4px', fontFamily: FONT }}>
              Lead Qualification · {dateWindow ? dateWindow.label : (selMonth || '—')}
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* ── Date presets ──────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#F1F5F9', borderRadius: 9, padding: '3px' }}>
              {[['YTD','YTD'],['L7D','Last 7D'],['MTD','MTD']].map(([key,lbl2]) => (
                <button key={key} onClick={() => { setDatePreset(key); setShowCustom(false); setPage(0) }}
                  style={{
                    padding: '5px 11px', borderRadius: 7, border: 'none', cursor: 'pointer',
                    fontSize: 11.5, fontWeight: 700, fontFamily: FONT,
                    background: datePreset === key ? '#fff' : 'transparent',
                    color: datePreset === key ? C.navy : C.muted,
                    boxShadow: datePreset === key ? '0 1px 4px rgba(15,23,42,0.10)' : 'none',
                    transition: 'all .15s',
                  }}>{lbl2}</button>
              ))}
            </div>
            {/* Month picker */}
            {months.length > 0 && (
              <select value={selMonth} onChange={e => { setSelMonth(e.target.value); setDatePreset('month'); setShowCustom(false); setPage(0) }}
                style={{
                  padding: '6px 28px 6px 10px', borderRadius: 8, border: `0.5px solid ${datePreset==='month'?C.navy:C.border}`,
                  fontSize: 12, fontWeight: 600, fontFamily: FONT, background: '#fff',
                  color: datePreset==='month'?C.navy:C.text, cursor: 'pointer', outline: 'none', appearance: 'none',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%239CA3AF'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 9px center',
                }}>
                {[...months].reverse().map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            )}
            {/* Custom range */}
            <div style={{ position: 'relative' }}>
              <button onClick={() => { setShowCustom(v => !v) }}
                style={{
                  padding: '6px 11px', borderRadius: 8, border: `0.5px solid ${datePreset==='custom'?C.navy:C.border}`,
                  fontSize: 11.5, fontWeight: 600, fontFamily: FONT, cursor: 'pointer',
                  background: datePreset==='custom'?C.navyBg:'#fff', color: datePreset==='custom'?C.navy:C.sub,
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                {datePreset==='custom'&&customFrom?customFrom+' → '+customTo:'Custom'}
              </button>
              {showCustom && (
                <>
                  <div onClick={() => setShowCustom(false)} style={{ position: 'fixed', inset: 0, zIndex: 149 }} />
                  <div style={{
                    position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 200,
                    background: '#fff', border: `0.5px solid ${C.border}`, borderRadius: 12,
                    boxShadow: '0 14px 40px rgba(15,23,42,0.14)', padding: '16px 18px',
                    minWidth: 260, fontFamily: FONT,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>Custom date range</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {[['From', customFrom, setCustomFrom], ['To', customTo, setCustomTo]].map(([lbl3, val, setter]) => (
                        <div key={lbl3}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: C.sub, marginBottom: 4 }}>{lbl3}</div>
                          <input type="date" value={val} onChange={e => setter(e.target.value)}
                            style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: `0.5px solid ${C.border}`, fontSize: 12, fontFamily: FONT, outline: 'none', color: C.text, boxSizing: 'border-box' }} />
                        </div>
                      ))}
                      <button
                        onClick={() => { if (customFrom && customTo) { setDatePreset('custom'); setShowCustom(false); setPage(0) } }}
                        disabled={!customFrom || !customTo}
                        style={{
                          marginTop: 4, padding: '8px', borderRadius: 8, border: 'none',
                          background: customFrom && customTo ? C.navy : '#E5E7EB',
                          color: customFrom && customTo ? '#fff' : C.muted,
                          fontSize: 12, fontWeight: 700, fontFamily: FONT, cursor: customFrom && customTo ? 'pointer' : 'not-allowed',
                        }}>Apply range</button>
                    </div>
                  </div>
                </>
              )}
            </div>
            <SelBtn label="Provider" options={providers} value={selProvider} onChange={v => { setSelProvider(v); setPage(0) }} />
            <SelBtn label="Source"   options={sources}   value={selSource}   onChange={v => { setSelSource(v);   setPage(0) }} />
            {lastSync && <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>Synced {lastSync.toLocaleTimeString()}</span>}
            <button onClick={() => loadData(true)} disabled={loading} className="lqRefreshBtn"
              style={{
                padding: '6px 14px', borderRadius: 8, border: `0.5px solid ${C.border}`,
                fontSize: 12, fontWeight: 500, cursor: loading ? 'wait' : 'pointer',
                fontFamily: FONT, background: '#fff', color: '#374151',
                display: 'flex', alignItems: 'center', gap: 6, opacity: loading ? 0.65 : 1,
              }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                style={{ animation: loading ? 'spin .8s linear infinite' : 'none' }}>
                <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              {loading ? 'Refreshing' : 'Refresh'}
            </button>
            {/* Info popover */}
            <div style={{ position: 'relative' }}>
              <button onClick={() => setShowInfo(v => !v)}
                style={{
                  width: 30, height: 30, borderRadius: 8, border: `0.5px solid ${C.border}`,
                  background: showInfo ? C.navyBg : '#fff', color: C.navy,
                  fontSize: 14, fontWeight: 700, fontStyle: 'italic', fontFamily: 'Georgia,serif',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>i</button>
              {showInfo && <div onClick={() => setShowInfo(false)} style={{ position: 'fixed', inset: 0, zIndex: 150 }} />}
              {showInfo && (
                <div style={{
                  position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 200,
                  width: 340, background: '#fff', border: `0.5px solid ${C.border}`,
                  borderRadius: 12, boxShadow: '0 14px 40px rgba(15,23,42,0.16)',
                  padding: '16px 18px', fontFamily: FONT,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>How metrics are calculated</div>
                  {[
                    ['qualified_count', 'Leads processed by that provider from that campaign in that month that were marked as qualified.'],
                    ['Total Qualified', 'Sum of qualified_count across all providers and sources for the selected month.'],
                    ['Provider split', "Each provider's total as a share of the combined total (with MoM delta vs previous month)."],
                    ['Source bar', 'Qualified leads grouped by originating source, stacked per provider. Respects Provider + Source filters.'],
                    ['Provider donut', 'Futwork vs Superbot share of the full month (not filtered).'],
                    ['Trend', 'Total qualified per provider per calendar month across all history.'],
                    ['Top campaigns', 'Top 10 campaigns by qualified_count for selected filters.'],
                    ['MoM delta', '% change vs the immediately preceding month.'],
                  ].map(([m, d]) => (
                    <div key={m} style={{ display: 'flex', gap: 10, padding: '7px 0', borderTop: '0.5px solid #F3F4F6' }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: C.navy, width: 110, flexShrink: 0 }}>{m}</div>
                      <div style={{ fontSize: 11.5, color: C.sub, lineHeight: 1.5 }}>{d}</div>
                    </div>
                  ))}
                  <div style={{ marginTop: 10, padding: '10px 12px', background: C.navyBg, borderRadius: 8, fontSize: 11, color: C.navy, lineHeight: 1.5 }}>
                    <b>Filters:</b> Provider and Source dropdowns filter the source bar, top-campaigns chart and table. KPI cards and the trend always show the full month.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── BODY ─────────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
          {loading && rows.length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: 80, color: C.muted }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin .8s linear infinite' }}>
                <circle cx="12" cy="12" r="10" strokeOpacity=".2" /><path d="M12 2a10 10 0 0 1 10 10" stroke={C.blue} />
              </svg>
              <p style={{ marginTop: 12, fontSize: 13, fontFamily: FONT }}>Loading qualification data…</p>
            </div>
          ) : (
            <>
              {/* KPI ROW */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
                <KPICard label="Total Qualified" value={fmtN(totals.total)} sub={selMonth} delta={totals.totalDelta} accent={C.navy} />
                <KPICard label="Futwork"  value={fmtN(totals.fw)}  sub={pct(totals.fw, totals.total) + ' of total'} delta={totals.fwDelta}  accent={C.navy} />
                <KPICard label="Superbot" value={fmtN(totals.sb)}  sub={pct(totals.sb, totals.total) + ' of total'} delta={totals.sbDelta}  accent={C.blue} />
                <KPICard label="FW : SB Split"
                  value={totals.total > 0 ? pct(totals.fw, totals.total) + ' / ' + pct(totals.sb, totals.total) : '—'}
                  sub="Futwork share / Superbot share" accent={C.cyan} />
              </div>

              {/* SOURCE BAR + DONUT ROW */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16, marginBottom: 16 }}>

                {/* SOURCE STACKED BAR */}
                <Card
                  title="Qualified by source"
                  sub={selProvider !== 'All' || selSource !== 'All'
                    ? `Filtered · ${selProvider !== 'All' ? selProvider : 'All providers'} · ${selSource !== 'All' ? selSource : 'All sources'}`
                    : 'Stacked by provider · selected month'}
                >
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={sourceBar} margin={{ top: 8, right: 12, left: -8, bottom: 0 }} barCategoryGap="28%">
                      <XAxis
                        dataKey="source"
                        tick={{ fontSize: 11, fill: C.muted, fontFamily: FONT }}
                        axisLine={false} tickLine={false}
                        interval={0}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: C.muted, fontFamily: FONT }}
                        tickFormatter={v => fmtN(v)}
                        axisLine={false} tickLine={false}
                      />
                      <Tooltip content={<ChartTip />} cursor={{ fill: '#F1F5F9' }} />
                      <Bar dataKey="Futwork"  stackId="a" fill={C.navy} radius={[0, 0, 0, 0]} maxBarSize={52} />
                      <Bar dataKey="Superbot" stackId="a" fill={C.blue} radius={[5, 5, 0, 0]} maxBarSize={52} />
                    </BarChart>
                  </ResponsiveContainer>
                  <ChartLegend items={[{ name: 'Futwork', color: C.navy }, { name: 'Superbot', color: C.blue }]} />
                </Card>

                {/* DONUT */}
                <Card title="Provider share" sub="Full month · Futwork vs Superbot">
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 260 }}>
                    {provPie.length > 0 ? (
                      <>
                        <ResponsiveContainer width="100%" height={200}>
                          <PieChart>
                            <Pie
                              data={provPie} cx="50%" cy="50%"
                              innerRadius={68} outerRadius={95}
                              dataKey="value" startAngle={90} endAngle={-270}
                              isAnimationActive={false} strokeWidth={0}
                            >
                              {provPie.map((e, i) => <Cell key={i} fill={PROVIDER_COLORS[e.name] || C.muted} />)}
                            </Pie>
                            <Tooltip content={<ChartTip />} />
                          </PieChart>
                        </ResponsiveContainer>
                        {/* Provider breakdown pills */}
                        <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                          {provPie.map(p => (
                            <div key={p.name} style={{ textAlign: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'center' }}>
                                <div style={{ width: 8, height: 8, borderRadius: 2, background: PROVIDER_COLORS[p.name] }} />
                                <span style={{ fontSize: 11, fontWeight: 600, color: C.sub, fontFamily: FONT }}>{p.name}</span>
                              </div>
                              <div style={{ fontSize: 18, fontWeight: 800, color: C.text, letterSpacing: '-0.4px', fontFamily: FONT, lineHeight: 1.2 }}>{fmtN(p.value)}</div>
                              <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>{pct(p.value, totals.total)}</div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div style={{ color: C.muted, fontSize: 13, fontFamily: FONT }}>No data</div>
                    )}
                  </div>
                </Card>
              </div>

              {/* TREND */}
              <div style={{ marginBottom: 16 }}>
                <Card title="Month-on-month trend" sub="Total qualified per provider across all months">
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={trend} margin={{ top: 8, right: 24, left: -8, bottom: 0 }}>
                      <XAxis dataKey="month" tick={{ fontSize: 10.5, fill: C.muted, fontFamily: FONT }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: C.muted, fontFamily: FONT }} tickFormatter={v => fmtN(v)} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTip />} />
                      <Line type="monotone" dataKey="Futwork"  stroke={C.navy} strokeWidth={2.5} dot={{ r: 3.5, fill: C.navy, strokeWidth: 0 }} activeDot={{ r: 5 }} />
                      <Line type="monotone" dataKey="Superbot" stroke={C.blue} strokeWidth={2.5} dot={{ r: 3.5, fill: C.blue, strokeWidth: 0 }} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                  <ChartLegend items={[{ name: 'Futwork', color: C.navy }, { name: 'Superbot', color: C.blue }]} />
                </Card>
              </div>

              {/* TOP CAMPAIGNS */}
              <div style={{ marginBottom: 16 }}>
                <Card
                  title="Top 10 campaigns by qualified leads"
                  sub={selProvider !== 'All' || selSource !== 'All'
                    ? `Filtered · ${selProvider !== 'All' ? selProvider : 'All providers'} · ${selSource !== 'All' ? selSource : 'All sources'}`
                    : 'Selected month · coloured by provider'}
                >
                  {topCampaigns.length === 0
                    ? <div style={{ textAlign: 'center', padding: '32px 0', color: C.muted, fontSize: 13, fontFamily: FONT }}>No data for selected filters</div>
                    : (
                      <>
                        <ResponsiveContainer width="100%" height={Math.max(220, topCampaigns.length * 34)}>
                          <BarChart data={topCampaigns} layout="vertical" margin={{ top: 4, right: 56, left: 8, bottom: 4 }} barCategoryGap="22%">
                            <XAxis type="number" tick={{ fontSize: 10, fill: C.muted, fontFamily: FONT }} tickFormatter={v => fmtN(v)} axisLine={false} tickLine={false} />
                            <YAxis type="category" dataKey="campaign" tick={{ fontSize: 10.5, fill: C.sub, fontFamily: FONT }} width={248} axisLine={false} tickLine={false}
                              tickFormatter={v => v.length > 36 ? v.slice(0, 34) + '…' : v} />
                            <Tooltip content={<ChartTip />} cursor={{ fill: '#F1F5F9' }} />
                            <Bar dataKey="count" radius={[0, 5, 5, 0]} maxBarSize={22}>
                              {topCampaigns.map((e, i) => <Cell key={i} fill={PROVIDER_COLORS[e.provider] || C.muted} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                        <ChartLegend items={Object.entries(PROVIDER_COLORS).map(([n, c]) => ({ name: n, color: c }))} />
                      </>
                    )
                  }
                </Card>
              </div>

              {/* CAMPAIGN TABLE */}
              <Card
                title="Campaign breakdown"
                sub={`${tableRows.length.toLocaleString()} rows · ${selMonth}${selProvider !== 'All' ? ' · ' + selProvider : ''}${selSource !== 'All' ? ' · ' + selSource : ''}`}
                action={
                  <div style={{ position: 'relative' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                    </svg>
                    <input value={search} onChange={e => onSearch(e.target.value)} placeholder="Search campaign, source…"
                      style={{ paddingLeft: 30, paddingRight: 10, paddingTop: 6, paddingBottom: 6, borderRadius: 8, border: `0.5px solid ${C.border}`, fontSize: 12, fontFamily: FONT, outline: 'none', width: 220, color: C.text }} />
                  </div>
                }
                noPad
              >
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>
                        {[['campaign', 'Campaign'], ['provider', 'Provider'], ['source', 'Source'], ['sub_source', 'Sub-source'], ['count', 'Qualified']].map(([col, lbl]) => (
                          <th key={col} style={thS(col)} onClick={() => sortBy(col)}>
                            {lbl} <span style={{ opacity: sortCol === col ? 1 : 0.3, fontSize: 9 }}>{sortCol === col ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((r, i) => (
                        <tr key={i} style={{ borderBottom: `0.5px solid #F3F4F6`, background: i % 2 ? '#FAFBFC' : '#fff', transition: 'background .1s' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#F0F7FF'}
                          onMouseLeave={e => e.currentTarget.style.background = i % 2 ? '#FAFBFC' : '#fff'}>
                          <td style={{ padding: '10px 12px', color: C.text, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: FONT }} title={r.campaign}>{r.campaign || '—'}</td>
                          <td style={{ padding: '10px 12px', fontFamily: FONT }}>
                            <span style={{
                              fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
                              background: r.provider === 'Futwork' ? C.navyBg : C.blueBg,
                              color: r.provider === 'Futwork' ? C.navy : C.blue,
                            }}>{r.provider}</span>
                          </td>
                          <td style={{ padding: '10px 12px', color: C.sub, fontFamily: FONT }}>{r.source}</td>
                          <td style={{ padding: '10px 12px', color: C.muted, fontSize: 11, fontFamily: FONT }}>{r.sub_source || '—'}</td>
                          <td style={{ padding: '10px 12px', fontWeight: 700, color: C.text, textAlign: 'right', fontFamily: FONT, paddingRight: 20 }}>{r.count.toLocaleString('en-IN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '14px 12px 12px', borderTop: `0.5px solid ${C.border}`,
                    }}>
                      <span style={{ fontSize: 11.5, color: C.muted, fontFamily: FONT }}>
                        {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, tableRows.length)} of {tableRows.length.toLocaleString()} rows
                      </span>
                      <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                        <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                          style={{ padding: '5px 13px', borderRadius: 8, border: `0.5px solid ${C.border}`, background: '#fff', fontSize: 12, fontWeight: 600, fontFamily: FONT, cursor: page === 0 ? 'not-allowed' : 'pointer', opacity: page === 0 ? 0.35 : 1, color: C.text }}>
                          ← Prev
                        </button>
                        {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                          const start = Math.max(0, Math.min(page - 3, totalPages - 7)); const p = start + i
                          return (
                            <button key={p} onClick={() => setPage(p)}
                              style={{
                                width: 32, height: 32, borderRadius: 8,
                                border: `0.5px solid ${p === page ? C.navy : C.border}`,
                                background: p === page ? C.navy : '#fff',
                                color: p === page ? '#fff' : C.text,
                                fontSize: 12, fontWeight: p === page ? 700 : 400,
                                fontFamily: FONT, cursor: 'pointer',
                              }}>{p + 1}</button>
                          )
                        })}
                        <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
                          style={{ padding: '5px 13px', borderRadius: 8, border: `0.5px solid ${C.border}`, background: '#fff', fontSize: 12, fontWeight: 600, fontFamily: FONT, cursor: page === totalPages - 1 ? 'not-allowed' : 'pointer', opacity: page === totalPages - 1 ? 0.35 : 1, color: C.text }}>
                          Next →
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
