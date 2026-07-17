import React from 'react'

/*
  CalculatorTool — floating calculator + scratch "rough sheet".
  Self-contained, mounted from the shared Sidebar so it appears on every
  page (same convention as SnapshotTool). Lives at the right edge of the
  screen, stacked above the Snapshot FAB so both floating tools share one
  side: hovering the edge tab (or the panel itself) slides it open; moving
  away closes it after a short delay. Click pins/unpins it open.
  Brand palette only: navy #1F3C84, blue #1C9FD4, cyan #29B9C3, green #4CAE6F.
*/

const FONT = "'Plus Jakarta Sans','Inter',sans-serif"
const NAVY = '#1F3C84'
const BLUE = '#1C9FD4'
const CYAN = '#29B9C3'
const INK = '#0F1F4B'

const NOTES_KEY = 'lq_scratch_notes'
const HISTORY_KEY = 'lq_calc_history'

function fmtNum(n) {
  if (!isFinite(n)) return 'Error'
  // Trim float noise (e.g. 0.1+0.2) without mangling deliberate long decimals.
  const rounded = Math.round(n * 1e10) / 1e10
  return String(rounded)
}

export default function CalculatorTool() {
  const [open, setOpen] = React.useState(false)
  const [pinned, setPinned] = React.useState(false)
  const [tab, setTab] = React.useState('calc')
  const closeTimer = React.useRef(null)

  const openPanel = () => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
    setOpen(true)
  }
  const scheduleClose = () => {
    if (pinned) return
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setOpen(false), 260)
  }
  const cancelClose = () => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
  }

  // ---- Calculator engine (standard 4-function calculator state machine —
  // no eval(), so arbitrary text can never be executed as code) ----
  const [display, setDisplay] = React.useState('0')
  const [expr, setExpr] = React.useState('')
  const [acc, setAcc] = React.useState(null)
  const [op, setOp] = React.useState(null)
  const [waiting, setWaiting] = React.useState(false)
  const [memory, setMemory] = React.useState(0)
  const [history, setHistory] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') } catch { return [] }
  })

  const pushHistory = (line) => {
    setHistory(h => {
      const next = [line, ...h].slice(0, 30)
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  const compute = (a, b, o) => {
    switch (o) {
      case '+': return a + b
      case '-': return a - b
      case '×': return a * b
      case '÷': return b === 0 ? NaN : a / b
      default: return b
    }
  }

  const inputDigit = (d) => {
    if (waiting || display === '0') {
      setDisplay(d)
      setWaiting(false)
    } else {
      setDisplay(display + d)
    }
  }
  const inputDot = () => {
    if (waiting) { setDisplay('0.'); setWaiting(false); return }
    if (!display.includes('.')) setDisplay(display + '.')
  }
  const clearAll = () => {
    setDisplay('0'); setExpr(''); setAcc(null); setOp(null); setWaiting(false)
  }
  const backspace = () => {
    if (waiting) return
    setDisplay(d => (d.length > 1 ? d.slice(0, -1) : '0'))
  }
  const toggleSign = () => setDisplay(d => (d.startsWith('-') ? d.slice(1) : d === '0' ? d : '-' + d))
  const percent = () => setDisplay(d => fmtNum(parseFloat(d) / 100))
  const sqrt = () => setDisplay(d => fmtNum(Math.sqrt(parseFloat(d))))
  const square = () => setDisplay(d => fmtNum(Math.pow(parseFloat(d), 2)))
  const reciprocal = () => setDisplay(d => fmtNum(1 / parseFloat(d)))

  const chooseOp = (nextOp) => {
    const cur = parseFloat(display)
    if (acc === null) {
      setAcc(cur)
      setExpr(`${fmtNum(cur)} ${nextOp}`)
    } else if (!waiting) {
      const result = compute(acc, cur, op)
      setAcc(result)
      setDisplay(fmtNum(result))
      setExpr(`${fmtNum(result)} ${nextOp}`)
    } else {
      setExpr(`${fmtNum(acc)} ${nextOp}`)
    }
    setOp(nextOp)
    setWaiting(true)
  }

  const equals = () => {
    if (op === null || acc === null) return
    const cur = parseFloat(display)
    const result = compute(acc, cur, op)
    pushHistory(`${fmtNum(acc)} ${op} ${fmtNum(cur)} = ${fmtNum(result)}`)
    setDisplay(fmtNum(result))
    setExpr('')
    setAcc(null)
    setOp(null)
    setWaiting(true)
  }

  const memClear = () => setMemory(0)
  const memRecall = () => { setDisplay(fmtNum(memory)); setWaiting(true) }
  const memAdd = () => setMemory(m => m + parseFloat(display))
  const memSub = () => setMemory(m => m - parseFloat(display))

  const clearHistory = () => { setHistory([]); try { localStorage.removeItem(HISTORY_KEY) } catch {} }

  // ---- Rough sheet (persisted scratch notes) ----
  const [notes, setNotes] = React.useState(() => {
    try { return localStorage.getItem(NOTES_KEY) || '' } catch { return '' }
  })
  React.useEffect(() => {
    try { localStorage.setItem(NOTES_KEY, notes) } catch {}
  }, [notes])

  const btn = (label, onClick, opts = {}) => (
    <button
      key={label}
      onClick={onClick}
      style={{
        padding: '11px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
        fontFamily: FONT, fontSize: 14.5, fontWeight: 700,
        background: opts.bg || '#F4F6F9', color: opts.color || INK,
        gridColumn: opts.span ? `span ${opts.span}` : undefined,
        transition: 'transform .08s ease, filter .12s ease',
      }}
      onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.96)')}
      onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
      onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
    >
      {label}
    </button>
  )

  return (
    <div data-snapshot-ignore="true" style={{ position: 'fixed', top: '38%', right: 0, transform: 'translateY(-50%)', zIndex: 700, fontFamily: FONT, display: 'flex', alignItems: 'center', flexDirection: 'row-reverse' }}>
      {/* Edge hover-trigger tab -- always visible, half-tucked at the right edge, above the Snapshot FAB */}
      <div
        onMouseEnter={openPanel}
        onMouseLeave={scheduleClose}
        onClick={() => { setPinned(p => !p); openPanel() }}
        title="Calculator & rough sheet"
        style={{
          width: 22, height: 64, borderRadius: '12px 0 0 12px', flexShrink: 0,
          background: `linear-gradient(180deg, ${NAVY}, ${BLUE})`,
          display: open ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', boxShadow: '-2px 0 10px rgba(31,60,132,0.28)',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="2" width="16" height="20" rx="2" />
          <line x1="8" y1="6" x2="16" y2="6" />
          <line x1="8" y1="11" x2="8" y2="11" />
          <line x1="12" y1="11" x2="12" y2="11" />
          <line x1="16" y1="11" x2="16" y2="11" />
          <line x1="8" y1="15" x2="8" y2="15" />
          <line x1="12" y1="15" x2="12" y2="15" />
          <line x1="16" y1="15" x2="16" y2="15" />
        </svg>
      </div>

      {open && (
        <div
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          style={{
            width: 288, maxHeight: '82vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
            background: 'var(--card)', border: '0.5px solid var(--card-border)', borderRadius: '16px 0 0 16px',
            boxShadow: '0 1px 2px rgba(15,23,42,0.06), 0 24px 48px -14px rgba(31,60,132,0.32), 0 4px 16px rgba(15,23,42,0.10)',
            animation: 'calcToolIn .16s cubic-bezier(0.22,1,0.36,1) both',
          }}
        >
          <style>{`@keyframes calcToolIn { from { opacity:0; transform:translateX(12px);} to { opacity:1; transform:translateX(0);} }`}</style>

          {/* Header: tabs + pin */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 10px 0' }}>
            <button onClick={() => setTab('calc')} style={{
              flex: 1, padding: '8px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
              fontFamily: FONT, fontSize: 12, fontWeight: 700, letterSpacing: '.02em',
              background: tab === 'calc' ? `linear-gradient(135deg, ${NAVY}, ${BLUE})` : 'transparent',
              color: tab === 'calc' ? '#fff' : '#94A3B8',
            }}>Calculator</button>
            <button onClick={() => setTab('notes')} style={{
              flex: 1, padding: '8px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
              fontFamily: FONT, fontSize: 12, fontWeight: 700, letterSpacing: '.02em',
              background: tab === 'notes' ? `linear-gradient(135deg, ${NAVY}, ${BLUE})` : 'transparent',
              color: tab === 'notes' ? '#fff' : '#94A3B8',
            }}>Rough Sheet</button>
            <button
              onClick={() => setPinned(p => !p)}
              title={pinned ? 'Unpin (auto-close on mouse leave)' : 'Pin open'}
              style={{
                width: 30, height: 30, borderRadius: 8, border: 'none', cursor: 'pointer', flexShrink: 0,
                background: pinned ? 'rgba(28,159,212,0.14)' : 'transparent',
                color: pinned ? BLUE : '#94A3B8', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill={pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="17" x2="12" y2="22" />
                <path d="M5 17h14l-1.5-1.5a2 2 0 01-.5-1.3V7a5 5 0 00-10 0v7.2a2 2 0 01-.5 1.3L5 17z" />
              </svg>
            </button>
            <button
              onClick={() => { setOpen(false); setPinned(false) }}
              title="Close"
              style={{ width: 30, height: 30, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'transparent', color: '#94A3B8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>

          {tab === 'calc' ? (
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
              {/* Display */}
              <div style={{
                background: 'linear-gradient(135deg, #0F1F4B, #1F3C84)', borderRadius: 12, padding: '14px 14px 12px',
                display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4,
              }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: 600, minHeight: 14 }}>{expr || ' '}</div>
                <div style={{ fontSize: 27, color: '#fff', fontWeight: 800, fontVariantNumeric: 'tabular-nums', wordBreak: 'break-all', textAlign: 'right' }}>{display}</div>
                {memory !== 0 && <div style={{ fontSize: 10, color: CYAN, fontWeight: 700 }}>M {fmtNum(memory)}</div>}
              </div>

              {/* Memory row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                {btn('MC', memClear, { bg: '#EEF1FB', color: NAVY })}
                {btn('MR', memRecall, { bg: '#EEF1FB', color: NAVY })}
                {btn('M+', memAdd, { bg: '#EEF1FB', color: NAVY })}
                {btn('M-', memSub, { bg: '#EEF1FB', color: NAVY })}
              </div>

              {/* Function row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                {btn('C', clearAll, { bg: '#FBEAEA', color: '#B91C1C' })}
                {btn('±', toggleSign, { bg: '#EEF1FB', color: NAVY })}
                {btn('%', percent, { bg: '#EEF1FB', color: NAVY })}
                {btn('←', backspace, { bg: '#EEF1FB', color: NAVY })}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                {btn('x²', square, { bg: '#EEF1FB', color: NAVY })}
                {btn('√x', sqrt, { bg: '#EEF1FB', color: NAVY })}
                {btn('1/x', reciprocal, { bg: '#EEF1FB', color: NAVY })}
                {btn('÷', () => chooseOp('÷'), { bg: 'rgba(28,159,212,0.12)', color: BLUE })}
              </div>

              {/* Numpad */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                {btn('7', () => inputDigit('7'))}
                {btn('8', () => inputDigit('8'))}
                {btn('9', () => inputDigit('9'))}
                {btn('×', () => chooseOp('×'), { bg: 'rgba(28,159,212,0.12)', color: BLUE })}
                {btn('4', () => inputDigit('4'))}
                {btn('5', () => inputDigit('5'))}
                {btn('6', () => inputDigit('6'))}
                {btn('-', () => chooseOp('-'), { bg: 'rgba(28,159,212,0.12)', color: BLUE })}
                {btn('1', () => inputDigit('1'))}
                {btn('2', () => inputDigit('2'))}
                {btn('3', () => inputDigit('3'))}
                {btn('+', () => chooseOp('+'), { bg: 'rgba(28,159,212,0.12)', color: BLUE })}
                {btn('0', () => inputDigit('0'), { span: 2 })}
                {btn('.', inputDot)}
                {btn('=', equals, { bg: `linear-gradient(135deg, ${NAVY}, ${CYAN})`, color: '#fff' })}
              </div>

              {history.length > 0 && (
                <div style={{ borderTop: '0.5px solid var(--card-border)', paddingTop: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.06em' }}>History</span>
                    <button onClick={clearHistory} style={{ border: 'none', background: 'transparent', color: BLUE, fontSize: 10.5, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>Clear</button>
                  </div>
                  <div style={{ maxHeight: 90, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {history.map((h, i) => (
                      <div key={i} style={{ fontSize: 11, color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums', fontFamily: FONT }}>{h}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.06em' }}>Scratch notes — auto-saved</span>
                <button
                  onClick={() => setNotes('')}
                  style={{ border: 'none', background: 'transparent', color: BLUE, fontSize: 10.5, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}
                >Clear</button>
              </div>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Jot down anything -- rough math, a campaign idea, a number you don't want to lose. Saved automatically on this device."
                style={{
                  flex: 1, minHeight: 320, resize: 'vertical', borderRadius: 10,
                  border: '0.5px solid var(--card-border)', padding: 12, fontSize: 13, lineHeight: 1.5,
                  fontFamily: FONT, color: 'var(--text)', background: 'var(--bg)', outline: 'none',
                }}
              />
              <div style={{ fontSize: 10.5, color: '#94A3B8' }}>{notes.length.toLocaleString()} characters · stored locally on this browser</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
