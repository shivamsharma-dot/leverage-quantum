import { getSessionUser, supabaseAdmin, ALLOWED_DOMAIN } from '../lib/auth.mjs'

// Roles are free text in the DB, but only these shapes mean anything to
// lib/auth.mjs -- anything else falls through canAccessDashboard's unknown-role
// branch, which is not a place a real user should ever land. Validated here so a
// typo, or a hand-rolled PATCH, cannot quietly create a user nobody can reason
// about.
const PLAIN_ROLE = /^(admin|viewer|roas_only)$/
const SCOPED_ROLE = /^(viewer|custom):([a-z0-9_]+(,[a-z0-9_]+)*)?$/

function validRole(role) {
  const r = String(role == null ? '' : role).trim()
  if (!r) return false
  return PLAIN_ROLE.test(r) || SCOPED_ROLE.test(r)
}

export default async function handler(req, res) {
  const me = getSessionUser(req)
  if (!me) return res.status(401).json({ error: 'Not signed in' })
  if (me.role !== 'admin') return res.status(403).json({ error: 'Admins only' })

  if (req.method === 'GET') {
    const r = await supabaseAdmin(
      'allowed_users?select=email,role,added_by,created_at,job_title,department,receive_reports,report_types&order=created_at.asc',
    )
    return res.status(200).json({ users: await r.json() })
  }

  if (req.method === 'POST') {
    const { email, role = 'viewer' } = req.body || {}
    const clean = (email || '').toLowerCase().trim()
    if (!validRole(role)) return res.status(400).json({ error: 'Invalid role.' })
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
    const { email, role, receive_reports, job_title, department, report_types } = req.body || {}
    const clean = (email || '').toLowerCase().trim()
    if (!clean) return res.status(400).json({ error: 'email is required' })
    if (role !== undefined && !validRole(role)) {
      return res.status(400).json({ error: 'Invalid role.' })
    }
    // An admin clearing their own admin bit locks themselves out of this very
    // endpoint, and there is no guarantee another admin is around to undo it.
    // DELETE already refuses self-removal; this closes the same door on PATCH.
    if (role !== undefined && clean === me.email && role !== 'admin') {
      return res.status(400).json({ error: "You can't change your own role. Ask another admin to do it." })
    }
    const patch = {}
    if (role !== undefined) patch.role = role
    if (receive_reports !== undefined) patch.receive_reports = receive_reports
    if (job_title !== undefined) patch.job_title = job_title
    if (department !== undefined) patch.department = department
    if (report_types !== undefined) patch.report_types = report_types
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
