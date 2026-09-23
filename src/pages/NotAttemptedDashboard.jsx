import React, { useState, useEffect, useMemo, useRef } from 'react'
import Sidebar from '../components/Sidebar'
import ExportButton from '../components/ExportButton'
import Button from '../components/Button'
import Dropdown from '../components/Dropdown'
import DateRangePicker from '../components/DateRangePicker'
import { DashboardSkeleton } from '../components/SkeletonLoader'
import { C, FONT, Card, PremKPI, KPI_ICONS, fmtN } from '../ui/dashboardKit'
import { getSession, setSession } from '../lib/sessionLoad'

const LEADSQUARED_OPPORTUNITY_URL = 'https://in21.leadsquared.com/OpportunityManagement/OpportunityDetails?opportunityId='
const LEADSQUARED_OPPORTUNITY_EVENT = '12003'
const LEADSQUARED_CONTACT_URL = 'https://in21.leadsquared.com/LeadManagement/LeadDetails?LeadID='

const DATE_PRESETS = [
  ['today', 'Today'], ['yesterday', 'Yesterday'], ['this_week', 'This Week'],
  ['last_week', 'Last Week'], ['this_month', 'This Month'], ['last_month', 'Last Month'],
]

function fmtYmd(d) { const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0'); return `${y}-${m}-${day}` }
function parseYmd(s) { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
// Monday-start week, matching this app's own convention elsewhere
// (Leverage Careers / Organic & Social's own week math).
function computePreset(key) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const clone = d => new Date(d.getTime())
  if (key === 'today') return { since: fmtYmd(today), until: fmtYmd(today) }
  if (key === 'yesterday') { const y = clone(today); y.setDate(y.getDate() - 1); return { since: fmtYmd(y), until: fmtYmd(y) } }
  if (key === 'this_week') { const s = clone(today); s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); return { since: fmtYmd(s), until: fmtYmd(today) } }
  if (key === 'last_week') { const s = clone(today); s.setDate(s.getDate() - ((s.getDay() + 6) % 7) - 7); const e = clone(s); e.setDate(e.getDate() + 6); return { since: fmtYmd(s), until: fmtYmd(e) } }
  if (key === 'this_month') { const s = new Date(today.getFullYear(), today.getMonth(), 1); return { since: fmtYmd(s), until: fmtYmd(today) } }
  if (key === 'last_month') { const s = new Date(today.getFullYear(), today.getMonth() - 1, 1); const e = new Date(today.getFullYear(), today.getMonth(), 0); return { since: fmtYmd(s), until: fmtYmd(e) } }
  return { since: fmtYmd(today), until: fmtYmd(today) }
}

// Fixed trailing window for the Call Window analysis below -- deliberately
// INDEPENDENT of the header's own date preset/custom range, so it always answers
// "the last 3 months" regardless of whatever narrower window the table itself is
// showing. 3 months (not a longer lookback) is a real cost tradeoff: this endpoint's
// CreatedOn "between" condition doesn't work server-side (see
// fetchAttemptedNotClosedOpportunities's own comment on the backend), so a range
// this wide has to fetch every real matching row and filter client-side --
// "Attempted, Not Closed" is a backlog that never clears, so going back further
// risks a genuinely slow fetch and hitting this endpoint's own pagination cap
// (disclosed honestly via `truncated` if it happens).
function trailingMonthsRange(months) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const s = new Date(today.getFullYear(), today.getMonth() - (months - 1), 1)
  return { since: fmtYmd(s), until: fmtYmd(today) }
}

