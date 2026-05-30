import { useState, useEffect } from 'react'
import Sidebar from '../components/Sidebar'
import { DashboardSkeleton } from '../components/SkeletonLoader'
import styles from './MetaAdsDashboard.module.css'

const APP_ID     = '2314692909338886'
const AD_ACCOUNT = 'act_641914389215638'
const PIXEL_EVENTS = ['EI_Lead_Last_Click', 'EI_Lead_Qualified', 'EI_ENROLMENT_COMPLETE']
const TOKEN_KEY  = 'lq_meta_token'

// ─── Load Facebook SDK ────────────────────────────────────
function loadFBSDK() {
  return new Promise(resolve => {
    if (window.FB) { resolve(window.FB); return }
    window.fbAsyncInit = () => {
      window.FB.init({ appId: APP_ID, version: 'v19.0', xfbml: false, cookie: true })
      resolve(window.FB)
    }
    if (!document.getElementById('fb-sdk')) {
      const s = document.createElement('script')
      s.id = 'fb-sdk'
      s.src = 'https://connect.facebook.net/en_US/sdk.js'
      s.async = true; s.defer = true
      document.head.appendChild(s)
    }
  })
}

// ─── Graph API ────────────────────────────────────────────
async function graphGet(path, token, params = {}) {
  const qs = new URLSearchParams({ access_token: token, ...params }).toString()
  const res = await fetch(`https://graph.facebook.com/v19.0/${path}?${qs}`)
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data
}

function getDateRange(daysAgo, length = 7) {
  const end = new Date(); end.setDate(end.getDate() - daysAgo)
  const start = new Date(end); start.setDate(start.getDate() - length + 1)
  const fmt = d => d.toISOString().slice(0, 10)
  return { since: fmt(start), until: fmt(end) }
}

function fmtINR(usd) {
  const inr = usd * 83
  if (inr >= 1e7) return '₹' + (inr/1e7).toFixed(2) + ' Cr'
  if (inr >= 1e5) return '₹' + (inr/1e5).toFixed(1) + 'L'
  if (inr >= 1000) return '₹' + inr.toLocaleString('en-IN', { maximumFractionDigits: 0 })
  return '₹' + inr.toFixed(0)
}

// ─── KPI CARD ─────────────────────────────────────────────
function KPI({ label, value, rawValue, rawPrev, sub, color = '#1C9FD4' }) {
  const delta = rawPrev != null && rawPrev > 0 && rawValue != null
    ? ((rawValue - rawPrev) / rawPrev * 100).toFixed(1)
    : null
  return (
    <div className={styles.kpiCard} style={{ borderLeftColor: color }}>
      <p className={styles.kpiLabel}>{label}</p>
      <p className={styles.kpiValue}>{value ?? '—'}</p>
      <div className={styles.kpiBottom}>
        <span className={styles.kpiSub}>{sub}</span>
        {delta !== null && (
          <span className={parseFloat(delta) >= 0 ? styles.up : styles.down}>
            {parseFloat(delta) >= 0 ? '▲' : '▼'}{Math.abs(delta)}%
          </span>
        )}
      </div>
    </div>
  )
}

// ─── PIXEL ROW ────────────────────────────────────────────
function PixelRow({ event, curr, prev }) {
  const delta = prev > 0 ? ((curr - prev) / prev * 100).toFixed(1) : null
  const status = curr === 0 ? 'dead' : prev > 0 && curr < prev * 0.5 ? 'warn' : 'ok'
  return (
    <tr>
      <td><code style={{ fontSize: 12, color: '#111827' }}>{event}</code></td>
      <td style={{ fontWeight: 600, color: '#111827' }}>{curr.toLocaleString()}</td>
      <td style={{ color: '#9CA3AF' }}>{prev.toLocaleString()}</td>
      <td>
        {delta !== null
          ? <span className={parseFloat(delta) >= 0 ? styles.up : styles.down}>
              {parseFloat(delta) >= 0 ? '▲' : '▼'}{Math.abs(delta)}%
            </span>
          : <span style={{ color: '#9CA3AF' }}>—</span>}
      </td>
      <td>
        <span className={`${styles.statusBadge} ${styles['status_' + status]}`}>
          {status === 'ok' ? '● Healthy' : status === 'warn' ? '▲ Warning' : '✕ No fires'}
        </span>
      </td>
    </tr>
  )
}

