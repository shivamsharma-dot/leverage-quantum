// Super Tracker's Slack report. Same version-registry convention as every
// other report builder in this app (pmReport.js/b2cReport.js/careersReport.js
// -- {id, code, msgKeys, name, tagline, what[], build(ctx)}), consumed by the
// shared <SlackReportPanel> via its `versions` prop and posted through the
// existing generic `type: 'slack_report'` route on api/send-report.mjs (which
// just posts whatever pre-built `messages` array the client hands it -- no
// server-side import of this file needed).
//
// The report is the ACTUAL TRACKED FIGURES, not a compliance/completion read
// on them -- every table below is real values straight out of the sheet
// (Last week / This week, exactly as the sheet displays them), split into
// sections by the sheet's own S.No. grouping code (e.g. "CC01", "CC03", "R01")
// rather than shown as one flat per-metric list. Nothing here hardcodes a
// metric name or a group code -- both the groups and the figures come from
// whatever the sheet actually contains right now.

function weekValue(row, label) {
  const w = (row.weeks || []).find(x => x.label === label)
  return w ? w.value : ''
}

// The last two week columns IN SHEET ORDER -- not every section shares the
// same week set (a newer tab can start mid-quarter, one already carries 14
// weeks of history), so this is computed per section, never globally.
function latestTwoWeeks(section) {
  const labels = section.weekLabels || []
  return { cur: labels[labels.length - 1] || null, prev: labels.length > 1 ? labels[labels.length - 2] : null }
}

// Rows re-ordered so every S.No. group's rows sit next to each other, in the
// order each group first appears in the sheet -- this is the actual "split
// into sections" mechanism: a native Slack table has no header-row-per-group
// concept, so the Group column plus contiguous ordering is what makes the
// groups read as distinct sections once posted.
function groupSortedRows(rows) {
  const order = []
  const seen = new Set()
  rows.forEach(r => { const k = (r.sNo || '').trim() || '—'; if (!seen.has(k)) { seen.add(k); order.push(k) } })
  const out = []
  order.forEach(code => {
    rows.forEach(r => { if (((r.sNo || '').trim() || '—') === code) out.push({ ...r, __group: code }) })
  })
  return { rows: out, groupCount: order.length }
}

// -- native Slack table cells (max 20 cells/row, and a message's table rows
// together are kept under Slack's own real ~100-row / ~10,000-table-character
// ceiling -- both discovered empirically building the Overall reports; see
// SECTION_ROW_BUDGET below) ---------------------------------------------
const cellText = v => ({ type: 'raw_text', text: v == null || v === '' ? '—' : String(v) })
const cellBold = v => ({ type: 'rich_text', elements: [{ type: 'rich_text_section', elements: [{ type: 'text', text: v == null || v === '' ? '—' : String(v), style: { bold: true } }] }] })
const cellPlain = c => {
  if (!c) return ''
  if (c.type === 'raw_text') return c.text
  const el = c.elements && c.elements[0] && c.elements[0].elements && c.elements[0].elements[0]
  return el ? el.text : ''
}

// Safety margin under Slack's real per-message ceiling (~100 table rows,
// ~10,000 characters of table-cell text) -- several real sections here run
// close to or past 100 rows on their own (B2C Metrics is 135), so this is a
// hard budget, not a nicety.
const SECTION_ROW_BUDGET = 85
// Sections beyond this count are folded into one combined closing message,
// so the whole report can never exceed Slack's 6-message-per-report cap
// regardless of how many tabs the workbook grows to.
const MAX_INDIVIDUAL_SECTIONS = 5

function tableRowsFor(section, budget) {
  const { cur, prev } = latestTwoWeeks(section)
  const { rows, groupCount } = groupSortedRows(section.rows || [])
  const shown = rows.slice(0, budget)
  const head = ['Group', 'Metric', 'Business Line', 'Owner']
  if (prev) head.push('Last week (' + prev + ')')
  head.push('This week (' + (cur || '—') + ')')
  const body = shown.map(r => {
    const row = [r.__group, r.metric, r.businessLine || '—', r.owner || '—']
    if (prev) row.push(weekValue(r, prev))
    row.push(weekValue(r, cur))
    return row
  })
  return { head, body, total: rows.length, shown: shown.length, groupCount, cur, prev }
}

function tableBlock(blockId, head, body) {
  const cols = head.map((_, i) => (i < 4 ? { is_wrapped: true, align: 'left' } : { align: 'right' }))
  const tableRows = [head.map(cellBold), ...body.map(r => r.map(cellText))]
  return {
    blocks: [{ type: 'table', block_id: blockId, column_settings: cols, rows: tableRows }],
    table: { columns: tableRows[0].map(cellPlain), rows: tableRows.slice(1).map(r => r.map(cellPlain)) },
  }
}

