// Manager-level EBITDA report for Slack (AC, SR, VAS, Offline), built straight from the
// 'EBITDA View' tab of the ops sheet so the Slack report can never disagree with the sheet.
//
// Format (agreed with Shivam, 2026-10-24, see the memory note feedback-ebitda-slack-report-format):
//   - one header message, then one native-table message per team
//   - the EBITDA cell is the custom emoji :ebitda_up: (green) / :ebitda_down: (red) plus a bold figure
//   - a picture of each team table (EBITDA cell filled green/red) rides in THAT team's own thread
//   - no picture under the header message, no hex colour element (Slack prints the hex code)
//
// The picture is drawn with @napi-rs/canvas and the bundled Arimo fonts, the same way
// lib/cashflowStatementImage.mjs does, so it works in a plain Vercel function.
import { createCanvas, GlobalFonts } from '@napi-rs/canvas'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
let fontsReady = false
function ensureFonts() {
  if (fontsReady) return
  try { GlobalFonts.registerFromPath(path.join(__dirname, 'fonts/Arimo-Regular.woff'), 'Arimo') } catch (e) { /* already registered */ }
  try { GlobalFonts.registerFromPath(path.join(__dirname, 'fonts/Arimo-Bold.woff'), 'Arimo Bold') } catch (e) { /* already registered */ }
  fontsReady = true
}

export const EBITDA_SHEET_ID = '1TVEjyPeKq7BN2B3hdgwm5xUV9lykknY8DuJkhjuWles'
export const EBITDA_TAB = 'EBITDA View'

const TEAMS = [
  { key: 'AC', re: /^AC team/i },
  { key: 'SR', re: /^SR team/i },
  { key: 'VAS', re: /^VAS team/i },
  { key: 'Offline', re: /^Offline team/i },
]

const num = v => (typeof v === 'number' ? v : Number(String(v == null ? '' : v).replace(/,/g, '')) || 0)

// Indian-style short money: lakh below a crore, crore above.
export function money(x) {
  const s = x < 0 ? '-' : ''
  const a = Math.abs(x)
  return s + (a >= 1e7 ? (a / 1e7).toFixed(2) + ' Cr' : (a / 1e5).toFixed(1) + ' L')
}

// Reads 'EBITDA View'!A1:N160 with the service account (values unformatted so numbers stay numbers).
export async function readEbitdaView() {
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL
  const privateKey = (process.env.GOOGLE_SHEETS_PRIVATE_KEY || '').replace(/\\n/g, '\n')
  if (!clientEmail || !privateKey) throw new Error('GOOGLE_SHEETS_CLIENT_EMAIL/GOOGLE_SHEETS_PRIVATE_KEY are not set')
  const { JWT } = await import('google-auth-library')
  const auth = new JWT({ email: clientEmail, key: privateKey, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] })
  const { access_token } = await auth.authorize()
  const range = encodeURIComponent("'" + EBITDA_TAB + "'!A1:N160")
  const r = await fetch('https://sheets.googleapis.com/v4/spreadsheets/' + EBITDA_SHEET_ID + '/values/' + range + '?valueRenderOption=UNFORMATTED_VALUE', {
    headers: { Authorization: 'Bearer ' + access_token },
  })
  if (!r.ok) {
    const e = await r.json().catch(() => ({}))
    throw new Error('Could not read the EBITDA View tab: ' + (e.error?.message || r.status) + ' (is it shared with ' + clientEmail + '?)')
  }
  const j = await r.json()
  return j.values || []
}

// Finds the four team blocks by their title rows, so a few rows moving around in the sheet does not break it.
export function parseEbitdaView(grid) {
  const teams = []
  for (const t of TEAMS) {
    const at = grid.findIndex(row => row && typeof row[0] === 'string' && t.re.test(row[0].trim()))
    if (at < 0) throw new Error('The ' + t.key + ' block was not found on the EBITDA View tab')
    const title = grid[at]
    const rows = []
    for (let i = at + 2; i < grid.length; i++) {
      const row = grid[i]
      if (!row || row[0] === undefined || row[0] === '' || row[0] === null) break
      rows.push({
        name: String(row[0]), size: num(row[1]), sr: num(row[2]), ac: num(row[3]), vas: num(row[4]),
        rev: num(row[5]), cost: num(row[12]), ebitda: num(row[13]),
      })
    }
    teams.push({ key: t.key, size: num(title[1]), rev: num(title[5]), cost: num(title[12]), ebitda: num(title[13]), rows })
  }
  // Optional: the reconciliation lines the sheet carries under the tables (difference must be 0).
  let recon = null
  const rAt = grid.findIndex(row => row && typeof row[0] === 'string' && /^Reconciliation with Team Mapping/i.test(row[0]))
  if (rAt >= 0) {
    const get = off => (grid[rAt + off] ? num(grid[rAt + off][3]) : 0)
    recon = { revenueDiff: get(1), costDiff: get(2), ebitdaDiff: get(3) }
  }
  return { teams, recon }
}

