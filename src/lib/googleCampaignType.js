// Google Ads campaign type, read from the campaign NAME (the data has no campaign-type column).
// Used by the "Google type" view on Overall and Leverage Careers. First match wins, so the order
// matters: a Search campaign whose name ends in "_call" is Search, not Call.
//
// Checked against every Google campaign name in the Overall cache (Apr 2025 to Oct 2026):
// 142 Search, 15 Performance Max, 19 Demand Gen, 7 YouTube / Video, 6 App, 4 Display, a few
// call-extension and boost campaigns, and about 10 that match nothing (they land in Other).
// "Domandgen" is a typo that really is in the data, so it is matched on purpose.
export const GOOGLE_TYPES = ['Search', 'Performance Max', 'Demand Gen', 'YouTube / Video', 'Display', 'Shopping', 'App', 'Call', 'Other']

export function googleCampaignType(name) {
  const n = String(name || '').toLowerCase()
  if (!n) return 'Other'
  if (/(performance[ _-]?max|pmax)/.test(n)) return 'Performance Max'
  if (/(demand[ _-]?gen|domand[ _-]?gen|dgen|d_gen|discovery)/.test(n)) return 'Demand Gen'
  if (/(youtube|_yt_|video)/.test(n)) return 'YouTube / Video'
  if (/(display|gdn|banner)/.test(n)) return 'Display'
  if (/shopping/.test(n)) return 'Shopping'
  if (/(app[ _-]?install|uac|_app_)/.test(n)) return 'App'
  if (/(search|brand|_srch|generic)/.test(n)) return 'Search'
  if (/call/.test(n)) return 'Call'
  return 'Other'
}
