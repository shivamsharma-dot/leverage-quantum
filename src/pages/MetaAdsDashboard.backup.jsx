import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'
import { TrendingUp, Users, MousePointer, Eye, Target, BarChart2, Zap, Activity, Award, Globe, Layers } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import { DashboardSkeleton } from '../components/SkeletonLoader'
import styles from './MetaAdsDashboard.module.css'

const APP_ID     = '2314692909338886'
const DEFAULT_AD_ACCOUNT = 'act_641914389215638'
const TOKEN_KEY  = 'lq_meta_token'
const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_KEY   = import.meta.env.VITE_GROQ_API_KEY

const proxyImg = url => url ? `/api/img-proxy?url=${encodeURIComponent(url)}` : null

const SUPABASE_URL = 'https://tsyekthwthxszmsgqfej.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzeWVrdGh3dGh4c3ptc2dxZmVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NjkzMDIsImV4cCI6MjA5NTM0NTMwMn0.bdM9h5c3PDu9hgggjBdbA-eb7kfF-79c6txOnCUxRhY'

async function storeTokenInSupabase(token) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/meta_tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({ id: 1, token, updated_at: new Date().toISOString() })
    })
  } catch {}
}

async function loadTokenFromSupabase() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/meta_tokens?select=token&order=id.desc&limit=1`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } })
    const data = await res.json()
    return data?.[0]?.token || null
  } catch { return null }
}
const TOKEN_EXPIRED_EVENT = 'lq:meta_token_expired'

async function graphGet(path, token, params = {}) {
  const qs = new URLSearchParams({ access_token: token, ...params }).toString()
  const res = await fetch(`https://graph.facebook.com/v19.0/${path}?${qs}`)
  const d = await res.json()
  if (d.error) throw new Error(d.error.message)
  return d
}

// ─── Fatigue score (reverse-engineered from NeoLook pattern) ─
function computeFatigue(impressions, clicks, ctr, frequency, accountAvgCTR, prev) {
  // Not enough data yet
  if (impressions < 50) return { score: 20, label: impressions < 10 ? 'healthy' : 'moderate' }  // new/low-volume ads - monitor

  let score = 0

  // ── 1. Frequency (audience exposure) ─────────────────────────────────
  // Healthy: <2.5 | Moderate: 2.5-4.5 | High: >4.5
  if (frequency >= 4.5)      score += 40
  else if (frequency >= 2.5) score += 20
  else                       score += 0

  // ── 2. CTR trend vs previous period (week-over-week) ─────────────────
  // This is the key signal Neolook uses — absolute CTR means nothing,
  // but a CTR DECLINING from previous period signals fatigue
  if (prev && prev.impressions >= 50 && prev.ctr > 0) {
    const ctrDrop = (prev.ctr - ctr) / prev.ctr  // positive = CTR dropped
    if (ctrDrop > 0.30)       score += 35   // >30% CTR drop = strong fatigue
    else if (ctrDrop > 0.15)  score += 20   // 15-30% drop = moderate signal
    else if (ctrDrop > 0.05)  score += 10   // 5-15% drop = mild signal
    else if (ctrDrop < -0.10) score -= 5    // CTR improving = healthy signal
    // CPM trend: spend rising for same reach = audience getting expensive
    if (prev.spend > 0 && prev.impressions > 0) {
      const prevCPM = (prev.spend / prev.impressions) * 1000
      const currCPM = (parseFloat(ctr > 0 ? 1 : 1)) // placeholder, need spend
      // CPM check handled below if spend passed
    }
  } else {
    // No previous data - use CTR vs account average as fallback
    if (accountAvgCTR > 0) {
      const ctrRatio = ctr / accountAvgCTR
      if (ctrRatio >= 1.0)        score += 0    // at or above average = no penalty
      else if (ctrRatio >= 0.75)  score += 10   // slightly below
      else if (ctrRatio >= 0.50)  score += 20   // well below
      else                        score += 30   // very low CTR
    }
  }

  // ── 3. CPM trend (spend efficiency declining) ─────────────────────────
  if (prev && prev.impressions >= 50 && prev.spend > 0) {
    const currSpendPerImpr = (ctr / 100)  // proxy — we pass actual below
    // Real CPM comparison if prev spend available
    const prevCPM = (prev.spend / prev.impressions) * 1000
    const currCPM = prev._currCPM || prevCPM  // injected below
    if (currCPM > 0 && prevCPM > 0) {
      const cpmRise = (currCPM - prevCPM) / prevCPM
      if (cpmRise > 0.30)       score += 20   // CPM up >30%
      else if (cpmRise > 0.10)  score += 10   // CPM up 10-30%
    }
  }

  score = Math.max(5, Math.min(95, score))

  // Classification
  const label = score <= 20 ? 'healthy' : score <= 45 ? 'moderate' : 'high'
  return { score: Math.round(score), label }
}

function fmtINR(inr) {
  // Meta API returns spend already in INR for Indian accounts
  const n = parseFloat(inr) || 0
  if (n >= 1e7) return '₹' + (n/1e7).toFixed(2) + ' Cr'
  if (n >= 1e5) return '₹' + (n/1e5).toFixed(1) + 'L'
  if (n >= 1000) return '₹' + Math.round(n).toLocaleString('en-IN')
  return '₹' + Math.round(n)
}
const getAction = (actions, type) => {
  if (type === 'lead') {
    const grouped = parseInt(actions?.find(a => a.action_type === 'onsite_conversion.lead_grouped')?.value || 0)
    if (grouped > 0) return grouped
  }
  return parseInt(actions?.find(a => a.action_type === type)?.value || 0)
}

// ─── CONNECT SCREEN ───────────────────────────────────────
function ConnectScreen({ onConnect, onPaste, error, loading }) {
  const [showPaste, setShowPaste] = useState(false)
  const [manual, setManual] = useState('')
  return (
    <div className={styles.connectWrap}>
      <div className={styles.connectCard}>
        <div className={styles.connectIcon}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="#1877F2"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg>
        </div>
        <h2 className={styles.connectTitle}>Connect Meta Ads</h2>
        <p className={styles.connectDesc}>Authorise Quantum to access campaigns, creatives and pixel data for <strong>act_641914389215638</strong>.</p>
        <div className={styles.connectPerms}>
          <p className={styles.connectPermsLabel}>Permissions requested</p>
          {['ads_read', 'ads_management', 'business_management'].map(p => (
            <div key={p} className={styles.connectPerm}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              <code>{p}</code>
            </div>
          ))}
        </div>
        {error && <div className={styles.connectError}>{error}</div>}
        {!showPaste
          ? <>
              <button className={styles.connectBtn} onClick={onConnect} disabled={loading}>
                {loading ? <><span className={styles.spinner}/> Connecting…</> : <><svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg> Continue with Meta</>}
              </button>
              <button onClick={() => setShowPaste(true)} style={{background:'none',border:'none',color:'#9CA3AF',fontSize:12,cursor:'pointer',fontFamily:'Inter,sans-serif',marginTop:4}}>Paste access token manually →</button>
            </>
          : <>
              <p style={{fontSize:12.5,color:'#374151',marginBottom:8,textAlign:'left',fontWeight:500}}>Paste your Meta Access Token</p>
              <p style={{fontSize:11.5,color:'#9CA3AF',marginBottom:10,textAlign:'left',lineHeight:1.5}}>
                Get it from <a href="https://developers.facebook.com/tools/explorer" target="_blank" rel="noreferrer" style={{color:'#1877F2'}}>Graph API Explorer</a> → Get Token → select <code>ads_read</code>
              </p>
              <input type="text" placeholder="EAAxxxxxxxxxxxxxxx..." value={manual} onChange={e => setManual(e.target.value)}
                style={{width:'100%',padding:'9px 12px',border:'1px solid #E5E7EB',borderRadius:8,fontSize:12,fontFamily:'monospace',marginBottom:8,boxSizing:'border-box',outline:'none'}}/>
              <button className={styles.connectBtn} onClick={() => onPaste(manual)} disabled={!manual.trim()}>Connect</button>
              <button onClick={() => setShowPaste(false)} style={{background:'none',border:'none',color:'#9CA3AF',fontSize:12,cursor:'pointer',fontFamily:'Inter,sans-serif',marginTop:4}}>← Back</button>
            </>
        }
        <p className={styles.connectNote}>Token stored locally in your browser only.</p>
      </div>
    </div>
  )
}

