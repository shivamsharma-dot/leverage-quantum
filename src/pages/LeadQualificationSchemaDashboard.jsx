import React, { useState, useEffect, useMemo } from 'react'
import Sidebar from '../components/Sidebar'
import Button from '../components/Button'
import { DashboardSkeleton } from '../components/SkeletonLoader'
import { C, FONT, Card } from '../ui/dashboardKit'

const API_BASE = '/api/crm-leads?source=leadsquared'

async function apiGet(mode, params) {
  const qs = new URLSearchParams({ mode, ...(params || {}) })
  const res = await fetch(API_BASE + '&' + qs.toString(), { credentials: 'include', cache: 'no-store' })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

// Same live LeadSquared credentials the existing LeadSquared page already uses
// (LEADSQUARED_ACCESS_KEY/SECRET_KEY, Vercel env). No scraping, no manual upkeep --
// this is LeadSquared's own real Custom Activity Type API
// (v2/ProspectActivity.svc/CustomActivity/GetActivitySetting), the same schema
// Settings > Custom Notable Activity Type shows.
function useSchema() {
  const [types, setTypes] = useState(null)
  const [schemas, setSchemas] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastSync, setLastSync] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = async (opts) => {
    const bypass = opts && opts.refresh
    if (!bypass) setLoading(true); else setRefreshing(true)
    setError(null)
    try {
      const typesData = await apiGet('activity_types')
      const futworkTypes = (typesData.rows || []).filter(t => (t.name || '').toLowerCase().includes('futwork'))
      const schemaResults = await Promise.all(
        futworkTypes.map(t => apiGet('activity_schema', { code: t.code, ...(bypass ? { refresh: '1' } : {}) }).catch(e => ({ code: String(t.code), error: e.message })))
      )
      const map = {}
      schemaResults.forEach(s => { map[s.code] = s })
      setTypes(futworkTypes)
      setSchemas(map)
      setLastSync(new Date())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { load() }, [])
  return { types, schemas, loading, error, lastSync, refreshing, refresh: () => load({ refresh: true }) }
}

function OptionsCell({ code, schemaName }) {
  const [state, setState] = useState('idle') // idle | loading | loaded | error | empty
  const [options, setOptions] = useState([])

  const fetchOptions = async () => {
    if (state === 'loading') return
    setState('loading')
    try {
      const data = await apiGet('activity_dropdown_options', { code, schemaName })
      const opts = data.options || []
      setOptions(opts)
      setState(opts.length ? 'loaded' : 'empty')
    } catch (e) {
      setState('error')
    }
  }

  if (state === 'idle') {
    return (
      <button type="button" onClick={fetchOptions} style={{ border: '0.5px solid ' + C.border, background: 'var(--card)', color: C.blue, fontSize: 11, fontWeight: 700, padding: '4px 9px', borderRadius: 7, cursor: 'pointer', fontFamily: FONT }}>
        View options
      </button>
    )
  }
  if (state === 'loading') return <span style={{ fontSize: 11.5, color: C.muted }}>Loading…</span>
  if (state === 'error') return <span style={{ fontSize: 11.5, color: C.muted }}>Couldn't load</span>
  if (state === 'empty') return <span style={{ fontSize: 11.5, color: C.muted }}>No dropdown options</span>
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 340 }}>
      {options.map(o => (
        <span key={o} style={{ fontSize: 10.5, fontWeight: 600, color: C.navy, background: C.navyBg, padding: '2px 7px', borderRadius: 999 }}>{o}</span>
      ))}
    </div>
  )
}

export default function LeadQualificationSchemaDashboard() {
  const { types, schemas, loading, error, lastSync, refreshing, refresh } = useSchema()

  const th = { padding: '10px 12px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }
  const td = { padding: '9px 12px', fontSize: 12.5, color: C.text, borderTop: '0.5px solid #F1F4F9', verticalAlign: 'top' }

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
      <Sidebar />
      <div style={{ margin: '12px 14px 0', borderRadius: 14, border: '1px solid #EEF1F6', boxShadow: '0 1px 3px rgba(31,60,132,0.06)', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <div style={{ background: 'var(--card)', borderBottom: '0.5px solid ' + C.border, padding: '10px 28px', minHeight: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0, flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontSize: 10.5, color: C.muted, margin: 0, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Lead Qualification / Field Schema</p>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: '2px 0 0', letterSpacing: '-0.4px' }}>Field Schema</h1>
          </div>
          <div className="lq-header-controls" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {lastSync && <span style={{ fontSize: 10.5, color: C.muted, whiteSpace: 'nowrap' }}>Synced {lastSync.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}{refreshing ? '…' : ''}</span>}
            <Button onClick={refresh} disabled={refreshing} size="sm">{refreshing ? 'Refreshing' : 'Refresh'}</Button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
          <p style={{ fontSize: 12.5, color: C.muted, margin: '0 0 18px', maxWidth: 760, lineHeight: 1.6 }}>
            Live from LeadSquared's own Custom Notable Activity Type API -- the same schema
            Settings &rsaquo; Custom Notable Activity Type shows for each activity type Futwork
            postbacks write to. Refresh re-fetches from LeadSquared directly, so an edit made
            there shows up here without a code deploy. This is what "mx_Custom_N" on the
            Futwork Errors page actually maps to.
          </p>

          {error && (
            <div style={{ padding: '12px 16px', background: 'var(--bg3)', borderRadius: 10, color: C.muted, fontSize: 13, marginBottom: 16 }}>{error}</div>
          )}

          {(types || []).length === 0 && !error && (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: C.muted, fontSize: 13 }}>No Futwork-related activity types found on this LeadSquared account.</div>
          )}

          {(types || []).map(t => {
            const schema = schemas[t.code]
            return (
              <div key={t.code} style={{ marginBottom: 20 }}>
                <Card title={t.name + ' (code ' + t.code + ')'} sub={schema && schema.fields ? schema.fields.length + ' fields' : ''} noPad>
                  {schema && schema.error ? (
                    <div style={{ padding: '16px', color: C.muted, fontSize: 12.5 }}>{schema.error}</div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead><tr>
                          <th style={th}>Display Name</th>
                          <th style={th}>Schema Name</th>
                          <th style={th}>Type</th>
                          <th style={th}>Mandatory</th>
                          <th style={th}>Dropdown Options</th>
                        </tr></thead>
                        <tbody>
                          {(schema && schema.fields || []).map(f => (
                            <tr key={f.schemaName}>
                              <td style={{ ...td, fontWeight: 600 }}>{f.displayName}</td>
                              <td style={{ ...td, fontFamily: 'monospace', fontSize: 11.5, color: C.muted }}>{f.schemaName}</td>
                              <td style={td}>{f.dataType || '—'}</td>
                              <td style={td}>{f.isMandatory ? <span style={{ color: C.navy, fontWeight: 700, fontSize: 11 }}>Yes</span> : <span style={{ color: C.muted, fontSize: 11 }}>No</span>}</td>
                              <td style={td}><OptionsCell code={t.code} schemaName={f.schemaName} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
