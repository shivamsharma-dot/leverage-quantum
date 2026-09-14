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
// (exactly as the sheet displays them), grouped by CATEGORY (the sheet's own
// "Reference Categories" mapping, e.g. "Content & Community") and then by
// the finer S.No. code (e.g. "CC01") within it. Only rows flagged
// To be posted? = Yes are ever included -- silently; this file never mentions
// that filter in the report text itself.

function isYes(v) {
  return /^(y|yes)$/i.test(String(v || '').trim())
}

function weekValue(row, label) {
  const w = (row.weeks || []).find(x => x.label === label)
  return w ? w.value : ''
}

// A manual week (ctx.weekOverride, picked in the Send-to-Slack modal) always
// wins when the section actually has that column. Otherwise: the literal
// LAST column is very often still blank or barely started -- a weekly
// tracker's current week fills in AS the week happens -- so "any row has a
// value" is too low a bar (a column with 1 of 135 rows filled still passes
// that and still reads as empty). Walk backward to the most recent column
// where at least HALF the section's rows have a real value, so the default
// "this week" is one actually worth reading, not merely non-empty. Falls
// back to whichever single column has the highest population if none clear
// that bar.
const POPULATED_THRESHOLD = 0.5
function latestPopulatedWeek(section, weekOverride) {
  const labels = section.weekLabels || []
  const rows = section.rows || []
  if (weekOverride && labels.includes(weekOverride)) {
    const i = labels.indexOf(weekOverride)
    return { cur: labels[i], prev: i > 0 ? labels[i - 1] : null, curIsLatestColumn: i === labels.length - 1, manual: true }
  }
  if (!labels.length || !rows.length) return { cur: labels[labels.length - 1] || null, prev: null, curIsLatestColumn: true, manual: false }
  const fractionFor = i => rows.filter(r => weekValue(r, labels[i]).trim() !== '').length / rows.length
  for (let i = labels.length - 1; i >= 0; i--) {
    if (fractionFor(i) >= POPULATED_THRESHOLD) {
      return { cur: labels[i], prev: i > 0 ? labels[i - 1] : null, curIsLatestColumn: i === labels.length - 1, manual: false }
    }
  }
  let best = labels.length - 1
  for (let i = labels.length - 2; i >= 0; i--) if (fractionFor(i) > fractionFor(best)) best = i
  return { cur: labels[best] || null, prev: best > 0 ? labels[best - 1] : null, curIsLatestColumn: best === labels.length - 1, manual: false }
}

// Two-level grouping -- Category (bigger, e.g. "Content & Community") then
// S.No. code (finer, e.g. "CC01") -- flattened back into one ordered row
// list. Category order follows the sheet's OWN "Reference Categories" order
// (categoryOrder, passed through from ctx) when available, so the same
// category always lands in the same position across every section and every
// send, rather than "whichever category this section's rows happen to
// mention first". A category present in the data but missing from that list
// (a brand-new S.No. prefix, or a genuinely uncategorised row) is still
// shown, just appended after the known ones rather than dropped.
function groupRows(rows, categoryOrder) {
  const catSeen = new Set(rows.map(r => r.category || 'Uncategorized'))
  const ordered = (categoryOrder || []).filter(c => catSeen.has(c))
  rows.forEach(r => { const c = r.category || 'Uncategorized'; if (!ordered.includes(c)) ordered.push(c) })
  const out = []
  let groupCount = 0
  ordered.forEach(cat => {
    const inCat = rows.filter(r => (r.category || 'Uncategorized') === cat)
    const codeOrder = []
    const seen = new Set()
    inCat.forEach(r => { const k = (r.sNo || '').trim() || '—'; if (!seen.has(k)) { seen.add(k); codeOrder.push(k) } })
    groupCount += codeOrder.length
    const sorted = []
    codeOrder.forEach(code => inCat.forEach(r => { if (((r.sNo || '').trim() || '—') === code) sorted.push({ ...r, __group: code, __category: cat }) }))
    out.push(...sorted)
  })
  return { rows: out, categoryCount: ordered.length, groupCount }
}

