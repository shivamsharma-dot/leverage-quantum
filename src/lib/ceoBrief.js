// Quantum Brief -- the CEO's daily read, built as native Block Kit.
//
// Additive only. None of the existing builders (V3/V5/V6/V7 in pmReport.js, B2C
// in b2cReport.js) are imported, changed or read by this file, and none of their
// behaviour moves: they keep emitting { text, table, chart } and keep travelling
// the same path through api/send-report.js they always did. The only difference
// is that the messages this builder returns also carry a blocks array, and the
// server posts blocks when it finds one.
//
// Two messages are posted, on purpose:
//   1. the brief  -- what happened, colour coded, readable on a phone
//   2. the ledger -- revenue total, cost total, net inflow, then every line and
//      head, each read across last day / month to date / year to date
// Splitting them keeps the top of the thread short and gives the numbers their
// own message to be scrolled, sorted and quoted from.
//
// Nothing in here links back into Quantum. The CEO reads the numbers in Slack
// and never has to open the dashboard they were pulled from.

const CR = 1e7
const LAKH = 1e5

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

// A movement, where the sign is the whole point.
const signed = n => (n == null || !isFinite(n) ? '\u2014' : (n > 0 ? '+' : '') + money(n))

// tag is the only Block Kit element that carries a real colour, so every verdict
// in this file is expressed as one. Costs invert: spending more is not good news.
const tone = (n, invert) => (n == null ? 'gray' : (invert ? n <= 0 : n >= 0) ? 'green' : 'red')
const dotFor = t => (t === 'red' ? ':red_circle:' : t === 'green' ? ':large_green_circle:' : ':white_circle:')

// -- Block Kit atoms ----------------------------------------------------------

const T = (text, style) => (style ? { type: 'text', text, style } : { type: 'text', text })
const TAG = (text, color) => ({ type: 'tag', text, color })
const SEC = elements => ({ type: 'rich_text_section', elements })
const BULLETS = lines => ({ type: 'rich_text_list', style: 'bullet', elements: lines.map(l => SEC([T(l)])) })
const RICH = elements => ({ type: 'rich_text', elements })
// rich_text does not parse :shortcode: the way mrkdwn does -- an emoji inside a
// rich_text section has to be its own element or it prints as literal text.
const EMOJI = name => ({ type: 'emoji', name })

// data_table cells. A rich_text cell is the only way to get a colour into a
// table, so every figure that carries a verdict is rendered as a tag.
const cellText = v => ({ type: 'raw_text', text: v == null || v === '' ? '\u2014' : String(v) })
const cellNum = (value, text) => ({ type: 'raw_number', value: Number(value) || 0, text: text || '\u2014' })
const cellBold = v => RICH([SEC([T(v == null || v === '' ? '\u2014' : String(v), { bold: true })])])
const cellTag = (text, color) => RICH([SEC([TAG(text, color)])])
const cellMoney = (o, k) => (o && o[k] != null ? cellNum(o[k], money(o[k])) : cellText('\u2014'))
const cellMoneyTone = (o, k) => (o && o[k] != null ? cellTag(money(o[k]), tone(o[k])) : cellText('\u2014'))
const cellPctTone = n => (n == null ? cellText('\u2014') : cellTag(pct1(n), tone(n)))

// hero_image is attached only when the caller has a real hosted URL: Slack
// rejects data: URLs, so chartPng output has to be uploaded first and the
// permalink handed in as ctx.charts. No card carries a button any more -- the
// only place one could point is the dashboard, and the CEO does not open it.
function card(id, title, subtitle, body, opts) {
  const o = opts || {}
  const c = {
    type: 'card',
    block_id: 'qb_card_' + id,
    title: { type: 'mrkdwn', text: String(title).slice(0, 150) },
    subtitle: { type: 'mrkdwn', text: String(subtitle).slice(0, 150) },
    body: { type: 'mrkdwn', text: String(body).slice(0, 200) },
  }
  if (o.image) c.hero_image = { type: 'image', image_url: o.image, alt_text: String(title) }
  if (o.subtext) c.subtext = { type: 'mrkdwn', text: String(o.subtext).slice(0, 200) }
  return c
}

