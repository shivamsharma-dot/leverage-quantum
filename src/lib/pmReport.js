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

// -- The registry ------------------------------------------------------------
// Append new versions to the TOP. Never delete or edit an old one: the panel is the
// only history there is, and an entry that changes silently is worse than no entry.
export const REPORT_VERSIONS = [
  {
    id: 'v3',
    name: 'Exec report ' + DASH + ' 4 messages',
    tagline: 'Summary, channel mix, corridors, then the honest read.',
    recommended: true,
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

export const DEFAULT_VERSION_ID = 'v3'
export const CORRIDOR_MIN_QL = 25

export function getVersion(id) {
  return REPORT_VERSIONS.find(v => v.id === id) || REPORT_VERSIONS[0]
}

// Slack section text caps at 3000 characters. Trimming here (rather than letting the
// API reject the post) keeps a send from failing on an unusually long insight list.
export function buildReportMessages(versionId, ctx) {
  return getVersion(versionId).build(ctx).map(m => ({
    ...m,
    text: m.text.length > 2900 ? m.text.slice(0, 2897) + '...' : m.text,
  }))
}
