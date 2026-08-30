import React from 'react'

// Custom-styled ISO-week picker -- replaces native <input type="week">, per
// the house rule (date pickers are always custom-styled, never native).
// Self-contained popover, same pattern as MonthPicker.jsx. value/onChange use
// the exact 'YYYY-Www' string shape a native <input type="week"> already
// produced (e.g. '2026-W34'), so no storage-format change needed anywhere
// this is wired up.
const C = {
  navy: '#1F3C84', navyBg: 'var(--navy-tint)', blue: '#1C9FD4',
  border: 'var(--card-border)', text: 'var(--text)', muted: 'var(--text3)',
}
const FONT = "'Plus Jakarta Sans','Inter',sans-serif"
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function mondayOf(d) {
  const x = new Date(d)
  const day = x.getDay()
  const diff = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + diff)
  x.setHours(0, 0, 0, 0)
  return x
}
function isoWeekKey(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNr = (t.getUTCDay() + 6) % 7
  t.setUTCDate(t.getUTCDate() - dayNr + 3)
  const firstThursday = new Date(Date.UTC(t.getUTCFullYear(), 0, 4))
  const week = 1 + Math.round((t - firstThursday) / (7 * 86400000))
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}
// Inverse of isoWeekKey -- the Monday of ISO week `w` in year `y`.
function mondayFromIsoWeek(y, w) {
  const jan4 = new Date(y, 0, 4)
  const jan4Monday = mondayOf(jan4)
  const d = new Date(jan4Monday)
  d.setDate(d.getDate() + (w - 1) * 7)
  return d
}
function parseWeekValue(v) {
  if (!v) return null
  const m = /^(\d{4})-W(\d{2})$/.exec(v)
  if (!m) return null
  return mondayFromIsoWeek(Number(m[1]), Number(m[2]))
}
const fmtShort = d => `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
function labelForWeek(v) {
  const mon = parseWeekValue(v)
  if (!mon) return ''
  const sun = new Date(mon); sun.setDate(sun.getDate() + 6)
  return `${fmtShort(mon)} – ${fmtShort(sun)}, ${sun.getFullYear()}`
}

function WeekCalMonth({ year, month, selectedMonday, hoveredMonday, onSelect, onHover }) {
  const first = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0).getDate()
  const startDow = first.getDay()
  const cells = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= lastDay; d++) cells.push(new Date(year, month, d))

  const activeMonday = hoveredMonday || selectedMonday
  const inActiveWeek = date => {
    if (!activeMonday || !date) return false
    const mon = mondayOf(date)
    return mon.getTime() === activeMonday.getTime()
  }

  return (
    <div style={{ width: 236 }}>
      <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 8, fontFamily: FONT }}>
        {MONTHS_SHORT[month]} {year}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 4 }}>
        {DAYS.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: C.muted, padding: '2px 0', fontFamily: FONT }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
        {cells.map((date, i) => {
          if (!date) return <div key={`e${i}`} />
          const active = inActiveWeek(date)
          const isSelectedWeek = selectedMonday && mondayOf(date).getTime() === selectedMonday.getTime()
          const today = new Date(); today.setHours(0, 0, 0, 0)
          const isToday = date.getTime() === today.getTime()
          const dow = date.getDay()
          const isMon = dow === 1
          const isSun = dow === 0
          let bg = 'transparent', color = C.text
          if (active) { bg = isSelectedWeek ? C.navy : C.navyBg; color = isSelectedWeek ? '#fff' : C.text }
          return (
            <button key={date.getTime()}
              type="button"
              onClick={() => onSelect(date)}
              onMouseEnter={() => onHover(date)}
              onMouseLeave={() => onHover(null)}
              style={{
                width: '100%', aspectRatio: '1', border: 'none', cursor: 'pointer',
                borderTopLeftRadius: isMon ? 6 : 0, borderBottomLeftRadius: isMon ? 6 : 0,
                borderTopRightRadius: isSun ? 6 : 0, borderBottomRightRadius: isSun ? 6 : 0,
                background: bg, color, fontSize: 11.5, fontWeight: isSelectedWeek ? 700 : isToday ? 600 : 400,
                fontFamily: FONT, position: 'relative', transition: 'background .1s',
              }}
            >
              {date.getDate()}
              {isToday && !active && (
                <span style={{ position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: '50%', background: C.blue, display: 'block' }} />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function WeekPicker({ value, onChange, placeholder = 'Pick a week' }) {
  const [open, setOpen] = React.useState(false)
  const selectedMonday = parseWeekValue(value)
  const today = new Date()
  const [viewYear, setViewYear] = React.useState(selectedMonday ? selectedMonday.getFullYear() : today.getFullYear())
  const [viewMonth, setViewMonth] = React.useState(selectedMonday ? selectedMonday.getMonth() : today.getMonth())
  const [hoveredMonday, setHoveredMonday] = React.useState(null)

  React.useEffect(() => {
    if (open && selectedMonday) { setViewYear(selectedMonday.getFullYear()); setViewMonth(selectedMonday.getMonth()) }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const goLeft = () => viewMonth === 0 ? (setViewYear(y => y - 1), setViewMonth(11)) : setViewMonth(m => m - 1)
  const goRight = () => viewMonth === 11 ? (setViewYear(y => y + 1), setViewMonth(0)) : setViewMonth(m => m + 1)

  const pick = date => { onChange(isoWeekKey(date)); setOpen(false) }
  const hover = date => setHoveredMonday(date ? mondayOf(date) : null)

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
        {value ? labelForWeek(value) : placeholder}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 399 }} />
          <div style={{
            position: 'absolute', left: 0, top: 'calc(100% + 8px)', zIndex: 400,
            background: 'var(--card)', border: '0.5px solid ' + C.border, borderRadius: 14,
            boxShadow: '0 20px 60px rgba(15,23,42,0.16), 0 4px 12px rgba(15,23,42,0.06)',
            overflow: 'hidden', padding: '16px 18px', fontFamily: FONT,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10 }}>
              <button type="button" onClick={goLeft} style={{ width: 26, height: 26, borderRadius: 7, border: '0.5px solid ' + C.border, background: 'var(--card)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <div style={{ flex: 1 }} />
              <button type="button" onClick={goRight} style={{ width: 26, height: 26, borderRadius: 7, border: '0.5px solid ' + C.border, background: 'var(--card)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            </div>
            <WeekCalMonth year={viewYear} month={viewMonth} selectedMonday={selectedMonday} hoveredMonday={hoveredMonday} onSelect={pick} onHover={hover} />
            <div style={{ fontSize: 11, color: C.muted, marginTop: 10, textAlign: 'center' }}>Click any day to pick its whole week (Mon–Sun)</div>
          </div>
        </>
      )}
    </div>
  )
}
