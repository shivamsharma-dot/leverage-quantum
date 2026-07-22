import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList,
  CartesianGrid, LineChart, Line, Legend, AreaChart, Area,
} from 'recharts'
import Sidebar from '../components/Sidebar'
import { DashboardSkeleton } from '../components/SkeletonLoader'
import ExportButton from '../components/ExportButton'
import Button from '../components/Button'
import { getSession, setSession, hasLoaded, getPersisted } from '../lib/sessionLoad'
import { classifyCorridor, corridorLabel } from '../lib/corridors'
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
const dayKey = d => { const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),dd=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}` }
const dayLabel = d => `${d.getDate()} ${MN[d.getMonth()]}`

function parseNum(v) {
  if (v == null) return 0
  const s = String(v).trim()
  if (!s || s === '—' || s === '-' || /^n\/?a$/i.test(s)) return 0
  const n = parseFloat(s.replace(/,/g, ''))
  return isNaN(n) ? 0 : n
}

function mapRow(r) {
  const d = parseD(r.lead_date)
  const humanQL = parseNum(r['Futwork Human QL'])
  const futworkAiQl = parseNum(r['Futwork AI QL'])
  const superbotAiQl = parseNum(r['Superbot AI QL'])
  return {
    date: d,
    mk: d ? monthKey(d) : null,
    source: (r.Source || '').trim() || 'Unknown',
    campaign: (r.campaign_name || '').trim(),
    leads: parseNum(r['Total Leads Generated']),
    floorQueued: parseNum(r.floor_queued),
    futworkQ: parseNum(r['Queued on Futwork']),
    superbotQ: parseNum(r['Queued on Superbot']),
    humanQL, futworkAiQl, superbotAiQl,
    // Total QLs -- every qualification channel combined (Futwork Human + Futwork AI + Superbot AI).
    totalQL: humanQL + futworkAiQl + superbotAiQl,
    apps: parseNum(r['Total Apps']),
    offers: parseNum(r['Total Offers']),
    deposits: parseNum(r['Total Deposits']),
    raus: parseNum(r['Total RAUs']),
    spend: parseNum(r['Total_Spends']),
  }
}

// ── Header controls — ported verbatim (styling + behavior) from the Daily QLs
// page under QL Ops (LeadQualificationDashboard.jsx), per instruction to match
// that header exactly: pill/Dropdown/DateRangePicker components below are the
// same components, just re-declared here since they're local to that file.

function Dropdown({ options, value, onChange, label, minWidth = 120 }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6 }} ref={ref}>
      {label && <span style={{ fontSize:11, color:C.muted, fontFamily:FONT, whiteSpace:'nowrap' }}>{label}</span>}
      <div style={{ position:'relative' }}>
        <button onClick={() => setOpen(v => !v)} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px 6px 12px', borderRadius:8, border:`0.5px solid ${open ? C.navy : C.border}`, background: open ? C.navyBg : 'var(--card)', color:C.text, cursor:'pointer', fontFamily:FONT, fontSize:12, fontWeight:600, minWidth, boxShadow: open ? '0 0 0 3px rgba(31,60,132,0.08)' : 'none', transition:'all .15s', whiteSpace:'nowrap' }}>
          <span style={{ flex:1, textAlign:'left' }}>{value}</span>
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ flexShrink:0, transition:'transform .2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
            <path d="M1 1l4 4 4-4" stroke={C.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {open && (
          <div style={{ position:'absolute', top:'calc(100% + 6px)', left:0, zIndex:500, background:'var(--card)', border:`0.5px solid ${C.border}`, borderRadius:12, boxShadow:'0 16px 40px rgba(15,23,42,0.14), 0 2px 8px rgba(15,23,42,0.06)', padding:6, minWidth:Math.max(minWidth, 150), maxHeight:280, overflowY:'auto' }}>
            {options.map(opt => {
              const active = opt === value
              return (
                <button key={opt} onClick={() => { onChange(opt); setOpen(false) }} style={{ display:'block', width:'100%', textAlign:'left', padding:'8px 12px', borderRadius:8, border:'none', cursor:'pointer', fontFamily:FONT, fontSize:12.5, fontWeight: active ? 700 : 400, background: active ? C.navyBg : 'transparent', color: active ? C.navy : C.text }}>
                  <span style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                    {opt}
                    {active && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.navy} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// Campaign search — free-text filter with a ranked autocomplete list (top campaigns
// by leads shown by default, narrowed by substring match as the user types) since
// campaign name is how people actually look things up on this page.
function CampaignSearch({ value, onChange, suggestions, minWidth = 210 }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div style={{ position:'relative' }} ref={ref}>
      <div style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 10px', borderRadius:8, border:`0.5px solid ${open ? C.navy : C.border}`, background: open ? C.navyBg : 'var(--card)', minWidth, boxShadow: open ? '0 0 0 3px rgba(31,60,132,0.08)' : 'none', transition:'all .15s' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
        <input
          value={value}
          onChange={e => { onChange(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="Search campaign…"
          style={{ border:'none', outline:'none', background:'transparent', fontFamily:FONT, fontSize:12, fontWeight:600, color:C.text, width:'100%' }}
        />
        {value && (
          <button onClick={() => { onChange(''); setOpen(false) }} style={{ border:'none', background:'transparent', cursor:'pointer', color:C.muted, display:'flex', padding:0, flexShrink:0 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        )}
      </div>
      {open && suggestions.length > 0 && (
        <div style={{ position:'absolute', top:'calc(100% + 6px)', left:0, zIndex:500, background:'var(--card)', border:`0.5px solid ${C.border}`, borderRadius:12, boxShadow:'0 16px 40px rgba(15,23,42,0.14), 0 2px 8px rgba(15,23,42,0.06)', padding:6, minWidth:Math.max(minWidth, 280), maxHeight:280, overflowY:'auto' }}>
          <div style={{ fontSize:10, fontWeight:700, color:C.muted, letterSpacing:'0.06em', textTransform:'uppercase', padding:'4px 8px 6px' }}>{value.trim() ? 'Matching campaigns' : 'Top campaigns'}</div>
          {suggestions.map(s => (
            <button key={s.name} onClick={() => { onChange(s.name); setOpen(false) }}
              style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, width:'100%', textAlign:'left', padding:'8px 10px', borderRadius:8, border:'none', cursor:'pointer', fontFamily:FONT, background:'transparent' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg3)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
              <span style={{ fontSize:12.5, fontWeight:600, color:C.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.name}</span>
              <span style={{ fontSize:11, fontWeight:700, color:C.navy, flexShrink:0 }}>{fmtN(s.leads)}</span>
            </button>
          ))}
        </div>
      )}
      {open && value.trim() && suggestions.length === 0 && (
        <div style={{ position:'absolute', top:'calc(100% + 6px)', left:0, zIndex:500, background:'var(--card)', border:`0.5px solid ${C.border}`, borderRadius:12, boxShadow:'0 16px 40px rgba(15,23,42,0.14)', padding:'10px 12px', minWidth:Math.max(minWidth, 280), fontSize:12, color:C.muted, fontFamily:FONT }}>
          No campaign names match "{value}"
        </div>
      )}
    </div>
  )
}

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAYS = ['Su','Mo','Tu','We','Th','Fr','Sa']

function CalMonth({ year, month, from, to, hovered, onSelect, onHover }) {
  const first = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0).getDate()
  const startDow = first.getDay()
  const cells = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= lastDay; d++) cells.push(new Date(year, month, d))
  return (
    <div style={{ width:220 }}>
      <div style={{ textAlign:'center', fontWeight:700, fontSize:13, color:C.text, marginBottom:8, fontFamily:FONT }}>{MONTHS_SHORT[month]} {year}</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2, marginBottom:4 }}>
        {DAYS.map(d => <div key={d} style={{ textAlign:'center', fontSize:10, fontWeight:700, color:C.muted, padding:'2px 0', fontFamily:FONT }}>{d}</div>)}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
        {cells.map((date, i) => {
          if (!date) return <div key={'e'+i} />
          const ts = date.getTime()
          const fromTs = from ? from.getTime() : null
          const toTs = (to || hovered) ? (to || hovered).getTime() : null
          const isFrom = fromTs && ts === fromTs
          const isTo = toTs && ts === toTs && from
          const inRange = fromTs && toTs && ts > Math.min(fromTs, toTs) && ts < Math.max(fromTs, toTs)
          const today = new Date(); today.setHours(0, 0, 0, 0)
          const isToday = ts === today.getTime()
          let bg = 'transparent', color = C.text
          if (isFrom || isTo) { bg = C.navy; color = 'var(--card)' }
          else if (inRange) { bg = C.navyBg; color = C.navy }
          return (
            <button key={ts} onClick={() => onSelect(date)} onMouseEnter={() => onHover(date)} onMouseLeave={() => onHover(null)}
              style={{ width:'100%', aspectRatio:'1', border:'none', cursor:'pointer', borderRadius:6, background:bg, color, fontSize:11.5, fontWeight: isFrom || isTo ? 700 : isToday ? 600 : 400, fontFamily:FONT, position:'relative', transition:'background .1s' }}>
              {date.getDate()}
              {isToday && !isFrom && !isTo && <span style={{ position:'absolute', bottom:2, left:'50%', transform:'translateX(-50%)', width:4, height:4, borderRadius:'50%', background:C.blue, display:'block' }} />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const fmt = d => { if (!d) return ''; const y=d.getFullYear(),mo=String(d.getMonth()+1).padStart(2,'0'),dy=String(d.getDate()).padStart(2,'0'); return `${y}-${mo}-${dy}` }

function DateRangePicker({ from, to, onChange }) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [hovered, setHovered] = useState(null)
  const [selFrom, setSelFrom] = useState(from || null)
  const [selTo, setSelTo] = useState(to || null)
  const [step, setStep] = useState(from ? 'to' : 'from')

  const handleSelect = date => {
    if (step === 'from' || selTo) { setSelFrom(date); setSelTo(null); setStep('to') }
    else { if (date < selFrom) { setSelFrom(date); setSelTo(selFrom) } else { setSelTo(date) }; setStep('from') }
  }
  const right = viewMonth === 11 ? { y: viewYear + 1, m: 0 } : { y: viewYear, m: viewMonth + 1 }
  const canApply = selFrom && selTo
  const NavBtn = ({ dir, onClick }) => (
    <button onClick={onClick} style={{ width:28, height:28, borderRadius:7, border:`0.5px solid ${C.border}`, background:'var(--card)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:C.sub }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">{dir === 'left' ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}</svg>
    </button>
  )
  const goLeft = () => viewMonth === 0 ? (setViewYear(y => y - 1), setViewMonth(11)) : setViewMonth(m => m - 1)
  const goRight = () => viewMonth === 11 ? (setViewYear(y => y + 1), setViewMonth(0)) : setViewMonth(m => m + 1)

  return (
    <div style={{ padding:'16px 20px', fontFamily:FONT }}>
      <div style={{ display:'flex', gap:8, marginBottom:14, alignItems:'center' }}>
        <div style={{ flex:1, padding:'6px 10px', borderRadius:8, border:`1.5px solid ${step === 'from' ? C.navy : C.border}`, background: step === 'from' ? C.navyBg : '#FAFAFA', fontSize:12, fontWeight:600, color: selFrom ? C.text : C.muted, fontFamily:FONT, cursor:'pointer' }} onClick={() => setStep('from')}>{selFrom ? fmt(selFrom) : 'Start date'}</div>
        <svg width="16" height="10" viewBox="0 0 16 10" fill="none"><path d="M0 5h14M10 1l4 4-4 4" stroke={C.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <div style={{ flex:1, padding:'6px 10px', borderRadius:8, border:`1.5px solid ${step === 'to' && selFrom ? C.navy : C.border}`, background: step === 'to' && selFrom ? C.navyBg : '#FAFAFA', fontSize:12, fontWeight:600, color: selTo ? C.text : C.muted, fontFamily:FONT, cursor: selFrom ? 'pointer' : 'default' }} onClick={() => selFrom && setStep('to')}>{selTo ? fmt(selTo) : 'End date'}</div>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:4, marginBottom:12 }}>
        <NavBtn dir="left" onClick={goLeft} /><div style={{ flex:1 }} /><NavBtn dir="right" onClick={goRight} />
      </div>
      <div style={{ display:'flex', gap:24 }}>
        <CalMonth year={viewYear} month={viewMonth} from={selFrom} to={selTo} hovered={step === 'to' ? hovered : null} onSelect={handleSelect} onHover={step === 'to' ? setHovered : () => {}} />
        <CalMonth year={right.y} month={right.m} from={selFrom} to={selTo} hovered={step === 'to' ? hovered : null} onSelect={handleSelect} onHover={step === 'to' ? setHovered : () => {}} />
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:14, paddingTop:12, borderTop:'0.5px solid #F1F5F9' }}>
        <Button onClick={() => { setSelFrom(null); setSelTo(null); setStep('from') }} variant="secondary" size="sm">Clear</Button>
        <Button onClick={() => canApply && onChange(fmt(selFrom), fmt(selTo))} disabled={!canApply} size="sm">Apply range</Button>
      </div>
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
const grid2 = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }

// Heat scale for conversion rates — brand colors only (no red/amber on data), matching
// the convention used elsewhere in the app (navy = needs attention, green = strong).
const heatColor = v => v == null ? C.muted : v >= 50 ? C.green : v >= 25 ? C.cyan : v >= 10 ? C.blue : C.navy
const heatBg = v => v == null ? 'transparent' : v >= 50 ? C.greenBg : v >= 25 ? C.cyanBg : v >= 10 ? C.blueBg : C.navyBg

// ── Grouped summary table — customizable columns (show/hide + reorder, persisted to
// localStorage so the layout sticks between sessions), sortable headers, search, and a
// per-view export button — same "creative table" pattern as Meta Ads Creatives.
const SUMMARY_COLUMNS = [
  { key:'leads', label:'Leads' },
  { key:'spend', label:'Spend' },
  { key:'queued', label:'Total Queued' },
  { key:'humanQL', label:'Futwork Human QL' },
  { key:'futworkAiQl', label:'Futwork AI QL' },
  { key:'superbotAiQl', label:'Superbot AI QL' },
  { key:'totalQL', label:'Total QLs' },
  { key:'apps', label:'Applications' },
  { key:'offers', label:'Offers' },
  { key:'deposits', label:'Deposits' },
  { key:'raus', label:'RAUs' },
  { key:'qlPct', label:'QL %' },
  { key:'appPct', label:'App %' },
  { key:'depositPct', label:'Deposit %' },
  { key:'cpl', label:'CPL' },
  { key:'cpql', label:'CPQL' },
  { key:'cpa', label:'CPA' },
  { key:'estSrRevenue', label:'Est. SR Revenue' },
  { key:'actSrRevenue', label:'Actual SR Revenue' },
]
const SUMMARY_COLUMN_KEYS = SUMMARY_COLUMNS.map(c => c.key)
const SUMMARY_COLS_STORAGE_KEY = 'lq_overall_summary_visible_cols'
const SUMMARY_ORDER_STORAGE_KEY = 'lq_overall_summary_col_order'
const SR_EST_RATE_KEY = 'lq_overall_sr_est_rate'
const SR_ACT_RATE_KEY = 'lq_overall_sr_act_rate'
const SR_DEFAULT_RATE = 350000

// Full INR formatter — every rupee figure on this page displays in full (no Cr/L
// shorthand); the abbreviated form is only ever surfaced as a hover tooltip via fmtINRShort.
function fmtINR(n) {
  n = parseFloat(n) || 0
  return '₹' + Math.round(n).toLocaleString('en-IN')
}
// Cr/L shorthand — used ONLY for the title="" tooltip on money values, never as the
// displayed text.
function fmtINRShort(n) {
  n = parseFloat(n) || 0
  if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr'
  if (n >= 1e5) return '₹' + (n / 1e5).toFixed(1) + 'L'
  return '₹' + Math.round(n).toLocaleString('en-IN')
}

function summaryValue(g, key) {
  if (key === 'qlPct') return g.queued > 0 ? (g.totalQL / g.queued) * 100 : 0
  if (key === 'appPct') return g.totalQL > 0 ? (g.apps / g.totalQL) * 100 : 0
  if (key === 'depositPct') return g.offers > 0 ? (g.deposits / g.offers) * 100 : 0
  if (key === 'cpl') return g.leads > 0 ? g.spend / g.leads : 0
  if (key === 'cpql') return g.totalQL > 0 ? g.spend / g.totalQL : 0
  if (key === 'cpa') return g.apps > 0 ? g.spend / g.apps : 0
  return g[key]
}
function summaryFmt(key, v) {
  if (v == null) return '—'
  if (key.endsWith('Pct')) return v.toFixed(1) + '%'
  if (key.endsWith('SrRevenue') || key === 'spend' || key === 'cpl' || key === 'cpql' || key === 'cpa') return fmtINR(v)
  return fmtN(v)
}
function summaryColor(key) {
  if (key === 'raus') return C.navy
  if (key === 'qlPct') return C.cyan
  if (key === 'appPct') return C.blue
  if (key === 'depositPct') return C.green
  if (key === 'leads') return '#0F172A'
  if (key === 'spend') return C.navy
  if (key === 'cpl') return C.blue
  if (key === 'cpql') return C.cyan
  if (key === 'cpa') return C.green
  if (key === 'estSrRevenue') return C.blue
  if (key === 'actSrRevenue') return C.green
  return '#475569'
}
const SUMMARY_BOLD_COLS = ['leads', 'spend', 'raus', 'qlPct', 'appPct', 'depositPct', 'estSrRevenue', 'actSrRevenue']

// Show/hide + reorder popover for the summary table's columns.
function ColumnsPicker({ order, visible, onToggle, onMove, onClose, onReset }) {
  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:399 }} />
      <div style={{ position:'absolute', right:0, top:'calc(100% + 6px)', zIndex:400, background:'var(--card)', border:`0.5px solid ${C.border}`, borderRadius:12, boxShadow:'0 16px 40px rgba(15,23,42,0.14), 0 2px 8px rgba(15,23,42,0.06)', padding:8, minWidth:230, maxHeight:340, overflowY:'auto' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'4px 8px 8px' }}>
          <span style={{ fontSize:10, fontWeight:700, color:C.muted, letterSpacing:'0.06em', textTransform:'uppercase' }}>Columns — show, hide, reorder</span>
          <Button onClick={onReset} variant="ghost" size="sm" style={{ padding:'2px 8px' }}>Reset</Button>
        </div>
        {order.map((key, i) => {
          const col = SUMMARY_COLUMNS.find(c => c.key === key)
          if (!col) return null
          const isVisible = visible.includes(key)
          return (
            <div key={key} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 8px', borderRadius:8 }}>
              <label style={{ display:'flex', alignItems:'center', gap:8, flex:1, cursor:'pointer', minWidth:0 }}>
                <input type="checkbox" checked={isVisible} onChange={() => onToggle(key)} style={{ width:14, height:14, cursor:'pointer', accentColor:C.navy, flexShrink:0 }} />
                <span style={{ fontSize:12.5, fontWeight: isVisible ? 600 : 400, color: isVisible ? C.text : C.muted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{col.label}</span>
              </label>
              <div style={{ display:'flex', gap:2, flexShrink:0 }}>
                <button onClick={() => onMove(key, -1)} disabled={i === 0} title="Move up" style={{ width:22, height:22, borderRadius:6, border:'none', background:'transparent', color: i === 0 ? '#CBD5E1' : C.muted, cursor: i === 0 ? 'default' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
                </button>
                <button onClick={() => onMove(key, 1)} disabled={i === order.length - 1} title="Move down" style={{ width:22, height:22, borderRadius:6, border:'none', background:'transparent', color: i === order.length - 1 ? '#CBD5E1' : C.muted, cursor: i === order.length - 1 ? 'default' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

// Compact "does the funnel actually convert" strip — stage-to-stage conversion, not just
// raw counts, since that's what tells a marketer where the real leak is.
function ConversionChain({ steps }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:`repeat(${steps.length}, minmax(0,1fr))`, gap:10, marginTop:16 }}>
      {steps.map((s, i) => (
        <div key={i} style={{ padding:'10px 12px', borderRadius:10, background: heatBg(s.rate), border:'0.5px solid #EEF1F6', minWidth:0 }}>
          <div style={{ fontSize:9.5, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.05em', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{s.from} → {s.to}</div>
          <div style={{ fontSize:18, fontWeight:800, color: heatColor(s.rate), marginTop:3 }}>{s.rate == null ? '—' : s.rate.toFixed(1) + '%'}</div>
        </div>
      ))}
    </div>
  )
}

// Ranked efficiency leaderboard (percentage-based, not volume-based) — reuses the same
// visual language as RankedBars (numbered chip + bar + value) but the bar length and
// color both encode a conversion RATE (0-100%) rather than a raw count.
function EfficiencyList({ data, labelKey, rateKey, subKey }) {
  if (!data.length) return <div style={{ textAlign:'center', padding:'24px 0', color:C.muted, fontSize:13, fontFamily:FONT }}>Not enough volume yet</div>
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
      {data.map((r, i) => {
        const rate = r[rateKey]
        const col = heatColor(rate)
        return (
          <div key={r[labelKey] + i} style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:20, textAlign:'center', fontSize:10, fontWeight:800, color:'#fff', background:col, borderRadius:6, padding:'2px 0', flexShrink:0 }}>{i + 1}</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4, alignItems:'baseline', gap:8 }}>
                <span style={{ fontSize:12, fontWeight:600, color:C.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r[labelKey]}</span>
                <span style={{ fontSize:12.5, fontWeight:800, color:col, flexShrink:0, fontVariantNumeric:'tabular-nums' }}>{rate.toFixed(1)}%</span>
              </div>
              <div style={{ height:7, borderRadius:99, background:'#F1F5F9', overflow:'hidden' }}>
                <div style={{ height:'100%', width:Math.min(rate, 100) + '%', borderRadius:99, background:`linear-gradient(90deg,${col},${col}cc)` }} />
              </div>
            </div>
            <div style={{ fontSize:10.5, color:C.muted, width:60, textAlign:'right', flexShrink:0, fontVariantNumeric:'tabular-nums' }}>{fmtN(r[subKey])} q'd</div>
          </div>
        )
      })}
    </div>
  )
}

export default function OverallDashboard() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastSync, setLastSync] = useState(null)
  const [source, setSource] = useState('All')
  const [campaignQuery, setCampaignQuery] = useState('')
  const [showInfo, setShowInfo] = useState(false)
  const [grpBy, setGrpBy] = useState('source')

  // Compare — decision-focused period comparison. 'prev' reuses the exact same
  // previous-equivalent-period logic already computed for the KPI delta arrows
  // (prevWindow/prevFiltered/prevKpis below); 'yoy' shifts the same window back
  // exactly one year; 'custom' lets the marketer pick an arbitrary second range.
  const [compareOpen, setCompareOpen] = useState(false)
  const [compareMode, setCompareMode] = useState('prev') // 'prev' | 'yoy' | 'custom'
  const [compareCustomFrom, setCompareCustomFrom] = useState('')
  const [compareCustomTo, setCompareCustomTo] = useState('')
  // In custom mode BOTH sides must be user-editable -- otherwise "period A" silently
  // stays locked to whatever the main page filter happens to be (e.g. the whole
  // month), while only "period B" is the custom pick, comparing a full month
  // against a single day and producing a nonsense delta. Prefilled from the page's
  // active window/previous-window so the modal opens with a sane apples-to-apples
  // comparison instead of blank fields.
  const [compareCustomFromA, setCompareCustomFromA] = useState('')
  const [compareCustomToA, setCompareCustomToA] = useState('')

  // Summary table customization — search, sortable columns, show/hide + reorder columns
  // (persisted), row limit. Mirrors the Meta Ads Creatives table's "customizable" pattern.
  const [tableSearch, setTableSearch] = useState('')
  const [sortKey, setSortKey] = useState('leads')
  const [sortDir, setSortDir] = useState('desc')
  const [rowLimit, setRowLimit] = useState(25)
  const [showColsPicker, setShowColsPicker] = useState(false)
  const [showRatesPicker, setShowRatesPicker] = useState(false)
  const [estRate, setEstRate] = useState(() => { try { const s = localStorage.getItem(SR_EST_RATE_KEY); return s ? Number(s) : SR_DEFAULT_RATE } catch { return SR_DEFAULT_RATE } })
  const [actRate, setActRate] = useState(() => { try { const s = localStorage.getItem(SR_ACT_RATE_KEY); return s ? Number(s) : SR_DEFAULT_RATE } catch { return SR_DEFAULT_RATE } })
  useEffect(() => { try { localStorage.setItem(SR_EST_RATE_KEY, String(estRate)) } catch {} }, [estRate])
  useEffect(() => { try { localStorage.setItem(SR_ACT_RATE_KEY, String(actRate)) } catch {} }, [actRate])
  const [visibleCols, setVisibleCols] = useState(() => {
    try { const s = localStorage.getItem(SUMMARY_COLS_STORAGE_KEY); const parsed = s ? JSON.parse(s) : null; return Array.isArray(parsed) ? parsed.filter(k => SUMMARY_COLUMN_KEYS.includes(k)) : SUMMARY_COLUMN_KEYS }
    catch { return SUMMARY_COLUMN_KEYS }
  })
  const [colOrder, setColOrder] = useState(() => {
    try {
      const s = localStorage.getItem(SUMMARY_ORDER_STORAGE_KEY)
      const parsed = s ? JSON.parse(s) : null
      const base = Array.isArray(parsed) ? parsed.filter(k => SUMMARY_COLUMN_KEYS.includes(k)) : []
      const missing = SUMMARY_COLUMN_KEYS.filter(k => !base.includes(k))
      return [...base, ...missing]
    } catch { return SUMMARY_COLUMN_KEYS }
  })
  useEffect(() => { try { localStorage.setItem(SUMMARY_COLS_STORAGE_KEY, JSON.stringify(visibleCols)) } catch {} }, [visibleCols])
  useEffect(() => { try { localStorage.setItem(SUMMARY_ORDER_STORAGE_KEY, JSON.stringify(colOrder)) } catch {} }, [colOrder])
  const toggleCol = key => setVisibleCols(v => v.includes(key) ? v.filter(k => k !== key) : [...v, key])
  const moveCol = (key, dir) => setColOrder(order => {
    const idx = order.indexOf(key); const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= order.length) return order
    const next = [...order];[next[idx], next[swapIdx]] = [next[swapIdx], next[idx]]
    return next
  })
  // Drag-and-drop reordering directly on the table's column headers (in addition
  // to the up/down arrows in the Columns popover) -- drag one header onto another
  // to move it there. dragOverKey drives a live insertion-point indicator so the
  // drop target is visible while dragging, not just after release.
  const [dragKey, setDragKey] = useState(null)
  const [dragOverKey, setDragOverKey] = useState(null)
  const reorderColumns = (fromKey, toKey) => {
    if (!fromKey || fromKey === toKey) return
    setColOrder(order => {
      if (!order.includes(fromKey) || !order.includes(toKey)) return order
      const next = order.filter(k => k !== fromKey)
      next.splice(next.indexOf(toKey), 0, fromKey)
      return next
    })
  }
  const handleSort = key => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }
  const resetCols = () => { setVisibleCols(SUMMARY_COLUMN_KEYS); setColOrder(SUMMARY_COLUMN_KEYS) }

  // Date filter state — mirrors Daily QLs exactly: a single "active filter" is either
  // a preset (LD/L7D/MTD), the month picker, or a custom calendar range.
  const [datePreset, setDatePreset] = useState('month') // 'LD' | 'L7D' | 'MTD' | 'custom' | 'month'
  const [selMonth, setSelMonth] = useState('') // month label e.g. "Jul'26"
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [hoveredPreset, setHoveredPreset] = useState(null)
  const hasSetInitial = useRef(false)
  const CACHE_KEY = 'overall'

  const applyCsv = useCallback((txt) => {
    const mapped = parseCSV(txt).map(mapRow)
    setRows(mapped)
    if (!hasSetInitial.current) {
      const ms = [...new Set(mapped.filter(r => r.mk != null).map(r => r.mk))].sort((a, b) => a - b)
      if (ms.length) {
        const curKey = monthKey(new Date())
        const defMk = ms.includes(curKey) ? curKey : ms[ms.length - 1]
        setSelMonth(monthLabel(defMk))
      }
      hasSetInitial.current = true
    }
  }, [])

  // Fetch-once-per-session (mirrors QL Ops/WhatsApp/Referral): if this tab already
  // loaded Overall this session, reuse it instantly instead of re-fetching+re-parsing
  // the full sheet on every SPA navigation back to this page. On a genuinely cold
  // load (fresh tab, nothing loaded yet this session) paint instantly from the last
  // known-good snapshot persisted in localStorage -- if one exists -- while a real
  // fetch runs in the background, so the page never sits on a blank spinner for as
  // long as the CSV takes to download when we already have something to show.
  const loadData = useCallback(async (bust = false) => {
    if (!bust && hasLoaded(CACHE_KEY)) {
      applyCsv(getSession(CACHE_KEY).data)
      setLastSync(new Date(getSession(CACHE_KEY).ts))
      setLoading(false)
      return
    }
    let paintedFromCache = false
    if (!bust) {
      const persisted = getPersisted(CACHE_KEY)
      if (persisted) {
        applyCsv(persisted.data)
        setLastSync(new Date(persisted.ts))
        setLoading(false)
        paintedFromCache = true
      }
    }
    if (!paintedFromCache) setLoading(true)
    try {
      const base = await resolveOverallUrl()
      const u = bust ? base + (base.includes('?') ? '&' : '?') + '_=' + Date.now() : base
      const res = await fetch(u)
      const txt = await res.text()
      applyCsv(txt)
      setSession(CACHE_KEY, txt)
      setLastSync(new Date())
      setError(null)
    } catch (e) {
      if (!paintedFromCache) setError('Failed to load: ' + e.message)
    }
    finally { setLoading(false) }
  }, [applyCsv])
  useEffect(() => { loadData() }, [loadData])

  const months = useMemo(() => {
    const set = new Set(rows.filter(r => r.mk != null).map(r => r.mk))
    return [...set].sort((a, b) => a - b)
  }, [rows])
  const monthOptions = useMemo(() => ['All months', ...[...months].reverse().map(monthLabel)], [months])
  const monthKeyByLabel = useMemo(() => new Map(months.map(mk => [monthLabel(mk), mk])), [months])

  const sources = useMemo(() => {
    const set = new Set(rows.map(r => r.source))
    return ['All', ...[...set].sort()]
  }, [rows])

  // Master campaign list — scoped to the FULL dataset (not the active period/source
  // filters) so a campaign that only shows up in an earlier month is still searchable
  // right now, ranked by total leads (most-relevant / most-searched proxy) on top.
  const campaignOptions = useMemo(() => {
    const m = new Map()
    rows.forEach(r => { if (!r.campaign) return; m.set(r.campaign, (m.get(r.campaign) || 0) + r.leads) })
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, leads]) => ({ name, leads }))
  }, [rows])
  const campaignSuggestions = useMemo(() => {
    const q = campaignQuery.trim().toLowerCase()
    const list = q ? campaignOptions.filter(c => c.name.toLowerCase().includes(q)) : campaignOptions
    return list.slice(0, 8)
  }, [campaignOptions, campaignQuery])

  // Is the selected month the current calendar month?
  const isCurrentMonth = useMemo(() => {
    const mk = monthKeyByLabel.get(selMonth)
    if (mk == null) return false
    return mk === monthKey(new Date())
  }, [selMonth, monthKeyByLabel])

  const activeFilter = datePreset === 'custom' ? 'custom' : (datePreset === 'month') ? 'month' : 'preset'

  const dateWindow = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    if (datePreset === 'LD') { const y = new Date(today); y.setDate(today.getDate() - 1); return { from:y, to:y, label:'Last Day' } }
    if (datePreset === 'L7D') { const y = new Date(today); y.setDate(today.getDate() - 1); const f = new Date(y); f.setDate(y.getDate() - 6); return { from:f, to:y, label:'Last 7 days' } }
    if (datePreset === 'MTD') { const f = new Date(today.getFullYear(), today.getMonth(), 1); return { from:f, to:today, label:'MTD ' + today.toLocaleString('default', { month:'short', year:'numeric' }) } }
    if (datePreset === 'custom' && customFrom && customTo) {
      const [fy, fm, fd] = customFrom.split('-').map(Number); const cf = new Date(fy, fm - 1, fd); cf.setHours(0, 0, 0, 0)
      const [ty, tm, td] = customTo.split('-').map(Number); const ct = new Date(ty, tm - 1, td); ct.setHours(23, 59, 59, 999)
      return { from:cf, to:ct, label:customFrom + ' -> ' + customTo }
    }
    return null
  }, [datePreset, customFrom, customTo])

  const dateFilteredRows = useMemo(() => {
    if (!dateWindow) {
      const mk = monthKeyByLabel.get(selMonth)
      return mk == null ? rows : rows.filter(r => r.mk === mk)
    }
    return rows.filter(r => r.date && r.date >= dateWindow.from && r.date <= dateWindow.to)
  }, [rows, dateWindow, selMonth, monthKeyByLabel])

  const filtered = useMemo(() => {
    let rs = source === 'All' ? dateFilteredRows : dateFilteredRows.filter(r => r.source === source)
    const q = campaignQuery.trim().toLowerCase()
    if (q) rs = rs.filter(r => r.campaign.toLowerCase().includes(q))
    return rs
  }, [dateFilteredRows, source, campaignQuery])

  const sumKpis = list => {
    const sum = k => list.reduce((t, r) => t + r[k], 0)
    return {
      leads: sum('leads'), floorQueued: sum('floorQueued'),
      futworkQ: sum('futworkQ'), superbotQ: sum('superbotQ'),
      humanQL: sum('humanQL'), futworkAiQl: sum('futworkAiQl'), superbotAiQl: sum('superbotAiQl'),
      totalQL: sum('totalQL'), apps: sum('apps'), offers: sum('offers'),
      deposits: sum('deposits'), raus: sum('raus'), spend: sum('spend'),
    }
  }
  const kpis = useMemo(() => sumKpis(filtered), [filtered])
  const totalQueued = kpis.futworkQ + kpis.superbotQ
  // Cost metrics -- CPL from total leads, CPQL from Total QLs (Futwork Human + Futwork AI +
  // Superbot AI combined), CPA from total applications. 0 (not null) when the
  // denominator is 0, matching how CPL/CPA are computed elsewhere in the app (Meta Ads,
  // MTD) rather than showing a dash.
  const cpl = kpis.leads > 0 ? kpis.spend / kpis.leads : 0
  const cpql = kpis.totalQL > 0 ? kpis.spend / kpis.totalQL : 0
  const cpa = kpis.apps > 0 ? kpis.spend / kpis.apps : 0

  // Previous-equivalent-period comparison — same length window immediately before the
  // active one (or the previous calendar month, when in month mode) — so every KPI can
  // show a real vs-last-period delta instead of a static sub-label.
  const prevWindow = useMemo(() => {
    if (activeFilter === 'month') {
      const mk = monthKeyByLabel.get(selMonth)
      return mk == null ? null : { type:'month', mk: mk - 1 }
    }
    if (dateWindow) {
      const days = Math.round((dateWindow.to - dateWindow.from) / 86400000) + 1
      const prevTo = new Date(dateWindow.from); prevTo.setDate(prevTo.getDate() - 1); prevTo.setHours(23, 59, 59, 999)
      const prevFrom = new Date(prevTo); prevFrom.setDate(prevTo.getDate() - (days - 1)); prevFrom.setHours(0, 0, 0, 0)
      return { type:'range', from:prevFrom, to:prevTo }
    }
    return null
  }, [activeFilter, dateWindow, selMonth, monthKeyByLabel])

  const prevFiltered = useMemo(() => {
    if (!prevWindow) return []
    let rs = prevWindow.type === 'month' ? rows.filter(r => r.mk === prevWindow.mk) : rows.filter(r => r.date && r.date >= prevWindow.from && r.date <= prevWindow.to)
    if (source !== 'All') rs = rs.filter(r => r.source === source)
    const q = campaignQuery.trim().toLowerCase()
    if (q) rs = rs.filter(r => r.campaign.toLowerCase().includes(q))
    return rs
  }, [rows, prevWindow, source, campaignQuery])

  const prevKpis = useMemo(() => sumKpis(prevFiltered), [prevFiltered])
  const prevCpl = prevKpis.leads > 0 ? prevKpis.spend / prevKpis.leads : 0
  const prevCpql = prevKpis.totalQL > 0 ? prevKpis.spend / prevKpis.totalQL : 0
  const prevCpa = prevKpis.apps > 0 ? prevKpis.spend / prevKpis.apps : 0
  const prevTotalQueued = prevKpis.futworkQ + prevKpis.superbotQ
  const deltaPct = (cur, prev) => (!prev ? null : ((cur - prev) / prev) * 100)

  // ── Compare — decision-focused period comparison ─────────────────────────
  // Deliberately NOT an AI call: every number here is a direct sum/delta over
  // the same rows already loaded, so it's exactly as trustworthy as the rest
  // of the page's own KPIs, just re-sliced against a second period.
  const compareWindow = useMemo(() => {
    if (!compareOpen) return null
    if (compareMode === 'prev') return prevWindow
    if (compareMode === 'yoy') {
      if (activeFilter === 'month') {
        const mk = monthKeyByLabel.get(selMonth)
        return mk == null ? null : { type:'month', mk: mk - 12 }
      }
      if (dateWindow) {
        const from = new Date(dateWindow.from); from.setFullYear(from.getFullYear() - 1)
        const to = new Date(dateWindow.to); to.setFullYear(to.getFullYear() - 1)
        return { type:'range', from, to }
      }
      return null
    }
    return null // 'custom' handled directly in compareRows below
  }, [compareOpen, compareMode, prevWindow, activeFilter, selMonth, monthKeyByLabel, dateWindow])

  const filterRowsByDateStr = (fromStr, toStr) => {
    if (!fromStr || !toStr) return null
    const [fy, fm, fd] = fromStr.split('-').map(Number); const cf = new Date(fy, fm - 1, fd); cf.setHours(0, 0, 0, 0)
    const [ty, tm, td] = toStr.split('-').map(Number); const ct = new Date(ty, tm - 1, td); ct.setHours(23, 59, 59, 999)
    let rs = rows.filter(r => r.date && r.date >= cf && r.date <= ct)
    if (source !== 'All') rs = rs.filter(r => r.source === source)
    return rs
  }

  const compareRows = useMemo(() => {
    if (!compareOpen) return []
    if (compareMode === 'custom') return filterRowsByDateStr(compareCustomFrom, compareCustomTo) || []
    if (!compareWindow) return []
    let rs = compareWindow.type === 'month' ? rows.filter(r => r.mk === compareWindow.mk) : rows.filter(r => r.date && r.date >= compareWindow.from && r.date <= compareWindow.to)
    if (source !== 'All') rs = rs.filter(r => r.source === source)
    return rs
  }, [compareOpen, compareMode, compareCustomFrom, compareCustomTo, compareWindow, rows, source])

  // Period A (the "current" side) is normally whatever the main page filter is --
  // correct for 'prev'/'yoy' modes, since those are explicitly "vs the period I'm
  // looking at". But in custom mode BOTH sides need to be independently pickable
  // (see state comment above), so period A switches to its own custom range there.
  const periodARows = compareMode === 'custom' ? (filterRowsByDateStr(compareCustomFromA, compareCustomToA) || []) : filtered
  const periodAKpis = useMemo(() => sumKpis(periodARows), [periodARows])
  const periodACpl = periodAKpis.leads > 0 ? periodAKpis.spend / periodAKpis.leads : 0
  const periodACpql = periodAKpis.totalQL > 0 ? periodAKpis.spend / periodAKpis.totalQL : 0

  const compareLabel = useMemo(() => {
    if (compareMode === 'prev') return prevWindow ? (prevWindow.type === 'month' ? monthLabel(prevWindow.mk) : 'previous period') : '—'
    if (compareMode === 'yoy') return compareWindow ? (compareWindow.type === 'month' ? monthLabel(compareWindow.mk) : 'same period last year') : '—'
    if (compareMode === 'custom') return (compareCustomFrom && compareCustomTo) ? `${compareCustomFrom} -> ${compareCustomTo}` : 'pick a range'
    return '—'
  }, [compareMode, prevWindow, compareWindow, compareCustomFrom, compareCustomTo])

  const currentLabel = compareMode === 'custom'
    ? ((compareCustomFromA && compareCustomToA) ? `${compareCustomFromA} -> ${compareCustomToA}` : 'pick a range')
    : (activeFilter === 'month' ? (selMonth || 'this period') : (dateWindow ? dateWindow.label : 'this period'))

  const compareKpis = useMemo(() => sumKpis(compareRows), [compareRows])
  const compareCpl = compareKpis.leads > 0 ? compareKpis.spend / compareKpis.leads : 0
  const compareCpql = compareKpis.totalQL > 0 ? compareKpis.spend / compareKpis.totalQL : 0
  const compareCpa = compareKpis.apps > 0 ? compareKpis.spend / compareKpis.apps : 0

  const fmtDateInput = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  // Prefill both custom ranges the first time Custom is opened, so the modal
  // never starts on a blank/mismatched pair -- period A mirrors the page's
  // current window, period B mirrors the already-computed previous window.
  const prefillCustomRange = () => {
    if (!compareCustomFromA || !compareCustomToA) {
      if (activeFilter === 'month') {
        const mk = monthKeyByLabel.get(selMonth)
        if (mk != null) { const f = new Date(Math.floor(mk / 12), mk % 12, 1); const t = new Date(Math.floor(mk / 12), (mk % 12) + 1, 0); setCompareCustomFromA(fmtDateInput(f)); setCompareCustomToA(fmtDateInput(t)) }
      } else if (dateWindow) { setCompareCustomFromA(fmtDateInput(dateWindow.from)); setCompareCustomToA(fmtDateInput(dateWindow.to)) }
    }
    if (!compareCustomFrom || !compareCustomTo) {
      if (prevWindow && prevWindow.type === 'range') { setCompareCustomFrom(fmtDateInput(prevWindow.from)); setCompareCustomTo(fmtDateInput(prevWindow.to)) }
      else if (prevWindow && prevWindow.type === 'month') { const mk = prevWindow.mk; const f = new Date(Math.floor(mk / 12), mk % 12, 1); const t = new Date(Math.floor(mk / 12), (mk % 12) + 1, 0); setCompareCustomFrom(fmtDateInput(f)); setCompareCustomTo(fmtDateInput(t)) }
    }
  }

  function groupByCorridorRaw(list) {
    const m = new Map()
    list.forEach(r => {
      const id = classifyCorridor(r.campaign)
      const e = m.get(id) || { id, corridor: corridorLabel(id), totalQL:0, spend:0, leads:0 }
      e.totalQL += r.totalQL; e.spend += r.spend; e.leads += r.leads
      m.set(id, e)
    })
    return m
  }

  // Ranked movers: which corridors contributed most to the change in Total QL
  // between the two periods — the single metric that best answers "where do I
  // put my next rupee" for a performance marketer, vs a flat list of every
  // corridor's raw numbers.
  const compareMovers = useMemo(() => {
    if (!compareOpen || compareRows.length === 0 || periodARows.length === 0) return []
    const a = groupByCorridorRaw(periodARows)
    const b = groupByCorridorRaw(compareRows)
    const ids = new Set([...a.keys(), ...b.keys()])
    const out = []
    ids.forEach(id => {
      const ea = a.get(id) || { corridor: corridorLabel(id), totalQL:0, spend:0, leads:0 }
      const eb = b.get(id) || { corridor: corridorLabel(id), totalQL:0, spend:0, leads:0 }
      if (ea.totalQL < 3 && eb.totalQL < 3) return // skip noise from near-zero corridors on both sides
      out.push({
        corridor: ea.corridor,
        aQL: ea.totalQL, bQL: eb.totalQL, deltaQL: ea.totalQL - eb.totalQL,
        aCpql: ea.totalQL > 0 ? ea.spend / ea.totalQL : 0,
        bCpql: eb.totalQL > 0 ? eb.spend / eb.totalQL : 0,
      })
    })
    return out.sort((x, y) => Math.abs(y.deltaQL) - Math.abs(x.deltaQL)).slice(0, 5)
  }, [compareOpen, compareRows, periodARows])

  const compareQlDeltaPct = deltaPct(periodAKpis.totalQL, compareKpis.totalQL)
  const compareCpqlDeltaPct = deltaPct(periodACpql, compareCpql)

  const compareVerdict = useMemo(() => {
    if (!compareOpen || compareRows.length === 0 || periodARows.length === 0) return null
    const qd = compareQlDeltaPct, cd = compareCpqlDeltaPct
    const volUp = qd != null && qd > 2, volDown = qd != null && qd < -2
    const costUp = cd != null && cd > 2, costDown = cd != null && cd < -2
    if (volUp && costDown) return { tone:'good', text: `Total QL is up ${qd.toFixed(0)}% and it got cheaper — CPQL down ${Math.abs(cd).toFixed(0)}%. This is your best-case scenario.` }
    if (volUp && costUp) return { tone:'warn', text: `Total QL is up ${qd.toFixed(0)}%, but you're paying ${cd.toFixed(0)}% more per QL to get there.` }
    if (volDown && costUp) return { tone:'bad', text: `Total QL is down ${Math.abs(qd).toFixed(0)}% and CPQL is up ${cd.toFixed(0)}% — both volume and efficiency declined.` }
    if (volDown && costDown) return { tone:'warn', text: `Total QL is down ${Math.abs(qd).toFixed(0)}%, though the QLs you did get were ${Math.abs(cd).toFixed(0)}% cheaper.` }
    if (volUp) return { tone:'good', text: `Total QL is up ${qd.toFixed(0)}% with CPQL roughly flat.` }
    if (volDown) return { tone:'bad', text: `Total QL is down ${Math.abs(qd).toFixed(0)}% with CPQL roughly flat.` }
    if (costUp) return { tone:'warn', text: `Volume is flat, but CPQL rose ${cd.toFixed(0)}%.` }
    if (costDown) return { tone:'good', text: `Volume is flat, and CPQL improved ${Math.abs(cd).toFixed(0)}%.` }
    return { tone:'neutral', text: `Total QL and CPQL are both roughly flat vs ${compareLabel}.` }
  }, [compareOpen, compareRows, periodARows, compareQlDeltaPct, compareCpqlDeltaPct, compareLabel])

  const compareAction = useMemo(() => {
    if (!compareOpen || compareMovers.length === 0) return null
    const worst = [...compareMovers].sort((x, y) => x.deltaQL - y.deltaQL)[0]
    const best = [...compareMovers].sort((x, y) => y.deltaQL - x.deltaQL)[0]
    const overallDown = compareQlDeltaPct != null && compareQlDeltaPct < -2
    if (overallDown && worst && worst.deltaQL < 0) {
      return `${worst.corridor} accounts for the biggest drop (${fmtN(Math.abs(worst.deltaQL))} fewer QLs). Check that corridor first before touching anything else.`
    }
    if (best && best.deltaQL > 0 && best.bCpql > 0 && best.aCpql <= best.bCpql) {
      return `${best.corridor} grew ${fmtN(best.deltaQL)} QLs while holding or improving CPQL — the strongest candidate for more budget.`
    }
    if (best && best.deltaQL > 0) {
      return `${best.corridor} drove the largest gain (+${fmtN(best.deltaQL)} QLs) — worth a closer look at what changed there.`
    }
    return null
  }, [compareOpen, compareMovers, compareQlDeltaPct])

  const funnel = useMemo(() => ([
    { stage:'Leads Generated', count:kpis.leads },
    { stage:'Total Queued', count:totalQueued },
    { stage:'Floor Queued', count:kpis.floorQueued },
    { stage:'Total QL', count:kpis.totalQL },
    { stage:'Applications', count:kpis.apps },
    { stage:'Offers', count:kpis.offers },
    { stage:'Deposits', count:kpis.deposits },
    { stage:'RAUs', count:kpis.raus },
  ]), [kpis, totalQueued])

  // The real conversion PATH (not the parallel Floor/Queued split) — used both for the
  // conversion-chain strip and to find the biggest leak for the insights row.
  const conversionChain = useMemo(() => ([
    { from:'Leads', to:'Queued', a:kpis.leads, b:totalQueued },
    { from:'Queued', to:'Total QL', a:totalQueued, b:kpis.totalQL },
    { from:'Total QL', to:'Apps', a:kpis.totalQL, b:kpis.apps },
    { from:'Apps', to:'Offers', a:kpis.apps, b:kpis.offers },
    { from:'Offers', to:'Deposits', a:kpis.offers, b:kpis.deposits },
  ].map(s => ({ ...s, rate: s.a > 0 ? (s.b / s.a) * 100 : null }))), [kpis, totalQueued])

  const bySource = useMemo(() => {
    const m = new Map()
    filtered.forEach(r => {
      const e = m.get(r.source) || { source:r.source, leads:0, queued:0, humanQL:0, futworkAiQl:0, superbotAiQl:0, totalQL:0, apps:0, offers:0, deposits:0, raus:0, spend:0 }
      e.leads += r.leads; e.queued += r.futworkQ + r.superbotQ; e.humanQL += r.humanQL
      e.futworkAiQl += r.futworkAiQl; e.superbotAiQl += r.superbotAiQl; e.totalQL += r.totalQL
      e.apps += r.apps; e.offers += r.offers; e.deposits += r.deposits; e.raus += r.raus; e.spend += r.spend
      m.set(r.source, e)
    })
    return [...m.values()].sort((a, b) => b.leads - a.leads)
  }, [filtered])

  const bySourceEfficiency = useMemo(() => (
    bySource.filter(s => s.queued >= 10).map(s => ({ ...s, qlRate: s.queued > 0 ? (s.totalQL / s.queued) * 100 : 0 })).sort((a, b) => b.qlRate - a.qlRate).slice(0, 8)
  ), [bySource])

  const byMonth = useMemo(() => {
    const m = new Map()
    filtered.forEach(r => {
      if (r.mk == null) return
      const e = m.get(r.mk) || { mk:r.mk, label:monthLabel(r.mk), leads:0, queued:0, humanQL:0, futworkAiQl:0, superbotAiQl:0, totalQL:0, deposits:0 }
      e.leads += r.leads; e.queued += r.futworkQ + r.superbotQ; e.humanQL += r.humanQL
      e.futworkAiQl += r.futworkAiQl; e.superbotAiQl += r.superbotAiQl; e.totalQL += r.totalQL; e.deposits += r.deposits
      m.set(r.mk, e)
    })
    return [...m.values()].sort((a, b) => a.mk - b.mk)
  }, [filtered])

  // Daily trend — last 30 days present in the active selection, gives the "what happened
  // recently" pulse a marketer checks first thing in the morning.
  const byDay = useMemo(() => {
    const m = new Map()
    filtered.forEach(r => {
      if (!r.date) return
      const key = dayKey(r.date)
      const e = m.get(key) || { key, date:r.date, leads:0, queued:0, humanQL:0, totalQL:0 }
      e.leads += r.leads; e.queued += r.futworkQ + r.superbotQ; e.humanQL += r.humanQL; e.totalQL += r.totalQL
      m.set(key, e)
    })
    return [...m.values()].sort((a, b) => a.key < b.key ? -1 : 1).slice(-30).map(d => ({ ...d, label:dayLabel(d.date) }))
  }, [filtered])

  const byCampaign = useMemo(() => {
    const m = new Map()
    filtered.forEach(r => {
      if (!r.campaign) return
      const e = m.get(r.campaign) || { campaign:r.campaign, leads:0, queued:0, humanQL:0, futworkAiQl:0, superbotAiQl:0, totalQL:0, apps:0, offers:0, deposits:0, raus:0, spend:0 }
      e.leads += r.leads; e.queued += r.futworkQ + r.superbotQ; e.humanQL += r.humanQL
      e.futworkAiQl += r.futworkAiQl; e.superbotAiQl += r.superbotAiQl; e.totalQL += r.totalQL
      e.apps += r.apps; e.offers += r.offers; e.deposits += r.deposits; e.raus += r.raus; e.spend += r.spend
      m.set(r.campaign, e)
    })
    return [...m.values()].sort((a, b) => b.leads - a.leads)
  }, [filtered])

  const byCorridor = useMemo(() => {
    const m = new Map()
    filtered.forEach(r => {
      const id = classifyCorridor(r.campaign)
      const label = corridorLabel(id)
      const e = m.get(id) || { corridor:label, leads:0, queued:0, humanQL:0, futworkAiQl:0, superbotAiQl:0, totalQL:0, apps:0, offers:0, deposits:0, raus:0, spend:0 }
      e.leads += r.leads; e.queued += r.futworkQ + r.superbotQ; e.humanQL += r.humanQL
      e.futworkAiQl += r.futworkAiQl; e.superbotAiQl += r.superbotAiQl; e.totalQL += r.totalQL
      e.apps += r.apps; e.offers += r.offers; e.deposits += r.deposits; e.raus += r.raus; e.spend += r.spend
      m.set(id, e)
    })
    return [...m.values()].sort((a, b) => b.leads - a.leads)
  }, [filtered])

  // Full day-level breakdown (all metrics, no 30-day cap) for the summary table's Day
  // grouping — distinct from `byDay` above, which is the chart's lighter/capped version.
  const byDayFull = useMemo(() => {
    const m = new Map()
    filtered.forEach(r => {
      if (!r.date) return
      const key = dayKey(r.date)
      const e = m.get(key) || { key, date:r.date, label:dayLabel(r.date), leads:0, queued:0, humanQL:0, futworkAiQl:0, superbotAiQl:0, totalQL:0, apps:0, offers:0, deposits:0, raus:0, spend:0 }
      e.leads += r.leads; e.queued += r.futworkQ + r.superbotQ; e.humanQL += r.humanQL
      e.futworkAiQl += r.futworkAiQl; e.superbotAiQl += r.superbotAiQl; e.totalQL += r.totalQL
      e.apps += r.apps; e.offers += r.offers; e.deposits += r.deposits; e.raus += r.raus; e.spend += r.spend
      m.set(key, e)
    })
    return [...m.values()].sort((a, b) => b.key.localeCompare(a.key))
  }, [filtered])

  const topCampaignsByLeads = useMemo(() => byCampaign.slice(0, 5), [byCampaign])
  const topCampaignsByEfficiency = useMemo(() => (
    byCampaign.filter(c => c.queued >= 15).map(c => ({ ...c, qlRate: c.queued > 0 ? (c.totalQL / c.queued) * 100 : 0 })).sort((a, b) => b.qlRate - a.qlRate).slice(0, 5)
  ), [byCampaign])

  const grouped = useMemo(() => {
    if (grpBy === 'source') return bySource.map(s => ({
      label:s.source, leads:s.leads, queued:s.queued, humanQL:s.humanQL, futworkAiQl:s.futworkAiQl, superbotAiQl:s.superbotAiQl, totalQL:s.totalQL, apps:s.apps, offers:s.offers, deposits:s.deposits, raus:s.raus, spend:s.spend,
    }))
    if (grpBy === 'campaign') return byCampaign.map(c => ({
      label:c.campaign, leads:c.leads, queued:c.queued, humanQL:c.humanQL, futworkAiQl:c.futworkAiQl, superbotAiQl:c.superbotAiQl, totalQL:c.totalQL, apps:c.apps, offers:c.offers, deposits:c.deposits, raus:c.raus, spend:c.spend,
    }))
    if (grpBy === 'corridor') return byCorridor.map(c => ({
      label:c.corridor, leads:c.leads, queued:c.queued, humanQL:c.humanQL, futworkAiQl:c.futworkAiQl, superbotAiQl:c.superbotAiQl, totalQL:c.totalQL, apps:c.apps, offers:c.offers, deposits:c.deposits, raus:c.raus, spend:c.spend,
    }))
    if (grpBy === 'day') return byDayFull.map(d => ({
      label:d.label, dateKey:d.key, leads:d.leads, queued:d.queued, humanQL:d.humanQL, futworkAiQl:d.futworkAiQl, superbotAiQl:d.superbotAiQl, totalQL:d.totalQL, apps:d.apps, offers:d.offers, deposits:d.deposits, raus:d.raus, spend:d.spend,
    }))
    return byMonth.map(m => {
      const full = filtered.filter(r => r.mk === m.mk)
      return {
        label:m.label, leads:m.leads, queued:m.queued, humanQL:m.humanQL, futworkAiQl:m.futworkAiQl, superbotAiQl:m.superbotAiQl, totalQL:m.totalQL,
        apps: full.reduce((t, r) => t + r.apps, 0), offers: full.reduce((t, r) => t + r.offers, 0),
        deposits:m.deposits, raus: full.reduce((t, r) => t + r.raus, 0),
        spend: full.reduce((t, r) => t + r.spend, 0),
      }
    })
  }, [grpBy, bySource, byCampaign, byCorridor, byDayFull, byMonth, filtered])

  const grpByLabel = grpBy === 'source' ? 'Source' : grpBy === 'campaign' ? 'Campaign' : grpBy === 'corridor' ? 'Corridor' : grpBy === 'day' ? 'Date' : 'Month'

  // SR Revenue — Estimated (Applications × rate) and Actual (RAUs × rate). Both rates are
  // user-configurable in the toolbar below and persist to localStorage.
  const groupedWithRevenue = useMemo(() => grouped.map(g => ({
    ...g, estSrRevenue: g.apps * estRate, actSrRevenue: g.raus * actRate,
  })), [grouped, estRate, actRate])

  const exportRows = useMemo(() => groupedWithRevenue.map(g => ({
    [grpByLabel]: g.label,
    Leads: g.leads, Spend: fmtINR(g.spend), 'Total Queued': g.queued,
    'Futwork Human QL': g.humanQL, 'Futwork AI QL': g.futworkAiQl, 'Superbot AI QL': g.superbotAiQl, 'Total QLs': g.totalQL,
    Applications: g.apps, Offers: g.offers, Deposits: g.deposits, RAUs: g.raus,
    'QL %': pct(g.totalQL, g.queued), 'App %': pct(g.apps, g.totalQL), 'Deposit %': pct(g.deposits, g.offers),
    CPL: fmtINR(summaryValue(g, 'cpl')), CPQL: fmtINR(summaryValue(g, 'cpql')), CPA: fmtINR(summaryValue(g, 'cpa')),
    'Est. SR Revenue': fmtINR(g.estSrRevenue), 'Actual SR Revenue': fmtINR(g.actSrRevenue),
  })), [groupedWithRevenue, grpByLabel])

  const maxSourceLeads = bySource.length ? Math.max(...bySource.map(s => s.leads)) : 1
  const totalSourceLeads = bySource.reduce((t, s) => t + s.leads, 0)

  const displayCols = useMemo(() => (
    colOrder.filter(k => visibleCols.includes(k)).map(k => SUMMARY_COLUMNS.find(c => c.key === k)).filter(Boolean)
  ), [colOrder, visibleCols])

  const tableRows = useMemo(() => {
    let rs = groupedWithRevenue
    const q = tableSearch.trim().toLowerCase()
    if (q) rs = rs.filter(g => g.label.toLowerCase().includes(q))
    const sorted = [...rs].sort((a, b) => {
      if (sortKey === 'label') {
        // Day view sorts chronologically by the underlying date key, not the display label
        const cmp = (a.dateKey && b.dateKey) ? a.dateKey.localeCompare(b.dateKey) : a.label.localeCompare(b.label)
        return sortDir === 'asc' ? cmp : -cmp
      }
      const av = summaryValue(a, sortKey), bv = summaryValue(b, sortKey)
      const an = av == null ? -Infinity : av, bn = bv == null ? -Infinity : bv
      return sortDir === 'asc' ? an - bn : bn - an
    })
    return rowLimit === 'all' ? sorted : sorted.slice(0, rowLimit)
  }, [groupedWithRevenue, tableSearch, sortKey, sortDir, rowLimit])

  const tableExportRows = useMemo(() => tableRows.map(g => {
    const o = { [grpByLabel]: g.label }
    displayCols.forEach(c => { o[c.label] = summaryFmt(c.key, summaryValue(g, c.key)) })
    return o
  }), [tableRows, displayCols, grpByLabel])

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

  const syncFmt = new Intl.DateTimeFormat('en-IN', { hour:'2-digit', minute:'2-digit', second:'2-digit' })

  return (
    <div className="lq-page-shell" style={{ display:'flex', height:'100vh', overflow:'hidden', background:C.bg, fontFamily:FONT }}>
      <Sidebar />
      <style>{`.kpiCard:hover{transform:translateY(-3px);box-shadow:0 2px 4px rgba(15,23,42,0.05),0 16px 32px -14px rgba(31,60,132,0.22)!important}`}</style>
      <div style={{ margin:'12px 14px 0', borderRadius:14, border:'1px solid #EEF1F6', boxShadow:'0 1px 3px rgba(31,60,132,0.06)', flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>

        {/* HEADER — same structure/behavior as the Daily QLs header (QL Ops): inline filter
            label in the title, LD/L7D/MTD pill group, month Dropdown, Custom calendar range,
            Source dropdown, Synced, Refresh, Export, info popover. */}
        <div style={{ background:'var(--card)', borderBottom:`0.5px solid ${C.border}`, padding:'10px 28px', minHeight:56, height:'auto', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexShrink:0, overflow:'visible', flexWrap:'wrap' }}>
          <div>
            <p style={{ fontSize:10.5, color:C.muted, margin:0, letterSpacing:'0.05em', textTransform:'uppercase', fontFamily:FONT }}>Dashboards / Overall</p>
            <h1 style={{ fontSize:18, fontWeight:800, color:C.text, margin:'2px 0 0', letterSpacing:'-0.4px', fontFamily:FONT }}>
              Overall Performance
              {' - '}
              {activeFilter === 'custom' && customFrom
                ? <span style={{ fontSize:13, fontWeight:600, color:C.blue }}>{customFrom} -&gt; {customTo}</span>
                : activeFilter === 'preset' && dateWindow
                  ? <span style={{ fontSize:13, fontWeight:600, color:C.blue }}>{dateWindow.label}</span>
                  : <span>{selMonth || '-'}</span>}
            </h1>
          </div>
          <div className="lq-header-controls" style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'nowrap', overflow:'visible', flexShrink:1, minWidth:0 }}>

            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', background:'#F8FAFC', padding:'6px 10px', borderRadius:12, border:'0.5px solid #E5E7EB' }}>
              {isCurrentMonth && (
                <div style={{ display:'flex', alignItems:'center', gap:4, background:'var(--bg3)', borderRadius:9, padding:3 }}>
                  {[['LD', 'Last Day'], ['L7D', 'Last 7D'], ['MTD', 'MTD']].map(([key, lbl2]) => {
                    const today2 = new Date(); today2.setHours(0, 0, 0, 0)
                    let tipFrom, tipTo
                    if (key === 'LD') { tipFrom = new Date(today2); tipFrom.setDate(today2.getDate() - 1); tipTo = tipFrom }
                    else if (key === 'L7D') { tipTo = new Date(today2); tipTo.setDate(today2.getDate() - 1); tipFrom = new Date(tipTo); tipFrom.setDate(tipTo.getDate() - 6) }
                    else { tipFrom = new Date(today2.getFullYear(), today2.getMonth(), 1); tipTo = today2 }
                    const fmtShort = d => `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`
                    const tipLabel = fmtShort(tipFrom) + ' - ' + fmtShort(tipTo)
                    const isHov = hoveredPreset === key
                    return (
                      <div key={key} style={{ position:'relative' }}>
                        <button
                          onClick={() => { setDatePreset(key); setCustomFrom(''); setCustomTo(''); setShowCustom(false) }}
                          onMouseEnter={() => setHoveredPreset(key)}
                          onMouseLeave={() => setHoveredPreset(null)}
                          style={{
                            padding:'5px 11px', borderRadius:7, border:'none', cursor:'pointer', fontSize:11.5, fontWeight:700, fontFamily:FONT,
                            background: activeFilter === 'custom' ? 'transparent' : datePreset === key ? 'linear-gradient(135deg, #1F3C84, #1C9FD4)' : 'transparent',
                            color: activeFilter === 'custom' ? '#CBD5E1' : datePreset === key ? '#fff' : '#64748B',
                            boxShadow: activeFilter === 'custom' ? 'none' : datePreset === key ? '0 4px 10px -3px rgba(31,60,132,0.5)' : 'none',
                            opacity: activeFilter === 'custom' ? 0.5 : 1,
                            pointerEvents: activeFilter === 'custom' ? 'none' : 'auto',
                            transition:'all .15s',
                          }}>{lbl2}</button>
                        <div style={{ position:'absolute', top:'calc(100% + 7px)', left:'50%', transform:'translateX(-50%)', background:'#1E293B', color:'var(--card)', fontSize:11, fontWeight:500, fontFamily:FONT, padding:'5px 10px', borderRadius:7, whiteSpace:'nowrap', pointerEvents:'none', boxShadow:'0 4px 14px rgba(15,23,42,0.18)', zIndex:600, opacity: isHov ? 1 : 0, transition:'opacity .15s ease' }}>
                          {tipLabel}
                          <div style={{ position:'absolute', top:-4, left:'50%', transform:'translateX(-50%)', width:8, height:8, background:'#1E293B', borderRadius:2, clipPath:'polygon(50% 0%, 0% 100%, 100% 100%)' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {monthOptions.length > 0 && (
                <div style={{ opacity: activeFilter !== 'month' ? 0.45 : 1, transition:'opacity .15s' }} title={activeFilter !== 'month' ? 'Click to switch to month view' : undefined}>
                  <Dropdown
                    options={monthOptions}
                    value={selMonth}
                    minWidth={110}
                    onChange={v => { setSelMonth(v); setDatePreset('month'); setCustomFrom(''); setCustomTo(''); setShowCustom(false) }}
                  />
                </div>
              )}

              <div style={{ position:'relative' }}>
                <button onClick={() => { setShowCustom(v => !v); if (!showCustom) setDatePreset('month') }}
                  style={{ padding:'6px 11px', borderRadius:8, border:`0.5px solid ${datePreset === 'custom' ? C.navy : C.border}`, background: datePreset === 'custom' ? C.navyBg : 'var(--card)', color: datePreset === 'custom' ? C.navy : C.sub, fontSize:11.5, fontWeight:600, fontFamily:FONT, cursor:'pointer', display:'flex', alignItems:'center', gap:5, boxShadow: showCustom ? '0 0 0 3px rgba(31,60,132,0.08)' : 'none', transition:'all .15s' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                  {datePreset === 'custom' && customFrom ? customFrom + ' -> ' + customTo : 'Custom'}
                </button>
                {showCustom && (
                  <>
                    <div onClick={() => setShowCustom(false)} style={{ position:'fixed', inset:0, zIndex:399 }} />
                    <div style={{ position:'absolute', right:0, top:'calc(100% + 8px)', zIndex:400, background:'var(--card)', border:`0.5px solid ${C.border}`, borderRadius:14, boxShadow:'0 20px 60px rgba(15,23,42,0.16), 0 4px 12px rgba(15,23,42,0.06)', overflow:'hidden' }}>
                      <DateRangePicker
                        from={customFrom ? (() => { const [y, m, d] = customFrom.split('-').map(Number); return new Date(y, m - 1, d) })() : null}
                        to={customTo ? (() => { const [y, m, d] = customTo.split('-').map(Number); return new Date(y, m - 1, d) })() : null}
                        onChange={(f, t) => { setCustomFrom(f); setCustomTo(t); setDatePreset('custom'); setShowCustom(false) }}
                      />
                    </div>
                  </>
                )}
              </div>

              <Dropdown label="Source" options={sources} value={source} minWidth={110} onChange={setSource} />
              <CampaignSearch value={campaignQuery} onChange={setCampaignQuery} suggestions={campaignSuggestions} />
            </div>

            <Button
              onClick={() => setCompareOpen(true)}
              size="sm"
              variant="secondary"
              icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 00-2 2v3m0 8v3a2 2 0 002 2h3m8 0h3a2 2 0 002-2v-3m0-8V5a2 2 0 00-2-2h-3"/><line x1="8" y1="12" x2="16" y2="12"/></svg>}
            >
              Compare
            </Button>

            {lastSync && <span style={{ fontSize:11, color:C.muted, fontFamily:FONT }}>Synced {syncFmt.format(lastSync)}</span>}
            <Button
              onClick={() => loadData(true)}
              disabled={loading}
              size="sm"
              variant="secondary"
              icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: loading ? 'spin .8s linear infinite' : 'none' }}><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>}
            >
              {loading ? 'Refreshing' : 'Refresh'}
            </Button>
            <ExportButton data={exportRows} filename="overall-summary" dashboardId="overall" />
            <div style={{ position:'relative' }}>
              <button onClick={() => setShowInfo(v => !v)} title="How these metrics are calculated" style={{ width:30, height:30, borderRadius:8, border:`0.5px solid ${C.border}`, background: showInfo ? C.navyBg : 'var(--card)', color:C.navy, fontSize:14, fontWeight:700, fontStyle:'italic', fontFamily:'Georgia,serif', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>i</button>
              {showInfo && <div onClick={() => setShowInfo(false)} style={{ position:'fixed', inset:0, zIndex:150 }} />}
              {showInfo && (
                <div style={{ position:'absolute', right:0, top:'calc(100% + 8px)', zIndex:200, width:380, maxHeight:'74vh', overflowY:'auto', background:'var(--card)', border:`0.5px solid ${C.border}`, borderRadius:12, boxShadow:'0 14px 40px rgba(15,23,42,0.16)', padding:'16px 18px', textAlign:'left', fontFamily:FONT }}>
                  <div style={{ fontSize:12.5, fontWeight:800, color:C.text, marginBottom:8 }}>How Overall is calculated</div>
                  <div style={{ fontSize:11, color:C.muted, marginBottom:10 }}>Source: the "Overall PM" sheet (Settings &gt; Data &gt; Google Sheets) — one row per lead/day/source/campaign, spanning the full acquisition-to-revenue funnel.</div>
                  <div style={{ fontSize:11.5, color:C.sub, lineHeight:1.7 }}>
                    <b>Leads Generated</b> is split into two paths: <b>Total Queued</b> (Futwork + Superbot — sent to our third-party providers to get converted) and <b>Floor Queued</b> (handled directly). From there it continues <b>Total QL</b> (Futwork Human QL + Futwork AI QL + Superbot AI QL combined) → <b>Applications</b> → <b>Offers</b> → <b>Deposits</b> → <b>RAUs</b> (revenue attribution units). Total Queued and Floor Queued are parallel branches of Leads Generated, not a single straight line.<br /><br />
                    <b>Executive insights</b> and <b>KPI deltas</b> compare the active period against the immediately preceding period of equal length (or the previous calendar month, in month view). <b>Biggest funnel leak</b> and campaign efficiency rankings use the real conversion path (Leads → Queued → Total QL → Apps → Offers → Deposits), skipping the parallel Floor Queued branch.<br /><br />
                    Last Day / Last 7D / MTD and Custom filter by lead date; the Month dropdown scopes to one calendar month. Source and campaign search filter everything below.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* SCROLLABLE CONTENT */}
        <div style={{ flex:1, overflowY:'auto', padding:'20px 28px' }}>

          {/* KPI ROW — with vs-previous-period deltas */}
          <div className="lq-kpi-grid" style={{ display:'grid', gridTemplateColumns:'repeat(6, minmax(0, 1fr))', gap:14, marginBottom:20 }}>
            <PremKPI label="TOTAL LEADS" value={fmtN(kpis.leads)} sub="generated" delta={deltaPct(kpis.leads, prevKpis.leads)} accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.total} />
            <PremKPI label="FLOOR QUEUED" value={fmtN(kpis.floorQueued)} sub={pct(kpis.floorQueued, kpis.leads) + ' of leads'} delta={deltaPct(kpis.floorQueued, prevKpis.floorQueued)} accent={C.blue} accentBg={C.blueBg} icon={KPI_ICONS.agent} />
            <PremKPI label="TOTAL QUEUED" value={fmtN(totalQueued)} sub={'Futwork ' + fmtN(kpis.futworkQ) + ' · Superbot ' + fmtN(kpis.superbotQ)} delta={deltaPct(totalQueued, prevTotalQueued)} accent={C.cyan} accentBg={C.cyanBg} icon={KPI_ICONS.bot} />
            <PremKPI label="TOTAL QLs" value={fmtN(kpis.totalQL)} sub={pct(kpis.totalQL, totalQueued) + ' of queued'} delta={deltaPct(kpis.totalQL, prevKpis.totalQL)} accent={C.green} accentBg={C.greenBg} icon={KPI_ICONS.ai} />
            <PremKPI label="APPLICATIONS" value={fmtN(kpis.apps)} sub={pct(kpis.apps, kpis.totalQL) + ' of QL'} delta={deltaPct(kpis.apps, prevKpis.apps)} accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.total} />
            <PremKPI label="OFFERS" value={fmtN(kpis.offers)} sub={pct(kpis.offers, kpis.apps) + ' of apps'} delta={deltaPct(kpis.offers, prevKpis.offers)} accent={C.blue} accentBg={C.blueBg} icon={KPI_ICONS.agent} />
            <PremKPI label="DEPOSITS" value={fmtN(kpis.deposits)} sub={pct(kpis.deposits, kpis.offers) + ' of offers'} delta={deltaPct(kpis.deposits, prevKpis.deposits)} accent={C.cyan} accentBg={C.cyanBg} icon={KPI_ICONS.globe} />
            <PremKPI label="TOTAL RAUs" value={fmtN(kpis.raus)} sub="revenue attr. units" delta={deltaPct(kpis.raus, prevKpis.raus)} accent={C.green} accentBg={C.greenBg} icon={KPI_ICONS.bot} />
            <PremKPI label="SPEND" value={<span title={fmtINRShort(kpis.spend)}>{fmtINR(kpis.spend)}</span>} sub="total ad spend" delta={deltaPct(kpis.spend, prevKpis.spend)} accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.total} />
            <PremKPI label="CPL" value={<span title={fmtINRShort(cpl)}>{fmtINR(cpl)}</span>} sub="cost per lead" delta={deltaPct(cpl, prevCpl)} invert accent={C.blue} accentBg={C.blueBg} icon={KPI_ICONS.agent} />
            <PremKPI label="CPQL" value={<span title={fmtINRShort(cpql)}>{fmtINR(cpql)}</span>} sub="cost per qualified lead" delta={deltaPct(cpql, prevCpql)} invert accent={C.cyan} accentBg={C.cyanBg} icon={KPI_ICONS.ai} />
            <PremKPI label="CPA" value={<span title={fmtINRShort(cpa)}>{fmtINR(cpa)}</span>} sub="cost per application" delta={deltaPct(cpa, prevCpa)} invert accent={C.green} accentBg={C.greenBg} icon={KPI_ICONS.globe} />
          </div>

          {/* FUNNEL + STAGE CONVERSION */}
          <Card>
            {sectionTitle('Overall funnel', 'lead → revenue path for the selected period and source')}
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={funnel} layout="vertical" margin={{ left:20, right:50, top:4, bottom:4 }}>
                <CartesianGrid horizontal={false} stroke={C.border} />
                <XAxis type="number" tick={axis} axisLine={false} tickLine={false} tickFormatter={fmtN} />
                <YAxis type="category" dataKey="stage" tick={axis} axisLine={false} tickLine={false} width={110} />
                <Tooltip content={<BrandTooltip />} cursor={{ fill:'rgba(31,60,132,0.04)' }} />
                <Bar dataKey="count" name="Count" radius={[0, 6, 6, 0]} barSize={20}>
                  {funnel.map((e, i) => <Cell key={i} fill={brandColor(i)} />)}
                  <LabelList dataKey="count" position="right" formatter={fmtN} style={{ fontSize:11, fontWeight:700, fill:C.sub }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div style={{ borderTop:'1px solid #F1F5F9', marginTop:4, paddingTop:16 }}>
              <div style={{ fontSize:10.5, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>Stage-to-stage conversion (the real path)</div>
              <ConversionChain steps={conversionChain} />
            </div>
          </Card>

          {/* SOURCE VOLUME + SOURCE EFFICIENCY */}
          <div className="lq-grid2" style={{ ...grid2, marginTop:16 }}>
            <Card>
              {sectionTitle('Leads by source', 'volume leaders this period')}
              <RankedBars data={bySource.slice(0, 8).map(s => ({ source:s.source, count:s.leads }))} labelKey="source" max={maxSourceLeads} total={totalSourceLeads} colorFn={brandColor} showRank />
            </Card>
            <Card>
              {sectionTitle('Source efficiency', 'queued → Total QL rate — where quality actually converts (min. 10 queued)')}
              <EfficiencyList data={bySourceEfficiency} labelKey="source" rateKey="qlRate" subKey="queued" />
            </Card>
          </div>

          {/* MONTH TREND + DAILY TREND */}
          <div className="lq-grid2" style={{ ...grid2, marginTop:16 }}>
            <Card>
              {sectionTitle('Month-on-month trend', 'leads, queued and total QL by month')}
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={byMonth} margin={{ left:0, right:12, top:4, bottom:4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
                  <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={fmtN} />
                  <Tooltip content={<BrandTooltip />} />
                  <Legend wrapperStyle={{ fontSize:11, fontFamily:FONT }} />
                  <Line type="monotone" dataKey="leads" name="Leads" stroke={C.navy} strokeWidth={2.5} dot={{ r:3 }} />
                  <Line type="monotone" dataKey="queued" name="Total Queued" stroke={C.blue} strokeWidth={2.5} dot={{ r:3 }} />
                  <Line type="monotone" dataKey="totalQL" name="Total QL" stroke={C.cyan} strokeWidth={2.5} dot={{ r:3 }} />
                  <Line type="monotone" dataKey="deposits" name="Deposits" stroke={C.green} strokeWidth={2.5} dot={{ r:3 }} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
            <Card>
              {sectionTitle('Daily pulse', 'last 30 days of lead volume in the active selection')}
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={byDay} margin={{ left:0, right:12, top:4, bottom:4 }}>
                  <defs>
                    <linearGradient id="ovLeadsFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.navy} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={C.navy} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={fmtN} />
                  <Tooltip content={<BrandTooltip />} />
                  <Area type="monotone" dataKey="leads" name="Leads" stroke={C.navy} strokeWidth={2.5} fill="url(#ovLeadsFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* TOP MOVERS — what to scale, framed for decisions */}
          <div className="lq-grid2" style={{ ...grid2, marginTop:16 }}>
            <Card>
              {sectionTitle('Top campaigns by volume', 'where the leads are coming from right now')}
              <RankedBars data={topCampaignsByLeads.map(c => ({ campaign:c.campaign, count:c.leads }))} labelKey="campaign" max={topCampaignsByLeads.length ? topCampaignsByLeads[0].leads : 1} total={totalSourceLeads} colorFn={brandColor} showRank />
            </Card>
            <Card>
              {sectionTitle('Best campaigns to scale', 'highest Total QL rate among campaigns with real volume (min. 15 queued)')}
              <EfficiencyList data={topCampaignsByEfficiency} labelKey="campaign" rateKey="qlRate" subKey="queued" />
            </Card>
          </div>

          {/* GROUPED SUMMARY TABLE — customizable: search, sortable columns, show/hide +
              reorder columns (persisted), row limit, and a per-view export. */}
          <div style={{ marginTop:16 }}>
            <Card
              action={
                <div style={{ display:'flex', gap:6 }}>
                  {[['source', 'Source'], ['campaign', 'Campaign'], ['corridor', 'Corridor'], ['month', 'Month'], ['day', 'Day']].map(([v, l]) => (
                    <button key={v} onClick={() => setGrpBy(v)} style={{ padding:'7px 14px', borderRadius:8, border:'0.5px solid ' + (grpBy === v ? C.navy : '#E5E7EB'), background: grpBy === v ? C.navy : '#fff', color: grpBy === v ? '#fff' : '#374151', fontSize:12.5, fontWeight:700, cursor:'pointer', fontFamily:FONT }}>{l}</button>
                  ))}
                </div>
              }
            >
              {sectionTitle('Funnel summary by ' + grpByLabel.toLowerCase(), 'full-funnel totals and stage conversion rates — search, sort, and customize the columns below')}

              {/* TOOLBAR */}
              <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:14 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 12px', borderRadius:8, border:`0.5px solid ${C.border}`, background:'var(--card)', flex:'1 1 200px', minWidth:160, maxWidth:280 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
                  <input value={tableSearch} onChange={e => setTableSearch(e.target.value)} placeholder={`Search ${grpByLabel.toLowerCase()}…`}
                    style={{ border:'none', outline:'none', background:'transparent', fontFamily:FONT, fontSize:12.5, fontWeight:600, color:C.text, width:'100%' }} />
                  {tableSearch && (
                    <button onClick={() => setTableSearch('')} style={{ border:'none', background:'transparent', cursor:'pointer', color:C.muted, display:'flex', padding:0, flexShrink:0 }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                  )}
                </div>

                <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <span style={{ fontSize:12, color:C.muted, fontFamily:FONT }}>Show</span>
                  {[10, 25, 50, 'all'].map(n => (
                    <button key={n} onClick={() => setRowLimit(n)} style={{ padding:'7px 12px', borderRadius:7, border:'none', cursor:'pointer', fontSize:12.5, fontWeight:700, fontFamily:FONT, background: rowLimit === n ? C.navy : 'transparent', color: rowLimit === n ? '#fff' : '#64748B' }}>{n === 'all' ? 'All' : n}</button>
                  ))}
                </div>

                <div style={{ position:'relative' }}>
                  <Button
                    onClick={() => setShowColsPicker(v => !v)}
                    size="sm"
                    variant="secondary"
                    icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="18" rx="1" /><rect x="14" y="3" width="7" height="18" rx="1" /></svg>}
                  >
                    Columns
                  </Button>
                  {showColsPicker && (
                    <ColumnsPicker order={colOrder} visible={visibleCols} onToggle={toggleCol} onMove={moveCol} onClose={() => setShowColsPicker(false)} onReset={resetCols} />
                  )}
                </div>

                <div style={{ position:'relative' }}>
                  <Button
                    onClick={() => setShowRatesPicker(v => !v)}
                    size="sm"
                    variant="secondary"
                    icon={<span style={{ fontSize:13, fontWeight:800, lineHeight:1, fontFamily:FONT }}>₹</span>}
                  >
                    SR Rates
                  </Button>
                  {showRatesPicker && (
                    <>
                      <div onClick={() => setShowRatesPicker(false)} style={{ position:'fixed', inset:0, zIndex:399 }} />
                      <div style={{ position:'absolute', left:0, top:'calc(100% + 6px)', zIndex:400, background:'var(--card)', border:`0.5px solid ${C.border}`, borderRadius:12, boxShadow:'0 16px 40px rgba(15,23,42,0.14), 0 2px 8px rgba(15,23,42,0.06)', padding:14, minWidth:260 }}>
                        <div style={{ fontSize:10, fontWeight:700, color:C.muted, letterSpacing:'0.06em', textTransform:'uppercase', marginBottom:10 }}>SR revenue calculator rates</div>
                        <label style={{ fontSize:11, fontWeight:600, color:C.sub, display:'block', marginBottom:4 }}>Est. SR Revenue — ₹ per Application</label>
                        <input type="number" value={estRate} onChange={e => setEstRate(Number(e.target.value) || 0)} style={{ width:'100%', boxSizing:'border-box', padding:'7px 10px', borderRadius:8, border:`0.5px solid ${C.border}`, fontFamily:FONT, fontSize:12.5, color:C.text, marginBottom:10, outline:'none' }} />
                        <label style={{ fontSize:11, fontWeight:600, color:C.sub, display:'block', marginBottom:4 }}>Actual SR Revenue — ₹ per RAU</label>
                        <input type="number" value={actRate} onChange={e => setActRate(Number(e.target.value) || 0)} style={{ width:'100%', boxSizing:'border-box', padding:'7px 10px', borderRadius:8, border:`0.5px solid ${C.border}`, fontFamily:FONT, fontSize:12.5, color:C.text, outline:'none' }} />
                        <div style={{ fontSize:10.5, color:C.muted, marginTop:10, lineHeight:1.5 }}>Est. SR Revenue = Applications × this rate. Actual SR Revenue = RAUs × this rate. Both columns update live and are remembered on this device.</div>
                      </div>
                    </>
                  )}
                </div>

                <div style={{ marginLeft:'auto' }}>
                  <ExportButton data={tableExportRows} filename={'overall-' + grpBy} dashboardId="overall" />
                </div>
              </div>

              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5, fontFamily:FONT }}>
                  <thead>
                    <tr style={{ background:'#F8FAFC', borderBottom:'2px solid #E2E8F0' }}>
                      <th onClick={() => handleSort('label')} style={{ padding:'9px 12px', fontSize:9.5, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color: sortKey === 'label' ? C.navy : '#64748B', textAlign:'left', whiteSpace:'nowrap', cursor:'pointer', userSelect:'none' }}>
                        {grpByLabel}{sortKey === 'label' && (sortDir === 'asc' ? ' ▲' : ' ▼')}
                      </th>
                      {displayCols.map(col => (
                        <th key={col.key}
                          onClick={() => handleSort(col.key)}
                          draggable
                          onDragStart={e => { setDragKey(col.key); e.dataTransfer.effectAllowed = 'move' }}
                          onDragOver={e => { e.preventDefault(); if (dragOverKey !== col.key) setDragOverKey(col.key) }}
                          onDragLeave={() => setDragOverKey(k => (k === col.key ? null : k))}
                          onDrop={e => { e.preventDefault(); reorderColumns(dragKey, col.key); setDragKey(null); setDragOverKey(null) }}
                          onDragEnd={() => { setDragKey(null); setDragOverKey(null) }}
                          title="Click to sort — drag to reorder"
                          style={{
                            padding:'9px 8px', fontSize:9.5, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em',
                            color: sortKey === col.key ? C.navy : '#64748B', textAlign:'right', whiteSpace:'nowrap', cursor: 'grab', userSelect:'none',
                            opacity: dragKey === col.key ? 0.35 : 1,
                            boxShadow: dragOverKey === col.key && dragKey && dragKey !== col.key ? `inset 2px 0 0 ${C.blue}` : 'none',
                          }}>
                          {col.label}{sortKey === col.key && (sortDir === 'asc' ? ' ▲' : ' ▼')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((g, i) => (
                      <tr key={g.label} style={{ background: i % 2 === 0 ? '#fff' : '#FAFBFC' }}>
                        <td style={{ padding:'9px 12px', fontWeight:600, color:'#0F172A' }}>{g.label}</td>
                        {displayCols.map(col => {
                          const v = summaryValue(g, col.key)
                          const isPct = col.key.endsWith('Pct')
                          const isMoney = col.key.endsWith('SrRevenue') || col.key === 'spend' || col.key === 'cpl' || col.key === 'cpql' || col.key === 'cpa'
                          return (
                            <td key={col.key} title={isMoney ? fmtINRShort(v) : undefined} style={{ padding:'9px 8px', textAlign:'right', color: isPct ? heatColor(v) : summaryColor(col.key), fontWeight: SUMMARY_BOLD_COLS.includes(col.key) ? 700 : 400, background: isPct ? heatBg(v) : 'transparent' }}>
                              {summaryFmt(col.key, v)}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                    {tableRows.length === 0 && (
                      <tr><td colSpan={displayCols.length + 1} style={{ padding:'20px', textAlign:'center', color:'#94A3B8' }}>No data for this selection.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {grouped.length > tableRows.length && (
                <div style={{ fontSize:11, color:C.muted, textAlign:'center', marginTop:10 }}>Showing {tableRows.length} of {grouped.length} — increase "Show" above to see more.</div>
              )}
            </Card>
          </div>

          {compareOpen && (
            <div onClick={e => { if (e.target === e.currentTarget) setCompareOpen(false) }}
              style={{ position:'fixed', inset:0, zIndex:600, background:'rgba(15,23,42,0.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
              <div style={{ background:'var(--card)', borderRadius:18, width:'min(720px, 100%)', maxHeight:'88vh', overflowY:'auto', boxShadow:'0 24px 64px rgba(15,23,42,0.28)', fontFamily:FONT }}>
                <div style={{ padding:'20px 24px', borderBottom:`0.5px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div>
                    <div style={{ fontSize:16.5, fontWeight:800, color:C.text }}>Compare periods</div>
                    <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>{currentLabel} vs {compareLabel}</div>
                  </div>
                  <button onClick={() => setCompareOpen(false)} style={{ border:'none', background:'transparent', color:C.muted, cursor:'pointer', display:'flex', padding:4 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>

                <div style={{ padding:'18px 24px 24px' }}>
                  {/* Period-B selector */}
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:compareMode === 'custom' ? 10 : 16, flexWrap:'wrap' }}>
                    {[['prev', 'Previous period'], ['yoy', 'Same period last year'], ['custom', 'Custom range']].map(([m, lbl]) => (
                      <button key={m} onClick={() => { setCompareMode(m); if (m === 'custom') prefillCustomRange() }}
                        style={{ padding:'7px 13px', borderRadius:8, border:`0.5px solid ${compareMode === m ? C.navy : C.border}`, background: compareMode === m ? C.navyBg : 'var(--card)', color: compareMode === m ? C.navy : C.sub, fontSize:12, fontWeight:700, fontFamily:FONT, cursor:'pointer' }}>
                        {lbl}
                      </button>
                    ))}
                  </div>

                  {compareMode === 'custom' && (
                    <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16, background:'var(--bg2)', border:`0.5px solid ${C.border}`, borderRadius:10, padding:'10px 12px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                        <span style={{ fontSize:11, fontWeight:700, color:C.muted, width:60, flexShrink:0 }}>This:</span>
                        <input type="date" value={compareCustomFromA} onChange={e => setCompareCustomFromA(e.target.value)}
                          style={{ padding:'6px 9px', borderRadius:7, border:`0.5px solid ${C.border}`, fontFamily:FONT, fontSize:12, color:C.text, outline:'none' }} />
                        <span style={{ color:C.muted, fontSize:12 }}>to</span>
                        <input type="date" value={compareCustomToA} onChange={e => setCompareCustomToA(e.target.value)}
                          style={{ padding:'6px 9px', borderRadius:7, border:`0.5px solid ${C.border}`, fontFamily:FONT, fontSize:12, color:C.text, outline:'none' }} />
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                        <span style={{ fontSize:11, fontWeight:700, color:C.muted, width:60, flexShrink:0 }}>Vs:</span>
                        <input type="date" value={compareCustomFrom} onChange={e => setCompareCustomFrom(e.target.value)}
                          style={{ padding:'6px 9px', borderRadius:7, border:`0.5px solid ${C.border}`, fontFamily:FONT, fontSize:12, color:C.text, outline:'none' }} />
                        <span style={{ color:C.muted, fontSize:12 }}>to</span>
                        <input type="date" value={compareCustomTo} onChange={e => setCompareCustomTo(e.target.value)}
                          style={{ padding:'6px 9px', borderRadius:7, border:`0.5px solid ${C.border}`, fontFamily:FONT, fontSize:12, color:C.text, outline:'none' }} />
                      </div>
                    </div>
                  )}

                  {compareRows.length === 0 || periodARows.length === 0 ? (
                    <div style={{ textAlign:'center', padding:'32px 0', color:C.muted, fontSize:13 }}>
                      {compareMode === 'custom' ? 'Pick both date ranges to compare.' : 'No data available for that period.'}
                    </div>
                  ) : (
                    <>
                      {/* Verdict */}
                      {compareVerdict && (
                        <div style={{
                          padding:'12px 16px', borderRadius:10, marginBottom:16, fontSize:13.5, fontWeight:700, lineHeight:1.5,
                          background: compareVerdict.tone === 'good' ? C.greenBg : compareVerdict.tone === 'bad' ? C.navyBg : compareVerdict.tone === 'warn' ? '#E3F5FD' : '#F8FAFC',
                          color: compareVerdict.tone === 'good' ? '#2F7A4B' : compareVerdict.tone === 'bad' ? C.navy : compareVerdict.tone === 'warn' ? '#0C6E93' : C.sub,
                        }}>
                          {compareVerdict.text}
                        </div>
                      )}

                      {/* KPI comparison grid */}
                      <div className="lq-kpi-grid" style={{ display:'grid', gridTemplateColumns:'repeat(3, minmax(0,1fr))', gap:10, marginBottom:18 }}>
                        {[
                          { label:'Total QL', a:periodAKpis.totalQL, b:compareKpis.totalQL, fmt:fmtN },
                          { label:'Leads', a:periodAKpis.leads, b:compareKpis.leads, fmt:fmtN },
                          { label:'Spend', a:periodAKpis.spend, b:compareKpis.spend, fmt:fmtINR },
                          { label:'CPQL', a:periodACpql, b:compareCpql, fmt:fmtINR, invert:true },
                          { label:'CPL', a:periodACpl, b:compareCpl, fmt:fmtINR, invert:true },
                          { label:'Applications', a:periodAKpis.apps, b:compareKpis.apps, fmt:fmtN },
                        ].map(m => {
                          const d = deltaPct(m.a, m.b)
                          const good = d == null ? null : (m.invert ? d < 0 : d > 0)
                          return (
                            <div key={m.label} style={{ padding:'12px 14px', borderRadius:10, border:`0.5px solid ${C.border}`, background:'var(--bg2)' }}>
                              <div style={{ fontSize:10, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:6 }}>{m.label}</div>
                              <div style={{ fontSize:17, fontWeight:800, color:C.text }}>{m.fmt(m.a)}</div>
                              <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:4 }}>
                                <span style={{ fontSize:11, color:C.muted }}>was {m.fmt(m.b)}</span>
                                {d != null && (
                                  <span style={{ fontSize:11, fontWeight:700, color: good == null ? C.muted : good ? '#2F7A4B' : C.navy }}>
                                    {d > 0 ? '+' : ''}{d.toFixed(0)}%
                                  </span>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {/* Ranked movers */}
                      {compareMovers.length > 0 && (
                        <div style={{ marginBottom:16 }}>
                          <div style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>What's driving it — by corridor</div>
                          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                            {compareMovers.map(mv => (
                              <div key={mv.corridor} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', borderRadius:9, background:'var(--bg2)' }}>
                                <div style={{ flex:1, minWidth:0, fontSize:12.5, fontWeight:700, color:C.text, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{mv.corridor}</div>
                                <div style={{ fontSize:11.5, color:C.muted }}>{fmtN(mv.bQL)} → {fmtN(mv.aQL)} QL</div>
                                <div style={{ fontSize:12, fontWeight:800, color: mv.deltaQL > 0 ? '#2F7A4B' : mv.deltaQL < 0 ? C.navy : C.muted, minWidth:60, textAlign:'right' }}>
                                  {mv.deltaQL > 0 ? '+' : ''}{fmtN(mv.deltaQL)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Recommended action */}
                      {compareAction && (
                        <div style={{ background:C.greenBg, border:'0.5px solid rgba(76,174,111,0.3)', borderRadius:10, padding:'12px 14px' }}>
                          <div style={{ fontSize:10, fontWeight:800, letterSpacing:'0.05em', textTransform:'uppercase', color:'#2F7A4B', marginBottom:3 }}>Recommended action</div>
                          <div style={{ fontSize:13, fontWeight:600, color:C.text, lineHeight:1.5 }}>{compareAction}</div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
