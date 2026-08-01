import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import { InlineLoader } from '../components/SkeletonLoader'
import { C, FONT, fmtN } from '../ui/dashboardKit'
import FilterDropdown from '../components/FilterDropdown'
import Button from '../components/Button'

// Real LeadSquared deep-link patterns, already used elsewhere in this app
// (HumanQLDetailDashboard.jsx) -- reused here so a contact/opportunity opens
// in the real LeadSquared UI exactly like it does from that page.
const LEADSQUARED_CONTACT_URL = 'https://in21.leadsquared.com/LeadManagement/LeadDetails?LeadID='
const LEADSQUARED_OPPORTUNITY_URL = 'https://in21.leadsquared.com/OpportunityManagement/OpportunityDetails?opportunityId='

// University Admission Opportunity -- the same OpportunityEventCode already used
// elsewhere in this app (LEADSQUARED_OPPORTUNITY_EVENT), and confirmed live by
// following LeadSquared's own "Manage Opportunities > University Admission
// Opportunity" nav item (ec=12003). Other opportunity types exist on this
// account (Fly Compass, Fly Homes, Forex, Ivy100, ...) but aren't wired yet.
const DEFAULT_OPPORTUNITY_EVENT_CODE = 12003
// "Manual Lead Qualification - Futwork" -- this is what LeadSquared's OWN
// "Manage Activities" nav item actually defaults to for this account (confirmed
// live: clicking it lands on ActivityManagement?ec=234), so it's used as the
// default here too rather than a generic pick.
const DEFAULT_ACTIVITY_EVENT_CODE = 234

// Real colors from GetOpportunityTypeMetadata's Status OptionSet for this
// account's opportunity type -- matches the yellow/green/red pills seen live
// on LeadSquared's own Manage Opportunities screen.
const STATUS_COLORS = {
  Open: { bg: '#FFFB83', fg: '#A08427' },
  Won: { bg: '#A5E887', fg: '#347715' },
  Lost: { bg: '#FFD4D0', fg: '#E31D00' },
}

const API = '/api/crm-leads?source=leadsquared'
const PAGE_ROWS = 50

function isoDaysAgo(n) { return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10) }
function todayIso() { return new Date().toISOString().slice(0, 10) }
function short(id) { return id ? String(id).slice(0, 8) + '…' : '—' }
function fmtDate(s) { return s ? String(s).slice(0, 16) : '—' }

async function fetchJson(url) {
  const r = await fetch(url, { credentials: 'include' })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Request failed')
  return d
}

// ---------------------------------------------------------------- shared UI

const inputStyle = { fontFamily: FONT, fontSize: 12, color: C.text, border: '0.5px solid ' + C.border, borderRadius: 8, padding: '6px 10px', background: 'var(--card)', outline: 'none' }

const pillStyle = (active) => ({
  padding: '6px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
  background: active ? 'linear-gradient(135deg,#1F3C84,#1C9FD4)' : 'transparent',
  color: active ? '#fff' : C.muted, border: active ? 'none' : '0.5px solid ' + C.border,
  whiteSpace: 'nowrap', boxShadow: active ? '0 3px 10px rgba(31,60,132,.20)' : 'none',
})

function DateRangeRow({ since, until, onSince, onUntil }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, letterSpacing: 0.5 }}>CREATED ON</span>
      <input type="date" value={since} max={until} onChange={e => onSince(e.target.value)} style={inputStyle} />
      <span style={{ fontSize: 11, color: C.muted }}>to</span>
      <input type="date" value={until} min={since} onChange={e => onUntil(e.target.value)} style={inputStyle} />
    </div>
  )
}

function SearchBox({ value, onChange, placeholder }) {
  return (
    <div style={{ position: 'relative', flex: '0 1 240px', minWidth: 160 }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ ...inputStyle, paddingLeft: 30, width: '100%' }} />
    </div>
  )
}

function Toolbar({ children }) { return <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>{children}</div> }

function ErrorNote({ message }) {
  return <div style={{ padding: '10px 14px', borderRadius: 10, background: '#FEF2F2', border: '0.5px solid #FECACA', color: '#B91C1C', fontSize: 12.5, marginBottom: 14 }}>✕ {message}</div>
}
function EmptyNote({ label }) {
  return <div style={{ padding: '48px 0', textAlign: 'center', color: C.muted, fontSize: 13 }}>{label}</div>
}

function Th({ children, width }) {
  return <th style={{ textAlign: 'left', padding: '9px 12px', fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid ' + C.border, whiteSpace: 'nowrap', width, position: 'sticky', top: 0, background: 'var(--card)' }}>{children}</th>
}
function Td({ children, style }) {
  return <td style={{ padding: '10px 12px', fontSize: 12.5, color: C.text, borderBottom: '1px solid #F1F5F9', ...style }}>{children}</td>
}

function pageBtnStyle(disabled) { return { padding: '5px 10px', borderRadius: 7, border: '0.5px solid ' + C.border, background: disabled ? '#F8FAFC' : 'var(--card)', color: disabled ? '#CBD5E1' : C.text, fontSize: 12, fontWeight: 700, cursor: disabled ? 'default' : 'pointer', fontFamily: FONT } }

function Pagination({ page, totalPages, onPage, count, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, flexWrap: 'wrap', gap: 8 }}>
      <span style={{ fontSize: 11.5, color: C.muted }}>{fmtN(count)} {label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1} style={pageBtnStyle(page <= 1)}>{'← Prev'}</button>
        <span style={{ fontSize: 12, color: C.muted }}>Page {page} of {totalPages}</span>
        <button onClick={() => onPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} style={pageBtnStyle(page >= totalPages)}>{'Next →'}</button>
      </div>
    </div>
  )
}

function StatusPill({ value }) {
  const c = STATUS_COLORS[value] || { bg: '#EEF1F6', fg: '#64748B' }
  return <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 700, background: c.bg, color: c.fg, whiteSpace: 'nowrap' }}>{value || '—'}</span>
}

function ContactLink({ id, name }) {
  if (!id) return <span style={{ color: C.muted }}>—</span>
  return <a href={LEADSQUARED_CONTACT_URL + id} target="_blank" rel="noreferrer" title={id} style={{ color: '#1C9FD4', fontWeight: 600, fontSize: 12 }}>{name || short(id)}</a>
}

