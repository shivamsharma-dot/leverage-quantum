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

// The months the continuous (combined) view adds up, oldest first. The LAST entry is the live sheet (the current
// month); every earlier month is its own copy of the workbook, kept as it was when that month was reported. When a
// new month starts, copy the live workbook for the month that just ended, add it here before the live entry, and
// the combined view picks it up. Combined = every month added together; team size shows the latest month with
// the earlier months in brackets (people are not additive).
export const EBITDA_MONTHS = [
  { key: 'oct', label: 'October', sheetId: '19jiItg-r5iveLGPjtZrZsIUI4OvQIK03A4PLNLUfZik', tab: 'EBITDA - October' },
  { key: 'nov', label: 'November', sheetId: EBITDA_SHEET_ID, tab: 'EBITDA - November' },
]
// Each month's tab carries the month in its name. The old name 'EBITDA View' is still tried as a fallback, so a rename in
// the sheet and the matching deploy do not have to land at the same second.
const tabsFor = sheetId => {
  const m = EBITDA_MONTHS.find(x => x.sheetId === (sheetId || EBITDA_SHEET_ID))
  return m && m.tab && m.tab !== EBITDA_TAB ? [m.tab, EBITDA_TAB] : [EBITDA_TAB]
}
async function readRange(sheetId, a1, access_token) {
  let last = null
  for (const tab of tabsFor(sheetId)) {
    const r = await fetch('https://sheets.googleapis.com/v4/spreadsheets/' + (sheetId || EBITDA_SHEET_ID) + '/values/' + encodeURIComponent("'" + tab + "'!" + a1) + '?valueRenderOption=UNFORMATTED_VALUE', { headers: { Authorization: 'Bearer ' + access_token } })
    if (r.ok) return { ok: true, json: await r.json(), tab }
    last = { ok: false, status: r.status, json: await r.json().catch(() => ({})), tab }
  }
  return last
}

const TEAMS = [
  { key: 'AC', re: /^AC team/i },
  { key: 'SR', re: /^SR team/i },
  { key: 'VAS', re: /^VAS team/i },
  { key: 'Offline', re: /^Offline team/i },
]

const num = v => (typeof v === 'number' ? v : Number(String(v == null ? '' : v).replace(/,/g, '')) || 0)
// Team size: a number, or the Combined tab's text "5 (7)" (latest month, earlier in brackets) -> 5; "- (5)" -> '-'.
const sizeOf = v => {
  if (typeof v === 'number') return v
  const m = /^\s*(\d+)/.exec(String(v == null ? '' : v))
  return m ? Number(m[1]) : '-'
}

// Indian-style short money: lakh below a crore, crore above.
// Column positions from a table's header row. The Combined tab carries "EBITDA November" and "EBITDA Combined"
// (14 Nov 2026); month tabs carry one "EBITDA" column. Falls back to the old fixed positions.
const colsOf = header => {
  const h = (header || []).map(x => String(x == null ? '' : x).replace(/\s+/g, ' ').trim().toLowerCase())
  const find = re => { const i = h.findIndex(x => re.test(x)); return i < 0 ? null : i }
  const comb = find(/^ebitda combined$/)
  return {
    cost: find(/^total cost$/) ?? 12,
    ebitda: comb ?? find(/^ebitda$/) ?? 13,
    nov: comb != null ? find(/^ebitda november$/) : null,
    managers: find(/^managers$/),
  }
}
const novOf = v => (typeof v === 'number' ? v : (v === '' || v == null || v === '-') ? null : num(v))

export function money(x) {
  const s = x < 0 ? '-' : ''
  const a = Math.abs(x)
  return s + (a >= 1e7 ? (a / 1e7).toFixed(2) + ' Cr' : (a / 1e5).toFixed(1) + ' L')
}

