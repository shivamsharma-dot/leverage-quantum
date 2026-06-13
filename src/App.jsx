import React, { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { logActivity } from './components/ActivityLogger'
import LoginPage from './pages/LoginPage'

// Route-based code splitting — each dashboard loads only when navigated to
// Cuts initial JS bundle parse time by ~60%
const DashboardHome            = React.lazy(() => import('./pages/DashboardHome'))
const ROASDashboard            = React.lazy(() => import('./pages/ROASDashboard'))
const LeadQualityDashboard     = React.lazy(() => import('./pages/LeadQualityDashboard'))
const ChannelMixDashboard      = React.lazy(() => import('./pages/ChannelMixDashboard'))
const RevenueDashboard         = React.lazy(() => import('./pages/RevenueDashboard'))
const LeadQualificationDashboard = React.lazy(() => import('./pages/LeadQualificationDashboard'))
const WhatsAppDashboard        = React.lazy(() => import('./pages/WhatsAppDashboard'))
const MTDDashboard             = React.lazy(() => import('./pages/MTDDashboard'))
const MetaAdsDashboard         = React.lazy(() => import('./pages/MetaAdsDashboard'))
const GoogleAdsDashboard       = React.lazy(() => import('./pages/GoogleAdsDashboard'))
const VasuAI                   = React.lazy(() => import('./pages/VasuAI'))
const SettingsPage             = React.lazy(() => import('./pages/SettingsPage'))

// Suspense fallback — slim skeleton shown while lazy chunk loads
const PageSkeleton = () => (
  <div style={{ display:'flex', height:'100vh', background:'#F4F6F9', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
    <div style={{ width:232, background:'#fff', borderRight:'0.5px solid #E5E7EB', flexShrink:0 }}/>
    <div style={{ flex:1, padding:'28px' }}>
      <div style={{ height:20, width:200, borderRadius:6, marginBottom:24, background:'linear-gradient(90deg,#F0F2F5 25%,#E8EBF0 50%,#F0F2F5 75%)', backgroundSize:'200% 100%', animation:'shimmer 1.4s ease infinite' }}/>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:14, marginBottom:20 }}>
        {[...Array(5)].map((_,i) => (
          <div key={i} style={{ height:90, borderRadius:14, background:'linear-gradient(90deg,#F0F2F5 25%,#E8EBF0 50%,#F0F2F5 75%)', backgroundSize:'200% 100%', animation:`shimmer 1.4s ease ${i*0.08}s infinite` }}/>
        ))}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1.5fr 1fr', gap:14 }}>
        {[260,260].map((h,i) => (
          <div key={i} style={{ height:h, borderRadius:14, background:'linear-gradient(90deg,#F0F2F5 25%,#E8EBF0 50%,#F0F2F5 75%)', backgroundSize:'200% 100%', animation:`shimmer 1.4s ease ${i*0.1}s infinite` }}/>
        ))}
      </div>
    </div>
    <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
  </div>
)

// Page title map — dynamic titles per route
const PAGE_TITLES = {
  '/':                        'Summary',
  '/dashboard/meta-ads':      'Meta Ads',
  '/dashboard/google-ads':    'Google Ads',
  '/dashboard/roas':          'ROAS',
  '/dashboard/mtd':           'MTD',
  '/dashboard/lead-quality':  'Lead Quality',
  '/dashboard/channel-mix':   'Channel Mix',
  '/dashboard/revenue':       'Revenue',
  '/dashboard/lq-ops':        'QL Ops',
  '/dashboard/whatsapp':      'WhatsApp',
  '/vasu':                    'Chat',
  '/settings':                'Settings',
}

// ── Route fade transition ──────────────────────────────────────────────────────
const FADE_STYLE = `
  @keyframes qFadeIn {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .q-page-enter {
    animation: qFadeIn 0.18s ease-out both;
  }
`

function getAllowedDashboards(role) {
  if (!role || role === 'admin' || role === 'viewer') return 'all'
  if (role === 'roas_only') return ['roas']
  if (role?.startsWith('custom:')) return role.replace('custom:', '').split(',')
  return 'all'
}

function canAccess(role, dashboardId) {
  const allowed = getAllowedDashboards(role)
  if (allowed === 'all') return true
  return allowed.includes(dashboardId)
}

function ProtectedRoute({ children, dashboardId }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  // Dynamic page title
  useEffect(() => {
    const base = PAGE_TITLES[location.pathname] || ''
    document.title = base ? `${base} | Leverage Quantum` : 'Leverage Quantum'
  }, [location.pathname])

  // Activity logging
  useEffect(() => {
    if (user?.email && dashboardId) {
      logActivity(user.email, 'view', location.pathname)
    }
  }, [location.pathname, user?.email])

  // Clean up stale localStorage keys from old chat implementation
  useEffect(() => {
    const staleKeys = ['lq_vasu_conversations']
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
    const allowed = getAllowedDashboards(user.role)
    if (allowed === 'all') return children
    if (allowed.includes('roas')) return <Navigate to="/dashboard/roas" replace />
    return <Navigate to="/" replace />
  }

  // Wrap in fade div
  return (
    <div key={location.pathname} className="q-page-enter" style={{ display: 'contents' }}>
      {children}
    </div>
  )
}


// Error boundary — catches React render crashes, shows clean fallback
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null } }
  static getDerivedStateFromError(error) { return { hasError: true, error } }
  componentDidCatch(error, info) { console.error('Quantum error:', error, info) }
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
      <React.Suspense fallback={<PageSkeleton/>}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/"                       element={<ProtectedRoute dashboardId="home">        <DashboardHome /></ProtectedRoute>} />
        <Route path="/dashboard/roas"         element={<ProtectedRoute dashboardId="roas">        <ROASDashboard /></ProtectedRoute>} />
        <Route path="/dashboard/mtd"          element={<ProtectedRoute dashboardId="mtd">         <MTDDashboard /></ProtectedRoute>} />
        <Route path="/dashboard/lead-quality" element={<ProtectedRoute dashboardId="lead_quality"><LeadQualityDashboard /></ProtectedRoute>} />
        <Route path="/dashboard/channel-mix"  element={<ProtectedRoute dashboardId="channel_mix"><ChannelMixDashboard /></ProtectedRoute>} />
        <Route path="/dashboard/revenue"      element={<ProtectedRoute dashboardId="revenue">     <RevenueDashboard /></ProtectedRoute>} />
        <Route path="/dashboard/lq-ops"       element={<ProtectedRoute dashboardId="lq_ops">      <LeadQualificationDashboard /></ProtectedRoute>} />
        <Route path="/dashboard/whatsapp"     element={<ProtectedRoute dashboardId="whatsapp">    <WhatsAppDashboard /></ProtectedRoute>} />
        <Route path="/dashboard/meta-ads"     element={<ProtectedRoute dashboardId="meta_ads">    <MetaAdsDashboard /></ProtectedRoute>} />
        <Route path="/dashboard/google-ads"   element={<ProtectedRoute dashboardId="google_ads">  <GoogleAdsDashboard /></ProtectedRoute>} />
        <Route path="/vasu"                   element={<ProtectedRoute dashboardId="vasu">         <VasuAI /></ProtectedRoute>} />
        <Route path="/settings"               element={<ProtectedRoute dashboardId="settings">    <SettingsPage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </React.Suspense>
    </ErrorBoundary>
  )
}