// Persists which columns are hidden, keyed per tab (and per Activity Type for the
// Activities tab, since each type has its own field set). Stores the HIDDEN set rather
// than the visible one, matching this repo's established pattern elsewhere (visibleCols
// merge-missing-keys convention) -- any brand-new column a future field-schema change
// introduces defaults to visible automatically, never silently missing.
function useHiddenColumns(storageKey) {
  const [hidden, setHiddenState] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(storageKey) || '[]')) } catch { return new Set() }
  })
  // Re-read from localStorage whenever the key itself changes -- needed for the Activities
  // tab, whose key includes the selected Activity Type: useState's initializer only runs
  // once on mount, so without this a hidden-columns choice made for one type would keep
  // being applied after switching to a completely different type.
  useEffect(() => {
    try { setHiddenState(new Set(JSON.parse(localStorage.getItem(storageKey) || '[]'))) } catch { setHiddenState(new Set()) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(Array.from(hidden))) } catch {}
  }, [hidden, storageKey])
  return [hidden, setHiddenState]
}

function ColumnPickerIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="3" x2="8" y2="21" /><line x1="12" y1="3" x2="12" y2="21" /><line x1="16" y1="3" x2="16" y2="21" /></svg>
}

// Deep-dived LeadSquared's own real "Select fields to view in grid" modal (the ||| icon at
// the end of every real Manage screen's filter row) before building this -- same
// interaction: a field search box, an All/Selected view toggle, a checkbox list, and
// Cancel/Restore Default/Show Selected actions. Not pixel-identical, but the same real
// functionality, present on all three tabs here exactly like the real product.
function ColumnPickerButton({ columns, hidden, onApply }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(hidden)
  const [search, setSearch] = useState('')
  const [showSelectedOnly, setShowSelectedOnly] = useState(false)

  const openModal = () => { setDraft(new Set(hidden)); setSearch(''); setShowSelectedOnly(false); setOpen(true) }
  const toggle = (col) => setDraft(prev => {
    const next = new Set(prev)
    if (next.has(col)) next.delete(col); else next.add(col)
    return next
  })
  const list = columns.filter(c => {
    if (search && !c.toLowerCase().includes(search.toLowerCase())) return false
    if (showSelectedOnly && draft.has(c)) return false
    return true
  })

  return (
    <>
      <button type="button" onClick={openModal} title="Select Columns"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, border: '0.5px solid ' + C.border, background: 'var(--card)', color: C.muted, cursor: 'pointer', flexShrink: 0 }}>
        <ColumnPickerIcon />
      </button>
      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(15,23,42,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', borderRadius: 14, width: 420, maxHeight: '70vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px -12px rgba(15,23,42,0.35)', fontFamily: FONT }}>
            <div style={{ padding: '18px 20px 12px' }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 800, color: C.text }}>Select fields to view in grid</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <SearchBox value={search} onChange={setSearch} placeholder="Search Fields" />
                <span style={{ fontSize: 11.5, color: C.muted, whiteSpace: 'nowrap' }}>
                  Show: <button type="button" onClick={() => setShowSelectedOnly(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: !showSelectedOnly ? 800 : 500, color: !showSelectedOnly ? C.text : C.muted, padding: 0, fontFamily: FONT, fontSize: 11.5 }}>All</button>
                  {' | '}
                  <button type="button" onClick={() => setShowSelectedOnly(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: showSelectedOnly ? 800 : 500, color: showSelectedOnly ? C.text : C.muted, padding: 0, fontFamily: FONT, fontSize: 11.5 }}>Selected</button>
                </span>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px', borderTop: '1px solid ' + C.border, borderBottom: '1px solid ' + C.border }}>
              {list.length === 0 ? <p style={{ fontSize: 12, color: C.muted, padding: '16px 0' }}>No fields match.</p> : list.map(col => (
                <label key={col} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', fontSize: 13, color: C.text, cursor: 'pointer', borderBottom: '1px solid #F1F5F9' }}>
                  <input type="checkbox" checked={!draft.has(col)} onChange={() => toggle(col)} />
                  {col}
                </label>
              ))}
            </div>
            <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button size="sm" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
              <Button size="sm" variant="secondary" onClick={() => setDraft(new Set())}>Restore Default</Button>
              <Button size="sm" onClick={() => { onApply(draft); setOpen(false) }}>Show Selected</Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// Deep-dived LeadSquared's own real "Advanced Search" modal before building this: a
// field/operator/value criteria builder (multiple stacked rows, "+ Add" to add another,
// "Reset" to clear), an Any Criteria / All Criteria match-mode toggle, and a live
// human-readable summary sentence of the current search ("Activity of the Contacts is X
// and Y is Z"). Client-side by design -- the backend's own AdvancedSearch RowCondition
// support is narrow and already got two real 400s from wrong guesses on other fields (see
// api/crm-leads.js), so arbitrary multi-field search here runs against the rows already
// loaded for the active date window, exactly like the toolbar's simpler filters already do.
const ADV_OPERATORS = [
  { v: 'is', l: 'Is' },
  { v: 'isnot', l: 'Is Not' },
  { v: 'contains', l: 'Contains' },
  { v: 'isempty', l: 'Is Empty' },
  { v: 'isnotempty', l: 'Is Not Empty' },
]

function evalCriterion(actual, op, target) {
  const a = (actual == null ? '' : String(actual)).toLowerCase()
  const t = (target == null ? '' : String(target)).toLowerCase().trim()
  switch (op) {
    case 'is': return a === t
    case 'isnot': return a !== t
    case 'contains': return !!t && a.includes(t)
    case 'isempty': return a === ''
    case 'isnotempty': return a !== ''
    default: return true
  }
}

function matchesAdvSearch(row, getValue, advSearch) {
  if (!advSearch || !advSearch.criteria.length) return true
  const results = advSearch.criteria.map(c => evalCriterion(getValue(row, c.field), c.op, c.value))
  return advSearch.matchMode === 'any' ? results.some(Boolean) : results.every(Boolean)
}

function summarizeAdvSearch(advSearch) {
  if (!advSearch || !advSearch.criteria.length) return ''
  const glue = advSearch.matchMode === 'any' ? ' or ' : ' and '
  return advSearch.criteria.map(c => {
    const opLabel = (ADV_OPERATORS.find(o => o.v === c.op) || {}).l || c.op
    if (c.op === 'isempty' || c.op === 'isnotempty') return `${c.field} ${opLabel}`
    return `${c.field} ${opLabel} "${c.value}"`
  }).join(glue)
}