// data_visualization is the one native block that redraws itself to the width it
// is given, so it is the only honest way to show nine heads on a phone. Two per
// message is the hard limit, and every series has to carry a point for every
// category, so gaps are sent as zero rather than dropped.
const CRV = n => (n == null || !isFinite(n) ? 0 : Number((n / CR).toFixed(2)))

function bars(title, cats, aName, aVals, bName, bVals) {
  if (!cats.length) return null
  return {
    type: 'data_visualization',
    title: String(title).slice(0, 50),
    chart: {
      type: 'bar',
      series: [
        { name: String(aName).slice(0, 20), data: cats.map(function (c, i) { return { label: c, value: aVals[i] } }) },
        { name: String(bName).slice(0, 20), data: cats.map(function (c, i) { return { label: c, value: bVals[i] } }) },
      ],
      axis_config: { categories: cats, y_label: '\u20b9 Cr' },
    },
  }
}

// A figure that is judged against the same days of the month before: the colour
// is the comparison, so the phone does not need a fourth column to carry it.
const cellMoneyVs = (o, p, k, invert) => {
  if (!o || o[k] == null) return cellText('\u2014')
  if (!p || p[k] == null) return cellNum(o[k], money(o[k]))
  return cellTag(money(o[k]), tone(o[k] - p[k], invert))
}

// -- one shape for all three windows ------------------------------------------
// The sheet names offline revenue offRev and offline cost offCost; the
// month-to-date context hands the same two over as rev.off and cost.off.
// Normalised once here so last day, month to date and year to date are read by
// exactly the same code below.

const HEADS = [
  ['SR Online', 'Revenue', 'sr', 'SR'],
  ['AC Online', 'Revenue', 'ac', 'AC'],
  ['VAS Online', 'Revenue', 'vas', 'VAS'],
  ['Offline revenue', 'Revenue', 'offRev', 'Offline'],
  ['Perf. Marketing', 'Cost', 'pm', 'Marketing'],
  ['Operating', 'Cost', 'op', 'Operating'],
  ['Offline cost', 'Cost', 'offCost', 'Offline'],
  ['Corp. Overheads', 'Cost', 'corp', 'Overheads'],
  ['People', 'Cost', 'people', 'People'],
]

function fromCtx(rev, cost, net) {
  return {
    sr: rev.sr, ac: rev.ac, vas: rev.vas, offRev: rev.off,
    pm: cost.pm, op: cost.op, offCost: cost.off, corp: cost.corp, people: cost.people,
    rev: rev.total, cost: cost.total, net: net,
  }
}
function fromSheet(o) {
  if (!o) return null
  return {
    sr: o.sr, ac: o.ac, vas: o.vas, offRev: o.offRev,
    pm: o.pm, op: o.op, offCost: o.offCost, corp: o.corp, people: o.people,
    rev: o.rev, cost: o.cost, net: o.net,
  }
}
const marginOf = w => (w && w.rev ? (w.net / w.rev) * 100 : null)

// -- the diagnosis ------------------------------------------------------------
// Every line below is arithmetic on two windows the page has already computed:
// the month so far, and the same number of days of the month before it. There
// is no forecast and no judgement in here, so every sentence can be checked
// against the ledger message without leaving Slack.

function movers(now, was, kind) {
  if (!was) return []
  return HEADS.filter(function (h) { return h[1] === kind })
    .map(function (h) { return { label: h[0], now: now[h[2]], was: was[h[2]] } })
    .filter(function (x) { return x.now != null && x.was != null && x.now !== x.was })
    .map(function (x) { x.d = x.now - x.was; return x })
}

