import React from 'react'

/*
  CalculatorTool — floating calculator + a multi-sheet "rough sheet"
  (grid of cells with formulas, range select/copy/paste, undo/redo).
  Self-contained, mounted from the shared Sidebar so it appears on every
  page (same convention as SnapshotTool). Lives at the bottom-right corner,
  stacked directly above the Snapshot FAB.
  Brand palette only: navy #1F3C84, blue #1C9FD4, cyan #29B9C3, green #4CAE6F.
*/

const FONT = "'Plus Jakarta Sans','Inter',sans-serif"
const NAVY = '#1F3C84'
const BLUE = '#1C9FD4'
const CYAN = '#29B9C3'
const INK = '#0F1F4B'

const HISTORY_KEY = 'lq_calc_history'
const OLD_SHEET_KEY = 'lq_scratch_sheet'
const SHEETS_KEY = 'lq_scratch_sheets_v2'
const SHEET_ROWS = 20
const SHEET_COLS = 8
const MAX_UNDO = 60

function fmtNum(n) {
  if (!isFinite(n)) return 'Error'
  // Trim float noise (e.g. 0.1+0.2) without mangling deliberate long decimals.
  const rounded = Math.round(n * 1e10) / 1e10
  return String(rounded)
}

// ---- Spreadsheet engine: cell refs (A1, B12, ...), range functions,
// SUMIF/COUNTIF, IF/CONCATENATE, ROUND/ABS, and a small safe arithmetic
// parser -- no eval() anywhere, so a cell's content can never run as code. ----
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

// Splits "a, b(c,d), \"e,f\"" into top-level args, respecting parens/quotes.
function splitTopLevelArgs(str) {
  const args = []
  let depth = 0, cur = '', inStr = false
  for (let i = 0; i < str.length; i++) {
    const ch = str[i]
    if (ch === '"') { inStr = !inStr; cur += ch; continue }
    if (!inStr) {
      if (ch === '(') { depth++; cur += ch; continue }
      if (ch === ')') { depth--; cur += ch; continue }
      if (ch === ',' && depth === 0) { args.push(cur); cur = ''; continue }
    }
    cur += ch
  }
  if (cur.trim() !== '' || args.length > 0) args.push(cur)
  return args.map(a => a.trim())
}

// Resolves a bare arg to a value: quoted string literal, a cell ref, or an
// arithmetic expression (with any embedded cell refs resolved first).
function resolveValue(str, sheet, visiting) {
  const s = (str || '').trim()
  if (/^".*"$/.test(s)) return s.slice(1, -1)
  const ref = parseRef(s)
  if (ref) return computeCell(sheet, ref.row, ref.col, visiting)
  const resolved = s.replace(/[A-Za-z]+\d+/g, (m) => {
    const idx = parseRef(m)
    if (!idx) return m
    const v = computeCell(sheet, idx.row, idx.col, visiting)
    const n = typeof v === 'number' ? v : parseFloat(v)
    return String(Number.isNaN(n) ? 0 : n)
  })
  try { const n = evalExpr(resolved); return Number.isFinite(n) ? n : s } catch { return s }
}

