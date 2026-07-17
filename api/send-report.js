export const maxDuration = 60

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://tsyekthwthxszmsgqfej.supabase.co'
const SUPABASE_KEY         = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzeWVrdGh3dGh4c3ptc2dxZmVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NjkzMDIsImV4cCI6MjA5NTM0NTMwMn0.bdM9h5c3PDu9hgggjBdbA-eb7kfF-79c6txOnCUxRhY'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_KEY
const AD_ACCOUNT   = 'act_641914389215638'

// ── Brand constants ───────────────────────────────────────────────────────────
const NAVY  = '#1F3C84'
const BLUE  = '#1C9FD4'
const CYAN  = '#29B9C3'
const GREEN = '#4CAE6F'
const FONT  = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"

// SVG logo icon (3 bars: green, cyan, blue) — inline for email
const LOGO_ICON_SVG = `<svg width="28" height="28" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="12" width="4" height="9" rx="1.5" fill="${GREEN}"/><rect x="7" y="7" width="4" height="14" rx="1.5" fill="${CYAN}"/><rect x="13" y="4" width="4" height="17" rx="1.5" fill="${BLUE}"/></svg>`

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function fmtPct(n) { return (parseFloat(n) || 0).toFixed(2) + '%' }

function delta(cur, prev, higherIsBetter = true) {
  if (!prev || prev === 0) return ''
  const pct = ((cur - prev) / prev) * 100
  const isGood = higherIsBetter ? pct >= 0 : pct <= 0
  const sign = pct >= 0 ? '+' : ''
  return `<span style="font-size:11px;font-weight:700;color:${isGood ? '#059669' : '#DC2626'};margin-left:4px">${sign}${pct.toFixed(1)}%</span>`
}

async function getStoredToken() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/meta_tokens?select=token&order=created_at.desc&limit=1`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` }
    })
    return (await res.json())?.[0]?.token || null
  } catch { return null }
}

async function getRecipients(reportType) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/allowed_users?receive_reports=eq.true&select=email,report_types`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` }
    })
    const rows = (await res.json()) || []
    return rows.filter(r => {
      if (!reportType) return true
      const t = r.report_types
      if (t == null) return true
      if (Array.isArray(t)) return t.length === 0 || t.includes(reportType)
      return true
    }).map(r => r.email).filter(Boolean)
  } catch { return [] }
}

async function getReportConfig() {
  const out = {}
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/app_preferences?select=key,value&key=in.(report_from_name,report_from_email,report_subjects,auto_reports_enabled,slack_webhook_url,slack_auto_reports_enabled)`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` }
    })
    const rows = (await res.json()) || []
    for (const r of rows) out[r.key] = r.value
  } catch {}
  return out
}

// ── Slack (Incoming Webhook) ──────────────────────────────────────────────────
// Webhook URL is admin-editable in Settings > Reports (app_preferences.slack_webhook_url),
// falling back to the SLACK_WEBHOOK_URL env var -- same override pattern as report_from_email.

async function postToSlack(webhookUrl, payload) {
  const res = await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  const text = await res.text()
  if (!res.ok || text.trim() !== 'ok') throw new Error(text || `Slack webhook error ${res.status}`)
  return text
}

// Slack has no native markdown-table rendering, so pipe tables are rendered as an aligned
// monospace code block instead; **bold** becomes Slack's *bold* mrkdwn syntax.
function mdToSlackText(md) {
  if (!md) return ''
  let text = String(md)
  const tableRe = /((?:^\|.*\|[ \t]*\r?\n)+)/gm
  text = text.replace(tableRe, block => {
    const lines = block.trim().split('\n').filter(l => !/^\|[\s:|-]+\|$/.test(l.trim()))
    const rows = lines.map(l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()))
    if (!rows.length) return block
    const widths = rows[0].map((_, ci) => Math.max(...rows.map(r => (r[ci] || '').length)))
    const rendered = rows.map(r => r.map((c, ci) => (c || '').padEnd(widths[ci])).join('  ')).join('\n')
    return '```\n' + rendered + '\n```\n'
  })
  text = text.replace(/\*\*(.+?)\*\*/g, '*$1*')
  return text.trim()
}

function buildSlackAnswerBlocks({ question, answerMarkdown, askedBy }) {
  const body = mdToSlackText(answerMarkdown).slice(0, 2900)
  return {
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '📊 Ask AI Answer', emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: `*${(question || '').slice(0, 300)}*` } },
      { type: 'divider' },
      { type: 'section', text: { type: 'mrkdwn', text: body || '_No content_' } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `Shared by ${askedBy || 'a teammate'} · Leverage Quantum` }] },
    ],
  }
}

