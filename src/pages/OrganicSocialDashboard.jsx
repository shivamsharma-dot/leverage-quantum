import React, { useState, useEffect, useMemo, useCallback } from 'react'
import Sidebar from '../components/Sidebar'
import { DashboardSkeleton } from '../components/SkeletonLoader'
import DateRangePicker from '../components/DateRangePicker'
import Dropdown from '../components/Dropdown'
import Button from '../components/Button'
import { ResponsiveContainer, BarChart, Bar, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts'
import { C, FONT, Card, PremKPI, RankedBars, fmtN, BRAND_RAMP, sourceColor, BarGrad, barFill, gradId, GRID_STROKE, BAR_RADIUS, BAR_MAX, NEUTRAL_GREY, NEUTRAL_TRACK } from '../ui/dashboardKit'

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
  heart: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>,
  comment: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>,
  share: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>,
  bookmark: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21 12 16l-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>,
  reply: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>,
  link: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.5-1.5"/></svg>,
  trendUp: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
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

// Every account-level total_value metric this page shows, fetched in ONE
// call (Instagram accepts a comma list) rather than one round-trip per
// number. follower_count is deliberately NOT in this list -- it's the one
// metric that only makes sense as a day-by-day time series (it's a net
// CHANGE per day, not a running total), fetched separately below.
const IG_TOTAL_METRICS = 'accounts_engaged,total_interactions,profile_views,likes,comments,shares,saves,replies,website_clicks,profile_links_taps,views'

// Pulls the time-series reach + follower_count totals and the total_value
// aggregates out of one period's raw API responses.
// The same time_series responses extractIgMetrics() sums below also carry the
// per-day values Instagram returned. Keeping them lets this page draw a real
// trend without a single extra API call -- nothing new is fetched, the
// day-by-day detail was always in the payload and was only being thrown away.
function toDaySeries(res) {
  const rows = (res && res.insights && res.insights.data && res.insights.data[0] && res.insights.data[0].values) || []
  return rows.map(v => ({
    d: v.end_time ? new Date(v.end_time).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '',
    v: Number(v.value || 0),
  }))
}

function extractIgMetrics(reachRes, totalsRes, followerRes) {
  const sumSeries = res => {
    const rows = (res && res.insights && res.insights.data && res.insights.data[0] && res.insights.data[0].values) || []
    return rows.reduce((s, v) => s + Number(v.value || 0), 0)
  }
  const totalsData = (totalsRes && totalsRes.insights && totalsRes.insights.data) || []
  const findTotal = name => { const m = totalsData.find(d => d.name === name); return m && m.total_value ? Number(m.total_value.value || 0) : 0 }
  return {
    reach: sumSeries(reachRes),
    reachSeries: toDaySeries(reachRes),
    followerSeries: toDaySeries(followerRes),
    followerGrowth: sumSeries(followerRes), // net new followers this period (can be negative)
    engaged: findTotal('accounts_engaged'),
    interactions: findTotal('total_interactions'),
    profileViews: findTotal('profile_views'),
    likes: findTotal('likes'),
    comments: findTotal('comments'),
    shares: findTotal('shares'),
    saves: findTotal('saves'),
    replies: findTotal('replies'),
    websiteClicks: findTotal('website_clicks'),
    profileLinkTaps: findTotal('profile_links_taps'),
    views: findTotal('views'),
  }
}

// Instagram returns ISO region codes (IN, NG, US...) for country demographics
// -- Intl.DisplayNames turns them into real names without a hand-rolled map.
let _countryNamer = null
function countryNameOf(code) {
  if (!_countryNamer) { try { _countryNamer = new Intl.DisplayNames(['en'], { type: 'region' }) } catch { return code } }
  try { return _countryNamer.of(code) || code } catch { return code }
}

// A demographics response's total_value.breakdowns[0] is
// { dimension_keys: ['age','gender'], results: [{dimension_values:['18-24','M'], value}, ...] }.
// This collapses it down to one dimension (e.g. age alone, summing across
// gender) since a full age*gender matrix is too dense for a compact card.
function aggregateDemographics(res, dimIndex = 0) {
  const bd = res && res.insights && res.insights.data && res.insights.data[0] && res.insights.data[0].total_value && res.insights.data[0].total_value.breakdowns && res.insights.data[0].total_value.breakdowns[0]
  if (!bd || !Array.isArray(bd.results)) return []
  const map = new Map()
  for (const r of bd.results) {
    const k = r.dimension_values[dimIndex]
    map.set(k, (map.get(k) || 0) + Number(r.value || 0))
  }
  return Array.from(map.entries()).map(([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value)
}

// Which insights metrics are valid for a post depends on its type -- video
// content (Reels) supports `views`, image/carousel posts don't. Confirmed
// live against a real Reel; the non-video set is the conservative common
// core also confirmed live at the account level.
function metricsForMedia(m) {
  const base = 'reach,likes,comments,saved,shares,total_interactions'
  return (m.mediaType === 'VIDEO' || m.mediaProductType === 'REELS') ? base + ',views' : base
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

  // Which Instagram account's detail card is open, and which metric the
  // cross-account comparison chart plots. Declared above the loading
  // early-return below so neither is ever a conditional hook.
  const [selectedIg, setSelectedIg] = useState(null)
  const [cmpMetric, setCmpMetric] = useState('reach')

  // One Instagram account is a fetch-many-things job (profile, reach+totals+
  // follower growth for BOTH periods, audience demographics, and -- once
  // those come back -- per-post insights for the period's top 5 posts by
  // engagement) -- every configured account runs this same job in parallel.
  // instagramAccounts() on the backend is the only thing that changes when a
  // new account is connected; this loop needs no per-account code.
  const loadIgAccount = useCallback((key, periods) => {
    const qs = key ? `&account=${encodeURIComponent(key)}` : ''
    const fetchInsights = (since, until, metrics, metricType, breakdown) =>
      fetch(`/api/crm-leads?source=instagram&mode=insights&metrics=${metrics}&since=${since}&until=${until}&metric_type=${metricType}${breakdown ? `&breakdown=${breakdown}` : ''}${qs}`, { credentials: 'include' }).then(r => r.json()).catch(e => ({ error: String(e) }))
    return Promise.all([
      fetch(`/api/crm-leads?source=instagram&mode=profile${qs}`, { credentials: 'include' }).then(r => r.json()).catch(e => ({ error: String(e) })),
      fetchInsights(periods.curSinceSec, periods.curUntilSec, 'reach', 'time_series'),
      fetchInsights(periods.curSinceSec, periods.curUntilSec, IG_TOTAL_METRICS, 'total_value'),
      fetchInsights(periods.curSinceSec, periods.curUntilSec, 'follower_count', 'time_series'),
      fetchInsights(periods.priorSinceSec, periods.priorUntilSec, 'reach', 'time_series'),
      fetchInsights(periods.priorSinceSec, periods.priorUntilSec, IG_TOTAL_METRICS, 'total_value'),
      fetchInsights(periods.priorSinceSec, periods.priorUntilSec, 'follower_count', 'time_series'),
      // Audience demographics are lifetime snapshots (Instagram ignores the
      // date range for these) -- fetched once per load, not once per period.
      fetchInsights(periods.curSinceSec, periods.curUntilSec, 'follower_demographics', 'total_value', 'country'),
      fetchInsights(periods.curSinceSec, periods.curUntilSec, 'follower_demographics', 'total_value', 'age,gender'),
      fetch(`/api/crm-leads?source=instagram&mode=media&limit=50${qs}`, { credentials: 'include' }).then(r => r.json()).catch(e => ({ error: String(e) })),
    ]).then(([profileRes, curReachRes, curTotalsRes, curFollowerRes, priorReachRes, priorTotalsRes, priorFollowerRes, countryDemoRes, ageGenderDemoRes, mediaRes]) => {
      if (!(profileRes && profileRes.configured && profileRes.profile)) {
        if (profileRes && profileRes.configured === false) return { key, ig: null, igErr: 'not_configured' }
        return { key, ig: null, igErr: (profileRes && (profileRes.detail || profileRes.error)) || 'Unknown error' }
      }
      const followers = profileRes.profile.followersCount
      const cur = extractIgMetrics(curReachRes, curTotalsRes, curFollowerRes)
      const prior = extractIgMetrics(priorReachRes, priorTotalsRes, priorFollowerRes)
      cur.engagementRate = followers > 0 ? (cur.interactions / followers) * 100 : 0
      prior.engagementRate = followers > 0 ? (prior.interactions / followers) * 100 : 0

      const demographics = {
        countries: aggregateDemographics(countryDemoRes, 0).slice(0, 8),
        ages: aggregateDemographics(ageGenderDemoRes, 0),
        genders: aggregateDemographics(ageGenderDemoRes, 1),
      }

      // Top posts for the selected period: media has no date filter on
      // Instagram's own API, so filter client-side by each post's own
      // timestamp, rank by the free like+comment counts already in the list
      // response (no extra API calls), then fetch full insights for only
      // the top 5 -- bounds the extra calls to 5 regardless of how wide the
      // period is or how many posts the account made in it.
      const allMedia = (mediaRes && mediaRes.media) || []
      const curSinceMs = periods.curSinceSec * 1000, curUntilMs = (periods.curUntilSec + 1) * 1000
      const inPeriod = allMedia.filter(m => {
        const t = new Date(m.timestamp).getTime()
        return t >= curSinceMs && t < curUntilMs
      })
      const topCandidates = inPeriod
        .slice()
        .sort((a, b) => (b.likeCount + b.commentsCount) - (a.likeCount + a.commentsCount))
        .slice(0, 5)

      const postsPromise = Promise.all(topCandidates.map(m =>
        fetch(`/api/crm-leads?source=instagram&mode=media_insights&mediaId=${m.id}&metrics=${metricsForMedia(m)}${qs}`, { credentials: 'include' })
          .then(r => r.json()).catch(e => ({ error: String(e) }))
          .then(insRes => {
            const data = (insRes && insRes.insights && insRes.insights.data) || []
            const find = name => { const d = data.find(x => x.name === name); return d && d.values && d.values[0] ? Number(d.values[0].value || 0) : 0 }
            return { ...m, reach: find('reach'), views: find('views'), savedCount: find('saved'), sharesCount: find('shares') }
          })
      ))

      return postsPromise.then(topPosts => ({
        key, igErr: null,
        ig: { profile: profileRes.profile, cur, prior, demographics, topPosts, postsInPeriod: inPeriod.length },
      }))
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

  // ---- Presentation-only derivations ------------------------------------
  // Nothing below fetches anything or recomputes a delta. Every figure is a
  // number loadIgAccount()/extractIgMetrics() already produced, either passed
  // straight through or added up across the accounts already on screen.
  const accountId = a => a.key || 'default'
  const igLive = igAccounts.filter(a => a && a.ig)
  const igBroken = igAccounts.filter(a => a && !a.ig)

  // Stable per-account hue, keyed to the account's position in the configured
  // list (which comes from the backend env var and never reorders) -- never to
  // a sort position, so @leverageedu is the same colour in the comparison
  // chart, in the switcher and on its own card whichever metric ranks first.
  // DESIGN_SYSTEM.md: colour encodes identity, not position.
  const igColor = {}
  igLive.forEach((a, i) => { igColor[accountId(a)] = brandColor(i) })

  // Derived rather than held in an effect, so a reload returning a different
  // set of accounts can never leave a stale key selected.
  const activeKey = (selectedIg && igLive.some(a => accountId(a) === selectedIg))
    ? selectedIg
    : (igLive.length ? accountId(igLive[0]) : null)
  const activeAccount = igLive.find(a => accountId(a) === activeKey) || null

  const igTotal = igLive.reduce((t, a) => ({
    followers: t.followers + (a.ig.profile.followersCount || 0),
    reach: t.reach + a.ig.cur.reach,
    reachPrior: t.reachPrior + a.ig.prior.reach,
    interactions: t.interactions + a.ig.cur.interactions,
    interactionsPrior: t.interactionsPrior + a.ig.prior.interactions,
    growth: t.growth + a.ig.cur.followerGrowth,
    growthPrior: t.growthPrior + a.ig.prior.followerGrowth,
  }), { followers: 0, reach: 0, reachPrior: 0, interactions: 0, interactionsPrior: 0, growth: 0, growthPrior: 0 })

  const cmpDef = CMP_METRICS.find(m => m.key === cmpMetric) || CMP_METRICS[0]
  const cmpRows = igLive.map(a => {
    const d = pctDelta(cmpDef.get(a.ig.cur), cmpDef.get(a.ig.prior))
    return {
      id: accountId(a),
      account: '@' + a.ig.profile.username,
      short: shortHandle(a.ig.profile.username),
      count: cmpDef.get(a.ig.cur),
      delta: typeof d === 'number' ? d : null,
      color: igColor[accountId(a)],
    }
  })
  const cmpSorted = cmpRows.slice().sort((x, y) => y.count - x.count)
  const cmpTotal = cmpRows.reduce((s, r) => s + r.count, 0)
  const cmpMax = cmpSorted.length ? cmpSorted[0].count : 0

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
            <div style={{
              display: 'flex', alignItems: 'center', gap: 2, background: 'var(--bg3)', border: '1px solid var(--card-border)',
              borderRadius: 12, padding: 4, position: 'relative',
            }}>
              {GRANULARITY_OPTIONS.map(o => (
                <GranPill key={o.key} active={granularity === o.key} onClick={() => setGranularity(o.key)}>{o.label}</GranPill>
              ))}
              <GranPill active={granularity === 'custom'} onClick={() => setCustomOpen(true)}>
                {granularity === 'custom' && customFrom && customTo ? `${customFrom} \u2192 ${customTo}` : 'Custom'}
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
            <Button size="sm" variant="secondary" icon={REFRESH_ICON} onClick={load} title="Refetch every source">Refresh</Button>
          </div>
        </div>

        <div style={{ margin: '9px 14px 0', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.navy, background: C.navyBg, borderRadius: 999, padding: '3px 9px', fontFamily: FONT }}>{compareLabel}</span>
          <span style={{ fontSize: 11.5, color: C.muted, fontFamily: FONT }}>
            {fmtRange(period.curSince, period.curUntil)} vs {fmtRange(period.priorSince, period.priorUntil)}
          </span>
        </div>

        <div style={{ padding: '14px 14px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          <Card title="Growth at a glance" sub={`Every connected channel \u00B7 ${compareLabel}`}>
            <div className="lq-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 12 }}>
              <PremKPI label="Website Organic Users" value={ga4 ? fmtN(ga4.cur.organicUsers) : '\u2014'} delta={ga4 && ga4.prior ? pctDelta(ga4.cur.organicUsers, ga4.prior.organicUsers) : null} sub={ga4 ? `vs ${period.priorLabel}` : 'pending access'} icon={ICONS.globe} accent={C.navy} accentBg={C.navyBg} />
              <PremKPI label="Instagram Reach" value={fmtN(igTotal.reach)} delta={pctDelta(igTotal.reach, igTotal.reachPrior)} sub={`${igLive.length} account${igLive.length === 1 ? '' : 's'} combined`} icon={ICONS.eye} accent={C.blue} accentBg={C.blueBg} />
              <PremKPI label="Instagram Interactions" value={fmtN(igTotal.interactions)} delta={pctDelta(igTotal.interactions, igTotal.interactionsPrior)} sub={`vs ${period.priorLabel}`} icon={ICONS.spark} accent={C.cyan} accentBg={C.cyanBg} />
              <PremKPI label="Instagram Followers" value={fmtN(igTotal.followers)} sub="all accounts, lifetime" icon={ICONS.followers} accent={C.navy} accentBg={C.navyBg} />
              <PremKPI label="Net Follower Growth" value={(igTotal.growth >= 0 ? '+' : '') + fmtN(igTotal.growth)} delta={pctDelta(igTotal.growth, igTotal.growthPrior)} sub={`vs ${period.priorLabel}`} icon={ICONS.trendUp} accent={C.green} accentBg={C.greenBg} />
              <PremKPI label="YouTube Subscribers" value={yt ? fmtN(yt.subscriberCount) : '\u2014'} sub={yt ? 'lifetime' : 'not connected'} icon={ICONS.play} accent={C.blue} accentBg={C.blueBg} />
            </div>
          </Card>

          <div className="lq-grid2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

            <Card title="Website" sub={ga4 ? `Organic Search channel \u00B7 ${compareLabel}` : 'Google Analytics 4'}>
              {ga4 ? (
                <>
                  <div className="lq-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                    <PremKPI label="Organic Users" value={fmtN(ga4.cur.organicUsers)} delta={ga4.prior ? pctDelta(ga4.cur.organicUsers, ga4.prior.organicUsers) : null} sub={`vs ${period.priorLabel}`} icon={ICONS.globe} accent={C.navy} accentBg={C.navyBg} />
                    <PremKPI label="Total Users" value={fmtN(ga4.cur.totalUsers)} delta={ga4.prior ? pctDelta(ga4.cur.totalUsers, ga4.prior.totalUsers) : null} sub={`vs ${period.priorLabel}`} icon={ICONS.eye} accent={C.blue} accentBg={C.blueBg} />
                    <PremKPI label="Organic %" value={ga4.cur.organicPct.toFixed(1) + '%'} delta={ga4.prior ? pctDelta(ga4.cur.organicPct, ga4.prior.organicPct) : null} sub={`vs ${period.priorLabel}`} icon={ICONS.pct} accent={C.cyan} accentBg={C.cyanBg} />
                  </div>
                  <div style={{ marginTop: 18 }}>
                    <SubHead right={`${fmtN(ga4.cur.organicUsers)} of ${fmtN(ga4.cur.totalUsers)}`}>Organic share of all traffic</SubHead>
                    <SplitBar share={ga4.cur.organicPct} color={C.navy} label={`${ga4.cur.organicPct.toFixed(1)}% arrived from organic search; the remainder came from every other channel.`} />
                  </div>
                </>
              ) : (
                <PendingNote title="Pending" detail="Waiting on GA4 property access to be granted to the Quantum reader service account." />
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
                    <div style={{ gridColumn: 'span 3' }}>
                      <PendingNote title="Views &amp; watch time &mdash; pending" detail="Blocked on a Google Workspace admin trust grant for the Analytics API scope." />
                    </div>
                  )}
                </div>
              ) : (
                <PendingNote title="Not connected" />
              )}
            </Card>

          </div>

          {/* The primary visual story. Absolute scale and growth rate sit
              side by side on purpose: @leverageedu carries several hundred
              times the reach of @leveragembbs, so an absolute chart alone
              draws every smaller account as an invisible sliver and says
              nothing at all about momentum. */}
          {igLive.length > 0 && (
            <Card
              title="Instagram account comparison"
              sub={`${igLive.length} connected account${igLive.length === 1 ? '' : 's'} \u00B7 ${compareLabel}`}
              action={
                <Dropdown
                  options={CMP_METRICS.map(m => ({ value: m.key, label: m.label }))}
                  value={cmpDef.key}
                  onChange={setCmpMetric}
                  minWidth={158}
                />
              }
            >
              <div className="lq-grid2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                <div>
                  <SubHead right={`${fmtN(cmpTotal)} combined`}>{cmpDef.label} by account</SubHead>
                  <RankedBars
                    data={cmpSorted}
                    labelKey="account"
                    max={cmpMax}
                    total={cmpTotal}
                    colorFn={i => (cmpSorted[i] ? cmpSorted[i].color : C.navy)}
                    showRank
                  />
                </div>
                <div>
                  <SubHead right={`vs ${period.priorLabel}`}>Growth in {cmpDef.label.toLowerCase()}</SubHead>
                  <GrowthBars rows={cmpSorted} />
                  <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, marginTop: 8, lineHeight: 1.45 }}>
                    Percentage change per account on one shared scale, so a small account growing fast is as visible as a large one standing still. Bars above the line grew, bars below it shrank.
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* One account on screen at a time instead of four stacked
              full-width repeats of the same fifteen tiles. Every account is
              already loaded; this only chooses which one is shown. */}
          {igLive.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: FONT, marginRight: 2 }}>Account</span>
              {igLive.map(a => {
                const id = accountId(a)
                return (
                  <Button
                    key={id}
                    size="sm"
                    variant={id === activeKey ? 'primary' : 'secondary'}
                    onClick={() => setSelectedIg(id)}
                    title={`@${a.ig.profile.username} \u00B7 ${fmtN(a.ig.profile.followersCount)} followers`}
                    icon={a.ig.profile.profilePictureUrl
                      ? <img src={a.ig.profile.profilePictureUrl} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                      : <span style={{ display: 'block', width: '100%', height: '100%', borderRadius: '50%', background: igColor[id] }} />}
                  >
                    @{a.ig.profile.username}
                  </Button>
                )
              })}
            </div>
          )}

          {activeAccount && (
            <IgAccountCard
              key={activeKey}
              ig={activeAccount.ig}
              hue={igColor[activeKey] || C.navy}
              slug={String(activeKey)}
              period={period}
              compareLabel={compareLabel}
            />
          )}

          {igBroken.map(({ key, igErr }) => (
            <Card key={key || 'default'} title="Instagram" sub="Live">
              <PendingNote
                title={igErr === 'not_configured' ? 'Not connected yet' : 'Temporarily unavailable'}
                detail={igErr && igErr !== 'not_configured' ? String(igErr).slice(0, 160) : null}
              />
            </Card>
          ))}

          {/* LinkedIn/X: manual weekly entries, deliberately NOT driven by the
              toolbar above -- the underlying data only ever exists at
              one-row-per-week granularity (typed into Settings), so "Today"
              or "YTD" has nothing real to show. Its own week browser instead
              of silently breaking under a toolbar it cannot answer to. */}
          <Card
            title="LinkedIn &amp; X"
            sub="Manually entered, week by week"
            action={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg3)', border: '1px solid var(--card-border)', borderRadius: 12, padding: '4px 6px' }}>
                <WeekArrow dir={-1} onClick={() => setWeekStart(w => addDays(w, -7))} />
                <div style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: FONT, minWidth: 110, textAlign: 'center' }}>
                  {fmtLabel(weekStart)} &ndash; {fmtLabel(weekEnd)} {isCurrentWeek && <span style={{ color: C.blue }}>(this week)</span>}
                </div>
                <WeekArrow dir={1} onClick={() => setWeekStart(w => addDays(w, 7))} disabled={weekStart.getTime() >= thisMonday.getTime()} />
              </div>
            }
          >
            <div className="lq-grid2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              <ManualPlatform name="LinkedIn" hue={C.navy} week={linkedinWeek} reachLabel="Unique visitors" />
              <ManualPlatform name="X (Twitter)" hue={C.cyan} week={xWeek} reachLabel="Reach" />
            </div>
          </Card>

        </div>
      </div>
    </div>
  )
}

