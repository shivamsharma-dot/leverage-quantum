// Leverage Careers: match each ad (the Careers "campaign" name IS the Meta ad name)
// to its Meta ad, so a row can open the real ad and a downloadable report can show
// the creative. Only a link and a picture come from Meta; every number on the page
// and in the report stays the Careerv2 BigQuery figure.
import { brandLogoSvgMarkup } from '../../shared/brandLogo.mjs'

let _cache = null

// Returns { ok, ads: { [adName]: { id, status, link, platform, image, video } }, error? }
export async function fetchCareersMetaAds(force) {
  if (_cache && !force) return _cache
  try {
    const r = await fetch('/api/crm-leads?source=careers_meta_ads' + (force ? '&refresh=1' : ''), { credentials: 'same-origin' })
    if (!r.ok) return { ok: false, ads: {}, error: 'Meta lookup failed (' + r.status + ')' }
    const j = await r.json()
    if (j && j.ok) _cache = j
    return j || { ok: false, ads: {} }
  } catch (e) {
    return { ok: false, ads: {}, error: String((e && e.message) || e) }
  }
}

export const imgProxy = url => (url ? '/api/img-proxy?url=' + encodeURIComponent(url) : null)

// Fetch a Meta picture and shrink it to a small JPEG data URI, so the report file
// stays viewable after Meta's links expire without every ad adding ~400KB.
export async function fetchImageDataUri(url, maxSide = 480) {
  if (!url) return null
  try {
    const res = await fetch(imgProxy(url), { credentials: 'same-origin' })
    if (!res.ok) return null
    const blob = await res.blob()
    const bmp = await createImageBitmap(blob)
    const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
    const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k))
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h
    cv.getContext('2d').drawImage(bmp, 0, 0, w, h)
    return cv.toDataURL('image/jpeg', 0.82)
  } catch {
    return null
  }
}

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const inr = n => (n == null ? '-' : '&#8377;' + Math.round(n).toLocaleString('en-IN'))
const num = n => Math.round(n || 0).toLocaleString('en-IN')
const STATUS_LABEL = { ACTIVE: 'Live', PAUSED: 'Paused', ADSET_PAUSED: 'Paused', CAMPAIGN_PAUSED: 'Paused', ARCHIVED: 'Archived' }

