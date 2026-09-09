import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import Sidebar from '../components/Sidebar'
import Button from '../components/Button'
import { C, FONT, BRAND_RAMP } from '../ui/dashboardKit'
import { BRAND_LOGO_BARS, BRAND_LOGO_VIEWBOX, BRAND_LOGO_RX } from '../../shared/brandLogo.mjs'
import { fetchOverallBqAggRows, fetchOverallBqSyncedAt } from '../lib/overallBqCache.js'
// Same canonical Source -> channel mapping already used by Ask AI's own
// contribution-analysis tool (Facebook -> Meta Ads, Google -> Google Ads,
// Content+Brand -> Organic, else -> Other) -- reused here rather than
// inventing a second classification that could silently drift from it.
import { mapChannel as reviewMapChannel, CHANNELS as REVIEW_CHANNELS } from '../lib/overallFunnelCache.js'
import styles from './MarketingReviewDashboard.module.css'

// A dedicated, presentation-first review surface for the monthly Marketing
// review -- NOT a dashboard page with a "Present" button bolted on. It has
// its own full slide-control set (thumbnail navigator, complete keyboard
// nav, progress + section labels, export, print view, fullscreen/no-chrome,
// reporting-period labeling on every data slide) rather than relying on the
// generic auto-detect Present tool (src/components/PresentationTool.jsx),
// which is built for turning an arbitrary dashboard's Cards into a slideshow,
// not for a purpose-built cinematic deck with its own background treatment
// per slide.
//
// PLACEHOLDER CONTENT: every figure below is clearly labeled sample data.
// Real slide content/data sources are still pending from the business side --
// see CLAUDE.md's dated entry for this page. Swap SLIDES' Body components'
// numbers for real ones (or a real data fetch) once that's provided; the
// deck engine (canvas sizing, transitions, navigator, keyboard, export,
// print, fullscreen) needs no change to support real data.

const SLIDE_W = 1280
const SLIDE_H = 720
const NAVY = C.navy, BLUE = C.blue, CYAN = C.cyan, GREEN = C.green

