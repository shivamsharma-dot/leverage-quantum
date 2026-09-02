// Central registry of lazy-loaded page chunks, used by App.jsx's React.lazy()
// calls AND by Sidebar.jsx to warm a chunk on hover before the user clicks.
// Keeping one source of truth means a hover-prefetch and the route's own
// lazy() import resolve to the exact same chunk (browser module cache dedupes
// the network fetch either way).
export const COMPONENT_IMPORTS = {
  DashboardHome: () => import('../pages/DashboardHome'),
  OverallDashboard: () => import('../pages/OverallDashboard'),
  ROASDashboard: () => import('../pages/ROASDashboard'),
  LeadQualityDashboard: () => import('../pages/LeadQualityDashboard'),
  ChannelMixDashboard: () => import('../pages/ChannelMixDashboard'),
  RevenueDashboard: () => import('../pages/RevenueDashboard'),
  OrganicSocialDashboard: () => import('../pages/OrganicSocialDashboard'),
  LeadQualificationDashboard: () => import('../pages/LeadQualificationDashboard'),
  HumanQLDetailDashboard: () => import('../pages/HumanQLDetailDashboard'),
  AIQLDetailDashboard: () => import('../pages/AIQLDetailDashboard'),
  HumanUnassignedDashboard: () => import('../pages/HumanUnassignedDashboard'),
  AIUnassignedDashboard: () => import('../pages/AIUnassignedDashboard'),
  FutworkErrorsDashboard: () => import('../pages/FutworkErrorsDashboard'),
  LeadQualificationSchemaDashboard: () => import('../pages/LeadQualificationSchemaDashboard'),
  WhatsAppDashboard: () => import('../pages/WhatsAppDashboard'),
  MTDDashboard: () => import('../pages/MTDDashboard'),
  MetaAdsDashboard: () => import('../pages/MetaAdsDashboard'),
  CreativeDownloaderDashboard: () => import('../pages/CreativeDownloaderDashboard'),
  LeverageCareersDashboard: () => import('../pages/LeverageCareersDashboard'),
  GoogleAdsDashboard: () => import('../pages/GoogleAdsDashboard'),
  BingAdsDashboard: () => import('../pages/BingAdsDashboard'),
  ReferralDashboard: () => import('../pages/ReferralDashboard'),
  LeadsAssignedDashboard: () => import('../pages/LeadsAssignedDashboard'),
  LeadSquaredDashboard: () => import('../pages/LeadSquaredDashboard'),
  TeamMappingDashboard: () => import('../pages/TeamMappingDashboard'),
  SuperTrackerDashboard: () => import('../pages/SuperTrackerDashboard'),
  AskAI: () => import('../pages/AskAI'),
  AgentsDashboard: () => import('../pages/AgentsDashboard'),
  MarketingPerformanceReport: () => import('../pages/MarketingPerformanceReport'),
  CeoB2CDashboard: () => import('../pages/CeoB2CDashboard'),
  SettingsPage: () => import('../pages/SettingsPage'),
}

// Route path (no query string) -> component key above.
const ROUTE_COMPONENT = {
  '/': 'DashboardHome',
  '/dashboard/overall': 'OverallDashboard',
  '/dashboard/overall-bigquery': 'OverallDashboard',
  '/dashboard/roas': 'ROASDashboard',
  '/dashboard/mtd': 'MTDDashboard',
  '/dashboard/lead-quality': 'LeadQualityDashboard',
  '/dashboard/channel-mix': 'ChannelMixDashboard',
  '/dashboard/revenue': 'RevenueDashboard',
  '/dashboard/organic-social': 'OrganicSocialDashboard',
  '/dashboard/lq-ops': 'LeadQualificationDashboard',
  '/dashboard/lq-ops-monthly': 'LeadQualificationDashboard',
  '/dashboard/lq-ops-detail': 'HumanQLDetailDashboard',
  '/dashboard/lq-ops-ai-detail': 'AIQLDetailDashboard',
  '/dashboard/lq-ops-human-unassigned': 'HumanUnassignedDashboard',
  '/dashboard/lq-ops-ai-unassigned': 'AIUnassignedDashboard',
  '/dashboard/futwork-errors': 'FutworkErrorsDashboard',
  '/dashboard/lq-field-schema': 'LeadQualificationSchemaDashboard',
  '/dashboard/referral': 'ReferralDashboard',
  '/dashboard/leads-assigned': 'LeadsAssignedDashboard',
  '/dashboard/leadsquared': 'LeadSquaredDashboard',
  '/dashboard/team-mapping': 'TeamMappingDashboard',
  '/dashboard/super-tracker': 'SuperTrackerDashboard',
  '/dashboard/whatsapp': 'WhatsAppDashboard',
  '/dashboard/meta-ads': 'MetaAdsDashboard',
  '/dashboard/creative-downloader': 'CreativeDownloaderDashboard',
  '/dashboard/leverage-careers': 'LeverageCareersDashboard',
  '/dashboard/google-ads': 'GoogleAdsDashboard',
  '/dashboard/bing-ads': 'BingAdsDashboard',
  '/ask-ai': 'AskAI',
  '/dashboard/agents': 'AgentsDashboard',
  '/dashboard/marketing-performance': 'MarketingPerformanceReport',
  '/dashboard/ceo-b2c-pnl': 'CeoB2CDashboard',
  '/dashboard/ceo-b2c-cashflow': 'CeoB2CDashboard',
  '/settings': 'SettingsPage',
  '/settings/reports/email': 'SettingsPage',
  '/settings/reports/slack': 'SettingsPage',
}

const warmed = new Set()

// Warm a single route's chunk (e.g. on sidebar hover/focus). Safe to call
// repeatedly — only fetches once per session.
export function prefetchRoute(path) {
  const base = (path || '').split('?')[0]
  const key = ROUTE_COMPONENT[base]
  if (!key || warmed.has(key)) return
  warmed.add(key)
  COMPONENT_IMPORTS[key]().catch(() => { warmed.delete(key) })
}

let allWarmed = false

// Warm every page chunk in the background (idle time) so most navigations
// never hit the Suspense fallback at all, even without a hover first.
export function prefetchAllRoutes() {
  if (allWarmed) return
  allWarmed = true
  Object.entries(COMPONENT_IMPORTS).forEach(([key, load]) => {
    if (warmed.has(key)) return
    warmed.add(key)
    load().catch(() => { warmed.delete(key) })
  })
}
