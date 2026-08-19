// The CEO's B2C Slack message. One message, not a series.
//
// It is read on a phone. Slack's mobile client wraps a code block instead of
// scrolling it, at roughly thirty monospace characters, so every table below
// is built to fit inside thirty and is measured on the way out. Two rules
// follow from that. No rupee glyph inside a table: the mobile monospace face
// does not carry it and falls back to a proportional one, which pulls the
// column out of line. And one unit for a whole column in any list of parts,
// so Cr never sits above L in the same stack of numbers.
//
// Three periods, always in this order: the last completed day, the month so
// far, and the financial year so far. Every figure is D-1.
//
// Every table that lists parts closes with a Total.
//
// Nothing here names an internal report version. The CEO reads numbers.

const CR = 1e7
const LAKH = 1e5
const WIDTH = 30

// The standing note explaining why P&L and Cash Flow show different numbers
// for the same period. Editable from Settings > Data > "B2C Report Note"
// (app_preferences key b2c_rev_vs_cashflow_note) -- CeoB2CDashboard.jsx reads
// the same preference for the on-page note, and passes it through as
// ctx.revVsCashflowNote so this one edit updates the live page AND both Slack
// reports at once, instead of three copies drifting independently. This
// constant is only the fallback for whenever nothing has been saved yet.
export const DEFAULT_REV_VS_CASHFLOW_NOTE = 'P&L revenue is recognised on the date a sale is recorded: AC and Leverage One (E2E) net of 10% and 5% deduction respectively for expected future refunds, SR estimated as Deposits × 75% × ₹3.5L. Cash Flow records actual cash moved, whenever it happens, after verification by the finance team.'

function noteMrkdwn(ctx) {
  return ':information_source: *Revenue vs Cash Flow* — ' + ((ctx && ctx.revVsCashflowNote) || DEFAULT_REV_VS_CASHFLOW_NOTE)
}

// Full name for prose, short name for the tables, key into the context.
const LINES = [
  ['SR (Online + Offline)', 'SR', 'sr'],
  ['AC Online', 'AC Online', 'ac'],
  ['Leverage One Online', 'Leverage One Online', 'vas'],
  ['Offline (AC + Leverage One)', 'Offline', 'off']
]
const HEADS = [
  ['Perf. Marketing', 'Marketing', 'pm'],
  ['Operating', 'Operating', 'op'],
  ['Offline (rent + staff)', 'Offline', 'off'],
  ['Corp. Overheads', 'Overheads', 'corp'],
  ['People', 'People', 'people']
]

// With the rupee sign. Prose only.
function money(n) {
  if (n == null || !isFinite(n)) return '\u2014'
  const a = Math.abs(n)
  const sg = n < 0 ? '-' : ''
  if (a >= CR) return sg + '\u20B9' + (a / CR).toFixed(2) + ' Cr'
  if (a >= LAKH) return sg + '\u20B9' + (a / LAKH).toFixed(2) + ' L'
  return sg + '\u20B9' + Math.round(a).toLocaleString('en-IN')
}

// A movement, where the sign is the whole point.
function signed(n) {
  if (n == null || !isFinite(n)) return '\u2014'
  return (n > 0 ? '+' : '') + money(n)
}

// Without it. Tables only, ASCII only, so the column holds on every device.
function amt(n) {
  if (n == null || !isFinite(n)) return '-'
  const a = Math.abs(n)
  const sg = n < 0 ? '-' : ''
  if (a >= CR) return sg + (a / CR).toFixed(2) + ' Cr'
  if (a >= LAKH) return sg + (a / LAKH).toFixed(2) + ' L'
  return sg + String(Math.round(a))
}

// One unit for a whole column, picked off its largest value, so a list of
// parts reads as one stack of numbers rather than a mix of Cr and L.
function scale(values) {
  let mx = 0
  values.forEach(function (v) {
    if (v != null && isFinite(v) && Math.abs(v) > mx) mx = Math.abs(v)
  })
  if (mx >= CR) return { d: CR, u: ' Cr' }
  if (mx >= LAKH) return { d: LAKH, u: ' L' }
  return { d: 1, u: '' }
}

