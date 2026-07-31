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

// ---- v2: MTD, YTD (yesterday) and day on day -------------------------------
// One click posts three separate messages. Every one has the same shape: a KPI
// stack where each figure carries its own comparison, then a native Slack table
// where each metric column is followed by a "vs" column holding both the
// movement AND the actual number it moved from. Nobody has to open a second
// message to find out what "up 4%" was up from.
const V2_MONTH_KPIS = [
  { label:'Spend', key:'spend' },
  { label:'Leads', key:'leads' },
  { label:'Total QLs', key:'totalQL' },
  { label:'CPL', key:'cpl' },
  { label:'CPQL', key:'cpql' },
  { label:'Applications', key:'apps' },
  { label:'Offers', key:'offers' },
  { label:'Deposits', key:'deposits' },
  { label:'RAUs', key:'raus' },
]
// A single day is a small number. Offers, deposits and RAUs land days or weeks
// after the click that earned them, so day on day they are noise, not news.
const V2_DAY_KPIS = V2_MONTH_KPIS.slice(0, 5)
const V2_METRICS = [
  { key:'spend', label:'Spend' },
  { key:'leads', label:'Leads' },
  { key:'totalQL', label:'QLs' },
  { key:'cpl', label:'CPL' },
  { key:'cpql', label:'CPQL' },
]

function v2Fmt(ctx, key, v) {
  if (v == null || !isFinite(Number(v))) return DASH
  if (key === 'spend') return money(v)
  if (key === 'cpl' || key === 'cpql' || key === 'cpa') return ctx.fmtINR(v)
  return nfmt(v)
}

function v2KpiLines(ctx, now, prev, keys) {
  if (!now) return []
  return keys.map(k => {
    const cur = now[k.key]
    if (cur == null) return null
    const was = prev ? prev[k.key] : null
    return '*' + k.label + '*  ' + v2Fmt(ctx, k.key, cur) + '   ' + chip(pctOf(cur, was), v2Fmt(ctx, k.key, was))
  }).filter(Boolean)
}

// A vs cell never shows a bare percentage. It shows the movement and then the
// figure it moved from, so the row is self-explaining on a phone screen.
function v2Vs(ctx, g, key) {
  const p = g.prev || null
  const cur = g[key]
  const was = p ? p[key] : null
  // Nothing in either period is not news, it is an empty row. Only a real
  // figure appearing where there was none before is "new".
  if (cur == null && was == null) return DASH
  const c = Number(cur || 0)
  const w = Number(was || 0)
  if (!(Math.abs(w) > 0)) return Math.abs(c) > 0 ? 'new' : DASH
  const d = pctOf(c, w)
  if (d == null) return DASH
  const move = Math.abs(d) < 0.05 ? 'flat' : (d >= 0 ? '\u25b2 ' : '\u25bc ') + abs1(d)
  return move + ' \u00b7 ' + v2Fmt(ctx, key, was)
}

function v2CmpTable(ctx, firstCol, entries, totalSpend, vsLabel, withShare) {
  const cols = [firstCol]
  V2_METRICS.forEach(m => {
    cols.push(m.label)
    if (withShare && m.key === 'spend') cols.push('% of spend')
    cols.push(m.label + ' ' + vsLabel)
  })
  const t = { columns: cols, rows: [], strongRows: [], wrapFirst: true }
  ;(entries || []).forEach(e => {
    const g = e.g || {}
    const cells = [e.label]
    V2_METRICS.forEach(m => {
      cells.push(v2Fmt(ctx, m.key, g[m.key]))
      if (withShare && m.key === 'spend') cells.push(totalSpend > 0 ? (((g.spend || 0) / totalSpend) * 100).toFixed(1) + '%' : DASH)
      cells.push(v2Vs(ctx, g, m.key))
    })
    if (e.strong) t.strongRows.push(t.rows.length)
    t.rows.push(cells)
  })
  return t
}

