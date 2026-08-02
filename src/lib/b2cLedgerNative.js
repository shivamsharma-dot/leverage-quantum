// The CEO's B2C ledger, drawn with Slack's OWN table block.
//
// A third, separate version. The daily B2C report and the fenced code-block
// ledger are both left exactly as they were.
//
// Why a native table. A fenced block is a fixed width, and Slack on a phone
// wraps it rather than scrolling it, so a table that lines up on a laptop
// arrives in the hand as ragged pieces. Slack's table block is laid out by
// Slack itself: it right-aligns the number columns, wraps only the label
// column, and scrolls sideways on a phone instead of folding. So there is no
// character budget in this file, no padding arithmetic, and the rupee sign is
// safe to print.
//
// What it answers: every revenue line and every cost head the finance sheet
// carries, read across the last completed day, the month so far and the
// financial year so far, revenue and cost stacked in ONE table so the two can
// be read against each other, a total on each side, and net inflow closing it.
//
// One limit is stated rather than papered over: the sheet books cost by head --
// people, operating, marketing, offline, overheads -- and not by revenue line.
// There is no cost of SR, of AC or of VAS in the data, and splitting the total
// across the lines on an assumed ratio would be an invention.

const CR = 1e7
const LAKH = 1e5

// Row order follows the finance definition exactly, revenue first and then
// cost. A 'band' is a heading row: Slack tables have no section rows, so it
// travels as a bold row with empty cells. A third element marks a bold row.
const PLAN = [
['band', 'REVENUE'],
['sr', 'SR (Online + Offline)'],
['ac', 'AC Online'],
['vas', 'VAS Online'],
['offRev', 'Offline (AC + VAS)'],
['rev', 'Total Revenue', 1],
['band', 'COST'],
['people', 'People Cost'],
['op', 'Operating Cost (AC + VAS)'],
['pm', 'Performance Marketing'],
['offCost', 'Offline (rent, staff, maintenance)'],
['corp', 'Corporate Overheads'],
['cost', 'Total Cost', 1],
['band', 'NET'],
['net', 'Net Inflow', 1]
]
const KEYS = ['sr', 'ac', 'vas', 'offRev', 'rev', 'people', 'op', 'pm', 'offCost', 'corp', 'cost', 'net']
const REVK = ['sr', 'ac', 'vas', 'offRev']
const COSTK = ['people', 'op', 'pm', 'offCost', 'corp']
const NAME = {}
PLAN.forEach(function (p) { if (p[0] !== 'band') NAME[p[0]] = p[1] })

const SR_NOTE = 'SR is Online and Offline together in the sheet today. The split is coming shortly.'
const COST_NOTE = 'Cost is booked by head in the sheet, not by revenue line, so there is no separate cost of SR, AC or VAS to publish yet.'

// Slack lays the column out, so the unit travels with the number and a column
// is free to mix Cr with L without anything falling out of line.
function money(n) {
if (n == null || !isFinite(n)) return '\u2014'
const a = Math.abs(n)
const sg = n < 0 ? '-' : ''
if (a >= CR) return sg + '\u20B9' + (a / CR).toFixed(2) + ' Cr'
if (a >= LAKH) return sg + '\u20B9' + (a / LAKH).toFixed(2) + ' L'
return sg + '\u20B9' + Math.round(a).toLocaleString('en-IN')
}
function signed(n) {
if (n == null || !isFinite(n)) return '\u2014'
return (n > 0 ? '+' : '') + money(n)
}
function share(part, whole) {
if (part == null || !whole) return '\u2014'
return (part / whole * 100).toFixed(1) + '%'
}

// The three periods reach this file in two shapes: the page hands month to date
// over as rev/cost objects, and the day and the year as flat rows. Both are
// pulled into one shape here so the table code only ever sees one.
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
sr: r.sr, ac: r.ac, vas: r.vas, offRev: r.off, rev: r.total,
people: k.people, op: k.op, pm: k.pm, offCost: k.off, corp: k.corp, cost: k.total,
net: net
}
}

