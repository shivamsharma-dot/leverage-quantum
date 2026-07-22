// ---------------------------------------------------------------------------
// shared/brandLogo.mjs
//
// SINGLE SOURCE OF TRUTH for Quantum's 3-bar ascending logo mark.
// Every place that renders the logo MUST match this exact geometry + color
// order. If you ever change it, update THIS FILE FIRST, then re-sync every
// consumer listed below before considering the change done:
//
//   - src/components/Sidebar.jsx        (imports BRAND_LOGO_BARS directly, JSX <rect> per bar)
//   - src/pages/MetaAdsDashboard.jsx     (imports brandLogoSvgMarkup(), Creative Report export)
//   - api/send-report.js                (email templates — table-cell/div technique for
//                                         email-client compatibility, can't import this ESM
//                                         file safely from a serverless .js handler, so the
//                                         bar heights/colors are duplicated as literals there.
//                                         MUST stay byte-identical: green 9px / blue 14px /
//                                         navy 17px, in that order.)
//   - public/icon.svg + icon-*.png       (static PWA icon assets, scaled up from this same
//                                         geometry — regenerate them if this file changes)
// ---------------------------------------------------------------------------

export const BRAND_LOGO_VIEWBOX = '0 0 22 22'
export const BRAND_LOGO_BASELINE = 19.5 // every bar's (y + height) must equal this
export const BRAND_LOGO_RX = 1.5

// x, y, width, height all share the baseline above. Order is fixed: green -> blue -> navy.
export const BRAND_LOGO_BARS = [
  { x: 3,  y: 10.5, w: 4, h: 9,  color: '#4CAE6F' }, // green
  { x: 9,  y: 5.5,  w: 4, h: 14, color: '#1C9FD4' }, // blue
  { x: 15, y: 2.5,  w: 4, h: 17, color: '#1F3C84' }, // navy
]

export function brandLogoSvgMarkup(size = 22) {
  const bars = BRAND_LOGO_BARS
    .map(b => `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${BRAND_LOGO_RX}" fill="${b.color}"/>`)
    .join('')
  return `<svg width="${size}" height="${size}" viewBox="${BRAND_LOGO_VIEWBOX}" fill="none" xmlns="http://www.w3.org/2000/svg">${bars}</svg>`
}
