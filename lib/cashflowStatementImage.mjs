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
const COL = { label: 320, mtd: 180, ytd: 200 }
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

export function renderCashflowStatementPng(cf) {
  ensureFonts()
  const rows = (cf && cf.rows) || []
  const groupHeader = (cf && cf.groupHeader && cf.groupHeader.length) ? cf.groupHeader : ['', 'MTD', 'YTD']
  const subHeader = (cf && cf.subHeader && cf.subHeader.length) ? cf.subHeader : ['Particulars', 'Amount (INR CR.)', 'Amount (INR CR.)']
  const title = (cf && cf.title) || 'B2C Student Mobility'
  const contentW = COL.label + COL.mtd + COL.ytd

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
  const xLabel = PAD, xMtd = PAD + COL.label, xYtd = PAD + COL.label + COL.mtd
  plan.forEach(function (row) {
    if (row.type === 'gap') { y += GAP_H; return }
    const h = ROW_H
    if (row.type === 'title') {
      drawCellBorder(ctx, xLabel, y, contentW, h)
      drawText(ctx, title, xLabel + contentW / 2, y, h, 'center', true)
    } else if (row.type === 'group') {
      drawCellBorder(ctx, xMtd, y, COL.mtd, h)
      drawCellBorder(ctx, xYtd, y, COL.ytd, h)
      drawText(ctx, groupHeader[1] || 'MTD', xMtd + COL.mtd / 2, y, h, 'center', true)
      drawText(ctx, groupHeader[2] || 'YTD', xYtd + COL.ytd / 2, y, h, 'center', true)
    } else if (row.type === 'sub') {
      drawCellBorder(ctx, xLabel, y, COL.label, h)
      drawCellBorder(ctx, xMtd, y, COL.mtd, h)
      drawCellBorder(ctx, xYtd, y, COL.ytd, h)
      drawText(ctx, subHeader[0] || 'Particulars', xLabel + 10, y, h, 'left', false)
      drawText(ctx, subHeader[1] || 'Amount (INR CR.)', xMtd + COL.mtd / 2, y, h, 'center', false)
      drawText(ctx, subHeader[2] || 'Amount (INR CR.)', xYtd + COL.ytd / 2, y, h, 'center', false)
    } else {
      drawCellBorder(ctx, xLabel, y, COL.label, h)
      drawCellBorder(ctx, xMtd, y, COL.mtd, h)
      drawCellBorder(ctx, xYtd, y, COL.ytd, h)
      const bold = row.bold
      if (bold) drawText(ctx, row.r.label, xLabel + 10, y, h, 'left', true)
      else drawText(ctx, row.r.label, xMtd - 10, y, h, 'right', false)
      drawText(ctx, amt(row.r.mtd), xMtd + COL.mtd - 10, y, h, 'right', bold)
      drawText(ctx, amt(row.r.ytd), xYtd + COL.ytd - 10, y, h, 'right', bold)
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
  const groupHeader = (cf && cf.groupHeader) || []
  const subHeader = (cf && cf.subHeader) || []
  const esc = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"' }
  const header = [
    subHeader[0] || 'Particulars',
    [groupHeader[1], subHeader[1]].filter(Boolean).join(' ') || 'MTD',
    [groupHeader[2], subHeader[2]].filter(Boolean).join(' ') || 'YTD',
  ]
  const lines = [header.map(esc).join(',')]
  rows.forEach(function (r) { lines.push([r.label, amt(r.mtd), amt(r.ytd)].map(esc).join(',')) })
  return lines.join('\r\n')
}
