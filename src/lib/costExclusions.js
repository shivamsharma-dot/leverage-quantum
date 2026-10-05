// A campaign matching any pattern here is excluded from CPL/CPQL/CPA math
// everywhere those ratios are computed on the Overall dashboard (KPI cards,
// the funnel summary table, Compare, Trend Analysis, and every quality
// section) -- its real Spend/Leads/QLs/Applications still count in every
// volume total and chart; only the blended cost-per-X figures are computed
// as if that campaign's spend and leads were never there. Managed in
// Settings > Data > Cost-metric exclusions (app_preferences key
// 'cost_excluded_campaign_patterns'), so no code change is needed to add or
// remove a pattern later.
//
// Deliberately a plain, framework-free function -- so a future server-side
// consumer (e.g. the Slack CEO report builders, which run inside a Vercel
// function rather than the browser) can import this exact same rule instead
// of re-deriving it and risking the two disagreeing.
export function isCostExcludedCampaign(campaign, patterns) {
  if (!campaign || !patterns || !patterns.length) return false
  const name = String(campaign).toLowerCase()
  return patterns.some(p => p && p.pattern && name.includes(String(p.pattern).toLowerCase()))
}

// Each pattern has an optional `scope`. Absent / 'all' (every pattern saved before
// scopes existed) = left out of CPL, CPQL and CPA, as before. 'cpql' = left out of
// CPQL only: the campaign's spend and leads still count in CPL and CPA. Added
// 2026-10-05 for MBBS, whose leads are real leads that simply never go to Futwork
// for qualification -- that is a reason to keep them out of CPQL, not CPL/CPA.
//
// isCostExcludedCampaign above is therefore the CPQL test (any pattern matches);
// this is the stricter CPL/CPA test (only patterns whose scope is not 'cpql').
export function isCplCostExcludedCampaign(campaign, patterns) {
  if (!patterns || !patterns.length) return false
  return isCostExcludedCampaign(campaign, patterns.filter(p => p && p.scope !== 'cpql'))
}
