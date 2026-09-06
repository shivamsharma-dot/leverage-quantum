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

// Every field present on BOTH channels' row shape (see LIVE_QL_CHANNELS.fields in the
// backend) -- these are what the advanced filter and "Breakdown by" dropdown can operate
// on. Deliberately excludes callDuration (free-text/numeric, not a clean group-by) and
// anything only present on one channel (e.g. AI's currentCity/preferredMode, Human's
// opportunityCateredBy/programPreference) -- those still ride along on each row for the
// records table, just aren't offered as a shared breakdown dimension.
const BREAKDOWN_FIELDS = [
  { key: 'country', label: 'Country' },
  { key: 'intake', label: 'Intake' },
  { key: 'budget', label: 'Budget' },
  { key: 'highestQualification', label: 'Highest Qualification' },
  { key: 'preferredDegree', label: 'Preferred Degree' },
  { key: 'disposition', label: 'Disposition' },
  { key: 'firstCampaignName', label: 'First Campaign Name' },
  { key: 'firstChannelSource', label: 'First Channel Source' },
  { key: 'opportunityType', label: 'Opportunity Type' },
  { key: 'validPassport', label: 'Valid Passport' },
  { key: 'currentDegreeStatus', label: 'Current Degree Status' },
  { key: 'dispositionReason', label: 'Disposition Reason' },
]

// Every field the backend maps for EITHER channel (see LIVE_QL_CHANNELS.fields in
// api/crm-leads.js), for the "full fledged" records table + export -- unlike
// BREAKDOWN_FIELDS above, this includes fields that only exist on one channel
// (marked below); those simply render "--" on rows from the other channel.
// Shared fields first, then Human-only, then AI-only.
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

// ---- Advanced filter chips -- same pattern as AI/Human QL Detail (FilterChip/
// AddFilterButton/FilterValuePopover), copied rather than shared: it's a small, page-local
// UI pattern in this codebase, not a shared component, and re-deriving it here keeps this
// page's filter fields (BREAKDOWN_FIELDS above) independent of what those other pages show.
function FilterValuePopover({ field, options, selected, onToggleValue, onClose }) {
  const [q, setQ] = useState('')
  const shown = q.trim() ? options.filter(o => o.toLowerCase().includes(q.trim().toLowerCase())) : options
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 150 }} />
      <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 200, width: 240, background: 'var(--card)', border: '1px solid ' + C.border, borderRadius: 10, boxShadow: '0 12px 32px -8px rgba(15,23,42,0.22)', padding: 8 }}>
        <input autoFocus type="text" value={q} onChange={e => setQ(e.target.value)} placeholder={'Search ' + field.label.toLowerCase() + '…'}
          style={{ width: '100%', boxSizing: 'border-box', padding: '6px 9px', border: '0.5px solid ' + C.border, borderRadius: 7, fontSize: 12, fontFamily: FONT, outline: 'none', marginBottom: 6, background: 'var(--bg3)', color: C.text }} />
        <div style={{ maxHeight: 230, overflowY: 'auto' }}>
          {shown.map(o => {
            const checked = selected.includes(o)
            return (
              <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 7px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: checked ? 700 : 500, color: checked ? C.navy : C.text, background: checked ? C.navyBg : 'transparent' }}>
                <input type="checkbox" checked={checked} onChange={() => onToggleValue(o)} style={{ accentColor: C.navy, cursor: 'pointer', flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o}</span>
              </label>
            )
          })}
          {shown.length === 0 && <div style={{ fontSize: 11.5, color: C.muted, padding: '6px 7px' }}>No matches</div>}
        </div>
      </div>
    </>
  )
}

function FilterChip({ field, values, options, open, onToggle, onToggleValue, onRemove }) {
  const summary = values.length === 1 ? values[0] : values.length + ' selected'
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'stretch', borderRadius: 8, border: '0.5px solid rgba(31,60,132,0.35)', background: C.navyBg, overflow: 'hidden' }}>
        <button type="button" onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 9px 6px 11px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, fontFamily: FONT, whiteSpace: 'nowrap' }}>
          <span style={{ color: C.navy, fontWeight: 700 }}>{field.label}</span>
          <span style={{ color: C.text, fontWeight: 600, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>{summary}</span>
          <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke={C.navy} strokeWidth="3" strokeLinecap="round" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}><polyline points="6 9 12 15 18 9" /></svg>
        </button>
        <button type="button" onClick={onRemove} title="Remove filter" style={{ border: 'none', borderLeft: '0.5px solid rgba(31,60,132,0.2)', background: 'transparent', cursor: 'pointer', color: C.navy, padding: '6px 9px', display: 'flex', alignItems: 'center' }}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>
      {open && <FilterValuePopover field={field} options={options} selected={values} onToggleValue={onToggleValue} onClose={onToggle} />}
    </div>
  )
}