const REFRESH_ICON = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a9 9 0 1 1-3.22-6.93" /><polyline points="21 3 21 9 15 9" />
  </svg>
)

// Metrics the account-comparison card can plot. Volume metrics only, on
// purpose: RankedBars states each account's share of a combined total, which
// is meaningful for a count and meaningless for a rate, and every one of these
// has a real prior-period figure so the growth chart beside it is never empty.
// Engagement rate and follower totals still appear in full on each account's
// own card, where no share-of-total reading is implied.
const CMP_METRICS = [
  { key: 'reach', label: 'Reach', get: m => m.reach },
  { key: 'interactions', label: 'Interactions', get: m => m.interactions },
  { key: 'engaged', label: 'Accounts engaged', get: m => m.engaged },
  { key: 'profileViews', label: 'Profile views', get: m => m.profileViews },
  { key: 'views', label: 'Content views', get: m => m.views },
]

const shortHandle = u => (String(u).length > 14 ? String(u).slice(0, 13) + '\u2026' : String(u))

// Short axis ticks in the same en-IN units fmtN already uses for every full
// number on this page, so an axis never disagrees with the KPI above it.
function compactN(n) {
  const v = Number(n || 0)
  const a = Math.abs(v)
  const trim = x => x.toFixed(1).replace(/\.0$/, '')
  if (a >= 1e7) return trim(v / 1e7) + 'Cr'
  if (a >= 1e5) return trim(v / 1e5) + 'L'
  if (a >= 1000) return trim(v / 1000) + 'k'
  return String(Math.round(v))
}

