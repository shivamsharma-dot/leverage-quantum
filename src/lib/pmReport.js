// Slack PM report -- version registry + insight rules.
//
// Every version defined here is permanent. The Send to Slack panel inside Quantum
// lists them all with a plain-English description of what each one posts, so a
// layout used months ago can still be previewed and re-sent. Nothing about
// versioning lives in Slack itself -- Slack only ever receives the one report
// somebody presses Send on.
//
// The builders are pure functions over numbers the dashboard already computed, and
// every insight is a RULE over those numbers -- there is no generated prose in this
// file. If a line appears, a real figure put it there. That is what makes the output
// safe to put in front of a CEO.

const DOT = '   \u00b7   '
const BUL = '\u2022 '
const TO = '\u2192'
const DASH = '\u2014'

const abs1 = n => Math.abs(n).toFixed(1) + '%'
const pctText = n => n.toFixed(1) + '%'
const ppText = n => (n >= 0 ? '+' : '\u2212') + Math.abs(n).toFixed(1) + 'pp'
const shareOf = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0)
// Movement, always spelled with the arrow the KPI cards use.
export const mv = n => (n == null ? '' : (n >= 0 ? '\u25b2 ' : '\u25bc ') + abs1(n))

const kpiLine = pairs => pairs
  .filter(p => p && p.value != null && p.value !== '')
  .map(p => '*' + p.label + '*  ' + p.value)
  .join(DOT)

const list = arr => arr.filter(Boolean).map(s => BUL + s).join('\n')

// -- Insight rules -----------------------------------------------------------

// Both ends of the funnel at once. Cheap traffic paired with expensive outcomes is
// the single most decision-relevant sentence on the summary, so it leads.
function costDirection(ctx) {
  const { d, stat } = ctx
  if (d.cpl == null || d.cpa == null) return null
  const both = 'CPL ' + stat('cpl') + ' (' + mv(d.cpl) + ') and CPA ' + stat('cpa') + ' (' + mv(d.cpa) + ')'
  if (d.cpl < 0 && d.cpa > 0) return 'Traffic got cheaper, outcomes did not ' + DASH + ' CPL ' + stat('cpl') + ' (' + mv(d.cpl) + ') while CPA ' + stat('cpa') + ' (' + mv(d.cpa) + '). The extra volume is not turning into applications.'
  if (d.cpl > 0 && d.cpa < 0) return 'Traffic cost more but converted better ' + DASH + ' ' + both + '.'
  if (d.cpl <= 0 && d.cpa <= 0) return 'Both ends improved ' + DASH + ' ' + both + '.'
  return 'Cost rose at both ends ' + DASH + ' ' + both + '.'
}

// The weakest hand-off in the real path. With a comparable previous period this is
// the stage that fell hardest; without one it is simply the lowest rate.
function worstStage(ctx) {
  const chain = ctx.chain || []
  const withPrev = chain.filter(s => s.rate != null && s.prevRate != null)
  if (withPrev.length) {
    const s = withPrev.slice().sort((a, b) => (a.rate - a.prevRate) - (b.rate - b.prevRate))[0]
    if (s.rate < s.prevRate) return 'Biggest slip in the funnel: ' + s.from + ' ' + TO + ' ' + s.to + ' at ' + pctText(s.rate) + ', ' + ppText(s.rate - s.prevRate) + ' against last period.'
  }
  const any = chain.filter(s => s.rate != null)
  if (!any.length) return null
  const w = any.slice().sort((a, b) => a.rate - b.rate)[0]
  return 'Weakest hand-off: ' + w.from + ' ' + TO + ' ' + w.to + ' converts at ' + pctText(w.rate) + '.'
}

function spendVsOutcome(ctx) {
  const { d, stat } = ctx
  if (d.spend == null || d.deposits == null) return null
  return 'Spend ' + mv(d.spend) + ' to ' + stat('spend') + ' while deposits ' + mv(d.deposits) + ' to ' + stat('deposits') + '.'
}

function channelInsights(ctx) {
  const out = []
  const { channels, bands, minQL, fmtINR, fmtN } = ctx
  if (bands.paid && bands.total && bands.total.spend > 0) {
    out.push('Paid channels are ' + pctText(shareOf(bands.paid.spend, bands.total.spend)) + ' of spend and ' + pctText(shareOf(bands.paid.leads, bands.total.leads)) + ' of leads; non-paid added ' + fmtN(bands.nonPaid ? bands.nonPaid.leads : 0) + ' leads with no media cost.')
  }
  const ranked = (channels || []).filter(c => c.cpql != null && c.totalQL >= minQL)
  if (ranked.length >= 2) {
    const by = ranked.slice().sort((a, b) => a.cpql - b.cpql)
    const best = by[0], worst = by[by.length - 1]
    out.push('Cheapest QL: ' + best.label + ' at ' + fmtINR(best.cpql) + ' (' + fmtN(best.totalQL) + ' QLs). Most expensive: ' + worst.label + ' at ' + fmtINR(worst.cpql) + ' (' + fmtN(worst.totalQL) + ' QLs).')
  }
  const top = (channels || []).slice().sort((a, b) => b.leads - a.leads)[0]
  if (top && bands.total && bands.total.leads > 0) {
    const sh = shareOf(top.leads, bands.total.leads)
    if (sh >= 40) out.push(top.label + ' alone is ' + pctText(sh) + ' of all leads ' + DASH + ' the number depends on one channel holding up.')
  }
  return out
}