// Portal-based dropdown used ONLY inside the Advanced Search criteria list.
// The rows list below scrolls internally (overflowY:auto) so a row's own
// Field/Op menu can't be allowed to rely on CSS position:absolute -- an
// ancestor's overflow:auto clips anything, including popovers, that extends
// past its box. Rendering to document.body via a portal, positioned from the
// trigger's real getBoundingClientRect(), guarantees the menu is never cut
// off by the scroll container, the modal edge, or the viewport -- it also
// flips upward and clamps horizontally when there isn't room.
function AdvSearchDropdown({ label, value, options, onSelect }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)
  const menuRef = useRef(null)

  const place = () => {
    const btn = btnRef.current
    if (!btn) return
    const r = btn.getBoundingClientRect()
    const estHeight = Math.min(options.length * 33 + 8, 260)
    const openUp = r.bottom + estHeight + 8 > window.innerHeight
    const width = Math.max(r.width, 170)
    let left = r.left
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8
    if (left < 8) left = 8
    setPos({ top: openUp ? Math.max(8, r.top - estHeight - 6) : r.bottom + 6, left, width })
  }

  const toggle = () => { if (open) { setOpen(false) } else { place(); setOpen(true) } }

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const onDocDown = (e) => {
      if (btnRef.current?.contains(e.target)) return
      if (menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    // capture:true so scroll INSIDE the criteria list (which doesn't bubble) still closes it
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    document.addEventListener('mousedown', onDocDown)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      document.removeEventListener('mousedown', onDocDown)
    }
  }, [open])

  const current = options.find(o => o.v === value) || options[0] || { v: value, l: value }

  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <button ref={btnRef} type="button" onClick={toggle}
        style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '7px 10px', borderRadius: 8, border: '0.5px solid ' + (open ? '#1C9FD4' : C.border), background: 'var(--card)', cursor: 'pointer', fontSize: 12.5, fontFamily: FONT, color: C.text, textAlign: 'left' }}>
        <span style={{ color: C.muted, fontWeight: 600, flexShrink: 0 }}>{label}:</span>
        <span style={{ fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current.l}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && pos && createPortal(
        <div ref={menuRef} style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 2000, background: 'var(--card)', border: '1px solid ' + C.border, borderRadius: 10, boxShadow: '0 20px 45px -10px rgba(15,23,42,0.32)', padding: 4, maxHeight: 260, overflowY: 'auto' }}>
          {options.map(o => (
            <button key={o.v} type="button" onClick={() => { onSelect(o.v); setOpen(false) }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', textAlign: 'left', padding: '7px 9px', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: value === o.v ? 700 : 500, fontFamily: FONT, color: value === o.v ? '#1F3C84' : C.text, background: value === o.v ? '#E8EFF9' : 'transparent' }}
              onMouseEnter={e => { if (value !== o.v) e.currentTarget.style.background = '#F3F4F6' }}
              onMouseLeave={e => { if (value !== o.v) e.currentTarget.style.background = 'transparent' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.l}</span>
              {value === o.v && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1C9FD4" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginLeft: 8 }}><polyline points="20 6 9 17 4 12" /></svg>}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}

function AdvancedSearchButton({ fields, advSearch, onApply, onClear }) {
  const [open, setOpen] = useState(false)
  const [criteria, setCriteria] = useState([{ field: fields[0], op: 'is', value: '' }])
  const [matchMode, setMatchMode] = useState('all')

  const openModal = () => {
    setCriteria(advSearch ? advSearch.criteria.map(c => ({ ...c })) : [{ field: fields[0], op: 'is', value: '' }])
    setMatchMode(advSearch ? advSearch.matchMode : 'all')
    setOpen(true)
  }
  const addRow = () => setCriteria(prev => [...prev, { field: fields[0], op: 'is', value: '' }])
  const removeRow = (i) => setCriteria(prev => prev.filter((_, idx) => idx !== i))
  const updateRow = (i, patch) => setCriteria(prev => prev.map((c, idx) => idx === i ? { ...c, ...patch } : c))
  const reset = () => setCriteria([{ field: fields[0], op: 'is', value: '' }])

  const draftSummary = summarizeAdvSearch({ criteria, matchMode })

  const find = () => {
    const applied = criteria.filter(c => c.op === 'isempty' || c.op === 'isnotempty' || (c.value || '').trim())
    if (!applied.length) { onClear(); setOpen(false); return }
    onApply({ criteria: applied, matchMode })
    setOpen(false)
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button type="button" onClick={openModal}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: '0.5px solid ' + (advSearch ? '#1C9FD4' : C.border), background: 'var(--card)', color: advSearch ? '#1C9FD4' : C.muted, fontSize: 12.5, fontWeight: 600, fontFamily: FONT, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6" /><line x1="7" y1="12" x2="17" y2="12" /><line x1="10" y1="18" x2="14" y2="18" /></svg>
          Advanced Search
        </button>
        {advSearch && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, background: '#EEF1F6', color: C.text, fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap' }} title={summarizeAdvSearch(advSearch)}>
            Advanced search results
            <span onClick={onClear} style={{ cursor: 'pointer', color: C.muted, fontWeight: 800 }}>✕</span>
          </span>
        )}
      </div>
      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(15,23,42,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => setOpen(false)}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--card)', borderRadius: 16, width: 'min(900px, 96vw)', height: 'min(660px, 90vh)', display: 'flex', flexDirection: 'column', boxShadow: '0 30px 70px -14px rgba(15,23,42,0.4)', fontFamily: FONT, overflow: 'hidden' }}>
            {/* Header -- fixed, never scrolls */}
            <div style={{ flex: '0 0 auto', padding: '20px 24px', borderBottom: '1px solid ' + C.border, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 800, color: C.text }}>Advanced Search</h3>
                <p style={{ margin: 0, fontSize: 12, color: C.muted }}>Select Search Criteria</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} title="Close"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, border: '0.5px solid ' + C.border, background: 'transparent', color: C.muted, cursor: 'pointer', flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="4" y1="4" x2="20" y2="20" /><line x1="20" y1="4" x2="4" y2="20" /></svg>
              </button>
            </div>

            {/* Body -- fixed height, two columns; ONLY the rows list inside scrolls */}
            <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
              <div style={{ flex: '1 1 58%', minWidth: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid ' + C.border }}>
                <div style={{ flex: '0 0 auto', padding: '14px 24px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Criteria ({criteria.length})</span>
                </div>
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 24px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {criteria.map((c, i) => (
                    <div key={i} style={{ border: '0.5px solid ' + C.border, borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, position: 'relative', background: '#F8FAFC' }}>
                      {criteria.length > 1 && (
                        <button type="button" onClick={() => removeRow(i)} title="Remove criterion"
                          style={{ position: 'absolute', top: 8, right: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: C.muted, fontSize: 13, fontWeight: 800, lineHeight: 1 }}>✕</button>
                      )}
                      <div style={{ display: 'flex', gap: 8, paddingRight: criteria.length > 1 ? 24 : 0 }}>
                        <AdvSearchDropdown label="Field" value={c.field} options={fields.map(f => ({ v: f, l: f }))} onSelect={v => updateRow(i, { field: v })} />
                        <AdvSearchDropdown label="Op" value={c.op} options={ADV_OPERATORS} onSelect={v => updateRow(i, { op: v })} />
                      </div>
                      {c.op !== 'isempty' && c.op !== 'isnotempty' && (
                        <input value={c.value} onChange={e => updateRow(i, { value: e.target.value })} placeholder="Value" style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', background: 'var(--card)' }} />
                      )}
                    </div>
                  ))}
                </div>
                {/* Footer of the left column -- fixed, never scrolls with the rows */}
                <div style={{ flex: '0 0 auto', padding: '12px 24px', borderTop: '1px solid ' + C.border, display: 'flex', gap: 8 }}>
                  <Button size="sm" variant="secondary" onClick={addRow}>+ Add</Button>
                  <Button size="sm" variant="secondary" onClick={reset}>Reset</Button>
                </div>
              </div>

              <div style={{ flex: '1 1 42%', minWidth: 0, display: 'flex', flexDirection: 'column', padding: '18px 24px', overflowY: 'auto' }}>
                <p style={{ margin: '0 0 12px', fontSize: 12.5, fontWeight: 700, color: C.text }}>Search for records that match</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 500, color: C.text, cursor: 'pointer' }}><input type="radio" checked={matchMode === 'any'} onChange={() => setMatchMode('any')} /> Any Criteria</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 500, color: C.text, cursor: 'pointer' }}><input type="radio" checked={matchMode === 'all'} onChange={() => setMatchMode('all')} /> All Criteria</label>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Live summary</span>
                <div style={{ flex: 1, background: '#F8FAFC', border: '0.5px solid ' + C.border, borderRadius: 10, padding: 14, fontSize: 12.5, color: C.text, lineHeight: 1.7, wordBreak: 'break-word' }}>
                  {draftSummary || <span style={{ color: C.muted }}>No criteria added yet.</span>}
                </div>
              </div>
            </div>

            {/* Footer -- fixed, never scrolls */}
            <div style={{ flex: '0 0 auto', padding: '16px 24px', borderTop: '1px solid ' + C.border, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button size="sm" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={find}>Find</Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ------------------------------------------------------------------- Leads

const LEADS_COLUMNS = ['Name', 'Email', 'Phone', 'Type', 'Source', 'Status', 'Stage', 'Owner', 'Created On', 'Modified On']

function getLeadFieldValue(r, field) {
  switch (field) {
    case 'Name': return [r.FirstName, r.LastName].filter(Boolean).join(' ')
    case 'Email': return r.EmailAddress
    case 'Phone': return r.Phone || r.Mobile
    case 'Type': return r.LeadType
    case 'Source': return r.Source
    case 'Status': return r.Status
    case 'Stage': return r.ProspectStage
    case 'Owner': return r.OwnerName
    default: return ''
  }
}

function LeadsTab() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [since, setSince] = useState(isoDaysAgo(30))
  const [until, setUntil] = useState(todayIso())
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('All')
  const [stage, setStage] = useState('All')
  const [owner, setOwner] = useState('All')
  const [openDD, setOpenDD] = useState(null)
  const [page, setPage] = useState(1)
  const [hiddenCols, setHiddenCols] = useHiddenColumns('lq_columns_leads')
  const [advSearch, setAdvSearch] = useState(null)
  const [truncated, setTruncated] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const d = await fetchJson(`${API}&mode=leads&since=${since}&until=${until}`)
      setRows(d.rows || [])
      setTruncated(!!d.truncated)
    } catch (e) { setError(e.message); setRows([]) }
    finally { setLoading(false) }
  }, [since, until])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [search, status, stage, owner, advSearch])

  const opts = (key) => ['All', ...Array.from(new Set(rows.map(r => r[key]).filter(Boolean))).sort()]
  const statusOptions = useMemo(() => opts('Status'), [rows])
  const stageOptions = useMemo(() => opts('ProspectStage'), [rows])
  const ownerOptions = useMemo(() => opts('OwnerName'), [rows])

  const filtered = useMemo(() => rows.filter(r => {
    if (status !== 'All' && r.Status !== status) return false
    if (stage !== 'All' && r.ProspectStage !== stage) return false
    if (owner !== 'All' && r.OwnerName !== owner) return false
    if (search) {
      const q = search.toLowerCase()
      const hay = [r.FirstName, r.LastName, r.EmailAddress, r.Phone, r.Mobile].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    if (!matchesAdvSearch(r, getLeadFieldValue, advSearch)) return false
    return true
  }), [rows, status, stage, owner, search, advSearch])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_ROWS))
  const pageRows = filtered.slice((page - 1) * PAGE_ROWS, page * PAGE_ROWS)

  return (
    <>
      <Toolbar>
        <DateRangeRow since={since} until={until} onSince={setSince} onUntil={setUntil} />
        <SearchBox value={search} onChange={setSearch} placeholder="Search name, email, phone…" />
        <AdvancedSearchButton fields={LEADS_COLUMNS} advSearch={advSearch} onApply={setAdvSearch} onClear={() => setAdvSearch(null)} />
        <FilterDropdown label="Status" value={status} options={statusOptions.map(o => ({ v: o, l: o }))} open={openDD === 'status'} onToggle={() => setOpenDD(openDD === 'status' ? null : 'status')} onSelect={v => { setStatus(v); setOpenDD(null) }} />
        <FilterDropdown label="Stage" value={stage} options={stageOptions.map(o => ({ v: o, l: o }))} open={openDD === 'stage'} onToggle={() => setOpenDD(openDD === 'stage' ? null : 'stage')} onSelect={v => { setStage(v); setOpenDD(null) }} />
        <FilterDropdown label="Owner" value={owner} options={ownerOptions.map(o => ({ v: o, l: o }))} open={openDD === 'owner'} onToggle={() => setOpenDD(openDD === 'owner' ? null : 'owner')} onSelect={v => { setOwner(v); setOpenDD(null) }} />
        <Button size="sm" variant="secondary" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</Button>
        <ColumnPickerButton columns={LEADS_COLUMNS} hidden={hiddenCols} onApply={setHiddenCols} />
      </Toolbar>
      {error && <ErrorNote message={error} />}
      {!loading && truncated && <TruncationNote shown={rows.length} label="leads" />}
      {loading ? <InlineLoader label="Loading Leads from LeadSquared" /> : filtered.length === 0 ? <EmptyNote label="No leads match these filters." /> : (
        <>
          <div style={{ overflowX: 'auto', border: '1px solid ' + C.border, borderRadius: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                {!hiddenCols.has('Name') && <Th>Name</Th>}
                {!hiddenCols.has('Email') && <Th>Email</Th>}
                {!hiddenCols.has('Phone') && <Th>Phone</Th>}
                {!hiddenCols.has('Type') && <Th>Type</Th>}
                {!hiddenCols.has('Source') && <Th>Source</Th>}
                {!hiddenCols.has('Status') && <Th>Status</Th>}
                {!hiddenCols.has('Stage') && <Th>Stage</Th>}
                {!hiddenCols.has('Owner') && <Th>Owner</Th>}
                {!hiddenCols.has('Created On') && <Th>Created On</Th>}
                {!hiddenCols.has('Modified On') && <Th>Modified On</Th>}
              </tr></thead>
              <tbody>
                {pageRows.map(r => (
                  <tr key={r.ProspectID}>
                    {!hiddenCols.has('Name') && <Td style={{ fontWeight: 700 }}><a href={LEADSQUARED_CONTACT_URL + r.ProspectID} target="_blank" rel="noreferrer" style={{ color: C.text, textDecoration: 'none' }}>{[r.FirstName, r.LastName].filter(Boolean).join(' ') || '—'}</a></Td>}
                    {!hiddenCols.has('Email') && <Td>{r.EmailAddress || '—'}</Td>}
                    {!hiddenCols.has('Phone') && <Td>{r.Phone || r.Mobile || '—'}</Td>}
                    {!hiddenCols.has('Type') && <Td>{r.LeadType || '—'}</Td>}
                    {!hiddenCols.has('Source') && <Td>{r.Source || '—'}</Td>}
                    {!hiddenCols.has('Status') && <Td><StatusPill value={r.Status} /></Td>}
                    {!hiddenCols.has('Stage') && <Td>{r.ProspectStage || '—'}</Td>}
                    {!hiddenCols.has('Owner') && <Td>{r.OwnerName || '—'}</Td>}
                    {!hiddenCols.has('Created On') && <Td>{fmtDate(r.CreatedOn)}</Td>}
                    {!hiddenCols.has('Modified On') && <Td>{fmtDate(r.ModifiedOn)}</Td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} onPage={setPage} count={filtered.length} label="leads" />
        </>
      )}
    </>
  )
}

// -------------------------------------------------------------- Activities

const ACTIVITIES_BASE_COLUMNS = ['Activity Date', 'Contact', 'Actor', 'Status']

function getActivityFieldValue(r, field) {
  if (field === 'Activity Date') return r.CreatedOn
  if (field === 'Contact') return r.ContactName
  if (field === 'Actor') return r.CreatedByName
  if (field === 'Status') return r.Status
  return (r.Fields && r.Fields[field]) || ''
}

function ActivitiesTab() {
  const [types, setTypes] = useState([])
  const [eventCode, setEventCode] = useState(DEFAULT_ACTIVITY_EVENT_CODE)
  const [rows, setRows] = useState([])
  const [fieldColumns, setFieldColumns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [since, setSince] = useState(isoDaysAgo(7))
  const [until, setUntil] = useState(todayIso())
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('All')
  const [actor, setActor] = useState('All')
  const [openDD, setOpenDD] = useState(null)
  const [page, setPage] = useState(1)
  // Keyed per Activity Type -- each type has its own field set, so a hidden-column
  // choice made for one type shouldn't silently apply to a completely different type.
  const [hiddenCols, setHiddenCols] = useHiddenColumns(`lq_columns_activities_${eventCode}`)
  const allColumns = useMemo(() => [...ACTIVITIES_BASE_COLUMNS, ...fieldColumns], [fieldColumns])
  const [advSearch, setAdvSearch] = useState(null)
  const [truncated, setTruncated] = useState(false)
  const [totalCount, setTotalCount] = useState(null)

  useEffect(() => {
    fetchJson(`${API}&mode=activity_types`).then(d => setTypes(d.rows || [])).catch(() => setTypes([]))
  }, [])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const d = await fetchJson(`${API}&mode=activities&eventCode=${eventCode}&since=${since}&until=${until}`)
      setRows(d.rows || [])
      // Every Activity Type has its own custom-field schema (same as Opportunities) --
      // fieldColumns is the real, ordered list of field labels this specific type uses,
      // resolved server-side via GetActivitySetting, e.g. "Country Interested",
      // "Disposition", "Preferred Course" for Manual Lead Qualification - not a fixed
      // column set, so the table below renders columns dynamically per selected type.
      setFieldColumns(d.fieldColumns || [])
      setTruncated(!!d.truncated)
      setTotalCount(typeof d.totalCount === 'number' ? d.totalCount : null)
    } catch (e) { setError(e.message); setRows([]); setFieldColumns([]) }
    finally { setLoading(false) }
  }, [eventCode, since, until])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [search, status, actor, eventCode, advSearch])
  // Each Activity Type has its own field set -- a saved Advanced Search built against one
  // type's fields (e.g. "Preferred Course") would silently match nothing on a different
  // type, which reads as a bug rather than the real reason ("that field doesn't exist
  // here"). Clearing it on type switch is more honest than a search that quietly stops
  // matching for no visible reason.
  useEffect(() => { setAdvSearch(null) }, [eventCode])

  const typeOptions = useMemo(() => types.map(t => ({ v: String(t.code), l: t.name })), [types])
  const activityTypeName = (typeOptions.find(o => o.v === String(eventCode)) || {}).l || 'Activity Type'

  const statusOptions = useMemo(() => ['All', ...Array.from(new Set(rows.map(r => r.Status).filter(Boolean))).sort()], [rows])
  const actorOptions = useMemo(() => ['All', ...Array.from(new Set(rows.map(r => r.CreatedByName).filter(Boolean))).sort()], [rows])

  const filtered = useMemo(() => rows.filter(r => {
    if (status !== 'All' && r.Status !== status) return false
    if (actor !== 'All' && r.CreatedByName !== actor) return false
    if (search) {
      const q = search.toLowerCase()
      const hay = [r.ContactName, r.CreatedByName, ...Object.values(r.Fields || {})].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    if (!matchesAdvSearch(r, getActivityFieldValue, advSearch)) return false
    return true
  }), [rows, status, actor, search, advSearch])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_ROWS))
  const pageRows = filtered.slice((page - 1) * PAGE_ROWS, page * PAGE_ROWS)

  return (
    <>
      <Toolbar>
        {typeOptions.length === 0
          ? <span style={{ fontSize: 12, color: C.muted, fontStyle: 'italic' }}>Loading activity types…</span>
          : <FilterDropdown label="Activity Type" value={String(eventCode)} options={typeOptions} open={openDD === 'type'} onToggle={() => setOpenDD(openDD === 'type' ? null : 'type')} onSelect={v => { setEventCode(v); setOpenDD(null) }} />}
        <DateRangeRow since={since} until={until} onSince={setSince} onUntil={setUntil} />
        <SearchBox value={search} onChange={setSearch} placeholder="Search contact, details, actor…" />
        <AdvancedSearchButton fields={allColumns} advSearch={advSearch} onApply={setAdvSearch} onClear={() => setAdvSearch(null)} />
        <FilterDropdown label="Status" value={status} options={statusOptions.map(o => ({ v: o, l: o }))} open={openDD === 'status'} onToggle={() => setOpenDD(openDD === 'status' ? null : 'status')} onSelect={v => { setStatus(v); setOpenDD(null) }} />
        <FilterDropdown label="Actor" value={actor} options={actorOptions.map(o => ({ v: o, l: o }))} open={openDD === 'actor'} onToggle={() => setOpenDD(openDD === 'actor' ? null : 'actor')} onSelect={v => { setActor(v); setOpenDD(null) }} />
        <Button size="sm" variant="secondary" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</Button>
        <ColumnPickerButton columns={allColumns} hidden={hiddenCols} onApply={setHiddenCols} />
      </Toolbar>
      <p style={{ fontSize: 11.5, color: C.muted, margin: '0 0 12px' }}>
        LeadSquared's own Manage Activities screen is scoped to one Activity Type at a time too — this isn't a Quantum limitation. Showing <strong style={{ color: C.text }}>{activityTypeName}</strong>.
      </p>
      {error && <ErrorNote message={error} />}
      {!loading && truncated && <TruncationNote shown={rows.length} totalKnown={totalCount} label="activities" />}
      {loading ? <InlineLoader label="Loading Activities from LeadSquared" /> : filtered.length === 0 ? <EmptyNote label="No activities match these filters." /> : (
        <>
          <div style={{ overflowX: 'auto', border: '1px solid ' + C.border, borderRadius: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                {!hiddenCols.has('Activity Date') && <Th>Activity Date</Th>}
                {!hiddenCols.has('Contact') && <Th>Contact</Th>}
                {!hiddenCols.has('Actor') && <Th>Actor</Th>}
                {!hiddenCols.has('Status') && <Th>Status</Th>}
                {fieldColumns.filter(col => !hiddenCols.has(col)).map(col => <Th key={col}>{col}</Th>)}
              </tr></thead>
              <tbody>
                {pageRows.map(r => (
                  <tr key={r.ProspectActivityId}>
                    {!hiddenCols.has('Activity Date') && <Td>{fmtDate(r.CreatedOn)}</Td>}
                    {!hiddenCols.has('Contact') && <Td><ContactLink id={r.RelatedProspectId} name={r.ContactName} /></Td>}
                    {!hiddenCols.has('Actor') && <Td>{r.CreatedByName || '—'}</Td>}
                    {!hiddenCols.has('Status') && <Td><StatusPill value={r.Status} /></Td>}
                    {fieldColumns.filter(col => !hiddenCols.has(col)).map(col => <Td key={col} style={{ color: C.muted }}>{(r.Fields && r.Fields[col]) || '—'}</Td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} onPage={setPage} count={filtered.length} label="activities" />
        </>
      )}
    </>
  )
}

// ----------------------------------------------------------- Opportunities

// Only the fields that are NEVER part of the configured custom-field schema -- Contact,
// Status, Owner and Created On are bespoke row properties on every Opportunity regardless
// of type. Everything else (Opportunity Name, Stage, Source, Intake, both real "Last
// Disposition from ..." fields, and ~100 more) is schema-driven via fieldColumns below,
// resolved server-side from GetOpportunityTypeMetadata -- deliberately NOT special-cased
// as fixed columns the way an earlier version of this page hardcoded 9 of the real ~105
// configured fields and silently dropped the rest.
const OPPORTUNITIES_BASE_COLUMNS = ['Contact', 'Status', 'Owner', 'Created On']

function getOpportunityFieldValue(r, field) {
  switch (field) {
    case 'Contact': return r.ContactName
    case 'Status': return r.Status
    case 'Owner': return r.OwnerName
    case 'Created On': return r.CreatedOn
    default: return (r.Fields && r.Fields[field]) || ''
  }
}

function OpportunitiesTab() {
  const [rows, setRows] = useState([])
  const [fieldColumns, setFieldColumns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [since, setSince] = useState(isoDaysAgo(30))
  const [until, setUntil] = useState(todayIso())
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('All')
  const [stage, setStage] = useState('All')
  const [owner, setOwner] = useState('All')
  const [openDD, setOpenDD] = useState(null)
  const [page, setPage] = useState(1)
  const [hiddenCols, setHiddenCols] = useHiddenColumns('lq_columns_opportunities')
  const allColumns = useMemo(() => [...OPPORTUNITIES_BASE_COLUMNS, ...fieldColumns], [fieldColumns])
  const [advSearch, setAdvSearch] = useState(null)
  const [truncated, setTruncated] = useState(false)
  const [allTimeTotal, setAllTimeTotal] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const statusQ = status !== 'All' ? `&status=${encodeURIComponent(status)}` : ''
      const d = await fetchJson(`${API}&mode=opportunities&eventCode=${DEFAULT_OPPORTUNITY_EVENT_CODE}&since=${since}&until=${until}${statusQ}`)
      setRows(d.rows || [])
      setFieldColumns(d.fieldColumns || [])
      setTruncated(!!d.truncated)
      setAllTimeTotal(typeof d.allTimeTotal === 'number' ? d.allTimeTotal : null)
    } catch (e) { setError(e.message); setRows([]); setFieldColumns([]) }
    finally { setLoading(false) }
  }, [since, until, status])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [search, stage, owner, advSearch])

  const stageOptions = useMemo(() => ['All', ...Array.from(new Set(rows.map(r => r.Fields && r.Fields['Stage']).filter(Boolean))).sort()], [rows])
  const ownerOptions = useMemo(() => ['All', ...Array.from(new Set(rows.map(r => r.OwnerName).filter(Boolean))).sort()], [rows])

  const filtered = useMemo(() => rows.filter(r => {
    if (stage !== 'All' && (r.Fields && r.Fields['Stage']) !== stage) return false
    if (owner !== 'All' && r.OwnerName !== owner) return false
    if (search) {
      const q = search.toLowerCase()
      const hay = [r.ContactName, r.OwnerName, ...Object.values(r.Fields || {})].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    if (!matchesAdvSearch(r, getOpportunityFieldValue, advSearch)) return false
    return true
  }), [rows, stage, owner, search, advSearch])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_ROWS))
  const pageRows = filtered.slice((page - 1) * PAGE_ROWS, page * PAGE_ROWS)

  return (
    <>
      <Toolbar>
        <DateRangeRow since={since} until={until} onSince={setSince} onUntil={setUntil} />
        <SearchBox value={search} onChange={setSearch} placeholder="Search name, source…" />
        <AdvancedSearchButton fields={allColumns} advSearch={advSearch} onApply={setAdvSearch} onClear={() => setAdvSearch(null)} />
        <FilterDropdown label="Status" value={status} options={['All', 'Open', 'Won', 'Lost'].map(o => ({ v: o, l: o }))} open={openDD === 'status'} onToggle={() => setOpenDD(openDD === 'status' ? null : 'status')} onSelect={v => { setStatus(v); setOpenDD(null) }} />
        <FilterDropdown label="Stage" value={stage} options={stageOptions.map(o => ({ v: o, l: o }))} open={openDD === 'stage'} onToggle={() => setOpenDD(openDD === 'stage' ? null : 'stage')} onSelect={v => { setStage(v); setOpenDD(null) }} />
        <FilterDropdown label="Owner" value={owner} options={ownerOptions.map(o => ({ v: o, l: o }))} open={openDD === 'owner'} onToggle={() => setOpenDD(openDD === 'owner' ? null : 'owner')} onSelect={v => { setOwner(v); setOpenDD(null) }} />
        <Button size="sm" variant="secondary" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</Button>
        <ColumnPickerButton columns={allColumns} hidden={hiddenCols} onApply={setHiddenCols} />
      </Toolbar>
      <p style={{ fontSize: 11.5, color: C.muted, margin: '0 0 12px' }}>
        Showing <strong style={{ color: C.text }}>University Admission Opportunity</strong> — this account also tracks Fly Compass, Fly Homes, Forex, Ivy100 and others as separate Opportunity Types, not wired up here yet.
        {typeof allTimeTotal === 'number' && <> This type has <strong style={{ color: C.text }}>{fmtN(allTimeTotal)}</strong> opportunities account-wide, all-time — always far more than any date window will show; that total isn't itself scoped by the date filter above.</>}
      </p>
      {error && <ErrorNote message={error} />}
      {!loading && truncated && <TruncationNote shown={rows.length} label="opportunities" />}
      {loading ? <InlineLoader label="Loading Opportunities from LeadSquared" /> : filtered.length === 0 ? <EmptyNote label="No opportunities match these filters." /> : (
        <>
          <div style={{ overflowX: 'auto', border: '1px solid ' + C.border, borderRadius: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                {!hiddenCols.has('Contact') && <Th>Contact</Th>}
                {!hiddenCols.has('Status') && <Th>Status</Th>}
                {!hiddenCols.has('Owner') && <Th>Owner</Th>}
                {!hiddenCols.has('Created On') && <Th>Created On</Th>}
                {fieldColumns.filter(col => !hiddenCols.has(col)).map(col => <Th key={col}>{col}</Th>)}
              </tr></thead>
              <tbody>
                {pageRows.map(r => (
                  <tr key={r.OpportunityId}>
                    {!hiddenCols.has('Contact') && <Td><ContactLink id={r.RelatedProspectId} name={r.ContactName} /></Td>}
                    {!hiddenCols.has('Status') && <Td><StatusPill value={r.Status} /></Td>}
                    {!hiddenCols.has('Owner') && <Td>{r.OwnerName || '—'}</Td>}
                    {!hiddenCols.has('Created On') && <Td>{fmtDate(r.CreatedOn)}</Td>}
                    {fieldColumns.filter(col => !hiddenCols.has(col)).map(col => (
                      <Td key={col} style={col === 'Opportunity Name' ? { fontWeight: 700 } : { color: C.muted }}>
                        {col === 'Opportunity Name'
                          ? <a href={LEADSQUARED_OPPORTUNITY_URL + r.OpportunityId} target="_blank" rel="noreferrer" style={{ color: C.text, textDecoration: 'none' }}>{(r.Fields && r.Fields[col]) || '—'}</a>
                          : ((r.Fields && r.Fields[col]) || '—')}
                      </Td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} onPage={setPage} count={filtered.length} label="opportunities" />
        </>
      )}
    </>
  )
}

// ------------------------------------------------------------------- Page

const TABS = [
  { key: 'leads', label: 'Leads' },
  { key: 'activities', label: 'Activities' },
  { key: 'opportunities', label: 'Opportunities' },
]

// Page-level "i" -- deliberately for the OWNER, not a metric-calculation explainer like
// every other page's info button. Answers the three questions that came up repeatedly while
// building this page: is this live, how live, and what's the real ceiling on what it shows.
function PageInfoButton() {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(v => !v)} title="What this page can and can't show"
        style={{ width: 30, height: 30, borderRadius: 8, border: '0.5px solid ' + (open ? '#1C9FD4' : C.border), background: open ? '#E8EFF9' : 'var(--card)', color: '#1F3C84', fontSize: 14, fontWeight: 700, fontStyle: 'italic', fontFamily: 'Georgia,serif', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>i</button>
      {open && <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 150 }} />}
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 200, width: 420, maxHeight: '76vh', overflowY: 'auto', background: 'var(--card)', border: '0.5px solid ' + C.border, borderRadius: 12, boxShadow: '0 14px 40px rgba(15,23,42,0.16)', padding: '16px 18px', textAlign: 'left', fontFamily: FONT }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 10 }}>How live is this, and what's the ceiling</div>

          <div style={{ fontSize: 11.5, fontWeight: 700, color: C.text, marginBottom: 3 }}>Live, not cached</div>
          <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.6, margin: '0 0 12px' }}>
            Every page load and every "Refresh" click calls LeadSquared's real API directly, in that moment. Nothing here is pre-computed or snapshotted in Quantum's own database -- what you see is exactly what LeadSquared's own API returns right now for the selected window.
          </p>

          <div style={{ fontSize: 11.5, fontWeight: 700, color: C.text, marginBottom: 3 }}>Row ceiling per load</div>
          <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.6, margin: '0 0 8px' }}>
            LeadSquared's own API caps every single request at 1,000 rows -- Quantum loops multiple requests to go well beyond that:
          </p>
          <ul style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.7, margin: '0 0 12px', paddingLeft: 18 }}>
            <li><strong style={{ color: C.text }}>Leads</strong> -- up to 10,000 rows per load (10 requests).</li>
            <li><strong style={{ color: C.text }}>Opportunities</strong> -- up to 10,000 rows per load (10 requests). Deliberately not "load everything": LeadSquared's own Manage Opportunities screen was measured live at 4,870,025 total for this one Opportunity Type, account-wide, all-time -- narrow the date range for a load that actually captures the window you care about.</li>
            <li><strong style={{ color: C.text }}>Activities</strong> -- up to 5,000 rows per load (5 requests). Deliberately lower still: one Activity Type on this account alone was measured at 15.8 million records account-wide, so looping until "done" isn't realistic or useful here -- narrow the Activity Type or date window instead, same as LeadSquared's own Manage Activities screen expects you to.</li>
          </ul>
          <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.6, margin: '0 0 12px' }}>
            Rows load newest-first, so if a window has more than the ceiling, it's the OLDEST rows in that window that get left out -- and a banner says so on-screen whenever it happens, rather than silently showing a partial set as if it were everything.
          </p>

          <div style={{ fontSize: 11.5, fontWeight: 700, color: C.text, marginBottom: 3 }}>Filtering happens on what's loaded</div>
          <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.6, margin: '0 0 12px' }}>
            Search, the column picker, and Advanced Search all run against the rows already fetched for the current window -- they don't trigger a fresh LeadSquared call per keystroke. Changing the date range, Activity Type, or hitting Refresh does.
          </p>

          <div style={{ fontSize: 11.5, fontWeight: 700, color: C.text, marginBottom: 3 }}>Read-only</div>
          <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.6, margin: 0 }}>
            This page only reads from LeadSquared. Creating, editing, or deleting a Lead/Activity/Opportunity still has to happen in LeadSquared itself.
          </p>
        </div>
      )}
    </div>
  )
}