const SubHead = ({ children, right }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
    <div style={{ fontSize: 10.5, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: FONT }}>{children}</div>
    {right && <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{right}</div>}
  </div>
)

// Every "this source isn't reporting yet" state on the page in one shape --
// they were four separately hand-styled blocks all saying the same kind of
// thing in slightly different type sizes.
const PendingNote = ({ title, detail }) => (
  <div style={{ padding: '14px 4px', textAlign: 'center' }}>
    <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, fontFamily: FONT }}>{title}</div>
    {detail && <div style={{ fontSize: 12, color: C.muted, fontFamily: FONT, marginTop: 4, lineHeight: 1.5, maxWidth: 430, marginLeft: 'auto', marginRight: 'auto' }}>{detail}</div>}
  </div>
)

// Green for up, navy for down. Deliberately not red for a fall: red and amber
// are reserved for genuine error and warning states in this codebase, and a
// metric being down is data, not a fault.
const DeltaPill = ({ delta }) => {
  if (delta == null) return null
  if (delta === 'new') {
    return <span style={{ fontSize: 10, fontWeight: 800, fontFamily: FONT, borderRadius: 999, padding: '2px 6px', color: C.green, background: C.greenBg }}>New</span>
  }
  const up = delta >= 0
  return (
    <span style={{
      fontSize: 10, fontWeight: 800, fontFamily: FONT, borderRadius: 999, padding: '2px 6px', whiteSpace: 'nowrap',
      color: up ? C.green : C.navy, background: up ? C.greenBg : C.navyBg,
    }}>
      {up ? '\u25B2' : '\u25BC'} {Math.abs(delta).toFixed(1)}%
    </span>
  )
}

