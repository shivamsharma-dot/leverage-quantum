// The CEO's B2C Slack message. One message, not a series.
//
// Three periods, always in this order: the last completed day, the month so
// far, and the financial year so far. Every figure is D-1 -- the page stops at
// the last completed day and so does this.
//
// The numbers are laid out as tables inside code blocks. Slack has no table
// element in messages; a code block is the only thing that keeps columns under
// one another on desktop and mobile alike.
//
// Nothing here names an internal report version. The CEO reads numbers.

const CR = 1e7
const LAKH = 1e5

function money(n) {
if (n == null || !isFinite(n)) return '\u2014'
const a = Math.abs(n)
const sg = n < 0 ? '-' : ''
if (a >= CR) return sg + '\u20B9' + (a / CR).toFixed(2) + ' Cr'
if (a >= LAKH) return sg + '\u20B9' + (a / LAKH).toFixed(2) + ' L'
return sg + '\u20B9' + Math.round(a).toLocaleString('en-IN')
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

// A monospaced table. First column left aligned, the rest right aligned so
// the amounts line up under one another.
function table(head, rows) {
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
}).join('  ').replace(/\s+$/, '')
}
const out = ['```', fmt(head)]
rows.forEach(function (r) { out.push(fmt(r)) })
out.push('```')
return out
}

function buildB2C(ctx) {
const c = ctx || {}
const rev = c.rev || {}
const cost = c.cost || {}
const day = c.day
const ytd = c.ytd
const L = []
L.push(':bar_chart: *B2C \u2014 cost, revenue and net inflow*')
L.push('_Every figure below stops at ' + (c.through || 'the last completed day') + '. The day in progress is never counted._')
L.push('')
L.push('*The three periods*')
const P = []
if (day) P.push(['Last day', money(day.rev), money(day.cost), money(day.net), margin(day.net, day.rev)])
P.push(['Month to date', money(rev.total), money(cost.total), money(c.net), margin(c.net, rev.total)])
if (ytd) P.push(['FY to date', money(ytd.rev), money(ytd.cost), money(ytd.net), margin(ytd.net, ytd.rev)])
L.push.apply(L, table(['Period', 'Revenue', 'Cost', 'Net inflow', 'Margin'], P))
const win = []
if (day) win.push('Last day = ' + day.date)
win.push('Month to date = ' + (c.monthLabel || ''))
if (ytd) win.push(ytd.label + ' = ' + ytd.from + ' to ' + ytd.to)
L.push('_' + win.join(' \u00b7 ') + '_')
L.push('')
L.push('*Where the month\u2019s revenue came from*')
const R = [['SR Online', money(rev.sr), pct(rev.sr, rev.total)], ['AC Online', money(rev.ac), pct(rev.ac, rev.total)], ['VAS Online', money(rev.vas), pct(rev.vas, rev.total)]]
if (rev.off != null) R.push(['Offline', money(rev.off), pct(rev.off, rev.total)])
R.push(['Total', money(rev.total), '100.0%'])
L.push.apply(L, table(['Revenue line', 'Amount', 'Share'], R))
L.push('')
L.push('*Where the month\u2019s cost went, read against revenue*')
const K = [['Perf. Marketing', money(cost.pm), pct(cost.pm, rev.total)], ['Operating', money(cost.op), pct(cost.op, rev.total)]]
if (cost.off != null) K.push(['Offline', money(cost.off), pct(cost.off, rev.total)])
if (cost.corp != null) K.push(['Corp. Overheads', money(cost.corp), pct(cost.corp, rev.total)])
if (cost.people != null) K.push(['People', money(cost.people), pct(cost.people, rev.total)])
K.push(['Total', money(cost.total), pct(cost.total, rev.total)])
L.push.apply(L, table(['Cost head', 'Amount', '% of revenue'], K))
// People is sometimes booked once a month rather than day by day. When that
// is so the daily totals genuinely do not contain it, and saying so is the
// only honest way to publish a margin off this sheet.
if (cost.people == null && c.peopleMonthly != null) {
L.push('')
L.push(':warning: People cost is booked monthly in the sheet, not daily: ' + money(c.peopleMonthly) + ' for the month. It sits outside the cost and net inflow above.')
}
L.push('')
L.push('*How to read this*')
L.push('\u2022 Net inflow is revenue minus cost for the same period. Margin is net inflow as a share of that period\u2019s revenue.')
L.push('\u2022 A negative margin, or a cost above 100% of revenue, means the period spent more than it earned.')
L.push('\u2022 The three periods nest, they do not compare: the day sits inside the month and the month sits inside the year.')
L.push('\u2022 The financial year runs 1 April to 31 March, so FY to date starts on 1 April and ends at the same cut-off as the other two.')
L.push('\u2022 The revenue and cost breakdowns are month to date only \u2014 not the day, not the year.')
L.push('\u2022 Everything is read straight from the B2C finance sheet with no adjustment. A blank in the sheet stays blank here.')
if (c.isTest) {
L.push('')
L.push('_Test send._')
}
return [{ key: 'b2c', label: 'B2C \u2014 cost, revenue and net inflow', text: L.join('\n'), attach: true }]
}

export const B2C_REPORT_VERSIONS = [{
id: 'b2c',
code: 'B2C',
msgKeys: ['b2c'],
name: 'B2C \u2014 cost, revenue and net inflow',
tagline: 'Day, month and financial year side by side in one table, with a note on how to read it.',
what: [
'A table of the three periods: last completed day, month to date, FY to date',
'Revenue, cost, net inflow and margin for each of them',
'The month\u2019s revenue by line and cost by head, each read against revenue',
'A short how-to-read footer so the numbers cannot be misread',
'The table image and a CSV land in the thread'
],
build: buildB2C
}]
