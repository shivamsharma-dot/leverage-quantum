import React, { useState } from 'react'
import { C } from '../ui/dashboardKit'
import { imgProxy } from '../lib/careersMetaAds'

const STATUS_TEXT = { ACTIVE: 'Live', PAUSED: 'Paused', ADSET_PAUSED: 'Paused', CAMPAIGN_PAUSED: 'Paused', ARCHIVED: 'Archived' }

// Hover rules, injected once. The name reads as plain text until you point at
// it; then it turns navy, gets a normal underline and a small arrow.
const CSS = `
.mal-name{color:inherit;text-decoration:none;transition:color .12s}
.mal-arrow{display:inline-block;margin-left:4px;font-size:11px;opacity:0;transition:opacity .12s}
.mal-name:hover,.mal-name:focus-visible{color:${C.navy};text-decoration:underline;text-underline-offset:3px}
.mal-name:hover .mal-arrow,.mal-name:focus-visible .mal-arrow{opacity:1}
.mal-name:focus-visible{outline:2px solid ${C.blue};outline-offset:2px;border-radius:4px}
@media (prefers-reduced-motion:reduce){.mal-name,.mal-arrow{transition:none}}
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

// An ad name that opens the real Meta ad (Instagram post, Facebook post or the Ads
// Library page). Plain text until hovered; hovering shows the ad picture. Plain text when Meta has no match. Used by Leverage Careers
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
    <span style={{ position: 'relative', display: 'inline' }}>
      <a className="mal-name" href={meta.link} target="_blank" rel="noreferrer" title={title}
        onClick={e => e.stopPropagation()} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
        {name}<span className="mal-arrow" aria-hidden="true">{'\u2197'}</span>
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
