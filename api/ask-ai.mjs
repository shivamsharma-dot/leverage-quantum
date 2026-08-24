// api/ask-ai.mjs -- Ask AI - Production - Claude-powered - SSE streaming - Meta/Google/CRM Tool Use

// Renamed .js -> .mjs (2026-07-25): as a .js file with no "type":"module" in package.json,
// Vercel decided whether to ESM-transform this file via a fragile build-time heuristic --
// it silently stopped doing so on one deploy (no code change explains it), crashing every
// request with "SyntaxError: Unexpected token 'export'" in the CJS loader. A real .mjs file
// is unambiguously ESM to Node/Vercel with no heuristic involved. Auth helpers are now a
// normal static import (the old dynamic import() was itself a workaround for the .js/CJS
// ambiguity, no longer needed now that this file is genuinely ESM).

import { getSessionUser, canAccessDashboard } from '../lib/auth.mjs'

// analyze_campaign_contribution's underlying sheet fetch alone can take up to 45s (see
// fetchOverallSheetRows) on top of multiple Claude round-trips -- match send-report.js's own
// explicit maxDuration rather than relying on the platform default.
export const maxDuration = 60

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-5'
const TOOL_MODEL = MODEL // NOTE: intermediate rounds must call tools reliably; Haiku returned text without tool_use (leaked model name to user). Keep on MODEL.
const SB_URL = process.env.SUPABASE_URL || 'https://tsyekthwthxszmsgqfej.supabase.co'
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// USD per 1M tokens -- Sonnet-tier public pricing. This is an ESTIMATE for the Settings > Ask AI
// cost dashboard, not a real Anthropic billing read (no such API is exposed to a server API key) --
// the raw token counts logged to ask_ai_usage are the source of truth; re-derive cost from those
// if pricing ever changes rather than trusting old estimated_cost_usd rows.
const PRICING = { 'claude-sonnet-4-5': { input: 3.00, output: 15.00 } }
function estimateCost(model, inputTokens, outputTokens) {
  const p = PRICING[model] || PRICING['claude-sonnet-4-5']
  return (inputTokens / 1e6) * p.input + (outputTokens / 1e6) * p.output
}

// -- Settings > Ask AI: tool-call audit log + token/cost usage logging --------
// Fire-and-forget-but-awaited (short timeout) writes via the service-role key; failures are
// swallowed so a logging hiccup never breaks the actual chat response. Reads happen straight from
// the frontend via the anon key (same pattern as report_logs/source_health) -- no read endpoint here.
function resultRowCount(result) {
  if (!result || result.error) return 0
  if (typeof result.count === 'number') return result.count
  if (typeof result.rows === 'number') return result.rows
  for (const k of ['campaigns', 'adGroups', 'keywords', 'searchTerms', 'points', 'data', 'contributors', 'rows']) {
    if (Array.isArray(result[k])) return result[k].length
  }
  return null
}

async function logToolCall({ convId, userId, toolName, params, rowCount, latencyMs, hadError }) {
  if (!SB_KEY) return
  try {
    await fetch(`${SB_URL}/rest/v1/ask_ai_tool_calls`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        conv_id: convId || null, user_id: userId || null, tool_name: toolName,
        params: JSON.stringify(params || {}).slice(0, 2000), row_count: rowCount == null ? null : rowCount,
        latency_ms: latencyMs, had_error: !!hadError, created_at: new Date().toISOString()
      }),
      signal: AbortSignal.timeout(5000)
    })
  } catch {}
}

// Plain-English one-liner for the "what I checked" trace shown above an answer
// (collapsed by default in the UI) — ThoughtSpot Spotter and Perplexity both treat
// this kind of verifiability as a trust feature, not clutter, for a numbers tool.
function buildToolSummary(name, input) {
  input = input || {}
  const range = input.time_range ? `${input.time_range.since} to ${input.time_range.until}`
    : input.date_preset || (input.from && input.to ? `${input.from} to ${input.to}` : input.dateRange) || (input.since || input.until ? `${input.since||'start'} to ${input.until||'now'}` : 'last 30d')
  if (name === 'query_meta_ads') return `Checked Meta ${input.level || 'account'} data (${range})`
  if (name === 'query_google_ads') return `Checked Google Ads ${input.tab || 'data'} (${range})`
  if (name === 'query_meta_crm_leads') return `Checked Meta CRM leads (${range})`
  if (name === 'query_google_crm_leads') return `Checked Google CRM leads (${range})`
  if (name === 'analyze_campaign_contribution') return `Ranked campaign contribution to QL change (${input.previous_since || '?'}..${input.previous_until || '?'} vs ${input.current_since || '?'}..${input.current_until || '?'})`
  if (name === 'get_overall_totals') return `Checked Overall totals${input.group_by === 'source' ? ' by source' : ''} (${input.since || '?'} to ${input.until || '?'})`
  return `Ran ${name}`
}

async function logUsage({ convId, userId, model, inputTokens, outputTokens }) {
  if (!SB_KEY) return
  try {
    const cost = estimateCost(model, inputTokens, outputTokens)
    await fetch(`${SB_URL}/rest/v1/ask_ai_usage`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        conv_id: convId || null, user_id: userId || null, model,
        input_tokens: inputTokens || 0, output_tokens: outputTokens || 0,
        estimated_cost_usd: +cost.toFixed(4), created_at: new Date().toISOString()
      }),
      signal: AbortSignal.timeout(5000)
    })
  } catch {}
}

const AD_ACCOUNT = 'act_641914389215638'
const CRM_SHEET_BASE = 'https://docs.google.com/spreadsheets/d/1r-e6pBCN5ysfeD3Eq6sxgLmf97mdeTtloMPylqnx6Ew/gviz/tq?tqx=out:csv&sheet='
const FB_LEADS_SHEET = CRM_SHEET_BASE + 'FBleads'
const GOOGLE_LEADS_SHEET = CRM_SHEET_BASE + 'googleleads'
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_IDX = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 }

// -- helpers -------------------------------------------------------------------
async function safeFetch(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(9000) })
    return r.ok ? r : null
  } catch { return null }
}

// Phase 2 of the agent-upgrade roadmap: an admin-editable "how the business talks
// about itself" block (Settings > Ask AI > Business Context), folded into every
// system prompt so narrative copy reflects it -- deliberately NOT the app's own
// fixed navy/blue/cyan/green brand identity (see DESIGN_SYSTEM.md), which stays
// hardcoded on purpose.
async function getBusinessContext() {
  if (!SB_URL || !SB_KEY) return null
  try {
    const r = await fetch(`${SB_URL}/rest/v1/app_preferences?select=value&key=eq.business_context&limit=1`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, signal: AbortSignal.timeout(5000)
    })
    if (!r.ok) return null
    const d = await r.json()
    const v = d && d[0] && d[0].value
    return (v && typeof v === 'object') ? v : null
  } catch { return null }
}

async function getSheetOverride(key) {
  if (!SB_URL || !SB_KEY) return null
  try {
    const r = await fetch(`${SB_URL}/rest/v1/app_preferences?select=value&key=eq.${key}&limit=1`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
      signal: AbortSignal.timeout(5000)
    })
    if (!r.ok) return null
    const d = await r.json()
    const v = d && d[0] && d[0].value
    return (v && String(v).trim()) || null
  } catch { return null }
}

function parseCSV(csv) {
  if (!csv?.trim()) return { h: () => -1, rows: [] }
  const lines = csv.trim().split('\n').map(line => {
    const cols = []; let buf = '', inQ = false
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ }
      else if (ch === ',' && !inQ) { cols.push(buf.trim()); buf = '' }
      else buf += ch
    }
    cols.push(buf.trim()); return cols
  })
  const [hdr, ...rows] = lines
  return { h: k => hdr.map(x => x.toLowerCase().trim()).indexOf(k.toLowerCase()), rows }
}

function fmtINR(n) {
  const x = parseFloat(n) || 0
  if (x >= 1e7) return '₹' + (x/1e7).toFixed(2) + ' Cr'
  if (x >= 1e5) return '₹' + (x/1e5).toFixed(1) + 'L'
  if (x >= 1000) return '₹' + (x/1e3).toFixed(0) + 'K'
  return '₹' + Math.round(x).toLocaleString('en-IN')
}

// Parse 'DD-Mon-YYYY' (e.g. 02-Jul-2026) -> 'YYYY-MM-DD'. Returns null if unparseable.
function crmDateToIso(d) {
  if (!d) return null
  const m = String(d).replace(/"/g,'').trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/)
  if (!m) return null
  const mon = MONTH_IDX[m[2].toLowerCase()]
  if (mon == null) return null
  return m[3] + '-' + String(mon+1).padStart(2,'0') + '-' + String(m[1]).padStart(2,'0')
}

function monthLabelFromIso(iso) {
  if (!iso) return ''
  const p = iso.split('-')
  const mo = parseInt(p[1]) - 1
  return (mo>=0 && mo<12) ? MONTHS[mo] + ' ' + p[0] : ''
}

// -- get Meta token from Supabase if not provided -----------------------------
async function getTokenFromSupabase() {
  if (!SB_KEY) return null
  try {
    const r = await fetch(`${SB_URL}/rest/v1/meta_tokens?select=token&order=created_at.desc&limit=1`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
      signal: AbortSignal.timeout(5000)
    })
    if (!r.ok) return null
    const d = await r.json()
    return d?.[0]?.token || null
  } catch { return null }
}

// -- CRM leads fetchers (from published Google Sheets) -------------------------
// Meta CRM leads live in the FBleads sheet; Google CRM leads in the googleleads sheet.
// Columns: lead_created_date (DD-Mon-YYYY), opp_first_campaign_name (ad/campaign name), leads.
// since/until are 'YYYY-MM-DD' and filter by lead_created_date.
async function fetchCrmLeads(sheetUrl, { since, until } = {}) {
  const r = await safeFetch(sheetUrl)
  if (!r) return { error: 'sheet fetch failed', byName: {}, byMonth: {}, total: 0, rows: 0 }
  const { h, rows } = parseCSV(await r.text())
  const di = h('lead_created_date'), ni = h('opp_first_campaign_name'), li = h('leads')
  const byName = {}, byMonth = {}
  let total = 0, kept = 0
  for (const row of rows) {
    const name = (row[ni] || '').trim()
    if (!name) continue
    const iso = crmDateToIso(row[di])
    if (since || until) {
      if (!iso) continue
      if (since && iso < since) continue
      if (until && iso > until) continue
    }
    const n = parseInt(String(row[li] || '0').replace(/[^0-9-]/g, ''), 10) || 0
    byName[name] = (byName[name] || 0) + n
    if (iso) { const ml = monthLabelFromIso(iso); if (ml) byMonth[ml] = (byMonth[ml] || 0) + n }
    total += n; kept++
  }
  return { byName, byMonth, total, rows: kept, distinct: Object.keys(byName).length }
}

function crmSummaryLines(label, data) {
  if (data.error) return `${label}: UNAVAILABLE (${data.error})`
  if (!data.total) return `${label}: no attributed leads found in sheet`
  const months = Object.keys(data.byMonth).sort((a,b) => {
    const pa = a.split(' '), pb = b.split(' ')
    return (pa[1]+String(MONTHS.indexOf(pa[0])).padStart(2,'0')).localeCompare(pb[1]+String(MONTHS.indexOf(pb[0])).padStart(2,'0'))
  }).slice(-4)
  const lines = [`${label} (all-time attributed):`]
  lines.push(`  Total CRM leads: ${data.total.toLocaleString()} across ${data.distinct} campaigns/ads`)
  if (months.length) {
    lines.push(`  RECENT MONTHS:`)
    months.forEach(m => lines.push(`    ${m}: ${data.byMonth[m].toLocaleString()} leads`))
  }
  const top = Object.entries(data.byName).sort((a,b) => b[1]-a[1]).slice(0,8)
  if (top.length) {
    lines.push(`  TOP CAMPAIGNS/ADS BY CRM LEADS:`)
    top.forEach(([n,v]) => lines.push(`    - ${n}: ${v.toLocaleString()} leads`))
  }
  return lines.join('\n')
}

// -- Campaign contribution/attribution analysis (Overall PM funnel sheet) -----
// Same "Overall PM" sheet the Overall dashboard reads (one row per lead/day/source/campaign,
// spanning the full acquisition-to-revenue funnel). Total QL here is Quantum's authoritative
// figure (Futwork Human QL + Futwork AI QL + Superbot AI QL combined) -- not Meta's/Google's
// own in-platform lead count. Resolution mirrors api/preferences.mjs's ?resolveOverallSheet=1
// branch (admin can repoint the sheet from Settings > Data without a code change).
const OVERALL_SHEET_DEFAULT_URL = 'https://docs.google.com/spreadsheets/d/1kaoWMGBbttOtaeVfaSXhrxcs0_pe5xLX1tMuIG8mHG4/gviz/tq?tqx=out:csv&sheet=MainData'
async function resolveOverallSheetUrl() {
  if (!SB_URL || !SB_KEY) return OVERALL_SHEET_DEFAULT_URL
  try {
    const r = await fetch(`${SB_URL}/rest/v1/app_preferences?select=value&key=eq.custom_data_sources`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, signal: AbortSignal.timeout(5000)
    })
    if (!r.ok) return OVERALL_SHEET_DEFAULT_URL
    const rows = await r.json()
    const custom = Array.isArray(rows[0]?.value) ? rows[0].value : []
    const entry = custom.find(s => /mainData/i.test(s.defaultUrl || '') || /overall/i.test(s.name || ''))
    if (!entry) return OVERALL_SHEET_DEFAULT_URL
    if (entry.editKey) {
      const r2 = await fetch(`${SB_URL}/rest/v1/app_preferences?select=value&key=eq.${entry.editKey}`, {
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, signal: AbortSignal.timeout(5000)
      })
      const rows2 = r2.ok ? await r2.json() : []
      if (rows2[0]?.value) return rows2[0].value
    }
    return entry.defaultUrl || OVERALL_SHEET_DEFAULT_URL
  } catch { return OVERALL_SHEET_DEFAULT_URL }
}
function numFrom(v, isFloat) {
  const n = (isFloat ? parseFloat : parseInt)(String(v ?? '0').replace(isFloat ? /[^0-9.-]/g : /[^0-9-]/g, ''), 10)
  return isNaN(n) ? 0 : n
}
// This sheet is ~26MB / 180k+ rows (one row per lead/day/source/campaign) -- it alone can take
// ~25-30s to download, far past safeFetch's 9s timeout (fine for the small CRM sheets, not this
// one). Cache the parsed rows in-memory for a short window so a single contribution call (which
// needs the sheet twice, for the current AND previous period) shares one download instead of two,
// and a follow-up question within the same warm Lambda instance doesn't re-download at all.
let _overallSheetCache = null // { url, rows, h, ts }
let _overallSheetInflight = null // Promise, so two concurrent callers (current + previous period) share one download
const OVERALL_SHEET_CACHE_TTL_MS = 5 * 60 * 1000
async function fetchOverallSheetRows() {
  const url = await resolveOverallSheetUrl()
  if (_overallSheetCache && _overallSheetCache.url === url && Date.now() - _overallSheetCache.ts < OVERALL_SHEET_CACHE_TTL_MS) {
    return _overallSheetCache
  }
  if (_overallSheetInflight) return _overallSheetInflight
  _overallSheetInflight = (async () => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(55000) })
      if (!res.ok) return null
      const { h, rows } = parseCSV(await res.text())
      const entry = { url, rows, h, ts: Date.now() }
      _overallSheetCache = entry
      return entry
    } catch { return null }
    finally { _overallSheetInflight = null }
  })()
  return _overallSheetInflight
}
// Raw "Source" values on the sheet -> the 5 named channels the business actually
// thinks in (anything else -- Offline/Bing/Branding/Referral/Linkedin/etc -- buckets
// into 'Other' rather than being silently dropped or mislabeled).
const CHANNEL_LABELS = {
  Facebook: 'Meta Ads',
  Google: 'Google Ads',
  Remarketing: 'Remarketing',
  Affiliate: 'Affiliate',
  'Content+Brand': 'Organic',
}
function mapChannel(source) { return CHANNEL_LABELS[(source || '').trim()] || 'Other' }

