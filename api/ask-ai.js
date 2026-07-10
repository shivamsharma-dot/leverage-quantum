// api/ask-ai.js -- Ask AI - Production - Claude-powered - SSE streaming - Meta/Google/CRM Tool Use

// auth helpers are loaded via dynamic import() inside handler (ask-ai.js is bundled as CommonJS; static import of the .mjs ESM file crashes with ERR_REQUIRE_ESM)

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-5'
const TOOL_MODEL = MODEL // NOTE: intermediate rounds must call tools reliably; Haiku returned text without tool_use (leaked model name to user). Keep on MODEL.
const SB_URL = process.env.SUPABASE_URL || 'https://tsyekthwthxszmsgqfej.supabase.co'
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

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
  if (x >= 1e7) return 'Rs ' + (x/1e7).toFixed(2) + ' Cr'
  if (x >= 1e5) return 'Rs ' + (x/1e5).toFixed(1) + 'L'
  if (x >= 1000) return 'Rs ' + (x/1e3).toFixed(0) + 'K'
  return 'Rs ' + Math.round(x).toLocaleString('en-IN')
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

async function buildSystemPrompt(metaToken, memories) {
  const { meta, googleAds, metaCrm, googleCrm } = await getBaselineData(metaToken)
  const today = new Date().toLocaleDateString('en-IN', { weekday:'long', year:'numeric', month:'long', day:'numeric' })
  const memoriesSection = memories?.length
    ? `\n=== REMEMBERED CONTEXT (from previous sessions) ===\n${memories.map(m=>`- ${m}`).join('\n')}`
    : ''

  return `You are the Chief Marketing Intelligence Officer of Leverage Edu, built into Leverage Quantum, their internal analytics platform.

You have 40 years of combined expertise across:
- Performance marketing (Meta, Google) for Indian EdTech and D2C
- Lead generation funnels, CRM lead attribution, and enrolment conversion
- Study abroad vertical: UK, Canada, Australia, USA, Ireland, Germany
- Indian digital advertising: CPL benchmarks, audience behaviors, seasonal patterns
- Marketing analytics, attribution, and data-driven decision making

Today: ${today}
${memoriesSection}

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

===============================================
BUSINESS & FUNNEL CONTEXT
===============================================

COMPANY: Leverage Edu -- India's leading study abroad platform
FUNNEL: Meta/Google Ad -> Lead Form -> Raw Lead -> CRM Lead -> QL Call -> Qualified Lead -> Application -> Enrolment
REVENUE MODEL: Commission per enrolled student (high LTV, typically Rs 50K-2L per enrolment)

META ADS BENCHMARKS (India, EdTech/Study Abroad):
- Good CPL: Rs 150-400 | Alarm: >Rs 600
- Good CTR (Feed): 1.2-2.5% | Alarm: <0.8%
- Good Frequency: <3.0 | Fatigue: >3.5 Feed, >5 Reels
- Good CPM: Rs 80-200 | Alarm: >Rs 350
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
2. PRIORITISE BY Rs IMPACT -- rank every recommendation by expected rupee impact
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
- Use Rs, K, L, Cr for all money
- Bold **key numbers**
- Use tables for comparisons (always)
- Use [!] for warnings, [OK] for positive signals, [UP] for growth, [DOWN] for decline`
}

// -- handler -------------------------------------------------------------------
export default async function handler(req, res) {
  const { getSessionUser, canAccessDashboard } = await import('../lib/auth.mjs')
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    return res.status(200).end()
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' })

  const me = getSessionUser(req)
  if (!me) return res.status(401).json({ error: 'Not signed in' })
  if (!canAccessDashboard(me.role, 'ask_ai')) return res.status(403).json({ error: 'Forbidden' })

  const { messages=[], history=[], metaToken: clientToken='', memories=[] } = req.body||{}
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
    const MAX_TOOL_ROUNDS = 5
    const ALL_TOOLS = [META_TOOL, META_CRM_TOOL, GOOGLE_ADS_TOOL, GOOGLE_CRM_TOOL]

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
        return res.status(anthropicRes.status).json({ error: msg })
      }

      const response = await anthropicRes.json()
      const toolUseBlocks = (response.content || []).filter(b => b.type === 'tool_use')

      if (toolUseBlocks.length === 0 || response.stop_reason === 'end_turn') {
        const textContent = (response.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
        if (textContent) {
          res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
          res.setHeader('Cache-Control', 'no-cache, no-transform')
          res.setHeader('X-Accel-Buffering', 'no')
          const chars = textContent.split('')
          const CHUNK_SIZE = 20
          for (let i = 0; i < chars.length; i += CHUNK_SIZE) {
            const chunk = chars.slice(i, i + CHUNK_SIZE).join('')
            res.write(`data: ${JSON.stringify({delta: chunk})}\n\n`)
            await new Promise(r => setTimeout(r, 0))
          }
          res.write(`data: ${JSON.stringify({done: true, content: textContent})}\n\n`)
          res.end()
          return
        }
        break
      }

      const assistantMessage = { role: 'assistant', content: response.content }
      const toolResults = []

      for (const toolUse of toolUseBlocks) {
        let result
        if (toolUse.name === 'query_meta_ads') {
          result = await executeMetaQuery(metaToken, toolUse.input || {})
        } else if (toolUse.name === 'query_google_ads') {
          result = await executeGoogleAdsQuery(toolUse.input || {})
        } else if (toolUse.name === 'query_meta_crm_leads') {
          const url = (await getSheetOverride('sheet_url_fbleads')) || FB_LEADS_SHEET
          result = await fetchCrmLeads(url, toolUse.input || {})
        } else if (toolUse.name === 'query_google_crm_leads') {
          const url = (await getSheetOverride('sheet_url_googleleads')) || GOOGLE_LEADS_SHEET
          result = await fetchCrmLeads(url, toolUse.input || {})
        } else {
          result = { error: 'Unknown tool: ' + toolUse.name }
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(result)
        })
      }

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
      return res.status(finalRes.status).json({ error: err?.error?.message || 'Final stream error' })
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('X-Accel-Buffering', 'no')

    const reader = finalRes.body.getReader()
    const decoder = new TextDecoder()
    let buffer = '', fullText = ''

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
          if (parsed.type==='content_block_delta' && parsed.delta?.type==='text_delta') {
            const text = parsed.delta.text
            fullText += text
            res.write(`data: ${JSON.stringify({delta:text})}\n\n`)
          }
        } catch {}
      }
    }

    res.write(`data: ${JSON.stringify({done:true, content:fullText})}\n\n`)
    res.end()

  } catch(e) {
    const msg = e?.message || 'Internal server error'
    if (res.headersSent) { res.write(`data: ${JSON.stringify({error:msg})}\n\n`); res.end() }
    else res.status(500).json({ error: msg })
  }
}
