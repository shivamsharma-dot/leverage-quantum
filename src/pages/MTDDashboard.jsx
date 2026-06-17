import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList,
  PieChart, Pie, ComposedChart, Line, CartesianGrid, ReferenceLine } from 'recharts'
import Sidebar from '../components/Sidebar'
import ExportButton from '../components/ExportButton'

const SHEET_CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT58jwL_E0MSciEW_nyrHQMA-0DiFqUN3wstB9yTpfM3gdhK-ctxaODRuqtdxurFRJwmhvbzqS_9EuM/pub?output=csv'

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const isMonthHeader = v => v && MONTH_NAMES.some(m => v.startsWith(m)) && v.length < 25

const SRC_COLOR = {
  Facebook:'#1F3C84', Google:'#1C9FD4', 'Google MBBS':'#29B9C3', Affiliate:'#4CAE6F',
  Remarketing:'#29B9C3', Referral:'#0D9488', Bing:'#6B8FD4', Others:'#9CA3AF',
  Branding:'#6B7280', 'Content+Brand':'#EC4899', 'Lead Source NA':'#14B8A6',
  'Affiliate Partner':'#84CC16', Offline:'#374151'
}
const sc = src => SRC_COLOR[src] || '#9CA3AF'

function parseINR(v){ if(!v)return 0; return parseFloat(String(v).replace(/[^0-9.]/g,''))||0 }
function parsePct(v){ if(!v)return 0; return parseFloat(String(v).replace('%',''))||0 }
function parseNum(v){ if(!v)return 0; return parseInt(String(v).replace(/[^0-9]/g,''))||0 }
function fmtINR(n){
  if(!n||n===0)return '\u2014'
  if(n>=1e7)return '\u20B9'+(n/1e7).toFixed(2)+' Cr'
  return '\u20B9'+Math.round(n).toLocaleString('en-IN')
}
function fmtNum(n){
  if(!n||n===0)return '\u2014'
  if(n>=1e5)return (n/1e5).toFixed(1)+'L'
  if(n>=1e3)return (n/1e3).toFixed(1)+'K'
  return Math.round(n).toLocaleString('en-IN')
}
function delta(cur,prev){ if(!prev||prev===0)return null; return ((cur-prev)/prev*100) }

function parseCSV(csv){
  const LF = String.fromCharCode(10)
  const CR = String.fromCharCode(13)
  const rows = csv.replace(new RegExp(CR,'g'),'').split(LF).map(line => {
    const cols=[],buf=[];let inQ=false
    for(const ch of line){ if(ch==='"')inQ=!inQ;else if(ch===','&&!inQ){cols.push(buf.join('').trim());buf.length=0}else buf.push(ch) }
    cols.push(buf.join('').trim());return cols
  })
  const months=[];let i=0
  while(i<rows.length){
    if(isMonthHeader(rows[i][1])){
      const name=rows[i][1];i+=3;const sources=[]
      while(i<rows.length){ const src=rows[i][1]?.trim();if(!src){i++;break}
        const r=rows[i]
        sources.push({source:src,spend:parseINR(r[2]),leads:parseNum(r[3]),qFloor:parseNum(r[4]),
          fwQ:parseNum(r[5]),fwQual:parseNum(r[6]),fwQL:parsePct(r[7]),
          sbQ:parseNum(r[8]),sbQual:parseNum(r[9]),sbQL:parsePct(r[10]),
          apps:parseNum(r[11]),cpl:parseINR(r[12]),cpql:parseINR(r[13]),cpa:parseINR(r[14]),
          rau:parseFloat(String(r[15]).replace(/,/g,''))||0,
          srRev:parseINR(r[16]),acRev:parseINR(r[17]),vasRev:parseINR(r[18]),
          totalRev:parseINR(r[19]),roas:parseFloat(String(r[20]).replace(/,/g,''))||0})
        i++
      }
      if(sources.length>0)months.push({name,sources})
    }
    i++
  }
  return months
}

const ChartTip = ({active,payload,label,fmt})=>{
  if(!active||!payload?.length)return null
  return <div style={{background:'#fff',border:'0.5px solid #E5E7EB',borderRadius:8,padding:'8px 12px',fontSize:12,fontFamily:"'Plus Jakarta Sans','Inter',sans-serif",boxShadow:'0 4px 16px rgba(0,0,0,0.08)'}}>
    <div style={{fontWeight:600,color:'#111827',marginBottom:4}}>{label}</div>
    {payload.map((p,i)=><div key={i} style={{color:p.color||'#374151',marginTop:2}}><span style={{display:'inline-block',width:8,height:8,borderRadius:'50%',background:p.color,marginRight:5}}/>{p.name}: <b>{fmt?fmt(p.value):p.value}</b></div>)}
  </div>
}

