import React, { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import Sidebar, { PAGE_LIST, NAV } from '../components/Sidebar'
import { useAuth, getAccessList, addUserAccess, removeUserAccess, updateUserRole } from '../hooks/useAuth'
import { getActivityLog } from '../components/ActivityLogger.js'
import { toast } from '../components/ToastHost'
import Button from '../components/Button'
import Dropdown from '../components/Dropdown'
import PinInput from '../components/PinInput'
import { useDesignStyle, saveDesignStyle } from '../lib/designSettings'
import { renderKpiVariant } from '../ui/kpiVariants.jsx'
import styles from './SettingsPage.module.css'
import { SLACK_CHANNELS, confirmPhrase } from '../../shared/slackChannels.mjs'

// The locked rooms, in the order shared/slackChannels.mjs lists them. Settings only
// has to name them; which ones are locked is decided in that one file, not here.
const GUARDED = SLACK_CHANNELS.filter(c => c.guarded)

// Short labels for the design-system pickers below -- the actual visual
// rendering lives in buttonVariants.js / kpiVariants.jsx / LoginScene.jsx.
const BUTTON_STYLE_NAMES = [
  'Solid navy', 'Aurora gradient', 'Frosted glass', 'Outline → fill', 'Soft tint',
  'Gradient pill', 'Accent-bar card', 'Underline sweep', 'Gradient rounded', 'Embossed premium (default)',
  'Hairline → glow', 'Gradient-ring border', 'Bottom accent bar', 'Colored glow only', 'Icon chip',
  'Spinning ring', 'Corner notch', 'Status dot', 'Letterspaced underline', 'Quiet embossed',
]
const KPI_STYLE_NAMES = [
  'Flat minimal', 'Accent-bar + icon (default)', 'Full gradient', 'Colored glow', 'Corner notch',
  'Sparkline', 'Icon-left split', 'Progress ring', 'Vs-last bars', 'Frosted glass',
  'Oversized number', 'Goal-progress bar', 'Executive dark', 'Inline trend pill', 'Compact dense',
]

const RL_SB_URL = 'https://tsyekthwthxszmsgqfej.supabase.co'
const RL_SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzeWVrdGh3dGh4c3ptc2dxZmVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NjkzMDIsImV4cCI6MjA5NTM0NTMwMn0.bdM9h5c3PDu9hgggjBdbA-eb7kfF-79c6txOnCUxRhY'
async function getReportLogs(limit = 200) {
  try {
    const res = await fetch(
      `${RL_SB_URL}/rest/v1/report_logs?select=*&order=sent_at.desc&limit=${limit}`,
      { headers: { apikey: RL_SB_KEY, Authorization: `Bearer ${RL_SB_KEY}` } }
    )
    if (!res.ok) return []
    return await res.json()
  } catch { return [] }
}

// Populated by .github/workflows/source-health-check.yml (runs every 30 min) --
// requires the source_health table (see CLAUDE.md for the create-table SQL). Missing
// table/network issues resolve to [] so this degrades gracefully to "no automated
// check yet" rather than breaking the page.
async function getSourceHealth() {
  try {
    const res = await fetch(
      `${RL_SB_URL}/rest/v1/source_health?select=*`,
      { headers: { apikey: RL_SB_KEY, Authorization: `Bearer ${RL_SB_KEY}` } }
    )
    if (!res.ok) return []
    return await res.json()
  } catch { return [] }
}

// Ask AI tool-call audit log + token/cost usage -- written server-side (service-role key) by
// api/ask-ai.js, read here via the anon key, same pattern as report_logs/source_health above.
async function getAskAiToolCalls(limit = 200) {
  try {
    const res = await fetch(
      `${RL_SB_URL}/rest/v1/ask_ai_tool_calls?select=*&order=created_at.desc&limit=${limit}`,
      { headers: { apikey: RL_SB_KEY, Authorization: `Bearer ${RL_SB_KEY}` } }
    )
    if (!res.ok) return []
    return await res.json()
  } catch { return [] }
}

async function getAskAiUsage(days = 30) {
  try {
    const since = new Date(Date.now() - days * 86400000).toISOString()
    const res = await fetch(
      `${RL_SB_URL}/rest/v1/ask_ai_usage?select=*&created_at=gte.${encodeURIComponent(since)}&order=created_at.asc`,
      { headers: { apikey: RL_SB_KEY, Authorization: `Bearer ${RL_SB_KEY}` } }
    )
    if (!res.ok) return []
    return await res.json()
  } catch { return [] }
}

// GitHub's public commit API -- no token needed since this repo is public (60 req/hr per IP
// is plenty for an occasional Settings-tab load). Doubles as a "what's new" changelog and,
// sitting right above Activity Log, an easy eyeball-correlation between a deploy and a
// data/behavior change reported around the same time.
async function getRecentCommits(limit = 15) {
  try {
    const res = await fetch(`https://api.github.com/repos/shivamsharma-dot/leverage-quantum/commits?per_page=${limit}`)
    if (!res.ok) return []
    const data = await res.json()
    return data.map(c => ({
      sha: c.sha.slice(0, 7),
      message: (c.commit.message || '').split('\n')[0],
      date: c.commit.author?.date,
      author: c.commit.author?.name,
      url: c.html_url,
    }))
  } catch { return [] }
}

const getRoleMeta = (role) => {
  if (role === 'admin') return { label: 'Admin', color: '#1F3C84', bg: '#E8EFF9' }
  if (role === 'viewer') return { label: 'Viewer', color: '#1F3C84', bg: '#E3F5FD' }
  // viewer:home,meta_ads,... or custom:... => Custom badge
  if (typeof role === 'string' && (role.startsWith('viewer:') || role.startsWith('custom:'))) {
    return { label: 'Custom', color: '#1F3C84', bg: '#E4F8F9' }
  }
  return { label: 'Viewer', color: '#1F3C84', bg: '#E3F5FD' }
}

const DASHBOARDS = PAGE_LIST.filter(p => p.id !== 'settings')

// Groups the flat DASHBOARDS list to match the sidebar's real parent -> child
// nesting (Sidebar.jsx's NAV, imported above -- single source of truth, not a
// second hand-maintained mapping). A parent's sub-items only form a group here
// when EVERY one of them is matchType:'route' -- a genuinely separate page with
// its own PAGE_LIST id (e.g. QL Ops's Daily/Monthly/Human-Detail/AI-Detail).
// Meta Ads / Google Ads are matchType:'query' (tabs on one shared page, not
// distinct pages), so they're excluded automatically -- there's no separate
// per-tab id to toggle yet, not a hardcoded exception. If a NEW parent+subItems
// section is ever added the QL-Ops way (real routes), it groups here for free;
// if it's added the Meta/Google-Ads way (query tabs), it stays a single flat
// tile until per-tab page ids are actually built -- see CLAUDE.md.
function buildPageAccessGroups(dashboards) {
  const byId = Object.fromEntries(dashboards.map(d => [d.id, d]))
  const byPath = Object.fromEntries(dashboards.map(d => [d.path, d.id]))
  const consumed = new Set()
  const rows = []
  NAV.forEach(section => {
    section.items.forEach(item => {
      const routeSubs = (item.subItems || []).filter(s => s.matchType === 'route')
      if (routeSubs.length && routeSubs.length === item.subItems.length) {
        const children = routeSubs.map(s => byId[byPath[s.to]]).filter(Boolean)
        if (children.length) {
          children.forEach(d => consumed.add(d.id))
          rows.push({ type: 'group', label: item.label, children })
          return
        }
      }
      const dash = dashboards.find(d => d.label === item.label)
      if (dash && !consumed.has(dash.id)) { consumed.add(dash.id); rows.push({ type: 'single', dash }) }
    })
  })
  // Anything in PAGE_LIST that isn't reachable from NAV at all (shouldn't
  // normally happen, but fail open rather than silently drop a page).
  dashboards.forEach(d => { if (!consumed.has(d.id)) rows.push({ type: 'single', dash: d }) })
  return rows
}
const PAGE_ACCESS_GROUPS = buildPageAccessGroups(DASHBOARDS)

const DATA_SOURCES = [
  { name: 'Meta Graph API',       src: 'act_641914389215638', rows: 'live', disconnectable: true },
  { name: 'Google Ads API', src: 'Google Ads Account (env-configured)', rows: 'live' },
  { name: 'Referral Sheet',       editKey: 'sheet_url_referral', rows: 'live', defaultUrl: 'https://docs.google.com/spreadsheets/d/1r-e6pBCN5ysfeD3Eq6sxgLmf97mdeTtloMPylqnx6Ew/gviz/tq?tqx=out:csv&sheet=Referral' },
  { name: 'QL Ops Sheet (Daily)', editKey: 'sheet_url_qlops_daily', rows: 'live', defaultUrl: 'https://docs.google.com/spreadsheets/d/1r-e6pBCN5ysfeD3Eq6sxgLmf97mdeTtloMPylqnx6Ew/gviz/tq?tqx=out:csv&sheet=Qlops' },
  { name: 'QL Snapshot Sheet (Monthly)', editKey: 'sheet_url_qlops_monthly', rows: 'live', defaultUrl: 'https://docs.google.com/spreadsheets/d/1r-e6pBCN5ysfeD3Eq6sxgLmf97mdeTtloMPylqnx6Ew/gviz/tq?tqx=out:csv&sheet=QLSnapshot' },
  { name: 'WhatsApp Sheet',       editKey: 'sheet_url_whatsapp', rows: 'live', defaultUrl: 'https://docs.google.com/spreadsheets/d/1r-e6pBCN5ysfeD3Eq6sxgLmf97mdeTtloMPylqnx6Ew/gviz/tq?tqx=out:csv&sheet=whatsapp' },
  { name: 'FB Leads / CRM Sheet', editKey: 'sheet_url_fbleads', rows: 'live', defaultUrl: 'https://docs.google.com/spreadsheets/d/1r-e6pBCN5ysfeD3Eq6sxgLmf97mdeTtloMPylqnx6Ew/gviz/tq?tqx=out:csv&sheet=FBleads', apiPath: '/api/crm-leads' },
  { name: 'B2C Finance Sheet (CEO)', editKey: 'sheet_url_b2c', rows: 'live', defaultUrl: '', apiPath: '/api/crm-leads?source=b2c' },
  { name: 'Leads Assigned Sheet', editKey: 'sheet_url_leads_assigned', rows: 'live', defaultUrl: 'https://docs.google.com/spreadsheets/d/1r-e6pBCN5ysfeD3Eq6sxgLmf97mdeTtloMPylqnx6Ew/gviz/tq?tqx=out:csv&sheet=Leadassigned' },  { name: 'Google Ads CRM Leads Sheet', editKey: 'sheet_url_googleleads', rows: 'live', defaultUrl: 'https://docs.google.com/spreadsheets/d/1r-e6pBCN5ysfeD3Eq6sxgLmf97mdeTtloMPylqnx6Ew/gviz/tq?tqx=out:csv&sheet=googleleads' },
  { name: 'Human QL Detail Sheet', editKey: 'sheet_url_human_ql_detail', rows: 'live', defaultUrl: 'https://docs.google.com/spreadsheets/d/1r-e6pBCN5ysfeD3Eq6sxgLmf97mdeTtloMPylqnx6Ew/gviz/tq?tqx=out:csv&sheet=HumanDetailedQL' },
  { name: 'AI QL Detail Sheet', editKey: 'sheet_url_ai_ql_detail', rows: 'live', defaultUrl: 'https://docs.google.com/spreadsheets/d/1r-e6pBCN5ysfeD3Eq6sxgLmf97mdeTtloMPylqnx6Ew/gviz/tq?tqx=out:csv&sheet=AIDetailedQL' },
  { name: 'Human Unassigned Sheet', editKey: 'sheet_url_human_unassigned', rows: 'live', defaultUrl: 'https://docs.google.com/spreadsheets/d/1FsfBQAAKWwnDCLFRbvamFaJiqs2nq8Wltk5e8LGAhRo/gviz/tq?tqx=out:csv&sheet=human_unassigned' },
  { name: 'AI Unassigned Sheet', editKey: 'sheet_url_ai_unassigned', rows: 'live', defaultUrl: 'https://docs.google.com/spreadsheets/d/1FsfBQAAKWwnDCLFRbvamFaJiqs2nq8Wltk5e8LGAhRo/gviz/tq?tqx=out:csv&sheet=AI_unassigned' },
  // Live API, not a sheet -- credentials are Vercel env only (LEADSQUARED_ACCESS_KEY/
  // SECRET_KEY), never app_preferences. No editKey/defaultUrl, so this falls into the same
  // 'api' category as Meta Graph API / Google Ads API (see sourceCategory()) and gets the
  // lighter apiTestMode test button instead of the sheet-URL edit/diagnostics UI.
  { name: 'LeadSquared — Leads', src: 'LeadSquared API (env-configured)', rows: 'live', apiTestMode: 'leads' },
  { name: 'LeadSquared — Activity', src: 'LeadSquared API (env-configured)', rows: 'live', apiTestMode: 'activities' },
  { name: 'LeadSquared — Opportunities', src: 'LeadSquared API (env-configured)', rows: 'live', apiTestMode: 'opportunities' },
  // Google BigQuery, reached through /api/crm-leads?source=bigquery. Read-only:
  // the authorising account holds viewer access, and lib/bigquery.mjs refuses
  // anything that is not a SELECT/WITH. Credentials are Vercel env only.
  { name: 'Google BigQuery', src: 'BigQuery REST API (env-configured)', rows: 'live', bqTest: true },
    ]

// Official brand marks (Meta logo + 2026 Google Sheets icon), embedded verbatim from their
// source assets -- not stylized approximations. Rendered at their natural aspect ratio via
// dsIconBrand/dsIconSheets (wider than the generic square glyph) so they stay legible.
const MetaIcon = () => (
  <svg viewBox="0 0 287.56 191" className={styles.dsIconMeta}>
    <defs>
      <linearGradient id="dsMetaGrad1" x1="62.34" y1="101.45" x2="260.34" y2="91.45" gradientTransform="matrix(1, 0, 0, -1, 0, 192)" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#0064e1" /><stop offset="0.4" stopColor="#0064e1" /><stop offset="0.83" stopColor="#0073ee" /><stop offset="1" stopColor="#0082fb" />
      </linearGradient>
      <linearGradient id="dsMetaGrad2" x1="41.42" y1="53" x2="41.42" y2="126" gradientTransform="matrix(1, 0, 0, -1, 0, 192)" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#0082fb" /><stop offset="1" stopColor="#0064e0" />
      </linearGradient>
    </defs>
    <path fill="#0081fb" d="M31.06,126c0,11,2.41,19.41,5.56,24.51A19,19,0,0,0,53.19,160c8.1,0,15.51-2,29.79-21.76,11.44-15.83,24.92-38,34-52l15.36-23.6c10.67-16.39,23-34.61,37.18-47C181.07,5.6,193.54,0,206.09,0c21.07,0,41.14,12.21,56.5,35.11,16.81,25.08,25,56.67,25,89.27,0,19.38-3.82,33.62-10.32,44.87C271,180.13,258.72,191,238.13,191V160c17.63,0,22-16.2,22-34.74,0-26.42-6.16-55.74-19.73-76.69-9.63-14.86-22.11-23.94-35.84-23.94-14.85,0-26.8,11.2-40.23,31.17-7.14,10.61-14.47,23.54-22.7,38.13l-9.06,16c-18.2,32.27-22.81,39.62-31.91,51.75C84.74,183,71.12,191,53.19,191c-21.27,0-34.72-9.21-43-23.09C3.34,156.6,0,141.76,0,124.85Z" />
    <path fill="url(#dsMetaGrad1)" d="M24.49,37.3C38.73,15.35,59.28,0,82.85,0c13.65,0,27.22,4,41.39,15.61,15.5,12.65,32,33.48,52.63,67.81l7.39,12.32c17.84,29.72,28,45,33.93,52.22,7.64,9.26,13,12,19.94,12,17.63,0,22-16.2,22-34.74l27.4-.86c0,19.38-3.82,33.62-10.32,44.87C271,180.13,258.72,191,238.13,191c-12.8,0-24.14-2.78-36.68-14.61-9.64-9.08-20.91-25.21-29.58-39.71L146.08,93.6c-12.94-21.62-24.81-37.74-31.68-45C107,40.71,97.51,31.23,82.35,31.23c-12.27,0-22.69,8.61-31.41,21.78Z" />
    <path fill="url(#dsMetaGrad2)" d="M82.35,31.23c-12.27,0-22.69,8.61-31.41,21.78C38.61,71.62,31.06,99.34,31.06,126c0,11,2.41,19.41,5.56,24.51L10.14,167.91C3.34,156.6,0,141.76,0,124.85,0,94.1,8.44,62.05,24.49,37.3,38.73,15.35,59.28,0,82.85,0Z" />
  </svg>
)

const SheetsIcon = () => (
  <svg viewBox="0 0 800 581.8182" className={styles.dsIconSheets}>
    <path fill="#009954" d="M0 193.6364c0-40.65 0-60.9773 6.3818-77.1a90.91 90.91 0 0 1 51.0637-51.0591c16.1227-6.3864 36.4454-6.3864 77.1-6.3864H410.909c40.65 0 60.9773 0 77.1 6.3818a90.91 90.91 0 0 1 51.0636 51.0637c6.3818 16.1227 6.3818 36.4454 6.3818 77.1v194.5454c0 40.65 0 60.9773-6.3818 77.1a90.91 90.91 0 0 1-51.0636 51.0637c-16.1227 6.3818-36.45 6.3818-77.1 6.3818H134.5454c-40.65 0-60.9772 0-77.1045-6.3818a90.91 90.91 0 0 1-51.059-51.0637C0 449.1591 0 428.8318 0 388.1818Z" />
    <mask id="dsSheetsMask" width="160" height="128" x="24" y="32" maskUnits="userSpaceOnUse"><rect width="160" height="128" x="24" y="32" fill="#fff" rx="20" /></mask>
    <g mask="url(#dsSheetsMask)" transform="matrix(4.5454545,0,0,4.5454545,-36.363636,-145.45454)">
      <path fill="#0ebc5f" d="M24 32h160v128H24Z" />
      <g filter="url(#dsSheetsBlur)"><rect width="144" height="102" fill="url(#dsSheetsGrad)" rx="25.6" transform="matrix(1,0,0,-1,8,147)" /></g>
    </g>
    <path stroke="#ffffff" strokeLinecap="round" strokeWidth="54.5455" d="M327.2727 404.5455H709.091m-90.909 86.3636v-290.909" />
    <defs>
      <linearGradient id="dsSheetsGrad" x1="122.24" x2="20.76" y1="43.31" y2="43.31" gradientUnits="userSpaceOnUse"><stop stopColor="#0ebc5f" /><stop offset=".95" stopColor="#78c9ff" /></linearGradient>
      <filter id="dsSheetsBlur" width="168" height="126" x="-4" y="33" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse">
        <feFlood floodOpacity="0" result="BackgroundImageFix" /><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" mode="normal" /><feGaussianBlur result="effect1_foregroundBlur" stdDeviation="6" />
      </filter>
    </defs>
  </svg>
)

const GenericSourceIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" /></svg>
)

const GoogleIcon = () => (
  <svg viewBox="-3 0 262 262">
    <path fill="#4285F4" d="M255.878 133.451c0-10.734-.871-18.567-2.756-26.69H130.55v48.448h71.947c-1.45 12.04-9.283 30.172-26.69 42.356l-.244 1.622 38.755 30.023 2.685.268c24.659-22.774 38.875-56.282 38.875-96.027" />
    <path fill="#34A853" d="M130.55 261.1c35.248 0 64.839-11.605 86.453-31.622l-41.196-31.913c-11.024 7.688-25.82 13.055-45.257 13.055-34.523 0-63.824-22.773-74.269-54.25l-1.531.13-40.298 31.187-.527 1.465C35.393 231.798 79.49 261.1 130.55 261.1" />
    <path fill="#FBBC05" d="M56.281 156.37c-2.756-8.123-4.351-16.827-4.351-25.82 0-8.994 1.595-17.697 4.206-25.82l-.073-1.73L15.26 71.312l-1.335.635C5.077 89.644 0 109.517 0 130.55s5.077 40.905 13.925 58.602l42.356-32.782" />
    <path fill="#EB4335" d="M130.55 50.479c24.514 0 41.05 10.589 50.479 19.438l36.844-35.974C195.245 12.91 165.798 0 130.55 0 79.49 0 35.393 29.301 13.925 71.947l42.211 32.783c10.59-31.477 39.891-54.251 74.414-54.251" />
  </svg>
)

// Real LeadSquared mark (from the user's own downloaded brand SVG) -- two-tone step shape.
const LeadSquaredIcon = () => (
  <svg viewBox="0 0 136.6 137.9">
    <polygon fill="#0C9AFC" points="0,0 0,68.5 68.6,68.5 68.6,137.9 136.6,137.9 136.6,0" />
    <polygon fill="#0C293D" points="68.6,137.9 0,137.9 0,68.5" />
  </svg>
)

// Sheet-backed sources (anything with editKey) get the real Sheets mark; Meta Graph API and
// Google Ads API get their real brand marks; custom sources keep the generic glyph (they're
// arbitrary user-registered sheets, not a specific named service).
// BigQuery mark -- the Google Cloud product glyph: a ring with a magnifier
// handle at the lower right and three column bars inside, in Google's product
// blues. Reconstructed from the published icon geometry, NOT copied verbatim
// from the vendor asset like the Meta/Sheets/LeadSquared marks above -- if we
// later get the real SVG, swap these two paths and nothing else changes.
const BigQueryIcon = () => (
  <svg viewBox="0 0 24 24" className={styles.dsIconBq}>
    <path fill="#4386FA" d="M10.44 1.5a8.94 8.94 0 1 0 5.2 16.22l4.53 4.53a1.2 1.2 0 0 0 1.7-1.7l-4.53-4.53A8.94 8.94 0 0 0 10.44 1.5Zm0 2.4a6.54 6.54 0 1 1 0 13.08 6.54 6.54 0 0 1 0-13.08Z" />
    <path fill="#669DF6" d="M7.3 9.66h1.63v3.4H7.3zm2.33-2.2h1.63v5.6H9.63zm2.33 3.3h1.63v2.3h-1.63z" />
  </svg>
)

function sourceIconClass(s) {
  if (s.editKey) return { Icon: SheetsIcon, wrap: styles.dsIconWrapSheets }
  if (s.name === 'Meta Graph API') return { Icon: MetaIcon, wrap: styles.dsIconWrapBrand }
  if (s.name === 'Google Ads API') return { Icon: GoogleIcon, wrap: styles.dsIconWrapBrand }
  if (s.apiTestMode) return { Icon: LeadSquaredIcon, wrap: styles.dsIconWrapBrand }
  if (s.bqTest) return { Icon: BigQueryIcon, wrap: styles.dsIconWrapBrand }
  return { Icon: GenericSourceIcon, wrap: '' }
}

// Sheet-backed sources (editKey) and admin-added custom sources are always CSV/Sheet-driven;
// everything else (Meta Graph API, Google Ads API) is a live server-side API connection.
function sourceCategory(s) {
  return (s.editKey || s.custom) ? 'sheets' : 'api'
}


// Mini SVG icon renderer for KPI icon picker
function KpiIconPreview({ name, color = '#94A3B8' }) {
  const s = { width:16, height:16, viewBox:'0 0 24 24', fill:'none', stroke: color, strokeWidth:2, strokeLinecap:'round', strokeLinejoin:'round' }
  const icons = {
    'rupee':       <svg {...s}><path d="M6 3h12M6 8h12M6 13l9 8"/><path d="M6 8a6 6 0 000 5h4"/></svg>,
    'dollar':      <svg {...s}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
    'wallet':      <svg {...s}><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
    'card':        <svg {...s}><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/><line x1="5" y1="15" x2="9" y2="15"/></svg>,
    'chart-bar':   <svg {...s}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
    'users':       <svg {...s}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
    'person':      <svg {...s}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
    'funnel':      <svg {...s}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
    'target':      <svg {...s}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
    'star':        <svg {...s}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
    'percent':     <svg {...s}><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>,
    'trending':    <svg {...s}><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>,
    'activity':    <svg {...s}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
    'pulse':       <svg {...s}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
    'zap':         <svg {...s}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
    'trending-up': <svg {...s}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
    'coin':        <svg {...s}><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>,
    'gift':        <svg {...s}><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/></svg>,
    'building':    <svg {...s}><rect x="4" y="2" width="16" height="20"/><line x1="9" y1="22" x2="9" y2="12"/><line x1="15" y1="22" x2="15" y2="12"/><rect x="9" y="7" width="2" height="2"/><rect x="13" y="7" width="2" height="2"/></svg>,
    'check':       <svg {...s}><polyline points="20 6 9 17 4 12"/></svg>,
    'message':     <svg {...s}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
    'mail':        <svg {...s}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/></svg>,
    'send':        <svg {...s}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
    'bell':        <svg {...s}><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>,
    'chat':        <svg {...s}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
    'grid':        <svg {...s}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
    'layers':      <svg {...s}><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>,
    'cube':        <svg {...s}><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
    'diamond':     <svg {...s}><path d="M6 3h12l4 6-10 13L2 9z"/><path d="M2 9h20"/></svg>,
    'eye':         <svg {...s}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  }
  return icons[name] || icons['grid']
}

