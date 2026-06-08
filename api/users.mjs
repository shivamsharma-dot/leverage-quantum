import { getSessionUser, supabaseAdmin, ALLOWED_DOMAIN } from '../lib/auth.mjs'

export default async function handler(req, res) {
  const me = getSessionUser(req)
  if (!me) return res.status(401).json({ error: 'Not signed in' })
  if (me.role !== 'admin') return res.status(403).json({ error: 'Admins only' })

  if (req.method === 'GET') {
    const r = await supabaseAdmin(
      'allowed_users?select=email,role,added_by,created_at&order=created_at.asc',
    )
    return res.status(200).json({ users: await r.json() })
  }

  if (req.method === 'POST') {
    const { email, role = 'viewer' } = req.body || {}
    const clean = (email || '').toLowerCase().trim()
    if (!clean.endsWith(`@${ALLOWED_DOMAIN}`)) {
      return res.status(400).json({ error: `Only @${ALLOWED_DOMAIN} emails are allowed.` })
    }
    const r = await supabaseAdmin('allowed_users', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ email: clean, role, added_by: me.email }),
    })
    if (!r.ok && r.status !== 201) {
      return res.status(400).json({ error: 'Could not add user (they may already exist).' })
    }
    return res.status(200).json({ success: true })
  }

 if (req.method === 'PATCH') {
    const { email, role, receive_reports } = req.body || {}
    const clean = (email || '').toLowerCase().trim()
    if (!clean) return res.status(400).json({ error: 'email is required' })
    const patch = {}
    if (role !== undefined) patch.role = role
    if (receive_reports !== undefined) patch.receive_reports = receive_reports
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'nothing to update' })
    const r = await supabaseAdmin(`allowed_users?email=eq.${encodeURIComponent(clean)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
    if (!r.ok) return res.status(400).json({ error: 'Could not update user.' })
    return res.status(200).json({ success: true })
  }

  if (req.method === 'DELETE') {
    const email = (req.query.email || '').toLowerCase().trim()
    if (!email) return res.status(400).json({ error: 'email is required' })
    if (email === me.email) return res.status(400).json({ error: "You can't remove your own access." })
    const r = await supabaseAdmin(`allowed_users?email=eq.${encodeURIComponent(email)}`, {
      method: 'DELETE',
    })
    if (!r.ok) return res.status(400).json({ error: 'Could not remove user.' })
    return res.status(200).json({ success: true })
  }

  res.setHeader('Allow', 'GET, POST, PATCH, DELETE')
  return res.status(405).json({ error: 'Method not allowed' })
}
