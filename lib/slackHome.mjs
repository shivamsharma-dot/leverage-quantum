// Quantum's Slack Home tab -- an AI-free menu of fixed reports. Every figure comes
// straight from the same data and rules as the dashboards, with no model in the
// loop, so it costs nothing per click and can never misread a number.
//
// Flow: Slack sends app_home_opened -> we publish the menu; a button click
// (block_actions, action_id "qh_run") -> we check the person is allowed to see that
// dashboard, build the report, and re-publish the Home tab showing it.
//
// Lives in lib/ (not api/) on purpose: Vercel Hobby caps us at 12 functions.
import { classifyProgram, normalizePrograms } from '../shared/careersPrograms.mjs'
import { canAccessDashboard } from '../shared/access.mjs'

const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://tsyekthwthxszmsgqfej.supabase.co'
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || ''

const PAID_SOURCES = ['facebook', 'google', 'affiliate', 'linkedin', 'bing', 'remarketing'] // same as the dashboards
const isPaid = s => PAID_SOURCES.includes(String(s || '').trim().toLowerCase())

// ---- the report menu --------------------------------------------------------
// page = the dashboard id the person must be allowed to open to run it.
export const HOME_REPORTS = [
  { id: 'careers_mtd', group: 'Leverage Careers', label: 'MTD by program', page: 'leverage_careers' },
  { id: 'careers_day', group: 'Leverage Careers', label: 'Yesterday by program', page: 'leverage_careers' },
  { id: 'overall_day', group: 'Overall', label: 'Yesterday by source', page: 'overall' },
  { id: 'overall_mtd', group: 'Overall', label: 'MTD by source', page: 'overall' },
  { id: 'overall_7d', group: 'Overall', label: 'Last 7 days by source', page: 'overall' },
]

// ---- small helpers -----------------------------------------------------------
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const istToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
function shift(iso, days) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d)); dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}
const dayLabel = iso => { const [, m, d] = iso.split('-'); return Number(d) + ' ' + MN[Number(m) - 1] }
const nfmt = n => Number(n || 0).toLocaleString('en-IN')
const inr = n => (n == null ? '—' : '₹' + Math.round(n).toLocaleString('en-IN'))
function money(n) {
  const v = Number(n), a = Math.abs(v)
  if (!isFinite(v)) return '—'
  if (a >= 1e7) return '₹' + (v / 1e7).toFixed(2) + ' Cr'
  if (a >= 1e5) return '₹' + (v / 1e5).toFixed(2) + ' L'
  return '₹' + Math.round(v).toLocaleString('en-IN')
}
async function sb(path) {
  const r = await fetch(SB_URL + '/rest/v1/' + path, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } })
  if (!r.ok) throw new Error(path.split('?')[0] + ' read failed (' + r.status + ')')
  return r.json()
}

// ---- who is this Slack user? -------------------------------------------------
export async function resolveQuantumUser(token, slackUserId) {
  const r = await fetch('https://slack.com/api/users.info?user=' + encodeURIComponent(slackUserId), { headers: { Authorization: 'Bearer ' + token } })
  const d = await r.json().catch(() => ({}))
  const email = d.ok && d.user && d.user.profile && d.user.profile.email ? String(d.user.profile.email).toLowerCase() : ''
  if (!email) return { email: '', role: null }
  const rows = await sb('allowed_users?select=role&email=ilike.' + encodeURIComponent(email)).catch(() => [])
  return { email, role: rows && rows[0] ? rows[0].role || 'viewer' : null }
}
export const canRun = (user, report) => !!(user && user.role && canAccessDashboard(user.role, report.page, user.email))

// ---- report builders ---------------------------------------------------------
async function careersRows(since, until) {
  const out = []
  let cursor = null
  for (let i = 0; i < 400; i++) {
    const p = new URLSearchParams({ select: 'row_key,source,campaign,total_leads,total_interested,spend', order: 'row_key.asc', limit: '1000' })
    p.set('lead_date', 'gte.' + since); p.append('lead_date', 'lte.' + until)
    if (cursor != null) p.set('row_key', 'gt.' + cursor)
    const rows = await sb('leverage_careers_v2_daily?' + p.toString())
    out.push(...rows)
    if (rows.length < 1000) break
    cursor = rows[rows.length - 1].row_key
  }
  return out
}

async function careersByProgram(since, until) {
  const prefs = await sb('app_preferences?select=value&key=eq.careers_programs').catch(() => [])
  const programs = normalizePrograms(prefs && prefs[0] ? prefs[0].value : null)
  const rows = (await careersRows(since, until)).filter(r => isPaid(r.source))
  const by = new Map()
  rows.forEach(r => {
    const k = classifyProgram(r.campaign, programs)
    const g = by.get(k) || { spend: 0, leads: 0, interested: 0 }
    g.spend += Number(r.spend) || 0; g.leads += Number(r.total_leads) || 0; g.interested += Number(r.total_interested) || 0
    by.set(k, g)
  })
  // Other (no program keyword matched) stays hidden while it carries no spend -- same rule as the Slack V3 report.
  let list = [...by.entries()].map(([name, g]) => ({ name, ...g }))
    .filter(x => (x.spend > 0 || x.leads > 0) && !(x.name === 'Other' && !(x.spend > 0)))
  list.sort((a, b) => (a.name === 'Other') - (b.name === 'Other') || (b.spend - a.spend) || (b.leads - a.leads))
  const tot = list.reduce((a, x) => ({ spend: a.spend + x.spend, leads: a.leads + x.leads, interested: a.interested + x.interested }), { spend: 0, leads: 0, interested: 0 })
  const line = (label, g) => [label, money(g.spend), nfmt(g.leads), nfmt(g.interested),
    inr(g.leads > 0 && g.spend > 0 ? g.spend / g.leads : null), inr(g.interested > 0 && g.spend > 0 ? g.spend / g.interested : null)]
  return {
    empty: !list.length,
    table: { columns: ['Program', 'Spend', 'Leads', 'Interested', 'CPL', 'CPI'], rows: [line('TOTAL', tot), ...list.map(x => line(x.name, x))], strongRows: [0], wrapFirst: true },
  }
}

