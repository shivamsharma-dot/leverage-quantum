import React, { useState, useEffect, useMemo, useCallback } from 'react'
import Sidebar from '../components/Sidebar'
import { DashboardSkeleton } from '../components/SkeletonLoader'
import DateRangePicker from '../components/DateRangePicker'
import { C, FONT, Card, PremKPI, fmtN } from '../ui/dashboardKit'

// ---------------------------------------------------------------------------
// Organic & Social -- tracks the same metrics the "IPO Tracker" sheet's
// CC01/CC03/CC05/CC06/CC07 rows ask data owners to type in by hand every
// Monday (website organic users, followers/views/interactions/engagement rate
// across Instagram/LinkedIn/YouTube/X, YouTube watch time) -- computed here
// from live APIs instead, so nobody has to enter it manually.
//
// Two genuinely different kinds of source, split on purpose (per an explicit
// "be strict" ask, not "organic vs social" -- that axis doesn't actually
// separate anything, since Instagram is exactly as day-granular as GA4):
//   API-driven, day-granular (Website/GA4, Instagram x N accounts, YouTube)
//     -- these get the Day/Week/Month/Year comparison toolbar below, each
//     preset showing the current partial period against the SAME elapsed
//     portion of the prior period (matching this app's own MTD-vs-prev-month
//     proration convention elsewhere), with a delta badge per metric.
//   Manual weekly entry (LinkedIn, X) -- typed into Settings once a week.
//     There is no "yesterday" for these to report on; the data itself only
//     ever exists at week granularity, so they keep their own week-by-week
//     browser instead of pretending to answer Day/Month/Year questions the
//     underlying data can't support.
// ---------------------------------------------------------------------------

function mondayOf(d) {
  const x = new Date(d)
  const day = x.getDay() // 0 = Sun .. 6 = Sat
  const diff = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + diff)
  x.setHours(0, 0, 0, 0)
  return x
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function fmtISO(d) { return d.toISOString().slice(0, 10) }
function fmtLabel(d) { return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) }
// Collapses a same-day range to one label instead of "31 Aug–31 Aug", which
// reads as a rendering bug rather than "the period has only run one day so far".
function fmtRange(since, until) {
  const a = fmtLabel(since), b = fmtLabel(until)
  return a === b ? a : `${a}–${b}`
}
// ISO-8601 week key, matching the shape linkedin_manual/x_manual store entries under.
function isoWeekKey(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNr = (t.getUTCDay() + 6) % 7
  t.setUTCDate(t.getUTCDate() - dayNr + 3)
  const firstThursday = new Date(Date.UTC(t.getUTCFullYear(), 0, 4))
  const week = 1 + Math.round((t - firstThursday) / (7 * 86400000))
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

// Day/Week/Month/Year -> {curSince, curUntil, priorSince, priorUntil, curLabel, priorLabel}.
// Every granularity compares the current period against the SAME ELAPSED
// PORTION of the prior period (e.g. 3 days into this week vs the first 3 days
// of last week), not the prior period's full length -- comparing a partial
// current period against a complete prior one always shows a misleading
// negative delta for volume metrics, exactly the trap this app's own MTD
// dashboard already avoids for month-over-month deltas.
function periodsForGranularity(g, customFrom, customTo) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (g === 'custom' && customFrom && customTo) {
    const [y1, m1, d1] = customFrom.split('-').map(Number)
    const [y2, m2, d2] = customTo.split('-').map(Number)
    const curStart = new Date(y1, m1 - 1, d1)
    const curEnd = new Date(y2, m2 - 1, d2)
    const lengthDays = Math.round((curEnd - curStart) / 86400000) + 1
    const priorEnd = addDays(curStart, -1)
    const priorStart = addDays(priorEnd, -(lengthDays - 1))
    return { curSince: curStart, curUntil: curEnd, priorSince: priorStart, priorUntil: priorEnd, curLabel: 'Selected range', priorLabel: 'previous period' }
  }
  if (g === 'day') {
    const yesterday = addDays(today, -1)
    return { curSince: today, curUntil: today, priorSince: yesterday, priorUntil: yesterday, curLabel: 'Today', priorLabel: 'yesterday' }
  }
  if (g === 'week') {
    const curStart = mondayOf(today)
    const elapsedDays = Math.round((today - curStart) / 86400000) // 0..6
    const priorStart = addDays(curStart, -7)
    const priorEnd = addDays(priorStart, elapsedDays)
    return { curSince: curStart, curUntil: today, priorSince: priorStart, priorUntil: priorEnd, curLabel: 'This week', priorLabel: 'last week' }
  }
  if (g === 'month') {
    const curStart = new Date(today.getFullYear(), today.getMonth(), 1)
    const priorStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const priorMonthLength = new Date(today.getFullYear(), today.getMonth(), 0).getDate()
    const priorEnd = new Date(today.getFullYear(), today.getMonth() - 1, Math.min(today.getDate(), priorMonthLength))
    return { curSince: curStart, curUntil: today, priorSince: priorStart, priorUntil: priorEnd, curLabel: 'MTD', priorLabel: 'LMTD' }
  }
  // year
  const curStart = new Date(today.getFullYear(), 0, 1)
  const priorStart = new Date(today.getFullYear() - 1, 0, 1)
  let priorEnd = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate())
  if (priorEnd.getMonth() !== today.getMonth()) priorEnd = new Date(today.getFullYear() - 1, today.getMonth() + 1, 0) // Feb 29 -> Feb 28 style clamp
  return { curSince: curStart, curUntil: today, priorSince: priorStart, priorUntil: priorEnd, curLabel: 'YTD', priorLabel: 'LYTD' }
}

