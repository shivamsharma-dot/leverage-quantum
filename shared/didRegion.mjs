// Classifies a phone number as 'Indian' or 'International' for the Frapp
// "Virtual DID" coach push -- Futwork's own call-routing system only accepts
// Indian numbers as coaches (their production endpoint has no validation of
// its own, so this app is the only thing standing between a bad/foreign
// number and a live call-routing misroute).
//
// Lives in shared/ (not lib/ or a page-local helper) so api/crm-leads.js
// (server-side enforcement -- no international number may ever leave this app
// via the Frapp push) and src/pages/TeamMappingDashboard.jsx (the roster
// table's own "Virtual DID" column, so the classification a human SEES is
// byte-identical to the one the API actually enforces) can never drift apart.
// Nothing in this file may import anything -- it has to stay usable from both
// the Vercel function (dynamic import, api/crm-leads.js is bundled CommonJS)
// and the Vite/browser bundle (a normal static import).
//
// Team name match is case-insensitive; the constant itself is lowercase to
// make that explicit at every call site.
export const FRAPP_TEAM_NAME = 'university admission opportunity'

// Most Indian mobiles in this LeadSquared account are stored with NO country
// code at all (e.g. "9821550658") -- confirmed live against the real Airtel
// Number field. A genuinely international number is the one that carries an
// explicit "+<code>" prefix that ISN'T +91 (e.g. "+44-7911123456"). So: no "+"
// prefix at all, or a "+91" prefix -> Indian; any other "+" prefix ->
// International.
//
// Returns null (not a real classification) when the person isn't on the
// Frapp-eligible team at all, or has no number to classify -- the column/API
// filter both treat null as "doesn't apply", distinct from a real
// International exclusion.
export function classifyDidRegion(teamName, rawNumber) {
  if (!teamName || String(teamName).trim().toLowerCase() !== FRAPP_TEAM_NAME) return null
  const raw = String(rawNumber || '').trim()
  if (!raw) return null
  if (!raw.startsWith('+')) return 'Indian'
  return raw.replace(/[\s-]/g, '').startsWith('+91') ? 'Indian' : 'International'
}
