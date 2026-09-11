// Slack PM report -- V8 builder: Marketing Efficiency / Sales Efficiency.
//
// A small, fixed executive scorecard requested directly (2026-09-10), matching an
// exact spreadsheet layout: month-to-date Spend/Leads/Total QLs/CPL/CPQL/Lead-to-QL%
// (plus the SR/AC QL split) broken into Overall/Paid/Organic/Referral, then a second
// table of Total QL, its SR/AC split, Applications this month, AC Sales, a combined
// QL-to-outcome rate, and the QL daily run-rate. Two messages, one table each --
// this file's own established "one table per message" convention (V2/V3/V4).
//
// Renamed 2026-09-10 per direct feedback: message 1 is "Marketing Efficiency"
// (channel-level spend/CPL/CPQL -- literally what each channel costs to run),
// message 2 is "Sales Efficiency" (QL through to an actual outcome -- what the
// funnel is converting into).
//
// AC Sales here is entered directly in Overall's own Send-to-Slack panel (its
// editor lives in OverallDashboard.jsx, rendered via SlackReportPanel's extraHeader
// slot) -- a deliberately SEPARATE stored value (overall_ac_sales_manual) from
// Marketing Review's own AC Sales (ac_sales_manual), per explicit instruction
// (2026-09-10: "keep both separate ... it should be filled from here, through the
// panel"). The two numbers can legitimately differ -- this one is always the live
// current month, Marketing Review's is whatever month that review deck covers.
//
// Everything here reads off ctx.mtdScorecard, which OverallDashboard.jsx fetches
// fresh (BigQuery agg table + apps_feed count + Monthly QLs' SR/AC split) the first
// time the Send-to-Slack panel opens in a session, independent of whatever date
// range/grouping the page itself currently has selected -- this report is always
// "this calendar month, through the last COMPLETE day," never whatever the viewer
// happens to be looking at, and never today's still-accumulating, partial numbers
// (same "complete days only" convention as every other exec report in this app --
// V5/V7, B2C's D-1 rule). A real mismatch against the live Overall dashboard was
// traced directly to an earlier version of this window running through TODAY
// instead -- fixed at the source in OverallDashboard.jsx, not papered over here.
// AC Sales itself is the one exception: it's re-derived reactively off the panel's
// own live editor state (mtdScorecardForReport in OverallDashboard.jsx), not frozen
// at the moment the rest of this fetch resolved -- so editing it updates the preview
// immediately.
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

// Marketing Spend reads as crores/lakhs at exec scale (2026-09-10, asked for
// directly: "1.26 cr, 1.25 lakh etc") -- the exact-rupee fmtINR is still used for
// CPL/CPQL, which stay small enough that a compact form would just be noise.
// A local helper rather than importing pmReport.js's own money() -- pmReport.js
// imports buildV8 FROM this file, so importing back would be a circular import;
// every version here is self-contained by this codebase's own convention anyway.
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
    // Referral leads are never sent for qualification at all (a structural fact, not
    // just "zero this period") -- Total QLs/SR/AC show a dash there, not a 0.
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

function outcomesTable(s, fmtN) {
  const rows = [
    ['Total QL', fmtN(s.totalQL)],
  ]
  if (s.qlSplitAvailable) {
    rows.push(['— SR', s.srQl == null ? DASH : fmtN(s.srQl)], ['— AC', s.acQl == null ? DASH : fmtN(s.acQl)])
    if (s.superbotQl) rows.push(['— Superbot (not split by vertical)', fmtN(s.superbotQl)])
  }
  rows.push(
    ['Applications', s.totalApps == null ? DASH : fmtN(s.totalApps)],
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
