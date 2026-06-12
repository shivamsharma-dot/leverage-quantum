import React, { useState, useMemo, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line, CartesianGrid, AreaChart, Area } from 'recharts'
import Sidebar from '../components/Sidebar'
import ExportButton from '../components/ExportButton'
import { DashboardSkeleton } from '../components/SkeletonLoader'
import styles from './RevenueDashboard.module.css'

const SRC_COLORS = {
  Facebook:'#1C9FD4', Google:'#10B981', Referral:'#F59E0B',
  'Content+Brand':'#29B9C3', Affiliate:'#F59E0B', Remarketing:'#29B9C3',
  Offline:'#1C9FD4', Bing:'#4CAE6F', Branding:'#1C9FD4', Unidentified:'#D1D5DB'
}

const MONTHLY  = [{"month":"Jan-2025","month_short":"Jan","Facebook_ac":0,"Facebook_vas":0,"Facebook_rev":0,"Facebook_proj":0,"Google_ac":0,"Google_vas":0,"Google_rev":0,"Google_proj":0,"Referral_ac":0,"Referral_vas":0,"Referral_rev":0,"Referral_proj":0,"Content+Brand_ac":0,"Content+Brand_vas":0,"Content+Brand_rev":0,"Content+Brand_proj":0,"Affiliate_ac":0,"Affiliate_vas":0,"Affiliate_rev":0,"Affiliate_proj":0,"Remarketing_ac":0,"Remarketing_vas":0,"Remarketing_rev":0,"Remarketing_proj":0,"Offline_ac":0,"Offline_vas":0,"Offline_rev":0,"Offline_proj":0,"Bing_ac":0,"Bing_vas":0,"Bing_rev":0,"Bing_proj":0,"Unidentified_ac":0,"Unidentified_vas":0,"Unidentified_rev":0,"Unidentified_proj":0,"Branding_ac":0,"Branding_vas":0,"Branding_rev":0,"Branding_proj":0,"total_ac":0,"total_vas":0,"total_rev":0,"total_proj":0,"unid_rev":0},{"month":"Feb-2025","month_short":"Feb","Facebook_ac":0,"Facebook_vas":0,"Facebook_rev":0,"Facebook_proj":0,"Google_ac":0,"Google_vas":0,"Google_rev":0,"Google_proj":0,"Referral_ac":0,"Referral_vas":0,"Referral_rev":0,"Referral_proj":0,"Content+Brand_ac":0,"Content+Brand_vas":0,"Content+Brand_rev":0,"Content+Brand_proj":0,"Affiliate_ac":0,"Affiliate_vas":0,"Affiliate_rev":0,"Affiliate_proj":0,"Remarketing_ac":0,"Remarketing_vas":0,"Remarketing_rev":0,"Remarketing_proj":0,"Offline_ac":0,"Offline_vas":0,"Offline_rev":0,"Offline_proj":0,"Bing_ac":0,"Bing_vas":0,"Bing_rev":0,"Bing_proj":0,"Unidentified_ac":0,"Unidentified_vas":0,"Unidentified_rev":0,"Unidentified_proj":0,"Branding_ac":0,"Branding_vas":0,"Branding_rev":0,"Branding_proj":0,"total_ac":0,"total_vas":0,"total_rev":0,"total_proj":0,"unid_rev":0},{"month":"Mar-2025","month_short":"Mar","Facebook_ac":0,"Facebook_vas":0,"Facebook_rev":0,"Facebook_proj":0,"Google_ac":0,"Google_vas":0,"Google_rev":0,"Google_proj":0,"Referral_ac":0,"Referral_vas":0,"Referral_rev":0,"Referral_proj":0,"Content+Brand_ac":0,"Content+Brand_vas":0,"Content+Brand_rev":0,"Content+Brand_proj":0,"Affiliate_ac":0,"Affiliate_vas":0,"Affiliate_rev":0,"Affiliate_proj":0,"Remarketing_ac":0,"Remarketing_vas":0,"Remarketing_rev":0,"Remarketing_proj":0,"Offline_ac":0,"Offline_vas":0,"Offline_rev":0,"Offline_proj":0,"Bing_ac":0,"Bing_vas":0,"Bing_rev":0,"Bing_proj":0,"Unidentified_ac":0,"Unidentified_vas":0,"Unidentified_rev":0,"Unidentified_proj":0,"Branding_ac":0,"Branding_vas":0,"Branding_rev":0,"Branding_proj":0,"total_ac":0,"total_vas":0,"total_rev":0,"total_proj":0,"unid_rev":0},{"month":"Apr-2025","month_short":"Apr","Facebook_ac":0,"Facebook_vas":0,"Facebook_rev":0,"Facebook_proj":0,"Google_ac":0,"Google_vas":0,"Google_rev":0,"Google_proj":0,"Referral_ac":0,"Referral_vas":0,"Referral_rev":0,"Referral_proj":0,"Content+Brand_ac":0,"Content+Brand_vas":0,"Content+Brand_rev":0,"Content+Brand_proj":0,"Affiliate_ac":0,"Affiliate_vas":0,"Affiliate_rev":0,"Affiliate_proj":0,"Remarketing_ac":0,"Remarketing_vas":0,"Remarketing_rev":0,"Remarketing_proj":0,"Offline_ac":0,"Offline_vas":0,"Offline_rev":0,"Offline_proj":0,"Bing_ac":0,"Bing_vas":0,"Bing_rev":0,"Bing_proj":0,"Unidentified_ac":0,"Unidentified_vas":0,"Unidentified_rev":0,"Unidentified_proj":0,"Branding_ac":0,"Branding_vas":0,"Branding_rev":0,"Branding_proj":0,"total_ac":0,"total_vas":0,"total_rev":0,"total_proj":0,"unid_rev":0},{"month":"May-2025","month_short":"May","Facebook_ac":0,"Facebook_vas":0,"Facebook_rev":0,"Facebook_proj":0,"Google_ac":0,"Google_vas":0,"Google_rev":0,"Google_proj":0,"Referral_ac":0,"Referral_vas":0,"Referral_rev":0,"Referral_proj":0,"Content+Brand_ac":0,"Content+Brand_vas":0,"Content+Brand_rev":0,"Content+Brand_proj":0,"Affiliate_ac":0,"Affiliate_vas":0,"Affiliate_rev":0,"Affiliate_proj":0,"Remarketing_ac":0,"Remarketing_vas":0,"Remarketing_rev":0,"Remarketing_proj":0,"Offline_ac":0,"Offline_vas":0,"Offline_rev":0,"Offline_proj":0,"Bing_ac":0,"Bing_vas":0,"Bing_rev":0,"Bing_proj":0,"Unidentified_ac":0,"Unidentified_vas":0,"Unidentified_rev":0,"Unidentified_proj":0,"Branding_ac":0,"Branding_vas":0,"Branding_rev":0,"Branding_proj":0,"total_ac":0,"total_vas":0,"total_rev":0,"total_proj":0,"unid_rev":0},{"month":"Jun-2025","month_short":"Jun","Facebook_ac":0,"Facebook_vas":0,"Facebook_rev":0,"Facebook_proj":0,"Google_ac":0,"Google_vas":0,"Google_rev":0,"Google_proj":0,"Referral_ac":0,"Referral_vas":0,"Referral_rev":0,"Referral_proj":0,"Content+Brand_ac":0,"Content+Brand_vas":0,"Content+Brand_rev":0,"Content+Brand_proj":0,"Affiliate_ac":0,"Affiliate_vas":0,"Affiliate_rev":0,"Affiliate_proj":0,"Remarketing_ac":0,"Remarketing_vas":0,"Remarketing_rev":0,"Remarketing_proj":0,"Offline_ac":0,"Offline_vas":0,"Offline_rev":0,"Offline_proj":0,"Bing_ac":0,"Bing_vas":0,"Bing_rev":0,"Bing_proj":0,"Unidentified_ac":0,"Unidentified_vas":0,"Unidentified_rev":0,"Unidentified_proj":0,"Branding_ac":0,"Branding_vas":0,"Branding_rev":0,"Branding_proj":0,"total_ac":0,"total_vas":0,"total_rev":0,"total_proj":0,"unid_rev":0},{"month":"Jul-2025","month_short":"Jul","Facebook_ac":0,"Facebook_vas":0,"Facebook_rev":0,"Facebook_proj":0,"Google_ac":0,"Google_vas":0,"Google_rev":0,"Google_proj":0,"Referral_ac":0,"Referral_vas":0,"Referral_rev":0,"Referral_proj":0,"Content+Brand_ac":0,"Content+Brand_vas":0,"Content+Brand_rev":0,"Content+Brand_proj":0,"Affiliate_ac":0,"Affiliate_vas":0,"Affiliate_rev":0,"Affiliate_proj":0,"Remarketing_ac":0,"Remarketing_vas":0,"Remarketing_rev":0,"Remarketing_proj":0,"Offline_ac":0,"Offline_vas":0,"Offline_rev":0,"Offline_proj":0,"Bing_ac":0,"Bing_vas":0,"Bing_rev":0,"Bing_proj":0,"Unidentified_ac":0,"Unidentified_vas":0,"Unidentified_rev":0,"Unidentified_proj":0,"Branding_ac":0,"Branding_vas":0,"Branding_rev":0,"Branding_proj":0,"total_ac":0,"total_vas":0,"total_rev":0,"total_proj":0,"unid_rev":0},{"month":"Aug-2025","month_short":"Aug","Facebook_ac":4805588,"Facebook_vas":9493488,"Facebook_rev":14299076,"Facebook_proj":0,"Google_ac":7430200,"Google_vas":18474684,"Google_rev":25904884,"Google_proj":0,"Referral_ac":7573390,"Referral_vas":13260793,"Referral_rev":20834183,"Referral_proj":0,"Content+Brand_ac":6180150,"Content+Brand_vas":9624605,"Content+Brand_rev":15804755,"Content+Brand_proj":0,"Affiliate_ac":1119980,"Affiliate_vas":3005322,"Affiliate_rev":4125302,"Affiliate_proj":0,"Remarketing_ac":585000,"Remarketing_vas":53000,"Remarketing_rev":638000,"Remarketing_proj":0,"Offline_ac":1264000,"Offline_vas":400000,"Offline_rev":1664000,"Offline_proj":0,"Bing_ac":62500,"Bing_vas":327000,"Bing_rev":389500,"Bing_proj":0,"Unidentified_ac":2063500,"Unidentified_vas":4246690,"Unidentified_rev":6310190,"Unidentified_proj":0,"Branding_ac":0,"Branding_vas":15000,"Branding_rev":15000,"Branding_proj":0,"total_ac":31084308,"total_vas":58900582,"total_rev":89984890,"total_proj":0,"unid_rev":6310190},{"month":"Sep-2025","month_short":"Sep","Facebook_ac":5323515,"Facebook_vas":6906590,"Facebook_rev":12230105,"Facebook_proj":0,"Google_ac":5426751,"Google_vas":15057403,"Google_rev":20484154,"Google_proj":0,"Referral_ac":5095281,"Referral_vas":10487647,"Referral_rev":15582928,"Referral_proj":0,"Content+Brand_ac":5043058,"Content+Brand_vas":9037619,"Content+Brand_rev":14080677,"Content+Brand_proj":0,"Affiliate_ac":1665000,"Affiliate_vas":3643003,"Affiliate_rev":5308003,"Affiliate_proj":0,"Remarketing_ac":343000,"Remarketing_vas":0,"Remarketing_rev":343000,"Remarketing_proj":0,"Offline_ac":1264000,"Offline_vas":0,"Offline_rev":1264000,"Offline_proj":0,"Bing_ac":72500,"Bing_vas":584250,"Bing_rev":656750,"Bing_proj":0,"Unidentified_ac":3094222,"Unidentified_vas":3664984,"Unidentified_rev":6759206,"Unidentified_proj":0,"Branding_ac":0,"Branding_vas":0,"Branding_rev":0,"Branding_proj":0,"total_ac":27327327,"total_vas":49381496,"total_rev":76708823,"total_proj":0,"unid_rev":6759206},{"month":"Oct-2025","month_short":"Oct","Facebook_ac":4381917,"Facebook_vas":6868714,"Facebook_rev":11250631,"Facebook_proj":0,"Google_ac":5336256,"Google_vas":6838325,"Google_rev":12174581,"Google_proj":0,"Referral_ac":5098712,"Referral_vas":5560722,"Referral_rev":10659434,"Referral_proj":0,"Content+Brand_ac":6670105,"Content+Brand_vas":5627451,"Content+Brand_rev":12297556,"Content+Brand_proj":0,"Affiliate_ac":988000,"Affiliate_vas":1629816,"Affiliate_rev":2617816,"Affiliate_proj":0,"Remarketing_ac":365000,"Remarketing_vas":0,"Remarketing_rev":365000,"Remarketing_proj":0,"Offline_ac":2106000,"Offline_vas":0,"Offline_rev":2106000,"Offline_proj":0,"Bing_ac":0,"Bing_vas":215000,"Bing_rev":215000,"Bing_proj":0,"Unidentified_ac":3502997,"Unidentified_vas":964811,"Unidentified_rev":4467808,"Unidentified_proj":0,"Branding_ac":225000,"Branding_vas":0,"Branding_rev":225000,"Branding_proj":0,"total_ac":28673987,"total_vas":27704839,"total_rev":56378826,"total_proj":0,"unid_rev":4467808},{"month":"Nov-2025","month_short":"Nov","Facebook_ac":6723016,"Facebook_vas":10727447,"Facebook_rev":17450463,"Facebook_proj":19774436,"Google_ac":9907476,"Google_vas":13482553,"Google_rev":23390029,"Google_proj":32610131,"Referral_ac":5240010,"Referral_vas":16115664,"Referral_rev":21355674,"Referral_proj":23689305,"Content+Brand_ac":6276240,"Content+Brand_vas":8475490,"Content+Brand_rev":14751730,"Content+Brand_proj":21019944,"Affiliate_ac":1640000,"Affiliate_vas":2090841,"Affiliate_rev":3730841,"Affiliate_proj":4055841,"Remarketing_ac":400000,"Remarketing_vas":1510325,"Remarketing_rev":1910325,"Remarketing_proj":1853125,"Offline_ac":2376828,"Offline_vas":815500,"Offline_rev":3192328,"Offline_proj":4440000,"Bing_ac":0,"Bing_vas":203145,"Bing_rev":203145,"Bing_proj":1343358,"Unidentified_ac":703704,"Unidentified_vas":1380000,"Unidentified_rev":2083704,"Unidentified_proj":2563704,"Branding_ac":540000,"Branding_vas":0,"Branding_rev":540000,"Branding_proj":540000,"total_ac":33807274,"total_vas":54800965,"total_rev":88608239,"total_proj":111889844,"unid_rev":2083704},{"month":"Dec-2025","month_short":"Dec","Facebook_ac":7666088,"Facebook_vas":14601871,"Facebook_rev":22267959,"Facebook_proj":25677056,"Google_ac":7596823,"Google_vas":26505403,"Google_rev":34102226,"Google_proj":41026267,"Referral_ac":5845628,"Referral_vas":33882440,"Referral_rev":39728068,"Referral_proj":45758645,"Content+Brand_ac":6582826,"Content+Brand_vas":14467906,"Content+Brand_rev":21050732,"Content+Brand_proj":30226368,"Affiliate_ac":877000,"Affiliate_vas":1908115,"Affiliate_rev":2785115,"Affiliate_proj":3210494,"Remarketing_ac":562500,"Remarketing_vas":2055604,"Remarketing_rev":2618104,"Remarketing_proj":3315604,"Offline_ac":870000,"Offline_vas":3696692,"Offline_rev":4566692,"Offline_proj":5087105,"Bing_ac":0,"Bing_vas":1793500,"Bing_rev":1793500,"Bing_proj":3125000,"Unidentified_ac":3478286,"Unidentified_vas":1820020,"Unidentified_rev":5298306,"Unidentified_proj":8752254,"Branding_ac":0,"Branding_vas":0,"Branding_rev":0,"Branding_proj":0,"total_ac":33479151,"total_vas":100731551,"total_rev":134210702,"total_proj":166178793,"unid_rev":5298306}]
const SRC_SUM  = [{"source":"Google","is_unidentified":false,"ac_rev":35697506,"vas_rev":80358368,"total_rev":116055874,"proj_rev":73636398,"opps":328681,"spend":152195111.59},{"source":"Referral","is_unidentified":false,"ac_rev":28853021,"vas_rev":79307266,"total_rev":108160287,"proj_rev":69447950,"opps":0,"spend":0},{"source":"Content+Brand","is_unidentified":false,"ac_rev":30752379,"vas_rev":47233071,"total_rev":78538825,"proj_rev":50692937,"opps":0,"spend":0},{"source":"Facebook","is_unidentified":false,"ac_rev":28900124,"vas_rev":48598110,"total_rev":77498234,"proj_rev":45451492,"opps":324210,"spend":142311660.49},{"source":"Unidentified","is_unidentified":true,"ac_rev":12842709,"vas_rev":12076505,"total_rev":24919214,"proj_rev":11315958,"opps":11924,"spend":0},{"source":"Affiliate","is_unidentified":false,"ac_rev":6289980,"vas_rev":12277097,"total_rev":18567077,"proj_rev":7266335,"opps":666904,"spend":0},{"source":"Offline","is_unidentified":false,"ac_rev":7880828,"vas_rev":4912192,"total_rev":12793020,"proj_rev":9527105,"opps":0,"spend":0},{"source":"Remarketing","is_unidentified":false,"ac_rev":2255500,"vas_rev":3618929,"total_rev":5874429,"proj_rev":5168729,"opps":953,"spend":0},{"source":"Bing","is_unidentified":false,"ac_rev":135000,"vas_rev":3122895,"total_rev":3257895,"proj_rev":4468358,"opps":4827,"spend":0},{"source":"Branding","is_unidentified":false,"ac_rev":765000,"vas_rev":15000,"total_rev":780000,"proj_rev":540000,"opps":0,"spend":0}]
const MONTHS   = ["Jan-2025","Feb-2025","Mar-2025","Apr-2025","May-2025","Jun-2025","Jul-2025","Aug-2025","Sep-2025","Oct-2025","Nov-2025","Dec-2025"]
const K_SRCS   = ["Facebook","Google","Referral","Content+Brand","Affiliate","Remarketing","Offline","Bing","Unidentified","Branding"]

