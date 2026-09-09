// Single source of truth for per-page authorization.
//
// This logic used to exist as three hand-maintained copies -- lib/auth.mjs's
// canAccessDashboard() (the server-side gate that actually protects data),
// src/App.jsx's canAccess() (the route guard) and src/components/Sidebar.jsx's
// canSee() (nav visibility). They were kept in sync by a comment asking the next
// person to remember, which is not a mechanism. All three now import from here,
// so a rule can only be changed in one place and every caller moves together.
//
// Lives in shared/ (not lib/) because lib/auth.mjs imports jsonwebtoken and the
// browser bundle must not pull that in. Nothing in this file may import anything
// -- it has to stay usable from both the Vercel functions and the Vite bundle.

// Genuinely restricted to one person, not one role -- 'admin' still includes
// nishant.bhatia, and this page is Shivam's own BigQuery beta.
export const OVERALL_BIGQUERY_EMAILS = ['shivam.sharma@leverageedu.com']

// Dashboards a plain 'viewer' does NOT get implicitly -- they must be granted
// explicitly through a "viewer:<ids>" role. Also the fail-safe denial list used
// for unknown/malformed roles.
export const VIEWER_MUST_BE_GRANTED = [
  'ask_ai',
  'agents',
  'marketing_performance',
  'ceo_b2c_pnl',
  'ceo_b2c_cashflow',
  'marketing_review',
  'team_mapping',
  'super_tracker',
]

// "viewer:home,meta_ads" / "custom:roas". Tolerates whitespace around the commas:
// these strings are normally written by Settings as ids.join(','), but a role
// hand-edited in Supabase to "viewer:home, meta_ads" would previously revoke
// every page after the first one, silently and with no error anywhere.
export function parseGrantedIds(role, prefix) {
  return String(role)
    .slice(prefix.length)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

// role: the stored allowed_users.role string. dashboardId: a PAGE_LIST id.
// email: only ever consulted for overall_bigquery; callers that omit it simply
// fail that one check closed, which is the safe direction.
export function canAccessDashboard(role, dashboardId, email) {
  if (dashboardId === 'overall_bigquery') {
    return OVERALL_BIGQUERY_EMAILS.includes(String(email || '').toLowerCase())
  }
  const userRole = role || 'viewer'
  if (dashboardId === 'settings') return userRole === 'admin'
  if (userRole === 'admin') return true
  if (userRole === 'viewer') return !VIEWER_MUST_BE_GRANTED.includes(dashboardId)
  if (userRole.startsWith('viewer:')) {
    return parseGrantedIds(userRole, 'viewer:').includes(dashboardId)
  }
  // Legacy roles, still present on some older accounts.
  if (userRole === 'roas_only') return dashboardId === 'roas'
  if (userRole.startsWith('custom:')) {
    return parseGrantedIds(userRole, 'custom:').includes(dashboardId)
  }
  // Unknown/malformed role -- fail safe, not fail open.
  return !VIEWER_MUST_BE_GRANTED.includes(dashboardId)
}