function AddFilterButton({ allFields, activeFilters, filterOptions, open, onToggle, onToggleValue }) {
  const [step, setStep] = useState('pick')
  const [q, setQ] = useState('')
  useEffect(() => { if (open) { setStep('pick'); setQ('') } }, [open])
  const pickable = allFields.filter(f => !activeFilters[f.key])
  const shownFields = q.trim() ? pickable.filter(f => f.label.toLowerCase().includes(q.trim().toLowerCase())) : pickable
  const activeField = step !== 'pick' ? allFields.find(f => f.key === step) : null
  const options = activeField ? (filterOptions[activeField.key] || []) : []
  const shownOptions = activeField && q.trim() ? options.filter(o => o.toLowerCase().includes(q.trim().toLowerCase())) : options
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button type="button" onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: '1px dashed ' + C.border, background: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: FONT, color: C.muted, whiteSpace: 'nowrap' }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        Filter
      </button>
      {open && (
        <>
          <div onClick={onToggle} style={{ position: 'fixed', inset: 0, zIndex: 150 }} />
          <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 200, width: 230, background: 'var(--card)', border: '1px solid ' + C.border, borderRadius: 10, boxShadow: '0 12px 32px -8px rgba(15,23,42,0.22)', padding: 8 }}>
            {step === 'pick' ? (
              <>
                <input autoFocus type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Find a column…"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '6px 9px', border: '0.5px solid ' + C.border, borderRadius: 7, fontSize: 12, fontFamily: FONT, outline: 'none', marginBottom: 6, background: 'var(--bg3)', color: C.text }} />
                <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                  {shownFields.map(f => (
                    <button key={f.key} type="button" onClick={() => { setStep(f.key); setQ('') }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 9px', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: FONT, color: C.text, background: 'transparent' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg3)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                      {f.label}
                    </button>
                  ))}
                  {shownFields.length === 0 && <div style={{ fontSize: 11.5, color: C.muted, padding: '6px 7px' }}>No columns match</div>}
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <button type="button" onClick={() => { setStep('pick'); setQ('') }} title="Back" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.muted, display: 'flex', alignItems: 'center', padding: 2, flexShrink: 0 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                  </button>
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: C.text }}>{activeField.label}</span>
                </div>
                <input autoFocus type="text" value={q} onChange={e => setQ(e.target.value)} placeholder={'Search ' + activeField.label.toLowerCase() + '…'}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '6px 9px', border: '0.5px solid ' + C.border, borderRadius: 7, fontSize: 12, fontFamily: FONT, outline: 'none', marginBottom: 6, background: 'var(--bg3)', color: C.text }} />
                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {shownOptions.map(o => {
                    const checked = (activeFilters[activeField.key] || []).includes(o)
                    return (
                      <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 7px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: checked ? 700 : 500, color: checked ? C.navy : C.text }}>
                        <input type="checkbox" checked={checked} onChange={() => onToggleValue(activeField.key, o)} style={{ accentColor: C.navy, cursor: 'pointer', flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o}</span>
                      </label>
                    )
                  })}
                  {shownOptions.length === 0 && <div style={{ fontSize: 11.5, color: C.muted, padding: '6px 7px' }}>No values</div>}
                </div>
              </>
            )}
          </div>
        </>
      )}
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
  const [activeFilters, setActiveFilters] = useState({}) // { fieldKey: [values] }
  const [openFilterKey, setOpenFilterKey] = useState(null) // 'add' or a field key
  const [breakdownField, setBreakdownField] = useState('country')
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

  const filterOptions = useMemo(() => {
    const out = {}
    BREAKDOWN_FIELDS.forEach(f => {
      const seen = new Set()
      allRows.forEach(r => { const v = r[f.key]; if (v) seen.add(v) })
      out[f.key] = Array.from(seen).sort()
    })
    return out
  }, [allRows])

  const filteredRows = useMemo(() => {
    const keys = Object.keys(activeFilters).filter(k => (activeFilters[k] || []).length)
    if (!keys.length) return allRows
    return allRows.filter(r => keys.every(k => (activeFilters[k] || []).includes(r[k])))
  }, [allRows, activeFilters])

  const humanQL = filteredRows.filter(r => r.channel === 'human').length
  const aiQL = filteredRows.filter(r => r.channel === 'ai').length
  const totalQL = humanQL + aiQL
  const humanQueued = data ? data.human.queuedCount : 0
  const aiQueued = data ? data.ai.queuedCount : 0
  const totalQueued = humanQueued + aiQueued
  // Queued -> QL % is a conversion-rate health metric, so like the Queued cards
  // themselves it deliberately ignores the active filter chips -- both sides use the
  // channels' own unfiltered qlCount, not the (possibly narrowed) filteredRows count,
  // so a filter can't quietly change what this ratio means.
  const totalQlUnfiltered = data ? data.human.qlCount + data.ai.qlCount : 0
  const queuedToQlPct = totalQueued > 0 ? (totalQlUnfiltered / totalQueued) * 100 : null

  const breakdown = useMemo(() => {
    const counts = {}
    filteredRows.forEach(r => { const v = r[breakdownField] || '(blank)'; counts[v] = (counts[v] || 0) + 1 })
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [filteredRows, breakdownField])

  const maxBreakdown = breakdown.length ? breakdown[0][1] : 0
  const pageRows = filteredRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))

  const exportRows = filteredRows.map(r => {
    const row = { Channel: r.channel === 'human' ? 'Human' : 'AI', 'Created On': r.createdOn, 'Prospect ID': r.prospectId || '' }
    FULL_FIELDS.forEach(f => { row[f.label] = r[f.key] || '' })
    return row
  })

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
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg3)', borderRadius: 9, padding: 3 }}>
                {DATE_PRESETS.map(([key, label]) => (
                  <button key={key} onClick={() => setDatePreset(key)}
                    style={{
                      padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, fontFamily: FONT,
                      background: datePreset === key ? 'linear-gradient(135deg,#1F3C84,#1C9FD4)' : 'transparent',
                      color: datePreset === key ? '#fff' : '#64748B',
                      boxShadow: datePreset === key ? '0 4px 10px -3px rgba(31,60,132,0.5)' : 'none',
                      transition: 'all .15s',
                    }}>{label}</button>
                ))}
              </div>

              {Object.keys(activeFilters).filter(k => (activeFilters[k] || []).length).map(key => {
                const field = BREAKDOWN_FIELDS.find(f => f.key === key)
                if (!field) return null
                return (
                  <FilterChip key={key} field={field} values={activeFilters[key]} options={filterOptions[key] || []}
                    open={openFilterKey === key} onToggle={() => setOpenFilterKey(v => v === key ? null : key)}
                    onToggleValue={v => setActiveFilters(prev => {
                      const cur = prev[key] || []
                      const next = cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v]
                      return { ...prev, [key]: next }
                    })}
                    onRemove={() => setActiveFilters(prev => { const c = { ...prev }; delete c[key]; return c })} />
                )
              })}
              <AddFilterButton allFields={BREAKDOWN_FIELDS} activeFilters={activeFilters} filterOptions={filterOptions}
                open={openFilterKey === 'add'} onToggle={() => setOpenFilterKey(v => v === 'add' ? null : 'add')}
                onToggleValue={(key, v) => setActiveFilters(prev => {
                  const cur = prev[key] || []
                  const next = cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v]
                  return { ...prev, [key]: next }
                })} />
              {Object.keys(activeFilters).some(k => (activeFilters[k] || []).length > 0) && (
                <button onClick={() => setActiveFilters({})} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: C.muted, fontFamily: FONT }}>Clear all</button>
              )}

              <Dropdown label="Breakdown by" value={breakdownField} onChange={setBreakdownField} minWidth={170}
                options={BREAKDOWN_FIELDS.map(f => ({ value: f.key, label: f.label }))} />

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
                      ['Queued', 'Note = "Call queued successfully" for that channel -- calls that haven’t been actioned yet. Always shown unfiltered, regardless of the filter chips above.'],
                      ['Queued to QL %', 'Total QLs ÷ Total Queued, both unfiltered -- how much of everyone queued so far became a QL. Not affected by filter chips, same as the Queued cards.'],
                      ['Source', 'Pulled live from LeadSquared’s own Activity Advanced Search API, not a scheduled sync -- every date preset re-fetches fresh.'],
                      ['Filters', 'Narrow the QL rows (and the KPI cards above them) by any field. Queued counts are not affected by filters.'],
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

              <div style={{ padding: '16px 28px 28px', display: 'grid', gridTemplateColumns: 'minmax(260px,340px) minmax(0,1fr)', gap: 16 }} className="lq-grid2">
                <Card title={BREAKDOWN_FIELDS.find(f => f.key === breakdownField)?.label || 'Breakdown'} sub={`${fmtN(totalQL)} QLs, ${datePreset.replace(/_/g, ' ')}`}>
                  {breakdown.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: C.muted, fontSize: 13 }}>No data for this selection.</div>
                  ) : (
                    <RankedBars data={breakdown.map(([label, count]) => ({ label, count }))} labelKey="label" max={maxBreakdown} total={totalQL} color={C.navy} />
                  )}
                </Card>

                {/* Every field the backend maps for either channel (FULL_FIELDS above),
                    plus Channel/Created On/a linked Prospect ID -- so this is genuinely
                    "every field coming with the activity", not the earlier 6-column subset.
                    Wide by design: scrolls horizontally inside its own card rather than
                    forcing the whole page to scroll sideways. */}
                <Card title="Records" sub={`${fmtN(filteredRows.length)} rows -- ${FULL_FIELDS.length + 3} columns`}>
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
                  {totalPages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12, fontSize: 12 }}>
                      <button disabled={page === 0} onClick={() => setPage(p => p - 1)} style={{ border: 'none', background: 'transparent', cursor: page === 0 ? 'default' : 'pointer', color: page === 0 ? C.muted : C.navy, fontWeight: 700 }}>{'<-'}</button>
                      <span style={{ color: C.muted }}>{page + 1} / {totalPages}</span>
                      <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} style={{ border: 'none', background: 'transparent', cursor: page >= totalPages - 1 ? 'default' : 'pointer', color: page >= totalPages - 1 ? C.muted : C.navy, fontWeight: 700 }}>{'->'}</button>
                    </div>
                  )}
                </Card>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