// A REAL section/metric name can contain _, *, ~ or ` (confirmed live:
// "B2C Metrics_v2" and "30_Targets" are genuine tab names) -- and Slack's
// mrkdwn parses single underscores/asterisks/tildes as formatting delimiters
// wherever a block's text has type:'mrkdwn'. Escaping backslash-prefixes
// those four characters so they print literally. NOT needed inside table
// CELLS below -- those use type:'raw_text', which Slack never parses as
// mrkdwn in the first place.
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
// close to or past 100 rows on their own (B2C Metrics is 135 before the
// To be posted?=Yes filter), so this is a hard budget, not a nicety.
const SECTION_ROW_BUDGET = 85
// Sections beyond this count are folded into one combined closing message,
// so the whole report can never exceed Slack's 6-message-per-report cap
// regardless of how many tabs the workbook grows to.
const MAX_INDIVIDUAL_SECTIONS = 5

function messageRowsFor(section, budget, weekOverride, categoryOrder) {
  const t = latestPopulatedWeek(section, weekOverride)
  const postedRows = (section.rows || []).filter(r => isYes(r.toBePosted))
  const { rows, categoryCount, groupCount } = groupRows(postedRows, categoryOrder)
  const shown = rows.slice(0, budget)
  return { shown, total: rows.length, categoryCount, groupCount, cur: t.cur, prev: t.prev, curIsLatestColumn: t.curIsLatestColumn, manual: t.manual }
}

// -- one message per section: the real figures, grouped by category then S.No.
function buildSectionMessage(section, idx, weekOverride, categoryOrder) {
  const t = messageRowsFor(section, SECTION_ROW_BUDGET, weekOverride, categoryOrder)
  const title = ':ledger: *' + escMrkdwn(section.label) + '*'
  const staleNote = t.manual ? '' : (t.curIsLatestColumn ? '' : ' (the most recent column that’s actually filled in — newer columns exist but are still mostly blank)')
  const sub = '_' + t.total.toLocaleString('en-IN') + ' metric(s) across ' + t.categoryCount + ' categor' + (t.categoryCount === 1 ? 'y' : 'ies') + ' and ' + t.groupCount + ' group(s)'
    + (t.prev ? ', comparing ' + t.prev + ' to ' + t.cur : ', week of ' + (t.cur || '—')) + staleNote + '._'
  const head = ['Category', 'Group', 'Metric', 'Business Line', 'Owner']
  if (t.prev) head.push('Last week (' + t.prev + ')')
  head.push('This week (' + (t.cur || '—') + ')')
  const body = t.shown.map(r => {
    const row = [r.__category, r.__group, r.metric, r.businessLine || '—', r.owner || '—']
    if (t.prev) row.push(weekValue(r, t.prev))
    row.push(weekValue(r, t.cur))
    return row
  })
  const cols = head.map((_, i) => (i < 5 ? { is_wrapped: true, align: 'left' } : { align: 'right' }))
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
// back to a plain-text render in production (confirmed live). One table,
// many sections, is the fix.
function buildCombinedMessage(sections, weekOverride, categoryOrder) {
  const title = ':ledger: *' + sections.map(s => escMrkdwn(s.label)).join(' · ') + '*'
  const sub = '_' + sections.length + ' more section(s), each still grouped by category and S.No. code, in one shared table. Full detail for all of them is in the CSV attached to this report._'
  const perSectionBudget = Math.max(8, Math.floor(SECTION_ROW_BUDGET / sections.length))
  const head = ['Section', 'Category', 'Group', 'Metric', 'Business Line', 'Owner', 'Last week', 'This week']
  const body = []
  const overflowNotes = []
  sections.forEach(section => {
    const t = messageRowsFor(section, perSectionBudget, weekOverride, categoryOrder)
    t.shown.forEach(r => body.push([
      section.label, r.__category, r.__group, r.metric, r.businessLine || '—', r.owner || '—',
      t.prev ? weekValue(r, t.prev) + ' (' + t.prev + ')' : '—',
      weekValue(r, t.cur) + ' (' + (t.cur || '—') + ')',
    ]))
    const overflow = t.total - t.shown.length
    if (overflow > 0) overflowNotes.push(section.label + ': +' + overflow.toLocaleString('en-IN') + ' more')
  })
  const cols = head.map((_, i) => (i < 6 ? { is_wrapped: true, align: 'left' } : { align: 'right' }))
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
  const weekOverride = ctx.weekOverride || null
  const categoryOrder = ctx.categoryOrder || []
  const messages = []
  const individual = sections.slice(0, MAX_INDIVIDUAL_SECTIONS)
  const rest = sections.slice(MAX_INDIVIDUAL_SECTIONS)
  individual.forEach((s, i) => messages.push(buildSectionMessage(s, i, weekOverride, categoryOrder)))
  if (rest.length) messages.push(buildCombinedMessage(rest, weekOverride, categoryOrder))
  if (ctx.isTest && messages.length) messages[messages.length - 1].text += '\n\n_Test send._'
  return messages
}

// ---------------------------------------------------------------------------
// v2 -- explicit request: "for every section I need only 4 columns:
// category, metric, business line, the week." Same one-message-per-section
// structure, same category/S.No.-code sort order internally, same CSV
// attachment, same overflow/truncation handling as v1 -- only the table
// itself narrows. Dropped: the S.No. code as its own column, Owner, and the
// week-over-week comparison entirely -- one week's real value, nothing else.
function buildSectionMessageV2(section, idx, weekOverride, categoryOrder) {
  const t = messageRowsFor(section, SECTION_ROW_BUDGET, weekOverride, categoryOrder)
  const title = ':ledger: *' + escMrkdwn(section.label) + '*'
  const staleNote = t.manual ? '' : (t.curIsLatestColumn ? '' : ' (the most recent column that’s actually filled in — newer columns exist but are still mostly blank)')
  const sub = '_' + t.total.toLocaleString('en-IN') + ' metric(s) across ' + t.categoryCount + ' categor' + (t.categoryCount === 1 ? 'y' : 'ies')
    + ', week of ' + (t.cur || '—') + staleNote + '._'
  const head = ['Category', 'Metric', 'Business Line', t.cur || 'This week']
  const body = t.shown.map(r => [r.__category, r.metric, r.businessLine || '—', weekValue(r, t.cur)])
  const cols = head.map((_, i) => (i < 3 ? { is_wrapped: true, align: 'left' } : { align: 'right' }))
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
      { type: 'table', block_id: 'st2_sec_' + idx, column_settings: cols, rows: tableRows },
      ...(overflowLine ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: overflowLine }] }] : []),
    ],
    table: { columns: tableRows[0].map(cellPlain), rows: tableRows.slice(1).map(r => r.map(cellPlain)) },
  }
}