// ads: [{ name, program, spend, leads, interested, won, cpl, cpi, cps, meta: {link,status,video}, _img }]
export function buildCareersCreativeReportHtml({ ads, totals, windowLabel, filterChips, omitted }) {
  const cards = ads.map(a => {
    const m = a.meta || {}
    const st = STATUS_LABEL[m.status] || ''
    const thumb = a._img
      ? '<img src="' + a._img + '" alt="" />'
      : '<div class="ph"></div>'
    const play = m.video
      ? '<div class="playicon"><svg width="30" height="30" viewBox="0 0 24 24" fill="rgba(255,255,255,0.92)"><circle cx="12" cy="12" r="11" fill="rgba(0,0,0,0.28)"/><path d="M10 8l6 4-6 4V8z"/></svg></div>'
      : ''
    return '<div class="card">' +
      '<div class="thumb">' + thumb + (st ? '<span class="badge ' + (m.status === 'ACTIVE' ? 'live' : 'off') + '">' + st + '</span>' : '') + play + '</div>' +
      '<div class="card-body">' +
      '<a class="card-link" href="' + esc(m.link || '#') + '" target="_blank" rel="noreferrer" title="' + esc(a.name) + '">' + esc(a.name) + '</a>' +
      (a.program ? '<div class="prog">' + esc(a.program) + '</div>' : '') +
      '<div class="stats">' +
      '<div><div class="sl">Spend</div><div class="sv">' + inr(a.spend) + '</div></div>' +
      '<div><div class="sl">Leads</div><div class="sv">' + num(a.leads) + '</div></div>' +
      '<div><div class="sl">Interested</div><div class="sv">' + num(a.interested) + '</div></div>' +
      '<div><div class="sl">CPL</div><div class="sv acc">' + inr(a.cpl) + '</div></div>' +
      '<div><div class="sl">CPI</div><div class="sv acc">' + inr(a.cpi) + '</div></div>' +
      '<div><div class="sl">CPS</div><div class="sv acc">' + inr(a.cps) + '</div></div>' +
      '<div><div class="sl">Won</div><div class="sv">' + num(a.won) + '</div></div>' +
      '</div></div></div>'
  }).join('')
  const chips = (filterChips || []).map(c => '<span class="chip">' + esc(c) + '</span>').join('')
  const omit = omitted > 0
    ? '<div class="note">The totals above cover the ' + ads.length + ' ads shown. ' + omitted + ' more ad' + (omitted === 1 ? '' : 's') + ' in this window are left out (no matching Meta ad, or beyond the ' + ads.length + ' ad cap).</div>'
    : ''
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Leverage Careers - Meta ad creative report</title><style>' +
`* { box-sizing:border-box; }
body { margin:0; font-family:'Plus Jakarta Sans','Inter',-apple-system,sans-serif; background:#F4F6F9; color:#0F172A; padding:28px 32px 36px; }
.report { max-width:1180px; margin:0 auto; background:#fff; border-radius:16px; border:0.5px solid #E2E8F0; padding:28px 32px 36px; box-shadow:0 1px 3px rgba(15,23,42,0.06); }
.head { display:flex; align-items:center; justify-content:space-between; border-bottom:2px solid #F1F5F9; padding-bottom:18px; margin-bottom:20px; flex-wrap:wrap; gap:14px; }
.brand { display:flex; align-items:center; gap:12px; }
.logo { width:44px; height:44px; border-radius:12px; background:#fff; box-shadow:0 1px 3px rgba(15,23,42,0.12), 0 0 0 1px #EEF1F6; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.wm { font-size:19px; font-weight:800; letter-spacing:0.06em; margin:0; background:linear-gradient(92deg,#1F3C84 0%,#1C9FD4 55%,#29B9C3 100%); -webkit-background-clip:text; background-clip:text; color:transparent; }
.ttl { font-size:12.5px; font-weight:700; color:#64748B; margin:2px 0 0; }
.sub { font-size:11px; color:#94A3B8; margin:1px 0 0; }
.chips { display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; }
.chip { font-size:10.5px; font-weight:700; padding:3px 9px; border-radius:6px; background:#F8FAFC; color:#64748B; border:0.5px solid #EEF1F6; }
.summary { display:grid; grid-template-columns:repeat(auto-fill,minmax(120px,1fr)); gap:10px; margin-bottom:24px; }
.tile { background:#F8FAFC; border-radius:10px; padding:11px 14px; }
.tl { font-size:9.5px; font-weight:700; color:#94A3B8; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px; }
.tv { font-size:16px; font-weight:800; color:#0F172A; }
.note { font-size:11.5px; color:#64748B; background:#F8FAFC; border-radius:8px; padding:8px 12px; margin-bottom:16px; }
.grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:16px; }
.card { border:0.5px solid #EEF1F6; border-radius:12px; overflow:hidden; box-shadow:0 1px 3px rgba(15,23,42,0.05); }
.thumb { position:relative; width:100%; aspect-ratio:1/1; overflow:hidden; background:#F1F5F9; }
.thumb img, .thumb .ph { width:100%; height:100%; object-fit:cover; display:block; }
.thumb .ph { background:linear-gradient(135deg,#1F3C84,#1C9FD4); }
.badge { position:absolute; top:8px; left:8px; font-size:9px; font-weight:800; letter-spacing:0.03em; text-transform:uppercase; padding:3px 8px; border-radius:6px; color:#fff; }
.badge.live { background:#4CAE6F; } .badge.off { background:#64748B; }
.playicon { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; pointer-events:none; }
.card-body { padding:12px 13px 14px; }
.card-link { font-size:12px; font-weight:700; color:#1F3C84; text-decoration:none; display:block; margin-bottom:4px; line-height:1.4; word-break:break-word; }
.card-link:hover { text-decoration:underline; }
.prog { font-size:10px; font-weight:700; color:#1C9FD4; margin-bottom:9px; }
.stats { display:grid; grid-template-columns:repeat(3,1fr); gap:7px 8px; }
.sl { font-size:8.5px; font-weight:700; color:#94A3B8; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:2px; }
.sv { font-size:12px; font-weight:800; color:#0F172A; }
.sv.acc { color:#1F3C84; }
.foot { margin-top:26px; padding-top:16px; border-top:0.5px solid #F1F5F9; text-align:center; font-size:10.5px; color:#94A3B8; }
@media (max-width:640px){ body{padding:12px;} .report{padding:18px 14px 24px;} }
</style></head><body><div class="report">
<div class="head"><div class="brand"><div class="logo">` + brandLogoSvgMarkup(24) + `</div><div><p class="wm">QUANTUM</p><p class="ttl">Leverage Careers - Meta ad creative report</p><p class="sub">` + esc(windowLabel || '') + ' &middot; Generated ' + today + `</p></div></div><div class="chips">` + chips + `</div></div>
<div class="summary">
<div class="tile"><div class="tl">Spend</div><div class="tv">` + inr(totals.spend) + `</div></div>
<div class="tile"><div class="tl">Leads</div><div class="tv">` + num(totals.leads) + `</div></div>
<div class="tile"><div class="tl">Interested</div><div class="tv">` + num(totals.interested) + `</div></div>
<div class="tile"><div class="tl">Won (Funnel)</div><div class="tv">` + num(totals.won) + `</div></div>
<div class="tile"><div class="tl">CPL</div><div class="tv">` + inr(totals.cpl) + `</div></div>
<div class="tile"><div class="tl">CPI</div><div class="tv">` + inr(totals.cpi) + `</div></div>
<div class="tile"><div class="tl">CPS</div><div class="tv">` + inr(totals.cps) + `</div></div>
<div class="tile"><div class="tl">Ads shown</div><div class="tv">` + ads.length + `</div></div>
</div>` + omit + '<div class="grid">' + cards + `</div>
<div class="foot">Exported from <b style="color:#1F3C84;">Leverage Quantum</b> &middot; Ad names open the live ad on Meta &middot; All figures from the Careers data, Meta supplies only the picture and link</div>
</div></body></html>`
}