// Phase 0 of the agent-upgrade roadmap: overall_funnel_daily is an hourly-synced Supabase
// cache of this same sheet, pre-aggregated to (campaign, date, source) by .github/workflows/
// overall-funnel-sync.yml. Reading it is orders of magnitude faster than the live 26MB CSV
// path below (a single indexed date-range query vs. downloading+parsing ~180k raw rows), so
// it's tried first; the CSV path remains as a correctness-preserving fallback for as long as
// the cache table doesn't exist yet or a query against it fails for any reason.
async function fetchOverallCampaignTotalsFromCache({ since, until }) {
  if (!SB_URL || !SB_KEY) return null
  try {
    const params = new URLSearchParams({ select: 'campaign,source,leads,queued,total_ql,spend', order: 'campaign.asc' })
    if (since) params.set('date', `gte.${since}`)
    if (until) params.append('date', `lte.${until}`) // URLSearchParams keeps both 'date' entries -- PostgREST ANDs repeated keys
    const url = `${SB_URL}/rest/v1/overall_funnel_daily?${params.toString()}`
    // Supabase's hosted PostgREST caps every response at 1000 rows server-side
    // (db-max-rows) regardless of any client-requested `limit` -- a single
    // request here silently truncated a 7-day window's ~7-8k (campaign,date,source)
    // rows down to an arbitrary first-1000 slice, producing wrong totals in
    // whatever order the DB happened to return (not date/campaign order).
    // Paginate with the Range header until a page comes back short of 1000.
    const PAGE = 1000
    let offset = 0, allRows = []
    for (let guard = 0; guard < 50; guard++) { // 50 * 1000 = 50k row safety valve
      const r = await fetch(url, {
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Range: `${offset}-${offset + PAGE - 1}` },
        signal: AbortSignal.timeout(8000),
      })
      if (!r.ok) return null // a mid-pagination failure must not silently return a partial total
      const page = await r.json()
      if (!Array.isArray(page)) return null
      allRows = allRows.concat(page)
      if (page.length < PAGE) break
      offset += PAGE
    }
    if (allRows.length === 0) return null
    const byCampaign = {}
    for (const row of allRows) {
      const campaign = (row.campaign || '').trim()
      if (!campaign) continue
      const e = byCampaign[campaign] || { campaign, channel: mapChannel(row.source), leads: 0, queued: 0, totalQL: 0, spend: 0 }
      e.leads += Number(row.leads) || 0
      e.queued += Number(row.queued) || 0
      e.totalQL += Number(row.total_ql) || 0
      e.spend += Number(row.spend) || 0
      byCampaign[campaign] = e
    }
    return { byCampaign }
  } catch { return null }
}
async function fetchOverallCampaignTotals({ since, until }) {
  const cached = await fetchOverallCampaignTotalsFromCache({ since, until })
  if (cached) return cached
  const sheet = await fetchOverallSheetRows()
  if (!sheet) return { error: 'Overall funnel sheet fetch failed (timed out or unreachable)' }
  const { h, rows } = sheet
  const di = h('lead_date'), ci = h('campaign_name'), si = h('source')
  // 'Queued on Futwork' was renamed to 'Queued on Futwork Human' and a new
  // 'Queued on Futwork AI' column was added on 2026-08-19/20 (the underlying leads
  // didn't move provider, only the label naming which Futwork channel queued them --
  // see OverallDashboard.jsx's mapRow() and overall-funnel-sync.yml for the same
  // rename). This live-sheet fallback still looked up the old single column, which
  // silently returns -1/undefined after the rename, so 'queued' on this path was
  // undercounting by the entire Futwork volume (~97k/month) -- the exact bug already
  // fixed on overall-funnel-sync.yml's own copy of this same aggregation.
  //
  // C3 fix (2026-08-21): 'queued' used to also sum floor_queued, which the Overall
  // dashboard's own 'Total Queued' KPI deliberately excludes (Floor-distributed leads
  // never went through Futwork/Superbot qualification, so they never had a chance to
  // become a QL). Excluding it here matches the dashboard, which is the primary surface
  // -- same decision, same fix, applied to overall-funnel-sync.yml's copy of this logic.
  const li = h('total leads generated'), qfh = h('queued on futwork human'), qfa = h('queued on futwork ai'), qs = h('queued on superbot')
  const hql = h('futwork human ql'), faq = h('futwork ai ql'), saq = h('superbot ai ql'), sp = h('total_spends')
  const byCampaign = {}
  for (const row of rows) {
    const iso = crmDateToIso(row[di])
    if (!iso) continue
    if (since && iso < since) continue
    if (until && iso > until) continue
    const campaign = (row[ci] || '').trim()
    if (!campaign) continue
    const e = byCampaign[campaign] || { campaign, channel: mapChannel(row[si]), leads: 0, queued: 0, totalQL: 0, spend: 0 }
    e.leads += numFrom(row[li])
    e.queued += numFrom(row[qfh]) + numFrom(row[qfa]) + numFrom(row[qs])  // excludes floor_queued -- see C3 note above
    e.totalQL += numFrom(row[hql]) + numFrom(row[faq]) + numFrom(row[saq])
    e.spend += numFrom(row[sp], true)
    byCampaign[campaign] = e
  }
  return { byCampaign }
}

// A direct "what was X for period Y" answer -- account-wide, or split by
// Source -- as opposed to analyzeCampaignContribution above, which is only
// for a "why did it change between two periods" campaign-level ranking.
// Reads the same hourly-synced overall_funnel_daily cache; no live-sheet
// fallback (a plain totals question doesn't justify a 45s CSV download when
// the cache is briefly stale -- it just returns an error to say so).
async function fetchOverallTotals({ since, until, group_by, campaign_contains }) {
  if (!since || !until) return { error: 'since and until are both required (YYYY-MM-DD).' }
  if (!SB_URL || !SB_KEY) return { error: 'Overall data cache is not configured.' }
  try {
    const params = new URLSearchParams({ select: 'campaign,source,leads,queued,total_ql,spend,apps,offers,deposits,raus' })
    params.set('date', `gte.${since}`)
    params.append('date', `lte.${until}`)
    const url = `${SB_URL}/rest/v1/overall_funnel_daily?${params.toString()}`
    const PAGE = 1000
    let offset = 0, allRows = []
    for (let guard = 0; guard < 50; guard++) {
      const r = await fetch(url, {
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Range: `${offset}-${offset + PAGE - 1}` },
        signal: AbortSignal.timeout(8000),
      })
      if (!r.ok) return { error: 'Overall cache query failed (HTTP ' + r.status + ').' }
      const page = await r.json()
      if (!Array.isArray(page)) return { error: 'Overall cache query returned an unexpected shape.' }
      allRows = allRows.concat(page)
      if (page.length < PAGE) break
      offset += PAGE
    }
    if (!allRows.length) return { error: 'No Overall data found for ' + since + ' to ' + until + '.' }
    let rows = allRows
    if (campaign_contains) {
      const needle = String(campaign_contains).toLowerCase()
      rows = rows.filter(r => (r.campaign || '').toLowerCase().includes(needle))
      if (!rows.length) return { error: 'No campaigns matching "' + campaign_contains + '" found for ' + since + ' to ' + until + '.' }
    }
    const mode = group_by === 'source' ? 'source' : group_by === 'campaign' ? 'campaign' : 'none'
    const buckets = {}
    for (const row of rows) {
      const key = mode === 'source' ? mapChannel(row.source) : mode === 'campaign' ? ((row.campaign || '').trim() || 'Unknown') : 'All'
      const e = buckets[key] || (buckets[key] = { label: key, spend: 0, leads: 0, totalQL: 0, apps: 0, offers: 0, deposits: 0, raus: 0 })
      e.spend += Number(row.spend) || 0
      e.leads += Number(row.leads) || 0
      e.totalQL += Number(row.total_ql) || 0
      e.apps += Number(row.apps) || 0
      e.offers += Number(row.offers) || 0
      e.deposits += Number(row.deposits) || 0
      e.raus += Number(row.raus) || 0
      buckets[key] = e
    }
    const outRows = Object.values(buckets).map(e => ({
      ...e,
      spend: Math.round(e.spend),
      cpl: e.leads > 0 ? Math.round(e.spend / e.leads) : null,
      cpql: e.totalQL > 0 ? Math.round(e.spend / e.totalQL) : null,
      cpa: e.apps > 0 ? Math.round(e.spend / e.apps) : null,
    })).sort((a, b) => b.spend - a.spend)
    return { since, until, group_by: mode, campaign_filter: campaign_contains || null, matched_campaigns: campaign_contains ? new Set(rows.map(r => r.campaign)).size : undefined, rows: outRows }
  } catch (e) { return { error: e.message || 'Overall cache query failed.' } }
}
async function analyzeCampaignContribution({ current_since, current_until, previous_since, previous_until, top_n, channel }) {
  if (!current_since || !current_until || !previous_since || !previous_until) {
    return { error: 'current_since, current_until, previous_since, and previous_until are all required (YYYY-MM-DD).' }
  }
  const [cur, prev] = await Promise.all([
    fetchOverallCampaignTotals({ since: current_since, until: current_until }),
    fetchOverallCampaignTotals({ since: previous_since, until: previous_until }),
  ])
  if (cur.error || prev.error) return { error: cur.error || prev.error }
  const names = new Set([...Object.keys(cur.byCampaign), ...Object.keys(prev.byCampaign)])
  const empty = { leads: 0, queued: 0, totalQL: 0, spend: 0 }
  let rows = [...names].map(name => {
    const c = cur.byCampaign[name] || empty, p = prev.byCampaign[name] || empty
    const ch = cur.byCampaign[name]?.channel || prev.byCampaign[name]?.channel || 'Other'
    const qlRate = c.leads > 0 ? Math.round((c.totalQL / c.leads) * 1000) / 10 : null
    const cpql = c.totalQL > 0 ? Math.round(c.spend / c.totalQL) : null
    return { campaign: name, channel: ch, currentQL: c.totalQL, previousQL: p.totalQL, deltaQL: c.totalQL - p.totalQL, currentSpend: Math.round(c.spend), qlRate, cpql }
  })
  if (channel && channel !== 'All') rows = rows.filter(r => r.channel === channel)
  const totalAbsDelta = rows.reduce((s, r) => s + Math.abs(r.deltaQL), 0) || 1
  const median = arr => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null }
  // Medians are computed PER CHANNEL, not globally -- Affiliate is naturally
  // zero-spend at real scale (100k+ rows in the raw sheet) and a global CPQL
  // median across all channels gets dragged toward ~0 by that volume alone,
  // making every genuinely-paid Meta/Google campaign look artificially cheap.
  // Comparing a campaign only against other campaigns in its own channel
  // (mirrors the NAS spec's "same platform" benchmark rule) fixes that.
  const channelStats = {}
  for (const ch of new Set(rows.map(r => r.channel))) {
    const chRows = rows.filter(r => r.channel === ch)
    channelStats[ch] = {
      medianQlRate: median(chRows.filter(r => r.qlRate != null).map(r => r.qlRate)),
      medianCpql: median(chRows.filter(r => r.cpql != null).map(r => r.cpql)),
      campaignCount: chRows.length,
    }
  }
  rows.forEach(r => {
    const { medianQlRate, medianCpql } = channelStats[r.channel]
    r.shareOfChangePct = Math.round((r.deltaQL / totalAbsDelta) * 1000) / 10
    const aboveMedianQlRate = r.qlRate != null && medianQlRate != null && r.qlRate >= medianQlRate
    const atOrBelowMedianCpql = r.cpql == null || medianCpql == null || r.cpql <= medianCpql
    const aboveMedianQuality = aboveMedianQlRate && atOrBelowMedianCpql
    const spendWithZeroQL = r.currentQL === 0 && r.currentSpend > 0
    const wayBelowMedianQlRate = r.qlRate != null && medianQlRate != null && r.qlRate < medianQlRate * 0.8
    const wayAboveMedianCpql = r.cpql != null && medianCpql != null && r.cpql > medianCpql * 1.2
    if (r.deltaQL > 0 && aboveMedianQuality && Math.abs(r.shareOfChangePct) >= 5) r.action = 'Scale'
    else if (r.deltaQL >= 0 && aboveMedianQuality) r.action = 'Protect'
    else if (r.deltaQL <= 0 && (spendWithZeroQL || wayBelowMedianQlRate || wayAboveMedianCpql)) r.action = 'Reduce'
    else r.action = 'Investigate'
    const ev = []
    if (r.qlRate != null && medianQlRate != null) ev.push(`QL rate ${r.qlRate}% ${r.qlRate >= medianQlRate ? '>=' : '<'} ${r.channel} median ${medianQlRate}%`)
    if (r.cpql != null && medianCpql != null) ev.push(`CPQL ₹${r.cpql} ${r.cpql <= medianCpql ? '<=' : '>'} ${r.channel} median ₹${medianCpql}`)
    r.evidence = ev.join('; ') || 'insufficient data (zero leads or spend in current period)'
  })
  rows.sort((a, b) => Math.abs(b.deltaQL) - Math.abs(a.deltaQL))
  const limited = rows.slice(0, Math.min(parseInt(top_n) || 15, 30))
  return {
    current_period: { since: current_since, until: current_until },
    previous_period: { since: previous_since, until: previous_until },
    channel: channel || 'All',
    channel_medians: channelStats,
    total_current_QL: rows.reduce((s, r) => s + r.currentQL, 0),
    total_previous_QL: rows.reduce((s, r) => s + r.previousQL, 0),
    contributors: limited,
    count: limited.length,
    summary: `Ranked ${limited.length} of ${rows.length} campaigns by |contribution| to the Total QL change between ${previous_since}..${previous_until} and ${current_since}..${current_until}${channel && channel !== 'All' ? ` (channel: ${channel})` : ' across all channels'}. Action verdicts compare each campaign only against other campaigns in its own channel.`,
  }
}

async function getMetaCrmLeads() {
  try {
    const url = (await getSheetOverride('sheet_url_fbleads')) || FB_LEADS_SHEET
    const data = await fetchCrmLeads(url)
    return crmSummaryLines('META CRM LEADS (FBleads sheet)', data)
  } catch (e) { return `META CRM LEADS ERROR: ${e.message}` }
}

