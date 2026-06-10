import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, Cell, PieChart, Pie
} from 'recharts'
import Sidebar from '../components/Sidebar'

const SHEET_CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRVF7R3Me4QPVaRS_n_OufcMrrgYvCt3Rs7yJUG0u4gEMd0cVL9IyP2aV6J8HDjOZrvWzcemgHwZaHs/pub?gid=0&single=true&output=csv'

const C = {
  navy:'#1F3C84', blue:'#1C9FD4', cyan:'#29B9C3', green:'#4CAE6F',
  amber:'#F59E0B', navyBg:'#E8EFF9', blueBg:'#E3F5FD', cyanBg:'#E4F8F9', greenBg:'#E9F8EF',
  border:'#E5E7EB', text:'#0F172A', muted:'#94A3B8', sub:'#475569', bg:'#F4F6F9',
}
const PROVIDER_COLORS = { Futwork: C.navy, Superbot: C.blue }
const SOURCE_COLORS = {
  Facebook:'#1F3C84', Google:'#1C9FD4', Affiliate:'#4CAE6F',
  'Content+Brand':'#F59E0B', Bing:'#9CA3AF', Referral:'#0D9488', Others:'#9CA3AF',
}
const FONT = "'Plus Jakarta Sans','Inter',sans-serif"

function fmtN(n) {
  if (!n && n!==0) return '—'
  return Math.round(n).toLocaleString('en-IN')
}
function pct(a,b){ return b>0?((a/b)*100).toFixed(1)+'%':'—' }

function parseCSV(csv) {
  const rows = csv.trim().split('\n').map(r=>{
    const cols=[];let buf='',inQ=false
    for(const ch of r){if(ch==='"'){inQ=!inQ}else if(ch===','&&!inQ){cols.push(buf.trim());buf=''}else buf+=ch}
    cols.push(buf.trim()); return cols
  })
  const [hdr,...data]=rows
  const h=k=>hdr.indexOf(k)
  return data.filter(r=>r[h('provider')]).map(r=>({
    provider:r[h('provider')]||'',
    month_start:r[h('month_start')]||'',
    month:r[h('qualified_month')]||'',
    campaign:(r[h('opp_first_campaign_name')]||'').trim(),
    source:(r[h('source')]||'Others').trim(),
    sub_source:(r[h('sub_source')]||'').trim(),
    count:parseInt(r[h('qualified_count')])||0,
  }))
}