// The ten supporting Instagram metrics: same numbers, same deltas as before,
// at a density that reads as a reference table rather than ten more headline
// cards competing with the five that actually matter.
const MiniMetric = ({ label, value, delta }) => (
  <div style={{ border: '1px solid var(--card-border)', borderRadius: 12, background: 'var(--bg3)', padding: '9px 11px', minWidth: 0 }}>
    <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, fontFamily: FONT, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 16, fontWeight: 800, color: C.text, fontFamily: FONT, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      <DeltaPill delta={delta} />
    </div>
  </div>
)

// One share against its remainder. NEUTRAL_TRACK is the design system's
// designated colour for the leftover part of a bar -- it is not a data series
// of its own and must not take a brand hue.
const SplitBar = ({ share, color, label }) => {
  const w = Math.max(0, Math.min(100, Number(share) || 0))
  return (
    <div>
      <div style={{ height: 9, borderRadius: 99, background: NEUTRAL_TRACK, overflow: 'hidden' }}>
        <div style={{ width: w + '%', height: '100%', borderRadius: 99, background: `linear-gradient(90deg, ${color}, ${color}aa)`, transition: 'width .6s cubic-bezier(.4,0,.2,1)' }} />
      </div>
      {label && <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, marginTop: 6, lineHeight: 1.45 }}>{label}</div>}
    </div>
  )
}

