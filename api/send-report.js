const RESEND_KEY   = process.env.RESEND_API_KEY
const GROQ_KEY     = process.env.VITE_GROQ_API_KEY
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://tsyekthwthxszmsgqfej.supabase.co'
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY
const AD_ACCOUNT   = 'act_641914389215638'

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function fmtINR(n) {
  n = parseFloat(n) || 0
  if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr'
  if (n >= 1e5) return '₹' + (n / 1e5).toFixed(1) + 'L'
  if (n >= 1000) return '₹' + Math.round(n).toLocaleString('en-IN')
  return '₹' + Math.round(n)
}

function fmt(d) { return d.toISOString().slice(0, 10) }

async function getStoredToken() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/meta_tokens?select=token&order=created_at.desc&limit=1`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    })
    return (await res.json())?.[0]?.token || null
  } catch { return null }
}

async function getRecipients() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/allowed_users?receive_reports=eq.true&select=email`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    })
    return ((await res.json()) || []).map(r => r.email).filter(Boolean)
  } catch { return [] }
}

// ── Meta data fetcher for a given date range ─────────────────────────────────

async function fetchMeta(token, since, until) {
  const range = JSON.stringify({ since, until })
  const [accIns, campaigns] = await Promise.all([
    graphGet(`${AD_ACCOUNT}/insights`, token, {
      fields: 'spend,impressions,clicks,ctr,cpm,reach,frequency,actions',
      time_range: range, level: 'account'
    }),
    graphGet(`${AD_ACCOUNT}/campaigns`, token, {
      fields: 'name,status,objective,insights{spend,impressions,clicks,ctr,reach,frequency,actions}',
      limit: 50,
      time_range: range
    })
  ])

  const acc   = accIns.data?.[0] || {}
  const camps = (campaigns.data || [])
    .map(c => ({ ...c, ins: c.insights?.data?.[0] || {} }))
    .filter(c => parseFloat(c.ins.spend || 0) > 0)
    .sort((a, b) => parseFloat(b.ins.spend || 0) - parseFloat(a.ins.spend || 0))

  return { acc, camps }
}

// ── Sheet context (hardcoded snapshot — update periodically) ─────────────────
// This is the cross-channel business data from Google Sheets / Vasu AI context
const SHEET_CONTEXT = {"totals":{"total_opps":1869388,"total_qls":98607,"total_apps":18345,"total_spend":294506772,"total_ac_rev":154372047,"total_vas_rev":291519433,"total_rev":445891480,"avg_roas":1.51,"avg_cpl":2987,"avg_ql_pct":5.3,"data_period":"Jan-2025 to Dec-2025"},"monthly":[{"month":"Jan-2025","opps":187351,"qls":9650,"apps":2713,"spend":34861286,"cpl":3613,"ql_pct":5.2},{"month":"Feb-2025","opps":160123,"qls":8706,"apps":2408,"spend":31755969,"cpl":3648,"ql_pct":5.4},{"month":"Mar-2025","opps":188520,"qls":9902,"apps":2353,"spend":36198990,"cpl":3656,"ql_pct":5.3},{"month":"Apr-2025","opps":177450,"qls":9761,"apps":2363,"spend":28870684,"cpl":2958,"ql_pct":5.5},{"month":"May-2025","opps":274409,"qls":10009,"apps":1843,"spend":25079897,"cpl":2506,"ql_pct":3.6},{"month":"Jun-2025","opps":151862,"qls":7731,"apps":1031,"spend":16952827,"cpl":2193,"ql_pct":5.1},{"month":"Jul-2025","opps":123682,"qls":6093,"apps":638,"spend":13518770,"cpl":2219,"ql_pct":4.9},{"month":"Aug-2025","opps":118330,"qls":5435,"apps":447,"spend":13459560,"cpl":2476,"ql_pct":4.6},{"month":"Sep-2025","opps":125593,"qls":7365,"apps":1067,"spend":22956582,"cpl":3117,"ql_pct":5.9},{"month":"Oct-2025","opps":115599,"qls":7298,"apps":1438,"spend":24376429,"cpl":3340,"ql_pct":6.3},{"month":"Nov-2025","opps":121033,"qls":8220,"apps":1287,"spend":23749776,"cpl":2889,"ql_pct":6.8},{"month":"Dec-2025","opps":125436,"qls":8437,"apps":757,"spend":22726002,"cpl":2694,"ql_pct":6.7}],"channels":[{"channel":"Google","opps":328681,"qls":14309,"apps":5551,"spend":152195112,"cpl":10636,"roas":1.51,"ql_pct":4.4},{"channel":"Facebook","opps":324210,"qls":24488,"apps":4298,"spend":142311660,"cpl":5811,"roas":1.28,"ql_pct":7.6}]}

