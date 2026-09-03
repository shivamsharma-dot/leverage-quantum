// Futwork Project -- a person's real, LeadSquared-sourced Sales Group
// membership rolled up into one of 4 coarse buckets: 'Online Team' (Admission
// Consulting or Student Recruitment), 'Offline Team', 'Online Team MBBS',
// 'Online Team Dubai'. Replaced the earlier Team+Role-based Call Transfer
// condition entirely (2026-09 -- explicit instruction: "remove the team
// condition fully, remove role").
//
// Lives in shared/ (not lib/ or a page-local helper) so api/crm-leads.js
// (server-side: the Frapp coach Country auto-fill, which has to reach the
// exact same verdict a human is looking at) and
// src/pages/TeamMappingDashboard.jsx (the roster table's own Futwork
// Project/Call Transfer columns + Country suggestions) can never drift apart
// -- same reasoning as shared/didRegion.mjs. Nothing in this file may import
// anything -- it has to stay usable from both the Vercel function (dynamic
// import, api/crm-leads.js is bundled CommonJS) and the Vite/browser bundle
// (a normal static import).
//
// Group name match is case-insensitive; every constant here is lowercase to
// make that explicit at every call site.
export const FW_ONLINE_GROUPS = new Set(['online team - admission consulting', 'online team - student recruitment'])
export const FW_OFFLINE_GROUPS = new Set([
  'offline - assam guwahati', 'offline - delhi nehru place', 'offline - noida 126 + 18',
  'offline - delhi model town', 'offline - delhi nsp', 'offline - indore mp',
  'offline - mumbai nashik center', 'offline - punjab chandigarh sector -34',
  'offline - delhi rajouri garden', 'offline - mumbai churchgate center',
  'offline - rajasthan jaipur center', 'offline - gurgaon - galleria',
  'offline - west bengal kolkata', 'offline - bengaluru centre',
  'offline - kerala thiruvananthapuram', 'offline - maharasthra - pune',
  'offline - mumbai andheri (distribution)', 'offline - gujarat ahmedabad',
  'offline - gujarat surat',
])
export const FW_DUBAI_GROUP = 'online team - dubai'
export const FW_MBBS_GROUP = 'online team - mbbs'

// Returns { project, conflict }. `project` is one of 'Online Team' /
// 'Offline Team' / 'Online Team MBBS' / 'Online Team Dubai', or null if
// nobody matched OR more than one bucket matched at once -- an overlap across
// buckets is treated as a real data problem to go fix in LeadSquared (explicit
// choice), never silently resolved to one winner.
export function classifyFutworkProject(groups) {
  const norm = (groups || []).map(g => String(g || '').trim().toLowerCase())
  const hits = []
  if (norm.some(g => FW_ONLINE_GROUPS.has(g))) hits.push('Online Team')
  if (norm.some(g => FW_OFFLINE_GROUPS.has(g))) hits.push('Offline Team')
  if (norm.includes(FW_MBBS_GROUP)) hits.push('Online Team MBBS')
  if (norm.includes(FW_DUBAI_GROUP)) hits.push('Online Team Dubai')
  if (hits.length === 1) return { project: hits[0], conflict: false }
  if (hits.length > 1) return { project: null, conflict: true }
  return { project: null, conflict: false }
}

// Country type-ahead suggestions, scoped to whichever Sales Group(s) a person
// is actually in -- Admission Consulting and Student Recruitment have
// genuinely different valid country lists despite both rolling up into the
// same "Online Team" Futwork Project bucket above, so this checks group
// membership directly rather than reusing classifyFutworkProject's coarser
// result. In both AC+SR at once (possible, not the common case) -- union of
// both lists. Offline has no defined list (never specified) -- falls through
// to plain free-typing, same as before this feature existed.
export const COUNTRY_LIST_AC = ['Thailand', 'Malaysia', 'Vietnam', 'France', 'France (Public)', 'Germany', 'Germany (Public)', 'Netherlands', 'Poland', 'Finland', 'Spain', 'Cyprus', 'Hungary', 'Italy', 'Italy (Public)', 'Lithuania', 'Luxembourg', 'Singapore', 'South Africa', 'Sweden', 'Switzerland', 'Denmark', 'Latvia', 'Russia', 'Georgia', 'Uzbekistan', 'Kazakhstan', 'Philippines', 'China', 'Nepal', 'Belgium', 'Kyrgyzstan', 'Slovakia', 'Others', 'Not yet decided', 'NA']
export const COUNTRY_LIST_SR = ['UK', 'Canada', 'USA', 'Australia', 'New Zealand', 'Dubai', 'France (Private)', 'Germany (Private)', 'Ireland', 'Nigeria', 'Italy (Private)', 'Malta']
export function countrySuggestionsFor(groups) {
  const norm = (groups || []).map(g => String(g || '').trim().toLowerCase())
  if (norm.includes(FW_DUBAI_GROUP)) return ['Dubai']
  if (norm.includes(FW_MBBS_GROUP)) return ['mbbs']
  const inAc = norm.includes('online team - admission consulting')
  const inSr = norm.includes('online team - student recruitment')
  if (inAc && inSr) return Array.from(new Set([...COUNTRY_LIST_AC, ...COUNTRY_LIST_SR]))
  if (inAc) return COUNTRY_LIST_AC
  if (inSr) return COUNTRY_LIST_SR
  return []
}
// The one auto-fill exception on this page (every other manual field starts
// as whatever's already on file) -- Dubai/MBBS have exactly one valid country
// each, so pre-fill it the moment the edit modal opens, but only into a
// genuinely EMPTY Country field. Never overwrites something already on file.
// The SAME rule (blank-only, Dubai/MBBS-only) drives the server-side bulk
// "Auto-fill known countries" action on the Frapp coaches push panel -- deliberately
// the only two buckets with a single deterministic answer. Admission
// Consulting/Student Recruitment/Offline have no default: which of ~30 or
// ~12 destination countries a given consultant actually handles is a real
// business fact nobody has given this app a source for, so those stay
// genuinely blank rather than being guessed at.
export function autoFillCountry(groups, currentValue) {
  if (String(currentValue || '').trim()) return currentValue
  const norm = (groups || []).map(g => String(g || '').trim().toLowerCase())
  if (norm.includes(FW_DUBAI_GROUP)) return 'Dubai'
  if (norm.includes(FW_MBBS_GROUP)) return 'mbbs'
  return currentValue
}