const ChartTip = ({ active, payload, label, suffix }) => {
  if (!active || !payload || !payload.length) return null
  const v = Number(payload[0].value)
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 10, padding: '7px 10px', boxShadow: '0 10px 28px rgba(15,23,42,0.14)', fontFamily: FONT }}>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13.5, fontWeight: 800, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
        {suffix === '%' ? (v >= 0 ? '+' : '') + v.toFixed(1) + '%' : fmtN(v)}
      </div>
    </div>
  )
}

// Daily reach. One series, one hue, gradient fill -- the design system's
// standard treatment. The values come from the same time_series response the
// Reach KPI above already sums, so the line and the tile can never disagree.
const ReachTrend = ({ series, color, slug }) => (
  <ResponsiveContainer width="100%" height={112}>
    <AreaChart data={series} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
      <defs><BarGrad id={gradId(slug, 'reach')} color={color} from={0.4} to={0.02} /></defs>
      <CartesianGrid vertical={false} stroke={GRID_STROKE} />
      <XAxis dataKey="d" axisLine={false} tickLine={false} minTickGap={20} interval="preserveStartEnd" tick={{ fontSize: 10, fill: C.muted, fontFamily: FONT }} />
      <YAxis axisLine={false} tickLine={false} width={40} tickFormatter={compactN} tick={{ fontSize: 10, fill: C.muted, fontFamily: FONT }} />
      <Tooltip content={<ChartTip />} />
      <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={barFill(gradId(slug, 'reach'))} />
    </AreaChart>
  </ResponsiveContainer>
)

