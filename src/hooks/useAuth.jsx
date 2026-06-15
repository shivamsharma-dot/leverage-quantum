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
    // Immediately cover the screen — no flicker while React unmounts
    const overlay = document.createElement('div')
    overlay.style.cssText = [
      'position:fixed','inset:0','z-index:99999',
      'background:#fff','display:flex',
      'align-items:center','justify-content:center',
      'flex-direction:column','gap:12px',
    ].join(';')
    overlay.innerHTML = \`
      <svg width="28" height="28" viewBox="0 0 22 22" fill="none">
        <rect x="1" y="12" width="4" height="9" rx="1.5" fill="#4CAE6F"/>
        <rect x="7" y="7" width="4" height="14" rx="1.5" fill="#29B9C3"/>
        <rect x="13" y="4" width="4" height="17" rx="1.5" fill="#1C9FD4"/>
      </svg>
      <span style="font-family:'Plus Jakarta Sans',sans-serif;font-size:13px;font-weight:600;color:#94A3B8;letter-spacing:-0.01em">Signing out…</span>
    \`
    document.body.appendChild(overlay)
    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }) } catch {}
    // Hard redirect — bypasses React's render cycle entirely, no flicker
    window.location.replace('/login')
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
