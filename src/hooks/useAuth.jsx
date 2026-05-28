import { useState, createContext, useContext } from 'react'
import { jwtDecode } from 'jwt-decode'

const AuthContext = createContext(null)

const SUPABASE_URL = 'https://tsyekthwthxszmsgqfej.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzeWVrdGh3dGh4c3ptc2dxZmVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NjkzMDIsImV4cCI6MjA5NTM0NTMwMn0.bdM9h5c3PDu9hgggjBdbA-eb7kfF-79c6txOnCUxRhY'
const ALLOWED_DOMAIN = 'leverageedu.com'

async function checkUserAccess(email) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/allowed_users?email=eq.${encodeURIComponent(email)}&select=email,role`,
    { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
  )
  if (!res.ok) return null
  const data = await res.json()
  return data.length > 0 ? data[0] : null
}

export async function getAccessList() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/allowed_users?select=email,role,added_by,created_at&order=created_at.asc`,
    { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
  )
  if (!res.ok) return []
  return await res.json()
}

export async function addUserAccess(email, role = 'viewer', addedBy = '') {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/allowed_users`,
    {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ email: email.toLowerCase().trim(), role, added_by: addedBy })
    }
  )
  return res.ok || res.status === 201
}

export async function removeUserAccess(email) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/allowed_users?email=eq.${encodeURIComponent(email)}`,
    {
      method: 'DELETE',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    }
  )
  return res.ok
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('lq_user')
      return saved ? JSON.parse(saved) : null
    } catch { return null }
  })

  const loginWithGoogle = async (credentialResponse) => {
    try {
      const decoded = jwtDecode(credentialResponse.credential)
      const email = (decoded.email || '').toLowerCase()

      if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
        throw new Error(`Access denied. Only @${ALLOWED_DOMAIN} accounts are allowed.`)
      }

      // Check Supabase whitelist
      const access = await checkUserAccess(email)
      if (!access) {
        throw new Error('Access denied. Your account does not have permission to access Leverage Quantum. Contact your admin.')
      }

      const userData = {
        name: decoded.name,
        email: decoded.email,
        picture: decoded.picture,
        role: access.role,
        token: credentialResponse.credential,
        loginTime: Date.now()
      }

      setUser(userData)
      localStorage.setItem('lq_user', JSON.stringify(userData))
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  const loginWithEmail = async (email, password) => {
    email = email.toLowerCase().trim()
    if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
      return { success: false, error: `Only @${ALLOWED_DOMAIN} emails are allowed.` }
    }
    if (!password || password.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters.' }
    }

    const access = await checkUserAccess(email)
    if (!access) {
      return { success: false, error: 'Access denied. Your account does not have permission to access Leverage Quantum.' }
    }

    const userData = {
      name: email.split('@')[0].replace('.', ' '),
      email,
      picture: null,
      role: access.role,
      token: btoa(email + ':' + Date.now()),
      loginTime: Date.now()
    }

    setUser(userData)
    localStorage.setItem('lq_user', JSON.stringify(userData))
    return { success: true }
  }

  const loginWithOTP = async (email) => {
    email = email.toLowerCase().trim()
    const access = await checkUserAccess(email)
    if (!access) return { success: false, error: 'Access denied. Contact your admin.' }
    const userData = {
      name: email.split('@')[0].split('.').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      email,
      picture: null,
      role: access.role,
      token: btoa(email + ':' + Date.now()),
      loginTime: Date.now()
    }
    setUser(userData)
    localStorage.setItem('lq_user', JSON.stringify(userData))
    return { success: true }
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('lq_user')
  }

  return (
    <AuthContext.Provider value={{ user, loginWithGoogle, loginWithEmail, loginWithOTP, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

export function isAdmin(email) {
  // Check role from stored user
  try {
    const saved = localStorage.getItem('lq_user')
    if (saved) {
      const u = JSON.parse(saved)
      return u.role === 'admin'
    }
  } catch {}
  return false
}
