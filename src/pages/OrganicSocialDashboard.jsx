import React, { useState, useEffect, useMemo, useCallback } from 'react'
import Sidebar from '../components/Sidebar'
import { DashboardSkeleton } from '../components/SkeletonLoader'
import { C, FONT, Card, PremKPI, fmtN } from '../ui/dashboardKit'

// ---------------------------------------------------------------------------
// Organic & Social -- tracks the same weekly metrics the "IPO Tracker" sheet's
// CC01/CC03/CC05/CC06/CC07 rows ask data owners to type in by hand every
// Monday (website organic users, followers/views/interactions/engagement rate
// across Instagram/LinkedIn/YouTube/X, YouTube watch time) -- computed here
// from live APIs instead, so nobody has to enter it manually.
//
// Four sources, four different states as of 2026-08-30:
//   Website (GA4)  -- built, BLOCKED (service account has no GA4 property
//                     access yet; see lib/ga4.mjs)
//   Instagram      -- LIVE (own dedicated Meta App/token)
//   YouTube        -- PARTIAL (channel totals live via Data API; weekly
//                     views/watch-time BLOCKED on a Workspace-admin trust
//                     grant; see lib/youtube.mjs)
//   LinkedIn / X   -- MANUAL (no viable free API for either; entered weekly
//                     in Settings > Data, read here via /api/preferences)
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
// ISO-8601 week key, matching the shape linkedin_manual/x_manual store entries under.
function isoWeekKey(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNr = (t.getUTCDay() + 6) % 7
  t.setUTCDate(t.getUTCDate() - dayNr + 3)
  const firstThursday = new Date(Date.UTC(t.getUTCFullYear(), 0, 4))
  const week = 1 + Math.round((t - firstThursday) / (7 * 86400000))
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

const ICONS = {
  followers: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  eye: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  spark: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z"/></svg>,
  pct: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>,
  globe: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/></svg>,
  play: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
  clock: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
}

const STATUS_STYLE = {
  live:    { label: 'Live',    tint: C.greenBg, ink: '#15803D' },
  partial: { label: 'Partial', tint: C.blueBg,  ink: C.blue },
  manual:  { label: 'Manual entry', tint: C.navyBg, ink: C.navy },
  pending: { label: 'Pending', tint: 'var(--bg3)', ink: C.muted },
}

function StatusChip({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.pending
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: s.ink, background: s.tint, padding: '3px 9px', borderRadius: 999, fontFamily: FONT, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  )
}

function SourceRow({ title, status, note }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--card-border)', gap: 10 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, fontFamily: FONT }}>{title}</div>
        {note && <div style={{ fontSize: 11.5, color: C.muted, fontFamily: FONT, marginTop: 2 }}>{note}</div>}
      </div>
      <StatusChip status={status} />
    </div>
  )
}