// deps = { fetchOverallTotals, overallTotalsTable } handed in by the handler (they live in api/ files).
export async function buildHomeReport(id, deps) {
  const today = istToday(), yday = shift(today, -1)
  const monthStart = today.slice(0, 8) + '01'
  const needsDay = ['careers_mtd', 'overall_mtd']
  if (needsDay.includes(id) && yday < monthStart) {
    return { title: HOME_REPORTS.find(r => r.id === id).group + ' — ' + HOME_REPORTS.find(r => r.id === id).label, subtitle: 'The month has no complete day yet. Check back tomorrow.', table: null }
  }
  if (id === 'careers_mtd' || id === 'careers_day') {
    const since = id === 'careers_mtd' ? monthStart : yday
    const r = await careersByProgram(since, yday)
    return {
      title: 'Leverage Careers — ' + (id === 'careers_mtd' ? 'MTD by program' : 'Yesterday by program'),
      subtitle: (id === 'careers_mtd' ? dayLabel(monthStart) + ' → ' + dayLabel(yday) + ' (complete days)' : dayLabel(yday)) + ' · paid sources only',
      table: r.empty ? null : r.table,
      note: r.empty ? 'No paid activity in this window.' : 'Programs are matched from keywords in the campaign name.',
    }
  }
  if (id === 'overall_day' || id === 'overall_mtd' || id === 'overall_7d') {
    const since = id === 'overall_day' ? yday : id === 'overall_mtd' ? monthStart : shift(yday, -6)
    const res = await deps.fetchOverallTotals({ since, until: yday, group_by: 'source' })
    if (res && res.error) throw new Error(res.error)
    const table = deps.overallTotalsTable(res)
    return {
      title: 'Overall — ' + HOME_REPORTS.find(r => r.id === id).label,
      subtitle: (since === yday ? dayLabel(yday) : dayLabel(since) + ' → ' + dayLabel(yday)) + ' · complete days',
      table, note: table ? 'Same figures as the Overall dashboard.' : 'No data in this window.',
    }
  }
  throw new Error('Unknown report')
}

// ---- Home tab views ----------------------------------------------------------
const btn = (r) => ({ type: 'button', action_id: 'qh_run_' + r.id, text: { type: 'plain_text', text: r.label }, value: r.id })

export function menuBlocks({ greeting, notice } = {}) {
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: 'Quantum' } },
    { type: 'section', text: { type: 'mrkdwn', text: (greeting ? greeting + '\n' : '') + 'Live numbers from Leverage Quantum, one tap away. Pick a report below. Every figure uses the same data and definitions as the dashboards.' } },
  ]
  if (notice) blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: notice }] })
  blocks.push({ type: 'divider' })
  const groups = [...new Set(HOME_REPORTS.map(r => r.group))]
  groups.forEach(g => {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: '*' + g + '*' } })
    blocks.push({ type: 'actions', elements: HOME_REPORTS.filter(r => r.group === g).map(btn) })
  })
  blocks.push({ type: 'divider' })
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: 'Quantum shows only the dashboards you already have access to.' }] })
  return blocks
}

function textTable(table) {
  const cols = table.columns
  const w = cols.map((c, i) => Math.max(String(c).length, ...table.rows.map(r => String(r[i] == null ? '' : r[i]).length)))
  const fmt = r => r.map((v, i) => (i === 0 ? String(v).padEnd(w[i]) : String(v).padStart(w[i]))).join('  ')
  return '```' + [fmt(cols), ...table.rows.map(fmt)].join('\n') + '```'
}

// tableBlock(table) -> a native Slack table block (handed in from the handler).
export function homeReportBlocks(rep, { tableBlock, asText } = {}) {
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: rep.title.slice(0, 150) } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: rep.subtitle }] },
  ]
  if (rep.table) blocks.push(asText || !tableBlock ? { type: 'section', text: { type: 'mrkdwn', text: textTable(rep.table).slice(0, 2900) } } : tableBlock(rep.table))
  if (rep.note) blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: rep.note }] })
  blocks.push({ type: 'actions', elements: [{ type: 'button', action_id: 'qh_menu', text: { type: 'plain_text', text: '← All reports' }, value: 'menu' }] })
  return blocks
}

export async function publishHome(token, userId, blocks) {
  const r = await fetch('https://slack.com/api/views.publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ user_id: userId, view: { type: 'home', blocks } }),
  })
  const d = await r.json().catch(() => ({}))
  if (!d.ok) throw new Error('views.publish: ' + (d.error || 'rejected') + (d.response_metadata && d.response_metadata.messages ? ' ' + d.response_metadata.messages.join(' ') : ''))
  return true
}
