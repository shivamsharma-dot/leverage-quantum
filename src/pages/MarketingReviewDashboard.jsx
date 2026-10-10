import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import Sidebar from '../components/Sidebar'
import Button from '../components/Button'
import Dropdown from '../components/Dropdown'
import { useAuth } from '../hooks/useAuth'
import { isMarketingReviewOwner } from '../../shared/access.mjs'
import { C, FONT, BRAND_RAMP } from '../ui/dashboardKit'
import { BRAND_LOGO_BARS, BRAND_LOGO_VIEWBOX, BRAND_LOGO_RX } from '../../shared/brandLogo.mjs'
import { fetchOverallBqAggRows, fetchOverallBqSyncedAt, fetchOverallBqRows } from '../lib/overallBqCache.js'
import styles from './MarketingReviewDashboard.module.css'

// Own, LOCAL Source -> channel classification -- deliberately NOT the shared
// mapChannel/CHANNELS in overallFunnelCache.js. That shared mapping still
// keys off 'Content+Brand', a Source label that no longer exists in the real
// BigQuery data (confirmed live, 2026-09-10): the actual Source value today
// is literally 'Organic'. Since 'Organic' was never a key in that shared
// map, every real Organic row was silently falling through to its 'Other'
// bucket instead -- which is exactly why this deck's slide 4/8 showed
// "Organic: 0" for months, when the real Aug'26 figure is 415 QLs. Fixed
// locally here (this page's own copy) rather than editing the shared file,
// since MarketingPerformanceReport.jsx also depends on it and fixing that
// consumer too is out of scope for this page -- flagged separately via
// spawn_task instead of touched here.
const CHANNEL_LABELS = { Facebook: 'Meta Ads', Google: 'Google Ads', Remarketing: 'Remarketing', Affiliate: 'Affiliate', Organic: 'Organic' }
function reviewMapChannel(source) { return CHANNEL_LABELS[(source || '').trim()] || 'Other' }
const REVIEW_CHANNELS = ['Meta Ads', 'Google Ads', 'Remarketing', 'Affiliate', 'Organic', 'Other']
// Reverse of CHANNEL_LABELS -- which raw Source value to query the per-
// campaign table for, when a channel bar's top-5-campaigns drill-down is
// clicked. 'Other' has no single raw Source (it's everything NOT in this
// map), so its drill-down fetches the whole month unfiltered and excludes
// these five client-side instead -- see fetchChannelCampaigns below.
const RAW_SOURCE_BY_CHANNEL = { 'Meta Ads': 'Facebook', 'Google Ads': 'Google', Remarketing: 'Remarketing', Affiliate: 'Affiliate', Organic: 'Organic' }

// Ranks a channel's campaigns for the "top 5" drill-down on the Channel
// Performance slide. Paid channels: per the campaign-performance-heuristic
// already established elsewhere in this app (high CPQL is a red flag
// regardless of volume; a campaign only counts as a real winner once it's
// BOTH decent volume and at-or-below-median cost) -- rank by QL among
// campaigns at or below the channel's own median CPQL this month, falling
// back to plain top-QL if too few campaigns clear that bar to fill 5 slots.
// Non-paid (Organic): no cost dimension exists, so it's simply top QL.
function rankTopCampaigns(rows, isPaid) {
  const byCampaign = new Map()
  for (const r of rows) {
    const name = r.campaign_name || '(unnamed campaign)'
    const e = byCampaign.get(name) || { name, ql: 0, leads: 0, spend: 0 }
    e.ql += reviewNum(r['Futwork Human QL']) + reviewNum(r['Futwork AI QL']) + reviewNum(r['Superbot AI QL'])
    e.leads += reviewNum(r['Total Leads Generated'])
    e.spend += reviewNum(r['Total_Spends'])
    byCampaign.set(name, e)
  }
  const campaigns = [...byCampaign.values()].map(c => ({ ...c, cpql: c.ql > 0 ? c.spend / c.ql : null }))
  const byQlDesc = arr => [...arr].sort((a, b) => b.ql - a.ql).slice(0, 5)
  if (!isPaid) return byQlDesc(campaigns.filter(c => c.ql > 0))
  const withCpql = campaigns.filter(c => c.ql > 0 && c.cpql != null)
  if (!withCpql.length) return byQlDesc(campaigns.filter(c => c.ql > 0))
  const sorted = [...withCpql].map(c => c.cpql).sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  const efficient = withCpql.filter(c => c.cpql <= median)
  return efficient.length >= 5 ? byQlDesc(efficient) : byQlDesc(campaigns.filter(c => c.ql > 0))
}

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