// v2's combined closing message (sections 6+, same MAX_INDIVIDUAL_SECTIONS
// cap as v1): rows from several different sections land in ONE shared
// table, so a 5th column -- Section -- is kept here even though every
// individual section message above only has 4. Without it, once Group/
// Owner/Last-week are gone, there'd be no way left to tell a "Revenue"
// row from B2B apart from a "Revenue" row from Fly Homes. Flagged to the
// user as a default worth revisiting once actually seen, not a final call.
function buildCombinedMessageV2(sections, weekOverride, categoryOrder) {
  const title = ':ledger: *' + sections.map(s => escMrkdwn(s.label)).join(' · ') + '*'
  const sub = '_' + sections.length + ' more section(s), each still grouped by category, in one shared table. Full detail for all of them is in the CSV attached to this report._'
  const perSectionBudget = Math.max(8, Math.floor(SECTION_ROW_BUDGET / sections.length))
  const head = ['Section', 'Category', 'Metric', 'Business Line', 'Week']
  const body = []
  const overflowNotes = []
  sections.forEach(section => {
    const t = messageRowsFor(section, perSectionBudget, weekOverride, categoryOrder)
    t.shown.forEach(r => body.push([
      section.label, r.__category, r.metric, r.businessLine || '—',
      weekValue(r, t.cur) + ' (' + (t.cur || '—') + ')',
    ]))
    const overflow = t.total - t.shown.length
    if (overflow > 0) overflowNotes.push(section.label + ': +' + overflow.toLocaleString('en-IN') + ' more')
  })
  const cols = head.map((_, i) => (i < 4 ? { is_wrapped: true, align: 'left' } : { align: 'right' }))
  const tableRows = [head.map(cellBold), ...body.map(r => r.map(cellText))]
  const overflowLine = overflowNotes.length ? '_Truncated per section — ' + overflowNotes.join(', ') + '. Full detail is in the CSV attached to this report._' : null
  return {
    key: 'combined',
    label: 'More sections',
    text: [title, sub].join('\n') + (overflowLine ? '\n\n' + overflowLine : ''),
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: title } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: sub }] },
      { type: 'table', block_id: 'st2_combined', column_settings: cols, rows: tableRows },
      ...(overflowLine ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: overflowLine }] }] : []),
    ],
    table: { columns: tableRows[0].map(cellPlain), rows: tableRows.slice(1).map(r => r.map(cellPlain)) },
  }
}

