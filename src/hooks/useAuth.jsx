import { useState, useEffect, createContext, useContext } from 'react'
import { applyRemoteDesignStyle } from '../lib/designSettings'

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

// One retry on a network-level failure (fetch() itself throwing -- offline, DNS,
// a dropped connection, a cold-start hiccup -- never a completed HTTP response,
// which is handled by the caller's own r.ok check same as before). This is the
// exact same fix already applied to refreshUser() below, extended to the actual
// sign-in calls: a transient blip during login was showing "Network error. Please
// try again." with no recovery, on a request that has no side effect to worry
// about re-sending (the server never saw the first attempt if it never arrived).
async function fetchRetry(url, opts, attempts = 2, delay = 400) {
  let lastErr
  for (let i = 0; i < attempts; i++) {
    try { return await fetch(url, opts) }
    catch (e) { lastErr = e; if (i < attempts - 1) await new Promise(res => setTimeout(res, delay)) }
  }
  throw lastErr
}

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

  // Re-asks the server "who am I / what can I see" and updates `user` in place.
  // This is the ONLY thing that keeps a signed-in tab's permissions current --
  // /api/auth?action=me itself already re-checks allowed_users on every call and
  // reissues the cookie if the role moved (see api/auth.mjs), but that's useless
  // if nothing ever calls it again after the initial mount. Before this existed,
  // an admin granting/revoking a page had no effect on anyone already signed in
  // until they happened to hard-refresh or their 8h session expired -- clicking
  // around the SPA (React Router navigation) never re-hits the server at all.
  // Deliberately does NOT touch `loading`/`prefsReady` -- those only gate the
  // very first paint; toggling them again here would blank the whole page on
  // every subsequent call (e.g. on every route change), not just refresh data.
  const refreshUser = () => {
    // A real "you're not signed in" is a completed 401 response (r.ok===false,
    // handled below by treating it as {user:null} -- that's a genuine logout and
    // is correct to apply). A *network-level* failure (fetch() itself throwing --
    // offline, DNS, timeout, a dropped connection, CORS) tells us nothing about
    // whether the session is actually still valid, so it must NOT be treated the
    // same way. This matters a lot more since refreshUser() started firing on
    // every route change and every tab refocus (see ProtectedRoute in App.jsx) --
    // before that it only ran once on mount, so a transient blip here was rare to
    // hit. Now any brief connectivity hiccup, anywhere in a session, was forcing a
    // real logout + bounce to /login even though the person never actually signed
    // out -- reported live as frequent, unexplained "Network error" logouts.
    const attempt = () => fetch('/api/auth?action=me', { credentials: 'include' })
    return attempt()
      .catch(() => attempt()) // one retry -- most blips clear within a few hundred ms
      .then(r => (r.ok ? r.json() : { user: null }))
      .then(d => { const u = d.user || null; setUser(u); return u })
      .catch(() => {
        // Both attempts failed at the network level. Leave `user` exactly as it
        // was rather than forcing it to null -- a real session expiry will still
        // be caught by the next successful check (next nav, next tab focus, or a
        // 401 surfacing from any other API call), so nothing is silently missed;
        // we're only refusing to log someone out over a connectivity blip we
        // can't actually attribute to their session being invalid.
        return null
      })
  }

  // On load, ask the server who we are (reads the secure cookie).
  useEffect(() => {
    refreshUser().finally(() => setLoading(false))
  }, [])

  // Belt-and-suspenders for a tab left open and backgrounded for a while (the
  // route-change trigger in App.jsx's ProtectedRoute covers the common case --
  // this catches "granted access, then just switched back to an already-open
  // tab without navigating anywhere new").
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refreshUser() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  // Hidden-pages preference, fetched here (not in Sidebar) so it runs in true parallel
  // with the /api/auth?action=me check above -- both fire from this same root-level mount.
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
  // -- but /api/auth?action=me routinely resolves faster than /api/preferences in practice, so
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
        // Org-wide design pickers (Settings > Appearance) -- same GET, no extra
        // request. Applies the admin's saved button/KPI style to every
        // signed-in user's browser instead of only the admin who set it.
        applyRemoteDesignStyle('button', data.prefs?.lq_button_style)
        applyRemoteDesignStyle('kpi', data.prefs?.lq_kpi_style)
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
      const r = await fetchRetry('/api/auth?action=google', {
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

  // Ask for a one-time sign-in link by email. The response is deliberately
  // the same generic "check your inbox" message whether or not the email is
  // actually on the access list -- the server never reveals which (see
  // api/auth.mjs's MAGIC_GENERIC_RESPONSE), so there is nothing more specific
  // to branch on here either.
  const requestMagicLink = async (email) => {
    try {
      const r = await fetchRetry('/api/auth?action=magic-request', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await r.json().catch(() => ({}))
      return { success: r.ok, message: data.message || 'If that email has access, a sign-in link is on its way.' }
    } catch {
      return { success: false, message: 'Network error. Please try again.' }
    }
  }

  // Consume a one-time link (the token from ?token= in the URL).
  const verifyMagicLink = async (token) => {
    try {
      const r = await fetchRetry('/api/auth?action=magic-verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await r.json()
      if (!r.ok) return { success: false, error: data.error || 'Sign-in failed.' }
      setUser(data.user)
      fetchHiddenPages()
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
    const callLogout = () => fetch('/api/auth?action=logout', { method: 'POST', credentials: 'include' })
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
    //
    // Exception: purely cosmetic device preferences (theme, sidebar layout, and the
    // Button/KPI-card/Login-page design-system picks) are not sensitive and are meant
    // to survive logout -- otherwise every sign-out silently resets the whole app's
    // look back to defaults, which reads as "my Appearance choice isn't working."
    const KEEP_ACROSS_LOGOUT = [
      'lq_theme', 'lq_kpi_icons', 'lq_sidebar_mode', 'lq_sidebar_collapsed',
      'lq_number_format', 'lq_default_date', 'lq_table_density',
      'lq_button_style', 'lq_kpi_style', 'lq_login_style',
    ]
    try {
      const preserved = {}
      KEEP_ACROSS_LOGOUT.forEach(k => { const v = localStorage.getItem(k); if (v != null) preserved[k] = v })
      localStorage.clear()
      sessionStorage.clear()
      Object.entries(preserved).forEach(([k, v]) => localStorage.setItem(k, v))
      // Broadcast to any other open tabs of this app so they redirect too, instead of
      // continuing to run with stale cached state until they happen to hit a 401.
      localStorage.setItem('lq_logout_signal', String(Date.now()))
    } catch {}

    overlay.style.animation = 'lqOut .25s ease forwards';
    await new Promise(r => setTimeout(r, 230));
    window.location.replace('/login')
  }

  return (
    <AuthContext.Provider value={{ user, loading, hiddenPages, prefsReady, loginWithGoogle, requestMagicLink, verifyMagicLink, logout, refreshUser, ALLOWED_DOMAIN }}>
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
