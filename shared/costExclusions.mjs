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

// Each pattern has an optional `scope` saying which cost metrics it is left out of:
//   absent / 'all'  -> CPL, CPQL and CPA (every pattern saved before scopes existed)
//   'cpql_cpa'      -> CPQL and CPA; its spend and leads still count in CPL
//                      (VAS: real leads, but not sent for qualification, so no QLs/apps)
//   'cpql'          -> CPQL only; still counts in CPL and CPA (MBBS)
// Every scope includes CPQL, so isCostExcludedCampaign above (any pattern matches) is
// the CPQL test; the two below are the CPL and CPA tests.
const SCOPE_METRICS = { all: ['cpl', 'cpql', 'cpa'], cpql_cpa: ['cpql', 'cpa'], cpql: ['cpql'] }
const metricsOf = p => SCOPE_METRICS[p && p.scope] || SCOPE_METRICS.all
const forMetric = (campaign, patterns, metric) =>
  !!patterns && patterns.length > 0 &&
  isCostExcludedCampaign(campaign, patterns.filter(p => p && metricsOf(p).includes(metric)))

export const isCplCostExcludedCampaign = (campaign, patterns) => forMetric(campaign, patterns, 'cpl')
export const isCpaCostExcludedCampaign = (campaign, patterns) => forMetric(campaign, patterns, 'cpa')
