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

// Logo mark bars (green/blue/navy, heights 9/14/17px) — canonical source is
// shared/brandLogo.mjs. Duplicated here as literals (not imported) because this
// is a Vercel serverless .js handler and a static top-level import of an .mjs
// file from here risks ERR_REQUIRE_ESM (see CLAUDE.md). Email uses table-cell
// divs instead of <svg> for client compatibility, but the heights/colors/order
// below MUST stay byte-identical to BRAND_LOGO_BARS in shared/brandLogo.mjs.

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
    const res = await fetch(`${SUPABASE_URL}/rest/v1/app_preferences?select=key,value&key=in.(report_from_name,report_from_email,report_subjects,auto_reports_enabled,slack_webhook_url,slack_webhook_url_test,slack_channel_main,slack_channel_test,slack_channel_internal,slack_channel_ceo,slack_auto_reports_enabled)`, {
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
//
// A webhook is bound to a single channel, so there is no way to redirect a post at send
// time -- testing safely means a SECOND webhook pointing at a test channel. Callers pass
// slackTarget:'test' to use it; anything else uses the main one. Deliberately no silent
// fallback from test to main: if the test webhook is missing we error out rather than
// posting a test message into the team channel.
//
// Two delivery modes, bot preferred:
//
//   BOT (SLACK_BOT_TOKEN, e.g. the workspace's "PM Analyst" app with chat:write) posts via
//   chat.postMessage, so ONE credential reaches ANY channel -- the channel is just an
//   argument. That's why test-then-production needs no second credential here.
//
//   WEBHOOK is the fallback for installs with no bot token. A webhook is welded to one
//   channel, so it needs a separate URL per channel.
//
// The token lives ONLY in the Vercel env, never in app_preferences: that table has RLS
// disabled and is readable with the public anon key that ships in the client bundle, so
// anything stored there is effectively public. Channel NAMES are not secrets and are fine
// there. (The pre-existing slack_webhook_url rows have this same exposure -- a webhook URL
// is a posting credential. Worth migrating to env separately.)
// Three destinations, not two:
//   test     -- the sandbox channel. Safe, one click.
//   internal -- team-performance-marketing, the PM team's own channel. Two clicks.
//   ceo      -- performance_mktg_core, the CEO group. GUARDED: admin only, an
//               explicit confirmation and a PIN, both checked on the server before
//               a single Slack call is made.
// 'prod', 'main', '' and anything unrecognised still resolve to internal, which is
// exactly where they resolved before this existed -- the scheduler and the older
// callers behave identically.
const SLACK_TARGETS = {
  test: {
    label: 'test channel',
    pref: 'slack_channel_test', env: 'SLACK_CHANNEL_TEST',
    hookPref: 'slack_webhook_url_test', hookEnv: 'SLACK_WEBHOOK_URL_TEST',
  },
  internal: {
    label: 'team channel',
    pref: 'slack_channel_internal', env: 'SLACK_CHANNEL_INTERNAL',
    altPref: 'slack_channel_main', altEnv: 'SLACK_CHANNEL_MAIN',
    hookPref: 'slack_webhook_url', hookEnv: 'SLACK_WEBHOOK_URL',
  },
  ceo: {
    label: 'CEO channel',
    pref: 'slack_channel_ceo', env: 'SLACK_CHANNEL_CEO',
    guarded: true,
  },
}

function normaliseTarget(target) {
  const t = String(target || '').toLowerCase()
  if (t === 'test') return 'test'
  if (t === 'ceo') return 'ceo'
  return 'internal'
}

function resolveSlackTarget(cfg, target, opts) {
  const key = normaliseTarget(target)
  const spec = SLACK_TARGETS[key]
  const label = spec.label
  // A guarded destination is unreachable unless the caller states, in so many
  // words, that it has already run the PIN gate. Ask AI, the table exports and
  // the scheduler all call this without that flag, so none of them can be talked
  // into reaching the CEO group.
  if (spec.guarded && !(opts && opts.allowGuarded)) {
    return { mode: 'bot', key, label, guarded: true, missing: 'The CEO channel is only reachable from Send to Slack, after the PIN check.' }
  }
  const botToken = process.env.SLACK_BOT_TOKEN
  if (botToken) {
    const channel = cfg[spec.pref] || process.env[spec.env]
      || (spec.altPref ? (cfg[spec.altPref] || process.env[spec.altEnv]) : '')
    if (channel) return { mode: 'bot', key, token: botToken, channel, label, guarded: !!spec.guarded }
    return { mode: 'bot', key, label, guarded: !!spec.guarded, missing: `No Slack ${label} set -- add the channel in Settings > Reports.` }
  }
  // No webhook fallback for the CEO group on purpose: a webhook cannot upload the
  // chart images this report is built around, so it could only ever post a
  // half-report to the one audience that must not receive one.
  if (spec.guarded) {
    return { mode: 'bot', key, label, guarded: true, missing: 'The CEO channel needs SLACK_BOT_TOKEN -- an Incoming Webhook cannot post this report.' }
  }
  const url = cfg[spec.hookPref] || process.env[spec.hookEnv]
  return {
    mode: 'webhook', key, url, label,
    missing: `Slack ${label} is not connected -- add SLACK_BOT_TOKEN plus a channel, or a webhook URL, in Settings > Reports.`,
  }
}

// chat.postMessage answers 200 with {ok:false,error:...} rather than an HTTP error, so the
// body has to be inspected. The common failures are translated because "not_in_channel" on
// its own tells an admin nothing about what to actually do.
async function postToSlackBot(token, channel, payload) {
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ channel, ...payload }),
  })
  const data = await res.json().catch(() => ({}))
  if (data.ok) return data
  const hints = {
    not_in_channel: `the bot isn't in ${channel} yet -- run "/invite @pm_analyst" in that channel`,
    channel_not_found: `channel ${channel} not found -- check the name (with #) or use its channel ID`,
    is_archived: `channel ${channel} is archived`,
    invalid_auth: 'SLACK_BOT_TOKEN is invalid or revoked',
    not_authed: 'SLACK_BOT_TOKEN is missing',
    missing_scope: `the app is missing a required scope (needs chat:write); needed: ${data.needed || '?'}`,
  }
  throw new Error(`Slack: ${hints[data.error] || data.error || 'unknown error'}`)
}

async function deliverToSlack(hook, payload) {
  if (hook.mode === 'bot') return postToSlackBot(hook.token, hook.channel, payload)
  return postToSlack(hook.url, payload)
}

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

function buildSlackAnswerBlocks({ question, answerMarkdown, askedBy, channelLabel }) {
  const body = mdToSlackText(answerMarkdown).slice(0, 2900)
  return {
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '📊 Ask AI Answer', emoji: true } },
      ...(channelLabel === 'test channel'
        ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: ':test_tube: *Test post* -- sent to the test channel to check formatting.' }] }]
        : []),
      { type: 'section', text: { type: 'mrkdwn', text: `*${(question || '').slice(0, 300)}*` } },
      { type: 'divider' },
      { type: 'section', text: { type: 'mrkdwn', text: body || '_No content_' } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `Shared by ${askedBy || 'a teammate'} · Leverage Quantum` }] },
    ],
  }
}

