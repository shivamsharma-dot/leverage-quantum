import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import { InlineLoader } from '../components/SkeletonLoader'
import { C, FONT, fmtN, Card, PremKPI, KPI_ICONS } from '../ui/dashboardKit'
import Dropdown from '../components/Dropdown'
import Button from '../components/Button'
import ExportButton from '../components/ExportButton'
import { useAuth } from '../hooks/useAuth'

// Real-time roster (LeadSquared UserManagement.svc/Users.Get, one call, no cache) +
// group membership (reconstructed from that same roster -- LeadSquared has no
// dedicated Sales-Groups API resource on this account, see api/crm-leads.js's own
// comment on this) merged with the manual, human-entered fields kept in Supabase
// (team_mapping_manual). The manual fields are the ones LeadSquared's API doesn't
// expose at all -- ASM/SM, SSM, tier, level, country, centre -- the same columns the
// "Akash - Squad Mapping" Google Sheet used to track by hand. That sheet is a
// one-time seed for this page (via "Bulk import" below), not an ongoing source.
const API = '/api/crm-leads?source=leadsquared'
const PAGE_ROWS = 50

// employment_status was dropped from this list -- it duplicated the live
// LeadSquared Status (Active/Inactive) every row already shows, so it never
// carried information the page didn't already have. ls_manager_email is new,
// paired with ls_manager_name -- see the EditManualModal's manager type-ahead
// below for why it isn't sourced live.
const MANUAL_FIELDS = [
  { key: 'ls_manager_name', label: 'LS Manager Name' },
  { key: 'ls_manager_email', label: 'LS Manager Email' },
  { key: 'asm_sm', label: 'ASM/SM' },
  { key: 'asm_sm_email', label: 'ASM/SM Email' },
  { key: 'ssm', label: 'SSM' },
  { key: 'ssm_email', label: 'SSM Email' },
  { key: 'tier', label: 'Tier' },
  { key: 'level', label: 'Level' },
  { key: 'country', label: 'Country' },
  { key: 'centre_name', label: 'Centre Name' },
  { key: 'phone_number', label: 'Phone Number' },
  { key: 'airtel_number', label: 'Airtel Number' },
]

// Fields that stay manual even though the equivalent live LeadSquared UI
// screen (Settings > Edit user) DOES show real values for them (Phone Number
// == its "BD Personal Number" custom field, Airtel Number == its "DID
// Number"). Confirmed live: that screen's data comes from a session-cookie
// endpoint on in21.leadsquared.com, not the public accessKey/secretKey API
// this app's server integration uses -- Users.Get (the only Users/Groups
// endpoint this account's API key can reach at all) ignores every extra
// parameter tried against it and always returns the same fixed, small field
// set. So there's no way for Quantum's backend to read these live; they stay
// manually entered here, same as before.
const LIVE_IN_LEADSQUARED_BUT_NOT_VIA_API = ['phone_number', 'airtel_number']

// Header aliases accepted by the bulk-import (case/space/slash-insensitive) --
// covers the exact header text on the "Akash - Squad Mapping" sheet's Complete
// Mapping tab, plus a couple of obvious synonyms, so an import file doesn't need
// to be re-typed to match this table's own column names exactly.
const IMPORT_ALIASES = {
  'associate mail id': 'ls_email', 'email': 'ls_email', 'associate email': 'ls_email', 'ls email': 'ls_email',
  'ls manager name': 'ls_manager_name', 'manager name': 'ls_manager_name',
  'ls manager email': 'ls_manager_email', 'manager email': 'ls_manager_email',
  'asm/sm': 'asm_sm', 'asm sm': 'asm_sm',
  'asm/sm email': 'asm_sm_email', 'asm sm email': 'asm_sm_email',
  'ssm': 'ssm', 'ssm email': 'ssm_email',
  'status': 'tier', 'tier': 'tier',
  'level': 'level', 'country': 'country', 'centre name': 'centre_name', 'center name': 'centre_name',
  'phone number': 'phone_number', 'airtel number': 'airtel_number',
}
// The exact columns + one worked example the "Download template" button ships --
// deliberately the same alias vocabulary as IMPORT_ALIASES above, so a template
// round-tripped straight back through "Upload" needs no edits to import cleanly.
const TEMPLATE_HEADERS = ['Associate Mail ID', 'LS Manager Name', 'LS Manager Email', 'ASM/SM', 'ASM/SM Email', 'SSM', 'SSM Email', 'Tier', 'Level', 'Country', 'Centre Name', 'Phone Number', 'Airtel Number']
const TEMPLATE_EXAMPLE = ['jane.doe@leverageedu.com', 'Srishti Prasad', 'srishti.prasad@leverageedu.com', 'Kartikey Kedia', 'kartikey.kedia@leverageedu.com', 'Manish Singh', 'manish@leverageedu.com', 'Consultant', 'Level 1', 'AC + SR', 'Delhi', '9650028465', '9821550658']