// Most recently COMPLETED calendar month -- a monthly review covers the
// month that just finished, not the in-progress one. Shared by the plain
// display string below AND the headline-table month math (computeReviewMonths),
// so the two can never disagree about which month "this review" means.
function mostRecentCompletedMonth() {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return d
}
function defaultReviewPeriod() {
  return mostRecentCompletedMonth().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function fmtINR(n) { return '₹' + Math.round(n).toLocaleString('en-IN') }
function fmtN(n) { return Math.round(n).toLocaleString('en-IN') }
// Cr/L shorthand -- same convention as OverallDashboard.jsx's own fmtINRShort:
// primary display on the headline table's money cells, exact fmtINR figure
// in a hover tooltip.
function fmtINRShort(n) {
  n = parseFloat(n) || 0
  if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr'
  if (n >= 1e5) return '₹' + (n / 1e5).toFixed(1) + 'L'
  return '₹' + Math.round(n).toLocaleString('en-IN')
}
function monthShort(d) { return d.toLocaleDateString('en-US', { month: 'short' }) + "'" + String(d.getFullYear()).slice(-2) }

/* ---------- headline-slide month math + live-data aggregation ----------
   The BigQuery-backed agg table (overall_bq_daily_agg, read via the same
   overallBqCache.js module the live /dashboard/overall-bigquery page reads)
   is a small, fast, pre-aggregated day+Source table -- no campaign_name, so
   it cannot replicate a per-CAMPAIGN cost exclusion. cost_excluded_campaign_
   patterns is currently EMPTY in app_preferences (checked live, 2026-09-09),
   so Overall's own costSpend === spend today and this aggregate matches
   Overall's CPL/CPQL/CPA formula exactly as it currently stands. If that list
   is ever populated, re-check this slide's numbers against the live Overall
   dashboard for the same month before trusting them again. */

const REVIEW_MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
function monthKeyStr(d) { return REVIEW_MONTH_NAMES[d.getMonth()] + "'" + d.getFullYear() }
function isoDate(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
function monthStartOf(d) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function monthEndOf(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0) }
function ymOf(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') }

// The 3 trailing months shown as table columns, plus the same month last
// year -- used only for the "vs last year" delta, never shown as its own
// column.
function computeReviewMonths() {
  const current = mostRecentCompletedMonth()
  const prior = new Date(current.getFullYear(), current.getMonth() - 1, 1)
  const twoBack = new Date(current.getFullYear(), current.getMonth() - 2, 1)
  const lastYear = new Date(current.getFullYear() - 1, current.getMonth(), 1)
  return { current, prior, twoBack, lastYear }
}

function reviewNum(v) { return Number(v) || 0 }

// Sums the agg table's rows down to one month, replicating
// OverallDashboard.jsx's own kpis/paidKpis/cpl/cpql/cpa formulas: Spend,
// Leads, QL (Human+AI+Superbot combined) and Apps are plain totals across
// every row; CPL/CPQL/CPA divide by the PAID-ONLY subset -- leads/QL/apps
// from Sources that had ANY spend that month. Overall found the
// unrestricted denominator understated CPL by ~26% on real data. "Paid" is
// judged per Source (not per row), matching Overall's own classification.
function aggregateReviewMonth(rows, key) {
  const bySource = new Map()
  for (const r of rows) {
    if (r.month !== key) continue
    const src = r.Source || 'Unknown'
    const e = bySource.get(src) || { leads: 0, ql: 0, apps: 0, spend: 0, queued: 0 }
    e.leads += reviewNum(r['Total Leads Generated'])
    e.ql += reviewNum(r['Futwork Human QL']) + reviewNum(r['Futwork AI QL']) + reviewNum(r['Superbot AI QL'])
    e.apps += reviewNum(r['Total Apps'])
    e.spend += reviewNum(r['Total_Spends'])
    // Total Queued (funnel slide only) -- same 4 fields Overall's own
    // "Queued" KPI card sums: directly-to-floor plus all 3 Futwork/Superbot
    // queues. Additive-only field; doesn't touch anything slide 3 reads.
    e.queued += reviewNum(r['floor_queued']) + reviewNum(r['Queued on Futwork Human']) + reviewNum(r['Queued on Futwork AI']) + reviewNum(r['Queued on Superbot'])
    bySource.set(src, e)
  }
  let leads = 0, ql = 0, apps = 0, spend = 0, queued = 0, paidLeads = 0, paidQl = 0, paidApps = 0
  for (const e of bySource.values()) {
    leads += e.leads; ql += e.ql; apps += e.apps; spend += e.spend; queued += e.queued
    if (e.spend > 0) { paidLeads += e.leads; paidQl += e.ql; paidApps += e.apps }
  }
  return {
    hasData: bySource.size > 0, leads, ql, apps, spend, queued,
    cpl: paidLeads > 0 ? spend / paidLeads : null,
    cpql: paidQl > 0 ? spend / paidQl : null,
    cpa: paidApps > 0 ? spend / paidApps : null,
  }
}

// Same source rows, rolled up by CHANNEL (Meta Ads/Google Ads/Remarketing/
// Affiliate/Organic/Other) instead of the whole business -- feeds the
// "Where the QLs came from" slide (every channel) and the 3 per-channel
// spotlight slides (Google Ads/Meta Ads/Organic only). Because the 3
// spotlighted channels each map 1:1 from a single Source (Facebook/Google/
// Content+Brand), judging "paid" per channel-total here gives the identical
// answer as judging it per-Source the way aggregateReviewMonth does -- only
// the "Other" bucket (several merged, mostly-unpaid Sources) could in
// principle differ, and that bucket is never shown on its own slide.
function aggregateReviewMonthByChannel(rows, key) {
  const bySource = new Map()
  for (const r of rows) {
    if (r.month !== key) continue
    const src = r.Source || 'Unknown'
    const e = bySource.get(src) || { leads: 0, ql: 0, apps: 0, spend: 0 }
    e.leads += reviewNum(r['Total Leads Generated'])
    e.ql += reviewNum(r['Futwork Human QL']) + reviewNum(r['Futwork AI QL']) + reviewNum(r['Superbot AI QL'])
    e.apps += reviewNum(r['Total Apps'])
    e.spend += reviewNum(r['Total_Spends'])
    bySource.set(src, e)
  }
  const byChannel = new Map()
  for (const [src, e] of bySource) {
    const ch = reviewMapChannel(src)
    const c = byChannel.get(ch) || { leads: 0, ql: 0, apps: 0, spend: 0 }
    c.leads += e.leads; c.ql += e.ql; c.apps += e.apps; c.spend += e.spend
    byChannel.set(ch, c)
  }
  for (const c of byChannel.values()) {
    c.hasData = true
    c.cpl = c.spend > 0 && c.leads > 0 ? c.spend / c.leads : null
    c.cpql = c.spend > 0 && c.ql > 0 ? c.spend / c.ql : null
    c.cpa = c.spend > 0 && c.apps > 0 ? c.spend / c.apps : null
  }
  return byChannel
}

// Same 3-months + 2-deltas shape as buildHeadlineRows, scoped to one
// channel -- AC Sales/CPS are dropped since neither has a real per-channel
// figure (AC Sales is a whole-business manual entry).
function buildChannelRows(months, byChannelByMonth, channel) {
  const emptyAgg = { hasData: false, leads: null, ql: null, apps: null, spend: null, cpl: null, cpql: null, cpa: null }
  const at = m => byChannelByMonth[m].get(channel) || emptyAgg
  const metric = (label, key, invert, money, getter) => {
    const v2 = getter(at('twoBack')), v1 = getter(at('prior'))
    const v0 = getter(at('current')), vLY = getter(at('lastYear'))
    return {
      key, label, invert, money,
      values: [v2, v1, v0],
      deltaVsPrior: reviewPctDelta(v0, v1), priorForDeltaVsPrior: v1,
      deltaVsLastYear: reviewPctDelta(v0, vLY), priorForDeltaVsLastYear: vLY,
    }
  }
  return [
    metric('Spend', 'spend', true, true, a => a.hasData ? a.spend : null),
    metric('Leads', 'leads', false, false, a => a.hasData ? a.leads : null),
    metric('QL', 'ql', false, false, a => a.hasData ? a.ql : null),
    metric('Apps', 'apps', false, false, a => a.hasData ? a.apps : null),
    metric('CPL', 'cpl', true, true, a => a.cpl),
    metric('CPQL', 'cpql', true, true, a => a.cpql),
    metric('CPA', 'cpa', true, true, a => a.cpa),
  ]
}

// null when either side is missing (nothing to compare); the sentinel
// string 'new' when the prior period was genuinely zero and this one isn't
// -- a percentage off a zero base is noise, not signal.
function reviewPctDelta(cur, prev) {
  if (cur == null || prev == null) return null
  if (prev === 0) return cur === 0 ? null : 'new'
  return ((cur - prev) / prev) * 100
}

// One row per metric on the headline table. `invert` matches PremKPI's own
// convention (dashboardKit.jsx) -- true for cost/spend metrics, where a
// DECREASE is the good direction; false for volume/outcome metrics.
function buildHeadlineRows(months, aggByMonth, acSales) {
  const ac2 = acSales[ymOf(months.twoBack)], ac1 = acSales[ymOf(months.prior)]
  const ac0 = acSales[ymOf(months.current)], acLY = acSales[ymOf(months.lastYear)]
  const cpsOf = (agg, ac) => (ac != null && ac > 0 && agg.hasData) ? agg.spend / ac : null

  const metric = (label, key, invert, money, getter) => {
    const v2 = getter(aggByMonth.twoBack, ac2), v1 = getter(aggByMonth.prior, ac1)
    const v0 = getter(aggByMonth.current, ac0), vLY = getter(aggByMonth.lastYear, acLY)
    return {
      key, label, invert, money,
      values: [v2, v1, v0],
      deltaVsPrior: reviewPctDelta(v0, v1), priorForDeltaVsPrior: v1,
      deltaVsLastYear: reviewPctDelta(v0, vLY), priorForDeltaVsLastYear: vLY,
    }
  }

  return [
    metric('Spend', 'spend', true, true, a => a.hasData ? a.spend : null),
    metric('Leads', 'leads', false, false, a => a.hasData ? a.leads : null),
    metric('QL', 'ql', false, false, a => a.hasData ? a.ql : null),
    metric('Apps', 'apps', false, false, a => a.hasData ? a.apps : null),
    metric('AC Sales', 'acSales', false, false, (a, ac) => (ac != null ? ac : null)),
    metric('CPL', 'cpl', true, true, a => a.cpl),
    metric('CPQL', 'cpql', true, true, a => a.cpql),
    metric('CPA', 'cpa', true, true, a => a.cpa),
    metric('CPS', 'cps', true, true, (a, ac) => cpsOf(a, ac)),
  ]
}

function useElementSize(ref) {
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const ro = new ResizeObserver(entries => {
      const r = entries[0].contentRect
      setSize({ w: r.width, h: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return size
}

const isEditableTarget = el => !!el && (
  el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
)

/* ---------- shared visual bits ---------- */

function BrandLogoMark({ size = 44, animate = false }) {
  return (
    <svg width={size} height={size} viewBox={BRAND_LOGO_VIEWBOX} fill="none">
      {BRAND_LOGO_BARS.map((bar, i) => (
        <rect key={i} x={bar.x} y={bar.y} width={bar.w} height={bar.h} rx={BRAND_LOGO_RX} fill={bar.color}
          style={animate ? { transformBox: 'fill-box', transformOrigin: 'bottom', animation: `mrLogoBar .55s cubic-bezier(.22,1,.36,1) ${0.15 + i * 0.16}s both` } : undefined} />
      ))}
    </svg>
  )
}

function AmbientBackground({ variant = 'cover' }) {
  const dim = variant === 'cover'
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <div style={{
        position: 'absolute', width: '65%', paddingBottom: '65%', left: '-15%', top: '-18%', borderRadius: '50%',
        background: `radial-gradient(circle, ${NAVY}55 0%, transparent 70%)`, filter: 'blur(60px)',
        animation: 'mrDrift1 34s ease-in-out infinite',
      }} />
      <div style={{
        position: 'absolute', width: '55%', paddingBottom: '55%', right: '-12%', top: '4%', borderRadius: '50%',
        background: `radial-gradient(circle, ${BLUE}45 0%, transparent 70%)`, filter: 'blur(70px)',
        animation: 'mrDrift2 40s ease-in-out infinite',
      }} />
      <div style={{
        position: 'absolute', width: '48%', paddingBottom: '48%', left: '18%', bottom: '-16%', borderRadius: '50%',
        background: `radial-gradient(circle, ${CYAN}3d 0%, transparent 72%)`, filter: 'blur(65px)',
        animation: 'mrDrift3 26s ease-in-out infinite',
      }} />
      {dim && Array.from({ length: 10 }).map((_, i) => (
        <span key={i} style={{
          position: 'absolute', width: 3.5, height: 3.5, borderRadius: '50%', background: '#fff',
          left: (7 + i * 9.3) % 96 + '%', bottom: -10,
          animation: `mrParticleFloat ${7 + (i % 4)}s linear ${i * 0.9}s infinite`,
        }} />
      ))}
    </div>
  )
}

function PeriodBadge({ period, live }) {
  return (
    <div style={{ position: 'absolute', top: 28, right: 40, display: 'flex', alignItems: 'center', gap: 8, zIndex: 2 }}>
      <span style={{
        fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: NAVY, background: C.navyBg,
        borderRadius: 999, padding: '5px 12px', textTransform: 'uppercase',
      }}>{period}</span>
      {live ? (
        <span style={{
          fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', color: GREEN, background: C.greenBg,
          borderRadius: 999, padding: '5px 12px', textTransform: 'uppercase',
        }}>Live data · Overall (BigQuery)</span>
      ) : (
        <span style={{
          fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', color: '#8A6A00', background: '#FFF6DA',
          border: '1px solid #F2E2A8', borderRadius: 999, padding: '5px 12px', textTransform: 'uppercase',
        }}>Sample data — pending real figures</span>
      )}
    </div>
  )
}

function SectionKicker({ label, title }) {
  return (
    <div style={{ marginBottom: 26 }}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.14em', color: BLUE, textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 34, fontWeight: 800, color: '#0F1B33', letterSpacing: '-0.5px' }}>{title}</div>
    </div>
  )
}

/* ---------- live data for the headline slide (fetched once, shared by every
   render of it -- the deck's main stage, its own thumbnail, the landing
   gallery card, and read view all mount this same Body component
   independently, potentially several at once) ---------- */

const MarketingReviewDataContext = React.createContext(null)
function useMarketingReviewData() { return React.useContext(MarketingReviewDataContext) }

function MarketingReviewDataProvider({ children }) {
  const months = useMemo(computeReviewMonths, [])
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [retryToken, setRetryToken] = useState(0)
  const [acSales, setAcSales] = useState({})
  const [acSalesLoaded, setAcSalesLoaded] = useState(false)
  const [acSaving, setAcSaving] = useState(false)
  const [syncedAt, setSyncedAt] = useState(null)

  useEffect(() => {
    let dead = false
    setRows(null); setError(null)
    const sinceA = isoDate(monthStartOf(months.twoBack)), untilA = isoDate(monthEndOf(months.current))
    const sinceB = isoDate(monthStartOf(months.lastYear)), untilB = isoDate(monthEndOf(months.lastYear))
    Promise.all([
      fetchOverallBqAggRows({ since: sinceA, until: untilA }),
      fetchOverallBqAggRows({ since: sinceB, until: untilB }),
    ]).then(([a, b]) => { if (!dead) setRows(a.concat(b)) })
      .catch(e => { if (!dead) setError(e.message || 'Failed to load figures') })
    return () => { dead = true }
  }, [months, retryToken])

  useEffect(() => {
    let dead = false
    fetchOverallBqSyncedAt().then(d => { if (!dead) setSyncedAt(d) }).catch(() => {})
    return () => { dead = true }
  }, [])

  useEffect(() => {
    let dead = false
    fetch('/api/preferences', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { prefs: {} })
      .then(d => { if (!dead) { setAcSales((d.prefs && d.prefs.ac_sales_manual) || {}); setAcSalesLoaded(true) } })
      .catch(() => { if (!dead) setAcSalesLoaded(true) })
    return () => { dead = true }
  }, [])

  // Optimistic write, revert-on-failure -- same pattern as Settings' own
  // saveAffiliateSpend, otherwise a failed save looks saved until reload.
  const saveAcSales = useCallback(async (next) => {
    const prev = acSales
    setAcSales(next); setAcSaving(true)
    try {
      const r = await fetch('/api/preferences', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'ac_sales_manual', value: next }),
      })
      if (!r.ok) throw new Error('Save failed')
      return true
    } catch (e) {
      setAcSales(prev)
      return false
    } finally {
      setAcSaving(false)
    }
  }, [acSales])

  const aggByMonth = useMemo(() => {
    if (!rows) return null
    return {
      twoBack: aggregateReviewMonth(rows, monthKeyStr(months.twoBack)),
      prior: aggregateReviewMonth(rows, monthKeyStr(months.prior)),
      current: aggregateReviewMonth(rows, monthKeyStr(months.current)),
      lastYear: aggregateReviewMonth(rows, monthKeyStr(months.lastYear)),
    }
  }, [rows, months])

  // Same 4 months, rolled up by channel instead -- feeds the channel-
  // breakdown slide and the 3 per-channel spotlight slides.
  const byChannelByMonth = useMemo(() => {
    if (!rows) return null
    return {
      twoBack: aggregateReviewMonthByChannel(rows, monthKeyStr(months.twoBack)),
      prior: aggregateReviewMonthByChannel(rows, monthKeyStr(months.prior)),
      current: aggregateReviewMonthByChannel(rows, monthKeyStr(months.current)),
      lastYear: aggregateReviewMonthByChannel(rows, monthKeyStr(months.lastYear)),
    }
  }, [rows, months])

  const headlineRows = useMemo(() => {
    if (!aggByMonth || !acSalesLoaded) return null
    return buildHeadlineRows(months, aggByMonth, acSales)
  }, [aggByMonth, acSalesLoaded, acSales, months])

  const channelRowsByChannel = useMemo(() => {
    if (!byChannelByMonth) return null
    const out = {}
    for (const ch of REVIEW_CHANNELS) out[ch] = buildChannelRows(months, byChannelByMonth, ch)
    return out
  }, [byChannelByMonth, months])

  const value = useMemo(() => ({
    months, loading: (rows == null || !acSalesLoaded) && !error, error, headlineRows,
    acSales, acSaving, saveAcSales, syncedAt,
    aggByMonth, byChannelByMonth, channelRowsByChannel,
    retry: () => setRetryToken(t => t + 1),
  }), [months, rows, acSalesLoaded, error, headlineRows, acSales, acSaving, saveAcSales, syncedAt, aggByMonth, byChannelByMonth, channelRowsByChannel])

  return <MarketingReviewDataContext.Provider value={value}>{children}</MarketingReviewDataContext.Provider>
}

/* ---------- slide bodies ---------- */

function CoverSlide({ active, period }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: 'linear-gradient(160deg,#0B1330 0%,#111E45 55%,#0B1330 100%)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <AmbientBackground variant="cover" />
      <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', padding: '0 60px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 26 }}>
          <BrandLogoMark size={54} animate={active} />
        </div>
        <div style={{
          fontSize: 13, fontWeight: 800, letterSpacing: '0.28em', color: 'rgba(255,255,255,0.62)', textTransform: 'uppercase',
          marginBottom: 18, animation: active ? 'mrFadeUp .5s cubic-bezier(.22,1,.36,1) .1s both' : undefined,
        }}>Monthly Marketing Review</div>
        <div style={{
          fontSize: 58, fontWeight: 800, color: '#fff', letterSpacing: '-1.5px', lineHeight: 1.05, marginBottom: 18,
          animation: active ? 'mrCoverTitleIn .6s cubic-bezier(.22,1,.36,1) .25s both' : undefined,
        }}>{period}</div>
        <div style={{
          fontSize: 17, color: 'rgba(255,255,255,0.72)', maxWidth: 620, margin: '0 auto', lineHeight: 1.55,
          animation: active ? 'mrFadeUp .5s cubic-bezier(.22,1,.36,1) .45s both' : undefined,
        }}>Performance across paid channels, organic growth and lead qualification — spend, funnel, wins and what's next.</div>
      </div>
      <div style={{
        position: 'absolute', bottom: 26, left: 0, right: 0, textAlign: 'center', fontSize: 11.5, fontWeight: 600,
        color: 'rgba(255,255,255,0.4)', zIndex: 2,
      }}>Prepared by Leverage Quantum &middot; placeholder deck, real figures pending</div>
    </div>
  )
}

