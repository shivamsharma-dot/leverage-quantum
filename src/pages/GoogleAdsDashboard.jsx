import React,{useState,useEffect,useCallback,useRef} from 'react'
import{useSearchParams}from 'react-router-dom'
import{BarChart,Bar,XAxis,YAxis,Tooltip,ResponsiveContainer,LabelList}from 'recharts'
import Sidebar from '../components/Sidebar'
import { InlineLoader } from '../components/SkeletonLoader'
import { C, FONT, fmtN, Card, PremKPI, KPI_ICONS } from '../ui/dashboardKit'

const DATE_RANGES=[{id:'TODAY',label:'Today'},{id:'LAST_7_DAYS',label:'Last 7 days'},{id:'LAST_30_DAYS',label:'Last 30 days'},{id:'LAST_90_DAYS',label:'Last 90 days'},{id:'THIS_MONTH',label:'This month'},{id:'LAST_MONTH',label:'Last month'},{id:'CUSTOM',label:'Custom'}]
const TABS=[{id:'campaigns',label:'Campaigns'},{id:'keywords',label:'Keywords'},{id:'searchTerms',label:'Search terms'},{id:'adGroups',label:'Ad groups'}]

const fmt=n=>n==null?'—':n>=1e7?'₹'+(n/1e7).toFixed(2)+' Cr':n>=1e5?'₹'+(n/1e5).toFixed(1)+'L':n>=1000?'₹'+(n/1000).toFixed(1)+'K':'₹'+Math.round(n).toLocaleString('en-IN')
const fmtPct=n=>n==null?'—':(n*100).toFixed(2)+'%'
const fmtCpc=n=>n==null?'—':'₹'+n.toFixed(2)

const pillStyle=active=>({padding:'5px 14px',borderRadius:999,fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:FONT,border:'0.5px solid '+(active?C.navy:C.border),background:active?C.navy:'var(--card)',color:active?'#fff':C.sub,transition:'all .15s',whiteSpace:'nowrap'})
const tabBtn=active=>({padding:'8px 16px',borderRadius:8,fontSize:12.5,fontWeight:700,cursor:'pointer',fontFamily:FONT,border:'0.5px solid '+(active?C.navy:C.border),background:active?C.navy:'var(--card)',color:active?'#fff':C.sub,transition:'all .15s'})

const StatusBadge=({s})=>{
const map={ENABLED:{bg:C.greenBg,color:C.green,dot:C.green,label:'Active'},PAUSED:{bg:'#FEF9C3',color:'#D97706',dot:'#D97706',label:'Paused'},REMOVED:{bg:'#FEF2F2',color:'#DC2626',dot:'#DC2626',label:'Removed'}}
const v=map[s]||{bg:'#F3F4F6',color:'#6B7280',dot:'#9CA3AF',label:s||'Unknown'}
return <span style={{background:v.bg,color:v.color,fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:10,display:'inline-flex',alignItems:'center',gap:4,fontFamily:FONT}}><span style={{width:6,height:6,borderRadius:'50%',background:v.dot,display:'inline-block'}}/>{v.label}</span>
}

const TypeTag=({t})=>{
const map={SEARCH:{bg:C.blueBg,color:C.blue,label:'Search'},DISPLAY:{bg:C.greenBg,color:C.green,label:'Display'},SHOPPING:{bg:'#FEF9C3',color:'#D97706',label:'Shopping'},VIDEO:{bg:'#FEF2F2',color:'#DC2626',label:'Video'},PERFORMANCE_MAX:{bg:'#F5F3FF',color:'#7C3AED',label:'PMax'}}
const v=map[t]||{bg:'#F3F4F6',color:'#6B7280',label:t||'Other'}
return <span style={{background:v.bg,color:v.color,fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:8,fontFamily:FONT}}>{v.label}</span>
}

function useSort(defaultKey,defaultDir='desc'){
const [key,setKey]=useState(defaultKey)
const [dir,setDir]=useState(defaultDir)
const toggle=k=>{ if(k===key)setDir(d=>d==='asc'?'desc':'asc'); else{setKey(k);setDir('desc')} }
const sort=(arr,map)=>[...arr].sort((a,b)=>{
const av=map?map(a):a[key], bv=map?map(b):b[key]
const av2=typeof av==='string'?av:+(av||0), bv2=typeof bv==='string'?bv:+(bv||0)
if(typeof av2==='string')return dir==='asc'?av2.localeCompare(bv2):bv2.localeCompare(av2)
return dir==='asc'?av2-bv2:bv2-av2
})
const Th=({k,children,right})=>(
<th onClick={()=>toggle(k)} style={{padding:'10px 12px',fontWeight:700,color:key===k?C.navy:C.muted,textAlign:right?'right':'left',whiteSpace:'nowrap',fontSize:10.5,letterSpacing:'0.04em',textTransform:'uppercase',cursor:'pointer',background:'#F9FAFB',borderBottom:'1px solid #F1F4F9',userSelect:'none',fontFamily:FONT}}>
{children}{key===k?<span style={{marginLeft:3}}>{dir==='asc'?'▲':'▼'}</span>:''}
</th>
)
return{key,dir,toggle,sort,Th}
}

