import React,{useState,useEffect,useCallback,useRef} from 'react'
import{useSearchParams}from 'react-router-dom'
import{BarChart,Bar,XAxis,YAxis,Tooltip,ResponsiveContainer,Cell,CartesianGrid,ComposedChart,Line,ReferenceLine,LabelList}from 'recharts'
import Sidebar from '../components/Sidebar'
import { DashboardSkeleton, InlineLoader } from '../components/SkeletonLoader'

const DATE_RANGES=[{id:'TODAY',label:'Today'},{id:'LAST_7_DAYS',label:'Last 7 days'},{id:'LAST_30_DAYS',label:'Last 30 days'},{id:'LAST_90_DAYS',label:'Last 90 days'},{id:'THIS_MONTH',label:'This month'},{id:'LAST_MONTH',label:'Last month'}]
const TABS=[{id:'campaigns',label:'Campaigns'},{id:'keywords',label:'Keywords'},{id:'searchTerms',label:'Search terms'},{id:'adGroups',label:'Ad groups'}]

const fmt=n=>n==null?'—':n>=1e7?'\u20B9'+(n/1e7).toFixed(2)+' Cr':n>=1e5?'\u20B9'+(n/1e5).toFixed(1)+'L':n>=1000?'\u20B9'+(n/1000).toFixed(1)+'K':'\u20B9'+Math.round(n).toLocaleString('en-IN')
const fmtN=n=>n==null?'—':n>=1e5?(n/1e5).toFixed(1)+'L':n>=1e3?(n/1e3).toFixed(1)+'K':Math.round(n).toLocaleString('en-IN')
const pct=n=>n==null?'—':(n*100).toFixed(2)+'%'
const fmtCpc=n=>n==null?'—':'\u20B9'+n.toFixed(2)

const StatusBadge=({s})=>{
  const map={ENABLED:{bg:'#E9F8EF',color:'#4CAE6F',dot:'#4CAE6F',label:'Active'},PAUSED:{bg:'#FEF9C3',color:'#D97706',dot:'#D97706',label:'Paused'},REMOVED:{bg:'#FEF2F2',color:'#DC2626',dot:'#DC2626',label:'Removed'}}
  const v=map[s]||{bg:'#F3F4F6',color:'#6B7280',dot:'#9CA3AF',label:s||'Unknown'}
  return <span style={{background:v.bg,color:v.color,fontSize:11,fontWeight:600,padding:'2px 8px',borderRadius:10,display:'inline-flex',alignItems:'center',gap:4}}><span style={{width:6,height:6,borderRadius:'50%',background:v.dot,display:'inline-block'}}/>{v.label}</span>
}

const TypeTag=({t})=>{
  const map={SEARCH:{bg:'#E3F5FD',color:'#1C9FD4',label:'Search'},DISPLAY:{bg:'#E9F8EF',color:'#4CAE6F',label:'Display'},SHOPPING:{bg:'#FEF9C3',color:'#D97706',label:'Shopping'},VIDEO:{bg:'#FEF2F2',color:'#DC2626',label:'Video'},PERFORMANCE_MAX:{bg:'#F5F3FF',color:'#7C3AED',label:'PMax'}}
  const v=map[t]||{bg:'#F3F4F6',color:'#6B7280',label:t||'Other'}
  return <span style={{background:v.bg,color:v.color,fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:8}}>{v.label}</span>
}

const KPI=({label,value,sub,accent})=>(
  <div style={{background:'#fff',borderTop:'3px solid '+(accent||'#1C9FD4'),borderRadius:10,padding:'13px 16px 11px',border:'0.5px solid #E5E7EB'}}>
    <div style={{fontSize:'9.5px',fontWeight:700,color:'#94A3B8',letterSpacing:'0.07em',textTransform:'uppercase',marginBottom:5}}>{label}</div>
    <div style={{fontSize:20,fontWeight:700,color:'#0F172A',letterSpacing:'-0.5px',lineHeight:1}}>{value}</div>
    {sub&&<div style={{fontSize:11,color:'#94A3B8',marginTop:4}}>{sub}</div>}
  </div>
)

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
    <th onClick={()=>toggle(k)} style={{padding:'9px 12px',fontWeight:600,color:key===k?'#1F3C84':'#6B7280',textAlign:right?'right':'left',whiteSpace:'nowrap',fontSize:11,cursor:'pointer',background:'#F9FAFB',borderBottom:'0.5px solid #E5E7EB',userSelect:'none'}}>
      {children}{key===k?<span style={{marginLeft:3}}>{dir==='asc'?'\u25B2':'\u25BC'}</span>:''}
    </th>
  )
  return{key,dir,toggle,sort,Th}
}