// A review covers ONE period, chosen on the page: a month, a half-year of the Indian
// financial year (H1 = Apr-Sep, H2 = Oct-Mar), a whole financial year (Apr-Mar) or a
// calendar year. Every number in the deck covers exactly that period, never a mix.
// A period is described by a small JSON-safe "spec" so it can be saved with a review:
//   {type:'month', year:2026, month:8}   (month is 0-based)
//   {type:'half',  fy:2026, half:1}
//   {type:'fy',    fy:2026}
//   {type:'cy',    year:2026}
// buildSpan(spec) turns a spec into the span object every slide reads (label, range,
// start/end, the months inside it and their keys). Shared by the display strings AND all
// the data math (computeReviewMonths), so the two can never disagree.
function fyLabel(startYear) { return 'FY' + String(startYear).slice(-2) + '-' + String(startYear + 1).slice(-2) }
const SHORT_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function monthRun(startYear, startMonth, count) {
  const out = []
  for (let i = 0; i < count; i++) out.push(new Date(startYear, startMonth + i, 1))
  return out
}
const PERIOD_TYPES = [
  { value: 'month', label: 'Month', unit: 'month', title: 'Monthly' },
  { value: 'half', label: 'Half-year', unit: 'half-year', title: 'Half-Year' },
  { value: 'fy', label: 'Financial year', unit: 'financial year', title: 'Financial-Year' },
  { value: 'cy', label: 'Calendar year', unit: 'calendar year', title: 'Calendar-Year' },
]
function periodTypeInfo(type) { return PERIOD_TYPES.find(t => t.value === type) || PERIOD_TYPES[1] }
function buildSpan(spec) {
  let monthDates, label, range
  if (spec.type === 'month') {
    monthDates = monthRun(spec.year, spec.month, 1)
    const d = monthDates[0]
    label = SHORT_MON[d.getMonth()] + "'" + String(d.getFullYear()).slice(-2)
    range = '1 to ' + new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() + ' ' + SHORT_MON[d.getMonth()] + ' ' + d.getFullYear()
  } else if (spec.type === 'fy') {
    monthDates = monthRun(spec.fy, 3, 12)
    label = fyLabel(spec.fy)
    range = 'Apr ' + spec.fy + ' to Mar ' + (spec.fy + 1)
  } else if (spec.type === 'cy') {
    monthDates = monthRun(spec.year, 0, 12)
    label = 'CY' + spec.year
    range = 'Jan to Dec ' + spec.year
  } else {
    monthDates = monthRun(spec.fy, spec.half === 1 ? 3 : 9, 6)
    const first = monthDates[0], last = monthDates[5]
    label = 'H' + spec.half + ' ' + fyLabel(spec.fy)
    range = first.getFullYear() === last.getFullYear()
      ? SHORT_MON[first.getMonth()] + ' to ' + SHORT_MON[last.getMonth()] + ' ' + last.getFullYear()
      : SHORT_MON[first.getMonth()] + ' ' + first.getFullYear() + ' to ' + SHORT_MON[last.getMonth()] + ' ' + last.getFullYear()
  }
  const first = monthDates[0], last = monthDates[monthDates.length - 1]
  const info = periodTypeInfo(spec.type)
  const end = new Date(last.getFullYear(), last.getMonth() + 1, 0)
  return {
    spec, type: spec.type, unit: info.unit, typeTitle: info.title,
    label, range,
    start: first, end,
    inProgress: end.getTime() >= new Date().setHours(0, 0, 0, 0),
    monthDates,
    monthKeys: monthDates.map(d => REVIEW_MONTH_NAMES[d.getMonth()] + "'" + d.getFullYear()),
    ymKeys: monthDates.map(d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')),
  }
}
// The period just before, and the same period a year earlier (for a year-sized review the
// "year earlier" column is simply the year before that, so the three columns stay distinct).
function prevSpec(spec) {
  if (spec.type === 'month') { const d = new Date(spec.year, spec.month - 1, 1); return { type: 'month', year: d.getFullYear(), month: d.getMonth() } }
  if (spec.type === 'half') return spec.half === 1 ? { type: 'half', fy: spec.fy - 1, half: 2 } : { type: 'half', fy: spec.fy, half: 1 }
  if (spec.type === 'fy') return { type: 'fy', fy: spec.fy - 1 }
  return { type: 'cy', year: spec.year - 1 }
}
function yearAgoSpec(spec) {
  if (spec.type === 'month') return { type: 'month', year: spec.year - 1, month: spec.month }
  if (spec.type === 'half') return { type: 'half', fy: spec.fy - 1, half: spec.half }
  return prevSpec(prevSpec(spec))
}
function specKey(spec) {
  if (spec.type === 'month') return 'month:' + spec.year + '-' + spec.month
  if (spec.type === 'half') return 'half:' + spec.fy + '-' + spec.half
  if (spec.type === 'fy') return 'fy:' + spec.fy
  return 'cy:' + spec.year
}
function parseSpecKey(key) {
  const [t, v] = String(key).split(':')
  if (t === 'month') { const [y, m] = v.split('-').map(Number); return { type: 'month', year: y, month: m } }
  if (t === 'half') { const [fy, h] = v.split('-').map(Number); return { type: 'half', fy, half: h } }
  if (t === 'fy') return { type: 'fy', fy: Number(v) }
  return { type: 'cy', year: Number(v) }
}
// The latest period of this type that has fully finished (a fresh review opens on it).
function mostRecentCompletedSpec(type, now = new Date()) {
  const m = now.getMonth(), y = now.getFullYear()
  const curFy = m >= 3 ? y : y - 1
  if (type === 'month') { const d = new Date(y, m - 1, 1); return { type, year: d.getFullYear(), month: d.getMonth() } }
  if (type === 'fy') return { type, fy: curFy - 1 }
  if (type === 'cy') return { type, year: y - 1 }
  // half: H1 = Apr-Sep, H2 = Oct-Mar
  if (m >= 9) return { type, fy: y, half: 1 }
  if (m >= 3) return { type, fy: y - 1, half: 2 }
  return { type, fy: y - 1, half: 1 }
}
// Pickable periods for the Period dropdown, newest first, including the one still running.
function listPeriodSpecs(type, now = new Date()) {
  const m = now.getMonth(), y = now.getFullYear()
  const curFy = m >= 3 ? y : y - 1
  const out = []
  if (type === 'month') for (let i = 0; i < 24; i++) { const d = new Date(y, m - i, 1); out.push({ type, year: d.getFullYear(), month: d.getMonth() }) }
  else if (type === 'half') {
    let fy = curFy, half = m >= 3 && m <= 8 ? 1 : 2
    for (let i = 0; i < 8; i++) { out.push({ type, fy, half }); if (half === 1) { fy -= 1; half = 2 } else half = 1 }
  }
  else if (type === 'fy') for (let i = 0; i < 5; i++) out.push({ type, fy: curFy - i })
  else for (let i = 0; i < 4; i++) out.push({ type, year: y - i })
  return out
}
function periodOptionLabel(spec) {
  const s = buildSpan(spec)
  if (spec.type === 'month') return REVIEW_MONTH_NAMES[spec.month] + ' ' + spec.year + (s.inProgress ? ' (running)' : '')
  return s.label + ' · ' + s.range + (s.inProgress ? ' (running)' : '')
}
function reviewPeriodString(span) {
  return span.label + ' · ' + span.range + (span.inProgress ? ' (running)' : '')
}
function defaultReviewSpec() { return mostRecentCompletedSpec('half') }

// Same shared, admin-configurable assumptions OverallDashboard.jsx's own Est.
// SR Revenue KPI reads (Settings > Data > SR Revenue Assumptions) -- same
// keys, same default/clamp logic -- so the funnel slide's Total Revenue
// figure can never silently drift from what Overall itself would show for
// the same month.
const SR_FEE_KEY = 'lq_sr_fee'
const SR_FEE_DEFAULT = 350000
const RAU_PCT_KEY = 'lq_rau_conversion_pct'
const RAU_PCT_DEFAULT = 75
function readSrFee() {
  try { const s = localStorage.getItem(SR_FEE_KEY); const n = s ? Number(s) : SR_FEE_DEFAULT; return isNaN(n) || n <= 0 ? SR_FEE_DEFAULT : n }
  catch { return SR_FEE_DEFAULT }
}
function readRauPct() {
  try { const s = localStorage.getItem(RAU_PCT_KEY); const n = s ? Number(s) : RAU_PCT_DEFAULT; return isNaN(n) || n <= 0 || n > 100 ? RAU_PCT_DEFAULT : n }
  catch { return RAU_PCT_DEFAULT }
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
function isoDate(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
function monthLong(d) { return d.toLocaleDateString('en-US', { month: 'short' }) + "'" + String(d.getFullYear()).slice(-2) }

// The three periods shown as table columns: the same period a year earlier, the period just
// before the review period, and the review period itself. Both deltas (vs the previous
// period, vs the same period last year) compare against these.
function computeReviewMonths(spec) {
  return {
    current: buildSpan(spec),
    prior: buildSpan(prevSpec(spec)),
    lastYear: buildSpan(yearAgoSpec(spec)),
  }
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
  const keys = new Set([].concat(key))
  const bySource = new Map()
  for (const r of rows) {
    if (!keys.has(r.month)) continue
    const src = r.Source || 'Unknown'
    const e = bySource.get(src) || { leads: 0, ql: 0, humanQl: 0, aiQl: 0, superbotQl: 0, apps: 0, spend: 0, queued: 0, floorQueued: 0, deposits: 0 }
    e.leads += reviewNum(r['Total Leads Generated'])
    e.humanQl += reviewNum(r['Futwork Human QL'])
    e.aiQl += reviewNum(r['Futwork AI QL'])
    e.superbotQl += reviewNum(r['Superbot AI QL'])
    e.ql += reviewNum(r['Futwork Human QL']) + reviewNum(r['Futwork AI QL']) + reviewNum(r['Superbot AI QL'])
    e.apps += reviewNum(r['Total Apps'])
    e.spend += reviewNum(r['Total_Spends'])
    e.deposits += reviewNum(r['Total Deposits'])
    // Total Queued (funnel slide only) -- matches OverallDashboard.jsx's own
    // `const totalQueued = kpis.futworkHumanQ + kpis.futworkAiQ + kpis.superbotQ`
    // EXACTLY (verified live against production Supabase, Aug'26: 86,532).
    // Floor Queued is Overall's own SEPARATE, parallel funnel branch --
    // "Directly Distributed to Floor" bypasses the Futwork/Superbot queuing
    // process entirely, so it is NOT part of Total Queued there and must not
    // be folded in here either. An earlier version of this function summed
    // all 4 fields together (floor + 3 queues), which inflated Total Queued
    // past Leads itself (1,27,327 vs 1,11,941 for Aug'26) -- a real bug, not
    // a data characteristic; caught live when the user pointed out the
    // number looked wrong. Floor is tracked separately below instead of
    // being silently dropped.
    e.queued += reviewNum(r['Queued on Futwork Human']) + reviewNum(r['Queued on Futwork AI']) + reviewNum(r['Queued on Superbot'])
    e.floorQueued += reviewNum(r['floor_queued'])
    bySource.set(src, e)
  }
  let leads = 0, ql = 0, humanQl = 0, aiQl = 0, superbotQl = 0, apps = 0, spend = 0, queued = 0, floorQueued = 0, deposits = 0, paidLeads = 0, paidQl = 0, paidApps = 0
  for (const e of bySource.values()) {
    leads += e.leads; ql += e.ql; humanQl += e.humanQl; aiQl += e.aiQl; superbotQl += e.superbotQl
    apps += e.apps; spend += e.spend; queued += e.queued; floorQueued += e.floorQueued; deposits += e.deposits
    if (e.spend > 0) { paidLeads += e.leads; paidQl += e.ql; paidApps += e.apps }
  }
  return {
    hasData: bySource.size > 0, leads, ql, humanQl, aiQl, superbotQl, apps, spend, queued, floorQueued, deposits,
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
  const keys = new Set([].concat(key))
  const bySource = new Map()
  for (const r of rows) {
    if (!keys.has(r.month)) continue
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

// Same 3-half-years + 2-deltas shape as buildHeadlineRows, scoped to one
// channel -- AC Sales/CPS are dropped since neither has a real per-channel
// figure (AC Sales is a whole-business manual entry).
function buildChannelRows(months, byChannelByMonth, channel) {
  const emptyAgg = { hasData: false, leads: null, ql: null, apps: null, spend: null, cpl: null, cpql: null, cpa: null }
  const at = m => byChannelByMonth[m].get(channel) || emptyAgg
  const metric = (label, key, invert, money, getter) => {
    const v1 = getter(at('prior'))
    const v0 = getter(at('current')), vLY = getter(at('lastYear'))
    return {
      key, label, invert, money,
      values: [vLY, v1, v0],
      deltaVsPrior: reviewPctDelta(v0, v1), priorForDeltaVsPrior: v1,
      deltaVsLastYear: reviewPctDelta(v0, vLY), priorForDeltaVsLastYear: vLY,
    }
  }
  const rows = [
    metric('Leads', 'leads', false, false, a => a.hasData ? a.leads : null),
    metric('QL', 'ql', false, false, a => a.hasData ? a.ql : null),
    metric('Apps', 'apps', false, false, a => a.hasData ? a.apps : null),
  ]
  // Organic has no real spend -- Spend/CPL/CPQL/CPA would just render as a
  // column of dashes, which on this CEO-facing slide reads as broken data
  // rather than "this channel is unpaid by design." Every other channel
  // keeps the full paid-metrics set.
  if (channel !== 'Organic') {
    rows.unshift(metric('Spend', 'spend', true, true, a => a.hasData ? a.spend : null))
    rows.push(
      metric('CPL', 'cpl', true, true, a => a.cpl),
      metric('CPQL', 'cpql', true, true, a => a.cpql),
      metric('CPA', 'cpa', true, true, a => a.cpa),
    )
  }
  return rows
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
// AC Sales is a manual per-MONTH entry (app_preferences.ac_sales_manual,
// {'YYYY-MM': n}); a half-year figure is the sum of its six months. `entered`
// counts how many of those six months actually have a value, so a half with
// only some months typed in can be flagged as partial instead of passing for a
// complete total. null total = no month entered at all (renders as a dash).
// A whole-period total (app_preferences.ac_sales_period_totals, {'half:2025-1': n}) wins over the
// monthly entries for that exact period -- used for figures that only exist as a period total, such
// as the AC full-sale counts copied once from the "3. YoY Exec Summary" tab of the H1_FY27 Marketing
// Review sheet (H1 FY26 378, H2 FY26 718, H1 FY27 1,027).
function sumManualForPeriod(map, spec, periodTotals) {
  const fixed = periodTotals && spec.spec ? periodTotals[specKey(spec.spec)] : null
  if (fixed != null && Number.isFinite(Number(fixed))) return { total: Number(fixed), entered: spec.ymKeys.length }
  let total = 0, entered = 0
  for (const ym of spec.ymKeys) {
    if (map && map[ym] != null) { total += Number(map[ym]) || 0; entered++ }
  }
  return { total: entered ? total : null, entered }
}

function organicAcKey(span) { return span.ymKeys[0] + '_' + span.ymKeys.length }
function buildHeadlineRows(months, aggByMonth, acSales, acTotals, roasCur) {
  const acCur = sumManualForPeriod(acSales, months.current, acTotals)
  const acPrior = sumManualForPeriod(acSales, months.prior, acTotals)
  const acLY = sumManualForPeriod(acSales, months.lastYear, acTotals)
  const ac1 = acPrior.total, ac0 = acCur.total, acLYv = acLY.total
  const cpsOf = (agg, ac) => (ac != null && ac > 0 && agg.hasData) ? agg.spend / ac : null
  // Cost per (App + AC sale): spend divided by the two kinds of conversion added together.
  const cpacOf = (agg, ac) => (ac != null && agg.hasData && (agg.apps + ac) > 0) ? agg.spend / (agg.apps + ac) : null

  const metric = (label, key, invert, money, getter) => {
    const v1 = getter(aggByMonth.prior, ac1)
    const v0 = getter(aggByMonth.current, ac0), vLY = getter(aggByMonth.lastYear, acLYv)
    return {
      key, label, invert, money,
      values: [vLY, v1, v0],
      deltaVsPrior: reviewPctDelta(v0, v1), priorForDeltaVsPrior: v1,
      deltaVsLastYear: reviewPctDelta(v0, vLY), priorForDeltaVsLastYear: vLY,
      // months of manual AC Sales entered per column, same order as `values`
      acEntered: key === 'acSales' || key === 'cps' ? [acLY.entered, acPrior.entered, acCur.entered] : undefined,
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
    metric('Cost per (App + AC sale)', 'cpac', true, true, (a, ac) => cpacOf(a, ac)),
    // ROAS comes from the Finance "B2C H1 CAC" sheet (Rev Total / Spend), which only covers H1 FY26-27,
    // so only the review column has a value; the older two columns stay empty.
    { key: 'roas', label: 'ROAS', invert: false, money: false, values: [null, null, roasCur != null ? roasCur : null],
      deltaVsPrior: null, priorForDeltaVsPrior: null, deltaVsLastYear: null, priorForDeltaVsLastYear: null },
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

const noDash = t => String(t == null ? '' : t).replace(/\s*[\u2014\u2013]\s*/g, ', ')

function PeriodBadge({ period, live }) {
  return (
    <div style={{ position: 'absolute', top: 28, right: 40, display: 'flex', alignItems: 'center', gap: 8, zIndex: 2 }}>
      <span style={{
        fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: NAVY, background: C.navyBg,
        borderRadius: 999, padding: '5px 12px', textTransform: 'uppercase',
      }}>{period}</span>
      {!live && (
        <span style={{
          fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', color: '#8A6A00', background: '#FFF6DA',
          border: '1px solid #F2E2A8', borderRadius: 999, padding: '5px 12px', textTransform: 'uppercase',
        }}>Sample data, pending real figures</span>
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

// The Finance sheet behind the "CAC and ROAS by channel" slide only covers one period (H1 FY26-27).
const CAC_SHEET_SPEC_KEY = 'half:2026-1'

// `spec` is the period being reviewed. `snapshot` (optional) is a FROZEN review's saved numbers:
// when present nothing is fetched and every slide reads the snapshot, so a finalized review never
// changes after it was presented.
function MarketingReviewDataProvider({ spec, snapshot, children }) {
  const sKey = specKey(spec)
  const months = useMemo(() => computeReviewMonths(spec), [sKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const frozen = !!snapshot
  const cacApplies = sKey === CAC_SHEET_SPEC_KEY
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [retryToken, setRetryToken] = useState(0)
  const [acSales, setAcSales] = useState({})
  const [acTotals, setAcTotals] = useState({})
  const [acSalesLoaded, setAcSalesLoaded] = useState(false)
  const [organicAc, setOrganicAc] = useState({})
  const [organicAcSaving, setOrganicAcSaving] = useState(false)
  const [acSaving, setAcSaving] = useState(false)
  const [acRevenue, setAcRevenue] = useState({})
  const [acRevenueSaving, setAcRevenueSaving] = useState(false)
  const [syncedAt, setSyncedAt] = useState(null)
  const [organicSubRows, setOrganicSubRows] = useState(null)
  // The "H1 CAC" sheet slide's own table (A1:I20 of a hand-maintained Finance sheet,
  // read server-side with the service account). Independent of the Overall rows above,
  // so a sheet problem never blanks the other slides.
  const [cacSheet, setCacSheet] = useState(null)
  const [cacError, setCacError] = useState(null)
  const [cacToken, setCacToken] = useState(0)
  const retryCac = useCallback(() => setCacToken(t => t + 1), [])
  // "What worked" + "What we're doing next" text, read live from two tabs of the H1_FY27_Marketing_Review sheet
  // (same period gate as the CAC sheet: the sheet only describes H1 FY26-27).
  const [reviewTabs, setReviewTabs] = useState(null)
  const [reviewTabsError, setReviewTabsError] = useState(null)
  // GA4 website traffic for the review half, whole half plus each month (one read per range --
  // the existing source=ga4 endpoint returns users per default channel group for a range).
  const [gaTraffic, setGaTraffic] = useState(null)
  const [gaError, setGaError] = useState(null)
  const [gaToken, setGaToken] = useState(0)
  const retryGa = useCallback(() => setGaToken(t => t + 1), [])
  useEffect(() => {
    if (frozen) return undefined
    let dead = false
    setGaTraffic(null); setGaError(null)
    // the review half, plus the previous half and the same half last year (for the traffic comparison)
    const ranges = [
      { key: 'half', since: isoDate(months.current.start), until: isoDate(months.current.end) },
      { key: 'prior', since: isoDate(months.prior.start), until: isoDate(months.prior.end) },
      { key: 'lastYear', since: isoDate(months.lastYear.start), until: isoDate(months.lastYear.end) },
    ]
    months.current.monthDates.forEach((d, i) => ranges.push({
      key: 'm' + i,
      since: isoDate(new Date(d.getFullYear(), d.getMonth(), 1)),
      until: isoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
    }))
    Promise.all(ranges.map(async rg => {
      const r = await fetch('/api/crm-leads?source=ga4&mode=range&since=' + rg.since + '&until=' + rg.until, { credentials: 'include' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.detail || d.error || ('HTTP ' + r.status))
      if (d.configured === false) throw new Error('GA4 is not configured')
      return [rg.key, d.range]
    }))
      .then(pairs => { if (!dead) setGaTraffic(Object.fromEntries(pairs)) })
      .catch(e => { if (!dead) setGaError(String((e && e.message) || e)) })
    return () => { dead = true }
  }, [months, gaToken, frozen])

  useEffect(() => {
    if (frozen || !cacApplies) return undefined
    let dead = false
    setCacSheet(null); setCacError(null)
    fetch('/api/crm-leads?source=bigquery&mode=marketing_review_cac', { credentials: 'include' })
      .then(async r => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status))
        return d
      })
      .then(d => { if (!dead) setCacSheet(d) })
      .catch(e => { if (!dead) setCacError(String((e && e.message) || e)) })
    return () => { dead = true }
  }, [cacToken, frozen, cacApplies])

  useEffect(() => {
    if (frozen || !cacApplies) return undefined
    let dead = false
    setReviewTabs(null); setReviewTabsError(null)
    fetch('/api/crm-leads?source=bigquery&mode=marketing_review_tabs', { credentials: 'include' })
      .then(async r => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status))
        return d
      })
      .then(d => { if (!dead) setReviewTabs(d) })
      .catch(async e => {
        // The live sheet read needs the sheet shared with the server's Google login; until then use the
        // copy saved in app_preferences (mr_review_tabs_copy), so the slides never go blank.
        try {
          const r = await fetch('/api/preferences', { credentials: 'include' })
          const p = await r.json()
          const copy = p && p.prefs && p.prefs.mr_review_tabs_copy
          if (copy && copy.whatWorked && copy.nextPriorities) { if (!dead) setReviewTabs(copy); return }
        } catch (_) { /* fall through to the error */ }
        if (!dead) setReviewTabsError(String((e && e.message) || e))
      })
    return () => { dead = true }
  }, [cacToken, frozen, cacApplies])

  useEffect(() => {
    if (frozen) return undefined
    let dead = false
    setRows(null); setError(null)
    // One continuous read from the start of the same half last year to the end
    // of the review half -- covers all three half-years in the table (the
    // half in between is contiguous), ~18 months of the small pre-aggregated
    // table (a few thousand rows).
    const since = isoDate(months.lastYear.start), until = isoDate(months.current.end)
    fetchOverallBqAggRows({ since, until })
      .then(a => { if (!dead) setRows(a) })
      .catch(e => { if (!dead) setError(e.message || 'Failed to load figures') })
    return () => { dead = true }
  }, [months, retryToken, frozen])

  // Organic's own slide needs a Sub_Source breakdown (Web/Inbound phone
  // call/Blog/App/...) that the small pre-aggregated table above can't
  // provide (it has no Sub_Source column) -- so this is the one extra,
  // deliberately narrow fetch against the bigger per-campaign table:
  // Source='Organic' only, review half-year only (about 1,700 rows a month, so
  // roughly 10,000 for six months, fetched in month chunks); NOT every source,
  // which this codebase has already learned the hard way runs 20,000-50,000+
  // rows A MONTH (see CLAUDE.md's Overall-BigQuery Month-tab entry) and is too
  // slow to prefetch unconditionally on every page load.
  useEffect(() => {
    if (frozen) return undefined
    let dead = false
    const since = isoDate(months.current.start), until = isoDate(months.current.end)
    // 'Branding' is its own Source since 2026-10-09 (it used to be folded into Organic), and the
    // Awareness & offline slide below still needs those rows, so both are fetched here.
    fetchOverallBqRows({ since, until, sources: ['Organic', 'Branding'] })
      .then(r => { if (!dead) setOrganicSubRows(r) })
      .catch(() => { if (!dead) setOrganicSubRows([]) })
    return () => { dead = true }
  }, [months, frozen])

  // On-demand only, never prefetched -- the top-5-campaigns drill-down on
  // the Channel Performance slide. Same reasoning as organicSubRows above:
  // fetching every channel's campaign-level data up front "just in case" it
  // gets clicked would mean fetching every source's campaign rows regardless.
  // Scoped to the review half-year only (the slide only ever shows that
  // period's channel mix). 'Other' has no single raw Source, so it asks for
  // exactly the Sources seen in the already-loaded agg rows that map to
  // 'Other' (Bing, Native Ads, Others, Referral, Linkedin, ...) instead of
  // pulling every source and filtering afterwards.
  const otherSources = useMemo(() => {
    if (!rows) return []
    const set = new Set()
    for (const r of rows) if (r.Source && reviewMapChannel(r.Source) === 'Other') set.add(r.Source)
    return [...set]
  }, [rows])
  const fetchChannelCampaigns = useCallback(async (channel) => {
    const since = isoDate(months.current.start), until = isoDate(months.current.end)
    const raw = RAW_SOURCE_BY_CHANNEL[channel]
    const sources = raw ? [raw] : otherSources
    if (!sources.length) return []
    // A whole half-year of one big channel (Facebook runs 20,000-50,000+ rows a
    // month) in ONE request trips Postgres's statement timeout (57014), so ask
    // month by month, two at a time, with one retry each, and collapse each
    // month to one pseudo-row per campaign straight away to keep memory small.
    // A month that still fails is skipped; only if EVERY month fails do we throw
    // (so the slide can say "could not load" rather than a false "no campaigns").
    const slices = months.current.monthDates.map(d => ({
      since: isoDate(new Date(d.getFullYear(), d.getMonth(), 1)),
      until: isoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
    }))
    const collapsed = []
    let okMonths = 0
    const runSlice = async (sl) => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const rs = await fetchOverallBqRows({ since: sl.since, until: sl.until, sources })
          const m = new Map()
          for (const r of rs) {
            const k = r.campaign_name || ''
            const e = m.get(k) || { campaign_name: k, 'Futwork Human QL': 0, 'Futwork AI QL': 0, 'Superbot AI QL': 0, 'Total Leads Generated': 0, Total_Spends: 0 }
            for (const f of ['Futwork Human QL', 'Futwork AI QL', 'Superbot AI QL', 'Total Leads Generated', 'Total_Spends']) e[f] += reviewNum(r[f])
            m.set(k, e)
          }
          collapsed.push(...m.values())
          okMonths++
          return
        } catch (e) { /* retry once, then skip this month */ }
      }
    }
    const queue = slices.slice()
    await Promise.all([0, 1].map(async () => { while (queue.length) await runSlice(queue.shift()) }))
    if (!okMonths) throw new Error('campaign rows could not be loaded')
    return rankTopCampaigns(collapsed, channel !== 'Organic')
  }, [months, otherSources])

  useEffect(() => {
    if (frozen) return undefined
    let dead = false
    fetchOverallBqSyncedAt().then(d => { if (!dead) setSyncedAt(d) }).catch(() => {})
    return () => { dead = true }
  }, [frozen])

  useEffect(() => {
    if (frozen) return undefined
    let dead = false
    fetch('/api/preferences', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { prefs: {} })
      .then(d => {
        if (!dead) {
          setAcSales((d.prefs && d.prefs.ac_sales_manual) || {})
          setAcTotals((d.prefs && d.prefs.ac_sales_period_totals) || {})
          setAcRevenue((d.prefs && d.prefs.ac_actual_revenue_manual) || {})
          setOrganicAc((d.prefs && d.prefs.mr_organic_ac_sale) || {})
          setAcSalesLoaded(true)
        }
      })
      .catch(() => { if (!dead) setAcSalesLoaded(true) })
    return () => { dead = true }
  }, [frozen])

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

  // Organic slide AC sale: one typed number per review period (key = first month + month count),
  // saved to app_preferences.mr_organic_ac_sale so it is remembered. Same optimistic-write pattern.
  const saveOrganicAc = useCallback(async (next) => {
    const prev = organicAc
    setOrganicAc(next); setOrganicAcSaving(true)
    try {
      const r = await fetch('/api/preferences', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'mr_organic_ac_sale', value: next }),
      })
      if (!r.ok) throw new Error('Save failed')
      return true
    } catch (e) {
      setOrganicAc(prev)
      return false
    } finally {
      setOrganicAcSaving(false)
    }
  }, [organicAc])

  // AC Actual Revenue -- a NEW, separate manual ₹ entry (per user's explicit
  // choice, 2026-09-10: NOT derived from the existing AC Sales count, which
  // is a unit count used for CPS, not a revenue figure). Same optimistic-
  // write/revert-on-failure pattern as saveAcSales above.
  const saveAcRevenue = useCallback(async (next) => {
    const prev = acRevenue
    setAcRevenue(next); setAcRevenueSaving(true)
    try {
      const r = await fetch('/api/preferences', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'ac_actual_revenue_manual', value: next }),
      })
      if (!r.ok) throw new Error('Save failed')
      return true
    } catch (e) {
      setAcRevenue(prev)
      return false
    } finally {
      setAcRevenueSaving(false)
    }
  }, [acRevenue])

  const aggByMonth = useMemo(() => {
    if (!rows) return null
    return {
      prior: aggregateReviewMonth(rows, months.prior.monthKeys),
      current: aggregateReviewMonth(rows, months.current.monthKeys),
      lastYear: aggregateReviewMonth(rows, months.lastYear.monthKeys),
    }
  }, [rows, months])

  // Same 4 months, rolled up by channel instead -- feeds the channel-
  // breakdown slide and the 3 per-channel spotlight slides.
  const byChannelByMonth = useMemo(() => {
    if (!rows) return null
    return {
      prior: aggregateReviewMonthByChannel(rows, months.prior.monthKeys),
      current: aggregateReviewMonthByChannel(rows, months.current.monthKeys),
      lastYear: aggregateReviewMonthByChannel(rows, months.lastYear.monthKeys),
    }
  }, [rows, months])

  const headlineRows = useMemo(() => {
    if (!aggByMonth || !acSalesLoaded) return null
    const roasRow = cacSheet && cacSheet.rows ? cacSheet.rows.find(r => String(r[0] || '').trim().toLowerCase() === 'roas') : null
    const roasCur = roasRow && Number.isFinite(parseFloat(roasRow[1])) ? parseFloat(roasRow[1]) : null
    return buildHeadlineRows(months, aggByMonth, acSales, acTotals, cacApplies ? roasCur : null)
  }, [aggByMonth, acSalesLoaded, acSales, acTotals, months, cacSheet, cacApplies])

  const channelRowsByChannel = useMemo(() => {
    if (!byChannelByMonth) return null
    const out = {}
    for (const ch of REVIEW_CHANNELS) out[ch] = buildChannelRows(months, byChannelByMonth, ch)
    return out
  }, [byChannelByMonth, months])

  // Every Sub_Source under Organic with real activity this month, ranked by
  // QL then leads -- capped at 8 rows so a long tail of one-off offline
  // campaigns (individual newspaper insertions, a single RJ mention) doesn't
  // turn the slide into a scroll. `hasData` distinguishes "still loading"
  // (organicSubRows === null) from "loaded, genuinely nothing this month".
  const organicSubSourceBreakdown = useMemo(() => {
    if (!organicSubRows) return null
    const mk = months.current.monthKeys
    const bySub = new Map()
    for (const r of organicSubRows) {
      if (String(r.Source || '').trim().toLowerCase() === 'branding') continue // Branding is not Organic
      const key = r.Sub_Source || 'Unlabeled'
      const e = bySub.get(key) || { name: key, ql: 0, leads: 0, byMonth: mk.map(() => 0) }
      const q = reviewNum(r['Futwork Human QL']) + reviewNum(r['Futwork AI QL']) + reviewNum(r['Superbot AI QL'])
      e.ql += q
      e.leads += reviewNum(r['Total Leads Generated'])
      const mi = mk.indexOf(r.month)
      if (mi >= 0) e.byMonth[mi] += q
      bySub.set(key, e)
    }
    // One-off tails (under 5 QLs in the whole period) are folded into "Blog-High Priority" so the
    // table lists real sub-sources only; if there is no such row they simply stay as they are.
    const all = [...bySub.values()].filter(e => e.ql > 0 || e.leads > 0)
    const blog = all.find(e => /^blog.*high priority/i.test(e.name))
    const kept = []
    for (const e of all) {
      if (blog && e !== blog && e.ql < 5) {
        blog.ql += e.ql; blog.leads += e.leads
        e.byMonth.forEach((v, i) => { blog.byMonth[i] += v })
      } else kept.push(e)
    }
    return kept.sort((a, b) => (b.ql - a.ql) || (b.leads - a.leads)).slice(0, 10)
  }, [organicSubRows, months])

  // Freezing: takes every figure the slides read (already computed, JSON-safe) plus the top-5
  // campaigns for each channel (normally fetched on click) and returns one object to store. Refuses
  // to freeze anything still loading or failed, so a frozen review is never incomplete.
  const buildSnapshot = useCallback(async (onProgress) => {
    if (!headlineRows || !aggByMonth || !byChannelByMonth || !channelRowsByChannel) throw new Error('The figures are still loading. Wait for them to finish, then freeze.')
    if (error) throw new Error('The figures failed to load: ' + error)
    if (organicSubRows == null) throw new Error('Organic sub-source figures are still loading.')
    if (cacApplies && (cacError || !cacSheet)) throw new Error(cacError ? 'The CAC sheet failed to load: ' + cacError : 'The CAC sheet is still loading.')
    if (cacApplies && (reviewTabsError || !reviewTabs)) throw new Error(reviewTabsError ? 'The review sheet tabs failed to load: ' + reviewTabsError : 'The review sheet tabs are still loading.')
    if (gaError || !gaTraffic) throw new Error(gaError ? 'Website traffic failed to load: ' + gaError : 'Website traffic is still loading.')
    const campaigns = {}
    for (const ch of REVIEW_CHANNELS) {
      if (onProgress) onProgress('Saving ' + ch + ' campaigns…')
      try { campaigns[ch] = await fetchChannelCampaigns(ch) }
      catch (e) { throw new Error('Could not load ' + ch + ' campaigns (' + ((e && e.message) || 'error') + '). Try again.') }
    }
    const pickManual = map => {
      const keep = {}
      for (const sp of [months.current, months.prior, months.lastYear]) for (const ym of sp.ymKeys) if (map && map[ym] != null) keep[ym] = map[ym]
      return keep
    }
    const collapsedOrganic = new Map()
    for (const r of organicSubRows) {
      const k = (r.Sub_Source || '') + '|' + (r.Source || '') + '|' + (r.month || '')
      const e = collapsedOrganic.get(k) || { Sub_Source: r.Sub_Source || '', Source: r.Source || '', month: r.month || '', 'Total Leads Generated': 0, 'Futwork Human QL': 0, 'Futwork AI QL': 0, 'Superbot AI QL': 0 }
      for (const f of ['Total Leads Generated', 'Futwork Human QL', 'Futwork AI QL', 'Superbot AI QL']) e[f] += reviewNum(r[f])
      collapsedOrganic.set(k, e)
    }
    const chanObj = o => Object.fromEntries(Object.entries(o).map(([k, m]) => [k, Object.fromEntries(m)]))
    return JSON.parse(JSON.stringify({
      v: 1, takenAt: new Date().toISOString(), specKey: sKey,
      headlineRows, aggByMonth, byChannelByMonth: chanObj(byChannelByMonth), channelRowsByChannel,
      organicSubRows: [...collapsedOrganic.values()], organicSubSourceBreakdown,
      acSales: pickManual(acSales), acRevenue: pickManual(acRevenue), organicAcSale: organicAc[organicAcKey(months.current)] != null ? organicAc[organicAcKey(months.current)] : null,
      cacSheet: cacApplies ? cacSheet : null, reviewTabs: cacApplies ? reviewTabs : null, gaTraffic, syncedAt: syncedAt ? new Date(syncedAt).toISOString() : null, campaigns,
    }))
  }, [headlineRows, aggByMonth, byChannelByMonth, channelRowsByChannel, error, organicSubRows, organicSubSourceBreakdown, cacApplies, cacError, cacSheet, reviewTabs, reviewTabsError, gaError, gaTraffic, fetchChannelCampaigns, months, acSales, acRevenue, organicAc, syncedAt, sKey])

  const liveValue = useMemo(() => ({
    months, frozen: false, cacApplies, buildSnapshot,
    loading: (rows == null || !acSalesLoaded) && !error, error, headlineRows,
    acSales, acSaving, saveAcSales, acRevenue, acRevenueSaving, saveAcRevenue, organicAc, organicAcSaving, saveOrganicAc, syncedAt,
    aggByMonth, byChannelByMonth, channelRowsByChannel, organicSubRows,
    organicSubSourceBreakdown, fetchChannelCampaigns, cacSheet, cacError, retryCac, reviewTabs, reviewTabsError, gaTraffic, gaError, retryGa,
    retry: () => setRetryToken(t => t + 1),
  }), [months, cacApplies, buildSnapshot, rows, acSalesLoaded, error, headlineRows, acSales, acSaving, saveAcSales, acRevenue, acRevenueSaving, saveAcRevenue, organicAc, organicAcSaving, saveOrganicAc, syncedAt, aggByMonth, byChannelByMonth, channelRowsByChannel, organicSubRows, organicSubSourceBreakdown, fetchChannelCampaigns, cacSheet, cacError, retryCac, reviewTabs, reviewTabsError, gaTraffic, gaError, retryGa])

  // A frozen review: the same shape, read from the saved snapshot. Nothing here fetches.
  const frozenValue = useMemo(() => {
    if (!snapshot) return null
    const mapOf = o => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, new Map(Object.entries(v || {}))]))
    const noopSave = async () => false
    return {
      months, frozen: true, cacApplies: !!snapshot.cacSheet, buildSnapshot: null,
      loading: false, error: null, headlineRows: snapshot.headlineRows,
      acSales: snapshot.acSales || {}, acSaving: false, saveAcSales: noopSave,
      acRevenue: snapshot.acRevenue || {}, acRevenueSaving: false, saveAcRevenue: noopSave,
      organicAc: snapshot.organicAcSale != null ? { [organicAcKey(months.current)]: snapshot.organicAcSale } : {}, organicAcSaving: false, saveOrganicAc: noopSave,
      syncedAt: snapshot.syncedAt ? new Date(snapshot.syncedAt) : null,
      aggByMonth: snapshot.aggByMonth, byChannelByMonth: mapOf(snapshot.byChannelByMonth),
      channelRowsByChannel: snapshot.channelRowsByChannel, organicSubRows: snapshot.organicSubRows || [],
      organicSubSourceBreakdown: snapshot.organicSubSourceBreakdown,
      fetchChannelCampaigns: async ch => (snapshot.campaigns && snapshot.campaigns[ch]) || [],
      cacSheet: snapshot.cacSheet, cacError: null, retryCac: () => {}, reviewTabs: snapshot.reviewTabs || null, reviewTabsError: null, gaTraffic: snapshot.gaTraffic, gaError: null, retryGa: () => {},
      retry: () => {},
    }
  }, [snapshot, months])

  const value = frozen ? frozenValue : liveValue

  return <MarketingReviewDataContext.Provider value={value}>{children}</MarketingReviewDataContext.Provider>
}

