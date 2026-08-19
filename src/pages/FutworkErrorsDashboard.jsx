import React, { useState, useEffect, useMemo, useRef } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import Sidebar from '../components/Sidebar'
import ExportButton from '../components/ExportButton'
import Button from '../components/Button'
import { DashboardSkeleton } from '../components/SkeletonLoader'
import { resolveSheetUrl } from '../lib/dataSources'
import { C, FONT, Card, PremKPI, KPI_ICONS, RankedBars, fmtN, BarGrad, barFill, BAR_RADIUS } from '../ui/dashboardKit'

const CSV_AI = 'https://docs.google.com/spreadsheets/d/1hteIK1IQaI83S-HOOau4oPqtzcDOZVxSHxIbEwSwxqk/gviz/tq?tqx=out:csv&gid=1005911839'
const CSV_HUMAN = 'https://docs.google.com/spreadsheets/d/1hteIK1IQaI83S-HOOau4oPqtzcDOZVxSHxIbEwSwxqk/gviz/tq?tqx=out:csv&gid=0'

const LEADSQUARED_CONTACT_URL = 'https://in21.leadsquared.com/LeadManagement/LeadDetails?LeadID='
const LEADSQUARED_OPPORTUNITY_URL = 'https://in21.leadsquared.com/OpportunityManagement/OpportunityDetails?opportunityId='

const REFRESH_MS = 60000

// Categories, brand-only palette (never red/amber -- severity here is encoded by
// which category it is, not by an off-brand alarm colour).
const CAT_META = {
  invalid_dropdown: { label: 'Invalid dropdown value', color: C.navy, bg: 'rgba(31,60,132,0.09)' },
  no_match:         { label: 'No opportunity matched', color: C.blue, bg: 'rgba(28,159,212,0.10)' },
  invalid_opp:      { label: 'Opportunity rejected',    color: C.cyan, bg: 'rgba(41,185,195,0.10)' },
  gateway:          { label: 'Gateway / infra error',   color: C.green, bg: 'rgba(76,174,111,0.10)' },
  other:            { label: 'Other',                    color: C.muted, bg: 'rgba(148,163,184,0.12)' },
  unknown:          { label: 'No detail captured',       color: C.muted, bg: 'rgba(148,163,184,0.12)' },
}

// Proper RFC4180 splitter: HumanUnassignedDashboard's own parser strips embedded
// quotes (fine there -- it never touches JSON columns), but this sheet's LS
// Response / Requested Payload columns are raw JSON with doubled-quote escaping
// ("" -> a literal "), so a naive toggle-only parser would corrupt every JSON
// blob into unparseable text. This version reconstructs the real characters.
function parseCsvRow(line) {
  const cols = []
  let buf = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQ) {
      if (ch === '"') { if (line[i + 1] === '"') { buf += '"'; i++ } else { inQ = false } }
      else buf += ch
    } else {
      if (ch === '"') inQ = true
      else if (ch === ',') { cols.push(buf); buf = '' }
      else buf += ch
    }
  }
  cols.push(buf)
  return cols
}