// ---- Report email preview (mirrors api/send-report.js buildReport()) ----
// Sample data + AI text stand in for a live send; header/KPI/table/footer markup is copied verbatim.
const RP_SAMPLE = {
  daily:   { periodLabel: 'Yesterday — Tue, 14 Jul 2026', spend: 412000, impr: 1284000, clicks: 9820, ctr: 0.76, cpm: 321, freq: 2.9, reach: 441000, leads: 186, days: 1 },
  weekly:  { periodLabel: 'Last 7 Days — 08 Jul to 14 Jul 2026', spend: 2890000, impr: 8760000, clicks: 64200, ctr: 0.73, cpm: 330, freq: 3.4, reach: 1620000, leads: 1240, days: 7 },
  monthly: { periodLabel: 'Last 30 Days — 15 Jun to 14 Jul 2026', spend: 11640000, impr: 35800000, clicks: 251000, ctr: 0.70, cpm: 325, freq: 4.1, reach: 4900000, leads: 5010, days: 30 },
}
const RP_SUBJECTS = {
  daily: d => `Meta Ads Daily Report — Yesterday · ${d}`,
  weekly: d => `Meta Ads Weekly Report — Last 7 Days · ${d}`,
  monthly: d => `Meta Ads Monthly Report — Last 30 Days · ${d}`,
}
const RP_CAMPS = [
  { name: 'PMX_FB_Ger_NAS_10June2026_Ad2', status: 'ACTIVE', spend: 184000, ctr: 1.12, freq: 2.1, leads: 64 },
  { name: 'PMX_FB_UK_LeadGen_NAS_11_May26-Ad4', status: 'ACTIVE', spend: 151000, ctr: 0.61, freq: 4.2, leads: 31 },
  { name: 'PMX_Demandgen_Italy_18Feb26', status: 'ACTIVE', spend: 98000, ctr: 0.44, freq: 3.8, leads: 19 },
  { name: 'Remarketing_13July26_Sep26Intake', status: 'PAUSED', spend: 62000, ctr: 0.88, freq: 1.6, leads: 22 },
]
const RP_AI_SAMPLE = `
<div style="padding:10px 14px;border-radius:8px;background:#E9F8EF;border-left:3px solid #4CAE6F;color:#1F3C84;margin-bottom:8px;font-size:13px;line-height:1.6">Biggest win: PMX_FB_Ger_NAS_10June2026_Ad2 is delivering <strong style="background:#FEF9C3;padding:1px 3px;border-radius:3px">64 leads</strong> at a CTR of 1.12% — your most efficient campaign this period.</div>
<div style="padding:10px 14px;border-radius:8px;background:#E8EFF9;border-left:3px solid #1F3C84;color:#1F3C84;margin-bottom:8px;font-size:13px;line-height:1.6">Biggest risk: PMX_FB_UK_LeadGen_NAS_11_May26-Ad4 is showing frequency <strong style="background:#FEF9C3;padding:1px 3px;border-radius:3px">4.2x</strong> with CTR down to 0.61% — classic fatigue signal.</div>
<div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#94A3B8;margin:16px 0 8px;padding-bottom:6px;border-bottom:1px solid #F1F5F9">CAMPAIGN FLAGS</div>
<div style="padding:10px 14px;border-radius:8px;background:#EFF6FF;border-left:3px solid #3B82F6;color:#1E3A8A;margin-bottom:8px;font-size:13px;line-height:1.6">PMX_FB_UK_LeadGen_NAS_11_May26-Ad4: frequency above 3.5x threshold, CTR trending down — refresh creative.</div>
<div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#94A3B8;margin:16px 0 8px;padding-bottom:6px;border-bottom:1px solid #F1F5F9">TOP 3 ACTIONS</div>
<div style="font-size:13px;line-height:1.7;color:#334155">1. Refresh creative on Ad4 (UK) this week — frequency fatigue is capping reach.<br>2. Increase budget on Ad2 (Germany) — still efficient at scale.<br>3. Review Remarketing_13July26_Sep26Intake — paused but held 22 leads at strong CTR; consider reactivating.</div>`