// ─── MAIN ─────────────────────────────────────────────────
export default function MetaAdsDashboard() {
  const [token, setToken]     = useState(() => localStorage.getItem(TOKEN_KEY) || '')
  const [loading, setLoading] = useState(false)
  const [pageLoad, setPageLoad] = useState(true)
  const [error, setError]     = useState('')
  const [data, setData]       = useState(null)
  const [lastRefresh, setLastRefresh] = useState(null)
  const [sdkReady, setSdkReady] = useState(false)

  useEffect(() => { setTimeout(() => setPageLoad(false), 600) }, [])

  useEffect(() => {
    loadFBSDK().then(() => setSdkReady(true))
  }, [])

  useEffect(() => { if (token) loadData(token) }, [token])

  const [showTokenInput, setShowTokenInput] = useState(false)
  const [manualToken, setManualToken] = useState('')

  const handleConnect = () => {
    if (!window.FB) { setShowTokenInput(true); return }
    setLoading(true); setError('')
    window.FB.login(response => {
      if (response.authResponse?.accessToken) {
        const t = response.authResponse.accessToken
        localStorage.setItem(TOKEN_KEY, t)
        setToken(t)
      } else {
        setError('')
        setLoading(false)
        setShowTokenInput(true)
      }
    }, { scope: 'ads_read,ads_management,business_management' })
  }

  const handleManualToken = () => {
    const t = manualToken.trim()
    if (!t) return
    localStorage.setItem(TOKEN_KEY, t)
    setToken(t)
    setShowTokenInput(false)
  }

  const loadData = async (t) => {
    setLoading(true); setError('')
    try {
      const thisWeek = getDateRange(0, 7)
      const lastWeek = getDateRange(7, 7)

      const [insNow, insPrev, campaigns, pixelsRes] = await Promise.all([
        graphGet(`${AD_ACCOUNT}/insights`, t, {
          fields: 'spend,impressions,clicks,cpm,ctr,actions',
          time_range: JSON.stringify(thisWeek), level: 'account'
        }),
        graphGet(`${AD_ACCOUNT}/insights`, t, {
          fields: 'spend,impressions,clicks,cpm,ctr,actions',
          time_range: JSON.stringify(lastWeek), level: 'account'
        }),
        graphGet(`${AD_ACCOUNT}/campaigns`, t, {
          fields: 'name,status,objective,insights{spend,impressions,clicks}',
          limit: 20,
          date_preset: 'last_7d'
        }),
        graphGet(`${AD_ACCOUNT}/adspixels`, t, { fields: 'id,name,last_fired_time' })
      ])

      const now  = insNow.data?.[0]  || {}
      const prev = insPrev.data?.[0] || {}

      // Helper: get action value by type
      const getAction = (actions, type) =>
        parseInt(actions?.find(a => a.action_type === type)?.value || 0)

      // Map actual Meta action types to our pixel event labels
      const nowActions  = now.actions  || []
      const prevActions = prev.actions || []

      const pixelEvents = {
        'Leads (Total)': {
          curr: getAction(nowActions,  'lead'),
          prev: getAction(prevActions, 'lead'),
        },
        'Pixel Leads': {
          curr: getAction(nowActions,  'offsite_conversion.fb_pixel_lead'),
          prev: getAction(prevActions, 'offsite_conversion.fb_pixel_lead'),
        },
        'Web Leads (Onsite)': {
          curr: getAction(nowActions,  'onsite_web_lead'),
          prev: getAction(prevActions, 'onsite_web_lead'),
        },
      }

      setData({ now, prev, campaigns: campaigns.data || [], pixelEvents, pixel: pixelsRes.data || [], range: thisWeek })
      setLastRefresh(new Date())
    } catch(e) {
      setError(e.message)
      if (e.message?.includes('190') || e.message?.includes('token') || e.message?.includes('OAuth')) {
        localStorage.removeItem(TOKEN_KEY); setToken('')
      }
    } finally { setLoading(false) }
  }

  const disconnect = () => { localStorage.removeItem(TOKEN_KEY); setToken(''); setData(null); setError('') }

  if (pageLoad) return <div className={styles.layout}><Sidebar/><DashboardSkeleton/></div>

  // ── CONNECT SCREEN ────────────────────────────────────
  if (!token) return (
    <div className={styles.layout}>
      <Sidebar/>
      <div className={styles.main}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <p className={styles.breadcrumb}>Dashboards / Meta Ads</p>
            <h1 className={styles.pageTitle}>Meta Ads</h1>
          </div>
        </div>
        <div className={styles.connectWrap}>
          <div className={styles.connectCard}>
            <div className={styles.connectIcon}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="#1877F2"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg>
            </div>
            <h2 className={styles.connectTitle}>Connect Meta Ads</h2>
            <p className={styles.connectDesc}>Authorise Leverage Quantum to access campaign performance, pixel events and spend data.</p>
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
            {!showTokenInput ? <>
              <button className={styles.connectBtn} onClick={handleConnect} disabled={loading || !sdkReady}>
                {loading ? <><span className={styles.spinner}/> Connecting…</>
                  : !sdkReady ? 'Loading SDK…'
                  : <><svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg> Continue with Meta</>
                }
              </button>
              <button onClick={() => setShowTokenInput(true)}
                style={{ background:'none', border:'none', color:'#9CA3AF', fontSize:12, cursor:'pointer', fontFamily:'Inter,sans-serif', marginTop:4 }}>
                Paste access token manually →
              </button>
            </> : <>
              <p style={{ fontSize:12.5, color:'#374151', marginBottom:8, textAlign:'left', fontWeight:500 }}>
                Paste your Meta Access Token
              </p>
              <p style={{ fontSize:11.5, color:'#9CA3AF', marginBottom:10, textAlign:'left', lineHeight:1.5 }}>
                Get it from{' '}
                <a href="https://developers.facebook.com/tools/explorer" target="_blank" rel="noreferrer"
                  style={{ color:'#1877F2' }}>Meta Graph API Explorer</a>
                {' '}→ Get Token → select <code>ads_read</code>
              </p>
              <input type="text"
                placeholder="EAAxxxxxxxxxxxxxxx..."
                value={manualToken}
                onChange={e => setManualToken(e.target.value)}
                style={{ width:'100%', padding:'9px 12px', border:'1px solid #E5E7EB', borderRadius:8, fontSize:12, fontFamily:'monospace', marginBottom:8, boxSizing:'border-box', outline:'none' }}/>
              <button className={styles.connectBtn} onClick={handleManualToken} disabled={!manualToken.trim()}>
                Connect
              </button>
              <button onClick={() => setShowTokenInput(false)}
                style={{ background:'none', border:'none', color:'#9CA3AF', fontSize:12, cursor:'pointer', fontFamily:'Inter,sans-serif', marginTop:4 }}>
                ← Back
              </button>
            </>}
            <p className={styles.connectNote}>Token stored locally in your browser only.</p>
          </div>
        </div>
      </div>
    </div>
  )

  // ── DASHBOARD ─────────────────────────────────────────
  const now  = data?.now  || {}
  const prev = data?.prev || {}
  const spend  = parseFloat(now.spend   || 0)
  const spendP = parseFloat(prev.spend  || 0)
  const impr   = parseInt(now.impressions  || 0)
  const imprP  = parseInt(prev.impressions || 0)
  const clicks = parseInt(now.clicks   || 0)
  const clicksP= parseInt(prev.clicks  || 0)
  const ctr    = parseFloat(now.ctr    || 0)

  return (
    <div className={styles.layout}>
      <Sidebar/>
      <div className={styles.main}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <p className={styles.breadcrumb}>Dashboards / Meta Ads</p>
            <h1 className={styles.pageTitle}>Meta Ads</h1>
          </div>
          <div className={styles.headerRight}>
            {lastRefresh && <span className={styles.syncTag}>Synced {lastRefresh.toLocaleTimeString()}</span>}
            <button className={styles.refreshBtn} onClick={() => loadData(token)} disabled={loading}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
            <button className={styles.disconnectBtn} onClick={disconnect}>Disconnect</button>
          </div>
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        <div className={styles.content}>
          {loading && !data ? (
            <div style={{ textAlign:'center', padding:60, color:'#9CA3AF' }}>
              <div className={styles.bigSpinner}/>
              <p style={{ marginTop:16, fontSize:13 }}>Loading Meta Ads data…</p>
            </div>
          ) : data ? <>
            <p style={{ fontSize:12, color:'#9CA3AF', margin:0 }}>
              Last 7 days: {data.range.since} → {data.range.until} · vs previous 7 days
            </p>

            <div className={styles.kpiGrid}>
              <KPI label="AD SPEND"    value={fmtINR(spend)}           rawValue={spend}  rawPrev={spendP}  sub="INR equiv · last 7d"     color="#6366F1"/>
              <KPI label="IMPRESSIONS" value={impr.toLocaleString()}    rawValue={impr}   rawPrev={imprP}   sub="Total impressions"         color="#1C9FD4"/>
              <KPI label="CLICKS"      value={clicks.toLocaleString()}  rawValue={clicks} rawPrev={clicksP} sub="Link clicks"               color="#10B981"/>
              <KPI label="CTR"         value={ctr.toFixed(2) + '%'}     rawValue={ctr}    rawPrev={parseFloat(prev.ctr||0)} sub="Click-through rate" color="#F59E0B"/>
              <KPI label="CAMPAIGNS"   value={data.campaigns.length}    sub="Total campaigns fetched"       color="#8B5CF6"/>
              <KPI label="PIXEL"       value={data.pixel[0]?.name?.trim() || 'Not found'} sub={data.pixel[0]?.id || '—'} color="#EC4899"/>
            </div>

            {/* Pixel Integrity */}
            <div className={styles.tableWrap}>
              <div className={styles.tableHead}>
                <div>
                  <p className={styles.tableTitle}>Lead Event Report</p>
                  <p className={styles.tableSub}>Event fires — last 7 days vs previous 7 days · {data.pixel[0]?.name?.trim() || 'Pixel'}</p>
                </div>
              </div>
              <table>
                <thead>
                  <tr><th>Event</th><th>This Week</th><th>Last Week</th><th>Change</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {Object.entries(data.pixelEvents).map(([ev, val]) => (
                    <PixelRow key={ev} event={ev} curr={val.curr} prev={val.prev}/>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Campaigns */}
            <div className={styles.tableWrap}>
              <div className={styles.tableHead}>
                <div>
                  <p className={styles.tableTitle}>Campaigns</p>
                  <p className={styles.tableSub}>Last 7 days · {data.campaigns.length} campaigns</p>
                </div>
              </div>
              <div className={styles.tableScroll}>
                <table>
                  <thead>
                    <tr><th>Campaign Name</th><th>Status</th><th>Objective</th><th>Spend</th><th>Impressions</th><th>Clicks</th></tr>
                  </thead>
                  <tbody>
                    {data.campaigns.length === 0
                      ? <tr><td colSpan={6} style={{ textAlign:'center', color:'#9CA3AF', padding:24 }}>No campaigns found for this period</td></tr>
                      : data.campaigns.map(c => {
                        const ins = c.insights?.data?.[0] || {}
                        return (
                          <tr key={c.id}>
                            <td style={{ maxWidth:280, overflow:'hidden', textOverflow:'ellipsis', fontWeight:500, color:'#111827' }} title={c.name}>{c.name}</td>
                            <td><span style={{ fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:20, background:c.status==='ACTIVE'?'#DCFCE7':'#F3F4F6', color:c.status==='ACTIVE'?'#059669':'#9CA3AF' }}>{c.status}</span></td>
                            <td style={{ fontSize:11, color:'#6B7280' }}>{c.objective?.replace(/_/g,' ')}</td>
                            <td>{fmtINR(parseFloat(ins.spend||0))}</td>
                            <td>{parseInt(ins.impressions||0).toLocaleString()}</td>
                            <td>{parseInt(ins.clicks||0).toLocaleString()}</td>
                          </tr>
                        )
                      })
                    }
                  </tbody>
                </table>
              </div>
            </div>
          </> : null}
        </div>
      </div>
    </div>
  )
}
