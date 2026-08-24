import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import { InlineLoader } from '../components/SkeletonLoader'
import { C, FONT, fmtN, Card, brandColor } from '../ui/dashboardKit'
import Dropdown from '../components/Dropdown'
import Button from '../components/Button'
import ExportButton from '../components/ExportButton'
import { useAuth } from '../hooks/useAuth'

// Real-time roster (LeadSquared UserManagement.svc/Users.Get, one call, no cache) +
// group membership (reconstructed from that same roster -- LeadSquared has no
// dedicated Sales-Groups API resource on this account, see api/crm-leads.js's own
// comment on this) merged with the manual, human-entered fields kept in Supabase
// (team_mapping_manual). Phone Number, Airtel Number and Reporting Manager are ALSO
// live -- User/Retrieve/ByUserId, a real per-user detail endpoint found in
// LeadSquared's own API docs, fetched lazily per roster page (see RosterTab's
// detailCache) since it's a per-user call, not bulk. What's left genuinely manual
// is ASM/SM, SSM, Role (a business designation distinct from LeadSquared's own
// coarse "LS Role"), Level, Country and Centre Name -- the columns the "Akash -
// Squad Mapping" Google Sheet used to track by hand. That sheet is a one-time seed
// for this page (via "Bulk import" below), not an ongoing source.
const API = '/api/crm-leads?source=leadsquared'
const PAGE_ROWS = 50

// Phone Number, Airtel Number and LS Manager Name/Email are NOT in this list --
// LeadSquared's own API docs (User/Retrieve/ByUserId) genuinely return PhoneMain,
// the mx_Custom_2 custom field, and the real ManagerName/ManagerUserId, so those
// three are live data now (see the roster table's Phone/Airtel/LS Manager cells).
// employment_status was dropped for duplicating the live Active/Inactive status.
// tier was renamed to role: a business-side designation (see ROLE_SUGGESTIONS),
// distinct from LeadSquared's own coarse Role, labeled "LS Role" on this page.
// `suggest: 'roster'` on asm_sm/ssm feeds a type-ahead of live roster names
// (not just past-typed strings, the way Role's suggestions work) -- a real
// data-quality guard: this field is free text, and "Kartikey Kedia" typed once
// and "kartikey kedia" typed a second time are two different strings to a
// grouping/org-chart view even though they mean the same live person. Picking
// from the live roster instead of retyping a name doesn't force correctness,
// but makes the correct answer the easiest one.
const MANUAL_FIELDS = [
  { key: 'role', label: 'Role', suggest: 'role' },
  { key: 'asm_sm', label: 'ASM/SM', suggest: 'roster' },
  { key: 'asm_sm_email', label: 'ASM/SM Email' },
  { key: 'ssm', label: 'SSM', suggest: 'roster' },
  { key: 'ssm_email', label: 'SSM Email' },
  { key: 'level', label: 'Level' },
  { key: 'country', label: 'Country' },
  { key: 'centre_name', label: 'Centre Name' },
]

// Suggested values for the manual Role field -- shown as a type-ahead when
// editing, not a hard-restricted list, since org designations do change.
const ROLE_SUGGESTIONS = ['ASM', 'Consultant', 'Manager', 'Intern', 'AD', 'CBO', 'Performance Marketing User', 'Tech User', 'Leadsquared Super Admin', 'Leadsquared Admin']

// Header aliases accepted by the bulk-import (case/space/slash-insensitive) --
// covers the exact header text on the "Akash - Squad Mapping" sheet's Complete
// Mapping tab, plus a couple of obvious synonyms, so an import file doesn't need
// to be re-typed to match this table's own column names exactly.
const IMPORT_ALIASES = {
  'associate mail id': 'ls_email', 'email': 'ls_email', 'associate email': 'ls_email', 'ls email': 'ls_email',
  'asm/sm': 'asm_sm', 'asm sm': 'asm_sm',
  'asm/sm email': 'asm_sm_email', 'asm sm email': 'asm_sm_email',
  'ssm': 'ssm', 'ssm email': 'ssm_email',
  'status': 'role', 'tier': 'role', 'role': 'role',
  'level': 'level', 'country': 'country', 'centre name': 'centre_name', 'center name': 'centre_name',
}
// The exact columns + one worked example the "Download template" button ships --
// deliberately the same alias vocabulary as IMPORT_ALIASES above, so a template
// round-tripped straight back through "Upload" needs no edits to import cleanly.
const TEMPLATE_HEADERS = ['Associate Mail ID', 'ASM/SM', 'ASM/SM Email', 'SSM', 'SSM Email', 'Role', 'Level', 'Country', 'Centre Name']
const TEMPLATE_EXAMPLE = ['jane.doe@leverageedu.com', 'Kartikey Kedia', 'kartikey.kedia@leverageedu.com', 'Manish Singh', 'manish@leverageedu.com', 'Consultant', 'Level 1', 'AC + SR', 'Delhi']

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

// --------------------------------------------------------- Directory visuals
//
// This page is a people directory/ops tool, not an analytics dashboard -- it
// deliberately does NOT use the shared PremKPI/gradient-icon KPI card the rest
// of the app's chart-heavy pages standardize on. A roster of people reads
// better as a calm reference list (names, avatars, plain counts) than as a
// row of metric tiles, so this file keeps its own small, quieter set of
// primitives instead: Avatar (a stable-per-person initials circle, colored
// the same way sourceColor() colors a channel -- hash the name into
// BRAND_RAMP so the same person always gets the same tone, never a random
// one), and StatStrip (a single bordered strip of plain label/value pairs,
// no icons, no gradients, no per-card shadow) in place of a KPI grid.

function hashIndex(s, mod) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h % mod
}
function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}
function Avatar({ name, size = 30 }) {
  const bg = brandColor(hashIndex(name || '?', 12))
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0, background: bg, color: '#fff',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 800, fontFamily: FONT, letterSpacing: '-0.02em',
    }}>
      {initials(name)}
    </span>
  )
}

function StatStrip({ items }) {
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', border: '0.5px solid ' + C.border, borderRadius: 12,
      background: 'var(--card)', marginBottom: 18, overflow: 'hidden',
    }}>
      {items.map((it, i) => (
        <div key={it.label} style={{
          flex: '1 1 160px', padding: '13px 18px', borderLeft: i === 0 ? 'none' : '0.5px solid ' + C.border,
        }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{it.label}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.text, fontFamily: FONT }}>{it.value}</div>
          {it.sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{it.sub}</div>}
        </div>
      ))}
    </div>
  )
}

// A mapping is "stale" once its own last-touched timestamp is old enough that
// nobody has confirmed the org structure it encodes is still correct -- an
// ASM/SM assignment nobody has revisited in 90+ days is exactly the kind of
// thing worth a second look (a promotion, a team reshuffle, someone who left).
const STALE_DAYS = 90
function staleDays(manual) {
  if (!manual || !manual.updated_at) return null
  const ms = Date.now() - new Date(manual.updated_at).getTime()
  return Math.floor(ms / 86400000)
}
function isStaleMapping(manual) {
  const d = staleDays(manual)
  return d != null && d >= STALE_DAYS
}

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

function ChevronDown({ size = 10 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>
}

// Matches ExportButton's own icon sizing (13px, strokeWidth 2) so Refresh /
// Bulk import / History read as one family of self-explanatory button icons,
// not three different visual languages bolted together.
function RefreshIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
    </svg>
  )
}
// Same up-arrow-into-tray glyph as TYPE_ICON.import below -- deliberately, so
// "Bulk import" here and the "import" rows it produces in History read as the
// same action.
function UploadIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}
function ClockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

// Groups column: a compact "View" button + count instead of inline chips, so the
// column stays a fixed width regardless of how many groups someone's in -- opens
// the full, un-truncated list rather than "+2 more" with no way to see the rest.
function GroupsButton({ groups }) {
  const [open, setOpen] = useState(false)
  const n = (groups || []).length
  return (
    <>
      <button
        onClick={() => n && setOpen(true)} disabled={!n}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7,
          border: '0.5px solid ' + C.border, background: 'var(--card)', cursor: n ? 'pointer' : 'default',
          fontSize: 11.5, fontWeight: 700, color: n ? C.navy : C.muted, fontFamily: FONT,
        }}
      >
        View{n > 0 ? ` (${n})` : ''}
        {n > 0 && <ChevronDown />}
      </button>
      {open && (
        <Modal onClose={() => setOpen(false)} title={`Groups (${n})`} width={440}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {groups.map(g => (
              <div key={g} style={{ fontSize: 13, fontWeight: 600, color: C.text, padding: '8px 12px', borderRadius: 8, background: 'var(--bg3)' }}>{g}</div>
            ))}
          </div>
        </Modal>
      )}
    </>
  )
}

// ---------------------------------------------------------------- Edit modal

// Generic text input with a fixed suggestion list shown while typing/focused --
// unlike a Dropdown, the value isn't restricted to the list (org designations
// change), picking a suggestion just fills the field the same as typing it.
function SuggestInput({ value, onChange, suggestions, placeholder }) {
  const [open, setOpen] = useState(false)
  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase()
    return suggestions.filter(s => !q || s.toLowerCase().includes(q))
  }, [value, suggestions])
  return (
    <div style={{ position: 'relative' }}>
      <input
        style={inputStyle} value={value} placeholder={placeholder}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={e => onChange(e.target.value)}
      />
      {open && filtered.length > 0 && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 10, background: 'var(--card)', border: '0.5px solid ' + C.border, borderRadius: 8, boxShadow: '0 8px 20px -6px rgba(15,23,42,0.25)', maxHeight: 200, overflowY: 'auto' }}>
          {filtered.map(s => (
            // mousedown, not click, with preventDefault: mousedown fires before the
            // input's own onBlur, and preventDefault stops the focus-shift that would
            // trigger it -- a plain onClick raced the blur-close timeout and could
            // unmount this div before its click ever fired (caught live: the click
            // then fell through to the modal's backdrop and closed the whole modal).
            <div key={s} onMouseDown={e => { e.preventDefault(); onChange(s); setOpen(false) }} style={{ padding: '7px 10px', fontSize: 12.5, cursor: 'pointer', color: C.text, fontWeight: 600 }}>{s}</div>
          ))}
        </div>
      )}
    </div>
  )
}