const NotConnected=()=>(
<div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:400,gap:16}}>
<div style={{width:56,height:56,borderRadius:16,background:C.blueBg,display:'flex',alignItems:'center',justifyContent:'center'}}>
<svg width='28' height='28' viewBox='0 0 24 24' fill='none' stroke={C.blue} strokeWidth='2' strokeLinecap='round'><circle cx='12' cy='12' r='10'/><line x1='12' y1='8' x2='12' y2='12'/><line x1='12' y1='16' x2='12.01' y2='16'/></svg>
</div>
<div style={{textAlign:'center'}}>
<div style={{fontSize:16,fontWeight:800,color:C.text,marginBottom:6,fontFamily:FONT}}>Google Ads not connected</div>
<div style={{fontSize:13,color:C.muted,marginBottom:20,fontFamily:FONT}}>Add the following to your Vercel environment variables</div>
</div>
<div style={{background:'#F8FAFC',border:'0.5px solid '+C.border,borderRadius:12,padding:'16px 20px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px 32px',fontSize:12,fontFamily:'monospace'}}>
{['GOOGLE_ADS_DEVELOPER_TOKEN','GOOGLE_ADS_CLIENT_ID','GOOGLE_ADS_CLIENT_SECRET','GOOGLE_ADS_REFRESH_TOKEN','GOOGLE_ADS_CUSTOMER_ID'].map(k=>(
<div key={k} style={{display:'flex',alignItems:'center',gap:8}}><span style={{width:6,height:6,borderRadius:'50%',background:C.blue,flexShrink:0,display:'inline-block'}}/><span style={{color:'#374151',fontWeight:600}}>{k}</span></div>
))}
</div>
</div>
)

