import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import Sidebar from '../components/Sidebar'
import Button from '../components/Button'
import { DashboardSkeleton } from '../components/SkeletonLoader'
import { C, FONT, Card, BarGrad, barFill, BAR_RADIUS, BAR_RADIUS_H, BAR_MAX, NEUTRAL_TRACK } from '../ui/dashboardKit'
import { fetchDailyTotalsByChannel, CHANNELS } from '../lib/overallFunnelCache'

// -- date helpers ------------------------------------------------------------
function isoDate(d) { return d.toISOString().slice(0, 10) }
function addDays(d, n) { const c = new Date(d); c.setDate(c.getDate() + n); return c }
function fmtDay(iso) { const d = new Date(iso + 'T00:00:00'); return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) }

// Fills any date gaps in a daily-totals array (a day with literally zero rows
// anywhere) with a zeroed entry, so sparklines/charts never silently skip a day.
function densify(rows, sinceIso, untilIso) {
  const byDate = {}
  rows.forEach(r => { byDate[r.date] = r })
  const out = []
  let cur = new Date(sinceIso + 'T00:00:00')
  const end = new Date(untilIso + 'T00:00:00')
  while (cur <= end) {
    const iso = isoDate(cur)
    out.push(byDate[iso] || { date: iso, leads: 0, queued: 0, total_ql: 0, spend: 0, apps: 0, offers: 0, deposits: 0, raus: 0 })
    cur = addDays(cur, 1)
  }
  return out
}
function sumField(rows, field) { return rows.reduce((s, r) => s + (Number(r[field]) || 0), 0) }
function pctChange(cur, prev) { return prev > 0 ? ((cur - prev) / prev) * 100 : (cur > 0 ? 100 : 0) }
function fmtINR(n) { return '₹' + Math.round(n).toLocaleString('en-IN') }
function fmtCompactINR(n) {
  if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2) + 'Cr'
  if (n >= 1e5) return '₹' + (n / 1e5).toFixed(2) + 'L'
  return '₹' + Math.round(n).toLocaleString('en-IN')
}

// -- tiny inline sparkline (no chart library needed for a 7-point line) -------
function Sparkline({ values, color }) {
  const w = 62, h = 20, pad = 2
  const mn = Math.min(...values), mx = Math.max(...values)
  const rng = (mx - mn) || 1
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (w - pad * 2) + pad
    const y = h - pad - ((v - mn) / rng) * (h - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}><polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" /></svg>
}

function KpiCard({ label, value, changePct, comparisonLabel, sparkValues, accent }) {
  const up = changePct > 0.05, down = changePct < -0.05
  return (
    <div style={{ background: 'var(--card)', border: '1px solid #EEF1F6', borderRadius: 12, padding: '13px 15px', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: accent }} />
      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.muted }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 800, marginTop: 5, letterSpacing: '-0.4px', color: C.text }}>{value}</div>
      <div style={{ fontSize: 10.5, fontWeight: 700, marginTop: 3, color: up ? '#1F8F5B' : down ? C.navy : C.muted }}>
        {up ? '▲' : down ? '▼' : '—'} {Math.abs(changePct).toFixed(1)}%
      </div>
      <div style={{ fontSize: 9.5, color: C.muted, marginTop: 1 }}>{comparisonLabel}</div>
      <div style={{ position: 'absolute', bottom: 8, right: 10, opacity: 0.55 }}><Sparkline values={sparkValues} color={accent} /></div>
    </div>
  )
}

const STATUS_STYLE = {
  Scale: { bg: C.greenBg, fg: '#1F8F5B' },
  Protect: { bg: C.blueBg, fg: C.blue },
  Reduce: { bg: C.navyBg, fg: C.navy },
  Investigate: { bg: '#F1F5F9', fg: C.sub },
}
function ActionPill({ action }) {
  const s = STATUS_STYLE[action] || STATUS_STYLE.Investigate
  return <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 9px', borderRadius: 6, background: s.bg, color: s.fg, whiteSpace: 'nowrap' }}>{action}</span>
}

