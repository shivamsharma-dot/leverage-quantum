import { getSessionUser, canAccessDashboard, supabaseAdmin } from '../lib/auth.mjs'

// Server-side proxy for the shared Meta Ads access token (meta_tokens table).
// Replaces direct client-side Supabase reads/writes to this table — the anon
// key is exposed in every browser bundle, so any client-side path to a
// credential table is a bypass regardless of app-level UI restrictions.
//
// GET  — restricted to whichever pages actually consume this token client-side
//        (Home summary, Ask AI, Meta Ads) so a viewer granted none of those
//        can't pull the live token straight from this endpoint and query
//        Facebook's Graph API directly, bypassing every other restriction.
// POST — requires meta_ads page access (same gate as the Connect UI itself)

export default async function handler(req, res) {
  const me = getSessionUser(req)
  if (!me) return res.status(401).json({ error: 'Not signed in' })

  if (req.method === 'GET') {
    const canRead = ['home', 'overall', 'ask_ai', 'meta_ads'].some(id => canAccessDashboard(me.role, id))
    if (!canRead) return res.status(403).json({ error: 'Forbidden' })
    try {
      const r = await supabaseAdmin('meta_tokens?select=token,created_at&order=created_at.desc&limit=1')
      if (!r.ok) return res.status(500).json({ error: 'Failed to read token' })
      const data = await r.json()
      const row = data?.[0]
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
      const r = await supabaseAdmin('meta_tokens', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ token, email: me.email }),
      })
      if (!r.ok) return res.status(500).json({ error: 'Failed to store token' })
      return res.status(200).json({ ok: true })
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