const NotConnected=()=>(
  <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:400,gap:16}}>
    <div style={{width:56,height:56,borderRadius:16,background:'#E3F5FD',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <svg width='28' height='28' viewBox='0 0 24 24' fill='none' stroke='#1C9FD4' strokeWidth='2' strokeLinecap='round'><circle cx='12' cy='12' r='10'/><line x1='12' y1='8' x2='12' y2='12'/><line x1='12' y1='16' x2='12.01' y2='16'/></svg>
    </div>
    <div style={{textAlign:'center'}}>
      <div style={{fontSize:16,fontWeight:700,color:'#0F172A',marginBottom:6}}>Google Ads not connected</div>
      <div style={{fontSize:13,color:'#94A3B8',marginBottom:20}}>Add the following to your Vercel environment variables</div>
    </div>
    <div style={{background:'#F8FAFC',border:'0.5px solid #E5E7EB',borderRadius:12,padding:'16px 20px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px 32px',fontSize:12,fontFamily:'monospace'}}>
      {['GOOGLE_ADS_DEVELOPER_TOKEN','GOOGLE_ADS_CLIENT_ID','GOOGLE_ADS_CLIENT_SECRET','GOOGLE_ADS_REFRESH_TOKEN','GOOGLE_ADS_CUSTOMER_ID'].map(k=>(
        <div key={k} style={{display:'flex',alignItems:'center',gap:8}}><span style={{width:6,height:6,borderRadius:'50%',background:'#1C9FD4',flexShrink:0,display:'inline-block'}}/><span style={{color:'#374151',fontWeight:500}}>{k}</span></div>
      ))}
    </div>
  </div>
)

function CampaignsTab({data,loading}){
  const {key,dir,sort,Th}=useSort('spend')
  const [exp,setExp]=useState(null)
  if(loading)return <Loader/>
  if(!data)return null
  const{campaigns=[],total={}}=data||{}
  if(!campaigns.length&&!loading)return <NotConnected/>
  const sorted=sort(campaigns)
  const chartData=campaigns.filter(c=>c.spend>0).sort((a,b)=>b.spend-a.spend).slice(0,8).map(c=>({name:c.name.length>18?c.name.slice(0,18)+'...':c.name,spend:Math.round(c.spend/1000)}))
  return <>
    <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:11,marginBottom:16}}>
      <KPI label='Total Spend' value={fmt(total.spend)} accent='#1F3C84'/>
      <KPI label='Impressions' value={fmtN(total.impressions)} accent='#1C9FD4'/>
      <KPI label='Clicks' value={fmtN(total.clicks)} accent='#29B9C3'/>
      <KPI label='CTR' value={pct(total.ctr)} accent='#4CAE6F'/>
      <KPI label='Avg CPC' value={fmtCpc(total.avgCpc)} accent='#F59E0B'/>
      <KPI label='Conversions' value={total.conversions?.toFixed(1)||'—'} accent='#7C3AED'/>
      <KPI label='Cost / Conv' value={fmt(total.costPerConv)} accent='#EF4444'/>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'300px 1fr',gap:14,marginBottom:14}}>
      <div style={{background:'#fff',border:'0.5px solid #E5E7EB',borderRadius:12,padding:'16px'}}>
        <div style={{fontSize:13,fontWeight:600,color:'#0F172A',marginBottom:3}}>Spend by campaign</div>
        <div style={{fontSize:11,color:'#94A3B8',marginBottom:12}}>Top 8 by spend (\u20B9K)</div>
        <ResponsiveContainer width='100%' height={220}>
          <BarChart data={chartData} layout='vertical' margin={{top:0,right:50,left:0,bottom:0}} barSize={13}>
            <XAxis type='number' hide/>
            <YAxis type='category' dataKey='name' width={110} tick={{fontSize:10,fill:'#6B7280'}} axisLine={false} tickLine={false}/>
            <Tooltip formatter={v=>'\u20B9'+v+'K'} contentStyle={{fontSize:11,border:'0.5px solid #E5E7EB',borderRadius:8}}/>
            <Bar dataKey='spend' radius={[0,5,5,0]} fill='#1F3C84'>
              <LabelList dataKey='spend' position='right' formatter={v=>'\u20B9'+v+'K'} style={{fontSize:10,fontWeight:600,fill:'#374151'}}/>
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div style={{background:'#fff',border:'0.5px solid #E5E7EB',borderRadius:12,overflow:'hidden'}}>
        <div style={{padding:'12px 16px',borderBottom:'0.5px solid #E5E7EB',fontSize:13,fontWeight:600,color:'#0F172A'}}>All campaigns <span style={{fontSize:11,fontWeight:400,color:'#94A3B8',marginLeft:6}}>{campaigns.length} campaigns</span></div>
        <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead><tr><Th k='name'>Campaign</Th><Th k='status'>Status</Th><Th k='type'>Type</Th><Th k='spend' right>Spend</Th><Th k='impressions' right>Impr.</Th><Th k='clicks' right>Clicks</Th><Th k='ctr' right>CTR</Th><Th k='avgCpc' right>Avg CPC</Th><Th k='conversions' right>Conv.</Th><Th k='costPerConv' right>CPA</Th><Th k='impressionShare' right>Imp Share</Th></tr></thead>
          <tbody>{sorted.map(c=>(
            <React.Fragment key={c.id}>
              <tr onClick={()=>setExp(exp===c.id?null:c.id)} style={{borderBottom:'0.5px solid #F3F4F6',cursor:'pointer',background:exp===c.id?'#F0F7FF':'transparent'}}>
                <td style={{padding:'9px 12px',fontSize:12.5,color:'#111827',fontWeight:600,maxWidth:200}}><div style={{display:'flex',alignItems:'center',gap:6}}><span style={{fontSize:11,color:'#94A3B8'}}>{exp===c.id?'\u25BC':'\u25BA'}</span>{c.name}</div></td>
                <td style={{padding:'9px 12px'}}><StatusBadge s={c.status}/></td>
                <td style={{padding:'9px 12px'}}><TypeTag t={c.type}/></td>
                <td style={{padding:'9px 12px',textAlign:'right',fontWeight:700,color:'#0F172A',fontSize:12.5,whiteSpace:'nowrap'}}>{fmt(c.spend)}</td>
                <td style={{padding:'9px 12px',textAlign:'right',color:'#374151',fontSize:12.5}}>{fmtN(c.impressions)}</td>
                <td style={{padding:'9px 12px',textAlign:'right',color:'#374151',fontSize:12.5}}>{fmtN(c.clicks)}</td>
                <td style={{padding:'9px 12px',textAlign:'right',color:'#374151',fontSize:12.5}}>{pct(c.ctr)}</td>
                <td style={{padding:'9px 12px',textAlign:'right',color:'#374151',fontSize:12.5,whiteSpace:'nowrap'}}>{fmtCpc(c.avgCpc)}</td>
                <td style={{padding:'9px 12px',textAlign:'right',color:'#7C3AED',fontWeight:600,fontSize:12.5}}>{c.conversions?.toFixed(1)||'—'}</td>
                <td style={{padding:'9px 12px',textAlign:'right',color:'#374151',fontSize:12.5,whiteSpace:'nowrap'}}>{fmt(c.costPerConv)}</td>
                <td style={{padding:'9px 12px',textAlign:'right',fontSize:12.5,color:c.impressionShare>0.8?'#4CAE6F':c.impressionShare>0.5?'#D97706':'#DC2626'}}>{pct(c.impressionShare)}</td>
              </tr>
              {exp===c.id&&<tr style={{borderBottom:'0.5px solid #F3F4F6',background:'#F8FAFF'}}><td colSpan={11} style={{padding:'12px 24px'}}>
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,fontSize:12}}>
                  {[{l:'Campaign ID',v:c.id},{l:'Channel type',v:c.type},{l:'Impression Share',v:pct(c.impressionShare)},{l:'Cost per click',v:fmtCpc(c.avgCpc)}].map(({l,v})=>(
                    <div key={l}><div style={{fontSize:10,color:'#94A3B8',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:3}}>{l}</div><div style={{fontWeight:600,color:'#0F172A'}}>{v}</div></div>
                  ))}
                </div>
              </td></tr>}
            </React.Fragment>
          ))}</tbody>
        </table></div>
      </div>
    </div>
  </>
}

