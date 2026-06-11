// api/vasu-chat.js — Claude-powered VASU AI backend
// Replaces Groq. Uses claude-sonnet-4-20250514 via Anthropic API.
// Fetches MTD sheet + QL Ops sheet + Meta Ads insights server-side for a rich system prompt.

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

const MTD_SHEET  = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT58jwL_E0MSciEW_nyrHQMA-0DiFqUN3wstB9yTpfM3gdhK-ctxaODRuqtdxurFRJwmhvbzqS_9EuM/pub?output=csv'
const QLOPS_SHEET = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRVF7R3Me4QPVaRS_n_OufcMrrgYvCt3Rs7yJUG0u4gEMd0cVL9IyP2aV6J8HDjOZrvWzcemgHwZaHs/pub?gid=0&single=true&output=csv'
const AD_ACCOUNT = 'act_641914389215638'

// ── helpers ─────────────────────────────────────────────────────────────────
function parseCSV(csv) {
  const rows = csv.trim().split('\n').map(r => {
    const cols=[],buf=[];let inQ=false
    for(const ch of r){if(ch==='"'){inQ=!inQ}else if(ch===','&&!inQ){cols.push(buf.join('').trim());buf.length=0}else buf.push(ch)}
    cols.push(buf.join('').trim()); return cols
  })
  const [hdr,...data]=rows; const h=k=>hdr.indexOf(k)
  return {headers:hdr, rows:data, h}
}

function fmt(n){ const x=parseFloat(n)||0; if(x>=1e7)return '₹'+(x/1e7).toFixed(2)+' Cr'; if(x>=1e5)return '₹'+(x/1e5).toFixed(1)+'L'; if(x>=1000)return '₹'+(x/1000).toFixed(0)+'K'; return '₹'+Math.round(x).toLocaleString('en-IN') }

async function safeFetch(url, opts={}) {
  try { const r=await fetch(url,opts); if(!r.ok)return null; return r } catch { return null }
}

// ── data fetchers ────────────────────────────────────────────────────────────
async function getMTDData() {
  try {
    const r = await safeFetch(MTD_SHEET)
    if (!r) return 'MTD Sheet: unavailable'
    const {rows,h} = parseCSV(await r.text())
    // Group by month — latest 3 months
    const byMonth = {}
    rows.forEach(row => {
      const month = row[h('Month')] || row[0]
      if (!month || month.toLowerCase()==='month') return
      if (!byMonth[month]) byMonth[month]={month,spend:0,leads:0,ql:0,apps:0,rev:0}
      byMonth[month].spend += parseFloat(row[h('Total Spend')]||row[h('spend')]||0)
      byMonth[month].leads += parseInt(row[h('Total Leads')]||row[h('leads')]||0)
      byMonth[month].ql    += parseInt(row[h('FW Qualified')]||row[h('fwQual')]||0)
      byMonth[month].apps  += parseInt(row[h('Applications')]||row[h('apps')]||0)
      byMonth[month].rev   += parseFloat(row[h('Total Revenue')]||row[h('totalRev')]||0)
    })
    const months = Object.values(byMonth).slice(-3)
    return months.map(m => {
      const cpl = m.leads>0 ? Math.round(m.spend/m.leads) : 0
      const roas = m.spend>0 ? (m.rev/m.spend).toFixed(2) : '0'
      return `${m.month}: Spend ${fmt(m.spend)} | Leads ${m.leads.toLocaleString()} | CPL ₹${cpl} | FW Qualified ${m.ql.toLocaleString()} | Apps ${m.apps.toLocaleString()} | Revenue ${fmt(m.rev)} | ROAS ${roas}x`
    }).join('\n')
  } catch(e) { return `MTD Sheet error: ${e.message}` }
}

async function getQLOpsData() {
  try {
    const r = await safeFetch(QLOPS_SHEET)
    if (!r) return 'QL Ops Sheet: unavailable'
    const {rows,h} = parseCSV(await r.text())
    // Aggregate by month + provider — latest 2 months
    const byMP = {}
    rows.forEach(row => {
      const prov  = row[h('provider')]
      const month = row[h('qualified_month')]
      if (!prov || !month) return
      const k = `${month}||${prov}`
      if (!byMP[k]) byMP[k]={month,provider:prov,count:0}
      byMP[k].count += parseInt(row[h('qualified_count')]||0)
    })
    const entries = Object.values(byMP).sort((a,b)=>a.month.localeCompare(b.month)||(a.provider.localeCompare(b.provider)))
    const months = [...new Set(entries.map(e=>e.month))].slice(-2)
    return months.flatMap(m => {
      const mEntries = entries.filter(e=>e.month===m)
      const total = mEntries.reduce((s,e)=>s+e.count,0)
      return mEntries.map(e=>`${m} | ${e.provider}: ${e.count.toLocaleString()} qualified (${((e.count/total)*100).toFixed(1)}% of ${total.toLocaleString()} total)`)
    }).join('\n')
  } catch(e) { return `QL Ops Sheet error: ${e.message}` }
}

