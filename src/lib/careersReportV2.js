// Leverage Careers' Slack report V2 -- the same three-message shape as Overall's
// V2 (src/lib/pmReport.js buildV2): MTD Performance, Last Day Performance and Day
// on Day Performance, every metric followed by a vs column that carries the
// movement AND the figure it moved from, with the table banded TOTAL / PAID
// CHANNELS (+ its sources) / NON-PAID CHANNELS (+ its sources).
//
// Metrics are the Careerv2 set -- Spend, Leads, Interested, Won (Funnel),
// Won (Snapshot), CPL, CPI, CPS. Won (Snapshot) is a separate snapshot-view figure
// and is never added to or mixed with Won (Funnel). CPL/CPI/CPS divide the group's
// own spend by its own leads / interested / Won (Funnel).
//
// This file is permanent once shipped, like every other report version: edit a new
// file, not this one.
import { money } from './pmReport'

const DASH = '—'
const DOT = ' · '
// Same paid list as OverallDashboard.jsx's PAID_SOURCE_KEYS -- one definition of
// paid across the two pages.
const PAID_SOURCE_KEYS = ['facebook', 'google', 'affiliate', 'linkedin', 'bing', 'remarketing']
export const isPaidSource = label => PAID_SOURCE_KEYS.includes(String(label || '').trim().toLowerCase())

const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dayLabelOf = iso => { const [, m, d] = iso.split('-'); return Number(d) + ' ' + MN[Number(m) - 1] }
const nfmt = n => Number(n || 0).toLocaleString('en-IN')
const fmtINR = n => n == null ? DASH : '₹' + Math.round(n).toLocaleString('en-IN')
const abs1 = n => Math.abs(n).toFixed(1) + '%'
const pctOf = (now, was) => (was > 0 ? ((now - was) / was) * 100 : null)

function shiftDate(iso, days) {
  const p = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(p[0], p[1] - 1, p[2]))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}
function daysBetween(a, b) {
  const pa = a.split('-').map(Number), pb = b.split('-').map(Number)
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000)
}

const istToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

// The one rule for "what is this period read against", shared by this report and
// the page's Compare modal so a delta can never compare unequal stretches:
//   1. Complete days only. Today is still filling in, so a window that reaches
//      today is clipped to yesterday -- otherwise a partial day sits against a full
//      one and every delta reads low.
//   2. MTD reads against the SAME DAYS of the month before (1-4 Oct against 1-4 Sep,
//      never against all of September); anything else reads against the
//      same-length window immediately before it.
export function comparableSpan(win, preset) {
  const today = istToday()
  const y = shiftDate(today, -1)
  let cur = win
  let clipped = false
  if (win.to >= today && y >= win.from) { cur = { from: win.from, to: y }; clipped = true }
  let prev
  if (preset === 'mtd') {
    const [yr, m, d] = cur.from.split('-').map(Number)
    const pm = m === 1 ? 12 : m - 1
    const py = m === 1 ? yr - 1 : yr
    const lastOfPrev = new Date(Date.UTC(py, pm, 0)).getUTCDate()
    const toDay = Math.min(Number(cur.to.split('-')[2]), lastOfPrev)
    const pad = n => String(n).padStart(2, '0')
    prev = { from: py + '-' + pad(pm) + '-' + pad(d), to: py + '-' + pad(pm) + '-' + pad(toDay) }
  } else {
    const len = daysBetween(cur.from, cur.to) + 1
    prev = { from: shiftDate(cur.from, -len), to: shiftDate(cur.from, -1) }
  }
  return { cur, prev, clipped }
}

// fetchFrom also reaches one day before the window so the first day of Day on Day
// has a day to be read against.
export function careersV2Windows(win, preset) {
  const { cur, prev } = comparableSpan(win, preset)
  const dayBefore = shiftDate(cur.from, -1)
  return { prev, fetchFrom: prev.from < dayBefore ? prev.from : dayBefore }
}

