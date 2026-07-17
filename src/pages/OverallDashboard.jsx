import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList,
  CartesianGrid, LineChart, Line, Legend,
} from 'recharts'
import Sidebar from '../components/Sidebar'
import { DashboardSkeleton } from '../components/SkeletonLoader'
import ExportButton from '../components/ExportButton'
import {
  C, FONT, brandColor, fmtN, pct, Card, PremKPI, KPI_ICONS, RankedBars,
} from '../ui/dashboardKit'

// "Overall PM" — added by the admin as a custom Data Source (Settings > Data > Google Sheets).
// Not part of the original SHEET_PREF_KEYS set, so this page resolves its own override the same
// way Settings resolves any custom source: prefs[editKey] (if the admin later edits the URL from
// Settings) falls back to the sheet's defaultUrl, falls back to this hardcoded default.
const DEFAULT_URL = 'https://docs.google.com/spreadsheets/d/1kaoWMGBbttOtaeVfaSXhrxcs0_pe5xLXltMulG8mHG4/gviz/tq?tqx=out:csv&sheet=MainData'

async function resolveOverallUrl() {
  try {
    const r = await fetch('/api/preferences?global=1', { credentials: 'include' })
    const prefs = r.ok ? (await r.json()).prefs || {} : {}
    const custom = Array.isArray(prefs.custom_data_sources) ? prefs.custom_data_sources : []
    const entry = custom.find(s => /mainData/i.test(s.defaultUrl || '') || /overall/i.test(s.name || ''))
    if (entry) return prefs[entry.editKey] || entry.defaultUrl || DEFAULT_URL
  } catch (_) {}
  return DEFAULT_URL
}

function parseCSV(t) {
  const rows = []; let i = 0, field = '', row = [], inq = false
  while (i < t.length) {
    const c = t[i]
    if (inq) {
      if (c === '"') { if (t[i + 1] === '"') { field += '"'; i += 2; continue } inq = false; i++; continue }
      field += c; i++; continue
    } else {
      if (c === '"') { inq = true; i++; continue }
      if (c === ',') { row.push(field); field = ''; i++; continue }
      if (c === '\r') { i++; continue }
      if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue }
      field += c; i++; continue
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  const h = rows[0]
  return rows.slice(1).filter(r => r.length > 1).map(r => Object.fromEntries(h.map((k, idx) => [k, (r[idx] || '')])))
}

const MON = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 }
const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function parseD(s) {
  if (!s) return null
  const m = String(s).trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/)
  if (!m) return null
  return new Date(+m[3], MON[m[2]], +m[1])
}
const monthKey = d => d.getFullYear() * 12 + d.getMonth()
const monthLabel = k => MN[((k % 12) + 12) % 12] + "'" + String(Math.floor(k / 12)).slice(2)

function parseNum(v) {
  if (v == null) return 0
  const s = String(v).trim()
  if (!s || s === '—' || s === '-' || /^n\/?a$/i.test(s)) return 0
  const n = parseFloat(s.replace(/,/g, ''))
  return isNaN(n) ? 0 : n
}

function mapRow(r) {
  const d = parseD(r.lead_date)
  return {
    date: d,
    mk: d ? monthKey(d) : null,
    source: (r.Source || '').trim() || 'Unknown',
    campaign: (r.campaign_name || '').trim(),
    leads: parseNum(r['Total Leads Generated']),
    floorQueued: parseNum(r.floor_queued),
    futworkQ: parseNum(r['Queued on Futwork']),
    superbotQ: parseNum(r['Queued on Superbot']),
    humanQL: parseNum(r['Futwork Human QL']),
    apps: parseNum(r['Total Apps']),
    offers: parseNum(r['Total Offers']),
    deposits: parseNum(r['Total Deposits']),
    raus: parseNum(r['Total RAUs']),
  }
}