const VIEWS = [
  {
    key: 'not_attempted',
    mode: 'not_attempted_opportunities',
    label: 'Not Attempted',
    title: 'Not Attempted',
    subtitle: 'Opportunities queued to Futwork or Futwork AI whose Last Disposition is still a "call queued" placeholder — the first call has never actually gone out.',
    kpiLabel: 'Not Attempted',
    kpiSub: 'Queued, no call yet',
    emptyMessage: 'No not-attempted opportunities in this window.',
    infoTitle: 'What "Not Attempted" means',
    infoBody: (
      <>
        <div><b>Human:</b> Last Disposition from Futwork = "Call queued successfully at Futwork".</div>
        <div><b>AI:</b> Last Disposition from Futwork AI = "Call queued successfully at Futwork AI" or "Call queued successfully at AI Futwork".</div>
        <div style={{ marginTop: 6 }}>Either value means the lead was routed but no call has come back with a real disposition yet — not a QL, not a non-QL, just untouched.</div>
      </>
    ),
  },
  {
    key: 'attempted_not_closed',
    mode: 'attempted_not_closed_opportunities',
    label: 'Attempted, Not Closed',
    title: 'Attempted, Not Closed',
    subtitle: 'A real call was made and a real disposition recorded (Not Connected, Disqualified, Schedule Call Back, etc.) — but the Opportunity was never closed out. Status is still Open when it should be Lost.',
    kpiLabel: 'Attempted, Not Closed',
    kpiSub: 'Real disposition, still Open',
    emptyMessage: 'No attempted-but-unclosed opportunities in this window.',
    infoTitle: 'What "Attempted, Not Closed" means',
    infoBody: (
      <>
        <div>A real, terminal disposition (Not Connected, Not Interested, Disqualified, Schedule Call Back, Busy or Improper Response, Voicemail, Wrong Number, Language Barrier, and similar) is present on the Human or AI disposition field — the call genuinely happened.</div>
        <div style={{ marginTop: 6 }}>But the Opportunity's own Status is still "Open" — the agent never moved it to "Lost" after the call. QL dispositions and the "still queued, never attempted" placeholder values are excluded from this view.</div>
        <div style={{ marginTop: 6 }}>This list is built from the real disposition values already observed on this account — a brand-new disposition string LeadSquared hasn't used before wouldn't show up here until added.</div>
        <div style={{ marginTop: 6 }}><b>Disposition Status</b> is a separate, Activity-level field (not the Opportunity's own disposition) — fetched lazily per page, may show "…" briefly while loading.</div>
        <div style={{ marginTop: 6 }}><b>Call Window</b> is the Opportunity's own creation time bucketed into <b>9 AM – 9 PM</b> (green) or <b>9 PM – 9 AM</b> (red) — the window TRAI's National DND rules block unsolicited commercial calls in. The lead still gets called either way, just not in real time if it lands in the red window.</div>
        <div style={{ marginTop: 6 }}>The <b>Call Window — Last 3 Months</b> card above the table is a fixed, independent 3-month window (not tied to the date range picker) — it exists to show a real split across enough volume to be meaningful, since the table's own range can be as narrow as a single day.</div>
      </>
    ),
  },
]

// Timestamp first, per direct feedback. Disposition Status only exists as a concept
// on the Attempted-Not-Closed view (a Not Attempted row has no post-call Activity
// yet, so there's nothing to show) -- computed per-view below.
function columnsForView(viewKey) {
  const cols = [
    { key: 'createdOn', label: 'Opportunity Created On' },
  ]
  // Call Window scoped to Attempted-Not-Closed only, per explicit request -- Not
  // Attempted's table/columns are left exactly as they were.
  if (viewKey === 'attempted_not_closed') cols.push({ key: 'callWindow', label: 'Call Window' })
  cols.push(
    { key: 'opportunityId', label: 'Opportunity ID' },
    { key: 'contactName', label: 'Contact' },
    { key: 'channel', label: 'Channel' },
    { key: 'humanDisposition', label: 'Human Disposition' },
    { key: 'aiDisposition', label: 'AI Disposition' },
  )
  if (viewKey === 'attempted_not_closed') {
    cols.push(
      { key: 'dispositionStatus', label: 'Disposition Status' },
      { key: 'humanAttempts', label: 'Human Attempts' },
      { key: 'aiAttempts', label: 'AI Attempts' },
    )
  }
  cols.push({ key: 'ownerName', label: 'Opportunity Owner' }, { key: 'status', label: 'Status' })
  return cols
}

// TRAI's National DND regulations prohibit unsolicited commercial calls between 9 PM
// and 9 AM IST -- plainly the window itself, not a "catered/not catered" judgment
// about the lead (a lead created at night still gets called, just not in real time,
// per explicit correction). Computed off the already-IST-corrected Opportunity
// Created On the backend now returns.
function callWindowBucket(createdOn) {
  if (!createdOn) return null
  const m = String(createdOn).match(/(\d{2}):(\d{2}):(\d{2})/)
  if (!m) return null
  const hour = Number(m[1])
  return (hour >= 9 && hour < 21) ? '9 AM – 9 PM' : '9 PM – 9 AM'
}

// Scoped to Attempted-Not-Closed's own display only (see the Call Window column
// above) -- Not Attempted keeps the raw "YYYY-MM-DD HH:mm:ss" string untouched.
function formatCreatedOnDisplay(createdOn) {
  if (!createdOn) return '—'
  const m = String(createdOn).match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/)
  if (!m) return createdOn
  const [, y, mo, d, h, mi] = m
  const monthShort = new Date(Number(y), Number(mo) - 1, Number(d)).toLocaleDateString('en-US', { month: 'short' })
  let hour = Number(h)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  hour = hour % 12; if (hour === 0) hour = 12
  return `${Number(d)} ${monthShort}, ${hour}:${mi} ${ampm}`
}

// ---- Advanced filter: same small condition-builder pattern already shipped on Live
// QLs (field / operator / value, any number of conditions combined by one shared
// AND/OR toggle) -- ported here per direct request ("just like Live QLs"), trimmed to
// drop the numeric-only operators/UI since every field on this page is plain text.
const FILTERABLE_FIELDS = [
  { key: 'createdOn', label: 'Opportunity Created On' },
  { key: 'callWindow', label: 'Call Window' },
  { key: 'opportunityId', label: 'Opportunity ID' },
  { key: 'contactName', label: 'Contact' },
  { key: 'channel', label: 'Channel' },
  { key: 'humanDisposition', label: 'Human Disposition' },
  { key: 'aiDisposition', label: 'AI Disposition' },
  { key: 'dispositionStatus', label: 'Disposition Status' },
  { key: 'ownerName', label: 'Opportunity Owner' },
  { key: 'status', label: 'Status' },
]

const OPERATORS = [
  { key: 'is', label: 'is', value: 'select' },
  { key: 'is_not', label: 'is not', value: 'select' },
  { key: 'contains', label: 'contains', value: 'text' },
  { key: 'not_contains', label: 'does not contain', value: 'text' },
  { key: 'starts_with', label: 'starts with', value: 'text' },
  { key: 'ends_with', label: 'ends with', value: 'text' },
  { key: 'defined', label: 'is defined', value: 'none' },
  { key: 'not_defined', label: 'is not defined', value: 'none' },
]
const OPERATOR_MAP = Object.fromEntries(OPERATORS.map(o => [o.key, o]))

function isConditionComplete(c) {
  const op = OPERATOR_MAP[c.operator]
  if (!c.field || !op) return false
  if (op.value === 'none') return true
  return (c.value || '').trim() !== ''
}

function matchesCondition(row, cond) {
  const raw = row[cond.field]
  if (cond.operator === 'defined') return raw != null && String(raw).trim() !== ''
  if (cond.operator === 'not_defined') return raw == null || String(raw).trim() === ''
  const v = raw == null ? '' : String(raw)
  const hay = v.toLowerCase()
  const needle = (cond.value || '').toLowerCase()
  switch (cond.operator) {
    case 'is': return hay === needle
    case 'is_not': return hay !== needle
    case 'contains': return hay.includes(needle)
    case 'not_contains': return !hay.includes(needle)
    case 'starts_with': return hay.startsWith(needle)
    case 'ends_with': return hay.endsWith(needle)
    default: return true
  }
}