// Corridors ranked on CPQL. A corridor needs a real QL base to be ranked at all --
// otherwise one lucky QL on a tiny corridor tops the list and the ranking is noise.
// The unranked ones are counted out loud and still travel in the CSV.
function corridorRanking(ctx) {
  const all = ctx.corridors || []
  const eligible = all.filter(c => c.cpql != null && c.totalQL >= ctx.minQL)
  const by = eligible.slice().sort((a, b) => a.cpql - b.cpql)
  const single = by.length < 6
  return {
    best: single ? by : by.slice(0, 5),
    worst: single ? [] : by.slice(-5).reverse(),
    skipped: all.length - eligible.length,
    eligible: by.length,
    single,
  }
}

function corridorTable(ctx, cr) {
  const t = { columns: ['Corridor', 'Spend', 'Leads', 'Total QLs', 'CPQL', 'Apps'], rows: [], strongRows: [] }
  const push = (cells, strong) => { if (strong) t.strongRows.push(t.rows.length); t.rows.push(cells) }
  const line = c => [c.label, ctx.fmtINR(c.spend), ctx.fmtN(c.leads), ctx.fmtN(c.totalQL), c.cpql == null ? DASH : ctx.fmtINR(c.cpql), ctx.fmtN(c.apps)]
  // A band row carries the band's own totals. CPQL is re-derived from summed spend
  // over summed paid QLs -- averaging five per-corridor CPQLs would be a wrong number.
  const band = (name, list) => {
    const s = list.reduce((a, c) => ({
      spend: a.spend + (c.spend || 0), leads: a.leads + (c.leads || 0),
      totalQL: a.totalQL + (c.totalQL || 0), apps: a.apps + (c.apps || 0),
      paidQL: a.paidQL + (c.paidQL || 0),
    }), { spend:0, leads:0, totalQL:0, apps:0, paidQL:0 })
    push([name, ctx.fmtINR(s.spend), ctx.fmtN(s.leads), ctx.fmtN(s.totalQL),
      (s.spend > 0 && s.paidQL > 0) ? ctx.fmtINR(s.spend / s.paidQL) : DASH, ctx.fmtN(s.apps)], true)
  }
  if (cr.single) { cr.best.forEach(c => push(line(c), false)); return t }
  band('TOP 5 — CHEAPEST QL', cr.best)
  cr.best.forEach(c => push(line(c), false))
  band('BOTTOM 5 — DEAREST QL', cr.worst)
  cr.worst.forEach(c => push(line(c), false))
  return t
}

// Candidates for the honest read. `up` says which direction is the good one, so a
// falling CPL lands under what went right and a falling deposit count does not.
const MOVERS = [
  { key:'leads', label:'Leads', up:true },
  { key:'totalQL', label:'Total QLs', up:true },
  { key:'apps', label:'Applications', up:true },
  { key:'offers', label:'Offers', up:true },
  { key:'deposits', label:'Deposits', up:true },
  { key:'raus', label:'RAUs', up:true },
  { key:'cpl', label:'CPL', up:false },
  { key:'cpql', label:'CPQL', up:false },
  { key:'cpa', label:'CPA', up:false },
]
// Anything under half a percent is called flat rather than dressed up as a win.
function movers(ctx, wantGood) {
  return MOVERS
    .map(m => ({ m, v: ctx.d[m.key] }))
    .filter(({ m, v }) => v != null && Math.abs(v) >= 0.5 && ((m.up ? v > 0 : v < 0) === wantGood))
    .sort((a, b) => Math.abs(b.v) - Math.abs(a.v))
    .map(({ m, v }) => m.label + ' ' + mv(v) + ' to ' + ctx.stat(m.key))
}

