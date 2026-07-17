import { OAuth2Client } from 'google-auth-library'
import { ALLOWED_DOMAIN, signSession, sessionCookie, clearCookie, getSessionUser, supabaseAdmin, SUPERADMINS } from '../lib/auth.mjs'

// Consolidates the former api/auth/google.mjs, api/auth/logout.mjs, api/auth/me.mjs
// into one function (routed by ?action=) -- Vercel Hobby caps at 12 serverless
// functions and this repo was already at the cap; freeing this slot makes room for
// new endpoints (e.g. GitHub issue reporting) without dropping something else.
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

export default async function handler(req, res) {
  const action = req.query.action

  if (action === 'me') {
    const user = getSessionUser(req)
    if (!user) return res.status(401).json({ user: null })
    // The session cookie's `role` is a snapshot from login time (or the last
    // /me call), so a Settings > User Access change made mid-session would
    // otherwise never take effect until the cookie expires (up to 8h) or the
    // user logs out and back in. Re-check allowed_users on every call instead
    // -- cheap single-row lookup -- and reissue the cookie if the role moved,
    // so a freshly granted page shows up on the user's very next load/refresh.
    let freshRole = user.role
    try {
      const r = await supabaseAdmin(
        `allowed_users?email=eq.${encodeURIComponent(user.email)}&select=role`,
      )
      const rows = await r.json()
      if (Array.isArray(rows) && rows.length && rows[0].role) freshRole = rows[0].role
    } catch {
      // DB unreachable -- fall back to the cookie's existing role rather than
      // breaking an already-logged-in user's session.
    }
    // Superadmins always stay admin regardless of the stored row, same override
    // getSessionUser() applies when first decoding the cookie.
    if (SUPERADMINS.includes(String(user.email).toLowerCase())) freshRole = 'admin'
    if (freshRole !== user.role) {
      const refreshed = { email: user.email, name: user.name, picture: user.picture, role: freshRole }
      res.setHeader('Set-Cookie', sessionCookie(signSession(refreshed)))
    }
    return res.status(200).json({
      user: { email: user.email, name: user.name, picture: user.picture, role: freshRole },
    })
  }

  if (action === 'logout') {
    res.setHeader('Set-Cookie', clearCookie())
    return res.status(200).json({ success: true })
  }

  if (action === 'google') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return res.status(405).json({ error: 'Method not allowed' })
    }
    const { credential } = req.body || {}
    if (!credential || typeof credential !== 'string') {
      return res.status(400).json({ error: 'Missing Google credential' })
    }
    let payload
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      })
      payload = ticket.getPayload()
    } catch {
      return res.status(401).json({ error: 'Invalid or expired Google token' })
    }
    const email = (payload.email || '').toLowerCase()
    const domainOk =
      payload.email_verified === true &&
      payload.hd === ALLOWED_DOMAIN &&
      email.endsWith(`@${ALLOWED_DOMAIN}`)
    if (!domainOk) {
      return res.status(403).json({ error: 'Access is restricted to leverageedu.com accounts.' })
    }
    let access
    try {
      const r = await supabaseAdmin(
        `allowed_users?email=eq.${encodeURIComponent(email)}&select=email,role`,
      )
      const rows = await r.json()
      access = Array.isArray(rows) && rows.length ? rows[0] : null
    } catch {
      return res.status(500).json({ error: 'Could not verify access. Please try again.' })
    }
    if (!access) {
      return res.status(403).json({ error: 'Your account is not in the access list. Contact your admin.' })
    }
    const sessionUser = { email, name: payload.name, picture: payload.picture, role: access.role }
    res.setHeader('Set-Cookie', sessionCookie(signSession(sessionUser)))
    return res.status(200).json({ success: true, user: sessionUser })
  }

  return res.status(400).json({ error: 'Unknown action' })
}
