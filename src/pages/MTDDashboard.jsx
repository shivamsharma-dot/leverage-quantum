import React, { useState, useEffect, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts'
import Sidebar from '../components/Sidebar'

const SHEET_CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT58jwL_E0MSciEW_nyrHQMA-0DiFqUN3wstB9yTpfM3gdhK-ctxaODRuqtdxurFRJwmhvbzqS_9EuM/pub?output=csv'

const SRC_COLOR = {
  Facebook:     '#1F3C84',
  Google:       '#1C9FD4',
  'Google MBBS':'#29B9C3',
  Affiliate:    '#4CAE6F',
  Remarketing:  '#D97706',
  Referral:     '#7C3AED',
  Bing:         '#F59E0B',
  Others:       '#9CA3AF',
  Branding:     '#6B7280',
  Offline:      '#374151',
}
function srcColor(src){ return SRC_COLOR[src]||'#9CA3AF' }

function parseINR(v){ if(!v)return 0; return parseFloat(String(v).replace(/[^0-9.]/g,''))||0 }
function parsePct(v){ if(!v)return 0; return parseFloat(String(v).replace('%',''))||0 }
function parseNum(v){ if(!v)return 0; return parseInt(String(v).replace(/,/g,'').replace(/[^0-9]/g,''))||0 }

function fmtINR(n){
  if(!n||n===0)return '—'
  if(n>=1e7)return '₹'+(n/1e7).toFixed(2)+' Cr'
  if(n>=1e5)return '₹'+(n/1e5).toFixed(1)+'L'
  if(n>=1000)return '₹'+(n/1000).toFixed(1)+'K'
  return '₹'+Math.round(n).toLocaleString('en-IN')
}
function fmtNum(n){
  if(!n||n===0)return '—'
  if(n>=1e5)return (n/1e5).toFixed(1)+'L'
  if(n>=1e3)return (n/1e3).toFixed(1)+'K'
  return Math.round(n).toLocaleString('en-IN')
}

function parseCSV(csv){
  const rows=csv.split('\n').map(l=>{
    const cols=[],cur=[];let inQ=false
    for(const ch of l){
      if(ch==='"')inQ=!inQ
      else if(ch===','&&!inQ){cols.push(cur.join('').trim());cur.length=0}
      else cur.push(ch)
    }
    cols.push(cur.join('').trim())
    return cols
  })
  const months=[];let i=0
  while(i<rows.length){
    const m=rows[i][1]?.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/)
    if(m){
      const name=rows[i][1];i+=3
      const sources=[]
      while(i<rows.length&&rows[i][1]?.trim()){
        const r=rows[i],src=r[1]?.trim()
        if(!src){i++;break}
        sources.push({source:src,spend:parseINR(r[2]),leads:parseNum(r[3]),qFloor:parseNum(r[4]),fwQ:parseNum(r[5]),fwQual:parseNum(r[6]),fwQL:parsePct(r[7]),sbQ:parseNum(r[8]),sbQual:parseNum(r[9]),sbQL:parsePct(r[10]),apps:parseNum(r[11]),cpl:parseINR(r[12]),cpql:parseINR(r[13]),cpa:parseINR(r[14]),rau:parseFloat(String(r[15]).replace(/,/g,''))||0,srRev:parseINR(r[16]),acRev:parseINR(r[17]),vasRev:parseINR(r[18]),totalRev:parseINR(r[19]),roas:parseFloat(String(r[20]).replace(/,/g,''))||0})
        i++
      }
      if(sources.length>0)months.push({name,sources})
    }
    i++
  }
  return months
}

const CustomLabel = ({x,y,width,value,fmt}) => {
  if(!value||value===0)return null
  const label = fmt==='inr' ? (value>=1e5?'₹'+(value/1e5).toFixed(1)+'L':'₹'+(value/1000).toFixed(0)+'K') : value>=1e3?(value/1e3).toFixed(1)+'K':String(value)
  return <text x={x+width/2} y={y-5} fill="#374151" textAnchor="middle" fontSize={10} fontWeight={600} fontFamily="'Plus Jakarta Sans','Inter',sans-serif">{label}</text>
}

