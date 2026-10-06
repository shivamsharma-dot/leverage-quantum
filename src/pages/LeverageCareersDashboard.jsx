import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, ScatterChart, Scatter, ZAxis, LabelList, Cell,
} from 'recharts'
import Sidebar from '../components/Sidebar'
import Button from '../components/Button'
import ExportButton from '../components/ExportButton'
import DateRangePicker from '../components/DateRangePicker'
import Dropdown from '../components/Dropdown'
import SlackReportPanel from '../components/SlackReportPanel'
import { SlackIcon } from '../components/icons/BrandIcons'
import { InlineLoader } from '../components/SkeletonLoader'
import { toast } from '../components/ToastHost'
import { C, FONT, fmtN, pct, Card, PremKPI, KPI_ICONS, BarGrad, barFill, BAR_RADIUS, RankedBars, sourceColor, NEUTRAL_TRACK } from '../ui/dashboardKit'
import { CAREERS_REPORT_VERSIONS } from '../lib/careersReport'
import { careersV2Windows, comparableSpan, buildCareersV2Ctx, isPaidSource } from '../lib/careersReportV2'
import { DEFAULT_PROGRAMS, classifyProgram, normalizePrograms } from '../lib/careersPrograms'
import { fetchCareersCacheRows, fetchCareersCacheSyncedAt } from '../lib/leverageCareersCache'
import { captureNodePng, rowsToCsv, nextPaint } from '../lib/slackShare'
import { getSession, setSession } from '../lib/sessionLoad'
import styles from './LeverageCareersDashboard.module.css'

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
function addMonthsIso(iso, n) {
  const p = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(p[0], p[1] - 1 + n, p[2]))
  return dt.toISOString().slice(0, 10)
}
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthKeyOf = iso => iso.slice(0, 7)
const monthLabelOf = key => { const [y, m] = key.split('-'); return MN[Number(m) - 1] + "'" + y.slice(2) }
const dayLabelOf = iso => { const [, m, d] = iso.split('-'); return Number(d) + ' ' + MN[Number(m) - 1] }
function isoWeekStart(iso) {
  const p = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(p[0], p[1] - 1, p[2]))
  const dow = (dt.getUTCDay() + 6) % 7 // Monday = 0
  dt.setUTCDate(dt.getUTCDate() - dow)
  return dt.toISOString().slice(0, 10)
}

const PRESETS = [
  { id: 'ld', label: 'Last Day' },
  { id: 'l7d', label: 'Last 7D' },
  { id: 'mtd', label: 'MTD' },
]

// One row per (date, campaign, source, sub-source), for any window -- shared by
// the main page and Compare, so the two can never disagree about what a number
// means. Everything (spend, leads, interested, won) comes from the Careerv2
// BigQuery query via its Supabase cache; the page no longer reads Meta.
// "won" is the funnel (cohort) figure, dated by when the lead was created, so it
// lines up with leads and interested on the same row. wonSnapshot is a separate
// snapshot-view figure (no funnel cohort) and is never added to or mixed with it.
const NO_CAMPAIGN = '(no campaign)'
async function fetchGranular(since, until) {
  const rows = await fetchCareersCacheRows({ since, until })
  return rows.filter(r => r.lead_date).map(r => ({
    date: r.lead_date,
    name: r.campaign || NO_CAMPAIGN,
    source: r.source || 'Unknown',
    subSource: r.sub_source || 'Unknown',
    spend: Number(r.spend) || 0,
    leads: Number(r.total_leads) || 0,
    interested: Number(r.total_interested) || 0,
    won: Number(r.won) || 0,
    wonSnapshot: Number(r.won_snapshot) || 0,
  }))
}

// Aggregate granular rows into one of three shapes -- Campaign (one row per ad
// name, spend-first), Month (one row per calendar month), Day (one row per
// date) -- mirroring the Overall dashboard's own Source/Campaign/Month/Day
// grouping-tab pattern. Every derived ratio is re-computed from the summed
// totals here, never averaged across rows, so a TOTAL line built the same way
// always reconciles exactly.
// Which field a grouping tab keys on. Source/Sub Source/Campaign come straight from the Careerv2 query.
function keyForDim(r, dim) {
  if (dim === 'campaign') return r.name
  if (dim === 'source') return r.source
  if (dim === 'subSource') return r.subSource
  if (dim === 'program') return r.program
  if (dim === 'day') return r.date
  return monthKeyOf(r.date)
}
function groupRows(rows, dim) {
  const map = new Map()
  ;(rows || []).forEach(r => {
    const key = keyForDim(r, dim)
    const label = key
    let g = map.get(key)
    if (!g) { g = { key, label, spend: 0, leads: 0, interested: 0, won: 0, wonSnapshot: 0 }; map.set(key, g) }
    g.spend += r.spend; g.leads += r.leads; g.interested += r.interested; g.won += r.won; g.wonSnapshot += r.wonSnapshot
  })
  return Array.from(map.values()).map(g => ({
    ...g,
    cpl: g.leads > 0 && g.spend > 0 ? g.spend / g.leads : null,
    cpi: g.interested > 0 && g.spend > 0 ? g.spend / g.interested : null,
    cps: g.won > 0 && g.spend > 0 ? g.spend / g.won : null,
  }))
}
function sortGroup(dim, arr) {
  if (dim === 'day' || dim === 'month') return [...arr].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  return [...arr].sort((a, b) => b.spend - a.spend)
}
function sumTotals(rows) {
  const spend = rows.reduce((s, r) => s + r.spend, 0)
  const leads = rows.reduce((s, r) => s + r.leads, 0)
  const interested = rows.reduce((s, r) => s + r.interested, 0)
  const won = rows.reduce((s, r) => s + r.won, 0)
  const wonSnapshot = rows.reduce((s, r) => s + r.wonSnapshot, 0)
  return {
    spend, leads, interested, won, wonSnapshot,
    cpl: leads > 0 && spend > 0 ? spend / leads : null,
    cpi: interested > 0 && spend > 0 ? spend / interested : null,
    cps: won > 0 && spend > 0 ? spend / won : null,
  }
}
const fmtINR = n => n == null ? '—' : '₹' + Math.round(n).toLocaleString('en-IN')
const deltaPct = (cur, prev) => (prev == null || prev === 0) ? (cur > 0 ? 100 : null) : ((cur - prev) / prev) * 100

// Charts on this page mix units in one tooltip (rupees, counts, percentages), so
// the SERIES NAME decides the format -- same convention the table columns use.
const tipFmt = (name, value) => {
  const n = String(name || '')
  if (/spend|cpl|cps|cpi|cost/i.test(n)) return fmtINR(value)
  if (/rate|ctr|%/i.test(n)) return value == null ? '\u2014' : Number(value).toFixed(2) + '%'
  return fmtN(value)
}

function BrandTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null
  return (
    <div style={{ background: 'var(--card)', border: '0.5px solid var(--card-border)', borderRadius: 10, padding: '9px 13px', fontFamily: FONT, boxShadow: '0 8px 24px rgba(15,23,42,0.12)' }}>
      <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ fontSize: 11.5, color: 'var(--text2)', display: 'flex', justifyContent: 'space-between', gap: 18 }}>
          <span style={{ color: p.color || p.fill }}>{p.name}</span>
          <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{tipFmt(p.name, p.value)}</span>
        </div>
      ))}
    </div>
  )
}
const sectionTitle = (t, s) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ fontSize: 14, fontWeight: 800, color: C.text, letterSpacing: '-0.2px' }}>{t}</div>
    {s && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{s}</div>}
  </div>
)
const axis = { fontSize: 11, fill: C.muted, fontFamily: FONT }
const fmtPct1 = v => v == null ? '\u2014' : v.toFixed(1) + '%'
// hex -> rgba. Used for the cohort heat cells and the funnel bar gradients, so the
// hue stays a brand hue and only its opacity carries the value.
function tint(hex, a) {
  const n = parseInt(String(hex).replace('#', ''), 16)
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'
}

