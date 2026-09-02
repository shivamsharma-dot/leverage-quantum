// Super Tracker's Slack report. Same version-registry convention as every
// other report builder in this app (pmReport.js/b2cReport.js/careersReport.js
// -- {id, code, msgKeys, name, tagline, what[], build(ctx)}), consumed by the
// shared <SlackReportPanel> via its `versions` prop and posted through the
// existing generic `type: 'slack_report'` route on api/send-report.mjs (which
// just posts whatever pre-built `messages` array the client hands it -- no
// server-side import of this file needed).
//
// Deliberately generic: every number here is derived from whatever the sheet
// actually contains right now (real weeks, real "to be posted" flags, real
// values) -- nothing is keyed off a specific metric name, so a metric added or
// removed in the sheet changes the report's numbers automatically, never its
// code.

// -- number parsing --------------------------------------------------------
// The sheet mixes currency, percentages, plain counts and free text in one
// column (see lib/superTracker.mjs's own reasoning for reading FORMATTED_VALUE
// rather than raw numbers) -- so a "number" here is best-effort: strip the
// punctuation a business sheet actually uses (rupee sign, thousands commas,
// a trailing %, stray whitespace) and only trust what's left if it parses
// clean. Anything else (a literal "NA", a blank cell, free text) is null,
// which every caller below treats as "not comparable" rather than as zero.
function parseNum(v) {
  const s = String(v || '').trim()
  if (!s) return null
  const isPct = /%$/.test(s)
  const cleaned = s.replace(/[₹%,\s]/g, '')
  if (!cleaned || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null
  const n = Number(cleaned)
  return { value: n, isPct }
}

function isYes(v) {
  return /^(y|yes)$/i.test(String(v || '').trim())
}

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

function sectionStats(section) {
  const { cur } = latestTwoWeeks(section)
  const rows = section.rows || []
  const total = rows.length
  const shouldPost = rows.filter(r => isYes(r.toBePosted)).length
  const posted = cur ? rows.filter(r => isYes(r.toBePosted) && weekValue(r, cur).trim() !== '').length : 0
  const pct = shouldPost > 0 ? (posted / shouldPost * 100) : null
  return { section, cur, total, shouldPost, posted, pct }
}

// Metrics flagged "to be posted: Yes" with no value yet for the section's own
// latest week -- the direct, accountable answer to "what's still missing".
function missingRows(section) {
  const { cur } = latestTwoWeeks(section)
  if (!cur) return []
  return (section.rows || [])
    .filter(r => isYes(r.toBePosted) && weekValue(r, cur).trim() === '')
    .map(r => ({ section: section.label, owner: (r.owner || 'Unassigned').trim() || 'Unassigned', metric: r.metric, week: cur }))
}

// Week-over-week movers -- only where BOTH weeks parse as real numbers of the
// SAME kind (both plain, or both a %), since a plain count and a percentage
// moving "the same amount" would be comparing two different things.
function moverRows(section) {
  const { cur, prev } = latestTwoWeeks(section)
  if (!cur || !prev) return []
  const out = []
  for (const r of section.rows || []) {
    const a = parseNum(weekValue(r, prev))
    const b = parseNum(weekValue(r, cur))
    if (!a || !b || a.isPct !== b.isPct || a.value === 0) continue
    const pctChange = (b.value - a.value) / Math.abs(a.value) * 100
    if (!isFinite(pctChange)) continue
    out.push({ section: section.label, metric: r.metric, prevRaw: weekValue(r, prev), curRaw: weekValue(r, cur), pctChange, cur, prev })
  }
  return out
}

function pctLabel(n) {
  if (n == null || !isFinite(n)) return '—'
  return (n > 0 ? '+' : '') + n.toFixed(1) + '%'
}

// -- native Slack table cells (same convention as b2cReport.js's own) -------
const cellText = v => ({ type: 'raw_text', text: v == null || v === '' ? '—' : String(v) })
const cellBold = v => ({ type: 'rich_text', elements: [{ type: 'rich_text_section', elements: [{ type: 'text', text: v == null || v === '' ? '—' : String(v), style: { bold: true } }] }] })
const cellPlain = c => {
  if (!c) return ''
  if (c.type === 'raw_text') return c.text
  const el = c.elements && c.elements[0] && c.elements[0].elements && c.elements[0].elements[0]
  return el ? el.text : ''
}
function tableBlock(blockId, title, sub, head, rows, boldFirstCol) {
  const cellCols = head.map((_, i) => (i === 0 ? { is_wrapped: true, align: 'left' } : { align: 'right' }))
  const tableRows = [head.map(cellBold), ...rows.map(r => r.map((v, i) => (i === 0 && boldFirstCol ? cellBold(v) : cellText(v))))]
  const L = [title]
  if (sub) L.push(sub)
  return {
    text: L.join('\n'),
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: title } },
      ...(sub ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: sub }] }] : []),
      { type: 'table', block_id: blockId, column_settings: cellCols, rows: tableRows },
    ],
    table: {
      columns: tableRows[0].map(cellPlain),
      rows: tableRows.slice(1).map(r => r.map(cellPlain)),
    },
  }
}