function buildSuperTrackerV2(ctx) {
  const sections = ctx.sections || []
  const weekOverride = ctx.weekOverride || null
  const categoryOrder = ctx.categoryOrder || []
  const messages = []
  const individual = sections.slice(0, MAX_INDIVIDUAL_SECTIONS)
  const rest = sections.slice(MAX_INDIVIDUAL_SECTIONS)
  individual.forEach((s, i) => messages.push(buildSectionMessageV2(s, i, weekOverride, categoryOrder)))
  if (rest.length) messages.push(buildCombinedMessageV2(rest, weekOverride, categoryOrder))
  if (ctx.isTest && messages.length) messages[messages.length - 1].text += '\n\n_Test send._'
  return messages
}

// ---------------------------------------------------------------------------
// v3 -- "visual" version, built after live-testing Slack's 2026 Block Kit
// additions in the #voxpath sandbox (data_table, data_visualization, container
// all confirmed working on this workspace). Two real upgrades over v1/v2:
//   1. The plain `table` block becomes a native `data_table` -- Slack's own
//      client gives the reader pagination/sort/filter for free, so a section
//      no longer needs to be pre-truncated to a hard row budget the same way
//      (data_table's real ceiling is ~200 data rows, not v1's ~85).
//   2. A real `data_visualization` bar chart, and -- for the sections beyond
//      the first 5 that v1/v2 squash into one shared table (flagged there as
//      "worth revisiting once actually seen") -- each of THOSE now gets its
//      own collapsible `container`, with its own proper table, instead of
//      losing its identity in one shared grid.
//
// The chart is a COVERAGE read (does this metric have a value in the current
// week column, yes/no), never a parse of the tracked VALUE itself -- Super
// Tracker rows are wildly heterogeneous (money, percentages, plain counts,
// Y/N flags, dates all live in the same "This week" column across different
// metrics), so summing/averaging the values themselves would be guessing at
// units this file cannot know. "How much of this section got filled in" is
// the one number that's always safe to compute regardless of a metric's own
// unit.
//
// Real Slack constraints this code works within (confirmed against the live
// docs, not assumed): a data_visualization chart takes 1-20 data points and a
// message may carry at most 2 of them; a data_table's header row must be
// raw_text (rich_text/bold is rejected there, unlike the old table block); a
// container's child_blocks may NOT contain data_table or data_visualization
// (only the older `table` block, section, context, etc.) -- which is exactly
// why the chart lives at the top level of each message, not inside a
// container, and why the collapsible per-section containers below hold the
// OLD `table` block, not a data_table.

const CHART_LABEL_MAX = 20
const CHART_TITLE_MAX = 50
const CONTAINER_TITLE_MAX = 150

function truncateLabel(s, max) {
  s = String(s == null ? '' : s).trim() || '—'
  return s.length <= max ? s : s.slice(0, max - 1) + '…'
}

// De-duplicates chart labels after truncation (two different category names
// could theoretically collide once both are cut to 20 chars) -- axis_config
// requires every category label to be unique, so a silent collision would
// otherwise merge two real categories into one bar.
function dedupeChartLabel(raw, seen) {
  let label = truncateLabel(raw, CHART_LABEL_MAX)
  if (!seen.has(label)) { seen.set(label, 1); return label }
  const n = seen.get(label) + 1
  seen.set(label, n)
  return truncateLabel(raw, CHART_LABEL_MAX - String(n).length - 1) + ' ' + n
}

