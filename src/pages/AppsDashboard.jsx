import React, { useEffect, useMemo, useRef, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import Sidebar from '../components/Sidebar'
import Dropdown from '../components/Dropdown'
import DateRangePicker from '../components/DateRangePicker'
import ExportButton from '../components/ExportButton'
import { InlineLoader } from '../components/SkeletonLoader'
import { C, FONT, fmtN, pct, Card, PremKPI, KPI_ICONS, BarGrad, barFill, BAR_RADIUS, GRID_STROKE, RankedBars } from '../ui/dashboardKit'
import { fetchAppsCacheRows, fetchAppsCacheSyncedAt } from '../lib/appsCache'
import { getSession, setSession } from '../lib/sessionLoad'

// ---------------------------------------------------------------------------
// Apps -- one row per application (not a date-bucketed aggregate like
// Overall/Leverage Careers), sourced from Settings > Data > BigQuery
// Console's "appv2" saved query (replaced the earlier "Apps" query on
// 2026-09-07 -- see api/crm-leads.js's own comment on APPS_SQL for exactly
// what changed and why). Synced once a day at 9am IST (see
// .github/workflows/apps-sync.yml) -- deliberately NOT real-time, per
// explicit instruction, so there's no Day/Week/Month/Year toolbar the way
// Organic & Social has; it's a daily snapshot with a "Synced" tag and a
// plain Refresh (re-reads the Supabase cache, never touches BigQuery itself).
// The Custom range control and the Advanced Filter below are both real,
// client-side filters over that one daily snapshot -- they don't change how
// often the snapshot itself refreshes.
// ---------------------------------------------------------------------------

const ALL = 'All'

// Every field the Advanced Filter (and the CSV export) can reach. The five
// existing quick-select dropdowns (Destination/Intake/Source/Human QL/AI QL)
// stay as they were -- this doesn't replace them, it covers the rest
// (School/Course/Sub Source/Vertical/Country2/Campaign) plus gives the same
// five real operators beyond a plain exact-match dropdown.
const FULL_FIELDS = [
  { key: 'destination_country', label: 'Destination' },
  { key: 'destination_country_group', label: 'Destination Group' },
  { key: 'destination_country_original', label: 'Destination (original)' },
  { key: 'intake_category', label: 'Intake Category' },
  { key: 'school_name', label: 'School' },
  { key: 'course_name', label: 'Course' },
  { key: 'source', label: 'Source' },
  { key: 'sub_source', label: 'Sub Source' },
  { key: 'opp_first_campaign_name', label: 'Campaign' },
  { key: 'futwork_human', label: 'Human QL' },
  { key: 'futwork_ai', label: 'AI QL' },
  { key: 'vertical', label: 'Vertical' },
  { key: 'country2', label: 'Country (attribution)' },
]

// Same field/operator/AND-OR condition-builder pattern already shipped on
// Live QLs and Overall -- same 10-operator vocabulary, same one-popover-
// many-rows layout, so "advanced filter" means the same thing everywhere in
// this app, not a bespoke design per page.
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
function newCondition() { conditionIdCounter += 1; return { id: 'c' + conditionIdCounter, field: 'destination_country_group', operator: 'contains', value: '' } }

// Small searched single-select popover, used by 'is'/'is not' to pick from real
// observed values for the chosen field.
function ValueSelectPopover({ options, onPick, onClose }) {
  const [q, setQ] = useState('')
  const shown = q.trim() ? options.filter(o => o.toLowerCase().includes(q.trim().toLowerCase())) : options
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 250 }} />
      <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 260, width: 230, background: 'var(--card)', border: '1px solid ' + C.border, borderRadius: 10, boxShadow: '0 12px 32px -8px rgba(15,23,42,0.22)', padding: 8 }}>
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <Dropdown value={cond.field} onChange={v => onChange({ field: v, value: '' })} minWidth={150}
        options={FULL_FIELDS.map(f => ({ value: f.key, label: f.label }))} />
      <Dropdown value={cond.operator} onChange={v => onChange({ operator: v, value: '' })} minWidth={130}
        options={OPERATORS.map(o => ({ value: o.key, label: o.label }))} />
      {op.value === 'text' && (
        <input type="text" value={cond.value} onChange={e => onChange({ value: e.target.value })}
          placeholder={cond.operator === 'like' || cond.operator === 'not_like' ? 'e.g. %Germany%' : 'Value…'}
          style={{ flex: '1 1 120px', minWidth: 100, boxSizing: 'border-box', padding: '6px 9px', border: '0.5px solid ' + C.border, borderRadius: 7, fontSize: 12, fontFamily: FONT, outline: 'none', background: 'var(--bg3)', color: C.text }} />
      )}
      {op.value === 'select' && (
        <div style={{ position: 'relative', flex: '1 1 120px', minWidth: 100 }}>
          <button type="button" onClick={onOpenValuePicker}
            style={{ width: '100%', boxSizing: 'border-box', textAlign: 'left', padding: '6px 9px', border: '0.5px solid ' + C.border, borderRadius: 7, fontSize: 12, fontFamily: FONT, background: 'var(--bg3)', color: cond.value ? C.text : C.muted, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {cond.value || 'Select value…'}
          </button>
          {valuePickerOpen && (
            <ValueSelectPopover options={options} onPick={v => { onChange({ value: v }); onOpenValuePicker() }} onClose={onOpenValuePicker} />
          )}
        </div>
      )}
      {op.value === 'none' && <div style={{ flex: '1 1 120px', minWidth: 100, fontSize: 11.5, color: C.muted, fontStyle: 'italic' }}>no value needed</div>}
      <button type="button" onClick={onRemove} title="Remove condition" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.muted, display: 'flex', alignItems: 'center', padding: 4, flexShrink: 0 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </button>
    </div>
  )
}

