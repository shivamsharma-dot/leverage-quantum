import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import { InlineLoader } from '../components/SkeletonLoader'
import { C, FONT, fmtN, Card, brandColor } from '../ui/dashboardKit'
import Dropdown from '../components/Dropdown'
import Button from '../components/Button'
import ExportButton from '../components/ExportButton'
import { useAuth } from '../hooks/useAuth'
import { classifyDidRegion, FRAPP_TEAM_NAME } from '../../shared/didRegion.mjs'

// Real-time roster (LeadSquared UserManagement.svc/Users.Get, one call, no cache) +
// group membership (reconstructed from that same roster -- LeadSquared has no
// dedicated Sales-Groups API resource on this account, see api/crm-leads.js's own
// comment on this) merged with the manual, human-entered fields kept in Supabase
// (team_mapping_manual). Phone Number, Virtual DID and Reporting Manager are ALSO
// live -- User/Retrieve/ByUserId, a real per-user detail endpoint found in
// LeadSquared's own API docs, fetched lazily per roster page (see RosterTab's
// detailCache) since it's a per-user call, not bulk. What's left genuinely manual
// is ASM/SM, SSM, Role (a business designation distinct from LeadSquared's own
// coarse "LS Role"), Level, Country and Centre Name -- the columns the "Akash -
// Squad Mapping" Google Sheet used to track by hand. That sheet is a one-time seed
// for this page (via "Bulk import" below), not an ongoing source.
const API = '/api/crm-leads?source=leadsquared'
const PAGE_ROWS = 50
// TBL-1: the roster table's checkbox column is frozen (position:sticky;left:0)
// alongside the Name column, which needs to know exactly how wide the checkbox
// column renders to sit at the right offset. A plain "width" hint isn't
// reliable in table-layout:auto -- width+minWidth+maxWidth all pinned to the
// same value is what actually forces a fixed rendered width.
const TBL_CHECKBOX_COL_WIDTH = 44
// A11Y-1: the outer Roster/Sales Groups/Org Chart/Connectors tab strip's real
// tab list, driving both the role="tablist" button row and the matching
// role="tabpanel" wiring below it.
const TM_TABS = [
  { id: 'roster', label: 'Roster' },
  { id: 'groups', label: 'Sales Groups' },
  { id: 'orgchart', label: 'Org Chart' },
  { id: 'connectors', label: 'Connectors', adminOnly: true },
]

// Phone Number, Virtual DID and LS Manager Name/Email are NOT in this list --
// LeadSquared's own API docs (User/Retrieve/ByUserId) genuinely return PhoneMain,
// the mx_Custom_2 custom field, and the real ManagerName/ManagerUserId, so those
// three are live data now (see the roster table's Phone/Virtual DID/LS Manager cells).
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
// `suggest: 'roster_email'` on the two Email fields is the same idea as
// `suggest: 'roster'` above, just against email instead of name -- previously
// these were plain free-text inputs (a real risk: a typo'd manager email is
// invisible until something downstream that keys off it silently fails).
// `suggest: 'centre'` feeds a real, LeadSquared-sourced centre list (see
// fetchTeamCentreOptions in api/crm-leads.js) instead of letting Centre Name
// drift into "Delhi"/"delhi"/"Delhi Centre" meaning the same place.
const MANUAL_FIELDS = [
  { key: 'role', label: 'Role', suggest: 'role' },
  { key: 'asm_sm', label: 'ASM/SM', suggest: 'roster' },
  { key: 'asm_sm_email', label: 'ASM/SM Email', suggest: 'roster_email' },
  { key: 'ssm', label: 'SSM', suggest: 'roster' },
  { key: 'ssm_email', label: 'SSM Email', suggest: 'roster_email' },
  { key: 'country', label: 'Country' },
  { key: 'centre_name', label: 'Centre Name', suggest: 'centre' },
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
  'country': 'country', 'centre name': 'centre_name', 'center name': 'centre_name',
}
// The exact columns + one worked example the "Download template" button ships --
// deliberately the same alias vocabulary as IMPORT_ALIASES above, so a template
// round-tripped straight back through "Upload" needs no edits to import cleanly.
const TEMPLATE_HEADERS = ['Associate Mail ID', 'ASM/SM', 'ASM/SM Email', 'SSM', 'SSM Email', 'Role', 'Country', 'Centre Name']
const TEMPLATE_EXAMPLE = ['jane.doe@leverageedu.com', 'Kartikey Kedia', 'kartikey.kedia@leverageedu.com', 'Manish Singh', 'manish@leverageedu.com', 'Consultant', 'AC + SR', 'Delhi']

// LeadSquared's own Role enum for a NEW account (apidocs.leadsquared.com/create-a-user/)
// -- deliberately separate from ROLE_SUGGESTIONS above, which is this app's own
// free-text BUSINESS designation (Consultant/ASM/Manager/...) for people who
// already exist. Confusing the two would put "Consultant" into a field
// LeadSquared expects to be Sales_User/Sales_Manager/Marketing_User/Administrator.
const LS_ROLE_OPTIONS = ['Sales_User', 'Sales_Manager', 'Marketing_User', 'Administrator']

// Bulk Create Users' own template/aliases -- a SEPARATE parser from
// IMPORT_ALIASES/parseImportText above (which is for the manual-mapping
// import, anchored on ls_email). This one creates brand-new LeadSquared
// users, so it needs LeadSquared's own fields (First Name, Email, Role, ...),
// not the manual overlay fields, and its required-field check is First Name
// + Email rather than a match against an existing person.
const CREATE_USER_ALIASES = {
  'first name': 'first_name', 'firstname': 'first_name',
  'last name': 'last_name', 'lastname': 'last_name',
  'email': 'email', 'email address': 'email', 'associate mail id': 'email',
  'role': 'role',
  'team': 'team_name',
  'manager email': 'manager_email', 'manager': 'manager_email',
  'phone': 'phone', 'associated phone numbers': 'phone',
  'virtual did': 'virtual_did',
  'permission template': 'permission_template',
  'password': 'password',
}
const CREATE_USER_TEMPLATE_HEADERS = ['First Name', 'Last Name', 'Email', 'Role', 'Team', 'Manager Email', 'Phone', 'Virtual DID', 'Permission Template']
const CREATE_USER_TEMPLATE_EXAMPLE = ['Jane', 'Doe', 'jane.doe@leverageedu.com', 'Sales_User', 'University Admission Opportunity', 'manager@leverageedu.com', '+91-9876543210', '', '']
function downloadCreateUsersTemplate() {
  const csv = [CREATE_USER_TEMPLATE_HEADERS, CREATE_USER_TEMPLATE_EXAMPLE].map(row => row.map(csvCell).join(',')).join('\r\n')
  triggerDownload('team-mapping-create-users-template.csv', csv, 'text/csv;charset=utf-8')
}
// Mirrors parseImportText's shape (same splitDelimited/looksBinary helpers,
// same tab-or-comma auto-detect) but anchored on First Name + Email instead
// of ls_email, since these rows create people rather than match existing ones.
function parseCreateUsersText(text) {
  if (looksBinary(text)) return { rows: [], skipped: 0, unmapped: [], binary: true }
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length)
  if (lines.length < 2) return { rows: [], skipped: 0, unmapped: [], binary: false }
  const delim = lines[0].includes('\t') ? '\t' : ','
  const headerCells = splitDelimited(lines[0], delim).map(h => h.trim().toLowerCase())
  const fieldForCol = headerCells.map(h => CREATE_USER_ALIASES[h] || null)
  const unmapped = headerCells.filter((h, i) => !fieldForCol[i]).filter(Boolean)
  const rows = []
  let skipped = 0
  for (let i = 1; i < lines.length; i++) {
    const cells = splitDelimited(lines[i], delim)
    const row = {}
    cells.forEach((val, ci) => { const f = fieldForCol[ci]; if (f) row[f] = val.trim() })
    if (!row.first_name || !row.email) { skipped++; continue }
    rows.push(row)
  }
  return { rows, skipped, unmapped, binary: false }
}

// The target fields the Add User wizard's Mapping step offers -- same key
// vocabulary as CREATE_USER_ALIASES' values, same order as
// CREATE_USER_TEMPLATE_HEADERS, so a row built from this list already matches
// exactly what runCreateUsersInBackground/team_create_user expect with no
// translation step in between.
const WIZARD_FIELDS = [
  { key: 'first_name', label: 'First Name', required: true },
  { key: 'last_name', label: 'Last Name', required: false },
  { key: 'email', label: 'Email', required: true },
  { key: 'role', label: 'Role', required: false },
  { key: 'team_name', label: 'Team', required: false },
  { key: 'manager_email', label: 'Manager Email', required: false },
  { key: 'phone', label: 'Phone', required: false },
  { key: 'virtual_did', label: 'Virtual DID', required: false },
  { key: 'permission_template', label: 'Permission Template', required: false },
]

// Raw, un-aliased parse for the Mapping wizard step -- unlike parseCreateUsersText
// (which silently matches headers against CREATE_USER_ALIASES and drops anything
// it doesn't recognize), this keeps every real column exactly as uploaded so the
// Mapping step can show the file's own header names and real sample values, and
// let the admin confirm or override the guess rather than trusting a silent match.
function parseRawTable(text) {
  if (looksBinary(text)) return { binary: true, headers: [], rows: [] }
  const lines = text.split(/\r?\n/).map(l => l.replace(/\r$/, '')).filter(l => l.trim().length)
  if (lines.length < 2) return { binary: false, headers: [], rows: [] }
  const delim = lines[0].includes('\t') ? '\t' : ','
  const headers = splitDelimited(lines[0], delim).map(h => h.trim()).filter(Boolean)
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const cells = splitDelimited(lines[i], delim)
    const row = {}
    headers.forEach((h, ci) => { row[h] = (cells[ci] || '').trim() })
    rows.push(row)
  }
  return { binary: false, headers, rows }
}

// Turns a raw parsed table + a { targetField: csvHeaderName } map into the exact
// row shape team_create_user/runCreateUsersInBackground expect. A row missing
// First Name or Email (the only two required fields) is counted as skipped, not
// silently dropped -- the wizard's own summary states the count.
function buildResolvedRows(table, fieldMap) {
  const rows = []
  let skipped = 0
  ;(table?.rows || []).forEach(r => {
    const row = {}
    WIZARD_FIELDS.forEach(f => { row[f.key] = fieldMap[f.key] ? (r[fieldMap[f.key]] || '').trim() : '' })
    if (!row.first_name || !row.email) { skipped++; return }
    rows.push(row)
  })
  return { rows, skipped }
}

