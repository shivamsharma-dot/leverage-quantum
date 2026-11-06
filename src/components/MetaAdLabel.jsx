import React, { useState } from 'react'
import { C } from '../ui/dashboardKit'
import { imgProxy } from '../lib/careersMetaAds'

const STATUS_TEXT = { ACTIVE: 'Live', PAUSED: 'Paused', ADSET_PAUSED: 'Paused', CAMPAIGN_PAUSED: 'Paused', ARCHIVED: 'Archived' }

// Row-hover rules, injected once. The "Open ad" button and the navy name only
// appear while the table row (or the label itself) is hovered, so a long column
// of ad names reads as plain text until you point at one.
const CSS = `
.mal{display:flex;align-items:center;gap:8px;width:100%;min-width:0}
.mal-name{color:inherit;text-decoration:none;flex:1 1 auto;min-width:0;display:inline-flex;align-items:center;gap:6px;transition:color .12s}
.mal-icon{flex-shrink:0;color:#94A3B8;display:inline-flex}
.mal-open{flex-shrink:0;opacity:0;pointer-events:none;font-size:11px;font-weight:700;color:#fff;background:${C.navy};padding:3px 9px;border-radius:999px;text-decoration:none;white-space:nowrap;transition:opacity .12s}
tr:hover .mal-name,.mal:hover .mal-name,.mal-name:focus-visible{color:${C.navy}}
tr:hover .mal-open,.mal:hover .mal-open,.mal-open:focus-visible,.mal-name:focus-visible ~ .mal-open{opacity:1;pointer-events:auto}
.mal-name:focus-visible,.mal-open:focus-visible{outline:2px solid ${C.blue};outline-offset:2px;border-radius:4px}
@media (hover:none){.mal-open{opacity:1;pointer-events:auto}}
@media (prefers-reduced-motion:reduce){.mal-name,.mal-open{transition:none}}
`
let cssInjected = false
function ensureCss() {
  if (cssInjected || typeof document === 'undefined') return
  const el = document.createElement('style')
  el.setAttribute('data-meta-ad-label', '')
  el.textContent = CSS
  document.head.appendChild(el)
  cssInjected = true
}

function PlatformIcon({ platform }) {
  const p = { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }
  if (platform === 'instagram') return (
    <svg {...p} aria-label="Instagram ad"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" /></svg>
  )
  if (platform === 'facebook') return (
    <svg {...p} aria-label="Facebook ad"><path d="M15 3h-2.5A3.5 3.5 0 0 0 9 6.5V9H7v3h2v9h3v-9h2.5l.5-3h-3V7a1 1 0 0 1 1-1H15z" /></svg>
  )
  return (
    <svg {...p} aria-label="Meta ad"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 15l3-3 2 2 4-4" /></svg>
  )
}

// An ad name with a small platform icon. Hovering the row turns the name navy and
// shows an "Open ad" button; clicking the name or the button opens the real Meta ad
// (Instagram post, Facebook post or the Ads Library page). Hovering the name also
// shows the ad picture. Plain text when Meta has no match. Used by Leverage Careers
// and Overall.
export default function MetaAdLabel({ name, meta }) {
  const [pos, setPos] = useState(null)
  if (!meta) return name
  ensureCss()
  const statusText = STATUS_TEXT[meta.status] || ''
  const title = 'Open this ad on Meta' + (statusText ? ' (' + statusText + ')' : '')
  const show = e => { const r = e.currentTarget.getBoundingClientRect(); setPos({ x: r.left, y: r.bottom }) }
  const hide = () => setPos(null)
  return (
    <span className="mal">
      <a className="mal-name" href={meta.link} target="_blank" rel="noreferrer" title={title}
        onClick={e => e.stopPropagation()} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
        <span className="mal-icon"><PlatformIcon platform={meta.platform} /></span>
        <span>{name}</span>
      </a>
      <a className="mal-open" href={meta.link} target="_blank" rel="noreferrer" title={title} onClick={e => e.stopPropagation()}>
        Open ad {'↗'}
      </a>
      {pos && meta.image && (
        <span style={{ position: 'fixed', left: Math.min(pos.x, window.innerWidth - 250), top: Math.min(pos.y + 8, window.innerHeight - 270), zIndex: 700, width: 232, background: '#fff', border: '0.5px solid #E2E8F0', borderRadius: 12, boxShadow: '0 8px 28px rgba(15,23,42,0.18)', padding: 8, pointerEvents: 'none' }}>
          <img src={imgProxy(meta.image)} alt="" style={{ width: '100%', height: 216, objectFit: 'cover', borderRadius: 8, display: 'block', background: '#F1F5F9' }} />
          {statusText ? <span style={{ display: 'block', marginTop: 6, fontSize: 10.5, fontWeight: 700, color: meta.status === 'ACTIVE' ? '#4CAE6F' : '#64748B' }}>{statusText}</span> : null}
        </span>
      )}
    </span>
  )
}