function insights(c, w, p, margin, ym) {
  const bad = []
  const fix = []
  const lab = (c.prev && c.prev.label) || 'the month before'

  if (p && p.net != null && w.net != null) {
    bad.push('Net inflow moved from ' + money(p.net) + ' in ' + lab + ' to ' + money(w.net)
      + ', a swing of ' + signed(w.net - p.net) + ' over the same number of days.')
  }
  const dRev = p && p.rev != null && w.rev != null ? w.rev - p.rev : null
  const dCost = p && p.cost != null && w.cost != null ? w.cost - p.cost : null
  if (dRev != null && dCost != null) {
    const tot = Math.abs(dRev) + Math.abs(dCost)
    bad.push('Revenue moved ' + signed(dRev) + ', cost moved ' + signed(dCost) + '.'
      + (tot ? ' ' + Math.round((Math.abs(dCost) / tot) * 100) + '% of the movement sits on the cost side.' : ''))
  }
  if (w.rev && w.cost != null) {
    bad.push('Every ' + money(CR) + ' of revenue is carrying ' + money((w.cost / w.rev) * CR) + ' of cost.')
  }
  const up = movers(w, p, 'Cost').filter(function (x) { return x.d > 0 }).sort(function (a, b) { return b.d - a.d })
  const down = movers(w, p, 'Revenue').filter(function (x) { return x.d < 0 }).sort(function (a, b) { return a.d - b.d })
  if (up.length) {
    bad.push('The rise is concentrated: ' + up.slice(0, 2).map(function (x) { return x.label + ' ' + signed(x.d) }).join(' and ')
      + ', against ' + lab + '.')
  }
  if (down.length) {
    bad.push('The largest fall on revenue is ' + down[0].label + ', ' + money(down[0].was) + ' down to '
      + money(down[0].now) + ' (' + signed(down[0].d) + ').')
  }
  if (c.days && c.negDays != null) {
    bad.push(c.negDays + ' of the ' + c.days + ' completed days lost money'
      + (c.worstDay ? ', the worst ' + c.worstDay.date + ' at ' + money(c.worstDay.net) : '') + '.')
  }
  const top = HEADS.filter(function (h) { return h[1] === 'Revenue' && w[h[2]] != null })
    .sort(function (a, b) { return w[b[2]] - w[a[2]] })[0]
  if (top && w.rev) {
    bad.push(top[0] + ' alone is ' + pct1(shareOf(w[top[2]], w.rev)) + ' of revenue, so the month turns on one line.')
  }

  const gap = w.rev != null && w.cost != null ? w.cost - w.rev : null
  if (gap != null && gap > 0) {
    fix.push('Break-even needs revenue of ' + money(w.cost) + ', ' + money(gap) + ' more than booked'
      + (c.days ? ' \u2014 about ' + money(gap / c.days) + ' a day' : '') + '.')
    fix.push('Or cost down ' + money(gap) + ', ' + pct1(shareOf(gap, w.cost)) + ' of the month spend.')
  }
  if (up.length && w.net != null) {
    fix.push(up[0].label + ' back at its ' + lab + ' level of ' + money(up[0].was) + ' would put the month at '
      + money(w.net + up[0].d) + ' instead of ' + money(w.net) + '.')
    if (up.length > 1) {
      fix.push(up[0].label + ' and ' + up[1].label + ' both back at that level: ' + money(w.net + up[0].d + up[1].d) + '.')
    }
  }
  if (w.rev) fix.push('One point of net margin on this month is worth ' + money(w.rev / 100) + '.')
  if (margin != null && ym != null) {
    fix.push('The month is running ' + Math.abs(margin - ym).toFixed(1) + ' pp '
      + (margin >= ym ? 'above' : 'below') + ' the financial year to date, which stands at ' + pct1(ym) + '.')
  }
  return { bad: bad, fix: fix }
}

// -- message 1: the brief -----------------------------------------------------