async function fetchJson(url, opts) {
  const r = await fetch(url, { credentials: 'include', ...opts })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Request failed')
  return d
}

// A cell that itself contains the delimiter or a quote has to be quoted, RFC4180-
// style -- otherwise a pasted/uploaded "Delhi, NCR" in a Centre Name column would
// silently split into two columns on import, or corrupt a downloaded template.
function csvCell(v) {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}
function triggerDownload(filename, content, mime) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
function downloadTemplate() {
  const csv = [TEMPLATE_HEADERS, TEMPLATE_EXAMPLE].map(row => row.map(csvCell).join(',')).join('\r\n')
  triggerDownload('team-mapping-import-template.csv', csv, 'text/csv;charset=utf-8')
}

const inputStyle = { fontFamily: FONT, fontSize: 12.5, color: C.text, border: '0.5px solid ' + C.border, borderRadius: 8, padding: '7px 10px', background: 'var(--card)', outline: 'none', width: '100%' }
const pillStyle = (active) => ({
  padding: '7px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
  background: active ? 'linear-gradient(135deg,#1F3C84,#1C9FD4)' : 'transparent',
  color: active ? '#fff' : C.muted, border: active ? 'none' : '0.5px solid ' + C.border,
  whiteSpace: 'nowrap', boxShadow: active ? '0 3px 10px rgba(31,60,132,.20)' : 'none',
})

function StatusBadge({ status }) {
  const on = status === 'Active'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700,
      padding: '3px 9px', borderRadius: 999, fontFamily: FONT,
      color: on ? C.green : C.muted, background: on ? C.greenBg : 'var(--bg3)',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: on ? C.green : C.muted }} />
      {status}
    </span>
  )
}

function GroupChips({ groups, max = 2 }) {
  if (!groups || !groups.length) return <span style={{ color: C.muted, fontSize: 12 }}>—</span>
  const shown = groups.slice(0, max)
  const rest = groups.length - shown.length
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {shown.map(g => (
        <span key={g} title={g} style={{ fontSize: 10.5, fontWeight: 700, color: C.navy, background: C.navyBg, padding: '2px 7px', borderRadius: 999, fontFamily: FONT, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g}</span>
      ))}
      {rest > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, fontFamily: FONT }}>+{rest}</span>}
    </div>
  )
}

