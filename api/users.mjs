import { getSessionUser, supabaseAdmin } from '../lib/auth.mjs'

// Roles are free text in the DB, but only these shapes mean anything to
// lib/auth.mjs -- anything else falls through canAccessDashboard's unknown-role
// branch, which is not a place a real user should ever land. Validated here so a
// typo, or a hand-rolled PATCH, cannot quietly create a user nobody can reason
// about.
const PLAIN_ROLE = /^(admin|viewer|roas_only)$/
const SCOPED_ROLE = /^(viewer|custom):([a-z0-9_]+(,[a-z0-9_]+)*)?$/
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// One admin action must never fan out into an unbounded number of writes. The
// User Access screen only ever submits addresses it already has on screen, so
// this ceiling sits far above any real paste and exists purely as a backstop.
const MAX_BATCH = 60
// last_active is one exact query per member (see lastActiveMap). That is cheap
// for a member list this size and, unlike sampling the tail of activity_log,
// stays correct no matter how big that table grows. Past this many members we
// return null instead of guessing.
const MAX_ACTIVITY_LOOKUP = 100

function validRole(role) {
  const r = String(role == null ? '' : role).trim()
  if (!r) return false
  return PLAIN_ROLE.test(r) || SCOPED_ROLE.test(r)
}

// Every write branch accepts either { email } or { emails: [...] }, so one
// handler serves a single grant, a pasted list and a bulk selection without a
// second endpoint (api/ sits at its 12-function Vercel Hobby ceiling -- see
// CLAUDE.md -- so a new file was never an option). Addresses are lowercased,
// trimmed and de-duplicated here rather than trusted from the client, and
// anything dropped comes back named in `failed` instead of vanishing.
function readEmails(body) {
  const raw = Array.isArray(body && body.emails) ? body.emails : [body && body.email]
  const seen = new Set()
  const emails = []
  const rejected = []
  for (const item of raw) {
    const clean = String(item == null ? '' : item).toLowerCase().trim()
    if (!clean || seen.has(clean)) continue
    seen.add(clean)
    if (!EMAIL_SHAPE.test(clean)) { rejected.push({ email: clean, reason: 'not a valid email address' }); continue }
    if (emails.length >= MAX_BATCH) { rejected.push({ email: clean, reason: 'over the ' + MAX_BATCH + '-address limit for one request' }); continue }
    emails.push(clean)
  }
  return { emails, rejected }
}

// Real last-seen per member, read from the same activity_log the Activity Log
// tab shows. One row-limited query each, run in parallel -- exact, and it can
// never drift the way "scan the last N thousand events" would. A member with no
// rows gets null, which the UI renders as "no activity yet" rather than "never
// signed in": activity_log only reaches back to when tracking was switched on,
// so an absence of rows is genuinely not proof of an absence of sign-ins.
async function lastActiveMap(emails) {
  const out = {}
  if (!emails.length || emails.length > MAX_ACTIVITY_LOOKUP) return out
  await Promise.all(emails.map(async (email) => {
    try {
      const r = await supabaseAdmin(
        'activity_log?select=created_at&order=created_at.desc&limit=1&email=eq.' + encodeURIComponent(email),
      )
      if (!r.ok) return
      const rows = await r.json()
      if (Array.isArray(rows) && rows[0] && rows[0].created_at) out[email] = rows[0].created_at
    } catch { /* one missing timestamp must never fail the whole member list */ }
  }))
  return out
}

// Applies one patch body to many rows in parallel and reports per-address
// outcomes, so a bulk edit can partially succeed and say exactly which rows did
// not take instead of collapsing into a single opaque false.
async function patchMany(emails, patch) {
  const updated = []
  const failed = []
  await Promise.all(emails.map(async (email) => {
    try {
      const r = await supabaseAdmin('allowed_users?email=eq.' + encodeURIComponent(email), {
        method: 'PATCH',
        body: JSON.stringify(patch),
      })
      if (r.ok) updated.push(email)
      else failed.push({ email, reason: 'the update was rejected' })
    } catch {
      failed.push({ email, reason: 'the database did not respond' })
    }
  }))
  return { updated, failed }
}

