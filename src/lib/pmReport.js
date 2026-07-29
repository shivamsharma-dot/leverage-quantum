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
//
// v4 also draws a hard line at the application. Offers, deposits and RAUs move for
// reasons a media buy cannot be held to, and month on month they are not comparable
// at all, so v4 reports on what marketing owns: spend, leads, QLs, and the two
// prices we actually set.

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

// A rate moves in percentage points. Saying a 7.0% QL rate "fell 17%" because it came
// off 8.4% is arithmetically true and completely misleading, so rates get their own
// chip and their own units.
const fldPP = (emoji, label, now, was) => '*' + emoji + ' ' + label + '*\n'
  + (now == null ? DASH : pctText(now)) + '\n'
  + (now == null || was == null ? 'no comparable period'
    : (Math.abs(now - was) < 0.05 ? '\u2013 flat' : ppText(now - was)) + ' vs ' + pctText(was))

// Emoji-led lines instead of bullets. On a phone the symbol is what the eye lands on
// first, so it earns the job of being the bullet rather than sitting next to one.
const eList = arr => arr.filter(Boolean).join('\n')

// Printed on EVERY v4 message. The reader should never have to guess what a delta
// is measured against, and the answer must be identical on every message.
function deltaNote(ctx) {
  if (!ctx.hasPrev) return ':information_source: No comparable previous period is loaded, so no movement is shown.'
  return ':information_source: *How to read the \u25b2\u25bc* ' + DASH + ' *' + ctx.periodLabel + '* against *' + ctx.prevLabel
    + '*, the same-length period immediately before it, on the same Source and Corridor filters. CPL / CPQL / CPA divide spend by PAID leads / QLs / applications only, so free channels never make acquisition look cheaper than it was.'
}

// The KPI grid: two columns, eight cells, every one carrying its own previous-period
// figure. Deposits are out -- that is a sales outcome, and month on month it is not a
// like-for-like number. The Lead -> QL rate takes the slot, because it is the one
// figure that says whether the leads we bought were worth buying.
function kpiFields(ctx) {
  const p = ctx.prev || {}
  const d = ctx.d
  const was = v => (ctx.hasPrev ? v : null)
  const rate = (ql, l) => (l > 0 ? (ql / l) * 100 : null)
  const qlNow = rate(ctx.num('totalQL'), ctx.num('leads'))
  const qlWas = ctx.hasPrev ? rate(p.totalQL, p.leads) : null
  return [
    fld(':moneybag:', 'Spend', money(ctx.num('spend')), d.spend, was(money(p.spend))),
    fld(':chart_with_upwards_trend:', 'Leads', ctx.stat('leads'), d.leads, was(nfmt(p.leads))),
    fld(':dart:', 'Total QLs', ctx.stat('totalQL'), d.totalQL, was(nfmt(p.totalQL))),
    fld(':zap:', 'CPL', ctx.stat('cpl'), d.cpl, was(ctx.fmtINR(p.cpl))),
    fld(':zap:', 'CPQL', ctx.stat('cpql'), d.cpql, was(ctx.fmtINR(p.cpql))),
    fldPP(':mag:', 'Lead ' + TO + ' QL rate', qlNow, qlWas),
    fld(':memo:', 'Applications', ctx.stat('apps'), d.apps, was(nfmt(p.apps))),
    fld(':zap:', 'CPA', ctx.stat('cpa'), d.cpa, was(ctx.fmtINR(p.cpa))),
  ]
}

// -- Native chart blocks ------------------------------------------------------
// Slack renders these itself, so they stay sharp and readable on a phone where a
// screenshot of a table does not. Each one is plotted off exactly the numbers the
// text beside it quotes -- a chart here can never disagree with the table above it.
// The share-of-spend pie is deliberately gone: a share is one number per row, and a
// column inside the table the reader is already looking at says it without a second
// image to wait for.
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
    unit: 'inr',
    chart: { type: 'bar', series, axis_config: { categories: cats, y_label: 'CPQL (INR)' } },
  }
}