function buildSlackExportBlocks({ title, columns, rows, sourcePage, askedBy }) {
  const cols = columns && columns.length ? columns : (rows[0] ? Object.keys(rows[0]) : [])
  const capped = rows.slice(0, 20)
  const widths = cols.map(c => Math.max(c.length, ...(capped.length ? capped.map(r => String(r[c] ?? '').length) : [0])))
  const headerLine = cols.map((c, ci) => c.padEnd(widths[ci])).join('  ')
  const sepLine = widths.map(w => '-'.repeat(w)).join('  ')
  const bodyLines = capped.map(r => cols.map((c, ci) => String(r[c] ?? '').padEnd(widths[ci])).join('  ')).join('\n')
  const table = '```\n' + headerLine + '\n' + sepLine + '\n' + bodyLines + '\n```'
  const truncNote = rows.length > 20 ? `\n_Showing first 20 of ${rows.length} rows -- use Export > CSV/Sheets for the full data._` : ''
  return {
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: `📤 ${(title || 'Export').slice(0, 140)}`, emoji: true } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `${sourcePage ? sourcePage + ' · ' : ''}${rows.length} row${rows.length === 1 ? '' : 's'} · shared by ${askedBy || 'a teammate'}` }] },
      { type: 'section', text: { type: 'mrkdwn', text: (table + truncNote).slice(0, 2900) } },
    ],
  }
}

function buildSlackReportSummary({ typeLabel, periodLabel, summary, todayLabel }) {
  const { spend, leads, cpl, ctr, freq } = summary
  return {
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: `📊 Meta Ads ${typeLabel} Report`, emoji: true } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `${periodLabel} · Generated ${todayLabel}` }] },
      { type: 'section', fields: [
        { type: 'mrkdwn', text: `*Spend*\n${fmtINR(spend)}` },
        { type: 'mrkdwn', text: `*Leads*\n${leads.toLocaleString('en-IN')}` },
        { type: 'mrkdwn', text: `*CPL*\n${fmtINR(cpl)}` },
        { type: 'mrkdwn', text: `*CTR*\n${fmtPct(ctr)}` },
        { type: 'mrkdwn', text: `*Frequency*\n${freq.toFixed(2)}x` },
      ] },
      { type: 'context', elements: [{ type: 'mrkdwn', text: 'Full report with campaign breakdown + AI analysis sent by email.' }] },
    ],
  }
}

async function handleSlackAnswer(req, res) {
  const { getSessionUser, canAccessDashboard } = await import('../lib/auth.mjs')
  const me = getSessionUser(req)
  if (!me) return res.status(401).json({ error: 'Not signed in' })
  if (!canAccessDashboard(me.role, 'ask_ai')) return res.status(403).json({ error: 'Forbidden' })

  const cfg = await getReportConfig()
  const webhook = cfg.slack_webhook_url || process.env.SLACK_WEBHOOK_URL
  if (!webhook) return res.status(500).json({ error: 'Slack is not connected -- add a webhook URL in Settings > Reports.' })

  const { question, answerMarkdown } = req.body || {}
  if (!answerMarkdown) return res.status(400).json({ error: 'No answer content to send' })

  try {
    await postToSlack(webhook, buildSlackAnswerBlocks({ question, answerMarkdown, askedBy: me.email }))
    await logReport({ report_type: 'slack answer', recipients: ['slack'], status: 'sent', triggered_by: me.email })
    return res.status(200).json({ ok: true, success: true })
  } catch (e) {
    await logReport({ report_type: 'slack answer', recipients: ['slack'], status: 'failed', error: e.message, triggered_by: me.email })
    return res.status(500).json({ error: e.message })
  }
}

async function handleSlackExport(req, res) {
  const { getSessionUser } = await import('../lib/auth.mjs')
  const me = getSessionUser(req)
  if (!me) return res.status(401).json({ error: 'Not signed in' })

  const cfg = await getReportConfig()
  const webhook = cfg.slack_webhook_url || process.env.SLACK_WEBHOOK_URL
  if (!webhook) return res.status(500).json({ error: 'Slack is not connected -- add a webhook URL in Settings > Reports.' })

  const { title, columns, rows, sourcePage } = req.body || {}
  if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'No rows to send' })

  try {
    await postToSlack(webhook, buildSlackExportBlocks({ title, columns, rows, sourcePage, askedBy: me.email }))
    await logReport({ report_type: 'slack export', recipients: ['slack'], status: 'sent', triggered_by: me.email })
    return res.status(200).json({ ok: true, success: true })
  } catch (e) {
    await logReport({ report_type: 'slack export', recipients: ['slack'], status: 'failed', error: e.message, triggered_by: me.email })
    return res.status(500).json({ error: e.message })
  }
}