/* ---------- slide bodies ---------- */

function CoverSlide({ active, period }) {
  const ctx = useMarketingReviewData()
  const coverTitle = (ctx ? ctx.months.current.typeTitle : 'Half-Year') + ' Marketing Review'
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
        }}>{coverTitle}</div>
        <div style={{
          fontSize: 58, fontWeight: 800, color: '#fff', letterSpacing: '-1.5px', lineHeight: 1.05, marginBottom: 18,
          animation: active ? 'mrCoverTitleIn .6s cubic-bezier(.22,1,.36,1) .25s both' : undefined,
        }}>{period}</div>
        <div style={{
          fontSize: 17, color: 'rgba(255,255,255,0.72)', maxWidth: 620, margin: '0 auto', lineHeight: 1.55,
          animation: active ? 'mrFadeUp .5s cubic-bezier(.22,1,.36,1) .45s both' : undefined,
        }}>Performance across paid channels, organic growth and lead qualification, spend, funnel, wins and what's next.</div>
      </div>
      <div style={{
        position: 'absolute', bottom: 26, left: 0, right: 0, textAlign: 'center', fontSize: 11.5, fontWeight: 600,
        color: 'rgba(255,255,255,0.4)', zIndex: 2,
      }}>Prepared by Leverage Quantum</div>
    </div>
  )
}

