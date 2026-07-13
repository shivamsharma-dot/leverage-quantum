import { useState, useEffect, useRef, useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'
import { usePresence } from '../hooks/usePresence'
import { TrendingUp, Users, MousePointer, Eye, Target, BarChart2, Zap, Activity, Award, Globe, Layers } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import KPICard from '../components/KPICard'
import ExportButton from '../components/ExportButton'
import { DashboardSkeleton } from '../components/SkeletonLoader'
import styles from './MetaAdsDashboard.module.css'

const APP_ID     = '2314692909338886'
const DEFAULT_AD_ACCOUNT = 'act_641914389215638'
const TOKEN_KEY  = 'lq_meta_token'
const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_KEY   = import.meta.env.VITE_GROQ_API_KEY

const proxyImg = url => url ? `/api/img-proxy?url=${encodeURIComponent(url)}` : null

async function storeTokenInSupabase(token) {
  try {
    await fetch('/api/meta-token', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    })
  } catch {}
}

async function loadTokenFromSupabase() {
  try {
    const res = await fetch('/api/meta-token', { credentials: 'include' })
    if (!res.ok) return null
    const data = await res.json()
    return data?.token ? { token: data.token, createdAt: data.createdAt } : null
  } catch { return null }
}
const TOKEN_EXPIRED_EVENT = 'lq:meta_token_expired'

// Run async mapper over items with bounded concurrency (paces Meta API calls to avoid rate limits)
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length)
  let idx = 0
  async function worker() {
    while (idx < items.length) {
      const i = idx++
      results[i] = await fn(items[i], i)
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}
async function graphGet(path, token, params = {}, retries = 4) {
  const qs = new URLSearchParams({ access_token: token, ...params }).toString()
  const res = await fetch(`https://graph.facebook.com/v19.0/${path}?${qs}`)
  const d = await res.json()
  if (d.error) {
    const msg = d.error.message || ''
    const RATE_CODES = [1, 4, 17, 32, 613]
    const rateLimited = RATE_CODES.includes(d.error.code) || msg.includes('reduce') || msg.includes('too large') || msg.includes('too many')
    if (retries > 0 && rateLimited) {
      const attempt = 4 - retries
      const wait = Math.min(1500 * Math.pow(2, attempt), 20000) + Math.floor(Math.random() * 700)
      await new Promise(r => setTimeout(r, wait))
      return graphGet(path, token, params, retries - 1)
    }
    throw new Error(msg)
  }
  return d
}

// ─── Paginated fetch — first page returns immediately, rest via callback ─
async function graphGetAll(path, token, params = {}, maxPages = 20, onProgress = null) {
  let allData = []
  const first = await graphGet(path, token, { ...params, limit: 200 })
  allData = first.data || []
  // Notify caller with first-page data immediately
  if (onProgress) onProgress(allData)
  let nextUrl = first.paging?.next || null
  let page = 0
  while (nextUrl && page < maxPages) {
    page++
    try {
      const res = await fetch(nextUrl)
      const d = await res.json()
      if (d.error) break
      allData = allData.concat(d.data || [])
      if (onProgress) onProgress(allData)
      nextUrl = d.paging?.next || null
    } catch { break }
  }
  return { data: allData }
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
  if (n > 0 && n < 1) return '₹' + n.toFixed(2)
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
  const map = { healthy:'#4CAE6F', moderate:'#D97706', high:'#DC2626' }
  const bg  = { healthy:'#DCFCE7', moderate:'#FEF3C7', high:'#FEE2E2' }
  return <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:20,background:bg[label]||'#F3F4F6',color:map[label]||'#6B7280',textTransform:'capitalize'}}>{label}</span>
}

function ScoreBadge({ score, label }) {
  const colors = { healthy:'#4CAE6F', moderate:'#D97706', high:'#DC2626' }
  return <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:20,background:'#fff',border:'1.5px solid '+(colors[label]||'#E5E7EB'),color:colors[label]||'#6B7280'}}>Score {score}</span>
}

