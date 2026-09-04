// Futwork Project -- a person's real, LeadSquared-sourced Sales Group
// membership, shown at the SAME specificity the actual groups carry (2026-09
// rewrite -- explicit instruction: "show admission consultation/student
// recruitment also in the Futwork Project... Offline Centre Name not
// mentioned... why not?"). Every matching group contributes its own label;
// someone in more than one just gets all of them joined -- there is no
// "Conflict" state anymore, since a real overlap (e.g. Admission Consulting
// AND Student Recruitment) is a legitimate combination, not an error.
//
// Lives in shared/ (not lib/ or a page-local helper) so api/crm-leads.js
// (server-side: the Frapp coach push, which has to reach the exact same
// verdict a human is looking at) and src/pages/TeamMappingDashboard.jsx (the
// roster table's own Futwork Project/Call Transfer/Country columns) can
// never drift apart -- same reasoning as shared/didRegion.mjs. Nothing in
// this file may import anything -- it has to stay usable from both the
// Vercel function (dynamic import, api/crm-leads.js is bundled CommonJS) and
// the Vite/browser bundle (a normal static import).
//
// Group name match is case-insensitive; every constant here is lowercase to
// make that explicit at every call site.
export const FW_AC_GROUP = 'online team - admission consulting'
export const FW_SR_GROUP = 'online team - student recruitment'
export const FW_DUBAI_GROUP = 'online team - dubai'
export const FW_MBBS_GROUP = 'online team - mbbs'
export const FW_CANADA_GROUP = 'online team - canada'
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

// The city/centre part of an Offline group's real name, e.g.
// "Offline - Assam Guwahati" -> "Assam Guwahati" -- used for the Futwork
// Project column specifically (explicit choice: "just the city/centre part"
// over the full group name, so it reads short next to Admission
// Consulting/Student Recruitment/etc). Country (liveCountryFor below) uses
// the FULL exact group name instead -- a deliberate, different choice for
// that column ("in Offline the Group Name Exactly").
function offlineCentreLabel(rawGroup) {
  return String(rawGroup || '').trim().replace(/^offline\s*-\s*/i, '').trim()
}

// Returns { project }: every bucket this person's groups actually match,
// each contributing its own label, joined with ", " when more than one.
// null when nothing matched. No exclusivity, no conflict state.
export function classifyFutworkProject(groups) {
  const raw = groups || []
  const norm = raw.map(g => String(g || '').trim().toLowerCase())
  const parts = []
  if (norm.includes(FW_AC_GROUP)) parts.push('Admission Consulting')
  if (norm.includes(FW_SR_GROUP)) parts.push('Student Recruitment')
  if (norm.includes(FW_MBBS_GROUP)) parts.push('Online Team MBBS')
  if (norm.includes(FW_DUBAI_GROUP)) parts.push('Online Team Dubai')
  if (norm.includes(FW_CANADA_GROUP)) parts.push('Online Team Canada')
  norm.forEach((g, i) => {
    if (FW_OFFLINE_GROUPS.has(g)) {
      const centre = offlineCentreLabel(raw[i])
      if (centre && !parts.includes(centre)) parts.push(centre)
    }
  })
  if (!parts.length) return { project: null }
  return { project: parts.join(', ') }
}

// Default AC/SR country lists -- used only as a fallback when nothing has
// been saved yet in app_preferences (team_ac_countries/team_sr_countries).
// The real, admin-editable lists live there now (Team Mapping > Sales Groups
// > "Edit country lists"), read via /api/preferences same as every other
// app-wide setting -- explicit instruction: "put a option somewhere to
// update country list of AC and SR" instead of it being hardcoded in code.
export const COUNTRY_LIST_AC = ['Thailand', 'Malaysia', 'Vietnam', 'France', 'France (Public)', 'Germany', 'Germany (Public)', 'Netherlands', 'Poland', 'Finland', 'Spain', 'Cyprus', 'Hungary', 'Italy', 'Italy (Public)', 'Lithuania', 'Luxembourg', 'Singapore', 'South Africa', 'Sweden', 'Switzerland', 'Denmark', 'Latvia', 'Russia', 'Georgia', 'Uzbekistan', 'Kazakhstan', 'Philippines', 'China', 'Nepal', 'Belgium', 'Kyrgyzstan', 'Slovakia', 'Others', 'Not yet decided', 'NA']
export const COUNTRY_LIST_SR = ['UK', 'Canada', 'USA', 'Australia', 'New Zealand', 'Dubai', 'France (Private)', 'Germany (Private)', 'Ireland', 'Nigeria', 'Italy (Private)', 'Malta']

