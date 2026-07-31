import React, { useState, useEffect, useMemo, useCallback } from 'react'
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

// ------------------------------------------------------------------- Leads

const LEADS_COLUMNS = ['Name', 'Email', 'Phone', 'Type', 'Source', 'Status', 'Stage', 'Owner', 'Created On', 'Modified On']

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

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const d = await fetchJson(`${API}&mode=leads&since=${since}&until=${until}&pageSize=1000`)
      setRows(d.rows || [])
    } catch (e) { setError(e.message); setRows([]) }
    finally { setLoading(false) }
  }, [since, until])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [search, status, stage, owner])

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
    return true
  }), [rows, status, stage, owner, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_ROWS))
  const pageRows = filtered.slice((page - 1) * PAGE_ROWS, page * PAGE_ROWS)

  return (
    <>
      <Toolbar>
        <DateRangeRow since={since} until={until} onSince={setSince} onUntil={setUntil} />
        <SearchBox value={search} onChange={setSearch} placeholder="Search name, email, phone…" />
        <FilterDropdown label="Status" value={status} options={statusOptions.map(o => ({ v: o, l: o }))} open={openDD === 'status'} onToggle={() => setOpenDD(openDD === 'status' ? null : 'status')} onSelect={v => { setStatus(v); setOpenDD(null) }} />
        <FilterDropdown label="Stage" value={stage} options={stageOptions.map(o => ({ v: o, l: o }))} open={openDD === 'stage'} onToggle={() => setOpenDD(openDD === 'stage' ? null : 'stage')} onSelect={v => { setStage(v); setOpenDD(null) }} />
        <FilterDropdown label="Owner" value={owner} options={ownerOptions.map(o => ({ v: o, l: o }))} open={openDD === 'owner'} onToggle={() => setOpenDD(openDD === 'owner' ? null : 'owner')} onSelect={v => { setOwner(v); setOpenDD(null) }} />
        <Button size="sm" variant="secondary" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</Button>
        <ColumnPickerButton columns={LEADS_COLUMNS} hidden={hiddenCols} onApply={setHiddenCols} />
      </Toolbar>
      {error && <ErrorNote message={error} />}
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

  useEffect(() => {
    fetchJson(`${API}&mode=activity_types`).then(d => setTypes(d.rows || [])).catch(() => setTypes([]))
  }, [])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const d = await fetchJson(`${API}&mode=activities&eventCode=${eventCode}&since=${since}&until=${until}&pageSize=1000`)
      setRows(d.rows || [])
      // Every Activity Type has its own custom-field schema (same as Opportunities) --
      // fieldColumns is the real, ordered list of field labels this specific type uses,
      // resolved server-side via GetActivitySetting, e.g. "Country Interested",
      // "Disposition", "Preferred Course" for Manual Lead Qualification - not a fixed
      // column set, so the table below renders columns dynamically per selected type.
      setFieldColumns(d.fieldColumns || [])
    } catch (e) { setError(e.message); setRows([]); setFieldColumns([]) }
    finally { setLoading(false) }
  }, [eventCode, since, until])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [search, status, actor, eventCode])

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
    return true
  }), [rows, status, actor, search])

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
        <FilterDropdown label="Status" value={status} options={statusOptions.map(o => ({ v: o, l: o }))} open={openDD === 'status'} onToggle={() => setOpenDD(openDD === 'status' ? null : 'status')} onSelect={v => { setStatus(v); setOpenDD(null) }} />
        <FilterDropdown label="Actor" value={actor} options={actorOptions.map(o => ({ v: o, l: o }))} open={openDD === 'actor'} onToggle={() => setOpenDD(openDD === 'actor' ? null : 'actor')} onSelect={v => { setActor(v); setOpenDD(null) }} />
        <Button size="sm" variant="secondary" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</Button>
        <ColumnPickerButton columns={allColumns} hidden={hiddenCols} onApply={setHiddenCols} />
      </Toolbar>
      <p style={{ fontSize: 11.5, color: C.muted, margin: '0 0 12px' }}>
        LeadSquared's own Manage Activities screen is scoped to one Activity Type at a time too — this isn't a Quantum limitation. Showing <strong style={{ color: C.text }}>{activityTypeName}</strong>.
      </p>
      {error && <ErrorNote message={error} />}
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

const OPPORTUNITIES_COLUMNS = ['Opportunity Name', 'Contact', 'Status', 'Stage', 'Owner', 'Source', 'Intake', 'Last Disposition', 'Created On']