export default async function handler(req, res) {
  const me = getSessionUser(req)
  if (!me) return res.status(401).json({ error: 'Not signed in' })
  if (me.role !== 'admin') return res.status(403).json({ error: 'Admins only' })

  if (req.method === 'GET') {
    const r = await supabaseAdmin(
      'allowed_users?select=email,role,added_by,created_at,job_title,department,receive_reports,report_types&order=created_at.asc',
    )
    const users = await r.json()
    // Opt-in, so every other caller of this endpoint keeps paying for exactly
    // one query. Only the User Access screen asks for the activity column.
    if (req.query.include === 'activity' && Array.isArray(users)) {
      const lastActive = await lastActiveMap(users.map(u => u.email).filter(Boolean))
      return res.status(200).json({
        users: users.map(u => ({ ...u, last_active: lastActive[u.email] || null })),
        activityChecked: true,
      })
    }
    return res.status(200).json({ users })
  }

  if (req.method === 'POST') {
    const body = req.body || {}
    const { role = 'viewer', job_title, department, receive_reports, report_types } = body
    if (!validRole(role)) return res.status(400).json({ error: 'Invalid role.' })
    const { emails, rejected } = readEmails(body)
    if (!emails.length) {
      return res.status(400).json({
        error: rejected.length ? 'That does not look like a valid email address.' : 'email is required',
        added: [],
        failed: rejected,
      })
    }
    // Not restricted to the org domain on purpose: an admin (the only caller
    // who reaches this branch at all, see the role check above) can knowingly
    // register someone outside the organisation -- an external consultant or
    // partner, say. That person still cannot use "Sign in with Google": that
    // path stays hard-gated to ALLOWED_DOMAIN both by api/auth.mjs's own check
    // and by the hd= parameter Google enforces on its own consent screen
    // (see src/components/LoginScene.jsx). They sign in instead via the
    // emailed one-time link (api/auth.mjs's magic-request / magic-verify
    // actions, and the "Send me a link" flow on the login page), which was
    // already built to be gated purely by allowed_users membership, not by
    // domain.
    //
    // The profile fields ride along on the insert now. Add-member used to POST
    // the grant and then PATCH job title / department / report opt-in as a
    // second call per person, which left a window where a row had access but
    // none of its context, and silently lost those fields whenever that second
    // call failed.
    const row = { role, added_by: me.email }
    if (typeof job_title === 'string') row.job_title = job_title.trim()
    if (typeof department === 'string') row.department = department.trim()
    if (receive_reports !== undefined) row.receive_reports = !!receive_reports
    if (Array.isArray(report_types)) row.report_types = report_types

    const added = []
    const failed = rejected.slice()
    await Promise.all(emails.map(async (email) => {
      try {
        const r = await supabaseAdmin('allowed_users', {
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ email, ...row }),
        })
        if (r.ok || r.status === 201) added.push(email)
        else failed.push({ email, reason: 'already has access, or the insert was rejected' })
      } catch {
        failed.push({ email, reason: 'the database did not respond' })
      }
    }))
    if (!added.length) {
      return res.status(400).json({ error: 'Could not add user (they may already exist).', added, failed })
    }
    return res.status(200).json({ success: true, added, failed })
  }

  if (req.method === 'PATCH') {
    const body = req.body || {}
    const { role, receive_reports, job_title, department, report_types } = body
    if (role !== undefined && !validRole(role)) {
      return res.status(400).json({ error: 'Invalid role.' })
    }
    const { emails } = readEmails(body)
    if (!emails.length) return res.status(400).json({ error: 'email is required' })
    const patch = {}
    if (role !== undefined) patch.role = role
    if (receive_reports !== undefined) patch.receive_reports = receive_reports
    if (job_title !== undefined) patch.job_title = job_title
    if (department !== undefined) patch.department = department
    if (report_types !== undefined) patch.report_types = report_types
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'nothing to update' })
    // An admin clearing their own admin bit locks themselves out of this very
    // endpoint, and there is no guarantee another admin is around to undo it.
    // DELETE already refuses self-removal; this closes the same door on PATCH.
    // In a bulk edit the right move is to skip that one row, apply the rest and
    // name what was skipped -- not to fail the whole request.
    const skipped = emails.filter(e => role !== undefined && e === me.email && role !== 'admin')
    const targets = emails.filter(e => skipped.indexOf(e) === -1)
    if (!targets.length) {
      return res.status(400).json({ error: "You can't change your own role. Ask another admin to do it.", skipped })
    }
    const { updated, failed } = await patchMany(targets, patch)
    if (!updated.length) return res.status(400).json({ error: 'Could not update user.', failed, skipped })
    return res.status(200).json({ success: true, updated, failed, skipped })
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
