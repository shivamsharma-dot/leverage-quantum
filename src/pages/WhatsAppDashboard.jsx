import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as ReTooltip, ResponsiveContainer,
  LineChart, Line, Cell, PieChart, Pie, FunnelChart, Funnel, LabelList, CartesianGrid} from 'recharts'
import Sidebar from '../components/Sidebar'
import { fetchCSV } from '../lib/sheetCache'

const SHEET_CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRVF7R3Me4QPVaRS_n_OufcMrrgYvCt3Rs7yJUG0u4gEMd0cVL9IyP2aV6J8HDjOZrvWzcemgHwZaHs/pub?gid=1222628502&single=true&output=csv'

const C = {
  navy:'#1F3C84', blue:'#1C9FD4', cyan:'#29B9C3', green:'#4CAE6F', amber:'#F59E0B',
  red:'#EF4444', navyBg:'#E8EFF9', blueBg:'#E3F5FD', cyanBg:'#E4F8F9',
  greenBg:'#E9F8EF', amberBg:'#FEF9C3', redBg:'#FEF2F2',
  border:'#E5E7EB', text:'#0F172A', muted:'#94A3B8', sub:'#475569', bg:'var(--bg)',
}
const FONT = "'Plus Jakarta Sans','Inter',sans-serif"
const PAGE_SIZE = 10
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const SOURCE_COLORS = { CAMPAIGN: C.navy, NETCORE: C.blue, BOT: C.cyan, SYNCAPI: C.amber }
const CAT_COLORS    = { MARKETING: C.blue, UTILITY: C.navy }