// Reads 'EBITDA View'!A1:N160 with the service account (values unformatted so numbers stay numbers).
export async function readEbitdaView(sheetId) {
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL
  const privateKey = (process.env.GOOGLE_SHEETS_PRIVATE_KEY || '').replace(/\\n/g, '\n')
  if (!clientEmail || !privateKey) throw new Error('GOOGLE_SHEETS_CLIENT_EMAIL/GOOGLE_SHEETS_PRIVATE_KEY are not set')
  const { JWT } = await import('google-auth-library')
  const auth = new JWT({ email: clientEmail, key: privateKey, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] })
  const { access_token } = await auth.authorize()
  const r = await readRange(sheetId, 'A1:N320', access_token)
  if (!r.ok) {
    throw new Error('Could not read the ' + tabsFor(sheetId)[0] + ' tab: ' + (r.json.error?.message || r.status) + ' (is it shared with ' + clientEmail + '?)')
  }
  return r.json.values || []
}

// Reads any tab of a workbook by its exact name (used for the Combined tab, which carries the October moves and the
// senior manager tables). Values unformatted.
export async function readEbitdaTab(sheetId, tab, a1) {
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL
  const privateKey = (process.env.GOOGLE_SHEETS_PRIVATE_KEY || '').replace(/\\n/g, '\n')
  if (!clientEmail || !privateKey) throw new Error('GOOGLE_SHEETS_CLIENT_EMAIL/GOOGLE_SHEETS_PRIVATE_KEY are not set')
  const { JWT } = await import('google-auth-library')
  const auth = new JWT({ email: clientEmail, key: privateKey, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] })
  const { access_token } = await auth.authorize()
  const r = await fetch('https://sheets.googleapis.com/v4/spreadsheets/' + sheetId + '/values/' + encodeURIComponent("'" + tab + "'!" + a1) + '?valueRenderOption=UNFORMATTED_VALUE', { headers: { Authorization: 'Bearer ' + access_token } })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error('Could not read the ' + tab + ' tab: ' + (j.error?.message || r.status))
  return j.values || []
}

// The Combined tab lives in the live workbook. Its team tables already carry the October moves (managers who left are
// counted under the manager their people went to), so the combined view reads it as it is.
export const EBITDA_COMBINED_TAB = 'EBITDA - Combined'

// The sheet's own "effective today" (EBITDA View S6: today normally, or the 1st of the month after the report
// month when S1 holds e.g. 2026-10). The header date and the pro-rata line must follow it, not the real clock,
// or an October report would be labelled with November's date. Falls back to the real clock if it can't be read.
export async function ebitdaYesterday(sheetId) {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000)
  let y = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - 1))
  try {
    const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL
    const privateKey = (process.env.GOOGLE_SHEETS_PRIVATE_KEY || '').replace(/\\n/g, '\n')
    const { JWT } = await import('google-auth-library')
    const auth = new JWT({ email: clientEmail, key: privateKey, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] })
    const { access_token } = await auth.authorize()
    const rr = await readRange(sheetId, 'S6', access_token)
    const j = rr.json
    const serial = j && j.values && j.values[0] && j.values[0][0]
    if (typeof serial === 'number' && serial > 40000) y = new Date(Date.UTC(1899, 11, 30) + (Math.floor(serial) - 1) * 86400000)
  } catch (_) { /* keep the real-clock yesterday */ }
  return y
}

// The report month a workbook is currently set to (EBITDA View S17, a date serial), so the combined view can refuse to
// add the same month twice, for example while the live sheet has not been switched to the new month yet.
export async function ebitdaMonthStart(sheetId) {
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL
  const privateKey = (process.env.GOOGLE_SHEETS_PRIVATE_KEY || '').replace(/\\n/g, '\n')
  const { JWT } = await import('google-auth-library')
  const auth = new JWT({ email: clientEmail, key: privateKey, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] })
  const { access_token } = await auth.authorize()
  const rr = await readRange(sheetId, 'S17', access_token)
  const j = rr.json
  const v = j && j.values && j.values[0] && j.values[0][0]
  return typeof v === 'number' ? Math.floor(v) : null
}

