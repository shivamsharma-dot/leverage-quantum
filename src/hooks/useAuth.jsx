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

const LOGOUT_SIGNAL_KEY = 'lq_logout_signal'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [hiddenPages, setHiddenPages] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lq_hidden_pages') || '[]') } catch { return [] }
  })
  const [prefsReady, setPrefsReady] = useState(false)

  // Cross-tab logout sync: logging out in one tab clears localStorage, which fires a
  // 'storage' event in every OTHER open tab of this origin (never in the tab that did it).
  // Any tab still showing the app should immediately follow, not keep running with stale
  // cached state until it happens to hit a 401 on some later request.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === LOGOUT_SIGNAL_KEY && e.newValue) {
        window.location.replace('/login')
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // On load, ask the server who we are (reads the secure cookie).
  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : { user: null }))
      .then(d => setUser(d.user || null))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  // Hidden-pages preference, fetched here (not in Sidebar) so it runs in true parallel
  // with the /api/auth/me check above -- both fire from this same root-level mount.
  // Sidebar only mounts AFTER ProtectedRoute's `loading` gate clears (it lives inside
  // each lazy-loaded page), so a fetch started from Sidebar's own mount effect was
  // serialized behind the auth check instead of overlapping it, roughly doubling the
  // wait before the sidebar could show anything.
  //
  // /api/preferences requires a valid session same as every other API here, so firing
  // it on mount -- i.e. before the user has necessarily logged in -- 401s whenever this
  // is a fresh sign-in (not a reload of an already-authenticated session). That 401 was
  // being silently swallowed and prefsReady marked true anyway with hiddenPages stuck at
  // an empty default -- a stale, unauthenticated non-answer that then never got refetched
  // after loginWithGoogle's client-side setUser (no page reload happens on login, so the
  // mount-only effect never re-ran). Every hidden page would show up right after login,
  // permanently for that session.
  //
  // Fix is tied to the login *event* itself (fetchHiddenPages called again at the end of
  // loginWithGoogle below), not to reactively watching `user` state: an earlier attempt
  // keyed off a `[user]`-dependent effect, gated by a "did we ever get a real answer" ref
  // -- but /api/auth/me routinely resolves faster than /api/preferences in practice, so
  // `user` would flip to non-null WHILE the first preferences fetch was still in flight
  // (before the ref got set), and the effect fired a second, genuinely redundant request
  // on every plain reload, not just on fresh logins.
  const fetchHiddenPages = () => {
    setPrefsReady(false)
    fetch('/api/preferences', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return // unauthenticated attempt -- leave hiddenPages/localStorage untouched
        const hp = data.prefs?.hidden_pages || []
        setHiddenPages(hp)
        localStorage.setItem('lq_hidden_pages', JSON.stringify(hp))
      })
      .catch(() => {}) // fail silently — localStorage fallback stays
      .finally(() => setPrefsReady(true))
  }
  useEffect(() => { fetchHiddenPages() }, [])

  // Real-time sync within session (from Settings page Save button) and across tabs.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'lq_hidden_pages') {
        try { setHiddenPages(JSON.parse(e.newValue || '[]')) } catch { setHiddenPages([]) }
      }
    }
    const onCustom = (e) => setHiddenPages(e.detail || [])
    window.addEventListener('storage', onStorage)
    window.addEventListener('lq:hidden-pages-changed', onCustom)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('lq:hidden-pages-changed', onCustom)
    }
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
      fetchHiddenPages() // the mount-time attempt 401'd (not signed in yet) -- now we actually are
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
  @keyframes lqVeil{from{opacity:0}to{opacity:1}}
  @keyframes lqMark{0%{opacity:0;transform:perspective(600px) rotateX(-90deg) translateY(14px)}18%{opacity:1}34%{transform:perspective(600px) rotateX(8deg) translateY(0)}46%{transform:perspective(600px) rotateX(0deg)}100%{opacity:1;transform:perspective(600px) rotateX(0deg)}}
  @keyframes lqBar{0%{transform:scaleY(0)}100%{transform:scaleY(1)}}
  @keyframes lqSheen{0%{transform:translateX(-140%)}100%{transform:translateX(140%)}}
  @keyframes lqText{0%{opacity:0;transform:translateY(6px)}100%{opacity:1;transform:translateY(0)}}
  @keyframes lqLine{0%{transform:scaleX(0)}100%{transform:scaleX(1)}}
  @keyframes lqOut{0%{opacity:1}100%{opacity:0}}
  @keyframes lqApp{to{opacity:.5;transform:scale(.98)}}
    `;
    document.head.appendChild(kf);

    const app = document.getElementById('root');
    if (app) { app.style.transformOrigin = '50% 45%'; app.style.animation = 'lqApp .4s cubic-bezier(.2,.7,.2,1) forwards'; }

    const overlay = document.createElement('div');
    overlay.id = 'lq-logout-overlay';
    // NOTE: lqVeil is a plain fade-IN only -- the fade-OUT is applied explicitly near the
    // end (lqOut, below) right before redirect. An earlier version baked a fade-out into
    // lqVeil's own keyframe (0%/12%/88%/100%) but gave it only a .3s duration, so the
    // overlay flashed in and immediately back out within the first ~300ms, exposing the
    // raw dashboard underneath for the rest of the sequence -- the "flick" bug.
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:18px;background:radial-gradient(130% 130% at 50% 45%,#FFFFFF 0%,#F6F9FD 60%,#EDF2FB 100%);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);animation:lqVeil .25s ease both;';

    overlay.innerHTML = `
      <div style="position:relative;width:84px;height:84px;border-radius:22px;background:#fff;box-shadow:0 18px 50px rgba(31,60,132,.18);display:flex;align-items:center;justify-content:center;overflow:hidden;transform-style:preserve-3d;animation:lqMark .6s cubic-bezier(.22,1.2,.36,1) both;">
        <div style="display:flex;align-items:flex-end;gap:6px;height:40px;">
          <span style="width:9px;height:20px;border-radius:3px;background:#1C9FD4;transform-origin:bottom;animation:lqBar .3s ease both .25s;"></span>
          <span style="width:9px;height:34px;border-radius:3px;background:#29B9C3;transform-origin:bottom;animation:lqBar .3s ease both .35s;"></span>
          <span style="width:9px;height:27px;border-radius:3px;background:#4CAE6F;transform-origin:bottom;animation:lqBar .3s ease both .45s;"></span>
        </div>
        <div style="position:absolute;top:0;left:0;width:40%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.7),transparent);animation:lqSheen .6s ease both .6s;"></div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:12px;animation:lqText .3s ease both .55s;">
        <div style="font:600 15px/1 'Plus Jakarta Sans',Inter,sans-serif;color:#5B6577;letter-spacing:.2px;">Signing out</div>
        <div style="width:120px;height:3px;border-radius:99px;background:linear-gradient(90deg,#1F3C84,#1C9FD4,#29B9C3,#4CAE6F);transform-origin:left;animation:lqLine .5s ease both .65s;"></div>
      </div>`;
    document.body.appendChild(overlay);

    // Fire the logout request but don't block the animation on it (a slow/hung
    // request must never freeze the overlay). Race it against a max wait. One retry
    // on failure -- a transient network blip during this window would otherwise leave
    // the session cookie uncleared server-side while the UI still shows "signed out".
    const callLogout = () => fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    const logoutReq = callLogout().catch(() => callLogout()).catch(() => {})
    // Let the sign-out choreography play out (~1.15s: logo flip, bars, sheen, text, line --
    // roughly half the original timing, tightened so logout feels quick, not just polished).
    await new Promise(r => setTimeout(r, 1150));
    // Ensure the server logout has at least been attempted before redirecting.
    await Promise.race([logoutReq, new Promise(r => setTimeout(r, 450))]);

    // Wipe all client-side state. This app caches real, sensitive data in localStorage
    // (the Meta Ads access token, cached ad spend/lead data, full Ask AI conversation
    // history) that a server-side cookie clear does nothing about -- on a shared
    // machine "signed out" must actually mean gone, not just redirected.
    try {
      localStorage.clear()
      sessionStorage.clear()
      // Broadcast to any other open tabs of this app so they redirect too, instead of
      // continuing to run with stale cached state until they happen to hit a 401.
      localStorage.setItem('lq_logout_signal', String(Date.now()))
    } catch {}

    overlay.style.animation = 'lqOut .25s ease forwards';
    await new Promise(r => setTimeout(r, 230));
    window.location.replace('/login')
  }

  return (
    <AuthContext.Provider value={{ user, loading, hiddenPages, prefsReady, loginWithGoogle, logout, ALLOWED_DOMAIN }}>
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
