import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import LoginPage from './pages/LoginPage'
import DashboardHome from './pages/DashboardHome'
import ROASDashboard from './pages/ROASDashboard'
import LeadQualityDashboard from './pages/LeadQualityDashboard'
import ChannelMixDashboard from './pages/ChannelMixDashboard'
import RevenueDashboard from './pages/RevenueDashboard'
import SettingsPage from './pages/SettingsPage'

function ProtectedRoute({ children }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ProtectedRoute><DashboardHome /></ProtectedRoute>} />
      <Route path="/dashboard/roas" element={<ProtectedRoute><ROASDashboard /></ProtectedRoute>} />
      <Route path="/dashboard/lead-quality" element={<ProtectedRoute><LeadQualityDashboard /></ProtectedRoute>} />
      <Route path="/dashboard/channel-mix"   element={<ProtectedRoute><ChannelMixDashboard /></ProtectedRoute>} />
      <Route path="/dashboard/revenue"       element={<ProtectedRoute><RevenueDashboard /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
