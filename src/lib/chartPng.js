// Slack's own chart block cannot be given a colour and will not print the value
// on a bar. The CEO reads this report on a phone, where an unlabelled shape says
// nothing at all. So we draw the chart ourselves on a canvas -- brand ramp, the
// number written on every bar and every slice, type sized for a small screen --
// and send that image. Slack's native block stays behind it as a fallback.

const RAMP = ['#1F3C84', '#1C9FD4', '#29B9C3', '#4CAE6F', '#3A5BA0', '#52B5DC', '#5BCAD2', '#73C58E']
const INK = '#0F1B33'
const SUB = '#8A94A6'
const GRID = '#E8ECF3'
const AXIS = '#CBD3E1'
const FONT = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

const inr = n => '\u20b9' + Math.round(n).toLocaleString('en-IN')

function money(n) {
  const a = Math.abs(Number(n) || 0)
  if (a >= 1e7) return '\u20b9' + (n / 1e7).toFixed(2).replace(/\.00$/, '') + ' Cr'
  if (a >= 1e5) return '\u20b9' + (n / 1e5).toFixed(2).replace(/\.00$/, '') + ' L'
  return inr(n)
}

function fmt(v, unit) {
  const n = Number(v) || 0
  if (unit === 'pct') return (Math.round(n * 10) / 10) + '%'
  if (unit === 'inr') return Math.abs(n) >= 1e5 ? money(n) : inr(n)
  return n.toLocaleString('en-IN')
}

function surface(w, h) {
  const cv = document.createElement('canvas')
  cv.width = w * 2
  cv.height = h * 2
  const g = cv.getContext('2d')
  g.scale(2, 2)
  g.fillStyle = '#FFFFFF'
  g.fillRect(0, 0, w, h)
  g.textBaseline = 'alphabetic'
  return { cv, g }
}

function pill(g, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2))
  g.beginPath()
  g.moveTo(x + rr, y)
  g.arcTo(x + w, y, x + w, y + h, rr)
  g.arcTo(x + w, y + h, x, y + h, rr)
  g.arcTo(x, y + h, x, y, rr)
  g.arcTo(x, y, x + w, y, rr)
  g.closePath()
  g.fill()
}

// A round number just above the tallest bar, so the gridline labels read cleanly.
function ceiling(max) {
  if (!(max > 0)) return 1
  const p = Math.pow(10, Math.floor(Math.log10(max)))
  for (const k of [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]) if (p * k >= max) return p * k
  return p * 10
}

function ell(g, s, max) {
  const t = String(s == null ? '' : s)
  if (g.measureText(t).width <= max) return t
  let cut = t
  while (cut.length > 1 && g.measureText(cut + '\u2026').width > max) cut = cut.slice(0, -1)
  return cut + '\u2026'
}

function barPng(spec) {
  const c = spec.chart
  const unit = spec.unit
  const cats = (c.axis_config && c.axis_config.categories) || []
  const series = c.series || []
  if (!cats.length || !series.length) return null

  const W = 1080
  const H = 640
  const { cv, g } = surface(W, H)
  const x0 = 104
  const x1 = W - 44
  const y0 = 104
  const y1 = H - 176

  g.font = '700 27px ' + FONT
  g.fillStyle = INK
  g.textAlign = 'left'
  g.fillText(ell(g, spec.title, W - 80), 40, 52)

  const top = ceiling(Math.max.apply(null, series.flatMap(s => s.data.map(d => Number(d.value) || 0)).concat([0])))

  g.textAlign = 'right'
  g.font = '500 16px ' + FONT
  for (let i = 0; i <= 4; i++) {
    const y = Math.round(y1 - (y1 - y0) * (i / 4)) + 0.5
    g.strokeStyle = GRID
    g.lineWidth = 1
    g.beginPath()
    g.moveTo(x0, y)
    g.lineTo(x1, y)
    g.stroke()
    g.fillStyle = SUB
    g.fillText(fmt((top * i) / 4, unit), x0 - 14, y + 6)
  }

  const bars = cats.length * series.length
  const valueFont = bars > 12 ? 12 : bars > 8 ? 14 : 16
  const groupW = (x1 - x0) / cats.length
  const gap = series.length > 1 ? 7 : 0
  const barW = Math.max(8, Math.min(62, (groupW * 0.74 - gap * (series.length - 1)) / series.length))
  const span = barW * series.length + gap * (series.length - 1)

  cats.forEach((cat, ci) => {
    const cx = x0 + groupW * ci + groupW / 2
    series.forEach((s, si) => {
      const point = (s.data || []).find(p => p.label === cat)
      const v = point ? Number(point.value) || 0 : 0
      const h = Math.max(3, (y1 - y0) * (top ? v / top : 0))
      const bx = cx - span / 2 + si * (barW + gap)
      g.fillStyle = RAMP[si % RAMP.length]
      pill(g, bx, y1 - h, barW, h, 5)
      g.fillStyle = INK
      g.font = '700 ' + valueFont + 'px ' + FONT
      g.textAlign = 'center'
      g.fillText(fmt(v, unit), bx + barW / 2, y1 - h - 10)
    })
    g.save()
    g.translate(cx, y1 + 18)
    g.rotate(-Math.PI / 7)
    g.fillStyle = SUB
    g.font = '600 16px ' + FONT
    g.textAlign = 'right'
    g.fillText(ell(g, cat, 190), 0, 0)
    g.restore()
  })

  g.strokeStyle = AXIS
  g.lineWidth = 1
  g.beginPath()
  g.moveTo(x0, y1 + 0.5)
  g.lineTo(x1, y1 + 0.5)
  g.stroke()

  let lx = 40
  const ly = H - 32
  g.font = '600 16px ' + FONT
  g.textAlign = 'left'
  series.forEach((s, si) => {
    g.fillStyle = RAMP[si % RAMP.length]
    pill(g, lx, ly - 12, 14, 14, 4)
    g.fillStyle = INK
    g.fillText(s.name, lx + 22, ly)
    lx += 22 + g.measureText(s.name).width + 28
  })

  return cv.toDataURL('image/png').split(',')[1]
}

