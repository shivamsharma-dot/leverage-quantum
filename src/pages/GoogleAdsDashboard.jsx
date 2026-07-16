import React,{useState,useEffect,useCallback,useRef,useMemo} from 'react'
import{useSearchParams}from 'react-router-dom'
import{BarChart,Bar,XAxis,YAxis,Tooltip,ResponsiveContainer,LabelList}from 'recharts'
import Sidebar from '../components/Sidebar'
import { InlineLoader } from '../components/SkeletonLoader'
import ExportButton from '../components/ExportButton'
import { useAuth } from '../hooks/useAuth'
import { usePresence } from '../hooks/usePresence'
import { C, FONT, fmtN, Card, PremKPI, KPI_ICONS } from '../ui/dashboardKit'; import { resolveSheetUrl } from '../lib/dataSources'

const DATE_RANGES=[{id:'TODAY',label:'Today'},{id:'LAST_7_DAYS',label:'Last 7 days'},{id:'LAST_30_DAYS',label:'Last 30 days'},{id:'LAST_90_DAYS',label:'Last 90 days'},{id:'THIS_MONTH',label:'This month'},{id:'LAST_MONTH',label:'Last month'},{id:'CUSTOM',label:'Custom'}]
const TABS=[{id:'campaigns',label:'Campaigns'},{id:'ads',label:'Ads'},{id:'keywords',label:'Keywords'},{id:'searchTerms',label:'Search terms'},{id:'adGroups',label:'Ad groups'}];const LEADS_CSV_DEFAULT='https://docs.google.com/spreadsheets/d/1r-e6pBCN5ysfeD3Eq6sxgLmf97mdeTtloMPylqnx6Ew/gviz/tq?tqx=out:csv&sheet=googleleads';function parseLeadsCSV(t){const rows=[];let i=0,field='',row=[],inq=false;while(i<t.length){const c=t[i];const cc=t.charCodeAt(i);if(inq){if(c==='"'){if(t[i+1]==='"'){field+='"';i+=2;continue}inq=false;i++;continue}field+=c;i++;continue}else{if(c==='"'){inq=true;i++;continue}if(c===','){row.push(field);field='';i++;continue}if(cc===13){i++;continue}if(cc===10){row.push(field);rows.push(row);row=[];field='';i++;continue}field+=c;i++;continue}}if(field.length||row.length){row.push(field);rows.push(row)}const h=rows[0]||[];return rows.slice(1).filter(r=>r.length>1).map(r=>Object.fromEntries(h.map((k,idx)=>[k,(r[idx]||'')])))};function parseLeadDate(s){const m=String(s||'').trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);if(!m)return null;const MN={Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};const mi=MN[m[2]];if(mi==null)return null;return new Date(+m[3],mi,+m[1])};function resolveDateRangeBounds(dr,cFrom,cTo){const today=new Date();const d0=new Date(today.getFullYear(),today.getMonth(),today.getDate());if(dr==='CUSTOM'&&cFrom&&cTo){const p=cFrom.split('-'),q=cTo.split('-');return{start:new Date(+p[0],+p[1]-1,+p[2]),end:new Date(+q[0],+q[1]-1,+q[2])}}if(dr==='TODAY')return{start:d0,end:d0};if(dr==='LAST_7_DAYS'){const e=new Date(d0);e.setDate(e.getDate()-1);const s=new Date(d0);s.setDate(s.getDate()-7);return{start:s,end:e}}if(dr==='LAST_30_DAYS'){const e=new Date(d0);e.setDate(e.getDate()-1);const s=new Date(d0);s.setDate(s.getDate()-30);return{start:s,end:e}}if(dr==='LAST_90_DAYS'){const e=new Date(d0);e.setDate(e.getDate()-1);const s=new Date(d0);s.setDate(s.getDate()-90);return{start:s,end:e}}if(dr==='THIS_MONTH')return{start:new Date(d0.getFullYear(),d0.getMonth(),1),end:d0};if(dr==='LAST_MONTH'){const s=new Date(d0.getFullYear(),d0.getMonth()-1,1);const e=new Date(d0.getFullYear(),d0.getMonth(),0);return{start:s,end:e}}return{start:new Date(d0.getFullYear(),d0.getMonth(),1),end:d0}}

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
const map={SEARCH:{bg:C.blueBg,color:C.blue,label:'Search'},DISPLAY:{bg:C.greenBg,color:C.green,label:'Display'},SHOPPING:{bg:'#FEF9C3',color:'#D97706',label:'Shopping'},VIDEO:{bg:'#FEF2F2',color:'#DC2626',label:'Video'},PERFORMANCE_MAX:{bg:C.navyBg,color:C.navy,label:'PMax'}}
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
function CampaignsTab({data,loading,leadsByCampaign={},totalLeads=0}){
const {sort,Th}=useSort('spend')
const [exp,setExp]=useState(null)
const [search,setSearch]=useState('')
if(loading)return <Loader/>
if(!data)return null
const{campaigns=[],total={}}=data||{}
if(!campaigns.length&&!loading)return <NotConnected/>
const filtered=campaigns.filter(c=>!search||c.name.toLowerCase().includes(search.toLowerCase()))
const sorted=sort(filtered)
const chartData=campaigns.filter(c=>c.spend>0).sort((a,b)=>b.spend-a.spend).slice(0,8).map(c=>({name:c.name.length>18?c.name.slice(0,18)+'...':c.name,spend:Math.round(c.spend/1000)}))
return <>
<div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:14,marginBottom:20}}><PremKPI label='Leads' value={fmtN(totalLeads)} sub='From CRM sheet' accent={C.green} accentBg={C.greenBg} icon={KPI_ICONS.bot}/>
<PremKPI label='Total Spend' value={fmt(total.spend)} accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.total}/>
<PremKPI label='Impressions' value={fmtN(total.impressions)} accent={C.blue} accentBg={C.blueBg} icon={KPI_ICONS.globe}/>
<PremKPI label='Clicks' value={fmtN(total.clicks)} accent={C.cyan} accentBg={C.cyanBg} icon={KPI_ICONS.ai}/>
<PremKPI label='CTR' value={fmtPct(total.ctr)} accent={C.green} accentBg={C.greenBg} icon={KPI_ICONS.bot}/>
<PremKPI label='Avg CPC' value={fmtCpc(total.avgCpc)} accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.agent}/>
<PremKPI label='Conversions' value={fmtN(total.conversions)} accent={C.blue} accentBg={C.blueBg} icon={KPI_ICONS.total}/>
<PremKPI label='Cost / Conv' value={fmt(total.costPerConv)} accent={C.cyan} accentBg={C.cyanBg} icon={KPI_ICONS.globe}/>
</div>
<div style={{marginBottom:16}}>
<Card title='Spend by campaign' sub='Top 8 by spend (₹K)'>
<ResponsiveContainer width='100%' height={280}>
<BarChart data={chartData} layout='vertical' margin={{top:0,right:60,left:0,bottom:0}} barSize={20}>
<XAxis type='number' hide/>
<YAxis type='category' dataKey='name' width={190} tick={{fontSize:11,fill:C.muted,fontFamily:FONT}} axisLine={false} tickLine={false}/>
<Tooltip formatter={v=>'₹'+v+'K'} contentStyle={{fontSize:11,border:'0.5px solid #E5E7EB',borderRadius:8,fontFamily:FONT}}/>
<Bar dataKey='spend' radius={[0,5,5,0]} fill={C.navy}>
<LabelList dataKey='spend' position='right' formatter={v=>'₹'+v+'K'} style={{fontSize:10,fontWeight:700,fill:'#374151'}}/>
</Bar>
</BarChart>
</ResponsiveContainer>
</Card>
</div>
<Card title='All campaigns' sub={filtered.length+' of '+campaigns.length} action={
<div style={{display:'flex',alignItems:'center',gap:8}}>
<input value={search} onChange={e=>setSearch(e.target.value)} placeholder='Search campaigns...' style={{padding:'6px 10px',border:'0.5px solid '+C.border,borderRadius:8,fontSize:12,fontFamily:FONT,outline:'none',width:220,background:'var(--card)',color:C.text}}/>
<ExportButton data={sorted.map(c=>({Campaign:c.name,Status:c.status,Type:c.type,Leads:leadsByCampaign[c.name]??leadsByCampaign[(c.name||'').toLowerCase()]??'',Spend:c.spend,Impressions:c.impressions,Clicks:c.clicks,CTR:c.ctr,'Avg CPC':c.avgCpc,Conversions:c.conversions,CPA:c.costPerConv,'Impression Share':c.impressionShare}))} filename='google_ads_campaigns'/>
</div>
}>
<div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontFamily:FONT}}>
<thead><tr><Th k='name'>Campaign</Th><Th k='status'>Status</Th><Th k='type'>Type</Th><th style={{padding:'10px 12px',fontWeight:700,color:C.muted,textAlign:'right',whiteSpace:'nowrap',fontSize:10.5,letterSpacing:'0.04em',textTransform:'uppercase',background:'#F9FAFB',borderBottom:'1px solid #F1F4F9',fontFamily:FONT}}>Leads</th><Th k='spend' right>Spend</Th><Th k='impressions' right>Impr.</Th><Th k='clicks' right>Clicks</Th><Th k='ctr' right>CTR</Th><Th k='avgCpc' right>Avg CPC</Th><Th k='conversions' right>Conv.</Th><Th k='costPerConv' right>CPA</Th><Th k='impressionShare' right>Imp Share</Th></tr></thead>
<tbody>{sorted.map(c=>(
<React.Fragment key={c.id}>
<tr onClick={()=>setExp(exp===c.id?null:c.id)} style={{borderBottom:'1px solid #F8FAFC',cursor:'pointer',background:exp===c.id?'#F0F7FF':'transparent'}}>
<td style={{padding:'9px 12px',fontSize:12.5,color:C.text,fontWeight:600,maxWidth:220,overflow:'hidden'}}><div style={{display:'flex',alignItems:'center',gap:6,overflow:'hidden'}}><span style={{fontSize:11,color:C.muted,flexShrink:0}}>{exp===c.id?'▼':'►'}</span><span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={c.name}>{c.name}</span></div></td>
<td style={{padding:'9px 12px'}}><StatusBadge s={c.status}/></td>
<td style={{padding:'9px 12px'}}><TypeTag t={c.type}/></td><td style={{padding:'9px 12px',textAlign:'right',fontWeight:800,color:C.green,fontSize:12.5,whiteSpace:'nowrap'}}>{(leadsByCampaign[c.name]??leadsByCampaign[(c.name||'').toLowerCase()])?fmtN(leadsByCampaign[c.name]??leadsByCampaign[(c.name||'').toLowerCase()]):'—'}</td>
<td style={{padding:'9px 12px',textAlign:'right',fontWeight:800,color:C.text,fontSize:12.5,whiteSpace:'nowrap'}}>{fmt(c.spend)}</td>
<td style={{padding:'9px 12px',textAlign:'right',color:C.sub,fontSize:12.5}}>{fmtN(c.impressions)}</td>
<td style={{padding:'9px 12px',textAlign:'right',color:C.sub,fontSize:12.5}}>{fmtN(c.clicks)}</td>
<td style={{padding:'9px 12px',textAlign:'right',color:C.sub,fontSize:12.5}}>{fmtPct(c.ctr)}</td>
<td style={{padding:'9px 12px',textAlign:'right',color:C.sub,fontSize:12.5,whiteSpace:'nowrap'}}>{fmtCpc(c.avgCpc)}</td>
<td style={{padding:'9px 12px',textAlign:'right',color:C.navy,fontWeight:700,fontSize:12.5}}>{c.conversions?.toFixed(1)||'—'}</td>
<td style={{padding:'9px 12px',textAlign:'right',color:C.sub,fontSize:12.5,whiteSpace:'nowrap'}}>{fmt(c.costPerConv)}</td>
<td style={{padding:'9px 12px',textAlign:'right',fontSize:12.5,color:c.impressionShare>0.8?C.green:c.impressionShare>0.5?'#D97706':'#DC2626'}}>{fmtPct(c.impressionShare)}</td>
</tr>
{exp===c.id&&<tr style={{borderBottom:'1px solid #F8FAFC',background:'#F8FAFF'}}><td colSpan={12} style={{padding:'12px 24px'}}>
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
</>
}

const AD_TYPE_LABEL={RESPONSIVE_SEARCH_AD:'Search',RESPONSIVE_DISPLAY_AD:'Display',EXPANDED_TEXT_AD:'Search',APP_AD:'App',DEMAND_GEN_MULTI_ASSET_AD:'Demand Gen',VIDEO_RESPONSIVE_AD:'Video',SHOPPING_SMART_AD:'Shopping'}
function AdsTab({data,loading}){
const {sort,Th}=useSort('spend')
const [search,setSearch]=useState('')
const [previewAd,setPreviewAd]=useState(null)
const [linkCopied,setLinkCopied]=useState(false)
if(loading)return <Loader/>
if(!data)return null
const{ads=[],total={}}=data||{}
const filtered=ads.filter(a=>!search||(a.headlines[0]||'').toLowerCase().includes(search.toLowerCase())||a.campaign.toLowerCase().includes(search.toLowerCase()))
const sorted=sort(filtered,a=>a.headlines[0]||'')
const domain=u=>{try{return new URL(u).hostname.replace(/^www\./,'')}catch{return u}}
const copyLink=url=>{navigator.clipboard?.writeText(url);setLinkCopied(true);setTimeout(()=>setLinkCopied(false),1800)}
const exportRows=filtered.map(a=>({Headline:a.headlines[0]||'',Campaign:a.campaign,'Ad Group':a.adGroup,Type:AD_TYPE_LABEL[a.type]||a.type,Status:a.status,'Landing Page':a.finalUrl||'',Spend:a.spend,Impressions:a.impressions,Clicks:a.clicks,CTR:a.ctr,'Avg CPC':a.avgCpc,Conversions:a.conversions,CPA:a.costPerConv}))
return <>
<div style={{display:'grid',gridTemplateColumns:'repeat(5,minmax(0,1fr))',gap:14,marginBottom:20}}>
<PremKPI label='ADS' value={fmtN(ads.length)} sub='Total tracked' accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.total}/>
<PremKPI label='TOTAL SPEND' value={fmt(total?.spend)} accent={C.blue} accentBg={C.blueBg} icon={KPI_ICONS.agent}/>
<PremKPI label='IMPRESSIONS' value={fmtN(total?.impressions)} accent={C.cyan} accentBg={C.cyanBg} icon={KPI_ICONS.globe}/>
<PremKPI label='CTR' value={fmtPct(total?.ctr)} accent={C.green} accentBg={C.greenBg} icon={KPI_ICONS.bot}/>
<PremKPI label='CONVERSIONS' value={total?.conversions?fmtN(total.conversions):'—'} accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.ai}/>
</div>
<Card title='Ads' sub={filtered.length+' of '+ads.length+' · headline, landing page &amp; ad copy'} action={
<div style={{display:'flex',alignItems:'center',gap:8}}>
<input value={search} onChange={e=>setSearch(e.target.value)} placeholder='Search headline or campaign...' style={{padding:'6px 10px',border:'0.5px solid '+C.border,borderRadius:8,fontSize:12,fontFamily:FONT,outline:'none',width:240,background:'var(--card)',color:C.text}}/>
<ExportButton data={exportRows} filename='google_ads_ads'/>
</div>
}>
<div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontFamily:FONT}}>
<thead><tr><th style={{padding:'10px 12px',fontWeight:700,color:C.muted,textAlign:'left',whiteSpace:'nowrap',fontSize:10.5,letterSpacing:'0.04em',textTransform:'uppercase',background:'#F9FAFB',borderBottom:'1px solid #F1F4F9',fontFamily:FONT}}></th><Th k='headline'>Ad</Th><Th k='campaign'>Campaign</Th><Th k='adGroup'>Ad group</Th><Th k='status'>Status</Th><th style={{padding:'10px 12px',fontWeight:700,color:C.muted,textAlign:'left',whiteSpace:'nowrap',fontSize:10.5,letterSpacing:'0.04em',textTransform:'uppercase',background:'#F9FAFB',borderBottom:'1px solid #F1F4F9',fontFamily:FONT}}>Landing page</th><Th k='spend' right>Spend</Th><Th k='impressions' right>Impr.</Th><Th k='clicks' right>Clicks</Th><Th k='ctr' right>CTR</Th><Th k='avgCpc' right>Avg CPC</Th><Th k='conversions' right>Conv.</Th><Th k='costPerConv' right>CPA</Th></tr></thead>
<tbody>{sorted.map((a,i)=>(
<tr key={a.id||i} style={{borderBottom:'0.5px solid '+C.border}}>
<td style={{padding:'8px 6px',textAlign:'center'}}>
<button type='button' onClick={()=>setPreviewAd(a)} title='View ad copy' style={{width:26,height:26,borderRadius:7,border:'0.5px solid '+C.border,background:'var(--card)',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',color:C.navy}}>
<svg width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'><path d='M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z'/><circle cx='12' cy='12' r='3'/></svg>
</button>
</td>
<td style={{padding:'8px 12px',fontSize:12.5,color:C.text,fontWeight:600,maxWidth:260,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}} title={a.headlines.join(' · ')}>{a.headlines[0]||'(no headline)'}<div><TypeTag t={a.type==='RESPONSIVE_SEARCH_AD'?'SEARCH':a.type}/></div></td>
<td style={{padding:'8px 12px',fontSize:12,color:C.sub,maxWidth:180,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}} title={a.campaign}>{a.campaign}</td>
<td style={{padding:'8px 12px',fontSize:12,color:C.sub,maxWidth:160,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}} title={a.adGroup}>{a.adGroup}</td>
<td style={{padding:'8px 12px'}}><StatusBadge s={a.status}/></td>
<td style={{padding:'8px 12px',fontSize:12}}>{a.finalUrl?(
<div style={{display:'flex',alignItems:'center',gap:6}}>
<a href={a.finalUrl} target='_blank' rel='noreferrer' style={{color:C.blue,fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:140,textDecoration:'none'}} title={a.finalUrl}>{domain(a.finalUrl)}</a>
<button type='button' onClick={()=>copyLink(a.finalUrl)} title='Copy landing page link' style={{border:'none',background:'transparent',cursor:'pointer',color:C.muted,padding:2,display:'inline-flex'}}>
<svg width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.2' strokeLinecap='round' strokeLinejoin='round'><rect x='9' y='9' width='11' height='11' rx='2'/><path d='M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1'/></svg>
</button>
</div>
):<span style={{color:C.muted}}>—</span>}</td>
<td style={{padding:'8px 12px',textAlign:'right',fontWeight:700,color:C.text,fontSize:12.5,whiteSpace:'nowrap'}}>{fmt(a.spend)}</td>
<td style={{padding:'8px 12px',textAlign:'right',color:C.sub,fontSize:12.5}}>{fmtN(a.impressions)}</td>
<td style={{padding:'8px 12px',textAlign:'right',color:C.sub,fontSize:12.5}}>{fmtN(a.clicks)}</td>
<td style={{padding:'8px 12px',textAlign:'right',color:C.sub,fontSize:12.5}}>{fmtPct(a.ctr)}</td>
<td style={{padding:'8px 12px',textAlign:'right',color:C.sub,fontSize:12.5,whiteSpace:'nowrap'}}>{fmtCpc(a.avgCpc)}</td>
<td style={{padding:'8px 12px',textAlign:'right',color:C.navy,fontWeight:700,fontSize:12.5}}>{a.conversions?.toFixed(1)||'—'}</td>
<td style={{padding:'8px 12px',textAlign:'right',color:C.sub,fontSize:12.5,whiteSpace:'nowrap'}}>{fmt(a.costPerConv)}</td>
</tr>
))}</tbody>
</table></div>
</Card>
{previewAd&&(
<div onClick={()=>setPreviewAd(null)} style={{position:'fixed',inset:0,zIndex:500,background:'rgba(15,23,42,0.55)',display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
<div onClick={e=>e.stopPropagation()} style={{background:'var(--card)',borderRadius:16,maxWidth:480,width:'100%',maxHeight:'85vh',overflow:'auto',boxShadow:'0 30px 60px -20px rgba(0,0,0,.35)'}}>
<div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',padding:'18px 20px 12px',borderBottom:'0.5px solid '+C.border}}>
<div><div style={{fontSize:14,fontWeight:700,color:C.text}}>Ad copy</div><div style={{fontSize:11,color:C.muted,marginTop:2}}>{previewAd.campaign} · {previewAd.adGroup}</div></div>
<button type='button' onClick={()=>setPreviewAd(null)} style={{border:'none',background:'transparent',cursor:'pointer',color:C.muted,padding:4}}>
<svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round'><line x1='18' y1='6' x2='6' y2='18'/><line x1='6' y1='6' x2='18' y2='18'/></svg>
</button>
</div>
<div style={{padding:'18px 20px'}}>
<div style={{fontSize:10.5,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:8}}>Headlines</div>
<div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:18}}>{previewAd.headlines.map((h,i)=><span key={i} style={{padding:'5px 10px',borderRadius:7,background:C.navyBg,color:C.navy,fontSize:12.5,fontWeight:600}}>{h}</span>)}</div>
<div style={{fontSize:10.5,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:8}}>Descriptions</div>
<div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:18}}>{previewAd.descriptions.map((d,i)=><div key={i} style={{fontSize:12.5,color:C.text,lineHeight:1.5}}>{d}</div>)}</div>
</div>
{previewAd.finalUrl&&(
<div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:10,padding:'12px 20px 18px',borderTop:'0.5px solid '+C.border}}>
<a href={previewAd.finalUrl} target='_blank' rel='noreferrer' style={{display:'inline-flex',alignItems:'center',gap:6,padding:'7px 14px',borderRadius:8,border:'1px solid '+C.border,background:'var(--card)',color:C.text,fontSize:12,fontWeight:600,textDecoration:'none'}}>
<svg width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'><path d='M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6'/><polyline points='15 3 21 3 21 9'/><line x1='10' y1='14' x2='21' y2='3'/></svg>
Open landing page
</a>
<button type='button' onClick={()=>copyLink(previewAd.finalUrl)} style={{display:'inline-flex',alignItems:'center',gap:6,padding:'7px 14px',borderRadius:8,border:'1px solid '+C.border,background:linkCopied?C.greenBg:'var(--card)',color:linkCopied?C.green:C.text,fontSize:12,fontWeight:600,cursor:'pointer'}}>
{linkCopied?(<><svg width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round'><polyline points='20 6 9 17 4 12'/></svg>Copied</>):(<><svg width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'><rect x='9' y='9' width='13' height='13' rx='2'/><path d='M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1'/></svg>Copy link</>)}
</button>
</div>
)}
</div>
</div>
)}
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
<div style={{display:'flex',alignItems:'center',gap:8}}>
<input value={search} onChange={e=>setSearch(e.target.value)} placeholder='Search keywords...' style={{padding:'6px 10px',border:'0.5px solid '+C.border,borderRadius:8,fontSize:12,fontFamily:FONT,outline:'none',width:220,background:'var(--card)',color:C.text}}/>
<ExportButton data={sorted.map(k=>({Keyword:k.text,Match:k.matchType,Status:k.status,'Quality Score':k.qualityScore,Impressions:k.impressions,Clicks:k.clicks,CTR:k.ctr,'Avg CPC':k.avgCpc,Spend:k.spend,Conversions:k.conversions,CPA:k.costPerConv}))} filename='google_ads_keywords'/>
</div>
}>
<div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}>
<thead><tr><Th k='text'>Keyword</Th><Th k='matchType'>Match</Th><Th k='status'>Status</Th><Th k='qualityScore' right>QS</Th><Th k='impressions' right>Impr.</Th><Th k='clicks' right>Clicks</Th><Th k='ctr' right>CTR</Th><Th k='avgCpc' right>Avg CPC</Th><Th k='spend' right>Spend</Th><Th k='conversions' right>Conv.</Th><Th k='costPerConv' right>CPA</Th></tr></thead>
<tbody>{sorted.map((k,i)=>(
<tr key={i} style={{borderBottom:'0.5px solid '+C.border}}>
<td style={{padding:'8px 12px',fontSize:12.5,color:C.text,fontWeight:600,maxWidth:220,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}} title={k.text}>{k.text}</td>
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
<div style={{display:'flex',alignItems:'center',gap:8}}>
<input value={search} onChange={e=>setSearch(e.target.value)} placeholder='Search terms...' style={{padding:'6px 10px',border:'0.5px solid '+C.border,borderRadius:8,fontSize:12,fontFamily:FONT,outline:'none',width:220,background:'var(--card)',color:C.text}}/>
<ExportButton data={sorted.map(s=>({'Search Term':s.text,'Ad Group':s.adGroup,Campaign:s.campaign,Impressions:s.impressions,Clicks:s.clicks,CTR:s.ctr,'Avg CPC':s.avgCpc,Spend:s.spend,Conversions:s.conversions}))} filename='google_ads_search_terms'/>
</div>
}>
<div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}>
<thead><tr><Th k='text'>Search term</Th><Th k='adGroup'>Ad Group</Th><Th k='campaign'>Campaign</Th><Th k='impressions' right>Impr.</Th><Th k='clicks' right>Clicks</Th><Th k='ctr' right>CTR</Th><Th k='avgCpc' right>Avg CPC</Th><Th k='spend' right>Spend</Th><Th k='conversions' right>Conv.</Th></tr></thead>
<tbody>{sorted.map((s,i)=>(
<tr key={i} style={{borderBottom:'0.5px solid '+C.border}}>
<td style={{padding:'8px 12px',fontSize:12.5,color:C.text,fontWeight:600,maxWidth:240,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}} title={s.text}>{s.text}</td>
<td style={{padding:'8px 12px',fontSize:12,color:C.sub,maxWidth:180,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{s.adGroup||'—'}</td>
<td style={{padding:'8px 12px',fontSize:12,color:C.sub,maxWidth:180,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{s.campaign}</td>
<td style={{padding:'8px 12px',textAlign:'right',color:C.sub,fontSize:12.5}}>{fmtN(s.impressions)}</td>
<td style={{padding:'8px 12px',textAlign:'right',color:C.sub,fontSize:12.5}}>{fmtN(s.clicks)}</td>
<td style={{padding:'8px 12px',textAlign:'right',color:C.sub,fontSize:12.5}}>{fmtPct(s.ctr)}</td>
<td style={{padding:'8px 12px',textAlign:'right',color:C.sub,fontSize:12.5,whiteSpace:'nowrap'}}>{fmtCpc(s.avgCpc)}</td>
<td style={{padding:'8px 12px',textAlign:'right',fontWeight:700,color:C.text,fontSize:12.5,whiteSpace:'nowrap'}}>{fmt(s.spend)}</td>
<td style={{padding:'8px 12px',textAlign:'right',color:C.navy,fontWeight:700,fontSize:12.5}}>{s.conversions?.toFixed(1)||'—'}</td>
</tr>
))}</tbody>
</table></div>
</Card>
</>
}

function AdGroupsTab({data,loading}){
const {sort,Th}=useSort('spend')
const [search,setSearch]=useState('')
if(loading)return <Loader/>
if(!data)return null
const{adGroups=[],total={}}=data||{}
const filtered=adGroups.filter(g=>!search||g.name.toLowerCase().includes(search.toLowerCase())||g.campaign.toLowerCase().includes(search.toLowerCase()))
const sorted=sort(filtered)
return <>
<div style={{display:'grid',gridTemplateColumns:'repeat(5,minmax(0,1fr))',gap:14,marginBottom:20}}>
<PremKPI label='AD GROUPS' value={fmtN(adGroups.length)} accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.total}/>
<PremKPI label='TOTAL SPEND' value={fmt(total?.spend)} accent={C.blue} accentBg={C.blueBg} icon={KPI_ICONS.agent}/>
<PremKPI label='IMPRESSIONS' value={fmtN(total?.impressions)} accent={C.cyan} accentBg={C.cyanBg} icon={KPI_ICONS.globe}/><PremKPI label='CLICKS' value={fmtN(total?.clicks)} accent={C.green} accentBg={C.greenBg} icon={KPI_ICONS.bot}/>
<PremKPI label='CONVERSIONS' value={total?.conversions?fmtN(total.conversions):'—'} accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.ai}/>
</div>
<Card title='Ad groups' sub={filtered.length+' of '+adGroups.length} action={
<div style={{display:'flex',alignItems:'center',gap:8}}>
<input value={search} onChange={e=>setSearch(e.target.value)} placeholder='Search ad groups...' style={{padding:'6px 10px',border:'0.5px solid '+C.border,borderRadius:8,fontSize:12,fontFamily:FONT,outline:'none',width:220,background:'var(--card)',color:C.text}}/>
<ExportButton data={sorted.map(g=>({'Ad Group':g.name,Campaign:g.campaign,Status:g.status,Spend:g.spend,Impressions:g.impressions,Clicks:g.clicks,CTR:g.ctr,'Avg CPC':g.avgCpc,Conversions:g.conversions,CPA:g.costPerConv}))} filename='google_ads_ad_groups'/>
</div>
}>
<div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}>
<thead><tr><Th k='name'>Ad Group</Th><Th k='campaign'>Campaign</Th><Th k='status'>Status</Th><Th k='spend' right>Spend</Th><Th k='impressions' right>Impr.</Th><Th k='clicks' right>Clicks</Th><Th k='ctr' right>CTR</Th><Th k='avgCpc' right>Avg CPC</Th><Th k='conversions' right>Conv.</Th><Th k='costPerConv' right>CPA</Th></tr></thead>
<tbody>{sorted.map((g,i)=>(
<tr key={i} style={{borderBottom:'0.5px solid '+C.border}}>
<td style={{padding:'8px 12px',fontSize:12.5,color:C.text,fontWeight:700,maxWidth:200,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}} title={g.name}>{g.name}</td>
<td style={{padding:'8px 12px',fontSize:12,color:C.sub,maxWidth:200,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{g.campaign}</td>
<td style={{padding:'8px 12px'}}><StatusBadge s={g.status}/></td>
<td style={{padding:'8px 12px',textAlign:'right',fontWeight:700,color:C.text,fontSize:12.5,whiteSpace:'nowrap'}}>{fmt(g.spend)}</td>
<td style={{padding:'8px 12px',textAlign:'right',color:C.sub,fontSize:12.5}}>{fmtN(g.impressions)}</td>
<td style={{padding:'8px 12px',textAlign:'right',color:C.sub,fontSize:12.5}}>{fmtN(g.clicks)}</td>
<td style={{padding:'8px 12px',textAlign:'right',color:C.sub,fontSize:12.5}}>{fmtPct(g.ctr)}</td>
<td style={{padding:'8px 12px',textAlign:'right',color:C.sub,fontSize:12.5,whiteSpace:'nowrap'}}>{fmtCpc(g.avgCpc)}</td>
<td style={{padding:'8px 12px',textAlign:'right',color:C.navy,fontWeight:700,fontSize:12.5}}>{g.conversions?.toFixed(1)||'—'}</td>
<td style={{padding:'8px 12px',textAlign:'right',color:C.sub,fontSize:12.5,whiteSpace:'nowrap'}}>{fmt(g.costPerConv)}</td>
</tr>
))}</tbody>
</table></div>
</Card>
</>
}

function TrendTab({mode}){const [rows,setRows]=useState([]);const [total,setTotal]=useState({});const [loading,setLoading]=useState(true);const [err,setErr]=useState(null);useEffect(()=>{const now=new Date();const pad=n=>String(n).padStart(2,'0');const until=now.getFullYear()+'-'+pad(now.getMonth()+1)+'-'+pad(now.getDate());const since=mode==='month'?(now.getFullYear()+'-01-01'):(now.getFullYear()+'-'+pad(now.getMonth()+1)+'-01');setLoading(true);const token=localStorage.getItem('quantum_token');fetch('/api/google-ads?tab=trend&mode='+mode+'&from='+since+'&to='+until,{headers:{'Authorization':'Bearer '+(token||'')}}).then(r=>r.json()).then(json=>{if(json.error){setErr(json.error);return}setRows(json.points||[]);setTotal(json.total||{})}).catch(e=>setErr(e.message)).finally(()=>setLoading(false))},[mode]);if(loading)return <Loader/>;const fmtPeriod=p=>mode==='month'?new Date(p).toLocaleDateString('en-US',{month:'short',year:'numeric'}):new Date(p).toLocaleDateString('en-US',{day:'2-digit',month:'short'});const thS={padding:'10px 12px',fontWeight:700,color:C.muted,textAlign:'right',fontSize:10.5,letterSpacing:'0.04em',textTransform:'uppercase',background:'#F9FAFB',borderBottom:'1px solid #F1F4F9'};const thL={...thS,textAlign:'left'};const tdR={padding:'8px 12px',textAlign:'right',color:C.sub,fontSize:12.5};const tdL={padding:'8px 12px',fontSize:12.5,color:C.text,fontWeight:600};return <><div style={{fontSize:12,color:C.muted,marginBottom:14,fontFamily:FONT}}>{mode==='month'?'Fixed range: Jan 1 to today (not affected by the date filter)':'Fixed range: 1st of this month to today (not affected by the date filter)'}</div>{err&&<div style={{padding:'10px 14px',borderRadius:10,background:'#FEF2F2',color:'#DC2626',fontSize:12.5,fontWeight:600,marginBottom:16}}>{err}</div>}<div style={{display:'grid',gridTemplateColumns:'repeat(5,minmax(0,1fr))',gap:14,marginBottom:20}}><PremKPI label='Total Spend' value={fmt(total.spend)} accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.total}/><PremKPI label='Impressions' value={fmtN(total.impressions)} accent={C.blue} accentBg={C.blueBg} icon={KPI_ICONS.globe}/><PremKPI label='Clicks' value={fmtN(total.clicks)} accent={C.cyan} accentBg={C.cyanBg} icon={KPI_ICONS.ai}/><PremKPI label='CTR' value={fmtPct(total.ctr)} accent={C.green} accentBg={C.greenBg} icon={KPI_ICONS.bot}/><PremKPI label='Conversions' value={fmtN(total.conversions)} accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.agent}/></div><Card title={mode==='month'?'Month on month':'Day on day'} sub={rows.length+' periods'}><div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontFamily:FONT}}><thead><tr><th style={thL}>Period</th><th style={thS}>Spend</th><th style={thS}>Impr.</th><th style={thS}>Clicks</th><th style={thS}>CTR</th><th style={thS}>Avg CPC</th><th style={thS}>Conv.</th><th style={thS}>CPA</th></tr></thead><tbody>{rows.map((r,i)=>(<tr key={i} style={{borderBottom:'0.5px solid '+C.border}}><td style={tdL}>{fmtPeriod(r.period)}</td><td style={{...tdR,fontWeight:700,color:C.text}}>{fmt(r.spend)}</td><td style={tdR}>{fmtN(r.impressions)}</td><td style={tdR}>{fmtN(r.clicks)}</td><td style={tdR}>{fmtPct(r.ctr)}</td><td style={{...tdR,whiteSpace:'nowrap'}}>{fmtCpc(r.avgCpc)}</td><td style={{...tdR,color:C.navy,fontWeight:700}}>{r.conversions?.toFixed(1)||'—'}</td><td style={{...tdR,whiteSpace:'nowrap'}}>{fmt(r.costPerConv)}</td></tr>))}<tr style={{background:'#F8FAFC',fontWeight:800}}><td style={{...tdL,fontWeight:800}}>Total</td><td style={{...tdR,fontWeight:800,color:C.text}}>{fmt(total.spend)}</td><td style={{...tdR,fontWeight:800,color:C.text}}>{fmtN(total.impressions)}</td><td style={{...tdR,fontWeight:800,color:C.text}}>{fmtN(total.clicks)}</td><td style={{...tdR,fontWeight:800,color:C.text}}>{fmtPct(total.ctr)}</td><td style={{...tdR,fontWeight:800,color:C.text,whiteSpace:'nowrap'}}>{fmtCpc(total.avgCpc)}</td><td style={{...tdR,fontWeight:800,color:C.text}}>{total.conversions?(+total.conversions).toFixed(1):'—'}</td><td style={{...tdR,fontWeight:800,color:C.text,whiteSpace:'nowrap'}}>{fmt(total.costPerConv)}</td></tr></tbody></table></div></Card></>}const METRIC_INFO=[
{k:'Spend',v:'Cost in the selected date range, from Google Ads metrics.cost_micros.'},
{k:'Impressions / Clicks',v:'Raw counts from Google Ads for the selected range.'},
{k:'CTR',v:'Clicks ÷ Impressions.'},
{k:'Avg CPC',v:'Average cost per click (metrics.average_cpc).'},
{k:'Conversions',v:'Google Ads-tracked conversions (metrics.conversions) — not the same source as CRM Leads.'},
{k:'CPA',v:'Cost per conversion (metrics.cost_per_conversion).'},
{k:'Impression Share',v:'Search impression share — how often your ads showed vs. eligible auctions.'},
{k:'Quality Score',v:'Google’s 1–10 keyword relevance/landing-page/CTR estimate.'},
{k:'Leads (Campaigns tab)',v:'Matched by campaign name from the CRM leads sheet, independent of Google’s own Conversions metric.'},
]