function OpportunitiesTab() {
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
  const [hiddenCols, setHiddenCols] = useHiddenColumns('lq_columns_opportunities')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const statusQ = status !== 'All' ? `&status=${encodeURIComponent(status)}` : ''
      const d = await fetchJson(`${API}&mode=opportunities&eventCode=${DEFAULT_OPPORTUNITY_EVENT_CODE}&since=${since}&until=${until}&pageSize=1000${statusQ}`)
      setRows(d.rows || [])
    } catch (e) { setError(e.message); setRows([]) }
    finally { setLoading(false) }
  }, [since, until, status])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [search, stage, owner])

  const stageOptions = useMemo(() => ['All', ...Array.from(new Set(rows.map(r => r.mx_Custom_2).filter(Boolean))).sort()], [rows])
  const ownerOptions = useMemo(() => ['All', ...Array.from(new Set(rows.map(r => r.OwnerName).filter(Boolean))).sort()], [rows])

  const filtered = useMemo(() => rows.filter(r => {
    if (stage !== 'All' && r.mx_Custom_2 !== stage) return false
    if (owner !== 'All' && r.OwnerName !== owner) return false
    if (search) {
      const q = search.toLowerCase()
      const hay = [r.mx_Custom_1, r.mx_Custom_3, r.OwnerName].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  }), [rows, stage, owner, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_ROWS))
  const pageRows = filtered.slice((page - 1) * PAGE_ROWS, page * PAGE_ROWS)

  return (
    <>
      <Toolbar>
        <DateRangeRow since={since} until={until} onSince={setSince} onUntil={setUntil} />
        <SearchBox value={search} onChange={setSearch} placeholder="Search name, source…" />
        <FilterDropdown label="Status" value={status} options={['All', 'Open', 'Won', 'Lost'].map(o => ({ v: o, l: o }))} open={openDD === 'status'} onToggle={() => setOpenDD(openDD === 'status' ? null : 'status')} onSelect={v => { setStatus(v); setOpenDD(null) }} />
        <FilterDropdown label="Stage" value={stage} options={stageOptions.map(o => ({ v: o, l: o }))} open={openDD === 'stage'} onToggle={() => setOpenDD(openDD === 'stage' ? null : 'stage')} onSelect={v => { setStage(v); setOpenDD(null) }} />
        <FilterDropdown label="Owner" value={owner} options={ownerOptions.map(o => ({ v: o, l: o }))} open={openDD === 'owner'} onToggle={() => setOpenDD(openDD === 'owner' ? null : 'owner')} onSelect={v => { setOwner(v); setOpenDD(null) }} />
        <Button size="sm" variant="secondary" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</Button>
        <ColumnPickerButton columns={OPPORTUNITIES_COLUMNS} hidden={hiddenCols} onApply={setHiddenCols} />
      </Toolbar>
      <p style={{ fontSize: 11.5, color: C.muted, margin: '0 0 12px' }}>
        Showing <strong style={{ color: C.text }}>University Admission Opportunity</strong> — this account also tracks Fly Compass, Fly Homes, Forex, Ivy100 and others as separate Opportunity Types, not wired up here yet.
      </p>
      {error && <ErrorNote message={error} />}
      {loading ? <InlineLoader label="Loading Opportunities from LeadSquared" /> : filtered.length === 0 ? <EmptyNote label="No opportunities match these filters." /> : (
        <>
          <div style={{ overflowX: 'auto', border: '1px solid ' + C.border, borderRadius: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                {!hiddenCols.has('Opportunity Name') && <Th>Opportunity Name</Th>}
                {!hiddenCols.has('Contact') && <Th>Contact</Th>}
                {!hiddenCols.has('Status') && <Th>Status</Th>}
                {!hiddenCols.has('Stage') && <Th>Stage</Th>}
                {!hiddenCols.has('Owner') && <Th>Owner</Th>}
                {!hiddenCols.has('Source') && <Th>Source</Th>}
                {!hiddenCols.has('Intake') && <Th>Intake</Th>}
                {!hiddenCols.has('Last Disposition') && <Th width="20%">Last Disposition</Th>}
                {!hiddenCols.has('Created On') && <Th>Created On</Th>}
              </tr></thead>
              <tbody>
                {pageRows.map(r => (
                  <tr key={r.OpportunityId}>
                    {!hiddenCols.has('Opportunity Name') && <Td style={{ fontWeight: 700 }}><a href={LEADSQUARED_OPPORTUNITY_URL + r.OpportunityId} target="_blank" rel="noreferrer" style={{ color: C.text, textDecoration: 'none' }}>{r.mx_Custom_1 || '—'}</a></Td>}
                    {!hiddenCols.has('Contact') && <Td><ContactLink id={r.RelatedProspectId} name={r.ContactName} /></Td>}
                    {!hiddenCols.has('Status') && <Td><StatusPill value={r.Status} /></Td>}
                    {!hiddenCols.has('Stage') && <Td>{r.mx_Custom_2 || '—'}</Td>}
                    {!hiddenCols.has('Owner') && <Td>{r.OwnerName || '—'}</Td>}
                    {!hiddenCols.has('Source') && <Td>{r.mx_Custom_3 || '—'}</Td>}
                    {!hiddenCols.has('Intake') && <Td>{r.mx_Custom_32 || '—'}</Td>}
                    {!hiddenCols.has('Last Disposition') && <Td style={{ color: C.muted }}>{r.mx_Custom_100 || r.mx_Custom_81 || '—'}</Td>}
                    {!hiddenCols.has('Created On') && <Td>{fmtDate(r.CreatedOn)}</Td>}
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

export default function LeadSquaredDashboard() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') || 'leads'
  const setTab = (t) => setSearchParams(prev => { const n = new URLSearchParams(prev); n.set('tab', t); return n })

  return (
    <div className="lq-page-shell" style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.bg, fontFamily: FONT }}>
      <Sidebar />
      <div style={{ margin: '12px 14px 0', borderRadius: 14, border: '1px solid #EEF1F6', boxShadow: '0 1px 3px rgba(31,60,132,0.06)', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <div style={{ background: 'var(--card)', borderBottom: '0.5px solid ' + C.border, padding: '10px 28px', flexShrink: 0 }}>
          <p style={{ fontSize: 10.5, color: C.muted, margin: 0, letterSpacing: '0.05em', textTransform: 'uppercase', fontFamily: FONT }}>Dashboards / LeadSquared</p>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: '2px 0 10px', letterSpacing: '-0.4px', fontFamily: FONT }}>LeadSquared</h1>
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