const Loader=()=><InlineLoader label='Loading from Google Ads' height={300}/>
function CampaignsTab({data,loading}){
const {sort,Th}=useSort('spend')
const [exp,setExp]=useState(null)
if(loading)return <Loader/>
if(!data)return null
const{campaigns=[],total={}}=data||{}
if(!campaigns.length&&!loading)return <NotConnected/>
const sorted=sort(campaigns)
const chartData=campaigns.filter(c=>c.spend>0).sort((a,b)=>b.spend-a.spend).slice(0,8).map(c=>({name:c.name.length>18?c.name.slice(0,18)+'...':c.name,spend:Math.round(c.spend/1000)}))
return <>
<div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:14,marginBottom:20}}>
<PremKPI label='Total Spend' value={fmt(total.spend)} accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.total}/>
<PremKPI label='Impressions' value={fmtN(total.impressions)} accent={C.blue} accentBg={C.blueBg} icon={KPI_ICONS.globe}/>
<PremKPI label='Clicks' value={fmtN(total.clicks)} accent={C.cyan} accentBg={C.cyanBg} icon={KPI_ICONS.ai}/>
<PremKPI label='CTR' value={fmtPct(total.ctr)} accent={C.green} accentBg={C.greenBg} icon={KPI_ICONS.bot}/>
<PremKPI label='Avg CPC' value={fmtCpc(total.avgCpc)} accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.agent}/>
<PremKPI label='Conversions' value={fmtN(total.conversions)} accent={C.blue} accentBg={C.blueBg} icon={KPI_ICONS.total}/>
<PremKPI label='Cost / Conv' value={fmt(total.costPerConv)} accent={C.cyan} accentBg={C.cyanBg} icon={KPI_ICONS.globe}/>
</div>
<div style={{display:'grid',gridTemplateColumns:'minmax(360px,1fr) 2fr',gap:16,marginBottom:16,alignItems:'start'}}>
<Card title='Spend by campaign' sub='Top 8 by spend (₹K)'>
<ResponsiveContainer width='100%' height={220}>
<BarChart data={chartData} layout='vertical' margin={{top:0,right:50,left:0,bottom:0}} barSize={13}>
<XAxis type='number' hide/>
<YAxis type='category' dataKey='name' width={110} tick={{fontSize:10,fill:C.muted,fontFamily:FONT}} axisLine={false} tickLine={false}/>
<Tooltip formatter={v=>'₹'+v+'K'} contentStyle={{fontSize:11,border:'0.5px solid #E5E7EB',borderRadius:8,fontFamily:FONT}}/>
<Bar dataKey='spend' radius={[0,5,5,0]} fill={C.navy}>
<LabelList dataKey='spend' position='right' formatter={v=>'₹'+v+'K'} style={{fontSize:10,fontWeight:700,fill:'#374151'}}/>
</Bar>
</BarChart>
</ResponsiveContainer>
</Card>
<Card title='All campaigns' sub={campaigns.length+' campaigns'}>
<div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontFamily:FONT}}>
<thead><tr><Th k='name'>Campaign</Th><Th k='status'>Status</Th><Th k='type'>Type</Th><Th k='spend' right>Spend</Th><Th k='impressions' right>Impr.</Th><Th k='clicks' right>Clicks</Th><Th k='ctr' right>CTR</Th><Th k='avgCpc' right>Avg CPC</Th><Th k='conversions' right>Conv.</Th><Th k='costPerConv' right>CPA</Th><Th k='impressionShare' right>Imp Share</Th></tr></thead>
<tbody>{sorted.map(c=>(
<React.Fragment key={c.id}>
<tr onClick={()=>setExp(exp===c.id?null:c.id)} style={{borderBottom:'1px solid #F8FAFC',cursor:'pointer',background:exp===c.id?'#F0F7FF':'transparent'}}>
<td style={{padding:'9px 12px',fontSize:12.5,color:C.text,fontWeight:600,maxWidth:200}}><div style={{display:'flex',alignItems:'center',gap:6}}><span style={{fontSize:11,color:C.muted}}>{exp===c.id?'▼':'►'}</span>{c.name}</div></td>
<td style={{padding:'9px 12px'}}><StatusBadge s={c.status}/></td>
<td style={{padding:'9px 12px'}}><TypeTag t={c.type}/></td>
<td style={{padding:'9px 12px',textAlign:'right',fontWeight:800,color:C.text,fontSize:12.5,whiteSpace:'nowrap'}}>{fmt(c.spend)}</td>
<td style={{padding:'9px 12px',textAlign:'right',color:C.sub,fontSize:12.5}}>{fmtN(c.impressions)}</td>
<td style={{padding:'9px 12px',textAlign:'right',color:C.sub,fontSize:12.5}}>{fmtN(c.clicks)}</td>
<td style={{padding:'9px 12px',textAlign:'right',color:C.sub,fontSize:12.5}}>{fmtPct(c.ctr)}</td>
<td style={{padding:'9px 12px',textAlign:'right',color:C.sub,fontSize:12.5,whiteSpace:'nowrap'}}>{fmtCpc(c.avgCpc)}</td>
<td style={{padding:'9px 12px',textAlign:'right',color:'#7C3AED',fontWeight:700,fontSize:12.5}}>{c.conversions?.toFixed(1)||'—'}</td>
<td style={{padding:'9px 12px',textAlign:'right',color:C.sub,fontSize:12.5,whiteSpace:'nowrap'}}>{fmt(c.costPerConv)}</td>
<td style={{padding:'9px 12px',textAlign:'right',fontSize:12.5,color:c.impressionShare>0.8?C.green:c.impressionShare>0.5?'#D97706':'#DC2626'}}>{fmtPct(c.impressionShare)}</td>
</tr>
{exp===c.id&&<tr style={{borderBottom:'1px solid #F8FAFC',background:'#F8FAFF'}}><td colSpan={11} style={{padding:'12px 24px'}}>
<div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,fontSize:12}}>
{[{l:'Campaign ID',v:c.id},{l:'Channel type',v:c.type},{l:'Impression Share',v:fmtPct(c.impressionShare)},{l:'Cost per click',v:fmtCpc(c.avgCpc)}].map(({l,v})=>(
<div key={l}><div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:3}}>{l}</div><div style={{fontWeight:700,color:C.text}}>{v}</div></div>
))}
</div>
</td></tr>}
</React.Fragment>
))}</tbody>
</table></div>
</Card>
</div>
</>
}