// Finds the four team blocks by their title rows, so a few rows moving around in the sheet does not break it.
export function parseEbitdaView(grid) {
  const teams = []
  for (const t of TEAMS) {
    const at = grid.findIndex(row => row && typeof row[0] === 'string' && t.re.test(row[0].trim()))
    if (at < 0) throw new Error('The ' + t.key + ' block was not found on the EBITDA View tab')
    const title = grid[at]
    const cols = colsOf(grid[at + 1])
    const rows = []
    for (let i = at + 2; i < grid.length; i++) {
      const row = grid[i]
      if (!row || row[0] === undefined || row[0] === '' || row[0] === null) break
      rows.push({
        name: String(row[0]), size: sizeOf(row[1]), sr: num(row[2]), ac: num(row[3]), vas: num(row[4]),
        rev: num(row[5]), product: num(row[6]), cost: num(row[cols.cost]), ebitda: num(row[cols.ebitda]),
        ...(cols.nov != null ? { ebitdaNov: novOf(row[cols.nov]) } : {}),
      })
    }
    teams.push({ key: t.key, size: sizeOf(title[1]), rev: num(title[5]), cost: num(title[cols.cost]), ebitda: num(title[cols.ebitda]), ...(cols.nov != null ? { ebitdaNov: novOf(title[cols.nov]) } : {}), rows })
  }
  // Optional: the reconciliation lines the sheet carries under the tables (difference must be 0).
  let recon = null
  const rAt = grid.findIndex(row => row && typeof row[0] === 'string' && /^Reconciliation with Team Mapping/i.test(row[0]))
  if (rAt >= 0) {
    const get = off => (grid[rAt + off] ? num(grid[rAt + off][3]) : 0)
    recon = { revenueDiff: get(1), costDiff: get(2), ebitdaDiff: get(3) }
  }
  // A note the sheet carries above the tables (row 5): coaches counted under a manager although they are not in Team Mapping.
  const noteRow = grid.slice(0, 12).find(row => row && typeof row[0] === 'string' && /^Counted separately/i.test(row[0]))
  return { teams, recon, adjNote: noteRow ? String(noteRow[0]) : '' }
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
const BASE_COLS = ['Manager', 'Team', 'SR rev', 'AC rev', 'VAS rev', 'Total rev', 'Total cost', 'EBITDA']
const BASE_W = [230, 60, 90, 90, 90, 100, 100, 120]
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
  // Combined view: an extra "EBITDA Nov" column before the last (EBITDA Combined) column.
  const hasNov = team.rows.some(r => 'ebitdaNov' in r)
  // Slack order (14 Nov 2026): ... Total cost, EBITDA Combined, EBITDA Nov (Nov last).
  const hasBe = team.rows.some(r => 'beNeed' in r)
  const COLS = (hasNov ? BASE_COLS.slice(0, 7).concat(['EBITDA Combined', 'EBITDA Nov']) : BASE_COLS).concat(hasBe ? ['Nov break-even'] : [])
  const W = (hasNov ? BASE_W.slice(0, 7).concat([140, 120]) : BASE_W).concat(hasBe ? [130] : [])
  const EI = 7
  const WSUM = W.reduce((a, b) => a + b, 0)
  const n = team.rows.length
  const rh = 40 * K, hh = 44 * K, top = 108 * K
  const width = (WSUM + 40) * K
  const height = top + hh + rh * n + 24 * K
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  ctx.textBaseline = 'middle'
  drawText(ctx, team.title || (team.key + ' team'), 20 * K, 26 * K, font(22, true), C.ink)
  const prof = team.ebitda > 0
  const sub = 'Team ' + team.size + '   |   Revenue ' + money(team.rev) + '   |   Cost ' + money(team.cost) + '   |   ' + (hasNov ? 'EBITDA Combined ' : 'EBITDA ')
  const sw = drawText(ctx, sub, 20 * K, 60 * K, font(14), C.grey)
  const col = prof ? C.gTxt : C.rTxt
  drawArrow(ctx, 20 * K + sw, 50 * K, 20 * K, prof, col)
  const ew = drawText(ctx, money(team.ebitda), 20 * K + sw + 22 * K, 60 * K, font(14, true), col)
  if (hasNov && team.ebitdaNov != null) {
    // (break-even total is added after the Nov figure below)
    const x0 = 20 * K + sw + 22 * K + ew
    const lw = drawText(ctx, '   |   EBITDA Nov ', x0, 60 * K, font(14), C.grey)
    const nup = team.ebitdaNov > 0
    const ncol = nup ? C.gTxt : C.rTxt
    drawArrow(ctx, x0 + lw, 50 * K, 20 * K, nup, ncol)
    const nvw = drawText(ctx, money(team.ebitdaNov), x0 + lw + 22 * K, 60 * K, font(14, true), ncol)
    if (hasBe && team.beNeed != null) drawText(ctx, '   |   Nov break-even ' + beText(team.beNeed), x0 + lw + 22 * K + nvw, 60 * K, font(14), C.grey)
  }
  let x = 20 * K
  COLS.forEach((h, i) => {
    if (i === 0 && team.firstCol) h = team.firstCol
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
    const w = W[EI] * K
    const up = r.ebitda > 0
    ctx.fillStyle = up ? C.gFill : C.rFill
    ctx.fillRect(cx, y, w, rh)
    const colr = up ? C.gTxt : C.rTxt
    const s = money(r.ebitda)
    ctx.font = font(14, true)
    const tw = ctx.measureText(s).width
    drawText(ctx, s, cx + w - 12 * K, y + rh / 2, font(14, true), colr, 'r')
    drawArrow(ctx, cx + w - 12 * K - tw - 26 * K, y + rh / 2 - 8 * K, 16 * K, up, colr)
    if (hasNov) {
      // EBITDA Nov drawn like EBITDA Combined: red / green cell with an arrow.
      const nx = cx + w
      const nw = W[EI + 1] * K
      const nv = r.ebitdaNov
      if (nv == null) {
        drawText(ctx, '-', nx + nw - 12 * K, y + rh / 2, font(14), C.ink, 'r')
      } else {
        const nup = nv > 0
        ctx.fillStyle = nup ? C.gFill : C.rFill
        ctx.fillRect(nx, y, nw, rh)
        const ncol = nup ? C.gTxt : C.rTxt
        const ns = money(nv)
        ctx.font = font(14, true)
        const ntw = ctx.measureText(ns).width
        drawText(ctx, ns, nx + nw - 12 * K, y + rh / 2, font(14, true), ncol, 'r')
        drawArrow(ctx, nx + nw - 12 * K - ntw - 26 * K, y + rh / 2 - 8 * K, 16 * K, nup, ncol)
      }
    }
    if (hasBe) {
      const bx = cx + w + (hasNov ? W[EI + 1] * K : 0)
      const bw = W[W.length - 1] * K
      const cov = r.beNeed != null && r.beNeed <= 0
      drawText(ctx, beText(r.beNeed), bx + bw - 12 * K, y + rh / 2, font(14, cov), cov ? C.gTxt : C.ink, 'r')
    }
    ctx.strokeStyle = C.line
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(20 * K, y + rh); ctx.lineTo(20 * K + WSUM * K, y + rh); ctx.stroke()
  })
  return canvas.toBuffer('image/png').toString('base64')
}