// Net follower change per day. A bar chart rather than an area because the
// value is a signed daily delta, not a level -- days the account lost
// followers belong below the zero line, not as a dip in a filled curve.
const FollowerTrend = ({ series, slug }) => (
  <ResponsiveContainer width="100%" height={112}>
    <BarChart data={series} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
      <defs>
        <BarGrad id={gradId(slug, 'fup')} color={C.green} />
        <BarGrad id={gradId(slug, 'fdn')} color={C.navy} />
      </defs>
      <CartesianGrid vertical={false} stroke={GRID_STROKE} />
      <XAxis dataKey="d" axisLine={false} tickLine={false} minTickGap={20} interval="preserveStartEnd" tick={{ fontSize: 10, fill: C.muted, fontFamily: FONT }} />
      <YAxis axisLine={false} tickLine={false} width={40} tickFormatter={compactN} tick={{ fontSize: 10, fill: C.muted, fontFamily: FONT }} />
      <Tooltip content={<ChartTip />} />
      <ReferenceLine y={0} stroke={C.muted} strokeOpacity={0.45} />
      <Bar dataKey="v" radius={BAR_RADIUS} maxBarSize={BAR_MAX}>
        {series.map((p, i) => <Cell key={i} fill={barFill(gradId(slug, p.v >= 0 ? 'fup' : 'fdn'))} />)}
      </Bar>
    </BarChart>
  </ResponsiveContainer>
)