// Actions, each one tied to the specific number that triggered it. No generic advice:
// if the rule did not fire, the line is not printed.
function fixes(ctx, cr) {
  const out = []
  const chain = ctx.chain || []
  const stage = to => chain.find(s => s.to === to)
  const qlToApp = stage('Apps')
  const offToDep = stage('Deposits')
  if (ctx.d.cpa != null && ctx.d.cpa > 0 && qlToApp && qlToApp.rate != null) {
    out.push('Applications are the bottleneck: ' + pctText(qlToApp.rate) + ' of QLs become one and CPA is now ' + ctx.stat('cpa') + '. Fix QL follow-up before adding budget.')
  }
  if (ctx.d.cpql != null && ctx.d.cpql > 0.5 && cr && !cr.single && cr.best.length && cr.worst.length) {
    out.push('CPQL is up ' + abs1(ctx.d.cpql) + '. Move budget out of ' + cr.worst[0].label + ' (' + ctx.fmtINR(cr.worst[0].cpql) + ' a QL) and into ' + cr.best[0].label + ' (' + ctx.fmtINR(cr.best[0].cpql) + ').')
  }
  if (offToDep && offToDep.rate != null && ctx.num('offers') > ctx.num('deposits')) {
    out.push('Only ' + pctText(offToDep.rate) + ' of offers convert to a deposit ' + DASH + ' ' + ctx.fmtN(ctx.num('offers') - ctx.num('deposits')) + ' offers are still sitting without one.')
  }
  const top = (ctx.channels || []).slice().sort((a, b) => b.leads - a.leads)[0]
  if (top && ctx.bands.total && shareOf(top.leads, ctx.bands.total.leads) >= 40) {
    out.push('Concentration risk: ' + top.label + ' carries ' + pctText(shareOf(top.leads, ctx.bands.total.leads)) + ' of leads. A second channel needs real volume before this one saturates.')
  }
  return out.slice(0, 4)
}

// The part that makes the rest believable: what the data cannot answer yet.
function caveats(ctx, cr) {
  const out = []
  if (!ctx.hasPrev) out.push('No comparable previous period is loaded, so nothing here shows period-on-period movement.')
  if (ctx.partialPeriod) out.push(ctx.periodLabel + ' is still running, so it is being compared against a completed period.')
  if (ctx.estimatedRaus > ctx.num('raus')) {
    out.push('RAUs lag the funnel: ' + ctx.stat('raus') + ' actual against ' + ctx.fmtN(Math.round(ctx.estimatedRaus)) + ' projected off ' + ctx.stat('apps') + ' applications. Part of that gap is timing, not loss.')
  }
  if (cr && cr.skipped > 0) out.push(cr.skipped + ' corridors had under ' + ctx.minQL + ' QLs and are not ranked ' + DASH + ' they are all in the attached CSV.')
  const unc = (ctx.corridors || []).find(c => /unclassified/i.test(c.label))
  if (unc && ctx.bands.total && shareOf(unc.leads, ctx.bands.total.leads) >= 5) {
    out.push(pctText(shareOf(unc.leads, ctx.bands.total.leads)) + ' of leads sit in Unclassified corridors. That is campaign naming, not performance.')
  }
  return out
}

// -- Message builders --------------------------------------------------------

// The four KPI lines, in the fixed order the report is read in: money and volume,
// then quality, then applications, then what actually landed.
function kpiBlock(ctx) {
  return [
    kpiLine([{ label:'Spend', value:ctx.stat('spend') }, { label:'Leads', value:ctx.stat('leads') }, { label:'CPL', value:ctx.stat('cpl') }]),
    kpiLine([{ label:'Total QLs', value:ctx.stat('totalQL') }, { label:'CPQL', value:ctx.stat('cpql') }]),
    kpiLine([{ label:'Apps', value:ctx.stat('apps') }, { label:'CPA', value:ctx.stat('cpa') }]),
    kpiLine([{ label:'Offers', value:ctx.stat('offers') }, { label:'Deposits', value:ctx.stat('deposits') }, { label:'RAUs', value:ctx.stat('raus') }]),
  ]
}

const testLine = ctx => (ctx.isTest ? ':test_tube: *Test post* -- sent to the test channel to check formatting.' : null)
const csvNote = ctx => '_' + ctx.rowCount + ' rows  \u00b7  every column is in the attached CSV_'
const title = ctx => 'Overall - PM Summary by ' + ctx.grpByLabel