// ── Groq analysis ─────────────────────────────────────────────────────────────

async function askGroq(prompt) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 2500
    })
  })
  const d = await res.json()
  if (!res.ok) throw new Error(d.error?.message || 'Groq error')
  return d.choices?.[0]?.message?.content || ''
}

// ── Campaign table HTML ───────────────────────────────────────────────────────

function campTableHTML(camps, avgCTR) {
  if (!camps.length) return '<p style="color:#94A3B8;font-size:13px">No campaigns with spend in this period.</p>'
  return `
  <div style="overflow-x:auto;border:1px solid #E2E8F0;border-radius:10px">
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead>
        <tr style="background:#F8FAFC">
          ${['Campaign','Status','Spend','Impr','Clicks','CTR','CPC','Freq','Leads'].map(h =>
            `<th style="padding:9px 11px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#64748B;border-bottom:2px solid #E2E8F0;white-space:nowrap">${h}</th>`
          ).join('')}
        </tr>
      </thead>
      <tbody>
        ${camps.slice(0, 15).map(c => {
          const s   = parseFloat(c.ins.spend || 0)
          const clk = parseInt(c.ins.clicks || 0)
          const ctr = parseFloat(c.ins.ctr || 0)
          const fr  = parseFloat(c.ins.frequency || 1)
          const l   = getAction(c.ins.actions, 'lead')
          const cpc = clk > 0 ? s / clk : 0
          const warn = fr > 3.5 || (ctr < avgCTR * 0.5 && s > 100000)
          return `<tr style="border-bottom:1px solid #F8FAFC;background:${warn ? '#FFFBF0' : '#fff'}">
            <td style="padding:9px 11px;font-weight:600;color:#0F172A;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${c.name}">${c.name.length > 38 ? c.name.slice(0, 35) + '...' : c.name}</td>
            <td style="padding:9px 11px"><span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;background:${c.status === 'ACTIVE' ? '#DCFCE7' : '#F1F5F9'};color:${c.status === 'ACTIVE' ? '#166534' : '#94A3B8'}">${c.status}</span></td>
            <td style="padding:9px 11px;font-weight:700;color:#0F172A">${fmtINR(s)}</td>
            <td style="padding:9px 11px;color:#475569">${parseInt(c.ins.impressions || 0).toLocaleString('en-IN')}</td>
            <td style="padding:9px 11px;color:#475569">${clk.toLocaleString('en-IN')}</td>
            <td style="padding:9px 11px;font-weight:700;color:${ctr >= 0.8 ? '#166534' : ctr >= avgCTR ? '#1E3A8A' : '#991B1B'}">${ctr.toFixed(2)}%</td>
            <td style="padding:9px 11px;color:#475569">${cpc > 0 ? fmtINR(cpc) : '—'}</td>
            <td style="padding:9px 11px;font-weight:600;color:${fr > 3.5 ? '#C2410C' : '#475569'}">${fr.toFixed(1)}x${fr > 3.5 ? ' ⚠' : fr > 3.0 ? ' ⚡' : ''}</td>
            <td style="padding:9px 11px;font-weight:600;color:#0F172A">${l.toLocaleString()}</td>
          </tr>`
        }).join('')}
      </tbody>
    </table>
  </div>
  ${camps.length > 15 ? `<p style="font-size:11px;color:#94A3B8;margin-top:6px;text-align:center">Showing top 15 of ${camps.length} active campaigns by spend</p>` : ''}`
}

// ── KPI card row HTML ─────────────────────────────────────────────────────────

function kpiRow(items) {
  return `<div style="display:grid;grid-template-columns:repeat(${items.length},1fr);gap:10px;margin-bottom:20px">
    ${items.map(([label, value, color, sub]) => `
      <div style="padding:14px;border-radius:10px;border:1px solid #F1F5F9;background:#FAFBFF;border-top:3px solid ${color}">
        <div style="font-size:18px;font-weight:800;color:#0F172A;letter-spacing:-.02em">${value}</div>
        <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#94A3B8;margin-top:3px">${label}</div>
        ${sub ? `<div style="font-size:10px;color:#CBD5E1;margin-top:2px">${sub}</div>` : ''}
      </div>`).join('')}
  </div>`
}