// One Slack table. strongRows are indices into rows, the header is bold on its
// own, and wrapFirst lets a long label wrap instead of pushing the number
// columns off the side of a phone.
function build(cols, plan, cell) {
const rows = []
const strong = []
plan.forEach(function (p) {
if (p[0] === 'band') {
strong.push(rows.length)
rows.push([p[1]].concat(cols.map(function () { return '' })))
return
}
if (p[2]) strong.push(rows.length)
rows.push([p[1]].concat(cols.map(function (col) { return cell(col, p[0]) })))
})
return {
columns: ['Line'].concat(cols.map(function (c) { return c.k })),
rows: rows, strongRows: strong, wrapFirst: true
}
}

// Months are not the same length. A 31 day July read against a 30 day June is a
// calendar artefact dressed up as a result, and the daily costs in this sheet
// are a monthly figure spread over the days, so the artefact is large. When the
// two windows differ, every figure in this section is divided by its own day
// count and plainly labelled per day.
function compare(c, mtd, prev) {
const out = { note: null, bad: [], fix: [] }
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
out.bad.push('\u2022 Net inflow is ' + money(nowNet) + per + ' against ' + money(wasNet) + per + ' in ' + lab + ', a swing of ' + signed(nowNet - wasNet) + per + '.')
}
const up = move(COSTK).filter(function (m) { return m.d > 0 }).sort(function (a, b) { return b.d - a.d })
const easier = move(COSTK).filter(function (m) { return m.d < 0 }).sort(function (a, b) { return a.d - b.d })
const down = move(REVK).filter(function (m) { return m.d < 0 }).sort(function (a, b) { return a.d - b.d })
const rose = move(REVK).filter(function (m) { return m.d > 0 }).sort(function (a, b) { return b.d - a.d })
if (up.length) out.bad.push('\u2022 Cost is up on ' + up.slice(0, 2).map(function (m) { return m.label + ' ' + signed(m.d) + per }).join(' and ') + '.')
if (easier.length) out.bad.push('\u2022 Against that, ' + easier[0].label + ' came down ' + signed(easier[0].d) + per + '.')
if (down.length) out.bad.push('\u2022 The biggest fall on revenue is ' + down[0].label + ', ' + money(down[0].was) + per + ' down to ' + money(down[0].now) + per + '.')
if (rose.length) out.bad.push('\u2022 The line holding up is ' + rose[0].label + ', ' + signed(rose[0].d) + per + '.')
if (up.length && mtd.net != null) {
out.fix.push('\u2022 ' + up[0].label + ' back at its ' + lab + ' rate would put the month at ' + money(mtd.net + impact(up[0].d)) + ' instead of ' + money(mtd.net) + '.')
if (up.length > 1) out.fix.push('\u2022 ' + up[0].label + ' and ' + up[1].label + ' both back at that rate: ' + money(mtd.net + impact(up[0].d) + impact(up[1].d)) + '.')
}
}
if (c.days && c.negDays != null) {
out.bad.push('\u2022 ' + c.negDays + ' of the ' + c.days + ' days so far lost money' + (c.worstDay ? ', the worst ' + c.worstDay.date + ' at ' + money(c.worstDay.net) : '') + '.')
}
const gap = mtd.cost != null && mtd.rev != null ? mtd.cost - mtd.rev : null
if (gap != null && gap > 0) {
out.fix.push('\u2022 Leaving cost alone, the month breaks even at revenue of ' + money(mtd.cost) + ', which is ' + money(gap) + ' more than booked' + (c.days ? ', about ' + money(gap / c.days) + ' a day across the ' + c.days + ' days so far' : '') + '.')
}
return out
}