// ---- The EBITDA View tab, as the page shows it ----
// Raw rows (numbers stay numbers) for every block the page prints: the consolidated team view, the four team
// blocks, the difference block and the reconciliation. Found by their title rows, like parseEbitdaView does.
export function extractEbitdaViewSections(grid) {
  const cell = v => (v === undefined || v === null ? '' : v)
  // Width follows the header: 14 columns on a month tab, 15 on Combined (EBITDA November + EBITDA Combined).
  const widthOf = header => { let w = 14; for (let i = 14; i < 16; i++) if (header && header[i] !== undefined && header[i] !== null && header[i] !== '') w = i + 1; return w }
  const rowOf = (row, w) => Array.from({ length: w || 14 }, (_, i) => cell(row && row[i]))
  const at = re => grid.findIndex(row => row && typeof row[0] === 'string' && re.test(row[0].trim()))
  const block = (titleRe, headerOffset) => {
    const i = at(titleRe)
    if (i < 0) return null
    const w = widthOf(grid[i + headerOffset])
    const rows = []
    for (let j = i + headerOffset + 1; j < grid.length; j++) {
      const row = grid[j]
      if (!row || row[0] === undefined || row[0] === '' || row[0] === null) break
      rows.push(rowOf(row, w))
    }
    return { title: String(grid[i][0]), titleRow: rowOf(grid[i], w), header: rowOf(grid[i + headerOffset], w), rows }
  }
  const consolidated = (() => {
    const i = at(/^Consolidated team-wise view/i)
    if (i < 0) return null
    const w = widthOf(grid[i + 1])
    const header = rowOf(grid[i + 1], w)
    const rows = []
    for (let j = i + 2; j < grid.length; j++) {
      const row = grid[j]
      if (!row || row[0] === undefined || row[0] === '' || row[0] === null) break
      // The sheet carries a reference-only "Actual revenue (before refunds)" line right under Total; not part of the table.
      if (typeof row[0] === 'string' && /^Actual revenue/i.test(row[0].trim())) break
      rows.push(rowOf(row, w))
    }
    return { header, rows }
  })()
  const rAt = at(/^Reconciliation with Team Mapping/i)
  const recon = rAt < 0 ? null : {
    header: [0, 1, 2, 3].map(k => cell(grid[rAt] && grid[rAt][k])),
    rows: [1, 2, 3].map(o => [0, 1, 2, 3].map(k => cell(grid[rAt + o] && grid[rAt + o][k]))),
  }
  return {
    title: grid[0] && grid[0][0] ? String(grid[0][0]) : 'Manager and SM-level EBITDA',
    summary: [grid[1] && grid[1][0], grid[2] && grid[2][0]].filter(x => typeof x === 'string' && x.trim()),
    consolidated,
    teams: TEAMS.map(t => ({ key: t.key, ...(block(t.re, 1) || { title: '', titleRow: [], header: [], rows: [] }) })),
    difference: block(/^Difference:/i, 1),
    recon,
  }
}