function briefBlocks(c, w, day, margin, peopleOutside, notes, caveats, dx, p) {
  const d = c.d || {}
  const charts = c.charts || {}
  const throughTs = c.throughTs || Math.floor(Date.now() / 1000)
  const blocks = []

  blocks.push({ type: 'header', text: { type: 'plain_text', text: 'Quantum Brief \u2014 B2C', emoji: true } })

  const stamp = [
    T((c.monthLabel || '') + ' \u00b7 through ', { bold: true }),
    { type: 'date', timestamp: throughTs, format: '{date_short}', fallback: c.through || '', style: { bold: true } },
  ]
  // Two short lines rather than one long one: a phone wraps a single row of
  // pills into something that reads like a broken sentence.
  const pills = [TAG('D-1 complete', 'green')]
  if (peopleOutside) pills.push(T(' '), TAG('People booked monthly', 'gray'))
  if (c.isTest) pills.push(T(' '), TAG('Test post', 'indigo'))
  blocks.push(RICH([SEC(stamp), SEC(pills)]))

  // The headline, in colour. Green or red on the figure itself is the point of
  // this row: the verdict should not need a sentence to carry it.
  const costTone = w.cost != null && w.rev != null && w.cost > w.rev ? 'red' : 'green'
  blocks.push(RICH([
    SEC([TAG('Revenue ' + money(w.rev), 'blue'), T(' '), TAG('Cost ' + money(w.cost), costTone)]),
    SEC([TAG('Net ' + money(w.net), tone(w.net)), T(' '), TAG('Margin ' + pct1(margin), tone(margin))]),
  ]))

  blocks.push({
    type: 'markdown',
    text: '**Net ' + money(w.net) + ' on ' + money(w.rev) + ' revenue'
      + (margin == null ? '.**' : ' \u00b7 ' + pct1(margin) + ' margin.**')
      + (day ? '\n' + day.date + ' \u00b7 rev ' + money(day.rev) + ' \u00b7 cost ' + money(day.cost)
        + ' \u00b7 net ' + money(day.net) : ''),
  })

  const cards = [
    card('net', dotFor(tone(w.net)) + ' Net inflow',
      money(w.net) + (move(d.net) ? ' \u00b7 ' + move(d.net) : ''),
      'Revenue ' + money(w.rev) + '\nless cost ' + money(w.cost) + '\nMargin ' + pct1(margin),
      { image: charts.net, subtext: peopleOutside ? 'Excludes People cost \u2014 booked monthly, ' + money(c.peopleMonthly) + '.' : null }),
    card('revenue', dotFor(d.rev != null ? tone(d.rev) : 'green') + ' Revenue',
      money(w.rev) + (move(d.rev) ? ' \u00b7 ' + move(d.rev) : ''),
      'SR ' + money(w.sr) + '\nAC ' + money(w.ac) + '\nVAS ' + money(w.vas)
        + (w.offRev == null ? '' : '\nOffline ' + money(w.offRev)),
      { image: charts.revenue }),
    card('cost', dotFor(d.cost != null ? tone(d.cost, true) : costTone) + ' Cost',
      money(w.cost) + (move(d.cost) ? ' \u00b7 ' + move(d.cost) : ''),
      'Marketing ' + money(w.pm) + '\nOperating ' + money(w.op) + '\nOffline ' + money(w.offCost)
        + '\nOverheads ' + money(w.corp) + '\nPeople ' + money(w.people),
      { image: charts.cost }),
  ]
  if (day) {
    cards.push(card('day', dotFor(tone(day.net)) + ' Last completed day',
      money(day.net) + ' net',
      day.date + ' \u00b7 revenue ' + money(day.rev) + ' \u00b7 cost ' + money(day.cost),
      { image: charts.day }))
  }
  blocks.push({ type: 'carousel', block_id: 'qb_kpis', elements: cards.slice(0, 10) })

  // The month against the same days of the month before, drawn by Slack itself.
  if (p && (p.rev != null || p.cost != null)) {
    const lab = (c.prev && c.prev.label) || 'Month before'
    const chart = bars('This month against ' + lab + ' \u00b7 \u20b9 Cr',
      ['Revenue', 'Cost', 'Net inflow'],
      (c.monthLabel || 'This month').slice(0, 20), [CRV(w.rev), CRV(w.cost), CRV(w.net)],
      lab.slice(0, 20), [CRV(p.rev), CRV(p.cost), CRV(p.net)])
    if (chart) blocks.push(chart)
  }

  // The read. Four sections, each a list of rules that fired over the numbers
  // in the ledger message: nothing here is generated prose, and every figure
  // can be checked against the table below it. Left expanded, because this is
  // the part worth reading.
  const bad = ((dx && dx.bad) || []).slice(0, 5)
  const fix = ((dx && dx.fix) || []).slice(0, 4)
  const total = notes.length + bad.length + fix.length + caveats.length
  if (total) {
    const kids = []
    if (notes.length) kids.push(RICH([SEC([T('Where the month stands', { bold: true })]), BULLETS(notes)]))
    if (bad.length) kids.push(RICH([SEC([EMOJI('red_circle'), T(' What went wrong', { bold: true })]), BULLETS(bad)]))
    if (fix.length) kids.push(RICH([SEC([EMOJI('large_green_circle'), T(' What would close the gap', { bold: true })]), BULLETS(fix)]))
    if (caveats.length) kids.push(RICH([SEC([T('What we cannot tell yet', { bold: true })]), BULLETS(caveats)]))
    blocks.push({
      type: 'container',
      block_id: 'qb_read',
      title: { type: 'plain_text', text: 'The read' },
      subtitle: { type: 'plain_text', text: total + ' checks \u00b7 this month against ' + ((c.prev && c.prev.label) || 'the month before') + ', same number of days' },
      is_collapsible: true,
      default_collapsed: false,
      width: 'wide',
      child_blocks: kids.slice(0, 10),
    })
  }

  // Rendered only when an interactivity request URL is configured: without one
  // these buttons post to nowhere and error in the reader's face.
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
  return blocks
}