function buildSlackExportBlocks({ title, columns, rows, sourcePage, askedBy, channelLabel }) {
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
      // a test post says so on its face, so it can't be mistaken for a real report if
      // someone forwards a screenshot out of the test channel
      ...(channelLabel === 'test channel'
        ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: ':test_tube: *Test post* -- sent to the test channel to check formatting.' }] }]
        : []),
      { type: 'context', elements: [{ type: 'mrkdwn', text: `${sourcePage ? sourcePage + ' · ' : ''}${rows.length} row${rows.length === 1 ? '' : 's'} · shared by ${askedBy || 'a teammate'}` }] },
      { type: 'section', text: { type: 'mrkdwn', text: (table + truncNote).slice(0, 2900) } },
    ],
  }
}

// Settings' connection test. Deliberately its own card: reusing the Ask AI answer blocks
// headed the message "Ask AI Answer" for something that is not one, and its copy claimed a
// "webhook" was connected even when the post had gone through the bot.
function buildSlackTestBlocks({ askedBy, channelLabel, mode }) {
  const via = mode === 'bot' ? 'the @pm_analyst bot' : 'an incoming webhook'
  return {
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '🧪 Slack connection test', emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: `If you can see this, *Leverage Quantum* can post to the *${channelLabel || 'channel'}* via ${via}.` } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `Triggered from Settings by ${askedBy || 'an admin'} · Leverage Quantum` }] },
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
  const hook = resolveSlackTarget(cfg, req.body?.slackTarget)
  if (!hook.url && !hook.channel) return res.status(500).json({ error: hook.missing })

  const { question, answerMarkdown } = req.body || {}
  if (!answerMarkdown) return res.status(400).json({ error: 'No answer content to send' })

  try {
    await deliverToSlack(hook, buildSlackAnswerBlocks({ question, answerMarkdown, askedBy: me.email, channelLabel: hook.label }))
    await logReport({ report_type: 'slack answer', recipients: ['slack'], status: 'sent', triggered_by: me.email })
    return res.status(200).json({ ok: true, success: true })
  } catch (e) {
    await logReport({ report_type: 'slack answer', recipients: ['slack'], status: 'failed', error: e.message, triggered_by: me.email })
    return res.status(500).json({ error: e.message })
  }
}

async function handleSlackExport(req, res) {
  const { getSessionUser, canAccessDashboard } = await import('../lib/auth.mjs')
  const me = getSessionUser(req)
  if (!me) return res.status(401).json({ error: 'Not signed in' })

  // dashboardId is sent by ExportButton.jsx (a real PAGE_LIST id, not the free-text
  // sourcePage/filename label) so a restricted viewer can't export from a page they
  // were never granted. Older/unrecognized callers with no dashboardId fall back to
  // admin-only rather than silently allowing.
  const { title, columns, rows, sourcePage, dashboardId, slackTarget } = req.body || {}
  if (!dashboardId ? me.role !== 'admin' : !canAccessDashboard(me.role, dashboardId)) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const cfg = await getReportConfig()
  const hook = resolveSlackTarget(cfg, slackTarget)
  if (!hook.url && !hook.channel) return res.status(500).json({ error: hook.missing })

  if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'No rows to send' })

  // the channel is recorded in the log so a test post is never mistaken for a real one
  const logType = slackTarget === 'test' ? 'slack export (test)' : 'slack export'
  try {
    await deliverToSlack(hook, buildSlackExportBlocks({ title, columns, rows, sourcePage, askedBy: me.email, channelLabel: hook.label }))
    await logReport({ report_type: logType, recipients: ['slack:' + hook.label], status: 'sent', triggered_by: me.email })
    return res.status(200).json({ ok: true, success: true, channel: hook.label })
  } catch (e) {
    await logReport({ report_type: logType, recipients: ['slack:' + hook.label], status: 'failed', error: e.message, triggered_by: me.email })
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
                <td valign="bottom" style="padding-right:2px"><div style="width:4px;height:14px;background-color:${BLUE};border-radius:1.5px;font-size:0;line-height:0">&nbsp;</div></td>
                <td valign="bottom"><div style="width:4px;height:17px;background-color:${NAVY};border-radius:1.5px;font-size:0;line-height:0">&nbsp;</div></td>
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

// ── Unassigned Leads (Human + AI) daily ops alert ────────────────────────────
// Two BigQuery-backed Connected Sheets, registered as standard Data Sources
// (Settings > Data > Data Sources -> sheet_url_human_unassigned / sheet_url_ai_unassigned),
// same override pattern as every other sheet source in this app. Recipient is
// fixed (not the general opt-in report-recipients list) since this is a
// targeted operational alert, not a subscribable report. Shivam is always CC'd.
const UNASSIGNED_LEADS_RECIPIENTS = ['akash.saxena@leverageedu.com']
const UNASSIGNED_LEADS_CC = ['shivam.sharma@leverageedu.com']
const HUMAN_UNASSIGNED_DEFAULT_URL = 'https://docs.google.com/spreadsheets/d/1FsfBQAAKWwnDCLFRbvamFaJiqs2nq8Wltk5e8LGAhRo/gviz/tq?tqx=out:csv&sheet=human_unassigned'
const AI_UNASSIGNED_DEFAULT_URL = 'https://docs.google.com/spreadsheets/d/1FsfBQAAKWwnDCLFRbvamFaJiqs2nq8Wltk5e8LGAhRo/gviz/tq?tqx=out:csv&sheet=AI_unassigned'

function parseCsvText(text) {
  const rows = []; let i = 0, field = '', row = [], inq = false
  while (i < text.length) {
    const c = text[i]
    if (inq) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue } inq = false; i++; continue }
      field += c; i++; continue
    } else {
      if (c === '"') { inq = true; i++; continue }
      if (c === ',') { row.push(field); field = ''; i++; continue }
      if (c === '\r') { i++; continue }
      if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue }
      field += c; i++; continue
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  const h = rows[0] || []
  return rows.slice(1).filter(r => r.length > 1).map(r => Object.fromEntries(h.map((k, idx) => [k.toLowerCase().trim(), (r[idx] || '').trim()])))
}

async function fetchSheetOverride(prefKey) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/app_preferences?select=value&key=eq.${prefKey}`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` }
    })
    const rows = await r.json()
    return rows?.[0]?.value || null
  } catch { return null }
}

async function fetchUnassignedSheet(prefKey, defaultUrl) {
  const override = await fetchSheetOverride(prefKey)
  const url = override || defaultUrl
  const res = await fetch(url + (url.includes('?') ? '&' : '?') + '_=' + Date.now())
  const text = await res.text()
  return { url, text, rows: parseCsvText(text) }
}