const AGENDA_ITEMS = [
  'Executive summary — the headline numbers',
  'Channel performance — where the leads came from',
  'Funnel & conversion — how leads moved through the pipeline',
  'Wins & highlights',
  'Risks & watch-outs',
  'Next month’s priorities',
]
function AgendaSlide({ active }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#fff', padding: '68px 72px', boxSizing: 'border-box' }}>
      <SectionKicker label="Agenda" title="What we'll cover" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 10 }}>
        {AGENDA_ITEMS.map((t, i) => (
          <div key={i} className={active ? styles.staggerItem : undefined}
            style={{ display: 'flex', alignItems: 'center', gap: 18, animationDelay: active ? (0.08 * i) + 's' : undefined }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 800, color: '#fff', background: `linear-gradient(135deg, ${BRAND_RAMP[i % 4]}, ${BRAND_RAMP[(i + 1) % 4]})`,
            }}>{i + 1}</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#1E2A44' }}>{t}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function fmtHeadlineCell(v, money) {
  if (v == null) return '—'
  return money ? fmtINRShort(v) : fmtN(v)
}
function exactHeadlineTitle(v, money) {
  if (v == null) return undefined
  return money ? fmtINR(v) : fmtN(v)
}
function fmtDeltaPrior(v, money) { return money ? fmtINRShort(v || 0) : fmtN(v || 0) }

function DeltaCell({ delta, prior, money, invert, showPrior = true }) {
  if (delta == null) return <span style={{ fontSize: 12, fontWeight: 600, color: '#94A3B8' }}>—</span>
  const isNew = delta === 'new'
  const up = !isNew && delta >= 0
  const good = isNew ? true : (invert ? !up : up)
  const color = good ? GREEN : NAVY
  const arrow = isNew || up ? '▲' : '▼'
  const pctText = isNew ? 'New' : (Math.abs(delta).toFixed(1) + '%')
  return (
    <span style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
      <span style={{ color, fontWeight: 800 }}>{arrow} {pctText}</span>
      {showPrior && <span style={{ color: '#94A3B8', fontWeight: 600 }}> (was {fmtDeltaPrior(prior, money)})</span>}
    </span>
  )
}

function EditIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
}

