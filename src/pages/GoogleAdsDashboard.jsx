import React,{useState,useEffect,useCallback,useRef} from 'react'
import{useSearchParams}from 'react-router-dom'
import{BarChart,Bar,XAxis,YAxis,Tooltip,ResponsiveContainer,Cell}from 'recharts'
import Sidebar from '../components/Sidebar'

const API='/api/google-ads'
const TABS=[{key:'campaigns',label:'Campaigns'},{key:'keywords',label:'Keywords'},{key:'search_terms',label:'Search Terms'},{key:'ad_groups',label:'Ad Groups'}]
const STATUS_COLOR={ENABLED:'#059669',PAUSED:'#F59E0B',REMOVED:'#9CA3AF'}
const MATCH_COLOR={EXACT:'#1F3C84',PHRASE:'#1C9FD4',BROAD:'#9CA3AF',BROAD_MATCH:'#9CA3AF'}
const MATCH_LABEL={EXACT:'Exact',PHRASE:'Phrase',BROAD:'Broad',BROAD_MATCH:'Broad'}

function fmtINR(n){if(!n||n===0)return'\u2014';if(n>=1e7)return'\u20B9'+(n/1e7).toFixed(2)+' Cr';if(n>=1e5)return'\u20B9'+(n/1e5).toFixed(1)+'L';if(n>=1000)return'\u20B9'+(n/1000).toFixed(1)+'K';return'\u20B9'+Math.round(n).toLocaleString('en-IN')}
function fmtNum(n){if(!n||n===0)return'\u2014';if(n>=1e6)return(n/1e6).toFixed(1)+'M';if(n>=1e3)return(n/1e3).toFixed(1)+'K';return Math.round(n).toLocaleString()}
function fmtPct(n){return n?(n*100).toFixed(2)+'%':'\u2014'}

const KPI=({label,value,sub,accent='#1F3C84'})=>(<div style={{background:'#fff',borderTop:'3px solid '+accent,borderRadius:10,padding:'14px 16px 12px',border:'0.5px solid #E5E7EB'}}><div style={{fontSize:'9.5px',fontWeight:700,color:'#94A3B8',letterSpacing:'0.07em',textTransform:'uppercase',marginBottom:6}}>{label}</div><div style={{fontSize:20,fontWeight:700,color:'#0F172A',letterSpacing:'-0.5px',lineHeight:1}}>{value}</div>{sub&&<div style={{fontSize:11,color:'#94A3B8',marginTop:5}}>{sub}</div>}</div>)

const Th=({children,right,onClick,sorted})=>(<th onClick={onClick} style={{padding:'8px 12px',fontWeight:600,color:'#6B7280',textAlign:right?'right':'left',whiteSpace:'nowrap',fontSize:11,background:'#F9FAFB',borderBottom:'0.5px solid #E5E7EB',cursor:onClick?'pointer':'default',userSelect:'none'}}>{children}{sorted?' \u25BC':onClick?' \u25B3':''}</th>)
const Td=({children,right,bold,color,nowrap,mono})=>(<td style={{padding:'8px 12px',textAlign:right?'right':'left',fontWeight:bold?700:500,color:color||'#374151',fontSize:12.5,borderBottom:'0.5px solid #F3F4F6',whiteSpace:nowrap?'nowrap':'normal',fontFamily:mono?'monospace':'inherit'}}>{children}</td>)

const StatusBadge=({status})=>(<span style={{fontSize:10,fontWeight:600,padding:'2px 8px',borderRadius:10,background:status==='ENABLED'?'#E9F8EF':status==='PAUSED'?'#FEF9C3':'#F3F4F6',color:STATUS_COLOR[status]||'#9CA3AF'}}>{status==='ENABLED'?'Active':status==='PAUSED'?'Paused':'Removed'}</span>)

const QScore=({score})=>{if(!score)return<span style={{color:'#9CA3AF',fontSize:12}}>\u2014</span>;const c=score>=7?'#059669':score>=5?'#F59E0B':'#DC2626';return<span style={{fontWeight:700,color:c,fontSize:12.5}}>{score}<span style={{fontSize:10,color:'#9CA3AF'}}>/10</span></span>}