function at(n, s) {
  if (n == null || !isFinite(n)) return '-'
  if (s.d === 1) return String(Math.round(n))
  return (n / s.d).toFixed(2) + s.u
}

function pct(part, whole) {
  if (part == null || !whole) return null
  return (part / whole * 100).toFixed(1) + '%'
}

function margin(net, rev) {
  if (net == null || !rev) return '\u2014'
  return (net / rev * 100).toFixed(1) + '%'
}

function padEnd(s, n) {
  s = String(s)
  return s.length >= n ? s : s + ' '.repeat(n - s.length)
}

function padStart(s, n) {
  s = String(s)
  return s.length >= n ? s : ' '.repeat(n - s.length) + s
}

function lay(head, rows, gap) {
  const w = head.map(function (h, i) {
    return rows.reduce(function (m, r) {
      const v = r[i] == null ? '' : String(r[i])
      return v.length > m ? v.length : m
    }, String(h).length)
  })
  const fmt = function (r) {
    return r.map(function (cv, i) {
      const v = cv == null ? '' : String(cv)
      return i === 0 ? padEnd(v, w[i]) : padStart(v, w[i])
    }).join(' '.repeat(gap)).replace(/\s+$/, '')
  }
  const out = [fmt(head)]
  rows.forEach(function (r) { out.push(fmt(r)) })
  return out
}

// First column left, every other column right, so the last digit of an amount
// sits under the last digit of the one above it. Then close the gap between
// columns until the widest line fits a phone.
function table(head, rows) {
  const over = function (ls) {
    return ls.some(function (l) { return l.length > WIDTH })
  }
  let body = lay(head, rows, 2)
  if (over(body)) body = lay(head, rows, 1)
  return ['```'].concat(body, ['```'])
}

// Line items ranked by how far they moved against the same window last month.
function movers(now, was, defs) {
  if (!was) return []
  return defs.map(function (d) {
    const n = now[d[2]]
    const w = was[d[2]]
    return { label: d[0], now: n, was: w, d: (n == null || w == null) ? null : n - w }
  }).filter(function (x) { return x.d != null && x.d !== 0 })
}

