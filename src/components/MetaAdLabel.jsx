import React, { useState } from 'react'
import { C } from '../ui/dashboardKit'
import { imgProxy } from '../lib/careersMetaAds'

const STATUS_TEXT = { ACTIVE: 'Live', PAUSED: 'Paused', ADSET_PAUSED: 'Paused', CAMPAIGN_PAUSED: 'Paused', ARCHIVED: 'Archived' }

// An ad name that opens the real Meta ad (Instagram post, Facebook post or the
// Ads Library page) in a new tab, with a small picture on hover so a person can
// see what the ad is about before clicking. Plain text when Meta has no match.
// Used by Leverage Careers and Overall.
export default function MetaAdLabel({ name, meta }) {
  const [pos, setPos] = useState(null)
  if (!meta) return name
  const statusText = STATUS_TEXT[meta.status] || ''
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <a
        href={meta.link} target="_blank" rel="noreferrer"
        onClick={e => e.stopPropagation()}
        onMouseEnter={e => { const r = e.currentTarget.getBoundingClientRect(); setPos({ x: r.left, y: r.bottom }) }}
        onMouseLeave={() => setPos(null)}
        style={{ color: C.navy, textDecoration: 'none', borderBottom: '1px dashed ' + C.blue, fontWeight: 600 }}
        title={'Open this ad on Meta' + (statusText ? ' (' + statusText + ')' : '')}
      >{name}<span style={{ marginLeft: 5, fontSize: 11, color: C.blue }}>{'↗'}</span></a>
      {pos && meta.image && (
        <span style={{ position: 'fixed', left: Math.min(pos.x, window.innerWidth - 250), top: Math.min(pos.y + 8, window.innerHeight - 270), zIndex: 700, width: 232, background: '#fff', border: '0.5px solid #E2E8F0', borderRadius: 12, boxShadow: '0 8px 28px rgba(15,23,42,0.18)', padding: 8, pointerEvents: 'none' }}>
          <img src={imgProxy(meta.image)} alt="" style={{ width: '100%', height: 216, objectFit: 'cover', borderRadius: 8, display: 'block', background: '#F1F5F9' }} />
          {statusText ? <span style={{ display: 'block', marginTop: 6, fontSize: 10.5, fontWeight: 700, color: meta.status === 'ACTIVE' ? '#4CAE6F' : '#64748B' }}>{statusText}</span> : null}
        </span>
      )}
    </span>
  )
}
