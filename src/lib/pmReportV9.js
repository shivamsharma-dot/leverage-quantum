// Slack PM report -- V9 builder: same two tables as V8 (Marketing Efficiency /
// Sales Efficiency), with a reshaped Sales Efficiency table (see outcomesTable's
// own comment below for the full spec/history).
//
// V9 briefly carried a "run-rate vs last month" trend line under message 1's
// headline (2026-09-10) -- removed 2026-09-11 per direct instruction ("remove
// this line from v9 asap"). The previous-month fetch that fed it was removed
// from OverallDashboard.jsx's mtdScorecard effect too, so nothing here still
// pays for that extra BigQuery query.
//
// Everything else -- the table columns, the SR/AC split, the Organic/Referral
// dash rule, the "complete days only" window, AC Sales living in Overall's own
// panel -- is unchanged from V8. See pmReportV8.js's own header comment for
// the full history of how those were arrived at; not repeated here.

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
    // "Total Leads" shows Futwork Queued, not Total Leads Generated (2026-09-11,
    // asked for directly) -- keeps the column's own denominator consistent with
    // what Lead to QL % actually divides by, rather than the two being two
    // different, independently-timestamped counts sitting side by side.
    t.rows.push([
      r.label, blankCost ? DASH : moneyCompact(r.spend), noQl ? DASH : fmtN(futworkQueued), noQl ? DASH : fmtN(r.totalQL),
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
  const one = [
    testLine(ctx),
    '*:bar_chart: Marketing Efficiency — ' + s.monthLabel + '*',
    dateLine,
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
