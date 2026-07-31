import React, { useState, useRef, useEffect } from 'react'

// Shared custom dropdown. House rule: Quantum never uses a native <select>.
// Options may be plain values or { value, label } objects.
function Dropdown({ options, value, onChange, minWidth = 100, disabled }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const current = options.find(o => (o.value ?? o) === value)
  return (
    <div style={{ position: 'relative', display: 'inline-block' }} ref={ref}>
      <button type="button" disabled={disabled} onClick={() => setOpen(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 6, border: '0.5px solid ' + (open ? '#1F3C84' : '#E5E7EB'), background: '#fff', color: '#374151', cursor: disabled ? 'default' : 'pointer', fontSize: 12, fontFamily: 'inherit', minWidth, whiteSpace: 'nowrap' }}>
        <span style={{ flex: 1, textAlign: 'left' }}>{current ? (current.label ?? current) : value}</span>
        <svg width="9" height="6" viewBox="0 0 10 6" fill="none" style={{ flexShrink: 0, transition: 'transform .15s', transform: open ? 'rotate(180deg)' : 'none' }}><path d="M1 1l4 4 4-4" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 200, background: '#fff', border: '0.5px solid #E5E7EB', borderRadius: 10, boxShadow: '0 12px 32px rgba(15,23,42,0.14)', padding: 5, minWidth: Math.max(minWidth, 140), maxHeight: 260, overflowY: 'auto' }}>
          {options.map(opt => {
            const v = opt.value ?? opt
            const isActive = v === value
            return (
              <button key={v} type="button" onClick={() => { onChange(v); setOpen(false) }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: isActive ? 700 : 400, background: isActive ? '#E8EFF9' : 'transparent', color: isActive ? '#1F3C84' : '#374151' }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#F8FAFC' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}>
                {opt.label ?? opt}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default Dropdown