function localDateKey(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
function parseTimestamp(raw) {
  if (!raw) return null
  const d = new Date(raw.trim().replace(' ', 'T'))
  return isNaN(d.getTime()) ? null : d
}
function fmtTime(d) {
  if (!d) return '—'
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' · ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

// Classifies one failed-postback row into a single actionable category, plus a
// short human-readable detail string, extracted straight from the real failure
// text (no guessing -- these patterns were confirmed against the live sheet).
function categorize(row) {
  const fr = row.failureReason || ''
  const lr = row.lsResponse || ''
  const isHtml = s => /^\s*<html/i.test(s)
  if (isHtml(fr) || isHtml(lr)) {
    const src = isHtml(lr) ? lr : fr
    const m = src.match(/<title>(.*?)<\/title>/i)
    return { cat: 'gateway', detail: m ? m[1] : 'Upstream returned an error page instead of JSON' }
  }
  const noMatch = fr.match(/No open .*?opportunity found[^(]*\(([^)]*)\)/i) || lr.match(/No open .*?opportunity found[^(]*\(([^)]*)\)/i)
  if (noMatch) {
    const phoneM = noMatch[1].match(/phone=(\+?[\d\- ]{6,})/i)
    return { cat: 'no_match', phone: phoneM ? phoneM[1].trim() : null, detail: phoneM ? 'Phone ' + phoneM[1].trim() : noMatch[1] }
  }
  const badOpp = fr.match(/Related Opportunity\s*:\s*(\S+?)\s+is invalid/i)
  if (badOpp) return { cat: 'invalid_opp', detail: 'Opportunity ' + badOpp[1].slice(0, 8) + '… no longer valid in LeadSquared' }
  const dd = fr.match(/^(.*?)\s*\((mx_Custom_\d+)\)\s*=\s*'([^']*)'/)
  if (dd) {
    const fieldLabel = dd[1].trim() || dd[2]
    return { cat: 'invalid_dropdown', field: dd[2], fieldLabel, value: dd[3], detail: fieldLabel + ': "' + dd[3] + '"' }
  }
  if (!fr.trim() && !lr.trim()) return { cat: 'unknown', detail: '—' }
  return { cat: 'other', detail: (fr || lr).slice(0, 140) }
}

async function fetchFlow(sourceKey, defaultCsv, flowLabel) {
  const url = await resolveSheetUrl(sourceKey, defaultCsv)
  const res = await fetch(url + (url.includes('?') ? '&' : '?') + '_=' + Date.now(), { cache: 'no-store' })
  const text = await res.text()
  const lines = text.trim().split('\n').map(parseCsvRow)
  const [hdr, ...data] = lines
  const low = hdr.map(x => x.toLowerCase().trim())
  const h = k => low.indexOf(k)
  return data.filter(r => r.length > 1 && (r[h('timestamp')] || '').trim()).map((r, i) => {
    const ts = parseTimestamp(r[h('timestamp')])
    const row = {
      id: flowLabel + '-' + i,
      flow: (r[h('flow')] || flowLabel).trim() || flowLabel,
      projectType: (r[h('project type')] || '').trim(),
      opportunityId: (r[h('opportunity id')] || '').trim(),
      prospectId: (r[h('prospect id')] || '').trim(),
      disposition: (r[h('disposition')] || '').trim(),
      failureReason: r[h('failure reason')] || '',
      lsResponse: r[h('ls response')] || '',
      requestedPayload: r[h('requested payload')] || '',
      ts,
      dateKey: ts ? localDateKey(ts) : null,
    }
    const c = categorize(row)
    return { ...row, ...c }
  }).filter(r => r.ts)
}

async function fetchAllRows() {
  const [ai, human] = await Promise.all([
    fetchFlow('futworkAiPostback', CSV_AI, 'Futwork AI'),
    fetchFlow('futworkPostback', CSV_HUMAN, 'Futwork'),
  ])
  return [...ai, ...human].sort((a, b) => b.ts - a.ts)
}

function copyText(e, text) { e.stopPropagation(); navigator.clipboard?.writeText(text) }

function RawModal({ row, onClose }) {
  if (!row) return null
  const pretty = s => { try { return JSON.stringify(JSON.parse(s), null, 2) } catch (_) { return s || '—' } }
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 900 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 901, width: 'min(640px, 92vw)', maxHeight: '82vh', overflowY: 'auto', background: 'var(--card)', borderRadius: 16, boxShadow: '0 24px 60px -12px rgba(15,23,42,0.35)', border: '0.5px solid ' + C.border, padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Raw postback detail</div>
            <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{fmtTime(row.ts)} · {row.flow}</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.muted, fontSize: 20, lineHeight: 1, padding: 4 }}>&times;</button>
        </div>
        {[['Failure Reason', row.failureReason], ['LS Response', pretty(row.lsResponse)], ['Requested Payload', pretty(row.requestedPayload)]].map(([label, val]) => (
          <div key={label} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>{label}</div>
            <pre style={{ margin: 0, padding: 12, background: 'var(--bg3)', borderRadius: 10, fontSize: 11.5, lineHeight: 1.55, color: C.text, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace', maxHeight: 220, overflowY: 'auto' }}>{val || '—'}</pre>
          </div>
        ))}
      </div>
    </>
  )
}

