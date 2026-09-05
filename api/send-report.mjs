import { SLACK_CHANNELS, DEFAULT_CHANNEL_ID, channelHandle, confirmPhrase, phraseMatches } from '../shared/slackChannels.mjs'
import { runAgentToolLoop, CONTRIBUTION_TOOL, OVERALL_TOTALS_TOOL } from './ask-ai.mjs'
// Plain ESM, no React/DOM -- safe as a static import from this .mjs handler
// (unlike api/crm-leads.js below, which is bundled CommonJS and must only
// ever be reached via a dynamic import()).
import { B2C_FULL_TABLE_VERSIONS, B2C_CASHFLOW_TABLE_VERSIONS } from '../src/lib/b2cReport.js'
import { buildB2CServerContext } from '../lib/b2cServerContext.mjs'
import crypto from 'node:crypto'

export const maxDuration = 60
// Slack's Events API signature (verifySlackSignature below) is an HMAC over the
// EXACT raw request bytes -- by the time Vercel's default bodyParser hands over
// an already-parsed req.body object, those bytes are gone. bodyParser is off for
// this whole file so the handler can read them once, itself, up front; every
// existing dispatch below still gets a normal parsed req.body, just populated
// manually instead of by the platform (see the top of the default export).
export const config = { api: { bodyParser: false } }

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

// Any caller-supplied recipient list is attacker-controllable, and the Ask AI
// email path (handleChatAnswerEmail) is reachable by ANY signed-in viewer -- not
// just an admin -- while sending caller-supplied HTML from the company's verified
// Resend domain. Unrestricted, that is an open relay wearing our From: address.
// An address is accepted only if it is on the company domain or already has a row
// in allowed_users; everything else is reported back as rejected rather than
// silently dropped, so the caller can see what happened.
const RECIPIENT_DOMAIN = 'leverageedu.com'
const MAX_RECIPIENTS = 25
const EMAIL_RE = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[A-Za-z]{2,}$/

async function rosterEmails() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/allowed_users?select=email`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` }
    })
    const rows = (await res.json()) || []
    return new Set(rows.map(r => String(r.email || '').trim().toLowerCase()).filter(Boolean))
  } catch { return new Set() }
}

async function vetRecipients(list) {
  const seen = []
  for (const x of (list || [])) {
    const a = String(x == null ? '' : x).trim().toLowerCase()
    if (a && seen.indexOf(a) === -1) seen.push(a)
  }
  const allowed = []
  const rejected = []
  let roster = null
  for (const a of seen) {
    if (!EMAIL_RE.test(a)) { rejected.push(a); continue }
    if (a.endsWith('@' + RECIPIENT_DOMAIN)) { allowed.push(a); continue }
    if (roster === null) roster = await rosterEmails()
    if (roster.has(a)) allowed.push(a)
    else rejected.push(a)
  }
  return { allowed: allowed.slice(0, MAX_RECIPIENTS), rejected }
}

function rejectedRecipientError(vetted) {
  return 'Recipients must be @' + RECIPIENT_DOMAIN + ' addresses or existing Quantum members. Refused: ' + vetted.rejected.join(', ')
}

// Every preference the report path reads, in one list. The per channel keys come
// from shared/slackChannels.mjs, so adding a channel there widens this query by
// itself and nobody has to remember to edit a comma separated string down here.
const PREF_KEYS = Array.from(new Set([
  'report_from_name', 'report_from_email', 'report_subjects', 'auto_reports_enabled',
  'slack_webhook_url', 'slack_webhook_url_test', 'slack_channel_main',
  'slack_channel_test', 'slack_test_channels', 'slack_auto_reports_enabled',
  // Missing here meant handleB2CDailyReport's resolveApprovalDestination() could
  // never see whatever the admin actually picked in Settings -- cfg.b2c_approve_destination
  // was always undefined regardless of what was saved, so the Approve button always
  // fell back to the default test channel (voxpath) even after picking b2c_core.
  'b2c_approve_destination',
  // The editable "Revenue vs Cash Flow" note -- Settings > Data > "B2C Report
  // Note". Read here so handleB2CDailyReport can pass it through as
  // ctx.revVsCashflowNote, matching what CeoB2CDashboard.jsx's own on-demand
  // Send-to-Slack path already does client-side.
  'b2c_rev_vs_cashflow_note',
]
  .concat(SLACK_CHANNELS.map(function (c) { return c.pref }))
  .concat(SLACK_CHANNELS.map(function (c) { return c.altPref }))
  .concat(SLACK_CHANNELS.map(function (c) { return c.hookPref }))
  .filter(Boolean)))

