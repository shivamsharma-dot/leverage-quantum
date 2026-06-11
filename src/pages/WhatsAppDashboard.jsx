import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, Cell, PieChart, Pie
} from 'recharts'
import Sidebar from '../components/Sidebar'

const SHEET_CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRVF7R3Me4QPVaRS_n_OufcMrrgYvCt3Rs7yJUG0u4gEMd0cVL9IyP2aV6J8HDjOZrvWzcemgHwZaHs/pub?gid=1222628502&single=true&output=csv'

const C = {
  navy:'#1F3C84', blue:'#1C9FD4', cyan:'#29B9C3', green:'#4CAE6F',
  amber:'#F59E0B', navyBg:'#E8EFF9', blueBg:'#E3F5FD', cyanBg:'#E4F8F9', greenBg:'#E9F8EF',
  border:'#E5E7EB', text:'#0F172A', muted:'#94A3B8', sub:'#475569', bg:'#F4F6F9',
}
const FONT = "'Plus Jakarta Sans','Inter',sans-serif"
const PAGE_SIZE = 10

// ── flexible column finder ───────────────────────────────────────────────────
function findCol(headers, candidates) {
  const h = headers.map(x => x.toLowerCase().trim())
  for (const c of candidates) {
    const i = h.findIndex(x => x.includes(c.toLowerCase()))
    if (i >= 0) return i
  }
  return -1
}

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
  const [rawHdr, ...data] = rows
  const headers = rawHdr

  // flexible column mapping
  const cols = {
    date:       findCol(headers, ['date','day','when']),
    month:      findCol(headers, ['month','mon']),
    phone:      findCol(headers, ['phone','number','from','sender','wa_number']),
    campaign:   findCol(headers, ['campaign','template','name','message_name']),
    sent:       findCol(headers, ['sent','total_sent','messages_sent','send']),
    delivered:  findCol(headers, ['delivered','delivery']),
    read:       findCol(headers, ['read','opened','open']),
    clicked:    findCol(headers, ['clicked','clicks','click']),
    cost:       findCol(headers, ['cost','spend','amount','charge','price']),
    source:     findCol(headers, ['source','channel','type']),
  }

  const parsed = data.filter(r => r.some(c => c)).map(r => {
    const g = i => (i >= 0 && i < r.length) ? r[i] : ''
    const gn = i => parseFloat(g(i)) || 0
    // derive month from date if month col missing
    let month = g(cols.month)
    if (!month && cols.date >= 0) {
      const d = new Date(g(cols.date))
      if (!isNaN(d)) month = d.toLocaleString('default', { month: 'short', year: 'numeric' })
    }
    const sent      = gn(cols.sent)
    const delivered = gn(cols.delivered)
    const read      = gn(cols.read)
    const clicked   = gn(cols.clicked)
    const cost      = gn(cols.cost)
    return {
      date:       g(cols.date) || month,
      month:      month || g(cols.date),
      phone:      g(cols.phone) || 'Unknown',
      campaign:   g(cols.campaign) || 'Unknown',
      source:     g(cols.source) || 'WhatsApp',
      sent, delivered, read, clicked, cost,
      deliveryRate: sent > 0 ? (delivered / sent * 100) : 0,
      readRate:     delivered > 0 ? (read / delivered * 100) : sent > 0 ? (read / sent * 100) : 0,
      ctr:          sent > 0 ? (clicked / sent * 100) : 0,
      cpc:          clicked > 0 ? cost / clicked : 0,
    }
  })

  return { parsed, headers, cols }
}

function fmtN(n) { if (!n && n !== 0) return '—'; return Math.round(n).toLocaleString('en-IN') }
function fmtC(n) { if (!n) return '—'; if (n >= 1e7) return '₹' + (n/1e7).toFixed(2) + ' Cr'; if (n >= 1e5) return '₹' + (n/1e5).toFixed(1) + 'L'; if (n >= 1000) return '₹' + (n/1e3).toFixed(1) + 'K'; return '₹' + Math.round(n).toLocaleString('en-IN') }
function pct(n) { if (!n && n !== 0) return '—'; return n.toFixed(1) + '%' }

