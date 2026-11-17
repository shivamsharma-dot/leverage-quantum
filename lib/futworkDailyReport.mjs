// Futwork daily conversion report (2026-11-17).
//
// A picture of the Overall (BigQuery) Funnel Summary, by Source, for yesterday and for the
// month to date, sent every morning to Futwork (our calling partner) as a Slack DM. It is
// built here on the server (no browser) so the 11 AM cron can send it on its own.
//
// What it shows, by request: every Funnel Summary column EXCEPT Spend, Offers, Deposits,
// Actual / Estimated RAU, Est. / Actual SR Revenue, Actual / Est. ROAS, CPA, and everything
// Superbot. CPL and CPQL are shown (asked for explicitly); Branding and every non-paid source
// show a dash for both.
//
// Figures follow OverallDashboard.jsx exactly:
//  - rows: overall_bq_daily_agg (one row per day x Source), plus Affiliate's manual monthly
//    spend spread evenly per day (buildSyntheticAffiliateRows), because Affiliate has no
//    ad-platform spend in BigQuery;
//  - Total Queued = Futwork Human + Futwork AI (+ Superbot) queued. Floor is NOT in it;
//  - Lead to QL % = (Human QL + AI QL) / (Human queued + AI queued); Human and AI on their own;
//  - CPL / CPQL: summaryValue(). Numerator = spend minus the spend of campaigns excluded in
//    Settings > Cost-metric exclusions (CPL: scope 'all' only; CPQL: every pattern).
//    Denominator = leads / QLs of sources that had spend in the window, minus the same
//    excluded campaigns. The agg table has no campaign, so excluded campaigns are read from
//    overall_bq_daily (by campaign name) and subtracted, the same way the MTD Scorecard does.
//  - the report day is yesterday (IST); the month to date is the month of yesterday, so on the
//    1st it covers the whole previous month.
import { createCanvas, GlobalFonts } from '@napi-rs/canvas'
import path from 'path'
import { fileURLToPath } from 'url'
import { isCostExcludedCampaign, isCplCostExcludedCampaign } from '../shared/costExclusions.mjs'
import { BRAND_LOGO_BARS, BRAND_LOGO_RX } from '../shared/brandLogo.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ---------- data ----------

const PAID_SOURCE_KEYS = ['facebook', 'google', 'affiliate', 'linkedin', 'bing', 'remarketing'] // = OverallDashboard isPaidSource
const isPaidSource = s => PAID_SOURCE_KEYS.includes(String(s || '').trim().toLowerCase())
const SOURCE_ORDER = ['Facebook', 'Google', 'Affiliate', 'LinkedIn', 'Bing', 'Remarketing', 'Branding', 'Organic', 'Referral', 'Others']
const AFFILIATE_DEFAULT_MONTHLY = 900000 // = OverallDashboard.jsx

const num = v => { const n = Number(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) ? n : 0 }
const pad = n => String(n).padStart(2, '0')
const iso = (y, m, d) => y + '-' + pad(m) + '-' + pad(d)

// Today's date in India, as y / m / d numbers.
function istToday(now = new Date()) {
  const t = new Date(now.getTime() + 330 * 60000)
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }
}
function addDays({ y, m, d }, n) {
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }
}

export function reportWindow(now = new Date()) {
  const today = istToday(now)
  const yd = addDays(today, -1)
  return {
    today, yd,
    yIso: iso(yd.y, yd.m, yd.d),
    mtdSince: iso(yd.y, yd.m, 1),
    days: yd.d,
  }
}

function mapRow(r) {
  const hql = num(r['Futwork Human QL']), aql = num(r['Futwork AI QL']), sql = num(r['Superbot AI QL'])
  return {
    date: r.lead_date_iso || null,
    source: String(r.Source || '').trim() || 'Unknown',
    campaign: String(r.campaign_name || '').trim(),
    leads: num(r['Total Leads Generated']),
    floor: num(r.floor_queued),
    hq: num(r['Queued on Futwork Human']),
    aq: num(r['Queued on Futwork AI']),
    sq: num(r['Queued on Superbot']),
    hql, aql, totalQL: hql + aql + sql,
    apps: num(r['Total Apps']),
    spend: num(r['Total_Spends']),
  }
}