function buildNative(ctx) {
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

// A line is dropped only when NO period has a figure for it, so a blank in
// the sheet never shows up as a confident zero.
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
win.push('MTD = ' + (c.monthLabel || '') + (c.days ? ', ' + c.days + ' day' + (c.days === 1 ? '' : 's') : ''))
if (ytd && c.ytd) win.push(c.ytd.label + ' = ' + c.ytd.from + ' to ' + c.ytd.to)

const out = []

const head = [
':ledger: *B2C \u2014 revenue and cost, line by line*',
'_Every line the finance sheet carries, across the last completed day, the month so far and the financial year so far. Everything stops at ' + cut + '; the day in progress is never counted._'
]
// People is sometimes booked once a month rather than day by day. When that is
// so the daily totals genuinely do not contain it, and saying so is the only
// honest way to publish a margin off this sheet.
if (mtd.people == null && c.peopleMonthly != null) {
head.push(':warning: People cost is booked monthly in the sheet, not daily: ' + money(c.peopleMonthly) + ' for the month. It sits outside the cost and net inflow below.')
}
out.push({
key: 'b2c_native_ledger',
label: 'Revenue and cost in one table',
text: head.join('\n'),
table: build(cols, live, function (col, k) { return money(col.v[k]) }),
context: [win.join(' \u00b7 ') + '.', SR_NOTE, COST_NOTE].join('\n'),
attach: true
})

// The same ledger as a percentage of the same period's own revenue. This is
// what makes a day, a month and a year comparable at all: the rupees cannot
// be, but the shape of the P&L can. Total Revenue is dropped because it is
// 100% in every column by definition.
const pct = live.filter(function (p) { return p[0] !== 'rev' }).map(function (p) {
return p[0] === 'net' ? ['net', 'Margin', 1] : p
})
out.push({
key: 'b2c_native_share',
label: 'The same lines as a share of revenue',
text: '*Share of that period\u2019s own revenue*\n_Rupees across a day, a month and a year cannot be compared. The shape of the P&L can._',
table: build(cols, pct, function (col, k) { return share(col.v[k], col.v.rev) })
})

const cmp = compare(c, mtd, prev)
const tail = []
if (cmp.bad.length) {
tail.push('*What moved' + (c.prev && c.prev.label ? ', against ' + c.prev.label : '') + '*')
if (cmp.note) tail.push(cmp.note)
tail.push.apply(tail, cmp.bad)
}
if (cmp.fix.length) {
if (tail.length) tail.push('')
tail.push('*What would close the gap*')
tail.push.apply(tail, cmp.fix)
}
if (c.isTest) { tail.push(''); tail.push('_Test send._') }
if (tail.length) out.push({ key: 'b2c_native_moves', label: 'What moved, and what would close it', text: tail.join('\n') })

return out
}

export const B2C_NATIVE_VERSIONS = [{
id: 'b2c_native',
code: 'B2C-N',
msgKeys: ['b2c_native_ledger', 'b2c_native_share', 'b2c_native_moves'],
name: 'B2C \u2014 line by line',
tagline: 'Every revenue line and every cost head in one native Slack table, across last day, month to date and FY to date, with totals.',
what: [
'One table with revenue above cost, so the two are read against each other rather than in separate blocks',
'Three columns on every line: the last completed day, month to date, and the financial year to date',
'A Total on revenue, a Total on cost, and net inflow closing the table',
'Slack\u2019s own table block, not a code fence, so the phone scrolls it sideways instead of wrapping it into pieces',
'A second table with the same lines as a share of that period\u2019s own revenue, which is what makes a day, a month and a year comparable',
'The line names the finance definition uses: SR (Online + Offline), AC Online, VAS Online, Offline (AC + VAS)',
'The cost heads the finance definition uses: people, operating (AC + VAS), performance marketing, offline, corporate overheads',
'A plain statement that the sheet books cost by head and not by line, so no cost of SR, AC or VAS is invented',
'A per-day reading when the two months compared are different lengths, so a 31 day month is never flattered by a 30 day one',
'What moved and what would close the gap, both arithmetic on the windows above',
'The table image and a CSV land in the thread'
],
build: buildNative
}]
