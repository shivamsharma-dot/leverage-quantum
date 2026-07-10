import React, { useEffect, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import CommandPalette from './components/CommandPalette'
import ToastHost from './components/ToastHost'
import { useAuth } from './hooks/useAuth'
import { logActivity, pageLabel, installActivityTracker } from './components/ActivityLogger'
import LoginPage from './pages/LoginPage'; import { prefetchSummaryAnalysis } from './lib/summaryData'
const DashboardHome = lazy(() => import('./pages/DashboardHome'))
const ROASDashboard = lazy(() => import('./pages/ROASDashboard'))
const LeadQualityDashboard = lazy(() => import('./pages/LeadQualityDashboard'))
const ChannelMixDashboard = lazy(() => import('./pages/ChannelMixDashboard'))
const RevenueDashboard = lazy(() => import('./pages/RevenueDashboard'))
const LeadQualificationDashboard = lazy(() => import('./pages/LeadQualificationDashboard'))
const WhatsAppDashboard = lazy(() => import('./pages/WhatsAppDashboard'))
const MTDDashboard = lazy(() => import('./pages/MTDDashboard'))
const MetaAdsDashboard = lazy(() => import('./pages/MetaAdsDashboard'))
const GoogleAdsDashboard = lazy(() => import('./pages/GoogleAdsDashboard'))
const ReferralDashboard = lazy(() => import('./pages/ReferralDashboard'))
const LeadsAssignedDashboard = lazy(() => import('./pages/LeadsAssignedDashboard'))
const AskAI = lazy(() => import('./pages/AskAI'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))

// Suspense fallback — slim skeleton shown while lazy chunk loads

// Page title map — dynamic titles per route
const PAGE_TITLES = {
  '/': 'Summary',
  '/dashboard/meta-ads': 'Meta Ads',
  '/dashboard/google-ads': 'Google Ads',
  '/dashboard/roas': 'ROAS',
  '/dashboard/mtd': 'MTD',
  '/dashboard/lead-quality': 'Lead Quality',
  '/dashboard/channel-mix': 'Channel Mix',
  '/dashboard/revenue': 'Revenue',
  '/dashboard/lq-ops': 'Daily QLs',
  '/dashboard/lq-ops-monthly': 'Monthly QLs',
  '/dashboard/whatsapp': 'WhatsApp',
  '/dashboard/referral': 'Referral',
  '/dashboard/leads-assigned': 'Leads Assigned',
  '/ask-ai': 'Ask AI',
  '/settings': 'Settings',
}

// ── Route fade transition ──────────────────────────────────────────────────────
const FADE_STYLE = `
@keyframes qFadeIn {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
.q-page-enter {
  animation: qFadeIn 0.42s cubic-bezier(0.22,0.61,0.36,1) both;
  will-change: opacity, transform;
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

// Mirrors Sidebar.jsx's canSee() exactly — this is the REAL access gate (nav
// visibility alone is cosmetic; this is what actually blocks direct URL access).
function canAccess(role, dashboardId) {
  const userRole = role || 'viewer'
  if (dashboardId === 'settings') return userRole === 'admin'
  if (userRole === 'admin') return true
  if (userRole === 'viewer') return dashboardId !== 'ask_ai'
  if (userRole.startsWith('viewer:')) {
    const granted = userRole.replace('viewer:', '').split(',').filter(Boolean)
    return granted.includes(dashboardId)
  }
  if (userRole === 'roas_only') return dashboardId === 'roas'
  if (userRole.startsWith('custom:')) {
    return userRole.replace('custom:', '').split(',').filter(Boolean).includes(dashboardId)
  }
  // Unknown/malformed role — fail safe (no ask-ai, no settings), not fail-open
  return dashboardId !== 'ask_ai'
}

// Ordered fallback for a denied route — first entry the role can actually access
const DASHBOARD_FALLBACK_ORDER = [
  { id: 'home', path: '/' },
  { id: 'roas', path: '/dashboard/roas' },
  { id: 'meta_ads', path: '/dashboard/meta-ads' },
]

function ProtectedRoute({ children, dashboardId }) {
  const { user, loading } = useAuth()
  const location = useLocation(); /* warm the Summary page cache once per session, as soon as we know who is logged in */ useEffect(() => { if (user && user.email) prefetchSummaryAnalysis() }, [user && user.email])

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
  if (dashboardId && !canAccess(user.role, dashboardId)) {
    const fallback = DASHBOARD_FALLBACK_ORDER.find(f => canAccess(user.role, f.id))
    return <Navigate to={fallback ? fallback.path : '/login'} replace />
  }

  // Wrap in fade div
  return (
    <div key={location.pathname} className="q-page-enter">
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
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<ProtectedRoute dashboardId="home"> <DashboardHome /></ProtectedRoute>} />
          <Route path="/dashboard/roas" element={<ProtectedRoute dashboardId="roas"> <ROASDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/mtd" element={<ProtectedRoute dashboardId="mtd"> <MTDDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/lead-quality" element={<ProtectedRoute dashboardId="lead_quality"><LeadQualityDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/channel-mix" element={<ProtectedRoute dashboardId="channel_mix"><ChannelMixDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/revenue" element={<ProtectedRoute dashboardId="revenue"> <RevenueDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/lq-ops" element={<ProtectedRoute dashboardId="lq_ops"> <LeadQualificationDashboard forcedView="daily" /></ProtectedRoute>} />
          <Route path="/dashboard/lq-ops-monthly" element={<ProtectedRoute dashboardId="lq_ops_monthly"> <LeadQualificationDashboard forcedView="monthly" /></ProtectedRoute>} />
          <Route path="/dashboard/referral" element={<ProtectedRoute dashboardId="referral"><ReferralDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/leads-assigned" element={<ProtectedRoute dashboardId="leads_assigned"><LeadsAssignedDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/whatsapp" element={<ProtectedRoute dashboardId="whatsapp"> <WhatsAppDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/meta-ads" element={<ProtectedRoute dashboardId="meta_ads"> <MetaAdsDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/google-ads" element={<ProtectedRoute dashboardId="google_ads"> <GoogleAdsDashboard /></ProtectedRoute>} />
          <Route path="/ask-ai" element={<ProtectedRoute dashboardId="ask_ai"> <AskAI /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute dashboardId="settings"> <SettingsPage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
    }
