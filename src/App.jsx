import React, { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { logActivity } from './components/ActivityLogger'
import LoginPage from './pages/LoginPage'
import DashboardHome from './pages/DashboardHome'
import ROASDashboard from './pages/ROASDashboard'
import LeadQualityDashboard from './pages/LeadQualityDashboard'
import ChannelMixDashboard from './pages/ChannelMixDashboard'
import RevenueDashboard from './pages/RevenueDashboard'
import LeadQualificationDashboard from './pages/LeadQualificationDashboard'
import WhatsAppDashboard from './pages/WhatsAppDashboard'
import MTDDashboard from './pages/MTDDashboard'
import MetaAdsDashboard from './pages/MetaAdsDashboard'
import GoogleAdsDashboard from './pages/GoogleAdsDashboard'
import VasuAI from './pages/VasuAI'
import SettingsPage from './pages/SettingsPage'

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

export default function App() {
  return (
    <>
      <style>{FADE_STYLE}</style>
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
    </>
  )
}
