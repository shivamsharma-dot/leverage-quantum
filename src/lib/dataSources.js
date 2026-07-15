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
}

let cached = null
let cachedAt = 0
const TTL = 60 * 1000

async function loadPrefs() {
    const now = Date.now()
    if (cached && now - cachedAt < TTL) return cached
    try {
          const r = await fetch('/api/preferences?global=1', { credentials: 'include' })
          const data = r.ok ? await r.json() : { prefs: {} }
                cached = data.prefs || {}
                      cachedAt = now
    } catch (_) {
          cached = cached || {}
    }
    return cached
}

// Returns the admin-configured URL for `sourceKey` if one has been saved,
// otherwise falls back to `fallbackUrl` (the hard-coded default in the page).
export async function resolveSheetUrl(sourceKey, fallbackUrl) {
    const prefs = await loadPrefs()
    const prefKey = SHEET_PREF_KEYS[sourceKey]
    const override = prefKey && prefs[prefKey]
    return (override && String(override).trim()) || fallbackUrl
}

export function invalidateSheetPrefsCache() {
    cached = null
}