// ---- Native Slack messages (Version A) ----
const raw = t => ({ type: 'raw_text', text: String(t) })
const arrowName = v => (v > 0 ? 'ebitda_up' : 'ebitda_down')
const arrowText = v => ':' + arrowName(v) + ': '
const ebitCell = v => ({
  type: 'rich_text',
  elements: [{ type: 'rich_text_section', elements: [{ type: 'emoji', name: arrowName(v) }, { type: 'text', text: ' ' + money(v), style: { bold: true } }] }],
})
const HEADERS = ['Manager', 'Team', 'SR rev', 'AC rev', 'VAS rev', 'Total rev', 'Total cost', 'EBITDA']
const COL_SETTINGS = [{ is_wrapped: true }, { align: 'right' }, { align: 'right' }, { align: 'right' }, { align: 'right' }, { align: 'right' }, { align: 'right' }, { align: 'right' }]

// ---- Picture (Version B) of one team table ----
const K = 2
const C = { ink: '#111827', grey: '#6B7280', line: '#E5E7EB', head: '#F3F4F6', gFill: '#CDEBD8', gTxt: '#1E7A43', rFill: '#F6CFCF', rTxt: '#B02323' }
const COLS = ['Manager', 'Team', 'SR rev', 'AC rev', 'VAS rev', 'Total rev', 'Total cost', 'EBITDA']
const W = [230, 60, 90, 90, 90, 100, 100, 120]
const WSUM = W.reduce((a, b) => a + b, 0)
const font = (size, bold) => (size * K) + 'px ' + (bold ? '"Arimo Bold"' : 'Arimo')

function drawText(ctx, text, x, y, f, color, align) {
  ctx.font = f
  ctx.fillStyle = color
  const w = ctx.measureText(text).width
  ctx.fillText(text, align === 'r' ? x - w : x, y)
  return w
}
function drawArrow(ctx, x, y, h, up, color) {
  const w = h * 0.8
  const cx = x + w / 2
  ctx.fillStyle = color
  ctx.beginPath()
  if (up) {
    ctx.moveTo(cx, y); ctx.lineTo(x + w, y + h * 0.5); ctx.lineTo(x, y + h * 0.5); ctx.closePath(); ctx.fill()
    ctx.fillRect(cx - h * 0.13, y + h * 0.45, h * 0.26, h * 0.55)
  } else {
    ctx.moveTo(cx, y + h); ctx.lineTo(x + w, y + h * 0.5); ctx.lineTo(x, y + h * 0.5); ctx.closePath(); ctx.fill()
    ctx.fillRect(cx - h * 0.13, y, h * 0.26, h * 0.55)
  }
}

