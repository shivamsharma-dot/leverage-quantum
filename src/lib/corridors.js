// ---------------------------------------------------------------------------
// corridors.js -- shared "corridor" (source country -> destination
// country/program) classifier for Meta ad names and Google Ads campaign
// names. There is no structured field for this anywhere (Meta/Google don't
// know what a "corridor" is) -- it's a naming-convention parser, reverse
// engineered from how the media team already names ads/campaigns. Rules are
// priority-ordered: more specific tokens (MBBS, IVY100, RCL, Nigeria,
// MalaysiaSource) are checked before generic destination tokens (UK/Ger/Ita).
// Used as a cross-cutting dimension on Overall, Meta Ads, Google Ads, and
// QL Ops -- keep this the single source of truth so the rules never drift
// between pages.
// ---------------------------------------------------------------------------

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
  { id: 'mbbs-india', label: 'MBBS (India source)' },
  { id: 'mbbs-uk', label: 'MBBS (UK source)' },
  { id: 'ivy100', label: 'IVY100' },
  { id: 'unclassified', label: 'Unclassified' },
]
const CORRIDOR_LABEL = Object.fromEntries(CORRIDORS.map(c => [c.id, c.label]))

/**
 * Classifies an ad/campaign name string into a corridor id.
 * Returns 'unclassified' for blank/unrecognized names.
 */
export function classifyCorridor(name) {
  const n = (name || '').toLowerCase()
  if (!n.trim()) return 'unclassified'

  const has = (...tokens) => tokens.some(t => n.includes(t))

  if (has('mbbs')) return has('uksource', 'uk_source', 'uk source') ? 'mbbs-uk' : 'mbbs-india'
  if (has('ivy100')) return 'ivy100'
  if (has('rcl')) return 'uk-uk-rcl'
  if (has('nigeria')) return 'nigeria-uk'
  if (has('malaysiasource', 'malaysia_source', 'malaysia source')) {
    if (has('ita', 'italy')) return 'malaysia-italy'
    if (has('ger', 'germany')) return 'malaysia-germany'
    return 'malaysia-uk'
  }
  if (has('dubai')) return 'india-dubai'
  if (has('ger', 'germany')) return 'india-germany'
  if (has('ita', 'italy')) return 'india-italy'
  if (has('uk')) return 'india-uk'
  if (has('nas')) return 'nas-generic'
  return 'unclassified'
}

/** Human-readable label for a corridor id (falls back to the id itself). */
export function corridorLabel(id) {
  return CORRIDOR_LABEL[id] || id
}

/** Convenience: name -> label directly. */
export function corridorLabelForName(name) {
  return corridorLabel(classifyCorridor(name))
}

// ---------------------------------------------------------------------------
// Google Ads campaign category (Search / Performance Max / Demand Gen / ...).
// This ONE has a real structured field: campaign.advertising_channel_type
// from the Google Ads API. Use GOOGLE_CHANNEL_LABELS wherever that field is
// available. classifyCampaignTypeFromName() is a best-effort fallback only
// for pages that just have a campaign-name string and no API field (QL Ops,
// Overall) -- keyword match on the name, not authoritative.
// ---------------------------------------------------------------------------

export const GOOGLE_CHANNEL_LABELS = {
  SEARCH: 'Search',
  PERFORMANCE_MAX: 'PMax',
  DISCOVERY: 'Demand Gen',
  DEMAND_GEN: 'Demand Gen',
  DISPLAY: 'Display',
  VIDEO: 'Video',
  SHOPPING: 'Shopping',
  HOTEL: 'Hotel',
  LOCAL: 'Local',
  LOCAL_SERVICES: 'Local Services',
  SMART: 'Smart',
  MULTI_CHANNEL: 'Multi-channel',
}

/** channel-type enum value (e.g. 'PERFORMANCE_MAX') -> short display label. */
export function googleChannelLabel(channelType) {
  return GOOGLE_CHANNEL_LABELS[channelType] || channelType || '—'
}

/**
 * Best-effort campaign-category guess from a campaign name string alone
 * (no real API field available). Only meaningful for Google-sourced rows.
 */
export function classifyCampaignTypeFromName(name) {
  const n = (name || '').toLowerCase()
  if (!n.trim()) return null
  if (n.includes('pmax') || n.includes('performance max')) return 'PMax'
  if (n.includes('demand gen') || n.includes('discovery')) return 'Demand Gen'
  if (n.includes('display')) return 'Display'
  if (n.includes('video') || n.includes('youtube')) return 'Video'
  if (n.includes('shopping')) return 'Shopping'
  return 'Search'
}

/** True if a QL Ops / Overall row's source string indicates Google Ads. */
export function isGoogleSource(source) {
  return /google/i.test(source || '')
}
