import { getSessionUser, supabaseAdmin } from '../lib/auth.mjs'

// GET  /api/preferences          — returns this admin's hidden_pages
// POST /api/preferences          — saves hidden_pages (admin only)
// GET  /api/preferences?global=1 — returns the globally applied hidden_pages (for Sidebar)

export default async function handler(req, res) {
  const me = getSessionUser(req)
  if (!me) return res.status(401).json({ error: 'Not signed in' })

  // GET — global flag: anyone can read the global hidden_pages (needed for Sidebar)
  if (req.method === 'GET') {
    const r = await supabaseAdmin(
      'app_preferences?select=key,value,updated_at&limit=50',
    )
    if (!r.ok) return res.status(500).json({ error: 'Failed to read preferences' })
    const rows = await r.json()
    const prefs = Object.fromEntries(rows.map(row => [row.key, row.value]))
    const meta = Object.fromEntries(rows.map(row => [row.key, row.updated_at]))
    return res.status(200).json({ prefs, meta })
  }

  // POST/PATCH — admin only
  if (!['POST', 'PATCH'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PATCH')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (me.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' })
  }

  const { key, value } = req.body || {}
  if (!key) return res.status(400).json({ error: 'key is required' })

  // Upsert into app_preferences
  const r = await supabaseAdmin('app_preferences', {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      key,
      value,
      updated_by: me.email,
      updated_at: new Date().toISOString(),
    }),
  })
  if (!r.ok) {
    const err = await r.text()
    return res.status(500).json({ error: 'Failed to save: ' + err })
  }
  return res.status(200).json({ success: true })
}
