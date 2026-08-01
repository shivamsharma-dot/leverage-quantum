import React, { useState, useRef, useEffect } from 'react'

// Shared custom dropdown. House rule: Quantum never uses a native <select>.
// Options may be plain values or { value, label } objects.
// Every colour comes from the theme tokens in index.css, so this renders
// correctly under light / dark / navy / stone.
const NAVY = '#1F3C84'
const NAVY_TINT = '#E8EFF9'

function Dropdown({ options = [], value, onChange, label, minWidth = 100, disabled }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const items = options.map(o => (o && typeof o === 'object' ? o : { value: o, label: o }))
  const current = items.find(o => o.value === value)

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} ref={ref}>
      {label && <span style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{label}</span>}
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 12px', borderRadius: 8,
            border: '0.5px solid ' + (open ? NAVY : 'var(--card-border)'),
            background: open ? NAVY_TINT : 'var(--card)',
            color: open ? NAVY : 'var(--text)',
            cursor: disabled ? 'default' : 'pointer',
            opacity: disabled ? 0.55 : 1,
            fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
            minWidth, whiteSpace: 'nowrap', transition: 'all .15s'
          }}
        >
          <span style={{ flex: 1, textAlign: 'left' }}>{current ? current.label : value}</span>
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none"
            style={{ flexShrink: 0, transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
            <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {open && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 500,
            background: 'var(--card)', border: '0.5px solid var(--card-border)',
            borderRadius: 12, boxShadow: '0 16px 40px rgba(15,23,42,0.14), 0 2px 8px rgba(15,23,42,0.06)',
            padding: 6, minWidth: Math.max(minWidth, 150),
            maxHeight: 280, overflowY: 'auto', scrollbarWidth: 'none'
          }}>
            {items.map(opt => {
              const active = opt.value === value
              return (
                <button
                  key={String(opt.value)}
                  type="button"
                  onClick={() => { onChange(opt.value); setOpen(false) }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg3)' }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '8px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: 12.5, fontWeight: active ? 700 : 400,
                    background: active ? NAVY_TINT : 'transparent',
                    color: active ? NAVY : 'var(--text)',
                    transition: 'background .1s, color .1s'
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    {opt.label}
                    {active && (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                        stroke={NAVY} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default Dropdown