async function getReportConfig() {
  const out = {}
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/app_preferences?select=key,value&key=in.(${PREF_KEYS.join(',')})`, {
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
// Destinations:
//   test:<id> -- one of possibly SEVERAL named sandbox channels (see getTestChannels
//                below). Bare 'test' means "the first configured one". Safe, one click.
//   <id>      -- any channel id listed in shared/slackChannels.mjs, e.g. 'internal'
//                (team-performance-marketing), 'ceo' (performance_mktg_core) or
//                'b2c_core' (b2c-leverage-core). Channels marked guarded there need
//                an admin, that channel's own confirmation phrase, and the CEO PIN,
//                all three checked on the server before a single Slack call is made.
// 'prod', 'main', '' and anything unrecognised still resolve to internal, which is
// exactly where they resolved before this existed -- the scheduler and the older
// callers behave identically.
// One entry per channel, built straight from the shared directory so the API and
// the Send to Slack panel can never disagree about which channels exist or which
// of them are locked. Add a channel in shared/slackChannels.mjs, never here.
const SLACK_TARGETS = {}
SLACK_CHANNELS.forEach(function (c) { SLACK_TARGETS[c.id] = c })

// Multiple named test channels, admin-managed in Settings > Reports as
// app_preferences.slack_test_channels: [{id, name, channel}, ...]. Falls back to the
// original single slack_channel_test/SLACK_CHANNEL_TEST slot (labelled plain "Test
// channel") when the list has never been configured, so an account that shipped before
// this existed keeps working with zero migration.
function getTestChannels(cfg) {
  let list = Array.isArray(cfg.slack_test_channels) ? cfg.slack_test_channels : []
  list = list.filter(c => c && c.id && c.channel)
  if (!list.length) {
    const legacy = cfg.slack_channel_test || process.env.SLACK_CHANNEL_TEST
    if (legacy) list = [{ id: 'legacy', name: 'Test channel', channel: legacy }]
  }
  return list
}

// target is either a bare channel id from shared/slackChannels.mjs, 'test',
// 'test:<id>' to pick a SPECIFIC configured test channel by id, or
// 'raw:<channelId>' -- a channel picked ad hoc from Send to Slack's own
// "Browse channels" list (backed by slack_channel_list -> conversations.list)
// rather than one of the fixed named destinations above. 'raw:' keeps the
// ORIGINAL casing for the id, unlike every other branch here -- a real Slack
// channel id (e.g. C0B52AJS0TU) is case-sensitive.
function normaliseTarget(target) {
  const raw = String(target || '')
  const t = raw.toLowerCase()
  if (t === 'test') return { family: 'test', id: null }
  const m = t.match(/^test:(.+)$/)
  if (m) return { family: 'test', id: m[1] }
  const rm = raw.match(/^raw:(.+)$/i)
  if (rm) return { family: 'raw', id: rm[1] }
  if (SLACK_TARGETS[t]) return { family: t, id: null }
  return { family: DEFAULT_CHANNEL_ID, id: null }
}

function resolveSlackTarget(cfg, target, opts) {
  const { family, id } = normaliseTarget(target)

  if (family === 'test') {
    const channels = getTestChannels(cfg)
    const entry = (id && channels.find(c => c.id === id)) || channels[0]
    if (!entry) return { mode: 'bot', key: 'test', isTest: true, label: 'test channel', missing: 'No Slack test channel is set -- add one in Settings > Reports.' }
    const botToken = process.env.SLACK_BOT_TOKEN
    if (botToken) return { mode: 'bot', key: 'test', id: entry.id, token: botToken, channel: entry.channel, label: entry.name, isTest: true }
    // No webhook fallback for a SPECIFIC non-default test channel: a webhook is welded
    // to one channel, so only the account's single configured test webhook (always
    // meant for the FIRST/default test channel) can ever work this way.
    const url = cfg.slack_webhook_url_test || process.env.SLACK_WEBHOOK_URL_TEST
    return {
      mode: 'webhook', key: 'test', id: entry.id, url, label: entry.name, isTest: true,
      missing: url ? undefined : `Slack ${entry.name} is not connected -- add SLACK_BOT_TOKEN plus a channel, or a webhook URL, in Settings > Reports.`,
    }
  }

  if (family === 'raw') {
    const botToken = process.env.SLACK_BOT_TOKEN
    if (!botToken) return { mode: 'bot', key: 'raw', isTest: false, missing: 'Browse Channel needs SLACK_BOT_TOKEN -- an Incoming Webhook cannot post to an ad-hoc channel.' }
    // A channel picked from Browse can never be one of the two CEO-guarded
    // rooms in disguise -- resolve each guarded destination's REAL channel
    // value the exact same way the guarded branch below does, and refuse if
    // the raw id matches, so nobody skips the PIN gate just by picking the
    // CEO channel out of the browse list instead of its own named chip.
    const guardedHit = SLACK_CHANNELS.find(function (c) {
      if (!c.guarded) return false
      const real = cfg[c.pref] || process.env[c.env] || (c.altPref ? (cfg[c.altPref] || process.env[c.altEnv]) : '') || c.fallback || ''
      const realId = String(real).replace(/^#/, '')
      return realId && (realId === id || realId === c.name)
    })
    if (guardedHit) {
      return { mode: 'bot', key: family, label: guardedHit.label, isTest: false, guarded: true, missing: '#' + guardedHit.name + ' is only reachable from its own chip, after the PIN check.' }
    }
    const rawLabel = '#' + ((opts && opts.rawLabel) || id)
    return { mode: 'bot', key: 'raw:' + id, token: botToken, channel: id, label: rawLabel, isTest: false, guarded: false }
  }

  const spec = SLACK_TARGETS[family]
  const label = spec.label
  // A guarded destination is unreachable unless the caller states, in so many
  // words, that it has already run the PIN gate. Ask AI, the table exports and
  // the scheduler all call this without that flag, so none of them can be talked
  // into reaching a locked channel.
  if (spec.guarded && !(opts && opts.allowGuarded)) {
    return { mode: 'bot', key: family, label, isTest: false, guarded: true, missing: '#' + spec.name + ' is only reachable from Send to Slack, after the PIN check.' }
  }
  const botToken = process.env.SLACK_BOT_TOKEN
  if (botToken) {
    const channel = cfg[spec.pref] || process.env[spec.env]
      || (spec.altPref ? (cfg[spec.altPref] || process.env[spec.altEnv]) : '')
      || spec.fallback || ''
    if (channel) return { mode: 'bot', key: family, token: botToken, channel, label, isTest: false, guarded: !!spec.guarded }
    return { mode: 'bot', key: family, label, isTest: false, guarded: !!spec.guarded, missing: `No Slack ${label} set -- add the channel in Settings > Reports.` }
  }
  // No webhook fallback for a locked channel on purpose: a webhook cannot upload
  // chart images this report is built around, so it could only ever post a
  // half-report to the one audience that must not receive one.
  if (spec.guarded) {
    return { mode: 'bot', key: family, label, isTest: false, guarded: true, missing: '#' + spec.name + ' needs SLACK_BOT_TOKEN -- an Incoming Webhook cannot post this report.' }
  }
  const url = cfg[spec.hookPref] || process.env[spec.hookEnv]
  return {
    mode: 'webhook', key: family, url, label, isTest: false,
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

// Settings > Reports > Slack redesign (2026-08-27): the channel picker used
// to only ever show channels someone had already typed in by hand. This
// lists every real channel the bot token can see, via conversations.list.
// channels:read (already granted) covers public channels; a private one
// only appears if the app also has groups:read AND the bot has been
// invited to it -- both real, separate requirements, so a channel missing
// from this list isn't necessarily a bug, it's one of those two gates.
async function handleSlackChannelList(req, res) {
  const { getSessionUser } = await import('../lib/auth.mjs')
  const me = getSessionUser(req)
  if (!me) return res.status(401).json({ error: 'Not signed in' })
  if (me.role !== 'admin') return res.status(403).json({ error: 'Admin only' })

  const token = process.env.SLACK_BOT_TOKEN
  if (!token) return res.status(500).json({ error: 'SLACK_BOT_TOKEN is not configured' })

  const channels = []
  let cursor = ''
  try {
    do {
      const q = new URLSearchParams({
        types: 'public_channel,private_channel',
        exclude_archived: 'true',
        limit: '200',
        ...(cursor ? { cursor } : {}),
      })
      const r = await fetch('https://slack.com/api/conversations.list?' + q.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await r.json()
      if (!data.ok) {
        const hints = {
          invalid_auth: 'SLACK_BOT_TOKEN is invalid or revoked',
          not_authed: 'SLACK_BOT_TOKEN is missing',
          missing_scope: `the app is missing a scope conversations.list needs (channels:read, and groups:read for private channels)`,
        }
        return res.status(502).json({ error: hints[data.error] || data.error || 'Slack conversations.list failed' })
      }
      for (const c of data.channels || []) {
        channels.push({ id: c.id, name: c.name, isPrivate: !!c.is_private, isMember: !!c.is_member, numMembers: c.num_members || 0 })
      }
      cursor = data.response_metadata?.next_cursor || ''
    } while (cursor)
  } catch (e) {
    return res.status(502).json({ error: 'Slack request failed: ' + e.message })
  }

  channels.sort((a, b) => a.name.localeCompare(b.name))
  return res.status(200).json({ channels })
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

function buildSlackAnswerBlocks({ question, answerMarkdown, askedBy, channelLabel, isTest }) {
  const body = mdToSlackText(answerMarkdown).slice(0, 2900)
  return {
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '📊 Ask AI Answer', emoji: true } },
      ...(isTest
        ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: `:test_tube: *Test post* -- sent to ${channelLabel || 'a test channel'} to check formatting.` }] }]
        : []),
      { type: 'section', text: { type: 'mrkdwn', text: `*${(question || '').slice(0, 300)}*` } },
      { type: 'divider' },
      { type: 'section', text: { type: 'mrkdwn', text: body || '_No content_' } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `Shared by ${askedBy || 'a teammate'} · Leverage Quantum` }] },
    ],
  }
}

function buildSlackExportBlocks({ title, columns, rows, sourcePage, askedBy, channelLabel, isTest }) {
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
      ...(isTest
        ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: `:test_tube: *Test post* -- sent to ${channelLabel || 'a test channel'} to check formatting.` }] }]
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
    await deliverToSlack(hook, buildSlackAnswerBlocks({ question, answerMarkdown, askedBy: me.email, channelLabel: hook.label, isTest: hook.isTest }))
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
  const logType = hook.isTest ? 'slack export (test)' : 'slack export'
  try {
    await deliverToSlack(hook, buildSlackExportBlocks({ title, columns, rows, sourcePage, askedBy: me.email, channelLabel: hook.label, isTest: hook.isTest }))
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
  const asked = Array.isArray(req.body?.recipients) ? req.body.recipients : []
  if (!answerHtml) return res.status(400).json({ error: 'No answer content to send' })
  if (!asked.length) return res.status(400).json({ error: 'No recipients specified' })
  const vetted = await vetRecipients(asked)
  if (!vetted.allowed.length) return res.status(400).json({ error: rejectedRecipientError(vetted), rejected: vetted.rejected })
  const recipients = vetted.allowed

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

// Admin-only, ad-hoc raw-HTML send -- for a fully self-designed document (its
// own masthead/footer, no shared report chrome) that doesn't fit any existing
// report template. Unlike handleChatAnswerEmail this never wraps the HTML in
// buildChatAnswerEmail's own template; the caller's HTML goes to Resend as-is.
async function handleCustomHtmlEmail(req, res) {
  const { getSessionUser } = await import('../lib/auth.mjs')
  const me = getSessionUser(req)
  if (!me) return res.status(401).json({ error: 'Not signed in' })
  if (me.role !== 'admin') return res.status(403).json({ error: 'Admin only' })

  const RESEND_KEY = process.env.RESEND_API_KEY
  if (!RESEND_KEY) return res.status(500).json({ error: 'RESEND_API_KEY not configured' })

  const { html, subject, label } = req.body || {}
  const asked = Array.isArray(req.body?.recipients) ? req.body.recipients : []
  const askedCc = Array.isArray(req.body?.cc) ? req.body.cc : []
  if (!html || typeof html !== 'string') return res.status(400).json({ error: 'No HTML content to send' })
  if (html.length > 1_800_000) return res.status(400).json({ error: 'HTML too large to send' })
  if (!asked.length) return res.status(400).json({ error: 'No recipients specified' })
  const vetted = await vetRecipients(asked)
  if (!vetted.allowed.length) return res.status(400).json({ error: rejectedRecipientError(vetted), rejected: vetted.rejected })
  const recipients = vetted.allowed
  const vettedCc = askedCc.length ? await vetRecipients(askedCc) : { allowed: [], rejected: [] }
  const cc = vettedCc.allowed
  const reportType = label || 'custom html'

  try {
    const cfg = await getReportConfig()
    const fromAddr = cfg.report_from_email
      ? `${cfg.report_from_name || 'Leverage Quantum'} <${cfg.report_from_email}>`
      : (process.env.REPORT_FROM_EMAIL || 'Leverage Quantum <quantum@platform.leverageedu.com>')
    const payload = { from: fromAddr, to: recipients, subject: subject || 'Leverage Quantum', html }
    if (cc.length) payload.cc = cc
    const sendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
      body: JSON.stringify(payload),
    })
    const sendData = await sendRes.json()
    if (!sendRes.ok) throw new Error(sendData.message || JSON.stringify(sendData))
    await logReport({ report_type: reportType, recipients: [...recipients, ...cc], status: 'sent', triggered_by: me.email })
    return res.status(200).json({ ok: true, success: true, recipients, cc, id: sendData.id })
  } catch (e) {
    await logReport({ report_type: reportType, recipients, status: 'failed', error: e.message, triggered_by: me.email })
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

async function slackPostBlocks(token, channel, text, blocks, threadTs) {
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: 'Bearer ' + token },
    body: JSON.stringify(threadTs ? { channel, text, blocks, thread_ts: threadTs } : { channel, text, blocks }),
  })
  const d = await res.json().catch(() => ({}))
  if (!d.ok) throw new Error('Slack: ' + (d.error || 'message rejected'))
  return d.ts
}

// ── Slack: @mention Q&A on the Overall dashboard, AI-powered ────────────────────
// Someone @pm_analyst's the bot in any channel it's in and asks a question about
// Overall (spend/leads/QLs/CPQL/by-source/why-did-it-change) -- Claude decides
// what to fetch via the same get_overall_totals/analyze_campaign_contribution
// tools Ask AI itself uses (imported from ask-ai.mjs, not duplicated), writes the
// explanation, and THIS code -- not Claude -- renders the actual numbers it
// returned into a real Slack table block, so the table is always exact.
const OVERALL_QA_SYSTEM = today => `You are Quantum's Slack assistant, answering one question at a time in a Slack channel.

You can ONLY answer questions about the Overall marketing dashboard: spend, leads, Total QL (qualified leads), applications, offers, deposits, RAUs, CPL, CPQL, CPA, broken down by source/channel if asked, and "why did it change" contribution analysis. If asked about anything else (Meta Ads/Google Ads specifics, QL Ops, B2C revenue or cash flow, or anything unrelated), say plainly that you can currently only answer Overall-dashboard questions -- do not guess or make up a number for something outside that.

Today's date is ${today}. All figures are in Indian Rupees (₹). Resolve relative dates (today, yesterday, this month, last month, a named month) to real YYYY-MM-DD ranges yourself before calling a tool.

Use get_overall_totals for a direct "what was X" question. Use analyze_campaign_contribution only for a "why did it change" / "what's driving it" question between two periods. If the user names a specific campaign, product line, or keyword (not one of the six Sources: Meta Ads, Google Ads, Remarketing, Affiliate, Organic, Other), call get_overall_totals again with campaign_contains set to that term instead of saying it isn't tracked -- only say a term is unsupported after that retry also finds nothing.

Keep your answer to 1-4 short sentences, in plain text (no markdown table, no bullet list of raw numbers) -- the exact figures from your tool call are rendered as a real table separately, right under your answer, so do not restate every number yourself. If a tool call fails or returns no data, say so plainly instead of guessing.`

function fmtN(n) { return n == null ? '—' : Math.round(n).toLocaleString('en-IN') }

// get_overall_totals's {rows:[{label,spend,leads,totalQL,cpl,cpql,cpa,apps,offers,deposits,raus}], group_by:'none'|'source'|'campaign'}
function overallTotalsTable(result) {
  const rows = Array.isArray(result?.rows) ? result.rows : []
  if (!rows.length) return null
  const firstCol = result.group_by === 'campaign' ? 'Campaign' : result.group_by === 'source' ? 'Source' : 'Total'
  return {
    columns: [firstCol, 'Spend', 'Leads', 'Total QL', 'CPQL', 'CPL', 'Applications', 'Offers', 'Deposits', 'RAUs'],
    rows: rows.map(r => [r.label, fmtINR(r.spend), fmtN(r.leads), fmtN(r.totalQL), r.cpql == null ? '—' : fmtINR(r.cpql), r.cpl == null ? '—' : fmtINR(r.cpl), fmtN(r.apps), fmtN(r.offers), fmtN(r.deposits), fmtN(r.raus)]),
    wrapFirst: result.group_by === 'campaign',
  }
}

// analyze_campaign_contribution's {contributors:[{campaign,channel,currentQL,previousQL,deltaQL,shareOfChangePct,cpql,action}]}
function contributionTable(result) {
  const rows = Array.isArray(result?.contributors) ? result.contributors : []
  if (!rows.length) return null
  return {
    columns: ['Campaign', 'Channel', 'Total QL', 'vs prev', 'Δ QL', 'Share', 'CPQL', 'Action'],
    rows: rows.map(r => [r.campaign, r.channel, fmtN(r.currentQL), fmtN(r.previousQL), (r.deltaQL >= 0 ? '+' : '') + fmtN(r.deltaQL), (r.shareOfChangePct == null ? '—' : r.shareOfChangePct + '%'), r.cpql == null ? '—' : fmtINR(r.cpql), r.action || '—']),
    wrapFirst: true,
  }
}

// TESTING GATE -- this feature is still being tried out, so it stays active in
// ONLY this one channel (#voxpath) no matter how many other channels/groups the
// bot gets invited to in the meantime. A mention anywhere else is silently
// ignored (no reply at all, not even an error) rather than answering broadly.
// Remove this whole check (and the env override below) once out of testing.
const SLACK_QA_TEST_CHANNEL_ID = process.env.SLACK_QA_TEST_CHANNEL_ID || 'C0B6FKV1XEJ' // #voxpath

// Every Slack thread this bot has ever replied in, so a plain follow-up typed
// in that thread (no re-mention) can be recognised as ours and answered with
// context, instead of either being ignored or the bot answering every message
// in the channel. turns is capped to the last 6 exchanges client-side.
async function loadQaThread(channel, threadTs) {
  try {
    const url = `${SUPABASE_URL}/rest/v1/slack_qa_threads?select=turns&channel=eq.${encodeURIComponent(channel)}&thread_ts=eq.${encodeURIComponent(threadTs)}`
    const r = await fetch(url, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
      signal: AbortSignal.timeout(5000),
    })
    if (!r.ok) return []
    const rows = await r.json().catch(() => [])
    return Array.isArray(rows?.[0]?.turns) ? rows[0].turns : []
  } catch { return [] }
}
async function saveQaThread(channel, threadTs, turns) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/slack_qa_threads`, {
      method: 'POST',
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ channel, thread_ts: threadTs, turns: turns.slice(-6), updated_at: new Date().toISOString() }),
      signal: AbortSignal.timeout(5000),
    })
  } catch { /* thread memory is a nice-to-have -- a failed save must not break the reply that already went out */ }
}

