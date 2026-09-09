// The CEO's B2C ledger. A second, separate Slack version -- the daily B2C
// report in src/lib/b2cReport.js is untouched and still sends exactly what it
// sent before.
//
// One question only: what does every line of the business look like across the
// last completed day, the month so far and the financial year so far, with
// revenue and cost in the SAME table so the two are read against each other
// instead of scrolled between.
//
// It travels as Slack's own table block, not a monospace code fence. A fence is
// fixed width, and Slack on a phone WRAPS a fence instead of scrolling it --
// which is exactly what turned the earlier layout into a stack of broken lines
// on the CEO's screen. A native table lays out its own columns, right-aligns
// its own numbers and scrolls sideways on a phone, so nothing here has to be
// padded, measured or squeezed into a character budget, and the rupee sign is
// safe to use again.
//
// One limit is stated plainly rather than papered over. The finance sheet books
// cost by head -- people, operating, performance marketing, offline, corporate
// overheads -- and not by business line. There is no cost of SR, of AC or of Leverage One
// anywhere in the data. Splitting the total across the lines on an assumed ratio
// would be an invention, and nothing in this report is invented.

const CR = 1e7
const LAKH = 1e5

// Row order, in the CEO's own names for these lines. A 'band' is a heading row
// drawn inside the table: first cell only, bold, the rest of the row blank.
// 'upskilling' and 'corpSalary' -- two columns Finance added to the Daily P&L
// tab in 2026-09 (api/crm-leads.js's B2C_PNL_COLS has the full story).
const PLAN = [
  ['band', 'REVENUE'],
  ['sr', 'SR (Online + Offline)'],
  ['ac', 'AC Online'],
  ['vas', 'Leverage One Online'],
  ['offRev', 'Offline (AC + Leverage One)'],
  ['upskilling', 'Upskilling'],
  ['rev', 'Total revenue'],
  ['band', 'COST'],
  ['people', 'People'],
  ['op', 'Operating (AC + Leverage One)'],
  ['pm', 'Performance Marketing'],
  ['offCost', 'Offline (rent, staff, maintenance)'],
  ['corp', 'Corporate Overheads'],
  ['corpSalary', 'Corporate Salary'],
  ['cost', 'Total cost'],
  ['band', 'NET'],
  ['net', 'Net inflow']
]
// The three rows that are sums of the rows above them, plus net inflow. Bold in
// the table, because a total nobody can find is a total nobody trusts.
const TOTALS = { rev: 1, cost: 1, net: 1 }
const KEYS = ['sr', 'ac', 'vas', 'offRev', 'upskilling', 'rev', 'people', 'op', 'pm', 'offCost', 'corp', 'corpSalary', 'cost', 'net']
const REVK = ['sr', 'ac', 'vas', 'offRev', 'upskilling']
const COSTK = ['people', 'op', 'pm', 'offCost', 'corp', 'corpSalary']
const NAME = {}
PLAN.forEach(function (p) { if (p[0] !== 'band') NAME[p[0]] = p[1] })

const SR_NOTE = 'SR is Online and Offline together in the sheet today. The split is coming shortly.'
const COST_NOTE = 'Cost is booked by head, and a head is a cost category \u2014 People, Operating (AC + Leverage One), Performance Marketing, Offline (rent, staff, maintenance), Corporate Overheads \u2014 each one covering the whole business. It is not booked by business line, so there is no cost of SR, of AC or of Leverage One in this sheet to publish yet.'

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

function share(part, whole) {
  if (part == null || !whole) return '\u2014'
  return (part / whole * 100).toFixed(1) + '%'
}

// The three periods arrive in two shapes: the page hands month to date over as
// rev/cost objects and the day and the year as flat rows. Both are pulled into
// one shape here so the table code only ever sees one.
function flat(o) {
  if (!o) return null
  const r = {}
  KEYS.forEach(function (k) { r[k] = o[k] == null ? null : o[k] })
  return r
}
function folded(c, net) {
  const r = (c && c.rev) || {}
  const k = (c && c.cost) || {}
  return {
    sr: r.sr, ac: r.ac, vas: r.vas, offRev: r.off, upskilling: r.upskilling, rev: r.total,
    people: k.people, op: k.op, pm: k.pm, offCost: k.off, corp: k.corp, corpSalary: k.corpSalary, cost: k.total,
    net: net
  }
}