function buildV3(ctx) {
  const msgs = []
  const cr = corridorRanking(ctx)

  const one = [testLine(ctx), '*:bar_chart: ' + title(ctx) + '*', ctx.filterLine, '', ...kpiBlock(ctx)]
  const summaryIns = [costDirection(ctx), worstStage(ctx), spendVsOutcome(ctx)].filter(Boolean)
  if (summaryIns.length) one.push('', '*What the numbers say*', list(summaryIns))
  msgs.push({ key:'summary', label:'PM summary', text: one.filter(l => l != null).join('\n') })

  const two = ['*:moneybag: Channel mix ' + DASH + ' Paid vs Non-Paid*', ctx.filterLine]
  const chanIns = channelInsights(ctx)
  if (chanIns.length) two.push('', list(chanIns))
  two.push('', csvNote(ctx))
  msgs.push({ key:'channels', label:'Channel table', text: two.join('\n'), table: ctx.table, attach: true })

  if (cr.eligible) {
    const rank = (c, i) => (i + 1) + '. ' + c.label + ' ' + DASH + ' ' + ctx.fmtINR(c.cpql) + '  (' + ctx.fmtN(c.totalQL) + ' QLs, ' + ctx.fmtINR(c.spend) + ' spend)'
    const three = ['*:earth_asia: Corridors ' + DASH + ' cheapest and dearest QL*']
    three.push('_Ranked on CPQL across corridors with at least ' + ctx.minQL + ' QLs' + (cr.skipped ? '; ' + cr.skipped + ' smaller ones are not ranked' : '') + '._')
    if (cr.single) three.push('', '*Ranked by CPQL*', cr.best.map(rank).join('\n'))
    else {
      three.push('', '*Top 5 ' + DASH + ' cheapest QL*', cr.best.map(rank).join('\n'))
      three.push('', '*Bottom 5 ' + DASH + ' most expensive QL*', cr.worst.map(rank).join('\n'))
    }
    msgs.push({ key:'corridors', label:'Corridors', text: three.join('\n'), table: corridorTable(ctx, cr) })
  }

  const four = ['*:compass: What worked, what broke, what to fix*', ctx.filterLine]
  const right = movers(ctx, true).slice(0, 3)
  const wrong = movers(ctx, false).slice(0, 3)
  if (right.length) four.push('', '*What we did right*', list(right))
  if (wrong.length) four.push('', '*What went wrong*', list(wrong))
  const fx = fixes(ctx, cr)
  if (fx.length) four.push('', '*What we can improve*', list(fx))
  const cv = caveats(ctx, cr)
  if (cv.length) four.push('', '*What we cannot tell yet*', list(cv))
  msgs.push({ key:'insights', label:'Insights', text: four.join('\n') })

  return msgs
}

function buildV2(ctx) {
  const lines = [testLine(ctx), '*:bar_chart: ' + title(ctx) + '*', ctx.filterLine, '', ...kpiBlock(ctx), '', csvNote(ctx)]
  return [{ key:'summary', label:'Summary + table', text: lines.filter(l => l != null).join('\n'), table: ctx.table, attach: true }]
}

function buildV1(ctx) {
  const lines = [testLine(ctx), '*:bar_chart: ' + title(ctx) + '*', ctx.filterLine, '', ...kpiBlock(ctx), '', csvNote(ctx)]
  return [{ key:'summary', label:'Summary + image', text: lines.filter(l => l != null).join('\n'), attach: true }]
}

// -- v4: aligned grids, native tables, native charts --------------------------
// v4 stops hand-spacing text into columns. Slack re-flows text on mobile, so any
// alignment built out of spaces falls apart on the device a CEO actually reads on.
// Every figure below therefore travels inside a structure Slack aligns itself: a
// two-column field grid, its own table block, or its own chart block.

const CR = 1e7
const LAKH = 1e5

// Spend reads as crores at exec scale. Under a lakh the exact rupee figure is still
// the clearer number, so it is left alone rather than rounded into meaninglessness.
export function money(n) {
  const v = Number(n)
  if (!isFinite(v)) return DASH
  const a = Math.abs(v)
  if (a >= CR) return '\u20b9' + (v / CR).toFixed(2) + ' Cr'
  if (a >= LAKH) return '\u20b9' + (v / LAKH).toFixed(2) + ' L'
  return '\u20b9' + Math.round(v).toLocaleString('en-IN')
}
const nfmt = n => Number(n || 0).toLocaleString('en-IN')
const pctOf = (now, was) => (was > 0 ? ((now - was) / was) * 100 : null)
const cap = (s, n) => String(s == null ? '' : s).slice(0, n)

// A movement chip always carries the figure it moved FROM. A percentage on its own
// is not something anybody downstream can check.
const chip = (d, was) => {
  if (d == null) return 'no comparable period'
  const arrow = Math.abs(d) < 0.05 ? '\u2013 flat' : (d >= 0 ? '\u25b2 ' : '\u25bc ') + abs1(d)
  return was == null ? arrow : arrow + ' vs ' + was
}
const fld = (emoji, label, value, d, was) => '*' + emoji + ' ' + label + '*\n' + value + '\n' + chip(d, was)

// Printed on EVERY v4 message. The reader should never have to guess what a delta
// is measured against, and the answer must be identical on every message.
function deltaNote(ctx) {
  if (!ctx.hasPrev) return ':information_source: No comparable previous period is loaded, so no movement is shown.'
  return ':information_source: *How to read the \u25b2\u25bc* ' + DASH + ' *' + ctx.periodLabel + '* against *' + ctx.prevLabel
    + '*, the same-length period immediately before it, on the same Source and Corridor filters. CPL / CPQL / CPA divide spend by PAID leads / QLs / applications only, so free channels never make acquisition look cheaper than it was.'
}

