import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Sidebar from '../components/Sidebar'
import Button from '../components/Button'
import ExportButton from '../components/ExportButton'
import DateRangePicker from '../components/DateRangePicker'
import { InlineLoader } from '../components/SkeletonLoader'
import { toast } from '../components/ToastHost'
import { C, FONT, fmtN, pct, Card, PremKPI, KPI_ICONS } from '../ui/dashboardKit'
import styles from './LeverageCareersDashboard.module.css'

// Separate ad account -- "Leverage Careers" -- distinct from the main Meta Ads
// page's act_641914389215638. Same shared Meta user token (meta_tokens table)
// grants access to both accounts, so no separate Connect flow is needed here:
// if the main Meta Ads page has ever been connected, this page just works.
const AD_ACCOUNT_ID = 'act_1321251219606731'

// ---- Pure calendar-date arithmetic on 'YYYY-MM-DD' strings (Date.UTC keeps
// this immune to local-timezone/DST shifts) -- same pattern as CeoB2CDashboard.
function ist(off) { return new Date(Date.now() + (off || 0) * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) }
function shiftDate(iso, days) {
  const p = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(p[0], p[1] - 1, p[2]))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}
function isoToDate(iso) { if (!iso) return null; const p = iso.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]) }

// ---- Meta Graph fetch helpers (small, self-contained duplicate of
// MetaAdsDashboard.jsx's own -- every other Ads page in this app keeps its
// own copy rather than sharing one giant file). ----
async function loadTokenFromSupabase() {
  try {
    const res = await fetch('/api/meta-token', { credentials: 'include' })
    if (!res.ok) return null
    const data = await res.json()
    return data && data.token ? data.token : null
  } catch { return null }
}
async function graphGet(path, token, params = {}, retries = 3) {
  const qs = new URLSearchParams({ access_token: token, ...params }).toString()
  const res = await fetch(`https://graph.facebook.com/v19.0/${path}?${qs}`)
  const d = await res.json()
  if (d.error) {
    const msg = d.error.message || ''
    const rateLimited = [1, 4, 17, 32, 613].includes(d.error.code) || /reduce|too large|too many/.test(msg)
    if (retries > 0 && rateLimited) {
      await new Promise(r => setTimeout(r, 1200 + Math.random() * 700))
      return graphGet(path, token, params, retries - 1)
    }
    throw new Error(msg)
  }
  return d
}
async function graphGetAll(path, token, params = {}, maxPages = 15) {
  let all = []
  const first = await graphGet(path, token, { ...params, limit: 200 })
  all = first.data || []
  let next = first.paging && first.paging.next
  let page = 0
  while (next && page < maxPages) {
    page++
    try {
      const r = await fetch(next)
      const d = await r.json()
      if (d.error) break
      all = all.concat(d.data || [])
      next = d.paging && d.paging.next
    } catch { break }
  }
  return all
}
function metaLeadsFromActions(actions) {
  if (!Array.isArray(actions)) return 0
  const hit = actions.find(a => a.action_type === 'onsite_conversion.lead_grouped') || actions.find(a => a.action_type === 'lead')
  return hit ? Number(hit.value) || 0 : 0
}
// Ad name <-> BigQuery career_campaign_name join key -- exact match, case/whitespace
// insensitive. Same normalization the rest of the app applies for name-based joins.
const normName = s => String(s || '').trim().toLowerCase()

const PRESETS = [
  { id: 'ld', label: 'Last Day' },
  { id: 'l7d', label: 'Last 7D' },
  { id: 'mtd', label: 'MTD' },
]

