import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, Cell
} from 'recharts'
import Sidebar from '../components/Sidebar'

// ── UPDATE THIS URL once the sheet is published ──────────────────────────────
// File → Share → Publish to web → "whatsapp" tab → CSV → copy URL here
const SHEET_CSV = 'WHATSAPP_SHEET_CSV_URL'

const C = {
  navy:'#1F3C84', blue:'#1C9FD4', cyan:'#29B9C3', green:'#4CAE6F',
  amber:'#F59E0B', navyBg:'#E8EFF9', blueBg:'#E3F5FD', cyanBg:'#E4F8F9', greenBg:'#E9F8EF',
  border:'#E5E7EB', text:'#0F172A', muted:'#94A3B8', sub:'#475569', bg:'#F4F6F9',
}
const FONT     = "'Plus Jakarta Sans','Inter',sans-serif"
const PAGE_SIZE = 10

// ── Schema (exact columns from sheet) ────────────────────────────────────────
// submitted_date | template_name | delivered | utility_spends | promotional_spends

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
  const h = k => hdr.map(x => x.toLowerCase().trim()).indexOf(k.toLowerCase())

  return data.filter(r => r.some(c => c)).map(r => {
    const g  = k => { const i=h(k); return i>=0 ? r[i] : '' }
    const gn = k => parseFloat(g(k)) || 0

    const date      = g('submitted_date')
    const delivered = gn('delivered')
    const utility   = gn('utility_spends')
    const promo     = gn('promotional_spends')
    const total_spend = utility + promo

    // derive month from date
    let month = ''
    if (date) {
      const d = new Date(date)
      if (!isNaN(d)) month = d.toLocaleString('default', { month: 'short', year: 'numeric' })
    }

    return {
      date,
      month,
      template:       g('template_name'),
      delivered,
      utility_spend:  utility,
      promo_spend:    promo,
      total_spend,
      cpm: delivered > 0 ? (total_spend / delivered * 1000) : 0, // cost per 1000 delivered
    }
  })
}

function fmtN(n) { if (!n && n !== 0) return '—'; return Math.round(n).toLocaleString('en-IN') }
function fmtC(n) { if (!n) return '—'; if (n >= 1e7) return '₹'+(n/1e7).toFixed(2)+' Cr'; if (n >= 1e5) return '₹'+(n/1e5).toFixed(1)+'L'; if (n >= 1000) return '₹'+(n/1e3).toFixed(1)+'K'; return '₹'+Math.round(n).toLocaleString('en-IN') }
function fmtC2(n) { if (!n) return '—'; return '₹'+n.toFixed(2) }

// ── Shared UI ────────────────────────────────────────────────────────────────
const KPICard = ({ label, value, sub, accent = C.navy, delta }) => (
  <div style={{ background:'#fff', border:`0.5px solid ${C.border}`, borderRadius:12, padding:'18px 20px', borderTop:`3px solid ${accent}`, boxShadow:'0 1px 4px rgba(15,23,42,0.04)' }}>
    <div style={{ fontSize:9.5, fontWeight:700, color:C.muted, letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:8, fontFamily:FONT }}>{label}</div>
    <div style={{ fontSize:26, fontWeight:800, color:C.text, letterSpacing:'-0.8px', lineHeight:1, fontFamily:FONT }}>{value}</div>
    <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:7, minHeight:20 }}>
      {sub && <div style={{ fontSize:11.5, color:C.muted, fontFamily:FONT }}>{sub}</div>}
      {delta != null && <span style={{ fontSize:10.5, fontWeight:700, padding:'2px 7px', borderRadius:20, background:delta>=0?C.greenBg:'#FEF2F2', color:delta>=0?'#059669':'#DC2626', fontFamily:FONT }}>{delta>=0?'▲':'▼'}{Math.abs(delta).toFixed(1)}%</span>}
    </div>
  </div>
)