// A Claude + tool-use round trip is 5-20s -- long enough that the channel
// otherwise goes silent with no sign the message was even seen. Post a
// placeholder immediately and let the caller EDIT that same message in place
// (chat.update) once the real answer is ready, rather than posting a second
// message -- falls back to a normal new post if the placeholder itself fails.
async function postPlaceholder(token, channel, threadTs) {
  let placeholderTs = null
  try {
    placeholderTs = await slackPostBlocks(token, channel, 'Checking Overall data…', [
      { type: 'section', text: { type: 'mrkdwn', text: ':mag: Checking Overall data…' } },
    ], threadTs)
  } catch {}
  return (fallbackText, blocks) => placeholderTs
    ? slackUpdateBlocks(token, channel, placeholderTs, fallbackText, blocks)
    : slackPostBlocks(token, channel, fallbackText, blocks, threadTs)
}

// The shared core behind both an @mention and a plain thread follow-up:
// build the question (with prior turns as context, if any), run the same
// Claude + tool-use loop, render whichever tool call returned real data into
// a table, deliver it, then remember this exchange for the NEXT follow-up.
async function answerOverallQuestion({ channel, threadTs, question, priorTurns, deliver }) {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const historyText = (priorTurns || []).map(t => `Q: ${t.q}\nA: ${t.a}`).join('\n\n')
    const userText = historyText ? `Conversation so far in this thread:\n${historyText}\n\nFollow-up question: ${question}` : question
    const { text, toolLog } = await runAgentToolLoop({
      system: [{ type: 'text', text: OVERALL_QA_SYSTEM(today) }],
      userText,
      tools: [OVERALL_TOTALS_TOOL, CONTRIBUTION_TOOL],
      agentId: 'slack_overall_qa',
    })
    const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: (text || 'I could not find an answer for that.').slice(0, 2900) } }]
    // Render the table from whichever tool call actually returned usable data,
    // most recent first -- Claude's OWN text never carries the numbers, so the
    // table is always exactly what the tool returned, not what the model recalled.
    const lastGood = [...(toolLog || [])].reverse().find(t => t.result && !t.result.error && (Array.isArray(t.result.rows) || Array.isArray(t.result.contributors)))
    if (lastGood) {
      const table = lastGood.name === 'get_overall_totals' ? overallTotalsTable(lastGood.result) : contributionTable(lastGood.result)
      if (table) blocks.push(slackTableBlock(table))
    }
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: ':information_source: AI-generated from Overall’s live data — verify anything decision-critical on the dashboard.' }] })
    await deliver((text || 'Overall answer').slice(0, 200), blocks)
    await saveQaThread(channel, threadTs, [...(priorTurns || []), { q: question, a: (text || '').slice(0, 800) }])
  } catch (e) {
    await deliver("Sorry, I couldn't pull that up.", [
      { type: 'section', text: { type: 'mrkdwn', text: "Sorry, I couldn't pull that up just now (" + String(e.message || 'error').slice(0, 150) + ').' } },
    ]).catch(() => {})
  }
}