// The closing section. Every line is arithmetic on two windows the page has
// already computed, so nothing here can drift from the tables above it.
function diagnose(c) {
  const rev = c.rev || {}
  const cost = c.cost || {}
  const p = c.prev
  const bad = []
  const fix = []
  if (p && p.net != null && c.net != null) {
    bad.push('\u2022 Net inflow went from ' + money(p.net) + ' in ' + p.label + ' to ' + money(c.net) + ', a swing of ' + signed(c.net - p.net) + '.')
  }
  const dRev = p && p.rev && rev.total != null && p.rev.total != null ? rev.total - p.rev.total : null
  const dCost = p && p.cost && cost.total != null && p.cost.total != null ? cost.total - p.cost.total : null
  if (dRev != null && dCost != null) {
    const tot = Math.abs(dRev) + Math.abs(dCost)
    const share = tot ? Math.round(Math.abs(dCost) / tot * 100) : null
    bad.push('\u2022 Revenue moved ' + signed(dRev) + ', cost moved ' + signed(dCost) + '. ' + (share == null ? '' : share + '% of the movement sits on the cost side.'))
  }
  const up = movers(cost, p ? p.cost : null, HEADS).filter(function (x) { return x.d > 0 }).sort(function (a, b) { return b.d - a.d })
  const easier = movers(cost, p ? p.cost : null, HEADS).filter(function (x) { return x.d < 0 }).sort(function (a, b) { return a.d - b.d })
  const down = movers(rev, p ? p.rev : null, LINES).filter(function (x) { return x.d < 0 }).sort(function (a, b) { return a.d - b.d })
  if (up.length) {
    bad.push('\u2022 The rise is concentrated: ' + up.slice(0, 2).map(function (x) { return x.label + ' ' + signed(x.d) }).join(' and ') + ', against ' + p.label + '.')
  }
  // Naming only the heads that rose would be half the picture, so the largest
  // fall on the cost side is stated in the same breath.
  if (easier.length) {
    bad.push('\u2022 Against that, ' + easier[0].label + ' came down ' + signed(easier[0].d) + '.')
  }
  if (down.length) {
    bad.push('\u2022 The biggest fall on revenue is ' + down[0].label + ', ' + money(down[0].was) + ' down to ' + money(down[0].now) + ' (' + signed(down[0].d) + ').')
  }
  if (c.days && c.negDays != null) {
    bad.push('\u2022 ' + c.negDays + ' of the ' + c.days + ' days so far lost money' + (c.worstDay ? ', the worst ' + c.worstDay.date + ' at ' + money(c.worstDay.net) : '') + '.')
  }
  if (up.length && c.net != null) {
    const t = up[0]
    fix.push('\u2022 ' + t.label + ' back at its ' + p.label + ' level of ' + money(t.was) + ' would put month to date at ' + money(c.net + t.d) + ' instead of ' + money(c.net) + '.')
    if (up.length > 1) {
      fix.push('\u2022 ' + up[0].label + ' and ' + up[1].label + ' both back at that level: ' + money(c.net + up[0].d + up[1].d) + '.')
    }
  }
  const gap = rev.total != null && cost.total != null ? cost.total - rev.total : null
  if (gap != null && gap > 0) {
    fix.push('\u2022 Leaving cost alone, break-even needs revenue of ' + money(cost.total) + ', ' + money(gap) + ' more than booked' + (c.days ? ', about ' + money(gap / c.days) + ' a day across the ' + c.days + ' days so far' : '') + '.')
  }
  const L = []
  if (bad.length) { L.push(''); L.push('*What went wrong*'); L.push.apply(L, bad) }
  if (fix.length) { L.push(''); L.push('*What would close the gap*'); L.push.apply(L, fix) }
  return L
}

function buildB2C(ctx) {
  const c = ctx || {}
  const rev = c.rev || {}
  const cost = c.cost || {}
  const day = c.day
  const ytd = c.ytd
  const L = []
  L.push(':bar_chart: *B2C \u2014 cost, revenue and net inflow*')
  L.push('_Every figure stops at ' + (c.through || 'the last completed day') + '. The day in progress is never counted._')

  // Five money columns will not fit a phone, and a wrapped table is no table
  // at all, so the three periods are split across two narrow ones.
  const A = []
  const B = []
  if (day) {
    A.push(['Day', amt(day.rev), amt(day.cost)])
    B.push(['Day', amt(day.net), margin(day.net, day.rev)])
  }
  A.push(['MTD', amt(rev.total), amt(cost.total)])
  B.push(['MTD', amt(c.net), margin(c.net, rev.total)])
  if (ytd) {
    A.push(['FY', amt(ytd.rev), amt(ytd.cost)])
    B.push(['FY', amt(ytd.net), margin(ytd.net, ytd.rev)])
  }
  L.push('')
  L.push('*Revenue and cost*')
  L.push.apply(L, table(['Period', 'Revenue', 'Cost'], A))
  L.push('*Net inflow and margin*')
  L.push.apply(L, table(['Period', 'Net', 'Margin'], B))
  const win = []
  if (day) win.push('Day = ' + day.date)
  win.push('MTD = ' + (c.monthLabel || ''))
  if (ytd) win.push(ytd.label + ' = ' + ytd.from + ' to ' + ytd.to)
  L.push('_' + win.join(' \u00b7 ') + '. Amounts in rupees._')

  L.push('')
  L.push('*Revenue this month*')
  const rl = LINES.filter(function (d) { return rev[d[2]] != null })
  const rs = scale(rl.map(function (d) { return rev[d[2]] }).concat([rev.total]))
  const R = rl.map(function (d) { return [d[1], at(rev[d[2]], rs), pct(rev[d[2]], rev.total)] })
  R.push(['Total', at(rev.total, rs), '100.0%'])
  L.push.apply(L, table(['Line', 'Amount', 'Share'], R))

  L.push('')
  L.push('*Cost this month, against revenue*')
  const kl = HEADS.filter(function (d) { return cost[d[2]] != null })
  const ks = scale(kl.map(function (d) { return cost[d[2]] }).concat([cost.total]))
  const K = kl.map(function (d) { return [d[1], at(cost[d[2]], ks), pct(cost[d[2]], rev.total)] })
  K.push(['Total', at(cost.total, ks), pct(cost.total, rev.total)])
  L.push.apply(L, table(['Head', 'Amount', '% rev'], K))

  // People is sometimes booked once a month rather than day by day. When that
  // is so the daily totals genuinely do not contain it, and saying so is the
  // only honest way to publish a margin off this sheet.
  if (cost.people == null && c.peopleMonthly != null) {
    L.push('')
    L.push(':warning: People cost is booked monthly in the sheet, not daily: ' + money(c.peopleMonthly) + ' for the month. It sits outside the cost and net inflow above.')
  }
  L.push.apply(L, diagnose(c))
  if (c.isTest) {
    L.push('')
    L.push('_Test send._')
  }
  return [{ key: 'b2c', label: 'B2C \u2014 cost, revenue and net inflow', text: L.join('\n'), attach: true }]
}

