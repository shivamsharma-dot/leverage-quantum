// Slack PM report -- V6 builder: capacity arithmetic, for observation.
//
// V6 answers one question and nothing else: if the 10 L a day went to the cheapest campaigns
// that actually qualify leads, and no campaign were pushed past a daily spend it has already
// absorbed at least once inside the window, how many QLs would a day produce?
//
// It is deliberately not a CEO report. It is a model of a reallocation nobody has run yet, so
// it sits on its own version and says as much in its own words. The one discipline it keeps is
// that no input is invented: every CPQL is a campaign's own realised CPQL over the window, and
// every ceiling is a daily spend that campaign has already reached at least once.
//
// Everything comes from ctx.v6, built in OverallDashboard.jsx off the same day series V5 uses,
// so it is complete days only and always reads to D-1.

const DOT = ' \u00b7 '
const DASH = '\u2014'

const kpiLine = pairs => pairs
  .filter(p => p && p.value !== null && p.value !== '')
  .map(p => '*' + p.label + '* ' + p.value)
  .join(DOT)

const inr = (ctx, v) => (v == null ? DASH : ctx.fmtINR ? ctx.fmtINR(v) : String(Math.round(v)))
const num = (ctx, v) => (v == null ? DASH : ctx.fmtN ? ctx.fmtN(Math.round(v)) : String(Math.round(v)))

function capacityTable(ctx) {
  const v = ctx.v6
  const t = { columns: ['Campaign', 'Own CPQL', 'Daily ceiling', 'Allocated', 'QLs'], rows: [], strongRows: [] }
  v.picks.forEach(c => t.rows.push([
    c.label,
    inr(ctx, c.cpql),
    inr(ctx, c.ceiling),
    inr(ctx, c.allocated),
    num(ctx, c.qlAt),
  ]))
  if (v.picks.length) {
    t.strongRows.push(t.rows.length)
    t.rows.push([
      'MODEL TOTAL, ALL ' + v.usedCount,
      v.modelCpql == null ? DASH : inr(ctx, v.modelCpql),
      DASH,
      inr(ctx, v.modelSpend),
      num(ctx, v.modelQL),
    ])
  }
  return t
}

function msgCapacity(ctx) {
  const v = ctx.v6
  const text = [
    '*:test_tube: Capacity check ' + DASH + ' what ' + inr(ctx, v.budget) + ' a day can buy*',
    '_Observation only, a model of a reallocation rather than a result. Complete days only, to ' + v.lastLabel + '_',
    '',
    kpiLine([
      { label: 'Model', value: num(ctx, v.modelQL) + ' QLs a day at ' + inr(ctx, v.modelCpql) },
      { label: 'Actual now', value: num(ctx, v.actualQLPerDay) + ' QLs a day at ' + inr(ctx, v.actualCpql) },
    ]),
    kpiLine([
      { label: 'Gap', value: num(ctx, v.headroomQL) + ' QLs a day' },
      { label: 'Campaigns used', value: v.usedCount + ' of ' + v.poolCount + ' in the pool' },
      { label: 'Unplaced', value: v.unspent > 0 ? inr(ctx, v.unspent) : 'nil' },
    ]),
    '',
    '_Method: a campaign enters the pool if it was sent for qualification (' + v.minQueued
      + ' or more queued leads), produced QLs, and was still running in the last ' + v.recent
      + ' days. The pool is ordered by each campaign\u2019s own realised CPQL over the last ' + v.window
      + ' complete days and the budget fills it cheapest first. No campaign is allocated more than its '
      + v.pctlLabel + ' daily spend across the window, so no ceiling sits above a level it has already reached._',
    v.unspent > 0
      ? '_' + inr(ctx, v.unspent) + ' could not be placed: the pool ran out of proven daily capacity before the budget ran out. On this evidence capacity is the binding constraint, not price._'
      : '_The pool absorbed the whole budget inside its proven daily ceilings._',
    '_The model holds each campaign\u2019s CPQL flat as spend moves onto it. In practice CPQL rises as a campaign is pushed, so treat the figure as a ceiling on what a reallocation could reach, not a forecast._',
  ]
  return {
    key: 'capacity',
    label: 'Capacity check',
    text: text.filter(l => l !== null).join('\n'),
    table: capacityTable(ctx),
  }
}

export function buildV6(ctx) {
  const v = ctx && ctx.v6
  if (!v || !v.picks || !v.picks.length) {
    return [{
      key: 'capacity',
      label: 'Capacity check',
      text: '*:test_tube: Capacity check*\n\n'
        + 'No campaign in this dataset carries both a qualified lead history and spend on a complete day, so there is nothing to model yet.',
    }]
  }
  return [msgCapacity(ctx)]
}