const HEADLINE_GRID_COLS = '200px repeat(3, 130px) 185px 185px'

// The 9-metric monthly headline table -- Spend/Leads/QL/Apps/AC Sales/CPL/
// CPQL/CPA/CPS across the trailing 3 months, each with a delta vs the prior
// month and vs the same month last year. Reads live figures from Overall's
// own BigQuery cache via MarketingReviewDataProvider above (one fetch shared
// by every mount of this component, however many render at once).
function HeadlineSlide({ active, period }) {
  const ctx = useMarketingReviewData()
  const [editOpen, setEditOpen] = useState(false)
  const [draft, setDraft] = useState({})

  if (!ctx) return null
  const { months, loading, error, headlineRows, acSales, acSaving, saveAcSales, syncedAt, retry } = ctx
  const displayMonths = [months.twoBack, months.prior, months.current]

  const openEdit = () => {
    const d = {}
    displayMonths.forEach(m => { const ym = ymOf(m); d[ym] = acSales[ym] != null ? String(acSales[ym]) : '' })
    setDraft(d)
    setEditOpen(true)
  }
  const saveDraft = async () => {
    const next = { ...acSales }
    for (const [ym, val] of Object.entries(draft)) {
      const trimmed = String(val).trim()
      if (trimmed === '') { delete next[ym]; continue }
      const n = Number(trimmed)
      if (!Number.isFinite(n) || n < 0) return
      next[ym] = n
    }
    if (await saveAcSales(next)) setEditOpen(false)
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#fff', padding: '68px 72px', boxSizing: 'border-box' }}>
      <PeriodBadge period={period} live />
      <SectionKicker label="Executive Summary" title="The headline numbers" />

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#64748B', fontSize: 14, fontWeight: 600, padding: '50px 0' }}>
          <span className={styles.mrSpinner} />Loading live figures from Overall…
        </div>
      )}

      {!loading && error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#FFF6DA', border: '1px solid #F2E2A8', borderRadius: 12, padding: '14px 18px', marginTop: 10 }}>
          <span style={{ fontSize: 13.5, color: '#7A5C00', fontWeight: 600, flex: 1 }}>Couldn't load live figures: {error}</span>
          {active && (
            <button type="button" onClick={retry} className={styles.noPrint}
              style={{ border: 'none', background: NAVY, color: '#fff', fontSize: 12.5, fontWeight: 700, borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontFamily: FONT }}>
              Retry
            </button>
          )}
        </div>
      )}

      {!loading && !error && headlineRows && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: HEADLINE_GRID_COLS, columnGap: 16, borderBottom: '2px solid #0F1B33', paddingBottom: 9, marginBottom: 2 }}>
            <div />
            {displayMonths.map((m, i) => (
              <div key={i} style={{ fontSize: 11.5, fontWeight: 800, color: '#64748B', textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{monthShort(m)}</div>
            ))}
            <div style={{ fontSize: 10.5, fontWeight: 800, color: '#64748B', textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.03em' }}>vs {monthShort(months.prior)}</div>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: '#64748B', textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.03em' }}>vs {monthShort(months.lastYear)}</div>
          </div>

          {headlineRows.map((row, i) => (
            <div key={row.key} className={active ? styles.staggerItem : undefined} style={{
              display: 'grid', gridTemplateColumns: HEADLINE_GRID_COLS, columnGap: 16, alignItems: 'center',
              padding: '10px 0', borderBottom: '1px solid #F1F5F9',
              animationDelay: active ? (0.035 * i) + 's' : undefined,
            }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 6 }}>
                {row.label}
                {row.key === 'acSales' && active && (
                  <button type="button" onClick={openEdit} className={styles.noPrint} title="Enter AC Sales"
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: BLUE, padding: 2, display: 'inline-flex' }}>
                    <EditIcon />
                  </button>
                )}
              </div>
              {row.values.map((v, ci) => (
                <div key={ci} title={exactHeadlineTitle(v, row.money)}
                  style={{ fontSize: 14.5, fontWeight: 800, color: v == null ? '#CBD5E1' : '#0F172A', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtHeadlineCell(v, row.money)}
                </div>
              ))}
              <div style={{ textAlign: 'right' }}><DeltaCell delta={row.deltaVsPrior} prior={row.priorForDeltaVsPrior} money={row.money} invert={row.invert} showPrior={false} /></div>
              <div style={{ textAlign: 'right' }}><DeltaCell delta={row.deltaVsLastYear} prior={row.priorForDeltaVsLastYear} money={row.money} invert={row.invert} /></div>
            </div>
          ))}

          <div style={{ marginTop: 14, fontSize: 11, color: '#94A3B8', fontWeight: 600, lineHeight: 1.5 }}>
            {syncedAt ? `Synced ${syncedAt.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · ` : ''}
            Source: Overall (BigQuery cache) · CPL/CPQL/CPA/CPS divide by paid-source volume only, matching Overall's own figures.
          </div>
        </>
      )}

      {editOpen && (
        <div className={styles.noPrint} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 6 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '22px 24px', width: 360, boxShadow: '0 20px 50px rgba(0,0,0,0.28)' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>Enter AC Sales</div>
            <div style={{ fontSize: 12, color: '#64748B', marginBottom: 16, lineHeight: 1.5 }}>Not tracked in Quantum — entered here by month. CPS (Spend ÷ AC Sales) is computed automatically.</div>
            {displayMonths.map(m => {
              const ym = ymOf(m)
              return (
                <div key={ym} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 70, fontSize: 12.5, fontWeight: 700, color: '#334155', flexShrink: 0 }}>{monthShort(m)}</div>
                  <input type="number" min="0" value={draft[ym] || ''} onChange={e => setDraft(d => ({ ...d, [ym]: e.target.value }))}
                    placeholder="0" style={{ flex: 1, border: '1px solid #E2E8F0', borderRadius: 8, padding: '7px 10px', fontSize: 13, fontFamily: FONT, boxSizing: 'border-box' }} />
                </div>
              )
            })}
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <Button size="sm" variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={saveDraft} disabled={acSaving}>{acSaving ? 'Saving…' : 'Save'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ChannelBar({ ch, max, active, delay }) {
  const pct = active ? (ch.value / max) * 100 : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
      <div style={{ width: 128, fontSize: 13.5, fontWeight: 700, color: '#334155', flexShrink: 0 }}>{ch.name}</div>
      <div style={{ flex: 1, height: 22, borderRadius: 6, background: '#F1F5F9', overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 6, width: pct + '%', transition: `width 1s cubic-bezier(.22,1,.36,1) ${delay}s`,
          background: `linear-gradient(90deg, ${ch.hue}, ${ch.hue}CC)`,
        }} />
      </div>
      <div style={{ width: 70, textAlign: 'right', fontSize: 13.5, fontWeight: 800, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>{fmtN(ch.value)}</div>
    </div>
  )
}

// Shared loading/error/content scaffold for every slide reading live Overall
// data -- headline (slide 3) has its own copy for its extra AC-Sales-edit
// affordance; every slide added after it (channel breakdown, funnel, the 3
// channel spotlights) shares this one instead of five near-duplicates.
function LiveDataFrame({ ctx, label, title, period, active, children }) {
  const { loading, error, retry } = ctx
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#fff', padding: '68px 72px', boxSizing: 'border-box' }}>
      <PeriodBadge period={period} live />
      <SectionKicker label={label} title={title} />
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#64748B', fontSize: 14, fontWeight: 600, padding: '50px 0' }}>
          <span className={styles.mrSpinner} />Loading live figures from Overall…
        </div>
      )}
      {!loading && error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#FFF6DA', border: '1px solid #F2E2A8', borderRadius: 12, padding: '14px 18px', marginTop: 10 }}>
          <span style={{ fontSize: 13.5, color: '#7A5C00', fontWeight: 600, flex: 1 }}>Couldn't load live figures: {error}</span>
          {active && (
            <button type="button" onClick={retry} className={styles.noPrint}
              style={{ border: 'none', background: NAVY, color: '#fff', fontSize: 12.5, fontWeight: 700, borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontFamily: FONT }}>
              Retry
            </button>
          )}
        </div>
      )}
      {!loading && !error && children}
    </div>
  )
}

