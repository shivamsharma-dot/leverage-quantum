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
// v3 -- "analysis" version, built after live-testing Slack's 2026 Block Kit
// additions in the #voxpath sandbox (data_table, data_visualization, container
// all confirmed working on this workspace).
//
// First attempt at this version charted REPORTING COVERAGE (did someone fill
// this cell in) -- explicit user feedback: wrong report entirely. Nobody
// asked who's filling up the tracker; the ask is to analyse the actual
// tracked NUMBERS -- is a metric up or down, and by how much. Rebuilt around
// that instead:
//   1. `data_table` still replaces the plain `table` block (native
//      pagination/sort/filter, ~200-row ceiling instead of v1's ~85), now
//      with a real "Δ vs last week" column computed from the tracked values.
//   2. `data_visualization` charts an INDEXED TREND (first tracked week =
//      100) across every metric in the section whose own week-by-week
//      history is cleanly numeric -- lets several metrics on completely
//      different scales (follower counts vs a percentage vs money) share one
//      chart, since each is plotted relative to its OWN starting point, never
//      against another metric's.
//   3. A "Biggest movers" callout -- the metrics that moved the most (up or
//      down) this week, surfaced directly instead of buried in a 100-row
//      table.
//
// The one thing this deliberately still never does: compare or add together
// the VALUES of two DIFFERENT metrics (a follower count plus a percentage is
// meaningless). Every computation below is a metric compared only to
// ITSELF, across weeks -- which is safe regardless of what unit that metric
// happens to be in, without this file ever needing to know that unit.
//
// Real Slack constraints this code works within (confirmed against the live
// docs, not assumed): a data_visualization chart takes 1-20 data points per
// series, up to 12 series, and a message may carry at most 2 charts; a
// data_table's header row must be raw_text (rich_text/bold is rejected there,
// unlike the old table block); a container's child_blocks may NOT contain
// data_table or data_visualization (only the older `table` block, section,
// context, etc.) -- which is exactly why the chart lives at the top level of
// each message, not inside a container, and why the collapsible per-section
// containers below hold the OLD `table` block, not a data_table.

const CHART_LABEL_MAX = 20
const CHART_TITLE_MAX = 50
const CONTAINER_TITLE_MAX = 150

function truncateLabel(s, max) {
  s = String(s == null ? '' : s).trim() || '—'
  return s.length <= max ? s : s.slice(0, max - 1) + '…'
}

// De-duplicates chart labels after truncation (two different names could
// theoretically collide once both are cut to 20 chars) -- axis_config
// categories and series names both require uniqueness within one chart, so a
// silent collision would otherwise merge two real things into one line/bar.
function dedupeChartLabel(raw, seen) {
  let label = truncateLabel(raw, CHART_LABEL_MAX)
  if (!seen.has(label)) { seen.set(label, 1); return label }
  const n = seen.get(label) + 1
  seen.set(label, n)
  return truncateLabel(raw, CHART_LABEL_MAX - String(n).length - 1) + ' ' + n
}