// ── Ask AI "email this answer" — standalone, deliberately NOT sharing buildReport()'s
// Meta-token/campaign-table logic (that's tightly coupled to the auto-generated report
// shape). This is a much simpler wrapper: brand header/footer + the answer's own HTML.
function buildChatAnswerEmail({ question, answerHtml, askedBy }) {
  const todayLabel = new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
  const q = (question||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><meta name="color-scheme" content="light">
<title>Ask AI answer — ${todayLabel}</title></head>
<body style="margin:0;padding:0;background-color:#F4F6F9;font-family:${FONT};color:#0F172A;-webkit-font-smoothing:antialiased">
<div style="margin:0;padding:32px 12px;background-color:#F4F6F9">
<div style="max-width:600px;margin:0 auto">

  <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:20px 20px 0 0;overflow:hidden">
    <tr>
      <td width="25%" style="background-color:${NAVY};font-size:0;line-height:0;height:5px">&nbsp;</td>
      <td width="25%" style="background-color:${BLUE};font-size:0;line-height:0;height:5px">&nbsp;</td>
      <td width="25%" style="background-color:${CYAN};font-size:0;line-height:0;height:5px">&nbsp;</td>
      <td width="25%" style="background-color:${GREEN};font-size:0;line-height:0;height:5px">&nbsp;</td>
    </tr>
  </table>

  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;box-shadow:0 24px 60px -24px rgba(15,23,42,0.18);border-left:1px solid #EEF1F6;border-right:1px solid #EEF1F6">
    <tr><td style="padding:32px 36px 24px">

      <table cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:middle;padding-right:12px">
          <table cellpadding="0" cellspacing="0" style="background-color:#ffffff;border:1px solid #EEF1F6;border-radius:10px;box-shadow:0 3px 10px rgba(15,23,42,0.10)">
            <tr><td style="padding:9px 11px">
              <table cellpadding="0" cellspacing="0"><tr>
                <td valign="bottom" style="padding-right:2px"><div style="width:4px;height:9px;background-color:${GREEN};border-radius:1.5px;font-size:0;line-height:0">&nbsp;</div></td>
                <td valign="bottom" style="padding-right:2px"><div style="width:4px;height:14px;background-color:${CYAN};border-radius:1.5px;font-size:0;line-height:0">&nbsp;</div></td>
                <td valign="bottom"><div style="width:4px;height:17px;background-color:${BLUE};border-radius:1.5px;font-size:0;line-height:0">&nbsp;</div></td>
              </tr></table>
            </td></tr>
          </table>
        </td>
        <td style="vertical-align:middle">
          <div style="font-size:16px;font-weight:800;color:${NAVY};letter-spacing:.02em;line-height:1.2">Leverage Quantum</div>
        </td>
      </tr></table>

      <div style="margin-top:22px">
        <span style="display:inline-block;padding:4px 11px;border-radius:20px;background-color:#EAF7EE;font-size:10px;font-weight:700;color:#2D8659;letter-spacing:.08em;text-transform:uppercase">Ask AI Answer</span>
      </div>
      <div style="font-size:22px;font-weight:800;color:#0F172A;letter-spacing:-.01em;line-height:1.35;margin:12px 0 6px">${q}</div>
      <div style="font-size:12.5px;color:#94A3B8">Shared by <span style="color:#64748B;font-weight:600">${askedBy||'a teammate'}</span> &middot; ${todayLabel}</div>

    </td></tr>

    <tr><td style="padding:0 36px">
      <div style="height:1px;background-color:#EEF1F6"></div>
    </td></tr>

    <tr><td style="padding:24px 36px 32px">${answerHtml}</td></tr>
  </table>

  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F8FAFC;border-radius:0 0 20px 20px;border:1px solid #EEF1F6;border-top:none">
    <tr><td style="padding:16px 36px;text-align:center">
      <span style="font-size:10.5px;color:#94A3B8">Leverage Quantum Ask AI &middot; ${todayLabel} &middot; Do not reply</span>
    </td></tr>
  </table>

</div>
</div>
</body>
</html>`
}

async function handleChatAnswerEmail(req, res) {
  const { getSessionUser, canAccessDashboard } = await import('../lib/auth.mjs')
  const me = getSessionUser(req)
  if (!me) return res.status(401).json({ error: 'Not signed in' })
  if (!canAccessDashboard(me.role, 'ask_ai')) return res.status(403).json({ error: 'Forbidden' })

  const RESEND_KEY = process.env.RESEND_API_KEY
  if (!RESEND_KEY) return res.status(500).json({ error: 'RESEND_API_KEY not configured' })

  const { question, answerHtml } = req.body || {}
  const recipients = Array.isArray(req.body?.recipients) ? req.body.recipients.filter(Boolean) : []
  if (!answerHtml) return res.status(400).json({ error: 'No answer content to send' })
  if (!recipients.length) return res.status(400).json({ error: 'No recipients specified' })

  try {
    const cfg = await getReportConfig()
    const fromAddr = cfg.report_from_email
      ? `${cfg.report_from_name || 'Leverage Quantum'} <${cfg.report_from_email}>`
      : (process.env.REPORT_FROM_EMAIL || 'Leverage Quantum <quantum@platform.leverageedu.com>')
    const html = buildChatAnswerEmail({ question, answerHtml, askedBy: me.email })
    const sendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
      body: JSON.stringify({ from: fromAddr, to: recipients, subject: `Ask AI: ${(question||'').slice(0,80)}`, html }),
    })
    const sendData = await sendRes.json()
    if (!sendRes.ok) throw new Error(sendData.message || JSON.stringify(sendData))
    await logReport({ report_type: 'chat answer', recipients, status: 'sent', triggered_by: me.email })
    return res.status(200).json({ ok: true, success: true, recipients, id: sendData.id })
  } catch (e) {
    await logReport({ report_type: 'chat answer', recipients, status: 'failed', error: e.message, triggered_by: me.email })
    return res.status(500).json({ error: e.message })
  }
}

async function logReport({ report_type, recipients, status, error = null, triggered_by = 'cron' }) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/report_logs`, {
      method: 'POST',
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ report_type, recipients, status, error, triggered_by, sent_at: new Date().toISOString() })
    })
  } catch {}
}