function Modal({ onClose, title, width = 560, children }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', borderRadius: 16, width: '100%', maxWidth: width, maxHeight: '86vh', overflowY: 'auto', boxShadow: '0 24px 60px -12px rgba(15,23,42,0.35)', fontFamily: FONT }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '0.5px solid ' + C.border }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{title}</div>
          <div onClick={onClose} style={{ cursor: 'pointer', color: C.muted, fontSize: 18, lineHeight: 1, padding: 4 }}>✕</div>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Edit modal

// LS Manager Name/Email get their own control: LeadSquared's live "Reporting to"
// relationship isn't reachable via the public API (see the note above
// LIVE_IN_LEADSQUARED_BUT_NOT_VIA_API), so the name still has to be typed by
// hand -- but since the manager is almost always ALSO a LeadSquared user, typing
// against a type-ahead of the live roster and picking a match fills in their
// real email for free, rather than needing that typed by hand too.
function ManagerLookup({ nameValue, emailValue, onPick, onNameChange, roster }) {
  const [open, setOpen] = useState(false)
  const suggestions = useMemo(() => {
    const q = nameValue.trim().toLowerCase()
    if (!q) return []
    return roster.filter(u => (u.name || '').toLowerCase().includes(q)).slice(0, 6)
  }, [nameValue, roster])
  return (
    <div style={{ position: 'relative' }}>
      <input
        style={inputStyle} value={nameValue} placeholder="Start typing a name…"
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={e => onNameChange(e.target.value)}
      />
      {open && suggestions.length > 0 && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 10, background: 'var(--card)', border: '0.5px solid ' + C.border, borderRadius: 8, boxShadow: '0 8px 20px -6px rgba(15,23,42,0.25)', maxHeight: 180, overflowY: 'auto' }}>
          {suggestions.map(u => (
            <div key={u.id} onClick={() => { onPick(u); setOpen(false) }} style={{ padding: '7px 10px', fontSize: 12.5, cursor: 'pointer', color: C.text }}>
              <div style={{ fontWeight: 700 }}>{u.name}</div>
              <div style={{ fontSize: 11, color: C.muted }}>{u.email}</div>
            </div>
          ))}
        </div>
      )}
      {emailValue && <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{emailValue}</div>}
    </div>
  )
}

function EditManualModal({ user, roster, onClose, onSaved }) {
  const [form, setForm] = useState(() => {
    const base = {}
    MANUAL_FIELDS.forEach(f => { base[f.key] = (user.manual && user.manual[f.key]) || '' })
    return base
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const save = async () => {
    setSaving(true); setErr('')
    try {
      const saved = await fetchJson(API + '&mode=team_manual_save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ls_email: user.email, ...form }),
      })
      onSaved(saved)
    } catch (e) { setErr(String(e.message || e)) } finally { setSaving(false) }
  }

  const remove = async () => {
    if (!window.confirm('Remove all manually-entered fields for ' + user.name + '?')) return
    setSaving(true); setErr('')
    try {
      await fetchJson(API + '&mode=team_manual_delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ls_email: user.email }),
      })
      onSaved(null)
    } catch (e) { setErr(String(e.message || e)) } finally { setSaving(false) }
  }

  return (
    <Modal onClose={onClose} title={'Manual mapping — ' + user.name}>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 14 }}>{user.email} · {user.role} · <StatusBadge status={user.status} /></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: '1 / -1' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>LS Manager Name — picking a match below fills in their email</span>
          <ManagerLookup
            nameValue={form.ls_manager_name} emailValue={form.ls_manager_email} roster={roster || []}
            onNameChange={v => setForm(p => ({ ...p, ls_manager_name: v }))}
            onPick={u => setForm(p => ({ ...p, ls_manager_name: u.name, ls_manager_email: u.email || '' }))}
          />
        </label>
        {MANUAL_FIELDS.filter(f => f.key !== 'ls_manager_name' && f.key !== 'ls_manager_email').map(f => (
          <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {f.label}
              {LIVE_IN_LEADSQUARED_BUT_NOT_VIA_API.includes(f.key) && <span title="Real value exists in LeadSquared's own Settings > Edit user screen, but that field isn't reachable by this app's API integration -- has to stay manual." style={{ marginLeft: 5, cursor: 'help', color: C.blue }}>ⓘ</span>}
            </span>
            <input style={inputStyle} value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
          </label>
        ))}
      </div>
      {err && <div style={{ color: '#B91C1C', fontSize: 12.5, marginTop: 12 }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
        <Button variant="ghost" danger size="sm" onClick={remove} disabled={saving || !user.manual}>Remove mapping</Button>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- Bulk import

// RFC4180-ish single-line splitter (handles a quoted field containing the
// delimiter itself, e.g. a Centre Name of "Delhi, NCR" in a comma-delimited
// file) -- deliberately simple since this only ever runs on our own template's
// round-trip or a straight sheet paste, not arbitrary third-party CSV.
function splitDelimited(line, delim) {
  const out = []; let cur = ''; let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else q = false }
      else cur += c
    } else if (c === '"') q = true
    else if (c === delim) { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out
}

// Accepts either a Ctrl+A/Ctrl+C paste straight out of the sheet (tab-delimited)
// or a comma-delimited CSV (the shape "Download template" produces and a real
// file upload carries) -- delimiter is auto-detected off the header line, then
// used consistently for every row. Rows with no recognizable email are skipped
// and counted, not silently dropped -- the summary after import states exactly
// what happened.
function parsePasted(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length)
  if (lines.length < 2) return { rows: [], skipped: 0, unmapped: [] }
  const delim = lines[0].includes('\t') ? '\t' : ','
  const headerCells = splitDelimited(lines[0], delim).map(h => h.trim().toLowerCase())
  const fieldForCol = headerCells.map(h => IMPORT_ALIASES[h] || null)
  const unmapped = headerCells.filter((h, i) => !fieldForCol[i]).filter(Boolean)
  const rows = []
  let skipped = 0
  for (let i = 1; i < lines.length; i++) {
    const cells = splitDelimited(lines[i], delim)
    const row = {}
    cells.forEach((val, ci) => { const f = fieldForCol[ci]; if (f) row[f] = val.trim() })
    if (!row.ls_email) { skipped++; continue }
    rows.push(row)
  }
  return { rows, skipped, unmapped }
}