// One bar per category: how many of that category's posted-to-Slack metrics
// have a real value in the current week column, out of how many are tracked.
// A data_visualization chart is capped at 20 points -- categories beyond that
// are dropped (smallest first), which is a real Slack limit, not a style
// choice; the table below still shows every category regardless.
function categoryCoverage(rows, categoryOrder, curWeek) {
  const catSeen = new Set(rows.map(r => r.category || 'Uncategorized'))
  const ordered = (categoryOrder || []).filter(c => catSeen.has(c))
  rows.forEach(r => { const c = r.category || 'Uncategorized'; if (!ordered.includes(c)) ordered.push(c) })
  const out = ordered.map(cat => {
    const inCat = rows.filter(r => (r.category || 'Uncategorized') === cat)
    const populated = inCat.filter(r => weekValue(r, curWeek).trim() !== '').length
    return { category: cat, total: inCat.length, populated, pct: inCat.length ? Math.round((populated / inCat.length) * 100) : 0 }
  })
  out.sort((a, b) => b.total - a.total)
  return { shown: out.slice(0, 20), truncated: Math.max(0, out.length - 20) }
}

function coverageChartBlock(title, coverage) {
  if (!coverage.shown.length) return null
  const seen = new Map()
  const categories = []
  const points = []
  coverage.shown.forEach(c => {
    const label = dedupeChartLabel(c.category, seen)
    categories.push(label)
    points.push({ label, value: c.pct })
  })
  return {
    type: 'data_visualization',
    title: truncateLabel(title, CHART_TITLE_MAX),
    chart: {
      type: 'bar',
      series: [{ name: '% reported', data: points }],
      axis_config: { categories, x_label: 'Category', y_label: '% reported' },
    },
  }
}

// Slack's real data_table ceiling is ~200 data rows + 1 header row -- far
// more headroom than v1's ~85-row budget for the old table block, since
// data_table paginates natively instead of rendering every row at once.
const DATA_TABLE_ROW_BUDGET = 195

// data_table headers are always plain raw_text (rich_text/bold is rejected
// for header cells specifically) -- Slack already styles the header row on
// its own, so no bold-cell helper is needed here the way v1's cellBold is.
function dataTableBlock(blockId, caption, head, body, rowHeaderIdx) {
  const rows = [head.map(cellText), ...body.slice(0, DATA_TABLE_ROW_BUDGET).map(r => r.map(cellText))]
  return {
    type: 'data_table',
    block_id: blockId,
    caption: truncateLabel(caption, CONTAINER_TITLE_MAX),
    page_size: 15,
    row_header_column_index: rowHeaderIdx,
    rows,
  }
}

function buildSectionMessageV3(section, idx, weekOverride, categoryOrder) {
  const t = messageRowsFor(section, DATA_TABLE_ROW_BUDGET, weekOverride, categoryOrder)
  const title = ':bar_chart: *' + escMrkdwn(section.label) + '*'

  if (!t.total) {
    return {
      key: 'section_' + idx,
      label: section.label,
      text: title + '\nNo metrics currently flagged To be posted? = Yes for this section.',
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: title } },
        { type: 'context', elements: [{ type: 'mrkdwn', text: '_No metrics currently flagged To be posted? = Yes for this section._' }] },
      ],
      table: { columns: [], rows: [] },
    }
  }

  const staleNote = t.manual ? '' : (t.curIsLatestColumn ? '' : ' (the most recent column that’s actually filled in — newer columns exist but are still mostly blank)')
  const rowsForCoverage = (section.rows || []).filter(r => isYes(r.toBePosted))
  const populatedReal = rowsForCoverage.filter(r => weekValue(r, t.cur).trim() !== '').length
  const overallPct = t.total ? Math.round((populatedReal / t.total) * 100) : 0
  const coverage = categoryCoverage(rowsForCoverage, categoryOrder, t.cur)

  const sub = '_' + overallPct + '% of ' + t.total.toLocaleString('en-IN') + ' metric(s) reported'
    + (t.prev ? ' this week (comparing ' + t.prev + ' to ' + t.cur + ')' : ' for the week of ' + (t.cur || '—'))
    + ', across ' + t.categoryCount + ' categor' + (t.categoryCount === 1 ? 'y' : 'ies') + staleNote + '._'

  const head = ['Category', 'Group', 'Metric', 'Business Line', 'Owner']
  if (t.prev) head.push('Last week (' + t.prev + ')')
  head.push('This week (' + (t.cur || '—') + ')')
  const metricColIdx = head.indexOf('Metric')
  const body = t.shown.map(r => {
    const row = [r.__category, r.__group, r.metric, r.businessLine || '—', r.owner || '—']
    if (t.prev) row.push(weekValue(r, t.prev))
    row.push(weekValue(r, t.cur))
    return row
  })

  const chart = coverageChartBlock(section.label + ' — reporting coverage', coverage)
  const overflow = t.total - t.shown.length
  const overflowLine = overflow > 0 ? '_...and ' + overflow.toLocaleString('en-IN') + ' more metric(s) in this section — full detail is in the CSV attached to this report._' : null
  const coverageTruncNote = coverage.truncated > 0
    ? '_Chart shows the top 20 categories by metric count; ' + coverage.truncated + ' smaller categor' + (coverage.truncated === 1 ? 'y is' : 'ies are') + ' still in the table below, just not charted._'
    : null

  return {
    key: 'section_' + idx,
    label: section.label,
    text: [title, sub].join('\n') + (overflowLine ? '\n\n' + overflowLine : ''),
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: title } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: sub }] },
      ...(chart ? [chart] : []),
      ...(coverageTruncNote ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: coverageTruncNote }] }] : []),
      dataTableBlock('st3_sec_' + idx, section.label + ' — metrics', head, body, metricColIdx),
      ...(overflowLine ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: overflowLine }] }] : []),
    ],
    table: { columns: head, rows: body },
  }
}

