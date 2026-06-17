import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import Sidebar from '../components/Sidebar'
import styles from './DashboardHome.module.css'
import { fetchCSV } from '../lib/sheetCache'
import { getSession, setSession } from '../lib/sessionLoad'

const FONT = "'Plus Jakarta Sans',-apple-system,sans-serif"
const C = { navy:'#1F3C84', blue:'#1C9FD4', green:'#4CAE6F', cyan:'#29B9C3', amber:'#F59E0B', border:'#E5E7EB', text:'#0F172A', muted:'#94A3B8', bg:'#F4F6F9' }

const SUPABASE_URL = 'https://tsyekthwthxszmsgqfej.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzeWVrdGh3dGh4c3ptc2dxZmVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NjkzMDIsImV4cCI6MjA5NTM0NTMwMn0.bdM9h5c3PDu9hgggjBdbA-eb7kfF-79c6txOnCUxRhY'
const AD_ACCOUNT  = 'act_641914389215638'
const QLOPS_SHEET = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRVF7R3Me4QPVaRS_n_OufcMrrgYvCt3Rs7yJUG0u4gEMd0cVL9IyP2aV6J8HDjOZrvWzcemgHwZaHs/pub?gid=0&single=true&output=csv'

function fmtN(n){ if(!n&&n!==0)return '—'; if(n>=1e7)return(n/1e7).toFixed(1)+'Cr'; if(n>=1e5)return(n/1e5).toFixed(1)+'L'; if(n>=1e3)return Math.round(n/1e3)+'K'; return Math.round(n).toLocaleString('en-IN') }
function fmtC(n){ if(!n&&n!==0)return '—'; if(n>=1e7)return'₹'+(n/1e7).toFixed(2)+' Cr'; if(n>=1e5)return'₹'+(n/1e5).toFixed(1)+'L'; if(n>=1e3)return'₹'+Math.round(n/1e3)+'K'; return'₹'+Math.round(n) }

// Countup hook — only animates when real data arrives, shows — until then
function useCountUp(target, duration=900) {
  const [val, setVal] = useState(null)
  useEffect(()=>{
    if(target === null || target === undefined || target === 0) return
    let start=null
    const step = ts => {
      if(!start) start=ts
      const progress=Math.min((ts-start)/duration,1)
      const ease=1-Math.pow(1-progress,3)
      setVal(Math.round(target*ease))
      if(progress<1) requestAnimationFrame(step)
      else setVal(target)
    }
    requestAnimationFrame(step)
  },[target,duration])
  return val
}

const DASHBOARDS = [
  { id:'meta_ads',      to:'/dashboard/meta-ads',     label:'Meta Ads',     desc:'Campaign performance, creatives, CTR, CPL, fatigue signals.', tags:['Creatives','Campaigns','Spend','ROAS'], live:true,   color:C.blue,   icon:'meta'   },
  { id:'google_ads',    to:'/dashboard/google-ads',   label:'Google Ads',   desc:'Search and Performance Max: spend, clicks, conversions, keywords.', tags:['Campaigns','Keywords','Clicks','Conv.'], live:true,   color:C.green,  icon:'google' },
  { id:'roas',          to:'/dashboard/roas',         label:'ROAS',         desc:'Campaign-level spend, leads, STUs, revenue and return on ad spend.', tags:['Facebook','Google','LinkedIn','Bing'],   live:false,  color:C.navy,   icon:'roas'   },
  { id:'mtd',           to:'/dashboard/mtd',          label:'MTD',          desc:'Month-to-date CPL and CPQL with AI-generated insights.', tags:['CPL','CPQL','QLs','Spend'],                           live:true,   color:C.cyan,   icon:'calendar'},
  { id:'lead_quality',  to:'/dashboard/lead-quality', label:'Lead Quality', desc:'L→QL→STU funnel conversion rates by source, campaign, geography.', tags:['OPPs','QLs','STUs','L→Q%'],               live:false,  color:C.green,  icon:'funnel' },
  { id:'channel_mix',   to:'/dashboard/channel-mix',  label:'Channel Mix',  desc:'Spend allocation and performance across paid, organic and affiliate.', tags:['Paid','Organic','Affiliate','Referral'], live:false,  color:C.navy,   icon:'mix'    },
  { id:'revenue',       to:'/dashboard/revenue',      label:'Revenue',      desc:'AC and VAS revenue tracking with projected vs actual comparison.', tags:['AC','VAS','Projected','Actual'],           live:false,  color:C.amber,  icon:'revenue'},
  { id:'lq_ops',        to:'/dashboard/lq-ops',       label:'QL Ops',       desc:'Futwork and Superbot qualification performance by source and campaign.', tags:['Futwork','Superbot','QL%','By source'], live:true,   color:C.green,  icon:'qlops'  },
  { id:'whatsapp',      to:'/dashboard/whatsapp',     label:'WhatsApp',     desc:'Message delivery, read rates, engagement and spend breakdown.', tags:['Delivered','Read','CTR','Spend'],            live:true,   color:C.green,  icon:'wa'     },
]