// -- message 1: exec summary -------------------------------------------------
function buildSummary(ctx) {
  const sections = ctx.sections || []
  const stats = sections.map(sectionStats)
  const totalTracked = stats.reduce((s, x) => s + x.total, 0)
  const totalShouldPost = stats.reduce((s, x) => s + x.shouldPost, 0)
  const totalPosted = stats.reduce((s, x) => s + x.posted, 0)
  const overallPct = totalShouldPost > 0 ? (totalPosted / totalShouldPost * 100) : null
  const ranked = stats.filter(s => s.shouldPost > 0).slice().sort((a, b) => a.pct - b.pct)
  const worst = ranked[0]
  const best = ranked[ranked.length - 1]

  const L = []
  L.push(':bar_chart: *Super Tracker — weekly compliance*')
  L.push(`_${sections.length} section(s), ${totalTracked.toLocaleString('en-IN')} metric(s) tracked. Each section is read against its own latest week — not every tab is on the same weekly cycle._`)
  L.push('')
  L.push(`*Overall: ${totalPosted} of ${totalShouldPost} due metrics are filled in this week* (${overallPct == null ? '—' : overallPct.toFixed(1) + '%'})`)
  if (worst) L.push(`:warning: Furthest behind: *${worst.section.label}* — ${worst.posted} of ${worst.shouldPost} (${worst.pct.toFixed(1)}%), week of ${worst.cur}`)
  if (best && best !== worst) L.push(`:white_check_mark: Most on track: *${best.section.label}* — ${best.posted} of ${best.shouldPost} (${best.pct.toFixed(1)}%), week of ${best.cur}`)
  L.push('')
  L.push('*By section*')
  stats.forEach(s => {
    const pctStr = s.pct == null ? 'no metrics due' : s.pct.toFixed(1) + '%'
    L.push(`• ${s.section.label}: ${s.posted}/${s.shouldPost} due (${pctStr}) — ${s.total} tracked, week of ${s.cur || '—'}`)
  })
  return { key: 'summary', label: 'Super Tracker — weekly compliance', text: L.join('\n') }
}

// -- message 2: completion by section, native table -------------------------
function buildCompletionTable(ctx) {
  const sections = ctx.sections || []
  const stats = sections.map(sectionStats).sort((a, b) => (a.pct == null ? 999 : a.pct) - (b.pct == null ? 999 : b.pct))
  const rows = stats.map(s => [s.section.label, String(s.total), String(s.shouldPost), String(s.posted), s.pct == null ? '—' : s.pct.toFixed(1) + '%', s.cur || '—'])
  const built = tableBlock('st_completion', ':ledger: *Completion by section*', '_Ranked lowest completion first. "Due" is every metric flagged To Be Posted = Yes._',
    ['Section', 'Tracked', 'Due', 'Posted', 'Completion', 'Week'], rows, true)
  return { key: 'completion', label: 'Completion by section', ...built }
}