// -- message 2: the ledger ----------------------------------------------------
// Revenue total and cost total split out, the net inflow underneath in green or
// red, then the revenue lines and the cost heads in a table each. Four columns
// everywhere, because this is read on a phone.

function ledgerBlocks(last, mtd, ytd, prev, lastLab, ytdLab, prevLab) {
  const blocks = []

  blocks.push({ type: 'header', text: { type: 'plain_text', text: 'Revenue, cost, net inflow', emoji: true } })

  blocks.push(RICH([
    SEC([T('Net inflow', { bold: true })]),
    SEC([
      TAG(lastLab + ' ' + money(last && last.net), tone(last && last.net)),
      T(' '),
      TAG('MTD ' + money(mtd.net), tone(mtd.net)),
      T(' '),
      TAG('YTD ' + money(ytd && ytd.net), tone(ytd && ytd.net)),
    ]),
  ]))

  // Three columns is what a phone shows without cutting one off, so the month
  // and the month before get one table and the day and the year get another.
  if (prev) {
    blocks.push({
      type: 'data_table',
      block_id: 'qb_totals_mom',
      caption: 'Month to date against ' + prevLab + ', same number of days',
      page_size: 4,
      row_header_column_index: 0,
      rows: [
        [cellText('Total'), cellText('MTD'), cellText(prevLab)],
        [cellBold('Revenue'), cellMoneyVs(mtd, prev, 'rev'), cellMoney(prev, 'rev')],
        [cellBold('Cost'), cellMoneyVs(mtd, prev, 'cost', true), cellMoney(prev, 'cost')],
        [cellBold('Net inflow'), cellMoneyTone(mtd, 'net'), cellMoneyTone(prev, 'net')],
        [cellBold('Margin'), cellPctTone(marginOf(mtd)), cellPctTone(marginOf(prev))],
      ],
    })
  }

  blocks.push({
    type: 'data_table',
    block_id: 'qb_totals_day',
    caption: 'Last completed day and the financial year so far',
    page_size: 4,
    row_header_column_index: 0,
    rows: [
      [cellText('Total'), cellText(lastLab), cellText(ytdLab)],
      [cellBold('Revenue'), cellMoney(last, 'rev'), cellMoney(ytd, 'rev')],
      [cellBold('Cost'), cellMoney(last, 'cost'), cellMoney(ytd, 'cost')],
      [cellBold('Net inflow'), cellMoneyTone(last, 'net'), cellMoneyTone(ytd, 'net')],
      [cellBold('Margin'), cellPctTone(marginOf(last)), cellPctTone(marginOf(ytd))],
    ],
  })

  // Type used to be a column. It is now the table it sits in, the month before
  // took the third column, and each table closes on its own total.
  function lines(kind, id, head, caption, totalLabel, invert) {
    const rows = HEADS.filter(function (h) {
      return h[1] === kind && (mtd[h[2]] != null || (prev && prev[h[2]] != null))
    })
    if (!rows.length) return null
    const body = rows.map(function (h) {
      return [cellText(h[3] || h[0]), cellMoneyVs(mtd, prev, h[2], invert), cellMoney(prev, h[2])]
    })
    const k = kind === 'Revenue' ? 'rev' : 'cost'
    body.push([cellBold(totalLabel), cellBold(money(mtd[k])), cellBold(money(prev && prev[k]))])
    return {
      type: 'data_table',
      block_id: id,
      caption: caption,
      page_size: 7,
      row_header_column_index: 0,
      rows: [[cellText(head), cellText('MTD'), cellText(prevLab)]].concat(body),
    }
  }

  const rv = lines('Revenue', 'qb_rev', 'Line', 'Revenue lines, month to date against ' + prevLab, 'Total revenue', false)
  const cs = lines('Cost', 'qb_cost', 'Head', 'Cost heads, month to date against ' + prevLab, 'Total cost', true)
  if (rv) blocks.push(rv)
  if (cs) blocks.push(cs)

  // Two charts is the per-message limit, so they go where the columns had to be
  // dropped: one for the lines, one for the heads.
  if (prev) {
    const rvHeads = HEADS.filter(function (h) { return h[1] === 'Revenue' && (mtd[h[2]] != null || prev[h[2]] != null) })
    const csHeads = HEADS.filter(function (h) { return h[1] === 'Cost' && (mtd[h[2]] != null || prev[h[2]] != null) })
    const mtdLab = 'MTD'
    const c1 = bars('Revenue lines \u00b7 \u20b9 Cr', rvHeads.map(function (h) { return h[3] || h[0] }),
      mtdLab, rvHeads.map(function (h) { return CRV(mtd[h[2]]) }),
      prevLab, rvHeads.map(function (h) { return CRV(prev[h[2]]) }))
    const c2 = bars('Cost heads \u00b7 \u20b9 Cr', csHeads.map(function (h) { return h[3] || h[0] }),
      mtdLab, csHeads.map(function (h) { return CRV(mtd[h[2]]) }),
      prevLab, csHeads.map(function (h) { return CRV(prev[h[2]]) }))
    if (c1) blocks.push(c1)
    if (c2) blocks.push(c2)
  }
  return blocks
}

