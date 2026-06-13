import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, Cell, PieChart, Pie
} from 'recharts'
import Sidebar from '../components/Sidebar'
import ExportButton from '../components/ExportButton'
import { fetchCSV } from '../lib/sheetCache'

const SHEET_CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRVF7R3Me4QPVaRS_n_OufcMrrgYvCt3Rs7yJUG0u4gEMd0cVL9IyP2aV6J8HDjOZrvWzcemgHwZaHs/pub?gid=0&single=true&output=csv'

const C = {
  navy:'#1F3C84', blue:'#1C9FD4', cyan:'#29B9C3', green:'#4CAE6F',
  amber:'#F59E0B', navyBg:'#E8EFF9', blueBg:'#E3F5FD', cyanBg:'#E4F8F9', greenBg:'#E9F8EF',
  border:'var(--card-border)', text:'var(--text)', muted:'var(--text3)', sub:'var(--text2)', bg:'var(--bg)',
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
    qualified_date: r[h('qualified_date')] || r[h('month_start')] || '',
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
    background: 'var(--card)', border: `0.5px solid ${C.border}`, borderRadius: 12,
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
    background: 'var(--card)', border: `0.5px solid ${C.border}`, borderRadius: 14,
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

/* Custom production-grade dropdown — replaces all native <select> */
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


/* ── Production date picker ─────────────────────────────────────────── */
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
        <button onClick={() => { setSelFrom(null); setSelTo(null); setStep('from') }}
          style={{ padding: '6px 12px', borderRadius: 8, border: `0.5px solid ${C.border}`, background: 'var(--card)', fontSize: 11.5, fontWeight: 600, fontFamily: FONT, cursor: 'pointer', color: C.sub }}>
          Clear
        </button>
        <button onClick={() => canApply && onChange(fmt(selFrom), fmt(selTo))}
          disabled={!canApply}
          style={{
            padding: '7px 18px', borderRadius: 8, border: 'none', cursor: canApply?'pointer':'not-allowed',
            background: canApply ? C.navy : 'var(--card-border)', color: canApply?'var(--card)':C.muted,
            fontSize: 12, fontWeight: 700, fontFamily: FONT, transition: 'all .15s',
          }}>
          Apply range
        </button>
      </div>
    </div>
  )
}
const ExportMenu = ({ exportData, exportView, setExportView, C, FONT }) => {
  const [open, setOpen] = React.useState(false)
  const views = [
    { key:'day',      label:'Day on day',     desc:'One row per date · provider · campaign' },
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
      <button onClick={() => setOpen(v => !v)}
        style={{
          display:'flex', alignItems:'center', gap:6, padding:'6px 13px',
          borderRadius:8, background:'var(--card)',
          border:`0.5px solid ${open ? C.navy : C.border}`,
          color: open ? C.navy : '#374151', fontSize:12, fontWeight:600,
          cursor:'pointer', fontFamily:FONT,
          boxShadow: open ? `0 0 0 3px rgba(31,60,132,0.08)` : 'none',
          transition:'all .15s',
        }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Export
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          style={{transition:'transform .2s', transform: open?'rotate(180deg)':'rotate(0deg)'}}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
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
              {[['CSV','csv',C.navy],['JSON','json',C.blue]].map(([lbl,type,hc])=>(
                <button key={type} onClick={()=>download(type)}
                  style={{
                    flex:1, padding:'7px 10px', borderRadius:8, border:`0.5px solid ${C.border}`,
                    background:'var(--card)', cursor:'pointer', fontFamily:FONT,
                    fontSize:12, fontWeight:600, color:C.text,
                    display:'flex', alignItems:'center', justifyContent:'center', gap:5,
                    transition:'all .12s',
                  }}
                  onMouseOver={e=>{e.currentTarget.style.borderColor=hc;e.currentTarget.style.color=hc}}
                  onMouseOut={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.text}}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  {lbl}
                </button>
              ))}
            </div>
            <div style={{fontSize:10,color:C.muted,textAlign:'center',padding:'4px 0 2px'}}>
              {(exportData||[]).length.toLocaleString()} rows · respects active filters
            </div>
          </div>
        </>
      )}
    </div>
  )
}


