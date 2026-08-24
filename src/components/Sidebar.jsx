import React from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import styles from './Sidebar.module.css'
import SnapshotTool from './SnapshotTool'
import CalculatorTool from './CalculatorTool'
import { prefetchRoute } from '../lib/routePrefetch'
import { BRAND_LOGO_BARS, BRAND_LOGO_VIEWBOX, BRAND_LOGO_BASELINE } from '../../shared/brandLogo.mjs'
import { canAccessDashboard } from '../../shared/access.mjs'
import { toast } from './ToastHost'

// navKey on every expandable item is the STABLE identity for that nav group --
// expand/collapse state and parent-active highlighting key off it, never off the
// display label. Labels used to be the key, which meant renaming one silently
// broke the group's icon, its chevron and its active state with no error anywhere
// (this is exactly what happened when 'CEO B2C' was renamed to 'B2C'). Labels are
// display text now; change them freely.
//
// Exported so Settings > User Access can derive its page-visibility grouping
// from this exact same structure (single source of truth for the sidebar's
// parent -> sub-page hierarchy), instead of a second, hand-maintained mapping
// that could drift out of sync with the real nav.
export const NAV = [
  {
    label: 'Intelligence',
    items: [
      { to: '/ask-ai', icon: <AskAIIcon />, label: 'Ask AI', end: true },
      {
        to: '/dashboard/agents',
        navKey: 'agents',
        icon: <AgentsIcon />,
        label: 'Agents',
        defaultTo: '/dashboard/agents',
        end: false,
        subItems: [
          { to: '/dashboard/agents', label: 'Agent Runs', matchType: 'route' },
          { to: '/dashboard/marketing-performance', label: 'Marketing Performance', matchType: 'route' },
        ]
      },
    ]
  },
  {
    label: 'Overview',
    items: [
      { to: '/', icon: <HomeIcon />, label: 'Summary', end: true },
      { to: '/dashboard/overall', icon: <OverallIcon />, label: 'Overall', end: false },
      // Genuinely restricted to Shivam's own email, not just admin-only -- see
      // canSee()'s OVERALL_BIGQUERY_EMAILS check further down this file.
      { to: '/dashboard/overall-bigquery', icon: <OverallIcon />, label: 'Overall (BigQuery)', end: false },
      {
        to: '/dashboard/ceo-b2c-pnl',
        navKey: 'b2c',
        icon: <RevenueIcon />,
        label: 'B2C',
        defaultTo: '/dashboard/ceo-b2c-pnl',
        end: false,
        subItems: [
          { to: '/dashboard/ceo-b2c-pnl', label: 'Daily P&L', matchType: 'route' },
          { to: '/dashboard/ceo-b2c-cashflow', label: 'Daily Cash Flow', matchType: 'route' },
        ]
      },
    ]
  },
  {
    label: 'Analytics',
    items: [
      {
        to: '/dashboard/meta-ads',
        navKey: 'meta_ads',
        icon: <MetaIcon />,
        label: 'Meta Ads',
        defaultTo: '/dashboard/meta-ads?tab=campaigns',
        end: false,
        subItems: [
          { to: '/dashboard/meta-ads?tab=creatives', label: 'Creatives', matchType: 'query', tabKey: 'creatives' },
          { to: '/dashboard/meta-ads?tab=campaigns', label: 'Campaigns', matchType: 'query', tabKey: 'campaigns' },
          { to: '/dashboard/meta-ads?tab=mom', label: 'Month on Month', matchType: 'query', tabKey: 'mom' },
          { to: '/dashboard/meta-ads?tab=dod', label: 'Day on Day', matchType: 'query', tabKey: 'dod' },
        ]
      },
      { to: '/dashboard/leverage-careers', icon: <CareersIcon />, label: 'Leverage Careers', end: false },
      {
        to: '/dashboard/google-ads',
        navKey: 'google_ads',
        icon: <GoogleAdsIcon />,
        label: 'Google Ads',
        end: false,
        subItems: [
          { to: '/dashboard/google-ads?tab=campaigns',   label: 'Campaigns',    matchType: 'query', tabKey: 'campaigns' },
          { to: '/dashboard/google-ads?tab=ads',          label: 'Ads',          matchType: 'query', tabKey: 'ads' },
          { to: '/dashboard/google-ads?tab=keywords',    label: 'Keywords',     matchType: 'query', tabKey: 'keywords' },
          { to: '/dashboard/google-ads?tab=searchTerms', label: 'Search Terms', matchType: 'query', tabKey: 'searchTerms' },
          { to: '/dashboard/google-ads?tab=adGroups',   label: 'Ad Groups',    matchType: 'query', tabKey: 'adGroups' },
          { to: '/dashboard/google-ads?tab=conversions', label: 'Conversions',  matchType: 'query', tabKey: 'conversions' },
          { to: '/dashboard/google-ads?tab=devices',     label: 'Devices',      matchType: 'query', tabKey: 'devices' },
          { to: '/dashboard/google-ads?tab=geo',         label: 'Locations',    matchType: 'query', tabKey: 'geo' },
          { to: '/dashboard/google-ads?tab=audiences',   label: 'Audiences',    matchType: 'query', tabKey: 'audiences' },
          { to: '/dashboard/google-ads?tab=schedule',    label: 'Schedule',     matchType: 'query', tabKey: 'schedule' },
          { to: '/dashboard/google-ads?tab=assets',      label: 'Assets',       matchType: 'query', tabKey: 'assets' },
          { to: '/dashboard/google-ads?tab=mom', label: 'Month on Month', matchType: 'query', tabKey: 'mom' },{ to: '/dashboard/google-ads?tab=dod', label: 'Day on Day', matchType: 'query', tabKey: 'dod' },
        ]
      },
      { to: '/dashboard/bing-ads', icon: <BingAdsIcon />, label: 'Bing Ads', end: false },
      { to: '/dashboard/roas',         icon: <ChartIcon />,    label: 'ROAS',         end: false },
      { to: '/dashboard/mtd',          icon: <MTDIcon />,      label: 'MTD',          end: false },
      { to: '/dashboard/lead-quality', icon: <FunnelIcon />,   label: 'Lead Quality', end: false },
      { to: '/dashboard/channel-mix',  icon: <MixIcon />,      label: 'Channel Mix',  end: false },
      { to: '/dashboard/revenue',      icon: <RevenueIcon />,  label: 'Revenue',      end: false },
      {
        to: '/dashboard/lq-ops',
        navKey: 'ql_ops',
        icon: <PeopleIcon />,
        label: 'Lead Qualification',
        end: false,
        subItems: [
          { to: '/dashboard/lq-ops',         label: 'Daily QLs',   matchType: 'route' },
          { to: '/dashboard/lq-ops-monthly', label: 'Monthly QLs', matchType: 'route' },
          { to: '/dashboard/lq-ops-detail', label: 'Human QL Detail', matchType: 'route' },
          { to: '/dashboard/lq-ops-ai-detail', label: 'AI QL Detail', matchType: 'route' },
          { to: '/dashboard/lq-ops-human-unassigned', label: 'Human Unassigned', matchType: 'route' },
          { to: '/dashboard/lq-ops-ai-unassigned', label: 'AI Unassigned', matchType: 'route' },
          { to: '/dashboard/futwork-errors', label: 'Futwork Errors', matchType: 'route' },
          { to: '/dashboard/lq-field-schema', label: 'Field Schema', matchType: 'route' },
        ]
      },
      { to: '/dashboard/whatsapp',     icon: <WhatsAppIcon />, label: 'WhatsApp',     end: false },
      { to: '/dashboard/referral', icon: <ReferralIcon />, label: 'Referral', end: false },
      { to: '/dashboard/leads-assigned', icon: <LeadsAssignedIcon />, label: 'Leads Assigned', end: false },
      {
        to: '/dashboard/leadsquared',
        navKey: 'leadsquared',
        icon: <LeadSquaredIcon />,
        label: 'LeadSquared',
        defaultTo: '/dashboard/leadsquared?tab=leads',
        end: false,
        subItems: [
          { to: '/dashboard/leadsquared?tab=leads', label: 'Leads', matchType: 'query', tabKey: 'leads' },
          { to: '/dashboard/leadsquared?tab=activities', label: 'Activities', matchType: 'query', tabKey: 'activities' },
          { to: '/dashboard/leadsquared?tab=opportunities', label: 'Opportunities', matchType: 'query', tabKey: 'opportunities' },
        ]
      },
      { to: '/dashboard/team-mapping', icon: <TeamMappingIcon />, label: 'Team Mapping', end: false },
    ]
  },
]

