// Slack PM report -- V8 builder: Marketing Efficiency / Sales Efficiency.
//
// A small, fixed executive scorecard requested directly (2026-09-10), matching an
// exact spreadsheet layout: month-to-date Spend/Leads/Total QLs/CPL/CPQL/Lead-to-QL%
// (plus the SR/AC QL split) broken into Overall/Paid/Organic/Referral, then a second
// table of Total QL, its SR/AC split, Applications this month, AC Sales (manual),
// a combined QL-to-outcome rate, and the QL daily run-rate. Two messages, one table
// each -- this file's own established "one table per message" convention (V2/V3/V4).
//
// Renamed 2026-09-10 per direct feedback: message 1 is "Marketing Efficiency"
// (channel-level spend/CPL/CPQL -- literally what each channel costs to run),
// message 2 is "Sales Efficiency" (QL through to an actual outcome -- what the
// funnel is converting into).
//
// Everything here reads off ctx.mtdScorecard, which OverallDashboard.jsx fetches
// fresh (BigQuery agg table + apps_feed count + ac_sales_manual + Monthly QLs'
// SR/AC split) the first time the Send-to-Slack panel opens in a session,
// independent of whatever date range/grouping the page itself currently has
// selected -- this report is always "this calendar month, through the last
// COMPLETE day," never whatever the viewer happens to be looking at, and never
// today's still-accumulating, partial numbers (same "complete days only"
// convention as every other exec report in this app -- V5/V7, B2C's D-1 rule).
// A real mismatch against the live Overall dashboard was traced directly to an
// earlier version of this window running through TODAY instead -- fixed at the
// source in OverallDashboard.jsx, not papered over here.
//
// "Paid" = Facebook + Google + Affiliate + Bing + Remarketing, Quantum's own existing
// isPaidSource() rule (confirmed with the requester rather than assumed). "Organic"
// absorbs the "Others" bucket too (also confirmed), so Overall = Paid + Organic +
// Referral exactly, with no leftover unaccounted-for row. "Lead to QL %" is Quantum's
// own existing, narrower definition used everywhere else in this app -- (Futwork
// Human QL + Futwork AI QL) / Total Queued on Futwork, excluding Superbot and
// Floor-routed leads entirely -- NOT a plain Total QL / Total Leads rate, confirmed
// directly since the two read very differently and the requester picked the narrow
// one to match the rest of the app.
//
// Organic and Referral rows show Marketing Spend/CPL/CPQL as a dash always, even
// when a small non-zero figure exists (2026-09-10 feedback) -- neither is a real
// paid-media channel, so a stray ₹0-ish spend/cost figure there reads as noise, not
// signal. The underlying numbers are still summed correctly in ctx.mtdScorecard
// (nothing is discarded) -- only the DISPLAY is blanked for these two rows.
//
// SR/AC QL split: Overall's own data has no vertical dimension on QL itself (only
// Applications carry a Vertical), so this comes from Monthly QLs' own, independently
// synced BigQuery pipeline (2026-09-10 feedback: "QL split can be taken from Monthly
// QLs page"). Superbot QL isn't split by vertical in that pipeline -- if it's
// non-zero for the period, it's disclosed as its own line rather than silently
// folded into either SR or AC.

const DASH = '—'
const pctText = n => (n == null ? DASH : n.toFixed(1) + '%')

const testLine = ctx => (ctx.isTest ? ':test_tube: *Test post* -- sent to the test channel to check formatting.' : null)

function scoreTable(rows, fmtINR, fmtN) {
  const t = { columns: ['', 'Marketing Spend', 'Total Leads', 'Total QLs', 'SR', 'AC', 'CPL', 'CPQL', 'Lead to QL %'], rows: [], strongRows: [] }
  rows.forEach(r => {
    const blankCost = r.label === 'Organic' || r.label === 'Referral'
    const cpl = !blankCost && r.leads > 0 ? r.spend / r.leads : null
    const cpql = !blankCost && r.totalQL > 0 ? r.spend / r.totalQL : null
    const futworkQueued = r.futworkHumanQ + r.futworkAiQ
    const leadToQl = futworkQueued > 0 ? ((r.humanQL + r.futworkAiQl) / futworkQueued) * 100 : null
    if (r.label === 'Overall') t.strongRows.push(t.rows.length)
    t.rows.push([
      r.label, blankCost ? DASH : fmtINR(r.spend), fmtN(r.leads), fmtN(r.totalQL),
      fmtN(r.srQl), fmtN(r.acQl),
      cpl == null ? DASH : fmtINR(cpl), cpql == null ? DASH : fmtINR(cpql),
      pctText(leadToQl),
    ])
  })
  return t
}

function outcomesTable(s, fmtN) {
  const rows = [
    ['Total QL (MTD)', fmtN(s.totalQL)],
  ]
  if (s.qlSplitAvailable) {
    rows.push(['— SR', fmtN(s.srQl)], ['— AC', fmtN(s.acQl)])
    if (s.superbotQl) rows.push(['— Superbot (not split by vertical)', fmtN(s.superbotQl)])
  }
  rows.push(
    ['Applications this month', s.totalApps == null ? DASH : fmtN(s.totalApps)],
    ['AC Sales', s.acSales == null ? 'Not entered yet' : fmtN(s.acSales)],
    ['QL → Outcome %', pctText(s.qlSalePct)],
    ['QL daily run-rate', s.dailyRunRate == null ? DASH : fmtN(Math.round(s.dailyRunRate)) + ' / day'],
  )
  return { columns: ['', 'Value'], rows, strongRows: [] }
}

export function buildV8(ctx) {
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
  // Reuses the table's own already-computed Overall row (index 0, always present)
  // rather than a third independent recomputation of the same ratio.
  const [, ovSpend, ovLeads, ovTotalQL, , , , , ovLeadToQl] = table1.rows[0]
  const one = [
    testLine(ctx),
    '*:bar_chart: Marketing Efficiency — ' + s.monthLabel + '*',
    '_' + s.monthLabel + ' 1st through ' + s.throughLabel + ' (complete days only) · all sources · Source: Overall (BigQuery cache)_',
    '',
    'Overall this month: *' + ovSpend + '* spent, *' + ovLeads + '* leads, *' + ovTotalQL + '* QLs at *' + ovLeadToQl + '* Lead to QL.',
  ]
  msgs.push({
    key: 'scorecard', label: 'Marketing Efficiency',
    text: one.filter(Boolean).join('\n'),
    table: table1,
    after: '_"Paid" = Facebook + Google + Affiliate + Bing + Remarketing. "Organic" includes the small "Others" bucket; Organic and Referral don\'t run real media spend, so their Spend/CPL/CPQL show as a dash rather than a stray near-zero figure. SR/AC is the QL split by vertical (from Monthly QLs). "Lead to QL %" is Futwork Human QL + Futwork AI QL over Total Queued on Futwork — it excludes Superbot and Floor-routed leads, same definition used across the rest of Quantum._',
  })

  const outcomes = outcomesTable(s, fmtN)
  const two = [
    '*:dart: Sales Efficiency*',
    'Total QL this month — split by vertical — against applications, AC sales, and how much of QL is turning into either.',
  ]
  msgs.push({
    key: 'outcomes', label: 'Sales Efficiency',
    text: two.join('\n'),
    table: outcomes,
    after: '_AC Sales, QL → Outcome % and the run-rate all read off the figures above them._',
  })

  return msgs
}
