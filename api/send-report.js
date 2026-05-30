// Vercel serverless function — POST /api/send-report
const RESEND_KEY   = process.env.RESEND_API_KEY
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

async function getRecipients() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/allowed_users?receive_reports=eq.true&select=email`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    })
    const rows = await res.json()
    return (rows || []).map(r => r.email).filter(Boolean)
  } catch { return [] }
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

function fmtINR(usd) {
  const n = usd * 83
  if (n >= 1e7) return '₹' + (n/1e7).toFixed(2) + ' Cr'
  if (n >= 1e5) return '₹' + (n/1e5).toFixed(1) + 'L'
  return '₹' + Math.round(n).toLocaleString('en-IN')
}

function fatigue(ctr, avgCTR, freq) {
  let s = 25
  if (ctr === 0) s += 30
  else if (ctr < avgCTR * 0.5) s += 20
  else if (ctr < avgCTR) s += 10
  else s -= 10
  if (freq > 3) s += (freq - 3) * 5
  s = Math.max(5, Math.min(85, s))
  return s < 30 ? '🟢 Healthy' : s < 52 ? '🟡 Moderate' : '🔴 High Fatigue'
}

function getAction(actions, type) {
  return parseInt(actions?.find(a => a.action_type === type)?.value || 0)
}

async function buildReport(token) {
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
      fields: 'name,status,insights{spend,impressions,clicks,ctr,frequency,actions}',
      limit: 50, date_preset: 'last_30d'
    })
  ])

  const acc     = accIns.data?.[0] || {}
  const spend   = parseFloat(acc.spend || 0)
  const avgCTR  = parseFloat(acc.ctr   || 0)
  const leads   = getAction(acc.actions, 'lead')

  const camps = (campaigns.data || [])
    .map(c => ({ ...c, ins: c.insights?.data?.[0] || {} }))
    .filter(c => parseFloat(c.ins.spend || 0) > 0)
    .sort((a, b) => parseFloat(b.ins.spend||0) - parseFloat(a.ins.spend||0))

  const fatigueCamps = camps.filter(c =>
    parseFloat(c.ins.frequency||1) > 3.0 || parseFloat(c.ins.ctr||0) === 0
  )
  const topCTR = [...camps].sort((a,b) => parseFloat(b.ins.ctr||0) - parseFloat(a.ins.ctr||0)).slice(0,3)
  const today  = new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
  const total  = camps.reduce((sum, c) => sum + parseFloat(c.ins.spend||0), 0)
  const top5   = camps.slice(0,5).reduce((sum, c) => sum + parseFloat(c.ins.spend||0), 0)
  const top5pct = total > 0 ? (top5/total*100).toFixed(0) : 0

  const rows = camps.slice(0, 20).map(c => {
    const sp  = parseFloat(c.ins.spend||0)
    const clk = parseInt(c.ins.clicks||0)
    const ctr = parseFloat(c.ins.ctr||0)
    const fr  = parseFloat(c.ins.frequency||1)
    const l   = getAction(c.ins.actions,'lead')
    return `<tr>
      <td style="font-weight:600;color:#0A1628">${c.name.length > 45 ? c.name.slice(0,42)+'...' : c.name}</td>
      <td><span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700;background:${c.status==='ACTIVE'?'#DCFCE7':'#F3F4F6'};color:${c.status==='ACTIVE'?'#166534':'#9CA3AF'}">${c.status}</span></td>
      <td style="font-weight:700">${fmtINR(sp)}</td>
      <td>${parseInt(c.ins.impressions||0).toLocaleString('en-IN')}</td>
      <td style="color:${ctr>=avgCTR?'#166534':'#742A2A'};font-weight:600">${ctr.toFixed(2)}%</td>
      <td>${sp>0&&clk>0?fmtINR(sp/clk):'—'}</td>
      <td style="font-weight:600">${l.toLocaleString()}</td>
      <td>${fatigue(ctr, avgCTR, fr)}</td>
    </tr>`
  }).join('')

  const fatigueAlerts = fatigueCamps.slice(0,5).map(c =>
    `<div style="padding:12px 16px;border-radius:8px;background:#FFF5F5;border-left:4px solid #FC8181;color:#742A2A;margin-bottom:8px;font-size:13px">
      <strong>${c.name}</strong> — Freq: ${parseFloat(c.ins.frequency||0).toFixed(1)}x · CTR: ${parseFloat(c.ins.ctr||0).toFixed(2)}% · Spend: ${fmtINR(parseFloat(c.ins.spend||0))}
    </div>`
  ).join('')

  const topPerformers = topCTR.map((c,i) =>
    `<div style="padding:12px 16px;border-radius:8px;background:#F0FFF4;border-left:4px solid #68D391;color:#22543D;margin-bottom:8px;font-size:13px">
      #${i+1} <strong>${c.name}</strong> — CTR: ${parseFloat(c.ins.ctr||0).toFixed(2)}% · Spend: ${fmtINR(parseFloat(c.ins.spend||0))} · Leads: ${getAction(c.ins.actions,'lead').toLocaleString()}
    </div>`
  ).join('')

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Meta Campaign Report · Leverage Edu · ${today}</title>
</head>
<body style="margin:0;padding:20px;background:#F5F7FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a202c;line-height:1.6">
<div style="max-width:860px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">

  <!-- HEADER -->
  <div style="background:linear-gradient(135deg,#0A1628 0%,#1F3C84 100%);padding:28px 36px;color:#fff">
    <div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;opacity:.6;margin-bottom:8px">Leverage Quantum</div>
    <div style="font-size:22px;font-weight:800;margin-bottom:4px">Meta Campaign Report</div>
    <div style="font-size:13px;opacity:.7">act_641914389215638 · Last 30 Days · Generated ${today}</div>
  </div>

  <div style="padding:28px 36px">

    <!-- KPIs -->
    <div style="margin-bottom:28px">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#9CA3AF;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid #E2E8F0">Account Summary</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${[
          ['Total Spend', fmtINR(spend)],
          ['Impressions', parseInt(acc.impressions||0).toLocaleString('en-IN')],
          ['Clicks', parseInt(acc.clicks||0).toLocaleString('en-IN')],
          ['Avg CTR', avgCTR.toFixed(2)+'%'],
          ['Total Leads', leads.toLocaleString('en-IN')],
          ['Active Camps', camps.length],
        ].map(([l,v]) => `<div style="flex:1;min-width:120px;padding:14px;border-radius:10px;border:1px solid #E2E8F0;background:#FAFBFF">
          <div style="font-size:20px;font-weight:800;color:#0A1628;margin-bottom:2px">${v}</div>
          <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#9CA3AF">${l}</div>
        </div>`).join('')}
      </div>
    </div>

    <!-- TABLE -->
    <div style="margin-bottom:28px">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#9CA3AF;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid #E2E8F0">Active Campaigns (${camps.length})</div>
      <div style="overflow-x:auto;border:1px solid #E2E8F0;border-radius:10px">
        <table style="width:100%;border-collapse:collapse;font-size:12.5px">
          <thead>
            <tr style="background:#F7FAFC">
              <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#718096;border-bottom:2px solid #E2E8F0">Campaign</th>
              <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#718096;border-bottom:2px solid #E2E8F0">Status</th>
              <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#718096;border-bottom:2px solid #E2E8F0">Spend</th>
              <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#718096;border-bottom:2px solid #E2E8F0">Impressions</th>
              <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#718096;border-bottom:2px solid #E2E8F0">CTR</th>
              <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#718096;border-bottom:2px solid #E2E8F0">CPC</th>
              <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#718096;border-bottom:2px solid #E2E8F0">Leads</th>
              <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#718096;border-bottom:2px solid #E2E8F0">Health</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>

    ${fatigueCamps.length > 0 ? `
    <!-- FATIGUE -->
    <div style="margin-bottom:28px">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#9CA3AF;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid #E2E8F0">⚠️ Creative Fatigue Alerts (${fatigueCamps.length})</div>
      ${fatigueAlerts}
    </div>` : ''}

    <!-- TOP PERFORMERS -->
    <div style="margin-bottom:28px">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#9CA3AF;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid #E2E8F0">🏆 Top Performers by CTR</div>
      ${topPerformers}
    </div>

    <!-- PARETO -->
    <div style="margin-bottom:28px">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#9CA3AF;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid #E2E8F0">📊 Pareto Analysis</div>
      <div style="padding:14px 16px;border-radius:8px;background:#FFFBEB;border-left:4px solid #F6AD55;color:#7B341E;font-size:13px">
        Top 5 campaigns consuming <strong>${fmtINR(top5)} (${top5pct}%)</strong> of total spend.
        ${parseInt(top5pct) > 75 ? ' High concentration — consider diversifying budget.' : ' Healthy budget distribution.'}
      </div>
    </div>

    <!-- ACTIONS -->
    <div style="margin-bottom:8px">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#9CA3AF;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid #E2E8F0">🚀 Recommended Actions</div>
      ${fatigueCamps.length > 0 ? `
      <div style="padding:14px 16px;border-radius:8px;border:1px solid #E2E8F0;margin-bottom:10px;display:flex;gap:12px">
        <div style="width:28px;height:28px;border-radius:50%;background:#0A1628;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px">1</div>
        <div><strong style="font-size:13px;color:#0A1628">Refresh ${fatigueCamps.length} fatigued creative${fatigueCamps.length>1?'s':''}</strong><br><span style="font-size:12px;color:#6B7280">${fatigueCamps.slice(0,2).map(c=>c.name).join(', ')} — high frequency. New variants needed.</span></div>
      </div>` : ''}
      <div style="padding:14px 16px;border-radius:8px;border:1px solid #E2E8F0;margin-bottom:10px;display:flex;gap:12px">
        <div style="width:28px;height:28px;border-radius:50%;background:#0A1628;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px">${fatigueCamps.length>0?2:1}</div>
        <div><strong style="font-size:13px;color:#0A1628">Scale: ${topCTR[0]?.name?.slice(0,40)||'—'}</strong><br><span style="font-size:12px;color:#6B7280">CTR ${parseFloat(topCTR[0]?.ins.ctr||0).toFixed(2)}% — above avg (${avgCTR.toFixed(2)}%). Increase budget 20% this week.</span></div>
      </div>
      <div style="padding:14px 16px;border-radius:8px;border:1px solid #E2E8F0;margin-bottom:10px;display:flex;gap:12px">
        <div style="width:28px;height:28px;border-radius:50%;background:#0A1628;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px">${fatigueCamps.length>0?3:2}</div>
        <div><strong style="font-size:13px;color:#0A1628">Review low-CTR high-spend campaigns</strong><br><span style="font-size:12px;color:#6B7280">${camps.filter(c=>parseFloat(c.ins.ctr||0)<avgCTR*0.5&&parseFloat(c.ins.spend||0)>100000).length} campaigns spending above ₹1L with CTR below half of account average.</span></div>
      </div>
    </div>

  </div>

  <!-- FOOTER -->
  <div style="background:#F7FAFC;padding:18px 36px;border-top:1px solid #E2E8F0;text-align:center;font-size:12px;color:#9CA3AF">
    <strong style="color:#374151">Leverage Quantum</strong> · Meta Campaign Report · ${today}<br>
    <span>Generated automatically · Do not reply to this email</span>
  </div>

</div>
</body></html>`
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Token: from body (on-demand button) or Supabase (scheduled cron)
    let token = req.body?.token || null
    if (!token) token = await getStoredToken()
    if (!token) return res.status(400).json({ error: 'No Meta token. Please connect Meta Ads first.' })

    // Recipients: from Supabase allowed_users with receive_reports=true, fallback to Shivam
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
