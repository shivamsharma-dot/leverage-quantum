// Matches a name from our own data (a Careers "campaign", an Overall campaign_name)
// to a real Meta ad name. Shared by the browser (Leverage Careers) and the server
// (the Overall creative lookup in api/crm-leads.js), so both match the same way.
//
// Our names and Meta's names for the SAME ad often differ in small ways: an
// apostrophe in one is an underscore in the other (04Nov'26 vs 04Nov_26), case,
// or the ad was later renamed with a date added on the end. Match in this order:
// exact, then normalised (case + punctuation ignored), then a name that is the
// start of exactly ONE Meta name. Never guesses between several candidates.
export const normName = n => String(n || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')

export function makeAdResolver(adsMap) {
  const exact = adsMap || {}
  const norm = new Map()
  const dupNorm = new Set()
  Object.keys(exact).forEach(k => { const n = normName(k); if (norm.has(n)) dupNorm.add(n); else norm.set(n, k) })
  const keys = [...norm.keys()]
  const memo = new Map()
  return function resolve(name) {
    if (!name) return null
    if (memo.has(name)) return memo.get(name)
    let hit = null
    if (exact[name]) hit = exact[name]
    else {
      const n = normName(name)
      if (norm.has(n) && !dupNorm.has(n)) hit = exact[norm.get(n)]
      else if (n.length >= 20) {
        const cands = keys.filter(k => k.startsWith(n + '_') || k === n)
        if (cands.length === 1) hit = exact[norm.get(cands[0])]
      }
    }
    memo.set(name, hit)
    return hit
  }
}