// Months are not the same length. A 31 day July read against a 30 day June is a
// calendar artefact dressed up as a result, and the daily cost in this sheet is
// a monthly figure spread over the days, so the artefact is large. When the two
// windows differ, every figure in this section is divided by its own day count
// and plainly labelled per day.
function compare(c, mtd, prev) {
  const out = { note: null, moved: [], fix: [] }
  const lab = c.prev && c.prev.label
  const n = c.days
  const p = c.prev && c.prev.days
  const norm = !!(n && p && n !== p)
  const per = norm ? ' a day' : ''
  const rate = function (v, d) { return v == null ? null : (norm ? v / d : v) }
  const impact = function (d) { return d == null ? null : (norm ? d * n : d) }
  const move = function (keys) {
    return keys.map(function (k) {
      const a = rate(mtd[k], n)
      const b = rate(prev ? prev[k] : null, p)
      if (a == null || b == null) return null
      return { k: k, label: NAME[k], now: a, was: b, d: a - b }
    }).filter(function (m) { return m && m.d !== 0 })
  }
  if (prev && lab) {
    if (norm) out.note = '_' + (c.monthLabel || 'This month') + ' is ' + n + ' days and ' + lab + ' is ' + p + ', so every figure in this section is read per day._'
    const nowNet = rate(mtd.net, n)
    const wasNet = rate(prev.net, p)
    if (nowNet != null && wasNet != null) {
      out.moved.push('\u2022 Net inflow is ' + money(nowNet) + per + ' against ' + money(wasNet) + per + ' in ' + lab + ', a swing of ' + signed(nowNet - wasNet) + per + '.')
    }
    const up = move(COSTK).filter(function (m) { return m.d > 0 }).sort(function (a, b) { return b.d - a.d })
    const easier = move(COSTK).filter(function (m) { return m.d < 0 }).sort(function (a, b) { return a.d - b.d })
    const down = move(REVK).filter(function (m) { return m.d < 0 }).sort(function (a, b) { return a.d - b.d })
    const rose = move(REVK).filter(function (m) { return m.d > 0 }).sort(function (a, b) { return b.d - a.d })
    if (up.length) {
      out.moved.push('\u2022 Cost is up on ' + up.slice(0, 2).map(function (m) { return m.label + ' ' + signed(m.d) + per }).join(' and ') + '.')
    }
    // Naming only what rose would be half the picture, so the largest fall on the
    // cost side is stated in the same breath.
    if (easier.length) out.moved.push('\u2022 Against that, ' + easier[0].label + ' came down ' + signed(easier[0].d) + per + '.')
    if (down.length) out.moved.push('\u2022 The biggest fall on revenue is ' + down[0].label + ', ' + money(down[0].was) + per + ' down to ' + money(down[0].now) + per + '.')
    if (rose.length) out.moved.push('\u2022 The line holding up is ' + rose[0].label + ', ' + signed(rose[0].d) + per + '.')
    if (up.length && mtd.net != null) {
      out.fix.push('\u2022 ' + up[0].label + ' back at its ' + lab + ' rate would put the month at ' + money(mtd.net + impact(up[0].d)) + ' instead of ' + money(mtd.net) + '.')
      if (up.length > 1) out.fix.push('\u2022 ' + up[0].label + ' and ' + up[1].label + ' both back at that rate: ' + money(mtd.net + impact(up[0].d) + impact(up[1].d)) + '.')
    }
  }
  if (c.days && c.negDays != null) {
    out.moved.push('\u2022 ' + c.negDays + ' of the ' + c.days + ' days so far lost money' + (c.worstDay ? ', the worst ' + c.worstDay.date + ' at ' + money(c.worstDay.net) : '') + '.')
  }
  const gap = mtd.cost != null && mtd.rev != null ? mtd.cost - mtd.rev : null
  if (gap != null && gap > 0) {
    out.fix.push('\u2022 Leaving cost alone, the month breaks even at revenue of ' + money(mtd.cost) + ', which is ' + money(gap) + ' more than booked' + (c.days ? ', about ' + money(gap / c.days) + ' a day across the ' + c.days + ' days so far' : '') + '.')
  }
  return out
}

// One table body, built once and then read twice: once in rupees and once as a
// share of the same period's own revenue.
function body(cols, live, cell, renameNet) {
  const rows = live.map(function (p) {
    if (p[0] === 'band') return [p[1]].concat(cols.map(function () { return '' }))
    const label = renameNet && p[0] === 'net' ? 'Margin' : p[1]
    return [label].concat(cols.map(function (col) { return cell(col, p[0]) }))
  })
  const strong = []
  live.forEach(function (p, i) { if (p[0] === 'band' || TOTALS[p[0]]) strong.push(i) })
  return {
    columns: ['Line'].concat(cols.map(function (col) { return col.k })),
    rows: rows,
    strongRows: strong,
    // The line names are long on purpose -- 'Offline' twice would be ambiguous.
    // Wrapping them keeps the number columns on screen on a phone.
    wrapFirst: true
  }
}

