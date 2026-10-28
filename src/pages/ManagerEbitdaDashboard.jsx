import React, { useState, useEffect, useCallback, useRef } from 'react'
import Sidebar from '../components/Sidebar'
import Button from '../components/Button'
import SlackReportPanel from '../components/SlackReportPanel'
import { SlackIcon } from '../components/icons/BrandIcons'
import { DashboardSkeleton } from '../components/SkeletonLoader'
import { C, FONT } from '../ui/dashboardKit'
import { EBITDA_MANAGER_VERSIONS } from '../lib/ebitdaManagerReportVersion'
import { getSession, setSession } from '../lib/sessionLoad'

// Manager EBITDA -- the 'EBITDA View' tab of the ops sheet "Manager and SM-level EBITDA", read
// fresh through the service account (api/send-report.mjs, type=ebitda_manager_view). The page and
// the Slack report come from the same read, so they can never disagree. The sheet is the single
// source: this page keeps no copy, and re-reads only on a fresh page load and when Refresh is clicked.

const CACHE_KEY = 'lq_manager_ebitda_v1'

async function fetchView() {
  const r = await fetch('/api/send-report?type=ebitda_manager_view', { method: 'POST', credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  const d = await r.json().catch(() => ({}))
  if (!r.ok || !d.ok) throw new Error(d.error || 'Failed to read the EBITDA View sheet')
  return d
}

// A plain section box; the shared dashboard Card clips tall tables, these must show in full.
const Card = ({ title, children }) => (
  <div style={{ background: 'var(--card)', border: '0.5px solid ' + C.border, borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 4px rgba(15,23,42,0.04)', flexShrink: 0 }}>
    <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 10 }}>{title}</div>
    {children}
  </div>
)

const fmtNum = v => {
  if (typeof v !== 'number') return v === undefined || v === null ? '' : String(v)
  return Math.round(v).toLocaleString('en-IN')
}
const isNeg = v => typeof v === 'number' && v < 0

function SheetTable({ header, rows, boldLast, ebitdaCol }) {
  if (!header || !rows) return null
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5 }}>
        <thead>
          <tr>
            {header.map((h, i) => (
              <th key={i} style={{ textAlign: i === 0 ? 'left' : 'right', padding: '8px 10px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.muted, borderBottom: '1px solid ' + C.border, whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--card)' }}>{String(h)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => {
            const strong = boldLast && ri === rows.length - 1
            return (
              <tr key={ri} style={{ background: strong ? 'var(--bg2)' : undefined }}>
                {r.map((v, ci) => {
                  const neg = isNeg(v)
                  const isE = ebitdaCol != null && ci === ebitdaCol
                  return (
                    <td key={ci} style={{ textAlign: ci === 0 ? 'left' : 'right', padding: '7px 10px', borderBottom: '0.5px solid ' + C.border, whiteSpace: 'nowrap', fontWeight: strong || isE ? 700 : 400, color: isE ? (neg ? '#B91C1C' : '#2F8F55') : C.text }}>
                      {ci === 0 ? String(v) : fmtNum(v)}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function ManagerEbitdaDashboard() {
  const cached = getSession(CACHE_KEY)
  const [data, setData] = useState(cached ? cached.data : null)
  const [loading, setLoading] = useState(!cached)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [slackOpen, setSlackOpen] = useState(false)
  const busy = useRef(false)

  const load = useCallback(async (quiet) => {
    if (busy.current) return null
    busy.current = true
    if (quiet) setRefreshing(true)
    try {
      const d = await fetchView()
      setData(d); setError(null); setSession(CACHE_KEY, d)
      return d
    } catch (e) {
      setError(e.message || String(e))
      return null
    } finally {
      busy.current = false
      setLoading(false); setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load(!!cached)
  }, [load]) // eslint-disable-line react-hooks/exhaustive-deps

  const openSlack = () => setSlackOpen(true)

  const buildContext = useCallback(() => ({ messages: (data && data.messages) || [] }), [data])
  const captureFiles = useCallback(async () => ({ pngBase64: null, pixelRatio: null, csv: null }), [])

  const shell = children => (
    <div className="lq-page-shell" style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.bg, fontFamily: FONT }}>
      <Sidebar />
      {children}
    </div>
  )

  if (loading) return shell(<div style={{ flex: 1, overflow: 'auto' }}><DashboardSkeleton /></div>)

  if (!data) {
    return shell(
      <div style={{ flex: 1, overflow: 'auto', padding: 28 }}>
        <div style={{ padding: '10px 14px', borderRadius: 10, background: '#FEF2F2', border: '0.5px solid #FECACA', color: '#B91C1C', fontSize: 12.5, maxWidth: 560 }}>
          {"Couldn't load Manager EBITDA: " + error}
        </div>
        <div style={{ marginTop: 12 }}><Button size="sm" onClick={() => load(false)}>Try again</Button></div>
      </div>
    )
  }

  const sheet = data.sheet || {}
  const totals = data.totals || {}
  const readAt = data.readAt ? new Date(data.readAt) : null
  const reconOk = sheet.recon && sheet.recon.rows.every(r => typeof r[r.length - 1] !== 'number' || Math.abs(r[r.length - 1]) < 1)

  return shell(
    <div style={{ margin: '12px 14px 0', borderRadius: 14, border: '1px solid #EEF1F6', boxShadow: '0 1px 3px rgba(31,60,132,0.06)', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
      <div style={{ background: 'var(--card)', borderBottom: '0.5px solid ' + C.border, padding: '10px 28px', minHeight: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 10.5, color: C.muted, margin: 0, letterSpacing: '0.05em', textTransform: 'uppercase' }}>B2C / Manager EBITDA</p>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: '2px 0 0', letterSpacing: '-0.4px' }}>Manager EBITDA</h1>
        </div>
        <div className="lq-header-controls" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {readAt && <span style={{ fontSize: 10.5, color: C.muted, whiteSpace: 'nowrap' }}>Read from sheet {readAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}{refreshing ? '…' : ''}</span>}
          <Button onClick={() => load(true)} disabled={refreshing} size="sm">{refreshing ? 'Refreshing' : 'Refresh'}</Button>
          <Button size="sm" variant="secondary" onClick={openSlack} icon={<SlackIcon size={13} />}>Send to Slack</Button>
        </div>
      </div>

      <SlackReportPanel
        open={slackOpen}
        onClose={() => setSlackOpen(false)}
        versions={EBITDA_MANAGER_VERSIONS}
        buildContext={buildContext}
        captureFiles={captureFiles}
        dashboardId="ceo_b2c_manager_ebitda"
        filename="manager-ebitda"
        rowCount={totals.managers || 0}
      />

      <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && (
          <div style={{ padding: '8px 12px', borderRadius: 10, background: '#FEF2F2', border: '0.5px solid #FECACA', color: '#B91C1C', fontSize: 12 }}>
            Could not refresh just now ({error}). Showing the last read.
          </div>
        )}
        {(sheet.summary || []).length > 0 && (
          <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>
            {data.dateLabel ? <strong style={{ color: C.text }}>{data.dateLabel}. </strong> : null}
            {sheet.summary.join(' ')}
          </div>
        )}

        {sheet.consolidated && (
          <Card title="Team-wise view">
            <SheetTable header={sheet.consolidated.header} rows={sheet.consolidated.rows} boldLast ebitdaCol={sheet.consolidated.header.length - 1} />
          </Card>
        )}

        {(sheet.teams || []).filter(t => t.rows && t.rows.length).map(t => (
          <Card key={t.key} title={t.title}>
            <SheetTable header={t.header} rows={t.rows} ebitdaCol={t.header.length - 1} />
          </Card>
        ))}

        {sheet.difference && sheet.difference.rows.length > 0 && (
          <Card title={sheet.difference.title}>
            <SheetTable header={sheet.difference.header} rows={sheet.difference.rows} ebitdaCol={sheet.difference.header.length - 1} />
          </Card>
        )}

        {sheet.recon && (
          <Card title={'Reconciliation with Team Mapping' + (reconOk ? ' (all zero)' : ' (check)')}>
            <SheetTable header={sheet.recon.header} rows={sheet.recon.rows} />
          </Card>
        )}
      </div>
    </div>
  )
}
