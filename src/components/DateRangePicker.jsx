import React from 'react'
import Button from './Button'

// Shared two-month range calendar. Lifted verbatim out of
// LeadQualificationDashboard so every dashboard gets the same picker
// instead of a native <input type="date">.
const C = {
  navy: '#1F3C84', navyBg: '#E8EFF9',
  border: 'var(--card-border)', text: 'var(--text)',
  muted: 'var(--text3)', sub: 'var(--text2)'
}
const FONT = "'Plus Jakarta Sans','Inter',sans-serif"

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAYS = ['Su','Mo','Tu','We','Th','Fr','Sa']

function CalMonth({ year, month, from, to, hovered, onSelect, onHover }) {
  const first   = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0).getDate()
  const startDow = first.getDay()
  const cells = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= lastDay; d++) cells.push(new Date(year, month, d))

  return (
    <div style={{ width: 220 }}>
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
          const ts = date.getTime()
          const fromTs = from ? from.getTime() : null
          const toTs   = (to || hovered) ? (to || hovered).getTime() : null
          const isFrom   = fromTs && ts === fromTs
          const isTo     = toTs && ts === toTs && from
          const inRange  = fromTs && toTs && ts > Math.min(fromTs,toTs) && ts < Math.max(fromTs,toTs)
          const today    = new Date(); today.setHours(0,0,0,0)
          const isToday  = ts === today.getTime()
          let bg = 'transparent', color = C.text, radius = 6
          if (isFrom || isTo) { bg = C.navy; color = 'var(--card)' }
          else if (inRange)   { bg = C.navyBg; color = C.navy }
          return (
            <button key={ts}
              onClick={() => onSelect(date)}
              onMouseEnter={() => onHover(date)}
              onMouseLeave={() => onHover(null)}
              style={{
                width: '100%', aspectRatio: '1', border: 'none', cursor: 'pointer',
                borderRadius: radius, background: bg, color,
                fontSize: 11.5, fontWeight: isFrom || isTo ? 700 : isToday ? 600 : 400,
                fontFamily: FONT, position: 'relative', transition: 'background .1s',
              }}
              onMouseOver={e => { if (!isFrom && !isTo && !inRange) e.currentTarget.style.background = 'var(--bg3)' }}
              onMouseOut={e => { if (!isFrom && !isTo && !inRange) e.currentTarget.style.background = bg }}>
              {date.getDate()}
              {isToday && !isFrom && !isTo && (
                <span style={{ position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: '50%', background: C.blue, display: 'block' }} />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const fmt = d => { if (!d) return ''; const y=d.getFullYear(),mo=String(d.getMonth()+1).padStart(2,'0'),dy=String(d.getDate()).padStart(2,'0'); return `${y}-${mo}-${dy}` }

function DateRangePicker({ from, to, onChange, onClose }) {
  const today = new Date(); today.setHours(0,0,0,0)
  const [viewYear,  setViewYear]  = React.useState(today.getFullYear())
  const [viewMonth, setViewMonth] = React.useState(today.getMonth())
  const [hovered,   setHovered]   = React.useState(null)
  const [selFrom,   setSelFrom]   = React.useState(from || null)
  const [selTo,     setSelTo]     = React.useState(to || null)
  const [step,      setStep]      = React.useState(from ? 'to' : 'from')

  
  const handleSelect = date => {
    if (step === 'from' || selTo) {
      setSelFrom(date); setSelTo(null); setStep('to')
    } else {
      if (date < selFrom) { setSelFrom(date); setSelTo(selFrom) }
      else { setSelTo(date) }
      setStep('from')
    }
  }

  const right = viewMonth === 11 ? { y: viewYear+1, m: 0 } : { y: viewYear, m: viewMonth+1 }
  const canApply = selFrom && selTo

  const NavBtn = ({ dir, onClick: oc }) => (
    <button onClick={oc} style={{
      width: 28, height: 28, borderRadius: 7, border: `0.5px solid ${C.border}`,
      background: 'var(--card)', cursor: 'pointer', display: 'flex', alignItems: 'center',
      justifyContent: 'center', color: C.sub, transition: 'background .1s',
    }}
    onMouseOver={e=>e.currentTarget.style.background='var(--bg3)'}
    onMouseOut={e=>e.currentTarget.style.background='var(--card)'}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        {dir==='left' ? <polyline points="15 18 9 12 15 6"/> : <polyline points="9 18 15 12 9 6"/>}
      </svg>
    </button>
  )

  const goLeft  = () => viewMonth===0 ? (setViewYear(y=>y-1), setViewMonth(11)) : setViewMonth(m=>m-1)
  const goRight = () => viewMonth===11? (setViewYear(y=>y+1), setViewMonth(0))  : setViewMonth(m=>m+1)

  return (
    <div style={{ padding: '16px 20px', fontFamily: FONT }}>
      {/* Status bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
        <div style={{
          flex: 1, padding: '6px 10px', borderRadius: 8, border: `1.5px solid ${step==='from'?C.navy:C.border}`,
          background: step==='from'?C.navyBg:'#FAFAFA', fontSize: 12, fontWeight: 600, color: selFrom?C.text:C.muted,
          fontFamily: FONT, cursor: 'pointer',
        }} onClick={() => setStep('from')}>
          {selFrom ? fmt(selFrom) : 'Start date'}
        </div>
        <svg width="16" height="10" viewBox="0 0 16 10" fill="none"><path d="M0 5h14M10 1l4 4-4 4" stroke={C.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        <div style={{
          flex: 1, padding: '6px 10px', borderRadius: 8, border: `1.5px solid ${step==='to'&&selFrom?C.navy:C.border}`,
          background: step==='to'&&selFrom?C.navyBg:'#FAFAFA', fontSize: 12, fontWeight: 600, color: selTo?C.text:C.muted,
          fontFamily: FONT, cursor: selFrom?'pointer':'default',
        }} onClick={() => selFrom && setStep('to')}>
          {selTo ? fmt(selTo) : 'End date'}
        </div>
      </div>

      {/* Nav + dual calendars */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12 }}>
        <NavBtn dir="left"  onClick={goLeft}/>
        <div style={{ flex: 1 }}/>
        <NavBtn dir="right" onClick={goRight}/>
      </div>
      <div style={{ display: 'flex', gap: 24 }}>
        <CalMonth year={viewYear} month={viewMonth} from={selFrom} to={selTo} hovered={step==='to'?hovered:null} onSelect={handleSelect} onHover={step==='to'?setHovered:()=>{}}/>
        <CalMonth year={right.y} month={right.m} from={selFrom} to={selTo} hovered={step==='to'?hovered:null} onSelect={handleSelect} onHover={step==='to'?setHovered:()=>{}}/>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTop: `0.5px solid #F1F5F9` }}>
        <Button size="sm" variant="secondary" onClick={() => { setSelFrom(null); setSelTo(null); setStep('from') }}>
          Clear
        </Button>
        <Button size="sm" onClick={() => canApply && onChange(fmt(selFrom), fmt(selTo))} disabled={!canApply}>
          Apply range
        </Button>
      </div>
    </div>
  )
}

export default DateRangePicker