function agg(rows) {
  const g = { spend: 0, leads: 0, interested: 0, won: 0, wonSnapshot: 0 }
  rows.forEach(r => { g.spend += r.spend; g.leads += r.leads; g.interested += r.interested; g.won += r.won; g.wonSnapshot += r.wonSnapshot })
  g.cpl = g.leads > 0 && g.spend > 0 ? g.spend / g.leads : null
  g.cpi = g.interested > 0 && g.spend > 0 ? g.spend / g.interested : null
  g.cps = g.won > 0 && g.spend > 0 ? g.spend / g.won : null
  return g
}
const inRange = (rows, from, to) => rows.filter(r => r.date >= from && r.date <= to)
const hasData = g => g.spend > 0 || g.leads > 0 || g.interested > 0 || g.won > 0 || g.wonSnapshot > 0

// TOTAL, the paid band and its sources, then the non-paid band and its sources --
// every row carrying its own previous-period figures.
function entries(curRows, prevRows) {
  const sources = new Set()
  curRows.concat(prevRows).forEach(r => sources.add(r.source))
  const per = [...sources].map(s => ({ label: s, g: { ...agg(curRows.filter(r => r.source === s)), prev: agg(prevRows.filter(r => r.source === s)) } }))
    .filter(x => hasData(x.g) || hasData(x.g.prev))
  const band = (label, keep) => {
    const g = { ...agg(curRows.filter(keep)), prev: agg(prevRows.filter(keep)) }
    return hasData(g) || hasData(g.prev) ? { label, strong: true, g } : null
  }
  const out = []
  const total = band('TOTAL', () => true)
  if (total) out.push(total)
  const paidBand = band('PAID CHANNELS', r => isPaidSource(r.source))
  if (paidBand) out.push(paidBand)
  per.filter(x => isPaidSource(x.label)).sort((a, b) => b.g.spend - a.g.spend).forEach(x => out.push({ ...x, strong: false }))
  const freeBand = band('NON-PAID CHANNELS', r => !isPaidSource(r.source))
  if (freeBand) out.push(freeBand)
  per.filter(x => !isPaidSource(x.label)).sort((a, b) => b.g.leads - a.g.leads).forEach(x => out.push({ ...x, strong: false }))
  return { rows: out, totalSpend: total ? total.g.spend : 0 }
}

// Everything the three messages read, built from rows that already reach back to
// the previous window. `rows` are the page's row shape, already filtered.
export function buildCareersV2Ctx({ rows, win, preset, windowLabel, filterLine, scopeLine, hasPrevData }) {
  const span = comparableSpan(win, preset)
  const prev = span.prev
  const cur = inRange(rows, span.cur.from, span.cur.to)
  const prv = inRange(rows, prev.from, prev.to)
  const mtd = entries(cur, prv)
  const total = mtd.rows.length ? mtd.rows[0].g : null

  const fmtDay = iso => dayLabelOf(iso)
  const dates = [...new Set(cur.map(r => r.date))].sort()
  const dayEntry = d => {
    const dayRows = cur.filter(r => r.date === d)
    const before = shiftDate(d, -1)
    const prevDayRows = rows.filter(r => r.date === before)
    return { dayRows, prevDayRows, before }
  }
  let day = null
  const withData = dates.filter(d => hasData(agg(cur.filter(r => r.date === d))))
  if (withData.length) {
    const d = withData[withData.length - 1]
    const { dayRows, prevDayRows, before } = dayEntry(d)
    const b = entries(dayRows, prevDayRows)
    const y = shiftDate(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }), -1)
    day = {
      label: dayLabelOf(d), prevLabel: dayLabelOf(before), isYesterday: d === y,
      rows: b.rows, totalSpend: b.totalSpend,
      now: b.rows.length ? b.rows[0].g : null, prev: b.rows.length ? b.rows[0].g.prev : null,
    }
  }
  const dow = withData.map(d => {
    const { dayRows, prevDayRows } = dayEntry(d)
    return { label: dayLabelOf(d), key: d, g: { ...agg(dayRows), prev: agg(prevDayRows) } }
  }).reverse().slice(0, 31)

  return {
    grpByLabel: 'Source', rowCount: mtd.rows.length,
    periodLabel: span.clipped ? windowLabel + ' (complete days, ' + fmtDay(span.cur.from) + ' \u2192 ' + fmtDay(span.cur.to) + ')' : windowLabel,
    prevLabel: fmtDay(prev.from) + ' → ' + fmtDay(prev.to), prevIsCalendarShift: preset === 'mtd',
    filterLine, scopeLine, hasPrev: hasPrevData !== false,
    now: total, prev: total ? total.prev : null,
    cmpRows: mtd.rows, cmpTotalSpend: mtd.totalSpend, day, dow: { rows: dow, periodLabel: windowLabel },
  }
}