function BulkImportModal({ onClose, onDone }) {
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const parsed = useMemo(() => parsePasted(text), [text])
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)
  const fileRef = React.useRef(null)

  const onFile = e => {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = ev => setText(String(ev.target.result || ''))
    reader.readAsText(file)
  }

  const run = async () => {
    setRunning(true); setProgress({ done: 0, total: parsed.rows.length }); setResult(null)
    let ok = 0, failed = 0
    for (const row of parsed.rows) {
      try {
        await fetchJson(API + '&mode=team_manual_save', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(row),
        })
        ok++
      } catch { failed++ }
      setProgress(p => ({ done: p.done + 1, total: p.total }))
    }
    setResult({ ok, failed, skipped: parsed.skipped })
    setRunning(false)
    onDone()
  }

  return (
    <Modal onClose={onClose} title="Bulk import" width={660}>
      <p style={{ fontSize: 12.5, color: C.muted, marginTop: 0 }}>
        One-time seed, meant for the private "Akash - Squad Mapping" sheet's existing data. Start
        with the template below, or upload/paste any CSV whose first row is real column headers —
        matching is by header name (see the accepted names in the template), so hidden/reordered
        columns are fine, and a row with no recognizable email column is skipped rather than guessed.
      </p>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <Button variant="ghost" size="sm" onClick={downloadTemplate}>Download template (CSV)</Button>
        <Button variant="ghost" size="sm" onClick={() => fileRef.current && fileRef.current.click()}>Upload file…</Button>
        <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" onChange={onFile} style={{ display: 'none' }} />
        {fileName && <span style={{ fontSize: 12, color: C.muted }}>{fileName}</span>}
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Or paste rows directly</div>
      <textarea
        value={text} onChange={e => { setFileName(''); setText(e.target.value) }} placeholder="Paste tab- or comma-separated rows here…"
        style={{ ...inputStyle, height: 140, fontFamily: 'monospace', fontSize: 11.5, resize: 'vertical' }}
      />
      {text.trim().length > 0 && (
        <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>
          {parsed.rows.length} row(s) ready to import, {parsed.skipped} skipped (no email column matched).
          {parsed.unmapped.length > 0 && <> Unrecognized column(s), ignored: {parsed.unmapped.join(', ')}.</>}
        </div>
      )}
      {progress && <div style={{ fontSize: 12.5, color: C.text, marginTop: 10 }}>Saving {progress.done} of {progress.total}…</div>}
      {result && (
        <div style={{ fontSize: 12.5, marginTop: 10, color: result.failed ? '#B91C1C' : C.green }}>
          Imported {result.ok}, failed {result.failed}, skipped {result.skipped}.
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={running}>Close</Button>
        <Button size="sm" onClick={run} disabled={running || !parsed.rows.length}>{running ? 'Importing…' : `Import ${parsed.rows.length} row(s)`}</Button>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- Roster tab

function RosterTab({ isAdmin }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('Active')
  const [groupFilter, setGroupFilter] = useState('All')
  const [mappedFilter, setMappedFilter] = useState('All')
  const [page, setPage] = useState(1)
  const [editUser, setEditUser] = useState(null)
  const [showImport, setShowImport] = useState(false)

  const load = useCallback(() => {
    setLoading(true); setError('')
    fetchJson(API + '&mode=team_users')
      .then(d => setData(d))
      .catch(e => setError(String(e.message || e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const rows = data?.rows || []
  const roleOptions = useMemo(() => ['All', ...Array.from(new Set(rows.map(r => r.role).filter(Boolean))).sort()], [rows])
  const groupOptions = useMemo(() => {
    const s = new Set()
    rows.forEach(r => (r.groups || []).forEach(g => s.add(g)))
    return ['All', ...Array.from(s).sort()]
  }, [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (roleFilter !== 'All' && r.role !== roleFilter) return false
      if (statusFilter !== 'All' && r.status !== statusFilter) return false
      if (groupFilter !== 'All' && !(r.groups || []).includes(groupFilter)) return false
      if (mappedFilter === 'Mapped' && !r.manual) return false
      if (mappedFilter === 'Unmapped' && r.manual) return false
      if (q && !((r.name || '').toLowerCase().includes(q) || (r.email || '').toLowerCase().includes(q))) return false
      return true
    })
  }, [rows, search, roleFilter, statusFilter, groupFilter, mappedFilter])

  useEffect(() => { setPage(1) }, [search, roleFilter, statusFilter, groupFilter, mappedFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_ROWS))
  const pageRows = filtered.slice((page - 1) * PAGE_ROWS, page * PAGE_ROWS)

  const kpis = useMemo(() => {
    const active = rows.filter(r => r.status === 'Active').length
    const mapped = rows.filter(r => r.manual).length
    const groupCount = groupOptions.length - 1
    return { total: rows.length, active, mapped, groupCount }
  }, [rows, groupOptions])

  if (loading) return <InlineLoader label="Loading LeadSquared roster" />
  if (error) return <div style={{ padding: '10px 14px', borderRadius: 10, background: '#FEF2F2', border: '0.5px solid #FECACA', color: '#B91C1C', fontSize: 12.5 }}>✕ {error}</div>

  return (
    <div>
      <div className="lq-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 12, marginBottom: 16 }}>
        <PremKPI label="Total Users" value={fmtN(kpis.total)} sub="LeadSquared, real-time" accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.total} />
        <PremKPI label="Active" value={fmtN(kpis.active)} sub={fmtN(kpis.total - kpis.active) + ' inactive'} accent={C.green} accentBg={C.greenBg} icon={KPI_ICONS.agent} />
        <PremKPI label="Sales Groups" value={fmtN(kpis.groupCount)} sub="reconstructed from membership" accent={C.blue} accentBg={C.blueBg} icon={KPI_ICONS.bot} />
        <PremKPI label="Manually Mapped" value={fmtN(kpis.mapped)} sub={fmtN(kpis.total - kpis.mapped) + ' not yet mapped'} accent={C.cyan} accentBg={C.cyanBg} icon={KPI_ICONS.ai} />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or email…" style={{ ...inputStyle, width: 220 }} />
        <Dropdown label="Role" options={roleOptions} value={roleFilter} onChange={setRoleFilter} minWidth={130} />
        <Dropdown label="Status" options={['All', 'Active', 'Inactive']} value={statusFilter} onChange={setStatusFilter} minWidth={110} />
        <Dropdown label="Group" options={groupOptions} value={groupFilter} onChange={setGroupFilter} minWidth={160} />
        <Dropdown label="Mapping" options={['All', 'Mapped', 'Unmapped']} value={mappedFilter} onChange={setMappedFilter} minWidth={120} />
        <div style={{ flex: 1 }} />
        <Button variant="ghost" size="sm" onClick={load}>Refresh</Button>
        <ExportButton
          hideSlack
          filename="team-mapping-roster"
          data={filtered.map(r => ({
            Name: r.name, Email: r.email, Role: (r.role || '').replace(/_/g, ' '), Status: r.status,
            Groups: (r.groups || []).join('; '),
            'LS Manager Name': r.manual?.ls_manager_name || '', 'LS Manager Email': r.manual?.ls_manager_email || '',
            'ASM/SM': r.manual?.asm_sm || '', 'ASM/SM Email': r.manual?.asm_sm_email || '',
            SSM: r.manual?.ssm || '', 'SSM Email': r.manual?.ssm_email || '',
            Tier: r.manual?.tier || '', Level: r.manual?.level || '', Country: r.manual?.country || '',
            'Centre Name': r.manual?.centre_name || '', 'Phone Number': r.manual?.phone_number || '', 'Airtel Number': r.manual?.airtel_number || '',
          }))}
        />
        {isAdmin && <Button size="sm" onClick={() => setShowImport(true)}>Bulk import</Button>}
      </div>

      <p style={{ fontSize: 11.5, color: C.muted, marginTop: -4, marginBottom: 12 }}>
        Name/Email/Role/Status/Groups are live from LeadSquared. Everything else is manually
        entered here — including Phone Number and Airtel Number, which do exist in LeadSquared's
        own Settings screen but aren't reachable by this app's API integration (see the ⓘ on those
        fields when editing a person).
      </p>

      <Card title={`${fmtN(filtered.length)} people`} sub={`Page ${page} of ${totalPages}`} noPad>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 900 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid ' + C.border }}>
                {['Name', 'Email', 'Role', 'Status', 'Groups', 'LS Manager', 'ASM/SM', 'SSM', 'Tier', 'Country', ''].map(h => (
                  <th key={h} style={{ padding: '9px 12px', fontSize: 10.5, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r, i) => (
                <tr key={r.id} style={{ borderBottom: '1px solid ' + C.border, background: i % 2 ? 'transparent' : 'var(--bg3)' }}>
                  <td style={{ padding: '9px 12px', fontWeight: 700, color: C.text, whiteSpace: 'nowrap' }}>{r.name}</td>
                  <td style={{ padding: '9px 12px', color: C.muted }}>{r.email || '—'}</td>
                  <td style={{ padding: '9px 12px', color: C.text }}>{(r.role || '').replace(/_/g, ' ')}</td>
                  <td style={{ padding: '9px 12px' }}><StatusBadge status={r.status} /></td>
                  <td style={{ padding: '9px 12px', minWidth: 160 }}><GroupChips groups={r.groups} /></td>
                  <td style={{ padding: '9px 12px', color: C.text }} title={r.manual?.ls_manager_email || ''}>{r.manual?.ls_manager_name || '—'}</td>
                  <td style={{ padding: '9px 12px', color: C.text }}>{r.manual?.asm_sm || '—'}</td>
                  <td style={{ padding: '9px 12px', color: C.text }}>{r.manual?.ssm || '—'}</td>
                  <td style={{ padding: '9px 12px', color: C.text }}>{r.manual?.tier || '—'}</td>
                  <td style={{ padding: '9px 12px', color: C.text }}>{r.manual?.country || '—'}</td>
                  <td style={{ padding: '9px 12px' }}>
                    <span onClick={() => setEditUser(r)} style={{ cursor: 'pointer', fontWeight: 700, color: C.blue, fontSize: 12 }}>{r.manual ? 'Edit' : 'Map'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: '14px 0' }}>
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{'← Prev'}</Button>
            <span style={{ fontSize: 12.5, color: C.muted, padding: '0 8px', alignSelf: 'center' }}>{page} / {totalPages}</span>
            <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>{'Next →'}</Button>
          </div>
        )}
      </Card>

      {editUser && (
        <EditManualModal
          user={editUser}
          roster={rows}
          onClose={() => setEditUser(null)}
          onSaved={saved => {
            setData(d => ({ ...d, rows: d.rows.map(r => r.email === editUser.email ? { ...r, manual: saved } : r) }))
            setEditUser(null)
          }}
        />
      )}
      {showImport && <BulkImportModal onClose={() => setShowImport(false)} onDone={load} />}
    </div>
  )
}

// ---------------------------------------------------------------- Groups tab

function GroupsTab() {
  const [groups, setGroups] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(null)
  const [search, setSearch] = useState('')

  const load = useCallback(() => {
    setLoading(true); setError('')
    fetchJson(API + '&mode=team_groups')
      .then(d => setGroups(d.groups || []))
      .catch(e => setError(String(e.message || e)))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (groups || []).filter(g => !q || g.name.toLowerCase().includes(q))
  }, [groups, search])

  if (loading) return <InlineLoader label="Loading Sales Groups" />
  if (error) return <div style={{ padding: '10px 14px', borderRadius: 10, background: '#FEF2F2', border: '0.5px solid #FECACA', color: '#B91C1C', fontSize: 12.5 }}>✕ {error}</div>

  return (
    <div>
      <p style={{ fontSize: 12, color: C.muted, marginTop: 0, marginBottom: 14 }}>
        LeadSquared has no dedicated API for Sales Groups on this account, so this list is
        reconstructed by grouping every user's live <code>MemberOfGroups</code> membership —
        the group count matches LeadSquared's own Manage Sales Groups screen exactly. Per-group
        metadata that screen shows (Managers, Modified On) has no live-API source and isn't shown here.
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search groups…" style={{ ...inputStyle, width: 240 }} />
        <div style={{ flex: 1 }} />
        <Button variant="ghost" size="sm" onClick={load}>Refresh</Button>
        <ExportButton hideSlack filename="team-mapping-groups" data={filtered.map(g => ({ Group: g.name, Members: g.memberCount }))} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map(g => {
          const isOpen = open === g.name
          return (
            <Card key={g.name} noPad>
              <div onClick={() => setOpen(isOpen ? null : g.name)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px' }}>
                <span style={{ fontWeight: 700, fontSize: 13.5, color: C.text }}>{g.name}</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: C.navy, background: C.navyBg, padding: '3px 10px', borderRadius: 999 }}>{fmtN(g.memberCount)} member{g.memberCount === 1 ? '' : 's'}</span>
              </div>
              {isOpen && (
                <div style={{ padding: '0 18px 16px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {g.members.map(m => (
                      <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '5px 10px', borderRadius: 8, background: 'var(--bg3)' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.status === 'Active' ? C.green : C.muted }} />
                        <span style={{ color: C.text, fontWeight: 600 }}>{m.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Page shell

export default function TeamMappingDashboard() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') || 'roster'
  const setTab = t => setSearchParams(prev => { const n = new URLSearchParams(prev); n.set('tab', t); return n })

  return (
    <div className="lq-page-shell" style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.bg, fontFamily: FONT }}>
      <Sidebar />
      <div style={{ margin: '12px 14px 0', borderRadius: 14, border: '1px solid #EEF1F6', boxShadow: '0 1px 3px rgba(31,60,132,0.06)', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <div style={{ background: 'var(--card)', borderBottom: '0.5px solid ' + C.border, padding: '10px 28px', flexShrink: 0 }}>
          <p style={{ fontSize: 10.5, color: C.muted, margin: 0, letterSpacing: '0.05em', textTransform: 'uppercase', fontFamily: FONT }}>Dashboards / Team Mapping</p>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: '2px 0 10px', letterSpacing: '-0.4px', fontFamily: FONT }}>Team Mapping</h1>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} className="lq-header-controls">
            <div style={pillStyle(activeTab === 'roster')} onClick={() => setTab('roster')}>Roster</div>
            <div style={pillStyle(activeTab === 'groups')} onClick={() => setTab('groups')}>Sales Groups</div>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
          {activeTab === 'roster' && <RosterTab isAdmin={isAdmin} />}
          {activeTab === 'groups' && <GroupsTab />}
        </div>
      </div>
    </div>
  )
}