// -- the report ---------------------------------------------------------------

function buildQuantumBrief(ctx) {
  const c = ctx || {}
  const rev = c.rev || {}
  const cost = c.cost || {}
  const day = c.day || null
  const margin = c.margin != null ? c.margin : shareOf(c.net, rev.total)
  const peopleOutside = cost.people == null && c.peopleMonthly != null

  const mtd = fromCtx(rev, cost, c.net)
  const last = fromSheet(day)
  const ytd = fromSheet(c.ytd)
  const lastLab = day && day.date ? day.date : 'Last day'
  const ytdLab = (c.ytd && c.ytd.label ? c.ytd.label : 'Year') + ' to date'
  const prevLab = (c.prev && c.prev.label) || 'Month before'

  // The prior window, normalised the same way, so the diagnosis compares a
  // 31-day month to the first 31 days of the one before it and never to its
  // finished total.
  const prevW = c.prev ? fromCtx(c.prev.rev || {}, c.prev.cost || {}, c.prev.net) : null
  const dx = insights(c, mtd, prevW, margin, marginOf(ytd))

  const notes = (Array.isArray(c.notes) ? c.notes : []).filter(Boolean)
  const caveats = []
  if (peopleOutside) {
    caveats.push('People cost is booked monthly in the sheet, not daily: ' + money(c.peopleMonthly)
      + ' for the month. It sits outside the cost and net inflow above.')
  }
  if (c.partial) {
    caveats.push((c.monthLabel || 'This month') + ' is still running, so it is being read against a completed month.')
  }

  // Text fallbacks. Notifications, search and the Send to Slack preview all read
  // these, and they are built from the same numbers, so nothing can drift
  // between what was previewed and what was posted.
  const fb = []
  fb.push(':bar_chart: *Quantum Brief \u2014 B2C \u2014 ' + (c.monthLabel || '') + ', through ' + (c.through || '') + '*')
  if (c.isTest) fb.push('_Test post._')
  fb.push('')
  fb.push('*Revenue* ' + money(mtd.rev) + '  *Cost* ' + money(mtd.cost) + '  *Net inflow* ' + money(mtd.net)
    + (margin == null ? '' : ' \u00b7 ' + pct1(margin) + ' margin'))
  if (day) fb.push('*' + day.date + '* revenue ' + money(day.rev) + ' \u00b7 cost ' + money(day.cost) + ' \u00b7 net ' + money(day.net))
  if (notes.length) { fb.push(''); notes.forEach(function (n) { fb.push('\u2022 ' + n) }) }
  if (dx.bad.length) { fb.push(''); fb.push('*What went wrong*'); dx.bad.forEach(function (n) { fb.push('\u2022 ' + n) }) }
  if (dx.fix.length) { fb.push(''); fb.push('*What would close the gap*'); dx.fix.forEach(function (n) { fb.push('\u2022 ' + n) }) }
  if (caveats.length) { fb.push(''); caveats.forEach(function (n) { fb.push(':warning: ' + n) }) }

  const lb = []
  lb.push('*Revenue, cost and net inflow*')
  lb.push('')
  lb.push('*Total revenue*  ' + lastLab + ' ' + money(last && last.rev) + ' \u00b7 MTD ' + money(mtd.rev) + ' \u00b7 ' + ytdLab + ' ' + money(ytd && ytd.rev))
  lb.push('*Total cost*  ' + lastLab + ' ' + money(last && last.cost) + ' \u00b7 MTD ' + money(mtd.cost) + ' \u00b7 ' + ytdLab + ' ' + money(ytd && ytd.cost))
  lb.push('*Net inflow*  ' + lastLab + ' ' + money(last && last.net) + ' \u00b7 MTD ' + money(mtd.net) + ' \u00b7 ' + ytdLab + ' ' + money(ytd && ytd.net))
  lb.push('')
  lb.push('_Net margin_  ' + pct1(marginOf(last)) + ' \u00b7 ' + pct1(marginOf(mtd)) + ' \u00b7 ' + pct1(marginOf(ytd)))
  if (prevW) {
    lb.push('')
    lb.push('*Against ' + prevLab + '* revenue ' + money(prevW.rev) + ' \u00b7 cost ' + money(prevW.cost)
      + ' \u00b7 net ' + money(prevW.net) + ' \u00b7 margin ' + pct1(marginOf(prevW)))
  }

  return [
    {
      key: 'brief',
      id: 'QB-1',
      label: 'Quantum Brief',
      text: fb.join('\n'),
      blocks: briefBlocks(c, mtd, day, margin, peopleOutside, notes, caveats, dx, prevW),
      attach: true,
      metadata: {
        event_type: 'quantum_brief',
        event_payload: {
          month: c.monthLabel || null,
          through: c.through || null,
          revenue: mtd.rev == null ? null : mtd.rev,
          cost: mtd.cost == null ? null : mtd.cost,
          net: mtd.net == null ? null : mtd.net,
          margin_pct: margin == null ? null : Number(margin.toFixed(2)),
          people_outside: !!peopleOutside,
          day_date: day ? day.date : null,
          day_net: day ? day.net : null,
        },
      },
    },
    {
      key: 'ledger',
      id: 'QB-2',
      label: 'Split totals \u2014 last day, MTD, YTD',
      text: lb.join('\n'),
      blocks: ledgerBlocks(last, mtd, ytd, prevW, lastLab, ytdLab, prevLab),
    },
  ]
}

export const CEO_BRIEF_VERSIONS = [{
  id: 'quantum-brief',
  code: 'QB',
  recommended: true,
  msgKeys: ['brief', 'ledger'],
  name: 'Quantum Brief',
  tagline: 'Two messages: the colour-coded brief with the diagnosis, then the split totals across last day, month and year.',
  what: [
    'A colour strip and KPI cards, green or red on the figure itself',
    'Revenue total and cost total split out, net inflow underneath in colour',
    'Month to date against the same days of the month before, line by line',
  'A total row on the revenue lines and on the cost heads',
  'Native Slack charts that redraw themselves to the width of the phone',
    'The read, open by default: where the month stands, what went wrong, what would close the gap',
    'No links back into the dashboard \u2014 every number is read inside Slack',
  'Built for a phone: nothing scrolls sideways, nothing needs a laptop',
  ],
  build: buildQuantumBrief,
}]

export default CEO_BRIEF_VERSIONS