// A reasonably complete, curated dial-code list (not the full ISO-3166 set --
// this is a searchable picker, not an exhaustive directory) with India first
// since this is an India-based business. Deliberately NOT auto-detected from
// typed digits: "+1" alone is shared by the US, Canada and a dozen Caribbean
// nations, so guessing would just be wrong some of the time -- the admin picks.
const COUNTRY_CODES = [
  { code: '+91', name: 'India', flag: '🇮🇳' },
  { code: '+1', name: 'United States', flag: '🇺🇸' },
  { code: '+1', name: 'Canada', flag: '🇨🇦' },
  { code: '+44', name: 'United Kingdom', flag: '🇬🇧' },
  { code: '+971', name: 'United Arab Emirates', flag: '🇦🇪' },
  { code: '+966', name: 'Saudi Arabia', flag: '🇸🇦' },
  { code: '+974', name: 'Qatar', flag: '🇶🇦' },
  { code: '+968', name: 'Oman', flag: '🇴🇲' },
  { code: '+965', name: 'Kuwait', flag: '🇰🇼' },
  { code: '+973', name: 'Bahrain', flag: '🇧🇭' },
  { code: '+65', name: 'Singapore', flag: '🇸🇬' },
  { code: '+60', name: 'Malaysia', flag: '🇲🇾' },
  { code: '+61', name: 'Australia', flag: '🇦🇺' },
  { code: '+64', name: 'New Zealand', flag: '🇳🇿' },
  { code: '+49', name: 'Germany', flag: '🇩🇪' },
  { code: '+33', name: 'France', flag: '🇫🇷' },
  { code: '+39', name: 'Italy', flag: '🇮🇹' },
  { code: '+34', name: 'Spain', flag: '🇪🇸' },
  { code: '+31', name: 'Netherlands', flag: '🇳🇱' },
  { code: '+41', name: 'Switzerland', flag: '🇨🇭' },
  { code: '+353', name: 'Ireland', flag: '🇮🇪' },
  { code: '+46', name: 'Sweden', flag: '🇸🇪' },
  { code: '+47', name: 'Norway', flag: '🇳🇴' },
  { code: '+45', name: 'Denmark', flag: '🇩🇰' },
  { code: '+7', name: 'Russia', flag: '🇷🇺' },
  { code: '+86', name: 'China', flag: '🇨🇳' },
  { code: '+81', name: 'Japan', flag: '🇯🇵' },
  { code: '+82', name: 'South Korea', flag: '🇰🇷' },
  { code: '+852', name: 'Hong Kong', flag: '🇭🇰' },
  { code: '+63', name: 'Philippines', flag: '🇵🇭' },
  { code: '+62', name: 'Indonesia', flag: '🇮🇩' },
  { code: '+66', name: 'Thailand', flag: '🇹🇭' },
  { code: '+84', name: 'Vietnam', flag: '🇻🇳' },
  { code: '+880', name: 'Bangladesh', flag: '🇧🇩' },
  { code: '+92', name: 'Pakistan', flag: '🇵🇰' },
  { code: '+94', name: 'Sri Lanka', flag: '🇱🇰' },
  { code: '+977', name: 'Nepal', flag: '🇳🇵' },
  { code: '+95', name: 'Myanmar', flag: '🇲🇲' },
  { code: '+27', name: 'South Africa', flag: '🇿🇦' },
  { code: '+234', name: 'Nigeria', flag: '🇳🇬' },
  { code: '+254', name: 'Kenya', flag: '🇰🇪' },
  { code: '+20', name: 'Egypt', flag: '🇪🇬' },
  { code: '+212', name: 'Morocco', flag: '🇲🇦' },
  { code: '+55', name: 'Brazil', flag: '🇧🇷' },
  { code: '+52', name: 'Mexico', flag: '🇲🇽' },
  { code: '+54', name: 'Argentina', flag: '🇦🇷' },
  { code: '+972', name: 'Israel', flag: '🇮🇱' },
  { code: '+90', name: 'Turkey', flag: '🇹🇷' },
  { code: '+48', name: 'Poland', flag: '🇵🇱' },
  { code: '+420', name: 'Czech Republic', flag: '🇨🇿' },
  { code: '+43', name: 'Austria', flag: '🇦🇹' },
  { code: '+32', name: 'Belgium', flag: '🇧🇪' },
  { code: '+351', name: 'Portugal', flag: '🇵🇹' },
  { code: '+30', name: 'Greece', flag: '🇬🇷' },
]

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
  color: active ? '#fff' : C.muted,
  // SYS-3: was '0.5px solid' -- a genuine half-pixel border rounds differently
  // per device pixel ratio (measured live at DPR 1.5 as a reported
  // 0.666667px), so the same hairline can render at visibly different
  // weights across displays, or vanish on some. Whole pixels round the same
  // everywhere.
  border: active ? 'none' : '1px solid ' + C.border,
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