// Period-over-period change per account. Two hues in one series is a
// deliberate exception to "one series, one hue": here the hue encodes the
// SIGN of the value, which is real information, not sort position -- and it
// stays inside the brand palette (green up, navy down) rather than reaching
// for the red reserved for error states.
const GrowthBars = ({ rows }) => {
  const data = rows.filter(r => typeof r.delta === 'number')
  if (!data.length) {
    return <PendingNote title="No comparison available" detail="The prior period has no figures for these accounts yet, so there is nothing to measure growth against." />
  }
  return (
    <ResponsiveContainer width="100%" height={196}>
      <BarChart data={data} margin={{ top: 8, right: 6, left: 0, bottom: 0 }}>
        <defs>
          <BarGrad id={gradId('oscmp', 'up')} color={C.green} />
          <BarGrad id={gradId('oscmp', 'dn')} color={C.navy} />
        </defs>
        <CartesianGrid vertical={false} stroke={GRID_STROKE} />
        <XAxis dataKey="short" axisLine={false} tickLine={false} interval={0} tick={{ fontSize: 10, fill: C.muted, fontFamily: FONT }} />
        <YAxis axisLine={false} tickLine={false} width={46} tickFormatter={v => Math.round(v) + '%'} tick={{ fontSize: 10, fill: C.muted, fontFamily: FONT }} />
        <Tooltip content={<ChartTip suffix="%" />} />
        <ReferenceLine y={0} stroke={C.muted} strokeOpacity={0.55} />
        <Bar dataKey="delta" radius={BAR_RADIUS} maxBarSize={BAR_MAX}>
          {data.map(r => <Cell key={r.id} fill={barFill(gradId('oscmp', r.delta >= 0 ? 'up' : 'dn'))} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// One Instagram account in full. Same fifteen metrics, same deltas, same
// audience and top-post data as before -- re-tiered so the five that answer
// "how is this account doing" lead, the daily trend that answers "which way
// is it going" sits beside them, and the ten supporting counts read as a
// reference strip underneath instead of fifteen equal-weight tiles.
function IgAccountCard({ ig, hue, slug, period, compareLabel }) {
  const p = ig.profile
  const reachSeries = ig.cur.reachSeries || []
  const followerSeries = ig.cur.followerSeries || []
  const hasTrend = reachSeries.length > 1 || followerSeries.length > 1
  const secondary = [
    { label: 'Profile Views', v: ig.cur.profileViews, prior: ig.prior.profileViews },
    { label: 'Accounts Engaged', v: ig.cur.engaged, prior: ig.prior.engaged },
    { label: 'Content Views', v: ig.cur.views, prior: ig.prior.views },
    { label: 'Likes', v: ig.cur.likes, prior: ig.prior.likes },
    { label: 'Comments', v: ig.cur.comments, prior: ig.prior.comments },
    { label: 'Shares', v: ig.cur.shares, prior: ig.prior.shares },
    { label: 'Saves', v: ig.cur.saves, prior: ig.prior.saves },
    { label: 'Replies', v: ig.cur.replies, prior: ig.prior.replies },
    { label: 'Website Clicks', v: ig.cur.websiteClicks, prior: ig.prior.websiteClicks },
    { label: 'Profile Link Taps', v: ig.cur.profileLinkTaps, prior: ig.prior.profileLinkTaps },
  ]
  return (
    <Card title="Instagram" sub={`@${p.username} \u00B7 ${compareLabel}`}>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, paddingBottom: 14, marginBottom: 16, borderBottom: '1px solid var(--card-border)' }}>
        {p.profilePictureUrl && (
          <img src={p.profilePictureUrl} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, boxShadow: `0 0 0 2px var(--card), 0 0 0 4px ${hue}` }} />
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14.5, fontWeight: 800, color: C.text, fontFamily: FONT }}>@{p.username}</span>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: hue, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: C.muted, fontFamily: FONT }}>{fmtN(p.followersCount)} followers</span>
          </div>
          {p.biography && (
            <div style={{ fontSize: 12, color: C.muted, fontFamily: FONT, whiteSpace: 'pre-line', marginTop: 4, lineHeight: 1.5 }}>
              {p.biography}
              {p.website && (
                <>{' '}&middot;{' '}<a href={p.website} target="_blank" rel="noreferrer" style={{ color: C.blue, textDecoration: 'none', fontWeight: 700 }}>{p.website.replace(/^https?:\/\//, '')}</a></>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="lq-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12 }}>
        <PremKPI label="Followers" value={fmtN(p.followersCount)} sub="lifetime" icon={ICONS.followers} accent={C.navy} accentBg={C.navyBg} />
        <PremKPI label="Net Follower Growth" value={(ig.cur.followerGrowth >= 0 ? '+' : '') + fmtN(ig.cur.followerGrowth)} delta={pctDelta(ig.cur.followerGrowth, ig.prior.followerGrowth)} sub={`vs ${period.priorLabel}`} icon={ICONS.trendUp} accent={C.green} accentBg={C.greenBg} />
        <PremKPI label="Reach" value={fmtN(ig.cur.reach)} delta={pctDelta(ig.cur.reach, ig.prior.reach)} sub={`vs ${period.priorLabel}`} icon={ICONS.eye} accent={C.blue} accentBg={C.blueBg} />
        <PremKPI label="Interactions" value={fmtN(ig.cur.interactions)} delta={pctDelta(ig.cur.interactions, ig.prior.interactions)} sub={`vs ${period.priorLabel}`} icon={ICONS.spark} accent={C.cyan} accentBg={C.cyanBg} />
        <PremKPI label="Engagement Rate" value={ig.cur.engagementRate.toFixed(2) + '%'} delta={pctDelta(ig.cur.engagementRate, ig.prior.engagementRate)} sub={`vs ${period.priorLabel}`} icon={ICONS.pct} accent={C.navy} accentBg={C.navyBg} />
      </div>

      {/* Trend, from the per-day values Instagram already returned inside the
          very responses the Reach and Net Follower Growth tiles above are
          sums of. No extra request is made to draw either chart. */}
      <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--card-border)' }}>
        {hasTrend ? (
          <div className="lq-grid2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div>
              <SubHead right={`${fmtN(ig.cur.reach)} total`}>Reach per day</SubHead>
              <ReachTrend series={reachSeries} color={hue} slug={slug} />
            </div>
            <div>
              <SubHead right={`${ig.cur.followerGrowth >= 0 ? '+' : ''}${fmtN(ig.cur.followerGrowth)} net`}>Followers gained per day</SubHead>
              <FollowerTrend series={followerSeries} slug={slug} />
            </div>
          </div>
        ) : (
          <PendingNote
            title="Daily trend needs more than one day"
            detail={`${period.curLabel} covers a single day, so there is no day-by-day shape to plot yet. Switch the range to Week, Month or a custom span to see reach and follower movement over time.`}
          />
        )}
      </div>

      <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--card-border)' }}>
        <SubHead right={`all vs ${period.priorLabel}`}>Everything else in this period</SubHead>
        <div className="lq-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10 }}>
          {secondary.map(s => (
            <MiniMetric key={s.label} label={s.label} value={fmtN(s.v)} delta={pctDelta(s.v, s.prior)} />
          ))}
        </div>
      </div>

      <AudienceSection demographics={ig.demographics} hue={hue} />
      <TopPostsSection posts={ig.topPosts} postsInPeriod={ig.postsInPeriod} curLabel={period.curLabel} />
    </Card>
  )
}

// Lifetime snapshot (Instagram ignores the date range on these metrics) --
// who follows this account, by country and by age band. Not comparable
// period-over-period, so no delta: just the current picture. Both lists are
// now the shared RankedBars, which is what this page was reimplementing by
// hand with raw flexbox rows before.
function AudienceSection({ demographics, hue }) {
  const { countries, ages, genders } = demographics || {}
  const hasCountries = countries && countries.length > 0
  const hasAges = ages && ages.length > 0
  const hasGenders = genders && genders.length > 0
  if (!hasCountries && !hasAges && !hasGenders) return null

  const countryRows = hasCountries ? countries.map(c => ({ country: countryNameOf(c.key), count: c.value })) : []
  const countryTotal = countryRows.reduce((s, r) => s + r.count, 0)
  const ageRows = hasAges ? ages.slice().sort((a, b) => b.value - a.value).map(a => ({ band: a.key, count: a.value })) : []
  const ageTotal = ageRows.reduce((s, r) => s + r.count, 0)
  const genderTotal = hasGenders ? genders.reduce((s, g) => s + g.value, 0) : 0
  const GENDER_LABEL = { M: 'Male', F: 'Female', U: 'Unspecified' }
  // Unspecified is an unknown bucket, not a category of its own -- the design
  // system reserves NEUTRAL_GREY for exactly that and keeps it out of the ramp.
  const GENDER_HUE = { M: C.blue, F: C.cyan, U: NEUTRAL_GREY }

  return (
    <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--card-border)' }}>
      <SubHead right="lifetime snapshot, not period-bound">Audience</SubHead>
      <div className="lq-grid2" style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: 24 }}>
        <div>
          <SubHead right={hasCountries ? `${fmtN(countryTotal)} followers placed` : null}>Top countries</SubHead>
          {hasCountries ? (
            <RankedBars data={countryRows} labelKey="country" max={countryRows[0].count} total={countryTotal} color={hue} showRank />
          ) : (
            <PendingNote title="Not available" detail="Instagram withholds follower demographics for accounts below its own audience-size privacy threshold." />
          )}
        </div>
        <div>
          <SubHead>Age &amp; gender</SubHead>
          {hasGenders && (
            <div style={{ marginBottom: 14 }}>
              {genders.map(g => (
                <div key={g.key} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontFamily: FONT, marginBottom: 4 }}>
                    <span style={{ color: C.text, fontWeight: 600 }}>{GENDER_LABEL[g.key] || g.key}</span>
                    <span style={{ color: C.muted, fontVariantNumeric: 'tabular-nums' }}>{genderTotal > 0 ? ((g.value / genderTotal) * 100).toFixed(0) : 0}%</span>
                  </div>
                  <SplitBar share={genderTotal > 0 ? (g.value / genderTotal) * 100 : 0} color={GENDER_HUE[g.key] || NEUTRAL_GREY} />
                </div>
              ))}
            </div>
          )}
          {hasAges ? (
            <RankedBars data={ageRows} labelKey="band" max={ageRows[0].count} total={ageTotal} color={C.cyan} />
          ) : (
            // Previously this column rendered as a bare heading with nothing
            // underneath it whenever Instagram withheld the breakdown, which
            // looked like a broken card rather than a privacy floor.
            <PendingNote title="Not available" detail="Instagram withholds the age and gender breakdown until an account's audience passes its privacy threshold." />
          )}
        </div>
      </div>
    </div>
  )
}