// ---- Senior manager view ----
// The Combined tab carries one senior manager table per view, titled "Senior managers: Combined", "Senior managers:
// November", "Senior managers: October" (each = the four team tables' manager rows grouped by Team Mapping column K
// on the manager's own row). Returns { parsed, section } for the picked view, or null if the block is not there.
export function extractSeniorManagers(grid, label) {
  const re = new RegExp('^Senior managers: ' + label, 'i')
  const at = grid.findIndex(row => row && typeof row[0] === 'string' && re.test(row[0].trim()))
  if (at < 0) return null
  const cell = v => (v === undefined || v === null ? '' : v)
  const cols = colsOf(grid[at + 1])
  const width = cols.managers != null ? cols.managers + 1 : 15
  const rowOf = row => Array.from({ length: width }, (_, i) => cell(row && row[i]))
  const raw = []
  for (let i = at + 2; i < grid.length; i++) {
    const row = grid[i]
    if (!row || row[0] === undefined || row[0] === '' || row[0] === null) break
    raw.push(rowOf(row))
  }
  const title = grid[at]
  const mc = cols.managers != null ? cols.managers : 14
  const nov = r => (cols.nov != null ? { ebitdaNov: novOf(r[cols.nov]) } : {})
  const rows = raw.map(r => ({ name: String(r[0]), size: sizeOf(r[1]), sr: num(r[2]), ac: num(r[3]), vas: num(r[4]), rev: num(r[5]), product: num(r[6]), cost: num(r[cols.cost]), ebitda: num(r[cols.ebitda]), ...nov(r), managers: String(r[mc] || '') }))
  return {
    parsed: { key: 'Senior managers', title: 'Senior managers', firstCol: 'Senior manager', size: sizeOf(title[1]), rev: num(title[5]), cost: num(title[cols.cost]), ebitda: num(title[cols.ebitda]), ...nov(title), rows },
    section: { title: String(title[0]), titleRow: rowOf(title), header: rowOf(grid[at + 1]), rows: raw },
  }
}

// Message list with every lazy picture rendered, ready to send over JSON.
export function materialiseMessages(messages) {
  return messages.map(m => {
    const out = { text: m.text, blocks: m.blocks }
    if (m.threadPng) out.threadPng = { name: m.threadPng.name, title: m.threadPng.title, base64: m.threadPng.base64 }
    return out
  })
}