// null when there's nothing to compare against (prior period genuinely zero,
// or not loaded) rather than a misleading 0%/divide-by-zero delta.
function pctDelta(cur, prior) {
  if (cur == null || prior == null) return null
  if (prior === 0) return cur > 0 ? 'new' : null
  return ((cur - prior) / prior) * 100
}

const GRANULARITY_OPTIONS = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
]

const ICONS = {
  followers: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  eye: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  spark: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z"/></svg>,
  pct: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>,
  globe: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/></svg>,
  play: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
  clock: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
}

const WeekArrow = ({ dir, onClick, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      width: 28, height: 28, borderRadius: 8, border: '1px solid var(--card-border)', background: 'var(--card)',
      color: disabled ? C.muted : C.text, cursor: disabled ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
      opacity: disabled ? 0.5 : 1,
    }}
    title={dir === -1 ? 'Previous week' : 'Next week'}
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      {dir === -1 ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
    </svg>
  </button>
)

const GranPill = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    style={{
      padding: '7px 14px', fontSize: 12.5, fontWeight: 700, borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: FONT,
      background: active ? `linear-gradient(135deg, ${C.navy}, ${C.blue})` : 'transparent',
      color: active ? '#fff' : C.text,
      boxShadow: active ? '0 4px 10px -3px rgba(31,60,132,0.5)' : 'none',
      transition: 'background .12s, box-shadow .12s',
    }}
  >
    {children}
  </button>
)

// Pulls the two Instagram Insights numbers (a time-series reach total, and a
// set of total_value aggregates) out of one period's raw API responses.
function extractIgMetrics(reachRes, totalsRes) {
  const reachRows = (reachRes && reachRes.insights && reachRes.insights.data && reachRes.insights.data[0] && reachRes.insights.data[0].values) || []
  const totalReach = reachRows.reduce((s, v) => s + Number(v.value || 0), 0)
  const totalsData = (totalsRes && totalsRes.insights && totalsRes.insights.data) || []
  const findTotal = name => { const m = totalsData.find(d => d.name === name); return m && m.total_value ? Number(m.total_value.value || 0) : 0 }
  return {
    reach: totalReach,
    engaged: findTotal('accounts_engaged'),
    interactions: findTotal('total_interactions'),
    profileViews: findTotal('profile_views'),
  }
}

