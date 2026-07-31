// Slack PM report -- V7 builder: the daily read.
//
// V4 is a month-to-date report. Sent every morning it says almost the same thing twice:
// one more day only moves a month total by a percent or two. V7 inverts that. The
// headline is YESTERDAY, read against the day before it and against its own trailing
// week, and the month total is demoted to context at the end.
//
// Nothing is modelled and nothing extra is fetched. ctx.day is the last COMPLETE day --
// the current day is dropped upstream, so this always reads to D-1. ctx.dow.rows is the
// day-by-day series. ctx.cmp and ctx.table are the month-to-date cuts. Applications and
// CPA are absent by design, and no single day is ever annotated or explained away.
//
// Corridor and ad cuts are deliberately NOT here: the dashboard only builds those month
// to date, so carrying them would put the same table up every morning -- the exact
// problem V7 exists to solve. M3 says so in as many words.

const DASH = '\u2014'
const DOT = '   \u00b7   '
const UP = '\u25b2 '
const DOWN = '\u25bc '
const ARROW = '\u2192'

const DAY_BUDGET = 1000000
const QL_TARGET_LO = 550
const QL_TARGET_HI = 600

const numOf = v => { const n = Number(v); return isFinite(n) ? n : null }
const abs1 = n => Math.abs(n).toFixed(1) + '%'
const pctOf = (now, was) => (was > 0 && isFinite(now) ? ((now - was) / was) * 100 : null)
const pctText = n => (n == null ? DASH : n.toFixed(1) + '%')
const ppText = n => (n == null ? DASH : (n >= 0 ? '+' : '') + n.toFixed(1) + ' pp')
const eList = arr => arr.filter(Boolean).join('\n')
const bullets = arr => arr.filter(Boolean).map(s => '\u2022 ' + s).join('\n')
const arrowOf = mv => (Math.abs(mv) < 0.05 ? '\u2013 flat' : (mv >= 0 ? UP : DOWN) + abs1(mv))
const chip = (mv, wasLabel) => (mv == null ? 'no comparable day' : arrowOf(mv) + (wasLabel ? ' vs ' + wasLabel : ''))