// The KPI grid from the brief: two columns, ten cells, every one carrying its own
// previous-period figure. Slack lays fields out itself, so this stays aligned on
// desktop and on mobile.
function kpiFields(ctx) {
  const p = ctx.prev || {}
  const d = ctx.d
  const was = v => (ctx.hasPrev ? v : null)
  return [
    fld(':moneybag:', 'Spend', money(ctx.num('spend')), d.spend, was(money(p.spend))),
    fld(':chart_with_upwards_trend:', 'Leads', ctx.stat('leads'), d.leads, was(nfmt(p.leads))),
    fld(':dart:', 'Total QLs', ctx.stat('totalQL'), d.totalQL, was(nfmt(p.totalQL))),
    fld(':zap:', 'CPL', ctx.stat('cpl'), d.cpl, was(ctx.fmtINR(p.cpl))),
    fld(':zap:', 'CPQL', ctx.stat('cpql'), d.cpql, was(ctx.fmtINR(p.cpql))),
    fld(':memo:', 'Applications', ctx.stat('apps'), d.apps, was(nfmt(p.apps))),
    fld(':zap:', 'CPA', ctx.stat('cpa'), d.cpa, was(ctx.fmtINR(p.cpa))),
    fld(':trophy:', 'Offers', ctx.stat('offers'), d.offers, was(nfmt(p.offers))),
    fld(':dollar:', 'Deposits', ctx.stat('deposits'), d.deposits, was(nfmt(p.deposits))),
    fld(':bar_chart:', 'RAUs', ctx.stat('raus'), d.raus, was(nfmt(p.raus))),
  ]
}

// -- Native chart blocks ------------------------------------------------------
// Slack renders these itself, so they stay sharp and readable on a phone where a
// screenshot of a table does not. Each one is plotted off exactly the numbers the
// text beside it quotes -- a chart here can never disagree with the table above it.
// Category labels cap at 20 characters and must be unique, which is what uniqCats
// guarantees before anything is sent.
const uniqCats = arr => {
  const seen = new Set()
  return arr.map((c, i) => {
    let v = cap(c, 20)
    if (seen.has(v)) v = cap(v, 17) + ' ' + (i + 1)
    seen.add(v)
    return v
  })
}
const seriesName = (a, b) => (b === a ? cap('prev ' + b, 20) : b)

function funnelChart(ctx) {
  const chain = (ctx.chain || []).filter(s => s.rate != null && s.prevRate != null)
  if (chain.length < 2) return null
  const cats = uniqCats(chain.map(s => s.from + TO + s.to))
  const now = cap(ctx.periodLabel, 20)
  const pts = key => chain.map((s, i) => ({ label: cats[i], value: Number(Number(s[key]).toFixed(1)) }))
  return {
    type: 'data_visualization',
    title: cap('Stage conversion %', 50),
    chart: {
      type: 'bar',
      series: [
        { name: now, data: pts('rate') },
        { name: seriesName(now, cap(ctx.prevLabel, 20)), data: pts('prevRate') },
      ],
      axis_config: { categories: cats, x_label: 'Funnel stage', y_label: 'Conversion %' },
    },
  }
}

function spendPie(ctx) {
  const segs = (ctx.channels || []).filter(c => c.spend > 0).sort((a, b) => b.spend - a.spend).slice(0, 12)
  if (segs.length < 2) return null
  const labels = uniqCats(segs.map(c => c.label))
  return {
    type: 'data_visualization',
    title: cap('Share of spend by channel', 50),
    chart: { type: 'pie', segments: segs.map((c, i) => ({ label: labels[i], value: Math.round(c.spend) })) },
  }
}

function cpqlChart(ctx, items, heading) {
  const rows = (items || []).filter(c => c.cpql != null && c.cpql > 0).slice(0, 20)
  if (rows.length < 2) return null
  const cats = uniqCats(rows.map(c => c.label))
  const now = cap(ctx.periodLabel, 20)
  const series = [{ name: now, data: rows.map((c, i) => ({ label: cats[i], value: Math.round(c.cpql) })) }]
  if (rows.filter(c => c.prev && c.prev.cpql != null).length >= 2) {
    series.push({
      name: seriesName(now, cap(ctx.prevLabel, 20)),
      data: rows.map((c, i) => ({ label: cats[i], value: Math.round(c.prev && c.prev.cpql != null ? c.prev.cpql : 0) })),
    })
  }
  return {
    type: 'data_visualization',
    title: cap(heading, 50),
    chart: { type: 'bar', series, axis_config: { categories: cats, y_label: 'CPQL (INR)' } },
  }
}

// -- Ranking on CPQL ----------------------------------------------------------
// One rule, used for corridors and for ads alike. A row needs a real QL base to be
// ranked at all -- otherwise one lucky QL on a tiny slice tops the list and the
// whole ranking is noise. Everything held back is counted out loud in the message.
function rankByCpql(items, minQL) {
  const all = items || []
  const eligible = all.filter(c => c.cpql != null && c.cpql > 0 && c.totalQL >= minQL)
  const by = eligible.slice().sort((a, b) => a.cpql - b.cpql)
  const single = by.length < 11
  return {
    best: single ? by : by.slice(0, 5),
    worst: single ? [] : by.slice(-5).reverse(),
    skipped: all.length - eligible.length,
    eligible: by.length,
    single,
  }
}