// -- one message per section: the real figures, grouped by S.No. ------------
function buildSectionMessage(section, idx) {
  const t = tableRowsFor(section, SECTION_ROW_BUDGET)
  const title = ':ledger: *' + section.label + '*'
  const sub = '_' + t.total.toLocaleString('en-IN') + ' metric(s) across ' + t.groupCount + ' group(s), split by S.No. code' + (t.prev ? ', comparing ' + t.prev + ' to ' + t.cur : ', week of ' + (t.cur || '—')) + '._'
  const built = tableBlock('st_sec_' + idx, t.head, t.body)
  const overflow = t.total - t.shown
  const overflowLine = overflow > 0 ? '_...and ' + overflow.toLocaleString('en-IN') + ' more metric(s) in this section — full detail is in the CSV attached to this report._' : null
  return {
    key: 'section_' + idx,
    label: section.label,
    text: [title, sub].join('\n') + (overflowLine ? '\n\n' + overflowLine : ''),
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: title } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: sub }] },
      ...built.blocks,
      ...(overflowLine ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: overflowLine }] }] : []),
    ],
    table: built.table,
  }
}

// -- closing message: whatever sections didn't get their own message above,
// each still shown as its own real-figures table -- just a smaller slice of
// each, since several of them are sharing one message's row/character budget.
function buildCombinedMessage(sections) {
  const title = ':ledger: *' + sections.map(s => s.label).join(' · ') + '*'
  const L = [title, '_' + sections.length + ' more section(s), each split by S.No. code. Shown here at a smaller depth per section — the full detail for all of them is in the CSV attached to this report._']
  const blocks = [
    { type: 'section', text: { type: 'mrkdwn', text: title } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: L[1] }] },
  ]
  let tablePreview = null
  const perSectionBudget = Math.max(10, Math.floor(SECTION_ROW_BUDGET / sections.length))
  sections.forEach((section, i) => {
    const t = tableRowsFor(section, perSectionBudget)
    const subTitle = '*' + section.label + '*' + ' — ' + t.total.toLocaleString('en-IN') + ' metric(s), ' + t.groupCount + ' group(s)' + (t.prev ? ', ' + t.prev + ' vs ' + t.cur : ', week of ' + (t.cur || '—'))
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: subTitle }] })
    const built = tableBlock('st_comb_' + i, t.head, t.body)
    blocks.push(...built.blocks)
    if (!tablePreview) tablePreview = built.table // the in-app preview only ever mirrors the FIRST table -- see note below
    L.push(subTitle, ...built.table.rows.map(r => r.join(' | ')))
  })
  return {
    key: 'combined',
    label: 'More sections',
    text: L.join('\n'),
    blocks,
    // The Quantum in-app preview (TablePreview) only knows how to render one
    // {columns,rows} table per message, so a combined message with several
    // sub-tables previews as text (L above, already built) rather than a
    // single mis-matched table -- the REAL Slack send still gets every one
    // of the per-section table blocks pushed above, in full.
    table: null,
  }
}

function buildSuperTracker(ctx) {
  const sections = ctx.sections || []
  const messages = []
  const individual = sections.slice(0, MAX_INDIVIDUAL_SECTIONS)
  const rest = sections.slice(MAX_INDIVIDUAL_SECTIONS)
  individual.forEach((s, i) => messages.push(buildSectionMessage(s, i)))
  if (rest.length) messages.push(buildCombinedMessage(rest))
  if (ctx.isTest && messages.length) messages[messages.length - 1].text += '\n\n_Test send._'
  return messages
}

export const SUPER_TRACKER_REPORT_VERSIONS = [{
  id: 'super_tracker_v1',
  code: 'ST',
  msgKeys: ['section_0', 'section_1', 'section_2', 'section_3', 'section_4', 'combined'],
  name: 'Super Tracker — actual figures by section',
  tagline: 'Every real tracked value, split into sections by the sheet’s own S.No. grouping code.',
  what: [
    'One message per real workbook section (B2C, B2B, Fly Finance, Fly Homes, ...), each a native Slack table',
    'Every table split into sections by the sheet’s own S.No. code (e.g. CC01, CC03, R01) — not one flat metric list',
    'The actual Last week / This week value for every metric, exactly as the sheet shows it — no percentages, no derived scores',
    'A section over the row budget is truncated with a stated count; sections beyond the first 5 share one closing message',
    'The full flattened sheet (every section/metric/week) attached as a CSV',
  ],
  build: buildSuperTracker,
}]