async function getMetaData(token) {
  if (!token) return 'Meta Ads: no token provided'
  try {
    const qs = p => new URLSearchParams({access_token:token,...p}).toString()
    const [insR, campR] = await Promise.all([
      safeFetch(`https://graph.facebook.com/v19.0/${AD_ACCOUNT}/insights?${qs({fields:'spend,impressions,clicks,ctr,cpm,actions',date_preset:'last_30d',level:'account'})}`),
      safeFetch(`https://graph.facebook.com/v19.0/${AD_ACCOUNT}/campaigns?${qs({fields:'name,status,insights{spend,impressions,clicks,ctr,actions}',date_preset:'last_30d',limit:10})}`)
    ])
    if (!insR) return 'Meta Ads: API unavailable'
    const ins = await insR.json()
    const acc = ins.data?.[0] || {}
    const getAct = (type) => parseInt(acc.actions?.find(a=>a.action_type===type)?.value||0)
    const leads = getAct('lead')
    const spend = parseFloat(acc.spend||0)
    const cpl = leads>0 ? fmt(spend/leads) : 'N/A'

    let campLines = ''
    if (campR) {
      const camps = (await campR.json()).data || []
      campLines = '\nTop campaigns (last 30d):\n' + camps.slice(0,8).map(c => {
        const ci = c.insights?.data?.[0]||{}
        const cLeads = parseInt(ci.actions?.find(a=>a.action_type==='lead')?.value||0)
        return `  ${c.name} | ${c.status} | Spend ${fmt(parseFloat(ci.spend||0))} | CTR ${parseFloat(ci.ctr||0).toFixed(2)}% | Leads ${cLeads}`
      }).join('\n')
    }
    return `Last 30 days: Spend ${fmt(spend)} | Impressions ${parseInt(acc.impressions||0).toLocaleString()} | Clicks ${parseInt(acc.clicks||0).toLocaleString()} | CTR ${parseFloat(acc.ctr||0).toFixed(2)}% | CPM ${fmt(parseFloat(acc.cpm||0))} | Leads ${leads.toLocaleString()} | CPL ${cpl}${campLines}`
  } catch(e) { return `Meta Ads error: ${e.message}` }
}

// ── system prompt ─────────────────────────────────────────────────────────────
async function buildSystemPrompt(metaToken) {
  const [mtd, qlops, meta] = await Promise.all([
    getMTDData(),
    getQLOpsData(),
    getMetaData(metaToken)
  ])

  return `You are VASU AI — the intelligence layer inside Leverage Quantum, Leverage Edu's internal marketing analytics platform for the study-abroad vertical.

You have real-time access to three data sources. Always cite which source you're drawing from.

━━━ 1. MTD PERFORMANCE (from CRM/Google Sheets) ━━━
${mtd}

━━━ 2. LEAD QUALIFICATION — FUTWORK & SUPERBOT (from QL Ops sheet) ━━━
${qlops}

━━━ 3. META ADS (from Meta Marketing API) ━━━
${meta}

━━━ YOUR CAPABILITIES ━━━
You can:
- Answer questions about any of these three data sources
- Identify trends, anomalies, and correlations across sources
- Generate structured reports in markdown (weekly summary, monthly performance, QL ops digest, campaign analysis)
- Compare Meta Ads CPL vs CRM CPL and explain attribution gaps
- Flag risks: rising CPL, falling QL%, high fatigue, spend without leads
- Give prioritised recommendations with specific numbers

When asked to generate a report, produce a clean markdown document with:
- Executive summary (3–5 bullet key takeaways)
- Data tables where relevant
- Specific numbers with ₹ formatting (K/L/Cr)
- Actionable next steps

━━━ GROUND RULES ━━━
- Never make up numbers. If data is unavailable, say so explicitly.
- Note that Meta Ads spend is in USD, CRM data is in INR — always convert Meta spend to INR (×85) when comparing.
- CRM leads lag Meta leads by 24–72h due to attribution. Flag this when comparing the two.
- You are read-only — never claim to modify campaigns, budgets, or settings.
- Be concise by default. Expand only when asked.
- Today's date context: ${new Date().toLocaleDateString('en-IN', {weekday:'long', year:'numeric', month:'long', day:'numeric'})}`
}

// ── handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { messages, history=[], metaToken } = req.body || {}
  if (!messages?.length) return res.status(400).json({error:'No messages'})
  if (!ANTHROPIC_KEY) return res.status(500).json({error:'ANTHROPIC_API_KEY not configured'})

  try {
    const systemPrompt = await buildSystemPrompt(metaToken)

    // Build conversation — Anthropic requires alternating user/assistant
    const allMsgs = [
      ...history.map(m => ({role: m.role, content: m.content})),
      ...messages.map(m => ({role: m.role||'user', content: m.content}))
    ]
    // Ensure starts with user
    const cleanMsgs = allMsgs.filter(m => m.role==='user'||m.role==='assistant')

    const r = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        messages: cleanMsgs
      })
    })

    const d = await r.json()
    if (!r.ok) return res.status(500).json({error: d.error?.message || 'Anthropic API error'})

    const content = d.content?.[0]?.text || ''
    return res.status(200).json({content})
  } catch(e) {
    return res.status(500).json({error: e.message})
  }
}
