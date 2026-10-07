// Leverage Careers' Slack report V3 -- the figures that matter, by program.
// Two messages: MTD by program and Last Day by program. Paid sources only (no
// Paid / Non-Paid split, no per-channel breakdown), five figures per program --
// Spend, Leads, Interested, CPL, CPI -- and no deltas, vs columns, Won or CPS.
// Never respects the page's filters: the caller hands in every row, tagged with
// its `program` (src/lib/careersPrograms.js). Programs come from keywords in the
// campaign name; campaigns that match nothing are left out unless they carry spend.
//
// This file is permanent once shipped, like every other report version: edit a new
// file, not this one.
import { money } from './pmReport'
import { comparableSpan, isPaidSource } from './careersReportV2'

const DASH = '—'
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dayLabelOf = iso => { const [, m, d] = iso.split('-'); return Number(d) + ' ' + MN[Number(m) - 1] }
const nfmt = n => Number(n || 0).toLocaleString('en-IN')
const inr = n => (n == null ? DASH : '₹' + Math.round(n).toLocaleString('en-IN'))
const istToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

function agg(rows) {
  const g = { spend: 0, leads: 0, interested: 0 }
  rows.forEach(r => { g.spend += r.spend; g.leads += r.leads; g.interested += r.interested })
  g.cpl = g.leads > 0 && g.spend > 0 ? g.spend / g.leads : null
  g.cpi = g.interested > 0 && g.spend > 0 ? g.spend / g.interested : null
  return g
}
const hasData = g => g.spend > 0 || g.leads > 0 || g.interested > 0

// TOTAL first, then programs by spend (leads break a tie), Other always last.
function programTable(rows) {
  const by = new Map()
  rows.forEach(r => { const k = r.program || 'Other'; if (!by.has(k)) by.set(k, []); by.get(k).push(r) })
  // Other (campaigns matching no program) is hidden while it carries no spend: a
  // zero-spend row says nothing. The moment it has spend it shows, so money is never hidden.
  const list = [...by.entries()].map(([name, rs]) => ({ name, rs, g: agg(rs) }))
    .filter(x => hasData(x.g) && !(x.name === 'Other' && !(x.g.spend > 0)))
  list.sort((a, b) => (a.name === 'Other') - (b.name === 'Other') || (b.g.spend - a.g.spend) || (b.g.leads - a.g.leads))
  const tot = agg(list.flatMap(x => x.rs)) // TOTAL always equals the rows shown
  const line = (label, g) => [label, money(g.spend), nfmt(g.leads), nfmt(g.interested), inr(g.cpl), inr(g.cpi)]
  return {
    empty: list.length === 0,
    table: {
      columns: ['Program', 'Spend', 'Leads', 'Interested', 'CPL', 'CPI'],
      rows: [line('TOTAL', tot), ...list.map(x => line(x.name, x.g))],
      strongRows: [0],
      wrapFirst: true,
    },
    total: tot,
  }
}

// rows: every row (all sources), tagged with `program`, NOT filtered.
export function buildCareersV3Ctx({ rows, win, preset, windowLabel }) {
  const span = comparableSpan(win, preset)
  const paid = (rows || []).filter(r => isPaidSource(r.source))
  const cur = paid.filter(r => r.date >= span.cur.from && r.date <= span.cur.to)
  const dates = [...new Set(cur.filter(r => hasData(agg([r]))).map(r => r.date))].sort()
  const last = dates.length ? dates[dates.length - 1] : null
  const y = (() => { const p = istToday().split('-').map(Number); const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] - 1)); return d.toISOString().slice(0, 10) })()
  return {
    v3: {
      periodLabel: windowLabel + (span.clipped ? ' (complete days, ' + dayLabelOf(span.cur.from) + ' → ' + dayLabelOf(span.cur.to) + ')' : ''),
      mtd: programTable(cur),
      day: last ? { label: dayLabelOf(last), isYesterday: last === y, ...programTable(cur.filter(r => r.date === last)) } : null,
    },
  }
}

const NOTE = '_Paid sources only. Programs are matched from keywords in the campaign name; campaigns that match none are left out unless they have spend._'

function buildCareersV3(ctx) {
  const v = (ctx && ctx.v3) || null
  const msgs = []
  const test = ctx && ctx.isTest ? ':test_tube: *Test post* -- sent to the test channel to check formatting.' : null
  if (v && !v.mtd.empty) {
    msgs.push({
      key: 'mtd_program', label: 'MTD by program',
      text: [test, '*:bar_chart: Leverage Careers - MTD by Program*', v.periodLabel, '', NOTE].filter(x => x != null).join('\n'),
      table: v.mtd.table,
    })
  }
  if (v && v.day && !v.day.empty) {
    msgs.push({
      key: 'yday_program', label: 'Last Day by program',
      text: [test, '*:calendar: Leverage Careers - Last Day by Program*', '*' + (v.day.isYesterday ? 'Yesterday · ' : 'Latest day with data · ') + v.day.label + '*', '', NOTE].filter(x => x != null).join('\n'),
      table: v.day.table,
    })
  }
  return msgs
}

export const CAREERS_V3 = {
  id: 'careers_v3',
  code: 'V3',
  msgKeys: ['mtd_program', 'yday_program'],
  name: 'Programs — MTD and Last Day',
  tagline: 'Two messages: month to date by program, and yesterday by program.',
  what: [
    'Message 1 — MTD by program: Spend, Leads, Interested, CPL, CPI',
    'Message 2 — Last Day by program: the same five figures for yesterday',
    'Paid sources only, no channel split, no deltas, no Won or CPS',
    'Ignores any filter set on the page',
  ],
  build: buildCareersV3,
}