const PostStat = ({ icon, value, title }) => (
  <span title={title} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
    <span style={{ display: 'flex', width: 12, height: 12, opacity: 0.65 }}>{icon}</span>
    {fmtN(value)}
  </span>
)

// The five posts (of whatever is in the current period) with the most likes +
// comments, each with full insights fetched fresh -- the "what actually drove
// the numbers above" answer the headline KPIs cannot give. Ranking logic
// untouched; only the row treatment changed.
function TopPostsSection({ posts, postsInPeriod, curLabel }) {
  if (!posts || !posts.length) {
    return (
      <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--card-border)' }}>
        <SubHead>Top posts</SubHead>
        <div style={{ fontSize: 12, color: C.muted, fontFamily: FONT }}>No posts published in this period.</div>
      </div>
    )
  }
  return (
    <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--card-border)' }}>
      <SubHead right={`${postsInPeriod} posted this period`}>Top posts ({curLabel})</SubHead>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {posts.map((p, i) => (
          <a
            key={p.id}
            href={p.permalink}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'flex', gap: 11, textDecoration: 'none', alignItems: 'center',
              border: '1px solid var(--card-border)', borderRadius: 12, padding: 8, background: 'var(--card)',
            }}
          >
            <span style={{ width: 20, textAlign: 'center', fontSize: 12, fontWeight: 800, color: '#fff', background: brandColor(i), borderRadius: 6, padding: '2px 0', flexShrink: 0, fontFamily: FONT }}>{i + 1}</span>
            {p.thumbnailUrl && (
              <img src={p.thumbnailUrl} alt="" style={{ width: 44, height: 44, borderRadius: 9, objectFit: 'cover', flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, color: C.text, fontFamily: FONT, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {(p.caption || '(no caption)').split('\n')[0]}
              </div>
              <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, marginTop: 2 }}>
                {new Date(p.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} &middot; {p.mediaProductType || p.mediaType}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 14, flexShrink: 0, fontSize: 11.5, fontFamily: FONT, color: C.muted, fontVariantNumeric: 'tabular-nums' }}>
              <PostStat icon={ICONS.eye} value={p.reach} title="Reach" />
              {p.views > 0 && <PostStat icon={ICONS.play} value={p.views} title="Views" />}
              <PostStat icon={ICONS.heart} value={p.likeCount} title="Likes" />
              <PostStat icon={ICONS.comment} value={p.commentsCount} title="Comments" />
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}

// LinkedIn or X for one manually entered week.
function ManualPlatform({ name, hue, week, reachLabel }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: 3, background: hue, flexShrink: 0 }} />
        <span style={{ fontSize: 12.5, fontWeight: 800, color: C.text, fontFamily: FONT }}>{name}</span>
      </div>
      {week ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontFamily: FONT }}>
          <Row label="Followers" value={fmtN(week.followers)} />
          <Row label="Impressions" value={fmtN(week.views)} />
          <Row label={reachLabel} value={fmtN(week.reach)} />
          <Row label="Interactions" value={fmtN(week.interactions)} />
          <Row label="Engagement rate" value={week.engagementRate != null ? week.engagementRate + '%' : '\u2014'} />
        </div>
      ) : (
        <div style={{ fontSize: 12, color: C.muted, fontFamily: FONT, lineHeight: 1.5 }}>
          No entry for this week yet &mdash; add it in Settings &gt; Data.
        </div>
      )}
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, borderBottom: '1px dashed var(--card-border)', paddingBottom: 6 }}>
      <span style={{ color: C.muted }}>{label}</span>
      <span style={{ fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )
}
