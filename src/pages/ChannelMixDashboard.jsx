import React, { useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line, CartesianGrid, AreaChart, Area } from 'recharts'
import Sidebar from '../components/Sidebar'
import ExportButton from '../components/ExportButton'
import { DashboardSkeleton } from '../components/SkeletonLoader'
import styles from './ChannelMixDashboard.module.css'

const SRC_COLORS = {
  Facebook:'#6366F1', Google:'#10B981', Referral:'#F59E0B',
  'Content+Brand':'#EC4899', Affiliate:'#F97316', Remarketing:'#06B6D4',
  Offline:'#8B5CF6', Bing:'#84CC16', Branding:'#3B82F6',
  Unidentified:'#9CA3AF'
}

const CM_DATA  = [{"month":"Jan-2025","source":"Remarketing","opps":949,"spend":0,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Jan-2025","source":"Unidentified","opps":3400,"spend":0,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":0,"roas":0,"is_unidentified":true},{"month":"Jan-2025","source":"Affiliate","opps":46849,"spend":0,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Jan-2025","source":"Google","opps":38871,"spend":17382711.74,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Jan-2025","source":"Bing","opps":533,"spend":0,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Jan-2025","source":"Facebook","opps":21618,"spend":17478574.35,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Feb-2025","source":"Remarketing","opps":2,"spend":0,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Feb-2025","source":"Unidentified","opps":1121,"spend":0,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":0,"roas":0,"is_unidentified":true},{"month":"Feb-2025","source":"Affiliate","opps":60999,"spend":0,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Feb-2025","source":"Google","opps":37319,"spend":17597631.29,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Feb-2025","source":"Bing","opps":381,"spend":0,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Feb-2025","source":"Facebook","opps":18980,"spend":14158337.69,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Mar-2025","source":"Unidentified","opps":696,"spend":0,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":0,"roas":0,"is_unidentified":true},{"month":"Mar-2025","source":"Affiliate","opps":56212,"spend":0,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Mar-2025","source":"Google","opps":44254,"spend":21016007.86,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Mar-2025","source":"Bing","opps":628,"spend":0,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Mar-2025","source":"Facebook","opps":24520,"spend":15182982.23,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Apr-2025","source":"Unidentified","opps":631,"spend":0,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":0,"roas":0,"is_unidentified":true},{"month":"Apr-2025","source":"Affiliate","opps":74111,"spend":0,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Apr-2025","source":"Google","opps":36239,"spend":19218220.37,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Apr-2025","source":"Bing","opps":545,"spend":0,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Apr-2025","source":"Facebook","opps":15384,"spend":9652463.26,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"May-2025","source":"Unidentified","opps":906,"spend":0,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":0,"roas":0,"is_unidentified":true},{"month":"May-2025","source":"Affiliate","opps":67844,"spend":0,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"May-2025","source":"Google","opps":35243,"spend":17154897.03,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"May-2025","source":"Bing","opps":621,"spend":0,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"May-2025","source":"Facebook","opps":15349,"spend":7925000.18,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Jun-2025","source":"Unidentified","opps":829,"spend":0,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":0,"roas":0,"is_unidentified":true},{"month":"Jun-2025","source":"Affiliate","opps":68780,"spend":0,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Jun-2025","source":"Google","opps":26260,"spend":10391599.91,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Jun-2025","source":"Bing","opps":461,"spend":0,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Jun-2025","source":"Facebook","opps":18266,"spend":6561226.96,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Jul-2025","source":"Remarketing","opps":2,"spend":0,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Jul-2025","source":"Unidentified","opps":542,"spend":0,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":0,"roas":0,"is_unidentified":true},{"month":"Jul-2025","source":"Affiliate","opps":67053,"spend":0,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Jul-2025","source":"Google","opps":20969,"spend":7693553.86,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Jul-2025","source":"Bing","opps":342,"spend":0,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Jul-2025","source":"Facebook","opps":16263,"spend":5825215.76,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Aug-2025","source":"Offline","opps":0,"spend":0,"ac_rev":1264000,"vas_rev":400000,"total_rev":1664000,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Aug-2025","source":"Remarketing","opps":0,"spend":0,"ac_rev":585000,"vas_rev":53000,"total_rev":638000,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Aug-2025","source":"Branding","opps":0,"spend":0,"ac_rev":0,"vas_rev":15000,"total_rev":15000,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Aug-2025","source":"Unidentified","opps":583,"spend":0,"ac_rev":2063500,"vas_rev":4246690,"total_rev":6310190,"proj_rev":0,"roas":0,"is_unidentified":true},{"month":"Aug-2025","source":"Referral","opps":0,"spend":0,"ac_rev":7573390,"vas_rev":13260793,"total_rev":20834183,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Aug-2025","source":"Affiliate","opps":55890,"spend":0,"ac_rev":1119980,"vas_rev":3005322,"total_rev":4125302,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Aug-2025","source":"Google","opps":21763,"spend":7135949.26,"ac_rev":7430200,"vas_rev":18474684,"total_rev":25904884,"proj_rev":0,"roas":3.63,"is_unidentified":false},{"month":"Aug-2025","source":"Bing","opps":236,"spend":0,"ac_rev":62500,"vas_rev":327000,"total_rev":389500,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Aug-2025","source":"Facebook","opps":17860,"spend":6323610.97,"ac_rev":4805588,"vas_rev":9493488,"total_rev":14299076,"proj_rev":0,"roas":2.26,"is_unidentified":false},{"month":"Aug-2025","source":"Content+Brand","opps":0,"spend":0,"ac_rev":6180150,"vas_rev":9624605,"total_rev":15804755,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Sep-2025","source":"Offline","opps":0,"spend":0,"ac_rev":1264000,"vas_rev":0,"total_rev":1264000,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Sep-2025","source":"Remarketing","opps":0,"spend":0,"ac_rev":343000,"vas_rev":0,"total_rev":343000,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Sep-2025","source":"Unidentified","opps":1346,"spend":0,"ac_rev":3094222,"vas_rev":3664984,"total_rev":6759206,"proj_rev":0,"roas":0,"is_unidentified":true},{"month":"Sep-2025","source":"Referral","opps":0,"spend":0,"ac_rev":5095281,"vas_rev":10487647,"total_rev":15582928,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Sep-2025","source":"Affiliate","opps":50437,"spend":0,"ac_rev":1665000,"vas_rev":3643003,"total_rev":5308003,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Sep-2025","source":"Google","opps":19725,"spend":7407568.25,"ac_rev":5426751,"vas_rev":15057403,"total_rev":20484154,"proj_rev":0,"roas":2.77,"is_unidentified":false},{"month":"Sep-2025","source":"Bing","opps":222,"spend":0,"ac_rev":72500,"vas_rev":584250,"total_rev":656750,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Sep-2025","source":"Facebook","opps":32297,"spend":15549014.25,"ac_rev":5323515,"vas_rev":6906590,"total_rev":12230105,"proj_rev":0,"roas":0.79,"is_unidentified":false},{"month":"Sep-2025","source":"Content+Brand","opps":0,"spend":0,"ac_rev":5043058,"vas_rev":9037619,"total_rev":14080677,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Oct-2025","source":"Offline","opps":0,"spend":0,"ac_rev":2106000,"vas_rev":0,"total_rev":2106000,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Oct-2025","source":"Remarketing","opps":0,"spend":0,"ac_rev":365000,"vas_rev":0,"total_rev":365000,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Oct-2025","source":"Branding","opps":0,"spend":0,"ac_rev":225000,"vas_rev":0,"total_rev":225000,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Oct-2025","source":"Unidentified","opps":766,"spend":0,"ac_rev":3502997,"vas_rev":964811,"total_rev":4467808,"proj_rev":0,"roas":0,"is_unidentified":true},{"month":"Oct-2025","source":"Referral","opps":0,"spend":0,"ac_rev":5098712,"vas_rev":5560722,"total_rev":10659434,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Oct-2025","source":"Affiliate","opps":35553,"spend":0,"ac_rev":988000,"vas_rev":1629816,"total_rev":2617816,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Oct-2025","source":"Google","opps":21897,"spend":9071606.7,"ac_rev":5336256,"vas_rev":6838325,"total_rev":12174581,"proj_rev":0,"roas":1.34,"is_unidentified":false},{"month":"Oct-2025","source":"Bing","opps":340,"spend":0,"ac_rev":0,"vas_rev":215000,"total_rev":215000,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Oct-2025","source":"Facebook","opps":40775,"spend":15304822.15,"ac_rev":4381917,"vas_rev":6868714,"total_rev":11250631,"proj_rev":0,"roas":0.74,"is_unidentified":false},{"month":"Oct-2025","source":"Content+Brand","opps":0,"spend":0,"ac_rev":6670105,"vas_rev":5627451,"total_rev":12297556,"proj_rev":0,"roas":0,"is_unidentified":false},{"month":"Nov-2025","source":"Offline","opps":0,"spend":0,"ac_rev":2376828,"vas_rev":815500,"total_rev":3192328,"proj_rev":4440000,"roas":0,"is_unidentified":false},{"month":"Nov-2025","source":"Remarketing","opps":0,"spend":0,"ac_rev":400000,"vas_rev":1510325,"total_rev":1910325,"proj_rev":1853125,"roas":0,"is_unidentified":false},{"month":"Nov-2025","source":"Branding","opps":0,"spend":0,"ac_rev":540000,"vas_rev":0,"total_rev":540000,"proj_rev":540000,"roas":0,"is_unidentified":false},{"month":"Nov-2025","source":"Unidentified","opps":581,"spend":0,"ac_rev":703704,"vas_rev":1380000,"total_rev":2083704,"proj_rev":2563704,"roas":0,"is_unidentified":true},{"month":"Nov-2025","source":"Referral","opps":0,"spend":0,"ac_rev":5240010,"vas_rev":16115664,"total_rev":21355674,"proj_rev":23689305,"roas":0,"is_unidentified":false},{"month":"Nov-2025","source":"Affiliate","opps":39657,"spend":0,"ac_rev":1640000,"vas_rev":2090841,"total_rev":3730841,"proj_rev":4055841,"roas":0,"is_unidentified":false},{"month":"Nov-2025","source":"Google","opps":15594,"spend":8991077.26,"ac_rev":9907476,"vas_rev":13482553,"total_rev":23390029,"proj_rev":32610131,"roas":2.6,"is_unidentified":false},{"month":"Nov-2025","source":"Bing","opps":288,"spend":0,"ac_rev":0,"vas_rev":203145,"total_rev":203145,"proj_rev":1343358,"roas":0,"is_unidentified":false},{"month":"Nov-2025","source":"Facebook","opps":48652,"spend":14758698.48,"ac_rev":6723016,"vas_rev":10727447,"total_rev":17450463,"proj_rev":19774436,"roas":1.18,"is_unidentified":false},{"month":"Nov-2025","source":"Content+Brand","opps":0,"spend":0,"ac_rev":6276240,"vas_rev":8475490,"total_rev":14751730,"proj_rev":21019944,"roas":0,"is_unidentified":false},{"month":"Dec-2025","source":"Offline","opps":0,"spend":0,"ac_rev":870000,"vas_rev":3696692,"total_rev":4566692,"proj_rev":5087105,"roas":0,"is_unidentified":false},{"month":"Dec-2025","source":"Remarketing","opps":0,"spend":0,"ac_rev":562500,"vas_rev":2055604,"total_rev":2618104,"proj_rev":3315604,"roas":0,"is_unidentified":false},{"month":"Dec-2025","source":"Unidentified","opps":523,"spend":0,"ac_rev":3478286,"vas_rev":1820020,"total_rev":5298306,"proj_rev":8752254,"roas":0,"is_unidentified":true},{"month":"Dec-2025","source":"Referral","opps":0,"spend":0,"ac_rev":5845628,"vas_rev":33882440,"total_rev":39728068,"proj_rev":45758645,"roas":0,"is_unidentified":false},{"month":"Dec-2025","source":"Affiliate","opps":43519,"spend":0,"ac_rev":877000,"vas_rev":1908115,"total_rev":2785115,"proj_rev":3210494,"roas":0,"is_unidentified":false},{"month":"Dec-2025","source":"Google","opps":10547,"spend":9134288.06,"ac_rev":7596823,"vas_rev":26505403,"total_rev":34102226,"proj_rev":41026267,"roas":3.73,"is_unidentified":false},{"month":"Dec-2025","source":"Bing","opps":230,"spend":0,"ac_rev":0,"vas_rev":1793500,"total_rev":1793500,"proj_rev":3125000,"roas":0,"is_unidentified":false},{"month":"Dec-2025","source":"Facebook","opps":54246,"spend":13591714.21,"ac_rev":7666088,"vas_rev":14601871,"total_rev":22267959,"proj_rev":25677056,"roas":1.64,"is_unidentified":false},{"month":"Dec-2025","source":"Content+Brand","opps":0,"spend":0,"ac_rev":6582826,"vas_rev":14467906,"total_rev":21604107,"proj_rev":29672993,"roas":0,"is_unidentified":false}]
const SRC_DATA = [{"source":"Google","is_unidentified":false,"ac_rev":35697506,"vas_rev":80358368,"total_rev":116055874,"proj_rev":73636398,"opps":328681,"spend":152195111.59},{"source":"Referral","is_unidentified":false,"ac_rev":28853021,"vas_rev":79307266,"total_rev":108160287,"proj_rev":69447950,"opps":0,"spend":0},{"source":"Content+Brand","is_unidentified":false,"ac_rev":30752379,"vas_rev":47233071,"total_rev":78538825,"proj_rev":50692937,"opps":0,"spend":0},{"source":"Facebook","is_unidentified":false,"ac_rev":28900124,"vas_rev":48598110,"total_rev":77498234,"proj_rev":45451492,"opps":324210,"spend":142311660.49},{"source":"Unidentified","is_unidentified":true,"ac_rev":12842709,"vas_rev":12076505,"total_rev":24919214,"proj_rev":11315958,"opps":11924,"spend":0},{"source":"Affiliate","is_unidentified":false,"ac_rev":6289980,"vas_rev":12277097,"total_rev":18567077,"proj_rev":7266335,"opps":666904,"spend":0},{"source":"Offline","is_unidentified":false,"ac_rev":7880828,"vas_rev":4912192,"total_rev":12793020,"proj_rev":9527105,"opps":0,"spend":0},{"source":"Remarketing","is_unidentified":false,"ac_rev":2255500,"vas_rev":3618929,"total_rev":5874429,"proj_rev":5168729,"opps":953,"spend":0},{"source":"Bing","is_unidentified":false,"ac_rev":135000,"vas_rev":3122895,"total_rev":3257895,"proj_rev":4468358,"opps":4827,"spend":0},{"source":"Branding","is_unidentified":false,"ac_rev":765000,"vas_rev":15000,"total_rev":780000,"proj_rev":540000,"opps":0,"spend":0}]
const MONTHS   = ["Jan-2025","Feb-2025","Mar-2025","Apr-2025","May-2025","Jun-2025","Jul-2025","Aug-2025","Sep-2025","Oct-2025","Nov-2025","Dec-2025"]
const SOURCES  = ["Facebook","Google","Referral","Content+Brand","Affiliate","Remarketing","Offline","Bing","Unidentified","Branding"]

function fmt(n){
  if(!n||isNaN(n))return'0'
  if(n>=1e7)return'₹'+(n/1e7).toFixed(2)+' Cr'
  if(n>=1e5)return'₹'+(n/1e5).toFixed(1)+'L'
  if(n>=1e3)return(n/1e3).toFixed(1)+'K'
  return Math.round(n).toLocaleString('en-IN')
}
function fmtR(n){
  if(!n||isNaN(n))return'₹0'
  if(n>=1e7)return'₹'+(n/1e7).toFixed(2)+' Cr'
  if(n>=1e5)return'₹'+(n/1e5).toFixed(1)+'L'
  return'₹'+Math.round(n).toLocaleString('en-IN')
}
function fn(n){return(n&&n>0)?n.toLocaleString('en-IN'):'–'}

const CustomTooltip=({active,payload,label})=>{
  if(!active||!payload?.length)return null
  return(
    <div style={{background:'#fff',border:'1px solid #E5E7EB',borderRadius:10,padding:'10px 14px',boxShadow:'0 4px 16px rgba(0,0,0,0.08)'}}>
      <p style={{fontSize:11,fontWeight:700,color:'#111827',marginBottom:6}}>{label}</p>
      {payload.map((p,i)=>(
        <p key={i} style={{fontSize:11,color:p.color||'#374151',margin:'2px 0'}}>
          {p.name}: <strong>{fmt(p.value)}</strong>
        </p>
      ))}
    </div>
  )
}

export default function ChannelMixDashboard(){
  const [pageLoading, setPageLoading] = React.useState(true)
  React.useEffect(() => { const t = setTimeout(() => setPageLoading(false), 600); return () => clearTimeout(t) }, [])
  const [selMonth, setSelMonth] = useState('All')

  const filtered = useMemo(()=>
    CM_DATA.filter(r => selMonth==='All' || r.month===selMonth)
  ,[selMonth])

  const totals = useMemo(()=>{
    const t={opps:0,spend:0,total_rev:0}
    filtered.forEach(r=>{t.opps+=r.opps;t.spend+=r.spend;t.total_rev+=r.total_rev})
    return t
  },[filtered])

  // Source breakdown (aggregated)
  const srcBreakdown = useMemo(()=>{
    const map={}
    filtered.forEach(r=>{
      if(!map[r.source])map[r.source]={source:r.source,opps:0,spend:0,total_rev:0,is_unidentified:r.is_unidentified}
      map[r.source].opps+=r.opps
      map[r.source].spend+=r.spend
      map[r.source].total_rev+=r.total_rev
    })
    return Object.values(map).sort((a,b)=>b.opps-a.opps)
  },[filtered])

  // Monthly stacked OPPs
  const monthlyOPPs = useMemo(()=>
    MONTHS.map(m=>{
      const rows=CM_DATA.filter(r=>r.month===m)
      const obj={month:m.replace('-2025','')}
      SOURCES.forEach(s=>{obj[s]=rows.find(r=>r.source===s)?.opps||0})
      return obj
    }),[])

  // Monthly spend by source
  const monthlySpend = useMemo(()=>
    MONTHS.map(m=>{
      const rows=CM_DATA.filter(r=>r.month===m)
      const obj={month:m.replace('-2025','')}
      SOURCES.forEach(s=>{obj[s]=rows.find(r=>r.source===s)?.spend||0})
      return obj
    }),[])

  // Pie for OPPs share
  const oppsPie = useMemo(()=>
    srcBreakdown.filter(r=>r.opps>0).map(r=>({name:r.source,value:r.opps,unid:r.is_unidentified}))
  ,[srcBreakdown])

  const spendPie = useMemo(()=>
    srcBreakdown.filter(r=>r.spend>0).map(r=>({name:r.source,value:r.spend,unid:r.is_unidentified}))
  ,[srcBreakdown])

  return(
    <div className={styles.layout}>
      <Sidebar/>
      <div className={styles.main}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <p className={styles.breadcrumb}>Dashboards / Channel Mix</p>
            <h1 className={styles.pageTitle}>Channel Mix 2025</h1>
          </div>
          <div className={styles.headerRight}>
            <select className={styles.fsel} value={selMonth} onChange={e=>setSelMonth(e.target.value)}>
              <option value="All">All Months</option>
              {MONTHS.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
            <ExportButton data={srcBreakdown} filename="channel_mix_sources"/>
            <div className={styles.liveBadge}><span className={styles.liveDot}/>Live</div>
          </div>
        </div>

        <div className={styles.content}>
        {/* Unidentified warning */}
        {filtered.some(r=>r.is_unidentified&&(r.opps>0||r.total_rev>0))&&(
          <div className={styles.unidWarning}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <div>
              <strong>Unidentified Sources Detected</strong>
              <span> — {fmtR(filtered.filter(r=>r.is_unidentified).reduce((s,r)=>s+r.total_rev,0))} revenue and {fn(filtered.filter(r=>r.is_unidentified).reduce((s,r)=>s+r.opps,0))} OPPs are from sources that have not been identified yet. These are tracked separately below.</span>
            </div>
          </div>
        )}

        {/* KPI row */}
        <div className={styles.kpiRow}>
          {[
            {l:'Total OPPs',  v:fn(totals.opps),       s:'All sources',   c:'#6366F1'},
            {l:'Total Spend', v:fmtR(totals.spend),     s:'Paid channels', c:'#10B981'},
            {l:'Total Revenue',v:fmtR(totals.total_rev),s:'AC + VAS',      c:'#F59E0B'},
            {l:'Active Sources',v:srcBreakdown.filter(r=>r.opps>0).length+'',s:'Channels tracked',c:'#3B82F6'},
          ].map(k=>(
            <div key={k.l} className={styles.kpi}>
              <div className={styles.kpiVal}>{k.v}</div>
              <div className={styles.kpiLbl}>{k.l}</div>
              <div className={styles.kpiSub}>{k.s}</div>
              <div className={styles.kpiBar} style={{background:k.c+'22',borderTop:`2px solid ${k.c}`}}/>
            </div>
          ))}
        </div>

        {/* Charts Row 1 */}
        <div className={styles.grid2}>
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <span className={styles.cardTitle}>OPPs by Source — Monthly</span>
              <span className={styles.cardSub}>Stacked · All channels</span>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={monthlyOPPs} margin={{top:4,right:8,left:0,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false}/>
                <XAxis dataKey="month" tick={{fontSize:10,fill:'#9CA3AF'}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fontSize:10,fill:'#9CA3AF'}} axisLine={false} tickLine={false} tickFormatter={v=>fmt(v)} width={55}/>
                <Tooltip content={<CustomTooltip/>}/>
                <Legend wrapperStyle={{fontSize:10}}/>
                {SOURCES.filter(s=>s!=='Unidentified').map(s=>(
                  <Bar key={s} dataKey={s} stackId="a" fill={SRC_COLORS[s]||'#9CA3AF'} fillOpacity={0.85}/>
                ))}
                <Bar dataKey="Unidentified" stackId="a" fill="#E5E7EB" fillOpacity={0.9}/>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className={styles.card}>
            <div className={styles.cardHead}>
              <span className={styles.cardTitle}>OPP Share by Source</span>
              <span className={styles.cardSub}>{selMonth==='All'?'Full Year':selMonth}</span>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <ResponsiveContainer width={180} height={200}>
                <PieChart>
                  <Pie data={oppsPie} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" strokeWidth={0}>
                    {oppsPie.map((e,i)=>(
                      <Cell key={i} fill={e.unid?'#E5E7EB':SRC_COLORS[e.name]||'#9CA3AF'}/>
                    ))}
                  </Pie>
                  <Tooltip formatter={v=>[fn(v),'OPPs']}/>
                </PieChart>
              </ResponsiveContainer>
              <div style={{flex:1,display:'flex',flexDirection:'column',gap:7}}>
                {oppsPie.map(e=>(
                  <div key={e.name} style={{display:'flex',alignItems:'center',gap:7}}>
                    <span style={{width:8,height:8,borderRadius:'50%',background:e.unid?'#E5E7EB':SRC_COLORS[e.name]||'#9CA3AF',flexShrink:0,border:e.unid?'1px solid #9CA3AF':'none'}}/>
                    <span style={{fontSize:11,color:e.unid?'#9CA3AF':'#374151',flex:1,fontStyle:e.unid?'italic':'normal'}}>
                      {e.unid?'⚠ Unidentified':e.name}
                    </span>
                    <span style={{fontSize:11,fontWeight:700,color:e.unid?'#9CA3AF':'#111827'}}>{fn(e.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Charts Row 2 */}
        <div className={styles.grid2}>
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <span className={styles.cardTitle}>Ad Spend by Channel — Monthly</span>
              <span className={styles.cardSub}>Paid channels only</span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlySpend} margin={{top:4,right:8,left:0,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false}/>
                <XAxis dataKey="month" tick={{fontSize:10,fill:'#9CA3AF'}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fontSize:10,fill:'#9CA3AF'}} axisLine={false} tickLine={false} tickFormatter={v=>fmtR(v)} width={65}/>
                <Tooltip content={<CustomTooltip/>}/>
                <Legend wrapperStyle={{fontSize:10}}/>
                {['Facebook','Google','Bing','Remarketing'].map(s=>(
                  <Bar key={s} dataKey={s} stackId="b" fill={SRC_COLORS[s]} fillOpacity={0.85}/>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className={styles.card}>
            <div className={styles.cardHead}>
              <span className={styles.cardTitle}>Revenue by Source</span>
              <span className={styles.cardSub}>AC + VAS collected · Aug–Dec</span>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:8,paddingTop:4}}>
              {srcBreakdown.filter(r=>r.total_rev>0).map(r=>{
                const maxRev=Math.max(...srcBreakdown.map(x=>x.total_rev),1)
                return(
                  <div key={r.source} style={{display:'flex',alignItems:'center',gap:10}}>
                    <span style={{fontSize:11,fontWeight:600,width:100,color:r.is_unidentified?'#9CA3AF':'#374151',fontStyle:r.is_unidentified?'italic':'normal',flexShrink:0}}>
                      {r.is_unidentified?'⚠ Unid.':r.source}
                    </span>
                    <div style={{flex:1,background:'#F3F4F6',borderRadius:4,height:22,overflow:'hidden'}}>
                      <div style={{
                        width:`${Math.max(r.total_rev/maxRev*100,2)}%`,
                        height:'100%',
                        background:r.is_unidentified?'#E5E7EB':SRC_COLORS[r.source]||'#9CA3AF',
                        borderRadius:4,
                        display:'flex',alignItems:'center',paddingLeft:8,
                        fontSize:10.5,fontWeight:600,color:r.is_unidentified?'#9CA3AF':'rgba(255,255,255,0.9)',
                        opacity:r.is_unidentified?0.7:1
                      }}>
                        {fmtR(r.total_rev)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Source Table */}
        <div className={styles.tableWrap}>
          <div className={styles.tableHead}>
            <h3 className={styles.tableTitle}>Source Performance Summary</h3>
            <p className={styles.tableSub}>{selMonth==='All'?'All Months 2025':selMonth}</p>
          </div>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead><tr>
                <th>Source</th><th>OPPs</th><th>Spend</th>
                <th>AC Rev</th><th>VAS Rev</th><th>Total Rev</th><th>ROAS</th>
              </tr></thead>
              <tbody>
                {srcBreakdown.map(r=>{
                  const roas=r.spend>0&&r.total_rev>0?(r.total_rev/r.spend).toFixed(2):null
                  return(
                    <tr key={r.source} className={r.is_unidentified?styles.unidRow:''}>
                      <td>
                        <div style={{display:'flex',alignItems:'center',gap:7}}>
                          <span style={{width:8,height:8,borderRadius:'50%',background:r.is_unidentified?'#E5E7EB':SRC_COLORS[r.source]||'#9CA3AF',border:r.is_unidentified?'1px dashed #9CA3AF':'none'}}/>
                          <span style={{fontWeight:600,color:r.is_unidentified?'#9CA3AF':'#111827',fontStyle:r.is_unidentified?'italic':'normal'}}>
                            {r.is_unidentified&&'⚠ '}{r.source}
                          </span>
                          {r.is_unidentified&&<span className={styles.unidTag}>Source not identified</span>}
                        </div>
                      </td>
                      <td>{fn(r.opps)}</td>
                      <td>{r.spend>0?fmtR(r.spend):'–'}</td>
                      <td>{r.ac_rev>0?fmtR(r.ac_rev):'–'}</td>
                      <td>{r.vas_rev>0?fmtR(r.vas_rev):'–'}</td>
                      <td><strong>{r.total_rev>0?fmtR(r.total_rev):'–'}</strong></td>
                      <td>{roas?<span style={{fontWeight:700,color:parseFloat(roas)>=1?'#10B981':'#9CA3AF'}}>{roas}x</span>:'–'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        </div>{/* end content */}
      </div>{/* end main */}
    </div>
  )
}
