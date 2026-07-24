import React, { useState, useEffect, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import Sidebar from '../components/Sidebar'
import ExportButton from '../components/ExportButton'
import Button from '../components/Button'
import { DashboardSkeleton } from '../components/SkeletonLoader'
import { resolveSheetUrl } from '../lib/dataSources'
import { C, FONT, Card, PremKPI, KPI_ICONS, RankedBars, fmtN } from '../ui/dashboardKit'

const DEFAULT_CSV = 'https://docs.google.com/spreadsheets/d/1FsfBQAAKWwnDCLFRbvamFaJiqs2nq8Wltk5e8LGAhRo/gviz/tq?tqx=out:csv&sheet=human_unassigned'

// LeadSquared: Contact and Opportunity are distinct records -- prospect_id is the
// Contact (the person). Same pipeline convention as Human/AI QL Detail.
const LEADSQUARED_CONTACT_URL = 'https://in21.leadsquared.com/LeadManagement/LeadDetails?LeadID='

const COLS = [
  { key: 'date', label: 'Date', width: 90 },
  { key: 'ageDays', label: 'Age', width: 70, numeric: true },
  { key: 'prospectId', label: 'Prospect ID', width: 150, mono: true },
  { key: 'owner', label: 'Current Owner', width: 190 },
  { key: 'country', label: 'Country', width: 130 },
  { key: 'degree', label: 'Degree', width: 110 },
  { key: 'course', label: 'Course', width: 160, ellipsis: true },
  { key: 'disposition', label: 'Disposition', width: 170 },
  { key: 'budget', label: 'Budget', width: 90 },
  { key: 'campaign', label: 'Campaign', width: 190, ellipsis: true },
  { key: 'futworkProject', label: 'Project', width: 110 },
]

function parseCsvRow(line) {
  const cols = []
  let buf = '', inQ = false
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ }
    else if (ch === ',' && !inQ) { cols.push(buf.trim()); buf = '' }
    else buf += ch
  }
  cols.push(buf.trim())
  return cols
}

