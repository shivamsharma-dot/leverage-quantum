import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'
import Sidebar from '../components/Sidebar'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts'
import { loadSummaryAnalysis } from '../lib/summaryData'

const FONT = "'Plus Jakarta Sans',-apple-system,sans-serif"
const C = { navy:'#1F3C84', blue:'#1C9FD4', green:'#4CAE6F', cyan:'#29B9C3', amber:'#F59E0B', red:'#EF4444', border:'#E5E7EB', text:'#0F172A', muted:'#94A3B8', bg:'#F4F6F9' }

function fmtN(n){ if(!n && n!==0) return '\u2014'; if(n>=1e7) return (n/1e7).toFixed(1)+'Cr'; if(n>=1e5) return (n/1e5).toFixed(1)+'L'; if(n>=1e3) return Math.round(n/1e3)+'K'; return Math.round(n).toLocaleString('en-IN') }
function fmtC(n){ if(!n && n!==0) return '\u2014'; if(n>=1e7) return '\u20b9'+(n/1e7).toFixed(2)+' Cr'; if(n>=1e5) return '\u20b9'+(n/1e5).toFixed(1)+'L'; if(n>=1e3) return '\u20b9'+Math.round(n/1e3)+'K'; return '\u20b9'+Math.round(n) }
function fmtShortDate(dateStr){ const d = new Date(dateStr+'T00:00:00'); return d.toLocaleDateString('en-IN',{ day:'numeric', month:'short' }) }
function fmtShortMonth(monthStr){ const parts = monthStr.split('-'); const d = new Date(parseInt(parts[0],10), parseInt(parts[1],10)-1, 1); return d.toLocaleDateString('en-IN',{ month:'short', year:'2-digit' }) }

// Countup hook -- only animates when real data arrives, shows placeholder until then
function useCountUp(target, duration=900) {
  const [val, setVal] = useState(null)
  useEffect(()=>{
    if(target === null || target === undefined) { setVal(null); return }
    if (target === 0) { setVal(0); return }
    let start=null
    let raf = null
    const step = ts => {
      if(!start) start=ts
      const progress=Math.min((ts-start)/duration,1)
      const ease=1-Math.pow(1-progress,3)
      setVal(Math.round(target*ease))
      if(progress<1) raf = requestAnimationFrame(step)
      else setVal(target)
    }
    raf = requestAnimationFrame(step)
    return () => { if (raf) cancelAnimationFrame(raf) }
  },[target,duration])
  return val
}

function Skeleton({ w='100%', h=20, r=6 }) {
  return <div style={{ width:w, height:h, borderRadius:r, background:'linear-gradient(90deg,#F0F2F5 25%,#E8EBF0 50%,#F0F2F5 75%)', backgroundSize:'200% 100%', animation:'shimmer 1.4s infinite' }}/>
}

function StatCard({ label, value, sub, loading, icon }) {
  const numVal = parseFloat((value||'').toString().replace(/[^0-9.]/g,''))||0
  const display = useCountUp(loading ? null : numVal, 900)
  const formatted = loading ? null : display === null ? '\u2014' : (value||'\u2014').toString().replace(/[\d.]+/, display.toString())
  return (
    <div style={{ background:'#fff', border:'0.5px solid '+C.border, borderRadius:12, padding:'16px 20px 14px', boxShadow:'0 1px 4px rgba(15,23,42,0.04)', fontFamily:FONT }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
        <div style={{ fontSize:10, fontWeight:700, color:C.muted, letterSpacing:'0.08em', textTransform:'uppercase' }}>{label}</div>
        <div style={{ width:20, height:20, display:'flex', alignItems:'center', justifyContent:'center', color:'#CBD5E1', opacity:0.7 }}>{icon}</div>
      </div>
      {loading ? <Skeleton h={28} r={6}/> : <div style={{ fontSize:26, fontWeight:800, color:C.text, letterSpacing:'-1px', lineHeight:1, marginBottom:6 }}>{formatted}</div>}
      {loading ? <div style={{ marginTop:6 }}><Skeleton w='60%' h={14} r={4}/></div> : sub && <div style={{ fontSize:11.5, color:C.muted, marginTop:0 }}>{sub}</div>}
    </div>
  )
}

function Delta({ pct }) {
  if (pct === null || pct === undefined || !isFinite(pct)) return null
  const up = pct >= 0
  const flat = Math.abs(pct) < 1.5
  const color = flat ? C.muted : up ? C.green : C.red
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:11.5, fontWeight:700, color:color, background:color+'16', padding:'2px 7px', borderRadius:20 }}>
      {flat ? '\u2013' : up ? '\u25b2' : '\u25bc'} {Math.abs(pct).toFixed(1)}%
    </span>
  )
}

