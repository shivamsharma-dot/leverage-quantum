import React, { useState, useEffect, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts'
import Sidebar from '../components/Sidebar'

const SHEET_CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT58jwL_E0MSciEW_nyrHQMA-0DiFqUN3wstB9yTpfM3gdhK-ctxaODRuqtdxurFRJwmhvbzqS_9EuM/pub?output=csv'
const SRC_COLOR = { Facebook:'#1F3C84',Google:'#1C9FD4','Google MBBS':'#29B9C3',Affiliate:'#4CAE6F',Remarketing:'#D97706',Referral:'#7C3AED',Bing:'#F59E0B',Others:'#9CA3AF',Branding:'#6B7280',Offline:'#374151' }
const sc = src => SRC_COLOR[src]||'#9CA3AF'
function parseINR(v){ if(!v)return 0;return parseFloat(String(v).replace(/[^0-9.]/g,''))||0 }
function parsePct(v){ if(!v)return 0;return parseFloat(String(v).replace('%',''))||0 }
function parseNum(v){ if(!v)return 0;return parseInt(String(v).replace(/[^0-9]/g,''))||0 }
function fmtINR(n){ if(!n||n===0)return '—';if(n>=1e7)return '₹'+(n/1e7).toFixed(2)+' Cr';if(n>=1e5)return '₹'+(n/1e5).toFixed(1)+'L';if(n>=1000)return '₹'+(n/1000).toFixed(1)+'K';return '₹'+Math.round(n).toLocaleString('en-IN') }
function fmtNum(n){ if(!n||n===0)return '—';if(n>=1e5)return (n/1e5).toFixed(1)+'L';if(n>=1e3)return (n/1e3).toFixed(1)+'K';return Math.round(n).toLocaleString('en-IN') }
function parseCSV(csv){
  const rows=csv.replace(/\r/g,'').split('\n').map(l=>{
    const cols=[],cur=[];let inQ=false
    for(const ch of l){ if(ch==='"')inQ=!inQ;else if(ch===','&&!inQ){cols.push(cur.join('').trim());cur.length=0}else cur.push(ch) }
    cols.push(cur.join('').trim());return cols
  })
  const months=[];let i=0
  while(i<rows.length){
    const m=rows[i][1]?.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/)
    if(m){
      const name=rows[i][1];i+=3;const sources=[]
      while(i<rows.length&&rows[i][1]?.trim()){
        const r=rows[i],src=r[1]?.trim();if(!src){i++;break}
        sources.push({source:src,spend:parseINR(r[2]),leads:parseNum(r[3]),qFloor:parseNum(r[4]),fwQ:parseNum(r[5]),fwQual:parseNum(r[6]),fwQL:parsePct(r[7]),sbQ:parseNum(r[8]),sbQual:parseNum(r[9]),sbQL:parsePct(r[10]),apps:parseNum(r[11]),cpl:parseINR(r[12]),cpql:parseINR(r[13]),cpa:parseINR(r[14]),rau:parseFloat(String(r[15]).replace(/,/g,''))||0,srRev:parseINR(r[16]),acRev:parseINR(r[17]),vasRev:parseINR(r[18]),totalRev:parseINR(r[19]),roas:parseFloat(String(r[20]).replace(/,/g,''))||0});i++
      }
      if(sources.length>0)months.push({name,sources})
    }
    i++
  }
  return months
}
export default function MTDDashboard(){
  const [months,setMonths]=useState([])
  const [sel,setSel]=useState(0)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState(null)
  const [lastSync,setLastSync]=useState(null)
  const loadData=useCallback(async()=>{
    try{ const res=await fetch(SHEET_CSV);const csv=await res.text();const p=parseCSV(csv);setMonths(p);setSel(p.length-1);setLastSync(new Date());setError(null) }
    catch(e){setError('Sheet load failed: '+e.message)}finally{setLoading(false)}
  },[])
  useEffect(()=>{loadData()},[loadData])
  useEffect(()=>{const t=setInterval(loadData,60000);return()=>clearInterval(t)},[loadData])
  const month=months[sel],total=month?.sources.find(s=>s.source==='Total')
  const srcs=month?.sources.filter(s=>s.source!=='Total'&&(s.spend>0||s.leads>0))||[]
  const spendChart=[...srcs].sort((a,b)=>b.spend-a.spend).slice(0,6).map(s=>({name:s.source,value:Math.round(s.spend/1000),color:sc(s.source)}))
  const fmt=new Intl.DateTimeFormat('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'})
  const KPI=({label,value,sub,accent,bg})=>(
    <div style={{background:bg,border:'0.5px solid #E5E7EB',borderLeft:'3px solid '+accent,borderRadius:12,padding:'14px 18px'}}>
      <div style={{fontSize:10,fontWeight:600,color:accent,letterSpacing:'0.06em',marginBottom:6,textTransform:'uppercase'}}>{label}</div>
      <div style={{fontSize:22,fontWeight:700,color:accent,letterSpacing:'-0.5px',lineHeight:1}}>{value}</div>
      {sub&&<div style={{fontSize:11,color:accent,opacity:0.65,marginTop:5}}>{sub}</div>}
    </div>
  )
  const cplColor=v=>v>500?'#DC2626':v>250?'#D97706':'#059669'
  const roasColor=v=>v>=3?'#166534':v>=1.5?'#D97706':'#DC2626'
  const qlColor=v=>v>15?'#059669':v>5?'#D97706':'#DC2626'
  return(
    <div style={{display:'flex',height:'100vh',background:'var(--color-background-tertiary)',fontFamily:"'Plus Jakarta Sans','Inter',sans-serif"}}>
      <Sidebar/>
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minWidth:0}}>
        <div style={{background:'var(--color-background-primary)',borderBottom:'0.5px solid #E5E7EB',padding:'0 24px',height:56,display:'flex',alignItems:'center',gap:16,flexShrink:0}}>
          <div style={{flex:1}}>
            <div style={{fontSize:15,fontWeight:600,color:'var(--color-text-primary)'}}>MTD Dashboard</div>
            <div style={{fontSize:11,color:'var(--color-text-tertiary)'}}>Live from Google Sheets{lastSync?' · Synced '+fmt.format(lastSync):''}</div>
          </div>
          {months.length>0&&(<select value={sel} onChange={e=>setSel(Number(e.target.value))} style={{padding:'7px 12px',border:'0.5px solid #E5E7EB',borderRadius:8,fontSize:13,fontWeight:500,fontFamily:'inherit',background:'#fff',color:'#111827',cursor:'pointer',outline:'none'}}>{months.map((m,i)=><option key={m.name} value={i}>{m.name}</option>)}</select>)}
          <button onClick={loadData} style={{padding:'6px 14px',borderRadius:8,border:'0.5px solid #E5E7EB',fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'inherit',background:'#fff',color:'#374151',display:'flex',alignItems:'center',gap:5}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>Refresh
          </button>
        </div>
        <div style={{flex:1,overflowY:'auto',padding:22}}>
          {loading&&<div style={{textAlign:'center',padding:80,color:'#9CA3AF',fontSize:13}}>Loading from Google Sheets...</div>}
          {error&&<div style={{textAlign:'center',padding:80,color:'#DC2626',fontSize:13}}>{error}</div>}
          {!loading&&!error&&month&&total&&(<>
            <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:12,marginBottom:12}}>
              <KPI label="Total Spend"   value={fmtINR(total.spend)}    accent="#1F3C84" bg="#E8EFF9"/>
              <KPI label="Total Leads"   value={fmtNum(total.leads)}    accent="#1C9FD4" bg="#E3F5FD"/>
              <KPI label="CPL"           value={fmtINR(total.cpl)}      sub="Cost per lead"      accent="#D97706" bg="#FEF9C3"/>
              <KPI label="Total Revenue" value={fmtINR(total.totalRev)} accent="#166534" bg="#E9F8EF"/>
              <KPI label="ROAS"          value={total.roas>0?total.roas.toFixed(2)+'x':'—'} accent={roasColor(total.roas)} bg={total.roas>=3?'#E9F8EF':total.roas>=1.5?'#FEF9C3':'#FEF2F2'}/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:12,marginBottom:20}}>
              <KPI label="FW Qualified" value={fmtNum(total.fwQual)} sub={'of '+fmtNum(total.fwQ)+' queued'} accent="#1F3C84" bg="#E8EFF9"/>
              <KPI label="FW QL%"       value={total.fwQL.toFixed(2)+'%'} sub="Futwork rate" accent="#1C9FD4" bg="#E3F5FD"/>
              <KPI label="Applications" value={fmtNum(total.apps)} sub={'CPQL '+fmtINR(total.cpql)} accent="#4CAE6F" bg="#E9F8EF"/>
              <KPI label="SB Qualified" value={fmtNum(total.sbQual)} sub={total.sbQL.toFixed(2)+'% SB QL%'} accent="#29B9C3" bg="#E4F8F9"/>
              <KPI label="Est. RAU"     value={total.rau>0?total.rau.toFixed(1):'—'} sub="Revenue units" accent="#D97706" bg="#FEF9C3"/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'300px 1fr',gap:14,marginBottom:14}}>
              <div style={{background:'var(--color-background-primary)',border:'0.5px solid #E5E7EB',borderRadius:12,padding:'16px'}}>
                <div style={{fontSize:13,fontWeight:600,color:'var(--color-text-primary)',marginBottom:2}}>Spend by source</div>
                <div style={{fontSize:11,color:'#9CA3AF',marginBottom:14}}>In thousands (₹K)</div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={spendChart} layout="vertical" margin={{top:0,right:55,left:0,bottom:0}} barSize={16}>
                    <XAxis type="number" hide/>
                    <YAxis type="category" dataKey="name" width={85} tick={{fontSize:11,fill:'#6B7280',fontFamily:"'Plus Jakarta Sans','Inter',sans-serif"}} axisLine={false} tickLine={false}/>
                    <Tooltip formatter={v=>'₹'+v+'K'} contentStyle={{fontSize:12,fontFamily:"'Plus Jakarta Sans','Inter',sans-serif",border:'0.5px solid #E5E7EB',borderRadius:8}}/>
                    <Bar dataKey="value" radius={[0,5,5,0]}>
                      <LabelList dataKey="value" position="right" formatter={v=>'₹'+v+'K'} style={{fontSize:11,fontWeight:600,fill:'#374151',fontFamily:"'Plus Jakarta Sans','Inter',sans-serif"}}/>
                      {spendChart.map((e,i)=><Cell key={i} fill={e.color}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{background:'var(--color-background-primary)',border:'0.5px solid #E5E7EB',borderRadius:12,overflow:'hidden'}}>
                <div style={{padding:'12px 18px',borderBottom:'0.5px solid #E5E7EB',display:'flex',alignItems:'center',gap:8}}>
                  <div style={{fontSize:13,fontWeight:600,color:'var(--color-text-primary)'}}>Source breakdown</div>
                  <div style={{fontSize:11,color:'#9CA3AF'}}>{month.name}</div>
                </div>
                <div style={{overflowX:'auto'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontFamily:"'Plus Jakarta Sans','Inter',sans-serif"}}>
                    <thead><tr style={{background:'#F9FAFB',borderBottom:'0.5px solid #E5E7EB'}}>
                      {['Source','Spend','Leads','CPL','FW Qual','FW QL%','SB Qual','SB QL%','APPs','CPQL','Total Rev','ROAS'].map(h=>(
                        <th key={h} style={{padding:'8px 12px',fontWeight:600,color:'#6B7280',textAlign:h==='Source'?'left':'right',whiteSpace:'nowrap',fontSize:11}}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>{srcs.map(s=>(
                      <tr key={s.source} style={{borderBottom:'0.5px solid #F3F4F6'}}>
                        <td style={{padding:'8px 12px'}}><div style={{display:'flex',alignItems:'center',gap:7}}><span style={{width:8,height:8,borderRadius:'50%',background:sc(s.source),display:'inline-block',flexShrink:0}}/><span style={{fontWeight:600,color:'var(--color-text-primary)',fontSize:12.5,whiteSpace:'nowrap'}}>{s.source}</span></div></td>
                        <td style={{padding:'8px 12px',textAlign:'right',fontWeight:600,color:'#111827',fontSize:12.5,whiteSpace:'nowrap'}}>{fmtINR(s.spend)}</td>
                        <td style={{padding:'8px 12px',textAlign:'right',color:'#374151',fontSize:12.5}}>{fmtNum(s.leads)}</td>
                        <td style={{padding:'8px 12px',textAlign:'right',fontWeight:600,color:cplColor(s.cpl),fontSize:12.5,whiteSpace:'nowrap'}}>{fmtINR(s.cpl)}</td>
                        <td style={{padding:'8px 12px',textAlign:'right',color:'#374151',fontSize:12.5}}>{fmtNum(s.fwQual)}</td>
                        <td style={{padding:'8px 12px',textAlign:'right',fontWeight:500,color:qlColor(s.fwQL),fontSize:12.5}}>{s.fwQL.toFixed(2)}%</td>
                        <td style={{padding:'8px 12px',textAlign:'right',color:'#374151',fontSize:12.5}}>{fmtNum(s.sbQual)}</td>
                        <td style={{padding:'8px 12px',textAlign:'right',fontWeight:500,color:s.sbQL>1?'#059669':'#D97706',fontSize:12.5}}>{s.sbQL.toFixed(2)}%</td>
                        <td style={{padding:'8px 12px',textAlign:'right',color:'#374151',fontSize:12.5}}>{fmtNum(s.apps)}</td>
                        <td style={{padding:'8px 12px',textAlign:'right',color:'#374151',fontSize:12.5,whiteSpace:'nowrap'}}>{fmtINR(s.cpql)}</td>
                        <td style={{padding:'8px 12px',textAlign:'right',fontWeight:700,color:'#166534',fontSize:12.5,whiteSpace:'nowrap'}}>{fmtINR(s.totalRev)}</td>
                        <td style={{padding:'8px 12px',textAlign:'right',fontWeight:700,color:roasColor(s.roas),fontSize:12.5}}>{s.roas>0?s.roas.toFixed(2)+'x':'—'}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            </div>
            <div style={{background:'var(--color-background-primary)',border:'0.5px solid #E5E7EB',borderRadius:12,overflow:'hidden'}}>
              <div style={{padding:'12px 18px',borderBottom:'0.5px solid #E5E7EB'}}><div style={{fontSize:13,fontWeight:600,color:'var(--color-text-primary)'}}>Revenue detail</div></div>
              <table style={{width:'100%',borderCollapse:'collapse',fontFamily:"'Plus Jakarta Sans','Inter',sans-serif"}}>
                <thead><tr style={{background:'#F9FAFB',borderBottom:'0.5px solid #E5E7EB'}}>
                  {['Source','SR Revenue','AC Revenue','VAS Revenue','Total Revenue','Est. RAU'].map(h=>(<th key={h} style={{padding:'8px 14px',fontWeight:600,color:'#6B7280',textAlign:h==='Source'?'left':'right',whiteSpace:'nowrap',fontSize:11}}>{h}</th>))}
                </tr></thead>
                <tbody>{[total,...srcs.filter(s=>s.totalRev>0)].map(s=>(
                  <tr key={s.source} style={{borderBottom:'0.5px solid #F3F4F6',background:s.source==='Total'?'#F9FAFB':'transparent'}}>
                    <td style={{padding:'8px 14px'}}><div style={{display:'flex',alignItems:'center',gap:7}}><span style={{width:8,height:8,borderRadius:'50%',background:sc(s.source),display:'inline-block',flexShrink:0}}/><span style={{fontWeight:s.source==='Total'?700:600,color:'var(--color-text-primary)',fontSize:12.5}}>{s.source}</span></div></td>
                    <td style={{padding:'8px 14px',textAlign:'right',color:'#374151',fontSize:12.5,whiteSpace:'nowrap'}}>{fmtINR(s.srRev)}</td>
                    <td style={{padding:'8px 14px',textAlign:'right',color:'#374151',fontSize:12.5,whiteSpace:'nowrap'}}>{fmtINR(s.acRev)}</td>
                    <td style={{padding:'8px 14px',textAlign:'right',color:'#374151',fontSize:12.5,whiteSpace:'nowrap'}}>{fmtINR(s.vasRev)}</td>
                    <td style={{padding:'8px 14px',textAlign:'right',fontWeight:700,color:'#166534',fontSize:12.5,whiteSpace:'nowrap'}}>{fmtINR(s.totalRev)}</td>
                    <td style={{padding:'8px 14px',textAlign:'right',color:'#374151',fontSize:12.5}}>{s.rau>0?s.rau.toFixed(1):'—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </>)}
        </div>
      </div>
    </div>
  )
              }
