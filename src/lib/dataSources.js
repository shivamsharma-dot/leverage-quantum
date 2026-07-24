// src/lib/dataSources.js
// Resolves the effective CSV URL for a data source. Admin-configured overrides
// (saved from Settings > Data > Data Sources, stored server-side via /api/preferences
// in the app_preferences table) take priority over the hard-coded default so sheets
// can be reconnected without a code deploy.

export const SHEET_PREF_KEYS = {
    referral: 'sheet_url_referral',
    qlopsDaily: 'sheet_url_qlops_daily',
    qlopsMonthly: 'sheet_url_qlops_monthly',
    whatsapp: 'sheet_url_whatsapp',
    fbleads: 'sheet_url_fbleads',
    leadsAssigned: 'sheet_url_leads_assigned',
    googleLeads: 'sheet_url_googleleads',
    humanQlDetail: 'sheet_url_human_ql_detail',
    aiQlDetail: 'sheet_url_ai_ql_detail',
    humanUnassigned: 'sheet_url_human_unassigned',
    aiUnassigned: 'sheet_url_ai_unassigned',
}

// Per-key cache (60s TTL) + in-flight dedup, so pages that fire several
// resolveSheetUrl() calls at once (e.g. summaryData.js's Promise.all) still
// only issue one network request per key. Resolved via /api/preferences's
// ?resolveSheetKey=<key> branch (works for ANY signed-in user, admin or
// viewer) rather than the plain ?global=1 blob, which is filtered to a
// PUBLIC_KEYS allowlist for non-admins and never includes sheet_url_* keys --
// using that here would silently make a viewer's page ignore an admin's
// saved sheet-URL override and keep loading the hardcoded default.
const urlCache = new Map() // prefKey -> { url, at }
const inFlight = new Map() // prefKey -> Promise<string|null>
const TTL = 60 * 1000

async function fetchResolvedUrl(prefKey) {
    const now = Date.now()
    const hit = urlCache.get(prefKey)
    if (hit && now - hit.at < TTL) return hit.url
    if (inFlight.has(prefKey)) return inFlight.get(prefKey)

    const p = (async () => {
        try {
            const r = await fetch(`/api/preferences?resolveSheetKey=${encodeURIComponent(prefKey)}`, { credentials: 'include' })
            const data = r.ok ? await r.json() : { url: null }
            urlCache.set(prefKey, { url: data.url || null, at: Date.now() })
            return data.url || null
        } catch (_) {
            return null
        } finally {
            inFlight.delete(prefKey)
        }
    })()
    inFlight.set(prefKey, p)
    return p
}

// Returns the admin-configured URL for `sourceKey` if one has been saved,
// otherwise falls back to `fallbackUrl` (the hard-coded default in the page).
export async function resolveSheetUrl(sourceKey, fallbackUrl) {
    const prefKey = SHEET_PREF_KEYS[sourceKey]
    if (!prefKey) return fallbackUrl
    const override = await fetchResolvedUrl(prefKey)
    return (override && String(override).trim()) || fallbackUrl
}

export function invalidateSheetPrefsCache() {
    urlCache.clear()
    inFlight.clear()
}
