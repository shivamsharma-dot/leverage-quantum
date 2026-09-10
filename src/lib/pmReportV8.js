// Slack PM report -- V8 builder: MTD Scorecard.
//
// A small, fixed executive scorecard requested directly (2026-09-10), matching an
// exact spreadsheet layout: month-to-date Spend/Leads/Total QLs/CPL/CPQL/Lead-to-QL%
// broken into Overall/Paid/Organic/Referral, plus a second table of Total QL,
// Applications this month, AC Sales (manual), a combined QL-to-outcome rate, and the
// QL daily run-rate. Two messages, one table each -- this file's own established
// "one table per message" convention (see V2/V3/V4).
//
// Everything here reads off ctx.mtdScorecard, which OverallDashboard.jsx fetches
// fresh (BigQuery agg table + apps_feed count + ac_sales_manual) the first time the
// Send-to-Slack panel opens in a session, independent of whatever date range/grouping
// the page itself currently has selected -- this report is always "this calendar
// month, to date," never whatever the viewer happens to be looking at.
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

const DASH = '—'
const pctText = n => (n == null ? DASH : n.toFixed(1) + '%')

const testLine = ctx => (ctx.isTest ? ':test_tube: *Test post* -- sent to the test channel to check formatting.' : null)

function scoreTable(rows, fmtINR, fmtN) {
  const t = { columns: ['', 'Marketing Spend', 'Total Leads', 'Total QLs', 'CPL', 'CPQL', 'Lead to QL %'], rows: [], strongRows: [] }
  rows.forEach(r => {
    const cpl = r.leads > 0 ? r.spend / r.leads : null
    const cpql = r.totalQL > 0 ? r.spend / r.totalQL : null
    const futworkQueued = r.futworkHumanQ + r.futworkAiQ
    const leadToQl = futworkQueued > 0 ? ((r.humanQL + r.futworkAiQl) / futworkQueued) * 100 : null
    if (r.label === 'Overall') t.strongRows.push(t.rows.length)
    t.rows.push([
      r.label, fmtINR(r.spend), fmtN(r.leads), fmtN(r.totalQL),
      cpl == null ? DASH : fmtINR(cpl), cpql == null ? DASH : fmtINR(cpql),
      pctText(leadToQl),
    ])
  })
  return t
}

function outcomesTable(s, fmtN) {
  return {
    columns: ['', 'Value'],
    rows: [
      ['Total QL (MTD)', fmtN(s.totalQL)],
      ['Applications this month', s.totalApps == null ? DASH : fmtN(s.totalApps)],
      ['AC Sales (manual)', s.acSales == null ? 'Not entered yet' : fmtN(s.acSales)],
      ['QL → Outcome %', pctText(s.qlSalePct)],
      ['QL daily run-rate', s.dailyRunRate == null ? DASH : fmtN(Math.round(s.dailyRunRate)) + ' / day'],
    ],
    strongRows: [],
  }
}

export function buildV8(ctx) {
  const s = ctx.mtdScorecard
  const fmtINR = ctx.fmtINR || (v => String(Math.round(v || 0)))
  const fmtN = ctx.fmtN || (v => String(Math.round(v || 0)))

  if (!s) {
    return [{ key: 'scorecard', label: 'MTD Scorecard', text: [testLine(ctx), '*:bar_chart: MTD Scorecard*', 'Still building this report — reopen the panel in a moment.'].filter(Boolean).join('\n') }]
  }
  if (s.ready === false) {
    return [{ key: 'scorecard', label: 'MTD Scorecard', text: [testLine(ctx), '*:bar_chart: MTD Scorecard*', 'Could not build this report: ' + (s.error || 'unknown error') + '. Try reopening the panel.'].filter(Boolean).join('\n') }]
  }

  const msgs = []
  const one = [
    testLine(ctx),
    '*:bar_chart: MTD Scorecard — ' + s.monthLabel + '*',
    '_Month to date · all sources · as of ' + s.asOfLabel + ' · Source: Overall (BigQuery cache)_',
  ]
  msgs.push({
    key: 'scorecard', label: 'Spend / Leads / QLs by channel',
    text: one.filter(Boolean).join('\n'),
    table: scoreTable(s.rows, fmtINR, fmtN),
    after: '_"Paid" = Facebook + Google + Affiliate + Bing + Remarketing. "Organic" includes the small "Others" bucket. "Lead to QL %" is Futwork Human QL + Futwork AI QL over Total Queued on Futwork — it excludes Superbot and Floor-routed leads, same definition used across the rest of Quantum._',
  })

  msgs.push({
    key: 'outcomes', label: 'QL, Apps, AC Sales',
    text: ['*:dart: Outcomes*', 'Total QL this month, applications, AC sales (manual), and how much of QL is turning into either.'].join('\n'),
    table: outcomesTable(s, fmtN),
    after: '_AC Sales is entered manually on the Marketing Review page — update it there if this figure looks stale._',
  })

  return msgs
}