// ---- Funnel view ----------------------------------------------------------
// One column of the funnel. Widths are log-scaled against the TOP STAGE OF ITS OWN
// COLUMN, never across columns: leads and Won differ by orders of
// magnitude on this account, so a single shared linear scale renders every stage
// after the first as an identical invisible sliver. Splitting the journey at the
// one place the unit genuinely changes plus a log width keeps every bar readable
// and every stage distinguishable, and the step chip between two bars states the
// exact linear conversion and drop-off in numbers.
function FunnelColumn({ title, note, stages, accent }) {
  const top = stages.length ? stages[0].value : 0
  return (
    <div style={{ border: '0.5px solid var(--card-border)', borderRadius: 14, padding: '14px 16px 10px', background: 'var(--bg2)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: C.text, letterSpacing: '-0.1px' }}>{title}</span>
        <span style={{ fontSize: 10.5, color: C.muted }}>{note}</span>
      </div>
      {stages.map((s, i) => {
        // Log scale WITHIN the column. On a linear scale with a minimum width, two
        // genuinely different stages get drawn at the same width once both fall under
        // the floor, which is not merely unreadable, it is wrong. Log keeps the taper
        // monotonic and every stage distinguishable; the step chips and the tiles carry
        // the exact LINEAR rates, which are the numbers anyone actually acts on.
        const w = top > 1 ? Math.max((Math.log(s.value + 1) / Math.log(top + 1)) * 100, 6) : 6
        const nxt = stages[i + 1]
        const step = nxt ? (s.value > 0 ? (nxt.value / s.value) * 100 : null) : null
        return (
          <div key={s.key}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 5 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{s.label}</span>
              <span style={{ marginLeft: 'auto', fontSize: 14.5, fontWeight: 800, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{fmtN(s.value)}</span>
            </div>
            <div style={{ height: 24, borderRadius: 7, background: tint(NEUTRAL_TRACK, 0.55), display: 'flex', justifyContent: 'center', overflow: 'hidden' }}>
              <div style={{ width: w + '%', height: '100%', borderRadius: 7, background: 'linear-gradient(90deg,' + tint(s.color, 0.95) + ',' + tint(s.color, 0.6) + ')', boxShadow: '0 3px 10px -5px ' + tint(s.color, 0.95), transition: 'width .6s cubic-bezier(.4,0,.2,1)' }} />
            </div>
            {nxt ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, margin: '8px 0 9px' }}>
                <span style={{ fontSize: 10, fontWeight: 800, padding: '2.5px 9px', borderRadius: 99, background: tint(accent, 0.12), color: accent }}>{fmtPct1(step)} continue</span>
                <span style={{ fontSize: 10, color: C.muted }}>{fmtN(Math.max(0, s.value - nxt.value))} drop-off</span>
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

// A single stage-to-stage conversion rate. Same visual grammar as the Marketing
// Performance agent's KPI tiles (uppercase micro-label, one big number, one line
// of definition underneath) so the two pages read as the same product.
function StepTile({ label, value, sub, color }) {
  return (
    <div style={{ border: '0.5px solid var(--card-border)', borderRadius: 12, padding: '11px 13px', background: 'var(--card)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: color }} />
      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.muted, marginTop: 3 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: color, marginTop: 4, letterSpacing: '-0.3px', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2 }}>{sub}</div>
    </div>
  )
}

// Chip for one applied filter field; the x clears that whole field.
function FilterChip({ label, text, onRemove }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 6px 5px 11px', borderRadius: 99, border: '0.5px solid var(--card-border)', background: 'var(--card)', fontFamily: FONT, fontSize: 12, fontWeight: 600, color: C.text, maxWidth: 320 }}>
      <span style={{ color: C.muted, fontWeight: 700 }}>{label}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</span>
      <button type="button" onClick={onRemove} aria-label={'Clear ' + label} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.muted, fontSize: 15, lineHeight: 1, padding: '0 4px' }}>{'\u00d7'}</button>
    </span>
  )
}

// One advanced-filter popover for the whole page: a section per field, each a
// searchable multi-select (picks within a field are OR, fields combine as AND),
// plus a campaign-name search. position:fixed so no scrolling ancestor can clip it.
function CareersFilterPanel({ anchor, onClose, sections, nameQuery, setNameQuery }) {
  const [search, setSearch] = useState({})
  const toggle = (sec, v) => sec.onChange(sec.value.includes(v) ? sec.value.filter(x => x !== v) : [...sec.value, v])
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80 }} />
      <div style={{ position: 'fixed', top: anchor.top, left: Math.max(12, anchor.left), width: 'min(380px, 94vw)', maxHeight: 'min(560px, calc(100vh - ' + (anchor.top + 16) + 'px))', overflowY: 'auto', zIndex: 81, background: 'var(--card)', border: '0.5px solid var(--card-border)', borderRadius: 14, boxShadow: '0 16px 44px rgba(15,23,42,0.18)', padding: 14, fontFamily: FONT }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, marginBottom: 6 }}>Campaign name contains</div>
        <input value={nameQuery} onChange={e => setNameQuery(e.target.value)} placeholder="Search campaign name..."
          style={{ width: '100%', boxSizing: 'border-box', padding: '8px 11px', borderRadius: 9, border: '0.5px solid var(--card-border)', background: 'transparent', fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: C.text, outline: 'none', marginBottom: 14 }} />
        {sections.map(sec => {
          const q = (search[sec.label] || '').toLowerCase()
          const opts = sec.options.filter(o => !q || o.label.toLowerCase().includes(q))
          return (
            <div key={sec.label} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted }}>{sec.label}{sec.value.length ? ' (' + sec.value.length + ')' : ''}</span>
                {sec.value.length > 0 && <button type="button" onClick={() => sec.onChange([])} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: FONT, fontSize: 11.5, fontWeight: 700, color: C.blue }}>Clear</button>}
              </div>
              {sec.options.length > 8 && (
                <input value={search[sec.label] || ''} onChange={e => setSearch(o => ({ ...o, [sec.label]: e.target.value }))} placeholder="Search..."
                  style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: 8, border: '0.5px solid var(--card-border)', background: 'transparent', fontFamily: FONT, fontSize: 12, color: C.text, outline: 'none', marginBottom: 6 }} />
              )}
              <div style={{ maxHeight: 150, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
                {opts.length === 0 ? <div style={{ fontSize: 12, color: C.muted, padding: '4px 2px' }}>Nothing to pick.</div> : opts.map(o => (
                  <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '5px 6px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: C.text }}>
                    <input type="checkbox" checked={sec.value.includes(o.value)} onChange={() => toggle(sec, o.value)} style={{ accentColor: C.navy, width: 14, height: 14 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

// Stamps every row with its program (see src/lib/careersPrograms.js for the rule).
function tagRows(rows, programs) {
  return (rows || []).map(r => ({ ...r, program: classifyProgram(r.name, programs) }))
}

// A program counts as low volume when too little has happened to read a rate from:
// under 10 Won or under 1,000 leads. It is a caution flag next to the program name,
// never a reason to hide the row.
const isLowVolume = g => g.leads > 0 && (g.won < 10 || g.leads < 1000)

const PROGRAM_COLORS = [C.navy, C.blue, C.cyan, C.green, '#3A5BA0', '#5BCAD2', '#7A8FB8']

function ProgramEfficiencyTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null
  const d = payload[0].payload
  return (
    <div style={{ background: 'var(--card)', border: '0.5px solid var(--card-border)', borderRadius: 10, padding: '9px 13px', fontFamily: FONT, boxShadow: '0 8px 24px rgba(15,23,42,0.12)' }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>{d.name}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text2)', lineHeight: 1.6 }}>
        Paid spend {fmtINR(d.spend)}<br />Won (Funnel) {fmtN(d.won)}<br />Cost per won {fmtINR(d.cps)}<br />Cost per lead {fmtINR(d.cpl)}
        {d.lowVolume ? <><br /><span style={{ color: C.muted }}>low volume — read with care</span></> : null}
      </div>
    </div>
  )
}

function sortRowsBy(arr, sort) {
  const dir = sort.dir === 'asc' ? 1 : -1
  return [...arr].sort((a, b) => {
    const av = a[sort.key], bv = b[sort.key]
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    return av < bv ? -dir : av > bv ? dir : 0
  })
}

// Expand/collapse caret for the Source view's tree rows -- same glyph and rotation
// as Overall's TreeChevron.
function TreeChevron({ open }) {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s', flexShrink: 0 }}>
      <polyline points="9 6 15 12 9 18" />
    </svg>
  )
}

const TABLE_TABS = [['program', 'Program'], ['campaign', 'Campaign'], ['source', 'Source'], ['subSource', 'Sub Source'], ['month', 'Month'], ['day', 'Day']]
// First-column header per grouping tab, reused by the table AND the exports so a
// downloaded CSV always names its group column the same way the screen does.
const GROUP_LABEL = { program: 'Program', campaign: 'Campaign', source: 'Source', subSource: 'Sub Source', month: 'Month', day: 'Date' }
const EXPORT_KEY = { program: 'Program', campaign: 'Campaign', source: 'Source', subSource: 'Sub Source', month: 'Month', day: 'Date' }
function labelForDim(dim, key) {
  if (dim === 'day') return dayLabelOf(key)
  if (dim === 'month') return monthLabelOf(key)
  return key
}

// Delays adopting a fast-changing value (a search keystroke) until it has been
// stable for `delay`ms. The input stays bound to the raw value so typing itself is
// instant; only the row-filtering that reacts to it is deferred. Same helper and
// same rationale as OverallDashboard.jsx's own copy.
function useDebouncedValue(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

const CONV_OPTIONS = [
  { value: 'high', label: 'At/above median' },
  { value: 'low', label: 'Below median' },
  { value: 'none', label: 'No Won yet' },
]
const COST_OPTIONS = [
  { value: 'efficient', label: 'At/below median' },
  { value: 'expensive', label: 'Above median' },
  { value: 'nospend', label: 'No spend' },
]

function medianOf(arr) {
  if (!arr.length) return null
  const a = [...arr].sort((x, y) => x - y)
  const m = a.length >> 1
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
}

// Option list for a row dimension, ordered by lead volume so the sources
// people actually look at sit at the top of the menu instead of alphabetically.
// Always built from the UNFILTERED rows, so picking one value never removes the
// others from the menu and strands you with no way back.
function optionsFor(rows, field) {
  const m = new Map()
  ;(rows || []).forEach(r => { const k = r[field]; if (!k) return; m.set(k, (m.get(k) || 0) + r.leads) })
  return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).map(e => e[0])
}

// THE one predicate every row-filtering site uses -- main page, funnel, cohort and
// Compare all call this with the same `filters` object, so they can never disagree
// about what a filtered number means (the construction Overall already uses for
// its Source/Corridor/campaign filters).
//
// Row-level filters (source / sub source / campaign name) run first. The two
// performance BANDS are campaign-level and deliberately re-derive their median
// from whatever survived the row-level pass, so 'above median CPL' always means
// 'above median within what you are currently looking at' rather than against a
// fixed global number that stops meaning anything once a source is picked. Median
// (not mean) for the same reason the Overall efficiency map uses it: spend and
// lead volume here are skewed by a handful of large campaigns.
function applyFilters(rows, f) {
  const q = (f.query || '').trim().toLowerCase()
  const out = (rows || []).filter(r => {
    if (f.source.length && !f.source.includes(r.source)) return false
    if (f.program.length && !f.program.includes(r.program)) return false
    if (f.subSource.length && !f.subSource.includes(r.subSource)) return false
    if (q && !String(r.name || '').toLowerCase().includes(q)) return false
    return true
  })
  if (!f.conv.length && !f.cost.length) return out
  const camps = groupRows(out, 'campaign')
  const medConv = medianOf(camps.filter(c => c.interested > 0).map(c => c.won / c.interested))
  const medCost = medianOf(camps.filter(c => c.cpl != null).map(c => c.cpl))
  const keep = new Set()
  camps.forEach(c => {
    const rate = c.interested > 0 ? c.won / c.interested : null
    const convTest = {
      high: rate != null && medConv != null && rate >= medConv && c.won > 0,
      low: rate != null && medConv != null && rate < medConv,
      none: c.won === 0,
    }
    const costTest = {
      efficient: c.cpl != null && medCost != null && c.cpl <= medCost,
      expensive: c.cpl != null && medCost != null && c.cpl > medCost,
      nospend: !(c.spend > 0),
    }
    // Within one field the picks are OR; across fields they are AND.
    const ok = (!f.conv.length || f.conv.some(v => convTest[v])) && (!f.cost.length || f.cost.some(v => costTest[v]))
    if (ok) keep.add(c.label)
  })
  return out.filter(r => keep.has(r.name))
}

// Custom-range field for the Compare modal. Replaces the two pairs of native
// <input type="date"> that used to live there -- this app does not use native date
// inputs anywhere; this is the same shared two-month DateRangePicker the page
// header already opens, just in a popover anchored to a pill.
function RangeField({ label, from, to, open, onOpen, onClose, onChange }) {
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" onClick={onOpen} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 11, border: '0.5px solid ' + (open ? C.navy : 'var(--card-border)'), background: open ? C.navyBg : 'var(--card)', color: open ? C.navy : 'var(--text)', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: FONT, whiteSpace: 'nowrap' }}>
        <span style={{ color: C.muted, fontWeight: 600 }}>{label}:</span>
        {from && to ? from + ' → ' + to : 'Pick a range'}
      </button>
      {open ? (
        <>
          <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 949 }} />
          <div className="lq-popover-clamp" style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 950, background: 'var(--card)', border: '0.5px solid ' + C.border, borderRadius: 14, boxShadow: '0 20px 60px rgba(15,23,42,0.16)', overflow: 'hidden' }}>
            <DateRangePicker from={isoToDate(from)} to={isoToDate(to)} onChange={onChange} onClose={onClose} />
          </div>
        </>
      ) : null}
    </div>
  )
}

export default function LeverageCareersDashboard() {
  const [preset, setPreset] = useState('mtd')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [customOpen, setCustomOpen] = useState(false)

  const [dayRows, setDayRows] = useState(null) // granular (date, name) rows for activeWindow
  // Program rule (campaign-name keywords). Defaults apply until/unless Settings has a saved list.
  const [programs, setPrograms] = useState(DEFAULT_PROGRAMS)
  useEffect(() => {
    fetch('/api/preferences', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d && d.prefs && Array.isArray(d.prefs.careers_programs)) setPrograms(normalizePrograms(d.prefs.careers_programs)) })
      .catch(() => {})
  }, [])
  const dayRowsT = useMemo(() => (dayRows ? tagRows(dayRows, programs) : dayRows), [dayRows, programs])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [synced, setSynced] = useState(null)

  const [tableDim, setTableDim] = useState('program')
  // Advanced filters. These are page-level, not table-level: every KPI, the funnel,
  // the cohort table, the charts, the exports and Compare all read the SAME filters object via
  // applyFilters(), so a filtered CPI on a card can never disagree with a filtered
  // CPI in the table. The old table-only search box was removed in favour of the
  // debounced ad-name search here, which previously filtered the visible rows while
  // leaving the TOTAL row and every KPI on the unfiltered set.
  const [fProgram, setFProgram] = useState([])
  const [fSource, setFSource] = useState([])
  const [fSubSource, setFSubSource] = useState([])
  const [fConv, setFConv] = useState([])
  const [fCost, setFCost] = useState([])
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filtersAnchor, setFiltersAnchor] = useState(null)
  const [nameQuery, setNameQuery] = useState('')
  const nameQueryDebounced = useDebouncedValue(nameQuery, 250)
  const [tableSort, setTableSort] = useState({ key: 'spend', dir: 'desc' })

  // Cohort view bucket -- Month or Week. Shared Dropdown, never a native select.
  const [cohortBy, setCohortBy] = useState('Week')

  const [compareOpen, setCompareOpen] = useState(false)
  const [compareMode, setCompareMode] = useState('prev')
  const [cFromA, setCFromA] = useState('')
  const [cToA, setCToA] = useState('')
  const [cFromB, setCFromB] = useState('')
  const [cToB, setCToB] = useState('')
  const [compareRowsA, setCompareRowsA] = useState(null)
  const [compareRowsB, setCompareRowsB] = useState(null)
  const [compareLoading, setCompareLoading] = useState(false)
  const [compareError, setCompareError] = useState('')
  const [cPick, setCPick] = useState(null) // which custom range popover is open: 'a' | 'b' | null

  const [slackOpen, setSlackOpen] = useState(false)
  const [slackRows, setSlackRows] = useState(null) // current + previous window, for the V2 report's vs columns
  const tableRef = useRef(null)

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

  // force=true only for an explicit Refresh click -- a plain mount (including
  // navigating back from another dashboard) reuses whatever this session already
  // fetched for THIS SAME date window (see sessionLoad.js), instead of re-running
  // the cache read every single visit.
  const load = useCallback(async (force) => {
    const cacheKey = 'careers_v2:' + activeWindow.from + ':' + activeWindow.to
    if (!force) {
      const cached = getSession(cacheKey)
      if (cached) { setDayRows(cached.data.rows); setSynced(cached.data.synced); setLoading(false); setError(''); return }
    }
    setLoading(true); setError('')
    try {
      const rows = await fetchGranular(activeWindow.from, activeWindow.to)
      setDayRows(rows)
      // "Synced" is when the cache last ran (3x/day), not when this tab fetched.
      const synced = (await fetchCareersCacheSyncedAt()) || new Date()
      setSynced(synced)
      setSession(cacheKey, { rows, synced })
    } catch (e) {
      setError(e.message || 'Failed to load')
      toast('Leverage Careers: ' + (e.message || 'load failed'), { type: 'muted' })
    } finally {
      setLoading(false)
    }
  }, [activeWindow.from, activeWindow.to])

  useEffect(() => { load(false) }, [activeWindow.from, activeWindow.to]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- main-page aggregates ----
  const filters = useMemo(
    () => ({ program: fProgram, source: fSource, subSource: fSubSource, conv: fConv, cost: fCost, query: nameQueryDebounced }),
    [fProgram, fSource, fSubSource, fConv, fCost, nameQueryDebounced]
  )
  const filterCount = fProgram.length + fSource.length + fSubSource.length + fConv.length + fCost.length + (nameQueryDebounced.trim() ? 1 : 0)
  const resetFilters = useCallback(() => { setFProgram([]); setFSource([]); setFSubSource([]); setFConv([]); setFCost([]); setNameQuery('') }, [])
  // Menus are built from the UNFILTERED rows on purpose -- see optionsFor().
  const programOptions = useMemo(() => optionsFor(dayRowsT, 'program'), [dayRowsT])
  const sourceOptions = useMemo(() => optionsFor(dayRowsT, 'source'), [dayRowsT])
  const subSourceOptions = useMemo(() => optionsFor(dayRowsT, 'subSource'), [dayRowsT])
  const rows = useMemo(() => applyFilters(dayRowsT || [], filters), [dayRowsT, filters])
  const campaignRows = useMemo(() => sortGroup('campaign', groupRows(rows, 'campaign')), [rows])
  const totals = useMemo(() => sumTotals(rows), [rows])

  const funnel = useMemo(() => ([
    { stage: 'Leads', count: totals.leads },
    { stage: 'Interested', count: totals.interested },
    { stage: 'Won', count: totals.won },
  ]), [totals])

  const tableRowsRaw = useMemo(() => groupRows(rows, tableDim), [rows, tableDim])
  const tableRows = useMemo(() => sortRowsBy(tableRowsRaw, tableSort), [tableRowsRaw, tableSort])
  // Source view: Paid / Non-Paid bands, each listing its Sources; clicking a Source
  // reveals its Sub Sources, clicking a Sub Source reveals its Campaigns -- the same
  // tree Overall's Source view uses. Every level carries the full metric set, and
  // every ratio is recomputed from that level's own summed totals.
  const [expandedSources, setExpandedSources] = useState(() => new Set())
  const [expandedSubs, setExpandedSubs] = useState(() => new Set())
  const toggleIn = (setter, key) => setter(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n })
  const sourceTreeItems = useMemo(() => {
    if (tableDim !== 'source') return []
    const items = []
    const addBand = (key, label, keep) => {
      const br = rows.filter(r => keep(r.source))
      if (!br.length) return
      items.push({ kind: 'band', key, label, ...sumTotals(br) })
      sortRowsBy(groupRows(br, 'source'), tableSort).forEach(src => {
        const srcOpen = expandedSources.has(src.key)
        items.push({ kind: 'source', key: 'src:' + src.key, label: src.label, depth: 0, open: srcOpen, toggle: () => toggleIn(setExpandedSources, src.key), ...src })
        if (!srcOpen) return
        const srcRows = br.filter(r => r.source === src.key)
        sortRowsBy(groupRows(srcRows, 'subSource'), tableSort).forEach(sub => {
          const subKey = src.key + '||' + sub.key
          const subOpen = expandedSubs.has(subKey)
          items.push({ kind: 'sub', key: 'sub:' + subKey, label: sub.label, depth: 1, open: subOpen, toggle: () => toggleIn(setExpandedSubs, subKey), ...sub })
          if (!subOpen) return
          sortRowsBy(groupRows(srcRows.filter(r => r.subSource === sub.key), 'campaign'), tableSort).forEach(c => {
            items.push({ kind: 'campaign', key: 'camp:' + subKey + '||' + c.key, label: c.label, depth: 2, ...c })
          })
        })
      })
    }
    addBand('band-paid', 'PAID CHANNELS', isPaidSource)
    addBand('band-free', 'NON-PAID CHANNELS', v => !isPaidSource(v))
    return items
  }, [tableDim, rows, tableSort, expandedSources, expandedSubs])
  // Program view: each program expands into its Paid and Non-Paid rows (same paid rule as
  // the Source view), and each of those expands into its campaigns.
  const [expandedPrograms, setExpandedPrograms] = useState(() => new Set())
  const [expandedProgPB, setExpandedProgPB] = useState(() => new Set())
  const programTreeItems = useMemo(() => {
    if (tableDim !== 'program') return []
    const items = []
    sortRowsBy(groupRows(rows, 'program'), tableSort).forEach(pg => {
      const open = expandedPrograms.has(pg.key)
      items.push({ kind: 'source', key: 'prog:' + pg.key, label: pg.label, depth: 0, open, lowVolume: isLowVolume(pg), toggle: () => toggleIn(setExpandedPrograms, pg.key), ...pg })
      if (!open) return
      const pgRows = rows.filter(r => r.program === pg.key)
      ;[['Paid', isPaidSource], ['Non-Paid', v => !isPaidSource(v)]].forEach(([lab, test]) => {
        const br = pgRows.filter(r => test(r.source))
        if (!br.length) return
        const k = pg.key + '||' + lab
        const o = expandedProgPB.has(k)
        items.push({ kind: 'sub', key: 'pb:' + k, label: lab, depth: 1, open: o, toggle: () => toggleIn(setExpandedProgPB, k), ...sumTotals(br) })
        if (!o) return
        sortRowsBy(groupRows(br, 'campaign'), tableSort).forEach(c => {
          items.push({ kind: 'campaign', key: 'pc:' + k + '||' + c.key, label: c.label, depth: 2, ...c })
        })
      })
    })
    return items
  }, [tableDim, rows, tableSort, expandedPrograms, expandedProgPB])
  const treeItems = tableDim === 'source' ? sourceTreeItems : (tableDim === 'program' ? programTreeItems : null)
  // Efficiency chart: paid campaigns only (free outreach leads would make a program look cheaper
  // than it is), one point per program that has paid spend and at least one Won.
  const programEfficiency = useMemo(() => {
    const out = []
    groupRows(rows.filter(r => isPaidSource(r.source)), 'program').forEach(g => {
      if (g.spend > 0 && g.won > 0 && g.cps != null) out.push({ name: g.label, spend: g.spend, won: g.won, cps: g.cps, cpl: g.cpl, lowVolume: isLowVolume(g) })
    })
    return out.sort((a, b) => b.spend - a.spend)
  }, [rows])
  const tableTotals = useMemo(() => sumTotals(tableRows), [tableRows])
  const toggleSort = key => setTableSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' })

  const exportRows = useMemo(() => tableRows.map(r => ({
    [EXPORT_KEY[tableDim]]: labelForDim(tableDim, r.label),
    Spend: fmtINR(r.spend), Leads: fmtN(r.leads), Interested: fmtN(r.interested), 'Won (Funnel)': fmtN(r.won), 'Won (Snapshot)': fmtN(r.wonSnapshot),
    CPL: fmtINR(r.cpl), CPI: fmtINR(r.cpi), CPS: fmtINR(r.cps),
  })), [tableRows, tableDim])
  const exportRawRows = useMemo(() => tableRows.map(r => ({
    [EXPORT_KEY[tableDim]]: labelForDim(tableDim, r.label),
    Spend: Math.round(r.spend), Leads: r.leads, Interested: r.interested, 'Won (Funnel)': r.won, 'Won (Snapshot)': r.wonSnapshot,
    CPL: r.cpl != null ? Math.round(r.cpl) : '', CPI: r.cpi != null ? Math.round(r.cpi) : '', CPS: r.cps != null ? Math.round(r.cps) : '',
  })), [tableRows, tableDim])

  // Slack "Send to Slack" -- a dedicated button + preview panel (SlackReportPanel),
  // not the plain ExportButton's inline Slack menu items. buildContext is read
  // synchronously by the panel to build BOTH the live preview and the real send
  // (see SlackReportPanel.jsx), so it must never depend on anything async.
  const buildCareersContext = useCallback(() => {
    const sc = (l, a) => l + ': ' + (a.length ? a.join(', ') : 'All')
    const scope = sc('Program', fProgram) + ' \u00b7 ' + sc('Source', fSource) + ' \u00b7 ' + sc('Sub source', fSubSource)
    const v2 = buildCareersV2Ctx({
      rows: applyFilters(tagRows(slackRows || dayRows || [], programs), filters),
      win: activeWindow, preset, windowLabel, filterLine: scope, scopeLine: scope,
      hasPrevData: !!slackRows,
    })
    return {
      windowLabel, totals, tableDim,
      tableRows: tableRows.map(r => ({ ...r, label: labelForDim(tableDim, r.label) })),
      campaignCount: campaignRows.length,
      ...v2,
    }
  }, [windowLabel, totals, tableDim, tableRows, campaignRows.length, slackRows, dayRows, programs, filters, activeWindow, preset, fSource, fSubSource])

  // The V2 report reads every figure against the window before it, and each day
  // against the day before, so it needs rows reaching back past the on-screen
  // window. Fetched once when the Slack panel opens (buildContext must stay
  // synchronous), then filtered through the same applyFilters() as everything else.
  useEffect(() => {
    if (!slackOpen) return undefined
    let cancelled = false
    setSlackRows(null)
    const { fetchFrom } = careersV2Windows(activeWindow, preset)
    fetchGranular(fetchFrom, activeWindow.to)
      .then(r => { if (!cancelled) setSlackRows(r) })
      .catch(() => { if (!cancelled) setSlackRows([]) })
    return () => { cancelled = true }
  }, [slackOpen, activeWindow.from, activeWindow.to, preset]) // eslint-disable-line react-hooks/exhaustive-deps

  const captureCareersFiles = useCallback(async () => {
    await nextPaint()
    const node = tableRef.current
    const shot = node ? await captureNodePng(node, { ratios: [2, 1.5, 1] }) : null
    return { pngBase64: shot ? shot.base64 : null, pixelRatio: shot ? shot.pixelRatio : null, csv: rowsToCsv(Object.keys(exportRawRows[0] || {}), exportRawRows) }
  }, [exportRawRows])

  // ---- Funnel view ----
  const pipelineStages = useMemo(() => ([
    { key: 'leads', label: 'Leads', value: totals.leads, color: C.cyan },
    { key: 'interested', label: 'Interested', value: totals.interested, color: '#5BCAD2' },
    { key: 'won', label: 'Won', value: totals.won, color: C.green },
  ]), [totals])
  // Every stage-to-stage rate is recomputed from the summed totals, never averaged
  // from per-day rates -- same rule the table's TOTAL row follows.
  const stepTiles = useMemo(() => ([
    { label: 'Interested rate', value: pct(totals.interested, totals.leads), sub: 'interested / leads', color: C.cyan },
    { label: 'Won rate', value: pct(totals.won, totals.interested), sub: 'Won / interested', color: C.green },
    { label: 'Lead \u2192 Won', value: pct(totals.won, totals.leads), sub: 'end to end', color: C.navy },
  ]), [totals])

  // ---- Chart series ----
  // Built off `rows` (post-filter), so every chart moves with the filter bar in
  // lockstep with the KPIs and the table.
  const dailySeries = useMemo(() => sortGroup('day', groupRows(rows, 'day')).map(d => ({
    label: dayLabelOf(d.key),
    Spend: Math.round(d.spend),
    'Leads': d.leads,
    Interested: d.interested,
    Won: d.won,
    'CPL': d.cpl != null ? Math.round(d.cpl) : null,
    'Won rate': d.interested > 0 ? +((d.won / d.interested) * 100).toFixed(2) : 0,
  })), [rows])
  // Thin the x-axis labels once a window is long enough that they would collide.
  const dayTickInterval = dailySeries.length > 20 ? Math.ceil(dailySeries.length / 12) : 0

  const sourceRanked = useMemo(() => {
    const m = new Map()
    ;(rows || []).forEach(r => { const k = r.source || 'Unknown'; m.set(k, (m.get(k) || 0) + r.leads) })
    return Array.from(m.entries()).map(([source, count]) => ({ source, count }))
      .filter(r => r.count > 0).sort((a, b) => b.count - a.count).slice(0, 8)
  }, [rows])
  const sourceTotal = useMemo(() => sourceRanked.reduce((s, r) => s + r.count, 0), [sourceRanked])

  // ---- Cohort view ----
  // A cohort is every lead that ARRIVED in the same month (or week), followed
  // through to Interested and Won. Read a rate column down, not a row across: the
  // newest cohort has had the least time to convert, so its Won rate is a floor
  // rather than a verdict. Spend is attributed on the ad-day the lead came from
  // (see fetchGranular), so CPL and CPS stay inside the cohort instead of being
  // smeared over the whole window.
  const cohortRows = useMemo(() => {
    const m = new Map()
    ;(rows || []).forEach(r => {
      const k = cohortBy === 'Week' ? isoWeekStart(r.date) : monthKeyOf(r.date)
      let g = m.get(k)
      if (!g) { g = { key: k, spend: 0, leads: 0, interested: 0, won: 0 }; m.set(k, g) }
      g.spend += r.spend; g.leads += r.leads
      g.interested += r.interested; g.won += r.won
    })
    return Array.from(m.values())
      .sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
      .map(g => ({
        ...g,
        label: cohortBy === 'Week' ? 'wk ' + dayLabelOf(g.key) : monthLabelOf(g.key),
        intRate: g.leads > 0 ? (g.interested / g.leads) * 100 : null,
        wonRate: g.interested > 0 ? (g.won / g.interested) * 100 : null,
        endRate: g.leads > 0 ? (g.won / g.leads) * 100 : null,
        cpl: g.leads > 0 ? g.spend / g.leads : null,
        cps: g.won > 0 ? g.spend / g.won : null,
      }))
  }, [rows, cohortBy])
  // Heat is scaled to the best cohort in view, so the tint always spans the full
  // range of what is on screen rather than a fixed scale nothing ever reaches.
  const cohortMax = useMemo(() => ({
    intRate: Math.max(...cohortRows.map(r => r.intRate || 0), 0.0001),
    wonRate: Math.max(...cohortRows.map(r => r.wonRate || 0), 0.0001),
    endRate: Math.max(...cohortRows.map(r => r.endRate || 0), 0.0001),
  }), [cohortRows])
  const cohortChart = useMemo(() => cohortRows.map(r => ({
    label: r.label, 'Leads': r.leads, Interested: r.interested, Won: r.won,
    'Won rate': r.endRate != null ? +r.endRate.toFixed(2) : 0,
  })), [cohortRows])

  // ---- Compare ----
  // Same rule as the Slack V2 report (comparableSpan): complete days only, and
  // MTD against the same days of the month before -- so a delta never compares a
  // partial day, or 1-4 Oct, against all of September.
  const comparable = useMemo(() => comparableSpan(activeWindow, preset), [activeWindow, preset])
  const compareSpanA = useMemo(() => {
    if (compareMode === 'custom') return (cFromA && cToA) ? { from: cFromA, to: cToA } : comparable.cur
    return comparable.cur
  }, [compareMode, cFromA, cToA, comparable])
  const compareSpanB = useMemo(() => {
    const days = (new Date(compareSpanA.to) - new Date(compareSpanA.from)) / 86400000 + 1
    if (compareMode === 'yoy') return { from: addMonthsIso(compareSpanA.from, -12), to: addMonthsIso(compareSpanA.to, -12) }
    if (compareMode === 'custom') return (cFromB && cToB) ? { from: cFromB, to: cToB } : { from: shiftDate(compareSpanA.from, -days), to: shiftDate(compareSpanA.from, -1) }
    return comparable.prev
  }, [compareMode, compareSpanA, cFromB, cToB, comparable])

  useEffect(() => {
    if (!compareOpen) return
    let cancelled = false
    setCompareLoading(true); setCompareError('')
    Promise.all([
      fetchGranular(compareSpanA.from, compareSpanA.to),
      fetchGranular(compareSpanB.from, compareSpanB.to),
    ]).then(([a, b]) => { if (!cancelled) { setCompareRowsA(a); setCompareRowsB(b) } })
      .catch(e => { if (!cancelled) setCompareError(e.message || 'Failed to load comparison data') })
      .finally(() => { if (!cancelled) setCompareLoading(false) })
    return () => { cancelled = true }
  }, [compareOpen, compareSpanA.from, compareSpanA.to, compareSpanB.from, compareSpanB.to])

  const compareResult = useMemo(() => {
    const fa = applyFilters(tagRows(compareRowsA || [], programs), filters)
    const fb = applyFilters(tagRows(compareRowsB || [], programs), filters)
    const a = sumTotals(fa)
    const b = sumTotals(fb)
    const groupA = new Map(groupRows(fa, 'campaign').map(r => [r.label, r]))
    const groupB = new Map(groupRows(fb, 'campaign').map(r => [r.label, r]))
    const names = new Set([...groupA.keys(), ...groupB.keys()])
    const rows = Array.from(names).map(name => {
      const ra = groupA.get(name) || { spend: 0, leads: 0, interested: 0, won: 0, cpl: null, cpl: null, cpi: null, cps: null }
      const rb = groupB.get(name) || { spend: 0, leads: 0, interested: 0, won: 0, cpl: null, cpl: null, cpi: null, cps: null }
      return { name, a: ra, b: rb, dWon: ra.won - rb.won, dCrmLeads: ra.leads - rb.leads }
    }).sort((x, y) => Math.abs(y.dWon) - Math.abs(x.dWon) || Math.abs(y.dCrmLeads) - Math.abs(x.dCrmLeads))
    const wonDelta = deltaPct(a.won, b.won)
    const cpsDelta = (a.cps != null && b.cps != null) ? deltaPct(a.cps, b.cps) : null
    const verdict = a.won === 0 && b.won === 0
      ? `No Won leads in either period — comparing on Leads instead: ${deltaPct(a.leads, b.leads) == null ? '—' : (deltaPct(a.leads, b.leads) >= 0 ? 'up' : 'down') + ' ' + Math.abs(deltaPct(a.leads, b.leads)).toFixed(1) + '%'}.`
      : `Won is ${wonDelta == null ? 'flat' : (wonDelta >= 0 ? 'up' : 'down') + ' ' + Math.abs(wonDelta).toFixed(1) + '%'}${cpsDelta == null ? '' : `, and cost per Won is ${cpsDelta >= 0 ? 'up' : 'down'} ${Math.abs(cpsDelta).toFixed(1)}%`}.`
    return { a, b, rows, verdict }
  }, [compareRowsA, compareRowsB, filters, programs])
  const compareExportRows = useMemo(() => compareResult.rows.map(r => ({
    Campaign: r.name,
    [`Spend (${windowLabel})`]: Math.round(r.a.spend), 'Spend (compare)': Math.round(r.b.spend),
    'Leads (this)': r.a.leads, 'Leads (compare)': r.b.leads,
    'Interested (this)': r.a.interested, 'Interested (compare)': r.b.interested,
    'Won (this)': r.a.won, 'Won (compare)': r.b.won, 'Δ Won': r.dWon, 'Δ Leads': r.dCrmLeads,
  })), [compareResult, windowLabel])

  const showRefreshing = loading && !!dayRows

  return (
    <div className="lq-page-shell" style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.bg, fontFamily: FONT }}>
      <Sidebar />
      <div style={{ margin: '12px 14px 0', borderRadius: 14, border: '1px solid var(--card-border)', boxShadow: '0 1px 3px rgba(31,60,132,0.06)', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* HEADER — same structure/behavior as Overall's own header (floating card, pill
            date group, Compare button, Synced/Refreshing tag, spin-on-refresh). */}
        <div style={{ background: 'var(--card)', borderBottom: `0.5px solid ${C.border}`, padding: '10px 28px', minHeight: 56, height: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0, overflow: 'visible', flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontSize: 10.5, color: C.muted, margin: 0, letterSpacing: '0.05em', textTransform: 'uppercase', fontFamily: FONT }}>Marketing / Leverage Careers</p>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: '2px 0 0', letterSpacing: '-0.4px', fontFamily: FONT }}>
              Leverage Careers{' — '}<span style={{ fontSize: 13, fontWeight: 600, color: C.blue }}>{windowLabel}</span>
            </h1>
          </div>
          <div className="lq-header-controls" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', overflow: 'visible', flexShrink: 1, minWidth: 0 }}>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg2)', padding: '6px 10px', borderRadius: 12, border: '0.5px solid var(--card-border)' }}>
              {PRESETS.map(p => (
                <button key={p.id} type="button" onClick={() => setPreset(p.id)} style={{ padding: '5px 11px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, fontFamily: FONT, background: preset === p.id ? 'linear-gradient(135deg, #1F3C84, #1C9FD4)' : 'transparent', color: preset === p.id ? '#fff' : 'var(--text3)', boxShadow: preset === p.id ? '0 4px 10px -3px rgba(31,60,132,0.5)' : 'none', transition: 'all .15s' }}>{p.label}</button>
              ))}
              <div style={{ position: 'relative' }}>
                <button type="button" onClick={() => { setPreset('custom'); setCustomOpen(v => !v) }} style={{ padding: '5px 11px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, fontFamily: FONT, background: preset === 'custom' ? 'linear-gradient(135deg, #1F3C84, #1C9FD4)' : 'transparent', color: preset === 'custom' ? '#fff' : 'var(--text3)', boxShadow: preset === 'custom' ? '0 4px 10px -3px rgba(31,60,132,0.5)' : 'none', transition: 'all .15s', whiteSpace: 'nowrap' }}>
                  {preset === 'custom' && customFrom && customTo ? customFrom + ' → ' + customTo : 'Custom'}
                </button>
                {customOpen ? (
                  <>
                    <div onClick={() => { setCustomOpen(false); if (!(customFrom && customTo)) setPreset('mtd') }} style={{ position: 'fixed', inset: 0, zIndex: 399 }} />
                    <div className="lq-popover-clamp" style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 400, background: 'var(--card)', border: `0.5px solid ${C.border}`, borderRadius: 14, boxShadow: '0 20px 60px rgba(15,23,42,0.16), 0 4px 12px rgba(15,23,42,0.06)', overflow: 'hidden' }}>
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

            <Button
              size="sm" variant="secondary" onClick={() => setCompareOpen(true)}
              icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 00-2 2v3m0 8v3a2 2 0 002 2h3m8 0h3a2 2 0 002-2v-3m0-8V5a2 2 0 00-2-2h-3" /><line x1="8" y1="12" x2="16" y2="12" /></svg>}
            >Compare</Button>

            <span style={{ fontSize: 11, color: loading ? C.blue : C.muted, fontWeight: loading ? 700 : 400, fontFamily: FONT, whiteSpace: 'nowrap' }}>
              {loading ? (dayRows ? 'Refreshing…' : 'Loading…') : (synced ? 'Synced ' + synced.toLocaleTimeString() : '')}
            </span>
            <Button
              onClick={() => load(true)} disabled={loading} size="sm" variant="secondary"
              icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: loading ? 'spin .8s linear infinite' : 'none' }}><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>}
            >{loading ? 'Refreshing' : 'Refresh'}</Button>
          </div>
        </div>

        {/* SCROLLABLE CONTENT */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
          {loading && !dayRows ? (
            <InlineLoader label="Loading Leverage Careers data" />
          ) : error && !dayRows ? (
            <div className={styles.card}>
              <div className={styles.empty}>{error}</div>
            </div>
          ) : (
            <div style={{ opacity: showRefreshing ? 0.55 : 1, pointerEvents: showRefreshing ? 'none' : 'auto', transition: 'opacity .2s' }}>
              {/* ADVANCED FILTERS -- page level, not table level. Everything below (KPIs,
                  funnel, table, exports) and both modals read the same applyFilters()
                  predicate off this one filters object. */}
              <div className="lq-header-controls" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <Button size="sm" variant="secondary" onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setFiltersAnchor({ top: r.bottom + 6, left: Math.min(r.left, window.innerWidth - 400) }); setFiltersOpen(o => !o) }}>
                  Filters{filterCount > 0 ? ' (' + filterCount + ')' : ''}
                </Button>
                {[['Program', fProgram, setFProgram], ['Source', fSource, setFSource], ['Sub source', fSubSource, setFSubSource],
                  ['Won rate', fConv, setFConv, CONV_OPTIONS], ['CPL', fCost, setFCost, COST_OPTIONS]].map(([lab, arr, set, opts]) => arr.length ? (
                  <FilterChip key={lab} label={lab} text={arr.map(v => (opts ? (opts.find(o => o.value === v) || {}).label : v)).join(', ')} onRemove={() => set([])} />
                ) : null)}
                {nameQueryDebounced.trim() ? <FilterChip label="Campaign" text={'contains "' + nameQueryDebounced.trim() + '"'} onRemove={() => setNameQuery('')} /> : null}
                {filterCount > 0 && <Button size="sm" variant="secondary" onClick={resetFilters}>Clear all</Button>}
                {filtersOpen && filtersAnchor && (
                  <CareersFilterPanel anchor={filtersAnchor} onClose={() => setFiltersOpen(false)}
                    nameQuery={nameQuery} setNameQuery={setNameQuery}
                    sections={[
                      { label: 'Program', options: programOptions.map(v => ({ value: v, label: v })), value: fProgram, onChange: setFProgram },
                      { label: 'Source', options: sourceOptions.map(v => ({ value: v, label: v })), value: fSource, onChange: setFSource },
                      { label: 'Sub source', options: subSourceOptions.map(v => ({ value: v, label: v })), value: fSubSource, onChange: setFSubSource },
                      { label: 'Won rate (per campaign)', options: CONV_OPTIONS, value: fConv, onChange: setFConv },
                      { label: 'CPL (per campaign)', options: COST_OPTIONS, value: fCost, onChange: setFCost },
                    ]} />
                )}
              </div>
              {filterCount > 0 && (
                <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 12, lineHeight: 1.6 }}>
                  Filtered view: {fmtN(rows.length)} of {fmtN((dayRows || []).length)} day-campaign rows.
                </div>
              )}
              <div className="lq-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 12, marginBottom: 12 }}>
                <PremKPI label="SPEND" value={fmtINR(totals.spend)} sub={windowLabel} accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.total} />
                <PremKPI label="LEADS" value={fmtN(totals.leads)} sub={campaignRows.length + ' campaigns'} accent={C.cyan} accentBg={C.cyanBg} icon={KPI_ICONS.bot} />
                <PremKPI label="INTERESTED" value={fmtN(totals.interested)} sub={pct(totals.interested, totals.leads) + ' of leads'} accent={C.green} accentBg={C.greenBg} icon={KPI_ICONS.ai} />
                <PremKPI label="WON (FUNNEL)" value={fmtN(totals.won)} sub={pct(totals.won, totals.interested) + ' of interested'} accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.total} />
                <PremKPI label="WON (SNAPSHOT)" value={fmtN(totals.wonSnapshot)} sub="snapshot view, not part of the funnel" accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.total} />
              </div>
              <div className="lq-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 20 }}>
                <PremKPI label="CPL" value={fmtINR(totals.cpl)} sub="spend / leads" accent={C.blue} accentBg={C.blueBg} icon={KPI_ICONS.globe} invert />
                <PremKPI label="CPI" value={fmtINR(totals.cpi)} sub="spend / interested" accent={C.cyan} accentBg={C.cyanBg} icon={KPI_ICONS.globe} invert />
                <PremKPI label="CPS" value={fmtINR(totals.cps)} sub="spend / Won" accent={C.green} accentBg={C.greenBg} icon={KPI_ICONS.globe} invert />
              </div>

              {/* FUNNEL VIEW */}
              <Card
                title="Conversion funnel"
                sub={windowLabel + ' \u2014 leads \u2192 Interested \u2192 Won'}
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 14 }}>
                  <FunnelColumn title="Pipeline" note="what LeadSquared did with the leads" stages={pipelineStages} accent={C.green} />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(146px, 1fr))', gap: 10, alignContent: 'start' }}>
                    {stepTiles.map(s => <StepTile key={s.label} {...s} />)}
                  </div>
                </div>
              </Card>

              <div style={{ height: 16 }} />

              {/* CHARTS -- Marketing Performance agent chart treatment: one hue per series,
                  gradient bar fill, hairline horizontal-only grid, circle legend, no flat fills. */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: 14 }}>
                <Card title="Spend and leads" sub={windowLabel + ' \u2014 by day'} noPad>
                  <div style={{ padding: '12px 16px 6px' }}>
                    <ResponsiveContainer width="100%" height={230}>
                      <ComposedChart data={dailySeries} margin={{ left: 0, right: 8, top: 6, bottom: 0 }}>
                        <defs><BarGrad id="g-lc-spend" color={C.navy} /></defs>
                        <CartesianGrid vertical={false} stroke={C.border} />
                        <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} interval={dayTickInterval} />
                        <YAxis yAxisId="l" tick={axis} axisLine={false} tickLine={false} width={62} tickFormatter={v => '\u20B9' + fmtN(v)} />
                        <YAxis yAxisId="r" orientation="right" tick={axis} axisLine={false} tickLine={false} allowDecimals={false} width={40} />
                        <Tooltip content={<BrandTooltip />} cursor={{ fill: 'rgba(31,60,132,0.04)' }} />
                        <Legend wrapperStyle={{ fontSize: 11, fontFamily: FONT }} iconType="circle" />
                        <Bar yAxisId="l" dataKey="Spend" fill={barFill('g-lc-spend')} radius={BAR_RADIUS} barSize={10} />
                        <Line yAxisId="r" type="monotone" dataKey="Leads" stroke={C.cyan} strokeWidth={2.4} dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                <Card title="Cost and conversion" sub={windowLabel + ' \u2014 CPL against Won rate'} noPad>
                  <div style={{ padding: '12px 16px 6px' }}>
                    <ResponsiveContainer width="100%" height={230}>
                      <ComposedChart data={dailySeries} margin={{ left: 0, right: 8, top: 6, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke={C.border} />
                        <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} interval={dayTickInterval} />
                        <YAxis yAxisId="l" tick={axis} axisLine={false} tickLine={false} width={62} tickFormatter={v => '\u20B9' + fmtN(v)} />
                        <YAxis yAxisId="r" orientation="right" tick={axis} axisLine={false} tickLine={false} unit="%" width={46} />
                        <Tooltip content={<BrandTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 11, fontFamily: FONT }} iconType="circle" />
                        <Line yAxisId="l" type="monotone" dataKey="CPL" stroke={C.navy} strokeWidth={2.4} strokeDasharray="4 3" dot={false} connectNulls />
                        <Line yAxisId="r" type="monotone" dataKey="Won rate" stroke={C.green} strokeWidth={2.4} dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                <Card title="Interested and Won" sub={windowLabel + ' \u2014 by day'} noPad>
                  <div style={{ padding: '12px 16px 6px' }}>
                    <ResponsiveContainer width="100%" height={230}>
                      <ComposedChart data={dailySeries} margin={{ left: 0, right: 8, top: 6, bottom: 0 }}>
                        <defs>
                          <BarGrad id="g-lc-int" color={C.cyan} />
                          <BarGrad id="g-lc-won" color={C.green} />
                        </defs>
                        <CartesianGrid vertical={false} stroke={C.border} />
                        <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} interval={dayTickInterval} />
                        <YAxis tick={axis} axisLine={false} tickLine={false} allowDecimals={false} width={40} />
                        <Tooltip content={<BrandTooltip />} cursor={{ fill: 'rgba(31,60,132,0.04)' }} />
                        <Legend wrapperStyle={{ fontSize: 11, fontFamily: FONT }} iconType="circle" />
                        <Bar dataKey="Interested" fill={barFill('g-lc-int')} radius={BAR_RADIUS} barSize={9} />
                        <Bar dataKey="Won" fill={barFill('g-lc-won')} radius={BAR_RADIUS} barSize={9} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                <Card title="Where the leads come from" sub={windowLabel + ' \u2014 top ' + sourceRanked.length + ' sources by lead volume'}>
                  {sourceRanked.length === 0 ? (
                    <div className={styles.empty}>No leads in this window.</div>
                  ) : (
                    <RankedBars
                      data={sourceRanked} labelKey="source" showRank
                      max={sourceRanked[0].count} total={sourceTotal}
                      colorFn={i => sourceColor(sourceRanked[i] && sourceRanked[i].source)}
                    />
                  )}
                </Card>
              </div>

              <div style={{ height: 16 }} />
              <Card title="Program efficiency" sub={windowLabel + ' \u2014 paid only. Right = more Won, lower = cheaper per Won, bubble = spend. Faded = low volume'}>
                {programEfficiency.length === 0 ? (
                  <div className={styles.empty}>No paid program has both spend and a Won in this window.</div>
                ) : (
                  <div style={{ height: 300 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 16, right: 24, bottom: 8, left: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                        <XAxis type="number" dataKey="won" name="Won" tick={{ fontSize: 11, fill: C.muted }} tickLine={false} axisLine={false} />
                        <YAxis type="number" dataKey="cps" name="Cost per won" tick={{ fontSize: 11, fill: C.muted }} tickLine={false} axisLine={false} tickFormatter={v => '\u20b9' + Math.round(v / 1000) + 'k'} width={52} />
                        <ZAxis type="number" dataKey="spend" range={[160, 1400]} />
                        <Tooltip content={<ProgramEfficiencyTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                        <Scatter data={programEfficiency}>
                          {programEfficiency.map((d, i) => <Cell key={d.name} fill={PROGRAM_COLORS[i % PROGRAM_COLORS.length]} fillOpacity={d.lowVolume ? 0.35 : 0.85} />)}
                          <LabelList dataKey="name" position="top" style={{ fontSize: 10.5, fill: C.muted, fontFamily: FONT }} />
                        </Scatter>
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>

              <div style={{ height: 16 }} />
              {/* COHORT VIEW -- lead arrival cohorts, followed through to Won. */}
              <Card
                title="Cohort view"
                sub={windowLabel + ' \u2014 every lead grouped by when it arrived, followed to Won'}
                action={<Dropdown label="Cohort" options={['Month', 'Week']} value={cohortBy} onChange={setCohortBy} minWidth={110} />}
              >
                {cohortRows.length === 0 ? (
                  <div className={styles.empty}>No leads in this window.</div>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={215}>
                      <ComposedChart data={cohortChart} margin={{ left: 0, right: 8, top: 6, bottom: 0 }}>
                        <defs>
                          <BarGrad id="g-lc-coh-l" color={C.cyan} />
                          <BarGrad id="g-lc-coh-i" color={C.blue} />
                        </defs>
                        <CartesianGrid vertical={false} stroke={C.border} />
                        <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
                        <YAxis yAxisId="l" tick={axis} axisLine={false} tickLine={false} allowDecimals={false} width={46} />
                        <YAxis yAxisId="r" orientation="right" tick={axis} axisLine={false} tickLine={false} unit="%" width={46} />
                        <Tooltip content={<BrandTooltip />} cursor={{ fill: 'rgba(31,60,132,0.04)' }} />
                        <Legend wrapperStyle={{ fontSize: 11, fontFamily: FONT }} iconType="circle" />
                        <Bar yAxisId="l" dataKey="Leads" fill={barFill('g-lc-coh-l')} radius={BAR_RADIUS} barSize={14} />
                        <Bar yAxisId="l" dataKey="Interested" fill={barFill('g-lc-coh-i')} radius={BAR_RADIUS} barSize={14} />
                        <Line yAxisId="r" type="monotone" dataKey="Won rate" stroke={C.green} strokeWidth={2.4} dot={{ r: 2.5 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                    <div style={{ overflowX: 'auto', marginTop: 14 }}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>{cohortBy === 'Week' ? 'Week of' : 'Month'}</th>
                            <th>Spend</th><th>Leads</th><th>Interested</th><th>Won</th>
                            <th>Interested %</th><th>Won % of interested</th><th>Won % of leads</th>
                            <th>CPL</th><th>CPS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cohortRows.map(r => (
                            <tr key={r.key}>
                              <td style={{ fontWeight: 800 }}>{r.label}</td>
                              <td>{fmtINR(r.spend)}</td><td>{fmtN(r.leads)}</td>
                              <td>{fmtN(r.interested)}</td><td>{fmtN(r.won)}</td>
                              <td style={{ fontWeight: 700, background: tint(C.cyan, 0.06 + 0.34 * Math.min(1, (r.intRate || 0) / cohortMax.intRate)) }}>{fmtPct1(r.intRate)}</td>
                              <td style={{ fontWeight: 700, background: tint(C.green, 0.06 + 0.34 * Math.min(1, (r.wonRate || 0) / cohortMax.wonRate)) }}>{fmtPct1(r.wonRate)}</td>
                              <td style={{ fontWeight: 700, background: tint(C.navy, 0.06 + 0.34 * Math.min(1, (r.endRate || 0) / cohortMax.endRate)) }}>{fmtPct1(r.endRate)}</td>
                              <td>{fmtINR(r.cpl)}</td><td>{fmtINR(r.cps)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className={styles.note}>
                      Read a rate column down, not a row across. Cohorts are keyed on the day the lead arrived, so
                      the newest {cohortBy === 'Week' ? 'week' : 'month'} has had the least time to convert and its
                      Won rates are a floor rather than a verdict. Cell shading is scaled to the strongest cohort
                      currently in view. Spend sits on the ad-day the lead came from, so CPL and CPS stay inside the
                      cohort instead of being smeared across the whole window.
                    </p>
                  </>
                )}
              </Card>

              <div style={{ height: 16 }} />

              <Card
                action={
                  <div style={{ display: 'flex', gap: 6 }}>
                    {TABLE_TABS.map(([v, l]) => (
                      <button key={v} onClick={() => setTableDim(v)} style={{ padding: '7px 14px', borderRadius: 8, border: '0.5px solid ' + (tableDim === v ? C.navy : 'var(--card-border)'), background: tableDim === v ? C.navy : 'var(--card)', color: tableDim === v ? '#fff' : 'var(--text)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>{l}</button>
                    ))}
                  </div>
                }
              >
                {sectionTitle('By ' + GROUP_LABEL[tableDim].toLowerCase(), windowLabel + (tableDim === 'source' ? ' \u2014 click a source to see its sub sources, then a sub source to see its campaigns' : (tableDim === 'program' ? ' \u2014 campaigns grouped by keywords in the campaign name (first match wins, edit in Settings > Data). Click a program for its Paid and Non-Paid split, then for its campaigns. Unmatched campaigns show as Other.' : '')))}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    <Button
                      size="sm" variant="secondary" onClick={() => setSlackOpen(true)}
                      icon={<SlackIcon size={13} />}
                    >Send to Slack</Button>
                    <ExportButton data={exportRows} rawData={exportRawRows} filename={'leverage_careers_' + tableDim} dashboardId="leverage_careers" hideSlack />
                  </div>
                </div>
                <div ref={tableRef} style={{ overflowX: 'auto' }}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        {[
                          ['label', GROUP_LABEL[tableDim]],
                          ['spend', 'Spend'], ['leads', 'Leads'], ['interested', 'Interested'], ['won', 'Won (Funnel)'], ['wonSnapshot', 'Won (Snapshot)'],
                          ['cpl', 'CPL'], ['cpi', 'CPI'], ['cps', 'CPS'],
                        ].map(([key, label]) => (
                          <th key={key} onClick={() => toggleSort(key)} style={{ cursor: 'pointer', userSelect: 'none' }}>
                            {label}{tableSort.key === key ? (tableSort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ fontWeight: 800 }}>
                        <td>TOTAL</td>
                        <td>{fmtINR(tableTotals.spend)}</td><td>{fmtN(tableTotals.leads)}</td><td>{fmtN(tableTotals.interested)}</td><td>{fmtN(tableTotals.won)}</td><td>{fmtN(tableTotals.wonSnapshot)}</td>
                        <td>{fmtINR(tableTotals.cpl)}</td><td>{fmtINR(tableTotals.cpi)}</td><td>{fmtINR(tableTotals.cps)}</td>
                      </tr>
                      {(treeItems ? treeItems.length === 0 : tableRows.length === 0) ? (
                        <tr><td colSpan={9} className={styles.empty}>No data in this window.</td></tr>
                      ) : treeItems ? treeItems.map(it => (
                        <tr key={it.key} style={it.kind === 'band' ? { fontWeight: 800, background: 'var(--navy-tint)' } : (it.kind === 'campaign' ? { color: 'var(--text2)' } : undefined)}>
                          <td
                            onClick={it.toggle}
                            style={{ cursor: it.toggle ? 'pointer' : 'default', paddingLeft: 12 + (it.depth || 0) * 20, fontWeight: it.kind === 'band' ? 800 : (it.kind === 'source' ? 700 : 500) }}
                          >
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                              {it.toggle ? <TreeChevron open={it.open} /> : null}
                              {it.label}
                              {it.lowVolume ? <span title="Under 10 Won or under 1,000 leads: read the rates with care" style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: C.muted, border: '0.5px solid var(--card-border)', borderRadius: 99, padding: '1px 7px' }}>low volume</span> : null}
                            </span>
                          </td>
                          <td>{fmtINR(it.spend)}</td><td>{fmtN(it.leads)}</td><td>{fmtN(it.interested)}</td><td>{fmtN(it.won)}</td><td>{fmtN(it.wonSnapshot)}</td>
                          <td>{fmtINR(it.cpl)}</td><td>{fmtINR(it.cpi)}</td><td>{fmtINR(it.cps)}</td>
                        </tr>
                      )) : tableRows.map(r => (
                        <tr key={r.key}>
                          <td>{labelForDim(tableDim, r.label)}</td>
                          <td>{fmtINR(r.spend)}</td><td>{fmtN(r.leads)}</td><td>{fmtN(r.interested)}</td><td>{fmtN(r.won)}</td><td>{fmtN(r.wonSnapshot)}</td>
                          <td>{fmtINR(r.cpl)}</td><td>{fmtINR(r.cpi)}</td><td>{fmtINR(r.cps)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>

      {compareOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setCompareOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', borderRadius: 16, width: 'min(1000px, 96vw)', maxHeight: '92vh', overflowY: 'auto', padding: 24, fontFamily: FONT, boxShadow: '0 24px 60px rgba(0,0,0,0.28)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>Compare periods</div>
                <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>Leverage Careers — breakdown by campaign (Month/Day aren't meaningful when the comparison itself is across time)</div>
              </div>
              <button onClick={() => setCompareOpen(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.muted, fontSize: 20, lineHeight: 1 }}>×</button>
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
              <Dropdown label="Compare to" options={['Previous period', 'Same period last year', 'Custom']} value={compareMode === 'prev' ? 'Previous period' : compareMode === 'yoy' ? 'Same period last year' : 'Custom'} onChange={v => setCompareMode(v === 'Previous period' ? 'prev' : v === 'Same period last year' ? 'yoy' : 'custom')} minWidth={190} />
            </div>
            {compareMode === 'custom' && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
                <RangeField label="This" from={cFromA} to={cToA} open={cPick === 'a'} onOpen={() => setCPick(cPick === 'a' ? null : 'a')} onClose={() => setCPick(null)} onChange={(f, t) => { setCFromA(f); setCToA(t); if (f && t) setCPick(null) }} />
                <RangeField label="Vs" from={cFromB} to={cToB} open={cPick === 'b'} onOpen={() => setCPick(cPick === 'b' ? null : 'b')} onClose={() => setCPick(null)} onChange={(f, t) => { setCFromB(f); setCToB(t); if (f && t) setCPick(null) }} />
              </div>
            )}
            <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 14 }}>
              This: {compareSpanA.from} → {compareSpanA.to} &nbsp;·&nbsp; Vs: {compareSpanB.from} → {compareSpanB.to}
            </div>

            {compareLoading && !compareRowsA ? (
              <InlineLoader label="Loading comparison data" />
            ) : compareError ? (
              <div className={styles.empty}>{compareError}</div>
            ) : (
              <>
                <div style={{ background: 'var(--navy-tint)', border: '0.5px solid var(--card-border)', borderRadius: 12, padding: '14px 16px', marginBottom: 16, fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{compareResult.verdict}</div>
                <div className="lq-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
                  <PremKPI label="SPEND" value={fmtINR(compareResult.a.spend)} sub={'vs ' + fmtINR(compareResult.b.spend)} delta={deltaPct(compareResult.a.spend, compareResult.b.spend)} invert accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.total} />
                  <PremKPI label="LEADS" value={fmtN(compareResult.a.leads)} sub={'vs ' + fmtN(compareResult.b.leads)} delta={deltaPct(compareResult.a.leads, compareResult.b.leads)} accent={C.cyan} accentBg={C.cyanBg} icon={KPI_ICONS.bot} />
                  <PremKPI label="INTERESTED" value={fmtN(compareResult.a.interested)} sub={'vs ' + fmtN(compareResult.b.interested)} delta={deltaPct(compareResult.a.interested, compareResult.b.interested)} accent={C.green} accentBg={C.greenBg} icon={KPI_ICONS.ai} />
                  <PremKPI label="WON" value={fmtN(compareResult.a.won)} sub={'vs ' + fmtN(compareResult.b.won)} delta={deltaPct(compareResult.a.won, compareResult.b.won)} accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.total} />
                </div>

                <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, marginBottom: 8 }}>What's driving it — by campaign, ranked by |Δ Won|</div>
                <div style={{ overflowX: 'auto', marginBottom: 16 }}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Campaign</th><th>Spend (this)</th><th>Spend (vs)</th>
                        <th>Leads (this)</th><th>Leads (vs)</th>
                        <th>Won (this)</th><th>Won (vs)</th><th>Δ Won</th>
                      </tr>
                    </thead>
                    <tbody>
                      {compareResult.rows.slice(0, 30).map(r => (
                        <tr key={r.name}>
                          <td>{r.name}</td>
                          <td>{fmtINR(r.a.spend)}</td><td>{fmtINR(r.b.spend)}</td>
                          <td>{fmtN(r.a.leads)}</td><td>{fmtN(r.b.leads)}</td>
                          <td>{fmtN(r.a.won)}</td><td>{fmtN(r.b.won)}</td>
                          <td style={{ color: r.dWon >= 0 ? C.green : C.navy, fontWeight: 700 }}>{r.dWon >= 0 ? '+' : ''}{r.dWon}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {compareResult.rows.length > 30 && (
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>Showing top 30 of {compareResult.rows.length} campaigns by |Δ Won| — every one is in the export below.</div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <ExportButton data={compareExportRows} filename="leverage_careers_compare" dashboardId="leverage_careers" />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <SlackReportPanel
        open={slackOpen}
        onClose={() => setSlackOpen(false)}
        versions={CAREERS_REPORT_VERSIONS}
        buildContext={buildCareersContext}
        captureFiles={captureCareersFiles}
        dashboardId="leverage_careers"
        filename={'leverage_careers_' + tableDim}
        rowCount={tableRows.length}
      />
    </div>
  )
}
