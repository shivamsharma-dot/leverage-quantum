import { useState, useEffect, useCallback, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, Legend, Cell } from 'recharts'
import Sidebar from '../components/Sidebar'

const SHEET_CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRVF7R3Me4QPVaRS_n_OufcMrrgYvCt3Rs7yJUG0u4gEMd0cVL9IyP2aV6J8HDjOZrvWzcemgHwZaHs/pub?gid=0&single=true&output=csv'

const PROVIDER_COLORS = { Futwork: '#1F3C84', Superbot: '#1C9FD4' }
const SOURCE_COLORS   = { Facebook: '#1F3C84', Google: '#1C9FD4', Affiliate: '#4CAE6F', 'Content+Brand': '#F59E0B', Bing: '#6B7280', Referral: '#0D9488', Others: '#9CA3AF' }

function fmtNum(n) {
  if (!n || n === 0) return '\u2014'
  if (n >= 1e5) return (n / 1e5).toFixed(1) + 'L'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return Math.round(n).toLocaleString('en-IN')
}
function pct(a, b) { return b > 0 ? ((a / b) * 100).toFixed(1) + '%' : '\u2014' }

function parseCSV(csv) {
  const rows = csv.trim().split('\n').map(r => {
    const cols = []; let buf = '', inQ = false
    for (const ch of r) {
      if (ch === '"') { inQ = !inQ }
      else if (ch === ',' && !inQ) { cols.push(buf.trim()); buf = '' }
      else buf += ch
    }
    cols.push(buf.trim())
    return cols
  })
  const [headers, ...data] = rows
  const hi = k => headers.indexOf(k)
  return data.filter(r => r[hi('provider')]).map(r => ({
    provider:       r[hi('provider')],
    month_start:    r[hi('month_start')],
    month:          r[hi('qualified_month')],
    campaign:       r[hi('opp_first_campaign_name')] || '',
    source:         r[hi('source')] || 'Others',
    sub_source:     r[hi('sub_source')] || '',
    count:          parseInt(r[hi('qualified_count')]) || 0,
  }))
}