// -- native full-particulars table ------------------------------------------
// One native Slack table block (type:'table' -- the same mobile-friendly
// mechanism already proven in ceoBrief.js's ledgerBlocks), every line item
// exactly as the Daily P&L page shows it, Last Day / MTD / YTD columns.
// The page's own Online/Offline subgroup headers are left out here on
// purpose (Slack asked for one continuous list, the page keeps the headers).
const cellText = function (v) { return { type: 'raw_text', text: v == null || v === '' ? '—' : String(v) } }
const cellBold = function (v) { return { type: 'rich_text', elements: [{ type: 'rich_text_section', elements: [{ type: 'text', text: v == null || v === '' ? '—' : String(v), style: { bold: true } }] }] } }
// Plain string back out of a native-table cell, for the Quantum in-app
// preview -- TablePreview renders {columns,rows,strongRows} of plain values,
// it does not know about Slack's raw_text/rich_text cell shapes. A cell built
// by cellBold is always type 'rich_text', so checking the row's first cell's
// type is enough to tell which rows (the Total/EBITDA/Net rows) are bold,
// with no hardcoded row index to keep in sync as line items are added.
const cellPlain = function (c) {
  if (!c) return ''
  if (c.type === 'raw_text') return c.text
  const el = c.elements && c.elements[0] && c.elements[0].elements && c.elements[0].elements[0]
  return el ? el.text : ''
}
const FULL_LINES = [
  ['srOnline', 'SR Online'], ['ac', 'AC Online'], ['vas', 'Leverage One Online'],
  ['srOffline', 'SR Offline'], ['acOffline', 'AC Offline'], ['vasOffline', 'Leverage One Offline'],
]
const FULL_HEADS = [
  ['people', 'People'], ['pm', 'Performance Marketing'], ['op', 'Product Operating Cost (AC, Leverage One)'],
  ['offCost', 'Offline Cost (partner payout + experience centre)'], ['corp', 'Corp. Overheads'],
]
function buildB2CFullTable(ctx) {
  const c = ctx || {}
  const raw = c.raw || {}
  const day = raw.day || {}
  const mtd = raw.mtd || {}
  const fy = raw.fy || {}
  const row = function (key, label, bold) {
    const f = bold ? cellBold : cellText
    return [f(label), f(money(day[key])), f(money(mtd[key])), f(money(fy[key]))]
  }
  const rows = [[cellBold('Line Item'), cellBold('Last Day'), cellBold('MTD'), cellBold(fy.label ? fy.label + ' (YTD)' : 'YTD')]]
  FULL_LINES.forEach(function (d) { rows.push(row(d[0], d[1])) })
  rows.push(row('rev', 'Total Revenue', true))
  FULL_HEADS.forEach(function (d) { rows.push(row(d[0], d[1])) })
  rows.push(row('cost', 'Total Cost', true))
  rows.push(row('ebitdaBeforeCorp', 'EBITDA Before Corp. Overheads', true))
  rows.push(row('net', 'EBITDA After Corp. Overheads', true))
  const cols = rows[0].map(function (_, i) { return i === 0 ? { is_wrapped: true, align: 'left' } : { align: 'right' } })
  const L = []
  L.push(':bar_chart: *B2C - Daily P & L*')
  L.push('_Last completed day, month to date and year to date. ' + (c.through ? 'Through ' + c.through + '.' : '') + '_')
  return [{
    key: 'b2c_full', label: 'B2C — full particulars', attach: true,
    text: L.join('\n'),
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: L[0] } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: L[1] }] },
      { type: 'table', block_id: 'b2c_full_table', column_settings: cols, rows: rows },
      { type: 'context', elements: [{ type: 'mrkdwn', text: noteMrkdwn(c) }] },
    ],
    // Mirrors the blocks above in the plain-value shape the Quantum preview
    // (not the real Slack send, which always takes the blocks array above)
    // knows how to render, so "read the preview, then send" is actually true
    // for this native-table version instead of showing just the header line.
    table: {
      columns: rows[0].map(cellPlain),
      rows: rows.slice(1).map(function (r) { return r.map(cellPlain) }),
      strongRows: rows.slice(1).map(function (r, i) { return r[0].type === 'rich_text' ? i : -1 }).filter(function (i) { return i >= 0 }),
    },
    context: noteMrkdwn(c),
  }]
}

