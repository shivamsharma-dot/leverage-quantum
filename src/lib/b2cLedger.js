// The CEO's B2C ledger. A second, separate Slack version -- the daily B2C
// report is untouched and still sends exactly what it sent before.
//
// This one answers one question only: what does every line of the business
// look like across the last completed day, the month so far and the financial
// year so far, with revenue and cost stacked in the SAME table so the two can
// be read against each other instead of scrolled between.
//
// It is read on a phone. Slack's mobile client wraps a code block rather than
// scrolling it, at roughly thirty monospace characters, so every table here is
// measured on the way out and never allowed past that. No rupee glyph inside a
// table: the mobile monospace face does not carry it and falls back to a
// proportional one, which pulls the column out of line. One unit for a whole
// column, written once in the header, so a column never mixes Cr with L.
//
// One limit is stated in the message rather than papered over. The finance
// sheet books cost by head -- marketing, operating, offline, overheads,
// people -- and not by business line. There is no cost of SR, of AC or of VAS
// in the data. Splitting the total across the lines on an assumed ratio would
// be an invention, and nothing in this report is invented.

const CR = 1e7
const LAKH = 1e5
const WIDTH = 30

// Row order for the ledger. A 'band' is a heading drawn inside the block.
// Nine characters is the widest label the phone budget allows once three
// number columns are in, so the labels are short and the full names live in
// FULL for the prose underneath.
const PLAN = [
['band', 'REVENUE'],
['sr', 'SR'],
['ac', 'AC'],
['vas', 'VAS'],
['offRev', 'Offline'],
['rev', 'Total'],
['band', 'COST'],
['pm', 'Marketing'],
['op', 'Operating'],
['offCost', 'Offline'],
['corp', 'Overheads'],
['people', 'People'],
['cost', 'Total'],
['band', 'NET'],
['net', 'Net']
]
const FULL = {
sr: 'SR (Online + Offline)', ac: 'AC Online', vas: 'VAS Online', offRev: 'Offline (AC + VAS)',
rev: 'Total revenue', pm: 'Perf. Marketing', op: 'Operating', offCost: 'Offline (rent + staff)',
corp: 'Corp. Overheads', people: 'People', cost: 'Total cost', net: 'Net inflow'
}
const KEYS = ['sr', 'ac', 'vas', 'offRev', 'rev', 'pm', 'op', 'offCost', 'corp', 'people', 'cost', 'net']
const REVK = ['sr', 'ac', 'vas', 'offRev']
const COSTK = ['pm', 'op', 'offCost', 'corp', 'people']
const SR_NOTE = '_SR is Online and Offline together in the sheet today. The split is coming shortly._'
const COST_NOTE = '_Cost is booked by head in the sheet, not by line, so there is no cost of SR, AC or VAS to publish yet. The sheet needs those columns before this report can carry them._'

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

// One unit for a whole column, picked off its own largest figure.
function scale(vals) {
let mx = 0
vals.forEach(function (v) { if (v != null && isFinite(v) && Math.abs(v) > mx) mx = Math.abs(v) })
if (mx >= CR) return { d: CR, u: ' Cr' }
if (mx >= LAKH) return { d: LAKH, u: ' L' }
return { d: 1, u: '' }
}

// A bare number at that unit. The unit itself is written once, in the header,
// which is what buys the room for a third period on a phone.
function bare(n, s) {
if (n == null || !isFinite(n)) return '-'
if (s.d === 1) return String(Math.round(n))
return (n / s.d).toFixed(2)
}

function share(part, whole) {
if (part == null || !whole) return '-'
return (part / whole * 100).toFixed(1) + '%'
}

function padEnd(s, n) { s = String(s); return s.length >= n ? s : s + ' '.repeat(n - s.length) }
function padStart(s, n) { s = String(s); return s.length >= n ? s : ' '.repeat(n - s.length) + s }

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

// First column left, every number column right, so the last digit of an amount
// sits under the last digit of the one above it. Then close the gap between
// columns until the widest line fits a phone.
function table(head, rows) {
const over = function (ls) { return ls.some(function (l) { return l.length > WIDTH }) }
let body = lay(head, rows, 2)
if (over(body)) body = lay(head, rows, 1)
return ['```'].concat(body, ['```'])
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
sr: r.sr, ac: r.ac, vas: r.vas, offRev: r.off, rev: r.total,
pm: k.pm, op: k.op, offCost: k.off, corp: k.corp, people: k.people, cost: k.total,
net: net
}
}

// Months are not the same length. A 31 day July read against a 30 day June is
// a calendar artefact dressed up as a result, and the daily costs in this
// sheet are a monthly figure spread over the days, so the artefact is large.
// When the two windows differ, every figure in this section is divided by its
// own day count and plainly labelled per day.
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
return { k: k, label: FULL[k], now: a, was: b, d: a - b }
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
if (up.length) {
out.bad.push('\u2022 Cost is up on ' + up.slice(0, 2).map(function (m) { return m.label + ' ' + signed(m.d) + per }).join(' and ') + '.')
}
// Naming only what rose would be half the picture, so the largest fall on the
// cost side is stated in the same breath.
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

