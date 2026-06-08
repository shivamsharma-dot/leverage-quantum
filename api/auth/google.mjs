import { OAuth2Client } from 'google-auth-library'
import { ALLOWED_DOMAIN, signSession, sessionCookie, supabaseAdmin } from '../../lib/auth.mjs'

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

export default async function handler(req, res) {
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