export function buildV7(ctx) {
  const msgs = []
  const inr = ctx.fmtINR || (v => String(v))
  const cnt = ctx.fmtN || (v => Number(v || 0).toLocaleString('en-IN'))
  const test = ctx.isTest ? ':test_tube: test send' : null
  const d = ctx.day

  if (!d || !d.now) {
    msgs.push({
      key: 'yesterday', label: 'Yesterday',
      text: eList([test, '*:warning: No complete day in this selection*',
        'V7 reads the last finished day. Widen the date filter so at least one complete day falls inside it.']),
    })
    return msgs
  }

  // The day series, oriented by matching one end against the day the report already
  // names rather than trusting the array direction.
  const series = (() => {
    const rows = ((ctx.dow && ctx.dow.rows) || []).map(r => (r && r.g) || null).filter(Boolean)
    if (rows.length < 2) return rows
    const t = numOf(d.now.spend)
    if (t == null) return rows
    const near = (a, b) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.001)
    if (near(numOf(rows[0].spend), t)) return rows
    if (near(numOf(rows[rows.length - 1].spend), t)) return rows.slice().reverse()
    return rows
  })()
  const trail = series.slice(1, 8)
  const meanOf = key => {
    const v = trail.map(r => numOf(r[key])).filter(n => n != null && n > 0)
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
  }

  const g = d.now
  const p = d.prev || {}
  const rateOf = (a, b) => (b > 0 ? (a / b) * 100 : null)
  const fld = (emoji, label, value, now, was, wasLabel) =>
    '*' + emoji + ' ' + label + '*\n' + value + '\n'
    + chip(pctOf(numOf(now), numOf(was)), was == null ? null : wasLabel)

  const qlRateNow = rateOf(numOf(g.totalQL), numOf(g.leads))
  const qlRateWas = rateOf(numOf(p.totalQL), numOf(p.leads))

  const basis = 'Yesterday is ' + d.label + (d.prevLabel ? ', read against ' + d.prevLabel : '')
    + (trail.length ? ' and against the mean of the ' + trail.length + ' complete days before it' : '')
    + '. The current day is always excluded.'

  // 1 -- yesterday, and the verdict on it.
  const m1 = {
    key: 'yesterday', label: 'Yesterday',
    text: eList([test, '*:sunrise: Yesterday ' + DASH + ' ' + d.label + '*', ctx.filterLine]),
    fields: [
      fld(':moneybag:', 'SPEND', inr(g.spend), g.spend, p.spend, inr(p.spend)),
      fld(':bar_chart:', 'LEADS', cnt(g.leads), g.leads, p.leads, cnt(p.leads)),
      fld(':dart:', 'TOTAL QLs', cnt(g.totalQL), g.totalQL, p.totalQL, cnt(p.totalQL)),
      fld(':pushpin:', 'CPL', inr(g.cpl), g.cpl, p.cpl, inr(p.cpl)),
      fld(':zap:', 'CPQL', inr(g.cpql), g.cpql, p.cpql, inr(p.cpql)),
      '*:chart_with_upwards_trend: LEAD ' + ARROW + ' QL*\n' + pctText(qlRateNow) + '\n'
        + (qlRateNow == null || qlRateWas == null ? 'no comparable day'
          : (Math.abs(qlRateNow - qlRateWas) < 0.05 ? '\u2013 flat' : ppText(qlRateNow - qlRateWas))
            + ' vs ' + pctText(qlRateWas)),
    ],
    context: basis,
  }

  const spendY = numOf(g.spend) || 0
  const qlY = numOf(g.totalQL)
  const cpqlY = numOf(g.cpql)
  const cpqlAvg = meanOf('cpql')
  const qlAvg = meanOf('totalQL')
  const headroom = DAY_BUDGET - spendY
  const cheaper = cpqlAvg != null && cpqlY != null && cpqlY <= cpqlAvg
  const busier = qlAvg != null && qlY != null && qlY >= qlAvg

  const verdict = []
  verdict.push((headroom >= 0 ? ':white_check_mark: ' : ':warning: ')
    + 'Spend ' + inr(spendY) + ' against the ' + inr(DAY_BUDGET) + ' daily budget ' + DASH + ' '
    + (headroom >= 0 ? inr(headroom) + ' left unspent.' : inr(-headroom) + ' over.'))

  if (headroom >= 0 && cheaper && busier) {
    verdict.push(':white_check_mark: *Bonus day.* Under budget, CPQL at or below the trailing '
      + trail.length + '-day average, and QLs at or above it.')
  } else if (cpqlAvg != null && qlAvg != null) {
    const missed = []
    if (headroom < 0) missed.push('spend went past the ' + inr(DAY_BUDGET) + ' cap')
    if (!cheaper) missed.push('CPQL ' + inr(cpqlY) + ' sat above the ' + inr(cpqlAvg) + ' trailing average')
    if (!busier) missed.push('QLs ' + cnt(qlY) + ' came in under the ' + cnt(Math.round(qlAvg)) + ' trailing average')
    verdict.push(':warning: Not a bonus day ' + DASH + ' ' + missed.join(', and ') + '.')
  }
  if (qlY != null) {
    verdict.push((qlY >= QL_TARGET_LO ? ':white_check_mark: ' : ':warning: ')
      + cnt(qlY) + ' QLs against the ' + QL_TARGET_LO + '\u2013' + QL_TARGET_HI + ' daily target'
      + (qlY >= QL_TARGET_LO ? '.' : ' ' + DASH + ' short by ' + cnt(QL_TARGET_LO - qlY) + '.'))
  }

  const week = []
  const oneW = (key, label, fmt) => {
    const now = numOf(g[key]); const av = meanOf(key)
    if (now == null || !(now > 0) || av == null) return
    const mv = pctOf(now, av)
    if (mv == null) return
    week.push(label + ' ' + fmt(now) + DOT
      + (Math.abs(mv) < 2 ? 'in line with' : arrowOf(mv) + ' on') + ' a ' + fmt(av) + ' average')
  }
  oneW('spend', 'Spend', v => inr(v))
  oneW('totalQL', 'QLs', v => cnt(Math.round(v)))
  oneW('cpql', 'CPQL', v => inr(v))

  m1.after = eList([
    verdict.length ? '*:zap: The verdict on yesterday*\n' + bullets(verdict) : null,
    week.length ? '\n*:chart_with_upwards_trend: Against its own last ' + trail.length + ' days*\n' + bullets(week) : null,
  ])
  msgs.push(m1)

  // 2 -- which channel actually moved yesterday. The pick is scored on materiality:
  // money at stake multiplied by the size of the move, not a fixed order, so the lines
  // change as the data changes instead of always naming the same channel.
  const srcRows = (d.rows || []).filter(r => r && r.g && !r.strong)
  const bySpend = srcRows.slice().sort((a, b) => (numOf(b.g.spend) || 0) - (numOf(a.g.spend) || 0))

  const m2 = {
    key: 'movers', label: 'What moved yesterday',
    text: eList(['*:mag: What moved yesterday ' + DASH + ' by channel*', ctx.filterLine]),
    context: basis,
  }
  if (bySpend.length) {
    m2.table = {
      columns: ['Source', 'Spend', 'Leads', 'QLs', 'CPQL'],
      rows: bySpend.slice(0, 8).map(r => [String(r.label || r.g.label || ''),
        inr(r.g.spend), cnt(r.g.leads), cnt(r.g.totalQL), inr(r.g.cpql)]),
    }
  }

  const scored = srcRows.map(r => {
    const c = r.g; const pv = c.prev || {}
    const mSp = pctOf(numOf(c.spend), numOf(pv.spend))
    const mQl = pctOf(numOf(c.totalQL), numOf(pv.totalQL))
    const mCq = pctOf(numOf(c.cpql), numOf(pv.cpql))
    const biggest = [mSp, mQl, mCq].filter(x => x != null)
      .reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0)
    return { label: String(r.label || c.label || ''), c, mSp, mQl, mCq,
      score: (numOf(c.spend) || 0) * Math.abs(biggest) }
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 3)

  const moves = scored.map(x => {
    const bits = []
    if (x.mSp != null && Math.abs(x.mSp) >= 3) bits.push('spend ' + inr(x.c.spend) + ' ' + arrowOf(x.mSp))
    if (x.mQl != null && Math.abs(x.mQl) >= 3) bits.push('QLs ' + cnt(x.c.totalQL) + ' ' + arrowOf(x.mQl))
    if (x.mCq != null && Math.abs(x.mCq) >= 3) bits.push('CPQL ' + inr(x.c.cpql) + ' ' + arrowOf(x.mCq))
    if (!bits.length) return null
    let call = ''
    if (x.mCq != null && x.mCq >= 15 && x.mSp != null && x.mSp > 0) call = ' Hold the increase until the price comes back.'
    else if (x.mCq != null && x.mCq <= -10 && x.mQl != null && x.mQl > 0) call = ' Cheapest it has been this week ' + DASH + ' room to push.'
    return '*' + x.label + '* ' + DASH + ' ' + bits.join(DOT) + '.' + call
  }).filter(Boolean)

  m2.after = moves.length
    ? '*:bulb: The movers, biggest money first*\n' + bullets(moves)
    : '*:bulb: The movers*\nNothing moved more than 3% on spend, QLs or CPQL against '
      + (d.prevLabel || 'the day before') + '. A flat day, reported as one.'
  msgs.push(m2)

  // 3 -- the month, demoted to context. Same table V4 leads with, minus applications and
  // CPA, and only a couple of findings so it cannot turn back into the main event.
  const KILL = ['applications', 'apps', 'cpa']
  const dropped = (() => {
    const t = ctx.table
    if (!t || !t.columns) return null
    const bad = t.columns
      .map((c, i) => (KILL.indexOf(String(c).trim().toLowerCase()) >= 0 ? i : -1))
      .filter(i => i >= 0)
    if (!bad.length) return t
    const keep = arr => arr.filter((_, i) => bad.indexOf(i) < 0)
    return { ...t, columns: keep(t.columns), rows: (t.rows || []).map(keep) }
  })()

  const dm = ctx.d || {}
  const pv = ctx.prev || {}
  const mtdFld = (emoji, label, value, key, wasLabel) =>
    '*' + emoji + ' ' + label + '*\n' + value + '\n'
    + (dm[key] == null ? 'no comparable period' : arrowOf(dm[key]) + (wasLabel ? ' vs ' + wasLabel : ''))

  const m3 = {
    key: 'month', label: 'Month to date',
    text: eList(['*:calendar: Where the month stands*', ctx.filterLine]),
    fields: [
      mtdFld(':moneybag:', 'SPEND', inr(ctx.num('spend')), 'spend', ctx.hasPrev ? inr(pv.spend) : null),
      mtdFld(':bar_chart:', 'LEADS', cnt(ctx.num('leads')), 'leads', ctx.hasPrev ? cnt(pv.leads) : null),
      mtdFld(':dart:', 'TOTAL QLs', cnt(ctx.num('totalQL')), 'totalQL', ctx.hasPrev ? cnt(pv.totalQL) : null),
      mtdFld(':zap:', 'CPQL', inr(ctx.num('cpql')), 'cpql', ctx.hasPrev ? inr(pv.cpql) : null),
    ],
    table: dropped, attach: true,
    context: 'Month to date against ' + (ctx.prevLabel || 'the previous period')
      + '. Applications and CPA are not carried anywhere in V7. Every column is in the attached CSV.',
  }

  const monthNotes = []
  const pace = ctx.pace
  if (pace && pace.daysDone > 0 && pace.daysInMonth > 0) {
    const perDay = (numOf(ctx.num('spend')) || 0) / pace.daysDone
    monthNotes.push('Running at ' + inr(perDay) + ' a day across ' + pace.daysDone + ' of '
      + pace.daysInMonth + ' days ' + DASH + ' ' + inr(perDay * pace.daysInMonth) + ' by '
      + pace.monthEndLabel + ' if nothing changes, against a ' + inr(DAY_BUDGET * pace.daysInMonth) + ' ceiling.')
  }
  const chans = ((ctx.cmp && ctx.cmp.channels) || []).map(c => {
    const mCq = pctOf(numOf(c.cpql), numOf(c.prev && c.prev.cpql))
    return { c, mCq, score: (numOf(c.spend) || 0) * Math.abs(mCq == null ? 0 : mCq) }
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 2)
  chans.forEach(x => {
    monthNotes.push(String(x.c.label) + ' is carrying ' + inr(x.c.spend) + ' at ' + inr(x.c.cpql)
      + ' a QL, ' + arrowOf(x.mCq) + ' on the previous period.')
  })

  m3.after = eList([
    monthNotes.length ? '*:information_source: Month to date, for context only*\n' + bullets(monthNotes) : null,
    '\n_Corridor and ad detail is not in this report. The dashboard only builds those month to date, so they would read the same every morning. V4 carries them when you want the full picture._',
  ])
  msgs.push(m3)

  return msgs
}