// Country type-ahead suggestions, scoped to whichever Sales Group(s) a
// person is actually in. acList/srList are the CURRENT admin-edited lists
// (fall back to the defaults above when not yet customized) -- passed in
// rather than fetched here, since this file cannot import anything and has
// no way to reach app_preferences itself. Still purely optional/manual: a
// person's Country only ever needs picking here if the live default
// (liveCountryFor below) genuinely isn't specific enough.
export function countrySuggestionsFor(groups, acList, srList) {
  const ac = (acList && acList.length) ? acList : COUNTRY_LIST_AC
  const sr = (srList && srList.length) ? srList : COUNTRY_LIST_SR
  const norm = (groups || []).map(g => String(g || '').trim().toLowerCase())
  if (norm.includes(FW_DUBAI_GROUP)) return ['DUBAI']
  if (norm.includes(FW_MBBS_GROUP)) return ['MBBS']
  if (norm.includes(FW_CANADA_GROUP)) return ['Canada']
  const inAc = norm.includes(FW_AC_GROUP)
  const inSr = norm.includes(FW_SR_GROUP)
  if (inAc && inSr) return Array.from(new Set([...ac, ...sr]))
  if (inAc) return ac
  if (inSr) return sr
  return []
}

// The single source of truth for "what Country shows/gets pushed by
// default, with nothing manually picked" -- used by BOTH the Roster table's
// own Country column (so it behaves live, like Group/Team already do,
// explicit instruction: "just live group, team behave on the page
// currently") AND the Frapp push (buildFrappCoachList in api/crm-leads.js),
// so the two can never show a different value for the same person.
//   Online Team Dubai   -> "DUBAI"
//   Online Team MBBS    -> "MBBS"
//   Online Team Canada  -> "Canada"
//   Offline - <centre>  -> the exact group name(s), e.g. "Offline - Assam Guwahati"
//   Admission Consulting / Student Recruitment (or both) -> that label
//   nothing matched -> null (still genuinely unknown, e.g. no Sales Group at all)
export function liveCountryFor(groups) {
  const raw = groups || []
  const norm = raw.map(g => String(g || '').trim().toLowerCase())
  if (norm.includes(FW_DUBAI_GROUP)) return 'DUBAI'
  if (norm.includes(FW_MBBS_GROUP)) return 'MBBS'
  if (norm.includes(FW_CANADA_GROUP)) return 'Canada'
  const offlineExact = []
  norm.forEach((g, i) => {
    if (FW_OFFLINE_GROUPS.has(g)) {
      const orig = String(raw[i] || '').trim()
      if (orig && !offlineExact.includes(orig)) offlineExact.push(orig)
    }
  })
  if (offlineExact.length) return offlineExact.join(', ')
  const inAc = norm.includes(FW_AC_GROUP)
  const inSr = norm.includes(FW_SR_GROUP)
  if (inAc && inSr) return 'Admission Consulting, Student Recruitment'
  if (inAc) return 'Admission Consulting'
  if (inSr) return 'Student Recruitment'
  return null
}

// The one auto-fill exception on the edit form (every other manual field
// starts as whatever's already on file) -- pre-fills Country to its live
// default the moment the edit modal opens, but only into a genuinely EMPTY
// field. Never overwrites something already on file.
export function autoFillCountry(groups, currentValue) {
  if (String(currentValue || '').trim()) return currentValue
  return liveCountryFor(groups) || currentValue
}