function ChannelPerformanceSlide({ active, period }) {
  const ctx = useMarketingReviewData()
  const byChannelByMonth = ctx && ctx.byChannelByMonth
  const channelRows = useMemo(() => {
    if (!byChannelByMonth) return []
    const cur = byChannelByMonth.current
    return REVIEW_CHANNELS
      .map((name, i) => ({ name, hue: BRAND_RAMP[i % 4], ...(cur.get(name) || { ql: 0, leads: 0, spend: 0 }) }))
      .filter(c => (c.ql || 0) > 0)
      .sort((a, b) => b.ql - a.ql)
  }, [byChannelByMonth])
  if (!ctx) return null
  const { months, syncedAt } = ctx
  const max = Math.max(1, ...channelRows.map(c => c.ql))
  return (
    <LiveDataFrame ctx={ctx} label="Channel Performance" title="Where the QLs came from" period={period} active={active}>
      {channelRows.length === 0 ? (
        <div style={{ color: '#94A3B8', fontSize: 14, padding: '40px 0' }}>No QLs recorded for {months ? monthShort(months.current) : 'this month'} yet.</div>
      ) : (
        <div style={{ marginTop: 12 }}>
          {channelRows.map((c, i) => <ChannelBar key={c.name} ch={{ name: c.name, value: c.ql, hue: c.hue }} max={max} active={active} delay={0.1 * i} />)}
        </div>
      )}
      <div style={{ marginTop: 18, fontSize: 11, color: '#94A3B8', fontWeight: 600, lineHeight: 1.5 }}>
        {syncedAt ? `Synced ${syncedAt.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · ` : ''}
        QL volume by channel, {months ? monthShort(months.current) : ''} · Source: Overall (BigQuery cache).
      </div>
    </LiveDataFrame>
  )
}

function FunnelSlide({ active, period }) {
  const ctx = useMarketingReviewData()
  const aggByMonth = ctx && ctx.aggByMonth
  const stages = useMemo(() => {
    if (!aggByMonth) return []
    const a = aggByMonth.current
    return [
      { label: 'Leads', value: a.leads },
      { label: 'Total Queued', value: a.queued },
      { label: 'Total QL', value: a.ql },
      { label: 'Applications', value: a.apps },
    ]
  }, [aggByMonth])
  if (!ctx) return null
  const { months, syncedAt } = ctx
  const max = stages.length ? Math.max(1, stages[0].value) : 1
  return (
    <LiveDataFrame ctx={ctx} label="Funnel & Conversion" title="How leads moved through the pipeline" period={period} active={active}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
        {stages.map((s, i) => {
          const widthPct = active ? Math.max(6, (s.value / max) * 100) : 0
          const prev = stages[i - 1]
          const convPct = prev && prev.value > 0 ? ((s.value / prev.value) * 100).toFixed(1) + '% of prior stage' : null
          return (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                height: 46, borderRadius: 10, width: widthPct + '%', transition: `width .9s cubic-bezier(.22,1,.36,1) ${0.12 * i}s`,
                background: `linear-gradient(90deg, ${BRAND_RAMP[i % 4]}, ${BRAND_RAMP[i % 4]}AA)`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', boxSizing: 'border-box',
              }}>
                <span style={{ fontSize: 13.5, fontWeight: 800, color: '#fff' }}>{s.label}</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{fmtN(s.value)}</span>
              </div>
              {convPct && <div style={{ fontSize: 11.5, color: '#94A3B8', fontWeight: 700, whiteSpace: 'nowrap' }}>{convPct}</div>}
            </div>
          )
        })}
      </div>
      <div style={{ marginTop: 18, fontSize: 11, color: '#94A3B8', fontWeight: 600, lineHeight: 1.5 }}>
        {syncedAt ? `Synced ${syncedAt.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · ` : ''}
        {months ? monthShort(months.current) : ''} · Source: Overall (BigQuery cache).
      </div>
    </LiveDataFrame>
  )
}

