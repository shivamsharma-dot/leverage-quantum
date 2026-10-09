// Server-side (no browser) render of the exact same 'CF' tab statement that
// CeoB2CDashboard.jsx's CashflowStatementImage renders in-browser for the
// on-page 'sheet image' Slack version. That component only runs when an
// admin has the Cash Flow page open in a real browser -- the automated 3PM
// b2c_daily_report cron has no browser at all, so it could never produce
// that PNG on its own. This module draws the identical layout with plain
// Canvas 2D calls (@napi-rs/canvas, prebuilt native binaries -- no headless
// browser, no node-gyp/Cairo build step, works in a plain Vercel Node
// function) so BOTH the cron and the on-page "Send report now" button can
// post the same image, not just the native Slack table.
//
// Font: Arial itself is Apple/Microsoft-licensed and cannot be bundled in
// this public repo. Arimo (Google Fonts, Apache-2.0) is a metrically
// Arial-compatible substitute purpose-built for exactly this situation --
// the two static (non-variable) weights are bundled in lib/fonts/, fetched
// once via Google Fonts' legacy static-file CSS endpoint (old-browser User-
// Agent, so Google serves plain per-weight files instead of one variable
// font -- @napi-rs/canvas doesn't do variable-font instancing).
//
// Keep the layout rules here in lock-step with CashflowStatementImage's own
// (bold+underlined section totals, right-aligned indented items, blank
// spacer rows before -- and only before -- a section total after the
// first row) -- two renderers of the same data, so they must not drift.
import { createCanvas, GlobalFonts } from '@napi-rs/canvas'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let fontsReady = false
function ensureFonts() {
  if (fontsReady) return
  GlobalFonts.registerFromPath(path.join(__dirname, 'fonts/Arimo-Regular.woff'), 'Arimo')
  GlobalFonts.registerFromPath(path.join(__dirname, 'fonts/Arimo-Bold.woff'), 'Arimo Bold')
  fontsReady = true
}

const BOLD_LABELS = new Set(['Opening Balance :', 'Cash Inflow', 'Cash Outflow :', 'Closing Balance'])
const COL = { label: 320, val: 170 }
const PAD = 20
const ROW_H = 30
const GAP_H = 10
const FONT_SIZE = 13

function amt(n) { return (n == null || !isFinite(n)) ? '' : n.toFixed(2) }

// One text draw + (for bold rows) a manual underline stroke sized to the
// text's own measured width -- there is no CSS text-decoration in Canvas 2D.
function drawText(ctx, text, x, yTop, h, align, bold) {
  ctx.font = (bold ? FONT_SIZE : FONT_SIZE) + 'px ' + (bold ? '"Arimo Bold"' : 'Arimo')
  ctx.fillStyle = '#000'
  ctx.textAlign = align
  const ty = yTop + h / 2
  ctx.fillText(text, x, ty)
  if (!bold || !text) return
  const w = ctx.measureText(text).width
  let x0 = x, x1 = x
  if (align === 'left') { x0 = x; x1 = x + w }
  else if (align === 'right') { x0 = x - w; x1 = x }
  else { x0 = x - w / 2; x1 = x + w / 2 }
  const uy = ty + FONT_SIZE * 0.4
  ctx.strokeStyle = '#000'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x0, uy)
  ctx.lineTo(x1, uy)
  ctx.stroke()
}

function drawCellBorder(ctx, x, y, w, h) {
  ctx.strokeStyle = '#000'
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
}

// How many number columns, and each one's numbers -- r.vals when the sheet
// carries Finance's MTD / H2 / YTD / H1 block, the legacy r.mtd / r.ytd pair
// otherwise (same fallback as src/lib/b2cReport.js).
function nCols(cf) {
  const g = (cf && cf.groupHeader) || []
  const s = (cf && cf.subHeader) || []
  if (cf && Array.isArray(cf.columns) && cf.columns.length) return cf.columns.length
  return Math.max(g.length, s.length, 3) - 1
}
function valsOf(r, n) {
  const v = Array.isArray(r.vals) ? r.vals : [r.mtd, r.ytd]
  const out = []
  for (let i = 0; i < n; i++) out.push(v[i])
  return out
}