function bandTotals(rows) {
  return (rows || []).reduce((a, c) => ({
    spend: a.spend + (c.spend || 0), leads: a.leads + (c.leads || 0),
    totalQL: a.totalQL + (c.totalQL || 0), apps: a.apps + (c.apps || 0),
    paidQL: a.paidQL + (c.paidQL || 0),
  }), { spend:0, leads:0, totalQL:0, apps:0, paidQL:0 })
}

// The banded ranking table. A band row carries the band's OWN totals, and its CPQL
// is re-derived from summed spend over summed paid QLs -- averaging five per-row
// CPQLs would be a different, and wrong, number.
function cpqlTable(ctx, r, firstCol, wrapFirst) {
  const t = { columns:[firstCol, 'Spend', 'Leads', 'QLs', 'CPQL', 'CPQL vs last'], rows:[], strongRows:[], wrapFirst: !!wrapFirst }
  const push = (cells, strong) => { if (strong) t.strongRows.push(t.rows.length); t.rows.push(cells) }
  const vs = c => {
    if (!c.prev || c.prev.cpql == null || c.cpql == null) return 'new'
    const d = pctOf(c.cpql, c.prev.cpql)
    if (d == null) return DASH
    return Math.abs(d) < 0.05 ? 'flat' : (d >= 0 ? '\u25b2 ' : '\u25bc ') + abs1(d)
  }
  const line = c => [c.label, money(c.spend), nfmt(c.leads), nfmt(c.totalQL), ctx.fmtINR(c.cpql), vs(c)]
  const band = (name, rows) => {
    const s = bandTotals(rows)
    push([name, money(s.spend), nfmt(s.leads), nfmt(s.totalQL),
      (s.spend > 0 && s.paidQL > 0) ? ctx.fmtINR(s.spend / s.paidQL) : DASH, DASH], true)
  }
  if (r.single) {
    band('RANKED ON CPQL ' + DASH + ' CHEAPEST FIRST', r.best)
    r.best.forEach(c => push(line(c), false))
    return t
  }
  band('TOP 5 ' + DASH + ' CHEAPEST QL', r.best)
  r.best.forEach(c => push(line(c), false))
  band('BOTTOM 5 ' + DASH + ' DEAREST QL', r.worst)
  r.worst.forEach(c => push(line(c), false))
  return t
}

// What actually moved, channel by channel, on the three channels carrying the money.
// Volume and cost together: one without the other is how a channel that got cheaper
// by collapsing gets mistaken for a channel that got better.
function channelMovement(ctx, channels) {
  const out = []
  const top = (channels || []).filter(c => c.spend > 0).sort((a, b) => b.spend - a.spend).slice(0, 3)
  top.forEach(c => {
    if (!c.prev) { out.push(c.label + ': ' + money(c.spend) + ' spend, ' + nfmt(c.totalQL) + ' QLs. No comparable previous period.'); return }
    const dq = pctOf(c.totalQL, c.prev.totalQL)
    const dc = (c.cpql != null && c.prev.cpql != null) ? pctOf(c.cpql, c.prev.cpql) : null
    const parts = [c.label + ': ' + money(c.spend) + ' spend, ' + nfmt(c.totalQL) + ' QLs (' + chip(dq, nfmt(c.prev.totalQL)) + ')']
    if (dc != null) parts.push('CPQL ' + ctx.fmtINR(c.cpql) + ' (' + chip(dc, ctx.fmtINR(c.prev.cpql)) + ')')
    out.push(parts.join(', '))
  })
  return out
}

// -- Ad themes ----------------------------------------------------------------
// Frequency counting over the campaign names themselves, nothing more. A theme is
// only printed when a token clearly separates the cheap five from the dear five, so
// every line refers to something the reader can see in the table right above it.
const AD_STOP = new Set(['pmx', 'ads', 'ad', 'leadgen', 'lead', 'gen', 'all', 'test', 'new', 'adset', 'the', 'and', 'for'])
const tokensOf = name => Array.from(new Set(String(name).toLowerCase().split(/[^a-z0-9]+/)
  .filter(t => t.length >= 3 && !/^\d+$/.test(t) && !AD_STOP.has(t))))
const tally = rows => {
  const m = new Map()
  ;(rows || []).forEach(r => tokensOf(r.label).forEach(t => m.set(t, (m.get(t) || 0) + 1)))
  return m
}

