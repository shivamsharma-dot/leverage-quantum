import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import { DashboardSkeleton } from '../components/SkeletonLoader'
import styles from './MetaAdsDashboard.module.css'

const APP_ID     = '2314692909338886'
const AD_ACCOUNT = 'act_641914389215638'
const PIXEL_EVENTS = ['EI_Lead_Last_Click', 'EI_Lead_Qualified', 'EI_ENROLMENT_COMPLETE']
const TOKEN_KEY  = 'lq_meta_token'

// ─── Meta Graph API helpers ───────────────────────────────
async function graphGet(path, token, params = {}) {
  const qs = new URLSearchParams({ access_token: token, ...params }).toString()
  const res = await fetch(`https://graph.facebook.com/v19.0/${path}?${qs}`)
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data
}

// Get date range strings
function getDateRange(daysAgo, length = 7) {
  const end   = new Date(); end.setDate(end.getDate() - daysAgo)
  const start = new Date(end); start.setDate(start.getDate() - length + 1)
  const fmt = d => d.toISOString().slice(0, 10)
  return { since: fmt(start), until: fmt(end) }
}

function fmt(n) {
  if (!n && n !== 0) return '—'
  if (n >= 1e7) return '₹' + (n/1e7).toFixed(2) + ' Cr'
  if (n >= 1e5) return '₹' + (n/1e5).toFixed(1) + 'L'
  if (n >= 1000) return n.toLocaleString('en-IN')
  return String(n)
}

// ─── CONNECT SCREEN ───────────────────────────────────────
function ConnectScreen({ onConnect, error, loading }) {
  return (
    <div className={styles.connectWrap}>
      <div className={styles.connectCard}>
        <div className={styles.connectIcon}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" fill="#1877F2"/>
          </svg>
        </div>
        <h2 className={styles.connectTitle}>Connect Meta Ads</h2>
        <p className={styles.connectDesc}>
          Authorise Leverage Quantum to access your Meta Ads data —
          campaigns, pixel events, spend and creative performance.
        </p>
        <div className={styles.connectPerms}>
          <p className={styles.connectPermsLabel}>Permissions requested</p>
          {['ads_read', 'ads_management', 'business_management'].map(p => (
            <div key={p} className={styles.connectPerm}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              <code>{p}</code>
            </div>
          ))}
        </div>
        {error && <div className={styles.connectError}>{error}</div>}
        <button className={styles.connectBtn} onClick={onConnect} disabled={loading}>
          {loading
            ? <><span className={styles.spinner}/> Connecting…</>
            : <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg>
                Connect with Meta
              </>
          }
        </button>
        <p className={styles.connectNote}>Only you can see this data. Token stored locally in your browser.</p>
      </div>
    </div>
  )
}