function parseDateLoose(s) {
  if (!s) return null
  const m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return new Date(+m[3], +m[1] - 1, +m[2])
  const d = new Date(s)
  return isNaN(d) ? null : d
}
function ageDays(d) { return d ? Math.floor((Date.now() - d.getTime()) / 86400000) : null }
function escHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

function buildUnassignedLeadsEmail({ humanRows, aiRows, humanUrl, aiUrl }) {
  const todayLabel = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  const human = humanRows.map(r => ({
    channel: 'Human', prospectId: r['prospect_id'] || '', date: parseDateLoose(r['ai_activity_date']),
    campaign: r['opp_first_campaign_name'] || '', country: r['country_interested'] || '', owner: r['opportunity_owner_email'] || '',
  })).filter(r => r.prospectId)
  const ai = aiRows.map(r => ({
    channel: 'AI', prospectId: r['prospect_id'] || '', date: parseDateLoose(r['ai_activity_date']),
    campaign: r['opp_first_campaign_name'] || '', country: r['country_preference'] || '', owner: r['opportunity_owner_email'] || '',
  })).filter(r => r.prospectId)
  const all = [...human, ...ai].sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0))
  const oldest = all[0]
  const total = human.length + ai.length
  const oldestAge = ageDays(oldest?.date)

  const statCard = (label, value, color) => `<td width="33%" style="padding:0 6px">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F8FAFC;border-radius:12px;border:1px solid #EEF1F6">
      <tr><td style="padding:14px 16px">
        <div style="font-size:9.5px;font-weight:700;color:#94A3B8;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px">${label}</div>
        <div style="font-size:24px;font-weight:800;color:${color}">${value}</div>
      </td></tr>
    </table>
  </td>`

  const csvLinkCard = (label, count, url, color) => `<td width="50%" style="padding:0 6px">
    <a href="${escHtml(url)}" style="display:block;text-decoration:none;background-color:#ffffff;border:1px solid #EEF1F6;border-radius:12px;padding:14px 16px">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td>
          <div style="font-size:12.5px;font-weight:700;color:#0F172A">${label}</div>
          <div style="font-size:11px;color:#94A3B8;margin-top:2px">${count} rows &middot; opens as CSV</div>
        </td>
        <td width="24" style="text-align:right;vertical-align:middle">
          <span style="display:inline-block;width:24px;height:24px;border-radius:7px;background-color:${color}1A;color:${color};font-size:13px;font-weight:800;line-height:24px;text-align:center">&#8595;</span>
        </td>
      </tr></table>
    </a>
  </td>`

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><meta name="color-scheme" content="light">
<title>Unassigned Leads — ${todayLabel}</title></head>
<body style="margin:0;padding:0;background-color:#F4F6F9;font-family:${FONT};color:#0F172A;-webkit-font-smoothing:antialiased">
<div style="margin:0;padding:32px 12px;background-color:#F4F6F9">
<div style="max-width:640px;margin:0 auto">

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
                <td valign="bottom" style="padding-right:2px"><div style="width:4px;height:14px;background-color:${BLUE};border-radius:1.5px;font-size:0;line-height:0">&nbsp;</div></td>
                <td valign="bottom"><div style="width:4px;height:17px;background-color:${NAVY};border-radius:1.5px;font-size:0;line-height:0">&nbsp;</div></td>
              </tr></table>
            </td></tr>
          </table>
        </td>
        <td style="vertical-align:middle">
          <div style="font-size:16px;font-weight:800;color:${NAVY};letter-spacing:.02em;line-height:1.2">Leverage Quantum</div>
        </td>
      </tr></table>

      <div style="margin-top:22px">
        <span style="display:inline-block;padding:4px 11px;border-radius:20px;background-color:#EEF1FB;font-size:10px;font-weight:700;color:${NAVY};letter-spacing:.08em;text-transform:uppercase">Daily Ops Alert</span>
      </div>
      <div style="font-size:22px;font-weight:800;color:#0F172A;letter-spacing:-.01em;line-height:1.35;margin:12px 0 10px">${total} leads still need a floor owner</div>
      <div style="font-size:13.5px;color:#374151;line-height:1.7">
        Hi Akash,<br/>
        There are currently <strong>${total} leads</strong> without a real floor owner in LeadSquared — <strong>${human.length}</strong> from the Human calling channel and <strong>${ai.length}</strong> from the AI channel. The oldest has been sitting unassigned for <strong>${oldestAge == null ? '—' : oldestAge + ' days'}</strong>. Please review and assign owners as soon as possible.
      </div>

    </td></tr>

    <tr><td style="padding:8px 36px 20px">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        ${statCard('Human Unassigned', human.length, BLUE)}
        ${statCard('AI Unassigned', ai.length, GREEN)}
        ${statCard('Oldest Unassigned', (oldestAge ?? '—') + 'd', NAVY)}
      </tr></table>
    </td></tr>

    <tr><td style="padding:0 36px">
      <div style="height:1px;background-color:#EEF1F6"></div>
    </td></tr>

    <tr><td style="padding:24px 36px 8px">
      <div style="font-size:13px;font-weight:800;color:#0F172A;margin-bottom:12px">Download the full lists</div>
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        ${csvLinkCard('Human Unassigned CSV', human.length, humanUrl, BLUE)}
        ${csvLinkCard('AI Unassigned CSV', ai.length, aiUrl, GREEN)}
      </tr></table>
    </td></tr>

    <tr><td style="padding:14px 36px 32px">
      <div style="padding:12px 16px;border-radius:10px;background-color:#F8FAFC;border-left:3px solid ${NAVY};font-size:12px;color:#475569;line-height:1.6">
        &#128206; <strong>human_unassigned.csv</strong> and <strong>ai_unassigned.csv</strong> are also attached directly to this email.
      </div>
    </td></tr>
  </table>

  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F8FAFC;border-radius:0 0 20px 20px;border:1px solid #EEF1F6;border-top:none">
    <tr><td style="padding:16px 36px;text-align:center">
      <span style="font-size:10.5px;color:#94A3B8">Leverage Quantum &middot; QL Ops &middot; ${todayLabel} &middot; Do not reply</span>
    </td></tr>
  </table>