async function getGoogleCrmLeads() {
  try {
    const url = (await getSheetOverride('sheet_url_googleleads')) || GOOGLE_LEADS_SHEET
    const data = await fetchCrmLeads(url)
    return crmSummaryLines('GOOGLE CRM LEADS (googleleads sheet)', data)
  } catch (e) { return `GOOGLE CRM LEADS ERROR: ${e.message}` }
}

// -- Meta Graph API query tool -------------------------------------------------
async function executeMetaQuery(token, { endpoint, fields, date_preset, time_range, level, limit, filters, breakdowns }) {
  if (!token) return { error: 'No Meta token available. Ask user to connect Meta Ads from the Meta Ads dashboard.' }
  try {
    let path = endpoint || `${AD_ACCOUNT}/insights`
    if (!path.includes('/') || path.startsWith('campaigns') || path.startsWith('adsets') || path.startsWith('ads')) {
      path = `${AD_ACCOUNT}/${path}`
    }
    const params = { access_token: token }
    if (fields) params.fields = fields
    if (limit) params.limit = String(Math.min(parseInt(limit)||50, 200))
    if (time_range && typeof time_range === 'object') {
      params.time_range = JSON.stringify(time_range)
    } else if (date_preset) {
      params.date_preset = date_preset
    } else {
      params.date_preset = 'last_30d'
    }
    if (level) params.level = level
    if (breakdowns) params.breakdowns = Array.isArray(breakdowns) ? breakdowns.join(',') : breakdowns
    if (filters) params.filtering = JSON.stringify(Array.isArray(filters) ? filters : [filters])
    const qs = new URLSearchParams(params).toString()
    const url = `https://graph.facebook.com/v19.0/${path}?${qs}`
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
    const data = await res.json()
    if (data.error) {
      return {
        error: `Meta API error: ${data.error.message} (code ${data.error.code})`,
        hint: data.error.code === 190 ? 'Token expired -- user must reconnect from Meta Ads dashboard.' : undefined
      }
    }
    const items = data.data || []
    const paging = data.paging || {}
    return {
      count: items.length,
      has_more: !!paging.next,
      data: items,
      summary: `Fetched ${items.length} records from ${path}${paging.next ? ' (more available)' : ''}`
    }
  } catch (e) {
    return { error: `Fetch failed: ${e.message}` }
  }
}

// -- tool definitions for Claude -----------------------------------------------
const META_TOOL = {
  name: 'query_meta_ads',
  description: `Query Meta Ads Graph API for any data needed to answer the user's question.
The ad account is act_641914389215638 (Leverage Edu).
Use this tool whenever you need:
- Data for specific date ranges (last 7 days, last month, specific month, year-to-date, etc.)
- Ad-level data (creative performance, individual ad metrics)
- Campaign or adset breakdowns by placement, age, gender, device, region
- Custom time ranges (e.g. May 2025, Jan-Mar 2026)
- Metrics not in the initial context (video views, landing page clicks, conversion rates, etc.)
- Comparative data (this week vs last week, this month vs last month)
NOTE: This returns Meta's own in-platform lead counts. For CRM-attributed leads (leads that reached the CRM), use query_meta_crm_leads instead.
You can call this tool multiple times to gather all data needed. Always prefer live data over estimates.`,
  input_schema: {
    type: 'object',
    properties: {
      endpoint: { type: 'string', description: 'API endpoint path relative to account. Examples: "insights" (account-level), "campaigns", "adsets", "ads". Use nested insights like "campaigns?fields=name,status,insights{spend,leads}".' },
      fields: { type: 'string', description: 'Fields to fetch. Insights: spend,impressions,reach,clicks,ctr,cpm,cpp,frequency,actions,action_values,cost_per_action_type,unique_clicks,video_p25_watched_actions,outbound_clicks,landing_page_views. Lists: name,status,objective,daily_budget,lifetime_budget,effective_status,insights{spend,impressions,clicks,ctr,cpm,frequency,reach,actions}' },
      date_preset: { type: 'string', enum: ['today','yesterday','this_week_mon_today','last_week_mon_sun','last_7d','last_14d','last_30d','last_90d','this_month','last_month','last_3d','maximum'], description: 'Predefined date range. Use time_range for specific dates.' },
      time_range: { type: 'object', properties: { since: { type: 'string', description: 'Start date YYYY-MM-DD' }, until: { type: 'string', description: 'End date YYYY-MM-DD' } }, description: 'Custom date range, e.g. {"since":"2025-05-01","until":"2025-05-31"}' },
      level: { type: 'string', enum: ['account','campaign','adset','ad'], description: 'Aggregation level for insights endpoint.' },
      limit: { type: 'integer', description: 'Number of records (max 200). Default 50.' },
      breakdowns: { type: 'array', items: { type: 'string' }, description: 'Break down by: age, gender, country, region, device_platform, publisher_platform, platform_position, impression_device' },
      filters: { type: 'array', items: { type: 'object' }, description: 'Filter records. Example: [{"field":"effective_status","operator":"IN","value":["ACTIVE"]}]' }
    },
    required: ['endpoint']
  }
}

const META_CRM_TOOL = {
  name: 'query_meta_crm_leads',
  description: `Query CRM-attributed Meta leads (from the FBleads CRM sheet). These are leads that actually reached the CRM, attributed to the originating Meta ad/campaign via opp_first_campaign_name. Use this for true funnel/quality analysis (vs Meta in-platform lead counts from query_meta_ads). Optionally filter by date range. Returns totals, month breakdown, and per-campaign/ad lead counts.`,
  input_schema: {
    type: 'object',
    properties: {
      since: { type: 'string', description: 'Start date YYYY-MM-DD (filters lead_created_date). Optional.' },
      until: { type: 'string', description: 'End date YYYY-MM-DD (filters lead_created_date). Optional.' }
    }
  }
}

const GOOGLE_CRM_TOOL = {
  name: 'query_google_crm_leads',
  description: `Query CRM-attributed Google leads (from the googleleads CRM sheet). These are leads that reached the CRM, attributed to the originating Google campaign via opp_first_campaign_name. Use this for true funnel/quality analysis (vs Google in-platform conversions from query_google_ads). Optionally filter by date range. Returns totals, month breakdown, and per-campaign lead counts.`,
  input_schema: {
    type: 'object',
    properties: {
      since: { type: 'string', description: 'Start date YYYY-MM-DD (filters lead_created_date). Optional.' },
      until: { type: 'string', description: 'End date YYYY-MM-DD (filters lead_created_date). Optional.' }
    }
  }
}

const CONTRIBUTION_TOOL = {
  name: 'analyze_campaign_contribution',
  description: `Ranks campaigns by their contribution to a change in Total QL (qualified leads) between two periods. Use this for ANY "why did QLs/leads change", "what's driving the drop/increase", or "which campaigns should I scale vs cut" question -- it replaces manually diffing two raw tool pulls yourself with a single deterministic calculation. For each campaign, computes: current vs previous Total QL, the delta, that campaign's % share of the total change, its Channel (Meta Ads/Google Ads/Remarketing/Affiliate/Organic/Other), QL rate (QL/Leads), CPQL (spend/QL), and a recommended action (Scale/Protect/Reduce/Investigate) by comparing its QL rate and CPQL against the MEDIAN OF ITS OWN CHANNEL for the current period (not a global median -- Affiliate is naturally zero-spend at scale and would otherwise drag a global CPQL median toward zero) -- each action comes with a cited evidence string (e.g. "QL rate 12.2% >= Meta Ads median 9.9%; CPQL ₹772 <= Meta Ads median ₹2,250"). Optionally pass channel to restrict the ranking to one channel only (one of: Meta Ads, Google Ads, Remarketing, Affiliate, Organic, Other) -- omit or pass "All" to rank across every channel at once, each contributor still evaluated against its own channel's median. Pulls from the same "Overall PM" funnel sheet the Overall dashboard uses (one row per lead/day/source/campaign) -- Total QL here is Quantum's authoritative figure (Futwork Human QL + Futwork AI QL + Superbot AI QL combined), not Meta's or Google's own in-platform lead/conversion count.`,
  input_schema: {
    type: 'object',
    properties: {
      current_since: { type: 'string', description: 'Current period start date, YYYY-MM-DD' },
      current_until: { type: 'string', description: 'Current period end date, YYYY-MM-DD' },
      previous_since: { type: 'string', description: 'Comparison period start date, YYYY-MM-DD' },
      previous_until: { type: 'string', description: 'Comparison period end date, YYYY-MM-DD' },
      top_n: { type: 'integer', description: 'Max contributors to return, ranked by |change| descending. Default 15, max 30.' },
      channel: { type: 'string', description: 'Restrict to one channel: Meta Ads, Google Ads, Remarketing, Affiliate, Organic, or Other. Omit or pass "All" for every channel at once.' }
    },
    required: ['current_since', 'current_until', 'previous_since', 'previous_until']
  }
}

const OVERALL_TOTALS_TOOL = {
  name: 'get_overall_totals',
  description: `Returns aggregate Overall-dashboard KPIs -- spend, leads, Total QL, applications, offers, deposits, RAUs, and the derived CPL/CPQL/CPA -- for ONE date range. Use this for a direct "what was X" question (spend/leads/QLs/CPQL for today, yesterday, this month, a named month, etc.) -- NOT for "why did it change", which is analyze_campaign_contribution instead. Reads the same Overall PM funnel data the Overall dashboard itself is built from.

Two independent ways to scope it, usable together:
- group_by splits the totals into rows: "source" for Meta Ads/Google Ads/Remarketing/Affiliate/Organic/Other, "campaign" for one row per distinct matching campaign. Omit or "none" for a single account-wide row.
- campaign_contains filters to campaigns whose NAME contains a given substring (case-insensitive) BEFORE totaling -- use this whenever the user names a specific campaign, product line, or keyword rather than a Source (e.g. "inbound phone call", "MBBS", a corridor name). If the user's term turns out not to match a Source in a prior call, retry with campaign_contains instead of giving up.`,
  input_schema: {
    type: 'object',
    properties: {
      since: { type: 'string', description: 'Start date, YYYY-MM-DD' },
      until: { type: 'string', description: 'End date, YYYY-MM-DD' },
      group_by: { type: 'string', enum: ['none', 'source', 'campaign'], description: 'Omit or "none" for one account-wide row. "source" to split by channel, "campaign" to split by each matching campaign name.' },
      campaign_contains: { type: 'string', description: 'Case-insensitive substring to filter campaign names by, e.g. "inbound phone call". Omit for no campaign filter.' }
    },
    required: ['since', 'until']
  }
}

const GOOGLE_ADS_TOOL = {
  name: 'query_google_ads',
  description: `Query Google Ads for live campaign, ad group, keyword, search term, or trend data. Use this when the initial 30-day summary does not answer the question: specific date ranges, ad group/keyword/search-term detail, or day-by-day/month-by-month trends. NOTE: This returns Google in-platform conversions. For CRM-attributed Google leads, use query_google_crm_leads. Call multiple times if needed. Always prefer live data over estimates.`,
  input_schema: {
    type: 'object',
    properties: {
      tab: { type: 'string', enum: ['campaigns','ad_groups','keywords','search_terms','trend'], description: 'Which Google Ads report to fetch.' },
      dateRange: { type: 'string', enum: ['TODAY','LAST_7_DAYS','LAST_30_DAYS','LAST_90_DAYS','THIS_MONTH','LAST_MONTH'], description: 'Preset date range. Omit and use from/to for a custom range.' },
      from: { type: 'string', description: 'Custom range start date, YYYY-MM-DD. Use with to.' },
      to: { type: 'string', description: 'Custom range end date, YYYY-MM-DD. Use with from.' },
      trendMode: { type: 'string', enum: ['day','month'], description: 'Only for tab=trend: group by day or month. Default day.' }
    },
    required: ['tab']
  }
}

async function getGoogleAdsToken() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_ADS_CLIENT_ID, client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET, refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN, grant_type: 'refresh_token' }),
    signal: AbortSignal.timeout(9000)
  })
  const d = await r.json()
  if (!d.access_token) throw new Error('Google Ads token error: ' + JSON.stringify(d))
  return d.access_token
}

async function gaqlAsk(token, cid, query) {
  const r = await fetch(`https://googleads.googleapis.com/v24/customers/${cid}/googleAds:search`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(9000)
  })
  if (!r.ok) { const e = await r.text(); throw new Error(`Google Ads API ${r.status}: ${e.slice(0,300)}`) }
  const d = await r.json()
  return d.results || []
}

