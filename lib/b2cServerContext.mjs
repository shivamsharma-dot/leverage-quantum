// Server-side (no React, no DOM) port of the day/mtd/fy arithmetic
// CeoB2CDashboard.jsx computes client-side for its Send-to-Slack panel.
// Ported rather than shared because the page's own copy is entangled with
// React state (useMemo deps, the date-range picker); this file is the subset
// that src/lib/b2cReport.js's buildB2CFullTable (P&L only) actually reads
// (ctx.through, ctx.raw.day/mtd/fy) -- verified against that file's own
// FULL_LINES/FULL_HEADS field lists. KEEP THE FIELD-KEY LOGIC
// BYTE-IDENTICAL to CeoB2CDashboard.jsx's own col()/roll()/totals()/
// day-builder if either ever changes.
// Cash Flow's own native table (buildB2CCashflowTable) stopped reading this
// file's output entirely (2026-09-10) -- Finance's 'CF' tab now hands over
// an already-finished MTD/YTD statement (api/crm-leads.js's
// cashflowStatement), so there is no day-level arithmetic left to port for
// that statement. REV_CASHFLOW below is dead now that nothing calls
// buildB2CServerContext(..., 'cashflow', ...) any more -- left in place only
// because api/send-report.mjs's b2c_daily_report job for 'pnl' still shares
// this same totals()/dayFrom() machinery via REV_PNL.

// 'upskilling'/'ancillary' (revenue) and 'corpSalary' (cost) are columns
// Finance added to the Daily P&L tab in 2026-09/2026-10 (api/crm-leads.js's
// B2C_PNL_COLS has the full story) -- P&L-only, so REV_CASHFLOW is untouched;
// Cash Flow rows carry no such fields, so col(rows,...) below just resolves
// them to null there, same as ebitdaBeforeCorp already does. Unlike
// CeoB2CDashboard.jsx's OWN page-local REV_PNL (used to slice Online/Offline
// UI subgroups, so upskilling/ancillary are deliberately kept OUT of it and
// handled as their own explicit fields instead), THIS flat REV_PNL is only
// ever summed generically via totals()/dayFrom()'s forEach below -- so a new
// revenue column just needs adding here, no special-casing required.
const REV_PNL = [['srOnline'], ['ac'], ['vas'], ['srOffline'], ['acOffline'], ['vasOffline'], ['upskilling'], ['ancillary']]
const REV_CASHFLOW = [['sr'], ['ac'], ['vas'], ['offRev']]
const COST = [['people'], ['pm'], ['op'], ['offCost'], ['corp'], ['corpSalary']]

function plus(a, b) { if (a == null && b == null) return null; return (a == null ? 0 : a) + (b == null ? 0 : b) }
function sub(a, b) { if (a == null && b == null) return null; return (a == null ? 0 : a) - (b == null ? 0 : b) }
function col(rows, k) { let t = null; for (const r of rows) { if (r[k] != null) t = (t == null ? 0 : t) + r[k] } return t }
function roll(o, defs) { return defs.reduce((a, d) => plus(a, o[d[0]]), null) }

