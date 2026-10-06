// Leverage Careers programs -- a campaign is assigned to a program by keywords in
// its NAME. Shared by the Careers page, its Slack report and Settings so all three
// classify identically. The list is editable in Settings > Data > Careers programs
// (app_preferences key 'careers_programs'); DEFAULT_PROGRAMS is used until someone
// saves one, so the page works with nothing configured.
//
// Rules:
//  - Programs are checked IN ORDER and the first match wins, so every campaign
//    counts in exactly one program and the program totals always add up.
//  - A keyword is a case-insensitive substring of the campaign name. A keyword
//    written /like-this/ is a case-insensitive regular expression.
//  - A campaign that matches nothing is "Other" -- shown, never hidden.
//
// Order matters: Physiotherapy, Occupational Therapy and Allied are checked BEFORE
// Nursing because several of their campaigns carry a "Nursing_" prefix in the name
// (e.g. Nursing_Physiotherapy_26May26) but are not nursing ads. Japan campaigns
// are Nursing, per the team (2026-10-06). Ausbildung is its own program for now.
export const OTHER_PROGRAM = 'Other'

export const DEFAULT_PROGRAMS = [
  { name: 'Physiotherapy', keywords: ['physio'] },
  { name: 'Occupational Therapy', keywords: ['occupational'] },
  { name: 'Allied Healthcare Science', keywords: ['allied', 'health'] },
  { name: 'Ausbildung (Germany)', keywords: ['ausb'] },
  { name: 'Nursing', keywords: ['nurs', '/nur[0-9]/', 'nurger', 'nurjp', 'japan'] },
  { name: 'Language Training', keywords: ['language', 'training', 'german'] },
]

function keywordMatches(name, kw) {
  const k = String(kw || '').trim()
  if (!k) return false
  if (k.length > 2 && k[0] === '/' && k[k.length - 1] === '/') {
    try { return new RegExp(k.slice(1, -1), 'i').test(name) } catch (_) { return false }
  }
  return name.toLowerCase().includes(k.toLowerCase())
}

export function normalizePrograms(list) {
  if (!Array.isArray(list)) return DEFAULT_PROGRAMS
  const out = list
    .filter(p => p && typeof p.name === 'string' && p.name.trim() && Array.isArray(p.keywords))
    .map(p => ({ name: p.name.trim(), keywords: p.keywords.map(k => String(k).trim()).filter(Boolean) }))
  return out.length ? out : DEFAULT_PROGRAMS
}

export function classifyProgram(campaign, programs) {
  const name = String(campaign == null ? '' : campaign)
  if (!name) return OTHER_PROGRAM
  const list = programs && programs.length ? programs : DEFAULT_PROGRAMS
  for (const p of list) {
    if (p.keywords.some(k => keywordMatches(name, k))) return p.name
  }
  return OTHER_PROGRAM
}