// A metric's OWN column is self-consistent across weeks even though this
// workbook tracks wildly different KINDS of numbers row to row (followers,
// money, percentages, plain counts) -- comparing "this week" to "last week"
// for the SAME row never requires knowing what unit that row is in. Strips
// common formatting (currency symbols, thousands separators, %, whitespace)
// before parsing; anything that still isn't a plain number after that (a
// date, "Y"/"N", free text) comes back null and is simply left out of every
// numeric read below rather than risking a wrong comparison.
function parseNum(v) {
  if (v == null) return null
  const s = String(v).trim()
  if (!s) return null
  const cleaned = s.replace(/[₹$,\s%]/g, '')
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function weekDelta(row, prevWeek, curWeek) {
  if (!prevWeek) return null
  const prevN = parseNum(weekValue(row, prevWeek))
  const curN = parseNum(weekValue(row, curWeek))
  if (prevN == null || curN == null) return null
  const abs = curN - prevN
  const pct = prevN !== 0 ? (abs / Math.abs(prevN)) * 100 : null
  return { abs, pct, prevN, curN }
}

// A blank result (not "0%") whenever the two weeks can't be honestly
// compared -- either value wasn't a plain number, or last week's value was
// zero (a percent change off zero is undefined, not infinite/huge).
function fmtDelta(d) {
  if (!d) return '—'
  if (d.abs === 0) return 'flat'
  const arrow = d.abs > 0 ? '▲' : '▼'
  if (d.pct != null) return arrow + ' ' + Math.abs(d.pct).toFixed(1) + '%'
  return arrow + ' ' + Math.abs(d.abs).toLocaleString('en-IN')
}

// Top N increases and top N decreases by % change, among rows where a real
// percentage change could be computed (skips anything not cleanly numeric on
// both weeks, or with a zero baseline).
function biggestMovers(rows, prevWeek, curWeek, n) {
  if (!prevWeek) return { up: [], down: [] }
  const withDelta = rows
    .map(r => ({ row: r, d: weekDelta(r, prevWeek, curWeek) }))
    .filter(x => x.d && x.d.pct != null && x.d.abs !== 0)
  const up = withDelta.filter(x => x.d.abs > 0).sort((a, b) => b.d.pct - a.d.pct).slice(0, n)
  const down = withDelta.filter(x => x.d.abs < 0).sort((a, b) => a.d.pct - b.d.pct).slice(0, n)
  return { up, down }
}

function moversLine(x) {
  const d = x.d
  const arrow = d.abs > 0 ? '▲' : '▼'
  const sign = d.abs > 0 ? '+' : ''
  return arrow + ' *' + escMrkdwn(x.row.metric) + '* ' + sign + d.pct.toFixed(1) + '% ('
    + d.prevN.toLocaleString('en-IN') + ' → ' + d.curN.toLocaleString('en-IN') + ')'
}

function moversBlock(rows, prevWeek, curWeek, n) {
  const { up, down } = biggestMovers(rows, prevWeek, curWeek, n)
  if (!up.length && !down.length) return null
  const parts = []
  if (up.length) parts.push('*Biggest increases:*\n' + up.map(moversLine).join('\n'))
  if (down.length) parts.push('*Biggest decreases:*\n' + down.map(moversLine).join('\n'))
  return { type: 'section', text: { type: 'mrkdwn', text: parts.join('\n\n') } }
}

// Indexes every metric in the section whose ENTIRE tracked history is
// cleanly numeric (no gaps, no non-numeric weeks, no zero baseline) to its
// own first tracked week = 100, then plots up to 12 of them as one line
// chart -- this is what makes it safe to show a follower count and a
// percentage on the same chart: neither is ever read at its own scale, only
// as "how far has this moved from where IT started."
function indexedTrendChart(section, rows) {
  const weeks = (section.weekLabels || []).slice(-20)
  if (weeks.length < 2) return null
  const candidates = []
  rows.forEach(r => {
    const nums = weeks.map(w => parseNum(weekValue(r, w)))
    if (nums.every(x => x != null) && nums[0] !== 0) candidates.push({ row: r, nums })
  })
  if (!candidates.length) return null
  const chosen = candidates.slice(0, 12)

  const catSeen = new Map()
  const categories = weeks.map(w => dedupeChartLabel(w, catSeen))

  const nameSeen = new Map()
  const series = chosen.map(c => {
    const name = dedupeChartLabel(c.row.metric, nameSeen)
    const data = categories.map((label, i) => ({ label, value: Math.round((c.nums[i] / c.nums[0]) * 100) }))
    return { name, data }
  })

  return {
    type: 'data_visualization',
    title: truncateLabel(section.label + ' — trend (first week = 100)', CHART_TITLE_MAX),
    chart: { type: 'line', series, axis_config: { categories, x_label: 'Week', y_label: 'Index (first week = 100)' } },
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
  const postedRows = (section.rows || []).filter(r => isYes(r.toBePosted))
  const sub = '_' + t.total.toLocaleString('en-IN') + ' metric(s) across ' + t.categoryCount + ' categor' + (t.categoryCount === 1 ? 'y' : 'ies')
    + (t.prev ? ', comparing ' + t.prev + ' to ' + t.cur : ', week of ' + (t.cur || '—')) + staleNote + '._'

  const head = ['Category', 'Group', 'Metric', 'Business Line', 'Owner']
  if (t.prev) head.push('Last week (' + t.prev + ')')
  head.push('This week (' + (t.cur || '—') + ')')
  if (t.prev) head.push('Δ vs last week')
  const metricColIdx = head.indexOf('Metric')
  const body = t.shown.map(r => {
    const row = [r.__category, r.__group, r.metric, r.businessLine || '—', r.owner || '—']
    if (t.prev) row.push(weekValue(r, t.prev))
    row.push(weekValue(r, t.cur))
    if (t.prev) row.push(fmtDelta(weekDelta(r, t.prev, t.cur)))
    return row
  })

  const movers = moversBlock(postedRows, t.prev, t.cur, 3)
  const chart = indexedTrendChart(section, postedRows)
  const overflow = t.total - t.shown.length
  const overflowLine = overflow > 0 ? '_...and ' + overflow.toLocaleString('en-IN') + ' more metric(s) in this section — full detail is in the CSV attached to this report._' : null

  return {
    key: 'section_' + idx,
    label: section.label,
    text: [title, sub].join('\n') + (overflowLine ? '\n\n' + overflowLine : ''),
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: title } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: sub }] },
      ...(movers ? [movers] : []),
      ...(chart ? [chart] : []),
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
// its own proper table (including the same real Δ column) -- plus one
// combined "biggest movers" callout across all of them at the top, before
// anyone expands anything. A container cannot hold a data_table or a chart,
// so each one holds the older `table` block instead, and the trend chart is
// left to the individual section messages above.
function buildRemainingMessageV3(sections, weekOverride, categoryOrder) {
  const title = ':bar_chart: *' + sections.map(s => escMrkdwn(s.label)).join(' · ') + '*'
  const sub = '_' + sections.length + ' more section(s) — each collapsed below into its own table. Full detail for all of them is in the CSV attached to this report._'
  const perSectionBudget = Math.max(8, Math.floor(SECTION_ROW_BUDGET / sections.length))
  const SECTION_CONTAINER_BUDGET = 12

  const containers = []
  let shownCount = 0
  // Movers are pooled only across sections that share the SAME week pair as
  // the first remaining section -- sections can in principle have different
  // week histories, and a "biggest mover" comparison only makes sense between
  // rows measured over the identical two weeks.
  let poolPrev = null
  let poolCur = null
  const pooledRows = []

  sections.forEach((section, si) => {
    const t = messageRowsFor(section, perSectionBudget, weekOverride, categoryOrder)
    if (!t.total) return
    if (poolPrev === null && poolCur === null) { poolPrev = t.prev; poolCur = t.cur }
    const postedRows = (section.rows || []).filter(r => isYes(r.toBePosted))
    if (t.prev === poolPrev && t.cur === poolCur) pooledRows.push(...postedRows)

    if (shownCount >= SECTION_CONTAINER_BUDGET) return
    shownCount++
    const head = ['Category', 'Group', 'Metric', 'Business Line', 'Owner']
    if (t.prev) head.push('Last week')
    head.push('This week')
    if (t.prev) head.push('Δ vs last week')
    const body = t.shown.map(r => {
      const row = [r.__category, r.__group, r.metric, r.businessLine || '—', r.owner || '—']
      if (t.prev) row.push(weekValue(r, t.prev))
      row.push(weekValue(r, t.cur))
      if (t.prev) row.push(fmtDelta(weekDelta(r, t.prev, t.cur)))
      return row
    })
    const overflow = t.total - t.shown.length
    containers.push({
      type: 'container',
      title: { type: 'plain_text', text: truncateLabel(section.label + ' (' + t.total + ' metrics)', CONTAINER_TITLE_MAX) },
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

  const movers = moversBlock(pooledRows, poolPrev, poolCur, 3)
  const overflowSectionsNote = sections.length > shownCount
    ? '_' + (sections.length - shownCount) + ' further section(s) are in the CSV only — not shown above.'
    : null

  return {
    key: 'combined',
    label: 'More sections',
    text: [title, sub].join('\n'),
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: title } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: sub }] },
      ...(movers ? [movers] : []),
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
    name: 'Super Tracker — analysis (trend chart + movers + native tables)',
    tagline: 'What actually moved this week, an indexed trend chart, and a native sortable table — not who reported it.',
    what: [
      'A "Biggest increases / decreases" callout at the top of every message — the metrics that moved the most this week, with the real before/after figures',
      'Every section table is a native Slack data_table (sortable/paginated in Slack itself) with a real Δ vs last week column computed from the actual tracked values',
      'A real indexed trend chart per section (first tracked week = 100) so metrics on completely different scales — a follower count, a percentage, a rupee figure — can be compared as trajectories on one chart without ever mixing their raw units',
      'Every number comparison is one metric vs. itself across weeks — this never adds or averages two different metrics together',
      'Sections beyond the first 5 (previously squashed into one shared table) now each get their own collapsible card with its own proper table, plus one combined movers callout across all of them',
      'Only metrics flagged To be posted? = Yes, same as the other versions',
      'The full flattened sheet (every section/metric/week) attached as a CSV',
      'Uses newer Slack block types (data_table, data_visualization, container) — live-tested working on this workspace, but degrades to a plain-text summary on a client that doesn’t support them yet',
    ],
    build: buildSuperTrackerV3,
  },
]
