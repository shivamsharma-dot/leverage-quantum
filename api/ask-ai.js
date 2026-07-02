// api/ask-ai.js — Ask AI · Production · Claude-powered · SSE streaming · Meta Tool Use

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MODEL         = 'claude-sonnet-4-5'
const TOOL_MODEL = 'claude-3-5-haiku-latest' // fast model for intermediate tool-decision rounds; final answer stays on MODEL
const SB_URL        = process.env.SUPABASE_URL        || 'https://tsyekthwthxszmsgqfej.supabase.co'
const SB_KEY        = process.env.SUPABASE_SERVICE_ROLE_KEY

const QLOPS_SHEET = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRVF7R3Me4QPVaRS_n_OufcMrrgYvCt3Rs7yJUG0u4gEMd0cVL9IyP2aV6J8HDjOZrvWzcemgHwZaHs/pub?gid=0&single=true&output=csv'
const WA_SHEET    = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRVF7R3Me4QPVaRS_n_OufcMrrgYvCt3Rs7yJUG0u4gEMd0cVL9IyP2aV6J8HDjOZrvWzcemgHwZaHs/pub?gid=1222628502&single=true&output=csv'
const AD_ACCOUNT  = 'act_641914389215638'
const MONTHS      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── helpers ───────────────────────────────────────────────────────────────────
async function safeFetch(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(9000) })
    return r.ok ? r : null
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

