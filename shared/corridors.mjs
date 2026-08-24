// Server-side-safe copy of src/lib/corridors.js's classifier -- kept as a
// literal copy (not a re-export) because src/lib/corridors.js is a .js file
// with no "type":"module" scoping in this repo's package.json, so Node
// dynamic-importing it directly from an api/ handler would try to parse its
// `export` syntax as CommonJS and fail. shared/ files are always plain ESM
// with zero framework dependencies, so this is safe from both api/ (dynamic
// import) and src/ (a normal static import, same as any other shared/
// module). Keep the two files' classification RULES in sync if either
// changes -- this one backs the Quantum Gazette's corridor/campaign tables;
// src/lib/corridors.js backs every dashboard page's own corridor column.
export const CORRIDORS = [
  { id: 'india-uk', label: 'India to UK' },
  { id: 'uk-uk-rcl', label: 'UK to UK (RCL)' },
  { id: 'nigeria-uk', label: 'Nigeria to UK' },
  { id: 'malaysia-uk', label: 'Malaysia to UK' },
  { id: 'india-italy', label: 'India to Italy' },
  { id: 'malaysia-italy', label: 'Malaysia to Italy' },
  { id: 'india-germany', label: 'India to Germany' },
  { id: 'malaysia-germany', label: 'Malaysia to Germany' },
  { id: 'india-dubai', label: 'India to Dubai' },
  { id: 'nas-generic', label: 'Catch All' },
  { id: 'youtube-branding', label: 'YouTube Branding' },
  { id: 'mbbs-india', label: 'MBBS (India source)' },
  { id: 'mbbs-uk', label: 'MBBS (UK source)' },
  { id: 'ivy100', label: 'IVY100' },
  { id: 'unclassified', label: 'Unclassified' },
]
const CORRIDOR_LABEL = Object.fromEntries(CORRIDORS.map(c => [c.id, c.label]))

export function classifyCorridor(name) {
  const n = (name || '').toLowerCase()
  if (!n.trim()) return 'unclassified'
  const has = (...tokens) => tokens.some(t => n.includes(t))
  const segs = new Set(n.split(/[^a-z0-9]+/).filter(Boolean))
  const seg = (...tokens) => tokens.some(t => segs.has(t))
  if (has('mbbs')) return has('uksource', 'uk_source', 'uk source') ? 'mbbs-uk' : 'mbbs-india'
  if (has('ivy100')) return 'ivy100'
  if (has('rcl')) return 'uk-uk-rcl'
  if (has('nigeria')) return 'nigeria-uk'
  if (has('malaysiasource', 'malaysia_source', 'malaysia source')) {
    if (has('ita', 'italy')) return 'malaysia-italy'
    if (has('ger', 'germany')) return 'malaysia-germany'
    return 'malaysia-uk'
  }
  if (has('dubai') || seg('db', 'dxb')) return 'india-dubai'
  if (has('ger', 'germany')) return 'india-germany'
  if (has('ita', 'italy')) return 'india-italy'
  if (has('uk')) return 'india-uk'
  if (has('youtube') || seg('yt', 'ctv')) return 'youtube-branding'
  return 'nas-generic'
}
export function corridorLabel(id) { return CORRIDOR_LABEL[id] || id }
export function corridorLabelForName(name) { return corridorLabel(classifyCorridor(name)) }
