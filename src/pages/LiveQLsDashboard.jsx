import React, { useState, useEffect, useMemo } from 'react'
import Sidebar from '../components/Sidebar'
import ExportButton from '../components/ExportButton'
import Button from '../components/Button'
import Dropdown from '../components/Dropdown'
import { DashboardSkeleton } from '../components/SkeletonLoader'
import { C, FONT, Card, PremKPI, KPI_ICONS, RankedBars, fmtN } from '../ui/dashboardKit'

// Backed by api/crm-leads.js's live_ql_metrics mode -- see the long comment there for why
// this is fast (~10s for both channels combined) where the rest of this app's LeadSquared
// activity pulls take 1-2 minutes: a different search endpoint, a special "opt-today"/
// "opt-yesterday" date keyword LeadSquared's own UI uses internally, and byte-compact JSON
// (both undocumented, both reverse-engineered from LeadSquared's own network traffic).
async function fetchJson(url, opts) {
  const r = await fetch(url, { credentials: 'include', ...opts })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Request failed')
  return d
}

const DATE_PRESETS = [
  ['today', 'Today'], ['yesterday', 'Yesterday'], ['this_week', 'This Week'],
  ['last_week', 'Last Week'], ['this_month', 'This Month'], ['last_month', 'Last Month'],
]

// Same LeadSquared contact deep-link convention used on Human/AI QL Detail and
// Human/AI Unassigned -- prospectId is the Contact record, distinct from the
// activity itself.
const LEADSQUARED_CONTACT_URL = 'https://in21.leadsquared.com/LeadManagement/LeadDetails?LeadID='

// Every field the backend maps for EITHER channel (see LIVE_QL_CHANNELS.fields in
// api/crm-leads.js) -- the single field registry for the records table, export, the
// filter builder, AND the distribution popup. Fields that only exist on one channel
// (marked below) simply render "--" on rows from the other channel. Shared fields
// first, then Human-only, then AI-only.
const FULL_FIELDS = [
  { key: 'country', label: 'Country' },
  { key: 'intake', label: 'Intake' },
  { key: 'budget', label: 'Budget' },
  { key: 'highestQualification', label: 'Highest Qualification' },
  { key: 'preferredDegree', label: 'Preferred Degree' },
  { key: 'disposition', label: 'Disposition' },
  { key: 'dispositionReason', label: 'Disposition Reason' },
  { key: 'firstCampaignName', label: 'First Campaign Name' },
  { key: 'firstChannelSource', label: 'First Channel Source' },
  { key: 'opportunityType', label: 'Opportunity Type' },
  { key: 'validPassport', label: 'Valid Passport' },
  { key: 'currentDegreeStatus', label: 'Current Degree Status' },
  { key: 'callDuration', label: 'Call Duration' },
  { key: 'opportunityCateredBy', label: 'Catered By' },       // Human only
  { key: 'programPreference', label: 'Program Preference' },  // Human only
  { key: 'firstContactChannel', label: 'First Contact Channel' }, // AI only
  { key: 'callStatus', label: 'Call Status' },                // AI only
  { key: 'currentCity', label: 'Current City' },              // AI only
  { key: 'preferredMode', label: 'Preferred Mode' },          // AI only
  { key: 'preferredCourse', label: 'Preferred Course' },      // AI only
  { key: 'futworkProject', label: 'Futwork Project' },        // AI only
]

// ---- Advanced filter: a small condition builder (field / operator / value), any
// number of conditions combined by one shared AND/OR toggle -- not a full nested
// expression tree, since a single combinator covers the vast majority of real use
// (e.g. "Country is UK OR Country is Germany", or "Disposition contains Intent AND
// Budget is defined"). 'select'-type operators pick from a searched list of real
// observed values for that field (via filterOptions below); 'text'-type operators
// take free text, matched case-insensitively; 'none'-type operators need no value.
const OPERATORS = [
  { key: 'is', label: 'is', value: 'select' },
  { key: 'is_not', label: 'is not', value: 'select' },
  { key: 'contains', label: 'contains', value: 'text' },
  { key: 'not_contains', label: 'does not contain', value: 'text' },
  { key: 'like', label: 'like', value: 'text' },
  { key: 'not_like', label: 'not like', value: 'text' },
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
  const v = raw == null ? '' : String(raw)
  if (cond.operator === 'defined') return v.trim() !== ''
  if (cond.operator === 'not_defined') return v.trim() === ''
  const hay = v.toLowerCase()
  const needle = (cond.value || '').toLowerCase()
  switch (cond.operator) {
    case 'is': return hay === needle
    case 'is_not': return hay !== needle
    case 'contains': case 'like': return hay.includes(needle)
    case 'not_contains': case 'not_like': return !hay.includes(needle)
    case 'starts_with': return hay.startsWith(needle)
    case 'ends_with': return hay.endsWith(needle)
    default: return true
  }
}

