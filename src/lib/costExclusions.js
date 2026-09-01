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