export default function GoogleAdsDashboard(){
const { user } = useAuth()
const activeUsers = usePresence(user)
const [searchParams,setSearchParams]=useSearchParams()
const activeTab=searchParams.get('tab')||'campaigns'
const [dateRange,setDateRange]=useState('LAST_30_DAYS');const [customFrom,setCustomFrom]=useState('');const [customTo,setCustomTo]=useState('')
const [dateOpen,setDateOpen]=useState(false)
const [showInfo,setShowInfo]=useState(false)
const [lastSync,setLastSync]=useState(null)
const [data,setData]=useState({})
const [loading,setLoading]=useState({})
const [error,setError]=useState(null)
const [notConnected,setNotConnected]=useState(false)
const loaded=useRef({});const [leadsRows,setLeadsRows]=useState([]);useEffect(()=>{(async()=>{try{const url=await resolveSheetUrl('googleLeads',LEADS_CSV_DEFAULT);const res=await fetch(url);const txt=await res.text();setLeadsRows(parseLeadsCSV(txt))}catch(e){console.error('leads csv fetch',e)}})()},[]);const leadsAgg=useMemo(()=>{const{start,end}=resolveDateRangeBounds(dateRange,customFrom,customTo);const byCampaign={};let total=0;leadsRows.forEach(r=>{const d=parseLeadDate(r.lead_created_date);if(!d)return;if(d<start||d>end)return;const n=parseFloat(String(r.leads||'0').replace(/[^0-9.-]/g,''))||0;const camp=(r.opp_first_campaign_name||'').trim();if(camp){byCampaign[camp]=(byCampaign[camp]||0)+n;byCampaign[camp.toLowerCase()]=(byCampaign[camp.toLowerCase()]||0)+n}total+=n});return{byCampaign,total}},[leadsRows,dateRange,customFrom,customTo])

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
setLastSync(new Date())
}catch(e){setError(e.message)}
finally{setLoading(p=>({...p,[tab]:false}))}
},[dateRange,customFrom,customTo])