// ── shared UI ────────────────────────────────────────────────────────────────
const KPICard = ({ label, value, sub, accent = C.navy, delta }) => (
  <div style={{ background: '#fff', border: `0.5px solid ${C.border}`, borderRadius: 12, padding: '18px 20px', borderTop: `3px solid ${accent}`, boxShadow: '0 1px 4px rgba(15,23,42,0.04)' }}>
    <div style={{ fontSize: 9.5, fontWeight: 700, color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8, fontFamily: FONT }}>{label}</div>
    <div style={{ fontSize: 26, fontWeight: 800, color: C.text, letterSpacing: '-0.8px', lineHeight: 1, fontFamily: FONT }}>{value}</div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7, minHeight: 20 }}>
      {sub && <div style={{ fontSize: 11.5, color: C.muted, fontFamily: FONT }}>{sub}</div>}
      {delta != null && <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: delta >= 0 ? C.greenBg : '#FEF2F2', color: delta >= 0 ? '#059669' : '#DC2626', fontFamily: FONT }}>{delta >= 0 ? '▲' : '▼'}{Math.abs(delta).toFixed(1)}%</span>}
    </div>
  </div>
)

const Card = ({ title, sub, children, action, noPad }) => (
  <div style={{ background: '#fff', border: `0.5px solid ${C.border}`, borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(15,23,42,0.04)' }}>
    <div style={{ padding: '14px 20px 12px', borderBottom: '0.5px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: FONT }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 2, fontFamily: FONT }}>{sub}</div>}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
    <div style={noPad ? {} : { padding: '16px 20px' }}>{children}</div>
  </div>
)

const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#fff', border: `0.5px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', fontSize: 12, fontFamily: FONT, boxShadow: '0 8px 24px rgba(15,23,42,0.12)' }}>
      {label && <div style={{ fontWeight: 700, color: C.text, marginBottom: 7 }}>{label}</div>}
      {payload.map(p => (
        <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: p.color, flexShrink: 0 }} />
          <span style={{ color: C.sub }}>{p.name}</span>
          <span style={{ fontWeight: 700, color: C.text, marginLeft: 'auto', paddingLeft: 12 }}>{typeof p.value === 'number' ? fmtN(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  )
}

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

const Dropdown = ({ options, value, onChange, label, minWidth = 120 }) => {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef(null)
  React.useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} ref={ref}>
      {label && <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT, whiteSpace: 'nowrap' }}>{label}</span>}
      <div style={{ position: 'relative' }}>
        <button onClick={() => setOpen(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px 6px 12px', borderRadius: 8, border: `0.5px solid ${open ? C.navy : C.border}`, background: open ? C.navyBg : '#fff', color: C.text, cursor: 'pointer', fontFamily: FONT, fontSize: 12, fontWeight: 600, minWidth, boxShadow: open ? `0 0 0 3px rgba(31,60,132,0.08)` : 'none', transition: 'all .15s', whiteSpace: 'nowrap' }}>
          <span style={{ flex: 1, textAlign: 'left' }}>{value}</span>
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ flexShrink: 0, transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
            <path d="M1 1l4 4 4-4" stroke={C.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {open && (
          <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 500, background: '#fff', border: `0.5px solid ${C.border}`, borderRadius: 12, boxShadow: '0 16px 40px rgba(15,23,42,0.14)', padding: '6px', minWidth: Math.max(minWidth, 150), maxHeight: 280, overflowY: 'auto', scrollbarWidth: 'none' }}>
            {options.map(opt => (
              <button key={opt} onClick={() => { onChange(opt); setOpen(false) }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: FONT, fontSize: 12.5, fontWeight: opt === value ? 700 : 400, background: opt === value ? C.navyBg : 'transparent', color: opt === value ? C.navy : C.text, transition: 'background .1s' }}
                onMouseEnter={e => { if (opt !== value) e.currentTarget.style.background = '#F8FAFC' }}
                onMouseLeave={e => { if (opt !== value) e.currentTarget.style.background = 'transparent' }}>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  {opt}
                  {opt === value && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.navy} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── main dashboard ────────────────────────────────────────────────────────────
export default function WhatsAppDashboard() {
  const [rows, setRows]               = useState([])
  const [months, setMonths]           = useState([])
  const [monthMap, setMonthMap]       = useState({})
  const [detectedCols, setDetectedCols] = useState({})
  const [headers, setHeaders]         = useState([])
  const [selMonth, setSelMonth]       = useState('')
  const [selPhone, setSelPhone]       = useState('All')
  const [selCampaign, setSelCampaign] = useState('All')
  const [loading, setLoading]         = useState(true)
  const [lastSync, setLastSync]       = useState(null)
  const [search, setSearch]           = useState('')
  const [sortCol, setSortCol]         = useState('sent')
  const [sortDir, setSortDir]         = useState('desc')
  const [page, setPage]               = useState(0)
  const [showInfo, setShowInfo]       = useState(false)

  const loadData = useCallback(async (bust = false) => {
    setLoading(true)
    const t0 = Date.now()
    try {
      const url = bust ? SHEET_CSV + '&_=' + Date.now() : SHEET_CSV
      const res = await fetch(url)
      const csv = await res.text()
      const { parsed, headers: hdrs, cols } = parseCSV(csv)
      setRows(parsed)
      setHeaders(hdrs)
      setDetectedCols(cols)
      const mm = {}
      parsed.forEach(r => { if (r.month && r.date && (!mm[r.month] || r.date < mm[r.month])) mm[r.month] = r.date })
      const ms = [...new Set(parsed.map(r => r.month))].filter(Boolean)
        .sort((a, b) => new Date(mm[a] || 0) - new Date(mm[b] || 0))
      setMonths(ms)
      setMonthMap(mm)
      setSelMonth(prev => prev || ms[ms.length - 1] || '')
      setLastSync(new Date())
    } catch (e) { console.error('WA fetch', e) }
    finally { setTimeout(() => setLoading(false), Math.max(0, 750 - (Date.now() - t0))) }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const monthRows  = useMemo(() => rows.filter(r => r.month === selMonth), [rows, selMonth])
  const phones     = useMemo(() => ['All', ...[...new Set(monthRows.map(r => r.phone))].filter(Boolean).sort()], [monthRows])
  const campaigns  = useMemo(() => ['All', ...[...new Set(monthRows.map(r => r.campaign))].filter(Boolean).sort()], [monthRows])
  const filtered   = useMemo(() => monthRows.filter(r =>
    (selPhone === 'All' || r.phone === selPhone) &&
    (selCampaign === 'All' || r.campaign === selCampaign)
  ), [monthRows, selPhone, selCampaign])

  const totals = useMemo(() => {
    const sum = (k) => filtered.reduce((s, r) => s + (r[k] || 0), 0)
    const sent = sum('sent'), delivered = sum('delivered'), read = sum('read'), clicked = sum('clicked'), cost = sum('cost')
    const prevM = months[months.indexOf(selMonth) - 1]
    const prevRows = prevM ? rows.filter(r => r.month === prevM) : []
    const prevSent = prevRows.reduce((s, r) => s + r.sent, 0)
    const prevCost = prevRows.reduce((s, r) => s + r.cost, 0)
    const sentDelta = prevSent > 0 ? ((sent - prevSent) / prevSent * 100) : null
    const costDelta = prevCost > 0 ? ((cost - prevCost) / prevCost * 100) : null
    return {
      sent, delivered, read, clicked, cost,
      deliveryRate: sent > 0 ? (delivered / sent * 100) : 0,
      readRate:     sent > 0 ? (read / sent * 100) : 0,
      ctr:          sent > 0 ? (clicked / sent * 100) : 0,
      cpc:          clicked > 0 ? cost / clicked : 0,
      sentDelta, costDelta,
    }
  }, [filtered, rows, months, selMonth])

  // funnel bar data
  const funnelData = useMemo(() => {
    if (!totals.sent) return []
    return [
      { label: 'Sent',      value: totals.sent,      fill: C.navy  },
      { label: 'Delivered', value: totals.delivered,  fill: C.blue  },
      { label: 'Read',      value: totals.read,       fill: C.cyan  },
      { label: 'Clicked',   value: totals.clicked,    fill: C.green },
    ].filter(d => d.value > 0)
  }, [totals])

  // by-phone bar
  const phoneBar = useMemo(() => {
    const map = {}
    filtered.forEach(r => {
      if (!map[r.phone]) map[r.phone] = { phone: r.phone, sent: 0, clicked: 0, cost: 0 }
      map[r.phone].sent    += r.sent
      map[r.phone].clicked += r.clicked
      map[r.phone].cost    += r.cost
    })
    return Object.values(map).sort((a, b) => b.sent - a.sent).slice(0, 8)
  }, [filtered])

  // trend
  const trend = useMemo(() => months.map(m => {
    const mr = rows.filter(r => r.month === m)
    return { month: m, Sent: mr.reduce((s, r) => s + r.sent, 0), Clicked: mr.reduce((s, r) => s + r.clicked, 0), Cost: mr.reduce((s, r) => s + r.cost, 0) }
  }), [rows, months])

  // top campaigns
  const topCampaigns = useMemo(() => {
    const map = {}
    filtered.forEach(r => {
      if (!map[r.campaign]) map[r.campaign] = { campaign: r.campaign, sent: 0, clicked: 0, cost: 0 }
      map[r.campaign].sent    += r.sent
      map[r.campaign].clicked += r.clicked
      map[r.campaign].cost    += r.cost
    })
    return Object.values(map).sort((a, b) => b.sent - a.sent).slice(0, 10)
  }, [filtered])

  // table
  const tableRows = useMemo(() => {
    const q = search.toLowerCase()
    return filtered
      .filter(r => !q || r.campaign.toLowerCase().includes(q) || r.phone.toLowerCase().includes(q))
      .sort((a, b) => {
        const av = a[sortCol] ?? 0, bv = b[sortCol] ?? 0
        if (typeof av === 'number') return sortDir === 'desc' ? bv - av : av - bv
        return sortDir === 'desc' ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv))
      })
  }, [filtered, search, sortCol, sortDir])

  const totalPages = Math.ceil(tableRows.length / PAGE_SIZE)
  const pageRows   = tableRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const sortBy     = col => { setSortCol(col); setSortDir(d => sortCol === col ? (d === 'desc' ? 'asc' : 'desc') : 'desc'); setPage(0) }
  const onSearch   = v => { setSearch(v); setPage(0) }

  // has data for a given metric?
  const hasSent      = rows.some(r => r.sent > 0)
  const hasDelivered = rows.some(r => r.delivered > 0)
  const hasRead      = rows.some(r => r.read > 0)
  const hasClicked   = rows.some(r => r.clicked > 0)
  const hasCost      = rows.some(r => r.cost > 0)

  const thS = col => ({ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase', padding: '10px 12px', cursor: 'pointer', userSelect: 'none', fontFamily: FONT, whiteSpace: 'nowrap', background: sortCol === col ? '#F8FAFF' : 'transparent', borderBottom: `0.5px solid ${C.border}` })

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.bg, fontFamily: FONT }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* HEADER */}
        <div style={{ background: '#fff', borderBottom: `0.5px solid ${C.border}`, padding: '11px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
          <div>
            <p style={{ fontSize: 10.5, color: C.muted, margin: 0, letterSpacing: '0.05em', textTransform: 'uppercase', fontFamily: FONT }}>Dashboards / WhatsApp</p>
            <h1 style={{ fontSize: 17, fontWeight: 800, color: C.text, margin: '2px 0 0', letterSpacing: '-0.4px', fontFamily: FONT }}>
              WhatsApp Spend · {selMonth || '—'}
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {months.length > 0 && (
              <Dropdown options={[...months].reverse()} value={selMonth} minWidth={110}
                onChange={v => { setSelMonth(v); setPage(0) }} />
            )}
            <Dropdown label="Phone" options={phones} value={selPhone} minWidth={120}
              onChange={v => { setSelPhone(v); setPage(0) }} />
            <Dropdown label="Campaign" options={campaigns} value={selCampaign} minWidth={130}
              onChange={v => { setSelCampaign(v); setPage(0) }} />
            {lastSync && <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>Synced {lastSync.toLocaleTimeString()}</span>}
            <button onClick={() => loadData(true)} disabled={loading} className="lqRefreshBtn"
              style={{ padding: '6px 14px', borderRadius: 8, border: `0.5px solid ${C.border}`, fontSize: 12, fontWeight: 500, cursor: loading ? 'wait' : 'pointer', fontFamily: FONT, background: '#fff', color: '#374151', display: 'flex', alignItems: 'center', gap: 6, opacity: loading ? 0.65 : 1 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: loading ? 'spin .8s linear infinite' : 'none' }}>
                <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              {loading ? 'Refreshing' : 'Refresh'}
            </button>
            {/* Info */}
            <div style={{ position: 'relative' }}>
              <button onClick={() => setShowInfo(v => !v)}
                style={{ width: 30, height: 30, borderRadius: 8, border: `0.5px solid ${C.border}`, background: showInfo ? C.navyBg : '#fff', color: C.navy, fontSize: 14, fontWeight: 700, fontStyle: 'italic', fontFamily: 'Georgia,serif', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>i</button>
              {showInfo && <div onClick={() => setShowInfo(false)} style={{ position: 'fixed', inset: 0, zIndex: 150 }} />}
              {showInfo && (
                <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 200, width: 360, background: '#fff', border: `0.5px solid ${C.border}`, borderRadius: 12, boxShadow: '0 14px 40px rgba(15,23,42,0.16)', padding: '16px 18px', fontFamily: FONT }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>How metrics are calculated</div>
                  {[
                    ['Sent',          'Total WhatsApp messages dispatched in the selected period.'],
                    ['Delivered',     'Messages confirmed received by the recipient\'s device.'],
                    ['Read',          'Messages opened/read by the recipient.'],
                    ['Clicked',       'Recipients who clicked any link in the message.'],
                    ['Cost / Spend',  'Total WhatsApp marketing spend for the selected filters.'],
                    ['Delivery Rate', 'Delivered ÷ Sent × 100'],
                    ['Read Rate',     'Read ÷ Sent × 100'],
                    ['CTR',           'Clicked ÷ Sent × 100 (click-through rate)'],
                    ['CPC',           'Cost ÷ Clicked (cost per click)'],
                    ['Funnel chart',  'Visual drop-off from Sent → Delivered → Read → Clicked.'],
                    ['MoM delta',     '% change vs the immediately preceding month.'],
                  ].map(([m, d]) => (
                    <div key={m} style={{ display: 'flex', gap: 10, padding: '7px 0', borderTop: '0.5px solid #F3F4F6' }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: C.navy, width: 100, flexShrink: 0 }}>{m}</div>
                      <div style={{ fontSize: 11.5, color: C.sub, lineHeight: 1.5 }}>{d}</div>
                    </div>
                  ))}
                  {headers.length > 0 && (
                    <div style={{ marginTop: 10, padding: '10px 12px', background: '#F8FAFF', borderRadius: 8, fontSize: 11, color: C.sub, lineHeight: 1.5 }}>
                      <b style={{ color: C.navy }}>Detected columns:</b> {headers.join(', ')}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* BODY */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
          {loading && rows.length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: 80, color: C.muted }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin .8s linear infinite' }}>
                <circle cx="12" cy="12" r="10" strokeOpacity=".2" /><path d="M12 2a10 10 0 0 1 10 10" stroke={C.green} />
              </svg>
              <p style={{ marginTop: 12, fontSize: 13, fontFamily: FONT }}>Loading WhatsApp data…</p>
            </div>
          ) : rows.length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: 80, color: C.muted, fontSize: 13, fontFamily: FONT }}>
              No data found. Check the sheet URL or column headers.
            </div>
          ) : (
            <>
              {/* KPI ROW */}
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${[hasSent,hasCost,hasDelivered||hasRead,hasClicked].filter(Boolean).length + 1},1fr)`, gap: 14, marginBottom: 20 }}>
                {hasSent      && <KPICard label="Messages Sent"   value={fmtN(totals.sent)}       sub={selMonth} delta={totals.sentDelta}  accent={C.navy} />}
                {hasCost      && <KPICard label="Total Spend"     value={fmtC(totals.cost)}        sub="WhatsApp marketing" delta={totals.costDelta} accent={C.green} />}
                {hasDelivered && <KPICard label="Delivery Rate"   value={pct(totals.deliveryRate)} sub={`${fmtN(totals.delivered)} delivered`} accent={C.blue} />}
                {hasRead      && <KPICard label="Read Rate"       value={pct(totals.readRate)}     sub={`${fmtN(totals.read)} read`}      accent={C.cyan} />}
                {hasClicked   && <KPICard label="CTR"             value={pct(totals.ctr)}          sub={`${fmtN(totals.clicked)} clicked · CPC ${fmtC(totals.cpc)}`} accent={C.amber} />}
              </div>

              {/* FUNNEL + TREND */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16, marginBottom: 16 }}>
                <Card title="Message funnel" sub="Drop-off from sent to clicked · selected month">
                  {funnelData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={funnelData} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.muted, fontFamily: FONT }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: C.muted, fontFamily: FONT }} tickFormatter={v => fmtN(v)} axisLine={false} tickLine={false} />
                        <Tooltip content={<ChartTip />} cursor={{ fill: '#F1F5F9' }} />
                        <Bar dataKey="value" radius={[5, 5, 0, 0]} maxBarSize={64}>
                          {funnelData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <div style={{ textAlign: 'center', padding: '40px 0', color: C.muted, fontSize: 13, fontFamily: FONT }}>No funnel data available</div>}
                </Card>

                <Card title="Month-on-month trend" sub="Sent and clicked across all months">
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={trend} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                      <XAxis dataKey="month" tick={{ fontSize: 10.5, fill: C.muted, fontFamily: FONT }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: C.muted, fontFamily: FONT }} tickFormatter={v => fmtN(v)} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTip />} />
                      <Line type="monotone" dataKey="Sent"    stroke={C.navy}  strokeWidth={2.5} dot={{ r: 3.5, fill: C.navy,  strokeWidth: 0 }} activeDot={{ r: 5 }} />
                      {hasClicked && <Line type="monotone" dataKey="Clicked" stroke={C.green} strokeWidth={2.5} dot={{ r: 3.5, fill: C.green, strokeWidth: 0 }} activeDot={{ r: 5 }} />}
                    </LineChart>
                  </ResponsiveContainer>
                  <ChartLegend items={[{ name: 'Sent', color: C.navy }, ...(hasClicked ? [{ name: 'Clicked', color: C.green }] : [])]} />
                </Card>
              </div>

              {/* BY PHONE */}
              {phoneBar.length > 1 && (
                <div style={{ marginBottom: 16 }}>
                  <Card title="By phone number" sub="Messages sent per sender number · top 8">
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={phoneBar} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 4 }} barCategoryGap="20%">
                        <XAxis type="number" tick={{ fontSize: 10, fill: C.muted, fontFamily: FONT }} tickFormatter={v => fmtN(v)} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="phone" tick={{ fontSize: 10.5, fill: C.sub, fontFamily: FONT }} width={160} axisLine={false} tickLine={false} />
                        <Tooltip content={<ChartTip />} cursor={{ fill: '#F1F5F9' }} />
                        <Bar dataKey="sent" fill={C.navy} radius={[0, 5, 5, 0]} maxBarSize={20} name="Sent" />
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                </div>
              )}

              {/* TOP CAMPAIGNS */}
              <div style={{ marginBottom: 16 }}>
                <Card title="Top 10 campaigns by messages sent" sub="Selected month · filtered">
                  {topCampaigns.length === 0
                    ? <div style={{ textAlign: 'center', padding: '32px 0', color: C.muted, fontSize: 13, fontFamily: FONT }}>No data</div>
                    : (
                      <ResponsiveContainer width="100%" height={Math.max(220, topCampaigns.length * 34)}>
                        <BarChart data={topCampaigns} layout="vertical" margin={{ top: 4, right: 56, left: 8, bottom: 4 }} barCategoryGap="22%">
                          <XAxis type="number" tick={{ fontSize: 10, fill: C.muted, fontFamily: FONT }} tickFormatter={v => fmtN(v)} axisLine={false} tickLine={false} />
                          <YAxis type="category" dataKey="campaign" tick={{ fontSize: 10.5, fill: C.sub, fontFamily: FONT }} width={248} axisLine={false} tickLine={false}
                            tickFormatter={v => v.length > 36 ? v.slice(0, 34) + '…' : v} />
                          <Tooltip content={<ChartTip />} cursor={{ fill: '#F1F5F9' }} />
                          <Bar dataKey="sent" fill={C.navy} radius={[0, 5, 5, 0]} maxBarSize={22} name="Sent" />
                          {hasClicked && <Bar dataKey="clicked" fill={C.green} radius={[0, 5, 5, 0]} maxBarSize={22} name="Clicked" />}
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                </Card>
              </div>

              {/* TABLE */}
              <Card title="Campaign breakdown" noPad
                sub={`${tableRows.length.toLocaleString()} rows · ${selMonth}${selPhone !== 'All' ? ' · ' + selPhone : ''}${selCampaign !== 'All' ? ' · ' + selCampaign : ''}`}
                action={
                  <div style={{ position: 'relative' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                    </svg>
                    <input value={search} onChange={e => onSearch(e.target.value)} placeholder="Search campaign or phone…"
                      style={{ paddingLeft: 30, paddingRight: 10, paddingTop: 6, paddingBottom: 6, borderRadius: 8, border: `0.5px solid ${C.border}`, fontSize: 12, fontFamily: FONT, outline: 'none', width: 220, color: C.text }} />
                  </div>
                }>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>
                        {[
                          ['campaign','Campaign'], ['phone','Phone'],
                          ...(hasSent      ? [['sent','Sent']]           : []),
                          ...(hasDelivered ? [['delivered','Delivered']] : []),
                          ...(hasRead      ? [['read','Read']]           : []),
                          ...(hasClicked   ? [['clicked','Clicked']]     : []),
                          ...(hasCost      ? [['cost','Cost']]           : []),
                        ].map(([col, lbl]) => (
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
                          <td style={{ padding: '10px 12px', color: C.text, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: FONT }} title={r.campaign}>{r.campaign || '—'}</td>
                          <td style={{ padding: '10px 12px', color: C.sub, fontFamily: FONT, whiteSpace: 'nowrap' }}>{r.phone || '—'}</td>
                          {hasSent      && <td style={{ padding: '10px 12px', fontWeight: 600, color: C.text,  textAlign: 'right', fontFamily: FONT, paddingRight: 16 }}>{fmtN(r.sent)}</td>}
                          {hasDelivered && <td style={{ padding: '10px 12px', color: C.sub,  textAlign: 'right', fontFamily: FONT, paddingRight: 16 }}>{fmtN(r.delivered)}</td>}
                          {hasRead      && <td style={{ padding: '10px 12px', color: C.sub,  textAlign: 'right', fontFamily: FONT, paddingRight: 16 }}>{fmtN(r.read)}</td>}
                          {hasClicked   && <td style={{ padding: '10px 12px', color: C.green, fontWeight: 700, textAlign: 'right', fontFamily: FONT, paddingRight: 16 }}>{fmtN(r.clicked)}</td>}
                          {hasCost      && <td style={{ padding: '10px 12px', fontWeight: 700, color: C.text,  textAlign: 'right', fontFamily: FONT, paddingRight: 20 }}>{fmtC(r.cost)}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {totalPages > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 12px 12px', borderTop: `0.5px solid ${C.border}` }}>
                      <span style={{ fontSize: 11.5, color: C.muted, fontFamily: FONT }}>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, tableRows.length)} of {tableRows.length.toLocaleString()} rows</span>
                      <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                        <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                          style={{ padding: '5px 13px', borderRadius: 8, border: `0.5px solid ${C.border}`, background: '#fff', fontSize: 12, fontWeight: 600, fontFamily: FONT, cursor: page === 0 ? 'not-allowed' : 'pointer', opacity: page === 0 ? 0.35 : 1, color: C.text }}>← Prev</button>
                        {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                          const start = Math.max(0, Math.min(page - 3, totalPages - 7)); const p = start + i
                          return <button key={p} onClick={() => setPage(p)}
                            style={{ width: 32, height: 32, borderRadius: 8, border: `0.5px solid ${p === page ? C.navy : C.border}`, background: p === page ? C.navy : '#fff', color: p === page ? '#fff' : C.text, fontSize: 12, fontWeight: p === page ? 700 : 400, fontFamily: FONT, cursor: 'pointer' }}>{p + 1}</button>
                        })}
                        <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
                          style={{ padding: '5px 13px', borderRadius: 8, border: `0.5px solid ${C.border}`, background: '#fff', fontSize: 12, fontWeight: 600, fontFamily: FONT, cursor: page === totalPages - 1 ? 'not-allowed' : 'pointer', opacity: page === totalPages - 1 ? 0.35 : 1, color: C.text }}>Next →</button>
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
