import React, { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import { InlineLoader } from '../components/SkeletonLoader'
import { C, FONT, fmtN, Card, PremKPI, KPI_ICONS } from '../ui/dashboardKit'
import Button from '../components/Button'

const TABS = [
  { id: 'campaigns', label: 'Campaigns', mode: 'campaigns' },
  { id: 'adGroups', label: 'Ad groups', mode: 'ad_groups' },
  { id: 'keywords', label: 'Keywords', mode: 'keywords' },
  { id: 'searchTerms', label: 'Search terms', mode: 'report' },
]

function BingIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M6 3l4 1.4V16l4.2-2.4-1.9-.8-1.3-3.3L16 11l3 1.7-9 5.3-4-2.3V3z" fill={C.cyan} />
    </svg>
  )
}

function fmtMoney(n) {
  const v = Number(n)
  if (!isFinite(v)) return '—'
  return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function Th({ children, right }) {
  return (
    <th style={{
      textAlign: right ? 'right' : 'left', padding: '10px 14px', fontSize: 11.5,
      fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4,
      borderBottom: '1px solid ' + C.border, whiteSpace: 'nowrap',
    }}>{children}</th>
  )
}

function Td({ children, right, bold }) {
  return (
    <td style={{
      textAlign: right ? 'right' : 'left', padding: '11px 14px', fontSize: 13,
      color: bold ? C.text : C.sub, fontWeight: bold ? 600 : 400,
      borderBottom: '1px solid #F2F4F8', whiteSpace: 'nowrap',
    }}>{children}</td>
  )
}

function DataTable({ columns, rows, empty }) {
  if (!rows || !rows.length) {
    return <div style={{ padding: '40px 24px', textAlign: 'center', color: C.muted, fontSize: 13 }}>{empty || 'No data'}</div>
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{columns.map((c, i) => <Th key={i} right={c.right}>{c.label}</Th>)}</tr></thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              {columns.map((c, ci) => <Td key={ci} right={c.right} bold={ci === 0}>{c.render ? c.render(r) : r[c.key]}</Td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function BingAdsDashboard() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') || 'campaigns'

  const [data, setData] = useState({})
  const [loading, setLoading] = useState({})
  const [error, setError] = useState(null)
  const [notConnected, setNotConnected] = useState(false)

  const setTab = (id) => {
    const next = new URLSearchParams(searchParams)
    next.set('tab', id)
    setSearchParams(next, { replace: true })
  }

  const api = useCallback(async (mode, extra) => {
    const qs = new URLSearchParams({ mode, ...(extra || {}) })
    const res = await fetch('/api/bing-ads?' + qs.toString(), { credentials: 'include' })
    if (res.status === 401) { setNotConnected(true); throw new Error('Not signed in') }
    if (res.status === 403) throw new Error('You do not have access to Bing Ads')
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.error || json.message || ('Request failed (' + res.status + ')'))
    return json
  }, [])

  // ---- loaders ----
  const loadCampaigns = useCallback(async () => {
    setLoading(l => ({ ...l, campaigns: true })); setError(null)
    try {
      const j = await api('campaigns')
      setData(d => ({ ...d, campaigns: j.Campaigns || j.campaigns || [] }))
    } catch (e) { setError(e.message) } finally { setLoading(l => ({ ...l, campaigns: false })) }
  }, [api])

  const loadAdGroups = useCallback(async () => {
    setLoading(l => ({ ...l, adGroups: true })); setError(null)
    try {
      const j = await api('ad_groups')
      setData(d => ({ ...d, adGroups: j.AdGroups || j.adGroups || [] }))
    } catch (e) { setError(e.message) } finally { setLoading(l => ({ ...l, adGroups: false })) }
  }, [api])

  const loadKeywords = useCallback(async () => {
    setLoading(l => ({ ...l, keywords: true })); setError(null)
    try {
      const j = await api('keywords')
      setData(d => ({ ...d, keywords: j.Keywords || j.keywords || [] }))
    } catch (e) { setError(e.message) } finally { setLoading(l => ({ ...l, keywords: false })) }
  }, [api])

  // Search terms: submit report -> poll until Success -> rows already parsed server-side
  const loadSearchTerms = useCallback(async () => {
    setLoading(l => ({ ...l, searchTerms: true })); setError(null)
    try {
      const sub = await api('report-submit', { report: 'search_terms' })
      const id = sub.ReportRequestId || sub.reportRequestId
      if (!id) throw new Error('No report id returned')
      let rows = null
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 3000))
        const poll = await api('report-poll', { id })
        const status = poll.Status || poll.status
        if (status === 'Success') { rows = poll.rows || []; break }
        if (status === 'Error') throw new Error('Report generation failed')
      }
      if (rows === null) throw new Error('Report timed out — try again')
      setData(d => ({ ...d, searchTerms: rows }))
    } catch (e) { setError(e.message) } finally { setLoading(l => ({ ...l, searchTerms: false })) }
  }, [api])

  useEffect(() => {
    if (notConnected) return
    if (activeTab === 'campaigns' && !data.campaigns) loadCampaigns()
    else if (activeTab === 'adGroups' && !data.adGroups) loadAdGroups()
    else if (activeTab === 'keywords' && !data.keywords) loadKeywords()
    else if (activeTab === 'searchTerms' && !data.searchTerms) loadSearchTerms()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, notConnected])

  // ---- derived KPIs from campaigns ----
  const camps = data.campaigns || []
  const kpiSpend = camps.reduce((s, c) => s + (Number(c.Spend ?? c.spend) || 0), 0)
  const kpiClicks = camps.reduce((s, c) => s + (Number(c.Clicks ?? c.clicks) || 0), 0)
  const kpiImpr = camps.reduce((s, c) => s + (Number(c.Impressions ?? c.impressions) || 0), 0)
  const kpiConv = camps.reduce((s, c) => s + (Number(c.Conversions ?? c.conversions) || 0), 0)

  // ---- column defs ----
  const num = v => v == null || v === '' ? '—' : fmtN(Number(v))
  const money = v => v == null || v === '' ? '—' : fmtMoney(v)

  const campaignCols = [
    { label: 'Campaign', render: r => r.Name || r.name || r.CampaignName || '—' },
    { label: 'Status', render: r => r.Status || r.status || '—' },
    { label: 'Budget', right: true, render: r => money(r.DailyBudget ?? r.Budget ?? r.budget) },
    { label: 'Type', render: r => r.CampaignType || r.campaignType || '—' },
  ]
  const adGroupCols = [
    { label: 'Ad group', render: r => r.Name || r.name || '—' },
    { label: 'Status', render: r => r.Status || r.status || '—' },
    { label: 'Campaign', render: r => r.CampaignName || r.campaignName || '—' },
  ]
  const keywordCols = [
    { label: 'Keyword', render: r => r.Text || r.text || r.Keyword || '—' },
    { label: 'Match type', render: r => r.MatchType || r.matchType || '—' },
    { label: 'Status', render: r => r.Status || r.status || '—' },
    { label: 'Bid', right: true, render: r => money(r.Bid?.Amount ?? r.bid) },
  ]
  const searchTermCols = [
    { label: 'Search term', render: r => r.searchTerm || r.SearchQuery || '—' },
    { label: 'Keyword', render: r => r.keyword || r.Keyword || '—' },
    { label: 'Impr.', right: true, render: r => num(r.impressions ?? r.Impressions) },
    { label: 'Clicks', right: true, render: r => num(r.clicks ?? r.Clicks) },
    { label: 'Spend', right: true, render: r => money(r.spend ?? r.Spend) },
    { label: 'Conv.', right: true, render: r => num(r.conversions ?? r.Conversions) },
  ]

  const isLoading = !!loading[activeTab]
  const tabRows = data[activeTab]
  const colsByTab = { campaigns: campaignCols, adGroups: adGroupCols, keywords: keywordCols, searchTerms: searchTermCols }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, fontFamily: FONT }}>
      <Sidebar />
      <main style={{ flex: 1, padding: '28px 32px', overflowX: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: C.cyanBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BingIcon />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text }}>Bing Ads</h1>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: C.muted }}>Microsoft Advertising performance</p>
          </div>
        </div>

        {!notConnected && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, margin: '22px 0 4px' }}>
            <PremKPI label="Spend" value={fmtMoney(kpiSpend)} accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.total} />
            <PremKPI label="Clicks" value={fmtN(kpiClicks)} accent={C.blue} accentBg={C.blueBg} icon={KPI_ICONS.agent} />
            <PremKPI label="Impressions" value={fmtN(kpiImpr)} accent={C.cyan} accentBg={C.cyanBg} icon={KPI_ICONS.globe} />
            <PremKPI label="Conversions" value={fmtN(kpiConv)} accent={C.green} accentBg={C.greenBg} icon={KPI_ICONS.ai} />
          </div>
        )}

        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid ' + C.border, margin: '20px 0 24px' }}>
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT, fontSize: 13.5,
              fontWeight: activeTab === t.id ? 700 : 500,
              color: activeTab === t.id ? C.navy : C.muted,
              padding: '10px 14px',
              borderBottom: activeTab === t.id ? '2px solid ' + C.navy : '2px solid transparent',
              marginBottom: -1,
            }}>{t.label}</button>
          ))}
        </div>

        {notConnected ? (
          <Card title="Connect Microsoft Advertising" sub="Not connected">
            <div style={{ padding: '40px 24px', textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: 15, background: C.cyanBg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
                <BingIcon size={26} />
              </div>
              <p style={{ margin: 0, fontSize: 14, color: C.text, fontWeight: 600 }}>Bing Ads is not connected yet</p>
              <p style={{ margin: '8px 0 0', fontSize: 13, color: C.muted, maxWidth: 420, marginInline: 'auto' }}>
                Add your Microsoft Advertising credentials in the environment settings to view live campaign data.
              </p>
            </div>
          </Card>
        ) : (
          <Card title={TABS.find((t) => t.id === activeTab)?.label || 'Bing Ads'} sub="Microsoft Advertising" noPad
            action={activeTab === 'searchTerms' && !isLoading ? <span style={{ fontSize: 12, color: C.muted }}>Last 30 days</span> : null}>
            {error ? (
              <div style={{ padding: '32px 24px', textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 13.5, color: C.amber, fontWeight: 600 }}>{error}</p>
                <Button size='sm' style={{ marginTop: 14 }} onClick={() => { setError(null); setData(d => ({ ...d, [activeTab]: undefined })) }}>Retry</Button>
              </div>
            ) : isLoading ? (
              <div style={{ padding: '48px 24px' }}>
                <InlineLoader />
                {activeTab === 'searchTerms' && (
                  <p style={{ textAlign: 'center', marginTop: 14, fontSize: 12.5, color: C.muted }}>Generating report — this can take up to a minute…</p>
                )}
              </div>
            ) : (
              <DataTable columns={colsByTab[activeTab]} rows={tabRows} empty={'No ' + (TABS.find(t => t.id === activeTab)?.label || '').toLowerCase() + ' found'} />
            )}
          </Card>
        )}
      </main>
    </div>
  )
}
