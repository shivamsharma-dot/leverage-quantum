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

export const SUPER_TRACKER_REPORT_VERSIONS = [{
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
}]