async function handleSlackAppMention(event) {
  if (event.channel !== SLACK_QA_TEST_CHANNEL_ID) return
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) return
  const channel = event.channel
  const threadTs = event.thread_ts || event.ts
  // Slack's raw mention text always leads with the literal <@BOTID> token.
  const question = String(event.text || '').replace(/<@[^>]+>/g, '').trim()
  if (!question) {
    await slackPostBlocks(token, channel, 'Ask me about Overall.', [
      { type: 'section', text: { type: 'mrkdwn', text: "Ask me something about Overall — spend, leads, QLs, CPQL, by source, or what's driving a change." } },
    ], threadTs).catch(() => {})
    return
  }
  // A re-mention INSIDE a thread we already answered in still gets that
  // thread's history, same as a plain follow-up would.
  const priorTurns = event.thread_ts ? await loadQaThread(channel, event.thread_ts) : []
  const deliver = await postPlaceholder(token, channel, threadTs)
  await answerOverallQuestion({ channel, threadTs, question, priorTurns, deliver })
}

// A plain reply typed in a thread, with no @mention at all -- Slack's
// message.groups event (see the Event Subscriptions setup this needs). Filtered
// hard: only inside the test channel, never a bot message (including our own
// replies, which would otherwise trigger themselves), only an actual threaded
// reply (not a fresh top-level message), and only when we genuinely have prior
// history for that exact thread -- otherwise this is unrelated channel chatter
// the bot was never asked about and must leave alone.
async function handleSlackThreadReply(event) {
  if (event.channel !== SLACK_QA_TEST_CHANNEL_ID) return
  if (event.bot_id || event.subtype) return
  if (!event.thread_ts || event.thread_ts === event.ts) return
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) return
  const priorTurns = await loadQaThread(event.channel, event.thread_ts)
  if (!priorTurns.length) return
  const question = String(event.text || '').trim()
  if (!question) return
  const deliver = await postPlaceholder(token, event.channel, event.thread_ts)
  await answerOverallQuestion({ channel: event.channel, threadTs: event.thread_ts, question, priorTurns, deliver })
}

async function readRawBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks)
}

// v0=HMAC-SHA256("v0:{timestamp}:{raw body}", signing secret) -- Slack's own
// request-signing scheme. A >5-minute-old timestamp is rejected too, so a
// captured request can't be replayed later.
function verifySlackSignature(rawBody, timestamp, signature) {
  const secret = process.env.SLACK_SIGNING_SECRET
  if (!secret || !timestamp || !signature) return false
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false
  const base = `v0:${timestamp}:${rawBody.toString('utf8')}`
  const expected = 'v0=' + crypto.createHmac('sha256', secret).update(base).digest('hex')
  try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature)) } catch { return false }
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

  const logType = hook.isTest ? 'slack table image (test)' : 'slack table image'
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
      isTest: hook.isTest, degraded: pixelRatio ? pixelRatio < 2 : false,
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