// Shown above the table whenever the current load hit its row ceiling -- the honest version
// of "here's everything", instead of quietly presenting a partial set as complete.
function TruncationNote({ shown, totalKnown, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 10, background: '#FFFBEB', border: '0.5px solid #FDE68A', color: '#92400E', fontSize: 11.5, marginBottom: 12 }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M12 9v4M12 17h.01" /><circle cx="12" cy="12" r="10" /></svg>
      <span>
        Showing the most recent <strong>{fmtN(shown)}</strong>{totalKnown ? <> of <strong>{fmtN(totalKnown)}</strong> total</> : null} {label} for this window -- there are more than this page loads at once. Narrow the date range{totalKnown ? ' or Activity Type' : ''} to see the rest.
      </span>
    </div>
  )
}

export default function LeadSquaredDashboard() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') || 'leads'
  const setTab = (t) => setSearchParams(prev => { const n = new URLSearchParams(prev); n.set('tab', t); return n })

  return (
    <div className="lq-page-shell" style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.bg, fontFamily: FONT }}>
      <Sidebar />
      <div style={{ margin: '12px 14px 0', borderRadius: 14, border: '1px solid #EEF1F6', boxShadow: '0 1px 3px rgba(31,60,132,0.06)', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <div style={{ background: 'var(--card)', borderBottom: '0.5px solid ' + C.border, padding: '10px 28px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <p style={{ fontSize: 10.5, color: C.muted, margin: 0, letterSpacing: '0.05em', textTransform: 'uppercase', fontFamily: FONT }}>Dashboards / LeadSquared</p>
              <h1 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: '2px 0 10px', letterSpacing: '-0.4px', fontFamily: FONT }}>LeadSquared</h1>
            </div>
            <div style={{ marginTop: 2 }}><PageInfoButton /></div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} className="lq-header-controls">
            {TABS.map(t => <div key={t.key} style={pillStyle(activeTab === t.key)} onClick={() => setTab(t.key)}>{t.label}</div>)}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
          {activeTab === 'leads' && <LeadsTab />}
          {activeTab === 'activities' && <ActivitiesTab />}
          {activeTab === 'opportunities' && <OpportunitiesTab />}
        </div>
      </div>
    </div>
  )
}