async function executeGoogleAdsQuery({ tab, dateRange, from, to, trendMode }) {
  const miss = ['GOOGLE_ADS_DEVELOPER_TOKEN','GOOGLE_ADS_CLIENT_ID','GOOGLE_ADS_CLIENT_SECRET','GOOGLE_ADS_REFRESH_TOKEN','GOOGLE_ADS_CUSTOMER_ID'].filter(k => !process.env[k])
  if (miss.length) return { error: 'Google Ads is not configured on the server (missing credentials).' }
  try {
    const cid = process.env.GOOGLE_ADS_CUSTOMER_ID.replace(/-/g, '')
    const token = await getGoogleAdsToken()
    const dc = (from && to) ? `segments.date BETWEEN '${from}' AND '${to}'` : `segments.date DURING ${dateRange || 'LAST_30_DAYS'}`
    const mic = v => v ? Math.round(Number(v) / 1e6) : 0
    const pct = v => v ? +Number(v).toFixed(4) : 0
    if (tab === 'campaigns') {
      const rows = await gaqlAsk(token, cid, `SELECT campaign.id,campaign.name,campaign.status,campaign.advertising_channel_type,metrics.cost_micros,metrics.impressions,metrics.clicks,metrics.ctr,metrics.average_cpc,metrics.conversions,metrics.cost_per_conversion,metrics.search_impression_share FROM campaign WHERE ${dc} AND campaign.status != 'REMOVED' ORDER BY metrics.cost_micros DESC LIMIT 100`)
      const campaigns = rows.map(r => ({ id: r.campaign.id, name: r.campaign.name, status: r.campaign.status, type: r.campaign.advertisingChannelType, spend: mic(r.metrics.costMicros), impressions: +r.metrics.impressions || 0, clicks: +r.metrics.clicks || 0, ctr: pct(r.metrics.ctr), avgCpc: mic(r.metrics.averageCpc), conversions: +Number(r.metrics.conversions || 0).toFixed(1), costPerConv: mic(r.metrics.costPerConversion), impressionShare: pct(r.metrics.searchImpressionShare) }))
      return { campaigns, tab: 'campaigns' }
    }
    if (tab === 'ad_groups') {
      const rows = await gaqlAsk(token, cid, `SELECT ad_group.id,ad_group.name,ad_group.status,campaign.name,metrics.cost_micros,metrics.impressions,metrics.clicks,metrics.ctr,metrics.average_cpc,metrics.conversions,metrics.cost_per_conversion FROM ad_group WHERE ${dc} AND ad_group.status != 'REMOVED' ORDER BY metrics.cost_micros DESC LIMIT 200`)
      const adGroups = rows.map(r => ({ id: r.adGroup.id, name: r.adGroup.name, status: r.adGroup.status, campaign: r.campaign.name, spend: mic(r.metrics.costMicros), impressions: +r.metrics.impressions || 0, clicks: +r.metrics.clicks || 0, ctr: pct(r.metrics.ctr), avgCpc: mic(r.metrics.averageCpc), conversions: +Number(r.metrics.conversions || 0).toFixed(1), costPerConv: mic(r.metrics.costPerConversion) }))
      return { adGroups, tab: 'ad_groups' }
    }
    if (tab === 'keywords') {
      const rows = await gaqlAsk(token, cid, `SELECT ad_group_criterion.keyword.text,ad_group_criterion.keyword.match_type,ad_group_criterion.quality_info.quality_score,ad_group_criterion.status,campaign.name,ad_group.name,metrics.cost_micros,metrics.impressions,metrics.clicks,metrics.ctr,metrics.average_cpc,metrics.conversions,metrics.cost_per_conversion,metrics.search_impression_share FROM keyword_view WHERE ${dc} AND ad_group_criterion.status != 'REMOVED' ORDER BY metrics.cost_micros DESC LIMIT 200`)
      const keywords = rows.map(r => ({ text: r.adGroupCriterion.keyword.text, matchType: r.adGroupCriterion.keyword.matchType, status: r.adGroupCriterion.status, qualityScore: (r.adGroupCriterion.qualityInfo && r.adGroupCriterion.qualityInfo.qualityScore) || null, campaign: r.campaign.name, adGroup: r.adGroup.name, spend: mic(r.metrics.costMicros), impressions: +r.metrics.impressions || 0, clicks: +r.metrics.clicks || 0, ctr: pct(r.metrics.ctr), avgCpc: mic(r.metrics.averageCpc), conversions: +Number(r.metrics.conversions || 0).toFixed(1), costPerConv: mic(r.metrics.costPerConversion), impressionShare: pct(r.metrics.searchImpressionShare) }))
      return { keywords, tab: 'keywords' }
    }
    if (tab === 'search_terms') {
      const rows = await gaqlAsk(token, cid, `SELECT search_term_view.search_term,search_term_view.status,campaign.name,ad_group.name,metrics.cost_micros,metrics.impressions,metrics.clicks,metrics.ctr,metrics.average_cpc,metrics.conversions FROM search_term_view WHERE ${dc} ORDER BY metrics.cost_micros DESC LIMIT 200`)
      const searchTerms = rows.map(r => ({ term: r.searchTermView.searchTerm, status: r.searchTermView.status, campaign: r.campaign.name, adGroup: r.adGroup.name, spend: mic(r.metrics.costMicros), impressions: +r.metrics.impressions || 0, clicks: +r.metrics.clicks || 0, ctr: pct(r.metrics.ctr), avgCpc: mic(r.metrics.averageCpc), conversions: +Number(r.metrics.conversions || 0).toFixed(1) }))
      return { searchTerms, tab: 'search_terms' }
    }
    if (tab === 'trend') {
      const mode = trendMode === 'month' ? 'month' : 'day'
      const seg = mode === 'month' ? 'segments.month' : 'segments.date'
      const rows = await gaqlAsk(token, cid, `SELECT ${seg},metrics.cost_micros,metrics.impressions,metrics.clicks,metrics.ctr,metrics.average_cpc,metrics.conversions,metrics.cost_per_conversion FROM customer WHERE ${dc} ORDER BY ${seg} ASC`)
      const points = rows.map(r => ({ period: mode === 'month' ? r.segments.month : r.segments.date, spend: mic(r.metrics.costMicros), impressions: +r.metrics.impressions || 0, clicks: +r.metrics.clicks || 0, ctr: pct(r.metrics.ctr), avgCpc: mic(r.metrics.averageCpc), conversions: +Number(r.metrics.conversions || 0).toFixed(1), costPerConv: mic(r.metrics.costPerConversion) }))
      return { points, tab: 'trend', mode }
    }
    return { error: 'unknown tab: ' + tab }
  } catch (e) {
    return { error: 'Google Ads query failed: ' + e.message }
  }
}

// -- data fetchers (for initial context) ---------------------------------------
async function getGoogleAdsData() {
  const miss = ['GOOGLE_ADS_DEVELOPER_TOKEN','GOOGLE_ADS_CLIENT_ID','GOOGLE_ADS_CLIENT_SECRET','GOOGLE_ADS_REFRESH_TOKEN','GOOGLE_ADS_CUSTOMER_ID'].filter(k => !process.env[k])
  if (miss.length) return 'GOOGLE ADS: NOT CONFIGURED -- server credentials missing.'
  try {
    const cid = process.env.GOOGLE_ADS_CUSTOMER_ID.replace(/-/g, '')
    const token = await getGoogleAdsToken()
    const mic = v => v ? Math.round(Number(v) / 1e6) : 0
    const rows = await gaqlAsk(token, cid, `SELECT campaign.id,campaign.name,campaign.status,campaign.advertising_channel_type,metrics.cost_micros,metrics.impressions,metrics.clicks,metrics.ctr,metrics.average_cpc,metrics.conversions,metrics.cost_per_conversion FROM campaign WHERE segments.date DURING LAST_30_DAYS AND campaign.status != 'REMOVED' ORDER BY metrics.cost_micros DESC LIMIT 20`)
    const camps = rows.map(r => ({ name: r.campaign.name, status: r.campaign.status, type: r.campaign.advertisingChannelType, spend: mic(r.metrics.costMicros), impressions: +r.metrics.impressions || 0, clicks: +r.metrics.clicks || 0, ctr: r.metrics.ctr ? +Number(r.metrics.ctr).toFixed(4) : 0, conversions: +Number(r.metrics.conversions || 0).toFixed(1), costPerConv: mic(r.metrics.costPerConversion) }))
    const total = camps.reduce((t, c) => ({ spend: t.spend + c.spend, impressions: t.impressions + c.impressions, clicks: t.clicks + c.clicks, conversions: t.conversions + c.conversions }), { spend: 0, impressions: 0, clicks: 0, conversions: 0 })
    const ctr = total.impressions ? total.clicks / total.impressions : 0
    const cpl = total.conversions ? total.spend / total.conversions : 0
    const lines = [
      'GOOGLE ADS DATA (last 30 days):',
      `  ACCOUNT OVERVIEW:`,
      `    Spend: ${fmtINR(total.spend)} | Impressions: ${total.impressions.toLocaleString()} | Clicks: ${total.clicks.toLocaleString()}`,
      `    CTR: ${(ctr*100).toFixed(2)}% | Conversions: ${total.conversions.toLocaleString()} | Cost/Conversion: ${cpl ? fmtINR(cpl) : 'N/A'}`,
    ]
    if (camps.length) {
      lines.push(`  CAMPAIGN BREAKDOWN (top ${camps.length} by spend):`)
      camps.forEach(c => {
        lines.push(`    - ${c.name} [${c.status}, ${c.type}]: Spend ${fmtINR(c.spend)}, Clicks ${c.clicks.toLocaleString()}, CTR ${(c.ctr*100).toFixed(2)}%, Conversions ${c.conversions}, Cost/Conv ${c.costPerConv ? fmtINR(c.costPerConv) : 'N/A'}`)
      })
    }
    return lines.join('\n')
  } catch (e) {
    return `GOOGLE ADS ERROR: ${e.message}`
  }
}

async function getMetaData(token) {
  if (!token) return 'META ADS: NO TOKEN -- Connect Meta Ads from the Meta Ads dashboard in Leverage Quantum to enable campaign data.'
  try {
    const qs = p => new URLSearchParams({ access_token: token, ...p }).toString()
    const [accRes, campRes, adsetRes] = await Promise.all([
      safeFetch(`https://graph.facebook.com/v19.0/${AD_ACCOUNT}/insights?${qs({
        fields: 'spend,impressions,reach,clicks,ctr,cpm,cpp,actions,action_values,frequency,unique_clicks,cost_per_unique_click',
        date_preset: 'last_30d', level: 'account'
      })}`),
      safeFetch(`https://graph.facebook.com/v19.0/${AD_ACCOUNT}/campaigns?${qs({
        fields: 'name,status,objective,daily_budget,lifetime_budget,insights{spend,impressions,clicks,ctr,cpm,frequency,reach,actions,cost_per_action_type}',
        date_preset: 'last_30d', limit: 20, effective_status: '["ACTIVE","PAUSED"]'
      })}`),
      safeFetch(`https://graph.facebook.com/v19.0/${AD_ACCOUNT}/insights?${qs({
        fields: 'spend,impressions,clicks,ctr,actions,frequency,reach',
        date_preset: 'last_30d', level: 'adset', limit: 15
      })}`)
    ])
    if (!accRes) return 'META ADS ERROR: API unreachable -- token may be expired. Re-connect from Meta Ads dashboard.'
    const accData = await accRes.json()
    const campData = campRes ? await campRes.json() : { data: [] }
    const adsetData = adsetRes ? await adsetRes.json() : { data: [] }
    if (accData.error) {
      return `META ADS ERROR: ${accData.error.message} (Code: ${accData.error.code}). ${accData.error.code===190?'Token expired -- re-connect from Meta Ads dashboard.':''}`
    }
    const acc = accData.data?.[0] || {}
    const getAct = (actions, type) => {
      const types = Array.isArray(type) ? type : [type]
      return types.reduce((s,t) => s + parseInt(actions?.find(a=>a.action_type===t)?.value||0), 0)
    }
    const leads = getAct(acc.actions, ['onsite_conversion.lead_grouped','lead','complete_registration'])
    const spend = parseFloat(acc.spend||0)
    const impr = parseInt(acc.impressions||0)
    const clicks = parseInt(acc.clicks||0)
    const reach = parseInt(acc.reach||0)
    const freq = parseFloat(acc.frequency||0)
    const ctr = parseFloat(acc.ctr||0)
    const cpm = parseFloat(acc.cpm||0)
    const cpl = leads>0 ? spend/leads : 0
    const lines = [
      'META ADS DATA (last 30 days):',
      `  ACCOUNT OVERVIEW:`,
      `    Spend: ${fmtINR(spend)} | Impressions: ${impr.toLocaleString()} | Reach: ${reach.toLocaleString()}`,
      `    Clicks: ${clicks.toLocaleString()} | CTR: ${ctr.toFixed(2)}% | CPM: ${fmtINR(cpm)} | Frequency: ${freq.toFixed(2)}`,
      `    Leads (Meta in-platform): ${leads.toLocaleString()} | CPL: ${cpl>0?fmtINR(cpl):'N/A'}`,
    ]
    const camps = campData.data || []
    if (camps.length) {
      lines.push(`  CAMPAIGN BREAKDOWN (${camps.length} campaigns):`)
      camps.forEach(c => {
        const ci = c.insights?.data?.[0] || {}
        const cSpend = parseFloat(ci.spend||0)
        const cCTR = parseFloat(ci.ctr||0)
        const cFreq = parseFloat(ci.frequency||0)
        const cReach = parseInt(ci.reach||0)
        const cLeads = getAct(ci.actions, ['onsite_conversion.lead_grouped','lead','complete_registration'])
        const cCPL = cLeads>0 ? cSpend/cLeads : 0
        lines.push(`    > ${c.name}`)
        lines.push(`      Status: ${c.status} | Objective: ${c.objective||'N/A'} | Spend: ${fmtINR(cSpend)}`)
        lines.push(`      Reach: ${cReach.toLocaleString()} | Freq: ${cFreq.toFixed(2)} | CTR: ${cCTR.toFixed(2)}% | CPM: ${fmtINR(parseFloat(ci.cpm||0))}`)
        lines.push(`      Leads: ${cLeads} | CPL: ${cCPL>0?fmtINR(cCPL):'N/A'} | Clicks: ${parseInt(ci.clicks||0).toLocaleString()}`)
        if (cFreq > 3.5) lines.push(`      [!] FATIGUE: Frequency ${cFreq.toFixed(1)} > 3.5 threshold`)
        if (cCTR < 0.5 && cSpend > 5000) lines.push(`      [!] LOW CTR: ${cCTR.toFixed(2)}% with significant spend`)
      })
    }
    const adsets = adsetData.data || []
    if (adsets.length) {
      lines.push(`  TOP AD SETS BY SPEND:`)
      adsets.sort((a,b)=>(parseFloat(b.spend||0))-(parseFloat(a.spend||0))).slice(0,8).forEach(as => {
        const asLeads = getAct(as.actions, ['onsite_conversion.lead_grouped','lead'])
        const asSpend = parseFloat(as.spend||0)
        const asCPL = asLeads>0 ? asSpend/asLeads : 0
        lines.push(`    - ${as.adset_name||as.campaign_name||'Ad Set'}: Spend ${fmtINR(asSpend)} | CTR ${parseFloat(as.ctr||0).toFixed(2)}% | Leads ${asLeads} | CPL ${asCPL>0?fmtINR(asCPL):'N/A'} | Freq ${parseFloat(as.frequency||0).toFixed(2)}`)
      })
    }
    return lines.join('\n')
  } catch(e) { return `META ADS ERROR: ${e.message}` }
}

// -- SYSTEM PROMPT -------------------------------------------------------------
// Baseline Meta/Google/CRM data changes slowly — cache it in-memory for a short
// window so back-to-back messages in the same warm serverless instance don't
// re-fetch all 4 sources on every single message (was adding several seconds
// of pure fetch latency before the model even started thinking).
let _baselineCache = null // { data: {meta, googleAds, metaCrm, googleCrm}, key, ts }
const BASELINE_CACHE_TTL_MS = 75_000

// Live tool-call results (query_meta_ads / query_google_ads / CRM sheet fetches)
// change slowly relative to a chat session -- cache each exact (tool, params)
// combination briefly so a natural follow-up ("now break that down by ad set"
// reusing the same underlying window) doesn't pay for a second live round-trip
// to Meta/Google. Short TTL and exact-param keying only: this replays real
// data that was already fetched moments ago, it never estimates or reuses a
// result across a materially different request.
const _toolResultCache = new Map() // key -> { data, ts }
const TOOL_CACHE_TTL_MS = 90_000
function toolCacheKey(name, input) { return `${name}:${JSON.stringify(input || {})}` }
function getCachedToolResult(key) {
  const hit = _toolResultCache.get(key)
  if (hit && (Date.now() - hit.ts) < TOOL_CACHE_TTL_MS) return hit.data
  return null
}
function setCachedToolResult(key, data) {
  if (_toolResultCache.size > 100) _toolResultCache.delete(_toolResultCache.keys().next().value)
  _toolResultCache.set(key, { data, ts: Date.now() })
}

async function getBaselineData(metaToken) {
  const now = Date.now()
  const key = metaToken || ''
  if (_baselineCache && _baselineCache.key === key && (now - _baselineCache.ts) < BASELINE_CACHE_TTL_MS) {
    return _baselineCache.data
  }
  const [meta, googleAds, metaCrm, googleCrm] = await Promise.all([
    getMetaData(metaToken),
    getGoogleAdsData(),
    getMetaCrmLeads(),
    getGoogleCrmLeads(),
  ])
  const data = { meta, googleAds, metaCrm, googleCrm }
  _baselineCache = { data, key, ts: now }
  return data
}

