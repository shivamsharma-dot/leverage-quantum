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
// A raw_number cell renders empty inside a table block, so every figure is
// written as text. Nothing here is sorted, so the numeric type buys nothing.
const cellNum = (value, text) => ({ type: 'raw_text', text: text || '\u2014' })
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

// Slack's own chart block takes no colour: the palette is Slack's, not ours.
// chartPng.js already draws the same spec on a canvas in the brand ramp from
// src/ui/dashboardKit.jsx, with the number written on every bar, and
// SlackReportPanel uploads that image for any message carrying a chart. So the
// spec below is built once and handed over as message.chart -- Slack's own
// block stays behind it as the fallback if the canvas is unavailable.
const NUM = n => (n == null || !isFinite(n) ? 0 : Number(n))

function bars(title, cats, aName, aVals, bName, bVals, note, layout) {
  if (!cats.length) return null
  return {
    type: 'data_visualization',
    title: String(title).slice(0, 50),
    unit: 'inr',
    note: note ? String(note) : '',
    layout: layout || '',
    chart: {
      type: 'bar',
      series: [
        { name: String(aName).slice(0, 20), data: cats.map(function (c, i) { return { label: c, value: aVals[i] } }) },
        { name: String(bName).slice(0, 20), data: cats.map(function (c, i) { return { label: c, value: bVals[i] } }) },
      ],
      axis_config: { categories: cats, y_label: '\u20b9' },
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
  ['SR (Online + Offline)', 'Revenue', 'sr', 'SR'],
  ['AC Online', 'Revenue', 'ac', 'AC'],
  ['VAS Online', 'Revenue', 'vas', 'VAS'],
  ['Offline (AC + VAS)', 'Revenue', 'offRev', 'Offline rev'],
  ['Perf. Marketing', 'Cost', 'pm', 'Marketing'],
  ['Operating (AC + VAS)', 'Cost', 'op', 'Operating'],
  ['Offline (rent, staff, upkeep)', 'Cost', 'offCost', 'Offline cost'],
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

  blocks.push({ type: 'header', text: { type: 'plain_text', text: 'B2C Performance Brief', emoji: true } })

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
      'SR (Online + Offline) ' + money(w.sr) + '\nAC Online ' + money(w.ac)
        + '\nVAS Online ' + money(w.vas)
        + (w.offRev == null ? '' : '\nOffline (AC + VAS) ' + money(w.offRev)),
      { image: charts.revenue }),
    card('cost', dotFor(d.cost != null ? tone(d.cost, true) : costTone) + ' Cost',
      money(w.cost) + (move(d.cost) ? ' \u00b7 ' + move(d.cost) : ''),
      'Perf. Marketing ' + money(w.pm) + '\nOperating (AC + VAS) ' + money(w.op)
        + '\nOffline (rent, staff, upkeep) ' + money(w.offCost)
        + '\nCorp. Overheads ' + money(w.corp) + '\nPeople ' + money(w.people),
      { image: charts.cost }),
  ]
  if (day) {
    cards.push(card('day', dotFor(tone(day.net)) + ' Last completed day',
      money(day.net) + ' net',
      day.date + ' \u00b7 revenue ' + money(day.rev) + ' \u00b7 cost ' + money(day.cost),
      { image: charts.day }))
  }
  blocks.push({ type: 'carousel', block_id: 'qb_kpis', elements: cards.slice(0, 10) })

  // The read. Four sections, each a list of rules that fired over the numbers
  // in the ledger message: nothing here is generated prose, and every figure
  // can be checked against the table below it. Left expanded, because this is
  // the part worth reading.
  const bad = ((dx && dx.bad) || []).slice(0, 6)
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

// The data_table block gives no control over column width, so on a phone its
// last column falls off the right edge and the CEO has to drag sideways. The
// plain table block does give control: the label column is told to wrap and the
// figure columns are right aligned, which is what keeps a table inside a phone.
// The caption is not part of that block, so it is written above it instead.
function pushTable(out, t, wide) {
  if (!t || !t.rows || !t.rows.length) return out
  // The wide reading wants the native block itself, with its own sort, search
  // and open-full-screen controls, so it is handed through untouched.
  if (wide) { out.push(t); return out }
  const cols = t.rows[0].map((_, i) => (i === 0 ? { is_wrapped: true, align: 'left' } : { align: 'right' }))
  if (t.caption) out.push({ type: 'context', elements: [{ type: 'mrkdwn', text: '*' + t.caption + '*' }] })
  out.push({ type: 'table', block_id: t.block_id, column_settings: cols, rows: t.rows })
  return out
}

function ledgerBlocks(last, mtd, ytd, prev, lastLab, ytdLab, prevLab, wide) {
  const blocks = []
  const pt = function (out, t) { return pushTable(out, t, wide) }

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
    pt(blocks, {
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

  pt(blocks, {
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
      return [cellText(h[0]), cellMoneyVs(mtd, prev, h[2], invert), cellMoney(prev, h[2])]
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
  if (rv) pt(blocks, rv)
  if (cs) pt(blocks, cs)
  return blocks
}

// -- the report ---------------------------------------------------------------

function buildQuantumBrief(ctx, opts) {
  const c = ctx || {}
  // The wide reading is the earlier layout kept alive as its own version:
  // native data tables and standing bars instead of phone-sized ones.
  const wide = !!(opts && opts.wide)
  const chartLayout = wide ? 'vertical' : ''
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
  // The blocks used to keep five of these and the text fallback all of them, so
  // the preview showed a line the post never carried. One cap, applied here.
  dx.bad = dx.bad.slice(0, 6)
  dx.fix = dx.fix.slice(0, 4)

  // Both charts read one period against the same stretch of the month before,
  // so the chart says so on its own face.
  const sameSpan = 'Like for like \u2014 both bars cover the same '
    + (c.prev && c.prev.days ? (c.prev.days === 1 ? 'single day' : c.prev.days + ' days') : 'number of days')
    + ' of each month.'

  // One chart per message, both drawn in the brand ramp by chartPng.js.
  const chartTop = prevW ? bars((c.monthLabel || 'This month') + ' against ' + prevLab,
    ['Revenue', 'Cost'],
    'Month to date', [NUM(mtd.rev), NUM(mtd.cost)],
    prevLab, [NUM(prevW.rev), NUM(prevW.cost)], sameSpan, chartLayout) : null
  const chartHeads = prevW ? bars('Every line and head against ' + prevLab,
    HEADS.filter(function (h) { return mtd[h[2]] != null || prevW[h[2]] != null }).map(function (h) { return h[3] || h[0] }),
    'Month to date', HEADS.filter(function (h) { return mtd[h[2]] != null || prevW[h[2]] != null }).map(function (h) { return NUM(mtd[h[2]]) }),
    prevLab, HEADS.filter(function (h) { return mtd[h[2]] != null || prevW[h[2]] != null }).map(function (h) { return NUM(prevW[h[2]]) }), sameSpan, chartLayout) : null

  const notes = (Array.isArray(c.notes) ? c.notes : []).filter(Boolean)
  const caveats = []
  if (peopleOutside) {
    caveats.push('People cost is booked monthly in the sheet, not daily: ' + money(c.peopleMonthly)
      + ' for the month. It sits outside the cost and net inflow above.')
  }
  if (c.partial) {
    caveats.push((c.monthLabel || 'This month') + ' is still running, so it is being read against a completed month.')
  }
  var gaps = HEADS.filter(function (h) {
    return mtd[h[2]] == null && !(h[2] === 'people' && peopleOutside)
  }).map(function (h) { return h[3] || h[0] })
  if (gaps.length) {
    caveats.push(gaps.join(', ') + (gaps.length === 1 ? ' has' : ' have')
      + ' no value in the sheet for this window, so the totals above leave '
      + (gaps.length === 1 ? 'it' : 'them') + ' out.')
  }
  if (c.prev && c.prev.days) {
    caveats.push(prevLab + ' is the first ' + c.prev.days + ' day'
      + (c.prev.days === 1 ? '' : 's') + ' of the month before, not its finished total, so both'
      + ' columns cover the same stretch of the month.')
  }

  // Text fallbacks. Notifications, search and the Send to Slack preview all read
  // these, and they are built from the same numbers, so nothing can drift
  // between what was previewed and what was posted.
  const fb = []
  fb.push(':bar_chart: *B2C Performance Brief \u2014 ' + (c.monthLabel || '') + ', through ' + (c.through || '') + '*')
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
      label: 'Performance Brief',
      text: fb.join('\n'),
      blocks: briefBlocks(c, mtd, day, margin, peopleOutside, notes, caveats, dx, prevW),
      chart: chartTop,
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
      blocks: ledgerBlocks(last, mtd, ytd, prevW, lastLab, ytdLab, prevLab, wide),
      chart: chartHeads,
    },
  ]
}

export const CEO_BRIEF_VERSIONS = [{
  id: 'quantum-brief',
  code: 'QB',
  recommended: true,
  msgKeys: ['brief', 'ledger'],
  name: 'Performance Brief',
  tagline: 'Two messages: the colour-coded brief with the diagnosis, then the split totals across last day, month and year.',
  what: [
    'A colour strip and KPI cards, green or red on the figure itself',
    'Revenue total and cost total split out, net inflow underneath in colour',
    'Month to date against the same days of the month before, line by line',
  'A total row on the revenue lines and on the cost heads',
  'Brand-ramp charts drawn from the same numbers, one on each message',
    'The read, open by default: where the month stands, what went wrong, what would close the gap',
    'No links back into the dashboard \u2014 every number is read inside Slack',
  'Built for a phone: nothing scrolls sideways, nothing needs a laptop',
  ],
  build: buildQuantumBrief,
}, {
  id: 'quantum-brief-wide',
  code: 'QBW',
  msgKeys: ['brief', 'ledger'],
  name: 'Performance Brief \u2014 wide tables',
  tagline: 'The same two messages in the earlier reading: native tables the CEO can sort, search and open full screen, and standing-bar charts.',
  what: [
    'The same numbers, the same read and the same red and green rules as the Performance Brief',
    'Tables as native data tables \u2014 sortable, searchable, openable full screen',
    'Charts drawn as standing bars, two to a category, the figure written above each bar',
    'Every line and head carries its full definition, and the like-for-like note sits on both charts',
    'The wide tables can scroll sideways on a phone \u2014 that is the trade for the extra controls',
  ],
  build: function (ctx) { return buildQuantumBrief(ctx, { wide: true }) },
}]

export default CEO_BRIEF_VERSIONS
