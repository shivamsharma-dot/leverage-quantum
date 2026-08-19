import React, { useState, useEffect, useMemo } from 'react'
import Sidebar from '../components/Sidebar'
import Button from '../components/Button'
import Dropdown from '../components/Dropdown'
import { DashboardSkeleton } from '../components/SkeletonLoader'
import { C, FONT, Card, PremKPI, KPI_ICONS, fmtN } from '../ui/dashboardKit'

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
  const [oppSchema, setOppSchema] = useState(null)
  const [leadSchema, setLeadSchema] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastSync, setLastSync] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = async (opts) => {
    const bypass = opts && opts.refresh
    if (!bypass) setLoading(true); else setRefreshing(true)
    setError(null)
    try {
      const [typesData, oppData, leadData] = await Promise.all([
        apiGet('activity_types'),
        apiGet('opportunity_schema', bypass ? { refresh: '1' } : {}).catch(e => ({ error: e.message })),
        apiGet('lead_schema', bypass ? { refresh: '1' } : {}).catch(e => ({ error: e.message })),
      ])
      const futworkTypes = (typesData.rows || []).filter(t => (t.name || '').toLowerCase().includes('futwork'))
      const schemaResults = await Promise.all(
        futworkTypes.map(t => apiGet('activity_schema', { code: t.code, ...(bypass ? { refresh: '1' } : {}) }).catch(e => ({ code: String(t.code), error: e.message })))
      )
      const map = {}
      schemaResults.forEach(s => { map[s.code] = s })
      setTypes(futworkTypes)
      setSchemas(map)
      setOppSchema(oppData)
      setLeadSchema(leadData)
      setLastSync(new Date())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { load() }, [])
  return { types, schemas, oppSchema, leadSchema, loading, error, lastSync, refreshing, refresh: () => load({ refresh: true }) }
}

// Brand-only palette, one tone per DataType family so a long field list reads by
// shape at a glance instead of as one flat grey column. Falls back to green for
// any type this account hasn't been seen using yet, rather than guessing.
function typeMeta(dataType) {
  const t = (dataType || '').toLowerCase()
  if (t.includes('dropdown')) return { color: C.blue, bg: C.blueBg }
  if (t.includes('user')) return { color: C.cyan, bg: C.cyanBg }
  if (t.includes('object')) return { color: C.navy, bg: C.navyBg }
  if (t.includes('string')) return { color: C.muted, bg: 'var(--bg3)' }
  return { color: C.green, bg: C.greenBg }
}

// Only "Dropdown"-family types actually have a value list in LeadSquared -- confirmed
// directly in Settings > Custom Notable Activity Type: a Dropdown field's gear icon
// opens "Enter Dropdown Options" with real configured values, while a String field's
// gear icon opens a bare "Mask Value" checkbox with no options concept at all. So
// "View options" only renders (and only ever gets called) for dropdown-type fields --
// never fired against a String/User/Object field, which would have nothing to return.
function isDropdownType(dataType) {
  return (dataType || '').toLowerCase().includes('dropdown')
}

// Lead fields are the one place LeadSquared's own metadata genuinely carries
// per-field audit info (CreatedOn/CreatedByName/ModifiedOn/ModifiedByName) --
// confirmed absent on both Activity and Opportunity field schemas. Format to
// match the rest of the app's short date convention.
function fmtDate(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Table/grid glyph for the per-card icon chip -- distinct from the KPI_ICONS set,
// since this reads as a schema/reference table, not a metric.
function TableGlyph() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="9" y1="10" x2="9" y2="20" /></svg>
}

function IconChip({ accent, children }) {
  return (
    <span style={{
      width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `linear-gradient(135deg, ${accent}, ${accent}CC)`, color: '#fff', flexShrink: 0,
      boxShadow: `0 4px 10px -4px ${accent}88`,
    }}>{children}</span>
  )
}