// Slack caps a section at 3000 characters and quietly drops the rest, which
// would take the footer off the end of a long report. Split on blank lines
// instead, and never inside a code fence, so nothing is lost silently.
function mrkdwnSections(t) {
  const s = String(t || '')
  if (s.length <= 2900) return [s]
  const out = []
  let cur = ''
  let open = false
  s.split('\n\n').forEach(function (p) {
    const cand = cur ? cur + '\n\n' + p : p
    if (!open && cur && cand.length > 2900) { out.push(cur); cur = p } else { cur = cand }
    if (((p.match(/```/g) || []).length) % 2) open = !open
  })
  if (cur) out.push(cur)
  return out.map(function (x) { return x.slice(0, 2900) })
}

function reportBlocks(m, opts) {
  const clip = t => String(t || '').slice(0, 2900)
  const blocks = []
  if (m.text) mrkdwnSections(m.text).forEach(function (t) { blocks.push({ type: 'section', text: { type: 'mrkdwn', text: t } }) })
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
// Slack will not colour its own chart and will not print the value on a bar,
// and this report is read on a phone. So we have a picture of our own -- brand
// ramp, every number written on it -- and it goes underneath the message it
// belongs to, full width, no tap needed.
async function slackUploadChartPng(token, channel, m) {
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

async function slackPostReportMessage(token, channel, m) {
  const fallbackText = String(m.text || m.label || 'Report').slice(0, 2900)
  // A version may hand over a finished Block Kit payload instead of the
  // { text, fields, table, chart } shape every builder used until now. Nothing
  // that exists today sets m.blocks, so every current report falls straight
  // through to the renderer below and behaves exactly as it did before.
  // The newer block types are not enabled in every workspace, so this degrades
  // the same way the rest of this file does: the full layout first, then only
  // the blocks Slack has shipped everywhere, then the plain text fallback.
  if (Array.isArray(m.blocks) && m.blocks.length) {
    const EVERYWHERE = new Set(['header', 'section', 'divider', 'context', 'actions', 'image', 'rich_text'])
    const safe = m.blocks.filter(b => b && EVERYWHERE.has(b.type))
    const tries = safe.length && safe.length < m.blocks.length ? [m.blocks, safe] : [m.blocks]
    let blockErr = null
    let blockTs = null
    for (const bl of tries) {
      try { blockTs = await slackPostBlocks(token, channel, fallbackText, bl); break }
      catch (e) { blockErr = e }
    }
    if (!blockTs) throw blockErr || new Error('Slack: message rejected')
    // A Block Kit message can carry a chart of its own too. It used to return
    // here, which quietly skipped the upload below, so the brand-ramp picture
    // never reached the channel.
    if (m.chartPng) await slackUploadChartPng(token, channel, m)
    return blockTs
  }
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

  if (ownChart) await slackUploadChartPng(token, channel, m)
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

// ── B2C daily report: automated 3pm send, gated behind a Slack-button approval ──
//
// The cron posts BOTH the P&L and Cash Flow full-particulars reports to the
// #dashboard-testing sandbox channel (never straight to the real, CEO-visible
// #b2c-leverage-core channel) with an "Approve" button attached to each
// message. Clicking that button IS the approval step -- no PIN/phrase modal
// here, since a human looking at the exact rendered report and pressing a
// real button in Slack already is the human-in-the-loop gate the user asked
// for. The PIN gate that protects the *manual* Send-to-Slack panel is a
// separate, complementary control for a different code path and is
// untouched by this.
//
// Built server-side, no browser: buildB2CServerContext (lib/b2cServerContext.mjs)
// ports the exact day/mtd/fy arithmetic CeoB2CDashboard.jsx computes
// client-side, so these numbers can never drift from what the page itself
// would show. No PNG table screenshot is sent (that needs a real DOM, which a
// cron has none of) -- the native Slack table block these builders produce
// already carries every line item, so nothing is lost, only the bonus image.
//
// api/crm-leads.js is bundled as CommonJS (its own top-of-file comment says
// so) -- a STATIC import of it from this ESM file risks the exact
// ERR_REQUIRE_ESM class of bug this repo has hit before, so it's reached only
// through a dynamic import(), same safe pattern used everywhere else in this
// codebase for this exact hazard.
async function fetchB2CDataSafe() {
  const { fetchB2CData } = await import('./crm-leads.js')
  return fetchB2CData()
}

function findTestChannelId(cfg, wantedName) {
  const list = Array.isArray(cfg.slack_test_channels) ? cfg.slack_test_channels : []
  const hit = list.find(c => c && c.id && String(c.name || '').toLowerCase() === wantedName.toLowerCase())
  return hit ? hit.id : null
}

async function savePendingB2CReport(statement, messages) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/b2c_pending_reports`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=representation',
    },
    body: JSON.stringify({ statement, messages, status: 'pending' }),
  })
  const rows = await r.json().catch(() => [])
  if (!r.ok || !rows[0]) throw new Error('Could not save the pending report (has supabase/sql/b2c_pending_reports_setup.sql been run?)')
  return rows[0].id
}

// The ONE place that decides where the Approve button actually goes -- both
// the button's own LABEL (below) and handleSlackBlockAction's real send call
// this, so the two can never disagree about the destination the way the
// button's old hardcoded '#b2c-leverage-core' text did (it was written before
// this became configurable, and never updated -- the button said one thing
// and the code did another). Was test-channel-only; now also allows the real,
// guarded b2c_core channel (by explicit request, once the pipeline was proven
// working) -- still refuses any OTHER channel (ceo/internal/anything else),
// even if the stored preference were edited directly to something else.
function resolveApprovalDestination(cfg) {
  const configured = cfg.b2c_approve_destination || 'test'
  const fam = normaliseTarget(configured).family
  return (fam === 'test' || fam === 'b2c_core') ? configured : 'test'
}

function approvalDestinationLabel(hook) {
  return hook.isTest ? '#' + hook.label : channelHandle(hook.key)
}

// Optional allowlist for who can click Approve/Disapprove at all -- unset
// means anyone who can see the sandbox channel can.
function slackApproverAllowlist() {
  return String(process.env.SLACK_APPROVER_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean)
}

// Applied only to the SANDBOX copy of the message -- the pristine, button-free
// version is what's stored and what actually gets posted to the real channel
// on approval, so #b2c-leverage-core never shows a stale, already-used button.
// Disapprove needs no lock -- flagging an issue isn't the sensitive action,
// only pushing the report onward is.
function withApproveButtons(message, pendingId, destLabel) {
  const blocks = Array.isArray(message.blocks) ? message.blocks.slice() : []
  blocks.push({
    type: 'actions',
    block_id: 'b2c_approve_' + pendingId,
    elements: [
      {
        type: 'button', action_id: 'approve_b2c_report', style: 'primary',
        text: { type: 'plain_text', text: 'Approve → ' + destLabel, emoji: true },
        value: String(pendingId),
      },
      {
        type: 'button', action_id: 'disapprove_b2c_report', style: 'danger',
        text: { type: 'plain_text', text: 'Disapprove', emoji: true },
        value: String(pendingId),
      },
    ],
  })
  return { ...message, blocks }
}

async function slackOpenView(token, triggerId, view) {
  const res = await fetch('https://slack.com/api/views.open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ trigger_id: triggerId, view }),
  })
  const d = await res.json().catch(() => ({}))
  if (!d.ok) throw new Error('Slack views.open: ' + (d.error || 'rejected'))
  return d.view
}

// A DM by Slack member id, not by email -- users.lookupByEmail needs a
// users:read.email scope this app's bot token doesn't have, and adding it
// would need a Reinstall to Workspace. Posting chat.postMessage straight at
// a user id opens (or reuses) the DM with them, no extra scope required.
async function slackSendDM(token, userId, text) {
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ channel: userId, text }),
  })
  const d = await res.json().catch(() => ({}))
  if (!d.ok) throw new Error('Slack DM: ' + (d.error || 'rejected'))
  return d.ts
}