// Per-channel spotlight -- one shared body, 3 named wrapper slides below
// (Google Ads / Meta Ads / Organic) rather than threading a `channel` prop
// through SLIDES' fixed {active, period} Body signature. Same 3-months +
// 2-deltas table shape as the headline slide, scoped to one channel; AC
// Sales/CPS are dropped since neither has a real per-channel figure.
function ChannelSpotlightBody({ active, period, channel }) {
  const ctx = useMarketingReviewData()
  if (!ctx) return null
  const { months, channelRowsByChannel, syncedAt } = ctx
  const displayMonths = months ? [months.twoBack, months.prior, months.current] : []
  const rows = channelRowsByChannel ? channelRowsByChannel[channel] : null
  return (
    <LiveDataFrame ctx={ctx} label="Channel Spotlight" title={channel} period={period} active={active}>
      {rows && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: HEADLINE_GRID_COLS, columnGap: 16, borderBottom: '2px solid #0F1B33', paddingBottom: 9, marginBottom: 2 }}>
            <div />
            {displayMonths.map((m, i) => (
              <div key={i} style={{ fontSize: 11.5, fontWeight: 800, color: '#64748B', textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{monthShort(m)}</div>
            ))}
            <div style={{ fontSize: 10.5, fontWeight: 800, color: '#64748B', textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.03em' }}>vs {monthShort(months.prior)}</div>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: '#64748B', textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.03em' }}>vs {monthShort(months.lastYear)}</div>
          </div>
          {rows.map((row, i) => (
            <div key={row.key} className={active ? styles.staggerItem : undefined} style={{
              display: 'grid', gridTemplateColumns: HEADLINE_GRID_COLS, columnGap: 16, alignItems: 'center',
              padding: '10px 0', borderBottom: '1px solid #F1F5F9',
              animationDelay: active ? (0.035 * i) + 's' : undefined,
            }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>{row.label}</div>
              {row.values.map((v, ci) => (
                <div key={ci} title={exactHeadlineTitle(v, row.money)}
                  style={{ fontSize: 14.5, fontWeight: 800, color: v == null ? '#CBD5E1' : '#0F172A', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtHeadlineCell(v, row.money)}
                </div>
              ))}
              <div style={{ textAlign: 'right' }}><DeltaCell delta={row.deltaVsPrior} prior={row.priorForDeltaVsPrior} money={row.money} invert={row.invert} showPrior={false} /></div>
              <div style={{ textAlign: 'right' }}><DeltaCell delta={row.deltaVsLastYear} prior={row.priorForDeltaVsLastYear} money={row.money} invert={row.invert} /></div>
            </div>
          ))}
          <div style={{ marginTop: 14, fontSize: 11, color: '#94A3B8', fontWeight: 600, lineHeight: 1.5 }}>
            {syncedAt ? `Synced ${syncedAt.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · ` : ''}
            Source: Overall (BigQuery cache) · CPL/CPQL/CPA reflect this channel's own spend only.
          </div>
        </>
      )}
    </LiveDataFrame>
  )
}
function GoogleAdsChannelSlide({ active, period }) { return <ChannelSpotlightBody active={active} period={period} channel="Google Ads" /> }
function MetaAdsChannelSlide({ active, period }) { return <ChannelSpotlightBody active={active} period={period} channel="Meta Ads" /> }
function OrganicChannelSlide({ active, period }) { return <ChannelSpotlightBody active={active} period={period} channel="Organic" /> }

function CalloutIcon({ kind }) {
  if (kind === 'win') return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4" /><path d="M12 17h.01" /><circle cx="12" cy="12" r="9" /></svg>
}
function CalloutCard({ title, detail, kind, active, delay }) {
  const accent = kind === 'win' ? GREEN : NAVY
  const bg = kind === 'win' ? C.greenBg : C.navyBg
  return (
    <div className={active ? styles.staggerItem : undefined} style={{
      flex: 1, background: '#fff', border: '0.5px solid #E2E8F0', borderRadius: 14, padding: '22px 20px',
      boxShadow: '0 1px 3px rgba(15,23,42,0.04)', animationDelay: active ? delay + 's' : undefined,
    }}>
      <div style={{ width: 34, height: 34, borderRadius: 9, background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
        <CalloutIcon kind={kind} />
      </div>
      <div style={{ fontSize: 15.5, fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 13.5, color: '#64748B', lineHeight: 1.6 }}>{detail}</div>
    </div>
  )
}
const WINS = [
  { title: 'Best-performing channel', detail: 'Name the channel/campaign that scaled cleanly this month once real numbers are in.' },
  { title: 'Cost efficiency improved', detail: 'Call out wherever CPQL/CPL genuinely fell against last month.' },
  { title: 'A qualitative win', detail: 'New creative, a new corridor, a process fix — anything not captured by the funnel numbers.' },
]
function WinsSlide({ active, period }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#fff', padding: '68px 72px', boxSizing: 'border-box' }}>
      <PeriodBadge period={period} />
      <SectionKicker label="Wins & Highlights" title="What worked" />
      <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
        {WINS.map((w, i) => <CalloutCard key={w.title} {...w} kind="win" active={active} delay={0.1 * i} />)}
      </div>
    </div>
  )
}
const RISKS = [
  { title: 'Underperforming spend', detail: 'Flag whichever channel/corridor/campaign is over the CPQL benchmark this month.' },
  { title: 'A funnel drop-off', detail: 'Whichever stage-to-stage rate weakened the most — queued→QL, QL→application, etc.' },
  { title: 'Something to keep an eye on', detail: 'A trend that isn’t a crisis yet but is worth watching next month.' },
]
function RisksSlide({ active, period }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#fff', padding: '68px 72px', boxSizing: 'border-box' }}>
      <PeriodBadge period={period} />
      <SectionKicker label="Risks & Watch-outs" title="What needs attention" />
      <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
        {RISKS.map((r, i) => <CalloutCard key={r.title} {...r} kind="risk" active={active} delay={0.1 * i} />)}
      </div>
    </div>
  )
}

const PRIORITIES = [
  'Double down on the channel/corridor that scaled cleanly this month',
  'Fix or pause whatever is over the CPQL benchmark',
  'Address the weakest stage-to-stage conversion rate in the funnel',
  'One experiment to run before the next review',
]
function NextStepsSlide({ active, period }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#fff', padding: '68px 72px', boxSizing: 'border-box' }}>
      <PeriodBadge period={period} />
      <SectionKicker label="Next Month's Priorities" title="What we're doing next" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 10 }}>
        {PRIORITIES.map((t, i) => (
          <div key={i} className={active ? styles.staggerItem : undefined}
            style={{ display: 'flex', alignItems: 'center', gap: 18, animationDelay: active ? (0.08 * i) + 's' : undefined }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 800, color: NAVY, background: C.navyBg, border: `1.5px solid ${NAVY}33`,
            }}>{i + 1}</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#1E2A44' }}>{t}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ClosingSlide({ active, period }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: 'linear-gradient(160deg,#0B1330 0%,#111E45 55%,#0B1330 100%)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <AmbientBackground variant="closing" />
      <div style={{ position: 'relative', zIndex: 2, textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 22 }}><BrandLogoMark size={44} animate={active} /></div>
        <div style={{ fontSize: 38, fontWeight: 800, color: '#fff', letterSpacing: '-0.8px', marginBottom: 10 }}>Questions?</div>
        <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.6)' }}>{period} Marketing Review &middot; Leverage Quantum</div>
      </div>
    </div>
  )
}

const SLIDES = [
  { id: 'cover', section: 'Cover', title: 'Monthly Marketing Review', Body: CoverSlide, dark: true },
  { id: 'agenda', section: 'Agenda', title: "What we'll cover", Body: AgendaSlide },
  { id: 'summary', section: 'Executive Summary', title: 'The headline numbers', Body: HeadlineSlide },
  { id: 'channels', section: 'Channel Performance', title: 'Where the QLs came from', Body: ChannelPerformanceSlide },
  { id: 'funnel', section: 'Funnel & Conversion', title: 'How leads moved through the pipeline', Body: FunnelSlide },
  { id: 'channel-google', section: 'Channel Spotlight', title: 'Google Ads', Body: GoogleAdsChannelSlide },
  { id: 'channel-meta', section: 'Channel Spotlight', title: 'Meta Ads', Body: MetaAdsChannelSlide },
  { id: 'channel-organic', section: 'Channel Spotlight', title: 'Organic', Body: OrganicChannelSlide },
  { id: 'wins', section: 'Wins & Highlights', title: 'What worked', Body: WinsSlide },
  { id: 'risks', section: 'Risks & Watch-outs', title: 'What needs attention', Body: RisksSlide },
  { id: 'next', section: "Next Month's Priorities", title: "What we're doing next", Body: NextStepsSlide },
  { id: 'closing', section: 'Closing', title: 'Questions?', Body: ClosingSlide, dark: true },
]

/* ---------- the fixed-aspect canvas every render mode shares ---------- */

function SlideCanvas({ Body, active, period, innerRef }) {
  return (
    <div ref={innerRef} style={{
      width: SLIDE_W, height: SLIDE_H, position: 'relative', overflow: 'hidden', borderRadius: 18,
      boxShadow: '0 30px 70px -20px rgba(8,13,28,0.35)', flexShrink: 0,
    }}>
      <Body active={active} period={period} />
    </div>
  )
}

/* ---------- deck (immersive presenting) ---------- */

function DeckToolbarButton({ onClick, title, active, children }) {
  return (
    <button type="button" onClick={onClick} title={title} className={styles.mrChevron} style={{
      width: 34, height: 34, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.14)',
      background: active ? 'rgba(28,159,212,0.35)' : 'rgba(255,255,255,0.07)', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontFamily: FONT,
    }}>{children}</button>
  )
}

