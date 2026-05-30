import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import { DashboardSkeleton } from '../components/SkeletonLoader'
import styles from './MetaAdsDashboard.module.css'

const APP_ID     = '2314692909338886'
const AD_ACCOUNT = 'act_641914389215638'
const TOKEN_KEY  = 'lq_meta_token'
const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_KEY   = import.meta.env.VITE_GROQ_API_KEY

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
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({ email: 'shivam.sharma@leverageedu.com', token })
    })
  } catch {}
}
async function graphGet(path, token, params = {}) {
  const qs = new URLSearchParams({ access_token: token, ...params }).toString()
  const res = await fetch(`https://graph.facebook.com/v19.0/${path}?${qs}`)
  const d = await res.json()
  if (d.error) throw new Error(d.error.message)
  return d
}

// ─── Fatigue score (reverse-engineered from NeoLook pattern) ─
function computeFatigue(impressions, clicks, ctr, frequency, accountAvgCTR) {
  if (impressions < 50) return { score: 40, label: 'moderate' }
  let score = 25
  if (ctr === 0)                         score += 30
  else if (ctr < accountAvgCTR * 0.5)   score += 20
  else if (ctr < accountAvgCTR)          score += 10
  else                                   score -= 10
  if (frequency > 3) score += Math.round((frequency - 3) * 5)
  score = Math.max(5, Math.min(85, score))
  const label = score < 30 ? 'healthy' : score < 52 ? 'moderate' : 'high'
  return { score: Math.round(score), label }
}

function fmtINR(usd) {
  const n = usd * 83
  if (n >= 1e7) return '₹' + (n/1e7).toFixed(2) + ' Cr'
  if (n >= 1e5) return '₹' + (n/1e5).toFixed(1) + 'L'
  if (n >= 1000) return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
  return '₹' + n.toFixed(0)
}
const getAction = (actions, type) =>
  parseInt(actions?.find(a => a.action_type === type)?.value || 0)

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