export const B2C_FULL_TABLE_VERSIONS = [{
  id: 'b2c_full',
  code: 'B2C-FULL',
  msgKeys: ['b2c_full'],
  name: 'B2C — full particulars (native table)',
  tagline: 'One native Slack table, every revenue line and cost head, Last Day / MTD / YTD.',
  what: [
    'Every line item exactly as the Daily P&L page shows it -- SR/AC/Leverage One Online, SR/AC/Leverage One Offline, Total Revenue, each cost head, Total Cost, EBITDA Before Corp. Overheads, then EBITDA After Corp. Overheads',
    'Three columns: Last Day, MTD, and year to date',
    'A real Slack table block, not a code block or an image',
    'The same Revenue-vs-Cash-Flow definition note the page carries, so a reader never has to guess why this differs from the Cash Flow report',
  ],
  build: buildB2CFullTable,
}]

// -- native full-particulars table, Daily Cash Flow tab ---------------------
// Same mechanism as buildB2CFullTable above, but reading the Cash Flow tab's
// own line items -- SR is one combined figure there (never split into
// Online/Offline like P&L), and every label is verbatim off the sheet's own
// C2:F2 (revenue) / H2:L2 (cost) header cells, not shortened. No EBITDA row:
// the sheet's own bottom line here is still "Net cash inflow", never renamed.
const CASHFLOW_LINES = [
  ['sr', 'Actuals SR Revenue (Online + Offline)'], ['ac', 'Actuals AC Online Revenue'],
  ['vas', 'Actuals Leverage One Online Revenue'], ['offRev', 'Actuals Offline Revenue (AC + Leverage One)'],
]
const CASHFLOW_HEADS = [
  ['people', 'Actuals People Cost (incl. corporate people)'], ['pm', 'Actuals PM Cost'],
  ['op', 'Actuals Operating Cost (AC + Leverage One)'], ['offCost', 'Actuals Experience Centre Cost + Partner Payout'],
  ['corp', 'Actuals Corp. Overheads'],
]
function buildB2CCashflowTable(ctx) {
  const c = ctx || {}
  const raw = c.raw || {}
  const day = raw.day || {}
  const mtd = raw.mtd || {}
  const fy = raw.fy || {}
  const row = function (key, label, bold) {
    const f = bold ? cellBold : cellText
    return [f(label), f(money(day[key])), f(money(mtd[key])), f(money(fy[key]))]
  }
  const rows = [[cellBold('Line Item'), cellBold('Last Day'), cellBold('MTD'), cellBold(fy.label ? fy.label + ' (YTD)' : 'YTD')]]
  CASHFLOW_LINES.forEach(function (d) { rows.push(row(d[0], d[1])) })
  rows.push(row('rev', 'Total Cash Inflow', true))
  CASHFLOW_HEADS.forEach(function (d) { rows.push(row(d[0], d[1])) })
  rows.push(row('cost', 'Total Cash Outflow', true))
  rows.push(row('net', 'Net cash inflow', true))
  const cols = rows[0].map(function (_, i) { return i === 0 ? { is_wrapped: true, align: 'left' } : { align: 'right' } })
  const L = []
  L.push(':bar_chart: *B2C - Daily Cashflow*')
  L.push('_Last completed day, month to date and year to date. ' + (c.through ? 'Through ' + c.through + '.' : '') + '_')
  return [{
    key: 'b2c_cashflow_full', label: 'B2C - Daily Cashflow', attach: true,
    text: L.join('\n'),
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: L[0] } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: L[1] }] },
      { type: 'table', block_id: 'b2c_cashflow_table', column_settings: cols, rows: rows },
      { type: 'context', elements: [{ type: 'mrkdwn', text: noteMrkdwn(c) }] },
    ],
    // Same reasoning as buildB2CFullTable above -- plain-value mirror of the
    // blocks array, for an accurate Quantum preview only.
    table: {
      columns: rows[0].map(cellPlain),
      rows: rows.slice(1).map(function (r) { return r.map(cellPlain) }),
      strongRows: rows.slice(1).map(function (r, i) { return r[0].type === 'rich_text' ? i : -1 }).filter(function (i) { return i >= 0 }),
    },
    context: noteMrkdwn(c),
  }]
}

