// Vercel serverless function — GET/POST /api/send-report
// Uses Claude Sonnet to write the audit, Resend to send it

const RESEND_KEY   = process.env.RESEND_API_KEY
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://tsyekthwthxszmsgqfej.supabase.co'
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY
const AD_ACCOUNT   = 'act_641914389215638'

// ── Helpers ──────────────────────────────────────────────
async function graphGet(path, token, params = {}) {
  const qs = new URLSearchParams({ access_token: token, ...params }).toString()
  const res = await fetch(`https://graph.facebook.com/v19.0/${path}?${qs}`)
  const d = await res.json()
  if (d.error) throw new Error(d.error.message)
  return d
}

function getAction(actions, type) {
  return parseInt(actions?.find(a => a.action_type === type)?.value || 0)
}

function fmtINR(inr) {
  const n = parseFloat(inr) || 0
  if (n >= 1e7) return '₹' + (n/1e7).toFixed(2) + ' Cr'
  if (n >= 1e5) return '₹' + (n/1e5).toFixed(1) + 'L'
  if (n >= 1000) return '₹' + Math.round(n).toLocaleString('en-IN')
  return '₹' + Math.round(n)
}

async function getStoredToken() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/meta_tokens?select=token&order=created_at.desc&limit=1`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    })
    const rows = await res.json()
    return rows?.[0]?.token || null
  } catch { return null }
}

async function getRecipients() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/allowed_users?receive_reports=eq.true&select=email`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    })
    const rows = await res.json()
    return (rows || []).map(r => r.email).filter(Boolean)
  } catch { return [] }
}

// ── Fetch Meta Data ───────────────────────────────────────
async function fetchMetaData(token) {
  const e = new Date(), s = new Date()
  s.setDate(s.getDate() - 30)
  const fmt = d => d.toISOString().slice(0,10)
  const range = JSON.stringify({ since: fmt(s), until: fmt(e) })

  const [accIns, campaigns] = await Promise.all([
    graphGet(`${AD_ACCOUNT}/insights`, token, {
      fields: 'spend,impressions,clicks,ctr,cpm,reach,frequency,actions',
      time_range: range, level: 'account'
    }),
    graphGet(`${AD_ACCOUNT}/campaigns`, token, {
      fields: 'name,status,objective,insights{spend,impressions,clicks,ctr,reach,frequency,actions}',
      limit: 50, date_preset: 'last_30d'
    })
  ])

  const acc    = accIns.data?.[0] || {}
  const avgCTR = parseFloat(acc.ctr || 0)
  const camps  = (campaigns.data || [])
    .map(c => ({ ...c, ins: c.insights?.data?.[0] || {} }))
    .filter(c => parseFloat(c.ins.spend || 0) > 0)
    .sort((a, b) => parseFloat(b.ins.spend||0) - parseFloat(a.ins.spend||0))

  return { acc, avgCTR, camps, dateRange: `${fmt(s)} to ${fmt(e)}` }
}

// ── Ask Claude Sonnet ─────────────────────────────────────
async function askClaude(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }]
    })
  })
  const d = await res.json()
  if (d.error) throw new Error(d.error.message)
  return d.content?.[0]?.text || ''
}