function KeywordsTab({data,loading}){
const {sort,Th}=useSort('spend')
const [search,setSearch]=useState('')
if(loading)return <Loader/>
if(!data)return null
const{keywords=[],total={}}=data||{}
const filtered=keywords.filter(k=>!search||k.text.toLowerCase().includes(search.toLowerCase()))
const sorted=sort(filtered)
const avgQS=keywords.filter(k=>k.qualityScore>0).reduce((s,k,_,a)=>s+k.qualityScore/a.filter(x=>x.qualityScore>0).length,0)
const qsColor=q=>q>=7?C.green:q>=5?'#D97706':'#DC2626'
const matchBg=m=>({EXACT:C.navyBg,PHRASE:C.blueBg,BROAD:'#F3F4F6'}[m]||'#F3F4F6')
const matchColor=m=>({EXACT:C.navy,PHRASE:C.blue,BROAD:C.sub}[m]||C.sub)
return <>
<div style={{display:'grid',gridTemplateColumns:'repeat(6,minmax(0,1fr))',gap:14,marginBottom:20}}>
<PremKPI label='KEYWORDS' value={fmtN(keywords.length)} sub='Total tracked' accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.total}/>
<PremKPI label='TOTAL SPEND' value={fmt(total?.spend)} accent={C.blue} accentBg={C.blueBg} icon={KPI_ICONS.agent}/>
<PremKPI label='IMPRESSIONS' value={fmtN(total?.impressions)} accent={C.cyan} accentBg={C.cyanBg} icon={KPI_ICONS.globe}/>
<PremKPI label='AVG CTR' value={fmtPct(total?.ctr)} accent={C.green} accentBg={C.greenBg} icon={KPI_ICONS.bot}/>
<PremKPI label='AVG CPC' value={fmtCpc(total?.avgCpc)} accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.ai}/>
<PremKPI label='AVG QUALITY SCORE' value={avgQS?avgQS.toFixed(1):'—'} accent={C.blue} accentBg={C.blueBg} icon={KPI_ICONS.total}/>
</div>
<Card title='Keywords' sub={filtered.length+' of '+keywords.length} action={
<input value={search} onChange={e=>setSearch(e.target.value)} placeholder='Search keywords...' style={{padding:'6px 10px',border:'0.5px solid '+C.border,borderRadius:8,fontSize:12,fontFamily:FONT,outline:'none',width:220,background:'var(--card)',color:C.text}}/>
}>
<div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}>
<thead><tr><Th k='text'>Keyword</Th><Th k='matchType'>Match</Th><Th k='status'>Status</Th><Th k='qualityScore' right>QS</Th><Th k='impressions' right>Impr.</Th><Th k='clicks' right>Clicks</Th><Th k='ctr' right>CTR</Th><Th k='avgCpc' right>Avg CPC</Th><Th k='spend' right>Spend</Th><Th k='conversions' right>Conv.</Th><Th k='costPerConv' right>CPA</Th></tr></thead>
<tbody>{sorted.map((k,i)=>(
<tr key={i} style={{borderBottom:'0.5px solid '+C.border}}>
<td style={{padding:'8px 12px',fontSize:12.5,color:C.text,fontWeight:600,maxWidth:220}}>{k.text}</td>
<td style={{padding:'8px 12px'}}><span style={{fontSize:10,fontWeight:700,color:matchColor(k.matchType),background:matchBg(k.matchType),padding:'2px 7px',borderRadius:6}}>{k.matchType}</span></td>
<td style={{padding:'8px 12px'}}><StatusBadge s={k.status}/></td>
<td style={{padding:'8px 12px',textAlign:'right'}}>{k.qualityScore>0?<span style={{fontWeight:700,color:qsColor(k.qualityScore),fontSize:13}}>{k.qualityScore}</span>:<span style={{color:C.muted,fontSize:12}}>—</span>}</td>
<td style={{padding:'8px 12px',textAlign:'right',color:C.sub,fontSize:12.5}}>{fmtN(k.impressions)}</td>
<td style={{padding:'8px 12px',textAlign:'right',color:C.sub,fontSize:12.5}}>{fmtN(k.clicks)}</td>
<td style={{padding:'8px 12px',textAlign:'right',color:C.sub,fontSize:12.5}}>{fmtPct(k.ctr)}</td>
<td style={{padding:'8px 12px',textAlign:'right',color:C.sub,fontSize:12.5,whiteSpace:'nowrap'}}>{fmtCpc(k.avgCpc)}</td>
<td style={{padding:'8px 12px',textAlign:'right',fontWeight:700,color:C.text,fontSize:12.5,whiteSpace:'nowrap'}}>{fmt(k.spend)}</td>
<td style={{padding:'8px 12px',textAlign:'right',color:C.sub,fontSize:12.5}}>{k.conversions?.toFixed(1)||'—'}</td>
<td style={{padding:'8px 12px',textAlign:'right',color:C.sub,fontSize:12.5,whiteSpace:'nowrap'}}>{fmt(k.costPerConv)}</td>
</tr>
))}</tbody>
</table></div>
</Card>
</>
}