function parseDate(raw) {
  if (!raw) return null
  const s = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0')
  return null
}
function fmtDateLabel(iso) {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}
function ageDaysFrom(iso) {
  if (!iso) return null
  const d = new Date(iso + 'T00:00:00')
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}
function ownerName(e) {
  if (!e) return 'Unassigned'
  const local = String(e).split('@')[0]
  return local.replace(/\./g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

async function fetchRows() {
  const url = await resolveSheetUrl('humanUnassigned', DEFAULT_CSV)
  const res = await fetch(url + (url.includes('?') ? '&' : '?') + '_=' + Date.now(), { cache: 'no-store' })
  const text = await res.text()
  const rows = text.trim().split('\n').map(parseCsvRow)
  const [hdr, ...data] = rows
  const low = hdr.map(x => x.toLowerCase().trim())
  const h = k => low.indexOf(k)
  return data.filter(r => r.length > 1 && (r[h('prospect_id')] || '').trim()).map(r => {
    const date = parseDate(r[h('ai_activity_date')])
    return {
      prospectId: r[h('prospect_id')] || '',
      opportunityId: r[h('opportunity_id_futwork')] || '',
      date,
      ageDays: ageDaysFrom(date),
      owner: (r[h('opportunity_owner_email')] || '').trim(),
      country: (r[h('country_interested')] || '').trim() || 'Unknown',
      degree: (r[h('degree_type')] || '').trim() || 'Unknown',
      course: (r[h('preferred_course')] || '').trim(),
      intake: (r[h('preferred_intake')] || '').trim(),
      disposition: (r[h('disposition')] || '').trim() || 'Unknown',
      dispositionReason: (r[h('disposition_reason')] || '').trim(),
      budget: (r[h('budget')] || '').trim(),
      campaign: (r[h('opp_first_campaign_name')] || '').trim(),
      futworkProject: (r[h('futwork_project')] || '').trim(),
      passport: (r[h('valid_passport')] || '').trim(),
      degreeStatus: (r[h('student_current_degree_status')] || '').trim(),
    }
  }).filter(r => r.date)
}

function FilterDropdown({ label, value, options, open, onToggle, onSelect }) {
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button type="button" onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 9px', borderRadius: 7, border: '0.5px solid ' + (open ? C.blue : C.border), background: 'var(--card)', cursor: 'pointer', fontSize: 11, fontWeight: 500, fontFamily: FONT, color: C.text, whiteSpace: 'nowrap' }}>
        <span style={{ color: C.muted, fontWeight: 600 }}>{label}:</span>
        <span style={{ fontWeight: 600 }}>{value === 'all' ? 'All' : value}</span>
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && <div onClick={onToggle} style={{ position: 'fixed', inset: 0, zIndex: 150 }} />}
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 200, minWidth: 160, maxHeight: 320, overflowY: 'auto', background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, boxShadow: '0 12px 32px -8px rgba(15,23,42,0.22)', padding: 4 }}>
          {options.map(o => (
            <button key={o} type="button" onClick={() => onSelect(o)}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 9px', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: value === o ? 700 : 500, fontFamily: FONT, color: value === o ? C.navy : '#374151', background: value === o ? C.navyBg : 'transparent' }}
              onMouseEnter={e => { if (value !== o) e.currentTarget.style.background = '#F3F4F6' }}
              onMouseLeave={e => { if (value !== o) e.currentTarget.style.background = 'transparent' }}>
              {o === 'all' ? 'All' : o}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function HumanUnassignedDashboard() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [countryFilter, setCountryFilter] = useState('all')
  const [dispositionFilter, setDispositionFilter] = useState('all')
  const [openMenu, setOpenMenu] = useState(null)
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState('ageDays')
  const [sortDir, setSortDir] = useState('desc')
  const [sending, setSending] = useState(false)
  const [sendMsg, setSendMsg] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchRows().then(r => { if (!cancelled) { setRows(r); setLoading(false) } }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const reload = () => {
    setLoading(true)
    fetchRows().then(r => { setRows(r); setLoading(false) }).catch(() => setLoading(false))
  }

  const sendNow = async () => {
    setSending(true); setSendMsg(null)
    try {
      const res = await fetch('/api/send-report', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'unassigned_leads', triggered_by: 'manual' }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Send failed')
      setSendMsg({ ok: true, text: 'Email sent to Akash' })
    } catch (e) {
      setSendMsg({ ok: false, text: e.message })
    } finally {
      setSending(false)
      setTimeout(() => setSendMsg(null), 4000)
    }
  }

  const filtered = useMemo(() => {
    let out = rows
    if (countryFilter !== 'all') out = out.filter(r => r.country === countryFilter)
    if (dispositionFilter !== 'all') out = out.filter(r => r.disposition === dispositionFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      out = out.filter(r => r.course.toLowerCase().includes(q) || r.country.toLowerCase().includes(q) || r.campaign.toLowerCase().includes(q) || r.prospectId.toLowerCase().includes(q) || r.owner.toLowerCase().includes(q))
    }
    return out
  }, [rows, countryFilter, dispositionFilter, search])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey]
      if (sortKey === 'ageDays') { av = av || 0; bv = bv || 0 }
      else { av = (av || '').toString().toLowerCase(); bv = (bv || '').toString().toLowerCase() }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return arr
  }, [filtered, sortKey, sortDir])

  useEffect(() => { setPage(1) }, [countryFilter, dispositionFilter, search])

  const PAGE_SIZE = 25
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageItems = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const countryOptions = useMemo(() => ['all', ...[...new Set(rows.map(r => r.country))].sort()], [rows])
  const dispositionOptions = useMemo(() => ['all', ...[...new Set(rows.map(r => r.disposition))].sort()], [rows])

  const kpi = useMemo(() => {
    const total = filtered.length
    const oldest = filtered.reduce((m, r) => (r.ageDays > (m || 0) ? r.ageDays : m), 0)
    const over3d = filtered.filter(r => (r.ageDays || 0) >= 3).length
    const distinctOwners = new Set(filtered.map(r => r.owner)).size
    return { total, oldest, over3d, distinctOwners }
  }, [filtered])

  const byCountry = useMemo(() => {
    const counts = {}
    filtered.forEach(r => { counts[r.country] = (counts[r.country] || 0) + 1 })
    return Object.entries(counts).map(([country, count]) => ({ country, count })).sort((a, b) => b.count - a.count).slice(0, 8)
  }, [filtered])

  const byAgeBucket = useMemo(() => {
    const buckets = { '0-1d': 0, '2-3d': 0, '4-7d': 0, '8d+': 0 }
    filtered.forEach(r => {
      const a = r.ageDays || 0
      if (a <= 1) buckets['0-1d']++
      else if (a <= 3) buckets['2-3d']++
      else if (a <= 7) buckets['4-7d']++
      else buckets['8d+']++
    })
    return Object.entries(buckets).map(([label, count]) => ({ label, count }))
  }, [filtered])

  const exportRows = useMemo(() => sorted.map(r => ({
    Date: fmtDateLabel(r.date), 'Age (days)': r.ageDays, 'Prospect ID': r.prospectId, 'Opportunity ID': r.opportunityId,
    'Current Owner': r.owner, Country: r.country, Degree: r.degree, Course: r.course, Intake: r.intake,
    Disposition: r.disposition, Budget: r.budget, Campaign: r.campaign, Project: r.futworkProject,
  })), [sorted])

  const toggleSort = key => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const copy = (e, text) => { e.stopPropagation(); navigator.clipboard?.writeText(text) }

  function cell(r, key) {
    switch (key) {
      case 'date': return fmtDateLabel(r.date)
      case 'ageDays': return <span style={{ fontWeight: 700, color: r.ageDays >= 3 ? C.navy : r.ageDays >= 1 ? C.blue : C.muted }}>{r.ageDays}d</span>
      case 'prospectId': return r.prospectId ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'monospace', fontSize: 11 }} title={'Open Contact in LeadSquared: ' + r.prospectId}>
          <a href={LEADSQUARED_CONTACT_URL + encodeURIComponent(r.prospectId)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ color: C.blue, textDecoration: 'none' }}>{r.prospectId.slice(0, 8)}…</a>
          <button type="button" onClick={e => copy(e, r.prospectId)} title="Copy" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.muted, display: 'inline-flex' }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
          </button>
        </span>
      ) : '—'
      case 'owner': return <span title={r.owner} style={{ color: C.muted, fontStyle: 'italic' }}>{ownerName(r.owner)} <span style={{ opacity: 0.6 }}>(bot)</span></span>
      case 'country': return r.country
      case 'degree': return r.degree
      case 'course': return <span title={r.course}>{r.course || '—'}</span>
      case 'disposition': return <span title={r.dispositionReason}>{r.disposition}</span>
      case 'budget': return r.budget || '—'
      case 'campaign': return <span title={r.campaign}>{r.campaign || '—'}</span>
      case 'futworkProject': return r.futworkProject || '—'
      default: return '—'
    }
  }

  const th = { padding: '10px 12px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', cursor: 'pointer' }
  const td = { padding: '9px 12px', fontSize: 12.5, color: C.text, borderTop: '0.5px solid #F1F4F9', whiteSpace: 'nowrap' }

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.bg, fontFamily: FONT }}>
        <Sidebar />
        <div style={{ flex: 1, overflow: 'auto' }}><DashboardSkeleton /></div>
      </div>
    )
  }

  return (
    <div className="lq-page-shell" style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.bg, fontFamily: FONT }}>
      <Sidebar />
      <div style={{ margin: '12px 14px 0', borderRadius: 14, border: '1px solid #EEF1F6', boxShadow: '0 1px 3px rgba(31,60,132,0.06)', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <div style={{ background: 'var(--card)', borderBottom: '0.5px solid ' + C.border, padding: '0 28px', minHeight: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0, flexWrap: 'wrap' }}>
          <div style={{ padding: '10px 0' }}>
            <p style={{ fontSize: 10.5, color: C.muted, margin: 0, letterSpacing: '0.05em', textTransform: 'uppercase' }}>QL Ops / Human Unassigned</p>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: '2px 0 0', letterSpacing: '-0.4px' }}>Human Unassigned</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {sendMsg && <span style={{ fontSize: 11.5, fontWeight: 600, color: sendMsg.ok ? C.green : C.navy }}>{sendMsg.text}</span>}
            <Button onClick={sendNow} disabled={sending} size="sm" variant="secondary" title="Email this list to Akash right now">
              {sending ? 'Sending…' : 'Send now'}
            </Button>
            <Button onClick={reload} disabled={loading} size="sm">{loading ? 'Refreshing' : 'Refresh'}</Button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
          <div className="lq-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14, marginBottom: 20 }}>
            <PremKPI label="Unassigned Leads" value={fmtN(kpi.total)} sub="owner still a bot/vendor placeholder" accent={C.navy} icon={KPI_ICONS.total} />
            <PremKPI label="Oldest Unassigned" value={kpi.oldest + 'd'} sub="days since first activity" accent={C.blue} icon={KPI_ICONS.globe} />
            <PremKPI label="3+ Days Old" value={fmtN(kpi.over3d)} sub="needs urgent attention" accent={C.cyan} icon={KPI_ICONS.agent} />
            <PremKPI label="Distinct Placeholders" value={fmtN(kpi.distinctOwners)} sub="bot/vendor accounts holding leads" accent={C.green} icon={KPI_ICONS.bot} />
          </div>

          <div className="lq-grid2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            <Card title="By Country" sub="Where unassigned leads are coming from">
              <RankedBars data={byCountry} labelKey="country" max={byCountry[0]?.count || 0} total={kpi.total} showRank />
            </Card>
            <Card title="By Age" sub="How long leads have been sitting unassigned" noPad>
              <div style={{ height: 220, padding: '12px 12px 4px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byAgeBucket} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#EEF1F5" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.muted }} axisLine={false} tickLine={false} />
                    <YAxis hide />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 10, border: '0.5px solid ' + C.border }} />
                    <Bar dataKey="count" fill={C.navy} radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <Card title={'Unassigned leads — ' + fmtN(sorted.length) + ' records'} sub="Search by course, country, campaign, ID or owner" noPad
            action={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="text" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
                  style={{ padding: '5px 10px', border: '0.5px solid ' + C.border, borderRadius: 7, fontSize: 12, fontFamily: FONT, outline: 'none', width: 140, background: 'var(--card)', color: C.text }} />
                <FilterDropdown label="Country" value={countryFilter} options={countryOptions}
                  open={openMenu === 'country'} onToggle={() => setOpenMenu(v => v === 'country' ? null : 'country')}
                  onSelect={v => { setCountryFilter(v); setOpenMenu(null) }} />
                <FilterDropdown label="Disposition" value={dispositionFilter} options={dispositionOptions}
                  open={openMenu === 'disposition'} onToggle={() => setOpenMenu(v => v === 'disposition' ? null : 'disposition')}
                  onSelect={v => { setDispositionFilter(v); setOpenMenu(null) }} />
                <ExportButton data={exportRows} filename="human_unassigned" dashboardId="lq_ops_human_unassigned" />
              </div>
            }>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  {COLS.map(c => (
                    <th key={c.key} style={th} onClick={() => toggleSort(c.key)}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {c.label}
                        {sortKey === c.key && <span style={{ color: C.blue }}>{sortDir === 'asc' ? '▲' : '▼'}</span>}
                      </span>
                    </th>
                  ))}
                </tr></thead>
                <tbody>
                  {pageItems.map((r, i) => (
                    <tr key={r.prospectId || i} style={{ background: (r.ageDays || 0) >= 3 ? C.navyBg : 'transparent' }}>
                      {COLS.map(c => <td key={c.key} style={td}>{cell(r, c.key)}</td>)}
                    </tr>
                  ))}
                  {pageItems.length === 0 && (
                    <tr><td colSpan={COLS.length} style={{ ...td, textAlign: 'center', color: C.muted, padding: '24px 12px' }}>No leads match these filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {pageCount > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 12px', borderTop: '0.5px solid #F1F4F9' }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1}
                  style={{ padding: '5px 12px', borderRadius: 7, border: '0.5px solid ' + C.border, background: '#fff', fontSize: 12, cursor: safePage === 1 ? 'default' : 'pointer', opacity: safePage === 1 ? 0.5 : 1 }}>Prev</button>
                <span style={{ fontSize: 12, color: C.muted }}>Page {safePage} of {pageCount}</span>
                <button onClick={() => setPage(p => Math.min(pageCount, p + 1))} disabled={safePage === pageCount}
                  style={{ padding: '5px 12px', borderRadius: 7, border: '0.5px solid ' + C.border, background: '#fff', fontSize: 12, cursor: safePage === pageCount ? 'default' : 'pointer', opacity: safePage === pageCount ? 0.5 : 1 }}>Next</button>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