export default function FutworkErrorsDashboard() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastSync, setLastSync] = useState(null)
  const [flowFilter, setFlowFilter] = useState('all')
  const [catFilter, setCatFilter] = useState('all')
  const [datePreset, setDatePreset] = useState('l7d')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [rawRow, setRawRow] = useState(null)
  const [showInfo, setShowInfo] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const pollRef = useRef(null)

  const load = (silent) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    fetchAllRows()
      .then(r => { setRows(r); setLastSync(new Date()) })
      .catch(() => {})
      .finally(() => { setLoading(false); setRefreshing(false) })
  }

  useEffect(() => {
    load(false)
    pollRef.current = setInterval(() => load(true), REFRESH_MS)
    return () => clearInterval(pollRef.current)
  }, [])

  const now = new Date()
  const todayKey = localDateKey(now)

  const filtered = useMemo(() => {
    let out = rows
    if (flowFilter !== 'all') out = out.filter(r => r.flow === flowFilter)
    if (catFilter !== 'all') out = out.filter(r => r.cat === catFilter)
    if (datePreset === 'today') out = out.filter(r => r.dateKey === todayKey)
    else if (datePreset === 'l7d') {
      const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 6); cutoff.setHours(0, 0, 0, 0)
      out = out.filter(r => r.ts >= cutoff)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      out = out.filter(r =>
        r.opportunityId.toLowerCase().includes(q) || r.prospectId.toLowerCase().includes(q) ||
        (r.detail || '').toLowerCase().includes(q) || (r.disposition || '').toLowerCase().includes(q) ||
        (r.field || '').toLowerCase().includes(q))
    }
    return out
  }, [rows, flowFilter, catFilter, datePreset, search])

  useEffect(() => { setPage(1) }, [flowFilter, catFilter, datePreset, search])

  const kpi = useMemo(() => {
    const total = filtered.length
    const errorsToday = rows.filter(r => r.dateKey === todayKey).length
    const hourAgo = new Date(now.getTime() - 3600000)
    const lastHour = rows.filter(r => r.ts >= hourAgo).length
    const catCounts = {}
    filtered.forEach(r => { catCounts[r.cat] = (catCounts[r.cat] || 0) + 1 })
    const topCatEntry = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0]
    const topCat = topCatEntry ? { cat: topCatEntry[0], count: topCatEntry[1], pct: total ? Math.round((topCatEntry[1] / total) * 100) : 0 } : null
    const distinctOpps = new Set(filtered.map(r => r.opportunityId).filter(Boolean)).size
    const aiCount = filtered.filter(r => r.flow === 'Futwork AI').length
    const humanCount = filtered.filter(r => r.flow === 'Futwork').length
    const distinctFields = new Set(filtered.filter(r => r.cat === 'invalid_dropdown').map(r => r.field)).size
    return { total, errorsToday, lastHour, topCat, distinctOpps, aiCount, humanCount, distinctFields }
  }, [filtered, rows, todayKey])

  const byDay = useMemo(() => {
    const days = []
    for (let i = 13; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); days.push(localDateKey(d)) }
    const map = {}
    days.forEach(d => { map[d] = { day: d.slice(5).replace('-', '/'), ai: 0, human: 0 } })
    rows.forEach(r => { if (map[r.dateKey]) { if (r.flow === 'Futwork AI') map[r.dateKey].ai++; else map[r.dateKey].human++ } })
    return days.map(d => map[d])
  }, [rows])

  const byCategory = useMemo(() => {
    const counts = {}
    filtered.forEach(r => { counts[r.cat] = (counts[r.cat] || 0) + 1 })
    return Object.entries(counts).map(([cat, count]) => ({ cat, label: (CAT_META[cat] || CAT_META.other).label, count }))
      .sort((a, b) => b.count - a.count)
  }, [filtered])

  const byField = useMemo(() => {
    const map = {}
    filtered.filter(r => r.cat === 'invalid_dropdown').forEach(r => {
      const key = r.field
      if (!map[key]) map[key] = { field: r.fieldLabel || key, code: key, count: 0, lastValue: r.value }
      map[key].count++
      if (r.ts && (!map[key].lastTs || r.ts > map[key].lastTs)) { map[key].lastTs = r.ts; map[key].lastValue = r.value }
    })
    return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 8)
  }, [filtered])

  const exportRows = useMemo(() => filtered.map(r => ({
    Time: fmtTime(r.ts), Flow: r.flow, Category: (CAT_META[r.cat] || CAT_META.other).label, Detail: r.detail,
    'Opportunity ID': r.opportunityId, 'Prospect ID': r.prospectId, Disposition: r.disposition, 'Project Type': r.projectType,
  })), [filtered])

  const PAGE_SIZE = 25
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const th = { padding: '10px 12px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }
  const td = { padding: '9px 12px', fontSize: 12.5, color: C.text, borderTop: '0.5px solid #F1F4F9' }

  function idCell(r) {
    if (r.opportunityId) return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'monospace', fontSize: 11 }}>
        <a href={LEADSQUARED_OPPORTUNITY_URL + encodeURIComponent(r.opportunityId)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} title={'Open Opportunity: ' + r.opportunityId} style={{ color: C.blue, textDecoration: 'none' }}>{r.opportunityId.slice(0, 8)}…</a>
        <button type="button" onClick={e => copyText(e, r.opportunityId)} title="Copy" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.muted, display: 'inline-flex' }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
        </button>
      </span>
    )
    if (r.prospectId) return (
      <a href={LEADSQUARED_CONTACT_URL + encodeURIComponent(r.prospectId)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} title={'Open Contact: ' + r.prospectId} style={{ color: C.blue, textDecoration: 'none', fontFamily: 'monospace', fontSize: 11 }}>{r.prospectId.slice(0, 8)}…</a>
    )
    if (r.phone) return <span style={{ color: C.muted, fontSize: 11.5 }}>{r.phone}</span>
    return <span style={{ color: C.muted }}>—</span>
  }

  if (loading) {
    return (
      <div className="lq-page-shell" style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.bg, fontFamily: FONT }}>
        <Sidebar />
        <div style={{ flex: 1, overflow: 'auto' }}><DashboardSkeleton /></div>
      </div>
    )
  }

  return (
    <div className="lq-page-shell" style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.bg, fontFamily: FONT }}>
      <style>{'@keyframes fwkPulse{0%,100%{opacity:1}50%{opacity:.3}}'}</style>
      <Sidebar />
      <div style={{ margin: '12px 14px 0', borderRadius: 14, border: '1px solid #EEF1F6', boxShadow: '0 1px 3px rgba(31,60,132,0.06)', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <div style={{ background: 'var(--card)', borderBottom: '0.5px solid ' + C.border, padding: '10px 28px', minHeight: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0, flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontSize: 10.5, color: C.muted, margin: 0, letterSpacing: '0.05em', textTransform: 'uppercase' }}>QL Ops / Integration Monitoring</p>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: '2px 0 0', letterSpacing: '-0.4px', display: 'flex', alignItems: 'center', gap: 8 }}>
              Futwork Errors
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 700, color: C.green, background: 'rgba(76,174,111,0.12)', padding: '3px 9px', borderRadius: 999 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, animation: 'fwkPulse 1.6s ease-in-out infinite' }} />
                LIVE
              </span>
            </h1>
          </div>
          <div className="lq-header-controls" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: '#F8FAFC', padding: '6px 10px', borderRadius: 12, border: '0.5px solid #E5E7EB' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg3)', borderRadius: 9, padding: 3 }}>
                {[['today', 'Today'], ['l7d', 'Last 7D'], ['all', 'All time']].map(([key, lbl]) => (
                  <button key={key} onClick={() => setDatePreset(key)}
                    style={{ padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, fontFamily: FONT, background: datePreset === key ? 'linear-gradient(135deg,#1F3C84,#1C9FD4)' : 'transparent', color: datePreset === key ? '#fff' : '#64748B', boxShadow: datePreset === key ? '0 4px 10px -3px rgba(31,60,132,0.5)' : 'none' }}>{lbl}</button>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg3)', borderRadius: 9, padding: 3 }}>
                {[['all', 'All flows'], ['Futwork AI', 'AI'], ['Futwork', 'Human']].map(([key, lbl]) => (
                  <button key={key} onClick={() => setFlowFilter(key)}
                    style={{ padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, fontFamily: FONT, background: flowFilter === key ? '#fff' : 'transparent', color: flowFilter === key ? C.navy : '#64748B', boxShadow: flowFilter === key ? '0 1px 3px rgba(15,23,42,0.12)' : 'none' }}>{lbl}</button>
                ))}
              </div>
              <input type="text" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
                style={{ padding: '7px 10px', border: '0.5px solid ' + C.border, borderRadius: 8, fontSize: 12, fontFamily: FONT, outline: 'none', width: 130, background: 'var(--card)', color: C.text }} />
              {lastSync && <span style={{ fontSize: 10.5, color: C.muted, whiteSpace: 'nowrap' }}>Synced {lastSync.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}{refreshing ? '…' : ''}</span>}
              <Button onClick={() => load(false)} disabled={loading} size="sm">{loading ? 'Refreshing' : 'Refresh'}</Button>
              <ExportButton data={exportRows} filename="futwork_errors" dashboardId="futwork_errors" />
              <div style={{ position: 'relative' }}>
                <button onClick={() => setShowInfo(v => !v)} title="Metric info" style={{ width: 24, height: 24, borderRadius: 7, border: '0.5px solid ' + C.border, background: 'var(--card)', color: C.navy, fontStyle: 'italic', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>i</button>
                {showInfo && (
                  <>
                    <div onClick={() => setShowInfo(false)} style={{ position: 'fixed', inset: 0, zIndex: 300 }} />
                    <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 400, width: 300, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, boxShadow: '0 12px 32px -8px rgba(15,23,42,0.22)', padding: 14, fontSize: 11.5, color: '#374151', lineHeight: 1.6 }}>
                      <div style={{ fontWeight: 800, color: C.navy, marginBottom: 6 }}>What this page shows</div>
                      <div>Every row here is a FAILED postback from Futwork (human calling agents) or Futwork AI (bot) back into LeadSquared -- the call/qualification happened, but the result never landed in the CRM.</div>
                      <div style={{ marginTop: 6 }}><strong>Invalid dropdown value</strong> -- Futwork sent a value LeadSquared's field doesn't accept; needs a config fix on one side.</div>
                      <div style={{ marginTop: 6 }}><strong>No opportunity matched</strong> -- the phone number couldn't be resolved to an open LeadSquared opportunity at all.</div>
                      <div style={{ marginTop: 6 }}><strong>Opportunity rejected</strong> -- the specific opportunity ID sent back is no longer valid (likely closed/reassigned since).</div>
                      <div style={{ marginTop: 6 }}>This page polls the source sheet every 60 seconds and includes today's activity live -- it is not delayed a day like the CEO-facing reports elsewhere in Quantum.</div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
          <div className="lq-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14, marginBottom: 14 }}>
            <PremKPI label="Total Errors" value={fmtN(kpi.total)} sub="in the selected window" accent={C.navy} icon={KPI_ICONS.total} />
            <PremKPI label="Errors Today" value={fmtN(kpi.errorsToday)} sub="live, includes right now" accent={C.blue} icon={KPI_ICONS.globe} />
            <PremKPI label="Last Hour" value={fmtN(kpi.lastHour)} sub="rolling 60 minutes" accent={C.cyan} icon={KPI_ICONS.ai} />
            <PremKPI label="Top Cause" value={kpi.topCat ? (kpi.topCat.pct + '%') : '—'} sub={kpi.topCat ? (CAT_META[kpi.topCat.cat] || CAT_META.other).label : 'no errors in window'} accent={C.green} icon={KPI_ICONS.agent} />
          </div>
          <div className="lq-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14, marginBottom: 20 }}>
            <PremKPI label="Opportunities Affected" value={fmtN(kpi.distinctOpps)} sub="distinct, in window" accent={C.navy} icon={KPI_ICONS.total} />
            <PremKPI label="Futwork AI Errors" value={fmtN(kpi.aiCount)} sub="bot flow" accent={C.blue} icon={KPI_ICONS.bot} />
            <PremKPI label="Futwork Human Errors" value={fmtN(kpi.humanCount)} sub="agent flow" accent={C.cyan} icon={KPI_ICONS.agent} />
            <PremKPI label="Dropdown Fields to Fix" value={fmtN(kpi.distinctFields)} sub="distinct mx_Custom fields rejected" accent={C.green} icon={KPI_ICONS.ai} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <Card title="Daily error volume" sub="Last 14 days, Futwork AI vs Futwork Human" noPad>
              <div style={{ height: 220, padding: '12px 12px 4px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byDay} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                    <defs><BarGrad id="g-fwk-ai" color={C.navy} /><BarGrad id="g-fwk-human" color={C.cyan} /></defs>
                    <CartesianGrid vertical={false} stroke="#EEF1F5" />
                    <XAxis dataKey="day" tick={{ fontSize: 10.5, fill: C.muted }} axisLine={false} tickLine={false} />
                    <YAxis hide />
                    <Tooltip contentStyle={{ fontSize: 11.5, borderRadius: 10, border: '0.5px solid ' + C.border }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="ai" name="Futwork AI" stackId="a" fill={barFill('g-fwk-ai')} radius={[0, 0, 0, 0]} maxBarSize={36} />
                    <Bar dataKey="human" name="Futwork Human" stackId="a" fill={barFill('g-fwk-human')} radius={BAR_RADIUS} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div className="lq-grid2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            <Card title="By error category" sub="What's actually failing, in the selected window">
              <RankedBars data={byCategory} labelKey="label" colorFn={i => (CAT_META[byCategory[i]?.cat] || CAT_META.other).color} max={byCategory[0]?.count || 0} total={kpi.total} showRank />
            </Card>
            <Card title="Dropdown fields needing a fix" sub="mx_Custom fields LeadSquared is rejecting, most recent value shown">
              {byField.length === 0 ? (
                <div style={{ padding: '24px 8px', textAlign: 'center', color: C.muted, fontSize: 12.5 }}>No dropdown-value errors in this window.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {byField.map(f => (
                    <div key={f.code} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 10px', background: 'var(--bg3)', borderRadius: 9 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text }}>{f.field}</div>
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{f.code} · last rejected: "{f.lastValue}"</div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: C.navy, flexShrink: 0 }}>{fmtN(f.count)}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <Card title={'Error log — ' + fmtN(filtered.length) + ' records'} sub="Click a row to view the raw LS Response and payload" noPad
            action={
              <Dropdown value={catFilter} onChange={setCatFilter} minWidth={170}
                options={[{ value: 'all', label: 'All categories' }, ...Object.entries(CAT_META).filter(([k]) => byCategory.some(b => b.cat === k)).map(([k, v]) => ({ value: k, label: v.label }))]} />
            }>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={th}>Time</th>
                  <th style={th}>Flow</th>
                  <th style={th}>Category</th>
                  <th style={th}>Detail</th>
                  <th style={th}>Opportunity / Contact</th>
                  <th style={th}>Disposition</th>
                  <th style={th}></th>
                </tr></thead>
                <tbody>
                  {pageItems.map(r => {
                    const meta = CAT_META[r.cat] || CAT_META.other
                    return (
                      <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => setRawRow(r)}>
                        <td style={td}>{fmtTime(r.ts)}</td>
                        <td style={td}><span style={{ fontSize: 11, fontWeight: 700, color: r.flow === 'Futwork AI' ? C.blue : C.cyan }}>{r.flow === 'Futwork AI' ? 'AI' : 'Human'}</span></td>
                        <td style={td}><span style={{ fontSize: 11, fontWeight: 700, color: meta.color, background: meta.bg, padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>{meta.label}</span></td>
                        <td style={{ ...td, maxWidth: 320 }} title={r.detail}><span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.detail || '—'}</span></td>
                        <td style={td}>{idCell(r)}</td>
                        <td style={td}>{r.disposition || '—'}</td>
                        <td style={td}><span style={{ color: C.blue, fontSize: 11, fontWeight: 700 }}>View raw</span></td>
                      </tr>
                    )
                  })}
                  {pageItems.length === 0 && (
                    <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: C.muted, padding: '24px 12px' }}>No errors match these filters.</td></tr>
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
      <RawModal row={rawRow} onClose={() => setRawRow(null)} />
    </div>
  )
}

// Local dropdown for the log's category filter -- deliberately not a native
// <select> (house rule), mirrors the shared Dropdown's minimal trigger+menu shape.
function Dropdown({ options, value, onChange, minWidth }) {
  const [open, setOpen] = useState(false)
  const current = options.find(o => o.value === value)
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 9, border: '0.5px solid ' + (open ? C.blue : C.border), background: 'var(--card)', color: C.text, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, fontFamily: FONT, minWidth }}>
        <span style={{ flex: 1, textAlign: 'left' }}>{current ? current.label : 'All categories'}</span>
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2.5" strokeLinecap="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 150 }} />}
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 200, minWidth: Math.max(minWidth, 180), maxHeight: 320, overflowY: 'auto', background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, boxShadow: '0 12px 32px -8px rgba(15,23,42,0.22)', padding: 4 }}>
          {options.map(o => (
            <button key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false) }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 9px', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: value === o.value ? 700 : 500, fontFamily: FONT, color: value === o.value ? C.navy : '#374151', background: value === o.value ? C.navyBg : 'transparent' }}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
