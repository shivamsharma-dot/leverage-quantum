// Leverage Careers' Slack report -- one message: KPI fields, the same
// Campaign/Month/Day table currently on screen, and a join-method footnote.
// Modeled on b2cReport.js's single-message shape (src/lib/b2cReport.js) --
// `table` here is the same plain {columns, rows, strongRows} shape
// api/send-report.mjs's slackTableBlock() turns into a real Slack native
// table, and SlackReportPanel.jsx's TablePreview renders identically before
// send -- there is no second code path that could drift from what's sent.

const fmtINR = n => n == null ? '—' : '₹' + Math.round(n).toLocaleString('en-IN')
const fmtN = n => n == null ? '—' : Math.round(n).toLocaleString('en-IN')
const pctStr = (a, b) => (b > 0 ? ((a / b) * 100).toFixed(1) + '%' : '—')
const fld = (label, value) => '*' + label + '*\n' + value

const DIM_LABEL = { campaign: 'Campaign', month: 'Month', day: 'Date' }

function buildCareers(ctx) {
  const c = ctx || {}
  const t = c.totals || {}
  const dim = c.tableDim || 'campaign'
  const dimLabel = DIM_LABEL[dim] || 'Campaign'

  const L = []
  L.push(':bar_chart: *Leverage Careers — Meta ↔ LeadSquared*')
  L.push('_' + (c.windowLabel || '') + ' — CRM leads joined to Meta ad spend by exact name, by ' + dimLabel.toLowerCase() + '._')

  const fields = [
    fld('Spend', fmtINR(t.spend)),
    fld('Meta Leads', fmtN(t.metaLeads)),
    fld('CRM Leads', fmtN(t.crmLeads)),
    fld('Interested', fmtN(t.interested)),
    fld('Won', fmtN(t.won)),
    fld('CPL (Meta)', fmtINR(t.cpl)),
    fld('CPL (CRM)', fmtINR(t.cplCrm)),
    fld('CPI', fmtINR(t.cpi)),
    fld('CPS', fmtINR(t.cps)),
    fld('CTR', pctStr(t.clicks, t.impressions)),
  ]

  const rows = (c.tableRows || []).slice(0, 24).map(r => [
    r.label, fmtINR(r.spend), fmtN(r.crmLeads), fmtN(r.interested), fmtN(r.won), fmtINR(r.cplCrm), fmtINR(r.cps),
  ])
  const totalRow = ['TOTAL', fmtINR(t.spend), fmtN(t.crmLeads), fmtN(t.interested), fmtN(t.won), fmtINR(t.cplCrm), fmtINR(t.cps)]
  const table = {
    columns: [dimLabel, 'Spend', 'CRM Leads', 'Interested', 'Won', 'CPL (CRM)', 'CPS'],
    rows: [totalRow, ...rows],
    strongRows: [0],
    wrapFirst: dim === 'campaign',
  }

  const contextParts = []
  if (c.matchedCount != null && c.campaignCount != null) {
    contextParts.push(c.matchedCount + ' of ' + c.campaignCount + ' names matched between Meta and LeadSquared this window.')
  }
  if (c.unmatchedCrmLeads > 0) {
    contextParts.push(fmtN(c.unmatchedCrmLeads) + ' LeadSquared lead(s) carried a campaign name that never matched a Meta ad with spend on the same day (included in the totals above).')
  }
  if (c.isTest) contextParts.push('Test send.')

  return [{
    key: 'leverage_careers',
    label: 'Leverage Careers — Meta ↔ LeadSquared',
    text: L.join('\n'),
    fields,
    table,
    context: contextParts.filter(Boolean).join(' '),
    attach: true,
  }]
}

export const CAREERS_REPORT_VERSIONS = [{
  id: 'leverage_careers',
  code: 'CAREERS',
  msgKeys: ['leverage_careers'],
  name: 'Leverage Careers — Meta ↔ LeadSquared',
  tagline: 'KPI fields, the on-screen table for whichever grouping is active, and a join-method note.',
  what: [
    'Spend, Meta Leads, CRM Leads, Interested, Won, and all four cost-per metrics (CPL Meta/CRM, CPI, CPS) plus CTR',
    'The same Campaign/Month/Day table currently on screen, TOTAL row first, up to 24 rows as a native Slack table',
    'How many LeadSquared names matched a Meta ad this window, and how many leads carried an unmatched name',
    'The table image and a full CSV land in the thread',
  ],
  build: buildCareers,
}]
