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
// It closes with what went wrong and what would close the gap. Both are plain
// arithmetic on two windows the page has already computed: no forecast, no
// judgement, nothing that cannot be checked against the tables above them.
//
// Nothing here names an internal report version. The CEO reads numbers.

const CR = 1e7
const LAKH = 1e5

// The sheet's SR column is Online and Offline together, so it is labelled that
// way here until the sheet carries the two apart.
const LINES = [['SR (Online + Offline)', 'sr'], ['AC Online', 'ac'], ['VAS Online', 'vas'], ['Offline (AC + VAS)', 'off']]
const HEADS = [['Perf. Marketing', 'pm'], ['Operating', 'op'], ['Offline (rent + staff)', 'off'], ['Corp. Overheads', 'corp'], ['People', 'people']]
const SR_NOTE = '_SR is Online and Offline together in the sheet today. The split is coming shortly._'

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

// Line items ranked by how far they moved against the same window last month.
function movers(now, was, defs) {
if (!was) return []
return defs.map(function (d) {
const n = now[d[1]]
const w = was[d[1]]
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
const down = movers(rev, p ? p.rev : null, LINES).filter(function (x) { return x.d < 0 }).sort(function (a, b) { return a.d - b.d })
if (up.length) {
bad.push('\u2022 The rise is concentrated: ' + up.slice(0, 2).map(function (x) { return x.label + ' ' + signed(x.d) }).join(' and ') + ', against ' + p.label + '.')
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
fix.push('\u2022 Leaving cost alone, break-even needs revenue of ' + money(cost.total) + ' \u2014 ' + money(gap) + ' more than booked' + (c.days ? ', about ' + money(gap / c.days) + ' a day across the ' + c.days + ' days so far' : '') + '.')
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
const R = LINES.filter(function (d) { return rev[d[1]] != null }).map(function (d) { return [d[0], money(rev[d[1]]), pct(rev[d[1]], rev.total)] })
R.push(['Total', money(rev.total), '100.0%'])
L.push.apply(L, table(['Revenue line', 'Amount', 'Share'], R))
L.push(SR_NOTE)
L.push('')
L.push('*Where the month\u2019s cost went, read against revenue*')
const K = HEADS.filter(function (d) { return cost[d[1]] != null }).map(function (d) { return [d[0], money(cost[d[1]]), pct(cost[d[1]], rev.total)] })
K.push(['Total', money(cost.total), pct(cost.total, rev.total)])
L.push.apply(L, table(['Cost head', 'Amount', '% of revenue'], K))
// People is sometimes booked once a month rather than day by day. When that
// is so the daily totals genuinely do not contain it, and saying so is the
// only honest way to publish a margin off this sheet.
if (cost.people == null && c.peopleMonthly != null) {
L.push('')
L.push(':warning: People cost is booked monthly in the sheet, not daily: ' + money(c.peopleMonthly) + ' for the month. It sits outside the cost and net inflow above.')
}
L.push.apply(L, diagnose(c))
L.push('')
L.push('*How to read this*')
L.push('\u2022 Net inflow is revenue minus cost for the same period. Margin is net inflow as a share of that period\u2019s revenue.')
L.push('\u2022 A negative margin, or a cost above 100% of revenue, means the period spent more than it earned.')
L.push('\u2022 The three periods nest, they do not compare: the day sits inside the month and the month sits inside the year.')
L.push('\u2022 The financial year runs 1 April to 31 March, so FY to date starts on 1 April and ends at the same cut-off as the other two.')
L.push('\u2022 The breakdowns and the two closing sections are month to date only \u2014 not the day, not the year.')
L.push('\u2022 The closing sections compare this month against the same run of days last month. They are arithmetic, not a forecast.')
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
tagline: 'Day, month and financial year in one table, then what went wrong and what would close it.',
what: [
'A table of the three periods: last completed day, month to date, FY to date',
'Revenue, cost, net inflow and margin for each of them',
'The month\u2019s revenue by line and cost by head, each read against revenue',
'What went wrong, named by line item and by amount against last month',
'What would close the gap, costed on the spend side and the revenue side',
'A short how-to-read footer',
'The table image and a CSV land in the thread'
],
build: buildB2C
}]