// ── Meta fetcher ──────────────────────────────────────────────────────────────

async function fetchMeta(token, since, until) {
  const range = JSON.stringify({ since, until })
  const [accIns, campaigns] = await Promise.all([
    graphGet(`${AD_ACCOUNT}/insights`, token, {
      fields: 'spend,impressions,clicks,ctr,cpm,reach,frequency,actions',
      time_range: range, level: 'account'
    }),
    graphGet(`${AD_ACCOUNT}/campaigns`, token, {
      fields: 'name,status,insights{spend,impressions,clicks,ctr,reach,frequency,actions}',
      limit: 30,
      date_preset: 'last_30d',
      effective_status: '["ACTIVE","PAUSED"]',
    })
  ])
  const acc   = accIns.data?.[0] || {}
  const camps = (campaigns.data || [])
    .map(c => ({ ...c, ins: c.insights?.data?.[0] || {} }))
    .filter(c => parseFloat(c.ins.spend || 0) > 0)
    .sort((a, b) => parseFloat(b.ins.spend) - parseFloat(a.ins.spend))
  return { acc, camps }
}

// ── AI analysis (token-efficient) ────────────────────────────────────────────

async function getAIAnalysis(summary, camps, reportType) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return '<p style="color:#94A3B8;font-size:13px">AI analysis unavailable — API key not configured.</p>'

  // Compact camp data — top 10 only, minimal fields
  const campText = camps.slice(0, 10).map(c => {
    const s   = parseFloat(c.ins.spend || 0)
    const ctr = parseFloat(c.ins.ctr || 0)
    const fr  = parseFloat(c.ins.frequency || 1)
    const l   = getAction(c.ins.actions, 'onsite_conversion.lead_grouped') || getAction(c.ins.actions, 'lead')
    const eps = l > 0 ? (l / (reportType === 'daily' ? 1 : reportType === 'weekly' ? 7 : 30)).toFixed(1) : '0'
    return `${c.name.slice(0,45)} | Spend:${fmtINR(s)} | CTR:${ctr.toFixed(2)}% | Freq:${fr.toFixed(1)}x | Leads:${l} | EPS:${eps}`
  }).join('\n')

  const typeLabel = reportType === 'daily' ? 'Yesterday' : reportType === 'weekly' ? 'Last 7 Days' : 'Last 30 Days'
  const prompt = `You are a senior Meta Ads analyst for Leverage Edu (Indian edtech, study abroad). Be sharp, specific, data-driven. No fluff.

PERIOD: ${typeLabel}
Spend: ${fmtINR(summary.spend)} | Leads: ${summary.leads} | CPL: ${fmtINR(summary.cpl)} | CTR: ${fmtPct(summary.ctr)} | Freq: ${summary.freq.toFixed(2)}x | Campaigns: ${camps.length}

TOP CAMPAIGNS (spend, CTR, freq, leads, EPS=leads/day):
${campText}

Write exactly 3 HTML sections using ONLY these inline styles:
- Alert box (red): <div style="padding:10px 14px;border-radius:8px;background:#FFF5F5;border-left:3px solid #EF4444;color:#7F1D1D;margin-bottom:8px;font-size:13px;line-height:1.6">
- Win box (green): <div style="padding:10px 14px;border-radius:8px;background:#F0FDF4;border-left:3px solid #22C55E;color:#14532D;margin-bottom:8px;font-size:13px;line-height:1.6">
- Note box (blue): <div style="padding:10px 14px;border-radius:8px;background:#EFF6FF;border-left:3px solid #3B82F6;color:#1E3A8A;margin-bottom:8px;font-size:13px;line-height:1.6">
- Section title: <div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#94A3B8;margin:16px 0 8px;padding-bottom:6px;border-bottom:1px solid #F1F5F9">TITLE</div>
- Highlight: <strong style="background:#FEF9C3;padding:1px 3px;border-radius:3px">VALUE</strong>

SECTION 1 — KEY SIGNALS (2-3 boxes: biggest win, biggest risk, one anomaly. Each box = 1 sentence with a real ₹ or % figure)
SECTION 2 — CAMPAIGN FLAGS (flag only campaigns with freq >3.5 OR EPS <20 OR CTR <0.5%. One line each. Name the campaign.)
SECTION 3 — TOP 3 ACTIONS (numbered divs. Specific. Each must name a campaign or metric. What to do THIS WEEK.)

Output only HTML. No preamble. No code fences. Max 600 words.`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] })
    })
    const d = await res.json()
    if (!res.ok) throw new Error(d.error?.message || 'API error')
    return d.content?.[0]?.text || ''
  } catch(e) {
    return `<p style="color:#DC2626;font-size:13px">AI analysis error: ${e.message}</p>`
  }
}