// RES-1: this was a flex row with flexWrap + a per-item index-based
// borderLeft as a divider ("i===0 ? none : border"). At in-between widths
// (measured live at 1024px: 3 cards on row 1, 2 OVERSIZED cards + a large
// void on row 2) the wrap produced an uneven 3+2 split, and the per-item
// border-left dangled on whichever card happened to land first in a wrapped
// row (its own index wasn't 0, so it still drew a divider against nothing).
//
// Tried repeat(auto-fit, minmax(...)) first and verified it against a real
// rendered DOM before trusting it -- it does eliminate the oversized-card
// and dangling-divider bugs (every card is always the SAME grid-defined
// width, and dividers are now drawn from the grid gap itself, which can
// only ever appear between two genuinely adjacent cells), but for exactly 5
// items it cannot skip straight from 5 to 3 columns the way the audit asked
// -- auto-fit greedily fits as many min-width columns as a given width
// allows, so a 4-column-with-1-orphan row is mathematically unavoidable at
// SOME width for a 5-item strip (confirmed by simulating every minmax value
// from 160-260px across a 640-1440px sweep -- every one hit it). Explicit
// step columns (5 -> 3 -> the app's own existing 2/1 lq-kpi-grid rules)
// instead, which can deliberately skip 4. Column count is
// min(items.length, N) at each step so this still degrades sensibly for
// StatStrip's other 3- and 4-item callers (Org Chart, History) rather than
// assuming every caller always passes exactly 5.
//
// Accepted trade-off, stated plainly rather than glossed over: for an item
// count that isn't a clean multiple of a step's column count (e.g. the
// 4-item History strip at the 3-column step), the last row's lone card does
// NOT stretch to fill the row -- confirmed live, auto-fit/explicit grid
// tracks don't expand into space left by a track that has content
// elsewhere in the grid -- so a same-sized, non-oversized empty cell can
// remain next to it. That's a world apart from the original bug (an
// oversized card plus a large void); a modest, correctly-sized trailing gap
// is normal, expected grid behaviour, not what was reported as broken.
let tmStatStripSeq = 0
function StatStrip({ items }) {
  const [id] = useState(() => `tm-stats-${++tmStatStripSeq}`)
  const wide = Math.min(items.length, 5)
  const medium = Math.min(items.length, 3)
  return (
    <>
      {/* Deliberately (min-width:769px) here, not a bare max-width -- both
          this rule and lq-kpi-grid's own ≤768px/≤480px rules use !important,
          and this component's <style> tag renders later in the document than
          the app's bundled CSS, so it would otherwise win the tie at any
          width where both ranges overlap and silently undo the mobile
          columns. Scoping the ranges to never overlap removes the ambiguity
          instead of relying on cascade order to resolve it correctly. */}
      <style>{`
        .${id} { grid-template-columns: repeat(${wide}, 1fr); }
        @media (min-width: 769px) and (max-width: 1150px) { .${id} { grid-template-columns: repeat(${medium}, 1fr) !important; } }
      `}</style>
      <div className={`lq-kpi-grid ${id}`} style={{
        display: 'grid', gap: '0.5px',
        border: '0.5px solid ' + C.border, borderRadius: 12,
        background: C.border, marginBottom: 18, overflow: 'hidden',
      }}>
        {items.map(it => (
          <div key={it.label} style={{ padding: '13px 18px', background: 'var(--card)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{it.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.text, fontFamily: FONT }}>{it.value}</div>
            {it.sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{it.sub}</div>}
          </div>
        ))}
      </div>
    </>
  )
}

// A mapping is "stale" once its own last-touched timestamp is old enough that
// nobody has confirmed the org structure it encodes is still correct -- an
// ASM/SM assignment nobody has revisited in 90+ days is exactly the kind of
// thing worth a second look (a promotion, a team reshuffle, someone who left).
const STALE_DAYS = 90
// Informational only -- NEVER used for the actual Frapp push gate (that stays
// strictly Virtual DID-based, in shared/didRegion.mjs's classifyDidRegion, enforced
// server-side in api/crm-leads.js). Checked live against a real ~840-person sample:
// of the on-team people who have BOTH a Virtual DID and a Main Phone, the two agree
// on Indian/International 100% of the time -- so this isn't a second, competing
// classification, it's the same rule applied to whichever number happens to be on
// file when Virtual DID itself is blank (about 1 in 7 on-team people in that sample
// had no Virtual DID at all, so Region showed a bare "--" even though their Main
// Phone clearly indicated a country). Same India-detection rule as classifyDidRegion:
// no "+" prefix, or "+91" -> Indian; any other "+" prefix -> International.
function mainPhoneRegionHint(phoneMain) {
  const raw = String(phoneMain || '').trim()
  if (!raw) return null
  if (!raw.startsWith('+')) return 'Indian'
  return raw.replace(/[\s-]/g, '').startsWith('+91') ? 'Indian' : 'International'
}
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
// TBL-2: a zero-groups row used to still render a disabled "View" button --
// greyed, unclickable, 49px wide against its 80-83px "View (N)" neighbours,
// reading as a control that failed to load rather than a real "nothing
// here" state. Plain muted text for the zero case, and the real button gets
// a minWidth so the column doesn't ragged-edge between rows either.
function GroupsButton({ groups }) {
  const [open, setOpen] = useState(false)
  const n = (groups || []).length
  if (!n) return <span style={{ fontSize: 11.5, color: C.muted }}>—</span>
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, minWidth: 64, justifyContent: 'center',
          border: '0.5px solid ' + C.border, background: 'var(--card)', cursor: 'pointer',
          fontSize: 11.5, fontWeight: 700, color: C.navy, fontFamily: FONT,
        }}
      >
        View ({n})
        <ChevronDown />
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

function CheckGlyph({ color, size = 15 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
}
function AlertGlyph({ color, size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="7.5" x2="12" y2="13" /><circle cx="12" cy="16.6" r="0.6" fill={color} stroke="none" />
    </svg>
  )
}

// Searchable country-code picker (flag + name + dial code), paired with a plain
// number input by PhoneField below -- deliberately NOT auto-detected from typed
// digits (see COUNTRY_CODES' own comment on why that would be unreliable).
function CountryCodeSelect({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef(null)
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const current = COUNTRY_CODES.find(c => c.code === value) || COUNTRY_CODES[0]
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return COUNTRY_CODES
    return COUNTRY_CODES.filter(c => c.name.toLowerCase().includes(s) || c.code.includes(s))
  }, [q])
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(v => !v)} style={{ ...inputStyle, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', width: 112, justifyContent: 'space-between' }}>
        <span>{current.flag} {current.code}</span>
        <ChevronDown />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 20, width: 260, background: 'var(--card)', border: '0.5px solid ' + C.border, borderRadius: 10, boxShadow: '0 12px 32px -8px rgba(15,23,42,0.25)' }}>
          <div style={{ padding: 8, borderBottom: '0.5px solid ' + C.border }}>
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search country or code…" style={inputStyle} />
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {filtered.length === 0 && <div style={{ padding: '10px 12px', fontSize: 12, color: C.muted }}>No match</div>}
            {filtered.map((c, i) => (
              <div key={c.name + i} onMouseDown={e => { e.preventDefault(); onChange(c.code); setOpen(false); setQ('') }}
                style={{ padding: '7px 12px', fontSize: 12.5, cursor: 'pointer', color: C.text, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{c.flag} {c.name}</span>
                <span style={{ color: C.muted, fontWeight: 700 }}>{c.code}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
function PhoneField({ code, number, onCodeChange, onNumberChange }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <CountryCodeSelect value={code} onChange={onCodeChange} />
      <input style={{ ...inputStyle, flex: 1 }} value={number} onChange={e => onNumberChange(e.target.value.replace(/[^\d\s-]/g, ''))} placeholder="9876543210" />
    </div>
  )
}

// Read-only strip showing what LeadSquared itself reports for this person --
// Phone/Virtual DID/Reporting Manager, all live via User/Retrieve/ByUserId, fetched
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
    <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
      {[
        { label: 'Team', get: dt => dt?.teamName },
        { label: 'Phone', get: dt => dt?.phoneMain },
        { label: 'Virtual DID', get: dt => dt?.airtelNumber },
        { label: 'Reporting Manager', get: dt => dt?.managerName, sub: dt => dt?.managerEmail },
      ].map(({ label, get, sub: getSub }) => {
        const val = loading ? '…' : (get(detail) || '—')
        const sub = getSub && !loading ? getSub(detail) : null
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

function EditManualModal({ user, rosterNames, rosterEmails, centreOptions, onClose, onSaved }) {
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
            ) : f.suggest === 'roster_email' ? (
              <SuggestInput value={form[f.key]} onChange={v => setForm(p => ({ ...p, [f.key]: v }))} suggestions={rosterEmails || []} placeholder="Start typing an email…" />
            ) : f.suggest === 'centre' ? (
              <SuggestInput value={form[f.key]} onChange={v => setForm(p => ({ ...p, [f.key]: v }))} suggestions={centreOptions || []} placeholder="Start typing a centre…" />
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
function BulkEditModal({ users, rosterNames, rosterEmails, centreOptions, onClose, onDone }) {
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
                ) : f.suggest === 'roster_email' ? (
                  <SuggestInput value={fields[f.key].value} onChange={setVal} suggestions={rosterEmails || []} placeholder="Value to apply to everyone selected…" />
                ) : f.suggest === 'centre' ? (
                  <SuggestInput value={fields[f.key].value} onChange={setVal} suggestions={centreOptions || []} placeholder="Value to apply to everyone selected…" />
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

// ---------------------------------------------------------------- Background create-users store
//
// Deliberate near-copy of importStore/runImportInBackground/useImportProgress
// above rather than a shared generalization -- creating a real LeadSquared
// user is a distinct, higher-stakes action from mapping an existing person
// (see createLeadSquaredUser's own comment in api/crm-leads.js: it writes
// into production LeadSquared, not just this app's own Supabase table), and
// keeping them as two plain, readable copies is safer than one abstraction
// two very different call sites both have to reason about.
const createUsersStore = {
  running: false,
  progress: null, // { done, total, failed, skipped, label }
  listeners: new Set(),
  set(patch) { Object.assign(this, patch); this.listeners.forEach(l => l()) },
  subscribe(l) { this.listeners.add(l); return () => this.listeners.delete(l) },
}

// `lookups` ({ teamNameToId, managerEmailToId }) is a snapshot of the roster
// ALREADY loaded on screen at the moment the batch starts -- resolving Team/
// Manager here client-side means zero extra LeadSquared calls for something
// this app already has in memory. A team/manager name that doesn't match
// anything just gets left blank on that row (not a hard failure) -- the user
// still gets created, and the field can be filled in from LeadSquared's own
// UI afterward, same "degrade, don't block" reasoning as the rest of this page.
async function runCreateUsersInBackground(rows, label, skippedCount, lookups, onSettled) {
  if (createUsersStore.running) return
  createUsersStore.set({ running: true, progress: { done: 0, total: rows.length, failed: 0, skipped: skippedCount, label } })

  let activity = null
  try {
    activity = await fetchJson(API + '&mode=team_activity_create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'create_users', label, total: rows.length, status: 'running' }),
    })
  } catch { /* logging failing shouldn't block the actual creation */ }

  let done = 0, failed = 0
  for (const row of rows) {
    let rowOk = true
    try {
      const payload = {
        firstName: row.first_name, lastName: row.last_name || '', email: row.email,
        role: LS_ROLE_OPTIONS.includes(row.role) ? row.role : 'Sales_User',
        teamId: (row.team_name && lookups.teamNameToId[row.team_name.trim().toLowerCase()]) || undefined,
        managerUserId: (row.manager_email && lookups.managerEmailToId[row.manager_email.trim().toLowerCase()]) || undefined,
        phone: row.phone || undefined,
        virtualDid: row.virtual_did || undefined,
        password: row.password || undefined,
        permissionTemplateId: (row.permission_template && lookups.templateNameToId[row.permission_template.trim().toLowerCase()]) || undefined,
        skipActivityLog: true,
      }
      await fetchJson(API + '&mode=team_create_user', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      done++
    } catch { failed++; rowOk = false }
    createUsersStore.set({ progress: { done: done + failed, total: rows.length, failed, skipped: skippedCount, label, currentRow: row.email, currentRowOk: rowOk } })
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
  createUsersStore.set({ running: false, progress: null })
  if (onSettled) onSettled({ done, failed, skipped: skippedCount })
}

function useCreateUsersProgress() {
  const [state, setState] = useState({ running: createUsersStore.running, progress: createUsersStore.progress })
  useEffect(() => {
    const sync = () => setState({ running: createUsersStore.running, progress: createUsersStore.progress })
    sync()
    return createUsersStore.subscribe(sync)
  }, [])
  return state
}

// ---------------------------------------------------------------- Bulk import modal

// Modern file/paste input: an always-visible segmented control (Upload file /
// Paste rows) instead of a hidden "Or paste rows instead" text link -- shared
// by BulkImportModal below and the Add User wizard's Step 1, so both stayed
// visually consistent per explicit instruction to modernize both, not just
// the new flow. `parseFn` is whichever parser the caller needs (parseImportText,
// parseCreateUsersText, or the wizard's own parseRawTable) -- this component
// only owns the file-vs-paste UI, never the parsing itself.
function FileOrPasteInput({ onParsed, parseFn, accept = '.csv,.tsv,.txt', fileHint }) {
  const [srcMode, setSrcMode] = useState('file') // 'file' | 'paste'
  const [dragOver, setDragOver] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const fileRef = useRef(null)

  const loadFile = file => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => onParsed(parseFn(String(ev.target.result || '')), file.name)
    reader.readAsText(file)
  }
  const onDrop = e => {
    e.preventDefault(); setDragOver(false)
    loadFile(e.dataTransfer.files && e.dataTransfer.files[0])
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, padding: 3, borderRadius: 10, background: 'var(--bg3)', width: 'fit-content' }}>
        {[['file', 'Upload file'], ['paste', 'Paste rows']].map(([m, lbl]) => (
          <button key={m} type="button" onClick={() => setSrcMode(m)} style={{
            padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: FONT,
            background: srcMode === m ? 'var(--card)' : 'transparent', color: srcMode === m ? C.navy : C.muted,
            boxShadow: srcMode === m ? '0 1px 4px rgba(15,23,42,0.10)' : 'none', transition: 'all .15s',
          }}>{lbl}</button>
        ))}
      </div>
      {srcMode === 'file' ? (
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
          <div style={{ fontSize: 11.5, color: C.muted }}>{fileHint || '.csv, .tsv or .txt — first row must be real column headers'}</div>
          <input ref={fileRef} type="file" accept={accept} onChange={e => loadFile(e.target.files && e.target.files[0])} style={{ display: 'none' }} />
        </div>
      ) : (
        <div>
          <textarea
            value={pasteText} onChange={e => setPasteText(e.target.value)} placeholder="Paste tab- or comma-separated rows here, including the header row…"
            style={{ ...inputStyle, height: 140, fontFamily: 'monospace', fontSize: 11.5, resize: 'vertical' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <Button size="sm" onClick={() => onParsed(parseFn(pasteText), 'pasted rows')} disabled={!pasteText.trim()}>Parse pasted rows</Button>
          </div>
        </div>
      )}
    </div>
  )
}

function BulkImportModal({ onClose, onStarted }) {
  const [parsed, setParsed] = useState(null) // result of parseImportText, once a file/paste is loaded
  const [label, setLabel] = useState('')

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
        <FileOrPasteInput onParsed={(p, lbl) => { setLabel(lbl); setParsed(p) }} parseFn={parseImportText} />
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

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        <Button size="sm" onClick={startImport} disabled={!parsed || parsed.binary || !parsed.rows.length}>
          {parsed && parsed.rows.length ? `Import ${parsed.rows.length} row(s) in background` : 'Import'}
        </Button>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- Add User page
//
// A full-page tab (activeTab === 'add-user' in the outer component), not a
// Modal -- matches how "History" already works: reached only via a button,
// not listed in the pill row, with its own "Back to Roster". Deliberately a
// SEPARATE entry point from "Bulk import" above, not a mode inside it -- that
// one maps ASM/SM/Role/Country onto people who already exist in LeadSquared;
// this one creates brand-new people in LeadSquared itself. Still one "One
// person" vs "Many (CSV)" toggle inside ONE page, so there's still only ever
// one new button on the toolbar, not two.
const smallLabelStyle = { fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4, display: 'block' }

// Mapping step: one row per target field, a checkmark once it's mapped (navy
// "needs attention" if a REQUIRED field is still unmapped -- never red/amber,
// same brand rule as everywhere else on this page), a real "CSV Column"
// dropdown built from the uploaded file's own header row (pre-selected via
// CREATE_USER_ALIASES as a smart suggestion the admin can override, never a
// silent hard match), and live "CSV Example Data" sampled from whichever
// column is currently mapped.
function MappingStep({ table, fieldMap, setFieldMap }) {
  return (
    <div style={{ border: '0.5px solid ' + C.border, borderRadius: 12, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr style={{ background: 'var(--bg3)' }}>
            {['', 'Field', 'CSV Column', 'CSV Example Data'].map(h => (
              <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 800, color: C.muted, textTransform: 'uppercase', fontSize: 10 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {WIZARD_FIELDS.map(f => {
            const mapped = fieldMap[f.key] || ''
            const samples = mapped ? table.rows.map(r => r[mapped]).filter(Boolean).slice(0, 3) : []
            return (
              <tr key={f.key} style={{ borderTop: '0.5px solid ' + C.border }}>
                <td style={{ padding: '9px 12px', width: 30 }}>
                  {mapped ? <CheckGlyph color={C.green} /> : f.required ? <AlertGlyph color={C.navy} /> : <span style={{ color: C.muted }}>—</span>}
                </td>
                <td style={{ padding: '9px 12px', fontWeight: 700, color: C.text, whiteSpace: 'nowrap' }}>
                  {f.label}{f.required && <span style={{ color: C.navy }}> *</span>}
                </td>
                <td style={{ padding: '9px 12px' }}>
                  <Dropdown
                    options={['— Not mapped —', ...table.headers]}
                    value={mapped || '— Not mapped —'}
                    onChange={v => setFieldMap(m => ({ ...m, [f.key]: v === '— Not mapped —' ? '' : v }))}
                    minWidth={220}
                  />
                </td>
                <td style={{ padding: '9px 12px', color: C.muted, fontSize: 11.5 }}>{samples.length ? samples.join('  ·  ') : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// Data Import step: the resolved preview, one row per person who'll actually
// be created. Team/Manager Email/Permission Template are validated against
// what's really in the roster/template list right now -- navy (never red)
// when a mapped value doesn't match anything, so it's visible before the real
// LeadSquared write happens rather than only discovered afterward.
function DataImportStep({ resolved, lookups }) {
  const { rows, skipped } = resolved
  const cell = (v, ok) => <span style={{ color: !v ? C.muted : (ok ? C.text : C.navy), fontWeight: (v && !ok) ? 700 : 400 }}>{v || '—'}</span>
  return (
    <div>
      <div style={{ fontSize: 12.5, color: C.text, marginBottom: 10 }}>
        <b>{fmtN(rows.length)}</b> user(s) ready to create{skipped > 0 && <>, <b>{fmtN(skipped)}</b> skipped (missing First Name or Email)</>}.
      </div>
      <div style={{ overflowX: 'auto', border: '0.5px solid ' + C.border, borderRadius: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
          <thead>
            <tr style={{ background: 'var(--bg3)' }}>
              {['First Name', 'Last Name', 'Email', 'Role', 'Team', 'Manager Email', 'Phone', 'Virtual DID', 'Permission Template'].map(h => (
                <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 800, color: C.muted, textTransform: 'uppercase', fontSize: 10, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 25).map((row, i) => {
              const teamOk = !row.team_name || !!lookups.teamNameToId[row.team_name.trim().toLowerCase()]
              const mgrOk = !row.manager_email || !!lookups.managerEmailToId[row.manager_email.trim().toLowerCase()]
              const tplOk = !row.permission_template || !!lookups.templateNameToId[row.permission_template.trim().toLowerCase()]
              return (
                <tr key={i} style={{ borderTop: '0.5px solid ' + C.border }}>
                  <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>{row.first_name}</td>
                  <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>{row.last_name || '—'}</td>
                  <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>{row.email}</td>
                  <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>{row.role || '—'}</td>
                  <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>{cell(row.team_name, teamOk)}</td>
                  <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>{cell(row.manager_email, mgrOk)}</td>
                  <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>{row.phone || '—'}</td>
                  <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>{row.virtual_did || '—'}</td>
                  <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>{cell(row.permission_template, tplOk)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length > 25 && <div style={{ padding: '6px 10px', fontSize: 11, color: C.muted }}>+ {fmtN(rows.length - 25)} more row(s)</div>}
      </div>
      <div style={{ marginTop: 10, fontSize: 11.5, color: C.muted }}>
        <span style={{ color: C.navy, fontWeight: 700 }}>Navy</span> means that value doesn't match anyone in the roster / any available template — the person will still be created, just without that field set (fix it in LeadSquared afterward, or go back and remap).
      </div>
    </div>
  )
}

// The three-step-wizard progress rail -- Select File → Mapping → Data Import.
function WizardSteps({ step }) {
  const steps = ['Select File', 'Mapping', 'Data Import']
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
      {steps.map((label, i) => {
        const n = i + 1
        const done = n < step, active = n === step
        return (
          <React.Fragment key={label}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 24, height: 24, borderRadius: '50%', flexShrink: 0, fontSize: 11.5, fontWeight: 800,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: done ? C.green : active ? 'linear-gradient(135deg,#1F3C84,#1C9FD4)' : 'var(--bg3)',
                color: done || active ? '#fff' : C.muted,
              }}>{done ? <CheckGlyph color="#fff" size={12} /> : n}</span>
              <span style={{ fontSize: 12.5, fontWeight: active ? 800 : 700, color: active ? C.text : C.muted }}>{label}</span>
            </div>
            {n < steps.length && <span style={{ width: 28, height: 1, background: C.border, flexShrink: 0 }} />}
          </React.Fragment>
        )
      })}
    </div>
  )
}

function AddUserPage({ onBack, onBulkStarted, rows, rosterEmails, onCreated }) {
  const [mode, setMode] = useState('single') // 'single' | 'bulk'
  const [templates, setTemplates] = useState(null) // null = loading, [] = none, or [{id,name}]
  const [templatesError, setTemplatesError] = useState('')
  useEffect(() => {
    fetchJson(API + '&mode=team_permission_templates')
      .then(d => setTemplates(d.templates || []))
      .catch(e => { setTemplates([]); setTemplatesError(String(e.message || e)) })
  }, [])

  // Team/Manager options are derived from the roster ALREADY loaded on screen
  // -- no extra LeadSquared call. teamNameToId/managerEmailToId are also what
  // the bulk-CSV path resolves free-text Team/Manager Email columns against.
  const teamOptions = useMemo(() => {
    const m = new Map()
    rows.forEach(r => { if (r.teamId && r.teamName) m.set(r.teamId, r.teamName) })
    return Array.from(m.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [rows])
  const lookups = useMemo(() => {
    const teamNameToId = {}, managerEmailToId = {}, templateNameToId = {}
    rows.forEach(r => { if (r.teamName) teamNameToId[r.teamName.trim().toLowerCase()] = r.teamId })
    rows.forEach(r => { if (r.email) managerEmailToId[r.email.trim().toLowerCase()] = r.id })
    ;(templates || []).forEach(t => { templateNameToId[t.name.trim().toLowerCase()] = t.id })
    return { teamNameToId, managerEmailToId, templateNameToId }
  }, [rows, templates])

  const blankForm = { firstName: '', lastName: '', email: '', role: 'Sales_User', teamId: '', managerEmail: '', phoneCode: '+91', phoneNumber: '', virtualDid: '', permissionTemplateId: '', password: '' }

  // -------- single-person form
  const [form, setForm] = useState(blankForm)
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const [creating, setCreating] = useState(false)
  const [createResult, setCreateResult] = useState(null) // { id, templateApplied, templateError }
  const [createError, setCreateError] = useState('')

  const submitSingle = async () => {
    if (!form.firstName.trim() || !form.email.trim()) return
    if (!window.confirm(`Create "${(form.firstName + ' ' + form.lastName).trim()}" (${form.email}) as a real user in LeadSquared now?`)) return
    setCreating(true); setCreateError(''); setCreateResult(null)
    try {
      const managerUserId = form.managerEmail ? lookups.managerEmailToId[form.managerEmail.trim().toLowerCase()] : undefined
      const phone = form.phoneNumber.trim() ? `${form.phoneCode}-${form.phoneNumber.trim()}` : undefined
      const result = await fetchJson(API + '&mode=team_create_user', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName.trim(), lastName: form.lastName.trim(), email: form.email.trim(),
          role: form.role, teamId: form.teamId || undefined, managerUserId, phone,
          virtualDid: form.virtualDid.trim() || undefined, password: form.password || undefined,
          permissionTemplateId: form.permissionTemplateId || undefined,
        }),
      })
      setCreateResult(result)
      if (onCreated) onCreated()
    } catch (e) {
      setCreateError(String(e.message || e))
    } finally {
      setCreating(false)
    }
  }

  // -------- bulk wizard: Select File -> Mapping -> Data Import
  const [step, setStep] = useState(1)
  const [table, setTable] = useState(null) // { headers, rows } from parseRawTable, un-aliased
  const [srcLabel, setSrcLabel] = useState('')
  const [fieldMap, setFieldMap] = useState({})

  const resetBulk = () => { setStep(1); setTable(null); setSrcLabel(''); setFieldMap({}) }

  const onParsedTable = (parsedTable, fileLabel) => {
    if (parsedTable.binary) { window.alert(`"${fileLabel}" doesn't look like a text CSV -- if this is an Excel file, use File → Save As → CSV (Comma delimited) first, then upload that.`); return }
    if (!parsedTable.headers.length) { window.alert('No usable rows found -- the first line has to be a real header row, and there has to be at least one data row below it.'); return }
    // Smart default per field, guessed from CREATE_USER_ALIASES -- a suggestion
    // the admin sees and can override in the Mapping step, never a silent match.
    const guess = {}
    WIZARD_FIELDS.forEach(f => {
      const h = parsedTable.headers.find(hh => CREATE_USER_ALIASES[hh.trim().toLowerCase()] === f.key)
      if (h) guess[f.key] = h
    })
    setTable(parsedTable); setSrcLabel(fileLabel); setFieldMap(guess); setStep(2)
  }

  const resolved = useMemo(() => buildResolvedRows(table, fieldMap), [table, fieldMap])
  const requiredMapped = !!fieldMap.first_name && !!fieldMap.email

  const startBulk = () => {
    if (!resolved.rows.length) return
    if (!window.confirm(`Create ${resolved.rows.length} real user(s) in LeadSquared now? This can't be bulk-undone -- each would need removing one at a time.`)) return
    runCreateUsersInBackground(resolved.rows, srcLabel || 'pasted rows', resolved.skipped, lookups)
    onBulkStarted()
  }

  return (
    <div>
      <button type="button" onClick={onBack} style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer',
        color: C.muted, fontSize: 12.5, fontWeight: 700, padding: 0, marginBottom: 16,
      }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        Back to Roster
      </button>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <div style={pillStyle(mode === 'single')} onClick={() => setMode('single')}>One person</div>
        <div style={pillStyle(mode === 'bulk')} onClick={() => setMode('bulk')}>Many (upload CSV)</div>
      </div>

      {mode === 'single' && (
        <Card title="New person" sub="Creates a real user directly in LeadSquared.">
          {createResult ? (
            <div style={{ padding: '12px 14px', borderRadius: 10, background: C.greenBg, border: '0.5px solid rgba(76,174,111,0.35)', color: C.text, fontSize: 12.5 }}>
              <div style={{ fontWeight: 800, color: C.green, marginBottom: 4 }}>User created</div>
              {form.firstName} ({form.email}) now exists in LeadSquared (id {createResult.id}).
              {form.permissionTemplateId && (
                createResult.templateApplied
                  ? <div style={{ marginTop: 4 }}>Permission template applied.</div>
                  : <div style={{ marginTop: 4, color: C.navy }}>User created, but the permission template failed to apply{createResult.templateError ? `: ${createResult.templateError}` : ''} — apply it manually in LeadSquared.</div>
              )}
              <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                <Button size="sm" variant="ghost" onClick={() => { setCreateResult(null); setForm(blankForm) }}>Create another</Button>
                <Button size="sm" onClick={onBack}>Back to Roster</Button>
              </div>
            </div>
          ) : (
            <div style={{ maxWidth: 640 }}>
              {createError && (
                <div style={{ padding: '10px 14px', borderRadius: 10, background: C.navyBg, border: '0.5px solid rgba(31,60,132,0.25)', color: C.navy, fontSize: 12.5, marginBottom: 12 }}>{createError}</div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div><span style={smallLabelStyle}>First Name *</span><input style={inputStyle} value={form.firstName} onChange={e => setF('firstName', e.target.value)} /></div>
                <div><span style={smallLabelStyle}>Last Name</span><input style={inputStyle} value={form.lastName} onChange={e => setF('lastName', e.target.value)} /></div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <span style={smallLabelStyle}>Email *</span><input style={inputStyle} type="email" value={form.email} onChange={e => setF('email', e.target.value)} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <span style={smallLabelStyle}>Role</span>
                  <Dropdown options={LS_ROLE_OPTIONS} value={form.role} onChange={v => setF('role', v)} minWidth={160} />
                </div>
                <div>
                  <span style={smallLabelStyle}>Team</span>
                  <Dropdown
                    options={['None', ...teamOptions.map(t => t.name)]}
                    value={teamOptions.find(t => t.id === form.teamId)?.name || 'None'}
                    onChange={name => setF('teamId', name === 'None' ? '' : (teamOptions.find(t => t.name === name)?.id || ''))}
                    minWidth={160}
                  />
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <span style={smallLabelStyle}>Reporting Manager (email)</span>
                <SuggestInput value={form.managerEmail} onChange={v => setF('managerEmail', v)} suggestions={rosterEmails} placeholder="Start typing an existing person's email…" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <span style={smallLabelStyle}>Phone</span>
                  <PhoneField code={form.phoneCode} number={form.phoneNumber} onCodeChange={v => setF('phoneCode', v)} onNumberChange={v => setF('phoneNumber', v)} />
                </div>
                <div><span style={smallLabelStyle}>Virtual DID</span><input style={inputStyle} value={form.virtualDid} onChange={e => setF('virtualDid', e.target.value)} /></div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <span style={smallLabelStyle}>Permission Template</span>
                {templatesError ? (
                  <div style={{ fontSize: 11.5, color: C.muted }}>Couldn't load templates ({templatesError}) — user can still be created without one.</div>
                ) : (
                  <Dropdown
                    options={['None', ...(templates || []).map(t => t.name)]}
                    value={(templates || []).find(t => t.id === form.permissionTemplateId)?.name || 'None'}
                    onChange={name => setF('permissionTemplateId', name === 'None' ? '' : ((templates || []).find(t => t.name === name)?.id || ''))}
                    minWidth={200} disabled={!templates}
                  />
                )}
              </div>
              <div style={{ marginBottom: 16 }}>
                <span style={smallLabelStyle}>Password (optional)</span><input style={inputStyle} type="password" value={form.password} onChange={e => setF('password', e.target.value)} />
              </div>
              <Button size="sm" onClick={submitSingle} disabled={creating || !form.firstName.trim() || !form.email.trim()}>
                {creating ? 'Creating…' : 'Create User'}
              </Button>
            </div>
          )}
        </Card>
      )}

      {mode === 'bulk' && (
        <div>
          <WizardSteps step={step} />

          {step === 1 && (
            <Card title="1. Select File" sub="Each row creates a real, brand-new user in LeadSquared.">
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <Button variant="ghost" size="sm" onClick={downloadCreateUsersTemplate}>Download template (CSV)</Button>
              </div>
              <FileOrPasteInput onParsed={onParsedTable} parseFn={parseRawTable} fileHint=".csv, .tsv or .txt — first row must be real column headers" />
            </Card>
          )}

          {step === 2 && table && (
            <Card title="2. Mapping" sub={`${srcLabel} — ${fmtN(table.rows.length)} row(s). Match each field to a column from your file.`}
              action={<Button variant="ghost" size="sm" onClick={resetBulk}>Choose a different file</Button>}>
              <MappingStep table={table} fieldMap={fieldMap} setFieldMap={setFieldMap} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <Button variant="ghost" size="sm" onClick={() => setStep(1)}>Back</Button>
                <Button size="sm" disabled={!requiredMapped} onClick={() => setStep(3)}>Continue</Button>
              </div>
              {!requiredMapped && <div style={{ marginTop: 8, fontSize: 11.5, color: C.navy, textAlign: 'right' }}>First Name and Email both need a mapped column before continuing.</div>}
            </Card>
          )}

          {step === 3 && table && (
            <Card title="3. Data Import" sub="Review before creating -- nothing is written to LeadSquared until you confirm below.">
              <DataImportStep resolved={resolved} lookups={lookups} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <Button variant="ghost" size="sm" onClick={() => setStep(2)}>Back to mapping</Button>
                <Button size="sm" onClick={startBulk} disabled={!resolved.rows.length}>
                  {resolved.rows.length ? `Create ${fmtN(resolved.rows.length)} user(s) in background` : 'Create'}
                </Button>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

// AddUserPage needs the same roster (for Team/Manager lookups) RosterTab
// already fetches -- but the two are now separate, mutually-exclusive tabs
// (matching History's own pattern), so RosterTab isn't mounted while this one
// is. This wrapper owns its own independent team_users fetch rather than
// trying to thread data across two unmounted siblings.
function AddUserPageWrapper({ onBack, onBulkStarted }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    fetchJson(API + '&mode=team_users').then(setData).catch(e => setError(String(e.message || e)))
  }, [])
  if (error) return <div style={{ padding: '10px 14px', borderRadius: 10, background: C.navyBg, border: '0.5px solid rgba(31,60,132,0.25)', color: C.navy, fontSize: 12.5 }}>{error}</div>
  if (!data) return <InlineLoader label="Loading roster" />
  const rows = data.rows || []
  const rosterEmails = Array.from(new Set(rows.map(r => r.email).filter(Boolean))).sort()
  return <AddUserPage onBack={onBack} onBulkStarted={onBulkStarted} rows={rows} rosterEmails={rosterEmails} />
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
  // A phone/call-transfer glyph -- distinct from import's plain up-arrow, since
  // a Frapp push is a real external write (a live call-routing system), not
  // just a local bulk-import row.
  frapp_push: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.362 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0122 16.92z" /></svg>,
  // A person-plus glyph -- distinct from import's up-arrow, since this writes
  // a brand-new person into production LeadSquared, not a local Supabase row.
  // Reused for both the single-create (create_user) and bulk (create_users) types.
  create_user: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="17" y1="11" x2="23" y2="11" /></svg>,
}
TYPE_ICON.create_users = TYPE_ICON.create_user
const TYPE_ICON_COLOR = { import: [C.navy, C.navyBg], export: [C.cyan, C.cyanBg], edit: [C.blue, C.blueBg], delete: [C.navy, C.navyBg], restore: [C.green, C.greenBg], frapp_push: [C.blue, C.blueBg], create_user: [C.green, C.greenBg], create_users: [C.green, C.greenBg] }
// `level` is retired (see MANUAL_FIELDS above -- 2026-08 -- Level is no longer
// editable or shown as a column), but kept here + in TEAM_MANUAL_FIELDS_DISPLAY
// below on purpose: an OLD activity-log entry from before the retirement can
// still carry a `level` value in its snapshot/diff, and this is only ever read
// for that historical display, never for editing. The underlying Supabase
// column isn't dropped either, for the same reason -- nothing is deleted, the
// feature is just no longer surfaced going forward.
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
  // A Frapp push's real audit trail: who got added/removed from Futwork's
  // call-routing list SINCE the last successful push (not just "N pushed" --
  // that number alone can't tell you whether a departure actually took
  // effect). added/removed are null (not empty arrays) on the very first
  // push ever logged, since there's nothing to diff against yet.
  if (row.type === 'frapp_push') {
    const skipped = [
      detail.skippedNoMobile?.length ? `${detail.skippedNoMobile.length} no Virtual DID` : null,
      detail.skippedNoCountry?.length ? `${detail.skippedNoCountry.length} no Country` : null,
      detail.skippedInternational?.length ? `${detail.skippedInternational.length} International (blocked)` : null,
    ].filter(Boolean)
    return (
      <div style={{ fontSize: 11.5, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {detail.added == null ? (
          <div style={{ color: C.muted }}>First push logged — nothing to compare against yet.</div>
        ) : (
          <>
            {detail.added.length > 0 && <div><span style={{ color: C.green, fontWeight: 700 }}>+{detail.added.length} added:</span> <span style={{ color: C.muted }}>{detail.added.slice(0, 6).join(', ')}{detail.added.length > 6 ? '…' : ''}</span></div>}
            {detail.removed.length > 0 && <div><span style={{ color: C.navy, fontWeight: 700 }}>−{detail.removed.length} removed:</span> <span style={{ color: C.muted }}>{detail.removed.slice(0, 6).join(', ')}{detail.removed.length > 6 ? '…' : ''}</span></div>}
            {detail.added.length === 0 && detail.removed.length === 0 && <div style={{ color: C.muted }}>No change since the last push.</div>}
          </>
        )}
        {skipped.length > 0 && <div style={{ color: C.muted }}>Excluded: {skipped.join(' · ')}</div>}
        {detail.error && <div style={{ color: C.navy, fontWeight: 700 }}>{detail.error}</div>}
      </div>
    )
  }
  if (row.type === 'create_user') {
    return (
      <div style={{ fontSize: 11.5, marginTop: 4, color: C.muted }}>
        {detail.role && <>Role: {detail.role}</>}
        {detail.templateApplied && <> · permission template applied</>}
        {detail.templateError && <div style={{ color: C.navy, fontWeight: 700, marginTop: 2 }}>Permission template failed to apply: {detail.templateError}</div>}
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
  const importState = useImportProgress()
  const createUsersState = useCreateUsersProgress()
  // Only one of the two background jobs can realistically be running at once
  // from the UI (each has its own "already running, ignore" guard), so this
  // picks whichever is actually active rather than trying to show both live
  // cards at the same time.
  const running = importState.running || createUsersState.running
  const progress = importState.running ? importState.progress : createUsersState.progress
  const liveType = importState.running ? 'import' : (createUsersState.running ? 'create_users' : null)
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
              const isLiveRow = running && progress && r.type === liveType && r.status === 'running'
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
                    {(r.type === 'import' || r.type === 'create_users') && (
                      <div style={{ height: 6, borderRadius: 99, background: 'var(--bg3)', overflow: 'hidden', marginBottom: 5, maxWidth: 360 }}>
                        <div style={{ height: '100%', width: pct + '%', borderRadius: 99, background: statusColor(status), transition: 'width .25s ease' }} />
                      </div>
                    )}
                    <div style={{ fontSize: 11.5, color: C.muted }}>
                      {r.type === 'import' ? `${fmtN(d)} done, ${fmtN(failed)} failed, ${fmtN(r.skipped || 0)} skipped of ${fmtN(total)}`
                        : r.type === 'create_users' ? `${fmtN(d)} created, ${fmtN(failed)} failed, ${fmtN(r.skipped || 0)} skipped of ${fmtN(total)}`
                        : r.type === 'export' ? `${fmtN(r.total || 0)} row(s) exported`
                        : r.type === 'frapp_push' ? `${fmtN(r.total || 0)} coach(es) in this push`
                        : r.type === 'create_user' ? '1 user created'
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

// Every column worth filtering on, EXCEPT Status -- that one stays its own
// standalone dropdown (explicit request: "only leave status dropdown", since
// it's the one filter almost every view starts from). `get` returns either a
// single string or an array of strings (Group -- one person can be in several);
// the filter engine below handles both the same way. `region`/`callTransfer`
// read off `_region`/`_callTransfer`, two fields RosterTab computes itself from
// the whole-roster coach-directory cache (see getTeamCacheLookup in
// api/crm-leads.js) -- NOT the live per-page detailCache the table cells use,
// because Virtual DID has no bulk LeadSquared source, so there is no way to
// know Region/Call Transfer for someone whose page hasn't been opened without
// a cache. Only ever 'Indian'/'International' and 'Yes' are exposed as values
// (never a spelled-out "No") to match exactly what the table's own Region/Call
// Transfer cells show -- a dash there always means "not applicable or
// unknown", never a real "No".
const TEAM_FILTERABLE_FIELDS = [
  { key: 'role', label: 'LS Role', get: r => (r.role || '').replace(/_/g, ' ') || null },
  { key: 'groups', label: 'Group', get: r => r.groups || [] },
  { key: 'teamName', label: 'Team', get: r => r.teamName || null },
  { key: 'region', label: 'Region', get: r => r._region || null },
  { key: 'callTransfer', label: 'Call Transfer', get: r => r._callTransfer === 'Yes' ? 'Yes' : null },
  { key: 'managerName', label: 'LS Manager', get: r => r.managerName || null },
  { key: 'mapping', label: 'Mapping', get: r => r.manual ? (isStaleMapping(r.manual) ? 'Stale (90+ days)' : 'Mapped') : 'Unmapped' },
  { key: 'manualRole', label: 'Role', get: r => r.manual?.role || null },
  { key: 'manualCountry', label: 'Country', get: r => r.manual?.country || null },
  { key: 'manualCentre', label: 'Centre', get: r => r.manual?.centre_name || null },
  { key: 'asmSm', label: 'ASM/SM', get: r => r.manual?.asm_sm || null },
  { key: 'ssm', label: 'SSM', get: r => r.manual?.ssm || null },
]

// One popover, checkbox per distinct value, with its own search box -- shared
// shape used both by an already-active filter's chip (re-editing it) and by
// AddFilterButton (picking values for a brand-new one). Mirrors the identical
// pattern already shipped on AI/Human QL Detail's own per-column filter bar,
// so a person who's used those feels no different here.
function TeamFilterValuePopover({ field, options, selected, onToggleValue, onClose }) {
  const [q, setQ] = useState('')
  const shown = q.trim() ? options.filter(o => o.toLowerCase().includes(q.trim().toLowerCase())) : options
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 150 }} />
      <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 200, width: 240, background: 'var(--card)', border: '1px solid ' + C.border, borderRadius: 10, boxShadow: '0 12px 32px -8px rgba(15,23,42,0.22)', padding: 8 }}>
        <input autoFocus type="text" value={q} onChange={e => setQ(e.target.value)} placeholder={'Search ' + field.label.toLowerCase() + '…'}
          style={{ width: '100%', boxSizing: 'border-box', padding: '6px 9px', border: '0.5px solid ' + C.border, borderRadius: 7, fontSize: 12, fontFamily: FONT, outline: 'none', marginBottom: 6, background: 'var(--bg3)', color: C.text }} />
        <div style={{ maxHeight: 230, overflowY: 'auto' }}>
          {shown.map(o => {
            const checked = selected.includes(o)
            return (
              <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 7px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: checked ? 700 : 500, color: checked ? C.navy : C.text, background: checked ? C.navyBg : 'transparent' }}>
                <input type="checkbox" checked={checked} onChange={() => onToggleValue(o)} style={{ accentColor: C.navy, cursor: 'pointer', flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o}</span>
              </label>
            )
          })}
          {shown.length === 0 && <div style={{ fontSize: 11.5, color: C.muted, padding: '6px 7px' }}>No matches</div>}
        </div>
      </div>
    </>
  )
}

function TeamFilterChip({ field, values, options, open, onToggle, onToggleValue, onRemove }) {
  const summary = values.length === 1 ? values[0] : values.length + ' selected'
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'stretch', borderRadius: 8, border: '0.5px solid rgba(31,60,132,0.35)', background: C.navyBg, overflow: 'hidden' }}>
        <button type="button" onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 9px 6px 11px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, fontFamily: FONT, whiteSpace: 'nowrap' }}>
          <span style={{ color: C.navy, fontWeight: 700 }}>{field.label}</span>
          <span style={{ color: C.text, fontWeight: 600, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>{summary}</span>
          <svg aria-hidden="true" width="7" height="7" viewBox="0 0 24 24" fill="none" stroke={C.navy} strokeWidth="3" strokeLinecap="round" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}><polyline points="6 9 12 15 18 9" /></svg>
        </button>
        <button type="button" onClick={onRemove} title="Remove filter" aria-label={`Remove ${field.label} filter`} style={{ border: 'none', borderLeft: '0.5px solid rgba(31,60,132,0.2)', background: 'transparent', cursor: 'pointer', color: C.navy, padding: '6px 9px', display: 'flex', alignItems: 'center' }}>
          <svg aria-hidden="true" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>
      {open && <TeamFilterValuePopover field={field} options={options} selected={values} onToggleValue={onToggleValue} onClose={onToggle} />}
    </div>
  )
}

// Two-step wizard in ONE popover -- pick a column, then check off its values.
function TeamAddFilterButton({ allFields, activeFilters, filterOptions, open, onToggle, onToggleValue }) {
  const [step, setStep] = useState('pick')
  const [q, setQ] = useState('')
  useEffect(() => { if (open) { setStep('pick'); setQ('') } }, [open])

  const pickable = allFields.filter(f => !activeFilters[f.key])
  const shownFields = q.trim() ? pickable.filter(f => f.label.toLowerCase().includes(q.trim().toLowerCase())) : pickable
  const activeField = step !== 'pick' ? allFields.find(f => f.key === step) : null
  const options = activeField ? (filterOptions[activeField.key] || []) : []
  const shownOptions = activeField && q.trim() ? options.filter(o => o.toLowerCase().includes(q.trim().toLowerCase())) : options

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button type="button" onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 11, border: '1px dashed ' + C.border, background: 'transparent', cursor: 'pointer', fontSize: 13.5, fontWeight: 700, fontFamily: FONT, color: C.muted, whiteSpace: 'nowrap' }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        Filter
      </button>
      {open && (
        <>
          <div onClick={onToggle} style={{ position: 'fixed', inset: 0, zIndex: 150 }} />
          <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 200, width: 230, background: 'var(--card)', border: '1px solid ' + C.border, borderRadius: 10, boxShadow: '0 12px 32px -8px rgba(15,23,42,0.22)', padding: 8 }}>
            {step === 'pick' ? (
              <>
                <input autoFocus type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Find a column…"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '6px 9px', border: '0.5px solid ' + C.border, borderRadius: 7, fontSize: 12, fontFamily: FONT, outline: 'none', marginBottom: 6, background: 'var(--bg3)', color: C.text }} />
                <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                  {shownFields.map(f => (
                    <button key={f.key} type="button" onClick={() => { setStep(f.key); setQ('') }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 9px', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: FONT, color: C.text, background: 'transparent' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg3)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                      {f.label}
                    </button>
                  ))}
                  {shownFields.length === 0 && <div style={{ fontSize: 11.5, color: C.muted, padding: '6px 7px' }}>No columns match</div>}
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <button type="button" onClick={() => { setStep('pick'); setQ('') }} title="Back" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.muted, display: 'flex', alignItems: 'center', padding: 2, flexShrink: 0 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                  </button>
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: C.text }}>{activeField.label}</span>
                </div>
                <input autoFocus type="text" value={q} onChange={e => setQ(e.target.value)} placeholder={'Search ' + activeField.label.toLowerCase() + '…'}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '6px 9px', border: '0.5px solid ' + C.border, borderRadius: 7, fontSize: 12, fontFamily: FONT, outline: 'none', marginBottom: 6, background: 'var(--bg3)', color: C.text }} />
                <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                  {shownOptions.map(o => {
                    const checked = (activeFilters[activeField.key] || []).includes(o)
                    return (
                      <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 7px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: checked ? 700 : 500, color: checked ? C.navy : C.text, background: checked ? C.navyBg : 'transparent' }}>
                        <input type="checkbox" checked={checked} onChange={() => onToggleValue(activeField.key, o)} style={{ accentColor: C.navy, cursor: 'pointer', flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o}</span>
                      </label>
                    )
                  })}
                  {shownOptions.length === 0 && <div style={{ fontSize: 11.5, color: C.muted, padding: '6px 7px' }}>No matches</div>}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function RosterTab({ isAdmin, onOpenHistory, onOpenAddUser, registerRefresh }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('Active')
  // Every other filter (LS Role, Group, Team, Region, Call Transfer, LS Manager,
  // Mapping, and the manual Role/Country/Centre/ASM-SM/SSM fields) lives in one
  // rich, Notion/Linear-style chip system instead of a separate dropdown each --
  // { fieldKey: string[] of selected values }. See TEAM_FILTERABLE_FIELDS above.
  const [activeFilters, setActiveFilters] = useState({})
  const [openFilterKey, setOpenFilterKey] = useState(null) // fieldKey whose popover is open, or '__add'
  const [showInfo, setShowInfo] = useState(false)
  const [page, setPage] = useState(1)
  const [editUser, setEditUser] = useState(null)
  const [showImport, setShowImport] = useState(false)
  const [showBulkEdit, setShowBulkEdit] = useState(false)
  // Selection is by email (a stable, human-meaningful key) rather than the
  // LeadSquared numeric id -- so it reads sensibly if this ever needs to
  // survive a refresh, and matches what team_manual_save keys on anyway.
  const [selected, setSelected] = useState(() => new Set())
  const { running: importRunning, progress: importProgress } = useImportProgress()
  const { running: createUsersRunning, progress: createUsersProgress } = useCreateUsersProgress()
  // Virtual DID is the ONE field LeadSquared genuinely has no bulk source for
  // (confirmed live 2026-08-25 -- see fetchLeadSquaredTeamUsers' own comment in
  // api/crm-leads.js: User/AdvancedSearch does NOT expose mx_Custom_2 under any
  // column name). Team/Phone/Reporting Manager used to live here too and were
  // exactly as slow as this -- they're now part of `data.rows` itself, bulk,
  // instant, for the whole roster. Virtual DID is still fetched only for
  // whichever ~50 rows are actually on screen, cached by id so paging back to
  // an already-seen page is instant, mirroring the same page-scoped lazy-load
  // pattern this app already uses for Meta Ads creative thumbnails (same
  // rate-limit-avoidance reasoning).
  const [detailCache, setDetailCache] = useState({})

  const toggleFilterValue = (field, val) => setActiveFilters(prev => {
    const cur = prev[field] || []
    const next = cur.includes(val) ? cur.filter(x => x !== val) : [...cur, val]
    const copy = { ...prev }
    if (next.length) copy[field] = next; else delete copy[field]
    return copy
  })
  const removeFilter = field => setActiveFilters(prev => { const c = { ...prev }; delete c[field]; return c })
  const clearAllFilters = () => setActiveFilters({})

  // Region/Call Transfer need Virtual DID for the WHOLE roster to filter by --
  // fetched once here from the same coach-directory cache the Frapp push
  // itself reads (team_cache_lookup -> team_mapping_ls_detail_cache), not the
  // page-scoped detailCache the table cells use. See TEAM_FILTERABLE_FIELDS'
  // own comment for why these two sources are deliberately different.
  const [cacheByEmail, setCacheByEmail] = useState({})
  const [cacheSyncedAt, setCacheSyncedAt] = useState(null)
  useEffect(() => {
    fetchJson(API + '&mode=team_cache_lookup').then(d => {
      const map = {}
      ;(d.rows || []).forEach(r => { if (r.email) map[r.email.toLowerCase()] = r })
      setCacheByEmail(map)
      setCacheSyncedAt(d.lastSyncedAt || null)
    }).catch(() => {})
  }, [])

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
  // Same reasoning as wasImporting above -- a finished bulk create-users run
  // should refresh the roster so the new people show up without a manual
  // Refresh click, guarded the same true->false way.
  const wasCreatingUsers = useRef(false)
  useEffect(() => {
    if (wasCreatingUsers.current && !createUsersRunning) load()
    wasCreatingUsers.current = createUsersRunning
  }, [createUsersRunning, load])

  const rows = data?.rows || []

  // Region/Call Transfer, computed once per row from the whole-roster cache
  // (not the live per-page detailCache) so the advanced filter can see
  // everyone, not just whoever's page has been opened. `_region`/`_callTransfer`
  // are read by TEAM_FILTERABLE_FIELDS' own `get()`, and by nothing else --
  // the table's on-screen cells keep using the live per-page fetch, unchanged.
  const augmentedRows = useMemo(() => rows.map(r => {
    const onFrappTeam = r.teamName && String(r.teamName).trim().toLowerCase() === FRAPP_TEAM_NAME
    if (!onFrappTeam) return { ...r, _region: null, _callTransfer: null }
    const cached = cacheByEmail[(r.email || '').toLowerCase()]
    const region = classifyDidRegion(r.teamName, cached?.airtel_number) || null
    const isConsultant = (r.manual?.role || '').trim().toLowerCase() === 'consultant'
    return { ...r, _region: region, _callTransfer: (region === 'Indian' && isConsultant) ? 'Yes' : null }
  }), [rows, cacheByEmail])

  // Live names, for the ASM/SM and SSM type-ahead in the edit/bulk-edit
  // modals -- see MANUAL_FIELDS' suggest:'roster' comment.
  const rosterNames = useMemo(() => Array.from(new Set(rows.map(r => r.name).filter(Boolean))).sort(), [rows])
  const rosterEmails = useMemo(() => Array.from(new Set(rows.map(r => r.email).filter(Boolean))).sort(), [rows])

  // The real Centre list, fetched once (LeadSquared's own "Offline Centre
  // Name" dropdown on the University Admission Opportunity type -- see
  // fetchTeamCentreOptions in api/crm-leads.js) rather than on every modal
  // open; it's the same list for the whole page, not per-person.
  const [centreOptions, setCentreOptions] = useState([])
  useEffect(() => {
    fetchJson(API + '&mode=team_centre_options').then(d => setCentreOptions(d.options || [])).catch(() => {})
  }, [])

  // Distinct values per filterable field, derived from rows already narrowed by
  // Status (the one standalone dropdown) -- so picking "Inactive" first doesn't
  // still offer LS Roles that only ever appear on Active people, matching the
  // same "options reflect the one independent dimension" convention AI/Human QL
  // Detail's own filter bar already uses.
  const statusScoped = useMemo(() => statusFilter === 'All' ? augmentedRows : augmentedRows.filter(r => r.status === statusFilter), [augmentedRows, statusFilter])
  const filterOptions = useMemo(() => {
    const map = {}
    TEAM_FILTERABLE_FIELDS.forEach(f => {
      const set = new Set()
      statusScoped.forEach(r => {
        const v = f.get(r)
        if (Array.isArray(v)) v.forEach(x => x && set.add(x))
        else if (v) set.add(v)
      })
      map[f.key] = [...set].sort()
    })
    return map
  }, [statusScoped])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return statusScoped.filter(r => {
      for (const f of TEAM_FILTERABLE_FIELDS) {
        const sel = activeFilters[f.key]
        if (!sel || !sel.length) continue
        const v = f.get(r)
        const ok = Array.isArray(v) ? v.some(x => sel.includes(x)) : sel.includes(v)
        if (!ok) return false
      }
      if (q && !((r.name || '').toLowerCase().includes(q) || (r.email || '').toLowerCase().includes(q))) return false
      return true
    })
  }, [statusScoped, search, activeFilters])

  useEffect(() => { setPage(1) }, [search, statusFilter, activeFilters])
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
    const groupCount = new Set(rows.flatMap(r => r.groups || [])).size
    return { total: rows.length, active, mapped, stale, groupCount }
  }, [rows])

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

  {/* RES-2: a centred spinner at the default 300px height replaced the stat
      cards AND the whole filter bar, so everything below jumped down once
      real data landed. A full shaped skeleton (KPIGridSkeleton/TableSkeleton
      -- both still exported from SkeletonLoader.jsx) was tried first, but the
      rest of the app deliberately moved away from that -- see this file's own
      "Skeleton entry points now show the same simple loader so the shimmer
      never appears alongside it" comment, i.e. every other dashboard already
      renders a plain spinner, not a skeleton. Making Roster the one page with
      a bespoke skeleton would be the inconsistent choice here, not the fix.
      Kept the same InlineLoader, just given a height approximating the real
      loaded layout (stat strip + filter bar + a maxHeight:560 table +
      pagination) instead of the 300px default, so the page still settles
      into roughly the right amount of space up front. */}
  if (loading) return <InlineLoader label="Loading LeadSquared roster" height={760} />
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

      {createUsersRunning && createUsersProgress && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderRadius: 10, background: C.greenBg, marginBottom: 12, fontSize: 12.5, color: C.text, fontWeight: 700 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.green, flexShrink: 0 }} />
          Creating users "{createUsersProgress.label}" in background — {createUsersProgress.done} of {createUsersProgress.total}
          <span onClick={onOpenHistory} style={{ marginLeft: 'auto', cursor: 'pointer', color: C.blue, textDecoration: 'underline' }}>View progress</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ position: 'relative', flex: '1 1 260px', minWidth: 220, maxWidth: 380 }}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2.2" strokeLinecap="round" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            value={search} onChange={e => setSearch(e.target.value)} placeholder="Find someone by name or email…" aria-label="Find someone by name or email"
            style={{ ...inputStyle, width: '100%', padding: '7px 12px 7px 32px', fontSize: 13.5, borderRadius: 11 }}
          />
        </div>
        {Object.keys(activeFilters).map(key => {
          const field = TEAM_FILTERABLE_FIELDS.find(f => f.key === key)
          if (!field) return null
          return (
            <TeamFilterChip key={key} field={field} values={activeFilters[key]} options={filterOptions[key] || []}
              open={openFilterKey === key} onToggle={() => setOpenFilterKey(v => v === key ? null : key)}
              onToggleValue={v => toggleFilterValue(key, v)} onRemove={() => removeFilter(key)} />
          )
        })}
        <TeamAddFilterButton allFields={TEAM_FILTERABLE_FIELDS} activeFilters={activeFilters} filterOptions={filterOptions}
          open={openFilterKey === '__add'} onToggle={() => setOpenFilterKey(v => v === '__add' ? null : '__add')}
          onToggleValue={toggleFilterValue} />
        {Object.keys(activeFilters).length > 0 && (
          <button type="button" onClick={clearAllFilters} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.muted, fontSize: 11.5, fontWeight: 600, textDecoration: 'underline', flexShrink: 0 }}>Clear all</button>
        )}
        <Dropdown label="Status" options={['All', 'Active', 'Inactive']} value={statusFilter} onChange={setStatusFilter} minWidth={110} />
        <div style={{ flex: 1 }} />
        {isAdmin && <Button size="sm" icon={<UploadIcon />} onClick={() => setShowImport(true)}>Bulk import</Button>}
        {isAdmin && <Button size="sm" onClick={onOpenAddUser}>+ Add User</Button>}
        <ExportButton
          hideSlack hideJson hideSheets
          filename="team-mapping-roster"
          onExported={({ rows: n }) => logExportActivity('Roster CSV', n)}
          data={filtered.map(r => {
            // Virtual DID is still the one field that only exists once this row's
            // page has actually been visited (see the detailCache comment above) --
            // everything else here is bulk/instant off `r` itself now.
            const d = detailCache[r.id]
            return {
              Name: r.name, Email: r.email, 'LS Role': (r.role || '').replace(/_/g, ' '), Status: r.status,
              Groups: (r.groups || []).join('; '),
              Team: r.teamName || '',
              Phone: r.phoneMain || '', 'Virtual DID': d?.airtelNumber || '',
              'Region': classifyDidRegion(r.teamName, d?.airtelNumber) || '',
              // Same rule as the on-screen column: Team = University Admission
              // Opportunity, phone = Indian, Role = Consultant.
              'Call Transfer': (r.teamName && String(r.teamName).trim().toLowerCase() === FRAPP_TEAM_NAME
                && (r.manual?.role || '').trim().toLowerCase() === 'consultant'
                && classifyDidRegion(r.teamName, d?.airtelNumber) === 'Indian') ? 'Yes' : '',
              'Reporting Manager': r.managerName || '', 'Reporting Manager Email': r.managerEmail || '',
              'ASM/SM': r.manual?.asm_sm || '', 'ASM/SM Email': r.manual?.asm_sm_email || '',
              SSM: r.manual?.ssm || '', 'SSM Email': r.manual?.ssm_email || '',
              Role: r.manual?.role || '', Country: r.manual?.country || '',
              'Centre Name': r.manual?.centre_name || '',
            }
          })}
        />
        <Button variant="ghost" size="sm" icon={<ClockIcon />} onClick={onOpenHistory}>History</Button>
        <div style={{ position: 'relative' }}>
          <button type="button" onClick={() => setShowInfo(v => !v)} title="Column info" aria-label="Column info" aria-expanded={showInfo} style={{ width: 32, height: 32, borderRadius: 11, border: '0.5px solid ' + C.border, background: 'var(--card)', color: C.navy, fontStyle: 'italic', fontWeight: 800, fontSize: 13.5, cursor: 'pointer' }}>i</button>
          {showInfo && (
            <>
              <div onClick={() => setShowInfo(false)} style={{ position: 'fixed', inset: 0, zIndex: 300 }} />
              <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 400, width: 320, background: 'var(--card)', border: '1px solid ' + C.border, borderRadius: 10, boxShadow: '0 12px 32px -8px rgba(15,23,42,0.22)', padding: 14, fontSize: 11.5, color: C.text, lineHeight: 1.55 }}>
                <div style={{ fontWeight: 800, color: C.navy, marginBottom: 8 }}>How this roster works</div>
                <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <li>Name/Email/LS Role/Status/Groups/Team/Phone/Reporting Manager — live from LeadSquared, one bulk call for the whole roster.</li>
                  <li>Virtual DID — the one field with no bulk source; loads per page, briefly shows "…" on a page you haven't opened yet.</li>
                  <li>ASM/SM, SSM, Role, Country, Centre Name — the only manually entered fields.</li>
                  <li>Region — computed. "Indian"/"International" from Virtual DID, only on "University Admission Opportunity"; "—" elsewhere. Only "Indian" is ever pushed to Futwork (blocked server-side too).</li>
                  <li>No Virtual DID on that team? A muted "Main: Indian/International" hint from the Main Phone shows instead — informational only.</li>
                  <li>Call Transfer — computed: "Yes" only when Team = University Admission Opportunity, phone is Indian, and Role is Consultant.</li>
                  <li>+ Filter — filter by any column. Region/Call Transfer there read the same coach-directory cache the Frapp push uses{cacheSyncedAt ? ` (last synced ${new Date(cacheSyncedAt).toLocaleString()})` : ''} — resync via Connectors → "Sync coach directory" if it looks stale.</li>
                </ul>
              </div>
            </>
          )}
        </div>
      </div>

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

      {/* BAR-3: the page position used to be stated twice -- "Page X of Y"
          here, before the reader has even seen a control that relates to it,
          and "X / Y" again at the pagination controls below. Kept it in the
          one place that's actually next to the Prev/Next buttons that change
          it; the count up here is enough on its own. */}
      <Card title={`${fmtN(filtered.length)} people`} noPad>
        {/* TBL-1: Card's own outer wrapper is overflow:hidden (dashboardKit.jsx --
            shared across the whole app, so it can't be touched here without
            risking every other Card on every other page). A sticky header can't
            escape that clip if the PAGE is the one scrolling, so this inner div
            is made the bounded scroll container instead (maxHeight + its own
            overflowY) -- the same "sticky header + maxHeight wrapper" pattern
            already used for the BigQuery result table and the Activity Log
            table elsewhere in this app. Header <th>s get position:sticky;top:0;
            the checkbox and Name columns additionally get position:sticky;left
            so both freeze while scrolling right through the other 16 columns. */}
        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 560, position: 'relative' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 1000 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid ' + C.border }}>
                {isAdmin && (
                  <th style={{ padding: '9px 8px 9px 14px', width: TBL_CHECKBOX_COL_WIDTH, minWidth: TBL_CHECKBOX_COL_WIDTH, maxWidth: TBL_CHECKBOX_COL_WIDTH, position: 'sticky', top: 0, left: 0, zIndex: 3, background: 'var(--card)' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, cursor: 'pointer' }}>
                      <input type="checkbox" checked={pageAllSelected} onChange={togglePage} style={{ width: 15, height: 15, cursor: 'pointer', margin: 0 }} aria-label="Select all people on this page" title="Select everyone on this page" />
                    </label>
                  </th>
                )}
                {['Name', 'Email', 'LS Role', 'Status', 'Groups', 'Team', 'Phone', 'Virtual DID', 'Region', 'Call Transfer', 'LS Manager', 'ASM/SM', 'SSM', 'Role', 'Country', 'Centre', 'Mapping'].map((h, hi) => (
                  <th key={h} style={{
                    padding: '9px 12px', fontSize: 12, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
                    position: 'sticky', top: 0, zIndex: 2, background: 'var(--card)',
                    ...(hi === 0 ? { left: isAdmin ? TBL_CHECKBOX_COL_WIDTH : 0, zIndex: 3 } : {}),
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r, i) => {
                // Virtual DID is the only field still gated on the per-page detail
                // fetch -- Team/Phone/Reporting Manager are bulk/instant off `r`.
                const d = detailCache[r.id]
                const pendingDid = !d
                const onFrappTeam = r.teamName && String(r.teamName).trim().toLowerCase() === FRAPP_TEAM_NAME
                // Call Transfer: Team is University Admission Opportunity, phone is
                // Indian, and the (manual) business Role is Consultant -- Team/Role are
                // known immediately, so only the Indian/International check (which needs
                // Virtual DID) ever waits, and only for people who already clear the
                // other two.
                const isConsultant = (r.manual?.role || '').trim().toLowerCase() === 'consultant'
                const callTransferCandidate = onFrappTeam && isConsultant
                const stale = isStaleMapping(r.manual)
                // A frozen (position:sticky) cell needs a genuinely opaque
                // background -- 'transparent' let the row underneath show through
                // as soon as it was pinned mid-scroll, which is why this is now a
                // real resolved colour rather than the literal string 'transparent'.
                const rowBg = i % 2 ? 'var(--card)' : 'var(--bg3)'
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid ' + C.border, background: rowBg }}>
                    {isAdmin && (
                      <td style={{ padding: '10px 8px 10px 14px', width: TBL_CHECKBOX_COL_WIDTH, minWidth: TBL_CHECKBOX_COL_WIDTH, maxWidth: TBL_CHECKBOX_COL_WIDTH, position: 'sticky', left: 0, zIndex: 2, background: rowBg }}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, cursor: r.email ? 'pointer' : 'default' }}>
                          <input type="checkbox" checked={selected.has(r.email)} onChange={() => r.email && toggleOne(r.email)} disabled={!r.email} style={{ width: 15, height: 15, cursor: r.email ? 'pointer' : 'default', margin: 0 }} aria-label={r.name ? `Select ${r.name}` : 'Select this person'} />
                        </label>
                      </td>
                    )}
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', position: 'sticky', left: isAdmin ? TBL_CHECKBOX_COL_WIDTH : 0, zIndex: 1, background: rowBg }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <Avatar name={r.name} />
                        <span style={{ fontWeight: 700, color: C.text }}>{r.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '9px 12px', color: C.muted, whiteSpace: 'nowrap' }}>{r.email || '—'}</td>
                    <td style={{ padding: '9px 12px', color: C.text, whiteSpace: 'nowrap' }}>{(r.role || '').replace(/_/g, ' ')}</td>
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}><StatusBadge status={r.status} /></td>
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}><GroupsButton groups={r.groups} /></td>
                    <td style={{ padding: '9px 12px', color: C.text, whiteSpace: 'nowrap' }}>{r.teamName || '—'}</td>
                    <td style={{ padding: '9px 12px', color: C.text, whiteSpace: 'nowrap' }}>{r.phoneMain || '—'}</td>
                    <td style={{ padding: '9px 12px', color: C.text, whiteSpace: 'nowrap' }}>{pendingDid ? '…' : (d.airtelNumber || '—')}</td>
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                      {(onFrappTeam && pendingDid) ? '…' : (() => {
                        const region = classifyDidRegion(r.teamName, d?.airtelNumber)
                        if (region) return <span style={{ fontWeight: 700, color: region === 'Indian' ? C.green : C.navy }}>{region}</span>
                        // No enforced region (no Virtual DID, or not on the Frapp team) -- if
                        // there's still a Main Phone on file, show what IT suggests as a muted,
                        // clearly-secondary hint, never as if it were the real/enforced value.
                        const hint = onFrappTeam ? mainPhoneRegionHint(r.phoneMain) : null
                        if (!hint) return <span style={{ color: C.muted }}>—</span>
                        return <span style={{ color: C.muted, fontSize: 11.5 }} title="No Virtual DID on file -- this reflects the Main Phone number instead, not the enforced Frapp region">Main: {hint}</span>
                      })()}
                    </td>
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }} title="Team is University Admission Opportunity, phone is Indian, and Role is Consultant">
                      {!callTransferCandidate ? <span style={{ color: C.muted }}>—</span>
                        : pendingDid ? '…'
                        : classifyDidRegion(r.teamName, d.airtelNumber) === 'Indian'
                          ? <span style={{ fontWeight: 700, color: C.green }}>Yes</span>
                          : <span style={{ color: C.muted }}>—</span>}
                    </td>
                    <td style={{ padding: '9px 12px', color: C.text, whiteSpace: 'nowrap' }} title={r.managerEmail || ''}>{r.managerName || '—'}</td>
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
          rosterEmails={rosterEmails}
          centreOptions={centreOptions}
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
          rosterEmails={rosterEmails}
          centreOptions={centreOptions}
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
        deliberately exclude Phone/Virtual DID/Reporting Manager -- those need one LeadSquared call PER
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
              <ConnectorField label="Pull URL" hint="Anyone with this URL can read the roster + mapping (not Phone/Virtual DID/Reporting Manager) -- keep it private, same as a password.">
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

      <FrappCoachesSection form={form} setForm={setForm} save={save} saving={saving} />
    </div>
  )
}

// A 5th connector, kept visually separate from the four above rather than a
// 5th grid tile: unlike those four (which fire automatically on every save),
// this one is a deliberate manual action -- "Push to Frapp" writes into
// another company's production coach directory, and the very first pushes to
// a brand-new, unverified external integration are safer done on purpose
// than silently on every edit. Two steps, always in this order: sync the
// coach-directory cache (LeadSquared's Team/Virtual DID fields, no bulk fetch
// exists for these -- see team_mapping_ls_detail_cache_setup.sql), then
// preview/push, which reads that cache rather than hitting LeadSquared live.
function FrappCoachesSection({ form, setForm, save, saving }) {
  const [cacheStatus, setCacheStatus] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState(null) // { done, total }
  const [preview, setPreview] = useState(null)
  const [previewing, setPreviewing] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [msg, setMsg] = useState('')

  const loadCacheStatus = useCallback(() => {
    fetchJson(API + '&mode=team_detail_cache_status').then(setCacheStatus).catch(() => {})
  }, [])
  useEffect(() => { loadCacheStatus() }, [loadCacheStatus])

  // Client-driven sweep of the whole roster -- strictly sequential batches,
  // never parallel, so this can't pile onto LeadSquared's own rate limit the
  // way a burst of concurrent requests could. Same "no real background worker
  // on Vercel serverless" reasoning the bulk-import feature already solved
  // with a client-driven loop; this just sweeps instead of importing.
  //
  // Batch size and pacing are tuned against a REAL limit hit live on
  // 2026-08-24: "LeadSquared 429: API calls exceeded the limit of 72 in 5
  // second(s)". team_user_detail fires one LeadSquared call per id, all at
  // once (Promise.all server-side) -- the original 60-per-batch, no-delay
  // version burst well past that on the very first few batches. 15 ids per
  // batch with a 1.5s pause between batches keeps the worst case (several
  // batches landing inside the same rolling 5s window) comfortably under 72.
  const DETAIL_BATCH = 15
  const BATCH_DELAY_MS = 1500
  const sleep = ms => new Promise(res => setTimeout(res, ms))

  // Live-verified 2026-08-24: TWO separate runs both died with "Failed to
  // fetch" partway through (not a 429 -- a plain network-layer failure),
  // most likely the browser tab losing foreground/going idle for the several
  // minutes this sweep takes. Real risk for an actual admin too, not just
  // this session's own testing -- someone starts the sync then tabs away to
  // do something else. Two fixes: (1) retry ANY error here, not only a rate
  // limit -- a network blip deserves the same "try again, don't abort a
  // multi-minute sweep" treatment; (2) skip whoever the cache already has, so
  // a second run after a partial failure picks up where the first left off
  // in seconds instead of re-walking the whole roster from the start.
  const syncCoachDirectory = async () => {
    setSyncing(true); setMsg('')
    try {
      const [{ rows }, cacheRows] = await Promise.all([
        fetchJson(API + '&mode=team_users'),
        fetchJson(API + '&mode=team_detail_cache_list').catch(() => ({ emails: [] })),
      ])
      const already = new Set((cacheRows.emails || []).map(e => (e || '').toLowerCase()))
      const people = (rows || []).filter(r => r.id && r.email && !already.has(r.email.toLowerCase()))
      const totalForBar = people.length + already.size
      setSyncProgress({ done: already.size, total: totalForBar })
      if (already.size) setMsg(`Resuming -- ${fmtN(already.size)} already cached from an earlier run, ${fmtN(people.length)} left.`)

      for (let i = 0; i < people.length; i += DETAIL_BATCH) {
        const batch = people.slice(i, i + DETAIL_BATCH)
        const ids = batch.map(p => p.id).join(',')
        const emailById = {}
        batch.forEach(p => { emailById[p.id] = p.email })

        // Retry the whole batch (fetch + save) on ANY error, not just a rate
        // limit -- a network blip from a backgrounded tab deserves the same
        // "try again" treatment a 429 does. Backs off harder specifically for
        // a rate limit (it needs the account's own window to clear); a plain
        // network failure gets a shorter retry, since it's usually transient.
        let ok = false
        for (let attempt = 0; attempt < 6 && !ok; attempt++) {
          try {
            const r = await fetchJson(API + '&mode=team_user_detail&ids=' + encodeURIComponent(ids))
            const withEmail = (r.details || []).map(d => ({ ...d, email: emailById[d.id] || null }))
            await fetchJson(API + '&mode=team_detail_cache_save', {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ details: withEmail }),
            })
            ok = true
          } catch (e) {
            if (attempt === 5) throw e
            const isRateLimit = /429/.test(e.message || '')
            await sleep(isRateLimit ? 5000 * (attempt + 1) : 2000 * (attempt + 1))
          }
        }
        setSyncProgress({ done: Math.min(already.size + i + DETAIL_BATCH, totalForBar), total: totalForBar })
        await sleep(BATCH_DELAY_MS)
      }
    } catch (e) {
      setMsg('Sync stopped early: ' + (e.message || e) + ' -- whatever synced so far is saved, run it again to pick up where it left off.')
    } finally {
      setSyncing(false); setSyncProgress(null)
      await loadCacheStatus()
    }
  }

  const runPreview = async () => {
    setPreviewing(true); setMsg(''); setPreview(null)
    try { setPreview(await fetchJson(API + '&mode=team_frapp_preview')) }
    catch (e) { setMsg('Preview failed: ' + (e.message || e)) }
    finally { setPreviewing(false) }
  }

  const runPush = async () => {
    if (!preview || !preview.coaches.length) return
    if (!window.confirm(`Push ${preview.coaches.length} coach(es) to Frapp now? This writes into their production system.`)) return
    setPushing(true); setMsg('')
    try {
      const result = await fetchJson(API + '&mode=team_frapp_push', { method: 'POST' })
      setPreview(result)
      setMsg(`Pushed ${result.coaches.length} coach(es) to Frapp.`)
      fetchJson(API + '&mode=team_connectors_get').then(setForm).catch(() => {})
    } catch (e) {
      setMsg('Push failed: ' + (e.message || e))
    } finally {
      setPushing(false)
    }
  }

  return (
    <Card
      title="Frapp coaches push"
      sub={`Only Active people on the "University Admission Opportunity" LeadSquared team, with an Indian Virtual DID (see the "Region" column on Roster) -- name/email from LeadSquared, mobile from Virtual DID, country from the manual mapping`}
      noPad
    >
      <div style={{ padding: '14px 18px' }}>
        {msg && <div style={{ padding: '9px 14px', borderRadius: 8, background: C.navyBg, color: C.navy, fontSize: 12.5, fontWeight: 700, marginBottom: 14 }}>{msg}</div>}

        <label style={enableRowStyle}>
          <input type="checkbox" checked={!!form.frapp_enabled} onChange={e => save('frapp', { frapp_enabled: e.target.checked })} style={{ width: 15, height: 15 }} />
          Enabled
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 16, marginBottom: 14 }}>
          <div style={{ border: '1px solid ' + C.border, borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>1. Coach directory cache</div>
            <div style={{ fontSize: 12.5, color: C.text, marginBottom: 8 }}>
              {cacheStatus ? `${fmtN(cacheStatus.count)} people cached` : 'Loading…'}
              {cacheStatus && cacheStatus.lastSyncedAt && <span style={{ color: C.muted }}> · last synced {new Date(cacheStatus.lastSyncedAt).toLocaleString()}</span>}
            </div>
            {syncing && syncProgress && (
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>Syncing… {fmtN(syncProgress.done)} of {fmtN(syncProgress.total)}</div>
            )}
            <Button size="sm" onClick={syncCoachDirectory} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync coach directory'}</Button>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>Only needed once, or if a team change stops showing up. A new joiner or someone going inactive is picked up automatically on the next Preview/Push -- no manual sync needed for that. This button re-sweeps everyone (6-8 minutes) to catch anyone who switched teams while staying Active, which the automatic check can't see. Safe to leave the tab open and come back; a rate-limit hit mid-sweep retries automatically.</div>
          </div>

          <div style={{ border: '1px solid ' + C.border, borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>2. Preview, then push</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <ConnectorStatus status={form.frapp_last_status} at={form.frapp_last_at} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="ghost" size="sm" onClick={runPreview} disabled={previewing}>{previewing ? 'Loading…' : 'Preview'}</Button>
              <Button size="sm" onClick={runPush} disabled={pushing || !preview || !preview.coaches.length}>{pushing ? 'Pushing…' : 'Push to Frapp'}</Button>
            </div>
          </div>
        </div>

        {preview && (
          <div style={{ border: '1px solid ' + C.border, borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, marginBottom: 8 }}>
              {fmtN(preview.coaches.length)} coach(es) ready to send
            </div>
            {preview.autoHealed > 0 && (
              <div style={{ fontSize: 11.5, color: C.text, marginBottom: 8 }}>{fmtN(preview.autoHealed)} newly-active {preview.autoHealed === 1 ? 'person wasn\'t' : 'people weren\'t'} cached yet -- looked {preview.autoHealed === 1 ? 'them' : 'them all'} up just now automatically.</div>
            )}
            {(preview.uncached > 0 || preview.skippedNoMobile?.length > 0 || preview.skippedNoCountry?.length > 0 || preview.skippedInternational?.length > 0) && (
              <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 8 }}>
                {preview.uncached > 0 && <div>{fmtN(preview.uncached)} active people still couldn't be looked up (more than 240 new at once -- run "Sync coach directory" to catch the rest).</div>}
                {preview.skippedNoMobile?.length > 0 && <div>{preview.skippedNoMobile.length} on the team but missing a Virtual DID -- excluded: {preview.skippedNoMobile.slice(0, 5).join(', ')}{preview.skippedNoMobile.length > 5 ? '…' : ''}</div>}
                {preview.skippedNoCountry?.length > 0 && <div>{preview.skippedNoCountry.length} on the team but missing a Country mapping -- excluded: {preview.skippedNoCountry.slice(0, 5).join(', ')}{preview.skippedNoCountry.length > 5 ? '…' : ''}</div>}
                {preview.skippedInternational?.length > 0 && <div>{preview.skippedInternational.length} on the team with a non-Indian number -- blocked from Futwork: {preview.skippedInternational.slice(0, 5).join(', ')}{preview.skippedInternational.length > 5 ? '…' : ''}</div>}
              </div>
            )}
            {preview.coaches.length > 0 && (
              <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid ' + C.border, borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid ' + C.border, background: 'var(--bg3)' }}>
                      {['Name', 'Mobile', 'Email', 'Country'].map(h => (
                        <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 800, color: C.muted, textTransform: 'uppercase', fontSize: 10, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.coaches.map(c => (
                      <tr key={c.email} style={{ borderBottom: '1px solid ' + C.border }}>
                        <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>{c.name}</td>
                        <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>{c.mobile}</td>
                        <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>{c.email}</td>
                        <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>{c.country}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div style={{ fontSize: 11, color: C.muted, marginTop: 10 }}>
          A person who leaves the team or goes inactive is simply left out of the next push, not sent with a "removed" flag -- Frapp confirmed this API fully replaces their whole coach/call-routing list on every request, so leaving them out is the correct way to remove them.
        </div>
      </div>
    </Card>
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
            {activeTab === 'add-user' && ' / Add User'}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '2px 0 10px' }}>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.4px', fontFamily: FONT }}>
              {activeTab === 'history' ? 'Import & Export History' : activeTab === 'add-user' ? 'Add User' : 'Team Mapping'}
            </h1>
            {activeTab !== 'history' && activeTab !== 'connectors' && activeTab !== 'add-user' && (
              <Button variant="ghost" size="sm" icon={<span style={{ display: 'inline-flex', animation: refreshing ? 'teamMapSpin .6s linear infinite' : 'none' }}><RefreshIcon /></span>} onClick={doRefresh}>Refresh</Button>
            )}
          </div>
          {activeTab !== 'history' && activeTab !== 'add-user' && (
            // A11Y-1: these were plain <div onClick> -- looked and behaved
            // interactively for a mouse but a keyboard/screen-reader user could
            // not switch tabs at all. Real <button role="tab"> in a
            // role="tablist", roving tabindex (only the active tab is in the
            // Tab order, matching every standard tab widget), and Left/Right
            // arrow keys move + activate + move focus, per the WAI-ARIA tabs
            // pattern.
            <div role="tablist" aria-label="Team Mapping sections" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} className="lq-header-controls"
              onKeyDown={e => {
                if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
                e.preventDefault()
                const idx = TM_TABS.findIndex(t => t.id === activeTab)
                if (idx === -1) return
                const visible = TM_TABS.filter(t => !t.adminOnly || isAdmin)
                const vi = visible.findIndex(t => t.id === activeTab)
                const next = visible[(vi + (e.key === 'ArrowRight' ? 1 : -1) + visible.length) % visible.length]
                setTab(next.id)
                requestAnimationFrame(() => document.getElementById(`tm-tab-${next.id}`)?.focus())
              }}>
              {TM_TABS.filter(t => !t.adminOnly || isAdmin).map(t => (
                <button key={t.id} type="button" id={`tm-tab-${t.id}`} role="tab"
                  aria-selected={activeTab === t.id} aria-controls={`tm-panel-${t.id}`}
                  tabIndex={activeTab === t.id ? 0 : -1}
                  onClick={() => setTab(t.id)}
                  style={{ ...pillStyle(activeTab === t.id), fontFamily: FONT }}>
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <style>{`@keyframes teamMapSpin { to { transform: rotate(360deg) } }`}</style>
        <div id={activeTab !== 'history' && activeTab !== 'add-user' ? `tm-panel-${activeTab}` : undefined}
          role={activeTab !== 'history' && activeTab !== 'add-user' ? 'tabpanel' : undefined}
          aria-labelledby={activeTab !== 'history' && activeTab !== 'add-user' ? `tm-tab-${activeTab}` : undefined}
          style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
          {activeTab === 'roster' && <RosterTab isAdmin={isAdmin} onOpenHistory={() => setTab('history')} onOpenAddUser={() => setTab('add-user')} registerRefresh={registerRefresh} />}
          {activeTab === 'groups' && <GroupsTab registerRefresh={registerRefresh} />}
          {activeTab === 'orgchart' && <OrgChartTab registerRefresh={registerRefresh} isAdmin={isAdmin} />}
          {activeTab === 'connectors' && (isAdmin ? <ConnectorsTab /> : <div style={{ color: C.muted, fontSize: 13 }}>Admin only.</div>)}
          {activeTab === 'history' && <HistoryTab onBack={() => setTab('roster')} />}
          {activeTab === 'add-user' && (isAdmin
            ? <AddUserPageWrapper onBack={() => setTab('roster')} onBulkStarted={() => setTab('history')} />
            : <div style={{ color: C.muted, fontSize: 13 }}>Admin only.</div>)}
        </div>
      </div>
    </div>
  )
}