function DeckView({ index, setIndex, period, onExit, onPrint }) {
  // deckRootRef is the real Fullscreen target -- the WHOLE immersive overlay
  // (progress rail, labels, toolbar, thumbnail nav all included), not just
  // the stage area. Fullscreening only the stage div would make the browser
  // stretch that div to fill the screen while leaving every sibling (the
  // toolbar, the thumbnail rail) outside the fullscreen element entirely --
  // they're rendered in a completely separate part of the tree, so they'd
  // just vanish rather than merely being covered.
  const deckRootRef = useRef(null)
  const stageWrapRef = useRef(null)
  const thumbRailRef = useRef(null)
  const currentCanvasRef = useRef(null)
  const size = useElementSize(stageWrapRef)
  const [fullscreen, setFullscreen] = useState(false)
  const [presenterOpen, setPresenterOpen] = useState(false)
  const [showKeyHint, setShowKeyHint] = useState(true)
  const [elapsed, setElapsed] = useState(0)
  const startedAt = useRef(Date.now())

  // Exports the ACTUAL current slide node (full 1280x720, unaffected by the
  // presentational scale-down applied to its parent below) rather than
  // whatever is on screen at the moment -- so the saved image is always
  // full quality regardless of window size.
  const handleExportImage = useCallback(() => {
    const node = currentCanvasRef.current
    if (!node) return
    const slideName = SLIDES[index].title
    toPng(node, { pixelRatio: 2, cacheBust: true }).then(dataUrl => {
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `Marketing-Review-${period.replace(/\s+/g, '-')}-Slide-${index + 1}-${slideName.replace(/[^a-z0-9]+/gi, '-')}.png`
      a.click()
    }).catch(() => {})
  }, [index, period])

  const scale = size.w && size.h ? Math.min(size.w / SLIDE_W, size.h / SLIDE_H) * 0.94 : 0.5

  const goTo = useCallback((i) => setIndex(Math.max(0, Math.min(SLIDES.length - 1, i))), [setIndex])
  const next = useCallback(() => goTo(index + 1), [goTo, index])
  const prev = useCallback(() => goTo(index - 1), [goTo, index])

  useEffect(() => {
    const onFsChange = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (isEditableTarget(document.activeElement)) return
      if (e.key === 'Escape') {
        if (document.fullscreenElement) { document.exitFullscreen(); return }
        onExit()
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); next() }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prev() }
      else if (e.key === 'Home') { e.preventDefault(); goTo(0) }
      else if (e.key === 'End') { e.preventDefault(); goTo(SLIDES.length - 1) }
      else if (e.key === 'f' || e.key === 'F') {
        if (document.fullscreenElement) document.exitFullscreen()
        else deckRootRef.current && deckRootRef.current.requestFullscreen && deckRootRef.current.requestFullscreen()
      } else if (e.key === 'p' || e.key === 'P') { setPresenterOpen(v => !v) }
      else if (/^[1-9]$/.test(e.key)) { const i = Number(e.key) - 1; if (i < SLIDES.length) goTo(i) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [next, prev, goTo, onExit])

  useEffect(() => {
    const t = setTimeout(() => setShowKeyHint(false), 3200)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.round((Date.now() - startedAt.current) / 1000)), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const rail = thumbRailRef.current
    if (!rail) return
    const active = rail.querySelector('[data-thumb-active="true"]')
    if (active) active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [index])

  const pct = ((index + 1) / SLIDES.length) * 100
  const slide = SLIDES[index]

  return (
    <div ref={deckRootRef} role="dialog" aria-modal="true" aria-label={`Presenting: ${slide.title}`}
      style={{ position: 'fixed', inset: 0, zIndex: 9995, fontFamily: FONT, background: '#0B1330' }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(120% 90% at 50% 8%, rgba(28,159,212,0.14), transparent 55%), linear-gradient(180deg, rgba(6,10,22,0.94) 0%, rgba(8,12,26,0.98) 100%)',
      }} />
      {/* progress rail */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 3, background: 'rgba(255,255,255,0.08)', zIndex: 20 }}>
        <div style={{ height: '100%', width: pct + '%', transition: 'width .3s cubic-bezier(.22,1,.36,1)', background: `linear-gradient(90deg, ${NAVY}, ${BLUE}, ${CYAN})`, animation: 'mrBarGlow 2.2s ease-in-out infinite' }} />
      </div>
      {/* label + controls row */}
      <div style={{ position: 'fixed', top: 20, left: 32, right: 32, zIndex: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ maxWidth: '50vw' }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 3 }}>
            {slide.section} &middot; slide {index + 1} of {SLIDES.length}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', letterSpacing: '-0.3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{slide.title}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <DeckToolbarButton onClick={() => setPresenterOpen(v => !v)} active={presenterOpen} title="Presenter view (P)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
          </DeckToolbarButton>
          <DeckToolbarButton onClick={handleExportImage} title="Save this slide as an image">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
          </DeckToolbarButton>
          <DeckToolbarButton onClick={onPrint} title="Print / export whole deck as PDF">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
          </DeckToolbarButton>
          <DeckToolbarButton onClick={() => { if (document.fullscreenElement) document.exitFullscreen(); else deckRootRef.current && deckRootRef.current.requestFullscreen && deckRootRef.current.requestFullscreen() }} active={fullscreen} title="Fullscreen (F)">
            {fullscreen
              ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3" /><path d="M21 8h-3a2 2 0 0 1-2-2V3" /><path d="M3 16h3a2 2 0 0 1 2 2v3" /><path d="M16 21v-3a2 2 0 0 1 2-2h3" /></svg>
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /></svg>}
          </DeckToolbarButton>
          <DeckToolbarButton onClick={onExit} title="Exit (Esc)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18" /><path d="M6 6l12 12" /></svg>
          </DeckToolbarButton>
        </div>
      </div>
      {/* keyboard hint */}
      <div style={{
        position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 20, pointerEvents: 'none',
        opacity: showKeyHint ? 1 : 0, transition: 'opacity .4s ease',
        display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(15,23,42,0.88)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 999, padding: '7px 14px',
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.85)', whiteSpace: 'nowrap' }}>
          &larr; &rarr; navigate &middot; 1-9 jump &middot; Home/End &middot; F fullscreen &middot; P presenter &middot; Esc exit
        </span>
      </div>
      {/* main stage */}
      <div ref={stageWrapRef} style={{
        position: 'absolute', top: 88, bottom: 128, left: presenterOpen ? 32 : '6vw', right: presenterOpen ? 360 : '6vw',
        display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'right .25s ease, left .25s ease',
      }}>
        <div key={index} style={{ transform: `scale(${scale})`, animation: 'mrSlideIn .42s cubic-bezier(.22,1,.36,1) both', position: 'relative' }}>
          <SlideCanvas Body={slide.Body} active period={period} innerRef={currentCanvasRef} />
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 18, overflow: 'hidden', pointerEvents: 'none',
          }}>
            <div style={{ position: 'absolute', top: 0, bottom: 0, width: '40%', background: 'linear-gradient(100deg, transparent, rgba(255,255,255,0.35), transparent)', animation: 'mrSheen .9s ease-out' }} />
          </div>
        </div>
      </div>
      {/* presenter panel */}
      {presenterOpen && (
        <div style={{
          position: 'fixed', top: 88, bottom: 128, right: 32, width: 300, zIndex: 20, background: 'rgba(15,20,38,0.92)',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 18, boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column', gap: 14, animation: 'mrFadeUp .25s ease-out both',
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Presenter view</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
            {String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}
            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginLeft: 8 }}>elapsed</span>
          </div>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Next up</div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#fff' }}>{index < SLIDES.length - 1 ? SLIDES[index + 1].title : 'End of deck'}</div>
          </div>
          <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Notes</div>
            <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>No speaker notes yet — add them per slide once real content is defined.</div>
          </div>
        </div>
      )}
      {/* bottom bar: prev / thumbnail rail / next */}
      <div style={{ position: 'fixed', bottom: 24, left: 0, right: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '0 32px' }}>
        <DeckToolbarButton onClick={prev} title="Previous (←)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg></DeckToolbarButton>
        <div ref={thumbRailRef} className={styles.hideScroll} style={{
          display: 'flex', gap: 8, maxWidth: '60vw', overflowX: 'auto', padding: '8px 4px',
          background: 'rgba(15,20,38,0.72)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14,
        }}>
          {SLIDES.map((s, i) => {
            const isActive = i === index
            const thumbW = 92, thumbScale = thumbW / SLIDE_W, thumbH = SLIDE_H * thumbScale
            return (
              <button key={s.id} type="button" data-thumb-active={isActive} onClick={() => goTo(i)} title={s.title}
                className={styles.thumbBtn}
                style={{
                  width: thumbW, height: thumbH, borderRadius: 7, overflow: 'hidden', flexShrink: 0, cursor: 'pointer', padding: 0,
                  border: isActive ? `2px solid ${CYAN}` : '2px solid rgba(255,255,255,0.12)',
                  boxShadow: isActive ? `0 0 0 3px ${CYAN}33` : 'none', position: 'relative', background: 'transparent',
                }}>
                <div style={{ width: SLIDE_W, height: SLIDE_H, transform: `scale(${thumbScale})`, transformOrigin: 'top left', pointerEvents: 'none' }}>
                  <s.Body active={false} period={period} />
                </div>
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, fontSize: 8.5, fontWeight: 800, color: '#fff', background: 'rgba(0,0,0,0.55)', padding: '2px 0', textAlign: 'center' }}>{i + 1}</div>
              </button>
            )
          })}
        </div>
        <DeckToolbarButton onClick={next} title="Next (→)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg></DeckToolbarButton>
      </div>
    </div>
  )
}