// ---- Continuous view: several months added together ----
// People are not additive, so the size column becomes text: the latest month first, earlier months in brackets
// ("8 (9)"; a month the manager is not in shows a dash).
const sizeLabel = sizes => {
  const rev = sizes.slice().reverse().map(v => (v === undefined || v === null ? '-' : String(v)))
  return rev[0] + (rev.length > 1 ? ' (' + rev.slice(1).join(', ') + ')' : '')
}

// items: [{ label, parsed }] oldest first, parsed = parseEbitdaView(grid). Returns the same shape, months summed.
export function combineParsed(items) {
  const teams = TEAMS.map(t => {
    const per = items.map(it => it.parsed.teams.find(x => x.key === t.key) || { size: undefined, rev: 0, cost: 0, ebitda: 0, rows: [] })
    const byName = new Map()
    per.forEach((team, mi) => {
      team.rows.forEach(r => {
        const e = byName.get(r.name) || { name: r.name, sizes: items.map(() => undefined), sr: 0, ac: 0, vas: 0, rev: 0, cost: 0, ebitda: 0 }
        e.sizes[mi] = r.size
        for (const k of ['sr', 'ac', 'vas', 'rev', 'cost', 'ebitda']) e[k] += r[k]
        byName.set(r.name, e)
      })
    })
    // Slack shows only the latest month's headcount (no brackets: owner, 5 Nov 2026). The page keeps brackets (combineSections).
    const latest = sizes => { const v = sizes[sizes.length - 1]; return v === undefined || v === null ? '-' : v }
    const rows = Array.from(byName.values()).map(e => ({ name: e.name, size: latest(e.sizes), sr: e.sr, ac: e.ac, vas: e.vas, rev: e.rev, cost: e.cost, ebitda: e.ebitda }))
      .sort((a, b) => b.ebitda - a.ebitda)
    return {
      key: t.key,
      size: (v => (v === undefined || v === null ? '-' : v))(per[per.length - 1].size),
      rev: per.reduce((a, x) => a + x.rev, 0), cost: per.reduce((a, x) => a + x.cost, 0), ebitda: per.reduce((a, x) => a + x.ebitda, 0),
      rows,
    }
  })
  const withRecon = items.map(it => it.parsed.recon).filter(Boolean)
  const recon = withRecon.length ? {
    revenueDiff: withRecon.reduce((a, r) => a + r.revenueDiff, 0), costDiff: withRecon.reduce((a, r) => a + r.costDiff, 0), ebitdaDiff: withRecon.reduce((a, r) => a + r.ebitdaDiff, 0),
  } : null
  const adjNote = items.map(it => (it.parsed.adjNote ? it.label + ': ' + it.parsed.adjNote : '')).filter(Boolean).join('  ')
  return { teams, recon, adjNote }
}