let conditionIdCounter = 0
function newCondition() { conditionIdCounter += 1; return { id: 'c' + conditionIdCounter, field: 'channel', operator: 'is', value: '' } }

function conditionSummary(c) {
  const f = FILTERABLE_FIELDS.find(x => x.key === c.field)
  const op = OPERATOR_MAP[c.operator]
  if (!f || !op) return ''
  if (op.value === 'none') return `${f.label} ${op.label}`
  return `${f.label} ${op.label} "${c.value}"`
}

function ValueSelectPopover({ options, onPick, onClose }) {
  const [q, setQ] = useState('')
  const shown = q.trim() ? options.filter(o => o.toLowerCase().includes(q.trim().toLowerCase())) : options
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 250 }} />
      <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 260, width: 220, background: 'var(--card)', border: '1px solid ' + C.border, borderRadius: 10, boxShadow: '0 12px 32px -8px rgba(15,23,42,0.22)', padding: 8 }}>
        <input autoFocus type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Search values…"
          style={{ width: '100%', boxSizing: 'border-box', padding: '6px 9px', border: '0.5px solid ' + C.border, borderRadius: 7, fontSize: 12, fontFamily: FONT, outline: 'none', marginBottom: 6, background: 'var(--bg3)', color: C.text }} />
        <div style={{ maxHeight: 200, overflowY: 'auto' }}>
          {shown.map(o => (
            <button key={o} type="button" onClick={() => onPick(o)}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: FONT, color: C.text, background: 'transparent', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg3)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
              {o}
            </button>
          ))}
          {shown.length === 0 && <div style={{ fontSize: 11.5, color: C.muted, padding: '6px 7px' }}>No values</div>}
        </div>
      </div>
    </>
  )
}

function FieldSelectPopover({ options, onPick, onClose }) {
  const [q, setQ] = useState('')
  const shown = q.trim() ? options.filter(o => o.label.toLowerCase().includes(q.trim().toLowerCase())) : options
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 250 }} />
      <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 260, width: 230, background: 'var(--card)', border: '1px solid ' + C.border, borderRadius: 10, boxShadow: '0 12px 32px -8px rgba(15,23,42,0.22)', padding: 8 }}>
        <input autoFocus type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Search fields…"
          style={{ width: '100%', boxSizing: 'border-box', padding: '6px 9px', border: '0.5px solid ' + C.border, borderRadius: 7, fontSize: 12, fontFamily: FONT, outline: 'none', marginBottom: 6, background: 'var(--bg3)', color: C.text }} />
        <div style={{ maxHeight: 220, overflowY: 'auto' }}>
          {shown.map(o => (
            <button key={o.value} type="button" onClick={() => onPick(o.value)}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: FONT, color: C.text, background: 'transparent', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg3)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
              {o.label}
            </button>
          ))}
          {shown.length === 0 && <div style={{ fontSize: 11.5, color: C.muted, padding: '6px 7px' }}>No fields</div>}
        </div>
      </div>
    </>
  )
}

function ConditionRow({ cond, options, valuePickerOpen, onOpenValuePicker, fieldPickerOpen, onOpenFieldPicker, onChange, onRemove }) {
  const op = OPERATOR_MAP[cond.operator]
  const fieldDef = FILTERABLE_FIELDS.find(f => f.key === cond.field)
  const fieldLabel = (fieldDef || {}).label || cond.field
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', minWidth: 150, flexShrink: 0 }}>
        <button type="button" onClick={onOpenFieldPicker}
          style={{ width: '100%', boxSizing: 'border-box', textAlign: 'left', padding: '6px 9px', border: '0.5px solid ' + C.border, borderRadius: 7, fontSize: 12, fontWeight: 700, fontFamily: FONT, background: 'var(--bg3)', color: C.text, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {fieldLabel}
        </button>
        {fieldPickerOpen && (
          <FieldSelectPopover options={FILTERABLE_FIELDS.map(f => ({ value: f.key, label: f.label }))}
            onPick={v => { onChange({ field: v, operator: 'contains', value: '' }); onOpenFieldPicker() }} onClose={onOpenFieldPicker} />
        )}
      </div>
      <Dropdown value={cond.operator} onChange={v => onChange({ operator: v, value: '' })} minWidth={130}
        options={OPERATORS.map(o => ({ value: o.key, label: o.label }))} />
      {op.value === 'text' && (
        <input type="text" value={cond.value} onChange={e => onChange({ value: e.target.value })} placeholder="Value…"
          style={{ flex: 1, minWidth: 90, boxSizing: 'border-box', padding: '6px 9px', border: '0.5px solid ' + C.border, borderRadius: 7, fontSize: 12, fontFamily: FONT, outline: 'none', background: 'var(--bg3)', color: C.text }} />
      )}
      {op.value === 'select' && (
        <div style={{ position: 'relative', flex: 1, minWidth: 90 }}>
          <button type="button" onClick={onOpenValuePicker}
            style={{ width: '100%', boxSizing: 'border-box', textAlign: 'left', padding: '6px 9px', border: '0.5px solid ' + C.border, borderRadius: 7, fontSize: 12, fontFamily: FONT, background: 'var(--bg3)', color: cond.value ? C.text : C.muted, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {cond.value || 'Select value…'}
          </button>
          {valuePickerOpen && (
            <ValueSelectPopover options={options} onPick={v => { onChange({ value: v }); onOpenValuePicker() }} onClose={onOpenValuePicker} />
          )}
        </div>
      )}
      {op.value === 'none' && <div style={{ flex: 1, minWidth: 90, fontSize: 11.5, color: C.muted, fontStyle: 'italic' }}>no value needed</div>}
      <button type="button" onClick={onRemove} title="Remove condition" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.muted, display: 'flex', alignItems: 'center', padding: 4, flexShrink: 0 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </button>
    </div>
  )
}

function FilterBuilderPopover({ conditions, combinator, filterOptions, onAdd, onUpdate, onRemove, onSetCombinator, onClearAll, onClose }) {
  const [openValueRowId, setOpenValueRowId] = useState(null)
  const [openFieldRowId, setOpenFieldRowId] = useState(null)
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 150 }} />
      <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 200, width: 480, background: 'var(--card)', border: '1px solid ' + C.border, borderRadius: 12, boxShadow: '0 12px 32px -8px rgba(15,23,42,0.22)', padding: 12 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: C.text, marginBottom: 8 }}>Filters</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {conditions.map(c => (
            <ConditionRow key={c.id} cond={c} options={filterOptions[c.field] || []}
              valuePickerOpen={openValueRowId === c.id}
              onOpenValuePicker={() => setOpenValueRowId(v => v === c.id ? null : c.id)}
              fieldPickerOpen={openFieldRowId === c.id}
              onOpenFieldPicker={() => setOpenFieldRowId(v => v === c.id ? null : c.id)}
              onChange={patch => onUpdate(c.id, patch)} onRemove={() => onRemove(c.id)} />
          ))}
        </div>
        <button type="button" onClick={onAdd}
          style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 8, border: '1px dashed ' + C.border, background: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: FONT, color: C.muted }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          Add Filter
        </button>
        {conditions.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, paddingTop: 10, borderTop: '0.5px solid ' + C.border, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11.5, color: C.muted, fontWeight: 700 }}>Match</span>
            <div style={{ display: 'flex', background: 'var(--bg3)', borderRadius: 8, padding: 2 }}>
              {['AND', 'OR'].map(op => (
                <button key={op} type="button" onClick={() => onSetCombinator(op)}
                  style={{ padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, fontFamily: FONT, background: combinator === op ? C.navy : 'transparent', color: combinator === op ? '#fff' : C.muted }}>
                  {op === 'AND' ? 'ALL' : 'ANY'}
                </button>
              ))}
            </div>
            <span style={{ fontSize: 11.5, color: C.muted }}>of the conditions above</span>
          </div>
        )}
        {conditions.length > 0 && (
          <button type="button" onClick={onClearAll} style={{ marginTop: 10, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: C.muted, fontFamily: FONT }}>Clear all</button>
        )}
      </div>
    </>
  )
}