// -- Ranking on CPQL ----------------------------------------------------------
// One rule, used for corridors and for ads alike. A row needs a real QL base to be
// ranked at all -- otherwise one lucky QL on a tiny slice tops the list and the whole
// ranking is noise. Everything held back is counted out loud in the message.
function rankByCpql(items, minQL) {
  const all = items || []
  const eligible = all.filter(c => c.cpql != null && c.cpql > 0 && c.totalQL >= minQL)
  const by = eligible.slice().sort((a, b) => a.cpql - b.cpql)
  // Four ranked rows is enough to be worth splitting into a cheapest and a dearest
  // band. Below that a DEAREST band would be one row restating the row above it. The
  // split sits at the midpoint and is capped at five a side, so the two bands never
  // overlap and no row is ever quoted twice.
  const single = by.length < 4
  const half = Math.min(5, Math.ceil(by.length / 2))
  return {
    best: single ? by : by.slice(0, half),
    worst: single ? [] : by.slice(half).reverse().slice(0, 5),
    unranked: all.filter(c => !(c.cpql != null && c.cpql > 0 && c.totalQL >= minQL)),
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

// The banded ranking table. A band row carries the band's OWN totals, and its CPQL is
// re-derived from summed spend over summed paid QLs -- averaging the per-row CPQLs
// would be a different, and wrong, number.
function cpqlTable(ctx, r, firstCol, wrapFirst) {
  const t = { columns:[firstCol, 'Spend', 'Leads', 'QLs', 'CPQL', 'CPQL vs last'], rows:[], strongRows:[], wrapFirst: !!wrapFirst }
  const push = (cells, strong) => { if (strong) t.strongRows.push(t.rows.length); t.rows.push(cells) }
  const vs = c => {
    if (!c.prev || c.prev.cpql == null || c.cpql == null) return 'new'
    const was = ctx.fmtINR(c.prev.cpql)
    const d = pctOf(c.cpql, c.prev.cpql)
    if (d == null) return was
    const move = Math.abs(d) < 0.05 ? 'flat' : (d >= 0 ? '\u25b2 ' : '\u25bc ') + abs1(d)
    return move + ' \u00b7 ' + was
  }
  const line = c => [c.label, money(c.spend), nfmt(c.leads), nfmt(c.totalQL), ctx.fmtINR(c.cpql), vs(c)]
  const band = (name, rows) => {
    const s = bandTotals(rows)
    push([name, money(s.spend), nfmt(s.leads), nfmt(s.totalQL),
      (s.spend > 0 && s.paidQL > 0) ? ctx.fmtINR(s.spend / s.paidQL) : DASH, DASH], true)
  }
  if (r.single) {
    band('ALL ' + r.best.length + ' RANKED ' + DASH + ' CHEAPEST FIRST, DEAREST LAST', r.best)
    r.best.forEach(c => push(line(c), false))
    return t
  }
  band('CHEAPEST ' + r.best.length + ' ' + DASH + ' LOWEST CPQL', r.best)
  r.best.forEach(c => push(line(c), false))
  band('DEAREST ' + r.worst.length + ' ' + DASH + ' HIGHEST CPQL', r.worst)
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
    const head = ':small_blue_diamond: *' + c.label + '*: ' + money(c.spend) + ' spend, ' + nfmt(c.totalQL) + ' QLs'
    if (!c.prev) { out.push(head + '. No comparable previous period.'); return }
    const dq = pctOf(c.totalQL, c.prev.totalQL)
    const dc = (c.cpql != null && c.prev.cpql != null) ? pctOf(c.cpql, c.prev.cpql) : null
    const parts = [head + ' (' + chip(dq, nfmt(c.prev.totalQL)) + ')']
    if (dc != null) parts.push('CPQL ' + ctx.fmtINR(c.cpql) + ' (' + chip(dc, ctx.fmtINR(c.prev.cpql)) + ')')
    out.push(parts.join(', '))
  })
  return out
}

// movers(), but every line carries the figure it moved from, so nothing in the honest
// read is a percentage the reader has to take on trust. v4 keeps only the metrics that
// are genuinely comparable month on month and that marketing is answerable for --
// Offers, Deposits, RAUs and CPA all sit at or past the application, where the number
// moves for reasons the media buy cannot be judged on.
const MOVERS_V4 = MOVERS.filter(m => ['leads', 'totalQL', 'apps', 'cpl', 'cpql'].indexOf(m.key) >= 0)

