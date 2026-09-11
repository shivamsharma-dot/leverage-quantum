// Slack PM report -- V9 builder: same two tables as V8 (Marketing Efficiency /
// Sales Efficiency), plus one addition asked for directly (2026-09-10): a
// trend line under each headline comparing this month's run so far against
// last month, so the report reads at a glance instead of needing the reader
// to remember last month's numbers themselves.
//
// Per this app's own existing MTD Dashboard convention (documented in
// CLAUDE.md): a VOLUME metric (Total QL) trends on per-day running-average vs
// the previous month's own per-day average -- comparing raw totals would
// unfairly penalize an early-month read against a full previous month. A
// RATIO metric (Lead to QL %) trends on total vs total, since a rate does not
// need a run-rate adjustment the way a volume count does.
//
// Everything else -- the table columns, the SR/AC split, the Organic/Referral
// dash rule, the "complete days only" window, AC Sales living in Overall's own
// panel -- is unchanged from V8. See pmReportV8.js's own header comment for
// the full history of how those were arrived at; not repeated here.
//
// Slack's real table block only supports bold per cell (no cell color), so
// the "make it look better" ask was answered within what Slack can actually
// render: the trend line below, not a colored cell.

const DASH = '—'
const pctText = n => (n == null ? DASH : n.toFixed(1) + '%')

// Marketing Spend reads as crores/lakhs at exec scale (2026-09-10, asked for
// directly: "1.26 cr, 1.25 lakh etc") -- CPL/CPQL keep the exact-rupee fmtINR,
// staying small enough that a compact form would just be noise. Local helper
// (not imported from pmReportV8.js) since every version here is self-contained
// by this codebase's own convention.
const CR = 1e7, LAKH = 1e5
function moneyCompact(n) {
  const v = Number(n)
  if (!isFinite(v)) return DASH
  const a = Math.abs(v)
  if (a >= CR) return '₹' + (v / CR).toFixed(2) + ' Cr'
  if (a >= LAKH) return '₹' + (v / LAKH).toFixed(2) + ' L'
  return '₹' + Math.round(v).toLocaleString('en-IN')
}

const testLine = ctx => (ctx.isTest ? ':test_tube: *Test post* -- sent to the test channel to check formatting.' : null)

function scoreTable(rows, fmtINR, fmtN) {
  const t = { columns: ['', 'Marketing Spend', 'Total Leads', 'Total QLs', 'SR', 'AC', 'CPL', 'CPQL', 'Lead to QL %'], rows: [], strongRows: [] }
  rows.forEach(r => {
    const blankCost = r.label === 'Organic' || r.label === 'Referral'
    const noQl = r.label === 'Referral'
    const cpl = !blankCost && r.leads > 0 ? r.spend / r.leads : null
    const cpql = !blankCost && r.totalQL > 0 ? r.spend / r.totalQL : null
    const futworkQueued = r.futworkHumanQ + r.futworkAiQ
    const leadToQl = futworkQueued > 0 ? ((r.humanQL + r.futworkAiQl) / futworkQueued) * 100 : null
    if (r.label === 'Overall') t.strongRows.push(t.rows.length)
    t.rows.push([
      r.label, blankCost ? DASH : moneyCompact(r.spend), fmtN(r.leads), noQl ? DASH : fmtN(r.totalQL),
      noQl || r.srQl == null ? DASH : fmtN(r.srQl), noQl || r.acQl == null ? DASH : fmtN(r.acQl),
      cpl == null ? DASH : fmtINR(cpl), cpql == null ? DASH : fmtINR(cpql),
      pctText(leadToQl),
    ])
  })
  return t
}

// Reshaped 2026-09-11 per direct feedback + a real screenshot spec: message 2
// used to be a flat 2-column list (Total QL / SR / AC / Applications / AC Sales /
// QL -> Outcome % / QL daily run-rate as separate rows, one shared Outcome% for
// the whole month). Now it's a 4-column table with Total/SR/AC as ROWS, each
// with its OWN Applications-or-AC-Sales figure, its own Outcome %, and its own
// run-rate -- SR's outcome is tracked via Applications (this app's Applications
// metric has always effectively been the SR-vertical figure), AC's via the
// separate manually-entered AC Sales, and the Total row is their sum. Verified
// against a real screenshot before building: 198=165+33, 6%=198/3442,
// 9%=165/1764, 2%=33/1678, 344/176/168=Total/SR/AC QL over the same days-done --
// every cell reconciled exactly, confirming this is a pure reshape of fields
// mtdScorecard already computes, not a new metric.
//
// Percent cells here are a WHOLE number (Math.round, no decimal) -- confirmed
// against the screenshot ("6%" not "5.8%"), deliberately different from table
// 1's Lead to QL % (which keeps 1 decimal, untouched by this change).
function outcomesTable(s, fmtN) {
  const t = { columns: ['', 'Total QL', 'Applications/AC Sales', 'QL → Outcome %', 'QL daily run-rate'], rows: [], strongRows: [] }
  const pctWhole = (num, den) => (num == null || den == null || den <= 0) ? DASH : Math.round((num / den) * 100) + '%'
  const runRate = ql => (ql == null || s.daysDone == null || s.daysDone <= 0) ? DASH : fmtN(Math.round(ql / s.daysDone))

  // Total row -- Applications/AC Sales dashes out entirely (not a partial,
  // misleading Applications-only number) whenever AC Sales isn't entered yet,
  // matching the AC row's own dash rule below.
  const totalAppOrSales = s.acSales == null || s.totalApps == null ? null : s.totalApps + s.acSales
  t.strongRows.push(t.rows.length)
  t.rows.push(['', fmtN(s.totalQL), totalAppOrSales == null ? DASH : fmtN(totalAppOrSales), pctWhole(totalAppOrSales, s.totalQL), runRate(s.totalQL)])

  // SR/AC rows dash out if Monthly QLs' own pipeline didn't load this session
  // (qlSplitAvailable false) -- srQl/acQl default to 0 in that case, which would
  // otherwise misleadingly read as "zero SR/AC QLs" rather than "unknown".
  const srQl = s.qlSplitAvailable ? s.srQl : null
  const acQl = s.qlSplitAvailable ? s.acQl : null
  t.rows.push(['— SR', srQl == null ? DASH : fmtN(srQl), s.totalApps == null ? DASH : fmtN(s.totalApps), pctWhole(s.totalApps, srQl), runRate(srQl)])
  t.rows.push(['— AC', acQl == null ? DASH : fmtN(acQl), s.acSales == null ? DASH : fmtN(s.acSales), pctWhole(s.acSales, acQl), runRate(acQl)])

  // Superbot isn't split by vertical at all -- its own row only when it's
  // actually non-zero, dashed on the two columns that don't apply to it.
  if (s.superbotQl) t.rows.push(['— Superbot', fmtN(s.superbotQl), DASH, DASH, runRate(s.superbotQl)])

  return t
}