// ─── CAMPAIGN TAB ─────────────────────────────────────────
function CampaignsTab({ data }) {
  const { account, lifetimeAccount = {}, activeCampaignCount = 0, pausedCampaignCount = 0, campaigns = [], accountAvgCTR } = data
  const [sortBy, setSortBy] = useState('spend')
  const [sortDir, setSortDir] = useState('desc')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(null)
  const accSpend = parseFloat(account.spend || 0)
  const accImpr = parseInt(account.impressions || 0)
  const accClicks = parseInt(account.clicks || 0)
  const accLeads = getAction(account.actions, 'lead')
  const accCTRpct = accImpr > 0 ? (accClicks / accImpr * 100) : 0
  const accCPL = accLeads > 0 ? Math.round(accSpend / accLeads) : 0
  const accCPM = accImpr > 0 ? Math.round(accSpend / accImpr * 1000) : 0
  const lifetimeSpend = parseFloat(lifetimeAccount.spend || 0)
  const lifetimeClicks = parseInt(lifetimeAccount.clicks || 0)
  const lifetimeCPC = lifetimeClicks > 0 ? lifetimeSpend / lifetimeClicks : 0
  const processed = useMemo(() => (campaigns || []).map(c => {
    const ins = c.insights?.data?.[0] || {}
    const spend = parseFloat(ins.spend) || 0, impressions = parseInt(ins.impressions) || 0
    const clicks = parseInt(ins.clicks) || 0, reach = parseInt(ins.reach) || 0
    const frequency = parseFloat(ins.frequency) || 0, ctr = parseFloat(ins.ctr) || 0
    const cpm = impressions > 0 ? spend / impressions * 1000 : 0
    const cpc = clicks > 0 ? spend / clicks : 0
    const actions = ins.actions || [], leads = getAction(actions, 'lead')
    const cpl = leads > 0 ? Math.round(spend / leads) : 0
    const cplCrm = c.crmLeads > 0 ? Math.round(spend / c.crmLeads) : 0
    const totalQL = (c.humanQL||0) + (c.aiQL||0)
    const cpql = totalQL > 0 ? Math.round(spend / totalQL) : 0
    const convRate = clicks > 0 ? (leads / clicks * 100) : 0
    const spendShare = accSpend > 0 ? (spend / accSpend * 100) : 0
    const avg = (accountAvgCTR || 0) * 100 || accCTRpct
    const signal = ctr > avg * 1.2 ? 'top' : (ctr < avg * 0.6 || (frequency > 4 && ctr < avg)) ? 'low' : 'average'
    const fatigueLevel = frequency > 4.5 ? 'fatigue' : frequency > 3 ? 'watch' : 'healthy'
    return { ...c, spend, impressions, clicks, reach, frequency, ctr, cpm, cpc, leads, cpl, cplCrm, cpql, convRate, spendShare, signal, fatigueLevel }
  }), [campaigns, accSpend, accCTRpct, accountAvgCTR])
  const filtered = useMemo(() => {
    let out = processed
    if (statusFilter !== 'all') out = out.filter(c => c.status?.toLowerCase() === statusFilter)
    if (search) out = out.filter(c => c.name?.toLowerCase().includes(search.toLowerCase()))
    return [...out].sort((a, b) => sortDir === 'desc' ? (b[sortBy]||0)-(a[sortBy]||0) : (a[sortBy]||0)-(b[sortBy]||0))
  }, [processed, statusFilter, search, sortBy, sortDir])
  const totFatigue = useMemo(() => processed.filter(c => c.fatigueLevel === 'fatigue').length, [processed])
  const totActive = useMemo(() => processed.filter(c => c.status === 'ACTIVE').length, [processed])
  const handleSort = col => { if (sortBy === col) setSortDir(d => d==='desc'?'asc':'desc'); else { setSortBy(col); setSortDir('desc') } }
  const fmtN = n => n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(0)+'K':String(Math.round(n||0))
  const sBadge = s => { const a=s==='ACTIVE'; return <span style={{ display:'inline-flex',alignItems:'center',gap:4,background:a?'#E9F8EF':'#F3F4F6',color:a?'#166534':'#6B7280',fontSize:10,fontWeight:600,padding:'2px 8px',borderRadius:10,whiteSpace:'nowrap' }}><span style={{ width:5,height:5,borderRadius:'50%',background:a?'#4CAE6F':'#9CA3AF',display:'inline-block' }}/>{a?'Active':'Paused'}</span> }
  const sigBadge = sig => { const m={top:{bg:'#E9F8EF',c:'#166534',t:'▲ Top'},average:{bg:'#F3F4F6',c:'#6B7280',t:'→ Avg'},low:{bg:'#EEF1FB',c:'#1F3C84',t:'▼ Low'}}[sig]||{bg:'#F3F4F6',c:'#6B7280',t:'→ Avg'}; return <span style={{ background:m.bg,color:m.c,fontSize:10,fontWeight:600,padding:'2px 8px',borderRadius:10,whiteSpace:'nowrap' }}>{m.t}</span> }
  const fBadge = lv => { const m={healthy:{bg:'#E9F8EF',c:'#166534'},watch:{bg:'#FEF9C3',c:'#854D0E'},fatigue:{bg:'#FEF2F2',c:'#991B1B'}}[lv]||{bg:'#E9F8EF',c:'#166534'}; return <span style={{ background:m.bg,color:m.c,fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:10,textTransform:'capitalize',whiteSpace:'nowrap' }}>{lv}</span> }
  const cplCol = v => v>300?'#1F3C84':v>150?'#1C9FD4':v>0?'#4CAE6F':'#6B7280'
  const SH = ({ col, lbl }) => <div onClick={()=>handleSort(col)} style={{ fontSize:11,fontWeight:600,color:sortBy===col?'#1F3C84':'#6B7280',cursor:'pointer',userSelect:'none',display:'flex',alignItems:'center',gap:2 }}>{lbl}<span style={{ opacity:sortBy===col?1:0.3,fontSize:9 }}>{sortBy===col?(sortDir==='desc'?'↓':'↑'):'↕'}</span></div>
  const cols = '2.2fr 80px 70px 100px 100px 80px 75px 85px 85px 95px 70px 85px 85px 80px 70px'
  return (
    <div style={{ fontFamily:"'Plus Jakarta Sans','Inter',sans-serif" }}>
        <div style={{ display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:10,marginBottom:16 }}>
          {[
            { label:'IMPRESSIONS',value:accImpr.toLocaleString('en-IN'),sub:accClicks.toLocaleString('en-IN')+' clicks',c1:'#1F3C84',c2:'#1C9FD4',icon:'◐' },
            { label:'PERIOD SPEND',value:fmtINR(accSpend),sub:totActive+' active · '+pausedCampaignCount+' paused',c1:'#1C9FD4',c2:'#29B9C3',icon:'₹' },
            { label:'TOTAL LEADS',value:accLeads.toLocaleString('en-IN'),sub:'Current period',c1:'#4CAE6F',c2:'#29B9C3',icon:'◉' },
            { label:'AVG CPL',value:accCPL>0?'₹'+accCPL.toLocaleString('en-IN'):'—',sub:'CTR '+accCTRpct.toFixed(2)+'% · CPM ₹'+accCPM,c1:'#1F3C84',c2:'#29B9C3',icon:'▲' },
            { label:'FATIGUED',value:totFatigue,sub:'Campaigns freq >4.5',c1:'#29B9C3',c2:'#1C9FD4',icon:'⚡' },
          ].map(k => (
            <div key={k.label} style={{ position:'relative', overflow:'hidden', borderRadius:16, padding:'16px 18px', background:'#fff', border:'1px solid #EEF1F6', boxShadow:'0 1px 2px rgba(16,24,40,0.04), 0 8px 24px -12px rgba(16,24,40,0.18)' }}>
              <div style={{ position:'absolute', top:0, left:0, right:0, height:4, background:'linear-gradient(90deg,'+k.c1+','+k.c2+')' }} />
              <div style={{ position:'absolute', top:-28, right:-28, width:96, height:96, borderRadius:'50%', background:'linear-gradient(135deg,'+k.c1+'14,'+k.c2+'05)' }} />
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12, position:'relative' }}>
                <div style={{ width:30, height:30, borderRadius:9, display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, color:'#fff', background:'linear-gradient(135deg,'+k.c1+','+k.c2+')', boxShadow:'0 4px 10px -2px '+k.c1+'66' }}>{k.icon}</div>
                <span style={{ fontSize:10.5, fontWeight:700, letterSpacing:'0.07em', color:'#64748B', textTransform:'uppercase' }}>{k.label}</span>
              </div>
              <div style={{ fontSize:26, fontWeight:800, letterSpacing:'-0.6px', color:'#0F1B33', lineHeight:1.05, position:'relative' }}>{k.value}</div>
              <div style={{ fontSize:11.5, color:'#8A94A6', marginTop:5, position:'relative' }}>{k.sub}</div>
            </div>
          ))}
        </div>
      <div style={{ display:'flex',gap:8,marginBottom:14,alignItems:'center',background:'#fff',border:'0.5px solid #E5E7EB',borderRadius:10,padding:'10px 14px',flexWrap:'wrap' }}>
        <input type="text" placeholder="Search campaigns..." value={search} onChange={e=>setSearch(e.target.value)} style={{ padding:'6px 11px',border:'0.5px solid #E5E7EB',borderRadius:7,fontSize:12,fontFamily:'inherit',outline:'none',width:220,background:'#FAFAFA' }}/>
        <div style={{ display:'flex',gap:3 }}>
          {['all','active','paused'].map(s=><button key={s} onClick={()=>setStatusFilter(s)} style={{ padding:'5px 12px',borderRadius:7,border:'0.5px solid #E5E7EB',fontSize:11,fontWeight:500,cursor:'pointer',fontFamily:'inherit',background:statusFilter===s?'#1F3C84':'#fff',color:statusFilter===s?'#fff':'#6B7280' }}>{s.charAt(0).toUpperCase()+s.slice(1)}</button>)}
        </div>
        <div style={{ marginLeft:'auto',display:'flex',alignItems:'center',gap:10,position:'relative' }}>
            <div style={{ fontSize:12,color:'#9CA3AF' }}>{filtered.length} campaigns · avg CTR {accCTRpct.toFixed(2)}% · lifetime CPC ₹{Math.round(lifetimeCPC)}</div>
          </div>
      </div>
      <div style={{ display:'flex',alignItems:'center',gap:8,padding:'9px 14px',marginBottom:14,background:'#FEF9C3',border:'1px solid #FDE68A',borderRadius:10,fontSize:12,color:'#854D0E',fontWeight:500 }}>
        <span style={{ fontSize:14 }}>⚠</span>
        <span>Human QL / AI QL / CPQL columns aren't accurate right now — the CRM sheet source is being fixed. We'll update this note once the data is reliable again.</span>
      </div>
      <div style={{ background:'#fff',border:'0.5px solid #E5E7EB',borderRadius:12,overflow:'hidden' }}>
        <div style={{ display:'grid',gridTemplateColumns:cols,padding:'10px 16px',background:'#F9FAFB',borderBottom:'0.5px solid #E5E7EB',gap:8,alignItems:'center' }}>
          <div style={{ fontSize:11,fontWeight:600,color:'#6B7280' }}>Campaign</div>
          <div style={{ fontSize:11,fontWeight:600,color:'#6B7280' }}>Status</div>
          <div style={{ fontSize:11,fontWeight:600,color:'#6B7280' }}>Signal</div>
          <SH col="spend" lbl="Spend"/><SH col="impressions" lbl="Impressions"/><SH col="clicks" lbl="Clicks"/><SH col="ctr" lbl="CTR"/><SH col="cpl" lbl="CPL (Meta)"/><SH col="cplCrm" lbl="CPL (CRM)"/><SH col="cpql" lbl="CPQL"/><SH col="leads" lbl="Leads"/><SH col="crmLeads" lbl="CRM Leads"/><SH col="humanQL" lbl="Human QL"/><SH col="aiQL" lbl="AI QL"/><SH col="frequency" lbl="Freq"/>
        </div>
        {filtered.length===0?<div style={{ padding:'48px',textAlign:'center',color:'#9CA3AF',fontSize:13 }}>No campaigns match your filters</div>:filtered.map((c,i)=>(
          <div key={c.id||i}>
            <div onClick={()=>setExpanded(expanded===c.id?null:c.id)} style={{ display:'grid',gridTemplateColumns:cols,padding:'11px 16px',borderBottom:'0.5px solid #F3F4F6',gap:8,cursor:'pointer',background:expanded===c.id?'#F9FAFB':'transparent',transition:'background .1s',alignItems:'center' }}>
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:13,fontWeight:600,color:'#111827',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>{c.name}</div>
                <div style={{ fontSize:11,color:'#9CA3AF',marginTop:2 }}>{c.objective?.replace(/_/g,' ')} · {c.created_time?new Date(c.created_time).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'—'}</div>
                <div style={{ marginTop:5,height:3,background:'#F3F4F6',borderRadius:2,overflow:'hidden',width:'90%' }}><div style={{ height:'100%',width:Math.min(100,c.spendShare)+'%',background:'#1F3C84',borderRadius:2 }}/></div>
              </div>
              <div>{sBadge(c.status)}</div><div>{sigBadge(c.signal)}</div>
              <div><div style={{ fontSize:13,fontWeight:600,color:'#111827' }}>{fmtINR(c.spend)}</div><div style={{ fontSize:10,color:'#9CA3AF' }}>{c.spendShare.toFixed(1)}% of total</div></div>
              <div style={{ fontSize:13,color:'#374151' }}>{fmtN(c.impressions)}</div>
              <div style={{ fontSize:13,color:'#374151' }}>{fmtN(c.clicks)}</div>
              <div><div style={{ fontSize:13,color:c.ctr<accCTRpct*0.6?'#1F3C84':'#374151',fontWeight:c.ctr<accCTRpct*0.6?600:400 }}>{c.ctr.toFixed(2)}%</div><div style={{ fontSize:10,color:'#9CA3AF' }}>CPM ₹{Math.round(c.cpm)}</div></div>
              <div style={{ fontSize:13,fontWeight:600,color:cplCol(c.cpl) }}>{c.cpl>0?'₹'+c.cpl.toLocaleString('en-IN'):'—'}</div><div style={{ fontSize:13,fontWeight:600,color:cplCol(c.cplCrm) }}>{c.cplCrm>0?'₹'+c.cplCrm.toLocaleString('en-IN'):'—'}</div><div style={{ fontSize:13,fontWeight:600,color:cplCol(c.cpql) }}>{c.cpql>0?'₹'+c.cpql.toLocaleString('en-IN'):'—'}</div>
              <div style={{ fontSize:13,color:'#374151',fontWeight:500 }}>{c.leads>0?c.leads.toLocaleString('en-IN'):'—'}</div><div style={{ fontSize:13,color:'#374151',fontWeight:500,textAlign:'center' }}>{c.crmLeads!=null?c.crmLeads.toLocaleString('en-IN'):'—'}{c.crmLeads!=null&&(<div style={{ fontSize:10,fontWeight:600,marginTop:2,color:((c.crmLeads-(c.leads||0))>=0?'#4CAE6F':'#1C9FD4') }}>{(c.crmLeads-(c.leads||0))>=0?'+':''}{(c.crmLeads-(c.leads||0)).toLocaleString('en-IN')}</div>)}</div><div style={{ fontSize:13,color:'#374151',fontWeight:500,textAlign:'center' }}>{c.humanQL!=null?c.humanQL.toLocaleString('en-IN'):'—'}</div><div style={{ fontSize:13,color:'#374151',fontWeight:500,textAlign:'center' }}>{c.aiQL!=null?c.aiQL.toLocaleString('en-IN'):'—'}</div>
              <div>{fBadge(c.fatigueLevel)}</div>
            </div>
            {expanded===c.id&&(
              <div style={{ padding:'16px 16px 16px 32px',background:'#F9FAFB',borderBottom:'0.5px solid #E5E7EB' }}>
                <div style={{ display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:10,marginBottom:10 }}>
                  {[{l:'Reach',v:fmtN(c.reach)},{l:'CPC',v:c.cpc>0?'₹'+Math.round(c.cpc):'—'},{l:'CPM',v:c.cpm>0?'₹'+Math.round(c.cpm):'—'},{l:'Conv. Rate',v:c.convRate>0?c.convRate.toFixed(2)+'%':'—'},{l:'Frequency',v:c.frequency>0?c.frequency.toFixed(2):'—',w:c.frequency>3},{l:'Spend Share',v:c.spendShare.toFixed(1)+'%'},{l:'CRM Conv. Rate',v:(c.crmLeads>0&&c.clicks>0)?((c.crmLeads/c.clicks*100).toFixed(2)+'%'):'—'}].map(m=><div key={m.l} style={{ background:'#fff',border:'0.5px solid #E5E7EB',borderRadius:8,padding:'10px 14px' }}><div style={{ fontSize:10,color:'#9CA3AF',fontWeight:600,marginBottom:4 }}>{m.l}</div><div style={{ fontSize:16,fontWeight:700,color:m.w?'#1F3C84':'#111827' }}>{m.v}</div></div>)}
                </div>
                {c.fatigueLevel!=='healthy'&&<div style={{ padding:'10px 14px',background:c.fatigueLevel==='fatigue'?'#FEF2F2':'#FEF9C3',borderRadius:8,fontSize:12,color:c.fatigueLevel==='fatigue'?'#991B1B':'#854D0E',fontWeight:500 }}>{c.fatigueLevel==='fatigue'?'⚠ High frequency ('+c.frequency.toFixed(1)+') — audience fatigued. Refresh creatives or expand targeting.':'⚡ Frequency '+c.frequency.toFixed(1)+' approaching fatigue. Monitor CTR closely.'}</div>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
function copyAdName(e, name) {
  e.stopPropagation()
  if (navigator.clipboard) navigator.clipboard.writeText(name).catch(()=>{})
  const btn = e.currentTarget
  const prevColor = btn.style.color
  btn.style.color = '#4CAE6F'
  setTimeout(()=>{ btn.style.color = prevColor }, 1200)
  let toast = document.getElementById('lq-copy-toast')
  if (!toast) {
    toast = document.createElement('div')
    toast.id = 'lq-copy-toast'
    toast.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#1F3C84;color:#fff;font-size:12px;font-weight:600;padding:8px 16px;border-radius:8px;white-space:nowrap;z-index:9999;box-shadow:0 6px 20px rgba(15,23,42,0.25);pointer-events:none;opacity:0;transform:translateY(6px);transition:opacity .18s ease,transform .18s ease;'
    document.body.appendChild(toast)
  }
  toast.textContent = 'Ad name copied to clipboard'
  clearTimeout(toast._hideT)
  clearTimeout(toast._removeT)
  requestAnimationFrame(()=>{ toast.style.opacity='1'; toast.style.transform='translateY(0)' })
  toast._hideT = setTimeout(()=>{ toast.style.opacity='0'; toast.style.transform='translateY(6px)' }, 1400)
  toast._removeT = setTimeout(()=>{ toast.remove() }, 1700)
}
function CreativesTab({ data }) {
  const { account, lifetimeAccount = {}, ads = [], accountAvgCTR, insightsMap = {}, prevInsightsMap = {}, crmSummary = {} } = data
  const tableScrollRef = useRef(null)
  const [viewMode, setViewMode] = useState('list')
  const PER_PAGE = 12
  const [page, setPage] = useState(1)
  const [adTypeFilter, setAdTypeFilter] = useState('all')
  const [healthFilter, setHealthFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('spend')
  const [adNameSearch, setAdNameSearch] = useState('')
  const [showBackToTop, setShowBackToTop] = useState(false)
  const backTopRef = useRef(null)
  const accSpend = parseFloat(account.spend || 0)
  const accImpr = parseInt(account.impressions || 0)
  const accClicks = parseInt(account.clicks || 0)
  const accLeads = getAction(account.actions, 'lead')
  const accCTRpct = accImpr > 0 ? (accClicks / accImpr * 100) : 0
  const accCPL = accLeads > 0 ? Math.round(accSpend / accLeads) : 0
  const lifetimeSpend = parseFloat(lifetimeAccount.spend || 0)
  const processed = useMemo(() => (ads || []).map(ad => {
    const cur = insightsMap[ad.id] || ad.insights?.data?.[0] || {}
    const prev = prevInsightsMap[ad.id] || {}
    const spend = parseFloat(cur.spend)||0, impressions = parseInt(cur.impressions)||0
    const clicks = parseInt(cur.clicks)||0, reach = parseInt(cur.reach)||0
    const ctr = parseFloat(cur.ctr)||0
    const cpm = parseFloat(cur.cpm)||(impressions>0?spend/impressions*1000:0)
    const cpc = clicks>0?spend/clicks:0, frequency = parseFloat(cur.frequency)||0
    const actions = cur.actions||[], leads = getAction(actions,'lead')
    const cpl = leads>0?Math.round(spend/leads):0
    const cplCrm = ad.crmLeads>0 ? Math.round(spend/ad.crmLeads) : 0
    const totalQL = (ad.humanQL!=null || ad.aiQL!=null) ? ((ad.humanQL||0)+(ad.aiQL||0)) : null
    const cpql = totalQL>0 ? Math.round(spend/totalQL) : 0
    const convRate = clicks>0?(leads/clicks*100):0
    const spendShare = accSpend>0?(spend/accSpend*100):0
    const prevCTR = parseFloat(prev.ctr)||0
    const ctrDelta = prevCTR>0?((ctr-prevCTR)/prevCTR*100):null
    const videoViews = getAction(actions,'video_view')
    const hookRate = impressions>0&&videoViews>0?(videoViews/impressions*100):0
    let fatigueLabel = ad.fatigueLabel||'Healthy'
    if (frequency>4.5) fatigueLabel='High Fatigue'
    else if (frequency>3||(accCTRpct>0&&ctr<accCTRpct*0.55)) fatigueLabel='Moderate'
    else if (!ad.fatigueLabel) fatigueLabel='Healthy'
    const type = ad.adType||(ad.name?.toLowerCase().includes('video')||ad.name?.toLowerCase().includes('reel')?'video':ad.name?.toLowerCase().includes('carousel')?'carousel':'image')
    let score=50
    if (accCTRpct>0) score+=Math.min(25,Math.max(-25,(ctr-accCTRpct)/accCTRpct*25))
    if (frequency>0) score-=Math.min(20,(frequency-1)*5)
    if (cpl>0&&accCPL>0) score+=Math.min(15,Math.max(-15,(accCPL-cpl)/accCPL*15))
    score=Math.round(Math.min(100,Math.max(0,score)))
    return { ...ad, spend, impressions, clicks, reach, ctr, cpm, cpc, frequency, leads, cpl, cplCrm, totalQL, cpql, convRate, spendShare, ctrDelta, videoViews, hookRate, fatigueLabel, type, score }
  }), [ads,insightsMap,prevInsightsMap,accSpend,accCTRpct,accCPL])
  const filtered = useMemo(() => {
    let out=processed
    if (adTypeFilter!=='all') out=out.filter(a=>a.type===adTypeFilter)
    if (statusFilter==='active') out=out.filter(a=>(a.effective_status||a.status)==='ACTIVE')
    else if (statusFilter==='inactive') out=out.filter(a=>(a.effective_status||a.status)!=='ACTIVE')
    if (healthFilter==='healthy') out=out.filter(a=>a.fatigueLabel==='Healthy')
    else if (healthFilter==='moderate') out=out.filter(a=>a.fatigueLabel==='Moderate')
    else if (healthFilter==='fatigue') out=out.filter(a=>a.fatigueLabel==='High Fatigue')
    if (adNameSearch) out=out.filter(a=>a.name?.toLowerCase().includes(adNameSearch.toLowerCase()))
    return [...out].sort((a,b)=>sortBy==='score'?b.score-a.score:(b[sortBy]||0)-(a[sortBy]||0))
  }, [processed,adTypeFilter,statusFilter,healthFilter,adNameSearch,sortBy])
  const exportRows = useMemo(() => filtered.map(ad => ({
    Creative: ad.name || '',
    Leads: ad.leads || 0,
    'CRM Leads': ad.crmLeads != null ? ad.crmLeads : '',
    Delta: ad.crmLeads != null ? (ad.crmLeads - (ad.leads || 0)) : '',
    'Total QLs': ad.totalQL != null ? ad.totalQL : '',
    'Human QL': ad.humanQL != null ? ad.humanQL : '', 'AI QL': ad.aiQL != null ? ad.aiQL : '',
    'CPL (Meta)': ad.cpl || 0, 'CPL (CRM)': ad.cplCrm || 0,
    CPQL: ad.cpql || 0,
    Type: ad.type || '', Health: ad.fatigueLabel || '',
    Spend: Math.round(ad.spend || 0),
    'CTR %': +(ad.ctr || 0).toFixed(2),
    Freq: +(ad.frequency || 0).toFixed(2), Score: ad.score || 0,
    'WoW CTR %': ad.ctrDelta != null ? +ad.ctrDelta.toFixed(1) : '',
  })), [filtered])
  const filteredTotals = useMemo(() => {
    let spend=0, impressions=0, clicks=0, leads=0, reach=0, active=0, freqSum=0, freqW=0, crmLeads=0, humanQL=0, aiQL=0;
    for (const a of filtered) {
      const sp=parseFloat(a.spend||0), im=parseFloat(a.impressions||0);
      spend += sp;
      impressions += im;
      clicks += parseFloat(a.clicks||0);
      leads += parseFloat(a.leads||0);
      reach += parseFloat(a.reach||0);
      if ((a.effective_status||a.status)==='ACTIVE') active++;
      if (a.crmLeads!=null) { crmLeads += a.crmLeads; }
      if (a.humanQL!=null) { humanQL += a.humanQL; }
      if (a.aiQL!=null) { aiQL += a.aiQL; }
      if (parseFloat(a.frequency||0)>0 && im>0) { freqSum += parseFloat(a.frequency)*im; freqW += im; }
    }
    const noFilter = adTypeFilter==='all' && statusFilter==='all' && healthFilter==='all' && !adNameSearch;
    if (noFilter) { spend = accSpend; impressions = accImpr; clicks = accClicks; leads = accLeads; }
    const cpl = leads>0 ? Math.round(spend/leads) : 0;
    const cplCrm = crmLeads>0 ? Math.round(spend/crmLeads) : 0;
    const totalQL = humanQL + aiQL;
    const cpql = totalQL>0 ? Math.round(spend/totalQL) : 0;
    const ctr = impressions>0 ? (clicks/impressions*100) : 0;
    const cpm = impressions>0 ? (spend/impressions*1000) : 0;
    const cpc = clicks>0 ? (spend/clicks) : 0;
    const frequency = freqW>0 ? (freqSum/freqW) : 0;
    return { spend, impressions, clicks, leads, cpl, cplCrm, crmLeads, humanQL, aiQL, cpql, ctr, reach, cpm, cpc, frequency, active };
  }, [filtered, adTypeFilter, statusFilter, healthFilter, adNameSearch, accSpend, accImpr, accClicks, accLeads])
  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  useEffect(() => { setPage(1) }, [adTypeFilter,healthFilter,adNameSearch,sortBy,viewMode,filtered.length])
  const safePage = Math.min(page, pageCount)
  const pageItems = filtered.slice((safePage-1)*PER_PAGE, safePage*PER_PAGE)
  const summary = useMemo(() => ({
    healthy:processed.filter(a=>a.fatigueLabel==='Healthy').length,
    moderate:processed.filter(a=>a.fatigueLabel==='Moderate').length,
    fatigue:processed.filter(a=>a.fatigueLabel==='High Fatigue').length,
    total:processed.length,
    totalLeads:processed.reduce((s,a)=>s+a.leads,0),
  }),[processed])
  const avgCPL=summary.totalLeads>0?Math.round(accSpend/summary.totalLeads):0
  const kpiStats = useMemo(() => {
    const list = processed || []
    const spendSum = accSpend // account-level headline (matches Campaigns tab)
    const leadsSum = accLeads
    const imprSum = accImpr
    const clicksSum = accClicks
    const activeCount = list.filter(a=>(a.spend||0)>0||(a.impressions||0)>0).length
    const cpl = accCPL
    const cplCrm = (crmSummary.hasCrm && crmSummary.crmTotal>0) ? Math.round(accSpend/crmSummary.crmTotal) : 0
    const humanQLTotal = crmSummary.humanQLTotal || 0
    const aiQLTotal = crmSummary.aiQLTotal || 0
    const totalQL = humanQLTotal + aiQLTotal
    const cpql = totalQL>0 ? Math.round(accSpend/totalQL) : 0
    const ctr = accCTRpct
    return { spendSum, leadsSum, imprSum, clicksSum, activeCount, cpl, cplCrm, humanQLTotal, aiQLTotal, cpql, ctr, total:list.length }
  }, [processed, crmSummary, accSpend])
  const hColor={'Healthy':'#166534','Moderate':'#854D0E','High Fatigue':'#991B1B'}
  const hBg={'Healthy':'#E9F8EF','Moderate':'#FEF9C3','High Fatigue':'#FEF2F2'}
  const tColor={video:'#1D4ED8',image:'#374151',carousel:'#0E93A6'}
  const tBg={video:'#EFF6FF',image:'#F3F4F6',carousel:'#E6FBFC'}
  const cplCol=v=>v>300?'#1F3C84':v>150?'#1C9FD4':v>0?'#4CAE6F':'#9CA3AF'
  const fmtN=n=>n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(0)+'K':String(Math.round(n||0))
  const SB=({score})=>(<div style={{ display:'flex',alignItems:'center',gap:5 }}><div style={{ flex:1,height:4,background:'#F3F4F6',borderRadius:2,overflow:'hidden' }}><div style={{ height:'100%',width:score+'%',background:score>65?'#4CAE6F':score>40?'#F59E0B':'#EF4444',borderRadius:2 }}/></div><span style={{ fontSize:10,fontWeight:700,color:'#6B7280',minWidth:22 }}>{score}</span></div>)
  return (
    <div style={{ fontFamily:"'Plus Jakarta Sans','Inter',sans-serif" }}>
        <div style={{ display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:14,marginBottom:18 }}>
          {[
            { key:'spend', label:'PERIOD SPEND', value:fmtINR(kpiStats.spendSum), sub:((n=>n>=1e7?(n/1e7).toFixed(2)+' Cr':n>=1e5?(n/1e5).toFixed(2)+' L':n>=1e3?(n/1e3).toFixed(1)+'K':String(Math.round(n||0))))(kpiStats.imprSum)+' impressions', c1:'#1C9FD4', c2:'#29B9C3', icon:'₹' },
            { key:'leads', label:'LEADS', value:kpiStats.leadsSum.toLocaleString('en-IN'), sub:'in selected range', c1:'#4CAE6F', c2:'#34D399', icon:'◉' },
            { key:'cpl', label:'CPL', value:kpiStats.cpl>0?'₹'+kpiStats.cpl.toLocaleString('en-IN'):'—', sub:'cost per lead', c1:'#1F3C84', c2:'#3D5BB8', icon:'▲' },
            { key:'creatives', label:'CREATIVES', value:kpiStats.activeCount.toLocaleString('en-IN'), sub:'active of '+kpiStats.total.toLocaleString('en-IN')+' total', c1:'#0E7490', c2:'#22A7BC', icon:'▦' },
            { key:'ctr', label:'AVG CTR', value:kpiStats.ctr.toFixed(2)+'%', sub:kpiStats.clicksSum.toLocaleString('en-IN')+' clicks', c1:'#2563A8', c2:'#1C9FD4', icon:'↗' }, { key:'crm', label:'CRM LEADS', value:(crmSummary.hasCrm?(crmSummary.crmTotal||0).toLocaleString('en-IN'):'—'), sub:(crmSummary.hasCrm?('vs '+(crmSummary.metaLeadsSum||0).toLocaleString('en-IN')+' Meta · '+(((crmSummary.crmTotal||0)-(crmSummary.metaLeadsSum||0))>=0?'+':'')+((crmSummary.crmTotal||0)-(crmSummary.metaLeadsSum||0)).toLocaleString('en-IN')):'no CRM match'), c1:'#1C9FD4', c2:'#29B9C3', icon:'↻' }, { key:'cplCrm', label:'CPL (CRM)', value:kpiStats.cplCrm>0?'₹'+kpiStats.cplCrm.toLocaleString('en-IN'):'—', sub:kpiStats.cpl>0?('vs ₹'+kpiStats.cpl.toLocaleString('en-IN')+' Meta CPL'):'cost per CRM lead', c1:'#1F3C84', c2:'#1C9FD4', icon:'◈' },
            { key:'humanQL', label:'FUTWORK HUMAN QLs', value:kpiStats.humanQLTotal>0?kpiStats.humanQLTotal.toLocaleString('en-IN'):'—', sub:'in selected range, per matched ad', c1:'#4CAE6F', c2:'#29B9C3', icon:'✓' },
            { key:'aiQL', label:'FUTWORK AI QLs', value:kpiStats.aiQLTotal>0?kpiStats.aiQLTotal.toLocaleString('en-IN'):'—', sub:'in selected range, per matched ad', c1:'#29B9C3', c2:'#1C9FD4', icon:'✓' },
            { key:'cpql', label:'CPQL', value:kpiStats.cpql>0?'₹'+kpiStats.cpql.toLocaleString('en-IN'):'—', sub:'cost per qualified lead (Human + AI)', c1:'#1F3C84', c2:'#4CAE6F', icon:'◈' },
          ].map(k => (
            <div key={k.key} style={{ position:'relative', overflow:'hidden', borderRadius:16, padding:'16px 18px', background:'#fff', border:'1px solid #EEF1F6', boxShadow:'0 1px 2px rgba(16,24,40,0.04), 0 8px 24px -12px rgba(16,24,40,0.18)' }}>
              <div style={{ position:'absolute', top:0, left:0, right:0, height:4, background:'linear-gradient(90deg,'+k.c1+','+k.c2+')' }} />
              <div style={{ position:'absolute', top:-28, right:-28, width:96, height:96, borderRadius:'50%', background:'linear-gradient(135deg,'+k.c1+'14,'+k.c2+'05)' }} />
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12, position:'relative' }}>
                <div style={{ width:30, height:30, borderRadius:9, display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, color:'#fff', background:'linear-gradient(135deg,'+k.c1+','+k.c2+')', boxShadow:'0 4px 10px -2px '+k.c1+'66' }}>{k.icon}</div>
                <span style={{ fontSize:10.5, fontWeight:700, letterSpacing:'0.07em', color:'#64748B', textTransform:'uppercase' }}>{k.label}</span>
              </div>
              <div style={{ fontSize:26, fontWeight:800, letterSpacing:'-0.6px', color:'#0F1B33', lineHeight:1.05, position:'relative' }}>{k.value}</div>
              <div style={{ fontSize:11.5, color:'#8A94A6', marginTop:5, position:'relative' }}>{k.sub}</div>
            </div>
          ))}
        </div>
        <div style={{ display:'flex',alignItems:'center',gap:8,padding:'9px 14px',marginBottom:14,background:'#FEF9C3',border:'1px solid #FDE68A',borderRadius:10,fontSize:12,color:'#854D0E',fontWeight:500 }}>
          <span style={{ fontSize:14 }}>⚠</span>
          <span>Human QL / AI QL / CPQL numbers aren't accurate right now — the CRM sheet source is being fixed. We'll update this note once the data is reliable again.</span>
        </div>
      <div style={{ display:'flex',gap:6,marginBottom:14,alignItems:'center',flexWrap:'nowrap',background:'#fff',border:'0.5px solid #E5E7EB',borderRadius:10,padding:'10px 12px' }}>
        <input type="text" placeholder="Search ad name..." value={adNameSearch} onChange={e=>setAdNameSearch(e.target.value)} style={{ padding:'6px 11px',border:'0.5px solid #E5E7EB',borderRadius:7,fontSize:12,fontFamily:'inherit',outline:'none',width:120,minWidth:70,flexShrink:1,background:'#FAFAFA' }}/>
        <div style={{ display:'flex',alignItems:'center',gap:3,borderLeft:'0.5px solid #E5E7EB',paddingLeft:7 }}><span style={{ fontSize:10,fontWeight:600,color:'#9CA3AF',marginRight:4,whiteSpace:'nowrap' }}>Format</span>
          {['all','video','image','carousel'].map(t=><button key={t} onClick={()=>setAdTypeFilter(t)} style={{ padding:'5px 7px',borderRadius:7,border:'0.5px solid #E5E7EB',fontSize:11,fontWeight:500,cursor:'pointer',fontFamily:'inherit',background:adTypeFilter===t?'#1F3C84':'#fff',color:adTypeFilter===t?'#fff':'#6B7280' }}>{t.charAt(0).toUpperCase()+t.slice(1)}</button>)}
        </div>
        <div style={{ display:'flex',alignItems:'center',gap:3,borderLeft:'0.5px solid #E5E7EB',paddingLeft:7 }}><span style={{ fontSize:10,fontWeight:600,color:'#9CA3AF',marginRight:4,whiteSpace:'nowrap' }}>Health</span>
          {[{v:'all',l:'All'},{v:'healthy',l:'Healthy'},{v:'moderate',l:'Moderate'},{v:'fatigue',l:'Fatigue'}].map(h=><button key={h.v} onClick={()=>setHealthFilter(h.v)} style={{ padding:'5px 7px',borderRadius:7,border:'0.5px solid #E5E7EB',fontSize:11,fontWeight:500,cursor:'pointer',fontFamily:'inherit',background:healthFilter===h.v?(h.v==='all'?'#1F3C84':h.v==='healthy'?'#166534':h.v==='moderate'?'#854D0E':'#991B1B'):'#fff',color:healthFilter===h.v?'#fff':'#6B7280' }}>{h.l}</button>)}
        </div>
        <div style={{ display:'flex',alignItems:'center',gap:3,borderLeft:'0.5px solid #E5E7EB',paddingLeft:7 }}><span style={{ fontSize:10,fontWeight:600,color:'#9CA3AF',marginRight:4,whiteSpace:'nowrap' }}>Status</span>
          {[{v:'all',l:'All'},{v:'active',l:'Active'},{v:'inactive',l:'Inactive'}].map(st=><button key={st.v} onClick={()=>setStatusFilter(st.v)} style={{ padding:'5px 7px',borderRadius:7,border:'0.5px solid #E5E7EB',fontSize:11,fontWeight:500,cursor:'pointer',fontFamily:'inherit',background:statusFilter===st.v?(st.v==='active'?'#166534':st.v==='inactive'?'#6B7280':'#1F3C84'):'#fff',color:statusFilter===st.v?'#fff':'#6B7280' }}>{st.l}</button>)}
        </div>
        <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{ padding:'5px 10px',border:'0.5px solid #E5E7EB',borderRadius:7,fontSize:11,fontFamily:'inherit',cursor:'pointer',background:'#fff',color:'#374151',marginLeft:2 }}>
          <option value="spend">Sort: Spend</option><option value="leads">Sort: Leads</option><option value="cpl">Sort: CPL</option><option value="ctr">Sort: CTR</option><option value="frequency">Sort: Frequency</option><option value="score">Sort: Score</option><option value="impressions">Sort: Impressions</option>
        </select>
        <div style={{ marginLeft:'auto',display:'flex',gap:8,alignItems:'center' }}>
          <ExportButton data={exportRows} filename="meta_ads_creatives" />
          {[{m:'grid',l:'⊞ Grid'},{m:'list',l:'☰ List'}].map(v=><button key={v.m} onClick={()=>setViewMode(v.m)} style={{ padding:'5px 10px',borderRadius:7,border:'0.5px solid #E5E7EB',fontSize:11,cursor:'pointer',fontFamily:'inherit',background:viewMode===v.m?'#1F3C84':'#fff',color:viewMode===v.m?'#fff':'#6B7280' }}>{v.l}</button>)}
        </div>
      </div>
      <div style={{ fontSize:12,color:'#9CA3AF',marginBottom:12 }}>{filtered.length} creatives · showing {filtered.length===0?0:((safePage-1)*PER_PAGE+1)}–{Math.min(safePage*PER_PAGE, filtered.length)} · account avg CTR {accCTRpct.toFixed(2)}%</div>
        <div style={{ marginBottom:16,padding:'16px 18px',background:'#FFFFFF',border:'1px solid #EEF1F6',borderRadius:16,boxShadow:'0 1px 2px rgba(16,24,40,0.04), 0 12px 24px -16px rgba(15,23,42,0.10)' }}>
          <div style={{ fontSize:13,fontWeight:800,color:'#0F1B33',letterSpacing:0,marginBottom:14 }}>Totals for these <span style={{color:'#1C9FD4'}}>{filteredTotals && filtered.length}</span> creatives</div><div style={{ display:'grid',gridTemplateColumns:'repeat(15, minmax(0, 1fr))',gap:6 }}>
          {[
            { label:'SPEND', value:fmtINR(filteredTotals.spend), accent:'#1C9FD4' },
            { label:'LEADS', value:filteredTotals.leads.toLocaleString('en-IN'), accent:'#4CAE6F' },
            { label:'CPL (META)', value:fmtINR(filteredTotals.cpl), accent:'#1F3C84' },
            { label:'CRM LEADS', value:filteredTotals.crmLeads.toLocaleString('en-IN'), accent:'#1C9FD4' },
            { label:'CPL (CRM)', value:fmtINR(filteredTotals.cplCrm), accent:'#29B9C3' },
            { label:'HUMAN QL', value:filteredTotals.humanQL.toLocaleString('en-IN'), accent:'#4CAE6F' },
            { label:'AI QL', value:filteredTotals.aiQL.toLocaleString('en-IN'), accent:'#29B9C3' },
            { label:'CPQL', value:fmtINR(filteredTotals.cpql), accent:'#1F3C84' },
            { label:'IMPRESSIONS', value:filteredTotals.impressions.toLocaleString('en-IN'), accent:'#29B9C3' },
            { label:'CLICKS', value:filteredTotals.clicks.toLocaleString('en-IN'), accent:'#6B7280' },
            { label:'CTR', value:filteredTotals.ctr.toFixed(2)+'%', accent:'#1F3C84' },
            { label:'CPM', value:fmtINR(filteredTotals.cpm), accent:'#29B9C3' },
            { label:'CPC', value:fmtINR(filteredTotals.cpc), accent:'#1C9FD4' },
            { label:'REACH', value:filteredTotals.reach.toLocaleString('en-IN'), accent:'#4CAE6F' },
            { label:'AVG FREQ', value:filteredTotals.frequency.toFixed(2), accent:'#6B7280' },
          ].map(m => (
            <div key={m.label} style={{ position:'relative',display:'flex',flexDirection:'column',gap:6,minWidth:0,padding:'13px 8px 11px',background:'#FFFFFF',border:'1px solid #ECEEF2',borderRadius:12,boxShadow:'0 1px 2px rgba(16,24,40,0.05)',overflow:'hidden' }}><div style={{ position:'absolute',top:0,left:0,right:0,height:3,background:m.accent }}/>
              <span style={{ display:'flex',alignItems:'center',gap:4,minWidth:0 }}><span style={{ fontSize:9,fontWeight:700,color:'#98A2B3',letterSpacing:0.2,textTransform:'uppercase',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>{m.label}</span></span>
              <span style={{ fontSize:14,fontWeight:800,color:'#101828',whiteSpace:'nowrap',fontVariantNumeric:'tabular-nums',letterSpacing:'-0.02em' }}>{m.value}</span>
            </div>
          ))}
        </div>
      </div>
      {viewMode==='grid'?(
        <div className="lq-stagger" style={{ display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:12 }}>
          {pageItems.map((ad,i)=>(
            <div key={ad.id||i} onClick={()=>window.open(ad.previewLink,'_blank')} style={{ background:'#fff',border:'0.5px solid #E5E7EB',borderRadius:12,overflow:'hidden',cursor:'pointer',transition:'border-color .15s,box-shadow .15s',display:'flex',flexDirection:'column' }} onMouseEnter={e=>{e.currentTarget.style.borderColor='#1F3C84';e.currentTarget.style.boxShadow='0 2px 12px rgba(31,60,132,0.1)'}} onMouseLeave={e=>{e.currentTarget.style.borderColor='#E5E7EB';e.currentTarget.style.boxShadow='none'}}>
              <div style={{ position:'relative',height:130,background:'#F3F4F6',overflow:'hidden' }}>
                {ad.creative?._thumbUrl?<img src={proxyImg(ad.creative._thumbUrl)} alt={ad.name} style={{ width:'100%',height:'100%',objectFit:'cover' }} onError={e=>{e.target.style.display='none'}}/>:<div style={{ width:'100%',height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:4 }}><span style={{ fontSize:28,opacity:0.25 }}>{ad.type==='video'?'▶':ad.type==='carousel'?'▧':'□'}</span><span style={{ fontSize:10,color:'#9CA3AF' }}>{ad.type}</span></div>}
                {ad.previewPlatform && <span style={{position:'absolute',top:8,right:8,padding:'2px 7px',borderRadius:5,background:'rgba(255,255,255,0.92)',fontSize:9,fontWeight:700,color:ad.previewPlatform==='instagram'?'#E1306C':ad.previewPlatform==='facebook'?'#1877F2':'#6B7280',letterSpacing:'0.03em',boxShadow:'0 1px 4px rgba(0,0,0,0.12)',backdropFilter:'blur(4px)',lineHeight:1.6}}>{ad.previewPlatform==='instagram'?'IG':ad.previewPlatform==='facebook'?'FB':'AD LIB'}</span>}
                <span style={{ position:'absolute',top:8,left:8,background:tBg[ad.type]||'#F3F4F6',color:tColor[ad.type]||'#374151',fontSize:9,fontWeight:700,padding:'2px 6px',borderRadius:6,textTransform:'uppercase' }}>{ad.type}</span>
                <div style={{ position:'absolute',bottom:8,left:8,right:8 }}><SB score={ad.score}/></div>
              </div>
              <div style={{ padding:'12px 14px' }}>
                <div style={{ display:'flex',alignItems:'center',gap:6,marginBottom:10 }}>
                  <div style={{ fontSize:12,fontWeight:600,color:'#111827',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',cursor:'text',minWidth:0,flex:1 }} title={ad.name}>{ad.name}</div>
                  <button type="button" onClick={e=>copyAdName(e,ad.name)} title="Copy ad name" style={{ flexShrink:0,border:'none',background:'transparent',cursor:'pointer',fontSize:12,lineHeight:1,padding:2,color:'#94A3B8',display:'inline-flex',alignItems:'center' }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
                </div>
                <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8 }}>
                  {[{l:'Spend',v:fmtINR(ad.spend)},{l:'CPL (Meta)',v:ad.cpl>0?'₹'+ad.cpl.toLocaleString('en-IN'):'—',w:ad.cpl>300},{l:'CPL (CRM)',v:ad.cplCrm>0?'₹'+ad.cplCrm.toLocaleString('en-IN'):'—'},{l:'CTR',v:ad.ctr.toFixed(2)+'%',w:ad.ctr<accCTRpct*0.6&&ad.ctr>0},{l:'Leads',v:ad.leads>0?ad.leads.toLocaleString('en-IN'):'\u2014'},{l:'Human QL',v:ad.humanQL!=null?ad.humanQL.toLocaleString('en-IN'):'—'},{l:'AI QL',v:ad.aiQL!=null?ad.aiQL.toLocaleString('en-IN'):'—'},{l:'CPQL',v:ad.cpql>0?'₹'+ad.cpql.toLocaleString('en-IN'):'—'},{l:'Freq',v:ad.frequency>0?ad.frequency.toFixed(1):'—',w:ad.frequency>3.5},{l:'CPM',v:ad.cpm>0?'₹'+Math.round(ad.cpm):'—'}].map(m=><div key={m.l}><div style={{ fontSize:9,color:'#9CA3AF',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em' }}>{m.l}</div><div style={{ fontSize:13,fontWeight:600,color:m.w?'#1F3C84':'#111827' }}>{m.v}</div></div>)}
                </div>
                {ad.ctrDelta!==null&&<div style={{ fontSize:11,color:ad.ctrDelta>=0?'#4CAE6F':'#1F3C84',marginBottom:6,fontWeight:500 }}>{ad.ctrDelta>=0?'▲':'▼'} CTR {Math.abs(ad.ctrDelta).toFixed(1)}% vs last week</div>}
                <div style={{ padding:'7px 10px',background:'#EFF6FF',borderRadius:7,marginBottom:6 }}><div style={{ fontSize:9,color:'#1D4ED8',fontWeight:600,textTransform:'uppercase',marginBottom:2,letterSpacing:'0.05em' }}>Hook Rate</div><div style={{ fontSize:14,fontWeight:700,color:'#1D4ED8' }}>{ad.hookRate>0?ad.hookRate.toFixed(1)+'%':'\u2014'}</div></div>
                {ad.fatigueLabel!=='Healthy'&&<div style={{ padding:'6px 8px',background:hBg[ad.fatigueLabel],borderRadius:6,fontSize:10,color:hColor[ad.fatigueLabel],lineHeight:1.4 }}>{ad.fatigueLabel==='High Fatigue'?'⚠ Freq '+ad.frequency.toFixed(1)+' — needs refresh':'⚡ Freq '+ad.frequency.toFixed(1)+' — watch closely'}</div>}
              </div>
            </div>
          ))}
        </div>
      ):(
        <>
        <div style={{ display:'flex',justifyContent:'flex-end',gap:6,marginBottom:8 }}>
          <button type="button" onClick={()=>tableScrollRef.current&&tableScrollRef.current.scrollBy({left:-320,behavior:'smooth'})} title="Scroll left" style={{ width:28,height:28,borderRadius:8,border:'0.5px solid #E5E7EB',background:'#fff',color:'#374151',cursor:'pointer',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center' }}>‹</button>
          <button type="button" onClick={()=>tableScrollRef.current&&tableScrollRef.current.scrollBy({left:320,behavior:'smooth'})} title="Scroll right" style={{ width:28,height:28,borderRadius:8,border:'0.5px solid #E5E7EB',background:'#fff',color:'#374151',cursor:'pointer',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center' }}>›</button>
        </div>
        <div ref={tableScrollRef} style={{ background:'#fff',border:'0.5px solid #E5E7EB',borderRadius:12,overflowX:'auto' }}>
          <div style={{ minWidth:1820 }}>
          <div style={{ display:'grid',gridTemplateColumns:'40px 260px 90px 100px 90px 100px 90px 90px 100px 100px 100px 90px 100px 100px 90px 80px 100px 100px',padding:'10px 14px',background:'#F9FAFB',borderBottom:'0.5px solid #E5E7EB',gap:8 }}>
            {['','Creative','Leads','CRM Leads','Δ','Total QLs','Human QL','AI QL','CPL (Meta)','CPL (CRM)','CPQL','Type','Health','Spend','CTR','Freq','Score','WoW CTR'].map(h=><div key={h} style={{ fontSize:11,fontWeight:600,color:'#6B7280',textAlign:(h==='CRM Leads'||h==='Δ'||h==='Total QLs'||h==='Human QL'||h==='AI QL')?'center':'left' }}>{h}</div>)}
          </div>
          {pageItems.map((ad,i)=>(
            <div key={ad.id||i} onClick={()=>window.open(ad.previewLink,'_blank')} style={{ display:'grid',cursor:'pointer',gridTemplateColumns:'40px 260px 90px 100px 90px 100px 90px 90px 100px 100px 100px 90px 100px 100px 90px 80px 100px 100px',padding:'10px 14px',borderBottom:'0.5px solid #F3F4F6',gap:8,alignItems:'center' }}>
              <div style={{ width:32,height:32,borderRadius:6,background:'#F3F4F6',overflow:'hidden',flexShrink:0 }}>{ad.creative?._thumbUrl&&<img src={proxyImg(ad.creative._thumbUrl)} style={{ width:'100%',height:'100%',objectFit:'cover' }} onError={e=>{e.target.style.display='none'}}/>}</div>
              <div style={{ overflow:'hidden' }}><div style={{ display:'flex',alignItems:'center',gap:4 }}><div style={{ fontSize:12,fontWeight:600,color:'#111827',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',cursor:'text',minWidth:0 }} title={ad.name}>{ad.name}</div><button type="button" onClick={e=>copyAdName(e,ad.name)} title="Copy ad name" style={{ flexShrink:0,border:'none',background:'transparent',cursor:'pointer',fontSize:11,lineHeight:1,padding:1,color:'#94A3B8',display:'inline-flex',alignItems:'center' }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button></div><div style={{ fontSize:10,color:'#9CA3AF' }}>{ad.impressions>0?fmtN(ad.impressions)+' impr':'—'}</div></div>
              <div style={{ fontSize:12,color:'#374151' }}>{ad.leads||'—'}</div><div style={{ fontSize:12,color:'#374151',textAlign:'center' }}>{ad.crmLeads==null?'—':ad.crmLeads.toLocaleString('en-IN')}</div><div style={{ fontSize:12,fontWeight:600,textAlign:'center',color:(ad.crmLeads==null?'#9CA3AF':((ad.crmLeads-(ad.leads||0))>=0?'#4CAE6F':'#1C9FD4')) }}>{ad.crmLeads==null?'—':((ad.crmLeads-(ad.leads||0))>=0?'+':'')+(ad.crmLeads-(ad.leads||0)).toLocaleString('en-IN')}</div>
              <div style={{ fontSize:12,fontWeight:600,textAlign:'center',color:'#111827' }}>{ad.totalQL!=null?ad.totalQL.toLocaleString('en-IN'):'—'}</div><div style={{ fontSize:12,color:'#374151',textAlign:'center' }}>{ad.humanQL!=null?ad.humanQL.toLocaleString('en-IN'):'—'}</div><div style={{ fontSize:12,color:'#374151',textAlign:'center' }}>{ad.aiQL!=null?ad.aiQL.toLocaleString('en-IN'):'—'}</div>
              <div style={{ fontSize:12,fontWeight:600,color:cplCol(ad.cpl) }}>{ad.cpl>0?'₹'+ad.cpl:'—'}</div><div style={{ fontSize:12,fontWeight:600,color:cplCol(ad.cplCrm) }}>{ad.cplCrm>0?'₹'+ad.cplCrm:'—'}</div><div style={{ fontSize:12,fontWeight:600,color:cplCol(ad.cpql) }}>{ad.cpql>0?'₹'+ad.cpql:'—'}</div>
              <span style={{ background:tBg[ad.type]||'#F3F4F6',color:tColor[ad.type]||'#374151',fontSize:9,fontWeight:700,padding:'2px 6px',borderRadius:6,textTransform:'uppercase' }}>{ad.type}</span>
              <span style={{ background:hBg[ad.fatigueLabel]||'#E9F8EF',color:hColor[ad.fatigueLabel]||'#166534',fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:8 }}>{ad.fatigueLabel}</span>
              <div style={{ fontSize:12,fontWeight:600,color:'#111827' }}>{fmtINR(ad.spend)}</div>
              <div style={{ fontSize:12,color:ad.ctr<accCTRpct*0.6&&ad.ctr>0?'#1F3C84':'#374151',fontWeight:ad.ctr<accCTRpct*0.6&&ad.ctr>0?600:400 }}>{ad.ctr.toFixed(2)}%</div>
              <div style={{ fontSize:12,color:ad.frequency>4.5?'#1F3C84':ad.frequency>3?'#1C9FD4':'#374151',fontWeight:ad.frequency>3?600:400 }}>{ad.frequency>0?ad.frequency.toFixed(1):'—'}</div>
              <div style={{ display:'flex',alignItems:'center',gap:4 }}><div style={{ width:28,height:4,background:'#F3F4F6',borderRadius:2,overflow:'hidden' }}><div style={{ height:'100%',width:ad.score+'%',background:ad.score>65?'#4CAE6F':ad.score>40?'#F59E0B':'#EF4444',borderRadius:2 }}/></div><span style={{ fontSize:10,color:'#6B7280' }}>{ad.score}</span></div>
              <div style={{ fontSize:11,color:ad.ctrDelta===null?'#9CA3AF':ad.ctrDelta>=0?'#4CAE6F':'#1F3C84',fontWeight:500 }}>{ad.ctrDelta===null?'—':(ad.ctrDelta>=0?'▲':'▼')+Math.abs(ad.ctrDelta).toFixed(1)+'%'}</div>
            </div>
          ))}
          </div>
        </div>
        </>
      )}      {pageCount > 1 && (() => {
        const win = 5
        let start = Math.max(1, safePage - Math.floor(win/2))
        let end = Math.min(pageCount, start + win - 1)
        start = Math.max(1, end - win + 1)
        const nums = []
        for (let n = start; n <= end; n++) nums.push(n)
        const pBtn = (active) => ({ minWidth:32, height:32, padding:'0 10px', borderRadius:8, border: active?'1px solid #1C9FD4':'1px solid #E5E7EB', background: active?'#1C9FD4':'#fff', color: active?'#fff':'#475569', fontFamily:"'Plus Jakarta Sans','Inter',sans-serif", fontSize:13, fontWeight: active?700:600, cursor:'pointer', transition:'all .15s' })
        return (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, marginTop:18, flexWrap:'wrap' }}>
            <button onClick={() => setPage(Math.max(1, safePage-1))} disabled={safePage===1} style={{ ...pBtn(false), opacity: safePage===1?0.45:1, cursor: safePage===1?'not-allowed':'pointer' }}>‹ Prev</button>
            {start > 1 && (<><button onClick={() => setPage(1)} style={pBtn(false)}>1</button>{start > 2 && <span style={{ color:'#94A3B8', padding:'0 2px' }}>…</span>}</>)}
            {nums.map(n => (<button key={n} onClick={() => setPage(n)} style={pBtn(n===safePage)}>{n}</button>))}
            {end < pageCount && (<>{end < pageCount-1 && <span style={{ color:'#94A3B8', padding:'0 2px' }}>…</span>}<button onClick={() => setPage(pageCount)} style={pBtn(false)}>{pageCount}</button></>)}
            <button onClick={() => setPage(Math.min(pageCount, safePage+1))} disabled={safePage===pageCount} style={{ ...pBtn(false), opacity: safePage===pageCount?0.45:1, cursor: safePage===pageCount?'not-allowed':'pointer' }}>Next ›</button>
          </div>
        )
      })()}
    </div>
  )
}
function AskAITab({ data }) {
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
      content: `Hi! I'm **Ask AI** - connected to your Meta Ads ✅\n\n**Last 7 days snapshot:**\n- Spend: ${fmtINR(parseFloat(account.spend||0))} | Impressions: ${parseInt(account.impressions||0).toLocaleString()}\n- Clicks: ${parseInt(account.clicks||0).toLocaleString()} | CTR: ${parseFloat(account.ctr||0).toFixed(2)}%\n- Total Leads: ${leads.toLocaleString()} | ${campaigns.length} campaigns · ${ads.length} ads loaded\n\n**Top 5 campaigns by spend:**\n${topCampaigns}\n\nAsk me anything about your campaigns, creatives, or what actions to take this week.`
    }])
  }, [])

  const buildPrompt = () => `You are Ask AI - the Meta Ads intelligence layer inside Leverage Quantum (Leverage Edu's internal marketing dashboard).

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
    <div className={styles.askAiWrap}>
      <div className={styles.askAiMessages}>
        {messages.map((m,i) => (
          <div key={i} className={m.role==='user'?styles.userMsg:styles.asstMsg}>
            {m.role==='assistant' && (
              <div className={styles.askAiAvatar}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1C9FD4" strokeWidth="2" strokeLinecap="round">
                  <rect x="3" y="3" width="4" height="18" rx="1"/><rect x="10" y="8" width="4" height="13" rx="1"/><rect x="17" y="5" width="4" height="16" rx="1"/>
                </svg>
              </div>
            )}
            <div className={styles.askAiBubble} dangerouslySetInnerHTML={{__html:render(m.content)}}/>
          </div>
        ))}
        {loading && (
          <div className={styles.asstMsg}>
            <div className={styles.askAiAvatar}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1C9FD4" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="4" height="18" rx="1"/><rect x="10" y="8" width="4" height="13" rx="1"/><rect x="17" y="5" width="4" height="16" rx="1"/></svg></div>
            <div className={styles.askAiBubble}><span className={styles.typing}><span/><span/><span/></span></div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>
      <div className={styles.askAiQuickRow}>
        {QUICK.map(p => <button key={p} className={styles.askAiQuickBtn} onClick={()=>send(p)} disabled={loading}>{p}</button>)}
      </div>
      <div className={styles.askAiInputRow}>
        <textarea className={styles.askAiInput} value={input}
          onChange={e=>{setInput(e.target.value);e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,160)+'px'}}
          onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}}
          placeholder="Ask about campaigns, creatives, pixel… (Shift+Enter for new line)"
          disabled={loading} rows={1} style={{resize:'none',overflowY:'auto'}}/>
        <button className={styles.askAiSendBtn} onClick={()=>send()} disabled={loading||!input.trim()}>
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


// ─── TREND TAB (Month on Month / Day on Day) ─ fixed range, ignores global date filter ────
function TrendTab({ token, adAccount, mode }) {
  const [rows, setRows] = useState(null)
  const [trendError, setTrendError] = useState('')
  const [trendLoading, setTrendLoading] = useState(true)
  // Futwork Human/AI QL counts ARE per-day values in the CRM sheet (summed + date-filtered
  // server-side in api/crm-leads.js, same as leads) -- but this tab has no per-ad breakdown at
  // all (Meta insights are fetched at level:'account'), so there is no per-ad row to attach them
  // to. Shown as a single account-wide total for the selected range instead of per-row columns.
  const [qlTotals, setQlTotals] = useState(null)
  useEffect(() => {
    let ok = true
    setTrendLoading(true); setTrendError('')
    const f = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    const today = new Date()
    const since = mode === 'month' ? `${today.getFullYear()}-01-01` : f(new Date(today.getFullYear(), today.getMonth(), 1))
    const until = f(today)
    const timeIncrement = mode === 'month' ? 'monthly' : 1
    ;(async () => {
      try {
        const AD_ACCOUNT_ID = adAccount || DEFAULT_AD_ACCOUNT
        const [ins, crm] = await Promise.all([
          graphGet(`${AD_ACCOUNT_ID}/insights`, token, {
            fields: 'spend,impressions,clicks,ctr,actions',
            time_range: JSON.stringify({ since, until }),
            time_increment: timeIncrement,
            level: 'account'
          }),
          fetch(`/api/crm-leads?since=${since}&until=${until}`).then(r=>r.json()).catch(()=>({byDate:{}}))
        ])
        const byDate = (crm && crm.byDate) || {}
        const humanQLSum = Object.values((crm && crm.humanQL) || {}).reduce((s,v)=>s+(v||0),0)
        const aiQLSum = Object.values((crm && crm.aiQL) || {}).reduce((s,v)=>s+(v||0),0)
        if (ok) setQlTotals({ humanQL: humanQLSum, aiQL: aiQLSum })
        const bucketCrm = {}
        Object.entries(byDate).forEach(([d,n]) => {
          const key = mode === 'month' ? d.slice(0,7) : d
          bucketCrm[key] = (bucketCrm[key]||0) + n
        })
        const list = (ins.data || []).map(row => {
          const dateStart = row.date_start || ''
          const key = mode === 'month' ? dateStart.slice(0,7) : dateStart
          const label = mode === 'month'
            ? new Date(dateStart + 'T00:00:00').toLocaleDateString('en-IN', { month:'long', year:'numeric' })
            : new Date(dateStart + 'T00:00:00').toLocaleDateString('en-IN', { day:'2-digit', month:'short', weekday:'short' })
          const spend = parseFloat(row.spend) || 0
          const impressions = parseInt(row.impressions) || 0
          const clicks = parseInt(row.clicks) || 0
          const ctr = parseFloat(row.ctr) || 0
          const leads = getAction(row.actions, 'lead')
          const cpl = leads > 0 ? Math.round(spend / leads) : 0
          const crmLeads = bucketCrm[key] != null ? bucketCrm[key] : null
          const cplCrm = crmLeads > 0 ? Math.round(spend / crmLeads) : 0
          return { key, label, spend, impressions, clicks, ctr, leads, cpl, crmLeads, cplCrm }
        }).sort((a,b) => a.key < b.key ? 1 : -1)
        if (ok) setRows(list)
      } catch (e) { if (ok) setTrendError(e.message || 'Failed to load') }
      finally { if (ok) setTrendLoading(false) }
    })()
    return () => { ok = false }
  }, [token, adAccount, mode])

  const totals = useMemo(() => {
    if (!rows) return null
    let spend=0, impressions=0, clicks=0, leads=0, crmLeads=0, hasCrm=false
    rows.forEach(r => {
      spend += r.spend; impressions += r.impressions; clicks += r.clicks; leads += r.leads
      if (r.crmLeads != null) { crmLeads += r.crmLeads; hasCrm = true }
    })
    const ctr = impressions > 0 ? (clicks/impressions*100) : 0
    const cpl = leads > 0 ? Math.round(spend/leads) : 0
    const cplCrm = crmLeads > 0 ? Math.round(spend/crmLeads) : 0
    const humanQL = (qlTotals && qlTotals.humanQL) || 0
    const aiQL = (qlTotals && qlTotals.aiQL) || 0
    const totalQL = humanQL + aiQL
    const cpql = totalQL > 0 ? Math.round(spend/totalQL) : 0
    return { spend, impressions, clicks, leads, ctr, cpl, crmLeads: hasCrm?crmLeads:null, cplCrm, humanQL, aiQL, cpql }
  }, [rows, qlTotals])

  const cplCol = v => v>300?'#1F3C84':v>150?'#1C9FD4':v>0?'#4CAE6F':'#6B7280'
  const fmtN = n => n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(0)+'K':String(Math.round(n||0))
  const title = mode === 'month' ? 'Month on Month' : 'Day on Day'
  const rangeLabel = mode === 'month' ? ('Jan '+new Date().getFullYear()+' – present') : 'This month, 1st – today'
  const gridCols = '1.4fr 1fr 1fr 1fr 0.8fr 1fr 1fr 1fr 1fr'

  if (trendError) return <div style={{ padding:40, textAlign:'center', color:'#DC2626', fontSize:13 }}>{trendError}</div>
  if (trendLoading || !rows) return (
    <div style={{ textAlign:'center', padding:60, color:'#9CA3AF' }}>
      <div className={styles.bigSpinner}/>
      <p style={{ marginTop:16, fontSize:13 }}>Loading {title.toLowerCase()} data…</p>
    </div>
  )

  return (
    <div style={{ fontFamily:"'Plus Jakarta Sans','Inter',sans-serif" }}>
      <div style={{ fontSize:12, color:'#9CA3AF', marginBottom:14 }}>{rangeLabel} · fixed range, not affected by the date filter on other tabs</div>
      <div style={{ fontSize:11, color:'#9CA3AF', marginBottom:10, fontStyle:'italic' }}>Futwork Human/AI QLs and CPQL are account-wide totals for the range above (no per-ad breakdown exists at the account level, unlike every other card here).</div>
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 14px', marginBottom:14, background:'#FEF9C3', border:'1px solid #FDE68A', borderRadius:10, fontSize:12, color:'#854D0E', fontWeight:500 }}>
        <span style={{ fontSize:14 }}>⚠</span>
        <span>Futwork Human QLs / AI QLs / CPQL numbers aren't accurate right now — the CRM sheet source is being fixed. We'll update this note once the data is reliable again.</span>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12, marginBottom:16 }}>
        {[
          { label:'TOTAL SPEND', value:fmtINR(totals.spend), c1:'#1C9FD4', c2:'#29B9C3', icon:'₹' },
          { label:'LEADS (META)', value:totals.leads.toLocaleString('en-IN'), c1:'#4CAE6F', c2:'#34D399', icon:'◉' },
          { label:'CPL (META)', value:totals.cpl>0?'₹'+totals.cpl.toLocaleString('en-IN'):'—', c1:'#1F3C84', c2:'#3D5BB8', icon:'▲' },
          { label:'CRM LEADS', value:totals.crmLeads!=null?totals.crmLeads.toLocaleString('en-IN'):'—', c1:'#1C9FD4', c2:'#29B9C3', icon:'↻' },
          { label:'CPL (CRM)', value:totals.cplCrm>0?'₹'+totals.cplCrm.toLocaleString('en-IN'):'—', c1:'#1F3C84', c2:'#1C9FD4', icon:'◈' },
          { label:'AVG CTR', value:totals.ctr.toFixed(2)+'%', c1:'#2563A8', c2:'#1C9FD4', icon:'↗' },
          { label:'FUTWORK HUMAN QLs', value:totals.humanQL>0?totals.humanQL.toLocaleString('en-IN'):'—', c1:'#4CAE6F', c2:'#29B9C3', icon:'✓' },
          { label:'FUTWORK AI QLs', value:totals.aiQL>0?totals.aiQL.toLocaleString('en-IN'):'—', c1:'#29B9C3', c2:'#1C9FD4', icon:'✓' },
          { label:'CPQL', value:totals.cpql>0?'₹'+totals.cpql.toLocaleString('en-IN'):'—', c1:'#1F3C84', c2:'#4CAE6F', icon:'◈' },
        ].map(k => (
          <div key={k.label} style={{ position:'relative', overflow:'hidden', borderRadius:16, padding:'16px 18px', background:'#fff', border:'1px solid #EEF1F6', boxShadow:'0 1px 2px rgba(16,24,40,0.04), 0 8px 24px -12px rgba(16,24,40,0.18)' }}>
            <div style={{ position:'absolute', top:0, left:0, right:0, height:4, background:'linear-gradient(90deg,'+k.c1+','+k.c2+')' }} />
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
              <div style={{ width:26, height:26, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, color:'#fff', background:'linear-gradient(135deg,'+k.c1+','+k.c2+')' }}>{k.icon}</div>
              <span style={{ fontSize:10, fontWeight:700, letterSpacing:'0.06em', color:'#64748B', textTransform:'uppercase' }}>{k.label}</span>
            </div>
            <div style={{ fontSize:22, fontWeight:800, letterSpacing:'-0.5px', color:'#0F1B33' }}>{k.value}</div>
          </div>
        ))}
      </div>
      <div style={{ background:'#fff', border:'0.5px solid #E5E7EB', borderRadius:12, overflow:'hidden' }}>
        <div style={{ display:'grid', gridTemplateColumns:gridCols, padding:'10px 16px', background:'#F9FAFB', borderBottom:'0.5px solid #E5E7EB', gap:8 }}>
          {[mode==='month'?'Month':'Day','Spend','Impressions','Clicks','CTR','Leads (Meta)','CPL (Meta)','CRM Leads','CPL (CRM)'].map(h => (
            <div key={h} style={{ fontSize:11, fontWeight:600, color:'#6B7280' }}>{h}</div>
          ))}
        </div>
        {rows.length===0 ? <div style={{ padding:'40px', textAlign:'center', color:'#9CA3AF', fontSize:13 }}>No data yet</div> : rows.map(r => (
          <div key={r.key} style={{ display:'grid', gridTemplateColumns:gridCols, padding:'11px 16px', borderBottom:'0.5px solid #F3F4F6', gap:8, alignItems:'center' }}>
            <div style={{ fontSize:13, fontWeight:600, color:'#111827' }}>{r.label}</div>
            <div style={{ fontSize:13, color:'#374151' }}>{fmtINR(r.spend)}</div>
            <div style={{ fontSize:13, color:'#374151' }}>{fmtN(r.impressions)}</div>
            <div style={{ fontSize:13, color:'#374151' }}>{fmtN(r.clicks)}</div>
            <div style={{ fontSize:13, color:'#374151' }}>{r.ctr.toFixed(2)}%</div>
            <div style={{ fontSize:13, color:'#374151', fontWeight:500 }}>{r.leads>0?r.leads.toLocaleString('en-IN'):'—'}</div>
            <div style={{ fontSize:13, fontWeight:600, color:cplCol(r.cpl) }}>{r.cpl>0?'₹'+r.cpl.toLocaleString('en-IN'):'—'}</div>
            <div style={{ fontSize:13, color:'#374151', fontWeight:500 }}>{r.crmLeads!=null?r.crmLeads.toLocaleString('en-IN'):'—'}</div>
            <div style={{ fontSize:13, fontWeight:600, color:cplCol(r.cplCrm) }}>{r.cplCrm>0?'₹'+r.cplCrm.toLocaleString('en-IN'):'—'}</div>
          </div>
        ))}
        {rows.length>0 && totals && (
          <div style={{ display:'grid', gridTemplateColumns:gridCols, padding:'12px 16px', background:'#F9FAFB', gap:8, alignItems:'center', borderTop:'1px solid #E5E7EB' }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#0F1B33' }}>Total</div>
            <div style={{ fontSize:13, fontWeight:700, color:'#0F1B33' }}>{fmtINR(totals.spend)}</div>
            <div style={{ fontSize:13, fontWeight:700, color:'#0F1B33' }}>{fmtN(totals.impressions)}</div>
            <div style={{ fontSize:13, fontWeight:700, color:'#0F1B33' }}>{fmtN(totals.clicks)}</div>
            <div style={{ fontSize:13, fontWeight:700, color:'#0F1B33' }}>{totals.ctr.toFixed(2)}%</div>
            <div style={{ fontSize:13, fontWeight:700, color:'#0F1B33' }}>{totals.leads.toLocaleString('en-IN')}</div>
            <div style={{ fontSize:13, fontWeight:700, color:cplCol(totals.cpl) }}>{totals.cpl>0?'₹'+totals.cpl.toLocaleString('en-IN'):'—'}</div>
            <div style={{ fontSize:13, fontWeight:700, color:'#0F1B33' }}>{totals.crmLeads!=null?totals.crmLeads.toLocaleString('en-IN'):'—'}</div>
            <div style={{ fontSize:13, fontWeight:700, color:cplCol(totals.cplCrm) }}>{totals.cplCrm>0?'₹'+totals.cplCrm.toLocaleString('en-IN'):'—'}</div>
          </div>
        )}
      </div>
    </div>
  )
}

// Date preset helper
function getDateRange(preset) {
  const f = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` // local calendar date (avoids UTC off-by-one when local TZ is ahead of UTC)
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


function TokenExpiryBanner({ createdAt }) {
  if (!createdAt) return null
  const daysLeft = 60 - Math.floor((Date.now() - new Date(createdAt)) / 86400000)
  if (daysLeft > 10) return null
  const urgent = daysLeft <= 3
  const bg = urgent ? '#FEF2F2' : '#FFFBEB'
  const border = urgent ? '#FECACA' : '#FDE68A'
  const color = urgent ? '#DC2626' : '#92400E'
  const msg = urgent
    ? 'Meta token expires in ' + daysLeft + (daysLeft === 1 ? ' day' : ' days') + ' - refresh now'
    : 'Meta token expires in ' + daysLeft + ' days - refresh soon'
  return (
    <div style={{ margin:'8px 28px 0',padding:'9px 14px',background:bg,border:'0.5px solid '+border,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'space-between',gap:12 }}>
      <span style={{ fontSize:12,color:color,fontWeight:600 }}>{'\u26a0\ufe0f ' + msg}</span>
      <span style={{ fontSize:11,color:'#6B7280',whiteSpace:'nowrap' }}>developers.facebook.com/tools/explorer - Generate - Paste here</span>
    </div>
  )
}
export default function MetaAdsDashboard() {
  const location  = useLocation()
  const navigate  = useNavigate()
  const activeTab = new URLSearchParams(location.search).get('tab') || 'campaigns'

  const { user } = useAuth()
  const activeUsers = usePresence(user)
  const isViewerRole = user?.role === 'viewer'

  const [token, setToken]           = useState('')
  const [adAccount, setAdAccount]       = useState(() => localStorage.getItem('lq_ad_account') || DEFAULT_AD_ACCOUNT)
  const [adAccounts, setAdAccounts]     = useState([])
  const [accountPickerOpen, setAccountPickerOpen] = useState(false)
  const [loading, setLoading]       = useState(false)
  const [showInfo, setShowInfo] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [pageLoad, setPageLoad]     = useState(true)
  const [error, setError]           = useState('')
  const [data, setData] = useState(() => { try { const c = localStorage.getItem('meta_cache'); if (!c) return null; const pp = JSON.parse(c); return pp && pp.d ? pp.d : null; } catch (e) { return null; } })
  const [crmMap, setCrmMap] = useState(null); // { byName:{adName:leads}, total, ts }
  // Bumped by the page's own Refresh button (see refreshBtn onClick below) so CRM data actually
  // re-fetches on demand -- previously this effect only depended on since/until, which don't change
  // for a fixed preset like "This Month" between clicks, so Refresh silently never touched CRM data
  // at all and stale numbers could persist indefinitely without a full page reload.
  const [crmRefreshNonce, setCrmRefreshNonce] = useState(0)
  useEffect(() => { let ok=true; const since=data&&data.range&&data.range.since; const until=data&&data.range&&data.range.until; const qs=(since&&until)?('?since='+since+'&until='+until+'&_='+Date.now()):('?_='+Date.now()); (async()=>{ try { const r=await fetch('/api/crm-leads'+qs, { cache:'no-store' }); if(!r.ok) return; const j=await r.json(); if(ok && j && j.byName) setCrmMap(j); } catch(e){} })(); return ()=>{ ok=false; }; }, [data&&data.range&&data.range.since, data&&data.range&&data.range.until, crmRefreshNonce]);
  const crmData = useMemo(() => {
    if(!data) return data;
    const byName = (crmMap && crmMap.byName) || {};
    // FW_Human_QL_Count/FW_AI_QL_Count -- all-time, per-ad-name constants (never date-filtered,
    // see api/crm-leads.js). Attached per-ad and rolled up to campaigns exactly like crmLeads.
    const humanQLByName = (crmMap && crmMap.humanQL) || {};
    const aiQLByName = (crmMap && crmMap.aiQL) || {};
    const ads = (data.ads||[]).map(a => {
      const crm = byName[a.name];
      const hq = humanQLByName[a.name]; const aq = aiQLByName[a.name];
      return { ...a, crmLeads: (crm==null?null:crm), humanQL: (hq==null?null:hq), aiQL: (aq==null?null:aq) };
    });
    const byCamp = {}; const byCampHQ = {}; const byCampAQ = {};
    ads.forEach(a => {
      const cid = a.campaign && a.campaign.id; if(cid==null) return;
      if(a.crmLeads!=null) byCamp[cid]=(byCamp[cid]||0)+a.crmLeads;
      if(a.humanQL!=null) byCampHQ[cid]=(byCampHQ[cid]||0)+a.humanQL;
      if(a.aiQL!=null) byCampAQ[cid]=(byCampAQ[cid]||0)+a.aiQL;
    });
    const campaigns = (data.campaigns||[]).map(c => {
      const v = byCamp[c.id]; const hq = byCampHQ[c.id]; const aq = byCampAQ[c.id];
      return { ...c, crmLeads: (v==null?null:v), humanQL: (hq==null?null:hq), aiQL: (aq==null?null:aq) };
    });
    const crmTotal = (crmMap && crmMap.total) || 0;
    let metaLeadsSum=0, matchedCrm=0, adsMatched=0, adsUnmatched=0, humanQLTotal=0, aiQLTotal=0;
    const metaNames = new Set();
    // QL totals summed ONLY over ads currently loaded/matched here (data.ads), not every distinct
    // ad name that has ever appeared in the whole CRM sheet -- humanQLByName/aiQLByName can contain
    // hundreds of ad names outside the current ad set (old ads, other date ranges), and summing all
    // of them produced a KPI total with no relationship to what's actually visible in the table.
    ads.forEach(a => { metaLeadsSum += (a.leads||0); if(a.name) metaNames.add(a.name); if(a.crmLeads!=null){ adsMatched++; matchedCrm += a.crmLeads; } else { adsUnmatched++; } if(a.humanQL!=null) humanQLTotal+=a.humanQL; if(a.aiQL!=null) aiQLTotal+=a.aiQL; });
    let crmNamesNoMeta = 0; Object.keys(byName).forEach(nm => { if(!metaNames.has(nm)) crmNamesNoMeta++; });
    const crmSummary = { crmTotal, matchedCrm, metaLeadsSum, adsMatched, adsUnmatched, crmNamesNoMeta, humanQLTotal, aiQLTotal, since:(crmMap&&crmMap.since)||null, until:(crmMap&&crmMap.until)||null, hasCrm: !!(crmMap && Object.keys(byName).length) };
    return { ...data, ads, campaigns, crmSummary };
  }, [data, crmMap]);
  const [cacheTs, setCacheTs] = useState(() => { try { const c = localStorage.getItem('meta_cache'); if (!c) return null; const pp = JSON.parse(c); return pp && pp.t ? pp.t : null; } catch (e) { return null; } })
  const [tokenExpired, setTokenExpired] = useState(false)
  const [tokenCreatedAt, setTokenCreatedAt] = useState(null)
  const [sdkReady, setSdkReady] = useState(false)
  const [lastSync, setLastSync] = useState(null)
  const [datePreset, setDatePreset] = useState('this_month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo]     = useState('')

  useEffect(() => { const t = setTimeout(() => setPageLoad(false), 8000); return () => clearTimeout(t) }, [])

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

  // On mount: always load token from Supabase (domain-agnostic)
  useEffect(() => {
    loadTokenFromSupabase().then(result => {
      if (result && result.token) { setToken(result.token); setTokenCreatedAt(result.createdAt); fetchAdAccounts(result.token) }
    }).finally(() => setPageLoad(false))
  }, [])

  useEffect(() => { if (token) loadAllData(token, datePreset) }, [token])

  const handleConnect = () => {
    if (!window.FB) { setError('Facebook SDK loading, please wait…'); return }
    setLoading(true); setError('')
    window.FB.login(r => {
      if (r.authResponse?.accessToken) {
        const t = r.authResponse.accessToken
        storeTokenInSupabase(t)
        setToken(t)
        setTokenCreatedAt(new Date().toISOString())
        fetchAdAccounts(t)
      } else { setError('Authorization cancelled. Try pasting token manually.'); setLoading(false) }
    }, { scope: 'ads_read,ads_management,business_management' })
  }

  const handlePaste = (t) => {
    if (!t.trim()) return
    storeTokenInSupabase(t.trim())
    setToken(t.trim())
    setTokenCreatedAt(new Date().toISOString())
  }

  const autoRetryCountRef = useRef(0)
  const loadAllData = async (t, preset = datePreset, fromDate = null, toDate = null, accountOverride = null, isAutoRetry = false) => {
    if (!isAutoRetry) autoRetryCountRef.current = 0
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

      // Fetch top-200-by-spend ad IDs directly via sorted insights (fixes: default /ads page
    // order could omit high-spend ads from the 200-item window, causing missing/mismatched
    // lead numbers for specific high-spend ads). Falls back to unsorted /ads if this fails.
    const topAdsIns = await graphGet(`${AD_ACCOUNT_ID}/insights`, t, {
      fields: 'ad_id,spend',
      level: 'ad',
      time_range: timeRange,
      sort: 'spend_descending',
      limit: 200,
    }).catch(() => ({ data: [] }))
    const topAdIds = (topAdsIns.data || []).map(x => x.ad_id).filter(Boolean)

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
          fields: 'status', limit: 200
        }),
        // Campaigns - use date_preset for nested insights (avoids 400)
        graphGet(`${AD_ACCOUNT_ID}/campaigns`, t, {
          fields: `name,status,objective,created_time,insights${useTimeRange ? `.time_range(${timeRange})` : `.date_preset(${metaPreset})`}{spend,impressions,clicks,ctr,reach,frequency,actions}`,
          limit: 300
        }),
        // Ads + creatives - fetch ALL ads (paginated, progressive)
        // We pass a placeholder promise that resolves on first page, then continues in background
        graphGet(`${AD_ACCOUNT_ID}/ads`, t, {
          fields: 'name,status,effective_status,creative{id,name,video_id,object_story_id,instagram_permalink_url,effective_object_story_id},campaign{id,name}',
          ...(topAdIds.length > 0 ? { filtering: JSON.stringify([{ field: 'id', operator: 'IN', value: topAdIds }]) } : {}),
          limit: 200,
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
          for (let i = 0; i < adIds.length; i += 25) insChunks.push(adIds.slice(i, i + 25))

          // Fetch current + previous period in parallel
          await mapLimit(insChunks, 3, async chunk => {
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
          })
        } catch(e) { console.error('Insights fetch failed:', e.message) }
      }
      const creativeIds = [...new Set(adsRawData.map(a => a.creative?.id).filter(Boolean))]
      let creativeThumbs = {}
      if (creativeIds.length > 0) {
        try {
          const chunks = []
          for (let i = 0; i < creativeIds.length; i += 25) chunks.push(creativeIds.slice(i, i + 25))
          await mapLimit(chunks, 3, async chunk => {
            const qs = new URLSearchParams({
              access_token: t,
              ids: chunk.join(','),
              fields: 'id,thumbnail_url,image_url'
            }).toString()
            const res = await fetch(`https://graph.facebook.com/v19.0?${qs}`)
            const d = await res.json()
            if (d.error) { console.error('Thumb batch error:', d.error.message); return }
            Object.entries(d).forEach(([id, c]) => {
              // Priority: image_url (static) → object_story_spec image → carousel first card → thumbnail_url (video/fallback)
              const spec = c.object_story_spec || {}
              const linkData = spec.link_data || {}
              const videoData = spec.video_data || {}
              const carouselFirst = linkData.child_attachments?.[0]?.image_url || null
              const specImage = linkData.picture || videoData.image_url || spec.photo_data?.url || carouselFirst || null
              creativeThumbs[id] = c.image_url || specImage || c.thumbnail_url || null
            })
          })
        } catch(e) { console.error('Thumb fetch failed:', e.message) }
      }

      // Merge thumbs - video ads use video_data.image_url, static use batch image_url
      const adsWithThumbs = adsRawData.map(ad => {
        const isVideo = !!ad.creative?.video_id
        const spec = ad.creative?.object_story_spec || {}
        const videoImg = spec.video_data?.image_url || null
        const staticImg = creativeThumbs[ad.creative?.id] || null
        // Also check inline adcreatives field if present
        const inlineCreative = ad.adcreatives?.data?.[0] || {}
        const inlineSpec = inlineCreative.object_story_spec || {}
        const inlineImg = inlineCreative.image_url ||
          inlineSpec.link_data?.picture ||
          inlineSpec.video_data?.image_url ||
          inlineSpec.link_data?.child_attachments?.[0]?.image_url ||
          inlineCreative.thumbnail_url || null
        // Carousel: first child attachment image
        const carouselImg = spec.link_data?.child_attachments?.[0]?.image_url || null
        // Final priority chain
        const thumbUrl = isVideo
          ? (videoImg || staticImg || inlineImg)
          : (staticImg || spec.link_data?.picture || carouselImg || inlineImg || videoImg)
        // Smart permaLink: Instagram post → Facebook post → Ads Library
        const igPerma = ad.creative?.instagram_permalink_url || null
        const objectStoryId = ad.creative?.effective_object_story_id || ad.creative?.object_story_id || null
        const fbPostUrl = objectStoryId
          ? (() => {
              const parts = objectStoryId.split('_')
              return parts.length === 2
                ? `https://www.facebook.com/${parts[0]}/posts/${parts[1]}`
                : null
            })()
          : null
        const previewLink = igPerma || fbPostUrl || `https://www.facebook.com/ads/library/?id=${ad.id}`
        const previewPlatform = igPerma ? 'instagram' : fbPostUrl ? 'facebook' : 'library'
        if (!thumbUrl) console.warn('[no thumb]', ad.name, 'creativeId:', ad.creative?.id, 'isVideo:', isVideo, 'spec keys:', Object.keys(spec))
        return {
          ...ad,
          creative: { ...ad.creative, _thumbUrl: thumbUrl || null },
          previewLink,
          previewPlatform
        }
      })

      const __metaPayload = { account, lifetimeAccount, activeCampaignCount, pausedCampaignCount, campaigns: campaigns.data || [], ads: adsWithThumbs, pixels: pixels.data || [], accountAvgCTR, insightsMap, prevInsightsMap, range, preset }
      setData(__metaPayload)
      const __ts = Date.now(); setCacheTs(__ts)
      try { localStorage.setItem('meta_cache', JSON.stringify({ d: __metaPayload, t: __ts })) } catch (e) {}
      setLastSync(new Date())

      // Background: fetch remaining ad pages while user is already browsing
      ;(async () => {
        if (!adsRaw.paging?.next) return
        const mkLink = (ad) => {
          const ig = ad.creative?.instagram_permalink_url || null
          const osId = ad.creative?.effective_object_story_id || ad.creative?.object_story_id || ''
          const parts = osId.split('_')
          const fb = parts.length === 2 ? 'https://www.facebook.com/' + parts[0] + '/posts/' + parts[1] : null
          return ig || fb || 'https://www.facebook.com/ads/library/?id=' + ad.id
        }
        const mkPlat = (ad) => {
          if (ad.creative?.instagram_permalink_url) return 'instagram'
          const osId = ad.creative?.effective_object_story_id || ad.creative?.object_story_id || ''
          return osId.split('_').length === 2 ? 'facebook' : 'library'
        }
        try {
          const fetchWithTimeout = async (url, ms = 15000) => {
            const ctrl = new AbortController()
            const tid = setTimeout(() => ctrl.abort(), ms)
            try { return await fetch(url, { signal: ctrl.signal }) } finally { clearTimeout(tid) }
          }
          let bgPages = 0
          let nextUrl = adsRaw.paging.next
          let allAds = adsRaw.data ? [...adsRaw.data] : []
          while (nextUrl) {
            if (++bgPages > 60) break
            let res, lastErr
            for (let attempt = 0; attempt < 3; attempt++) {
              try { res = await fetchWithTimeout(nextUrl, 15000); break }
              catch (err) { lastErr = err; await new Promise(r => setTimeout(r, 1200 * (attempt + 1))) }
            }
            if (!res) { console.warn("BG ad page timed out, stopping", lastErr && lastErr.message); break }
            const pg = await res.json()
            if (pg.error) break
            allAds = allAds.concat(pg.data || [])
            nextUrl = pg.paging?.next || null
            const moreWithThumbs = allAds.map(ad => ({
              ...ad,
              creative: { ...ad.creative, _thumbUrl: creativeThumbs[ad.creative?.id] || null },
              previewLink: mkLink(ad),
              previewPlatform: mkPlat(ad),
            }))
            setData(prev => prev ? { ...prev, ads: moreWithThumbs } : prev)
          }
        // Fetch insights for ads loaded in background so their spend/metrics appear
        const moreIds = allAds.map(a=>a.id).filter(id=>!(id in insightsMap))
        if (moreIds.length) {
          const moreChunks = []
          for (let i=0;i<moreIds.length;i+=25) moreChunks.push(moreIds.slice(i,i+25))
          const mInsights = { ...insightsMap }, mPrev = { ...prevInsightsMap }
          await mapLimit(moreChunks, 3, async chunk => {
            const [c, p] = await Promise.all([
              graphGet(`${AD_ACCOUNT_ID}/insights`, t, { fields: 'ad_id,spend,impressions,clicks,ctr,reach,frequency,actions', level: 'ad', ...(useTimeRange ? { time_range: timeRange } : { date_preset: metaPreset }), filtering: JSON.stringify([{field:'ad.id',operator:'IN',value:chunk}]), limit: 50 }).catch(()=>({})),
              graphGet(`${AD_ACCOUNT_ID}/insights`, t, { fields: 'ad_id,spend,impressions,clicks,ctr,reach,frequency', level: 'ad', time_range: prevTimeRange, filtering: JSON.stringify([{field:'ad.id',operator:'IN',value:chunk}]), limit: 50 }).catch(()=>({}))
            ])
            ;(c.data || []).forEach(ins => { mInsights[ins.ad_id] = ins })
            ;(p.data || []).forEach(ins => { mPrev[ins.ad_id] = ins })
          })
          setData(prev => prev ? { ...prev, insightsMap: mInsights, prevInsightsMap: mPrev } : prev)
        }
        } catch(e) { console.warn('BG ad page fetch stopped:', e.message) }
      })()
      setDatePreset(preset)
    } catch (e) {
      setError(e.message)
      if (e.message?.includes('190') || e.message?.includes('token') || e.message?.includes('OAuth')) {
        setToken('')
      } else if ((e.message?.includes('too many') || e.message?.includes('reduce') || e.message?.includes('too large')) && autoRetryCountRef.current < 5) {
        autoRetryCountRef.current += 1
        setTimeout(() => { loadAllData(t, preset, fromDate, toDate, accountOverride, true) }, 25000)
      }
    } finally { setLoading(false) }
  }

  const disconnect = () => { setToken(''); setData(null); setError('') }

  const [sending, setSending]   = useState(false)
  const [sendMsg, setSendMsg]   = useState('')

  const sendReport = async () => {
    if (!window.confirm('Send this report by email to ALL configured recipients now? Manage recipients in Settings → Reports.')) return
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
        <TokenExpiryBanner createdAt={tokenCreatedAt} />
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
            <h1 className={styles.pageTitle}>{activeTab === 'creatives' ? 'Meta Creatives' : activeTab === 'mom' ? 'Month on Month' : activeTab === 'dod' ? 'Day on Day' : 'Meta Ads'}</h1>
          </div>
          <div className={styles.headerRight}>
            {/* Active users */}
            {activeUsers.length > 0 && (
              <div style={{display:'flex',alignItems:'center',gap:6,marginRight:4}}>
                <div style={{display:'flex',alignItems:'center'}}>
                  {activeUsers.slice(0, 5).map((u, idx) => (
                    <div key={u.email} title={`${u.name || u.email} (active)`}
                      style={{width:28,height:28,borderRadius:'50%',border:'2px solid #fff',marginLeft:idx===0?0:-8,zIndex:10-idx,position:'relative',overflow:'hidden',background:'#E0E7FF',flexShrink:0,boxShadow:'0 1px 3px rgba(0,0,0,0.15)'}}>
                      {u.picture
                        ? <img src={u.picture} alt={u.name} style={{width:'100%',height:'100%',objectFit:'cover'}} referrerPolicy="no-referrer"/>
                        : <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'#4F46E5'}}>
                            {(u.name || u.email).charAt(0).toUpperCase()}
                          </div>}
                      <div style={{position:'absolute',bottom:1,right:1,width:7,height:7,borderRadius:'50%',background:'#4CAE6F',border:'1.5px solid #fff'}}/>
                    </div>
                  ))}
                </div>
                {activeUsers.length > 1 && (
                  <span style={{fontSize:11,color:'#6B7280',fontWeight:500,whiteSpace:'nowrap'}}>
                    {activeUsers.length} online
                  </span>
                )}
              </div>
            )}
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
          {activeTab!=='mom' && activeTab!=='dod' && (
<div style={{ position:'relative' }}>
            <button type="button" onClick={()=>!loading && setDateOpen(o=>!o)} disabled={loading}
              style={{ display:'flex',alignItems:'center',gap:8,padding:'6px 10px',borderRadius:8,border:'1px solid '+(dateOpen?'#1C9FD4':'#E5E7EB'),background:'#fff',cursor:loading?'not-allowed':'pointer',minWidth:130,justifyContent:'space-between',fontSize:12,fontWeight:600,color:'#0F172A',fontFamily:'inherit',transition:'border .15s' }}>
              <span>{(PRESETS.find(p=>p.id===datePreset)||{}).label || 'Select range'}</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink:0,transform:dateOpen?'rotate(180deg)':'rotate(0deg)',transition:'transform .2s' }}><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            {dateOpen && <div onClick={()=>setDateOpen(false)} style={{ position:'fixed',inset:0,zIndex:150 }}/>}
            {dateOpen && (
              <div style={{ position:'absolute',top:'calc(100% + 6px)',left:0,zIndex:200,minWidth:160,background:'#fff',border:'1px solid #E5E7EB',borderRadius:10,boxShadow:'0 12px 32px -8px rgba(15,23,42,0.22)',padding:4,overflow:'hidden' }}>
                {PRESETS.map(p => (
                  <button key={p.id} type="button" onClick={()=>{ handleDateChange(p.id); setDateOpen(false); }}
                    style={{ display:'flex',alignItems:'center',justifyContent:'space-between',width:'100%',textAlign:'left',padding:'8px 10px',border:'none',borderRadius:7,cursor:'pointer',fontSize:12,fontWeight:datePreset===p.id?700:500,fontFamily:'inherit',color:datePreset===p.id?'#1F3C84':'#374151',background:datePreset===p.id?'#E8EFF9':'transparent',transition:'background .12s' }}
                    onMouseEnter={e=>{ if(datePreset!==p.id) e.currentTarget.style.background='#F3F4F6'; }}
                    onMouseLeave={e=>{ if(datePreset!==p.id) e.currentTarget.style.background='transparent'; }}>
                    <span>{p.label}</span>
                    {datePreset===p.id && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1C9FD4" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                  </button>
                ))}
              </div>
            )}
          </div>
)}
            {datePreset === 'custom_range' && activeTab!=='mom' && activeTab!=='dod' && (
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
            {sendMsg && <span style={{fontSize:12,color:sendMsg.startsWith('✓')?'#4CAE6F':'#DC2626',fontWeight:500}}>{sendMsg}</span>}
            <button className={styles.refreshBtn} onClick={() => { loadAllData(token, datePreset); setCrmRefreshNonce(n=>n+1) }} disabled={loading}
              style={{opacity: loading ? 0.7 : 1}}>
              <span style={{display:'inline-flex', animation: loading ? 'spin .7s linear infinite' : 'none'}}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
              </span>
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
            {!isViewerRole && <button className={styles.disconnectBtn} onClick={disconnect}>Disconnect</button>}
            {activeTab === 'campaigns' && (
              <div style={{ position:'relative' }}>
                <button onClick={()=>setShowInfo(v=>!v)} title='How these metrics are calculated' style={{ width:26,height:26,borderRadius:7,border:'0.5px solid #E5E7EB',background:showInfo?'#E8EFF9':'#fff',color:'#1F3C84',fontSize:13,fontWeight:700,fontStyle:'italic',fontFamily:'Georgia,serif',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>i</button>
                {showInfo&&<div onClick={()=>setShowInfo(false)} style={{ position:'fixed',inset:0,zIndex:150 }}/>}
                {showInfo&&<div style={{ position:'absolute',right:0,top:'calc(100% + 8px)',zIndex:200,width:360,maxHeight:'70vh',overflowY:'auto',background:'#fff',border:'0.5px solid #E5E7EB',borderRadius:12,boxShadow:'0 14px 40px rgba(15,23,42,0.16)',padding:'16px 18px',textAlign:'left',fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
                  <div style={{ fontSize:13,fontWeight:700,color:'#0F172A',marginBottom:3 }}>How these metrics are calculated</div>
                  <div style={{ fontSize:11,color:'#9CA3AF',marginBottom:12 }}>Per campaign, for the selected date range. Source: Meta Marketing API insights.</div>
                  {[
                    ['Spend','Amount spent, straight from Meta (ins.spend).'],
                    ['Impressions','Times the ad was shown (ins.impressions).'],
                    ['Clicks','All clicks on the ad (ins.clicks).'],
                    ['CTR','Click-through rate = Clicks / Impressions × 100. Shown as reported by Meta (ins.ctr).'],
                    ['CPM','Cost per 1,000 impressions = Spend / Impressions × 1000.'],
                    ['CPC','Cost per click = Spend / Clicks.'],
                    ['Reach','Unique people who saw the ad (ins.reach). Frequency = Impressions / Reach.'],
                    ['Frequency','Avg times each person saw the ad (ins.frequency = Impressions / Reach).'],
                    ['Leads','Lead actions from Meta (actions where type = "lead").'],
                    ['CRM Leads','Leads matched from the CRM Google Sheet by exact ad name, for the same date range.'],
                    ['CPL','Cost per lead (Meta) = Spend / Meta Leads.'],
                    ['CPL (CRM)','Cost per CRM lead = Spend / CRM-matched Leads. Shown only where a CRM match exists.'],
                    ['Human QL','Futwork Human QL Count — qualified leads for this ad in the selected date range, from the CRM sheet.'],
                    ['AI QL','Futwork AI QL Count — same as Human QL but for AI-qualified leads.'],
                    ['CPQL','Cost per qualified lead = Spend / (Human QL + AI QL).'],
                    ['Conv. Rate','Leads / Clicks × 100.'],
                    ['CRM Conv. Rate','CRM Leads / Clicks × 100.'],
                    ['Spend Share','This campaign’s Spend / total account Spend × 100.'],
                    ['Signal','Heuristic: "top" if CTR > 1.2× account avg; "low" if CTR < 0.6× avg or (Frequency > 4 and below-avg CTR); else "average".'],
                  ].map(([k,v])=>(
                    <div key={k} style={{ marginBottom:9 }}>
                      <div style={{ fontSize:11.5,fontWeight:700,color:'#1F3C84' }}>{k}</div>
                      <div style={{ fontSize:11.5,color:'#475569',lineHeight:1.45 }}>{v}</div>
                    </div>
                  ))}
                  <div style={{ fontSize:10.5,color:'#9CA3AF',marginTop:8,paddingTop:8,borderTop:'0.5px solid #F1F5F9',lineHeight:1.45 }}>Note: header totals (Impressions, Clicks, Spend, Leads) use Meta’s account-level figures, which can differ by a tiny margin from the sum of individual campaigns due to Meta’s cross-level de-duplication.</div>
                </div>}
              </div>
            )}
          </div>
        </div>

        {error && (data ? (<div className={styles.errorBanner} style={{ background:'#FFF7E6', borderColor:'#F2C744', color:'#8A6100' }}>Showing cached data{cacheTs ? ` from ${new Date(cacheTs).toLocaleString()}` : ''} — live refresh failed (Meta rate limit). Retrying shortly…</div>) : (<div className={styles.errorBanner}>{error}</div>))}

        {loading && !data ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#9CA3AF' }}>
            <div className={styles.bigSpinner}/>
            <p style={{ marginTop: 16, fontSize: 13 }}>Loading Meta Ads data…</p>
          </div>
        ) : data ? (
          <div style={{padding:'18px 28px'}}>
            {activeTab === 'campaigns' && <CampaignsTab data={crmData}/>}
            {activeTab === 'creatives' && <CreativesTab data={crmData}/>}
            {activeTab === 'mom' && <TrendTab token={token} adAccount={adAccount} mode="month"/>}
            {activeTab === 'dod' && <TrendTab token={token} adAccount={adAccount} mode="day"/>}
            {activeTab === 'ask_ai'      && null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