function moversWithBase(ctx, wantGood) {
  const p = ctx.prev || {}
  const base = {
    leads: nfmt(p.leads), totalQL: nfmt(p.totalQL), apps: nfmt(p.apps),
    cpl: ctx.fmtINR(p.cpl), cpql: ctx.fmtINR(p.cpql),
  }
  return MOVERS_V4
    .map(m => ({ m, v: ctx.d[m.key] }))
    .filter(({ m, v }) => v != null && Math.abs(v) >= 0.5 && ((m.up ? v > 0 : v < 0) === wantGood))
    .sort((a, b) => Math.abs(b.v) - Math.abs(a.v))
    .map(({ m, v }) => m.label + ' ' + mv(v) + ' to ' + ctx.stat(m.key) + (ctx.hasPrev ? ' (from ' + base[m.key] + ')' : ''))
}

// The two prices marketing actually sets, read against each other. The gap between
// them IS lead quality, which is why this leads the summary. CPA is deliberately
// absent: an application is a sales event with a counsellor in the middle of it.
function costDirectionV4(ctx) {
  const { d, stat } = ctx
  if (d.cpl == null || d.cpql == null) return null
  // Anything inside half a percent is flat. A price that moved 0.05% is not a story,
  // and calling it one is how a report starts sounding like it is trying to sell.
  const up = v => v > 0.5
  const dn = v => v < -0.5
  const both = 'CPL ' + stat('cpl') + ' (' + mv(d.cpl) + ') and CPQL ' + stat('cpql') + ' (' + mv(d.cpql) + ')'
  if (dn(d.cpl) && up(d.cpql)) return 'Traffic got cheaper, quality did not ' + DASH + ' ' + both + '. We bought more leads, not more QLs.'
  if (up(d.cpl) && dn(d.cpql)) return 'Leads cost more but qualified better ' + DASH + ' ' + both + '.'
  if (!up(d.cpl) && !up(d.cpql)) return 'Both prices held or improved ' + DASH + ' ' + both + '.'
  return 'Both prices moved against us ' + DASH + ' ' + both + '.'
}

// Money against the last stage marketing owns outright.
function spendVsQL(ctx) {
  const { d, stat } = ctx
  if (d.spend == null || d.totalQL == null) return null
  return 'Spend ' + mv(d.spend) + ' to ' + stat('spend') + ' while QLs ' + mv(d.totalQL) + ' to ' + stat('totalQL') + '.'
}

// Projected spend at the current run-rate. Straight arithmetic on days that really
// carry data -- spend so far, divided by days elapsed, times the days in the month.
// It is an extrapolation the reader can redo on a napkin, never a forecast, and it is
// only printed while the period is still running.
function spendPace(ctx) {
  const p = ctx.pace
  const spend = ctx.num('spend')
  if (!p || !(spend > 0) || !(p.daysDone > 0) || p.daysDone >= p.daysInMonth) return null
  const perDay = spend / p.daysDone
  return 'Projected spend to ' + p.monthEndLabel + ': ' + money(perDay * p.daysInMonth)
    + ' at the current run-rate ' + DASH + ' ' + money(spend) + ' is booked through day '
    + p.daysDone + ' of ' + p.daysInMonth + ', ' + money(perDay) + ' a day.'
}

// v4's read on the channel table, written as the decision each number implies rather
// than as an observation, and led by an emoji so the important line is findable at a
// glance on a phone. The paid-share line is gone -- paid is always 100% of the spend,
// so it told the reader nothing.
function channelRecs(ctx) {
  const out = []
  const { channels, bands, minQL, fmtINR, fmtN } = ctx
  const ranked = (channels || []).filter(c => c.cpql != null && c.totalQL >= minQL)
  if (ranked.length >= 2) {
    const by = ranked.slice().sort((a, b) => a.cpql - b.cpql)
    const best = by[0]
    const worst = by[by.length - 1]
    out.push(':white_check_mark: *Scale up ' + best.label + '* ' + DASH + ' ' + fmtINR(best.cpql)
      + ' a QL on ' + fmtN(best.totalQL) + ' QLs, the cheapest we buy.')
    out.push(':warning: *Scale down ' + worst.label + '* ' + DASH + ' ' + fmtINR(worst.cpql)
      + ' a QL on ' + fmtN(worst.totalQL) + ' QLs, the dearest.')
  }
  const top = (channels || []).slice().sort((a, b) => b.leads - a.leads)[0]
  if (top && bands && bands.total && bands.total.leads > 0) {
    const sh = shareOf(top.leads, bands.total.leads)
    const paidSh = (bands.paid && bands.paid.leads > 0) ? shareOf(top.leads, bands.paid.leads) : null
    // Concentration is a fact the numbers can state. Whether it was a choice is not,
    // so the reason is only attached where it is true -- on Meta, where the shift was
    // deliberate -- rather than left for the reader to mistake for an oversight.
    const meta = /facebook|meta|instagram/i.test(String(top.label))
    if (sh >= 40) {
      out.push(':pushpin: *' + top.label + ' alone is ' + pctText(sh) + ' of all leads*'
        + (paidSh != null ? ' (' + pctText(paidSh) + ' of paid leads)' : '') + ' ' + DASH + ' '
        + (meta
          ? 'this was intentional. We shifted Google spend to Meta while we improve Google\u2019s CPQL, so the number now depends on one channel holding up.'
          : 'the number depends on one channel holding up.'))
    }
  }
  return out
}

