import React, { useState, useEffect, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import Sidebar from '../components/Sidebar'
import { DashboardSkeleton } from '../components/SkeletonLoader'
import { resolveSheetUrl } from '../lib/dataSources'
import { C, FONT, Card, PremKPI, KPI_ICONS, RankedBars, fmtN, pct } from '../ui/dashboardKit'

const DEFAULT_CSV = 'https://docs.google.com/spreadsheets/d/1r-e6pBCN5ysfeD3Eq6sxgLmf97mdeTtloMPylqnx6Ew/gviz/tq?tqx=out:csv&sheet=HumanDetailedQL'
const PAGE = 25

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

function todayIso() { return new Date().toISOString().slice(0, 10) }
function yesterdayIso() { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10) }
function fmtDur(sec) {
  const n = parseInt(sec, 10) || 0
  const m = Math.floor(n / 60), s = n % 60
  return m + ':' + String(s).padStart(2, '0')
}
function fmtDateLabel(iso) {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

async function fetchRows() {
  const url = await resolveSheetUrl('humanQlDetail', DEFAULT_CSV)
  const res = await fetch(url + (url.includes('?') ? '&' : '?') + '_=' + Date.now(), { cache: 'no-store' })
  const text = await res.text()
  const rows = text.trim().split('\n').map(parseCsvRow)
  const [hdr, ...data] = rows
  const low = hdr.map(x => x.toLowerCase().trim())
  const h = k => low.indexOf(k)
  return data.filter(r => r.length > 1 && (r[h('prospect_id')] || '').trim()).map(r => ({
    prospectId: r[h('prospect_id')] || '',
    date: parseDate(r[h('activity_date')]),
    country: (r[h('country_interested')] || '').trim() || 'Unknown',
    degree: (r[h('degree_type')] || '').trim() || 'Unknown',
    course: (r[h('preferred_course')] || '').trim(),
    intake: (r[h('preferred_intake')] || '').trim(),
    disposition: (r[h('disposition')] || '').trim() || 'Unknown',
    budget: (r[h('budget')] || '').trim(),
    campaign: (r[h('opp_first_campaign_name')] || '').trim(),
    passport: (r[h('valid_passport')] || '').trim(),
    degreeStatus: (r[h('student_current_degree_status')] || '').trim(),
    callDuration: r[h('call_duration')] || '0',
    recordingUrl: (r[h('call_recording_url')] || '').trim(),
    futworkProject: (r[h('futwork_project')] || '').trim(),
  })).filter(r => r.date)
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

const DISPOSITION_COLOR = {
  'Call Transferred To Counsellor': C.green,
  'Interested in Call Back': C.blue,
  'Interested spoken to parents': C.cyan,
  'Discover Future Intent': C.navy,
  'Low Intent Lead': '#94A3B8',
}

export default function HumanQLDetailDashboard({ forcedView }) {
  const view = forcedView || 'daily'
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [selDate, setSelDate] = useState(yesterdayIso())
  const [monthDay, setMonthDay] = useState('all')
  const [search, setSearch] = useState('')
  const [countryFilter, setCountryFilter] = useState('all')
  const [dispositionFilter, setDispositionFilter] = useState('all')
  const [openMenu, setOpenMenu] = useState(null)
  const [page, setPage] = useState(1)

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

  const scoped = useMemo(() => {
    if (view === 'daily') return rows.filter(r => r.date === selDate)
    if (monthDay !== 'all') return rows.filter(r => r.date === monthDay)
    return rows
  }, [rows, view, selDate, monthDay])

  const filtered = useMemo(() => {
    let out = scoped
    if (countryFilter !== 'all') out = out.filter(r => r.country === countryFilter)
    if (dispositionFilter !== 'all') out = out.filter(r => r.disposition === dispositionFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      out = out.filter(r => r.course.toLowerCase().includes(q) || r.country.toLowerCase().includes(q) || r.campaign.toLowerCase().includes(q))
    }
    return out
  }, [scoped, countryFilter, dispositionFilter, search])

  useEffect(() => { setPage(1) }, [countryFilter, dispositionFilter, search, selDate, monthDay])

  const availableDays = useMemo(() => [...new Set(rows.map(r => r.date))].filter(Boolean).sort(), [rows])
  const countryOptions = useMemo(() => ['all', ...[...new Set(scoped.map(r => r.country))].sort()], [scoped])
  const dispositionOptions = useMemo(() => ['all', ...[...new Set(scoped.map(r => r.disposition))].sort()], [scoped])

  const kpi = useMemo(() => {
    const total = filtered.length
    const countByCountry = {}
    const countByDisposition = {}
    let durSum = 0, durN = 0
    filtered.forEach(r => {
      countByCountry[r.country] = (countByCountry[r.country] || 0) + 1
      countByDisposition[r.disposition] = (countByDisposition[r.disposition] || 0) + 1
      const d = parseInt(r.callDuration, 10)
      if (d > 0) { durSum += d; durN++ }
    })
    const topCountry = Object.entries(countByCountry).sort((a, b) => b[1] - a[1])[0]
    const topDisposition = Object.entries(countByDisposition).sort((a, b) => b[1] - a[1])[0]
    return {
      total, topCountry: topCountry ? topCountry[0] : '—', topCountryN: topCountry ? topCountry[1] : 0,
      topDisposition: topDisposition ? topDisposition[0] : '—',
      avgDur: durN ? Math.round(durSum / durN) : 0,
      distinctDays: [...new Set(filtered.map(r => r.date))].length,
    }
  }, [filtered])

  const byCountry = useMemo(() => {
    const counts = {}
    filtered.forEach(r => { counts[r.country] = (counts[r.country] || 0) + 1 })
    return Object.entries(counts).map(([country, count]) => ({ country, count })).sort((a, b) => b.count - a.count).slice(0, 8)
  }, [filtered])

  const byDisposition = useMemo(() => {
    const counts = {}
    filtered.forEach(r => { counts[r.disposition] = (counts[r.disposition] || 0) + 1 })
    return Object.entries(counts).map(([disposition, count]) => ({ disposition, count })).sort((a, b) => b.count - a.count)
  }, [filtered])

  const dailyTrend = useMemo(() => {
    if (view !== 'monthly') return []
    const counts = {}
    scoped.forEach(r => { counts[r.date] = (counts[r.date] || 0) + 1 })
    return Object.keys(counts).sort().map(d => ({ date: d, label: fmtDateLabel(d), count: counts[d] }))
  }, [scoped, view])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE))
  const safePage = Math.min(page, pageCount)
  const pageItems = filtered.slice((safePage - 1) * PAGE, safePage * PAGE)

  const th = { padding: '10px 12px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }
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
            <p style={{ fontSize: 10.5, color: C.muted, margin: 0, letterSpacing: '0.05em', textTransform: 'uppercase' }}>QL Ops / Human QL Detail</p>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: '2px 0 0', letterSpacing: '-0.4px' }}>{view === 'daily' ? 'Human QL Detail — Daily' : 'Human QL Detail — Monthly'}</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {view === 'daily' && (
              <input type="date" value={selDate} max={todayIso()} onChange={e => setSelDate(e.target.value)}
                style={{ fontFamily: FONT, fontSize: 12, color: C.text, border: '0.5px solid ' + C.border, borderRadius: 8, padding: '5px 8px', background: 'var(--card)', outline: 'none' }} />
            )}
            {view === 'monthly' && (
              <FilterDropdown label="Day" value={monthDay} options={['all', ...availableDays]}
                open={openMenu === 'day'} onToggle={() => setOpenMenu(v => v === 'day' ? null : 'day')}
                onSelect={v => { setMonthDay(v); setOpenMenu(null) }} />
            )}
            <button onClick={reload} disabled={loading} title="Refresh data"
              style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid ' + C.border, fontSize: 12, fontWeight: 500, cursor: loading ? 'wait' : 'pointer', fontFamily: FONT, background: '#fff', color: '#374151' }}>
              {loading ? 'Refreshing' : 'Refresh'}
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14, marginBottom: 20 }}>
            <PremKPI label={view === 'daily' ? 'QLs on ' + fmtDateLabel(selDate) : (monthDay === 'all' ? 'Total QLs (Month)' : 'QLs on ' + fmtDateLabel(monthDay))} value={fmtN(kpi.total)} sub={view === 'daily' ? 'Human-qualified leads' : 'Human-qualified leads this month'} accent={C.navy} icon={KPI_ICONS.total} />
            <PremKPI label="Top Country" value={kpi.topCountry} sub={fmtN(kpi.topCountryN) + ' leads'} accent={C.blue} icon={KPI_ICONS.globe} />
            <PremKPI label="Top Disposition" value={kpi.topDisposition} sub="Most common outcome" accent={C.cyan} icon={KPI_ICONS.agent} />
            <PremKPI label="Avg Call Duration" value={fmtDur(kpi.avgDur)} sub={view === 'monthly' ? kpi.distinctDays + ' days covered' : 'Minutes : seconds'} accent={C.green} icon={KPI_ICONS.bot} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: view === 'monthly' ? '1fr 1fr 1fr' : '1fr 1fr', gap: 16, marginBottom: 20 }}>
            <Card title="By Country" sub="Top destination countries">
              <RankedBars data={byCountry} labelKey="country" max={byCountry[0]?.count || 0} total={kpi.total} showRank />
            </Card>
            <Card title="By Disposition" sub="Call outcome breakdown">
              <RankedBars data={byDisposition} labelKey="disposition" max={byDisposition[0]?.count || 0} total={kpi.total} colorFn={i => DISPOSITION_COLOR[byDisposition[i]?.disposition] || C.navy} />
            </Card>
            {view === 'monthly' && (
              <Card title="Daily Trend" sub="QLs per day this month" noPad>
                <div style={{ height: 220, padding: '12px 12px 4px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyTrend} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="#EEF1F5" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.muted }} axisLine={false} tickLine={false} interval={dailyTrend.length > 10 ? 1 : 0} />
                      <YAxis hide />
                      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 10, border: '0.5px solid ' + C.border }} />
                      <Bar dataKey="count" fill={C.navy} radius={[4, 4, 0, 0]} maxBarSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            )}
          </div>

          <Card title={'Lead detail — ' + fmtN(filtered.length) + ' records'} sub="Search by course, country or campaign" noPad
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
              </div>
            }>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={th}>Date</th><th style={th}>Country</th><th style={th}>Degree</th><th style={th}>Course</th>
                  <th style={th}>Intake</th><th style={th}>Disposition</th><th style={th}>Budget</th>
                  <th style={th}>Campaign</th><th style={th}>Passport</th><th style={th}>Degree Status</th>
                  <th style={th}>Duration</th><th style={th}>Recording</th>
                </tr></thead>
                <tbody>
                  {pageItems.map((r, i) => (
                    <tr key={r.prospectId || i}>
                      <td style={td}>{fmtDateLabel(r.date)}</td>
                      <td style={td}>{r.country}</td>
                      <td style={td}>{r.degree}</td>
                      <td style={{ ...td, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.course}>{r.course || '—'}</td>
                      <td style={td}>{r.intake || '—'}</td>
                      <td style={{ ...td, color: DISPOSITION_COLOR[r.disposition] || C.text, fontWeight: 600 }}>{r.disposition}</td>
                      <td style={td}>{r.budget || '—'}</td>
                      <td style={{ ...td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.campaign}>{r.campaign || '—'}</td>
                      <td style={td}>{r.passport || '—'}</td>
                      <td style={td}>{r.degreeStatus || '—'}</td>
                      <td style={td}>{fmtDur(r.callDuration)}</td>
                      <td style={td}>{r.recordingUrl ? <a href={r.recordingUrl} target="_blank" rel="noreferrer" style={{ color: C.blue, fontWeight: 600 }}>Play</a> : '—'}</td>
                    </tr>
                  ))}
                  {pageItems.length === 0 && (
                    <tr><td colSpan={12} style={{ ...td, textAlign: 'center', color: C.muted, padding: '24px 12px' }}>No leads match these filters.</td></tr>
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
