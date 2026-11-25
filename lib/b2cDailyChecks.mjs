// Checks the B2C Daily Report must pass before it may post straight to #b2c-leverage-core
// without a person approving it (the "direct" delivery mode, 2026-11-25).
//
// Every day of the report month, from the 1st to the cut-off day, is checked
// against the sheet's own arithmetic. Each check catches a real mistake seen
// in the sheet:
//   1. The cut-off day is filled in (it has costs).
//   2. Total Revenue = the sum of its revenue lines. Caught: 24 Nov Total
//      Revenue summed an empty row and read Rs 0.
//   3. Total Cost = the sum of its cost lines.
//   4. Contribution Profit = Total Revenue - (Total Cost - Corp. Overheads),
//      and EBITDA = Contribution Profit - Corp. Overheads.
//   5. SR Online and SR Offline equal the deposits in the PM tab for that
//      day. Caught: from 22 Nov SR Offline copied SR Online, which counted
//      SR twice.
//   6. Cash Flow: in every column, Closing = Opening + Inflow - Outflow, and
//      Inflow and Outflow each equal the sum of their lines.
// Anything that fails, or cannot be checked, holds the direct post; the
// report then goes to the sandbox for a person to approve as before.

const REV_KEYS = ['srOnline', 'ac', 'vas', 'srOffline', 'acOffline', 'vasOffline', 'upskilling', 'ancillary']
const COST_KEYS = ['people', 'pm', 'op', 'offCost', 'corp', 'corpSalary']
const RUPEE_TOL = 10        // Rs 10: the sheet rounds some lines to whole rupees
const CRORE_TOL = 0.02      // Rs 2 L, for the Cash Flow statement (values in crore)

const n = v => (v == null || !isFinite(v) ? 0 : Number(v))
const sum = (o, keys) => keys.reduce((t, k) => t + n(o[k]), 0)
const inr = v => 'Rs ' + Math.round(v).toLocaleString('en-IN')
const dayLabel = iso => {
  const d = new Date(iso + 'T00:00:00Z')
  return d.getUTCDate() + ' ' + d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })
}

function istYesterday() {
  return new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

// Same cut-off rule as buildB2CServerContext: a valid throughDate no later than
// yesterday (IST), else yesterday.
export function b2cCutoff(throughDate) {
  const d1 = istYesterday()
  return (typeof throughDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(throughDate) && throughDate <= d1) ? throughDate : d1
}

// pmByDate: { 'YYYY-MM-DD': { srOnline, srOffline } } from the PM tab, or null if it could not be read.
export function checkB2CDaily({ pnlDays, pmByDate, cashflowStatement, throughDate }) {
  const problems = []
  const cutoff = b2cCutoff(throughDate)
  const monthStart = cutoff.slice(0, 8) + '01'
  const days = (pnlDays || []).filter(d => d && d.date >= monthStart && d.date <= cutoff)
  const last = days.find(d => d.date === cutoff)

  if (!last || last.people == null || last.totalCost == null) {
    problems.push(dayLabel(cutoff) + ' is not filled in yet in Daily P&L.')
  }

  for (const d of days) {
    const lbl = dayLabel(d.date)
    const revLines = sum(d, REV_KEYS)
    if (Math.abs(n(d.totalRev) - revLines) > RUPEE_TOL) {
      problems.push(lbl + ': Total Revenue is ' + inr(n(d.totalRev)) + ' but its lines add up to ' + inr(revLines) + '.')
    }
    const costLines = sum(d, COST_KEYS)
    if (Math.abs(n(d.totalCost) - costLines) > RUPEE_TOL) {
      problems.push(lbl + ': Total Cost is ' + inr(n(d.totalCost)) + ' but its lines add up to ' + inr(costLines) + '.')
    }
    const contrib = n(d.totalRev) - (n(d.totalCost) - n(d.corp))
    if (d.ebitdaBeforeCorp != null && Math.abs(n(d.ebitdaBeforeCorp) - contrib) > RUPEE_TOL) {
      problems.push(lbl + ': Contribution Profit is ' + inr(n(d.ebitdaBeforeCorp)) + ', expected ' + inr(contrib) + '.')
    }
    if (d.net != null && Math.abs(n(d.net) - (n(d.ebitdaBeforeCorp) - n(d.corp))) > RUPEE_TOL) {
      problems.push(lbl + ': EBITDA is ' + inr(n(d.net)) + ', expected ' + inr(n(d.ebitdaBeforeCorp) - n(d.corp)) + '.')
    }
    if (pmByDate) {
      const pm = pmByDate[d.date] || { srOnline: 0, srOffline: 0 }
      if (Math.abs(n(d.srOnline) - pm.srOnline) > RUPEE_TOL) {
        problems.push(lbl + ': SR Online is ' + inr(n(d.srOnline)) + ' but the PM tab has ' + inr(pm.srOnline) + '.')
      }
      if (Math.abs(n(d.srOffline) - pm.srOffline) > RUPEE_TOL) {
        problems.push(lbl + ': SR Offline is ' + inr(n(d.srOffline)) + ' but the PM tab has ' + inr(pm.srOffline) + '.')
      }
    }
  }
  if (!pmByDate) problems.push('Could not read the PM tab, so SR could not be checked.')

  const cf = cashflowStatement
  if (!cf || !cf.configured || !Array.isArray(cf.rows) || !cf.rows.length) {
    problems.push('Could not read the Cash Flow statement.')
  } else {
    const rows = cf.rows
    const find = re => rows.findIndex(r => re.test(r.label))
    const iOpen = find(/^opening balance/i), iIn = find(/^cash inflow/i), iOut = find(/^cash outflow/i), iClose = find(/^closing balance/i)
    if (iOpen < 0 || iIn < 0 || iOut < 0 || iClose < 0) {
      problems.push('Cash Flow: Opening, Inflow, Outflow or Closing row is missing.')
    } else {
      (cf.columns || []).forEach((c, k) => {
        const head = c.group || c.key
        const v = i => n(rows[i].vals[k])
        const lines = (a, b) => rows.slice(a + 1, b).reduce((t, r) => t + n(r.vals[k]), 0)
        if (Math.abs(v(iOpen) + v(iIn) - v(iOut) - v(iClose)) > CRORE_TOL) {
          problems.push('Cash Flow ' + head + ': Opening + Inflow - Outflow does not equal Closing.')
        }
        if (Math.abs(lines(iIn, iOut) - v(iIn)) > CRORE_TOL) problems.push('Cash Flow ' + head + ': Inflow does not equal the sum of its lines.')
        if (Math.abs(lines(iOut, iClose) - v(iOut)) > CRORE_TOL) problems.push('Cash Flow ' + head + ': Outflow does not equal the sum of its lines.')
      })
    }
  }

  return { ok: problems.length === 0, cutoff, daysChecked: days.length, problems }
}
