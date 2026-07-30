// Slack PM report -- V5 builder: budget and QL efficiency.
//
// V5 answers three standing questions and deliberately nothing else:
//   1. Did Facebook + Google stay inside the 10 L a day budget, and was the day a bonus?
//   2. Which campaigns are the best optimised ones -- most QLs at the lowest CPQL?
//   3. Is CPQL running high anywhere, campaign or corridor?
//
// Every figure comes from ctx.v5, built in OverallDashboard.jsx off the day series. That
// series already drops the current day, so V5 is always a D-1 report and none of it moves
// when the date filter on screen changes.
//
// This file shares no helper with the rest of pmReport.js on purpose: V4 has to keep
// rendering exactly as it does today, so nothing here can reach it.

const DOT = ' \u00b7 '
const BUL = '\u2022 '
const DASH = '\u2014'

const list = arr => arr.filter(Boolean).map(s => BUL + s).join('\n')

const kpiLine = pairs => pairs
  .filter(p => p && p.value != null && p.value !== '')
  .map(p => '*' + p.label + '* ' + p.value)
  .join(DOT)

const inr = (ctx, v) => (v == null ? DASH : ctx.fmtINR ? ctx.fmtINR(v) : String(Math.round(v)))
const num = (ctx, v) => (v == null ? DASH : ctx.fmtN ? ctx.fmtN(Math.round(v)) : String(Math.round(v)))
const pct = (v, dp) => (v == null ? DASH : v.toFixed(dp == null ? 1 : dp) + '%')
const share = (part, whole) => (whole > 0 ? (part / whole) * 100 : null)
const times = (a, b) => (a != null && b > 0 ? (a / b).toFixed(2) + 'x' : DASH)

// A day is a bonus day when all three hold: it spent under the daily budget, it held CPQL
// at or below the frozen benchmark, and it still produced at least the trailing seven-day
// average of QLs. The flag itself is computed in the context builder; this only words it,
// and says which condition failed when it did not.
function bonusLine(ctx, d) {
  const v = ctx.v5
  if (!d) return null
  if (d.bonus) {
    return '*:white_check_mark: Bonus day* ' + DASH + ' ' + inr(ctx, d.spend) + ' spent under the '
      + inr(ctx, v.budget) + ' cap, CPQL ' + inr(ctx, d.cpql) + ' against the '
      + inr(ctx, v.benchmarkCpql) + ' benchmark, and ' + num(ctx, d.totalQL) + ' QLs against a '
      + num(ctx, d.avgQL) + ' seven-day average.'
  }
  const why = []
  if (d.spend >= v.budget) why.push(inr(ctx, d.spend) + ' spent, over the ' + inr(ctx, v.budget) + ' cap')
  if (d.cpql == null) why.push('no QLs recorded against the day')
  else if (v.benchmarkCpql != null && d.cpql > v.benchmarkCpql) {
    why.push('CPQL ' + inr(ctx, d.cpql) + ' is above the ' + inr(ctx, v.benchmarkCpql) + ' benchmark')
  }
  if (d.avgQL != null && d.totalQL < d.avgQL) {
    why.push(num(ctx, d.totalQL) + ' QLs is under the ' + num(ctx, d.avgQL) + ' seven-day average')
  }
  return '*Not a bonus day* ' + DASH + ' ' + (why.length ? why.join('; ') : 'conditions not met') + '.'
}

function dayTable(ctx) {
  const v = ctx.v5
  const t = { columns: ['Day', 'Spend', 'Budget used', 'QLs', 'CPQL', 'Bonus'], rows: [], strongRows: [] }
  v.days.forEach(d => t.rows.push([
    d.label,
    inr(ctx, d.spend),
    pct(share(d.spend, v.budget), 0),
    num(ctx, d.totalQL),
    d.cpql == null ? DASH : inr(ctx, d.cpql),
    d.bonus ? 'yes' : DASH,
  ]))
  return t
}

// Over the rolling window the spend splits in two: campaigns whose leads were sent on for
// qualification, and campaigns whose leads went straight to the floor. The second group cannot
// produce a QL, so naming its spend here is what makes the all-in CPQL above readable, and it
// is also why no campaign or corridor list in this report is drawn from it.
function trackLine(ctx) {
  const v = ctx.v5
  if (!v.floorOnlySpend || v.floorOnlySpend <= 0) return null
  return '_Of ' + inr(ctx, v.winSpend) + ' over the last ' + v.dayCount + ' complete days, '
    + inr(ctx, v.trackSpend) + ' ran on the ' + v.trackCampaignCount + ' campaigns sent for qualification, '
    + 'at ' + inr(ctx, v.trackCpql) + ' a QL. The other ' + inr(ctx, v.floorOnlySpend)
    + ' ran on campaigns routed straight to the floor, which carry no QL by design._'
}