function monthFromISO(s) {
  const clean = (s||'').replace(/"/g,'').trim()
  const p = clean.split('-')
  if (p.length===3 && p[0].length===4) {
    const mo = parseInt(p[1])-1
    return mo>=0&&mo<12 ? MONTHS[mo]+' '+p[0] : ''
  }
  return ''
}

// ── get Meta token from Supabase if not provided ─────────────────────────────
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

// ── Meta Graph API query tool ─────────────────────────────────────────────────
// This is the tool Claude calls to fetch any Meta data it needs
async function executeMetaQuery(token, { endpoint, fields, date_preset, time_range, level, limit, filters, breakdowns }) {
  if (!token) return { error: 'No Meta token available. Ask user to connect Meta Ads from the Meta Ads dashboard.' }

  try {
    // Build endpoint path
    // endpoint can be: 'account/insights', 'campaigns', 'adsets', 'ads', 'account/campaigns', etc.
    let path = endpoint || `${AD_ACCOUNT}/insights`

    // If endpoint doesn't include account prefix, add it
    if (!path.includes('/') || path.startsWith('campaigns') || path.startsWith('adsets') || path.startsWith('ads')) {
      path = `${AD_ACCOUNT}/${path}`
    }

    const params = { access_token: token }
    if (fields) params.fields = fields
    if (limit)  params.limit = String(Math.min(parseInt(limit)||50, 200))

    // Date range
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

    const qs  = new URLSearchParams(params).toString()
    const url = `https://graph.facebook.com/v19.0/${path}?${qs}`

    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
    const data = await res.json()

    if (data.error) {
      return {
        error: `Meta API error: ${data.error.message} (code ${data.error.code})`,
        hint: data.error.code === 190 ? 'Token expired — user must reconnect from Meta Ads dashboard.' : undefined
      }
    }

    // Return structured result with summary
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

// ── tool definition for Claude ────────────────────────────────────────────────
const META_TOOL = {
  name: 'query_meta_ads',
  description: `Query Meta Ads Graph API for any data needed to answer the user's question.
The ad account is act_641914389215638 (Leverage Edu).
Use this tool whenever you need:
- Data for specific date ranges (last 7 days, last month, specific month, year-to-date, etc.)
- Ad-level data (creative performance, individual ad metrics)
- Campaign or adset breakdowns by placement, age, gender, device, region
- Custom time ranges (e.g. May 2025, Jan–Mar 2026)
- Metrics not in the initial context (video views, landing page clicks, conversion rates, etc.)
- Comparative data (this week vs last week, this month vs last month)
You can call this tool multiple times to gather all data needed. Always prefer live data over estimates.`,
  input_schema: {
    type: 'object',
    properties: {
      endpoint: {
        type: 'string',
        description: `API endpoint path relative to account. Examples:
- "insights" → account-level insights
- "campaigns" → list campaigns
- "campaigns?fields=name,status,insights{spend,leads}" → campaigns with nested insights
- "adsets" → list ad sets
- "ads" → list ads with metrics
- "ads?fields=name,status,creative{thumbnail_url,body},insights{spend,clicks,ctr,actions}" → ad creatives
Nested insights fields: use "insights{field1,field2}" syntax within campaigns/adsets/ads endpoints.`
      },
      fields: {
        type: 'string',
        description: `Fields to fetch. For insights endpoints: spend,impressions,reach,clicks,ctr,cpm,cpp,frequency,actions,action_values,cost_per_action_type,unique_clicks,cost_per_unique_click,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions,outbound_clicks,landing_page_views. For campaign/adset/ad list endpoints: name,status,objective,daily_budget,lifetime_budget,effective_status,created_time,updated_time,insights{spend,impressions,clicks,ctr,cpm,frequency,reach,actions}`
      },
      date_preset: {
        type: 'string',
        enum: ['today', 'yesterday', 'this_week_mon_today', 'last_week_mon_sun', 'last_7d', 'last_14d', 'last_30d', 'last_90d', 'this_month', 'last_month', 'last_3d', 'maximum'],
        description: 'Predefined date range. Use time_range for specific dates.'
      },
      time_range: {
        type: 'object',
        properties: {
          since: { type: 'string', description: 'Start date YYYY-MM-DD' },
          until: { type: 'string', description: 'End date YYYY-MM-DD' }
        },
        description: 'Custom date range. Use this for specific months like May 2025: {"since":"2025-05-01","until":"2025-05-31"}'
      },
      level: {
        type: 'string',
        enum: ['account', 'campaign', 'adset', 'ad'],
        description: 'Aggregation level for insights endpoint. Omit for campaign/adset/ad list endpoints.'
      },
      limit: {
        type: 'integer',
        description: 'Number of records to return (max 200). Default 50.'
      },
      breakdowns: {
        type: 'array',
        items: { type: 'string' },
        description: 'Break down insights by: age, gender, country, region, device_platform, publisher_platform, platform_position, impression_device, hourly_stats_aggregated_by_advertiser_time_zone'
      },
      filters: {
        type: 'array',
        items: { type: 'object' },
        description: 'Filter records. Example: [{"field":"effective_status","operator":"IN","value":["ACTIVE"]}]'
      }
    },
    required: ['endpoint']
  }
}

// ── data fetchers (for initial context) ─────────────────────────────────────
async function getQLOpsData() {
  try {
    const r = await safeFetch(QLOPS_SHEET)
    if (!r) return 'QL Ops: UNAVAILABLE (sheet fetch failed)'
    const { h, rows } = parseCSV(await r.text())
    const map = {}
    rows.forEach(row => {
      const prov  = row[h('provider')]
      const month = row[h('qualified_month')]
      const count = parseInt(row[h('qualified_count')])||0
      if (!prov||!month||!count) return
      const k = `${month}||${prov}`
      if (!map[k]) map[k] = { month, provider:prov, count:0 }
      map[k].count += count
    })
    const allMonths = [...new Set(Object.values(map).map(e=>e.month))].sort().slice(-4)
    if (!allMonths.length) return 'QL Ops: no data found in sheet'
    const lines = ['QL OPS DATA (last 4 months):']
    allMonths.forEach(m => {
      const entries = Object.values(map).filter(e=>e.month===m)
      const total   = entries.reduce((s,e)=>s+e.count,0)
      lines.push(`  ${m}: Total ${total.toLocaleString()} qualified leads`)
      entries.sort((a,b)=>b.count-a.count).forEach(e => {
        const share = total>0 ? (e.count/total*100).toFixed(1) : '0'
        lines.push(`    ${e.provider}: ${e.count.toLocaleString()} (${share}% share)`)
      })
    })
    return lines.join('\n')
  } catch(e) { return `QL Ops ERROR: ${e.message}` }
}

async function getWhatsAppData() {
  try {
    const r = await safeFetch(WA_SHEET)
    if (!r) return 'WhatsApp: UNAVAILABLE (sheet fetch failed)'
    const { h, rows } = parseCSV(await r.text())
    const map = {}
    rows.forEach(row => {
      const month = monthFromISO(row[h('created_at')])
      if (!month) return
      if (!map[month]) map[month] = { month, sent:0, delivered:0, read:0, failed:0, replied:0, clicked:0, util:0, mkt:0 }
      map[month].sent      += parseFloat(row[h('sent_count')])||0
      map[month].delivered += parseFloat(row[h('delivered_count')])||0
      map[month].read      += parseFloat(row[h('read_count')])||0
      map[month].failed    += parseFloat(row[h('failed_count')])||0
      map[month].replied   += parseFloat(row[h('replied_count')])||0
      map[month].clicked   += parseFloat(row[h('clicked_count')])||0
      map[month].util      += parseFloat(row[h('utility_spends')])||0
      map[month].mkt       += parseFloat(row[h('marketing_spends')])||0
    })
    const months = Object.values(map).sort((a,b)=>a.month.localeCompare(b.month)).slice(-2)
    if (!months.length) return 'WhatsApp: no data found in sheet'
    const lines = ['WHATSAPP MARKETING DATA (last 2 months):']
    months.forEach(m => {
      const total = m.util + m.mkt
      const delR  = m.sent>0 ? (m.delivered/m.sent*100).toFixed(1) : '0'
      const readR = m.delivered>0 ? (m.read/m.delivered*100).toFixed(1) : '0'
      const ctr   = m.delivered>0 ? (m.clicked/m.delivered*100).toFixed(2) : '0'
      lines.push(`  ${m.month}:`)
      lines.push(`    Volume: Sent ${m.sent.toLocaleString()} | Delivered ${m.delivered.toLocaleString()} (${delR}%) | Read ${m.read.toLocaleString()} (${readR}%) | Failed ${m.failed.toLocaleString()}`)
      lines.push(`    Engagement: Replied ${m.replied.toLocaleString()} | Clicked ${m.clicked.toLocaleString()} (CTR ${ctr}%)`)
      lines.push(`    Spend: Total ${fmtINR(total)} | Utility ${fmtINR(m.util)} | Marketing ${fmtINR(m.mkt)}`)
      if (m.delivered>0) lines.push(`    CPD: ${fmtINR(total/m.delivered)} per delivered msg`)
    })
    return lines.join('\n')
  } catch(e) { return `WhatsApp ERROR: ${e.message}` }
}

async function getMetaData(token) {
  if (!token) return 'META ADS: NO TOKEN — Connect Meta Ads from the Meta Ads dashboard in Leverage Quantum to enable campaign data.'

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

    if (!accRes) return 'META ADS ERROR: API unreachable — token may be expired. Re-connect from Meta Ads dashboard.'

    const accData   = await accRes.json()
    const campData  = campRes  ? await campRes.json()  : { data: [] }
    const adsetData = adsetRes ? await adsetRes.json() : { data: [] }

    if (accData.error) {
      return `META ADS ERROR: ${accData.error.message} (Code: ${accData.error.code}). ${accData.error.code===190?'Token expired — re-connect from Meta Ads dashboard.':''}`
    }

    const acc    = accData.data?.[0] || {}
    const getAct = (actions, type) => {
      const types = Array.isArray(type) ? type : [type]
      return types.reduce((s,t) => s + parseInt(actions?.find(a=>a.action_type===t)?.value||0), 0)
    }

    const leads  = getAct(acc.actions, ['onsite_conversion.lead_grouped','lead','complete_registration'])
    const spend  = parseFloat(acc.spend||0)
    const impr   = parseInt(acc.impressions||0)
    const clicks = parseInt(acc.clicks||0)
    const reach  = parseInt(acc.reach||0)
    const freq   = parseFloat(acc.frequency||0)
    const ctr    = parseFloat(acc.ctr||0)
    const cpm    = parseFloat(acc.cpm||0)
    const cpl    = leads>0 ? spend/leads : 0

    const lines = [
      'META ADS DATA (last 30 days):',
      `  ACCOUNT OVERVIEW:`,
      `    Spend: ${fmtINR(spend)} | Impressions: ${impr.toLocaleString()} | Reach: ${reach.toLocaleString()}`,
      `    Clicks: ${clicks.toLocaleString()} | CTR: ${ctr.toFixed(2)}% | CPM: ${fmtINR(cpm)} | Frequency: ${freq.toFixed(2)}`,
      `    Leads: ${leads.toLocaleString()} | CPL: ${cpl>0?fmtINR(cpl):'N/A'}`,
    ]

    const camps = campData.data || []
    if (camps.length) {
      lines.push(`  CAMPAIGN BREAKDOWN (${camps.length} campaigns):`)
      camps.forEach(c => {
        const ci      = c.insights?.data?.[0] || {}
        const cSpend  = parseFloat(ci.spend||0)
        const cCTR    = parseFloat(ci.ctr||0)
        const cFreq   = parseFloat(ci.frequency||0)
        const cReach  = parseInt(ci.reach||0)
        const cLeads  = getAct(ci.actions, ['onsite_conversion.lead_grouped','lead','complete_registration'])
        const cCPL    = cLeads>0 ? cSpend/cLeads : 0
        lines.push(`    ▸ ${c.name}`)
        lines.push(`      Status: ${c.status} | Objective: ${c.objective||'N/A'} | Spend: ${fmtINR(cSpend)}`)
        lines.push(`      Reach: ${cReach.toLocaleString()} | Freq: ${cFreq.toFixed(2)} | CTR: ${cCTR.toFixed(2)}% | CPM: ${fmtINR(parseFloat(ci.cpm||0))}`)
        lines.push(`      Leads: ${cLeads} | CPL: ${cCPL>0?fmtINR(cCPL):'N/A'} | Clicks: ${parseInt(ci.clicks||0).toLocaleString()}`)
        if (cFreq > 3.5) lines.push(`      ⚠ FATIGUE: Frequency ${cFreq.toFixed(1)} > 3.5 threshold`)
        if (cCTR < 0.5 && cSpend > 5000) lines.push(`      ⚠ LOW CTR: ${cCTR.toFixed(2)}% with significant spend`)
      })
    }

    const adsets = adsetData.data || []
    if (adsets.length) {
      lines.push(`  TOP AD SETS BY SPEND:`)
      adsets.sort((a,b)=>(parseFloat(b.spend||0))-(parseFloat(a.spend||0))).slice(0,8).forEach(as => {
        const asLeads = getAct(as.actions, ['onsite_conversion.lead_grouped','lead'])
        const asSpend = parseFloat(as.spend||0)
        const asCPL   = asLeads>0 ? asSpend/asLeads : 0
        lines.push(`    • ${as.adset_name||as.campaign_name||'Ad Set'}: Spend ${fmtINR(asSpend)} | CTR ${parseFloat(as.ctr||0).toFixed(2)}% | Leads ${asLeads} | CPL ${asCPL>0?fmtINR(asCPL):'N/A'} | Freq ${parseFloat(as.frequency||0).toFixed(2)}`)
      })
    }

    return lines.join('\n')
  } catch(e) { return `META ADS ERROR: ${e.message}` }
}

// ── SYSTEM PROMPT ─────────────────────────────────────────────────────────────
async function buildSystemPrompt(metaToken, memories) {
  const [qlops, whatsapp, meta] = await Promise.all([
    getQLOpsData(),
    getWhatsAppData(),
    getMetaData(metaToken),
  ])
  const today = new Date().toLocaleDateString('en-IN', { weekday:'long', year:'numeric', month:'long', day:'numeric' })
  const memoriesSection = memories?.length
    ? `\n━━━ REMEMBERED CONTEXT (from previous sessions) ━━━\n${memories.map(m=>`• ${m}`).join('\n')}`
    : ''

  return `You are the Chief Marketing Intelligence Officer of Leverage Edu, built into Leverage Quantum, their internal analytics platform.

You have 40 years of combined expertise across:
- Performance marketing (Meta, Google, WhatsApp) for Indian EdTech and D2C
- Lead generation funnels, qualification operations, and enrolment conversion
- Study abroad vertical: UK, Canada, Australia, USA, Ireland, Germany
- Indian digital advertising: CPL benchmarks, audience behaviors, seasonal patterns
- Marketing analytics, attribution, and data-driven decision making

Today: ${today}
${memoriesSection}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LIVE DATA — LEVERAGE EDU MARKETING
(Updated at session start — use query_meta_ads tool for different date ranges or deeper data)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${meta}

${qlops}

${whatsapp}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
META ADS TOOL ACCESS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You have the query_meta_ads tool for LIVE Meta Graph API access. Use it proactively when:
• The user asks about a specific date range not covered above (last 7 days, specific month, YTD, etc.)
• The user asks about individual ads or creatives
• The user asks about breakdowns (by age, gender, placement, device, country)
• The user asks for week-over-week or month-over-month comparisons
• You need more campaigns (above 20 shown), adsets, or ad-level data
• Any question where the initial context may not have the answer

Always call the tool rather than saying "I don't have that data." If the tool returns an error, report it clearly.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUSINESS & FUNNEL CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

COMPANY: Leverage Edu — India's leading study abroad platform
FUNNEL: Meta/Google Ad → Lead Form → Raw Lead → QL Call → Qualified Lead → Application → Enrolment
REVENUE MODEL: Commission per enrolled student (high LTV, typically ₹50K–₹2L per enrolment)

QUALIFICATION SYSTEM:
• Futwork = Human calling agents (higher quality, higher cost)
• Superbot = Automated IVR/bot qualification (lower cost, lower quality)
• QL Rate = Qualified Leads / Raw Leads (benchmark: 35–45% is good for study abroad)
• CPQL = Total Spend / Qualified Leads (the real cost metric, not just CPL)

META ADS BENCHMARKS (India, EdTech/Study Abroad):
• Good CPL: ₹150–400 | Alarm: >₹600
• Good CTR (Feed): 1.2–2.5% | Alarm: <0.8%
• Good Frequency: <3.0 | Fatigue: >3.5 Feed, >5 Reels
• Good CPM: ₹80–200 | Alarm: >₹350
• Audience size sweet spot: 2M–15M for cold, 100K–2M for retargeting

WHATSAPP BENCHMARKS (India, EdTech):
• Good Delivery Rate: >92% | Alarm: <85%
• Good Read Rate: >60% | Alarm: <40%
• Good CTR: >3% | Alarm: <1.5%
• CPD (cost per delivered): Good <₹0.50 for utility, <₹1.20 for marketing

ATTRIBUTION NOTE: Meta leads lag CRM by 24–72h. Never compare same-day Meta vs CRM numbers.
SPEND NOTE: Meta API returns INR for Indian accounts. Never apply USD→INR conversion.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR OPERATING PRINCIPLES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. DIAGNOSE FIRST — always identify the root cause before recommending action
2. PRIORITISE BY ₹ IMPACT — rank every recommendation by expected rupee impact
3. FLAG RISKS PROACTIVELY — don't wait to be asked; surface fatigue, CPL spikes, QL rate drops
4. BE SPECIFIC — "pause campaign X" not "consider pausing some campaigns"
5. SHOW YOUR WORKING — especially for calculations; don't just give answers
6. LABEL YOUR CONFIDENCE — data-backed vs industry benchmark vs inference
7. NEVER FABRICATE — if data is missing, use the tool to fetch it. Never make up numbers.
8. CROSS-CHANNEL THINKING — always look for Meta→QL→WhatsApp connections
9. SEASONAL AWARENESS — India study abroad peaks: Jan–Mar (UK/Canada intake), Jul–Sep (Jan intake)
10. ALWAYS GIVE NEXT STEPS — end every analysis with ranked actions

FORMAT RULES:
• Use ₹, K, L, Cr for all money
• Bold **key numbers**
• Use tables for comparisons (always)
• Use ⚠ for warnings, ✅ for positive signals, 📈 for growth, 📉 for decline`
}

// ── handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    return res.status(200).end()
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' })

  const { messages=[], history=[], metaToken: clientToken='', memories=[] } = req.body||{}
  if (!messages.length) return res.status(400).json({ error: 'No messages' })

  // Resolve Meta token: use client-provided token first, fall back to Supabase
  const metaToken = clientToken || await getTokenFromSupabase() || ''

  try {
    const system = await buildSystemPrompt(metaToken, memories)

    // Build clean alternating messages
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

    // ── Agentic tool-use loop (up to 5 tool calls) ────────────────────────────
    // We run non-streaming first to handle tool calls, then stream the final response
    let currentMessages = [...merged]
    const MAX_TOOL_ROUNDS = 5

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
          // On last round, stream. Otherwise collect tool calls.
          stream: false,
          tools: [META_TOOL],
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

      // Check if Claude wants to use tools
      const toolUseBlocks = (response.content || []).filter(b => b.type === 'tool_use')

      if (toolUseBlocks.length === 0 || response.stop_reason === 'end_turn') {
        // No more tool calls — stream the final text response
        const textContent = (response.content || []).filter(b => b.type === 'text').map(b => b.text).join('')

        // If we already have text, stream it directly
        if (textContent) {
          res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
          res.setHeader('Cache-Control', 'no-cache, no-transform')
          res.setHeader('X-Accel-Buffering', 'no')

          // Stream word by word for smooth UX
          const words = textContent.split('')
          let accumulated = ''
          const CHUNK_SIZE = 20 // characters per chunk

          for (let i = 0; i < words.length; i += CHUNK_SIZE) {
            const chunk = words.slice(i, i + CHUNK_SIZE).join('')
            accumulated += chunk
            res.write(`data: ${JSON.stringify({delta: chunk})}\n\n`)
            // Small yield to allow backpressure
            await new Promise(r => setTimeout(r, 0))
          }
          res.write(`data: ${JSON.stringify({done: true, content: textContent})}\n\n`)
          res.end()
          return
        }

        // Fallback: stream via fresh Anthropic call
        break
      }

      // Execute all tool calls in this round
      const assistantMessage = { role: 'assistant', content: response.content }
      const toolResults = []

      for (const toolUse of toolUseBlocks) {
        if (toolUse.name === 'query_meta_ads') {
          const result = await executeMetaQuery(metaToken, toolUse.input || {})
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(result)
          })
        }
      }

      // Add assistant message + tool results to conversation
      currentMessages = [
        ...currentMessages,
        assistantMessage,
        { role: 'user', content: toolResults }
      ]
    }

    // Final streaming call (fallback path or after tool rounds exhausted)
    const finalRes = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8192,
        stream: true,
        system: [{ type: 'text', text: system }],
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

    const reader  = finalRes.body.getReader()
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