// Same idea for the page: the raw sections of each month's EBITDA View tab, numeric columns (2 to 13) added up,
// rows matched by name, column 1 turned into the size text.
export function combineSections(items) {
  const rowKey = r => String(r[0])
  const mergeRows = (lists, sortByEbitda) => {
    const map = new Map()
    lists.forEach((rows, mi) => {
      (rows || []).forEach(r => {
        const e = map.get(rowKey(r)) || { name: r[0], sizes: lists.map(() => undefined), vals: Array(12).fill(0) }
        e.sizes[mi] = typeof r[1] === 'number' ? r[1] : undefined
        for (let c = 2; c < 14; c++) e.vals[c - 2] += typeof r[c] === 'number' ? r[c] : 0
        map.set(rowKey(r), e)
      })
    })
    let out = Array.from(map.values()).map(e => [e.name, sizeLabel(e.sizes)].concat(e.vals))
    if (sortByEbitda) out = out.sort((a, b) => b[13] - a[13])
    return out
  }
  const secs = items.map(it => it.sections)
  const latest = secs[secs.length - 1]
  const consolidated = secs.every(x => x.consolidated) ? { header: latest.consolidated.header, rows: mergeRows(secs.map(x => x.consolidated.rows), false) } : null
  const teams = TEAMS.map(t => {
    const per = secs.map(x => x.teams.find(y => y.key === t.key) || { title: '', titleRow: [], header: [], rows: [] })
    const total = mergeRows(per.map(x => (x.titleRow && x.titleRow.length ? [x.titleRow] : [])), false)[0] || []
    return { key: t.key, title: (per[per.length - 1].title || t.key + ' team') + ' (combined)', titleRow: total, header: per[per.length - 1].header, rows: mergeRows(per.map(x => x.rows), true) }
  })
  const dif = secs.map(x => x.difference).filter(Boolean)
  const difference = dif.length ? { title: dif[dif.length - 1].title, titleRow: mergeRows(dif.map(d => [d.titleRow]), false)[0] || [], header: dif[dif.length - 1].header, rows: mergeRows(dif.map(d => d.rows), true) } : null
  const rc = secs.map(x => x.recon).filter(Boolean)
  const recon = rc.length ? {
    header: rc[rc.length - 1].header,
    rows: [0, 1, 2].map(i => [rc[0].rows[i][0], 1, 2, 3].map((k, j) => (j === 0 ? k : rc.reduce((a, r) => a + (typeof r.rows[i][j] === 'number' ? r.rows[i][j] : 0), 0)))),
  } : null
  return {
    title: latest.title,
    summary: ['Combined view: ' + items.map(it => it.label).join(' + ') + ' added together. The team size column shows the latest month, with earlier months in brackets.'].concat(
      items.map((it, i) => (it.sections.summary && it.sections.summary[0] ? it.label + ': ' + it.sections.summary[0] : '')).filter(Boolean)),
    consolidated, teams, difference, recon,
  }
}

// ---- Month-end break-even (same rule as the office TV, "OND Source update") ----
// Revenue still needed by month end for EBITDA 0: costs so far without product cost run evenly for the rest of the
// month; product cost grows with revenue at the manager's own product share (capped 95%).
export function breakEvenNeed(x, daysDone, daysTotal) {
  const share = x.rev > 0 ? Math.min(0.95, Math.max(0, x.product / x.rev)) : 0
  const fixedFull = Math.max(0, x.cost - x.product) * daysTotal / Math.max(1, daysDone)
  const target = fixedFull / (1 - share)
  return Math.max(0, target - x.rev)
}
const beText = v => (v == null ? '-' : v <= 0 ? 'Covered' : money(v))

