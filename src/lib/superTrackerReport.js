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
// (exactly as the sheet displays them), split into sections by the sheet's
// own S.No. grouping code (e.g. "CC01", "CC03", "R01") rather than shown as
// one flat per-metric list. Nothing here hardcodes a metric name or a group
// code -- both the groups and the figures come from whatever the sheet
// actually contains right now.

function weekValue(row, label) {
  const w = (row.weeks || []).find(x => x.label === label)
  return w ? w.value : ''
}

// The literal LAST column is very often still blank -- a weekly tracker's
// current week fills in as the week actually happens, so "the last column"
// is frequently the one column guaranteed to have nothing in it yet (real,
// live example: 19-25 Oct and 12-18 Oct were both entirely blank across
// every B2C metric, while 24-30 Aug -- several columns earlier -- was fully
// populated). Walk backward from the last column to the first one that has
// AT LEAST ONE real value anywhere in the section, and report against THAT,
// so "this week" always means "the most recent week with real figures",
// never a guaranteed-empty one. Falls back to the literal last column only
// if truly nothing in the section has ever been filled in.
function latestPopulatedWeek(section) {
  const labels = section.weekLabels || []
  const rows = section.rows || []
  for (let i = labels.length - 1; i >= 0; i--) {
    if (rows.some(r => weekValue(r, labels[i]).trim() !== '')) {
      return { cur: labels[i], prev: i > 0 ? labels[i - 1] : null, curIsLatestColumn: i === labels.length - 1 }
    }
  }
  return { cur: labels[labels.length - 1] || null, prev: labels.length > 1 ? labels[labels.length - 2] : null, curIsLatestColumn: true }
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

// A REAL section/metric name can contain _, *, ~ or ` (confirmed live:
// "B2C Metrics_v2" and "30_Targets" are genuine tab names) -- and Slack's
// mrkdwn parses single underscores/asterisks/tildes as formatting delimiters
// wherever a block's text has type:'mrkdwn'. Left unescaped, "Metrics_v2"
// renders as "Metrics" + italic "v2", garbling the title. Escaping backslash-
// prefixes those four characters so they print literally. NOT needed inside
// table CELLS below -- those use type:'raw_text', which Slack never parses
// as mrkdwn in the first place.
function escMrkdwn(s) {
  return String(s == null ? '' : s).replace(/[_*~`]/g, c => '\\' + c)
}

// -- native Slack table cells (raw_text is literal, never mrkdwn-parsed) ----
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

function rowsFor(section, budget) {
  const { cur, prev, curIsLatestColumn } = latestPopulatedWeek(section)
  const { rows, groupCount } = groupSortedRows(section.rows || [])
  const shown = rows.slice(0, budget)
  return { shown, total: rows.length, groupCount, cur, prev, curIsLatestColumn }
}

// -- one message per section: the real figures, grouped by S.No. ------------
function buildSectionMessage(section, idx) {
  const t = rowsFor(section, SECTION_ROW_BUDGET)
  const title = ':ledger: *' + escMrkdwn(section.label) + '*'
  const staleNote = t.curIsLatestColumn ? '' : ' (the most recent column with any real value -- newer columns exist but are not yet filled in)'
  const sub = '_' + t.total.toLocaleString('en-IN') + ' metric(s) across ' + t.groupCount + ' group(s), split by S.No. code'
    + (t.prev ? ', comparing ' + t.prev + ' to ' + t.cur : ', week of ' + (t.cur || '—')) + staleNote + '._'
  const head = ['Group', 'Metric', 'Business Line', 'Owner']
  if (t.prev) head.push('Last week (' + t.prev + ')')
  head.push('This week (' + (t.cur || '—') + ')')
  const body = t.shown.map(r => {
    const row = [r.__group, r.metric, r.businessLine || '—', r.owner || '—']
    if (t.prev) row.push(weekValue(r, t.prev))
    row.push(weekValue(r, t.cur))
    return row
  })
  const cols = head.map((_, i) => (i < 4 ? { is_wrapped: true, align: 'left' } : { align: 'right' }))
  const tableRows = [head.map(cellBold), ...body.map(r => r.map(cellText))]
  const overflow = t.total - t.shown.length
  const overflowLine = overflow > 0 ? '_...and ' + overflow.toLocaleString('en-IN') + ' more metric(s) in this section — full detail is in the CSV attached to this report._' : null
  return {
    key: 'section_' + idx,
    label: section.label,
    text: [title, sub].join('\n') + (overflowLine ? '\n\n' + overflowLine : ''),
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: title } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: sub }] },
      { type: 'table', block_id: 'st_sec_' + idx, column_settings: cols, rows: tableRows },
      ...(overflowLine ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: overflowLine }] }] : []),
    ],
    table: { columns: tableRows[0].map(cellPlain), rows: tableRows.slice(1).map(r => r.map(cellPlain)) },
  }
}

// -- closing message: every remaining section, ONE combined native table ----
// (a Section column identifies which tab each row is from) rather than one
// table block per section -- Slack only reliably renders a single table
// block per message; a second table block in the same message silently fell
// back to a plain-text render in production (confirmed live -- see the
// commit this replaces). One table, many sections, is the fix.
function buildCombinedMessage(sections) {
  const title = ':ledger: *' + sections.map(s => escMrkdwn(s.label)).join(' · ') + '*'
  const sub = '_' + sections.length + ' more section(s), each still split by S.No. code, in one shared table. Full detail for all of them is in the CSV attached to this report._'
  const perSectionBudget = Math.max(8, Math.floor(SECTION_ROW_BUDGET / sections.length))
  const head = ['Section', 'Group', 'Metric', 'Business Line', 'Owner', 'Last week', 'This week']
  const body = []
  const overflowNotes = []
  sections.forEach(section => {
    const t = rowsFor(section, perSectionBudget)
    t.shown.forEach(r => body.push([
      section.label, r.__group, r.metric, r.businessLine || '—', r.owner || '—',
      t.prev ? weekValue(r, t.prev) + ' (' + t.prev + ')' : '—',
      weekValue(r, t.cur) + ' (' + (t.cur || '—') + ')',
    ]))
    const overflow = t.total - t.shown.length
    if (overflow > 0) overflowNotes.push(section.label + ': +' + overflow.toLocaleString('en-IN') + ' more')
  })
  const cols = head.map((_, i) => (i < 5 ? { is_wrapped: true, align: 'left' } : { align: 'right' }))
  const tableRows = [head.map(cellBold), ...body.map(r => r.map(cellText))]
  const overflowLine = overflowNotes.length ? '_Truncated per section — ' + overflowNotes.join(', ') + '. Full detail is in the CSV attached to this report._' : null
  return {
    key: 'combined',
    label: 'More sections',
    text: [title, sub].join('\n') + (overflowLine ? '\n\n' + overflowLine : ''),
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: title } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: sub }] },
      { type: 'table', block_id: 'st_combined', column_settings: cols, rows: tableRows },
      ...(overflowLine ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: overflowLine }] }] : []),
    ],
    table: { columns: tableRows[0].map(cellPlain), rows: tableRows.slice(1).map(r => r.map(cellPlain)) },
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
    'One message per real workbook section (B2C, B2B, Fly Finance, Fly Homes, ...), each ONE native Slack table',
    'Every table split into sections by the sheet’s own S.No. code (e.g. CC01, CC03, R01) — not one flat metric list',
    'The actual value for the most recent week that has real data (not a guaranteed-blank "latest column") — no percentages, no derived scores',
    'A section over the row budget is truncated with a stated count; sections beyond the first 5 share one closing message, still split by S.No. within one table',
    'The full flattened sheet (every section/metric/week) attached as a CSV',
  ],
  build: buildSuperTracker,
}]