export default function LeverageCareersDashboard() {
  const [preset, setPreset] = useState('mtd')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [customOpen, setCustomOpen] = useState(false)

  const [token, setToken] = useState(null)
  const [tokenChecked, setTokenChecked] = useState(false)
  const [ads, setAds] = useState(null)
  const [bqRows, setBqRows] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [synced, setSynced] = useState(null)

  const d1 = ist(0)
  const activeWindow = useMemo(() => {
    if (preset === 'ld') return { from: shiftDate(d1, -1), to: shiftDate(d1, -1) }
    if (preset === 'l7d') return { from: shiftDate(d1, -7), to: shiftDate(d1, -1) }
    if (preset === 'custom' && customFrom && customTo) {
      return customFrom <= customTo ? { from: customFrom, to: customTo } : { from: customTo, to: customFrom }
    }
    return { from: d1.slice(0, 8) + '01', to: d1 } // mtd
  }, [preset, d1, customFrom, customTo])

  const windowLabel = preset === 'ld' ? 'Last Day' : preset === 'l7d' ? 'Last 7D' : preset === 'custom' ? (customFrom + ' → ' + customTo) : 'MTD'

  useEffect(() => {
    (async () => {
      const t = await loadTokenFromSupabase()
      setToken(t)
      setTokenChecked(true)
    })()
  }, [])

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true); setError('')
    try {
      const timeRange = JSON.stringify({ since: activeWindow.from, until: activeWindow.to })
      const [adInsights, bq] = await Promise.all([
        graphGetAll(`${AD_ACCOUNT_ID}/insights`, token, {
          level: 'ad', time_range: timeRange,
          fields: 'ad_id,ad_name,spend,impressions,clicks,ctr,actions',
        }),
        fetch(`/api/crm-leads?source=bigquery&mode=careers_leads&since=${activeWindow.from}&until=${activeWindow.to}`, { credentials: 'include' }).then(r => r.json()),
      ])
      if (bq && bq.error) throw new Error(bq.error)
      setAds(adInsights || [])
      setBqRows((bq && bq.rows) || [])
      setSynced(new Date())
    } catch (e) {
      setError(e.message || 'Failed to load')
      toast('Leverage Careers: ' + (e.message || 'load failed'), { type: 'muted' })
    } finally {
      setLoading(false)
    }
  }, [token, activeWindow.from, activeWindow.to])

  useEffect(() => { if (token) load() }, [token, activeWindow.from, activeWindow.to]) // eslint-disable-line react-hooks/exhaustive-deps

  const joined = useMemo(() => {
    if (!ads) return []
    const bqMap = new Map()
    ;(bqRows || []).forEach(r => bqMap.set(normName(r.campaign), r))
    const matchedKeys = new Set()
    const rows = ads.map(a => {
      const key = normName(a.ad_name)
      const bq = bqMap.get(key)
      if (bq) matchedKeys.add(key)
      const spend = Number(a.spend) || 0
      const metaLeads = metaLeadsFromActions(a.actions)
      const crmLeads = bq ? Number(bq.total_leads) || 0 : null
      const interested = bq ? Number(bq.total_interested) || 0 : null
      return {
        adId: a.ad_id, name: a.ad_name, spend,
        impressions: Number(a.impressions) || 0, clicks: Number(a.clicks) || 0,
        metaLeads, crmLeads, interested,
        cpl: metaLeads > 0 ? spend / metaLeads : null,
        matched: !!bq,
      }
    })
    const unmatchedCrm = (bqRows || []).filter(r => !matchedKeys.has(normName(r.campaign)))
    return { rows: rows.sort((x, y) => y.spend - x.spend), unmatchedCrm }
  }, [ads, bqRows])

  const totals = useMemo(() => {
    const rows = (joined && joined.rows) || []
    const spend = rows.reduce((s, r) => s + r.spend, 0)
    const metaLeads = rows.reduce((s, r) => s + r.metaLeads, 0)
    const crmLeads = rows.reduce((s, r) => s + (r.crmLeads || 0), 0)
    const interested = rows.reduce((s, r) => s + (r.interested || 0), 0)
    const matchedCount = rows.filter(r => r.matched).length
    const unmatchedCrmLeads = ((joined && joined.unmatchedCrm) || []).reduce((s, r) => s + (Number(r.total_leads) || 0), 0)
    return {
      spend, metaLeads, crmLeads, interested, matchedCount, total: rows.length,
      cpl: metaLeads > 0 ? spend / metaLeads : null,
      cpInterested: interested > 0 ? spend / interested : null,
      unmatchedCrmLeads,
    }
  }, [joined])

  const fmtINR = n => n == null ? '—' : '₹' + Math.round(n).toLocaleString('en-IN')

  const exportRows = useMemo(() => (joined.rows || []).map(r => ({
    'Ad Name': r.name, 'Spend': r.spend, 'Meta Leads': r.metaLeads,
    'CRM Leads': r.crmLeads, 'Interested': r.interested,
    'CPL (Meta)': r.cpl != null ? Math.round(r.cpl) : '', 'Matched': r.matched ? 'Yes' : 'No',
  })), [joined])

  return (
    <div className={styles.layout}>
      <Sidebar />
      <div className={styles.main}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.breadcrumb}>Meta Ads</div>
            <h1 className={styles.pageTitle}>Leverage Careers</h1>
          </div>
          <div className={styles.headerRight}>
            <div className={styles.presetRow}>
              {PRESETS.map(p => (
                <button key={p.id} type="button" className={preset === p.id ? styles.presetPillActive : styles.presetPill} onClick={() => setPreset(p.id)}>{p.label}</button>
              ))}
              <div style={{ position: 'relative' }}>
                <button type="button" className={preset === 'custom' ? styles.presetPillActive : styles.presetPill} onClick={() => { setPreset('custom'); setCustomOpen(true) }}>
                  {preset === 'custom' && customFrom && customTo ? customFrom + ' → ' + customTo : 'Custom range'}
                </button>
                {customOpen ? (
                  <>
                    <div onClick={() => { setCustomOpen(false); if (!(customFrom && customTo)) setPreset('mtd') }} style={{ position: 'fixed', inset: 0, zIndex: 399 }} />
                    <div style={{ position: 'absolute', top: '110%', right: 0, zIndex: 400 }}>
                      <DateRangePicker
                        from={isoToDate(customFrom)} to={isoToDate(customTo)}
                        onChange={(f, t) => { setCustomFrom(f); setCustomTo(t); if (f && t) setCustomOpen(false) }}
                        onClose={() => { setCustomOpen(false); if (!(customFrom && customTo)) setPreset('mtd') }}
                      />
                    </div>
                  </>
                ) : null}
              </div>
            </div>
            {synced ? <span className={styles.note} style={{ margin: 0 }}>Synced {synced.toLocaleTimeString()}</span> : null}
            <Button size="sm" variant="secondary" onClick={load} disabled={loading || !token}>Refresh</Button>
            <ExportButton data={exportRows} filename="leverage_careers" dashboardId="leverage_careers" />
          </div>
        </div>

        <div className={styles.content}>
          {!tokenChecked ? (
            <InlineLoader label="Checking Meta connection" />
          ) : !token ? (
            <div className={styles.connectWrap}>
              <div className={styles.connectTitle}>Meta Ads is not connected yet</div>
              <div className={styles.connectDesc}>
                This page reuses the same Meta connection as the main Meta Ads page --
                connect there first (it grants access to every ad account the signed-in
                Meta user manages, including Leverage Careers).
              </div>
              <a href="/dashboard/meta-ads"><Button variant="primary">Go to Meta Ads</Button></a>
            </div>
          ) : loading && !ads ? (
            <InlineLoader label="Loading Leverage Careers data" />
          ) : error && !ads ? (
            <div className={styles.card}>
              <div className={styles.empty}>{error}</div>
            </div>
          ) : (
            <>
              <div className={styles.kpis}>
                <PremKPI label="SPEND" value={fmtINR(totals.spend)} sub={windowLabel} accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.total} />
                <PremKPI label="META LEADS" value={fmtN(totals.metaLeads)} sub="onsite_conversion.lead_grouped" accent={C.blue} accentBg={C.blueBg} icon={KPI_ICONS.agent} />
                <PremKPI label="CRM LEADS" value={fmtN(totals.crmLeads)} sub={totals.matchedCount + ' of ' + totals.total + ' ads matched'} accent={C.cyan} accentBg={C.cyanBg} icon={KPI_ICONS.bot} />
                <PremKPI label="INTERESTED" value={fmtN(totals.interested)} sub={pct(totals.interested, totals.crmLeads) + ' of CRM leads'} accent={C.green} accentBg={C.greenBg} icon={KPI_ICONS.ai} />
                <PremKPI label="CPL (META)" value={fmtINR(totals.cpl)} sub="spend / Meta leads" accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.globe} />
                <PremKPI label="COST / INTERESTED" value={fmtINR(totals.cpInterested)} sub="spend / interested" accent={C.blue} accentBg={C.blueBg} icon={KPI_ICONS.globe} />
              </div>

              <Card title="Ads ↔ LeadSquared leads" sub={`${windowLabel} · joined by exact ad name = career_campaign_name`}>
                <div style={{ overflowX: 'auto' }}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Ad Name</th>
                        <th>Spend</th>
                        <th>Impr.</th>
                        <th>Clicks</th>
                        <th>Meta Leads</th>
                        <th>CRM Leads</th>
                        <th>Interested</th>
                        <th>CPL (Meta)</th>
                        <th>Matched</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(joined.rows || []).length === 0 ? (
                        <tr><td colSpan={9} className={styles.empty}>No ads with spend in this window.</td></tr>
                      ) : joined.rows.map(r => (
                        <tr key={r.adId}>
                          <td>{r.name}</td>
                          <td>{fmtINR(r.spend)}</td>
                          <td>{fmtN(r.impressions)}</td>
                          <td>{fmtN(r.clicks)}</td>
                          <td>{fmtN(r.metaLeads)}</td>
                          <td>{r.crmLeads == null ? '—' : fmtN(r.crmLeads)}</td>
                          <td>{r.interested == null ? '—' : fmtN(r.interested)}</td>
                          <td>{fmtINR(r.cpl)}</td>
                          <td><span className={r.matched ? styles.badgeYes : styles.badgeNo}>{r.matched ? 'Matched' : 'No match'}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {totals.unmatchedCrmLeads > 0 ? (
                  <p className={styles.note}>
                    {fmtN(totals.unmatchedCrmLeads)} LeadSquared lead(s) in this window carry a campaign name that
                    didn't match any Meta ad with spend in the same window (name changed/removed on Meta, or the
                    campaign predates this range) -- not counted in the table above.
                  </p>
                ) : null}
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