function rpFmtINR(n) {
  n = parseFloat(n) || 0
  if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr'
  if (n >= 1e5) return '₹' + (n / 1e5).toFixed(1) + 'L'
  if (n >= 1000) return '₹' + Math.round(n).toLocaleString('en-IN')
  return '₹' + Math.round(n)
}
function rpKpiCard(label, value, sub, accent) {
  return `<td width="20%" style="padding:4px"><div style="background:#F8FAFC;border-radius:10px;border:0.5px solid #E2E8F0;border-top:3px solid ${accent};padding:12px 14px"><div style="font-size:20px;font-weight:800;color:#0F172A;letter-spacing:-0.03em;line-height:1">${value}</div><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#94A3B8;margin-top:5px">${label}</div>${sub ? `<div style="font-size:10.5px;color:#94A3B8;margin-top:3px">${sub}</div>` : ''}</div></td>`
}
function rpCampTable(camps, avgCTR) {
  const rows = camps.map((c, i) => {
    const cpl = c.leads > 0 ? c.spend / c.leads : 0
    const fatigue = c.freq > 3.5 || c.ctr < avgCTR * 0.5
    const rowBg = i % 2 === 0 ? '#fff' : '#FAFBFC'
    return `<tr style="background:${fatigue ? '#FFFBF0' : rowBg}">
      <td style="padding:9px 12px;font-size:12px;font-weight:600;color:#0F172A;white-space:nowrap">${c.name.length > 40 ? c.name.slice(0, 38) + '…' : c.name}</td>
      <td style="padding:9px 8px;text-align:center"><span style="display:inline-block;padding:2px 7px;border-radius:12px;font-size:10px;font-weight:700;background:${c.status === 'ACTIVE' ? '#DCFCE7' : '#F1F5F9'};color:${c.status === 'ACTIVE' ? '#166534' : '#94A3B8'}">${c.status}</span></td>
      <td style="padding:9px 8px;font-size:12px;font-weight:700;color:#0F172A;text-align:right">${rpFmtINR(c.spend)}</td>
      <td style="padding:9px 8px;font-size:12px;text-align:right;font-weight:600;color:${c.ctr >= 1 ? '#166534' : c.ctr >= avgCTR ? '#1E3A8A' : '#991B1B'}">${c.ctr.toFixed(2)}%</td>
      <td style="padding:9px 8px;font-size:12px;text-align:right;font-weight:600;color:${c.freq > 3.5 ? '#C2410C' : '#475569'}">${c.freq.toFixed(1)}x${c.freq > 3.5 ? ' ⚠' : ''}</td>
      <td style="padding:9px 8px;font-size:12px;font-weight:700;text-align:right;color:#0F172A">${c.leads.toLocaleString('en-IN')}</td>
      <td style="padding:9px 8px;font-size:12px;text-align:right;color:#475569">${cpl > 0 ? rpFmtINR(cpl) : '—'}</td>
    </tr>`
  }).join('')
  return `<div style="overflow-x:auto;margin-top:4px"><table style="width:100%;border-collapse:collapse;font-family:${'-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif'}"><thead><tr style="background:#F8FAFC;border-bottom:2px solid #E2E8F0">${['Campaign', 'Status', 'Spend', 'CTR', 'Freq', 'Leads', 'CPL'].map(h => `<th style="padding:9px ${h === 'Campaign' ? '12px' : '8px'};font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#64748B;text-align:${h === 'Campaign' ? 'left' : 'right'};white-space:nowrap">${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`
}
function rpSectionTitle(emoji, title) {
  return `<div style="font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#94A3B8;padding:16px 0 10px;border-bottom:1px solid #F1F5F9;margin-bottom:14px">${emoji}&nbsp; ${title}</div>`
}
function buildReportPreviewHTML(reportType, senderName) {
  const NAVY = '#1F3C84', BLUE = '#1C9FD4', CYAN = '#29B9C3', GREEN = '#4CAE6F'
  const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"
  const s = RP_SAMPLE[reportType]
  const accentColor = reportType === 'daily' ? BLUE : reportType === 'weekly' ? GREEN : NAVY
  const accentTint = reportType === 'daily' ? '#EAF3FC' : reportType === 'weekly' ? '#EAF7EE' : '#EEF1FB'
  const typeLabel = reportType === 'daily' ? 'Daily' : reportType === 'weekly' ? 'Weekly' : 'Monthly'
  const cpl = s.leads > 0 ? s.spend / s.leads : 0
  const eps = s.leads > 0 ? (s.leads / s.days).toFixed(1) : '0'
  const todayLabel = '15 Jul 2026'
  return `<div style="margin:0;padding:32px 12px;background-color:#F4F6F9;font-family:${FONT}">
  <div style="max-width:680px;margin:0 auto">

    <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:20px 20px 0 0;overflow:hidden">
      <tr>
        <td width="25%" style="background-color:${NAVY};font-size:0;line-height:0;height:5px">&nbsp;</td>
        <td width="25%" style="background-color:${BLUE};font-size:0;line-height:0;height:5px">&nbsp;</td>
        <td width="25%" style="background-color:${CYAN};font-size:0;line-height:0;height:5px">&nbsp;</td>
        <td width="25%" style="background-color:${GREEN};font-size:0;line-height:0;height:5px">&nbsp;</td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;box-shadow:0 24px 60px -24px rgba(15,23,42,0.18);border-left:1px solid #EEF1F6;border-right:1px solid #EEF1F6">

      <tr><td style="padding:32px 36px 24px">
        <table cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:middle;padding-right:12px">
            <table cellpadding="0" cellspacing="0" style="background-color:#ffffff;border:1px solid #EEF1F6;border-radius:10px;box-shadow:0 3px 10px rgba(15,23,42,0.10)">
              <tr><td style="padding:9px 11px"><table cellpadding="0" cellspacing="0"><tr>
                <td valign="bottom" style="padding-right:2px"><div style="width:4px;height:9px;background-color:${GREEN};border-radius:1.5px;font-size:0;line-height:0">&nbsp;</div></td>
                <td valign="bottom" style="padding-right:2px"><div style="width:4px;height:14px;background-color:${CYAN};border-radius:1.5px;font-size:0;line-height:0">&nbsp;</div></td>
                <td valign="bottom"><div style="width:4px;height:17px;background-color:${BLUE};border-radius:1.5px;font-size:0;line-height:0">&nbsp;</div></td>
              </tr></table></td></tr>
            </table>
          </td>
          <td style="vertical-align:middle"><div style="font-size:16px;font-weight:800;color:${NAVY};letter-spacing:.02em;line-height:1.2">${senderName}</div></td>
        </tr></table>
        <div style="margin-top:22px"><span style="display:inline-block;padding:4px 11px;border-radius:20px;background-color:${accentTint};font-size:10px;font-weight:700;color:${accentColor};letter-spacing:.08em;text-transform:uppercase">${typeLabel} Report</span></div>
        <div style="font-size:22px;font-weight:800;color:#0F172A;letter-spacing:-.01em;line-height:1.35;margin:12px 0 6px">Meta Ads Performance</div>
        <div style="font-size:12.5px;color:#94A3B8">${s.periodLabel} &middot; <span style="color:#64748B;font-weight:600">act_641914389215638</span> &middot; Generated ${todayLabel}</div>
      </td></tr>

      <tr><td style="padding:0 36px"><div style="height:1px;background-color:#EEF1F6"></div></td></tr>

      <tr><td style="padding:24px 26px 4px"><table cellpadding="0" cellspacing="0" width="100%" style="table-layout:fixed"><tr>
        ${rpKpiCard('Spend', rpFmtINR(s.spend), RP_CAMPS.length + ' campaigns', accentColor)}
        ${rpKpiCard('Leads', s.leads.toLocaleString('en-IN'), 'EPS: ' + eps + '/day', BLUE)}
        ${rpKpiCard('CPL', rpFmtINR(cpl), cpl > 3000 ? '⚠ Above target' : '✓ On track', cpl > 3000 ? '#1F3C84' : '#4CAE6F')}
        ${rpKpiCard('CTR', s.ctr.toFixed(2) + '%', s.ctr >= 1 ? '✓ Healthy' : '⚠ Below 1%', s.ctr >= 1 ? '#4CAE6F' : '#1F3C84')}
        ${rpKpiCard('Freq', s.freq.toFixed(2) + 'x', s.freq > 3.5 ? '⚠ Fatigue risk' : '✓ OK', s.freq > 3.5 ? '#1F3C84' : '#4CAE6F')}
      </tr></table></td></tr>
      <tr><td style="padding:4px 36px 8px"><table cellpadding="0" cellspacing="0"><tr>
        <td style="padding-right:20px"><span style="font-size:11.5px;color:#64748B">Impressions</span><span style="font-size:12px;font-weight:700;color:#0F172A;margin-left:6px">${s.impr.toLocaleString('en-IN')}</span></td>
        <td style="padding-right:20px"><span style="font-size:11.5px;color:#64748B">Reach</span><span style="font-size:12px;font-weight:700;color:#0F172A;margin-left:6px">${s.reach.toLocaleString('en-IN')}</span></td>
        <td style="padding-right:20px"><span style="font-size:11.5px;color:#64748B">CPM</span><span style="font-size:12px;font-weight:700;color:#0F172A;margin-left:6px">${rpFmtINR(s.cpm)}</span></td>
        <td><span style="font-size:11.5px;color:#64748B">Clicks</span><span style="font-size:12px;font-weight:700;color:#0F172A;margin-left:6px">${s.clicks.toLocaleString('en-IN')}</span></td>
      </tr></table></td></tr>

      <tr><td style="padding:0 36px"><div style="height:1px;background-color:#EEF1F6;margin-top:12px"></div></td></tr>

      <tr><td style="padding:20px 26px 8px">${rpSectionTitle('📊', 'Campaign Breakdown')}${rpCampTable(RP_CAMPS, s.ctr)}</td></tr>

      <tr><td style="padding:0 36px"><div style="height:1px;background-color:#EEF1F6"></div></td></tr>

      <tr><td style="padding:20px 26px 32px">${rpSectionTitle('🤖', 'AI Analysis — Claude Sonnet')}${RP_AI_SAMPLE}</td></tr>

    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F8FAFC;border-radius:0 0 20px 20px;border:1px solid #EEF1F6;border-top:none">
      <tr><td style="padding:16px 36px;text-align:center"><span style="font-size:10.5px;color:#94A3B8">Leverage Quantum &middot; Auto-generated &middot; ${todayLabel} &middot; Do not reply</span></td></tr>
    </table>

  </div>
</div>`
}

export default function SettingsPage() {
  const { user } = useAuth()
  const userIsAdmin = user?.role === 'admin'
  const [activeTab, setActiveTab] = useState(userIsAdmin ? 'data' : 'profile')
  const [copied, setCopied] = useState(false)
  const location = useLocation()

  // Open a specific tab when navigated with ?tab=... (e.g. role badge -> profile). Depends on
  // location.search (not a mount-only []) -- otherwise a same-page navigation while Settings is
  // already mounted (e.g. clicking the sidebar role badge -> /settings?tab=profile while already
  // viewing a different tab) never re-parses the URL and the tab silently fails to switch.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const requested = params.get('tab');
    if (requested && ['data','users','activity','reports','askai','appearance','profile'].includes(requested)) setActiveTab(requested);
  }, [location.search]);

  const _actRef = useRef(false)
  useEffect(() => {
    if (activeTab === 'activity' && userIsAdmin && !_actRef.current) { _actRef.current=true; loadActivity() }
  }, [activeTab, userIsAdmin])

  // Activity
  const [activityLog, setActivityLog] = useState([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [actSearch, setActSearch] = useState('')
  const loadActivity = async () => {
    setActivityLoading(true)
    setActivityLog(await getActivityLog(500))
    setActivityLoading(false)
  }

  // Report Activity Log (send history — sent/skipped/failed, incl. cron + GitHub Actions triggers)
  const _rlRef = useRef(false)
  useEffect(() => {
    if (activeTab === 'reports' && userIsAdmin && !_rlRef.current) { _rlRef.current=true; loadReportLogs() }
  }, [activeTab, userIsAdmin])
  const [reportLogsList, setReportLogsList] = useState([])
  const [reportLogsLoading, setReportLogsLoading] = useState(false)
  const loadReportLogs = async () => {
    setReportLogsLoading(true)
    setReportLogsList(await getReportLogs(200))
    setReportLogsLoading(false)
  }

  // Ask AI: tool-call audit log + token/cost usage monitoring
  const _askaiRef = useRef(false)
  useEffect(() => {
    if (activeTab === 'askai' && userIsAdmin && !_askaiRef.current) { _askaiRef.current = true; loadAskAiToolCalls(); loadAskAiUsage() }
  }, [activeTab, userIsAdmin])
  const [askaiToolCalls, setAskaiToolCalls] = useState([])
  const [askaiToolCallsLoading, setAskaiToolCallsLoading] = useState(false)
  const [askaiToolFilter, setAskaiToolFilter] = useState('all')
  const [askaiDetail, setAskaiDetail] = useState(null) // selected tool-call row shown in the popup, or null
  const loadAskAiToolCalls = async () => {
    setAskaiToolCallsLoading(true)
    setAskaiToolCalls(await getAskAiToolCalls(300))
    setAskaiToolCallsLoading(false)
  }
  const [askaiUsageRows, setAskaiUsageRows] = useState([])
  const [askaiUsageLoading, setAskaiUsageLoading] = useState(false)
  const loadAskAiUsage = async () => {
    setAskaiUsageLoading(true)
    setAskaiUsageRows(await getAskAiUsage(30))
    setAskaiUsageLoading(false)
  }
  const [askaiBudgetInput, setAskaiBudgetInput] = useState('')
  const [askaiBudgetSaving, setAskaiBudgetSaving] = useState(false)
  const [askaiBudgetMsg, setAskaiBudgetMsg] = useState(null)
  const saveAskaiBudget = async () => {
    setAskaiBudgetSaving(true); setAskaiBudgetMsg(null)
    try {
      const n = parseFloat(askaiBudgetInput) || 0
      const r = await fetch('/api/preferences', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'ask_ai_monthly_budget_usd', value: n }) })
      if (!r.ok) throw new Error('Save failed')
      setAskaiBudgetMsg({ type: 'ok', text: 'Saved' })
    } catch (e) {
      setAskaiBudgetMsg({ type: 'err', text: e.message })
    } finally {
      setAskaiBudgetSaving(false)
      setTimeout(() => setAskaiBudgetMsg(null), 3000)
    }
  }

  // Business context (Phase 2 of the agent-upgrade roadmap): a structured knowledge
  // base folded into Ask AI's + every agent's system prompt (see formatBusinessContext
  // in api/ask-ai.mjs), so narrative copy interprets the data correctly and matches how
  // the business actually talks about itself -- without touching the app's own fixed
  // navy/blue/cyan/green brand identity (that stays hardcoded, see DESIGN_SYSTEM.md).
  // Structure modeled on a reference tool's "Business" knowledge base (grouped sections,
  // some free text, some tag lists), but every default VALUE below is Quantum's own
  // already-true, already-documented fact (funnel stages, data sources, glossary terms
  // straight from this file's own CLAUDE.md) -- never copied content, and business-
  // judgment fields (goals, competitors, seasonality, etc) start genuinely blank for
  // an admin to fill in, not invented on their behalf.
  const BIZ_GROUPS = [
    { title: 'Business', fields: [
      { key: 'overview', label: 'Overview', type: 'textarea', placeholder: 'What Leverage Edu does, in plain language, and how the funnel works end to end.' },
      { key: 'businessModel', label: 'Business model', type: 'textarea', placeholder: 'How revenue is actually earned (e.g. university recruitment commission vs one-off product sale).' },
      { key: 'products', label: 'Products / lines', type: 'tags', placeholder: 'Add a product line and press Enter' },
      { key: 'funnelStages', label: 'Funnel stages', type: 'textarea', default: 'Lead -> QL (Qualified Lead, meets disposition criteria) -> Application -> Offer -> Deposit -> RAU (Registered At University). Total QL = Futwork Human QL + Futwork AI QL + Superbot AI QL combined -- Quantum\'s own authoritative figure, not Meta/Google\'s in-platform lead count.' },
      { key: 'keyMetrics', label: 'Conversion & key metrics', type: 'textarea', placeholder: 'Which metric actually gets optimized against (e.g. QL, not raw leads or CPA), and why.' },
      { key: 'goals', label: 'Goals (6-12 mo)', type: 'textarea', placeholder: 'What the business is trying to move in the next two quarters.' },
      { key: 'revenueRoas', label: 'Revenue & ROAS', type: 'textarea', default: 'Est. SR Revenue = Deposits x 0.7 x SR Fee. Actual SR Revenue = Actual RAUs x SR Fee (no discount -- already realized). ROAS = SR Revenue / Spend. Caveat: the sales cycle is long, so true ROAS is only knowable months after lead-gen -- never present it as a same-day figure.' },
    ]},
    { title: 'Markets & competition', fields: [
      { key: 'sourceMarkets', label: 'Source markets', type: 'tags', placeholder: 'e.g. India — add and press Enter' },
      { key: 'destinationMarkets', label: 'Destination markets', type: 'tags', default: ['UK','Germany','Italy','Dubai','MBBS (India source)','MBBS (UK source)'], placeholder: 'Add a destination and press Enter' },
      { key: 'prioritySegments', label: 'Priority segments', type: 'textarea', placeholder: 'Which corridor/segment matters most right now, and why.' },
      { key: 'competitors', label: 'Competitors', type: 'tags', placeholder: 'Add a competitor and press Enter' },
      { key: 'seasonality', label: 'Seasonality', type: 'textarea', placeholder: 'Real intake/demand cycles (e.g. Fall vs Spring vs Summer intake) so a dip is read as normal, not an anomaly.' },
    ]},
    { title: 'Operating rules', fields: [
      { key: 'whatsComing', label: "What's coming", type: 'textarea', placeholder: 'Upcoming campaigns/changes agents should know about before flagging something as an anomaly.' },
      { key: 'numbersToTrust', label: 'Which numbers to trust', type: 'textarea', default: 'Quantum\'s Overall funnel sheet (Total QL) is authoritative when it disagrees with Meta/Google\'s own in-platform lead/conversion counts -- always prefer Quantum\'s figure and say so if asked.' },
      { key: 'reportingBasis', label: 'Reporting basis', type: 'textarea', default: 'Currency INR (₹). Timezone Asia/Kolkata (IST). Meta attribution: 7-day click. Google attribution: default GAQL conversion window.' },
      { key: 'dataSources', label: 'Data sources', type: 'textarea', default: 'Connected: Meta Ads, Google Ads, Bing Ads, WhatsApp, QL Ops (Futwork/Superbot), CRM leads (FBleads/googleleads sheets), Overall PM funnel sheet. Referenced but NOT connected: Opportunity-level Won/Lost status -- no sheet or table tracks a real sales-pipeline outcome yet (see the disclosed gap on the Marketing Performance report).' },
      { key: 'glossary', label: 'Glossary', type: 'textarea', default: 'QL=Qualified Lead; CPL/CPQL=Cost per Lead / per Qualified Lead; RAU=Registered At University; SR=Student Recruitment (fee per RAU); CPA=Cost per Applications.' },
      { key: 'voiceGuardrails', label: 'Voice & writing guardrails', type: 'textarea', placeholder: 'e.g. Never invent a number, date, or claim not present in the connected data -- say so explicitly if something isn\'t tracked, rather than estimating.' },
    ]},
  ]
  const bizDefaults = () => {
    const o = {}
    BIZ_GROUPS.forEach(g => g.fields.forEach(f => { o[f.key] = f.default != null ? f.default : (f.type === 'tags' ? [] : '') }))
    return o
  }
  const [bizFields, setBizFields] = useState(bizDefaults)
  const [bizTagDraft, setBizTagDraft] = useState({}) // per-field in-progress tag text
  const [bizSaving, setBizSaving] = useState(false)
  const [bizMsg, setBizMsg] = useState(null)
  const setBizField = (key, val) => setBizFields(prev => ({ ...prev, [key]: val }))
  const addBizTag = (key) => {
    const v = (bizTagDraft[key] || '').trim()
    if (!v) return
    setBizFields(prev => ({ ...prev, [key]: [...(prev[key] || []), v] }))
    setBizTagDraft(prev => ({ ...prev, [key]: '' }))
  }
  const removeBizTag = (key, idx) => setBizFields(prev => ({ ...prev, [key]: prev[key].filter((_, i) => i !== idx) }))
  const saveBusinessContext = async () => {
    setBizSaving(true); setBizMsg(null)
    try {
      const value = {}
      BIZ_GROUPS.forEach(g => g.fields.forEach(f => {
        const v = bizFields[f.key]
        value[f.key] = f.type === 'tags' ? (v || []) : (v || '').trim()
      }))
      const r = await fetch('/api/preferences', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'business_context', value }) })
      if (!r.ok) throw new Error('Save failed')
      setBizMsg({ type: 'ok', text: 'Saved' })
    } catch (e) {
      setBizMsg({ type: 'err', text: e.message })
    } finally {
      setBizSaving(false)
      setTimeout(() => setBizMsg(null), 3000)
    }
  }
// Published-sheet connector (admin-configurable CSV URLs)
    const [sheetUrls, setSheetUrls] = useState({})
    const [sheetInputs, setSheetInputs] = useState({})
    const [sheetSaving, setSheetSaving] = useState({})
    const [sheetMsg, setSheetMsg] = useState({}); const [editingSheet, setEditingSheet] = useState(null)
    const [sheetTest, setSheetTest] = useState({}) // { [key]: { loading, error, columns, columnCount, rowCount, ts } }
    const [customSources, setCustomSources] = useState([]) // admin-added sources, stored server-side via /api/preferences
    const [newSourceForm, setNewSourceForm] = useState({ name: '', url: '' })
    const [addSourceMsg, setAddSourceMsg] = useState(null)
    const [addSourceOpen, setAddSourceOpen] = useState(false)
    const [sourceCatFilter, setSourceCatFilter] = useState('api') // 'api' | 'sheets' -- which category card is selected
    const [sourceHealth, setSourceHealth] = useState([]) // rows from the source_health table, written by the scheduled GitHub Action
    const [checkingAll, setCheckingAll] = useState(false)
    const [testDetailsOpen, setTestDetailsOpen] = useState({}) // per-source: whether columns/month-chips/sample-rows are expanded
    const [healthSchedule, setHealthSchedule] = useState({ mode: 'daily', hour: 9 }) // read by .github/workflows/source-health-check.yml
    const [savingSchedule, setSavingSchedule] = useState(false)
    const [scheduleMsg, setScheduleMsg] = useState(null)
    const [metaDisconnecting, setMetaDisconnecting] = useState(false)
    const [metaDisconnectMsg, setMetaDisconnectMsg] = useState(null)
    // Affiliate spend has no automated feed (no ad platform, no sheet) -- an admin
    // enters it here by month and it's merged into the Overall dashboard's own
    // totals/channel breakdown as a synthetic row (see OverallDashboard.jsx).
    const [affiliateSpend, setAffiliateSpend] = useState({}) // { 'YYYY-MM': amount }
    const [affSpendMonth, setAffSpendMonth] = useState('')
    const [affSpendAmount, setAffSpendAmount] = useState('')
    const [affSpendSaving, setAffSpendSaving] = useState(false)
    const [affSpendMsg, setAffSpendMsg] = useState(null)
    const saveAffiliateSpend = async (next, successMsg) => {
      const prev = affiliateSpend
      setAffiliateSpend(next)
      setAffSpendSaving(true); setAffSpendMsg(null)
      try {
        const r = await fetch('/api/preferences', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'affiliate_spend_manual', value: next }) })
        if (!r.ok) throw new Error('Save failed')
        setAffSpendMsg({ type: 'ok', text: successMsg || 'Saved' })
      } catch (e) {
        setAffiliateSpend(prev) // revert -- otherwise it looks saved but vanishes on next reload
        setAffSpendMsg({ type: 'err', text: e.message })
      } finally {
        setAffSpendSaving(false)
        setTimeout(() => setAffSpendMsg(null), 4000)
      }
    }
    const addAffiliateSpendMonth = () => {
      if (!affSpendMonth) { setAffSpendMsg({ type: 'err', text: 'Pick a month' }); return }
      const amount = Number(affSpendAmount)
      if (!amount || amount <= 0) { setAffSpendMsg({ type: 'err', text: 'Enter a spend amount greater than 0' }); return }
      const next = { ...affiliateSpend, [affSpendMonth]: amount }
      saveAffiliateSpend(next, 'Saved')
      setAffSpendMonth(''); setAffSpendAmount('')
    }
    const removeAffiliateSpendMonth = (ym) => {
      const next = { ...affiliateSpend }; delete next[ym]
      saveAffiliateSpend(next, 'Removed')
    }
    const disconnectMeta = async () => {
      if (!window.confirm('Disconnect the shared Meta Ads token? Meta Ads, Ask AI, and email reports will stop showing live data for everyone until an admin reconnects.')) return
      setMetaDisconnecting(true); setMetaDisconnectMsg(null)
      try {
        const r = await fetch('/api/meta-token', { method: 'DELETE', credentials: 'include' })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error || 'Failed to disconnect')
        setMetaDisconnectMsg({ type: 'ok', text: 'Disconnected' })
      } catch (e) {
        setMetaDisconnectMsg({ type: 'err', text: e.message })
      } finally {
        setMetaDisconnecting(false)
        setTimeout(() => setMetaDisconnectMsg(null), 5000)
      }
    }
    const saveHealthSchedule = async (next) => {
      const prev = healthSchedule
      setHealthSchedule(next)
      setSavingSchedule(true)
      setScheduleMsg(null)
      try {
        const r = await fetch('/api/preferences', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'source_health_schedule', value: next }) })
        if (!r.ok) throw new Error('Save failed')
        setScheduleMsg({ type: 'ok', text: 'Saved' })
      } catch (e) {
        setHealthSchedule(prev) // revert -- otherwise the UI shows a schedule that was never actually persisted
        setScheduleMsg({ type: 'err', text: e.message })
      } finally {
        setSavingSchedule(false)
      }
    }
    const _shRef = useRef(false)
    useEffect(() => {
      if (activeTab === 'data' && userIsAdmin && !_shRef.current) { _shRef.current = true; getSourceHealth().then(setSourceHealth) }
    }, [activeTab, userIsAdmin])

    const [recentCommits, setRecentCommits] = useState([])
    const [commitsLoading, setCommitsLoading] = useState(false)
    const _rcRef = useRef(false)
    useEffect(() => {
      if (activeTab === 'activity' && userIsAdmin && !_rcRef.current) {
        _rcRef.current = true
        setCommitsLoading(true)
        getRecentCommits(15).then(setRecentCommits).finally(() => setCommitsLoading(false))
      }
    }, [activeTab, userIsAdmin])
    const relTime = (iso) => {
      if (!iso) return ''
      const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
      if (mins < 60) return mins + 'm ago'
      if (mins < 1440) return Math.round(mins / 60) + 'h ago'
      return Math.round(mins / 1440) + 'd ago'
    }

    const addCustomSource = async () => {
      const name = newSourceForm.name.trim(), url = newSourceForm.url.trim()
      if (!name || !url) { setAddSourceMsg({ type: 'err', text: 'Name and URL are both required' }); return }
      const allNames = [...DATA_SOURCES.map(d => d.name), ...customSources.map(s => s.name)]
      if (allNames.some(n => n.toLowerCase() === name.toLowerCase())) {
        setAddSourceMsg({ type: 'err', text: 'A source named "' + name + '" already exists -- pick a different name' })
        return
      }
      const editKey = 'custom_' + Date.now()
      const prev = customSources
      const next = [...customSources, { name, editKey, defaultUrl: url, rows: 'live', custom: true }]
      setCustomSources(next)
      setNewSourceForm({ name: '', url: '' })
      setAddSourceMsg(null)
      try {
        const r = await fetch('/api/preferences', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'custom_data_sources', value: next }) })
        if (!r.ok) throw new Error('Save failed')
        setAddSourceMsg({ type: 'ok', text: 'Added' })
        setAddSourceOpen(false)
        setSourceCatFilter('sheets') // custom sources are always sheet-backed -- jump to the category that now contains it
      } catch (e) {
        setCustomSources(prev) // revert -- otherwise it stays visible (even testable) despite never being persisted, and vanishes on next reload with no explanation
        setAddSourceMsg({ type: 'err', text: e.message })
      }
    }
    const removeCustomSource = async (editKey) => {
      const prev = customSources
      const next = customSources.filter(s => s.editKey !== editKey)
      setCustomSources(next)
      try {
        const r = await fetch('/api/preferences', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'custom_data_sources', value: next }) })
        if (!r.ok) throw new Error('Save failed')
      } catch (e) {
        setCustomSources(prev) // revert -- otherwise it looks deleted but reappears on next reload with no error shown
        toast('Could not remove source: ' + e.message, { type: 'muted' })
      }
    }

  
  // SR Fee
  const [srFeeInput, setSrFeeInput] = useState(() => localStorage.getItem('lq_sr_fee') || '350000')

  // ── Appearance (admin only, server-backed) ────────────────────────────────
  // Server state (what's actually saved)
  const [savedHiddenPages, setSavedHiddenPages] = useState([])
  // Pending state (local changes not yet saved)
  const [hiddenPages, setHiddenPages] = useState([])
  const [prefSaving, setPrefSaving] = useState(false)
  const [prefSaveMsg, setPrefSaveMsg] = useState(null) // { type: 'ok'|'err', text }
  const [prefLoading, setPrefLoading] = useState(true)

  // Load from server on mount (admin only)
  React.useEffect(() => {
    if (!userIsAdmin) { setPrefLoading(false); return }
    fetch('/api/preferences', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { prefs: {} })
      .then(data => {
        const hp = data.prefs?.hidden_pages || []
        const pf = data.prefs || {}
        if (pf.report_from_name != null) setRcName(pf.report_from_name)
        if (pf.report_from_email != null) setRcEmail(pf.report_from_email)
        if (pf.report_subjects) setRcSubjects({ daily: pf.report_subjects.daily || '', weekly: pf.report_subjects.weekly || '', monthly: pf.report_subjects.monthly || '' })
        if (pf.auto_reports_enabled != null) setRcAuto(pf.auto_reports_enabled !== false)
        if (pf.slack_webhook_url != null) setSlackWebhook(pf.slack_webhook_url)
        if (pf.slack_webhook_url_test != null) setSlackWebhookTest(pf.slack_webhook_url_test)
        if (pf.slack_channel_main != null) setSlackChannelMain(pf.slack_channel_main)
        if (Array.isArray(pf.slack_test_channels) && pf.slack_test_channels.length) {
          setSlackTestChannels(pf.slack_test_channels)
        } else if (pf.slack_channel_test) {
          setSlackTestChannels([{ id: 'legacy', name: 'Test channel', channel: pf.slack_channel_test }])
        }
        setGuardedChan(Object.fromEntries(GUARDED.map(c => [c.id, pf[c.pref] != null ? pf[c.pref] : ''])))
        if (pf.slack_auto_reports_enabled != null) setSlackAuto(pf.slack_auto_reports_enabled !== false)
        setSavedHiddenPages(hp)
        setHiddenPages(hp)
        // Also sync to localStorage so Sidebar gets it immediately
        localStorage.setItem('lq_hidden_pages', JSON.stringify(hp))
        window.dispatchEvent(new CustomEvent('lq:hidden-pages-changed', { detail: hp }))
                  const su = {}
                  ;['sheet_url_referral','sheet_url_qlops_daily','sheet_url_qlops_monthly','sheet_url_whatsapp','sheet_url_fbleads','sheet_url_leads_assigned','sheet_url_googleleads','sheet_url_b2c'].forEach(k => { if (pf[k]) su[k] = pf[k] })
                  setSheetUrls(su)
                  setSheetInputs(su)
                  if (Array.isArray(pf.custom_data_sources)) setCustomSources(pf.custom_data_sources)
                  if (pf.source_health_schedule) setHealthSchedule(pf.source_health_schedule)
                  if (pf.ask_ai_monthly_budget_usd != null) setAskaiBudgetInput(String(pf.ask_ai_monthly_budget_usd))
                  if (pf.business_context && typeof pf.business_context === 'object') {
                    // Merge onto the defaults rather than replacing wholesale, so a field
                    // added after this admin last saved still shows its sensible default
                    // instead of silently reverting to blank.
                    setBizFields(prev => ({ ...prev, ...pf.business_context }))
                  }
                  if (pf.affiliate_spend_manual && typeof pf.affiliate_spend_manual === 'object') setAffiliateSpend(pf.affiliate_spend_manual)
      })
      .catch(() => {})
      .finally(() => setPrefLoading(false))
  }, [userIsAdmin])

  const togglePageVisibility = (pageId) => {
    setHiddenPages(prev =>
      prev.includes(pageId) ? prev.filter(id => id !== pageId) : [...prev, pageId]
    )
    setPrefSaveMsg(null) // Clear previous save message
  }

  const hasPendingChanges = JSON.stringify([...hiddenPages].sort()) !== JSON.stringify([...savedHiddenPages].sort())

  const saveHiddenPages = async () => {
    setPrefSaving(true)
    setPrefSaveMsg(null)
    try {
      const r = await fetch('/api/preferences', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'hidden_pages', value: hiddenPages }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed')
      setSavedHiddenPages(hiddenPages)
      // Sync to localStorage + broadcast to Sidebar immediately
      localStorage.setItem('lq_hidden_pages', JSON.stringify(hiddenPages))
      window.dispatchEvent(new CustomEvent('lq:hidden-pages-changed', { detail: hiddenPages }))
      setPrefSaveMsg({ type: 'ok', text: 'Saved — sidebar updated for all users' })
    } catch (e) {
      setPrefSaveMsg({ type: 'err', text: e.message })
    } finally {
      setPrefSaving(false)
    }
  }

      // Splits one CSV line respecting quoted commas (mirrors api/crm-leads.js's splitCsvLine).
      const splitCsvLineClient = (line) => {
        const out = []; let cur = ''; let q = false
        for (let i = 0; i < line.length; i++) {
          const ch = line[i]
          if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else { q = false } } else cur += ch }
          else { if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = '' } else cur += ch }
        }
        out.push(cur)
        return out
      }

      // Best-effort date parser covering the two formats seen across these sheets
      // (DD-Mon-YYYY like '02-Jul-2026', and plain YYYY-MM-DD) so date-coverage
      // diagnostics work generically without hardcoding a column format per sheet.
      const MONTH_ABBR = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 }
      const parseAnyDate = (str) => {
        const s = String(str || '').trim()
        if (!s) return null
        let m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/)
        if (m) { const mon = MONTH_ABBR[m[2].toLowerCase()]; return mon != null ? new Date(+m[3], mon, +m[1]) : null }
        m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
        if (m) return new Date(+m[1], +m[2] - 1, +m[3])
        m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/) // M/D/YYYY, e.g. QL Ops's qualified_date
        if (m) return new Date(+m[3], +m[1] - 1, +m[2])
        return null
      }

      // Fetches the sheet's CSV fresh and uncached (bypasses sheetCache entirely -- the
      // whole point is to prove the connection is live *right now*, not show cached data),
      // reports header columns + row count, and -- if a date-like column is found --
      // a month-by-month row-count breakdown. This is the self-service version of the
      // manual diagnosis (raw curl vs our own API) that caught the FBleads sheet only
      // publishing one month of data: a narrow date spread now shows up here directly,
      // with a warning suggesting the likely cause (an active Filter on the sheet tab).
      // When the source also has a backend API route (apiPath, e.g. FBleads ->
      // /api/crm-leads), a second cache-busted call to that route is compared against
      // the direct-sheet numbers so a stale server-side/CDN cache is visible too --
      // exactly the Vercel edge-cache staleness that made Month-on-Month look wrong
      // even after the sheet itself was already fixed.
      // A Google Sheets link copied from the browser address bar points at the
    // HTML editor (/edit#gid=123), not at CSV. Fetching one returns a full HTML
    // page, which surfaced here as "Got an HTML page instead of CSV -- this
    // sheet may no longer be shared publicly" even when sharing was perfectly
    // fine -- a misleading diagnosis of a URL-shape problem. So rewrite any
    // /spreadsheets/d/<id>/... link to the gviz CSV endpoint, carrying the gid
    // across so the tab the user was looking at is the tab that gets read.
    // Anything that already names a CSV output is passed through untouched.
    const normalizeSheetUrl = (raw) => {
      const u = String(raw || '').trim()
      if (!u) return u
      if (/gviz\/tq|output=csv|format=csv/i.test(u)) return u
      const m = u.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
      if (!m) return u
      const gid = (u.match(/[#&?]gid=(\d+)/) || [])[1]
      return 'https://docs.google.com/spreadsheets/d/' + m[1] + '/gviz/tq?tqx=out:csv' + (gid ? '&gid=' + gid : '')
    }

    const testSheetConnection = async (s) => {
        const key = s.editKey
        const url = normalizeSheetUrl(sheetUrls[key] || s.defaultUrl)
        if (!url) { setSheetTest(prev => ({ ...prev, [key]: { error: 'No sheet URL configured' } })); return }
        setSheetTest(prev => ({ ...prev, [key]: { loading: true } }))
        try {
          const bust = url + (url.includes('?') ? '&' : '?') + '_=' + Date.now()
          const r = await fetch(bust, { cache: 'no-store' })
          if (!r.ok) throw new Error('HTTP ' + r.status)
          const text = await r.text()
          if (text.trim().startsWith('<')) throw new Error('Got an HTML page instead of CSV -- this sheet may no longer be shared publicly. Check its sharing settings.')
          const lines = text.split(/\r?\n/).filter(l => l.length > 0)
          if (lines.length < 1) throw new Error('Empty response')
          const columns = splitCsvLineClient(lines[0]).map(h => h.trim())
          const sampleRows = lines.slice(1, 4).map(l => splitCsvLineClient(l))
          const dateColIdx = columns.findIndex(c => /date/i.test(c))
          let dateCol = null, monthCounts = null, minDate = null, maxDate = null
          if (dateColIdx !== -1) {
            const counts = {}
            for (let i = 1; i < lines.length; i++) {
              const cols = splitCsvLineClient(lines[i])
              const d = parseAnyDate(cols[dateColIdx])
              if (!d) continue
              const key2 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
              counts[key2] = (counts[key2] || 0) + 1
              if (!minDate || d < minDate) minDate = d
              if (!maxDate || d > maxDate) maxDate = d
            }
            const entries = Object.entries(counts).sort((a, b) => a[0] < b[0] ? 1 : -1)
            if (entries.length) { dateCol = columns[dateColIdx]; monthCounts = entries }
          }
          let apiCompare = null
          if (s.apiPath) {
            try {
              // Some apiPaths already carry a query string (e.g. /api/crm-leads?source=b2c).
          // Appending a bare '?_=' produced '...?source=b2c?_=123', so source parsed as
          // 'b2c?_=123', missed the router, and fell through to the default CRM handler --
          // the cross-check then compared the B2C sheet against 17,731 CRM rows and cried
          // stale. Join with '&' when a query string is already present.
          const bustJoin = s.apiPath.includes('?') ? '&' : '?'
          const ar = await fetch(s.apiPath + bustJoin + '_=' + Date.now(), { credentials: 'include', cache: 'no-store' })
              if (ar.ok) {
                const aj = await ar.json()
                const apiDates = Object.keys(aj.byDate || {}).sort()
                apiCompare = { rows: aj.rows, firstDate: apiDates[0] || null, lastDate: apiDates[apiDates.length - 1] || null, distinctDates: apiDates.length }
              }
            } catch {}
          }
          const rowCount = lines.length - 1
          // Rolling baseline (localStorage) -- diffs this check against the LAST check for this
          // source, so schema changes (columns added/removed) and sudden row-count swings surface
          // immediately instead of needing a manual before/after comparison.
          const baselineKey = 'lq_source_baseline_' + key
          let drift = null
          try {
            const baseline = JSON.parse(localStorage.getItem(baselineKey) || 'null')
            if (baseline) {
              const addedCols = columns.filter(c => !baseline.columns.includes(c))
              const removedCols = baseline.columns.filter(c => !columns.includes(c))
              const rowDeltaPct = baseline.rowCount > 0 ? Math.round((rowCount - baseline.rowCount) / baseline.rowCount * 100) : null
              if (addedCols.length || removedCols.length || (rowDeltaPct != null && Math.abs(rowDeltaPct) >= 20)) {
                drift = { addedCols, removedCols, rowDeltaPct, sinceTs: baseline.ts }
              }
            }
            localStorage.setItem(baselineKey, JSON.stringify({ columns, rowCount, ts: Date.now() }))
          } catch {}
          setSheetTest(prev => ({ ...prev, [key]: { columns, columnCount: columns.length, rowCount, sampleRows, dateCol, monthCounts, minDate, maxDate, apiCompare, drift, ts: Date.now() } }))
        } catch (e) {
          setSheetTest(prev => ({ ...prev, [key]: { error: e.message || 'Fetch failed' } }))
        }
      }

      const exportDiagnostics = (s) => {
        const data = sheetTest[s.editKey]
        if (!data) return
        const blob = new Blob([JSON.stringify({ source: s.name, ...data }, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = s.name.replace(/[^a-z0-9]+/gi, '_') + '_diagnostics_' + new Date().toISOString().slice(0, 10) + '.json'
        a.click()
        URL.revokeObjectURL(url)
      }

      const checkAllSources = async () => {
        setCheckingAll(true)
        const all = [...DATA_SOURCES.filter(s => s.editKey), ...customSources]
        for (const s of all) { await testSheetConnection(s) }
        setCheckingAll(false)
      }

      const saveSheetUrl = async (key) => {
              const url = normalizeSheetUrl(sheetInputs[key] || '')
              setSheetSaving(prev => ({ ...prev, [key]: true }))
              setSheetMsg(prev => ({ ...prev, [key]: null }))
              try {
                        const r = await fetch('/api/preferences', {
                                    method: 'POST',
                                    credentials: 'include',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ key, value: url }),
                        })
                        const data = await r.json()
                        if (!r.ok) throw new Error(data.error || 'Failed')
                        setSheetUrls(prev => ({ ...prev, [key]: url }))
                        setSheetMsg(prev => ({ ...prev, [key]: { type: 'ok', text: 'Saved' } }))
              } catch (e) {
                        setSheetMsg(prev => ({ ...prev, [key]: { type: 'err', text: e.message } }))
              } finally {
                        setSheetSaving(prev => ({ ...prev, [key]: false }))
              }
      }

  // Live design-system pickers (Button / KPI card / Login page) -- selecting
  // any one saves to Supabase (app_preferences, admin-only) so it applies for
  // every signed-in user, not just this browser, then instantly re-skins every
  // matching component locally too via a same-tab CustomEvent, no reload needed.
  // useDesignStyle keeps this picker's own highlight in sync.
  const buttonStyleId = useDesignStyle('button')
  const kpiStyleId = useDesignStyle('kpi')
  const DESIGN_KIND_LABEL = { button: 'Button', kpi: 'KPI card' }

  const pickDesignStyle = async (kind, id) => {
    const { success, error } = await saveDesignStyle(kind, id)
    const label = DESIGN_KIND_LABEL[kind] || 'Style'
    const scope = kind === 'login' ? 'applies next time anyone signs in' : 'applies for everyone now'
    if (success) toast(`${label} style saved — ${scope}.`, { type: 'success' })
    else toast('Saved locally only -- ' + error, { type: 'muted' })
  }

  const [activeTheme, setActiveTheme] = useState(() => localStorage.getItem('lq_theme') || 'light')
  const applyTheme = (themeId) => {
    setActiveTheme(themeId)
    localStorage.setItem('lq_theme', themeId)
    document.documentElement.setAttribute('data-theme', themeId)
  }
  // Apply saved theme on mount
  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', activeTheme)
  }, [])

  const THEMES = [
    {
      id: 'light',
      name: 'Light',
      desc: 'Clean white — the default',
      preview: ['#F4F6F9', '#FFFFFF', '#1F3C84'],
    },
    {
      id: 'dark',
      name: 'Dark',
      desc: 'Dark slate — easy on the eyes',
      preview: ['#0F172A', '#1E293B', '#1F3C84'],
    },
    {
      id: 'navy',
      name: 'Navy Depth',
      desc: 'Deep navy — premium dashboard look',
      preview: ['#0D1B40', '#162155', '#1F3C84'],
    },
    {
      id: 'stone',
      name: 'Stone',
      desc: 'Warm neutral — calm and focused',
      preview: ['#F5F5F0', '#FAFAF8', '#1F3C84'],
    },
  ]

  // KPI icon preferences (per metric slot)
  const [kpiIcons, setKpiIcons] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lq_kpi_icons') || '{}') } catch { return {} }
  })

  // ── Layout preferences ───────────────────────────────────────────────────
  const [sidebarMode, setSidebarMode] = useState(() => localStorage.getItem('lq_sidebar_mode') || 'default')
  const applySidebarMode = (mode) => {
    setSidebarMode(mode)
    localStorage.setItem('lq_sidebar_mode', mode)
    // Collapse state: icon-only = collapsed=true, default/wide = collapsed=false
    const collapsed = mode === 'compact'
    localStorage.setItem('lq_sidebar_collapsed', String(collapsed))
    window.dispatchEvent(new CustomEvent('lq:sidebar-mode-changed', { detail: { mode, collapsed } }))
  }

  const SIDEBAR_MODES = [
    { id: 'compact',  label: 'Compact',  desc: 'Icon-only — maximum data space',     icon: '⟵' },
    { id: 'default',  label: 'Default',  desc: '232px — labels + icons',              icon: '☰' },
    { id: 'wide',     label: 'Wide',     desc: '280px — more breathing room',          icon: '⟹' },
  ]

  // Number format
  const [numberFormat, setNumberFormat] = useState(() => localStorage.getItem('lq_number_format') || 'indian')
  const applyNumberFormat = (fmt) => {
    setNumberFormat(fmt)
    localStorage.setItem('lq_number_format', fmt)
    window.dispatchEvent(new CustomEvent('lq:number-format-changed', { detail: fmt }))
  }
  const NUMBER_FORMATS = [
    { id: 'indian',       label: 'Indian',       example: '₹1,00,000 · 6.1L · 1.2Cr',  desc: 'Lakh / Crore notation' },
    { id: 'international',label: 'International', example: '₹100,000 · 61K · 1.2M',     desc: 'Thousand / Million' },
    { id: 'compact',      label: 'Compact',       example: '₹1L · ₹1Cr · 61K',          desc: 'Always abbreviated' },
  ]

  // Default date range
  const [defaultDateRange, setDefaultDateRange] = useState(() => localStorage.getItem('lq_default_date') || 'last_7d')
  const applyDefaultDate = (range) => {
    setDefaultDateRange(range)
    localStorage.setItem('lq_default_date', range)
  }
  const DATE_RANGES = [
    { id: 'yesterday',  label: 'Yesterday',       desc: 'Prior day only' },
    { id: 'last_7d',    label: 'Last 7 days',      desc: 'Rolling 7-day window' },
    { id: 'last_30d',   label: 'Last 30 days',     desc: 'Rolling 30-day window' },
    { id: 'mtd',        label: 'Month to date',    desc: 'Current month so far' },
    { id: 'last_month', label: 'Last month',       desc: 'Previous full month' },
  ]

  // Table density
  const [tableDensity, setTableDensity] = useState(() => localStorage.getItem('lq_table_density') || 'comfortable')
  const applyDensity = (d) => {
    setTableDensity(d)
    localStorage.setItem('lq_table_density', d)
    document.documentElement.setAttribute('data-density', d)
    window.dispatchEvent(new CustomEvent('lq:density-changed', { detail: d }))
  }
  React.useEffect(() => {
    document.documentElement.setAttribute('data-density', tableDensity)
  }, [])
  const DENSITIES = [
    { id: 'compact',      label: 'Compact',      rowH: '10px 12px',  desc: 'Tight rows — show more data' },
    { id: 'comfortable',  label: 'Comfortable',  rowH: '14px 16px',  desc: 'Balanced — default' },
    { id: 'spacious',     label: 'Spacious',     rowH: '18px 20px',  desc: 'Airy rows — easier scanning' },
  ]
  const KPI_ICON_SETS = {
    spend:       { label: 'Spend / Cost',   icons: ['rupee','dollar','wallet','card','chart-bar'] },
    leads:       { label: 'Leads / Opps',   icons: ['users','person','funnel','target','star'] },
    rate:        { label: 'Rates / %',      icons: ['percent','trending','activity','pulse','zap'] },
    revenue:     { label: 'Revenue',        icons: ['trending-up','coin','gift','building','check'] },
    messaging:   { label: 'Messages',       icons: ['message','mail','send','bell','chat'] },
    misc:        { label: 'General',        icons: ['grid','layers','cube','diamond','eye'] },
  }
  const setKpiIcon = (slot, icon) => {
    setKpiIcons(prev => {
      const next = { ...prev, [slot]: icon }
      localStorage.setItem('lq_kpi_icons', JSON.stringify(next))
      return next
    })
  }
  const [srFeeSaved, setSrFeeSaved] = useState(false)
  const saveSrFee = () => {
    const v = parseInt(srFeeInput)
    if (isNaN(v) || v <= 0) return
    localStorage.setItem('lq_sr_fee', String(v))
    setSrFeeSaved(true)
    setTimeout(() => setSrFeeSaved(false), 2000)
  }

  // Users
  const [accessList, setAccessList] = useState([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [accessMsg, setAccessMsg] = useState('')
  const [addMemberOpen, setAddMemberOpen] = useState(false)
  // --- Report config (sender, subjects, auto switch) ---
  const [rcName, setRcName] = useState('')
  const [rcEmail, setRcEmail] = useState('')
  const [rcSubjects, setRcSubjects] = useState({ daily: '', weekly: '', monthly: '' })
  const [rcAuto, setRcAuto] = useState(true)
  const [rcSaving, setRcSaving] = useState(false)
  const [rcMsg, setRcMsg] = useState('')
  const [rcTesting, setRcTesting] = useState(false)
  const [rcSendType, setRcSendType] = useState('daily')
  const [rcSending, setRcSending] = useState(false)
  // --- Unassigned Leads alert (fixed recipient, not the general opt-in list) ---
  const [unassignedSending, setUnassignedSending] = useState(false)
  const [unassignedMsg, setUnassignedMsg] = useState('')
  // --- Slack config (webhook + auto-post toggle) ---
  const [slackWebhook, setSlackWebhook] = useState('')
  // An Incoming Webhook is bound to one channel, so a test channel needs its own webhook --
  // there's no way to redirect a post at send time.
  const [slackWebhookTest, setSlackWebhookTest] = useState('')
  // Channel names only. The bot token is deliberately NOT stored here: app_preferences has
  // RLS disabled and is readable with the public anon key from the client bundle, so it
  // would be effectively public. It lives in the Vercel env as SLACK_BOT_TOKEN.
  const [slackChannelMain, setSlackChannelMain] = useState('')
  // Multiple named test channels: [{id, name, channel}, ...]. A pre-existing single
  // slack_channel_test value is migrated into this list on load (id 'legacy') so an
  // account configured before this existed keeps working with zero manual steps --
  // saving from here then "graduates" it into the array format for good.
  const [slackTestChannels, setSlackTestChannels] = useState([])
  const [newTestChanName, setNewTestChanName] = useState('')
  const [newTestChanValue, setNewTestChanValue] = useState('')
  const [slackTestPick, setSlackTestPick] = useState('')
  const [guardedChan, setGuardedChan] = useState({})
  // The CEO PIN is managed through its own endpoint, never through preferences,
  // so nothing about it is ever held in this page's state except its status.
  const [ceoPinInfo, setCeoPinInfo] = useState(null)
  const [ceoPinCur, setCeoPinCur] = useState('')
  const [ceoPinNew, setCeoPinNew] = useState('')
  const [ceoPinNew2, setCeoPinNew2] = useState('')
  const [ceoPinBusy, setCeoPinBusy] = useState(false)
  const [ceoPinMsg, setCeoPinMsg] = useState('')
  const [slackAuto, setSlackAuto] = useState(true)
  const [slackCfgSaving, setSlackCfgSaving] = useState(false)
  const [slackCfgMsg, setSlackCfgMsg] = useState('')
  const [slackTesting, setSlackTesting] = useState(false)
  // Keyed by mode ('leads'/'opportunities') so the two LeadSquared rows in Data Sources
  // (below) can each show independent test state, same pattern as sheetTest/sheetMsg.
  const [lsqTesting, setLsqTesting] = useState(null)
  const [lsqMsg, setLsqMsg] = useState({})
  // Round-trips through /api/crm-leads?source=leadsquared so an admin can validate the
  // LEADSQUARED_ACCESS_KEY/SECRET_KEY/API_HOST env vars without me ever seeing the actual
  // keys -- I can't test this integration myself for the same reason.
  const testLeadSquared = async mode => {
    setLsqTesting(mode); setLsqMsg(m => ({ ...m, [mode]: null }))
    try {
      const r = await fetch(`/api/crm-leads?source=leadsquared&mode=${mode}&pageSize=5`, { credentials: 'include' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed')
      setLsqMsg(m => ({ ...m, [mode]: { type: 'ok', text: `Got ${d.count ?? (d.rows || []).length} record(s)` } }))
    } catch (e) { setLsqMsg(m => ({ ...m, [mode]: { type: 'err', text: e.message } })) }
    finally { setLsqTesting(null) }
  }
  // BigQuery connection test. Same shape as sheetTest/lsqMsg above. Uses the
  // 'datasets' mode because it is metadata-only -- it proves the refresh token,
  // the project and the region all work while scanning zero bytes, so an admin
  // can hammer this button without ever running up a query bill.
  const [bqTesting, setBqTesting] = useState(false)
  const [bqMsg, setBqMsg] = useState(null)
  const testBigQuery = async () => {
    setBqTesting(true); setBqMsg(null)
    try {
      const r = await fetch('/api/crm-leads?source=bigquery&mode=datasets', { credentials: 'include' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed')
      const shown = (d.datasets || []).slice(0, 4).join(', ')
      const more = d.count > 4 ? ' +' + (d.count - 4) + ' more' : ''
      setBqMsg({ type: 'ok', text: 'Connected to ' + d.projectId + ' (' + d.location + ') - ' + d.count + ' dataset(s)' + (shown ? ': ' + shown + more : '') })
    } catch (e) {
      setBqMsg({ type: 'err', text: e.message })
    } finally {
      setBqTesting(false)
    }
  }

  // BigQuery console state. The real safety net is assertReadOnly() in
  // lib/bigquery.mjs -- anything that is not SELECT / WITH is refused
  // server-side, so nothing typed here can change a row. Every Run is
  // preceded by a dry run so the scan cost is known before a rupee is
  // spent, and maxBytes travels with the real call as a hard ceiling in
  // case the estimate turns out to be wrong.
  const BQ_MAX_BYTES = 21474836480
  const BQ_CONFIRM_BYTES = 2147483648
  const [bqSql, setBqSql] = useState('')
  const [bqLimit, setBqLimit] = useState('500')
  const [bqBusy, setBqBusy] = useState('')
  const [bqErr, setBqErr] = useState('')
  const [bqWarn, setBqWarn] = useState('')
  const [bqEst, setBqEst] = useState(null)
  const [bqRes, setBqRes] = useState(null)
  const [bqArmed, setBqArmed] = useState('')
  const BQ_SAVED_KEY = 'bq_saved_queries'
  const bqSlug = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60)
  const [bqSaved, setBqSaved] = useState([])
  const [bqName, setBqName] = useState('')
  const [bqPick, setBqPick] = useState('')
  const [bqSaveMsg, setBqSaveMsg] = useState('')
  const [bqSaveBusy, setBqSaveBusy] = useState(false)
  const [bqDelArmed, setBqDelArmed] = useState('')
  const bqBytes = (n) => {
    const b = Number(n || 0)
    if (b < 1024) return b + ' B'
    const u = ['KB', 'MB', 'GB', 'TB']
    let i = -1, v = b
    while (v >= 1024 && i < 3) { v = v / 1024; i++ }
    return v.toFixed(v < 10 ? 2 : 1) + ' ' + u[i]
  }
  // On-demand BigQuery bills roughly USD 6.25 per TiB scanned. Shown in
  // rupees at a flat 88 so the number means something locally. It is an
  // approximation on purpose -- the point is the order of magnitude.
  const bqCost = (n) => {
    const rs = (Number(n || 0) / 1099511627776) * 6.25 * 88
    if (rs < 0.01) return 'under 1 paisa'
    return 'about \u20B9' + (rs < 1 ? rs.toFixed(2) : Math.round(rs).toLocaleString('en-IN'))
  }
  const bqCell = (v) => {
    if (v === null || v === undefined) return '\u2014'
    if (typeof v === 'object') return JSON.stringify(v)
    if (typeof v === 'boolean') return v ? 'true' : 'false'
    if (typeof v === 'number') return v.toLocaleString('en-IN', { maximumFractionDigits: 6 })
    return String(v)
  }
  const bqCall = async (extra) => {
    const r = await fetch('/api/crm-leads?source=bigquery&mode=query' + extra, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ sql: bqSql }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok || d.error) throw new Error(d.error || ('Request failed (' + r.status + ')'))
    return d
  }
  const bqEstimate = async () => {
    if (!String(bqSql || '').trim()) { setBqErr('Nothing to estimate.'); return }
    setBqErr(''); setBqWarn(''); setBqRes(null); setBqBusy('est')
    try {
      setBqEst(await bqCall('&dryRun=1'))
    } catch (e) {
      setBqEst(null); setBqErr(e.message)
    } finally {
      setBqBusy('')
    }
  }
  const bqRun = async () => {
    const sql = String(bqSql || '').trim()
    if (!sql) { setBqErr('Nothing to run.'); return }
    setBqErr(''); setBqWarn(''); setBqBusy('run')
    try {
      const est = await bqCall('&dryRun=1')
      const bytes = Number(est.totalBytesProcessed || 0)
      setBqEst(est)
      if (bytes > BQ_CONFIRM_BYTES && bqArmed !== sql) {
        setBqArmed(sql)
        setBqWarn('This scans ' + bqBytes(bytes) + ' (' + bqCost(bytes) + '). Press Run again to go ahead.')
        return
      }
      const t0 = Date.now()
      const d = await bqCall('&maxResults=' + bqLimit + '&maxBytes=' + BQ_MAX_BYTES)
      setBqRes({ ...d, ms: Date.now() - t0 })
      setBqArmed('')
    } catch (e) {
      setBqRes(null); setBqEst(null); setBqErr(e.message)
    } finally {
      setBqBusy('')
    }
  }

  const bqFetchSaved = async () => {
    try {
      const r = await fetch('/api/preferences', { credentials: 'include' })
      const d = r.ok ? await r.json() : { prefs: {} }
      const list = d && d.prefs ? d.prefs[BQ_SAVED_KEY] : null
      setBqSaved(Array.isArray(list) ? list : [])
    } catch (e) {
      setBqSaved([])
    }
  }
  React.useEffect(() => {
    if (userIsAdmin) bqFetchSaved()
  }, [userIsAdmin])
  const bqPersist = async (list) => {
    const r = await fetch('/api/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ key: BQ_SAVED_KEY, value: list }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok || d.error) throw new Error(d.error || 'Save failed')
  }
  const bqSave = async () => {
    const sql = String(bqSql || '').trim()
    const name = String(bqName || '').trim()
    if (!sql) { setBqSaveMsg('Nothing to save.'); return }
    if (!name) { setBqSaveMsg('Give the query a name first.'); return }
    const id = bqSlug(name)
    if (!id) { setBqSaveMsg('That name needs at least one letter or number.'); return }
    setBqSaveBusy(true); setBqSaveMsg('')
    try {
      const next = bqSaved
        .filter((q) => q && q.id !== id)
        .concat([{ id, name, sql, updatedAt: new Date().toISOString() }])
        .sort((a, b) => String(a.name).localeCompare(String(b.name)))
      await bqPersist(next)
      setBqSaved(next); setBqPick(id); setBqDelArmed('')
      setBqSaveMsg('Saved as \u201C' + name + '\u201D \u00B7 id ' + id)
    } catch (e) {
      setBqSaveMsg(e.message)
    } finally {
      setBqSaveBusy(false)
    }
  }
  const bqLoad = (id) => {
    const q = bqSaved.find((x) => x && x.id === id)
    if (!q) return
    setBqSql(String(q.sql || '')); setBqName(String(q.name || ''))
    setBqRes(null); setBqEst(null); setBqErr(''); setBqWarn(''); setBqArmed('')
    setBqSaveMsg('Loaded \u201C' + q.name + '\u201D \u2014 nothing has run yet.')
  }
  const bqRemove = async (id) => {
    const q = bqSaved.find((x) => x && x.id === id)
    if (!q) return
    if (bqDelArmed !== id) {
      setBqDelArmed(id)
      setBqSaveMsg('Press Remove again to drop \u201C' + q.name + '\u201D from the list.')
      return
    }
    setBqSaveBusy(true)
    try {
      const next = bqSaved.filter((x) => x && x.id !== id)
      await bqPersist(next)
      setBqSaved(next); setBqPick(''); setBqDelArmed('')
      setBqSaveMsg('Removed \u201C' + q.name + '\u201D. The SQL is still in the box above.')
    } catch (e) {
      setBqSaveMsg(e.message)
    } finally {
      setBqSaveBusy(false)
    }
  }
  const [editReportOpen, setEditReportOpen] = useState(false)
  const [sendReportOpen, setSendReportOpen] = useState(false)
  const [recipientsOpen, setRecipientsOpen] = useState(false)
  const [sendAudience, setSendAudience] = useState('test')
  const [rpType, setRpType] = useState('daily')
  const [rpView, setRpView] = useState('desktop')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [recipSearch, setRecipSearch] = useState('')
  const [bulkType, setBulkType] = useState(null)
  const [editingUser, setEditingUser] = useState(null)
  const [editIds, setEditIds] = useState([])
  const [editIsAdmin, setEditIsAdmin] = useState(false)
  const [editIsViewer, setEditIsViewer] = useState(false)
  const [editJobTitle, setEditJobTitle] = useState('')
  const [editDepartment, setEditDepartment] = useState('')

  const loadUsers = async () => {
    setUsersLoading(true)
    const _al = await getAccessList(); setAccessList(Array.isArray(_al) ? _al : [])
    setUsersLoading(false)
  }
  useEffect(() => { if (userIsAdmin) loadUsers() }, [userIsAdmin])

  const [userSearch, setUserSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')

  const setMsg = (m) => { setAccessMsg(m); setTimeout(() => setAccessMsg(''), 4000) }
  const isOkMsg = accessMsg.startsWith('Added') || accessMsg.startsWith('Access') || accessMsg.startsWith('Removed')

  const roleGroup = (role) => {
    if (role === 'admin') return 'admin'
    if (role === 'viewer') return 'viewer'
    return 'custom'
  }
  const filteredUsers = accessList.filter(u => {
    const q = userSearch.trim().toLowerCase()
    const matchesSearch = !q || u.email.toLowerCase().includes(q)
    const matchesRole = roleFilter === 'all' || roleGroup(u.role) === roleFilter
    return matchesSearch && matchesRole
  })
  const stats = {
    total: accessList.length,
    admins: accessList.filter(u => u.role === 'admin').length,
    members: accessList.filter(u => u.role !== 'admin').length,
    reports: accessList.filter(u => u.receive_reports).length,
  }
  const parsePermissions = (role) => {
    if (role === 'admin') return DASHBOARDS.map(d => d.id)
    // plain viewer = all dashboards except ask-ai
    if (!role || role === 'viewer') return DASHBOARDS.filter(d => d.id !== 'ask_ai').map(d => d.id)
    if (role.startsWith('viewer:')) return role.replace('viewer:', '').split(',').filter(Boolean)
    if (role.startsWith('custom:')) return role.replace('custom:', '').split(',').filter(Boolean)
    return DASHBOARDS.filter(d => d.id !== 'ask_ai').map(d => d.id)
  }
  const buildRoleString = (ids, isAdmin) => {
    if (isAdmin) return 'admin'
    // always store explicit list so access is unambiguous
    return 'viewer:' + ids.join(',')
  }

  const accessLabel = (role) => {
    if (role === 'admin' || role === 'viewer') return 'All dashboards'
    if (role === 'roas_only') return 'ROAS only'
    const n = parsePermissions(role).length
    return n + (n === 1 ? ' dashboard' : ' dashboards')
  }
  const fmtDate = (d) => {
    if (!d) return '—'
    try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) }
    catch { return '—' }
  }

  const addUser = async () => {
    const email = newEmail.trim().toLowerCase()
    if (!email.endsWith('@leverageedu.com')) { setMsg('Only @leverageedu.com emails allowed'); return }
    if (accessList.find(u => u.email === email)) { setMsg('Already has access'); return }
    setUsersLoading(true)
    if (await addUserAccess(email, 'viewer', user?.email)) { setMsg('Added: ' + email); setNewEmail(''); setAddMemberOpen(false); await loadUsers() }
    else setMsg('Failed to add')
    setUsersLoading(false)
  }
  const removeUser = async (email) => {
    if (email === user?.email) { setMsg("Can't remove yourself"); return }
    setUsersLoading(true)
    if (await removeUserAccess(email)) { setMsg('Removed: ' + email); await loadUsers() }
    else setMsg('Failed')
    setUsersLoading(false)
  }
  const startEdit = (u) => {
    setEditingUser(u.email)
    const isAdmin = u.role === 'admin'
    setEditIsAdmin(isAdmin)
    setEditIsViewer(!isAdmin)
    setEditIds(parsePermissions(u.role))
    setEditJobTitle(u.job_title || '')
    setEditDepartment(u.department || '')
  }
  const saveEdit = async (email) => {
    setUsersLoading(true)
    const role = buildRoleString(editIds, editIsAdmin)
    const ok = await updateUserRole(email, role)
    await fetch('/api/users', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, job_title: editJobTitle, department: editDepartment }) })
    if (ok) { setMsg('Access updated'); await loadUsers() } else setMsg('Failed')
    setEditingUser(null)
    setUsersLoading(false)
  }
  const toggleReports = async (u, checked) => {
    await fetch('/api/users', {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: u.email, receive_reports: checked }),
    })
    loadUsers()
  }

  const toggleReportType = async (u, type, checked) => {
    const current = Array.isArray(u.report_types) && u.report_types.length ? u.report_types : ['daily','weekly','monthly']
    const next = checked ? Array.from(new Set([...current, type])) : current.filter(t => t !== type)
    await fetch('/api/users', {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: u.email, report_types: next }),
    })
    loadUsers()
  }

  // Bulk-toggle one report type across a set of recipients (e.g. the search-filtered list).
  // If everyone in the set already has it on, turns it off for everyone; otherwise turns it on for everyone.
  const bulkToggleReportType = async (recipients, type) => {
    if (!recipients.length || bulkType) return
    const allOn = recipients.every(u => {
      const types = Array.isArray(u.report_types) && u.report_types.length ? u.report_types : ['daily', 'weekly', 'monthly']
      return types.includes(type)
    })
    const nextChecked = !allOn
    setBulkType(type)
    try {
      await Promise.all(recipients.map(u => {
        const current = Array.isArray(u.report_types) && u.report_types.length ? u.report_types : ['daily', 'weekly', 'monthly']
        const next = nextChecked ? Array.from(new Set([...current, type])) : current.filter(t => t !== type)
        return fetch('/api/users', {
          method: 'PATCH', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: u.email, report_types: next }),
        })
      }))
    } finally {
      setBulkType(null)
      loadUsers()
    }
  }

  const saveReportConfig = async () => {
    setRcSaving(true); setRcMsg('')
    try {
      const subj = { daily: rcSubjects.daily || '', weekly: rcSubjects.weekly || '', monthly: rcSubjects.monthly || '' }
      const entries = [
        ['report_from_name', rcName.trim()],
        ['report_from_email', rcEmail.trim()],
        ['report_subjects', subj],
        ['auto_reports_enabled', rcAuto],
      ]
      for (const [key, value] of entries) {
        const r = await fetch('/api/preferences', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value }),
        })
        if (!r.ok) throw new Error('Failed to save ' + key)
      }
      setRcMsg('Saved \u2713 report settings updated')
    } catch (e) { setRcMsg('\u2715 ' + e.message) }
    finally { setRcSaving(false); setTimeout(() => setRcMsg(''), 5000) }
  }

  // Status only: whether a PIN exists, who set it, and whether we are locked out.
  // Never the PIN, never the hash, never the salt or the pepper.
  const loadCeoPin = async () => {
    try {
      const r = await fetch('/api/send-report', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ceo_pin', action: 'status' }),
      })
      setCeoPinInfo(r.ok ? await r.json() : { set: false, denied: true })
    } catch { setCeoPinInfo({ set: false, denied: true }) }
  }
  useEffect(() => { loadCeoPin() }, [])

  const saveCeoPin = async () => {
    setCeoPinMsg('')
    if (ceoPinNew !== ceoPinNew2) { setCeoPinMsg('x The two PINs do not match'); return }
    setCeoPinBusy(true)
    try {
      const r = await fetch('/api/send-report', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ceo_pin', action: 'set', pin: ceoPinNew, currentPin: ceoPinCur }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error([
        d.error || 'Could not save the PIN',
        d.failsLeft != null ? d.failsLeft + ' tries left' : null,
        d.lockedForSec ? 'locked for ' + Math.ceil(d.lockedForSec / 60) + ' min' : null,
      ].filter(Boolean).join(' \u2014 '))
      setCeoPinCur(''); setCeoPinNew(''); setCeoPinNew2('')
      setCeoPinMsg('\u2713 PIN saved')
      loadCeoPin()
    } catch (e) {
      setCeoPinMsg('x ' + e.message)
    } finally {
      setCeoPinBusy(false); setTimeout(() => setCeoPinMsg(''), 8000)
    }
  }

  const saveSlackConfig = async () => {
    setSlackCfgSaving(true); setSlackCfgMsg('')
    try {
      const entries = [
        ['slack_webhook_url', slackWebhook.trim()],
        ['slack_webhook_url_test', slackWebhookTest.trim()],
        ['slack_channel_main', slackChannelMain.trim()],
        ['slack_test_channels', slackTestChannels.filter(c => c.name.trim() && c.channel.trim())],
        ...GUARDED.map(c => [c.pref, String(guardedChan[c.id] || '').trim()]),
        ['slack_auto_reports_enabled', slackAuto],
      ]
      for (const [key, value] of entries) {
        const r = await fetch('/api/preferences', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value }),
        })
        if (!r.ok) throw new Error('Failed to save ' + key)
      }
      setSlackCfgMsg('Saved ✓')
    } catch (e) { setSlackCfgMsg('✕ ' + e.message) }
    finally { setSlackCfgSaving(false); setTimeout(() => setSlackCfgMsg(''), 5000) }
  }

  const sendSlackTest = async () => {
    setSlackTesting(true); setSlackCfgMsg('')
    try {
      const pick = slackTestPick || (slackTestChannels[0] && slackTestChannels[0].id) || ''
      const r = await fetch('/api/send-report', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'slack_test', slackTarget: pick ? 'test:' + pick : 'test' }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed')
      setSlackCfgMsg(`Posted to the ${d.channel || 'test channel'} via ${d.mode === 'bot' ? 'the bot' : 'webhook'} ✓`)
    } catch (e) { setSlackCfgMsg('✕ ' + e.message) }
    finally { setSlackTesting(false); setTimeout(() => setSlackCfgMsg(''), 6000) }
  }

  const addTestChannel = () => {
    const name = newTestChanName.trim(), channel = newTestChanValue.trim()
    if (!name || !channel) return
    const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 't_' + Math.random().toString(36).slice(2)
    setSlackTestChannels(list => [...list, { id, name, channel }])
    setNewTestChanName(''); setNewTestChanValue('')
  }
  const updateTestChannel = (id, patch) => {
    setSlackTestChannels(list => list.map(c => c.id === id ? { ...c, ...patch } : c))
  }
  const removeTestChannel = id => {
    setSlackTestChannels(list => list.filter(c => c.id !== id))
    setSlackTestPick(p => p === id ? '' : p)
  }

  const sendTestReport = async () => {
    setRcTesting(true); setRcMsg('')
    try {
      const r = await fetch('/api/send-report', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: rcSendType, recipients: [user?.email].filter(Boolean), triggered_by: 'test' }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed')
      setRcMsg('Test sent \u2713 to ' + (d.recipients?.join(', ') || user?.email))
    } catch (e) { setRcMsg('\u2715 ' + e.message) }
    finally { setRcTesting(false); setTimeout(() => setRcMsg(''), 6000) }
  }

  const sendReportNow = async () => {
setRcSending(true); setRcMsg('')
try {
  const r = await fetch('/api/send-report', {
  method: 'POST', credentials: 'include',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ type: rcSendType, triggered_by: user?.email || 'manual' })
})
const d = await r.json()
if (!r.ok) throw new Error(d.error || 'Failed')
setRcMsg('Sent to ' + (d.recipients?.length || 0) + ' recipients')
} catch (e) { setRcMsg('\u2715 ' + e.message) }
finally { setRcSending(false); setTimeout(() => setRcMsg(''), 6000) }
}

  const sendUnassignedNow = async () => {
    setUnassignedSending(true); setUnassignedMsg('')
    try {
      const r = await fetch('/api/send-report', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'unassigned_leads', triggered_by: user?.email || 'manual' })
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed')
      setUnassignedMsg('Sent \u2014 ' + (d.total ?? '?') + ' unassigned leads (' + (d.humanCount ?? '?') + ' human, ' + (d.aiCount ?? '?') + ' AI)')
    } catch (e) { setUnassignedMsg('\u2715 ' + e.message) }
    finally { setUnassignedSending(false); setTimeout(() => setUnassignedMsg(''), 8000) }
  }

  const TABS = [
    ...(userIsAdmin ? [{ id: 'data', label: 'Data', icon: 'layers' }] : []),
    ...(userIsAdmin ? [{ id: 'users', label: 'User Access', icon: 'users' }, { id: 'activity', label: 'Activity Log', icon: 'activity' }] : []),
    ...(userIsAdmin ? [{ id: 'reports', label: 'Reports', icon: 'mail' }] : []),
    ...(userIsAdmin ? [{ id: 'askai', label: 'Ask AI', icon: 'chat' }] : []),
    ...(userIsAdmin ? [{ id: 'appearance', label: 'Appearance', icon: 'eye' }] : []),
    { id: 'profile', label: 'Profile', icon: 'person' },
  ]

  return (
    <div className={styles.layout}>
      <Sidebar />
      <div className={styles.main}>
        <div className={styles.header}>
          <p className={styles.breadcrumb}>Settings</p>
          <h1 className={styles.title}>Settings</h1>
          <p className={styles.titleSub}>Manage data, access, reports, and how Quantum looks for your workspace.</p>
        </div>

        <div className={styles.content}>
          <div className={styles.tabBar}>
            {TABS.map(t => (
              <button key={t.id}
                className={`${styles.tab} ${activeTab === t.id ? styles.tabActive : ''}`}
                onClick={() => setActiveTab(t.id)}>
                <KpiIconPreview name={t.icon} color="currentColor" />
                {t.label}
              </button>
            ))}
          </div>

          {/* ---------------- DATA ---------------- */}
          {activeTab === 'data' && userIsAdmin && (
            <>
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>BigQuery Console</h3>
              <p className={styles.cardDesc}>Read-only SQL against the connected warehouse. Only SELECT and WITH are accepted, so nothing typed here can change data. Estimate first when you are not sure how much a query will scan.</p>
              {/* Saved queries: named SQL kept in app_preferences (admin only) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                <Dropdown minWidth={250} value={bqPick} options={[{ value: '', label: 'Saved queries (' + bqSaved.length + ')' }].concat(bqSaved.map((q) => ({ value: q.id, label: q.name })))} onChange={(v) => { setBqPick(v); setBqDelArmed(''); if (v) bqLoad(v) }} />
                <input
                  className={styles.input}
                  style={{ width: 240, flex: '0 0 auto' }}
                  placeholder="Name this query"
                  value={bqName}
                  onChange={(e) => { setBqName(e.target.value); setBqSaveMsg('') }}
                />
                <Button size="sm" variant="secondary" onClick={bqSave} disabled={bqSaveBusy}>{bqSaveBusy ? 'Saving...' : 'Save'}</Button>
                {bqPick && (
                  <Button size="sm" variant="secondary" onClick={() => bqRemove(bqPick)} disabled={bqSaveBusy}>{bqDelArmed === bqPick ? 'Confirm remove' : 'Remove'}</Button>
                )}
                {String(bqName || '').trim() && <span className={styles.bqType}>id: {bqSlug(bqName)}</span>}
              </div>
              {bqSaveMsg && <p className={styles.note} style={{ color: '#94A3B8', marginTop: 0 }}>{bqSaveMsg}</p>}
              <textarea
                className={styles.sqlEditor}
                spellCheck={false}
                placeholder="SELECT CURRENT_DATE() AS today"
                value={bqSql}
                onChange={e => { setBqSql(e.target.value); setBqArmed(''); setBqWarn('') }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                <Button size="sm" onClick={bqRun} disabled={!!bqBusy}>{bqBusy === 'run' ? 'Running...' : 'Run'}</Button>
                <Button size="sm" variant="secondary" onClick={bqEstimate} disabled={!!bqBusy}>{bqBusy === 'est' ? 'Estimating...' : 'Estimate'}</Button>
                <Dropdown minWidth={132} value={bqLimit} options={[{ value: '100', label: '100 rows' }, { value: '500', label: '500 rows' }, { value: '2000', label: '2,000 rows' }, { value: '10000', label: '10,000 rows' }]} onChange={(v) => setBqLimit(v)} />
                {(bqRes || bqEst || bqErr || bqWarn) && (
                  <button type="button" className={styles.bqClear} onClick={() => { setBqRes(null); setBqEst(null); setBqErr(''); setBqWarn('') }}>Clear</button>
                )}
              </div>
              {bqWarn && <p className={styles.note} style={{ color: '#1F3C84' }}>{bqWarn}</p>}
              {bqErr && <p className={styles.note} style={{ color: '#c0392b' }}>{'\u2715'} {bqErr}</p>}
              {bqEst && !bqRes && !bqWarn && (
                <p className={styles.note}>Dry run only: this query would scan {bqBytes(bqEst.totalBytesProcessed)} ({bqCost(bqEst.totalBytesProcessed)}). Nothing was billed.</p>
              )}
              {bqRes && (
                <>
                  <p className={styles.note} style={{ color: '#15803D' }}>
                    {'\u2713'} {Number(bqRes.totalRows || 0).toLocaleString('en-IN')} row(s)
                    {(bqRes.rows || []).length < Number(bqRes.totalRows || 0) ? ' \u00B7 showing first ' + bqRes.rows.length : ''}
                    {' \u00B7 scanned ' + bqBytes(bqRes.totalBytesProcessed) + ' (' + bqCost(bqRes.totalBytesProcessed) + ')'}
                    {bqRes.cacheHit ? ' \u00B7 served from cache, no charge' : ''}
                    {' \u00B7 ' + bqRes.ms + ' ms'}
                  </p>
                  {(bqRes.rows || []).length === 0 ? (
                    <p className={styles.note}>The query ran but returned no rows.</p>
                  ) : (
                    <div className={styles.tableWrap} style={{ maxHeight: 420, overflowY: 'auto' }}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            {(bqRes.fields || []).map(f => (
                              <th key={f.name} className={styles.bqTh}>{f.name}<span className={styles.bqType}>{f.type}</span></th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(bqRes.rows || []).map((row, i) => (
                            <tr key={i}>
                              {(bqRes.fields || []).map(f => (
                                <td key={f.name} className={styles.bqTd} title={bqCell(row[f.name])}>{bqCell(row[f.name])}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {bqRes.jobId && (
                    <p className={styles.note} style={{ color: '#94A3B8' }}>Job {bqRes.jobId} in {bqRes.projectId} ({bqRes.location})</p>
                  )}
                </>
              )}
            </div>

              <div className={styles.card}>
                <h3 className={styles.cardTitle}>SR Revenue Assumptions</h3>
                <p className={styles.cardDesc}>SR fee per RAU (Registered At University) used in projected revenue. Estimated RAU = Deposits × 70%; Actual RAUs is the real count. Formula: Estimated/Actual RAUs × SR Fee</p>
                <label className={styles.fieldLabel}>SR Fee per RAU</label>
                <div className={styles.inputGroup}>
                  <span className={styles.prefix}>₹</span>
                  <input type="number" className={styles.input} style={{ maxWidth: 220 }} value={srFeeInput}
                    onChange={e => setSrFeeInput(e.target.value)} />
                  <Button size="sm" onClick={saveSrFee}>{srFeeSaved ? 'Saved' : 'Save'}</Button>
                </div>
                <p className={styles.note}>Current: ₹{parseInt(srFeeInput || 350000).toLocaleString('en-IN')} per RAU</p>
              </div>

              <div className={styles.card}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <h3 className={styles.cardTitle} style={{ marginBottom: 0 }}>Data Sources</h3>
                  <Button size="sm" onClick={checkAllSources} disabled={checkingAll}>{checkingAll ? 'Checking all...' : 'Check all sources'}</Button>
                </div>
                <div style={{ marginTop: 12, padding: '14px 16px', background: '#F9FAFB', border: '0.5px solid #EEF1F6', borderRadius: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                    <div style={{ minWidth: 200 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Automated checks</div>
                      <div style={{ fontSize: 11.5, color: '#9CA3AF', lineHeight: 1.4 }}>Runs via GitHub Actions — "Check all sources" above is still available anytime.</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                      <Dropdown
                        value={healthSchedule.mode}
                        disabled={savingSchedule}
                        onChange={v => saveHealthSchedule({ ...healthSchedule, mode: v })}
                        options={[{ value: 'off', label: 'Off' }, { value: 'daily', label: 'Once daily at' }, { value: 'hourly', label: 'Every hour' }]}
                      />
                      {healthSchedule.mode === 'daily' && (
                        <Dropdown
                          value={healthSchedule.hour}
                          disabled={savingSchedule}
                          onChange={v => saveHealthSchedule({ ...healthSchedule, hour: v })}
                          options={Array.from({ length: 24 }, (_, h) => ({ value: h, label: (h === 0 ? '12 AM' : h < 12 ? h + ' AM' : h === 12 ? '12 PM' : (h - 12) + ' PM') + ' IST' }))}
                        />
                      )}
                      {scheduleMsg && <span style={{ fontSize: 11, fontWeight: 700, color: scheduleMsg.type === 'err' ? '#1F3C84' : '#15803D', whiteSpace: 'nowrap' }}>{scheduleMsg.type === 'err' ? '✕ ' : '✓ '}{scheduleMsg.text}</span>}
                    </div>
                  </div>
                  {sourceHealth.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, marginTop: 14, paddingTop: 14, borderTop: '0.5px solid #EEF1F6' }}>
                      {sourceHealth.map(h => {
                        const color = h.status === 'warn' ? '#1C9FD4' : h.status === 'error' ? '#1F3C84' : '#4CAE6F'
                        const mins = h.checked_at ? Math.round((Date.now() - new Date(h.checked_at).getTime()) / 60000) : null
                        const rel = mins == null ? '' : mins < 60 ? mins + 'm ago' : mins < 1440 ? Math.round(mins / 60) + 'h ago' : Math.round(mins / 1440) + 'd ago'
                        return (
                          <div key={h.name} title={h.message || 'OK'} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#fff', border: '0.5px solid #E5E7EB', borderRadius: 10, transition: 'box-shadow .15s ease, border-color .15s ease' }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, boxShadow: '0 0 0 3px ' + color + '1A' }} />
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontSize: 12, fontWeight: 650, color: '#1F2937', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.name}</div>
                              <div style={{ fontSize: 10.5, color: '#9CA3AF', marginTop: 1 }}>{rel}</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
                {(() => {
                  const allSources = [...DATA_SOURCES, ...customSources]
                  const apiCount = allSources.filter(s => sourceCategory(s) === 'api').length
                  const sheetsCount = allSources.filter(s => sourceCategory(s) === 'sheets').length
                  return (
                    <div className={styles.dsCatRow}>
                      <button type="button" className={styles.dsCatCard + (sourceCatFilter === 'api' ? ' ' + styles.dsCatCardActive : '')} onClick={() => setSourceCatFilter('api')}>
                        <div className={styles.dsCatTop}>
                          <div className={styles.dsCatIcons}><span><MetaIcon /></span><span><GoogleIcon /></span></div>
                          <span className={styles.dsCatCountWrap}>
                            <span className={styles.dsCatCount}>{apiCount} connection{apiCount === 1 ? '' : 's'}</span>
                            <span className={styles.dsCatCheck}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></span>
                          </span>
                        </div>
                        <div className={styles.dsCatName}>API Connections</div>
                        <div className={styles.dsCatDesc}>Live server-side connections: Meta Graph API, Google Ads API.</div>
                      </button>
                      <button type="button" className={styles.dsCatCard + (sourceCatFilter === 'sheets' ? ' ' + styles.dsCatCardActive : '')} onClick={() => setSourceCatFilter('sheets')}>
                        <div className={styles.dsCatTop}>
                          <div className={styles.dsCatIcons}><span><SheetsIcon /></span></div>
                          <span className={styles.dsCatCountWrap}>
                            <span className={styles.dsCatCount}>{sheetsCount} connection{sheetsCount === 1 ? '' : 's'}</span>
                            <span className={styles.dsCatCheck}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></span>
                          </span>
                        </div>
                        <div className={styles.dsCatName}>Google Sheets</div>
                        <div className={styles.dsCatDesc}>Published CSV sheets powering every dashboard's live data.</div>
                      </button>
                    </div>
                  )
                })()}
                <div className={styles.dsListHead}>
                  <span className={styles.dsListTitle}>{sourceCatFilter === 'api' ? 'API Connections' : 'Google Sheets'}</span>
                  {userIsAdmin && (
                    <Button size="sm" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>} onClick={() => { setNewSourceForm({ name: '', url: '' }); setAddSourceMsg(null); setAddSourceOpen(true) }}>
                      Add source
                    </Button>
                  )}
                </div>
                <div className={styles.dsList}>
                {[...DATA_SOURCES, ...customSources].filter(s => sourceCategory(s) === sourceCatFilter).map(s => {
                  const { Icon, wrap } = sourceIconClass(s)
                  return (
                  <div key={s.name} className={styles.dsRow} style={{ flexWrap: 'wrap', rowGap: 10 }}>
                    <span className={styles.dsIcon + (wrap ? ' ' + wrap : '')}>
                      <Icon />
                    </span>
                    <div className={styles.dsBody}>
                      <div className={styles.dsName}>{s.name}</div>
                                            <div className={styles.dsMeta} title={s.editKey ? (sheetUrls[s.editKey] || s.defaultUrl || '') : ''} style={{ maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.editKey ? (() => { const u = sheetUrls[s.editKey] || s.defaultUrl; if (!u) return 'No default set'; const m = u.match(/[?&]sheet=([^&]+)/); return 'Google Sheet' + (m ? ' \u00b7 ' + decodeURIComponent(m[1].replace(/\+/g, ' ')) : ''); })() : (s.src + ' \u2014 ' + s.rows + ' rows')}</div>
                    </div>
                    <span className={styles.dsStatus} data-st={s.editKey ? (sheetUrls[s.editKey] ? 'custom' : 'default') : 'live'}>{s.editKey ? (sheetUrls[s.editKey] ? 'Custom' : 'Default') : 'Live'}</span>{s.bqTest && userIsAdmin && (<Button size="sm" variant="secondary" onClick={() => testBigQuery()} disabled={bqTesting}>{bqTesting ? 'Testing...' : 'Test connection'}</Button>)}{s.bqTest && bqMsg && (<p className={styles.note} style={{ flexBasis: '100%', width: '100%', margin: '4px 0 0', color: bqMsg.type === 'err' ? '#c0392b' : '#15803D' }}>{bqMsg.type === 'err' ? '\u2715 ' : '\u2713 '}{bqMsg.text}</p>)}{s.apiTestMode && (<Button size="sm" variant="secondary" onClick={() => testLeadSquared(s.apiTestMode)} disabled={lsqTesting === s.apiTestMode}>{lsqTesting === s.apiTestMode ? 'Testing...' : 'Test connection'}</Button>)}{s.apiTestMode && lsqMsg[s.apiTestMode] && (<p className={styles.note} style={{ flexBasis: '100%', width: '100%', margin: '4px 0 0', color: lsqMsg[s.apiTestMode].type === 'err' ? '#c0392b' : '#15803D' }}>{lsqMsg[s.apiTestMode].type === 'err' ? '✕ ' : '✓ '}{lsqMsg[s.apiTestMode].text}</p>)}{s.editKey && (<Button size="sm" variant="secondary" onClick={() => testSheetConnection(s)} disabled={sheetTest[s.editKey] && sheetTest[s.editKey].loading}>{sheetTest[s.editKey] && sheetTest[s.editKey].loading ? 'Testing...' : 'Test connection'}</Button>)}{s.editKey && userIsAdmin && (<Button size="sm" onClick={() => { const next = editingSheet === s.editKey ? null : s.editKey; if (next && !sheetInputs[s.editKey]) setSheetInputs(prev => ({ ...prev, [s.editKey]: sheetUrls[s.editKey] || s.defaultUrl || '' })); setEditingSheet(next) }}>{editingSheet === s.editKey ? 'Close' : 'Edit'}</Button>)}{s.custom && userIsAdmin && (<Button size="sm" danger onClick={() => removeCustomSource(s.editKey)}>Remove</Button>)}{s.editKey && userIsAdmin && editingSheet === s.editKey && (<div className={styles.inputGroup} style={{ flexBasis: '100%', width: '100%', marginTop: 10 }}><input type="text" className={styles.input} placeholder="Paste the sheet link or a CSV URL" value={sheetInputs[s.editKey] || ''} onChange={e => setSheetInputs(prev => ({ ...prev, [s.editKey]: e.target.value }))} style={{ flex: 1, minWidth: 260 }} /><Button size="sm" onClick={() => saveSheetUrl(s.editKey)} disabled={sheetSaving[s.editKey]}>{sheetSaving[s.editKey] ? 'Saving...' : 'Save'}</Button></div>)}{s.editKey && sheetMsg[s.editKey] && (<p className={styles.note} style={{ flexBasis: '100%', width: '100%', margin: '4px 0 0', color: sheetMsg[s.editKey].type === 'err' ? '#c0392b' : undefined }}>{sheetMsg[s.editKey].type === 'err' ? '✕ ' : '✓ '}{sheetMsg[s.editKey].text}</p>)}{s.disconnectable && userIsAdmin && (<Button size="sm" danger onClick={disconnectMeta} disabled={metaDisconnecting}>{metaDisconnecting ? 'Disconnecting...' : 'Disconnect'}</Button>)}{s.disconnectable && metaDisconnectMsg && (<p className={styles.note} style={{ flexBasis: '100%', width: '100%', margin: '4px 0 0', color: metaDisconnectMsg.type === 'err' ? '#c0392b' : '#15803D' }}>{metaDisconnectMsg.type === 'err' ? '✕ ' : '✓ '}{metaDisconnectMsg.text}</p>)}
                    {s.editKey && sheetTest[s.editKey] && !sheetTest[s.editKey].loading && (
                      <div style={{ position: 'relative', flexBasis: '100%', width: '100%', marginTop: 8, padding: '10px 36px 10px 12px', borderRadius: 8, border: '1px solid ' + (sheetTest[s.editKey].error ? '#FECACA' : '#DCFCE7'), background: sheetTest[s.editKey].error ? '#FEF2F2' : '#F0FDF4' }}>
                        <button type="button" onClick={() => setSheetTest(prev => { const next = { ...prev }; delete next[s.editKey]; return next })} title="Close" style={{ position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderRadius: 5, border: 'none', background: 'transparent', color: '#6B7280', fontSize: 14, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                        {sheetTest[s.editKey].error ? (
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#c0392b' }}>✕ {sheetTest[s.editKey].error}</div>
                        ) : (
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: 10 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: '#15803D' }}>
                                ✓ Connected — {sheetTest[s.editKey].columnCount} columns, {sheetTest[s.editKey].rowCount.toLocaleString('en-IN')} rows
                                {sheetTest[s.editKey].monthCounts && <span style={{ fontWeight: 500, color: '#4B7A5A' }}> · {sheetTest[s.editKey].minDate && sheetTest[s.editKey].minDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} – {sheetTest[s.editKey].maxDate && sheetTest[s.editKey].maxDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                                <button type="button" onClick={() => setTestDetailsOpen(prev => ({ ...prev, [s.editKey]: !prev[s.editKey] }))} style={{ border: 'none', background: 'transparent', color: '#1F3C84', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{testDetailsOpen[s.editKey] ? 'Hide details' : 'Show details'}</button>
                                <button type="button" onClick={() => exportDiagnostics(s)} style={{ border: 'none', background: 'transparent', color: '#1F3C84', fontSize: 11, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>Export</button>
                              </div>
                            </div>
                            {sheetTest[s.editKey].drift && (
                              <div style={{ fontSize: 11.5, color: '#854D0E', background: '#FEF9C3', border: '1px solid #FDE68A', borderRadius: 6, padding: '6px 9px', marginTop: 6 }}>
                                ⚠ Changed since your last check{sheetTest[s.editKey].drift.sinceTs ? ' (' + Math.round((Date.now() - sheetTest[s.editKey].drift.sinceTs) / 60000) + 'm ago)' : ''}:
                                {sheetTest[s.editKey].drift.addedCols.length > 0 && <> new columns [{sheetTest[s.editKey].drift.addedCols.join(', ')}]</>}
                                {sheetTest[s.editKey].drift.removedCols.length > 0 && <> removed columns [{sheetTest[s.editKey].drift.removedCols.join(', ')}]</>}
                                {sheetTest[s.editKey].drift.rowDeltaPct != null && Math.abs(sheetTest[s.editKey].drift.rowDeltaPct) >= 20 && <> row count {sheetTest[s.editKey].drift.rowDeltaPct > 0 ? '+' : ''}{sheetTest[s.editKey].drift.rowDeltaPct}%</>}
                              </div>
                            )}
                            {sheetTest[s.editKey].monthCounts && sheetTest[s.editKey].monthCounts.length <= 1 && sheetTest[s.editKey].rowCount > 50 && (
                              <div style={{ fontSize: 11.5, color: '#854D0E', background: '#FEF9C3', border: '1px solid #FDE68A', borderRadius: 6, padding: '6px 9px', marginTop: 6 }}>
                                ⚠ Only 1 month of data is present. If you expect multi-month history, check for an active <strong>Filter</strong> (Data → Create a filter, not a Filter view) on this sheet's tab — a regular filter scopes what this live query returns for everyone, not just your own view.
                              </div>
                            )}
                            {sheetTest[s.editKey].apiCompare && (() => {
                              const live = sheetTest[s.editKey]
                              const api = live.apiCompare
                              const liveLast = live.maxDate ? (live.maxDate.getFullYear() + '-' + String(live.maxDate.getMonth() + 1).padStart(2, '0') + '-' + String(live.maxDate.getDate()).padStart(2, '0')) : null
                              const mismatch = api.lastDate && liveLast && api.lastDate !== liveLast
                              if (!mismatch) return null
                              return (
                                <div style={{ fontSize: 11.5, color: '#854D0E', background: '#FEF9C3', border: '1px solid #FDE68A', borderRadius: 6, padding: '6px 9px', marginTop: 6 }}>
                                  ⚠ Your dashboard's live API ({s.apiPath}) reports {api.rows != null ? api.rows.toLocaleString('en-IN') : '—'} rows, {api.firstDate || '—'} to {api.lastDate || '—'} — doesn't match the sheet's live data above. Dashboards may still be showing a cached snapshot; click "Test connection" again in a few minutes to re-check.
                                </div>
                              )
                            })()}
                            {testDetailsOpen[s.editKey] && (
                              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '0.5px solid #E5E7EB' }}>
                                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Columns</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: sheetTest[s.editKey].monthCounts ? 12 : 0 }}>
                                  {sheetTest[s.editKey].columns.map((c, i) => (
                                    <span key={i} style={{ fontSize: 10.5, fontWeight: 600, color: '#1F3C84', background: '#E8EFF9', border: '0.5px solid #C7D7F5', borderRadius: 5, padding: '2px 7px' }}>{c || '(blank)'}</span>
                                  ))}
                                </div>
                                {sheetTest[s.editKey].monthCounts && (
                                  <div style={{ marginBottom: 12 }}>
                                    <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Rows by month ({sheetTest[s.editKey].dateCol})</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                      {sheetTest[s.editKey].monthCounts.map(([m, n]) => (
                                        <span key={m} style={{ fontSize: 10.5, fontWeight: 600, color: '#374151', background: '#F3F4F6', border: '0.5px solid #E5E7EB', borderRadius: 5, padding: '2px 7px' }}>{m}: {n.toLocaleString('en-IN')}</span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {sheetTest[s.editKey].sampleRows && sheetTest[s.editKey].sampleRows.length > 0 && (
                                  <div style={{ overflowX: 'auto' }}>
                                    <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Sample rows</div>
                                    <table style={{ borderCollapse: 'collapse', fontSize: 10.5, whiteSpace: 'nowrap' }}>
                                      <thead><tr>{sheetTest[s.editKey].columns.map((c, i) => (<th key={i} style={{ textAlign: 'left', padding: '3px 8px', color: '#9CA3AF', fontWeight: 700, borderBottom: '0.5px solid #E5E7EB' }}>{c || '(blank)'}</th>))}</tr></thead>
                                      <tbody>
                                        {sheetTest[s.editKey].sampleRows.map((row, ri) => (
                                          <tr key={ri}>{row.map((v, ci) => (<td key={ci} style={{ padding: '3px 8px', color: '#374151', borderBottom: '0.5px solid #F3F4F6' }}>{v || '—'}</td>))}</tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  )
                })}
              </div>
                {addSourceOpen && userIsAdmin && (() => {
                  const name = newSourceForm.name.trim()
                  const url = newSourceForm.url.trim()
                  const nameInvalid = addSourceMsg && addSourceMsg.type === 'err' && !name
                  const urlInvalid = addSourceMsg && addSourceMsg.type === 'err' && !url.startsWith('http')
                  const canSubmit = !!name && url.startsWith('http')
                  return (
                    <div className={styles.dsModalOverlay} onClick={e => { if (e.target === e.currentTarget) setAddSourceOpen(false) }}>
                      <div className={styles.dsModal}>
                        <div className={styles.dsModalHead}>
                          <div className={styles.dsModalTitle}>Add a data source</div>
                          <button type="button" className={styles.dsModalClose} onClick={() => setAddSourceOpen(false)}>
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                          </button>
                        </div>
                        <p className={styles.dsModalSub}>Register a published Google Sheet so it's tracked and testable from here. Wiring it into an actual dashboard chart still needs a small code change.</p>
                        <div className={styles.dsField + (nameInvalid ? ' ' + styles.dsFieldInvalid : '')}>
                          <label>Name</label>
                          <input type="text" autoFocus placeholder="e.g. Partner Referral Sheet" value={newSourceForm.name} onChange={e => setNewSourceForm(prev => ({ ...prev, name: e.target.value }))} />
                          <p className={styles.dsFieldErr}>Give this source a name.</p>
                        </div>
                        <div className={styles.dsField + (urlInvalid ? ' ' + styles.dsFieldInvalid : '')}>
                          <label>Published / gviz CSV URL</label>
                          <input type="text" placeholder="https://docs.google.com/spreadsheets/.../gviz/tq?tqx=out:csv&sheet=..." value={newSourceForm.url} onChange={e => setNewSourceForm(prev => ({ ...prev, url: e.target.value }))} />
                          <p className={styles.dsFieldHint}>File &rarr; Share &rarr; Publish to web, choose CSV, paste the link here.</p>
                          <p className={styles.dsFieldErr}>Paste a valid sheet URL.</p>
                        </div>
                        {addSourceMsg && addSourceMsg.type === 'err' && (name && url.startsWith('http')) && (
                          <p className={styles.note} style={{ margin: '-6px 0 12px', color: '#c0392b' }}>✕ {addSourceMsg.text}</p>
                        )}
                        <div className={styles.dsModalActions}>
                          <Button size="sm" variant="secondary" onClick={() => setAddSourceOpen(false)}>Cancel</Button>
                          <Button size="sm" disabled={!canSubmit} onClick={addCustomSource}>Add source</Button>
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>

              {/* ── AFFILIATE SPEND (MANUAL) ── Affiliate has no automated spend feed
                  (no ad platform, no sheet) -- entered here by month, merged into the
                  Overall dashboard's totals and channel breakdown for Affiliate only. */}
              <div className={styles.card} style={{ marginTop: 18 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, gap: 10 }}>
                  <div>
                    <h3 className={styles.cardTitle} style={{ marginBottom: 4 }}>Affiliate spend — manual entry</h3>
                    <p className={styles.cardDesc} style={{ margin: 0 }}>Affiliate spend isn't tracked by any ad platform or sheet. Enter it here by month and it flows into the Overall dashboard's totals and channel breakdown for Affiliate.</p>
                  </div>
                  {affSpendMsg && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: affSpendMsg.type === 'ok' ? '#16A34A' : '#DC2626', background: affSpendMsg.type === 'ok' ? '#F0FDF4' : '#FEF2F2', border: '0.5px solid ' + (affSpendMsg.type === 'ok' ? '#BBF7D0' : '#FECACA'), borderRadius: 6, padding: '3px 10px', whiteSpace: 'nowrap', flexShrink: 0 }}>{affSpendMsg.text}</span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                  <input type="month" value={affSpendMonth} onChange={e => setAffSpendMonth(e.target.value)}
                    className={styles.input} style={{ width: 160 }} />
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', fontSize: 13, fontWeight: 700, pointerEvents: 'none' }}>₹</span>
                    <input type="number" min="0" placeholder="Spend amount" value={affSpendAmount} onChange={e => setAffSpendAmount(e.target.value)}
                      className={styles.input} style={{ width: 160, paddingLeft: 22 }} />
                  </div>
                  <Button size="sm" onClick={addAffiliateSpendMonth} disabled={affSpendSaving}>{affSpendSaving ? 'Saving…' : (affiliateSpend[affSpendMonth] != null ? 'Update month' : 'Add month')}</Button>
                </div>

                {Object.keys(affiliateSpend).length === 0 ? (
                  <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>No affiliate spend entered yet — Affiliate will show ₹0 spend on the Overall dashboard until a month is added above.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {Object.entries(affiliateSpend).sort((a, b) => b[0].localeCompare(a[0])).map(([ym, amount]) => (
                      <div key={ym} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: '#F8FAFC', border: '0.5px solid #E5E7EB' }}>
                        <div style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: '#0F172A' }}>{new Date(ym + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1F3C84' }}>&#8377;{Number(amount).toLocaleString('en-IN')}</div>
                        <button type="button" onClick={() => { setAffSpendMonth(ym); setAffSpendAmount(String(amount)) }}
                          style={{ border: 'none', background: 'transparent', color: '#1F3C84', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>Edit</button>
                        <button type="button" onClick={() => removeAffiliateSpendMonth(ym)}
                          style={{ border: 'none', background: 'transparent', color: '#94A3B8', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>Remove</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </>
          )}

          {/* ---------------- USER ACCESS ---------------- */}
          {activeTab === 'users' && userIsAdmin && (
            <>
              {/* ── GLOBAL PAGE VISIBILITY ── */}
              <div className={styles.card} style={{marginBottom:0}}>
                <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:16}}>
                  <div>
                    <h3 className={styles.cardTitle} style={{marginBottom:4}}>Global Page Visibility</h3>
                    <p className={styles.cardDesc} style={{margin:0}}>Pages hidden here disappear from <strong>everyone's</strong> sidebar. Per-user access below only applies to the remaining visible pages.</p>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0,marginTop:2}}>
                    {prefSaveMsg&&<span style={{fontSize:11,fontWeight:600,color:prefSaveMsg.type==='ok'?'#16A34A':'#DC2626',background:prefSaveMsg.type==='ok'?'#F0FDF4':'#FEF2F2',border:'0.5px solid '+(prefSaveMsg.type==='ok'?'#BBF7D0':'#FECACA'),borderRadius:6,padding:'3px 10px',whiteSpace:'nowrap'}}>{prefSaveMsg.text}</span>}
                    <Button size="sm" onClick={saveHiddenPages} disabled={prefSaving||!hasPendingChanges||prefLoading}
                      icon={prefSaving?<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{animation:'spin .8s linear infinite'}}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>:<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}>
                      {prefSaving?'Saving…':(hasPendingChanges?'Save changes':'Saved')}
                    </Button>
                  </div>
                </div>
                {prefLoading?<div style={{fontSize:12,color:'#94A3B8'}}>Loading…</div>:
                  <div className={styles.pvGrid}>
                {PAGE_ACCESS_GROUPS.map(row => {
                  const renderTile = (page, isChild) => {
                    const isHidden = hiddenPages.includes(page.id)
                    return (
                      <div key={page.id} onClick={()=>togglePageVisibility(page.id)} className={`${styles.pvCard} ${isHidden?styles.pvCardHidden:''} ${isChild?styles.pvCardChild:''}`}>
                        <div className={styles.pvIcon}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            {isHidden?<><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>:<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>}
                          </svg>
                        </div>
                        <div className={styles.pvBody}>
                          <div className={styles.pvName}>{page.label}</div>
                          <div className={styles.pvSub}>{isHidden?'Hidden — all users':'Visible to all'}</div>
                        </div>
                        <div className={styles.pvToggle}><div className={styles.pvKnob}/></div>
                      </div>
                    )
                  }
                  if (row.type === 'group') {
                    return (
                      <div className={styles.pvGroupBlock} key={row.label}>
                        <div className={styles.pvGroupHeader}>
                          <span className={styles.pvGroupLabel}>{row.label}</span>
                          <span className={styles.pvGroupCount}>{row.children.length} pages</span>
                        </div>
                        <div className={styles.pvGroupGrid}>{row.children.map(page => renderTile(page, true))}</div>
                      </div>
                    )
                  }
                  return renderTile(row.dash, false)
                })}
              </div>
                }
                {hiddenPages.length>0&&!prefLoading&&<div style={{marginTop:10}}><Button size="sm" variant="secondary" icon={<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>} onClick={()=>{setHiddenPages([]);setPrefSaveMsg(null)}}>Reset — show all</Button></div>}
              </div>
              <div style={{borderTop:'0.5px solid #F1F5F9',margin:'22px 0'}}/>
              {/* page header */}
              <div className={styles.uaHeader}>
                <div>
                  <h2 className={styles.uaTitle}>User Access</h2>
                  <p className={styles.uaSubtitle}>Manage who can access Quantum and which dashboards they see.</p>
                </div>
                <div className={styles.uaHeaderActions}>
                  <Button size="sm" variant="secondary" icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                    </svg>} onClick={loadUsers}>
                    Refresh
                  </Button>
                </div>
              </div>

              {/* stat strip */}
              <div className={styles.statStrip}>
                <div className={styles.statCard}>
                  <div><div className={styles.statLabel}>Total members</div><div className={styles.statValue}>{stats.total}</div></div>
                  <span className={`${styles.statIcon} ${styles.statIconNavy}`}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
                  </span>
                </div>
                <div className={styles.statCard}>
                  <div><div className={styles.statLabel}>Admins</div><div className={styles.statValue}>{stats.admins}</div></div>
                  <span className={`${styles.statIcon} ${styles.statIconBlue}`}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  </span>
                </div>
                <div className={styles.statCard}>
                  <div><div className={styles.statLabel}>Members</div><div className={styles.statValue}>{stats.members}</div></div>
                  <span className={`${styles.statIcon} ${styles.statIconCyan}`}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  </span>
                </div>
                <div className={styles.statCard}>
                  <div><div className={styles.statLabel}>Daily reports</div><div className={styles.statValue}>{stats.reports}</div></div>
                  <span className={`${styles.statIcon} ${styles.statIconGreen}`}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 4h16v16H4z"/><path d="M8 12l3 3 5-6"/></svg>
                  </span>
                </div>
              </div>

              {/* toolbar: search + role filter + add */}
              <div className={styles.toolbar}>
                <div className={styles.searchBox}>
                  <svg className={styles.searchIcon} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
                  <input className={styles.searchInput} placeholder="Search by email…" value={userSearch} onChange={e => setUserSearch(e.target.value)} />
                </div>
                <Dropdown
                  value={roleFilter}
                  onChange={setRoleFilter}
                  options={[{ value: 'all', label: 'All roles' }, { value: 'admin', label: 'Admin' }, { value: 'viewer', label: 'Viewer' }, { value: 'custom', label: 'Custom' }]}
                  minWidth={120}
                />
                <Button size="sm" onClick={() => { setNewEmail(''); setAccessMsg(''); setAddMemberOpen(true) }}>
                  + Add member
                </Button>
              </div>

              {addMemberOpen && (
                <div className={styles.dsModalOverlay} onClick={e => { if (e.target === e.currentTarget) setAddMemberOpen(false) }}>
                  <div className={styles.dsModal}>
                    <div className={styles.dsModalHead}>
                      <div className={styles.dsModalTitle}>Add a member</div>
                      <button type="button" className={styles.dsModalClose} onClick={() => setAddMemberOpen(false)}>
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                      </button>
                    </div>
                    <p className={styles.dsModalSub}>Adds them as a Viewer with access to all dashboards — use Edit afterward to restrict it to specific ones.</p>
                    <div className={styles.dsField}>
                      <label>Email</label>
                      <input type="email" autoFocus placeholder="name@leverageedu.com" value={newEmail}
                        onChange={e => setNewEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && addUser()} />
                    </div>
                    {accessMsg && !isOkMsg && (<p className={styles.note} style={{ margin: '-6px 0 12px', color: '#c0392b' }}>✕ {accessMsg}</p>)}
                    <div className={styles.dsModalActions}>
                      <Button size="sm" variant="secondary" onClick={() => setAddMemberOpen(false)}>Cancel</Button>
                      <Button size="sm" disabled={!newEmail.trim() || usersLoading} onClick={addUser}>
                        {usersLoading ? 'Adding…' : 'Add member'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {accessMsg && (
                <div className={`${styles.toast} ${isOkMsg ? styles.toastOk : styles.toastErr}`}>{accessMsg}</div>
              )}

              {/* table */}
              <div className={styles.tableCard}>
                <div className={styles.tableHead}>
                  <span>User</span><span>Role</span><span>Access</span><span>Reports</span><span>Added</span><span>Actions</span>
                </div>

                {filteredUsers.length === 0 && (
                  <div className={styles.empty}>{usersLoading ? 'Loading…' : 'No members match your search.'}</div>
                )}

                {filteredUsers.map((u) => {
                  const rm = getRoleMeta(u.role)
                  const isEditing = editingUser === u.email
                  const isYou = u.email === user?.email
                  return (
                    <div key={u.email}>
                      <div className={`${styles.uRow} ${isEditing ? styles.uRowEdit : ''}`}>
                        <div className={styles.uUser}>
                          <div className={styles.userAvatar} style={{
                            background:`linear-gradient(135deg,${['#1F3C84','#1F3C84','#4CAE6F','#1F3C84','#8B5CF6'][((u.email||'').charCodeAt(0)||65)%5]},${['#1F3C84','#1F3C84','#4CAE6F','#1F3C84','#1F3C84'][((u.email||'').charCodeAt(1)||66)%5]})`,
                            width:36,height:36,borderRadius:10,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',
                            color:'#fff',fontSize:12,fontWeight:700,letterSpacing:'0.5px',boxShadow:'0 2px 8px rgba(15,23,42,0.18)',
                          }}>
                            {u.email.split('@')[0].slice(0,2).toUpperCase()}
                          </div>
                          <div className={styles.uUserText}>
                            <span className={styles.userName}>{u.email.split('@')[0]}{isYou && <span className={styles.youTag}>YOU</span>}</span>
                            <span className={styles.uEmail}>{u.email}</span>
                            {(u.job_title||u.department)&&<span style={{fontSize:10.5,color:'#94A3B8',fontWeight:500,marginTop:1}}>{[u.job_title,u.department].filter(Boolean).join(' · ')}</span>}
                          </div>
                        </div>
                        <div><span className={styles.roleBadge} style={{background:rm.bg||'#E8EFF9',color:rm.color||'#1F3C84',borderRadius:20,padding:'3px 10px',fontSize:11,fontWeight:700}}>{rm.label}</span></div>
                        <div className={styles.uAccess}>{accessLabel(u.role)}</div>
                        <div>
                          <label className={styles.reportsToggle} title="Receive daily report">
                            <input type="checkbox" className={styles.premToggle} checked={!!u.receive_reports} onChange={e => toggleReports(u, e.target.checked)} />
                          </label>
                        </div>
                        <div className={styles.uAdded}>{fmtDate(u.created_at)}</div>
                        <div className={styles.rowActions}>
                          {!isYou && (
                            <>
                              <button className={`${styles.iconBtn} ${isEditing ? styles.iconBtnActive : ''}`}
                                onClick={() => isEditing ? setEditingUser(null) : startEdit(u)}>
                                {isEditing ? 'Cancel' : 'Edit'}
                              </button>
                              <button className={styles.deleteBtn} onClick={() => removeUser(u.email)} title="Remove" aria-label="Remove member">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
                                </svg>
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {isEditing && (
                        <div className={styles.dsModalOverlay} onClick={e => { if (e.target === e.currentTarget) setEditingUser(null) }}>
                        <div className={styles.editModalCard}>
                          <div className={styles.dsModalHead}>
                            <div>
                              <div className={styles.dsModalTitle}>Edit permissions</div>
                              <p className={styles.dsModalSub} style={{ margin: '2px 0 0' }}>{u.email}</p>
                            </div>
                            <button type="button" className={styles.dsModalClose} onClick={() => setEditingUser(null)}>
                              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                          </div>
                          <div className={styles.roleOptions} style={{ marginTop: 16 }}>
                            <label className={`${styles.roleOption} ${editIsAdmin ? styles.roleOptionActive : ''}`}>
                              <input type="radio" name="role" checked={editIsAdmin} onChange={() => { setEditIsAdmin(true); setEditIsViewer(false) }} />
                              Admin <span className={styles.roleHint}>Full access</span>
                            </label>
                            <label className={`${styles.roleOption} ${editIsViewer ? styles.roleOptionActive : ''}`}>
                              <input type="radio" name="role" checked={editIsViewer} onChange={() => { setEditIsViewer(true); setEditIsAdmin(false) }} />
                              Viewer <span className={styles.roleHint}>Custom access</span>
                            </label>
                          </div>

                          {editIsAdmin && <p className={styles.cardDesc}>Admin has full access to all dashboards and settings.</p>}

                          {editIsViewer && (
                            <div className={styles.dashGrid}>
                              {PAGE_ACCESS_GROUPS.flatMap(row => row.type === 'group'
                                ? [{ isHeader: true, key: row.label, label: row.label }, ...row.children.map(d => ({ dash: d, isChild: true }))]
                                : [{ dash: row.dash, isChild: false }]
                              ).map((row, i) => {
                                if (row.isHeader) return <div key={row.key} className={styles.dashGroupHeader}>{row.label}</div>
                                const d = row.dash
                                const checked = editIds.includes(d.id)
                                const gHidden = hiddenPages.includes(d.id)
                                return (
                                  <label key={d.id}
                                    title={gHidden?'Globally hidden — change in Global Page Visibility above':undefined}
                                    className={`${styles.dashChip} ${checked&&!gHidden?styles.dashChipActive:''} ${row.isChild?styles.dashChipChild:''}`}
                                    style={gHidden?{opacity:0.38,cursor:'not-allowed',filter:'grayscale(1)'}:{}}>
                                    <input type="checkbox" checked={checked&&!gHidden} disabled={gHidden}
                                      onChange={()=>!gHidden&&setEditIds(p=>checked?p.filter(x=>x!==d.id):[...p,d.id])} />
                                    {d.label}
                                    {gHidden&&<span style={{fontSize:9,display:'block',color:'#94A3B8',fontWeight:600,lineHeight:1,marginTop:2}}>globally off</span>}
                                  </label>
                                )
                              })}
                            </div>
                          )}

                          <div className={styles.editFieldsRow}>
                            <div>
                              <label style={{fontSize:11,fontWeight:600,color:'#64748B',display:'block',marginBottom:6,letterSpacing:'0.05em'}}>JOB TITLE</label>
                              <input value={editJobTitle} onChange={e=>setEditJobTitle(e.target.value)} placeholder="e.g. Data Analyst"
                                style={{width:'100%',padding:'9px 11px',borderRadius:9,border:'0.5px solid #E2E8F0',fontSize:12.5,fontFamily:"'Plus Jakarta Sans',sans-serif",outline:'none',boxSizing:'border-box'}}/>
                            </div>
                            <div>
                              <label style={{fontSize:11,fontWeight:600,color:'#64748B',display:'block',marginBottom:6,letterSpacing:'0.05em'}}>DEPARTMENT</label>
                              <input value={editDepartment} onChange={e=>setEditDepartment(e.target.value)} placeholder="e.g. Performance Marketing"
                                style={{width:'100%',padding:'9px 11px',borderRadius:9,border:'0.5px solid #E2E8F0',fontSize:12.5,fontFamily:"'Plus Jakarta Sans',sans-serif",outline:'none',boxSizing:'border-box'}}/>
                            </div>
                          </div>

                          <div className={styles.editActions}>
                            <Button size="sm" onClick={() => saveEdit(u.email)} disabled={usersLoading}>
                              {usersLoading ? 'Saving…' : 'Save changes'}
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => setEditingUser(null)}>Cancel</Button>
                          </div>
                        </div>
                        </div>
                      )}
                    </div>
                  )
                })}

                <div className={styles.tableFoot}>Showing {filteredUsers.length} of {accessList.length} members</div>
              </div>
            </>
          )}

          {/* ---------------- ACTIVITY LOG ---------------- */}
          {activeTab === 'activity' && userIsAdmin && (
            <div className={styles.card} style={{ marginBottom: 18 }}>
              <div className={styles.activityHeader}>
                <div>
                  <h3 className={styles.cardTitle}>Recent Updates</h3>
                  <p className={styles.cardDesc} style={{ margin: 0 }}>Latest changes shipped to Quantum -- if something looks different, check here first.</p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => { setCommitsLoading(true); getRecentCommits(15).then(setRecentCommits).finally(() => setCommitsLoading(false)) }}>
                  {commitsLoading ? 'Loading…' : '↻ Refresh'}
                </Button>
              </div>
              {recentCommits.length === 0 && !commitsLoading && (
                <div className={styles.empty}>No commit history available right now.</div>
              )}
              {recentCommits.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {recentCommits.map(c => (
                    <a key={c.sha} href={c.url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '7px 4px', borderBottom: '0.5px solid #F3F4F6', textDecoration: 'none', color: 'inherit' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#94A3B8', flexShrink: 0 }}>{c.sha}</span>
                      <span style={{ fontSize: 12.5, color: '#1F2937', flex: 1 }}>{c.message}</span>
                      <span style={{ fontSize: 11, color: '#94A3B8', whiteSpace: 'nowrap', flexShrink: 0 }}>{relTime(c.date)}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}


          {activeTab === 'activity' && userIsAdmin && (
            <div className={styles.card}>
              <div className={styles.activityHeader}>
                <div>
                  <h3 className={styles.cardTitle}>Activity Log</h3>
                  <p className={styles.cardDesc} style={{ margin: 0 }}>See who viewed which dashboard and when.</p>
                </div>
                <Button size="sm" variant="secondary" onClick={loadActivity}>
                  {activityLoading ? 'Loading…' : '↻ Refresh'}
                </Button>
              </div>

              {activityLog.length > 0 && (
                <div className={styles.alSearch}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <input type="text" placeholder="Search by user..." value={actSearch} onChange={e=>setActSearch(e.target.value)} />
                  {actSearch && (<button type="button" className={styles.alSearchClear} onClick={()=>setActSearch('')} aria-label="Clear">×</button>)}
                </div>
              )}

              {activityLog.length === 0 && !activityLoading && (
                <div className={styles.empty}>
                  Click “Load log” to see activity.<br />
                  Activity is tracked when users open dashboards.
                </div>
              )}

              {activityLog.length > 0 && (
                <div className={styles.alCard}>
                  <div className={styles.tableWrap}>
                  <table className={styles.alTable}>
                    <thead className={styles.alHead}>
                      <tr>
                        {['USER','ACTION','PAGE','DETAIL','DATE','TIME','AGO'].map(h=>(
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activityLog.filter(log => { const q = actSearch.trim().toLowerCase(); if (!q) return true; const u = (log.email||'').toLowerCase(); return u.includes(q); }).map((log,idx)=>{
                        const diff = Date.now()-new Date(log.created_at)
                        const rel = diff<60000?'just now':diff<3600000?Math.round(diff/60000)+'m ago':diff<86400000?Math.round(diff/3600000)+'h ago':Math.round(diff/86400000)+'d ago'
                        const avColor = ['#1F3C84','#1F3C84','#4CAE6F','#1F3C84','#1F3C84'][((log.email||'').charCodeAt(0)||65)%5]
                        const avColor2 = ['#1F3C84','#1F3C84','#4CAE6F','#1F3C84','#1F3C84'][((log.email||'').charCodeAt(1)||66)%5]
                        const pg = (log.page||'app').replace('/dashboard/','').replace('/','').split('?')[0]||'app'
                        const pgLabel = pg==='app'?'Summary':pg.split('-').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ')
                        const ACT = {
                          view: {c:'#1577A0', bg:'#E3F5FD'},
                          click: {c:'#1F3C84', bg:'#E8EFF9'},
                          tab: {c:'#16868F', bg:'#E4F8F9'},
                          login: {c:'#2E7D4F', bg:'#E9F8EF'},
                          logout: {c:'#1577A0', bg:'#E3F5FD'},
                          leave: {c:'#64748B', bg:'#F1F5F9'},
                          search: {c:'#1577A0', bg:'#E3F5FD'},
                          export: {c:'#2E7D4F', bg:'#E9F8EF'},
                        }
                        const a = ACT[log.action] || {c:'#64748B', bg:'#F1F5F9'}
                        const dt = new Date(log.created_at)
                        const dateStr = dt.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})
                        const timeStr = dt.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true})
                        return (
                          <tr key={idx} className={styles.alRow}>
                            <td className={styles.alTd}>
                              <div className={styles.alUserCell}>
                                <div className={styles.alAvatar} style={{background:`linear-gradient(135deg,${avColor},${avColor2})`}}>
                                  {(log.email||'?').split('@')[0].slice(0,2).toUpperCase()}
                                </div>
                                <span className={styles.alUserName}>{(log.email||'').split('@')[0]}</span>
                              </div>
                            </td>
                            <td className={styles.alTd}>
                              <span className={styles.alTag} style={{background:a.bg,color:a.c}}>{log.action||'view'}</span>
                            </td>
                            <td className={`${styles.alTd} ${styles.alPage}`}>{pgLabel}</td>
                            <td className={`${styles.alTd} ${styles.alDetail}`} title={log.detail||''}>{log.detail||'—'}</td>
                            <td className={styles.alTd}>{dateStr}</td>
                            <td className={styles.alTd}>{timeStr}</td>
                            <td className={`${styles.alTd} ${styles.alMuted}`}>{rel}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  </div>
                  <div className={styles.alFoot}>Showing {activityLog.length} {activityLog.length===1?'entry':'entries'}</div>
                </div>
                )}
            </div>
          )}

          {/* ---------------- PROFILE ---------------- */}
          {/* --------------- REPORTS --------------- */}
          {activeTab === 'reports' && userIsAdmin && (
            <>
              {(() => {
                const reportRecipients = accessList.filter(u => u.receive_reports)
                const recipCount = reportRecipients.length
                return (
                  <>
                    <div className={styles.card} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <h3 className={styles.cardTitle} style={{ marginBottom: 0 }}>Scheduled reports</h3>
                        <span className={styles.reportsPill + ' ' + (rcAuto ? styles.reportsPillOn : styles.reportsPillOff)}>
                          <span className={styles.reportsPillDot} />
                          {rcAuto ? 'Auto-send on' : 'Auto-send off'}
                        </span>
                        <button type="button" className={styles.reportsPill + ' ' + styles.reportsPillLink} onClick={() => setRecipientsOpen(true)}>
                          {recipCount} recipient{recipCount === 1 ? '' : 's'}
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <Button size="sm" variant="secondary" onClick={() => setPreviewOpen(true)}>Preview email</Button>
                        <Button size="sm" variant="secondary" onClick={() => setEditReportOpen(true)}>Edit settings</Button>
                        <Button size="sm" icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>} onClick={() => { setSendAudience('test'); setRcMsg(''); setSendReportOpen(true) }}>
                          Send Report
                        </Button>
                      </div>
                    </div>

                    {previewOpen && (
                      <div className={styles.dsModalOverlay} onClick={e => { if (e.target === e.currentTarget) setPreviewOpen(false) }}>
                        <div className={styles.rpModalCard}>
                          <div className={styles.dsModalHead}>
                            <div className={styles.dsModalTitle}>Email preview</div>
                            <button type="button" className={styles.dsModalClose} onClick={() => setPreviewOpen(false)}>
                              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                          </div>
                          <p className={styles.dsModalSub}>
                            Exactly what recipients see in Gmail, built from the real email template. Numbers and the AI analysis are sample data — those come from a live Meta Ads fetch and a Claude call at send time — but sender, subject, and layout below reflect your actual settings.
                          </p>
                          <p className={styles.rpNote}>The real template has no mobile-responsive styling, so phone Gmail doesn't reflow it — it shrinks the whole desktop layout to fit. The Mobile view here reproduces that shrink, not a redesigned layout.</p>
                          <div className={styles.rpControls}>
                            <div className={styles.rpTabs}>
                              {['daily', 'weekly', 'monthly'].map(t => (
                                <button key={t} type="button" className={styles.rpTab + (rpType === t ? ' ' + styles.rpTabActive : '')} onClick={() => setRpType(t)} style={{ textTransform: 'capitalize' }}>
                                  {t}
                                </button>
                              ))}
                            </div>
                            <div className={styles.rpViewToggle}>
                              <button type="button" className={styles.rpViewBtn + (rpView === 'desktop' ? ' ' + styles.rpViewBtnActive : '')} onClick={() => setRpView('desktop')}>Desktop</button>
                              <button type="button" className={styles.rpViewBtn + (rpView === 'mobile' ? ' ' + styles.rpViewBtnActive : '')} onClick={() => setRpView('mobile')}>Mobile</button>
                            </div>
                          </div>
                          {(() => {
                            const senderName = rcName.trim() || 'Leverage Quantum'
                            const senderEmail = rcEmail.trim() || 'quantum@platform.leverageedu.com'
                            const todayLabel = '15 Jul 2026'
                            const subject = (rcSubjects[rpType] && rcSubjects[rpType].trim()) || RP_SUBJECTS[rpType](todayLabel)
                            const initials = senderName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'LQ'
                            const scale = rpView === 'mobile' ? 0.55 : 1
                            const naturalWidth = 704
                            const html = buildReportPreviewHTML(rpType, senderName + ' <span style="color:#1C9FD4">Quantum</span>')
                            return (
                              <div className={styles.rpFrame + (rpView === 'mobile' ? ' ' + styles.rpFrameMobile : '')}>
                                <div className={styles.rpTop}>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.3-4.3" /></svg>
                                  <span>Search mail</span>
                                </div>
                                <div className={styles.rpMsgHead}>
                                  <div className={styles.rpSubject}>{subject}</div>
                                  <div className={styles.rpFromRow}>
                                    <div className={styles.rpAvatar}>{initials}</div>
                                    <div className={styles.rpFromMeta}>
                                      <div className={styles.rpFromName}>{senderName} <span className={styles.rpFromEmail}>&lt;{senderEmail}&gt;</span></div>
                                      <div className={styles.rpToLine}>to me</div>
                                    </div>
                                    <div className={styles.rpTime}>9:30 AM</div>
                                  </div>
                                </div>
                                <div className={styles.rpBodyWrap} style={{ height: (rpView === 'mobile' ? 620 : 1120) }}>
                                  <iframe
                                    title="report-email-preview"
                                    srcDoc={'<html><body style="margin:0">' + html + '</body></html>'}
                                    style={{ width: naturalWidth, transform: `scale(${scale})`, transformOrigin: 'top left', height: naturalWidth * 1.8 }}
                                    scrolling="no"
                                    onLoad={e => {
                                      try {
                                        const h = e.target.contentDocument.body.scrollHeight
                                        e.target.style.height = h + 'px'
                                        e.target.parentElement.style.height = (h * scale) + 'px'
                                      } catch (err) { /* cross-doc measurement can fail silently, fixed heights above cover it */ }
                                    }}
                                  />
                                </div>
                              </div>
                            )
                          })()}
                        </div>
                      </div>
                    )}

                    {editReportOpen && (
                      <div className={styles.dsModalOverlay} onClick={e => { if (e.target === e.currentTarget) setEditReportOpen(false) }}>
                        <div className={styles.dsModal}>
                          <div className={styles.dsModalHead}>
                            <div className={styles.dsModalTitle}>Edit report settings</div>
                            <button type="button" className={styles.dsModalClose} onClick={() => setEditReportOpen(false)}>
                              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                          </div>
                          <p className={styles.dsModalSub}>Sender identity, per-type subject overrides, and whether scheduled sends run automatically.</p>
                          <div className={styles.dsField}>
                            <label>Sender name</label>
                            <input value={rcName} onChange={e => setRcName(e.target.value)} placeholder="Leverage Quantum" />
                          </div>
                          <div className={styles.dsField}>
                            <label>Sender email</label>
                            <input value={rcEmail} onChange={e => setRcEmail(e.target.value)} placeholder="quantum@platform.leverageedu.com" />
                            {rcEmail && !rcEmail.endsWith('@platform.leverageedu.com') && (
                              <p className={styles.domainWarn}>Note: this address is not on the verified domain platform.leverageedu.com -- Resend may reject it.</p>
                            )}
                          </div>
                          {['daily', 'weekly', 'monthly'].map(t => (
                            <div className={styles.dsField} key={t}>
                              <label style={{ textTransform: 'capitalize' }}>{t} subject</label>
                              <input value={rcSubjects[t]} onChange={e => setRcSubjects(prev => ({ ...prev, [t]: e.target.value }))} placeholder={'Default ' + t + ' subject'} />
                            </div>
                          ))}
                          <div className={styles.reportsToggleRow}>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>Automatic reports</div>
                              <div style={{ fontSize: 11.5, color: '#94A3B8' }}>Scheduled (cron) sends run on their own. Turning this off only stops automatic sends -- Send Report still works.</div>
                            </div>
                            <input type="checkbox" className={styles.premToggle} checked={rcAuto} onChange={e => setRcAuto(e.target.checked)} />
                          </div>
                          {rcMsg && <p className={styles.rcFeedback + ' ' + (rcMsg.charAt(0) === '✕' ? styles.rcFeedbackErr : styles.rcFeedbackOk)}>{rcMsg}</p>}
                          <div className={styles.dsModalActions}>
                            <Button size="sm" variant="secondary" onClick={() => setEditReportOpen(false)}>Cancel</Button>
                            <Button size="sm" onClick={saveReportConfig} disabled={rcSaving}>{rcSaving ? 'Saving…' : 'Save changes'}</Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {sendReportOpen && (
                      <div className={styles.dsModalOverlay} onClick={e => { if (e.target === e.currentTarget) setSendReportOpen(false) }}>
                        <div className={styles.dsModal}>
                          <div className={styles.dsModalHead}>
                            <div className={styles.dsModalTitle}>Send Report</div>
                            <button type="button" className={styles.dsModalClose} onClick={() => setSendReportOpen(false)}>
                              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                          </div>
                          <p className={styles.dsModalSub}>Choose what to send and who gets it -- this fires immediately, outside the schedule.</p>
                          <div className={styles.dsField}>
                            <label>Report type</label>
                            <Dropdown
                              value={rcSendType}
                              onChange={setRcSendType}
                              disabled={rcSending || rcTesting}
                              options={[{ value: 'daily', label: 'Daily report' }, { value: 'weekly', label: 'Weekly report' }, { value: 'monthly', label: 'Monthly report' }]}
                              minWidth={200}
                            />
                          </div>
                          <label className={styles.sendRadioCard + (sendAudience === 'test' ? ' ' + styles.sendRadioCardActive : '')} onClick={() => setSendAudience('test')}>
                            <input type="radio" name="sendAudience" checked={sendAudience === 'test'} readOnly />
                            <div>
                              <div className={styles.sendRadioTitle}>Test to me only</div>
                              <div className={styles.sendRadioDesc}>Sends to {user?.email || 'you'} -- no one else sees it.</div>
                            </div>
                          </label>
                          <label className={styles.sendRadioCard + (sendAudience === 'all' ? ' ' + styles.sendRadioCardActive : '')} onClick={() => setSendAudience('all')}>
                            <input type="radio" name="sendAudience" checked={sendAudience === 'all'} readOnly />
                            <div>
                              <div className={styles.sendRadioTitle}>All configured recipients</div>
                              <div className={styles.sendRadioDesc}>Sends to everyone currently opted in.</div>
                            </div>
                          </label>
                          {sendAudience === 'all' && (
                            <div className={styles.sendWarnBox}>This will email <strong>{recipCount}</strong> {recipCount === 1 ? 'person' : 'people'} right now. This can't be undone.</div>
                          )}
                          {rcMsg && <p className={styles.rcFeedback + ' ' + (rcMsg.charAt(0) === '✕' ? styles.rcFeedbackErr : styles.rcFeedbackOk)}>{rcMsg}</p>}
                          <div className={styles.dsModalActions}>
                            <Button size="sm" variant="secondary" onClick={() => setSendReportOpen(false)}>Cancel</Button>
                            <Button size="sm" disabled={rcTesting || rcSending} onClick={() => sendAudience === 'test' ? sendTestReport() : sendReportNow()}>
                              {sendAudience === 'test' ? (rcTesting ? 'Sending…' : 'Send test') : (rcSending ? 'Sending…' : 'Send to ' + recipCount + ' recipient' + (recipCount === 1 ? '' : 's'))}
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {recipientsOpen && (
                      <div className={styles.dsModalOverlay} onClick={e => { if (e.target === e.currentTarget) setRecipientsOpen(false) }}>
                        <div className={styles.dsModal}>
                          <div className={styles.dsModalHead}>
                            <div className={styles.dsModalTitle}>Recipients</div>
                            <button type="button" className={styles.dsModalClose} onClick={() => setRecipientsOpen(false)}>
                              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                          </div>
                          <p className={styles.dsModalSub}>Choose which scheduled reports each person gets. Unchecking all three for someone is the same as receiving all -- it's not an opt-out. To add or remove someone entirely, use their Reports toggle in User Access.</p>
                          {recipCount > 0 && (() => {
                            const filteredRecipients = reportRecipients.filter(u => u.email.toLowerCase().includes(recipSearch.trim().toLowerCase()))
                            return (
                              <>
                                <div className={styles.recipCountRow}>
                                  {filteredRecipients.length === recipCount
                                    ? `${recipCount} ${recipCount === 1 ? 'person' : 'people'} opted in`
                                    : `${filteredRecipients.length} of ${recipCount} shown`}
                                </div>
                                {recipCount > 6 && (
                                  <div className={styles.alSearch} style={{ maxWidth: 'none', marginTop: 0 }}>
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                                    <input type="text" placeholder="Search by email..." value={recipSearch} onChange={e => setRecipSearch(e.target.value)} />
                                    {recipSearch && (<button type="button" className={styles.alSearchClear} onClick={() => setRecipSearch('')} aria-label="Clear">×</button>)}
                                  </div>
                                )}
                                {filteredRecipients.length === 0 ? (
                                  <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 10 }}>No recipients match "{recipSearch}".</p>
                                ) : (
                                  <>
                                    {filteredRecipients.length > 1 && (
                                      <div className={styles.recipRow + ' ' + styles.recipBulkRow}>
                                        <span className={styles.recipName} style={{ color: '#94A3B8', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                                          {recipSearch ? 'Toggle for shown' : 'Toggle for all'}
                                        </span>
                                        <div className={styles.recipTypes}>
                                          {['daily', 'weekly', 'monthly'].map(t => {
                                            const allOn = filteredRecipients.every(u => {
                                              const types = Array.isArray(u.report_types) && u.report_types.length ? u.report_types : ['daily', 'weekly', 'monthly']
                                              return types.includes(t)
                                            })
                                            return (
                                              <button key={t} type="button"
                                                className={styles.rtChip + (allOn ? ' ' + styles.rtChipOn : '')}
                                                disabled={!!bulkType}
                                                onClick={() => bulkToggleReportType(filteredRecipients, t)}>
                                                {bulkType === t ? '…' : t}
                                              </button>
                                            )
                                          })}
                                        </div>
                                      </div>
                                    )}
                                    <div className={styles.recipList}>
                                      {filteredRecipients.map(u => {
                                        const types = Array.isArray(u.report_types) && u.report_types.length ? u.report_types : ['daily', 'weekly', 'monthly']
                                        return (
                                          <div key={u.email} className={styles.recipRow}>
                                            <span className={styles.recipName} title={u.email}>{u.email}</span>
                                            <div className={styles.recipTypes}>
                                              {['daily', 'weekly', 'monthly'].map(t => (
                                                <button key={t} type="button"
                                                  className={styles.rtChip + (types.includes(t) ? ' ' + styles.rtChipOn : '')}
                                                  onClick={() => toggleReportType(u, t, !types.includes(t))}>
                                                  {t}
                                                </button>
                                              ))}
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </>
                                )}
                              </>
                            )
                          })()}
                          {recipCount === 0 && (
                            <p style={{ fontSize: 12, color: '#94A3B8' }}>No recipients yet -- enable people in the User Access tab.</p>
                          )}
                          <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 12, lineHeight: 1.5 }}>If no one is opted in, reports fall back to the admin account ({user?.email || 'admin'}) so sends never go nowhere.</p>
                          <div className={styles.dsModalActions}>
                            <Button size="sm" variant="secondary" onClick={() => setRecipientsOpen(false)}>Close</Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )
              })()}

              <div className={styles.card}>
                <h3 className={styles.cardTitle}>Slack</h3>
                <p className={styles.cardDesc}>Post Ask AI answers, page exports, and a compact summary of every scheduled report to Slack, as the workspace’s bot (<b>@pm_analyst</b>).</p>
                <p className={styles.cardDesc} style={{ marginTop: 6 }}>
                  <b>Preferred: bot token.</b> Set <code>SLACK_BOT_TOKEN</code> in the Vercel env (Slack app &gt; OAuth &amp; Permissions &gt; Bot User OAuth Token, needs <code>chat:write</code>), then just name the channels below — one token reaches any channel. The token is intentionally not stored here: this settings table is readable with the app’s public key, so a token kept here would be exposed. Remember to invite the bot to each channel with <code>/invite @pm_analyst</code>, or posting fails with “not in channel”.
                </p>
                <label className={styles.fieldLabel}>Test channels &middot; as many as you like</label>
                <p className={styles.cardDesc} style={{ marginTop: 2, marginBottom: 8 }}>
                  Name each one so Send to Slack can offer a real picker (e.g. one channel per person, or one per feature you're checking). The first one is used whenever something posts to "test" without picking a specific one (e.g. a scheduled report's own auto-post copy).
                </p>
                {slackTestChannels.map((c, i) => (
                  <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <input type="text" className={styles.input} placeholder="Name (e.g. Shivam's test)" value={c.name}
                      onChange={e => updateTestChannel(c.id, { name: e.target.value })}
                      style={{ fontSize: 12.5, flex: '0 0 180px' }} />
                    <input type="text" className={styles.input} placeholder="#pm-analyst-test  (or a channel ID like C0123ABCD)" value={c.channel}
                      onChange={e => updateTestChannel(c.id, { channel: e.target.value })}
                      style={{ fontFamily: 'monospace', fontSize: 12.5, flex: 1 }} />
                    {i === 0 && <span style={{ fontSize: 10, fontWeight: 800, color: '#94A3B8', letterSpacing: '0.04em', flexShrink: 0 }}>DEFAULT</span>}
                    <button type="button" onClick={() => removeTestChannel(c.id)} title="Remove"
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 16, lineHeight: 1, padding: '2px 6px', flexShrink: 0 }}>&times;</button>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="text" className={styles.input} placeholder="Name" value={newTestChanName}
                    onChange={e => setNewTestChanName(e.target.value)} style={{ fontSize: 12.5, flex: '0 0 180px' }} />
                  <input type="text" className={styles.input} placeholder="#channel or channel ID" value={newTestChanValue}
                    onChange={e => setNewTestChanValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTestChannel() } }}
                    style={{ fontFamily: 'monospace', fontSize: 12.5, flex: 1 }} />
                  <Button size="sm" variant="secondary" onClick={addTestChannel} disabled={!newTestChanName.trim() || !newTestChanValue.trim()}>+ Add</Button>
                </div>
          <label className={styles.fieldLabel} style={{ marginTop: 14 }}>Team channel &middot; the whole team reads it</label>
          <div className={styles.inputGroup}>
            <input type="text" className={styles.input} placeholder="#team-performance-marketing" value={slackChannelMain}
              onChange={e => setSlackChannelMain(e.target.value)} style={{ fontFamily: 'monospace', fontSize: 12.5 }} />
          </div>
          {/* One block per guarded channel, straight off shared/slackChannels.mjs. Adding a
              locked channel there grows this list by itself, phrase and all. */}
          {GUARDED.map(c => (
            <div key={c.id} style={{ marginTop: 14 }}>
              <label className={styles.fieldLabel}>{c.label} &middot; locked</label>
              <div className={styles.inputGroup}>
                <input type="text" className={styles.input} placeholder={'#' + c.name}
                  value={guardedChan[c.id] || ''}
                  onChange={e => setGuardedChan(g => ({ ...g, [c.id]: e.target.value }))}
                  style={{ fontFamily: 'monospace', fontSize: 12.5 }} />
              </div>
              <p className={styles.cardDesc} style={{ marginTop: 6 }}>
                {c.reads} Posting here needs an admin, the exact phrase <b>{confirmPhrase(c.id)}</b>, the
                PIN below, and then a second confirm &mdash; every single time. Left blank, Quantum reads
                the <code>{c.env}</code> environment variable{c.fallback ? <> and finally falls back to <code>{c.fallback}</code></> : <>, and with neither set nothing can reach it</>}.
                Scheduled reports, Ask AI and table exports can never post here.
              </p>
            </div>
          ))}

          <label className={styles.fieldLabel} style={{ marginTop: 14 }}>CEO PIN &middot; shared by every locked channel</label>
          <p className={styles.cardDesc} style={{ marginTop: 4 }}>
            {ceoPinInfo === null ? 'Checking\u2026'
              : ceoPinInfo.denied ? 'Only an admin can manage this PIN.'
              : ceoPinInfo.invalid ? 'The stored PIN record does not verify, so every locked channel is sealed. Set a new PIN below to repair it.'
              : !ceoPinInfo.set ? 'No PIN is set yet, so nothing can be posted to any locked channel.'
              : 'A ' + ceoPinInfo.digits + '-digit PIN is set'
                + (ceoPinInfo.setBy ? ' by ' + ceoPinInfo.setBy : '')
                + (ceoPinInfo.setAt ? ' on ' + new Date(ceoPinInfo.setAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '')
                + '. ' + (ceoPinInfo.locked
                  ? 'Locked right now for ' + Math.ceil((ceoPinInfo.lockedForSec || 0) / 60) + ' more min.'
                  : ceoPinInfo.failsLeft + ' wrong tries left before it locks itself.')}
          </p>
          <p className={styles.cardDesc} style={{ marginTop: 4 }}>
            The PIN is never stored anywhere — only a salted, 310,000-round hash of it, signed with a key that
            lives in the Vercel env and never in the database. 6 to 12 digits, at least 3 different ones, no counting
            runs and no repeated halves. 5 wrong tries locks it for 15 min, then 30, then 60.
          </p>
          {ceoPinInfo && ceoPinInfo.set && !ceoPinInfo.invalid && (
            <div className={styles.inputGroup}>
              <PinInput value={ceoPinCur} onChange={setCeoPinCur} placeholder="Current PIN" className={styles.input} inputStyle={{ fontFamily: 'monospace', fontSize: 12.5, letterSpacing: 2 }} />
            </div>
          )}
          <div className={styles.inputGroup} style={{ marginTop: 8 }}>
            <PinInput value={ceoPinNew} onChange={setCeoPinNew} placeholder="New PIN" className={styles.input} inputStyle={{ fontFamily: 'monospace', fontSize: 12.5, letterSpacing: 2 }} />
          </div>
          <div className={styles.inputGroup} style={{ marginTop: 8 }}>
            <PinInput value={ceoPinNew2} onChange={setCeoPinNew2} placeholder="Repeat the new PIN" className={styles.input} inputStyle={{ fontFamily: 'monospace', fontSize: 12.5, letterSpacing: 2 }} />
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}>
            <Button size="sm" variant="secondary" onClick={saveCeoPin} disabled={ceoPinBusy || ceoPinNew.length < 6}>
              {ceoPinBusy ? 'Saving\u2026' : (ceoPinInfo && ceoPinInfo.set ? 'Change PIN' : 'Set PIN')}
            </Button>
            {ceoPinMsg && <span className={styles.rcFeedback + ' ' + (ceoPinMsg.charAt(0) === 'x' ? styles.rcFeedbackErr : styles.rcFeedbackOk)}>{ceoPinMsg}</span>}
          </div>
                <p className={styles.cardDesc} style={{ marginTop: 14 }}>
                  <b>Fallback: Incoming Webhooks.</b> Only used when no bot token is set. A webhook is welded to a single channel, so it needs one URL per channel.
                </p>
                <label className={styles.fieldLabel}>Test channel webhook URL</label>
                <div className={styles.inputGroup}>
                  <input type="text" className={styles.input} placeholder="https://hooks.slack.com/services/…  (test channel)" value={slackWebhookTest}
                    onChange={e => setSlackWebhookTest(e.target.value)} style={{ fontFamily: 'monospace', fontSize: 12.5 }} />
                </div>
                <p className={styles.cardDesc} style={{ marginTop: 6 }}>Used by “Send test message” below and by the <b>Send to Slack — test channel</b> option in every page’s Export menu. Test posts are labelled as tests in Slack.</p>
                <label className={styles.fieldLabel} style={{ marginTop: 14 }}>Main channel webhook URL</label>
                <div className={styles.inputGroup}>
                  <input type="text" className={styles.input} placeholder="https://hooks.slack.com/services/…  (team channel)" value={slackWebhook}
                    onChange={e => setSlackWebhook(e.target.value)} style={{ fontFamily: 'monospace', fontSize: 12.5 }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#374151' }}>
                    <input type="checkbox" checked={slackAuto} onChange={e => setSlackAuto(e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                    Also post a summary card to Slack for every scheduled report
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Button size="sm" onClick={saveSlackConfig} disabled={slackCfgSaving}>{slackCfgSaving ? 'Saving…' : 'Save'}</Button>
                  {slackTestChannels.length > 1 && (
                    <Dropdown
                      minWidth={160}
                      options={slackTestChannels.map(c => ({ value: c.id, label: c.name }))}
                      value={slackTestPick || slackTestChannels[0].id}
                      onChange={setSlackTestPick}
                    />
                  )}
                  <Button size="sm" variant="secondary" onClick={sendSlackTest} disabled={slackTesting || (!slackTestChannels.length && !slackWebhookTest.trim())}>{slackTesting ? 'Sending…' : 'Send test message'}</Button>
                  {slackCfgMsg && <span className={styles.rcFeedback + ' ' + (slackCfgMsg.charAt(0) === '✕' ? styles.rcFeedbackErr : styles.rcFeedbackOk)}>{slackCfgMsg}</span>}
                </div>
              </div>

              <div className={styles.card}>
                <h3 className={styles.cardTitle}>Unassigned Leads Alert</h3>
                <p className={styles.cardDesc}>QL Ops &middot; flags leads still owned by a bot/vendor placeholder (Futwork/Futwork AI/Superbot) instead of a real floor owner. Fixed recipient, separate from the scheduled reports above — not part of the general opt-in recipient list.</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 24px', margin: '4px 0 14px', fontSize: 13 }}>
                  <div><span style={{ color: '#94A3B8' }}>To:</span> <strong>akash.saxena@leverageedu.com</strong></div>
                  <div><span style={{ color: '#94A3B8' }}>CC:</span> <strong>shivam.sharma@leverageedu.com</strong></div>
                  <div><span style={{ color: '#94A3B8' }}>Schedule:</span> <strong>Daily, 9:00 AM IST</strong></div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <Button size="sm" onClick={sendUnassignedNow} disabled={unassignedSending}>{unassignedSending ? 'Sending…' : 'Send now'}</Button>
                  {unassignedMsg && <span className={styles.rcFeedback + ' ' + (unassignedMsg.charAt(0) === '✕' ? styles.rcFeedbackErr : styles.rcFeedbackOk)}>{unassignedMsg}</span>}
                </div>
              </div>

              <div className={styles.card}>
                <div className={styles.activityHeader}>
                  <div>
                    <h3 className={styles.cardTitle}>Report Activity</h3>
                    <p className={styles.cardDesc} style={{ margin: 0 }}>Every send attempt — scheduled (GitHub Actions cron), manual, and test — with the real outcome. A skipped run (auto-reports disabled) is logged here even though GitHub Actions itself shows it as a green "success".</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={loadReportLogs}>
                    {reportLogsLoading ? 'Loading\u2026' : '\u21bb Refresh'}
                  </Button>
                </div>

                {reportLogsList.length === 0 && !reportLogsLoading && (
                  <div className={styles.empty}>No report activity yet.</div>
                )}

                {reportLogsList.length > 0 && (
                  <div className={styles.alCard}>
                    <div className={styles.tableWrap}>
                    <table className={styles.alTable}>
                      <thead className={styles.alHead}>
                        <tr>
                          {['TYPE','STATUS','TRIGGER','RECIPIENTS','SENT AT','DETAIL'].map(h=>(
                            <th key={h}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {reportLogsList.map((log,idx)=>{
                          const STATUS = {
                            sent:    { c:'#4CAE6F', bg:'#EAF7EE', label:'Sent' },
                            skipped: { c:'#1C9FD4', bg:'#E8F6FA', label:'Skipped' },
                            failed:  { c:'#FFFFFF', bg:'#1F3C84', label:'Failed' },
                          }
                          const s = STATUS[log.status] || { c:'#64748B', bg:'#F1F5F9', label: log.status||'Unknown' }
                          const isAuto = log.triggered_by === 'cron'
                          const trigMode = isAuto ? 'Auto' : 'Manual'
                          const trigWho = isAuto ? 'Scheduled run \u00b7 GitHub Actions cron'
                            : log.triggered_by === 'test' ? 'Test send from Settings'
                            : (log.triggered_by || 'Unknown')
                          const trigTag = isAuto ? { c: '#475569', bg: '#F1F5F9' } : { c: '#1F3C84', bg: '#E8EFF9' }
                          const dt = log.sent_at ? new Date(log.sent_at) : null
                          const dateStr = dt ? dt.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—'
                          const timeStr = dt ? dt.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true}) : ''
                          const rcptCount = Array.isArray(log.recipients) ? log.recipients.length : 0
                          return (
                            <tr key={log.id||idx} className={styles.alRow}>
                              <td className={`${styles.alTd} ${styles.alPage}`} style={{textTransform:'capitalize'}}>{log.report_type||'—'}</td>
                              <td className={styles.alTd}>
                                <span className={styles.alTag} style={{background:s.bg,color:s.c}}>{s.label}</span>
                              </td>
                              <td className={styles.alTd}><span className={styles.alTag} style={{ background: trigTag.bg, color: trigTag.c }}>{trigMode}</span><div style={{ fontSize: 10.5, color: '#8A94A6', marginTop: 3, textTransform: 'none', letterSpacing: 0 }}>{trigWho}</div></td>
                              <td className={styles.alTd}>{rcptCount > 0 ? `${rcptCount} recipient${rcptCount!==1?'s':''}` : '—'}</td>
                              <td className={styles.alTd}>{dateStr}{timeStr ? ` \u00b7 ${timeStr}` : ''}</td>
                              <td className={`${styles.alTd} ${styles.alDetail}`} title={log.error||''}>{log.error || '—'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    </div>
                    <div className={styles.alFoot}>Showing {reportLogsList.length} {reportLogsList.length===1?'entry':'entries'}</div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ---------------- ASK AI ---------------- */}
          {activeTab === 'askai' && userIsAdmin && (() => {
            const todayStr = new Date().toISOString().slice(0, 10)
            const monthStr = todayStr.slice(0, 7)
            const byDay = {}
            askaiUsageRows.forEach(r => {
              const day = (r.created_at || '').slice(0, 10)
              if (!byDay[day]) byDay[day] = { day, requests: 0, input: 0, output: 0, cost: 0 }
              byDay[day].requests += 1
              byDay[day].input += r.input_tokens || 0
              byDay[day].output += r.output_tokens || 0
              byDay[day].cost += parseFloat(r.estimated_cost_usd || 0)
            })
            const askaiDaily = Object.values(byDay).sort((a, b) => b.day.localeCompare(a.day))
            const todayRow = byDay[todayStr] || { requests: 0, input: 0, output: 0, cost: 0 }
            const monthCost = askaiDaily.filter(d => d.day.startsWith(monthStr)).reduce((s, d) => s + d.cost, 0)
            const budgetNum = parseFloat(askaiBudgetInput) || 0
            const budgetPct = budgetNum > 0 ? Math.min(100, (monthCost / budgetNum) * 100) : 0
            const budgetColor = budgetPct >= 90 ? '#1F3C84' : budgetPct >= 70 ? '#1C9FD4' : '#4CAE6F'
            const askaiToolNames = Array.from(new Set(askaiToolCalls.map(c => c.tool_name).filter(Boolean))).sort()
            const askaiFilteredCalls = askaiToolFilter === 'all' ? askaiToolCalls : askaiToolCalls.filter(c => c.tool_name === askaiToolFilter)
            const fmtTok = n => n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n || 0)
            return (
            <>
              <div className={styles.card}>
                <div className={styles.activityHeader}>
                  <div>
                    <h3 className={styles.cardTitle}>Ask AI Usage &amp; Cost</h3>
                    <p className={styles.cardDesc} style={{ margin: 0 }}>Token counts come from each response's real usage numbers; cost is an estimate (Sonnet-tier public pricing) for budgeting, not a live Anthropic billing read — no such API is exposed to a server key.</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={loadAskAiUsage}>
                    {askaiUsageLoading ? 'Loading…' : '↻ Refresh'}
                  </Button>
                </div>

                <div className={styles.statStrip}>
                  <div className={styles.statCard}>
                    <div><div className={styles.statLabel}>Today's cost (est.)</div><div className={styles.statValue}>${todayRow.cost.toFixed(2)}</div></div>
                    <span className={`${styles.statIcon} ${styles.statIconNavy}`}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></svg>
                    </span>
                  </div>
                  <div className={styles.statCard}>
                    <div><div className={styles.statLabel}>Today's tokens</div><div className={styles.statValue}>{fmtTok(todayRow.input + todayRow.output)}</div></div>
                    <span className={`${styles.statIcon} ${styles.statIconBlue}`}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                    </span>
                  </div>
                  <div className={styles.statCard}>
                    <div><div className={styles.statLabel}>This month (est.)</div><div className={styles.statValue}>${monthCost.toFixed(2)}</div></div>
                    <span className={`${styles.statIcon} ${styles.statIconCyan}`}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>
                    </span>
                  </div>
                  <div className={styles.statCard}>
                    <div><div className={styles.statLabel}>Tool calls logged</div><div className={styles.statValue}>{askaiToolCalls.length}</div></div>
                    <span className={`${styles.statIcon} ${styles.statIconGreen}`}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
                    </span>
                  </div>
                </div>

                <div style={{ marginTop: 16, padding: '14px 16px', background: '#F9FAFB', border: '0.5px solid #EEF1F6', borderRadius: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: budgetNum > 0 ? 10 : 0 }}>
                    <div style={{ minWidth: 200 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Monthly budget (self-declared)</div>
                      <div style={{ fontSize: 11.5, color: '#9CA3AF', lineHeight: 1.4 }}>No public Anthropic API exposes remaining account credits — set your own monthly ceiling to get an early warning as estimated spend approaches it.</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <span style={{ fontSize: 13, color: '#64748B', fontWeight: 600 }}>$</span>
                      <input type="number" min="0" step="1" value={askaiBudgetInput} onChange={e => setAskaiBudgetInput(e.target.value)}
                        style={{ width: 90, padding: '7px 10px', borderRadius: 8, border: '0.5px solid #E2E8F0', fontSize: 13, fontFamily: "'Plus Jakarta Sans',sans-serif" }} />
                      <Button size="sm" onClick={saveAskaiBudget} disabled={askaiBudgetSaving}>
                        {askaiBudgetSaving ? 'Saving…' : 'Save'}
                      </Button>
                      {askaiBudgetMsg && <span style={{ fontSize: 11, fontWeight: 700, color: askaiBudgetMsg.type === 'err' ? '#1F3C84' : '#15803D', whiteSpace: 'nowrap' }}>{askaiBudgetMsg.type === 'err' ? '✕ ' : '✓ '}{askaiBudgetMsg.text}</span>}
                    </div>
                  </div>
                  {budgetNum > 0 && (
                    <div>
                      <div style={{ height: 8, borderRadius: 4, background: '#E5E7EB', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${budgetPct}%`, background: budgetColor, borderRadius: 4, transition: 'width .3s ease' }} />
                      </div>
                      <div style={{ fontSize: 11, color: '#64748B', marginTop: 5 }}>${monthCost.toFixed(2)} of ${budgetNum.toFixed(2)} used this month ({budgetPct.toFixed(0)}%){budgetPct >= 90 ? ' — approaching the ceiling' : ''}</div>
                    </div>
                  )}
                </div>

                {askaiDaily.length > 0 && (
                  <div className={styles.alCard} style={{ marginTop: 16 }}>
                    <div className={styles.tableWrap}>
                      <table className={styles.alTable}>
                        <thead className={styles.alHead}>
                          <tr>{['DATE', 'REQUESTS', 'INPUT TOKENS', 'OUTPUT TOKENS', 'EST. COST'].map(h => <th key={h}>{h}</th>)}</tr>
                        </thead>
                        <tbody>
                          {askaiDaily.slice(0, 14).map(d => (
                            <tr key={d.day} className={styles.alRow}>
                              <td className={styles.alTd}>{new Date(d.day + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                              <td className={styles.alTd}>{d.requests}</td>
                              <td className={styles.alTd}>{fmtTok(d.input)}</td>
                              <td className={styles.alTd}>{fmtTok(d.output)}</td>
                              <td className={styles.alTd}>${d.cost.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className={styles.alFoot}>Showing last {Math.min(askaiDaily.length, 14)} days</div>
                  </div>
                )}
                {askaiDaily.length === 0 && !askaiUsageLoading && (
                  <div className={styles.empty} style={{ marginTop: 16 }}>No usage logged yet — send a message in Ask AI to start tracking.</div>
                )}
              </div>

              <div className={styles.card}>
                <div className={styles.activityHeader}>
                  <div>
                    <h3 className={styles.cardTitle}>Business Context</h3>
                    <p className={styles.cardDesc} style={{ margin: 0 }}>A structured knowledge base folded into Ask AI's and every agent's system prompt, so answers interpret the data correctly and match how the business actually talks about itself — this does not change the app's own fixed brand colors/fonts (see Appearance), only the words Ask AI and the agents write.</p>
                  </div>
                  <Button size="sm" onClick={saveBusinessContext} disabled={bizSaving}>
                    {bizSaving ? 'Saving…' : 'Save all'}
                  </Button>
                </div>
                {bizMsg && <div style={{ marginTop: 8 }}><span style={{ fontSize: 11, fontWeight: 700, color: bizMsg.type === 'err' ? '#1F3C84' : '#15803D' }}>{bizMsg.type === 'err' ? '✕ ' : '✓ '}{bizMsg.text}</span></div>}

                {BIZ_GROUPS.map(group => (
                  <div key={group.title} style={{ marginTop: 18 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 800, color: '#1F3C84', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid #EEF1F6' }}>{group.title}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {group.fields.map(f => (
                        <div key={f.key}>
                          <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>{f.label}</label>
                          {f.type === 'textarea' && (
                            <textarea value={bizFields[f.key] || ''} onChange={e => setBizField(f.key, e.target.value)} rows={2} placeholder={f.placeholder}
                              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '0.5px solid #E2E8F0', fontSize: 13, fontFamily: "'Plus Jakarta Sans',sans-serif", resize: 'vertical' }} />
                          )}
                          {f.type === 'tags' && (
                            <div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: (bizFields[f.key] || []).length ? 7 : 0 }}>
                                {(bizFields[f.key] || []).map((tag, i) => (
                                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#1F3C84', background: '#E8EFF9', border: '0.5px solid #D6E2F5', borderRadius: 999, padding: '4px 6px 4px 11px' }}>
                                    {tag}
                                    <span onClick={() => removeBizTag(f.key, i)} style={{ cursor: 'pointer', color: '#1C9FD4', fontWeight: 800, lineHeight: 1, padding: '0 4px' }}>×</span>
                                  </span>
                                ))}
                              </div>
                              <input type="text" value={bizTagDraft[f.key] || ''} onChange={e => setBizTagDraft(prev => ({ ...prev, [f.key]: e.target.value }))}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addBizTag(f.key) } }}
                                placeholder={f.placeholder}
                                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '0.5px solid #E2E8F0', fontSize: 13, fontFamily: "'Plus Jakarta Sans',sans-serif" }} />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className={styles.card}>
                <div className={styles.activityHeader}>
                  <div>
                    <h3 className={styles.cardTitle}>Tool-Call Audit Log</h3>
                    <p className={styles.cardDesc} style={{ margin: 0 }}>Every live Meta/Google/CRM query the assistant actually ran, with parameters, row counts, and latency — click a row to see the full request.</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Dropdown value={askaiToolFilter} onChange={setAskaiToolFilter}
                      options={[{ value: 'all', label: 'All tools' }, ...askaiToolNames.map(n => ({ value: n, label: n }))]} />
                    <Button size="sm" variant="secondary" onClick={loadAskAiToolCalls}>
                      {askaiToolCallsLoading ? 'Loading…' : '↻ Refresh'}
                    </Button>
                  </div>
                </div>

                {askaiFilteredCalls.length === 0 && !askaiToolCallsLoading && (
                  <div className={styles.empty}>No tool calls logged yet.</div>
                )}

                {askaiFilteredCalls.length > 0 && (
                  <div className={styles.alCard}>
                    <div className={styles.tableWrap}>
                      <table className={styles.alTable}>
                        <thead className={styles.alHead}>
                          <tr>{['TOOL', 'ROWS', 'LATENCY', 'STATUS', 'WHEN', ''].map(h => <th key={h}>{h}</th>)}</tr>
                        </thead>
                        <tbody>
                          {askaiFilteredCalls.slice(0, 200).map((c, idx) => {
                            const dt = c.created_at ? new Date(c.created_at) : null
                            const dateStr = dt ? dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'
                            const timeStr = dt ? dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : ''
                            return (
                              <tr key={c.id || idx} className={styles.alRow}>
                                <td className={`${styles.alTd} ${styles.alPage}`}>{c.tool_name || '—'}</td>
                                <td className={styles.alTd}>{c.row_count == null ? '—' : c.row_count}</td>
                                <td className={styles.alTd}>{c.latency_ms != null ? `${c.latency_ms}ms` : '—'}</td>
                                <td className={styles.alTd}>
                                  <span className={styles.alTag} style={{ background: c.had_error ? '#E8EFF9' : '#EAF7EE', color: c.had_error ? '#1F3C84' : '#4CAE6F' }}>{c.had_error ? 'Error' : 'OK'}</span>
                                </td>
                                <td className={styles.alTd}>{dateStr}{timeStr ? ` · ${timeStr}` : ''}</td>
                                <td className={styles.alTd}>
                                  <Button size="sm" variant="secondary" onClick={() => setAskaiDetail(c)}>View</Button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className={styles.alFoot}>Showing {Math.min(askaiFilteredCalls.length, 200)} of {askaiFilteredCalls.length} {askaiFilteredCalls.length === 1 ? 'call' : 'calls'}</div>
                  </div>
                )}
              </div>

              {askaiDetail && (
                <div className={styles.dsModalOverlay} onClick={e => { if (e.target === e.currentTarget) setAskaiDetail(null) }}>
                  <div className={styles.dsModal}>
                    <div className={styles.dsModalHead}>
                      <div className={styles.dsModalTitle}>{askaiDetail.tool_name}</div>
                      <button type="button" className={styles.dsModalClose} onClick={() => setAskaiDetail(null)}>
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                      </button>
                    </div>
                    <p className={styles.dsModalSub}>
                      {askaiDetail.created_at ? new Date(askaiDetail.created_at).toLocaleString('en-IN') : ''} &middot; {askaiDetail.user_id || 'unknown user'} &middot; {askaiDetail.row_count == null ? '—' : askaiDetail.row_count} rows &middot; {askaiDetail.latency_ms != null ? `${askaiDetail.latency_ms}ms` : '—'}
                    </p>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Parameters</div>
                    <pre style={{ margin: 0, padding: 12, background: '#F8FAFC', border: '0.5px solid #EEF1F6', borderRadius: 10, fontSize: 12, fontFamily: 'monospace', color: '#1E293B', overflowX: 'auto', maxHeight: 280, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                      {(() => { try { return JSON.stringify(JSON.parse(askaiDetail.params || '{}'), null, 2) } catch { return askaiDetail.params || '{}' } })()}
                    </pre>
                    <div className={styles.dsModalActions}>
                      <Button size="sm" variant="secondary" onClick={() => setAskaiDetail(null)}>Close</Button>
                    </div>
                  </div>
                </div>
              )}
            </>
            )
          })()}

          {/* ---------------- APPEARANCE ---------------- */}
          {activeTab === 'appearance' && userIsAdmin && (
            <>
              {/* PAGE VISIBILITY → now in User Access tab */}
              <div className={styles.card} style={{display:'flex',alignItems:'center',gap:14,padding:'14px 18px'}}>
                <div style={{width:34,height:34,borderRadius:9,background:'#E8EFF9',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1F3C84" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700,color:'#0F172A',marginBottom:2}}>Global Page Visibility</div>
                  <div style={{fontSize:12,color:'#94A3B8',lineHeight:1.5}}>Unified with per-user access in the <strong>User Access</strong> tab — manage global and individual page access together.</div>
                </div>
                <button onClick={()=>setActiveTab('users')} style={{padding:'7px 14px',borderRadius:8,background:'#F8FAFC',border:'0.5px solid #E2E8F0',fontSize:12,fontWeight:600,color:'#1F3C84',cursor:'pointer',whiteSpace:'nowrap',fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
                  User Access →
                </button>
              </div>

              {/* DESIGN SYSTEM — Button / KPI card / Login page live pickers.
                  Picking any one applies to the entire app instantly. */}
              <div className={styles.card}>
                <h3 className={styles.cardTitle}>Buttons</h3>
                <p className={styles.cardDesc}>Pick a button style — applies to every button in the app immediately.</p>
                <p className={styles.cardDesc} style={{ marginTop: -4 }}>Hover a preview to see how it actually behaves — several of these differ mainly on hover (a ring, a glow, a spinning border), not at rest.</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10 }}>
                  {BUTTON_STYLE_NAMES.map((name, i) => {
                    const id = i + 1
                    const active = buttonStyleId === id
                    return (
                      <div key={id} onClick={() => pickDesignStyle('button', id)} style={{
                        cursor: 'pointer', borderRadius: 12, padding: 12, border: `1.5px solid ${active ? '#1F3C84' : '#E2E8F0'}`,
                        background: active ? '#F0FBFF' : '#fff', boxShadow: active ? '0 0 0 3px rgba(31,60,132,0.12)' : '0 1px 3px rgba(15,23,42,0.04)',
                        display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center',
                      }}>
                        <Button previewVariantId={id} size="sm">Preview</Button>
                        <div style={{ fontSize: 10.5, fontWeight: 600, color: active ? '#1F3C84' : '#64748B', textAlign: 'center', lineHeight: 1.3 }}>{id}. {name}</div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className={styles.card}>
                <h3 className={styles.cardTitle}>KPI Cards</h3>
                <p className={styles.cardDesc}>Pick a KPI card style — applies to every dashboard's metric cards immediately.</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: 10 }}>
                  {KPI_STYLE_NAMES.map((name, i) => {
                    const id = i + 1
                    const active = kpiStyleId === id
                    return (
                      <div key={id} onClick={() => pickDesignStyle('kpi', id)} style={{
                        cursor: 'pointer', borderRadius: 12, padding: 10, border: `1.5px solid ${active ? '#1F3C84' : '#E2E8F0'}`,
                        background: active ? '#F0FBFF' : '#fff', boxShadow: active ? '0 0 0 3px rgba(31,60,132,0.12)' : '0 1px 3px rgba(15,23,42,0.04)',
                        display: 'flex', flexDirection: 'column', gap: 8,
                      }}>
                        <div style={{ transform: 'scale(0.82)', transformOrigin: 'top left', width: '122%', pointerEvents: 'none' }}>
                          {renderKpiVariant(id, { label: 'Total Leads', value: '84,848', sub: 'generated', deltaText: '▼ 12.4%', isGood: false, icon: null, accent: '#1F3C84' })}
                        </div>
                        <div style={{ fontSize: 10.5, fontWeight: 600, color: active ? '#1F3C84' : '#64748B', textAlign: 'center' }}>{id}. {name}</div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* THEME */}
              <div className={styles.card}>
                <h3 className={styles.cardTitle}>Theme</h3>
                <p className={styles.cardDesc}>Choose a colour scheme for the entire dashboard.</p>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:12}}>
                  {THEMES.map(theme => {
                    const isActive = activeTheme === theme.id
                    return (
                      <div key={theme.id} onClick={() => applyTheme(theme.id)} className={styles.pxThemeCard}
                        style={{
                          borderRadius:12,border:`1.5px solid ${isActive ? '#1F3C84' : '#E2E8F0'}`,
                          padding:'14px 16px',cursor:'pointer',transition:'all .15s',
                          background: isActive ? '#F0FBFF' : '#fff',
                          boxShadow: isActive ? '0 0 0 3px rgba(31,60,132,0.12)' : '0 1px 3px rgba(15,23,42,0.04)',
                          position:'relative',
                        }}>
                        {isActive && (
                          <div style={{position:'absolute',top:10,right:10,width:18,height:18,borderRadius:9,background:'#1F3C84',display:'flex',alignItems:'center',justifyContent:'center'}}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                          </div>
                        )}
                        {/* Colour preview swatches */}
                        <div style={{display:'flex',gap:5,marginBottom:12}}>
                          {theme.preview.map((col, ci) => (
                            <div key={ci} style={{height:28,flex:1,borderRadius:6,background:col,border:'0.5px solid rgba(0,0,0,0.06)'}}/>
                          ))}
                        </div>
                        <div style={{fontSize:13,fontWeight:700,color:'#0F172A',marginBottom:2}}>{theme.name}</div>
                        <div style={{fontSize:11.5,color:'#94A3B8'}}>{theme.desc}</div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* KPI CARD ICONS */}
              <div className={styles.card}>
                <h3 className={styles.cardTitle}>KPI Card Icons</h3>
                <p className={styles.cardDesc}>Choose which icon style appears on metric cards. Changes apply across all dashboards.</p>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:16}}>
                  {Object.entries(KPI_ICON_SETS).map(([slot, cfg]) => {
                    const active = kpiIcons[slot] || cfg.icons[0]
                    return (
                      <div key={slot}>
                        <div style={{fontSize:11,fontWeight:700,color:'#94A3B8',letterSpacing:'0.07em',textTransform:'uppercase',marginBottom:8}}>{cfg.label}</div>
                        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                          {cfg.icons.map(icon => {
                            const isSelected = active === icon
                            return (
                              <button key={icon} onClick={() => setKpiIcon(slot, icon)}
                                title={icon}
                                style={{
                                  width:38,height:38,borderRadius:9,border:`1.5px solid ${isSelected ? '#1F3C84' : '#E2E8F0'}`,
                                  background: isSelected ? '#E3F5FD' : '#F8FAFC',
                                  display:'flex',alignItems:'center',justifyContent:'center',
                                  cursor:'pointer',transition:'all .15s',
                                  boxShadow: isSelected ? '0 0 0 3px rgba(31,60,132,0.1)' : 'none',
                                }}>
                                <KpiIconPreview name={icon} color={isSelected ? '#1F3C84' : '#94A3B8'} />
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div style={{marginTop:16,padding:'12px 14px',background:'#F8FAFC',borderRadius:9,border:'0.5px solid #E2E8F0',display:'flex',alignItems:'center',gap:10}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  <span style={{fontSize:12,color:'#94A3B8'}}>Icon preferences are saved locally. Assign icons to each metric category to match your team's mental model.</span>
                </div>
              </div>

              {/* SIDEBAR LAYOUT */}
              <div className={styles.card}>
                <h3 className={styles.cardTitle}>Sidebar Layout</h3>
                <p className={styles.cardDesc}>Control how much space the navigation takes up. Applies immediately.</p>
                <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
                  {SIDEBAR_MODES.map(mode => {
                    const isActive = sidebarMode === mode.id
                    return (
                      <div key={mode.id} onClick={() => applySidebarMode(mode.id)}
                        style={{flex:'1 1 150px',padding:'14px 16px',borderRadius:10,cursor:'pointer',transition:'all .15s',border:`1.5px solid ${isActive ? '#1F3C84' : '#E2E8F0'}`,background:isActive?'#F0FBFF':'#fff',boxShadow:isActive?'0 0 0 3px rgba(31,60,132,0.1)':'0 1px 3px rgba(15,23,42,0.04)',position:'relative'}}>
                        {isActive && <div style={{position:'absolute',top:10,right:10,width:18,height:18,borderRadius:9,background:'#1F3C84',display:'flex',alignItems:'center',justifyContent:'center'}}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg></div>}
                        <div style={{fontSize:13,fontWeight:700,color:'#0F172A',marginBottom:3}}>{mode.label}</div>
                        <div style={{fontSize:11.5,color:'#94A3B8'}}>{mode.desc}</div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* NUMBER FORMAT */}
              <div className={styles.card}>
                <h3 className={styles.cardTitle}>Number Format</h3>
                <p className={styles.cardDesc}>How large numbers are displayed across all dashboards.</p>
                <div style={{display:'flex',flexDirection:'column',gap:10}}>
                  {NUMBER_FORMATS.map(fmt => {
                    const isActive = numberFormat === fmt.id
                    return (
                      <div key={fmt.id} onClick={() => applyNumberFormat(fmt.id)}
                        style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'13px 16px',borderRadius:10,cursor:'pointer',transition:'all .15s',border:`1.5px solid ${isActive?'#1F3C84':'#E2E8F0'}`,background:isActive?'#F0FBFF':'#fff'}}>
                        <div>
                          <div style={{fontSize:13,fontWeight:600,color:'#0F172A',marginBottom:2}}>{fmt.label}</div>
                          <div style={{fontSize:11.5,color:'#94A3B8'}}>{fmt.desc}</div>
                        </div>
                        <div style={{fontFamily:'monospace',fontSize:12,color:isActive?'#1F3C84':'#94A3B8',fontWeight:600,textAlign:'right',flexShrink:0,marginLeft:12}}>{fmt.example}</div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* DEFAULT DATE RANGE */}
              <div className={styles.card}>
                <h3 className={styles.cardTitle}>Default Date Range</h3>
                <p className={styles.cardDesc}>Time period loaded by default when opening a dashboard. Overridden per-session by your manual selection.</p>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:10}}>
                  {DATE_RANGES.map(range => {
                    const isActive = defaultDateRange === range.id
                    return (
                      <div key={range.id} onClick={() => applyDefaultDate(range.id)}
                        style={{padding:'12px 14px',borderRadius:10,cursor:'pointer',transition:'all .15s',border:`1.5px solid ${isActive?'#1F3C84':'#E2E8F0'}`,background:isActive?'#F0FBFF':'#fff',position:'relative'}}>
                        {isActive && <div style={{position:'absolute',top:10,right:10,width:16,height:16,borderRadius:8,background:'#1F3C84',display:'flex',alignItems:'center',justifyContent:'center'}}><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg></div>}
                        <div style={{fontSize:13,fontWeight:600,color:'#0F172A',marginBottom:3}}>{range.label}</div>
                        <div style={{fontSize:11.5,color:'#94A3B8'}}>{range.desc}</div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* TABLE DENSITY */}
              <div className={styles.card}>
                <h3 className={styles.cardTitle}>Table Density</h3>
                <p className={styles.cardDesc}>Row height across all data tables. Compact shows more rows; Spacious is easier to scan quickly.</p>
                <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
                  {DENSITIES.map(den => {
                    const isActive = tableDensity === den.id
                    return (
                      <div key={den.id} onClick={() => applyDensity(den.id)}
                        style={{flex:'1 1 140px',cursor:'pointer',borderRadius:10,transition:'all .15s',overflow:'hidden',border:`1.5px solid ${isActive?'#1F3C84':'#E2E8F0'}`,boxShadow:isActive?'0 0 0 3px rgba(31,60,132,0.1)':'none'}}>
                        <div style={{padding:'10px 12px 6px',background:isActive?'#F0FBFF':'#F8FAFC'}}>
                          {[1,2,3].map(row => (
                            <div key={row} style={{display:'flex',gap:6,padding:`${den.rowH} 0`,borderBottom:'0.5px solid #E2E8F0'}}>
                              <div style={{width:'40%',height:8,borderRadius:3,background:isActive?'#BAE3F9':'#E2E8F0'}}/>
                              <div style={{width:'30%',height:8,borderRadius:3,background:isActive?'#D1EEFB':'#EEF0F3'}}/>
                              <div style={{width:'20%',height:8,borderRadius:3,background:isActive?'#D1EEFB':'#EEF0F3'}}/>
                            </div>
                          ))}
                        </div>
                        <div style={{padding:'10px 12px',borderTop:`1.5px solid ${isActive?'#1F3C84':'#E2E8F0'}`,background:'#fff'}}>
                          <div style={{fontSize:12,fontWeight:700,color:isActive?'#1F3C84':'#0F172A'}}>{den.label}</div>
                          <div style={{fontSize:11,color:'#94A3B8',marginTop:2}}>{den.desc}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
          </>
        )}

                    {activeTab === 'profile' && (
              <div className={styles.pxProfileWrap}>
                <div className={styles.pxHero}>
                  <div className={styles.pxHeroGlow} />
                  <div className={styles.pxHeroInner}>
                    <div className={styles.pxAvatarRing}>
                      <div className={styles.pxAvatar}>
                        {user?.picture
                          ? <img src={user.picture} alt={user.name} className={styles.pxAvatarImg}/>
                          : <span>{(user?.name||'U').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}</span>}
                      </div>
                    </div>
                    <div className={styles.pxHeroText}>
                      <div className={styles.pxHeroName}>{user?.name || 'User'}</div>
                      <div className={styles.pxHeroEmail}>{user?.email}</div>
                      <div className={styles.pxHeroBadges}>
                        <span className={styles.pxRoleBadge}>{user?.role === 'admin' ? 'Administrator' : 'Viewer'}</span>
                        <span className={styles.pxStatusBadge}><i className={styles.pxDot}/> Active session</span>
                      </div>
                    </div>
                    <Button size="sm" variant="secondary" onClick={()=>{ if(user?.email){navigator.clipboard?.writeText(user.email); setCopied(true); setTimeout(()=>setCopied(false),1600);} }}>
                      {copied ? 'Copied' : 'Copy email'}
                    </Button>
                  </div>
                </div>

                <div className={styles.pxStatRow}>
                  <div className={styles.pxStatCard}>
                    <div className={styles.pxStatLabel}>Access level</div>
                    <div className={styles.pxStatValue}>{user?.role === 'admin' ? 'Full' : 'Standard'}</div>
                    <div className={styles.pxStatSub}>{user?.role === 'admin' ? 'All dashboards & settings' : 'Assigned dashboards'}</div>
                  </div>
                  <div className={styles.pxStatCard}>
                    <div className={styles.pxStatLabel}>Sign-in method</div>
                    <div className={styles.pxStatValue}>Google</div>
                    <div className={styles.pxStatSub}>Leverage Edu workspace</div>
                  </div>
                  <div className={styles.pxStatCard}>
                    <div className={styles.pxStatLabel}>Workspace</div>
                    <div className={styles.pxStatValue}>Quantum</div>
                    <div className={styles.pxStatSub}>leverageedu.com</div>
                  </div>
                </div>

                <div className={styles.card}>
                  <h3 className={styles.cardTitle}>Account details</h3>
                  <p className={styles.cardDesc}>Your profile is managed through your Leverage Edu Google account.</p>
                  <div className={styles.pxDetailGrid}>
                    <div className={styles.pxDetailItem}><span className={styles.pxDetailKey}>Full name</span><span className={styles.pxDetailVal}>{user?.name || '—'}</span></div>
                    <div className={styles.pxDetailItem}><span className={styles.pxDetailKey}>Email address</span><span className={styles.pxDetailVal}>{user?.email || '—'}</span></div>
                    <div className={styles.pxDetailItem}><span className={styles.pxDetailKey}>Role</span><span className={styles.pxDetailVal}>{user?.role === 'admin' ? 'Administrator' : 'Viewer'}</span></div>
                    <div className={styles.pxDetailItem}><span className={styles.pxDetailKey}>Theme</span><span className={styles.pxDetailVal} style={{textTransform:'capitalize'}}>{activeTheme || 'light'}</span></div>
                  </div>
                </div>
              </div>
              )}
        </div>
      </div>
    </div>
  )
}
