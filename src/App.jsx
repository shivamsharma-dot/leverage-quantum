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
import MTDDashboard from './pages/MTDDashboard'
import MetaAdsDashboard from './pages/MetaAdsDashboard'
import SettingsPage from './pages/SettingsPage'

// Parse which dashboards a user can access based on their role
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
  const { user } = useAuth()
  const location = useLocation()

  useEffect(() => {
    if (user?.email && dashboardId) {
      logActivity(user.email, 'view', location.pathname)
    }
  }, [location.pathname, user?.email])

  if (!user) return <Navigate to="/login" replace />
  if (dashboardId && !canAccess(user.role, dashboardId)) {
    const allowed = getAllowedDashboards(user.role)
    if (allowed === 'all') return children
    if (allowed.includes('roas')) return <Navigate to="/dashboard/roas" replace />
    return <Navigate to="/" replace />
  }
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/"                       element={<ProtectedRoute dashboardId="home">        <DashboardHome /></ProtectedRoute>} />
      <Route path="/dashboard/roas"         element={<ProtectedRoute dashboardId="roas">        <ROASDashboard /></ProtectedRoute>} />
      <Route path="/dashboard/mtd"          element={<ProtectedRoute dashboardId="mtd">         <MTDDashboard /></ProtectedRoute>} />
      <Route path="/dashboard/lead-quality" element={<ProtectedRoute dashboardId="lead_quality"><LeadQualityDashboard /></ProtectedRoute>} />
      <Route path="/dashboard/channel-mix"  element={<ProtectedRoute dashboardId="channel_mix"><ChannelMixDashboard /></ProtectedRoute>} />
      <Route path="/dashboard/revenue"      element={<ProtectedRoute dashboardId="revenue">     <RevenueDashboard /></ProtectedRoute>} />
      <Route path="/dashboard/meta-ads"     element={<ProtectedRoute dashboardId="meta_ads">    <MetaAdsDashboard /></ProtectedRoute>} />
      <Route path="/settings"               element={<ProtectedRoute dashboardId="settings">    <SettingsPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