// Affiliate's manual monthly spend, one row per day: the same split as the dashboard's
// buildSyntheticAffiliateRows (current month: entered total / days elapsed including today;
// a month with no entry: AFFILIATE_DEFAULT_MONTHLY / days in month, per elapsed day).
function affiliateRows(map, win) {
  const { today } = win
  const out = []
  const push = (y, m, d, spend) => out.push({ date: iso(y, m, d), source: 'Affiliate', campaign: 'Affiliate (manual entry)', leads: 0, floor: 0, hq: 0, aq: 0, sq: 0, hql: 0, aql: 0, totalQL: 0, apps: 0, spend })
  const key = win.yd.y + '-' + pad(win.yd.m)
  const isCurrent = win.yd.y === today.y && win.yd.m === today.m
  const dim = new Date(Date.UTC(win.yd.y, win.yd.m, 0)).getUTCDate()
  const entered = map ? map[key] : undefined
  const total = Number(entered) || 0
  if (total) {
    const days = isCurrent ? Math.min(today.d, dim) : dim
    for (let d = 1; d <= days; d++) push(win.yd.y, win.yd.m, d, total / days)
  } else if (isCurrent && (entered === undefined || entered === null || entered === '')) {
    for (let d = 1; d <= Math.min(today.d, dim); d++) push(win.yd.y, win.yd.m, d, AFFILIATE_DEFAULT_MONTHLY / dim)
  }
  return out
}

async function sbGetAll(sbUrl, sbKey, table, params, { pageSize = 2000, dateFilter = true } = {}) {
  const headers = { apikey: sbKey, Authorization: 'Bearer ' + sbKey }
  const out = []
  let cursor = null
  for (let guard = 0; guard < 300; guard++) {
    const p = new URLSearchParams(params)
    p.set('order', 'row_key.asc')
    p.set('limit', String(pageSize))
    if (cursor) p.set('row_key', 'gt.' + cursor)
    let page = null
    for (let attempt = 0; attempt < 3 && page == null; attempt++) {
      const r = await fetch(sbUrl + '/rest/v1/' + table + '?' + p.toString(), { headers })
      if (r.ok) { page = await r.json(); break }
      if (attempt === 2) throw new Error(table + ' read failed (' + r.status + '): ' + (await r.text()).slice(0, 200))
      await new Promise(res => setTimeout(res, 500 * (attempt + 1)))
    }
    if (!page.length) break
    for (const row of page) { const { row_key, ...rest } = row; out.push(rest) }
    if (page.length < pageSize) break
    cursor = page[page.length - 1].row_key
  }
  return out
}

const AGG_COLS = ['lead_date_iso', 'Source', 'Total Leads Generated', 'floor_queued', 'Queued on Futwork Human', 'Queued on Futwork AI', 'Queued on Superbot', 'Futwork Human QL', 'Futwork AI QL', 'Superbot AI QL', 'Total_Spends', 'Total Apps']
const sel = cols => cols.map(c => (/^[a-z_]+$/.test(c) ? c : '"' + c + '"')).join(',')

