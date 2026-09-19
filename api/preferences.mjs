import { getSessionUser, supabaseAdmin } from '../lib/auth.mjs'
import { SHEET_PREF_KEYS } from '../src/lib/dataSources.js'

const ALLOWED_SHEET_KEYS = new Set(Object.values(SHEET_PREF_KEYS))

// GET  /api/preferences — returns the public/admin-visible preference keys
// POST /api/preferences — saves a preference key (admin only)

export default async function handler(req, res) {
  const me = getSessionUser(req)

  // Unauthenticated requests — the login page has no per-org style pick left
  // to fetch (that was only ever the now-removed login design-style picker),
  // so there is nothing an unauthenticated caller is allowed to read here.
  if (!me) {
    return res.status(401).json({ error: 'Not signed in' })
  }

  // GET (authenticated) ?resolveOverallSheet=1 — any signed-in user (not just admin)
  // can resolve the "Overall PM" sheet URL specifically, since the Overall dashboard
  // itself is viewable by non-admins. Returns ONLY the resolved URL string -- never the
  // raw custom_data_sources list or any other source's URL -- so this doesn't reopen
  // the sheet-URL exposure the PUBLIC_KEYS allowlist below is deliberately guarding
  // against. Without this, resolveOverallUrl() on the frontend silently fell back to
  // the hardcoded DEFAULT_URL for every non-admin session, loading the wrong/stale
  // sheet (zero real rows) instead of the admin-configured live one.
  if (req.method === 'GET' && req.query.resolveOverallSheet === '1') {
    const r = await supabaseAdmin('app_preferences?select=value&key=eq.custom_data_sources')
    const rows = r.ok ? await r.json() : []
    const custom = Array.isArray(rows[0]?.value) ? rows[0].value : []
    const entry = custom.find(s => /mainData/i.test(s.defaultUrl || '') || /overall/i.test(s.name || ''))
    if (!entry) return res.status(200).json({ url: null })
    if (entry.editKey) {
      const r2 = await supabaseAdmin(`app_preferences?select=value&key=eq.${entry.editKey}`)
      const rows2 = r2.ok ? await r2.json() : []
      if (rows2[0]?.value) return res.status(200).json({ url: rows2[0].value })
    }
    return res.status(200).json({ url: entry.defaultUrl || null })
  }

  // GET (authenticated, admin only) ?resolveGazetteHtml=1 — the Quantum Gazette's
  // stored HTML snapshot for the Settings > Reports "Send now" card. Kept out of
  // the general bulk GET below (LARGE_KEYS) so an ordinary Settings load doesn't
  // drag a ~180KB blob along with every other preference on every page view; this
  // dedicated branch is only ever called when the Reports tab actually needs it.
  if (req.method === 'GET' && req.query.resolveGazetteHtml === '1') {
    if (me.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
    const r = await supabaseAdmin('app_preferences?select=value,updated_at&key=eq.gazette_html')
    const rows = r.ok ? await r.json() : []
    return res.status(200).json({ html: rows[0]?.value || null, updatedAt: rows[0]?.updated_at || null })
  }

  // GET (authenticated) ?resolveSheetKey=<sheet_url_...> — any signed-in user
  // can resolve a specific sheet-source override by key (see SHEET_PREF_KEYS in
  // src/lib/dataSources.js). Returns ONLY that one resolved URL string, never the
  // full preferences blob, so this doesn't reopen the exposure the PUBLIC_KEYS
  // allowlist below is guarding against. Needed because a non-admin/viewer
  // session's plain GET falls into the PUBLIC_KEYS-filtered branch below, which
  // excludes every sheet_url_* key -- without this, resolveSheetUrl() on the
  // frontend silently couldn't see an admin's saved sheet-URL override and kept
  // falling back to the page's hardcoded default sheet (same root cause as the
  // Overall dashboard's resolveOverallSheet=1 fix above, generalized here).
  if (req.method === 'GET' && typeof req.query.resolveSheetKey === 'string') {
    const key = req.query.resolveSheetKey
    if (!ALLOWED_SHEET_KEYS.has(key)) return res.status(400).json({ error: 'Unknown sheet key' })
    const r = await supabaseAdmin(`app_preferences?select=value&key=eq.${key}`)
    const rows = r.ok ? await r.json() : []
    return res.status(200).json({ url: rows[0]?.value || null })
  }

  // GET (authenticated) — every signed-in user needs a small set of app-wide
  // keys regardless of role (hidden_pages for the Sidebar, the 3 design-style
  // picks so Button/KPI/Login look consistent for everyone). Everything else
  // in app_preferences (sheet URLs, Slack webhook, report sender config, AI
  // budget, etc.) is admin-only config and must not leak to a non-admin viewer,
  // including a custom viewer granted zero dashboards.
  // Server-only rows. The CEO PIN record is a verifier rather than a PIN, but it
  // is still never handed to a browser, and it can never be written through this
  // generic key/value upsert -- it only moves through its own guarded endpoint.
  const SECRET_KEYS = new Set(['slack_ceo_pin'])
  // Large values that have their own dedicated GET branch above and would
  // otherwise ride along with every ordinary Settings preferences load.
  const LARGE_KEYS = new Set(['gazette_html'])

  if (req.method === 'GET') {
    const r = await supabaseAdmin(
      'app_preferences?select=key,value,updated_at&limit=200',
    )
    if (!r.ok) return res.status(500).json({ error: 'Failed to read preferences' })
    const rows = ((await r.json()) || []).filter(row => !SECRET_KEYS.has(row.key) && !LARGE_KEYS.has(row.key))
    // affiliate_spend_manual must be readable by every signed-in user (not just
    // admins) -- the Overall dashboard is viewable by non-admins too, and it
    // needs this value to compute Affiliate's totals correctly for everyone.
    // slack_test_channels is the named-test-channel list for the Send to Slack
    // picker on that same page -- channel ids/names are documented as non-secret
    // (the real credential is SLACK_BOT_TOKEN, Vercel-env only), so any signed-in
    // user who can see the picker can see which test channels are configured.
    // b2c_rev_vs_cashflow_note is the standing "Revenue vs Cash Flow" note shown
    // on the Daily P&L / Daily Cash Flow pages themselves (both viewable by
    // non-admins) -- plain explanatory copy, not a credential, and the same
    // value both Slack report versions read via ctx.revVsCashflowNote.
    // cost_excluded_campaign_patterns is the Overall dashboard's CPL/CPQL/CPA
    // exclusion list (see src/lib/costExclusions.js) -- just campaign-name
    // substrings + a note, no credential, and every signed-in viewer of that
    // page needs it to compute the same cost figures as everyone else.
    // team_ac_countries/team_sr_countries -- the admin-editable Country
    // suggestion lists for Team Mapping's Admission Consulting/Student
    // Recruitment buckets (see shared/futworkProject.mjs's countrySuggestionsFor).
    // Not secret -- just a list of country names -- and any signed-in user
    // viewing the Roster's Edit modal needs to read them.
    // overall_ac_sales_manual -- the AC Sales count entered directly on Overall's own
    // Send-to-Slack panel (2026-09-10) for its MTD Scorecard report -- deliberately a
    // SEPARATE key from Marketing Review's own ac_sales_manual (the user explicitly
    // asked to "keep both separate": Overall's is the live current month, Marketing
    // Review's is whatever month that deck is reviewing -- they need not agree).
    // Admin-only to WRITE (the POST/PATCH branch below), made publicly READABLE so any
    // signed-in Overall viewer who clicks "Send to Slack" sees a correct figure, not
    // just admins -- same precedent as affiliate_spend_manual just above it.
    // (ac_sales_manual itself no longer needs to be here: only Marketing Review reads/
    // writes it now, and that page is admin-only already.)
    const PUBLIC_KEYS = new Set(['hidden_pages', 'lq_button_style', 'lq_kpi_style', 'affiliate_spend_manual', 'overall_ac_sales_manual', 'slack_test_channels', 'b2c_rev_vs_cashflow_note', 'linkedin_manual', 'x_manual', 'cost_excluded_campaign_patterns', 'team_ac_countries', 'team_sr_countries', 'overall_summary_table_views'])
    const visibleRows = me.role === 'admin' ? rows : rows.filter(row => PUBLIC_KEYS.has(row.key))
    const prefs = Object.fromEntries(visibleRows.map(row => [row.key, row.value]))
    const meta = Object.fromEntries(visibleRows.map(row => [row.key, row.updated_at]))
    return res.status(200).json({ prefs, meta })
  }

  // POST/PATCH — admin only, with one narrow, explicit exception: the Overall
  // dashboard's Funnel Summary table "Saved views" (column layout presets) are a
  // deliberately shared-with-everyone, non-sensitive feature (2026-09-19, direct
  // ask) -- any signed-in user may create/update/delete a view there, not just
  // admins, since a viewer of that page should be able to contribute a layout the
  // whole team can reuse. Every other key is untouched (admin-only, as before).
  if (!['POST', 'PATCH'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PATCH')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const { key, value } = req.body || {}
  if (!key) return res.status(400).json({ error: 'key is required' })
  const SHARED_WRITE_KEYS = new Set(['overall_summary_table_views'])
  if (me.role !== 'admin' && !SHARED_WRITE_KEYS.has(key)) {
    return res.status(403).json({ error: 'Admin only' })
  }
  if (SECRET_KEYS.has(key)) return res.status(403).json({ error: 'That key is only settable through its own endpoint' })

  // Upsert into app_preferences
  const r = await supabaseAdmin('app_preferences', {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      key,
      value,
      updated_by: me.email,
      updated_at: new Date().toISOString(),
    }),
  })
  if (!r.ok) {
    const err = await r.text()
    return res.status(500).json({ error: 'Failed to save: ' + err })
  }
  return res.status(200).json({ success: true })
}