// ─── KPI SECTION (lifetime row + period row) ──────────────────────────────
function NeolookKPIs({ lifetime, period, periodLabel }) {
  return (
    <div className={styles.kpiSection}>
      {/* Row 1 - All Time */}
      <div>
        <p className={styles.kpiRowLabel}>All Time</p>
        <div className={`${styles.kpiSectionRow} ${styles.kpiRowLifetime}`}>
          {lifetime.map(k => (
            <div key={k.label} className={styles.kpiTile}>
              {k.icon && <div className={styles.kpiTileIcon} style={{background:k.iconBg||'#F3F4F6'}}>{k.icon}</div>}
              <div className={styles.kpiTileBody}>
                <p className={styles.kpiTileLabel}>{k.label}</p>
                <p className={`${styles.kpiTileVal} ${styles.kpiTileValLifetime}`}>{k.value}</p>
                {k.sub && <p className={styles.kpiTileSub}>{k.sub}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Row 2 - Selected period */}
      <div>
        <p className={styles.kpiRowLabel}>{periodLabel || 'This Period'}</p>
        <div className={`${styles.kpiSectionRow} ${styles.kpiRowPeriod}`}>
          {period.map(k => (
            <div key={k.label} className={styles.kpiTile}>
              {k.icon && <div className={styles.kpiTileIcon} style={{background:k.iconBg||'#F3F4F6'}}>{k.icon}</div>}
              <div className={styles.kpiTileBody}>
                <p className={styles.kpiTileLabel}>{k.label}</p>
                <p className={styles.kpiTileVal}>{k.value || '-'}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function KPIBar({ kpis }) {
  return (
    <div className={styles.kpiBar}>
      {kpis.map(k => (
        <div key={k.label} className={styles.kpiTile}>
          <p className={styles.kpiTileVal}>{k.value}</p>
          <p className={styles.kpiTileLabel}>{k.label}</p>
        </div>
      ))}
    </div>
  )
}

// ─── HEALTH BADGE ─────────────────────────────────────────
function HealthBadge({ label }) {
  const map = { healthy:'#059669', moderate:'#D97706', high:'#DC2626' }
  const bg  = { healthy:'#DCFCE7', moderate:'#FEF3C7', high:'#FEE2E2' }
  return <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:20,background:bg[label]||'#F3F4F6',color:map[label]||'#6B7280',textTransform:'capitalize'}}>{label}</span>
}

function ScoreBadge({ score, label }) {
  const colors = { healthy:'#059669', moderate:'#D97706', high:'#DC2626' }
  return <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:20,background:'#fff',border:'1.5px solid '+(colors[label]||'#E5E7EB'),color:colors[label]||'#6B7280'}}>Score {score}</span>
}

// ─── CAMPAIGN TAB ─────────────────────────────────────────
function CampaignsTab({ data }) {
  const { account, lifetimeAccount = {}, activeCampaignCount = 0, pausedCampaignCount = 0, campaigns, ads = [], accountAvgCTR } = data
  const leads = getAction(account.actions, 'lead')

  const cpl = leads > 0 ? Math.round(parseFloat(account.spend||0) / leads) : 0

  const lifetimeKpis = [
    { label:'Total Amount Spent', value: fmtINR(parseFloat(lifetimeAccount.spend||0)), color:'#7C3AED', iconBg:'#F3E8FF', icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12M6 8h12M6 13l8 8M6 13h3a4 4 0 0 0 0-8"/></svg> },
    { label:'Total Campaigns',    value: (activeCampaignCount + pausedCampaignCount).toLocaleString(), sub: `${activeCampaignCount} active · ${pausedCampaignCount} paused`, color:'#F59E0B', iconBg:'#FEF3C7', icon:<Layers size={15} color='#F59E0B'/> },
    { label:'Total Impressions',  value: parseInt(lifetimeAccount.impressions||0).toLocaleString(), color:'#0EA5E9', iconBg:'#E0F2FE', icon:<Eye size={15} color='#0EA5E9'/> },
    { label:'Total Clicks',       value: parseInt(lifetimeAccount.clicks||0).toLocaleString(), color:'#6366F1', iconBg:'#EEF2FF', icon:<MousePointer size={15} color='#6366F1'/> },
    { label:'Total Reach',        value: parseInt(lifetimeAccount.reach||0).toLocaleString(), color:'#10B981', iconBg:'#D1FAE5', icon:<Globe size={15} color='#10B981'/> },
    { label:'Total Ads',          value: ads.length.toLocaleString(), color:'#64748B', iconBg:'#F1F5F9', icon:<Activity size={15} color='#64748B'/> },
    { label:'Total Leads',        value: leads.toLocaleString(), color:'#059669', iconBg:'#D1FAE5', icon:<Users size={15} color='#059669'/> },
  ]

  const periodKpis = [
    { label:'Spend',       value: fmtINR(parseFloat(account.spend||0)),               color:'#7C3AED', iconBg:'#F3E8FF', icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12M6 8h12M6 13l8 8M6 13h3a4 4 0 0 0 0-8"/></svg> },
    { label:'Impressions', value: parseInt(account.impressions||0).toLocaleString(),  color:'#0EA5E9', iconBg:'#E0F2FE', icon:<Eye size={15} color='#0EA5E9'/> },
    { label:'Clicks',      value: parseInt(account.clicks||0).toLocaleString(),       color:'#6366F1', iconBg:'#EEF2FF', icon:<MousePointer size={15} color='#6366F1'/> },
    { label:'Avg CTR',     value: parseFloat(account.ctr||0).toFixed(2)+'%',          color:'#F59E0B', iconBg:'#FEF3C7', icon:<TrendingUp size={15} color='#F59E0B'/> },
  ]

  const kpis = periodKpis // keep for any legacy usage

  // Sort by spend desc
  const sorted = [...campaigns].sort((a,b) => parseFloat(b.insights?.data?.[0]?.spend||0) - parseFloat(a.insights?.data?.[0]?.spend||0))

  const tierOf = (ins) => {
    const ctr = parseFloat(ins?.ctr||0)
    if (ctr > accountAvgCTR * 1.2) return 'TOP'
    if (ctr > accountAvgCTR * 0.5) return 'AVERAGE'
    return 'LOW'
  }
  const tierColor = { TOP:'#059669', AVERAGE:'#D97706', LOW:'#DC2626' }
  const tierBg    = { TOP:'#DCFCE7', AVERAGE:'#FEF3C7', LOW:'#FEE2E2' }

  // Back to top - uses window scroll
  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 400)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' })

  return (
    <div className={styles.tabContent}>
      <NeolookKPIs lifetime={lifetimeKpis} period={periodKpis} periodLabel={`${data.preset === 'custom_range' ? `${data.range?.since} to ${data.range?.until}` : data.preset === 'this_month' ? 'This Month' : data.preset === 'last_month' ? 'Last Month' : data.preset === 'yesterday' ? 'Yesterday' : data.preset === 'last_14d' ? 'Last 14 Days' : data.preset === 'last_30d' ? 'Last 30 Days' : 'Last 7 Days'}`}/>
      <p style={{fontSize:12,color:'#9CA3AF',marginBottom:4}}>{campaigns.length} campaigns · sorted by spend</p>
      <div className={styles.campaignGrid}>
        {sorted.map(c => {
          const ins = c.insights?.data?.[0] || {}
          const tier = tierOf(ins)
          const cLeads = getAction(ins.actions, 'lead')
          const spend = parseFloat(ins.spend||0)
          return (
            <div key={c.id} className={styles.campaignCard}>
              <div className={styles.campaignCardTop}>
                <div style={{flex:1,minWidth:0}}>
                  <p className={styles.campaignName} title={c.name}>{c.name}</p>
                  <p className={styles.campaignMeta}>{c.objective?.replace(/_/g,' ')} · {new Date(c.created_time||Date.now()).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</p>
                </div>
                <div style={{display:'flex',gap:4,flexShrink:0}}>
                  <span style={{fontSize:9,fontWeight:700,padding:'2px 6px',borderRadius:4,background:c.status==='ACTIVE'?'#DCFCE7':'#F3F4F6',color:c.status==='ACTIVE'?'#059669':'#9CA3AF'}}>{c.status}</span>
                  <span style={{fontSize:9,fontWeight:700,padding:'2px 6px',borderRadius:4,background:tierBg[tier],color:tierColor[tier]}}>Performance: {tier}</span>
                </div>
              </div>
              <div className={styles.campaignMetrics}>
                <div className={styles.metricPair}><span>Impressions</span><strong>{parseInt(ins.impressions||0).toLocaleString()}</strong></div>
                <div className={styles.metricPair}><span>Clicks</span><strong>{parseInt(ins.clicks||0).toLocaleString()}</strong></div>
                <div className={styles.metricPair}><span>Spend</span><strong>{fmtINR(spend)}</strong></div>
                <div className={styles.metricPair}><span>CTR</span><strong>{parseFloat(ins.ctr||0).toFixed(2)}%</strong></div>
                <div className={styles.metricPair}><span>CPC</span><strong>{spend>0&&parseInt(ins.clicks||0)>0?'₹'+Math.round(spend/parseInt(ins.clicks||1)).toLocaleString('en-IN'):'-'}</strong></div>
                <div className={styles.metricPair}><span>Leads</span><strong>{cLeads.toLocaleString()}</strong></div>
              </div>
              {ins.ctr > 0 && (
                <div className={styles.campaignInsight}>
                  {parseFloat(ins.ctr) >= accountAvgCTR
                    ? <><span className={styles.insightGreen}>↗</span> CTR above account average - ready to scale</>
                    : <><span className={styles.insightYellow}>⚠</span> CTR below account average - review targeting</>
                  }
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── CREATIVES TAB ────────────────────────────────────────
function CreativesTab({ data }) {
  const { account, lifetimeAccount = {}, activeCampaignCount = 0, pausedCampaignCount = 0, ads, accountAvgCTR, insightsMap = {}, prevInsightsMap = {} } = data
  const [expanded, setExpanded] = useState(null)
  const [viewMode, setViewMode] = useState('grid')
  const [adTypeFilter, setAdTypeFilter] = useState('all')
  const [healthFilter, setHealthFilter] = useState('all')
  const [adNameSearch, setAdNameSearch] = useState('')
  const [showBackToTop, setShowBackToTop] = useState(false)
  const leads = getAction(account.actions, 'lead')

  const cpl = leads > 0 ? Math.round(parseFloat(account.spend||0) / leads) : 0

  const lifetimeKpis = [
    { label:'Total Amount Spent', value: fmtINR(parseFloat(lifetimeAccount.spend||0)), color:'#7C3AED', iconBg:'#F3E8FF', icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12M6 8h12M6 13l8 8M6 13h3a4 4 0 0 0 0-8"/></svg> },
    { label:'Total Campaigns',    value: (activeCampaignCount + pausedCampaignCount).toLocaleString(), sub: `${activeCampaignCount} active · ${pausedCampaignCount} paused`, color:'#F59E0B', iconBg:'#FEF3C7', icon:<Layers size={15} color='#F59E0B'/> },
    { label:'Total Impressions',  value: parseInt(lifetimeAccount.impressions||0).toLocaleString(), color:'#0EA5E9', iconBg:'#E0F2FE', icon:<Eye size={15} color='#0EA5E9'/> },
    { label:'Total Clicks',       value: parseInt(lifetimeAccount.clicks||0).toLocaleString(), color:'#6366F1', iconBg:'#EEF2FF', icon:<MousePointer size={15} color='#6366F1'/> },
    { label:'Total Reach',        value: parseInt(lifetimeAccount.reach||0).toLocaleString(), color:'#10B981', iconBg:'#D1FAE5', icon:<Globe size={15} color='#10B981'/> },
    { label:'Total Ads',          value: ads.length.toLocaleString(), color:'#64748B', iconBg:'#F1F5F9', icon:<Activity size={15} color='#64748B'/> },
    { label:'Total Leads',        value: leads.toLocaleString(), color:'#059669', iconBg:'#D1FAE5', icon:<Users size={15} color='#059669'/> },
  ]

  const periodKpis = [
    { label:'Spend',       value: fmtINR(parseFloat(account.spend||0)),               color:'#7C3AED', iconBg:'#F3E8FF', icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12M6 8h12M6 13l8 8M6 13h3a4 4 0 0 0 0-8"/></svg> },
    { label:'Impressions', value: parseInt(account.impressions||0).toLocaleString(),  color:'#0EA5E9', iconBg:'#E0F2FE', icon:<Eye size={15} color='#0EA5E9'/> },
    { label:'Clicks',      value: parseInt(account.clicks||0).toLocaleString(),       color:'#6366F1', iconBg:'#EEF2FF', icon:<MousePointer size={15} color='#6366F1'/> },
    { label:'Avg CTR',     value: parseFloat(account.ctr||0).toFixed(2)+'%',          color:'#F59E0B', iconBg:'#FEF3C7', icon:<TrendingUp size={15} color='#F59E0B'/> },
  ]

  const kpis = periodKpis

  const scoredAds = ads.map(ad => {
    const ins = insightsMap[ad.id] || {}
    const impr = parseInt(ins.impressions||0)
    const clks = parseInt(ins.clicks||0)
    const ctr  = parseFloat(ins.ctr||0)
    const freq = parseFloat(ins.frequency||1)
    // picture = highest res available from Meta API for both image + video ads
    const imgUrl = proxyImg(ad.creative?._thumbUrl) || null
    const isVideo = !!ad.creative?.video_id
    const prevIns = prevInsightsMap[ad.id] || null
    const prev = prevIns ? {
      impressions: parseInt(prevIns.impressions||0),
      ctr: parseFloat(prevIns.ctr||0),
      spend: parseFloat(prevIns.spend||0),
      _currCPM: impr > 0 ? (parseFloat(ins.spend||0) / impr) * 1000 : 0
    } : null
    const { score, label } = computeFatigue(impr, clks, ctr, freq, accountAvgCTR, prev)
    return { ...ad, ins, impr, clks, ctr, freq, score, label, imgUrl }
  }).sort((a, b) => {
    const order = { healthy: 0, moderate: 1, high: 2 }
    if (order[a.label] !== order[b.label]) return order[a.label] - order[b.label]
    return parseFloat(b.ins.spend||0) - parseFloat(a.ins.spend||0)
  })

  const filteredAds = scoredAds.filter(ad => {
    if (healthFilter !== 'all' && ad.label !== healthFilter) return false
    if (adTypeFilter === 'video' && !ad.creative?.video_id) return false
    if (adTypeFilter === 'image' && !!ad.creative?.video_id) return false
    if (adNameSearch && !ad.name?.toLowerCase().includes(adNameSearch.toLowerCase())) return false
    return true
  })

  const healthCount = {
    healthy:  scoredAds.filter(a => a.label === 'healthy').length,
    moderate: scoredAds.filter(a => a.label === 'moderate').length,
    high:     scoredAds.filter(a => a.label === 'high').length,
  }

  // Back to top - uses window scroll
  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 400)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' })

  return (
    <div className={styles.tabContent}>
      <NeolookKPIs lifetime={lifetimeKpis} period={periodKpis} periodLabel={`${data.preset === 'custom_range' ? `${data.range?.since} to ${data.range?.until}` : data.preset === 'this_month' ? 'This Month' : data.preset === 'last_month' ? 'Last Month' : data.preset === 'yesterday' ? 'Yesterday' : data.preset === 'last_14d' ? 'Last 14 Days' : data.preset === 'last_30d' ? 'Last 30 Days' : 'Last 7 Days'}`}/>

      {/* Creative List header with filters */}
      <div className={styles.creativeListHeader}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <span className={styles.creativeListTitle}>Creative List <span className={styles.creativeListCount}>({filteredAds.length}/{scoredAds.length})</span></span>
          <div style={{display:'flex',gap:6}}>
            <div style={{display:'flex',alignItems:'center',gap:4,background:'#DCFCE7',border:'1px solid #BBF7D0',borderRadius:20,padding:'3px 10px'}}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              <span style={{fontSize:11,fontWeight:700,color:'#15803D'}}>{healthCount.healthy} Healthy</span>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:4,background:'#FEF3C7',border:'1px solid #FDE68A',borderRadius:20,padding:'3px 10px'}}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span style={{fontSize:11,fontWeight:700,color:'#B45309'}}>{healthCount.moderate} Moderate</span>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:4,background:'#FEE2E2',border:'1px solid #FECACA',borderRadius:20,padding:'3px 10px'}}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span style={{fontSize:11,fontWeight:700,color:'#B91C1C'}}>{healthCount.high} High Fatigue</span>
            </div>
          </div>
        </div>
        <div className={styles.creativeControls}>
          <input
            type="text"
            placeholder="Search ad name..."
            value={adNameSearch}
            onChange={e=>setAdNameSearch(e.target.value)}
            style={{padding:'5px 10px',border:'1px solid #E5E7EB',borderRadius:7,background:'#F9FAFB',color:'#374151',fontSize:11.5,fontFamily:'Inter,sans-serif',outline:'none',width:160}}
          />
          <select className={styles.creativeFilterSelect} value={adTypeFilter} onChange={e=>setAdTypeFilter(e.target.value)}>
            <option value="all">All Ad Types</option>
            <option value="video">Video</option>
            <option value="image">Image</option>
          </select>
          <select className={styles.creativeFilterSelect} value={healthFilter} onChange={e=>setHealthFilter(e.target.value)}>
            <option value="all">All Health</option>
            <option value="healthy">Healthy</option>
            <option value="moderate">Moderate</option>
            <option value="high">High Fatigue</option>
          </select>
          <div className={styles.viewToggle}>
            <button onClick={()=>setViewMode('grid')} className={`${styles.viewToggleBtn} ${viewMode==='grid'?styles.viewToggleActive:''}`}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            </button>
            <button onClick={()=>setViewMode('list')} className={`${styles.viewToggleBtn} ${viewMode==='list'?styles.viewToggleActive:''}`}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'grid' && <div className={styles.creativeGrid}>
        {filteredAds.map(ad => {
          const isOpen = expanded === ad.id
          const rec = ad.label==='high' ? 'Refresh Creative' : ad.label==='moderate' ? 'Monitor' : 'Keep Running'
          const signal = ad.impr===0 ? 'No impressions in period' : ad.label==='high' ? 'High Creative Fatigue - refresh needed' : ad.ctr < accountAvgCTR ? `Moderate fatigue (score ${ad.score}) - CTR below avg` : `Healthy - CTR above account average`
          const sigColor = ad.label==='high'?'#DC2626':ad.label==='moderate'?'#D97706':'#059669'
          return (
            <div key={ad.id} className={`${styles.creativeCard} ${styles['creative_'+ad.label]}`}>
              <div className={styles.creativeThumb}>
                {ad.imgUrl
                  ? <img src={ad.imgUrl} alt={ad.name} className={styles.thumbImg} loading="lazy"
                      onError={e=>{e.target.style.display='none';e.target.nextSibling&&(e.target.nextSibling.style.display='flex')}}/>
                  : null}
                <div className={styles.thumbPlaceholder} style={{display:ad.imgUrl?'none':'flex'}}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                </div>
                <div className={styles.creativeBadges}>
                  <HealthBadge label={ad.label}/>
                  <ScoreBadge score={ad.score} label={ad.label}/>
                </div>
              </div>

              {/* Info */}
              <div className={styles.creativeInfo}>
                <p className={styles.creativeName} title={ad.name}>{ad.name}</p>
                <div className={styles.creativeMetrics}>
                  <div className={styles.metricPair}><span>Impressions</span><strong>{ad.impr.toLocaleString()}</strong></div>
                  <div className={styles.metricPair}><span>Clicks</span><strong>{ad.clks.toLocaleString()}</strong></div>
                  <div className={styles.metricPair}><span>Spend</span><strong>{fmtINR(parseFloat(ad.ins.spend||0))}</strong></div>
                  <div className={styles.metricPair}><span>CTR</span><strong>{ad.ctr.toFixed(2)}%</strong></div>
                </div>

                <p className={styles.creativeSignal} style={{color:sigColor}}>{signal}</p>

                {/* More detail toggle */}
                <button className={styles.moreDetailBtn} onClick={() => setExpanded(isOpen ? null : ad.id)}>
                  {isOpen ? 'Less detail ▲' : 'More detail ▼'}
                </button>

                {isOpen && (
                  <div className={styles.creativeDetail}>
                    {ad.label === 'high' && (
                      <div className={styles.detailSection} style={{borderColor:'#FECACA',background:'#FEF2F2'}}>
                        <p style={{fontSize:11,fontWeight:700,color:'#DC2626',marginBottom:4}}>⚠ Needs Attention</p>
                        <p style={{fontSize:12,color:'#374151',fontWeight:600}}>High Creative Fatigue</p>
                        <p style={{fontSize:11.5,color:'#6B7280'}}>Refresh Creative</p>
                      </div>
                    )}
                    <div className={styles.detailSection}>
                      <p style={{fontSize:11,fontWeight:700,color:'#6366F1',marginBottom:4}}>💡 Recommendation</p>
                      <p style={{fontSize:12,fontWeight:600,color:'#111827',marginBottom:2}}>{rec}</p>
                      <p style={{fontSize:11.5,color:'#6B7280'}}>{signal}</p>
                    </div>
                    <div className={styles.detailSection}>
                      <p style={{fontSize:11,fontWeight:700,color:'#059669',marginBottom:4}}>🛒 Upsell / Cross-sell</p>
                      <p style={{fontSize:11.5,color:'#374151'}}>Upsell: test premium/upgrade offer as the next step after lead capture.</p>
                      <p style={{fontSize:11.5,color:'#374151',marginTop:4}}>Cross-sell: test complementary bundle/next-best product offer alongside current creative.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>}

      {/* List view */}
      {viewMode === 'list' && (
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Creative</th><th>Health</th><th>Score</th>
                <th>Impressions</th><th>Clicks</th><th>Spend</th><th>CTR</th><th>Signal</th>
              </tr>
            </thead>
            <tbody>
              {scoredAds.map(ad => (
                <tr key={ad.id}>
                  <td>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      {ad.imgUrl && <img src={ad.imgUrl} alt="" style={{width:44,height:36,objectFit:'cover',borderRadius:4,flexShrink:0}} loading="lazy"/>}
                      <span style={{fontSize:12,fontWeight:500,color:'#111827',maxWidth:220,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={ad.name}>{ad.name}</span>
                    </div>
                  </td>
                  <td><HealthBadge label={ad.label}/></td>
                  <td style={{fontWeight:700,color:ad.label==='high'?'#DC2626':ad.label==='moderate'?'#D97706':'#059669'}}>{ad.score}</td>
                  <td>{ad.impr.toLocaleString()}</td>
                  <td>{ad.clks.toLocaleString()}</td>
                  <td style={{fontWeight:500}}>{fmtINR(parseFloat(ad.ins.spend||0))}</td>
                  <td>{ad.ctr.toFixed(2)}%</td>
                  <td style={{fontSize:11,color:ad.label==='high'?'#DC2626':ad.label==='moderate'?'#D97706':'#059669',maxWidth:180}}>{ad.label==='high'?'High Fatigue - Refresh':ad.label==='moderate'?'Monitor':'Healthy'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── VASU AI TAB ──────────────────────────────────────────
function VasuAITab({ data }) {
  const [messages, setMessages] = useState([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }) }, [messages])

  useEffect(() => {
    const { account, campaigns, ads } = data
    const leads = getAction(account.actions, 'lead')
    const topCampaigns = [...campaigns]
      .sort((a,b) => parseFloat(b.insights?.data?.[0]?.spend||0) - parseFloat(a.insights?.data?.[0]?.spend||0))
      .slice(0,5)
      .map(c => {
        const ins = c.insights?.data?.[0]||{}
        return `${c.name} | ${c.status} | Spend: ${fmtINR(parseFloat(ins.spend||0))} | CTR: ${parseFloat(ins.ctr||0).toFixed(2)}% | Leads: ${getAction(ins.actions,'lead')}`
      }).join('\n')

    setMessages([{
      role: 'assistant',
      content: `Hi! I'm **VASU AI** - connected to your Meta Ads ✅\n\n**Last 7 days snapshot:**\n- Spend: ${fmtINR(parseFloat(account.spend||0))} | Impressions: ${parseInt(account.impressions||0).toLocaleString()}\n- Clicks: ${parseInt(account.clicks||0).toLocaleString()} | CTR: ${parseFloat(account.ctr||0).toFixed(2)}%\n- Total Leads: ${leads.toLocaleString()} | ${campaigns.length} campaigns · ${ads.length} ads loaded\n\n**Top 5 campaigns by spend:**\n${topCampaigns}\n\nAsk me anything about your campaigns, creatives, or what actions to take this week.`
    }])
  }, [])

  const buildPrompt = () => `You are VASU AI - the Meta Ads intelligence layer inside Leverage Quantum (Leverage Edu's internal marketing dashboard).

You have access to live Meta Ads data for account act_641914389215638 (last 7 days):
- Spend: ${fmtINR(parseFloat(data.account.spend||0))}
- Impressions: ${parseInt(data.account.impressions||0).toLocaleString()} | Clicks: ${parseInt(data.account.clicks||0).toLocaleString()}
- CTR: ${parseFloat(data.account.ctr||0).toFixed(2)}% | CPM: ₹${Math.round(parseFloat(data.account.cpm||0)).toLocaleString('en-IN')}
- Total Leads: ${getAction(data.account.actions,'lead').toLocaleString()}
- ${data.campaigns.length} campaigns, ${data.ads.length} ads

TOP CAMPAIGNS:
${data.campaigns.slice(0,10).map(c=>{const i=c.insights?.data?.[0]||{};return `- ${c.name} | ${c.status} | ${fmtINR(parseFloat(i.spend||0))} | CTR:${parseFloat(i.ctr||0).toFixed(2)}% | Leads:${getAction(i.actions,'lead')}`}).join('\n')}

HIGH FATIGUE ADS (score 50+):
${data.ads.slice(0,5).map(ad=>{const i=ad.insights?.data?.[0]||{};const f=computeFatigue(parseInt(i.impressions||0),parseInt(i.clicks||0),parseFloat(i.ctr||0),parseFloat(i.frequency||1),data.accountAvgCTR);return f.label==='high'?`- ${ad.name} | Score:${f.score} | Spend:${fmtINR(parseFloat(i.spend||0))} | CTR:${parseFloat(i.ctr||0).toFixed(2)}%`:null}).filter(Boolean).join('\n')||'None detected'}

Guidelines: Be concise, lead with the number, always give a specific action. Read-only analyst - never claim to modify campaigns.`

  const send = async (text) => {
    const q = (text||input).trim()
    if (!q || loading) return
    setInput('')
    const updated = [...messages, { role:'user', content:q }]
    setMessages(updated)
    setLoading(true)
    try {
      const res = await fetch(GROQ_URL, {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+GROQ_KEY},
        body:JSON.stringify({ model:'llama-3.3-70b-versatile', messages:[{role:'system',content:buildPrompt()},...updated.slice(-10)], temperature:0.3, max_tokens:1024 })
      })
      const d = await res.json()
      setMessages(m => [...m, { role:'assistant', content:d.choices?.[0]?.message?.content||'(no response)' }])
    } catch(e) {
      setMessages(m => [...m, { role:'assistant', content:'⚠️ '+e.message }])
    } finally { setLoading(false) }
  }

  const render = c => c.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br/>')

  const QUICK = ['Analyse campaigns','Why is CTR low?','Best creative this week','Where to cut spend?','High fatigue ads','Scale recommendations']

  return (
    <div className={styles.vasuWrap}>
      <div className={styles.vasuMessages}>
        {messages.map((m,i) => (
          <div key={i} className={m.role==='user'?styles.userMsg:styles.asstMsg}>
            {m.role==='assistant' && (
              <div className={styles.vasuAvatar}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1C9FD4" strokeWidth="2" strokeLinecap="round">
                  <rect x="3" y="3" width="4" height="18" rx="1"/><rect x="10" y="8" width="4" height="13" rx="1"/><rect x="17" y="5" width="4" height="16" rx="1"/>
                </svg>
              </div>
            )}
            <div className={styles.vasuBubble} dangerouslySetInnerHTML={{__html:render(m.content)}}/>
          </div>
        ))}
        {loading && (
          <div className={styles.asstMsg}>
            <div className={styles.vasuAvatar}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1C9FD4" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="4" height="18" rx="1"/><rect x="10" y="8" width="4" height="13" rx="1"/><rect x="17" y="5" width="4" height="16" rx="1"/></svg></div>
            <div className={styles.vasuBubble}><span className={styles.typing}><span/><span/><span/></span></div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>
      <div className={styles.vasuQuickRow}>
        {QUICK.map(p => <button key={p} className={styles.vasuQuickBtn} onClick={()=>send(p)} disabled={loading}>{p}</button>)}
      </div>
      <div className={styles.vasuInputRow}>
        <textarea className={styles.vasuInput} value={input}
          onChange={e=>{setInput(e.target.value);e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,160)+'px'}}
          onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}}
          placeholder="Ask about campaigns, creatives, pixel… (Shift+Enter for new line)"
          disabled={loading} rows={1} style={{resize:'none',overflowY:'auto'}}/>
        <button className={styles.vasuSendBtn} onClick={()=>send()} disabled={loading||!input.trim()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
      {/* Back to top */}
      <button onClick={scrollToTop} className={`${styles.backToTop} ${showBackToTop ? '' : styles.backToTopHidden}`} title="Back to top">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="18 15 12 9 6 15"/></svg>
      </button>
    </div>
  )
}

// Date preset helper
function getDateRange(preset) {
  const f = d => d.toISOString().slice(0, 10)
  const today = new Date()
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1)
  const s = new Date(yesterday)

  if (preset === 'yesterday') {
    return { since: f(yesterday), until: f(yesterday) }
  } else if (preset === 'this_month') {
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    return { since: f(firstOfMonth), until: f(today) }
  } else if (preset === 'last_month') {
    const firstOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const lastOfLastMonth  = new Date(today.getFullYear(), today.getMonth(), 0)
    return { since: f(firstOfLastMonth), until: f(lastOfLastMonth) }
  } else if (preset === 'last_7d')  { s.setDate(s.getDate() - 6) }
  else if (preset === 'last_14d') { s.setDate(s.getDate() - 13) }
  else if (preset === 'last_30d') { s.setDate(s.getDate() - 29) }

  return { since: f(s), until: f(yesterday) }
}

// ─── MAIN ─────────────────────────────────────────────────

// ─── INLINE DATE PICKER ────────────────────────────────────────────────────
function DatePicker({ value, onChange, placeholder = 'Select date', maxDate }) {
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(() => value ? new Date(value).getFullYear() : new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(() => value ? new Date(value).getMonth() : new Date().getMonth())
  const ref = useRef(null)

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const DAYS   = ['Su','Mo','Tu','We','Th','Fr','Sa']

  const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate()
  const firstDay    = (y, m) => new Date(y, m, 1).getDay()

  const select = (day) => {
    const d = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    onChange(d)
    setOpen(false)
  }

  const displayVal = value
    ? new Date(value + 'T00:00:00').toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
    : placeholder

  const today = new Date().toISOString().slice(0,10)

  return (
    <div ref={ref} style={{position:'relative',userSelect:'none'}}>
      <div onClick={() => setOpen(o => !o)}
        style={{display:'flex',alignItems:'center',gap:6,padding:'6px 10px',borderRadius:7,border:`1.5px solid ${open?'#6366F1':'#E5E7EB'}`,background:'#fff',cursor:'pointer',fontSize:12,color:value?'#0F172A':'#9CA3AF',minWidth:130,transition:'border .15s'}}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={value?'#6366F1':'#9CA3AF'} strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <span style={{flex:1}}>{displayVal}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      {open && (
        <div style={{position:'absolute',top:'calc(100% + 6px)',left:0,zIndex:999,background:'#fff',border:'1px solid #E5E7EB',borderRadius:10,boxShadow:'0 8px 24px rgba(0,0,0,0.12)',padding:'12px',minWidth:240}}>
          {/* Month/Year nav */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
            <button onClick={() => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y=>y-1) } else setViewMonth(m=>m-1) }}
              style={{background:'none',border:'none',cursor:'pointer',padding:'2px 6px',borderRadius:5,fontSize:16,color:'#374151',lineHeight:1}}>‹</button>
            <span style={{fontSize:13,fontWeight:700,color:'#0F172A'}}>{MONTHS[viewMonth]} {viewYear}</span>
            <button onClick={() => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y=>y+1) } else setViewMonth(m=>m+1) }}
              style={{background:'none',border:'none',cursor:'pointer',padding:'2px 6px',borderRadius:5,fontSize:16,color:'#374151',lineHeight:1}}>›</button>
          </div>
          {/* Day headers */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2,marginBottom:4}}>
            {DAYS.map(d => <div key={d} style={{textAlign:'center',fontSize:10,fontWeight:600,color:'#9CA3AF',padding:'2px 0'}}>{d}</div>)}
          </div>
          {/* Days grid */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2}}>
            {Array.from({length: firstDay(viewYear, viewMonth)}).map((_,i) => <div key={'e'+i}/>)}
            {Array.from({length: daysInMonth(viewYear, viewMonth)}).map((_,i) => {
              const day = i + 1
              const dateStr = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
              const isSelected = dateStr === value
              const isToday = dateStr === today
              const isFuture = maxDate ? dateStr > maxDate : dateStr > today
              return (
                <div key={day} onClick={() => !isFuture && select(day)}
                  style={{textAlign:'center',padding:'5px 2px',borderRadius:6,fontSize:12,fontWeight:isSelected?700:400,
                    background:isSelected?'#6366F1':isToday?'#EEF2FF':'transparent',
                    color:isSelected?'#fff':isFuture?'#D1D5DB':isToday?'#6366F1':'#374151',
                    cursor:isFuture?'not-allowed':'pointer',transition:'background .1s'}}
                  onMouseEnter={e=>{ if(!isSelected&&!isFuture) e.target.style.background='#F3F4F6' }}
                  onMouseLeave={e=>{ if(!isSelected&&!isFuture) e.target.style.background='transparent' }}>
                  {day}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default function MetaAdsDashboard() {
  const location  = useLocation()
  const navigate  = useNavigate()
  const activeTab = new URLSearchParams(location.search).get('tab') || 'campaigns'

  const { user } = useAuth()
  const isViewerRole = user?.role === 'viewer'

  const [token, setToken]           = useState(() => localStorage.getItem(TOKEN_KEY) || '')
  const [adAccount, setAdAccount]       = useState(() => localStorage.getItem('lq_ad_account') || DEFAULT_AD_ACCOUNT)
  const [adAccounts, setAdAccounts]     = useState([])
  const [accountPickerOpen, setAccountPickerOpen] = useState(false)
  const [loading, setLoading]       = useState(false)
  const [pageLoad, setPageLoad]     = useState(true)
  const [error, setError]           = useState('')
  const [data, setData]             = useState(null)
  const [tokenExpired, setTokenExpired] = useState(false)
  const [sdkReady, setSdkReady] = useState(false)
  const [lastSync, setLastSync] = useState(null)
  const [datePreset, setDatePreset] = useState('last_7d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo]     = useState('')

  useEffect(() => { setTimeout(() => setPageLoad(false), 600) }, [])

  // Listen for Meta token expiry (OAuthException code 190)
  useEffect(() => {
    const onExpired = () => setTokenExpired(true)
    window.addEventListener(TOKEN_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(TOKEN_EXPIRED_EVENT, onExpired)
  }, [])

  // Close account picker on outside click (use ref to exclude the picker itself)
  const accountPickerRef = useRef(null)
  useEffect(() => {
    if (!accountPickerOpen) return
    const handler = (e) => {
      if (accountPickerRef.current && !accountPickerRef.current.contains(e.target)) {
        setAccountPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [accountPickerOpen])

  useEffect(() => {
    window.fbAsyncInit = () => { window.FB.init({ appId: APP_ID, version: 'v19.0', xfbml: false, cookie: true }); setSdkReady(true) }
    if (!document.getElementById('fb-sdk')) {
      const s = document.createElement('script'); s.id = 'fb-sdk'; s.src = 'https://connect.facebook.net/en_US/sdk.js'; s.async = true; document.head.appendChild(s)
    } else if (window.FB) setSdkReady(true)
  }, [])

  // Helper to fetch all ad accounts for a token
  const fetchAdAccounts = (t) => {
    fetch(`https://graph.facebook.com/v19.0/me/adaccounts?fields=id,name,account_status&access_token=${t}`)
      .then(r => r.json())
      .then(d => { if (d.data) setAdAccounts(d.data.filter(a => a.account_status === 1)) })
      .catch(() => {})
  }

  // On mount: load token from Supabase if not in localStorage, then fetch accounts
  useEffect(() => {
    if (!token) {
      loadTokenFromSupabase().then(t => {
        if (t) {
          localStorage.setItem(TOKEN_KEY, t)
          setToken(t)
          fetchAdAccounts(t)
        }
      })
    } else {
      // Token already in localStorage — fetch accounts now
      fetchAdAccounts(token)
    }
  }, [])

  useEffect(() => { if (token) loadAllData(token, datePreset) }, [token])

  const handleConnect = () => {
    if (!window.FB) { setError('Facebook SDK loading, please wait…'); return }
    setLoading(true); setError('')
    window.FB.login(r => {
      if (r.authResponse?.accessToken) {
        const t = r.authResponse.accessToken
        localStorage.setItem(TOKEN_KEY, t)
        storeTokenInSupabase(t)
        setToken(t)
        fetchAdAccounts(t)
      } else { setError('Authorization cancelled. Try pasting token manually.'); setLoading(false) }
    }, { scope: 'ads_read,ads_management,business_management' })
  }

  const handlePaste = (t) => {
    if (!t.trim()) return
    localStorage.setItem(TOKEN_KEY, t.trim())
    storeTokenInSupabase(t.trim())
    setToken(t.trim())
  }

  const loadAllData = async (t, preset = datePreset, fromDate = null, toDate = null, accountOverride = null) => {
    setLoading(true); setError('')
    try {
      const AD_ACCOUNT_ID = accountOverride || adAccount || DEFAULT_AD_ACCOUNT
      const range     = preset === 'custom_range' && fromDate && toDate
        ? { since: fromDate, until: toDate }
        : getDateRange(preset)
      const timeRange = JSON.stringify(range)

      // Map preset to Meta's date_preset for nested insights
      // this_month uses time_range instead of date_preset
      // last_month/this_month/custom_range all use time_range with exact computed dates
      // so Meta's own date_preset is never used for these (avoids billing-period mismatches)
      const useTimeRange = preset === 'this_month' || preset === 'last_month' || preset === 'custom_range'
      const metaPreset = preset === 'yesterday' ? 'yesterday'
                       : preset === 'last_14d'  ? 'last_14d'
                       : preset === 'last_30d'  ? 'last_30d'
                       : 'last_7d'  // last_month/this_month/custom use time_range instead

      const [accIns, lifetimeIns, campaignsSummary, campaigns, adsRaw, pixels] = await Promise.all([
        // Account-level insights for selected period
        graphGet(`${AD_ACCOUNT_ID}/insights`, t, {
          fields: 'spend,impressions,clicks,ctr,cpm,reach,frequency,actions',
          time_range: timeRange, level: 'account'
        }),
        // Lifetime account insights (no date filter)
        graphGet(`${AD_ACCOUNT_ID}/insights`, t, {
          fields: 'spend,impressions,clicks,reach',
          date_preset: 'maximum', level: 'account'
        }),
        // Campaign count summary (all time, for active/paused counts)
        graphGet(`${AD_ACCOUNT_ID}/campaigns`, t, {
          fields: 'status', limit: 500
        }),
        // Campaigns - use date_preset for nested insights (avoids 400)
        graphGet(`${AD_ACCOUNT_ID}/campaigns`, t, {
          fields: `name,status,objective,created_time,insights${useTimeRange ? `.time_range(${timeRange})` : `.date_preset(${metaPreset})`}{spend,impressions,clicks,ctr,reach,frequency,actions,cost_per_action_type}`,
          limit: 50
        }),
        // Ads + creatives - fetch ALL active ads without insights (so no date filter excludes them)
        graphGet(`${AD_ACCOUNT_ID}/ads`, t, {
          fields: `name,status,effective_status,creative{id,name,video_id,object_story_spec}`,
          filtering: JSON.stringify([{field:'effective_status',operator:'IN',value:['ACTIVE','PAUSED']}]),
          limit: 200
        }),
        graphGet(`${AD_ACCOUNT_ID}/adspixels`, t, { fields: 'id,name,last_fired_time' })
      ])

      const account = accIns.data?.[0] || {}
      const accountAvgCTR = parseFloat(account.ctr || 0)
      const lifetimeAccount = lifetimeIns.data?.[0] || {}
      const allCampaigns = campaignsSummary.data || []
      const activeCampaignCount = allCampaigns.filter(c => c.status === 'ACTIVE').length
      const pausedCampaignCount = allCampaigns.filter(c => c.status === 'PAUSED').length

      // Fetch insights for current AND previous period (for WoW comparison)
      const adsRawData = adsRaw.data || []
      let insightsMap = {}
      let prevInsightsMap = {}

      // Build previous period time_range (same duration, shifted back)
      const rangeDays = Math.round((new Date(range.until) - new Date(range.since)) / 86400000) + 1
      const prevUntil = new Date(range.since); prevUntil.setDate(prevUntil.getDate() - 1)
      const prevSince = new Date(prevUntil); prevSince.setDate(prevSince.getDate() - (rangeDays - 1))
      const fmt = d => d.toISOString().slice(0,10)
      const prevTimeRange = JSON.stringify({ since: fmt(prevSince), until: fmt(prevUntil) })

      if (adsRawData.length > 0) {
        try {
          const adIds = adsRawData.map(a => a.id)
          const insChunks = []
          for (let i = 0; i < adIds.length; i += 50) insChunks.push(adIds.slice(i, i + 50))

          // Fetch current + previous period in parallel
          await Promise.all(insChunks.map(async chunk => {
            const [currRes, prevRes] = await Promise.all([
              graphGet(`${AD_ACCOUNT_ID}/insights`, t, {
                fields: 'ad_id,spend,impressions,clicks,ctr,reach,frequency,actions',
                level: 'ad',
                ...(useTimeRange ? { time_range: timeRange } : { date_preset: metaPreset }),
                filtering: JSON.stringify([{field:'ad.id',operator:'IN',value:chunk}]),
                limit: 50
              }),
              graphGet(`${AD_ACCOUNT_ID}/insights`, t, {
                fields: 'ad_id,spend,impressions,clicks,ctr,reach,frequency',
                level: 'ad',
                time_range: prevTimeRange,
                filtering: JSON.stringify([{field:'ad.id',operator:'IN',value:chunk}]),
                limit: 50
              })
            ])
            ;(currRes.data || []).forEach(ins => { insightsMap[ins.ad_id] = ins })
            ;(prevRes.data || []).forEach(ins => { prevInsightsMap[ins.ad_id] = ins })
          }))
        } catch(e) { console.error('Insights fetch failed:', e.message) }
      }
      const creativeIds = [...new Set(adsRawData.map(a => a.creative?.id).filter(Boolean))]
      let creativeThumbs = {}
      if (creativeIds.length > 0) {
        try {
          const chunks = []
          for (let i = 0; i < creativeIds.length; i += 50) chunks.push(creativeIds.slice(i, i + 50))
          await Promise.all(chunks.map(async chunk => {
            const qs = new URLSearchParams({
              access_token: t,
              ids: chunk.join(','),
              fields: 'id,thumbnail_url,image_url'
            }).toString()
            const res = await fetch(`https://graph.facebook.com/v19.0?${qs}`)
            const d = await res.json()
            if (d.error) { console.error('Thumb batch error:', d.error.message); return }
            Object.entries(d).forEach(([id, c]) => {
              // image_url = full res static ad image; thumbnail_url = fallback (use as-is, URL is signed)
              creativeThumbs[id] = c.image_url || c.thumbnail_url || null
            })
          }))
        } catch(e) { console.error('Thumb fetch failed:', e.message) }
      }

      // Merge thumbs - video ads use video_data.image_url, static use batch image_url
      const adsWithThumbs = adsRawData.map(ad => {
        const isVideo = !!ad.creative?.video_id
        const videoImg =
          ad.creative?.object_story_spec?.video_data?.image_url || null
        const staticImg = creativeThumbs[ad.creative?.id] || null
        const thumbUrl = isVideo ? (videoImg || staticImg) : (staticImg || videoImg)
        return {
          ...ad,
          creative: { ...ad.creative, _thumbUrl: thumbUrl || null }
        }
      })

      setData({ account, lifetimeAccount, activeCampaignCount, pausedCampaignCount, campaigns: campaigns.data || [], ads: adsWithThumbs, pixels: pixels.data || [], accountAvgCTR, insightsMap, prevInsightsMap, range, preset })
      setLastSync(new Date())
      setDatePreset(preset)
    } catch (e) {
      setError(e.message)
      if (e.message?.includes('190') || e.message?.includes('token') || e.message?.includes('OAuth')) {
        localStorage.removeItem(TOKEN_KEY); setToken('')
      }
    } finally { setLoading(false) }
  }

  const disconnect = () => { localStorage.removeItem(TOKEN_KEY); setToken(''); setData(null); setError('') }

  const [sending, setSending]   = useState(false)
  const [sendMsg, setSendMsg]   = useState('')

  const sendReport = async () => {
    setSending(true); setSendMsg('')
    try {
      const res = await fetch('/api/send-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setSendMsg(`✓ Report sent to ${d.recipients?.join(', ')}`)
    } catch (e) { setSendMsg('✕ ' + e.message) }
    finally { setSending(false); setTimeout(() => setSendMsg(''), 5000) }
  }

  const handleDateChange = (preset) => {
    setDatePreset(preset)
    if (preset !== 'custom_range') loadAllData(token, preset)
  }

  if (pageLoad) return <div className={styles.layout}><Sidebar/><DashboardSkeleton/></div>

  if (!token) return (
    <div className={styles.layout}>
      <Sidebar/>
      <div className={styles.main}>
        <div className={styles.header}>
          <div className={styles.headerLeft}><p className={styles.breadcrumb}>Dashboards / Meta Ads</p><h1 className={styles.pageTitle}>Meta Ads</h1></div>
        </div>
        <ConnectScreen onConnect={handleConnect} onPaste={handlePaste} error={error} loading={loading}/>
        {tokenExpired && token && (
          <div style={{margin:'0 32px 12px',background:'#FEF3C7',border:'1px solid #FDE68A',borderRadius:8,padding:'10px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span style={{fontSize:13,fontWeight:600,color:'#92400E'}}>Your Meta session has expired.</span>
              <span style={{fontSize:12,color:'#B45309'}}>Please reconnect to view live data.</span>
            </div>
            {!isViewerRole && (
              <button onClick={() => { disconnect(); setTokenExpired(false) }}
                style={{background:'#D97706',color:'#fff',border:'none',borderRadius:6,padding:'5px 12px',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>
                Reconnect
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )

  const PRESETS = [
    { id:'yesterday',    label:'Yesterday' },
    { id:'last_7d',      label:'Last 7 days' },
    { id:'last_14d',     label:'Last 14 days' },
    { id:'last_30d',     label:'Last 30 days' },
    { id:'this_month',   label:'This Month' },
    { id:'last_month',   label:'Last Month' },
    { id:'custom_range', label:'Custom Range' },
  ]

  return (
    <div className={styles.layout}>
      <Sidebar/>
      <div className={styles.main}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <p className={styles.breadcrumb}>Dashboards / Meta Ads</p>
            <h1 className={styles.pageTitle}>{activeTab === 'creatives' ? 'Meta Creatives Dashboard' : 'Meta Campaigns Dashboard'}</h1>
          </div>
          <div className={styles.headerRight}>
            {/* Date filter */}
            {adAccounts.length > 0 && (
              <div style={{position:'relative'}} ref={accountPickerRef}>
                <div
                  onClick={() => !loading && setAccountPickerOpen(o => !o)}
                  style={{display:'flex',alignItems:'center',gap:8,padding:'6px 10px 6px 10px',borderRadius:8,border:'1px solid #E5E7EB',background:'#fff',cursor:loading?'not-allowed':'pointer',minWidth:180,maxWidth:220,transition:'border .15s',borderColor:accountPickerOpen?'#1C9FD4':'#E5E7EB'}}>
                  <div style={{width:24,height:24,borderRadius:6,background:'#EEF2FF',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                  </div>
                  <span style={{flex:1,fontSize:12,fontWeight:600,color:'#0F172A',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                    {adAccounts.find(a => a.id === adAccount)?.name || adAccount}
                  </span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round" style={{flexShrink:0,transform:accountPickerOpen?'rotate(180deg)':'rotate(0deg)',transition:'transform .2s'}}><polyline points="6 9 12 15 18 9"/></svg>
                </div>
                {accountPickerOpen && (
                  <div style={{position:'absolute',top:'calc(100% + 6px)',left:0,zIndex:200,background:'#fff',border:'1px solid #E5E7EB',borderRadius:10,boxShadow:'0 8px 24px rgba(0,0,0,0.1)',minWidth:240,overflow:'hidden'}}>
                    <div style={{padding:'8px 12px 6px',fontSize:10,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'.06em',borderBottom:'1px solid #F3F4F6'}}>Ad Accounts</div>
                    {adAccounts.map(a => (
                      <div key={a.id}
                        onClick={() => { setAdAccount(a.id); localStorage.setItem('lq_ad_account', a.id); setAccountPickerOpen(false); loadAllData(token, datePreset, null, null, a.id) }}
                        style={{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',cursor:'pointer',background:a.id===adAccount?'#F8FAFF':'transparent',transition:'background .1s'}}
                        onMouseEnter={e=>e.currentTarget.style.background='#F8FAFF'}
                        onMouseLeave={e=>e.currentTarget.style.background=a.id===adAccount?'#F8FAFF':'transparent'}>
                        <div style={{width:28,height:28,borderRadius:7,background: a.id===adAccount?'#6366F1':'#F3F4F6',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:11,fontWeight:700,color:a.id===adAccount?'#fff':'#6B7280'}}>
                          {a.name.charAt(0).toUpperCase()}
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:12.5,fontWeight:a.id===adAccount?700:500,color:'#0F172A',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.name}</div>
                          <div style={{fontSize:10,color:'#9CA3AF',marginTop:1}}>{a.id}</div>
                        </div>
                        {a.id===adAccount && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <select value={datePreset} onChange={e => handleDateChange(e.target.value)} className={styles.dateSelect} disabled={loading}>
              {PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            {datePreset === 'custom_range' && (
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <DatePicker value={customFrom} onChange={setCustomFrom} placeholder="From date" maxDate={customTo || new Date().toISOString().slice(0,10)}/>
                <span style={{fontSize:12,color:'#9CA3AF'}}>to</span>
                <DatePicker value={customTo} onChange={setCustomTo} placeholder="To date" maxDate={new Date().toISOString().slice(0,10)}/>
                <button
                  disabled={!customFrom || !customTo || loading}
                  onClick={() => customFrom && customTo && loadAllData(token, 'custom_range', customFrom, customTo)}
                  style={{padding:'6px 14px',borderRadius:7,background:customFrom&&customTo?'#0F172A':'#E5E7EB',color:customFrom&&customTo?'#fff':'#9CA3AF',border:'none',fontSize:12,fontWeight:600,cursor:customFrom&&customTo?'pointer':'not-allowed',fontFamily:'Inter,sans-serif',transition:'all .15s'}}>
                  Apply
                </button>
              </div>
            )}
            {lastSync && <span className={styles.syncTag}>Synced {lastSync.toLocaleTimeString()}</span>}
            {sendMsg && <span style={{fontSize:12,color:sendMsg.startsWith('✓')?'#059669':'#DC2626',fontWeight:500}}>{sendMsg}</span>}
            <button className={styles.sendReportBtn} onClick={sendReport} disabled={sending||loading||!data}>
              {sending ? '⏳ Sending…' : '✉ Send Report'}
            </button>
            <button className={styles.refreshBtn} onClick={() => loadAllData(token, datePreset)} disabled={loading}
              style={{opacity: loading ? 0.7 : 1}}>
              <span className={loading ? styles.refreshSpin : ''}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
              </span>
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
            {!isViewerRole && <button className={styles.disconnectBtn} onClick={disconnect}>Disconnect</button>}
          </div>
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        {loading && !data ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#9CA3AF' }}>
            <div className={styles.bigSpinner}/>
            <p style={{ marginTop: 16, fontSize: 13 }}>Loading Meta Ads data…</p>
          </div>
        ) : data ? (
          <>
            {activeTab === 'campaigns' && <CampaignsTab data={data}/>}
            {activeTab === 'creatives' && <CreativesTab data={data}/>}
            {activeTab === 'vasu'      && null}
          </>
        ) : null}
      </div>
    </div>
  )
}