const Loader=()=><InlineLoader label='Loading from Google Ads' height={300}/>

function KeywordsTab({data,loading}){
  const {sort,Th}=useSort('spend')
  const [search,setSearch]=useState('')
  if(loading)return <Loader/>
  if(!data)return null
  const{keywords=[],total={}}=data||{}
  const filtered=keywords.filter(k=>!search||k.text.toLowerCase().includes(search.toLowerCase()))
  const sorted=sort(filtered)
  const avgQS=keywords.filter(k=>k.qualityScore>0).reduce((s,k,_,a)=>s+k.qualityScore/a.filter(x=>x.qualityScore>0).length,0)
  const qsColor=q=>q>=7?'#4CAE6F':q>=5?'#D97706':'#DC2626'
  const matchColor=m=>({EXACT:'#1F3C84',PHRASE:'#1C9FD4',BROAD:'#6B7280'}[m]||'#9CA3AF')
  return <>
    <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:11,marginBottom:16}}>
      <KPI label='Keywords' value={fmtN(keywords.length)} accent='#1F3C84' sub='Total tracked'/>
      <KPI label='Total Spend' value={fmt(total?.spend)} accent='#1C9FD4'/>
      <KPI label='Impressions' value={fmtN(total?.impressions)} accent='#29B9C3'/>
      <KPI label='Avg CTR' value={pct(total?.ctr)} accent='#4CAE6F'/>
      <KPI label='Avg CPC' value={fmtCpc(total?.avgCpc)} accent='#F59E0B'/>
      <KPI label='Avg Quality Score' value={avgQS?avgQS.toFixed(1)+'/10':'—'} accent={qsColor(avgQS)} sub='Higher is better'/>
    </div>
    <div style={{background:'#fff',border:'0.5px solid #E5E7EB',borderRadius:12,overflow:'hidden'}}>
      <div style={{padding:'12px 16px',borderBottom:'0.5px solid #E5E7EB',display:'flex',alignItems:'center',gap:12}}>
        <div style={{fontSize:13,fontWeight:600,color:'#0F172A',flex:1}}>Keywords <span style={{fontSize:11,fontWeight:400,color:'#94A3B8',marginLeft:6}}>{filtered.length} of {keywords.length}</span></div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder='Search keywords...' style={{padding:'6px 12px',border:'0.5px solid #E5E7EB',borderRadius:8,fontSize:12,fontFamily:'inherit',outline:'none',width:220}}/>
      </div>
      <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}>
        <thead><tr><Th k='text'>Keyword</Th><Th k='matchType'>Match</Th><Th k='status'>Status</Th><Th k='qualityScore' right>QS</Th><Th k='impressions' right>Impr.</Th><Th k='clicks' right>Clicks</Th><Th k='ctr' right>CTR</Th><Th k='avgCpc' right>Avg CPC</Th><Th k='spend' right>Spend</Th><Th k='conversions' right>Conv.</Th><Th k='costPerConv' right>CPA</Th></tr></thead>
        <tbody>{sorted.map((k,i)=>(
          <tr key={i} style={{borderBottom:'0.5px solid #F3F4F6'}}>
            <td style={{padding:'8px 12px',fontSize:12.5,color:'#111827',fontWeight:500,maxWidth:220}}>{k.text}</td>
            <td style={{padding:'8px 12px'}}><span style={{fontSize:10,fontWeight:600,color:matchColor(k.matchType),background:'#F3F4F6',padding:'2px 7px',borderRadius:6}}>{k.matchType}</span></td>
            <td style={{padding:'8px 12px'}}><StatusBadge s={k.status}/></td>
            <td style={{padding:'8px 12px',textAlign:'right'}}>{k.qualityScore>0?<span style={{fontWeight:700,color:qsColor(k.qualityScore),fontSize:13}}>{k.qualityScore}</span>:<span style={{color:'#D1D5DB',fontSize:12}}>—</span>}</td>
            <td style={{padding:'8px 12px',textAlign:'right',color:'#374151',fontSize:12.5}}>{fmtN(k.impressions)}</td>
            <td style={{padding:'8px 12px',textAlign:'right',color:'#374151',fontSize:12.5}}>{fmtN(k.clicks)}</td>
            <td style={{padding:'8px 12px',textAlign:'right',color:'#374151',fontSize:12.5}}>{pct(k.ctr)}</td>
            <td style={{padding:'8px 12px',textAlign:'right',color:'#374151',fontSize:12.5,whiteSpace:'nowrap'}}>{fmtCpc(k.avgCpc)}</td>
            <td style={{padding:'8px 12px',textAlign:'right',fontWeight:600,color:'#0F172A',fontSize:12.5,whiteSpace:'nowrap'}}>{fmt(k.spend)}</td>
            <td style={{padding:'8px 12px',textAlign:'right',color:'#7C3AED',fontWeight:600,fontSize:12.5}}>{k.conversions?.toFixed(1)||'—'}</td>
            <td style={{padding:'8px 12px',textAlign:'right',color:'#374151',fontSize:12.5,whiteSpace:'nowrap'}}>{fmt(k.costPerConv)}</td>
          </tr>
        ))}</tbody>
      </table></div>
    </div>
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
  return <>
    <div style={{background:'#fff',border:'0.5px solid #E5E7EB',borderRadius:12,overflow:'hidden',marginBottom:14}}>
      <div style={{padding:'12px 16px',borderBottom:'0.5px solid #E5E7EB',display:'flex',alignItems:'center',gap:12}}>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:600,color:'#0F172A'}}>Search terms <span style={{fontSize:11,fontWeight:400,color:'#94A3B8',marginLeft:6}}>{filtered.length} of {searchTerms.length}</span></div>
          <div style={{fontSize:11,color:'#94A3B8',marginTop:2}}>Actual search queries that triggered your ads</div>
        </div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder='Filter search terms...' style={{padding:'6px 12px',border:'0.5px solid #E5E7EB',borderRadius:8,fontSize:12,fontFamily:'inherit',outline:'none',width:220}}/>
      </div>
      <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}>
        <thead><tr><Th k='text'>Search term</Th><Th k='matchType'>Match</Th><Th k='campaign'>Campaign</Th><Th k='impressions' right>Impr.</Th><Th k='clicks' right>Clicks</Th><Th k='ctr' right>CTR</Th><Th k='avgCpc' right>Avg CPC</Th><Th k='spend' right>Spend</Th><Th k='conversions' right>Conv.</Th></tr></thead>
        <tbody>{sorted.map((s,i)=>(
          <tr key={i} style={{borderBottom:'0.5px solid #F3F4F6'}}>
            <td style={{padding:'8px 12px',fontSize:12.5,color:'#111827',fontWeight:500,maxWidth:240}}>{s.text}</td>
            <td style={{padding:'8px 12px'}}><span style={{fontSize:10,fontWeight:600,color:'#6B7280',background:'#F3F4F6',padding:'2px 7px',borderRadius:6}}>{s.matchType}</span></td>
            <td style={{padding:'8px 12px',fontSize:12,color:'#6B7280',maxWidth:180,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{s.campaign}</td>
            <td style={{padding:'8px 12px',textAlign:'right',color:'#374151',fontSize:12.5}}>{fmtN(s.impressions)}</td>
            <td style={{padding:'8px 12px',textAlign:'right',color:'#374151',fontSize:12.5}}>{fmtN(s.clicks)}</td>
            <td style={{padding:'8px 12px',textAlign:'right',color:'#374151',fontSize:12.5}}>{pct(s.ctr)}</td>
            <td style={{padding:'8px 12px',textAlign:'right',color:'#374151',fontSize:12.5,whiteSpace:'nowrap'}}>{fmtCpc(s.avgCpc)}</td>
            <td style={{padding:'8px 12px',textAlign:'right',fontWeight:600,color:'#0F172A',fontSize:12.5,whiteSpace:'nowrap'}}>{fmt(s.spend)}</td>
            <td style={{padding:'8px 12px',textAlign:'right',color:'#7C3AED',fontWeight:600,fontSize:12.5}}>{s.conversions?.toFixed(1)||'—'}</td>
          </tr>
        ))}</tbody>
      </table></div>
    </div>
  </>
}

function AdGroupsTab({data,loading}){
  const {sort,Th}=useSort('spend')
  if(loading)return <Loader/>
  if(!data)return null
  const{adGroups=[],total={}}=data||{}
  const sorted=sort(adGroups)
  return <>
    <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:11,marginBottom:16}}>
      <KPI label='Ad Groups' value={fmtN(adGroups.length)} accent='#1F3C84'/>
      <KPI label='Total Spend' value={fmt(total?.spend)} accent='#1C9FD4'/>
      <KPI label='Impressions' value={fmtN(total?.impressions)} accent='#29B9C3'/>
      <KPI label='Clicks' value={fmtN(total?.clicks)} accent='#4CAE6F'/>
      <KPI label='Conversions' value={total?.conversions?.toFixed(1)||'—'} accent='#7C3AED'/>
    </div>
    <div style={{background:'#fff',border:'0.5px solid #E5E7EB',borderRadius:12,overflow:'hidden'}}>
      <div style={{padding:'12px 16px',borderBottom:'0.5px solid #E5E7EB',fontSize:13,fontWeight:600,color:'#0F172A'}}>Ad groups <span style={{fontSize:11,fontWeight:400,color:'#94A3B8',marginLeft:6}}>{adGroups.length} total</span></div>
      <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}>
        <thead><tr><Th k='name'>Ad Group</Th><Th k='campaign'>Campaign</Th><Th k='status'>Status</Th><Th k='spend' right>Spend</Th><Th k='impressions' right>Impr.</Th><Th k='clicks' right>Clicks</Th><Th k='ctr' right>CTR</Th><Th k='avgCpc' right>Avg CPC</Th><Th k='conversions' right>Conv.</Th><Th k='costPerConv' right>CPA</Th></tr></thead>
        <tbody>{sorted.map((g,i)=>(
          <tr key={i} style={{borderBottom:'0.5px solid #F3F4F6'}}>
            <td style={{padding:'8px 12px',fontSize:12.5,color:'#111827',fontWeight:600,maxWidth:200}}>{g.name}</td>
            <td style={{padding:'8px 12px',fontSize:12,color:'#6B7280',maxWidth:200,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{g.campaign}</td>
            <td style={{padding:'8px 12px'}}><StatusBadge s={g.status}/></td>
            <td style={{padding:'8px 12px',textAlign:'right',fontWeight:600,color:'#0F172A',fontSize:12.5,whiteSpace:'nowrap'}}>{fmt(g.spend)}</td>
            <td style={{padding:'8px 12px',textAlign:'right',color:'#374151',fontSize:12.5}}>{fmtN(g.impressions)}</td>
            <td style={{padding:'8px 12px',textAlign:'right',color:'#374151',fontSize:12.5}}>{fmtN(g.clicks)}</td>
            <td style={{padding:'8px 12px',textAlign:'right',color:'#374151',fontSize:12.5}}>{pct(g.ctr)}</td>
            <td style={{padding:'8px 12px',textAlign:'right',color:'#374151',fontSize:12.5,whiteSpace:'nowrap'}}>{fmtCpc(g.avgCpc)}</td>
            <td style={{padding:'8px 12px',textAlign:'right',color:'#7C3AED',fontWeight:600,fontSize:12.5}}>{g.conversions?.toFixed(1)||'—'}</td>
            <td style={{padding:'8px 12px',textAlign:'right',color:'#374151',fontSize:12.5,whiteSpace:'nowrap'}}>{fmt(g.costPerConv)}</td>
          </tr>
        ))}</tbody>
      </table></div>
    </div>
  </>
}

export default function GoogleAdsDashboard(){
  const [searchParams,setSearchParams]=useSearchParams()
  const activeTab=searchParams.get('tab')||'campaigns'
  const [dateRange,setDateRange]=useState('LAST_30_DAYS')
  const [data,setData]=useState({})
  const [loading,setLoading]=useState({})
  const [error,setError]=useState(null)
  const [notConnected,setNotConnected]=useState(false)
  const loaded=useRef({})

  const loadTab=useCallback(async(tab,dr)=>{
    const k=tab+'_'+dr
    if(loaded.current[k])return
    setLoading(p=>({...p,[tab]:true}))
    try{
      const token=localStorage.getItem('quantum_token')
      const res=await fetch('/api/google-ads?tab='+tab+'&dateRange='+dr,{headers:{'Authorization':'Bearer '+(token||'')}})
      if(res.status===503||res.status===401){setNotConnected(true);return}
      if(!res.ok)throw new Error('API error '+res.status)
      const json=await res.json()
      if(json.error&&json.error.includes('credential')||json.notConnected){setNotConnected(true);return}
      setData(p=>({...p,[tab]:json}))
      loaded.current[k]=true
      setError(null)
    }catch(e){setError(e.message)}
    finally{setLoading(p=>({...p,[tab]:false}))}
  },[dateRange])

  useEffect(()=>{ loaded.current={}; setData({}); },[dateRange])
  useEffect(()=>{ loadTab(activeTab,dateRange) },[activeTab,dateRange,loadTab])

  const setTab=t=>setSearchParams({tab:t})

  return(
    <div style={{display:'flex',height:'100vh',background:'#F4F5F7',fontFamily:"'Plus Jakarta Sans','Inter',sans-serif"}}>
      <Sidebar/>
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minWidth:0}}>

        <div style={{margin:'12px 14px 0',borderRadius:14,border:'1px solid #EEF1F6',boxShadow:'0 1px 3px rgba(31,60,132,0.06)',background:'#fff',padding:'0 24px',flexShrink:0}}>
          <div style={{height:56,display:'flex',alignItems:'center',gap:16}}>
            <div style={{flex:1}}>
              <div style={{fontSize:11,color:'#94A3B8',letterSpacing:'0.04em',textTransform:'uppercase',marginBottom:2}}>Analytics / Google Ads</div>
              <div style={{fontSize:16,fontWeight:700,color:'#0F172A',letterSpacing:'-0.3px',lineHeight:1,display:'flex',alignItems:'center',gap:8}}>
                <svg width='18' height='18' viewBox='0 0 24 24' fill='none'><circle cx='12' cy='12' r='10' fill='#E3F5FD'/><path d='M8 12l3 3 5-5' stroke='#1C9FD4' strokeWidth='2' strokeLinecap='round'/></svg>
                Google Ads
              </div>
            </div>
            <div style={{display:'flex',gap:4,background:'#F4F5F7',padding:'3px',borderRadius:9,border:'0.5px solid #E5E7EB'}}>
              {DATE_RANGES.map(d=>(
                <button key={d.id} onClick={()=>setDateRange(d.id)}
                  style={{padding:'5px 11px',borderRadius:6,border:'none',fontSize:11.5,fontWeight:500,cursor:'pointer',fontFamily:'inherit',
                    background:dateRange===d.id?'#fff':'transparent',
                    color:dateRange===d.id?'#0F172A':'#6B7280',
                    boxShadow:dateRange===d.id?'0 1px 3px rgba(0,0,0,0.1)':'none'}}>{d.label}</button>
              ))}
            </div>
            <button onClick={()=>{loaded.current={};setData({});loadTab(activeTab,dateRange)}}
              style={{padding:'6px 14px',borderRadius:8,border:'0.5px solid #E5E7EB',fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'inherit',background:'#fff',color:'#374151',display:'flex',alignItems:'center',gap:5}}>
              <svg width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round'><polyline points='23 4 23 10 17 10'/><path d='M20.49 15a9 9 0 1 1-2.12-9.36L23 10'/></svg>Refresh
            </button>
          </div>
          <div style={{display:'flex',gap:0,borderTop:'0.5px solid #F3F4F6'}}>
            {TABS.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)}
                style={{padding:'10px 18px',border:'none',borderBottom:activeTab===t.id?'2px solid #1F3C84':'2px solid transparent',fontSize:13,fontWeight:activeTab===t.id?600:500,cursor:'pointer',fontFamily:'inherit',
                  background:'transparent',color:activeTab===t.id?'#1F3C84':'#6B7280'}}>{t.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{flex:1,overflowY:'auto',padding:22}}>
          {error&&<div style={{background:'#FEF2F2',border:'0.5px solid #FCA5A5',borderRadius:8,padding:'10px 14px',fontSize:12,color:'#DC2626',marginBottom:14}}>{error}</div>}
          {notConnected ? <NotConnected/> : (
            activeTab==='campaigns' ? <CampaignsTab data={data.campaigns} loading={!!loading.campaigns}/> :
            activeTab==='keywords'  ? <KeywordsTab  data={data.keywords}  loading={!!loading.keywords}/> :
            activeTab==='searchTerms'?<SearchTermsTab data={data.searchTerms} loading={!!loading.searchTerms}/>:
            <AdGroupsTab data={data.adGroups} loading={!!loading.adGroups}/>
          )}
        </div>
      </div>
    </div>
  )
}
