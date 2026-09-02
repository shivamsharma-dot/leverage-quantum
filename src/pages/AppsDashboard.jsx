import React, { useEffect, useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import Sidebar from '../components/Sidebar'
import Dropdown from '../components/Dropdown'
import ExportButton from '../components/ExportButton'
import { InlineLoader } from '../components/SkeletonLoader'
import { C, FONT, fmtN, pct, Card, PremKPI, KPI_ICONS, BarGrad, barFill, BAR_RADIUS, GRID_STROKE, RankedBars } from '../ui/dashboardKit'
import { fetchAppsCacheRows, fetchAppsCacheSyncedAt } from '../lib/appsCache'

// ---------------------------------------------------------------------------
// Apps -- one row per application (not a date-bucketed aggregate like
// Overall/Leverage Careers), sourced from Settings > Data > BigQuery
// Console's "Apps" saved query. Synced once a day at 9am IST (see
// .github/workflows/apps-sync.yml) -- deliberately NOT real-time, per
// explicit instruction, so this page has no Day/Week/Month/Year toolbar the
// way Organic & Social does; it's a daily snapshot with a "Synced" tag and a
// plain Refresh (re-reads the Supabase cache, never touches BigQuery itself).
// ---------------------------------------------------------------------------

const ALL = 'All'

// 'First_App_Date' comes back as 'DD-Mon-YY' (e.g. '02-Sep-26'). Used only to
// sort the month-trend chart chronologically -- 'first_app_month' alone
// ("Sep'26") sorts alphabetically, which scrambles real order.
const MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 }
function parseDDMonYY(s) {
  if (!s) return null
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/.exec(s)
  if (!m) return null
  const mon = MON[m[2]]
  if (mon == null) return null
  return new Date(2000 + Number(m[3]), mon, Number(m[1]))
}

function countBy(rows, key, fallback = 'Unknown') {
  const map = new Map()
  for (const r of rows) {
    const v = (r[key] && String(r[key]).trim()) || fallback
    map.set(v, (map.get(v) || 0) + 1)
  }
  return Array.from(map.entries()).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
}

export default function AppsDashboard() {
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

  const load = () => {
    setLoading(true); setError('')
    Promise.all([fetchAppsCacheRows(), fetchAppsCacheSyncedAt()])
      .then(([r, s]) => { setRows(r); setSyncedAt(s) })
      .catch(e => setError(String(e.message || e)))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const destOptions = useMemo(() => [ALL, ...new Set((rows || []).map(r => r.destination_country_group).filter(Boolean))].sort((a, b) => a === ALL ? -1 : b === ALL ? 1 : a.localeCompare(b)), [rows])
  const intakeOptions = useMemo(() => [ALL, ...new Set((rows || []).map(r => r.intake_category).filter(Boolean))].sort((a, b) => a === ALL ? -1 : b === ALL ? 1 : a.localeCompare(b)), [rows])
  const sourceOptions = useMemo(() => [ALL, ...new Set((rows || []).map(r => r.source).filter(Boolean))].sort((a, b) => a === ALL ? -1 : b === ALL ? 1 : a.localeCompare(b)), [rows])

  const filtered = useMemo(() => {
    const list = rows || []
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
      return true
    })
  }, [rows, search, destFilter, intakeFilter, sourceFilter, humanQlFilter, aiQlFilter])

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
      const sortDate = parseDDMonYY(r.first_app_date)
      const cur = map.get(label)
      if (cur) cur.count += 1
      else map.set(label, { month: label, count: 1, sortDate })
    }
    return Array.from(map.values())
      .sort((a, b) => (a.sortDate && b.sortDate) ? a.sortDate - b.sortDate : a.month.localeCompare(b.month))
      .slice(-12)
  }, [filtered])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  useEffect(() => { setPage(1) }, [search, destFilter, intakeFilter, sourceFilter, humanQlFilter, aiQlFilter])

  const exportRows = filtered.map(r => ({
    'First App Date': r.first_app_date || '', 'First App Month': r.first_app_month || '',
    'Destination Country': r.destination_country || '', 'Destination Group': r.destination_country_group || '',
    'Intake Category': r.intake_category || '', 'Intake Date': r.intake_date || '',
    School: r.school_name || '', Course: r.course_name || '',
    Source: r.source || '', Campaign: r.opp_first_campaign_name || '',
    'Human QL': r.futwork_human || '', 'AI QL': r.futwork_ai || '',
    'Prospect ID': r.prospect_id || '', 'Opportunity ID': r.opportunity_id || '',
  }))

  return (
    <div className="lq-page-shell" style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.bg }}>
      <Sidebar />
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{
          margin: '12px 14px 0', borderRadius: 14, border: '1px solid var(--card-border)',
          background: 'var(--card)', boxShadow: '0 1px 3px rgba(31,60,132,0.06)', padding: '14px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
        }} className="lq-header-controls">
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: FONT }}>Analytics</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.text, fontFamily: FONT, letterSpacing: '-0.3px' }}>Apps</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11.5, color: C.muted, fontFamily: FONT }}>
              {syncedAt ? `Synced ${syncedAt.toLocaleString()} · once a day, 9am IST` : 'Not yet synced'}
            </span>
            <button
              onClick={load}
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
              {error.includes('does not exist') || error.includes('42P01') || error.includes('404')
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
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 1000 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--card-border)' }}>
                        {['First App Date', 'Destination', 'Intake', 'School', 'Course', 'Source', 'Campaign', 'Human QL', 'AI QL'].map(h => (
                          <th key={h} style={{ padding: '9px 14px', fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
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
    </div>
  )
}
