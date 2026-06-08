import { useState, useEffect, createContext, useContext } from 'react'

const AuthContext = createContext(null)
const ALLOWED_DOMAIN = 'leverageedu.com'

// ---- Admin user management (now via the secure server endpoints) ----
export async function getAccessList() {
  const r = await fetch('/api/users', { credentials: 'include' })
  if (!r.ok) return []
  const data = await r.json()
  return data.users || []
}

export async function addUserAccess(email, role = 'viewer') {
  const r = await fetch('/api/users', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, role }),
  })
  return r.ok
}

export async function removeUserAccess(email) {
  const r = await fetch(`/api/users?email=${encodeURIComponent(email)}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  return r.ok
}

export async function updateUserRole(email, newRole) {
  const r = await fetch('/api/users', {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, role: newRole }),
  })
  return r.ok
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // On load, ask the server who we are (reads the secure cookie).
  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : { user: null }))
      .then(d => setUser(d.user || null))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const loginWithGoogle = async (credentialResponse) => {
    try {
      const r = await fetch('/api/auth/google', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: credentialResponse.credential }),
      })
      const data = await r.json()
      if (!r.ok) return { success: false, error: data.error || 'Sign-in failed.' }
      setUser(data.user)
      return { success: true }
    } catch {
      return { success: false, error: 'Network error. Please try again.' }
    }
  }

  const logout = async () => {
    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }) } catch {}
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, loginWithGoogle, logout, ALLOWED_DOMAIN }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

export function isAdmin() {
  return false // role checks now come from the server session via useAuth().user.role
}

export function isViewer() {
  return true
}