function DashIcon({ id, color }) {
  const icons = {
    meta:     <><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></>,
    google:   <><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></>,
    roas:     <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
    funnel:   <><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></>,
    mix:      <><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></>,
    revenue:  <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></>,
    qlops:    <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></>,
    wa:       <><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></>,
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {icons[id]||icons.meta}
    </svg>
  )
}

// Skeleton shimmer component
function Skeleton({ w='100%', h=20, r=6 }) {
  return <div style={{ width:w, height:h, borderRadius:r, background:'linear-gradient(90deg,#F0F2F5 25%,#E8EBF0 50%,#F0F2F5 75%)', backgroundSize:'200% 100%', animation:'shimmer 1.4s infinite' }}/>
}

// Live stat card
function StatCard({ label, value, sub, accent, loading, icon }) {
  const numVal = parseFloat((value||'').toString().replace(/[^0-9.]/g,''))||0
  const display = useCountUp(loading ? null : numVal, 900)
  const formatted = loading ? null : display === null ? '—' : (value||'—').toString().replace(/[\d.]+/, display.toString())

  return (
    <div style={{ background:'#fff', border:'0.5px solid #E2E8F0', borderRadius:12, padding:'16px 20px 14px', boxShadow:'0 1px 4px rgba(15,23,42,0.04)', fontFamily:FONT }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
        <div style={{ fontSize:10, fontWeight:700, color:C.muted, letterSpacing:'0.08em', textTransform:'uppercase' }}>{label}</div>
        <div style={{ width:20, height:20, display:'flex', alignItems:'center', justifyContent:'center', color:'#CBD5E1', opacity:0.7 }}>{icon}</div>
      </div>
      {loading ? <Skeleton h={28} r={6}/> : <div style={{ fontSize:26, fontWeight:800, color:C.text, letterSpacing:'-1px', lineHeight:1, marginBottom:6 }}>{formatted}</div>}
      {loading ? <div style={{ marginTop:6 }}><Skeleton w="60%" h={14} r={4}/></div> : sub && <div style={{ fontSize:11.5, color:C.muted, marginTop:0 }}>{sub}</div>}
    </div>
  )
}

export default function DashboardHome() {
  const navigate   = useNavigate()
  const { user }   = useAuth()
  const [search, setSearch]     = useState('')
  const [liveStats, setLiveStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(true)

  const firstName = (user?.name||'there').split(' ')[0]
  const greeting  = (() => { const h=new Date().getHours(); return h<12?'Good morning':h<17?'Good afternoon':h<21?'Good evening':'Good evening' })()

  // Fetch live stats: Meta spend + QL today
  const fetchStats = useCallback(async (bust = false) => {
    setStatsLoading(true)
    const cachedHome = getSession('home')
    if (!bust && cachedHome) { setLiveStats(cachedHome.data); setStatsLoading(false); return }
    try {
      const [sbRes, qlRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/meta_tokens?select=token&order=created_at.desc&limit=1`, {
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
        }),
        fetch(QLOPS_SHEET).catch(()=>null)
      ])

      let metaStats = null
      if (sbRes.ok) {
        const tkData = await sbRes.json()
        const token = tkData?.[0]?.token
        if (token) {
          const metaRes = await fetch(`https://graph.facebook.com/v19.0/${AD_ACCOUNT}/insights?fields=spend,impressions,clicks,ctr,actions&date_preset=last_30d&level=account&access_token=${token}`)
          if (metaRes.ok) {
            const md = await metaRes.json()
            const acc = md.data?.[0]||{}
            const findAct = (t) => parseInt(acc.actions?.find(a=>a.action_type===t)?.value||0)
        const leads = findAct('onsite_conversion.lead_grouped') || findAct('onsite_web_lead') || findAct('offsite_complete_registration_add_meta_leads') || findAct('lead') || 0
            metaStats = { spend: parseFloat(acc.spend||0), leads, ctr: parseFloat(acc.ctr||0) }
          }
        }
      }

      let qlStats = null
      if (qlRes?.ok) {
        const csv = await qlRes.text()
        const lines = csv.trim().split('\n')
        const hdr = lines[0].split(',').map(s=>s.trim().toLowerCase())
        const h = k => hdr.indexOf(k)
        const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        const now = new Date(); const curMonth = MONTHS[now.getMonth()]+' '+now.getFullYear()
        let total=0, futwork=0, superbot=0
        lines.slice(1).forEach(l => {
          const r=l.split(',')
          if(r[h('qualified_month')]?.includes(curMonth.split(' ')[0])) {
            const c=parseInt(r[h('qualified_count')])||0
            total+=c
            if((r[h('provider')]||'').toLowerCase().includes('fut')) futwork+=c
            else superbot+=c
          }
        })
        qlStats = { total, futwork, superbot }
      }

      const _stats = { meta: metaStats, ql: qlStats, ts: new Date() }
    setSession('home', _stats)
    setLiveStats(_stats)
    } catch(e) { console.error('stats fetch:', e) }
    setStatsLoading(false)
  }, [])

  useEffect(() => { fetchStats() }, [fetchStats])

  const filtered = DASHBOARDS.filter(d => !search || d.label.toLowerCase().includes(search.toLowerCase()) || d.desc.toLowerCase().includes(search.toLowerCase()))

  const cpl = liveStats?.meta?.spend && liveStats?.meta?.leads ? liveStats.meta.spend / liveStats.meta.leads : 0

  return (
    <div className="lq-page-shell" style={{ display:'flex', height:'100vh', overflow:'hidden', background:C.bg, fontFamily:FONT }}>
      <style>{`
        
        @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        .dhcard:hover{transform:translateY(-2px)!important;box-shadow:0 8px 24px rgba(15,23,42,0.10)!important;border-color:#D1D9E8!important}
        .dhcard{transition:all .2s cubic-bezier(0.4,0,0.2,1)!important}
        .dhtag{transition:all .15s}
        .dhtag:hover{background:#E8EFF9!important;color:#1F3C84!important}
      `}</style>
      <Sidebar/>
      <main style={{ flex:1, overflowY:'auto', padding:'28px 28px' }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:28, animation:'fadeUp .4s ease' }}>
          <div>
            <p style={{ fontSize:11, color:C.muted, fontWeight:600, letterSpacing:'0.06em', textTransform:'uppercase', margin:'0 0 4px', fontFamily:FONT }}>HOME</p>
            <h1 style={{ fontSize:28, fontWeight:800, color:C.text, margin:0, letterSpacing:'-0.03em', fontFamily:FONT }}>{greeting}, {firstName} 👋</h1>
            <p style={{ fontSize:13.5, color:C.muted, margin:'4px 0 0', fontFamily:FONT }}>
              {liveStats?.ts ? `Last updated ${liveStats.ts.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}` : 'Loading live data…'}
            </p>
          </div>
          <div style={{ display:'flex', gap:10 }}>
          <button onClick={() => fetchStats(true)} disabled={statsLoading} title="Refresh data"
            style={{ paddingLeft:16, paddingRight:16, paddingTop:8, paddingBottom:8, borderRadius:10, border: `0.5px solid ${C.border}`, fontSize:13, fontWeight:600, fontFamily:FONT, background:'#fff', color:C.text, cursor: statsLoading ? 'wait' : 'pointer', boxShadow:'0 1px 3px rgba(15,23,42,0.05)', opacity: statsLoading ? 0.65 : 1 }}>
            {statsLoading ? 'Refreshing…' : 'Refresh'}
          </button>
            <div style={{ position:'relative' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search dashboards…"
                style={{ paddingLeft:32, paddingRight:12, paddingTop:8, paddingBottom:8, borderRadius:10, border:`0.5px solid ${C.border}`, fontSize:13, fontFamily:FONT, outline:'none', color:C.text, background:'#fff', width:220, boxShadow:'0 1px 3px rgba(15,23,42,0.05)' }}/>
            </div>
          </div>
        </div>

        {/* Live stats bar */}
        <div className="lq-stagger" style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12, marginBottom:32, animation:'fadeUp .4s ease .05s both' }}>
          <StatCard label="Meta Spend · 30D"  value={fmtC(liveStats?.meta?.spend||0)}      sub="Last 30 days" accent={C.blue}  loading={statsLoading}
            icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>}/>
          <StatCard label="Meta Leads · 30D"  value={fmtN(liveStats?.meta?.leads||0)}      sub="Last 30 days" accent={C.navy}  loading={statsLoading}
            icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>}/>
          <StatCard label="CPL · 30D"         value={fmtC(cpl)}                            sub="Cost per lead" accent={C.amber} loading={statsLoading}
            icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>}/>
          <StatCard label="QL This Month"     value={fmtN(liveStats?.ql?.total||0)}         sub={`Futwork ${fmtN(liveStats?.ql?.futwork||0)} · Superbot ${fmtN(liveStats?.ql?.superbot||0)}`} accent={C.green} loading={statsLoading}
            icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>}/>
          <StatCard label="Meta CTR · 30D"    value={`${(liveStats?.meta?.ctr||0).toFixed(2)}%`} sub="Click-through rate" accent={C.cyan} loading={statsLoading}
            icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>}/>
        </div>

        {/* Dashboard grid */}
        <div style={{ animation:'fadeUp .4s ease .1s both' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
            <h2 style={{ fontSize:14, fontWeight:700, color:C.text, margin:0, letterSpacing:'-0.01em', fontFamily:FONT }}>All Dashboards</h2>
            <span style={{ fontSize:12, color:C.muted, fontFamily:FONT }}>{filtered.length} dashboards</span>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14 }}>
            {filtered.map((d,i) => (
              <div key={d.id} className="dhcard" onClick={()=>navigate(d.to)}
                style={{ background:'#fff', border:`0.5px solid ${C.border}`, borderRadius:14, padding:'18px 18px 16px', cursor:'pointer', boxShadow:'0 1px 3px rgba(15,23,42,0.04)', animation:`fadeUp .35s ease ${i*0.03}s both` }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:12 }}>
                  <div style={{ width:40, height:40, borderRadius:11, background:d.color+'18', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <DashIcon id={d.icon} color={d.color}/>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                    {d.live && <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:10.5, fontWeight:700, color:C.green, background:C.green+'14', padding:'3px 8px', borderRadius:20 }}>
                      <span style={{ width:5, height:5, borderRadius:'50%', background:C.green, animation:'pulse 2s infinite' }}/>LIVE
                    </span>}
                    {!d.live && <span style={{ fontSize:10.5, fontWeight:600, color:C.muted, background:'#F3F4F6', padding:'3px 8px', borderRadius:20 }}>BIGQUERY</span>}
                  </div>
                </div>
                <div style={{ fontSize:15, fontWeight:700, color:C.text, marginBottom:5, fontFamily:FONT }}>{d.label}</div>
                <div style={{ fontSize:12, color:C.muted, lineHeight:1.55, marginBottom:12, minHeight:36, fontFamily:FONT }}>{d.desc}</div>
                <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                  {d.tags.map(t=>(
                    <span key={t} className="dhtag" style={{ fontSize:10.5, fontWeight:500, color:'#6B7280', background:'#F3F4F6', padding:'3px 8px', borderRadius:20, fontFamily:FONT }}>{t}</span>
                  ))}
                </div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', marginTop:12, paddingTop:10, borderTop:`0.5px solid ${C.border}` }}>
                  <span style={{ fontSize:12, fontWeight:700, color:d.color, fontFamily:FONT }}>Open →</span>
                </div>
              </div>
            ))}
          </div>
          {filtered.length===0&&<div style={{ padding:'60px 0', textAlign:'center', color:C.muted, fontSize:13, fontFamily:FONT }}>No dashboards found for "{search}"</div>}
        </div>
      </main>
    </div>
  )
}