let conditionIdCounter = 0
function newCondition() { conditionIdCounter += 1; return { id: 'c' + conditionIdCounter, field: 'country', operator: 'contains', value: '' } }

// Small searched single-select popover, used by the 'is'/'is not' operators to pick
// from real observed values for that field -- picking a value sets it and closes.
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

function ConditionRow({ cond, options, valuePickerOpen, onOpenValuePicker, onChange, onRemove }) {
  const op = OPERATOR_MAP[cond.operator]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <Dropdown value={cond.field} onChange={v => onChange({ field: v, value: '' })} minWidth={150}
        options={FULL_FIELDS.map(f => ({ value: f.key, label: f.label }))} />
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
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 150 }} />
      <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 200, width: 480, background: 'var(--card)', border: '1px solid ' + C.border, borderRadius: 12, boxShadow: '0 12px 32px -8px rgba(15,23,42,0.22)', padding: 12 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: C.text, marginBottom: 8 }}>Filters</div>
        {conditions.length === 0 && (
          <div style={{ fontSize: 12, color: C.muted, padding: '4px 0 10px' }}>No conditions yet -- add one below.</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
          {conditions.map(c => (
            <ConditionRow key={c.id} cond={c} options={filterOptions[c.field] || []}
              valuePickerOpen={openValueRowId === c.id}
              onOpenValuePicker={() => setOpenValueRowId(v => v === c.id ? null : c.id)}
              onChange={patch => onUpdate(c.id, patch)} onRemove={() => onRemove(c.id)} />
          ))}
        </div>
        <button type="button" onClick={onAdd}
          style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 8, border: '1px dashed ' + C.border, background: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: FONT, color: C.muted }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          Add condition
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

function DistributionModal({ field, onFieldChange, rows, datePreset, onClose }) {
  const breakdown = useMemo(() => {
    const counts = {}
    rows.forEach(r => { const v = r[field] || '(blank)'; counts[v] = (counts[v] || 0) + 1 })
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [rows, field])
  const max = breakdown.length ? breakdown[0][1] : 0
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 400 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 401,
        width: 'min(560px, 92vw)', maxHeight: '80vh', overflowY: 'auto', background: 'var(--card)',
        borderRadius: 16, boxShadow: '0 24px 64px -12px rgba(15,23,42,0.35)', padding: '20px 24px', fontFamily: FONT,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Distribution</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{fmtN(rows.length)} QLs, {datePreset.replace(/_/g, ' ')} -- respects active filters</div>
          </div>
          <button type="button" onClick={onClose} title="Close"
            style={{ width: 28, height: 28, borderRadius: 8, border: '0.5px solid ' + C.border, background: 'var(--bg3)', color: C.muted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <Dropdown label="Group by" value={field} onChange={onFieldChange} minWidth={220}
          options={FULL_FIELDS.map(f => ({ value: f.key, label: f.label }))} />
        <div style={{ marginTop: 16 }}>
          {breakdown.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: C.muted, fontSize: 13 }}>No data for this selection.</div>
          ) : (
            <RankedBars data={breakdown.map(([label, count]) => ({ label, count }))} labelKey="label" max={max} total={rows.length} color={C.navy} />
          )}
        </div>
      </div>
    </>
  )
}

function PaginationControl({ page, totalPages, onPrev, onNext }) {
  const btnStyle = enabled => ({
    width: 26, height: 26, borderRadius: 7, border: '1px solid ' + C.border,
    background: 'var(--bg3)', color: enabled ? C.navy : C.muted,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: enabled ? 'pointer' : 'default', flexShrink: 0,
  })
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button type="button" disabled={page === 0} onClick={onPrev} style={btnStyle(page > 0)} title="Previous page">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
      </button>
      <span style={{ fontSize: 12, fontWeight: 700, color: C.muted, minWidth: 68, textAlign: 'center', fontFamily: FONT }}>Page {page + 1} of {totalPages}</span>
      <button type="button" disabled={page >= totalPages - 1} onClick={onNext} style={btnStyle(page < totalPages - 1)} title="Next page">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
      </button>
    </div>
  )
}

const KPI_CARD_ROW = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, padding: '0 28px', marginTop: 16 }

