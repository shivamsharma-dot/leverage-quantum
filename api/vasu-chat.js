// api/vasu-chat.js — VASU AI · Production · Claude-powered · SSE streaming

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MODEL         = 'claude-sonnet-4-5'

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

// ── data fetchers ─────────────────────────────────────────────────────────────
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

    // Fetch account insights + campaigns + ad sets in parallel
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
    const getActVal = (actions, type) => parseFloat(actions?.find(a=>a.action_type===type)?.value||0)

    const leads      = getAct(acc.actions, ['onsite_conversion.lead_grouped','lead','complete_registration'])
    const spend      = parseFloat(acc.spend||0)
    const impr       = parseInt(acc.impressions||0)
    const clicks     = parseInt(acc.clicks||0)
    const reach      = parseInt(acc.reach||0)
    const freq       = parseFloat(acc.frequency||0)
    const ctr        = parseFloat(acc.ctr||0)
    const cpm        = parseFloat(acc.cpm||0)
    const cpl        = leads>0 ? spend/leads : 0

    const lines = [
      'META ADS DATA (last 30 days):',
      `  ACCOUNT OVERVIEW:`,
      `    Spend: ${fmtINR(spend)} | Impressions: ${impr.toLocaleString()} | Reach: ${reach.toLocaleString()}`,
      `    Clicks: ${clicks.toLocaleString()} | CTR: ${ctr.toFixed(2)}% | CPM: ${fmtINR(cpm)} | Frequency: ${freq.toFixed(2)}`,
      `    Leads: ${leads.toLocaleString()} | CPL: ${cpl>0?fmtINR(cpl):'N/A'}`,
    ]

    // Campaign breakdown
    const camps = campData.data || []
    if (camps.length) {
      lines.push(`  CAMPAIGN BREAKDOWN (${camps.length} campaigns):`)
      camps.forEach(c => {
        const ci      = c.insights?.data?.[0] || {}
        const cSpend  = parseFloat(ci.spend||0)
        const cImpr   = parseInt(ci.impressions||0)
        const cClicks = parseInt(ci.clicks||0)
        const cCTR    = parseFloat(ci.ctr||0)
        const cCPM    = parseFloat(ci.cpm||0)
        const cFreq   = parseFloat(ci.frequency||0)
        const cReach  = parseInt(ci.reach||0)
        const cLeads  = getAct(ci.actions, ['onsite_conversion.lead_grouped','lead','complete_registration'])
        const cCPL    = cLeads>0 ? cSpend/cLeads : 0
        const cpa     = ci.cost_per_action_type?.find(a=>a.action_type==='lead')?.value
        lines.push(`    ▸ ${c.name}`)
        lines.push(`      Status: ${c.status} | Objective: ${c.objective||'N/A'} | Spend: ${fmtINR(cSpend)}`)
        lines.push(`      Reach: ${cReach.toLocaleString()} | Freq: ${cFreq.toFixed(2)} | CTR: ${cCTR.toFixed(2)}% | CPM: ${fmtINR(cCPM)}`)
        lines.push(`      Leads: ${cLeads} | CPL: ${cCPL>0?fmtINR(cCPL):'N/A'} | Clicks: ${cClicks.toLocaleString()}`)
        // Flag fatigue
        if (cFreq > 3.5) lines.push(`      ⚠ FATIGUE: Frequency ${cFreq.toFixed(1)} > 3.5 threshold`)
        if (cCTR < 0.5 && cSpend > 5000) lines.push(`      ⚠ LOW CTR: ${cCTR.toFixed(2)}% with significant spend`)
      })
    }

    // Ad set level insights
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

// ── SYSTEM PROMPT — 40 years experience level ────────────────────────────────
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

  return `You are VASU — the Chief Marketing Intelligence Officer of Leverage Edu, built into Leverage Quantum, their internal analytics platform.

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
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${meta}

${qlops}

${whatsapp}

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
7. NEVER FABRICATE — if data is missing, say exactly what you need and why
8. CROSS-CHANNEL THINKING — always look for Meta→QL→WhatsApp connections
9. SEASONAL AWARENESS — India study abroad peaks: Jan–Mar (UK/Canada intake), Jul–Sep (Jan intake)
10. ALWAYS GIVE NEXT STEPS — end every analysis with ranked actions

REPORT STRUCTURE (use when generating reports):
## [Report Title]
**Period:** [dates]
**Executive Summary** (3–5 bullets — what matters most)

### Performance Data
| Metric | Current | Benchmark | Status |
| ------ | ------- | --------- | ------ |

### Key Findings
(numbered, specific, with data citations)

### Risk Flags ⚠
(anything needing immediate attention)

### Recommended Actions
| Priority | Action | Expected Impact | Timeline |
| -------- | ------ | --------------- | -------- |

---
*Data sources: [list which sources used]*

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

  const { messages=[], history=[], metaToken='', memories=[] } = req.body||{}
  if (!messages.length) return res.status(400).json({ error: 'No messages' })

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

    // Call Anthropic API with streaming
    const anthropicRes = await fetch(ANTHROPIC_URL, {
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
        system,
        messages: merged,
      }),
    })

    if (!anthropicRes.ok) {
      const err = await anthropicRes.json().catch(()=>({}))
      const msg = err?.error?.message || `Anthropic API error ${anthropicRes.status}`
      return res.status(anthropicRes.status).json({ error: msg })
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('X-Accel-Buffering', 'no')

    const reader  = anthropicRes.body.getReader()
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