const PieLbl = ({cx,cy,midAngle,outerRadius,percent,name})=>{
  if(percent<0.05)return null
  const RADIAN=Math.PI/180
  const r=outerRadius+24
  const x=cx+r*Math.cos(-midAngle*RADIAN)
  const y=cy+r*Math.sin(-midAngle*RADIAN)
  return <text x={x} y={y} textAnchor={x>cx?'start':'end'} dominantBaseline='central'
    style={{fontSize:10,fontWeight:600,fill:'#374151',fontFamily:"'Plus Jakarta Sans','Inter',sans-serif"}}>
    {name} {(percent*100).toFixed(0)}%
  </text>
}

const KPI=({label,value,sub,accent,prev,cur,invert,prorate})=>{
  const adjPrev = (prev!=null&&prorate&&prorate!==1)?prev*prorate:prev
  const d = (adjPrev!=null&&cur!=null)?delta(cur,adjPrev):null
  const good = d==null?null:(invert?d<=0:d>=0)
  return <div className='qkpi' style={{position:'relative',background:'linear-gradient(180deg,#FFFFFF 0%,#FBFCFE 100%)',border:'1px solid #EEF1F6',borderRadius:16,padding:'18px 20px 15px',boxShadow:'0 1px 2px rgba(15,23,42,0.04),0 4px 14px -6px rgba(15,23,42,0.08)',overflow:'hidden',transition:'transform .18s ease,box-shadow .18s ease'}}>
    <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,${accent||'#1F3C84'},#1C9FD4 55%,#29B9C3)`}}/>
    <div style={{fontSize:10,fontWeight:700,color:'#94A3B8',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:8}}>{label}</div>
    <div style={{fontSize:26,fontWeight:800,color:'#0F172A',letterSpacing:'-1px',lineHeight:1,marginBottom:6}}>{value}</div>
    <div style={{display:'flex',alignItems:'center',gap:8,minHeight:18}}>
      {sub&&<div style={{fontSize:11.5,color:'#94A3B8',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{sub}</div>}
      {d!=null&&<span style={{fontSize:10.5,fontWeight:700,color:good?'#1F8F5B':'#64748B',flexShrink:0}}>
        {d>=0?'\u25B2':'\u25BC'}{Math.abs(d).toFixed(1)}%
      </span>}
    </div>
  </div>
}

const Card=({title,sub,children,action})=>(
  <div style={{background:'#fff',border:'1px solid #EEF1F6',borderRadius:16,overflow:'hidden',boxShadow:'0 1px 2px rgba(15,23,42,0.04),0 8px 24px -12px rgba(15,23,42,0.10)'}}>
    <div style={{padding:'15px 20px 13px',borderBottom:'1px solid #F1F4F8',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
      <div><div style={{fontSize:13.5,fontWeight:700,color:'#1F3C84',letterSpacing:'-0.01em'}}>{title}</div>{sub&&<div style={{fontSize:11,color:'#94A3B8',marginTop:3}}>{sub}</div>}</div>
      {action}
    </div>
    <div style={{padding:'16px 18px'}}>{children}</div>
  </div>
)


function Dropdown({options,value,onChange,minWidth=120}){
  const [open,setOpen]=React.useState(false)
  const ref=React.useRef(null)
  React.useEffect(()=>{
    const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false)}
    document.addEventListener('mousedown',h);return()=>document.removeEventListener('mousedown',h)
  },[])
  const C2={navy:'#1F3C84',border:'#E5E7EB',navyBg:'#E8EFF9',text:'#0F172A',muted:'#94A3B8'}
  const FONT2="'Plus Jakarta Sans',sans-serif"
  return(
    <div style={{position:'relative'}} ref={ref}>
      <button onClick={()=>setOpen(v=>!v)} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 11px 7px 13px',borderRadius:9,border:`0.5px solid ${open?C2.navy:C2.border}`,background:open?C2.navyBg:'#fff',color:C2.text,cursor:'pointer',fontFamily:FONT2,fontSize:12,fontWeight:600,minWidth,boxShadow:open?`0 0 0 3px rgba(31,60,132,0.09)`:'0 1px 3px rgba(15,23,42,0.06)',transition:'all .15s',whiteSpace:'nowrap'}}>
        <span style={{flex:1,textAlign:'left'}}>{(options.find(o=>(o.value??o)===value)?.label)??value}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{flexShrink:0,transition:'transform .2s',transform:open?'rotate(180deg)':'rotate(0deg)'}}>
          <path d="M1 1l4 4 4-4" stroke={C2.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open&&<div style={{position:'absolute',top:'calc(100% + 6px)',left:0,zIndex:500,background:'#fff',border:`0.5px solid ${C2.border}`,borderRadius:12,boxShadow:'0 16px 48px rgba(15,23,42,0.14)',padding:'6px',minWidth:Math.max(minWidth,160),maxHeight:300,overflowY:'auto',scrollbarWidth:'none'}}>
        {options.map(opt=>(
          <button key={opt.value??opt} onClick={()=>{onChange(opt.value??opt);setOpen(false)}} style={{display:'block',width:'100%',textAlign:'left',padding:'8px 12px',borderRadius:8,border:'none',cursor:'pointer',fontFamily:FONT2,fontSize:12.5,fontWeight:(opt.value??opt)===value?700:400,background:(opt.value??opt)===value?C2.navyBg:'transparent',color:(opt.value??opt)===value?C2.navy:C2.text,transition:'background .1s'}}
            onMouseEnter={e=>{if((opt.value??opt)!==value)e.currentTarget.style.background='#F8FAFC'}}
            onMouseLeave={e=>{if((opt.value??opt)!==value)e.currentTarget.style.background='transparent'}}>
            {opt.label??opt}
          </button>
        ))}
      </div>}
    </div>
  )
}


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

export default function MTDDashboard(){
  const [months,setMonths]=useState([])
  const [sel,setSel]=useState(0)
  const [loading,setLoading]=useState(true)
  const [showInfo,setShowInfo]=useState(false)
  const [compare,setCompare]=useState(false)
  const [error,setError]=useState(null)
  const [lastSync,setLastSync]=useState(null)
  const hasSetInitial=useRef(false)

  const loadData=useCallback(async()=>{
    setLoading(true)
    const _t0=Date.now()
    try{
      const res=await fetch(SHEET_CSV+'&_=' + Date.now())
      const csv=await res.text()
      const p=parseCSV(csv)
      setMonths(p)
      if(!hasSetInitial.current){setSel(p.length-1);hasSetInitial.current=true}
      setLastSync(new Date())
      setError(null)
    }catch(e){setError('Failed: '+e.message)}
    finally{const _w=Math.max(0,750-(Date.now()-_t0));setTimeout(()=>setLoading(false),_w)}
  },[])

  useEffect(()=>{loadData()},[loadData])
  useEffect(()=>{const t=setInterval(loadData,60000);return()=>clearInterval(t)},[loadData])

  const month=months[sel]
  const prevMonth=months[sel-1]
  const total=month?.sources.find(s=>s.source==='Total')
  const prevTotal=prevMonth?.sources.find(s=>s.source==='Total')
  // Running-average proration: for the ongoing month, compare per-day run-rate vs last month's daily average
  const _now=new Date()
  const _parseM=nm=>{ if(!nm)return null; const ps=String(nm).trim().split(/\s+/); const mi=MONTH_NAMES.indexOf(ps[0]); const yr=parseInt((ps.find(p=>/^[0-9]{4}$/.test(p))||'')); return (mi>=0&&yr)?{mi,yr}:null }
  const _selM=_parseM(month?.name)
  const isCurrentMonth=!!_selM&&_selM.mi===_now.getMonth()&&_selM.yr===_now.getFullYear()
  const _dim=(mi,yr)=>new Date(yr,mi+1,0).getDate()
  const daysElapsed=_selM?(isCurrentMonth?_now.getDate():_dim(_selM.mi,_selM.yr)):0
  const _prevM=_parseM(prevMonth?.name)
  const _prevDays=_prevM?_dim(_prevM.mi,_prevM.yr):0
  const prorate=(isCurrentMonth&&_prevDays>0&&daysElapsed>0)?(daysElapsed/_prevDays):1
  const srcs=month?.sources.filter(s=>s.source!=='Total'&&(s.spend>0||s.leads>0))||[]

  const spendPie=useMemo(()=>srcs.filter(s=>s.spend>0).map(s=>({name:s.source,value:Math.round(s.spend)})),[srcs])
  const cplBar=useMemo(()=>[...srcs].filter(s=>s.cpl>0).sort((a,b)=>a.cpl-b.cpl).map(s=>({name:s.source,cpl:s.cpl,color:sc(s.source)})),[srcs])
  const revStack=useMemo(()=>srcs.filter(s=>s.totalRev>0).map(s=>({name:s.source,SR:+(s.srRev/100000).toFixed(1),AC:+(s.acRev/100000).toFixed(1),VAS:+(s.vasRev/100000).toFixed(1)})),[srcs])
  const avgCPL=useMemo(()=>{ const a=srcs.filter(s=>s.cpl>0); return a.length?Math.round(a.reduce((t,s)=>t+s.cpl,0)/a.length):0 },[srcs])

  const fmt=new Intl.DateTimeFormat('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'})
  const cplColor=v=>v>500?'#64748B':v>250?'#1C9FD4':'#1F8F5B'
  const roasColor=v=>v>=3?'#1F8F5B':v>=1.5?'#1C9FD4':'#64748B'
  const qlColor=v=>v>15?'#1F8F5B':v>5?'#1C9FD4':'#64748B'
  const maxSpend=srcs.length?Math.max(...srcs.map(s=>s.spend)):1

  if(loading)return <div style={{display:'flex',height:'100vh',background:'#F4F6F9'}}><Sidebar/><div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'#94A3B8',fontSize:14,fontFamily:"'Plus Jakarta Sans','Inter',sans-serif"}}>Loading from Google Sheets...</div></div>
  if(error)return <div style={{display:'flex',height:'100vh',background:'#F4F6F9'}}><Sidebar/><div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'#64748B',fontSize:14}}>{error}</div></div>

  return(
    <div style={{display:'flex',height:'100vh',overflow:'hidden',background:'#F4F6F9',fontFamily:"'Plus Jakarta Sans','Inter',sans-serif"}}>
      <Sidebar/>
      <style>{`.qkpi:hover{transform:translateY(-3px);box-shadow:0 2px 4px rgba(15,23,42,0.05),0 16px 32px -14px rgba(31,60,132,0.22)!important}`}</style>
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minWidth:0}}>

        <div style={{background:'#fff',borderBottom:'0.5px solid #E5E7EB',padding:'0 28px',height:56,display:'flex',alignItems:'center',gap:12,flexShrink:0}}>
          <div style={{flex:1}}>
            <div style={{fontSize:10.5,color:'#94A3B8',letterSpacing:'0.05em',textTransform:'uppercase',margin:'0 0 2px',fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Dashboards / MTD</div>
            <div style={{fontSize:17,fontWeight:800,color:'#0F172A',letterSpacing:'-0.4px',lineHeight:1.1,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>MTD Performance {month?.name||''}</div>
          </div>
          {months.length>1&&<div style={{fontSize:11,color:'#94A3B8',background:'#F1F5F9',padding:'3px 10px',borderRadius:6}}>
            {prevMonth?'vs '+prevMonth.name:'First month'}
          </div>}
          {months.length>0&&<Dropdown
            options={months.map((m,i)=>({label:m.name,value:i}))}
            value={sel}
            onChange={v=>setSel(Number(v))}
            minWidth={130}
          />}
          <div style={{fontSize:11,color:'#94A3B8',borderLeft:'0.5px solid #E5E7EB',paddingLeft:14}}>{lastSync?'Synced '+fmt.format(lastSync):''}</div>
          <button onClick={loadData} disabled={loading} className="lqRefreshBtn" style={{padding:'6px 14px',borderRadius:8,border:'0.5px solid #E5E7EB',fontSize:12,fontWeight:500,cursor:loading?'wait':'pointer',fontFamily:'inherit',background:'#fff',color:'#374151',display:'flex',alignItems:'center',gap:6,opacity:loading?0.65:1,transition:'opacity .15s ease'}}>
            <svg width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round' style={{animation:loading?'spin .8s linear infinite':'none'}}><polyline points='23 4 23 10 17 10'/><path d='M20.49 15a9 9 0 1 1-2.12-9.36L23 10'/></svg>{loading?'Refreshing':'Refresh'}
          </button>
          <ExportButton data={srcs} filename='mtd-by-source'/>
          <button onClick={()=>setCompare(v=>!v)} title='Split view: Meta vs Google by source' style={{padding:'6px 12px',borderRadius:8,border:'0.5px solid '+(compare?'#1C9FD4':'#E5E7EB'),fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',background:compare?'#E3F5FD':'#fff',color:compare?'#1C9FD4':'#374151',display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
            <svg width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round'><rect x='3' y='3' width='8' height='18' rx='1'/><rect x='13' y='3' width='8' height='18' rx='1'/></svg>
            Compare
          </button>
          <div style={{position:'relative'}}>
            <button onClick={()=>setShowInfo(v=>!v)} title='How these metrics are calculated' style={{width:30,height:30,borderRadius:8,border:'0.5px solid #E5E7EB',background:showInfo?'#E8EFF9':'#fff',color:'#1F3C84',fontSize:14,fontWeight:700,fontStyle:'italic',fontFamily:'Georgia,serif',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>i</button>
            {showInfo&&<div onClick={()=>setShowInfo(false)} style={{position:'fixed',inset:0,zIndex:150}}/>}
            {showInfo&&<div style={{position:'absolute',right:0,top:'calc(100% + 8px)',zIndex:200,width:384,maxHeight:'74vh',overflowY:'auto',background:'#fff',border:'0.5px solid #E5E7EB',borderRadius:12,boxShadow:'0 14px 40px rgba(15,23,42,0.16)',padding:'16px 18px',textAlign:'left',fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
              <div style={{fontSize:13,fontWeight:700,color:'#0F172A',marginBottom:3}}>How these metrics are calculated</div>
              <div style={{fontSize:11,color:'#94A3B8',marginBottom:10}}>Selected month vs previous month. Every figure aggregates all sources.</div>
              {[
                ['Total Spend','Sum of ad spend across all sources for the month.'],
                ['Total Leads','Sum of leads generated across all sources.'],
                ['CPL','Total spend \u00F7 total leads (cost per lead).'],
                ['Total Revenue','Sum of SR + AC + VAS revenue across sources.'],
                ['ROAS','Total revenue \u00F7 total spend.'],
                ['FW Qualified','Futwork-qualified leads. FW QL% = qualified \u00F7 queued.'],
                ['SB Qualified','Salesbridge-qualified leads. SB QL% = qualified \u00F7 queued.'],
                ['Applications','Total applications submitted across sources.'],
                ['CPQL','Total spend \u00F7 qualified leads (cost per qualified lead).'],
                ['Est. RAU','Estimated revenue attribution units for the month.'],
              ].map(([m,d])=>(
                <div key={m} style={{display:'flex',gap:10,padding:'7px 0',borderTop:'0.5px solid #F3F4F6'}}>
                  <div style={{fontSize:11.5,fontWeight:700,color:'#1F3C84',width:96,flexShrink:0}}>{m}</div>
                  <div style={{fontSize:11.5,color:'#475569',lineHeight:1.45}}>{d}</div>
                </div>
              ))}
              <div style={{marginTop:11,padding:'10px 12px',background:'#E8EFF9',borderRadius:8,fontSize:11,color:'#1F3C84',lineHeight:1.5}}>
                <b>Change vs last month:</b> for the ongoing month{isCurrentMonth?' ('+daysElapsed+' day'+(daysElapsed===1?'':'s')+' so far)':''}, Leads, Revenue, FW Qualified, Applications and Est. RAU compare this month's per-day run-rate against last month's daily average, so a partial month is not shown as falsely down. Cost and ratio metrics (CPL, CPQL, ROAS, Spend) compare full totals.
              </div>
            </div>}
          </div>
        </div>

        <div style={{flex:1,overflowY:'auto',padding:'18px 24px'}}>
          {total&&(<>

            <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:12,marginBottom:12}}>
              <KPI label='Total Spend' value={fmtINR(total.spend)} accent='#1F3C84' sub={prevTotal?'prev '+fmtINR(prevTotal.spend):undefined} cur={total.spend} prev={prevTotal?.spend} invert/>
              <KPI label='Total Leads' value={fmtNum(total.leads)} accent='#1C9FD4' sub={prevTotal?'prev '+fmtNum(prevTotal.leads):undefined} cur={total.leads} prev={prevTotal?.leads} prorate={prorate}/>
              <KPI label='CPL' value={fmtINR(total.cpl)} accent='#1C9FD4' sub='Cost per lead' cur={total.cpl} prev={prevTotal?.cpl} invert/>
              <KPI label='Total Revenue' value={fmtINR(total.totalRev)} accent='#4CAE6F' sub={prevTotal?'prev '+fmtINR(prevTotal.totalRev):undefined} cur={total.totalRev} prev={prevTotal?.totalRev} prorate={prorate}/>
              <KPI label='ROAS' value={total.roas>0?total.roas.toFixed(2)+'x':'\u2014'} accent={roasColor(total.roas)} cur={total.roas} prev={prevTotal?.roas}/>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:12,marginBottom:22}}>
              <KPI label='FW Qualified' value={fmtNum(total.fwQual)} accent='#1F3C84' sub={'of '+fmtNum(total.fwQ)+' queued'} cur={total.fwQual} prev={prevTotal?.fwQual} prorate={prorate}/>
              <KPI label='FW QL%' value={total.fwQL.toFixed(2)+'%'} accent='#1C9FD4' sub='Futwork quality' cur={total.fwQL} prev={prevTotal?.fwQL}/>
              <KPI label='SB Qualified' value={fmtNum(total.sbQual)} accent='#29B9C3' sub={total.sbQL.toFixed(2)+'% QL'} cur={total.sbQual} prev={prevTotal?.sbQual}/>
              <KPI label='Applications' value={fmtNum(total.apps)} accent='#4CAE6F' sub={prevTotal?'prev '+fmtNum(prevTotal.apps):undefined} cur={total.apps} prev={prevTotal?.apps} prorate={prorate}/>
              <KPI label='Est. RAU' value={total.rau>0?total.rau.toFixed(1):'\u2014'} accent='#29B9C3' sub='Revenue attr. units' cur={total.rau} prev={prevTotal?.rau} prorate={prorate}/>
              <KPI label='CPQL' value={fmtINR(total.cpql)} accent='#29B9C3' sub='Cost per qual. lead' cur={total.cpql} prev={prevTotal?.cpql} invert/>
            </div>

            {compare&&(()=>{
              const meta=srcs.find(s=>s.source==='Facebook')||srcs.find(s=>/meta|facebook/i.test(s.source))
              const goog=srcs.find(s=>s.source==='Google')||srcs.find(s=>/google/i.test(s.source))
              const pct=v=>(v||0).toFixed(2)+'%'
              const xx=v=>v>0?v.toFixed(2)+'x':'\u2014'
              const rows=[
                ['Spend',meta?fmtINR(meta.spend):'\u2014',goog?fmtINR(goog.spend):'\u2014'],
                ['Leads',meta?fmtNum(meta.leads):'\u2014',goog?fmtNum(goog.leads):'\u2014'],
                ['CPL',meta?fmtINR(meta.cpl):'\u2014',goog?fmtINR(goog.cpl):'\u2014'],
                ['FW Qualified',meta?fmtNum(meta.fwQual):'\u2014',goog?fmtNum(goog.fwQual):'\u2014'],
                ['FW QL%',meta?pct(meta.fwQL):'\u2014',goog?pct(goog.fwQL):'\u2014'],
                ['Applications',meta?fmtNum(meta.apps):'\u2014',goog?fmtNum(goog.apps):'\u2014'],
                ['CPQL',meta?fmtINR(meta.cpql):'\u2014',goog?fmtINR(goog.cpql):'\u2014'],
                ['Revenue',meta?fmtINR(meta.totalRev):'\u2014',goog?fmtINR(goog.totalRev):'\u2014'],
                ['ROAS',meta?xx(meta.roas):'\u2014',goog?xx(goog.roas):'\u2014'],
              ]
              return <div style={{marginBottom:14}}><Card title='Meta vs Google \u00B7 source split' sub='Side-by-side comparison for the selected month'>
                <div style={{padding:'6px 14px 14px'}}>
                  <div style={{display:'grid',gridTemplateColumns:'1.1fr 1fr 1fr',padding:'9px 12px',borderBottom:'0.5px solid #E5E7EB'}}>
                    <div style={{fontSize:10.5,fontWeight:700,color:'#94A3B8',letterSpacing:'0.06em',textTransform:'uppercase'}}>Metric</div>
                    <div style={{fontSize:12,fontWeight:700,color:'#1F3C84',textAlign:'right'}}>Meta (Facebook)</div>
                    <div style={{fontSize:12,fontWeight:700,color:'#1C9FD4',textAlign:'right'}}>Google</div>
                  </div>
                  {rows.map((r,idx)=>(<div key={r[0]} style={{display:'grid',gridTemplateColumns:'1.1fr 1fr 1fr',alignItems:'center',padding:'9px 12px',background:idx%2?'#FAFBFC':'#fff'}}>
                    <div style={{fontSize:12,color:'#475569',fontWeight:500}}>{r[0]}</div>
                    <div style={{fontSize:13,fontWeight:700,color:'#0F172A',textAlign:'right'}}>{r[1]}</div>
                    <div style={{fontSize:13,fontWeight:700,color:'#0F172A',textAlign:'right'}}>{r[2]}</div>
                  </div>))}
                </div>
              </Card></div>
            })()}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1.2fr',gap:14,marginBottom:14}}>

              <Card title='Spend by source' sub='Share of total ad spend'>
                <ResponsiveContainer width='100%' height={240}>
                  <PieChart>
                    <Pie data={spendPie} cx='50%' cy='50%' innerRadius={55} outerRadius={85} isAnimationActive={false}
                      dataKey='value' labelLine={false} label={PieLbl}>
                      {spendPie.map((e,i)=><Cell key={i} fill={sc(e.name)}/>)}
                    </Pie>
                    <Tooltip content={<BrandTooltip fmt={v=>fmtINR(v)}/>}/>
                  </PieChart>
                </ResponsiveContainer>
                <div style={{display:'flex',flexWrap:'wrap',gap:'6px 14px',marginTop:8}}>
                  {spendPie.slice(0,6).map(s=><div key={s.name} style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'#374151'}}><span style={{width:8,height:8,borderRadius:'50%',background:sc(s.name),display:'inline-block',flexShrink:0}}/>{s.name}</div>)}
                </div>
              </Card>

              <Card title='CPL by source' sub={'Avg \u20B9'+avgCPL+' across channels'}>
                <ResponsiveContainer width='100%' height={280}>
                  <ComposedChart data={cplBar} margin={{top:20,right:16,left:0,bottom:40}}>
                    <CartesianGrid strokeDasharray='3 3' stroke='#F1F5F9' vertical={false}/>
                    <XAxis dataKey='name' tick={{fontSize:10,fill:'#6B7280'}} angle={-35} textAnchor='end' interval={0} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fontSize:10,fill:'#6B7280'}} axisLine={false} tickLine={false} tickFormatter={v=>('\u20B9'+(v>=1000?(v/1000).toFixed(0)+'K':v))}/>
                    <Tooltip content={<BrandTooltip fmt={v=>fmtINR(v)}/>}/>
                    <ReferenceLine y={avgCPL} stroke='#94A3B8' strokeDasharray='4 4' label={{value:'Avg',position:'right',fill:'#94A3B8',fontSize:10}}/>
                    <Bar dataKey='cpl' name='CPL' radius={[5,5,0,0]} maxBarSize={36}>
                      <LabelList dataKey='cpl' position='top' formatter={v=>fmtINR(v)} style={{fontSize:9,fontWeight:600,fill:'#374151'}}/>
                      {cplBar.map((e,i)=><Cell key={i} fill={e.cpl>avgCPL?'#94A3B8':'#4CAE6F'}/>)}
                    </Bar>
                  </ComposedChart>
                </ResponsiveContainer>
                <div style={{display:'flex',gap:14,marginTop:4,fontSize:11}}>
                  <span style={{display:'flex',alignItems:'center',gap:4,color:'#374151'}}><span style={{width:10,height:3,background:'#4CAE6F',display:'inline-block'}}/> Below avg</span>
                  <span style={{display:'flex',alignItems:'center',gap:4,color:'#374151'}}><span style={{width:10,height:3,background:'#94A3B8',display:'inline-block'}}/> Above avg</span>
                  <span style={{display:'flex',alignItems:'center',gap:4,color:'#374151'}}><span style={{width:10,height:2,background:'#94A3B8',display:'inline-block'}}/> Average</span>
                </div>
              </Card>

              <Card title='Revenue breakdown' sub='SR vs AC vs VAS by channel - in Lakhs'>
                <ResponsiveContainer width='100%' height={280}>
                  <BarChart data={revStack} margin={{top:16,right:16,left:0,bottom:40}}>
                    <CartesianGrid strokeDasharray='3 3' stroke='#F1F5F9' vertical={false}/>
                    <XAxis dataKey='name' tick={{fontSize:10,fill:'#6B7280'}} angle={-35} textAnchor='end' interval={0} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fontSize:10,fill:'#6B7280'}} axisLine={false} tickLine={false} tickFormatter={v=>v===0?'\u20B9'+'0':v>=100?'\u20B9'+(v/100).toFixed(1)+'Cr':'\u20B9'+v+'L'}/>
                    <Tooltip content={<BrandTooltip fmt={v=>v>=100?'\u20B9'+(v/100).toFixed(2)+' Cr':'\u20B9'+v+'L'}/>}/>
                    
                    <Bar dataKey='SR' name='SR Revenue' stackId='r' fill='#1F3C84' radius={[6,6,0,0]}/>
                    <Bar dataKey='AC' name='AC Revenue' stackId='r' fill='#1C9FD4' radius={[6,6,0,0]}/>
                    <Bar dataKey='VAS' name='VAS Revenue' stackId='r' fill='#4CAE6F' radius={[4,4,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
                <div style={{display:'flex',gap:16,justifyContent:'center',marginTop:8,fontSize:11,color:'#374151'}}>
                      <span style={{display:'flex',alignItems:'center',gap:5}}><span style={{width:10,height:10,borderRadius:2,background:'#1F3C84',display:'inline-block'}}/> SR Revenue</span>
                      <span style={{display:'flex',alignItems:'center',gap:5}}><span style={{width:10,height:10,borderRadius:2,background:'#1C9FD4',display:'inline-block'}}/> AC Revenue</span>
                      <span style={{display:'flex',alignItems:'center',gap:5}}><span style={{width:10,height:10,borderRadius:2,background:'#4CAE6F',display:'inline-block'}}/> VAS Revenue</span>
                    </div>
              </Card>

            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>

              <Card title='Lead quality funnel' sub='Volume at each stage'>
                <div style={{display:'flex',flexDirection:'column',gap:8,padding:'4px 0'}}>
                  {[
                    {label:'Total Leads (OPPs)',value:total.leads,color:'#1F3C84'},
                    {label:'Futwork Queued',value:total.fwQ,color:'#1C9FD4'},
                    {label:'FW Qualified',value:total.fwQual,color:'#29B9C3'},
                    {label:'Applications (STUs)',value:total.apps,color:'#4CAE6F'},
                  ].map((step,i,arr)=>{
                    const pct=arr[0].value>0?(step.value/arr[0].value*100):0
                    const prev=i>0?arr[i-1].value:step.value
                    const conv=prev>0?(step.value/prev*100):0
                    return <div key={step.label}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                        <span style={{fontSize:12,fontWeight:500,color:'#374151'}}>{step.label}</span>
                        <div style={{display:'flex',gap:8,alignItems:'center'}}>
                          {i>0&&<span style={{fontSize:10,color:'#94A3B8'}}>{conv.toFixed(1)}% conv.</span>}
                          <span style={{fontSize:13,fontWeight:700,color:step.color}}>{fmtNum(step.value)}</span>
                        </div>
                      </div>
                      <div style={{height:10,background:'#F3F4F6',borderRadius:5,overflow:'hidden'}}>
                        <div style={{height:'100%',width:pct+'%',background:step.color,borderRadius:5,transition:'width 0.6s ease'}}/>
                      </div>
                    </div>
                  })}
                </div>
              </Card>

              <Card title='QL% by source' sub='Futwork qualification rate per channel'>
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  {[...srcs].filter(s=>s.fwQL>0).sort((a,b)=>b.fwQL-a.fwQL).map(s=>(
                    <div key={s.source} style={{display:'flex',alignItems:'center',gap:10}}>
                      <div style={{display:'flex',alignItems:'center',gap:6,width:140,flexShrink:0}}>
                        <span style={{width:7,height:7,borderRadius:'50%',background:sc(s.source),flexShrink:0,display:'inline-block'}}/>
                        <span style={{fontSize:12,color:'#374151',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{s.source}</span>
                      </div>
                      <div style={{flex:1,height:8,background:'#F3F4F6',borderRadius:4,overflow:'hidden'}}>
                        <div style={{height:'100%',width:Math.min(s.fwQL,30)/30*100+'%',background:qlColor(s.fwQL),borderRadius:4}}/>
                      </div>
                      <span style={{fontSize:12,fontWeight:700,color:qlColor(s.fwQL),width:44,textAlign:'right',flexShrink:0}}>{s.fwQL.toFixed(1)}%</span>
                      <span style={{fontSize:10,color:'#94A3B8',width:36,textAlign:'right',flexShrink:0}}>{fmtNum(s.fwQual)}</span>
                    </div>
                  ))}
                </div>
              </Card>

            </div>

            <Card title='Source breakdown' sub={month.name+' · All channels'} action={<span style={{fontSize:11,color:'#94A3B8'}}>{srcs.length} sources</span>}>
              <div style={{overflowX:'auto',margin:'-4px -4px 0'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontFamily:"'Plus Jakarta Sans','Inter',sans-serif"}}>
                  <thead><tr style={{borderBottom:'0.5px solid #E5E7EB'}}>
                    {['Source','Spend','Spend%','Leads','CPL','FW Qual','FW QL%','SB Qual','APPs','CPQL','Revenue','ROAS'].map(h=>(
                      <th key={h} style={{padding:'8px 10px',fontWeight:600,color:'#6B7280',textAlign:h==='Source'?'left':'right',whiteSpace:'nowrap',fontSize:10.5,background:'#F9FAFB'}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {[...srcs].sort((a,b)=>b.spend-a.spend).map((s,i)=>{
                      const spendPct=maxSpend>0?(s.spend/maxSpend*100):0
                      const spendShare=total.spend>0?(s.spend/total.spend*100):0
                      return <tr key={s.source} style={{borderBottom:'0.5px solid #F3F4F6'}}>
                        <td style={{padding:'9px 10px',minWidth:130}}>
                          <div style={{display:'flex',alignItems:'center',gap:7}}>
                            <span style={{width:8,height:8,borderRadius:'50%',background:sc(s.source),display:'inline-block',flexShrink:0}}/>
                            <span style={{fontWeight:600,color:'#111827',fontSize:12.5}}>{s.source}</span>
                          </div>
                        </td>
                        <td style={{padding:'9px 10px',textAlign:'right',fontWeight:600,color:'#111827',fontSize:12.5,whiteSpace:'nowrap'}}>{fmtINR(s.spend)}</td>
                        <td style={{padding:'9px 10px',minWidth:90}}>
                          <div style={{display:'flex',alignItems:'center',gap:6}}>
                            <div style={{flex:1,height:5,background:'#F3F4F6',borderRadius:3,overflow:'hidden'}}><div style={{height:'100%',width:spendPct+'%',background:sc(s.source),borderRadius:3}}/></div>
                            <span style={{fontSize:10.5,color:'#6B7280',width:32,textAlign:'right',flexShrink:0}}>{spendShare.toFixed(0)}%</span>
                          </div>
                        </td>
                        <td style={{padding:'9px 10px',textAlign:'right',color:'#374151',fontSize:12.5}}>{fmtNum(s.leads)}</td>
                        <td style={{padding:'9px 10px',textAlign:'right',fontWeight:600,color:cplColor(s.cpl),fontSize:12.5,whiteSpace:'nowrap'}}>{fmtINR(s.cpl)}</td>
                        <td style={{padding:'9px 10px',textAlign:'right',color:'#374151',fontSize:12.5}}>{fmtNum(s.fwQual)}</td>
                        <td style={{padding:'9px 10px',textAlign:'right',fontSize:12.5}}><span style={{background:s.fwQL>15?'#E8F6EF':s.fwQL>5?'#E7F4FB':'#F1F5F9',color:qlColor(s.fwQL),fontWeight:600,padding:'2px 8px',borderRadius:10,fontSize:11}}>{s.fwQL.toFixed(1)}%</span></td>
                        <td style={{padding:'9px 10px',textAlign:'right',color:'#374151',fontSize:12.5}}>{fmtNum(s.sbQual)}</td>
                        <td style={{padding:'9px 10px',textAlign:'right',color:'#374151',fontSize:12.5}}>{fmtNum(s.apps)}</td>
                        <td style={{padding:'9px 10px',textAlign:'right',color:'#374151',fontSize:12.5,whiteSpace:'nowrap'}}>{fmtINR(s.cpql)}</td>
                        <td style={{padding:'9px 10px',textAlign:'right',fontWeight:700,color:'#4CAE6F',fontSize:12.5,whiteSpace:'nowrap'}}>{fmtINR(s.totalRev)}</td>
                        <td style={{padding:'9px 10px',textAlign:'right',fontWeight:700,color:roasColor(s.roas),fontSize:12.5}}>{s.roas>0?s.roas.toFixed(2)+'x':'—'}</td>
                      </tr>
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

          </>)}
        </div>
      </div>
    </div>
  )
}