/* ---------- read view (non-presenting, scrollable, also the print source) ---------- */

function ReadView({ period }) {
  const wrapRef = useRef(null)
  const size = useElementSize(wrapRef)
  const scale = size.w ? Math.min(1, (size.w - 40) / SLIDE_W) : 0.5
  return (
    <div ref={wrapRef} className={styles.printRoot} style={{ flex: 1, overflowY: 'auto', padding: '28px 0 60px', background: '#EEF1F6' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>
        {SLIDES.map((s, i) => (
          <div key={s.id} className={styles.printSlideOuter} style={{ width: SLIDE_W * scale, boxShadow: '0 1px 3px rgba(15,23,42,0.08)', borderRadius: 18 }}>
            <div className={styles.printSlideInner} style={{ width: SLIDE_W, height: SLIDE_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
              <SlideCanvas Body={s.Body} active period={period} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------- landing (default view when you open the page) ---------- */

function GalleryCard({ slide, i, onOpen, period }) {
  const scale = 280 / SLIDE_W
  return (
    <button type="button" onClick={onOpen} className={styles.mrGalleryCard} style={{
      textAlign: 'left', cursor: 'pointer', border: '0.5px solid #E2E8F0', borderRadius: 14, overflow: 'hidden',
      background: '#fff', padding: 0, boxShadow: '0 1px 3px rgba(15,23,42,0.05)',
    }}>
      <div style={{ width: '100%', aspectRatio: '16/9', overflow: 'hidden', position: 'relative', background: '#F1F5F9' }}>
        <div style={{ width: SLIDE_W, height: SLIDE_H, transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'none' }}>
          <slide.Body active={false} period={period} />
        </div>
      </div>
      <div style={{ padding: '12px 14px' }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Slide {i + 1}</div>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', marginTop: 2 }}>{slide.title}</div>
      </div>
    </button>
  )
}

export default function MarketingReviewDashboard() {
  const [mode, setMode] = useState('landing') // 'landing' | 'deck' | 'read'
  const [index, setIndex] = useState(0)
  const period = useMemo(() => defaultReviewPeriod(), [])

  const startDeck = useCallback((i = 0) => { setIndex(i); setMode('deck') }, [])
  const exitDeck = useCallback(() => { if (document.fullscreenElement) document.exitFullscreen(); setMode('landing') }, [])
  const doPrint = useCallback(() => {
    setMode('read')
    setTimeout(() => window.print(), 250)
  }, [])

  return (
    <MarketingReviewDataProvider>
    <div className="lq-page-shell" style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#EEF1F6' }}>
      <div className={styles.noPrint}><Sidebar /></div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div className={styles.noPrint} style={{
          padding: '16px 28px', background: '#fff', borderBottom: '0.5px solid #E5E7EB',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', color: '#94A3B8', textTransform: 'uppercase' }}>Dashboards / Marketing Review</div>
            <div style={{ fontSize: 19, fontWeight: 800, color: '#0F1B33', marginTop: 2 }}>Monthly Marketing Review</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 11, fontWeight: 800, color: NAVY, background: C.navyBg, borderRadius: 999, padding: '5px 12px', textTransform: 'uppercase', letterSpacing: '0.04em',
            }}>{period}</span>
            <Button size="sm" variant="secondary" onClick={() => setMode(mode === 'read' ? 'landing' : 'read')}>
              {mode === 'read' ? 'Back to overview' : 'Read view'}
            </Button>
            <Button size="sm" variant="secondary" onClick={doPrint}>Print / Export PDF</Button>
            <Button size="sm" onClick={() => startDeck(0)}>Start presentation</Button>
          </div>
        </div>

        {mode === 'landing' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px 60px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, marginBottom: 26,
              background: 'linear-gradient(135deg,#0B1330,#1B2A57)', borderRadius: 18, padding: '30px 34px', color: '#fff', overflow: 'hidden', position: 'relative',
            }}>
              <div style={{ position: 'absolute', inset: 0, opacity: 0.5 }}><AmbientBackground variant="landing" /></div>
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', marginBottom: 8 }}>{SLIDES.length} slides &middot; {period}</div>
                <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.4px', marginBottom: 8 }}>Ready to present</div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)', maxWidth: 520 }}>Full keyboard control, a slide navigator, presenter view, PDF export and a print-friendly read view — everything a live review needs.</div>
              </div>
              <button type="button" onClick={() => startDeck(0)} className={styles.mrLaunchBtn} style={{
                position: 'relative', zIndex: 1, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '13px 24px',
                borderRadius: 12, border: 'none', background: `linear-gradient(135deg, ${NAVY}, ${BLUE})`, color: '#fff', fontSize: 14, fontWeight: 800,
                fontFamily: FONT, cursor: 'pointer', boxShadow: `0 10px 30px -8px ${BLUE}99`,
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="13" rx="2.5" /><path d="M10.5 8.2v4.6l3.6-2.3z" fill="currentColor" stroke="none" /><path d="M8 21h8" /><path d="M12 17v4" /></svg>
                Start presentation
              </button>
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, padding: '11px 16px',
              background: '#FFF6DA', border: '1px solid #F2E2A8', borderRadius: 12, fontSize: 12.5, color: '#7A5C00', fontWeight: 600,
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8A6A00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M12 9v4" /><path d="M12 17h.01" /><circle cx="12" cy="12" r="9" /></svg>
              Placeholder deck — every figure is sample data, clearly labeled on each slide. Swap in the real numbers once the slide content/data source is confirmed.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
              {SLIDES.map((s, i) => <GalleryCard key={s.id} slide={s} i={i} period={period} onOpen={() => startDeck(i)} />)}
            </div>
          </div>
        )}

        {mode === 'read' && <ReadView period={period} />}
      </div>

      {mode === 'deck' && (
        <DeckView
          index={index}
          setIndex={setIndex}
          period={period}
          onExit={exitDeck}
          onPrint={doPrint}
        />
      )}
    </div>
    </MarketingReviewDataProvider>
  )
}