export default function MTDDashboard(){
  const [months,setMonths]=useState([])
  const [selMonth,setSelMonth]=useState(0)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState(null)
  const [lastSync,setLastSync]=useState(null)

  const loadData=useCallback(async()=>{
    try{
      const res=await fetch(SHEET_CSV)
      const csv=await res.text()
      const parsed=parseCSV(csv)
      setMonths(parsed)
      setSelMonth(parsed.length-1)
      setLastSync(new Date())
      setError(null)
    }catch(e){setError('Sheet load failed: '+e.message)}
    finally{setLoading(false)}
  },[])

  useEffect(()=>{loadData()},[loadData])
  useEffect(()=>{const t=setInterval(loadData,60000);return()=>clearInterval(t)},[loadData])

  const month  = months[selMonth]
  const total  = month?.sources.find(s=>s.source==='Total')
  const srcs   = month?.sources.filter(s=>s.source!=='Total'&&(s.spend>0||s.leads>0))||[]

  const spendChart = srcs.filter(s=>s.spend>0).map(s=>({name:s.source,value:Math.round(s.spend),color:srcColor(s.source)}))
  const revChart   = srcs.filter(s=>s.totalRev>0).map(s=>({name:s.source,value:Math.round(s.totalRev),color:srcColor(s.source)}))
  const qlChart    = srcs.filter(s=>s.fwQL>0).map(s=>({name:s.source,fw:+s.fwQL.toFixed(2),sb:+s.sbQL.toFixed(2),color:srcColor(s.source)}))

  const KPI=({label,value,sub,accent,bg})=>(
    <div style={{background:bg,border:'0.5px solid #E5E7EB',borderLeft:`3px solid ${accent}`,borderRadius:12,padding:'14px 16px'}}>
      <div style={{fontSize:10,fontWeight:600,color:accent,letterSpacing:'0.06em',marginBottom:6,textTransform:'uppercase'}}>{label}</div>
      <div style={{fontSize:20,fontWeight:700,color:accent,letterSpacing:'-0.5px'}}>{value}</div>
      {sub&&<div style={{fontSize:11,color:accent,opacity:0.65,marginTop:4}}>{sub}</div>}
    </div>
  )

  const fmt=new Intl.DateTimeFormat('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'})

  const ChartCard=({title,sub,children})=>(
    <div style={{background:'var(--color-background-primary)',border:'0.5px solid #E5E7EB',borderRadius:12,padding:'18px 16px'}}>
      <div style={{fontSize:13,fontWeight:600,color:'var(--color-text-primary)',marginBottom:2}}>{title}</div>
      <div style={{fontSize:11,color:'#9CA3AF',marginBottom:14}}>{sub}</div>
      {children}
    </div>
  )

  const cplColor=v=>v>500?'#DC2626':v>250?'#D97706':'#059669'
  const roasColor=v=>v>=3?'#166534':v>=1.5?'#D97706':'#DC2626'

  return(
    <div style={{display:'flex',height:'100vh',background:'var(--color-background-tertiary)',fontFamily:"'Plus Jakarta Sans','Inter',sans-serif"}}>
      <Sidebar/>
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minWidth:0}}>

        {/* Header */}
        <div style={{background:'var(--color-background-primary)',borderBottom:'0.5px solid #E5E7EB',padding:'0 24px',height:56,display:'flex',alignItems:'center',gap:16,flexShrink:0}}>
          <div style={{flex:1}}>
            <div style={{fontSize:15,fontWeight:600,color:'var(--color-text-primary)'}}>MTD Dashboard</div>
            <div style={{fontSize:11,color:'var(--color-text-tertiary)'}}>Live · Google Sheets{lastSync?' · Synced '+fmt.format(lastSync):''}</div>
          </div>

          {/* Month dropdown */}
          {months.length>0&&(
            <select value={selMonth} onChange={e=>setSelMonth(Number(e.target.value))}
              style={{padding:'6px 12px',border:'0.5px solid #E5E7EB',borderRadius:8,fontSize:13,fontWeight:500,fontFamily:'inherit',background:'#fff',color:'#111827',cursor:'pointer',outline:'none'}}>
              {months.map((m,idx)=><option key={m.name} value={idx}>{m.name}</option>)}
            </select>
          )}

          <button onClick={loadData} style={{padding:'6px 14px',borderRadius:8,border:'0.5px solid #E5E7EB',fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'inherit',background:'#fff',color:'#374151',display:'flex',alignItems:'center',gap:5}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            Refresh
          </button>
        </div>

        {/* Content */}
        <div style={{flex:1,overflowY:'auto',padding:22}}>

          {loading&&<div style={{textAlign:'center',padding:80,color:'#9CA3AF',fontSize:13}}>Loading from Google Sheets...</div>}
          {error&&<div style={{textAlign:'center',padding:80,color:'#DC2626',fontSize:13}}>{error}</div>}

          {!loading&&!error&&month&&total&&(<>

            {/* KPI row 1 — core performance */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:10,marginBottom:12}}>
              <KPI label="Total Spend"    value={fmtINR(total.spend)}    accent="#1F3C84" bg="#E8EFF9"/>
              <KPI label="Total Leads"    value={fmtNum(total.leads)}    accent="#1C9FD4" bg="#E3F5FD"/>
              <KPI label="CPL"            value={fmtINR(total.cpl)}      accent="#D97706" bg="#FEF9C3"/>
              <KPI label="CPQL"           value={fmtINR(total.cpql)}     accent="#7C3AED" bg="#F5F3FF"/>
              <KPI label="Applications"   value={fmtNum(total.apps)}     accent="#059669" bg="#E9F8EF"/>
              <KPI label="Total Revenue"  value={fmtINR(total.totalRev)} accent="#166534" bg="#E9F8EF"/>
              <KPI label="ROAS"           value={total.roas>0?total.roas.toFixed(2)+'x':'—'} accent={roasColor(total.roas)} bg={total.roas>=3?'#E9F8EF':total.roas>=1.5?'#FEF9C3':'#FEF2F2'}/>
            </div>

            {/* KPI row 2 — lead quality */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:10,marginBottom:20}}>
              <KPI label="FW Qualified"  value={fmtNum(total.fwQual)}            accent="#1F3C84" bg="#E8EFF9" sub={"of "+fmtNum(total.fwQ)+" queued"}/>
              <KPI label="FW QL%"        value={total.fwQL.toFixed(2)+'%'}       accent="#1C9FD4" bg="#E3F5FD" sub="Lead to qualified rate"/>
              <KPI label="SB Qualified"  value={fmtNum(total.sbQual)}            accent="#29B9C3" bg="#E4F8F9" sub={"of "+fmtNum(total.sbQ)+" queued"}/>
              <KPI label="SB QL%"        value={total.sbQL.toFixed(2)+'%'}       accent="#4CAE6F" bg="#E9F8EF" sub="Superbot quality rate"/>
              <KPI label="Est. RAU"      value={total.rau>0?total.rau.toFixed(1):'—'} accent="#D97706" bg="#FEF9C3" sub="Revenue attributed units"/>
            </div>

            {/* Charts */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,marginBottom:20}}>

              <ChartCard title="Spend by source" sub="Total ad spend per channel">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={spendChart} margin={{top:20,right:8,left:0,bottom:30}} barCategoryGap="35%">
                    <XAxis dataKey="name" tick={{fontSize:10,fill:'#6B7280',fontFamily:"'Plus Jakarta Sans','Inter',sans-serif"}} angle={-35} textAnchor="end" interval={0} />
                    <YAxis hide />
                    <Tooltip
                      formatter={v=>fmtINR(v)}
                      contentStyle={{fontSize:12,fontFamily:"'Plus Jakarta Sans','Inter',sans-serif",border:'0.5px solid #E5E7EB',borderRadius:8}}
                    />
                    <Bar dataKey="value" radius={[5,5,0,0]} maxBarSize={40}>
                      <LabelList content={<CustomLabel fmt="inr"/>}/>
                      {spendChart.map((e,i)=><Cell key={i} fill={e.color}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Revenue by source" sub="Total revenue generated per channel">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={revChart} margin={{top:20,right:8,left:0,bottom:30}} barCategoryGap="35%">
                    <XAxis dataKey="name" tick={{fontSize:10,fill:'#6B7280',fontFamily:"'Plus Jakarta Sans','Inter',sans-serif"}} angle={-35} textAnchor="end" interval={0}/>
                    <YAxis hide/>
                    <Tooltip
                      formatter={v=>fmtINR(v)}
                      contentStyle={{fontSize:12,fontFamily:"'Plus Jakarta Sans','Inter',sans-serif",border:'0.5px solid #E5E7EB',borderRadius:8}}
                    />
                    <Bar dataKey="value" radius={[5,5,0,0]} maxBarSize={40}>
                      <LabelList content={<CustomLabel fmt="inr"/>}/>
                      {revChart.map((e,i)=><Cell key={i} fill={e.color}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Lead quality % by source" sub="Futwork qualification rate per channel">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={qlChart} margin={{top:20,right:8,left:0,bottom:30}} barCategoryGap="30%">
                    <XAxis dataKey="name" tick={{fontSize:10,fill:'#6B7280',fontFamily:"'Plus Jakarta Sans','Inter',sans-serif"}} angle={-35} textAnchor="end" interval={0}/>
                    <YAxis hide unit="%"/>
                    <Tooltip
                      formatter={v=>v.toFixed(2)+'%'}
                      contentStyle={{fontSize:12,fontFamily:"'Plus Jakarta Sans','Inter',sans-serif",border:'0.5px solid #E5E7EB',borderRadius:8}}
                    />
                    <Bar dataKey="fw" name="Futwork" radius={[5,5,0,0]} maxBarSize={18}>
                      <LabelList content={({x,y,width,value})=>(value>0?<text x={x+width/2} y={y-4} fill="#1F3C84" textAnchor="middle" fontSize={9} fontWeight={600}>{value}%</text>:null)}/>
                      {qlChart.map((e,i)=><Cell key={i} fill={e.color}/>)}
                    </Bar>
                    <Bar dataKey="sb" name="Superbot" radius={[5,5,0,0]} maxBarSize={18} fill="#E5E7EB">
                      <LabelList content={({x,y,width,value})=>(value>0?<text x={x+width/2} y={y-4} fill="#6B7280" textAnchor="middle" fontSize={9} fontWeight={600}>{value}%</text>:null)}/>
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            {/* Source breakdown table */}
            <div style={{background:'var(--color-background-primary)',border:'0.5px solid #E5E7EB',borderRadius:12,overflow:'hidden',marginBottom:14}}>
              <div style={{padding:'12px 18px',borderBottom:'0.5px solid #E5E7EB',display:'flex',alignItems:'center',gap:8}}>
                <div style={{fontSize:13,fontWeight:600,color:'var(--color-text-primary)'}}>Source breakdown</div>
                <div style={{fontSize:11,color:'#9CA3AF'}}>{month.name}</div>
              </div>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12.5,fontFamily:"'Plus Jakarta Sans','Inter',sans-serif"}}>
                  <thead>
                    <tr style={{background:'#F9FAFB',borderBottom:'0.5px solid #E5E7EB'}}>
                      {['Source','Spend','Leads','CPL','FW Qual','FW QL%','SB Qual','SB QL%','APPs','CPQL','CPA','Total Rev','ROAS'].map(h=>(
                        <th key={h} style={{padding:'9px 14px',fontWeight:600,color:'#6B7280',textAlign:h==='Source'?'left':'right',whiteSpace:'nowrap',fontSize:11}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {srcs.map((s,i)=>(
                      <tr key={s.source} style={{borderBottom:'0.5px solid #F3F4F6'}}>
                        <td style={{padding:'10px 14px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:8}}>
                            <span style={{width:8,height:8,borderRadius:'50%',background:srcColor(s.source),display:'inline-block',flexShrink:0}}/>
                            <span style={{fontWeight:600,color:'var(--color-text-primary)'}}>{s.source}</span>
                          </div>
                        </td>
                        <td style={{padding:'10px 14px',textAlign:'right',fontWeight:600,color:'#111827'}}>{fmtINR(s.spend)}</td>
                        <td style={{padding:'10px 14px',textAlign:'right',color:'#374151'}}>{fmtNum(s.leads)}</td>
                        <td style={{padding:'10px 14px',textAlign:'right',fontWeight:600,color:cplColor(s.cpl)}}>{fmtINR(s.cpl)}</td>
                        <td style={{padding:'10px 14px',textAlign:'right',color:'#374151'}}>{fmtNum(s.fwQual)}</td>
                        <td style={{padding:'10px 14px',textAlign:'right',fontWeight:500,color:s.fwQL>15?'#059669':s.fwQL>5?'#D97706':'#DC2626'}}>{s.fwQL.toFixed(2)}%</td>
                        <td style={{padding:'10px 14px',textAlign:'right',color:'#374151'}}>{fmtNum(s.sbQual)}</td>
                        <td style={{padding:'10px 14px',textAlign:'right',fontWeight:500,color:s.sbQL>1?'#059669':'#D97706'}}>{s.sbQL.toFixed(2)}%</td>
                        <td style={{padding:'10px 14px',textAlign:'right',color:'#374151'}}>{fmtNum(s.apps)}</td>
                        <td style={{padding:'10px 14px',textAlign:'right',color:'#374151'}}>{fmtINR(s.cpql)}</td>
                        <td style={{padding:'10px 14px',textAlign:'right',color:'#374151'}}>{fmtINR(s.cpa)}</td>
                        <td style={{padding:'10px 14px',textAlign:'right',fontWeight:700,color:'#166534'}}>{fmtINR(s.totalRev)}</td>
                        <td style={{padding:'10px 14px',textAlign:'right',fontWeight:700,color:roasColor(s.roas)}}>{s.roas>0?s.roas.toFixed(2)+'x':'—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Revenue detail table */}
            <div style={{background:'var(--color-background-primary)',border:'0.5px solid #E5E7EB',borderRadius:12,overflow:'hidden'}}>
              <div style={{padding:'12px 18px',borderBottom:'0.5px solid #E5E7EB'}}>
                <div style={{fontSize:13,fontWeight:600,color:'var(--color-text-primary)'}}>Revenue detail</div>
              </div>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12.5,fontFamily:"'Plus Jakarta Sans','Inter',sans-serif"}}>
                <thead>
                  <tr style={{background:'#F9FAFB',borderBottom:'0.5px solid #E5E7EB'}}>
                    {['Source','SR Revenue','AC Revenue','VAS Revenue','Total Revenue','Est. RAU'].map(h=>(
                      <th key={h} style={{padding:'9px 14px',fontWeight:600,color:'#6B7280',textAlign:h==='Source'?'left':'right',whiteSpace:'nowrap',fontSize:11}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[total,...srcs.filter(s=>s.totalRev>0)].map((s,i)=>(
                    <tr key={s.source} style={{borderBottom:'0.5px solid #F3F4F6',background:s.source==='Total'?'#F9FAFB':'transparent'}}>
                      <td style={{padding:'10px 14px'}}>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <span style={{width:8,height:8,borderRadius:'50%',background:srcColor(s.source),display:'inline-block',flexShrink:0}}/>
                          <span style={{fontWeight:s.source==='Total'?700:600,color:'var(--color-text-primary)'}}>{s.source}</span>
                        </div>
                      </td>
                      <td style={{padding:'10px 14px',textAlign:'right',color:'#374151'}}>{fmtINR(s.srRev)}</td>
                      <td style={{padding:'10px 14px',textAlign:'right',color:'#374151'}}>{fmtINR(s.acRev)}</td>
                      <td style={{padding:'10px 14px',textAlign:'right',color:'#374151'}}>{fmtINR(s.vasRev)}</td>
                      <td style={{padding:'10px 14px',textAlign:'right',fontWeight:700,color:'#166534'}}>{fmtINR(s.totalRev)}</td>
                      <td style={{padding:'10px 14px',textAlign:'right',color:'#374151'}}>{s.rau>0?s.rau.toFixed(1):'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </>)}
        </div>
      </div>
    </div>
  )
    }