// Sections beyond the first 5: v1/v2 squash every remaining section's rows
// into ONE shared table (needing a "Section" column just to tell them apart
// -- flagged there as a default worth revisiting). Here each remaining
// section gets its own collapsible `container`, collapsed by default, with
// its own proper table -- plus one chart summarizing all of them at a glance
// before anyone expands anything. A container cannot hold a data_table, so
// each one holds the older `table` block instead.
function buildRemainingMessageV3(sections, weekOverride, categoryOrder) {
  const title = ':bar_chart: *' + sections.map(s => escMrkdwn(s.label)).join(' · ') + '*'
  const sub = '_' + sections.length + ' more section(s) — each collapsed below into its own table. Full detail for all of them is in the CSV attached to this report._'
  const perSectionBudget = Math.max(8, Math.floor(SECTION_ROW_BUDGET / sections.length))
  const SECTION_CONTAINER_BUDGET = 12

  const seen = new Map()
  const chartCategories = []
  const chartPoints = []
  const containers = []
  let shownCount = 0

  sections.forEach((section, si) => {
    const t = messageRowsFor(section, perSectionBudget, weekOverride, categoryOrder)
    if (!t.total) return
    const populated = (section.rows || []).filter(r => isYes(r.toBePosted) && weekValue(r, t.cur).trim() !== '').length
    const pct = Math.round((populated / t.total) * 100)
    if (chartCategories.length < 20) {
      const label = dedupeChartLabel(section.label, seen)
      chartCategories.push(label)
      chartPoints.push({ label, value: pct })
    }
    if (shownCount >= SECTION_CONTAINER_BUDGET) return
    shownCount++
    const head = ['Category', 'Group', 'Metric', 'Business Line', 'Owner', 'This week']
    const body = t.shown.map(r => [r.__category, r.__group, r.metric, r.businessLine || '—', r.owner || '—', weekValue(r, t.cur)])
    const overflow = t.total - t.shown.length
    containers.push({
      type: 'container',
      title: { type: 'plain_text', text: truncateLabel(section.label + ' — ' + pct + '% reported (' + t.total + ' metrics)', CONTAINER_TITLE_MAX) },
      is_collapsible: true,
      default_collapsed: true,
      child_blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '_' + t.total.toLocaleString('en-IN') + ' metric(s), week of ' + (t.cur || '—')
              + (overflow > 0 ? ' — showing first ' + t.shown.length.toLocaleString('en-IN') + ', rest in the CSV' : '') + '._',
          },
        },
        {
          type: 'table',
          block_id: 'st3_rest_' + si,
          column_settings: head.map((_, i) => (i < 5 ? { is_wrapped: true, align: 'left' } : { align: 'right' })),
          rows: [head.map(cellBold), ...body.map(r => r.map(cellText))],
        },
      ],
    })
  })

  const chart = chartCategories.length ? {
    type: 'data_visualization',
    title: truncateLabel('Remaining sections — % reported', CHART_TITLE_MAX),
    chart: { type: 'bar', series: [{ name: '% reported', data: chartPoints }], axis_config: { categories: chartCategories, x_label: 'Section', y_label: '% reported' } },
  } : null
  const overflowSectionsNote = sections.length > shownCount
    ? '_' + (sections.length - shownCount) + ' further section(s) are chart-only above — full detail is in the CSV attached to this report._'
    : null

  return {
    key: 'combined',
    label: 'More sections',
    text: [title, sub].join('\n'),
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: title } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: sub }] },
      ...(chart ? [chart] : []),
      ...containers,
      ...(overflowSectionsNote ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: overflowSectionsNote }] }] : []),
    ],
    table: { columns: ['Section', 'Category', 'Group', 'Metric', 'Business Line', 'Owner', 'This week'], rows: [] },
  }
}

