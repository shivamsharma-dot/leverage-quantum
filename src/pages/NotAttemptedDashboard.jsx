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

const CHANNEL_OPTIONS = [
  { value: 'all', label: 'All channels' },
  { value: 'Human', label: 'Human' },
  { value: 'AI', label: 'AI' },
]

const COLUMNS = [
  { key: 'opportunityId', label: 'Opportunity ID' },
  { key: 'contactName', label: 'Contact' },
  { key: 'channel', label: 'Channel' },
  { key: 'humanDisposition', label: 'Human Disposition' },
  { key: 'aiDisposition', label: 'AI Disposition' },
  { key: 'ownerName', label: 'Opportunity Owner' },
  { key: 'ownerSalesGroups', label: 'Sales Group' },
  { key: 'status', label: 'Status' },
  { key: 'createdOn', label: 'Opportunity Created On' },
]

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

export default function NotAttemptedDashboard() {
  const [datePreset, setDatePreset] = useState('this_month')
  const [customRange, setCustomRange] = useState(null) // {since, until} when datePreset === 'custom'
  const [pickerOpen, setPickerOpen] = useState(false)
  const [channel, setChannel] = useState('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [infoOpen, setInfoOpen] = useState(false)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [syncedAt, setSyncedAt] = useState(null)
  const pickerRef = useRef(null)

  const range = datePreset === 'custom' && customRange ? customRange : computePreset(datePreset)

  async function load(force) {
    const cacheKey = 'not_attempted_v1:' + range.since + ':' + range.until
    if (!force) {
      const cached = getSession(cacheKey)
      if (cached) { setData(cached.data.result); setSyncedAt(cached.data.ts); setPage(0); setLoading(false); setError(null); return }
    }
    setLoading(true); setError(null)
    try {
      const d = await fetchJson(`/api/crm-leads?source=leadsquared&mode=not_attempted_opportunities&since=${range.since}&until=${range.until}`)
      setData(d)
      const ts = new Date()
      setSession(cacheKey, { result: d, ts })
      setSyncedAt(ts)
      setPage(0)
    } catch (e) {
      setError(e.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(false) }, [range.since, range.until]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!pickerOpen) return
    const onDoc = e => { if (pickerRef.current && !pickerRef.current.contains(e.target)) setPickerOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [pickerOpen])

  const allRows = data ? data.rows : []

  const filteredRows = useMemo(() => {
    let rows = allRows
    if (channel !== 'all') rows = rows.filter(r => r.channel === channel || (channel === 'Human' && r.channel === 'Human + AI') || (channel === 'AI' && r.channel === 'Human + AI'))
    const q = search.trim().toLowerCase()
    if (q) rows = rows.filter(r =>
      (r.contactName || '').toLowerCase().includes(q) ||
      (r.opportunityId || '').toLowerCase().includes(q) ||
      (r.ownerName || '').toLowerCase().includes(q)
    )
    return rows
  }, [allRows, channel, search])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / 25))
  const safePage = Math.min(page, totalPages - 1)
  const pageRows = filteredRows.slice(safePage * 25, safePage * 25 + 25)

  const humanCount = allRows.filter(r => r.channel === 'Human' || r.channel === 'Human + AI').length
  const aiCount = allRows.filter(r => r.channel === 'AI' || r.channel === 'Human + AI').length

  const exportRows = useMemo(() => filteredRows.map(r => {
    const o = {}
    COLUMNS.forEach(c => { o[c.label] = r[c.key] || '' })
    return o
  }), [filteredRows])

  const rangeLabel = range.since === range.until ? range.since : `${range.since} → ${range.until}`

  return (
    <div className="lq-page-shell" style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)', fontFamily: FONT }}>
      <Sidebar />
      <div style={{ flex: 1, minWidth: 0, padding: '28px 0 40px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '0 28px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.text }}>Not Attempted</div>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
              Opportunities queued to Futwork or Futwork AI whose Last Disposition is still a "call queued" placeholder — the first call has never actually gone out.
            </div>
          </div>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '16px 28px 0',
          padding: '10px 12px', background: 'var(--bg2)', border: `0.5px solid ${C.border}`, borderRadius: 12,
        }}>
          {DATE_PRESETS.map(([key, label]) => (
            <button key={key} onClick={() => { setDatePreset(key); setCustomRange(null) }} style={{
              padding: '7px 14px', borderRadius: 8, border: `0.5px solid ${datePreset === key ? C.navy : C.border}`,
              background: datePreset === key ? 'var(--navy-tint)' : 'var(--card)', color: datePreset === key ? C.navy : C.sub,
              fontSize: 12.5, fontWeight: 700, fontFamily: FONT, cursor: 'pointer', flexShrink: 0,
            }}>{label}</button>
          ))}
          <div ref={pickerRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button onClick={() => setPickerOpen(v => !v)} style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px', borderRadius: 8,
              border: `0.5px solid ${datePreset === 'custom' ? C.navy : C.border}`,
              background: datePreset === 'custom' ? 'var(--navy-tint)' : 'var(--card)',
              color: datePreset === 'custom' ? C.navy : C.sub, fontSize: 12.5, fontWeight: 700, fontFamily: FONT, cursor: 'pointer',
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
              {datePreset === 'custom' && customRange ? `${customRange.since} → ${customRange.until}` : 'Custom range'}
            </button>
            {pickerOpen && (
              <div style={{
                position: 'absolute', left: 0, top: 'calc(100% + 8px)', zIndex: 50, background: 'var(--card)',
                border: `0.5px solid ${C.border}`, borderRadius: 14, boxShadow: '0 20px 60px rgba(15,23,42,0.16), 0 4px 12px rgba(15,23,42,0.06)', overflow: 'hidden',
              }}>
                <DateRangePicker from={parseYmd(customRange && customRange.since)} to={parseYmd(customRange && customRange.until)}
                  onChange={(from, to) => { setCustomRange({ since: from, until: to }); setDatePreset('custom'); setPickerOpen(false) }} />
              </div>
            )}
          </div>
          <div style={{ width: 1, alignSelf: 'stretch', background: C.border, margin: '0 2px' }} />
          <Dropdown label="Channel" value={channel} onChange={setChannel} minWidth={140} options={CHANNEL_OPTIONS} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contact / owner / opp id"
            style={{
              padding: '7px 12px', borderRadius: 8, border: `0.5px solid ${C.border}`, background: 'var(--card)',
              fontSize: 12.5, fontFamily: FONT, color: C.text, minWidth: 220,
            }} />
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
          <ExportButton data={exportRows} filename={`not_attempted_${range.since}_${range.until}`} />
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
                <div style={{ fontWeight: 800, color: C.text, marginBottom: 6 }}>What "Not Attempted" means</div>
                <div><b>Human:</b> Last Disposition from Futwork = "Call queued successfully at Futwork".</div>
                <div><b>AI:</b> Last Disposition from Futwork AI = "Call queued successfully at Futwork AI" or "Call queued successfully at AI Futwork".</div>
                <div style={{ marginTop: 6 }}>Either value means the lead was routed but no call has come back with a real disposition yet — not a QL, not a non-QL, just untouched.</div>
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

        {loading && !data ? (
          <div style={{ padding: '0 28px', marginTop: 20 }}><DashboardSkeleton /></div>
        ) : (
          <div style={{ opacity: loading ? 0.45 : 1, pointerEvents: loading ? 'none' : 'auto', transition: 'opacity .15s' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, padding: '20px 28px 0' }}>
              <PremKPI label="Not Attempted" value={fmtN(allRows.length)} sub={rangeLabel} accent={C.navy} icon={KPI_ICONS.total} />
              <PremKPI label="Human" value={fmtN(humanCount)} sub="Queued, no call yet" accent={C.navy} icon={KPI_ICONS.agent} />
              <PremKPI label="AI" value={fmtN(aiCount)} sub="Queued, no call yet" accent={C.navy} icon={KPI_ICONS.agent} />
            </div>

            <div style={{ padding: '20px 28px 0' }}>
              <Card title="Records" sub={`${filteredRows.length} rows — ${COLUMNS.length} columns`}
                action={totalPages > 1 ? <PaginationControl page={safePage} totalPages={totalPages} onPrev={() => setPage(safePage - 1)} onNext={() => setPage(safePage + 1)} /> : null}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, fontFamily: FONT }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                        {COLUMNS.map(c => (
                          <th key={c.key} style={{ textAlign: 'left', padding: '8px 10px', color: C.muted, fontWeight: 700, whiteSpace: 'nowrap' }}>{c.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.length === 0 && (
                        <tr><td colSpan={COLUMNS.length} style={{ padding: '20px 10px', textAlign: 'center', color: C.muted }}>No not-attempted opportunities in this window.</td></tr>
                      )}
                      {pageRows.map(r => (
                        <tr key={r.opportunityId} style={{ borderBottom: `0.5px solid ${C.border}` }}>
                          <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                            <a href={LEADSQUARED_OPPORTUNITY_URL + r.opportunityId} target="_blank" rel="noreferrer" style={{ color: C.blue, textDecoration: 'none' }}>{r.opportunityId}</a>
                          </td>
                          <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                            {r.prospectId ? <a href={LEADSQUARED_CONTACT_URL + r.prospectId} target="_blank" rel="noreferrer" style={{ color: C.blue, textDecoration: 'none' }}>{r.contactName || r.prospectId}</a> : (r.contactName || '—')}
                          </td>
                          <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', fontWeight: 700, color: r.channel === 'Human + AI' ? C.navy : C.text }}>{r.channel}</td>
                          <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{r.humanDisposition || '—'}</td>
                          <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{r.aiDisposition || '—'}</td>
                          <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{r.ownerName || '—'}</td>
                          <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{r.ownerSalesGroups || '—'}</td>
                          <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{r.status || '—'}</td>
                          <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{r.createdOn || '—'}</td>
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
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