export const B2C_CASHFLOW_TABLE_VERSIONS = [{
  id: 'b2c_cashflow_full',
  code: 'B2C-CF',
  msgKeys: ['b2c_cashflow_full'],
  name: 'B2C - Daily Cashflow (native table)',
  tagline: 'One native Slack table, Cash Flow\'s own line items, Last Day / MTD / YTD.',
  what: [
    'Every line item verbatim off the Daily Cash Flow tab -- SR, AC Online, Leverage One Online, Offline revenue, Total Cash Inflow, each cost head, Total Cash Outflow, then Net cash inflow',
    'Three columns: Last Day, MTD, and year to date',
    'A real Slack table block, not a code block or an image',
    'The same Revenue-vs-Cash-Flow definition note the page carries, so a reader never has to guess why this differs from the Daily P&L report',
  ],
  build: buildB2CCashflowTable,
}]

export const B2C_REPORT_VERSIONS = [{
  id: 'b2c',
  code: 'B2C',
  msgKeys: ['b2c'],
  name: 'B2C \u2014 cost, revenue and net inflow',
  tagline: 'Day, month and financial year in phone sized tables, then what went wrong and what would close it.',
  what: [
    'The three periods across two narrow tables: revenue and cost, then net inflow and margin',
    'The month\u2019s revenue by line and cost by head, each read against revenue',
    'A Total row closing every table that lists parts',
    'Tables built to thirty characters, so Slack on a phone never wraps them',
    'No rupee sign and one unit inside a column, so the amounts stay in line',
    'What went wrong, naming the heads that rose and the one that fell',
    'What would close the gap, costed on the spend side and the revenue side',
    'A note that SR is Online and Offline together until the split lands',
    'The table image and a CSV land in the thread'
  ],
  build: buildB2C
}]