function sectionHeader(emoji, title) {
  return `<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#94A3B8;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid #F1F5F9">${emoji} ${title}</div>`
}

// ── Main report builder ───────────────────────────────────────────────────────

async function buildReport(token) {
  const now   = new Date()
  const today = fmt(now)

  // --- Period 1: Last 30 days ---
  const p30Start = new Date(now); p30Start.setDate(p30Start.getDate() - 30)
  const s30 = fmt(p30Start), e30 = today

  // --- Period 2: Current month MTD ---
  const mtdStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const sMTD = fmt(mtdStart), eMTD = today
  const monthName = now.toLocaleString('en-IN', { month: 'long', year: 'numeric' })

  // Fetch both periods in parallel
  const [d30, dMTD] = await Promise.all([
    fetchMeta(token, s30, e30),
    fetchMeta(token, sMTD, eMTD)
  ])

  // Helper to extract summary from fetched data
  function summary(d) {
    const acc      = d.acc
    const spend    = parseFloat(acc.spend || 0)
    const impr     = parseInt(acc.impressions || 0)
    const clicks   = parseInt(acc.clicks || 0)
    const ctr      = parseFloat(acc.ctr || 0)
    const cpm      = parseFloat(acc.cpm || 0)
    const freq     = parseFloat(acc.frequency || 0)
    const reach    = parseInt(acc.reach || 0)
    const leads    = getAction(acc.actions, 'lead')
    const cpl      = leads > 0 ? spend / leads : 0
    const avgCTR   = ctr
    return { spend, impr, clicks, ctr, cpm, freq, reach, leads, cpl, avgCTR, camps: d.camps }
  }

  const s30m = summary(d30)
  const sMTDm = summary(dMTD)

  // Build camp table text for Groq
  function campText(camps) {
    return camps.slice(0, 20).map(c => {
      const s   = parseFloat(c.ins.spend || 0)
      const ctr = parseFloat(c.ins.ctr || 0)
      const fr  = parseFloat(c.ins.frequency || 1)
      const l   = getAction(c.ins.actions, 'lead')
      const clk = parseInt(c.ins.clicks || 0)
      const cpc = clk > 0 ? s / clk : 0
      return `${c.name} | ${c.status} | Spend:${fmtINR(s)} | CTR:${ctr.toFixed(2)}% | CPC:${cpc > 0 ? fmtINR(cpc) : '—'} | Freq:${fr.toFixed(1)}x | Leads:${l}`
    }).join('\n')
  }

  // Find current month in sheet context
  const curMonthKey = now.toLocaleString('en-US', { month: 'short' }) + '-' + now.getFullYear()
  const sheetMonth  = SHEET_CONTEXT.monthly.find(m => m.month.toLowerCase().includes(curMonthKey.toLowerCase().split('-')[0].toLowerCase()))
  const sheetTotals = SHEET_CONTEXT.totals
  const fbChannel   = SHEET_CONTEXT.channels.find(c => c.channel === 'Facebook') || {}

  const groqPrompt = `You are the performance marketing analyst for Leverage Edu (Indian edtech, study abroad). Write a sharp, data-driven email report. No fluff. Every claim must use a real number from the data below.

==== META ADS DATA ====

LAST 30 DAYS (${s30} to ${e30}):
Spend: ${fmtINR(s30m.spend)} | Impressions: ${s30m.impr.toLocaleString()} | Clicks: ${s30m.clicks.toLocaleString()}
CTR: ${s30m.ctr.toFixed(2)}% | CPM: ${fmtINR(s30m.cpm)} | Frequency: ${s30m.freq.toFixed(2)}x | Reach: ${s30m.reach.toLocaleString()}
Leads: ${s30m.leads} | CPL: ${fmtINR(s30m.cpl)} | Active Campaigns: ${s30m.camps.length}
Top campaigns by spend:
${campText(s30m.camps)}

CURRENT MONTH MTD (${sMTD} to ${eMTD} — ${monthName}):
Spend: ${fmtINR(sMTDm.spend)} | Impressions: ${sMTDm.impr.toLocaleString()} | Clicks: ${sMTDm.clicks.toLocaleString()}
CTR: ${sMTDm.ctr.toFixed(2)}% | CPM: ${fmtINR(sMTDm.cpm)} | Frequency: ${sMTDm.freq.toFixed(2)}x | Reach: ${sMTDm.reach.toLocaleString()}
Leads: ${sMTDm.leads} | CPL: ${fmtINR(sMTDm.cpl)} | Active Campaigns: ${sMTDm.camps.length}
Top campaigns by spend:
${campText(sMTDm.camps)}

==== CROSS-CHANNEL SHEET DATA (Jan–Dec 2025) ====
Overall: Total Spend ₹${(sheetTotals.total_spend/1e7).toFixed(1)}Cr | Total Opps: ${sheetTotals.total_opps.toLocaleString()} | Total QLs: ${sheetTotals.total_qls.toLocaleString()} | Total Apps: ${sheetTotals.total_apps.toLocaleString()} | Avg ROAS: ${sheetTotals.avg_roas} | Avg CPL: ₹${sheetTotals.avg_cpl} | Avg QL%: ${sheetTotals.avg_ql_pct}%
Facebook channel (sheet): Spend ₹${(fbChannel.spend/1e7||0).toFixed(1)}Cr | CPL ₹${fbChannel.cpl||0} | ROAS ${fbChannel.roas||0} | QL%: ${fbChannel.ql_pct||0}%

IMPORTANT — DATA RECONCILIATION NOTE: The Meta Ads API gives raw ad spend/impressions/clicks/leads. The sheet data (opps, QLs, apps, ROAS) comes from CRM/internal tracking — these WILL differ from Meta numbers because: (1) sheet counts all-channel opps not just Meta, (2) lead attribution lag, (3) QL/app conversion happens downstream. Do NOT treat these as the same number. Analyse them separately and call out any meaningful gap.

==== YOUR OUTPUT ====
Write exactly 4 HTML sections using the inline styles below. Use actual ₹ figures and campaign names throughout.

SECTION 1 — Last 30 Days: Meta Performance Summary
Key wins and concerns. Which campaigns drove the most value? CTR/CPL trends. Frequency risks. 3–4 sharp bullet observations.

SECTION 2 — ${monthName} MTD: Current Month Pulse  
How is this month tracking so far? Spend pace vs last 30 days. Lead volume. Any early signals (good or bad)?

SECTION 3 — Cross-Channel Context (Sheet Data)
Compare Meta CPL vs overall avg CPL. Facebook QL% vs account avg. Is Meta punching its weight? Call out any data gaps between Meta API and sheet numbers and explain why they differ.

SECTION 4 — Top 3 Actions for This Week
Numbered. Specific. Each must reference a real campaign or metric. What to do right now.

HTML style rules (inline only):
- Section title: <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#6B7280;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #F3F4F6">TITLE</div>
- Red alert box: <div style="padding:12px 14px;border-radius:8px;background:#FFF5F5;border-left:4px solid #EF4444;color:#7F1D1D;margin-bottom:8px;font-size:13px;line-height:1.6">
- Green box: <div style="padding:12px 14px;border-radius:8px;background:#F0FDF4;border-left:4px solid #22C55E;color:#14532D;margin-bottom:8px;font-size:13px;line-height:1.6">
- Yellow box: <div style="padding:12px 14px;border-radius:8px;background:#FFFBEB;border-left:4px solid #F59E0B;color:#78350F;margin-bottom:8px;font-size:13px;line-height:1.6">
- Blue box: <div style="padding:12px 14px;border-radius:8px;background:#EFF6FF;border-left:4px solid #3B82F6;color:#1E3A8A;margin-bottom:8px;font-size:13px;line-height:1.6">
- Highlight: <span style="font-weight:700;background:#FEF9C3;padding:1px 4px;border-radius:3px">VALUE</span>
- Action item: <div style="display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border:1px solid #E5E7EB;border-radius:8px;margin-bottom:8px"><div style="width:24px;height:24px;border-radius:50%;background:#0F172A;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px">N</div><div style="font-size:13px;color:#374151;line-height:1.6"><strong>TITLE</strong><br>Detail</div></div>

Output only the HTML. No preamble, no code fences.`

  const aiHTML = await askGroq(groqPrompt)

  const todayLabel = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Leverage Quantum Report · ${todayLabel}</title></head>
<body style="margin:0;padding:24px;background:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0F172A;line-height:1.65">
<div style="max-width:860px;margin:0 auto">

  <!-- HEADER -->
  <div style="background:linear-gradient(135deg,#0A1628 0%,#1E3A8A 60%,#1C9FD4 100%);border-radius:16px 16px 0 0;padding:28px 36px;color:#fff;position:relative;overflow:hidden">
    <div style="font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;opacity:.5;margin-bottom:8px">Leverage Quantum · Automated Report · ${todayLabel}</div>
    <div style="font-size:24px;font-weight:800;letter-spacing:-.02em;margin-bottom:4px">Meta Ads Performance Report</div>
    <div style="font-size:13px;opacity:.65">Last 30 Days + ${monthName} MTD · act_641914389215638</div>
  </div>

  <!-- SECTION: LAST 30 DAYS -->
  <div style="background:#fff;padding:24px 36px;border-left:1px solid #E2E8F0;border-right:1px solid #E2E8F0;border-top:1px solid #F1F5F9">
    ${sectionHeader('📊', `Last 30 Days — ${s30} to ${e30}`)}
    ${kpiRow([
      ['Spend', fmtINR(s30m.spend), '#6366F1'],
      ['Leads', s30m.leads.toLocaleString(), '#F59E0B'],
      ['CPL', fmtINR(s30m.cpl), s30m.cpl < 3000 ? '#10B981' : '#EF4444'],
      ['CTR', s30m.ctr.toFixed(2) + '%', s30m.ctr >= 0.8 ? '#10B981' : '#EF4444'],
      ['Frequency', s30m.freq.toFixed(2) + 'x', s30m.freq > 3 ? '#EF4444' : '#10B981'],
      ['Campaigns', s30m.camps.length.toString(), '#8B5CF6'],
    ])}
    ${campTableHTML(s30m.camps, s30m.avgCTR)}
  </div>

  <!-- SECTION: MTD -->
  <div style="background:#fff;padding:24px 36px;border-left:1px solid #E2E8F0;border-right:1px solid #E2E8F0;border-top:2px solid #F1F5F9">
    ${sectionHeader('📅', `${monthName} MTD — ${sMTD} to ${eMTD}`)}
    ${kpiRow([
      ['Spend', fmtINR(sMTDm.spend), '#6366F1'],
      ['Leads', sMTDm.leads.toLocaleString(), '#F59E0B'],
      ['CPL', fmtINR(sMTDm.cpl), sMTDm.cpl < 3000 ? '#10B981' : '#EF4444'],
      ['CTR', sMTDm.ctr.toFixed(2) + '%', sMTDm.ctr >= 0.8 ? '#10B981' : '#EF4444'],
      ['Frequency', sMTDm.freq.toFixed(2) + 'x', sMTDm.freq > 3 ? '#EF4444' : '#10B981'],
      ['Campaigns', sMTDm.camps.length.toString(), '#8B5CF6'],
    ])}
    ${campTableHTML(sMTDm.camps, sMTDm.avgCTR)}
  </div>

  <!-- AI ANALYSIS -->
  <div style="background:#fff;padding:24px 36px 32px;border:1px solid #E2E8F0;border-top:none">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#94A3B8;margin-bottom:20px;padding-bottom:8px;border-bottom:2px solid #F1F5F9">🤖 AI Analysis — Powered by Llama 3.3</div>
    ${aiHTML}
  </div>

  <!-- FOOTER -->
  <div style="background:#0F172A;border-radius:0 0 16px 16px;padding:16px 36px;display:flex;align-items:center;justify-content:space-between">
    <div style="color:#fff;font-size:12px;font-weight:600">Leverage Quantum</div>
    <div style="color:#64748B;font-size:11px">Generated ${todayLabel} · Do not reply</div>
  </div>

</div>
</body>
</html>`
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  try {
    let token = req.body?.token || null
    if (!token) token = await getStoredToken()
    if (!token) return res.status(400).json({ error: 'No Meta token. Connect Meta Ads first.' })

    let recipients = await getRecipients()
    if (!recipients.length) recipients = ['shivam.sharma@leverageedu.com']

    const html    = await buildReport(token)
    const today   = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    const now     = new Date()
    const month   = now.toLocaleString('en-IN', { month: 'long', year: 'numeric' })

    const sendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_KEY}` },
      body: JSON.stringify({
        from: 'Leverage Quantum <onboarding@resend.dev>',
        to: recipients,
        subject: `Meta Ads Report — ${month} MTD + Last 30 Days · ${today}`,
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