// ── Build Report ──────────────────────────────────────────
async function buildReport(token) {
  const { acc, avgCTR, camps, dateRange } = await fetchMetaData(token)
  const today = new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
  const totalLeads = getAction(acc.actions, 'lead')
  const spend = parseFloat(acc.spend || 0)

  // Build data summary for Claude
  const campSummary = camps.slice(0, 20).map(c => {
    const s   = parseFloat(c.ins.spend||0)
    const clk = parseInt(c.ins.clicks||0)
    const ctr = parseFloat(c.ins.ctr||0)
    const fr  = parseFloat(c.ins.frequency||1)
    const l   = getAction(c.ins.actions,'lead')
    return `- ${c.name} | ${c.status} | Spend:${fmtINR(s)} | Impr:${parseInt(c.ins.impressions||0).toLocaleString()} | Clicks:${clk.toLocaleString()} | CTR:${ctr.toFixed(2)}% | CPC:${clk>0?fmtINR(s/clk):'—'} | Freq:${fr.toFixed(1)}x | Leads:${l}`
  }).join('\n')

  const accountSummary = `
ACCOUNT: Leverage Edu | act_641914389215638 | Period: ${dateRange}
Total Spend: ${fmtINR(spend)}
Impressions: ${parseInt(acc.impressions||0).toLocaleString()}
Clicks: ${parseInt(acc.clicks||0).toLocaleString()}
Avg CTR: ${avgCTR.toFixed(2)}%
Avg CPM: ${fmtINR(acc.cpm||0)}
Avg Frequency: ${parseFloat(acc.frequency||0).toFixed(2)}x
Total Reach: ${parseInt(acc.reach||0).toLocaleString()}
Total Leads: ${totalLeads.toLocaleString()}
Active Campaigns: ${camps.length}

CAMPAIGNS (sorted by spend):
${campSummary}
`

  // Ask Claude to write the full audit
  const audit = await askClaude(`You are a Senior Performance Marketing Analyst. Write a comprehensive Meta Ads campaign audit report for Leverage Edu (an edtech company helping Indian students study abroad — UK, Germany, Italy, Ireland, Nigeria, Dubai etc.).

Here is the raw campaign data for the last 30 days:
${accountSummary}

Write a detailed HTML audit report with these exact sections. Use inline CSS only (no <style> tags). The output must be clean HTML that renders well in Gmail.

Structure:
1. STEP 1: Account-Level Spend Summary — brief narrative overview of account health
2. STEP 2: Campaign Insights Breakdown — analyze top performers, worst performers, CTR distribution, frequency issues
3. STEP 3: Senior Marketing Audit covering:
   - Objective Classification (lead gen vs awareness breakdown)
   - Pareto Analysis (which campaigns justify their spend — give YES/NO/PARTIAL verdict for top 5)
   - Audience Overlap Risk (which campaigns are competing against each other, estimate ₹ at risk)
   - Geographic Concentration (over-indexed markets with 2x+ efficiency, under-indexed ones)
   - Creative Fatigue Flags (campaigns above 3x frequency with specific recommendations)
   - Static Creative Diagnosis (CTR vs 0.8-1.2% edtech benchmark per campaign)
4. TOP 5 ACTIONS ranked by ₹ impact — be specific with ₹ estimates and exact action steps

Formatting rules:
- Use <div> blocks with inline styles
- Alert boxes: padding:14px 16px; border-radius:8px; border-left:4px solid [color]; margin-bottom:12px
- Red alerts: background:#FFF5F5; border-color:#FC8181; color:#742A2A
- Yellow alerts: background:#FFFBEB; border-color:#F6AD55; color:#7B341E  
- Green alerts: background:#F0FFF4; border-color:#68D391; color:#22543D
- Blue alerts: background:#EBF8FF; border-color:#63B3ED; color:#2A4365
- Section headers: font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.07em; color:#9CA3AF; margin-bottom:14px; padding-bottom:8px; border-bottom:2px solid #E2E8F0
- Action items: numbered circles with background:#0A1628; color:white; width:28px; height:28px; border-radius:50%
- Be specific, data-driven, and actionable. Reference actual campaign names and ₹ figures throughout.
- Do NOT include any <html>, <head>, <body> tags. Just the inner content div.`)

  // Build the full email HTML
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Meta Campaign Report · Leverage Edu · ${today}</title>
</head>
<body style="margin:0;padding:20px;background:#F5F7FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:860px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">

  <!-- HEADER -->
  <div style="background:linear-gradient(135deg,#0A1628 0%,#1F3C84 100%);padding:28px 36px;color:#fff">
    <div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;opacity:.6;margin-bottom:8px">Leverage Quantum</div>
    <div style="font-size:22px;font-weight:800;margin-bottom:4px">Meta Campaign Performance Audit</div>
    <div style="font-size:13px;opacity:.7">act_641914389215638 · Last 30 Days · Generated ${today}</div>
  </div>

  <!-- KPI SUMMARY -->
  <div style="padding:24px 36px 0">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#9CA3AF;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid #E2E8F0">Account Overview</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:24px">
      ${[
        ['Total Spend', fmtINR(spend)],
        ['Impressions', parseInt(acc.impressions||0).toLocaleString('en-IN')],
        ['Clicks', parseInt(acc.clicks||0).toLocaleString('en-IN')],
        ['Avg CTR', avgCTR.toFixed(2)+'%'],
        ['Total Leads', totalLeads.toLocaleString('en-IN')],
        ['Active Camps', camps.length],
      ].map(([l,v]) => `<div style="flex:1;min-width:110px;padding:14px;border-radius:10px;border:1px solid #E2E8F0;background:#FAFBFF">
        <div style="font-size:20px;font-weight:800;color:#0A1628;margin-bottom:2px">${v}</div>
        <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#9CA3AF">${l}</div>
      </div>`).join('')}
    </div>
  </div>

  <!-- CAMPAIGN TABLE -->
  <div style="padding:0 36px 24px">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#9CA3AF;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid #E2E8F0">Active Campaigns — Last 30 Days</div>
    <div style="overflow-x:auto;border:1px solid #E2E8F0;border-radius:10px">
      <table style="width:100%;border-collapse:collapse;font-size:12.5px">
        <thead>
          <tr style="background:#F7FAFC">
            ${['Campaign','Status','Spend','Impr','CTR','CPC','Freq','Leads'].map(h =>
              `<th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#718096;border-bottom:2px solid #E2E8F0;white-space:nowrap">${h}</th>`
            ).join('')}
          </tr>
        </thead>
        <tbody>
          ${camps.slice(0,20).map(c => {
            const s   = parseFloat(c.ins.spend||0)
            const clk = parseInt(c.ins.clicks||0)
            const ctr = parseFloat(c.ins.ctr||0)
            const fr  = parseFloat(c.ins.frequency||1)
            const l   = getAction(c.ins.actions,'lead')
            const fatigued = fr > 3.5
            const lowCTR   = ctr < avgCTR * 0.5 && s > 100000
            return `<tr style="border-bottom:1px solid #F3F4F6${fatigued||lowCTR?';background:#FFFBF0':''}">
              <td style="padding:10px 12px;font-weight:600;color:#0A1628;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${c.name}">${c.name.length>38?c.name.slice(0,35)+'...':c.name}</td>
              <td style="padding:10px 12px"><span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700;background:${c.status==='ACTIVE'?'#DCFCE7':'#F3F4F6'};color:${c.status==='ACTIVE'?'#166534':'#9CA3AF'}">${c.status}</span></td>
              <td style="padding:10px 12px;font-weight:700">${fmtINR(s)}</td>
              <td style="padding:10px 12px">${parseInt(c.ins.impressions||0).toLocaleString('en-IN')}</td>
              <td style="padding:10px 12px;font-weight:700;color:${ctr>=avgCTR?'#166534':'#742A2A'}">${ctr.toFixed(2)}%</td>
              <td style="padding:10px 12px">${clk>0?fmtINR(s/clk):'—'}</td>
              <td style="padding:10px 12px;color:${fr>3.5?'#C05621':'#374151'};font-weight:${fr>3.5?'700':'400'}">${fr.toFixed(1)}x${fr>3.5?' ⚠️':''}</td>
              <td style="padding:10px 12px;font-weight:600">${l.toLocaleString()}</td>
            </tr>`
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>

  <!-- CLAUDE AUDIT -->
  <div style="padding:0 36px 36px">
    ${audit}
  </div>

  <!-- FOOTER -->
  <div style="background:#F7FAFC;padding:18px 36px;border-top:1px solid #E2E8F0;text-align:center;font-size:12px;color:#9CA3AF">
    <strong style="color:#374151">Leverage Quantum</strong> · Meta Campaign Audit · ${today}<br>
    <span>Powered by Claude Sonnet · Generated automatically · Do not reply</span>
  </div>

</div>
</body></html>`
}

// ── Handler ───────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    let token = req.body?.token || null
    if (!token) token = await getStoredToken()
    if (!token) return res.status(400).json({ error: 'No Meta token. Please connect Meta Ads first.' })

    let recipients = await getRecipients()
    if (recipients.length === 0) recipients = ['shivam.sharma@leverageedu.com']

    const html  = await buildReport(token)
    const today = new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })

    const sendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_KEY}` },
      body: JSON.stringify({
        from: 'Leverage Quantum <onboarding@resend.dev>',
        to: recipients,
        subject: `Meta Campaign Report — Leverage Edu · ${today}`,
        html,
      })
    })

    const sendData = await sendRes.json()
    if (!sendRes.ok) throw new Error(sendData.message || JSON.stringify(sendData))

    return res.status(200).json({ success: true, recipients, id: sendData.id })
  } catch (e) {
    console.error('[send-report]', e.message)
    return res.status(500).json({ error: e.message })
  }
}