// ── parse ────────────────────────────────────────────────────────────────────
function parseDate(s) {
  if (!s || s === 'NULL') return null
  const clean = s.replace(/"/g,'').trim()
  if (!clean) return null
  const p = clean.split(/[-\/.]/)
  if (p.length !== 3) return null
  let y, mo, dy
  // detect format: if first part is 4 digits => YYYY-MM-DD
  if (p[0].length === 4) {
    y = +p[0]; mo = +p[1]; dy = +p[2]
  } else if (p[2].length === 4) {
    // DD-MM-YYYY or MM-DD-YYYY — assume DD-MM-YYYY for Indian locale
    dy = +p[0]; mo = +p[1]; y = +p[2]
  } else if (p[2].length === 2) {
    // DD-MM-YY
    dy = +p[0]; mo = +p[1]; y = 2000 + +p[2]
  } else { return null }
  if (isNaN(y)||isNaN(mo)||isNaN(dy)) return null
  if (y < 2020 || y > 2035 || mo < 1 || mo > 12 || dy < 1 || dy > 31) return null
  return new Date(y, mo-1, dy)
}
function monthLabel(d) {
  if (!d || isNaN(d.getTime())) return ''
  return MONTHS_SHORT[d.getMonth()] + ' ' + d.getFullYear()
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
  const [hdr, ...data] = rows
  const h = k => hdr.map(x => x.toLowerCase().trim()).indexOf(k.toLowerCase())

  return data.filter(r => r.some(c => c && c !== 'NULL')).map(r => {
    const g  = k => { const i = h(k); return i >= 0 ? (r[i] === 'NULL' ? '' : r[i].replace(/^"|"$/g,'')) : '' }
    const gn = k => parseFloat(g(k)) || 0
    const date = parseDate(g('created_at'))
    return {
      date,
      dateStr:    (() => {
        if (!date) return g('created_at').slice(0,10)
        const y=date.getFullYear(),mo=String(date.getMonth()+1).padStart(2,'0'),dy=String(date.getDate()).padStart(2,'0')
        return y+'-'+mo+'-'+dy
      })(),
      month:      monthLabel(date),
      monthSort:  date ? date.getFullYear()*100 + (date.getMonth()+1) : 0,
      source:     g('source') || 'OTHER',
      campaign:   g('campaign_name') || '',
      template:   g('template_name') || '',
      category:   g('template_category') || '',
      status:     g('status') || '',
      conv_cat:   g('conversation_category') || '',
      sent:       gn('sent_count'),
      delivered:  gn('delivered_count'),
      read:       gn('read_count'),
      failed:     gn('failed_count'),
      replied:    gn('replied_count'),
      clicked:    gn('clicked_count'),
      util_spend: gn('utility_spends'),
      mkt_spend:  gn('marketing_spends'),
      total_spend: gn('utility_spends') + gn('marketing_spends'),
    }
  })
}

// ── formatters ───────────────────────────────────────────────────────────────
function fmtN(n)  { if (!n && n!==0) return '—'; if (n>=1e7) return (n/1e7).toFixed(1)+'Cr'; if (n>=1e5) return (n/1e5).toFixed(1)+'L'; if (n>=1e3) return (n/1e3).toFixed(1)+'K'; return Math.round(n).toLocaleString('en-IN') }
function fmtC(n)  { if (!n && n!==0) return '—'; if (n>=1e7) return '₹'+(n/1e7).toFixed(2)+' Cr'; if (n>=1e5) return '₹'+(n/1e5).toFixed(1)+'L'; if (n>=1000) return '₹'+(n/1e3).toFixed(1)+'K'; return '₹'+n.toFixed(2) }
function fmtPct(a,b) { return b > 0 ? (a/b*100).toFixed(1)+'%' : '—' }

// ── shared UI components ──────────────────────────────────────────────────────


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

const KPICard = ({ label, value, sub, accent=C.navy, accentBg=C.navyBg, delta, icon, sparkData }) => (
  <div style={{ background:'var(--card)', border:`0.5px solid ${'var(--card-border)'}`, borderRadius:14, padding:'18px 20px', borderTop:`3px solid ${accent}`, boxShadow:'0 1px 6px rgba(15,23,42,0.06)', display:'flex', flexDirection:'column', gap:8 }}>
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
      <div style={{ fontSize:9.5, fontWeight:700, color:'var(--text3)', letterSpacing:'0.09em', textTransform:'uppercase', fontFamily:FONT }}>{label}</div>
      {icon && <div style={{ width:28, height:28, borderRadius:8, background:accentBg, display:'flex', alignItems:'center', justifyContent:'center', color:accent, flexShrink:0 }}>{icon}</div>}
    </div>
    <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', gap:8 }}>
      <div style={{ fontSize:28, fontWeight:800, color:'var(--text)', letterSpacing:'-1px', lineHeight:1, fontFamily:FONT }}>{value}</div>
      {sparkData && <Sparkline data={sparkData} color={accent} height={28} width={64}/>}
    </div>
    <div style={{ display:'flex', alignItems:'center', gap:6, minHeight:18 }}>
      {sub && <div style={{ fontSize:11.5, color:'var(--text3)', fontFamily:FONT }}>{sub}</div>}
      {delta != null && <span style={{ fontSize:10.5, fontWeight:700, padding:'2px 7px', borderRadius:20, background:delta>=0?C.greenBg:'#FEF2F2', color:delta>=0?'#059669':'#DC2626', fontFamily:FONT, marginLeft:'auto' }}>{delta>=0?'▲':'▼'}{Math.abs(delta).toFixed(1)}%</span>}
    </div>
  </div>
)

const Card = ({ title, sub, children, action, noPad }) => (
  <div style={{ background:'var(--card)', border:`0.5px solid ${'var(--card-border)'}`, borderRadius:14, overflow:'hidden', boxShadow:'0 1px 6px rgba(15,23,42,0.06)' }}>
    <div style={{ padding:'14px 20px 12px', borderBottom:'0.5px solid #F1F5F9', display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
      <div>
        <div style={{ fontSize:13.5, fontWeight:700, color:'var(--text)', fontFamily:FONT }}>{title}</div>
        {sub && <div style={{ fontSize:11, color:'var(--text3)', marginTop:2, fontFamily:FONT }}>{sub}</div>}
      </div>
      {action && <div style={{ flexShrink:0 }}>{action}</div>}
    </div>
    <div style={noPad ? {} : { padding:'16px 20px' }}>{children}</div>
  </div>
)

const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'var(--card)', border:`0.5px solid ${'var(--card-border)'}`, borderRadius:10, padding:'10px 14px', fontSize:12, fontFamily:FONT, boxShadow:'0 8px 28px rgba(15,23,42,0.13)', minWidth:160 }}>
      {label && <div style={{ fontWeight:700, color:'var(--text)', marginBottom:8, fontSize:12.5 }}>{label}</div>}
      {payload.map(p => (
        <div key={p.name} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
          <div style={{ width:8, height:8, borderRadius:2, background:p.fill||p.color, flexShrink:0 }}/>
          <span style={{ color:'var(--text2)', flex:1 }}>{p.name}</span>
          <span style={{ fontWeight:700, color:'var(--text)' }}>{typeof p.value==='number' ? fmtN(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  )
}

const ChartLegend = ({ items }) => (
  <div style={{ display:'flex', gap:18, justifyContent:'center', marginTop:12, flexWrap:'wrap' }}>
    {items.map(({ name, color }) => (
      <div key={name} style={{ display:'flex', alignItems:'center', gap:6 }}>
        <div style={{ width:10, height:10, borderRadius:3, background:color }}/>
        <span style={{ fontSize:11.5, fontWeight:500, color:'var(--text2)', fontFamily:FONT }}>{name}</span>
      </div>
    ))}
  </div>
)

const Dropdown = ({ options, value, onChange, label, minWidth=130 }) => {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef(null)
  React.useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div style={{ display:'flex', alignItems:'center', gap:7 }} ref={ref}>
      {label && <span style={{ fontSize:11, color:'var(--text3)', fontFamily:FONT, whiteSpace:'nowrap', fontWeight:500 }}>{label}</span>}
      <div style={{ position:'relative' }}>
        <button onClick={() => setOpen(v => !v)} style={{
          display:'flex', alignItems:'center', gap:8, padding:'7px 11px 7px 13px', borderRadius:9,
          border:`0.5px solid ${open ? C.navy : 'var(--card-border)'}`, background: open ? C.navyBg : 'var(--card)',
          color:'var(--text)', cursor:'pointer', fontFamily:FONT, fontSize:12, fontWeight:600, minWidth,
          boxShadow: open ? `0 0 0 3px rgba(31,60,132,0.09)` : '0 1px 3px rgba(15,23,42,0.06)',
          transition:'all .15s', whiteSpace:'nowrap',
        }}>
          <span style={{ flex:1, textAlign:'left' }}>{value}</span>
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ flexShrink:0, transition:'transform .2s', transform:open?'rotate(180deg)':'rotate(0deg)' }}>
            <path d="M1 1l4 4 4-4" stroke={'var(--text3)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        {open && (
          <div style={{ position:'absolute', top:'calc(100% + 6px)', left:0, zIndex:500, background:'var(--card)', border:`0.5px solid ${'var(--card-border)'}`, borderRadius:12, boxShadow:'0 16px 48px rgba(15,23,42,0.14)', padding:'6px', minWidth:Math.max(minWidth,160), maxHeight:300, overflowY:'auto', scrollbarWidth:'none' }}>
            {options.map(opt => (
              <button key={opt} onClick={() => { onChange(opt); setOpen(false) }}
                style={{ display:'block', width:'100%', textAlign:'left', padding:'8px 12px', borderRadius:8, border:'none', cursor:'pointer', fontFamily:FONT, fontSize:12.5, fontWeight:opt===value?700:400, background:opt===value?C.navyBg:'transparent', color:opt===value?C.navy:'var(--text)', transition:'background .1s' }}
                onMouseEnter={e => { if (opt!==value) e.currentTarget.style.background='var(--bg3)' }}
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

// Status pill
const StatusPill = ({ status }) => {
  const cfg = {
    'Read':      { bg:'#E9F8EF', color:'#059669' },
    'Delivered': { bg:C.blueBg,  color:C.blue    },
    'Sent':      { bg:C.navyBg,  color:C.navy    },
    'Replied':   { bg:C.cyanBg,  color:C.cyan    },
    'Clicked':   { bg:C.amberBg, color:C.amber   },
    'Failed':    { bg:C.redBg,   color:C.red     },
  }[status] || { bg:'var(--bg3)', color:'var(--text3)' }
  return <span style={{ fontSize:10.5, fontWeight:700, padding:'2px 8px', borderRadius:20, background:cfg.bg, color:cfg.color, fontFamily:FONT }}>{status}</span>
}

// ── main dashboard ────────────────────────────────────────────────────────────

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

export default function WhatsAppDashboard() {
  const [rows, setRows]               = useState([])
  const [months, setMonths]           = useState([])
  const [selMonth, setSelMonth]       = useState('')
  const [selSource, setSelSource]     = useState('All')
  const [selCategory, setSelCategory] = useState('All')
  const [selCampaign, setSelCampaign] = useState('All')
  const [loading, setLoading]         = useState(true)
  const [lastSync, setLastSync]       = useState(null)
  const [error, setError]             = useState('')
  const [search, setSearch]           = useState('')
  const [sortCol, setSortCol]         = useState('total_spend')
  const [sortDir, setSortDir]         = useState('desc')
  const [page, setPage]               = useState(0)
  const [showInfo, setShowInfo]       = useState(false)
  const [datePreset, setDatePreset]   = useState('month')
  const [customFrom, setCustomFrom]   = useState('')
  const [customTo, setCustomTo]       = useState('')
  const [showCustom, setShowCustom]   = useState(false)
  const [activeTab, setActiveTab]     = useState('overview') // overview | campaigns | templates

  const loadData = useCallback(async (bust=false) => {
    setLoading(true)
    const t0 = Date.now()
    try {
      const res = await fetch(bust ? SHEET_CSV+'&_='+Date.now() : SHEET_CSV)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const parsed = parseCSV(await res.text())
      setRows(parsed)
      const mm = {}
      parsed.forEach(r => { if (r.month && (!mm[r.month] || r.monthSort < (mm[r.month]||999999))) mm[r.month] = r.monthSort })
      const ms = [...new Set(parsed.map(r=>r.month))].filter(Boolean).sort((a,b)=>(mm[a]||0)-(mm[b]||0))
      setMonths(ms)
      setSelMonth(prev => prev || ms[ms.length-1] || '')
      setError(''); setLastSync(new Date())
    } catch(e) { setError(e.message) }
    finally { setTimeout(()=>setLoading(false), Math.max(0,750-(Date.now()-t0))) }
  }, [])

  useEffect(()=>{ loadData() },[loadData])

  const isCurrentMonth = useMemo(()=>{
    if(!selMonth) return false
    const now=new Date()
    return selMonth===MONTHS_SHORT[now.getMonth()]+' '+now.getFullYear()
  },[selMonth])

  const dateWindow = useMemo(()=>{
    const today=new Date(); today.setHours(0,0,0,0)
    if(datePreset==='LD'){const y=new Date(today);y.setDate(today.getDate()-1);return{from:y,to:y}}
    if(datePreset==='L7D'){const to=new Date(today);to.setDate(today.getDate()-1);const from=new Date(to);from.setDate(to.getDate()-6);return{from,to}}
    if(datePreset==='MTD'){return{from:new Date(today.getFullYear(),today.getMonth(),1),to:today}}
    if(datePreset==='custom'&&customFrom&&customTo){
      const[fy,fm,fd]=customFrom.split('-').map(Number);const cf=new Date(fy,fm-1,fd)
      const[ty,tm,td]=customTo.split('-').map(Number);const ct=new Date(ty,tm-1,td);ct.setHours(23,59,59,999)
      return{from:cf,to:ct}
    }
    return null
  },[datePreset,customFrom,customTo])

  const baseRows = useMemo(()=>{
    if(!dateWindow) return rows.filter(r=>r.month===selMonth)
    return rows.filter(r=>{if(!r.date)return false;const d=new Date(r.date);d.setHours(0,0,0,0);return d>=dateWindow.from&&d<=dateWindow.to})
  },[rows,dateWindow,selMonth])

  // derived filter options from selected month
  const monthRows   = useMemo(()=>rows.filter(r=>r.month===selMonth),[rows,selMonth])
  const sources     = useMemo(()=>['All',...[...new Set(monthRows.map(r=>r.source))].filter(Boolean).sort()],[monthRows])
  const categories  = useMemo(()=>['All',...[...new Set(monthRows.map(r=>r.category))].filter(Boolean).sort()],[monthRows])
  const campaigns   = useMemo(()=>['All',...[...new Set(monthRows.map(r=>r.campaign))].filter(r=>r).sort()],[monthRows])

  // apply all filters
  const filtered = useMemo(()=>baseRows.filter(r=>
    (selSource==='All'||r.source===selSource) &&
    (selCategory==='All'||r.category===selCategory) &&
    (selCampaign==='All'||r.campaign===selCampaign)
  ),[baseRows,selSource,selCategory,selCampaign])

  // aggregate totals from filtered rows
  const totals = useMemo(()=>{
    const sum = k => filtered.reduce((s,r)=>s+(r[k]||0),0)
    const sent=sum('sent'), delivered=sum('delivered'), read=sum('read')
    const failed=sum('failed'), replied=sum('replied'), clicked=sum('clicked')
    const util=sum('util_spend'), mkt=sum('mkt_spend'), total=util+mkt
    const prevM = months[months.indexOf(selMonth)-1]
    const prev  = prevM ? rows.filter(r=>r.month===prevM) : []
    const prevTotal = prev.reduce((s,r)=>s+r.total_spend,0)
    const prevSent  = prev.reduce((s,r)=>s+r.sent,0)
    // total attempted = sent + failed (Failed rows have counts in failed col)
    const attempted = sent + failed
    return {
      sent, delivered, read, failed, replied, clicked, util, mkt, total, attempted,
      deliveryRate: attempted>0 ? delivered/attempted*100 : 0,
      readRate:     delivered>0 ? read/delivered*100 : 0,
      replyRate:    delivered>0 ? replied/delivered*100 : 0,
      ctr:          delivered>0 ? clicked/delivered*100 : 0,
      failRate:     attempted>0 ? failed/attempted*100 : 0,
      cpd:          delivered>0 ? total/delivered : 0,
      spendDelta:   prevTotal>0 ? (total-prevTotal)/prevTotal*100 : null,
      sentDelta:    prevSent>0  ? (sent-prevSent)/prevSent*100   : null,
    }
  },[filtered,rows,months,selMonth])

  // funnel data
  const funnel = useMemo(()=>[
    { name:'Sent',      value:totals.sent,      fill:C.navy,  pct:100 },
    { name:'Delivered', value:totals.delivered, fill:C.blue,  pct:totals.deliveryRate },
    { name:'Read',      value:totals.read,      fill:C.cyan,  pct:totals.readRate },
    { name:'Replied',   value:totals.replied,   fill:C.green, pct:totals.replyRate },
    { name:'Clicked',   value:totals.clicked,   fill:C.amber, pct:totals.ctr },
  ].filter(d=>d.value>0),[totals])

  // by source bar
  const sourceBar = useMemo(()=>{
    const map={}
    filtered.forEach(r=>{
      if(!map[r.source])map[r.source]={source:r.source,sent:0,delivered:0,read:0,spend:0}
      map[r.source].sent+=r.sent; map[r.source].delivered+=r.delivered
      map[r.source].read+=r.read; map[r.source].spend+=r.total_spend
    })
    return Object.values(map).sort((a,b)=>b.sent-a.sent)
  },[filtered])

  // spend by category
  const spendByCat = useMemo(()=>[
    {name:'Utility',   value:totals.util, fill:C.navy},
    {name:'Marketing', value:totals.mkt,  fill:C.blue},
  ].filter(d=>d.value>0),[totals])

  // daily trend
  const dailyTrend = useMemo(()=>{
    const map={}
    filtered.forEach(r=>{
      if(!r.dateStr)return
      if(!map[r.dateStr])map[r.dateStr]={date:r.dateStr,Sent:0,Delivered:0,Spend:0}
      map[r.dateStr].Sent+=r.sent; map[r.dateStr].Delivered+=r.delivered; map[r.dateStr].Spend+=r.total_spend
    })
    return Object.values(map).sort((a,b)=>a.date.localeCompare(b.date))
  },[filtered])

  // month trend
  const monthTrend = useMemo(()=>months.map(m=>{
    const mr=rows.filter(r=>r.month===m)
    return{month:m,Sent:mr.reduce((s,r)=>s+r.sent,0),Spend:mr.reduce((s,r)=>s+r.total_spend,0)}
  }),[rows,months])

  // top campaigns
  const topCampaigns = useMemo(()=>{
    const map={}
    filtered.filter(r=>r.campaign).forEach(r=>{
      if(!map[r.campaign])map[r.campaign]={campaign:r.campaign,sent:0,delivered:0,read:0,spend:0}
      map[r.campaign].sent+=r.sent; map[r.campaign].delivered+=r.delivered
      map[r.campaign].read+=r.read; map[r.campaign].spend+=r.total_spend
    })
    return Object.values(map).sort((a,b)=>b.spend-a.spend).slice(0,10)
  },[filtered])

  // top templates
  const topTemplates = useMemo(()=>{
    const map={}
    filtered.forEach(r=>{
      if(!map[r.template])map[r.template]={template:r.template,category:r.category,sent:0,delivered:0,read:0,spend:0}
      map[r.template].sent+=r.sent; map[r.template].delivered+=r.delivered
      map[r.template].read+=r.read; map[r.template].spend+=r.total_spend
    })
    return Object.values(map).sort((a,b)=>b.spend-a.spend).slice(0,10)
  },[filtered])

  // table rows (raw filtered, sorted)
  const tableRows = useMemo(()=>{
    const q=search.toLowerCase()
    return filtered
      .filter(r=>!q||(r.template+r.campaign+r.source).toLowerCase().includes(q))
      .sort((a,b)=>{
        const av=a[sortCol]??0, bv=b[sortCol]??0
        if(typeof av==='number') return sortDir==='desc'?bv-av:av-bv
        return sortDir==='desc'?String(bv).localeCompare(String(av)):String(av).localeCompare(String(bv))
      })
  },[filtered,search,sortCol,sortDir])

  const totalPages = Math.ceil(tableRows.length/PAGE_SIZE)
  const pageRows   = tableRows.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE)
  const sortBy     = col => { setSortCol(col); setSortDir(d=>sortCol===col?(d==='desc'?'asc':'desc'):'desc'); setPage(0) }
  const onSearch   = v => { setSearch(v); setPage(0) }
  const thS        = col => ({ fontSize:10, fontWeight:700, color:'var(--text3)', letterSpacing:'0.07em', textTransform:'uppercase', padding:'10px 12px', cursor:'pointer', userSelect:'none', fontFamily:FONT, whiteSpace:'nowrap', background:sortCol===col?'var(--navy-tint)':'transparent', borderBottom:`0.5px solid ${'var(--card-border)'}` })

  const TABS = [
    { id:'overview',   label:'Overview'   },
    { id:'campaigns',  label:'Campaigns'  },
    { id:'templates',  label:'Templates'  },
    { id:'raw',        label:'Raw Data'   },
  ]

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:'var(--bg)', fontFamily:FONT }}>
      <Sidebar/>
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>

        {/* ── HEADER ── */}
        <div style={{ background:'var(--card)', borderBottom:`0.5px solid ${'var(--card-border)'}`, padding:'0 28px', height:56, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexShrink:0 }}>
          <div>
            <p style={{ fontSize:10.5, color:'var(--text3)', margin:0, letterSpacing:'0.05em', textTransform:'uppercase', fontFamily:FONT }}>Dashboards / WhatsApp</p>
            <h1 style={{ fontSize:18, fontWeight:800, color:'var(--text)', margin:'2px 0 0', letterSpacing:'-0.5px', fontFamily:FONT }}>WhatsApp{selMonth ? ' · '+selMonth : ''}</h1>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
            {isCurrentMonth&&(
              <div style={{display:'flex',alignItems:'center',gap:3,background:'var(--bg3)',borderRadius:9,padding:'3px'}}>
                {[['LD','Last Day'],['L7D','Last 7D'],['MTD','MTD']].map(([key,lbl])=>(
                  <button key={key} onClick={()=>{setDatePreset(key);setCustomFrom('');setCustomTo('');setPage(0)}}
                    style={{padding:'5px 11px',borderRadius:7,border:'none',cursor:'pointer',fontSize:11.5,fontWeight:700,fontFamily:FONT,background:datePreset===key?'var(--card)':'transparent',color:datePreset===key?C.navy:'var(--text3)',boxShadow:datePreset===key?'0 1px 4px rgba(15,23,42,0.10)':'none',transition:'all .15s'}}>
                    {lbl}
                  </button>
                ))}
              </div>
            )}
            {months.length>0&&(
              <div style={{opacity:datePreset!=='month'?0.5:1,transition:'opacity .15s'}}>
                <Dropdown options={[...months].reverse()} value={selMonth} minWidth={110}
                  onChange={v=>{setSelMonth(v);setDatePreset('month');setCustomFrom('');setCustomTo('');setPage(0)}}/>
              </div>
            )}
            <div style={{position:'relative'}}>
              <button onClick={()=>setShowCustom(v=>!v)}
                style={{padding:'6px 11px',borderRadius:8,border:`0.5px solid ${datePreset==='custom'?C.navy:'var(--card-border)'}`,background:datePreset==='custom'?C.navyBg:'var(--card)',color:datePreset==='custom'?C.navy:'var(--text2)',fontSize:11.5,fontWeight:600,fontFamily:FONT,cursor:'pointer',display:'flex',alignItems:'center',gap:5,transition:'all .15s'}}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                {datePreset==='custom'&&customFrom?customFrom+' → '+customTo:'Custom'}
              </button>
              {showCustom&&(
                <>
                  <div onClick={()=>setShowCustom(false)} style={{position:'fixed',inset:0,zIndex:399}}/>
                  <div style={{position:'absolute',top:'calc(100% + 8px)',right:0,zIndex:400,background:'var(--card)',border:`0.5px solid ${'var(--card-border)'}`,borderRadius:12,boxShadow:'0 14px 40px rgba(15,23,42,0.14)',padding:'16px 18px',minWidth:240,fontFamily:FONT}}>
                    <div style={{fontSize:11,fontWeight:700,color:'var(--text3)',letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:10}}>Custom date range</div>
                    {[['From',customFrom,setCustomFrom],['To',customTo,setCustomTo]].map(([lbl,val,setter])=>(
                      <div key={lbl} style={{marginBottom:10}}>
                        <div style={{fontSize:11,fontWeight:600,color:'var(--text2)',marginBottom:4}}>{lbl}</div>
                        <input type="date" value={val} onChange={e=>setter(e.target.value)} style={{width:'100%',padding:'7px 10px',borderRadius:8,border:`0.5px solid ${'var(--card-border)'}`,fontSize:12,fontFamily:FONT,outline:'none',color:'var(--text)',boxSizing:'border-box'}}/>
                      </div>
                    ))}
                    <button onClick={()=>{if(customFrom&&customTo){setDatePreset('custom');setShowCustom(false);setPage(0)}}} disabled={!customFrom||!customTo}
                      style={{width:'100%',padding:'8px',borderRadius:8,border:'none',background:customFrom&&customTo?C.navy:'#E5E7EB',color:customFrom&&customTo?'var(--card)':'var(--text3)',fontSize:12,fontWeight:700,fontFamily:FONT,cursor:customFrom&&customTo?'pointer':'not-allowed'}}>
                      Apply range
                    </button>
                  </div>
                </>
              )}
            </div>
            <Dropdown label="Source"   options={sources}    value={selSource}   minWidth={120} onChange={v=>{setSelSource(v);setPage(0)}}/>
            <Dropdown label="Category" options={categories} value={selCategory} minWidth={120} onChange={v=>{setSelCategory(v);setPage(0)}}/>
            <Dropdown label="Campaign" options={campaigns}  value={selCampaign} minWidth={140} onChange={v=>{setSelCampaign(v);setPage(0)}}/>
            {lastSync && <span style={{ fontSize:11, color:'var(--text3)', fontFamily:FONT }}>Synced {lastSync.toLocaleTimeString()}</span>}
            <button onClick={()=>loadData(true)} disabled={loading} className="lqRefreshBtn"
              style={{ padding:'7px 14px', borderRadius:9, border:`0.5px solid ${'var(--card-border)'}`, fontSize:12, fontWeight:600, cursor:loading?'wait':'pointer', fontFamily:FONT, background:'var(--card)', color:'#374151', display:'flex', alignItems:'center', gap:6, opacity:loading?0.65:1, boxShadow:'0 1px 3px rgba(15,23,42,0.06)' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{animation:loading?'spin .8s linear infinite':'none'}}>
                <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
              {loading?'Refreshing':'Refresh'}
            </button>
            <div style={{ position:'relative' }}>
              <button onClick={()=>setShowInfo(v=>!v)} style={{ width:32, height:32, borderRadius:9, border:`0.5px solid ${'var(--card-border)'}`, background:showInfo?C.navyBg:'var(--card)', color:C.navy, fontSize:15, fontWeight:700, fontStyle:'italic', fontFamily:'Georgia,serif', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 1px 3px rgba(15,23,42,0.06)' }}>i</button>
              {showInfo&&<div onClick={()=>setShowInfo(false)} style={{position:'fixed',inset:0,zIndex:150}}/>}
              {showInfo&&(
                <div style={{ position:'absolute', right:0, top:'calc(100% + 8px)', zIndex:200, width:380, background:'var(--card)', border:`0.5px solid ${'var(--card-border)'}`, borderRadius:14, boxShadow:'0 16px 48px rgba(15,23,42,0.16)', padding:'18px 20px', fontFamily:FONT }}>
                  <div style={{ fontSize:13.5, fontWeight:700, color:'var(--text)', marginBottom:10 }}>How metrics are calculated</div>
                  {[
                    ['Sent',          'Messages entered the sending pipeline (sent_count). Excludes failed.'],
                    ['Delivered',     'Messages confirmed received on recipient device.'],
                    ['Read',          'Messages opened by recipient.'],
                    ['Replied',       'Recipients who replied to the message.'],
                    ['Clicked',       'Recipients who clicked a link/button in the message.'],
                    ['Failed',        'Messages that could not be delivered (failed_count).'],
                    ['Delivery Rate', 'Delivered ÷ (Sent + Failed) × 100'],
                    ['Read Rate',     'Read ÷ Delivered × 100'],
                    ['Reply Rate',    'Replied ÷ Delivered × 100'],
                    ['CTR',           'Clicked ÷ Delivered × 100'],
                    ['CPD',           'Total Spend ÷ Delivered (cost per delivered message)'],
                    ['Sources',       'CAMPAIGN = bulk outbound; NETCORE = automated flows; BOT = bot-triggered; SYNCAPI = API integrations'],
                    ['Categories',    'UTILITY = transactional (auth, updates); MARKETING = promotional messages'],
                  ].map(([m,d])=>(
                    <div key={m} style={{ display:'flex', gap:10, padding:'6px 0', borderTop:'0.5px solid #F3F4F6' }}>
                      <div style={{ fontSize:11.5, fontWeight:700, color:C.navy, width:110, flexShrink:0 }}>{m}</div>
                      <div style={{ fontSize:11.5, color:'var(--text2)', lineHeight:1.5 }}>{d}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── TAB BAR ── */}
        <div style={{ background:'var(--card)', borderBottom:`0.5px solid ${'var(--card-border)'}`, padding:'0 28px', display:'flex', gap:0, flexShrink:0 }}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setActiveTab(t.id)}
              style={{ padding:'12px 18px', border:'none', background:'none', cursor:'pointer', fontFamily:FONT, fontSize:13, fontWeight:activeTab===t.id?700:500, color:activeTab===t.id?C.navy:'var(--text3)', borderBottom:activeTab===t.id?`2px solid ${C.navy}`:'2px solid transparent', marginBottom:-1, transition:'all .15s' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── BODY ── */}
        <div style={{ flex:1, overflowY:'auto', padding:'20px 28px' }}>
          {loading&&rows.length===0 ? (
            <div style={{ padding:'0 0 20px' }}>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:14, marginBottom:20 }}>
                {[1,2,3,4,5,6].map(i=>(
                  <div key={i} style={{ background:'var(--card)', border:'0.5px solid var(--card-border)', borderRadius:14, padding:'18px 20px', borderTop:'3px solid var(--card-border)' }}>
                    <div className="skeleton" style={{ height:10, width:'70%', marginBottom:10 }}/>
                    <div className="skeleton" style={{ height:26, width:'60%', marginBottom:8 }}/>
                    <div className="skeleton" style={{ height:10, width:'50%' }}/>
                  </div>
                ))}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16, marginBottom:16 }}>
                {[180,180,180].map((h,i)=>(
                  <div key={i} style={{ background:'var(--card)', border:'0.5px solid var(--card-border)', borderRadius:14, padding:20 }}>
                    <div className="skeleton" style={{ height:13, width:'40%', marginBottom:8 }}/>
                    <div className="skeleton" style={{ height:11, width:'25%', marginBottom:20 }}/>
                    <div className="skeleton" style={{ height:h, borderRadius:8 }}/>
                  </div>
                ))}
              </div>
            </div>
          ) : error ? (
            <div style={{ textAlign:'center', paddingTop:80, color:'#DC2626', fontSize:13, fontFamily:FONT }}>⚠️ {error}</div>
          ) : (
            <>
              {/* KPI ROW — always visible */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:14, marginBottom:20 }}>
                <KPICard label="Sent"          value={fmtN(totals.sent)}      sub={selMonth} delta={totals.sentDelta}  accent={C.navy}  accentBg={C.navyBg}
                  icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>}/>
                <KPICard label="Delivered"     value={fmtN(totals.delivered)} sub={fmtPct(totals.deliveryRate,100)+' delivery rate'} accent={C.blue}  accentBg={C.blueBg}
                  icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}/>
                <KPICard label="Read"          value={fmtN(totals.read)}      sub={fmtPct(totals.readRate,100)+' read rate'}     accent={C.cyan}  accentBg={C.cyanBg}
                  icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}/>
                <KPICard label="Replied"       value={fmtN(totals.replied)}   sub={fmtPct(totals.replyRate,100)+' reply rate'}    accent={C.green} accentBg={C.greenBg}
                  icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>}/>
                <KPICard label="Failed"        value={fmtN(totals.failed)}    sub={fmtPct(totals.failRate,100)+' fail rate'}      accent={C.red}   accentBg={C.redBg}
                  icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>}/>
                <KPICard label="Total Spend"   value={fmtC(totals.total)}     sub={`CPD ${fmtC(totals.cpd)}`} delta={totals.spendDelta} accent={C.amber} accentBg={C.amberBg}
                  icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>}/>
              </div>

              {/* ── OVERVIEW TAB ── */}
              {activeTab==='overview' && (
                <>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16, marginBottom:16 }}>
                    {/* Funnel */}
                    <Card title="Message funnel" sub="Engagement drop-off for selected filters">
                      <div style={{ padding:'8px 0' }}>
                        {funnel.map((item, i) => (
                          <div key={item.name} style={{ marginBottom:10 }}>
                            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                              <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                                <div style={{ width:8, height:8, borderRadius:2, background:item.fill }}/>
                                <span style={{ fontSize:12, fontWeight:600, color:'var(--text)', fontFamily:FONT }}>{item.name}</span>
                              </div>
                              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                <span style={{ fontSize:11, color:'var(--text3)', fontFamily:FONT }}>{fmtPct(item.pct,100)}</span>
                                <span style={{ fontSize:13, fontWeight:700, color:'var(--text)', fontFamily:FONT }}>{fmtN(item.value)}</span>
                              </div>
                            </div>
                            <div style={{ height:7, background:'var(--bg3)', borderRadius:4, overflow:'hidden' }}>
                              <div style={{ height:'100%', width:`${Math.min(100,item.pct||0)}%`, background:item.fill, borderRadius:4, transition:'width .5s ease' }}/>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>

                    {/* By source */}
                    <Card title="By source" sub="Messages sent per sending channel">
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={sourceBar} margin={{top:4,right:8,left:-8,bottom:0}} barCategoryGap="30%">
                          <XAxis dataKey="source" tick={{fontSize:11,fill:'var(--text3)',fontFamily:FONT}} axisLine={false} tickLine={false} tick={{fontSize:10.5,fill:"#94A3B8",fontFamily:"'Plus Jakarta Sans',sans-serif"}} axisLine={false} tickLine={false}/>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false}/>
                          <YAxis tick={{fontSize:10,fill:'var(--text3)',fontFamily:FONT}} tickFormatter={v=>fmtN(v)} axisLine={false} tickLine={false}/>
                          <ReTooltip content={<ChartTip/>} cursor={{fill:'var(--bg3)'}}/>
                          <Bar dataKey="sent" name="Sent" radius={[6,6,0,0]} maxBarSize={48}>
                            {sourceBar.map((e,i)=><Cell key={i} fill={SOURCE_COLORS[e.source]||'var(--text3)'}/>)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginTop:8, justifyContent:'center' }}>
                        {sourceBar.map(s=>(
                          <div key={s.source} style={{ display:'flex', alignItems:'center', gap:5 }}>
                            <div style={{ width:8, height:8, borderRadius:2, background:SOURCE_COLORS[s.source]||'var(--text3)' }}/>
                            <span style={{ fontSize:11, color:'var(--text2)', fontFamily:FONT }}>{s.source}</span>
                          </div>
                        ))}
                      </div>
                    </Card>

                    {/* Spend split */}
                    <Card title="Utility vs Marketing spend" sub="Cost breakdown by message category">
                      <div style={{ padding:'8px 0' }}>
                        {spendByCat.map(s=>(
                          <div key={s.name} style={{ marginBottom:14 }}>
                            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                              <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                                <div style={{ width:8, height:8, borderRadius:2, background:s.fill }}/>
                                <span style={{ fontSize:12, fontWeight:600, color:'var(--text)', fontFamily:FONT }}>{s.name}</span>
                              </div>
                              <div style={{ textAlign:'right' }}>
                                <div style={{ fontSize:14, fontWeight:800, color:'var(--text)', fontFamily:FONT }}>{fmtC(s.value)}</div>
                                <div style={{ fontSize:10.5, color:'var(--text3)', fontFamily:FONT }}>{totals.total>0?((s.value/totals.total)*100).toFixed(1):'0'}%</div>
                              </div>
                            </div>
                            <div style={{ height:8, background:'var(--bg3)', borderRadius:4, overflow:'hidden' }}>
                              <div style={{ height:'100%', width:`${totals.total>0?s.value/totals.total*100:0}%`, background:s.fill, borderRadius:4, transition:'width .5s ease' }}/>
                            </div>
                          </div>
                        ))}
                        <div style={{ marginTop:16, padding:'12px 14px', background:C.navyBg, borderRadius:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <span style={{ fontSize:12, fontWeight:600, color:C.navy, fontFamily:FONT }}>Total Spend</span>
                          <span style={{ fontSize:18, fontWeight:800, color:C.navy, fontFamily:FONT }}>{fmtC(totals.total)}</span>
                        </div>
                      </div>
                    </Card>
                  </div>

                  {/* Daily trend */}
                  <div style={{ marginBottom:16 }}>
                    <Card title="Daily trend" sub={`Messages sent and spend by day · ${selMonth}`}>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={dailyTrend} margin={{top:8,right:16,left:-8,bottom:0}} barCategoryGap="25%">
                          <XAxis dataKey="date" tick={{fontSize:9.5,fill:'var(--text3)',fontFamily:FONT}} axisLine={false} tickLine={false} tickFormatter={v=>v.slice(5)}/>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false}/>
                          <YAxis yAxisId="l" tick={{fontSize:10,fill:'var(--text3)',fontFamily:FONT}} tickFormatter={v=>fmtN(v)} axisLine={false} tickLine={false}/>
                          <YAxis yAxisId="r" orientation="right" tick={{fontSize:10,fill:'var(--text3)',fontFamily:FONT}} tickFormatter={v=>fmtC(v)} axisLine={false} tickLine={false}/>
                          <ReTooltip content={<ChartTip/>} cursor={{fill:'var(--bg3)'}}/>
                          <Bar yAxisId="l" dataKey="Sent"     fill={C.navy} radius={[6,6,0,0]} maxBarSize={28} name="Sent"/>
                          <Bar yAxisId="l" dataKey="Delivered" fill={C.blue} radius={[6,6,0,0]} maxBarSize={28} name="Delivered" opacity={0.8}/>
                          <Bar yAxisId="r" dataKey="Spend"    fill={C.amber} radius={[6,6,0,0]} maxBarSize={16} name="Spend ₹" opacity={0.7}/>
                        </BarChart>
                      </ResponsiveContainer>
                      <ChartLegend items={[{name:'Sent',color:C.navy},{name:'Delivered',color:C.blue},{name:'Spend ₹',color:C.amber}]}/>
                    </Card>
                  </div>

                  {/* Month trend */}
                  {monthTrend.length>1&&(
                    <div style={{ marginBottom:16 }}>
                      <Card title="Month-on-month trend" sub="Messages sent and spend across all months">
                        <ResponsiveContainer width="100%" height={200}>
                          <LineChart data={monthTrend} margin={{top:8,right:16,left:-8,bottom:0}}>
                            <XAxis dataKey="month" tick={{fontSize:10.5,fill:'var(--text3)',fontFamily:FONT}} axisLine={false} tickLine={false} tick={{fontSize:10.5,fill:"#94A3B8",fontFamily:"'Plus Jakarta Sans',sans-serif"}} axisLine={false} tickLine={false}/>
                            <YAxis yAxisId="l" tick={{fontSize:10,fill:'var(--text3)',fontFamily:FONT}} tickFormatter={v=>fmtN(v)} axisLine={false} tickLine={false}/>
                            <YAxis yAxisId="r" orientation="right" tick={{fontSize:10,fill:'var(--text3)',fontFamily:FONT}} tickFormatter={v=>fmtC(v)} axisLine={false} tickLine={false}/>
                            <ReTooltip content={<ChartTip/>}/>
                            <Line yAxisId="l" type="monotone" dataKey="Sent"  stroke={C.navy}  strokeWidth={2.5} dot={{r:3.5,fill:C.navy, strokeWidth:0}} activeDot={{r:5}}/>
                            <Line yAxisId="r" type="monotone" dataKey="Spend" stroke={C.amber} strokeWidth={2.5} dot={{r:3.5,fill:C.amber,strokeWidth:0}} activeDot={{r:5}}/>
                          </LineChart>
                        </ResponsiveContainer>
                        <ChartLegend items={[{name:'Sent',color:C.navy},{name:'Spend ₹',color:C.amber}]}/>
                      </Card>
                    </div>
                  )}
                </>
              )}

              {/* ── CAMPAIGNS TAB ── */}
              {activeTab==='campaigns' && (
                <>
                  <div style={{ marginBottom:16 }}>
                    <Card title="Top 10 campaigns by spend" sub="Filtered by active selections">
                      {topCampaigns.length===0
                        ?<div style={{textAlign:'center',padding:'40px 0',color:'var(--text3)',fontSize:13,fontFamily:FONT}}>No campaign data for selected filters</div>
                        :<>
                          <ResponsiveContainer width="100%" height={Math.max(240,topCampaigns.length*36)}>
                            <BarChart data={topCampaigns} layout="vertical" margin={{top:4,right:80,left:8,bottom:4}} barCategoryGap="20%">
                              <XAxis type="number" tick={{fontSize:10,fill:'var(--text3)',fontFamily:FONT}} tickFormatter={v=>fmtC(v)} axisLine={false} tickLine={false}/>
                              <YAxis type="category" dataKey="campaign" tick={{fontSize:10.5,fill:'var(--text2)',fontFamily:FONT}} width={220} axisLine={false} tickLine={false} tickFormatter={v=>v.length>30?v.slice(0,28)+'…':v}/>
                              <ReTooltip content={<ChartTip/>} cursor={{fill:'var(--bg3)'}}/>
                              <Bar dataKey="spend" fill={C.navy} radius={[0,5,5,0]} maxBarSize={22} name="Spend ₹"/>
                            </BarChart>
                          </ResponsiveContainer>
                        </>
                      }
                    </Card>
                  </div>
                  {/* Campaign stats table */}
                  <Card title="Campaign performance" noPad sub={`${topCampaigns.length} campaigns · ${selMonth}`}>
                    <div style={{overflowX:'auto'}}>
                      <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                        <thead><tr>
                          {[['campaign','Campaign'],['sent','Sent'],['delivered','Delivered'],['read','Read'],['spend','Spend']].map(([col,lbl])=>(
                            <th key={col} style={thS(col)} onClick={()=>sortBy(col)}>{lbl} <span style={{opacity:sortCol===col?1:0.3,fontSize:9}}>{sortCol===col?(sortDir==='desc'?'↓':'↑'):'↕'}</span></th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {topCampaigns.map((r,i)=>(
                            <tr key={i} style={{borderBottom:`0.5px solid #F3F4F6`,background:i%2?'var(--bg3)':'var(--card)',transition:'background .1s'}}
                              onMouseEnter={e=>e.currentTarget.style.background='#F0F7FF'}
                              onMouseLeave={e=>e.currentTarget.style.background=i%2?'var(--bg3)':'var(--card)'}>
                              <td style={{padding:'10px 12px',color:'var(--text)',maxWidth:260,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontFamily:FONT}} title={r.campaign}>{r.campaign||'—'}</td>
                              <td style={{padding:'10px 12px',fontWeight:600,color:'var(--text)',textAlign:'right',fontFamily:FONT,paddingRight:16}}>{fmtN(r.sent)}</td>
                              <td style={{padding:'10px 12px',color:'var(--text2)',textAlign:'right',fontFamily:FONT,paddingRight:16}}>{fmtN(r.delivered)}</td>
                              <td style={{padding:'10px 12px',color:'var(--text2)',textAlign:'right',fontFamily:FONT,paddingRight:16}}>{fmtN(r.read)}</td>
                              <td style={{padding:'10px 12px',fontWeight:700,color:'var(--text)',textAlign:'right',fontFamily:FONT,paddingRight:20}}>{fmtC(r.spend)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </>
              )}

              {/* ── TEMPLATES TAB ── */}
              {activeTab==='templates' && (
                <>
                  <div style={{ marginBottom:16 }}>
                    <Card title="Top 10 templates by spend" sub="Stacked by category (Utility / Marketing)">
                      {topTemplates.length===0
                        ?<div style={{textAlign:'center',padding:'40px 0',color:'var(--text3)',fontSize:13,fontFamily:FONT}}>No template data</div>
                        :<>
                          <ResponsiveContainer width="100%" height={Math.max(240,topTemplates.length*36)}>
                            <BarChart data={topTemplates} layout="vertical" margin={{top:4,right:80,left:8,bottom:4}} barCategoryGap="20%">
                              <XAxis type="number" tick={{fontSize:10,fill:'var(--text3)',fontFamily:FONT}} tickFormatter={v=>fmtC(v)} axisLine={false} tickLine={false}/>
                              <YAxis type="category" dataKey="template" tick={{fontSize:10.5,fill:'var(--text2)',fontFamily:FONT}} width={200} axisLine={false} tickLine={false} tickFormatter={v=>v.length>28?v.slice(0,26)+'…':v}/>
                              <ReTooltip content={<ChartTip/>} cursor={{fill:'var(--bg3)'}}/>
                              <Bar dataKey="spend" radius={[0,5,5,0]} maxBarSize={22} name="Spend ₹">
                                {topTemplates.map((e,i)=><Cell key={i} fill={CAT_COLORS[e.category]||'var(--text3)'}/>)}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                          <ChartLegend items={[{name:'Utility',color:C.navy},{name:'Marketing',color:C.blue}]}/>
                        </>
                      }
                    </Card>
                  </div>
                  <Card title="Template performance" noPad sub={`${topTemplates.length} templates · ${selMonth}`}>
                    <div style={{overflowX:'auto'}}>
                      <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                        <thead><tr>
                          {[['template','Template'],['category','Category'],['sent','Sent'],['delivered','Delivered'],['read','Read'],['spend','Spend']].map(([col,lbl])=>(
                            <th key={col} style={thS(col)} onClick={()=>sortBy(col)}>{lbl} <span style={{opacity:sortCol===col?1:0.3,fontSize:9}}>{sortCol===col?(sortDir==='desc'?'↓':'↑'):'↕'}</span></th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {topTemplates.map((r,i)=>(
                            <tr key={i} style={{borderBottom:`0.5px solid #F3F4F6`,background:i%2?'var(--bg3)':'var(--card)',transition:'background .1s'}}
                              onMouseEnter={e=>e.currentTarget.style.background='#F0F7FF'}
                              onMouseLeave={e=>e.currentTarget.style.background=i%2?'var(--bg3)':'var(--card)'}>
                              <td style={{padding:'10px 12px',color:'var(--text)',maxWidth:240,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontFamily:FONT}} title={r.template}>{r.template||'—'}</td>
                              <td style={{padding:'10px 12px',fontFamily:FONT}}>
                                <span style={{fontSize:10.5,fontWeight:700,padding:'2px 8px',borderRadius:20,background:r.category==='UTILITY'?C.navyBg:C.blueBg,color:r.category==='UTILITY'?C.navy:C.blue}}>{r.category||'—'}</span>
                              </td>
                              <td style={{padding:'10px 12px',fontWeight:600,color:'var(--text)',textAlign:'right',fontFamily:FONT,paddingRight:16}}>{fmtN(r.sent)}</td>
                              <td style={{padding:'10px 12px',color:'var(--text2)',textAlign:'right',fontFamily:FONT,paddingRight:16}}>{fmtN(r.delivered)}</td>
                              <td style={{padding:'10px 12px',color:'var(--text2)',textAlign:'right',fontFamily:FONT,paddingRight:16}}>{fmtN(r.read)}</td>
                              <td style={{padding:'10px 12px',fontWeight:700,color:'var(--text)',textAlign:'right',fontFamily:FONT,paddingRight:20}}>{fmtC(r.spend)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </>
              )}

              {/* ── RAW DATA TAB ── */}
              {activeTab==='raw' && (
                <Card title="Raw data" noPad
                  sub={`${tableRows.length.toLocaleString()} rows · ${selMonth}${selSource!=='All'?' · '+selSource:''}${selCategory!=='All'?' · '+selCategory:''}`}
                  action={
                    <div style={{position:'relative'}}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={'var(--text3)'} strokeWidth="2" style={{position:'absolute',left:9,top:'50%',transform:'translateY(-50%)',pointerEvents:'none'}}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                      <input value={search} onChange={e=>onSearch(e.target.value)} placeholder="Search template, campaign…"
                        style={{paddingLeft:30,paddingRight:10,paddingTop:7,paddingBottom:7,borderRadius:9,border:`0.5px solid ${'var(--card-border)'}`,fontSize:12,fontFamily:FONT,outline:'none',width:240,color:'var(--text)',boxShadow:'0 1px 3px rgba(15,23,42,0.06)'}}/>
                    </div>
                  }>
                  <div style={{overflowX:'auto'}}>
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                      <thead><tr>
                        {[['dateStr','Date'],['source','Source'],['campaign','Campaign'],['template','Template'],['status','Status'],['sent','Sent'],['delivered','Delivered'],['read','Read'],['failed','Failed'],['replied','Replied'],['total_spend','Spend']].map(([col,lbl])=>(
                          <th key={col} style={thS(col)} onClick={()=>sortBy(col)}>{lbl} <span style={{opacity:sortCol===col?1:0.3,fontSize:9}}>{sortCol===col?(sortDir==='desc'?'↓':'↑'):'↕'}</span></th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {pageRows.map((r,i)=>(
                          <tr key={i} style={{borderBottom:`0.5px solid #F3F4F6`,background:i%2?'var(--bg3)':'var(--card)',transition:'background .1s'}}
                            onMouseEnter={e=>e.currentTarget.style.background='#F0F7FF'}
                            onMouseLeave={e=>e.currentTarget.style.background=i%2?'var(--bg3)':'var(--card)'}>
                            <td style={{padding:'9px 12px',color:'var(--text3)',fontFamily:FONT,whiteSpace:'nowrap'}}>{r.dateStr}</td>
                            <td style={{padding:'9px 12px',fontFamily:FONT}}>
                              <span style={{fontSize:10.5,fontWeight:700,padding:'2px 8px',borderRadius:20,background:(SOURCE_COLORS[r.source]||'var(--text3)')+'22',color:SOURCE_COLORS[r.source]||'var(--text3)'}}>{r.source}</span>
                            </td>
                            <td style={{padding:'9px 12px',color:'var(--text2)',maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontFamily:FONT}} title={r.campaign}>{r.campaign||'—'}</td>
                            <td style={{padding:'9px 12px',color:'var(--text)',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontFamily:FONT}} title={r.template}>{r.template||'—'}</td>
                            <td style={{padding:'9px 12px',fontFamily:FONT}}><StatusPill status={r.status}/></td>
                            <td style={{padding:'9px 12px',textAlign:'right',color:'var(--text)',fontWeight:600,fontFamily:FONT,paddingRight:12}}>{r.sent||'—'}</td>
                            <td style={{padding:'9px 12px',textAlign:'right',color:'var(--text2)',fontFamily:FONT,paddingRight:12}}>{r.delivered||'—'}</td>
                            <td style={{padding:'9px 12px',textAlign:'right',color:'var(--text2)',fontFamily:FONT,paddingRight:12}}>{r.read||'—'}</td>
                            <td style={{padding:'9px 12px',textAlign:'right',color:r.failed>0?C.red:'var(--text3)',fontFamily:FONT,paddingRight:12}}>{r.failed||'—'}</td>
                            <td style={{padding:'9px 12px',textAlign:'right',color:'var(--text2)',fontFamily:FONT,paddingRight:12}}>{r.replied||'—'}</td>
                            <td style={{padding:'9px 12px',textAlign:'right',fontWeight:700,color:'var(--text)',fontFamily:FONT,paddingRight:20}}>{r.total_spend>0?fmtC(r.total_spend):'—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {totalPages>1&&(
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 12px 12px',borderTop:`0.5px solid ${'var(--card-border)'}`}}>
                        <span style={{fontSize:11.5,color:'var(--text3)',fontFamily:FONT}}>{page*PAGE_SIZE+1}–{Math.min((page+1)*PAGE_SIZE,tableRows.length)} of {tableRows.length.toLocaleString()} rows</span>
                        <div style={{display:'flex',gap:5,alignItems:'center'}}>
                          <button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0} style={{padding:'5px 13px',borderRadius:8,border:`0.5px solid ${'var(--card-border)'}`,background:'var(--card)',fontSize:12,fontWeight:600,fontFamily:FONT,cursor:page===0?'not-allowed':'pointer',opacity:page===0?0.35:1,color:'var(--text)'}}>← Prev</button>
                          {Array.from({length:Math.min(7,totalPages)},(_,i)=>{const start=Math.max(0,Math.min(page-3,totalPages-7));const p=start+i;return<button key={p} onClick={()=>setPage(p)} style={{width:32,height:32,borderRadius:8,border:`0.5px solid ${p===page?C.navy:'var(--card-border)'}`,background:p===page?C.navy:'var(--card)',color:p===page?'var(--card)':'var(--text)',fontSize:12,fontWeight:p===page?700:400,fontFamily:FONT,cursor:'pointer'}}>{p+1}</button>})}
                          <button onClick={()=>setPage(p=>Math.min(totalPages-1,p+1))} disabled={page===totalPages-1} style={{padding:'5px 13px',borderRadius:8,border:`0.5px solid ${'var(--card-border)'}`,background:'var(--card)',fontSize:12,fontWeight:600,fontFamily:FONT,cursor:page===totalPages-1?'not-allowed':'pointer',opacity:page===totalPages-1?0.35:1,color:'var(--text)'}}>Next →</button>
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