// Human labels for every Business Context field -- keep this in sync with the FIELDS
// config in src/pages/SettingsPage.jsx (both list the same keys; label text can differ
// slightly but the KEYS must match, since this reads whatever the frontend saves).
const BIZ_FIELD_LABELS = {
  overview: 'Overview', businessModel: 'Business model', products: 'Products',
  funnelStages: 'Funnel stages', keyMetrics: 'Conversion & key metrics', goals: 'Goals (6-12 mo)',
  revenueRoas: 'Revenue & ROAS', sourceMarkets: 'Source markets', destinationMarkets: 'Destination markets',
  prioritySegments: 'Priority segments', competitors: 'Competitors', seasonality: 'Seasonality',
  whatsComing: "What's coming", numbersToTrust: 'Which numbers to trust', reportingBasis: 'Reporting basis',
  dataSources: 'Data sources', glossary: 'Glossary', voiceGuardrails: 'Voice & writing guardrails',
}
function formatBusinessContext(biz) {
  if (!biz || typeof biz !== 'object') return ''
  const lines = []
  for (const [key, label] of Object.entries(BIZ_FIELD_LABELS)) {
    const v = biz[key]
    if (v == null) continue
    if (Array.isArray(v)) { if (v.length) lines.push(`${label}: ${v.join(', ')}`) }
    else if (typeof v === 'string' && v.trim()) lines.push(`${label}: ${v.trim()}`)
  }
  if (!lines.length) return ''
  return `\n=== BUSINESS CONTEXT (admin-configured, Settings > Ask AI) ===\nReal operating facts about the business, kept here so you interpret the data correctly and write with the right tone -- use these as real context, but never invent a number or claim beyond what the connected tools actually return.\n${lines.join('\n')}`
}

async function buildSystemPrompt(metaToken, memories) {
  const { meta, googleAds, metaCrm, googleCrm } = await getBaselineData(metaToken)
  const today = new Date().toLocaleDateString('en-IN', { weekday:'long', year:'numeric', month:'long', day:'numeric' })
  const memoriesSection = memories?.length
    ? `\n=== REMEMBERED CONTEXT (from previous sessions) ===\n${memories.map(m=>`- ${m}`).join('\n')}`
    : ''
  const businessSection = formatBusinessContext(await getBusinessContext())

  return `You are the Chief Marketing Intelligence Officer of Leverage Edu, built into Leverage Quantum, their internal analytics platform.

You have 40 years of combined expertise across:
- Performance marketing (Meta, Google) for Indian EdTech and D2C
- Lead generation funnels, CRM lead attribution, and enrolment conversion
- Study abroad vertical: UK, Canada, Australia, USA, Ireland, Germany
- Indian digital advertising: CPL benchmarks, audience behaviors, seasonal patterns
- Marketing analytics, attribution, and data-driven decision making

Today: ${today}
${memoriesSection}
${businessSection}

===============================================
LIVE DATA -- LEVERAGE EDU MARKETING
(Updated at session start -- use the query tools for different date ranges or deeper data)
===============================================

${meta}

${metaCrm}

${googleAds}

${googleCrm}

===============================================
LIVE TOOL ACCESS
===============================================

You have four live tools. Use them proactively rather than saying "I don't have that data." If a tool returns an error, report it clearly.

1. query_meta_ads -- Live Meta Graph API (in-platform metrics). Use for specific date ranges, individual ads/creatives, breakdowns (age, gender, placement, device, country), week/month comparisons, or more than the 20 campaigns shown.

2. query_meta_crm_leads -- CRM-attributed Meta leads (FBleads sheet). Use when the question is about leads that actually reached the CRM, funnel quality, or per-campaign CRM lead counts. Supports since/until date filters.

3. query_google_ads -- Live Google Ads API (in-platform conversions). Use for specific date ranges, ad group / keyword / search-term detail, quality score, or day/month trends.

4. query_google_crm_leads -- CRM-attributed Google leads (googleleads sheet). Use for CRM lead counts attributed to Google campaigns and funnel-quality analysis. Supports since/until date filters.

IMPORTANT -- IN-PLATFORM vs CRM LEADS:
- query_meta_ads / query_google_ads return the ad platform's OWN reported leads/conversions.
- query_meta_crm_leads / query_google_crm_leads return leads that reached the CRM (the source of truth for real, qualifiable leads).
- These two numbers differ. When discussing "leads", state which source you are using. For true cost-per-lead and funnel quality, prefer CRM leads.
=============================================
DIAGNOSIS DISCIPLINE (why did it change / find underperformers)
=============================================

When a user asks you to diagnose, explain a change, or find underperformers:
1. Quantify the metric delta between the two relevant periods (state both numbers and the % change).
2. If the question is about Total QL / qualified leads changing (the most common "why did X change" question), call analyze_campaign_contribution FIRST with the two periods -- it deterministically computes per-campaign delta, % share of change, Channel, QL rate, CPQL, and a Scale/Protect/Reduce/Investigate flag with cited evidence (each campaign judged against its own channel's median, not a global one), across ALL channels in one call, or pass the channel param to scope it to just one. Do not hand-diff two raw query_meta_ads/query_google_ads pulls yourself when this tool answers the question -- it is more reliable and cheaper than doing the arithmetic in your head across tool calls.
3. For anything analyze_campaign_contribution doesn't cover (spend/CTR/CPM diagnostics, single-platform-only questions), use the query tools to attribute the delta to the top 3 campaigns/adsets/breakdowns, ranked by how much each contributed to the change.
4. Distinguish what merely correlates from the likely driver - do not present a coincidence as a cause.
5. Close with one specific, prioritized action, using the tool's own action/evidence fields when available rather than inventing your own recommendation.
Never hand-wave a "why" - always ground it in the ranked contributors from the tools.
For a direct "what was X" question (not a "why did it change" one) about Overall-dashboard figures -- spend, leads, Total QL, applications, offers, deposits, RAUs, CPL, CPQL, CPA, for a period or by source -- call get_overall_totals instead of analyze_campaign_contribution or hand-summing raw rows yourself.

===============================================
BUSINESS & FUNNEL CONTEXT
===============================================

COMPANY: Leverage Edu -- India's leading study abroad platform
FUNNEL: Meta/Google Ad -> Lead Form -> Raw Lead -> CRM Lead -> QL Call -> Qualified Lead -> Application -> Enrolment
REVENUE MODEL: Commission per enrolled student (high LTV, typically ₹50K-2L per enrolment)

META ADS BENCHMARKS (India, EdTech/Study Abroad):
- Good CPL: ₹150-400 | Alarm: >₹600
- Good CTR (Feed): 1.2-2.5% | Alarm: <0.8%
- Good Frequency: <3.0 | Fatigue: >3.5 Feed, >5 Reels
- Good CPM: ₹80-200 | Alarm: >₹350
- Audience size sweet spot: 2M-15M for cold, 100K-2M for retargeting

CRM LEAD BENCHMARKS (India, EdTech):
- CRM leads lag ad-platform leads by 24-72h (attribution + sync delay)
- A healthy CRM-to-platform lead ratio is 70%+; a large gap signals lead-form drop-off or tracking issues

ATTRIBUTION NOTE: CRM leads lag ad-platform numbers by 24-72h. Never compare same-day platform vs CRM numbers.
SPEND NOTE: Meta API returns INR for Indian accounts. Never apply USD->INR conversion.

===============================================
YOUR OPERATING PRINCIPLES
===============================================

1. DIAGNOSE FIRST -- always identify the root cause before recommending action
2. PRIORITISE BY RUPEE IMPACT -- rank every recommendation by expected rupee impact
3. FLAG RISKS PROACTIVELY -- don't wait to be asked; surface fatigue, CPL spikes, CRM lead drops
4. BE SPECIFIC -- "pause campaign X" not "consider pausing some campaigns"
5. SHOW YOUR WORKING -- especially for calculations; don't just give answers
6. LABEL YOUR CONFIDENCE -- data-backed vs industry benchmark vs inference
7. NEVER FABRICATE -- if data is missing, use a tool to fetch it. Never make up numbers.
8. CROSS-CHANNEL THINKING -- always look for Meta <-> Google <-> CRM leads connections. Compare each channel's ad-platform leads against its CRM-attributed leads, and compare Meta vs Google efficiency side by side.
9. CHANNEL DISAMBIGUATION -- Meta and Google share many metric names (spend, CPL, leads, CTR). When the user asks about a metric that exists on both and does NOT specify a channel, either report both channels side by side, or ask which channel they mean. Never silently assume one channel.
10. SEASONAL AWARENESS -- India study abroad peaks: Jan-Mar (UK/Canada intake), Jul-Sep (Jan intake)
11. ALWAYS GIVE NEXT STEPS -- end every analysis with ranked actions

FORMAT RULES:
- Use ₹, K, L, Cr for all money (never "Rs")
- Bold **key numbers**
- Use tables for comparisons (always)
- Use [!] for warnings, [OK] for positive signals, [UP] for growth, [DOWN] for decline`
}

// -- project memory synthesis (on-demand "Regenerate" button, not a nightly job) ----
// Reuses ask-ai.js (no new serverless function -- Vercel Hobby is already at the 12-function cap)
// and app_preferences (no new table) to store the single shared team-wide memory doc.
async function fetchRecentConversationText(limit = 8) {
  if (!SB_KEY) return ''
  try {
    const cr = await fetch(`${SB_URL}/rest/v1/ask_ai_conversations?select=id,title,updated_at&order=updated_at.desc&limit=${limit}`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, signal: AbortSignal.timeout(8000)
    })
    if (!cr.ok) return ''
    const convs = await cr.json()
    const chunks = []
    for (const c of convs) {
      const mr = await fetch(`${SB_URL}/rest/v1/ask_ai_messages?conv_id=eq.${c.id}&select=messages&order=updated_at.desc&limit=1`, {
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, signal: AbortSignal.timeout(8000)
      })
      if (!mr.ok) continue
      const rows = await mr.json()
      const raw = rows?.[0]?.messages
      if (!raw) continue
      let msgs
      try { msgs = typeof raw === 'string' ? JSON.parse(raw) : raw } catch { continue }
      if (!Array.isArray(msgs) || !msgs.length) continue
      const text = msgs.map(m => `${m.role}: ${String(m.content || '').slice(0, 300)}`).join('\n')
      chunks.push(`### ${c.title}\n${text.slice(0, 1200)}`)
    }
    return chunks.join('\n\n')
  } catch { return '' }
}

async function getAutoMemory() {
  if (!SB_KEY) return ''
  try {
    const r = await fetch(`${SB_URL}/rest/v1/app_preferences?select=value&key=eq.ask_ai_auto_memory&limit=1`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, signal: AbortSignal.timeout(5000)
    })
    if (!r.ok) return ''
    const d = await r.json()
    return d?.[0]?.value || ''
  } catch { return '' }
}

async function saveAutoMemory(text, updatedBy) {
  try {
    await fetch(`${SB_URL}/rest/v1/app_preferences`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ key: 'ask_ai_auto_memory', value: text, updated_by: updatedBy, updated_at: new Date().toISOString() })
    })
  } catch {}
}

async function handleRegenerateMemory(res, me) {
  try {
    const [recentText, existing] = await Promise.all([fetchRecentConversationText(8), getAutoMemory()])
    if (!recentText.trim() && !existing.trim()) {
      return res.status(200).json({ memory: '', message: 'No conversation history yet to summarize.' })
    }
    const prompt = `You maintain a short internal "project memory" for Leverage Quantum's Ask AI assistant -- a running cheat sheet of what the team has decided, asked about, and prefers, so future conversations don't start from zero.
${existing ? `\nCURRENT MEMORY (update this, keep facts that are still true):\n${existing}\n` : ''}
RECENT CONVERSATIONS TO INCORPORATE:
${recentText || '(none)'}

Write an UPDATED project memory with these sections:
- Recent decisions (campaign scale/pause calls, budget moves, specific numbers actually decided)
- Preferences & patterns (how the user likes answers formatted, recurring focus areas)
- Open items (anything flagged as needing follow-up)

Keep it under 180 words total. Plain text with short section headers, no markdown tables. Only include real decisions/preferences/facts -- skip generic chit-chat. If nothing meaningful changed, keep the existing memory mostly as-is.`
    const r = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 500, messages: [{ role: 'user', content: prompt }] })
    })
    if (!r.ok) { const e = await r.json().catch(() => ({})); return res.status(r.status).json({ error: e?.error?.message || 'Anthropic error' }) }
    const data = await r.json()
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim()
    await saveAutoMemory(text, me.email)
    return res.status(200).json({ memory: text, updated_at: new Date().toISOString() })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Failed to regenerate memory' })
  }
}

// -- Autonomous agent runs (Phase 1 of the agent-upgrade roadmap) -------------
// A named agent runs its own fixed investigation prompt through the same tool
// loop as an interactive question, but non-streamed (invoked by a scheduled
// GitHub Actions job, or an admin's "Run now" click -- nobody's watching an SSE
// connection either way) and its output is stored as a durable artifact in
// Supabase (agent_runs) for the Agents page, instead of a chat message.
const AGENTS = {
  marketing_performance: {
    label: 'Marketing Performance Agent',
    buildPrompt() {
      const iso = d => d.toISOString().slice(0, 10)
      const today = new Date()
      const until = new Date(today); until.setDate(until.getDate() - 1) // yesterday -- today's data is still incomplete
      const since = new Date(until); since.setDate(since.getDate() - 6)
      const prevUntil = new Date(since); prevUntil.setDate(prevUntil.getDate() - 1)
      const prevSince = new Date(prevUntil); prevSince.setDate(prevSince.getDate() - 6)
      return {
        since: iso(since), until: iso(until),
        text: `Run today's autonomous marketing performance review. Compare ${iso(since)} to ${iso(until)} against the prior 7 days (${iso(prevSince)} to ${iso(prevUntil)}) using the campaign contribution tool (no channel filter, so it covers every channel at once) as your primary lens, and pull whichever Meta/Google/CRM tools you need to substantiate it. Produce a report with exactly these three sections in markdown: "## Executive Summary" (2-3 sentences on the headline Total QL movement and why), "## Top Movers" (a table: Channel, Campaign, QL delta, % of change, Action, one-line evidence -- use the tool's own Channel and Action fields for every row, since each campaign is judged against its own channel's median, not a global one), and "## Recommended Action" (ONE prioritized, concrete action -- not a list of options). Be quantitative and specific everywhere; do not hedge with vague language.`,
      }
    },
  },
  quantum_gazette: {
    label: 'The Quantum Gazette',
    // Full-fidelity rebuild (2026-08-25): no longer an LLM tool-loop agent at
    // all -- handleAgentRun special-cases this agentId and calls
    // buildQuantumGazetteEdition() instead, which fetches deterministic data
    // directly (api/crm-leads.js's fetch*GazetteData functions) and makes
    // exactly one short, structured-output prose call. `tools`/`isGazette`
    // are gone; only the date-range calculation survives here, reused by
    // both the manual "Run now" button and the nightly cron.
    isGazetteV2: true,
    // MTD vs the same number of days in the prior month -- matches the real
    // sent edition's own YTD/monthly framing and CeoB2CDashboard's own MTD
    // convention, not a rolling 7-day window (which the old freeform-prose
    // version used).
    buildRange() {
      const iso = d => d.toISOString().slice(0, 10)
      const today = new Date()
      const until = new Date(today); until.setDate(until.getDate() - 1) // yesterday -- today's data is still incomplete
      const since = new Date(today.getFullYear(), today.getMonth(), 1)
      const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const prevMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0)
      const prevUntil = new Date(prevMonthStart.getFullYear(), prevMonthStart.getMonth(), Math.min(until.getDate(), prevMonthEnd.getDate()))
      return { since: iso(since), until: iso(until), prevSince: iso(prevMonthStart), prevUntil: iso(prevUntil) }
    },
  },
  weekly_executive_digest: {
    label: 'Weekly Executive Digest Agent',
    buildPrompt() {
      const iso = d => d.toISOString().slice(0, 10)
      const today = new Date()
      const until = new Date(today); until.setDate(until.getDate() - 1) // yesterday -- today's data is still incomplete
      const since = new Date(until); since.setDate(since.getDate() - 29)
      const prevUntil = new Date(since); prevUntil.setDate(prevUntil.getDate() - 1)
      const prevSince = new Date(prevUntil); prevSince.setDate(prevSince.getDate() - 29)
      return {
        since: iso(since), until: iso(until),
        text: `Run this week's autonomous executive digest -- a broader, strategic synthesis, not a daily tactical readout. Compare the last 30 days (${iso(since)} to ${iso(until)}) against the prior 30 days (${iso(prevSince)} to ${iso(prevUntil)}) using the campaign contribution tool (no channel filter) as your primary lens for QL movement, and pull whichever Meta/Google/CRM tools you need to round out the picture (spend efficiency, creative fatigue signals, cross-channel comparison). Produce a report with exactly these sections in markdown: "## 30-Day Executive Summary" (3-4 sentences on the month-over-month trajectory in Total QL, spend, and efficiency -- describe the trend, not just a single snapshot), "## Channel Performance" (a table: Channel, Spend, QL, QL rate, CPQL, one-line trend note per channel), "## Biggest Wins and Risks" (2-3 bullets, each naming a specific campaign or channel with a real number, never a vague statement), and "## Strategic Recommendation" (ONE forward-looking, budget-or-priority-level recommendation for the coming month -- not a daily tactical fix). Be quantitative and specific everywhere; do not hedge with vague language.`,
      }
    },
  },
}