function compareValues(op, a, b) {
  const na = typeof a === 'number' ? a : parseFloat(a)
  const nb = typeof b === 'number' ? b : parseFloat(b)
  const bothNum = !Number.isNaN(na) && !Number.isNaN(nb)
  switch (op) {
    case '>=': return bothNum ? na >= nb : String(a) >= String(b)
    case '<=': return bothNum ? na <= nb : String(a) <= String(b)
    case '<>': return bothNum ? na !== nb : String(a) !== String(b)
    case '=': return bothNum ? na === nb : String(a) === String(b)
    case '>': return bothNum ? na > nb : String(a) > String(b)
    case '<': return bothNum ? na < nb : String(a) < String(b)
    default: return false
  }
}
function evalCondition(str, sheet, visiting) {
  const ops = ['>=', '<=', '<>', '!=', '=', '>', '<']
  for (const op of ops) {
    const idx = str.indexOf(op)
    if (idx > -1) {
      const left = resolveValue(str.slice(0, idx), sheet, visiting)
      const right = resolveValue(str.slice(idx + op.length), sheet, visiting)
      return compareValues(op === '!=' ? '<>' : op, left, right)
    }
  }
  const v = resolveValue(str, sheet, visiting)
  return !!v && v !== 0 && v !== '0'
}
// Criteria like ">10", "<=5", "text", "=5", "10" (used by SUMIF/COUNTIF).
function matchCriteria(value, criteriaRaw) {
  let criteria = (criteriaRaw || '').trim()
  if (/^".*"$/.test(criteria)) criteria = criteria.slice(1, -1)
  const opMatch = /^(>=|<=|<>|!=|=|>|<)(.*)$/.exec(criteria)
  if (opMatch) return compareValues(opMatch[1] === '!=' ? '<>' : opMatch[1], value, opMatch[2].trim())
  const cn = parseFloat(criteria)
  const vn = typeof value === 'number' ? value : parseFloat(value)
  if (!Number.isNaN(cn) && !Number.isNaN(vn)) return vn === cn
  return String(value).toLowerCase() === criteria.toLowerCase()
}

