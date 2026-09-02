// Super Tracker -- reads a PRIVATE Google Sheet ("Leverage_SuperTracker") via the
// real Sheets API, using the same dedicated service account already used for
// Sheets export (api/export-to-sheets.mjs) -- GOOGLE_SHEETS_CLIENT_EMAIL /
// GOOGLE_SHEETS_PRIVATE_KEY in Vercel env. The sheet is shared with that one
// service-account email as a Viewer, nothing else -- never made public. This is
// the first Quantum data source read this way; every other connected sheet uses
// the public gviz/tq CSV export instead, which this sheet's owner explicitly did
// not want (real company-wide revenue/business data across every vertical).
//
// Deliberately data-driven, not metric-specific: every tab in the workbook (a
// "section" -- B2C Metrics, B2B Metrics, Fly Finance, Fly Homes today) is
// discovered live from the sheet itself, and every column is matched by its own
// header TEXT rather than a fixed position -- so adding/renaming/reordering a
// section or a column in the sheet just works here with no code change. The
// things that ARE code (by explicit request -- "keep this flexibility... from
// repo to code") are: which of the workbook's tabs actually count as a Super
// Tracker section, what each one's short label/accent colour is (see
// SECTION_OVERRIDES), and which real-but-unwanted tabs are skipped entirely
// (see EXCLUDED_SECTIONS). The S.No.-prefix -> category mapping ("CC" ->
// "Content & Community", ...) is NOT hardcoded -- it's read live from the
// sheet's own "Reference Categories" tab, so it stays content, not code.

import { JWT } from 'google-auth-library'

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets'
const DEFAULT_SHEET_ID = '1z_39J8Lb7wsxQECsPtpiD00bZtdrLjIvHXVWG0FikCU'