// The agenda is built from the deck itself: every visible slide that has an `agenda` line is listed,
// in the deck's current order, with its slide number -- so reordering or hiding a slide updates the
// agenda and its numbers by itself.
const DeckSlidesContext = React.createContext([])
function AgendaSlide({ active }) {
  const deckSlides = React.useContext(DeckSlidesContext)
  const ctx = useMarketingReviewData()
  const unit = ctx ? ctx.months.current.unit : 'period'
  const items = []
  deckSlides.forEach((sl, idx) => {
    if (!sl.agenda) return
    items.push({ text: typeof sl.agenda === 'function' ? sl.agenda(unit) : sl.agenda, slideNo: idx + 1 })
  })
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#fff', padding: '68px 72px', boxSizing: 'border-box' }}>
      <SectionKicker label="Agenda" title="What we'll cover" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 10 }}>
        {items.map((it, i) => (
          <div key={i} className={active ? styles.staggerItem : undefined}
            style={{ display: 'flex', alignItems: 'center', gap: 18, animationDelay: active ? (0.08 * i) + 's' : undefined }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 800, color: '#fff', background: `linear-gradient(135deg, ${BRAND_RAMP[i % 4]}, ${BRAND_RAMP[(i + 1) % 4]})`,
            }}>{i + 1}</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#1E2A44', flex: 1 }}>{it.text}</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#94A3B8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Slide {it.slideNo}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function exactHeadlineTitle(v, money) {
  if (v == null) return undefined
  return money ? fmtINR(v) : fmtN(v)
}
function fmtDeltaPrior(v, money) { return money ? fmtINRShort(v || 0) : fmtN(v || 0) }

// Counts a number up from 0 to its real value whenever the slide holding it
// becomes the active one -- the "number reveal" effect the deck had on its
// very first KPI-tile version, reintroduced properly this time: `active`
// gates it, so a thumbnail/gallery/print render of the same component (which
// always passes active=false) shows the real final number immediately,
// never a stuck 0. Because the deck's main-stage wrapper remounts by
// `key={index}` on every navigation, this naturally replays on every visit
// with no extra "trigger" state needed.
function useCountUp(target, active, { duration = 900, delay = 0 } = {}) {
  const [display, setDisplay] = useState(() => (active && typeof target === 'number') ? 0 : target)
  useEffect(() => {
    if (!active || typeof target !== 'number') { setDisplay(target); return undefined }
    let raf = null, cancelled = false
    const startTimer = setTimeout(() => {
      const t0 = performance.now()
      const tick = (now) => {
        if (cancelled) return
        const t = Math.min(1, (now - t0) / duration)
        const eased = 1 - Math.pow(1 - t, 3)
        setDisplay(target * eased)
        if (t < 1) raf = requestAnimationFrame(tick)
        else setDisplay(target)
      }
      raf = requestAnimationFrame(tick)
    }, delay)
    return () => { cancelled = true; clearTimeout(startTimer); if (raf) cancelAnimationFrame(raf) }
  }, [target, active, duration, delay])
  return display
}
// Thin wrapper applying useCountUp to a headline-table-style cell, keeping
// the same money/plain (fmtINRShort/fmtN) formatting every cell already used
// so an animating cell and a static one are visually identical except for motion.
function AnimatedNumber({ value, money, active, delay = 0, duration = 900 }) {
  const numeric = typeof value === 'number' ? value : null
  const display = useCountUp(numeric, active, { duration, delay: delay * 1000 })
  if (value == null) return <>-</>
  return <>{money ? fmtINRShort(display) : fmtN(display)}</>
}

function DeltaCell({ delta, prior, money, invert, showPrior = true }) {
  if (delta == null) return <span style={{ fontSize: 12, fontWeight: 600, color: '#94A3B8' }}>-</span>
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

// Column headers for the half-year tables: the half's name with its month range
// underneath, so "H1 FY25-26" is never a guessing game.
function PeriodColumnHead({ spec }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 11.5, fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{spec.label}</div>
      <div style={{ fontSize: 9.5, fontWeight: 600, color: '#94A3B8', marginTop: 1 }}>{spec.range}</div>
    </div>
  )
}
function PeriodDeltaHead({ spec }) {
  return <div style={{ fontSize: 10.5, fontWeight: 800, color: '#64748B', textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.03em', alignSelf: 'end' }}>vs {spec.label}</div>
}

// Short written takeaways under the headline table. The first two are the team's own statements about
// AC sales (entered as written, not computed here); the third is computed from the table itself.
function HeadlineInsights({ rows, months, active }) {
  const cpac = rows.find(r => r.key === 'cpac')
  const lines = [
    'AC sale TAT is longer than SR app TAT.',
    '80% of AC sales come from leads of the last three months.',
  ]
  if (cpac && cpac.values[2] != null && cpac.deltaVsPrior != null && cpac.deltaVsPrior !== 'new') {
    const d = cpac.deltaVsPrior
    lines.push('Cost per (App + AC sale) is ' + fmtINRShort(cpac.values[2]) + ', ' + (d <= 0 ? 'down ' : 'up ') + Math.abs(d).toFixed(1) + '% vs ' + months.prior.label + '.')
  }
  return (
    <div className={active ? styles.staggerItem : undefined} style={{ marginTop: 14, background: '#F8FAFC', border: '0.5px solid #E2E8F0', borderRadius: 12, padding: '12px 16px', animationDelay: active ? '0.4s' : undefined }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>What stands out</div>
      {lines.map((t, i) => (
        <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13, fontWeight: 600, color: '#1E2A44', lineHeight: 1.45, marginBottom: i < lines.length - 1 ? 4 : 0 }}>
          <span style={{ width: 6, height: 6, borderRadius: 3, background: GREEN, marginTop: 6, flexShrink: 0 }} />{t}
        </div>
      ))}
    </div>
  )
}

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
  const { months, loading, error, headlineRows, acSales, acSaving, saveAcSales, retry } = ctx
  // oldest to newest: same half last year, the previous half, the review half
  const displayPeriods = [months.lastYear, months.prior, months.current]

  const openEdit = () => {
    const d = {}
    displayPeriods.forEach(h => h.ymKeys.forEach(ym => { d[ym] = acSales[ym] != null ? String(acSales[ym]) : '' }))
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
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#fff', padding: '52px 72px 30px', boxSizing: 'border-box' }}>
      <PeriodBadge period={period} live />
      <div style={{ marginBottom: -12 }}><SectionKicker label="Executive Summary" title="The headline numbers" /></div>

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
            {displayPeriods.map((h, i) => <PeriodColumnHead key={i} spec={h} />)}
            <PeriodDeltaHead spec={months.prior} />
            <PeriodDeltaHead spec={months.lastYear} />
          </div>

          {headlineRows.map((row, i) => (
            <div key={row.key} className={active ? styles.staggerItem : undefined} style={{
              display: 'grid', gridTemplateColumns: HEADLINE_GRID_COLS, columnGap: 16, alignItems: 'center',
              padding: '4.5px 0', borderBottom: '1px solid #F1F5F9',
              animationDelay: active ? (0.035 * i) + 's' : undefined,
            }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 6 }}>
                {row.label}
                {row.key === 'acSales' && active && !ctx.frozen && (
                  <button type="button" onClick={openEdit} className={styles.noPrint} title="Enter AC Sales"
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: BLUE, padding: 2, display: 'inline-flex' }}>
                    <EditIcon />
                  </button>
                )}
              </div>
              {row.values.map((v, ci) => {
                const nMonths = months.current.monthDates.length
                const entered = row.acEntered ? row.acEntered[ci] : nMonths
                const partial = row.acEntered && entered > 0 && entered < nMonths
                return (
                  <div key={ci} title={partial ? 'AC Sales entered for ' + entered + ' of ' + nMonths + ' months only, so this is a partial total' : exactHeadlineTitle(v, row.money)}
                    style={{ fontSize: 14.5, fontWeight: 800, color: v == null ? '#CBD5E1' : '#0F172A', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {row.key === 'roas' ? (v == null ? '-' : v.toFixed(2) + 'x') : <AnimatedNumber value={v} money={row.money} active={active} delay={0.035 * i} />}
                    {partial && <span style={{ color: '#94A3B8', fontWeight: 700 }}> *</span>}
                  </div>
                )
              })}
              <div style={{ textAlign: 'right' }}><DeltaCell delta={row.deltaVsPrior} prior={row.priorForDeltaVsPrior} money={row.money} invert={row.invert} showPrior={false} /></div>
              <div style={{ textAlign: 'right' }}><DeltaCell delta={row.deltaVsLastYear} prior={row.priorForDeltaVsLastYear} money={row.money} invert={row.invert} showPrior={false} /></div>
            </div>
          ))}
          <HeadlineInsights rows={headlineRows} months={months} active={active} />
        </>
      )}

      {editOpen && (
        <div className={styles.noPrint} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 6 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '22px 24px', width: 640, boxShadow: '0 20px 50px rgba(0,0,0,0.28)' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>Enter AC Sales</div>
            <div style={{ fontSize: 12, color: '#64748B', marginBottom: 16, lineHeight: 1.5 }}>Not tracked in Quantum, enter the sales count for each month. The figure for a period is the sum of its months; leave a month blank if it is not known. CPS (Spend ÷ AC Sales) is computed automatically.</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
              {displayPeriods.map(h => (
                <div key={h.label}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>{h.label}</div>
                  {h.monthDates.map((m, mi) => {
                    const ym = h.ymKeys[mi]
                    return (
                      <div key={ym} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                        <div style={{ width: 52, fontSize: 12, fontWeight: 700, color: '#334155', flexShrink: 0 }}>{monthLong(m)}</div>
                        <input type="number" min="0" value={draft[ym] || ''} onChange={e => setDraft(d => ({ ...d, [ym]: e.target.value }))}
                          placeholder="0" style={{ flex: 1, minWidth: 0, border: '1px solid #E2E8F0', borderRadius: 8, padding: '6px 8px', fontSize: 12.5, fontFamily: FONT, boxSizing: 'border-box' }} />
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
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

function ChannelBar({ ch, max, active, delay, labelWidth = 128 }) {
  const pct = active ? (ch.value / max) * 100 : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
      <div title={ch.name} style={{
        width: labelWidth, fontSize: 13.5, fontWeight: 700, color: '#334155', flexShrink: 0,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{ch.name}</div>
      <div style={{ flex: 1, height: 22, borderRadius: 6, background: '#F1F5F9', overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 6, width: pct + '%', transition: `width 1s cubic-bezier(.22,1,.36,1) ${delay}s`,
          background: `linear-gradient(90deg, ${ch.hue}, ${ch.hue}CC)`,
        }} />
      </div>
      <div style={{ width: 70, textAlign: 'right', fontSize: 13.5, fontWeight: 800, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
        <AnimatedNumber value={ch.value} active={active} delay={delay} duration={1000} />
      </div>
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

// Ranked top-5-campaigns list revealed under a clicked channel bar. `isPaid`
// controls whether CPQL is shown (Organic has no spend, so no cost column).
function ChannelCampaignsList({ campaigns, isPaid, active }) {
  if (campaigns && campaigns.error) return <div style={{ color: '#94A3B8', fontSize: 12.5, padding: '4px 0 4px 22px' }}>Could not load campaigns just now. Close and reopen this channel to retry.</div>
  if (!campaigns.length) return <div style={{ color: '#94A3B8', fontSize: 12.5, padding: '4px 0 4px 22px' }}>No named campaigns with QLs in this period.</div>
  return (
    <div style={{ paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {campaigns.map((c, i) => (
        <div key={c.name + i} className={active ? styles.staggerItem : undefined}
          style={{ display: 'flex', alignItems: 'center', gap: 10, animationDelay: active ? (0.05 * i) + 's' : undefined }}>
          <div style={{
            width: 18, height: 18, borderRadius: 5, background: NAVY, color: '#fff', fontSize: 10.5, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>{i + 1}</div>
          <div title={c.name} style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: '#0F172A', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{fmtN(c.ql)} QL</div>
          {isPaid && <div style={{ fontSize: 11.5, fontWeight: 700, color: '#94A3B8', fontVariantNumeric: 'tabular-nums', flexShrink: 0, width: 78, textAlign: 'right' }}>
            {c.cpql != null ? fmtINRShort(c.cpql) + ' CPQL' : '-'}
          </div>}
        </div>
      ))}
    </div>
  )
}

function ChannelPerformanceSlide({ active, period }) {
  const ctx = useMarketingReviewData()
  const byChannelByMonth = ctx && ctx.byChannelByMonth
  const fetchChannelCampaigns = ctx && ctx.fetchChannelCampaigns
  const [openChannel, setOpenChannel] = useState(null)
  const [campaignCache, setCampaignCache] = useState({})
  const [campaignLoading, setCampaignLoading] = useState(null)
  const channelRows = useMemo(() => {
    if (!byChannelByMonth) return []
    const cur = byChannelByMonth.current
    return REVIEW_CHANNELS
      .map((name, i) => ({ name, hue: BRAND_RAMP[i % 4], ...(cur.get(name) || { ql: 0, leads: 0, spend: 0 }) }))
      .sort((a, b) => b.ql - a.ql)
  }, [byChannelByMonth])

  const toggleChannel = useCallback((name) => {
    setOpenChannel(v => v === name ? null : name)
    setCampaignCache(prev => {
      if (prev[name] !== undefined && !(prev[name] && prev[name].error)) return prev
      setCampaignLoading(name)
      fetchChannelCampaigns(name).then(list => {
        setCampaignCache(c => ({ ...c, [name]: list }))
        setCampaignLoading(l => l === name ? null : l)
      }).catch(() => {
        setCampaignCache(c => ({ ...c, [name]: { error: true } }))
        setCampaignLoading(l => l === name ? null : l)
      })
      return prev
    })
  }, [fetchChannelCampaigns])

  if (!ctx) return null
  const { months } = ctx
  const max = Math.max(1, ...channelRows.map(c => c.ql))
  // Written takeaways, built from the same QL figures the bars show.
  const insights = (() => {
    const total = channelRows.reduce((sum, c) => sum + c.ql, 0)
    if (!total || !byChannelByMonth) return []
    const out = []
    const named = channelRows.filter(c => c.name !== 'Other')
    const top = named[0], second = named[1]
    if (top) {
      const share = (top.ql / total * 100).toFixed(0)
      out.push(top.name === 'Meta Ads'
        ? 'Meta Ads continues to be our engine to drive QLs: ' + fmtN(top.ql) + ' QLs, ' + share + '% of the total.'
        : top.name + ' is our biggest QL driver: ' + fmtN(top.ql) + ' QLs, ' + share + '% of the total.')
    }
    if (second && second.ql > 0) out.push(second.name + ' is the second largest source with ' + fmtN(second.ql) + ' QLs (' + (second.ql / total * 100).toFixed(0) + '% of the total).')
    const prior = byChannelByMonth.prior
    const grow = named.map(c => {
      const p = prior && prior.get(c.name) ? prior.get(c.name).ql : 0
      return { name: c.name, cur: c.ql, prev: p, pct: p >= 200 ? ((c.ql - p) / p) * 100 : null }
    }).filter(g => g.pct != null && g.pct > 0).sort((a, b) => b.pct - a.pct)[0]
    if (grow) out.push(grow.name + ' QLs grew ' + grow.pct.toFixed(0) + '% vs ' + months.prior.label + ' (' + fmtN(grow.prev) + ' to ' + fmtN(grow.cur) + ').')
    const ql = ctx.headlineRows && ctx.headlineRows.find(r => r.key === 'ql')
    if (ql && ql.deltaVsLastYear != null && ql.deltaVsLastYear !== 'new') out.push('Total QLs are ' + (ql.deltaVsLastYear >= 0 ? 'up ' : 'down ') + Math.abs(ql.deltaVsLastYear).toFixed(1) + '% vs ' + months.lastYear.label + '.')
    return out
  })()
  return (
    <LiveDataFrame ctx={ctx} label="Channel Performance" title="Where the QLs came from" period={period} active={active}>
      {channelRows.length === 0 ? (
        <div style={{ color: '#94A3B8', fontSize: 14, padding: '40px 0' }}>No QLs recorded for {months ? months.current.label : 'this period'} yet.</div>
      ) : (
        <div style={{ marginTop: 12 }}>
          {channelRows.map((c, i) => {
            const isOpen = openChannel === c.name
            return (
              <div key={c.name}>
                <div onClick={() => toggleChannel(c.name)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1 }}><ChannelBar ch={{ name: c.name, value: c.ql, hue: c.hue }} max={max} active={active} delay={0.1 * i} /></div>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                    style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s ease', flexShrink: 0, marginBottom: 16 }}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
                {isOpen && (
                  <div style={{ marginTop: -6, marginBottom: 16 }}>
                    {campaignLoading === c.name ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#94A3B8', fontSize: 12.5, paddingLeft: 22 }}>
                        <span className={styles.mrSpinner} />Loading top campaigns…
                      </div>
                    ) : (
                      <ChannelCampaignsList campaigns={campaignCache[c.name] || []} isPaid={c.name !== 'Organic'} active={active} />
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {insights.length > 0 && (
        <div style={{ marginTop: 12, background: '#F8FAFC', border: '0.5px solid #E2E8F0', borderRadius: 12, padding: '12px 16px' }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>What stands out</div>
          {insights.map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13, fontWeight: 600, color: '#1E2A44', lineHeight: 1.45, marginBottom: i < insights.length - 1 ? 4 : 0 }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: GREEN, marginTop: 6, flexShrink: 0 }} />{t}
            </div>
          ))}
        </div>
      )}
    </LiveDataFrame>
  )
}

// Sub-rows revealed under a clicked, drillable stage -- same visual language
// as the parent stage bars (label/value above, proportional bar below) but
// smaller and indented, so a click reads as "expanding" the row it came from
// rather than opening something disconnected.
function FunnelSubRow({ label, value, max, hue, active, delay, money }) {
  const widthPct = active ? Math.max(3, Math.min(100, (value / max) * 100)) : 0
  return (
    <div style={{ paddingLeft: 22 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#475569' }}>{label}</span>
        <span style={{ fontSize: 13.5, fontWeight: 800, color: '#334155', fontVariantNumeric: 'tabular-nums' }}>
          <AnimatedNumber value={value} money={money} active={active} delay={delay} duration={700} />
        </span>
      </div>
      <div style={{ height: 9, borderRadius: 5, background: '#F1F5F9', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 5, width: widthPct + '%', transition: 'width .7s cubic-bezier(.22,1,.36,1)', background: hue }} />
      </div>
    </div>
  )
}

function FunnelSlide({ active, period }) {
  const ctx = useMarketingReviewData()
  const aggByMonth = ctx && ctx.aggByMonth
  const acRevenue = ctx && ctx.acRevenue
  const saveAcRevenue = ctx && ctx.saveAcRevenue
  const months = ctx && ctx.months
  const [expanded, setExpanded] = useState(null)
  const [editOpen, setEditOpen] = useState(false)
  const [draftRevenue, setDraftRevenue] = useState({})
  const [savingRevenue, setSavingRevenue] = useState(false)
  const stages = useMemo(() => {
    if (!aggByMonth) return []
    const a = aggByMonth.current
    return [
      { key: 'leads', label: 'Leads', value: a.leads },
      { key: 'queued', label: 'Total Queued', value: a.queued },
      {
        key: 'ql', label: 'Total QL', value: a.ql, drillable: true,
        sub: [
          { label: 'Futwork Human QL', value: a.humanQl },
          { label: 'Futwork AI QL', value: a.aiQl },
          { label: 'Superbot QL', value: a.superbotQl },
        ],
      },
      { key: 'apps', label: 'Applications', value: a.apps },
    ]
  }, [aggByMonth])
  // Est. SR Revenue reuses Overall's own live, shared formula (Settings >
  // Data > SR Revenue Assumptions): Estimated RAU = Deposits x rauPct%,
  // Est. SR Revenue = Estimated RAU x SR Fee -- same keys/defaults, so this
  // can never silently drift from what Overall itself would show. AC Actual
  // Revenue is a brand-new, separate manual ₹ entry (per explicit user
  // choice, 2026-09-10) -- deliberately NOT derived from the existing AC
  // Sales count on the headline slide, which is a unit count for CPS, not a
  // revenue figure.
  const revenue = useMemo(() => {
    if (!aggByMonth || !months) return null
    const a = aggByMonth.current
    const estimatedRaus = a.deposits * (readRauPct() / 100)
    const estSrRevenue = estimatedRaus * readSrFee()
    // AC Actual Revenue is entered per MONTH; the half-year figure is the sum
    // of whichever of its six months have a value.
    const mine = sumManualForPeriod(acRevenue, months.current)
    const acActual = mine.total || 0
    return { estSrRevenue, acActual, hasAcActual: mine.entered > 0, acEntered: mine.entered, total: estSrRevenue + acActual }
  }, [aggByMonth, acRevenue, months])

  const openRevenueEdit = () => {
    const d = {}
    if (months) months.current.ymKeys.forEach(ym => { d[ym] = acRevenue && acRevenue[ym] != null ? String(acRevenue[ym]) : '' })
    setDraftRevenue(d)
    setEditOpen(true)
  }
  const saveRevenueDraft = async () => {
    const next = { ...acRevenue }
    for (const [ym, val] of Object.entries(draftRevenue)) {
      const trimmed = String(val).trim()
      if (trimmed === '') { delete next[ym]; continue }
      const n = Number(trimmed)
      if (!Number.isFinite(n) || n < 0) return
      next[ym] = n
    }
    setSavingRevenue(true)
    const ok = await saveAcRevenue(next)
    setSavingRevenue(false)
    if (ok) setEditOpen(false)
  }

  if (!ctx) return null
  // The true max across every stage, NOT stages[0] (Leads) -- Total Queued
  // is a same-CALENDAR-MONTH sum of its own queuing timestamp, independent
  // of when the underlying lead was generated, so it can genuinely exceed
  // that month's Leads figure (queuing work carried over from an earlier
  // month's leads). A real, honest characteristic of the data, not a bug --
  // assuming Leads is always the largest stage would have silently produced
  // a >100%-wide bar for Queued whenever this happens.
  const max = stages.length ? Math.max(1, ...stages.map(s => s.value)) : 1
  return (
    <LiveDataFrame ctx={ctx} label="Funnel & Conversion" title="How leads moved through the pipeline" period={period} active={active}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 16 }}>
        {stages.map((s, i) => {
          // Label/value sit ABOVE the bar, never inside it -- Leads-to-
          // Applications typically spans 2+ orders of magnitude, so a stage
          // near the bottom can be a sliver only a few px wide; text placed
          // inside that sliver would overlap illegibly.
          const widthPct = active ? Math.max(3, Math.min(100, (s.value / max) * 100)) : 0
          const prev = stages[i - 1]
          const convPct = prev && prev.value > 0 ? ((s.value / prev.value) * 100).toFixed(1) + '% of prior stage' : null
          const isOpen = s.drillable && expanded === s.key
          const subMax = s.sub ? Math.max(1, ...s.sub.map(x => x.value)) : 1
          return (
            <div key={s.label}>
              <div
                onClick={s.drillable ? () => setExpanded(v => v === s.key ? null : s.key) : undefined}
                style={{
                  display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6,
                  cursor: s.drillable ? 'pointer' : 'default',
                }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {s.label}
                  {s.drillable && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                      style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s ease' }}>
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  )}
                </span>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                  {convPct && <span style={{ fontSize: 11.5, color: '#94A3B8', fontWeight: 700, whiteSpace: 'nowrap' }}>{convPct}</span>}
                  <span style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                    <AnimatedNumber value={s.value} active={active} delay={0.12 * i} duration={1000} />
                  </span>
                </span>
              </div>
              <div style={{ height: 14, borderRadius: 7, background: '#F1F5F9', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 7, width: widthPct + '%', transition: `width .9s cubic-bezier(.22,1,.36,1) ${0.12 * i}s`,
                  background: `linear-gradient(90deg, ${BRAND_RAMP[i % 4]}, ${BRAND_RAMP[i % 4]}CC)`,
                }} />
              </div>
              {isOpen && (
                <div className={styles.staggerItem} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12, paddingTop: 4 }}>
                  {s.sub.map((x, si) => (
                    <FunnelSubRow key={x.label} label={x.label} value={x.value} max={subMax}
                      hue={[NAVY, BLUE, CYAN][si % 3]} active={active} delay={0.08 * si} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {/* Total Revenue -- deliberately NOT one of the proportional funnel
            bars above (a rupee figure and a lead COUNT don't share a
            meaningful scale), so it's its own clickable summary row instead,
            revealing Est. SR Revenue vs AC Actual Revenue on click -- those
            two genuinely do share a scale (both money), unlike Revenue vs Leads. */}
        {revenue && (
          <div style={{ paddingTop: 4, borderTop: '1px solid #F1F5F9' }}>
            <div
              onClick={() => setExpanded(v => v === 'revenue' ? null : 'revenue')}
              style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', cursor: 'pointer' }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 6 }}>
                Total Revenue
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform: expanded === 'revenue' ? 'rotate(180deg)' : 'none', transition: 'transform .2s ease' }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
                {active && !ctx.frozen && (
                  <button type="button" onClick={e => { e.stopPropagation(); openRevenueEdit() }} className={styles.noPrint} title="Enter AC Actual Revenue"
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: BLUE, padding: 2, display: 'inline-flex' }}>
                    <EditIcon />
                  </button>
                )}
              </span>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                <AnimatedNumber value={revenue.total} money active={active} delay={0.12 * stages.length} duration={1000} />
              </span>
            </div>
            {expanded === 'revenue' && (
              <div className={styles.staggerItem} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12, paddingTop: 4 }}>
                <FunnelSubRow label="Estimated SR Revenue" value={revenue.estSrRevenue}
                  max={Math.max(1, revenue.estSrRevenue, revenue.acActual)} hue={NAVY} active={active} delay={0} money />
                <FunnelSubRow label={!revenue.hasAcActual ? 'AC Actual Revenue (not entered yet)' : revenue.acEntered < months.current.monthDates.length ? 'AC Actual Revenue (' + revenue.acEntered + ' of ' + months.current.monthDates.length + ' months entered)' : 'AC Actual Revenue'} value={revenue.acActual}
                  max={Math.max(1, revenue.estSrRevenue, revenue.acActual)} hue={BLUE} active={active} delay={0.08} money />
              </div>
            )}
          </div>
        )}
      </div>
      {editOpen && (
        <div className={styles.noPrint} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 6 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '22px 24px', width: 380, boxShadow: '0 20px 50px rgba(0,0,0,0.28)' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>Enter AC Actual Revenue</div>
            <div style={{ fontSize: 12, color: '#64748B', marginBottom: 16, lineHeight: 1.5 }}>Not tracked in Quantum, enter the rupee revenue for each month of {months ? months.current.label : 'the period'}. The deck adds them up; leave a month blank if it is not known.</div>
            {months && months.current.monthDates.map((m, mi) => {
              const ym = months.current.ymKeys[mi]
              return (
                <div key={ym} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 58, fontSize: 12.5, fontWeight: 700, color: '#334155', flexShrink: 0 }}>{monthLong(m)}</div>
                  <input type="number" min="0" value={draftRevenue[ym] || ''} onChange={e => setDraftRevenue(d => ({ ...d, [ym]: e.target.value }))}
                    placeholder="0" style={{ flex: 1, border: '1px solid #E2E8F0', borderRadius: 8, padding: '7px 10px', fontSize: 13, fontFamily: FONT, boxSizing: 'border-box' }} />
                </div>
              )
            })}
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <Button size="sm" variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={saveRevenueDraft} disabled={savingRevenue}>{savingRevenue ? 'Saving…' : 'Save'}</Button>
            </div>
          </div>
        </div>
      )}
    </LiveDataFrame>
  )
}

// Per-channel spotlight -- one shared body, 3 named wrapper slides below
// (Google Ads / Meta Ads / Organic) rather than threading a `channel` prop
// through SLIDES' fixed {active, period} Body signature. Same 3-half-years +
// 2-deltas table shape as the headline slide, scoped to one channel; AC
// Sales/CPS are dropped since neither has a real per-channel figure.
function ChannelSpotlightBody({ active, period, channel, title }) {
  const ctx = useMarketingReviewData()
  const [acEditOpen, setAcEditOpen] = useState(false)
  const [acDraft, setAcDraft] = useState('')
  if (!ctx) return null
  // Organic only: Apps, AC sales and their total for the channel, read from the Finance "B2C H1 CAC" sheet
  // (H1 FY26-27 only). AC sales is blank in the sheet until Finance fills it, shown as a dash until then.
  const sheetRows = channel === 'Organic' && ctx.cacApplies && ctx.cacSheet ? ctx.cacSheet.rows : null
  const orgCol = sheetRows ? (sheetRows[0] || []).findIndex(h => String(h).trim().toLowerCase() === 'organic') : -1
  const sheetNum = (label) => {
    if (!sheetRows || orgCol < 0) return null
    const r = sheetRows.find(x => String(x[0] || '').trim().toLowerCase() === label)
    const n = r ? parseFloat(String(r[orgCol] || '').replace(/,/g, '')) : NaN
    return Number.isFinite(n) ? n : null
  }
  const { months, channelRowsByChannel } = ctx
  const manualKey = months ? organicAcKey(months.current) : ''
  const manualAc = ctx.organicAc && ctx.organicAc[manualKey] != null ? Number(ctx.organicAc[manualKey]) : null
  const orgApps = sheetNum('total apps')
  const orgAc = manualAc != null ? manualAc : sheetNum('total ac sales')
  const canEditAc = channel === 'Organic' && active && !ctx.frozen
  const saveAcDraft = async () => {
    const next = { ...(ctx.organicAc || {}) }
    const t = acDraft.trim()
    if (t === '') delete next[manualKey]
    else {
      const n = Number(t)
      if (!Number.isFinite(n) || n < 0) return
      next[manualKey] = n
    }
    if (await ctx.saveOrganicAc(next)) setAcEditOpen(false)
  }
  const displayPeriods = months ? [months.lastYear, months.prior, months.current] : []
  let rows = channelRowsByChannel ? channelRowsByChannel[channel] : null
  if (rows && channel === 'Organic') {
    // AC sale sits right under Apps; only the review period has a figure (Finance sheet), older halves show a dash.
    const acRow = { key: 'acSale', label: 'AC sale', invert: false, money: false, values: [null, null, orgAc], deltaVsPrior: null, priorForDeltaVsPrior: null, deltaVsLastYear: null, priorForDeltaVsLastYear: null }
    const at = rows.findIndex(r => r.key === 'apps')
    rows = at >= 0 ? [...rows.slice(0, at + 1), acRow, ...rows.slice(at + 1)] : [...rows, acRow]
  }
  return (
    <LiveDataFrame ctx={ctx} label="Channel Spotlight" title={title || channel} period={period} active={active}>
      {sheetRows && orgApps != null && (
        <div style={{ display: 'flex', gap: 14, margin: '4px 0 6px' }}>
          {[['Apps', orgApps], ['AC sales', orgAc], ['Apps + AC sales', orgApps + (orgAc || 0)]].map(([label, v], i) => (
            <div key={label} style={{ flex: 1, background: i === 2 ? C.navyBg : '#F8FAFC', border: '0.5px solid #E2E8F0', borderRadius: 12, padding: '10px 16px' }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>{v == null ? '-' : fmtN(v)}</div>
            </div>
          ))}
        </div>
      )}
      {rows && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: HEADLINE_GRID_COLS, columnGap: 16, borderBottom: '2px solid #0F1B33', paddingBottom: 9, marginBottom: 2 }}>
            <div />
            {displayPeriods.map((h, i) => <PeriodColumnHead key={i} spec={h} />)}
            <PeriodDeltaHead spec={months.prior} />
            <PeriodDeltaHead spec={months.lastYear} />
          </div>
          {rows.map((row, i) => (
            <div key={row.key} className={active ? styles.staggerItem : undefined} style={{
              display: 'grid', gridTemplateColumns: HEADLINE_GRID_COLS, columnGap: 16, alignItems: 'center',
              padding: channel === 'Organic' ? '5px 0' : '10px 0', borderBottom: '1px solid #F1F5F9',
              animationDelay: active ? (0.035 * i) + 's' : undefined,
            }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 6 }}>
                {row.label}
                {row.key === 'acSale' && canEditAc && (
                  <button type="button" className={styles.noPrint} title="Enter AC sale for this period"
                    onClick={() => { setAcDraft(manualAc != null ? String(manualAc) : ''); setAcEditOpen(true) }}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: BLUE, padding: 2, display: 'inline-flex' }}>
                    <EditIcon />
                  </button>
                )}
              </div>
              {row.values.map((v, ci) => (
                <div key={ci} title={exactHeadlineTitle(v, row.money)}
                  style={{ fontSize: 14.5, fontWeight: 800, color: v == null ? '#CBD5E1' : '#0F172A', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  <AnimatedNumber value={v} money={row.money} active={active} delay={0.035 * i} />
                </div>
              ))}
              <div style={{ textAlign: 'right' }}><DeltaCell delta={row.deltaVsPrior} prior={row.priorForDeltaVsPrior} money={row.money} invert={row.invert} showPrior={false} /></div>
              <div style={{ textAlign: 'right' }}><DeltaCell delta={row.deltaVsLastYear} prior={row.priorForDeltaVsLastYear} money={row.money} invert={row.invert} showPrior={false} /></div>
            </div>
          ))}
        </>
      )}
      {channel === 'Organic' && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
            QL by sub-source, month by month, {months ? months.current.label : 'this period'}
          </div>
          {ctx.organicSubSourceBreakdown == null ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#94A3B8', fontSize: 13 }}>
              <span className={styles.mrSpinner} />Loading sub-source breakdown…
            </div>
          ) : ctx.organicSubSourceBreakdown.length === 0 ? (
            <div style={{ color: '#94A3B8', fontSize: 13 }}>No sub-source activity recorded in this period.</div>
          ) : (() => {
            const rowsB = ctx.organicSubSourceBreakdown
            const mLabels = months.current.monthDates.map(d => REVIEW_MONTH_NAMES[d.getMonth()].slice(0, 3))
            const n = mLabels.length
            const cols = 'minmax(190px, 1.6fr) repeat(' + n + ', minmax(0, 1fr)) 84px'
            const totals = mLabels.map((_, i) => rowsB.reduce((s2, r) => s2 + ((r.byMonth && r.byMonth[i]) || 0), 0))
            const grand = rowsB.reduce((s2, r) => s2 + r.ql, 0)
            const head = { fontSize: 11, fontWeight: 800, color: '#64748B', textTransform: 'uppercase', textAlign: 'right', letterSpacing: '0.03em' }
            const cell = { fontSize: 13, fontWeight: 700, color: '#0F172A', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
            return (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: cols, columnGap: 8, borderBottom: '2px solid #0F1B33', paddingBottom: 6 }}>
                  <div />
                  {mLabels.map(m => <div key={m} style={head}>{m}</div>)}
                  <div style={head}>Total</div>
                </div>
                {rowsB.map((r, i) => (
                  <div key={r.name} className={active ? styles.staggerItem : undefined} style={{
                    display: 'grid', gridTemplateColumns: cols, columnGap: 8, alignItems: 'center', padding: '7px 0',
                    borderBottom: '0.5px solid #EEF2F7', animationDelay: active ? (0.04 * i) + 's' : undefined,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 3, background: BRAND_RAMP[i % 4], flexShrink: 0 }} />{r.name}
                    </div>
                    {mLabels.map((m, mi) => {
                      const v = r.byMonth ? r.byMonth[mi] : null
                      return <div key={m} style={{ ...cell, color: v ? '#0F172A' : '#CBD5E1', fontWeight: 600 }}>{v == null ? '-' : (v ? fmtN(v) : '-')}</div>
                    })}
                    <div style={{ ...cell, fontWeight: 800 }}>{fmtN(r.ql)}</div>
                  </div>
                ))}
                <div style={{ display: 'grid', gridTemplateColumns: cols, columnGap: 8, alignItems: 'center', padding: '8px 0', background: '#F8FAFC' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#334155' }}>Total</div>
                  {totals.map((t, i) => <div key={i} style={{ ...cell, fontWeight: 800 }}>{fmtN(t)}</div>)}
                  <div style={{ ...cell, fontWeight: 800, color: NAVY }}>{fmtN(grand)}</div>
                </div>
              </div>
            )
          })()}
        </div>
      )}
      {acEditOpen && (
        <div className={styles.noPrint} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 6 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '22px 24px', width: 420, boxShadow: '0 20px 50px rgba(0,0,0,0.28)' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>Enter AC sale (Organic)</div>
            <div style={{ fontSize: 12, color: '#64748B', marginBottom: 14, lineHeight: 1.5 }}>Number of AC sales from organic leads for {months.current.label}. Saved here and remembered. Leave blank to use the Finance sheet figure.</div>
            <input type="number" min="0" autoFocus value={acDraft} onChange={e => setAcDraft(e.target.value)} placeholder="0"
              style={{ width: '100%', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 10px', fontSize: 14, fontFamily: FONT, boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <Button size="sm" variant="secondary" onClick={() => setAcEditOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={saveAcDraft} disabled={ctx.organicAcSaving}>{ctx.organicAcSaving ? 'Saving…' : 'Save'}</Button>
            </div>
          </div>
        </div>
      )}
    </LiveDataFrame>
  )
}
function GoogleAdsChannelSlide({ active, period }) { return <ChannelSpotlightBody active={active} period={period} channel="Google Ads" /> }
function MetaAdsChannelSlide({ active, period }) { return <ChannelSpotlightBody active={active} period={period} channel="Meta Ads" /> }
function OrganicChannelSlide({ active, period }) { return <ChannelSpotlightBody active={active} period={period} channel="Organic" title="Where the organic leads came from" /> }

// TOF (top-of-funnel) / branding campaigns -- per explicit user confirmation
// (2026-09-10, "use exactly what I found"), this is a real naming-pattern
// rule inferred FROM the exact real campaigns that surfaced this session
// (Branding_Unipoles_DU_Nov2024, several Newspaper-TOI-*/Newspaper-NBT-*
// entries, RJ_Abhinav, ThinkSchool_July2024) -- offline/reach-oriented plays
// sitting under Organic with ~0 QLs, which is expected (brand awareness,
// not lead-gen). A fixed pattern rather than a hardcoded one-off list of
// this month's exact names, so it keeps working as new offline insertions
// run in future months. Reuses organicSubRows (already fetched for the
// Organic spotlight slide) -- no new data fetch.
const TOF_SUB_SOURCE_PATTERN = /^(branding_|newspaper-|rj_|thinkschool_)/i
// "H1 CAC" slide -- the hand-maintained Finance sheet (Overall + per-channel columns: spend, apps,
// AC sales, deposits, CAC, revenue, ROAS) shown exactly as the sheet formats it. Row groups are
// only visual (a thin divider + a label-based tint); every cell is the sheet's own text.
const CAC_GROUP_BY_LABEL = (label) => {
  const l = (label || '').toLowerCase()
  if (l.includes('spend')) return 'spend'
  if (l.includes('cac')) return 'cac'
  if (l.includes('roas')) return 'roas'
  if (l.includes('rev')) return 'rev'
  return 'volume'
}
function CacSheetSlide({ active, period }) {
  const ctx = useMarketingReviewData()
  const sheet = ctx && ctx.cacSheet
  const error = ctx && ctx.cacError
  // The sheet's last row ("ROAS AC") is left out of the slide on purpose.
  const rows = sheet && sheet.rows ? sheet.rows.filter(r => !/^roas ac/i.test(String(r[0] || '').trim())) : null
  const header = rows && rows[0]
  const body = rows ? rows.slice(1) : []
  const colW = 'minmax(190px, 1.6fr) repeat(' + Math.max(1, (header ? header.length : 10) - 1) + ', minmax(0, 1fr))'
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#fff', padding: '60px 56px 40px', boxSizing: 'border-box' }}>
      <PeriodBadge period={period} live />
      <SectionKicker label="Acquisition cost & return" title="CAC and ROAS by channel" />
      {ctx && !ctx.cacApplies ? (
        <div style={{ color: '#64748B', fontSize: 15, lineHeight: 1.6, maxWidth: 640, padding: '30px 0' }}>
          Not available for this period. This table comes from Finance's hand-maintained "B2C H1 CAC" sheet, which only covers H1 FY26-27 (Apr to Sep 2026). Hide this slide for other periods.
        </div>
      ) : !ctx || (!rows && !error) ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#64748B', fontSize: 14, fontWeight: 600, padding: '50px 0' }}>
          <span className={styles.mrSpinner} />Loading the CAC sheet…
        </div>
      ) : error ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#FFF6DA', border: '1px solid #F2E2A8', borderRadius: 12, padding: '14px 18px', marginTop: 10 }}>
          <span style={{ fontSize: 13.5, color: '#7A5C00', fontWeight: 600, flex: 1 }}>Couldn't load the CAC sheet: {error}</span>
          {active && (
            <button type="button" onClick={ctx.retryCac} className={styles.noPrint}
              style={{ border: 'none', background: NAVY, color: '#fff', fontSize: 12.5, fontWeight: 700, borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontFamily: FONT }}>
              Retry
            </button>
          )}
        </div>
      ) : (
        <div style={{ border: '0.5px solid #E2E8F0', borderRadius: 12, overflow: 'hidden', marginTop: 4 }}>
          <div style={{ display: 'grid', gridTemplateColumns: colW, background: C.navyBg, borderBottom: '1px solid #E2E8F0' }}>
            {header.map((h, ci) => (
              <div key={ci} style={{
                padding: '8px 10px', fontSize: 11.5, fontWeight: 800, color: NAVY, letterSpacing: '0.04em',
                textAlign: ci === 0 ? 'left' : 'right', textTransform: ci === 0 ? 'uppercase' : 'none',
                background: ci === 1 ? 'rgba(31,60,132,0.10)' : undefined,
              }}>{ci === 0 ? 'H1 FY26-27 (Apr to Sep 2026)' : h}</div>
            ))}
          </div>
          {body.map((r, ri) => {
            const g = CAC_GROUP_BY_LABEL(r[0])
            const prevG = ri > 0 ? CAC_GROUP_BY_LABEL(body[ri - 1][0]) : g
            const emphasis = /^(total spend|rev total|roas)/i.test((r[0] || '').trim())
            return (
              <div key={ri} className={active ? styles.staggerItem : undefined} style={{
                display: 'grid', gridTemplateColumns: colW, alignItems: 'center',
                borderTop: g !== prevG ? '1px solid #CBD5E1' : (ri === 0 ? 'none' : '0.5px solid #EEF2F7'),
                animationDelay: active ? (0.025 * ri) + 's' : undefined,
              }}>
                {r.map((c, ci) => (
                  <div key={ci} style={{
                    padding: '4.5px 10px', fontSize: 12, lineHeight: 1.25, fontVariantNumeric: 'tabular-nums',
                    textAlign: ci === 0 ? 'left' : 'right',
                    fontWeight: ci === 0 ? 700 : (ci === 1 || emphasis ? 800 : 600),
                    color: ci === 0 ? '#334155' : (c ? '#0F172A' : '#CBD5E1'),
                    background: ci === 1 ? 'rgba(31,60,132,0.05)' : undefined,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{c || (ci === 0 ? '' : '-')}</div>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// "Where the traffic came from" -- GA4 users by default channel group for the review half.
// Grouping: Organic = Organic Search + Organic Social + Organic Video; Paid = Paid Search / Social /
// Video / Other + Cross-network (GA4's label for Google's automated campaign types); Direct;
// Other = everything else. Users are summed per channel, so a person who arrived through two
// channels counts in both -- shares are right for contribution, the total is not unique visitors.
const GA_GROUP_OF = (channel) => {
  if (/^organic/i.test(channel)) return 'Organic'
  if (/^paid/i.test(channel) || channel === 'Cross-network') return 'Paid'
  if (channel === 'Direct') return 'Direct'
  return 'Other'
}
const GA_GROUPS = [
  { key: 'Organic', color: GREEN },
  { key: 'Paid', color: NAVY },
  { key: 'Direct', color: BLUE },
  { key: 'Other', color: '#94A3B8' },
]
function TrafficSourcesSlide({ active, period }) {
  const ctx = useMarketingReviewData()
  const ga = ctx && ctx.gaTraffic
  const error = ctx && ctx.gaError
  const view = useMemo(() => {
    if (!ga || !ga.half) return null
    const half = ga.half
    const total = half.totalUsers || 0
    const groups = GA_GROUPS.map(g => ({ ...g, users: 0 }))
    for (const c of half.byChannel || []) groups.find(g => g.key === GA_GROUP_OF(c.channel)).users += c.users
    const channels = (half.byChannel || []).slice(0, 7)
    const groupUsers = (r) => {
      if (!r) return null
      const g = { Organic: 0, Paid: 0, Direct: 0, Other: 0 }
      for (const c of r.byChannel || []) g[GA_GROUP_OF(c.channel)] += c.users
      return { ...g, Total: r.totalUsers || 0 }
    }
    const compare = { cur: groupUsers(half), prior: groupUsers(ga.prior), lastYear: groupUsers(ga.lastYear) }
    const months = ctx.months.current.monthDates.map((d, i) => {
      const r = ga['m' + i]
      const org = r && r.byChannel ? (r.byChannel.find(c => c.channel === 'Organic Search') || { users: 0 }).users : 0
      return { label: REVIEW_MONTH_NAMES[d.getMonth()].slice(0, 3), organic: org, total: r ? r.totalUsers : 0 }
    })
    const notes = []
    const pct = (d) => Math.abs(d).toFixed(1) + '%'
    const ups = []
    for (const k of ['Paid', 'Organic', 'Direct', 'Total']) {
      const cur = compare.cur ? compare.cur[k] : null
      const dPr = compare.prior ? reviewPctDelta(cur, compare.prior[k]) : null
      const dLy = compare.lastYear ? reviewPctDelta(cur, compare.lastYear[k]) : null
      if (typeof dPr === 'number' && dPr > 0) ups.push({ d: dPr, t: k + ' users up ' + pct(dPr) + ' vs ' + ctx.months.prior.label })
      if (typeof dLy === 'number' && dLy > 0) ups.push({ d: dLy, t: k + ' users up ' + pct(dLy) + ' vs ' + ctx.months.lastYear.label })
    }
    ups.sort((a, b) => b.d - a.d)
    for (const u of ups) { if (notes.length >= 4) break; notes.push(u.t) }
    return { total, groups, channels, months, compare, notes }
  }, [ga, ctx])
  const col = { flex: 1, minWidth: 0 }
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#fff', padding: '60px 56px 36px', boxSizing: 'border-box' }}>
      <PeriodBadge period={period} live />
      <SectionKicker label="Website traffic" title="Where the traffic came from" />
      {!ctx || (!view && !error) ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#64748B', fontSize: 14, fontWeight: 600, padding: '50px 0' }}>
          <span className={styles.mrSpinner} />Loading website traffic from Google Analytics…
        </div>
      ) : error ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#FFF6DA', border: '1px solid #F2E2A8', borderRadius: 12, padding: '14px 18px', marginTop: 10 }}>
          <span style={{ fontSize: 13.5, color: '#7A5C00', fontWeight: 600, flex: 1 }}>Couldn't load website traffic: {error}</span>
          {active && (
            <button type="button" onClick={ctx.retryGa} className={styles.noPrint}
              style={{ border: 'none', background: NAVY, color: '#fff', fontSize: 12.5, fontWeight: 700, borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontFamily: FONT }}>Retry</button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 40, marginTop: 6 }}>
          <div style={col}>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: '#94A3B8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
              Total website users · <AnimatedNumber value={view.total} active={active} duration={900} />
            </div>
            <div style={{ display: 'flex', height: 22, borderRadius: 11, overflow: 'hidden', background: '#F1F5F9', marginBottom: 14 }}>
              {view.groups.map((g, i) => (
                <div key={g.key} title={g.key} style={{
                  width: active ? (view.total ? (g.users / view.total) * 100 : 0) + '%' : '0%', background: g.color,
                  transition: `width .9s cubic-bezier(.22,1,.36,1) ${0.08 * i}s`,
                }} />
              ))}
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: '#94A3B8', letterSpacing: '0.06em', textTransform: 'uppercase', margin: '4px 0 8px' }}>Compared with the previous half and last year</div>
            {(() => {
              const cmp = view.compare
              const gridCols = '78px repeat(3, 1fr) 54px 64px 64px'
              const keys = ['Organic', 'Paid', 'Direct', 'Other', 'Total']
              const head = { fontSize: 10, fontWeight: 800, color: '#64748B', textTransform: 'uppercase', textAlign: 'right', letterSpacing: '0.02em' }
              return (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: gridCols, columnGap: 8, borderBottom: '2px solid #0F1B33', paddingBottom: 6 }}>
                    <div />
                    <div style={head}>{ctx.months.lastYear.label}</div>
                    <div style={head}>{ctx.months.prior.label}</div>
                    <div style={head}>{ctx.months.current.label}</div>
                    <div style={head}>Share</div>
                    <div style={head}>vs prev</div>
                    <div style={head}>vs LY</div>
                  </div>
                  {keys.map((k, i) => {
                    const grp = GA_GROUPS.find(g => g.key === k)
                    const cur = cmp.cur ? cmp.cur[k] : null
                    const pr = cmp.prior ? cmp.prior[k] : null
                    const ly = cmp.lastYear ? cmp.lastYear[k] : null
                    const isTotal = k === 'Total'
                    const num = { fontSize: 12.5, fontWeight: isTotal ? 800 : 700, color: '#0F172A', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
                    return (
                      <div key={k} className={active ? styles.staggerItem : undefined} style={{
                        display: 'grid', gridTemplateColumns: gridCols, columnGap: 8, alignItems: 'center', padding: '6px 0',
                        borderBottom: '0.5px solid #EEF2F7', background: isTotal ? '#F8FAFC' : undefined, animationDelay: active ? (0.05 * i) + 's' : undefined,
                      }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#334155', display: 'flex', alignItems: 'center', gap: 7 }}>
                          {grp && <span style={{ width: 9, height: 9, borderRadius: 3, background: grp.color, flexShrink: 0 }} />}{k}
                        </div>
                        <div style={num}>{ly == null ? '-' : fmtN(ly)}</div>
                        <div style={num}>{pr == null ? '-' : fmtN(pr)}</div>
                        <div style={num}>{cur == null ? '-' : <AnimatedNumber value={cur} active={active} delay={0.05 * i} duration={800} />}</div>
                        <div style={{ ...num, color: '#64748B' }}>{view.total && cur != null ? ((cur / view.total) * 100).toFixed(1) + '%' : '-'}</div>
                        <div style={{ textAlign: 'right' }}><DeltaCell delta={reviewPctDelta(cur, pr)} prior={pr} money={false} invert={false} showPrior={false} /></div>
                        <div style={{ textAlign: 'right' }}><DeltaCell delta={reviewPctDelta(cur, ly)} prior={ly} money={false} invert={false} showPrior={false} /></div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
            {view.notes.length > 0 && (
              <div style={{ marginTop: 20, background: C.greenBg, border: '0.5px solid #CDE9D7', borderRadius: 12, padding: '12px 16px' }}>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: GREEN, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>What stands out</div>
                {view.notes.map((n, i) => (
                  <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13, fontWeight: 700, color: '#0F172A', lineHeight: 1.4, marginTop: i ? 5 : 0 }}>
                    <span style={{ color: GREEN, fontWeight: 800 }}>{'✓'}</span><span>{n}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={col}>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: '#94A3B8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>
              Organic Search users by month
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: 260, borderBottom: '1px solid #E2E8F0', paddingBottom: 0 }}>
              {view.months.map((m, i) => {
                const max = Math.max(1, ...view.months.map(x => x.organic))
                const h = active ? Math.max(3, (m.organic / max) * 200) : 0
                const share = m.total ? (m.organic / m.total) * 100 : 0
                return (
                  <div key={m.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#0F172A', fontVariantNumeric: 'tabular-nums', marginBottom: 2 }}>{fmtN(m.organic)}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: GREEN, marginBottom: 6 }}>{share.toFixed(0)}% of site</div>
                    <div style={{ width: '100%', height: h, background: `linear-gradient(180deg, ${GREEN}, ${GREEN}CC)`, borderRadius: '6px 6px 0 0', transition: `height .9s cubic-bezier(.22,1,.36,1) ${0.08 * i}s` }} />
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 6 }}>
              {view.months.map(m => <div key={m.label} style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#64748B' }}>{m.label}</div>)}
            </div>
            <div style={{ fontSize: 10.5, color: '#94A3B8', lineHeight: 1.5, marginTop: 12 }}>
              Source: Google Analytics. Users are counted per channel, so a visitor who arrives through two channels appears in both; shares show contribution, the total is not unique visitors. Cross-network is Google's automated campaign traffic and is counted as paid.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TofCampaignsSlide({ active, period }) {
  const ctx = useMarketingReviewData()
  const tof = useMemo(() => {
    if (!ctx || !ctx.organicSubRows) return null
    const bySub = new Map()
    for (const r of ctx.organicSubRows) {
      const sub = r.Sub_Source || ''
      const isBrandingRow = String(r.Source || '').trim().toLowerCase() === 'branding'
      if (!isBrandingRow && !TOF_SUB_SOURCE_PATTERN.test(sub)) continue
      const e = bySub.get(sub) || { name: sub, leads: 0, ql: 0 }
      e.leads += reviewNum(r['Total Leads Generated'])
      e.ql += reviewNum(r['Futwork Human QL']) + reviewNum(r['Futwork AI QL']) + reviewNum(r['Superbot AI QL'])
      bySub.set(sub, e)
    }
    // Branding-source rows with no leads (e.g. a YouTube awareness buy, which has spend but no lead
    // capture) would show as an empty row, so only entries with real activity are kept.
    return [...bySub.values()].filter(e => e.leads > 0 || e.ql > 0).sort((a, b) => b.leads - a.leads)
  }, [ctx])
  if (!ctx) return null
  const { months } = ctx
  return (
    <LiveDataFrame ctx={ctx} label="Top-of-Funnel & Branding" title="Awareness & offline campaigns" period={period} active={active}>
      <div style={{ fontSize: 12.5, color: '#64748B', lineHeight: 1.6, marginBottom: 18, maxWidth: 560 }}>
        Reach-oriented campaigns (print, radio, out-of-home), near-zero QLs is expected
        here; these are measured on awareness, not direct lead conversion.
      </div>
      {tof == null ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#64748B', fontSize: 14 }}>
          <span className={styles.mrSpinner} />Loading campaign activity…
        </div>
      ) : tof.length === 0 ? (
        <div style={{ color: '#94A3B8', fontSize: 14 }}>No branding/offline campaign activity recorded for {months ? months.current.label : 'this period'}.</div>
      ) : (
        <div>
          {tof.map((t, i) => {
            const max = Math.max(1, ...tof.map(x => x.leads))
            const pct = active ? Math.max(3, Math.min(100, (t.leads / max) * 100)) : 0
            return (
              <div key={t.name} className={active ? styles.staggerItem : undefined}
                style={{ marginBottom: 16, animationDelay: active ? (0.06 * i) + 's' : undefined }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: '#334155' }}>{t.name}</span>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
                    <span style={{ fontSize: 11.5, color: '#94A3B8', fontWeight: 700 }}>{fmtN(t.ql)} QL</span>
                    <span style={{ fontSize: 14.5, fontWeight: 800, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                      <AnimatedNumber value={t.leads} active={active} delay={0.06 * i} duration={800} /> leads
                    </span>
                  </span>
                </div>
                <div style={{ height: 12, borderRadius: 6, background: '#F1F5F9', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 6, width: pct + '%', transition: `width .8s cubic-bezier(.22,1,.36,1) ${0.06 * i}s`,
                    background: `linear-gradient(90deg, ${BRAND_RAMP[i % 4]}, ${BRAND_RAMP[i % 4]}CC)`,
                  }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </LiveDataFrame>
  )
}

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
      {detail ? <div style={{ fontSize: 13.5, color: '#64748B', lineHeight: 1.6 }}>{detail}</div> : null}
    </div>
  )
}
// Real, number-driven "what worked / what needs attention" -- no hardcoded
// month-specific copy, so this stays correct automatically as the deck's
// underlying headline/channel data rolls forward to a new month. Two kinds
// of signal, both derived purely from figures already fetched for slides 3-5
// (no new data source):
//   1. Headline-metric deltas (Spend/Leads/QL/Apps/CPL/CPQL/CPA) crossing a
//      real-magnitude threshold, vs prior month AND vs the same month last
//      year -- using each metric's own `invert` convention (a cost metric
//      going down is good; a volume metric going up is good) so "good" vs
//      "bad" is never guessed, just read off the same rule DeltaCell uses.
//   2. Channel-mix signals: the single largest QL contributor (a win), and
//      any named channel with zero measurable QL this month (a risk) --
//      exactly the kind of finding that surfaced Organic's zero contribution
//      earlier this same review cycle.
const INSIGHT_THRESHOLD_PCT = 8

function directionIsGood(row, delta) {
  if (delta == null || delta === 'new') return delta === 'new' ? true : null
  const up = delta >= 0
  return row.invert ? !up : up
}

function buildInsights(headlineRows, byChannelByMonth, months) {
  const candidates = []
  if (headlineRows) {
    const comparisons = [
      { key: 'deltaVsPrior', label: `vs ${months.prior.label}` },
      { key: 'deltaVsLastYear', label: `vs ${months.lastYear.label}` },
    ]
    for (const row of headlineRows) {
      if (row.key === 'acSales' || row.key === 'cps') continue // manual-entry-dependent, often incomplete
      for (const cmp of comparisons) {
        const delta = row[cmp.key]
        if (delta == null || delta === 'new') continue
        const abs = Math.abs(delta)
        if (abs < INSIGHT_THRESHOLD_PCT) continue
        const good = directionIsGood(row, delta)
        const arrow = delta >= 0 ? '▲' : '▼'
        const curVal = row.money ? fmtINRShort(row.values[2]) : fmtN(row.values[2])
        candidates.push({
          good, magnitude: abs,
          title: `${row.label} ${arrow} ${abs.toFixed(1)}% ${cmp.label}`,
          detail: `${row.label} landed at ${curVal} for ${months.current.label} -- ${good ? 'a genuine improvement' : 'worth digging into'} ${cmp.label}.`,
        })
      }
    }
  }
  candidates.sort((a, b) => b.magnitude - a.magnitude)
  const wins = candidates.filter(c => c.good === true).slice(0, 2)
  const risks = candidates.filter(c => c.good === false).slice(0, 2)

  const cur = byChannelByMonth ? byChannelByMonth.current : null
  if (cur) {
    const chRows = REVIEW_CHANNELS.map(name => ({ name, ...(cur.get(name) || { ql: 0 }) }))
    const totalQl = chRows.reduce((s, r) => s + (r.ql || 0), 0)
    const top = [...chRows].sort((a, b) => (b.ql || 0) - (a.ql || 0))[0]
    if (top && top.ql > 0 && totalQl > 0) {
      const share = (top.ql / totalQl) * 100
      wins.unshift({
        magnitude: Infinity,
        title: `${top.name} is the top QL driver`,
        detail: `${top.name} produced ${fmtN(top.ql)} QLs in ${months.current.label} -- ${share.toFixed(0)}% of the total, the single largest source.`,
      })
    }
    const zeroChannels = chRows.filter(r => r.name !== 'Other' && (r.ql || 0) === 0).map(r => r.name)
    if (zeroChannels.length) {
      risks.unshift({
        magnitude: Infinity,
        title: `${zeroChannels.join(' & ')} at zero QLs`,
        detail: `${zeroChannels.join(' and ')} produced no measurable qualified leads in ${months.current.label} -- confirm tracking is correct, or reconsider spend/effort there.`,
      })
    }
  }

  return { wins: wins.slice(0, 3), risks: risks.slice(0, 3) }
}

function WinsSlide({ active, period }) {
  const ctx = useMarketingReviewData()
  const wins = useMemo(() => {
    if (!ctx || !ctx.headlineRows) return null
    return buildInsights(ctx.headlineRows, ctx.byChannelByMonth, ctx.months).wins
  }, [ctx])
  if (!ctx) return null
  const sheetWins = ctx.reviewTabs && ctx.reviewTabs.whatWorked && ctx.reviewTabs.whatWorked.items
  if (sheetWins && sheetWins.length) {
    return (
      <LiveDataFrame ctx={ctx} label="Wins & Highlights" title="What worked" period={period} active={active}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
          {sheetWins.map((w, i) => (
            <div key={w.n + w.title} className={active ? styles.staggerItem : undefined} style={{
              display: 'flex', gap: 12, background: '#fff', border: '0.5px solid #E2E8F0', borderRadius: 12, padding: '12px 14px',
              boxShadow: '0 1px 3px rgba(15,23,42,0.04)', animationDelay: active ? (0.06 * i) + 's' : undefined,
            }}>
              <div style={{ width: 26, height: 26, borderRadius: 8, background: GREEN, color: '#fff', fontSize: 12, fontWeight: 800, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{w.n || i + 1}</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', lineHeight: 1.35 }}>{noDash(w.title)}</div>
              </div>
            </div>
          ))}
        </div>
      </LiveDataFrame>
    )
  }
  return (
    <LiveDataFrame ctx={ctx} label="Wins & Highlights" title="What worked" period={period} active={active}>
      <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
        {wins && wins.length > 0
          ? wins.map((w, i) => <CalloutCard key={w.title} {...w} detail={null} kind="win" active={active} delay={0.1 * i} />)
          : <div style={{ color: '#94A3B8', fontSize: 14, padding: '40px 0' }}>No metric crossed the win threshold this period.</div>}
      </div>
    </LiveDataFrame>
  )
}

function RisksSlide({ active, period }) {
  const ctx = useMarketingReviewData()
  const risks = useMemo(() => {
    if (!ctx || !ctx.headlineRows) return null
    return buildInsights(ctx.headlineRows, ctx.byChannelByMonth, ctx.months).risks
  }, [ctx])
  if (!ctx) return null
  return (
    <LiveDataFrame ctx={ctx} label="Risks & Watch-outs" title="What needs attention" period={period} active={active}>
      <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
        {risks && risks.length > 0
          ? risks.map((r, i) => <CalloutCard key={r.title} {...r} kind="risk" active={active} delay={0.1 * i} />)
          : <div style={{ color: '#94A3B8', fontSize: 14, padding: '40px 0' }}>Nothing crossed the risk threshold in this period.</div>}
      </div>
    </LiveDataFrame>
  )
}

// Two pointers added in the deck itself (2026-10-10): a ChatGPT pilot right after the TikTok pilot, and
// parallel calling as the last pointer. The other pointers come from the sheet tab.
function withNextExtras(items) {
  const list = items.slice()
  const chat = { n: '', title: 'ChatGPT pilot', detail: 'We are also running a ChatGPT pilot alongside the TikTok pilot.' }
  const calling = { n: '', title: 'Parallel calling enabled', detail: 'We have enabled parallel calling, which will help us reduce the number of calls getting missed by coaches.' }
  list.splice(Math.min(1, list.length), 0, chat)
  list.push(calling)
  return list
}
const PRIORITIES = [
  'Double down on the channel/corridor that scaled cleanly this period',
  'Fix or pause whatever is over the CPQL benchmark',
  'Address the weakest stage-to-stage conversion rate in the funnel',
  'One experiment to run before the next review',
]
function NextStepsSlide({ active, period }) {
  const ctx = useMarketingReviewData()
  const unit = ctx ? ctx.months.current.unit : 'period'
  const sheetNext = ctx && ctx.reviewTabs && ctx.reviewTabs.nextPriorities && ctx.reviewTabs.nextPriorities.items
  if (sheetNext && sheetNext.length) {
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%', background: '#fff', padding: '56px 64px', boxSizing: 'border-box' }}>
        <PeriodBadge period={period} live />
        <SectionKicker label={"Next " + unit + "'s priorities"} title="What we're doing next" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 2 }}>
          {withNextExtras(sheetNext).map((p, i) => (
            <div key={p.n + p.title} className={active ? styles.staggerItem : undefined}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 14, animationDelay: active ? (0.08 * i) + 's' : undefined }}>
              <div style={{
                width: 30, height: 30, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 800, color: NAVY, background: C.navyBg, border: `1.5px solid ${NAVY}33`,
              }}>{i + 1}</div>
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 800, color: '#1E2A44', marginBottom: 1 }}>{noDash(p.title)}</div>
                <div style={{ fontSize: 11, color: '#64748B', lineHeight: 1.35 }}>{noDash(p.detail)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#fff', padding: '68px 72px', boxSizing: 'border-box' }}>
      <PeriodBadge period={period} />
      <SectionKicker label={"Next " + unit + "'s priorities"} title="What we're doing next" />
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

// Inbound call timing, September 2026 (Sep 1 to 26, Monday to Saturday). Fixed figures from the call-timing
// analysis shared as an artifact (BigQuery inbound call log, timestamps shifted from UTC to IST); not live data.
// Working hours are 10:30 AM to 7:30 PM IST. Sundays are left out of every number here except the weekend note.
const CALLS_HOURLY = [3319, 2113, 1005, 494, 245, 185, 180, 98, 80, 51, 55, 162, 337, 565, 777, 1157, 3503, 4590, 4406, 3870, 2868, 3894, 3956, 4111]
const CALL_TILES = [
  ['Inbound calls', '42,021', 'Sep 1 to 26, Mon to Sat'],
  ['Outside working hours', '57.6%', '24,221 of the calls'],
  ['Calls missed', '60.1%', '25,241 not picked up'],
  ['Busiest hour', '5 to 6 PM', '4,590 calls in that hour'],
]
const CALL_POINTS = [
  'More than half of inbound calls (57.6%) arrive outside 10:30 AM to 7:30 PM IST, even though that window is shorter: working hours still run hotter per hour (about 1,980 calls an hour against about 1,610).',
  'The answer rate is the same inside and outside working hours (40.6% vs 39.4%), so the problem is not only the hour of the day: about 6 in 10 calls go unanswered at any time.',
  '14,668 calls were missed outside working hours, and 10,573 were missed inside them. The inside number is the one to chase, since someone is meant to be on shift.',
  'Sunday is the weakest day: 29.1% answered, against 41.9% on Saturday and 39.6% on weekdays.',
  'Done: parallel calling is now enabled, so more calls should be picked up and fewer missed. It is early, so we will check once the numbers mature to see whether it worked.',
  'Next: keep a roster so some coaches are available after working hours to pick up inbound calls, or put AI on the line to answer and qualify the leads. Inbound is a high-intent channel, so this is worth doing.',
]
function InboundCallsSlide({ active, period }) {
  const max = Math.max(...CALLS_HOURLY)
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#fff', padding: '52px 64px 30px', boxSizing: 'border-box' }}>
      <PeriodBadge period={period} live />
      <div style={{ marginBottom: -8 }}><SectionKicker label="Inbound calls" title="When students call, and how many we miss" /></div>
      <div style={{ fontSize: 13.5, color: '#475569', fontWeight: 600, lineHeight: 1.5, maxWidth: 980, marginBottom: 12 }}>
        Based on September 2026 (1 to 26 Sep). Four in ten inbound calls are answered, and more than half come in outside shift hours, so the missed calls are not just an evening problem.
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
        {CALL_TILES.map(([label, v, sub], i) => (
          <div key={label} className={active ? styles.staggerItem : undefined} style={{ flex: 1, background: i === 2 ? C.navyBg : '#F8FAFC', border: '0.5px solid #E2E8F0', borderRadius: 12, padding: '10px 14px', animationDelay: active ? (0.06 * i) + 's' : undefined }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
            <div style={{ fontSize: 11.5, color: '#64748B', fontWeight: 600 }}>{sub}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 28 }}>
        <div style={{ flex: '0 0 560px', minWidth: 0 }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: '#94A3B8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Calls by hour of day (IST)</div>
          <div style={{ position: 'relative', height: 178 }}>
            <div style={{ position: 'absolute', left: (10.5 / 24 * 100) + '%', width: (9 / 24 * 100) + '%', top: 0, bottom: 18, background: C.navyBg, borderRadius: 4 }} />
            <div style={{ position: 'relative', height: '100%', display: 'flex', alignItems: 'flex-end', gap: 3, paddingBottom: 18 }}>
              {CALLS_HOURLY.map((n, h) => {
                const working = h >= 10.5 && h < 19.5
                return (
                  <div key={h} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', position: 'relative' }}>
                    <div title={n.toLocaleString('en-IN') + ' calls'} style={{ width: '100%', height: active ? Math.max(2, (n / max) * 150) : 0, background: working ? NAVY : CYAN, borderRadius: '3px 3px 0 0', transition: `height .8s cubic-bezier(.22,1,.36,1) ${0.02 * h}s` }} />
                    <div style={{ position: 'absolute', bottom: -16, left: 0, right: 0, textAlign: 'center', fontSize: 9.5, color: '#94A3B8', fontWeight: 600 }}>{h % 3 === 0 ? (h === 0 ? '12a' : h < 12 ? h + 'a' : h === 12 ? '12p' : (h - 12) + 'p') : ''}</div>
                  </div>
                )
              })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 4, fontSize: 11.5, color: '#64748B', fontWeight: 600 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: NAVY }} />Working hours, 10:30 AM to 7:30 PM</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: CYAN }} />Outside working hours</span>
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: '#94A3B8', letterSpacing: '0.06em', textTransform: 'uppercase', margin: '14px 0 6px' }}>Answered vs missed</div>
          {[['Working hours', 40.6], ['Outside working hours', 39.4]].map(([label, ans], i) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ width: 150, fontSize: 12.5, fontWeight: 700, color: '#334155' }}>{label}</span>
              <div style={{ flex: 1, height: 18, borderRadius: 5, overflow: 'hidden', display: 'flex', background: '#F1F5F9' }}>
                <div style={{ width: active ? ans + '%' : '0%', background: GREEN, transition: `width .8s cubic-bezier(.22,1,.36,1) ${0.1 * i}s`, color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', paddingLeft: 7 }}>{ans}%</div>
                <div style={{ flex: 1, background: NAVY, color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 7 }}>{(100 - ans).toFixed(1)}%</div>
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 16, fontSize: 11.5, color: '#64748B', fontWeight: 600 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: GREEN }} />Answered</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: NAVY }} />Missed</span>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: '#94A3B8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>What this means</div>
          {CALL_POINTS.map((t, i) => (
            <div key={i} className={active ? styles.staggerItem : undefined} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, fontWeight: 600, color: '#1E2A44', lineHeight: 1.5, marginBottom: 9, animationDelay: active ? (0.1 + 0.07 * i) + 's' : undefined }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: GREEN, marginTop: 7, flexShrink: 0 }} />{t}
            </div>
          ))}
        </div>
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

// The slide registry (id -> definition). The ORDER of the deck is not fixed here any more: each review
// keeps its own order and hidden list (see DEFAULT_SLIDE_ORDER and sanitizeOrder). `agenda` is the line
// the Agenda slide shows for that slide (a slide without one is not listed there).
const SLIDES = [
  { id: 'cover', section: 'Cover', title: 'Marketing Review', Body: CoverSlide, dark: true },
  { id: 'agenda', section: 'Agenda', title: "What we'll cover", Body: AgendaSlide },
  { id: 'summary', section: 'Executive Summary', title: 'The headline numbers', Body: HeadlineSlide, agenda: 'Executive summary, the headline numbers' },
  { id: 'channels', section: 'Channel Performance', title: 'Where the QLs came from', Body: ChannelPerformanceSlide, agenda: 'Channel performance, where the leads came from' },
  { id: 'funnel', section: 'Funnel & Conversion', title: 'How leads moved through the pipeline', Body: FunnelSlide, agenda: 'Funnel & conversion, how leads moved through the pipeline' },
  { id: 'cac-sheet', section: 'Acquisition Cost & Return', title: 'CAC and ROAS by channel', Body: CacSheetSlide, agenda: 'Acquisition cost & return, CAC and ROAS by channel' },
  { id: 'traffic', section: 'Website Traffic', title: 'Where the traffic came from', Body: TrafficSourcesSlide, agenda: 'Website traffic, where visitors came from, and organic’s share' },
  { id: 'channel-google', section: 'Channel Spotlight', title: 'Google Ads', Body: GoogleAdsChannelSlide },
  { id: 'channel-meta', section: 'Channel Spotlight', title: 'Meta Ads', Body: MetaAdsChannelSlide },
  { id: 'channel-organic', section: 'Channel Spotlight', title: 'Organic', Body: OrganicChannelSlide },
  { id: 'tof', section: 'Top-of-Funnel & Branding', title: 'Awareness & offline campaigns', Body: TofCampaignsSlide },
  { id: 'wins', section: 'Wins & Highlights', title: 'What worked', Body: WinsSlide, agenda: 'Wins & highlights' },
  { id: 'risks', section: 'Risks & Watch-outs', title: 'What needs attention', Body: RisksSlide, agenda: 'Risks & watch-outs' },
  { id: 'inbound-calls', section: 'Inbound Calls', title: 'When students call, and how many we miss', Body: InboundCallsSlide, agenda: 'Inbound calls, when students call and how many we miss' },
  { id: 'next', section: 'Next Priorities', title: "What we're doing next", Body: NextStepsSlide, agenda: unit => 'Next ' + unit + '’s priorities' },
  { id: 'closing', section: 'Closing', title: 'Questions?', Body: ClosingSlide, dark: true },
]
const SLIDES_BY_ID = Object.fromEntries(SLIDES.map(sl => [sl.id, sl]))
const DEFAULT_SLIDE_ORDER = SLIDES.map(sl => sl.id)
// A saved order can be missing slides added later or list ones that no longer exist: keep the saved
// order, drop unknown ids, and put any new slide just before the closing slide.
function sanitizeOrder(order) {
  const seen = new Set()
  const out = []
  for (const id of Array.isArray(order) ? order : []) if (SLIDES_BY_ID[id] && !seen.has(id)) { seen.add(id); out.push(id) }
  const missing = DEFAULT_SLIDE_ORDER.filter(id => !seen.has(id))
  if (!missing.length) return out
  const closeAt = out.indexOf('closing')
  if (closeAt === -1) return out.concat(missing)
  return out.slice(0, closeAt).concat(missing, out.slice(closeAt))
}
// Moves dragId to where targetId is: dragging forward lands AFTER the target, backward lands BEFORE it.
function moveInOrder(order, dragId, targetId) {
  if (!dragId || dragId === targetId) return order
  const from = order.indexOf(dragId), to = order.indexOf(targetId)
  if (from < 0 || to < 0) return order
  const out = order.filter(id => id !== dragId)
  const t = out.indexOf(targetId)
  out.splice(from < to ? t + 1 : t, 0, dragId)
  return out
}
// Slides that make no sense for a period start hidden (the CAC sheet only covers one period).
// Slides that start hidden in every new review (Google Ads, Meta Ads and the awareness slide); any of them can be
// shown again from the "Hidden slides" strip under the gallery. The CAC slide only has data for H1 FY26-27.
const ALWAYS_HIDDEN_BY_DEFAULT = ['channel-google', 'channel-meta', 'tof']
function defaultHiddenFor(spec) { return specKey(spec) === CAC_SHEET_SPEC_KEY ? ALWAYS_HIDDEN_BY_DEFAULT.slice() : ['cac-sheet'].concat(ALWAYS_HIDDEN_BY_DEFAULT) }

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

function DeckView({ slides, index, setIndex, period, onExit, onPrint, onReorder }) {
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
  const dirRef = useRef('next')
  const [chromeVisible, setChromeVisible] = useState(true)
  const hideTimerRef = useRef(null)
  const [blackout, setBlackout] = useState(false)
  const [laserOn, setLaserOn] = useState(false)
  const [laserPos, setLaserPos] = useState(null)
  const [writeMode, setWriteMode] = useState(false)
  const [inkStrokes, setInkStrokes] = useState([])
  const [liveInkPath, setLiveInkPath] = useState(null)
  const inkDrawRef = useRef(null)
  const inkIdRef = useRef(0)
  const digitBufferRef = useRef('')
  const digitTimerRef = useRef(null)
  const [thumbDragId, setThumbDragId] = useState(null)
  const [thumbOverId, setThumbOverId] = useState(null)

  const handleInkDown = useCallback((e) => {
    if (!writeMode) return
    inkDrawRef.current = [[e.clientX, e.clientY]]
  }, [writeMode])
  const handleInkMove = useCallback((e) => {
    if (!writeMode || !inkDrawRef.current) return
    inkDrawRef.current.push([e.clientX, e.clientY])
    setLiveInkPath('M ' + inkDrawRef.current.map(p => p[0] + ',' + p[1]).join(' L '))
  }, [writeMode])
  const handleInkUp = useCallback(() => {
    if (!writeMode || !inkDrawRef.current) return
    const pts = inkDrawRef.current
    inkDrawRef.current = null
    setLiveInkPath(null)
    if (pts.length < 2) return
    const id = ++inkIdRef.current
    const d = 'M ' + pts.map(p => p[0] + ',' + p[1]).join(' L ')
    setInkStrokes(s => [...s, { id, d }])
    setTimeout(() => setInkStrokes(s => s.filter(x => x.id !== id)), 2600)
  }, [writeMode])

  // Exports the ACTUAL current slide node (full 1280x720, unaffected by the
  // presentational scale-down applied to its parent below) rather than
  // whatever is on screen at the moment -- so the saved image is always
  // full quality regardless of window size.
  const handleExportImage = useCallback(() => {
    const node = currentCanvasRef.current
    if (!node) return
    const slideName = slides[index].title
    toPng(node, { pixelRatio: 2, cacheBust: true }).then(dataUrl => {
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `Marketing-Review-${period.replace(/\s+/g, '-')}-Slide-${index + 1}-${slideName.replace(/[^a-z0-9]+/gi, '-')}.png`
      a.click()
    }).catch(() => {})
  }, [index, period, slides])

  const scale = size.w && size.h ? Math.min(size.w / SLIDE_W, size.h / SLIDE_H) * 0.94 : 0.5

  const goTo = useCallback((i) => {
    const clamped = Math.max(0, Math.min(slides.length - 1, i))
    dirRef.current = clamped >= index ? 'next' : 'prev'
    setIndex(clamped)
  }, [setIndex, index, slides.length])
  const next = useCallback(() => goTo(index + 1), [goTo, index])
  const prev = useCallback(() => goTo(index - 1), [goTo, index])

  const commitDigitBuffer = useCallback(() => {
    const n = Number(digitBufferRef.current)
    digitBufferRef.current = ''
    if (digitTimerRef.current) { clearTimeout(digitTimerRef.current); digitTimerRef.current = null }
    if (Number.isFinite(n) && n >= 1 && n <= slides.length) goTo(n - 1)
  }, [goTo, slides.length])

  useEffect(() => () => { if (digitTimerRef.current) clearTimeout(digitTimerRef.current) }, [])

  // Fullscreen chrome auto-hide -- progress rail / label row / bottom bar fade
  // out after 3s of no mouse/key activity, matching the auto-hide convention
  // every video/presentation surface uses (YouTube, Keynote Play). Only while
  // genuinely fullscreen (a non-fullscreen viewer still needs the visible Exit
  // affordance) and never while the presenter panel is deliberately open.
  useEffect(() => {
    if (!fullscreen || presenterOpen) {
      setChromeVisible(true)
      if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null }
      return
    }
    const resetTimer = () => {
      setChromeVisible(true)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      hideTimerRef.current = setTimeout(() => setChromeVisible(false), 3000)
    }
    resetTimer()
    document.addEventListener('mousemove', resetTimer)
    document.addEventListener('keydown', resetTimer)
    return () => {
      document.removeEventListener('mousemove', resetTimer)
      document.removeEventListener('keydown', resetTimer)
      if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null }
    }
  }, [fullscreen, presenterOpen])

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
      else if (e.key === 'End') { e.preventDefault(); goTo(slides.length - 1) }
      else if (e.key === 'f' || e.key === 'F') {
        if (document.fullscreenElement) document.exitFullscreen()
        else deckRootRef.current && deckRootRef.current.requestFullscreen && deckRootRef.current.requestFullscreen()
      } else if (e.key === 'p' || e.key === 'P') { setPresenterOpen(v => !v) }
      else if (e.key === 'b' || e.key === 'B') { setBlackout(v => !v) }
      else if (e.key === 'l' || e.key === 'L') { setLaserOn(v => !v) }
      else if (e.key === 'w' || e.key === 'W') { setWriteMode(v => !v) }
      else if (/^[0-9]$/.test(e.key)) {
        // Multi-digit go-to-slide: digits accumulate (capped at 2, since the
        // deck never exceeds 99 slides) and auto-commit after a short pause,
        // or immediately on Enter -- replaces the old single-digit-only jump,
        // which couldn't reach slides 10+ once the deck grew past 9.
        e.preventDefault()
        digitBufferRef.current = (digitBufferRef.current + e.key).slice(-2)
        if (digitTimerRef.current) clearTimeout(digitTimerRef.current)
        digitTimerRef.current = setTimeout(commitDigitBuffer, 900)
      } else if (e.key === 'Enter' && digitBufferRef.current) { e.preventDefault(); commitDigitBuffer() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [next, prev, goTo, onExit, commitDigitBuffer])

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

  const pct = ((index + 1) / slides.length) * 100
  const slide = slides[index]

  const hideCursor = laserOn || (fullscreen && !chromeVisible)
  const cursorClass = writeMode ? styles.mrCursorCrosshair : (hideCursor ? styles.mrCursorNone : undefined)
  const chromeClass = fullscreen && !chromeVisible ? styles.mrChromeHidden : styles.mrChromeVisible
  // True once Fullscreen is genuinely engaged AND its chrome has auto-hidden
  // -- the moment the stage should reclaim the screen space that chrome was
  // reserving (see stageWrapRef below).
  const fsWide = fullscreen && !chromeVisible && !presenterOpen

  return (
    <div ref={deckRootRef} role="dialog" aria-modal="true" aria-label={`Presenting: ${slide.title}`}
      className={cursorClass}
      onMouseMove={(laserOn || writeMode) ? (e => { if (laserOn) setLaserPos({ x: e.clientX, y: e.clientY }); handleInkMove(e) }) : undefined}
      onMouseDown={writeMode ? handleInkDown : undefined}
      onMouseUp={writeMode ? handleInkUp : undefined}
      onMouseLeave={writeMode ? handleInkUp : undefined}
      style={{ position: 'fixed', inset: 0, zIndex: 9995, fontFamily: FONT, background: '#0B1330' }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(120% 90% at 50% 8%, rgba(28,159,212,0.14), transparent 55%), linear-gradient(180deg, rgba(6,10,22,0.94) 0%, rgba(8,12,26,0.98) 100%)',
      }} />
      {laserOn && laserPos && <div className={styles.mrLaserDot} style={{ left: laserPos.x, top: laserPos.y }} />}
      {(writeMode || inkStrokes.length > 0) && (
        <svg style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 9997, pointerEvents: 'none' }}>
          {inkStrokes.map(s => <path key={s.id} d={s.d} className={styles.mrInkStroke} />)}
          {liveInkPath && <path d={liveInkPath} className={styles.mrInkStroke} style={{ animation: 'none', opacity: 1 }} />}
        </svg>
      )}
      {blackout && (
        <div className={styles.mrBlackout} onClick={() => setBlackout(false)}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Press B or click to resume</span>
        </div>
      )}
      {/* progress rail */}
      <div className={chromeClass} style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 3, background: 'rgba(255,255,255,0.08)', zIndex: 20 }}>
        <div style={{ height: '100%', width: pct + '%', transition: 'width .3s cubic-bezier(.22,1,.36,1)', background: `linear-gradient(90deg, ${NAVY}, ${BLUE}, ${CYAN})`, animation: 'mrBarGlow 2.2s ease-in-out infinite' }} />
      </div>
      {/* label + controls row */}
      <div className={chromeClass} style={{ position: 'fixed', top: 20, left: 32, right: 32, zIndex: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ maxWidth: '50vw' }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 3 }}>
            {slide.section} &middot; slide {index + 1} of {slides.length}
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
          &larr; &rarr; navigate &middot; digits+Enter jump &middot; Home/End &middot; F fullscreen &middot; P presenter &middot; B blackout &middot; L laser &middot; W write &middot; Esc exit
        </span>
      </div>
      {/* main stage */}
      <div ref={stageWrapRef} style={{
        position: 'absolute',
        // While genuinely fullscreen with the chrome auto-hidden (see the
        // chromeVisible effect above), reclaim the space that was reserved
        // for the progress rail/toolbar/bottom bar -- otherwise the slide
        // keeps the same fixed 88px/128px/6vw margins regardless of
        // Fullscreen, which is exactly why entering Fullscreen didn't visibly
        // make the slide any wider before this fix. Never reclaimed while
        // the presenter panel is open, since that's still-visible chrome.
        top: (fsWide) ? 16 : 88, bottom: (fsWide) ? 16 : 128,
        left: presenterOpen ? 32 : (fsWide ? '1.5vw' : '6vw'), right: presenterOpen ? 360 : (fsWide ? '1.5vw' : '6vw'),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'right .3s ease, left .3s ease, top .3s ease, bottom .3s ease',
      }}>
        <div key={index} className={dirRef.current === 'prev' ? styles.mrPushPrev : styles.mrPushNext}
          style={{ '--mr-scale': scale, position: 'relative' }}>
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
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#fff' }}>{index < slides.length - 1 ? slides[index + 1].title : 'End of deck'}</div>
          </div>
          <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Notes</div>
            <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>No speaker notes yet, add them per slide once real content is defined.</div>
          </div>
        </div>
      )}
      {/* bottom bar: prev / thumbnail rail / next */}
      <div className={chromeClass} style={{ position: 'fixed', bottom: 24, left: 0, right: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '0 32px' }}>
        <DeckToolbarButton onClick={prev} title="Previous (←)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg></DeckToolbarButton>
        <div ref={thumbRailRef} className={styles.hideScroll} style={{
          display: 'flex', gap: 8, maxWidth: '60vw', overflowX: 'auto', padding: '8px 4px',
          background: 'rgba(15,20,38,0.72)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14,
        }}>
          {slides.map((s, i) => {
            const isActive = i === index
            const thumbW = 92, thumbScale = thumbW / SLIDE_W, thumbH = SLIDE_H * thumbScale
            return (
              <button key={s.id} type="button" data-thumb-active={isActive} onClick={() => goTo(i)} title={onReorder ? s.title + ' (drag to reorder)' : s.title}
                draggable={!!onReorder}
                onDragStart={onReorder ? (e => { setThumbDragId(s.id); try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', s.id) } catch (err) { /* ignore */ } }) : undefined}
                onDragOver={onReorder ? (e => { e.preventDefault(); if (thumbOverId !== s.id) setThumbOverId(s.id) }) : undefined}
                onDrop={onReorder ? (e => { e.preventDefault(); if (thumbDragId && thumbDragId !== s.id) onReorder(thumbDragId, s.id); setThumbDragId(null); setThumbOverId(null) }) : undefined}
                onDragEnd={onReorder ? (() => { setThumbDragId(null); setThumbOverId(null) }) : undefined}
                className={styles.thumbBtn}
                style={{
                  width: thumbW, height: thumbH, borderRadius: 7, overflow: 'hidden', flexShrink: 0, cursor: onReorder ? 'grab' : 'pointer', padding: 0,
                  border: thumbOverId === s.id && thumbDragId && thumbDragId !== s.id ? `2px dashed ${CYAN}` : (isActive ? `2px solid ${CYAN}` : '2px solid rgba(255,255,255,0.12)'),
                  boxShadow: isActive ? `0 0 0 3px ${CYAN}33` : 'none', position: 'relative', background: 'transparent',
                  opacity: thumbDragId === s.id ? 0.4 : 1,
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

function ReadView({ slides, period }) {
  const wrapRef = useRef(null)
  const size = useElementSize(wrapRef)
  const scale = size.w ? Math.min(1, (size.w - 40) / SLIDE_W) : 0.5
  return (
    <div ref={wrapRef} className={styles.printRoot} style={{ flex: 1, overflowY: 'auto', padding: '28px 0 60px', background: '#EEF1F6' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>
        {slides.map((s, i) => (
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

function GalleryCard({ slide, number, onOpen, period, editMode, hidden, onMove, onToggleHidden, canUp, canDown, drag, quickHide }) {
  const scale = 280 / SLIDE_W
  const iconBtn = { width: 28, height: 28, borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', color: '#334155', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, fontFamily: FONT }
  const dis = on => on ? {} : { opacity: 0.35, cursor: 'default' }
  return (
    <div className={styles.mrGalleryCard}
      draggable={editMode}
      onDragStart={editMode ? drag.onDragStart : undefined}
      onDragOver={editMode ? drag.onDragOver : undefined}
      onDrop={editMode ? drag.onDrop : undefined}
      onDragEnd={editMode ? drag.onDragEnd : undefined}
      style={{
        textAlign: 'left', border: drag && drag.isOver ? `1.5px dashed ${BLUE}` : '0.5px solid #E2E8F0', borderRadius: 14, overflow: 'hidden',
        background: '#fff', padding: 0, boxShadow: '0 1px 3px rgba(15,23,42,0.05)', opacity: hidden ? 0.5 : 1,
        cursor: editMode ? 'grab' : 'pointer',
      }}>
      <div onClick={editMode ? undefined : onOpen} style={{ width: '100%', aspectRatio: '16/9', overflow: 'hidden', position: 'relative', background: '#F1F5F9' }}>
        <div style={{ width: SLIDE_W, height: SLIDE_H, transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'none' }}>
          <slide.Body active={false} period={period} />
        </div>
        {quickHide && !editMode && !hidden && (
          <button type="button" title="Hide this slide from the deck" onClick={e => { e.stopPropagation(); onToggleHidden() }}
            style={{ position: 'absolute', top: 8, right: 8, ...iconBtn, background: 'rgba(255,255,255,0.92)', boxShadow: '0 1px 4px rgba(15,23,42,0.18)', zIndex: 3 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
          </button>
        )}
        {hidden && <div style={{ position: 'absolute', inset: 0, background: 'rgba(241,245,249,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#475569', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Hidden</div>}
      </div>
      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }} onClick={editMode ? undefined : onOpen}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{number ? 'Slide ' + number : 'Not in deck'}</div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{slide.title}</div>
        </div>
        {editMode && (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button type="button" title="Move earlier" onClick={() => canUp && onMove(-1)} style={{ ...iconBtn, ...dis(canUp) }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <button type="button" title="Move later" onClick={() => canDown && onMove(1)} style={{ ...iconBtn, ...dis(canDown) }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
            <button type="button" title={hidden ? 'Show this slide in the deck' : 'Hide this slide from the deck'} onClick={onToggleHidden} style={iconBtn}>
              {hidden
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ---------- saved reviews: model, storage and the list on the landing page ---------- */

// Reviews are stored in app_preferences: ONE small list under `mr_reviews` (name, period, slide order,
// hidden slides, live/frozen), and each frozen review's numbers under its own `mr_snap_<id>` row.
const REVIEWS_KEY = 'mr_reviews'
const WORK_DRAFT_KEY = 'mr_work_draft_v1'
function autoReviewName(spec) {
  if (spec.type === 'month') return REVIEW_MONTH_NAMES[spec.month] + ' ' + spec.year + ' Review'
  return buildSpan(spec).label + ' Review'
}
function newWork(spec) {
  return { id: null, name: autoReviewName(spec), spec, order: DEFAULT_SLIDE_ORDER.slice(), hidden: defaultHiddenFor(spec), status: 'live' }
}
function fmtWhen(iso) {
  if (!iso) return ''
  try { return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) } catch { return '' }
}
function nameOfEmail(e) { return e ? String(e).split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '' }
async function readReviewsList() {
  const r = await fetch('/api/preferences', { credentials: 'include' })
  if (!r.ok) throw new Error('Could not read saved reviews')
  const d = await r.json()
  return Array.isArray(d.prefs && d.prefs[REVIEWS_KEY]) ? d.prefs[REVIEWS_KEY] : []
}
async function writePref(key, value) {
  const r = await fetch('/api/preferences', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  })
  if (!r.ok) {
    const d = await r.json().catch(() => ({}))
    throw new Error(d.error || ('Save failed (' + r.status + ')'))
  }
}

function StatusChip({ status }) {
  const frozen = status === 'frozen'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
      borderRadius: 999, padding: '3px 9px', color: frozen ? NAVY : '#2F8A52', background: frozen ? C.navyBg : '#E8F5EE',
    }}>
      {frozen
        ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
        : <span style={{ width: 6, height: 6, borderRadius: '50%', background: GREEN }} />}
      {frozen ? 'Frozen' : 'Live'}
    </span>
  )
}

const REVIEW_GROUPS = [
  { title: 'Full year', types: ['fy', 'cy'] },
  { title: 'Half-year', types: ['half'] },
  { title: 'Month', types: ['month'] },
]
function PastReviews({ reviews, activeId, onOpen, onTemplate, onDelete, isOwner }) {
  if (!reviews) return <div style={{ color: '#94A3B8', fontSize: 13, padding: '8px 0' }}>Loading saved reviews…</div>
  if (!reviews.length) {
    return <div style={{ color: '#64748B', fontSize: 13.5, lineHeight: 1.6, background: '#fff', border: '0.5px dashed #CBD5E1', borderRadius: 14, padding: '18px 20px' }}>
      No saved reviews yet. Pick a period above and press <b>Save review</b> to keep it here. Month, half-year and year reviews all live in this list.
    </div>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {REVIEW_GROUPS.map(g => {
        const list = reviews.filter(r => g.types.includes(r.spec.type)).sort((a, b) => buildSpan(b.spec).start - buildSpan(a.spec).start)
        if (!list.length) return null
        return (
          <div key={g.title}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', color: '#64748B', textTransform: 'uppercase', marginBottom: 8 }}>{g.title}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {list.map(r => {
                const span = buildSpan(r.spec)
                const active = r.id === activeId
                const canDelete = r.status !== 'frozen' || isOwner
                const frozenR = r.status === 'frozen'
                const when = frozenR ? 'Frozen ' + fmtWhen(r.frozenAt) + (r.frozenBy ? ' by ' + nameOfEmail(r.frozenBy) : '') : 'Updated ' + fmtWhen(r.updatedAt) + (r.updatedBy ? ' by ' + nameOfEmail(r.updatedBy) : '')
                const nSlides = sanitizeOrder(r.order).filter(id => !(r.hidden || []).includes(id)).length
                const iconBtn = { width: 34, height: 34, borderRadius: 10, border: '1px solid #E2E8F0', background: '#fff', color: '#475569', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, flexShrink: 0, fontFamily: FONT }
                return (
                  <div key={r.id} className={styles.mrGalleryCard} style={{
                    position: 'relative', background: '#fff', borderRadius: 16, padding: '16px 18px 16px 22px', overflow: 'hidden',
                    border: active ? `1.5px solid ${BLUE}` : '0.5px solid #E2E8F0',
                    boxShadow: active ? `0 0 0 3px ${BLUE}22` : '0 1px 3px rgba(15,23,42,0.05)', display: 'flex', flexDirection: 'column', gap: 12,
                  }}>
                    <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: frozenR ? NAVY : `linear-gradient(180deg, ${GREEN}, ${CYAN})` }} />
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 7 }}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: NAVY, background: C.navyBg, borderRadius: 999, padding: '3px 10px' }}>{span.label}</span>
                          <span style={{ fontSize: 11.5, color: '#64748B', fontWeight: 600 }}>{span.range}</span>
                        </div>
                      </div>
                      <StatusChip status={r.status} />
                    </div>
                    <div style={{ fontSize: 11.5, color: '#94A3B8', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span>{nSlides} slides</span><span style={{ opacity: 0.5 }}>&middot;</span><span>{when}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button type="button" onClick={() => onOpen(r)} style={{
                        flex: 1, minWidth: 0, height: 34, borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: FONT, fontSize: 13, fontWeight: 800, color: '#fff',
                        background: active ? `linear-gradient(135deg, ${GREEN}, ${CYAN})` : `linear-gradient(135deg, ${NAVY}, ${BLUE})`,
                      }}>{active ? 'Currently open' : 'Open review'}</button>
                      <button type="button" title="Start a new review with this slide order" onClick={() => onTemplate(r)} style={iconBtn}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                      </button>
                      {canDelete && (
                        <button type="button" title="Delete this review" onClick={() => onDelete(r)} style={iconBtn}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ---------- the page body (needs the data provider above it for Freeze) ---------- */

function ReviewWorkspace({ work, patchWork, isOwner, reviews, dirty, busy, notice, setNotice, actions, slides, onPeriodChange }) {
  const ctx = useMarketingReviewData()
  const [mode, setMode] = useState('landing') // 'landing' | 'deck' | 'read'
  const [index, setIndex] = useState(0)
  const [editOrder, setEditOrder] = useState(false)
  const [dragId, setDragId] = useState(null)
  const [overId, setOverId] = useState(null)
  const [freezeAsk, setFreezeAsk] = useState(false)
  const [freezeBusy, setFreezeBusy] = useState('')
  const [freezeError, setFreezeError] = useState('')

  const span = ctx.months.current
  const period = reviewPeriodString(span)
  const frozen = work.status === 'frozen'
  const saved = !!work.id && !!reviews && reviews.some(r => r.id === work.id)
  const hiddenSet = useMemo(() => new Set(work.hidden), [work.hidden])
  const numberOf = useMemo(() => {
    const m = {}
    slides.forEach((sl, i) => { m[sl.id] = i + 1 })
    return m
  }, [slides])

  const startDeck = useCallback((i = 0) => { if (!slides.length) return; setIndex(Math.min(i, slides.length - 1)); setMode('deck') }, [slides.length])
  const exitDeck = useCallback(() => { if (document.fullscreenElement) document.exitFullscreen(); setMode('landing') }, [])
  const doPrint = useCallback(() => {
    setMode('read')
    setTimeout(() => window.print(), 250)
  }, [])

  const moveBy = (id, dir) => {
    const order = work.order.slice()
    const i = order.indexOf(id), j = i + dir
    if (i < 0 || j < 0 || j >= order.length) return
    ;[order[i], order[j]] = [order[j], order[i]]
    patchWork({ order })
  }
  const dropOn = (targetId) => {
    if (!dragId || dragId === targetId) return
    patchWork({ order: moveInOrder(work.order, dragId, targetId) })
  }
  // Reordering from the deck's thumbnail strip: the slide being shown stays on screen (the index follows it).
  const reorderFromDeck = (dragSlideId, targetId) => {
    const currentId = slides[index] && slides[index].id
    const order = moveInOrder(work.order, dragSlideId, targetId)
    const visible = order.filter(id => !hiddenSet.has(id))
    patchWork({ order })
    const ni = visible.indexOf(currentId)
    if (ni >= 0) setIndex(ni)
  }
  const toggleHidden = (id) => patchWork({ hidden: hiddenSet.has(id) ? work.hidden.filter(x => x !== id) : work.hidden.concat(id) })

  const doFreeze = async () => {
    setFreezeError(''); setFreezeBusy('Preparing…')
    try {
      let id = work.id
      if (!saved || dirty) {
        setFreezeBusy('Saving the review…')
        id = await actions.save()
        if (!id) throw new Error('Could not save the review first.')
      }
      const snap = await ctx.buildSnapshot(setFreezeBusy)
      setFreezeBusy('Locking the numbers…')
      await actions.freeze(snap, id)
      setFreezeAsk(false)
    } catch (e) {
      setFreezeError((e && e.message) || 'Could not freeze the review.')
    } finally {
      setFreezeBusy('')
    }
  }

  const typeOptions = PERIOD_TYPES.map(t => ({ value: t.value, label: t.label }))
  const periodOptions = useMemo(() => {
    const opts = listPeriodSpecs(work.spec.type).map(sp => ({ value: specKey(sp), label: periodOptionLabel(sp) }))
    if (!opts.some(o => o.value === specKey(work.spec))) opts.push({ value: specKey(work.spec), label: periodOptionLabel(work.spec) })
    return opts
  }, [work.spec])

  const panelCard = { background: '#fff', border: '0.5px solid #E2E8F0', borderRadius: 16, padding: '18px 20px', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }
  const fieldLabel = { fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', color: '#64748B', textTransform: 'uppercase', marginBottom: 5 }

  return (
    <>
      <div className={`lq-page-shell ${styles.shellRoot}`} style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#EEF1F6' }}>
        <div className={styles.noPrint}><Sidebar /></div>
        <div className={styles.contentCol} style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div className={styles.noPrint} style={{
            padding: '16px 28px', background: '#fff', borderBottom: '0.5px solid #E5E7EB',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
          }}>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', color: '#94A3B8', textTransform: 'uppercase' }}>Dashboards / Marketing Review</div>
              <div style={{ fontSize: 19, fontWeight: 800, color: '#0F1B33', marginTop: 2 }}>{span.typeTitle} Marketing Review</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <StatusChip status={work.status} />
              <span style={{
                fontSize: 11, fontWeight: 800, color: NAVY, background: C.navyBg, borderRadius: 999, padding: '5px 12px', textTransform: 'uppercase', letterSpacing: '0.04em',
              }}>{period}</span>
              <Button size="sm" variant="secondary" onClick={() => setMode(mode === 'read' ? 'landing' : 'read')}>
                {mode === 'read' ? 'Back to overview' : 'Read view'}
              </Button>
              <Button size="sm" variant="secondary" onClick={doPrint}>Print / Export PDF</Button>
              <Button size="sm" onClick={() => startDeck(0)} disabled={!slides.length}>Start presentation</Button>
            </div>
          </div>

          {mode === 'landing' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px 60px' }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, marginBottom: 22,
                background: 'linear-gradient(135deg,#0B1330,#1B2A57)', borderRadius: 18, padding: '30px 34px', color: '#fff', overflow: 'hidden', position: 'relative',
              }}>
                <div style={{ position: 'absolute', inset: 0, opacity: 0.5 }}><AmbientBackground variant="landing" /></div>
                <div style={{ position: 'relative', zIndex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', marginBottom: 8 }}>{slides.length} slides &middot; {period}</div>
                  <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{work.name || 'Untitled review'}</div>
                </div>
                <button type="button" onClick={() => startDeck(0)} className={styles.mrLaunchBtn} disabled={!slides.length} style={{
                  position: 'relative', zIndex: 1, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '13px 24px',
                  borderRadius: 12, border: 'none', background: `linear-gradient(135deg, ${NAVY}, ${BLUE})`, color: '#fff', fontSize: 14, fontWeight: 800,
                  fontFamily: FONT, cursor: 'pointer', boxShadow: `0 10px 30px -8px ${BLUE}99`,
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="13" rx="2.5" /><path d="M10.5 8.2v4.6l3.6-2.3z" fill="currentColor" stroke="none" /><path d="M8 21h8" /><path d="M12 17v4" /></svg>
                  Start presentation
                </button>
              </div>

              {notice && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14, padding: '10px 16px', background: '#FFF6DA', border: '1px solid #F2E2A8', borderRadius: 12, fontSize: 12.5, color: '#7A5C00', fontWeight: 600 }}>
                  <span>{notice}</span>
                  <button type="button" onClick={() => setNotice('')} style={{ border: 'none', background: 'transparent', color: '#7A5C00', cursor: 'pointer', fontWeight: 800, fontFamily: FONT }}>Dismiss</button>
                </div>
              )}

              {/* review settings: period, name, save / freeze */}
              <div style={{ ...panelCard, marginBottom: 18 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
                  <div>
                    <div style={fieldLabel}>Review type</div>
                    <Dropdown value={work.spec.type} options={typeOptions} minWidth={150} disabled={frozen}
                      onChange={v => onPeriodChange(mostRecentCompletedSpec(v))} />
                  </div>
                  <div>
                    <div style={fieldLabel}>Period</div>
                    <Dropdown value={specKey(work.spec)} options={periodOptions} minWidth={250} disabled={frozen}
                      onChange={v => onPeriodChange(parseSpecKey(v))} />
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={fieldLabel}>Review name</div>
                    <input type="text" value={work.name} disabled={frozen} onChange={e => patchWork({ name: e.target.value })} placeholder="e.g. H1 FY26-27 Review"
                      style={{ width: '100%', boxSizing: 'border-box', minHeight: 32, padding: '7px 12px', borderRadius: 11, border: '0.5px solid #CBD5E1', fontSize: 13.5, fontWeight: 700, color: '#0F172A', fontFamily: FONT, background: frozen ? '#F8FAFC' : '#fff' }} />
                  </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 14 }}>
                  <Button size="sm" onClick={() => actions.save()} disabled={frozen || busy || !work.name.trim() || (saved && !dirty)}>
                    {busy ? 'Saving…' : (saved ? 'Save changes' : 'Save review')}
                  </Button>
                  {saved && !frozen && <Button size="sm" variant="secondary" onClick={() => actions.saveAsNew()} disabled={busy}>Save as new review</Button>}
                  <Button size="sm" variant="secondary" onClick={() => actions.newReview()} disabled={busy}>New review</Button>
                  {isOwner && saved && !frozen && !freezeAsk && <Button size="sm" variant="secondary" onClick={() => { setFreezeError(''); setFreezeAsk(true) }}>Freeze this review…</Button>}
                  {isOwner && frozen && <Button size="sm" variant="secondary" onClick={() => actions.unfreeze()} disabled={busy}>Unfreeze (go live again)</Button>}
                  <span style={{ fontSize: 12, fontWeight: 700, color: frozen ? NAVY : (dirty ? '#8A6A00' : '#94A3B8') }}>
                    {frozen ? 'Frozen, read only' : (!saved ? 'Not saved yet' : (dirty ? 'Unsaved changes' : 'All changes saved'))}
                  </span>
                </div>

                {freezeAsk && (
                  <div style={{ marginTop: 14, background: C.navyBg, border: `1px solid ${NAVY}22`, borderRadius: 12, padding: '14px 16px' }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: NAVY, marginBottom: 4 }}>Freeze “{work.name}”?</div>
                    <div style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.6 }}>
                      Every number is saved exactly as it is now, figures, campaign lists, the AC entries and the slide order. After that the review never changes when data refreshes, and nobody else can edit it. Only you can unfreeze it.
                    </div>
                    {ctx.loading && <div style={{ fontSize: 12.5, color: '#7A5C00', fontWeight: 700, marginTop: 8 }}>The figures are still loading, wait a moment, then freeze.</div>}
                    {freezeError && <div style={{ fontSize: 12.5, color: '#B42318', fontWeight: 700, marginTop: 8 }}>{freezeError}</div>}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
                      <Button size="sm" onClick={doFreeze} disabled={!!freezeBusy || ctx.loading}>{freezeBusy || 'Freeze now'}</Button>
                      <Button size="sm" variant="secondary" onClick={() => { setFreezeAsk(false); setFreezeError('') }} disabled={!!freezeBusy}>Cancel</Button>
                    </div>
                  </div>
                )}
                {!isOwner && <div style={{ fontSize: 11.5, color: '#94A3B8', marginTop: 12 }}>Freezing a review is limited to its owner.</div>}
              </div>

              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22, padding: '11px 16px',
                background: frozen ? C.navyBg : '#E8F5EE', border: `1px solid ${frozen ? NAVY + '22' : '#BFE3CE'}`, borderRadius: 12, fontSize: 12.5, color: frozen ? NAVY : '#2F6B47', fontWeight: 600,
              }}>
                {frozen
                  ? `Frozen on ${fmtWhen(work.frozenAt)}${work.frozenBy ? ' by ' + nameOfEmail(work.frozenBy) : ''}, these numbers are exactly as they were saved and will not change.`
                  : 'Live, figures are read fresh from the data each time you open this review. Freeze it once it has been presented to lock the numbers.'}
              </div>

              <div style={{ marginBottom: 26 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#0F1B33', marginBottom: 12 }}>Saved reviews</div>
                <PastReviews reviews={reviews} activeId={work.id} isOwner={isOwner}
                  onOpen={actions.open} onTemplate={actions.template} onDelete={actions.remove} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#0F1B33' }}>Slides</div>
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                    {editOrder ? 'Drag a slide, or use the arrows, to change the order. Slide numbers, the agenda and the thumbnails follow automatically.' : 'Click a slide to present from it.'}
                  </div>
                </div>
                {!frozen && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    {editOrder && <Button size="sm" variant="secondary" onClick={() => patchWork({ order: DEFAULT_SLIDE_ORDER.slice(), hidden: defaultHiddenFor(work.spec) })}>Reset order</Button>}
                    <Button size="sm" variant={editOrder ? 'primary' : 'secondary'} onClick={() => setEditOrder(v => !v)}>{editOrder ? 'Done' : 'Edit slide order'}</Button>
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
                {(editOrder && !frozen ? work.order.map(id => SLIDES_BY_ID[id]) : slides).map((sl) => {
                  const idx = work.order.indexOf(sl.id)
                  return (
                    <GalleryCard key={sl.id} slide={sl} number={numberOf[sl.id]} period={period}
                      editMode={editOrder && !frozen} hidden={hiddenSet.has(sl.id)}
                      onOpen={() => startDeck(slides.findIndex(x => x.id === sl.id))}
                      onMove={dir => moveBy(sl.id, dir)} canUp={idx > 0} canDown={idx < work.order.length - 1}
                      onToggleHidden={() => toggleHidden(sl.id)} quickHide={!frozen}
                      drag={{
                        isOver: overId === sl.id && dragId && dragId !== sl.id,
                        onDragStart: e => { setDragId(sl.id); try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', sl.id) } catch (err) { /* ignore */ } },
                        onDragOver: e => { e.preventDefault(); if (overId !== sl.id) setOverId(sl.id) },
                        onDrop: e => { e.preventDefault(); dropOn(sl.id); setDragId(null); setOverId(null) },
                        onDragEnd: () => { setDragId(null); setOverId(null) },
                      }} />
                  )
                })}
              </div>
              {!frozen && !editOrder && work.hidden.filter(id => SLIDES_BY_ID[id]).length > 0 && (
                <div style={{ marginTop: 18, background: '#F8FAFC', border: '0.5px solid #E2E8F0', borderRadius: 12, padding: '12px 16px' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                    Hidden slides ({work.hidden.filter(id => SLIDES_BY_ID[id]).length}), not in the deck
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {work.hidden.filter(id => SLIDES_BY_ID[id]).map(id => (
                      <button key={id} type="button" onClick={() => toggleHidden(id)} title="Show this slide in the deck again"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid #CBD5E1', background: '#fff', borderRadius: 999, padding: '6px 12px', fontSize: 12.5, fontWeight: 700, color: '#334155', cursor: 'pointer', fontFamily: FONT }}>
                        {SLIDES_BY_ID[id].title}
                        <span style={{ color: GREEN, fontWeight: 800 }}>Show</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {mode === 'read' && <ReadView slides={slides} period={period} />}
        </div>

        {mode === 'deck' && (
          <DeckView
            slides={slides}
            index={index}
            setIndex={setIndex}
            period={period}
            onExit={exitDeck}
            onPrint={doPrint}
            onReorder={frozen ? undefined : reorderFromDeck}
          />
        )}
      </div>
    </>
  )
}

/* ---------- the page: owns the working review, the saved list and the freeze flow ---------- */

export default function MarketingReviewDashboard() {
  const { user } = useAuth()
  const isOwner = isMarketingReviewOwner(user && user.email)
  const meEmail = (user && user.email) || ''
  const [reviews, setReviews] = useState(null)
  // The working review survives a reload: the last state (period, slide order, hidden slides) is kept in
  // this browser, and a saved live review also auto-saves its changes (below). Frozen reviews are never kept here.
  const [work, setWork] = useState(() => {
    try {
      const d = JSON.parse(localStorage.getItem(WORK_DRAFT_KEY) || 'null')
      if (d && d.spec && Array.isArray(d.order) && Array.isArray(d.hidden) && d.status !== 'frozen') return { ...d, order: sanitizeOrder(d.order) }
    } catch (e) { /* no draft */ }
    return newWork(defaultReviewSpec())
  })
  const [snapshot, setSnapshot] = useState(null)
  const [snapState, setSnapState] = useState('idle') // idle | loading | error
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let dead = false
    readReviewsList().then(l => { if (!dead) setReviews(l) }).catch(e => { if (!dead) { setReviews([]); setNotice(e.message) } })
    return () => { dead = true }
  }, [])

  const patchWork = useCallback(p => setWork(w => ({ ...w, ...p })), [])
  const savedEntry = work.id && reviews ? reviews.find(r => r.id === work.id) : null
  const dirty = !savedEntry || savedEntry.name !== work.name
    || JSON.stringify([savedEntry.spec, savedEntry.order, savedEntry.hidden]) !== JSON.stringify([work.spec, work.order, work.hidden])

  // Read-modify-write on the shared list: re-read the latest first so two people saving different
  // reviews never overwrite each other.
  const mutateReviews = useCallback(async (fn) => {
    const fresh = await readReviewsList()
    const next = fn(fresh)
    await writePref(REVIEWS_KEY, next)
    setReviews(next)
    return next
  }, [])

  const sanitizedOrder = useMemo(() => sanitizeOrder(work.order), [work.order])
  const slides = useMemo(() => {
    const hide = new Set(work.hidden)
    return sanitizedOrder.filter(id => !hide.has(id)).map(id => SLIDES_BY_ID[id])
  }, [sanitizedOrder, work.hidden])

  const entryFromWork = (w, id, extra) => ({
    id, name: w.name.trim() || autoReviewName(w.spec), spec: w.spec, order: sanitizeOrder(w.order), hidden: w.hidden,
    status: 'live', createdAt: (extra && extra.createdAt) || new Date().toISOString(), createdBy: (extra && extra.createdBy) || meEmail,
    updatedAt: new Date().toISOString(), updatedBy: meEmail,
  })

  const actions = {
    // returns the review id on success
    save: async () => {
      setBusy(true); setNotice('')
      try {
        const id = work.id || ('r' + Date.now().toString(36))
        const prev = reviews && reviews.find(r => r.id === id)
        const entry = entryFromWork(work, id, prev)
        await mutateReviews(list => list.some(r => r.id === id) ? list.map(r => r.id === id ? entry : r) : list.concat(entry))
        setWork(w => ({ ...w, ...entry }))
        return id
      } catch (e) { setNotice('Could not save: ' + ((e && e.message) || 'error')); return null }
      finally { setBusy(false) }
    },
    saveAsNew: async () => {
      setBusy(true); setNotice('')
      try {
        const id = 'r' + Date.now().toString(36)
        const entry = entryFromWork({ ...work, name: work.name.trim() + ' (copy)' }, id)
        await mutateReviews(list => list.concat(entry))
        setWork({ ...entry }); setSnapshot(null)
      } catch (e) { setNotice('Could not save: ' + ((e && e.message) || 'error')) }
      finally { setBusy(false) }
    },
    newReview: () => { setSnapshot(null); setSnapState('idle'); setWork(newWork(defaultReviewSpec())); setNotice('') },
    open: async (r) => {
      setNotice('')
      if (r.status === 'frozen') {
        setSnapshot(null); setSnapState('loading'); setWork({ ...r, order: sanitizeOrder(r.order) })
        try {
          const resp = await fetch('/api/preferences?mrSnapshot=' + encodeURIComponent(r.id), { credentials: 'include' })
          const d = await resp.json().catch(() => ({}))
          if (!resp.ok || !d.snapshot) throw new Error(d.error || 'The frozen numbers could not be found')
          setSnapshot(d.snapshot); setSnapState('idle')
        } catch (e) { setSnapState('error'); setNotice('Could not open the frozen review: ' + ((e && e.message) || 'error')) }
      } else {
        setSnapshot(null); setSnapState('idle'); setWork({ ...r, order: sanitizeOrder(r.order) })
      }
    },
    template: (r) => {
      setSnapshot(null); setSnapState('idle')
      const spec = mostRecentCompletedSpec(r.spec.type)
      setWork({ ...newWork(spec), order: sanitizeOrder(r.order), hidden: defaultHiddenFor(spec).concat(r.hidden.filter(h => h !== 'cac-sheet')) })
      setNotice('Started a new review using the slide order of "' + r.name + '". Pick the period and save it.')
    },
    remove: async (r) => {
      if (!window.confirm('Delete "' + r.name + '"' + (r.status === 'frozen' ? ' and its frozen numbers' : '') + '? This cannot be undone.')) return
      setBusy(true); setNotice('')
      try {
        await mutateReviews(list => list.filter(x => x.id !== r.id))
        if (r.status === 'frozen') { try { await writePref('mr_snap_' + r.id, null) } catch (e) { /* the entry is gone; a stray snapshot row is harmless */ } }
        if (work.id === r.id) { setSnapshot(null); setSnapState('idle'); setWork(newWork(defaultReviewSpec())) }
      } catch (e) { setNotice('Could not delete: ' + ((e && e.message) || 'error')) }
      finally { setBusy(false) }
    },
    freeze: async (snap, id) => {
      await writePref('mr_snap_' + id, snap)
      const frozenAt = new Date().toISOString()
      let frozenEntry = null
      await mutateReviews(list => list.map(r => {
        if (r.id !== id) return r
        frozenEntry = { ...r, status: 'frozen', frozenAt, frozenBy: meEmail, updatedAt: frozenAt, updatedBy: meEmail }
        return frozenEntry
      }))
      setSnapshot(snap); setSnapState('idle')
      setWork(w => ({ ...w, ...frozenEntry }))
    },
    unfreeze: async () => {
      if (!window.confirm('Unfreeze "' + work.name + '"? It will go live again and pull today\'s numbers; the frozen copy is removed.')) return
      setBusy(true); setNotice('')
      try {
        let liveEntry = null
        await mutateReviews(list => list.map(r => {
          if (r.id !== work.id) return r
          const { frozenAt, frozenBy, ...rest } = r
          liveEntry = { ...rest, status: 'live', updatedAt: new Date().toISOString(), updatedBy: meEmail }
          return liveEntry
        }))
        try { await writePref('mr_snap_' + work.id, null) } catch (e) { /* harmless */ }
        setSnapshot(null)
        setWork(w => ({ ...w, ...liveEntry, frozenAt: undefined, frozenBy: undefined }))
      } catch (e) { setNotice('Could not unfreeze: ' + ((e && e.message) || 'error')) }
      finally { setBusy(false) }
    },
  }

  // Changing the period of a review: keep the order, adjust only what the period decides (the CAC
  // slide, and the auto-generated name if the user never typed their own).
  const onPeriodChange = useCallback((spec) => {
    setWork(w => {
      const wasAuto = w.name === autoReviewName(w.spec)
      const hidden = specKey(spec) === CAC_SHEET_SPEC_KEY ? w.hidden : (w.hidden.includes('cac-sheet') ? w.hidden : w.hidden.concat('cac-sheet'))
      return { ...w, spec, hidden, name: wasAuto ? autoReviewName(spec) : w.name }
    })
  }, [])

  useEffect(() => {
    try {
      if (work.status === 'frozen') localStorage.removeItem(WORK_DRAFT_KEY)
      else localStorage.setItem(WORK_DRAFT_KEY, JSON.stringify(work))
    } catch (e) { /* storage unavailable: the page still works */ }
  }, [work])

  // Auto-save a saved, live review a moment after its slide order / hidden slides / period change.
  useEffect(() => {
    if (!savedEntry || work.status === 'frozen' || savedEntry.status === 'frozen' || !work.name.trim() || !dirty) return undefined
    const t = setTimeout(() => {
      const entry = entryFromWork(work, work.id, savedEntry)
      mutateReviews(list => list.map(r => (r.id === work.id && r.status !== 'frozen') ? entry : r)).catch(() => { /* the draft above still holds it */ })
    }, 1200)
    return () => clearTimeout(t)
  }, [work, savedEntry, dirty, mutateReviews])

  const frozenLoading = work.status === 'frozen' && !snapshot
  const providerKey = specKey(work.spec) + (work.status === 'frozen' ? ':frozen' : ':live')

  if (frozenLoading) {
    return (
      <div className={`lq-page-shell ${styles.shellRoot}`} style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#EEF1F6' }}>
        <div className={styles.noPrint}><Sidebar /></div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14, fontFamily: FONT }}>
          {snapState === 'error'
            ? <>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#7A5C00', maxWidth: 420, textAlign: 'center' }}>{notice || 'Could not open the frozen review.'}</div>
                <Button size="sm" onClick={actions.newReview}>Back to a new review</Button>
              </>
            : <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#64748B', fontSize: 14, fontWeight: 600 }}><span className={styles.mrSpinner} />Opening the frozen review…</div>}
        </div>
      </div>
    )
  }

  return (
    <MarketingReviewDataProvider key={providerKey} spec={work.spec} snapshot={work.status === 'frozen' ? snapshot : null}>
      <DeckSlidesContext.Provider value={slides}>
        <ReviewWorkspace work={work} patchWork={patchWork} isOwner={isOwner} reviews={reviews} dirty={dirty} busy={busy}
          notice={notice} setNotice={setNotice} actions={actions} slides={slides} onPeriodChange={onPeriodChange} />
      </DeckSlidesContext.Provider>
    </MarketingReviewDataProvider>
  )
}