export default function LiveQLsDashboard() {
  const [datePreset, setDatePreset] = useState('today')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [syncedAt, setSyncedAt] = useState(null)
  const [conditions, setConditions] = useState([])
  const [combinator, setCombinator] = useState('AND')
  const [filterOpen, setFilterOpen] = useState(false)
  const [distributionOpen, setDistributionOpen] = useState(false)
  const [distributionField, setDistributionField] = useState('country')
  const [page, setPage] = useState(0)
  const [showInfo, setShowInfo] = useState(false)
  const PAGE_SIZE = 25

  async function load() {
    setLoading(true); setError(null)
    try {
      const d = await fetchJson(`/api/crm-leads?source=leadsquared&mode=live_ql_metrics&date=${datePreset}`)
      setData(d)
      setSyncedAt(new Date())
      setPage(0)
    } catch (e) {
      setError(e.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [datePreset]) // eslint-disable-line react-hooks/exhaustive-deps

  // Human + AI rows unified into one list, each tagged with its own channel -- every row
  // already carries the SAME field keys (country/intake/budget/...) regardless of channel,
  // since the backend maps each channel's own mx_Custom_N numbering onto one shared key set.
  const allRows = useMemo(() => {
    if (!data) return []
    const h = (data.human.rows || []).map(r => ({ ...r, channel: 'human' }))
    const a = (data.ai.rows || []).map(r => ({ ...r, channel: 'ai' }))
    return [...h, ...a]
  }, [data])

  // Distinct observed values per field, for the 'is'/'is not' operators' value picker.
  const filterOptions = useMemo(() => {
    const out = {}
    FULL_FIELDS.forEach(f => {
      const seen = new Set()
      allRows.forEach(r => { const v = r[f.key]; if (v) seen.add(v) })
      out[f.key] = Array.from(seen).sort()
    })
    return out
  }, [allRows])

  const activeConditions = useMemo(() => conditions.filter(isConditionComplete), [conditions])

  const filteredRows = useMemo(() => {
    if (!activeConditions.length) return allRows
    return allRows.filter(r => combinator === 'AND'
      ? activeConditions.every(c => matchesCondition(r, c))
      : activeConditions.some(c => matchesCondition(r, c)))
  }, [allRows, activeConditions, combinator])

  const humanQL = filteredRows.filter(r => r.channel === 'human').length
  const aiQL = filteredRows.filter(r => r.channel === 'ai').length
  const totalQL = humanQL + aiQL
  const humanQueued = data ? data.human.queuedCount : 0
  const aiQueued = data ? data.ai.queuedCount : 0
  const totalQueued = humanQueued + aiQueued
  // Queued -> QL % is a conversion-rate health metric, so like the Queued cards
  // themselves it deliberately ignores the active filters -- both sides use the
  // channels' own unfiltered qlCount, not the (possibly narrowed) filteredRows count,
  // so a filter can't quietly change what this ratio means.
  const totalQlUnfiltered = data ? data.human.qlCount + data.ai.qlCount : 0
  const queuedToQlPct = totalQueued > 0 ? (totalQlUnfiltered / totalQueued) * 100 : null

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  // Clamped rather than reset-via-effect: a filter change can shrink the result set out
  // from under whatever page was showing, and this way there's no dependency list to keep
  // in sync -- it's simply never possible to be looking at a page that doesn't exist.
  const safePage = Math.min(page, totalPages - 1)
  const pageRows = filteredRows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  const exportRows = filteredRows.map(r => {
    const row = { Channel: r.channel === 'human' ? 'Human' : 'AI', 'Created On': r.createdOn, 'Prospect ID': r.prospectId || '' }
    FULL_FIELDS.forEach(f => { row[f.label] = r[f.key] || '' })
    return row
  })

  function addCondition() { setConditions(prev => [...prev, newCondition()]) }
  function updateCondition(id, patch) { setConditions(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c)) }
  function removeCondition(id) { setConditions(prev => prev.filter(c => c.id !== id)) }

  return (
    <div className="lq-page-shell" style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.bg, fontFamily: FONT }}>
      <Sidebar />
      <div style={{ margin: '12px 14px 0', borderRadius: 14, border: '1px solid ' + C.border, boxShadow: '0 1px 3px rgba(31,60,132,0.06)', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <div style={{
          background: 'var(--card)', borderBottom: '0.5px solid ' + C.border,
          padding: '0 28px', minHeight: 56, height: 'auto', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 12, flexShrink: 0, overflow: 'visible',
        }}>
          <div>
            <p style={{ fontSize: 10.5, color: C.muted, margin: 0, letterSpacing: '0.05em', textTransform: 'uppercase', fontFamily: FONT }}>Dashboards / Live QLs</p>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: '2px 0 0', letterSpacing: '-0.4px', fontFamily: FONT }}>Live QLs</h1>
          </div>
          <div className="lq-header-controls" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', overflow: 'visible', minWidth: 0, padding: '8px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: '#F8FAFC', padding: '6px 10px', borderRadius: 12, border: '0.5px solid #E5E7EB' }}>
              <Dropdown label="Date" value={datePreset} onChange={setDatePreset} minWidth={130}
                options={DATE_PRESETS.map(([key, label]) => ({ value: key, label }))} />

              <div style={{ position: 'relative' }}>
                <button type="button" onClick={() => setFilterOpen(v => !v)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: '1px dashed ' + C.border, background: activeConditions.length ? C.navyBg : 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: FONT, color: activeConditions.length ? C.navy : C.muted, whiteSpace: 'nowrap' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  {activeConditions.length ? `Filters (${activeConditions.length})` : 'Filters'}
                </button>
                {filterOpen && (
                  <FilterBuilderPopover conditions={conditions} combinator={combinator} filterOptions={filterOptions}
                    onAdd={addCondition} onUpdate={updateCondition} onRemove={removeCondition}
                    onSetCombinator={setCombinator} onClearAll={() => setConditions([])}
                    onClose={() => setFilterOpen(false)} />
                )}
              </div>
              {activeConditions.length > 0 && (
                <button onClick={() => setConditions([])} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: C.muted, fontFamily: FONT }}>Clear all</button>
              )}

              <Button size="sm" variant="secondary" onClick={() => setDistributionOpen(true)}
                icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M7 15l4-6 4 3 5-8" /></svg>}>
                Distribution
              </Button>

              {syncedAt && !loading && (
                <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>Synced {syncedAt.toLocaleTimeString()}</span>
              )}
              <Button size="sm" variant="secondary" onClick={load} disabled={loading}
                icon={
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                    style={{ animation: loading ? 'spin .8s linear infinite' : 'none' }}>
                    <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                }>
                {loading ? 'Refreshing' : 'Refresh'}
              </Button>
              <ExportButton data={exportRows} filename={`live-qls-${datePreset}`} />

              <div style={{ position: 'relative' }}>
                <button onClick={() => setShowInfo(v => !v)}
                  style={{
                    width: 30, height: 30, borderRadius: 8, border: '0.5px solid ' + C.border,
                    background: showInfo ? C.navyBg : 'var(--card)', color: C.navy,
                    fontSize: 14, fontWeight: 700, fontStyle: 'italic', fontFamily: 'Georgia,serif',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>i</button>
                {showInfo && <div onClick={() => setShowInfo(false)} style={{ position: 'fixed', inset: 0, zIndex: 150 }} />}
                {showInfo && (
                  <div style={{
                    position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 200,
                    width: 340, background: 'var(--card)', border: '0.5px solid ' + C.border,
                    borderRadius: 12, boxShadow: '0 14px 40px rgba(15,23,42,0.16)',
                    padding: '16px 18px', fontFamily: FONT,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>How this page is computed</div>
                    {[
                      ['QL', 'An activity counts as a QL when its Note = Post (call actually completed, not still queued), Disposition Status = Final, and Disposition is one of 9 confirmed values (e.g. Discover Future Intent, Interested in Call Back, Call Transferred To Counsellor).'],
                      ['Human / AI', 'Human = Manual Lead Qualification - Futwork (activity type 234). AI = Futwork AI Call Qualification (activity type 253). Each has its own field numbering in LeadSquared; both are normalized to the same field names here.'],
                      ['Queued', 'Note = "Call queued successfully" for that channel -- calls that haven’t been actioned yet. Always shown unfiltered, regardless of the filters above.'],
                      ['Queued to QL %', 'Total QLs ÷ Total Queued, both unfiltered -- how much of everyone queued so far became a QL. Not affected by filters, same as the Queued cards.'],
                      ['Source', 'Pulled live from LeadSquared’s own Activity Advanced Search API, not a scheduled sync -- every date preset re-fetches fresh.'],
                      ['Filters', 'Build any number of field/operator/value conditions and combine them with ALL (AND) or ANY (OR). Narrows the Records table, the Distribution popup, and the QL KPI cards -- Queued counts are never affected.'],
                    ].map(([m, d]) => (
                      <div key={m} style={{ display: 'flex', gap: 10, padding: '7px 0', borderTop: '0.5px solid #F3F4F6' }}>
                        <div style={{ fontSize: 11.5, fontWeight: 700, color: C.navy, width: 80, flexShrink: 0 }}>{m}</div>
                        <div style={{ fontSize: 11.5, color: C.sub, lineHeight: 1.5 }}>{d}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && !data ? (
            <DashboardSkeleton />
          ) : error ? (
            <div style={{ padding: 28, color: '#B91C1C', fontSize: 13 }}>{error}</div>
          ) : (
            <>
              <div className="lq-kpi-grid" style={{ ...KPI_CARD_ROW, marginTop: 20 }}>
                <PremKPI label="Total Queued" value={fmtN(totalQueued)} sub="Human + AI" accent={C.green} icon={KPI_ICONS.total} />
                <PremKPI label="Human Queued" value={fmtN(humanQueued)} sub="not yet actioned, unfiltered" accent={C.green} icon={KPI_ICONS.agent} />
                <PremKPI label="AI Queued" value={fmtN(aiQueued)} sub="not yet actioned, unfiltered" accent={C.green} icon={KPI_ICONS.bot} />
                <PremKPI label="Total QLs" value={fmtN(totalQL)} sub="Human + AI" accent={C.navy} icon={KPI_ICONS.total} />
                <PremKPI label="Human QLs" value={fmtN(humanQL)} sub={data && data.human.qlCount !== humanQL ? `of ${fmtN(data.human.qlCount)} unfiltered` : 'Manual Lead Qualification'} accent={C.blue} icon={KPI_ICONS.agent} />
                <PremKPI label="AI QLs" value={fmtN(aiQL)} sub={data && data.ai.qlCount !== aiQL ? `of ${fmtN(data.ai.qlCount)} unfiltered` : 'Futwork AI Call Qualification'} accent={C.cyan} icon={KPI_ICONS.bot} />
                <PremKPI label="Queued to QL %" value={queuedToQlPct == null ? '—' : `${queuedToQlPct.toFixed(1)}%`} sub="Total QLs / Total Queued, unfiltered" accent={C.navy} icon={KPI_ICONS.total} />
              </div>

              <div style={{ padding: '16px 28px 28px' }}>
                {/* Only one table on this page by design. Every field the backend maps for
                    either channel (FULL_FIELDS above), plus Channel/Created On/a linked
                    Prospect ID -- genuinely "every field coming with the activity". Full
                    width, scrolls horizontally inside its own card rather than the whole
                    page scrolling sideways. Pagination lives in the card's own header (via
                    the `action` slot) instead of a plain text strip under the table. */}
                <Card title="Records" sub={`${fmtN(filteredRows.length)} rows -- ${FULL_FIELDS.length + 3} columns`}
                  action={totalPages > 1 ? <PaginationControl page={safePage} totalPages={totalPages} onPrev={() => setPage(safePage - 1)} onNext={() => setPage(safePage + 1)} /> : null}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid ' + C.border, textAlign: 'left' }}>
                          {['Channel', 'Created On', 'Prospect ID', ...FULL_FIELDS.map(f => f.label)].map(h => (
                            <th key={h} style={{ padding: '8px 10px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', fontSize: 10.5, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pageRows.map(r => (
                          <tr key={r.id} style={{ borderBottom: '1px solid ' + C.border }}>
                            <td style={{ padding: '7px 10px', fontWeight: 700, color: r.channel === 'human' ? C.blue : C.cyan, whiteSpace: 'nowrap' }}>{r.channel === 'human' ? 'Human' : 'AI'}</td>
                            <td style={{ padding: '7px 10px', color: C.text, whiteSpace: 'nowrap' }}>{r.createdOn}</td>
                            <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                              {r.prospectId ? (
                                <a href={LEADSQUARED_CONTACT_URL + encodeURIComponent(r.prospectId)} target="_blank" rel="noreferrer"
                                  title={'Open Contact in LeadSquared: ' + r.prospectId}
                                  style={{ fontFamily: 'monospace', fontSize: 11, color: C.blue, textDecoration: 'none' }}>{r.prospectId.slice(0, 8)}…</a>
                              ) : '—'}
                            </td>
                            {FULL_FIELDS.map(f => (
                              <td key={f.key} style={{ padding: '7px 10px', color: C.text }}>{r[f.key] || '—'}</td>
                            ))}
                          </tr>
                        ))}
                        {pageRows.length === 0 && (
                          <tr><td colSpan={FULL_FIELDS.length + 3} style={{ padding: '18px 10px', textAlign: 'center', color: C.muted }}>No records.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            </>
          )}
        </div>
      </div>

      {distributionOpen && (
        <DistributionModal field={distributionField} onFieldChange={setDistributionField} rows={filteredRows}
          datePreset={datePreset} onClose={() => setDistributionOpen(false)} />
      )}
    </div>
  )
}