// Volume metric: per-day run-rate vs last month's own per-day average.
function runRateTrendText(s, fmtN) {
  if (s.prevMonthDailyRunRate == null || s.dailyRunRate == null || s.prevMonthDailyRunRate <= 0) return null
  const pct = ((s.dailyRunRate - s.prevMonthDailyRunRate) / s.prevMonthDailyRunRate) * 100
  const arrow = pct >= 0 ? '▲' : '▼'
  return arrow + Math.abs(pct).toFixed(0) + '% run-rate vs ' + s.prevMonthLabel + ' (' + fmtN(Math.round(s.dailyRunRate)) + '/day vs ' + fmtN(Math.round(s.prevMonthDailyRunRate)) + '/day)'
}

// Ratio metric: total vs total, no run-rate adjustment needed.
function leadToQlTrendText(s, leadToQlPct) {
  if (s.prevMonthLeadToQlPct == null || leadToQlPct == null) return null
  const ptDelta = leadToQlPct - s.prevMonthLeadToQlPct
  const arrow = ptDelta >= 0 ? '▲' : '▼'
  return arrow + Math.abs(ptDelta).toFixed(1) + 'pp Lead to QL vs ' + s.prevMonthLabel + ' (' + s.prevMonthLeadToQlPct.toFixed(1) + '%)'
}

export function buildV9(ctx) {
  const s = ctx.mtdScorecard
  const fmtINR = ctx.fmtINR || (v => String(Math.round(v || 0)))
  const fmtN = ctx.fmtN || (v => String(Math.round(v || 0)))

  if (!s) {
    return [{ key: 'scorecard', label: 'Marketing Efficiency', text: [testLine(ctx), '*:bar_chart: Marketing Efficiency*', 'Still building this report — reopen the panel in a moment.'].filter(Boolean).join('\n') }]
  }
  if (s.ready === false) {
    return [{ key: 'scorecard', label: 'Marketing Efficiency', text: [testLine(ctx), '*:bar_chart: Marketing Efficiency*', 'Could not build this report: ' + (s.error || 'unknown error') + '. Try reopening the panel.'].filter(Boolean).join('\n') }]
  }
  if (s.noCompleteDays) {
    return [{ key: 'scorecard', label: 'Marketing Efficiency', text: [testLine(ctx), '*:bar_chart: Marketing Efficiency — ' + s.monthLabel + '*', 'No complete day has happened yet this month — check back tomorrow.'].filter(Boolean).join('\n') }]
  }

  const msgs = []
  const table1 = scoreTable(s.rows, fmtINR, fmtN)
  const dateLine = '_' + s.monthLabel + ' 1st through ' + s.throughLabel + ' (complete days only)_'
  // Overall's own Lead to QL % (Quantum's narrow, app-wide definition -- Futwork
  // Human + AI QL over Total Queued on Futwork), recomputed here rather than
  // trusting a separately-stored field, so it can never drift from table1's own
  // Overall row.
  const overallBucket = (s.rows || []).find(r => r.label === 'Overall')
  const overallFutworkQueued = overallBucket ? overallBucket.futworkHumanQ + overallBucket.futworkAiQ : 0
  const leadToQlPct = overallBucket && overallFutworkQueued > 0
    ? ((overallBucket.humanQL + overallBucket.futworkAiQl) / overallFutworkQueued) * 100 : null
  const trendBits = [runRateTrendText(s, fmtN), leadToQlTrendText(s, leadToQlPct)].filter(Boolean)
  const one = [
    testLine(ctx),
    '*:bar_chart: Marketing Efficiency — ' + s.monthLabel + '*',
    dateLine,
    trendBits.length ? trendBits.join('  ·  ') : null,
  ]
  msgs.push({
    key: 'scorecard', label: 'Marketing Efficiency',
    text: one.filter(Boolean).join('\n'),
    table: table1,
  })

  const outcomes = outcomesTable(s, fmtN)
  const two = [
    '*:dart: Sales Efficiency*',
    dateLine,
  ]
  msgs.push({
    key: 'outcomes', label: 'Sales Efficiency',
    text: two.join('\n'),
    table: outcomes,
    // Visual gap from message 1 -- Slack otherwise groups two consecutive posts
    // from the same bot with no visible space (2026-09-10, asked for directly).
    leadingDivider: true,
  })

  return msgs
}
