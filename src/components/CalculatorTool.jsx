import React from 'react'

/*
  CalculatorTool — floating calculator + a small Excel-like "rough sheet"
  (grid of cells with SUM/AVERAGE/MIN/MAX/COUNT formulas and cell references).
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

const HISTORY_KEY = 'lq_calc_history'
const SHEET_KEY = 'lq_scratch_sheet'
const SHEET_ROWS = 20
const SHEET_COLS = 8

function fmtNum(n) {
  if (!isFinite(n)) return 'Error'
  // Trim float noise (e.g. 0.1+0.2) without mangling deliberate long decimals.
  const rounded = Math.round(n * 1e10) / 1e10
  return String(rounded)
}

// ---- Spreadsheet engine: cell refs (A1, B12, ...), a handful of range
// functions, and a small safe arithmetic parser -- no eval() anywhere, so
// a cell's content can never run as code. ----
function colLetter(i) {
  let s = ''
  let n = i + 1
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}
function cellRef(r, c) { return colLetter(c) + (r + 1) }
function parseRef(ref) {
  const m = /^([A-Za-z]+)(\d+)$/.exec((ref || '').trim())
  if (!m) return null
  let col = 0
  for (const ch of m[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64)
  return { row: parseInt(m[2], 10) - 1, col: col - 1 }
}
// Minimal recursive-descent arithmetic evaluator: numbers, + - * / ( ), unary +/-.
function evalExpr(str) {
  let i = 0
  const skip = () => { while (str[i] === ' ') i++ }
  const parseNumber = () => {
    skip()
    const start = i
    while (/[0-9.]/.test(str[i] || '')) i++
    if (i === start) throw new Error('bad expression')
    return parseFloat(str.slice(start, i))
  }
  const parseFactor = () => {
    skip()
    if (str[i] === '(') { i++; const v = parseExpr(); skip(); if (str[i] === ')') i++; return v }
    if (str[i] === '-') { i++; return -parseFactor() }
    if (str[i] === '+') { i++; return parseFactor() }
    return parseNumber()
  }
  const parseTerm = () => {
    let v = parseFactor()
    while (true) {
      skip()
      if (str[i] === '*') { i++; v *= parseFactor() }
      else if (str[i] === '/') { i++; v /= parseFactor() }
      else break
    }
    return v
  }
  function parseExpr() {
    let v = parseTerm()
    while (true) {
      skip()
      if (str[i] === '+') { i++; v += parseTerm() }
      else if (str[i] === '-') { i++; v -= parseTerm() }
      else break
    }
    return v
  }
  if (!str.trim()) throw new Error('empty')
  const result = parseExpr()
  skip()
  if (i !== str.length) throw new Error('trailing input')
  return result
}
// Resolves one cell: raw text, a plain number, or (if it starts with "=") a
// formula supporting SUM/AVERAGE/AVG/MIN/MAX/COUNT over an A1:B5-style range
// plus arbitrary +-*/() arithmetic referencing other cells. `visiting` guards
// against circular references (A1 referencing itself through a chain).
function computeCell(sheet, r, c, visiting) {
  const key = `${r}-${c}`
  if (visiting.has(key)) return '#CIRC'
  const raw = (sheet[r] && sheet[r][c]) || ''
  if (!raw.trim()) return ''
  if (!raw.trim().startsWith('=')) {
    const n = Number(raw)
    return Number.isNaN(n) ? raw : n
  }
  const nextVisiting = new Set(visiting); nextVisiting.add(key)
  let expr = raw.trim().slice(1)
  expr = expr.replace(/\b(SUM|AVERAGE|AVG|MIN|MAX|COUNT)\s*\(\s*([A-Za-z]+\d+)\s*:\s*([A-Za-z]+\d+)\s*\)/gi, (m, fn, a, b) => {
    const ra = parseRef(a), rb = parseRef(b)
    if (!ra || !rb) return '0'
    const r0 = Math.min(ra.row, rb.row), r1 = Math.max(ra.row, rb.row)
    const c0 = Math.min(ra.col, rb.col), c1 = Math.max(ra.col, rb.col)
    const vals = []
    for (let rr = r0; rr <= r1; rr++) {
      for (let cc = c0; cc <= c1; cc++) {
        const v = computeCell(sheet, rr, cc, nextVisiting)
        const n = typeof v === 'number' ? v : parseFloat(v)
        if (!Number.isNaN(n)) vals.push(n)
      }
    }
    const fnU = fn.toUpperCase()
    if (fnU === 'SUM') return String(vals.reduce((a2, b2) => a2 + b2, 0))
    if (fnU === 'AVERAGE' || fnU === 'AVG') return String(vals.length ? vals.reduce((a2, b2) => a2 + b2, 0) / vals.length : 0)
    if (fnU === 'MIN') return String(vals.length ? Math.min(...vals) : 0)
    if (fnU === 'MAX') return String(vals.length ? Math.max(...vals) : 0)
    return String(vals.length) // COUNT
  })
  expr = expr.replace(/[A-Za-z]+\d+/g, (ref) => {
    const idx = parseRef(ref)
    if (!idx) return '0'
    const v = computeCell(sheet, idx.row, idx.col, nextVisiting)
    const n = typeof v === 'number' ? v : parseFloat(v)
    return String(Number.isNaN(n) ? 0 : n)
  })
  try {
    const result = evalExpr(expr)
    return Number.isFinite(result) ? result : '#ERR'
  } catch {
    return '#ERR'
  }
}
function displayString(v) {
  if (v === '' || v === null || v === undefined) return ''
  if (typeof v === 'number') return fmtNum(v)
  return String(v)
}
function makeEmptySheet() {
  return Array.from({ length: SHEET_ROWS }, () => Array.from({ length: SHEET_COLS }, () => ''))
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

  // ---- Rough sheet: grid of cells, persisted to localStorage ----
  const [sheet, setSheet] = React.useState(() => {
    try {
      const s = localStorage.getItem(SHEET_KEY)
      if (!s) return makeEmptySheet()
      const parsed = JSON.parse(s)
      if (!Array.isArray(parsed)) return makeEmptySheet()
      const base = makeEmptySheet()
      for (let r = 0; r < Math.min(SHEET_ROWS, parsed.length); r++) {
        const row = parsed[r] || []
        for (let c = 0; c < Math.min(SHEET_COLS, row.length); c++) base[r][c] = row[c] ?? ''
      }
      return base
    } catch { return makeEmptySheet() }
  })
  React.useEffect(() => { try { localStorage.setItem(SHEET_KEY, JSON.stringify(sheet)) } catch {} }, [sheet])

  const [selected, setSelected] = React.useState(null) // {r,c} -- last clicked cell, for the value/copy bar
  const [focusedKey, setFocusedKey] = React.useState(null) // which cell is showing its raw formula right now
  const cellInputRefs = React.useRef({})

  const updateCell = (r, c, val) => {
    setSheet(prev => {
      const next = prev.map(row => row.slice())
      next[r][c] = val
      return next
    })
  }
  const focusCell = (r, c) => {
    if (r < 0 || r >= SHEET_ROWS || c < 0 || c >= SHEET_COLS) return
    const el = cellInputRefs.current[`${r}-${c}`]
    if (el) el.focus()
  }
  const onCellKeyDown = (r, c) => (e) => {
    if (e.key === 'Enter') { e.preventDefault(); focusCell(r + 1, c) }
    else if (e.key === 'Tab') { e.preventDefault(); focusCell(r, c + (e.shiftKey ? -1 : 1)) }
  }
  const clearSheet = () => { setSheet(makeEmptySheet()); setSelected(null) }

  const selectedComputed = selected ? computeCell(sheet, selected.r, selected.c, new Set()) : ''
  const copySelected = () => {
    if (!selected) return
    const text = displayString(selectedComputed)
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).catch(() => {})
  }

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
            width: tab === 'sheet' ? 'min(640px, 92vw)' : 288, maxHeight: '82vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
            background: 'var(--card)', border: '0.5px solid var(--card-border)', borderRadius: '16px 0 0 16px',
            boxShadow: '0 1px 2px rgba(15,23,42,0.06), 0 24px 48px -14px rgba(31,60,132,0.32), 0 4px 16px rgba(15,23,42,0.10)',
            animation: 'calcToolIn .16s cubic-bezier(0.22,1,0.36,1) both',
            transition: 'width .16s ease',
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
            <button onClick={() => setTab('sheet')} style={{
              flex: 1, padding: '8px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
              fontFamily: FONT, fontSize: 12, fontWeight: 700, letterSpacing: '.02em',
              background: tab === 'sheet' ? `linear-gradient(135deg, ${NAVY}, ${BLUE})` : 'transparent',
              color: tab === 'sheet' ? '#fff' : '#94A3B8',
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
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: 600, minHeight: 14 }}>{expr || ' '}</div>
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
                <span style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  Rough sheet — type =SUM(A1:A5), =AVERAGE(...), or =B2*1.18
                </span>
                <button onClick={clearSheet} style={{ border: 'none', background: 'transparent', color: BLUE, fontSize: 10.5, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, flexShrink: 0 }}>
                  Clear sheet
                </button>
              </div>

              {/* Selected-cell value + copy bar -- so "copy some figure" doesn't
                  require focusing the cell (which shows the raw formula, not
                  the computed number). */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8,
                background: '#F4F6F9', minHeight: 32,
              }}>
                <span style={{ fontWeight: 700, color: NAVY, fontSize: 11.5, flexShrink: 0 }}>
                  {selected ? cellRef(selected.r, selected.c) : '—'}
                </span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: INK, fontVariantNumeric: 'tabular-nums' }}>
                  {selected ? (displayString(selectedComputed) || '(empty)') : 'Click a cell to select it'}
                </span>
                <button onClick={copySelected} disabled={!selected} title="Copy value" style={{
                  border: 'none', background: 'transparent', color: selected ? BLUE : '#CBD5E1',
                  cursor: selected ? 'pointer' : 'default', display: 'flex', alignItems: 'center', flexShrink: 0, padding: 2,
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                </button>
              </div>

              <div style={{ flex: 1, minHeight: 0, overflow: 'auto', border: '0.5px solid var(--card-border)', borderRadius: 10 }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontFamily: FONT }}>
                  <thead>
                    <tr>
                      <th style={{ position: 'sticky', top: 0, left: 0, zIndex: 3, background: '#F4F6F9', width: 30, minWidth: 30 }} />
                      {Array.from({ length: SHEET_COLS }).map((_, c) => (
                        <th key={c} style={{
                          position: 'sticky', top: 0, zIndex: 2, background: '#F4F6F9', color: '#64748B',
                          fontSize: 10.5, fontWeight: 700, padding: '5px 4px', borderBottom: '0.5px solid var(--card-border)',
                          borderLeft: '0.5px solid var(--card-border)', minWidth: 62,
                        }}>{colLetter(c)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: SHEET_ROWS }).map((_, r) => (
                      <tr key={r}>
                        <td style={{
                          position: 'sticky', left: 0, zIndex: 1, background: '#F4F6F9', color: '#94A3B8',
                          fontSize: 10.5, fontWeight: 700, textAlign: 'center', padding: '3px 4px',
                          borderRight: '0.5px solid var(--card-border)', borderBottom: '0.5px solid var(--card-border)',
                        }}>{r + 1}</td>
                        {Array.from({ length: SHEET_COLS }).map((_, c) => {
                          const key = `${r}-${c}`
                          const raw = sheet[r][c]
                          const computed = computeCell(sheet, r, c, new Set())
                          const isFocused = focusedKey === key
                          const isSelected = selected && selected.r === r && selected.c === c
                          const showValue = isFocused ? raw : displayString(computed)
                          return (
                            <td key={c} style={{ padding: 0, border: '0.5px solid var(--card-border)' }}>
                              <input
                                ref={el => { cellInputRefs.current[key] = el }}
                                value={showValue}
                                onFocus={e => { setSelected({ r, c }); setFocusedKey(key); e.target.select() }}
                                onBlur={() => setFocusedKey(k => (k === key ? null : k))}
                                onChange={e => updateCell(r, c, e.target.value)}
                                onKeyDown={onCellKeyDown(r, c)}
                                style={{
                                  width: '100%', boxSizing: 'border-box', border: 'none', outline: 'none',
                                  padding: '5px 6px', fontSize: 11.5, fontFamily: FONT,
                                  textAlign: typeof computed === 'number' ? 'right' : 'left',
                                  background: isSelected ? 'rgba(28,159,212,0.08)' : 'transparent',
                                  color: computed === '#ERR' || computed === '#CIRC' ? '#B91C1C' : (typeof computed === 'number' ? INK : 'var(--text)'),
                                }}
                              />
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 10, color: '#94A3B8' }}>Enter moves down · Tab moves right · stored locally on this browser</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