async function runAgentToolLoop({ system, userText, tools, agentId }) {
  let currentMessages = [{ role: 'user', content: userText }]
  let totalInputTokens = 0, totalOutputTokens = 0, toolCallsCount = 0
  // Every tool call this run made, in order -- additive to the return shape so a
  // caller that wants the raw data behind the final text (e.g. to render its own
  // table from the last successful call) can, without a second round trip.
  const toolLog = []
  const MAX_ROUNDS = 5
  const runOne = async toolUse => {
    toolCallsCount++
    const _t0 = Date.now()
    let result
    if (toolUse.name === 'query_meta_ads') result = await executeMetaQuery((await getTokenFromSupabase()) || '', toolUse.input || {})
    else if (toolUse.name === 'query_google_ads') result = await executeGoogleAdsQuery(toolUse.input || {})
    else if (toolUse.name === 'query_meta_crm_leads') result = await fetchCrmLeads((await getSheetOverride('sheet_url_fbleads')) || FB_LEADS_SHEET, toolUse.input || {})
    else if (toolUse.name === 'query_google_crm_leads') result = await fetchCrmLeads((await getSheetOverride('sheet_url_googleleads')) || GOOGLE_LEADS_SHEET, toolUse.input || {})
    else if (toolUse.name === 'analyze_campaign_contribution') result = await analyzeCampaignContribution(toolUse.input || {})
    else if (toolUse.name === 'get_overall_totals') result = await fetchOverallTotals(toolUse.input || {})
    else result = { error: 'Unknown tool: ' + toolUse.name }
    await logToolCall({ convId: null, userId: 'agent:' + agentId, toolName: toolUse.name, params: toolUse.input, rowCount: resultRowCount(result), latencyMs: Date.now() - _t0, hadError: !!(result && result.error) })
    toolLog.push({ name: toolUse.name, input: toolUse.input || {}, result })
    return { type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(result) }
  }
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const r = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      // 4096, not 1024 (found live 2026-08-24 running the Gazette agent for the
      // first time): unlike the interactive chat's own tool loop, THIS loop's
      // "no more tool calls" branch a few lines below returns its text
      // straight to the caller as the FINAL answer -- there's no guaranteed
      // follow-up call with a bigger budget the way interactive chat always
      // has one. A short report (the original 2 agents' 3-4 sentences + one
      // table) fit in 1024 by luck; the Gazette's 3 full sections did not,
      // and got silently cut off mid-Section-B with Section C never written
      // at all -- no error, just a quietly truncated report. Any future
      // longer-form agent output would hit the same ceiling.
      body: JSON.stringify({ model: MODEL, max_tokens: 4096, stream: false, tools, tool_choice: { type: 'auto' }, system, messages: currentMessages }),
    })
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e?.error?.message || `Anthropic API error ${r.status}`) }
    const response = await r.json()
    if (response.usage) { totalInputTokens += response.usage.input_tokens || 0; totalOutputTokens += response.usage.output_tokens || 0 }
    const toolUseBlocks = (response.content || []).filter(b => b.type === 'tool_use')
    if (toolUseBlocks.length === 0) {
      const text = (response.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
      return { text, totalInputTokens, totalOutputTokens, toolCallsCount, toolLog }
    }
    const assistantMessage = { role: 'assistant', content: response.content }
    const toolResults = await Promise.all(toolUseBlocks.map(runOne))
    currentMessages = [...currentMessages, assistantMessage, { role: 'user', content: toolResults }]
  }
  // Ran out of tool rounds without a final text -- ask once more with tools disabled to force a text answer.
  const r = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 8192, stream: false, system, messages: currentMessages }),
  })
  const response = await r.json()
  if (response.usage) { totalInputTokens += response.usage.input_tokens || 0; totalOutputTokens += response.usage.output_tokens || 0 }
  const text = (response.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
  return { text, totalInputTokens, totalOutputTokens, toolCallsCount, toolLog }
}


async function saveGazetteHtml(html) {
  const r = await fetch(`${SB_URL}/rest/v1/app_preferences`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ key: 'gazette_html', value: html, updated_by: 'agent:quantum_gazette', updated_at: new Date().toISOString() }),
    signal: AbortSignal.timeout(10000),
  })
  if (!r.ok) throw new Error('Could not save gazette_html: ' + (await r.text()).slice(0, 300))
}

async function logAgentRun({ agentId, title, summary, content, status, error, toolCallsCount, startedAt, finishedAt, triggeredBy }) {
  if (!SB_KEY) return null
  try {
    const r = await fetch(`${SB_URL}/rest/v1/agent_runs`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ agent_id: agentId, title, summary, content, status, error: error || null, tool_calls_count: toolCallsCount || 0, started_at: startedAt, finished_at: finishedAt, triggered_by: triggeredBy }),
      signal: AbortSignal.timeout(8000),
    })
    const rows = await r.json().catch(() => [])
    return rows?.[0]?.id ?? null
  } catch { return null }
}

// Per-agent on/off switch, stored in app_preferences as 'agent_<id>_enabled'.
// Missing row (never toggled) or any value other than the literal false
// defaults to enabled, so this is additive -- an agent nobody has touched
// in Settings/Agents keeps running exactly as it always has.
async function isAgentEnabled(agentId) {
  if (!SB_KEY) return true
  try {
    const r = await fetch(`${SB_URL}/rest/v1/app_preferences?select=value&key=eq.agent_${agentId}_enabled`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
      signal: AbortSignal.timeout(5000),
    })
    if (!r.ok) return true
    const rows = await r.json().catch(() => [])
    return rows?.[0]?.value !== false
  } catch { return true }
}

// -- Quantum Gazette (full-fidelity rebuild, 2026-08-25) --------------------
// Reproduces the real hand-built edition's design (see shared/gazetteTemplate
// .mjs's own header comment) rather than the freeform-LLM-prose version that
// briefly replaced it. Numbers are ALWAYS computed by code -- api/crm-leads
// .js's fetch*GazetteData functions, reading the same Supabase caches the
// rest of the app already trusts -- never something the model transcribes.
// The ONE Anthropic call in this whole pipeline writes only the headline /
// lede / pull-quote / editor's-note prose, grounded in a compact digest of
// the real figures, and is explicitly told never to state a number that
// isn't given to it verbatim.
function gazDeltaPct(now, was) { return was === 0 || was == null ? (now > 0 ? 100 : null) : ((now - was) / Math.abs(was)) * 100 }
function gazDayLabel(iso) { return String(iso || '').slice(8, 10) || iso }

async function generateGazetteProse(digest) {
  const noteSchema = { type: 'array', items: { type: 'object', properties: { lead: { type: 'string' }, rest: { type: 'string' } }, required: ['lead', 'rest'] } }
  const sectionSchema = { type: 'object', properties: { intro: { type: 'string' }, notes: noteSchema }, required: ['intro', 'notes'] }
  const schema = {
    name: 'submit_gazette_prose',
    description: "Submit tonight's written content for The Quantum Gazette.",
    input_schema: {
      type: 'object',
      properties: {
        headline: { type: 'string', description: 'One newspaper-style headline sentence for the whole edition, under 16 words, no trailing period.' },
        aboveFold: { type: 'string', description: "2-3 sentence lede paragraph opening the edition, dry/literary newspaper voice." },
        pullQuoteText: { type: 'string', description: 'One memorable, quotable sentence drawn from the substance of the edition.' },
        pullQuoteByline: { type: 'string', description: 'A short byline, e.g. "Marketing Desk" or "The Editors".' },
        sectionA: { ...sectionSchema, description: 'Marketing and Growth desk -- 2-3 sentence intro plus exactly 3 editor-note items.' },
        sectionB: { ...sectionSchema, description: 'Corporate Finance desk -- 2-3 sentence intro plus exactly 2 editor-note items.' },
        sectionC: { ...sectionSchema, description: 'Talent Mobility desk -- 2-3 sentence intro plus exactly 2 editor-note items.' },
      },
      required: ['headline', 'aboveFold', 'pullQuoteText', 'pullQuoteByline', 'sectionA', 'sectionB', 'sectionC'],
    },
  }
  const system = `You write "The Quantum Gazette", a nightly internal newspaper for Leverage Edu's marketing, finance and talent teams. Voice: dry, literary, confident, a little wry -- never breathless, never generic corporate boilerplate. You are given a JSON digest of REAL, already-computed figures for tonight's edition; every number in it is already correct and pre-formatted. Rules, all mandatory: (1) Never invent, round differently, or restate a number that is not present verbatim in the digest -- if you cite a figure, copy it exactly as given, character for character. (2) Prefer interpretation and consequence over restating numbers the reader will already see in the tables and charts printed right next to your prose -- your job is to say what it MEANS, not to repeat it. (3) Each "note" item is one sentence split into a short, punchy bold "lead" phrase (a few words) and the rest of the sentence as "rest". (4) Never write a sentence generic enough to apply to any edition -- every sentence must be specific to what's actually in tonight's digest. (5) If a figure in the digest is null or the section is unavailable, say so plainly rather than inventing a placeholder.`
  const r = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL, max_tokens: 3072, stream: false, system,
      messages: [{ role: 'user', content: "Tonight's digest:\n\n" + JSON.stringify(digest, null, 1) }],
      tools: [schema], tool_choice: { type: 'tool', name: 'submit_gazette_prose' },
    }),
  })
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e?.error?.message || `Anthropic API error ${r.status}`) }
  const response = await r.json()
  const usage = response.usage ? { inputTokens: response.usage.input_tokens || 0, outputTokens: response.usage.output_tokens || 0 } : { inputTokens: 0, outputTokens: 0 }
  const toolUse = (response.content || []).find(b => b.type === 'tool_use' && b.name === 'submit_gazette_prose')
  if (!toolUse) throw new Error('Gazette prose call returned no structured output')
  return { prose: toolUse.input, usage }
}

