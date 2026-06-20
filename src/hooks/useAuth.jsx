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
    // ---- Premium animated sign-out ----
    const kf = document.createElement('style');
    kf.id = 'lq-logout-kf';
    kf.textContent = `
  @keyframes lqVeil{0%{opacity:0}12%{opacity:1}88%{opacity:1}100%{opacity:0}}
  @keyframes lqMark{0%{opacity:0;transform:perspective(600px) rotateX(-90deg) translateY(14px)}18%{opacity:1}34%{transform:perspective(600px) rotateX(8deg) translateY(0)}46%{transform:perspective(600px) rotateX(0deg)}100%{opacity:1;transform:perspective(600px) rotateX(0deg)}}
  @keyframes lqBar{0%{transform:scaleY(0)}100%{transform:scaleY(1)}}
  @keyframes lqSheen{0%{transform:translateX(-140%)}100%{transform:translateX(140%)}}
  @keyframes lqText{0%{opacity:0;transform:translateY(6px)}100%{opacity:1;transform:translateY(0)}}
  @keyframes lqLine{0%{transform:scaleX(0)}100%{transform:scaleX(1)}}
  @keyframes lqOut{0%{opacity:1}100%{opacity:0}}
    `;
    document.head.appendChild(kf);

    const app = document.getElementById('root');
    if (app) { app.style.transformOrigin = '50% 45%'; app.style.animation = 'lqApp .5s cubic-bezier(.2,.7,.2,1) forwards'; }

    const overlay = document.createElement('div');
    overlay.id = 'lq-logout-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:18px;background:radial-gradient(130% 130% at 50% 45%,#FFFFFF 0%,#F6F9FD 60%,#EDF2FB 100%);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);animation:lqVeil .3s ease both;';

    overlay.innerHTML = `
      <div style="position:relative;width:84px;height:84px;border-radius:22px;background:#fff;box-shadow:0 18px 50px rgba(31,60,132,.18);display:flex;align-items:center;justify-content:center;overflow:hidden;transform-style:preserve-3d;animation:lqMark 1.0s cubic-bezier(.22,1.2,.36,1) both;">
        <div style="display:flex;align-items:flex-end;gap:6px;height:40px;">
          <span style="width:9px;height:20px;border-radius:3px;background:#1C9FD4;transform-origin:bottom;animation:lqBar .5s ease both .45s;"></span>
          <span style="width:9px;height:34px;border-radius:3px;background:#29B9C3;transform-origin:bottom;animation:lqBar .5s ease both .62s;"></span>
          <span style="width:9px;height:27px;border-radius:3px;background:#4CAE6F;transform-origin:bottom;animation:lqBar .5s ease both .79s;"></span>
        </div>
        <div style="position:absolute;top:0;left:0;width:40%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.7),transparent);animation:lqSheen 1s ease both 1.1s;"></div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:12px;animation:lqText .5s ease both 1.0s;">
        <div style="font:600 15px/1 'Plus Jakarta Sans',Inter,sans-serif;color:#5B6577;letter-spacing:.2px;">Signing out</div>
        <div style="width:120px;height:3px;border-radius:99px;background:linear-gradient(90deg,#1F3C84,#1C9FD4,#29B9C3,#4CAE6F);transform-origin:left;animation:lqLine .9s ease both 1.15s;"></div>
      </div>`;
    document.body.appendChild(overlay);

    // Fire the logout request but don't block the animation on it (a slow/hung
    // request must never freeze the overlay). Race it against a max wait.
    const logoutReq = fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    // Let the full sign-out choreography play out (~2.15s: logo flip, bars, sheen, text, line).
    await new Promise(r => setTimeout(r, 2150));
    // Ensure the server logout has at least been attempted before redirecting.
    await Promise.race([logoutReq, new Promise(r => setTimeout(r, 800))]);
    overlay.style.animation = 'lqOut .35s ease forwards';
    await new Promise(r => setTimeout(r, 320));
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