// One shared modal, opened by any row's "View options" button -- pops up the
// real, live list of values LeadSquared will actually accept for that dropdown
// field (ActivityField/Dropdown/Options/Get), rather than expanding inline.
// Opportunity fields have no equivalent live-lookup API (confirmed empirically --
// LeadSquared's Activity endpoint 500s when given an Opportunity code), so a
// target carrying `presetOptions` skips the fetch entirely and shows those
// values directly -- they're whatever GetOpportunityTypeMetadata itself embedded
// in the field's own OptionSet, still real LeadSquared data, just sourced from a
// different call.
function DropdownOptionsModal({ target, onClose }) {
  const [state, setState] = useState('loading') // loading | loaded | empty | error
  const [options, setOptions] = useState([])

  useEffect(() => {
    if (!target) return
    if (target.presetOptions) {
      setOptions(target.presetOptions)
      setState(target.presetOptions.length ? 'loaded' : 'empty')
      return
    }
    setState('loading'); setOptions([])
    apiGet('activity_dropdown_options', { code: target.code, schemaName: target.schemaName })
      .then(data => {
        const opts = data.options || []
        setOptions(opts)
        setState(opts.length ? 'loaded' : 'empty')
      })
      .catch(() => setState('error'))
  }, [target && target.code, target && target.schemaName, target && target.presetOptions])

  useEffect(() => {
    if (!target) return
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [target])

  if (!target) return null
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 900 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 901, width: 'min(520px, 92vw)', maxHeight: '76vh', overflowY: 'auto', background: 'var(--card)', borderRadius: 16, boxShadow: '0 24px 60px -12px rgba(15,23,42,0.35)', border: '0.5px solid ' + C.border, padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{target.displayName}</div>
            <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2, fontFamily: 'monospace' }}>{target.schemaName} · code {target.code}</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.muted, fontSize: 20, lineHeight: 1, padding: 4 }}>&times;</button>
        </div>
        <div style={{ marginTop: 16 }}>
          {state === 'loading' && <div style={{ fontSize: 13, color: C.muted, fontStyle: 'italic', padding: '12px 0' }}>Loading live options from LeadSquared…</div>}
          {state === 'error' && <div style={{ fontSize: 13, color: C.muted, padding: '12px 0' }}>Couldn't load options -- try again.</div>}
          {state === 'empty' && <div style={{ fontSize: 13, color: C.muted, padding: '12px 0' }}>This field has no dropdown options configured.</div>}
          {state === 'loaded' && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>{options.length} valid value{options.length === 1 ? '' : 's'}</div>
              <div style={{ border: '0.5px solid ' + C.border, borderRadius: 10, overflow: 'hidden' }}>
                {options.map((o, i) => (
                  <div key={o} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px',
                    background: i % 2 === 1 ? 'var(--bg3)' : 'transparent',
                    borderTop: i > 0 ? '0.5px solid ' + C.border : 'none',
                  }}>
                    <span style={{ width: 24, textAlign: 'right', fontSize: 11, fontWeight: 700, color: C.muted, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{i + 1}.</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{o}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

const CARD_ACCENTS = [C.navy, C.blue, C.cyan, C.green]

function SchemaTable({ code, fields, query, onViewOptions, entityType }) {
  const th = { padding: '10px 14px', textAlign: 'left', fontSize: 10.5, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1, borderBottom: '0.5px solid ' + C.border }
  const td = { padding: '10px 14px', fontSize: 12.5, color: C.text, verticalAlign: 'top', whiteSpace: 'nowrap' }
  const isLead = entityType === 'lead'
  // Opportunity fields get the same 4 audit columns as Leads -- but every cell
  // in them reads "Not available via API" rather than being hidden, because
  // GetOpportunityTypeMetadata's Field object has been confirmed (twice, live)
  // to carry the identical 27-key shape as Activity fields -- no CreatedOn/
  // ModifiedOn/CreatedBy/ModifiedBy anywhere. Leads (LeadsMetaData.Get) is the
  // only field family LeadSquared itself actually tracks this for.
  const isOpportunity = entityType === 'opportunity'
  const showAuditCols = isLead || isOpportunity

  const filtered = useMemo(() => {
    if (!query.trim()) return fields
    const q = query.trim().toLowerCase()
    return fields.filter(f => f.displayName.toLowerCase().includes(q) || f.schemaName.toLowerCase().includes(q))
  }, [fields, query])

  const colCount = 5 + (showAuditCols ? 4 : 0)
  const auditUnavailable = <span style={{ fontSize: 11.5, color: C.muted }} title="LeadSquared has no per-field audit API for Opportunity types -- confirmed empirically, not a gap on Quantum's end">Not available via API</span>

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>
          <th style={th}>Display Name</th>
          <th style={th}>Schema Name</th>
          <th style={th}>Type</th>
          <th style={th}>Mandatory</th>
          <th style={th}>Dropdown Options</th>
          {showAuditCols && <>
            <th style={th}>Created On</th>
            <th style={th}>Created By</th>
            <th style={th}>Modified On</th>
            <th style={th}>Modified By</th>
          </>}
        </tr></thead>
        <tbody>
          {filtered.map((f, i) => {
            const tm = typeMeta(f.dataType)
            const isDropdown = isDropdownType(f.dataType)
            // Activity fields: every dropdown has a live lookup API. Opportunity/Lead
            // fields: no such API exists (confirmed) -- only fields where LeadSquared's
            // own metadata call happened to embed real values (f.inlineOptions) can show any.
            const usesInline = entityType === 'opportunity' || entityType === 'lead'
            const hasLiveOptions = usesInline ? isDropdown && f.inlineOptions && f.inlineOptions.length > 0 : isDropdown
            const isUnavailableDropdown = usesInline && isDropdown && !hasLiveOptions
            return (
              <tr key={f.schemaName} style={{ background: i % 2 === 1 ? 'var(--bg3)' : 'transparent' }}>
                <td style={{ ...td, fontWeight: 700, whiteSpace: 'normal' }}>{f.displayName}</td>
                <td style={td}>
                  <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 600, color: C.text, background: 'var(--bg3)', padding: '3px 8px', borderRadius: 6 }}>{f.schemaName}</span>
                </td>
                <td style={td}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: tm.color, background: tm.bg, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>{f.dataType || '—'}</span>
                </td>
                <td style={td}>
                  {f.isMandatory
                    ? <span style={{ fontSize: 10.5, fontWeight: 800, color: C.green, background: C.greenBg, padding: '3px 9px', borderRadius: 999 }}>YES</span>
                    : <span style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, background: 'var(--bg3)', padding: '3px 9px', borderRadius: 999 }}>NO</span>}
                </td>
                <td style={td}>
                  {hasLiveOptions ? (
                    <button type="button" onClick={() => onViewOptions(code, f.schemaName, f.displayName, usesInline ? f.inlineOptions : null)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: '0.5px solid ' + C.border, background: 'var(--card)', color: C.blue, fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: FONT, whiteSpace: 'nowrap' }}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>
                      View options
                    </button>
                  ) : isUnavailableDropdown ? (
                    <span style={{ fontSize: 11.5, color: C.muted }} title={'LeadSquared has no API to read this field\'s values for ' + (entityType === 'lead' ? 'Lead' : 'Opportunity') + ' types'}>Not available via API</span>
                  ) : (
                    <span style={{ fontSize: 11.5, color: C.muted }}>Not applicable</span>
                  )}
                </td>
                {isLead && <>
                  <td style={td}>{fmtDate(f.createdOn) || <span style={{ color: C.muted }}>—</span>}</td>
                  <td style={td}>{f.createdByName || <span style={{ color: C.muted }}>—</span>}</td>
                  <td style={td}>{fmtDate(f.modifiedOn) || <span style={{ color: C.muted }}>—</span>}</td>
                  <td style={td}>{f.modifiedByName || <span style={{ color: C.muted }}>—</span>}</td>
                </>}
                {isOpportunity && <>
                  <td style={td}>{auditUnavailable}</td>
                  <td style={td}>{auditUnavailable}</td>
                  <td style={td}>{auditUnavailable}</td>
                  <td style={td}>{auditUnavailable}</td>
                </>}
              </tr>
            )
          })}
          {filtered.length === 0 && (
            <tr><td colSpan={colCount} style={{ ...td, textAlign: 'center', color: C.muted, padding: '24px 12px', whiteSpace: 'normal' }}>No fields match "{query}".</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function ActivityCard({ type, schema, accent, onViewOptions, entityType = 'activity' }) {
  const [query, setQuery] = useState('')
  const fields = (schema && schema.fields) || []
  const mandatoryCount = fields.filter(f => f.isMandatory).length

  return (
    <div>
      <Card
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <IconChip accent={accent}><TableGlyph /></IconChip>
            <span>
              <span style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{type.name}</span>
              <span style={{ marginLeft: 8, fontFamily: 'monospace', fontSize: 10.5, fontWeight: 700, color: accent, background: accent + '18', padding: '2px 8px', borderRadius: 999, verticalAlign: 'middle' }}>CODE {type.code}</span>
            </span>
          </span>
        }
        sub={schema && !schema.error ? fields.length + ' fields · ' + mandatoryCount + ' mandatory' : ''}
        noPad
        action={
          !schema || schema.error ? null : (
            <input type="text" placeholder="Filter fields…" value={query} onChange={e => setQuery(e.target.value)}
              style={{ padding: '6px 11px', border: '0.5px solid ' + C.border, borderRadius: 8, fontSize: 12, fontFamily: FONT, outline: 'none', width: 160, background: 'var(--card)', color: C.text }} />
          )
        }
      >
        {schema && schema.error ? (
          <div style={{ padding: '16px', color: C.muted, fontSize: 12.5 }}>{schema.error}</div>
        ) : (
          <SchemaTable code={type.code} fields={fields} query={query} onViewOptions={onViewOptions} entityType={entityType} />
        )}
      </Card>
    </div>
  )
}

export default function LeadQualificationSchemaDashboard() {
  const { types, schemas, oppSchema, leadSchema, loading, error, lastSync, refreshing, refresh } = useSchema()
  const [optionsTarget, setOptionsTarget] = useState(null)
  const [selectedKey, setSelectedKey] = useState(null)

  // One flat list of everything selectable in the header dropdown -- each
  // Futwork activity type, then the Opportunity type, then Leads, in that
  // order. Only one is ever shown below at a time, instead of stacking all
  // of them (119 + 105 fields was a lot of scrolling just to reach Opportunity).
  const views = useMemo(() => {
    const out = (types || []).map((t, i) => ({
      key: 'act-' + t.code, name: t.name, code: t.code, entityType: 'activity',
      accent: CARD_ACCENTS[i % CARD_ACCENTS.length], schema: schemas[t.code],
    }))
    if (oppSchema) {
      out.push({
        key: 'opp', name: (oppSchema && oppSchema.displayName) || 'Opportunity Type', code: oppSchema.code,
        entityType: 'opportunity', accent: C.green, schema: oppSchema,
      })
    }
    if (leadSchema) {
      out.push({
        key: 'lead', name: (leadSchema && leadSchema.displayName) || 'Leads', code: leadSchema.code || 'leads',
        entityType: 'lead', accent: C.blue, schema: leadSchema,
      })
    }
    return out
  }, [types, schemas, oppSchema, leadSchema])

  useEffect(() => {
    if (!selectedKey && views.length) setSelectedKey(views[0].key)
  }, [views, selectedKey])

  const selected = views.find(v => v.key === selectedKey) || null
  const selectedFields = (selected && selected.schema && selected.schema.fields) || []

  const stats = useMemo(() => ({
    typeCount: views.length,
    fieldCount: selectedFields.length,
    dropdownCount: selectedFields.filter(f => isDropdownType(f.dataType)).length,
    mandatoryCount: selectedFields.filter(f => f.isMandatory).length,
  }), [views, selectedFields])

  const openOptions = (code, schemaName, displayName, presetOptions) => setOptionsTarget({ code, schemaName, displayName, presetOptions })

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
      <style>{'@keyframes lqsPulse{0%,100%{opacity:1}50%{opacity:.3}}'}</style>
      <Sidebar />
      <div style={{ margin: '12px 14px 0', borderRadius: 14, border: '1px solid #EEF1F6', boxShadow: '0 1px 3px rgba(31,60,132,0.06)', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <div style={{ background: 'var(--card)', borderBottom: '0.5px solid ' + C.border, padding: '10px 28px', minHeight: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0, flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontSize: 10.5, color: C.muted, margin: 0, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Lead Qualification / Field Schema</p>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: '2px 0 0', letterSpacing: '-0.4px', display: 'flex', alignItems: 'center', gap: 8 }}>
              Field Schema
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 700, color: C.green, background: C.greenBg, padding: '3px 9px', borderRadius: 999 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, animation: 'lqsPulse 1.6s ease-in-out infinite' }} />
                LIVE FROM LEADSQUARED
              </span>
            </h1>
          </div>
          <div className="lq-header-controls" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {views.length > 0 && (
              <Dropdown
                label="Viewing"
                value={selectedKey}
                onChange={setSelectedKey}
                minWidth={220}
                options={views.map(v => ({ value: v.key, label: v.name }))}
              />
            )}
            {lastSync && <span style={{ fontSize: 10.5, color: C.muted, whiteSpace: 'nowrap' }}>Synced {lastSync.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}{refreshing ? '…' : ''}</span>}
            <Button onClick={refresh} disabled={refreshing} size="sm">{refreshing ? 'Refreshing' : 'Refresh'}</Button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px', marginBottom: 20,
            background: C.navyBg, borderRadius: 12, border: '0.5px solid ' + C.navyBg,
          }}>
            <span style={{ color: C.navy, flexShrink: 0, marginTop: 1 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
            </span>
            <p style={{ fontSize: 12.5, color: C.text, margin: 0, lineHeight: 1.6 }}>
              Read live from LeadSquared's own Custom Notable Activity Type API -- the exact
              schema Settings &rsaquo; Custom Notable Activity Type shows for every activity type
              Futwork postbacks write to. This is what each raw <strong>mx_Custom_N</strong> code
              on the Futwork Errors page actually maps to. <strong>Refresh</strong> re-fetches
              directly from LeadSquared, so a field edited there shows up here without a deploy.
              Only <strong>Dropdown</strong>-type fields carry a value list in LeadSquared --
              confirmed directly in Settings &rsaquo; Custom Notable Activity Type, where a
              String field's own edit screen has no options concept at all.
              <br /><br />
              The <strong>Opportunity</strong> view is the same schema for Settings &rsaquo;
              Opportunities' field configuration. LeadSquared has no live lookup API for
              Opportunity dropdown values (confirmed -- the Activity one rejects an
              Opportunity code outright), so a dropdown field there only shows options
              when LeadSquared's own metadata happens to embed them directly; everything
              else reads "Not available via API" rather than a fake button. It also carries
              the same Created/Modified columns as Leads below, for consistency -- but every
              cell in them reads "Not available via API" too, since LeadSquared's own
              Opportunity field metadata (confirmed live, checked twice) has the identical
              27-key shape as Activity fields: no CreatedOn/ModifiedOn/CreatedBy/ModifiedBy
              anywhere. This isn't Quantum choosing not to show it -- LeadSquared genuinely
              doesn't track it for this field family.
              <br /><br />
              The <strong>Leads</strong> view reads LeadSquared's own Lead field metadata
              (<strong>LeadsMetaData.Get</strong>). This is the <em>one</em> field family where
              LeadSquared itself tracks who created or last changed a field and when --
              those 4 columns are real LeadSquared data, not something Quantum
              observed or inferred; a blank cell means LeadSquared has no record for that
              field, not a gap on our end.
            </p>
          </div>

          <div className="lq-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14, marginBottom: 20 }}>
            <PremKPI label="Types Available" value={fmtN(stats.typeCount)} sub="switch with the Viewing dropdown above" accent={C.navy} icon={KPI_ICONS.total} />
            <PremKPI label="Total Fields" value={fmtN(stats.fieldCount)} sub="on the selected type" accent={C.blue} icon={KPI_ICONS.ai} />
            <PremKPI label="Dropdown Fields" value={fmtN(stats.dropdownCount)} sub="where invalid values get rejected" accent={C.cyan} icon={KPI_ICONS.bot} />
            <PremKPI label="Mandatory Fields" value={fmtN(stats.mandatoryCount)} sub="required on every postback" accent={C.green} icon={KPI_ICONS.agent} />
          </div>

          {error && (
            <div style={{ padding: '12px 16px', background: 'var(--bg3)', borderRadius: 10, color: C.muted, fontSize: 13, marginBottom: 16 }}>{error}</div>
          )}

          {views.length === 0 && !error && (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: C.muted, fontSize: 13 }}>No Futwork-related activity types found on this LeadSquared account.</div>
          )}

          {selected && (
            <ActivityCard type={selected} schema={selected.schema} accent={selected.accent}
              entityType={selected.entityType} onViewOptions={openOptions} />
          )}
        </div>
      </div>
      <DropdownOptionsModal target={optionsTarget} onClose={() => setOptionsTarget(null)} />
    </div>
  )
}
