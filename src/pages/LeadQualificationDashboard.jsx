import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Card } from '../ui/dashboardKit'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, Cell, PieChart, Pie, CartesianGrid} from 'recharts'
import Sidebar from '../components/Sidebar'
import { DashboardSkeleton, InlineLoader } from '../components/SkeletonLoader'
import KPICard from '../components/KPICard'
import ExportButton from '../components/ExportButton'
import Button from '../components/Button'
import { fetchCSV } from '../lib/sheetCache'
import { getSession, setSession, getPersisted } from '../lib/sessionLoad'
import { usePresence } from '../hooks/usePresence'
import { useAuth } from '../hooks/useAuth'
import { resolveSheetUrl } from '../lib/dataSources'

const SHEET_CSV = 'https://docs.google.com/spreadsheets/d/1r-e6pBCN5ysfeD3Eq6sxgLmf97mdeTtloMPylqnx6Ew/gviz/tq?tqx=out:csv&sheet=Qlops';
const MONTHLY_CSV = 'https://docs.google.com/spreadsheets/d/1r-e6pBCN5ysfeD3Eq6sxgLmf97mdeTtloMPylqnx6Ew/gviz/tq?tqx=out:csv&sheet=QLSnapshot';
const QL_VIEWS = [
  { id: 'daily', label: 'Daily QLs', csv: SHEET_CSV },
  { id: 'monthly', label: 'Monthly QLs', csv: MONTHLY_CSV },
]

const C = {
  navy:'#1F3C84', blue:'#1C9FD4', cyan:'#29B9C3', green:'#4CAE6F',
  amber:'#F59E0B', navyBg:'#E8EFF9', blueBg:'#E3F5FD', cyanBg:'#E4F8F9', greenBg:'#E9F8EF',
  border:'var(--card-border)', text:'var(--text)', muted:'var(--text3)', sub:'var(--text2)', bg:'var(--bg)',
}
const PROVIDER_COLORS = { Futwork: C.navy, 'Futwork AI': C.cyan, Superbot: C.blue }

// On-brand ordered palette - navy -> blue -> cyan -> green, then tinted repeats.
// Used for multi-category bars so everything stays within brand colors.
const BRAND_RAMP = ['#1F3C84', '#1C9FD4', '#29B9C3', '#4CAE6F', '#3A5BA0', '#52B5DC', '#5BCAD2', '#73C58E']
const brandColor = i => BRAND_RAMP[i % BRAND_RAMP.length]
const FONT = "'Plus Jakarta Sans','Inter',sans-serif"
const PAGE_SIZE = 10

function fmtN(n) {
  if (!n && n !== 0) return '-'
  return Math.round(n).toLocaleString('en-IN')
}
function pct(a, b) { return b > 0 ? ((a / b) * 100).toFixed(1) + '%' : '-' }

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
  return data.filter(r => r[h('provider')] && r[h('provider')] !== 'provider').map(r => ({
    provider:        (r[h('provider')] || '').trim(),
    qualified_date:  r[h('qualified_date')] || '',
    month:           r[h('qualified_month')] || '',
    campaign:        (r[h('opp_first_campaign_name')] || '').trim(),
    source:          (r[h('source')] || 'Others').trim(),
    sub_source:      (r[h('sub_source')] || '').trim(),
    country:         (r[h('country_interested')] || '').trim(),
    degree_type:     (r[h('degree_type')] || '').trim(),
    disposition:     (r[h('disposition')] || '').trim(),
    futwork_project: (r[h('futwork_project')] || '').trim(),
    budget:          (r[h('budget')] || '').trim(),
    valid_passport:  (r[h('valid_passport')] || '').trim(),
    preferred_intake:(r[h('preferred_intake')] || '').trim(),
    highest_qual:    (r[h('highest_qualification')] || '').trim(),
    count:           1,  // one row = one qualified lead
  }))
}

function parseMonthlyCSV(csv) {
  const rows = csv.trim().split('\n').map(r => {
    const cols = []; let buf = '', inQ = false
    for (const ch of r) {
      if (ch === '"') { inQ = !inQ }
      else if (ch === ',' && !inQ) { cols.push(buf.trim()); buf = '' }
      else buf += ch
    }
    cols.push(buf.trim())
    return cols
  })
  const [hdr, ...data] = rows
  const h = k => hdr.map(x => x.toLowerCase().trim()).indexOf(k.toLowerCase())
  const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n }
  return data.filter(r => r.length > 1 && (r[h('period')] || '').trim()).map(r => ({
    period:               (r[h('period')] || '').trim(),
    date:                 (r[h('date')] || '').trim(),
    source:               (r[h('source')] || '').trim(),
    sub_source:           (r[h('sub_source')] || '').trim(),
    opp_count:            num(r[h('opp_count')]),
    floor_queued:         num(r[h('floor_queued')]),
    futwork_queued:       num(r[h('futwork_queued')]),
    superbot_queued:      num(r[h('superbot_queued')]),
    futwork_ai_queued:    num(r[h('futwork_ai_queued')]),
    futwork_qualified:    num(r[h('futwork_qualified')]),
    superbot_qualified:   num(r[h('superbot_qualified')]),
    futwork_ai_qualified: num(r[h('futwork_ai_qualified')]),
  }))
}

/* -- Shared UI components ---------------------------------------------- */