// ── shared components ────────────────────────────────────────────────────────
const KPICard = ({label,value,sub,accent=C.navy,bg=C.navyBg,delta}) => (
  <div style={{background:'#fff',border:`0.5px solid ${C.border}`,borderRadius:10,padding:'14px 16px',borderTop:`3px solid ${accent}`}}>
    <div style={{fontSize:9.5,fontWeight:700,color:C.muted,letterSpacing:'0.07em',textTransform:'uppercase',marginBottom:6,fontFamily:FONT}}>{label}</div>
    <div style={{fontSize:22,fontWeight:700,color:C.text,letterSpacing:'-0.5px',lineHeight:1,fontFamily:FONT}}>{value}</div>
    <div style={{display:'flex',alignItems:'center',gap:6,marginTop:5}}>
      {sub&&<div style={{fontSize:11,color:C.muted,fontFamily:FONT}}>{sub}</div>}
      {delta!=null&&<span style={{fontSize:10,fontWeight:700,padding:'1px 6px',borderRadius:10,background:delta>=0?C.greenBg:'#FEF2F2',color:delta>=0?'#059669':'#DC2626',fontFamily:FONT}}>
        {delta>=0?'▲':'▼'}{Math.abs(delta).toFixed(1)}%
      </span>}
    </div>
  </div>
)
const Card = ({title,sub,children,action}) => (
  <div style={{background:'#fff',border:`0.5px solid ${C.border}`,borderRadius:12,overflow:'hidden'}}>
    <div style={{padding:'14px 18px 12px',borderBottom:`0.5px solid #F3F4F6`,display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
      <div>
        <div style={{fontSize:13,fontWeight:600,color:C.text,fontFamily:FONT}}>{title}</div>
        {sub&&<div style={{fontSize:11,color:C.muted,marginTop:2,fontFamily:FONT}}>{sub}</div>}
      </div>
      {action&&<div style={{flexShrink:0}}>{action}</div>}
    </div>
    <div style={{padding:'14px 18px'}}>{children}</div>
  </div>
)
const Tip = ({active,payload,label})=>{
  if(!active||!payload?.length)return null
  return(
    <div style={{background:'#fff',border:`0.5px solid ${C.border}`,borderRadius:8,padding:'9px 13px',fontSize:12,boxShadow:'0 4px 16px rgba(0,0,0,0.08)',fontFamily:FONT}}>
      <div style={{fontWeight:700,marginBottom:6,color:C.text}}>{label}</div>
      {payload.map(p=><div key={p.name} style={{color:p.color,marginBottom:2}}>{p.name}: <b>{fmtN(p.value)}</b></div>)}
    </div>
  )
}
const PieLbl=({cx,cy,midAngle,outerRadius,percent,name})=>{
  if(percent<0.06)return null
  const r=outerRadius+22,rad=Math.PI/180
  const x=cx+r*Math.cos(-midAngle*rad),y=cy+r*Math.sin(-midAngle*rad)
  return <text x={x} y={y} textAnchor={x>cx?'start':'end'} dominantBaseline='central'
    style={{fontSize:10,fontWeight:600,fill:'#374151',fontFamily:FONT}}>
    {name} {(percent*100).toFixed(0)}%
  </text>
}
const SelBtn=({options,value,onChange,label})=>(
  <div style={{display:'flex',alignItems:'center',gap:6}}>
    {label&&<span style={{fontSize:11,color:C.muted,fontFamily:FONT,whiteSpace:'nowrap'}}>{label}</span>}
    <select value={value} onChange={e=>onChange(e.target.value)}
      style={{padding:'6px 10px',borderRadius:8,border:`0.5px solid ${C.border}`,fontSize:12,fontWeight:500,fontFamily:FONT,background:'#fff',color:C.text,cursor:'pointer',outline:'none'}}>
      {options.map(o=><option key={o} value={o}>{o}</option>)}
    </select>
  </div>
)

export default function LeadQualificationDashboard(){
  const [rows,setRows]         = useState([])
  const [months,setMonths]     = useState([])
  const [selMonth,setSelMonth] = useState('')
  const [selProvider,setSelProvider] = useState('All')
  const [selSource,setSelSource]     = useState('All')
  const [loading,setLoading]   = useState(true)
  const [lastSync,setLastSync] = useState(null)
  const [search,setSearch]     = useState('')
  const [sortCol,setSortCol]   = useState('count')
  const [sortDir,setSortDir]   = useState('desc')
  const [page,setPage]         = useState(0)
  const PAGE_SIZE               = 10
  const [showInfo,setShowInfo] = useState(false)

  const loadData = useCallback(async(bust=false)=>{
    setLoading(true)
    const t0=Date.now()
    try{
      const url=bust?SHEET_CSV+'&_='+Date.now():SHEET_CSV
      const res=await fetch(url)
      const csv=await res.text()
      const parsed=parseCSV(csv)
      setRows(parsed)
      const ms=[...new Set(parsed.map(r=>r.month))].filter(Boolean).sort()
      setMonths(ms)
      setSelMonth(prev=>prev||ms[ms.length-1]||'')
      setLastSync(new Date())
    }catch(e){console.error('QL fetch',e)}
    finally{setTimeout(()=>setLoading(false),Math.max(0,750-(Date.now()-t0)))}
  },[])

  useEffect(()=>{loadData()},[loadData])

  // derived
  const monthRows  = useMemo(()=>rows.filter(r=>r.month===selMonth),[rows,selMonth])
  const providers  = useMemo(()=>['All',...[...new Set(monthRows.map(r=>r.provider))].filter(Boolean).sort()],[monthRows])
  const sources    = useMemo(()=>['All',...[...new Set(monthRows.map(r=>r.source))].filter(Boolean).sort()],[monthRows])
  const filtered   = useMemo(()=>monthRows
    .filter(r=>(selProvider==='All'||r.provider===selProvider)&&(selSource==='All'||r.source===selSource)),[monthRows,selProvider,selSource])

  // KPIs
  const totals = useMemo(()=>{
    const fw=monthRows.filter(r=>r.provider==='Futwork').reduce((s,r)=>s+r.count,0)
    const sb=monthRows.filter(r=>r.provider==='Superbot').reduce((s,r)=>s+r.count,0)
    const prevM=months[months.indexOf(selMonth)-1]
    const prevRows=prevM?rows.filter(r=>r.month===prevM):[]
    const prevFw=prevRows.filter(r=>r.provider==='Futwork').reduce((s,r)=>s+r.count,0)
    const prevSb=prevRows.filter(r=>r.provider==='Superbot').reduce((s,r)=>s+r.count,0)
    const prevTotal=prevFw+prevSb
    const curTotal=fw+sb
    const totalDelta=prevTotal>0?((curTotal-prevTotal)/prevTotal*100):null
    const fwDelta=prevFw>0?((fw-prevFw)/prevFw*100):null
    const sbDelta=prevSb>0?((sb-prevSb)/prevSb*100):null
    return{fw,sb,total:curTotal,totalDelta,fwDelta,sbDelta}
  },[monthRows,rows,months,selMonth])

  // source stacked bar
  const sourceBar = useMemo(()=>{
    const map={}
    filtered.forEach(r=>{
      const src=r.source||'Others'
      if(!map[src])map[src]={source:src,Futwork:0,Superbot:0}
      map[src][r.provider]=(map[src][r.provider]||0)+r.count
    })
    return Object.values(map).sort((a,b)=>(b.Futwork+b.Superbot)-(a.Futwork+a.Superbot)).slice(0,8)
  },[filtered])

  // provider pie
  const provPie = useMemo(()=>[
    {name:'Futwork',value:filtered.filter(r=>r.provider==='Futwork').reduce((s,r)=>s+r.count,0)},
    {name:'Superbot',value:filtered.filter(r=>r.provider==='Superbot').reduce((s,r)=>s+r.count,0)},
  ].filter(d=>d.value>0),[filtered])

  // trend
  const trend = useMemo(()=>months.map(m=>{
    const mr=rows.filter(r=>r.month===m)
    return{month:m,
      Futwork:mr.filter(r=>r.provider==='Futwork').reduce((s,r)=>s+r.count,0),
      Superbot:mr.filter(r=>r.provider==='Superbot').reduce((s,r)=>s+r.count,0)}
  }),[rows,months])

  // top campaigns (filtered)
  const topCampaigns = useMemo(()=>{
    const map={}
    filtered.forEach(r=>{
      const k=r.campaign+'||'+r.provider
      if(!map[k])map[k]={campaign:r.campaign.slice(0,40)+(r.campaign.length>40?'…':''),provider:r.provider,count:0}
      map[k].count+=r.count
    })
    return Object.values(map).sort((a,b)=>b.count-a.count).slice(0,10)
  },[filtered])

  // table
  const tableRows = useMemo(()=>{
    const q=search.toLowerCase()
    return filtered
      .filter(r=>!q||r.campaign.toLowerCase().includes(q)||r.source.toLowerCase().includes(q)||r.provider.toLowerCase().includes(q))
      .sort((a,b)=>{
        const av=sortCol==='count'?a.count:sortCol==='provider'?a.provider:sortCol==='source'?a.source:a.campaign
        const bv=sortCol==='count'?b.count:sortCol==='provider'?b.provider:sortCol==='source'?b.source:b.campaign
        if(typeof av==='number')return sortDir==='desc'?bv-av:av-bv
        return sortDir==='desc'?bv.localeCompare(av):av.localeCompare(bv)
      })
  },[filtered,search,sortCol,sortDir])
  const totalPages = Math.ceil(tableRows.length/PAGE_SIZE)
  const pageRows   = tableRows.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE)

  const sortBy=col=>{setSortCol(col);setSortDir(d=>sortCol===col?(d==='desc'?'asc':'desc'):'desc');setPage(0)}
  const onSearch=v=>{setSearch(v);setPage(0)}
  const thS=col=>({fontSize:10,fontWeight:700,color:C.muted,letterSpacing:'0.06em',textTransform:'uppercase',padding:'9px 10px',cursor:'pointer',userSelect:'none',fontFamily:FONT,background:sortCol===col?'#F8FAFF':'transparent',whiteSpace:'nowrap'})

  return(
    <div style={{display:'flex',height:'100vh',overflow:'hidden',background:C.bg,fontFamily:FONT}}>
      <Sidebar/>
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{background:'#fff',borderBottom:`0.5px solid ${C.border}`,padding:'10px 24px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexShrink:0}}>
          <div>
            <p style={{fontSize:10.5,color:C.muted,margin:0,letterSpacing:'0.04em',textTransform:'uppercase',fontFamily:FONT}}>Dashboards / QL Ops</p>
            <h1 style={{fontSize:17,fontWeight:700,color:C.text,margin:'2px 0 0',letterSpacing:'-0.3px',fontFamily:FONT}}>Lead Qualification · {selMonth||'—'}</h1>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
            {months.length>0&&(
              <select value={selMonth} onChange={e=>setSelMonth(e.target.value)}
                style={{padding:'6px 10px',borderRadius:8,border:`0.5px solid ${C.border}`,fontSize:12,fontWeight:600,fontFamily:FONT,background:'#fff',color:C.text,cursor:'pointer',outline:'none'}}>
                {[...months].reverse().map(m=><option key={m} value={m}>{m}</option>)}
              </select>
            )}
            <SelBtn label="Provider" options={providers} value={selProvider} onChange={v=>{setSelProvider(v);setPage(0)}} />
            <SelBtn label="Source" options={sources} value={selSource} onChange={v=>{setSelSource(v);setPage(0)}} />
            {lastSync&&<span style={{fontSize:11,color:C.muted,fontFamily:FONT}}>Synced {lastSync.toLocaleTimeString()}</span>}
            <button onClick={()=>loadData(true)} disabled={loading} className="lqRefreshBtn"
              style={{padding:'6px 14px',borderRadius:8,border:`0.5px solid ${C.border}`,fontSize:12,fontWeight:500,cursor:loading?'wait':'pointer',fontFamily:FONT,background:'#fff',color:'#374151',display:'flex',alignItems:'center',gap:6,opacity:loading?0.65:1}}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{animation:loading?'spin .8s linear infinite':'none'}}>
                <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
              {loading?'Refreshing':'Refresh'}
            </button>
            <div style={{position:'relative'}}>
              <button onClick={()=>setShowInfo(v=>!v)}
                style={{width:30,height:30,borderRadius:8,border:`0.5px solid ${C.border}`,background:showInfo?C.navyBg:'#fff',color:C.navy,fontSize:14,fontWeight:700,fontStyle:'italic',fontFamily:'Georgia,serif',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>i</button>
              {showInfo&&<div onClick={()=>setShowInfo(false)} style={{position:'fixed',inset:0,zIndex:150}}/>}
              {showInfo&&(
                <div style={{position:'absolute',right:0,top:'calc(100% + 8px)',zIndex:200,width:340,background:'#fff',border:`0.5px solid ${C.border}`,borderRadius:12,boxShadow:'0 14px 40px rgba(15,23,42,0.16)',padding:'16px 18px',fontFamily:FONT}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:8}}>How metrics are calculated</div>
                  {[
                    ['qualified_count','Leads processed by that provider from that campaign in that month that were marked as qualified.'],
                    ['Total Qualified','Sum of qualified_count across all providers and sources for the selected month.'],
                    ['Provider split','Each provider\'s total as a share of the combined total (with MoM delta).'],
                    ['Source bar','Qualified leads grouped by originating source (Facebook, Google, Affiliate…), stacked per provider. Filters apply.'],
                    ['Trend','Total qualified per provider per calendar month across all history.'],
                    ['Top campaigns','Top 10 campaigns by qualified_count for the selected month (Provider/Source filters apply).'],
                    ['MoM delta','% change vs the immediately preceding month in this dataset.'],
                  ].map(([m,d])=>(
                    <div key={m} style={{display:'flex',gap:10,padding:'7px 0',borderTop:`0.5px solid #F3F4F6`}}>
                      <div style={{fontSize:11.5,fontWeight:700,color:C.navy,width:110,flexShrink:0}}>{m}</div>
                      <div style={{fontSize:11.5,color:C.sub,lineHeight:1.45}}>{d}</div>
                    </div>
                  ))}
                  <div style={{marginTop:10,padding:'10px 12px',background:C.navyBg,borderRadius:8,fontSize:11,color:C.navy,lineHeight:1.5}}>
                    <b>Filters:</b> Provider and Source dropdowns in the header filter the top-campaigns chart and the table. The KPI cards and trend chart always show the full month.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div style={{flex:1,overflowY:'auto',padding:'18px 24px'}}>
          {loading&&rows.length===0?(
            <div style={{textAlign:'center',paddingTop:80,color:C.muted}}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{animation:'spin .8s linear infinite'}}>
                <circle cx="12" cy="12" r="10" strokeOpacity=".2"/><path d="M12 2a10 10 0 0 1 10 10" stroke={C.blue}/>
              </svg>
              <p style={{marginTop:12,fontSize:13,fontFamily:FONT}}>Loading qualification data…</p>
            </div>
          ):(
            <>
              {/* KPIs */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:16}}>
                <KPICard label="Total Qualified" value={fmtN(totals.total)} sub={selMonth} delta={totals.totalDelta} accent={C.navy} />
                <KPICard label="Futwork" value={fmtN(totals.fw)} sub={pct(totals.fw,totals.total)+' of total'} delta={totals.fwDelta} accent={C.navy} />
                <KPICard label="Superbot" value={fmtN(totals.sb)} sub={pct(totals.sb,totals.total)+' of total'} delta={totals.sbDelta} accent={C.blue} bg={C.blueBg} />
                <KPICard label="FW : SB Split" value={totals.total>0?pct(totals.fw,totals.total)+' / '+pct(totals.sb,totals.total):'—'} sub="Futwork share / Superbot share" accent={C.cyan} bg={C.cyanBg} />
              </div>

              {/* Charts row 1 */}
              <div style={{display:'grid',gridTemplateColumns:'1.4fr 0.6fr',gap:14,marginBottom:14}}>
                <Card title="Qualified by source" sub="Stacked by provider · all sources for selected month">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={sourceBar} margin={{top:4,right:8,left:0,bottom:44}}>
                      <XAxis dataKey="source" tick={{fontSize:10,fill:'#6B7280',fontFamily:FONT}} angle={-35} textAnchor="end" interval={0}/>
                      <YAxis tick={{fontSize:10,fill:'#6B7280',fontFamily:FONT}} tickFormatter={v=>fmtN(v)}/>
                      <Tooltip content={<Tip/>}/>
                      <Legend wrapperStyle={{fontSize:11,fontFamily:FONT}}/>
                      <Bar dataKey="Futwork" stackId="a" fill={C.navy} radius={[0,0,0,0]}/>
                      <Bar dataKey="Superbot" stackId="a" fill={C.blue} radius={[4,4,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
                <Card title="Provider share" sub="Selected month">
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={provPie} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                        dataKey="value" labelLine={false} label={PieLbl} isAnimationActive={false}>
                        {provPie.map((e,i)=><Cell key={i} fill={PROVIDER_COLORS[e.name]||C.muted}/>)}
                      </Pie>
                      <Tooltip content={<Tip/>}/>
                    </PieChart>
                  </ResponsiveContainer>
                </Card>
              </div>

              {/* Trend */}
              <div style={{marginBottom:14}}>
                <Card title="Month-on-month trend" sub="Total qualified per provider across all months">
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={trend} margin={{top:4,right:16,left:0,bottom:4}}>
                      <XAxis dataKey="month" tick={{fontSize:10,fill:'#6B7280',fontFamily:FONT}}/>
                      <YAxis tick={{fontSize:10,fill:'#6B7280',fontFamily:FONT}} tickFormatter={v=>fmtN(v)}/>
                      <Tooltip content={<Tip/>}/>
                      <Legend wrapperStyle={{fontSize:11,fontFamily:FONT}}/>
                      <Line type="monotone" dataKey="Futwork" stroke={C.navy} strokeWidth={2} dot={{r:3}}/>
                      <Line type="monotone" dataKey="Superbot" stroke={C.blue} strokeWidth={2} dot={{r:3}}/>
                    </LineChart>
                  </ResponsiveContainer>
                </Card>
              </div>

              {/* Top campaigns */}
              <div style={{marginBottom:14}}>
                <Card title="Top 10 campaigns by qualified leads"
                  sub={(selProvider!=='All'||selSource!=='All')?`Filtered: ${selProvider!=='All'?selProvider:'All providers'} · ${selSource!=='All'?selSource:'All sources'}`:'Selected month · coloured by provider'}
                  action={
                    <div style={{display:'flex',gap:12,alignItems:'center'}}>
                      {Object.entries(PROVIDER_COLORS).map(([p,c])=>(
                        <div key={p} style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:C.sub,fontFamily:FONT}}>
                          <div style={{width:10,height:10,borderRadius:2,background:c}}/>{p}
                        </div>
                      ))}
                    </div>
                  }>
                  {topCampaigns.length===0
                    ?<div style={{textAlign:'center',padding:'32px 0',color:C.muted,fontSize:13,fontFamily:FONT}}>No data for selected filters</div>
                    :<ResponsiveContainer width="100%" height={Math.max(200,topCampaigns.length*32)}>
                      <BarChart data={topCampaigns} layout="vertical" margin={{top:4,right:40,left:8,bottom:4}}>
                        <XAxis type="number" tick={{fontSize:10,fill:'#6B7280',fontFamily:FONT}} tickFormatter={v=>fmtN(v)}/>
                        <YAxis type="category" dataKey="campaign" tick={{fontSize:10,fill:'#6B7280',fontFamily:FONT}} width={240}/>
                        <Tooltip content={<Tip/>}/>
                        <Bar dataKey="count" radius={[0,4,4,0]}>
                          {topCampaigns.map((e,i)=><Cell key={i} fill={PROVIDER_COLORS[e.provider]||C.muted}/>)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  }
                </Card>
              </div>

              {/* Table */}
              <Card title="Campaign breakdown"
                sub={`${tableRows.length.toLocaleString()} rows · ${selMonth}${selProvider!=='All'?' · '+selProvider:''}${selSource!=='All'?' · '+selSource:''}`}
                action={
                  <input value={search} onChange={e=>onSearch(e.target.value)} placeholder="Search campaign, source…"
                    style={{padding:'5px 10px',borderRadius:8,border:`0.5px solid ${C.border}`,fontSize:12,fontFamily:FONT,outline:'none',width:220}}/>
                }>
                <div style={{overflowX:'auto'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                    <thead>
                      <tr style={{borderBottom:`0.5px solid ${C.border}`}}>
                        {[['campaign','Campaign'],['provider','Provider'],['source','Source'],['sub_source','Sub-source'],['count','Qualified']].map(([col,lbl])=>(
                          <th key={col} style={thS(col)} onClick={()=>sortBy(col)}>
                            {lbl} <span style={{opacity:sortCol===col?1:0.3}}>{sortCol===col?(sortDir==='desc'?'↓':'↑'):'↕'}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((r,i)=>(
                        <tr key={i} style={{borderBottom:`0.5px solid #F3F4F6`,background:i%2?'#FAFBFC':'#fff'}}>
                          <td style={{padding:'8px 10px',color:C.text,maxWidth:340,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontFamily:FONT}} title={r.campaign}>{r.campaign||'—'}</td>
                          <td style={{padding:'8px 10px',fontFamily:FONT}}>
                            <span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:10,background:r.provider==='Futwork'?C.navyBg:C.blueBg,color:r.provider==='Futwork'?C.navy:C.blue}}>
                              {r.provider}
                            </span>
                          </td>
                          <td style={{padding:'8px 10px',color:C.sub,fontFamily:FONT}}>{r.source}</td>
                          <td style={{padding:'8px 10px',color:C.muted,fontSize:11,fontFamily:FONT}}>{r.sub_source||'—'}</td>
                          <td style={{padding:'8px 10px',fontWeight:700,color:C.text,textAlign:'right',fontFamily:FONT}}>{r.count.toLocaleString('en-IN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {totalPages>1&&(
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 0 4px',marginTop:4,borderTop:`0.5px solid ${C.border}`}}>
                      <span style={{fontSize:11,color:C.muted,fontFamily:FONT}}>{page*PAGE_SIZE+1}–{Math.min((page+1)*PAGE_SIZE,tableRows.length)} of {tableRows.length.toLocaleString()} rows</span>
                      <div style={{display:'flex',gap:6,alignItems:'center'}}>
                        <button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0}
                          style={{padding:'4px 12px',borderRadius:7,border:`0.5px solid ${C.border}`,background:'#fff',fontSize:12,fontWeight:500,fontFamily:FONT,cursor:page===0?'not-allowed':'pointer',opacity:page===0?0.4:1}}>← Prev</button>
                        {Array.from({length:Math.min(7,totalPages)},(_,i)=>{
                          const start=Math.max(0,Math.min(page-3,totalPages-7)); const p=start+i
                          return <button key={p} onClick={()=>setPage(p)}
                            style={{width:30,height:28,borderRadius:7,border:`0.5px solid ${p===page?C.navy:C.border}`,background:p===page?C.navy:'#fff',color:p===page?'#fff':C.text,fontSize:12,fontWeight:p===page?700:400,fontFamily:FONT,cursor:'pointer'}}>{p+1}</button>
                        })}
                        <button onClick={()=>setPage(p=>Math.min(totalPages-1,p+1))} disabled={page===totalPages-1}
                          style={{padding:'4px 12px',borderRadius:7,border:`0.5px solid ${C.border}`,background:'#fff',fontSize:12,fontWeight:500,fontFamily:FONT,cursor:page===totalPages-1?'not-allowed':'pointer',opacity:page===totalPages-1?0.4:1}}>Next →</button>
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
