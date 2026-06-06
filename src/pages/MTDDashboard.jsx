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
  Remarketing:'#F59E0B', Referral:'#7C3AED', Bing:'#F59E0B', Others:'#9CA3AF',
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

const KPI=({label,value,sub,accent,prev,cur,invert})=>{
  const d = (prev!=null&&cur!=null)?delta(cur,prev):null
  const good = d==null?null:(invert?d<=0:d>=0)
  return <div style={{background:'#fff',borderTop:'3px solid '+(accent||'#1C9FD4'),borderRadius:10,padding:'14px 16px 12px',border:'0.5px solid #E5E7EB'}}>
    <div style={{fontSize:'9.5px',fontWeight:700,color:'#94A3B8',letterSpacing:'0.07em',textTransform:'uppercase',marginBottom:6}}>{label}</div>
    <div style={{fontSize:20,fontWeight:700,color:'#0F172A',letterSpacing:'-0.5px',lineHeight:1}}>{value}</div>
    <div style={{display:'flex',alignItems:'center',gap:6,marginTop:5}}>
      {sub&&<div style={{fontSize:11,color:'#94A3B8'}}>{sub}</div>}
      {d!=null&&<span style={{fontSize:10,fontWeight:700,padding:'1px 6px',borderRadius:10,
        background:good?'#E9F8EF':'#FEF2F2',color:good?'#059669':'#DC2626'}}>
        {d>=0?'\u25B2':'\u25BC'}{Math.abs(d).toFixed(1)}%
      </span>}
    </div>
  </div>
}

