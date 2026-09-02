import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import Sidebar from '../components/Sidebar'
import Button from '../components/Button'
import Dropdown from '../components/Dropdown'
import ExportButton from '../components/ExportButton'
import SlackReportPanel from '../components/SlackReportPanel'
import { SlackIcon } from '../components/icons/BrandIcons'
import { DashboardSkeleton } from '../components/SkeletonLoader'
import { C, FONT, Card } from '../ui/dashboardKit'
import { SUPER_TRACKER_REPORT_VERSIONS } from '../lib/superTrackerReport'
import { captureNodePng, rowsToCsv, nextPaint } from '../lib/slackShare'

// Super Tracker -- a real PRIVATE Google Sheet (company-wide B2C/B2B/Fly
// Finance/Fly Homes metrics), read server-side via lib/superTracker.mjs (a
// service-account Viewer share + the real Sheets API, never the public
// gviz/tq CSV every other Quantum sheet source uses). See that file's header
// comment for why, and Settings > Data > "Super Tracker Sheet" for the
// connection test.
//
// Deliberately data-driven: every section (workbook tab), every metric row and
// every week column comes straight from whatever the backend discovered in the
// live sheet -- nothing here hardcodes a metric name, a business line, or how
// many weeks exist. Adding/renaming a tab or a week in the sheet needs zero
// code change here; the one thing that IS code (by explicit request -- "keep
// this flexibility... from repo to code") is SECTION_OVERRIDES in
// lib/superTracker.mjs, which only controls display label/colour, never what
// data shows up.

async function fetchSuperTrackerData() {
  const r = await fetch('/api/crm-leads?source=super_tracker', { credentials: 'include', cache: 'no-store' })
  const d = await r.json()
  if (!r.ok) throw new Error(d.detail || d.error || 'Failed to load Super Tracker')
  return d
}