// Reads everything the report needs. Throws if a required read fails.
export async function loadFutworkReportData({ sbUrl, sbKey, now = new Date() }) {
  const win = reportWindow(now)
  const headers = { apikey: sbKey, Authorization: 'Bearer ' + sbKey }
  const prefRes = await fetch(sbUrl + '/rest/v1/app_preferences?select=key,value&key=in.(affiliate_spend_manual,cost_excluded_campaign_patterns)', { headers })
  if (!prefRes.ok) throw new Error('app_preferences read failed (' + prefRes.status + ')')
  const prefs = Object.fromEntries((await prefRes.json()).map(p => [p.key, p.value]))
  const patterns = Array.isArray(prefs.cost_excluded_campaign_patterns) ? prefs.cost_excluded_campaign_patterns : []

  const aggRaw = await sbGetAll(sbUrl, sbKey, 'overall_bq_daily_agg', {
    select: sel(AGG_COLS) + ',row_key', and: '(lead_date_iso.gte.' + win.mtdSince + ',lead_date_iso.lte.' + win.yIso + ')',
  })
  const rows = aggRaw.map(mapRow).concat(affiliateRows(prefs.affiliate_spend_manual || null, win))

  // Rows of the excluded campaigns (small), read in 3-day slices: a campaign-name ilike has no
  // index, so one month-wide read can time out.
  let exRows = []
  const pats = patterns.map(p => String((p && p.pattern) || '').trim()).filter(Boolean)
  if (pats.length) {
    const orClause = '(' + pats.map(x => 'campaign_name.ilike."*' + x.replace(/["*]/g, '') + '*"').join(',') + ')'
    const cols = sel(AGG_COLS.concat(['campaign_name']))
    for (let d = 1; d <= win.days; d += 3) {
      const from = iso(win.yd.y, win.yd.m, d), to = iso(win.yd.y, win.yd.m, Math.min(d + 2, win.days))
      const part = await sbGetAll(sbUrl, sbKey, 'overall_bq_daily', {
        select: cols + ',row_key', and: '(lead_date_iso.gte.' + from + ',lead_date_iso.lte.' + to + ')', or: orClause,
      })
      exRows = exRows.concat(part.map(mapRow).filter(r => isCostExcludedCampaign(r.campaign, patterns)))
    }
  }

  const syncRes = await fetch(sbUrl + '/rest/v1/overall_bq_daily_agg?select=synced_at&order=synced_at.desc&limit=1', { headers })
  const syncedAt = syncRes.ok ? ((await syncRes.json())[0] || {}).synced_at || null : null

  return { win, rows, exRows, patterns, syncedAt }
}

// One block (yesterday or MTD): per-source groups + TOTAL, in the dashboard's own terms.
function buildBlock(rows, exRows, patterns, days) {
  const paidSources = new Set(rows.filter(r => r.spend > 0).map(r => r.source))
  const blank = () => ({ leads: 0, floor: 0, hq: 0, aq: 0, sq: 0, hql: 0, aql: 0, totalQL: 0, apps: 0, cplSpend: 0, cqSpend: 0, paidLeads: 0, paidQL: 0 })
  const by = new Map()
  const add = (g, r, sign) => {
    if (sign > 0) {
      g.leads += r.leads; g.floor += r.floor; g.hq += r.hq; g.aq += r.aq; g.sq += r.sq
      g.hql += r.hql; g.aql += r.aql; g.totalQL += r.totalQL; g.apps += r.apps
    }
    g.cplSpend += sign * r.spend; g.cqSpend += sign * r.spend
    if (paidSources.has(r.source)) { g.paidLeads += sign * r.leads; g.paidQL += sign * r.totalQL }
  }
  rows.forEach(r => { if (!by.has(r.source)) by.set(r.source, blank()); add(by.get(r.source), r, 1) })
  // Excluded campaigns come OUT of the cost figures only (volume columns keep them).
  exRows.forEach(r => {
    const g = by.get(r.source); if (!g) return
    const cpl = isCplCostExcludedCampaign(r.campaign, patterns)
    g.cqSpend -= r.spend
    if (paidSources.has(r.source)) g.paidQL -= r.totalQL
    if (cpl) { g.cplSpend -= r.spend; if (paidSources.has(r.source)) g.paidLeads -= r.leads }
  })
  const total = blank()
  for (const g of by.values()) for (const k of Object.keys(total)) total[k] += g[k]
  const known = SOURCE_ORDER.filter(s => by.has(s))
  const extra = [...by.keys()].filter(s => !SOURCE_ORDER.includes(s)).sort()
  const sources = known.concat(extra).map(name => ({ name, ...by.get(name) }))
  return { total, sources, days }
}

export function computeFutworkReport(data) {
  const { win, rows, exRows, patterns } = data
  const yRows = rows.filter(r => r.date === win.yIso), yEx = exRows.filter(r => r.date === win.yIso)
  return {
    win,
    yday: buildBlock(yRows, yEx, patterns, 1),
    mtd: buildBlock(rows, exRows, patterns, win.days),
    syncedAt: data.syncedAt,
  }
}

// ---------- formatting ----------

const IN = n => Math.round(n).toLocaleString('en-IN')
const pct = (a, b) => (b > 0 ? (a / b * 100).toFixed(1) + '%' : '–')
const DASH = '–'
const rupee = v => (v == null || !isFinite(v) ? DASH : '₹' + IN(v))
// Superbot is not shown anywhere, so QLs and queued are Futwork Human + Futwork AI.
const ql = g => g.hql + g.aql
const fwQ = g => g.hq + g.aq
const costOk = (name) => isPaidSource(name) // Branding / Organic / Referral / Others: dash
const cplOf = g => (g.cplSpend > 0 && g.paidLeads > 0 ? g.cplSpend / g.paidLeads : null)
const cpqlOf = g => (g.cqSpend > 0 && g.paidQL > 0 ? g.cqSpend / g.paidQL : null)

export const COLUMNS = [
  { g: '', h: 'Source', w: 128 },
  { g: 'Volume', h: 'Leads', w: 88 },
  { g: 'Volume', h: 'Contribution', w: 100 },
  { g: 'Queued', h: 'Floor', w: 82 },
  { g: 'Queued', h: 'Total', w: 96 },
  { g: 'Queued', h: 'Futwork Human', w: 112 },
  { g: 'Queued', h: 'Futwork AI', w: 92 },
  { g: 'Qualified leads', h: 'Total', w: 80 },
  { g: 'Qualified leads', h: 'Futwork Human', w: 112 },
  { g: 'Qualified leads', h: 'Futwork AI', w: 92 },
  { g: 'Qualified leads', h: 'Avg / day', w: 86 },
  { g: 'Lead to QL %', h: 'Overall', w: 84 },
  { g: 'Lead to QL %', h: 'Human', w: 80 },
  { g: 'Lead to QL %', h: 'AI', w: 76 },
  { g: 'Outcome', h: 'Applications', w: 104 },
  { g: 'Cost', h: 'CPL', w: 80 },
  { g: 'Cost', h: 'CPQL', w: 92 },
]

function rowCells(name, g, total, days, isTotal) {
  const q = ql(g)
  const showCost = isTotal || costOk(name)
  return [
    name,
    IN(g.leads), pct(g.leads, total.leads),
    IN(g.floor), IN(fwQ(g)), IN(g.hq), IN(g.aq),
    IN(q), IN(g.hql), IN(g.aql), (q / days).toFixed(1),
    pct(g.hql + g.aql, g.hq + g.aq), pct(g.hql, g.hq), pct(g.aql, g.aq),
    IN(g.apps),
    showCost ? rupee(cplOf(g)) : DASH, showCost ? rupee(cpqlOf(g)) : DASH,
  ]
}

export function tableRows(block) {
  return [{ total: true, cells: rowCells('TOTAL', block.total, block.total, block.days, true) }]
    .concat(block.sources.map(s => ({ total: false, cells: rowCells(s.name, s, block.total, block.days, false) })))
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const dLabel = ({ y, m, d }) => d + ' ' + MONTHS[m - 1] + ' ' + y
function syncLabel(ts) {
  if (!ts) return null
  const t = new Date(new Date(ts).getTime() + 330 * 60000)
  let h = t.getUTCHours(); const mi = pad(t.getUTCMinutes()); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12
  return t.getUTCDate() + ' ' + MONTHS[t.getUTCMonth()] + ', ' + h + ':' + mi + ' ' + ap + ' IST'
}

// The one-line summary, as [text, bold] segments (also used for the Slack message text).
export function summarySegments(rep) {
  const y = rep.yday.total, m = rep.mtd.total
  const segs = [
    ['Yesterday: ', true], [IN(y.leads) + ' leads, ' + IN(fwQ(y)) + ' queued to Futwork, ', false],
    [IN(ql(y)) + ' QLs', true], [' at ', false], [pct(y.hql + y.aql, fwQ(y)), true],
    [' Lead to QL (month to date ' + pct(m.hql + m.aql, fwQ(m)) + '). Human ' + pct(y.hql, y.hq) + ', AI ' + pct(y.aql, y.aq) + '.', false],
  ]
  const best = rep.yday.sources.filter(s => fwQ(s) >= 100).map(s => [s.name, (s.hql + s.aql) / fwQ(s)]).sort((a, b) => b[1] - a[1])[0]
  if (best) segs.push([' Best converting source: ', false], [best[0] + ' ' + (best[1] * 100).toFixed(1) + '%', true], ['.', false])
  return segs
}

// ---------- drawing ----------

let fontsReady = false
function ensureFonts() {
  if (fontsReady) return
  GlobalFonts.registerFromPath(path.join(__dirname, 'fonts/PlusJakartaSans-Medium.ttf'), 'PJS Medium')
  GlobalFonts.registerFromPath(path.join(__dirname, 'fonts/PlusJakartaSans-Bold.ttf'), 'PJS Bold')
  GlobalFonts.registerFromPath(path.join(__dirname, 'fonts/PlusJakartaSans-ExtraBold.ttf'), 'PJS ExtraBold')
  GlobalFonts.registerFromPath(path.join(__dirname, 'fonts/Arimo-Regular.woff'), 'Arimo')
  GlobalFonts.registerFromPath(path.join(__dirname, 'fonts/Arimo-Bold.woff'), 'Arimo Bold')
  fontsReady = true
}
const F = {
  m: s => s + 'px "PJS Medium", "Arimo"',
  b: s => s + 'px "PJS Bold", "Arimo Bold"',
  x: s => s + 'px "PJS ExtraBold", "Arimo Bold"',
}

const C = {
  navy: '#1F3C84', blue: '#1C9FD4', cyan: '#29B9C3', green: '#4CAE6F', greenText: '#2E8B57',
  ink: '#0F172A', body: '#334155', muted: '#64748B', faint: '#94A3B8', line: '#E2E8F0', line2: '#F1F5F9', sep: '#EEF2F7',
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath()
}
function txt(ctx, s, x, y, font, color, align = 'left', spacing = 0) {
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic'
  try { ctx.letterSpacing = spacing + 'px' } catch (_) { /* older canvas */ }
  ctx.fillText(s, x, y)
  try { ctx.letterSpacing = '0px' } catch (_) {}
}
function width(ctx, s, font, spacing = 0) {
  ctx.font = font
  try { ctx.letterSpacing = spacing + 'px' } catch (_) {}
  const w = ctx.measureText(s).width
  try { ctx.letterSpacing = '0px' } catch (_) {}
  return w
}

const W = 1720, PADX = 36

function drawTable(ctx, y, title, sub, block) {
  txt(ctx, title, PADX, y + 18, F.x(17), C.navy)
  txt(ctx, sub, PADX + width(ctx, title, F.x(17)) + 12, y + 18, F.m(12.5), C.faint)
  y += 34
  const avail = W - 2 * PADX
  const sumW = COLUMNS.reduce((t, c) => t + c.w, 0)
  const k = avail / sumW
  const xs = []; let x = PADX
  COLUMNS.forEach(c => { xs.push([x, c.w * k]); x += c.w * k })
  const isGroupStart = i => i > 0 && COLUMNS[i].g !== COLUMNS[i - 1].g
  // Group heading row
  const GH = 24, HH = 30, RH = 33
  let gi = 1
  while (gi < COLUMNS.length) {
    let gj = gi; while (gj + 1 < COLUMNS.length && COLUMNS[gj + 1].g === COLUMNS[gi].g) gj++
    txt(ctx, COLUMNS[gi].g.toUpperCase(), xs[gi][0] + 9, y + 16, F.b(10.5), C.blue, 'left', 1.1)
    gi = gj + 1
  }
  ctx.fillStyle = C.line; ctx.fillRect(PADX, y + GH - 2, avail, 2)
  y += GH
  COLUMNS.forEach((c, i) => {
    const [cx, cw] = xs[i]
    if (i === 0) txt(ctx, c.h, cx + 9, y + 20, F.b(11.5), C.muted)
    else txt(ctx, c.h, cx + cw - 9, y + 20, F.b(11.5), C.muted, 'right')
  })
  ctx.fillStyle = C.line; ctx.fillRect(PADX, y + HH - 1, avail, 1)
  y += HH
  const rows = tableRows(block)
  rows.forEach((r, ri) => {
    if (r.total) { ctx.fillStyle = '#F1F6FD'; ctx.fillRect(PADX, y, avail, RH) }
    else if (ri % 2 === 1) { ctx.fillStyle = '#FBFCFE'; ctx.fillRect(PADX, y, avail, RH) }
    r.cells.forEach((v, i) => {
      const [cx, cw] = xs[i]
      const rate = i >= 11 && i <= 13
      const color = r.total ? (rate ? C.greenText : C.navy) : (i === 0 ? C.ink : rate ? C.greenText : C.body)
      const font = r.total ? F.x(13.5) : (i === 0 || rate ? F.b(13.5) : F.m(13.5))
      if (i === 0) txt(ctx, v, cx + 9, y + 22, font, color)
      else txt(ctx, v, cx + cw - 9, y + 22, font, color, 'right')
    })
    ctx.fillStyle = r.total ? '#DCE6F5' : C.line2; ctx.fillRect(PADX, y + RH - 1, avail, 1)
    y += RH
  })
  // Group separators
  const top = y - rows.length * RH - HH - GH
  ctx.fillStyle = C.sep
  COLUMNS.forEach((c, i) => { if (isGroupStart(i)) ctx.fillRect(xs[i][0], top, 1, y - top) })
  return y
}

export function renderFutworkReportPng(rep, { scale = 1.5 } = {}) {
  ensureFonts()
  const { win } = rep
  const H = 2600 // generous; trimmed to the real height at the end
  const canvas = createCanvas(Math.round(W * scale), Math.round(H * scale))
  const ctx = canvas.getContext('2d')
  ctx.scale(scale, scale)
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H)

  // Brand line
  const g = ctx.createLinearGradient(0, 0, W, 0)
  g.addColorStop(0, C.green); g.addColorStop(0.33, C.cyan); g.addColorStop(0.66, C.blue); g.addColorStop(1, C.navy)
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 4)

  // Header
  let y = 4
  const logoX = PADX, logoY = y + 34, s = 44 / 22
  BRAND_LOGO_BARS.forEach(b => { ctx.fillStyle = b.color; rr(ctx, logoX + b.x * s, logoY + b.y * s, b.w * s, b.h * s, BRAND_LOGO_RX * s); ctx.fill() })
  const wmX = logoX + 44 + 14
  txt(ctx, 'Leverage Edu', wmX, y + 58, F.x(22), C.navy, 'left', -0.3)
  txt(ctx, 'Quantum analytics', wmX, y + 77, F.b(12), C.faint)
  const wmW = Math.max(width(ctx, 'Leverage Edu', F.x(22), -0.3), width(ctx, 'Quantum analytics', F.b(12)))
  const vrX = wmX + wmW + 26
  ctx.fillStyle = C.line; ctx.fillRect(vrX, y + 34, 1, 46)
  txt(ctx, 'PARTNER REPORT · FUTWORK', vrX + 26, y + 50, F.b(11), C.blue, 'left', 1.5)
  txt(ctx, 'Daily Conversion Report', vrX + 26, y + 80, F.x(26), C.ink, 'left', -0.5)
  txt(ctx, dLabel(win.yd), W - PADX, y + 44, F.x(22), C.ink, 'right', -0.3)
  const wd = WEEKDAYS[new Date(Date.UTC(win.yd.y, win.yd.m - 1, win.yd.d)).getUTCDay()]
  txt(ctx, wd + ' · Month to date 1 to ' + win.yd.d + ' ' + MONTHS[win.yd.m - 1], W - PADX, y + 65, F.m(13), C.muted, 'right')
  const sl = syncLabel(rep.syncedAt)
  if (sl) {
    const chip = 'Data refreshed ' + sl
    const cw = width(ctx, chip, F.b(11.5)) + 30
    ctx.fillStyle = '#EEF8F2'; rr(ctx, W - PADX - cw, y + 76, cw, 22, 11); ctx.fill()
    ctx.fillStyle = C.green; ctx.beginPath(); ctx.arc(W - PADX - cw + 13, y + 87, 3, 0, Math.PI * 2); ctx.fill()
    txt(ctx, chip, W - PADX - 10, y + 91, F.b(11.5), C.greenText, 'right')
  }
  y += 112
  ctx.fillStyle = C.sep; ctx.fillRect(0, y, W, 1)

  // Summary line
  y += 20
  ctx.fillStyle = '#F6F9FD'; rr(ctx, PADX, y, W - 2 * PADX, 48, 12); ctx.fill()
  ctx.fillStyle = C.blue; ctx.fillRect(PADX, y + 6, 3, 36)
  let sx = PADX + 18
  summarySegments(rep).forEach(([t, b]) => {
    const f = b ? F.x(14.5) : F.m(14.5)
    txt(ctx, t, sx, y + 30, f, b ? C.ink : C.body)
    sx += width(ctx, t, f)
  })
  y += 48 + 18

  // KPI cards
  const m = rep.mtd.total, yt = rep.yday.total
  const cards = [
    ['Leads', IN(m.leads), IN(yt.leads)],
    ['Total Queued', IN(fwQ(m)), IN(fwQ(yt))],
    ['Total QLs', IN(ql(m)), IN(ql(yt))],
    ['Lead to QL %', pct(m.hql + m.aql, fwQ(m)), pct(yt.hql + yt.aql, fwQ(yt)), 1],
    ['Lead to QL % Human', pct(m.hql, m.hq), pct(yt.hql, yt.hq), 1],
    ['Lead to QL % AI', pct(m.aql, m.aq), pct(yt.aql, yt.aq), 1],
    ['Applications', IN(m.apps), IN(yt.apps)],
    ['CPL', rupee(cplOf(m)), rupee(cplOf(yt))],
    ['CPQL', rupee(cpqlOf(m)), rupee(cpqlOf(yt))],
  ]
  const gap = 12, cw = (W - 2 * PADX - gap * (cards.length - 1)) / cards.length, ch = 98
  cards.forEach(([l, v, yv, acc], i) => {
    const x = PADX + i * (cw + gap)
    ctx.fillStyle = acc ? '#F2FAF5' : '#FFFFFF'; rr(ctx, x, y, cw, ch, 14); ctx.fill()
    ctx.strokeStyle = acc ? '#CFEBD9' : C.line; ctx.lineWidth = 1; rr(ctx, x + 0.5, y + 0.5, cw - 1, ch - 1, 14); ctx.stroke()
    txt(ctx, l.toUpperCase(), x + 16, y + 27, F.b(11), C.muted, 'left', 0.8)
    txt(ctx, v, x + 16, y + 62, F.x(26), C.ink, 'left', -0.8)
    txt(ctx, 'Yesterday ', x + 16, y + 84, F.m(12), C.faint)
    txt(ctx, yv, x + 16 + width(ctx, 'Yesterday ', F.m(12)), y + 84, F.b(12), C.navy)
  })
  y += ch + 6

  // Tables
  y += 18
  y = drawTable(ctx, y, 'Yesterday by source', dLabel(win.yd), rep.yday)
  y += 18
  y = drawTable(ctx, y, 'Month to date by source', '1 to ' + dLabel(win.yd), rep.mtd)

  // Footer
  y += 12
  ctx.fillStyle = C.line2; ctx.fillRect(0, y, W, 1)
  txt(ctx, 'Lead to QL % = Futwork QLs ÷ leads queued to Futwork (Human: Human QLs ÷ Human queued, AI: AI QLs ÷ AI queued). CPL and CPQL use paid sources only.', PADX, y + 30, F.m(12), C.faint)
  txt(ctx, 'Leverage Edu · Generated by Quantum', W - PADX, y + 30, F.m(12), C.faint, 'right')
  y += 48

  // Trim to the real height.
  const out = createCanvas(Math.round(W * scale), Math.round(y * scale))
  out.getContext('2d').drawImage(canvas, 0, 0)
  return out.toBuffer('image/png')
}

// Plain-text Slack message that goes with the picture.
export function slackComment(rep) {
  const body = summarySegments(rep).map(([t, b]) => {
    if (!b) return t
    const lead = t.match(/^\s*/)[0], trail = t.match(/\s*$/)[0]
    return lead + '*' + t.trim() + '*' + trail
  }).join('')
  return '*Daily Conversion Report \u00B7 ' + dLabel(rep.win.yd) + '*\n' + body
}