// Assembles tonight's full edition: fetches the three desks' deterministic
// data, gets the one short prose call, then wires everything through shared/
// gazetteTemplate.mjs's pure render functions. Returns {html, usage}.
async function buildQuantumGazetteEdition({ since, until, prevSince, prevUntil }) {
  const T = await import('../shared/gazetteTemplate.mjs')
  const crm = await import('./crm-leads.js')
  const [marketing, b2c, careers] = await Promise.all([
    crm.fetchMarketingGazetteData({ since, until, prevSince, prevUntil }),
    crm.fetchB2CGazetteData({ since, until, prevSince, prevUntil }),
    crm.fetchCareersGazetteData({ since, until, prevSince, prevUntil }),
  ])
  const { fmtINR, fmtN, fmtPct, deltaSpan } = T
  const m = marketing
  const RAMP = [T.NAVY, T.BLUE, T.CYAN, T.GREEN]

  // --- Digest for the prose call: pre-formatted strings only, so the model
  // never has to (and never should) do its own arithmetic or formatting. ---
  const digest = {
    dateRange: { thisPeriod: since + ' to ' + until, priorPeriod: prevSince + ' to ' + prevUntil },
    marketing: {
      spend: { now: fmtINR(m.totals.now.spend).replace(/&#8377;/, '₹'), prior: fmtINR(m.totals.prev.spend).replace(/&#8377;/, '₹'), changePct: fmtPct(gazDeltaPct(m.totals.now.spend, m.totals.prev.spend)) },
      totalQL: { now: fmtN(m.totals.now.totalQL), prior: fmtN(m.totals.prev.totalQL), changePct: fmtPct(gazDeltaPct(m.totals.now.totalQL, m.totals.prev.totalQL)) },
      cpql: { now: fmtINR(m.totals.now.cpql).replace(/&#8377;/, '₹'), prior: fmtINR(m.totals.prev.cpql).replace(/&#8377;/, '₹'), changePct: fmtPct(gazDeltaPct(m.totals.now.cpql, m.totals.prev.cpql)) },
      topSpendChannel: m.channels.paid[0] ? { name: m.channels.paid[0].source, spend: fmtINR(m.channels.paid[0].spend).replace(/&#8377;/, '₹'), cpqlChangePct: fmtPct(m.channels.paid[0].cpqlChange) } : null,
      cheapestCampaign: m.ledger.ranked[0] ? { name: m.ledger.ranked[0].campaign, cpql: fmtINR(m.ledger.ranked[0].cpql).replace(/&#8377;/, '₹') } : null,
      priciestCampaign: m.ledger.ranked[m.ledger.ranked.length - 1] ? { name: m.ledger.ranked[m.ledger.ranked.length - 1].campaign, cpql: fmtINR(m.ledger.ranked[m.ledger.ranked.length - 1].cpql).replace(/&#8377;/, '₹') } : null,
      topCorridorBySpend: m.corridors[0] ? { name: m.corridors[0].corridor, spend: fmtINR(m.corridors[0].spend).replace(/&#8377;/, '₹') } : null,
    },
    b2c: b2c.configured ? {
      totalRevenue: { now: fmtINR(b2c.pnl.now.totalRev).replace(/&#8377;/, '₹'), prior: fmtINR(b2c.pnl.prev.totalRev).replace(/&#8377;/, '₹') },
      totalCost: { now: fmtINR(b2c.pnl.now.totalCost).replace(/&#8377;/, '₹'), prior: fmtINR(b2c.pnl.prev.totalCost).replace(/&#8377;/, '₹') },
      net: { now: fmtINR(b2c.pnl.now.net).replace(/&#8377;/, '₹'), prior: fmtINR(b2c.pnl.prev.net).replace(/&#8377;/, '₹') },
      netCashInflow: { now: fmtINR(b2c.cashFlow.now.net).replace(/&#8377;/, '₹'), prior: fmtINR(b2c.cashFlow.prev.net).replace(/&#8377;/, '₹') },
      ytdNet: fmtINR(b2c.pnl.ytd.net).replace(/&#8377;/, '₹'),
    } : null,
    careers: {
      leads: { now: fmtN(careers.now.leads), prior: fmtN(careers.prev.leads) },
      interested: { now: fmtN(careers.now.interested), prior: fmtN(careers.prev.interested) },
      won: { now: fmtN(careers.now.won), prior: fmtN(careers.prev.won) },
      topCampaign: careers.campaigns[0] ? { name: careers.campaigns[0].campaign, leads: fmtN(careers.campaigns[0].leads) } : null,
    },
  }
  const { prose, usage } = await generateGazetteProse(digest)

  // --- Section A: Marketing and Growth ---------------------------------
  const dChNow = (now, prev) => ({ pct: gazDeltaPct(now, prev), goodIfUp: false })
  const kpiA = T.kpiBox('Marketing at a Glance', [
    { label: 'Spend', value: fmtINR(m.totals.now.spend), delta: { pct: gazDeltaPct(m.totals.now.spend, m.totals.prev.spend), goodIfUp: false }, compareLabel: 'vs prior period' },
    { label: 'Total QL', value: fmtN(m.totals.now.totalQL), delta: { pct: gazDeltaPct(m.totals.now.totalQL, m.totals.prev.totalQL), goodIfUp: true }, compareLabel: 'vs prior period' },
    { label: 'CPQL', value: fmtINR(m.totals.now.cpql), delta: { pct: gazDeltaPct(m.totals.now.cpql, m.totals.prev.cpql), goodIfUp: false }, compareLabel: 'vs prior period' },
    { label: 'Est. SR Revenue', value: fmtINR(m.totals.now.estSrRevenue), delta: { pct: gazDeltaPct(m.totals.now.estSrRevenue, m.totals.prev.estSrRevenue), goodIfUp: true }, compareLabel: 'vs prior period' },
  ], `This period ${since} to ${until} &middot; prior period ${prevSince} to ${prevUntil} (equal-length window immediately before).`)
  const funnelA = T.funnelViz('Funnel, This Period', m.stages.map((s, i) => ({ label: s.label, value: s.now, color: RAMP[i % RAMP.length] })))
  const minQL = Math.min(...m.daySeries.map(d => d.totalQL))
  const chartA = T.dayBarChart(m.daySeries.map(d => ({ label: gazDayLabel(d.date), value: d.totalQL, flag: d.totalQL === minQL, tip: d.date + ': ' + fmtN(d.totalQL) + ' QL, ' + fmtINR(d.spend).replace(/&#8377;/, '₹') + ' spend' })))
  const chHeaders = [{ label: 'Channel' }, { label: 'Spend', align: 'right' }, { label: 'Total QL', align: 'right' }, { label: 'CPQL', align: 'right' }, { label: 'CPQL &Delta;', align: 'right' }]
  const chRow = c => ({ cells: [{ text: c.source }, { html: fmtINR(c.spend), align: 'right' }, { html: fmtN(c.totalQL), align: 'right' }, { html: c.cpql != null ? fmtINR(c.cpql) : '&mdash;', align: 'right' }, { html: deltaSpan(c.cpqlChange, false), align: 'right' }] })
  const tableChannels = T.sectionTitle('Channels', 'paid then free traffic') + T.dataTable(chHeaders, [...m.channels.paid, ...m.channels.free].map(chRow))
  const corRow = c => ({ cells: [{ text: c.corridor }, { html: fmtINR(c.spend), align: 'right' }, { html: fmtN(c.totalQL), align: 'right' }, { html: c.cpql != null ? fmtINR(c.cpql) : '&mdash;', align: 'right' }, { html: deltaSpan(c.cpqlChange, false), align: 'right' }] })
  const tableCorridors = T.sectionTitle('Corridors', 'by spend, descending') + T.dataTable([{ label: 'Corridor' }, { label: 'Spend', align: 'right' }, { label: 'Total QL', align: 'right' }, { label: 'CPQL', align: 'right' }, { label: 'CPQL &Delta;', align: 'right' }], m.corridors.map(corRow))
  const ranked = m.ledger.ranked
  const ledgerCard = c => ({ name: c.campaign, meta: c.source + ' &middot; ' + c.corridor, priceHtml: fmtINR(c.cpql) + ' <span style="font-size:12px;font-weight:400;color:#666666">/ QL</span>' })
  const remaining = ranked.slice(3, Math.max(3, ranked.length - 3))
  const ledgerA = T.campaignLedger({
    title: 'Campaign Ledger', subtitle: ranked.length + ' campaigns ranked by CPQL, cheapest first',
    bestLabel: 'Cheapest to Qualify', best: ranked.slice(0, 3).map(ledgerCard),
    priciestLabel: 'Priciest to Qualify', priciest: ranked.slice(-3).reverse().map(ledgerCard),
    remaining: remaining.map(c => ({ cells: [{ text: c.campaign }, { text: c.source }, { text: c.corridor }, { html: fmtINR(c.spend), align: 'right' }, { html: fmtN(c.totalQL), align: 'right' }, { html: fmtINR(c.cpql), align: 'right' }] })),
    remainingCols: [{ label: 'Campaign' }, { label: 'Source' }, { label: 'Corridor' }, { label: 'Spend', align: 'right' }, { label: 'Total QL', align: 'right' }, { label: 'CPQL', align: 'right' }],
    remainingLabel: remaining.length + ' more ranked campaigns',
  })
  const ledgerFootnote = T.paragraph(m.ledger.excludedCount + ' campaigns (' + fmtINR(m.ledger.excludedSpend).replace(/&#8377;/, '₹') + ', ' + fmtN(m.ledger.excludedQL) + ' QL) sit below the 25-QL/real-spend ranking threshold or in a corridor not eligible for CPQL ranking (MBBS, IVY100).', { size: 13, color: '#666666', mb: 20 })
  const sectionsA = T.sectionHeader('A', 'Marketing and Growth', 'Spend, QL Volume, CPQL and the Campaign Ledger')
    + T.headline(prose.headline) + T.dropCapParagraph(prose.aboveFold) + T.pullQuote(prose.pullQuoteText)
    + kpiA + T.sectionTitle('Funnel and Daily Volume') + funnelA + chartA + tableChannels + tableCorridors
    + ledgerA + ledgerFootnote
    + T.editorsNote("Editor's Notes, Marketing", prose.sectionA.intro, prose.sectionA.notes)

  // --- Section B: Corporate Finance -------------------------------------
  let sectionsB
  if (b2c.configured) {
    const marginNow = b2c.pnl.now.totalRev > 0 ? (b2c.pnl.now.net / b2c.pnl.now.totalRev) * 100 : null
    const marginPrev = b2c.pnl.prev.totalRev > 0 ? (b2c.pnl.prev.net / b2c.pnl.prev.totalRev) * 100 : null
    const kpiB = T.kpiBox('B2C at a Glance (P&amp;L)', [
      { label: 'Total Revenue', value: fmtINR(b2c.pnl.now.totalRev), delta: { pct: gazDeltaPct(b2c.pnl.now.totalRev, b2c.pnl.prev.totalRev), goodIfUp: true }, compareLabel: 'vs prior period' },
      { label: 'Total Cost', value: fmtINR(b2c.pnl.now.totalCost), delta: { pct: gazDeltaPct(b2c.pnl.now.totalCost, b2c.pnl.prev.totalCost), goodIfUp: false }, compareLabel: 'vs prior period' },
      { label: 'Net', value: fmtINR(b2c.pnl.now.net), delta: { pct: gazDeltaPct(b2c.pnl.now.net, b2c.pnl.prev.net), goodIfUp: true }, compareLabel: 'vs prior period' },
      { label: 'Net Margin', value: marginNow == null ? '&mdash;' : fmtPct(marginNow), sub: marginPrev == null ? '' : 'prior ' + fmtPct(marginPrev) },
    ], 'P&amp;L revenue is recognised on the date a sale is recorded; Cash Flow (shown in the YTD box below) records actual cash moved. This period ' + since + ' to ' + until + ' &middot; prior period ' + prevSince + ' to ' + prevUntil + '.')
    const lineRow = r => ({ cells: [{ text: r.label || 'Total', bold: !!r.isTotal }, { html: fmtINR(r.value), align: 'right', bold: !!r.isTotal }, { html: fmtPct(r.share), align: 'right', bold: !!r.isTotal }] })
    const lineHeaders = [{ label: 'Line Item' }, { label: 'Value', align: 'right' }, { label: 'Share', align: 'right' }]
    const tablesB = T.sectionTitle('Revenue by Line') + T.dataTable(lineHeaders, b2c.pnl.lines.map(lineRow))
      + T.sectionTitle('Cost by Line') + T.dataTable(lineHeaders, b2c.pnl.costLines.map(lineRow))
    const chartB = T.sectionTitle('Revenue vs. Cost, Daily') + T.dualDayBarChart(b2c.pnl.daySeries.map(d => ({ label: gazDayLabel(d.date), a: d.totalRev || 0, b: d.totalCost || 0, tip: d.date + ': rev ' + fmtINR(d.totalRev).replace(/&#8377;/, '₹') + ', cost ' + fmtINR(d.totalCost).replace(/&#8377;/, '₹') })))
    const ebitdaNote = (b2c.pnl.ytd.ebitdaBeforeCorp >= 0 && b2c.pnl.now.ebitdaBeforeCorp < 0)
      ? ('YTD EBITDA before Corp. Overheads is positive at ' + fmtINR(b2c.pnl.ytd.ebitdaBeforeCorp) + ', even though this period alone is negative at ' + fmtINR(b2c.pnl.now.ebitdaBeforeCorp) + ' &mdash; the earlier months carried the year.')
      : ('EBITDA before Corp. Overheads stands at ' + fmtINR(b2c.pnl.ytd.ebitdaBeforeCorp) + ' year-to-date, versus ' + fmtINR(b2c.pnl.now.ebitdaBeforeCorp) + ' for this period alone.')
    const ytdB = T.ytdBox({
      label: b2c.fyLabel + ', Year to Date', dateRange: b2c.fyStart + ' to ' + until,
      pnl: [['Total Revenue', fmtINR(b2c.pnl.ytd.totalRev)], ['Total Cost', fmtINR(b2c.pnl.ytd.totalCost)], ['Net', fmtINR(b2c.pnl.ytd.net), b2c.pnl.ytd.net >= 0 ? T.GREEN : T.NAVY]],
      cashFlow: [['Total Cash Inflow', fmtINR(b2c.cashFlow.ytd.totalRev)], ['Total Cash Outflow', fmtINR(b2c.cashFlow.ytd.totalCost)], ['Net Cash Inflow', fmtINR(b2c.cashFlow.ytd.net), b2c.cashFlow.ytd.net >= 0 ? T.GREEN : T.NAVY]],
      footnote: ebitdaNote,
    })
    sectionsB = T.sectionHeader('B', 'Corporate Finance', 'P&amp;L, Cash Flow, YTD') + T.paragraph(prose.sectionB.intro, { size: 16, mb: 20 })
      + kpiB + tablesB + chartB + ytdB + T.editorsNote("Editor's Notes, Finance", '', prose.sectionB.notes)
  } else {
    sectionsB = T.sectionHeader('B', 'Corporate Finance', 'Not Yet Connected') + T.paragraph('The B2C finance sheet is not configured for this environment, so tonight’s edition has no Corporate Finance desk. Connect it in Settings &gt; Data &gt; B2C Finance Sheet.', { size: 15, mb: 20 })
  }

  // --- Section C: Talent Mobility ----------------------------------------
  const wonRateNow = careers.now.leads > 0 ? (careers.now.won / careers.now.leads) * 100 : null
  const wonRatePrev = careers.prev.leads > 0 ? (careers.prev.won / careers.prev.leads) * 100 : null
  const kpiC = T.kpiBox('Careers at a Glance', [
    { label: 'CRM Leads', value: fmtN(careers.now.leads), delta: { pct: gazDeltaPct(careers.now.leads, careers.prev.leads), goodIfUp: true }, compareLabel: 'vs prior period' },
    { label: 'Interested', value: fmtN(careers.now.interested), delta: { pct: gazDeltaPct(careers.now.interested, careers.prev.interested), goodIfUp: true }, compareLabel: 'vs prior period' },
    { label: 'Won', value: fmtN(careers.now.won), delta: { pct: gazDeltaPct(careers.now.won, careers.prev.won), goodIfUp: true }, compareLabel: 'vs prior period' },
    { label: 'Won Rate', value: wonRateNow == null ? '&mdash;' : fmtPct(wonRateNow), sub: wonRatePrev == null ? '' : 'prior ' + fmtPct(wonRatePrev) },
  ], 'This period ' + since + ' to ' + until + ' &middot; prior period ' + prevSince + ' to ' + prevUntil + '. Ranked by CRM leads, not spend -- Leverage Careers spend is not attributed at the campaign level in this cache.')
  const funnelC = T.funnelViz('Funnel, This Period', [{ label: 'CRM Leads', value: careers.now.leads, color: T.NAVY }, { label: 'Interested', value: careers.now.interested, color: T.BLUE }, { label: 'Won', value: careers.now.won, color: T.GREEN }])
  const chartC = T.dayBarChart(careers.daySeries.map(d => ({ label: gazDayLabel(d.date), value: d.leads, tip: d.date + ': ' + fmtN(d.leads) + ' leads, ' + fmtN(d.won) + ' won' })))
  const campRow = c => ({ cells: [{ text: c.campaign }, { html: fmtN(c.leads), align: 'right' }, { html: fmtN(c.interested), align: 'right' }, { html: fmtN(c.won), align: 'right' }] })
  const tableC = T.sectionTitle('Top Campaigns by CRM Leads') + T.dataTable([{ label: 'Campaign' }, { label: 'Leads', align: 'right' }, { label: 'Interested', align: 'right' }, { label: 'Won', align: 'right' }], careers.campaigns.map(campRow))
  const sectionsC = T.sectionHeader('C', 'Talent Mobility', 'Leverage Careers &middot; Leads, Interest and Won Deals') + T.paragraph(prose.sectionC.intro, { size: 16, mb: 20 })
    + kpiC + T.sectionTitle('Funnel and Daily Volume') + funnelC + chartC + tableC
    + T.editorsNote("Editor's Notes, Talent", '', prose.sectionC.notes)

  const dateLabel = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })
  const edition = Math.max(1, Math.ceil((Date.now() - new Date('2026-01-01').getTime()) / 86400000))
  const editionsInside = [
    { letter: 'A', title: 'Marketing and Growth', teaser: 'Total QL ' + fmtN(m.totals.now.totalQL) + ', CPQL ' + fmtINR(m.totals.now.cpql).replace(/&#8377;/, '₹') },
    { letter: 'B', title: 'Corporate Finance', teaser: b2c.configured ? ('Net ' + fmtINR(b2c.pnl.now.net).replace(/&#8377;/, '₹') + ' on ' + fmtINR(b2c.pnl.now.totalRev).replace(/&#8377;/, '₹') + ' revenue') : 'Not yet connected' },
    { letter: 'C', title: 'Talent Mobility', teaser: fmtN(careers.now.leads) + ' leads, ' + fmtN(careers.now.won) + ' won' },
  ]
  const html = T.assemble({
    editionNo: edition, dateLabel, throughLabel: 'Through ' + until, editionsInside,
    sectionsA, sectionsB, sectionsC,
    sources: [
      { letter: 'M', label: 'Marketing:', detail: 'overall_funnel_daily cache, the same source Ask AI’s campaign-contribution tool reads.' },
      { letter: 'F', label: 'Finance:', detail: 'the Daily P&L / Daily Cash Flow finance sheet, same as the CEO B2C dashboards.' },
      { letter: 'T', label: 'Talent:', detail: 'leverage_careers_daily cache, synced from BigQuery three times a day.' },
    ],
    notice: 'Regenerated fresh every edition from live data — never a re-run of a stale one. Compiled by the Quantum Gazette agent.',
  })
  return { html, usage }
}

async function handleAgentRun(req, res, me) {
  const agentId = req.body?.agent_id || 'marketing_performance'
  const agent = AGENTS[agentId]
  if (!agent) return res.status(400).json({ error: 'Unknown agent_id: ' + agentId })
  const triggeredBy = me ? me.email : 'cron'
  const startedAt = new Date().toISOString()
  // Blocks BOTH the scheduled cron run and a manual "Run now" click -- when off,
  // nobody can trigger this agent until it's switched back on in Settings/Agents.
  if (!(await isAgentEnabled(agentId))) {
    await logAgentRun({ agentId, title: `${agent.label} — disabled`, summary: 'This agent is turned off.', content: '', status: 'skipped', toolCallsCount: 0, startedAt, finishedAt: startedAt, triggeredBy })
    return res.status(200).json({ ok: false, skipped: true, reason: 'This agent is turned off in Settings/Agents.' })
  }
  try {
    // The Gazette (full-fidelity rebuild, 2026-08-25) is no longer an LLM
    // tool-loop agent -- it fetches deterministic data directly and makes one
    // short, structured-output prose call. Every other agent is unaffected.
    if (agent.isGazetteV2) {
      const { since, until, prevSince, prevUntil } = agent.buildRange()
      const { html, usage } = await buildQuantumGazetteEdition({ since, until, prevSince, prevUntil })
      const finishedAt = new Date().toISOString()
      const title = `${agent.label} — ${since} to ${until}`
      let gazetteSaveError = null
      try { await saveGazetteHtml(html) } catch (e) { gazetteSaveError = e.message }
      const summaryLine = `${since} to ${until} vs ${prevSince} to ${prevUntil} · Marketing, Corporate Finance, Talent Mobility.`
      const runId = await logAgentRun({ agentId, title, summary: summaryLine, content: html, status: 'ok', toolCallsCount: 0, startedAt, finishedAt, triggeredBy })
      await logUsage({ convId: null, userId: 'agent:' + agentId, model: MODEL, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens })
      return res.status(200).json({ ok: true, runId, title, gazetteSaveError })
    }
    const systemText = await buildSystemPrompt((await getTokenFromSupabase()) || '', [])
    const { text: userText, since, until } = agent.buildPrompt()
    const tools = agent.tools || [META_TOOL, META_CRM_TOOL, GOOGLE_ADS_TOOL, GOOGLE_CRM_TOOL, CONTRIBUTION_TOOL]
    const { text, totalInputTokens, totalOutputTokens, toolCallsCount } = await runAgentToolLoop({
      system: [{ type: 'text', text: systemText }], userText, tools, agentId,
    })
    const finishedAt = new Date().toISOString()
    const title = `${agent.label} — ${since} to ${until}`
    const summaryLine = (text.split('\n').find(l => l.trim() && !l.trim().startsWith('#')) || '').replace(/[*_`]/g, '').slice(0, 200)
    const runId = await logAgentRun({ agentId, title, summary: summaryLine, content: text, status: 'ok', toolCallsCount, startedAt, finishedAt, triggeredBy })
    await logUsage({ convId: null, userId: 'agent:' + agentId, model: MODEL, inputTokens: totalInputTokens, outputTokens: totalOutputTokens })
    return res.status(200).json({ ok: true, runId, title })
  } catch (e) {
    await logAgentRun({ agentId, title: `${agent.label} — failed`, summary: e.message, content: '', status: 'error', error: e.message, toolCallsCount: 0, startedAt, finishedAt: new Date().toISOString(), triggeredBy })
    return res.status(500).json({ error: e.message })
  }
}

// -- handler -------------------------------------------------------------------
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    return res.status(200).end()
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' })

  if (req.body && req.body.mode === 'agent_run') {
    if (req.body.triggered_by === 'cron') {
      const provided = req.headers['x-cron-secret']
      if (!process.env.CRON_SECRET || provided !== process.env.CRON_SECRET) return res.status(403).json({ error: 'Forbidden' })
      return handleAgentRun(req, res, null)
    }
    const agentMe = getSessionUser(req)
    if (!agentMe) return res.status(401).json({ error: 'Not signed in' })
    if (agentMe.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
    return handleAgentRun(req, res, agentMe)
  }

  // Raw contribution numbers with no LLM call in the path -- lets a real dashboard UI
  // (the "Daily marketing performance" report page) render the same deterministic
  // Channel/Action/evidence data the agent uses, without the cost/latency of a Claude
  // round-trip on every page load or channel-selector click.
  if (req.body && req.body.mode === 'contribution_data') {
    const dataMe = getSessionUser(req)
    if (!dataMe) return res.status(401).json({ error: 'Not signed in' })
    if (!canAccessDashboard(dataMe.role, 'ask_ai')) return res.status(403).json({ error: 'Forbidden' })
    const result = await analyzeCampaignContribution(req.body || {})
    if (result.error) return res.status(400).json(result)
    return res.status(200).json(result)
  }

  const me = getSessionUser(req)
  if (!me) return res.status(401).json({ error: 'Not signed in' })
  if (!canAccessDashboard(me.role, 'ask_ai')) return res.status(403).json({ error: 'Forbidden' })

  if (req.body && req.body.action === 'regenerate_memory') {
    return handleRegenerateMemory(res, me)
  }

  const { messages=[], history=[], metaToken: clientToken='', memories=[], platformScope='all', convId=null } = req.body||{}
  if (!messages.length) return res.status(400).json({ error: 'No messages' })

  const metaToken = clientToken || await getTokenFromSupabase() || ''

  try {
    const system = await buildSystemPrompt(metaToken, memories)

    const raw = [
      ...history.map(m=>({role:m.role, content:String(m.content||'').trim()})),
      ...messages.map(m=>({role:m.role||'user', content:String(m.content||'').trim()})),
    ].filter(m=>(m.role==='user'||m.role==='assistant')&&m.content)

    const merged = []
    for (const msg of raw) {
      if (merged.length && merged[merged.length-1].role===msg.role) {
        merged[merged.length-1].content += '\n\n' + msg.content
      } else {
        merged.push({...msg})
      }
    }
    while (merged.length && merged[0].role==='assistant') merged.shift()
    if (!merged.length) return res.status(400).json({ error: 'No valid user message' })

    let currentMessages = [...merged]
    let totalInputTokens = 0, totalOutputTokens = 0
    const MAX_TOOL_ROUNDS = 5
    // User can scope the platform via the composer dropdown — restrict which
    // tools the model even sees, instead of relying on it to infer scope from
    // the question text (faster + more accurate tool decisions).
    const ALL_TOOLS = platformScope === 'meta' ? [META_TOOL, META_CRM_TOOL, CONTRIBUTION_TOOL, OVERALL_TOTALS_TOOL]
      : platformScope === 'google' ? [GOOGLE_ADS_TOOL, GOOGLE_CRM_TOOL, CONTRIBUTION_TOOL, OVERALL_TOTALS_TOOL]
      : [META_TOOL, META_CRM_TOOL, GOOGLE_ADS_TOOL, GOOGLE_CRM_TOOL, CONTRIBUTION_TOOL, OVERALL_TOTALS_TOOL]

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const anthropicRes = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'prompt-caching-2024-07-31',
        },
        body: JSON.stringify({
          model: TOOL_MODEL,
          max_tokens: 1024,
          stream: false,
          tools: ALL_TOOLS,
          tool_choice: { type: 'auto' },
          system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
          messages: currentMessages,
        }),
      })

      if (!anthropicRes.ok) {
        const err = await anthropicRes.json().catch(()=>({}))
        const msg = err?.error?.message || `Anthropic API error ${anthropicRes.status}`
        if (res.headersSent) { res.write(`data: ${JSON.stringify({error:msg})}\n\n`); res.end(); return }
        return res.status(anthropicRes.status).json({ error: msg })
      }

      const response = await anthropicRes.json()
      if (response.usage) { totalInputTokens += response.usage.input_tokens || 0; totalOutputTokens += response.usage.output_tokens || 0 }
      const toolUseBlocks = (response.content || []).filter(b => b.type === 'tool_use')

      if (toolUseBlocks.length === 0 || response.stop_reason === 'end_turn') {
        const textContent = (response.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
        if (textContent) {
          if (!res.headersSent) {
            res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
            res.setHeader('Cache-Control', 'no-cache, no-transform')
            res.setHeader('X-Accel-Buffering', 'no')
          }
          const chars = textContent.split('')
          const CHUNK_SIZE = 20
          for (let i = 0; i < chars.length; i += CHUNK_SIZE) {
            const chunk = chars.slice(i, i + CHUNK_SIZE).join('')
            res.write(`data: ${JSON.stringify({delta: chunk})}\n\n`)
            await new Promise(r => setTimeout(r, 0))
          }
          await logUsage({ convId, userId: me.email, model: TOOL_MODEL, inputTokens: totalInputTokens, outputTokens: totalOutputTokens })
          res.write(`data: ${JSON.stringify({done: true, content: textContent})}\n\n`)
          res.end()
          return
        }
        break
      }

      const assistantMessage = { role: 'assistant', content: response.content }
      const toolResults = []

      // Committing to streaming mode here: we know at least one real tool call is about to run,
      // so open the SSE channel now to emit a "what I checked" trace event per tool as it completes
      // (collapsed-by-default UI above the answer), instead of only logging to the admin audit log.
      if (!res.headersSent) {
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
        res.setHeader('Cache-Control', 'no-cache, no-transform')
        res.setHeader('X-Accel-Buffering', 'no')
      }

      // Tool calls within a round are independent of each other (each result is
      // paired back to the model purely by tool_use_id, order doesn't matter),
      // so run them concurrently instead of one at a time -- a cross-channel
      // question that needs both Meta and Google data was previously paying
      // for two sequential API round-trips instead of the slower of the two.
      const CACHEABLE_TOOLS = new Set(['query_meta_ads', 'query_google_ads', 'query_meta_crm_leads', 'query_google_crm_leads', 'analyze_campaign_contribution', 'get_overall_totals'])
      const runOneTool = async (toolUse) => {
        const cacheKey = CACHEABLE_TOOLS.has(toolUse.name) ? toolCacheKey(toolUse.name, toolUse.input) : null
        const cached = cacheKey ? getCachedToolResult(cacheKey) : null
        let result
        const _toolT0 = Date.now()
        if (cached) {
          result = cached
        } else if (toolUse.name === 'query_meta_ads') {
          result = await executeMetaQuery(metaToken, toolUse.input || {})
        } else if (toolUse.name === 'query_google_ads') {
          result = await executeGoogleAdsQuery(toolUse.input || {})
        } else if (toolUse.name === 'query_meta_crm_leads') {
          const url = (await getSheetOverride('sheet_url_fbleads')) || FB_LEADS_SHEET
          result = await fetchCrmLeads(url, toolUse.input || {})
        } else if (toolUse.name === 'query_google_crm_leads') {
          const url = (await getSheetOverride('sheet_url_googleleads')) || GOOGLE_LEADS_SHEET
          result = await fetchCrmLeads(url, toolUse.input || {})
        } else if (toolUse.name === 'analyze_campaign_contribution') {
          result = await analyzeCampaignContribution(toolUse.input || {})
        } else if (toolUse.name === 'get_overall_totals') {
          result = await fetchOverallTotals(toolUse.input || {})
        } else {
          result = { error: 'Unknown tool: ' + toolUse.name }
        }
        const hadError = !!(result && result.error)
        if (cacheKey && !cached && !hadError) setCachedToolResult(cacheKey, result)
        await logToolCall({ convId, userId: me.email, toolName: toolUse.name, params: toolUse.input, rowCount: resultRowCount(result), latencyMs: Date.now() - _toolT0, hadError })
        res.write(`data: ${JSON.stringify({tool_call:{name:toolUse.name, summary:buildToolSummary(toolUse.name,toolUse.input), error:hadError}})}\n\n`)
        return { type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(result) }
      }
      const parallelResults = await Promise.all(toolUseBlocks.map(runOneTool))
      toolResults.push(...parallelResults)

      currentMessages = [
        ...currentMessages,
        assistantMessage,
        { role: 'user', content: toolResults }
      ]
    }

    const finalRes = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8192,
        stream: true,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: currentMessages,
      }),
    })

    if (!finalRes.ok) {
      const err = await finalRes.json().catch(()=>({}))
      const msg = err?.error?.message || 'Final stream error'
      if (res.headersSent) { res.write(`data: ${JSON.stringify({error:msg})}\n\n`); res.end(); return }
      return res.status(finalRes.status).json({ error: msg })
    }

    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache, no-transform')
      res.setHeader('X-Accel-Buffering', 'no')
    }

    const reader = finalRes.body.getReader()
    const decoder = new TextDecoder()
    let buffer = '', fullText = ''
    let finalInputTokens = 0, finalOutputTokens = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream:true })
      const lines = buffer.split('\n')
      buffer = lines.pop()
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data==='[DONE]') continue
        try {
          const parsed = JSON.parse(data)
          if (parsed.type==='message_start' && parsed.message?.usage) {
            finalInputTokens = parsed.message.usage.input_tokens || 0
          }
          if (parsed.type==='message_delta' && parsed.usage) {
            finalOutputTokens = parsed.usage.output_tokens || 0
          }
          if (parsed.type==='content_block_delta' && parsed.delta?.type==='text_delta') {
            const text = parsed.delta.text
            fullText += text
            res.write(`data: ${JSON.stringify({delta:text})}\n\n`)
          }
        } catch {}
      }
    }

    totalInputTokens += finalInputTokens
    totalOutputTokens += finalOutputTokens
    await logUsage({ convId, userId: me.email, model: MODEL, inputTokens: totalInputTokens, outputTokens: totalOutputTokens })

    res.write(`data: ${JSON.stringify({done:true, content:fullText})}\n\n`)
    res.end()

  } catch(e) {
    const msg = e?.message || 'Internal server error'
    if (res.headersSent) { res.write(`data: ${JSON.stringify({error:msg})}\n\n`); res.end() }
    else res.status(500).json({ error: msg })
  }
}

// Named exports for send-report.mjs's Slack @mention Q&A (api/send-report.mjs) --
// a plain, non-streaming way to run the same Claude + tool-use loop this file's
// own default handler and autonomous agents use, without importing the whole
// interactive/SSE machinery. Nothing here changes behavior for the default export.
export { runAgentToolLoop, CONTRIBUTION_TOOL, OVERALL_TOTALS_TOOL }