// The target is the band the team is working to. The line underneath it says what the data
// currently supports, so the band is never presented as though it fell out of the numbers.
function targetLine(ctx) {
  const v = ctx.v5
  if (v.impliedQL == null) return null
  return '_Target is ' + num(ctx, v.targetLow) + ' to ' + num(ctx, v.targetHigh)
    + ' QLs a day. At the ' + inr(ctx, v.trackCpql) + ' qualifying track CPQL the '
    + inr(ctx, v.budget) + ' cap supports ' + num(ctx, v.impliedQL) + ' QLs a day._'
}


function msgBudget(ctx) {
  const v = ctx.v5
  const y = v.yday
  const r7 = v.last7 || {}
  const p7 = v.prev7 || {}
  const text = [
    '*:bar_chart: Overall ' + DASH + ' budget and QL efficiency*',
    '_Facebook + Google only, complete days only, to ' + v.lastLabel + '_',
    '',
    '*' + v.lastLabel + '*',
    kpiLine([
      { label: 'Spend', value: inr(ctx, y.spend) + ' of ' + inr(ctx, v.budget) },
      { label: 'Budget used', value: pct(share(y.spend, v.budget), 0) },
    ]),
    kpiLine([
      { label: 'QLs', value: num(ctx, y.totalQL) },
      { label: 'CPQL', value: y.cpql == null ? DASH : inr(ctx, y.cpql) },
      { label: 'Target a day', value: num(ctx, v.targetLow) + ' to ' + num(ctx, v.targetHigh) + ' QLs' },
    ]),
    bonusLine(ctx, y),
    trackLine(ctx),
    targetLine(ctx),
    '',
    '*Last 7 complete days*',
    kpiLine([
      { label: 'Spend', value: inr(ctx, r7.spend) },
      { label: 'QLs', value: num(ctx, r7.totalQL) },
      { label: 'CPQL', value: r7.cpql == null ? DASH : inr(ctx, r7.cpql) },
    ]),
    kpiLine([
      { label: 'Seven before that', value: p7.cpql == null ? DASH : inr(ctx, p7.cpql) + ' a QL on ' + inr(ctx, p7.spend) },
      { label: 'Bonus days', value: v.bonus7 + ' of the last 7' },
    ]),
    '',
    '_A bonus day spends under ' + inr(ctx, v.budget) + ', holds CPQL at or below the '
      + inr(ctx, v.benchmarkCpql) + ' benchmark, and still clears its own trailing seven-day QL average. '
      + v.bonus30 + ' of the last ' + v.dayCount + ' complete days qualified._',
  ]
  return {
    key: 'budget',
    label: 'Budget scorecard',
    text: text.filter(l => l != null).join('\n'),
    table: dayTable(ctx),
  }
}

function msgBest(ctx) {
  const v = ctx.v5
  const t = { columns: ['Campaign', 'Spend', 'Share of spend', 'QLs', 'CPQL'], rows: [], strongRows: [] }
  const top = v.eligible.slice(0, 12)
  top.forEach(c => t.rows.push([
    c.label,
    inr(ctx, c.spend),
    pct(share(c.spend, v.winSpend), 1),
    num(ctx, c.totalQL),
    inr(ctx, c.cpql),
  ]))
  if (top.length) {
    const sp = v.eligible.reduce((s, c) => s + c.spend, 0)
    const ql = v.eligible.reduce((s, c) => s + c.totalQL, 0)
    t.strongRows.push(t.rows.length)
    t.rows.push([
      'ALL ' + v.eligible.length + ' QUALIFYING',
      inr(ctx, sp),
      pct(share(sp, v.winSpend), 1),
      num(ctx, ql),
      ql > 0 ? inr(ctx, sp / ql) : DASH,
    ])
  }
  const text = [
    '*:mag: Best optimised campaigns*',
    '_Rolling ' + v.window + ' complete days to ' + v.lastLabel + ', Facebook + Google_',
    '',
    kpiLine([
      { label: 'All-in CPQL', value: inr(ctx, v.blended) },
      { label: 'Qualifying track', value: inr(ctx, v.trackCpql) },
      { label: 'Supports a day', value: v.impliedQL == null ? DASH : num(ctx, v.impliedQL) + ' QLs at ' + inr(ctx, v.budget) },
    ]),
    '',
    top.length
      ? '_A campaign qualifies on ' + v.minQL + ' or more QLs, at least ' + inr(ctx, v.minBreachSpend)
        + ' of spend, and a CPQL at or below the ' + inr(ctx, v.trackCpql) + ' qualifying track average. Cheapest first._'
      : '_No campaign cleared ' + v.minQL + ' QLs at or below the ' + inr(ctx, v.trackCpql) + ' qualifying track average in this window._',
    '_Campaigns whose leads were never sent for qualification are out of this list and out of the '
      + 'figures above: with no queued leads there is no cost per QL to earn a place._',
  ]
  const corr = (v.corridors || [])
    .filter(c => c.totalQL >= v.minQL && c.cpql != null)
    .sort((a, b) => a.cpql - b.cpql)
  const after = corr.length
    ? '*Corridors, cheapest CPQL first*\n' + list(corr.slice(0, 6).map(c => '*' + c.label + '* '
        + inr(ctx, c.cpql) + ' a QL on ' + inr(ctx, c.spend) + ' for ' + num(ctx, c.totalQL) + ' QLs'))
    : null
  const out = { key: 'best', label: 'Best optimised campaigns', text: text.filter(l => l != null).join('\n') }
  if (top.length) out.table = t
  if (after) out.after = after
  return out
}