export function teamPicture(team) {
  ensureFonts()
  const n = team.rows.length
  const rh = 40 * K, hh = 44 * K, top = 108 * K
  const width = (WSUM + 40) * K
  const height = top + hh + rh * n + 24 * K
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  ctx.textBaseline = 'middle'
  drawText(ctx, team.key + ' team', 20 * K, 26 * K, font(22, true), C.ink)
  const prof = team.ebitda > 0
  const sub = 'Team ' + team.size + '   |   Revenue ' + money(team.rev) + '   |   Cost ' + money(team.cost) + '   |   EBITDA '
  const sw = drawText(ctx, sub, 20 * K, 60 * K, font(14), C.grey)
  const col = prof ? C.gTxt : C.rTxt
  drawArrow(ctx, 20 * K + sw, 50 * K, 20 * K, prof, col)
  drawText(ctx, money(team.ebitda), 20 * K + sw + 22 * K, 60 * K, font(14, true), col)
  let x = 20 * K
  COLS.forEach((h, i) => {
    const w = W[i] * K
    ctx.fillStyle = C.head
    ctx.fillRect(x, top, w, hh)
    drawText(ctx, h, i ? x + w - 12 * K : x + 12 * K, top + hh / 2, font(13, true), C.ink, i ? 'r' : 'l')
    x += w
  })
  team.rows.forEach((r, ri) => {
    const y = top + hh + rh * ri
    let cx = 20 * K
    const vals = [r.name, String(r.size), money(r.sr), money(r.ac), money(r.vas), money(r.rev), money(r.cost)]
    vals.forEach((v, i) => {
      const w = W[i] * K
      drawText(ctx, v, i ? cx + w - 12 * K : cx + 12 * K, y + rh / 2, font(14, i === 5), C.ink, i ? 'r' : 'l')
      cx += w
    })
    const w = W[7] * K
    const up = r.ebitda > 0
    ctx.fillStyle = up ? C.gFill : C.rFill
    ctx.fillRect(cx, y, w, rh)
    const colr = up ? C.gTxt : C.rTxt
    const s = money(r.ebitda)
    ctx.font = font(14, true)
    const tw = ctx.measureText(s).width
    drawText(ctx, s, cx + w - 12 * K, y + rh / 2, font(14, true), colr, 'r')
    drawArrow(ctx, cx + w - 12 * K - tw - 26 * K, y + rh / 2 - 8 * K, 16 * K, up, colr)
    ctx.strokeStyle = C.line
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(20 * K, y + rh); ctx.lineTo(20 * K + WSUM * K, y + rh); ctx.stroke()
  })
  return canvas.toBuffer('image/png').toString('base64')
}

// ---- Whole report ----
export function buildEbitdaReport(parsed, opts) {
  const { teams, recon } = parsed
  const dateLabel = (opts && opts.dateLabel) || ''
  const proRata = (opts && opts.proRata) || ''
  const tr = teams.reduce((a, t) => a + t.rev, 0)
  const tc = teams.reduce((a, t) => a + t.cost, 0)
  const te = teams.reduce((a, t) => a + t.ebitda, 0)
  const all = teams.flatMap(t => t.rows)
  const profit = all.filter(r => r.ebitda > 0).length
  const note = 'AC, SR, VAS and Offline only. Revenue month to date; costs are September totals pro-rated' + (proRata ? ' to ' + proRata : '') + '; marketing is this month’s P&L spend. Sorted by EBITDA, highest first. A picture of each table is in its thread.'
  const warn = recon && (Math.abs(recon.revenueDiff) > 1 || Math.abs(recon.costDiff) > 1)
    ? '\n:warning: The sheet’s reconciliation with Team Mapping is off (revenue ' + money(recon.revenueDiff) + ', cost ' + money(recon.costDiff) + '). Check the EBITDA View tab.'
    : ''
  const headerTitle = 'Manager-level EBITDA' + (dateLabel ? ', as on ' + dateLabel : '')
  const messages = [{
    text: headerTitle,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: headerTitle } },
      { type: 'section', fields: [
        { type: 'mrkdwn', text: '*Revenue*\n' + money(tr) },
        { type: 'mrkdwn', text: '*Cost*\n' + money(tc) },
        { type: 'mrkdwn', text: '*EBITDA*\n' + arrowText(te) + money(te) },
        { type: 'mrkdwn', text: '*Managers in profit*\n' + profit + ' of ' + all.length },
      ] },
      { type: 'context', elements: [{ type: 'mrkdwn', text: note + warn }] },
    ],
  }]
  for (const t of teams) {
    const rows = t.rows.map(r => [raw(r.name), raw(r.size), raw(money(r.sr)), raw(money(r.ac)), raw(money(r.vas)), raw(money(r.rev)), raw(money(r.cost)), ebitCell(r.ebitda)])
    messages.push({
      text: t.key + ' team',
      threadPng: { name: t.key + '-team', title: t.key + ' team', get base64() { return teamPicture(t) } },
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: t.key + ' team' } },
        { type: 'context', elements: [{ type: 'mrkdwn', text: 'Team ' + t.size + '  |  Revenue ' + money(t.rev) + '  |  Cost ' + money(t.cost) + '  |  EBITDA ' + arrowText(t.ebitda) + money(t.ebitda) }] },
        { type: 'table', column_settings: COL_SETTINGS, rows: [HEADERS.map(raw)].concat(rows) },
      ],
    })
  }
  return { messages, totals: { revenue: tr, cost: tc, ebitda: te, profit, managers: all.length } }
}
