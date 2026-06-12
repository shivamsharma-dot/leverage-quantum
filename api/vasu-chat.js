// api/vasu-chat.js — VASU AI · Claude-powered · streaming SSE · no external SDK

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MODEL         = 'claude-sonnet-4-5'

const QLOPS_SHEET = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRVF7R3Me4QPVaRS_n_OufcMrrgYvCt3Rs7yJUG0u4gEMd0cVL9IyP2aV6J8HDjOZrvWzcemgHwZaHs/pub?gid=0&single=true&output=csv'
const WA_SHEET    = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRVF7R3Me4QPVaRS_n_OufcMrrgYvCt3Rs7yJUG0u4gEMd0cVL9IyP2aV6J8HDjOZrvWzcemgHwZaHs/pub?gid=1222628502&single=true&output=csv'
const AD_ACCOUNT  = 'act_641914389215638'
const MONTHS      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── helpers ───────────────────────────────────────────────────────────────────
async function safeFetch(url, opts = {}) {
  try {
    const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(9000) })
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

function monthFromISO(dateStr) {
  const clean = (dateStr || '').replace(/"/g,'').trim()
  const p = clean.split('-')
  if (p.length === 3 && p[0].length === 4) {
    const mo = parseInt(p[1]) - 1
    return mo >= 0 && mo < 12 ? MONTHS[mo] + ' ' + p[0] : ''
  }
  return ''
}

// ── data fetchers ─────────────────────────────────────────────────────────────
async function getQLOpsData() {
  try {
    const r = await safeFetch(QLOPS_SHEET)
    if (!r) return '⚠ QL Ops: sheet unavailable'
    const { h, rows } = parseCSV(await r.text())
    const map = {}
    rows.forEach(row => {
      const prov  = row[h('provider')]
      const month = row[h('qualified_month')]
      const count = parseInt(row[h('qualified_count')]) || 0
      if (!prov || !month || !count) return
      const k = `${month}||${prov}`
      if (!map[k]) map[k] = { month, provider: prov, count: 0 }
      map[k].count += count
    })
    const allMonths = [...new Set(Object.values(map).map(e => e.month))].sort().slice(-3)
    const lines = ['QL Ops (last 3 months):']
    allMonths.forEach(m => {
      const entries = Object.values(map).filter(e => e.month === m)
      const total   = entries.reduce((s,e) => s + e.count, 0)
      entries.sort((a,b) => b.count - a.count).forEach(e => {
        lines.push(`  ${m} | ${e.provider}: ${e.count.toLocaleString()} qualified | ${total > 0 ? (e.count/total*100).toFixed(1) : 0}% share | Total: ${total.toLocaleString()}`)
      })
    })
    return lines.join('\n')
  } catch(e) { return `⚠ QL Ops error: ${e.message}` }
}

async function getWhatsAppData() {
  try {
    const r = await safeFetch(WA_SHEET)
    if (!r) return '⚠ WhatsApp: sheet unavailable'
    const { h, rows } = parseCSV(await r.text())
    const map = {}
    rows.forEach(row => {
      const month = monthFromISO(row[h('created_at')])
      if (!month) return
      if (!map[month]) map[month] = { month, sent:0, delivered:0, read:0, failed:0, replied:0, clicked:0, util:0, mkt:0 }
      map[month].sent      += parseFloat(row[h('sent_count')])      || 0
      map[month].delivered += parseFloat(row[h('delivered_count')]) || 0
      map[month].read      += parseFloat(row[h('read_count')])      || 0
      map[month].failed    += parseFloat(row[h('failed_count')])    || 0
      map[month].replied   += parseFloat(row[h('replied_count')])   || 0
      map[month].clicked   += parseFloat(row[h('clicked_count')])   || 0
      map[month].util      += parseFloat(row[h('utility_spends')])  || 0
      map[month].mkt       += parseFloat(row[h('marketing_spends')])|| 0
    })
    const months = Object.values(map).slice(-2)
    if (!months.length) return '⚠ WhatsApp: no data found'
    const lines = ['WhatsApp Marketing (last 2 months):']
    months.forEach(m => {
      const delR  = m.sent > 0 ? (m.delivered/m.sent*100).toFixed(1) : '0'
      const readR = m.delivered > 0 ? (m.read/m.delivered*100).toFixed(1) : '0'
      const total = m.util + m.mkt
      lines.push(`  ${m.month}:`)
      lines.push(`    Sent: ${m.sent.toLocaleString()} | Delivered: ${m.delivered.toLocaleString()} (${delR}%) | Read: ${m.read.toLocaleString()} (${readR}%)`)
      lines.push(`    Replied: ${m.replied.toLocaleString()} | Clicked: ${m.clicked.toLocaleString()} | Failed: ${m.failed.toLocaleString()}`)
      lines.push(`    Spend: ${fmtINR(total)} (Utility: ${fmtINR(m.util)}, Marketing: ${fmtINR(m.mkt)})`)
    })
    return lines.join('\n')
  } catch(e) { return `⚠ WhatsApp error: ${e.message}` }
}

async function getMetaData(token) {
  if (!token) return '⚠ Meta Ads: not connected. User needs to connect from the Meta Ads dashboard.'
  try {
    const qs = p => new URLSearchParams({ access_token: token, ...p }).toString()
    const [accRes, campRes] = await Promise.all([
      safeFetch(`https://graph.facebook.com/v19.0/${AD_ACCOUNT}/insights?${qs({ fields:'spend,impressions,clicks,ctr,cpm,actions', date_preset:'last_30d', level:'account' })}`),
      safeFetch(`https://graph.facebook.com/v19.0/${AD_ACCOUNT}/campaigns?${qs({ fields:'name,status,insights{spend,impressions,clicks,ctr,actions}', date_preset:'last_30d', limit:15 })}`),
    ])
    if (!accRes) return '⚠ Meta Ads: API unreachable — token may be expired'
    const accData  = await accRes.json()
    const campData = campRes ? await campRes.json() : { data: [] }
    if (accData.error) return `⚠ Meta Ads API error: ${accData.error.message}`
    const acc    = accData.data?.[0] || {}
    const getAct = t => parseInt(acc.actions?.find(a => a.action_type === t)?.value || 0)
    const leads  = getAct('onsite_conversion.lead_grouped') || getAct('lead')
    const spend  = parseFloat(acc.spend || 0)
    const lines  = [
      'Meta Ads (last 30 days):',
      `  Spend: ${fmtINR(spend)} | Impressions: ${parseInt(acc.impressions||0).toLocaleString()} | Clicks: ${parseInt(acc.clicks||0).toLocaleString()}`,
      `  CTR: ${parseFloat(acc.ctr||0).toFixed(2)}% | CPM: ${fmtINR(parseFloat(acc.cpm||0))} | Leads: ${leads.toLocaleString()} | CPL: ${leads > 0 ? fmtINR(spend/leads) : 'N/A'}`,
    ]
    const camps = campData.data || []
    if (camps.length) {
      lines.push('  Top campaigns:')
      camps.slice(0, 12).forEach(c => {
        const ci     = c.insights?.data?.[0] || {}
        const cSpend = parseFloat(ci.spend || 0)
        const cLeads = parseInt(ci.actions?.find(a => a.action_type==='onsite_conversion.lead_grouped'||a.action_type==='lead')?.value || 0)
        lines.push(`    • ${c.name} [${c.status}] | Spend: ${fmtINR(cSpend)} | CTR: ${parseFloat(ci.ctr||0).toFixed(2)}% | Leads: ${cLeads} | CPL: ${cLeads>0?fmtINR(cSpend/cLeads):'N/A'}`)
      })
    }
    return lines.join('\n')
  } catch(e) { return `⚠ Meta Ads error: ${e.message}` }
}

// ── system prompt ─────────────────────────────────────────────────────────────
async function buildSystemPrompt(metaToken) {
  const [qlops, whatsapp, meta] = await Promise.all([
    getQLOpsData(),
    getWhatsAppData(),
    getMetaData(metaToken),
  ])
  const today = new Date().toLocaleDateString('en-IN', { weekday:'long', year:'numeric', month:'long', day:'numeric' })

  return `You are VASU AI — the intelligence layer inside Leverage Quantum, Leverage Edu's internal marketing analytics dashboard for the study-abroad vertical (UK, Canada, Australia, USA universities).

Today: ${today}

You have real-time live data from three sources:

━━━ 1. LEAD QUALIFICATION (QL Ops) ━━━
${qlops}

━━━ 2. WHATSAPP MARKETING ━━━
${whatsapp}

━━━ 3. META ADS ━━━
${meta}

━━━ BUSINESS CONTEXT ━━━
Conversion funnel: Meta Ad Impression → Click → Lead Form → QL (qualified lead) → Application → Enrolment
• Futwork = human calling agents who qualify raw leads
• Superbot = automated IVR/bot that qualifies leads
• QL Rate = Qualified / Total Leads (higher is better)
• WhatsApp is used for lead nurturing and re-engagement
• Meta spend is in INR (Indian accounts return INR directly — do NOT apply FX conversion)
• CRM leads typically lag Meta leads by 24–72h due to attribution

━━━ CAPABILITIES ━━━
1. Answer any question about the data — metrics, trends, anomalies, comparisons
2. Generate structured reports (ask for: weekly digest, monthly summary, QL ops report, WhatsApp report, Meta campaign report)
3. Cross-channel analysis — e.g. Meta CPL vs QL rate correlation, WhatsApp vs Meta lead quality
4. Risk flags — rising CPL, falling QL rate, high fail rate, campaign fatigue, spend without leads
5. Recommendations — specific, prioritised, with numbers

━━━ REPORT FORMAT ━━━
## Report Title
**Executive Summary**
- Key takeaway 1
- Key takeaway 2

**Data**
| Metric | Value | vs Last Month |
| ... | ... | ... |

**Recommended Actions**
1. Specific action with numbers

━━━ GROUND RULES ━━━
- Never fabricate data. If something is unavailable, say so clearly
- Always mention which source you're citing
- Be concise by default — expand only when asked or when generating a report
- You are read-only — never claim ability to modify campaigns, budgets, or settings
- Use ₹, K, L, Cr for all Indian Rupee formatting`
}

// ── handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    return res.status(200).end()
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set in Vercel environment variables' })

  const { messages = [], history = [], metaToken = '' } = req.body || {}
  if (!messages.length) return res.status(400).json({ error: 'No messages' })

  try {
    // Build live system prompt
    const system = await buildSystemPrompt(metaToken)

    // Build clean alternating message array
    const raw = [
      ...history.map(m => ({ role: m.role, content: String(m.content || '').trim() })),
      ...messages.map(m => ({ role: m.role || 'user', content: String(m.content || '').trim() })),
    ].filter(m => (m.role === 'user' || m.role === 'assistant') && m.content)

    // Merge consecutive same-role messages
    const merged = []
    for (const msg of raw) {
      if (merged.length && merged[merged.length-1].role === msg.role) {
        merged[merged.length-1].content += '\n\n' + msg.content
      } else {
        merged.push({ ...msg })
      }
    }
    // Must start with user
    while (merged.length && merged[0].role === 'assistant') merged.shift()
    if (!merged.length) return res.status(400).json({ error: 'No valid user message found' })

    // Call Anthropic with streaming
    const anthropicRes = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'messages-2023-12-15',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        stream: true,
        system,
        messages: merged,
      }),
    })

    if (!anthropicRes.ok) {
      const err = await anthropicRes.json()
      return res.status(500).json({ error: err.error?.message || 'Anthropic API error' })
    }

    // Stream SSE back to client
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('X-Accel-Buffering', 'no')

    const reader = anthropicRes.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let fullText = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() // keep incomplete line

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') continue
        try {
          const parsed = JSON.parse(data)
          if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
            const text = parsed.delta.text
            fullText += text
            res.write(`data: ${JSON.stringify({ delta: text })}\n\n`)
          }
        } catch {}
      }
    }

    res.write(`data: ${JSON.stringify({ done: true, content: fullText })}\n\n`)
    res.end()

  } catch(e) {
    const msg = e?.message || 'Internal server error'
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: msg })}\n\n`)
      res.end()
    } else {
      res.status(500).json({ error: msg })
    }
  }
}