export default function MarketingPerformanceReport() {
  const today = useMemo(() => new Date(), [])
  const d1 = useMemo(() => addDays(today, -1), [today])   // yesterday, latest complete day
  const d2 = useMemo(() => addDays(today, -2), [today])
  const range30Since = useMemo(() => isoDate(addDays(d1, -29)), [d1])
  const range30Until = useMemo(() => isoDate(d1), [d1])
  const current7Since = useMemo(() => isoDate(addDays(d1, -6)), [d1])
  const current7Until = useMemo(() => isoDate(d1), [d1])
  const previous7Since = useMemo(() => isoDate(addDays(d1, -13)), [d1])
  const previous7Until = useMemo(() => isoDate(addDays(d1, -7)), [d1])

  // -- whole-account daily totals for the Reporting-day KPI grid (NOT channel-scoped) --
  const [allDaily, setAllDaily] = useState(null)
  const [loadingAll, setLoadingAll] = useState(true)
  const [allError, setAllError] = useState('')
  useEffect(() => {
    let cancelled = false
    setLoadingAll(true)
    fetchDailyTotalsByChannel({ since: range30Since, until: range30Until, channel: 'All' })
      .then(rows => { if (!cancelled) { setAllDaily(densify(rows, range30Since, range30Until)); setAllError('') } })
      .catch(e => { if (!cancelled) setAllError(e.message || 'Failed to load') })
      .finally(() => { if (!cancelled) setLoadingAll(false) })
    return () => { cancelled = true }
  }, [range30Since, range30Until])

  // -- channel-scoped daily totals + contribution data for Acquisition Decisions --
  const [channel, setChannel] = useState('All')
  const [chanDaily, setChanDaily] = useState(null)
  const [contribution, setContribution] = useState(null)
  const [loadingChan, setLoadingChan] = useState(true)
  const [chanError, setChanError] = useState('')
  useEffect(() => {
    let cancelled = false
    setLoadingChan(true)
    Promise.all([
      fetchDailyTotalsByChannel({ since: range30Since, until: range30Until, channel }),
      fetch('/api/ask-ai', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'contribution_data', channel,
          current_since: current7Since, current_until: current7Until,
          previous_since: previous7Since, previous_until: previous7Until,
          top_n: 8,
        }),
      }).then(r => r.json()),
    ]).then(([dailyRows, contribData]) => {
      if (cancelled) return
      setChanDaily(densify(dailyRows, range30Since, range30Until))
      if (contribData.error) setChanError(contribData.error)
      else { setContribution(contribData); setChanError('') }
    }).catch(e => { if (!cancelled) setChanError(e.message || 'Failed to load') })
      .finally(() => { if (!cancelled) setLoadingChan(false) })
    return () => { cancelled = true }
  }, [channel, range30Since, range30Until, current7Since, current7Until, previous7Since, previous7Until])

  const kpiCards = useMemo(() => {
    if (!allDaily || allDaily.length < 2) return null
    const last = allDaily[allDaily.length - 1] // D-1
    const prev = allDaily[allDaily.length - 2] // D-2
    const spark = f => allDaily.slice(-7).map(r => r[f])
    return [
      { key: 'spend', label: 'Spend', value: fmtCompactINR(last.spend), changePct: pctChange(last.spend, prev.spend), accent: C.navy, sparkField: 'spend' },
      { key: 'leads', label: 'New Leads', value: last.leads.toLocaleString('en-IN'), changePct: pctChange(last.leads, prev.leads), accent: C.blue, sparkField: 'leads' },
      { key: 'ql', label: 'New QL', value: last.total_ql.toLocaleString('en-IN'), changePct: pctChange(last.total_ql, prev.total_ql), accent: C.cyan, sparkField: 'total_ql' },
      { key: 'apps', label: 'New Applications', value: last.apps.toLocaleString('en-IN'), changePct: pctChange(last.apps, prev.apps), accent: C.green, sparkField: 'apps' },
      { key: 'offers', label: 'New Offers', value: last.offers.toLocaleString('en-IN'), changePct: pctChange(last.offers, prev.offers), accent: C.navy, sparkField: 'offers' },
      { key: 'deposits', label: 'New Deposits', value: last.deposits.toLocaleString('en-IN'), changePct: pctChange(last.deposits, prev.deposits), accent: C.blue, sparkField: 'deposits' },
      { key: 'raus', label: 'New RAU', value: last.raus.toLocaleString('en-IN'), changePct: pctChange(last.raus, prev.raus), accent: C.muted, sparkField: 'raus' },
    ].map(c => ({ ...c, sparkValues: spark(c.sparkField), comparisonLabel: `vs ${last.spend != null ? fmtDay(prev.date) : ''}` }))
  }, [allDaily])

  const qualifiedHighlight = useMemo(() => {
    if (!chanDaily) return null
    const last7 = chanDaily.slice(-7), prev7 = chanDaily.slice(-14, -7)
    const cur = { leads: sumField(last7, 'leads'), ql: sumField(last7, 'total_ql'), spend: sumField(last7, 'spend') }
    const prv = { leads: sumField(prev7, 'leads'), ql: sumField(prev7, 'total_ql'), spend: sumField(prev7, 'spend') }
    const qlRateCur = cur.leads > 0 ? (cur.ql / cur.leads) * 100 : 0
    const qlRatePrev = prv.leads > 0 ? (prv.ql / prv.leads) * 100 : 0
    const cpqlCur = cur.ql > 0 ? cur.spend / cur.ql : null
    const cpqlPrev = prv.ql > 0 ? prv.spend / prv.ql : null
    const qlDeltaPct = pctChange(cur.ql, prv.ql)
    const qlRateDeltaPp = qlRateCur - qlRatePrev
    const cpqlDeltaPct = cpqlCur != null && cpqlPrev != null ? pctChange(cpqlCur, cpqlPrev) : null
    return { cur, prv, qlRateCur, qlRatePrev, cpqlCur, cpqlPrev, qlDeltaPct, qlRateDeltaPp, cpqlDeltaPct }
  }, [chanDaily])

  const execReadout = useMemo(() => {
    if (!qualifiedHighlight) return null
    const q = qualifiedHighlight
    const qlDir = q.qlDeltaPct >= 0 ? 'grew' : 'fell'
    const rateDir = q.qlRateDeltaPp >= 0 ? 'improved' : 'weakened'
    const costDir = q.cpqlDeltaPct != null ? (q.cpqlDeltaPct <= 0 ? 'improved' : 'worsened') : null
    const headline = `Total QL ${qlDir} ${Math.abs(q.qlDeltaPct).toFixed(1)}% week-over-week, and acquisition efficiency ${rateDir}${costDir ? ' while cost per QL ' + costDir : ''}.`
    const top = contribution?.contributors?.[0]
    const paragraph = `${channel === 'All' ? 'Across all channels' : channel}, the latest 7 days produced ${Math.round(q.cur.ql).toLocaleString('en-IN')} QL from ${Math.round(q.cur.leads).toLocaleString('en-IN')} leads (QL rate ${q.qlRateCur.toFixed(2)}%, ${q.qlRateDeltaPp >= 0 ? '+' : ''}${q.qlRateDeltaPp.toFixed(2)}pp vs the prior week)${q.cpqlCur != null ? `, at ${fmtINR(q.cpqlCur)} per QL` : ''}.${top ? ` ${top.channel} campaign ${top.campaign} is the largest single mover (${top.deltaQL >= 0 ? '+' : ''}${top.deltaQL} QL, ${top.action}).` : ''}`
    return { headline, paragraph }
  }, [qualifiedHighlight, contribution, channel])

  const chartData30 = useMemo(() => {
    if (!chanDaily) return []
    return chanDaily.map(r => ({
      label: fmtDay(r.date),
      Leads: r.leads,
      QL: r.total_ql,
      'QL rate': r.leads > 0 ? +((r.total_ql / r.leads) * 100).toFixed(2) : 0,
      CPQL: r.total_ql > 0 ? Math.round(r.spend / r.total_ql) : null,
    }))
  }, [chanDaily])

  const axis = { fontSize: 10.5, fill: C.muted, fontFamily: FONT }

  return (
    <div className="lq-page-shell" style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.bg, fontFamily: FONT }}>
      <Sidebar />
      <div style={{ margin: '12px 14px 0', borderRadius: 14, border: '1px solid #EEF1F6', boxShadow: '0 1px 3px rgba(31,60,132,0.06)', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <div style={{ background: 'var(--card)', borderBottom: '0.5px solid ' + C.border, padding: '0 28px', minHeight: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0, flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontSize: 10.5, color: C.muted, margin: 0, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Intelligence / Marketing Performance</p>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: '2px 0 0', letterSpacing: '-0.4px' }}>Daily marketing performance</h1>
          </div>
          <div style={{ fontSize: 11, color: C.muted, textAlign: 'right' }}>
            Generated {today.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}<br />
            Data through {isoDate(d1)} (D-1)
          </div>
        </div>

        <div className="lq-page-content" style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
          {loadingAll ? <DashboardSkeleton /> : allError ? (
            <div style={{ padding: 40, textAlign: 'center', color: C.navy, fontSize: 13 }}>{allError}</div>
          ) : (
            <>
              {/* Executive Readout */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ background: '#fff', border: '1px solid #EEF1F6', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,0.04)', padding: '20px 22px' }}>
                  {execReadout ? (
                    <>
                      <h2 style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.2px', margin: '0 0 8px', color: C.text }}>{execReadout.headline}</h2>
                      <p style={{ fontSize: 13.5, color: C.sub, lineHeight: 1.7, margin: 0 }}>{execReadout.paragraph}</p>
                    </>
                  ) : <div style={{ color: C.muted, fontSize: 13 }}>Loading executive readout&hellip;</div>}
                </div>
              </div>

              {/* Reporting-day activity */}
              <div style={{ fontSize: 13.5, fontWeight: 800, color: C.text, marginBottom: 3 }}>Reporting-day activity</div>
              <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 12 }}>{isoDate(d1)} vs {isoDate(d2)} (previous complete day)</div>
              {kpiCards && (
                <div className="lq-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12, marginBottom: 20 }}>
                  {kpiCards.map(c => <KpiCard key={c.key} {...c} />)}
                </div>
              )}

              <div style={{ height: 1, background: C.border, margin: '10px 0 20px' }} />

              {/* Acquisition decisions */}
              <div style={{ fontSize: 13.5, fontWeight: 800, color: C.text, marginBottom: 12 }}>Acquisition decisions</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                {['All', ...CHANNELS.filter(c => c !== 'Other')].map(ch => (
                  <div key={ch} onClick={() => setChannel(ch)} style={{
                    padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    border: '0.5px solid ' + (channel === ch ? C.navy : C.border),
                    background: channel === ch ? C.navy : 'var(--card)', color: channel === ch ? '#fff' : C.sub, transition: 'all .15s',
                  }}>{ch}</div>
                ))}
              </div>

              {loadingChan ? <DashboardSkeleton /> : chanError ? (
                <div style={{ padding: 24, textAlign: 'center', color: C.navy, fontSize: 13 }}>{chanError}</div>
              ) : (
                <>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: C.text, marginBottom: 8 }}>Qualified demand and cost</div>
                  {qualifiedHighlight && (
                    <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.7, margin: '0 0 14px', padding: '12px 14px', background: C.navyBg, borderRadius: 10 }}>
                      QL volume {qualifiedHighlight.qlDeltaPct >= 0 ? 'grew' : 'dropped'} <b style={{ color: C.navy }}>{Math.abs(qualifiedHighlight.qlDeltaPct).toFixed(1)}%</b> ({Math.round(qualifiedHighlight.cur.ql).toLocaleString('en-IN')} vs {Math.round(qualifiedHighlight.prv.ql).toLocaleString('en-IN')}) while QL rate {qualifiedHighlight.qlRateDeltaPp >= 0 ? 'improved' : 'weakened'} <b style={{ color: C.navy }}>{Math.abs(qualifiedHighlight.qlRateDeltaPp).toFixed(2)}pp</b> ({qualifiedHighlight.qlRateCur.toFixed(2)}% vs {qualifiedHighlight.qlRatePrev.toFixed(2)}%){qualifiedHighlight.cpqlDeltaPct != null && <> and CPQL {qualifiedHighlight.cpqlDeltaPct <= 0 ? 'improved' : 'rose'} <b style={{ color: C.navy }}>{Math.abs(qualifiedHighlight.cpqlDeltaPct).toFixed(1)}%</b> ({fmtINR(qualifiedHighlight.cpqlCur)} vs {fmtINR(qualifiedHighlight.cpqlPrev)})</>}.
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                    <Card title="Leads and QL" sub={`${range30Since} to ${range30Until}`} noPad>
                      <div style={{ padding: '10px 14px' }}>
                        <ResponsiveContainer width="100%" height={220}>
                          <ComposedChart data={chartData30} margin={{ left: 0, right: 6, top: 6, bottom: 0 }}>
                <defs><BarGrad id="g-b0-1" color={C.blue}/></defs>
                            <CartesianGrid vertical={false} stroke={C.border} />
                            <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} interval={4} />
                            <YAxis yAxisId="left" tick={axis} axisLine={false} tickLine={false} allowDecimals={false} />
                            <YAxis yAxisId="right" orientation="right" tick={axis} axisLine={false} tickLine={false} allowDecimals={false} />
                            <Tooltip />
                            <Legend wrapperStyle={{ fontSize: 11, fontFamily: FONT }} iconType="circle" />
                            <Bar yAxisId="left" dataKey="Leads" fill={barFill('g-b0-1')} opacity={0.75} radius={BAR_RADIUS} barSize={8} />
                            <Line yAxisId="right" type="monotone" dataKey="QL" stroke={C.cyan} strokeWidth={2.2} dot={false} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </Card>
                    <Card title="QL rate and cost per QL" sub={`${range30Since} to ${range30Until}`} noPad>
                      <div style={{ padding: '10px 14px' }}>
                        <ResponsiveContainer width="100%" height={220}>
                          <ComposedChart data={chartData30} margin={{ left: 0, right: 6, top: 6, bottom: 0 }}>
                            <CartesianGrid vertical={false} stroke={C.border} />
                            <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} interval={4} />
                            <YAxis yAxisId="left" tick={axis} axisLine={false} tickLine={false} unit="%" />
                            <YAxis yAxisId="right" orientation="right" tick={axis} axisLine={false} tickLine={false} />
                            <Tooltip />
                            <Legend wrapperStyle={{ fontSize: 11, fontFamily: FONT }} iconType="circle" />
                            <Line yAxisId="left" type="monotone" dataKey="QL rate" stroke={C.cyan} strokeWidth={2.2} dot={false} />
                            <Line yAxisId="right" type="monotone" dataKey="CPQL" stroke={C.navy} strokeWidth={2.2} strokeDasharray="4 3" dot={false} connectNulls />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </Card>
                  </div>

                  <div style={{ fontSize: 12.5, fontWeight: 800, color: C.text, marginBottom: 8 }}>What drove the QL change?</div>
                  {contribution?.contributors?.length ? (
                    <div style={{ background: 'var(--card)', border: '1px solid #EEF1F6', borderRadius: 12, overflowX: 'auto', marginBottom: 20 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                        <thead>
                          <tr>
                            {['Channel', 'Campaign', 'Latest 7d QL', 'QL change', 'Share', '30d QL rate', '30d CPQL', 'Action', 'Evidence'].map(h => (
                              <th key={h} style={{ textAlign: 'left', fontSize: 10, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: C.muted, padding: '9px 10px', borderBottom: '1.5px solid ' + C.border }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {contribution.contributors.map((r, i) => (
                            <tr key={i}>
                              <td style={{ padding: 10, borderBottom: '1px solid ' + C.border, color: C.sub }}>{r.channel}</td>
                              <td style={{ padding: 10, borderBottom: '1px solid ' + C.border, color: C.text, fontWeight: 700 }}>{r.campaign}</td>
                              <td style={{ padding: 10, borderBottom: '1px solid ' + C.border, textAlign: 'right' }}>{r.currentQL}</td>
                              <td style={{ padding: 10, borderBottom: '1px solid ' + C.border, textAlign: 'right', color: r.deltaQL >= 0 ? '#1F8F5B' : C.navy, fontWeight: 700 }}>{r.deltaQL >= 0 ? '+' : ''}{r.deltaQL}</td>
                              <td style={{ padding: 10, borderBottom: '1px solid ' + C.border, textAlign: 'right' }}>{r.shareOfChangePct}%</td>
                              <td style={{ padding: 10, borderBottom: '1px solid ' + C.border, textAlign: 'right' }}>{r.qlRate != null ? r.qlRate + '%' : '—'}</td>
                              <td style={{ padding: 10, borderBottom: '1px solid ' + C.border, textAlign: 'right' }}>{r.cpql != null ? fmtINR(r.cpql) : '—'}</td>
                              <td style={{ padding: 10, borderBottom: '1px solid ' + C.border }}><ActionPill action={r.action} /></td>
                              <td style={{ padding: 10, borderBottom: '1px solid ' + C.border, fontSize: 11, color: C.muted }}>{r.evidence}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <div style={{ color: C.muted, fontSize: 12.5, marginBottom: 20 }}>No contributor data for this channel/window.</div>}

                  <div style={{ fontSize: 12.5, fontWeight: 800, color: C.text, marginBottom: 8 }}>Which destinations convert best?</div>
                  <div style={{ padding: '22px', textAlign: 'center', border: '1.5px dashed ' + C.border, borderRadius: 12, background: 'var(--card)', marginBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 6 }}>Component gap &mdash; not yet available</div>
                    <p style={{ fontSize: 12, color: C.muted, maxWidth: 560, margin: '0 auto', lineHeight: 1.7 }}>
                      This needs Opportunity-level Won/Lost outcome data (distinct opportunity, status, and intended destination) for acquisition cohorts at least 3 months mature. Confirmed via a codebase-wide audit: no sheet or table connected to Quantum tracks a real Won/Lost opportunity status today &mdash; the closest available fields are Deposits/RAUs (funnel-stage counts, not per-opportunity outcomes) and a per-lead destination field that lives on a different sheet with no join to those outcomes. Disclosing the gap rather than approximating it with a different metric under the "Won rate" label.
                    </p>
                  </div>
                </>
              )}

              <div style={{ height: 20 }} />
              <details style={{ background: 'var(--card)', border: '1px solid #EEF1F6', borderRadius: 12, overflow: 'hidden' }}>
                <summary style={{ padding: '14px 18px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', color: C.text }}>Definitions, coverage and limitations</summary>
                <div style={{ padding: '0 18px 16px', fontSize: 11.5, color: C.sub, lineHeight: 1.8 }}>
                  <div style={{ fontWeight: 800, fontSize: 10.5, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.muted, margin: '10px 0 6px' }}>Metric definitions</div>
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    <li>Reporting day uses the latest complete day (D-1) vs. the previous complete day (D-2).</li>
                    <li>QL rate = Total QL / Leads for the period. CPQL = Spend / Total QL. Never averaged from daily rates.</li>
                    <li>Contributor Action (Scale/Protect/Reduce/Investigate) compares each campaign's QL rate and CPQL against the median of its OWN channel, not a global median.</li>
                  </ul>
                  <div style={{ fontWeight: 800, fontSize: 10.5, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.muted, margin: '10px 0 6px' }}>Data coverage</div>
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    <li>Source: the "Overall PM" Google Sheet, pre-aggregated hourly into Supabase's overall_funnel_daily table (one row per campaign/day/source).</li>
                    <li>Channel mapping: Facebook&rarr;Meta Ads, Google&rarr;Google Ads, Remarketing/Affiliate unchanged, Organic unchanged, everything else&rarr;Other.</li>
                  </ul>
                  <div style={{ fontWeight: 800, fontSize: 10.5, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.muted, margin: '10px 0 6px' }}>Material limitations</div>
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    <li>Destinations/Won-rate &mdash; no Opportunity-level Won data exists in Quantum yet; disclosed as a gap, not approximated.</li>
                    <li>Applications/Offers/Deposits/RAU stand in for the reference report's EC/STUS stages, which this schema does not track separately.</li>
                    <li>"Campaign" in the contribution table is really ad-level granularity in this sheet (hundreds of distinct entities per week), so QL-rate medians often land near 0% &mdash; CPQL does most of the real discriminating in the Action logic.</li>
                  </ul>
                </div>
              </details>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
