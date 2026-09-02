import React, { useEffect, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import CommandPalette from './components/CommandPalette'
import ToastHost from './components/ToastHost'
import { useAuth } from './hooks/useAuth'
import { logActivity, pageLabel, installActivityTracker } from './components/ActivityLogger'
import LoginPage from './pages/LoginPage'; import { prefetchSummaryAnalysis } from './lib/summaryData'
import { COMPONENT_IMPORTS, prefetchAllRoutes } from './lib/routePrefetch'
import { canAccessDashboard } from '../shared/access.mjs'
import { PresentationProvider } from './lib/presentationContext.jsx'
import { PAGE_LIST } from './lib/pageList'
const DashboardHome = lazy(COMPONENT_IMPORTS.DashboardHome)
const OverallDashboard = lazy(COMPONENT_IMPORTS.OverallDashboard)
const ROASDashboard = lazy(COMPONENT_IMPORTS.ROASDashboard)
const LeadQualityDashboard = lazy(COMPONENT_IMPORTS.LeadQualityDashboard)
const ChannelMixDashboard = lazy(COMPONENT_IMPORTS.ChannelMixDashboard)
const RevenueDashboard = lazy(COMPONENT_IMPORTS.RevenueDashboard)
const OrganicSocialDashboard = lazy(COMPONENT_IMPORTS.OrganicSocialDashboard)
const LeadQualificationDashboard = lazy(COMPONENT_IMPORTS.LeadQualificationDashboard)
const HumanQLDetailDashboard = lazy(COMPONENT_IMPORTS.HumanQLDetailDashboard)
const AIQLDetailDashboard = lazy(COMPONENT_IMPORTS.AIQLDetailDashboard)
const HumanUnassignedDashboard = lazy(COMPONENT_IMPORTS.HumanUnassignedDashboard)
const AIUnassignedDashboard = lazy(COMPONENT_IMPORTS.AIUnassignedDashboard)
const FutworkErrorsDashboard = lazy(COMPONENT_IMPORTS.FutworkErrorsDashboard)
const LeadQualificationSchemaDashboard = lazy(COMPONENT_IMPORTS.LeadQualificationSchemaDashboard)
const WhatsAppDashboard = lazy(COMPONENT_IMPORTS.WhatsAppDashboard)
const MTDDashboard = lazy(COMPONENT_IMPORTS.MTDDashboard)
const MetaAdsDashboard = lazy(COMPONENT_IMPORTS.MetaAdsDashboard)
const CreativeDownloaderDashboard = lazy(COMPONENT_IMPORTS.CreativeDownloaderDashboard)
const LeverageCareersDashboard = lazy(COMPONENT_IMPORTS.LeverageCareersDashboard)
const AppsDashboard = lazy(COMPONENT_IMPORTS.AppsDashboard)
const GoogleAdsDashboard = lazy(COMPONENT_IMPORTS.GoogleAdsDashboard)
const BingAdsDashboard = lazy(COMPONENT_IMPORTS.BingAdsDashboard)
const ReferralDashboard = lazy(COMPONENT_IMPORTS.ReferralDashboard)
const LeadsAssignedDashboard = lazy(COMPONENT_IMPORTS.LeadsAssignedDashboard)
const LeadSquaredDashboard = lazy(COMPONENT_IMPORTS.LeadSquaredDashboard)
const TeamMappingDashboard = lazy(COMPONENT_IMPORTS.TeamMappingDashboard)
const SuperTrackerDashboard = lazy(COMPONENT_IMPORTS.SuperTrackerDashboard)
const AskAI = lazy(COMPONENT_IMPORTS.AskAI)
const AgentsDashboard = lazy(COMPONENT_IMPORTS.AgentsDashboard)
const MarketingPerformanceReport = lazy(COMPONENT_IMPORTS.MarketingPerformanceReport)
const CeoB2CDashboard = lazy(COMPONENT_IMPORTS.CeoB2CDashboard)
const SettingsPage = lazy(COMPONENT_IMPORTS.SettingsPage)

// Suspense fallback — slim skeleton shown while lazy chunk loads

// Page title map — dynamic titles per route
const PAGE_TITLES = {
  '/': 'Summary',
  '/dashboard/overall': 'Overall',
  '/dashboard/overall-bigquery': 'Overall (BigQuery)',
  '/dashboard/ceo-b2c-pnl': 'Daily P&L',
  '/dashboard/ceo-b2c-cashflow': 'Daily Cash Flow',
  '/dashboard/meta-ads': 'Meta Ads',
  '/dashboard/creative-downloader': 'Creative Downloader',
  '/dashboard/leverage-careers': 'Leverage Careers',
  '/dashboard/apps': 'Apps',
  '/dashboard/google-ads': 'Google Ads',
  '/dashboard/bing-ads': 'Bing Ads',
  '/dashboard/roas': 'ROAS',
  '/dashboard/mtd': 'MTD',
  '/dashboard/lead-quality': 'Lead Quality',
  '/dashboard/channel-mix': 'Channel Mix',
  '/dashboard/revenue': 'Revenue',
  '/dashboard/organic-social': 'Organic & Social',
  '/dashboard/lq-ops': 'Daily QLs',
  '/dashboard/lq-ops-monthly': 'Monthly QLs',
  '/dashboard/lq-ops-detail': 'Human QL Detail',
  '/dashboard/lq-ops-ai-detail': 'AI QL Detail',
  '/dashboard/lq-ops-human-unassigned': 'Human Unassigned',
  '/dashboard/lq-ops-ai-unassigned': 'AI Unassigned',
  '/dashboard/futwork-errors': 'Futwork Errors',
  '/dashboard/lq-field-schema': 'Field Schema',
  '/dashboard/whatsapp': 'WhatsApp',
  '/dashboard/referral': 'Referral',
  '/dashboard/leads-assigned': 'Leads Assigned',
  '/dashboard/leadsquared': 'LeadSquared',
  '/dashboard/team-mapping': 'Team Mapping',
  '/dashboard/super-tracker': 'Super Tracker',
  '/ask-ai': 'Ask AI',
  '/dashboard/agents': 'Agents',
  '/dashboard/marketing-performance': 'Marketing Performance',
  '/settings': 'Settings',
  '/settings/reports/email': 'Email Reports',
  '/settings/reports/slack': 'Slack',
}

// ── Route fade transition ──────────────────────────────────────────────────────
// .q-page-enter wraps EVERY page's whole render tree in ProtectedRoute below --
// and every page renders its own <Sidebar/> as part of that same tree (Sidebar
// is not lifted to a persistent app-shell level; each of the ~28 page
// components mounts its own instance). qFadeIn used to animate this wrapper's
// opacity AND transform (translateY 12px -> 0) on every single cross-page
// navigation -- which meant the sidebar itself visibly slid up and faded in on
// every click, since it's a plain child of the same animated div. Reported
// live as "whole page jumping on every other page click" and diagnosed
// correctly by the user: "sidebar shouldn't react to what is getting loaded."
// Confirmed via getAnimations() polling that qFadeIn genuinely fires on cross-
// page navigation, not just same-page tab switches. No animation now -- the
// content swap is instant, so nothing (sidebar included) visibly moves.
const FADE_STYLE = `
.q-page-enter {
}
@keyframes qSpin { to { transform: rotate(360deg); } }
.q-loader-wrap {
  min-height: 60vh;
  display: flex; align-items: center; justify-content: center;
  animation: qFadeIn 0.3s ease both;
}
.q-loader {
  width: 34px; height: 34px; border-radius: 50%;
  border: 3px solid #E3E8F0; border-top-color: #1C9FD4;
  animation: qSpin 0.7s linear infinite;
}
`

function PageLoader() {
  return (
    <div className="q-loader-wrap" role="status" aria-label="Loading">
      <div className="q-loader" />
    </div>
  )
}

// Access rules come from shared/access.mjs -- the same function lib/auth.mjs
// re-exports for the server-side gate, so the route guard and the API can no
// longer drift apart. Server-side is what actually protects data; this blocks
// direct URL access in the client.
const canAccess = canAccessDashboard

// Ordered fallback for a denied route — first entry the role can actually access.
// Preferred picks first (the app's most common landing pages), then EVERY other
// real page from PAGE_LIST as a safety net. The old 3-entry list (home/roas/
// meta_ads only) meant a custom-role account whose grants sit entirely outside
// those three -- e.g. QL-Ops-only -- had NO valid fallback at all: `/` denied ->
// redirect to `/login` -> LoginPage sees a real session and immediately
// navigates back to `/` -> denied again -> ... an infinite redirect loop that
// never lets either page paint, rendering as a permanently blank white screen.
// Confirmed live 2026-09-01 for exactly such an account (sneha@futwork.com,
// granted only the Lead Qualification / QL Ops pages).
const PREFERRED_FALLBACKS = ['home', 'roas', 'meta_ads']
const DASHBOARD_FALLBACK_ORDER = [
  ...PREFERRED_FALLBACKS.map(id => PAGE_LIST.find(p => p.id === id)).filter(Boolean),
  ...PAGE_LIST.filter(p => !PREFERRED_FALLBACKS.includes(p.id)),
]

function ProtectedRoute({ children, dashboardId }) {
  const { user, loading, hiddenPages, prefsReady, refreshUser } = useAuth()
  const location = useLocation(); /* A1: warm the Summary page cache -- but ONLY while actually on Summary.
     This used to fire on EVERY route, so three sheet CSV downloads
     (googleleads / Qlops / QLSnapshot) plus three Meta Graph /insights calls
     raced ahead of the current page's own data fetch; on /dashboard/overall
     that pushed first meaningful paint out to 76-86s on a cold load. Also
     deferred to idle so it never contends with the page's own first render. */
  const onSummaryRoute = location.pathname === '/'
  useEffect(() => {
    if (!user || !user.email || !onSummaryRoute) return
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 300))
    const cancelWarm = window.cancelIdleCallback || clearTimeout
    const h = idle(() => { prefetchSummaryAnalysis() })
    return () => cancelWarm(h)
  }, [user && user.email, onSummaryRoute])

  // Re-check access on every navigation so a permission grant/revoke made while
  // this tab is open takes effect on the user's very next click, instead of
  // needing a hard refresh (AuthProvider's own mount-time check only runs once).
  useEffect(() => { refreshUser && refreshUser() }, [location.pathname])

  // Warm every page's JS chunk in idle time once logged in, so switching sections
  // almost never shows the Suspense loader (only the very first, unwarmed navigation would).
  useEffect(() => {
    if (!user || !user.email) return
    const idle = window.requestIdleCallback || (fn => setTimeout(fn, 1500))
    const cancelIdle = window.cancelIdleCallback || clearTimeout
    const id = idle(() => prefetchAllRoutes())
    return () => cancelIdle(id)
  }, [user && user.email])

  // Dynamic page title
  useEffect(() => {
    const base = PAGE_TITLES[location.pathname] || ''
    document.title = base ? `${base} | Leverage Quantum` : 'Leverage Quantum'
  }, [location.pathname])

  // Activity logging — page view + dwell time on leave
  useEffect(() => {
    if (user?.email && dashboardId) {
      logActivity(user.email, 'view', location.pathname, 'Viewed ' + pageLabel(location.pathname))
      const enteredAt = Date.now()
      const path = location.pathname
      return () => {
        const secs = Math.round((Date.now() - enteredAt) / 1000)
        if (secs >= 3) {
          const mins = secs >= 60 ? Math.floor(secs / 60) + 'm ' + (secs % 60) + 's' : secs + 's'
          logActivity(user.email, 'leave', path, 'Left ' + pageLabel(path) + ' after ' + mins)
        }
      }
    }
  }, [location.pathname, user?.email])

  // Install global interaction tracker once (clicks, tab switches)
  useEffect(() => {
    if (!user?.email) return
    const cleanup = installActivityTracker(() => user?.email, () => window.location.pathname)
    return cleanup
  }, [user?.email])

  // Clean up stale localStorage keys from old Ask AI implementation
  useEffect(() => {
    const staleKeys = ['lq_ask_ai_conversations']
    const allKeys = Object.keys(localStorage)
    allKeys.forEach(k => {
      if (staleKeys.includes(k) || (k.startsWith('conv_') && !k.startsWith('conv_cv_'))) {
        localStorage.removeItem(k)
      }
    })
  }, [])

  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  // Wait for the real, server-verified hidden_pages list before deciding anything
  // below -- hiddenPages starts seeded from localStorage (a fast-paint cache) but
  // that's never trustworthy enough to gate access on; prefsReady only flips once
  // the actual /api/preferences fetch has resolved (success or failure).
  if (!prefsReady) return null
  // A page an admin hid from "everyone's sidebar" was previously still reachable
  // by anyone who knew/guessed the URL -- Global Page Visibility only hid the nav
  // link, never the route itself. Admins can still open a page they hid (e.g. to
  // manage it), but no one else can.
  const isHiddenForRole = dashboardId && user.role !== 'admin' && hiddenPages.includes(dashboardId)
  if ((dashboardId && !canAccess(user.role, dashboardId, user.email)) || isHiddenForRole) {
    const fallback = DASHBOARD_FALLBACK_ORDER.find(f => canAccess(user.role, f.id) && !hiddenPages.includes(f.id))
    return <Navigate to={fallback ? fallback.path : '/login'} replace />
  }

  // Wrap in fade div. Settings and its /settings/reports/* sub-routes all
  // render the same <SettingsPage/> tree (2026-08-27) -- keying on the raw
  // pathname here would remount it (and lose activeTab, unsaved form
  // fields, etc.) on every drill-down navigation, exactly the "fixed
  // header, content changes below it" behavior this was built to avoid.
  // Every other page keeps the original per-path key/fade.
  const stableKey = location.pathname.startsWith('/settings') ? '/settings' : location.pathname
  return (
    <div key={stableKey} className="q-page-enter">
      {children}
    </div>
  )
}

