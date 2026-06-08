import jwt from 'jsonwebtoken'

const COOKIE_NAME = 'quantum_session'
export const ALLOWED_DOMAIN = 'leverageedu.com'
export const SESSION_TTL_SECONDS = 60 * 60 * 8

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
    return jwt.verify(match.slice(COOKIE_NAME.length + 1), process.env.SESSION_SECRET)
  } catch {
    return null
  }
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
