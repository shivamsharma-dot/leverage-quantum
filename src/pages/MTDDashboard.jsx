import React, { useState, useEffect, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts'
import Sidebar from '../components/Sidebar'

const SHEET_CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT58jwL_E0MSciEW_nyrHQMA-0DiFqUN3wstB9yTpfM3gdhK-ctxaODRuqtdxurFRJwmhvbzqS_9EuM/pub?output=csv'

const SRC_COLOR = { Facebook:'#1F3C84', Google:'#1C9FD4', 'Google MBBS':'#29B9C3', Affiliate:'#4CAE6F', Others:'#9CA3AF', Branding:'#D1D5DB', Total:'#374151' }
const SRC_BG    = { Facebook:'#E8EFF9', Google:'#E3F5FD', 'Google MBBS':'#E4F8F9', Affiliate:'#E9F8EF', Others:'#F3F4F6', Branding:'#F9FAFB', Total:'#F3F4F6' }

function parseINR(v){ if(!v)return 0; return parseFloat(String(v).replace(/[₹₹,\s]/g,'').replace(/,/g,''))||0 }
function parsePct(v){ if(!v)return 0; return parseFloat(String(v).replace('%',''))||0 }
function parseNum(v){ if(!v)return 0; return parseInt(String(v).replace(/,/g,''))||0 }

function fmtINR(n){
  if(!n||n===0)return '—'
  if(n>=1e7)return '₹'+(n/1e7).toFixed(2)+' Cr'
  if(n>=1e5)return '₹'+(n/1e5).toFixed(2)+'L'
  return '₹'+Math.round(n).toLocaleString('en-IN')
}
function fmtNum(n){ if(!n||n===0)return '—'; if(n>=1e5)return (n/1e5).toFixed(1)+'L'; if(n>=1e3)return (n/1e3).toFixed(1)+'K'; return Math.round(n).toLocaleString('en-IN') }

function parseCSV(csv) {
  const rows = csv.split('\n').map(l => {
    const cols=[], cur=[]
    let inQ=false
    for(const ch of l){
      if(ch==='"'){ inQ=!inQ }
      else if(ch===','&&!inQ){ cols.push(cur.join('').trim()); cur.length=0 }
      else cur.push(ch)
    }
    cols.push(cur.join('').trim())
    return cols
  })

  const months=[]
  let i=0
  while(i<rows.length){
    const monthMatch = rows[i][1]?.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/)
    if(monthMatch){
      const name = rows[i][1]
      i+=3 // skip platform header + column header
      const sources=[]
      while(i<rows.length){
        const r=rows[i]
        const src=r[1]?.trim()
        if(!src){ i++; break }
        sources.push({
          source: src,
          spend:    parseINR(r[2]),
          leads:    parseNum(r[3]),
          qFloor:   parseNum(r[4]),
          fwQ:      parseNum(r[5]),
          fwQual:   parseNum(r[6]),
          fwQL:     parsePct(r[7]),
          sbQ:      parseNum(r[8]),
          sbQual:   parseNum(r[9]),
          sbQL:     parsePct(r[10]),
          apps:     parseNum(r[11]),
          cpl:      parseINR(r[12]),
          cpql:     parseINR(r[13]),
          cpa:      parseINR(r[14]),
          rau:      parseFloat(String(r[15]).replace(/,/g,''))||0,
          srRev:    parseINR(r[16]),
          acRev:    parseINR(r[17]),
          vasRev:   parseINR(r[18]),
          totalRev: parseINR(r[19]),
          roas:     parseFloat(String(r[20]).replace(/,/g,''))||0,
        })
        i++
      }
      if(sources.length>0) months.push({name,sources})
    }
    i++
  }
  return months
}