// The question a cut-off invites: how much money is sitting below it, and where.
// Printed under the corridor table so the reader never has to wonder whether a
// corridor is missing because it is small or because it is broken.
function unrankedSpend(ctx, r) {
  const u = (r.unranked || []).filter(c => c.spend > 0).sort((a, b) => b.spend - a.spend)
  if (!u.length) return null
  const total = u.reduce((a, c) => a + c.spend, 0)
  const top = u[0]
  return '_' + money(total) + ' of spend sits below the cut-off \u00b7 largest is ' + top.label
    + ' at ' + money(top.spend) + ' for ' + nfmt(top.totalQL) + ' QLs_'
}

// The media-level detail behind the headline movers. Every line is arithmetic on
// numbers printed elsewhere in the same report, and every one of them is something the
// media buy can actually be held to -- nothing past the application, where a
// counsellor, not a campaign, decides the outcome.
function marketingMisses(ctx, cr, ar) {
  const out = []
  const { d } = ctx
  const p = ctx.prev || {}
  const rate = (ql, l) => (l > 0 ? (ql / l) * 100 : null)
  const now = rate(ctx.num('totalQL'), ctx.num('leads'))
  const was = ctx.hasPrev ? rate(p.totalQL, p.leads) : null
  if (now != null && was != null && now < was - 0.05) {
    out.push('Lead ' + TO + ' QL rate slipped to ' + pctText(now) + ' (' + ppText(now - was) + ' vs ' + pctText(was) + ') ' + DASH + ' volume came in, quality did not.')
  }
  if (d.cpl != null && d.cpql != null && d.cpl < -0.5 && d.cpql > 0.5) {
    out.push('CPL fell ' + abs1(d.cpl) + ' but CPQL rose ' + abs1(d.cpql) + ' ' + DASH + ' the saving went into leads that never qualified.')
  }
  // The single worst CPQL riser among the channels carrying a real QL base.
  const chs = ((ctx.cmp && ctx.cmp.channels) || []).filter(c => c.cpql != null && c.prev && c.prev.cpql != null && c.totalQL >= ctx.minQL)
  const risers = chs.map(c => ({ c, dv: pctOf(c.cpql, c.prev.cpql) })).filter(x => x.dv != null && x.dv > 0.5).sort((a, b) => b.dv - a.dv)
  if (risers.length) {
    const w = risers[0]
    out.push('CPQL on ' + w.c.label + ' rose ' + abs1(w.dv) + ' to ' + ctx.fmtINR(w.c.cpql) + ' (from ' + ctx.fmtINR(w.c.prev.cpql) + ') on ' + money(w.c.spend) + ' of spend.')
  }
  // The same question one level down, on the corridors the money actually went to.
  const cors = ((cr && cr.best) || []).concat((cr && cr.worst) || []).filter(c => c.prev && c.prev.cpql != null && c.cpql != null)
  const cRise = cors.map(c => ({ c, dv: pctOf(c.cpql, c.prev.cpql) })).filter(x => x.dv != null && x.dv > 0.5).sort((a, b) => b.dv - a.dv)
  if (cRise.length) {
    const w = cRise[0]
    out.push('Worst corridor move: ' + w.c.label + ' CPQL up ' + abs1(w.dv) + ' to ' + ctx.fmtINR(w.c.cpql) + ' (from ' + ctx.fmtINR(w.c.prev.cpql) + ').')
  }
  // Money that never reached a rankable corridor is money we cannot yet defend.
  if (cr && cr.unranked) {
    const below = cr.unranked.filter(c => c.spend > 0).reduce((a, c) => a + c.spend, 0)
    const tot = ctx.num('spend')
    if (below > 0 && tot > 0 && shareOf(below, tot) >= 5) {
      out.push(money(below) + ' (' + pctText(shareOf(below, tot)) + ' of spend) sat in corridors that never reached ' + ctx.minQL + ' QLs.')
    }
  }
  // The dearest ads priced against the cheapest is the clearest waste line there is.
  if (ar && !ar.single && ar.worst.length && ar.best.length) {
    const sw = bandTotals(ar.worst), sb = bandTotals(ar.best)
    if (sw.spend > 0 && sw.paidQL > 0 && sb.paidQL > 0) {
      out.push('The ' + ar.worst.length + ' dearest ads took ' + money(sw.spend) + ' for ' + nfmt(sw.totalQL) + ' QLs at ' + ctx.fmtINR(sw.spend / sw.paidQL) + ' a QL, against ' + ctx.fmtINR(sb.spend / sb.paidQL) + ' on the cheapest ' + ar.best.length + '.')
    }
  }
  return out
}