function ist(offsetDays) {
  return new Date(Date.now() + (offsetDays || 0) * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function totals(rows, revDefs) {
  const o = {}
  revDefs.concat(COST).forEach(d => { o[d[0]] = col(rows, d[0]) })
  o.rev = col(rows, 'totalRev'); if (o.rev == null) o.rev = roll(o, revDefs)
  o.cost = col(rows, 'totalCost'); if (o.cost == null) o.cost = roll(o, COST)
  o.net = col(rows, 'net'); if (o.net == null) o.net = sub(o.rev, o.cost)
  o.sr = col(rows, 'sr')
  // Byte-identical to CeoB2CDashboard.jsx's own totals(): trust the sheet's
  // own 'EBITDA Before Corp. Overheads' column first (P&L only -- Cash Flow
  // rows carry no such field, so this stays null there), otherwise derive it
  // by adding Corp. Overheads back onto the after-corp EBITDA ('net' already
  // subtracted it). Missing here meant the native Slack table's "EBITDA
  // Before Corp. Overheads" row rendered blank on every automated/cron send
  // (money(undefined) -> em dash) while the on-page table and the on-demand
  // Send-to-Slack panel -- which reuse this same page's own day/mtd/fy
  // objects -- showed it correctly.
  o.ebitdaBeforeCorp = col(rows, 'ebitdaBeforeCorp'); if (o.ebitdaBeforeCorp == null) o.ebitdaBeforeCorp = plus(o.net, o.corp)
  return o
}

function dayFrom(last, revDefs) {
  if (!last) return null
  const o = { date: last.date, sr: last.sr }
  revDefs.concat(COST).forEach(d => { o[d[0]] = last[d[0]] })
  o.rev = last.totalRev != null ? last.totalRev : roll(o, revDefs)
  o.cost = last.totalCost != null ? last.totalCost : roll(o, COST)
  o.net = last.net != null ? last.net : sub(o.rev, o.cost)
  o.ebitdaBeforeCorp = last.ebitdaBeforeCorp != null ? last.ebitdaBeforeCorp : plus(o.net, o.corp)
  return o
}

// { through, raw: { day, mtd, fy } } -- exactly and only what
// buildB2CFullTable/buildB2CCashflowTable read.
// throughDate is optional -- an admin picking an earlier day from the
// dashboard's own "Send Daily Report" control (e.g. "send through Sep 3"
// instead of always auto-picking yesterday). Only ever allowed to move the
// cutoff EARLIER than the real D-1, never later -- today or a future date
// would mean reporting on a day the sheet hasn't finished filling in yet, so
// an invalid/out-of-range value is silently ignored and the real D-1 is used.
export function buildB2CServerContext(days, statement, throughDate) {
  const revDefs = statement === 'cashflow' ? REV_CASHFLOW : REV_PNL
  const realD1 = ist(-1) // last COMPLETE day, IST -- the sheet is filled a day late, and
  // every CEO-facing surface in this app stops at D-1 on principle (see
  // CeoB2CDashboard.jsx's own comment to the same effect).
  const d1 = (typeof throughDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(throughDate) && throughDate <= realD1)
    ? throughDate
    : realD1
  const upto = (days || [])
    .filter(d => d && d.date && d.date <= d1)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))

  const last = upto[upto.length - 1] || null
  const day = dayFrom(last, revDefs)

  const monthStr = d1.slice(0, 7)
  const monthRows = upto.filter(d => d.date.startsWith(monthStr))
  const mtd = totals(monthRows, revDefs)

  const y = parseInt(d1.slice(0, 4), 10)
  const mo = parseInt(d1.slice(5, 7), 10)
  const sy = mo >= 4 ? y : y - 1
  const fyFrom = sy + '-04-01'
  const fyRows = upto.filter(d => d.date >= fyFrom && d.date <= d1)
  const fy = totals(fyRows, revDefs)
  fy.from = fyFrom
  fy.to = d1
  fy.label = 'FY ' + sy + '-' + String((sy + 1) % 100).padStart(2, '0')

  // H1 (1 Apr - 30 Sep) and H2 (1 Oct - 31 Mar) of the same fiscal year, capped
  // at the report's own cut-off day -- same rule as the Daily P&L page's own
  // h1/h2 blocks, so the Slack table and the page always agree. H2 is null
  // until the cut-off reaches 1 October.
  const h1To = sy + '-09-30'
  const h1Cut = d1 >= h1To ? h1To : d1
  const h1 = totals(upto.filter(d => d.date >= fyFrom && d.date <= h1Cut), revDefs)
  h1.from = fyFrom; h1.to = h1Cut; h1.complete = d1 >= h1To
  h1.label = 'H1 ' + fy.label.replace('FY ', '')
  const h2From = sy + '-10-01'
  let h2 = null
  if (d1 >= h2From) {
    const h2To = (sy + 1) + '-03-31'
    const h2Cut = d1 >= h2To ? h2To : d1
    h2 = totals(upto.filter(d => d.date >= h2From && d.date <= h2Cut), revDefs)
    h2.from = h2From; h2.to = h2Cut; h2.complete = d1 >= h2To
    h2.label = 'H2 ' + fy.label.replace('FY ', '')
  }

  return { through: d1, raw: { day, mtd, fy, h1, h2 } }
}