useEffect(()=>{ loaded.current={}; setData({}); },[dateRange,customFrom,customTo])
useEffect(()=>{ if(activeTab==='mom'||activeTab==='dod')return; loadTab(activeTab,dateRange,customFrom,customTo) },[activeTab,dateRange,customFrom,customTo,loadTab])

const setTab=t=>setSearchParams({tab:t})
const isBusy=!!loading[activeTab]
const currentRangeLabel=(DATE_RANGES.find(d=>d.id===dateRange)||{}).label||'Custom'

return(
<div className='lq-page-shell' style={{display:'flex',height:'100vh',overflow:'hidden',background:C.bg,fontFamily:FONT}}>
<style>{'@keyframes gadsSpin{to{transform:rotate(360deg)}}'}</style>
<Sidebar/>
<div style={{margin:'12px 14px 0',borderRadius:14,border:'1px solid #EEF1F6',boxShadow:'0 1px 3px rgba(31,60,132,0.06)',flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minWidth:0}}>
<div style={{background:'var(--card)',borderBottom:'0.5px solid '+C.border,padding:'0 28px',minHeight:56,height:'auto',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexShrink:0,overflow:'visible',flexWrap:'wrap',rowGap:8}}>
<div>
<p style={{fontSize:9.5,fontWeight:600,color:'#C0C6D2',margin:0,letterSpacing:'0.1em',textTransform:'uppercase',fontFamily:FONT}}>Dashboards / Google Ads</p>
<h1 style={{fontSize:18,fontWeight:800,color:C.text,margin:'2px 0 0',letterSpacing:'-0.4px',fontFamily:FONT}}>{activeTab==='mom'?'Month on Month':activeTab==='dod'?'Day on Day':activeTab==='ads'?'Google Ads':'Google Ads'}</h1>
</div>
<div style={{display:(activeTab==='mom'||activeTab==='dod')?'none':'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>

{activeUsers.length>0&&(
<div style={{display:'flex',alignItems:'center',marginRight:2}}>
{activeUsers.slice(0,5).map((u,idx)=>(
<div key={u.email||idx} title={u.name||u.email} style={{width:22,height:22,borderRadius:'50%',border:'2px solid var(--card)',marginLeft:idx?-7:0,background:'linear-gradient(135deg,'+C.blue+','+C.cyan+')',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:700,color:'#fff',position:'relative'}}>
{u.picture?<img src={u.picture} alt='' style={{width:'100%',height:'100%',borderRadius:'50%',objectFit:'cover'}}/>:(u.name||u.email||'?')[0].toUpperCase()}
</div>
))}
{activeUsers.length>1&&<span style={{fontSize:10.5,color:C.muted,marginLeft:8,whiteSpace:'nowrap'}}>{activeUsers.length} online</span>}
</div>
)}

<div style={{display:'flex',alignItems:'center',gap:6,padding:'5px 10px',borderRadius:8,border:'0.5px solid '+C.border,background:'var(--card)'}}>
<span style={{width:7,height:7,borderRadius:'50%',background:notConnected?'#DC2626':C.green,flexShrink:0,boxShadow:'0 0 0 3px '+(notConnected?'rgba(220,38,38,.15)':'rgba(76,174,111,.18)')}}/>
<span style={{fontSize:11.5,fontWeight:700,color:C.text,whiteSpace:'nowrap'}}>{notConnected?'Not connected':'Google Ads · Live'}</span>
</div>

<div style={{position:'relative'}}>
<button type='button' onClick={()=>setDateOpen(o=>!o)} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 12px',borderRadius:8,border:'0.5px solid '+(dateOpen?C.blue:C.border),background:'var(--card)',fontSize:12,fontWeight:600,color:C.text,cursor:'pointer',fontFamily:FONT}}>
{currentRangeLabel}
<svg width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round' style={{transform:dateOpen?'rotate(180deg)':'none',transition:'transform .15s',opacity:.5}}><polyline points='6 9 12 15 18 9'/></svg>
</button>
{dateOpen&&(<>
<div onClick={()=>setDateOpen(false)} style={{position:'fixed',inset:0,zIndex:140}}/>
<div style={{position:'absolute',top:'calc(100% + 6px)',right:0,zIndex:150,background:'var(--card)',border:'0.5px solid '+C.border,borderRadius:10,boxShadow:'0 14px 32px rgba(15,23,42,.14)',padding:6,minWidth:170}}>
{DATE_RANGES.map(d=>(
<div key={d.id} onClick={()=>{setDateRange(d.id);if(d.id!=='CUSTOM')setDateOpen(false)}} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,padding:'7px 10px',borderRadius:7,fontSize:12.5,fontWeight:dateRange===d.id?700:500,color:dateRange===d.id?C.navy:C.text,background:dateRange===d.id?C.navyBg:'transparent',cursor:'pointer'}}>
{d.label}
{dateRange===d.id&&<svg width='11' height='11' viewBox='0 0 24 24' fill='none' stroke={C.blue} strokeWidth='3' strokeLinecap='round' strokeLinejoin='round'><polyline points='20 6 9 17 4 12'/></svg>}
</div>
))}
</div>
</>)}
</div>
{dateRange==='CUSTOM'&&<><input type='date' value={customFrom} onChange={e=>setCustomFrom(e.target.value)} style={{padding:'5px 10px',borderRadius:8,border:'0.5px solid '+C.border,fontSize:12,fontFamily:FONT,background:'var(--card)',color:C.text}}/><input type='date' value={customTo} onChange={e=>setCustomTo(e.target.value)} style={{padding:'5px 10px',borderRadius:8,border:'0.5px solid '+C.border,fontSize:12,fontFamily:FONT,background:'var(--card)',color:C.text}}/></>}

{lastSync&&!isBusy&&<span style={{fontSize:10.5,color:C.muted,whiteSpace:'nowrap'}}>Synced {lastSync.toLocaleTimeString()}</span>}

<button onClick={()=>{loaded.current={};setData({});loadTab(activeTab,dateRange,customFrom,customTo)}} disabled={isBusy} style={{padding:'6px 14px',borderRadius:8,border:'0.5px solid '+C.border,fontSize:12,fontWeight:600,cursor:isBusy?'default':'pointer',fontFamily:FONT,background:'var(--card)',color:C.text,display:'flex',alignItems:'center',gap:6,opacity:isBusy?.7:1}}>
<span style={{display:'inline-flex',animation:isBusy?'gadsSpin .7s linear infinite':'none'}}>
<svg width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round'><polyline points='23 4 23 10 17 10'/><polyline points='1 20 1 14 7 14'/><path d='M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15'/></svg>
</span>
{isBusy?'Refreshing…':'Refresh'}
</button>

{activeTab==='campaigns'&&(
<div style={{position:'relative'}}>
<button onClick={()=>setShowInfo(v=>!v)} title='How these metrics are calculated' style={{width:26,height:26,borderRadius:7,border:'0.5px solid '+C.border,background:showInfo?C.navyBg:'var(--card)',color:C.navy,fontSize:13,fontWeight:700,fontStyle:'italic',fontFamily:'Georgia,serif',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>i</button>
{showInfo&&<div onClick={()=>setShowInfo(false)} style={{position:'fixed',inset:0,zIndex:150}}/>}
{showInfo&&(
<div style={{position:'absolute',right:0,top:'calc(100% + 8px)',zIndex:200,width:340,maxHeight:'70vh',overflowY:'auto',background:'var(--card)',border:'0.5px solid '+C.border,borderRadius:12,boxShadow:'0 14px 40px rgba(15,23,42,0.16)',padding:'16px 18px',textAlign:'left',fontFamily:FONT}}>
<div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:3}}>How these metrics are calculated</div>
<div style={{fontSize:11,color:C.muted,marginBottom:12}}>Source: Google Ads API (GAQL), plus the CRM leads sheet where noted.</div>
{METRIC_INFO.map(({k,v})=>(
<div key={k} style={{marginBottom:10}}>
<div style={{fontSize:11.5,fontWeight:700,color:C.text,marginBottom:2}}>{k}</div>
<div style={{fontSize:11.5,color:C.muted,lineHeight:1.5}}>{v}</div>
</div>
))}
</div>
)}
</div>
)}
</div>
</div>
<div style={{display:(activeTab==='mom'||activeTab==='dod')?'none':'flex',gap:8,padding:'14px 28px 0',flexShrink:0}}>
{TABS.map(t=><div key={t.id} style={tabBtn(activeTab===t.id)} onClick={()=>setTab(t.id)}>{t.label}</div>)}
</div>
<div style={{flex:1,overflowY:'auto',padding:'16px 28px 28px'}}>
{error&&<div style={{padding:'10px 14px',borderRadius:10,background:'#FEF2F2',color:'#DC2626',fontSize:12.5,fontWeight:600,marginBottom:16}}>{error}</div>}
{notConnected ? <NotConnected/> : (
activeTab==='campaigns' ? <CampaignsTab data={data.campaigns} loading={!!loading.campaigns} leadsByCampaign={leadsAgg.byCampaign} totalLeads={leadsAgg.total}/> :
activeTab==='ads' ? <AdsTab data={data.ads} loading={!!loading.ads}/> :
activeTab==='keywords' ? <KeywordsTab data={data.keywords} loading={!!loading.keywords}/> :
activeTab==='searchTerms'?<SearchTermsTab data={data.searchTerms} loading={!!loading.searchTerms}/>:
activeTab==='mom'?<TrendTab mode='month'/>:activeTab==='dod'?<TrendTab mode='day'/>:<AdGroupsTab data={data.adGroups} loading={!!loading.adGroups}/>
)}
</div>
</div>
</div>
)
}
