import { getSessionUser, supabaseAdmin } from '../lib/auth.mjs'

// GET  /api/preferences          — returns this admin's hidden_pages
// POST /api/preferences          — saves hidden_pages (admin only)
// GET  /api/preferences?global=1 — returns the globally applied hidden_pages (for Sidebar)

export default async function handler(req, res) {
  const me = getSessionUser(req)

  // Unauthenticated GET ?global=1 — the login page needs its org-wide style pick
  // before anyone has signed in. Whitelisted to ONLY the login design-style key;
  // every other preference (hidden pages, sheet URLs, Slack webhook, etc.) still
  // requires a real session below.
  if (!me) {
    if (req.method === 'GET' && req.query.global === '1') {
      const r = await supabaseAdmin('app_preferences?select=key,value&key=eq.lq_login_style')
      const rows = r.ok ? await r.json() : []
      return res.status(200).json({ prefs: Object.fromEntries(rows.map(row => [row.key, row.value])) })
    }
    return res.status(401).json({ error: 'Not signed in' })
  }

  // GET (authenticated) — every signed-in user needs a small set of app-wide
  // keys regardless of role (hidden_pages for the Sidebar, the 3 design-style
  // picks so Button/KPI/Login look consistent for everyone). Everything else
  // in app_preferences (sheet URLs, Slack webhook, report sender config, AI
  // budget, etc.) is admin-only config and must not leak to a non-admin viewer,
  // including a custom viewer granted zero dashboards.
  if (req.method === 'GET') {
    const r = await supabaseAdmin(
      'app_preferences?select=key,value,updated_at&limit=50',
    )
    if (!r.ok) return res.status(500).json({ error: 'Failed to read preferences' })
    const rows = await r.json()
    const PUBLIC_KEYS = new Set(['hidden_pages', 'lq_button_style', 'lq_kpi_style', 'lq_login_style'])
    const visibleRows = me.role === 'admin' ? rows : rows.filter(row => PUBLIC_KEYS.has(row.key))
    const prefs = Object.fromEntries(visibleRows.map(row => [row.key, row.value]))
    const meta = Object.fromEntries(visibleRows.map(row => [row.key, row.updated_at]))
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