export function superTrackerCreds() {
  return {
    clientEmail: process.env.GOOGLE_SHEETS_CLIENT_EMAIL || '',
    privateKey: (process.env.GOOGLE_SHEETS_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  }
}
export function superTrackerConfigured(c = superTrackerCreds()) {
  return Boolean(c.clientEmail && c.privateKey)
}

// Access tokens last ~1h -- cache in module scope, same pattern as lib/ga4.mjs.
let _tok = { value: null, exp: 0 }
async function accessToken(creds) {
  if (_tok.value && Date.now() < _tok.exp) return _tok.value
  if (!superTrackerConfigured(creds)) {
    throw new Error('Super Tracker is not configured -- set GOOGLE_SHEETS_CLIENT_EMAIL and GOOGLE_SHEETS_PRIVATE_KEY in Vercel env.')
  }
  const auth = new JWT({
    email: creds.clientEmail,
    key: creds.privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
  const { access_token, expiry_date } = await auth.authorize()
  _tok = { value: access_token, exp: expiry_date ? expiry_date - 60000 : Date.now() + 3300000 }
  return _tok.value
}

async function apiGet(token, path) {
  const r = await fetch(`${SHEETS_API}/${path}`, { headers: { Authorization: `Bearer ${token}` } })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) {
    const msg = d?.error?.message || `Sheets API error (HTTP ${r.status})`
    // The one error worth calling out by name: the service account genuinely
    // hasn't been granted access yet (or was removed), vs. some other failure.
    if (r.status === 403 || r.status === 404) {
      throw new Error(`${msg} -- make sure the sheet is shared with the service account (${process.env.GOOGLE_SHEETS_CLIENT_EMAIL || '(not set)'}) as a Viewer.`)
    }
    throw new Error(msg)
  }
  return d
}

// Which columns are recognised structurally (rather than becoming a "week"
// column) -- matched by header text, case-insensitive, trimmed. Everything else
// in the header row becomes a week column keyed by its own literal label
// ("24-30 Aug", "31 Aug-6 Sep", ...), so a new week added to the sheet just
// shows up here with zero code change.
const FIELD_HEADERS = {
  's. no.': 'sNo', 's.no.': 'sNo', 's no': 'sNo', 'sno': 'sNo',
  'metric': 'metric',
  'definition': 'definition',
  'business line': 'businessLine',
  'to be posted? (y/n)': 'toBePosted', 'to be posted?': 'toBePosted', 'to be posted': 'toBePosted',
  'owner': 'owner',
}

function normHeader(h) {
  return String(h || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

// A tab's real header row isn't always row 1 (every observed tab so far has a
// title + subtitle + a couple of spacer rows first) -- found by scanning for the
// first row containing a header whose normalised text matches 'metric' AND
// something matching 'owner' or 's. no.' close by, rather than assuming a fixed
// row number, so a sheet-side reformat that shifts things by a row doesn't
// silently break this.
function findHeaderRowIndex(values) {
  for (let i = 0; i < Math.min(values.length, 15); i++) {
    const row = values[i] || []
    const norm = row.map(normHeader)
    if (norm.includes('metric') && (norm.some(h => FIELD_HEADERS[h] === 'sNo') || norm.includes('owner'))) {
      return i
    }
  }
  return -1
}

// Section-level display config, keyed by the sheet's own tab title -- the one
// place metric-agnostic but sheet-structure-specific choices live in code, per
// explicit request. A tab NOT listed here still renders (falls back to its raw
// title + a neutral colour), so adding a real new tab to the workbook is never
// silently dropped -- only its presentation is generic until someone adds an
// entry here.
export const SECTION_OVERRIDES = {
  '01 | B2C METRICS': { label: 'B2C Metrics', accent: 'navy' },
  '02 | B2B METRICS': { label: 'B2B Metrics', accent: 'blue' },
  '03 | FLY FINANCE': { label: 'Fly Finance', accent: 'green' },
  '04 | FLY HOMES': { label: 'Fly Homes', accent: 'cyan' },
}

// Real tabs that DO carry a proper Metric/S.No. header (so they'd otherwise be
// treated as real sections) but aren't wanted here -- confirmed directly with
// the sheet owner: "01_Weekly_Scorecard - B2C" and "B2C Metrics_v2" are older/
// alternate layouts of the same B2C data, and "30_Targets" is a targets-only
// sheet, not a live weekly tracker. Skipped before they're even fetched, both
// to keep them off the page/Slack report entirely and to save the (real,
// measurable) latency of pulling two ~80-row tabs nobody wants.
export const EXCLUDED_SECTIONS = new Set(['01_Weekly_Scorecard - B2C', 'B2C Metrics_v2', '30_Targets'])

// A real tab the sheet owner added specifically to define the S.No. prefix ->
// category mapping ("CC" -> "Content & Community", "OOH" -> "Out of Home", ...)
// used to group metrics one level ABOVE the finer S.No. code. Read live from
// the sheet itself (not hardcoded) so a renamed/added category needs no code
// change here -- only lib/superTracker.mjs's OWN name for this tab is code, by
// the same "the tab list is code, the content is not" rule as SECTION_OVERRIDES.
const CATEGORY_TAB = 'Reference Categories'

async function fetchCategoryList(token, spreadsheetId) {
  try {
    const range = encodeURIComponent(`'${CATEGORY_TAB}'!A1:B50`)
    const data = await apiGet(token, `${spreadsheetId}/values/${range}?valueRenderOption=FORMATTED_VALUE`)
    return (data.values || [])
      .filter(r => r && r[0] && r[1])
      .map(r => ({ prefix: String(r[0]).trim(), name: String(r[1]).trim() }))
  } catch (_) {
    // Missing/renamed tab degrades to "no category grouping" rather than
    // failing the whole fetch -- every row just falls back to 'Uncategorized'.
    return []
  }
}

// Longest-prefix-first match against the START of the code, so "OOH02" hits
// the "OOH" entry rather than the shorter "O" one. Case-sensitive on purpose --
// every real code observed is upper-case, and a loose case-insensitive match
// risks a coincidental substring collision as more categories are added.
function categoryFor(sNo, categoryList) {
  const code = String(sNo || '').trim()
  const sorted = [...categoryList].sort((a, b) => b.prefix.length - a.prefix.length)
  const hit = sorted.find(c => code.startsWith(c.prefix))
  return hit ? hit.name : 'Uncategorized'
}

function cleanSectionLabel(rawTitle) {
  const override = SECTION_OVERRIDES[rawTitle]
  if (override) return override.label
  // Strip a leading "NN | " numbering prefix if the sheet follows that
  // convention, so a new tab added without an entry above still reads cleanly.
  return rawTitle.replace(/^\d+\s*\|\s*/, '')
}

function parseSheetTab(title, sheetId, values, categoryList) {
  const headerIdx = findHeaderRowIndex(values)
  if (headerIdx < 0) return { title, sheetId, label: cleanSectionLabel(title), accent: (SECTION_OVERRIDES[title] || {}).accent || 'navy', weekLabels: [], rows: [], unrecognized: true }
  const header = values[headerIdx]
  const colMeta = header.map((h, i) => {
    const norm = normHeader(h)
    const field = FIELD_HEADERS[norm]
    if (field) return { i, field }
    if (norm) return { i, field: 'week', label: String(h).trim() }
    return null
  }).filter(Boolean)
  const weekCols = colMeta.filter(c => c.field === 'week')
  const fieldCols = colMeta.filter(c => c.field !== 'week')

  const rows = []
  for (let r = headerIdx + 1; r < values.length; r++) {
    const row = values[r] || []
    const hasAny = row.some(v => String(v || '').trim() !== '')
    if (!hasAny) continue
    const metricCol = fieldCols.find(c => c.field === 'metric')
    const metric = metricCol ? String(row[metricCol.i] || '').trim() : ''
    if (!metric) continue // a stray formatted-but-empty row -- not a real metric
    const out = { businessLine: '', owner: '', toBePosted: '', definition: '', sNo: '' }
    fieldCols.forEach(c => { out[c.field] = String(row[c.i] || '').trim() })
    out.weeks = weekCols.map(c => ({ label: c.label, value: String(row[c.i] || '').trim() }))
    out.category = categoryFor(out.sNo, categoryList)
    rows.push(out)
  }
  return {
    title, sheetId,
    label: cleanSectionLabel(title),
    accent: (SECTION_OVERRIDES[title] || {}).accent || 'navy',
    weekLabels: weekCols.map(c => c.label),
    rows,
  }
}

export async function fetchSuperTracker(spreadsheetId = DEFAULT_SHEET_ID) {
  const token = await accessToken(superTrackerCreds())
  const meta = await apiGet(token, `${spreadsheetId}?fields=properties.title,sheets.properties`)
  const tabs = (meta.sheets || []).map(s => s.properties).filter(t => !EXCLUDED_SECTIONS.has(t.title))
  const categoryList = await fetchCategoryList(token, spreadsheetId)
  const sections = []
  for (const tab of tabs) {
    const range = encodeURIComponent(`'${tab.title}'!A1:ZZ2000`)
    // FORMATTED_VALUE (not UNFORMATTED_VALUE) deliberately -- this sheet mixes
    // currency, percentages, counts and free text across metrics with no fixed
    // schema, and formatted-as-displayed is the one rendering that's correct
    // for all of them without this code having to know what any given metric
    // means. A raw-number render would silently drop the sheet owner's own
    // formatting (e.g. "Rs 12,34,567" -> 1234567).
    const data = await apiGet(token, `${spreadsheetId}/values/${range}?valueRenderOption=FORMATTED_VALUE`)
    sections.push(parseSheetTab(tab.title, tab.sheetId, data.values || [], categoryList))
  }
  // The canonical order categories should render in -- Reference Categories'
  // OWN row order, not "whichever category a section's data happens to
  // mention first" -- so the same category always sits in the same position
  // across every section and every send, even one with sparse data.
  const categoryOrder = categoryList.map(c => c.name)
  return { workbookTitle: meta.properties?.title || '', sections, categoryOrder }
}