function HeadlineStat({ label, value, deltaPct, deltaLabel, loading }) {
  return (
    <div style={{ flex:1, minWidth:120 }}>
      <div style={{ fontSize:10.5, fontWeight:700, color:C.muted, letterSpacing:'0.06em', textTransform:'uppercase', marginBottom:6 }}>{label}</div>
      {loading ? <Skeleton h={30} r={6}/> : (
        <div style={{ display:'flex', alignItems:'baseline', gap:8, flexWrap:'wrap' }}>
          <div style={{ fontSize:23, fontWeight:800, color:C.text, letterSpacing:'-0.02em' }}>{value}</div>
          <Delta pct={deltaPct}/>
        </div>
      )}
      {!loading && deltaLabel && <div style={{ fontSize:11, color:C.muted, marginTop:3 }}>{deltaLabel}</div>}
    </div>
  )
}

function ChartPanel({ title, data, xKey, yKey, color, valueFmt, chartType }) {
  const gid = 'g-' + title.replace(/[^a-zA-Z0-9]/g,'') + '-' + yKey
  const fmt = valueFmt || (v => v)
  return (
    <div style={{ flex:1, minWidth:0 }}>
      <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:8, textTransform:'uppercase', letterSpacing:'0.05em' }}>{title}</div>
      <div style={{ height:150 }}>
        <ResponsiveContainer width='100%' height='100%'>
          {chartType === 'bar' ? (
            <BarChart data={data} margin={{ top:6, right:4, left:-22, bottom:0 }}>
              <defs>
                <linearGradient id={gid} x1='0' y1='0' x2='0' y2='1'>
                  <stop offset='0%' stopColor={color} stopOpacity={0.95}/>
                  <stop offset='100%' stopColor={color} stopOpacity={0.55}/>
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke='#EEF1F5'/>
              <XAxis dataKey={xKey} tick={{ fontSize:10, fill:C.muted }} axisLine={false} tickLine={false} interval={data.length>10?1:0}/>
              <YAxis hide/>
              <Tooltip formatter={fmt} labelStyle={{ fontSize:11, fontWeight:700, color:C.text }} contentStyle={{ fontSize:11, borderRadius:10, border:'0.5px solid '+C.border, boxShadow:'0 4px 14px rgba(15,23,42,0.08)' }}/>
              <Bar dataKey={yKey} fill={'url(#'+gid+')'} radius={[5,5,0,0]} maxBarSize={26}/>
            </BarChart>
          ) : (
            <AreaChart data={data} margin={{ top:6, right:4, left:-22, bottom:0 }}>
              <defs>
                <linearGradient id={gid} x1='0' y1='0' x2='0' y2='1'>
                  <stop offset='0%' stopColor={color} stopOpacity={0.4}/>
                  <stop offset='100%' stopColor={color} stopOpacity={0.02}/>
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke='#EEF1F5'/>
              <XAxis dataKey={xKey} tick={{ fontSize:10, fill:C.muted }} axisLine={false} tickLine={false} interval={data.length>10?1:0}/>
              <YAxis hide/>
              <Tooltip formatter={fmt} labelStyle={{ fontSize:11, fontWeight:700, color:C.text }} contentStyle={{ fontSize:11, borderRadius:10, border:'0.5px solid '+C.border, boxShadow:'0 4px 14px rgba(15,23,42,0.08)' }}/>
              <Area type='monotone' dataKey={yKey} stroke={color} strokeWidth={2.5} fill={'url(#'+gid+')'}/>
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function SectionIcon({ id, color }) {
  const icons = {
    meta: <><path d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z'/></>,
    qlops: <><path d='M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2'/><circle cx='9' cy='7' r='4'/><path d='M23 21v-2a4 4 0 00-3-3.87'/><path d='M16 3.13a4 4 0 010 7.75'/></>,
    calendar: <><rect x='3' y='4' width='18' height='18' rx='2'/><line x1='16' y1='2' x2='16' y2='6'/><line x1='8' y1='2' x2='8' y2='6'/><line x1='3' y1='10' x2='21' y2='10'/></>,
    monthlyql: <><rect x='3' y='4' width='18' height='18' rx='2'/><line x1='16' y1='2' x2='16' y2='6'/><line x1='8' y1='2' x2='8' y2='6'/><line x1='3' y1='10' x2='21' y2='10'/><path d='M8 15l2.5 2.5L16 12'/></>,
  }
  return (
    <svg width='19' height='19' viewBox='0 0 24 24' fill='none' stroke={color} strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'>
      {icons[id]||icons.meta}
    </svg>
  )
}

function AnalysisSection({ icon, color, title, tagline, insight, stats, dod, mom, loading }) {
  return (
    <div className='qcard' style={{ background:'#fff', border:'0.5px solid '+C.border, borderRadius:18, padding:'22px 24px 22px', boxShadow:'0 2px 10px rgba(15,23,42,0.05)', marginBottom:18 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:40, height:40, borderRadius:12, background:color+'18', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <SectionIcon id={icon} color={color}/>
          </div>
          <div>
            <div style={{ fontSize:16.5, fontWeight:800, color:C.text, letterSpacing:'-0.01em' }}>{title}</div>
            <div style={{ fontSize:11.5, color:C.muted, marginTop:1 }}>{tagline}</div>
          </div>
        </div>
        <span style={{ display:'flex', alignItems:'center', gap:5, fontSize:10.5, fontWeight:700, color:C.green, background:C.green+'14', padding:'3px 10px', borderRadius:20 }}>
          <span style={{ width:5, height:5, borderRadius:'50%', background:C.green, animation:'pulse 2s infinite' }}/>LIVE
        </span>
      </div>

      <div style={{ display:'flex', gap:28, marginBottom:22, paddingBottom:20, borderBottom:'0.5px solid '+C.border, flexWrap:'wrap' }}>
        {stats.map((s,i) => <HeadlineStat key={i} {...s} loading={loading}/>)}
      </div>

      <div style={{ display:'flex', gap:28, marginBottom:20, flexWrap:'wrap' }}>
        <ChartPanel title={dod.title || 'Day on Day \u00b7 last 14 days'} data={dod.data} xKey='label' yKey={dod.key} color={color} valueFmt={dod.fmt} chartType={dod.type||'area'}/>
        <ChartPanel title={mom.title || 'Month on Month \u00b7 last 6 months'} data={mom.data} xKey='label' yKey={mom.key} color={color} valueFmt={mom.fmt} chartType={mom.type||'bar'}/>
      </div>

      <div style={{ display:'flex', gap:10, alignItems:'flex-start', background:color+'0C', border:'0.5px solid '+color+'22', borderRadius:12, padding:'12px 15px' }}>
        <svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke={color} strokeWidth='2' style={{ flexShrink:0, marginTop:2 }}><path d='M9 18h6M10 22h4M15 2a6 6 0 00-4 10.65V15h2v-2.35A6 6 0 0015 2z'/></svg>
        <div style={{ fontSize:12.5, color:C.text, lineHeight:1.55, fontFamily:FONT }}>{loading ? 'Crunching the latest numbers\u2026' : insight}</div>
      </div>
    </div>
  )
}

function metaAnalystLine(M) {
  if (!M.lastDay) return 'Meta Ads performance will appear here as soon as spend data starts flowing in for this account.'
  const sp = M.spendDeltaPct, ld = M.leadsDeltaPct
  const spendVerb = (sp === null || Math.abs(sp) < 3) ? 'held roughly flat' : sp > 0 ? ('climbed ' + Math.abs(sp).toFixed(0) + '% day-on-day') : ('eased ' + Math.abs(sp).toFixed(0) + '% day-on-day')
  const leadNote = (ld === null) ? '' : (Math.abs(ld) < 3) ? ', with lead volume holding steady' : ld > 0 ? (', and leads rose ' + Math.abs(ld).toFixed(0) + '% alongside it') : (', even as leads dipped ' + Math.abs(ld).toFixed(0) + '%')
  let read = 'Overall, performance is tracking within a normal band.'
  if (sp !== null && ld !== null && sp <= -3 && ld >= 0) read = 'A healthy sign of improving efficiency.'
  else if (sp !== null && ld !== null && sp >= 3 && ld < 0) read = "Worth a creative or audience refresh before spend scales further -- efficiency is slipping."
  return 'Spend ' + spendVerb + ' to ' + fmtC(M.lastDay.spend) + leadNote + '. ' + read
}

function qlAnalystLine(M) {
  if (!M.lastDay) return 'Qualified lead data will appear here once the QL Ops sheet starts reporting for this period.'
  const q = M.qlDeltaPct
  const qlVerb = (q === null || Math.abs(q) < 3) ? 'held roughly flat' : q > 0 ? ('climbed ' + Math.abs(q).toFixed(0) + '% day-on-day') : ('slipped ' + Math.abs(q).toFixed(0) + '% day-on-day')
  const share = M.futworkSharePct
  const mixNote = (share === null || share === undefined) ? '' : (' Futwork is driving ' + share.toFixed(0) + '% of this month\u2019s qualified volume, with Superbot contributing the remaining ' + (100-share).toFixed(0) + '%.')
  return 'Qualified leads ' + qlVerb + ' to ' + fmtN(M.lastDay.ql) + ' yesterday.' + mixNote
}

function monthlyQlAnalystLine(M) {
  const mq = M.monthlyQl
  if (!mq.cur.period) return 'Monthly QL trends will appear here once the Monthly QLs sheet has data for this period.'
  const d = mq.conversionDeltaPct
  const verb = (d === null || Math.abs(d) < 3) ? 'is tracking in line with' : d > 0 ? ('is running ' + Math.abs(d).toFixed(0) + '% above') : ('is running ' + Math.abs(d).toFixed(0) + '% below')
  const top = M.monthlyQlBySource[0]
  const sourceNote = top ? (' ' + top.source + ' is leading ' + mq.cur.period + ' with ' + fmtN(top.totalQL) + ' qualified leads.') : ''
  return mq.cur.period + ' queued-to-QL conversion is ' + mq.conversion.toFixed(1) + '%, which ' + verb + ' last month.' + sourceNote
}

function mtdAnalystLine(M) {
  if (!M.curMonthRow || !M.curMonthRow.ql) return 'CPL and CPQL trends will appear here once this month starts accumulating qualified leads.'
  const cur = M.mtdCPQL, prev = M.prevMonthCPQL, d = M.mtdCPQLDeltaPct
  const verb = (d === null || Math.abs(d) < 3) ? 'is tracking in line with' : d > 0 ? ('is running ' + Math.abs(d).toFixed(0) + '% above') : ('is running ' + Math.abs(d).toFixed(0) + '% below')
  let read = "last month's pace."
  if (d !== null && d <= -5) read = 'a meaningful improvement in lead quality economics this month.'
  else if (d !== null && d >= 15) read = 'a notable rise worth investigating by source and campaign.'
  const prevPart = prev ? ("last month's " + fmtC(prev)) : 'last month'
  return 'Blended CPQL this month is ' + fmtC(cur) + ', which ' + verb + ' ' + prevPart + ' -- ' + read
}

export default function DashboardHome() {
  const { user } = useAuth()
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(true)

  const firstName = (user?.name||'there').split(' ')[0]
  const greeting = (() => { const h=new Date().getHours(); return h<12?'Good morning':h<17?'Good afternoon':'Good evening' })()

  const load = useCallback(async (bust=false) => {
    setLoading(true)
    try {
      const data = await loadSummaryAnalysis(bust)
      setAnalysis(data)
    } catch(e) { console.error('DashboardHome load:', e) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const M = useMemo(() => {
    const dayRows = analysis?.dayRows || []
    const monthRows = analysis?.monthRows || []
    const todayStr = new Date().toISOString().slice(0,10)
    const completeDays = dayRows.filter(d => d.date < todayStr)
    const lastDay = completeDays[completeDays.length-1] || null
    const prevDay = completeDays[completeDays.length-2] || null
    const dod = completeDays.slice(-14).map(d => ({ ...d, label: fmtShortDate(d.date), cpql: d.ql ? d.spend/d.ql : 0, cpl: d.metaLeads ? d.spend/d.metaLeads : 0 }))
    const curMonthKey = todayStr.slice(0,7)
    const curMonthRow = monthRows.find(m => m.month === curMonthKey) || { spend:0, ql:0, futwork:0, superbot:0, metaLeads:0 }
    const prevMonthRow = monthRows.filter(m => m.month < curMonthKey).slice(-1)[0] || null
    const mom = monthRows.slice(-6).map(m => ({ ...m, label: fmtShortMonth(m.month), cpql: m.ql ? m.spend/m.ql : 0, cpl: m.metaLeads ? m.spend/m.metaLeads : 0 }))
    const pct = (cur, prev) => (prev ? ((cur-prev)/prev)*100 : null)
    const mtdCPQL = curMonthRow.ql ? curMonthRow.spend/curMonthRow.ql : 0
    const prevMonthCPQL = (prevMonthRow && prevMonthRow.ql) ? prevMonthRow.spend/prevMonthRow.ql : 0

    const mqPeriods = analysis?.monthlyQlPeriods || []
    const mqBySource = analysis?.monthlyQlBySource || []
    const mqCur = mqPeriods[mqPeriods.length-1] || { period:'', oppCount:0, floorQueued:0, totalQL:0 }
    const mqPrev = mqPeriods[mqPeriods.length-2] || null
    const mqConversion = mqCur.floorQueued ? (mqCur.totalQL/mqCur.floorQueued*100) : 0
    const mqPrevConversion = (mqPrev && mqPrev.floorQueued) ? (mqPrev.totalQL/mqPrev.floorQueued*100) : 0
    const mqMom = mqPeriods.slice(-6).map(r => ({ ...r, label: r.period, conversion: r.floorQueued ? (r.totalQL/r.floorQueued*100) : 0 }))
    const mqSourceChart = mqBySource.map(r => ({ ...r, label: r.source }))
    const monthlyQl = {
      cur: mqCur, prev: mqPrev, conversion: mqConversion, prevConversion: mqPrevConversion,
      conversionDeltaPct: mqPrevConversion ? pct(mqConversion, mqPrevConversion) : null,
      totalQLDeltaPct: (mqPrev && mqPrev.totalQL) ? pct(mqCur.totalQL, mqPrev.totalQL) : null,
      mom: mqMom, bySource: mqSourceChart,
    }

    return {
      lastDay, prevDay, dod, mom, curMonthRow, prevMonthRow, mtdCPQL, prevMonthCPQL, monthlyQl,
      spendDeltaPct: pct(lastDay?.spend||0, prevDay?.spend||0),
      leadsDeltaPct: pct(lastDay?.metaLeads||0, prevDay?.metaLeads||0),
      qlDeltaPct: pct(lastDay?.ql||0, prevDay?.ql||0),
      mtdCPQLDeltaPct: prevMonthCPQL ? pct(mtdCPQL, prevMonthCPQL) : null,
      futworkSharePct: curMonthRow.ql ? (curMonthRow.futwork/curMonthRow.ql*100) : null,
      monthlyQlBySource: mqBySource,
    }
  }, [analysis])

  return (
    <div className='lq-page-shell' style={{ display:'flex', height:'100vh', overflow:'hidden', background:C.bg, fontFamily:FONT }}>
      <style>{`
@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.35}}
.qcard{transition:all .2s cubic-bezier(0.4,0,0.2,1)!important}
.qcard:hover{box-shadow:0 8px 26px rgba(15,23,42,0.09)!important;border-color:#D1D9E8!important}
`}</style>
      <Sidebar/>
      <main style={{ flex:1, overflowY:'auto', overflowX:'hidden', padding:'28px 28px 40px' }}>

        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:26, animation:'fadeUp .4s ease' }}>
          <div>
            <p style={{ fontSize:11, color:C.muted, fontWeight:600, letterSpacing:'0.06em', textTransform:'uppercase', margin:'0 0 4px', fontFamily:FONT }}>HOME</p>
            <h1 style={{ fontSize:28, fontWeight:800, color:C.text, margin:0, letterSpacing:'-0.03em', fontFamily:FONT }}>{greeting}, {firstName} 👋</h1>
            <p style={{ fontSize:13.5, color:C.muted, margin:'4px 0 0', fontFamily:FONT }}>
              {analysis?.ts ? ('Last updated ' + new Date(analysis.ts).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})) : 'Loading live analysis\u2026'}
            </p>
          </div>
          <button onClick={() => load(true)} disabled={loading} title='Refresh data'
            style={{ paddingLeft:16, paddingRight:16, paddingTop:9, paddingBottom:9, borderRadius:10, border:'none', fontSize:12.5, fontWeight:700, fontFamily:FONT, background:'linear-gradient(135deg, #1F3C84, #1C9FD4)', color:'#fff', cursor: loading ? 'wait' : 'pointer', boxShadow:'0 4px 10px -3px rgba(31,60,132,0.5)', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Refreshing\u2026' : 'Refresh'}
          </button>
        </div>
        <div className='lq-kpi-grid' style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:28, animation:'fadeUp .4s ease .05s both' }}>
          <StatCard label='MTD Spend' value={fmtC(M.curMonthRow.spend||0)} sub='Meta Ads, month to date' loading={loading}
            icon={<svg width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'><circle cx='12' cy='12' r='10'/></svg>}/>
          <StatCard label='MTD Qualified Leads' value={fmtN(M.curMonthRow.ql||0)} sub={'Futwork '+fmtN(M.curMonthRow.futwork||0)+' \u00b7 Superbot '+fmtN(M.curMonthRow.superbot||0)} loading={loading}
            icon={<svg width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'><polyline points='20 6 9 17 4 12'/></svg>}/>
          <StatCard label='Blended CPQL (MTD)' value={fmtC(M.mtdCPQL||0)} sub={M.prevMonthCPQL ? ('vs '+fmtC(M.prevMonthCPQL)+' last month') : 'Cost per qualified lead'} loading={loading}
            icon={<svg width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'><line x1='12' y1='1' x2='12' y2='23'/><path d='M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6'/></svg>}/>
          <StatCard label="Yesterday's Meta Spend" value={fmtC(M.lastDay?.spend||0)} sub={M.spendDeltaPct!==null ? ((M.spendDeltaPct>=0?'+':'')+M.spendDeltaPct.toFixed(1)+'% vs day before') : 'Last complete day'} loading={loading}
            icon={<svg width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'><polyline points='22 12 18 12 15 21 9 3 6 12 2 12'/></svg>}/>
        </div>

        <div style={{ animation:'fadeUp .4s ease .1s both' }}>
          <AnalysisSection
            icon='meta' color={C.blue} title='Meta Ads' tagline='Spend, leads and click-through -- last day, day-on-day, month-on-month'
            insight={metaAnalystLine(M)} loading={loading}
            stats={[
              { label:'Yesterday Spend', value: fmtC(M.lastDay?.spend||0), deltaPct: M.spendDeltaPct, deltaLabel:'vs day before' },
              { label:'Yesterday Leads', value: fmtN(M.lastDay?.metaLeads||0), deltaPct: M.leadsDeltaPct, deltaLabel:'vs day before' },
              { label:'Yesterday CTR', value: (M.lastDay && M.lastDay.impressions ? ((M.lastDay.clicks/M.lastDay.impressions)*100).toFixed(2) : '0.00')+'%', deltaLabel:'Click-through rate' },
            ]}
            dod={{ data:M.dod, key:'spend', fmt:(v)=>fmtC(v), type:'area' }}
            mom={{ data:M.mom, key:'spend', fmt:(v)=>fmtC(v), type:'bar' }}
          />

          <AnalysisSection
            icon='qlops' color={C.green} title='QL Ops' tagline='Qualified lead volume by Futwork and Superbot -- last day, day-on-day, month-on-month'
            insight={qlAnalystLine(M)} loading={loading}
            stats={[
              { label:'Yesterday QLs', value: fmtN(M.lastDay?.ql||0), deltaPct: M.qlDeltaPct, deltaLabel:'vs day before' },
              { label:'Futwork (MTD)', value: fmtN(M.curMonthRow.futwork||0), deltaLabel: M.futworkSharePct!==null ? (M.futworkSharePct.toFixed(0)+'% of month total') : 'Month to date' },
              { label:'Superbot (MTD)', value: fmtN(M.curMonthRow.superbot||0), deltaLabel: M.futworkSharePct!==null ? ((100-M.futworkSharePct).toFixed(0)+'% of month total') : 'Month to date' },
            ]}
            dod={{ data:M.dod, key:'ql', fmt:(v)=>fmtN(v), type:'bar' }}
            mom={{ data:M.mom, key:'ql', fmt:(v)=>fmtN(v), type:'bar' }}
          />

          <AnalysisSection
            icon='calendar' color={C.navy} title='MTD Performance' tagline='Blended CPL and CPQL economics -- last day, day-on-day, month-on-month'
            insight={mtdAnalystLine(M)} loading={loading}
            stats={[
              { label:'MTD CPQL', value: fmtC(M.mtdCPQL||0), deltaPct: M.mtdCPQLDeltaPct, deltaLabel:'vs last month' },
              { label:'Yesterday CPQL', value: fmtC(M.lastDay && M.lastDay.ql ? M.lastDay.spend/M.lastDay.ql : 0), deltaLabel:'Spend / qualified leads' },
              { label:'Yesterday CPL', value: fmtC(M.lastDay && M.lastDay.metaLeads ? M.lastDay.spend/M.lastDay.metaLeads : 0), deltaLabel:'Spend / raw leads' },
            ]}
            dod={{ data:M.dod, key:'cpql', fmt:(v)=>fmtC(v), type:'area' }}
            mom={{ data:M.mom, key:'cpql', fmt:(v)=>fmtC(v), type:'bar' }}
          />

          <AnalysisSection
            icon='monthlyql' color={C.cyan} title='Monthly QLs' tagline='Queued-to-qualified conversion by source -- this month by source, month-on-month'
            insight={monthlyQlAnalystLine(M)} loading={loading}
            stats={[
              { label:(M.monthlyQl.cur.period||'This Month')+' Total QLs', value: fmtN(M.monthlyQl.cur.totalQL||0), deltaPct: M.monthlyQl.totalQLDeltaPct, deltaLabel:'vs last month' },
              { label:'Floor Queued (Month)', value: fmtN(M.monthlyQl.cur.floorQueued||0), deltaLabel:'Leads queued for qualification' },
              { label:'Queued → QL Conversion', value: M.monthlyQl.conversion.toFixed(1)+'%', deltaPct: M.monthlyQl.conversionDeltaPct, deltaLabel:'vs last month' },
            ]}
            dod={{ data:M.monthlyQl.bySource, key:'totalQL', fmt:(v)=>fmtN(v), type:'bar', title:(M.monthlyQl.cur.period||'This month')+' by source' }}
            mom={{ data:M.monthlyQl.mom, key:'totalQL', fmt:(v)=>fmtN(v), type:'bar', title:'Month on Month · last 6 months' }}
          />
        </div>
      </main>
    </div>
  )
}