// position:fixed (anchored via getBoundingClientRect, not CSS-flow position:
// absolute) so the panel is positioned relative to the VIEWPORT, not to
// AppsDashboard's own overflowY:'auto' content wrapper (routed mode) -- a
// position:absolute panel is clipped by any scrolling ancestor's overflow
// regardless of z-index, the same bug already fixed once on Overall's own
// Advanced Filter. This is the more robust of the two versions already
// proven in this app; used here from the start rather than copying the
// slightly less robust position:absolute version Live QLs still uses.
function FilterBuilderPopover({ conditions, combinator, filterOptions, anchor, onAdd, onUpdate, onRemove, onSetCombinator, onClearAll, onClose }) {
  const [openValueRowId, setOpenValueRowId] = useState(null)
  const top = anchor ? anchor.bottom + 6 : 0
  const right = anchor ? window.innerWidth - anchor.right : 0
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 150 }} />
      <div style={{ position: 'fixed', top, right, zIndex: 200, width: 'min(520px, 92vw)', background: 'var(--card)', border: '1px solid ' + C.border, borderRadius: 12, boxShadow: '0 12px 32px -8px rgba(15,23,42,0.22)', padding: 12, boxSizing: 'border-box' }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: C.text, marginBottom: 8 }}>Filters</div>
        {conditions.length === 0 && (
          <div style={{ fontSize: 12, color: C.muted, padding: '4px 0 10px' }}>No conditions yet — add one below.</div>
        )}
        {/* Deliberately no maxHeight/overflowY here -- see the identical caveat on
            Overall's own AdvFilterBuilderPopover; a scrollable ancestor clips any
            position:absolute descendant (the Field/Operator Dropdown menus, the
            value picker) to its own box regardless of z-index. */}
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

