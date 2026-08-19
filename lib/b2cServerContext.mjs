// Server-side (no React, no DOM) port of the day/mtd/fy arithmetic
// CeoB2CDashboard.jsx computes client-side for its Send-to-Slack panel.
// Ported rather than shared because the page's own copy is entangled with
// React state (useMemo deps, the date-range picker); this file is the subset
// that src/lib/b2cReport.js's buildB2CFullTable/buildB2CCashflowTable
// actually read (ctx.through, ctx.raw.day/mtd/fy) -- verified against that
// file's FULL_LINES/FULL_HEADS/CASHFLOW_LINES/CASHFLOW_HEADS field lists.
// KEEP THE FIELD-KEY LOGIC BYTE-IDENTICAL to CeoB2CDashboard.jsx's own
// col()/roll()/totals()/day-builder if either ever changes.

const REV_PNL = [['srOnline'], ['ac'], ['vas'], ['srOffline'], ['acOffline'], ['vasOffline']]
const REV_CASHFLOW = [['sr'], ['ac'], ['vas'], ['offRev']]
const COST = [['people'], ['pm'], ['op'], ['offCost'], ['corp']]

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
export function buildB2CServerContext(days, statement) {
  const revDefs = statement === 'cashflow' ? REV_CASHFLOW : REV_PNL
  const d1 = ist(-1) // last COMPLETE day, IST -- the sheet is filled a day late, and
  // every CEO-facing surface in this app stops at D-1 on principle (see
  // CeoB2CDashboard.jsx's own comment to the same effect).
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

  return { through: d1, raw: { day, mtd, fy } }
}