function SearchTermsTab({data,loading}){
const {sort,Th}=useSort('impressions')
const [search,setSearch]=useState('')
if(loading)return <Loader/>
if(!data)return null
const{searchTerms=[]}=data||{}
const filtered=searchTerms.filter(s=>!search||s.text.toLowerCase().includes(search.toLowerCase()))
const sorted=sort(filtered)
const totalSpend=searchTerms.reduce((s,x)=>s+(x.spend||0),0)
const totalImpr=searchTerms.reduce((s,x)=>s+(x.impressions||0),0)
const totalClicks=searchTerms.reduce((s,x)=>s+(x.clicks||0),0)
const totalConv=searchTerms.reduce((s,x)=>s+(x.conversions||0),0)
return <>
<div style={{display:'grid',gridTemplateColumns:'repeat(5,minmax(0,1fr))',gap:14,marginBottom:20}}>
<PremKPI label='SEARCH TERMS' value={fmtN(searchTerms.length)} accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.total}/>
<PremKPI label='TOTAL SPEND' value={fmt(totalSpend)} accent={C.blue} accentBg={C.blueBg} icon={KPI_ICONS.agent}/>
<PremKPI label='IMPRESSIONS' value={fmtN(totalImpr)} accent={C.cyan} accentBg={C.cyanBg} icon={KPI_ICONS.globe}/>
<PremKPI label='CLICKS' value={fmtN(totalClicks)} accent={C.green} accentBg={C.greenBg} icon={KPI_ICONS.bot}/>
<PremKPI label='CONVERSIONS' value={totalConv?fmtN(totalConv):'—'} accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.ai}/>
</div>
<Card title='Search terms' sub={filtered.length+' of '+searchTerms.length+' · actual search queries that triggered your ads'} action={
<input value={search} onChange={e=>setSearch(e.target.value)} placeholder='Search terms...' style={{padding:'6px 10px',border:'0.5px solid '+C.border,borderRadius:8,fontSize:12,fontFamily:FONT,outline:'none',width:220,background:'var(--card)',color:C.text}}/>
}>
<div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}>
<thead><tr><Th k='text'>Search term</Th><Th k='adGroup'>Ad Group</Th><Th k='campaign'>Campaign</Th><Th k='impressions' right>Impr.</Th><Th k='clicks' right>Clicks</Th><Th k='ctr' right>CTR</Th><Th k='avgCpc' right>Avg CPC</Th><Th k='spend' right>Spend</Th><Th k='conversions' right>Conv.</Th></tr></thead>
<tbody>{sorted.map((s,i)=>(
<tr key={i} style={{borderBottom:'0.5px solid '+C.border}}>
<td style={{padding:'8px 12px',fontSize:12.5,color:C.text,fontWeight:600,maxWidth:240}}>{s.text}</td>
<td style={{padding:'8px 12px',fontSize:12,color:C.sub,maxWidth:180,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{s.adGroup||'—'}</td>
<td style={{padding:'8px 12px',fontSize:12,color:C.sub,maxWidth:180,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{s.campaign}</td>
<td style={{padding:'8px 12px',textAlign:'right',color:C.sub,fontSize:12.5}}>{fmtN(s.impressions)}</td>
<td style={{padding:'8px 12px',textAlign:'right',color:C.sub,fontSize:12.5}}>{fmtN(s.clicks)}</td>
<td style={{padding:'8px 12px',textAlign:'right',color:C.sub,fontSize:12.5}}>{fmtPct(s.ctr)}</td>
<td style={{padding:'8px 12px',textAlign:'right',color:C.sub,fontSize:12.5,whiteSpace:'nowrap'}}>{fmtCpc(s.avgCpc)}</td>
<td style={{padding:'8px 12px',textAlign:'right',fontWeight:700,color:C.text,fontSize:12.5,whiteSpace:'nowrap'}}>{fmt(s.spend)}</td>
<td style={{padding:'8px 12px',textAlign:'right',color:'#7C3AED',fontWeight:700,fontSize:12.5}}>{s.conversions?.toFixed(1)||'—'}</td>
</tr>
))}</tbody>
</table></div>
</Card>
</>
}

function AdGroupsTab({data,loading}){
const {sort,Th}=useSort('spend')
if(loading)return <Loader/>
if(!data)return null
const{adGroups=[],total={}}=data||{}
const sorted=sort(adGroups)
return <>
<div style={{display:'grid',gridTemplateColumns:'repeat(5,minmax(0,1fr))',gap:14,marginBottom:20}}>
<PremKPI label='AD GROUPS' value={fmtN(adGroups.length)} accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.total}/>
<PremKPI label='TOTAL SPEND' value={fmt(total?.spend)} accent={C.blue} accentBg={C.blueBg} icon={KPI_ICONS.agent}/>
<PremKPI label='IMPRESSIONS' value={fmtN(total?.impressions)} accent={C.cyan} accentBg={C.cyanBg} icon={KPI_ICONS.globe}/><PremKPI label='CLICKS' value={fmtN(total?.clicks)} accent={C.green} accentBg={C.greenBg} icon={KPI_ICONS.bot}/>
<PremKPI label='CONVERSIONS' value={total?.conversions?fmtN(total.conversions):'—'} accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.ai}/>
</div>
<Card title='Ad groups' sub={adGroups.length+' total'}>
<div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}>
<thead><tr><Th k='name'>Ad Group</Th><Th k='campaign'>Campaign</Th><Th k='status'>Status</Th><Th k='spend' right>Spend</Th><Th k='impressions' right>Impr.</Th><Th k='clicks' right>Clicks</Th><Th k='ctr' right>CTR</Th><Th k='avgCpc' right>Avg CPC</Th><Th k='conversions' right>Conv.</Th><Th k='costPerConv' right>CPA</Th></tr></thead>
<tbody>{sorted.map((g,i)=>(
<tr key={i} style={{borderBottom:'0.5px solid '+C.border}}>
<td style={{padding:'8px 12px',fontSize:12.5,color:C.text,fontWeight:700,maxWidth:200}}>{g.name}</td>
<td style={{padding:'8px 12px',fontSize:12,color:C.sub,maxWidth:200,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{g.campaign}</td>
<td style={{padding:'8px 12px'}}><StatusBadge s={g.status}/></td>
<td style={{padding:'8px 12px',textAlign:'right',fontWeight:700,color:C.text,fontSize:12.5,whiteSpace:'nowrap'}}>{fmt(g.spend)}</td>
<td style={{padding:'8px 12px',textAlign:'right',color:C.sub,fontSize:12.5}}>{fmtN(g.impressions)}</td>
<td style={{padding:'8px 12px',textAlign:'right',color:C.sub,fontSize:12.5}}>{fmtN(g.clicks)}</td>
<td style={{padding:'8px 12px',textAlign:'right',color:C.sub,fontSize:12.5}}>{fmtPct(g.ctr)}</td>
<td style={{padding:'8px 12px',textAlign:'right',color:C.sub,fontSize:12.5,whiteSpace:'nowrap'}}>{fmtCpc(g.avgCpc)}</td>
<td style={{padding:'8px 12px',textAlign:'right',color:'#7C3AED',fontWeight:700,fontSize:12.5}}>{g.conversions?.toFixed(1)||'—'}</td>
<td style={{padding:'8px 12px',textAlign:'right',color:C.sub,fontSize:12.5,whiteSpace:'nowrap'}}>{fmt(g.costPerConv)}</td>
</tr>
))}</tbody>
</table></div>
</Card>
</>
}

function TrendTab({mode}){const [rows,setRows]=useState([]);const [total,setTotal]=useState({});const [loading,setLoading]=useState(true);const [err,setErr]=useState(null);useEffect(()=>{const now=new Date();const pad=n=>String(n).padStart(2,'0');const until=now.getFullYear()+'-'+pad(now.getMonth()+1)+'-'+pad(now.getDate());const since=mode==='month'?(now.getFullYear()+'-01-01'):(now.getFullYear()+'-'+pad(now.getMonth()+1)+'-01');setLoading(true);const token=localStorage.getItem('quantum_token');fetch('/api/google-ads?tab=trend&mode='+mode+'&from='+since+'&to='+until,{headers:{'Authorization':'Bearer '+(token||'')}}).then(r=>r.json()).then(json=>{if(json.error){setErr(json.error);return}setRows(json.points||[]);setTotal(json.total||{})}).catch(e=>setErr(e.message)).finally(()=>setLoading(false))},[mode]);if(loading)return <Loader/>;const fmtPeriod=p=>mode==='month'?new Date(p).toLocaleDateString('en-US',{month:'short',year:'numeric'}):new Date(p).toLocaleDateString('en-US',{day:'2-digit',month:'short'});const thS={padding:'10px 12px',fontWeight:700,color:C.muted,textAlign:'right',fontSize:10.5,letterSpacing:'0.04em',textTransform:'uppercase',background:'#F9FAFB',borderBottom:'1px solid #F1F4F9'};const thL={...thS,textAlign:'left'};const tdR={padding:'8px 12px',textAlign:'right',color:C.sub,fontSize:12.5};const tdL={padding:'8px 12px',fontSize:12.5,color:C.text,fontWeight:600};return <><div style={{fontSize:12,color:C.muted,marginBottom:14,fontFamily:FONT}}>{mode==='month'?'Fixed range: Jan 1 to today (not affected by the date filter)':'Fixed range: 1st of this month to today (not affected by the date filter)'}</div>{err&&<div style={{padding:'10px 14px',borderRadius:10,background:'#FEF2F2',color:'#DC2626',fontSize:12.5,fontWeight:600,marginBottom:16}}>{err}</div>}<div style={{display:'grid',gridTemplateColumns:'repeat(5,minmax(0,1fr))',gap:14,marginBottom:20}}><PremKPI label='Total Spend' value={fmt(total.spend)} accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.total}/><PremKPI label='Impressions' value={fmtN(total.impressions)} accent={C.blue} accentBg={C.blueBg} icon={KPI_ICONS.globe}/><PremKPI label='Clicks' value={fmtN(total.clicks)} accent={C.cyan} accentBg={C.cyanBg} icon={KPI_ICONS.ai}/><PremKPI label='CTR' value={fmtPct(total.ctr)} accent={C.green} accentBg={C.greenBg} icon={KPI_ICONS.bot}/><PremKPI label='Conversions' value={fmtN(total.conversions)} accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.agent}/></div><Card title={mode==='month'?'Month on month':'Day on day'} sub={rows.length+' periods'}><div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontFamily:FONT}}><thead><tr><th style={thL}>Period</th><th style={thS}>Spend</th><th style={thS}>Impr.</th><th style={thS}>Clicks</th><th style={thS}>CTR</th><th style={thS}>Avg CPC</th><th style={thS}>Conv.</th><th style={thS}>CPA</th></tr></thead><tbody>{rows.map((r,i)=>(<tr key={i} style={{borderBottom:'0.5px solid '+C.border}}><td style={tdL}>{fmtPeriod(r.period)}</td><td style={{...tdR,fontWeight:700,color:C.text}}>{fmt(r.spend)}</td><td style={tdR}>{fmtN(r.impressions)}</td><td style={tdR}>{fmtN(r.clicks)}</td><td style={tdR}>{fmtPct(r.ctr)}</td><td style={{...tdR,whiteSpace:'nowrap'}}>{fmtCpc(r.avgCpc)}</td><td style={{...tdR,color:'#7C3AED',fontWeight:700}}>{r.conversions?.toFixed(1)||'—'}</td><td style={{...tdR,whiteSpace:'nowrap'}}>{fmt(r.costPerConv)}</td></tr>))}<tr style={{background:'#F8FAFC',fontWeight:800}}><td style={{...tdL,fontWeight:800}}>Total</td><td style={{...tdR,fontWeight:800,color:C.text}}>{fmt(total.spend)}</td><td style={{...tdR,fontWeight:800,color:C.text}}>{fmtN(total.impressions)}</td><td style={{...tdR,fontWeight:800,color:C.text}}>{fmtN(total.clicks)}</td><td style={{...tdR,fontWeight:800,color:C.text}}>{fmtPct(total.ctr)}</td><td style={{...tdR,fontWeight:800,color:C.text,whiteSpace:'nowrap'}}>{fmtCpc(total.avgCpc)}</td><td style={{...tdR,fontWeight:800,color:C.text}}>{total.conversions?(+total.conversions).toFixed(1):'—'}</td><td style={{...tdR,fontWeight:800,color:C.text,whiteSpace:'nowrap'}}>{fmt(total.costPerConv)}</td></tr></tbody></table></div></Card></>}export default function GoogleAdsDashboard(){
const [searchParams,setSearchParams]=useSearchParams()
const activeTab=searchParams.get('tab')||'campaigns'
const [dateRange,setDateRange]=useState('LAST_30_DAYS');const [customFrom,setCustomFrom]=useState('');const [customTo,setCustomTo]=useState('')
const [data,setData]=useState({})
const [loading,setLoading]=useState({})
const [error,setError]=useState(null)
const [notConnected,setNotConnected]=useState(false)
const loaded=useRef({})

const loadTab=useCallback(async(tab,dr,cFrom,cTo)=>{
const custom=dr==='CUSTOM'&&cFrom&&cTo;const k=tab+'_'+dr+(custom?('_'+cFrom+'_'+cTo):'')
if(loaded.current[k])return;if(dr==='CUSTOM'&&!custom)return
setLoading(p=>({...p,[tab]:true}))
try{
const token=localStorage.getItem('quantum_token')
const apiTab=tab==='searchTerms'?'search_terms':tab==='adGroups'?'ad_groups':tab
const q=custom?('from='+cFrom+'&to='+cTo):('dateRange='+dr);const res=await fetch('/api/google-ads'+'?tab='+apiTab+'&'+q,{headers:{'Authorization':'Bearer '+(token||'')}})
if(res.status===503||res.status===401){setNotConnected(true);return}
if(!res.ok)throw new Error('API error '+res.status)
const json=await res.json()
if(json.error&&json.error.includes('credential')||json.notConnected){setNotConnected(true);return}
setData(p=>({...p,[tab]:json}))
loaded.current[k]=true
setError(null)
}catch(e){setError(e.message)}
finally{setLoading(p=>({...p,[tab]:false}))}
},[dateRange,customFrom,customTo])

useEffect(()=>{ loaded.current={}; setData({}); },[dateRange,customFrom,customTo])
useEffect(()=>{ if(activeTab==='mom'||activeTab==='dod')return; loadTab(activeTab,dateRange,customFrom,customTo) },[activeTab,dateRange,customFrom,customTo,loadTab])

const setTab=t=>setSearchParams({tab:t})

return(
<div className='lq-page-shell' style={{display:'flex',height:'100vh',overflow:'hidden',background:C.bg,fontFamily:FONT}}>
<Sidebar/>
<div style={{margin:'12px 14px 0',borderRadius:14,border:'1px solid #EEF1F6',boxShadow:'0 1px 3px rgba(31,60,132,0.06)',flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minWidth:0}}>
<div style={{background:'var(--card)',borderBottom:'0.5px solid '+C.border,padding:'0 28px',minHeight:56,height:'auto',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexShrink:0,overflow:'visible'}}>
<div>
<p style={{fontSize:10.5,color:C.muted,margin:0,letterSpacing:'0.05em',textTransform:'uppercase',fontFamily:FONT}}>Analytics / Google Ads</p>
<h1 style={{fontSize:18,fontWeight:800,color:C.text,margin:'2px 0 0',letterSpacing:'-0.4px',fontFamily:FONT}}>{activeTab==='mom'?'Month on Month':activeTab==='dod'?'Day on Day':'Google Ads'}</h1>
</div>
<div style={{display:(activeTab==='mom'||activeTab==='dod')?'none':'flex',alignItems:'center',gap:8}}>
<button onClick={()=>{loaded.current={};setData({});loadTab(activeTab,dateRange,customFrom,customTo)}} style={{padding:'6px 14px',borderRadius:8,border:'1px solid #e5e7eb',fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:FONT,background:'#fff',color:'#374151',display:'flex',alignItems:'center',gap:6}}>
Refresh
</button>
{DATE_RANGES.map(d=><div key={d.id} style={pillStyle(dateRange===d.id)} onClick={()=>setDateRange(d.id)}>{d.label}</div>)}{dateRange==='CUSTOM'&&<><input type='date' value={customFrom} onChange={e=>setCustomFrom(e.target.value)} style={{padding:'5px 10px',borderRadius:8,border:'0.5px solid '+C.border,fontSize:12,fontFamily:FONT,background:'var(--card)',color:C.text}}/><input type='date' value={customTo} onChange={e=>setCustomTo(e.target.value)} style={{padding:'5px 10px',borderRadius:8,border:'0.5px solid '+C.border,fontSize:12,fontFamily:FONT,background:'var(--card)',color:C.text}}/></>}
</div>
</div>
<div style={{display:(activeTab==='mom'||activeTab==='dod')?'none':'flex',gap:8,padding:'14px 28px 0',flexShrink:0}}>
{TABS.map(t=><div key={t.id} style={tabBtn(activeTab===t.id)} onClick={()=>setTab(t.id)}>{t.label}</div>)}
</div>
<div style={{flex:1,overflowY:'auto',padding:'16px 28px 28px'}}>
{error&&<div style={{padding:'10px 14px',borderRadius:10,background:'#FEF2F2',color:'#DC2626',fontSize:12.5,fontWeight:600,marginBottom:16}}>{error}</div>}
{notConnected ? <NotConnected/> : (
activeTab==='campaigns' ? <CampaignsTab data={data.campaigns} loading={!!loading.campaigns}/> :
activeTab==='keywords' ? <KeywordsTab data={data.keywords} loading={!!loading.keywords}/> :
activeTab==='searchTerms'?<SearchTermsTab data={data.searchTerms} loading={!!loading.searchTerms}/>:
activeTab==='mom'?<TrendTab mode='month'/>:activeTab==='dod'?<TrendTab mode='day'/>:<AdGroupsTab data={data.adGroups} loading={!!loading.adGroups}/>
)}
</div>
</div>
</div>
)
}