function buildV2(ctx) {
  const msgs = []
  const vsLast = 'vs ' + (ctx.prevLabel || 'last')
  const one = [
    testLine(ctx),
    '*:bar_chart: ' + title(ctx) + '*',
    '*MTD Performance*',
    ctx.filterLine,
    '',
    ...v2KpiLines(ctx, ctx.now, ctx.prev, V2_MONTH_KPIS),
    '',
    '_Every movement reads ' + (ctx.periodLabel || 'this period') + ' against ' + (ctx.prevLabel || 'the period before it') + ', the same-length window immediately before it. The figure after the arrow is what it moved from._',
    csvNote(ctx),
  ]
  msgs.push({ key:'mtd', label:'MTD performance', text: one.filter(l => l != null).join('\n'), table: v2CmpTable(ctx, 'Source', ctx.cmpRows, ctx.cmpTotalSpend, vsLast, true), attach: true })

  const d = ctx.day
  if (d && d.now) {
    const two = [
      '*:calendar: YTD Performance*',
      '*Yesterday \u00b7 ' + d.label + '*',
      (d.prevLabel ? 'Against ' + d.prevLabel + ' \u00b7 ' : '') + (ctx.scopeLine || ''),
      d.isYesterday ? null : '_' + d.label + ' is the most recent day carrying data, so it is the day reported._',
      '',
      ...v2KpiLines(ctx, d.now, d.prev, V2_DAY_KPIS),
      '',
      '_Every movement reads ' + d.label + ' against ' + (d.prevLabel || 'the day before') + '. The figure after the arrow is what it moved from._',
    ]
    msgs.push({ key:'yday', label:'YTD performance', text: two.filter(l => l != null).join('\n'), table: v2CmpTable(ctx, 'Source', d.rows, d.totalSpend, 'vs ' + (d.prevLabel || 'prev day'), true) })
  }

  const dow = ctx.dow
  if (dow && dow.rows && dow.rows.length) {
    const three = [
      '*:chart_with_upwards_trend: Day on Day Performance*',
      (dow.periodLabel ? dow.periodLabel + ' \u00b7 ' : '') + dow.rows.length + ' days \u00b7 newest first',
      ctx.scopeLine || '',
      '',
      '_Each row is one day, and each vs cell is that day against the calendar day before it. A run of the same arrow is a trend; one row on its own is not._',
    ]
    msgs.push({ key:'dow', label:'Day on day performance', text: three.filter(l => l != null).join('\n'), table: v2CmpTable(ctx, 'Date', dow.rows, 0, 'vs prev day', false) })
  }
  return msgs
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
    + '*, the same-length period immediately before it, on the same Source and Corridor filters. CPL and CPQL divide spend by PAID leads and PAID QLs only, so free channels never make acquisition look cheaper than it was.'
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
// Applications, CPA, Offers, Deposits and RAUs all sit at or past the application, where the number
// moves for reasons the media buy cannot be judged on.
const MOVERS_V4 = MOVERS.filter(m => ['leads', 'totalQL', 'cpl', 'cpql'].indexOf(m.key) >= 0)

function moversWithBase(ctx, wantGood) {
  const p = ctx.prev || {}
  const base = {
    leads: nfmt(p.leads), totalQL: nfmt(p.totalQL),
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

// -- v4 freshness layer -------------------------------------------------------
// An MTD report read two days running says nearly the same thing twice: one extra
// day moves a month-to-date figure by a percent or two. Everything below reads the
// LAST COMPLETE DAY and the day-by-day series the dashboard already computed, so
// every send carries something that was not true yesterday. No new data is fetched
// and nothing is modelled -- the same figures, cut by day instead of by month.

// dow rows arrive newest first. Rather than trust that, the series is oriented by
// checking which end matches the last complete day the report already names.
const daySeriesOf = ctx => {
const rows = ((ctx.dow && ctx.dow.rows) || []).map(r => (r && r.g) || null).filter(Boolean)
if (rows.length < 2 || !ctx.day || !ctx.day.now) return rows
const target = Number(ctx.day.now.spend)
if (!isFinite(target)) return rows
const near = (a, b) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.001)
if (near(Number(rows[0].spend), target)) return rows
if (near(Number(rows[rows.length - 1].spend), target)) return rows.slice().reverse()
return rows
}
const meanOf = (rows, key) => {
const v = rows.map(r => Number(r[key])).filter(n => isFinite(n) && n > 0)
return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}
const sumOf = (rows, key) => rows.reduce((a, r) => a + (Number(r[key]) || 0), 0)

// One day against one other day is noise. One day against its own trailing week is
// the smallest movement worth putting in front of anybody, so that is the read.
function dayPulse(ctx) {
const s = daySeriesOf(ctx)
const d = ctx.day
if (!d || !d.now || s.length < 4) return null
const trail = s.slice(1, 8)
if (trail.length < 3) return null
const cur = s[0]
const bits = []
const one = (key, label, fmt) => {
const now = Number(cur[key])
const av = meanOf(trail, key)
if (!isFinite(now) || !(now > 0) || av == null) return
const dv = pctOf(now, av)
if (dv == null || Math.abs(dv) < 2) return
bits.push(label + ' ' + fmt(now) + ' ' + mv(dv) + ' on a ' + fmt(av) + ' average')
}
one('spend', 'spend', money)
one('totalQL', 'QLs', v => nfmt(Math.round(v)))
one('cpql', 'CPQL', ctx.fmtINR)
if (!bits.length) return d.label + ' sat within 2% of its own trailing ' + trail.length + '-day average on spend, QLs and CPQL ' + DASH + ' a flat day.'
return d.label + ' against its trailing ' + trail.length + ' days: ' + bits.join(', ') + '.'
}

// Direction held across consecutive days. One day is a reading; three or more the
// same way is the thing that actually changed since the last report went out.
function cpqlStreak(ctx) {
const v = daySeriesOf(ctx).map(r => Number(r.cpql)).filter(n => isFinite(n) && n > 0)
if (v.length < 4) return null
const dir = v[0] < v[1] ? -1 : (v[0] > v[1] ? 1 : 0)
if (!dir) return null
let n = 1
while (n + 1 < v.length && ((dir < 0 && v[n] < v[n + 1]) || (dir > 0 && v[n] > v[n + 1]))) n++
if (n < 3) return null
return 'CPQL has ' + (dir < 0 ? 'fallen' : 'risen') + ' ' + n + ' days running, ' + ctx.fmtINR(v[n]) + ' ' + TO + ' ' + ctx.fmtINR(v[0]) + '.'
}

// Where the last complete day sits inside the window. An extreme is news; the middle
// of the pack is still a fresh sentence because the rank moves every single day.
function dayExtreme(ctx) {
const d = ctx.day
const v = daySeriesOf(ctx).map(r => Number(r.cpql)).filter(n => isFinite(n) && n > 0)
if (!d || v.length < 5) return null
const cur = v[0]
const rest = v.slice(1)
const lo = Math.min.apply(null, rest)
const hi = Math.max.apply(null, rest)
if (cur < lo) return d.label + ' was the cheapest QL day of the last ' + v.length + ' at ' + ctx.fmtINR(cur) + ', under the previous best of ' + ctx.fmtINR(lo) + '.'
if (cur > hi) return d.label + ' was the dearest QL day of the last ' + v.length + ' at ' + ctx.fmtINR(cur) + ', over the previous worst of ' + ctx.fmtINR(hi) + '.'
const sorted = rest.concat([cur]).sort((a, b) => a - b)
return d.label + ' at ' + ctx.fmtINR(cur) + ' ranks ' + (sorted.indexOf(cur) + 1) + ' cheapest of the last ' + sorted.length + ' days.'
}

// The channel cut of the same day. A month-level channel share barely moves; the
// daily split is where a shift shows up first, which is what earns it this message.
function channelDayShift(ctx) {
const d = ctx.day
if (!d || !d.rows || !d.rows.length) return null
const skip = /^(TOTAL|PAID CHANNELS|NON-PAID|NON PAID)/i
const rows = d.rows.filter(r => r && r.g && !skip.test(String(r.label)) && Number(r.g.spend) > 0)
if (rows.length < 2) return null
const scored = rows.map(r => {
const g = r.g
const p = g.prev || null
return { label: r.label, g, dv: p ? pctOf(Number(g.spend), Number(p.spend)) : null, dd: p ? Number(g.spend) - Number(p.spend) : null, was: p ? Number(p.spend) : null }
}).filter(x => x.dv != null && x.dd != null && Math.abs(x.dd) >= Math.max(25000, (Number(d.totalSpend) || 0) * 0.02))
if (!scored.length) return null
const w = scored.sort((a, b) => Math.abs(b.dd) - Math.abs(a.dd))[0]
return ':calendar: *Biggest single-day shift, ' + d.label + '*: ' + w.label + ' spend ' + money(w.g.spend) + ', ' + (w.dd >= 0 ? 'up ' : 'down ') + money(Math.abs(w.dd)) + ' (' + chip(w.dv, money(w.was)) + ' the day before) for ' + nfmt(w.g.totalQL || 0) + ' QLs at ' + (w.g.cpql != null ? ctx.fmtINR(w.g.cpql) : DASH) + ' a QL.'
}

// Rank now against rank on last period's CPQL, inside the same ranked set. A corridor
// that climbed six places is a different story from one that is simply cheap, and it
// is the part of this table that actually differs between two sends.
function rankShift(ctx, r, noun) {
const set = (r.best || []).concat(r.worst || []).filter(c => c.cpql != null && c.prev && c.prev.cpql != null && c.prev.cpql > 0)
if (set.length < 3) return null
const now = set.slice().sort((a, b) => a.cpql - b.cpql).map(c => c.label)
const was = set.slice().sort((a, b) => a.prev.cpql - b.prev.cpql).map(c => c.label)
const moves = set.map(c => ({ c, m: was.indexOf(c.label) - now.indexOf(c.label) })).filter(x => Math.abs(x.m) >= 2)
const up = moves.slice().sort((a, b) => b.m - a.m)[0] || null
const dn = moves.slice().sort((a, b) => a.m - b.m)[0] || null
const out = []
if (up && up.m >= 2) out.push('biggest climber ' + up.c.label + ', up ' + up.m + ' places to ' + (now.indexOf(up.c.label) + 1) + ' of ' + now.length + ' at ' + ctx.fmtINR(up.c.cpql) + ' from ' + ctx.fmtINR(up.c.prev.cpql))
if (dn && dn.m <= -2 && (!up || dn.c.label !== up.c.label)) out.push('biggest faller ' + dn.c.label + ', down ' + Math.abs(dn.m) + ' to ' + (now.indexOf(dn.c.label) + 1) + ' at ' + ctx.fmtINR(dn.c.cpql) + ' from ' + ctx.fmtINR(dn.c.prev.cpql))
if (!out.length) {
const moved = set.map(c => ({ c, dv: pctOf(c.cpql, c.prev.cpql) })).filter(x => x.dv != null && Math.abs(x.dv) >= 1)
if (!moved.length) return null
const bm = moved.sort((x, y) => x.dv - y.dv)[0]
out.push('ranks held; the biggest price move is ' + bm.c.label + ' ' + (bm.dv < 0 ? 'down' : 'up') + ' ' + Math.abs(bm.dv).toFixed(1) + '% to ' + ctx.fmtINR(bm.c.cpql) + ' from ' + ctx.fmtINR(bm.c.prev.cpql))
}
return '_' + noun + ' movement against last period ' + DASH + ' ' + out.join('; ') + '_'
}

// Ads with no last-period figure, and how much of the ranked money the top three
// carry. Both change every time a creative goes live, so this is the message's own
// moving part rather than a restatement of the table above it.
function adFresh(ctx, r) {
const out = []
const set = (r.best || []).concat(r.worst || [])
const fresh = set.filter(c => c.spend > 0 && (!c.prev || c.prev.cpql == null)).sort((a, b) => a.cpql - b.cpql)
if (fresh.length) {
const f = fresh[0]
out.push(':mag: *' + nfmt(fresh.length) + ' ranked ad' + (fresh.length > 1 ? 's have' : ' has') + ' no last-period CPQL to read against* ' + DASH + ' cheapest of them is ' + f.label + ' at ' + ctx.fmtINR(f.cpql) + ' on ' + money(f.spend) + '.')
}
const byS = set.slice().sort((a, b) => (b.spend || 0) - (a.spend || 0))
const tot = byS.reduce((a, c) => a + (c.spend || 0), 0)
if (byS.length >= 4 && tot > 0) {
const t3 = byS.slice(0, 3)
const sh = shareOf(t3.reduce((a, c) => a + (c.spend || 0), 0), tot)
if (sh >= 40) out.push(':pushpin: *The 3 largest ads carry ' + pctText(sh) + ' of all ranked ad spend* ' + DASH + ' ' + t3.map(c => c.label + ' at ' + ctx.fmtINR(c.cpql) + ' a QL').join(', ') + '.')
}
return out
}

// Last seven complete days against the seven before them. Same arithmetic the KPI
// grid does, on a window short enough to move between two sends.
function weekMomentum(ctx) {
const s = daySeriesOf(ctx)
if (s.length < 8) return null
const a = s.slice(0, 7)
const b = s.slice(7, 14)
if (b.length < 4) return null
const sa = sumOf(a, 'spend'), sb = sumOf(b, 'spend')
const qa = sumOf(a, 'totalQL'), qb = sumOf(b, 'totalQL')
if (!(sa > 0) || !(sb > 0)) return null
const bits = ['spend ' + money(sa) + ' ' + mv(pctOf(sa, sb)) + ' vs ' + money(sb)]
bits.push('QLs ' + nfmt(qa) + (qb > 0 ? ' ' + mv(pctOf(qa, qb)) + ' vs ' + nfmt(qb) : ''))
if (qa > 0 && qb > 0) bits.push('CPQL ' + ctx.fmtINR(sa / qa) + ' ' + mv(pctOf(sa / qa, sb / qb)) + ' vs ' + ctx.fmtINR(sb / qb))
return 'Last ' + a.length + ' complete days against the ' + b.length + ' before them: ' + bits.join(', ') + '.'
}

// v4 stops at the QL, so the application columns come out of the channel table too.
// Matching on the label rather than the key keeps this working whichever column set the
// dashboard hands over, and the attached CSV still carries every column untouched.
const V4_DROP = ['applications', 'apps', 'cpa']
function dropCols(t, kill) {
if (!t || !t.columns) return t
const bad = t.columns.map((c, i) => (kill.indexOf(String(c).trim().toLowerCase()) >= 0 ? i : -1)).filter(i => i >= 0)
if (!bad.length) return t
const keep = arr => arr.filter((_, i) => bad.indexOf(i) < 0)
return { ...t, columns: keep(t.columns), rows: (t.rows || []).map(keep) }
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
  const fresh1 = [dayPulse(ctx), cpqlStreak(ctx), dayExtreme(ctx)].filter(Boolean)
  if (fresh1.length) m1.after = (m1.after ? m1.after + '\n\n' : '') + '*:calendar: What moved since the last report*\n' + list(fresh1)
  msgs.push(m1)

  // 2 -- where the money went: the dashboard's own table, now carrying its own share of
  // spend column, and the findings written as decisions rather than observations.
  const m2 = {
    key: 'channels', label: 'Channel mix',
    text: ['*:moneybag: Channel mix ' + DASH + ' Paid vs Non-Paid*', ctx.filterLine].join('\n'),
    table: dropCols(ctx.table, V4_DROP), attach: true, context: note,
  }
  const ins2 = channelRecs(ctx).concat(channelMovement(ctx, cmp.channels)).concat([channelDayShift(ctx)].filter(Boolean))
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
        rankShift(ctx, cr, 'Corridor'),
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
      after: (function () { const a = adFresh(ctx, ar); return a.length ? '*:bulb: Ad-level movement*\n' + eList(a) : undefined })(),
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
  const wm = weekMomentum(ctx)
  if (wm) parts.push('*:chart_with_upwards_trend: Momentum ' + DASH + ' last seven complete days*\n' + list([wm]))
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
import { buildV5 } from './pmReportV5'
import { buildV6 } from './pmReportV6'
import { buildV7 } from './pmReportV7'

export const REPORT_VERSIONS = [
  {
    id: 'v7',
    code: 'V7',
    msgKeys: ['yesterday', 'movers', 'month'],
    name: 'Daily read ' + DASH + ' 3 messages',
    tagline: 'Yesterday first: the last complete day against the day before it and against its own trailing week, then what moved by channel, then the month as context.',
    recommended: false,
    what: [
      'Built for a daily send. The headline is the last complete day rather than the month, so the figures are genuinely different every morning without a word being reworded.',
      'Message 1 - yesterday: spend, leads, QLs, CPL, CPQL and the Lead to QL rate, each against the day before. Then the verdict - the 10 L daily budget, the bonus-day test, the 550-600 QL target - and the same day against its own trailing 7 days.',
      'Message 2 - what moved yesterday, by channel: the source table for that one day, then the three movers picked on money at stake multiplied by the size of the move, so the names change as the data changes.',
      'Message 3 - the month, demoted to context: the channel table, the run-rate to month end and the two positions that matter. Table image and the all-columns CSV land in this thread.',
      'No applications and no CPA anywhere. No corridor or ad detail either - the dashboard only builds those month to date, so they would repeat every morning. The current day is always excluded.',
    ],
    build: buildV7,
  },
  {
    id: 'v6',
    code: 'V6',
    msgKeys: ['capacity'],
    name: 'Capacity check ' + DASH + ' 1 message',
    tagline: 'What 10 L a day could buy if it went to the cheapest qualifying campaigns first, each one capped at a daily spend it has already reached. Observation only, not a CEO send.',
    recommended: false,
    what: [
      'Message 1 - capacity check: the modelled QLs a day at the 10 L cap against what the last seven complete days actually produced, the campaigns the budget would fill and in what order, each capped at its 90th percentile daily spend over the rolling 30 complete days, and any budget that could not be placed.',
      'Observation only. It models a reallocation nobody has run yet, so it is not built for the CEO channel.',
      'Every CPQL is a campaign own realised figure over the window and every ceiling is a daily spend it has already reached, so no input is extrapolated past the data.',
      'CPQL is held flat as spend moves onto a campaign. In practice it rises, so the headline is a ceiling on what a reallocation could reach rather than a forecast.',
    ],
    build: buildV6,
  },
  {
    id: 'v5',
    code: 'V5',
    msgKeys: ['budget', 'best', 'breach'],
    name: 'Budget and QL efficiency ' + DASH + ' 3 messages',
    tagline: 'Facebook + Google against the 10 L a day budget, the best optimised campaigns, and every CPQL running high. Complete days only, so it always reads to D-1.',
    recommended: false,
    what: [
      'Message 1 — budget scorecard: yesterday against the 10 L a day cap, with QLs, CPQL, the target QLs a day, whether it was a bonus day and which condition failed when it was not, the last seven complete days against the seven before them, and a day-by-day table carrying a bonus column.',
      'Message 2 — best optimised campaigns: the qualifying set over a rolling 30 complete days, cheapest CPQL first, with spend, share of spend, QLs and CPQL, an ALL QUALIFYING total row, and the corridors ranked cheapest first underneath.',
      'Message 3 — CPQL running high: every campaign above 1.5x the qualifying-track CPQL, ordered by the rupees it spent above that rate rather than by the multiple, then the corridors over the same line, then any spend that produced no QLs at all.',
      'A bonus day spends under the cap, holds CPQL at or below the benchmark, and still clears its own trailing seven-day QL average. The benchmark is the all-in CPQL of the 30 complete days that ended when the month began, frozen so it cannot drift day to day.',
      'Only campaigns whose leads were actually sent for qualification, 25 or more queued inside the window, are judged on cost per QL. Campaigns routed straight to the floor cannot produce a QL, so they are out of every campaign and corridor list here, and message 1 states their spend on its own line so the all-in CPQL still reconciles to the full budget.',
      'The QL a day target is a band the team sets, currently 550 to 600. The line under it says what the qualifying-track CPQL supports at the 10 L cap, so the band is never presented as though it fell out of the data.',
      'Scope is Facebook + Google only, and QLs come from the Overall sheet, so campaign and corridor are the finest levels available — there is no ad-level or keyword-level QL attribution to police. No Meta or Google platform metrics, and no projections: V5 reports what happened and nothing else.',
    ],
    build: buildV5,
  },
  {
id: 'v4',
    code: 'V4',
    msgKeys: ['summary', 'channels', 'corridors', 'ads', 'insights'],
    name: 'Exec report ' + DASH + ' 5 messages, charts',
    tagline: 'Marketing-only KPI grid, share of spend inside the table, Facebook + Google corridors, ad winners and losers.',
    recommended: true,
    what: [
      'Message 1 — executive summary as a two-column KPI grid: spend, leads, QLs, CPL, CPQL, and the Lead to QL rate, each carrying the number it moved from, plus the projected spend to month end at the current run-rate',
      'Message 2 — Paid vs Non-Paid channel table with its own % of spend column, then key findings and recommendations. No pie chart, no Offers or RAUs columns',
      'Message 3 — corridors on Facebook + Google campaigns only, split into a cheapest and a dearest band, as a native table and a CPQL chart',
      'Message 4 — the cheapest and the dearest ads on CPQL, as a native table',
      'Message 5 — what we did right, what went wrong, what we can improve, every line a marketing lever and nothing past the application',
      'Every message also carries a freshness read off the last complete day and the day-by-day series: yesterday against its own trailing week, any CPQL streak, where the day ranks in the window, the largest single-day channel shift, corridor and ad rank movement, and the last seven days against the seven before',
      'Every message states in a footer exactly how its deltas were calculated',
      'Table image and the all-columns CSV land in the thread of message 2',
    ],
    build: buildV4,
  },
  {
    id: 'v3',
    code: 'V3',
    msgKeys: ['summary', 'channels', 'corridors', 'insights'],
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
    code: 'V2',
    msgKeys: ['mtd', 'yday', 'dow'],
    name: 'Summary + table ' + DASH + ' MTD, YTD, day on day',
    tagline: 'Three messages: month to date, yesterday, and every day against the day before.',
    what: [
      'Message 1 ' + DASH + ' MTD Performance: the KPI stack and the Paid vs Non-Paid native table',
      'Message 2 ' + DASH + ' YTD Performance: yesterday, read against the day before it',
      'Message 3 ' + DASH + ' Day on Day Performance: one row per day, newest first',
      'Every metric column is followed by a vs column carrying the movement AND the figure it moved from',
      'Table image and the all-columns CSV in the thread of message 1',
    ],
    build: buildV2,
  },
  {
    id: 'v1',
    code: 'V1',
    msgKeys: ['summary'],
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
  const v = getVersion(versionId)
  const order = v.msgKeys || []
  return v.build(ctx).map((m, i) => {
    const slot = order.indexOf(m.key)
    return { ...m, id: (v.code || String(v.id).toUpperCase()) + '-M' + (slot >= 0 ? slot + 1 : i + 1), viewCode: v.code || String(v.id).toUpperCase(), text: trim(m.text), after: trim(m.after) }
  })
}