// ---- Whole report ----
export function buildEbitdaReport(parsed, opts) {
  const { teams, recon, adjNote } = parsed
  const dateLabel = (opts && opts.dateLabel) || ''
  const proRata = (opts && opts.proRata) || ''
  const tr = teams.reduce((a, t) => a + t.rev, 0)
  const tc = teams.reduce((a, t) => a + t.cost, 0)
  const te = teams.reduce((a, t) => a + t.ebitda, 0)
  const all = teams.flatMap(t => t.rows)
  const hasNovTop = all.some(r => 'ebitdaNov' in r)
  const profit = all.filter(r => r.ebitda > 0).length
  const note = (opts && opts.noteText) || 'AC, SR, VAS and Offline only. Revenue month to date; costs are monthly totals pro-rated' + (proRata ? ' to ' + proRata : '') + '; marketing is this month’s P&L spend. Sorted by EBITDA, highest first. A picture of each table is in its thread.'
  const warn = recon && (Math.abs(recon.revenueDiff) > 1 || Math.abs(recon.costDiff) > 1)
    ? '\n:warning: The sheet’s reconciliation with Team Mapping is off (revenue ' + money(recon.revenueDiff) + ', cost ' + money(recon.costDiff) + '). Check the EBITDA View tab.'
    : ''
  const headerTitle = (opts && opts.headerTitle) || ('Overall EBITDA' + (dateLabel ? ', as on ' + dateLabel : ''))
  const messages = [{
    text: headerTitle,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: headerTitle } },
      { type: 'section', fields: [
        { type: 'mrkdwn', text: '*Revenue*\n' + money(tr) },
        { type: 'mrkdwn', text: '*Cost*\n' + money(tc) },
        { type: 'mrkdwn', text: (hasNovTop ? '*EBITDA Combined*\n' : '*EBITDA*\n') + arrowText(te) + money(te) },
        { type: 'mrkdwn', text: '*Managers in profit*\n' + profit + ' of ' + all.length },
      ] },
      { type: 'context', elements: [{ type: 'mrkdwn', text: note + warn }] },
      ...(opts && opts.howTo ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: opts.howTo }] }] : []),
    ],
  }]
  // Combined view: "EBITDA Nov" column before "EBITDA Combined" (sorting stays by EBITDA Combined, as in the sheet).
  const hasNov = teams.some(t => t.rows.some(r => 'ebitdaNov' in r))
  // Optional "Nov break-even" column (Combined report): opts.breakEven = { team: Map('AC|name' -> need), sm: Map(name -> need) }.
  const be = opts && opts.breakEven
  if (be) {
    for (const t of teams) {
      t.rows.forEach(r => { r.beNeed = be.team.has(t.key + '|' + r.name) ? be.team.get(t.key + '|' + r.name) : null })
      t.beNeed = t.rows.reduce((a, r) => a + (r.beNeed || 0), 0)
    }
    const smP = opts.seniorManagers
    if (smP) {
      smP.rows.forEach(r => { r.beNeed = be.sm.has(r.name) ? be.sm.get(r.name) : null })
      smP.beNeed = smP.rows.reduce((a, r) => a + (r.beNeed || 0), 0)
    }
  }
  const heads = (hasNov ? HEADERS.slice(0, 7).concat(['EBITDA Combined', 'EBITDA Nov']) : HEADERS).concat(be ? ['Nov break-even'] : [])
  const colSet = (hasNov ? COL_SETTINGS.concat([{ align: 'right' }]) : COL_SETTINGS).concat(be ? [{ align: 'right' }] : [])
  const rowCells = r => [raw(r.name), raw(r.size), raw(money(r.sr)), raw(money(r.ac)), raw(money(r.vas)), raw(money(r.rev)), raw(money(r.cost))]
    .concat([ebitCell(r.ebitda)]).concat(hasNov ? [r.ebitdaNov == null ? raw('-') : ebitCell(r.ebitdaNov)] : [])
    .concat(be ? [raw(beText(r.beNeed))] : [])
  const ebitLine = x => (hasNov ? 'EBITDA Combined ' : 'EBITDA ') + arrowText(x.ebitda) + money(x.ebitda) + (hasNov && x.ebitdaNov != null ? '  |  EBITDA Nov ' + arrowText(x.ebitdaNov) + money(x.ebitdaNov) : '') + (be && x.beNeed != null ? '  |  Nov break-even ' + beText(x.beNeed) : '')
  for (const t of teams) {
    const rows = t.rows.map(rowCells)
    messages.push({
      text: t.key + ' team',
      threadPng: { name: t.key + '-team', title: t.key + ' team', get base64() { return teamPicture(t) } },
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: t.key + ' team' } },
        { type: 'context', elements: [{ type: 'mrkdwn', text: 'Team ' + t.size + '  |  Revenue ' + money(t.rev) + '  |  Cost ' + money(t.cost) + '  |  ' + ebitLine(t) }] },
        { type: 'table', column_settings: colSet, rows: [heads.map(raw)].concat(rows) },
      ],
    })
  }
  const sm = opts && opts.seniorManagers
  if (sm && sm.rows.length) {
    const smRows = sm.rows.map(rowCells)
    messages.push({
      text: 'Senior managers',
      threadPng: { name: 'senior-managers', title: 'Senior managers', get base64() { return teamPicture(sm) } },
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: 'Senior managers' } },
        { type: 'context', elements: [{ type: 'mrkdwn', text: 'Each senior manager’s managers added up (AC, SR, VAS, Offline)  |  Revenue ' + money(sm.rev) + '  |  Cost ' + money(sm.cost) + '  |  ' + ebitLine(sm) }] },
        { type: 'table', column_settings: colSet, rows: [['Senior manager'].concat(heads.slice(1)).map(raw)].concat(smRows) },
      ],
    })
  }
  return { messages, totals: { revenue: tr, cost: tc, ebitda: te, profit, managers: all.length } }
}
