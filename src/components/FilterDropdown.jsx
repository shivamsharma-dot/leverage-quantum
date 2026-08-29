import React from 'react'

// Shared compact filter dropdown (button + popover). Originally local to
// MetaAdsDashboard.jsx's Creatives tab (Format/Health/Status/Sort filters);
// promoted here so Google Ads / QL Ops / Overall can reuse the exact same
// control for the new Corridor/Category filters instead of copy-pasting it.
export default function FilterDropdown({ label, value, options, open, onToggle, onSelect, accentOf, borderColor }) {
  // Defensive: a caller populating options asynchronously (e.g. from an API call still in
  // flight) can render this with an empty array for a frame -- options[0] would be
  // undefined and current.l would throw. Falls back to a harmless placeholder instead.
  const current = options.find(o => o.v === value) || options[0] || { v: value, l: '…' }
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button type="button" onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 11, border: '0.5px solid ' + (open ? '#1C9FD4' : (borderColor || '#E5E7EB')), background: '#fff', cursor: 'pointer', fontSize: 13.5, fontWeight: 500, fontFamily: 'inherit', color: '#374151', whiteSpace: 'nowrap' }}>
        <span style={{ color: '#9CA3AF', fontWeight: 600 }}>{label}:</span>
        <span style={{ fontWeight: 600, color: accentOf ? accentOf(value) : '#374151' }}>{current.l}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .15s' }}><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && <div onClick={() => onToggle()} style={{ position: 'fixed', inset: 0, zIndex: 150 }} />}
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 200, minWidth: 130, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, boxShadow: '0 12px 32px -8px rgba(15,23,42,0.22)', padding: 4, overflow: 'hidden' }}>
          {options.map(o => (
            <button key={o.v} type="button" onClick={() => onSelect(o.v)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', textAlign: 'left', padding: '7px 9px', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: value === o.v ? 700 : 500, fontFamily: 'inherit', color: value === o.v ? '#1F3C84' : '#374151', background: value === o.v ? '#E8EFF9' : 'transparent' }}
              onMouseEnter={e => { if (value !== o.v) e.currentTarget.style.background = '#F3F4F6' }}
              onMouseLeave={e => { if (value !== o.v) e.currentTarget.style.background = 'transparent' }}>
              <span>{o.l}</span>
              {value === o.v && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1C9FD4" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