function Dropdown({ options, value, onChange, minWidth = 130 }) {
  const [open, setOpen] = useState(false)
  const ref = React.useRef(null)
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div style={{ position:'relative' }} ref={ref}>
      <button onClick={() => setOpen(v => !v)} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 11px 7px 13px', borderRadius:9, border:`0.5px solid ${open ? C.navy : '#E5E7EB'}`, background: open ? C.navyBg : '#fff', color:'#0F172A', cursor:'pointer', fontFamily:FONT, fontSize:12, fontWeight:600, minWidth, boxShadow: open ? '0 0 0 3px rgba(31,60,132,0.09)' : '0 1px 3px rgba(15,23,42,0.06)', transition:'all .15s', whiteSpace:'nowrap' }}>
        <span style={{ flex:1, textAlign:'left' }}>{(options.find(o => (o.value ?? o) === value)?.label) ?? value}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ flexShrink:0, transition:'transform .2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          <path d="M1 1l4 4 4-4" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 6px)', left:0, zIndex:500, background:'#fff', border:'0.5px solid #E5E7EB', borderRadius:12, boxShadow:'0 16px 48px rgba(15,23,42,0.14)', padding:6, minWidth:Math.max(minWidth, 160), maxHeight:320, overflowY:'auto' }}>
          {options.map(opt => {
            const v = opt.value ?? opt
            const active = v === value
            return (
              <button key={v} onClick={() => { onChange(v); setOpen(false) }} style={{ display:'block', width:'100%', textAlign:'left', padding:'8px 12px', borderRadius:8, border:'none', cursor:'pointer', fontFamily:FONT, fontSize:12.5, fontWeight: active ? 700 : 400, background: active ? C.navyBg : 'transparent', color: active ? C.navy : '#0F172A' }}>
                {opt.label ?? opt}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function BrandTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null
  return (
    <div style={{ background:'#fff', border:'0.5px solid #E5E7EB', borderRadius:10, padding:'9px 13px', fontFamily:FONT, boxShadow:'0 8px 24px rgba(15,23,42,0.12)' }}>
      <div style={{ fontSize:11.5, fontWeight:800, color:'#0F1B33', marginBottom:4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ fontSize:11.5, color:'#475569', display:'flex', justifyContent:'space-between', gap:18 }}>
          <span style={{ color:p.color || p.fill }}>{p.name}</span>
          <span style={{ fontWeight:700, fontVariantNumeric:'tabular-nums' }}>{fmtN(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

const sectionTitle = (t, s) => (
  <div style={{ marginBottom:14 }}>
    <div style={{ fontSize:14, fontWeight:800, color:C.text, letterSpacing:'-0.2px' }}>{t}</div>
    {s && <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{s}</div>}
  </div>
)
const axis = { fontSize:11, fill:C.muted, fontFamily:FONT }
const grid2 = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginTop:0 }

export default function OverallDashboard() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastSync, setLastSync] = useState(null)
  const [period, setPeriod] = useState('all')
  const [source, setSource] = useState('All')
  const [showInfo, setShowInfo] = useState(false)
  const [grpBy, setGrpBy] = useState('source')

  const loadData = useCallback(async (bust = false) => {
    setLoading(true)
    try {
      const base = await resolveOverallUrl()
      const u = bust ? base + (base.includes('?') ? '&' : '?') + '_=' + Date.now() : base
      const res = await fetch(u)
      const txt = await res.text()
      setRows(parseCSV(txt).map(mapRow))
      setLastSync(new Date())
      setError(null)
    } catch (e) { setError('Failed to load: ' + e.message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { loadData() }, [loadData])

  const months = useMemo(() => {
    const set = new Set(rows.filter(r => r.mk != null).map(r => r.mk))
    return [...set].sort((a, b) => a - b)
  }, [rows])

  const sources = useMemo(() => {
    const set = new Set(rows.map(r => r.source))
    return [...set].sort()
  }, [rows])

  const filtered = useMemo(() => {
    let rs = rows
    if (period !== 'all') rs = rs.filter(r => r.mk === Number(period))
    if (source !== 'All') rs = rs.filter(r => r.source === source)
    return rs
  }, [rows, period, source])

  const kpis = useMemo(() => {
    const sum = k => filtered.reduce((t, r) => t + r[k], 0)
    return {
      leads: sum('leads'), floorQueued: sum('floorQueued'),
      futworkQ: sum('futworkQ'), superbotQ: sum('superbotQ'),
      humanQL: sum('humanQL'), apps: sum('apps'), offers: sum('offers'),
      deposits: sum('deposits'), raus: sum('raus'),
    }
  }, [filtered])
  const totalQueued = kpis.futworkQ + kpis.superbotQ

  const funnel = useMemo(() => ([
    { stage:'Leads Generated', count:kpis.leads },
    { stage:'Floor Queued', count:kpis.floorQueued },
    { stage:'Total Queued', count:totalQueued },
    { stage:'Human QL', count:kpis.humanQL },
    { stage:'Applications', count:kpis.apps },
    { stage:'Offers', count:kpis.offers },
    { stage:'Deposits', count:kpis.deposits },
    { stage:'RAUs', count:kpis.raus },
  ]), [kpis, totalQueued])

  const bySource = useMemo(() => {
    const m = new Map()
    filtered.forEach(r => {
      const e = m.get(r.source) || { source:r.source, leads:0, queued:0, humanQL:0, apps:0, offers:0, deposits:0, raus:0 }
      e.leads += r.leads; e.queued += r.futworkQ + r.superbotQ; e.humanQL += r.humanQL
      e.apps += r.apps; e.offers += r.offers; e.deposits += r.deposits; e.raus += r.raus
      m.set(r.source, e)
    })
    return [...m.values()].sort((a, b) => b.leads - a.leads)
  }, [filtered])

  const byMonth = useMemo(() => {
    const m = new Map()
    filtered.forEach(r => {
      if (r.mk == null) return
      const e = m.get(r.mk) || { mk:r.mk, label:monthLabel(r.mk), leads:0, queued:0, humanQL:0, deposits:0 }
      e.leads += r.leads; e.queued += r.futworkQ + r.superbotQ; e.humanQL += r.humanQL; e.deposits += r.deposits
      m.set(r.mk, e)
    })
    return [...m.values()].sort((a, b) => a.mk - b.mk)
  }, [filtered])

  const grouped = useMemo(() => {
    if (grpBy === 'source') return bySource.map(s => ({
      label:s.source, leads:s.leads, queued:s.queued, humanQL:s.humanQL, apps:s.apps, offers:s.offers, deposits:s.deposits, raus:s.raus,
    }))
    return byMonth.map(m => {
      const full = filtered.filter(r => r.mk === m.mk)
      return {
        label:m.label, leads:m.leads, queued:m.queued, humanQL:m.humanQL,
        apps: full.reduce((t,r)=>t+r.apps,0), offers: full.reduce((t,r)=>t+r.offers,0),
        deposits:m.deposits, raus: full.reduce((t,r)=>t+r.raus,0),
      }
    })
  }, [grpBy, bySource, byMonth, filtered])

  const exportRows = useMemo(() => grouped.map(g => ({
    [grpBy === 'source' ? 'Source' : 'Month']: g.label,
    Leads: g.leads, 'Total Queued': g.queued, 'Human QL': g.humanQL,
    Applications: g.apps, Offers: g.offers, Deposits: g.deposits, RAUs: g.raus,
    'QL %': pct(g.humanQL, g.queued), 'App %': pct(g.apps, g.humanQL), 'Deposit %': pct(g.deposits, g.offers),
  })), [grouped, grpBy])

  const periodOptions = [{ value:'all', label:'All time' }, ...months.map(mk => ({ value:String(mk), label:monthLabel(mk) }))]
  const sourceOptions = ['All', ...sources]
  const maxSourceLeads = bySource.length ? Math.max(...bySource.map(s => s.leads)) : 1
  const totalSourceLeads = bySource.reduce((t, s) => t + s.leads, 0)

  if (loading) {
    return (
      <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:C.bg, fontFamily:FONT }}>
        <Sidebar />
        <div style={{ flex:1, overflow:'auto' }}><DashboardSkeleton /></div>
      </div>
    )
  }
  if (error) {
    return (
      <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:C.bg, fontFamily:FONT }}>
        <Sidebar />
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#64748B', fontSize:14 }}>{error}</div>
      </div>
    )
  }

  const periodLabel = period === 'all' ? 'All time' : monthLabel(Number(period))
  const fmt = new Intl.DateTimeFormat('en-IN', { hour:'2-digit', minute:'2-digit', second:'2-digit' })

  return (
    <div className="lq-page-shell" style={{ display:'flex', height:'100vh', overflow:'hidden', background:C.bg, fontFamily:FONT }}>
      <Sidebar />
      <style>{`.kpiCard:hover{transform:translateY(-3px);box-shadow:0 2px 4px rgba(15,23,42,0.05),0 16px 32px -14px rgba(31,60,132,0.22)!important}`}</style>
      <div style={{ margin:'12px 14px 0', borderRadius:14, border:'1px solid #EEF1F6', boxShadow:'0 1px 3px rgba(31,60,132,0.06)', flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>

        {/* HEADER — mirrors the MTD page header: breadcrumb, title, period label chip, filters, sync, refresh, export, info */}
        <div style={{ background:'var(--card)', borderBottom:'0.5px solid ' + C.border, padding:'0 28px', minHeight:56, height:'auto', display:'flex', alignItems:'center', gap:12, flexShrink:0, flexWrap:'wrap' }}>
          <div style={{ flex:1, padding:'10px 0' }}>
            <p style={{ fontSize:10.5, color:C.muted, margin:0, letterSpacing:'0.05em', textTransform:'uppercase', fontFamily:FONT }}>Dashboards / Overall</p>
            <h1 style={{ fontSize:17, fontWeight:800, color:C.text, margin:'2px 0 0', letterSpacing:'-0.4px', fontFamily:FONT }}>Overall Performance</h1>
          </div>
          <div style={{ fontSize:11, color:C.muted, background:'#F1F5F9', padding:'3px 10px', borderRadius:6 }}>{periodLabel}</div>
          <Dropdown options={periodOptions} value={period} onChange={setPeriod} minWidth={110} />
          <Dropdown options={sourceOptions} value={source} onChange={setSource} minWidth={140} />
          <div style={{ fontSize:11, color:'#94A3B8', borderLeft:'0.5px solid #E5E7EB', paddingLeft:14 }}>{lastSync ? 'Synced ' + fmt.format(lastSync) : ''}</div>
          <button onClick={() => loadData(true)} disabled={loading} style={{ padding:'6px 14px', borderRadius:8, border:'0.5px solid #E5E7EB', fontSize:12, fontWeight:500, cursor: loading ? 'wait' : 'pointer', fontFamily:'inherit', background:'#fff', color:'#374151', display:'flex', alignItems:'center', gap:6, opacity: loading ? 0.65 : 1 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
            {loading ? 'Refreshing' : 'Refresh'}
          </button>
          <ExportButton data={exportRows} filename="overall-summary" />
          <div style={{ position:'relative' }}>
            <button onClick={() => setShowInfo(v => !v)} title="How these metrics are calculated" style={{ width:30, height:30, borderRadius:8, border:'0.5px solid #E5E7EB', background: showInfo ? '#E8EFF9' : '#fff', color:'#1F3C84', fontSize:14, fontWeight:700, fontStyle:'italic', fontFamily:'Georgia,serif', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>i</button>
            {showInfo && <div onClick={() => setShowInfo(false)} style={{ position:'fixed', inset:0, zIndex:150 }} />}
            {showInfo && (
              <div style={{ position:'absolute', right:0, top:'calc(100% + 8px)', zIndex:200, width:360, maxHeight:'74vh', overflowY:'auto', background:'#fff', border:'0.5px solid #E5E7EB', borderRadius:12, boxShadow:'0 14px 40px rgba(15,23,42,0.16)', padding:'16px 18px', textAlign:'left', fontFamily:FONT }}>
                <div style={{ fontSize:12.5, fontWeight:800, color:'#0F172A', marginBottom:8 }}>How Overall is calculated</div>
                <div style={{ fontSize:11, color:'#94A3B8', marginBottom:10 }}>Source: the "Overall PM" sheet (Settings &gt; Data &gt; Google Sheets) — one row per lead/day/source/campaign, spanning the full acquisition-to-revenue funnel.</div>
                <div style={{ fontSize:11.5, color:'#475569', lineHeight:1.7 }}>
                  <b>Leads Generated</b> → <b>Floor Queued</b> → <b>Total Queued</b> (Futwork + Superbot) → <b>Human QL</b> (Futwork-qualified) → <b>Applications</b> → <b>Offers</b> → <b>Deposits</b> → <b>RAUs</b> (revenue attribution units). Each stage is a subset of the one before it, so the funnel chart below reads top-to-bottom as the real conversion path.<br /><br />
                  Filters apply the Period and Source selectors to every KPI, chart, and the grouped table below.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* SCROLLABLE CONTENT */}
        <div style={{ flex:1, overflowY:'auto', padding:'20px 28px' }}>

          {/* KPI ROW */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4, minmax(0, 1fr))', gap:14, marginBottom:20 }}>
            <PremKPI label="TOTAL LEADS" value={fmtN(kpis.leads)} sub="generated" accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.total} />
            <PremKPI label="FLOOR QUEUED" value={fmtN(kpis.floorQueued)} sub={pct(kpis.floorQueued, kpis.leads) + ' of leads'} accent={C.blue} accentBg={C.blueBg} icon={KPI_ICONS.agent} />
            <PremKPI label="TOTAL QUEUED" value={fmtN(totalQueued)} sub={'Futwork ' + fmtN(kpis.futworkQ) + ' · Superbot ' + fmtN(kpis.superbotQ)} accent={C.cyan} accentBg={C.cyanBg} icon={KPI_ICONS.bot} />
            <PremKPI label="HUMAN QL" value={fmtN(kpis.humanQL)} sub={pct(kpis.humanQL, totalQueued) + ' of queued'} accent={C.green} accentBg={C.greenBg} icon={KPI_ICONS.ai} />
            <PremKPI label="APPLICATIONS" value={fmtN(kpis.apps)} sub={pct(kpis.apps, kpis.humanQL) + ' of QL'} accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.total} />
            <PremKPI label="OFFERS" value={fmtN(kpis.offers)} sub={pct(kpis.offers, kpis.apps) + ' of apps'} accent={C.blue} accentBg={C.blueBg} icon={KPI_ICONS.agent} />
            <PremKPI label="DEPOSITS" value={fmtN(kpis.deposits)} sub={pct(kpis.deposits, kpis.offers) + ' of offers'} accent={C.cyan} accentBg={C.cyanBg} icon={KPI_ICONS.globe} />
            <PremKPI label="TOTAL RAUs" value={fmtN(kpis.raus)} sub="revenue attr. units" accent={C.green} accentBg={C.greenBg} icon={KPI_ICONS.bot} />
          </div>

          {/* FUNNEL */}
          <Card>
            {sectionTitle('Overall funnel', 'lead → revenue path for the selected period and source')}
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={funnel} layout="vertical" margin={{ left:20, right:50, top:4, bottom:4 }}>
                <CartesianGrid horizontal={false} stroke={C.border} />
                <XAxis type="number" tick={axis} axisLine={false} tickLine={false} tickFormatter={fmtN} />
                <YAxis type="category" dataKey="stage" tick={axis} axisLine={false} tickLine={false} width={110} />
                <Tooltip content={<BrandTooltip />} cursor={{ fill:'rgba(31,60,132,0.04)' }} />
                <Bar dataKey="count" name="Count" radius={[0, 6, 6, 0]} barSize={22}>
                  {funnel.map((e, i) => <Cell key={i} fill={brandColor(i)} />)}
                  <LabelList dataKey="count" position="right" formatter={fmtN} style={{ fontSize:11, fontWeight:700, fill:C.sub }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* SOURCE BREAKDOWN + MONTH TREND */}
          <div style={grid2}>
            <Card>
              {sectionTitle('Leads by source', 'top sources this period')}
              <RankedBars data={bySource.slice(0, 8).map(s => ({ source:s.source, count:s.leads }))} labelKey="source" max={maxSourceLeads} total={totalSourceLeads} colorFn={brandColor} showRank />
            </Card>
            <Card>
              {sectionTitle('Month-on-month trend', 'leads, queued, human QL and deposits by month')}
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={byMonth} margin={{ left:0, right:12, top:4, bottom:4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
                  <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={fmtN} />
                  <Tooltip content={<BrandTooltip />} />
                  <Legend wrapperStyle={{ fontSize:11, fontFamily:FONT }} />
                  <Line type="monotone" dataKey="leads" name="Leads" stroke={C.navy} strokeWidth={2.5} dot={{ r:3 }} />
                  <Line type="monotone" dataKey="queued" name="Total Queued" stroke={C.blue} strokeWidth={2.5} dot={{ r:3 }} />
                  <Line type="monotone" dataKey="humanQL" name="Human QL" stroke={C.cyan} strokeWidth={2.5} dot={{ r:3 }} />
                  <Line type="monotone" dataKey="deposits" name="Deposits" stroke={C.green} strokeWidth={2.5} dot={{ r:3 }} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* GROUPED SUMMARY TABLE */}
          <div style={{ marginTop:16 }}>
            <Card
              action={
                <div style={{ display:'flex', gap:6 }}>
                  {[['source', 'Source'], ['month', 'Month']].map(([v, l]) => (
                    <button key={v} onClick={() => setGrpBy(v)} style={{ padding:'5px 12px', borderRadius:8, border:'0.5px solid ' + (grpBy === v ? C.navy : '#E5E7EB'), background: grpBy === v ? C.navy : '#fff', color: grpBy === v ? '#fff' : '#374151', fontSize:11.5, fontWeight:700, cursor:'pointer', fontFamily:FONT }}>{l}</button>
                  ))}
                </div>
              }
            >
              {sectionTitle('Funnel summary by ' + grpBy, 'full-funnel totals and stage conversion rates')}
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5, fontFamily:FONT }}>
                  <thead>
                    <tr style={{ background:'#F8FAFC', borderBottom:'2px solid #E2E8F0' }}>
                      {[grpBy === 'source' ? 'Source' : 'Month', 'Leads', 'Total Queued', 'Human QL', 'Applications', 'Offers', 'Deposits', 'RAUs', 'QL %', 'App %', 'Deposit %'].map((h, i) => (
                        <th key={h} style={{ padding:'9px ' + (i === 0 ? '12px' : '8px'), fontSize:9.5, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'#64748B', textAlign: i === 0 ? 'left' : 'right', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {grouped.map((g, i) => (
                      <tr key={g.label} style={{ background: i % 2 === 0 ? '#fff' : '#FAFBFC' }}>
                        <td style={{ padding:'9px 12px', fontWeight:600, color:'#0F172A' }}>{g.label}</td>
                        <td style={{ padding:'9px 8px', textAlign:'right', fontWeight:700, color:'#0F172A' }}>{fmtN(g.leads)}</td>
                        <td style={{ padding:'9px 8px', textAlign:'right', color:'#475569' }}>{fmtN(g.queued)}</td>
                        <td style={{ padding:'9px 8px', textAlign:'right', color:'#475569' }}>{fmtN(g.humanQL)}</td>
                        <td style={{ padding:'9px 8px', textAlign:'right', color:'#475569' }}>{fmtN(g.apps)}</td>
                        <td style={{ padding:'9px 8px', textAlign:'right', color:'#475569' }}>{fmtN(g.offers)}</td>
                        <td style={{ padding:'9px 8px', textAlign:'right', color:'#475569' }}>{fmtN(g.deposits)}</td>
                        <td style={{ padding:'9px 8px', textAlign:'right', fontWeight:700, color:C.navy }}>{fmtN(g.raus)}</td>
                        <td style={{ padding:'9px 8px', textAlign:'right', color:C.cyan, fontWeight:600 }}>{pct(g.humanQL, g.queued)}</td>
                        <td style={{ padding:'9px 8px', textAlign:'right', color:C.blue, fontWeight:600 }}>{pct(g.apps, g.humanQL)}</td>
                        <td style={{ padding:'9px 8px', textAlign:'right', color:C.green, fontWeight:600 }}>{pct(g.deposits, g.offers)}</td>
                      </tr>
                    ))}
                    {grouped.length === 0 && (
                      <tr><td colSpan={11} style={{ padding:'20px', textAlign:'center', color:'#94A3B8' }}>No data for this selection.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

        </div>
      </div>
    </div>
  )
}