</div>
</div>
</body>
</html>`
  return { html, total, humanCount: human.length, aiCount: ai.length }
}

async function handleUnassignedLeadsReport(req, res) {
  const triggered_by = req.body?.triggered_by || req.query?.triggered_by || 'cron'

  if (triggered_by === 'cron') {
    const provided = req.headers['x-cron-secret']
    if (!process.env.CRON_SECRET || provided !== process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'Not signed in' })
    }
  } else {
    const { getSessionUser } = await import('../lib/auth.mjs')
    const me = getSessionUser(req)
    if (!me) return res.status(401).json({ error: 'Not signed in' })
    if (me.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
  }

  const RESEND_KEY = process.env.RESEND_API_KEY
  if (!RESEND_KEY) return res.status(500).json({ error: 'RESEND_API_KEY not configured' })

  try {
    const [human, ai] = await Promise.all([
      fetchUnassignedSheet('sheet_url_human_unassigned', HUMAN_UNASSIGNED_DEFAULT_URL),
      fetchUnassignedSheet('sheet_url_ai_unassigned', AI_UNASSIGNED_DEFAULT_URL),
    ])
    const { html, total, humanCount, aiCount } = buildUnassignedLeadsEmail({ humanRows: human.rows, aiRows: ai.rows, humanUrl: human.url, aiUrl: ai.url })

    const cfg = await getReportConfig()
    const fromAddr = cfg.report_from_email
      ? `${cfg.report_from_name || 'Leverage Quantum'} <${cfg.report_from_email}>`
      : (process.env.REPORT_FROM_EMAIL || 'Leverage Quantum <quantum@platform.leverageedu.com>')
    const todayLabel = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

    const sendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
      body: JSON.stringify({
        from: fromAddr,
        to: UNASSIGNED_LEADS_RECIPIENTS,
        cc: UNASSIGNED_LEADS_CC,
        subject: `Unassigned Leads: ${total} need a floor owner — ${todayLabel}`,
        html,
        attachments: [
          { filename: 'human_unassigned.csv', content: Buffer.from(human.text).toString('base64') },
          { filename: 'ai_unassigned.csv', content: Buffer.from(ai.text).toString('base64') },
        ],
      }),
    })
    const sendData = await sendRes.json()
    if (!sendRes.ok) throw new Error(sendData.message || JSON.stringify(sendData))

    await logReport({ report_type: 'unassigned leads', recipients: [...UNASSIGNED_LEADS_RECIPIENTS, ...UNASSIGNED_LEADS_CC], status: 'sent', triggered_by })
    return res.status(200).json({ ok: true, success: true, recipients: [...UNASSIGNED_LEADS_RECIPIENTS, ...UNASSIGNED_LEADS_CC], humanCount, aiCount, total, id: sendData.id })
  } catch (e) {
    await logReport({ report_type: 'unassigned leads', recipients: [...UNASSIGNED_LEADS_RECIPIENTS, ...UNASSIGNED_LEADS_CC], status: 'failed', error: e.message, triggered_by })
    return res.status(500).json({ error: e.message })
  }
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
                <td valign="bottom" style="padding-right:2px"><div style="width:4px;height:14px;background-color:${BLUE};border-radius:1.5px;font-size:0;line-height:0">&nbsp;</div></td>
                <td valign="bottom"><div style="width:4px;height:17px;background-color:${NAVY};border-radius:1.5px;font-size:0;line-height:0">&nbsp;</div></td>
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

// ── Slack: post a dashboard table as an IMAGE + full CSV ─────────────────────────
// The monospace-code-block export above works for narrow tables, but Slack section
// blocks cap at 3000 characters -- Overall's funnel summary is 24 columns, so it gets
// cut mid-row and the closing fence is lost. For an exec-facing post the table is
// therefore rendered in the browser from the real DOM (html-to-image, see
// src/lib/slackShare.js) and uploaded as a PNG, with the COMPLETE dataset alongside it
// as a CSV -- nothing truncated on either side.
//
// Files require a BOT token: an Incoming Webhook cannot upload. Upload is Slack's
// 3-step external flow, and both files are completed in ONE call so the result is a
// single message: comment, image preview, CSV attachment.
async function slackUploadFile(token, { filename, buffer, title }) {
  const q = new URLSearchParams({ filename, length: String(buffer.length) })
  const g = await fetch('https://slack.com/api/files.getUploadURLExternal?' + q.toString(), {
    method: 'POST', headers: { Authorization: 'Bearer ' + token },
  })
  const gd = await g.json().catch(() => ({}))
  if (!gd.ok) {
    const why = gd.error === 'missing_scope'
      ? 'the Slack app needs the files:write scope -- add it, then reinstall the app to the workspace'
      : (gd.error || 'unknown error')
    throw new Error('Slack upload URL: ' + why)
  }
  const put = await fetch(gd.upload_url, {
    method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: buffer,
  })
  if (!put.ok) throw new Error('Slack file upload failed (' + put.status + ')')
  return { id: gd.file_id, title: title || filename }
}

async function slackCompleteUpload(token, { files, channel, initialComment, threadTs }) {
  const res = await fetch('https://slack.com/api/files.completeUploadExternal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: 'Bearer ' + token },
    body: JSON.stringify(Object.assign({ files, channel_id: channel },
      initialComment ? { initial_comment: initialComment } : {},
      threadTs ? { thread_ts: threadTs } : {})),
  })
  const d = await res.json().catch(() => ({}))
  if (!d.ok) {
    const hints = {
      not_in_channel: 'the bot is not in ' + channel + ' yet -- run "/invite @pm_analyst" there',
      channel_not_found: 'channel ' + channel + ' not found -- use its channel ID (e.g. C0123ABCD)',
      missing_scope: 'the Slack app needs the files:write scope -- add it, then reinstall the app',
    }
    throw new Error('Slack: ' + (hints[d.error] || d.error || 'unknown error'))
  }
  return d
}

// The comment carries the headline numbers so the message stands on its own in the feed
// (and in a mobile notification) before anyone opens the image.
function buildTableShareComment({ title, subtitle, summary, rowCount, askedBy, isTest, degraded }) {
  const lines = []
  if (isTest) lines.push(':test_tube: *Test post* -- sent to the test channel to check formatting.')
  lines.push('*📊 ' + title + '*')
  if (subtitle) lines.push(subtitle)
  // summary is either a flat list of {label,value} or, now, a list of lists --
  // one inner list per line of the message.
  const groups = Array.isArray(summary) && Array.isArray(summary[0]) ? summary : [summary || []]
  const rendered = groups
    .map(g => (g || []).filter(s => s && s.label).map(s => '*' + s.label + '*  ' + s.value).join('   \u00b7   '))
    .filter(Boolean)
  if (rendered.length) lines.push('', ...rendered)
  lines.push('', '_' + rowCount + ' row' + (rowCount === 1 ? '' : 's') + '  \u00b7  every column is in the attached CSV_')
  if (degraded) lines.push('_Image scaled down to fit the upload size limit._')
  return lines.join('\n')
}

// Slack's own table block. A row is capped at 20 cells, a table at 100 rows, and
// all table cells in one message at 10,000 characters -- the caller therefore
// sends a trimmed column set. Header, TOTAL and the band subtotals go through
// rich_text so they can be bold; every other cell is cheap raw_text.
function slackTableBlock(table) {
  // Slack rejects an empty text run inside a table cell, so a blank travels as a
  // non-breaking space instead of failing the whole post.
  const txt = v => { const t = String(v == null ? '' : v); return t === '' ? '\u00a0' : t }
  const cell = (v, strong) => strong
    ? { type: 'rich_text', elements: [{ type: 'rich_text_section', elements: [{ type: 'text', text: txt(v), style: { bold: true } }] }] }
    : { type: 'raw_text', text: txt(v) }
  const cols = table.columns || []
  const strong = new Set(table.strongRows || [])
  const rows = [cols.map(c => cell(c, true))]
  ;(table.rows || []).slice(0, 99).forEach((r, i) => rows.push(r.map(v => cell(v, strong.has(i)))))
  // Long first-column labels (ad names) must wrap or the table scrolls off-screen;
  // short ones (channel, corridor) read better on a single line.
  return { type: 'table', column_settings: cols.map((_, i) => (i === 0 ? { is_wrapped: !!table.wrapFirst } : { align: 'right' })), rows }
}

async function slackPostBlocks(token, channel, text, blocks) {
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ channel, text, blocks }),
  })
  const d = await res.json().catch(() => ({}))
  if (!d.ok) throw new Error('Slack: ' + (d.error || 'message rejected'))
  return d.ts
}

async function slackUpdateBlocks(token, channel, ts, text, blocks) {
  const res = await fetch('https://slack.com/api/chat.update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ channel, ts, text, blocks }),
  })
  const d = await res.json().catch(() => ({}))
  if (!d.ok) throw new Error('Slack update: ' + (d.error || 'rejected'))
  return d.ts
}

async function slackPostTable(token, channel, text, table) {
  return slackPostBlocks(token, channel, text, [
    { type: 'section', text: { type: 'mrkdwn', text } },
    slackTableBlock(table),
  ])
}

async function handleSlackExportImage(req, res) {
  const { getSessionUser, canAccessDashboard } = await import('../lib/auth.mjs')
  const me = getSessionUser(req)
  if (!me) return res.status(401).json({ error: 'Not signed in' })

  // Same per-page gate as handleSlackExport: a real PAGE_LIST id from the caller, and
  // admin-only when an older caller sends none, rather than silently allowing.
  const { dashboardId, slackTarget, filename, title, subtitle, summary, pngBase64, csv, rowCount, pixelRatio, table } = req.body || {}
  if (!dashboardId ? me.role !== 'admin' : !canAccessDashboard(me.role, dashboardId)) {
    return res.status(403).json({ error: 'Forbidden' })
  }
  if (!pngBase64) return res.status(400).json({ error: 'No table image to send' })

  const cfg = await getReportConfig()
  const hook = resolveSlackTarget(cfg, slackTarget)
  if (hook.mode !== 'bot' || !hook.channel) {
    return res.status(400).json({ error: 'Posting a table image needs SLACK_BOT_TOKEN plus a channel (files:write) -- an Incoming Webhook cannot upload files.' })
  }

  const logType = slackTarget === 'test' ? 'slack table image (test)' : 'slack table image'
  try {
    const stamp = new Date().toISOString().slice(0, 10)
    const base = String(filename || 'export').replace(/[^a-z0-9._-]+/gi, '-')
    const label = title || base
    const files = [await slackUploadFile(hook.token, {
      filename: base + '-' + stamp + '.png', buffer: Buffer.from(pngBase64, 'base64'), title: label,
    })]
    if (csv) files.push(await slackUploadFile(hook.token, {
      filename: base + '-' + stamp + '.csv', buffer: Buffer.from(String(csv), 'utf8'), title: label + ' (full data)',
    }))
    const comment = buildTableShareComment({
      title: label, subtitle, summary, rowCount: rowCount || 0, askedBy: me.email,
      isTest: slackTarget === 'test', degraded: pixelRatio ? pixelRatio < 2 : false,
    })
    // Lead with Slack's own table so the numbers are readable and copyable in the
    // client, then hang the PNG and the all-columns CSV in that message's thread. If
    // the table block is rejected, fall back to the old files-with-comment post so a
    // send never fails outright.
    let threadTs = null
    if (table && Array.isArray(table.rows) && table.rows.length) {
      try { threadTs = await slackPostTable(hook.token, hook.channel, comment, table) } catch (_) { threadTs = null }
    }
    await slackCompleteUpload(hook.token, {
      files, channel: hook.channel, threadTs,
      initialComment: threadTs ? null : comment,
    })
    await logReport({ report_type: logType, recipients: ['slack:' + hook.label], status: 'sent', triggered_by: me.email })
    return res.status(200).json({ ok: true, success: true, channel: hook.label })
  } catch (e) {
    await logReport({ report_type: logType, recipients: ['slack:' + hook.label], status: 'failed', error: e.message, triggered_by: me.email })
    return res.status(500).json({ error: e.message })
  }
}

// A report is a SEQUENCE of messages posted top-level, in order, from a single click.
// Each one may carry its own native table. The image and the CSV hang in the thread of
// whichever message asked for them, so the channel itself stays readable.
// A report message can carry, in this order: a lead-in section, a two-column field
// grid, a follow-up section, Slack's own table, a native chart and a small context
// footer. Fields are what keeps the KPI grid aligned -- Slack lays them out itself,
// so it survives a phone screen in a way space-padded text does not.
// The chart object carries a `unit` that only our own canvas renderer reads.
// Slack rejects a block holding a key it does not know, so it is dropped here.
function nativeChartBlock(c) {
  return { type: 'data_visualization', title: c.title, chart: c.chart }
}

function reportBlocks(m, opts) {
  const clip = t => String(t || '').slice(0, 2900)
  const blocks = []
  if (m.text) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: clip(m.text) } })
  if (opts.bare) return blocks.length ? blocks : [{ type: 'section', text: { type: 'mrkdwn', text: clip(m.label || 'Report') } }]
  // A section takes at most 10 fields, so a longer grid simply continues in the next.
  const fields = Array.isArray(m.fields) ? m.fields.filter(Boolean).slice(0, 20) : []
  for (let i = 0; i < fields.length; i += 10) {
    blocks.push({ type: 'section', fields: fields.slice(i, i + 10).map(f => ({ type: 'mrkdwn', text: String(f).slice(0, 2000) })) })
  }
  if (m.after) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: clip(m.after) } })
  if (opts.table && m.table && Array.isArray(m.table.rows) && m.table.rows.length) blocks.push(slackTableBlock(m.table))
  if (opts.chart === 'image' && m.chartFileId) {
    blocks.push({
      type: 'image',
      slack_file: { id: m.chartFileId },
      alt_text: String((m.chart && m.chart.title) || 'Chart').slice(0, 200),
    })
  } else if (opts.chart && m.chart && m.chart.type === 'data_visualization') {
    blocks.push(nativeChartBlock(m.chart))
  }
  if (m.context) blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: clip(m.context) }] })
  return blocks
}

// Charts are the newest block type in this file and a workspace that cannot render
// one rejects the whole post. So a message degrades rather than fails: full layout,
// then without the chart, then without the table, then as the lead section alone.
async function slackPostReportMessage(token, channel, m) {
  const fallbackText = String(m.text || m.label || 'Report').slice(0, 2900)
  // Slack will not colour its own chart and will not print the value on a bar,
  // and this report is read on a phone. So when we have a picture of our own --
  // brand ramp, every number written on it -- we leave Slack's chart out of the
  // message and post ours straight underneath, full width, no tap needed.
  const ownChart = !!m.chartPng
  const attempts = ownChart
    ? [{ table: true, chart: false }, { table: false, chart: false }, { bare: true }]
    : [{ table: true, chart: true }, { table: true, chart: false }, { table: false, chart: false }, { bare: true }]
  let ts = null
  let lastErr = null
  for (const opt of attempts) {
    try { ts = await slackPostBlocks(token, channel, fallbackText, reportBlocks(m, opt)); break }
    catch (e) { lastErr = e }
  }
  if (!ts) throw lastErr || new Error('Slack: message rejected')

  if (ownChart) {
    try {
      const up = await slackUploadFile(token, {
        filename: 'chart-' + Date.now() + '.png',
        buffer: Buffer.from(m.chartPng, 'base64'),
        title: (m.chart && m.chart.title) || 'Chart',
      })
      await slackCompleteUpload(token, { files: [up], channel })
      // Slack lands a shared file a beat after it says yes. Without this the
      // pictures all pile up at the end instead of sitting under their message.
      await new Promise(r => setTimeout(r, 4000))
    } catch (e) {
      // The picture is a bonus. If Slack will not take it the report still reads.
    }
  }
  return ts
}

// -- The CEO-channel PIN ------------------------------------------------------
// Threat model, and why it is built exactly this way:
//  * app_preferences is readable with the app's public key, so the PIN itself is
//    never stored. What is stored is a PBKDF2-SHA512 verifier, and that verifier
//    is then HMACd with a pepper that only ever exists in the server env.
//    Reading the row therefore buys an attacker nothing: without the pepper a
//    six-digit space cannot be walked offline.
//  * The whole record -- verifier AND failure counters -- is signed with the same
//    pepper. Editing the row to wipe a lockout invalidates the signature, and an
//    invalid record fails CLOSED: no PIN, no send.
//  * 310k PBKDF2 iterations put real cost on every online guess, on top of a
//    five-strike lockout that doubles in length each time it trips.
//  * The PIN travels once, in the POST body of the send itself, over HTTPS. It is
//    never a query parameter, never logged, never persisted in the browser, and
//    never echoed back in any response.
//  * Every attempt, pass or fail, lands in report_logs against the signed-in
//    email, so there is an audit trail without the PIN ever appearing in it.
const CEO_PIN_KEY = 'slack_ceo_pin'
const CEO_CONFIRM_PHRASE = 'SEND TO CEO GROUP'
const PIN_ITER = 310000
const PIN_KEYLEN = 32
const PIN_MAX_FAILS = 5
const PIN_LOCK_BASE_MIN = 15
const PIN_MIN_LEN = 6
const PIN_MAX_LEN = 12

// A dedicated pepper is the right answer; SUPABASE_SERVICE_KEY is the fallback so
// this works with zero extra setup. The record notes which one was used, so moving
// to a dedicated pepper later cannot silently invalidate a live PIN.
function pinPepper() {
  if (process.env.SLACK_CEO_PIN_PEPPER) return { key: process.env.SLACK_CEO_PIN_PEPPER, id: 'env' }
  return { key: SUPABASE_SERVICE_KEY || '', id: 'svc' }
}
function pepperFor(id) {
  if (id === 'env') return process.env.SLACK_CEO_PIN_PEPPER || ''
  return SUPABASE_SERVICE_KEY || ''
}
async function pinDerive(crypto, pin, salt, iter, pepId) {
  const raw = await new Promise((resolve, reject) => {
    crypto.pbkdf2(String(pin), Buffer.from(String(salt), 'base64'), iter, PIN_KEYLEN, 'sha512',
      (e, k) => (e ? reject(e) : resolve(k)))
  })
  return crypto.createHmac('sha256', pepperFor(pepId)).update(raw).digest('base64')
}
function pinSign(crypto, b64Body, pepId) {
  return crypto.createHmac('sha256', pepperFor(pepId)).update(b64Body).digest('hex')
}
function pinSame(crypto, a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b))
  if (x.length !== y.length) return false
  return crypto.timingSafeEqual(x, y)
}

async function prefRead(key) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/app_preferences?select=value&key=eq.${encodeURIComponent(key)}&limit=1`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    })
    const rows = (await r.json()) || []
    return rows[0] ? rows[0].value : null
  } catch { return null }
}
async function prefWrite(key, value, byEmail) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/app_preferences`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ key, value, updated_by: byEmail || 'system', updated_at: new Date().toISOString() }),
  })
  if (!r.ok) throw new Error('Could not write the PIN record')
}
async function pinRecordRead(crypto) {
  const raw = await prefRead(CEO_PIN_KEY)
  if (!raw) return { state: 'unset' }
  let outer, body
  try { outer = typeof raw === 'string' ? JSON.parse(raw) : raw } catch { return { state: 'invalid' } }
  if (!outer || !outer.b || !outer.t) return { state: 'invalid' }
  try { body = JSON.parse(Buffer.from(String(outer.b), 'base64').toString('utf8')) } catch { return { state: 'invalid' } }
  if (!body || !body.hash || !body.salt) return { state: 'invalid' }
  if (!pinSame(crypto, outer.t, pinSign(crypto, String(outer.b), body.pep))) return { state: 'invalid' }
  return { state: 'ok', body }
}
async function pinRecordWrite(crypto, body, byEmail) {
  const b = Buffer.from(JSON.stringify(body), 'utf8').toString('base64')
  await prefWrite(CEO_PIN_KEY, JSON.stringify({ b, t: pinSign(crypto, b, body.pep) }), byEmail)
}
function pinLockMs(body) {
  const until = body && body.lockUntil ? Date.parse(body.lockUntil) : 0
  return until > Date.now() ? until - Date.now() : 0
}

// Turns away the PINs a guesser tries first, rather than letting somebody put
// 123456 on the one channel that matters most.
function pinWeakness(pin) {
  const t = String(pin || '')
  if (!/^[0-9]+$/.test(t)) return 'Digits only.'
  if (t.length < PIN_MIN_LEN) return `Use at least ${PIN_MIN_LEN} digits.`
  if (t.length > PIN_MAX_LEN) return `Use at most ${PIN_MAX_LEN} digits.`
  if (new Set(t.split('')).size < 3) return 'Use at least 3 different digits.'
  const run = step => t.split('').every((c, i) => i === 0 || ((Number(c) - Number(t[i - 1]) + 10) % 10) === step)
  if (run(1) || run(9)) return 'Runs like 123456 or 654321 are the first thing anyone tries.'
  if (t.length % 2 === 0 && t.slice(0, t.length / 2) === t.slice(t.length / 2)) return 'A repeated half is too easy to guess.'
  if (['112233', '121212', '123123', '147258', '159753', '696969', '778899'].includes(t)) return 'That PIN is on every guess list.'
  return ''
}

// { ok:true } or { ok:false, code, message, failsLeft?, lockedForSec? }.
// Fails closed on every unexpected condition.
async function verifyCeoPin(pin, byEmail) {
  const crypto = await import('node:crypto')
  const rec = await pinRecordRead(crypto)
  if (rec.state === 'unset') {
    return { ok: false, code: 'no_pin', message: 'No CEO PIN is set yet. An admin has to set it in Settings > Reports before this channel can be used.' }
  }
  if (rec.state === 'invalid') {
    return { ok: false, code: 'tampered', message: 'The CEO PIN record does not verify. An admin has to set the PIN again in Settings > Reports.' }
  }
  const body = rec.body
  const held = pinLockMs(body)
  if (held > 0) {
    return { ok: false, code: 'locked', lockedForSec: Math.ceil(held / 1000), message: 'Too many wrong PINs. Locked for ' + Math.ceil(held / 60000) + ' more minute(s).' }
  }
  if (!/^[0-9]{4,20}$/.test(String(pin || ''))) {
    return { ok: false, code: 'wrong', failsLeft: Math.max(0, PIN_MAX_FAILS - (body.fails || 0)), message: 'Enter the PIN.' }
  }
  const got = await pinDerive(crypto, pin, body.salt, body.it || PIN_ITER, body.pep)
  if (pinSame(crypto, got, body.hash)) {
    body.fails = 0
    body.lockUntil = null
    body.lastOkAt = new Date().toISOString()
    body.lastOkBy = byEmail || null
    await pinRecordWrite(crypto, body, byEmail)
    return { ok: true }
  }
  body.fails = (body.fails || 0) + 1
  body.lastFailAt = new Date().toISOString()
  let lockedForSec = 0
  if (body.fails >= PIN_MAX_FAILS) {
    body.lockLevel = Math.min((body.lockLevel || 0) + 1, 3)
    const mins = PIN_LOCK_BASE_MIN * Math.pow(2, body.lockLevel - 1)
    body.lockUntil = new Date(Date.now() + mins * 60000).toISOString()
    body.fails = 0
    lockedForSec = mins * 60
  }
  await pinRecordWrite(crypto, body, byEmail)
  if (lockedForSec) {
    return { ok: false, code: 'locked', lockedForSec, message: 'Too many wrong PINs. Locked for ' + Math.round(lockedForSec / 60) + ' minutes.' }
  }
  return { ok: false, code: 'wrong', failsLeft: Math.max(0, PIN_MAX_FAILS - body.fails), message: 'That PIN is not right.' }
}

// Admin-only. Reports status and sets/changes the PIN. Never returns the hash,
// the salt, the pepper, or anything derived from the PIN.
async function handleCeoPin(req, res) {
  const { getSessionUser } = await import('../lib/auth.mjs')
  const me = getSessionUser(req)
  if (!me) return res.status(401).json({ error: 'Not signed in' })
  if (me.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
  const crypto = await import('node:crypto')
  const action = String((req.body && req.body.action) || 'status')

  if (action === 'status') {
    const rec = await pinRecordRead(crypto)
    if (rec.state !== 'ok') return res.status(200).json({ set: false, invalid: rec.state === 'invalid' })
    const held = pinLockMs(rec.body)
    return res.status(200).json({
      set: true,
      setBy: rec.body.setBy || null,
      setAt: rec.body.setAt || null,
      digits: rec.body.len || null,
      pepper: rec.body.pep === 'env' ? 'dedicated' : 'service key',
      locked: held > 0,
      lockedForSec: Math.ceil(held / 1000),
      failsLeft: Math.max(0, PIN_MAX_FAILS - (rec.body.fails || 0)),
      lastOkAt: rec.body.lastOkAt || null,
      lastFailAt: rec.body.lastFailAt || null,
    })
  }

  if (action === 'set') {
    const pin = String((req.body && req.body.pin) || '')
    const bad = pinWeakness(pin)
    if (bad) return res.status(400).json({ error: bad })
    const rec = await pinRecordRead(crypto)
    // Changing a live PIN needs the live PIN. The recovery path for a forgotten
    // one is to rotate SLACK_CEO_PIN_PEPPER in Vercel: the record then stops
    // verifying, which lets an admin set a fresh PIN and locks out everyone who
    // only had the old one.
    if (rec.state === 'ok') {
      const chk = await verifyCeoPin(String((req.body && req.body.currentPin) || ''), me.email)
      if (!chk.ok) {
        await logReport({ report_type: 'ceo pin change refused', recipients: [me.email], status: 'failed', error: chk.code, triggered_by: me.email })
        return res.status(chk.code === 'locked' ? 429 : 401).json({
          error: chk.code === 'locked' ? chk.message : 'The current PIN is not right.',
          code: chk.code, failsLeft: chk.failsLeft || null, lockedForSec: chk.lockedForSec || null,
        })
      }
    }
    const pep = pinPepper()
    if (!pep.key) return res.status(500).json({ error: 'No server pepper available -- set SLACK_CEO_PIN_PEPPER in Vercel.' })
    const salt = crypto.randomBytes(16).toString('base64')
    const hash = await pinDerive(crypto, pin, salt, PIN_ITER, pep.id)
    await pinRecordWrite(crypto, {
      v: 1, alg: 'pbkdf2-sha512', it: PIN_ITER, salt, hash, pep: pep.id, len: pin.length,
      setBy: me.email, setAt: new Date().toISOString(), fails: 0, lockUntil: null, lockLevel: 0,
    }, me.email)
    await logReport({ report_type: 'ceo pin set', recipients: [me.email], status: 'sent', triggered_by: me.email })
    return res.status(200).json({ ok: true })
  }

  return res.status(400).json({ error: 'Unknown action' })
}

async function handleSlackReport(req, res) {
  const { getSessionUser, canAccessDashboard } = await import('../lib/auth.mjs')
  const me = getSessionUser(req)
  if (!me) return res.status(401).json({ error: 'Not signed in' })

  // Same per-page gate as every other Slack path: a real PAGE_LIST id from the
  // caller, and admin-only when an older caller sends none.
  const { dashboardId, slackTarget, filename, versionId, messages, pngBase64, csv, pixelRatio, rowCount, ceoPin, confirm } = req.body || {}
  if (!dashboardId ? me.role !== 'admin' : !canAccessDashboard(me.role, dashboardId)) {
    return res.status(403).json({ error: 'Forbidden' })
  }
  const list = Array.isArray(messages) ? messages.filter(m => m && m.text) : []
  if (!list.length) return res.status(400).json({ error: 'Nothing to post' })
  if (list.length > 6) return res.status(400).json({ error: 'A report is capped at 6 messages' })

  // The CEO group is the one destination that is guarded. Three independent things
  // have to be true, all checked here on the server: the caller is an admin, the
  // caller sent the exact confirmation phrase, and the PIN verifies. Nothing
  // touches Slack until all three pass.
  const wantsCeo = normaliseTarget(slackTarget) === 'ceo'
  if (wantsCeo) {
    if (me.role !== 'admin') {
      await logReport({ report_type: 'ceo report blocked', recipients: [me.email], status: 'failed', error: 'not an admin', triggered_by: me.email })
      return res.status(403).json({ error: 'Only an admin can post to the CEO group.' })
    }
    if (String(confirm || '') !== CEO_CONFIRM_PHRASE) {
      return res.status(400).json({ error: 'Confirm the CEO send first.', code: 'need_confirm' })
    }
    const chk = await verifyCeoPin(ceoPin, me.email)
    if (!chk.ok) {
      await logReport({ report_type: 'ceo report pin failed', recipients: [me.email], status: 'failed', error: chk.code, triggered_by: me.email })
      return res.status(chk.code === 'locked' ? 429 : 401).json({
        error: chk.message, code: chk.code,
        failsLeft: chk.failsLeft === undefined ? null : chk.failsLeft,
        lockedForSec: chk.lockedForSec === undefined ? null : chk.lockedForSec,
      })
    }
  }

  const cfg = await getReportConfig()
  const hook = resolveSlackTarget(cfg, slackTarget, { allowGuarded: wantsCeo })
  if (hook.mode !== 'bot' || !hook.channel) {
    return res.status(400).json({ error: 'Posting a report needs SLACK_BOT_TOKEN plus a channel (files:write) -- an Incoming Webhook cannot upload files.' })
  }

  const logType = 'slack pm report ' + (versionId || 'v?') + (hook.key === 'test' ? ' (test)' : hook.key === 'ceo' ? ' (CEO group)' : ' (team)')
  try {
    // Sequential on purpose: Slack orders by arrival, so posting in parallel would
    // let message 3 land above message 1.
    let attachTs = null
    for (const m of list) {
      const ts = await slackPostReportMessage(hook.token, hook.channel, m)
      if (m.attach && !attachTs) attachTs = ts
    }
    if (pngBase64 || csv) {
      const stamp = new Date().toISOString().slice(0, 10)
      const base = String(filename || 'overall').replace(/[^a-z0-9._-]+/gi, '-')
      const files = []
      if (pngBase64) files.push(await slackUploadFile(hook.token, {
        filename: base + '-' + stamp + '.png', buffer: Buffer.from(pngBase64, 'base64'), title: 'PM summary table',
      }))
      if (csv) files.push(await slackUploadFile(hook.token, {
        filename: base + '-' + stamp + '.csv', buffer: Buffer.from(String(csv), 'utf8'), title: 'PM summary (full data)',
      }))
      if (files.length) {
        const note = (pixelRatio && pixelRatio < 2) ? '_Image scaled down to fit the upload size limit._' : null
        await slackCompleteUpload(hook.token, {
          files, channel: hook.channel, threadTs: attachTs, initialComment: attachTs ? null : note,
        })
      }
    }
    await logReport({ report_type: logType, recipients: ['slack:' + hook.label], status: 'sent', triggered_by: me.email })
    return res.status(200).json({ ok: true, success: true, channel: hook.label, posted: list.length, rowCount: rowCount || 0 })
  } catch (e) {
    await logReport({ report_type: logType, recipients: ['slack:' + hook.label], status: 'failed', error: e.message, triggered_by: me.email })
    return res.status(500).json({ error: e.message })
  }
}
export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  if ((req.body?.type || req.query?.type) === 'chat_answer') {
    return handleChatAnswerEmail(req, res)
  }
  if ((req.body?.type || req.query?.type) === 'slack_answer') {
    return handleSlackAnswer(req, res)
  }
  if ((req.body?.type || req.query?.type) === 'slack_test') {
    const me = getSessionUser(req)
    if (!me) return res.status(401).json({ error: 'Not signed in' })
    if (me.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
    const cfg = await getReportConfig()
    const hook = resolveSlackTarget(cfg, req.body?.slackTarget || 'test')
    if (!hook.url && !hook.channel) return res.status(500).json({ error: hook.missing })
    try {
      await deliverToSlack(hook, buildSlackTestBlocks({ askedBy: me.email, channelLabel: hook.label, mode: hook.mode }))
      return res.status(200).json({ ok: true, success: true, channel: hook.label, mode: hook.mode })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  if ((req.body?.type || req.query?.type) === 'slack_export') {
    return handleSlackExport(req, res)
  }
  if ((req.body?.type || req.query?.type) === 'slack_export_image') {
    return handleSlackExportImage(req, res)
  }
  if ((req.body?.type || req.query?.type) === 'ceo_pin') {
    return handleCeoPin(req, res)
  }
  if ((req.body?.type || req.query?.type) === 'slack_report') {
    return handleSlackReport(req, res)
  }
  if ((req.body?.type || req.query?.type) === 'unassigned_leads') {
    return handleUnassignedLeadsReport(req, res)
  }

  const RESEND_KEY = process.env.RESEND_API_KEY
  if (!RESEND_KEY) return res.status(500).json({ error: 'RESEND_API_KEY not configured' })

  const report_type  = req.body?.type || req.query?.type || 'daily'
  const triggered_by = req.body?.triggered_by || 'cron'
  const validTypes   = ['daily', 'weekly', 'monthly']
  if (!validTypes.includes(report_type)) return res.status(400).json({ error: `Invalid type. Use: ${validTypes.join(', ')}` })

  // This branch previously had NO auth check at all -- a fully anonymous request
  // could trigger a real email send to the whole recipient list, or (via
  // triggered_by:'test' + a custom `recipients` array) to any attacker-chosen
  // address, using the org's Resend account. The GitHub Actions cron has no user
  // session to present, so it authenticates with a shared secret header instead;
  // every other caller (e.g. an admin's "Send now"/"Send test" in Settings, which
  // already sends real credentials:'include' cookies) must be a real admin session.
  if (triggered_by === 'cron') {
    const provided = req.headers['x-cron-secret']
    if (!process.env.CRON_SECRET || provided !== process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'Not signed in' })
    }
  } else {
    const { getSessionUser } = await import('../lib/auth.mjs')
    const me = getSessionUser(req)
    if (!me) return res.status(401).json({ error: 'Not signed in' })
    if (me.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
  }

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
      const hook = resolveSlackTarget(cfg, 'prod')
      // resolveSlackTarget always returns an object, so check for an actual destination --
      // a truthiness test on the object alone would try (and fail) to post when nothing
      // is configured at all.
      if (hook.channel || hook.url) {
        try {
          await deliverToSlack(hook, buildSlackReportSummary({ typeLabel: reportTypeLabel, periodLabel: reportPeriodLabel, summary: reportSummary, todayLabel }))
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