const Sparkline = ({ data, color='#1C9FD4', height=28, width=72 }) => {
  if (!data || data.length < 2) return null
  const min = Math.min(...data), max = Math.max(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (width - 4) + 2
    const y = height - 4 - ((v - min) / range) * (height - 8)
    return `${x},${y}`
  }).join(' ')
  const lastY = height - 4 - ((data[data.length-1] - min) / range) * (height - 8)
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display:'block', flexShrink:0 }}>
      <defs>
        <linearGradient id={`spk_${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.15}/>
          <stop offset="100%" stopColor={color} stopOpacity={0}/>
        </linearGradient>
      </defs>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={parseFloat(pts.split(' ').pop().split(',')[0])} cy={lastY} r="2.5" fill={color}/>
    </svg>
  )
}


/* Brand color ramp - ONLY brand colors, used for multi-series breakdowns */
const RAMP = ['#1F3C84', '#1C9FD4', '#29B9C3', '#4CAE6F']

/* KPI icons - crisp monochrome SVGs, brand-coloured */
const KPI_ICONS = {
  total: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>,
  agent: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  bot:   <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>,
  ai:    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4"/><path d="m6.4 6.4 2.8 2.8"/><path d="M2 12h4"/><circle cx="12" cy="13" r="5"/><path d="M12 18v4"/></svg>,
  globe: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/></svg>,
}

/* Premium KPI card - matches Meta Ads / WhatsApp standard: 3px accent top border, tinted icon square, delta pill */
const PremKPI = ({ label, value, sub, delta, accent, accentBg, icon }) => {
  const up = delta != null && delta >= 0
  return (
    <div style={{
      position: 'relative', overflow: 'hidden', borderRadius: 16, padding: '16px 18px',
      background: '#fff', border: '1px solid #EEF1F6', fontFamily: FONT,
      boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 8px 24px -12px rgba(16,24,40,0.18)',
      display: 'flex', flexDirection: 'column', minWidth: 0,
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: `linear-gradient(90deg, ${accent}, ${accent}99)` }} />
      <div style={{ position: 'absolute', top: -28, right: -28, width: 96, height: 96, borderRadius: '50%', background: `linear-gradient(135deg, ${accent}14, ${accent}05)` }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, position: 'relative' }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: '#fff', background: `linear-gradient(135deg, ${accent}, ${accent}D9)`, boxShadow: `0 4px 10px -2px ${accent}66`, flexShrink: 0 }}>{icon}</div>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em', color: '#64748B', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.6px', color: '#0F1B33', lineHeight: 1.05, position: 'relative', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7, minHeight: 18, position: 'relative' }}>
        {delta != null && (
          <span style={{ fontSize: 10.5, fontWeight: 700, color: up ? '#15803D' : '#1F3C84', background: up ? '#E9F8EF' : '#EEF1FB', padding: '2px 7px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 2, fontFamily: FONT, flexShrink: 0 }}>
            {up ? '\u25B2' : '\u25BC'} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
        {sub && <span style={{ fontSize: 11.5, color: '#8A94A6', fontFamily: FONT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</span>}
      </div>
    </div>
  )
}

/* Horizontal ranked bar list - premium look for category breakdowns */
const RankedBars = ({ data, labelKey, max, total, colorFn, showRank }) => {
  if (!data || data.length === 0) return <div style={{ textAlign: 'center', padding: '24px 0', color: C.muted, fontSize: 13, fontFamily: FONT }}>No data</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: '2px 0' }}>
      {data.map((r, i) => {
        const w = max > 0 ? (r.count / max * 100) : 0
        const col = colorFn ? colorFn(i) : RAMP[i % RAMP.length]
        return (
          <div key={r[labelKey] + i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {showRank && <div style={{ width: 20, textAlign: 'center', fontSize: 10, fontWeight: 800, color: '#fff', background: col, borderRadius: 6, padding: '2px 0', flexShrink: 0, fontFamily: FONT }}>{i + 1}</div>}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, alignItems: 'baseline' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.text, fontFamily: FONT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                  {r[labelKey]}
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: col, fontFamily: FONT, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{fmtN(r.count)}</span>
              </div>
              <div style={{ height: 7, borderRadius: 99, background: '#F1F5F9', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: w + '%', borderRadius: 99, background: `linear-gradient(90deg,${col},${col}cc)`, transition: 'width .6s cubic-bezier(.4,0,.2,1)' }} />
              </div>
            </div>
            <div style={{ fontSize: 10.5, color: C.muted, fontFamily: FONT, width: 36, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{pct(r.count, total)}</div>
          </div>
        )
      })}
    </div>
  )
}

/* Custom tooltip */
const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--card)', border: `0.5px solid ${C.border}`, borderRadius: 10,
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

/* Custom production-grade dropdown - replaces all native <select> */
const Dropdown = ({ options, value, onChange, label, minWidth = 120 }) => {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef(null)

  React.useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} ref={ref}>
      {label && <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT, whiteSpace: 'nowrap' }}>{label}</span>}
      <div style={{ position: 'relative' }}>
        {/* Trigger */}
        <button
          onClick={() => setOpen(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 10px 6px 12px', borderRadius: 8,
            border: `0.5px solid ${open ? C.navy : C.border}`,
            background: open ? C.navyBg : 'var(--card)',
            color: C.text, cursor: 'pointer', fontFamily: FONT,
            fontSize: 12, fontWeight: 600, minWidth,
            boxShadow: open ? `0 0 0 3px rgba(31,60,132,0.08)` : 'none',
            transition: 'all .15s', whiteSpace: 'nowrap',
          }}>
          <span style={{ flex: 1, textAlign: 'left' }}>{value}</span>
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none"
            style={{ flexShrink: 0, transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
            <path d="M1 1l4 4 4-4" stroke={C.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {/* Panel */}
        {open && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 500,
            background: 'var(--card)', border: `0.5px solid ${C.border}`,
            borderRadius: 12, boxShadow: '0 16px 40px rgba(15,23,42,0.14), 0 2px 8px rgba(15,23,42,0.06)',
            padding: '6px', minWidth: Math.max(minWidth, 150),
            maxHeight: 280, overflowY: 'auto',
            scrollbarWidth: 'none',
          }}>
            {options.map(opt => {
              const active = opt === value
              return (
                <button key={opt} onClick={() => { onChange(opt); setOpen(false) }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '8px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    fontFamily: FONT, fontSize: 12.5,
                    fontWeight: active ? 700 : 400,
                    background: active ? C.navyBg : 'transparent',
                    color: active ? C.navy : C.text,
                    transition: 'background .1s, color .1s',
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg3)' }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    {opt}
                    {active && (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.navy} strokeWidth="2.5" strokeLinecap="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
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


/* -- Production date picker ------------------------------------------- */
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAYS = ['Su','Mo','Tu','We','Th','Fr','Sa']

function CalMonth({ year, month, from, to, hovered, onSelect, onHover }) {
  const first   = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0).getDate()
  const startDow = first.getDay()
  const cells = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= lastDay; d++) cells.push(new Date(year, month, d))

  return (
    <div style={{ width: 220 }}>
      <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 8, fontFamily: FONT }}>
        {MONTHS_SHORT[month]} {year}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 4 }}>
        {DAYS.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: C.muted, padding: '2px 0', fontFamily: FONT }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
        {cells.map((date, i) => {
          if (!date) return <div key={`e${i}`} />
          const ts = date.getTime()
          const fromTs = from ? from.getTime() : null
          const toTs   = (to || hovered) ? (to || hovered).getTime() : null
          const isFrom   = fromTs && ts === fromTs
          const isTo     = toTs && ts === toTs && from
          const inRange  = fromTs && toTs && ts > Math.min(fromTs,toTs) && ts < Math.max(fromTs,toTs)
          const today    = new Date(); today.setHours(0,0,0,0)
          const isToday  = ts === today.getTime()
          let bg = 'transparent', color = C.text, radius = 6
          if (isFrom || isTo) { bg = C.navy; color = 'var(--card)' }
          else if (inRange)   { bg = C.navyBg; color = C.navy }
          return (
            <button key={ts}
              onClick={() => onSelect(date)}
              onMouseEnter={() => onHover(date)}
              onMouseLeave={() => onHover(null)}
              style={{
                width: '100%', aspectRatio: '1', border: 'none', cursor: 'pointer',
                borderRadius: radius, background: bg, color,
                fontSize: 11.5, fontWeight: isFrom || isTo ? 700 : isToday ? 600 : 400,
                fontFamily: FONT, position: 'relative', transition: 'background .1s',
              }}
              onMouseOver={e => { if (!isFrom && !isTo && !inRange) e.currentTarget.style.background = 'var(--bg3)' }}
              onMouseOut={e => { if (!isFrom && !isTo && !inRange) e.currentTarget.style.background = bg }}>
              {date.getDate()}
              {isToday && !isFrom && !isTo && (
                <span style={{ position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: '50%', background: C.blue, display: 'block' }} />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const fmtShort = d => {
  if (!d) return ''
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}
const fmt = d => { if (!d) return ''; const y=d.getFullYear(),mo=String(d.getMonth()+1).padStart(2,'0'),dy=String(d.getDate()).padStart(2,'0'); return `${y}-${mo}-${dy}` }

function DateRangePicker({ from, to, onChange, onClose }) {
  const today = new Date(); today.setHours(0,0,0,0)
  const [viewYear,  setViewYear]  = React.useState(today.getFullYear())
  const [viewMonth, setViewMonth] = React.useState(today.getMonth())
  const [hovered,   setHovered]   = React.useState(null)
  const [selFrom,   setSelFrom]   = React.useState(from || null)
  const [selTo,     setSelTo]     = React.useState(to || null)
  const [step,      setStep]      = React.useState(from ? 'to' : 'from')

  
  const handleSelect = date => {
    if (step === 'from' || selTo) {
      setSelFrom(date); setSelTo(null); setStep('to')
    } else {
      if (date < selFrom) { setSelFrom(date); setSelTo(selFrom) }
      else { setSelTo(date) }
      setStep('from')
    }
  }

  const right = viewMonth === 11 ? { y: viewYear+1, m: 0 } : { y: viewYear, m: viewMonth+1 }
  const canApply = selFrom && selTo

  const NavBtn = ({ dir, onClick: oc }) => (
    <button onClick={oc} style={{
      width: 28, height: 28, borderRadius: 7, border: `0.5px solid ${C.border}`,
      background: 'var(--card)', cursor: 'pointer', display: 'flex', alignItems: 'center',
      justifyContent: 'center', color: C.sub, transition: 'background .1s',
    }}
    onMouseOver={e=>e.currentTarget.style.background='var(--bg3)'}
    onMouseOut={e=>e.currentTarget.style.background='var(--card)'}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        {dir==='left' ? <polyline points="15 18 9 12 15 6"/> : <polyline points="9 18 15 12 9 6"/>}
      </svg>
    </button>
  )

  const goLeft  = () => viewMonth===0 ? (setViewYear(y=>y-1), setViewMonth(11)) : setViewMonth(m=>m-1)
  const goRight = () => viewMonth===11? (setViewYear(y=>y+1), setViewMonth(0))  : setViewMonth(m=>m+1)

  return (
    <div style={{ padding: '16px 20px', fontFamily: FONT }}>
      {/* Status bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
        <div style={{
          flex: 1, padding: '6px 10px', borderRadius: 8, border: `1.5px solid ${step==='from'?C.navy:C.border}`,
          background: step==='from'?C.navyBg:'#FAFAFA', fontSize: 12, fontWeight: 600, color: selFrom?C.text:C.muted,
          fontFamily: FONT, cursor: 'pointer',
        }} onClick={() => setStep('from')}>
          {selFrom ? fmt(selFrom) : 'Start date'}
        </div>
        <svg width="16" height="10" viewBox="0 0 16 10" fill="none"><path d="M0 5h14M10 1l4 4-4 4" stroke={C.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        <div style={{
          flex: 1, padding: '6px 10px', borderRadius: 8, border: `1.5px solid ${step==='to'&&selFrom?C.navy:C.border}`,
          background: step==='to'&&selFrom?C.navyBg:'#FAFAFA', fontSize: 12, fontWeight: 600, color: selTo?C.text:C.muted,
          fontFamily: FONT, cursor: selFrom?'pointer':'default',
        }} onClick={() => selFrom && setStep('to')}>
          {selTo ? fmt(selTo) : 'End date'}
        </div>
      </div>

      {/* Nav + dual calendars */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12 }}>
        <NavBtn dir="left"  onClick={goLeft}/>
        <div style={{ flex: 1 }}/>
        <NavBtn dir="right" onClick={goRight}/>
      </div>
      <div style={{ display: 'flex', gap: 24 }}>
        <CalMonth year={viewYear} month={viewMonth} from={selFrom} to={selTo} hovered={step==='to'?hovered:null} onSelect={handleSelect} onHover={step==='to'?setHovered:()=>{}}/>
        <CalMonth year={right.y} month={right.m} from={selFrom} to={selTo} hovered={step==='to'?hovered:null} onSelect={handleSelect} onHover={step==='to'?setHovered:()=>{}}/>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTop: `0.5px solid #F1F5F9` }}>
        <Button size="sm" variant="secondary" onClick={() => { setSelFrom(null); setSelTo(null); setStep('from') }}>
          Clear
        </Button>
        <Button size="sm" onClick={() => canApply && onChange(fmt(selFrom), fmt(selTo))} disabled={!canApply}>
          Apply range
        </Button>
      </div>
    </div>
  )
}
const ExportMenu = ({ exportData, exportView, setExportView, C, FONT }) => {
  const [open, setOpen] = React.useState(false)
  const views = [
    { key:'day',      label:'Day on day',     desc:'One row per date - provider - campaign' },
    { key:'month',    label:'Month on month',  desc:'Totals grouped by month + provider' },
    { key:'source',   label:'By source',       desc:'Totals grouped by source + provider' },
    { key:'campaign', label:'By campaign',     desc:'Campaigns ranked by qualified count' },
  ]
  const download = (type) => {
    if (!exportData || !exportData.length) return
    let content, mime, ext
    if (type === 'csv') {
      const cols = Object.keys(exportData[0])
      const rows2 = exportData.map(r => cols.map(c => {
        const v = r[c] ?? ''
        return typeof v === 'string' && v.includes(',') ? `"${v}"` : v
      }).join(','))
      content = [cols.join(','), ...rows2].join('\n'); mime = 'text/csv'; ext = 'csv'
    } else {
      content = JSON.stringify(exportData, null, 2); mime = 'application/json'; ext = 'json'
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([content], {type: mime}))
    a.download = `ql_ops_${exportView}_${new Date().toISOString().slice(0,10)}.${ext}`
    a.click(); setOpen(false)
  }
  return (
    <div style={{position:'relative'}}>
      <Button size="sm" variant="secondary" onClick={() => setOpen(v => !v)}
        style={open ? { borderColor: C.navy, color: C.navy, boxShadow: `0 0 0 3px rgba(31,60,132,0.08)` } : undefined}
        icon={
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        }>
        Export
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          style={{transition:'transform .2s', transform: open?'rotate(180deg)':'rotate(0deg)'}}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </Button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{position:'fixed',inset:0,zIndex:399}}/>
          <div style={{
            position:'absolute', top:'calc(100% + 8px)', right:0, zIndex:400,
            background:'var(--card)', border:`0.5px solid ${C.border}`, borderRadius:14,
            boxShadow:'0 16px 40px rgba(15,23,42,0.14)', padding:10, minWidth:264,
            fontFamily:FONT,
          }}>
            <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:'0.07em',textTransform:'uppercase',padding:'4px 6px 8px'}}>Export view</div>
            {views.map(v => (
              <button key={v.key} onClick={() => setExportView(v.key)}
                style={{
                  display:'flex', flexDirection:'column', gap:2, width:'100%',
                  padding:'8px 10px', border:'none', cursor:'pointer', borderRadius:8,
                  textAlign:'left', fontFamily:FONT,
                  background: exportView===v.key ? C.navyBg : 'transparent',
                  transition:'background .1s',
                }}
                onMouseOver={e=>{if(exportView!==v.key)e.currentTarget.style.background='var(--bg3)'}}
                onMouseOut={e=>{if(exportView!==v.key)e.currentTarget.style.background='transparent'}}>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <div style={{width:8,height:8,borderRadius:'50%',flexShrink:0,background:exportView===v.key?C.navy:C.border}}/>
                  <span style={{fontSize:12.5,fontWeight:exportView===v.key?700:500,color:exportView===v.key?C.navy:C.text}}>{v.label}</span>
                </div>
                <div style={{fontSize:11,color:C.muted,paddingLeft:14}}>{v.desc}</div>
              </button>
            ))}
            <div style={{height:'0.5px',background:'var(--bg3)',margin:'8px 4px'}}/>
            <div style={{display:'flex',gap:6,padding:'2px 4px 4px'}}>
              {[['CSV','csv'],['JSON','json']].map(([lbl,type])=>(
                <Button key={type} size="sm" variant="secondary" onClick={()=>download(type)} style={{flex:1}}
                  icon={
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                  }>
                  {lbl}
                </Button>
              ))}
            </div>
            <div style={{fontSize:10,color:C.muted,textAlign:'center',padding:'4px 0 2px'}}>
              {(exportData||[]).length.toLocaleString()} rows - respects active filters
            </div>
          </div>
        </>
      )}
    </div>
  )
}


/* -- Main dashboard --------------------------------------------------- */

const BrandTooltip = ({ active, payload, label, fmt }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'#fff', border:'0.5px solid #E5E7EB', borderRadius:12, padding:'10px 14px', fontFamily:"'Plus Jakarta Sans','Inter',sans-serif", boxShadow:'0 8px 32px rgba(15,23,42,0.13)', minWidth:140 }}>
      {label && <div style={{ fontSize:11, fontWeight:700, color:'#0F172A', marginBottom:7, paddingBottom:6, borderBottom:'0.5px solid #F1F5F9' }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:7, marginTop:i>0?4:0 }}>
          <div style={{ width:8, height:8, borderRadius:'50%', background:p.color||p.fill||'#1C9FD4', flexShrink:0 }}/>
          <span style={{ fontSize:11.5, color:'#475569', flex:1 }}>{p.name||p.dataKey}</span>
          <span style={{ fontSize:12, fontWeight:700, color:'#0F172A' }}>{fmt ? fmt(p.value) : (typeof p.value==='number'&&p.value>999?p.value.toLocaleString('en-IN'):p.value)}</span>
        </div>
      ))}
    </div>
  )
}

// Small export button used in monthly table card headers
const MTableExportBtn = ({ onClick, disabled }) => (
  <Button size="sm" variant="secondary" onClick={onClick} disabled={disabled}
    icon={
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
    }>
    Export CSV
  </Button>
)