function adThemes(ctx, r) {
  if (r.single || !r.best.length || !r.worst.length) return []
  const out = []
  const tc = tally(r.best), bc = tally(r.worst)
  const pick = (mine, theirs, mineWord, theirWord) => [...mine.entries()]
    .filter(([t, n]) => n >= 3 && (theirs.get(t) || 0) <= 1)
    .sort((a, b) => b[1] - a[1]).slice(0, 2)
    .map(([t, n]) => '"' + t + '" appears in ' + n + ' of the 5 ' + mineWord + ' ads and ' + (theirs.get(t) || 0) + ' of the 5 ' + theirWord + '.')
  out.push(...pick(tc, bc, 'cheapest', 'dearest'))
  out.push(...pick(bc, tc, 'dearest', 'cheapest'))
  const topCorridor = rows => {
    const m = new Map()
    ;(rows || []).forEach(c => { if (c.corridor) m.set(c.corridor, (m.get(c.corridor) || 0) + 1) })
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0]
  }
  const cb = topCorridor(r.best), cw = topCorridor(r.worst)
  if (cb && cb[1] >= 3) out.push(cb[1] + ' of the 5 cheapest ads run on ' + cb[0] + '.')
  if (cw && cw[1] >= 3) out.push(cw[1] + ' of the 5 dearest ads run on ' + cw[0] + '.')
  const sb = bandTotals(r.best), sw = bandTotals(r.worst)
  if (sw.spend > 0 && sb.spend > 0) {
    out.push('The 5 dearest ads took ' + money(sw.spend) + ' for ' + nfmt(sw.totalQL) + ' QLs; the 5 cheapest took ' + money(sb.spend) + ' for ' + nfmt(sb.totalQL) + '.')
  }
  return out.slice(0, 5)
}

// movers(), but every line carries the figure it moved from, so nothing in the
// honest read is a percentage the reader has to take on trust.
function moversWithBase(ctx, wantGood) {
  const p = ctx.prev || {}
  const base = {
    leads: nfmt(p.leads), totalQL: nfmt(p.totalQL), apps: nfmt(p.apps), offers: nfmt(p.offers),
    deposits: nfmt(p.deposits), raus: nfmt(p.raus),
    cpl: ctx.fmtINR(p.cpl), cpql: ctx.fmtINR(p.cpql), cpa: ctx.fmtINR(p.cpa),
  }
  return MOVERS
    .map(m => ({ m, v: ctx.d[m.key] }))
    .filter(({ m, v }) => v != null && Math.abs(v) >= 0.5 && ((m.up ? v > 0 : v < 0) === wantGood))
    .sort((a, b) => Math.abs(b.v) - Math.abs(a.v))
    .map(({ m, v }) => m.label + ' ' + mv(v) + ' to ' + ctx.stat(m.key) + (ctx.hasPrev ? ' (from ' + base[m.key] + ')' : ''))
}

function buildV4(ctx) {
  const msgs = []
  const note = deltaNote(ctx)
  const cmp = ctx.cmp || {}

  // 1 -- the executive summary: KPI grid, what the numbers say, funnel chart.
  const m1 = {
    key: 'summary', label: 'Executive summary',
    text: [testLine(ctx), '*:bar_chart: ' + title(ctx) + '*', ctx.filterLine].filter(Boolean).join('\n'),
    fields: kpiFields(ctx), context: note,
  }
  const ins1 = [costDirection(ctx), worstStage(ctx), spendVsOutcome(ctx)].filter(Boolean)
  if (ins1.length) m1.after = '*What the numbers say*\n' + list(ins1)
  const fc = funnelChart(ctx)
  if (fc) m1.chart = fc
  msgs.push(m1)

  // 2 -- where the money went, as the dashboard's own table plus the spend split.
  const m2 = {
    key: 'channels', label: 'Channel mix',
    text: ['*:moneybag: Channel mix ' + DASH + ' Paid vs Non-Paid*', ctx.filterLine].join('\n'),
    table: ctx.table, attach: true, context: note,
  }
  const ins2 = channelInsights(ctx).concat(channelMovement(ctx, cmp.channels))
  m2.after = (ins2.length ? '*What changed*\n' + list(ins2) + '\n\n' : '') + csvNote(ctx)
  const pie = spendPie(ctx)
  if (pie) m2.chart = pie
  msgs.push(m2)

  // 3 -- corridors, restricted to the two channels whose corridor tagging is real.
  // Table and chart only: the brief asked for the written ranking to come out.
  const cr = rankByCpql(cmp.corridors, ctx.minQL)
  const scope = cmp.corridorScope || 'Paid'
  if (cr.eligible) {
    msgs.push({
      key: 'corridors', label: 'Corridors (' + scope + ')',
      text: [
        '*:earth_asia: Corridors ' + DASH + (cr.single ? ' ranked on CPQL*' : ' cheapest and dearest QL*'),
        '_' + scope + ' campaigns only \u00b7 ranked on CPQL \u00b7 a corridor needs at least ' + ctx.minQL + ' QLs to be ranked'
          + (cr.skipped ? ' (' + nfmt(cr.skipped) + ' smaller corridors are not ranked)' : '') + '_',
      ].join('\n'),
      table: cpqlTable(ctx, cr, 'Corridor', false),
      chart: cpqlChart(ctx, cr.best.concat(cr.worst), 'CPQL by corridor'),
      context: note,
    })
  }

  // 4 -- the ads themselves, with the themes their names have in common.
  const ar = rankByCpql(cmp.ads, ctx.minQL)
  if (ar.eligible) {
    const m4 = {
      key: 'ads', label: 'Ads',
      text: [
        '*:rocket: Ads ' + DASH + (ar.single ? ' ranked on CPQL*' : ' best and worst 5 on CPQL*'),
        '_Ranked on CPQL \u00b7 an ad needs at least ' + ctx.minQL + ' QLs to be ranked'
          + (ar.skipped ? ' (' + nfmt(ar.skipped) + ' smaller ads are not ranked)' : '') + '_',
      ].join('\n'),
      table: cpqlTable(ctx, ar, 'Ad', true),
      context: note,
    }
    const th = adThemes(ctx, ar)
    if (th.length) m4.after = '*Common themes*\n' + list(th)
    msgs.push(m4)
  }

  // 5 -- the honest read. No "what we cannot tell yet" section in v4.
  const m5 = {
    key: 'insights', label: 'What worked, what broke',
    text: '*:compass: What worked, what broke, what to fix*\n' + ctx.filterLine,
    context: note,
  }
  const parts = []
  const right = moversWithBase(ctx, true).slice(0, 3)
  const wrong = moversWithBase(ctx, false).slice(0, 3)
  if (right.length) parts.push('*What we did right*\n' + list(right))
  if (wrong.length) parts.push('*What went wrong*\n' + list(wrong))
  const fx = fixes(ctx, cr)
  if (fx.length) parts.push('*What we can improve*\n' + list(fx))
  if (parts.length) m5.after = parts.join('\n\n')
  msgs.push(m5)

  return msgs
}