// What we can improve, restricted to levers marketing actually pulls. Anything that
// needs a counsellor to pick up a phone is a sales action and is not printed here,
// however bad the number looks: an instruction the reader cannot execute is noise.
function improveV4(ctx, cr, ar) {
  const out = []
  if (cr && !cr.single && cr.best.length && cr.worst.length) {
    out.push('Move budget out of ' + cr.worst[0].label + ' (' + ctx.fmtINR(cr.worst[0].cpql)
      + ' a QL) and into ' + cr.best[0].label + ' (' + ctx.fmtINR(cr.best[0].cpql) + ') '
      + DASH + ' the same money buys cheaper QLs.')
  }
  // Google is being held back on purpose while QL optimisation runs. Said out loud,
  // with the number that justifies it, so the gap is not read as an oversight.
  const g = (ctx.channels || []).find(c => /google/i.test(String(c.label)) && c.cpql != null)
  const allCpql = ctx.num('cpql')
  if (g && allCpql > 0 && g.cpql > allCpql) {
    out.push('Google CPQL is ' + ctx.fmtINR(g.cpql) + ' against ' + ctx.stat('cpql') + ' overall '
      + DASH + ' QL optimisation is already in place. Hold Google spend until it improves.')
  }
  // Reallocating the dearest ads is arithmetic, not opinion: the spend is known and
  // both prices are in the table two messages up.
  if (ar && !ar.single && ar.worst.length && ar.best.length) {
    const sw = bandTotals(ar.worst), sb = bandTotals(ar.best)
    if (sw.spend > 0 && sw.paidQL > 0 && sb.paidQL > 0) {
      const cw = sw.spend / sw.paidQL, cb = sb.spend / sb.paidQL
      if (cw > cb) {
        out.push('Retire the ' + ar.worst.length + ' dearest ads: ' + money(sw.spend) + ' at ' + ctx.fmtINR(cw)
          + ' a QL. The same money at ' + ctx.fmtINR(cb) + ' a QL, what the cheapest ' + ar.best.length + ' cost, would buy '
          + nfmt(Math.round(sw.spend / cb - sw.spend / cw)) + ' more QLs.')
      }
    }
  }
  // Spend that never reached a rankable corridor is a naming and structure problem,
  // which makes it ours to fix rather than something to report and move past.
  if (cr && cr.unranked) {
    const below = cr.unranked.filter(c => c.spend > 0)
    const sum = below.reduce((a, c) => a + c.spend, 0)
    const tot = ctx.num('spend')
    if (below.length >= 2 && sum > 0 && tot > 0 && shareOf(sum, tot) >= 3) {
      out.push('Consolidate the ' + below.length + ' corridors under ' + ctx.minQL + ' QLs ' + DASH + ' '
        + money(sum) + ' (' + pctText(shareOf(sum, tot)) + ' of spend) is spread too thin to be judged.')
    }
  }
  return out.slice(0, 4)
}