// Resolves one cell: raw text, a plain number, or (if it starts with "=") a
// formula. Supports IF(...)/CONCATENATE(...) (text-capable, evaluated first),
// SUM/AVERAGE/MIN/MAX/COUNT over a range, SUMIF/COUNTIF, single-cell refs,
// ROUND/ABS, and +-*/() arithmetic. `visiting` guards circular references.
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
  let expr = raw.trim().slice(1).trim()

  let m = /^IF\s*\((.*)\)$/is.exec(expr)
  if (m) {
    const args = splitTopLevelArgs(m[1])
    if (args.length >= 2) {
      const cond = evalCondition(args[0], sheet, nextVisiting)
      const branch = cond ? args[1] : (args[2] !== undefined ? args[2] : '')
      return resolveValue(branch, sheet, nextVisiting)
    }
  }
  m = /^CONCAT(?:ENATE)?\s*\((.*)\)$/is.exec(expr)
  if (m) {
    return splitTopLevelArgs(m[1]).map(a => {
      const v = resolveValue(a, sheet, nextVisiting)
      return v == null ? '' : String(v)
    }).join('')
  }

  expr = expr.replace(/\b(SUM|AVERAGE|AVG|MIN|MAX|COUNT)\s*\(\s*([A-Za-z]+\d+)\s*:\s*([A-Za-z]+\d+)\s*\)/gi, (mm, fn, a, b) => {
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

  expr = expr.replace(/\bSUMIF\s*\(\s*([A-Za-z]+\d+)\s*:\s*([A-Za-z]+\d+)\s*,\s*("(?:[^"]*)"|[^,()]+)\s*(?:,\s*([A-Za-z]+\d+)\s*:\s*([A-Za-z]+\d+))?\s*\)/gi,
    (mm, a, b, criteria, sa, sb) => {
      const ra = parseRef(a), rb = parseRef(b)
      if (!ra || !rb) return '0'
      const r0 = Math.min(ra.row, rb.row), r1 = Math.max(ra.row, rb.row)
      const c0 = Math.min(ra.col, rb.col), c1 = Math.max(ra.col, rb.col)
      let sr0 = r0, sc0 = c0
      if (sa && sb) { const sra = parseRef(sa), srb = parseRef(sb); if (sra && srb) { sr0 = Math.min(sra.row, srb.row); sc0 = Math.min(sra.col, srb.col) } }
      let total = 0
      for (let rr = r0, ro = 0; rr <= r1; rr++, ro++) {
        for (let cc = c0, co = 0; cc <= c1; cc++, co++) {
          const v = computeCell(sheet, rr, cc, nextVisiting)
          if (matchCriteria(v, criteria)) {
            const sv = computeCell(sheet, sr0 + ro, sc0 + co, nextVisiting)
            const n = typeof sv === 'number' ? sv : parseFloat(sv)
            total += Number.isNaN(n) ? 0 : n
          }
        }
      }
      return String(total)
    })
  expr = expr.replace(/\bCOUNTIF\s*\(\s*([A-Za-z]+\d+)\s*:\s*([A-Za-z]+\d+)\s*,\s*("(?:[^"]*)"|[^,()]+)\s*\)/gi,
    (mm, a, b, criteria) => {
      const ra = parseRef(a), rb = parseRef(b)
      if (!ra || !rb) return '0'
      const r0 = Math.min(ra.row, rb.row), r1 = Math.max(ra.row, rb.row)
      const c0 = Math.min(ra.col, rb.col), c1 = Math.max(ra.col, rb.col)
      let count = 0
      for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) {
        if (matchCriteria(computeCell(sheet, rr, cc, nextVisiting), criteria)) count++
      }
      return String(count)
    })

  expr = expr.replace(/[A-Za-z]+\d+/g, (ref) => {
    const idx = parseRef(ref)
    if (!idx) return '0'
    const v = computeCell(sheet, idx.row, idx.col, nextVisiting)
    const n = typeof v === 'number' ? v : parseFloat(v)
    return String(Number.isNaN(n) ? 0 : n)
  })

  expr = expr.replace(/\bROUND\s*\(\s*([^(),]+)\s*,\s*([^(),]+)\s*\)/gi, (mm, num, digits) => {
    try { const n = evalExpr(num); const d = Math.max(0, Math.round(evalExpr(digits))); return String(Number(n.toFixed(d))) } catch { return '0' }
  })
  expr = expr.replace(/\bABS\s*\(\s*([^(),]+)\s*\)/gi, (mm, num) => {
    try { return String(Math.abs(evalExpr(num))) } catch { return '0' }
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
function makeSheetId() { return 's' + Math.random().toString(36).slice(2, 9) }

function loadInitialSheets() {
  try {
    const raw = localStorage.getItem(SHEETS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && Array.isArray(parsed.list) && parsed.list.length && parsed.data) return parsed
    }
  } catch {}
  // One-time migration from the old single-sheet format.
  let migrated = makeEmptySheet()
  try {
    const old = localStorage.getItem(OLD_SHEET_KEY)
    if (old) {
      const parsed = JSON.parse(old)
      if (Array.isArray(parsed)) {
        const base = makeEmptySheet()
        for (let r = 0; r < Math.min(SHEET_ROWS, parsed.length); r++) {
          const row = parsed[r] || []
          for (let c = 0; c < Math.min(SHEET_COLS, row.length); c++) base[r][c] = row[c] ?? ''
        }
        migrated = base
      }
    }
  } catch {}
  return { list: [{ id: 'sheet1', name: 'Sheet1' }], data: { sheet1: migrated } }
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

  // ==================================================================
  // ---- Rough sheet: multiple sheets, range select, copy/paste, undo/redo ----
  // ==================================================================
  const [sheetsState, setSheetsState] = React.useState(loadInitialSheets)
  const [activeSheetId, setActiveSheetId] = React.useState(() => loadInitialSheets().list[0]?.id)
  React.useEffect(() => { try { localStorage.setItem(SHEETS_KEY, JSON.stringify(sheetsState)) } catch {} }, [sheetsState])

  const grid = sheetsState.data[activeSheetId] || makeEmptySheet()

  const undoStackRef = React.useRef([])
  const redoStackRef = React.useRef([])
  const [, setHistoryTick] = React.useState(0)
  const bump = () => setHistoryTick(t => t + 1)

  const pushUndo = (sheetId, gridSnapshot) => {
    undoStackRef.current.push({ sheetId, grid: gridSnapshot.map(row => row.slice()) })
    if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift()
    redoStackRef.current = []
  }
  const mutateActiveGrid = (updater) => {
    setSheetsState(prev => {
      const curGrid = prev.data[activeSheetId] || makeEmptySheet()
      pushUndo(activeSheetId, curGrid)
      return { ...prev, data: { ...prev.data, [activeSheetId]: updater(curGrid) } }
    })
    bump()
  }
  const undo = () => {
    const last = undoStackRef.current.pop()
    if (!last) return
    setSheetsState(prev => {
      redoStackRef.current.push({ sheetId: last.sheetId, grid: (prev.data[last.sheetId] || makeEmptySheet()).map(r => r.slice()) })
      return { ...prev, data: { ...prev.data, [last.sheetId]: last.grid } }
    })
    if (last.sheetId !== activeSheetId) setActiveSheetId(last.sheetId)
    bump()
  }
  const redo = () => {
    const last = redoStackRef.current.pop()
    if (!last) return
    setSheetsState(prev => {
      undoStackRef.current.push({ sheetId: last.sheetId, grid: (prev.data[last.sheetId] || makeEmptySheet()).map(r => r.slice()) })
      return { ...prev, data: { ...prev.data, [last.sheetId]: last.grid } }
    })
    if (last.sheetId !== activeSheetId) setActiveSheetId(last.sheetId)
    bump()
  }

  const addSheet = () => {
    const id = makeSheetId()
    setSheetsState(prev => ({ list: [...prev.list, { id, name: 'Sheet' + (prev.list.length + 1) }], data: { ...prev.data, [id]: makeEmptySheet() } }))
    setActiveSheetId(id)
  }
  const renameSheet = (id) => {
    const cur = sheetsState.list.find(s => s.id === id)
    const name = window.prompt('Rename sheet', cur?.name || '')
    if (!name || !name.trim()) return
    setSheetsState(prev => ({ ...prev, list: prev.list.map(s => (s.id === id ? { ...s, name: name.trim().slice(0, 24) } : s)) }))
  }
  const deleteSheet = (id) => {
    if (sheetsState.list.length <= 1) return
    if (!window.confirm('Delete this sheet? This cannot be undone.')) return
    const remaining = sheetsState.list.filter(s => s.id !== id)
    setSheetsState(prev => {
      const data = { ...prev.data }; delete data[id]
      return { list: remaining, data }
    })
    if (activeSheetId === id) setActiveSheetId(remaining[0]?.id)
  }

  // ---- selection: {r1,c1} anchor (also the focused/typing cell), {r2,c2} drag end ----
  const [selection, setSelection] = React.useState({ r1: 0, c1: 0, r2: 0, c2: 0 })
  const isSelectingRef = React.useRef(false)
  const [focusedKey, setFocusedKey] = React.useState(null)
  const cellInputRefs = React.useRef({})
  const clipboardRef = React.useRef('')

  React.useEffect(() => {
    const up = () => { isSelectingRef.current = false }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  const selRect = React.useMemo(() => ({
    r0: Math.min(selection.r1, selection.r2), r1: Math.max(selection.r1, selection.r2),
    c0: Math.min(selection.c1, selection.c2), c1: Math.max(selection.c1, selection.c2),
  }), [selection])
  const isMultiSelect = selRect.r0 !== selRect.r1 || selRect.c0 !== selRect.c1
  const isCellSelected = (r, c) => r >= selRect.r0 && r <= selRect.r1 && c >= selRect.c0 && c <= selRect.c1
  const isActiveCell = (r, c) => r === selection.r1 && c === selection.c1

  const startSelect = (r, c) => { isSelectingRef.current = true; setSelection({ r1: r, c1: c, r2: r, c2: c }) }
  const extendSelect = (r, c) => { if (isSelectingRef.current) setSelection(prev => ({ ...prev, r2: r, c2: c })) }
  const shiftSelect = (r, c) => setSelection(prev => ({ ...prev, r2: r, c2: c }))

  const focusCell = (r, c) => {
    if (r < 0 || r >= SHEET_ROWS || c < 0 || c >= SHEET_COLS) return
    const el = cellInputRefs.current[`${r}-${c}`]
    if (el) el.focus()
  }
  const updateCell = (r, c, val) => {
    mutateActiveGrid(prev => { const next = prev.map(row => row.slice()); next[r][c] = val; return next })
  }
  const clearSelectionCells = () => {
    mutateActiveGrid(prev => {
      const next = prev.map(row => row.slice())
      for (let r = selRect.r0; r <= selRect.r1; r++) for (let c = selRect.c0; c <= selRect.c1; c++) next[r][c] = ''
      return next
    })
  }
  const clearSheet = () => { mutateActiveGrid(() => makeEmptySheet()); setSelection({ r1: 0, c1: 0, r2: 0, c2: 0 }) }

  const buildTSV = (rect) => {
    const lines = []
    for (let r = rect.r0; r <= rect.r1; r++) {
      const cols = []
      for (let c = rect.c0; c <= rect.c1; c++) cols.push(grid[r][c] || '')
      lines.push(cols.join('\t'))
    }
    return lines.join('\n')
  }
  const copySelection = async () => {
    const tsv = buildTSV(selRect)
    clipboardRef.current = tsv
    try { await navigator.clipboard.writeText(tsv) } catch {}
  }
  const cutSelection = async () => { await copySelection(); clearSelectionCells() }
  const pasteSelection = async () => {
    let text = ''
    try { text = await navigator.clipboard.readText() } catch { /* fall back below */ }
    if (!text) text = clipboardRef.current
    if (!text) return
    const rows = text.replace(/\r/g, '').split('\n').map(line => line.split('\t'))
    const r0 = selRect.r0, c0 = selRect.c0
    mutateActiveGrid(prev => {
      const next = prev.map(row => row.slice())
      rows.forEach((rowVals, ri) => {
        const rr = r0 + ri
        if (rr >= SHEET_ROWS) return
        rowVals.forEach((val, ci) => {
          const cc = c0 + ci
          if (cc >= SHEET_COLS) return
          next[rr][cc] = val
        })
      })
      return next
    })
  }

  const onCellKeyDown = (r, c) => (e) => {
    const meta = e.ctrlKey || e.metaKey
    if (meta && /^z$/i.test(e.key)) { e.preventDefault(); e.shiftKey ? redo() : undo(); return }
    if (meta && /^y$/i.test(e.key)) { e.preventDefault(); redo(); return }
    if (meta && /^c$/i.test(e.key)) { e.preventDefault(); copySelection(); return }
    if (meta && /^x$/i.test(e.key)) { e.preventDefault(); cutSelection(); return }
    if (meta && /^v$/i.test(e.key)) { e.preventDefault(); pasteSelection(); return }
    if ((e.key === 'Delete' || e.key === 'Backspace') && isMultiSelect) { e.preventDefault(); clearSelectionCells(); return }
    if (e.key === 'Enter') { e.preventDefault(); setSelection({ r1: r + 1, c1: c, r2: r + 1, c2: c }); focusCell(r + 1, c) }
    else if (e.key === 'Tab') { e.preventDefault(); const nc = c + (e.shiftKey ? -1 : 1); setSelection({ r1: r, c1: nc, r2: r, c2: nc }); focusCell(r, nc) }
  }

  const selectedComputed = computeCell(grid, selection.r1, selection.c1, new Set())
  const copySelectedValue = () => {
    const text = displayString(selectedComputed)
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).catch(() => {})
  }
  const selStats = React.useMemo(() => {
    if (!isMultiSelect) return null
    let sum = 0, count = 0, numCount = 0
    for (let r = selRect.r0; r <= selRect.r1; r++) {
      for (let c = selRect.c0; c <= selRect.c1; c++) {
        const v = computeCell(grid, r, c, new Set())
        if (v !== '') count++
        const n = typeof v === 'number' ? v : parseFloat(v)
        if (!Number.isNaN(n) && v !== '') { sum += n; numCount++ }
      }
    }
    return { sum, count, avg: numCount ? sum / numCount : 0 }
  }, [selRect, grid, isMultiSelect])

  const onFormulaBarChange = (val) => updateCell(selection.r1, selection.c1, val)
  const onFormulaBarKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); setSelection({ r1: selection.r1 + 1, c1: selection.c1, r2: selection.r1 + 1, c2: selection.c1 }); focusCell(selection.r1 + 1, selection.c1) }
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

  const toolBtn = (title, onClick, disabled, svg) => (
    <button key={title} onClick={onClick} disabled={disabled} title={title} style={{
      width: 26, height: 26, borderRadius: 7, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'transparent', color: disabled ? '#CBD5E1' : '#64748B', cursor: disabled ? 'default' : 'pointer', flexShrink: 0,
    }}>{svg}</button>
  )

  return (
    <div data-snapshot-ignore="true" style={{ position: 'fixed', bottom: 86, right: 22, zIndex: 700, fontFamily: FONT, display: 'flex', alignItems: 'flex-end', flexDirection: 'row-reverse' }}>
      {/* Trigger button -- white, sits directly above the Snapshot FAB so the two form one stack */}
      <button
        onMouseEnter={openPanel}
        onMouseLeave={scheduleClose}
        onClick={() => { setPinned(p => !p); openPanel() }}
        title="Calculator & rough sheet"
        style={{
          width: 52, height: 52, borderRadius: 16, flexShrink: 0, border: '0.5px solid var(--card-border)',
          background: 'var(--card)', boxShadow: '0 10px 26px -8px rgba(15,23,42,0.22)',
          display: open ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', transition: 'transform .15s ease',
        }}
        onFocus={openPanel}
        onMouseDown={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
      >
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={NAVY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="2" width="16" height="20" rx="2" />
          <line x1="8" y1="6" x2="16" y2="6" />
          <line x1="8" y1="11" x2="8" y2="11" />
          <line x1="12" y1="11" x2="12" y2="11" />
          <line x1="16" y1="11" x2="16" y2="11" />
          <line x1="8" y1="15" x2="8" y2="15" />
          <line x1="12" y1="15" x2="12" y2="15" />
          <line x1="16" y1="15" x2="16" y2="15" />
        </svg>
      </button>

      {open && (
        <div
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          style={{
            width: tab === 'sheet' ? 'min(720px, 94vw)' : 288, maxHeight: '82vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
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
              {/* Sheet tabs */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflowX: 'auto', paddingBottom: 2 }}>
                {sheetsState.list.map(s => (
                  <div key={s.id} onClick={() => setActiveSheetId(s.id)} onDoubleClick={() => renameSheet(s.id)}
                    title="Click to switch, double-click to rename"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, cursor: 'pointer',
                      padding: '5px 9px', borderRadius: 8, fontSize: 11.5, fontWeight: 700,
                      background: s.id === activeSheetId ? 'rgba(28,159,212,0.12)' : 'transparent',
                      color: s.id === activeSheetId ? BLUE : '#94A3B8',
                    }}>
                    {s.name}
                    {sheetsState.list.length > 1 && (
                      <span onClick={e => { e.stopPropagation(); deleteSheet(s.id) }} title="Delete sheet"
                        style={{ display: 'flex', opacity: 0.6 }}>
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                      </span>
                    )}
                  </div>
                ))}
                <button onClick={addSheet} title="Add sheet" style={{
                  width: 22, height: 22, borderRadius: 7, border: '1px dashed #CBD5E1', background: 'transparent',
                  color: '#94A3B8', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
                }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                </button>
                <div style={{ marginLeft: 'auto', flexShrink: 0, display: 'flex', gap: 2 }}>
                  {toolBtn('Undo (Ctrl+Z)', undo, undoStackRef.current.length === 0, <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6" /><path d="M21 17a9 9 0 00-15-6.7L3 13" /></svg>)}
                  {toolBtn('Redo (Ctrl+Y)', redo, redoStackRef.current.length === 0, <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0115-6.7L21 13" /></svg>)}
                  {toolBtn('Cut (Ctrl+X)', cutSelection, false, <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><line x1="20" y1="4" x2="8.12" y2="15.88" /><line x1="14.47" y1="14.48" x2="20" y2="20" /><line x1="8.12" y1="8.12" x2="12" y2="12" /></svg>)}
                  {toolBtn('Copy (Ctrl+C)', copySelection, false, <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>)}
                  {toolBtn('Paste (Ctrl+V)', pasteSelection, false, <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" /></svg>)}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  {'=SUM(A1:A5) · =IF(A1>10,"High","Low") · =SUMIF(...) · =ROUND(...) · =CONCATENATE(...)'}
                </span>
                <button onClick={clearSheet} style={{ border: 'none', background: 'transparent', color: BLUE, fontSize: 10.5, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, flexShrink: 0 }}>
                  Clear sheet
                </button>
              </div>

              {/* Formula bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: '#F4F6F9', minHeight: 32 }}>
                <span style={{ fontWeight: 700, color: NAVY, fontSize: 11.5, flexShrink: 0, minWidth: 24 }}>
                  {cellRef(selection.r1, selection.c1)}
                </span>
                <span style={{ fontStyle: 'italic', color: '#94A3B8', fontSize: 12, flexShrink: 0 }}>fx</span>
                <input
                  value={grid[selection.r1][selection.c1]}
                  onChange={e => onFormulaBarChange(e.target.value)}
                  onKeyDown={onFormulaBarKeyDown}
                  placeholder="(empty)"
                  style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, fontFamily: FONT, color: INK, minWidth: 0 }}
                />
                <button onClick={copySelectedValue} title="Copy computed value" style={{
                  border: 'none', background: 'transparent', color: BLUE, cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0, padding: 2,
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                </button>
              </div>

              <div style={{ flex: 1, minHeight: 0, overflow: 'auto', border: '0.5px solid var(--card-border)', borderRadius: 10 }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontFamily: FONT, userSelect: isSelectingRef.current ? 'none' : 'auto' }}>
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
                          const raw = grid[r][c]
                          const computed = computeCell(grid, r, c, new Set())
                          const isFocused = focusedKey === key
                          const selected = isCellSelected(r, c)
                          const active = isActiveCell(r, c)
                          const showValue = isFocused ? raw : displayString(computed)
                          return (
                            <td key={c} style={{ padding: 0, border: '0.5px solid var(--card-border)' }}>
                              <input
                                ref={el => { cellInputRefs.current[key] = el }}
                                value={showValue}
                                onMouseDown={e => { if (e.shiftKey) shiftSelect(r, c); else startSelect(r, c) }}
                                onMouseEnter={() => extendSelect(r, c)}
                                onFocus={e => { setFocusedKey(key); e.target.select() }}
                                onBlur={() => setFocusedKey(k => (k === key ? null : k))}
                                onChange={e => updateCell(r, c, e.target.value)}
                                onKeyDown={onCellKeyDown(r, c)}
                                style={{
                                  width: '100%', boxSizing: 'border-box', border: active ? `1.5px solid ${BLUE}` : 'none', outline: 'none',
                                  padding: '5px 6px', fontSize: 11.5, fontFamily: FONT,
                                  textAlign: typeof computed === 'number' ? 'right' : 'left',
                                  background: selected ? (active ? 'rgba(28,159,212,0.14)' : 'rgba(28,159,212,0.08)') : 'transparent',
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10, color: '#94A3B8' }}>
                <span>Enter moves down · Tab moves right · drag or shift-click to select a range · stored locally on this browser</span>
                {selStats && (
                  <span style={{ flexShrink: 0, fontWeight: 700, color: NAVY, display: 'flex', gap: 10 }}>
                    <span>Sum {fmtNum(selStats.sum)}</span>
                    <span>Avg {fmtNum(Number(selStats.avg.toFixed(4)))}</span>
                    <span>Count {selStats.count}</span>
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