function countBy(rows, key, fallback = 'Unknown') {
  const map = new Map()
  for (const r of rows) {
    const v = (r[key] && String(r[key]).trim()) || fallback
    map.set(v, (map.get(v) || 0) + 1)
  }
  return Array.from(map.entries()).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function AppsDashboard({ embedded, initialFrom, initialTo } = {}) {
  const [rows, setRows] = useState(null)
  const [syncedAt, setSyncedAt] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [destFilter, setDestFilter] = useState(ALL)
  const [intakeFilter, setIntakeFilter] = useState(ALL)
  const [sourceFilter, setSourceFilter] = useState(ALL)
  const [humanQlFilter, setHumanQlFilter] = useState(ALL)
  const [aiQlFilter, setAiQlFilter] = useState(ALL)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 50

  // Custom date range, filtered on first_app_submitted_at (a real 'YYYY-MM-DD'
  // date, added with appv2 -- see api/crm-leads.js). Seeded from initialFrom/
  // initialTo when embedded (opened from Overall's Applications KPI card or
  // funnel bar), but it's the SAME state the in-page "Custom range" control
  // below also drives -- someone viewing the embedded modal can narrow or
  // widen the range further from right there, it isn't locked to what Overall
  // handed over. Standalone /dashboard/apps starts with neither prop, so
  // customFrom/customTo start empty and every row is in scope until someone
  // opens the picker themselves.
  const [customFrom, setCustomFrom] = useState(initialFrom || '')
  const [customTo, setCustomTo] = useState(initialTo || '')
  const [showCustomPicker, setShowCustomPicker] = useState(false)

  // Advanced filter -- Field/Operator/Value conditions, any number, combined
  // by one shared AND/OR toggle. Additive on top of the five quick-select
  // dropdowns below, not a replacement for them.
  const [conditions, setConditions] = useState([])
  const [combinator, setCombinator] = useState('AND')
  const [filterOpen, setFilterOpen] = useState(false)
  const filterBtnRef = useRef(null)
  const [filterAnchor, setFilterAnchor] = useState(null)

  // Records table sort -- null sortKey means "natural (unsorted) order".
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('asc')

  // force=true only for an explicit Refresh click -- a plain mount (including
  // navigating back from another dashboard) reuses whatever this session already
  // fetched (see sessionLoad.js) instead of re-downloading and re-parsing the whole
  // ~7,000-row apps_feed cache every single time.
  const load = (force) => {
    if (!force) {
      const cached = getSession('apps_feed_v1')
      if (cached) { setRows(cached.data.rows); setSyncedAt(cached.data.syncedAt); setLoading(false); setError(''); return }
    }
    setLoading(true); setError('')
    Promise.all([fetchAppsCacheRows(), fetchAppsCacheSyncedAt()])
      .then(([r, s]) => { setRows(r); setSyncedAt(s); setSession('apps_feed_v1', { rows: r, syncedAt: s }) })
      .catch(e => setError(String(e.message || e)))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load(false) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const dateFrom = customFrom ? new Date(customFrom + 'T00:00:00') : null
  const dateTo = customTo ? new Date(customTo + 'T23:59:59') : null
  const dateFilteredRows = useMemo(() => {
    if (!dateFrom && !dateTo) return rows || []
    return (rows || []).filter(r => {
      if (!r.first_app_submitted_at) return false
      const d = new Date(r.first_app_submitted_at + 'T00:00:00')
      if (dateFrom && d < dateFrom) return false
      if (dateTo && d > dateTo) return false
      return true
    })
  }, [rows, customFrom, customTo]) // eslint-disable-line react-hooks/exhaustive-deps

  const destOptions = useMemo(() => [ALL, ...new Set(dateFilteredRows.map(r => r.destination_country_group).filter(Boolean))].sort((a, b) => a === ALL ? -1 : b === ALL ? 1 : a.localeCompare(b)), [dateFilteredRows])
  const intakeOptions = useMemo(() => [ALL, ...new Set(dateFilteredRows.map(r => r.intake_category).filter(Boolean))].sort((a, b) => a === ALL ? -1 : b === ALL ? 1 : a.localeCompare(b)), [dateFilteredRows])
  const sourceOptions = useMemo(() => [ALL, ...new Set(dateFilteredRows.map(r => r.source).filter(Boolean))].sort((a, b) => a === ALL ? -1 : b === ALL ? 1 : a.localeCompare(b)), [dateFilteredRows])

  const activeConditions = useMemo(() => conditions.filter(isConditionComplete), [conditions])
  const filterOptions = useMemo(() => {
    const opts = {}
    for (const f of FULL_FIELDS) opts[f.key] = [...new Set(dateFilteredRows.map(r => r[f.key]).filter(Boolean))].sort()
    return opts
  }, [dateFilteredRows])
  const addCondition = () => setConditions(cs => [...cs, newCondition()])
  const updateCondition = (id, patch) => setConditions(cs => cs.map(c => c.id === id ? { ...c, ...patch } : c))
  const removeCondition = id => setConditions(cs => cs.filter(c => c.id !== id))

  const filtered = useMemo(() => {
    const list = dateFilteredRows
    const q = search.trim().toLowerCase()
    return list.filter(r => {
      if (destFilter !== ALL && r.destination_country_group !== destFilter) return false
      if (intakeFilter !== ALL && r.intake_category !== intakeFilter) return false
      if (sourceFilter !== ALL && r.source !== sourceFilter) return false
      if (humanQlFilter !== ALL && r.futwork_human !== humanQlFilter) return false
      if (aiQlFilter !== ALL && r.futwork_ai !== aiQlFilter) return false
      if (q) {
        const hay = [r.school_name, r.course_name, r.opp_first_campaign_name, r.destination_country, r.prospect_id, r.opportunity_id].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (activeConditions.length) {
        const ok = combinator === 'AND'
          ? activeConditions.every(c => matchesCondition(r, c))
          : activeConditions.some(c => matchesCondition(r, c))
        if (!ok) return false
      }
      return true
    })
  }, [dateFilteredRows, search, destFilter, intakeFilter, sourceFilter, humanQlFilter, aiQlFilter, activeConditions, combinator])

  const kpis = useMemo(() => {
    const total = filtered.length
    const students = new Set(filtered.map(r => r.user_id_uuid).filter(Boolean)).size
    const destinations = new Set(filtered.map(r => r.destination_country).filter(Boolean)).size
    const humanQl = filtered.filter(r => r.futwork_human === 'Human_QL').length
    const aiQl = filtered.filter(r => r.futwork_ai === 'AI_QL').length
    const floor = filtered.filter(r => r.futwork_human !== 'Human_QL' && r.futwork_ai !== 'AI_QL').length
    return { total, students, destinations, humanQl, aiQl, floor }
  }, [filtered])

  const byDestination = useMemo(() => countBy(filtered, 'destination_country_group').slice(0, 8), [filtered])
  const bySource = useMemo(() => countBy(filtered, 'source').slice(0, 8), [filtered])
  const byCampaign = useMemo(() => countBy(filtered, 'opp_first_campaign_name').slice(0, 8), [filtered])
  const byIntake = useMemo(() => countBy(filtered, 'intake_category').slice(0, 8), [filtered])

  const monthTrend = useMemo(() => {
    const map = new Map() // month label -> { count, sortDate }
    for (const r of filtered) {
      const label = r.first_app_month || 'Unknown'
      const sortDate = r.first_app_submitted_at ? new Date(r.first_app_submitted_at + 'T00:00:00') : null
      const cur = map.get(label)
      if (cur) cur.count += 1
      else map.set(label, { month: label, count: 1, sortDate })
    }
    return Array.from(map.values())
      .sort((a, b) => (a.sortDate && b.sortDate) ? a.sortDate - b.sortDate : a.month.localeCompare(b.month))
      .slice(-12)
  }, [filtered])

  // Day-on-day, current calendar month, fixed -- reads the RAW unfiltered rows,
  // not `filtered`, so nothing above (search, the five quick dropdowns, the
  // Advanced Filter, even the Custom range) changes what this shows. Same
  // convention as Human/AI QL Detail's own "Daily Trend" chart: an always-on
  // pulse check for "what's happening this month," independent of whatever
  // else someone is currently narrowing the rest of the page to.
  //
  // Trimmed to the last day that actually has data, rather than rendering
  // every remaining (unhappened) day of the month as an empty bar -- a plain
  // fixed-length "1 through daysInMonth" array left most of the chart blank
  // for the back half of any month still in progress.
  const dailyTrendCurrentMonth = useMemo(() => {
    const now = new Date()
    const y = now.getFullYear(), m = now.getMonth()
    const daysInMonth = new Date(y, m + 1, 0).getDate()
    const counts = new Array(daysInMonth + 1).fill(0)
    for (const r of (rows || [])) {
      if (!r.first_app_submitted_at) continue
      const d = new Date(r.first_app_submitted_at + 'T00:00:00')
      if (d.getFullYear() === y && d.getMonth() === m) counts[d.getDate()] += 1
    }
    let lastDay = 1
    for (let i = daysInMonth; i >= 1; i--) { if (counts[i] > 0) { lastDay = i; break } }
    return Array.from({ length: lastDay }, (_, i) => ({ day: String(i + 1) + ' ' + MONTHS_SHORT[m], count: counts[i + 1] }))
  }, [rows])

  // Click-to-sort table headers -- same convention as the rest of this app
  // (Overall's summary table, Live QLs' records table): click toggles
  // asc/desc on that column, clicking a different column resets to asc.
  // Sorts on the real underlying value, not the display string -- dates sort
  // on the ISO first_app_submitted_at rather than the DD-Mon-YY label.
  const sortValue = (r, key) => {
    if (key === 'first_app_submitted_at') return r.first_app_submitted_at || ''
    return (r[key] || '').toString().toLowerCase()
  }
  const toggleSort = key => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }
  const sortedFiltered = useMemo(() => {
    if (!sortKey) return filtered
    const dir = sortDir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      const av = sortValue(a, sortKey), bv = sortValue(b, sortKey)
      if (av < bv) return -1 * dir
      if (av > bv) return 1 * dir
      return 0
    })
  }, [filtered, sortKey, sortDir]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.max(1, Math.ceil(sortedFiltered.length / PAGE_SIZE))
  const pageRows = sortedFiltered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  useEffect(() => { setPage(1) }, [search, destFilter, intakeFilter, sourceFilter, humanQlFilter, aiQlFilter, activeConditions, combinator, customFrom, customTo])

  const exportRows = filtered.map(r => ({
    'First App Date': r.first_app_date || '', 'First App Month': r.first_app_month || '',
    'Destination Country': r.destination_country || '', 'Destination Group': r.destination_country_group || '',
    'Intake Category': r.intake_category || '', 'Intake Date': r.intake_date || '',
    School: r.school_name || '', Course: r.course_name || '',
    Source: r.source || '', 'Sub Source': r.sub_source || '', Campaign: r.opp_first_campaign_name || '',
    'Human QL': r.futwork_human || '', 'AI QL': r.futwork_ai || '',
    Vertical: r.vertical || '', 'Country (attribution)': r.country2 || '',
    'Prospect ID': r.prospect_id || '', 'Opportunity ID': r.opportunity_id || '',
  }))

  const content = (
    <div style={{ flex: 1, overflowY: embedded ? 'visible' : 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{
          margin: '12px 14px 0', borderRadius: 14, border: '1px solid var(--card-border)',
          background: 'var(--card)', boxShadow: '0 1px 3px rgba(31,60,132,0.06)', padding: '14px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
        }} className="lq-header-controls">
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: FONT }}>Analytics</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.text, fontFamily: FONT, letterSpacing: '-0.3px' }}>Apps</div>
            {(customFrom || customTo) && (
              <div style={{ fontSize: 12, fontWeight: 600, color: C.blue, fontFamily: FONT, marginTop: 2 }}>
                Scoped to {customFrom || '…'} → {customTo || '…'} (by application submission date)
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11.5, color: C.muted, fontFamily: FONT }}>
              {syncedAt ? `Synced ${syncedAt.toLocaleString()} · once a day, 9am IST` : 'Not yet synced'}
            </span>
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowCustomPicker(v => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700, color: (customFrom || customTo) ? C.navy : C.text, background: (customFrom || customTo) ? 'var(--navy-tint)' : 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontFamily: FONT }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                {customFrom && customTo ? customFrom + ' → ' + customTo : 'Custom range'}
              </button>
              {showCustomPicker && (
                <>
                  <div onClick={() => setShowCustomPicker(false)} style={{ position: 'fixed', inset: 0, zIndex: 399 }} />
                  <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 400, background: 'var(--card)', border: '0.5px solid var(--card-border)', borderRadius: 14, boxShadow: '0 20px 60px rgba(15,23,42,0.16), 0 4px 12px rgba(15,23,42,0.06)', overflow: 'hidden' }}>
                    <DateRangePicker
                      from={customFrom ? (() => { const [y, m, d] = customFrom.split('-').map(Number); return new Date(y, m - 1, d) })() : null}
                      to={customTo ? (() => { const [y, m, d] = customTo.split('-').map(Number); return new Date(y, m - 1, d) })() : null}
                      onChange={(f, t) => { setCustomFrom(f); setCustomTo(t); setShowCustomPicker(false) }}
                      onClose={() => setShowCustomPicker(false)}
                    />
                  </div>
                </>
              )}
            </div>
            {(customFrom || customTo) && (
              <button onClick={() => { setCustomFrom(''); setCustomTo('') }} style={{ border: 'none', background: 'transparent', color: C.muted, fontSize: 12, fontWeight: 700, fontFamily: FONT, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                Clear range
              </button>
            )}
            <div style={{ position: 'relative' }} ref={filterBtnRef}>
              <button type="button" onClick={() => {
                  if (!filterOpen && filterBtnRef.current) setFilterAnchor(filterBtnRef.current.getBoundingClientRect())
                  setFilterOpen(v => !v)
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: '1px dashed ' + C.border, background: activeConditions.length ? C.navyBg : 'transparent', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, fontFamily: FONT, color: activeConditions.length ? C.navy : C.muted, whiteSpace: 'nowrap' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                {activeConditions.length ? `Filters (${activeConditions.length})` : 'Filters'}
              </button>
              {filterOpen && (
                <FilterBuilderPopover conditions={conditions} combinator={combinator} filterOptions={filterOptions} anchor={filterAnchor}
                  onAdd={addCondition} onUpdate={updateCondition} onRemove={removeCondition}
                  onSetCombinator={setCombinator} onClearAll={() => setConditions([])}
                  onClose={() => setFilterOpen(false)} />
              )}
            </div>
            <button
              onClick={() => load(true)}
              style={{ fontSize: 12.5, fontWeight: 700, color: C.text, background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontFamily: FONT }}
            >
              Refresh
            </button>
            {rows && <ExportButton filename="apps" data={exportRows} />}
          </div>
        </div>

        <div style={{ padding: '16px 14px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && (
            <div style={{ padding: '12px 16px', borderRadius: 10, background: 'var(--navy-tint)', border: '1px solid var(--card-border)', color: C.text, fontSize: 12.5, fontFamily: FONT }}>
              {error.includes('42703') || /column .* does not exist/i.test(error)
                ? 'The apps_feed table is missing the newer appv2 columns -- run supabase/sql/apps_feed_add_appv2_columns.sql in the Supabase SQL editor, then trigger .github/workflows/apps-sync.yml once (Actions tab -> Run workflow).'
                : error.includes('does not exist') || error.includes('42P01') || error.includes('404')
                ? 'The Apps cache isn’t set up yet -- run supabase/sql/apps_feed_setup.sql, then trigger .github/workflows/apps-sync.yml once (Actions tab -> Run workflow).'
                : error}
            </div>
          )}

          {loading ? (
            <InlineLoader label="Loading Apps" height={400} />
          ) : (
            <>
              <div className="lq-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 12 }}>
                <PremKPI label="Total Applications" value={fmtN(kpis.total)} icon={KPI_ICONS.total} accent={C.navy} accentBg={C.navyBg} />
                <PremKPI label="Distinct Students" value={fmtN(kpis.students)} icon={KPI_ICONS.agent} accent={C.blue} accentBg={C.blueBg} />
                <PremKPI label="Distinct Destinations" value={fmtN(kpis.destinations)} icon={KPI_ICONS.globe} accent={C.cyan} accentBg={C.cyanBg} />
                <PremKPI label="Human QL'd" value={fmtN(kpis.humanQl)} sub={pct(kpis.humanQl, kpis.total)} icon={KPI_ICONS.agent} accent={C.green} accentBg={C.greenBg} />
                <PremKPI label="AI QL'd" value={fmtN(kpis.aiQl)} sub={pct(kpis.aiQl, kpis.total)} icon={KPI_ICONS.ai} accent={C.blue} accentBg={C.blueBg} />
                <PremKPI label="Still on Floor" value={fmtN(kpis.floor)} sub={pct(kpis.floor, kpis.total)} icon={KPI_ICONS.bot} accent={C.navy} accentBg={C.navyBg} />
              </div>

              <div className="lq-grid2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Card title="Top destinations" sub="By destination country group">
                  <RankedBars data={byDestination.map(d => ({ label: d.label, count: d.count }))} labelKey="label" max={byDestination[0]?.count || 0} total={kpis.total} color={C.navy} showRank />
                </Card>
                <Card title="By source" sub="Where these applicants came from">
                  <RankedBars data={bySource.map(d => ({ label: d.label, count: d.count }))} labelKey="label" max={bySource[0]?.count || 0} total={kpis.total} color={C.blue} showRank />
                </Card>
                <Card title="Top campaigns" sub="First campaign attributed to the opportunity">
                  <RankedBars data={byCampaign.map(d => ({ label: d.label, count: d.count }))} labelKey="label" max={byCampaign[0]?.count || 0} total={kpis.total} color={C.cyan} showRank />
                </Card>
                <Card title="By intake category" sub="Intake this application is for">
                  <RankedBars data={byIntake.map(d => ({ label: d.label, count: d.count }))} labelKey="label" max={byIntake[0]?.count || 0} total={kpis.total} color={C.green} showRank />
                </Card>
              </div>

              <div className="lq-grid2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Card title="Applications by month" sub="First application submitted date, last 12 months in view">
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={monthTrend} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                      <defs><BarGrad id="appsMonthGrad" color={C.navy} /></defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 11.5, fill: C.muted, fontFamily: FONT }} axisLine={{ stroke: GRID_STROKE }} tickLine={false} />
                      <YAxis tick={{ fontSize: 11.5, fill: C.muted, fontFamily: FONT }} axisLine={false} tickLine={false} tickFormatter={fmtN} width={48} />
                      <Tooltip formatter={v => fmtN(v)} contentStyle={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 10, fontFamily: FONT, fontSize: 12.5 }} />
                      <Bar dataKey="count" name="Applications" fill={barFill('appsMonthGrad')} radius={BAR_RADIUS} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
                <Card title="Applications, day by day" sub="Current calendar month, through the most recent day with data — not affected by any filter above">
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={dailyTrendCurrentMonth} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                      <defs><BarGrad id="appsDayGrad" color={C.blue} /></defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize: 10.5, fill: C.muted, fontFamily: FONT }} axisLine={{ stroke: GRID_STROKE }} tickLine={false} interval={2} />
                      <YAxis tick={{ fontSize: 11.5, fill: C.muted, fontFamily: FONT }} axisLine={false} tickLine={false} tickFormatter={fmtN} width={48} />
                      <Tooltip formatter={v => fmtN(v)} contentStyle={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 10, fontFamily: FONT, fontSize: 12.5 }} />
                      <Bar dataKey="count" name="Applications" fill={barFill('appsDayGrad')} radius={BAR_RADIUS} maxBarSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              </div>

              <Card title={`${fmtN(filtered.length)} applications`} noPad>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid var(--card-border)' }}>
                  <input
                    value={search} onChange={e => setSearch(e.target.value)} placeholder="Search school, course, campaign, destination, ID…"
                    style={{ flex: '1 1 260px', minWidth: 200, maxWidth: 360, padding: '7px 12px', fontSize: 12.5, borderRadius: 9, border: '1px solid var(--card-border)', background: 'var(--card)', color: C.text, fontFamily: FONT }}
                  />
                  <Dropdown label="Destination" value={destFilter} onChange={setDestFilter} options={destOptions} minWidth={140} />
                  <Dropdown label="Intake" value={intakeFilter} onChange={setIntakeFilter} options={intakeOptions} minWidth={130} />
                  <Dropdown label="Source" value={sourceFilter} onChange={setSourceFilter} options={sourceOptions} minWidth={130} />
                  <Dropdown label="Human QL" value={humanQlFilter} onChange={setHumanQlFilter} options={[ALL, 'Human_QL', 'Floor']} minWidth={120} />
                  <Dropdown label="AI QL" value={aiQlFilter} onChange={setAiQlFilter} options={[ALL, 'AI_QL', 'Floor']} minWidth={110} />
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 1100 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--card-border)' }}>
                        {[
                          { key: 'first_app_submitted_at', label: 'First App Date' },
                          { key: 'destination_country', label: 'Destination' },
                          { key: 'intake_category', label: 'Intake' },
                          { key: 'school_name', label: 'School' },
                          { key: 'course_name', label: 'Course' },
                          { key: 'source', label: 'Source' },
                          { key: 'opp_first_campaign_name', label: 'Campaign' },
                          { key: 'vertical', label: 'Vertical' },
                          { key: 'futwork_human', label: 'Human QL' },
                          { key: 'futwork_ai', label: 'AI QL' },
                        ].map(col => (
                          <th
                            key={col.key} onClick={() => toggleSort(col.key)}
                            title="Click to sort"
                            style={{ padding: '9px 14px', fontSize: 10.5, fontWeight: 700, color: sortKey === col.key ? C.navy : C.muted, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                          >
                            {col.label}
                            <span style={{ marginLeft: 4, opacity: sortKey === col.key ? 1 : 0.35 }}>{sortKey === col.key ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((r, i) => (
                        <tr key={(r.opportunity_id || r.prospect_id || i) + '-' + i} style={{ borderBottom: '0.5px solid var(--card-border)' }}>
                          <td style={{ padding: '8px 14px', color: C.text, whiteSpace: 'nowrap' }}>{r.first_app_date || '—'}</td>
                          <td style={{ padding: '8px 14px', color: C.text }}>{r.destination_country || '—'}</td>
                          <td style={{ padding: '8px 14px', color: C.text }}>{r.intake_category || '—'}</td>
                          <td style={{ padding: '8px 14px', color: C.text, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.school_name || '—'}</td>
                          <td style={{ padding: '8px 14px', color: C.text, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.course_name || '—'}</td>
                          <td style={{ padding: '8px 14px', color: C.text }}>{r.source || '—'}</td>
                          <td style={{ padding: '8px 14px', color: C.text, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.opp_first_campaign_name || '—'}</td>
                          <td style={{ padding: '8px 14px', color: C.text }}>{r.vertical || '—'}</td>
                          <td style={{ padding: '8px 14px' }}>
                            <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, color: r.futwork_human === 'Human_QL' ? '#178A54' : C.muted, background: r.futwork_human === 'Human_QL' ? '#E9F8EF' : 'var(--bg3)' }}>{r.futwork_human || '—'}</span>
                          </td>
                          <td style={{ padding: '8px 14px' }}>
                            <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, color: r.futwork_ai === 'AI_QL' ? '#1577A0' : C.muted, background: r.futwork_ai === 'AI_QL' ? '#E3F5FD' : 'var(--bg3)' }}>{r.futwork_ai || '—'}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {filtered.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: C.muted, fontSize: 13 }}>No applications match these filters.</div>
                )}
                {totalPages > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '12px 16px' }}>
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid var(--card-border)', background: 'var(--card)', color: C.text, cursor: page === 1 ? 'default' : 'pointer', opacity: page === 1 ? 0.5 : 1, fontSize: 12, fontFamily: FONT }}>{'← Prev'}</button>
                    <span style={{ fontSize: 12, color: C.muted, fontFamily: FONT }}>Page {page} of {totalPages}</span>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid var(--card-border)', background: 'var(--card)', color: C.text, cursor: page === totalPages ? 'default' : 'pointer', opacity: page === totalPages ? 0.5 : 1, fontSize: 12, fontFamily: FONT }}>{'Next →'}</button>
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
  )
  if (embedded) return content
  return (
    <div className="lq-page-shell" style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.bg }}>
      <Sidebar />
      {content}
    </div>
  )
}