// ── HTML email builder ────────────────────────────────────────────────────────

function kpiCard(label, value, sub, accent) {
  return `
    <td width="20%" style="padding:4px">
      <div style="background:#F8FAFC;border-radius:10px;border:0.5px solid #E2E8F0;border-top:3px solid ${accent};padding:12px 14px">
        <div style="font-size:20px;font-weight:800;color:#0F172A;letter-spacing:-0.03em;line-height:1">${value}</div>
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#94A3B8;margin-top:5px">${label}</div>
        ${sub ? `<div style="font-size:10.5px;color:#94A3B8;margin-top:3px">${sub}</div>` : ''}
      </div>
    </td>`
}

function campTable(camps, avgCTR) {
  if (!camps.length) return '<p style="color:#94A3B8;font-size:13px;padding:12px 0">No campaigns with spend in this period.</p>'
  const rows = camps.slice(0, 12).map((c, i) => {
    const s   = parseFloat(c.ins.spend || 0)
    const clk = parseInt(c.ins.clicks || 0)
    const ctr = parseFloat(c.ins.ctr || 0)
    const fr  = parseFloat(c.ins.frequency || 1)
    const l   = getAction(c.ins.actions, 'onsite_conversion.lead_grouped') || getAction(c.ins.actions, 'lead')
    const cpl = l > 0 ? s / l : 0
    const fatigue = fr > 3.5 || ctr < avgCTR * 0.5
    const rowBg = i % 2 === 0 ? '#fff' : '#FAFBFC'
    return `<tr style="background:${fatigue ? '#FFFBF0' : rowBg}">
      <td style="padding:9px 12px;font-size:12px;font-weight:600;color:#0F172A;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${c.name}">${c.name.length > 40 ? c.name.slice(0,38)+'…' : c.name}</td>
      <td style="padding:9px 8px;text-align:center"><span style="display:inline-block;padding:2px 7px;border-radius:12px;font-size:10px;font-weight:700;background:${c.status === 'ACTIVE' ? '#DCFCE7' : '#F1F5F9'};color:${c.status === 'ACTIVE' ? '#166534' : '#94A3B8'}">${c.status}</span></td>
      <td style="padding:9px 8px;font-size:12px;font-weight:700;color:#0F172A;text-align:right">${fmtINR(s)}</td>
      <td style="padding:9px 8px;font-size:12px;text-align:right;font-weight:600;color:${ctr >= 1 ? '#166534' : ctr >= avgCTR ? '#1E3A8A' : '#991B1B'}">${ctr.toFixed(2)}%</td>
      <td style="padding:9px 8px;font-size:12px;text-align:right;font-weight:600;color:${fr > 3.5 ? '#C2410C' : '#475569'}">${fr.toFixed(1)}x${fr > 3.5 ? ' ⚠' : ''}</td>
      <td style="padding:9px 8px;font-size:12px;font-weight:700;text-align:right;color:#0F172A">${l.toLocaleString('en-IN')}</td>
      <td style="padding:9px 8px;font-size:12px;text-align:right;color:#475569">${cpl > 0 ? fmtINR(cpl) : '—'}</td>
    </tr>`
  }).join('')

  return `
    <div style="overflow-x:auto;margin-top:4px">
      <table style="width:100%;border-collapse:collapse;font-family:${FONT}">
        <thead>
          <tr style="background:#F8FAFC;border-bottom:2px solid #E2E8F0">
            ${['Campaign','Status','Spend','CTR','Freq','Leads','CPL'].map(h =>
              `<th style="padding:9px ${h==='Campaign'?'12px':'8px'};font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#64748B;text-align:${h==='Campaign'?'left':'right'};white-space:nowrap">${h}</th>`
            ).join('')}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${camps.length > 12 ? `<p style="font-size:11px;color:#94A3B8;margin:8px 0 0;text-align:center">Top 12 of ${camps.length} campaigns by spend</p>` : ''}`
}