const KPI = ({ label, value, sub, accent = '#1F3C84', accentBg = '#E8EFF9' }) => (
  <div style={{ background: '#fff', border: '0.5px solid #E5E7EB', borderRadius: 10, padding: '14px 16px', borderTop: '3px solid ' + accent }}>
    <div style={{ fontSize: 9.5, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.5px', lineHeight: 1 }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 5 }}>{sub}</div>}
  </div>
)

const Card = ({ title, sub, children, action }) => (
  <div style={{ background: '#fff', border: '0.5px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
    <div style={{ padding: '14px 18px 12px', borderBottom: '0.5px solid #F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{sub}</div>}
      </div>
      {action}
    </div>
    <div style={{ padding: '14px 18px' }}>{children}</div>
  </div>
)

const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#fff', border: '0.5px solid #E5E7EB', borderRadius: 8, padding: '9px 13px', fontSize: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: '#0F172A' }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}: <b>{fmtNum(p.value)}</b>
        </div>
      ))}
    </div>
  )
}

export default function LeadQualificationDashboard() {
  const [rows, setRows]       = useState([])
  const [months, setMonths]   = useState([])
  const [selMonth, setSelMonth] = useState('')
  const [loading, setLoading] = useState(true)
  const [lastSync, setLastSync] = useState(null)
  const [search, setSearch]   = useState('')
  const [sortCol, setSortCol] = useState('count')
  const [sortDir, setSortDir] = useState('desc')
  const [showInfo, setShowInfo] = useState(false)
  const [provFilter, setProvFilter] = useState('All')

  const loadData = useCallback(async () => {
    setLoading(true)
    const _t0 = Date.now()
    try {
      const res = await fetch(SHEET_CSV + '&_=' + Date.now())
      const csv = await res.text()
      const parsed = parseCSV(csv)
      setRows(parsed)
      const ms = [...new Set(parsed.map(r => r.month))].filter(Boolean).sort()
      setMonths(ms)
      setSelMonth(prev => prev || ms[ms.length - 1] || '')
      setLastSync(new Date())
    } catch (e) {
      console.error('QL fetch failed', e)
    } finally {
      const wait = Math.max(0, 750 - (Date.now() - _t0))
      setTimeout(() => setLoading(false), wait)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const filtered = useMemo(() => rows.filter(r => r.month === selMonth), [rows, selMonth])

  // KPI totals
  const totals = useMemo(() => {
    const fw = filtered.filter(r => r.provider === 'Futwork').reduce((s, r) => s + r.count, 0)
    const sb = filtered.filter(r => r.provider === 'Superbot').reduce((s, r) => s + r.count, 0)
    return { total: fw + sb, futwork: fw, superbot: sb }
  }, [filtered])

  // Source stacked bar data
  const sourceData = useMemo(() => {
    const map = {}
    filtered.forEach(r => {
      const src = r.source || 'Others'
      if (!map[src]) map[src] = { source: src, Futwork: 0, Superbot: 0 }
      map[src][r.provider] = (map[src][r.provider] || 0) + r.count
    })
    return Object.values(map).sort((a, b) => (b.Futwork + b.Superbot) - (a.Futwork + a.Superbot)).slice(0, 8)
  }, [filtered])

  // Month-on-month trend
  const trendData = useMemo(() => {
    return months.map(m => {
      const mRows = rows.filter(r => r.month === m)
      return {
        month: m,
        Futwork:  mRows.filter(r => r.provider === 'Futwork').reduce((s, r) => s + r.count, 0),
        Superbot: mRows.filter(r => r.provider === 'Superbot').reduce((s, r) => s + r.count, 0),
      }
    })
  }, [rows, months])

  // Top campaigns table
  const tableRows = useMemo(() => {
    const pf = provFilter === 'All' ? filtered : filtered.filter(r => r.provider === provFilter)
    const srch = search.toLowerCase()
    return pf
      .filter(r => !srch || r.campaign.toLowerCase().includes(srch) || r.source.toLowerCase().includes(srch))
      .sort((a, b) => sortDir === 'desc' ? b[sortCol === 'count' ? 'count' : sortCol] - a[sortCol === 'count' ? 'count' : sortCol] : a[sortCol === 'count' ? 'count' : sortCol] - b[sortCol === 'count' ? 'count' : sortCol])
  }, [filtered, search, sortCol, sortDir, provFilter])

  const topCampaigns = useMemo(() => {
    const map = {}
    filtered.forEach(r => {
      const key = r.campaign + '||' + r.provider
      if (!map[key]) map[key] = { campaign: r.campaign.slice(0, 38) + (r.campaign.length > 38 ? '…' : ''), provider: r.provider, count: 0 }
      map[key].count += r.count
    })
    return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 10)
  }, [filtered])

  const thStyle = (col) => ({
    fontSize: 10, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.06em', textTransform: 'uppercase',
    padding: '9px 10px', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
    background: sortCol === col ? '#F8FAFF' : 'transparent',
  })
  const sort = col => { setSortCol(col); setSortDir(s => sortCol === col ? (s === 'desc' ? 'asc' : 'desc') : 'desc') }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: "'Plus Jakarta Sans', sans-serif", background: '#F8F9FB' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ background: '#fff', borderBottom: '0.5px solid #E5E7EB', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
          <div>
            <p style={{ fontSize: 11, color: '#94A3B8', margin: 0, letterSpacing: '0.04em' }}>DASHBOARDS / LEAD QUALIFICATION</p>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', margin: '2px 0 0', letterSpacing: '-0.3px' }}>
              Lead Qualification · {selMonth || '\u2014'}
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {months.length > 0 && (
              <select value={selMonth} onChange={e => setSelMonth(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 8, border: '0.5px solid #E5E7EB', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', background: '#fff', color: '#0F172A', cursor: 'pointer' }}>
                {[...months].reverse().map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            )}
            {lastSync && <span style={{ fontSize: 11, color: '#94A3B8' }}>Synced {lastSync.toLocaleTimeString()}</span>}
            <button onClick={loadData} disabled={loading} className="lqRefreshBtn"
              style={{ padding: '6px 14px', borderRadius: 8, border: '0.5px solid #E5E7EB', fontSize: 12, fontWeight: 500, cursor: loading ? 'wait' : 'pointer', fontFamily: 'inherit', background: '#fff', color: '#374151', display: 'flex', alignItems: 'center', gap: 6, opacity: loading ? 0.65 : 1 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                style={{ animation: loading ? 'spin .8s linear infinite' : 'none' }}>
                <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
              {loading ? 'Refreshing' : 'Refresh'}
            </button>
            {/* Info popover */}
            <div style={{ position: 'relative' }}>
              <button onClick={() => setShowInfo(v => !v)}
                style={{ width: 30, height: 30, borderRadius: 8, border: '0.5px solid #E5E7EB', background: showInfo ? '#E8EFF9' : '#fff', color: '#1F3C84', fontSize: 14, fontWeight: 700, fontStyle: 'italic', fontFamily: 'Georgia,serif', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>i</button>
              {showInfo && <div onClick={() => setShowInfo(false)} style={{ position: 'fixed', inset: 0, zIndex: 150 }} />}
              {showInfo && (
                <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 200, width: 340, background: '#fff', border: '0.5px solid #E5E7EB', borderRadius: 12, boxShadow: '0 14px 40px rgba(15,23,42,0.16)', padding: '16px 18px', textAlign: 'left' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>How metrics are calculated</div>
                  {[
                    ['qualified_count', 'Leads processed by that provider from that campaign in that month that were marked as qualified.'],
                    ['Total Qualified', 'Sum of qualified_count across all providers and all campaigns for the selected month.'],
                    ['Futwork / Superbot split', 'Each provider\'s total qualified_count as a share of the combined total.'],
                    ['Source split', 'Qualified leads grouped by their originating source (Facebook, Google, Affiliate etc.), stacked per provider.'],
                    ['Month trend', 'Total qualified per provider per month across all historical data.'],
                    ['Top campaigns', 'Top 10 campaigns ranked by total qualified leads for the selected month.'],
                  ].map(([m, d]) => (
                    <div key={m} style={{ display: 'flex', gap: 10, padding: '7px 0', borderTop: '0.5px solid #F3F4F6' }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: '#1F3C84', width: 110, flexShrink: 0 }}>{m}</div>
                      <div style={{ fontSize: 11.5, color: '#475569', lineHeight: 1.45 }}>{d}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 22 }}>

          {loading && rows.length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: 80, color: '#94A3B8' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin .8s linear infinite' }}><circle cx="12" cy="12" r="10" strokeOpacity=".25"/><path d="M12 2a10 10 0 0 1 10 10" stroke="#1C9FD4"/></svg>
              <p style={{ marginTop: 12, fontSize: 13 }}>Loading qualification data…</p>
            </div>
          ) : (
            <>
              {/* KPI row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
                <KPI label="Total Qualified" value={fmtNum(totals.total)} sub={selMonth} accent="#1F3C84" accentBg="#E8EFF9" />
                <KPI label="Futwork" value={fmtNum(totals.futwork)} sub={pct(totals.futwork, totals.total) + ' of total'} accent="#1F3C84" accentBg="#E8EFF9" />
                <KPI label="Superbot" value={fmtNum(totals.superbot)} sub={pct(totals.superbot, totals.total) + ' of total'} accent="#1C9FD4" accentBg="#E3F5FD" />
                <KPI label="FW vs SB Split" value={totals.futwork > 0 || totals.superbot > 0 ? fmtNum(totals.futwork) + ' / ' + fmtNum(totals.superbot) : '\u2014'} sub="Futwork / Superbot" accent="#29B9C3" accentBg="#E4F8F9" />
              </div>

              {/* Charts row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <Card title="Qualified by source" sub="Stacked by provider · selected month">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={sourceData} margin={{ top: 4, right: 8, left: 0, bottom: 40 }}>
                      <XAxis dataKey="source" tick={{ fontSize: 10, fill: '#6B7280' }} angle={-35} textAnchor="end" interval={0} />
                      <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} tickFormatter={v => fmtNum(v)} />
                      <Tooltip content={<ChartTip />} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Futwork"  stackId="a" fill="#1F3C84" radius={[0,0,0,0]} />
                      <Bar dataKey="Superbot" stackId="a" fill="#1C9FD4" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>

                <Card title="Month-on-month trend" sub="Total qualified per provider">
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={trendData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                      <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#6B7280' }} />
                      <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} tickFormatter={v => fmtNum(v)} />
                      <Tooltip content={<ChartTip />} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="Futwork"  stroke="#1F3C84" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="Superbot" stroke="#1C9FD4" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>
              </div>

              {/* Top campaigns bar */}
              <div style={{ marginBottom: 14 }}>
                <Card title="Top 10 campaigns by qualified leads" sub="Selected month · coloured by provider">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={topCampaigns} layout="vertical" margin={{ top: 4, right: 30, left: 8, bottom: 4 }}>
                      <XAxis type="number" tick={{ fontSize: 10, fill: '#6B7280' }} tickFormatter={v => fmtNum(v)} />
                      <YAxis type="category" dataKey="campaign" tick={{ fontSize: 10, fill: '#6B7280' }} width={220} />
                      <Tooltip content={<ChartTip />} />
                      <Bar dataKey="count" radius={[0,4,4,0]}>
                        {topCampaigns.map((entry, i) => (
                          <Cell key={i} fill={PROVIDER_COLORS[entry.provider] || '#9CA3AF'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                    {Object.entries(PROVIDER_COLORS).map(([p, c]) => (
                      <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#475569' }}>
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: c }} />{p}
                      </div>
                    ))}
                  </div>
                </Card>
              </div>

              {/* Campaign table */}
              <Card title="Campaign breakdown"
                sub={`${tableRows.length} rows · ${selMonth}`}
                action={
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {['All','Futwork','Superbot'].map(p => (
                      <button key={p} onClick={() => setProvFilter(p)}
                        style={{ padding: '4px 12px', borderRadius: 6, border: '0.5px solid ' + (provFilter === p ? '#1C9FD4' : '#E5E7EB'), background: provFilter === p ? '#E3F5FD' : '#fff', color: provFilter === p ? '#1C9FD4' : '#374151', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {p}
                      </button>
                    ))}
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search campaign or source…"
                      style={{ padding: '5px 10px', borderRadius: 8, border: '0.5px solid #E5E7EB', fontSize: 12, fontFamily: 'inherit', outline: 'none', width: 220 }} />
                  </div>
                }>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: '0.5px solid #E5E7EB' }}>
                        {[['campaign','Campaign'],['provider','Provider'],['source','Source'],['sub_source','Sub-source'],['count','Qualified']].map(([col,lbl]) => (
                          <th key={col} style={thStyle(col)} onClick={() => sort(col)}>
                            {lbl} <span style={{ opacity: sortCol === col ? 1 : 0.3 }}>{sortCol === col ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.slice(0, 100).map((r, i) => (
                        <tr key={i} style={{ borderBottom: '0.5px solid #F3F4F6', background: i % 2 ? '#FAFBFC' : '#fff' }}>
                          <td style={{ padding: '8px 10px', color: '#0F172A', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.campaign}>{r.campaign}</td>
                          <td style={{ padding: '8px 10px' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: r.provider === 'Futwork' ? '#E8EFF9' : '#E3F5FD', color: r.provider === 'Futwork' ? '#1F3C84' : '#1C9FD4' }}>{r.provider}</span>
                          </td>
                          <td style={{ padding: '8px 10px', color: '#475569' }}>{r.source}</td>
                          <td style={{ padding: '8px 10px', color: '#94A3B8', fontSize: 11 }}>{r.sub_source}</td>
                          <td style={{ padding: '8px 10px', fontWeight: 700, color: '#0F172A', textAlign: 'right' }}>{r.count.toLocaleString('en-IN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {tableRows.length > 100 && (
                    <div style={{ textAlign: 'center', padding: '10px 0', fontSize: 11, color: '#94A3B8' }}>Showing top 100 of {tableRows.length} rows</div>
                  )}
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