function useSuperTracker() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [lastSync, setLastSync] = useState(null)

  const load = useCallback(async (opts) => {
    const isRefresh = opts && opts.refresh
    if (isRefresh) setRefreshing(true); else setLoading(true)
    setError(null)
    try {
      const d = await fetchSuperTrackerData()
      setData(d)
      setLastSync(new Date())
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  return { data, loading, refreshing, error, lastSync, refresh: () => load({ refresh: true }) }
}

// Distinct, non-empty values in sheet order (not alphabetised) -- matches how
// every other filter dropdown in this app derives its option list from live
// data rather than a hardcoded enum.
function distinctInOrder(rows, field) {
  const seen = new Set()
  const out = []
  for (const r of rows) {
    const v = (r[field] || '').trim()
    if (v && !seen.has(v)) { seen.add(v); out.push(v) }
  }
  return out
}

function weekValue(row, label) {
  const w = (row.weeks || []).find(x => x.label === label)
  return w ? w.value : ''
}

export default function SuperTrackerDashboard() {
  const { data, loading, refreshing, error, lastSync, refresh } = useSuperTracker()
  // The real workbook has a genuine mix of metric-tracker tabs (a real header
  // row, real weekly data) and planning/reference tabs (README, a metric
  // glossary, a dashboard spec, ...) that this page has no business listing as
  // a trackable "section" -- they carry zero rows and would just be clutter in
  // the Section picker. Filtering here (rather than in the backend) keeps
  // lib/superTracker.mjs's own response complete/debuggable while the page
  // only ever shows tabs that are actually real metric data.
  const sections = ((data && data.sections) || []).filter(s => !s.unrecognized && s.rows.length > 0)

  const [sectionKey, setSectionKey] = useState(null)
  const [viewMode, setViewMode] = useState('latest') // 'latest' | 'all'
  const [selectedWeek, setSelectedWeek] = useState(null)
  const [query, setQuery] = useState('')
  const [blFilter, setBlFilter] = useState('All')
  const [ownerFilter, setOwnerFilter] = useState('All')

  // First real load (or a section disappearing/reordering on refresh) --
  // default to the first section rather than leaving nothing selected.
  useEffect(() => {
    if (!sections.length) return
    if (!sectionKey || !sections.some(s => s.title === sectionKey)) {
      setSectionKey(sections[0].title)
    }
  }, [sections, sectionKey])

  const activeSection = useMemo(
    () => sections.find(s => s.title === sectionKey) || sections[0] || null,
    [sections, sectionKey]
  )

  // Default the week picker to the LAST column in the sheet's own order (the
  // most recently added week) whenever the active section changes -- never
  // assumes a date format to sort by, since a "week" label is just whatever
  // text the sheet owner typed into that header cell.
  useEffect(() => {
    if (!activeSection) return
    const labels = activeSection.weekLabels || []
    if (!labels.length) { setSelectedWeek(null); return }
    if (!selectedWeek || !labels.includes(selectedWeek)) setSelectedWeek(labels[labels.length - 1])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection && activeSection.title])

  const blOptions = useMemo(() => ['All', ...distinctInOrder(activeSection ? activeSection.rows : [], 'businessLine')], [activeSection])
  const ownerOptions = useMemo(() => ['All', ...distinctInOrder(activeSection ? activeSection.rows : [], 'owner')], [activeSection])

  const filteredRows = useMemo(() => {
    if (!activeSection) return []
    const q = query.trim().toLowerCase()
    return activeSection.rows.filter(r => {
      if (blFilter !== 'All' && (r.businessLine || '') !== blFilter) return false
      if (ownerFilter !== 'All' && (r.owner || '') !== ownerFilter) return false
      if (q && !(r.metric || '').toLowerCase().includes(q) && !(r.definition || '').toLowerCase().includes(q)) return false
      return true
    })
  }, [activeSection, query, blFilter, ownerFilter])

  // "Export everything" -- every section, every metric, every week, in one
  // wide table (Section + metadata columns, then one column per week label).
  // Week columns are unioned across sections in first-seen order so a metric
  // with no value for a given week in ITS section just exports blank there,
  // rather than one export shape per section.
  const allWeekLabels = useMemo(() => {
    const seen = new Set(); const out = []
    for (const s of sections) for (const w of s.weekLabels || []) if (!seen.has(w)) { seen.add(w); out.push(w) }
    return out
  }, [sections])

  const exportRows = useMemo(() => {
    const rows = []
    for (const s of sections) {
      for (const r of s.rows) {
        const row = {
          Section: s.label,
          'S.No.': r.sNo || '',
          Metric: r.metric || '',
          Definition: r.definition || '',
          'Business Line': r.businessLine || '',
          Owner: r.owner || '',
          'To Be Posted?': r.toBePosted || '',
        }
        allWeekLabels.forEach(w => { row[w] = weekValue(r, w) })
        rows.push(row)
      }
    }
    return rows
  }, [sections, allWeekLabels])

  const exportCols = useMemo(
    () => ['Section', 'S.No.', 'Metric', 'Definition', 'Business Line', 'Owner', 'To Be Posted?', ...allWeekLabels],
    [allWeekLabels]
  )
  const totalRowCount = useMemo(() => sections.reduce((s, sec) => s + sec.rows.length, 0), [sections])

  const [slackOpen, setSlackOpen] = useState(false)
  const tableRef = useRef(null)

  // Ctx for the advanced Slack report (src/lib/superTrackerReport.js) -- the
  // FULL, unfiltered section list (every real metric section, every row,
  // every week), never whatever the on-screen Section/Business Line/Owner/
  // search filters currently narrow the table to -- a compliance report has
  // to reflect the true state of the whole tracker, not one filtered slice.
  const buildSlackContext = useCallback(() => ({ sections }), [sections])

  // Screenshots whatever table is actually on screen (current section, current
  // view mode) for the report's own visual attachment, and attaches the FULL
  // flattened CSV (every section/metric/week) regardless -- so a reader who
  // wants the whole picture always has it, even if the image only shows one
  // section's snapshot.
  const captureSlackFiles = useCallback(async () => {
    await nextPaint()
    const node = tableRef.current
    const shot = node ? await captureNodePng(node) : null
    return { pngBase64: shot ? shot.base64 : null, pixelRatio: shot ? shot.pixelRatio : null, csv: rowsToCsv(exportCols, exportRows) }
  }, [exportCols, exportRows])

  if (loading) {
    return (
      <div className="lq-page-shell" style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.bg, fontFamily: FONT }}>
        <Sidebar />
        <div style={{ flex: 1, overflow: 'auto' }}><DashboardSkeleton /></div>
      </div>
    )
  }

  if (error || (data && data.configured === false)) {
    return (
      <div className="lq-page-shell" style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.bg, fontFamily: FONT }}>
        <Sidebar />
        <div style={{ flex: 1, overflow: 'auto', padding: 28 }}>
          <div style={{ padding: '10px 14px', borderRadius: 10, background: '#FEF2F2', border: '0.5px solid #FECACA', color: '#B91C1C', fontSize: 12.5, maxWidth: 560 }}>
            ✕ {data && data.configured === false
              ? 'Super Tracker is not configured -- set GOOGLE_SHEETS_CLIENT_EMAIL and GOOGLE_SHEETS_PRIVATE_KEY in Vercel env, and make sure the sheet is shared with that service account as a Viewer.'
              : "Couldn't load Super Tracker: " + error}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="lq-page-shell" style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.bg, fontFamily: FONT }}>
      <style>{'@keyframes stPulse{0%,100%{opacity:1}50%{opacity:.3}}'}</style>
      <Sidebar />
      <div style={{ margin: '12px 14px 0', borderRadius: 14, border: '1px solid #EEF1F6', boxShadow: '0 1px 3px rgba(31,60,132,0.06)', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <div style={{ background: 'var(--card)', borderBottom: '0.5px solid ' + C.border, padding: '10px 28px', minHeight: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0, flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontSize: 10.5, color: C.muted, margin: 0, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Overview / Super Tracker</p>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: '2px 0 0', letterSpacing: '-0.4px', display: 'flex', alignItems: 'center', gap: 8 }}>
              Super Tracker
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 700, color: C.navy, background: C.navyBg, padding: '3px 9px', borderRadius: 999 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.navy, animation: 'stPulse 1.6s ease-in-out infinite' }} />
                LIVE · PRIVATE SHEET
              </span>
            </h1>
          </div>
          <div className="lq-header-controls" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {sections.length > 1 && (
              <Dropdown
                label="Section"
                value={sectionKey}
                onChange={setSectionKey}
                minWidth={170}
                options={sections.map(s => ({ value: s.title, label: s.label }))}
              />
            )}
            {blOptions.length > 1 && (
              <Dropdown label="Business Line" value={blFilter} onChange={setBlFilter} minWidth={140} options={blOptions} />
            )}
            {ownerOptions.length > 1 && (
              <Dropdown label="Owner" value={ownerFilter} onChange={setOwnerFilter} minWidth={130} options={ownerOptions} />
            )}
            <Dropdown
              label="View"
              value={viewMode}
              onChange={setViewMode}
              minWidth={130}
              options={[{ value: 'latest', label: 'Latest week' }, { value: 'all', label: 'All weeks' }]}
            />
            {viewMode === 'latest' && activeSection && activeSection.weekLabels.length > 0 && (
              <Dropdown
                label="Week"
                value={selectedWeek}
                onChange={setSelectedWeek}
                minWidth={140}
                options={activeSection.weekLabels}
              />
            )}
            <input
              type="text"
              placeholder="Search metric..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{ padding: '7px 12px', fontSize: 12.5, borderRadius: 8, border: '1px solid ' + C.border, background: 'var(--bg2)', color: C.text, width: 160 }}
            />
            {lastSync && <span style={{ fontSize: 10.5, color: C.muted, whiteSpace: 'nowrap' }}>Synced {lastSync.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}{refreshing ? '…' : ''}</span>}
            <Button onClick={refresh} disabled={refreshing} size="sm">{refreshing ? 'Refreshing' : 'Refresh'}</Button>
            <Button size="sm" variant="secondary" onClick={() => setSlackOpen(true)} icon={<SlackIcon size={13} />}>Send to Slack</Button>
            <ExportButton data={exportRows} filename="super_tracker" dashboardId="super_tracker" hideSlack />
          </div>
        </div>
        <SlackReportPanel
          open={slackOpen}
          onClose={() => setSlackOpen(false)}
          versions={SUPER_TRACKER_REPORT_VERSIONS}
          buildContext={buildSlackContext}
          captureFiles={captureSlackFiles}
          dashboardId="super_tracker"
          filename="super-tracker"
          rowCount={totalRowCount}
        />

        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
          {!activeSection ? (
            <div style={{ padding: 20, color: C.muted, fontSize: 13 }}>No sections found in the workbook.</div>
          ) : activeSection.unrecognized ? (
            <div style={{ padding: '10px 14px', borderRadius: 10, background: '#FEF2F2', border: '0.5px solid #FECACA', color: '#B91C1C', fontSize: 12.5, maxWidth: 560 }}>
              ✕ Couldn't find a header row (a row with "Metric" + "S. No." or "Owner") in the "{activeSection.label}" tab -- check the sheet hasn't been reformatted in a way this page can't recognise.
            </div>
          ) : (
            <div ref={tableRef}>
            <Card
              title={activeSection.label}
              sub={filteredRows.length.toLocaleString('en-IN') + ' of ' + activeSection.rows.length.toLocaleString('en-IN') + ' metric row(s)' + (activeSection.weekLabels.length ? ' · ' + activeSection.weekLabels.length + ' week(s) tracked' : '')}
              noPad
            >
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: viewMode === 'all' ? (600 + activeSection.weekLabels.length * 110) : 700 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg2)' }}>
                      <Th style={{ width: 44 }}>#</Th>
                      <Th sticky style={{ minWidth: 220 }}>Metric</Th>
                      <Th style={{ width: 130 }}>Business Line</Th>
                      <Th style={{ width: 120 }}>Owner</Th>
                      <Th style={{ width: 90 }}>Posted?</Th>
                      {viewMode === 'latest' ? (
                        <Th style={{ minWidth: 130 }}>{selectedWeek || 'Value'}</Th>
                      ) : (
                        activeSection.weekLabels.map(w => <Th key={w} style={{ minWidth: 110 }}>{w}</Th>)
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.length === 0 ? (
                      <tr><td colSpan={5 + (viewMode === 'latest' ? 1 : Math.max(activeSection.weekLabels.length, 1))} style={{ padding: 24, textAlign: 'center', color: C.muted }}>No metrics match this filter.</td></tr>
                    ) : filteredRows.map((r, i) => (
                      <tr key={i} style={{ borderTop: '0.5px solid ' + C.border }}>
                        <Td>{r.sNo}</Td>
                        <Td sticky title={r.definition || undefined} style={{ fontWeight: 600, color: C.text, cursor: r.definition ? 'help' : 'default' }}>{r.metric}</Td>
                        <Td muted>{r.businessLine}</Td>
                        <Td muted>{r.owner}</Td>
                        <Td muted>{r.toBePosted}</Td>
                        {viewMode === 'latest' ? (
                          <Td style={{ fontWeight: 600, color: C.navy }}>{weekValue(r, selectedWeek) || '—'}</Td>
                        ) : (
                          activeSection.weekLabels.map(w => <Td key={w}>{weekValue(r, w) || '—'}</Td>)
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Th({ children, sticky, style }) {
  return (
    <th style={{
      textAlign: 'left', padding: '9px 12px', fontSize: 10.5, fontWeight: 700, color: C.muted,
      textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
      position: sticky ? 'sticky' : undefined, left: sticky ? 0 : undefined,
      background: sticky ? 'var(--bg2)' : undefined, zIndex: sticky ? 2 : undefined,
      ...style,
    }}>{children}</th>
  )
}
function Td({ children, sticky, muted, style, title }) {
  return (
    <td title={title} style={{
      padding: '9px 12px', color: muted ? C.muted : C.text, verticalAlign: 'top',
      position: sticky ? 'sticky' : undefined, left: sticky ? 0 : undefined,
      background: sticky ? 'var(--card)' : undefined, zIndex: sticky ? 1 : undefined,
      ...style,
    }}>{children}</td>
  )
}