/* ── Main dashboard ─────────────────────────────────────────────────── */

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
  const [datePreset, setDatePreset]   = useState('month') // 'LD','L7D','MTD','custom','month'
  const [customFrom, setCustomFrom]   = useState('')
  const [customTo, setCustomTo]       = useState('')
  const [showCustom, setShowCustom]   = useState(false)
  const [hoveredPreset, setHoveredPreset] = useState(null)
  const [exportView, setExportView]         = useState('day')
  const [monthStartMap, setMonthStartMap] = useState({})

  const loadData = useCallback(async (bust = false) => {
    setLoading(true)
    const t0 = Date.now()
    try {
      const url = bust ? SHEET_CSV + '&_=' + Date.now() : SHEET_CSV
      const res = await fetch(url)
      const csv = await res.text()
      const parsed = parseCSV(csv)
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
      setSelMonth(prev => prev || ms[ms.length - 1] || '')
      setLastSync(new Date())
    } catch (e) { console.error('QL fetch', e) }
    finally { setTimeout(() => setLoading(false), Math.max(0, 750 - (Date.now() - t0))) }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Is the selected month the current calendar month?
  const isCurrentMonth = useMemo(() => {
    const ms = monthStartMap[selMonth]
    if (!ms) return false
    const d = new Date(ms)
    const now = new Date()
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  }, [selMonth, monthStartMap])

  // Single active filter — what's currently driving the data
  // 'preset' = LD/L7D/MTD, 'month' = month picker, 'custom' = calendar range
  const activeFilter = datePreset === 'custom' ? 'custom'
    : (datePreset === 'month') ? 'month'
    : 'preset'

  // ── Derived data (correct dependency order) ─────────────────────────────

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
      return { from: cf, to: ct, label: customFrom + ' → ' + customTo }
    }
    return null // 'month' mode — handled below
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

  // 4. Apply provider + source dropdowns
  const filtered = useMemo(() => dateFilteredRows.filter(r =>
    (selProvider === 'All' || r.provider === selProvider) &&
    (selSource === 'All' || r.source === selSource)
  ), [dateFilteredRows, selProvider, selSource])

  // 5. KPI totals — use filtered so provider/source dropdowns affect the cards
  const totals = useMemo(() => {
    const fw = filtered.filter(r => r.provider === 'Futwork').reduce((s, r) => s + r.count, 0)
    const sb = filtered.filter(r => r.provider === 'Superbot').reduce((s, r) => s + r.count, 0)
    const total = fw + sb
    // MoM delta: compare filtered selection against same provider/source in previous month
    const prevM    = months[months.indexOf(selMonth) - 1]
    const prevBase = prevM ? rows.filter(r => r.month === prevM
      && (selProvider === 'All' || r.provider === selProvider)
      && (selSource   === 'All' || r.source   === selSource)
    ) : []
    const prevFw  = prevBase.filter(r => r.provider === 'Futwork').reduce((s, r) => s + r.count, 0)
    const prevSb  = prevBase.filter(r => r.provider === 'Superbot').reduce((s, r) => s + r.count, 0)
    const prevTot = prevFw + prevSb
    return {
      fw, sb, total,
      totalDelta: prevTot > 0 ? ((total - prevTot)  / prevTot * 100) : null,
      fwDelta:    prevFw  > 0 ? ((fw    - prevFw)   / prevFw  * 100) : null,
      sbDelta:    prevSb  > 0 ? ((sb    - prevSb)   / prevSb  * 100) : null,
    }
  }, [filtered, rows, months, selMonth, selProvider, selSource])


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

  // Export datasets — all respect active filters (date + provider + source)
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
    fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: '0.07em',
    textTransform: 'uppercase', padding: '10px 12px', cursor: 'pointer',
    userSelect: 'none', fontFamily: FONT, whiteSpace: 'nowrap',
    background: sortCol === col ? 'var(--navy-tint)' : 'transparent',
    borderBottom: `0.5px solid ${C.border}`,
  })

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.bg, fontFamily: FONT }}>
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}.lqTr:nth-child(even){background:#FAFBFC!important}.lqTr:hover{background:#F0F4FF!important;cursor:pointer}`}</style>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* ── HEADER ───────────────────────────────────────────────── */}
        <div style={{
          background: 'var(--card)', borderBottom: `0.5px solid ${C.border}`,
          padding: '0 28px', height: 56, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 12, flexShrink: 0,
        }}>
          <div>
            <p style={{ fontSize: 10.5, color: C.muted, margin: 0, letterSpacing: '0.05em', textTransform: 'uppercase', fontFamily: FONT }}>Dashboards / QL Ops</p>
            <h1 style={{ fontSize: 17, fontWeight: 800, color: C.text, margin: '2px 0 0', letterSpacing: '-0.4px', fontFamily: FONT }}>
              Lead Qualification
              {' · '}
              {activeFilter === 'custom' && customFrom
                ? <span style={{fontSize:13,fontWeight:600,color:C.blue}}>{customFrom} → {customTo}</span>
                : activeFilter === 'preset' && dateWindow
                  ? <span style={{fontSize:13,fontWeight:600,color:C.blue}}>{dateWindow.label}</span>
                  : <span>{selMonth || '—'}</span>
              }
            </h1>
          </div>
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
                const tipLabel = fmtShort(tipFrom) + ' – ' + fmtShort(tipTo)
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
                        background: activeFilter==='custom' ? 'transparent' : datePreset === key ? 'var(--card)' : 'transparent',
                        color: activeFilter==='custom' ? '#CBD5E1' : datePreset === key ? C.navy : C.muted,
                        boxShadow: activeFilter==='custom' ? 'none' : datePreset === key ? '0 1px 4px rgba(15,23,42,0.10)' : 'none',
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
                  // Month picker always wins — clear any preset or custom range
                  setDatePreset('month')
                  setCustomFrom(''); setCustomTo('')
                  setShowCustom(false); setPage(0)
                }}
              />
              </div>
            )}
            {/* Custom range — production calendar picker */}
            <div style={{ position: 'relative' }}>
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
                {datePreset==='custom'&&customFrom ? customFrom+' → '+customTo : 'Custom'}
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
            </div>
            <Dropdown label="Provider" options={providers} value={selProvider} minWidth={100} onChange={v => { setSelProvider(v); setPage(0) }} />
            <Dropdown label="Source" options={sources} value={selSource} minWidth={100} onChange={v => { setSelSource(v); setPage(0) }} />
            {lastSync && <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>Synced {lastSync.toLocaleTimeString()}</span>}
            <button onClick={() => loadData(true)} disabled={loading} className="lqRefreshBtn"
              style={{
                padding: '6px 14px', borderRadius: 8, border: `0.5px solid ${C.border}`,
                fontSize: 12, fontWeight: 500, cursor: loading ? 'wait' : 'pointer',
                fontFamily: FONT, background: 'var(--card)', color: '#374151',
                display: 'flex', alignItems: 'center', gap: 6, opacity: loading ? 0.65 : 1,
              }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                style={{ animation: loading ? 'spin .8s linear infinite' : 'none' }}>
                <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              {loading ? 'Refreshing' : 'Refresh'}
            </button>

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
            <div style={{ animation:'fadeUp .3s ease' }}>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:20 }}>
                {[C.navy,C.blue,C.cyan,C.green].map((c,ci)=>(
                  <div key={c} style={{ background:'#fff', border:'0.5px solid #E5E7EB', borderRadius:14, padding:'18px 20px', borderTop:`3px solid ${c}`, boxShadow:'0 1px 4px rgba(15,23,42,0.04)' }}>
                    {[[60,9,10],[75,26,8],[50,13,0]].map(([w,h,mb],j)=>(
                      <div key={j} style={{ width:`${w}%`, height:h, borderRadius:6, marginBottom:mb, background:'linear-gradient(90deg,#F0F2F5 25%,#E8EBF0 50%,#F0F2F5 75%)', backgroundSize:'200% 100%', animation:`shimmer 1.4s ease ${(ci*3+j)*0.06}s infinite` }}/>
                    ))}
                  </div>
                ))}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1.5fr 1fr', gap:14, marginBottom:14 }}>
                {[260,260].map((h,ci)=>(
                  <div key={ci} style={{ background:'#fff', border:'0.5px solid #E5E7EB', borderRadius:14, padding:'16px 20px' }}>
                    <div style={{ width:'45%', height:13, borderRadius:6, marginBottom:8, background:'linear-gradient(90deg,#F0F2F5 25%,#E8EBF0 50%,#F0F2F5 75%)', backgroundSize:'200% 100%', animation:'shimmer 1.4s ease infinite' }}/>
                    <div style={{ width:'60%', height:11, borderRadius:6, marginBottom:16, background:'linear-gradient(90deg,#F0F2F5 25%,#E8EBF0 50%,#F0F2F5 75%)', backgroundSize:'200% 100%', animation:'shimmer 1.4s ease .05s infinite' }}/>
                    <div style={{ display:'flex', alignItems:'flex-end', gap:6, height:h }}>
                      {[55,70,45,85,60,90,40,75,55,80,50,65].map((p,j)=>(
                        <div key={j} style={{ flex:1, height:`${p}%`, borderRadius:'4px 4px 0 0', background:'linear-gradient(90deg,#F0F2F5 25%,#E8EBF0 50%,#F0F2F5 75%)', backgroundSize:'200% 100%', animation:`shimmer 1.4s ease ${j*0.06}s infinite` }}/>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
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
                       tick={{fontSize:10.5,fill:"#94A3B8",fontFamily:"'Plus Jakarta Sans',sans-serif"}} axisLine={false} tickLine={false}/>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false}/>
                      <YAxis
                        tick={{ fontSize: 10, fill: C.muted, fontFamily: FONT }}
                        tickFormatter={v => fmtN(v)}
                        axisLine={false} tickLine={false}
                      />
                      <Tooltip content={<BrandTooltip/>} cursor={{ fill: 'var(--bg3)' }} />
                      <Bar dataKey="Futwork"  stackId="a" fill={C.navy} radius={[6,6,0,0]} maxBarSize={52} />
                      <Bar dataKey="Superbot" stackId="a" fill={C.blue} radius={[6,6,0,0]} maxBarSize={52} />
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
                            <Tooltip content={<BrandTooltip/>} />
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
                      <XAxis dataKey="month" tick={{ fontSize: 10.5, fill: C.muted, fontFamily: FONT }} axisLine={false} tickLine={false}  tick={{fontSize:10.5,fill:"#94A3B8",fontFamily:"'Plus Jakarta Sans',sans-serif"}} axisLine={false} tickLine={false}/>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false}/>
                      <YAxis tick={{ fontSize: 10, fill: C.muted, fontFamily: FONT }} tickFormatter={v => fmtN(v)} axisLine={false} tickLine={false} />
                      <Tooltip content={<BrandTooltip/>} />
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
                            <Tooltip content={<BrandTooltip/>} cursor={{ fill: 'var(--bg3)' }} />
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
                        <tr key={i} style={{ borderBottom: `0.5px solid #F3F4F6`, background: i % 2 ? '#FAFBFC' : 'var(--card)', transition: 'background .1s' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#F0F7FF'}
                          onMouseLeave={e => e.currentTarget.style.background = i % 2 ? '#FAFBFC' : 'var(--card)'}>
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
                          style={{ padding: '5px 13px', borderRadius: 8, border: `0.5px solid ${C.border}`, background: 'var(--card)', fontSize: 12, fontWeight: 600, fontFamily: FONT, cursor: page === 0 ? 'not-allowed' : 'pointer', opacity: page === 0 ? 0.35 : 1, color: C.text }}>
                          ← Prev
                        </button>
                        {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                          const start = Math.max(0, Math.min(page - 3, totalPages - 7)); const p = start + i
                          return (
                            <button key={p} onClick={() => setPage(p)}
                              style={{
                                width: 32, height: 32, borderRadius: 8,
                                border: `0.5px solid ${p === page ? C.navy : C.border}`,
                                background: p === page ? C.navy : 'var(--card)',
                                color: p === page ? 'var(--card)' : C.text,
                                fontSize: 12, fontWeight: p === page ? 700 : 400,
                                fontFamily: FONT, cursor: 'pointer',
                              }}>{p + 1}</button>
                          )
                        })}
                        <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
                          style={{ padding: '5px 13px', borderRadius: 8, border: `0.5px solid ${C.border}`, background: 'var(--card)', fontSize: 12, fontWeight: 600, fontFamily: FONT, cursor: page === totalPages - 1 ? 'not-allowed' : 'pointer', opacity: page === totalPages - 1 ? 0.35 : 1, color: C.text }}>
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