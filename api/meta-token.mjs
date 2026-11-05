import { getSessionUser, canAccessDashboard, supabaseAdmin } from '../lib/auth.mjs'

// Server-side proxy for the shared Meta Ads access token (meta_tokens table).
// Replaces direct client-side Supabase reads/writes to this table - the anon
// key is exposed in every browser bundle, so any client-side path to a
// credential table is a bypass regardless of app-level UI restrictions.
//
// GET  - restricted to whichever pages actually consume this token client-side
//        (Home summary, Ask AI, Meta Ads) so a viewer granted none of those
//        can't pull the live token straight from this endpoint and query
//        Facebook's Graph API directly, bypassing every other restriction.
// POST - requires meta_ads page access (same gate as the Connect UI itself)

// Same app id already public in the client bundle (MetaAdsDashboard.jsx's
// FB.init call) -- not a secret, safe to duplicate here.
const META_APP_ID = '2314692909338886'

// Both connect paths in MetaAdsDashboard.jsx (the "Continue with Meta" FB.login
// popup and "Paste access token manually") hand this endpoint a short-lived
// Meta user token that expires in ~1-2 hours. Exchanging it here for the
// long-lived version (~60 days) is the one step that was missing -- without
// it, every token given to the app died again within about an hour no matter
// how many times it was re-entered. Falls back to storing the raw token
// untouched if META_APP_SECRET isn't set or Meta's exchange call fails for any
// reason, so a missing/bad secret degrades to today's behaviour, never breaks
// the connect flow outright.
async function exchangeForLongLivedToken(shortLivedToken) {
  const secret = process.env.META_APP_SECRET
  if (!secret) return { token: shortLivedToken, exchanged: false, reason: 'META_APP_SECRET is not set' }
  try {
    const qs = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: META_APP_ID,
      client_secret: secret,
      fb_exchange_token: shortLivedToken,
    })
    const r = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?${qs}`)
    const d = await r.json()
    if (d && d.access_token) return { token: d.access_token, exchanged: true, expiresIn: d.expires_in }
    return { token: shortLivedToken, exchanged: false, reason: (d && d.error && d.error.message) || 'Meta did not return a long-lived token' }
  } catch (e) {
    return { token: shortLivedToken, exchanged: false, reason: e.message }
  }
}


const ALERT_TO = 'shivam.sharma@leverageedu.com'
const RENEW_AFTER_DAYS = 30   // renew once the stored token is this old (it lives ~60 days)

function tokenAgeDays(createdAt) {
  return (Date.now() - new Date(createdAt).getTime()) / 86400000
}

// Meta lets a still-valid long-lived user token be exchanged again for a fresh
// 60-day one. This is what keeps the shared token alive without anyone
// clicking "Continue with Meta" every two months. It only works while the
// token is still valid, so it must run well before day 60 -- which is why
// both the daily check below and any page load past day 30 call it.
async function renewStoredToken(row) {
  const ex = await exchangeForLongLivedToken(row.token)
  if (!ex.exchanged) return { renewed: false, reason: ex.reason }
  // Only count it as renewed if Meta really handed back a long life (~60 days).
  if (ex.expiresIn && ex.expiresIn < 50 * 86400) return { renewed: false, reason: 'Meta returned a token that expires in only ' + Math.round(ex.expiresIn / 86400) + ' days' }
  const ins = await supabaseAdmin('meta_tokens', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ token: ex.token, email: 'auto-renew' }),
  })
  if (!ins.ok) return { renewed: false, reason: 'Could not store the renewed token' }
  return { renewed: true, token: ex.token, createdAt: new Date().toISOString(), expiresIn: ex.expiresIn || null }
}

async function tokenIsValid(token) {
  try {
    const r = await fetch('https://graph.facebook.com/v19.0/me?' + new URLSearchParams({ access_token: token }))
    const d = await r.json()
    return !(d && d.error)
  } catch { return true } // network blip: do not raise a false alarm
}

// Meta's own record of when this token dies (needs the app secret). Returns
// days left, or null if it cannot be read. This, not our own created_at clock,
// is what the daily check trusts.
async function metaDaysLeft(token) {
  const secret = process.env.META_APP_SECRET
  if (!secret) return null
  try {
    const qs = new URLSearchParams({ input_token: token, access_token: META_APP_ID + '|' + secret })
    const r = await fetch('https://graph.facebook.com/v19.0/debug_token?' + qs)
    const x = (await r.json())?.data
    if (!x) return null
    if (x.is_valid === false) return -1
    if (x.expires_at === 0) return 9999
    return x.expires_at ? Math.round((x.expires_at - Date.now() / 1000) / 86400) : null
  } catch { return null }
}

async function sendAlertEmail(subject, text) {
  const key = process.env.RESEND_API_KEY
  if (!key) return false
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        from: process.env.REPORT_FROM_EMAIL || 'Leverage Quantum <quantum@platform.leverageedu.com>',
        to: [ALERT_TO],
        subject,
        text,
      }),
    })
    return r.ok
  } catch { return false }
}

// Daily check, called by .github/workflows/meta-token-check.yml with the
// CRON_SECRET. Renews at day 30+, and emails if the token is already dead or
// the renewal failed -- so an expiry can never again go unnoticed.
async function dailyCheck(res) {
  const r = await supabaseAdmin('meta_tokens?select=token,created_at&order=created_at.desc&limit=1')
  const row = r.ok ? (await r.json())?.[0] : null
  if (!row) {
    await sendAlertEmail('Quantum: no Meta token is stored', 'There is no Meta access token saved. Open Meta Ads in Quantum and click "Continue with Meta".')
    return res.status(200).json({ ok: false, status: 'no_token' })
  }
  const age = tokenAgeDays(row.created_at)
  const valid = await tokenIsValid(row.token)
  if (!valid) {
    await sendAlertEmail('Quantum: Meta token has expired - reconnect needed',
      'The shared Meta access token is no longer valid, so Meta Ads, Ask AI (Meta) and the Meta parts of the reports are failing.\n\nFix (1 minute): open https://quantum.leverageedu.com/dashboard/meta-ads and click "Continue with Meta".')
    return res.status(200).json({ ok: false, status: 'expired', ageDays: Math.floor(age) })
  }
  // Renew when Meta says it has under 40 days left (or our clock says 30+ days
  // and Meta's date cannot be read).
  let daysLeft = await metaDaysLeft(row.token)
  if (daysLeft === null ? age >= RENEW_AFTER_DAYS : daysLeft < 40) {
    const out = await renewStoredToken(row)
    if (out.renewed) {
      const after = await metaDaysLeft(out.token)
      if (after === null || after >= 40) return res.status(200).json({ ok: true, status: 'renewed', daysLeft: after })
      daysLeft = after
    }
    if (daysLeft === null || daysLeft < 20) {
      await sendAlertEmail('Quantum: Meta token could not be renewed automatically',
        'The Meta token has about ' + (daysLeft === null ? '?' : daysLeft) + ' days left and automatic renewal failed (' + (out.reason || 'no extension from Meta') + ').\nPlease open https://quantum.leverageedu.com/dashboard/meta-ads and click "Continue with Meta" before it expires.')
      return res.status(200).json({ ok: false, status: 'renew_failed', reason: out.reason, daysLeft })
    }
  }
  return res.status(200).json({ ok: true, status: 'fresh', ageDays: Math.floor(age), daysLeft })
}

export default async function handler(req, res) {
  if (req.method === 'GET' && req.query?.action === 'check') {
    const bearer = req.headers.authorization || ''
    if (!process.env.CRON_SECRET || bearer !== 'Bearer ' + process.env.CRON_SECRET) return res.status(403).json({ error: 'Forbidden' })
    try { return await dailyCheck(res) } catch (e) { return res.status(500).json({ error: e.message }) }
  }
  const me = getSessionUser(req)
  if (!me) return res.status(401).json({ error: 'Not signed in' })

  if (req.method === 'GET') {
    const canRead = ['home', 'overall', 'ask_ai', 'meta_ads'].some(id => canAccessDashboard(me.role, id))
    if (!canRead) return res.status(403).json({ error: 'Forbidden' })
    try {
      const r = await supabaseAdmin('meta_tokens?select=token,created_at&order=created_at.desc&limit=1')
      if (!r.ok) return res.status(500).json({ error: 'Failed to read token' })
      const data = await r.json()
      let row = data?.[0]
      // Renew on use: a page load past day 30 swaps in a fresh 60-day token.
      if (row && tokenAgeDays(row.created_at) >= RENEW_AFTER_DAYS) {
        const out = await renewStoredToken(row).catch(() => ({ renewed: false }))
        if (out.renewed) row = { token: out.token, created_at: out.createdAt }
      }
      return res.status(200).json(row ? { token: row.token, createdAt: row.created_at } : {})
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  if (req.method === 'POST') {
    if (!canAccessDashboard(me.role, 'meta_ads')) return res.status(403).json({ error: 'Forbidden' })
    const { token } = req.body || {}
    if (!token) return res.status(400).json({ error: 'Missing token' })
    try {
      const exchange = await exchangeForLongLivedToken(token)
      const r = await supabaseAdmin('meta_tokens', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ token: exchange.token, email: me.email }),
      })
      if (!r.ok) return res.status(500).json({ error: 'Failed to store token' })
      return res.status(200).json({
        ok: true,
        exchanged: exchange.exchanged,
        expiresIn: exchange.expiresIn || null,
        exchangeNote: exchange.exchanged ? null : exchange.reason,
      })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  if (req.method === 'DELETE') {
    if (me.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
    try {
      const r = await supabaseAdmin('meta_tokens?created_at=not.is.null', { method: 'DELETE' })
      if (!r.ok) return res.status(500).json({ error: 'Failed to clear token' })
      return res.status(200).json({ ok: true })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  res.setHeader('Allow', 'GET, POST, DELETE')
  return res.status(405).json({ error: 'Method not allowed' })
}