async function handleB2CDailyReport(req, res) {
  // Vercel's own cron feature sends Authorization: Bearer $CRON_SECRET
  // automatically once CRON_SECRET is set on the project -- the same secret
  // the GitHub Actions crons already send as x-cron-secret, just delivered a
  // different way depending on which scheduler is calling. Both are accepted
  // so this endpoint doesn't care which one triggers it.
  const bearer = req.headers.authorization || ''
  const isVercelCron = !!process.env.CRON_SECRET && bearer === 'Bearer ' + process.env.CRON_SECRET
  const isManualCron = !!process.env.CRON_SECRET && req.headers['x-cron-secret'] === process.env.CRON_SECRET
  if (!isVercelCron && !isManualCron) {
    const { getSessionUser } = await import('../lib/auth.mjs')
    const me = getSessionUser(req)
    if (!me || me.role !== 'admin') return res.status(401).json({ error: 'Not signed in' })
  }

  // Optional: an admin picking a specific "send through" date on the B2C
  // dashboard's own Daily Report control, instead of always auto-picking
  // yesterday. buildB2CServerContext ignores anything invalid or later than
  // the real D-1, so a missing/bad value here just falls back to the old
  // always-yesterday behavior -- the scheduled cron call never sends this
  // field at all and is completely unaffected.
  const throughDate = req.body && typeof req.body.throughDate === 'string' ? req.body.throughDate : null

  try {
    const data = await fetchB2CDataSafe()
    if (!data || data.configured === false) {
      return res.status(500).json({ error: 'B2C sheet is not configured -- set it in Settings > Data.' })
    }
    const cfg = await getReportConfig()
    const testId = findTestChannelId(cfg, 'dashboard-testing')
    const hook = resolveSlackTarget(cfg, testId ? 'test:' + testId : 'test', {})
    if (hook.mode !== 'bot' || !hook.channel) {
      return res.status(400).json({ error: hook.missing || 'The #dashboard-testing sandbox channel is not configured.' })
    }
    // The button's label reflects wherever it will ACTUALLY post -- same
    // resolver handleSlackBlockAction uses for the real send, so the two can
    // never drift apart again. Called WITHOUT allowGuarded (this is only a
    // preview message, no PIN has been entered yet) -- so for the real,
    // guarded b2c_core destination, .channel is deliberately left unset by
    // resolveSlackTarget's guarded branch. That's fine for a plain text LABEL
    // though: hook.guarded means "this is a real, known, locked channel",
    // and its name (via channelHandle, a static lookup) needs no live
    // credential to display -- only .guarded||.channel should gate whether a
    // name is shown at all, not .channel alone, or a guarded pick always read
    // as "not configured" even once correctly resolved.
    const approvalHook = resolveSlackTarget(cfg, resolveApprovalDestination(cfg), {})
    const approvalLabel = approvalHook.mode === 'bot' && (approvalHook.channel || approvalHook.guarded)
      ? approvalDestinationLabel(approvalHook)
      : '(destination not configured)'

    const jobs = [
      { statement: 'pnl', days: data.pnl && data.pnl.days, version: B2C_FULL_TABLE_VERSIONS[0] },
      { statement: 'cashflow', days: data.cashFlow && data.cashFlow.days, version: B2C_CASHFLOW_TABLE_VERSIONS[0] },
    ]
    const posted = []
    for (const job of jobs) {
      const ctx = buildB2CServerContext(job.days || [], job.statement, throughDate)
      if (cfg.b2c_rev_vs_cashflow_note) ctx.revVsCashflowNote = cfg.b2c_rev_vs_cashflow_note
      const messages = job.version.build(ctx) // pristine -- this exact array is what gets stored AND what the real channel receives on approval
      const pendingId = await savePendingB2CReport(job.statement, messages)
      const ts = await slackPostReportMessage(hook.token, hook.channel, withApproveButtons(messages[0], pendingId, approvalLabel))
      posted.push({ statement: job.statement, pendingId, ts })
    }
    await logReport({ report_type: 'b2c daily report (sandbox)', recipients: ['slack:' + hook.label], status: 'sent', triggered_by: (isVercelCron || isManualCron) ? 'cron' : 'admin' })
    return res.status(200).json({ ok: true, posted })
  } catch (e) {
    await logReport({ report_type: 'b2c daily report (sandbox)', recipients: [], status: 'failed', error: e.message, triggered_by: 'cron' })
    return res.status(500).json({ error: e.message })
  }
}

