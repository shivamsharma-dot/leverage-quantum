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

// REMOVED 2026-09-29 -- overall_bigquery used to be gated by this hardcoded
// email allowlist instead of the normal role/grant system every other
// dashboard uses (added when this page was a brand-new BigQuery beta, opened
// to a couple of named people by explicit request rather than by role).
// That made Settings > User Access's own "Overall (BigQuery)" checkbox a
// silent no-op for anyone not on this list -- an admin could tick it, save
// it, everything LOOKS granted, and the person still gets blocked, because
// this function never even looked at their role for this one dashboardId.
// Bit two real people in under a week (chilukoti.sriteja on 2026-09-23,
// harshita.dhingra on 2026-09-29) -- both correctly granted through Settings,
// both blocked anyway, both needing a code change + deploy just to add one
// email. Root-fixed by folding this dashboard into VIEWER_MUST_BE_GRANTED
// below instead -- the exact same "no viewer gets this for free, an explicit
// grant or admin role is required" treatment ceo_b2c_pnl/team_mapping/etc.
// already have. The Settings checkbox now does exactly what it already
// visually promises, with no separate list to remember to update.

// Marketing Review: only these people may FREEZE (finalize) a review or unfreeze it. Everything else on
// that page is open to any admin. Enforced on the server in api/preferences.mjs and mirrored in the UI.
export const MARKETING_REVIEW_OWNERS = ['shivam.sharma@leverageedu.com']
export function isMarketingReviewOwner(email) {
  return !!email && MARKETING_REVIEW_OWNERS.includes(String(email).trim().toLowerCase())
}

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
  'overall_bigquery',
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
// email: kept as a 3rd param for call-site compatibility (every caller still
// passes it) but no longer consulted by anything below -- overall_bigquery's
// old email-only branch is gone, see the removal note on VIEWER_MUST_BE_GRANTED
// above. Every dashboardId, this one included, now goes through the exact
// same role/grant logic.
export function canAccessDashboard(role, dashboardId, email) {
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