function fmtR(n){
  if(!n||isNaN(n))return'₹0'
  if(n>=1e7)return'₹'+(n/1e7).toFixed(2)+' Cr'
  if(n>=1e5)return'₹'+(n/1e5).toFixed(2)+'L'
  return'₹'+Math.round(n).toLocaleString('en-IN')
}
function fn(n){return(n&&n>0)?n.toLocaleString('en-IN'):'–'}
function pct(a,b){return b>0?((a/b)*100).toFixed(1)+'%':'–'}

const CustomTooltip=({active,payload,label})=>{
  if(!active||!payload?.length)return null
  return(
    <div style={{background:'#fff',border:'1px solid #E5E7EB',borderRadius:10,padding:'10px 14px',boxShadow:'0 4px 16px rgba(0,0,0,0.08)',maxWidth:200}}>
      <p style={{fontSize:11,fontWeight:700,color:'#111827',marginBottom:6}}>{label}</p>
      {payload.filter(p=>p.value>0).map((p,i)=>(
        <p key={i} style={{fontSize:11,color:p.color||'#374151',margin:'2px 0'}}>
          {p.name}: <strong>{fmtR(p.value)}</strong>
        </p>
      ))}
    </div>
  )
}

export default function RevenueDashboard(){
  const [pageLoading, setPageLoading] = React.useState(true)
  React.useEffect(() => { const t = setTimeout(() => setPageLoading(false), 600); return () => clearTimeout(t) }, [])
  const [selMonth, setSelMonth] = useState('All')
  const [selType,  setSelType]  = useState('All') // AC, VAS, All

  const filtered = useMemo(()=>
    selMonth==='All' ? MONTHLY : MONTHLY.filter(r=>r.month===selMonth)
  ,[selMonth])

  const totals = useMemo(()=>{
    const t={total_ac:0,total_vas:0,total_rev:0,total_proj:0,unid_rev:0}
    filtered.forEach(r=>{Object.keys(t).forEach(k=>{t[k]+=(r[k]||0)})})
    t.collection_pct = t.total_proj>0?(t.total_rev/t.total_proj*100).toFixed(1):0
    t.unid_pct = t.total_rev>0?(t.unid_rev/t.total_rev*100).toFixed(1):0
    return t
  },[filtered])

  // Monthly AC vs VAS bars
  const acVasMonthly = useMemo(()=>
    MONTHLY.filter(r=>r.total_rev>0).map(r=>({
      month:r.month_short,
      AC: selType==='VAS'?0:r.total_ac,
      VAS:selType==='AC'?0:r.total_vas,
      Projected:r.total_proj,
    })),[selType])

  // Collected vs Projected
  const collectionMonthly = useMemo(()=>
    MONTHLY.filter(r=>r.total_rev>0||r.total_proj>0).map(r=>({
      month:r.month_short,
      Collected:r.total_rev,
      Projected:r.total_proj,
    })),[])

  // Source revenue pie
  const srcPie = useMemo(()=>{
    const map={}
    filtered.forEach(r=>{
      K_SRCS.forEach(s=>{
        const v=selType==='AC'?r[s+'_ac']:selType==='VAS'?r[s+'_vas']:r[s+'_rev']
        if(!map[s])map[s]=0
        map[s]+=(v||0)
      })
    })
    return Object.entries(map).filter(([,v])=>v>0).map(([name,value])=>({name,value,unid:name==='Unidentified'})).sort((a,b)=>b.value-a.value)
  },[filtered,selType])

  // Monthly unidentified tracking
  const unidMonthly = useMemo(()=>
    MONTHLY.filter(r=>r.total_rev>0).map(r=>({
      month:r.month_short,
      Identified:r.total_rev-r.unid_rev,
      Unidentified:r.unid_rev,
    })),[])

  return(
    <div className={styles.layout}>
      <Sidebar/>
      <div className={styles.main}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <p className={styles.breadcrumb}>Dashboards / Revenue</p>
            <h1 className={styles.pageTitle}>Revenue Dashboard 2025</h1>
          </div>
          <div className={styles.headerRight}>
            <select className={styles.fsel} value={selMonth} onChange={e=>setSelMonth(e.target.value)}>
              <option value="All">All Months</option>
              {MONTHS.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
            <select className={styles.fsel} value={selType} onChange={e=>setSelType(e.target.value)}>
              <option value="All">AC + VAS</option>
              <option value="AC">AC Only</option>
              <option value="VAS">VAS Only</option>
            </select>
            <ExportButton data={srcPie} filename="revenue_by_source"/>
            <div className={styles.liveBadge}><span className={styles.liveDot}/>CIB Data</div>
          </div>
        </div>

        <div className={styles.content}>
        {/* Unidentified warning */}
        {totals.unid_rev>0&&(
          <div className={styles.unidWarning}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <div>
              <strong>⚠ Unidentified Source Revenue: {fmtR(totals.unid_rev)}</strong>
              <span> — {totals.unid_pct}% of total revenue ({selMonth==='All'?'Aug–Dec 2025':selMonth}) comes from leads where the original source has not been identified. This is tracked separately below.</span>
            </div>
          </div>
        )}

        {/* KPIs */}
        <div className={styles.kpiRow}>
          {[
            {l:'AC Revenue',     v:fmtR(totals.total_ac),   s:'Admission Counselling',       c:'#10B981'},
            {l:'VAS Revenue',    v:fmtR(totals.total_vas),  s:'Value Added Services',         c:'#1C9FD4'},
            {l:'Total Revenue',  v:fmtR(totals.total_rev),  s:'AC + VAS Collected',           c:'#F59E0B'},
            {l:'Projected',      v:fmtR(totals.total_proj), s:'Total Package Value',          c:'#1C9FD4'},
            {l:'Collection %',   v:totals.collection_pct+'%',s:'Collected / Projected',       c:parseFloat(totals.collection_pct)>=50?'#10B981':'#F59E0B'},
            {l:'Unidentified',   v:fmtR(totals.unid_rev),   s:`${totals.unid_pct}% of total · source unknown`, c:'#9CA3AF', warn:true},
          ].map(k=>(
            <div key={k.l} className={`${styles.kpi} ${k.warn?styles.kpiWarn:''}`}>
              <div className={styles.kpiVal} style={{color:k.warn?'#9CA3AF':'#111827'}}>{k.v}</div>
              <div className={styles.kpiLbl}>{k.l}{k.warn&&' ⚠'}</div>
              <div className={styles.kpiSub}>{k.s}</div>
              <div className={styles.kpiAccent} style={{background:k.c}}/>
            </div>
          ))}
        </div>

        {/* Charts row 1 */}
        <div className={styles.grid2}>
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <span className={styles.cardTitle}>AC vs VAS Revenue — Monthly</span>
              <span className={styles.cardSub}>Collected · Aug–Dec</span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={acVasMonthly} margin={{top:4,right:8,left:0,bottom:0}} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false}/>
                <XAxis dataKey="month" tick={{fontSize:10,fill:'#9CA3AF'}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fontSize:10,fill:'#9CA3AF'}} axisLine={false} tickLine={false} tickFormatter={v=>fmtR(v)} width={70}/>
                <Tooltip content={<CustomTooltip/>}/>
                <Legend wrapperStyle={{fontSize:11}}/>
                <Bar dataKey="AC"  name="AC Revenue"  fill="#10B981" radius={[4,4,0,0]}/>
                <Bar dataKey="VAS" name="VAS Revenue" fill="#1C9FD4" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className={styles.card}>
            <div className={styles.cardHead}>
              <span className={styles.cardTitle}>Collected vs Projected</span>
              <span className={styles.cardSub}>Revenue realisation</span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={collectionMonthly} margin={{top:4,right:8,left:0,bottom:0}} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false}/>
                <XAxis dataKey="month" tick={{fontSize:10,fill:'#9CA3AF'}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fontSize:10,fill:'#9CA3AF'}} axisLine={false} tickLine={false} tickFormatter={v=>fmtR(v)} width={75}/>
                <Tooltip content={<CustomTooltip/>}/>
                <Legend wrapperStyle={{fontSize:11}}/>
                <Bar dataKey="Collected"  fill="#F59E0B" radius={[4,4,0,0]}/>
                <Bar dataKey="Projected"  fill="#E5E7EB" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Charts row 2 */}
        <div className={styles.grid2}>
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <span className={styles.cardTitle}>Revenue by Source</span>
              <span className={styles.cardSub}>{selType==='All'?'AC + VAS':selType} · {selMonth==='All'?'Full Year':selMonth}</span>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <ResponsiveContainer width={170} height={190}>
                <PieChart>
                  <Pie data={srcPie} cx="50%" cy="50%" innerRadius={48} outerRadius={75} paddingAngle={3} dataKey="value" strokeWidth={0}>
                    {srcPie.map((e,i)=><Cell key={i} fill={e.unid?'#E5E7EB':SRC_COLORS[e.name]||'#9CA3AF'}/>)}
                  </Pie>
                  <Tooltip formatter={v=>[fmtR(v),'Revenue']}/>
                </PieChart>
              </ResponsiveContainer>
              <div style={{flex:1,display:'flex',flexDirection:'column',gap:7}}>
                {srcPie.slice(0,7).map(e=>(
                  <div key={e.name} style={{display:'flex',alignItems:'center',gap:6}}>
                    <span style={{width:8,height:8,borderRadius:'50%',background:e.unid?'#E5E7EB':SRC_COLORS[e.name]||'#9CA3AF',border:e.unid?'1px dashed #9CA3AF':'none',flexShrink:0}}/>
                    <span style={{fontSize:10.5,color:e.unid?'#9CA3AF':'#374151',flex:1,fontStyle:e.unid?'italic':'normal'}}>{e.unid?'⚠ Unid.':e.name}</span>
                    <span style={{fontSize:10.5,fontWeight:700,color:e.unid?'#9CA3AF':'#111827'}}>{fmtR(e.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardHead}>
              <span className={styles.cardTitle}>Identified vs Unidentified Revenue</span>
              <span className={styles.cardSub}>Source attribution tracking</span>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={unidMonthly} margin={{top:4,right:8,left:0,bottom:0}} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false}/>
                <XAxis dataKey="month" tick={{fontSize:10,fill:'#9CA3AF'}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fontSize:10,fill:'#9CA3AF'}} axisLine={false} tickLine={false} tickFormatter={v=>fmtR(v)} width={70}/>
                <Tooltip content={<CustomTooltip/>}/>
                <Legend wrapperStyle={{fontSize:11}}/>
                <Bar dataKey="Identified"   fill="#10B981" radius={[4,4,0,0]} stackId="u"/>
                <Bar dataKey="Unidentified" fill="#E5E7EB" radius={[4,4,0,0]} stackId="u"/>
              </BarChart>
            </ResponsiveContainer>
            <p style={{fontSize:10.5,color:'#9CA3AF',marginTop:8,textAlign:'center'}}>
              ⚠ Grey = revenue where source attribution is missing in CIB data
            </p>
          </div>
        </div>

        {/* Revenue Table */}
        <div className={styles.tableWrap}>
          <div className={styles.tableHead}>
            <h3 className={styles.tableTitle}>Source-wise Revenue Breakdown</h3>
            <p className={styles.tableSub}>{selMonth==='All'?'Aug–Dec 2025 (CIB data period)':selMonth}</p>
          </div>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead><tr>
                <th>Source</th><th>AC Revenue</th><th>VAS Revenue</th>
                <th>Total Collected</th><th>Projected</th><th>Collection %</th>
              </tr></thead>
              <tbody>
                {srcPie.map(r=>{
                  const full = SRC_SUM.find(s=>s.source===r.name)||{}
                  const ac   = full.ac_rev||0
                  const vas  = full.vas_rev||0
                  const proj = full.proj_rev||0
                  const cp   = proj>0?(r.value/proj*100).toFixed(0):0
                  const isUnid = r.unid
                  return(
                    <tr key={r.name} className={isUnid?styles.unidRow:''}>
                      <td>
                        <div style={{display:'flex',alignItems:'center',gap:7}}>
                          <span style={{width:8,height:8,borderRadius:'50%',background:isUnid?'#E5E7EB':SRC_COLORS[r.name]||'#9CA3AF',border:isUnid?'1px dashed #9CA3AF':'none'}}/>
                          <span style={{fontWeight:600,color:isUnid?'#9CA3AF':'#111827',fontStyle:isUnid?'italic':'normal'}}>
                            {isUnid&&'⚠ '}{r.name}
                          </span>
                          {isUnid&&<span className={styles.unidTag}>Source not identified</span>}
                        </div>
                      </td>
                      <td>{ac>0?fmtR(ac):'–'}</td>
                      <td>{vas>0?fmtR(vas):'–'}</td>
                      <td><strong style={{color:isUnid?'#9CA3AF':'#111827'}}>{fmtR(r.value)}</strong></td>
                      <td>{proj>0?fmtR(proj):'–'}</td>
                      <td>
                        {cp>0?(
                          <div style={{display:'flex',alignItems:'center',gap:6}}>
                            <div style={{flex:1,background:'#F3F4F6',borderRadius:3,height:6,overflow:'hidden'}}>
                              <div style={{width:`${Math.min(cp,100)}%`,height:'100%',background:parseFloat(cp)>=50?'#10B981':'#F59E0B',borderRadius:3}}/>
                            </div>
                            <span style={{fontSize:11,fontWeight:600,color:'#374151',width:36}}>{cp}%</span>
                          </div>
                        ):'–'}
                      </td>
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