// Reads the pending row back (a plain SELECT -- distinct from claim()'s
// atomic conditional PATCH used at submission time) purely to show the
// approver what they're actually approving before they type a PIN.
async function fetchPendingRow(pendingId) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/b2c_pending_reports?id=eq.${encodeURIComponent(pendingId)}&select=*`, {
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
  })
  const rows = await r.json().catch(() => [])
  return rows[0] || null
}

// Pulls the bold rows (Total Revenue/Total Cost/EBITDA for P&L, or Total Cash
// Inflow/Outflow/Net for Cash Flow) out of the native table already built for
// this row's message -- table/strongRows already exist on the message purely
// for the Quantum in-app preview (see b2cReport.js), reused here so the modal
// shows real numbers instead of a bare "approve this?".
function buildReportSummary(row) {
  const label = row.statement === 'cashflow' ? 'Cash Flow' : 'P&L'
  const msg = (row.messages || [])[0] || {}
  const throughMatch = /Through (\d{4}-\d{2}-\d{2})/.exec(msg.text || '')
  const through = throughMatch ? throughMatch[1] : null
  const table = msg.table || {}
  const rows = Array.isArray(table.rows) ? table.rows : []
  const strong = Array.isArray(table.strongRows) ? table.strongRows : []
  const headline = strong.map(i => {
    const r = rows[i]
    return r ? { name: r[0], mtd: r[2] } : null
  }).filter(Boolean)
  return { label, through, headline }
}

function summaryBlocks(summary) {
  if (!summary) return []
  const blocks = [{
    type: 'section',
    text: { type: 'mrkdwn', text: '*B2C — ' + summary.label + '*' + (summary.through ? '  ·  through ' + summary.through : '') },
  }]
  if (summary.headline.length) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: summary.headline.map(h => '*' + h.name + ' (MTD):* ' + h.mtd).join('\n') },
    })
  }
  blocks.push({ type: 'divider' })
  return blocks
}

// Slack Interactivity block_actions handler -- Approve/Disapprove button
// clicks. Neither button acts immediately: Approve opens a modal asking for
// the CEO PIN (the same one that already gates the real Send-to-Slack
// panel), Disapprove opens a modal asking what's wrong. The actual work
// happens in handleSlackViewSubmission once one of those is submitted.
// private_metadata carries just enough (pendingId + the original message's
// channel/ts) to claim the row and update that same message afterward.
async function handleSlackBlockAction(payload) {
  const action = (payload.actions || [])[0]
  if (!action) return
  const token = process.env.SLACK_BOT_TOKEN
  const pendingId = action.value
  const meta = JSON.stringify({
    pendingId,
    channel: payload.channel && payload.channel.id,
    ts: payload.message && payload.message.ts,
  })

  // Optional allowlist -- unset means anyone who can see the sandbox channel
  // (and therefore click a button at all) can approve or disapprove.
  const allowedIds = slackApproverAllowlist()
  if (allowedIds.length && !allowedIds.includes(payload.user && payload.user.id)) {
    // No modal to show an error in yet at this point (trigger_id is only good
    // for opening one), so this is silently ignored for an unauthorized click
    // -- acceptable since the allowlist is an optional extra, not the main gate.
    return
  }

  // trigger_id is only valid for a few seconds, so the row (and, for Approve,
  // the config needed to name the real destination) are fetched in parallel
  // rather than one after another. A missing row just degrades to no summary
  // context in the modal -- never blocks the approve/disapprove flow itself.
  const [row, cfg] = await Promise.all([
    fetchPendingRow(pendingId),
    action.action_id === 'approve_b2c_report' ? getReportConfig() : Promise.resolve(null),
  ])
  const summary = row ? buildReportSummary(row) : null
  const summaryHead = summaryBlocks(summary)

  if (action.action_id === 'approve_b2c_report') {
    // allowGuarded:true here is safe -- resolveSlackTarget only returns metadata
    // (channel/label), it never posts anything by itself. Reaching the real
    // channel still needs the PIN, same as every other approval.
    const hook = cfg ? resolveSlackTarget(cfg, resolveApprovalDestination(cfg), { allowGuarded: true }) : null
    const destLabel = hook && hook.mode === 'bot' && hook.channel ? approvalDestinationLabel(hook) : '(destination not configured)'

    await slackOpenView(token, payload.trigger_id, {
      type: 'modal',
      callback_id: 'b2c_approve_pin_modal',
      private_metadata: meta,
      title: { type: 'plain_text', text: 'Approve report' },
      submit: { type: 'plain_text', text: 'Confirm' },
      close: { type: 'plain_text', text: 'Cancel' },
      blocks: [
        ...summaryHead,
        { type: 'context', elements: [{ type: 'mrkdwn', text: 'This will post to *' + destLabel + '*.' }] },
        {
          type: 'input', block_id: 'pin_block',
          label: { type: 'plain_text', text: 'PIN' },
          element: { type: 'plain_text_input', action_id: 'pin_input' },
        },
        {
          type: 'input', block_id: 'note_block', optional: true,
          label: { type: 'plain_text', text: 'Any notes? (optional)' },
          element: { type: 'plain_text_input', action_id: 'note_input', multiline: true },
        },
      ],
    }).catch(e => console.error('Slack views.open (approve) failed:', e))
    return
  }

  if (action.action_id === 'disapprove_b2c_report') {
    await slackOpenView(token, payload.trigger_id, {
      type: 'modal',
      callback_id: 'b2c_disapprove_modal',
      private_metadata: meta,
      title: { type: 'plain_text', text: 'Disapprove report' },
      submit: { type: 'plain_text', text: 'Send' },
      close: { type: 'plain_text', text: 'Cancel' },
      blocks: [
        ...summaryHead,
        {
          type: 'input', block_id: 'reason_category_block', optional: true,
          label: { type: 'plain_text', text: 'What kind of issue?' },
          element: {
            type: 'static_select', action_id: 'reason_category_input',
            options: [
              { text: { type: 'plain_text', text: 'Wrong numbers' }, value: 'Wrong numbers' },
              { text: { type: 'plain_text', text: 'Wrong period' }, value: 'Wrong period' },
              { text: { type: 'plain_text', text: 'Formatting issue' }, value: 'Formatting issue' },
              { text: { type: 'plain_text', text: 'Other' }, value: 'Other' },
            ],
          },
        },
        {
          type: 'input', block_id: 'reason_block',
          label: { type: 'plain_text', text: "What's incorrect?" },
          element: { type: 'plain_text_input', action_id: 'reason_input', multiline: true },
        },
      ],
    }).catch(e => console.error('Slack views.open (disapprove) failed:', e))
    return
  }
}

function modalFieldValue(view, blockId, actionId) {
  const v = view.state && view.state.values && view.state.values[blockId] && view.state.values[blockId][actionId]
  return (v && v.value) || ''
}

// static_select's answer lives at .selected_option.value, not .value like a
// plain_text_input -- a separate reader rather than overloading modalFieldValue.
function modalSelectValue(view, blockId, actionId) {
  const v = view.state && view.state.values && view.state.values[blockId] && view.state.values[blockId][actionId]
  return (v && v.selected_option && v.selected_option.value) || ''
}

// The modal's Confirm/Send button -- PIN verified or reason collected here,
// after the button click above already opened the right one.
async function handleSlackViewSubmission(payload) {
  const view = payload.view || {}
  let meta = {}
  try { meta = JSON.parse(view.private_metadata || '{}') } catch { meta = {} }
  const pendingId = meta.pendingId
  const actor = (payload.user && (payload.user.username || payload.user.name)) || 'someone'
  const token = process.env.SLACK_BOT_TOKEN

  async function claim(fields) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/b2c_pending_reports?id=eq.${encodeURIComponent(pendingId)}&status=eq.pending`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json', Prefer: 'return=representation',
      },
      body: JSON.stringify(fields),
    })
    const rows = await r.json().catch(() => [])
    return rows[0] || null
  }

  if (view.callback_id === 'b2c_approve_pin_modal') {
    const pin = modalFieldValue(view, 'pin_block', 'pin_input')
    const note = modalFieldValue(view, 'note_block', 'note_input').trim()

    // Resolved once, up front, and reused all the way through -- this is also
    // where allowGuarded:true actually gets exercised (the button-click step
    // only used it to preview the label; THIS is the step that really posts).
    const cfg = await getReportConfig()
    const hook = resolveSlackTarget(cfg, resolveApprovalDestination(cfg), { allowGuarded: true })

    const chk = await verifyCeoPin(pin, actor)
    if (!chk.ok) {
      let msg = chk.message
      // Only 'wrong' carries a meaningful remaining-tries count -- 'locked'
      // already states its own cooldown, and 'no_pin'/'tampered' have none.
      if (chk.code === 'wrong' && chk.failsLeft != null) {
        msg += ' (' + chk.failsLeft + (chk.failsLeft === 1 ? ' try' : ' tries') + ' left)'
      }
      return { response_action: 'errors', errors: { pin_block: msg } }
    }

    // Atomic claim: only proceeds if the row was still 'pending' -- guards
    // against a slow ack retry or a second click posting the report twice.
    // approve_note is only sent when there's actually a note, so an approval
    // with no note keeps working even before supabase/sql/
    // b2c_pending_reports_add_approve_note.sql has been run (an unknown
    // column in the PATCH body would otherwise fail the whole claim).
    const patch = { status: 'approved', approved_by: actor, approved_at: new Date().toISOString() }
    if (note) patch.approve_note = note
    const row = await claim(patch)
    if (!row) {
      if (meta.channel && meta.ts) {
        await slackUpdateBlocks(token, meta.channel, meta.ts, 'Already handled', [
          { type: 'section', text: { type: 'mrkdwn', text: 'Already handled.' } },
        ]).catch(() => {})
      }
      return { response_action: 'clear' }
    }

    const logType = 'b2c ' + row.statement + ' report (approved)'
    try {
      if (hook.mode === 'bot' && hook.channel) {
        for (const m of (row.messages || [])) await slackPostReportMessage(token, hook.channel, m)
      }
      await logReport({ report_type: logType, recipients: ['slack:' + (hook.label || '?')], status: 'sent', triggered_by: actor })
      if (meta.channel && meta.ts) {
        const destLabel = hook.mode === 'bot' && hook.channel ? approvalDestinationLabel(hook) : '(destination not configured)'
        const noteLine = note ? '\n>' + note : ''
        await slackUpdateBlocks(token, meta.channel, meta.ts, 'Approved', [
          { type: 'section', text: { type: 'mrkdwn', text: `✅ *Approved by @${actor}* — sent to ${destLabel}.${noteLine}` } },
        ]).catch(() => {})
      }
    } catch (e) {
      await logReport({ report_type: logType, recipients: [], status: 'failed', error: e.message, triggered_by: actor })
    }
    return { response_action: 'clear' }
  }

  if (view.callback_id === 'b2c_disapprove_modal') {
    const category = modalSelectValue(view, 'reason_category_block', 'reason_category_input')
    const reasonRaw = modalFieldValue(view, 'reason_block', 'reason_input').trim()
    if (!reasonRaw) return { response_action: 'errors', errors: { reason_block: "Say what's incorrect before sending." } }
    const reason = category ? '[' + category + '] ' + reasonRaw : reasonRaw

    const row = await claim({ status: 'rejected', reason, rejected_by: actor, rejected_at: new Date().toISOString() })
    if (!row) return { response_action: 'clear' } // already handled

    if (meta.channel && meta.ts) {
      await slackUpdateBlocks(token, meta.channel, meta.ts, 'Disapproved', [
        { type: 'section', text: { type: 'mrkdwn', text: `❌ *Disapproved by @${actor}*\n>${reason}` } },
      ]).catch(() => {})
    }

    const label = row.statement === 'cashflow' ? 'Cash Flow' : 'P&L'
    const notifyId = process.env.SLACK_DISAPPROVE_NOTIFY_USER_ID
    // Real bug fixed here: this used to log 'sent' just because notifyId was
    // SET, never checking whether slackSendDM actually succeeded -- a failed
    // DM (wrong/placeholder user id, revoked scope, anything) was silently
    // recorded as a success, with the real error only reaching a server
    // console nobody was watching. Now the DM's own outcome decides the log.
    let dmError = notifyId ? null : 'SLACK_DISAPPROVE_NOTIFY_USER_ID is not set'
    if (notifyId) {
      try {
        await slackSendDM(token, notifyId, `❌ *B2C ${label} report disapproved* by @${actor}\n>${reason}`)
      } catch (e) {
        dmError = e.message
        console.error('Slack DM to SLACK_DISAPPROVE_NOTIFY_USER_ID failed:', e)
      }
    }
    await logReport({
      report_type: 'b2c ' + row.statement + ' report (disapproved)',
      recipients: notifyId ? ['slack:dm:' + notifyId] : [],
      status: dmError ? 'failed' : 'sent',
      error: dmError,
      triggered_by: actor,
    })
    return { response_action: 'clear' }
  }

  return { response_action: 'clear' }
}

