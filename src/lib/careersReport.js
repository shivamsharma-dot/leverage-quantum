// Leverage Careers' Slack report -- one message: KPI fields, the same
// grouping table currently on screen.
// Modeled on b2cReport.js's single-message shape (src/lib/b2cReport.js) --
// `table` here is the same plain {columns, rows, strongRows} shape
// api/send-report.mjs's slackTableBlock() turns into a real Slack native
// table, and SlackReportPanel.jsx's TablePreview renders identically before
// send -- there is no second code path that could drift from what's sent.

import { CAREERS_V2 } from './careersReportV2'
import { CAREERS_V3 } from './careersReportV3'

const fmtINR = n => n == null ? '—' : '₹' + Math.round(n).toLocaleString('en-IN')
const fmtN = n => n == null ? '—' : Math.round(n).toLocaleString('en-IN')
const pctStr = (a, b) => (b > 0 ? ((a / b) * 100).toFixed(1) + '%' : '—')
const fld = (label, value) => '*' + label + '*\n' + value

const DIM_LABEL = { campaign: 'Campaign', source: 'Source', subSource: 'Sub Source', month: 'Month', day: 'Date' }

function buildCareers(ctx) {
  const c = ctx || {}
  const t = c.totals || {}
  const dim = c.tableDim || 'campaign'
  const dimLabel = DIM_LABEL[dim] || 'Campaign'

  const L = []
  L.push(':bar_chart: *Leverage Careers*')
  L.push('_' + (c.windowLabel || '') + ' — spend, leads, interested and won, by ' + dimLabel.toLowerCase() + '._')

  const fields = [
    fld('Spend', fmtINR(t.spend)),
    fld('Leads', fmtN(t.leads)),
    fld('Interested', fmtN(t.interested)),
    fld('Won (Funnel)', fmtN(t.won)),
    fld('Won (Snapshot)', fmtN(t.wonSnapshot)),
    fld('CPL', fmtINR(t.cpl)),
    fld('CPI', fmtINR(t.cpi)),
    fld('CPS', fmtINR(t.cps)),
  ]

  const rows = (c.tableRows || []).slice(0, 24).map(r => [
    r.label, fmtINR(r.spend), fmtN(r.leads), fmtN(r.interested), fmtN(r.won), fmtN(r.wonSnapshot), fmtINR(r.cpl), fmtINR(r.cps),
  ])
  const totalRow = ['TOTAL', fmtINR(t.spend), fmtN(t.leads), fmtN(t.interested), fmtN(t.won), fmtN(t.wonSnapshot), fmtINR(t.cpl), fmtINR(t.cps)]
  const table = {
    columns: [dimLabel, 'Spend', 'Leads', 'Interested', 'Won (Funnel)', 'Won (Snapshot)', 'CPL', 'CPS'],
    rows: [totalRow, ...rows],
    strongRows: [0],
    wrapFirst: dim === 'campaign',
  }

  const contextParts = []
  if (c.isTest) contextParts.push('Test send.')

  return [{
    key: 'leverage_careers',
    label: 'Leverage Careers',
    text: L.join('\n'),
    fields,
    table,
    context: contextParts.filter(Boolean).join(' '),
    attach: true,
  }]
}

export const CAREERS_REPORT_VERSIONS = [CAREERS_V3, CAREERS_V2, {
  id: 'leverage_careers',
  code: 'CAREERS',
  msgKeys: ['leverage_careers'],
  name: 'Leverage Careers',
  tagline: 'KPI fields and the on-screen table for whichever grouping is active.',
  what: [
    'Spend, Leads, Interested, Won (Funnel), Won (Snapshot), and the cost-per metrics (CPL, CPI, CPS)',
    'The same Campaign/Source/Sub Source/Month/Day table currently on screen, TOTAL row first, up to 24 rows as a native Slack table',
    'The table image and a full CSV land in the thread',
  ],
  build: buildCareers,
}]
