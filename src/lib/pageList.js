// Single source of truth for every real page in the app -- {id, label, path,
// adminOnly}. Lives here (not inline in Sidebar.jsx) so anything that only
// needs the DATA -- like App.jsx's route-guard fallback below -- doesn't have
// to import the whole Sidebar component tree (icons, styles, SnapshotTool,
// PresentationTool, ...) just to read a plain array. Sidebar.jsx re-exports
// this so every existing `import { PAGE_LIST } from '../components/Sidebar'`
// keeps working unchanged.
export const PAGE_LIST = [
  { id:'home',         label:'Summary',      path:'/',                      adminOnly:false },
  { id:'overall',      label:'Overall',      path:'/dashboard/overall',     adminOnly:false },
  // adminOnly:true here is a floor, not the real gate -- canSee()'s email check below
  // is what actually restricts this to Shivam alone, since nishant.bhatia is also
  // 'admin' and must NOT see it.
  { id:'overall_bigquery', label:'Overall (BigQuery)', path:'/dashboard/overall-bigquery', adminOnly:true },
  { id:'meta_ads',     label:'Meta Ads',     path:'/dashboard/meta-ads',    adminOnly:false },
  { id:'creative_downloader', label:'Creative Downloader', path:'/dashboard/creative-downloader', adminOnly:false },
  { id:'leverage_careers', label:'Leverage Careers', path:'/dashboard/leverage-careers', adminOnly:false },
  { id:'apps',         label:'Apps',         path:'/dashboard/apps',        adminOnly:false },
  { id:'google_ads',   label:'Google Ads',   path:'/dashboard/google-ads',  adminOnly:false },
  { id:'bing_ads',     label:'Bing Ads',     path:'/dashboard/bing-ads',   adminOnly:false },
  { id:'roas',         label:'ROAS',         path:'/dashboard/roas',        adminOnly:false },
  { id:'mtd',          label:'MTD',          path:'/dashboard/mtd',         adminOnly:false },
  { id:'lead_quality', label:'Lead Quality', path:'/dashboard/lead-quality',adminOnly:false },
  { id:'channel_mix',  label:'Channel Mix',  path:'/dashboard/channel-mix', adminOnly:false },
  { id:'revenue',      label:'Revenue',      path:'/dashboard/revenue',     adminOnly:false },
  { id:'organic_social', label:'Organic & Social', path:'/dashboard/organic-social', adminOnly:false },
  { id:'lq_ops',         label:'Daily QLs',    path:'/dashboard/lq-ops',          adminOnly:false },
  { id:'lq_ops_monthly', label:'Monthly QLs',  path:'/dashboard/lq-ops-monthly',  adminOnly:false },
  { id:'lq_ops_detail', label:'Human QL Detail', path:'/dashboard/lq-ops-detail', adminOnly:false },
  { id:'lq_ops_ai_detail', label:'AI QL Detail', path:'/dashboard/lq-ops-ai-detail', adminOnly:false },
  { id:'lq_ops_human_unassigned', label:'Human Unassigned', path:'/dashboard/lq-ops-human-unassigned', adminOnly:false },
  { id:'lq_ops_ai_unassigned', label:'AI Unassigned', path:'/dashboard/lq-ops-ai-unassigned', adminOnly:false },
  { id:'futwork_errors', label:'Futwork Errors', path:'/dashboard/futwork-errors', adminOnly:false },
  { id:'lq_field_schema', label:'Field Schema', path:'/dashboard/lq-field-schema', adminOnly:false },
  { id:'whatsapp',     label:'WhatsApp',     path:'/dashboard/whatsapp',    adminOnly:false },
  { id:'referral', label:'Referral', path:'/dashboard/referral', adminOnly:false },
  { id:'leads_assigned', label:'Leads Assigned', path:'/dashboard/leads-assigned', adminOnly:false },
  { id:'leadsquared', label:'LeadSquared', path:'/dashboard/leadsquared', adminOnly:false },
  { id:'team_mapping', label:'Team Mapping', path:'/dashboard/team-mapping', adminOnly:true },
  { id:'super_tracker', label:'Super Tracker', path:'/dashboard/super-tracker', adminOnly:true },
  { id:'ask_ai',         label:'Ask AI',      path:'/ask-ai',                  adminOnly:true  },
  { id:'agents',         label:'Agent Runs',  path:'/dashboard/agents',        adminOnly:true  },
  { id:'marketing_performance', label:'Marketing Performance', path:'/dashboard/marketing-performance', adminOnly:true },
  { id:'ceo_b2c_pnl', label:'Daily P&L', path:'/dashboard/ceo-b2c-pnl', adminOnly:true },
  { id:'ceo_b2c_cashflow', label:'Daily Cash Flow', path:'/dashboard/ceo-b2c-cashflow', adminOnly:true },
  { id:'settings',     label:'Settings',     path:'/settings',              adminOnly:true  },
]