function buildLedger(ctx) {
  const c = ctx || {}
  const mtd = folded(c, c.net)
  const day = flat(c.day)
  const ytd = flat(c.ytd)
  const prev = c.prev ? folded(c.prev, c.prev.net) : null

  // A period only earns a column if the page actually handed one over.
  const cols = []
  if (day) cols.push({ k: 'Last day', v: day })
  cols.push({ k: 'MTD', v: mtd })
  if (ytd) cols.push({ k: 'FY to date', v: ytd })

  // A line is dropped only when no period has a figure for it, so a blank in the
  // sheet never shows up as a confident zero.
  const live = PLAN.filter(function (p) {
    if (p[0] === 'band') return true
    return cols.some(function (col) { return col.v[p[0]] != null })
  })

  // The cut-off is the last day actually in this report, not simply today minus
  // one. They are the same thing on the live month and they are not the same
  // when an earlier month is picked, and a header that disagrees with its own
  // table is exactly what gets a report distrusted.
  const cut = (c.day && c.day.date) || c.through || 'the last completed day'

  const win = []
  if (day && c.day) win.push('Last day = ' + c.day.date)
  win.push('MTD = ' + (c.monthLabel || '') + (c.days ? ', ' + c.days + ' days' : ''))
  if (ytd && c.ytd) win.push(c.ytd.label + ' = ' + c.ytd.from + ' to ' + c.ytd.to)

  const lead = [
    ':ledger: *B2C \u2014 the full ledger*',
    '_Every revenue line and every cost head the finance sheet carries, side by side, across the last completed day, the month so far and the financial year so far. Everything stops at ' + cut + ' \u2014 the day in progress is never counted._'
  ]
  // People is sometimes booked once a month rather than day by day. When that is
  // so the daily totals genuinely do not contain it, and saying so is the only
  // honest way to publish a margin off this sheet.
  const caveat = []
  if (mtd.people == null && c.peopleMonthly != null) {
    caveat.push(':warning: People cost is booked monthly in this sheet, not daily: ' + money(c.peopleMonthly) + ' for the month. It sits outside the cost and net inflow in the table.')
  }
  if (c.isTest) caveat.push('_Test send._')

  const one = {
    key: 'b2c_ledger_lines',
    label: 'B2C \u2014 revenue and cost, one table',
    text: lead.join('\n'),
    after: caveat.length ? caveat.join('\n') : null,
    table: body(cols, live, function (col, k) { return money(col.v[k]) }, false),
    context: [win.join(' \u00b7 '), SR_NOTE, COST_NOTE].join('\n'),
    attach: true
  }

  // The same ledger as a percentage of the same period's own revenue. This is
  // what makes a day, a month and a year comparable at all: the rupees cannot
  // be, but the shape of the P&L can. Total revenue is dropped -- it is 100% by
  // construction and says nothing.
  const cmp = compare(c, mtd, prev)
  const two = []
  if (cmp.moved.length) {
    two.push('*What moved' + (c.prev && c.prev.label ? ', against ' + c.prev.label : '') + '*')
    if (cmp.note) two.push(cmp.note)
    two.push.apply(two, cmp.moved)
  }
  if (cmp.fix.length) {
    if (two.length) two.push('')
    two.push('*What would close the gap*')
    two.push.apply(two, cmp.fix)
  }
  const shareLive = live.filter(function (p) { return p[0] !== 'rev' })
  const second = {
    key: 'b2c_ledger_shape',
    label: 'B2C \u2014 what moved, and the shape of each period',
    text: two.length ? two.join('\n') : '*The shape of each period*',
    after: '*Every line as a share of that period\u2019s own revenue*\n_Rupees cannot be compared across a day, a month and a year. The shape of the P&L can._',
    table: body(cols, shareLive, function (col, k) { return share(col.v[k], col.v.rev) }, true),
    context: 'A cost head above 100% of revenue, or a negative margin, means the period spent more than it earned.'
  }

  return [one, second]
}

export const B2C_LEDGER_VERSIONS = [{
  id: 'b2c_ledger',
  code: 'B2C-L',
  msgKeys: ['b2c_ledger_lines', 'b2c_ledger_shape'],
  name: 'B2C \u2014 the full ledger',
  tagline: 'Every revenue line and every cost head in one native table, across last day, month to date and FY to date, with totals.',
  what: [
    'One table with revenue above cost, so the two are read against each other instead of in separate blocks',
    'Three columns on every line: the last completed day, month to date, and the financial year to date',
    'SR (Online + Offline), AC Online, Leverage One Online and Offline (AC + Leverage One) on the revenue side',
    'People, Operating (AC + Leverage One), Performance Marketing, Offline (rent, staff, maintenance) and Corporate Overheads on the cost side',
    'A Total on revenue, a Total on cost, and net inflow closing the table',
    'A second table with the same lines as a share of that period\u2019s own revenue, which is what makes a day, a month and a year comparable',
    'Slack\u2019s own table block, not a monospace code block, so a phone lays the columns out instead of wrapping them',
    'A per-day reading when the two months compared are different lengths, so a 31 day month is never flattered by a 30 day one',
    'A plain statement of what a cost head is \u2014 a cost category, not a business line \u2014 so nobody hunts the table for a cost of SR, AC or Leverage One that the sheet does not carry',
    'What moved and what would close the gap, both arithmetic on the windows above',
    'The table image and a CSV land in the thread'
  ],
  build: buildLedger
}]
