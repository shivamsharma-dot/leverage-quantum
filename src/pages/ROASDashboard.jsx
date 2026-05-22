import { useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import Sidebar from '../components/Sidebar'
import { useROASData } from '../hooks/useSheetData'
import styles from './ROASDashboard.module.css'

// LE Brand colors for channels
const CH_COLORS = {
  Facebook: '#818CF8',
  Google:   '#34D399',
  LinkedIn: '#60A5FA',
  Bing:     '#FBBF24',
}

const TOOLTIP_STYLE = {
  backgroundColor: "#FFFFFF",
  border: '1px solid rgba(28,159,212,0.2)',
  borderRadius: 10,
  color: "#111827",
  fontSize: 12,
}

function parseNum(val) {
  if (!val) return 0
  return parseFloat(String(val).replace(/[₹,\s]/g, '')) || 0
}

export default function ROASDashboard() {
  const { data, loading, error, refetch, lastUpdated } = useROASData()
  const [channelFilter, setChannelFilter] = useState('All')
  const [search, setSearch] = useState('')

  const channels = useMemo(() => {
    const all = [...new Set(data.map(r => r.Channel).filter(Boolean))]
    return ['All', ...all]
  }, [data])

  const filtered = useMemo(() => {
    return data.filter(row => {
      const matchChannel = channelFilter === 'All' || row.Channel === channelFilter
      const matchSearch  = !search || (row['Campaign Name'] || '').toLowerCase().includes(search.toLowerCase())
      return matchChannel && matchSearch
    })
  }, [data, channelFilter, search])

  const kpis = useMemo(() => {
    const totalSpend  = filtered.reduce((s, r) => s + parseNum(r['Amount Spent']), 0)
    const totalOPPs   = filtered.reduce((s, r) => s + parseNum(r.OPPs), 0)
    const totalQLs    = filtered.reduce((s, r) => s + parseNum(r.QLs), 0)
    const totalSTUs   = filtered.reduce((s, r) => s + parseNum(r.STUs), 0)
    const totalACRev  = filtered.reduce((s, r) => s + parseNum(r['AC Revenue']), 0)
    const totalVASRev = filtered.reduce((s, r) => s + parseNum(r['VAS Revenue']), 0)
    const totalRev    = totalACRev + totalVASRev
    const roas        = totalSpend > 0 ? (totalRev / totalSpend).toFixed(2) : '0.00'
    const ltq         = totalOPPs > 0 ? ((totalQLs / totalOPPs) * 100).toFixed(1) : '0.0'
    const cpl         = totalQLs  > 0 ? (totalSpend / totalQLs).toFixed(0) : '0'
    return { totalSpend, totalOPPs, totalQLs, totalSTUs, totalACRev, totalVASRev, totalRev, roas, ltq, cpl }
  }, [filtered])

  const channelBreakdown = useMemo(() => {
    const map = {}
    data.forEach(row => {
      const ch = row.Channel || 'Other'
      if (!map[ch]) map[ch] = 0
      map[ch] += parseNum(row['Amount Spent'])
    })
    return Object.entries(map).map(([name, value]) => ({ name, value }))
  }, [data])

  const topCampaigns = useMemo(() => {
    return [...filtered]
      .sort((a, b) => parseNum(b['Amount Spent']) - parseNum(a['Amount Spent']))
      .slice(0, 8)
      .map(r => ({
        name: (r['Campaign Name'] || '').slice(0, 28) + '…',
        spend: parseNum(r['Amount Spent']),
        channel: r.Channel,
      }))
  }, [filtered])

  const fmt = (n) => n >= 1e7
    ? `₹${(n/1e7).toFixed(2)} Cr`
    : n >= 1e5 ? `₹${(n/1e5).toFixed(1)} L`
    : `₹${n.toLocaleString('en-IN')}`

  const totalOPPs = filtered.reduce((s, r) => s + parseNum(r.OPPs), 0)
  const totalQLs  = filtered.reduce((s, r) => s + parseNum(r.QLs), 0)
  const totalSTUs = filtered.reduce((s, r) => s + parseNum(r.STUs), 0)
  const maxFunnel = Math.max(totalOPPs, totalQLs, totalSTUs, 1)

  const pct = (a, b) => b > 0 ? `${(a/b*100).toFixed(1)}%` : '–'
  const fn  = (n) => n > 0 ? Number(n).toLocaleString('en-IN') : '–'

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>

        {/* Header */}
        <div className={styles.header}>
          <div>
            <p className={styles.breadcrumb}>Dashboards / ROAS</p>
            <h1 className={styles.title}>ROAS 2025</h1>
            <p className={styles.subtitle}>
              {lastUpdated ? `Last synced: ${lastUpdated.toLocaleTimeString()}` : 'Loading from Google Sheets…'}
              {error && <span className={styles.errorChip}> ⚠ Using demo data</span>}
            </p>
          </div>
          <button className={styles.refreshBtn} onClick={refetch} disabled={loading}>
            <svg id="ri" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"
              style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}>
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {/* Filters */}
        <div className={styles.filters}>
          <div className={styles.channelTabs}>
            {channels.map(ch => (
              <button
                key={ch}
                className={`${styles.tab} ${channelFilter === ch ? styles.tabActive : ''}`}
                onClick={() => setChannelFilter(ch)}
              >
                {ch !== 'All' && (
                  <span className={styles.channelDot} style={{ background: CH_COLORS[ch] || '#888' }} />
                )}
                {ch}
              </button>
            ))}
          </div>
          <input
            type="text"
            className={styles.search}
            placeholder="Search campaign…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* KPI Cards */}
        <div className={styles.kpiGrid}>
          {[
            { label: 'Total Spend',   value: fmt(kpis.totalSpend),  sub: 'Ad Spend',    cls: 'kpi_or' },
            { label: 'Total Revenue', value: fmt(kpis.totalRev),    sub: 'AC + VAS',    cls: 'kpi_gn' },
            { label: 'ROAS',          value: `${kpis.roas}x`,       sub: 'Rev / Spend', cls: parseFloat(kpis.roas) >= 1 ? 'kpi_gn' : parseFloat(kpis.roas) >= 0.5 ? 'kpi_am' : 'kpi_rd' },
            { label: 'OPPs',          value: fn(kpis.totalOPPs),    sub: 'Raw Leads',   cls: 'kpi_bl' },
            { label: 'Qual. Leads',   value: fn(kpis.totalQLs),     sub: 'QLs',         cls: 'kpi_bl' },
            { label: 'Students',      value: fn(kpis.totalSTUs),    sub: 'STUs',        cls: 'kpi_am' },
            { label: 'L → Q%',        value: `${kpis.ltq}%`,        sub: 'Conversion',  cls: 'kpi_am' },
            { label: 'CPL',           value: kpis.cpl > 0 ? fmt(kpis.cpl) : '–', sub: 'Per QL', cls: 'kpi_or' },
          ].map(k => (
            <div key={k.label} className={`${styles.kpi} ${styles[k.cls]}`}>
              <div className={styles.kpiLabel}>{k.label}</div>
              <div className={styles.kpiValue}>{k.value}</div>
              <div className={styles.kpiSub}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Charts */}
        <div className={styles.chartsRow}>
          {/* Donut */}
          <div className={styles.chartCard}>
            <h3 className={styles.chartTitle}>Spend by Channel</h3>
            <ResponsiveContainer width="100%" height={140}>
              <PieChart>
                <Pie data={channelBreakdown} cx="50%" cy="50%" innerRadius={42} outerRadius={65} paddingAngle={3} dataKey="value">
                  {channelBreakdown.map((entry, i) => (
                    <Cell key={i} fill={CH_COLORS[entry.name] || '#888'} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => fmt(v)} contentStyle={TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
            <div className={styles.legend}>
              {channelBreakdown.map((e, i) => (
                <div key={e.name} className={styles.legendItem}>
                  <span className={styles.legendDot} style={{ background: CH_COLORS[e.name] || '#888' }} />
                  <span>{e.name}</span>
                  <span className={styles.legendVal}>{fmt(e.value)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Funnel */}
          <div className={styles.chartCard}>
            <h3 className={styles.chartTitle}>Conversion Funnel</h3>
            <div className={styles.funnelWrap}>
              {[
                { label: 'OPPs', val: totalOPPs, color: '#818CF8', conv: '' },
                { label: 'QLs',  val: totalQLs,  color: '#1C9FD4', conv: pct(totalQLs, totalOPPs) },
                { label: 'STUs', val: totalSTUs,  color: '#4BAE8A', conv: pct(totalSTUs, totalQLs) },
              ].map(s => (
                <div key={s.label} className={styles.funnelStep}>
                  <span className={styles.funnelLabel} style={{ color: s.color }}>{s.label}</span>
                  <div className={styles.funnelTrack}>
                    <div className={styles.funnelBar} style={{
                      width: `${Math.max(s.val/maxFunnel*100, 4)}%`,
                      background: `${s.color}28`,
                      borderLeft: `3px solid ${s.color}`
                    }}>
                      {fn(s.val)}
                    </div>
                  </div>
                  <span className={styles.funnelPct}>{s.conv}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bar Chart */}
          <div className={styles.chartCard}>
            <h3 className={styles.chartTitle}>Top Campaigns by Spend</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topCampaigns} layout="vertical" margin={{ left: 0, right: 16 }}>
                <XAxis type="number" tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }} tickFormatter={v => `₹${(v/1e5).toFixed(0)}L`} />
                <YAxis type="category" dataKey="name" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10.5 }} width={180} />
                <Tooltip formatter={(v) => [fmt(v), 'Spend']} contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="spend" radius={[0, 4, 4, 0]}>
                  {topCampaigns.map((entry, i) => (
                    <Cell key={i} fill={CH_COLORS[entry.channel] || '#1C9FD4'} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Table */}
        <div className={styles.tableSection}>
          <div className={styles.tableCard}>
            <div className={styles.tableHeader}>
              <h3 className={styles.tableTitle}>All Campaigns</h3>
              <span className={styles.tableCount}>{filtered.length} campaigns</span>
            </div>
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Channel</th>
                    <th>Campaign</th>
                    <th className="num">Spend</th>
                    <th className="num">OPPs</th>
                    <th className="num">QLs</th>
                    <th className="num">STUs</th>
                    <th className="num">L→Q%</th>
                    <th className="num">CPL</th>
                    <th className="num">AC Rev</th>
                    <th className="num">ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan="10" className={styles.empty}>No campaigns match your filter.</td></tr>
                  ) : filtered.map((row, i) => {
                    const spend  = parseNum(row['Amount Spent'])
                    const acRev  = parseNum(row['AC Revenue'])
                    const vasRev = parseNum(row['VAS Revenue'])
                    const roas   = spend > 0 ? ((acRev + vasRev) / spend).toFixed(2) : null
                    const roasCls = roas === null ? styles.roas_ : parseFloat(roas) >= 1 ? styles.roasGood : parseFloat(roas) >= 0.5 ? styles.roasOk : styles.roas_
                    const ch = row.Channel || '–'
                    return (
                      <tr key={i}>
                        <td>
                          <span className={`${styles.channelBadge} ${styles[`ch_${ch}`]}`}>{ch}</span>
                        </td>
                        <td className={styles.campaignCell} title={row['Campaign Name']}>
                          {(row['Campaign Name'] || '–').slice(0, 42)}{(row['Campaign Name'] || '').length > 42 ? '…' : ''}
                        </td>
                        <td className={styles.numCell}>
                          <div className={styles.spendBar}>{fmt(spend)}</div>
                        </td>
                        <td className={styles.numCell}>{fn(parseNum(row.OPPs))}</td>
                        <td className={styles.numCell}>{fn(parseNum(row.QLs))}</td>
                        <td className={styles.numCell}>{fn(parseNum(row.STUs))}</td>
                        <td className={styles.numCell}>{row['L to Q%'] || '–'}</td>
                        <td className={styles.numCell}>{row.CPL ? `₹${Number(row.CPL).toLocaleString()}` : '–'}</td>
                        <td className={styles.numCell}>{acRev > 0 ? fmt(acRev) : '–'}</td>
                        <td className={styles.numCell}>
                          <span className={roasCls}>{roas ? `${roas}x` : '–'}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