// ─── KPI CARD ─────────────────────────────────────────────
function KPI({ label, value, prev, sub, color = '#1C9FD4' }) {
  const delta = prev != null && prev > 0 ? ((value - prev) / prev * 100).toFixed(1) : null
  return (
    <div className={styles.kpiCard} style={{ borderLeftColor: color }}>
      <p className={styles.kpiLabel}>{label}</p>
      <p className={styles.kpiValue}>{typeof value === 'number' ? fmt(value) : value ?? '—'}</p>
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

// ─── PIXEL EVENT ROW ──────────────────────────────────────
function PixelRow({ event, curr, prev }) {
  const delta = prev > 0 ? ((curr - prev) / prev * 100).toFixed(1) : null
  const status = curr === 0 ? 'dead' : curr < prev * 0.5 ? 'warn' : 'ok'
  return (
    <tr className={styles.pixelRow}>
      <td>
        <div className={styles.pixelName}>{event}</div>
      </td>
      <td className={styles.pixelCount}>{curr.toLocaleString()}</td>
      <td className={styles.pixelCount} style={{ color: '#9CA3AF' }}>{prev.toLocaleString()}</td>
      <td>
        {delta !== null
          ? <span className={parseFloat(delta) >= 0 ? styles.up : styles.down}>
              {parseFloat(delta) >= 0 ? '▲' : '▼'}{Math.abs(delta)}%
            </span>
          : <span style={{ color: '#9CA3AF' }}>—</span>
        }
      </td>
      <td>
        <span className={`${styles.statusBadge} ${styles['status_' + status]}`}>
          {status === 'ok' ? '● Healthy' : status === 'warn' ? '▲ Warning' : '✕ No fires'}
        </span>
      </td>
    </tr>
  )
}

// ─── MAIN DASHBOARD ───────────────────────────────────────
export default function MetaAdsDashboard() {
  const [token, setToken]       = useState(() => localStorage.getItem(TOKEN_KEY) || '')
  const [loading, setLoading]   = useState(false)
  const [pageLoad, setPageLoad] = useState(true)
  const [error, setError]       = useState('')
  const [data, setData]         = useState(null)
  const [lastRefresh, setLastRefresh] = useState(null)

  useEffect(() => { setTimeout(() => setPageLoad(false), 600) }, [])

  useEffect(() => { if (token) loadData(token) }, [token])

  // OAuth popup
  const handleConnect = () => {
    const scope    = 'ads_read,ads_management,business_management'
    const redirect = encodeURIComponent('https://leverage-quantum.vercel.app/meta-callback')
    const url = `https://www.facebook.com/dialog/oauth?client_id=${APP_ID}&redirect_uri=${redirect}&scope=${scope}&response_type=token`
    const popup = window.open(url, 'MetaAuth', 'width=600,height=700,scrollbars=yes')

    // Listen for token from callback page
    const handler = (e) => {
      if (e.origin !== window.location.origin) return
      if (e.data?.type === 'META_TOKEN') {
        const t = e.data.token
        localStorage.setItem(TOKEN_KEY, t)
        setToken(t)
        window.removeEventListener('message', handler)
        popup?.close()
      }
    }
    window.addEventListener('message', handler)
    setLoading(true)
  }

  const loadData = async (t) => {
    setLoading(true); setError('')
    try {
      const thisWeek = getDateRange(0, 7)
      const lastWeek = getDateRange(7, 7)

      // Campaign insights this week
      const [insightsNow, insightsPrev, campaigns, pixelsRes] = await Promise.all([
        graphGet(`${AD_ACCOUNT}/insights`, t, {
          fields: 'spend,impressions,clicks,cpm,ctr,actions',
          time_range: JSON.stringify(thisWeek), level: 'account'
        }),
        graphGet(`${AD_ACCOUNT}/insights`, t, {
          fields: 'spend,impressions,clicks,cpm,ctr',
          time_range: JSON.stringify(lastWeek), level: 'account'
        }),
        graphGet(`${AD_ACCOUNT}/campaigns`, t, {
          fields: 'name,status,objective,daily_budget,lifetime_budget,insights{spend,impressions,clicks,actions}',
          limit: 20
        }),
        graphGet(`${AD_ACCOUNT}/adspixels`, t, {
          fields: 'id,name,last_fired_time'
        }),
      ])

      const now  = insightsNow.data?.[0]  || {}
      const prev = insightsPrev.data?.[0] || {}

      // Pixel event data
      let pixelEvents = {}
      if (pixelsRes.data?.length) {
        const pixelId = pixelsRes.data[0].id
        const [evtNow, evtPrev] = await Promise.all([
          graphGet(`${pixelId}/stats`, t, {
            start_time: Math.floor(new Date(thisWeek.since).getTime()/1000),
            end_time:   Math.floor(new Date(thisWeek.until).getTime()/1000) + 86400,
          }).catch(() => ({ data: [] })),
          graphGet(`${pixelId}/stats`, t, {
            start_time: Math.floor(new Date(lastWeek.since).getTime()/1000),
            end_time:   Math.floor(new Date(lastWeek.until).getTime()/1000) + 86400,
          }).catch(() => ({ data: [] })),
        ])

        // Build event lookup
        const sumEvents = (arr) => {
          const map = {}
          ;(arr.data || []).forEach(d => {
            const name = d.event || d.event_name
            if (name) map[name] = (map[name] || 0) + (parseInt(d.count) || 0)
          })
          return map
        }
        const nowMap  = sumEvents(evtNow)
        const prevMap = sumEvents(evtPrev)
        PIXEL_EVENTS.forEach(ev => {
          pixelEvents[ev] = { curr: nowMap[ev] || 0, prev: prevMap[ev] || 0 }
        })
      }

      // Parse actions for lead count
      const getAction = (actions, type) =>
        parseInt(actions?.find(a => a.action_type === type)?.value || 0)

      setData({
        now, prev,
        pixel: pixelsRes.data || [],
        pixelEvents,
        campaigns: campaigns.data || [],
        range: thisWeek,
      })
      setLastRefresh(new Date())
    } catch (e) {
      setError(e.message)
      if (e.message?.includes('token') || e.message?.includes('OAuth') || e.message?.includes('190')) {
        localStorage.removeItem(TOKEN_KEY)
        setToken('')
      }
    } finally { setLoading(false) }
  }

  const disconnect = () => {
    localStorage.removeItem(TOKEN_KEY)
    setToken(''); setData(null); setError('')
  }

  if (pageLoad) return (
    <div className={styles.layout}><Sidebar/><DashboardSkeleton/></div>
  )

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
        <ConnectScreen onConnect={handleConnect} error={error} loading={loading}/>
      </div>
    </div>
  )

  const now  = data?.now  || {}
  const prev = data?.prev || {}
  const spend    = parseFloat(now.spend    || 0)
  const spendP   = parseFloat(prev.spend   || 0)
  const impr     = parseInt(now.impressions  || 0)
  const imprP    = parseInt(prev.impressions || 0)
  const clicks   = parseInt(now.clicks    || 0)
  const clicksP  = parseInt(prev.clicks   || 0)
  const cpm      = parseFloat(now.cpm     || 0)
  const cpmP     = parseFloat(prev.cpm    || 0)
  const ctr      = parseFloat(now.ctr     || 0)
  const ctrP     = parseFloat(prev.ctr    || 0)

  return (
    <div className={styles.layout}>
      <Sidebar/>
      <div className={styles.main}>

        {/* STICKY HEADER */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <p className={styles.breadcrumb}>Dashboards / Meta Ads</p>
            <h1 className={styles.pageTitle}>Meta Ads</h1>
          </div>
          <div className={styles.headerRight}>
            {lastRefresh && (
              <span className={styles.syncTag}>
                Synced {lastRefresh.toLocaleTimeString()}
              </span>
            )}
            <button className={styles.refreshBtn} onClick={() => loadData(token)} disabled={loading}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
            <button className={styles.disconnectBtn} onClick={disconnect}>Disconnect</button>
          </div>
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        <div className={styles.content}>
          {loading && !data ? (
            <div style={{ textAlign:'center', padding: 60, color: '#9CA3AF' }}>
              <div className={styles.bigSpinner}/>
              <p style={{ marginTop: 16, fontSize: 13 }}>Fetching Meta Ads data…</p>
            </div>
          ) : data ? (
            <>
              {/* Date range label */}
              <p style={{ fontSize: 12, color: '#9CA3AF', marginBottom: -8 }}>
                Last 7 days: {data.range.since} → {data.range.until} · vs previous 7 days
              </p>

              {/* KPI GRID */}
              <div className={styles.kpiGrid}>
                <KPI label="AD SPEND"    value={spend * 83}  prev={spendP * 83}  sub="INR equiv."    color="#6366F1"/>
                <KPI label="IMPRESSIONS" value={impr}        prev={imprP}        sub="Total"         color="#1C9FD4"/>
                <KPI label="CLICKS"      value={clicks}      prev={clicksP}      sub="Link clicks"   color="#10B981"/>
                <KPI label="CPM"         value={cpm}         prev={cpmP}         sub="Cost/1000 impr" color="#F59E0B"/>
                <KPI label="CTR"         value={ctr.toFixed(2) + '%'} prev={null} sub="Click-through rate" color="#EF4444"/>
                <KPI label="PIXEL"       value={data.pixel[0]?.name || '—'} sub={data.pixel[0]?.id || 'No pixel found'} color="#8B5CF6"/>
              </div>

              {/* PIXEL INTEGRITY */}
              <div className={styles.tableWrap}>
                <div className={styles.tableHead}>
                  <div>
                    <p className={styles.tableTitle}>Pixel Integrity Report</p>
                    <p className={styles.tableSub}>Event fire count — last 7 days vs previous 7 days</p>
                  </div>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Event Name</th>
                      <th>This Week</th>
                      <th>Last Week</th>
                      <th>Change</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PIXEL_EVENTS.map(ev => (
                      <PixelRow key={ev} event={ev}
                        curr={data.pixelEvents[ev]?.curr || 0}
                        prev={data.pixelEvents[ev]?.prev || 0}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* CAMPAIGN TABLE */}
              <div className={styles.tableWrap}>
                <div className={styles.tableHead}>
                  <div>
                    <p className={styles.tableTitle}>Campaigns</p>
                    <p className={styles.tableSub}>Top 20 by account · {data.range.since} – {data.range.until}</p>
                  </div>
                </div>
                <div className={styles.tableScroll}>
                  <table>
                    <thead>
                      <tr>
                        <th>Campaign</th>
                        <th>Status</th>
                        <th>Objective</th>
                        <th>Spend</th>
                        <th>Impressions</th>
                        <th>Clicks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.campaigns.map(c => {
                        const ins = c.insights?.data?.[0] || {}
                        return (
                          <tr key={c.id}>
                            <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500, color: '#111827' }}>{c.name}</td>
                            <td>
                              <span style={{
                                fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                                background: c.status === 'ACTIVE' ? '#DCFCE7' : '#F3F4F6',
                                color: c.status === 'ACTIVE' ? '#059669' : '#9CA3AF'
                              }}>{c.status}</span>
                            </td>
                            <td style={{ fontSize: 11, color: '#6B7280' }}>{c.objective?.replace(/_/g, ' ')}</td>
                            <td>₹{((parseFloat(ins.spend || 0)) * 83).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                            <td>{parseInt(ins.impressions || 0).toLocaleString()}</td>
                            <td>{parseInt(ins.clicks || 0).toLocaleString()}</td>
                          </tr>
                        )
                      })}
                      {data.campaigns.length === 0 && (
                        <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9CA3AF', padding: 24 }}>No campaigns found</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