const NotConnected=()=>(<div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'60vh',gap:16,textAlign:'center'}}><div style={{width:64,height:64,borderRadius:16,background:'#E3F5FD',display:'flex',alignItems:'center',justifyContent:'center'}}><svg width='32' height='32' viewBox='0 0 24 24' fill='none'><rect x='2' y='3' width='20' height='14' rx='2' stroke='#1C9FD4' strokeWidth='2'/><path d='M8 21h8M12 17v4' stroke='#1C9FD4' strokeWidth='2' strokeLinecap='round'/></svg></div><div style={{fontSize:18,fontWeight:700,color:'#0F172A'}}>Google Ads not connected</div><div style={{fontSize:13,color:'#94A3B8',maxWidth:420,lineHeight:1.6}}>Add credentials to Vercel environment variables to connect your Google Ads account.</div><div style={{background:'#F8FAFC',border:'0.5px solid #E5E7EB',borderRadius:10,padding:'16px 20px',textAlign:'left',lineHeight:2}}><code style={{fontSize:12,color:'#374151',display:'block'}}>GOOGLE_ADS_DEVELOPER_TOKEN</code><code style={{fontSize:12,color:'#374151',display:'block'}}>GOOGLE_ADS_CLIENT_ID</code><code style={{fontSize:12,color:'#374151',display:'block'}}>GOOGLE_ADS_CLIENT_SECRET</code><code style={{fontSize:12,color:'#374151',display:'block'}}>GOOGLE_ADS_REFRESH_TOKEN</code><code style={{fontSize:12,color:'#374151',display:'block'}}>GOOGLE_ADS_CUSTOMER_ID</code></div></div>)

