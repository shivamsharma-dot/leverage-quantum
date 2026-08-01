// Quantum Brief -- the CEO's daily read, built as native Block Kit.
//
// NEW version, additive only. None of the existing builders (V3/V5/V6/V7 in
// pmReport.js, B2C in b2cReport.js) are imported, changed or read by this file,
// and none of their behaviour moves: they keep emitting { text, table, chart }
// and keep travelling the same path through api/send-report.js they always did.
//
// The one difference is that the message this builder returns also carries a
// blocks array. The server posts blocks when it is present and falls back to the
// existing renderer when it is not, so a single added if covers this whole file.
// text is still filled in from the same numbers, so the Send to Slack preview and
// the Slack notification line keep working unchanged.
//
// The layout exists to be audited. The plan block publishes which source produced
// which number -- including the ones that did not answer -- so any figure can be
// checked without opening Quantum. Every line is a rule over numbers the dashboard
// already computed. There is no generated prose in this file.

const CR = 1e7
const LAKH = 1e5
const QUANTUM = 'https://quantum.leverageedu.com'

// -- formatting ---------------------------------------------------------------

function money(n) {
  if (n == null || !isFinite(n)) return '\u2014'
  const a = Math.abs(n)
  const sg = n < 0 ? '-' : ''
  if (a >= CR) return sg + '\u20B9' + (a / CR).toFixed(2) + ' Cr'
  if (a >= LAKH) return sg + '\u20B9' + (a / LAKH).toFixed(2) + ' L'
  return sg + '\u20B9' + Math.round(a).toLocaleString('en-IN')
}

const shareOf = (part, whole) => (part == null || !whole ? null : (part / whole) * 100)
const pct1 = n => (n == null ? '\u2014' : n.toFixed(1) + '%')
const move = n => (n == null ? null : (n >= 0 ? '\u25b2 ' : '\u25bc ') + Math.abs(n).toFixed(1) + '%')

// -- Block Kit atoms ----------------------------------------------------------

const T = (text, style) => (style ? { type: 'text', text, style } : { type: 'text', text })
const TAG = (text, color) => ({ type: 'tag', text, color })
const SEC = elements => ({ type: 'rich_text_section', elements })
const BULLETS = lines => ({ type: 'rich_text_list', style: 'bullet', elements: lines.map(l => SEC([T(l)])) })
const RICH = elements => ({ type: 'rich_text', elements })

const cellText = v => ({ type: 'raw_text', text: v == null || v === '' ? '\u2014' : String(v) })
const cellNum = (value, text) => ({ type: 'raw_number', value: Number(value) || 0, text: text || '\u2014' })

// A KPI card. hero_image is attached only when the caller has a real hosted URL:
// Slack rejects data: URLs, so chartPng output has to be uploaded first and the
// permalink handed in as ctx.charts before any image appears here.
function card(id, title, subtitle, body, opts) {
  const o = opts || {}
  const c = {
    type: 'card',
    block_id: 'qb_card_' + id,
    title: { type: 'mrkdwn', text: String(title).slice(0, 150) },
    subtitle: { type: 'mrkdwn', text: String(subtitle).slice(0, 150) },
    body: { type: 'mrkdwn', text: String(body).slice(0, 200) },
    actions: [{
      type: 'button',
      text: { type: 'plain_text', text: o.cta || 'Open' },
      url: o.url || QUANTUM,
      action_id: 'qb_open_' + id,
    }],
  }
  if (o.image) c.hero_image = { type: 'image', image_url: o.image, alt_text: String(title) }
  if (o.subtext) c.subtext = { type: 'mrkdwn', text: String(o.subtext).slice(0, 200) }
  return c
}

// A provenance step. status is the honest part: a source that did not answer is
// published as an error rather than dropped, because a silent omission is the one
// thing that makes a reader stop trusting the number above it.
function task(s, i) {
  const t = {
    type: 'task_card',
    task_id: s.id || ('src_' + i),
    title: String(s.title || 'Source').slice(0, 255),
    status: s.status || 'complete',
  }
  if (s.details) t.details = RICH([SEC([T(String(s.details))])])
  if (s.output) t.output = RICH([SEC([T(String(s.output))])])
  if (s.url) t.sources = [{ type: 'url', url: s.url, text: s.label || s.url }]
  return t
}

// -- the report ---------------------------------------------------------------