function buildV4(ctx) {
  const msgs = []
  const note = deltaNote(ctx)
  const cmp = ctx.cmp || {}

  // 1 -- the executive summary: KPI grid, the two prices, and the run-rate to month end.
  const m1 = {
    key: 'summary', label: 'Executive summary',
    text: [testLine(ctx), '*:bar_chart: ' + title(ctx) + '*', ctx.filterLine].filter(Boolean).join('\n'),
    fields: kpiFields(ctx), context: note,
  }
  const ins1 = [costDirectionV4(ctx), spendPace(ctx), spendVsQL(ctx)].filter(Boolean)
  if (ins1.length) m1.after = '*What the numbers say*\n' + list(ins1)
  msgs.push(m1)

  // 2 -- where the money went: the dashboard's own table, now carrying its own share of
  // spend column, and the findings written as decisions rather than observations.
  const m2 = {
    key: 'channels', label: 'Channel mix',
    text: ['*:moneybag: Channel mix ' + DASH + ' Paid vs Non-Paid*', ctx.filterLine].join('\n'),
    table: ctx.table, attach: true, context: note,
  }
  const ins2 = channelRecs(ctx).concat(channelMovement(ctx, cmp.channels))
  m2.after = (ins2.length ? '*:bulb: Key findings & recommendations*\n' + eList(ins2) + '\n\n' : '') + csvNote(ctx)
  msgs.push(m2)

  // 3 -- corridors, restricted to the two channels whose corridor tagging is real.
  const cr = rankByCpql(cmp.corridors, ctx.minQL)
  const ar = rankByCpql(cmp.ads, ctx.minQL)
  const scope = cmp.corridorScope || 'Paid'
  if (cr.eligible) {
    msgs.push({
      key: 'corridors', label: 'Corridors (' + scope + ')',
      text: [
        '*:earth_asia: Corridors ' + DASH + (cr.single ? ' ranked on CPQL, cheapest first*' : ' cheapest and dearest QL*'),
        '_' + scope + ' campaigns only \u00b7 ranked on CPQL \u00b7 a corridor needs at least ' + ctx.minQL + ' QLs to be ranked'
          + (cr.skipped ? ' (' + nfmt(cr.skipped) + ' smaller corridors are not ranked)' : '') + '_',
        unrankedSpend(ctx, cr),
      ].filter(Boolean).join('\n'),
      table: cpqlTable(ctx, cr, 'Corridor', false),
      chart: cpqlChart(ctx, cr.best.concat(cr.worst), 'CPQL by corridor'),
      context: note,
    })
  }

  // 4 -- the ads themselves, cheapest and dearest, as a native table.
  if (ar.eligible) {
    msgs.push({
      key: 'ads', label: 'Ads',
      text: [
        '*:rocket: Ads ' + DASH + (ar.single ? ' ranked on CPQL*' : ' cheapest and dearest on CPQL*'),
        '_Ranked on CPQL \u00b7 an ad needs at least ' + ctx.minQL + ' QLs to be ranked'
          + (ar.skipped ? ' (' + nfmt(ar.skipped) + ' smaller ads are not ranked)' : '') + '_',
      ].join('\n'),
      table: cpqlTable(ctx, ar, 'Ad', true),
      context: note,
    })
  }

  // 5 -- the honest read, all of it before the application. No "what we cannot tell
  // yet" section in v4, and nothing a media buy cannot be held to.
  const m5 = {
    key: 'insights', label: 'What worked, what broke',
    text: '*:compass: What worked, what broke, what to fix*\n' + ctx.filterLine,
    context: note,
  }
  const parts = []
  const right = moversWithBase(ctx, true).slice(0, 3)
  const wrong = moversWithBase(ctx, false).slice(0, 2).concat(marketingMisses(ctx, cr, ar)).slice(0, 5)
  if (right.length) parts.push('*:white_check_mark: What we did right*\n' + list(right))
  if (wrong.length) parts.push('*:warning: What went wrong*\n' + list(wrong))
  const fx = improveV4(ctx, cr, ar)
  if (fx.length) parts.push('*:bulb: What we can improve*\n' + list(fx))
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
    tagline: 'Marketing-only KPI grid, share of spend inside the table, Facebook + Google corridors, ad winners and losers.',
    recommended: true,
    what: [
      'Message 1 — executive summary as a two-column KPI grid: spend, leads, QLs, CPL, CPQL, the Lead to QL rate, applications and CPA, each carrying the number it moved from, plus the projected spend to month end at the current run-rate',
      'Message 2 — Paid vs Non-Paid channel table with its own % of spend column, then key findings and recommendations. No pie chart, no Offers or RAUs columns',
      'Message 3 — corridors on Facebook + Google campaigns only, split into a cheapest and a dearest band, as a native table and a CPQL chart',
      'Message 4 — the cheapest and the dearest ads on CPQL, as a native table',
      'Message 5 — what we did right, what went wrong, what we can improve, every line a marketing lever and nothing past the application',
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
