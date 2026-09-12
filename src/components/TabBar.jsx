import React from 'react'
import { useTabs } from '../lib/tabsContext'

const C = { navy: '#1F3C84' }
const FONT = "'Plus Jakarta Sans','Inter',sans-serif"

// Fixed strip at the very top of the viewport, above every page's own header --
// desktop only (hidden ≤768px via CSS, see .lq-tabbar in index.css; mobile already
// has its own hamburger topbar and drawer nav). Every page's outer ".lq-page-shell"
// wrapper gets a matching padding-top (also in index.css) so nothing is clipped --
// the exact same mechanism already used for the mobile topbar, just unconditional
// on desktop widths instead of gated to a media query, extended here to apply
// there too. Renders null (and the CSS padding-top rule has nothing to push
// against, harmlessly) until at least one tab exists, i.e. once signed in.
export default function TabBar() {
  const { tabs, activeKey, activateTab, closeTab } = useTabs()
  if (!tabs.length) return null
  return (
    <div className="lq-tabbar" style={{
      position: 'fixed', top: 0, left: 0, right: 0, height: 36, zIndex: 3000,
      display: 'flex', alignItems: 'stretch', background: 'var(--card)',
      borderBottom: '0.5px solid var(--card-border)', boxShadow: '0 1px 3px rgba(15,23,42,0.06)',
      overflowX: 'auto', fontFamily: FONT,
    }}>
      {tabs.map(tab => {
        const active = tab.key === activeKey
        return (
          <div key={tab.key} onClick={() => activateTab(tab)} title={tab.label}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '0 8px 0 13px',
              cursor: 'pointer', flexShrink: 0, minWidth: 108, maxWidth: 190,
              borderRight: '0.5px solid var(--card-border)', boxSizing: 'border-box',
              background: active ? 'var(--bg3)' : 'transparent',
              borderTop: active ? '2px solid ' + C.navy : '2px solid transparent',
            }}>
            <span style={{
              fontSize: 12, fontWeight: active ? 800 : 600,
              color: active ? C.navy : 'var(--text2)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
            }}>{tab.label}</span>
            <button type="button" onClick={e => { e.stopPropagation(); closeTab(tab.key) }} title="Close tab"
              style={{
                border: 'none', background: 'transparent', cursor: 'pointer', flexShrink: 0,
                color: 'var(--text3)', display: 'flex', alignItems: 'center', padding: 3, borderRadius: 5,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--card-border)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )
      })}
    </div>
  )
}