// ─── ACCOUNT KPI BAR ──────────────────────────────────────
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
  const { account, campaigns, accountAvgCTR } = data
  const leads = getAction(account.actions, 'lead')

  const kpis = [
    { label:'Total Spend', value: fmtINR(parseFloat(account.spend||0)) },
    { label:'Impressions', value: parseInt(account.impressions||0).toLocaleString() },
    { label:'Clicks', value: parseInt(account.clicks||0).toLocaleString() },
    { label:'Avg CTR', value: parseFloat(account.ctr||0).toFixed(2)+'%' },
    { label:'Avg CPC', value: '₹'+((parseFloat(account.spend||0)*83)/Math.max(1,parseInt(account.clicks||0))).toFixed(0) },
    { label:'Avg CPM', value: '₹'+((parseFloat(account.cpm||0)*83)).toFixed(0) },
    { label:'Total Leads', value: leads.toLocaleString() },
    { label:'Active', value: campaigns.filter(c=>c.status==='ACTIVE').length },
  ]

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

  return (
    <div className={styles.tabContent}>
      <KPIBar kpis={kpis}/>
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
                <div className={styles.metricPair}><span>CPC</span><strong>{spend>0&&parseInt(ins.clicks||0)>0?'₹'+((spend*83)/parseInt(ins.clicks||1)).toFixed(0):'—'}</strong></div>
                <div className={styles.metricPair}><span>Leads</span><strong>{cLeads.toLocaleString()}</strong></div>
              </div>
              {ins.ctr > 0 && (
                <div className={styles.campaignInsight}>
                  {parseFloat(ins.ctr) >= accountAvgCTR
                    ? <><span className={styles.insightGreen}>↗</span> CTR above account average — ready to scale</>
                    : <><span className={styles.insightYellow}>⚠</span> CTR below account average — review targeting</>
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
  const { account, ads, accountAvgCTR } = data
  const [expanded, setExpanded] = useState(null)
  const [viewMode, setViewMode] = useState('grid')

  const kpis = [
    { label:'Total Spend', value: fmtINR(parseFloat(account.spend||0)) },
    { label:'Total Impr', value: parseInt(account.impressions||0).toLocaleString() },
    { label:'Total Clicks', value: parseInt(account.clicks||0).toLocaleString() },
    { label:'Avg CTR', value: parseFloat(account.ctr||0).toFixed(2)+'%' },
    { label:'Avg CPM', value: '₹'+(parseFloat(account.cpm||0)*83).toFixed(0) },
    { label:'Total Ads', value: ads.length },
  ]

  const scoredAds = ads.map(ad => {
    const ins = ad.insights?.data?.[0] || {}
    const impr = parseInt(ins.impressions||0)
    const clks = parseInt(ins.clicks||0)
    const ctr  = parseFloat(ins.ctr||0)
    const freq = parseFloat(ins.frequency||1)
    const imgUrl = ad.creative?.image_url || ad.creative?.thumbnail_url || null
    const { score, label } = computeFatigue(impr, clks, ctr, freq, accountAvgCTR)
    return { ...ad, ins, impr, clks, ctr, freq, score, label, imgUrl }
  }).sort((a, b) => {
    const order = { healthy: 0, moderate: 1, high: 2 }
    if (order[a.label] !== order[b.label]) return order[a.label] - order[b.label]
    return parseFloat(b.ins.spend||0) - parseFloat(a.ins.spend||0)
  })

  const healthCount = {
    healthy:  scoredAds.filter(a => a.label === 'healthy').length,
    moderate: scoredAds.filter(a => a.label === 'moderate').length,
    high:     scoredAds.filter(a => a.label === 'high').length,
  }

  return (
    <div className={styles.tabContent}>
      <KPIBar kpis={kpis}/>

      {/* Health summary bar */}
      <div className={styles.healthBar}>
        <div className={styles.healthBarFill} style={{flex: healthCount.healthy, background:'#4BAE8A'}}/>
        <div className={styles.healthBarFill} style={{flex: healthCount.moderate, background:'#F59E0B'}}/>
        <div className={styles.healthBarFill} style={{flex: healthCount.high || 0.1, background:'#EF4444'}}/>
      </div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,marginBottom:8}}>
        <div style={{display:'flex',gap:16,fontSize:12}}>
          <span style={{color:'#059669',fontWeight:600}}>● {healthCount.healthy} healthy</span>
          <span style={{color:'#D97706',fontWeight:600}}>● {healthCount.moderate} moderate</span>
          <span style={{color:'#DC2626',fontWeight:600}}>● {healthCount.high} high</span>
        </div>
        <div style={{display:'flex',border:'1px solid #E5E7EB',borderRadius:8,overflow:'hidden'}}>
          <button onClick={()=>setViewMode('grid')} style={{padding:'6px 10px',background:viewMode==='grid'?'#F3F4F6':'#fff',border:'none',cursor:'pointer',color:viewMode==='grid'?'#111827':'#9CA3AF'}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          </button>
          <button onClick={()=>setViewMode('list')} style={{padding:'6px 10px',background:viewMode==='list'?'#F3F4F6':'#fff',border:'none',borderLeft:'1px solid #E5E7EB',cursor:'pointer',color:viewMode==='list'?'#111827':'#9CA3AF'}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          </button>
        </div>
      </div>

      {viewMode === 'grid' && <div className={styles.creativeGrid}>
        {scoredAds.map(ad => {
          const isOpen = expanded === ad.id
          const rec = ad.label==='high' ? 'Refresh Creative' : ad.label==='moderate' ? 'Monitor' : 'Keep Running'
          const signal = ad.impr===0 ? 'No impressions in period' : ad.label==='high' ? 'High Creative Fatigue — refresh needed' : ad.ctr < accountAvgCTR ? `Moderate fatigue (score ${ad.score}) — CTR below avg` : `Healthy — CTR above account average`
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
                  <td style={{fontSize:11,color:ad.label==='high'?'#DC2626':ad.label==='moderate'?'#D97706':'#059669',maxWidth:180}}>{ad.label==='high'?'High Fatigue — Refresh':ad.label==='moderate'?'Monitor':'Healthy'}</td>
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
      content: `Hi! I'm **VASU AI** — connected to your Meta Ads ✅\n\n**Last 7 days snapshot:**\n- Spend: ${fmtINR(parseFloat(account.spend||0))} | Impressions: ${parseInt(account.impressions||0).toLocaleString()}\n- Clicks: ${parseInt(account.clicks||0).toLocaleString()} | CTR: ${parseFloat(account.ctr||0).toFixed(2)}%\n- Total Leads: ${leads.toLocaleString()} | ${campaigns.length} campaigns · ${ads.length} ads loaded\n\n**Top 5 campaigns by spend:**\n${topCampaigns}\n\nAsk me anything about your campaigns, creatives, or what actions to take this week.`
    }])
  }, [])

  const buildPrompt = () => `You are VASU AI — the Meta Ads intelligence layer inside Leverage Quantum (Leverage Edu's internal marketing dashboard).

You have access to live Meta Ads data for account act_641914389215638 (last 7 days):
- Spend: ${fmtINR(parseFloat(data.account.spend||0))}
- Impressions: ${parseInt(data.account.impressions||0).toLocaleString()} | Clicks: ${parseInt(data.account.clicks||0).toLocaleString()}
- CTR: ${parseFloat(data.account.ctr||0).toFixed(2)}% | CPM: ₹${(parseFloat(data.account.cpm||0)*83).toFixed(0)}
- Total Leads: ${getAction(data.account.actions,'lead').toLocaleString()}
- ${data.campaigns.length} campaigns, ${data.ads.length} ads

TOP CAMPAIGNS:
${data.campaigns.slice(0,10).map(c=>{const i=c.insights?.data?.[0]||{};return `- ${c.name} | ${c.status} | ${fmtINR(parseFloat(i.spend||0))} | CTR:${parseFloat(i.ctr||0).toFixed(2)}% | Leads:${getAction(i.actions,'lead')}`}).join('\n')}

HIGH FATIGUE ADS (score 50+):
${data.ads.slice(0,5).map(ad=>{const i=ad.insights?.data?.[0]||{};const f=computeFatigue(parseInt(i.impressions||0),parseInt(i.clicks||0),parseFloat(i.ctr||0),parseFloat(i.frequency||1),data.accountAvgCTR);return f.label==='high'?`- ${ad.name} | Score:${f.score} | Spend:${fmtINR(parseFloat(i.spend||0))} | CTR:${parseFloat(i.ctr||0).toFixed(2)}%`:null}).filter(Boolean).join('\n')||'None detected'}

Guidelines: Be concise, lead with the number, always give a specific action. Read-only analyst — never claim to modify campaigns.`

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
    </div>
  )
}

// Date preset helper
function getDateRange(preset) {
  const e = new Date()
  const s = new Date(e)
  if (preset === 'yesterday') {
    e.setDate(e.getDate() - 1); s.setDate(e.getDate())
  } else if (preset === 'last_7d')  { s.setDate(s.getDate() - 7) }
  else if (preset === 'last_14d') { s.setDate(s.getDate() - 14) }
  else if (preset === 'last_30d') { s.setDate(s.getDate() - 30) }
  const f = d => d.toISOString().slice(0, 10)
  return { since: f(s), until: f(e) }
}

// ─── MAIN ─────────────────────────────────────────────────
export default function MetaAdsDashboard() {
  const location  = useLocation()
  const navigate  = useNavigate()
  const activeTab = new URLSearchParams(location.search).get('tab') || 'campaigns'

  const [token, setToken]       = useState(() => localStorage.getItem(TOKEN_KEY) || '')
  const [loading, setLoading]   = useState(false)
  const [pageLoad, setPageLoad] = useState(true)
  const [error, setError]       = useState('')
  const [data, setData]         = useState(null)
  const [sdkReady, setSdkReady] = useState(false)
  const [lastSync, setLastSync] = useState(null)
  const [datePreset, setDatePreset] = useState('last_7d')

  useEffect(() => { setTimeout(() => setPageLoad(false), 600) }, [])

  useEffect(() => {
    window.fbAsyncInit = () => { window.FB.init({ appId: APP_ID, version: 'v19.0', xfbml: false, cookie: true }); setSdkReady(true) }
    if (!document.getElementById('fb-sdk')) {
      const s = document.createElement('script'); s.id = 'fb-sdk'; s.src = 'https://connect.facebook.net/en_US/sdk.js'; s.async = true; document.head.appendChild(s)
    } else if (window.FB) setSdkReady(true)
  }, [])

  useEffect(() => { if (token) loadAllData(token, datePreset) }, [token])

  const handleConnect = () => {
    if (!window.FB) { setError('Facebook SDK loading, please wait…'); return }
    setLoading(true); setError('')
    window.FB.login(r => {
      if (r.authResponse?.accessToken) {
        const t = r.authResponse.accessToken
        localStorage.setItem(TOKEN_KEY, t)
        storeTokenInSupabase(t) // store for scheduled reports
        setToken(t)
      } else { setError('Authorization cancelled. Try pasting token manually.'); setLoading(false) }
    }, { scope: 'ads_read,ads_management,business_management' })
  }

  const handlePaste = (t) => {
    if (!t.trim()) return
    localStorage.setItem(TOKEN_KEY, t.trim())
    storeTokenInSupabase(t.trim())
    setToken(t.trim())
  }

  const loadAllData = async (t, preset = datePreset) => {
    setLoading(true); setError('')
    try {
      const range = getDateRange(preset)
      const timeRange = JSON.stringify(range)

      const [accIns, campaigns, adsRaw, pixels] = await Promise.all([
        graphGet(`${AD_ACCOUNT}/insights`, t, {
          fields: 'spend,impressions,clicks,ctr,cpm,reach,frequency,actions',
          time_range: timeRange, level: 'account'
        }),
        graphGet(`${AD_ACCOUNT}/campaigns`, t, {
          fields: 'name,status,objective,created_time,insights{spend,impressions,clicks,ctr,reach,frequency,actions,cost_per_action_type}',
          limit: 50,
          time_range: timeRange
        }),
        // Fetch ads with BOTH image_url and thumbnail_url for best quality
        graphGet(`${AD_ACCOUNT}/ads`, t, {
          fields: 'name,status,creative{id,name,image_url,thumbnail_url,body,title,object_story_spec},insights{spend,impressions,clicks,ctr,reach,frequency,actions}',
          limit: 100,
          time_range: timeRange
        }),
        graphGet(`${AD_ACCOUNT}/adspixels`, t, { fields: 'id,name,last_fired_time' })
      ])

      const account = accIns.data?.[0] || {}
      const accountAvgCTR = parseFloat(account.ctr || 0)

      setData({ account, campaigns: campaigns.data || [], ads: adsRaw.data || [], pixels: pixels.data || [], accountAvgCTR, range, preset })
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

  const handleDateChange = (preset) => { loadAllData(token, preset) }

  if (pageLoad) return <div className={styles.layout}><Sidebar/><DashboardSkeleton/></div>

  if (!token) return (
    <div className={styles.layout}>
      <Sidebar/>
      <div className={styles.main}>
        <div className={styles.header}>
          <div className={styles.headerLeft}><p className={styles.breadcrumb}>Dashboards / Meta Ads</p><h1 className={styles.pageTitle}>Meta Ads</h1></div>
        </div>
        <ConnectScreen onConnect={handleConnect} onPaste={handlePaste} error={error} loading={loading}/>
      </div>
    </div>
  )

  const PRESETS = [
    { id:'yesterday', label:'Yesterday' },
    { id:'last_7d',   label:'Last 7 days' },
    { id:'last_14d',  label:'Last 14 days' },
    { id:'last_30d',  label:'Last 30 days' },
  ]

  return (
    <div className={styles.layout}>
      <Sidebar/>
      <div className={styles.main}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <p className={styles.breadcrumb}>Dashboards / Meta Ads</p>
            <h1 className={styles.pageTitle}>Meta Ads — {activeTab === 'campaigns' ? 'Campaigns' : activeTab === 'creatives' ? 'Creatives' : 'Campaigns'}</h1>
          </div>
          <div className={styles.headerRight}>
            {/* Date filter */}
            <select value={datePreset} onChange={e => handleDateChange(e.target.value)} className={styles.dateSelect} disabled={loading}>
              {PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            {lastSync && <span className={styles.syncTag}>Synced {lastSync.toLocaleTimeString()}</span>}
            {sendMsg && <span style={{fontSize:12,color:sendMsg.startsWith('✓')?'#059669':'#DC2626',fontWeight:500}}>{sendMsg}</span>}
            <button className={styles.sendReportBtn} onClick={sendReport} disabled={sending||loading||!data}>
              {sending ? '⏳ Sending…' : '✉ Send Report'}
            </button>
            <button className={styles.refreshBtn} onClick={() => loadAllData(token, datePreset)} disabled={loading}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
            <button className={styles.disconnectBtn} onClick={disconnect}>Disconnect</button>
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
