import React from 'react'

// Custom-styled month picker -- replaces native <input type="month">, per the
// house rule (Dropdowns/date pickers are always custom-styled, never native).
// Self-contained: manages its own open/close popover state, so a call site is
// just <MonthPicker value="2026-08" onChange={setX} placeholder="Month" />.
// value/onChange use the exact same 'YYYY-MM' string shape a native
// <input type="month"> already produced, so no storage-format change needed.
const C = {
  navy: '#1F3C84', navyBg: 'var(--navy-tint)',
  border: 'var(--card-border)', text: 'var(--text)', muted: 'var(--text3)',
}
const FONT = "'Plus Jakarta Sans','Inter',sans-serif"
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function parseYM(v) {
  if (!v) return null
  const [y, m] = v.split('-').map(Number)
  if (!y || !m) return null
  return { y, m: m - 1 }
}
function fmtYM(y, m) { return `${y}-${String(m + 1).padStart(2, '0')}` }
function labelYM(v) {
  const p = parseYM(v)
  return p ? `${MONTHS_SHORT[p.m]} ${p.y}` : ''
}

export default function MonthPicker({ value, onChange, placeholder = 'Pick a month' }) {
  const [open, setOpen] = React.useState(false)
  const today = new Date()
  const sel = parseYM(value)
  const [viewYear, setViewYear] = React.useState(sel ? sel.y : today.getFullYear())

  React.useEffect(() => { if (open && sel) setViewYear(sel.y) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const pick = m => { onChange(fmtYM(viewYear, m)); setOpen(false) }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8,
          border: '0.5px solid ' + (open ? C.navy : C.border), background: open ? C.navyBg : 'var(--card)',
          color: value ? C.text : C.muted, fontSize: 12.5, fontWeight: 700, fontFamily: FONT,
          cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
        {value ? labelYM(value) : placeholder}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 399 }} />
          <div style={{
            position: 'absolute', left: 0, top: 'calc(100% + 8px)', zIndex: 400, width: 220,
            background: 'var(--card)', border: '0.5px solid ' + C.border, borderRadius: 14,
            boxShadow: '0 20px 60px rgba(15,23,42,0.16), 0 4px 12px rgba(15,23,42,0.06)',
            overflow: 'hidden', padding: '14px 16px', fontFamily: FONT,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <button type="button" onClick={() => setViewYear(y => y - 1)} style={{ width: 26, height: 26, borderRadius: 7, border: '0.5px solid ' + C.border, background: 'var(--card)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{viewYear}</div>
              <button type="button" onClick={() => setViewYear(y => y + 1)} style={{ width: 26, height: 26, borderRadius: 7, border: '0.5px solid ' + C.border, background: 'var(--card)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
              {MONTHS_SHORT.map((mLabel, mIdx) => {
                const isSel = sel && sel.y === viewYear && sel.m === mIdx
                return (
                  <button key={mLabel} type="button" onClick={() => pick(mIdx)}
                    style={{
                      padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                      background: isSel ? C.navy : 'var(--bg3)', color: isSel ? '#fff' : C.text,
                      fontSize: 12, fontWeight: isSel ? 700 : 600, fontFamily: FONT, transition: 'background .1s',
                    }}
                    onMouseOver={e => { if (!isSel) e.currentTarget.style.background = C.navyBg }}
                    onMouseOut={e => { if (!isSel) e.currentTarget.style.background = 'var(--bg3)' }}
                  >
                    {mLabel}
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
