// The CEO's B2C Slack message. One message, not a series: the finance sheet
// carries five revenue lines and five cost heads, and there is nothing in them
// that needs a second post to land.
//
// Three periods, always in this order: the last completed day, the month so
// far, and the financial year so far. Every figure is D-1 -- the page stops at
// the last completed day and so does this.
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

function line(label, value, share) {
  return '\u2022 ' + label + ' ' + money(value) + (share ? ' (' + share + ')' : '')
}

// One period, three numbers, always in the same shape, so the day, the month
// and the year can be compared without re-reading the labels each time.
function block(title, o) {
  const L = ['*' + title + '*']
  L.push(line('Revenue', o.rev))
  const cs = pct(o.cost, o.rev)
  L.push(line('Cost', o.cost) + (cs ? ' \u00b7 ' + cs + ' of revenue' : ''))
  const m = o.rev && o.net != null ? (o.net / o.rev * 100).toFixed(1) + '% margin' : null
  L.push(line('Net inflow', o.net) + (m ? ' \u00b7 ' + m : ''))
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
  L.push('_All three periods run to ' + (c.through || '') + '. The day in progress is never counted._')
  if (day) {
    L.push('')
    L.push.apply(L, block('Last completed day \u00b7 ' + day.date, { rev: day.rev, cost: day.cost, net: day.net }))
  }
  L.push('')
  L.push.apply(L, block('Month to date \u00b7 ' + (c.monthLabel || ''), { rev: rev.total, cost: cost.total, net: c.net }))
  if (ytd) {
    L.push('')
    L.push.apply(L, block(ytd.label + ' to date \u00b7 ' + ytd.from + ' to ' + ytd.to, { rev: ytd.rev, cost: ytd.cost, net: ytd.net }))
  }
  L.push('')
  L.push('*Where the month\u2019s revenue came from*')
  L.push(line('SR Online', rev.sr, pct(rev.sr, rev.total)))
  L.push(line('AC Online', rev.ac, pct(rev.ac, rev.total)))
  L.push(line('VAS Online', rev.vas, pct(rev.vas, rev.total)))
  if (rev.off != null) L.push(line('Offline', rev.off, pct(rev.off, rev.total)))
  L.push('')
  L.push('*Where the month\u2019s cost went, read against revenue*')
  L.push(line('Perf. Marketing', cost.pm, pct(cost.pm, rev.total)))
  L.push(line('Operating', cost.op, pct(cost.op, rev.total)))
  if (cost.off != null) L.push(line('Offline', cost.off, pct(cost.off, rev.total)))
  if (cost.corp != null) L.push(line('Corp. Overheads', cost.corp, pct(cost.corp, rev.total)))
  if (cost.people != null) L.push(line('People', cost.people, pct(cost.people, rev.total)))
  // People is sometimes booked once a month rather than day by day. When that
  // is so the daily totals genuinely do not contain it, and saying so is the
  // only honest way to publish a margin off this sheet.
  if (cost.people == null && c.peopleMonthly != null) {
    L.push('')
    L.push(':warning: People cost is booked monthly in the sheet, not daily: ' + money(c.peopleMonthly) + ' for the month. It sits outside the cost and net inflow above.')
  }
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
  tagline: 'The last completed day, the month so far and the financial year so far, in that order.',
  what: [
    'Last completed day: revenue, cost and net inflow',
    'Month to date: the same three, with cost as a % of revenue',
    'Financial year to date, from 1 April to the same cut-off',
    'The month\u2019s revenue by line and cost by head, each read against revenue',
    'The table image and a CSV land in the thread'
  ],
  build: buildB2C
}]
