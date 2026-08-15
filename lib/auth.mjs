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

// The real implementation now lives in shared/access.mjs so this file, the route
// guard in src/App.jsx and the nav in src/components/Sidebar.jsx all run the SAME
// function instead of three hand-mirrored copies kept in step by a comment asking
// the next person to remember. Re-exported under the original name so every
// existing `import { canAccessDashboard } from '../lib/auth.mjs'` in api/ keeps
// working untouched.
//
// Nav hiding and the client route guard are cosmetic; server-side calls to this
// are what actually protect data.
export { canAccessDashboard, OVERALL_BIGQUERY_EMAILS } from '../shared/access.mjs'

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