function PendingCard({ title, sub, why }) {
  return (
    <Card title={title} sub={sub}>
      <div style={{ padding: '18px 4px', textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, fontFamily: FONT }}>Pending</div>
        <div style={{ fontSize: 12, color: C.muted, fontFamily: FONT, marginTop: 4, maxWidth: 420, marginLeft: 'auto', marginRight: 'auto' }}>{why}</div>
      </div>
    </Card>
  )
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

export default function OrganicSocialDashboard() {
  const thisMonday = useMemo(() => mondayOf(new Date()), [])
  const lastCompleteMonday = useMemo(() => addDays(thisMonday, -7), [thisMonday])
  const [weekStart, setWeekStart] = useState(lastCompleteMonday)
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart])
  const isCurrentWeek = weekStart.getTime() === thisMonday.getTime()
  const weekKey = useMemo(() => isoWeekKey(weekStart), [weekStart])

  const [loading, setLoading] = useState(true)
  const [ig, setIg] = useState(null)
  const [igErr, setIgErr] = useState(null)
  const [yt, setYt] = useState(null)
  const [ytRange, setYtRange] = useState(null)
  const [ytRangeErr, setYtRangeErr] = useState(null)
  const [ga4, setGa4] = useState(null)
  const [ga4Err, setGa4Err] = useState(null)
  const [prefs, setPrefs] = useState({})

  const load = useCallback(() => {
    setLoading(true)
    const sinceSec = Math.floor(weekStart.getTime() / 1000)
    const untilSec = Math.floor((addDays(weekEnd, 1).getTime() - 1) / 1000)
    const since = fmtISO(weekStart)
    const until = fmtISO(weekEnd)

    Promise.all([
      fetch('/api/crm-leads?source=instagram&mode=profile', { credentials: 'include' }).then(r => r.json()).catch(e => ({ error: String(e) })),
      fetch(`/api/crm-leads?source=instagram&mode=insights&metrics=reach&since=${sinceSec}&until=${untilSec}&metric_type=time_series`, { credentials: 'include' }).then(r => r.json()).catch(e => ({ error: String(e) })),
      fetch(`/api/crm-leads?source=instagram&mode=insights&metrics=accounts_engaged,total_interactions,profile_views&since=${sinceSec}&until=${untilSec}&metric_type=total_value`, { credentials: 'include' }).then(r => r.json()).catch(e => ({ error: String(e) })),
      fetch('/api/crm-leads?source=youtube&mode=stats', { credentials: 'include' }).then(r => r.json()).catch(e => ({ error: String(e) })),
      fetch(`/api/crm-leads?source=youtube&mode=range&since=${since}&until=${until}`, { credentials: 'include' }).then(r => r.json()).catch(e => ({ error: String(e) })),
      fetch(`/api/crm-leads?source=ga4&mode=range&since=${since}&until=${until}`, { credentials: 'include' }).then(r => r.json()).catch(e => ({ error: String(e) })),
      fetch('/api/preferences', { credentials: 'include' }).then(r => r.json()).catch(e => ({ error: String(e) })),
    ]).then(([profileRes, reachRes, totalsRes, ytStatsRes, ytRangeRes, ga4Res, prefsRes]) => {
      if (profileRes && profileRes.configured && profileRes.profile) {
        const reachRows = (reachRes && reachRes.insights && reachRes.insights.data && reachRes.insights.data[0] && reachRes.insights.data[0].values) || []
        const totalReach = reachRows.reduce((s, v) => s + Number(v.value || 0), 0)
        const totalsData = (totalsRes && totalsRes.insights && totalsRes.insights.data) || []
        const findTotal = name => { const m = totalsData.find(d => d.name === name); return m && m.total_value ? Number(m.total_value.value || 0) : 0 }
        const engaged = findTotal('accounts_engaged')
        const interactions = findTotal('total_interactions')
        const profileViews = findTotal('profile_views')
        setIg({
          profile: profileRes.profile,
          reach: totalReach,
          engaged,
          interactions,
          profileViews,
          engagementRate: profileRes.profile.followersCount > 0 ? (interactions / profileRes.profile.followersCount) * 100 : 0,
        })
        setIgErr(null)
      } else if (profileRes && profileRes.configured === false) {
        setIg(null); setIgErr('not_configured')
      } else {
        setIg(null); setIgErr((profileRes && (profileRes.detail || profileRes.error)) || 'Unknown error')
      }

      if (ytStatsRes && ytStatsRes.configured && ytStatsRes.stats) setYt(ytStatsRes.stats)
      else setYt(null)

      if (ytRangeRes && ytRangeRes.configured && ytRangeRes.range) { setYtRange(ytRangeRes.range); setYtRangeErr(null) }
      else if (ytRangeRes && ytRangeRes.configured === false) { setYtRange(null); setYtRangeErr('not_configured') }
      else { setYtRange(null); setYtRangeErr((ytRangeRes && ytRangeRes.detail) || 'Blocked') }

      if (ga4Res && ga4Res.configured && ga4Res.range) { setGa4(ga4Res.range); setGa4Err(null) }
      else if (ga4Res && ga4Res.configured === false) { setGa4(null); setGa4Err('not_configured') }
      else { setGa4(null); setGa4Err((ga4Res && ga4Res.detail) || 'Blocked') }

      setPrefs((prefsRes && prefsRes.prefs) || {})
      setLoading(false)
    })
  }, [weekStart, weekEnd])

  useEffect(() => { load() }, [load])

  const linkedinWeek = (prefs.linkedin_manual || {})[weekKey] || null
  const xWeek = (prefs.x_manual || {})[weekKey] || null

  const igStatus = igErr === 'not_configured' ? 'pending' : (igErr ? 'pending' : 'live')
  const ytStatus = yt ? 'partial' : 'pending'
  const ga4Status = ga4 ? 'live' : 'pending'

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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg3)', borderRadius: 10, padding: '4px 6px' }}>
              <WeekArrow dir={-1} onClick={() => setWeekStart(w => addDays(w, -7))} />
              <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, fontFamily: FONT, minWidth: 130, textAlign: 'center' }}>
                {fmtLabel(weekStart)} – {fmtLabel(weekEnd)} {isCurrentWeek && <span style={{ color: C.blue }}>(this week)</span>}
              </div>
              <WeekArrow dir={1} onClick={() => setWeekStart(w => addDays(w, 7))} disabled={weekStart.getTime() >= thisMonday.getTime()} />
            </div>
            <button
              onClick={load}
              style={{ fontSize: 12.5, fontWeight: 700, color: C.text, background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontFamily: FONT }}
            >
              Refresh
            </button>
          </div>
        </div>

        <div style={{ padding: '16px 14px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          <Card title="Data sources" sub="What's live vs. still manual for the weekly organic/social tracker">
            <SourceRow title="Website organic users (GA4)" status={ga4Status} note={ga4 ? null : 'Waiting on GA4 property access for the Quantum reader service account'} />
            <SourceRow title="Instagram (followers, views, interactions, engagement)" status={igStatus} note={igErr && igErr !== 'not_configured' ? String(igErr).slice(0, 140) : null} />
            <SourceRow title="YouTube subscribers / lifetime totals" status={yt ? 'live' : 'pending'} />
            <SourceRow title="YouTube weekly views &amp; watch time" status="pending" note="Blocked on a Google Workspace admin trust grant" />
            <div style={{ borderBottom: 'none' }}>
              <SourceRow title="LinkedIn (weekly, entered in Settings)" status="manual" />
            </div>
            <SourceRow title="X / Twitter (weekly, entered in Settings)" status="manual" />
          </Card>

          <div className="lq-grid2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

            <Card title="Website" sub={ga4 ? `${fmtISO(weekStart)} – ${fmtISO(weekEnd)} · Organic Search channel` : 'Google Analytics 4'}>
              {ga4 ? (
                <div className="lq-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                  <PremKPI label="Organic Users" value={fmtN(ga4.organicUsers)} icon={ICONS.globe} accent={C.navy} accentBg={C.navyBg} />
                  <PremKPI label="Total Users" value={fmtN(ga4.totalUsers)} icon={ICONS.eye} accent={C.blue} accentBg={C.blueBg} />
                  <PremKPI label="Organic %" value={ga4.organicPct.toFixed(1) + '%'} icon={ICONS.pct} accent={C.cyan} accentBg={C.cyanBg} />
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

            <Card title="Instagram" sub={ig ? `@${ig.profile.username} · ${fmtISO(weekStart)} – ${fmtISO(weekEnd)}` : 'Live'}>
              {ig ? (
                <div className="lq-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                  <PremKPI label="Followers" value={fmtN(ig.profile.followersCount)} icon={ICONS.followers} accent={C.navy} accentBg={C.navyBg} />
                  <PremKPI label="Reach (week)" value={fmtN(ig.reach)} icon={ICONS.eye} accent={C.blue} accentBg={C.blueBg} />
                  <PremKPI label="Interactions" value={fmtN(ig.interactions)} icon={ICONS.spark} accent={C.cyan} accentBg={C.cyanBg} />
                  <PremKPI label="Profile Views" value={fmtN(ig.profileViews)} icon={ICONS.eye} accent={C.green} accentBg={C.greenBg} />
                  <PremKPI label="Accounts Engaged" value={fmtN(ig.engaged)} icon={ICONS.followers} accent={C.navy} accentBg={C.navyBg} />
                  <PremKPI label="Engagement Rate" value={ig.engagementRate.toFixed(2) + '%'} icon={ICONS.pct} accent={C.blue} accentBg={C.blueBg} />
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

            <Card title="YouTube" sub={yt ? yt.title : 'Data API + Analytics API'}>
              {yt ? (
                <div className="lq-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                  <PremKPI label="Subscribers" value={fmtN(yt.subscriberCount)} icon={ICONS.followers} accent={C.navy} accentBg={C.navyBg} />
                  <PremKPI label="Lifetime Views" value={fmtN(yt.viewCount)} icon={ICONS.eye} accent={C.blue} accentBg={C.blueBg} />
                  <PremKPI label="Videos" value={fmtN(yt.videoCount)} icon={ICONS.play} accent={C.cyan} accentBg={C.cyanBg} />
                  {ytRange ? (
                    <>
                      <PremKPI label="Views (week)" value={fmtN(ytRange.totalViews)} icon={ICONS.eye} accent={C.green} accentBg={C.greenBg} />
                      <PremKPI label="Organic Views (week)" value={fmtN(ytRange.organicViews)} icon={ICONS.eye} accent={C.navy} accentBg={C.navyBg} />
                      <PremKPI label="Watch Time (hrs, week)" value={fmtN(ytRange.totalMinutesWatched / 60)} icon={ICONS.clock} accent={C.blue} accentBg={C.blueBg} />
                    </>
                  ) : (
                    <div style={{ gridColumn: 'span 3', padding: '8px 4px', textAlign: 'center' }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: C.muted, fontFamily: FONT }}>Weekly views &amp; watch time — pending</div>
                      <div style={{ fontSize: 11.5, color: C.muted, fontFamily: FONT, marginTop: 3 }}>Blocked on a Google Workspace admin trust grant for the Analytics API scope.</div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ padding: '10px 4px', textAlign: 'center', fontSize: 13, fontWeight: 700, color: C.muted, fontFamily: FONT }}>Not connected</div>
              )}
            </Card>

            <Card title="LinkedIn &amp; X" sub={`Manually entered · ${weekKey}`}>
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