export function renderCashflowStatementPng(cf) {
  ensureFonts()
  const rows = (cf && cf.rows) || []
  const n = nCols(cf)
  const groupHeader = (cf && cf.groupHeader && cf.groupHeader.length) ? cf.groupHeader : ['', 'MTD', 'YTD']
  const subHeader = (cf && cf.subHeader && cf.subHeader.length) ? cf.subHeader : ['Particulars', 'Amount (INR CR.)', 'Amount (INR CR.)']
  const title = (cf && cf.title) || 'B2C Student Mobility'
  const contentW = COL.label + COL.val * n

  // Row plan first (title / gap / group header / sub header / data rows,
  // with a gap inserted before every bold row except the very first) so the
  // canvas can be sized exactly, before any drawing happens.
  const plan = [{ type: 'title' }, { type: 'gap' }, { type: 'group' }, { type: 'sub' }]
  rows.forEach(function (r, i) {
    const bold = BOLD_LABELS.has(r.label)
    if (bold && i > 0) plan.push({ type: 'gap' })
    plan.push({ type: 'data', r: r, bold: bold })
  })
  const contentH = plan.reduce(function (h, row) { return h + (row.type === 'gap' ? GAP_H : ROW_H) }, 0)
  const canvasW = contentW + PAD * 2
  const canvasH = contentH + PAD * 2

  const canvas = createCanvas(canvasW, canvasH)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvasW, canvasH)
  ctx.textBaseline = 'middle'

  let y = PAD
  const xLabel = PAD
  const xCol = function (i) { return PAD + COL.label + COL.val * i }
  plan.forEach(function (row) {
    if (row.type === 'gap') { y += GAP_H; return }
    const h = ROW_H
    if (row.type === 'title') {
      drawCellBorder(ctx, xLabel, y, contentW, h)
      drawText(ctx, title, xLabel + contentW / 2, y, h, 'center', true)
    } else if (row.type === 'group') {
      for (let i = 0; i < n; i++) {
        drawCellBorder(ctx, xCol(i), y, COL.val, h)
        drawText(ctx, groupHeader[i + 1] || '', xCol(i) + COL.val / 2, y, h, 'center', true)
      }
    } else if (row.type === 'sub') {
      drawCellBorder(ctx, xLabel, y, COL.label, h)
      drawText(ctx, subHeader[0] || 'Particulars', xLabel + 10, y, h, 'left', false)
      for (let i = 0; i < n; i++) {
        drawCellBorder(ctx, xCol(i), y, COL.val, h)
        drawText(ctx, subHeader[i + 1] || 'Amount (INR CR.)', xCol(i) + COL.val / 2, y, h, 'center', false)
      }
    } else {
      drawCellBorder(ctx, xLabel, y, COL.label, h)
      const bold = row.bold
      if (bold) drawText(ctx, row.r.label, xLabel + 10, y, h, 'left', true)
      else drawText(ctx, row.r.label, xCol(0) - 10, y, h, 'right', false)
      const v = valsOf(row.r, n)
      for (let i = 0; i < n; i++) {
        drawCellBorder(ctx, xCol(i), y, COL.val, h)
        drawText(ctx, amt(v[i]), xCol(i) + COL.val - 10, y, h, 'right', bold)
      }
    }
    y += h
  })

  return canvas.toBuffer('image/png')
}

// Minimal RFC4180 CSV of the same statement, for the file that rides
// alongside the PNG -- deliberately not importing src/lib/slackShare.js's
// own rowsToCsv here: that module also pulls in html-to-image (a browser
// library) at the top level, which has no business being evaluated in a
// server function even if the specific helper needed has no DOM dependency.
export function cashflowStatementCsv(cf) {
  const rows = (cf && cf.rows) || []
  const n = nCols(cf)
  const groupHeader = (cf && cf.groupHeader) || []
  const subHeader = (cf && cf.subHeader) || []
  const esc = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"' }
  const header = [subHeader[0] || 'Particulars']
  for (let i = 1; i <= n; i++) header.push([groupHeader[i], subHeader[i]].filter(Boolean).join(' ') || ('Column ' + i))
  const lines = [header.map(esc).join(',')]
  rows.forEach(function (r) { lines.push([r.label].concat(valsOf(r, n).map(amt)).map(esc).join(',')) })
  return lines.join('\r\n')
}