export default function OrganicSocialDashboard() {
  const [granularity, setGranularity] = useState('day')

  // LinkedIn/X are manual weekly entries -- keep their own independent
  // week-by-week browser, defaulting to the last COMPLETE week (most likely
  // to already have a real entry, vs. a partial current week that's probably
  // still empty).
  const thisMonday = useMemo(() => mondayOf(new Date()), [])
  const lastCompleteMonday = useMemo(() => addDays(thisMonday, -7), [thisMonday])
  const [weekStart, setWeekStart] = useState(lastCompleteMonday)
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart])
  const isCurrentWeek = weekStart.getTime() === thisMonday.getTime()
  const weekKey = useMemo(() => isoWeekKey(weekStart), [weekStart])

  const [customOpen, setCustomOpen] = useState(false)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const [loading, setLoading] = useState(true)
  const [igAccounts, setIgAccounts] = useState([]) // [{ key, ig: {profile, cur, prior} | null, igErr }]
  const [yt, setYt] = useState(null)
  const [ytRange, setYtRange] = useState(null) // { cur, prior } | null
  const [ytRangeErr, setYtRangeErr] = useState(null)
  const [ga4, setGa4] = useState(null) // { cur, prior } | null
  const [ga4Err, setGa4Err] = useState(null)
  const [prefs, setPrefs] = useState({})

  // One Instagram account is a fetch-five-things job (profile once, then
  // reach+totals for BOTH the current and prior period) -- every configured
  // account runs this same job in parallel. instagramAccounts() on the
  // backend is the only thing that changes when a new account is connected;
  // this loop needs no per-account code.
  const loadIgAccount = useCallback((key, periods) => {
    const qs = key ? `&account=${encodeURIComponent(key)}` : ''
    const fetchInsights = (since, until, metrics, metricType) =>
      fetch(`/api/crm-leads?source=instagram&mode=insights&metrics=${metrics}&since=${since}&until=${until}&metric_type=${metricType}${qs}`, { credentials: 'include' }).then(r => r.json()).catch(e => ({ error: String(e) }))
    return Promise.all([
      fetch(`/api/crm-leads?source=instagram&mode=profile${qs}`, { credentials: 'include' }).then(r => r.json()).catch(e => ({ error: String(e) })),
      fetchInsights(periods.curSinceSec, periods.curUntilSec, 'reach', 'time_series'),
      fetchInsights(periods.curSinceSec, periods.curUntilSec, 'accounts_engaged,total_interactions,profile_views', 'total_value'),
      fetchInsights(periods.priorSinceSec, periods.priorUntilSec, 'reach', 'time_series'),
      fetchInsights(periods.priorSinceSec, periods.priorUntilSec, 'accounts_engaged,total_interactions,profile_views', 'total_value'),
    ]).then(([profileRes, curReachRes, curTotalsRes, priorReachRes, priorTotalsRes]) => {
      if (!(profileRes && profileRes.configured && profileRes.profile)) {
        if (profileRes && profileRes.configured === false) return { key, ig: null, igErr: 'not_configured' }
        return { key, ig: null, igErr: (profileRes && (profileRes.detail || profileRes.error)) || 'Unknown error' }
      }
      const followers = profileRes.profile.followersCount
      const cur = extractIgMetrics(curReachRes, curTotalsRes)
      const prior = extractIgMetrics(priorReachRes, priorTotalsRes)
      cur.engagementRate = followers > 0 ? (cur.interactions / followers) * 100 : 0
      prior.engagementRate = followers > 0 ? (prior.interactions / followers) * 100 : 0
      return { key, igErr: null, ig: { profile: profileRes.profile, cur, prior } }
    })
  }, [])

  const load = useCallback(() => {
    setLoading(true)
    const p = periodsForGranularity(granularity, customFrom, customTo)
    const curSince = fmtISO(p.curSince), curUntil = fmtISO(p.curUntil)
    const priorSince = fmtISO(p.priorSince), priorUntil = fmtISO(p.priorUntil)
    const curSinceSec = Math.floor(p.curSince.getTime() / 1000)
    const curUntilSec = Math.floor(addDays(p.curUntil, 1).getTime() / 1000) - 1
    const priorSinceSec = Math.floor(p.priorSince.getTime() / 1000)
    const priorUntilSec = Math.floor(addDays(p.priorUntil, 1).getTime() / 1000) - 1
    const periods = { curSinceSec, curUntilSec, priorSinceSec, priorUntilSec }

    Promise.all([
      fetch('/api/crm-leads?source=instagram&mode=accounts', { credentials: 'include' }).then(r => r.json()).catch(e => ({ error: String(e) })),
      fetch('/api/crm-leads?source=youtube&mode=stats', { credentials: 'include' }).then(r => r.json()).catch(e => ({ error: String(e) })),
      fetch(`/api/crm-leads?source=youtube&mode=range&since=${curSince}&until=${curUntil}`, { credentials: 'include' }).then(r => r.json()).catch(e => ({ error: String(e) })),
      fetch(`/api/crm-leads?source=youtube&mode=range&since=${priorSince}&until=${priorUntil}`, { credentials: 'include' }).then(r => r.json()).catch(e => ({ error: String(e) })),
      fetch(`/api/crm-leads?source=ga4&mode=range&since=${curSince}&until=${curUntil}`, { credentials: 'include' }).then(r => r.json()).catch(e => ({ error: String(e) })),
      fetch(`/api/crm-leads?source=ga4&mode=range&since=${priorSince}&until=${priorUntil}`, { credentials: 'include' }).then(r => r.json()).catch(e => ({ error: String(e) })),
      fetch('/api/preferences', { credentials: 'include' }).then(r => r.json()).catch(e => ({ error: String(e) })),
    ]).then(([accountsRes, ytStatsRes, ytCurRes, ytPriorRes, ga4CurRes, ga4PriorRes, prefsRes]) => {
      const keys = (accountsRes && Array.isArray(accountsRes.accounts) && accountsRes.accounts.length)
        ? accountsRes.accounts.map(a => a.key)
        : [null] // no accounts endpoint / none configured -- fall back to the single legacy account so "not connected" still renders one card, not zero
      Promise.all(keys.map(k => loadIgAccount(k, periods))).then(setIgAccounts)

      if (ytStatsRes && ytStatsRes.configured && ytStatsRes.stats) setYt(ytStatsRes.stats)
      else setYt(null)

      if (ytCurRes && ytCurRes.configured && ytCurRes.range) {
        setYtRange({ cur: ytCurRes.range, prior: (ytPriorRes && ytPriorRes.configured && ytPriorRes.range) || null })
        setYtRangeErr(null)
      } else if (ytCurRes && ytCurRes.configured === false) { setYtRange(null); setYtRangeErr('not_configured') }
      else { setYtRange(null); setYtRangeErr((ytCurRes && ytCurRes.detail) || 'Blocked') }

      if (ga4CurRes && ga4CurRes.configured && ga4CurRes.range) {
        setGa4({ cur: ga4CurRes.range, prior: (ga4PriorRes && ga4PriorRes.configured && ga4PriorRes.range) || null })
        setGa4Err(null)
      } else if (ga4CurRes && ga4CurRes.configured === false) { setGa4(null); setGa4Err('not_configured') }
      else { setGa4(null); setGa4Err((ga4CurRes && ga4CurRes.detail) || 'Blocked') }

      setPrefs((prefsRes && prefsRes.prefs) || {})
      setLoading(false)
    })
  }, [granularity, customFrom, customTo, loadIgAccount])

  useEffect(() => { load() }, [load])

  const linkedinWeek = (prefs.linkedin_manual || {})[weekKey] || null
  const xWeek = (prefs.x_manual || {})[weekKey] || null

  const period = useMemo(() => periodsForGranularity(granularity, customFrom, customTo), [granularity, customFrom, customTo])
  const compareLabel = `${period.curLabel} vs ${period.priorLabel}`

  if (loading) {
    return (
      <div className="lq-page-shell" style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.bg }}>
        <Sidebar />
        <div style={{ flex: 1, overflowY: 'auto' }}><DashboardSkeleton /></div>
      </div>
    )
  }

  return (
    <div className="lq-page-shell" style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.bg }}>
      <Sidebar />
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{
          margin: '12px 14px 0', borderRadius: 14, border: '1px solid var(--card-border)',
          background: 'var(--card)', boxShadow: '0 1px 3px rgba(31,60,132,0.06)', padding: '14px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: FONT }}>Analytics</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.text, fontFamily: FONT, letterSpacing: '-0.3px' }}>Organic &amp; Social</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} className="lq-header-controls">
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'var(--bg3)', borderRadius: 10, padding: 4, position: 'relative' }}>
              {GRANULARITY_OPTIONS.map(o => (
                <GranPill key={o.key} active={granularity === o.key} onClick={() => setGranularity(o.key)}>{o.label}</GranPill>
              ))}
              <GranPill active={granularity === 'custom'} onClick={() => setCustomOpen(true)}>
                {granularity === 'custom' && customFrom && customTo ? `${customFrom} → ${customTo}` : 'Custom'}
              </GranPill>
              {customOpen && (
                <>
                  <div onClick={() => setCustomOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 399 }} />
                  <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 400, background: 'var(--card)', border: '0.5px solid var(--card-border)', borderRadius: 14, boxShadow: '0 20px 60px rgba(15,23,42,0.16), 0 4px 12px rgba(15,23,42,0.06)', overflow: 'hidden' }}>
                    <DateRangePicker
                      from={customFrom ? (() => { const [y, m, d] = customFrom.split('-').map(Number); return new Date(y, m - 1, d) })() : null}
                      to={customTo ? (() => { const [y, m, d] = customTo.split('-').map(Number); return new Date(y, m - 1, d) })() : null}
                      onChange={(f, t) => {
                        setCustomOpen(false)
                        if (f && t) { setCustomFrom(f); setCustomTo(t); setGranularity('custom') }
                      }}
                      onClose={() => setCustomOpen(false)}
                    />
                  </div>
                </>
              )}
            </div>
            <button
              onClick={load}
              style={{ fontSize: 12.5, fontWeight: 700, color: C.text, background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontFamily: FONT }}
            >
              Refresh
            </button>
          </div>
        </div>
        <div style={{ margin: '6px 14px 0', fontSize: 11.5, color: C.muted, fontFamily: FONT }}>
          {compareLabel} &middot; {fmtRange(period.curSince, period.curUntil)} vs {fmtRange(period.priorSince, period.priorUntil)}
        </div>

        <div style={{ padding: '16px 14px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          <div className="lq-grid2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

            <Card title="Website" sub={ga4 ? `Organic Search channel · ${compareLabel}` : 'Google Analytics 4'}>
              {ga4 ? (
                <div className="lq-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                  <PremKPI label="Organic Users" value={fmtN(ga4.cur.organicUsers)} delta={ga4.prior ? pctDelta(ga4.cur.organicUsers, ga4.prior.organicUsers) : null} sub={`vs ${period.priorLabel}`} icon={ICONS.globe} accent={C.navy} accentBg={C.navyBg} />
                  <PremKPI label="Total Users" value={fmtN(ga4.cur.totalUsers)} delta={ga4.prior ? pctDelta(ga4.cur.totalUsers, ga4.prior.totalUsers) : null} sub={`vs ${period.priorLabel}`} icon={ICONS.eye} accent={C.blue} accentBg={C.blueBg} />
                  <PremKPI label="Organic %" value={ga4.cur.organicPct.toFixed(1) + '%'} delta={ga4.prior ? pctDelta(ga4.cur.organicPct, ga4.prior.organicPct) : null} sub={`vs ${period.priorLabel}`} icon={ICONS.pct} accent={C.cyan} accentBg={C.cyanBg} />
                </div>
              ) : (
                <div style={{ padding: '10px 4px', textAlign: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, fontFamily: FONT }}>Pending</div>
                  <div style={{ fontSize: 12, color: C.muted, fontFamily: FONT, marginTop: 4 }}>
                    Waiting on GA4 property access to be granted to the Quantum reader service account.
                  </div>
                </div>
              )}
            </Card>

            <Card title="YouTube" sub={yt ? yt.title : 'Data API + Analytics API'}>
              {yt ? (
                <div className="lq-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                  <PremKPI label="Subscribers" value={fmtN(yt.subscriberCount)} icon={ICONS.followers} accent={C.navy} accentBg={C.navyBg} />
                  <PremKPI label="Lifetime Views" value={fmtN(yt.viewCount)} icon={ICONS.eye} accent={C.blue} accentBg={C.blueBg} />
                  <PremKPI label="Videos" value={fmtN(yt.videoCount)} icon={ICONS.play} accent={C.cyan} accentBg={C.cyanBg} />
                  {ytRange ? (
                    <>
                      <PremKPI label={`Views (${period.curLabel})`} value={fmtN(ytRange.cur.totalViews)} delta={ytRange.prior ? pctDelta(ytRange.cur.totalViews, ytRange.prior.totalViews) : null} sub={`vs ${period.priorLabel}`} icon={ICONS.eye} accent={C.green} accentBg={C.greenBg} />
                      <PremKPI label={`Organic Views (${period.curLabel})`} value={fmtN(ytRange.cur.organicViews)} delta={ytRange.prior ? pctDelta(ytRange.cur.organicViews, ytRange.prior.organicViews) : null} sub={`vs ${period.priorLabel}`} icon={ICONS.eye} accent={C.navy} accentBg={C.navyBg} />
                      <PremKPI label={`Watch Time (hrs, ${period.curLabel})`} value={fmtN(ytRange.cur.totalMinutesWatched / 60)} delta={ytRange.prior ? pctDelta(ytRange.cur.totalMinutesWatched, ytRange.prior.totalMinutesWatched) : null} sub={`vs ${period.priorLabel}`} icon={ICONS.clock} accent={C.blue} accentBg={C.blueBg} />
                    </>
                  ) : (
                    <div style={{ gridColumn: 'span 3', padding: '8px 4px', textAlign: 'center' }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: C.muted, fontFamily: FONT }}>Views &amp; watch time — pending</div>
                      <div style={{ fontSize: 11.5, color: C.muted, fontFamily: FONT, marginTop: 3 }}>Blocked on a Google Workspace admin trust grant for the Analytics API scope.</div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ padding: '10px 4px', textAlign: 'center', fontSize: 13, fontWeight: 700, color: C.muted, fontFamily: FONT }}>Not connected</div>
              )}
            </Card>

          </div>

          {/* One full-width card per connected Instagram account -- every
              business account this app has a token for gets its own row,
              not squeezed into the 2-col grid above. instagramAccounts() on
              the backend is the only thing that changes when a new account
              is connected; this loop needs no per-account code. */}
          {igAccounts.map(({ key, ig, igErr }) => (
            <Card key={key || 'default'} title="Instagram" sub={ig ? `@${ig.profile.username} · ${compareLabel}` : 'Live'}>
              {ig ? (
                <div className="lq-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                  <PremKPI label="Followers" value={fmtN(ig.profile.followersCount)} icon={ICONS.followers} accent={C.navy} accentBg={C.navyBg} />
                  <PremKPI label="Reach" value={fmtN(ig.cur.reach)} delta={pctDelta(ig.cur.reach, ig.prior.reach)} sub={`vs ${period.priorLabel}`} icon={ICONS.eye} accent={C.blue} accentBg={C.blueBg} />
                  <PremKPI label="Interactions" value={fmtN(ig.cur.interactions)} delta={pctDelta(ig.cur.interactions, ig.prior.interactions)} sub={`vs ${period.priorLabel}`} icon={ICONS.spark} accent={C.cyan} accentBg={C.cyanBg} />
                  <PremKPI label="Profile Views" value={fmtN(ig.cur.profileViews)} delta={pctDelta(ig.cur.profileViews, ig.prior.profileViews)} sub={`vs ${period.priorLabel}`} icon={ICONS.eye} accent={C.green} accentBg={C.greenBg} />
                  <PremKPI label="Accounts Engaged" value={fmtN(ig.cur.engaged)} delta={pctDelta(ig.cur.engaged, ig.prior.engaged)} sub={`vs ${period.priorLabel}`} icon={ICONS.followers} accent={C.navy} accentBg={C.navyBg} />
                  <PremKPI label="Engagement Rate" value={ig.cur.engagementRate.toFixed(2) + '%'} delta={pctDelta(ig.cur.engagementRate, ig.prior.engagementRate)} sub={`vs ${period.priorLabel}`} icon={ICONS.pct} accent={C.blue} accentBg={C.blueBg} />
                </div>
              ) : (
                <div style={{ padding: '10px 4px', textAlign: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, fontFamily: FONT }}>
                    {igErr === 'not_configured' ? 'Not connected yet' : 'Temporarily unavailable'}
                  </div>
                  {igErr && igErr !== 'not_configured' && (
                    <div style={{ fontSize: 12, color: C.muted, fontFamily: FONT, marginTop: 4 }}>{String(igErr).slice(0, 160)}</div>
                  )}
                </div>
              )}
            </Card>
          ))}

          {/* LinkedIn/X: manual weekly entries, deliberately NOT driven by the
              Day/Week/Month/Year toolbar above -- the underlying data only
              ever exists at one-row-per-week granularity (typed into
              Settings), so "Last day" or "YTD" has nothing real to show.
              Kept in its own section with its own week browser instead of
              silently breaking under a toolbar it can't answer to. */}
          <Card
            title="LinkedIn &amp; X"
            sub="Manually entered, week by week"
            action={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg3)', borderRadius: 10, padding: '4px 6px' }}>
                <WeekArrow dir={-1} onClick={() => setWeekStart(w => addDays(w, -7))} />
                <div style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: FONT, minWidth: 110, textAlign: 'center' }}>
                  {fmtLabel(weekStart)} – {fmtLabel(weekEnd)} {isCurrentWeek && <span style={{ color: C.blue }}>(this week)</span>}
                </div>
                <WeekArrow dir={1} onClick={() => setWeekStart(w => addDays(w, 7))} disabled={weekStart.getTime() >= thisMonday.getTime()} />
              </div>
            }
          >
            <div className="lq-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: C.text, fontFamily: FONT, marginBottom: 8 }}>LinkedIn</div>
                {linkedinWeek ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: FONT }}>
                    <Row label="Followers" value={fmtN(linkedinWeek.followers)} />
                    <Row label="Impressions" value={fmtN(linkedinWeek.views)} />
                    <Row label="Unique visitors" value={fmtN(linkedinWeek.reach)} />
                    <Row label="Interactions" value={fmtN(linkedinWeek.interactions)} />
                    <Row label="Engagement rate" value={(linkedinWeek.engagementRate != null ? linkedinWeek.engagementRate + '%' : '—')} />
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: C.muted, fontFamily: FONT }}>No entry for this week yet — add it in Settings &gt; Data.</div>
                )}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: C.text, fontFamily: FONT, marginBottom: 8 }}>X (Twitter)</div>
                {xWeek ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: FONT }}>
                    <Row label="Followers" value={fmtN(xWeek.followers)} />
                    <Row label="Impressions" value={fmtN(xWeek.views)} />
                    <Row label="Reach" value={fmtN(xWeek.reach)} />
                    <Row label="Interactions" value={fmtN(xWeek.interactions)} />
                    <Row label="Engagement rate" value={(xWeek.engagementRate != null ? xWeek.engagementRate + '%' : '—')} />
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: C.muted, fontFamily: FONT }}>No entry for this week yet — add it in Settings &gt; Data.</div>
                )}
              </div>
            </div>
          </Card>

        </div>
      </div>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
      <span style={{ color: C.muted }}>{label}</span>
      <span style={{ fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )
}