async function handleSlackReport(req, res) {
  const { getSessionUser, canAccessDashboard } = await import('../lib/auth.mjs')
  const me = getSessionUser(req)
  if (!me) return res.status(401).json({ error: 'Not signed in' })

  // Same per-page gate as every other Slack path: a real PAGE_LIST id from the
  // caller, and admin-only when an older caller sends none.
  const { dashboardId, slackTarget, filename, versionId, messages, pngBase64, csv, pixelRatio, rowCount, ceoPin, confirm, rawChannelName } = req.body || {}
  if (!dashboardId ? me.role !== 'admin' : !canAccessDashboard(me.role, dashboardId)) {
    return res.status(403).json({ error: 'Forbidden' })
  }
  const list = Array.isArray(messages) ? messages.filter(m => m && m.text) : []
  if (!list.length) return res.status(400).json({ error: 'Nothing to post' })
  if (list.length > 6) return res.status(400).json({ error: 'A report is capped at 6 messages' })

  // A guarded channel is one the CEO is in, and it is the only kind that is gated.
  // have to be true, all checked here on the server: the caller is an admin, the
  // caller sent the exact confirmation phrase, and the PIN verifies. Nothing
  // touches Slack until all three pass.
  const guardFam = normaliseTarget(slackTarget).family
  // Guarded means the CEO is in that channel. Which ones those are lives in
  // shared/slackChannels.mjs, so a new channel can never quietly arrive unlocked.
  const guardSpec = SLACK_TARGETS[guardFam] || null
  const wantsCeo = !!(guardSpec && guardSpec.guarded)
  if (wantsCeo) {
    if (me.role !== 'admin') {
      await logReport({ report_type: 'ceo report blocked', recipients: [me.email], status: 'failed', error: 'not an admin', triggered_by: me.email })
      return res.status(403).json({ error: 'Only an admin can post to ' + channelHandle(guardFam) + '.' })
    }
    if (!phraseMatches(guardFam, confirm)) {
      return res.status(400).json({ error: 'Type ' + confirmPhrase(guardFam) + ' to confirm this send.', code: 'need_confirm' })
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
  const hook = resolveSlackTarget(cfg, slackTarget, { allowGuarded: wantsCeo, rawLabel: rawChannelName })
  if (hook.mode !== 'bot' || !hook.channel) {
    return res.status(400).json({ error: 'Posting a report needs SLACK_BOT_TOKEN plus a channel (files:write) -- an Incoming Webhook cannot upload files.' })
  }

  // channelHandle only knows the fixed shared/slackChannels.mjs list -- a
  // 'raw:' key (Browse Channel) already carries its own real label straight
  // off hook.label, so prefer that whenever it's actually a '#name'.
  const targetLabel = hook.label && hook.label.startsWith('#') ? hook.label : channelHandle(hook.key)
  const logType = 'slack pm report ' + (versionId || 'v7') + (hook.key === 'test' ? ' (test)' : ' (' + targetLabel + ')')
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

  // bodyParser is off for this whole file (see the config export above) so every
  // request's JSON body -- Quantum's own callers and Slack's Events API alike --
  // is parsed here, once, from the raw bytes. Only Slack's own requests carry an
  // X-Slack-Signature header; everything else falls straight through unaffected.
  const rawBody = await readRawBody(req)
  const slackSig = req.headers['x-slack-signature']
  if (slackSig && !verifySlackSignature(rawBody, req.headers['x-slack-request-timestamp'], slackSig)) {
    return res.status(401).end('Invalid Slack signature')
  }

  // Slack Interactivity (a button click) arrives form-encoded with a `payload`
  // field, never as the JSON body every other caller here sends -- branched
  // off BEFORE the JSON.parse below, or the payload silently falls into that
  // parse's catch-and-ignore fallback and is lost. Signature verification
  // above already covers this request too (Slack signs Interactivity payloads
  // the same v0=HMAC scheme as Events API).
  const contentType = String(req.headers['content-type'] || '')
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const form = new URLSearchParams(rawBody.toString('utf8'))
    let payload = null
    try { payload = JSON.parse(form.get('payload') || 'null') } catch { payload = null }
    if (payload && payload.type === 'block_actions') {
      await handleSlackBlockAction(payload).catch(e => console.error('Slack block_actions failed:', e))
      return res.status(200).end()
    }
    if (payload && payload.type === 'view_submission') {
      // Slack needs this ack within 3s and reads response_action from the
      // body -- 'errors' keeps the modal open with an inline message (wrong
      // PIN, blank reason), 'clear' closes it once the real work is done.
      try {
        const result = await handleSlackViewSubmission(payload)
        return res.status(200).json(result || { response_action: 'clear' })
      } catch (e) {
        console.error('Slack view_submission failed:', e)
        return res.status(200).json({ response_action: 'clear' })
      }
    }
    return res.status(200).end()
  }

  try { req.body = rawBody.length ? JSON.parse(rawBody.toString('utf8')) : {} } catch { req.body = {} }

  // Slack's own Events API payloads. url_verification is the one-time handshake
  // when Event Subscriptions is first turned on; event_callback is every real
  // event after that (only app_mention is subscribed to).
  if (req.body?.type === 'url_verification') {
    return res.status(200).json({ challenge: req.body.challenge })
  }
  if (req.body?.type === 'event_callback') {
    // A Claude round trip easily exceeds Slack's 3s ack window, so Slack re-sends
    // the SAME event with this header once it gives up waiting -- acknowledge and
    // do nothing, rather than answering the question a second time. The reply
    // itself is a separate outbound call (chat.postMessage) that doesn't depend
    // on this response reaching Slack in time, so awaiting it here is safe even
    // though it means this response is slow.
    if (req.headers['x-slack-retry-num']) return res.status(200).end()
    const event = req.body.event || {}
    if (event.type === 'app_mention' && !event.bot_id) {
      await handleSlackAppMention(event).catch(e => console.error('slack app_mention failed', e))
    } else if (event.type === 'message') {
      await handleSlackThreadReply(event).catch(e => console.error('slack thread reply failed', e))
    }
    return res.status(200).end()
  }

  if ((req.body?.type || req.query?.type) === 'chat_answer') {
    return handleChatAnswerEmail(req, res)
  }
  if ((req.body?.type || req.query?.type) === 'custom_html') {
    return handleCustomHtmlEmail(req, res)
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

  if ((req.body?.type || req.query?.type) === 'slack_channel_list') {
    return handleSlackChannelList(req, res)
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
  if ((req.body?.type || req.query?.type) === 'b2c_daily_report') {
    return handleB2CDailyReport(req, res)
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
      const vettedTest = await vetRecipients(bodyRecipients)
      if (!vettedTest.allowed.length) {
        return res.status(400).json({ error: rejectedRecipientError(vettedTest), rejected: vettedTest.rejected })
      }
      recipients = vettedTest.allowed
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
