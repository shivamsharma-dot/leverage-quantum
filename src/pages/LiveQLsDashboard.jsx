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
// Same LeadSquared opportunity deep-link convention used on Human/AI QL Detail --
// opportunityId is the University Admission Opportunity this QL call is for
// (Human's "Relevant Opportunity ID" / AI's "Opportunity ID" custom fields, per
// GetActivitySetting -- see LIVE_QL_CHANNELS.fields in api/crm-leads.js).
const LEADSQUARED_OPPORTUNITY_URL = 'https://in21.leadsquared.com/OpportunityManagement/OpportunityDetails?opportunityId='
const LEADSQUARED_OPPORTUNITY_EVENT = '12003'

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

// Field registry for the Advanced Filter's Field dropdown only -- a superset of
// FULL_FIELDS (which also drives the table columns/export/distribution). Opportunity
// Owner is a derived field merged onto each row from the async owner lookup (see
// enrichedRows below), not one of the backend's own activity fields, so it's kept out
// of FULL_FIELDS deliberately -- it already has its own dedicated table column and
// shouldn't also get folded into the generic "every activity field" column set.
const FILTERABLE_FIELDS = [{ key: 'channelLabel', label: 'Channel' }, ...FULL_FIELDS, { key: 'ownerName', label: 'Opportunity Owner' }]

// LeadSquared's own resolved display names for the two vendor/bot placeholder owners a
// lead can be left sitting under instead of a real floor owner -- confirmed live
// (2026-09-11) against this account's real Users.Get data. A third, "Superbot", exists
// too but wasn't named in the request, so it's deliberately left out of this flag.
const MISASSIGNED_OWNER_NAMES = new Set(['Futwork', 'Futwork AI'])

// Absolute elapsed time between two LeadSquared date strings ("YYYY-MM-DD HH:MM:SS",
// no timezone suffix), auto-scaled to the largest unit that reads naturally -- seconds
// under a minute, minutes under an hour, hours under a day, days beyond that. Both
// inputs come from the same source (LeadSquared, India Standard Time) so a naive
// same-assumption parse is safe for a DIFFERENCE even without an explicit TZ.
function formatDurationSeconds(diffSec) {
  if (diffSec < 60) return Math.round(diffSec) + 's'
  const diffMin = diffSec / 60
  if (diffMin < 60) return Math.round(diffMin) + 'm'
  const diffHr = diffMin / 60
  if (diffHr < 24) return diffHr.toFixed(1) + 'h'
  return (diffHr / 24).toFixed(1) + 'd'
}
function formatDurationBetween(aStr, bStr) {
  if (!aStr || !bStr) return null
  const a = new Date(aStr.replace(' ', 'T'))
  const b = new Date(bStr.replace(' ', 'T'))
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return null
  return formatDurationSeconds(Math.abs((a.getTime() - b.getTime()) / 1000))
}