// -- Formatting + table (mirrors pmReport.js v2KpiLines / v2Vs / v2CmpTable) ---

const MONTH_KPIS = [
  { label: 'Spend', key: 'spend' },
  { label: 'Leads', key: 'leads' },
  { label: 'Interested', key: 'interested' },
  { label: 'CPL', key: 'cpl' },
  { label: 'CPI', key: 'cpi' },
  { label: 'Won (Funnel)', key: 'won' },
  { label: 'Won (Snapshot)', key: 'wonSnapshot' },
  { label: 'CPS', key: 'cps' },
]
// A single day is a small number, and Won lands days or weeks after the lead, so
// day on day it is noise, not news -- same rule as Overall's V2.
const DAY_KPIS = MONTH_KPIS.slice(0, 5)
const TABLE_METRICS = [
  { key: 'spend', label: 'Spend' },
  { key: 'leads', label: 'Leads' },
  { key: 'interested', label: 'Interested' },
  { key: 'won', label: 'Won' },
  { key: 'cpl', label: 'CPL' },
]

function fmtVal(key, v) {
  if (v == null || !isFinite(Number(v))) return DASH
  if (key === 'spend') return money(v)
  if (key === 'cpl' || key === 'cpi' || key === 'cps') return fmtINR(v)
  return nfmt(v)
}
const chip = (d, was) => {
  if (d == null) return 'no comparable period'
  const arrow = Math.abs(d) < 0.05 ? '– flat' : (d >= 0 ? '▲ ' : '▼ ') + abs1(d)
  return was == null ? arrow : arrow + ' vs ' + was
}
function kpiLines(now, prev, keys) {
  if (!now) return []
  return keys.map(k => {
    const cur = now[k.key]
    if (cur == null) return null
    const was = prev ? prev[k.key] : null
    return '*' + k.label + '*  ' + fmtVal(k.key, cur) + '   ' + chip(pctOf(cur, was), fmtVal(k.key, was))
  }).filter(Boolean)
}
function vsCell(g, key) {
  const p = g.prev || null
  const cur = g[key]
  const was = p ? p[key] : null
  if (cur == null && was == null) return DASH
  const c = Number(cur || 0)
  const w = Number(was || 0)
  if (!(Math.abs(w) > 0)) return Math.abs(c) > 0 ? 'new' : DASH
  const d = pctOf(c, w)
  if (d == null) return DASH
  const move = Math.abs(d) < 0.05 ? 'flat' : (d >= 0 ? '▲ ' : '▼ ') + abs1(d)
  return move + DOT + fmtVal(key, was)
}
function cmpTable(firstCol, list, totalSpend, vsLabel, withShare) {
  const cols = [firstCol]
  TABLE_METRICS.forEach(m => {
    cols.push(m.label)
    if (withShare && m.key === 'spend') cols.push('% of spend')
    cols.push(m.label + ' ' + vsLabel)
  })
  const t = { columns: cols, rows: [], strongRows: [], wrapFirst: true }
  ;(list || []).forEach(e => {
    const g = e.g || {}
    const cells = [e.label]
    TABLE_METRICS.forEach(m => {
      cells.push(fmtVal(m.key, g[m.key]))
      if (withShare && m.key === 'spend') cells.push(totalSpend > 0 ? (((g.spend || 0) / totalSpend) * 100).toFixed(1) + '%' : DASH)
      cells.push(vsCell(g, m.key))
    })
    if (e.strong) t.strongRows.push(t.rows.length)
    t.rows.push(cells)
  })
  return t
}