const Card = ({ title, sub, children, action, noPad }) => (
  <div style={{ background:'#fff', border:`0.5px solid ${C.border}`, borderRadius:14, overflow:'hidden', boxShadow:'0 1px 4px rgba(15,23,42,0.04)' }}>
    <div style={{ padding:'14px 20px 12px', borderBottom:'0.5px solid #F1F5F9', display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
      <div>
        <div style={{ fontSize:13, fontWeight:700, color:C.text, fontFamily:FONT }}>{title}</div>
        {sub && <div style={{ fontSize:11, color:C.muted, marginTop:2, fontFamily:FONT }}>{sub}</div>}
      </div>
      {action && <div style={{ flexShrink:0 }}>{action}</div>}
    </div>
    <div style={noPad ? {} : { padding:'16px 20px' }}>{children}</div>
  </div>
)

const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'#fff', border:`0.5px solid ${C.border}`, borderRadius:10, padding:'10px 14px', fontSize:12, fontFamily:FONT, boxShadow:'0 8px 24px rgba(15,23,42,0.12)' }}>
      {label && <div style={{ fontWeight:700, color:C.text, marginBottom:7 }}>{label}</div>}
      {payload.map(p => (
        <div key={p.name} style={{ display:'flex', alignItems:'center', gap:7, marginBottom:3 }}>
          <div style={{ width:8, height:8, borderRadius:2, background:p.color, flexShrink:0 }}/>
          <span style={{ color:C.sub }}>{p.name}</span>
          <span style={{ fontWeight:700, color:C.text, marginLeft:'auto', paddingLeft:12 }}>{typeof p.value==='number' ? fmtN(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  )
}

const ChartLegend = ({ items }) => (
  <div style={{ display:'flex', gap:16, justifyContent:'center', marginTop:10 }}>
    {items.map(({ name, color }) => (
      <div key={name} style={{ display:'flex', alignItems:'center', gap:6 }}>
        <div style={{ width:10, height:10, borderRadius:3, background:color }}/>
        <span style={{ fontSize:11.5, fontWeight:500, color:C.sub, fontFamily:FONT }}>{name}</span>
      </div>
    ))}
  </div>
)

const Dropdown = ({ options, value, onChange, label, minWidth=120 }) => {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef(null)
  React.useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6 }} ref={ref}>
      {label && <span style={{ fontSize:11, color:C.muted, fontFamily:FONT, whiteSpace:'nowrap' }}>{label}</span>}
      <div style={{ position:'relative' }}>
        <button onClick={() => setOpen(v => !v)} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px 6px 12px', borderRadius:8, border:`0.5px solid ${open?C.navy:C.border}`, background:open?C.navyBg:'#fff', color:C.text, cursor:'pointer', fontFamily:FONT, fontSize:12, fontWeight:600, minWidth, boxShadow:open?`0 0 0 3px rgba(31,60,132,0.08)`:'none', transition:'all .15s', whiteSpace:'nowrap' }}>
          <span style={{ flex:1, textAlign:'left' }}>{value}</span>
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ flexShrink:0, transition:'transform .2s', transform:open?'rotate(180deg)':'rotate(0deg)' }}>
            <path d="M1 1l4 4 4-4" stroke={C.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        {open && (
          <div style={{ position:'absolute', top:'calc(100% + 6px)', left:0, zIndex:500, background:'#fff', border:`0.5px solid ${C.border}`, borderRadius:12, boxShadow:'0 16px 40px rgba(15,23,42,0.14)', padding:'6px', minWidth:Math.max(minWidth,150), maxHeight:280, overflowY:'auto', scrollbarWidth:'none' }}>
            {options.map(opt => (
              <button key={opt} onClick={() => { onChange(opt); setOpen(false) }}
                style={{ display:'block', width:'100%', textAlign:'left', padding:'8px 12px', borderRadius:8, border:'none', cursor:'pointer', fontFamily:FONT, fontSize:12.5, fontWeight:opt===value?700:400, background:opt===value?C.navyBg:'transparent', color:opt===value?C.navy:C.text, transition:'background .1s' }}
                onMouseEnter={e => { if (opt!==value) e.currentTarget.style.background='#F8FAFC' }}
                onMouseLeave={e => { if (opt!==value) e.currentTarget.style.background='transparent' }}>
                <span style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                  {opt}
                  {opt===value && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.navy} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function WhatsAppDashboard() {
  const [rows, setRows]             = useState([])
  const [months, setMonths]         = useState([])
  const [selMonth, setSelMonth]     = useState('')
  const [selTemplate, setSelTemplate] = useState('All')
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [lastSync, setLastSync]     = useState(null)
  const [search, setSearch]         = useState('')
  const [sortCol, setSortCol]       = useState('total_spend')
  const [sortDir, setSortDir]       = useState('desc')
  const [page, setPage]             = useState(0)
  const [showInfo, setShowInfo]     = useState(false)

  const isPlaceholder = SHEET_CSV === 'WHATSAPP_SHEET_CSV_URL'

  const loadData = useCallback(async (bust = false) => {
    if (isPlaceholder) { setLoading(false); return }
    setLoading(true)
    const t0 = Date.now()
    try {
      const res = await fetch(bust ? SHEET_CSV + '&_=' + Date.now() : SHEET_CSV)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const parsed = parseCSV(await res.text())
      setRows(parsed)
      // sort months chronologically by date
      const mm = {}
      parsed.forEach(r => { if (r.month && r.date && (!mm[r.month] || r.date < mm[r.month])) mm[r.month] = r.date })
      const ms = [...new Set(parsed.map(r => r.month))].filter(Boolean)
        .sort((a, b) => new Date(mm[a]||0) - new Date(mm[b]||0))
      setMonths(ms)
      setSelMonth(prev => prev || ms[ms.length-1] || '')
      setError('')
      setLastSync(new Date())
    } catch (e) { setError(e.message) }
    finally { setTimeout(() => setLoading(false), Math.max(0, 750-(Date.now()-t0))) }
  }, [isPlaceholder])

  useEffect(() => { loadData() }, [loadData])

  const monthRows  = useMemo(() => rows.filter(r => r.month === selMonth), [rows, selMonth])
  const templates  = useMemo(() => ['All', ...[...new Set(monthRows.map(r => r.template))].filter(Boolean).sort()], [monthRows])
  const filtered   = useMemo(() => monthRows.filter(r => selTemplate === 'All' || r.template === selTemplate), [monthRows, selTemplate])

  const totals = useMemo(() => {
    const del  = filtered.reduce((s,r) => s+r.delivered,    0)
    const util = filtered.reduce((s,r) => s+r.utility_spend, 0)
    const promo= filtered.reduce((s,r) => s+r.promo_spend,   0)
    const tot  = util + promo
    const prevM    = months[months.indexOf(selMonth)-1]
    const prevRows = prevM ? rows.filter(r => r.month===prevM) : []
    const prevTot  = prevRows.reduce((s,r) => s+r.total_spend, 0)
    const prevDel  = prevRows.reduce((s,r) => s+r.delivered,   0)
    return {
      delivered: del, utility: util, promo, total: tot,
      cpd: del>0 ? tot/del : 0,
      spendDelta: prevTot>0 ? ((tot-prevTot)/prevTot*100) : null,
      delDelta:   prevDel>0 ? ((del-prevDel)/prevDel*100) : null,
    }
  }, [filtered, rows, months, selMonth])

  // spend breakdown pie data
  const spendBreakdown = useMemo(() => [
    { name:'Utility',      value: totals.utility, fill: C.navy },
    { name:'Promotional',  value: totals.promo,   fill: C.blue },
  ].filter(d => d.value > 0), [totals])

  // day-on-day trend for selected month
  const dailyTrend = useMemo(() => {
    const map = {}
    filtered.forEach(r => {
      if (!map[r.date]) map[r.date] = { date: r.date, Delivered: 0, Spend: 0 }
      map[r.date].Delivered  += r.delivered
      map[r.date].Spend      += r.total_spend
    })
    return Object.values(map).sort((a,b) => a.date.localeCompare(b.date))
  }, [filtered])

  // month-on-month trend
  const trend = useMemo(() => months.map(m => {
    const mr = rows.filter(r => r.month === m)
    return {
      month: m,
      Delivered: mr.reduce((s,r) => s+r.delivered,   0),
      Spend:     mr.reduce((s,r) => s+r.total_spend,  0),
    }
  }), [rows, months])

  // top templates
  const topTemplates = useMemo(() => {
    const map = {}
    filtered.forEach(r => {
      if (!map[r.template]) map[r.template] = { template:r.template, delivered:0, utility:0, promo:0, total_spend:0 }
      map[r.template].delivered   += r.delivered
      map[r.template].utility     += r.utility_spend
      map[r.template].promo       += r.promo_spend
      map[r.template].total_spend += r.total_spend
    })
    return Object.values(map).sort((a,b) => b.total_spend - a.total_spend).slice(0,10)
  }, [filtered])

  // table
  const tableRows = useMemo(() => {
    const q = search.toLowerCase()
    return filtered
      .filter(r => !q || r.template.toLowerCase().includes(q) || r.date.includes(q))
      .sort((a,b) => {
        const av = a[sortCol]??0, bv = b[sortCol]??0
        if (typeof av==='number') return sortDir==='desc' ? bv-av : av-bv
        return sortDir==='desc' ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv))
      })
  }, [filtered, search, sortCol, sortDir])

  const totalPages = Math.ceil(tableRows.length / PAGE_SIZE)
  const pageRows   = tableRows.slice(page*PAGE_SIZE, (page+1)*PAGE_SIZE)
  const sortBy     = col => { setSortCol(col); setSortDir(d => sortCol===col?(d==='desc'?'asc':'desc'):'desc'); setPage(0) }
  const onSearch   = v  => { setSearch(v); setPage(0) }

  const thS = col => ({ fontSize:10, fontWeight:700, color:C.muted, letterSpacing:'0.07em', textTransform:'uppercase', padding:'10px 12px', cursor:'pointer', userSelect:'none', fontFamily:FONT, whiteSpace:'nowrap', background:sortCol===col?'#F8FAFF':'transparent', borderBottom:`0.5px solid ${C.border}` })

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:C.bg, fontFamily:FONT }}>
      <Sidebar/>
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>

        {/* HEADER */}
        <div style={{ background:'#fff', borderBottom:`0.5px solid ${C.border}`, padding:'11px 28px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexShrink:0 }}>
          <div>
            <p style={{ fontSize:10.5, color:C.muted, margin:0, letterSpacing:'0.05em', textTransform:'uppercase', fontFamily:FONT }}>Dashboards / WhatsApp</p>
            <h1 style={{ fontSize:17, fontWeight:800, color:C.text, margin:'2px 0 0', letterSpacing:'-0.4px', fontFamily:FONT }}>
              WhatsApp Spend · {selMonth || '—'}
            </h1>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
            {months.length > 0 && <Dropdown options={[...months].reverse()} value={selMonth} minWidth={110} onChange={v => { setSelMonth(v); setPage(0) }}/>}
            <Dropdown label="Template" options={templates} value={selTemplate} minWidth={140} onChange={v => { setSelTemplate(v); setPage(0) }}/>
            {lastSync && <span style={{ fontSize:11, color:C.muted, fontFamily:FONT }}>Synced {lastSync.toLocaleTimeString()}</span>}
            <button onClick={() => loadData(true)} disabled={loading||isPlaceholder} className="lqRefreshBtn"
              style={{ padding:'6px 14px', borderRadius:8, border:`0.5px solid ${C.border}`, fontSize:12, fontWeight:500, cursor:loading?'wait':'pointer', fontFamily:FONT, background:'#fff', color:'#374151', display:'flex', alignItems:'center', gap:6, opacity:loading?0.65:1 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation:loading?'spin .8s linear infinite':'none' }}>
                <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
              {loading ? 'Refreshing' : 'Refresh'}
            </button>
            {/* Info */}
            <div style={{ position:'relative' }}>
              <button onClick={() => setShowInfo(v => !v)} style={{ width:30, height:30, borderRadius:8, border:`0.5px solid ${C.border}`, background:showInfo?C.navyBg:'#fff', color:C.navy, fontSize:14, fontWeight:700, fontStyle:'italic', fontFamily:'Georgia,serif', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>i</button>
              {showInfo && <div onClick={() => setShowInfo(false)} style={{ position:'fixed', inset:0, zIndex:150 }}/>}
              {showInfo && (
                <div style={{ position:'absolute', right:0, top:'calc(100% + 8px)', zIndex:200, width:360, background:'#fff', border:`0.5px solid ${C.border}`, borderRadius:12, boxShadow:'0 14px 40px rgba(15,23,42,0.16)', padding:'16px 18px', fontFamily:FONT }}>
                  <div style={{ fontSize:13, fontWeight:700, color:C.text, marginBottom:8 }}>How metrics are calculated</div>
                  {[
                    ['Delivered',         'Total messages confirmed received by recipients (from "delivered" column).'],
                    ['Total Spend',        'utility_spends + promotional_spends for the selected filters.'],
                    ['Utility Spend',      'Cost of utility/transactional WhatsApp messages.'],
                    ['Promotional Spend',  'Cost of marketing/promotional WhatsApp messages.'],
                    ['Cost per Delivered', 'Total Spend ÷ Delivered (how much each delivered message costs).'],
                    ['MoM delta',          '% change vs immediately preceding month.'],
                    ['Daily trend',        'Day-on-day delivered and spend within the selected month.'],
                    ['Month trend',        'Total delivered and spend per calendar month across all data.'],
                    ['Top templates',      'Templates ranked by total spend for selected month and filters.'],
                  ].map(([m, d]) => (
                    <div key={m} style={{ display:'flex', gap:10, padding:'7px 0', borderTop:'0.5px solid #F3F4F6' }}>
                      <div style={{ fontSize:11.5, fontWeight:700, color:C.navy, width:130, flexShrink:0 }}>{m}</div>
                      <div style={{ fontSize:11.5, color:C.sub, lineHeight:1.5 }}>{d}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* BODY */}
        <div style={{ flex:1, overflowY:'auto', padding:'20px 28px' }}>

          {/* Sheet not configured yet */}
          {isPlaceholder && (
            <div style={{ background:'#FFFBEB', border:`0.5px solid ${C.amber}`, borderRadius:12, padding:'16px 20px', marginBottom:20, display:'flex', alignItems:'flex-start', gap:12 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.amber} strokeWidth="2" strokeLinecap="round" style={{ flexShrink:0, marginTop:1 }}>
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <div style={{ fontFamily:FONT }}>
                <div style={{ fontSize:13, fontWeight:700, color:'#92400E', marginBottom:4 }}>Sheet not connected yet</div>
                <div style={{ fontSize:12, color:'#B45309', lineHeight:1.6 }}>
                  Publish the <b>whatsapp</b> tab: File → Share → Publish to web → select "whatsapp" tab → CSV → Publish → copy the URL and update <code>SHEET_CSV</code> in this file.
                </div>
              </div>
            </div>
          )}

          {loading && rows.length === 0 ? (
            <div style={{ textAlign:'center', paddingTop:80, color:C.muted }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation:'spin .8s linear infinite' }}>
                <circle cx="12" cy="12" r="10" strokeOpacity=".2"/><path d="M12 2a10 10 0 0 1 10 10" stroke={C.green}/>
              </svg>
              <p style={{ marginTop:12, fontSize:13, fontFamily:FONT }}>Loading WhatsApp data…</p>
            </div>
          ) : error ? (
            <div style={{ textAlign:'center', paddingTop:80, color:'#DC2626', fontSize:13, fontFamily:FONT }}>
              ⚠️ {error}
            </div>
          ) : rows.length === 0 && !isPlaceholder ? (
            <div style={{ textAlign:'center', paddingTop:80, color:C.muted, fontSize:13, fontFamily:FONT }}>No data found in sheet.</div>
          ) : rows.length > 0 ? (
            <>
              {/* KPIs */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:14, marginBottom:20 }}>
                <KPICard label="Messages Delivered" value={fmtN(totals.delivered)} sub={selMonth} delta={totals.delDelta} accent={C.navy}/>
                <KPICard label="Total Spend"         value={fmtC(totals.total)}    sub="Utility + Promotional" delta={totals.spendDelta} accent={C.green}/>
                <KPICard label="Utility Spend"       value={fmtC(totals.utility)}  sub={totals.total>0?((totals.utility/totals.total)*100).toFixed(0)+'% of spend':''} accent={C.blue}/>
                <KPICard label="Promotional Spend"   value={fmtC(totals.promo)}    sub={totals.total>0?((totals.promo/totals.total)*100).toFixed(0)+'% of spend':''} accent={C.cyan}/>
                <KPICard label="Cost per Delivered"  value={fmtC2(totals.cpd)}     sub="per message delivered" accent={C.amber}/>
              </div>

              {/* DAILY TREND + SPEND BREAKDOWN */}
              <div style={{ display:'grid', gridTemplateColumns:'1.6fr 1fr', gap:16, marginBottom:16 }}>
                <Card title="Daily trend" sub={`Messages delivered and spend by day · ${selMonth}`}>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={dailyTrend} margin={{ top:8, right:12, left:-8, bottom:0 }} barCategoryGap="28%">
                      <XAxis dataKey="date" tick={{ fontSize:9.5, fill:C.muted, fontFamily:FONT }} axisLine={false} tickLine={false}
                        tickFormatter={v => v.slice(5)} // show MM-DD only
                      />
                      <YAxis yAxisId="left"  tick={{ fontSize:10, fill:C.muted, fontFamily:FONT }} tickFormatter={v => fmtN(v)} axisLine={false} tickLine={false}/>
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize:10, fill:C.muted, fontFamily:FONT }} tickFormatter={v => fmtC(v)} axisLine={false} tickLine={false}/>
                      <Tooltip content={<ChartTip/>}/>
                      <Bar yAxisId="left"  dataKey="Delivered" fill={C.navy} radius={[4,4,0,0]} maxBarSize={28}/>
                      <Bar yAxisId="right" dataKey="Spend"     fill={C.blue} radius={[4,4,0,0]} maxBarSize={28} opacity={0.75}/>
                    </BarChart>
                  </ResponsiveContainer>
                  <ChartLegend items={[{name:'Delivered',color:C.navy},{name:'Spend (₹)',color:C.blue}]}/>
                </Card>

                <Card title="Utility vs Promotional" sub="Spend breakdown · selected month">
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:240, gap:16 }}>
                    {spendBreakdown.length > 0 ? (
                      <>
                        <div style={{ width:'100%', maxWidth:200 }}>
                          {spendBreakdown.map(s => (
                            <div key={s.name} style={{ marginBottom:12 }}>
                              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                                <span style={{ fontSize:12, fontWeight:600, color:C.text, fontFamily:FONT }}>{s.name}</span>
                                <span style={{ fontSize:12, fontWeight:700, color:C.text, fontFamily:FONT }}>{fmtC(s.value)}</span>
                              </div>
                              <div style={{ height:8, background:'#F1F5F9', borderRadius:4, overflow:'hidden' }}>
                                <div style={{ height:'100%', width:`${totals.total>0?(s.value/totals.total*100):0}%`, background:s.fill, borderRadius:4, transition:'width .4s ease' }}/>
                              </div>
                              <div style={{ fontSize:11, color:C.muted, marginTop:2, fontFamily:FONT }}>{totals.total>0?((s.value/totals.total)*100).toFixed(1):'0'}% of total</div>
                            </div>
                          ))}
                        </div>
                        <div style={{ padding:'10px 16px', background:C.navyBg, borderRadius:10, textAlign:'center' }}>
                          <div style={{ fontSize:11, color:C.muted, fontFamily:FONT }}>Total Spend</div>
                          <div style={{ fontSize:22, fontWeight:800, color:C.navy, fontFamily:FONT }}>{fmtC(totals.total)}</div>
                        </div>
                      </>
                    ) : <div style={{ color:C.muted, fontSize:13, fontFamily:FONT }}>No spend data</div>}
                  </div>
                </Card>
              </div>

              {/* MONTH TREND */}
              {trend.length > 1 && (
                <div style={{ marginBottom:16 }}>
                  <Card title="Month-on-month trend" sub="Delivered messages and spend across all months">
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={trend} margin={{ top:8, right:16, left:-8, bottom:0 }}>
                        <XAxis dataKey="month" tick={{ fontSize:10.5, fill:C.muted, fontFamily:FONT }} axisLine={false} tickLine={false}/>
                        <YAxis yAxisId="left"  tick={{ fontSize:10, fill:C.muted, fontFamily:FONT }} tickFormatter={v => fmtN(v)} axisLine={false} tickLine={false}/>
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize:10, fill:C.muted, fontFamily:FONT }} tickFormatter={v => fmtC(v)} axisLine={false} tickLine={false}/>
                        <Tooltip content={<ChartTip/>}/>
                        <Line yAxisId="left"  type="monotone" dataKey="Delivered" stroke={C.navy}  strokeWidth={2.5} dot={{ r:3.5, fill:C.navy,  strokeWidth:0 }} activeDot={{ r:5 }}/>
                        <Line yAxisId="right" type="monotone" dataKey="Spend"     stroke={C.green} strokeWidth={2.5} dot={{ r:3.5, fill:C.green, strokeWidth:0 }} activeDot={{ r:5 }}/>
                      </LineChart>
                    </ResponsiveContainer>
                    <ChartLegend items={[{name:'Delivered',color:C.navy},{name:'Spend (₹)',color:C.green}]}/>
                  </Card>
                </div>
              )}

              {/* TOP TEMPLATES */}
              <div style={{ marginBottom:16 }}>
                <Card title="Top 10 templates by spend" sub="Selected month and filters">
                  {topTemplates.length === 0
                    ? <div style={{ textAlign:'center', padding:'32px 0', color:C.muted, fontSize:13, fontFamily:FONT }}>No data</div>
                    : (
                      <ResponsiveContainer width="100%" height={Math.max(220, topTemplates.length*34)}>
                        <BarChart data={topTemplates} layout="vertical" margin={{ top:4, right:80, left:8, bottom:4 }} barCategoryGap="22%">
                          <XAxis type="number" tick={{ fontSize:10, fill:C.muted, fontFamily:FONT }} tickFormatter={v => fmtC(v)} axisLine={false} tickLine={false}/>
                          <YAxis type="category" dataKey="template" tick={{ fontSize:10.5, fill:C.sub, fontFamily:FONT }} width={220} axisLine={false} tickLine={false}
                            tickFormatter={v => v.length>32 ? v.slice(0,30)+'…' : v}/>
                          <Tooltip content={<ChartTip/>} cursor={{ fill:'#F1F5F9' }}/>
                          <Bar dataKey="utility"     fill={C.navy} stackId="a" name="Utility"     radius={[0,0,0,0]} maxBarSize={20}/>
                          <Bar dataKey="promo"       fill={C.blue} stackId="a" name="Promotional" radius={[0,4,4,0]} maxBarSize={20}/>
                        </BarChart>
                      </ResponsiveContainer>
                    )
                  }
                  <ChartLegend items={[{name:'Utility spend',color:C.navy},{name:'Promotional spend',color:C.blue}]}/>
                </Card>
              </div>

              {/* TABLE */}
              <Card title="Template breakdown" noPad
                sub={`${tableRows.length.toLocaleString()} rows · ${selMonth}${selTemplate!=='All'?' · '+selTemplate:''}`}
                action={
                  <div style={{ position:'relative' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }}>
                      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                    </svg>
                    <input value={search} onChange={e => onSearch(e.target.value)} placeholder="Search template or date…"
                      style={{ paddingLeft:30, paddingRight:10, paddingTop:6, paddingBottom:6, borderRadius:8, border:`0.5px solid ${C.border}`, fontSize:12, fontFamily:FONT, outline:'none', width:220, color:C.text }}/>
                  </div>
                }>
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                    <thead>
                      <tr>
                        {[['date','Date'],['template','Template'],['delivered','Delivered'],['utility_spend','Utility ₹'],['promo_spend','Promo ₹'],['total_spend','Total Spend']].map(([col,lbl]) => (
                          <th key={col} style={thS(col)} onClick={() => sortBy(col)}>
                            {lbl} <span style={{ opacity:sortCol===col?1:0.3, fontSize:9 }}>{sortCol===col?(sortDir==='desc'?'↓':'↑'):'↕'}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((r,i) => (
                        <tr key={i} style={{ borderBottom:`0.5px solid #F3F4F6`, background:i%2?'#FAFBFC':'#fff', transition:'background .1s' }}
                          onMouseEnter={e => e.currentTarget.style.background='#F0F7FF'}
                          onMouseLeave={e => e.currentTarget.style.background=i%2?'#FAFBFC':'#fff'}>
                          <td style={{ padding:'10px 12px', color:C.muted, fontFamily:FONT, whiteSpace:'nowrap' }}>{r.date}</td>
                          <td style={{ padding:'10px 12px', color:C.text, maxWidth:280, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:FONT }} title={r.template}>{r.template}</td>
                          <td style={{ padding:'10px 12px', fontWeight:600, color:C.text,  textAlign:'right', fontFamily:FONT, paddingRight:16 }}>{fmtN(r.delivered)}</td>
                          <td style={{ padding:'10px 12px', color:C.navy, textAlign:'right', fontFamily:FONT, paddingRight:16 }}>{fmtC2(r.utility_spend)}</td>
                          <td style={{ padding:'10px 12px', color:C.blue, textAlign:'right', fontFamily:FONT, paddingRight:16 }}>{fmtC2(r.promo_spend)}</td>
                          <td style={{ padding:'10px 12px', fontWeight:700, color:C.text, textAlign:'right', fontFamily:FONT, paddingRight:20 }}>{fmtC2(r.total_spend)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {totalPages > 1 && (
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 12px 12px', borderTop:`0.5px solid ${C.border}` }}>
                      <span style={{ fontSize:11.5, color:C.muted, fontFamily:FONT }}>{page*PAGE_SIZE+1}–{Math.min((page+1)*PAGE_SIZE,tableRows.length)} of {tableRows.length.toLocaleString()} rows</span>
                      <div style={{ display:'flex', gap:5, alignItems:'center' }}>
                        <button onClick={() => setPage(p => Math.max(0,p-1))} disabled={page===0}
                          style={{ padding:'5px 13px', borderRadius:8, border:`0.5px solid ${C.border}`, background:'#fff', fontSize:12, fontWeight:600, fontFamily:FONT, cursor:page===0?'not-allowed':'pointer', opacity:page===0?0.35:1, color:C.text }}>← Prev</button>
                        {Array.from({length:Math.min(7,totalPages)},(_,i) => {
                          const start=Math.max(0,Math.min(page-3,totalPages-7)); const p=start+i
                          return <button key={p} onClick={() => setPage(p)}
                            style={{ width:32, height:32, borderRadius:8, border:`0.5px solid ${p===page?C.navy:C.border}`, background:p===page?C.navy:'#fff', color:p===page?'#fff':C.text, fontSize:12, fontWeight:p===page?700:400, fontFamily:FONT, cursor:'pointer' }}>{p+1}</button>
                        })}
                        <button onClick={() => setPage(p => Math.min(totalPages-1,p+1))} disabled={page===totalPages-1}
                          style={{ padding:'5px 13px', borderRadius:8, border:`0.5px solid ${C.border}`, background:'#fff', fontSize:12, fontWeight:600, fontFamily:FONT, cursor:page===totalPages-1?'not-allowed':'pointer', opacity:page===totalPages-1?0.35:1, color:C.text }}>Next →</button>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