// SINGLE SOURCE OF TRUTH for pages + access management.
// Add any new page here and it automatically appears in user-access management
// (and stays in sync with the sidebar id mapping). id must be stable (used for access enforcement).
export const PAGE_LIST = [
  { id:'home',         label:'Summary',      path:'/',                      adminOnly:false },
  { id:'overall',      label:'Overall',      path:'/dashboard/overall',     adminOnly:false },
  // adminOnly:true here is a floor, not the real gate -- canSee()'s email check below
  // is what actually restricts this to Shivam alone, since nishant.bhatia is also
  // 'admin' and must NOT see it.
  { id:'overall_bigquery', label:'Overall (BigQuery)', path:'/dashboard/overall-bigquery', adminOnly:true },
  { id:'meta_ads',     label:'Meta Ads',     path:'/dashboard/meta-ads',    adminOnly:false },
  { id:'leverage_careers', label:'Leverage Careers', path:'/dashboard/leverage-careers', adminOnly:false },
  { id:'google_ads',   label:'Google Ads',   path:'/dashboard/google-ads',  adminOnly:false },
  { id:'bing_ads',     label:'Bing Ads',     path:'/dashboard/bing-ads',   adminOnly:false },
  { id:'roas',         label:'ROAS',         path:'/dashboard/roas',        adminOnly:false },
  { id:'mtd',          label:'MTD',          path:'/dashboard/mtd',         adminOnly:false },
  { id:'lead_quality', label:'Lead Quality', path:'/dashboard/lead-quality',adminOnly:false },
  { id:'channel_mix',  label:'Channel Mix',  path:'/dashboard/channel-mix', adminOnly:false },
  { id:'revenue',      label:'Revenue',      path:'/dashboard/revenue',     adminOnly:false },
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
  { id:'ask_ai',         label:'Ask AI',      path:'/ask-ai',                  adminOnly:true  },
  { id:'agents',         label:'Agent Runs',  path:'/dashboard/agents',        adminOnly:true  },
  { id:'marketing_performance', label:'Marketing Performance', path:'/dashboard/marketing-performance', adminOnly:true },
  { id:'ceo_b2c_pnl', label:'Daily P&L', path:'/dashboard/ceo-b2c-pnl', adminOnly:true },
  { id:'ceo_b2c_cashflow', label:'Daily Cash Flow', path:'/dashboard/ceo-b2c-cashflow', adminOnly:true },
  { id:'settings',     label:'Settings',     path:'/settings',              adminOnly:true  },
]

function HomeIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> }
function OverallIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg> }
function ChartIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> }
function FunnelIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 3H2l8 9.46V19l4 2V12.46L22 3z"/></svg> }
function MTDIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> }
function MixIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> }
function WhatsAppIcon(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg> }
function ReferralIcon(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg> }
function LeadsAssignedIcon(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 14l2 2 4-4"/></svg> }
function PeopleIcon(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> }
// Rupee, not dollar -- every figure behind Revenue and the B2C page is INR.
function RevenueIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12"/><path d="M6 8h12"/><path d="m6 13 8.5 8"/><path d="M6 13h3"/><path d="M9 13c6.667 0 6.667-10 0-10"/></svg> }
function MetaIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg> }
// Leverage Careers -- a briefcase, distinct from the generic MetaIcon glyph
// used for the main Meta Ads account since this is a separate ad account.
function CareersIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><line x1="2" y1="13" x2="22" y2="13"/></svg> }
function SettingsIcon(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg> }
function AskAIIcon() { return (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ animation: 'askAiPulse 2.6s ease-in-out infinite', transformOrigin: 'center' }}><defs><linearGradient id="askAiGrad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop offset="0%" stopColor="#1F3C84"/><stop offset="45%" stopColor="#1C9FD4"/><stop offset="75%" stopColor="#29B9C3"/><stop offset="100%" stopColor="#4CAE6F"/></linearGradient></defs><path d="M12 2.2c.5 3.7 2.1 5.3 5.8 5.8-3.7.5-5.3 2.1-5.8 5.8-.5-3.7-2.1-5.3-5.8-5.8C9.9 7.5 11.5 5.9 12 2.2Z" fill="url(#askAiGrad)"/><path d="M18.5 14c.25 1.85 1.05 2.65 2.9 2.9-1.85.25-2.65 1.05-2.9 2.9-.25-1.85-1.05-2.65-2.9-2.9 1.85-.25 2.65-1.05 2.9-2.9Z" fill="#29B9C3" style={{ animation: 'askAiTwinkle 1.8s ease-in-out infinite', transformOrigin: '18.5px 16.9px' }}/></svg>); }
// Agents was a boxy robot head -- the 2015 chatbot cliche. This is the modern read
// of the same idea: an autonomous node. A brand-gradient hexagon (navy -> blue ->
// cyan, the same ramp Ask AI's spark uses) with a lit core and one satellite on a
// tilted orbit. Gradient rather than currentColor on purpose, exactly like
// AskAIIcon -- the two intelligence entries are the only colour in this sidebar,
// which is what makes them read as the smart ones.
function AgentsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <defs>
        <linearGradient id="agentsGrad" x1="5" y1="3" x2="19" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1F3C84" />
          <stop offset="55%" stopColor="#1C9FD4" />
          <stop offset="100%" stopColor="#29B9C3" />
        </linearGradient>
      </defs>
      <ellipse cx="12" cy="10.75" rx="9.4" ry="4.5" transform="rotate(-30 12 10.75)" stroke="#29B9C3" strokeWidth="1.2" opacity="0.45" />
      <path d="M12 4.9 17 7.8v5.9L12 16.6 7 13.7V7.8L12 4.9Z" fill="url(#agentsGrad)" />
      <circle cx="12" cy="10.75" r="1.85" fill="#fff" opacity="0.95" />
      <circle cx="20.1" cy="6.05" r="1.7" fill="#4CAE6F" />
    </svg>
  )
}
// Real LeadSquared brand mark (two-tone step shape, from the user's own downloaded SVG) --
// used as the sidebar nav icon for the new LeadSquared page.
function LeadSquaredIcon() { return <svg width="14" height="14" viewBox="0 0 136.6 137.9"><polygon fill="#0C9AFC" points="0,0 0,68.5 68.6,68.5 68.6,137.9 136.6,137.9 136.6,0"/><polygon fill="#0C293D" points="68.6,137.9 0,137.9 0,68.5"/></svg> }
// Org-chart glyph (three people, one linked above the other two) -- distinct
// from LeadSquaredIcon's brand mark since this page is Quantum's own manual
// mapping layer, not another LeadSquared-native view.
function TeamMappingIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="2.4"/><path d="M12 7.4V12"/><circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="18" r="2.4"/><path d="M12 12 6 15.8M12 12l6 3.8"/></svg> }
function OpportunityIcon(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M2 12h20"/><circle cx="12" cy="12" r="9"/></svg> }
// Daily P&L -- a statement (document with ruled lines), distinct from the plain
// document-agnostic RevenueIcon used for the parent nav row.
function PnLIcon(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg> }
// Daily Cash Flow -- money actually moving (two opposing arrows), distinct from
// the accrual/ledger framing of PnLIcon.
function CashFlowIcon(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3v6h-6"/><path d="M17 9a8 8 0 00-14 4"/><path d="M7 21v-6h6"/><path d="M7 15a8 8 0 0014-4"/></svg> }
// Futwork Errors -- a broken-link / integration-fault glyph (chain link with a gap and
// a bolt), distinct from PeopleIcon/BotIcon used for the QL Ops volume pages.
function FutworkErrorIcon(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.5 13.5L8 16a3 3 0 01-4.24-4.24l3-3a3 3 0 014.13-.1"/><path d="M13.5 10.5L16 8a3 3 0 014.24 4.24l-3 3a3 3 0 01-4.13.1"/><path d="M11.5 12.5l1-1"/></svg> }
// Field Schema -- a table/grid glyph, distinct from the funnel/bot icons used by the
// other QL Ops sub-items, since this page is a reference table, not a metrics view.
function FieldSchemaIcon(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="9" y1="10" x2="9" y2="20"/></svg> }

const ICON_MAP = {
  'Summary': <HomeIcon/>, 'Overall': <OverallIcon/>, 'Overall (BigQuery)': <OverallIcon/>, 'ROAS': <ChartIcon/>, 'MTD': <MTDIcon/>,
  'Lead Quality': <FunnelIcon/>, 'Channel Mix': <MixIcon/>,
  'Revenue': <RevenueIcon/>, 'B2C': <RevenueIcon/>, 'Meta Ads': <MetaIcon/>, 'Leverage Careers': <CareersIcon/>,
  'Google Ads': <GoogleAdsIcon/>, 'Lead Qualification': <PeopleIcon/>, 'Daily QLs': <PeopleIcon/>, 'Monthly QLs': <MTDIcon/>,
  'Human QL Detail': <FunnelIcon/>,
  'AI QL Detail': <BotIcon/>,
  'Human Unassigned': <PeopleIcon/>,
  'AI Unassigned': <BotIcon/>,
  'Futwork Errors': <FutworkErrorIcon/>,
  'Field Schema': <FieldSchemaIcon/>,
  'Bing Ads': <BingAdsIcon/>,
  'Referral': <ReferralIcon/>, 'Leads Assigned': <LeadsAssignedIcon/>,
  'WhatsApp': <WhatsAppIcon/>,
  'Ask AI': <AskAIIcon/>, 'Settings': <SettingsIcon/>, 'Agents': <AgentsIcon/>,
  'Agent Runs': <AgentsIcon/>, 'Marketing Performance': <ChartIcon/>,
  // Meta Ads / Google Ads sub-items (flyout menu icons)
  'Creatives': <ImageIcon/>, 'Campaigns': <TargetIcon/>, 'Ads': <MegaphoneIcon/>,
  'Keywords': <TagIcon/>, 'Search Terms': <SearchIcon/>, 'Ad Groups': <LayersIcon/>,
  'Conversions': <CheckCircleIcon/>, 'Devices': <DeviceIcon/>, 'Locations': <PinIcon/>,
  'Audiences': <PeopleIcon/>, 'Schedule': <ClockIcon/>, 'Assets': <FolderIcon/>,
  'Month on Month': <ChartIcon/>, 'Day on Day': <DayIcon/>,
  'LeadSquared': <LeadSquaredIcon/>, 'Team Mapping': <TeamMappingIcon/>,
  'Leads': <PeopleIcon/>, 'Activities': <ClockIcon/>, 'Opportunities': <OpportunityIcon/>,
  'Daily P&L': <PnLIcon/>, 'Daily Cash Flow': <CashFlowIcon/>,
}
function GoogleAdsIcon(){
  return <svg width='16' height='16' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M21.35 11.1H12.18V13.83H18.69C18.36 17.64 15.19 19.27 12.19 19.27C8.36 19.27 5 16.25 5 12C5 7.9 8.2 4.73 12.2 4.73C15.29 4.73 17.1 6.7 17.1 6.7L19 4.72C19 4.72 16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12C2.03 17.05 6.16 22 12.25 22C17.6 22 21.5 18.33 21.5 12.91C21.5 11.76 21.35 11.1 21.35 11.1Z' fill='currentColor'/></svg>
}
function ImageIcon(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg> }
function TargetIcon(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg> }
function MegaphoneIcon(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11v3a1 1 0 001 1h2l4 4V6l-4 4H4a1 1 0 00-1 1z"/><path d="M14 8a4 4 0 010 8"/><path d="M17.5 5.5a8 8 0 010 13"/></svg> }
function TagIcon(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41L11 22l-9-9V4a1 1 0 011-1h9l8.59 8.59a2 2 0 010 2.82z"/><circle cx="7" cy="7" r="1.2" fill="currentColor" stroke="none"/></svg> }
function SearchIcon(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> }
function LayersIcon(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg> }
function CheckCircleIcon(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> }
function DeviceIcon(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg> }
function PinIcon(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg> }
function ClockIcon(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> }
function FolderIcon(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg> }
function BotIcon(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg> }
function DayIcon(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><rect x="15" y="13" width="3" height="3" fill="currentColor" stroke="none"/></svg> }
function BingAdsIcon(){
  return <svg width='16' height='16' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M6 3l4 1.4V16l4.2-2.4-1.9-.8-1.3-3.3L16 11l3 1.7-9 5.3-4-2.3V3z' fill='currentColor'/></svg>
}

export default function Sidebar() {
  const { user, logout, hiddenPages, prefsReady } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [collapsed, setCollapsed] = React.useState(() => {
    if (typeof window !== 'undefined' && window.innerWidth <= 1024) return true
    try { return localStorage.getItem('lq_sidebar_collapsed') === 'true' } catch { return false }
  })
  const [mobileOpen, setMobileOpen] = React.useState(false)
  // hiddenPages/prefsReady now live in AuthProvider (useAuth.jsx) so the /api/preferences
  // fetch runs in parallel with the auth check from the true app root, instead of only
  // starting once Sidebar itself mounts (which is gated behind ProtectedRoute's auth
  // loading gate -- serializing the two fetches and roughly doubling the wait). Nav
  // items are still only rendered once prefsReady is true -- see isPageVisible below --
  // that's the actual fix for the flash-of-hidden-pages bug; this just makes it fast too.

  React.useEffect(() => {
    const onSidebarMode = (e) => {
      if (e.detail && e.detail.collapsed !== undefined) {
        setCollapsed(e.detail.collapsed)
      }
    }
    window.addEventListener('lq:sidebar-mode-changed', onSidebarMode)
    return () => window.removeEventListener('lq:sidebar-mode-changed', onSidebarMode)
  }, [])
  const isPageVisible = (label) => {
    if (!prefsReady) return false
    const pageId = idMap[label]
    return !pageId || !hiddenPages.includes(pageId)
  }
  React.useEffect(() => {
    const mq = window.matchMedia('(max-width: 1024px)')
    const handler = (e) => { if (e.matches) setCollapsed(true) }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // A nav group is "active" when the current route is one of its own sub-items --
  // derived straight from the subItems each group already declares, rather than
  // from six separately hand-maintained path lists that had to be updated in
  // lockstep whenever a sub-page was added. Route groups match the exact path;
  // query-tab groups (whose subItems are ?tab= links on one shared page) match
  // that shared base path.
  const parentActiveFor = React.useCallback((item) => (item.subItems || []).some(sub => (
    sub.matchType === 'route'
      ? location.pathname === sub.to
      : location.pathname.startsWith(sub.to.split('?')[0])
  )), [location.pathname])

  // One map keyed by navKey, replacing six near-identical useState/useEffect pairs
  // and the two six-branch ternaries that looked groups up by display label.
  // Adding a nav group now needs no changes in this component at all.
  const activeParentKey = React.useMemo(() => {
    for (const group of NAV) {
      for (const item of group.items) {
        if (item.subItems && parentActiveFor(item)) return item.navKey
      }
    }
    return null
  }, [parentActiveFor])

  const [expandedKeys, setExpandedKeys] = React.useState(() => activeParentKey ? { [activeParentKey]: true } : {})
  // Navigating into a group opens it. Groups are never force-closed, so one the
  // user opened by hand stays open -- same behaviour as the old per-group effects.
  React.useEffect(() => {
    if (activeParentKey) setExpandedKeys(prev => (prev[activeParentKey] ? prev : { ...prev, [activeParentKey]: true }))
  }, [activeParentKey])

  const isExpanded = (item) => !!expandedKeys[item.navKey]
  const toggleExpanded = (item) => setExpandedKeys(prev => ({ ...prev, [item.navKey]: !prev[item.navKey] }))

  const handleLogout = () => { logout(); }

  const userRole = user?.role || 'viewer'
  const isViewerRole = userRole !== 'admin'

  function canSee(id) {
    // Auth still loading -- show nothing rather than falling back to the permissive
    // default 'viewer' role, which would briefly grant every dashboard (including ones
    // a restricted custom-viewer account was never actually given) until the real
    // role loads a moment later. This guard is nav-specific, which is why it stays
    // here rather than moving into the shared rule.
    if (!user) return false
    // Every actual rule (settings, the overall_bigquery email restriction, admin,
    // plain viewer, viewer:/custom: grants, legacy roles, fail-safe default) comes
    // from shared/access.mjs -- the same function the route guard and the server-side
    // API gate use, so nav visibility can no longer disagree with either of them.
    return canAccessDashboard(userRole, id, user?.email)
  }

  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : user?.email?.[0]?.toUpperCase() || 'LQ'

  // PAGE_LIST is module-level and never changes, so this join is built once for the
  // lifetime of the app rather than on every render (Sidebar re-renders on every
  // navigation).
  const idMap = React.useMemo(() => Object.fromEntries(PAGE_LIST.map(p => [p.label, p.id])), [])

  // Nav parents whose subItems are real, separately-access-controlled pages (matchType
  // 'route', e.g. QL Ops's Daily/Monthly/Human-Detail/AI-Detail) don't have their own
  // PAGE_LIST entry -- idMap[item.label] is undefined for them, which canSee() would
  // treat as "not granted" for any custom viewer:... role, hiding the whole group no
  // matter which sub-pages were actually granted. (Meta Ads/Google Ads are unaffected --
  // their subItems are matchType 'query' tabs on one shared page, and the parent label
  // itself IS a real PAGE_LIST id.) Visible if the user can see at least one sub-page.
  const isRouteGroup = item => item.subItems && item.subItems.every(s => s.matchType === 'route')
  const subVisible = sub => canSee(idMap[sub.label]) && isPageVisible(sub.label)
  // The parent row's own click/hover target when there's no explicit defaultTo (route
  // groups like QL Ops, where every sub-item is its own real, separately-gated page --
  // unlike Meta Ads/Google Ads/Agents/B2C/LeadSquared, whose subItems are matchType
  // 'query' tabs on one shared page and always carry a defaultTo). Falling back to a
  // hardcoded subItems[0] here sent a user granted only e.g. Human/AI QL Detail (not
  // Daily QLs) to a page they don't have access to the instant they clicked "QL Ops"
  // itself -- ProtectedRoute correctly bounced them back to Home, but from the user's
  // side that just looked like "QL Ops doesn't work at all", even though every one of
  // their actually-granted sub-pages loads fine once reached directly.
  const firstReachableSubTo = item => (item.subItems.find(subVisible) || item.subItems[0]).to
  const groupVisible = item => isRouteGroup(item)
    ? item.subItems.some(subVisible)
    : canSee(idMap[item.label]) && isPageVisible(item.label)

  const currentTab = new URLSearchParams(location.search).get('tab') || 'campaigns'

  const isSubActive = (sub) => {
    if (sub.matchType === 'route') return location.pathname === sub.to
    return location.pathname.startsWith(sub.to.split('?')[0]) && currentTab === sub.tabKey
  }

  // Collapsed-rail flyout: hovering a parent item with subItems opens a fixed-position
  // panel listing its sub-pages, since the icon-only rail has no room to show them inline.
  const [flyout, setFlyout] = React.useState(null)
  const flyoutCloseTimer = React.useRef(null)

  const openFlyout = (item, el) => {
    if (flyoutCloseTimer.current) { clearTimeout(flyoutCloseTimer.current); flyoutCloseTimer.current = null }
    const rect = el.getBoundingClientRect()
    const visibleSubItems = item.subItems.filter(sub => sub.matchType !== 'route' || subVisible(sub))
    setFlyout({ label: item.label, subItems: visibleSubItems, top: rect.top, centerY: rect.top + rect.height / 2 })
  }
  const scheduleCloseFlyout = () => {
    if (flyoutCloseTimer.current) clearTimeout(flyoutCloseTimer.current)
    flyoutCloseTimer.current = setTimeout(() => setFlyout(null), 150)
  }
  const cancelCloseFlyout = () => {
    if (flyoutCloseTimer.current) { clearTimeout(flyoutCloseTimer.current); flyoutCloseTimer.current = null }
  }
  // The collapsed rail's flyout was hover-only -- onMouseEnter/onMouseLeave with no
  // focus or keyboard path -- so a keyboard user with the sidebar collapsed could
  // not reach ANY sub-page at all. It now opens on focus too, and Escape closes it.
  React.useEffect(() => {
    if (!flyout) return
    const onKey = (e) => { if (e.key === 'Escape') setFlyout(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flyout])

  // Right-click "hide from sidebar" -- admin only, writes to the EXACT SAME
  // app_preferences.hidden_pages key Settings > User Access > Global Page
  // Visibility already uses (same POST /api/preferences call, same localStorage
  // + same-tab event sync it already dispatches). Not a second, parallel hiding
  // mechanism -- just a faster entry point to the one real switch, which is why
  // this introduces no new loophole: the server independently requires
  // role==='admin' on that endpoint (api/preferences.mjs), and the actual
  // page-blocking for non-admins (App.jsx's ProtectedRoute) already reads this
  // same hiddenPages list regardless of which UI wrote to it.
  const [hideMenu, setHideMenu] = React.useState(null) // { id, label, x, y } | null
  const [hidePending, setHidePending] = React.useState(false)

  const openHideMenu = (e, id, label) => {
    if (userRole !== 'admin' || !id) return // no id (query-tab sub-item, route-group
    e.preventDefault()                      // parent row) -- let the native menu show
    e.stopPropagation()
    setHideMenu({ id, label, x: e.clientX, y: e.clientY })
  }
  const closeHideMenu = () => setHideMenu(null)

  const toggleHiddenPage = async () => {
    if (!hideMenu) return
    const { id, label } = hideMenu
    const willHide = !hiddenPages.includes(id)
    const next = willHide ? [...hiddenPages, id] : hiddenPages.filter(x => x !== id)
    setHideMenu(null)
    setHidePending(true)
    try {
      const r = await fetch('/api/preferences', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'hidden_pages', value: next }),
      })
      if (!r.ok) throw new Error('save failed')
      localStorage.setItem('lq_hidden_pages', JSON.stringify(next))
      window.dispatchEvent(new CustomEvent('lq:hidden-pages-changed', { detail: next }))
      toast(willHide ? `${label} hidden from the sidebar for everyone` : `${label} is visible again`, { type: willHide ? 'muted' : 'success' })
    } catch (e) {
      toast(`Could not update ${label} — try again`, { type: 'neutral' })
    } finally {
      setHidePending(false)
    }
  }

  const hideMenuPopup = hideMenu && (
    <>
      <div className={styles.hideMenuBackdrop} onClick={closeHideMenu} onContextMenu={e => { e.preventDefault(); closeHideMenu() }} />
      <div className={styles.hideMenu} style={{ top: hideMenu.y, left: hideMenu.x }}>
        <button className={styles.hideMenuItem} onClick={toggleHiddenPage} disabled={hidePending}>
          {hiddenPages.includes(hideMenu.id) ? 'Show in sidebar' : 'Hide from sidebar (for everyone)'}
        </button>
      </div>
    </>
  )

  // Shared body for the expanded sidebar, so the true expanded render and any
  // future variant never drift out of sync -- edit the nav/footer once.
  function renderNavBody() {
    return (
      <>
      <div className={styles.logoArea}>
        <div className={styles.logoPill}>
          <img src="https://publicassets.leverageedu.com/landing-pages-new/logo-dark.svg" alt="Leverage Edu" className={styles.logoImg}/>
        </div>
        <div className={styles.dividerLine}/>
        <div className={styles.quantumLabel}>
          <svg width="19" height="19" viewBox={BRAND_LOGO_VIEWBOX} fill="none" style={{overflow:'visible'}}>
            {BRAND_LOGO_BARS.map((b,i)=>(
              <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx="1.5" fill={b.color} style={{transformOrigin:`${b.x}px ${BRAND_LOGO_BASELINE}px`,animation:`barGrow 0.6s cubic-bezier(0.34,1.56,0.64,1) ${0.1*(i+1)}s both`}}/>
            ))}
          </svg>
          <span>QUANTUM</span>
        </div>
      </div>

      <nav className={styles.nav}>
        {NAV.map(group => {
          // Computed once per group. This used to run groupVisible() over every
          // item twice -- once for the is-it-empty check, once for the map -- and
          // groupVisible walks subItems and re-evaluates the access rules each time.
          const visibleItems = group.items.filter(groupVisible)
          if (visibleItems.length === 0) return null
          return (
          <div key={group.label} className={styles.group}>
            {group.label !== 'Intelligence' && <p className={styles.groupLabel}>{group.label}</p>}
            {visibleItems.map(item => {
              if (item.subItems) {
                const parentActive = parentActiveFor(item)
                return (
                  <div key={item.label}>
                    <button
                      className={`${styles.navItem} ${parentActive ? styles.active : ''}`}
                      aria-expanded={isExpanded(item)}
                      aria-controls={`lq-subnav-${item.navKey}`}
                      onClick={() => { toggleExpanded(item); if (!parentActive) navigate(item.defaultTo || firstReachableSubTo(item)) }}
                      onContextMenu={!isRouteGroup(item) ? (e) => openHideMenu(e, idMap[item.label], item.label) : undefined}
                      onMouseEnter={()=>prefetchRoute(item.defaultTo || firstReachableSubTo(item))} onFocus={()=>prefetchRoute(item.defaultTo || firstReachableSubTo(item))}
                      style={{width:'100%',textAlign:'left',background:'none',border:'none',cursor:'pointer',font:'inherit'}}>
                      <span className={styles.navIcon} aria-hidden="true">{item.icon}</span>
                      <span style={{flex:1}}>{item.label}</span>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                        aria-hidden="true"
                        style={{transform: isExpanded(item) ? 'rotate(180deg)' : 'none', transition:'transform .2s', opacity:.4}}>
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </button>
                    {isExpanded(item) && (
                      <div className={styles.subNav} id={`lq-subnav-${item.navKey}`} role="group" aria-label={item.label}>
                        {item.subItems.filter(sub => sub.matchType !== 'route' || subVisible(sub)).map(sub => (
                          <button key={sub.label}
                            className={`${styles.subNavItem} ${isSubActive(sub) ? styles.subNavActive : ''}`}
                            onClick={() => navigate(sub.to)}
                            onContextMenu={(e) => openHideMenu(e, idMap[sub.label], sub.label)}
                            onMouseEnter={()=>prefetchRoute(sub.to)} onFocus={()=>prefetchRoute(sub.to)}
                            style={{width:'100%',textAlign:'left',background:'none',border:'none',cursor:'pointer',font:'inherit'}}>
                            <span style={{width:5,height:5,borderRadius:'50%',background:isSubActive(sub)?'#1F3C84':'#D1D5DB',flexShrink:0,display:'inline-block'}}/>
                            <span>{sub.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              }
              return (
                <NavLink key={item.label} to={item.to} end={item.end}
                  onMouseEnter={()=>prefetchRoute(item.to)} onFocus={()=>prefetchRoute(item.to)}
                  onContextMenu={(e) => openHideMenu(e, idMap[item.label], item.label)}
                  className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}>
                  <span className={styles.navIcon}>{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              )
            })}
          </div>
          )
        })}
      </nav>




      <div className={styles.userArea}>
        <div className={styles.avatar}>
          {user?.picture ? <img src={user.picture} alt={user.name}/> : initials}
          <span className={styles.statusDot} aria-hidden="true" />
        </div>
        <div className={styles.userInfo}>
          <div className={styles.userMeta}>
            <p className={styles.userName}>{user?.name?.split(' ')[0] || 'User'}</p>
            <NavLink
              to="/settings?tab=profile"
              title="View profile"
              className={`${styles.roleBadge} ${userRole==='admin' ? styles.roleBadgeAdmin : styles.roleBadgeViewer}`}
            >
              {userRole==='admin' ? 'Admin' : 'Viewer'}
            </NavLink>
          </div>
          <p className={styles.userEmail}>{user?.email}</p>
        </div>
        {canSee('settings') && (
          <NavLink to="/settings" title="Settings"
            onMouseEnter={()=>prefetchRoute('/settings')} onFocus={()=>prefetchRoute('/settings')}
            className={({ isActive }) => `${styles.gearBtn}${isActive ? ' '+styles.gearBtnActive : ''}`}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>
          </NavLink>
        )}
        <span className={styles.footDivider} aria-hidden="true" />
        <button onClick={handleLogout} className={styles.logoutBtn} title="Sign out">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
          </svg>
        </button>
      </div>
      </>
    )
  }

  if (collapsed) {
    return (
      <>
      <div className="lq-mobile-topbar" style={{display:'none',position:'fixed',top:0,left:0,right:0,zIndex:1000,height:52,background:'var(--sidebar-bg)',borderBottom:'0.5px solid var(--card-border)',alignItems:'center',justifyContent:'space-between',padding:'0 16px'}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <svg width="20" height="20" viewBox={BRAND_LOGO_VIEWBOX} fill="none">{BRAND_LOGO_BARS.map((b,i)=><rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx="1.5" fill={b.color}/>)}</svg>
          <span style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:11,fontWeight:700,color:'#1C9FD4',letterSpacing:'2px',textTransform:'uppercase'}}>QUANTUM</span>
        </div>
        <button onClick={()=>setMobileOpen(o=>!o)} style={{background:'none',border:'none',cursor:'pointer',padding:6,color:'var(--text2)',display:'flex',alignItems:'center'}}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
      </div>
      {mobileOpen && (
        <div style={{position:'fixed',inset:0,zIndex:999,display:'flex'}} onClick={()=>setMobileOpen(false)}>
          <div style={{width:260,height:'100%',background:'var(--sidebar-bg)',borderRight:'0.5px solid var(--card-border)',overflowY:'auto',display:'flex',flexDirection:'column',paddingTop:'calc(52px + env(safe-area-inset-top))'}} onClick={e=>e.stopPropagation()}>
            <div style={{flex:1}}>
            {NAV.map(group=>{
              const vis = group.items.filter(groupVisible)
              if (!vis.length) return null
              return (
              <div key={group.label} style={{marginBottom:8,padding:'0 10px'}}>
                {group.label !== 'Intelligence' && (
                  <div style={{fontSize:11,fontWeight:700,color:'var(--text2)',letterSpacing:'0.09em',textTransform:'uppercase',padding:'12px 6px 4px'}}>{group.label}</div>
                )}
                {vis.map(item=>{
                  const parentActive = item.subItems ? parentActiveFor(item) : location.pathname === item.to
                  return (
                  <div key={item.to}>
                    <button type="button"
                      onClick={()=>{ navigate(item.defaultTo || (item.subItems ? firstReachableSubTo(item) : item.to)); setMobileOpen(false) }}
                      onTouchStart={()=>prefetchRoute(item.defaultTo || item.to)}
                      aria-current={parentActive ? 'page' : undefined}
                      style={{display:'flex',alignItems:'center',gap:10,width:'100%',minHeight:44,padding:'11px 10px',borderRadius:10,border:'none',textAlign:'left',cursor:'pointer',
                        background: parentActive ? 'linear-gradient(90deg, rgba(28,159,212,0.10), rgba(31,60,132,0.06))' : 'none',
                        color: parentActive ? 'var(--brand-ink)' : 'var(--text2)',
                        fontSize:14.5,fontWeight: parentActive ? 750 : 650,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
                      <span style={{display:'flex',flexShrink:0}} aria-hidden="true">{item.icon}</span>{item.label}
                    </button>
                    {/* Sub-pages were simply absent on mobile before this: the drawer
                        rendered only item.label, so Daily P&L, Daily Cash Flow, the QL
                        Ops detail pages, the Meta/Google tabs and everything else behind
                        a group were unreachable on a phone entirely. */}
                    {item.subItems && parentActive && (
                      <div style={{display:'flex',flexDirection:'column',gap:2,margin:'2px 0 6px 30px'}}>
                        {item.subItems.filter(sub => sub.matchType !== 'route' || subVisible(sub)).map(sub=>(
                          <button key={sub.to} type="button"
                            onClick={()=>{ navigate(sub.to); setMobileOpen(false) }}
                            onTouchStart={()=>prefetchRoute(sub.to)}
                            aria-current={isSubActive(sub) ? 'page' : undefined}
                            style={{display:'flex',alignItems:'center',gap:8,width:'100%',minHeight:40,padding:'9px 10px',borderRadius:8,border:'none',textAlign:'left',cursor:'pointer',
                              background: isSubActive(sub) ? '#E8EFF9' : 'none',
                              color: isSubActive(sub) ? 'var(--brand-ink)' : 'var(--text3)',
                              fontSize:14,fontWeight: isSubActive(sub) ? 600 : 500,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
                            <span style={{width:5,height:5,borderRadius:'50%',flexShrink:0,background:isSubActive(sub)?'#1F3C84':'#D1D5DB'}} aria-hidden="true"/>
                            {sub.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )})}
              </div>
            )})}
            </div>
            {/* Settings and Sign out existed only in the desktop footer, so there
                was no way to reach either from a phone. */}
            <div style={{borderTop:'1px solid var(--card-border)',padding:'8px 10px calc(10px + env(safe-area-inset-bottom))',display:'flex',flexDirection:'column',gap:2}}>
              {canSee('settings') && (
                <button type="button" onClick={()=>{ navigate('/settings'); setMobileOpen(false) }}
                  style={{display:'flex',alignItems:'center',gap:10,width:'100%',minHeight:44,padding:'11px 10px',borderRadius:10,border:'none',background:'none',textAlign:'left',cursor:'pointer',color:'var(--text2)',fontSize:14.5,fontWeight:650,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
                  <span style={{display:'flex',flexShrink:0}} aria-hidden="true"><SettingsIcon/></span>Settings
                </button>
              )}
              <button type="button" onClick={handleLogout}
                style={{display:'flex',alignItems:'center',gap:10,width:'100%',minHeight:44,padding:'11px 10px',borderRadius:10,border:'none',background:'none',textAlign:'left',cursor:'pointer',color:'var(--text2)',fontSize:14.5,fontWeight:650,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
                <span style={{display:'flex',flexShrink:0}} aria-hidden="true">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                </span>Sign out
              </button>
            </div>
          </div>
          <div style={{flex:1,background:'rgba(0,0,0,0.3)'}}/>
        </div>
      )}
      <aside className={styles.sidebarCollapsed}>
        {/* Quantum logo mark — visible when collapsed. Centred 44px tile, matching
            the 40px nav tiles below it. */}
        <div style={{
          height: 58, display:'flex', alignItems:'center', justifyContent:'center',
          flexShrink: 0, borderBottom: '0.5px solid var(--card-border)', width:'100%'
        }}>
          <div style={{
            width:44, height:44, borderRadius:11, background:'var(--card)',
            border:'0.5px solid var(--card-border)', boxShadow:'0 1px 3px rgba(15,23,42,0.06)',
            display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0
          }}>
            <svg width="24" height="24" viewBox={BRAND_LOGO_VIEWBOX} fill="none">
              {BRAND_LOGO_BARS.map((b,i)=><rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx="1.5" fill={b.color}/>)}
            </svg>
          </div>
        </div>
        <div className={styles.collapsedNav}>
          {NAV.map(group => group.items.filter(item => groupVisible(item)).map(item => (
            item.subItems ? (
              <div key={item.label} style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}
                onMouseEnter={(e) => openFlyout(item, e.currentTarget)}
                onMouseLeave={scheduleCloseFlyout}
                // Only close when focus actually leaves this item -- moving into the
                // flyout itself must not dismiss it.
                onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) scheduleCloseFlyout() }}>
                {/* openFlyout sits on the NavLink, not the wrapper: the NavLink is the
                    element that actually receives focus, and putting it on the wrapper
                    (relying on the focus event bubbling up) did not fire at all -- verified
                    live, the flyout never opened for a keyboard user. Positioning still
                    uses the wrapper's rect so focus and hover open it in the same place. */}
                <NavLink to={item.defaultTo || firstReachableSubTo(item)} end={item.end}
                  onFocus={(e)=>{ openFlyout(item, e.currentTarget.parentElement); prefetchRoute(item.defaultTo || firstReachableSubTo(item)) }}
                  onContextMenu={!isRouteGroup(item) ? (e) => openHideMenu(e, idMap[item.label], item.label) : undefined}
                  className={`${styles.collapsedItem} ${parentActiveFor(item) ? styles.collapsedActive : ''}`}
                  title={item.label}>
                  {item.icon}
                </NavLink>
              </div>
            ) : (
              <NavLink key={item.label} to={item.to} end={item.end}
                onMouseEnter={()=>prefetchRoute(item.defaultTo || item.to)} onFocus={()=>prefetchRoute(item.defaultTo || item.to)}
                onContextMenu={(e) => openHideMenu(e, idMap[item.label], item.label)}
                className={({ isActive }) => `${styles.collapsedItem} ${isActive ? styles.collapsedActive : ''}`}
                title={item.label}>
                {item.icon}
              </NavLink>
            )
          )))}
        </div>
        {flyout && (() => {
          const panelTop = Math.min(flyout.top, window.innerHeight - 16 - flyout.subItems.length * 44 - 48)
          return (
          <div className={styles.collapsedFlyout} style={{ top: panelTop }}
            role="group" aria-label={flyout.label}
            onMouseEnter={cancelCloseFlyout} onMouseLeave={scheduleCloseFlyout}>
            <div className={styles.collapsedFlyoutNotch} style={{ top: flyout.centerY - panelTop - 6 }} />
            <div className={styles.collapsedFlyoutHeader}>{flyout.label}</div>
            {flyout.subItems.map(sub => (
              /* <button>, not a click-only <div> -- these were unreachable by keyboard
                 and invisible to screen readers. */
              <button key={sub.to} type="button"
                className={`${styles.collapsedFlyoutItem} ${isSubActive(sub) ? styles.collapsedFlyoutItemActive : ''}`}
                aria-current={isSubActive(sub) ? 'page' : undefined}
                onMouseEnter={()=>prefetchRoute(sub.to)}
                onFocus={()=>{ cancelCloseFlyout(); prefetchRoute(sub.to) }}
                onClick={() => { navigate(sub.to); setFlyout(null) }}
                onContextMenu={(e) => openHideMenu(e, idMap[sub.label], sub.label)}
                style={{ background:'none', border:'none', font:'inherit', cursor:'pointer', textAlign:'left', width:'100%' }}>
                <span className={styles.collapsedFlyoutIcon} aria-hidden="true">{ICON_MAP[sub.label]}</span>
                {sub.label}
              </button>
            ))}
          </div>
          )
        })()}
        <div className={styles.collapsedAvatar} title={user?.email}>
          <div className={styles.avatar}>
            {user?.picture ? <img src={user.picture} alt={user.name}/> : initials}
          </div>
        </div>
        <SnapshotTool/>
        <CalculatorTool/>
      </aside>
      {hideMenuPopup}
      </>
    )
  }

  return (
    <aside className={styles.sidebar}>
      {renderNavBody()}
      <SnapshotTool/>
      <CalculatorTool/>
      {hideMenuPopup}
    </aside>
  )
}