function buildLedger(ctx) {
const c = ctx || {}
const mtd = folded(c, c.net)
const day = flat(c.day)
const ytd = flat(c.ytd)
const prev = c.prev ? folded(c.prev, c.prev.net) : null

// A period only earns a column if the page actually handed one over.
const cols = []
if (day) cols.push({ k: 'Day', v: day })
cols.push({ k: 'MTD', v: mtd })
if (ytd) cols.push({ k: 'FY', v: ytd })
cols.forEach(function (col) { col.s = scale(KEYS.map(function (k) { return col.v[k] })) })

// A line is dropped only when no period has a figure for it, so a blank in
// the sheet never shows up as a confident zero.
const live = PLAN.filter(function (p) {
if (p[0] === 'band') return true
return cols.some(function (col) { return col.v[p[0]] != null })
})

const L = []
L.push(':ledger: *B2C \u2014 the full ledger*')
L.push('_Every line the finance sheet carries, read across the last completed day, the month so far and the financial year so far. Everything stops at ' + (c.through || 'the last completed day') + '; the day in progress is never counted._')

L.push('')
L.push('*Rupees*')
L.push.apply(L, table(
['Line'].concat(cols.map(function (col) { return col.k + col.s.u })),
live.map(function (p) {
if (p[0] === 'band') return [p[1]].concat(cols.map(function () { return '' }))
return [p[1]].concat(cols.map(function (col) { return bare(col.v[p[0]], col.s) }))
})
))

// The same ledger as a percentage of the same period's own revenue. This is
// the column that makes a day, a month and a year comparable at all: the
// rupees cannot be, but the shape of the P&L can.
L.push('*Share of that period\u2019s revenue*')
L.push.apply(L, table(
['Line'].concat(cols.map(function (col) { return col.k })),
live.filter(function (p) { return p[0] !== 'rev' }).map(function (p) {
if (p[0] === 'band') return [p[1]].concat(cols.map(function () { return '' }))
return [p[0] === 'net' ? 'Margin' : p[1]].concat(cols.map(function (col) { return share(col.v[p[0]], col.v.rev) }))
})
))

const win = []
if (day && c.day) win.push('Day = ' + c.day.date)
win.push('MTD = ' + (c.monthLabel || '') + (c.days ? ', ' + c.days + ' days' : ''))
if (ytd && c.ytd) win.push(c.ytd.label + ' = ' + c.ytd.from + ' to ' + c.ytd.to)
L.push('_' + win.join(' \u00b7 ') + '._')
L.push(SR_NOTE)
L.push(COST_NOTE)

// People is sometimes booked once a month rather than day by day. When that is
// so the daily totals genuinely do not contain it, and saying so is the only
// honest way to publish a margin off this sheet.
if (mtd.people == null && c.peopleMonthly != null) {
L.push('')
L.push(':warning: People cost is booked monthly in the sheet, not daily: ' + money(c.peopleMonthly) + ' for the month. It sits outside the cost and net inflow above.')
}

const cmp = compare(c, mtd, prev)
if (cmp.bad.length) {
L.push('')
L.push('*What moved' + (c.prev && c.prev.label ? ', against ' + c.prev.label : '') + '*')
if (cmp.note) L.push(cmp.note)
L.push.apply(L, cmp.bad)
}
if (cmp.fix.length) {
L.push('')
L.push('*What would close the gap*')
L.push.apply(L, cmp.fix)
}
if (c.isTest) {
L.push('')
L.push('_Test send._')
}
return [{ key: 'b2c_ledger', label: 'B2C \u2014 the full ledger', text: L.join('\n'), attach: true }]
}

export const B2C_LEDGER_VERSIONS = [{
id: 'b2c_ledger',
code: 'B2C-L',
msgKeys: ['b2c_ledger'],
name: 'B2C \u2014 the full ledger',
tagline: 'Every revenue line and every cost head in one table, across last day, month to date and FY to date, with totals.',
what: [
'One table, revenue above cost, so the two are read against each other and not in separate blocks',
'Three columns on every line: the last completed day, month to date, and the financial year to date',
'A Total on revenue, a Total on cost, and net inflow closing the table',
'A second table with the same lines as a share of that period\u2019s own revenue, which is what makes a day, a month and a year comparable',
'One unit for a whole column, written once in the header, and no rupee sign inside a table',
'Every table measured to thirty characters, so Slack on a phone never wraps one',
'A per-day reading when the two months compared are different lengths, so a 31 day month is never flattered by a 30 day one',
'A plain statement that the sheet books cost by head and not by line, so no cost of SR, AC or VAS is invented',
'What moved and what would close the gap, both arithmetic on the windows above',
'The table image and a CSV land in the thread'
],
build: buildLedger
}]