export default function MTDDashboard() {
  const [months,setMonths]     = useState([])
  const [selMonth,setSelMonth] = useState(0)
  const [loading,setLoading]   = useState(true)
  const [error,setError]       = useState(null)
  const [lastSync,setLastSync] = useState(null)

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(SHEET_CSV)
      const csv = await res.text()
      const parsed = parseCSV(csv)
      setMonths(parsed)
      setSelMonth(parsed.length-1) // default to latest month
      setLastSync(new Date())
      setError(null)
    } catch(e) {
      setError('Failed to load sheet data: '+e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(()=>{ loadData() },[loadData])
  // Auto-refresh every 60s
  useEffect(()=>{ const t=setInterval(loadData,60000); return ()=>clearInterval(t) },[loadData])

  const month   = months[selMonth]
  const total   = month?.sources.find(s=>s.source==='Total')
  const sources = month?.sources.filter(s=>s.source!=='Total') || []

  const spendChart = sources.filter(s=>s.spend>0).map(s=>({ name:s.source, value:Math.round(s.spend/1e5) }))
  const revChart   = sources.filter(s=>s.totalRev>0).map(s=>({ name:s.source, value:Math.round(s.totalRev/1e5) }))
  const qlChart    = sources.filter(s=>s.fwQL>0||s.sbQL>0).map(s=>({ name:s.source, futwork:s.fwQL, superbot:s.sbQL }))

  const pill = (label,val,color,bg) => (
    <div style={{background:bg||'#F3F4F6',borderLeft:'3px solid '+(color||'#9CA3AF'),borderRadius:12,padding:'14px 16px',border:'0.5px solid #E5E7EB'}}>
      <div style={{fontSize:10,fontWeight:600,color:color||'#9CA3AF',letterSpacing:'0.06em',marginBottom:6}}>{label}</div>
      <div style={{fontSize:20,fontWeight:700,color:color||'#374151',letterSpacing:'-0.5px'}}>{val}</div>
    </div>
  )

  const fmt = new Intl.DateTimeFormat('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'})

  return (
    <div style={{display:'flex',height:'100vh',background:'var(--color-background-tertiary)',fontFamily:"'Plus Jakarta Sans','Inter',sans-serif"}}>
      <Sidebar/>
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minWidth:0}}>

        {/* Header */}
        <div style={{background:'var(--color-background-primary)',borderBottom:'0.5px solid #E5E7EB',padding:'0 24px',height:56,display:'flex',alignItems:'center',gap:16,flexShrink:0}}>
          <div style={{flex:1}}>
            <div style={{fontSize:15,fontWeight:600,color:'var(--color-text-primary)'}}>MTD Dashboard</div>
            <div style={{fontSize:11,color:'var(--color-text-tertiary)'}}>Live from Google Sheets {lastSync?'· Synced '+fmt.format(lastSync):''}</div>
          </div>
          <div style={{display:'flex',gap:4}}>
            {months.map((m,idx)=>(
              <button key={m.name} onClick={()=>setSelMonth(idx)}
                style={{padding:'5px 14px',borderRadius:8,border:'0.5px solid #E5E7EB',fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'inherit',
                  background:selMonth===idx?'#1F3C84':'#fff',color:selMonth===idx?'#fff':'#6B7280'}}>
                {m.name}
              </button>
            ))}
          </div>
          <button onClick={loadData} style={{padding:'6px 14px',borderRadius:8,border:'0.5px solid #E5E7EB',fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'inherit',background:'#fff',color:'#374151',display:'flex',alignItems:'center',gap:5}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            Refresh
          </button>
        </div>

        {/* Content */}
        <div style={{flex:1,overflowY:'auto',padding:22}}>
          {loading && <div style={{textAlign:'center',padding:80,color:'#9CA3AF',fontSize:13}}>Loading MTD data from Google Sheets...</div>}
          {error   && <div style={{textAlign:'center',padding:80,color:'#DC2626',fontSize:13}}>{error}</div>}

          {!loading && !error && month && total && (<>

            {/* Total KPI row */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:10,marginBottom:16}}>
              {pill('TOTAL SPEND',    fmtINR(total.spend),    '#1F3C84','#E8EFF9')}
              {pill('TOTAL LEADS',    fmtNum(total.leads),    '#1C9FD4','#E3F5FD')}
              {pill('CPL',            fmtINR(total.cpl),      '#D97706','#FEF9C3')}
              {pill('CPQL',           fmtINR(total.cpql),     '#7C3AED','#F5F3FF')}
              {pill('APPLICATIONS',   fmtNum(total.apps),     '#059669','#E9F8EF')}
              {pill('TOTAL REVENUE',  fmtINR(total.totalRev),'#166534','#E9F8EF')}
              {pill('ROAS',           total.roas>0?total.roas.toFixed(2)+'x':'—','#991B1B','#FEF2F2')}
            </div>

            {/* QL + RAU row */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:10,marginBottom:20}}>
              {pill('FW QUALIFIED',    fmtNum(total.fwQual),   '#1F3C84','#E8EFF9')}
              {pill('FW QL%',          total.fwQL.toFixed(2)+'%','#1C9FD4','#E3F5FD')}
              {pill('SB QUALIFIED',    fmtNum(total.sbQual),   '#29B9C3','#E4F8F9')}
              {pill('SB QL%',          total.sbQL.toFixed(2)+'%','#4CAE6F','#E9F8EF')}
              {pill('EST. RAU',        total.rau.toFixed(1),   '#D97706','#FEF9C3')}
            </div>

            {/* Charts row */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,marginBottom:20}}>
              <div style={{background:'var(--color-background-primary)',border:'0.5px solid #E5E7EB',borderRadius:12,padding:'18px 16px'}}>
                <div style={{fontSize:13,fontWeight:600,color:'var(--color-text-primary)',marginBottom:4}}>Spend by Source</div>
                <div style={{fontSize:11,color:'#9CA3AF',marginBottom:14}}>In Lakhs (₹L)</div>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={spendChart} margin={{top:0,right:4,left:-10,bottom:0}}>
                    <XAxis dataKey="name" tick={{fontSize:10}} />
                    <YAxis tick={{fontSize:10}} />
                    <Tooltip formatter={(v)=>'₹'+v+'L'} />
                    <Bar dataKey="value" radius={[4,4,0,0]}>
                      {spendChart.map((e,i)=><Cell key={i} fill={SRC_COLOR[e.name]||'#9CA3AF'}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div style={{background:'var(--color-background-primary)',border:'0.5px solid #E5E7EB',borderRadius:12,padding:'18px 16px'}}>
                <div style={{fontSize:13,fontWeight:600,color:'var(--color-text-primary)',marginBottom:4}}>Revenue by Source</div>
                <div style={{fontSize:11,color:'#9CA3AF',marginBottom:14}}>In Lakhs (₹L)</div>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={revChart} margin={{top:0,right:4,left:-10,bottom:0}}>
                    <XAxis dataKey="name" tick={{fontSize:10}} />
                    <YAxis tick={{fontSize:10}} />
                    <Tooltip formatter={(v)=>'₹'+v+'L'} />
                    <Bar dataKey="value" radius={[4,4,0,0]}>
                      {revChart.map((e,i)=><Cell key={i} fill={SRC_COLOR[e.name]||'#9CA3AF'}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div style={{background:'var(--color-background-primary)',border:'0.5px solid #E5E7EB',borderRadius:12,padding:'18px 16px'}}>
                <div style={{fontSize:13,fontWeight:600,color:'var(--color-text-primary)',marginBottom:4}}>Lead Quality % by Source</div>
                <div style={{fontSize:11,color:'#9CA3AF',marginBottom:14}}>Futwork vs Superbot</div>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={qlChart} margin={{top:0,right:4,left:-10,bottom:0}}>
                    <XAxis dataKey="name" tick={{fontSize:10}} />
                    <YAxis tick={{fontSize:10}} unit="%" />
                    <Tooltip formatter={(v)=>v.toFixed(2)+'%'} />
                    <Legend iconSize={8} wrapperStyle={{fontSize:10}} />
                    <Bar dataKey="futwork" name="Futwork" fill="#1F3C84" radius={[3,3,0,0]} />
                    <Bar dataKey="superbot" name="Superbot" fill="#1C9FD4" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Source breakdown table */}
            <div style={{background:'var(--color-background-primary)',border:'0.5px solid #E5E7EB',borderRadius:12,overflow:'hidden',marginBottom:20}}>
              <div style={{padding:'14px 18px',borderBottom:'0.5px solid #E5E7EB',display:'flex',alignItems:'center',gap:10}}>
                <div style={{fontSize:13,fontWeight:600,color:'var(--color-text-primary)'}}>Source Breakdown</div>
                <div style={{fontSize:11,color:'#9CA3AF'}}>{month.name}</div>
              </div>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12.5}}>
                  <thead>
                    <tr style={{background:'#F9FAFB',borderBottom:'0.5px solid #E5E7EB'}}>
                      {['Source','Spend','Leads','CPL','FW Qual','FW QL%','SB Qual','SB QL%','APPs','CPQL','CPA','Total Rev','ROAS'].map(h=>(
                        <th key={h} style={{padding:'9px 14px',fontWeight:600,color:'#6B7280',textAlign:h==='Source'?'left':'right',whiteSpace:'nowrap',fontSize:11}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sources.filter(s=>s.spend>0||s.leads>0).map((s,i)=>(
                      <tr key={s.source} style={{borderBottom:'0.5px solid #F3F4F6',background:i%2===0?'transparent':'#FAFBFF'}}>
                        <td style={{padding:'10px 14px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:8}}>
                            <span style={{width:8,height:8,borderRadius:'50%',background:SRC_COLOR[s.source]||'#9CA3AF',display:'inline-block',flexShrink:0}}/>
                            <span style={{fontWeight:600,color:'var(--color-text-primary)'}}>{s.source}</span>
                          </div>
                        </td>
                        <td style={{padding:'10px 14px',textAlign:'right',fontWeight:600,color:'#111827'}}>{fmtINR(s.spend)}</td>
                        <td style={{padding:'10px 14px',textAlign:'right',color:'#374151'}}>{fmtNum(s.leads)}</td>
                        <td style={{padding:'10px 14px',textAlign:'right',fontWeight:600,color:s.cpl>500?'#DC2626':s.cpl>250?'#D97706':'#059669'}}>{fmtINR(s.cpl)}</td>
                        <td style={{padding:'10px 14px',textAlign:'right',color:'#374151'}}>{fmtNum(s.fwQual)}</td>
                        <td style={{padding:'10px 14px',textAlign:'right',fontWeight:500,color:s.fwQL>15?'#059669':s.fwQL>5?'#D97706':'#DC2626'}}>{s.fwQL.toFixed(2)}%</td>
                        <td style={{padding:'10px 14px',textAlign:'right',color:'#374151'}}>{fmtNum(s.sbQual)}</td>
                        <td style={{padding:'10px 14px',textAlign:'right',fontWeight:500,color:s.sbQL>1?'#059669':'#D97706'}}>{s.sbQL.toFixed(2)}%</td>
                        <td style={{padding:'10px 14px',textAlign:'right',color:'#374151'}}>{fmtNum(s.apps)}</td>
                        <td style={{padding:'10px 14px',textAlign:'right',color:'#374151'}}>{fmtINR(s.cpql)}</td>
                        <td style={{padding:'10px 14px',textAlign:'right',color:'#374151'}}>{fmtINR(s.cpa)}</td>
                        <td style={{padding:'10px 14px',textAlign:'right',fontWeight:600,color:'#166534'}}>{fmtINR(s.totalRev)}</td>
                        <td style={{padding:'10px 14px',textAlign:'right',fontWeight:700,color:s.roas>=3?'#166534':s.roas>=1.5?'#D97706':'#DC2626'}}>{s.roas>0?s.roas.toFixed(2)+'x':'—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Revenue detail */}
            <div style={{background:'var(--color-background-primary)',border:'0.5px solid #E5E7EB',borderRadius:12,overflow:'hidden'}}>
              <div style={{padding:'14px 18px',borderBottom:'0.5px solid #E5E7EB'}}>
                <div style={{fontSize:13,fontWeight:600,color:'var(--color-text-primary)'}}>Revenue Detail</div>
              </div>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12.5}}>
                  <thead>
                    <tr style={{background:'#F9FAFB',borderBottom:'0.5px solid #E5E7EB'}}>
                      {['Source','SR Revenue','AC Revenue','VAS Revenue','Total Revenue','Est. RAU'].map(h=>(
                        <th key={h} style={{padding:'9px 14px',fontWeight:600,color:'#6B7280',textAlign:h==='Source'?'left':'right',whiteSpace:'nowrap',fontSize:11}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[total,...sources.filter(s=>s.totalRev>0)].map((s,i)=>(
                      <tr key={s.source} style={{borderBottom:'0.5px solid #F3F4F6',background:s.source==='Total'?'#F9FAFB':i%2===0?'transparent':'#FAFBFF'}}>
                        <td style={{padding:'10px 14px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:8}}>
                            <span style={{width:8,height:8,borderRadius:'50%',background:SRC_COLOR[s.source]||'#374151',display:'inline-block',flexShrink:0}}/>
                            <span style={{fontWeight:s.source==='Total'?700:600,color:'var(--color-text-primary)'}}>{s.source}</span>
                          </div>
                        </td>
                        <td style={{padding:'10px 14px',textAlign:'right',color:'#374151'}}>{fmtINR(s.srRev)}</td>
                        <td style={{padding:'10px 14px',textAlign:'right',color:'#374151'}}>{fmtINR(s.acRev)}</td>
                        <td style={{padding:'10px 14px',textAlign:'right',color:'#374151'}}>{fmtINR(s.vasRev)}</td>
                        <td style={{padding:'10px 14px',textAlign:'right',fontWeight:700,color:'#166534'}}>{fmtINR(s.totalRev)}</td>
                        <td style={{padding:'10px 14px',textAlign:'right',color:'#374151'}}>{s.rau>0?s.rau.toFixed(2):'—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </>)}
        </div>
      </div>
    </div>
  )
      }