export default function GoogleAdsDashboard(){
  const[searchParams,setSearchParams]=useSearchParams()
  const[activeTab,setActiveTab]=useState('campaigns')
  const[data,setData]=useState(null)
  const[loading,setLoading]=useState(true)
  const[error,setError]=useState(null)
  const[notConnected,setNotConnected]=useState(false)
  const[lastSync,setLastSync]=useState(null)
  const[sortCol,setSortCol]=useState('spend')
  const[sortDir,setSortDir]=useState('desc')
  const[search,setSearch]=useState('')
  const[statusFilter,setStatusFilter]=useState('ALL')
  const[dateRange,setDateRange]=useState('LAST_30_DAYS')

  const loadTab=useCallback(async(tab,range)=>{
    setLoading(true);setError(null)
    try{
      const r=await fetch(`${API}?tab=${tab}&dateRange=${range||'LAST_30_DAYS'}`)
      const j=await r.json()
      if(j.error==='missing_credentials'){setNotConnected(true);return}
      if(j.error)throw new Error(j.error)
      setData(j);setLastSync(new Date());setNotConnected(false)
    }catch(e){setError(e.message)}
    finally{setLoading(false)}
  },[])

  useEffect(()=>{const t=searchParams.get('tab')||'campaigns';setActiveTab(t);loadTab(t,dateRange)},[loadTab])
  const switchTab=t=>{setActiveTab(t);setSearch('');setSearchParams({tab:t});loadTab(t,dateRange)}
  const changeDate=r=>{setDateRange(r);loadTab(activeTab,r)}
  const toggleSort=c=>{if(sortCol===c)setSortDir(d=>d==='desc'?'asc':'desc');else{setSortCol(c);setSortDir('desc')}}
  const fmt=new Intl.DateTimeFormat('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'})

  return(<div style={{display:'flex',height:'100vh',background:'#F4F5F7',fontFamily:"'Plus Jakarta Sans','Inter',sans-serif"}}>
    <Sidebar/>
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minWidth:0}}>
      <div style={{background:'#fff',borderBottom:'0.5px solid #E5E7EB',padding:'0 24px',height:60,display:'flex',alignItems:'center',gap:14,flexShrink:0}}>
        <div style={{flex:1}}><div style={{fontSize:11,color:'#94A3B8',letterSpacing:'0.04em',textTransform:'uppercase',marginBottom:2}}>Analytics / Google Ads</div><div style={{fontSize:18,fontWeight:700,color:'#0F172A',letterSpacing:'-0.3px',lineHeight:1}}>Google Ads</div></div>
        <select value={dateRange} onChange={e=>changeDate(e.target.value)} style={{padding:'6px 10px',border:'0.5px solid #E5E7EB',borderRadius:8,fontSize:12,fontFamily:'inherit',background:'#fff',color:'#374151',cursor:'pointer',outline:'none'}}>
          <option value='TODAY'>Today</option>
          <option value='LAST_7_DAYS'>Last 7 days</option>
          <option value='LAST_30_DAYS'>Last 30 days</option>
          <option value='LAST_90_DAYS'>Last 90 days</option>
          <option value='THIS_MONTH'>This month</option>
          <option value='LAST_MONTH'>Last month</option>
        </select>
        <div style={{fontSize:11,color:'#94A3B8',borderLeft:'0.5px solid #E5E7EB',paddingLeft:14}}>{lastSync?'Synced '+fmt.format(lastSync):''}</div>
        <button onClick={()=>loadTab(activeTab,dateRange)} style={{padding:'6px 14px',borderRadius:8,border:'0.5px solid #E5E7EB',fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'inherit',background:'#fff',color:'#374151',display:'flex',alignItems:'center',gap:6}}>
          <svg width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round'><polyline points='23 4 23 10 17 10'/><path d='M20.49 15a9 9 0 1 1-2.12-9.36L23 10'/></svg>Refresh
        </button>
      </div>
      <div style={{background:'#fff',borderBottom:'0.5px solid #E5E7EB',padding:'0 24px',display:'flex',flexShrink:0}}>
        {TABS.map(t=>(<button key={t.key} onClick={()=>switchTab(t.key)} style={{padding:'12px 18px',border:'none',borderBottom:activeTab===t.key?'2px solid #1F3C84':'2px solid transparent',background:'none',fontSize:13,fontWeight:activeTab===t.key?600:500,color:activeTab===t.key?'#1F3C84':'#6B7280',cursor:'pointer',fontFamily:'inherit',marginBottom:-1}}>{t.label}</button>))}
      </div>
      <div style={{flex:1,overflowY:'auto',padding:22}}>
        {notConnected&&<NotConnected/>}
        {!notConnected&&loading&&<div style={{textAlign:'center',padding:80,color:'#94A3B8',fontSize:13}}>Loading Google Ads data...</div>}
        {!notConnected&&error&&<div style={{textAlign:'center',padding:80,color:'#DC2626',fontSize:13}}>{error}</div>}

        {!notConnected&&!loading&&!error&&data&&activeTab==='campaigns'&&data.campaigns&&(()=>{
          const total=data.total
          const rows=[...data.campaigns].filter(c=>statusFilter==='ALL'||c.status===statusFilter).filter(c=>!search||c.name.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>sortDir==='desc'?b[sortCol]-a[sortCol]:a[sortCol]-b[sortCol])
          const chartData=[...data.campaigns].sort((a,b)=>b.spend-a.spend).slice(0,8).map(c=>({name:c.name.length>22?c.name.slice(0,22)+'...':c.name,spend:c.spend}))
          const colors=['#1F3C84','#1C9FD4','#29B9C3','#4CAE6F','#F59E0B','#7C3AED','#EC4899','#6B7280']
          return(<>
            <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:12,marginBottom:16}}>
              <KPI label='Total Spend' value={fmtINR(total.spend)} accent='#1F3C84'/>
              <KPI label='Impressions' value={fmtNum(total.impressions)} accent='#1C9FD4'/>
              <KPI label='Clicks' value={fmtNum(total.clicks)} accent='#29B9C3'/>
              <KPI label='CTR' value={fmtPct(total.ctr)} accent='#4CAE6F'/>
              <KPI label='Avg CPC' value={fmtINR(total.avgCpc)} accent='#F59E0B'/>
              <KPI label='Conversions' value={total.conversions?total.conversions.toFixed(0):'\u2014'} accent='#059669'/>
              <KPI label='Cost/Conv.' value={fmtINR(total.costPerConv)} accent='#7C3AED'/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'300px 1fr',gap:14,marginBottom:14}}>
              <div style={{background:'#fff',border:'0.5px solid #E5E7EB',borderRadius:12,padding:'16px'}}>
                <div style={{fontSize:13,fontWeight:600,color:'#0F172A',marginBottom:2}}>Spend by campaign</div>
                <div style={{fontSize:11,color:'#94A3B8',marginBottom:12}}>Top 8 by spend</div>
                <ResponsiveContainer width='100%' height={220}>
                  <BarChart data={chartData} layout='vertical' margin={{top:0,right:58,left:0,bottom:0}} barSize={14}>
                    <XAxis type='number' hide/>
                    <YAxis type='category' dataKey='name' width={95} tick={{fontSize:10,fill:'#6B7280',fontFamily:"'Plus Jakarta Sans','Inter',sans-serif"}} axisLine={false} tickLine={false}/>
                    <Tooltip formatter={v=>fmtINR(v)} contentStyle={{fontSize:11,border:'0.5px solid #E5E7EB',borderRadius:8}}/>
                    <Bar dataKey='spend' radius={[0,5,5,0]}>{chartData.map((_,i)=><Cell key={i} fill={colors[i%colors.length]}/>)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{background:'#fff',border:'0.5px solid #E5E7EB',borderRadius:12,overflow:'hidden'}}>
                <div style={{padding:'12px 16px',borderBottom:'0.5px solid #E5E7EB',display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
                  <input value={search} onChange={e=>setSearch(e.target.value)} placeholder='Search campaigns...' style={{flex:1,minWidth:160,padding:'6px 10px',border:'0.5px solid #E5E7EB',borderRadius:7,fontSize:12,fontFamily:'inherit',outline:'none'}}/>
                  {['ALL','ENABLED','PAUSED'].map(s=>(<button key={s} onClick={()=>setStatusFilter(s)} style={{padding:'5px 12px',borderRadius:7,border:'0.5px solid #E5E7EB',fontSize:11,fontWeight:500,cursor:'pointer',fontFamily:'inherit',background:statusFilter===s?'#1F3C84':'#fff',color:statusFilter===s?'#fff':'#6B7280'}}>{s==='ALL'?'All':s==='ENABLED'?'Active':'Paused'}</button>))}
                  <span style={{fontSize:11,color:'#9CA3AF'}}>{rows.length} campaigns</span>
                </div>
                <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}>
                  <thead><tr><Th>Campaign</Th><Th>Status</Th><Th right onClick={()=>toggleSort('spend')} sorted={sortCol==='spend'}>Spend</Th><Th right onClick={()=>toggleSort('impressions')} sorted={sortCol==='impressions'}>Impr.</Th><Th right onClick={()=>toggleSort('clicks')} sorted={sortCol==='clicks'}>Clicks</Th><Th right onClick={()=>toggleSort('ctr')} sorted={sortCol==='ctr'}>CTR</Th><Th right onClick={()=>toggleSort('avgCpc')} sorted={sortCol==='avgCpc'}>Avg CPC</Th><Th right onClick={()=>toggleSort('conversions')} sorted={sortCol==='conversions'}>Conv.</Th><Th right onClick={()=>toggleSort('costPerConv')} sorted={sortCol==='costPerConv'}>Cost/Conv</Th></tr></thead>
                  <tbody>{rows.map(c=>(<tr key={c.id}><Td><span style={{fontWeight:600,color:'#111827'}}>{c.name}</span></Td><Td><StatusBadge status={c.status}/></Td><Td right bold nowrap>{fmtINR(c.spend)}</Td><Td right>{fmtNum(c.impressions)}</Td><Td right>{fmtNum(c.clicks)}</Td><Td right color={c.ctr>0.05?'#059669':c.ctr>0.02?'#F59E0B':'#DC2626'}>{fmtPct(c.ctr)}</Td><Td right nowrap>{fmtINR(c.avgCpc)}</Td><Td right>{c.conversions||'\u2014'}</Td><Td right nowrap>{fmtINR(c.costPerConv)}</Td></tr>))}</tbody>
                </table></div>
              </div>
            </div>
          </>)
        })()}

        {!notConnected&&!loading&&!error&&data&&activeTab==='keywords'&&data.keywords&&(()=>{
          const rows=[...data.keywords].filter(k=>!search||k.keyword.toLowerCase().includes(search.toLowerCase())||k.campaign.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>sortDir==='desc'?b[sortCol]-a[sortCol]:a[sortCol]-b[sortCol])
          return(<div style={{background:'#fff',border:'0.5px solid #E5E7EB',borderRadius:12,overflow:'hidden'}}>
            <div style={{padding:'12px 16px',borderBottom:'0.5px solid #E5E7EB',display:'flex',gap:10,alignItems:'center'}}>
              <div style={{fontSize:13,fontWeight:600,color:'#0F172A'}}>Keywords</div>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder='Search keywords or campaigns...' style={{flex:1,maxWidth:320,padding:'6px 10px',border:'0.5px solid #E5E7EB',borderRadius:7,fontSize:12,fontFamily:'inherit',outline:'none'}}/>
              <span style={{fontSize:11,color:'#9CA3AF',marginLeft:'auto'}}>{rows.length} keywords</span>
            </div>
            <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr><Th>Keyword</Th><Th>Match</Th><Th>QS</Th><Th>Campaign</Th><Th right onClick={()=>toggleSort('spend')} sorted={sortCol==='spend'}>Spend</Th><Th right onClick={()=>toggleSort('impressions')} sorted={sortCol==='impressions'}>Impr.</Th><Th right onClick={()=>toggleSort('clicks')} sorted={sortCol==='clicks'}>Clicks</Th><Th right onClick={()=>toggleSort('ctr')} sorted={sortCol==='ctr'}>CTR</Th><Th right onClick={()=>toggleSort('avgCpc')} sorted={sortCol==='avgCpc'}>Avg CPC</Th><Th right onClick={()=>toggleSort('conversions')} sorted={sortCol==='conversions'}>Conv.</Th><Th right>Cost/Conv</Th></tr></thead>
              <tbody>{rows.map((k,i)=>(<tr key={i}><Td><span style={{fontWeight:600,color:'#111827'}}>{k.keyword}</span></Td><Td><span style={{fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:8,background:(MATCH_COLOR[k.matchType]||'#9CA3AF')+'22',color:MATCH_COLOR[k.matchType]||'#9CA3AF'}}>{MATCH_LABEL[k.matchType]||k.matchType}</span></Td><Td><QScore score={k.qualityScore}/></Td><Td><span style={{fontSize:11,color:'#6B7280'}}>{k.campaign.slice(0,28)}</span></Td><Td right bold nowrap>{fmtINR(k.spend)}</Td><Td right>{fmtNum(k.impressions)}</Td><Td right>{fmtNum(k.clicks)}</Td><Td right color={k.ctr>0.05?'#059669':k.ctr>0.02?'#F59E0B':'#DC2626'}>{fmtPct(k.ctr)}</Td><Td right nowrap>{fmtINR(k.avgCpc)}</Td><Td right>{k.conversions||'\u2014'}</Td><Td right nowrap>{fmtINR(k.costPerConv)}</Td></tr>))}</tbody>
            </table></div>
          </div>)
        })()}

        {!notConnected&&!loading&&!error&&data&&activeTab==='search_terms'&&data.terms&&(()=>{
          const rows=[...data.terms].filter(t=>!search||t.term.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>sortDir==='desc'?b[sortCol]-a[sortCol]:a[sortCol]-b[sortCol])
          return(<div style={{background:'#fff',border:'0.5px solid #E5E7EB',borderRadius:12,overflow:'hidden'}}>
            <div style={{padding:'12px 16px',borderBottom:'0.5px solid #E5E7EB',display:'flex',gap:10,alignItems:'center'}}>
              <div><div style={{fontSize:13,fontWeight:600,color:'#0F172A'}}>Search Terms</div><div style={{fontSize:11,color:'#94A3B8'}}>Actual queries that triggered your ads</div></div>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder='Filter terms...' style={{flex:1,maxWidth:280,padding:'6px 10px',border:'0.5px solid #E5E7EB',borderRadius:7,fontSize:12,fontFamily:'inherit',outline:'none',marginLeft:'auto'}}/>
              <span style={{fontSize:11,color:'#9CA3AF'}}>{rows.length} terms</span>
            </div>
            <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr><Th>Search Term</Th><Th>Campaign</Th><Th>Ad Group</Th><Th right onClick={()=>toggleSort('spend')} sorted={sortCol==='spend'}>Spend</Th><Th right onClick={()=>toggleSort('impressions')} sorted={sortCol==='impressions'}>Impr.</Th><Th right onClick={()=>toggleSort('clicks')} sorted={sortCol==='clicks'}>Clicks</Th><Th right onClick={()=>toggleSort('ctr')} sorted={sortCol==='ctr'}>CTR</Th><Th right onClick={()=>toggleSort('avgCpc')} sorted={sortCol==='avgCpc'}>Avg CPC</Th><Th right onClick={()=>toggleSort('conversions')} sorted={sortCol==='conversions'}>Conv.</Th></tr></thead>
              <tbody>{rows.map((t,i)=>(<tr key={i}><Td mono><span style={{fontWeight:600,color:'#111827'}}>{t.term}</span></Td><Td><span style={{fontSize:11,color:'#6B7280'}}>{t.campaign.slice(0,28)}</span></Td><Td><span style={{fontSize:11,color:'#6B7280'}}>{t.adGroup.slice(0,24)}</span></Td><Td right bold nowrap>{fmtINR(t.spend)}</Td><Td right>{fmtNum(t.impressions)}</Td><Td right>{fmtNum(t.clicks)}</Td><Td right color={t.ctr>0.05?'#059669':t.ctr>0.02?'#F59E0B':'#DC2626'}>{fmtPct(t.ctr)}</Td><Td right nowrap>{fmtINR(t.avgCpc)}</Td><Td right>{t.conversions||'\u2014'}</Td></tr>))}</tbody>
            </table></div>
          </div>)
        })()}

        {!notConnected&&!loading&&!error&&data&&activeTab==='ad_groups'&&data.adGroups&&(()=>{
          const rows=[...data.adGroups].filter(g=>!search||g.name.toLowerCase().includes(search.toLowerCase())||g.campaign.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>sortDir==='desc'?b[sortCol]-a[sortCol]:a[sortCol]-b[sortCol])
          return(<div style={{background:'#fff',border:'0.5px solid #E5E7EB',borderRadius:12,overflow:'hidden'}}>
            <div style={{padding:'12px 16px',borderBottom:'0.5px solid #E5E7EB',display:'flex',gap:10,alignItems:'center'}}>
              <div style={{fontSize:13,fontWeight:600,color:'#0F172A'}}>Ad Groups</div>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder='Search ad groups...' style={{flex:1,maxWidth:280,padding:'6px 10px',border:'0.5px solid #E5E7EB',borderRadius:7,fontSize:12,fontFamily:'inherit',outline:'none'}}/>
              <span style={{fontSize:11,color:'#9CA3AF',marginLeft:'auto'}}>{rows.length} ad groups</span>
            </div>
            <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr><Th>Ad Group</Th><Th>Campaign</Th><Th>Status</Th><Th right onClick={()=>toggleSort('spend')} sorted={sortCol==='spend'}>Spend</Th><Th right onClick={()=>toggleSort('impressions')} sorted={sortCol==='impressions'}>Impr.</Th><Th right onClick={()=>toggleSort('clicks')} sorted={sortCol==='clicks'}>Clicks</Th><Th right onClick={()=>toggleSort('ctr')} sorted={sortCol==='ctr'}>CTR</Th><Th right onClick={()=>toggleSort('avgCpc')} sorted={sortCol==='avgCpc'}>Avg CPC</Th><Th right onClick={()=>toggleSort('conversions')} sorted={sortCol==='conversions'}>Conv.</Th><Th right>Cost/Conv</Th></tr></thead>
              <tbody>{rows.map(g=>(<tr key={g.id}><Td><span style={{fontWeight:600,color:'#111827'}}>{g.name}</span></Td><Td><span style={{fontSize:11,color:'#6B7280'}}>{g.campaign.slice(0,28)}</span></Td><Td><StatusBadge status={g.status}/></Td><Td right bold nowrap>{fmtINR(g.spend)}</Td><Td right>{fmtNum(g.impressions)}</Td><Td right>{fmtNum(g.clicks)}</Td><Td right color={g.ctr>0.05?'#059669':g.ctr>0.02?'#F59E0B':'#DC2626'}>{fmtPct(g.ctr)}</Td><Td right nowrap>{fmtINR(g.avgCpc)}</Td><Td right>{g.conversions||'\u2014'}</Td><Td right nowrap>{fmtINR(g.costPerConv)}</Td></tr>))}</tbody>
            </table></div>
          </div>)
        })()}

      </div>
    </div>
  </div>)
}