export default function LeadQualificationDashboard({ forcedView } = {}) {
  const [rows, setRows]             = useState([])
  const [monthlyRows, setMonthlyRows] = useState([])
  const [view, setView]             = useState(forcedView || 'daily')
  React.useEffect(() => { if (forcedView) setView(forcedView) }, [forcedView])
  const [selPeriod, setSelPeriod]   = useState('all')
  const [months, setMonths]         = useState([])
  const [selMonth, setSelMonth]     = useState('')
  const [selProvider, setSelProvider] = useState('All')
  const [selSource, setSelSource]   = useState('All')
  const { user } = useAuth()
  const activeUsers = usePresence(user)
  const [loading, setLoading]       = useState(true)
  const [lastSync, setLastSync]     = useState(null)
  const [search, setSearch]         = useState('')
  const [sortCol, setSortCol]       = useState('count')
  const [sortDir, setSortDir]       = useState('desc')
  const [page, setPage]             = useState(0)
  const [showInfo, setShowInfo]       = useState(false)
  const [sending, setSending]         = useState(false)
  const [sendMsg, setSendMsg]         = useState('')
  const [datePreset, setDatePreset]   = useState('month') // 'LD','L7D','MTD','custom','month'
  const [customFrom, setCustomFrom]   = useState('')
  const [customTo, setCustomTo]       = useState('')
  const [showCustom, setShowCustom]   = useState(false)
  const [hoveredPreset, setHoveredPreset] = useState(null)
  const [exportView, setExportView]         = useState('day')
  const [monthStartMap, setMonthStartMap] = useState({})
  const [selMonthlySource, setSelMonthlySource] = useState('All')
  const [mDatePreset, setMDatePreset]  = useState('L30D') // 'L7D','L14D','L30D','custom'
  const [mCustomFrom, setMCustomFrom]  = useState('')
  const [mCustomTo, setMCustomTo]      = useState('')
  const [showMCustom, setShowMCustom]  = useState(false)

  const processCsv = useCallback((csv, cfg) => {
    const parsed = parseCSV(csv)
    if (cfg.id !== 'daily') {
      setMonthlyRows(parseMonthlyCSV(csv))
    } else {
      // Normalize month to clean 'Mon-YYYY' from qualified_date (raw
      // qualified_month column mixes '01-Apr-2026','Apr-2026' & stray values).
      const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
      const _norm=(raw)=>{ const m=String(raw||'').match(/([A-Za-z]{3})[a-z]*[-\s]*(\d{4})/); return m?(m[1][0].toUpperCase()+m[1].slice(1,3).toLowerCase()+'-'+m[2]):'' }
      parsed.forEach(r=>{ const d=new Date(r.qualified_date); if(!isNaN(d)){ r.month=MON[d.getMonth()]+'-'+d.getFullYear() } else { const c=_norm(r.month); r.month = c || '' } })
      setRows(parsed)
      // Build month list sorted by actual qualified_date (earliest per month)
      const monthMap = {}
      parsed.forEach(r => {
        const dateVal = r.qualified_date
        if (r.month && dateVal) {
          // keep the earliest date per month so sort is stable
          if (!monthMap[r.month] || dateVal < monthMap[r.month])
            monthMap[r.month] = dateVal
        }
      })
      const ms = [...new Set(parsed.map(r => r.month))].filter(Boolean)
        .sort((a, b) => new Date(monthMap[a] || 0) - new Date(monthMap[b] || 0))
      setMonths(ms)
      setMonthStartMap(monthMap)
      const _now=new Date(); const _curKey=MON[_now.getMonth()]+'-'+_now.getFullYear()
      const _def = ms.includes(_curKey) ? _curKey : (ms[ms.length-1] || '')
      setSelMonth(prev => prev || _def)
    }
  }, [])

  // Fetch-once-per-session, plus instant-paint-from-localStorage on a cold tab: if
  // this session already loaded this view, reuse it with zero network cost. Otherwise,
  // if a snapshot survived from a prior session (localStorage), render it immediately
  // instead of blocking on a fresh fetch of a very large sheet, then quietly fetch the
  // real thing in the background and swap it in once ready.
  const loadData = useCallback(async (bust = false) => {
    const t0 = Date.now()
    const cfg = QL_VIEWS.find(v => v.id === view) || QL_VIEWS[0]
    const cacheKey = 'qlops_' + cfg.id
    const cached = getSession(cacheKey)

    if (!bust && cached) {
      processCsv(cached.data, cfg)
      setLastSync(new Date(cached.ts))
      setLoading(false)
      return
    }

    let paintedFromCache = false
    if (!bust) {
      const persisted = getPersisted(cacheKey)
      if (persisted) {
        processCsv(persisted.data, cfg)
        setLastSync(new Date(persisted.ts))
        setLoading(false)
        paintedFromCache = true
      }
    }
    if (!paintedFromCache) setLoading(true)
    try {
      const baseCsv = await resolveSheetUrl(cfg.id === 'daily' ? 'qlopsDaily' : 'qlopsMonthly', cfg.csv)
      const url = bust ? baseCsv + (baseCsv.includes('?') ? '&' : '?') + '_=' + Date.now() : baseCsv
      const res = await fetch(url)
      const csv = await res.text()
      processCsv(csv, cfg)
      setSession(cacheKey, csv)
      setLastSync(new Date())
    } catch (e) { console.error('QL fetch', e) }
    finally {
      if (paintedFromCache) setLoading(false)
      else setTimeout(() => setLoading(false), Math.max(0, 750 - (Date.now() - t0)))
    }
  }, [view, processCsv])

  useEffect(() => { loadData() }, [loadData])

  // Is the selected month the current calendar month?
  const isCurrentMonth = useMemo(() => {
    const ms = monthStartMap[selMonth]
    if (!ms) return false
    const d = new Date(ms)
    const now = new Date()
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  }, [selMonth, monthStartMap])

  // Single active filter - what's currently driving the data
  // 'preset' = LD/L7D/MTD, 'month' = month picker, 'custom' = calendar range
  const activeFilter = datePreset === 'custom' ? 'custom'
    : (datePreset === 'month') ? 'month'
    : 'preset'

  // -- Derived data (correct dependency order) -----------------------------

  // 1. Date window from preset
  const dateWindow = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0)
    if (datePreset === 'LD') {
      const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
      return { from: yesterday, to: yesterday, label: 'Last Day' }
    }
    if (datePreset === 'L7D') {
      const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
      const from = new Date(yesterday); from.setDate(yesterday.getDate() - 6)
      return { from, to: yesterday, label: 'Last 7 days' }
    }
    if (datePreset === 'MTD') {
      const from = new Date(today.getFullYear(), today.getMonth(), 1)
      return { from, to: today, label: 'MTD ' + today.toLocaleString('default', { month: 'short', year: 'numeric' }) }
    }
    if (datePreset === 'custom' && customFrom && customTo) {
      const [fy,fm,fd]=customFrom.split('-').map(Number); const cf=new Date(fy,fm-1,fd); cf.setHours(0,0,0,0)
      const [ty,tm,td]=customTo.split('-').map(Number);   const ct=new Date(ty,tm-1,td); ct.setHours(23,59,59,999)
      return { from: cf, to: ct, label: customFrom + ' -> ' + customTo }
    }
    return null // 'month' mode - handled below
  }, [datePreset, customFrom, customTo])

  // 2. Row set filtered by date window OR selected month
  const dateFilteredRows = useMemo(() => {
    if (!dateWindow) return rows.filter(r => r.month === selMonth)
    // if qualified_date is missing on rows, fall back gracefully to month filter
    const hasDateCol = rows.some(r => r.qualified_date)
    if (!hasDateCol) return rows.filter(r => r.month === selMonth)
    return rows.filter(r => {
      if (!r.qualified_date) return false
      const ms = r.qualified_date
      let dd
      if (/^\d{4}-\d{2}-\d{2}$/.test(ms)) { const [y,mo,dy]=ms.split('-').map(Number); dd=new Date(y,mo-1,dy) }
      else { dd=new Date(ms) }
      dd.setHours(0,0,0,0)
      return dd >= dateWindow.from && dd <= dateWindow.to
    })
  }, [rows, dateWindow, selMonth])

  // 3. Derived lists from dateFilteredRows
  const providers = useMemo(() =>
    ['All', ...[...new Set(dateFilteredRows.map(r => r.provider))].filter(Boolean).sort()]
  , [dateFilteredRows])

  const sources = useMemo(() =>
    ['All', ...[...new Set(dateFilteredRows.map(r => r.source))].filter(Boolean).sort()]
  , [dateFilteredRows])

  // ===== MONTHLY VIEW (Monthly QLs sheet) =====
  const MQ_METRICS = useMemo(() => ([
    { key: 'opp_count',       label: 'Total Opp Count' },
    { key: 'floor_queued',    label: 'Floor Queued' },
    { key: 'futwork_queued',  label: 'Futwork Queued' },
    { key: 'superbot_queued', label: 'Superbot Queued' },
    { key: 'futwork_ai_queued',  label: 'Futwork AI Queued' },
    { key: 'futwork_qualified',  label: 'Futwork Qualified' },
    { key: 'superbot_qualified', label: 'Superbot Qualified' },
    { key: 'futwork_ai_qualified', label: 'Futwork AI Qualified' },
  ]), [])
  const mNum = (x) => { const n = parseFloat(String(x).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n }
  const MQ_MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const periodKey = (p) => { const m = String(p||'').match(/([A-Za-z]{3})[a-z]*-(\d{4})/); return m ? (parseInt(m[2],10) * 12 + MQ_MON.indexOf(m[1])) : 0 }
  const monthlyPeriods = useMemo(() =>
    [...new Set(monthlyRows.map(r => r.period))].filter(Boolean).sort((a,b) => periodKey(a) - periodKey(b))
  , [monthlyRows])
  const periodOptions = useMemo(() => ['all', ...monthlyPeriods], [monthlyPeriods])
  const mWin = (() => {
    const today = new Date(); today.setHours(0,0,0,0)
    const back = (n) => { const f = new Date(today); f.setDate(today.getDate() - (n-1)); return f }
    if (mDatePreset === 'L7D')  return { from: back(7),  to: today, label: 'Last 7 days' }
    if (mDatePreset === 'L14D') return { from: back(14), to: today, label: 'Last 14 days' }
    if (mDatePreset === 'custom' && mCustomFrom && mCustomTo) {
      const [fy,fm,fd] = mCustomFrom.split('-').map(Number)
      const [ty,tm,td] = mCustomTo.split('-').map(Number)
      const from = new Date(fy,fm-1,fd); from.setHours(0,0,0,0)
      const to = new Date(ty,tm-1,td); to.setHours(0,0,0,0)
      return { from, to, label: 'Custom' }
    }
    if (mDatePreset === 'ALL') return { from: new Date(2000, 0, 1), to: today, label: 'All time' }
    return { from: back(30), to: today, label: 'Last 30 days' }
  })()
    const mPD = (raw) => {
    const str = String(raw || '').trim()
    if (!str) return null
    // expected formats: '25-Jun-2026' or '2026-06-25'
    let d
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) { const [y,mo,dy] = str.split('-').map(Number); d = new Date(y,mo-1,dy) }
    else d = new Date(str)
    if (isNaN(d)) return null
    d.setHours(0,0,0,0)
    return d
  }
    const monthlyFiltered = useMemo(() => {
      const base = (selPeriod === 'all' ? monthlyRows : monthlyRows.filter(r => r.period === selPeriod))
        .filter(r => selMonthlySource === 'All' || r.source === selMonthlySource)
      // Apply the Days / custom-range window. Rows carry a per-day date on the Monthly QLs sheet.
      // If no row in the current scope has a parseable date, fall back to the full set (all months).
      const anyDated = base.some(r => mPD(r.date))
      if (!anyDated) return base
      return base.filter(r => {
        const d = mPD(r.date)
        if (!d) return false
        return d >= mWin.from && d <= mWin.to
      })
    }, [monthlyRows, selPeriod, selMonthlySource, mDatePreset, mCustomFrom, mCustomTo])
  const monthlyTotals = useMemo(() => {
    const t = {}
    MQ_METRICS.forEach(m => { t[m.key] = monthlyFiltered.reduce((s,r) => s + mNum(r[m.key]), 0) })
    return t
  }, [monthlyFiltered, MQ_METRICS])
  const monthlyBySource = useMemo(() => {
    const map = {}
    monthlyFiltered.forEach(r => {
      const k = r.source || 'Unknown'
      if (!map[k]) map[k] = { source: k, qualified: 0, queued: 0 }
      map[k].qualified += mNum(r.futwork_qualified) + mNum(r.superbot_qualified) + mNum(r.futwork_ai_qualified)
      map[k].queued += mNum(r.floor_queued)
    })
    return Object.values(map).sort((a,b) => b.qualified - a.qualified)
  }, [monthlyFiltered])

  // ===== MONTHLY: day-level helpers (date column added to Monthly QLs sheet) =====
  const mParseDate = (raw) => {
    const str = String(raw || '').trim()
    if (!str) return null
    // expected formats: '25-Jun-2026' or '2026-06-25'
    let d
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) { const [y,mo,dy] = str.split('-').map(Number); d = new Date(y,mo-1,dy) }
    else d = new Date(str)
    if (isNaN(d)) return null
    d.setHours(0,0,0,0)
    return d
  }
  // Source list for the monthly view (now that rows carry source + date)
  const monthlySources = useMemo(() =>
    ['All', ...[...new Set(monthlyRows.map(r => r.source))].filter(Boolean).sort()]
  , [monthlyRows])
  // Date window for the day-on-day table
  const mDateWindow = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0)
    const back = (n) => { const f = new Date(today); f.setDate(today.getDate() - (n-1)); return f }
    if (mDatePreset === 'L7D')  return { from: back(7),  to: today, label: 'Last 7 days' }
    if (mDatePreset === 'L14D') return { from: back(14), to: today, label: 'Last 14 days' }
    if (mDatePreset === 'custom' && mCustomFrom && mCustomTo) {
      const [fy,fm,fd] = mCustomFrom.split('-').map(Number)
      const [ty,tm,td] = mCustomTo.split('-').map(Number)
      const from = new Date(fy,fm-1,fd); from.setHours(0,0,0,0)
      const to = new Date(ty,tm-1,td); to.setHours(0,0,0,0)
      return { from, to, label: 'Custom' }
    }
    if (mDatePreset === 'ALL') return { from: new Date(2000, 0, 1), to: today, label: 'All time' }
    return { from: back(30), to: today, label: 'Last 30 days' }
  }, [mDatePreset, mCustomFrom, mCustomTo])
    const monthlyScopeLabel = (selPeriod === 'all' ? '' : selPeriod + ' / ') + (mDatePreset === 'custom' && mCustomFrom && mCustomTo ? mCustomFrom + ' -> ' + mCustomTo : mDateWindow.label)
  // Period + source filtered set (drives month-on-month table)
  const monthlyScoped = useMemo(() =>
    monthlyFiltered.filter(r => selMonthlySource === 'All' || r.source === selMonthlySource)
  , [monthlyFiltered, selMonthlySource])
  // Month-on-month aggregation respecting source filter
  const monthlyByPeriodScoped = useMemo(() =>
    monthlyPeriods
      .map(p => {
        const rs = monthlyScoped.filter(r => r.period === p)
        const row = { period: p }
        MQ_METRICS.forEach(m => { row[m.key] = rs.reduce((s,r) => s + mNum(r[m.key]), 0) })
        return row
      })
      .filter(row => MQ_METRICS.some(m => row[m.key] > 0) || selMonthlySource === 'All')
  , [monthlyScoped, monthlyPeriods, MQ_METRICS, selMonthlySource])
  // Day-on-day aggregation (period + source + date window), newest first
  const pctN = (a, b) => b > 0 ? (a / b) * 100 : null
  const heatColor = (v) => v == null ? C.muted : v >= 50 ? C.green : v >= 25 ? C.cyan : v >= 10 ? C.blue : C.navy
  const heatBg = (v) => v == null ? 'transparent' : v >= 50 ? 'rgba(76,174,111,0.14)' : v >= 25 ? 'rgba(41,185,195,0.12)' : v >= 10 ? 'rgba(28,159,212,0.10)' : 'rgba(31,60,132,0.06)'
  const monthlyByDate = useMemo(() => {
    const map = {}
    monthlyScoped.forEach(r => {
      const d = mParseDate(r.date)
      if (!d) return
      if (d < mDateWindow.from || d > mDateWindow.to) return
      const key = r.date
      if (!map[key]) { map[key] = { date: r.date, _ts: d.getTime() }; MQ_METRICS.forEach(m => map[key][m.key] = 0) }
      MQ_METRICS.forEach(m => { map[key][m.key] += mNum(r[m.key]) })
    })
    return Object.values(map).sort((a,b) => b._ts - a._ts)
  }, [monthlyScoped, mDateWindow, MQ_METRICS])

  // CSV download helper + export row builders for the monthly tables
  const qlPctNum = (r) => { const q = mNum(r.floor_queued); return q > 0 ? +(((mNum(r.futwork_qualified) + mNum(r.superbot_qualified) + mNum(r.futwork_ai_qualified)) / q) * 100).toFixed(1) : 0 }
  const convNum = (q, total) => { const t = mNum(total); return t > 0 ? +(((mNum(q)) / t) * 100).toFixed(1) : 0 }
  const downloadCSV = (rowsData, filename) => {
    if (!rowsData || !rowsData.length) return
    const cols = Object.keys(rowsData[0])
    const esc = (v) => { const x = v == null ? '' : v; return (typeof x === 'string' && (x.includes(',') || x.includes('"'))) ? '"' + x.replace(/"/g, '""') + '"' : x }
    const body = rowsData.map(r => cols.map(c => esc(r[c])).join(','))
    const content = [cols.join(','), ...body].join('\n')
    const blob = new Blob([content], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const dayExportRows = useMemo(() => monthlyByDate.map(r => ({
    date: r.date,
    total_ql: mNum(r.futwork_qualified) + mNum(r.superbot_qualified) + mNum(r.futwork_ai_qualified),
    total_opp_count: r.opp_count, floor_queued: r.floor_queued,
    futwork_queued: r.futwork_queued, superbot_queued: r.superbot_queued, futwork_ai_queued: r.futwork_ai_queued,
    futwork_qualified: r.futwork_qualified, superbot_qualified: r.superbot_qualified, futwork_ai_qualified: r.futwork_ai_qualified,
    queued_to_ql_pct: qlPctNum(r),
    futwork_q_to_ql_pct: convNum(r.futwork_qualified, r.futwork_queued),
    superbot_q_to_ql_pct: convNum(r.superbot_qualified, r.superbot_queued),
    futwork_ai_q_to_ql_pct: convNum(r.futwork_ai_qualified, r.futwork_ai_queued),
  })), [monthlyByDate])
  const monthExportRows = useMemo(() => monthlyByPeriodScoped.map(r => ({
    period: r.period,
    total_ql: mNum(r.futwork_qualified) + mNum(r.superbot_qualified) + mNum(r.futwork_ai_qualified),
    total_opp_count: r.opp_count, floor_queued: r.floor_queued,
    futwork_queued: r.futwork_queued, superbot_queued: r.superbot_queued, futwork_ai_queued: r.futwork_ai_queued,
    futwork_qualified: r.futwork_qualified, superbot_qualified: r.superbot_qualified, futwork_ai_qualified: r.futwork_ai_qualified,
    queued_to_ql_pct: qlPctNum(r),
    futwork_q_to_ql_pct: convNum(r.futwork_qualified, r.futwork_queued),
    superbot_q_to_ql_pct: convNum(r.superbot_qualified, r.superbot_queued),
    futwork_ai_q_to_ql_pct: convNum(r.futwork_ai_qualified, r.futwork_ai_queued),
  })), [monthlyByPeriodScoped])

  // 4. Apply provider + source dropdowns
  const filtered = useMemo(() => dateFilteredRows.filter(r =>
    (selProvider === 'All' || r.provider === selProvider) &&
    (selSource === 'All' || r.source === selSource)
  ), [dateFilteredRows, selProvider, selSource]);

  // Day-on-day breakdown: group filtered rows by normalized qualified_date (YYYY-MM-DD)
  const dayOnDay = useMemo(() => {
    const map = {};
    filtered.forEach(r => {
      const ms = r.qualified_date;
      if (!ms) return;
      let dd;
      if (/^\d{4}-\d{2}-\d{2}/.test(ms)) { const [y, mo, dy] = String(ms).slice(0, 10).split('-').map(Number); dd = new Date(y, mo - 1, dy); }
      else { dd = new Date(ms); }
      if (isNaN(dd)) return;
      const key = dd.getFullYear() + '-' + String(dd.getMonth() + 1).padStart(2, '0') + '-' + String(dd.getDate()).padStart(2, '0');
      if (!map[key]) map[key] = { date: key, Futwork: 0, 'Futwork AI': 0, Superbot: 0, total: 0 };
      map[key][r.provider] = (map[key][r.provider] || 0) + r.count;
      map[key].total += r.count;
    });
    return Object.values(map).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 31);
  }, [filtered]);

  // 5. KPI totals - use filtered so provider/source dropdowns affect the cards
  const totals = useMemo(() => {
    const fw   = filtered.filter(r => r.provider === 'Futwork').reduce((s, r) => s + r.count, 0)
    const fwai = filtered.filter(r => r.provider === 'Futwork AI').reduce((s, r) => s + r.count, 0)
    const sb   = filtered.filter(r => r.provider === 'Superbot').reduce((s, r) => s + r.count, 0)
    const total = fw + fwai + sb
    // MoM delta: compare filtered selection against same provider/source in previous month
    const prevM    = months[months.indexOf(selMonth) - 1]
    const prevBase = prevM ? rows.filter(r => r.month === prevM
      && (selProvider === 'All' || r.provider === selProvider)
      && (selSource   === 'All' || r.source   === selSource)
    ) : []
    const prevFw   = prevBase.filter(r => r.provider === 'Futwork').reduce((s, r) => s + r.count, 0)
    const prevFwai = prevBase.filter(r => r.provider === 'Futwork AI').reduce((s, r) => s + r.count, 0)
    const prevSb   = prevBase.filter(r => r.provider === 'Superbot').reduce((s, r) => s + r.count, 0)
    const prevTot  = prevFw + prevFwai + prevSb
    return {
      fw, fwai, sb, total,
      totalDelta: prevTot > 0 ? ((total - prevTot)  / prevTot * 100) : null,
      fwDelta:    prevFw  > 0 ? ((fw    - prevFw)   / prevFw  * 100) : null,
      fwaiDelta:  prevFwai > 0 ? ((fwai - prevFwai) / prevFwai * 100) : null,
      sbDelta:    prevSb  > 0 ? ((sb    - prevSb)   / prevSb  * 100) : null,
    }
  }, [filtered, rows, months, selMonth, selProvider, selSource])


  const sourceBar = useMemo(() => {
    const map = {}
    filtered.forEach(r => {
      const s = r.source || 'Others'
      if (!map[s]) map[s] = { source: s, Futwork: 0, 'Futwork AI': 0, Superbot: 0 }
      map[s][r.provider] = (map[s][r.provider] || 0) + r.count
    })
    return Object.values(map).sort((a, b) => (b.Futwork + b['Futwork AI'] + b.Superbot) - (a.Futwork + a['Futwork AI'] + a.Superbot)).slice(0, 8)
  }, [filtered])

  /* Donut always from full month (shows whole picture) */
  const provPie = useMemo(() => [
    { name: 'Futwork', value: totals.fw },
    { name: 'Futwork AI', value: totals.fwai },
    { name: 'Superbot', value: totals.sb },
  ].filter(d => d.value > 0), [totals])

  const trend = useMemo(() => months.map(m => {
    const mr = rows.filter(r => r.month === m)
    return {
      month: m,
      Futwork:      mr.filter(r => r.provider === 'Futwork').reduce((s, r) => s + r.count, 0),
      'Futwork AI': mr.filter(r => r.provider === 'Futwork AI').reduce((s, r) => s + r.count, 0),
      Superbot:     mr.filter(r => r.provider === 'Superbot').reduce((s, r) => s + r.count, 0),
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

  // -- NEW DIMENSION BREAKDOWNS ---------------------------------------------
  const countryBar = useMemo(() => {
    const map = {}
    filtered.forEach(r => {
      const k = (r.country || 'Unknown').replace(/ *\(.*\)/, '').trim() || 'Unknown'
      if (!map[k]) map[k] = { country: k, count: 0 }
      map[k].count++
    })
    return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 10)
  }, [filtered])

  const degreeBar = useMemo(() => {
    const map = {}
    filtered.forEach(r => {
      const k = r.degree_type || 'Unknown'
      if (!map[k]) map[k] = { degree: k, count: 0 }
      map[k].count++
    })
    return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 8)
  }, [filtered])

  const dispositionBar = useMemo(() => {
    const map = {}
    filtered.forEach(r => {
      const k = r.disposition || 'Unknown'
      if (!map[k]) map[k] = { disposition: k, count: 0 }
      map[k].count++
    })
    return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 8)
  }, [filtered])

  const budgetBar = useMemo(() => {
    const ORDER = ['<5L','5-10L','10-15L','15-20L','20-30L','30-50L','>50L']
    const map = {}
    filtered.forEach(r => {
      const k = r.budget || 'Unknown'
      if (!map[k]) map[k] = { budget: k, count: 0 }
      map[k].count++
    })
    return Object.values(map)
      .sort((a, b) => {
        const ai = ORDER.indexOf(a.budget), bi = ORDER.indexOf(b.budget)
        if (ai !== -1 && bi !== -1) return ai - bi
        if (ai !== -1) return -1
        if (bi !== -1) return 1
        return b.count - a.count
      })
      .slice(0, 8)
  }, [filtered])

  const intakeBar = useMemo(() => {
    const map = {}
    filtered.forEach(r => {
      const k = r.preferred_intake || 'Unknown'
      if (!map[k]) map[k] = { intake: k, count: 0 }
      map[k].count++
    })
    return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 8)
  }, [filtered])

  const passportPie = useMemo(() => {
    const yes = filtered.filter(r => r.valid_passport === 'Yes').length
    const no  = filtered.filter(r => r.valid_passport === 'No').length
    return [
      { name: 'Has Passport', value: yes },
      { name: 'No Passport',  value: no },
    ].filter(d => d.value > 0)
  }, [filtered])

  const topCountries = useMemo(() => countryBar.slice(0, 5), [countryBar])

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

  // Export datasets - all respect active filters (date + provider + source)
  const exportData = React.useMemo(() => {
    const label = exportView
    if (label === 'day') {
      // Raw day-level rows
      return filtered.map(r => ({
        date:           r.qualified_date || r.month,
        month:          r.month,
        provider:       r.provider,
        source:         r.source,
        sub_source:     r.sub_source,
        campaign:       r.campaign,
        qualified_count: r.count,
      }))
    }
    if (label === 'month') {
      // Aggregate by month + provider
      const map = {}
      filtered.forEach(r => {
        const k = r.month + '||' + r.provider
        if (!map[k]) map[k] = { month: r.month, provider: r.provider, qualified_count: 0 }
        map[k].qualified_count += r.count
      })
      return Object.values(map).sort((a,b) => a.month.localeCompare(b.month) || a.provider.localeCompare(b.provider))
    }
    if (label === 'source') {
      // Aggregate by source + provider
      const map = {}
      filtered.forEach(r => {
        const k = r.source + '||' + r.provider
        if (!map[k]) map[k] = { source: r.source, provider: r.provider, qualified_count: 0 }
        map[k].qualified_count += r.count
      })
      return Object.values(map).sort((a,b) => b.qualified_count - a.qualified_count)
    }
    if (label === 'campaign') {
      // Aggregate by campaign + provider
      const map = {}
      filtered.forEach(r => {
        const k = r.campaign + '||' + r.provider
        if (!map[k]) map[k] = { campaign: r.campaign, provider: r.provider, source: r.source, qualified_count: 0 }
        map[k].qualified_count += r.count
      })
      return Object.values(map).sort((a,b) => b.qualified_count - a.qualified_count)
    }
    return filtered.map(r => ({ ...r, qualified_count: r.count }))
  }, [filtered, exportView])

  const totalPages = Math.ceil(tableRows.length / PAGE_SIZE)
  const pageRows   = tableRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const sortBy   = col => { setSortCol(col); setSortDir(d => sortCol === col ? (d === 'desc' ? 'asc' : 'desc') : 'desc'); setPage(0) }
  const onSearch = v  => { setSearch(v); setPage(0) }

  const thS = col => ({
    fontSize: 10, fontWeight: 800, color: sortCol === col ? '#1F3C84' : '#64748B', letterSpacing: '0.07em',
    textTransform: 'uppercase', padding: '11px 12px', cursor: 'pointer', textAlign: 'left',
    userSelect: 'none', fontFamily: FONT, whiteSpace: 'nowrap',
    background: sortCol === col ? '#EEF2FB' : 'transparent',
    borderBottom: '1px solid #E8ECF3', transition: 'background .15s',
  })

  const sendReport = async () => {
    if (!window.confirm('Send this report by email to ALL configured recipients now? Manage recipients in Settings -> Reports.')) return
    setSending(true); setSendMsg('')
    try {
      const res = await fetch('/api/send-report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      const d = await res.json()
      setSendMsg(d.ok ? '" Sent' : '" Failed')
    } catch (e) { setSendMsg('Error: ' + e.message) }
    finally { setSending(false); setTimeout(() => setSendMsg(''), 4000) }
  }

  return (
    <div className="lq-page-shell" style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.bg, fontFamily: FONT }}>
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}.lqTr:nth-child(even){background:#FAFBFC!important}.lqTr:hover{background:#F0F4FF!important;cursor:pointer}`}</style>
      <Sidebar />
      <div style={{margin:'12px 14px 0',borderRadius:14,border:'1px solid #EEF1F6',boxShadow:'0 1px 3px rgba(31,60,132,0.06)', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* -- HEADER ------------------------------------------------- */}
        <div style={{
          background: 'var(--card)', borderBottom: `0.5px solid ${C.border}`,
          padding: '0 28px', minHeight: 56, height: 'auto', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 12, flexShrink: 0, overflow: 'visible',
        }}>
          <div>
            <p style={{ fontSize: 10.5, color: C.muted, margin: 0, letterSpacing: '0.05em', textTransform: 'uppercase', fontFamily: FONT }}>Dashboards / QL Ops</p>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: '2px 0 0', letterSpacing: '-0.4px', fontFamily: FONT }}>
              Lead Qualification
              {' - '}
              {activeFilter === 'custom' && customFrom
                ? <span style={{fontSize:13,fontWeight:600,color:C.blue}}>{customFrom} -> {customTo}</span>
                : activeFilter === 'preset' && dateWindow
                  ? <span style={{fontSize:13,fontWeight:600,color:C.blue}}>{dateWindow.label}</span>
                  : <span>{selMonth || '-'}</span>
              }
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap', overflow: 'visible', flexShrink: 1, minWidth: 0 }}>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background:'#F8FAFC', padding:'6px 10px', borderRadius:12, border:'0.5px solid #E5E7EB' }}>
          {isCurrentMonth && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg3)', borderRadius: 9, padding: '3px' }}>
              {[['LD','Last Day'],['L7D','Last 7D'],['MTD','MTD']].map(([key,lbl2]) => {
                // compute this key's date range label for tooltip
                const today2 = new Date(); today2.setHours(0,0,0,0)
                let tipFrom, tipTo
                if (key==='LD') { tipFrom=new Date(today2); tipFrom.setDate(today2.getDate()-1); tipTo=tipFrom }
                else if (key==='L7D') { tipTo=new Date(today2); tipTo.setDate(today2.getDate()-1); tipFrom=new Date(tipTo); tipFrom.setDate(tipTo.getDate()-6) }
                else { tipFrom=new Date(today2.getFullYear(),today2.getMonth(),1); tipTo=today2 }
                const tipLabel = fmtShort(tipFrom) + ' - ' + fmtShort(tipTo)
                const isHov = hoveredPreset===key
                return (
                  <div key={key} style={{position:'relative'}}>
                    <button
                      onClick={() => { setDatePreset(key); setCustomFrom(''); setCustomTo(''); setShowCustom(false); setPage(0) }}
                      onMouseEnter={() => setHoveredPreset(key)}
                      onMouseLeave={() => setHoveredPreset(null)}
                      style={{
                        padding: '5px 11px', borderRadius: 7, border: 'none', cursor: 'pointer',
                        fontSize: 11.5, fontWeight: 700, fontFamily: FONT,
                        background: activeFilter==='custom' ? 'transparent' : datePreset === key ? 'linear-gradient(135deg, #1F3C84, #1C9FD4)' : 'transparent',
                        color: activeFilter==='custom' ? '#CBD5E1' : datePreset === key ? '#fff' : '#64748B',
                        boxShadow: activeFilter==='custom' ? 'none' : datePreset === key ? '0 4px 10px -3px rgba(31,60,132,0.5)' : 'none',
                        opacity: activeFilter==='custom' ? 0.5 : 1,
                        pointerEvents: activeFilter==='custom' ? 'none' : 'auto',
                        transition: 'all .15s',
                      }}>{lbl2}</button>
                    {/* Hover tooltip */}
                    <div style={{
                      position:'absolute', top:'calc(100% + 7px)', left:'50%', transform:'translateX(-50%)',
                      background:'#1E293B', color:'var(--card)', fontSize:11, fontWeight:500, fontFamily:FONT,
                      padding:'5px 10px', borderRadius:7, whiteSpace:'nowrap', pointerEvents:'none',
                      boxShadow:'0 4px 14px rgba(15,23,42,0.18)', zIndex:600,
                      opacity: isHov ? 1 : 0,
                      transition:'opacity .15s ease',
                    }}>{tipLabel}
                      {/* Arrow */}
                      <div style={{
                        position:'absolute', top:-4, left:'50%', transform:'translateX(-50%)',
                        width:8, height:8, background:'#1E293B', borderRadius:2,
                        clipPath:'polygon(50% 0%, 0% 100%, 100% 100%)',
                      }}/>
                    </div>
                  </div>
                )
              })}
            </div>
            )}
            
            {/* Month picker */}
            {months.length > 0 && (
              <div style={{ opacity: activeFilter!=='month' ? 0.45 : 1, transition: 'opacity .15s' }}
                title={activeFilter!=='month' ? 'Click to switch to month view' : undefined}>
              <Dropdown
                options={[...months].reverse()}
                value={selMonth}
                minWidth={110}
                onChange={v => {
                  setSelMonth(v)
                  // Month picker always wins - clear any preset or custom range
                  setDatePreset('month')
                  setCustomFrom(''); setCustomTo('')
                  setShowCustom(false); setPage(0)
                }}
              />
              </div>
            )}
            {/* Custom range - production calendar picker */}
            {view !== 'monthly' && (<div style={{ position: 'relative' }}>
              <button onClick={() => { setShowCustom(v => !v); if (!showCustom) { setDatePreset('month') } }}
                style={{
                  padding: '6px 11px', borderRadius: 8,
                  border: `0.5px solid ${datePreset==='custom'?C.navy:C.border}`,
                  background: datePreset==='custom'?C.navyBg:'var(--card)',
                  color: datePreset==='custom'?C.navy:C.sub,
                  fontSize: 11.5, fontWeight: 600, fontFamily: FONT, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 5,
                  boxShadow: showCustom?`0 0 0 3px rgba(31,60,132,0.08)`:'none',
                  transition: 'all .15s',
                }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <rect x="3" y="4" width="18" height="18" rx="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                {datePreset==='custom'&&customFrom ? customFrom+' -> '+customTo : 'Custom'}
              </button>
              {showCustom && (
                <>
                  <div onClick={() => setShowCustom(false)} style={{ position: 'fixed', inset: 0, zIndex: 399 }} />
                  <div style={{
                    position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 400,
                    background: 'var(--card)', border: `0.5px solid ${C.border}`, borderRadius: 14,
                    boxShadow: '0 20px 60px rgba(15,23,42,0.16), 0 4px 12px rgba(15,23,42,0.06)',
                    overflow: 'hidden',
                  }}>
                    <DateRangePicker
                      from={customFrom ? (() => { const [y,m,d]=customFrom.split('-').map(Number); return new Date(y,m-1,d) })() : null}
                      to={customTo ? (() => { const [y,m,d]=customTo.split('-').map(Number); return new Date(y,m-1,d) })() : null}
                      onChange={(f, t) => {
                        setCustomFrom(f); setCustomTo(t)
                        setDatePreset('custom')
                        setShowCustom(false); setPage(0)
                      }}
                      onClose={() => setShowCustom(false)}
                    />
                  </div>
                </>
              )}
            </div>)}
            {!forcedView && (<Dropdown label="View" options={QL_VIEWS.map(v => v.label)} value={(QL_VIEWS.find(v => v.id === view) || QL_VIEWS[0]).label} minWidth={150} onChange={lbl => { const sel = QL_VIEWS.find(v => v.label === lbl); setView(sel ? sel.id : 'daily'); setSelPeriod('all'); setPage(0) }} />)}
              {view === 'monthly' && <><Dropdown label="Source" options={monthlySources} value={selMonthlySource} minWidth={120} onChange={v => setSelMonthlySource(v)} />
              <Dropdown label="Days" options={['Last 7 days','Last 14 days','Last 30 days','All time','Custom']} value={mDatePreset === 'custom' ? 'Custom' : mDateWindow.label} minWidth={130} onChange={v => { if (v === 'Custom') { setMDatePreset('custom'); setShowMCustom(true) } else { setMDatePreset(v === 'Last 7 days' ? 'L7D' : v === 'Last 14 days' ? 'L14D' : v === 'All time' ? 'ALL' : 'L30D'); setShowMCustom(false) } }} />
              <div style={{ position: 'relative' }}>
                <button onClick={() => setShowMCustom(s => !s)}
                  style={{
                    padding: '7px 12px', borderRadius: 8,
                    border: `0.5px solid ${mDatePreset === 'custom' ? C.navy : C.border}`,
                    background: mDatePreset === 'custom' ? C.navyBg : 'var(--card)',
                    color: mDatePreset === 'custom' ? C.navy : C.sub,
                    fontSize: 11.5, fontWeight: 600, fontFamily: FONT, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 5,
                    boxShadow: showMCustom ? `0 0 0 3px rgba(31,60,132,0.08)` : 'none',
                    transition: 'all .15s',
                  }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <rect x="3" y="4" width="18" height="18" rx="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                  {mDatePreset === 'custom' && mCustomFrom ? mCustomFrom + ' -> ' + mCustomTo : 'Custom range'}
                </button>
                {showMCustom && (
                  <>
                    <div onClick={() => setShowMCustom(false)} style={{ position: 'fixed', inset: 0, zIndex: 399 }} />
                    <div style={{
                      position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 400,
                      background: 'var(--card)', border: `0.5px solid ${C.border}`, borderRadius: 14,
                      boxShadow: '0 20px 60px rgba(15,23,42,0.16), 0 4px 12px rgba(15,23,42,0.06)',
                      overflow: 'hidden',
                    }}>
                      <DateRangePicker
                        from={mCustomFrom ? (() => { const [y,m,d] = mCustomFrom.split('-').map(Number); return new Date(y,m-1,d) })() : null}
                        to={mCustomTo ? (() => { const [y,m,d] = mCustomTo.split('-').map(Number); return new Date(y,m-1,d) })() : null}
                        onChange={(f, t) => { setMCustomFrom(f); setMCustomTo(t); setMDatePreset('custom'); setShowMCustom(false) }}
                        onClose={() => setShowMCustom(false)}
                      />
                    </div>
                  </>
                )}
              </div></>}
              {view === 'daily' && <><Dropdown label="Provider" options={providers} value={selProvider} minWidth={100} onChange={v => { setSelProvider(v); setPage(0) }} />
            <Dropdown label="Source" options={sources} value={selSource} minWidth={100} onChange={v => { setSelSource(v); setPage(0) }} /></>}
            {lastSync && <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>Synced {lastSync.toLocaleTimeString()}</span>}
            <Button size="sm" variant="secondary" onClick={() => loadData(true)} disabled={loading} className="lqRefreshBtn"
              icon={
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                  style={{ animation: loading ? 'spin .8s linear infinite' : 'none' }}>
                  <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
              }>
              {loading ? 'Refreshing' : 'Refresh'}
            </Button>

            {/* Export button with view selector */}
            <div style={{position:'relative'}}>
              <ExportMenu exportData={exportData} exportView={exportView} setExportView={setExportView} C={C} FONT={FONT} />
            </div>

            {/* Info popover */}
            <div style={{ position: 'relative' }}>
              <button onClick={() => setShowInfo(v => !v)}
                style={{
                  width: 30, height: 30, borderRadius: 8, border: `0.5px solid ${C.border}`,
                  background: showInfo ? C.navyBg : 'var(--card)', color: C.navy,
                  fontSize: 14, fontWeight: 700, fontStyle: 'italic', fontFamily: 'Georgia,serif',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>i</button>
              {showInfo && <div onClick={() => setShowInfo(false)} style={{ position: 'fixed', inset: 0, zIndex: 150 }} />}
              {showInfo && (
                <div style={{
                  position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 200,
                  width: 340, background: 'var(--card)', border: `0.5px solid ${C.border}`,
                  borderRadius: 12, boxShadow: '0 14px 40px rgba(15,23,42,0.16)',
                  padding: '16px 18px', fontFamily: FONT,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>How metrics are calculated</div>
                  {[
                    ['Qualified lead', 'One row in the sheet = one qualified lead. Each row carries provider, source, country, degree, disposition, budget and intake.'],
                    ['Total Qualified', 'Count of qualified-lead rows across all providers and sources for the selected period.'],
                    ['Providers', 'Futwork (human agents), Futwork AI (automated voice agent), and Superbot (IVR bot). Each shown as count and share of total.'],
                    ['Country / Degree', 'Qualified leads grouped by country interested and preferred degree type. Country labels are cleaned of parenthetical suffixes.'],
                    ['Disposition', 'Call outcome classification (e.g. Discover Future Intent, Interested in Call Back, Call Transferred To Counsellor).'],
                    ['Budget / Intake', 'Student budget range preference and preferred start intake, distributed across qualified leads.'],
                    ['Passport', 'Share of qualified leads that already hold a valid passport at qualification time.'],
                    ['Trend', 'Total qualified per provider per calendar month across all history.'],
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
        </div>

        {/* -- BODY --------------------------------------------------- */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
          {loading && rows.length === 0 && monthlyRows.length === 0 ? (
          <DashboardSkeleton/>
        ) : (
            <>
            {view === 'daily' && (<>
              {/* -- PREMIUM KPI ROW -- */}
              <div className='lq-kpi-grid' style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 14, marginBottom: 18 }}>
                <PremKPI label="Total Qualified" value={fmtN(totals.total)} sub={selMonth}                       delta={totals.totalDelta} accent="#1F3C84" accentBg="#E8EFF9" icon={KPI_ICONS.total} />
                <PremKPI label="Futwork"          value={fmtN(totals.fw)}   sub={pct(totals.fw, totals.total) + ' share'}   delta={totals.fwDelta}    accent="#1F3C84" accentBg="#E8EFF9" icon={KPI_ICONS.agent} />
                <PremKPI label="Futwork AI"       value={fmtN(totals.fwai)} sub={pct(totals.fwai, totals.total) + ' share'} delta={totals.fwaiDelta}  accent="#29B9C3" accentBg="#E4F8F9" icon={KPI_ICONS.ai} />
                <PremKPI label="Superbot"         value={fmtN(totals.sb)}   sub={pct(totals.sb, totals.total) + ' share'}   delta={totals.sbDelta}    accent="#1C9FD4" accentBg="#E3F5FD" icon={KPI_ICONS.bot} />
                <PremKPI label="Top Country"      value={topCountries[0]?.country || '-'} sub={topCountries[0] ? fmtN(topCountries[0].count) + ' qualified' : 'no data'} accent="#4CAE6F" accentBg="#E9F8EF" icon={KPI_ICONS.globe} />
              </div>

              {/* -- ROW 1: SOURCE STACKED BAR + PROVIDER DONUT -- */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16, marginBottom: 16 }}>
                <Card title="Qualified by source" sub="Stacked by provider - selected period">
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={sourceBar} margin={{ top: 4, right: 12, left: -8, bottom: 0 }} barCategoryGap="30%">
                      <defs>
                        <linearGradient id="gFw" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2D4A9E"/><stop offset="100%" stopColor="#1F3C84"/></linearGradient>
                        <linearGradient id="gFwai" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5FCBD2"/><stop offset="100%" stopColor="#29B9C3"/></linearGradient>
                        <linearGradient id="gSb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5BB8DE"/><stop offset="100%" stopColor="#1C9FD4"/></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                      <XAxis dataKey="source" axisLine={false} tickLine={false} interval={0} tick={{ fontSize: 10.5, fill: '#94A3B8', fontFamily: FONT }} />
                      <YAxis tick={{ fontSize: 10, fill: C.muted, fontFamily: FONT }} tickFormatter={v => fmtN(v)} axisLine={false} tickLine={false} />
                      <Tooltip content={<BrandTooltip />} cursor={{ fill: 'rgba(31,60,132,0.04)' }} />
                      <Bar dataKey="Futwork"    stackId="a" fill="url(#gFw)"   radius={[0,0,0,0]} maxBarSize={46} />
                      <Bar dataKey="Futwork AI" stackId="a" fill="url(#gFwai)" radius={[0,0,0,0]} maxBarSize={46} />
                      <Bar dataKey="Superbot"   stackId="a" fill="url(#gSb)"   radius={[7,7,0,0]} maxBarSize={46} />
                    </BarChart>
                  </ResponsiveContainer>
                  <ChartLegend items={[{ name: 'Futwork', color: C.navy }, { name: 'Futwork AI', color: C.cyan }, { name: 'Superbot', color: C.blue }]} />
                </Card>

                <Card title="Provider share" sub="Donut by qualified count">
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 250, position: 'relative' }}>
                    {provPie.length > 0 ? (<>
                      <div style={{ position: 'relative', width: '100%' }}>
                        <ResponsiveContainer width="100%" height={172}>
                          <PieChart>
                            <Pie data={provPie} cx="50%" cy="50%" innerRadius={62} outerRadius={84} dataKey="value" startAngle={90} endAngle={-270} isAnimationActive={true} strokeWidth={0} paddingAngle={2} cornerRadius={4}>
                              {provPie.map((e, i) => <Cell key={i} fill={PROVIDER_COLORS[e.name] || C.muted} />)}
                            </Pie>
                            <Tooltip content={<BrandTooltip />} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', pointerEvents: 'none' }}>
                          <div style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-0.5px', fontFamily: FONT, lineHeight: 1 }}>{fmtN(totals.total)}</div>
                          <div style={{ fontSize: 9.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2, fontFamily: FONT }}>Total</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 14, marginTop: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
                        {provPie.map(p => (
                          <div key={p.name} style={{ textAlign: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                              <div style={{ width: 7, height: 7, borderRadius: 2, background: PROVIDER_COLORS[p.name] }} />
                              <span style={{ fontSize: 10, fontWeight: 600, color: C.sub, fontFamily: FONT }}>{p.name}</span>
                            </div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: C.text, letterSpacing: '-0.3px', fontFamily: FONT }}>{fmtN(p.value)}</div>
                            <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>{pct(p.value, totals.total)}</div>
                          </div>
                        ))}
                      </div>
                    </>) : <div style={{ color: C.muted, fontSize: 13, fontFamily: FONT }}>No data</div>}
                  </div>
                </Card>
              </div>

              {/* -- ROW 2: COUNTRY + DEGREE -- */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <Card title="Top countries interested" sub="By qualified lead count">
                  <RankedBars data={countryBar} labelKey="country" max={countryBar[0]?.count || 0} total={totals.total} showRank />
                </Card>
                <Card title="Degree type" sub="What students want to pursue">
                  <RankedBars data={degreeBar} labelKey="degree" max={degreeBar[0]?.count || 0} total={totals.total} colorFn={i => RAMP[i % RAMP.length]} />
                </Card>
              </div>

              {/* -- ROW 3: DISPOSITION + BUDGET -- */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16, marginBottom: 16 }}>
                <Card title="Call disposition" sub="Outcome classification of qualifying calls">
                  <RankedBars data={dispositionBar} labelKey="disposition" max={dispositionBar[0]?.count || 0} total={totals.total} colorFn={i => [C.green, C.blue, C.navy, C.cyan][i % 4]} />
                </Card>
                <Card title="Budget range" sub="Student budget distribution">
                  {budgetBar.length === 0
                    ? <div style={{ textAlign: 'center', padding: '24px 0', color: C.muted, fontSize: 13, fontFamily: FONT }}>No budget data</div>
                    : (
                      <ResponsiveContainer width="100%" height={264}>
                        <BarChart data={budgetBar} margin={{ top: 8, right: 12, left: 6, bottom: 0 }} barCategoryGap="18%">
                          <defs><linearGradient id="gBudget" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7AC796"/><stop offset="100%" stopColor="#4CAE6F"/></linearGradient></defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                          <XAxis dataKey="budget" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94A3B8', fontFamily: FONT }} />
                          <YAxis tick={{ fontSize: 10, fill: C.muted, fontFamily: FONT }} tickFormatter={v => fmtN(v)} axisLine={false} tickLine={false} />
                          <Tooltip content={<BrandTooltip />} cursor={{ fill: 'rgba(76,174,111,0.06)' }} />
                          <Bar dataKey="count" radius={[6,6,0,0]} maxBarSize={42} fill="url(#gBudget)" />
                        </BarChart>
                      </ResponsiveContainer>
                    )
                  }
                </Card>
              </div>

              {/* -- ROW 4: INTAKE + PASSPORT -- */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16, marginBottom: 16 }}>
                <Card title="Preferred intake" sub="When students plan to start">
                  {intakeBar.length === 0
                    ? <div style={{ textAlign: 'center', padding: '24px 0', color: C.muted, fontSize: 13, fontFamily: FONT }}>No intake data</div>
                    : (
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={intakeBar} margin={{ top: 8, right: 12, left: -8, bottom: 0 }} barCategoryGap="26%">
                          <defs><linearGradient id="gIntake" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5BB8DE"/><stop offset="100%" stopColor="#1C9FD4"/></linearGradient></defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                          <XAxis dataKey="intake" axisLine={false} tickLine={false} tick={{ fontSize: 9.5, fill: '#94A3B8', fontFamily: FONT }} tickFormatter={v => v.length > 11 ? v.slice(0, 10) + '...' : v} />
                          <YAxis tick={{ fontSize: 10, fill: C.muted, fontFamily: FONT }} tickFormatter={v => fmtN(v)} axisLine={false} tickLine={false} />
                          <Tooltip content={<BrandTooltip />} cursor={{ fill: 'rgba(28,159,212,0.06)' }} />
                          <Bar dataKey="count" radius={[6,6,0,0]} maxBarSize={40} fill="url(#gIntake)" />
                        </BarChart>
                      </ResponsiveContainer>
                    )
                  }
                </Card>
                <Card title="Passport status" sub="Valid passport at qualification">
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, position: 'relative' }}>
                    {passportPie.length > 0 ? (<>
                      <div style={{ position: 'relative', width: '100%' }}>
                        <ResponsiveContainer width="100%" height={140}>
                          <PieChart>
                            <Pie data={passportPie} cx="50%" cy="50%" innerRadius={46} outerRadius={62} dataKey="value" startAngle={90} endAngle={-270} isAnimationActive={true} strokeWidth={0} paddingAngle={2} cornerRadius={4}>
                              <Cell fill="#4CAE6F" />
                              <Cell fill="#CBD5E1" />
                            </Pie>
                            <Tooltip content={<BrandTooltip />} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', pointerEvents: 'none' }}>
                          <div style={{ fontSize: 18, fontWeight: 800, color: C.green, fontFamily: FONT, lineHeight: 1 }}>{pct(passportPie[0]?.value || 0, passportPie.reduce((s, x) => s + x.value, 0))}</div>
                          <div style={{ fontSize: 8.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', marginTop: 1, fontFamily: FONT }}>Have it</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 18, marginTop: 4 }}>
                        {passportPie.map((p, i) => (
                          <div key={p.name} style={{ textAlign: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                              <div style={{ width: 7, height: 7, borderRadius: 2, background: i === 0 ? C.green : '#CBD5E1' }} />
                              <span style={{ fontSize: 10, fontWeight: 600, color: C.sub, fontFamily: FONT }}>{p.name}</span>
                            </div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: C.text, fontFamily: FONT }}>{fmtN(p.value)}</div>
                          </div>
                        ))}
                      </div>
                    </>) : <div style={{ color: C.muted, fontSize: 13, fontFamily: FONT }}>No passport data</div>}
                  </div>
                </Card>
              </div>

              {/* -- ROW 5: MoM TREND -- */}
              <div style={{ marginBottom: 16 }}>
                <Card title="Month-on-month trend" sub="Total qualified per provider across all months">
                  <ResponsiveContainer width="100%" height={210}>
                    <LineChart data={trend} margin={{ top: 8, right: 24, left: -8, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1F3C84" stopOpacity={0.12}/><stop offset="100%" stopColor="#1F3C84" stopOpacity={0}/></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 10.5, fill: '#94A3B8', fontFamily: FONT }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: C.muted, fontFamily: FONT }} tickFormatter={v => fmtN(v)} axisLine={false} tickLine={false} />
                      <Tooltip content={<BrandTooltip />} />
                      <Line type="monotone" dataKey="Futwork"    stroke="#1F3C84" strokeWidth={2.5} dot={{ r: 3, fill: '#1F3C84', strokeWidth: 0 }} activeDot={{ r: 5.5, strokeWidth: 2, stroke: '#fff' }} />
                      <Line type="monotone" dataKey="Futwork AI" stroke="#29B9C3" strokeWidth={2.5} dot={{ r: 3, fill: '#29B9C3', strokeWidth: 0 }} activeDot={{ r: 5.5, strokeWidth: 2, stroke: '#fff' }} />
                      <Line type="monotone" dataKey="Superbot"   stroke="#1C9FD4" strokeWidth={2.5} dot={{ r: 3, fill: '#1C9FD4', strokeWidth: 0 }} activeDot={{ r: 5.5, strokeWidth: 2, stroke: '#fff' }} />
                    </LineChart>
                  </ResponsiveContainer>
                  <ChartLegend items={[{ name: 'Futwork', color: C.navy }, { name: 'Futwork AI', color: C.cyan }, { name: 'Superbot', color: C.blue }]} />
                </Card>
              </div>

              {/* -- ROW 6: TOP CAMPAIGNS -- */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ marginBottom: 16 }}>
            <Card title="Day-on-day qualified" sub="Daily qualified leads by provider - most recent first">
              {dayOnDay.length === 0 ? (
                <div style={{ color: C.muted, fontSize: 13, fontFamily: FONT, padding: '8px 0' }}>No daily data for this selection</div>
              ) : (
                <div style={{ overflowX: 'auto', maxHeight: 360, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FONT }}>
                    <thead>
                      <tr style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
                        <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #EEF1F6' }}>Date</th>
                        <th style={{ textAlign: 'right', padding: '8px 10px', fontSize: 10.5, fontWeight: 700, color: '#1F3C84', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #EEF1F6' }}>Futwork</th>
                        <th style={{ textAlign: 'right', padding: '8px 10px', fontSize: 10.5, fontWeight: 700, color: '#29B9C3', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #EEF1F6' }}>Futwork AI</th>
                        <th style={{ textAlign: 'right', padding: '8px 10px', fontSize: 10.5, fontWeight: 700, color: '#1C9FD4', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #EEF1F6' }}>Superbot</th>
                        <th style={{ textAlign: 'right', padding: '8px 10px', fontSize: 10.5, fontWeight: 700, color: C.text, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #EEF1F6' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dayOnDay.map((row, i) => {
                        const dt = new Date(row.date + 'T00:00:00');
                        const lbl = isNaN(dt) ? row.date : dt.getDate() + ' ' + dt.toLocaleString('en-US', { month: 'short' }) + ' - ' + ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dt.getDay()];
                        return (
                          <tr key={row.date} style={{ background: i % 2 ? '#F8FAFC' : '#fff' }}>
                            <td style={{ textAlign: 'left', padding: '8px 10px', fontSize: 12.5, fontWeight: 600, color: C.text, whiteSpace: 'nowrap' }}>{lbl}</td>
                            <td style={{ textAlign: 'right', padding: '8px 10px', fontSize: 12.5, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>{fmtN(row.Futwork)}</td>
                            <td style={{ textAlign: 'right', padding: '8px 10px', fontSize: 12.5, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>{fmtN(row['Futwork AI'])}</td>
                            <td style={{ textAlign: 'right', padding: '8px 10px', fontSize: 12.5, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>{fmtN(row.Superbot)}</td>
                            <td style={{ textAlign: 'right', padding: '8px 10px', fontSize: 12.5, fontWeight: 800, color: '#0F1F4B', fontVariantNumeric: 'tabular-nums' }}>{fmtN(row.total)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          <Card title="Top campaigns by qualified leads" sub="Selected period - coloured by provider">
                  {topCampaigns.length === 0
                    ? <div style={{ textAlign: 'center', padding: '32px 0', color: C.muted, fontSize: 13, fontFamily: FONT }}>No data for selected filters</div>
                    : (<>
                      <ResponsiveContainer width="100%" height={Math.max(220, topCampaigns.length * 34)}>
                        <BarChart data={topCampaigns} layout="vertical" margin={{ top: 4, right: 56, left: 8, bottom: 4 }} barCategoryGap="22%">
                          <XAxis type="number" tick={{ fontSize: 10, fill: C.muted, fontFamily: FONT }} tickFormatter={v => fmtN(v)} axisLine={false} tickLine={false} />
                          <YAxis type="category" dataKey="campaign" tick={{ fontSize: 10.5, fill: C.sub, fontFamily: FONT }} width={248} axisLine={false} tickLine={false} tickFormatter={v => v.length > 36 ? v.slice(0, 34) + '...' : v} />
                          <Tooltip content={<BrandTooltip />} cursor={{ fill: 'rgba(31,60,132,0.04)' }} />
                          <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={22}>
                            {topCampaigns.map((e, i) => <Cell key={i} fill={PROVIDER_COLORS[e.provider] || C.muted} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                      <ChartLegend items={Object.entries(PROVIDER_COLORS).map(([n, c]) => ({ name: n, color: c }))} />
                    </>)
                  }
                </Card>
              </div>

              {/* -- ROW 7: LEAD RECORDS TABLE -- */}
              <Card
                title="Lead records"
                sub={`${tableRows.length.toLocaleString()} leads - ${selMonth}${selProvider !== 'All' ? ' - ' + selProvider : ''}${selSource !== 'All' ? ' - ' + selSource : ''}`}
                action={
                  <div style={{ position: 'relative' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                    </svg>
                    <input value={search} onChange={e => onSearch(e.target.value)} placeholder="Search campaign, source, country..."
                      style={{ paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7, borderRadius: 8, border: `0.5px solid ${C.border}`, fontSize: 12, fontFamily: FONT, outline: 'none', width: 250, color: C.text, background: 'var(--card)' }} />
                  </div>
                }
                noPad
              >
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#F8FAFC' }}>
                        {[['campaign','Campaign'],['provider','Provider'],['source','Source'],['country','Country'],['degree_type','Degree'],['disposition','Disposition'],['budget','Budget'],['preferred_intake','Intake']].map(([col, lbl]) => (
                          <th key={col} style={thS(col)} onClick={() => sortBy(col)}>
                            {lbl} <span style={{ opacity: sortCol === col ? 1 : 0.3, fontSize: 9 }}>{sortCol === col ? (sortDir === 'desc' ? 'v' : '^') : '^v'}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((r, i) => (
                        <tr key={i} style={{ borderBottom: `0.5px solid #F3F4F6`, background: i % 2 ? '#FAFBFC' : 'var(--card)', transition: 'background .1s' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#F0F7FF'}
                          onMouseLeave={e => e.currentTarget.style.background = i % 2 ? '#FAFBFC' : 'var(--card)'}>
                          <td style={{ padding: '9px 12px', color: C.text, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: FONT, fontWeight: 500 }} title={r.campaign}>{r.campaign || '-'}</td>
                          <td style={{ padding: '9px 12px', fontFamily: FONT }}>
                            <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
                              background: r.provider === 'Futwork' ? C.navyBg : r.provider === 'Futwork AI' ? C.cyanBg : C.blueBg,
                              color: r.provider === 'Futwork' ? C.navy : r.provider === 'Futwork AI' ? C.cyan : C.blue,
                            }}>{r.provider}</span>
                          </td>
                          <td style={{ padding: '9px 12px', color: C.sub, fontFamily: FONT, whiteSpace: 'nowrap' }}>{r.source || '-'}</td>
                          <td style={{ padding: '9px 12px', color: C.text, fontFamily: FONT, whiteSpace: 'nowrap' }}>
                            {r.country ? <span style={{ fontSize: 11.5, fontWeight: 600 }}>{r.country.replace(/ *\(.*\)/, '').trim()}</span> : '-'}
                          </td>
                          <td style={{ padding: '9px 12px', color: C.sub, fontSize: 11, fontFamily: FONT, whiteSpace: 'nowrap' }}>{r.degree_type || '-'}</td>
                          <td style={{ padding: '9px 12px', color: C.muted, fontSize: 11, fontFamily: FONT, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.disposition}>{r.disposition || '-'}</td>
                          <td style={{ padding: '9px 12px', fontFamily: FONT }}>
                            {r.budget ? <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: C.greenBg, color: C.green }}>{r.budget}</span> : '-'}
                          </td>
                          <td style={{ padding: '9px 12px', color: C.muted, fontSize: 11, fontFamily: FONT, whiteSpace: 'nowrap' }}>{r.preferred_intake || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {totalPages > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 12px 12px', borderTop: `0.5px solid ${C.border}` }}>
                      <span style={{ fontSize: 11.5, color: C.muted, fontFamily: FONT }}>
                        {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, tableRows.length)} of {tableRows.length.toLocaleString()} rows
                      </span>
                      <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                        <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                          style={{ padding: '5px 13px', borderRadius: 8, border: `0.5px solid ${C.border}`, background: 'var(--card)', fontSize: 12, fontWeight: 600, fontFamily: FONT, cursor: page === 0 ? 'not-allowed' : 'pointer', opacity: page === 0 ? 0.35 : 1, color: C.text }}>
                          {'<-'} Prev
                        </button>
                        {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                          const start = Math.max(0, Math.min(page - 3, totalPages - 7)); const p = start + i
                          return (
                            <button key={p} onClick={() => setPage(p)}
                              style={{ width: 32, height: 32, borderRadius: 8, border: p === page ? 'none' : '1px solid #E8ECF3', background: p === page ? 'linear-gradient(135deg, #1F3C84, #1C9FD4)' : '#fff', color: p === page ? '#fff' : '#475569', fontSize: 12, fontWeight: p === page ? 700 : 500, fontFamily: FONT, cursor: 'pointer', boxShadow: p === page ? '0 4px 10px -3px rgba(31,60,132,0.5)' : 'none', transition: 'all .15s' }}>
                              {p + 1}
                            </button>
                          )
                        })}
                        <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
                          style={{ padding: '5px 13px', borderRadius: 8, border: `0.5px solid ${C.border}`, background: 'var(--card)', fontSize: 12, fontWeight: 600, fontFamily: FONT, cursor: page === totalPages - 1 ? 'not-allowed' : 'pointer', opacity: page === totalPages - 1 ? 0.35 : 1, color: C.text }}>
                          Next {'->'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            </>)}
            {view === 'monthly' && (<>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 14, marginBottom: 14 }}>
                <PremKPI label="Total Opp Count" value={fmtN(monthlyTotals.opp_count)} sub={monthlyScopeLabel} accent="#1F3C84" accentBg="#E8EFF9" icon={KPI_ICONS.total} />
                <PremKPI label="Floor Queued" value={fmtN(monthlyTotals.floor_queued)} sub={monthlyScopeLabel} accent="#1C9FD4" accentBg="#E3F4FB" icon={KPI_ICONS.total} />
                <PremKPI label="Futwork Queued" value={fmtN(monthlyTotals.futwork_queued)} sub={monthlyScopeLabel} accent="#1F3C84" accentBg="#E8EFF9" icon={KPI_ICONS.agent} />
                <PremKPI label="Superbot Queued" value={fmtN(monthlyTotals.superbot_queued)} sub={monthlyScopeLabel} accent="#29B9C3" accentBg="#E4F7F8" icon={KPI_ICONS.bot} />
                <PremKPI label="Futwork AI Queued" value={fmtN(monthlyTotals.futwork_ai_queued)} sub={monthlyScopeLabel} accent="#4CAE6F" accentBg="#E8F6EE" icon={KPI_ICONS.ai} />
                <PremKPI label="Futwork Qualified" value={fmtN(monthlyTotals.futwork_qualified)} sub={monthlyScopeLabel} accent="#1F3C84" accentBg="#E8EFF9" icon={KPI_ICONS.agent} />
                <PremKPI label="Superbot Qualified" value={fmtN(monthlyTotals.superbot_qualified)} sub={monthlyScopeLabel} accent="#29B9C3" accentBg="#E4F7F8" icon={KPI_ICONS.bot} />
                <PremKPI label="Futwork AI Qualified" value={fmtN(monthlyTotals.futwork_ai_qualified)} sub={monthlyScopeLabel} accent="#4CAE6F" accentBg="#E8F6EE" icon={KPI_ICONS.ai} />
              </div>
              <Card title="Source performance: volume vs. conversion" sub={monthlyScopeLabel + ' -- qualified volume and queued-to-QL conversion by source'} style={{ marginBottom: 14 }}>
                {(() => {
                  const totalQual = monthlyBySource.reduce((s, x) => s + x.qualified, 0) || 1
                  const chartData = monthlyBySource.filter(s => s.qualified > 0 || s.queued > 0).slice(0, 12).map(s => ({ source: s.source, qualified: s.qualified, queued: s.queued, share: totalQual > 0 ? (s.qualified / totalQual) * 100 : 0, conv: s.queued > 0 ? (s.qualified / s.queued) * 100 : null }))
                  const convColor = (c) => c == null ? C.muted : c >= 50 ? C.green : c >= 25 ? C.cyan : c >= 10 ? C.blue : C.navy
                  const ChartTooltip = ({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null
                    const d = payload[0].payload
                    return (
                      <div style={{ background: '#fff', border: '1px solid #E3E9F5', borderRadius: 8, padding: '8px 11px', fontFamily: FONT, boxShadow: '0 4px 16px rgba(31,60,132,0.12)' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.navy, marginBottom: 3 }}>{d.source}</div>
                        <div style={{ fontSize: 11, color: C.text }}>Qualified: <b>{fmtN(d.qualified)}</b> ({d.share.toFixed(1)}%)</div>
                        <div style={{ fontSize: 11, color: C.muted }}>Queued: {fmtN(d.queued)}</div>
                        <div style={{ fontSize: 11, color: convColor(d.conv), fontWeight: 700 }}>Conversion: {d.conv == null ? '--' : d.conv.toFixed(1) + '%'}</div>
                      </div>
                    )
                  }
                return (
                  <div style={{ padding: '4px 2px', fontFamily: FONT }}>
                      <div style={{ width: '100%', height: Math.max(260, chartData.length * 34 + 60) }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 54, left: 8, bottom: 8 }} barCategoryGap={'28%'}>
                            <CartesianGrid horizontal={false} stroke="#EEF2FB" />
                            <XAxis type="number" tick={{ fontSize: 11, fill: C.muted }} axisLine={{ stroke: '#E3E9F5' }} tickLine={false} tickFormatter={fmtN} />
                            <YAxis type="category" dataKey="source" width={118} tick={{ fontSize: 11.5, fill: C.navy }} axisLine={false} tickLine={false} />
                            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(31,60,132,0.05)' }} />
                            <Bar dataKey="qualified" radius={[0, 5, 5, 0]} maxBarSize={26} label={{ position: 'right', fontSize: 11, fontWeight: 700, fill: C.navy, formatter: fmtN }}>
                              {chartData.map((d, i) => (<Cell key={i} fill={convColor(d.conv)} />))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', fontSize: 10.5, color: C.muted, marginTop: 6, padding: '8px 2px 0', borderTop: '1px solid #EEF2FB' }}>
                        <span>Bar length = qualified volume. Bar color = queued-to-QL conversion:</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: C.green }} />50%+</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: C.cyan }} />25-50%</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: C.blue }} />10-25%</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: C.navy }} />&lt;10%</span>
                      </div>
                    </div>
                  )
                })()}
              </Card>
              <Card title="Day-on-day breakdown" sub={`${mDateWindow.label}${selPeriod === 'all' ? '' : ' · ' + selPeriod}${selMonthlySource === 'All' ? '' : ' · ' + selMonthlySource} · newest first`} action={<MTableExportBtn onClick={() => downloadCSV(dayExportRows, `ql_ops_day_on_day_${new Date().toISOString().slice(0,10)}.csv`)} disabled={!dayExportRows.length} C={C} FONT={FONT} />}>
                <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 336, position: 'relative' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FONT, fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: C.muted, textTransform: 'uppercase', fontSize: 10.5, letterSpacing: '0.06em', borderBottom: `1.5px solid ${C.border}` }}>
                        <th style={{ padding: '10px 12px', position: 'sticky', left: 0, top: 0, background: 'var(--card)', whiteSpace: 'nowrap', zIndex: 3 }}>Date</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--card)', zIndex: 2 }}>Total Opp Count</th>
                            <th style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--card)', zIndex: 2 }}>Total QL</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--card)', zIndex: 2 }}>Floor Queued</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--card)', zIndex: 2 }}>Futwork Queued</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--card)', zIndex: 2 }}>Futwork Qualified</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--card)', zIndex: 2 }}>Futwork AI Queued</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--card)', zIndex: 2 }}>Futwork AI Qualified</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--card)', zIndex: 2 }}>Superbot Queued</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--card)', zIndex: 2 }}>Superbot Qualified</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--card)', zIndex: 2 }}>Queued -> QL %</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--card)', zIndex: 2 }}>Futwork Q -> QL %</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--card)', zIndex: 2 }}>Futwork AI Q -> QL %</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--card)', zIndex: 2 }}>Superbot Q -> QL %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyByDate.map((row, i) => (
                        <tr key={i} style={{ borderBottom: `0.5px solid ${C.border}`, background: i % 2 ? '#FAFBFD' : 'transparent' }}>
                          <td style={{ padding: '9px 12px', fontWeight: 700, color: C.navy, position: 'sticky', left: 0, background: i % 2 ? '#FAFBFD' : 'var(--card)', whiteSpace: 'nowrap' }}>{row.date}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'center', color: '#374151' }}>{fmtN(row.opp_count)}</td>
                            <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 700, color: C.navy }}>{fmtN(row.futwork_qualified + row.superbot_qualified + row.futwork_ai_qualified)}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'center', color: '#374151' }}>{fmtN(row.floor_queued)}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'center', color: '#374151' }}>{fmtN(row.futwork_queued)}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'center', color: '#374151' }}>{fmtN(row.futwork_qualified)}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'center', color: '#374151' }}>{fmtN(row.futwork_ai_queued)}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'center', color: '#374151' }}>{fmtN(row.futwork_ai_qualified)}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'center', color: '#374151' }}>{fmtN(row.superbot_queued)}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'center', color: '#374151' }}>{fmtN(row.superbot_qualified)}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 600, color: heatColor(pctN(row.futwork_qualified + row.superbot_qualified + row.futwork_ai_qualified, row.floor_queued)), background: heatBg(pctN(row.futwork_qualified + row.superbot_qualified + row.futwork_ai_qualified, row.floor_queued)) }}>{pct(row.futwork_qualified + row.superbot_qualified + row.futwork_ai_qualified, row.floor_queued)}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'center', color: heatColor(pctN(row.futwork_qualified, row.futwork_queued)), background: heatBg(pctN(row.futwork_qualified, row.futwork_queued)) }}>{pct(row.futwork_qualified, row.futwork_queued)}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'center', color: heatColor(pctN(row.futwork_ai_qualified, row.futwork_ai_queued)), background: heatBg(pctN(row.futwork_ai_qualified, row.futwork_ai_queued)) }}>{pct(row.futwork_ai_qualified, row.futwork_ai_queued)}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'center', color: heatColor(pctN(row.superbot_qualified, row.superbot_queued)), background: heatBg(pctN(row.superbot_qualified, row.superbot_queued)) }}>{pct(row.superbot_qualified, row.superbot_queued)}</td>
                        </tr>
                      ))}
                      {monthlyByDate.length === 0 && (
                        <tr><td colSpan={14} style={{ padding: 16, color: C.muted, fontFamily: FONT, fontSize: 13 }}>No daily data for this selection.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
              <div style={{ height: 14 }} />
              <Card title="Monthly breakdown" sub={selMonthlySource === 'All' ? 'All months - summed across sources' : 'All months - ' + selMonthlySource} action={<MTableExportBtn onClick={() => downloadCSV(monthExportRows, `ql_ops_month_on_month_${new Date().toISOString().slice(0,10)}.csv`)} disabled={!monthExportRows.length} C={C} FONT={FONT} />}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FONT, fontSize: 12.5 }}>
                      <thead>
                        <tr style={{ textAlign: 'left', color: C.muted, textTransform: 'uppercase', fontSize: 10.5, letterSpacing: '0.06em', borderBottom: `1.5px solid ${C.border}` }}>
                          <th style={{ padding: '10px 12px', position: 'sticky', left: 0, background: 'var(--card)', whiteSpace: 'nowrap' }}>Period</th>
                          <th style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>Total Opp Count</th>
                            <th style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>Total QL</th>
                          <th style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>Floor Queued</th>
                          <th style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>Futwork Queued</th>
                          <th style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>Futwork Qualified</th>
                          <th style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>Futwork AI Queued</th>
                          <th style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>Futwork AI Qualified</th>
                          <th style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>Superbot Queued</th>
                          <th style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>Superbot Qualified</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>Queued -> QL %</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>Futwork Q -> QL %</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>Futwork AI Q -> QL %</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>Superbot Q -> QL %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthlyByPeriodScoped.map((row, i) => (
                          <tr key={i} style={{ borderBottom: `0.5px solid ${C.border}`, background: i % 2 ? '#FAFBFD' : 'transparent' }}>
                            <td style={{ padding: '9px 12px', fontWeight: 700, color: C.navy, position: 'sticky', left: 0, background: i % 2 ? '#FAFBFD' : 'var(--card)', whiteSpace: 'nowrap' }}>{row.period}</td>
                            <td style={{ padding: '9px 12px', textAlign: 'center', color: '#374151' }}>{fmtN(row.opp_count)}</td>
                            <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 700, color: C.navy }}>{fmtN(row.futwork_qualified + row.superbot_qualified + row.futwork_ai_qualified)}</td>
                            <td style={{ padding: '9px 12px', textAlign: 'center', color: '#374151' }}>{fmtN(row.floor_queued)}</td>
                            <td style={{ padding: '9px 12px', textAlign: 'center', color: '#374151' }}>{fmtN(row.futwork_queued)}</td>
                            <td style={{ padding: '9px 12px', textAlign: 'center', color: '#374151' }}>{fmtN(row.futwork_qualified)}</td>
                            <td style={{ padding: '9px 12px', textAlign: 'center', color: '#374151' }}>{fmtN(row.futwork_ai_queued)}</td>
                            <td style={{ padding: '9px 12px', textAlign: 'center', color: '#374151' }}>{fmtN(row.futwork_ai_qualified)}</td>
                            <td style={{ padding: '9px 12px', textAlign: 'center', color: '#374151' }}>{fmtN(row.superbot_queued)}</td>
                            <td style={{ padding: '9px 12px', textAlign: 'center', color: '#374151' }}>{fmtN(row.superbot_qualified)}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 600, color: heatColor(pctN(row.futwork_qualified + row.superbot_qualified + row.futwork_ai_qualified, row.floor_queued)), background: heatBg(pctN(row.futwork_qualified + row.superbot_qualified + row.futwork_ai_qualified, row.floor_queued)) }}>{pct(row.futwork_qualified + row.superbot_qualified + row.futwork_ai_qualified, row.floor_queued)}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'center', color: heatColor(pctN(row.futwork_qualified, row.futwork_queued)), background: heatBg(pctN(row.futwork_qualified, row.futwork_queued)) }}>{pct(row.futwork_qualified, row.futwork_queued)}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'center', color: heatColor(pctN(row.futwork_ai_qualified, row.futwork_ai_queued)), background: heatBg(pctN(row.futwork_ai_qualified, row.futwork_ai_queued)) }}>{pct(row.futwork_ai_qualified, row.futwork_ai_queued)}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'center', color: heatColor(pctN(row.superbot_qualified, row.superbot_queued)), background: heatBg(pctN(row.superbot_qualified, row.superbot_queued)) }}>{pct(row.superbot_qualified, row.superbot_queued)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
            </>)}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