async function fetchJson(url) {
  const r = await fetch(url, { credentials: 'include' })
  if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error(`Request failed (${r.status}) ${t.slice(0, 200)}`) }
  return r.json()
}

function PaginationControl({ page, totalPages, onPrev, onNext }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button onClick={onPrev} disabled={page <= 0} style={{
        width: 26, height: 26, borderRadius: '50%', border: `0.5px solid ${C.border}`, background: 'var(--card)',
        color: page <= 0 ? C.muted : C.text, cursor: page <= 0 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
      </button>
      <span style={{ fontSize: 12, fontWeight: 700, color: C.sub, fontFamily: FONT }}>Page {page + 1} of {totalPages}</span>
      <button onClick={onNext} disabled={page >= totalPages - 1} style={{
        width: 26, height: 26, borderRadius: '50%', border: `0.5px solid ${C.border}`, background: 'var(--card)',
        color: page >= totalPages - 1 ? C.muted : C.text, cursor: page >= totalPages - 1 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
      </button>
    </div>
  )
}

function renderCell(colKey, r, viewKey) {
  switch (colKey) {
    case 'createdOn': return viewKey === 'attempted_not_closed' ? formatCreatedOnDisplay(r.createdOn) : (r.createdOn || '—')
    case 'callWindow': {
      if (!r.callWindow) return '—'
      const isDaytime = r.callWindow === '9 AM – 9 PM'
      // A deliberate, narrow exception to the brand-colors-only rule (same
      // precedent as the Opportunity Owner misassignment flag elsewhere on this
      // page) -- red genuinely signals "outside the real-time-callable window,"
      // not an error state, but the distinction is worth calling out this plainly.
      return <span style={{ fontWeight: 700, color: isDaytime ? C.green : '#DC2626' }}>{r.callWindow}</span>
    }
    case 'opportunityId':
      return <a href={LEADSQUARED_OPPORTUNITY_URL + encodeURIComponent(r.opportunityId) + '&opportunityEvent=' + LEADSQUARED_OPPORTUNITY_EVENT} target="_blank" rel="noreferrer" style={{ color: C.blue, textDecoration: 'none' }}>{r.opportunityId}</a>
    case 'contactName':
      return r.prospectId ? <a href={LEADSQUARED_CONTACT_URL + encodeURIComponent(r.prospectId)} target="_blank" rel="noreferrer" style={{ color: C.blue, textDecoration: 'none' }}>{r.contactName || r.prospectId}</a> : (r.contactName || '—')
    case 'channel': return <span style={{ fontWeight: 700, color: r.channel === 'Human + AI' ? C.navy : C.text }}>{r.channel}</span>
    case 'humanDisposition': return r.humanDisposition || '—'
    case 'aiDisposition': return r.aiDisposition || '—'
    case 'dispositionStatus': return r.dispositionStatus === 'loading' ? '…' : (r.dispositionStatus || '—')
    case 'humanAttempts': return r.humanAttempts === 'loading' ? '…' : (r.humanAttempts == null ? '—' : r.humanAttempts)
    case 'aiAttempts': return r.aiAttempts === 'loading' ? '…' : (r.aiAttempts == null ? '—' : r.aiAttempts)
    case 'ownerName': return r.ownerName || '—'
    case 'status': return r.status || '—'
    default: return r[colKey] || '—'
  }
}

export default function NotAttemptedDashboard() {
  const [viewKey, setViewKey] = useState('not_attempted')
  const view = VIEWS.find(v => v.key === viewKey) || VIEWS[0]
  const columns = useMemo(() => columnsForView(viewKey), [viewKey])
  const [datePreset, setDatePreset] = useState('this_month')
  const [customRange, setCustomRange] = useState(null) // {since, until} when datePreset === 'custom'
  const [dateMenuOpen, setDateMenuOpen] = useState(false)
  const [showCalendar, setShowCalendar] = useState(false)
  const [conditions, setConditions] = useState([])
  const [combinator, setCombinator] = useState('AND')
  const [filterOpen, setFilterOpen] = useState(false)
  const [page, setPage] = useState(0)
  const [infoOpen, setInfoOpen] = useState(false)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [syncedAt, setSyncedAt] = useState(null)
  const [dispositionCache, setDispositionCache] = useState({}) // `${channel}:${prospectId}` -> value | 'loading' | null
  const [attemptCache, setAttemptCache] = useState({}) // `${channel}:${prospectId}` -> count | 'loading' | null
  const pickerRef = useRef(null)

  // Call Window analysis -- a fixed trailing-3-month window, completely independent
  // of the header's own date preset/custom range (see trailingMonthsRange's own
  // comment on why 3 months and not further back). Fetched once per view, on its
  // own schedule -- never blocks or slows the main table's load.
  const CALL_WINDOW_TREND_MONTHS = 3
  const [callWindowTrend, setCallWindowTrend] = useState(null) // { day, night, total, truncated, ts }
  const [callWindowTrendLoading, setCallWindowTrendLoading] = useState(false)
  const [callWindowTrendError, setCallWindowTrendError] = useState(null)

  async function loadCallWindowTrend(force) {
    const trendRange = trailingMonthsRange(CALL_WINDOW_TREND_MONTHS)
    const cacheKey = 'not_attempted_call_window_trend_v1:' + trendRange.since + ':' + trendRange.until
    if (!force) {
      const cached = getSession(cacheKey)
      if (cached) { setCallWindowTrend(cached.data); setCallWindowTrendError(null); return }
    }
    setCallWindowTrendLoading(true); setCallWindowTrendError(null)
    try {
      const d = await fetchJson(`/api/crm-leads?source=leadsquared&mode=attempted_not_closed_opportunities&since=${trendRange.since}&until=${trendRange.until}`)
      let day = 0, night = 0
      ;(d.rows || []).forEach(r => { if (callWindowBucket(r.createdOn) === '9 AM – 9 PM') day++; else night++ })
      const result = { day, night, total: day + night, truncated: !!d.truncated, since: trendRange.since, until: trendRange.until, ts: new Date() }
      setCallWindowTrend(result)
      setSession(cacheKey, result)
    } catch (e) {
      setCallWindowTrendError(e.message || 'Failed to load')
    } finally {
      setCallWindowTrendLoading(false)
    }
  }

  useEffect(() => {
    if (viewKey !== 'attempted_not_closed') return
    loadCallWindowTrend(false)
  }, [viewKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const range = datePreset === 'custom' && customRange ? customRange : computePreset(datePreset)

  async function load(force) {
    const cacheKey = 'not_attempted_v2:' + viewKey + ':' + range.since + ':' + range.until
    if (!force) {
      const cached = getSession(cacheKey)
      if (cached) { setData(cached.data.result); setSyncedAt(cached.data.ts); setPage(0); setDispositionCache({}); setAttemptCache({}); setLoading(false); setError(null); return }
    }
    setLoading(true); setError(null)
    try {
      const presetParam = datePreset !== 'custom' ? `&datePreset=${datePreset}` : ''
      const d = await fetchJson(`/api/crm-leads?source=leadsquared&mode=${view.mode}&since=${range.since}&until=${range.until}${presetParam}`)
      setData(d)
      const ts = new Date()
      setSession(cacheKey, { result: d, ts })
      setSyncedAt(ts)
      setPage(0)
      setDispositionCache({})
      setAttemptCache({})
    } catch (e) {
      setError(e.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(false) }, [viewKey, range.since, range.until]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!dateMenuOpen) return
    const onDoc = e => { if (pickerRef.current && !pickerRef.current.contains(e.target)) { setDateMenuOpen(false); setShowCalendar(false) } }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [dateMenuOpen])

  const currentDateLabel = datePreset === 'custom' && customRange
    ? `${customRange.since} → ${customRange.until}`
    : ((DATE_PRESETS.find(([k]) => k === datePreset) || [])[1] || 'Select range')

  const allRows = data ? data.rows : []

  // Disposition Status is fetched lazily/in the background (Attempted-Not-Closed only) --
  // this merges whatever's already resolved onto each row so filtering/display/export
  // all see the same value, without waiting for the whole dataset to finish loading.
  const enrichedRows = useMemo(() => {
    const withCallWindow = allRows.map(r => ({ ...r, callWindow: callWindowBucket(r.createdOn) }))
    if (viewKey !== 'attempted_not_closed') return withCallWindow
    return withCallWindow.map(r => {
      const key = (r.humanDisposition ? 'human:' : 'ai:') + r.prospectId
      const v = dispositionCache[key]
      return { ...r, dispositionStatus: v }
    })
  }, [allRows, dispositionCache, viewKey])

  // Background warm-up: resolve Disposition Status for every row in the current
  // dataset (not just the visible page) in bulk chunks of 500 -- same reasoning as
  // Live QLs' own owner-enrichment warm-up, so filtering by Disposition Status
  // eventually becomes accurate across the whole loaded window, not just whatever
  // page happens to be on screen.
  useEffect(() => {
    if (viewKey !== 'attempted_not_closed' || !allRows.length) return
    let cancelled = false
    const humanIds = [...new Set(allRows.filter(r => r.humanDisposition && r.prospectId).map(r => r.prospectId))]
    const aiIds = [...new Set(allRows.filter(r => r.aiDisposition && r.prospectId).map(r => r.prospectId))]
    async function warm(channelKey, ids) {
      const CHUNK = 500
      for (let i = 0; i < ids.length; i += CHUNK) {
        if (cancelled) return
        const chunk = ids.slice(i, i + CHUNK)
        try {
          const res = await fetchJson(`/api/crm-leads?source=leadsquared&mode=disposition_status_lookup&channel=${channelKey}&ids=${chunk.join(',')}`)
          if (cancelled) return
          setDispositionCache(prev => {
            const next = { ...prev }
            chunk.forEach(id => { next[`${channelKey}:${id}`] = (res.map && res.map[id]) || null })
            return next
          })
        } catch {
          if (cancelled) return
          setDispositionCache(prev => {
            const next = { ...prev }
            chunk.forEach(id => { next[`${channelKey}:${id}`] = null })
            return next
          })
        }
      }
    }
    warm('human', humanIds)
    warm('ai', aiIds)
    return () => { cancelled = true }
  }, [viewKey, data]) // eslint-disable-line react-hooks/exhaustive-deps

  const filterOptions = useMemo(() => {
    const out = {}
    FILTERABLE_FIELDS.forEach(f => {
      const seen = new Set()
      enrichedRows.forEach(r => { const v = r[f.key]; if (v && v !== 'loading') seen.add(v) })
      out[f.key] = Array.from(seen).sort()
    })
    return out
  }, [enrichedRows])

  function addCondition() { setConditions(prev => [...prev, newCondition()]) }
  function updateCondition(id, patch) { setConditions(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c)) }
  function removeCondition(id) { setConditions(prev => prev.filter(c => c.id !== id)) }

  const activeConditions = useMemo(() => conditions.filter(isConditionComplete), [conditions])

  const filteredRows = useMemo(() => {
    if (!activeConditions.length) return enrichedRows
    return enrichedRows.filter(r => combinator === 'AND'
      ? activeConditions.every(c => matchesCondition(r, c))
      : activeConditions.some(c => matchesCondition(r, c)))
  }, [enrichedRows, activeConditions, combinator])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / 25))
  const safePage = Math.min(page, totalPages - 1)
  const pageRows = filteredRows.slice(safePage * 25, safePage * 25 + 25)

  // Attempt counts need the FULL activity history per contact (heavier than a
  // single-latest lookup) -- confirmed with the user this is fetched lazily for
  // whatever page is actually on screen, not the whole loaded dataset.
  const pageIdsKey = pageRows.map(r => r.prospectId).join(',')
  useEffect(() => {
    if (viewKey !== 'attempted_not_closed') return
    const humanIds = pageRows.filter(r => r.humanDisposition && r.prospectId && !(`human:${r.prospectId}` in attemptCache)).map(r => r.prospectId)
    const aiIds = pageRows.filter(r => r.aiDisposition && r.prospectId && !(`ai:${r.prospectId}` in attemptCache)).map(r => r.prospectId)
    if (!humanIds.length && !aiIds.length) return
    setAttemptCache(prev => {
      const next = { ...prev }
      humanIds.forEach(id => { next[`human:${id}`] = 'loading' })
      aiIds.forEach(id => { next[`ai:${id}`] = 'loading' })
      return next
    })
    ;(async () => {
      const [humanMap, aiMap] = await Promise.all([
        humanIds.length ? fetchJson(`/api/crm-leads?source=leadsquared&mode=attempt_count_lookup&channel=human&ids=${humanIds.join(',')}`).then(r => r.map).catch(() => ({})) : {},
        aiIds.length ? fetchJson(`/api/crm-leads?source=leadsquared&mode=attempt_count_lookup&channel=ai&ids=${aiIds.join(',')}`).then(r => r.map).catch(() => ({})) : {},
      ])
      setAttemptCache(prev => {
        const next = { ...prev }
        humanIds.forEach(id => { next[`human:${id}`] = humanMap[id] != null ? humanMap[id] : null })
        aiIds.forEach(id => { next[`ai:${id}`] = aiMap[id] != null ? aiMap[id] : null })
        return next
      })
    })()
  }, [viewKey, pageIdsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const displayRows = useMemo(() => {
    if (viewKey !== 'attempted_not_closed') return pageRows
    return pageRows.map(r => ({
      ...r,
      humanAttempts: r.humanDisposition ? attemptCache[`human:${r.prospectId}`] : null,
      aiAttempts: r.aiDisposition ? attemptCache[`ai:${r.prospectId}`] : null,
    }))
  }, [pageRows, attemptCache, viewKey])

  const humanCount = allRows.filter(r => r.channel === 'Human' || r.channel === 'Human + AI').length
  const aiCount = allRows.filter(r => r.channel === 'AI' || r.channel === 'Human + AI').length

  const exportRows = useMemo(() => filteredRows.map(r => {
    const o = {}
    columns.forEach(c => {
      // Attempt counts are fetched lazily per visited page only -- export can only
      // ever include whatever's already been resolved into attemptCache, blank for
      // rows on a page never actually viewed. A known, deliberate tradeoff.
      let v = r[c.key]
      if (c.key === 'humanAttempts') v = r.humanDisposition ? attemptCache[`human:${r.prospectId}`] : null
      if (c.key === 'aiAttempts') v = r.aiDisposition ? attemptCache[`ai:${r.prospectId}`] : null
      o[c.label] = (v === 'loading' ? '' : v) || ''
    })
    return o
  }), [filteredRows, columns, attemptCache])

  const rangeLabel = range.since === range.until ? range.since : `${range.since} → ${range.until}`

  return (
    <div className="lq-page-shell" style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)', fontFamily: FONT }}>
      <Sidebar />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flexShrink: 0, padding: '28px 0 0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '0 28px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.text }}>{view.title}</div>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 4, maxWidth: 760 }}>
              {view.subtitle}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, padding: '14px 28px 0' }}>
          {VIEWS.map(v => (
            <button key={v.key} onClick={() => { setViewKey(v.key); setPage(0); setConditions([]) }} style={{
              padding: '8px 16px', borderRadius: 9, border: `0.5px solid ${viewKey === v.key ? C.navy : C.border}`,
              background: viewKey === v.key ? 'var(--navy-tint)' : 'var(--card)', color: viewKey === v.key ? C.navy : C.sub,
              fontSize: 13, fontWeight: 700, fontFamily: FONT, cursor: 'pointer',
            }}>{v.label}</button>
          ))}
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '16px 28px 0',
          padding: '10px 12px', background: 'var(--bg2)', border: `0.5px solid ${C.border}`, borderRadius: 12,
        }}>
          <div ref={pickerRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button onClick={() => { setDateMenuOpen(v => !v); setShowCalendar(false) }} style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px', borderRadius: 8,
              border: `0.5px solid ${dateMenuOpen ? C.navy : C.border}`,
              background: dateMenuOpen ? 'var(--navy-tint)' : 'var(--card)',
              color: dateMenuOpen ? C.navy : C.text, fontSize: 12.5, fontWeight: 700, fontFamily: FONT, cursor: 'pointer',
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
              {currentDateLabel}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 2, transform: dateMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform .1s' }}><polyline points="6 9 12 15 18 9" /></svg>
            </button>
            {dateMenuOpen && (
              <div style={{
                position: 'absolute', left: 0, top: 'calc(100% + 8px)', zIndex: 50, background: 'var(--card)',
                border: `0.5px solid ${C.border}`, borderRadius: 14, boxShadow: '0 20px 60px rgba(15,23,42,0.16), 0 4px 12px rgba(15,23,42,0.06)', overflow: 'hidden',
              }}>
                {!showCalendar ? (
                  <div style={{ padding: 6, minWidth: 170 }}>
                    {DATE_PRESETS.map(([key, label]) => (
                      <button key={key} onClick={() => { setDatePreset(key); setCustomRange(null); setDateMenuOpen(false) }} style={{
                        display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: 'none',
                        background: datePreset === key ? 'var(--navy-tint)' : 'transparent', color: datePreset === key ? C.navy : C.text,
                        fontSize: 13, fontWeight: datePreset === key ? 700 : 500, fontFamily: FONT, cursor: 'pointer',
                      }}>{label}</button>
                    ))}
                    <div style={{ height: 1, background: C.border, margin: '4px 6px' }} />
                    <button onClick={() => setShowCalendar(true)} style={{
                      display: 'flex', alignItems: 'center', gap: 7, width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: 'none',
                      background: datePreset === 'custom' ? 'var(--navy-tint)' : 'transparent', color: datePreset === 'custom' ? C.navy : C.text,
                      fontSize: 13, fontWeight: datePreset === 'custom' ? 700 : 500, fontFamily: FONT, cursor: 'pointer',
                    }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                      Custom range
                    </button>
                  </div>
                ) : (
                  <DateRangePicker from={parseYmd(customRange && customRange.since)} to={parseYmd(customRange && customRange.until)}
                    onChange={(from, to) => { setCustomRange({ since: from, until: to }); setDatePreset('custom'); setDateMenuOpen(false); setShowCalendar(false) }} />
                )}
              </div>
            )}
          </div>
          <div style={{ width: 1, alignSelf: 'stretch', background: C.border, margin: '0 2px' }} />

          <div style={{ position: 'relative' }}>
            <button type="button" onClick={() => setFilterOpen(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8, border: '1px dashed ' + C.border, background: 'transparent', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, fontFamily: FONT, color: C.muted, whiteSpace: 'nowrap' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Filters
            </button>
            {filterOpen && (
              <FilterBuilderPopover conditions={conditions} combinator={combinator} filterOptions={filterOptions}
                onAdd={addCondition} onUpdate={updateCondition} onRemove={removeCondition}
                onSetCombinator={setCombinator} onClearAll={() => setConditions([])}
                onClose={() => setFilterOpen(false)} />
            )}
          </div>
          {activeConditions.map(c => (
            <span key={c.id} onClick={() => setFilterOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 6px 5px 10px', borderRadius: 999, background: 'var(--navy-tint)', color: C.navy, fontSize: 11.5, fontWeight: 700, fontFamily: FONT, whiteSpace: 'nowrap', cursor: 'pointer' }}>
              {conditionSummary(c)}
              <button type="button" onClick={e => { e.stopPropagation(); removeCondition(c.id) }} title="Remove this filter"
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.navy, display: 'flex', alignItems: 'center', padding: 2, borderRadius: '50%' }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </span>
          ))}
          {activeConditions.length > 0 && (
            <button onClick={() => setConditions([])} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: C.muted, fontFamily: FONT }}>Clear all</button>
          )}

          <div style={{ flex: 1 }} />
          {syncedAt && (
            <span style={{ fontSize: 11.5, color: C.muted, fontFamily: FONT }} title={syncedAt.toLocaleString()}>
              Synced {syncedAt.toLocaleTimeString()}
            </span>
          )}
          <Button size="sm" variant="secondary" onClick={() => load(true)} disabled={loading}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginRight: 5, animation: loading ? 'spin 1s linear infinite' : 'none' }}>
              <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            Refresh
          </Button>
          <ExportButton data={exportRows} filename={`${viewKey}_${range.since}_${range.until}`} />
          <div style={{ position: 'relative' }}>
            <button onClick={() => setInfoOpen(v => !v)} style={{
              width: 30, height: 30, borderRadius: 8, border: `0.5px solid ${C.border}`, background: 'var(--card)',
              color: C.sub, fontStyle: 'italic', fontWeight: 700, fontFamily: 'Georgia, serif', cursor: 'pointer',
            }}>i</button>
            {infoOpen && (
              <div style={{
                position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 50, width: 340, background: 'var(--card)',
                border: `0.5px solid ${C.border}`, borderRadius: 12, boxShadow: '0 20px 60px rgba(15,23,42,0.16)', padding: 14, fontSize: 12.5, fontFamily: FONT, color: C.sub, lineHeight: 1.6,
              }}>
                <div style={{ fontWeight: 800, color: C.text, marginBottom: 6 }}>{view.infoTitle}</div>
                {view.infoBody}
                <div style={{ marginTop: 6 }}>Date range filters by the <b>Opportunity's own Created On</b> date, fetched live from LeadSquared on every range change or Refresh.</div>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div style={{ margin: '16px 28px 0', padding: '10px 14px', borderRadius: 10, background: 'var(--navy-tint)', border: `0.5px solid ${C.navy}`, color: C.navy, fontSize: 13, fontFamily: FONT }}>
            {error}
          </div>
        )}
        {data && data.truncated && (
          <div style={{ margin: '16px 28px 0', padding: '10px 14px', borderRadius: 10, background: 'var(--navy-tint)', border: `0.5px solid ${C.navy}`, color: C.navy, fontSize: 13, fontFamily: FONT }}>
            More opportunities exist than this page could fetch in full ({fmtN(data.totalFetched)} fetched) — numbers below reflect only what was retrieved, surfaced honestly rather than silently capped.
          </div>
        )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && !data ? (
          <div style={{ padding: '0 28px', marginTop: 20 }}><DashboardSkeleton /></div>
        ) : (
          <div style={{ opacity: loading ? 0.45 : 1, pointerEvents: loading ? 'none' : 'auto', transition: 'opacity .15s' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, padding: '20px 28px 0' }}>
              <PremKPI label={view.kpiLabel} value={fmtN(allRows.length)} sub={rangeLabel} accent={C.navy} icon={KPI_ICONS.total} />
              <PremKPI label="Human" value={fmtN(humanCount)} sub={view.kpiSub} accent={C.navy} icon={KPI_ICONS.agent} />
              <PremKPI label="AI" value={fmtN(aiCount)} sub={view.kpiSub} accent={C.navy} icon={KPI_ICONS.agent} />
            </div>

            {viewKey === 'attempted_not_closed' && (
              <div style={{ padding: '20px 28px 0' }}>
                <Card title="Call Window — Last 3 Months"
                  sub={callWindowTrend ? `${callWindowTrend.since} → ${callWindowTrend.until} — a fixed window, independent of the date range above` : 'Fixed window, independent of the date range above'}
                  action={
                    <button type="button" onClick={() => loadCallWindowTrend(true)} disabled={callWindowTrendLoading}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, border: `0.5px solid ${C.border}`, background: 'var(--card)', borderRadius: 8, padding: '5px 10px', cursor: callWindowTrendLoading ? 'default' : 'pointer', fontSize: 11.5, fontWeight: 700, fontFamily: FONT, color: C.muted }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ animation: callWindowTrendLoading ? 'spin 1s linear infinite' : 'none' }}>
                        <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                      </svg>
                      Refresh
                    </button>
                  }>
                  {callWindowTrendError ? (
                    <div style={{ color: C.muted, fontSize: 13, fontFamily: FONT }}>{callWindowTrendError}</div>
                  ) : !callWindowTrend ? (
                    <div style={{ color: C.muted, fontSize: 13, fontFamily: FONT }}>{callWindowTrendLoading ? 'Loading…' : '—'}</div>
                  ) : (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, opacity: callWindowTrendLoading ? 0.5 : 1 }}>
                        <div style={{ padding: '14px 16px', borderRadius: 12, border: `0.5px solid ${C.border}`, background: 'var(--card)' }}>
                          <div style={{ fontSize: 11.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>9 AM – 9 PM</div>
                          <div style={{ fontSize: 26, fontWeight: 800, color: C.green, letterSpacing: '-0.5px', marginTop: 4 }}>{fmtN(callWindowTrend.day)}</div>
                          <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{callWindowTrend.total ? Math.round((callWindowTrend.day / callWindowTrend.total) * 1000) / 10 : 0}% of the window</div>
                        </div>
                        <div style={{ padding: '14px 16px', borderRadius: 12, border: `0.5px solid ${C.border}`, background: 'var(--card)' }}>
                          <div style={{ fontSize: 11.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>9 PM – 9 AM</div>
                          <div style={{ fontSize: 26, fontWeight: 800, color: '#DC2626', letterSpacing: '-0.5px', marginTop: 4 }}>{fmtN(callWindowTrend.night)}</div>
                          <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{callWindowTrend.total ? Math.round((callWindowTrend.night / callWindowTrend.total) * 1000) / 10 : 0}% of the window</div>
                        </div>
                      </div>
                      {callWindowTrend.truncated && (
                        <div style={{ marginTop: 10, fontSize: 12, color: C.muted, fontFamily: FONT }}>
                          More opportunities exist in this 3-month window than could be fetched in full — these counts reflect only what was retrieved.
                        </div>
                      )}
                    </>
                  )}
                </Card>
              </div>
            )}

            <div style={{ padding: '20px 28px 0' }}>
              <Card title="Records" sub={`${filteredRows.length} rows — ${columns.length} columns`}
                action={totalPages > 1 ? <PaginationControl page={safePage} totalPages={totalPages} onPrev={() => setPage(safePage - 1)} onNext={() => setPage(safePage + 1)} /> : null}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, fontFamily: FONT }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                        {columns.map(c => (
                          <th key={c.key} style={{ textAlign: 'left', padding: '8px 10px', color: C.muted, fontWeight: 700, whiteSpace: 'nowrap' }}>{c.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {displayRows.length === 0 && (
                        <tr><td colSpan={columns.length} style={{ padding: '20px 10px', textAlign: 'center', color: C.muted }}>{view.emptyMessage}</td></tr>
                      )}
                      {displayRows.map(r => (
                        <tr key={r.opportunityId} style={{ borderBottom: `0.5px solid ${C.border}` }}>
                          {columns.map(c => (
                            <td key={c.key} style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{renderCell(c.key, r, viewKey)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </div>
        )}
        </div>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