function buildSuperTrackerV3(ctx) {
  const sections = ctx.sections || []
  const weekOverride = ctx.weekOverride || null
  const categoryOrder = ctx.categoryOrder || []
  const messages = []
  const individual = sections.slice(0, MAX_INDIVIDUAL_SECTIONS)
  const rest = sections.slice(MAX_INDIVIDUAL_SECTIONS)
  individual.forEach((s, i) => messages.push(buildSectionMessageV3(s, i, weekOverride, categoryOrder)))
  if (rest.length) messages.push(buildRemainingMessageV3(rest, weekOverride, categoryOrder))
  if (ctx.isTest && messages.length) messages[messages.length - 1].text += '\n\n_Test send._'
  return messages
}

export const SUPER_TRACKER_REPORT_VERSIONS = [
  {
    id: 'super_tracker_v1',
    code: 'ST',
    msgKeys: ['section_0', 'section_1', 'section_2', 'section_3', 'section_4', 'combined'],
    name: 'Super Tracker — actual figures by section',
    tagline: 'Every real tracked value, grouped by category and then by S.No. code.',
    what: [
      'One message per real workbook section (B2C, B2B, Fly Finance, Fly Homes), each ONE native Slack table',
      'Grouped by category (the sheet’s own Reference Categories — Content & Community, Revenue, ...) and then by the finer S.No. code (CC01, R02, ...) within it',
      'Only metrics flagged To be posted? = Yes',
      'The actual value for the week you pick — defaults to the most recent one that’s genuinely filled in, not a guaranteed-blank "latest column"',
      'A section over the row budget is truncated with a stated count; sections beyond the first 5 share one closing message',
      'The full flattened sheet (every section/metric/week) attached as a CSV',
    ],
    build: buildSuperTracker,
  },
  {
    id: 'super_tracker_v2',
    code: 'ST2',
    msgKeys: ['section_0', 'section_1', 'section_2', 'section_3', 'section_4', 'combined'],
    name: 'Super Tracker — condensed (4 columns)',
    tagline: 'Category, Metric, Business Line, and this week’s value — nothing else.',
    what: [
      'Same one-message-per-section structure as the full version',
      'Every table narrowed to exactly 4 columns: Category, Metric, Business Line, and the current week’s value',
      'No S.No. code column, no Owner, no week-over-week comparison — one week’s real figure only',
      'Only metrics flagged To be posted? = Yes, same as the full version',
      'Sections beyond the first 5 share one closing message (adds a 5th Section column there, since rows from multiple sections are mixed into one table)',
      'The full flattened sheet (every section/metric/week) attached as a CSV',
    ],
    build: buildSuperTrackerV2,
  },
  {
    id: 'super_tracker_v3',
    code: 'ST3',
    msgKeys: ['section_0', 'section_1', 'section_2', 'section_3', 'section_4', 'combined'],
    name: 'Super Tracker — visual (charts + native tables)',
    tagline: 'A real reporting-coverage chart per section, plus a native sortable/paginated table.',
    what: [
      'Every section table is a native Slack data_table — the reader can sort, filter, and page through it in Slack itself, no CSV needed just to browse',
      'A real bar chart per section: % of that section’s metrics with a real value in the current week, broken down by category',
      'Sections beyond the first 5 (previously squashed into one shared table) now each get their own collapsible card with its own proper table, plus one summary chart across all of them',
      'Only metrics flagged To be posted? = Yes, same as the other versions',
      'The full flattened sheet (every section/metric/week) attached as a CSV',
      'Uses newer Slack block types (data_table, data_visualization, container) — live-tested working on this workspace, but degrades to a plain-text summary on a client that doesn’t support them yet',
    ],
    build: buildSuperTrackerV3,
  },
]