// -- message 3: what's missing, grouped by owner -----------------------------
function buildMissing(ctx) {
  const sections = ctx.sections || []
  const all = sections.flatMap(missingRows)
  const L = []
  L.push(':mag: *What’s missing this week*')
  if (!all.length) {
    L.push('_Nothing outstanding — every metric flagged To Be Posted = Yes has a value for its latest week._')
    return { key: 'missing', label: 'What’s missing', text: L.join('\n') }
  }
  L.push(`_${all.length} metric(s) are flagged To Be Posted = Yes with no value yet, grouped by owner._`)
  const byOwner = {}
  all.forEach(r => { (byOwner[r.owner] = byOwner[r.owner] || []).push(r) })
  const owners = Object.keys(byOwner).sort((a, b) => byOwner[b].length - byOwner[a].length)
  const CAP = 25
  let shown = 0
  L.push('')
  for (const owner of owners) {
    if (shown >= CAP) break
    L.push(`*${owner}* (${byOwner[owner].length})`)
    for (const r of byOwner[owner]) {
      if (shown >= CAP) break
      L.push(`• ${r.metric} — _${r.section}_, week of ${r.week}`)
      shown++
    }
  }
  if (all.length > shown) L.push('')
  if (all.length > shown) L.push(`_...and ${all.length - shown} more. Full list is in the CSV attached to this report._`)
  return { key: 'missing', label: 'What’s missing', text: L.join('\n') }
}

// -- message 4: biggest movers, native table ---------------------------------
function buildMovers(ctx) {
  const sections = ctx.sections || []
  const all = sections.flatMap(moverRows)
  const L = []
  L.push(':chart_with_upwards_trend: *Biggest movers this week*')
  if (!all.length) {
    L.push('_No metric had a comparable numeric value in both this week and last week yet._')
    return { key: 'movers', label: 'Biggest movers', text: L.join('\n') }
  }
  const up = all.filter(m => m.pctChange > 0).sort((a, b) => b.pctChange - a.pctChange).slice(0, 5)
  const down = all.filter(m => m.pctChange < 0).sort((a, b) => a.pctChange - b.pctChange).slice(0, 5)
  const rows = [...up, ...down].map(m => [m.metric, m.section, m.prevRaw, m.curRaw, pctLabel(m.pctChange)])
  const built = tableBlock('st_movers', L[0], '_Only metrics with a real numeric value both this week and last week — text/blank cells are never compared._',
    ['Metric', 'Section', 'Last week', 'This week', 'Change'], rows, false)
  return { key: 'movers', label: 'Biggest movers', ...built }
}

function buildSuperTracker(ctx) {
  const c = ctx || {}
  const messages = [buildSummary(c), buildCompletionTable(c), buildMissing(c), buildMovers(c)]
  if (c.isTest) messages[messages.length - 1].text += '\n\n_Test send._'
  return messages
}

export const SUPER_TRACKER_REPORT_VERSIONS = [{
  id: 'super_tracker_v1',
  code: 'ST',
  msgKeys: ['summary', 'completion', 'missing', 'movers'],
  name: 'Super Tracker — weekly compliance',
  tagline: 'Who’s on track, what’s missing, and what moved — computed fresh from whatever the sheet holds right now.',
  what: [
    'An overall + per-section completion rate for the latest week each section actually tracks',
    'A native table ranking every section worst-completion-first',
    'A "what’s missing" checklist, grouped by owner, of every due metric with no value yet',
    'A biggest-movers table (real numeric metrics only) comparing this week to last',
    'The full flattened sheet (every section/metric/week) attached as a CSV',
  ],
  build: buildSuperTracker,
}]