const Card=({title,sub,children,action})=>(
  <div style={{background:'#fff',border:'0.5px solid #E5E7EB',borderRadius:12,overflow:'hidden'}}>
    <div style={{padding:'14px 18px 12px',borderBottom:'0.5px solid #F3F4F6',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
      <div><div style={{fontSize:13,fontWeight:600,color:'#0F172A'}}>{title}</div>{sub&&<div style={{fontSize:11,color:'#94A3B8',marginTop:2}}>{sub}</div>}</div>
      {action}
    </div>
    <div style={{padding:'16px 18px'}}>{children}</div>
  </div>
)

export default function MTDDashboard(){
  const [months,setMonths]=useState([])
  const [sel,setSel]=useState(0)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState(null)
  const [lastSync,setLastSync]=useState(null)
  const hasSetInitial=useRef(false)

  const loadData=useCallback(async()=>{
    try{
      const res=await fetch(SHEET_CSV)
      const csv=await res.text()
      const p=parseCSV(csv)
      setMonths(p)
      if(!hasSetInitial.current){setSel(p.length-1);hasSetInitial.current=true}
      setLastSync(new Date())
      setError(null)
    }catch(e){setError('Failed: '+e.message)}
    finally{setLoading(false)}
  },[])

  useEffect(()=>{loadData()},[loadData])
  useEffect(()=>{const t=setInterval(loadData,60000);return()=>clearInterval(t)},[loadData])

  const month=months[sel]
  const prevMonth=months[sel-1]
  const total=month?.sources.find(s=>s.source==='Total')
  const prevTotal=prevMonth?.sources.find(s=>s.source==='Total')
  const srcs=month?.sources.filter(s=>s.source!=='Total'&&(s.spend>0||s.leads>0))||[]

  const spendPie=useMemo(()=>srcs.filter(s=>s.spend>0).map(s=>({name:s.source,value:Math.round(s.spend)})),[srcs])
  const cplBar=useMemo(()=>[...srcs].filter(s=>s.cpl>0).sort((a,b)=>a.cpl-b.cpl).map(s=>({name:s.source,cpl:s.cpl,color:sc(s.source)})),[srcs])
  const revStack=useMemo(()=>srcs.filter(s=>s.totalRev>0).map(s=>({name:s.source,SR:+(s.srRev/100000).toFixed(1),AC:+(s.acRev/100000).toFixed(1),VAS:+(s.vasRev/100000).toFixed(1)})),[srcs])
  const avgCPL=useMemo(()=>{ const a=srcs.filter(s=>s.cpl>0); return a.length?Math.round(a.reduce((t,s)=>t+s.cpl,0)/a.length):0 },[srcs])

  const fmt=new Intl.DateTimeFormat('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'})
  const cplColor=v=>v>500?'#DC2626':v>250?'#F59E0B':'#059669'
  const roasColor=v=>v>=3?'#059669':v>=1.5?'#F59E0B':'#DC2626'
  const qlColor=v=>v>15?'#059669':v>5?'#F59E0B':'#DC2626'
  const maxSpend=srcs.length?Math.max(...srcs.map(s=>s.spend)):1

  if(loading)return <div style={{display:'flex',height:'100vh',background:'#F4F5F7'}}><Sidebar/><div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'#94A3B8',fontSize:14,fontFamily:"'Plus Jakarta Sans','Inter',sans-serif"}}>Loading from Google Sheets...</div></div>
  if(error)return <div style={{display:'flex',height:'100vh',background:'#F4F5F7'}}><Sidebar/><div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'#DC2626',fontSize:14}}>{error}</div></div>

  return(
    <div style={{display:'flex',height:'100vh',background:'#F4F5F7',fontFamily:"'Plus Jakarta Sans','Inter',sans-serif"}}>
      <Sidebar/>
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minWidth:0}}>

        <div style={{background:'#fff',borderBottom:'0.5px solid #E5E7EB',padding:'0 24px',height:60,display:'flex',alignItems:'center',gap:16,flexShrink:0}}>
          <div style={{flex:1}}>
            <div style={{fontSize:11,color:'#94A3B8',letterSpacing:'0.04em',textTransform:'uppercase',marginBottom:2}}>Dashboards / MTD</div>
            <div style={{fontSize:18,fontWeight:700,color:'#0F172A',letterSpacing:'-0.3px',lineHeight:1}}>MTD Performance {month?.name||''}</div>
          </div>
          {months.length>1&&<div style={{fontSize:11,color:'#94A3B8',background:'#F1F5F9',padding:'3px 10px',borderRadius:6}}>
            {prevMonth?'vs '+prevMonth.name:'First month'}
          </div>}
          {months.length>0&&<select value={sel} onChange={e=>setSel(Number(e.target.value))}
            style={{padding:'7px 12px',border:'0.5px solid #E5E7EB',borderRadius:8,fontSize:13,fontWeight:500,fontFamily:'inherit',background:'#fff',color:'#111827',cursor:'pointer',outline:'none'}}>
            {months.map((m,i)=><option key={m.name} value={i}>{m.name}</option>)}
          </select>}
          <div style={{fontSize:11,color:'#94A3B8',borderLeft:'0.5px solid #E5E7EB',paddingLeft:14}}>{lastSync?'Synced '+fmt.format(lastSync):''}</div>
          <button onClick={loadData} disabled={loading} style={{padding:'6px 14px',borderRadius:8,border:'0.5px solid #E5E7EB',fontSize:12,fontWeight:500,cursor:loading?'wait':'pointer',fontFamily:'inherit',background:'#fff',color:'#374151',display:'flex',alignItems:'center',gap:6,opacity:loading?0.65:1,transition:'opacity .15s ease'}}>
            <svg width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round' style={{animation:loading?'spin .8s linear infinite':'none'}}><polyline points='23 4 23 10 17 10'/><path d='M20.49 15a9 9 0 1 1-2.12-9.36L23 10'/></svg>{loading?'Refreshing':'Refresh'}
          </button>
          <ExportButton data={srcs} filename='mtd-by-source'/>
        </div>

        <div style={{flex:1,overflowY:'auto',padding:22}}>
          {total&&(<>

            <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:12,marginBottom:12}}>
              <KPI label='Total Spend' value={fmtINR(total.spend)} accent='#1F3C84' sub={prevTotal?'prev '+fmtINR(prevTotal.spend):undefined} cur={total.spend} prev={prevTotal?.spend} invert/>
              <KPI label='Total Leads' value={fmtNum(total.leads)} accent='#1C9FD4' sub={prevTotal?'prev '+fmtNum(prevTotal.leads):undefined} cur={total.leads} prev={prevTotal?.leads}/>
              <KPI label='CPL' value={fmtINR(total.cpl)} accent='#F59E0B' sub='Cost per lead' cur={total.cpl} prev={prevTotal?.cpl} invert/>
              <KPI label='Total Revenue' value={fmtINR(total.totalRev)} accent='#059669' sub={prevTotal?'prev '+fmtINR(prevTotal.totalRev):undefined} cur={total.totalRev} prev={prevTotal?.totalRev}/>
              <KPI label='ROAS' value={total.roas>0?total.roas.toFixed(2)+'x':'\u2014'} accent={roasColor(total.roas)} cur={total.roas} prev={prevTotal?.roas}/>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:12,marginBottom:22}}>
              <KPI label='FW Qualified' value={fmtNum(total.fwQual)} accent='#1F3C84' sub={'of '+fmtNum(total.fwQ)+' queued'} cur={total.fwQual} prev={prevTotal?.fwQual}/>
              <KPI label='FW QL%' value={total.fwQL.toFixed(2)+'%'} accent='#1C9FD4' sub='Futwork quality' cur={total.fwQL} prev={prevTotal?.fwQL}/>
              <KPI label='SB Qualified' value={fmtNum(total.sbQual)} accent='#29B9C3' sub={total.sbQL.toFixed(2)+'% QL'} cur={total.sbQual} prev={prevTotal?.sbQual}/>
              <KPI label='Applications' value={fmtNum(total.apps)} accent='#4CAE6F' sub={prevTotal?'prev '+fmtNum(prevTotal.apps):undefined} cur={total.apps} prev={prevTotal?.apps}/>
              <KPI label='Est. RAU' value={total.rau>0?total.rau.toFixed(1):'\u2014'} accent='#F59E0B' sub='Revenue attr. units' cur={total.rau} prev={prevTotal?.rau}/>
              <KPI label='CPQL' value={fmtINR(total.cpql)} accent='#29B9C3' sub='Cost per qual. lead' cur={total.cpql} prev={prevTotal?.cpql} invert/>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1.2fr',gap:14,marginBottom:14}}>

              <Card title='Spend by source' sub='Share of total ad spend'>
                <ResponsiveContainer width='100%' height={240}>
                  <PieChart>
                    <Pie data={spendPie} cx='50%' cy='50%' innerRadius={55} outerRadius={85}
                      dataKey='value' labelLine={false} label={PieLbl}>
                      {spendPie.map((e,i)=><Cell key={i} fill={sc(e.name)}/>)}
                    </Pie>
                    <Tooltip content={<ChartTip fmt={v=>fmtINR(v)}/>}/>
                  </PieChart>
                </ResponsiveContainer>
                <div style={{display:'flex',flexWrap:'wrap',gap:'6px 14px',marginTop:8}}>
                  {spendPie.slice(0,6).map(s=><div key={s.name} style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'#374151'}}><span style={{width:8,height:8,borderRadius:'50%',background:sc(s.name),display:'inline-block',flexShrink:0}}/>{s.name}</div>)}
                </div>
              </Card>

              <Card title='CPL by source' sub={'Avg \u20B9'+avgCPL+' across channels'}>
                <ResponsiveContainer width='100%' height={280}>
                  <ComposedChart data={cplBar} margin={{top:20,right:16,left:0,bottom:40}}>
                    <CartesianGrid strokeDasharray='3 3' stroke='#F3F4F6' vertical={false}/>
                    <XAxis dataKey='name' tick={{fontSize:10,fill:'#6B7280'}} angle={-35} textAnchor='end' interval={0} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fontSize:10,fill:'#6B7280'}} axisLine={false} tickLine={false} tickFormatter={v=>('\u20B9'+(v>=1000?(v/1000).toFixed(0)+'K':v))}/>
                    <Tooltip content={<ChartTip fmt={v=>fmtINR(v)}/>}/>
                    <ReferenceLine y={avgCPL} stroke='#94A3B8' strokeDasharray='4 4' label={{value:'Avg',position:'right',fill:'#94A3B8',fontSize:10}}/>
                    <Bar dataKey='cpl' name='CPL' radius={[5,5,0,0]} maxBarSize={36}>
                      <LabelList dataKey='cpl' position='top' formatter={v=>fmtINR(v)} style={{fontSize:9,fontWeight:600,fill:'#374151'}}/>
                      {cplBar.map((e,i)=><Cell key={i} fill={e.cpl>avgCPL?'#FCA5A5':'#86EFAC'}/>)}
                    </Bar>
                  </ComposedChart>
                </ResponsiveContainer>
                <div style={{display:'flex',gap:14,marginTop:4,fontSize:11}}>
                  <span style={{display:'flex',alignItems:'center',gap:4,color:'#374151'}}><span style={{width:10,height:3,background:'#86EFAC',display:'inline-block'}}/> Below avg</span>
                  <span style={{display:'flex',alignItems:'center',gap:4,color:'#374151'}}><span style={{width:10,height:3,background:'#FCA5A5',display:'inline-block'}}/> Above avg</span>
                  <span style={{display:'flex',alignItems:'center',gap:4,color:'#374151'}}><span style={{width:10,height:2,background:'#94A3B8',display:'inline-block'}}/> Average</span>
                </div>
              </Card>

              <Card title='Revenue breakdown' sub='SR vs AC vs VAS by channel - in Lakhs'>
                <ResponsiveContainer width='100%' height={280}>
                  <BarChart data={revStack} margin={{top:16,right:16,left:0,bottom:40}}>
                    <CartesianGrid strokeDasharray='3 3' stroke='#F3F4F6' vertical={false}/>
                    <XAxis dataKey='name' tick={{fontSize:10,fill:'#6B7280'}} angle={-35} textAnchor='end' interval={0} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fontSize:10,fill:'#6B7280'}} axisLine={false} tickLine={false} tickFormatter={v=>v===0?'\u20B9'+'0':v>=100?'\u20B9'+(v/100).toFixed(1)+'Cr':'\u20B9'+v+'L'}/>
                    <Tooltip content={<ChartTip fmt={v=>v>=100?'\u20B9'+(v/100).toFixed(2)+' Cr':'\u20B9'+v+'L'}/>}/>
                    
                    <Bar dataKey='SR' name='SR Revenue' stackId='r' fill='#1F3C84' radius={[0,0,0,0]}/>
                    <Bar dataKey='AC' name='AC Revenue' stackId='r' fill='#1C9FD4' radius={[0,0,0,0]}/>
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
                    {label:'Applications (STUs)',value:total.apps,color:'#059669'},
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
                        <td style={{padding:'9px 10px',textAlign:'right',fontSize:12.5}}><span style={{background:s.fwQL>15?'#E9F8EF':s.fwQL>5?'#FEF9C3':'#FEF2F2',color:qlColor(s.fwQL),fontWeight:600,padding:'2px 8px',borderRadius:10,fontSize:11}}>{s.fwQL.toFixed(1)}%</span></td>
                        <td style={{padding:'9px 10px',textAlign:'right',color:'#374151',fontSize:12.5}}>{fmtNum(s.sbQual)}</td>
                        <td style={{padding:'9px 10px',textAlign:'right',color:'#374151',fontSize:12.5}}>{fmtNum(s.apps)}</td>
                        <td style={{padding:'9px 10px',textAlign:'right',color:'#374151',fontSize:12.5,whiteSpace:'nowrap'}}>{fmtINR(s.cpql)}</td>
                        <td style={{padding:'9px 10px',textAlign:'right',fontWeight:700,color:'#059669',fontSize:12.5,whiteSpace:'nowrap'}}>{fmtINR(s.totalRev)}</td>
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