// Error boundary — catches React render crashes, shows clean fallback
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null } }
  static getDerivedStateFromError(error) { return { hasError: true, error } }
  componentDidCatch(error, info) { console.error('Quantum error:', error, info); try { const msg = String(error && error.message || ''); if (/fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(msg)) { const key = 'lq_chunk_reload_at'; const last = Number(sessionStorage.getItem(key) || 0); if (Date.now() - last > 10000) { sessionStorage.setItem(key, String(Date.now())); window.location.reload() } } } catch (e) {} }
  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div style={{ display:'flex', height:'100vh', alignItems:'center', justifyContent:'center', background:'#F4F6F9', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
        <div style={{ textAlign:'center', maxWidth:420, padding:40 }}>
          <div style={{ width:56, height:56, borderRadius:16, background:'#FEF2F2', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <div style={{ fontSize:18, fontWeight:800, color:'#0F172A', marginBottom:8 }}>Something went wrong</div>
          <div style={{ fontSize:13.5, color:'#94A3B8', lineHeight:1.6, marginBottom:24 }}>
            {this.state.error?.message || 'An unexpected error occurred. This has been logged.'}
          </div>
          <button onClick={() => window.location.reload()}
            style={{ padding:'10px 24px', borderRadius:10, border:'none', background:'#1F3C84', color:'#fff', fontSize:13.5, fontWeight:700, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
            Reload page
          </button>
        </div>
      </div>
    )
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <style>{FADE_STYLE}</style>
      <CommandPalette />
      <ToastHost />
      <PresentationProvider>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<ProtectedRoute dashboardId="home"> <DashboardHome /></ProtectedRoute>} />
          <Route path="/dashboard/overall" element={<ProtectedRoute dashboardId="overall"> <OverallDashboard dataSource="sheet" /></ProtectedRoute>} />
          <Route path="/dashboard/overall-bigquery" element={<ProtectedRoute dashboardId="overall_bigquery"> <OverallDashboard dataSource="bigquery" /></ProtectedRoute>} />
          <Route path="/dashboard/ceo-b2c" element={<Navigate to="/dashboard/ceo-b2c-pnl" replace />} />
          <Route path="/dashboard/ceo-b2c-pnl" element={<ProtectedRoute dashboardId="ceo_b2c_pnl"> <CeoB2CDashboard statement="pnl" /></ProtectedRoute>} />
          <Route path="/dashboard/ceo-b2c-cashflow" element={<ProtectedRoute dashboardId="ceo_b2c_cashflow"> <CeoB2CDashboard statement="cashflow" /></ProtectedRoute>} />
          <Route path="/dashboard/roas" element={<ProtectedRoute dashboardId="roas"> <ROASDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/mtd" element={<ProtectedRoute dashboardId="mtd"> <MTDDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/lead-quality" element={<ProtectedRoute dashboardId="lead_quality"><LeadQualityDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/channel-mix" element={<ProtectedRoute dashboardId="channel_mix"><ChannelMixDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/revenue" element={<ProtectedRoute dashboardId="revenue"> <RevenueDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/organic-social" element={<ProtectedRoute dashboardId="organic_social"><OrganicSocialDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/lq-ops" element={<ProtectedRoute dashboardId="lq_ops"> <LeadQualificationDashboard forcedView="daily" /></ProtectedRoute>} />
          <Route path="/dashboard/lq-ops-monthly" element={<ProtectedRoute dashboardId="lq_ops_monthly"> <LeadQualificationDashboard forcedView="monthly" /></ProtectedRoute>} />
          <Route path="/dashboard/lq-ops-detail" element={<ProtectedRoute dashboardId="lq_ops_detail"> <HumanQLDetailDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/lq-ops-ai-detail" element={<ProtectedRoute dashboardId="lq_ops_ai_detail"> <AIQLDetailDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/lq-ops-human-unassigned" element={<ProtectedRoute dashboardId="lq_ops_human_unassigned"> <HumanUnassignedDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/lq-ops-ai-unassigned" element={<ProtectedRoute dashboardId="lq_ops_ai_unassigned"> <AIUnassignedDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/futwork-errors" element={<ProtectedRoute dashboardId="futwork_errors"> <FutworkErrorsDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/lq-field-schema" element={<ProtectedRoute dashboardId="lq_field_schema"> <LeadQualificationSchemaDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/referral" element={<ProtectedRoute dashboardId="referral"><ReferralDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/leads-assigned" element={<ProtectedRoute dashboardId="leads_assigned"><LeadsAssignedDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/leadsquared" element={<ProtectedRoute dashboardId="leadsquared"><LeadSquaredDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/team-mapping" element={<ProtectedRoute dashboardId="team_mapping"><TeamMappingDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/super-tracker" element={<ProtectedRoute dashboardId="super_tracker"><SuperTrackerDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/whatsapp" element={<ProtectedRoute dashboardId="whatsapp"> <WhatsAppDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/meta-ads" element={<ProtectedRoute dashboardId="meta_ads"> <MetaAdsDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/creative-downloader" element={<ProtectedRoute dashboardId="creative_downloader"> <CreativeDownloaderDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/leverage-careers" element={<ProtectedRoute dashboardId="leverage_careers"> <LeverageCareersDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/apps" element={<ProtectedRoute dashboardId="apps"> <AppsDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/google-ads" element={<ProtectedRoute dashboardId="google_ads"> <GoogleAdsDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/bing-ads" element={<ProtectedRoute dashboardId="bing_ads"> <BingAdsDashboard /></ProtectedRoute>} />
          <Route path="/ask-ai" element={<ProtectedRoute dashboardId="ask_ai"> <AskAI /></ProtectedRoute>} />
          <Route path="/dashboard/agents" element={<ProtectedRoute dashboardId="agents"> <AgentsDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/marketing-performance" element={<ProtectedRoute dashboardId="marketing_performance"> <MarketingPerformanceReport /></ProtectedRoute>} />
          {/* Reports > Email/Slack (2026-08-27, corrected same day): these are NOT
              separate pages -- both routes render the exact same <SettingsPage/>,
              which reads location.pathname itself to decide what renders below
              its own fixed Data/BigQuery/User Access/... tab bar. Real routes so
              the URL is bookmarkable and the browser back button works; one
              continuous component tree so the Sidebar/tab bar never unmounts. */}
          <Route path="/settings" element={<ProtectedRoute dashboardId="settings"> <SettingsPage /></ProtectedRoute>} />
          <Route path="/settings/reports/email" element={<ProtectedRoute dashboardId="settings"> <SettingsPage /></ProtectedRoute>} />
          <Route path="/settings/reports/slack" element={<ProtectedRoute dashboardId="settings"> <SettingsPage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      </PresentationProvider>
    </ErrorBoundary>
  )
    }