// Read-only strip showing what LeadSquared itself reports for this person --
// Phone/Airtel/Reporting Manager, all live via User/Retrieve/ByUserId, fetched
// fresh every time the modal opens rather than reused from the roster table's
// own (page-scoped, possibly stale-by-a-few-minutes) detail cache.
function LiveDetailStrip({ userId }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    setLoading(true)
    fetchJson(API + '&mode=team_user_detail&ids=' + encodeURIComponent(userId))
      .then(d => setDetail((d.details && d.details[0]) || null))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false))
  }, [userId])
  return (
    <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
      {['Phone', 'Airtel', 'Reporting Manager'].map((label, i) => {
        const val = loading ? '…' : (i === 0 ? detail?.phoneMain : i === 1 ? detail?.airtelNumber : detail?.managerName) || '—'
        const sub = i === 2 && !loading ? detail?.managerEmail : null
        return (
          <div key={label}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label} · live</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{val}</div>
            {sub && <div style={{ fontSize: 10.5, color: C.muted }}>{sub}</div>}
          </div>
        )
      })}
    </div>
  )
}

function EditManualModal({ user, rosterNames, onClose, onSaved }) {
  const [form, setForm] = useState(() => {
    const base = {}
    MANUAL_FIELDS.forEach(f => { base[f.key] = (user.manual && user.manual[f.key]) || '' })
    return base
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const staleD = staleDays(user.manual)

  const save = async () => {
    setSaving(true); setErr('')
    try {
      const saved = await fetchJson(API + '&mode=team_manual_save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ls_email: user.email, ls_name: user.name, ...form }),
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <Avatar name={user.name} size={34} />
        <div>
          <div style={{ fontSize: 12.5, color: C.muted }}>{user.email} · {(user.role || '').replace(/_/g, ' ')} (LS Role) · <StatusBadge status={user.status} /></div>
          {staleD != null && staleD >= STALE_DAYS && <div style={{ fontSize: 11, color: C.navy, fontWeight: 700, marginTop: 2 }}>Last touched {staleD} days ago — worth confirming this is still right</div>}
        </div>
      </div>
      <LiveDetailStrip userId={user.id} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {MANUAL_FIELDS.map(f => (
          <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{f.label}</span>
            {f.suggest === 'role' ? (
              <SuggestInput value={form.role} onChange={v => setForm(p => ({ ...p, role: v }))} suggestions={ROLE_SUGGESTIONS} placeholder="Start typing or pick a suggestion…" />
            ) : f.suggest === 'roster' ? (
              <SuggestInput value={form[f.key]} onChange={v => setForm(p => ({ ...p, [f.key]: v }))} suggestions={rosterNames || []} placeholder="Start typing a name…" />
            ) : (
              <input style={inputStyle} value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
            )}
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

// ---------------------------------------------------------------- Bulk edit modal

// Applies ONE value to a chosen field across every selected person in one go
// (e.g. "these 12 reps all move under Priyansh Solanki now") -- deliberately
// per-field opt-in (a checkbox per row) rather than one shared form, since the
// whole point is that most fields on a bulk edit should stay untouched: only
// the checked fields overwrite anything, everything else keeps each person's
// own existing value. Runs sequentially through the same team_manual_save
// endpoint a single edit uses, so every person's change is still individually
// logged (with its own real before/after diff) and individually restorable
// from History -- a bulk edit is N real edits, not one big opaque action.
function BulkEditModal({ users, rosterNames, onClose, onDone }) {
  const [fields, setFields] = useState(() => {
    const base = {}
    MANUAL_FIELDS.forEach(f => { base[f.key] = { apply: false, value: '' } })
    return base
  })
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState(0)
  const [err, setErr] = useState('')

  const applyCount = Object.values(fields).filter(f => f.apply).length

  const run = async () => {
    setSaving(true); setErr(''); setProgress(0)
    const toApply = MANUAL_FIELDS.filter(f => fields[f.key].apply)
    let failed = 0
    for (const u of users) {
      const body = { ls_email: u.email, ls_name: u.name }
      MANUAL_FIELDS.forEach(f => { body[f.key] = (u.manual && u.manual[f.key]) || '' })
      toApply.forEach(f => { body[f.key] = fields[f.key].value })
      try {
        await fetchJson(API + '&mode=team_manual_save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      } catch { failed++ }
      setProgress(p => p + 1)
    }
    setSaving(false)
    if (failed) setErr(`${failed} of ${users.length} failed to save -- the rest went through. Check History for details.`)
    else onDone()
  }

  return (
    <Modal onClose={onClose} title={`Bulk edit — ${users.length} selected`} width={640}>
      <p style={{ fontSize: 12.5, color: C.muted, marginTop: 0 }}>
        Tick a field to apply ONE value to all {users.length} people. Anything left unticked keeps each
        person's own existing value. Keep this tab open until it finishes -- each save is logged and
        restorable individually in History, just like a single edit.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {MANUAL_FIELDS.map(f => {
          const on = fields[f.key].apply
          const setVal = v => setFields(p => ({ ...p, [f.key]: { ...p[f.key], value: v } }))
          return (
            <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="checkbox" checked={on}
                onChange={e => setFields(p => ({ ...p, [f.key]: { ...p[f.key], apply: e.target.checked } }))}
                style={{ width: 16, height: 16, flexShrink: 0, cursor: 'pointer' }}
              />
              <span style={{ fontSize: 12.5, fontWeight: 700, color: on ? C.text : C.muted, width: 112, flexShrink: 0 }}>{f.label}</span>
              <div style={{ flex: 1, opacity: on ? 1 : 0.5, pointerEvents: on ? 'auto' : 'none' }}>
                {f.suggest === 'role' ? (
                  <SuggestInput value={fields[f.key].value} onChange={setVal} suggestions={ROLE_SUGGESTIONS} placeholder="Value to apply to everyone selected…" />
                ) : f.suggest === 'roster' ? (
                  <SuggestInput value={fields[f.key].value} onChange={setVal} suggestions={rosterNames || []} placeholder="Value to apply to everyone selected…" />
                ) : (
                  <input style={inputStyle} value={fields[f.key].value} onChange={e => setVal(e.target.value)} placeholder="Value to apply to everyone selected…" />
                )}
              </div>
            </div>
          )
        })}
      </div>
      {saving && (
        <div style={{ marginTop: 16 }}>
          <div style={{ height: 6, borderRadius: 99, background: 'var(--bg3)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: (progress / users.length * 100) + '%', background: 'linear-gradient(90deg,#1F3C84,#1C9FD4)', borderRadius: 99, transition: 'width .2s ease' }} />
          </div>
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>{progress} of {users.length} saved…</div>
        </div>
      )}
      {err && <div style={{ color: '#B91C1C', fontSize: 12.5, marginTop: 12 }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button size="sm" onClick={run} disabled={saving || applyCount === 0}>{saving ? 'Applying…' : `Apply to ${users.length} people`}</Button>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- Import parsing

// RFC4180-ish single-line splitter (handles a quoted field containing the
// delimiter itself, e.g. a Centre Name of "Delhi, NCR" in a comma-delimited
// file) -- deliberately simple since this only ever runs on our own template's
// round-trip, a straight sheet paste, or a real CSV upload.
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

// A .xlsx/.xls file is a binary zip archive -- FileReader.readAsText() on one
// produces garbage (mostly control characters, no real line structure), which
// used to silently parse to "0 rows, 0 skipped" with no indication anything
// was wrong. Checked for up front so the real cause ("this isn't a text file")
// surfaces as an actual message instead of a mysteriously empty import.
function looksBinary(text) {
  if (text.includes('\x00')) return true
  if (/^PK\x03\x04/.test(text)) return true // .xlsx/.xls (zip) signature
  if (/^%PDF/.test(text)) return true
  const head = text.slice(0, 2000)
  const control = (head.match(/[\x00-\x08\x0E-\x1F]/g) || []).length
  return head.length > 0 && control / head.length > 0.05
}

// Accepts either a Ctrl+A/Ctrl+C paste straight out of the sheet (tab-delimited)
// or a comma-delimited CSV (the shape "Download template" produces and a real
// file upload carries) -- delimiter is auto-detected off the header line, then
// used consistently for every row. Rows with no recognizable email are skipped
// and counted, not silently dropped -- the summary after import states exactly
// what happened.
function parseImportText(text) {
  if (looksBinary(text)) return { rows: [], skipped: 0, unmapped: [], binary: true }
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length)
  if (lines.length < 2) return { rows: [], skipped: 0, unmapped: [], binary: false }
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
  return { rows, skipped, unmapped, binary: false, matchedHeaders: headerCells.length - unmapped.length, totalHeaders: headerCells.length }
}

// ---------------------------------------------------------------- Background import store

// There's no real background-job runner on Vercel serverless, so "runs in the
// background" means: a plain module-level object (same pattern SnapshotTool.jsx
// already uses for its own batch-capture progress) drives the row-by-row save
// loop, independent of any React component's mount state -- closing the Bulk
// Import modal (or navigating to the Sales Groups tab) does NOT stop it, since
// nothing about this object is tied to a component instance. It also PATCHes a
// row in team_mapping_activity every few saves, so progress is visible from the
// History panel even if this exact browser tab is later closed and reopened.
const importStore = {
  running: false,
  progress: null, // { done, total, failed, skipped, label }
  listeners: new Set(),
  set(patch) { Object.assign(this, patch); this.listeners.forEach(l => l()) },
  subscribe(l) { this.listeners.add(l); return () => this.listeners.delete(l) },
}

async function runImportInBackground(rows, label, skippedCount, onSettled) {
  if (importStore.running) return
  importStore.set({ running: true, progress: { done: 0, total: rows.length, failed: 0, skipped: skippedCount, label } })

  let activity = null
  try {
    activity = await fetchJson(API + '&mode=team_activity_create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'import', label, total: rows.length, status: 'running' }),
    })
  } catch { /* logging failing shouldn't block the actual import */ }

  let done = 0, failed = 0
  for (const row of rows) {
    let rowOk = true
    try {
      // skipActivityLog: a 285-row import would otherwise write 285 individual
      // per-person "edit" entries on top of this loop's own aggregate "import"
      // progress row -- the overall import is what's worth showing per-row in
      // History; each row's own before/after is still saved to
      // team_mapping_manual exactly as normal, just not separately logged.
      await fetchJson(API + '&mode=team_manual_save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...row, skipActivityLog: true }),
      })
      done++
    } catch { failed++; rowOk = false }
    // Set on every single row, not batched -- this is what makes the History
    // page's "live" card genuinely update one row at a time while the tab that
    // started the import stays open, rather than jumping in chunks. currentRow
    // is who was JUST processed (not who's next), so the UI reads as "here's
    // what just happened" rather than a name that hasn't actually saved yet.
    importStore.set({ progress: { done: done + failed, total: rows.length, failed, skipped: skippedCount, label, currentRow: row.ls_email, currentRowOk: rowOk } })
    if (activity && (done + failed) % 5 === 0) {
      fetchJson(API + '&mode=team_activity_update', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: activity.id, done, failed, skipped: skippedCount }),
      }).catch(() => {})
    }
  }
  if (activity) {
    fetchJson(API + '&mode=team_activity_update', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: activity.id, done, failed, skipped: skippedCount, status: failed && !done ? 'failed' : 'done' }),
    }).catch(() => {})
  }
  importStore.set({ running: false, progress: null })
  if (onSettled) onSettled({ done, failed, skipped: skippedCount })
}

function useImportProgress() {
  const [state, setState] = useState({ running: importStore.running, progress: importStore.progress })
  useEffect(() => {
    const sync = () => setState({ running: importStore.running, progress: importStore.progress })
    sync()
    return importStore.subscribe(sync)
  }, [])
  return state
}

async function logExportActivity(kind, rows) {
  try {
    await fetchJson(API + '&mode=team_activity_create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'export', label: kind, total: rows, done: rows, status: 'done' }),
    })
  } catch { /* export already happened client-side either way -- logging is best-effort */ }
}

// ---------------------------------------------------------------- Bulk import modal

function BulkImportModal({ onClose, onStarted }) {
  const [parsed, setParsed] = useState(null) // result of parseImportText, once a file/paste is loaded
  const [label, setLabel] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [showPaste, setShowPaste] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const fileRef = useRef(null)

  const loadFile = file => {
    if (!file) return
    setLabel(file.name)
    const reader = new FileReader()
    reader.onload = ev => setParsed(parseImportText(String(ev.target.result || '')))
    reader.readAsText(file)
  }

  const onDrop = e => {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files && e.dataTransfer.files[0]
    loadFile(file)
  }

  const startImport = () => {
    if (!parsed || !parsed.rows.length) return
    runImportInBackground(parsed.rows, label || 'pasted rows', parsed.skipped)
    onStarted()
  }

  return (
    <Modal onClose={onClose} title="Bulk import" width={640}>
      <p style={{ fontSize: 12.5, color: C.muted, marginTop: 0 }}>
        One-time seed, meant for the private "Akash - Squad Mapping" sheet's existing data. Matching
        is by header name (see the template), so hidden/reordered columns are fine.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <Button variant="ghost" size="sm" onClick={downloadTemplate}>Download template (CSV)</Button>
      </div>

      {!parsed && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current && fileRef.current.click()}
          style={{
            border: '1.5px dashed ' + (dragOver ? C.blue : C.border), borderRadius: 12, padding: '30px 20px',
            textAlign: 'center', cursor: 'pointer', background: dragOver ? C.blueBg : 'var(--bg3)', transition: 'background .15s, border-color .15s',
          }}
        >
          <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, marginBottom: 4 }}>Drop a CSV file here, or click to browse</div>
          <div style={{ fontSize: 11.5, color: C.muted }}>.csv, .tsv or .txt — first row must be real column headers</div>
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" onChange={e => loadFile(e.target.files && e.target.files[0])} style={{ display: 'none' }} />
        </div>
      )}

      {parsed && parsed.binary && (
        <div style={{ padding: '12px 14px', borderRadius: 10, background: '#FEF2F2', border: '0.5px solid #FECACA', color: '#B91C1C', fontSize: 12.5 }}>
          "{label}" doesn't look like a text CSV — if this is an Excel file, use File → Save As → CSV (Comma delimited) first, then upload that.
          <div style={{ marginTop: 8 }}><Button variant="ghost" size="sm" onClick={() => { setParsed(null); setLabel('') }}>Try another file</Button></div>
        </div>
      )}

      {parsed && !parsed.binary && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{label}</div>
            <Button variant="ghost" size="sm" onClick={() => { setParsed(null); setLabel('') }}>Choose a different file</Button>
          </div>
          {parsed.rows.length === 0 ? (
            <div style={{ padding: '12px 14px', borderRadius: 10, background: '#FEF2F2', border: '0.5px solid #FECACA', color: '#B91C1C', fontSize: 12.5 }}>
              No rows had a recognizable email column. Check the header row matches one of the names in the downloaded template (e.g. "Associate Mail ID").
              {parsed.unmapped.length > 0 && <div style={{ marginTop: 6 }}>Unrecognized headers found: {parsed.unmapped.join(', ')}</div>}
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12.5, color: C.text, marginBottom: 10 }}>
                <b>{parsed.rows.length}</b> row(s) ready to import{parsed.skipped > 0 && <>, <b>{parsed.skipped}</b> skipped (no email matched)</>}.
                {parsed.unmapped.length > 0 && <> Ignored column(s): {parsed.unmapped.join(', ')}.</>}
              </div>
              <div style={{ overflowX: 'auto', border: '0.5px solid ' + C.border, borderRadius: 10, marginBottom: 14 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg3)' }}>
                      {Object.keys(parsed.rows[0]).map(k => (
                        <th key={k} style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 800, color: C.muted, textTransform: 'uppercase', fontSize: 10, whiteSpace: 'nowrap' }}>{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.slice(0, 3).map((row, i) => (
                      <tr key={i} style={{ borderTop: '0.5px solid ' + C.border }}>
                        {Object.keys(parsed.rows[0]).map(k => (
                          <td key={k} style={{ padding: '7px 10px', color: C.text, whiteSpace: 'nowrap' }}>{row[k] || '—'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsed.rows.length > 3 && <div style={{ padding: '6px 10px', fontSize: 11, color: C.muted }}>+ {parsed.rows.length - 3} more row(s)</div>}
              </div>
            </>
          )}
        </div>
      )}

      {!parsed && (
        <div style={{ marginTop: 12 }}>
          {!showPaste ? (
            <span onClick={() => setShowPaste(true)} style={{ fontSize: 12, color: C.blue, fontWeight: 700, cursor: 'pointer' }}>Or paste rows instead</span>
          ) : (
            <>
              <textarea
                value={pasteText} onChange={e => setPasteText(e.target.value)} placeholder="Paste tab- or comma-separated rows here…"
                style={{ ...inputStyle, height: 100, fontFamily: 'monospace', fontSize: 11.5, resize: 'vertical' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <Button variant="ghost" size="sm" onClick={() => { setLabel('pasted rows'); setParsed(parseImportText(pasteText)) }} disabled={!pasteText.trim()}>Parse pasted rows</Button>
              </div>
            </>
          )}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        <Button size="sm" onClick={startImport} disabled={!parsed || parsed.binary || !parsed.rows.length}>
          {parsed && parsed.rows.length ? `Import ${parsed.rows.length} row(s) in background` : 'Import'}
        </Button>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- History page

function statusColor(status) {
  if (status === 'done') return C.green
  if (status === 'failed') return C.navy // brand rule: never red/amber on a data element -- navy reads as "needs attention" everywhere else in this app (delta pills, etc.)
  return C.blue
}
function statusBg(status) {
  if (status === 'done') return C.greenBg
  if (status === 'failed') return C.navyBg
  return C.blueBg
}
const TYPE_ICON = {
  import: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>,
  export: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>,
  edit: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z" /></svg>,
  delete: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>,
  restore: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" /></svg>,
}
const TYPE_ICON_COLOR = { import: [C.navy, C.navyBg], export: [C.cyan, C.cyanBg], edit: [C.blue, C.blueBg], delete: [C.navy, C.navyBg], restore: [C.green, C.greenBg] }
const FIELD_LABELS = { asm_sm: 'ASM/SM', asm_sm_email: 'ASM/SM Email', ssm: 'SSM', ssm_email: 'SSM Email', role: 'Role', level: 'Level', country: 'Country', centre_name: 'Centre Name' }

// Renders the "what actually changed" body of one history row -- a field-by-
// field before/after list for an edit/restore, or the set of fields a delete
// removed. Parsed from `detail`, a JSON string (see diffTeamManualFields /
// deleteTeamManual / restoreTeamManual in api/crm-leads.js for what's inside).
function ActivityDetail({ row }) {
  let detail
  try { detail = JSON.parse(row.detail || '{}') } catch { detail = {} }
  if ((row.type === 'edit' || row.type === 'restore') && detail.changes) {
    const fields = Object.keys(detail.changes)
    if (!fields.length) return null
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 4 }}>
        {fields.map(f => {
          const { from, to } = detail.changes[f]
          return (
            <div key={f} style={{ fontSize: 11.5 }}>
              <span style={{ color: C.muted, fontWeight: 700 }}>{FIELD_LABELS[f] || f}:</span>{' '}
              <span style={{ color: from ? C.muted : C.muted, textDecoration: from ? 'line-through' : 'none' }}>{from || '(empty)'}</span>
              {' → '}
              <span style={{ color: C.text, fontWeight: 700 }}>{to || '(empty)'}</span>
            </div>
          )
        })}
      </div>
    )
  }
  if (row.type === 'delete' && detail.snapshot) {
    const fields = TEAM_MANUAL_FIELDS_DISPLAY.filter(f => detail.snapshot[f])
    if (!fields.length) return null
    return (
      <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4 }}>
        Removed: {fields.map(f => `${FIELD_LABELS[f] || f} = ${detail.snapshot[f]}`).join(' · ')}
      </div>
    )
  }
  return null
}
const TEAM_MANUAL_FIELDS_DISPLAY = ['role', 'asm_sm', 'asm_sm_email', 'ssm', 'ssm_email', 'level', 'country', 'centre_name']

// The one card on this page that updates live, one row at a time, while an
// import driven by THIS browser tab is running -- reads importStore directly
// (via useImportProgress), not the polled Supabase list below, so there is no
// network round-trip between a row saving and this card reflecting it.
function LiveImportCard({ progress }) {
  const pct = progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0
  return (
    <div style={{
      borderRadius: 16, padding: '20px 24px', marginBottom: 20, position: 'relative', overflow: 'hidden',
      background: 'linear-gradient(135deg, rgba(31,60,132,0.06), rgba(28,159,212,0.06))',
      border: '1px solid rgba(28,159,212,0.25)', boxShadow: '0 8px 24px -12px rgba(31,60,132,0.25)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ position: 'relative', width: 9, height: 9, flexShrink: 0 }}>
          <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: C.blue, animation: 'teamMapPulse 1.4s ease-out infinite' }} />
          <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: C.blue }} />
        </span>
        <span style={{ fontSize: 11, fontWeight: 800, color: C.blue, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Importing now</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{progress.label}</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.navy, fontVariantNumeric: 'tabular-nums' }}>
          {fmtN(progress.done)} <span style={{ fontSize: 13, fontWeight: 700, color: C.muted }}>/ {fmtN(progress.total)}</span>
        </div>
      </div>
      <div style={{ height: 10, borderRadius: 99, background: 'rgba(31,60,132,0.10)', overflow: 'hidden', marginBottom: 10 }}>
        <div style={{ height: '100%', width: pct + '%', borderRadius: 99, background: 'linear-gradient(90deg,#1F3C84,#1C9FD4)', transition: 'width .25s ease', boxShadow: '0 0 8px rgba(28,159,212,0.5)' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 12, color: C.muted }}>
          {progress.currentRow && (
            <>Just saved <b style={{ color: progress.currentRowOk ? C.text : C.navy }}>{progress.currentRow}</b>{!progress.currentRowOk && ' (failed)'}</>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 700 }}>{pct}% complete · {progress.failed} failed · {progress.skipped} skipped</div>
      </div>
    </div>
  )
}

function HistoryTab({ onBack }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [restoringId, setRestoringId] = useState(null)
  const { running, progress } = useImportProgress()
  const wasRunning = useRef(false)

  const load = useCallback(() => {
    fetchJson(API + '&mode=team_activity_list').then(d => { setRows(d.rows || []); setError('') }).catch(e => setError(String(e.message || e)))
  }, [])

  const restore = async row => {
    if (!window.confirm(`Restore ${row.target_email} to its state before this ${row.type}?`)) return
    setRestoringId(row.id)
    try {
      await fetchJson(API + '&mode=team_manual_restore', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activity_id: row.id }),
      })
      load()
    } catch (e) { window.alert('Could not restore: ' + (e.message || e)) } finally { setRestoringId(null) }
  }

  useEffect(() => { load() }, [load])

  useEffect(() => {
    // Polls the persisted log while an import is running elsewhere (e.g. this
    // tab reloaded mid-import, or a teammate's own import in a different tab
    // shares this same Supabase row) -- the live card above already covers
    // real-time detail for an import THIS tab started.
    if (!running) return
    const t = setInterval(load, 2500)
    return () => clearInterval(t)
  }, [load, running])

  useEffect(() => {
    // A fire-and-forget final PATCH can still be in flight the instant
    // `running` flips to false, so one more load (with a short delay) after
    // the transition makes sure the just-finished run's "done" status and
    // final counts actually land here instead of showing stale "running".
    if (wasRunning.current && !running) { load(); setTimeout(load, 900) }
    wasRunning.current = running
  }, [running, load])

  const stats = useMemo(() => {
    const list = rows || []
    const imports = list.filter(r => r.type === 'import')
    const exports = list.filter(r => r.type === 'export')
    const edits = list.filter(r => r.type === 'edit' || r.type === 'restore')
    const deletes = list.filter(r => r.type === 'delete')
    const rowsMapped = imports.reduce((s, r) => s + (r.done || 0), 0)
    return { totalImports: imports.length, totalExports: exports.length, totalEdits: edits.length + deletes.length, rowsMapped, lastActivity: list[0]?.created_at || null }
  }, [rows])

  // A genuine fetch failure (almost always: the table doesn't exist yet)
  // reads completely differently from "the table exists and is just empty" --
  // conflating the two ("Nothing yet") is exactly what made two real imports
  // look like they'd vanished. `error` only ever holds the former.
  const notSetUp = !!error

  return (
    <div>
      <style>{`@keyframes teamMapPulse { 0% { transform: scale(1); opacity: 0.7 } 100% { transform: scale(2.6); opacity: 0 } }`}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <Button variant="ghost" size="sm" onClick={onBack} icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        }>Back to Roster</Button>
      </div>

      {notSetUp ? (
        <div style={{ padding: '16px 20px', borderRadius: 12, background: C.navyBg, border: '1px solid rgba(31,60,132,0.2)', marginBottom: 20 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: C.navy, marginBottom: 4 }}>History isn't set up yet</div>
          <div style={{ fontSize: 12.5, color: C.text }}>
            Run <code style={{ background: 'var(--bg3)', padding: '1px 6px', borderRadius: 5 }}>supabase/sql/team_mapping_activity_setup.sql</code> once
            in the Supabase SQL editor. Imports, exports and edits already happen normally either way — this only affects whether they're logged here.
          </div>
        </div>
      ) : (
        <StatStrip items={[
          { label: 'Total Imports', value: fmtN(stats.totalImports), sub: 'all-time runs' },
          { label: 'Rows Mapped', value: fmtN(stats.rowsMapped), sub: 'across every import' },
          { label: 'Edits & Deletes', value: fmtN(stats.totalEdits), sub: 'manual changes, all-time' },
          { label: 'Last Activity', value: stats.lastActivity ? new Date(stats.lastActivity).toLocaleDateString() : '—', sub: stats.lastActivity ? new Date(stats.lastActivity).toLocaleTimeString() : 'nothing yet' },
        ]} />
      )}

      {running && progress && <LiveImportCard progress={progress} />}

      <Card title="All activity" sub="Imports, exports, edits, deletes and restores — most recent first" noPad>
        {!rows && !notSetUp ? <div style={{ padding: 32 }}><InlineLoader label="Loading history" height={140} /></div> : notSetUp ? null : rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: C.muted, fontSize: 13.5 }}>Nothing yet — imports, exports and edits will show up here.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {rows.map((r, i) => {
              const isLiveRow = running && progress && r.type === 'import' && r.status === 'running'
              const d = isLiveRow ? progress.done : (r.done || 0)
              const failed = isLiveRow ? progress.failed : (r.failed || 0)
              const total = isLiveRow ? progress.total : (r.total || 0)
              const status = isLiveRow ? 'running' : r.status
              const pct = total > 0 ? Math.round(((d + failed) / total) * 100) : 100
              const [iconColor, iconBg] = TYPE_ICON_COLOR[r.type] || TYPE_ICON_COLOR.import
              const canRestore = (r.type === 'edit' || r.type === 'delete' || r.type === 'restore') && r.target_email
              return (
                <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '16px 22px', borderTop: i === 0 ? 'none' : '0.5px solid ' + C.border }}>
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: iconBg, color: iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                    {TYPE_ICON[r.type] || TYPE_ICON.import}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{r.type}</span>
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label || '—'}</span>
                      <span style={{ fontSize: 10, fontWeight: 800, color: statusColor(status), background: statusBg(status), padding: '2px 8px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>{status}</span>
                    </div>
                    {r.type === 'import' && (
                      <div style={{ height: 6, borderRadius: 99, background: 'var(--bg3)', overflow: 'hidden', marginBottom: 5, maxWidth: 360 }}>
                        <div style={{ height: '100%', width: pct + '%', borderRadius: 99, background: statusColor(status), transition: 'width .25s ease' }} />
                      </div>
                    )}
                    <div style={{ fontSize: 11.5, color: C.muted }}>
                      {r.type === 'import' ? `${fmtN(d)} done, ${fmtN(failed)} failed, ${fmtN(r.skipped || 0)} skipped of ${fmtN(total)}`
                        : r.type === 'export' ? `${fmtN(r.total || 0)} row(s) exported`
                        : null}
                    </div>
                    <ActivityDetail row={r} />
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 11.5, color: C.muted, flexShrink: 0 }}>
                    <div style={{ fontWeight: 700, color: C.text }}>{r.created_by || 'unknown'}</div>
                    <div style={{ marginBottom: canRestore ? 6 : 0 }}>{r.created_at ? new Date(r.created_at).toLocaleString() : ''}</div>
                    {canRestore && (
                      <Button variant="ghost" size="sm" onClick={() => restore(r)} disabled={restoringId === r.id}>
                        {restoringId === r.id ? 'Restoring…' : 'Restore'}
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------- Roster tab

function RosterTab({ isAdmin, onOpenHistory, registerRefresh }) {
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
  const [showBulkEdit, setShowBulkEdit] = useState(false)
  // Selection is by email (a stable, human-meaningful key) rather than the
  // LeadSquared numeric id -- so it reads sensibly if this ever needs to
  // survive a refresh, and matches what team_manual_save keys on anyway.
  const [selected, setSelected] = useState(() => new Set())
  const { running: importRunning, progress: importProgress } = useImportProgress()
  // Phone/Airtel/Reporting-Manager are live but per-user calls (LeadSquared has
  // no bulk "by many ids" variant) -- fetched only for whichever ~50 rows are
  // actually on screen, cached by id so paging back to an already-seen page is
  // instant, mirroring the same page-scoped lazy-load pattern this app already
  // uses for Meta Ads creative thumbnails (same rate-limit-avoidance reasoning).
  const [detailCache, setDetailCache] = useState({})

  const load = useCallback(() => {
    setLoading(true); setError('')
    fetchJson(API + '&mode=team_users')
      .then(d => setData(d))
      .catch(e => setError(String(e.message || e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])
  // Refresh now lives in the page header (not this tab's own filter toolbar),
  // so the header's one button needs a way to reach whichever tab is active.
  useEffect(() => { registerRefresh(load) }, [registerRefresh, load])
  // A background import finishing (possibly after this tab's modal was already
  // closed) should refresh the "Manually Mapped" count and table without the
  // admin having to remember to hit Refresh themselves. Guarded on a true->false
  // transition specifically (not just "whenever not running"), which would
  // otherwise also match the very first render -- before any import has ever
  // started -- and double up the initial load above for no reason.
  const wasImporting = useRef(false)
  useEffect(() => {
    if (wasImporting.current && !importRunning) load()
    wasImporting.current = importRunning
  }, [importRunning, load])

  const rows = data?.rows || []
  const roleOptions = useMemo(() => ['All', ...Array.from(new Set(rows.map(r => r.role).filter(Boolean))).sort()], [rows])
  const groupOptions = useMemo(() => {
    const s = new Set()
    rows.forEach(r => (r.groups || []).forEach(g => s.add(g)))
    return ['All', ...Array.from(s).sort()]
  }, [rows])
  // Live names, for the ASM/SM and SSM type-ahead in the edit/bulk-edit
  // modals -- see MANUAL_FIELDS' suggest:'roster' comment.
  const rosterNames = useMemo(() => Array.from(new Set(rows.map(r => r.name).filter(Boolean))).sort(), [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (roleFilter !== 'All' && r.role !== roleFilter) return false
      if (statusFilter !== 'All' && r.status !== statusFilter) return false
      if (groupFilter !== 'All' && !(r.groups || []).includes(groupFilter)) return false
      if (mappedFilter === 'Mapped' && !r.manual) return false
      if (mappedFilter === 'Unmapped' && r.manual) return false
      if (mappedFilter === 'Stale (90+ days)' && !isStaleMapping(r.manual)) return false
      if (q && !((r.name || '').toLowerCase().includes(q) || (r.email || '').toLowerCase().includes(q))) return false
      return true
    })
  }, [rows, search, roleFilter, statusFilter, groupFilter, mappedFilter])

  useEffect(() => { setPage(1) }, [search, roleFilter, statusFilter, groupFilter, mappedFilter])
  // Selection follows filtering: a person filtered out of view (a status
  // change, a search edit) drops out of the selection too, so "apply to N
  // selected" never silently includes someone no longer on screen.
  useEffect(() => {
    const visible = new Set(filtered.map(r => r.email))
    setSelected(prev => {
      const next = new Set([...prev].filter(e => visible.has(e)))
      return next.size === prev.size ? prev : next
    })
  }, [filtered])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_ROWS))
  const pageRows = filtered.slice((page - 1) * PAGE_ROWS, page * PAGE_ROWS)

  useEffect(() => {
    const missing = pageRows.filter(r => !detailCache[r.id]).map(r => r.id)
    if (!missing.length) return
    fetchJson(API + '&mode=team_user_detail&ids=' + missing.map(encodeURIComponent).join(','))
      .then(d => {
        const next = {}
        ;(d.details || []).forEach(det => { next[det.id] = det })
        setDetailCache(p => ({ ...p, ...next }))
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageRows])

  const kpis = useMemo(() => {
    const active = rows.filter(r => r.status === 'Active').length
    const mapped = rows.filter(r => r.manual).length
    const stale = rows.filter(r => isStaleMapping(r.manual)).length
    const groupCount = groupOptions.length - 1
    return { total: rows.length, active, mapped, stale, groupCount }
  }, [rows, groupOptions])

  const selectedRows = useMemo(() => filtered.filter(r => selected.has(r.email)), [filtered, selected])
  const toggleOne = email => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(email)) next.delete(email); else next.add(email)
    return next
  })
  const pageAllSelected = pageRows.length > 0 && pageRows.every(r => selected.has(r.email))
  const togglePage = () => setSelected(prev => {
    const next = new Set(prev)
    if (pageAllSelected) pageRows.forEach(r => next.delete(r.email))
    else pageRows.forEach(r => next.add(r.email))
    return next
  })

  if (loading) return <InlineLoader label="Loading LeadSquared roster" />
  if (error) return <div style={{ padding: '10px 14px', borderRadius: 10, background: '#FEF2F2', border: '0.5px solid #FECACA', color: '#B91C1C', fontSize: 12.5 }}>✕ {error}</div>

  return (
    <div>
      <StatStrip items={[
        { label: 'Total People', value: fmtN(kpis.total), sub: 'LeadSquared, real-time' },
        { label: 'Active', value: fmtN(kpis.active), sub: fmtN(kpis.total - kpis.active) + ' inactive' },
        { label: 'Sales Groups', value: fmtN(kpis.groupCount), sub: 'reconstructed from membership' },
        { label: 'Manually Mapped', value: fmtN(kpis.mapped), sub: fmtN(kpis.total - kpis.mapped) + ' not yet mapped' },
        { label: 'Stale (90+ days)', value: fmtN(kpis.stale), sub: 'not confirmed recently' },
      ]} />

      {importRunning && importProgress && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderRadius: 10, background: C.blueBg, marginBottom: 12, fontSize: 12.5, color: C.navy, fontWeight: 700 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.blue, flexShrink: 0 }} />
          Importing "{importProgress.label}" in background — {importProgress.done} of {importProgress.total}
          <span onClick={onOpenHistory} style={{ marginLeft: 'auto', cursor: 'pointer', color: C.blue, textDecoration: 'underline' }}>View progress</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ position: 'relative', flex: '1 1 260px', minWidth: 220, maxWidth: 380 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2.2" strokeLinecap="round" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            value={search} onChange={e => setSearch(e.target.value)} placeholder="Find someone by name or email…"
            style={{ ...inputStyle, width: '100%', padding: '9px 12px 9px 32px', fontSize: 13.5 }}
          />
        </div>
        <Dropdown label="LS Role" options={roleOptions} value={roleFilter} onChange={setRoleFilter} minWidth={130} />
        <Dropdown label="Status" options={['All', 'Active', 'Inactive']} value={statusFilter} onChange={setStatusFilter} minWidth={110} />
        <Dropdown label="Group" options={groupOptions} value={groupFilter} onChange={setGroupFilter} minWidth={160} />
        <Dropdown label="Mapping" options={['All', 'Mapped', 'Unmapped', 'Stale (90+ days)']} value={mappedFilter} onChange={setMappedFilter} minWidth={140} />
        <div style={{ flex: 1 }} />
        {isAdmin && <Button size="sm" icon={<UploadIcon />} onClick={() => setShowImport(true)}>Bulk import</Button>}
        <ExportButton
          hideSlack hideJson hideSheets
          filename="team-mapping-roster"
          onExported={({ rows: n }) => logExportActivity('Roster CSV', n)}
          data={filtered.map(r => {
            const d = detailCache[r.id]
            return {
              Name: r.name, Email: r.email, 'LS Role': (r.role || '').replace(/_/g, ' '), Status: r.status,
              Groups: (r.groups || []).join('; '),
              Phone: d?.phoneMain || '', Airtel: d?.airtelNumber || '',
              'Reporting Manager': d?.managerName || '', 'Reporting Manager Email': d?.managerEmail || '',
              'ASM/SM': r.manual?.asm_sm || '', 'ASM/SM Email': r.manual?.asm_sm_email || '',
              SSM: r.manual?.ssm || '', 'SSM Email': r.manual?.ssm_email || '',
              Role: r.manual?.role || '', Level: r.manual?.level || '', Country: r.manual?.country || '',
              'Centre Name': r.manual?.centre_name || '',
            }
          })}
        />
        <Button variant="ghost" size="sm" icon={<ClockIcon />} onClick={onOpenHistory}>History</Button>
      </div>

      <p style={{ fontSize: 11.5, color: C.muted, marginTop: -4, marginBottom: 12 }}>
        Name / Email / LS Role / Status / Groups / Phone / Airtel / Reporting Manager are all live
        from LeadSquared, real-time. Phone, Airtel and Reporting Manager load per page (LeadSquared
        has no bulk endpoint for them), so they show "…" for a moment on a page you haven't opened
        yet. ASM/SM, SSM, Role, Level, Country and Centre Name are the only manually entered fields.
      </p>

      {isAdmin && selected.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '9px 16px', borderRadius: 10,
          background: C.navyBg, marginBottom: 12, fontSize: 12.5, fontWeight: 700, color: C.navy,
        }}>
          <span>{selected.size} selected</span>
          <Button size="sm" onClick={() => setShowBulkEdit(true)}>Bulk edit</Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear selection</Button>
        </div>
      )}

      <Card title={`${fmtN(filtered.length)} people`} sub={`Page ${page} of ${totalPages}`} noPad>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 1000 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid ' + C.border }}>
                {isAdmin && (
                  <th style={{ padding: '9px 8px 9px 14px', width: 30 }}>
                    <input type="checkbox" checked={pageAllSelected} onChange={togglePage} style={{ width: 15, height: 15, cursor: 'pointer' }} title="Select everyone on this page" />
                  </th>
                )}
                {['Name', 'Email', 'LS Role', 'Status', 'Groups', 'Phone', 'Airtel', 'LS Manager', 'ASM/SM', 'SSM', 'Role', 'Country', 'Centre', 'Mapping'].map(h => (
                  <th key={h} style={{ padding: '9px 12px', fontSize: 10.5, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r, i) => {
                const d = detailCache[r.id]
                const pending = !d
                const stale = isStaleMapping(r.manual)
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid ' + C.border, background: i % 2 ? 'transparent' : 'var(--bg3)' }}>
                    {isAdmin && (
                      <td style={{ padding: '10px 8px 10px 14px' }}>
                        <input type="checkbox" checked={selected.has(r.email)} onChange={() => r.email && toggleOne(r.email)} disabled={!r.email} style={{ width: 15, height: 15, cursor: r.email ? 'pointer' : 'default' }} />
                      </td>
                    )}
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <Avatar name={r.name} />
                        <span style={{ fontWeight: 700, color: C.text }}>{r.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '9px 12px', color: C.muted, whiteSpace: 'nowrap' }}>{r.email || '—'}</td>
                    <td style={{ padding: '9px 12px', color: C.text, whiteSpace: 'nowrap' }}>{(r.role || '').replace(/_/g, ' ')}</td>
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}><StatusBadge status={r.status} /></td>
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}><GroupsButton groups={r.groups} /></td>
                    <td style={{ padding: '9px 12px', color: C.text, whiteSpace: 'nowrap' }}>{pending ? '…' : (d.phoneMain || '—')}</td>
                    <td style={{ padding: '9px 12px', color: C.text, whiteSpace: 'nowrap' }}>{pending ? '…' : (d.airtelNumber || '—')}</td>
                    <td style={{ padding: '9px 12px', color: C.text, whiteSpace: 'nowrap' }} title={pending ? '' : (d.managerEmail || '')}>{pending ? '…' : (d.managerName || '—')}</td>
                    <td style={{ padding: '9px 12px', color: C.text, whiteSpace: 'nowrap' }}>{r.manual?.asm_sm || '—'}</td>
                    <td style={{ padding: '9px 12px', color: C.text, whiteSpace: 'nowrap' }}>{r.manual?.ssm || '—'}</td>
                    <td style={{ padding: '9px 12px', color: C.text, whiteSpace: 'nowrap' }}>{r.manual?.role || '—'}</td>
                    <td style={{ padding: '9px 12px', color: C.text, whiteSpace: 'nowrap' }}>{r.manual?.country || '—'}</td>
                    <td style={{ padding: '9px 12px', color: C.text, whiteSpace: 'nowrap' }}>{r.manual?.centre_name || '—'}</td>
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Button size="sm" variant={r.manual ? 'secondary' : 'primary'} onClick={() => setEditUser(r)}>{r.manual ? 'Edit' : 'Map'}</Button>
                        {stale && <span style={{ fontSize: 10, fontWeight: 800, color: C.navy, background: C.navyBg, padding: '2px 7px', borderRadius: 999, whiteSpace: 'nowrap' }} title="Not confirmed in 90+ days">Stale</span>}
                      </div>
                    </td>
                  </tr>
                )
              })}
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
          rosterNames={rosterNames}
          onClose={() => setEditUser(null)}
          onSaved={saved => {
            setData(d => ({ ...d, rows: d.rows.map(r => r.email === editUser.email ? { ...r, manual: saved } : r) }))
            setEditUser(null)
          }}
        />
      )}
      {showImport && (
        <BulkImportModal
          onClose={() => setShowImport(false)}
          onStarted={() => { setShowImport(false); onOpenHistory() }}
        />
      )}
      {showBulkEdit && (
        <BulkEditModal
          users={selectedRows}
          rosterNames={rosterNames}
          onClose={() => setShowBulkEdit(false)}
          onDone={() => { setShowBulkEdit(false); setSelected(new Set()); load() }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Groups tab

function GroupsTab({ registerRefresh }) {
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
  useEffect(() => { registerRefresh(load) }, [registerRefresh, load])

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
        <ExportButton
          hideSlack hideJson hideSheets
          filename="team-mapping-groups"
          onExported={({ rows: n }) => logExportActivity('Groups CSV', n)}
          data={filtered.map(g => ({ Group: g.name, Members: g.memberCount }))}
        />
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

// ---------------------------------------------------------------- Connectors tab

function ConnectorField({ label, hint, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{hint}</span>}
    </label>
  )
}
function ConnectorStatus({ status, at }) {
  if (!status) return <span style={{ fontSize: 11.5, color: C.muted }}>Never run</span>
  const ok = status.indexOf('ok') === 0
  return (
    <span style={{ fontSize: 11.5, fontWeight: 700, color: ok ? C.green : C.navy }}>
      {status}{at && <span style={{ color: C.muted, fontWeight: 500 }}> · {new Date(at).toLocaleString()}</span>}
    </span>
  )
}
const enableRowStyle = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 12.5, fontWeight: 700, color: C.text, cursor: 'pointer' }

// Turns this page from a dead end into a real source of team mapping (the
// user's own framing) -- four independent, individually-toggleable pushes
// fire on every save/delete/restore/finished import: a webhook, a Slack
// notification, a live Google Sheet mirror, and a pull-based read-only API
// for a script to hit on its own schedule. Admin-only, same as Bulk import --
// see api/crm-leads.js's notifyTeamMappingConnectors for the actual firing.
function ConnectorsTab() {
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState('')
  const [testing, setTesting] = useState('')
  const [msg, setMsg] = useState('')
  const [copied, setCopied] = useState(false)

  const load = useCallback(() => {
    fetchJson(API + '&mode=team_connectors_get').then(setForm).catch(() => setForm({}))
  }, [])
  useEffect(() => { load() }, [load])

  const save = async (which, patch) => {
    setSaving(which); setMsg('')
    try {
      const saved = await fetchJson(API + '&mode=team_connectors_save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
      setForm(saved)
    } catch (e) { setMsg('Could not save: ' + (e.message || e)) } finally { setSaving('') }
  }
  const test = async which => {
    setTesting(which); setMsg('')
    try {
      const saved = await fetchJson(API + '&mode=team_connectors_test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ which }) })
      setForm(saved)
    } catch (e) { setMsg('Test failed: ' + (e.message || e)) } finally { setTesting('') }
  }
  const regenerateKey = async () => {
    if (form.api_key && !window.confirm('Generate a new key? Any integration still using the old one will stop working immediately.')) return
    setSaving('api')
    try { setForm(await fetchJson(API + '&mode=team_connectors_regenerate_key', { method: 'POST' })) }
    catch (e) { setMsg('Could not generate a key: ' + (e.message || e)) } finally { setSaving('') }
  }
  const copy = text => { if (navigator.clipboard) navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }

  if (!form) return <InlineLoader label="Loading connector settings" />
  const pullUrl = form.api_key ? `${window.location.origin}${API}&mode=team_export_pull&api_key=${form.api_key}` : ''

  return (
    <div>
      <p style={{ fontSize: 12.5, color: C.muted, marginTop: 0, marginBottom: 18, maxWidth: 760 }}>
        Makes this page a real source of team mapping instead of a dead end -- every save, delete,
        restore or finished bulk import can push out to any of these four, independently. All four
        deliberately exclude Phone/Airtel/Reporting Manager -- those need one LeadSquared call PER
        PERSON, fine for a table page's worth of rows, too expensive on every single edit.
      </p>
      {msg && <div style={{ padding: '9px 14px', borderRadius: 8, background: C.navyBg, color: C.navy, fontSize: 12.5, fontWeight: 700, marginBottom: 16 }}>{msg}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 16 }}>
        <Card title="Webhook" sub="POST a JSON payload to your own URL">
          <label style={enableRowStyle}>
            <input type="checkbox" checked={!!form.webhook_enabled} onChange={e => setForm(p => ({ ...p, webhook_enabled: e.target.checked }))} style={{ width: 15, height: 15 }} />
            Enabled
          </label>
          <ConnectorField label="Webhook URL">
            <input style={inputStyle} value={form.webhook_url || ''} onChange={e => setForm(p => ({ ...p, webhook_url: e.target.value }))} placeholder="https://…" />
          </ConnectorField>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
            <ConnectorStatus status={form.webhook_last_status} at={form.webhook_last_at} />
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="ghost" size="sm" onClick={() => test('webhook')} disabled={testing === 'webhook' || !form.webhook_url}>{testing === 'webhook' ? 'Testing…' : 'Send test'}</Button>
              <Button size="sm" onClick={() => save('webhook', { webhook_enabled: form.webhook_enabled, webhook_url: form.webhook_url })} disabled={saving === 'webhook'}>{saving === 'webhook' ? 'Saving…' : 'Save'}</Button>
            </div>
          </div>
        </Card>

        <Card title="Slack" sub="Post a short notification to a channel">
          <label style={enableRowStyle}>
            <input type="checkbox" checked={!!form.slack_enabled} onChange={e => setForm(p => ({ ...p, slack_enabled: e.target.checked }))} style={{ width: 15, height: 15 }} />
            Enabled
          </label>
          <ConnectorField label="Slack channel" hint="A #channel-name the bot is already in, or a channel ID.">
            <input style={inputStyle} value={form.slack_channel || ''} onChange={e => setForm(p => ({ ...p, slack_channel: e.target.value }))} placeholder="#team-performance-marketing" />
          </ConnectorField>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
            <ConnectorStatus status={form.slack_last_status} at={form.slack_last_at} />
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="ghost" size="sm" onClick={() => test('slack')} disabled={testing === 'slack' || !form.slack_channel}>{testing === 'slack' ? 'Testing…' : 'Send test'}</Button>
              <Button size="sm" onClick={() => save('slack', { slack_enabled: form.slack_enabled, slack_channel: form.slack_channel })} disabled={saving === 'slack'}>{saving === 'slack' ? 'Saving…' : 'Save'}</Button>
            </div>
          </div>
        </Card>

        <Card title="Google Sheet mirror" sub="Overwrite an existing sheet's first tab">
          <label style={enableRowStyle}>
            <input type="checkbox" checked={!!form.sheet_enabled} onChange={e => setForm(p => ({ ...p, sheet_enabled: e.target.checked }))} style={{ width: 15, height: 15 }} />
            Enabled
          </label>
          <ConnectorField label="Sheet ID" hint="The id from the sheet's own URL (the part between /d/ and /edit) -- share the sheet as an Editor with the same Google service account this app already uses for 'Export to Google Sheets' elsewhere.">
            <input style={inputStyle} value={form.sheet_id || ''} onChange={e => setForm(p => ({ ...p, sheet_id: e.target.value }))} placeholder="1AbCdefGhIJKlmnOPQrstuVWXyz…" />
          </ConnectorField>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
            <ConnectorStatus status={form.sheet_last_status} at={form.sheet_last_at} />
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="ghost" size="sm" onClick={() => test('sheet')} disabled={testing === 'sheet' || !form.sheet_id}>{testing === 'sheet' ? 'Syncing…' : 'Sync now'}</Button>
              <Button size="sm" onClick={() => save('sheet', { sheet_enabled: form.sheet_enabled, sheet_id: form.sheet_id })} disabled={saving === 'sheet'}>{saving === 'sheet' ? 'Saving…' : 'Save'}</Button>
            </div>
          </div>
        </Card>

        <Card title="Read-only API" sub="An external script pulls this on its own schedule">
          <label style={enableRowStyle}>
            <input type="checkbox" checked={!!form.api_enabled} onChange={e => save('api', { api_enabled: e.target.checked })} style={{ width: 15, height: 15 }} disabled={!form.api_key} />
            Enabled{!form.api_key && <span style={{ fontWeight: 500, color: C.muted, textTransform: 'none' }}> — generate a key first</span>}
          </label>
          {form.api_key ? (
            <>
              <ConnectorField label="Pull URL" hint="Anyone with this URL can read the roster + mapping (not Phone/Airtel/Reporting Manager) -- keep it private, same as a password.">
                <div style={{ display: 'flex', gap: 6 }}>
                  <input readOnly style={{ ...inputStyle, fontSize: 11 }} value={pullUrl} onClick={e => e.target.select()} />
                  <Button variant="ghost" size="sm" onClick={() => copy(pullUrl)}>{copied ? 'Copied' : 'Copy'}</Button>
                </div>
              </ConnectorField>
              <Button variant="ghost" danger size="sm" onClick={regenerateKey} disabled={saving === 'api'}>Regenerate key</Button>
            </>
          ) : (
            <Button size="sm" onClick={regenerateKey} disabled={saving === 'api'}>{saving === 'api' ? 'Generating…' : 'Generate a key'}</Button>
          )}
        </Card>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Org chart tab

// Renders the org tree from the ASM/SM + SSM manual fields (this page's own
// tracked structure, deliberately NOT the live LeadSquared Reporting Manager
// chain, which is a different, already-visible-in-the-table hierarchy). ASM/SM
// and SSM are free text, so two rows meaning the same real person can only
// disagree by whitespace/case -- normalizeName groups those together instead
// of drawing two separate nodes for one person; anything left over after that
// (a real typo, or a manager who's since left) surfaces in its own "Unmatched"
// bucket rather than silently vanishing or crashing the tree.
function normalizeName(s) { return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase() }

function BellIcon({ filled }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  )
}

function OrgNode({ name, count, children, depth, isAdmin, watchedKeys, onWatch }) {
  const [open, setOpen] = useState(depth < 1)
  const has = children && children.length > 0
  const isWatched = has && watchedKeys && watchedKeys.has(normalizeName(name))
  return (
    <div style={{ marginLeft: depth ? 22 : 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 9, background: depth === 0 ? 'var(--bg3)' : 'transparent' }}>
        <div onClick={() => has && setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, cursor: has ? 'pointer' : 'default' }}>
          {has ? (
            <span style={{ width: 14, color: C.muted, fontSize: 10, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .12s', flexShrink: 0 }}>▶</span>
          ) : <span style={{ width: 14, flexShrink: 0 }} />}
          <Avatar name={name} size={26} />
          <span style={{ fontSize: 13, fontWeight: depth === 0 ? 800 : 700, color: C.text }}>{name}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.muted }}>{count} {count === 1 ? 'person' : 'people'}</span>
        </div>
        {has && isAdmin && (
          <button
            onClick={() => onWatch({ key: normalizeName(name), label: name })}
            title={isWatched ? 'Someone is watching this team -- click to manage' : 'Get a Slack DM when this team changes'}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', color: isWatched ? C.navy : C.muted, flexShrink: 0 }}
          >
            <BellIcon filled={isWatched} />
          </button>
        )}
      </div>
      {has && open && (
        <div style={{ borderLeft: depth < 2 ? '1.5px solid ' + C.border : 'none', marginLeft: 13 }}>
          {children.map(c => <OrgNode key={c.key} name={c.name} count={c.count} children={c.children} depth={depth + 1} isAdmin={isAdmin} watchedKeys={watchedKeys} onWatch={onWatch} />)}
        </div>
      )}
    </div>
  )
}

// Subscribes a real person (by email -- not necessarily a Quantum login, most
// of the LeadSquared roster has none) to a Slack DM whenever the team under
// one Org Chart node changes. Admin-only, since this is set up on someone's
// behalf, not day-to-day self-serve -- see api/crm-leads.js's
// notifyTeamWatchers for the actual sending.
function WatcherModal({ node, watchers, onClose, onChanged }) {
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const current = watchers.filter(w => w.node_key === node.key)

  const add = async () => {
    const e = email.trim().toLowerCase()
    if (!e) return
    setSaving(true); setErr('')
    try {
      await fetchJson(API + '&mode=team_watchers_add', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node_key: node.key, node_label: node.label, subscriber_email: e }),
      })
      setEmail('')
      onChanged()
    } catch (err) { setErr(String(err.message || err)) } finally { setSaving(false) }
  }
  const remove = async id => {
    setSaving(true); setErr('')
    try {
      await fetchJson(API + '&mode=team_watchers_remove', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      onChanged()
    } catch (err) { setErr(String(err.message || err)) } finally { setSaving(false) }
  }
  const [testMsg, setTestMsg] = useState('')
  const [testing, setTesting] = useState(false)
  const sendTestDm = async () => {
    const e = email.trim().toLowerCase()
    if (!e) return
    setTesting(true); setTestMsg('')
    try {
      await fetchJson(API + '&mode=team_watchers_test_dm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e }) })
      setTestMsg('Sent -- check Slack.')
    } catch (err) { setTestMsg('Could not send: ' + (err.message || err)) } finally { setTesting(false) }
  }

  return (
    <Modal onClose={onClose} title={'Watchers — ' + node.label} width={480}>
      <p style={{ fontSize: 12.5, color: C.muted, marginTop: 0 }}>
        Anyone added here gets a Slack DM whenever someone joins, leaves, or moves out of this team.
        Needs a real @leverageedu.com Slack account -- not a Quantum login.
      </p>
      {current.length === 0 ? (
        <div style={{ fontSize: 12.5, color: C.muted, padding: '4px 0 14px' }}>Nobody is watching this team yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          {current.map(w => (
            <div key={w.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', borderRadius: 8, background: 'var(--bg3)' }}>
              <span style={{ fontSize: 12.5, color: C.text, fontWeight: 600 }}>{w.subscriber_email}</span>
              <Button variant="ghost" size="sm" onClick={() => remove(w.id)} disabled={saving}>Remove</Button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <input style={inputStyle} value={email} onChange={e => setEmail(e.target.value)} placeholder="name@leverageedu.com" onKeyDown={e => e.key === 'Enter' && add()} />
        <Button variant="ghost" size="sm" onClick={sendTestDm} disabled={testing || !email.trim()}>{testing ? 'Sending…' : 'Test DM'}</Button>
        <Button size="sm" onClick={add} disabled={saving || !email.trim()}>Add</Button>
      </div>
      {testMsg && <div style={{ fontSize: 11.5, color: testMsg.indexOf('Sent') === 0 ? C.green : C.navy, marginTop: 8 }}>{testMsg}</div>}
      {err && <div style={{ color: '#B91C1C', fontSize: 12.5, marginTop: 10 }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
      </div>
    </Modal>
  )
}

function OrgChartTab({ registerRefresh, isAdmin }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [watchers, setWatchers] = useState([])
  const [watchModalNode, setWatchModalNode] = useState(null)

  const load = useCallback(() => {
    fetchJson(API + '&mode=team_users').then(setData).catch(e => setError(String(e.message || e)))
  }, [])
  const loadWatchers = useCallback(() => {
    if (!isAdmin) return
    fetchJson(API + '&mode=team_watchers_list').then(d => setWatchers(d.rows || [])).catch(() => {})
  }, [isAdmin])
  useEffect(() => { load() }, [load])
  useEffect(() => { loadWatchers() }, [loadWatchers])
  useEffect(() => { registerRefresh(load) }, [registerRefresh, load])
  const watchedKeys = useMemo(() => new Set(watchers.map(w => w.node_key)), [watchers])

  const { tree, unmatched, unmappedCount } = useMemo(() => {
    const rows = (data && data.rows) || []
    const active = rows.filter(r => r.status === 'Active' && r.email)
    const nameByNorm = {}
    active.forEach(r => { nameByNorm[normalizeName(r.name)] = r.name })

    const ssmGroups = {} // normSsm -> { name, asms: { normAsm -> { name, reps: [] } } }
    const looseAsm = {} // ASM/SM set with no SSM -> { name, reps: [] }
    const unmapped = []

    active.forEach(r => {
      const asm = r.manual && r.manual.asm_sm && r.manual.asm_sm.trim()
      const ssm = r.manual && r.manual.ssm && r.manual.ssm.trim()
      if (!asm && !ssm) { unmapped.push(r); return }
      const asmKey = asm ? normalizeName(asm) : null
      const asmName = asmKey ? (nameByNorm[asmKey] || asm) : null
      if (ssm) {
        const ssmKey = normalizeName(ssm)
        const ssmName = nameByNorm[ssmKey] || ssm
        if (!ssmGroups[ssmKey]) ssmGroups[ssmKey] = { name: ssmName, asms: {} }
        const bucket = asmKey || '(direct)'
        if (!ssmGroups[ssmKey].asms[bucket]) ssmGroups[ssmKey].asms[bucket] = { name: asmName || 'Direct reports', reps: [] }
        ssmGroups[ssmKey].asms[bucket].reps.push(r)
      } else if (asmKey) {
        if (!looseAsm[asmKey]) looseAsm[asmKey] = { name: asmName, reps: [] }
        looseAsm[asmKey].reps.push(r)
      }
    })

    const tree = [
      ...Object.entries(ssmGroups).map(([ssmKey, g]) => {
        const asmNodes = Object.entries(g.asms).map(([asmKey, a]) => ({
          key: ssmKey + '/' + asmKey, name: a.name, count: a.reps.length,
          children: a.reps.map(r => ({ key: r.id, name: r.name, count: 1, children: null })),
        }))
        const count = asmNodes.reduce((s, n) => s + n.count, 0)
        return { key: ssmKey, name: g.name, count, children: asmNodes }
      }),
      ...Object.entries(looseAsm).map(([asmKey, a]) => ({
        key: 'loose/' + asmKey, name: a.name, count: a.reps.length,
        children: a.reps.map(r => ({ key: r.id, name: r.name, count: 1, children: null })),
      })),
    ].sort((a, b) => b.count - a.count)

    return { tree, unmatched: unmapped, unmappedCount: unmapped.length }
  }, [data])

  if (error) return <div style={{ padding: '10px 14px', borderRadius: 10, background: '#FEF2F2', border: '0.5px solid #FECACA', color: '#B91C1C', fontSize: 12.5 }}>✕ {error}</div>
  if (!data) return <InlineLoader label="Building the org chart" />

  return (
    <div>
      <p style={{ fontSize: 12.5, color: C.muted, marginTop: 0, marginBottom: 16, maxWidth: 760 }}>
        Built from the ASM/SM and SSM fields tracked on this page -- SSM at the top, ASM/SM
        underneath, individual reps at the bottom. This is a different hierarchy from the live
        "LS Manager" column in Roster (LeadSquared's own reporting line); this one is the informal
        sales structure this page exists to track. Names typed slightly differently for the same
        real person (spacing, capitalization) are grouped together automatically.
      </p>
      <StatStrip items={[
        { label: 'SSM Groups', value: fmtN(tree.filter(t => t.children.length > 1 || (t.children[0] && t.children[0].children)).length), sub: 'top-level' },
        { label: 'People Mapped', value: fmtN(tree.reduce((s, t) => s + t.count, 0)), sub: 'appear in the tree' },
        { label: 'Not Yet Mapped', value: fmtN(unmappedCount), sub: 'no ASM/SM or SSM set' },
      ]} />
      <Card title="Structure" sub="Click a name to expand" noPad>
        <div style={{ padding: '14px 16px' }}>
          {tree.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: C.muted, fontSize: 13 }}>Nobody has an ASM/SM or SSM set yet.</div>
          ) : tree.map(n => (
            <OrgNode key={n.key} name={n.name} count={n.count} children={n.children} depth={0} isAdmin={isAdmin} watchedKeys={watchedKeys} onWatch={setWatchModalNode} />
          ))}
        </div>
      </Card>
      {unmatched.length > 0 && (
        <Card title="Not yet mapped" sub={`${fmtN(unmatched.length)} active people with no ASM/SM or SSM set`} noPad>
          <div style={{ padding: '4px 16px 14px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {unmatched.slice(0, 60).map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '5px 10px 5px 6px', borderRadius: 8, background: 'var(--bg3)' }}>
                <Avatar name={r.name} size={20} />
                <span style={{ color: C.text, fontWeight: 600 }}>{r.name}</span>
              </div>
            ))}
            {unmatched.length > 60 && <div style={{ fontSize: 11.5, color: C.muted, alignSelf: 'center' }}>+ {unmatched.length - 60} more</div>}
          </div>
        </Card>
      )}
      {watchModalNode && (
        <WatcherModal
          node={watchModalNode}
          watchers={watchers}
          onClose={() => setWatchModalNode(null)}
          onChanged={loadWatchers}
        />
      )}
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

  // One header Refresh button has to reach whichever tab is actually mounted --
  // Roster and Groups each register their own `load` here as they mount, rather
  // than the header owning two copies of fetch logic that live in the tabs.
  const refreshFnRef = useRef(() => {})
  const registerRefresh = useCallback(fn => { refreshFnRef.current = fn }, [])
  const [refreshing, setRefreshing] = useState(false)
  const doRefresh = () => {
    setRefreshing(true)
    Promise.resolve(refreshFnRef.current()).finally(() => setTimeout(() => setRefreshing(false), 400))
  }

  return (
    <div className="lq-page-shell" style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.bg, fontFamily: FONT }}>
      <Sidebar />
      <div style={{ margin: '12px 14px 0', borderRadius: 14, border: '1px solid #EEF1F6', boxShadow: '0 1px 3px rgba(31,60,132,0.06)', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <div style={{ background: 'var(--card)', borderBottom: '0.5px solid ' + C.border, padding: '10px 28px', flexShrink: 0 }}>
          <p style={{ fontSize: 10.5, color: C.muted, margin: 0, letterSpacing: '0.05em', textTransform: 'uppercase', fontFamily: FONT }}>
            Dashboards / Team Mapping
            {activeTab === 'history' && ' / History'}
            {activeTab === 'orgchart' && ' / Org Chart'}
            {activeTab === 'connectors' && ' / Connectors'}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '2px 0 10px' }}>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.4px', fontFamily: FONT }}>
              {activeTab === 'history' ? 'Import & Export History' : 'Team Mapping'}
            </h1>
            {activeTab !== 'history' && activeTab !== 'connectors' && (
              <Button variant="ghost" size="sm" icon={<span style={{ display: 'inline-flex', animation: refreshing ? 'teamMapSpin .6s linear infinite' : 'none' }}><RefreshIcon /></span>} onClick={doRefresh}>Refresh</Button>
            )}
          </div>
          {activeTab !== 'history' && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} className="lq-header-controls">
              <div style={pillStyle(activeTab === 'roster')} onClick={() => setTab('roster')}>Roster</div>
              <div style={pillStyle(activeTab === 'groups')} onClick={() => setTab('groups')}>Sales Groups</div>
              <div style={pillStyle(activeTab === 'orgchart')} onClick={() => setTab('orgchart')}>Org Chart</div>
              {isAdmin && <div style={pillStyle(activeTab === 'connectors')} onClick={() => setTab('connectors')}>Connectors</div>}
            </div>
          )}
        </div>
        <style>{`@keyframes teamMapSpin { to { transform: rotate(360deg) } }`}</style>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
          {activeTab === 'roster' && <RosterTab isAdmin={isAdmin} onOpenHistory={() => setTab('history')} registerRefresh={registerRefresh} />}
          {activeTab === 'groups' && <GroupsTab registerRefresh={registerRefresh} />}
          {activeTab === 'orgchart' && <OrgChartTab registerRefresh={registerRefresh} isAdmin={isAdmin} />}
          {activeTab === 'connectors' && (isAdmin ? <ConnectorsTab /> : <div style={{ color: C.muted, fontSize: 13 }}>Admin only.</div>)}
          {activeTab === 'history' && <HistoryTab onBack={() => setTab('roster')} />}
        </div>
      </div>
    </div>
  )
}
