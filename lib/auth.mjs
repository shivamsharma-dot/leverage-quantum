import jwt from 'jsonwebtoken'

const COOKIE_NAME = 'quantum_session'
export const ALLOWED_DOMAIN = 'leverageedu.com'
export const SESSION_TTL_SECONDS = 60 * 60 * 8
// Emails here are always treated as admin (superadmin), regardless of stored role
export const SUPERADMINS = ['shivam.sharma@leverageedu.com']

export function signSession(payload) {
  return jwt.sign(payload, process.env.SESSION_SECRET, { expiresIn: SESSION_TTL_SECONDS })
}

export function sessionCookie(token) {
  return [
    `${COOKIE_NAME}=${token}`,
    'HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ].join('; ')
}

export function clearCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
}

export function getSessionUser(req) {
  const cookie = req.headers.cookie || ''
  const match = cookie.split('; ').find(c => c.startsWith(`${COOKIE_NAME}=`))
  if (!match) return null
  try {
    const decoded = jwt.verify(match.slice(COOKIE_NAME.length + 1), process.env.SESSION_SECRET)
    // Superadmins are always treated as admin regardless of stored role
    if (decoded && decoded.email && SUPERADMINS.includes(String(decoded.email).toLowerCase())) {
      decoded.role = 'admin'
    }
    return decoded
  } catch {
    return null
  }
}

// Mirrors src/App.jsx's canAccess() / src/components/Sidebar.jsx's canSee() —
// single source of truth for server-side per-page authorization. Nav hiding
// and the client route guard are cosmetic; this is what actually protects data.
export function canAccessDashboard(role, dashboardId) {
  const userRole = role || 'viewer'
  if (dashboardId === 'settings') return userRole === 'admin'
  if (userRole === 'admin') return true
  if (userRole === 'viewer') return dashboardId !== 'ask_ai'
  if (userRole.startsWith('viewer:')) {
    const granted = userRole.replace('viewer:', '').split(',').filter(Boolean)
    return granted.includes(dashboardId)
  }
  if (userRole === 'roas_only') return dashboardId === 'roas'
  if (userRole.startsWith('custom:')) {
    return userRole.replace('custom:', '').split(',').filter(Boolean).includes(dashboardId)
  }
  return dashboardId !== 'ask_ai'
}

export async function supabaseAdmin(path, options = {}) {
  return fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
}