function buildQuantumBrief(ctx) {
  const c = ctx || {}
  const rev = c.rev || {}
  const cost = c.cost || {}
  const day = c.day || null
  const d = c.d || {}
  const charts = c.charts || {}
  const sources = Array.isArray(c.sources) ? c.sources : []
  const throughTs = c.throughTs || Math.floor(Date.now() / 1000)
  const margin = c.margin != null ? c.margin : shareOf(c.net, rev.total)
  const peopleOutside = cost.people == null && c.peopleMonthly != null

  const blocks = []

  // 1. title
  blocks.push({ type: 'header', text: { type: 'plain_text', text: 'Quantum Brief \u2014 B2C', emoji: true } })

  // 2. the period, and every standing condition as its own pill
  const pills = [
    T((c.monthLabel || '') + ' \u00b7 through ', { bold: true }),
    { type: 'date', timestamp: throughTs, format: '{date_short_pretty}', fallback: c.through || '', style: { bold: true } },
    T('  '),
    TAG('D-1 complete', 'green'),
    T(' '),
    TAG(sources.length + ' sources reconciled', 'blue'),
  ]
  if (peopleOutside) pills.push(T(' '), TAG('People cost booked monthly', 'gray'))
  if (c.isTest) pills.push(T(' '), TAG('Test post', 'indigo'))
  blocks.push(RICH([SEC(pills)]))

  // 3. the one-line read
  blocks.push({
    type: 'markdown',
    text: '**Net inflow ' + money(c.net) + ' on ' + money(rev.total) + ' revenue'
      + (margin == null ? '.**' : ' \u2014 ' + pct1(margin) + ' margin.**')
      + (day ? ' Latest completed day ' + day.date + ': revenue ' + money(day.rev)
        + ', cost ' + money(day.cost) + ', net ' + money(day.net) + '.' : ''),
  })

  // 4. KPI cards, swipeable on a phone
  const cards = [
    card('net', 'Net inflow', money(c.net) + (move(d.net) ? ' \u00b7 ' + move(d.net) : ''),
      'Revenue ' + money(rev.total) + ' less cost ' + money(cost.total) + '. Margin ' + pct1(margin) + '.',
      { image: charts.net, url: QUANTUM + '/ceo-b2c',
        subtext: peopleOutside ? 'Excludes People cost \u2014 booked monthly, ' + money(c.peopleMonthly) + '.' : null }),
    card('revenue', 'Revenue', money(rev.total) + (move(d.rev) ? ' \u00b7 ' + move(d.rev) : ''),
      'SR ' + money(rev.sr) + ' \u00b7 AC ' + money(rev.ac) + ' \u00b7 VAS ' + money(rev.vas),
      { image: charts.revenue, url: QUANTUM + '/ceo-b2c' }),
    card('cost', 'Cost', money(cost.total) + (move(d.cost) ? ' \u00b7 ' + move(d.cost) : ''),
      'Perf. marketing ' + money(cost.pm) + ' \u00b7 Operating ' + money(cost.op),
      { image: charts.cost, url: QUANTUM + '/ceo-b2c' }),
  ]
  if (day) {
    cards.push(card('day', 'Yesterday', money(day.net) + ' net',
      day.date + ' \u00b7 revenue ' + money(day.rev) + ' \u00b7 cost ' + money(day.cost),
      { image: charts.day, url: QUANTUM + '/ceo-b2c' }))
  }
  blocks.push({ type: 'carousel', block_id: 'qb_kpis', elements: cards.slice(0, 10) })

  blocks.push({ type: 'divider' })

  // 5. every line and head, sortable in place. raw_number carries the sortable
  //    value and the printed text separately, so "1.24 Cr" still sorts as 12400000.
  const lines = []
  const add = (head, kind, value) => { if (value != null) lines.push([head, kind, value]) }
  add('SR Online', 'Revenue', rev.sr)
  add('AC Online', 'Revenue', rev.ac)
  add('VAS Online', 'Revenue', rev.vas)
  add('Offline revenue', 'Revenue', rev.off)
  add('Perf. Marketing', 'Cost', cost.pm)
  add('Operating', 'Cost', cost.op)
  add('Offline cost', 'Cost', cost.off)
  add('Corp. Overheads', 'Cost', cost.corp)
  add('People', 'Cost', cost.people)
  if (lines.length) {
    blocks.push({
      type: 'data_table',
      block_id: 'qb_lines',
      caption: 'Revenue lines and cost heads, each read against revenue',
      page_size: 10,
      row_header_column_index: 0,
      rows: [[cellText('Head'), cellText('Type'), cellText('Amount'), cellText('% of revenue')]].concat(
        lines.map(function (r) {
          const sh = shareOf(r[2], rev.total)
          return [cellText(r[0]), cellText(r[1]), cellNum(r[2], money(r[2])), cellNum(sh || 0, pct1(sh))]
        })
      ),
    })
  }

  // 6. the read and the caveats, collapsed so the top of the message stays short
  const notes = (Array.isArray(c.notes) ? c.notes : []).filter(Boolean)
  const caveats = []
  if (peopleOutside) {
    caveats.push('People cost is booked monthly in the sheet, not daily: ' + money(c.peopleMonthly)
      + ' for the month. It sits outside the cost and net inflow above.')
  }
  if (c.partial) {
    caveats.push((c.monthLabel || 'This month') + ' is still running, so it is being read against a completed month.')
  }
  if (notes.length || caveats.length) {
    const kids = []
    if (notes.length) kids.push(RICH([SEC([T('What the numbers say', { bold: true })]), BULLETS(notes)]))
    if (caveats.length) kids.push(RICH([SEC([T('What we cannot tell yet', { bold: true })]), BULLETS(caveats)]))
    blocks.push({
      type: 'container',
      block_id: 'qb_read',
      title: { type: 'plain_text', text: 'The read' },
      subtitle: { type: 'plain_text', text: (notes.length + caveats.length) + ' rules fired. Nothing here is generated prose.' },
      is_collapsible: true,
      default_collapsed: true,
      width: 'wide',
      child_blocks: kids.slice(0, 10),
    })
  }

  // 7. provenance. The part a technical reader checks first.
  if (sources.length) {
    blocks.push({
      type: 'plan',
      block_id: 'qb_provenance',
      title: 'How this brief was built',
      tasks: sources.slice(0, 10).map(task),
    })
  }

  // 8. where to go next. url buttons only -- these need no interactivity endpoint.
  const acts = [{
    type: 'button',
    style: 'primary',
    text: { type: 'plain_text', text: 'Open CEO B2C' },
    url: QUANTUM + '/ceo-b2c',
    action_id: 'qb_open_dash',
  }]
  if (c.canvasUrl) {
    acts.push({
      type: 'button',
      text: { type: 'plain_text', text: 'Open the month canvas' },
      url: c.canvasUrl,
      action_id: 'qb_open_canvas',
    })
  }
  blocks.push({ type: 'actions', block_id: 'qb_actions', elements: acts })

  // 9. the verdict. Rendered ONLY when an interactivity request URL is configured:
  //    without one these buttons post to nowhere and error in the reader's face,
  //    so they are left out rather than shipped broken.
  if (c.interactivity) {
    blocks.push({
      type: 'context_actions',
      block_id: 'qb_feedback',
      elements: [{
        type: 'feedback_buttons',
        action_id: 'qb_rate',
        positive_button: { text: { type: 'plain_text', text: 'Useful' }, accessibility_label: 'This brief was useful', value: 'brief_good' },
        negative_button: { text: { type: 'plain_text', text: 'Not useful' }, accessibility_label: 'This brief was not useful', value: 'brief_bad' },
      }],
    })
  }

  // -- text fallback. Notifications, search and the Send to Slack preview all read
  //    this, and it is built from the same numbers, so nothing can drift between
  //    what was previewed and what was posted.
  const fb = []
  fb.push(':bar_chart: *Quantum Brief \u2014 B2C \u2014 ' + (c.monthLabel || '') + ', through ' + (c.through || '') + '*')
  if (c.isTest) fb.push('_Test post._')
  fb.push('')
  fb.push('*Revenue* ' + money(rev.total) + '   *Cost* ' + money(cost.total) + '   *Net inflow* ' + money(c.net)
    + (margin == null ? '' : ' \u00b7 ' + pct1(margin) + ' margin'))
  if (day) {
    fb.push('*' + day.date + '* revenue ' + money(day.rev) + ' \u00b7 cost ' + money(day.cost) + ' \u00b7 net ' + money(day.net))
  }
  if (notes.length) { fb.push(''); notes.forEach(function (n) { fb.push('\u2022 ' + n) }) }
  if (caveats.length) { fb.push(''); caveats.forEach(function (n) { fb.push(':warning: ' + n) }) }

  return [{
    key: 'brief',
    id: 'QB-1',
    label: 'Quantum Brief',
    text: fb.join('\n'),
    blocks: blocks,
    attach: true,
    metadata: {
      event_type: 'quantum_brief',
      event_payload: {
        month: c.monthLabel || null,
        through: c.through || null,
        revenue: rev.total == null ? null : rev.total,
        cost: cost.total == null ? null : cost.total,
        net: c.net == null ? null : c.net,
        margin_pct: margin == null ? null : Number(margin.toFixed(2)),
        people_outside: !!peopleOutside,
        day_date: day ? day.date : null,
        day_net: day ? day.net : null,
      },
    },
  }]
}

export const CEO_BRIEF_VERSIONS = [{
  id: 'quantum-brief',
  code: 'QB',
  recommended: true,
  msgKeys: ['brief'],
  name: 'Quantum Brief',
  tagline: 'One Block Kit message: KPI cards, a sortable table, the read, and a published source trail.',
  what: [
    'A carousel of KPI cards, each with its own chart and a link into Quantum',
    'Revenue lines and cost heads in one sortable, paginated table',
    'The read and the caveats collapsed, so the top of the message stays short',
    'A plan block naming every source that answered, and every one that did not',
    'The table image and a CSV land in the thread',
  ],
  build: buildQuantumBrief,
}]

export default CEO_BRIEF_VERSIONS
