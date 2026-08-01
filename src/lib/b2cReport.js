// The CEO's B2C Slack message. One message, not a series: the finance sheet
// carries five revenue lines and five cost heads, and there is nothing in them
// that needs a second post to land. Every figure is D-1 -- the page stops at
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
  return '\u2022 ' + label + '  ' + money(value) + (share ? '  (' + share + ')' : '')
}

function buildB2C(ctx) {
  const c = ctx || {}
  const rev = c.rev || {}
  const cost = c.cost || {}
  const day = c.day
  const L = []
  L.push(':bar_chart: *B2C \u2014 ' + (c.monthLabel || '') + ', through ' + (c.through || '') + '*')
  L.push('')
  L.push('*Revenue* ' + money(rev.total))
  L.push('*Cost* ' + money(cost.total))
  L.push('*Net inflow* ' + money(c.net) + (c.margin == null ? '' : '  \u00b7  ' + c.margin.toFixed(1) + '% margin'))
  if (day) {
    L.push('')
    L.push('*' + day.date + '*  revenue ' + money(day.rev) + '  \u00b7  cost ' + money(day.cost) + '  \u00b7  net ' + money(day.net))
  }
  L.push('')
  L.push('*Where the revenue came from*')
  L.push(line('SR Online', rev.sr, pct(rev.sr, rev.total)))
  L.push(line('AC Online', rev.ac, pct(rev.ac, rev.total)))
  L.push(line('VAS Online', rev.vas, pct(rev.vas, rev.total)))
  if (rev.off != null) L.push(line('Offline', rev.off, pct(rev.off, rev.total)))
  L.push('')
  L.push('*Where the cost went, read against revenue*')
  L.push(line('Perf. Marketing', cost.pm, pct(cost.pm, rev.total)))
  L.push(line('Operating', cost.op, pct(cost.op, rev.total)))
  if (cost.off != null) L.push(line('Offline', cost.off, pct(cost.off, rev.total)))
  if (cost.corp != null) L.push(line('Corp. Overheads', cost.corp, pct(cost.corp, rev.total)))
  if (cost.people != null) L.push(line('People', cost.people, pct(cost.people, rev.total)))
  // People is often booked once a month rather than day by day. When that is so
  // the daily totals genuinely do not contain it, and saying so is the only
  // honest way to publish a margin off this sheet.
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
  tagline: 'Month to date, the latest completed day, and where revenue and cost actually sit.',
  what: [
    'Revenue, cost, net inflow and margin for the month so far',
    'The latest completed day on its own line',
    'Revenue by line and cost by head, each read against revenue',
    'The table image and a CSV land in the thread'
  ],
  build: buildB2C
}]
