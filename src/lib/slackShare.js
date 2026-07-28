import { toPng } from 'html-to-image'

// Renders a live DOM node (a dashboard table) to a PNG data URL, so a wide table can be
// posted to Slack exactly as it looks on screen. Slack has no table primitive and its
// text blocks cap at 3000 characters, so a 20+ column table cannot be sent truthfully
// as a monospace code block -- it gets cut mid-row.
//
// pixelRatio walks down 2 -> 1.5 -> 1: the PNG travels base64-encoded inside the JSON
// body of a Vercel serverless request (~4.5MB cap), and a very tall table has to give
// up some sharpness rather than fail the send outright. A ratio that throws (canvas
// dimension limits on a very large table) is skipped the same way.
export async function captureNodePng(node, opts = {}) {
  const maxBytes = opts.maxBytes || 3200000
  let best = null
  for (const pixelRatio of (opts.ratios || [2, 1.5, 1])) {
    try {
      const dataUrl = await toPng(node, {
        pixelRatio,
        backgroundColor: '#FFFFFF',
        cacheBust: true,
        style: { padding: '18px' },
      })
      const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
      best = { base64, pixelRatio, bytes: Math.round(base64.length * 0.75) }
      if (best.bytes <= maxBytes) return best
    } catch (_) { /* try a smaller scale */ }
  }
  return best
}

// Minimal RFC4180 CSV -- every cell quoted, embedded quotes doubled.
export function rowsToCsv(columns, rows) {
  const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'
  return [columns.map(esc).join(','), ...rows.map(r => columns.map(c => esc(r[c])).join(','))].join('\r\n')
}

// A React state change (e.g. lifting a row limit to "all" so every row is in the shot)
// is async, and html-to-image reads the DOM synchronously -- two frames plus a short
// settle lets layout and webfonts land before the capture.
export function nextPaint(ms = 220) {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, ms))))
}