// "Owner Assigned On" is LeadSquared's "Current Owner Assignment Time" -- a live,
// mutable field. Confirmed live against real data (2026-09-11): it very often reflects
// a REASSIGNMENT that happens AFTER a given QL call, not an assignment that preceded
// it (e.g. an automated post-QL routing/distribution step -- this account has a
// "Distribute Opportunity" field for exactly that) -- confirmed by reconciling real
// rows where (Opp Created -> QL) + (Owner Assigned -> QL) exactly equalled (Owner
// Assigned - Opp Created), which only holds when the QL call came BEFORE the owner
// assignment. So the natural business order here is Call, then (later) Owner
// Assigned -- this reports that direction as the plain/normal case, and calls out the
// atypical one (the owner was already assigned before this particular call) instead
// of hiding either direction with Math.abs().
function formatCallToOwnerAssign(qlCallStr, ownerAssignedOnStr) {
  if (!qlCallStr || !ownerAssignedOnStr) return null
  const call = new Date(qlCallStr.replace(' ', 'T'))
  const assigned = new Date(ownerAssignedOnStr.replace(' ', 'T'))
  if (isNaN(call.getTime()) || isNaN(assigned.getTime())) return null
  const mag = formatDurationSeconds(Math.abs((assigned.getTime() - call.getTime()) / 1000))
  return assigned.getTime() >= call.getTime() ? mag : mag + ' before'
}

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
        options={FILTERABLE_FIELDS.map(f => ({ value: f.key, label: f.label }))} />
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
        {/* Deliberately no maxHeight/overflowY here -- a scrollable ancestor clips any
            position:absolute descendant to its own box regardless of z-index, which was
            silently trapping the Field/Operator Dropdown's option list (and the value
            picker) inside an ~40px sliver whenever this list was short, making every
            dropdown in the filter builder invisible and unclickable. Confirmed live via
            elementFromPoint + getBoundingClientRect before this fix, and confirmed fixed
            the same way after. If this ever needs a height cap again for many conditions,
            it has to go on the OUTER popover (still with the same caveat), never here. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
          options={FILTERABLE_FIELDS.map(f => ({ value: f.key, label: f.label }))} />
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
  // opportunityId -> { ownerName, createdOn, ownerAssignedOn } | 'loading' | 'error'.
  // Fetched lazily, only for whichever rows are on the CURRENTLY VISIBLE page -- see the
  // effect below and the backend comment on fetchLiveQlOpportunityOwners.
  const [ownerCache, setOwnerCache] = useState({})
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

  // allRows + whatever's currently resolved in ownerCache, merged so 'ownerName' /
  // 'ownerAssignedOn' / 'oppCreatedOn' behave like any other field on the row -- the
  // Advanced Filter's generic matchesCondition(row, cond) reads row[cond.field] with no
  // special-casing, so this is what makes "Opportunity Owner" filterable at all. Before a
  // given opportunityId's lookup resolves these are simply null/undefined on the row (an
  // owner-based filter won't match it yet, same as any other field with no value).
  const enrichedRows = useMemo(() => allRows.map(r => {
    const o = r.opportunityId ? ownerCache[r.opportunityId] : null
    const od = o && typeof o === 'object' ? o : null
    return {
      ...r,
      // Matches exactly what the table already displays ("Human"/"AI"), so the filter's
      // value picker doesn't show the raw lowercase channel key instead.
      channelLabel: r.channel === 'human' ? 'Human' : 'AI',
      ownerName: od ? od.ownerName : null, ownerAssignedOn: od ? od.ownerAssignedOn : null, oppCreatedOn: od ? od.createdOn : null,
    }
  }), [allRows, ownerCache])

  // Fields where every fetched row for the ACTIVE date window came back blank are hidden
  // from the table entirely, per explicit request -- "if it came always blank, dont show
  // it." Scoped to allRows (the whole window, not just the visible page) so this is an
  // honest read of the real data, not a guess from a small sample; it can genuinely differ
  // between windows (a field blank for "Today" may be populated for "Last Month"), which is
  // the correct, data-driven behavior for what was asked, not a bug.
  const visibleFields = useMemo(() => (
    FULL_FIELDS.filter(f => allRows.some(r => r[f.key] != null && r[f.key] !== ''))
  ), [allRows])

  // Distinct observed values per field, for the 'is'/'is not' operators' value picker.
  // Reads enrichedRows (not allRows) so "Opportunity Owner" gets real options as owner
  // data resolves in the background, rather than staying permanently empty.
  const filterOptions = useMemo(() => {
    const out = {}
    FILTERABLE_FIELDS.forEach(f => {
      const seen = new Set()
      enrichedRows.forEach(r => { const v = r[f.key]; if (v) seen.add(v) })
      out[f.key] = Array.from(seen).sort()
    })
    return out
  }, [enrichedRows])

  const activeConditions = useMemo(() => conditions.filter(isConditionComplete), [conditions])

  const filteredRows = useMemo(() => {
    if (!activeConditions.length) return enrichedRows
    return enrichedRows.filter(r => combinator === 'AND'
      ? activeConditions.every(c => matchesCondition(r, c))
      : activeConditions.some(c => matchesCondition(r, c)))
  }, [enrichedRows, activeConditions, combinator])

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

  // Opportunity Owner / Owner Assigned On / Opportunity Created On come from a separate
  // per-Opportunity LeadSquared lookup (see fetchLiveQlOpportunityOwners in
  // api/crm-leads.js), not the activity fields above -- fetched only for whichever
  // opportunityIds are on the page actually being looked at right now, and cached by id so
  // paging back to an already-seen page is instant.
  useEffect(() => {
    const ids = [...new Set(pageRows.map(r => r.opportunityId).filter(Boolean))]
      .filter(id => !ownerCache[id])
    if (!ids.length) return
    setOwnerCache(prev => { const next = { ...prev }; ids.forEach(id => { next[id] = 'loading' }); return next })
    fetchJson(`/api/crm-leads?source=leadsquared&mode=live_ql_opportunity_owners&ids=${ids.map(encodeURIComponent).join(',')}`)
      .then(d => {
        setOwnerCache(prev => {
          const next = { ...prev }
          ;(d.rows || []).forEach(r => { next[r.opportunityId] = r.error ? 'error' : r })
          return next
        })
      })
      .catch(() => {
        setOwnerCache(prev => { const next = { ...prev }; ids.forEach(id => { next[id] = 'error' }); return next })
      })
  }, [pageRows]) // eslint-disable-line react-hooks/exhaustive-deps

  // Background warm-up covering the WHOLE loaded window (allRows, not filteredRows), so
  // (a) Export has real Owner/Owner Assigned On/Opportunity Created On data instead of
  // blanks for rows nobody happened to page through, and (b) filtering BY Opportunity
  // Owner actually has something to match against -- if this only ever warmed the
  // filtered set, an Owner condition could never see data for the very rows it needs to
  // decide on, since they'd be excluded from "filtered" until the filter already matched
  // them (a bootstrap problem). The backend now resolves a whole chunk in ONE bulk
  // LeadSquared search (see fetchLiveQlOpportunityOwners in api/crm-leads.js -- switched
  // off a per-opportunity API call, which was the actual rate-limit risk) rather than one
  // LeadSquared call per id, so a 500-id chunk costs the SAME single request as a 5-id
  // one -- capped at 10,000 distinct opportunities as a hard ceiling (a realistic window
  // is far smaller than this; still cheap even here, at most 20 requests total). Cancelled
  // and restarted whenever the loaded window itself changes (a new date preset/Refresh).
  const LIVE_QL_OWNER_WARM_CAP = 10000
  const LIVE_QL_OWNER_CHUNK_SIZE = 500 // matches LIVE_QL_OWNER_BULK_MAX on the backend
  useEffect(() => {
    let cancelled = false
    const allIds = [...new Set(allRows.map(r => r.opportunityId).filter(Boolean))]
    const toFetch = allIds.filter(id => !ownerCache[id]).slice(0, LIVE_QL_OWNER_WARM_CAP)
    if (!toFetch.length) return
    // Mark EVERY queued id as 'loading' up front, not just the current chunk -- previously
    // an id still waiting its turn had no cache entry at all, which rendered as a plain "—"
    // (looking identical to "resolved, no data") instead of "…" (still queued). On a wide
    // window this loop can take a while to reach the back of the queue, so that dash was
    // actively misleading about why not everything had a real value yet.
    setOwnerCache(prev => { const next = { ...prev }; toFetch.forEach(id => { if (!next[id]) next[id] = 'loading' }); return next })
    ;(async () => {
      for (let i = 0; i < toFetch.length; i += LIVE_QL_OWNER_CHUNK_SIZE) {
        if (cancelled) return
        const chunk = toFetch.slice(i, i + LIVE_QL_OWNER_CHUNK_SIZE)
        try {
          const d = await fetchJson(`/api/crm-leads?source=leadsquared&mode=live_ql_opportunity_owners&ids=${chunk.map(encodeURIComponent).join(',')}`)
          if (cancelled) return
          setOwnerCache(prev => {
            const next = { ...prev }
            ;(d.rows || []).forEach(r => { next[r.opportunityId] = r.error ? 'error' : r })
            return next
          })
        } catch {
          if (cancelled) return
          setOwnerCache(prev => { const next = { ...prev }; chunk.forEach(id => { next[id] = 'error' }); return next })
        }
      }
    })()
    return () => { cancelled = true }
  }, [allRows]) // eslint-disable-line react-hooks/exhaustive-deps

  // Progress shown right next to Export -- deliberately measured against filteredRows
  // (what will actually be exported / is currently on screen), not the broader allRows
  // the fetch loop above warms, so this reads as "how ready is what I'm looking at."
  const ownerWarmStats = useMemo(() => {
    const ids = [...new Set(filteredRows.map(r => r.opportunityId).filter(Boolean))]
    const resolved = ids.filter(id => ownerCache[id] && ownerCache[id] !== 'loading').length
    return { total: ids.length, resolved, capped: ids.length > LIVE_QL_OWNER_WARM_CAP }
  }, [filteredRows, ownerCache])

  // r.ownerName/ownerAssignedOn/oppCreatedOn already live on the row via enrichedRows --
  // filteredRows is derived from it, so no separate ownerCache lookup is needed here.
  const exportRows = filteredRows.map(r => {
    const row = {
      Channel: r.channel === 'human' ? 'Human' : 'AI',
      // "Activity Created On" -- when the QL call/qualification activity itself was
      // logged in LeadSquared, distinct from "Opportunity Created On" below (when the
      // Opportunity record the call is FOR was first created, usually well earlier).
      'Activity Created On': r.createdOn,
      'Prospect ID': r.prospectId || '', 'Opportunity ID': r.opportunityId || '',
      'Opportunity Owner': r.ownerName || '',
      'Owner Assigned On': r.ownerAssignedOn || '',
      'Opportunity Created On': r.oppCreatedOn || '',
      'Time: Opp Created -> QL Call': formatDurationBetween(r.oppCreatedOn, r.createdOn) || '',
      'Time: QL Call -> Owner Assigned': formatCallToOwnerAssign(r.createdOn, r.ownerAssignedOn) || '',
      'Misassigned Owner (Futwork/Futwork AI)': r.ownerName && MISASSIGNED_OWNER_NAMES.has(r.ownerName) ? 'Yes' : '',
    }
    visibleFields.forEach(f => { row[f.label] = r[f.key] || '' })
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
                      ['QLs This Period', 'Same total as Total QLs, but always for the full date-range window -- ignores the Filters above, so it stays a fixed reference point even when the table is narrowed.'],
                      ['Activity Created On', 'When the QL call/qualification activity itself was logged in LeadSquared -- NOT the same as Opportunity Created On (when the Opportunity the call is for was first created, usually well earlier).'],
                      ['Owner columns', 'Opportunity Owner, Owner Assigned On, and Opportunity Created On come from the linked Opportunity, not the QL call itself. They load for the page you’re viewing first, then keep filling in for the whole loaded window in the background (see the Records card’s subtitle for progress) -- both Export and the “Opportunity Owner” filter option need this to finish loading to be complete, so may show … or a short delay right after changing the date range. LeadSquared’s own “First assigned” fields are unused on this account (always blank), so Owner Assigned On shows the current assignment time instead.'],
                      ['Opp Created → QL Call', 'Elapsed time between the Opportunity being created and this QL call, auto-scaled to seconds/minutes/hours/days.'],
                      ['QL Call → Owner Assigned', 'Elapsed time from this QL call to the current owner being assigned. “Current Owner Assignment Time” is a live field, so it often reflects a REASSIGNMENT that happens AFTER the call (e.g. automatic post-QL routing), not the owner who actually made it -- shown as “X before” on the rarer, opposite case where the owner was already assigned before this call.'],
                      ['Misassigned owner', 'A row highlighted red means the Opportunity Owner is still “Futwork” or “Futwork AI” -- LeadSquared’s own bot/vendor placeholder accounts, not a real floor owner. Filter on Opportunity Owner is/is not to isolate these.'],
                      ['Source', 'Pulled live from LeadSquared’s own Activity Advanced Search API, not a scheduled sync -- every date preset re-fetches fresh. Any field that came back blank for every row in the current window is hidden from the table.'],
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
              {data && (data.human.truncated || data.ai.truncated) && (
                <div style={{
                  margin: '20px 28px 0', padding: '10px 16px', borderRadius: 10,
                  background: C.navyBg, border: '0.5px solid ' + C.navy, color: C.navy,
                  fontSize: 12, fontWeight: 600, fontFamily: FONT,
                }}>
                  This window has more QLs than this page can currently fetch in full
                  ({data.human.truncated ? `Human capped at ${fmtN(data.human.rows.length)} of ${fmtN(data.human.qlCount)}` : ''}
                  {data.human.truncated && data.ai.truncated ? ' -- ' : ''}
                  {data.ai.truncated ? `AI capped at ${fmtN(data.ai.rows.length)} of ${fmtN(data.ai.qlCount)}` : ''}).
                  Totals and the Records table below reflect only the fetched rows -- narrow the date range for a complete view.
                </div>
              )}
              <div className="lq-kpi-grid" style={{ ...KPI_CARD_ROW, marginTop: 20 }}>
                <PremKPI label="Total Queued" value={fmtN(totalQueued)} sub="Human + AI" accent={C.green} icon={KPI_ICONS.total} />
                <PremKPI label="Human Queued" value={fmtN(humanQueued)} sub="not yet actioned, unfiltered" accent={C.green} icon={KPI_ICONS.agent} />
                <PremKPI label="AI Queued" value={fmtN(aiQueued)} sub="not yet actioned, unfiltered" accent={C.green} icon={KPI_ICONS.bot} />
                <PremKPI label="Total QLs" value={fmtN(totalQL)} sub="Human + AI" accent={C.navy} icon={KPI_ICONS.total} />
                <PremKPI label="Human QLs" value={fmtN(humanQL)} sub={data && data.human.qlCount !== humanQL ? `of ${fmtN(data.human.qlCount)} unfiltered` : 'Manual Lead Qualification'} accent={C.blue} icon={KPI_ICONS.agent} />
                <PremKPI label="AI QLs" value={fmtN(aiQL)} sub={data && data.ai.qlCount !== aiQL ? `of ${fmtN(data.ai.qlCount)} unfiltered` : 'Futwork AI Call Qualification'} accent={C.cyan} icon={KPI_ICONS.bot} />
                <PremKPI label="Queued to QL %" value={queuedToQlPct == null ? '—' : `${queuedToQlPct.toFixed(1)}%`} sub="Total QLs / Total Queued, unfiltered" accent={C.navy} icon={KPI_ICONS.total} />
                <PremKPI label="QLs This Period" value={fmtN(totalQlUnfiltered)} sub="Human + AI, for the date range -- ignores the Filters above" accent={C.green} icon={KPI_ICONS.total} />
              </div>

              <div style={{ padding: '16px 28px 28px' }}>
                {/* Only one table on this page by design. Every field the backend maps for
                    either channel (FULL_FIELDS above), plus Channel/Created On/a linked
                    Prospect ID/a linked Opportunity ID -- genuinely "every field coming
                    with the activity". Every cell is nowrap by request -- this table is
                    meant to be scanned, not read paragraph-style, so it scrolls
                    horizontally inside its own card rather than wrapping text and
                    producing uneven row heights. */}
                <Card title="Records" sub={
                  `${fmtN(filteredRows.length)} rows -- ${visibleFields.length + 9} columns` +
                  (ownerWarmStats.total > 0 && ownerWarmStats.resolved < ownerWarmStats.total
                    ? ` -- loading owner data for export: ${fmtN(ownerWarmStats.resolved)} of ${fmtN(ownerWarmStats.total)}${ownerWarmStats.capped ? ' (capped)' : ''}`
                    : '')
                }
                  action={totalPages > 1 ? <PaginationControl page={safePage} totalPages={totalPages} onPrev={() => setPage(safePage - 1)} onNext={() => setPage(safePage + 1)} /> : null}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid ' + C.border, textAlign: 'left' }}>
                          {['Channel', 'Activity Created On', 'Prospect ID', 'Opportunity ID', 'Opportunity Owner', 'Owner Assigned On', 'Opportunity Created On', 'Opp Created → QL Call', 'QL Call → Owner Assigned', ...visibleFields.map(f => f.label)].map(h => (
                            <th key={h} style={{ padding: '8px 10px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', fontSize: 10.5, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pageRows.map(r => {
                          const owner = r.opportunityId ? ownerCache[r.opportunityId] : null
                          const ownerLoading = owner === 'loading'
                          const ownerFailed = owner === 'error'
                          const ownerData = owner && typeof owner === 'object' ? owner : null
                          // A dash used to mean either "no Opportunity ID on this row" or "the
                          // lookup genuinely failed" -- indistinguishable to a reader. Split so
                          // "no opportunity" (a real, meaningful data gap -- this QL call was
                          // never linked to an Opportunity at all) reads differently from "—"
                          // (a lookup that should have worked but didn't).
                          const noOpp = !r.opportunityId
                          const cellVal = val => ownerLoading ? '…' : noOpp ? 'no opportunity' : ownerFailed ? '—' : (val || '—')
                          // Futwork/Futwork AI are LeadSquared's own bot/vendor placeholder
                          // owners (see MISASSIGNED_OWNER_NAMES above) -- a lead still
                          // sitting under one of these instead of a real floor owner is a
                          // genuine operational miss, flagged red per explicit request. A
                          // deliberate, narrowly-scoped exception to the brand-colors-only
                          // rule, same precedent already used for AI QL Detail's "In
                          // Progress" row highlight.
                          const misassigned = ownerData && MISASSIGNED_OWNER_NAMES.has(ownerData.ownerName)
                          return (
                          <tr key={r.id} style={{
                            borderBottom: '1px solid ' + C.border,
                            background: misassigned ? '#FEF2F2' : undefined,
                            borderLeft: misassigned ? '3px solid #DC2626' : '3px solid transparent',
                          }}>
                            <td style={{ padding: '7px 10px', fontWeight: 700, color: r.channel === 'human' ? C.blue : C.cyan, whiteSpace: 'nowrap' }}>{r.channel === 'human' ? 'Human' : 'AI'}</td>
                            <td style={{ padding: '7px 10px', color: C.text, whiteSpace: 'nowrap' }}>{r.createdOn}</td>
                            <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                              {r.prospectId ? (
                                <a href={LEADSQUARED_CONTACT_URL + encodeURIComponent(r.prospectId)} target="_blank" rel="noreferrer"
                                  title={'Open Contact in LeadSquared: ' + r.prospectId}
                                  style={{ fontFamily: 'monospace', fontSize: 11, color: C.blue, textDecoration: 'none' }}>{r.prospectId}</a>
                              ) : '—'}
                            </td>
                            <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                              {r.opportunityId ? (
                                <a href={LEADSQUARED_OPPORTUNITY_URL + encodeURIComponent(r.opportunityId) + '&opportunityEvent=' + LEADSQUARED_OPPORTUNITY_EVENT} target="_blank" rel="noreferrer"
                                  title={'Open Opportunity in LeadSquared: ' + r.opportunityId}
                                  style={{ fontFamily: 'monospace', fontSize: 11, color: C.blue, textDecoration: 'none' }}>{r.opportunityId}</a>
                              ) : '—'}
                            </td>
                            <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', fontWeight: misassigned ? 700 : 400, color: misassigned ? '#DC2626' : C.text }}
                              title={misassigned ? 'Still owned by a bot/vendor placeholder, not a real floor owner -- likely a missed assignment.' : undefined}>
                              {cellVal(ownerData && ownerData.ownerName)}{misassigned ? ' ⚠' : ''}
                            </td>
                            <td style={{ padding: '7px 10px', color: C.text, whiteSpace: 'nowrap' }}>{cellVal(ownerData && ownerData.ownerAssignedOn)}</td>
                            <td style={{ padding: '7px 10px', color: C.text, whiteSpace: 'nowrap' }}>{cellVal(ownerData && ownerData.createdOn)}</td>
                            <td style={{ padding: '7px 10px', color: C.text, whiteSpace: 'nowrap' }} title="Time between the Opportunity's own creation and this QL call.">
                              {cellVal(formatDurationBetween(ownerData && ownerData.createdOn, r.createdOn))}
                            </td>
                            <td style={{ padding: '7px 10px', color: C.text, whiteSpace: 'nowrap' }} title="Time from this QL call to the current owner assignment. '... before' means the CURRENT owner was already assigned before this call, rather than assigned as a result of it.">
                              {cellVal(formatCallToOwnerAssign(r.createdOn, ownerData && ownerData.ownerAssignedOn))}
                            </td>
                            {visibleFields.map(f => (
                              <td key={f.key} style={{ padding: '7px 10px', color: C.text, whiteSpace: 'nowrap' }}>{r[f.key] || '—'}</td>
                            ))}
                          </tr>
                          )
                        })}
                        {pageRows.length === 0 && (
                          <tr><td colSpan={visibleFields.length + 9} style={{ padding: '18px 10px', textAlign: 'center', color: C.muted }}>No records.</td></tr>
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