function piePng(spec) {
  const segs = (spec.chart.segments || []).filter(s => Number(s.value) > 0)
  if (!segs.length) return null

  const W = 1080
  const H = Math.max(480, 150 + segs.length * 46)
  const { cv, g } = surface(W, H)

  g.font = '700 27px ' + FONT
  g.fillStyle = INK
  g.textAlign = 'left'
  g.fillText(ell(g, spec.title, W - 80), 40, 52)

  const total = segs.reduce((a, s) => a + (Number(s.value) || 0), 0) || 1
  const cx = 280
  const cy = H / 2 + 26
  const r = Math.min(170, (H - 160) / 2)
  let a0 = -Math.PI / 2

  segs.forEach((s, i) => {
    const frac = (Number(s.value) || 0) / total
    const a1 = a0 + frac * Math.PI * 2
    g.beginPath()
    g.moveTo(cx, cy)
    g.arc(cx, cy, r, a0, a1)
    g.closePath()
    g.fillStyle = RAMP[i % RAMP.length]
    g.fill()
    g.strokeStyle = '#FFFFFF'
    g.lineWidth = 2
    g.stroke()
    if (frac >= 0.08) {
      const mid = (a0 + a1) / 2
      g.fillStyle = '#FFFFFF'
      g.font = '700 18px ' + FONT
      g.textAlign = 'center'
      g.fillText((frac * 100).toFixed(1) + '%', cx + Math.cos(mid) * r * 0.62, cy + Math.sin(mid) * r * 0.62 + 6)
    }
    a0 = a1
  })

  let ly = cy - (segs.length * 46) / 2 + 22
  segs.forEach((s, i) => {
    g.fillStyle = RAMP[i % RAMP.length]
    pill(g, 540, ly - 14, 15, 15, 4)
    g.fillStyle = INK
    g.font = '700 18px ' + FONT
    g.textAlign = 'left'
    g.fillText(ell(g, s.label, 460), 568, ly)
    g.fillStyle = SUB
    g.font = '500 17px ' + FONT
    g.fillText(fmt(s.value, spec.unit) + '  \u00b7  ' + (((Number(s.value) || 0) / total) * 100).toFixed(1) + '%', 568, ly + 22)
    ly += 46
  })

  return cv.toDataURL('image/png').split(',')[1]
}

// Base64 with no data: prefix -- that is what the Slack upload wants.
export function chartPng(spec) {
  try {
    if (!spec || !spec.chart || typeof document === 'undefined') return null
    if (spec.chart.type === 'pie') return piePng(spec)
    if (spec.chart.type === 'bar') return barPng(spec)
    return null
  } catch (e) {
    return null
  }
}

export function chartPngUrl(spec) {
  const b64 = chartPng(spec)
  return b64 ? 'data:image/png;base64,' + b64 : null
}
