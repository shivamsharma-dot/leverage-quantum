import crypto from 'node:crypto'
import { OAuth2Client } from 'google-auth-library'
import { ALLOWED_DOMAIN, signSession, sessionCookie, clearCookie, getSessionUser, supabaseAdmin, SUPERADMINS } from '../lib/auth.mjs'

// Consolidates the former api/auth/google.mjs, api/auth/logout.mjs, api/auth/me.mjs
// into one function (routed by ?action=) -- Vercel Hobby caps at 12 serverless
// functions and this repo was already at the cap; freeing this slot makes room for
// new endpoints (e.g. GitHub issue reporting) without dropping something else.
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

const MAGIC_TOKEN_TTL_MS = 15 * 60 * 1000
const MAGIC_REQUEST_THROTTLE_MS = 60 * 1000
// Same generic response regardless of whether the email is actually in
// allowed_users -- never let this endpoint be used to fish out who has
// access. The real work (or lack of it) happens silently behind it.
const MAGIC_GENERIC_RESPONSE = { success: true, message: 'If that email has access, a sign-in link is on its way. Check your inbox.' }

function nameFromEmail(email) {
  const local = String(email).split('@')[0]
  return local.split(/[._-]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ') || local
}

// ── Brand constants + the established report/answer email skeleton (top
// accent stripe / logo lockup / white card / footer bar) -- byte-identical
// values to api/send-report.mjs's buildChatAnswerEmail, not reinvented. Email
// clients can't reliably render inline <svg>, hence table-cell divs instead
// of shared/brandLogo.mjs's brandLogoSvgMarkup(); the bar heights/colors/order
// (green 9px / blue 14px / navy 17px) MUST stay byte-identical to that file --
// see its header comment for the full list of consumers this joins. ──
const NAVY = '#1F3C84'
const BLUE = '#1C9FD4'
const CYAN = '#29B9C3'
const GREEN = '#4CAE6F'
const EMAIL_FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"

function magicLinkEmailHtml(link, email) {
  const todayLabel = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><meta name="color-scheme" content="light">
<title>Sign in to Quantum</title></head>
<body style="margin:0;padding:0;background-color:#F4F6F9;font-family:${EMAIL_FONT};color:#0F172A;-webkit-font-smoothing:antialiased">
<div style="margin:0;padding:32px 12px;background-color:#F4F6F9">
<div style="max-width:600px;margin:0 auto">

  <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:20px 20px 0 0;overflow:hidden">
    <tr>
      <td width="25%" style="background-color:${NAVY};font-size:0;line-height:0;height:5px">&nbsp;</td>
      <td width="25%" style="background-color:${BLUE};font-size:0;line-height:0;height:5px">&nbsp;</td>
      <td width="25%" style="background-color:${CYAN};font-size:0;line-height:0;height:5px">&nbsp;</td>
      <td width="25%" style="background-color:${GREEN};font-size:0;line-height:0;height:5px">&nbsp;</td>
    </tr>
  </table>

  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;box-shadow:0 24px 60px -24px rgba(15,23,42,0.18);border-left:1px solid #EEF1F6;border-right:1px solid #EEF1F6">
    <tr><td style="padding:32px 36px 24px">

      <table cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:middle;padding-right:12px">
          <table cellpadding="0" cellspacing="0" style="background-color:#ffffff;border:1px solid #EEF1F6;border-radius:10px;box-shadow:0 3px 10px rgba(15,23,42,0.10)">
            <tr><td style="padding:9px 11px">
              <table cellpadding="0" cellspacing="0"><tr>
                <td valign="bottom" style="padding-right:2px"><div style="width:4px;height:9px;background-color:${GREEN};border-radius:1.5px;font-size:0;line-height:0">&nbsp;</div></td>
                <td valign="bottom" style="padding-right:2px"><div style="width:4px;height:14px;background-color:${BLUE};border-radius:1.5px;font-size:0;line-height:0">&nbsp;</div></td>
                <td valign="bottom"><div style="width:4px;height:17px;background-color:${NAVY};border-radius:1.5px;font-size:0;line-height:0">&nbsp;</div></td>
              </tr></table>
            </td></tr>
          </table>
        </td>
        <td style="vertical-align:middle">
          <div style="font-size:16px;font-weight:800;color:${NAVY};letter-spacing:.02em;line-height:1.2">Leverage Quantum</div>
        </td>
      </tr></table>

      <div style="margin-top:22px">
        <span style="display:inline-block;padding:4px 11px;border-radius:20px;background-color:#EAF2FC;font-size:10px;font-weight:700;color:${NAVY};letter-spacing:.08em;text-transform:uppercase">Account Sign-in</span>
      </div>
      <div style="font-size:22px;font-weight:800;color:#0F172A;letter-spacing:-.01em;line-height:1.35;margin:12px 0 6px">Sign in to Quantum</div>
      <div style="font-size:12.5px;color:#94A3B8">Requested for <span style="color:#64748B;font-weight:600">${email}</span> &middot; expires in 15 minutes, one-time use</div>

    </td></tr>

    <tr><td style="padding:0 36px">
      <div style="height:1px;background-color:#EEF1F6"></div>
    </td></tr>

    <tr><td style="padding:28px 36px 32px;text-align:center">
      <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#64748B">Click the button below to sign in to your dashboards.</p>
      <table cellpadding="0" cellspacing="0" style="margin:0 auto"><tr><td style="border-radius:10px;background-color:${NAVY};box-shadow:0 3px 10px rgba(31,60,132,0.28)">
        <a href="${link}" style="display:inline-block;padding:13px 32px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none">Sign in to Quantum</a>
      </td></tr></table>
      <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#94A3B8">Didn't request this? You can safely ignore this email &mdash; nobody can sign in without clicking this exact link.</p>
    </td></tr>
  </table>

  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F8FAFC;border-radius:0 0 20px 20px;border:1px solid #EEF1F6;border-top:none">
    <tr><td style="padding:16px 36px;text-align:center">
      <span style="font-size:10.5px;color:#94A3B8">Leverage Quantum &middot; ${todayLabel} &middot; Do not reply</span>
    </td></tr>
  </table>

</div>
</div>
</body>
</html>`
}

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

  // Request a one-time sign-in link by email. Gated purely by allowed_users --
  // the same table Google login checks -- so "invited" and "already on the
  // access list" are the same thing. Unlike Google login there's no domain/
  // identity check to lean on here, so the response is deliberately identical
  // whether or not the email is real/known, to avoid leaking who has access.
  if (action === 'magic-request') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return res.status(405).json({ error: 'Method not allowed' })
    }
    const email = String(req.body?.email || '').trim().toLowerCase()
    if (!email || !email.includes('@')) return res.status(200).json(MAGIC_GENERIC_RESPONSE)

    try {
      const r = await supabaseAdmin(`allowed_users?email=eq.${encodeURIComponent(email)}&select=email`)
      const rows = await r.json()
      const known = Array.isArray(rows) && rows.length > 0
      if (!known) return res.status(200).json(MAGIC_GENERIC_RESPONSE)

      // Throttle: refuse a second link within 60s so one inbox can't be spammed.
      const recentR = await supabaseAdmin(
        `magic_login_tokens?email=eq.${encodeURIComponent(email)}&order=created_at.desc&limit=1&select=created_at`,
      )
      const recentRows = await recentR.json()
      if (Array.isArray(recentRows) && recentRows.length) {
        const lastMs = new Date(recentRows[0].created_at).getTime()
        if (Date.now() - lastMs < MAGIC_REQUEST_THROTTLE_MS) return res.status(200).json(MAGIC_GENERIC_RESPONSE)
      }

      const rawToken = crypto.randomBytes(32).toString('hex')
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
      const expiresAt = new Date(Date.now() + MAGIC_TOKEN_TTL_MS).toISOString()
      await supabaseAdmin('magic_login_tokens', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ email, token_hash: tokenHash, expires_at: expiresAt }),
      })

      const RESEND_KEY = process.env.RESEND_API_KEY
      if (RESEND_KEY) {
        const link = `https://quantum.leverageedu.com/login?token=${rawToken}`
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
          body: JSON.stringify({
            from: process.env.REPORT_FROM_EMAIL || 'Leverage Quantum <quantum@platform.leverageedu.com>',
            to: [email],
            subject: 'Sign in to Quantum',
            html: magicLinkEmailHtml(link, email),
          }),
        }).catch(() => {}) // a Resend hiccup still shouldn't reveal anything to the caller
      }
      return res.status(200).json(MAGIC_GENERIC_RESPONSE)
    } catch {
      return res.status(200).json(MAGIC_GENERIC_RESPONSE)
    }
  }

  // Consume a one-time link. One-time by design: marked used the moment it's
  // read, before any further checks, so even a link forwarded/intercepted
  // after first use can't be replayed.
  if (action === 'magic-verify') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return res.status(405).json({ error: 'Method not allowed' })
    }
    const token = String(req.body?.token || '')
    if (!token) return res.status(400).json({ error: 'Missing sign-in link.' })
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

    try {
      const r = await supabaseAdmin(
        `magic_login_tokens?token_hash=eq.${tokenHash}&select=id,email,expires_at,used_at&limit=1`,
      )
      const rows = await r.json()
      const row = Array.isArray(rows) && rows.length ? rows[0] : null
      if (!row) return res.status(401).json({ error: 'This sign-in link is invalid.' })
      if (row.used_at) return res.status(401).json({ error: 'This sign-in link has already been used. Request a new one.' })
      if (new Date(row.expires_at).getTime() < Date.now()) {
        return res.status(401).json({ error: 'This sign-in link has expired. Request a new one.' })
      }

      // Mark used immediately, before re-checking access -- a link that's
      // spent stays spent even if the access check below fails.
      await supabaseAdmin(`magic_login_tokens?id=eq.${row.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ used_at: new Date().toISOString() }),
      })

      const accessR = await supabaseAdmin(`allowed_users?email=eq.${encodeURIComponent(row.email)}&select=email,role`)
      const accessRows = await accessR.json()
      const access = Array.isArray(accessRows) && accessRows.length ? accessRows[0] : null
      if (!access) return res.status(403).json({ error: 'Your account is not in the access list. Contact your admin.' })

      const sessionUser = { email: row.email, name: nameFromEmail(row.email), picture: null, role: access.role }
      res.setHeader('Set-Cookie', sessionCookie(signSession(sessionUser)))
      return res.status(200).json({ success: true, user: sessionUser })
    } catch {
      return res.status(500).json({ error: 'Something went wrong verifying your link. Please try again.' })
    }
  }

  return res.status(400).json({ error: 'Unknown action' })
}