const testLine = ctx => (ctx.isTest ? ':test_tube: *Test post* -- sent to the test channel to check formatting.' : null)

function buildCareersV2(ctx) {
  const msgs = []
  const vsLast = 'vs ' + (ctx.prevLabel || 'last')
  const one = [
    testLine(ctx),
    '*:bar_chart: Leverage Careers - Summary by ' + ctx.grpByLabel + '*',
    '*MTD Performance*',
    ctx.filterLine,
    '',
    ...kpiLines(ctx.now, ctx.prev, MONTH_KPIS),
    '',
    '_Every movement reads ' + (ctx.periodLabel || 'this period') + ' against ' + (ctx.prevLabel || 'the period before it') + ', '
      + (ctx.prevIsCalendarShift ? 'the same days in the month before it' : 'the same-length window immediately before it')
      + '. The figure after the arrow is what it moved from. Won (Snapshot) is a separate snapshot-view figure, not part of the funnel._',
    '_' + ctx.rowCount + ' rows  ·  every column is in the attached CSV_',
  ]
  msgs.push({ key: 'mtd', label: 'MTD performance', text: one.filter(l => l != null).join('\n'), table: cmpTable('Source', ctx.cmpRows, ctx.cmpTotalSpend, vsLast, true), attach: true })

  const d = ctx.day
  if (d && d.now) {
    const two = [
      '*:calendar: Last Day Performance*',
      '*Yesterday · ' + d.label + '*',
      (d.prevLabel ? 'Against ' + d.prevLabel + ' · ' : '') + (ctx.scopeLine || ''),
      d.isYesterday ? null : '_' + d.label + ' is the most recent day carrying data, so it is the day reported._',
      '',
      ...kpiLines(d.now, d.prev, DAY_KPIS),
      '',
      '_Every movement reads ' + d.label + ' against ' + (d.prevLabel || 'the day before') + '. The figure after the arrow is what it moved from._',
    ]
    msgs.push({ key: 'yday', label: 'Last Day performance', text: two.filter(l => l != null).join('\n'), table: cmpTable('Source', d.rows, d.totalSpend, 'vs ' + (d.prevLabel || 'prev day'), true) })
  }

  const dow = ctx.dow
  if (dow && dow.rows && dow.rows.length) {
    const three = [
      '*:chart_with_upwards_trend: Day on Day Performance*',
      (dow.periodLabel ? dow.periodLabel + ' · ' : '') + dow.rows.length + ' days · newest first',
      ctx.scopeLine || '',
      '',
      '_Each row is one day, and each vs cell is that day against the calendar day before it. A run of the same arrow is a trend; one row on its own is not._',
    ]
    msgs.push({ key: 'dow', label: 'Day on day performance', text: three.filter(l => l != null).join('\n'), table: cmpTable('Date', dow.rows, 0, 'vs prev day', false) })
  }
  return msgs
}

export const CAREERS_V2 = {
  id: 'careers_v2',
  code: 'V2',
  msgKeys: ['mtd', 'yday', 'dow'],
  name: 'Summary + table — MTD, Last Day, day on day',
  tagline: 'Three messages: month to date, yesterday, and every day against the day before.',
  what: [
    'Message 1 — MTD Performance: the KPI stack and the Paid vs Non-Paid native table by Source',
    'Message 2 — Last Day Performance: yesterday, read against the day before it',
    'Message 3 — Day on Day Performance: one row per day, newest first',
    'Every metric column is followed by a vs column carrying the movement AND the figure it moved from',
    'Table image and the all-columns CSV in the thread of message 1',
  ],
  build: buildCareersV2,
}