// -- The registry ------------------------------------------------------------
// Append new versions to the TOP. Never delete or edit an old one: the panel is the
// only history there is, and an entry that changes silently is worse than no entry.
export const REPORT_VERSIONS = [
  {
    id: 'v4',
    name: 'Exec report ' + DASH + ' 5 messages, charts',
    tagline: 'Aligned KPI grid, native charts, Facebook + Google corridors, ad winners and losers.',
    recommended: true,
    what: [
      'Message 1 ' + DASH + ' executive summary as a two-column KPI grid: every figure carries the number it moved from, spend in crores, plus a stage-conversion chart',
      'Message 2 ' + DASH + ' Paid vs Non-Paid channel table, a share-of-spend pie, and what moved on the three channels carrying the money',
      'Message 3 ' + DASH + ' corridors on Facebook + Google campaigns only, as a native table and a CPQL chart. No written ranking',
      'Message 4 ' + DASH + ' the 5 cheapest and 5 dearest ads on CPQL, with the themes their names have in common',
      'Message 5 ' + DASH + ' what we did right, what went wrong, what we can improve',
      'Every message states in a footer exactly how its deltas were calculated',
      'Table image and the all-columns CSV land in the thread of message 2',
    ],
    build: buildV4,
  },
  {
    id: 'v3',
    name: 'Exec report ' + DASH + ' 4 messages',
    tagline: 'Summary, channel mix, corridors, then the honest read.',
    what: [
      'Message 1 ' + DASH + ' PM summary: spend/leads/CPL, QLs/CPQL, apps/CPA, offers/deposits/RAUs, plus up to three computed insights',
      'Message 2 ' + DASH + ' Paid vs Non-Paid channel table as a native Slack table, with spend share, best/worst CPQL and concentration',
      'Message 3 ' + DASH + ' top 5 and bottom 5 corridors by CPQL, written out and repeated as a table',
      'Message 4 ' + DASH + ' what we did right, what went wrong, what to improve, what we cannot tell yet',
      'Table image and the all-columns CSV land in the thread of message 2',
    ],
    build: buildV3,
  },
  {
    id: 'v2',
    name: 'Single message ' + DASH + ' summary + table',
    tagline: 'The four KPI lines and the native table, nothing else.',
    what: [
      'One message: title, filter line, the four KPI lines',
      'Paid vs Non-Paid native Slack table underneath',
      'Table image and the all-columns CSV in the thread',
      'No insights, no corridor ranking',
    ],
    build: buildV2,
  },
  {
    id: 'v1',
    name: 'Single message ' + DASH + ' image + CSV',
    tagline: 'The original: a picture of the table and the CSV.',
    what: [
      'One message: title, filter line, the four KPI lines',
      'Table image and the all-columns CSV attached to it',
      'No native table, no insights',
    ],
    build: buildV1,
  },
]

export const DEFAULT_VERSION_ID = 'v4'
export const CORRIDOR_MIN_QL = 25

export function getVersion(id) {
  return REPORT_VERSIONS.find(v => v.id === id) || REPORT_VERSIONS[0]
}

// Slack section text caps at 3000 characters. Trimming here (rather than letting the
// API reject the post) keeps a send from failing on an unusually long insight list.
export function buildReportMessages(versionId, ctx) {
  const trim = t => (typeof t === 'string' && t.length > 2900 ? t.slice(0, 2897) + '...' : t)
  return getVersion(versionId).build(ctx).map(m => ({ ...m, text: trim(m.text), after: trim(m.after) }))
}