function sectionTitle(emoji, title) {
  return `<div style="font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#94A3B8;padding:16px 0 10px;border-bottom:1px solid #F1F5F9;margin-bottom:14px">${emoji}&nbsp; ${title}</div>`
}

// ── Main report builder ───────────────────────────────────────────────────────

async function buildReport(token, reportType) {
  const now   = new Date()
  const today = fmt(now)

  let since, until, periodLabel
  if (reportType === 'daily') {
    const yest = new Date(now); yest.setDate(yest.getDate() - 1)
    since = fmt(yest); until = fmt(yest)
    periodLabel = 'Yesterday — ' + yest.toLocaleDateString('en-IN', { weekday:'short', day:'2-digit', month:'short', year:'numeric' })
  } else if (reportType === 'weekly') {
    const end = new Date(now); end.setDate(end.getDate() - 1)
    const start = new Date(end); start.setDate(end.getDate() - 6)
    since = fmt(start); until = fmt(end)
    periodLabel = `Last 7 Days — ${start.toLocaleDateString('en-IN',{day:'2-digit',month:'short'})} to ${end.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}`
  } else {
    const start = new Date(now); start.setDate(start.getDate() - 30)
    since = fmt(start); until = today
    periodLabel = `Last 30 Days — ${start.toLocaleDateString('en-IN',{day:'2-digit',month:'short'})} to ${new Date(today).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}`
  }

  const { acc, camps } = await fetchMeta(token, since, until)

  const spend  = parseFloat(acc.spend || 0)
  const impr   = parseInt(acc.impressions || 0)
  const clicks = parseInt(acc.clicks || 0)
  const ctr    = parseFloat(acc.ctr || 0)
  const cpm    = parseFloat(acc.cpm || 0)
  const freq   = parseFloat(acc.frequency || 0)
  const reach  = parseInt(acc.reach || 0)
  const leads  = getAction(acc.actions, 'onsite_conversion.lead_grouped') || getAction(acc.actions, 'lead')
  const cpl    = leads > 0 ? spend / leads : 0
  const days   = reportType === 'daily' ? 1 : reportType === 'weekly' ? 7 : 30
  const eps    = leads > 0 ? (leads / days).toFixed(1) : '0'

  const summary = { spend, impr, clicks, ctr, cpm, freq, reach, leads, cpl, eps }
  const aiHTML  = await getAIAnalysis(summary, camps, reportType)

  const todayLabel = now.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
  const typeLabel  = reportType === 'daily' ? 'Daily' : reportType === 'weekly' ? 'Weekly' : 'Monthly'
  const accentColor = reportType === 'daily' ? BLUE : reportType === 'weekly' ? GREEN : NAVY
  const accentTint  = reportType === 'daily' ? '#EAF3FC' : reportType === 'weekly' ? '#EAF7EE' : '#EEF1FB'

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="color-scheme" content="light">
<title>Leverage Quantum — ${typeLabel} Report · ${todayLabel}</title>
</head>
<body style="margin:0;padding:0;background-color:#F4F6F9;font-family:${FONT};color:#0F172A;-webkit-font-smoothing:antialiased">
<div style="margin:0;padding:32px 12px;background-color:#F4F6F9">
<div style="max-width:680px;margin:0 auto">

  <!-- TOP ACCENT STRIPE -->
  <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:20px 20px 0 0;overflow:hidden">
    <tr>
      <td width="25%" style="background-color:${NAVY};font-size:0;line-height:0;height:5px">&nbsp;</td>
      <td width="25%" style="background-color:${BLUE};font-size:0;line-height:0;height:5px">&nbsp;</td>
      <td width="25%" style="background-color:${CYAN};font-size:0;line-height:0;height:5px">&nbsp;</td>
      <td width="25%" style="background-color:${GREEN};font-size:0;line-height:0;height:5px">&nbsp;</td>
    </tr>
  </table>

  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;box-shadow:0 24px 60px -24px rgba(15,23,42,0.18);border-left:1px solid #EEF1F6;border-right:1px solid #EEF1F6">

    <!-- HEADER -->
    <tr><td style="padding:32px 36px 24px">
      <table cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:middle;padding-right:12px">
          <table cellpadding="0" cellspacing="0" style="background-color:#ffffff;border:1px solid #EEF1F6;border-radius:10px;box-shadow:0 3px 10px rgba(15,23,42,0.10)">
            <tr><td style="padding:9px 11px">
              <table cellpadding="0" cellspacing="0"><tr>
                <td valign="bottom" style="padding-right:2px"><div style="width:4px;height:9px;background-color:${GREEN};border-radius:1.5px;font-size:0;line-height:0">&nbsp;</div></td>
                <td valign="bottom" style="padding-right:2px"><div style="width:4px;height:14px;background-color:${CYAN};border-radius:1.5px;font-size:0;line-height:0">&nbsp;</div></td>
                <td valign="bottom"><div style="width:4px;height:17px;background-color:${BLUE};border-radius:1.5px;font-size:0;line-height:0">&nbsp;</div></td>
              </tr></table>
            </td></tr>
          </table>
        </td>
        <td style="vertical-align:middle">
          <div style="font-size:16px;font-weight:800;color:${NAVY};letter-spacing:.02em;line-height:1.2">Leverage Quantum</div>
        </td>
      </tr></table>

      <div style="margin-top:22px">
        <span style="display:inline-block;padding:4px 11px;border-radius:20px;background-color:${accentTint};font-size:10px;font-weight:700;color:${accentColor};letter-spacing:.08em;text-transform:uppercase">${typeLabel} Report</span>
      </div>
      <div style="font-size:22px;font-weight:800;color:#0F172A;letter-spacing:-.01em;line-height:1.35;margin:12px 0 6px">Meta Ads Performance</div>
      <div style="font-size:12.5px;color:#94A3B8">${periodLabel} &middot; <span style="color:#64748B;font-weight:600">${AD_ACCOUNT}</span> &middot; Generated ${todayLabel}</div>
    </td></tr>

    <tr><td style="padding:0 36px">
      <div style="height:1px;background-color:#EEF1F6"></div>
    </td></tr>

    <!-- KPI STRIP -->
    <tr><td style="padding:24px 26px 4px">
      <table cellpadding="0" cellspacing="0" width="100%" style="table-layout:fixed">
        <tr>
          ${kpiCard('Spend', fmtINR(spend), `${camps.length} campaigns`, accentColor)}
          ${kpiCard('Leads', leads.toLocaleString('en-IN'), `EPS: ${eps}/day`, BLUE)}
          ${kpiCard('CPL', fmtINR(cpl), cpl > 3000 ? '⚠ Above target' : '✓ On track', cpl > 3000 ? '#EF4444' : '#22C55E')}
          ${kpiCard('CTR', fmtPct(ctr), ctr >= 1 ? '✓ Healthy' : '⚠ Below 1%', ctr >= 1 ? '#22C55E' : '#F59E0B')}
          ${kpiCard('Freq', freq.toFixed(2) + 'x', freq > 3.5 ? '⚠ Fatigue risk' : '✓ OK', freq > 3.5 ? '#EF4444' : '#22C55E')}
        </tr>
      </table>
    </td></tr>
    <tr><td style="padding:4px 36px 8px">
      <table cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding-right:20px">
            <span style="font-size:11.5px;color:#64748B">Impressions</span>
            <span style="font-size:12px;font-weight:700;color:#0F172A;margin-left:6px">${impr.toLocaleString('en-IN')}</span>
          </td>
          <td style="padding-right:20px">
            <span style="font-size:11.5px;color:#64748B">Reach</span>
            <span style="font-size:12px;font-weight:700;color:#0F172A;margin-left:6px">${reach.toLocaleString('en-IN')}</span>
          </td>
          <td style="padding-right:20px">
            <span style="font-size:11.5px;color:#64748B">CPM</span>
            <span style="font-size:12px;font-weight:700;color:#0F172A;margin-left:6px">${fmtINR(cpm)}</span>
          </td>
          <td>
            <span style="font-size:11.5px;color:#64748B">Clicks</span>
            <span style="font-size:12px;font-weight:700;color:#0F172A;margin-left:6px">${clicks.toLocaleString('en-IN')}</span>
          </td>
        </tr>
      </table>
    </td></tr>

    <tr><td style="padding:0 36px">
      <div style="height:1px;background-color:#EEF1F6;margin-top:12px"></div>
    </td></tr>

    <!-- CAMPAIGN TABLE -->
    <tr><td style="padding:20px 26px 8px">
      ${sectionTitle('📊', 'Campaign Breakdown')}
      ${campTable(camps, ctr)}
    </td></tr>

    <tr><td style="padding:0 36px">
      <div style="height:1px;background-color:#EEF1F6"></div>
    </td></tr>

    <!-- AI ANALYSIS -->
    <tr><td style="padding:20px 26px 32px">
      ${sectionTitle('🤖', 'AI Analysis — Claude Sonnet')}
      ${aiHTML}
    </td></tr>

  </table>

  <!-- FOOTER -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F8FAFC;border-radius:0 0 20px 20px;border:1px solid #EEF1F6;border-top:none">
    <tr><td style="padding:16px 36px;text-align:center">
      <span style="font-size:10.5px;color:#94A3B8">Leverage Quantum &middot; Auto-generated &middot; ${todayLabel} &middot; Do not reply</span>
    </td></tr>
  </table>

</div>
</div>
</body>
</html>`

  return { html, summary, periodLabel, typeLabel }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  if ((req.body?.type || req.query?.type) === 'chat_answer') {
    return handleChatAnswerEmail(req, res)
  }
  if ((req.body?.type || req.query?.type) === 'slack_answer') {
    return handleSlackAnswer(req, res)
  }
  if ((req.body?.type || req.query?.type) === 'slack_export') {
    return handleSlackExport(req, res)
  }

  const RESEND_KEY = process.env.RESEND_API_KEY
  if (!RESEND_KEY) return res.status(500).json({ error: 'RESEND_API_KEY not configured' })

  const report_type  = req.body?.type || req.query?.type || 'daily'
  const triggered_by = req.body?.triggered_by || 'cron'
  const validTypes   = ['daily', 'weekly', 'monthly']
  if (!validTypes.includes(report_type)) return res.status(400).json({ error: `Invalid type. Use: ${validTypes.join(', ')}` })

  let recipients = []
  try {
    let token = req.body?.token || null
    if (!token) token = await getStoredToken()
    if (!token) {
      await logReport({ report_type, recipients: [], status: 'failed', error: 'No Meta token', triggered_by })
      return res.status(400).json({ error: 'No Meta token. Connect Meta Ads first.' })
    }

    const bodyRecipients = Array.isArray(req.body?.recipients) ? req.body.recipients.filter(Boolean) : []
    if (triggered_by === 'test' && bodyRecipients.length) {
      // Test send: honour the explicit recipient list from the request (never the full DB list)
      recipients = bodyRecipients
    } else {
      recipients = await getRecipients(report_type)
      if (!recipients.length) recipients = ['shivam.sharma@leverageedu.com']
    }

  const cfg = await getReportConfig()
  // Auto-reports master switch: skip scheduled sends when disabled
  if (triggered_by === 'cron' && cfg.auto_reports_enabled === false) {
    await logReport({ report_type, recipients: [], status: 'skipped', error: 'Auto-reports disabled in Settings', triggered_by })
    return res.status(200).json({ ok: true, skipped: true, reason: 'auto_reports_disabled' })
  }
  const fromAddr = cfg.report_from_email
    ? `${cfg.report_from_name || 'Leverage Quantum'} <${cfg.report_from_email}>`
    : (process.env.REPORT_FROM_EMAIL || 'Leverage Quantum <quantum@platform.leverageedu.com>')
  const subjOverride = (cfg.report_subjects && cfg.report_subjects[report_type]) || null

    const { html, summary: reportSummary, periodLabel: reportPeriodLabel, typeLabel: reportTypeLabel } = await buildReport(token, report_type)
    const todayLabel = new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
    const SUBJECTS = {
      daily:   `Meta Ads Daily Report — Yesterday · ${todayLabel}`,
      weekly:  `Meta Ads Weekly Report — Last 7 Days · ${todayLabel}`,
      monthly: `Meta Ads Monthly Report — Last 30 Days · ${todayLabel}`,
    }

    const sendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_KEY}` },
      body: JSON.stringify({
        from: fromAddr,
        to: recipients,
        subject: subjOverride || SUBJECTS[report_type],
        html,
      })
    })
    const sendData = await sendRes.json()
    if (!sendRes.ok) throw new Error(sendData.message || JSON.stringify(sendData))

    await logReport({ report_type, recipients, status: 'sent', triggered_by })

    // Cross-post a compact summary card to Slack alongside the email, if connected + enabled
    if (cfg.slack_auto_reports_enabled !== false) {
      const hook = cfg.slack_webhook_url || process.env.SLACK_WEBHOOK_URL
      if (hook) {
        try {
          await postToSlack(hook, buildSlackReportSummary({ typeLabel: reportTypeLabel, periodLabel: reportPeriodLabel, summary: reportSummary, todayLabel }))
        } catch (e) { console.error('[slack report]', e.message) }
      }
    }

    return res.status(200).json({ ok: true, success: true, recipients, id: sendData.id, report_type })

  } catch (e) {
    console.error('[send-report]', e.message)
    await logReport({ report_type, recipients, status: 'failed', error: e.message, triggered_by })
    return res.status(500).json({ error: e.message })
  }
}
