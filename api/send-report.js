const RESEND_KEY   = process.env.RESEND_API_KEY
const GEMINI_KEY   = process.env.GEMINI_API_KEY
const GEMINI_URL   = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://tsyekthwthxszmsgqfej.supabase.co'
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY
const AD_ACCOUNT   = 'act_641914389215638'

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

  return { acc, avgCTR, camps, since: fmt(s), until: fmt(e) }
}

async function askGroq(prompt) {
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 2000 }
    })
  })
  const d = await res.json()
  if (!res.ok) throw new Error(d.error?.message || 'Gemini error')
  return d.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

async function buildReport(token) {
  const { acc, avgCTR, camps, since, until } = await fetchMetaData(token)
  const today      = new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
  const totalLeads = getAction(acc.actions, 'lead')
  const spend      = parseFloat(acc.spend || 0)
  const totalImpr  = parseInt(acc.impressions || 0)
  const totalClicks= parseInt(acc.clicks || 0)
  const avgFreq    = parseFloat(acc.frequency || 0)
  const avgCPM     = parseFloat(acc.cpm || 0)

  // Compute derived metrics
  const totalSpend   = camps.reduce((s,c) => s + parseFloat(c.ins.spend||0), 0)
  const top5Spend    = camps.slice(0,5).reduce((s,c) => s + parseFloat(c.ins.spend||0), 0)
  const top5Pct      = totalSpend > 0 ? (top5Spend/totalSpend*100).toFixed(1) : 0
  const fatigueCamps = camps.filter(c => parseFloat(c.ins.frequency||0) > 3.0)
  const lowCTRHiSpnd = camps.filter(c => parseFloat(c.ins.ctr||0) < avgCTR * 0.5 && parseFloat(c.ins.spend||0) > 100000)
  const topCTR       = [...camps].sort((a,b) => parseFloat(b.ins.ctr||0) - parseFloat(a.ins.ctr||0)).slice(0,3)

  // UK campaigns analysis
  const ukCamps = camps.filter(c => c.name.toLowerCase().includes('uk'))
  const ukSpend = ukCamps.reduce((s,c) => s + parseFloat(c.ins.spend||0), 0)

  const campTable = camps.slice(0,20).map(c => {
    const s   = parseFloat(c.ins.spend||0)
    const clk = parseInt(c.ins.clicks||0)
    const ctr = parseFloat(c.ins.ctr||0)
    const fr  = parseFloat(c.ins.frequency||1)
    const l   = getAction(c.ins.actions,'lead')
    const cpc = clk > 0 ? s/clk : 0
    return `${c.name}|${c.status}|${fmtINR(s)}|${parseInt(c.ins.impressions||0).toLocaleString()}|${clk.toLocaleString()}|${ctr.toFixed(2)}%|${cpc>0?fmtINR(cpc):'—'}|${fr.toFixed(1)}x|${l}`
  }).join('\n')

  const prompt = `You are a Senior Performance Marketing Analyst. Write a rigorous 5-section Meta Ads audit for Leverage Edu (Indian edtech company — helps students study abroad in UK, Germany, Italy, Nigeria, Dubai, Ireland).

ACCOUNT DATA (Last 30 days: ${since} to ${until}):
Total Spend: ${fmtINR(spend)}
Impressions: ${totalImpr.toLocaleString()} | Clicks: ${totalClicks.toLocaleString()} | Avg CTR: ${avgCTR.toFixed(2)}%
Avg CPM: ${fmtINR(avgCPM)} | Avg Frequency: ${avgFreq.toFixed(2)}x | Total Reach: ${parseInt(acc.reach||0).toLocaleString()}
Total Leads: ${totalLeads.toLocaleString()} | Active Campaigns: ${camps.length}

CAMPAIGNS (Name|Status|Spend|Impressions|Clicks|CTR|CPC|Frequency|Leads):
${campTable}

KEY DERIVED FACTS (use these exactly):
- Top 5 campaigns consume ${fmtINR(top5Spend)} = ${top5Pct}% of total spend
- ${ukCamps.length} UK campaigns running simultaneously, total UK spend: ${fmtINR(ukSpend)}
- ${fatigueCamps.length} campaigns above 3.0x frequency: ${fatigueCamps.slice(0,3).map(c=>c.name+' ('+parseFloat(c.ins.frequency||0).toFixed(1)+'x)').join(', ')}
- ${lowCTRHiSpnd.length} campaigns with CTR below 50% of account avg but spend >₹1L: ${lowCTRHiSpnd.slice(0,2).map(c=>c.name).join(', ')}
- Top CTR performer: ${topCTR[0]?.name} at ${parseFloat(topCTR[0]?.ins.ctr||0).toFixed(2)}%
- Edtech Lead Gen CTR benchmark: 0.8% - 1.2%
- Account avg CTR ${avgCTR.toFixed(2)}% is ${avgCTR < 0.8 ? 'BELOW' : 'WITHIN'} benchmark

Write EXACTLY these 5 HTML sections using inline styles only. Be ruthlessly specific — use actual campaign names and ₹ figures everywhere. No generic statements.

SECTION 1 — STEP 2: Campaign Insights Breakdown
Analyze performance distribution. Which campaigns are carrying the account? Which are dragging it? CTR spread analysis. Frequency distribution. Geographic market performance summary.

SECTION 2 — STEP 3A: Objective Classification & Pareto Analysis
Classify all campaigns by objective type. Then do 80/20 analysis — list top 5 campaigns by spend, give explicit YES/NO/PARTIAL verdict on whether each justifies its spend with reasoning.

SECTION 3 — STEP 3B: Audience Overlap Risk Assessment  
Identify campaigns competing for same audience (especially UK). Estimate ₹ wasted from self-competition. Give specific consolidation recommendation.

SECTION 4 — STEP 3C: Geographic + Creative Fatigue Analysis
Over-indexed markets (>1.5x account avg CTR) = scale signals. Under-indexed (CPC >2x avg) = reduce/optimize. Then flag every campaign above 3.0x frequency with action: REFRESH/PAUSE/MONITOR.

SECTION 5 — TOP 5 ACTIONS RANKED BY ₹ IMPACT
For each action: numbered circle, bold title with ₹ opportunity, specific 2-3 sentence action description, expected impact statement. Make these genuinely specific to this account's data.

HTML style rules:
- Wrap each section in: <div style="margin-bottom:28px">
- Section title: <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#6B7280;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid #F3F4F6">TITLE</div>
- Red alert: <div style="padding:14px 16px;border-radius:8px;background:#FFF5F5;border-left:4px solid #EF4444;color:#7F1D1D;margin-bottom:10px;font-size:13px">
- Yellow alert: <div style="padding:14px 16px;border-radius:8px;background:#FFFBEB;border-left:4px solid #F59E0B;color:#78350F;margin-bottom:10px;font-size:13px">
- Green alert: <div style="padding:14px 16px;border-radius:8px;background:#F0FDF4;border-left:4px solid #22C55E;color:#14532D;margin-bottom:10px;font-size:13px">
- Blue info: <div style="padding:14px 16px;border-radius:8px;background:#EFF6FF;border-left:4px solid #3B82F6;color:#1E3A8A;margin-bottom:10px;font-size:13px">
- Metric highlight: <span style="font-weight:700;background:#FEF9C3;padding:1px 5px;border-radius:3px">VALUE</span>
- Action item: <div style="display:flex;gap:12px;align-items:flex-start;padding:14px 16px;border:1px solid #E5E7EB;border-radius:10px;margin-bottom:10px"><div style="width:28px;height:28px;border-radius:50%;background:#0F172A;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px">N</div><div><strong style="color:#0F172A;font-size:13px">TITLE WITH ₹ IMPACT</strong><br><span style="color:#6B7280;font-size:12.5px">Detail</span></div></div>

Output only the HTML. No preamble, no explanation.`

  const auditHTML = await askGroq(prompt)

  // Build full email
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Meta Campaign Audit · Leverage Edu · ${today}</title>
</head>
<body style="margin:0;padding:24px;background:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0F172A;line-height:1.65">

<div style="max-width:880px;margin:0 auto">

  <!-- HEADER CARD -->
  <div style="background:linear-gradient(135deg,#0A1628 0%,#1E3A8A 60%,#1C9FD4 100%);border-radius:16px 16px 0 0;padding:32px 40px;color:#fff;position:relative;overflow:hidden">
    <div style="position:absolute;top:-20px;right:-20px;width:180px;height:180px;border-radius:50%;background:rgba(255,255,255,0.04)"></div>
    <div style="position:absolute;bottom:-40px;right:60px;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,0.03)"></div>
    <div style="font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;opacity:.5;margin-bottom:10px">Leverage Quantum · Automated Report</div>
    <div style="font-size:26px;font-weight:800;letter-spacing:-.02em;margin-bottom:6px">Meta Campaign Performance Audit</div>
    <div style="font-size:13px;opacity:.65">Leverage Edu · act_641914389215638 · ${since} → ${until} · Generated ${today}</div>
    <div style="margin-top:16px;display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);border-radius:20px;padding:5px 12px;font-size:11px;font-weight:600">
      <span style="width:6px;height:6px;border-radius:50%;background:#4ADE80;display:inline-block"></span>
      Senior Performance Marketing Analysis
    </div>
  </div>

  <!-- KPI ROW -->
  <div style="background:#fff;padding:24px 40px;border-left:1px solid #E2E8F0;border-right:1px solid #E2E8F0">
    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:12px">
      ${[
        ['Total Spend', fmtINR(spend), '#6366F1'],
        ['Impressions', totalImpr>=1e6?(totalImpr/1e6).toFixed(1)+'M':totalImpr.toLocaleString('en-IN'), '#0EA5E9'],
        ['Clicks', totalClicks>=1e5?(totalClicks/1e5).toFixed(1)+'L':totalClicks.toLocaleString('en-IN'), '#10B981'],
        ['Avg CTR', avgCTR.toFixed(2)+'%', avgCTR>=0.8?'#10B981':'#EF4444'],
        ['Total Leads', totalLeads>=1000?(totalLeads/1000).toFixed(1)+'K':totalLeads.toString(), '#F59E0B'],
        ['Campaigns', camps.length.toString(), '#8B5CF6'],
      ].map(([l,v,c]) => `
        <div style="padding:16px 14px;border-radius:12px;border:1px solid #F1F5F9;background:#FAFBFF;border-top:3px solid ${c}">
          <div style="font-size:20px;font-weight:800;color:#0F172A;margin-bottom:4px;letter-spacing:-.02em">${v}</div>
          <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#94A3B8">${l}</div>
        </div>`).join('')}
    </div>
  </div>

  <!-- STEP 1: CAMPAIGN TABLE -->
  <div style="background:#fff;padding:24px 40px;border-left:1px solid #E2E8F0;border-right:1px solid #E2E8F0;border-top:1px solid #F1F5F9">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#94A3B8;margin-bottom:16px;padding-bottom:8px;border-bottom:2px solid #F1F5F9">
      📊 Step 1 — Active Campaigns · Last 30 Days (${camps.length} with spend)
    </div>
    <div style="overflow-x:auto;border:1px solid #E2E8F0;border-radius:12px">
      <table style="width:100%;border-collapse:collapse;font-size:12.5px">
        <thead>
          <tr style="background:#F8FAFC">
            ${['Campaign','Status','Spend','Impressions','Clicks','CTR','CPC','Freq','Leads'].map(h =>
              `<th style="padding:11px 13px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#64748B;border-bottom:2px solid #E2E8F0;white-space:nowrap">${h}</th>`
            ).join('')}
          </tr>
        </thead>
        <tbody>
          ${camps.slice(0,20).map((c,i) => {
            const s   = parseFloat(c.ins.spend||0)
            const clk = parseInt(c.ins.clicks||0)
            const ctr = parseFloat(c.ins.ctr||0)
            const fr  = parseFloat(c.ins.frequency||1)
            const l   = getAction(c.ins.actions,'lead')
            const cpc = clk > 0 ? s/clk : 0
            const hi  = fr > 3.5 || (ctr < avgCTR*0.5 && s > 100000)
            return `<tr style="border-bottom:1px solid #F8FAFC;background:${hi?'#FFFBF0':'#fff'}">
              <td style="padding:10px 13px;font-weight:600;color:#0F172A;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${c.name}">${c.name.length>40?c.name.slice(0,37)+'...':c.name}</td>
              <td style="padding:10px 13px"><span style="display:inline-block;padding:3px 9px;border-radius:20px;font-size:10px;font-weight:700;background:${c.status==='ACTIVE'?'#DCFCE7':'#F1F5F9'};color:${c.status==='ACTIVE'?'#166534':'#94A3B8'}">${c.status}</span></td>
              <td style="padding:10px 13px;font-weight:700;color:#0F172A">${fmtINR(s)}</td>
              <td style="padding:10px 13px;color:#475569">${parseInt(c.ins.impressions||0).toLocaleString('en-IN')}</td>
              <td style="padding:10px 13px;color:#475569">${clk.toLocaleString('en-IN')}</td>
              <td style="padding:10px 13px;font-weight:700;color:${ctr>=0.8?'#166534':ctr>=avgCTR?'#1E3A8A':'#991B1B'}">${ctr.toFixed(2)}%</td>
              <td style="padding:10px 13px;color:#475569">${cpc>0?fmtINR(cpc):'—'}</td>
              <td style="padding:10px 13px;font-weight:600;color:${fr>3.5?'#C2410C':'#475569'}">${fr.toFixed(1)}x${fr>3.5?' ⚠':''}${fr>3.0&&fr<=3.5?' ⚡':''}</td>
              <td style="padding:10px 13px;font-weight:600;color:#0F172A">${l.toLocaleString()}</td>
            </tr>`
          }).join('')}
        </tbody>
      </table>
    </div>
    ${camps.length > 20 ? `<div style="padding:10px 13px;font-size:12px;color:#94A3B8;text-align:center">Showing top 20 of ${camps.length} active campaigns sorted by spend</div>` : ''}
    <div style="margin-top:10px;padding:10px 14px;background:#F8FAFC;border-radius:8px;font-size:12px;color:#64748B">
      ⚡ Frequency >3.0x · ⚠ Frequency >3.5x (refresh needed) · <span style="color:#991B1B;font-weight:600">Red CTR</span> = below account avg · <span style="color:#166534;font-weight:600">Green CTR</span> = at/above 0.8% benchmark
    </div>
  </div>

  <!-- CLAUDE AUDIT SECTIONS -->
  <div style="background:#fff;padding:24px 40px 32px;border:1px solid #E2E8F0;border-top:none">
    ${auditHTML}
  </div>

  <!-- FOOTER -->
  <div style="background:#0F172A;border-radius:0 0 16px 16px;padding:20px 40px;display:flex;align-items:center;justify-content:space-between">
    <div>
      <div style="color:#fff;font-size:13px;font-weight:600">Leverage Quantum</div>
      <div style="color:#64748B;font-size:11px;margin-top:2px">Automated Meta Campaign Audit · ${today}</div>
    </div>
    <div style="text-align:right">
      <div style="color:#64748B;font-size:11px">Powered by Gemini 1.5 Flash · Google</div>
      <div style="color:#334155;font-size:11px;margin-top:2px">Do not reply to this email</div>
    </div>
  </div>

</div>
</body>
</html>`
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  try {
    let token = req.body?.token || null
    if (!token) token = await getStoredToken()
    if (!token) return res.status(400).json({ error: 'No Meta token. Connect Meta Ads first.' })

    let recipients = await getRecipients()
    if (recipients.length === 0) recipients = ['shivam.sharma@leverageedu.com']

    const html  = await buildReport(token)
    const today = new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })

    const sendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_KEY}` },
      body: JSON.stringify({
        from: 'Leverage Quantum <noreply@leverageedu.com>',
        to: recipients,
        subject: `Meta Campaign Audit — Leverage Edu · ${today}`,
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