function msgBreach(ctx) {
  const v = ctx.v5
  const line = v.trackCpql == null ? null : inr(ctx, v.trackCpql * v.breachMult)
  const t = { columns: ['Campaign', 'Spend', 'QLs', 'CPQL', 'vs track', 'Above track rate'], rows: [], strongRows: [] }
  v.breachCamp.slice(0, 12).forEach(c => t.rows.push([
    c.label, inr(ctx, c.spend), num(ctx, c.totalQL), inr(ctx, c.cpql),
    times(c.cpql, v.trackCpql), inr(ctx, c.excess),
  ]))
  const text = [
    '*:warning: CPQL running high*',
    '_Rolling ' + v.window + ' complete days to ' + v.lastLabel + ', flagged above ' + v.breachMult
      + 'x the ' + inr(ctx, v.trackCpql) + ' qualifying track CPQL' + (line ? ', so above ' + line : '') + '_',
    '',
    v.breachCamp.length
      ? '*' + v.breachCamp.length + ' campaigns* sit over the line, together ' + inr(ctx, v.excessTotal)
        + ' above what the qualifying track rate would have charged for the same QLs. Ordered by that amount, '
        + 'so the list leads on money at stake rather than on a ratio. Only campaigns carrying at least '
        + inr(ctx, v.minBreachSpend) + ' of spend are listed, so a few hundred rupees cannot raise a flag.'
      : '*No campaign is over the line.* Every campaign carrying at least ' + inr(ctx, v.minBreachSpend)
        + ' of spend is inside ' + v.breachMult + 'x the qualifying track CPQL.',
  ]
  const parts = []
  const corr = v.breachCorr || []
  if (corr.length) {
    parts.push('*Corridors over the line*\n' + list(corr.slice(0, 5).map(c => '*' + c.label + '* '
      + inr(ctx, c.cpql) + ' a QL, ' + times(c.cpql, v.trackCpql) + ' the qualifying track, '
      + inr(ctx, c.excess) + ' above its rate on ' + inr(ctx, c.spend))))
  }
  if (v.zeroQL && v.zeroQL.length) {
    const sp = v.zeroQL.reduce((s, c) => s + c.spend, 0)
    parts.push('*Spend with no QLs at all*\n' + list(v.zeroQL.slice(0, 6).map(c => '`' + c.label + '` '
      + inr(ctx, c.spend) + ', zero QLs'))
      + '\n_' + v.zeroQL.length + ' campaigns, ' + inr(ctx, sp) + ' in total. Every one of these was sent for qualification and returned nothing, so they have no CPQL to rank and sit outside the flag above._')
  }
  const out = { key: 'breach', label: 'CPQL running high', text: text.filter(l => l != null).join('\n') }
  if (v.breachCamp.length) out.table = t
  if (parts.length) out.after = parts.join('\n\n')
  return out
}

export function buildV5(ctx) {
  const v = ctx && ctx.v5
  if (!v || !v.days || !v.days.length) {
    return [{
      key: 'budget',
      label: 'Budget scorecard',
      text: '*:bar_chart: Overall ' + DASH + ' budget and QL efficiency*\n\n'
        + 'No complete day of Facebook or Google spend is present in this dataset, so there is nothing to report yet.',
    }]
  }
  return [msgBudget(ctx), msgBest(ctx), msgBreach(ctx)]
}
