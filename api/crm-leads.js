// CRM leads from published Google Sheet CSV, aggregated by exact ad name (opp_first_campaign_name).
// Optional ?since=YYYY-MM-DD&until=YYYY-MM-DD filters rows by lead_created_date so CRM matches the
// same window Meta is showing. Without params it aggregates all-time.
// Returns { byName: { <adName>: leads }, total, rows, distinct, since, until, ts }.
//
// humanQL/aiQL (FW_Human_QL_Count / FW_AI_QL_Count columns): these are PER-DAY counts, same shape
// as `leads` -- an earlier assumption that they were fixed ad-level constants (one value repeated
// on every row for that ad) turned out to be wrong for current sheet data: a spot-check of July
// data found 94 of 225 distinct ad names had more than one distinct (human,ai) value across their
// rows in the same month. So they're summed per ad name and filtered by since/until exactly like
// `leads`/byName, not read once from the first row seen.

// auth helpers loaded via dynamic import() inside handler (this file is bundled as
// CommonJS; a static import of the .mjs ESM file crashes with ERR_REQUIRE_ESM)

const DEFAULT_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1r-e6pBCN5ysfeD3Eq6sxgLmf97mdeTtloMPylqnx6Ew/gviz/tq?tqx=out:csv&sheet=FBleads';

async function getSheetUrl() {
  if (process.env.CRM_SHEET_URL) return process.env.CRM_SHEET_URL;
  try {
    const { supabaseAdmin } = await import('../lib/auth.mjs');
            const r = await supabaseAdmin('app_preferences?select=value&key=eq.sheet_url_fbleads&limit=1');
          if (r.ok) {
      const rows = await r.json();
      const v = rows[0] && rows[0].value;
      if (v && String(v).trim()) return String(v).trim();
    }
  } catch (_) {}
  return DEFAULT_SHEET_URL;
}
const MONTHS = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };

// Parse 'DD-Mon-YYYY' (e.g. 02-Jul-2026) -> 'YYYY-MM-DD'. Returns null if unparseable.
function toIso(d) {
  if (!d) return null;
  const m = String(d).trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return null;
  const mon = MONTHS[m[2].toLowerCase()];
  if (mon == null) return null;
  const dd = String(m[1]).padStart(2, '0');
  const mm = String(mon + 1).padStart(2, '0');
  return m[3] + '-' + mm + '-' + dd;
}

function splitCsvLine(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else { q = false; } }
      else cur += ch;
    } else {
      if (ch === '"') q = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

// ── LeadSquared (live API) ──────────────────────────────────────────────────
// Merged into this endpoint rather than a new /api file -- Vercel Hobby is at the
// 12-function cap. Reached via ?source=leadsquared&mode=leads|opportunities|opportunity_meta|activities|activity_types.
//
// Credentials: LEADSQUARED_ACCESS_KEY / LEADSQUARED_SECRET_KEY, Vercel env only (never
// app_preferences -- that table is readable with the public anon key, see the Slack bot
// token note elsewhere in this repo for the same reasoning).
//
// Host: LeadSquared's API host is region-specific and different from the account's UI
// subdomain. The UI links elsewhere in this app point at in21.leadsquared.com, which per
// LeadSquared's own host table (https://apidocs.leadsquared.com/api-host/) maps to the
// India-Mumbai API host below. LEADSQUARED_API_HOST overrides this if it's wrong --
// LeadSquared's own 401 response names the correct host when you guess wrong, so a
// mismatch here is self-diagnosing, not a dead end.
const LEADSQUARED_DEFAULT_HOST = 'https://api-in21.leadsquared.com'

function leadsquaredCreds() {
  const accessKey = process.env.LEADSQUARED_ACCESS_KEY
  const secretKey = process.env.LEADSQUARED_SECRET_KEY
  const host = process.env.LEADSQUARED_API_HOST || LEADSQUARED_DEFAULT_HOST
  return { accessKey, secretKey, host }
}

async function leadsquaredRequest(method, path, { accessKey, secretKey, host }, body, extraQuery) {
  const qs = new URLSearchParams({ accessKey, secretKey, ...(extraQuery || {}) })
  const url = host.replace(/\/$/, '') + path + '?' + qs.toString()
  const r = await fetch(url, method === 'GET' ? undefined : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await r.text()
  let data
  try { data = JSON.parse(text) } catch { data = text }
  if (!r.ok) {
    // LeadSquared's 401 on a wrong regional host names the right one in the body --
    // surface that verbatim instead of a generic "unauthorized" so it's actionable.
    const msg = (data && (data.ExceptionMessage || data.Message)) || (typeof data === 'string' ? data.slice(0, 300) : JSON.stringify(data).slice(0, 300))
    throw new Error(`LeadSquared ${r.status}: ${msg}`)
  }
  return data
}
async function leadsquaredPost(path, creds, body, extraQuery) { return leadsquaredRequest('POST', path, creds, body, extraQuery) }
async function leadsquaredGet(path, creds, extraQuery) { return leadsquaredRequest('GET', path, creds, undefined, extraQuery) }

// LeadSquared's own per-request page-size ceiling -- confirmed live against this real
// account (requesting more is silently clamped, and page 2 of a "page 1" request reliably
// returns a full second 1000 with zero overlap), so this was NEVER the real reason every
// tab topped out at 1000 total. The real reason: every caller here used to fetch exactly
// ONE page and never asked for page 2+. fetchAllPages loops PageIndex 1,2,3... until a page
// comes back short (real end of data) or `maxPages` is hit -- bounded, not unlimited,
// because real volume on this account varies wildly by data type: Leads/Opportunities run a
// few thousand per typical window, but one single Activity Type alone was measured live at
// 15.8 MILLION total records account-wide, so looping "until done" for Activities would
// either time out this function or hammer LeadSquared's API for no useful reason -- nobody
// scrolls a 15M-row grid. Each caller below picks a cap sized to its own real volume.
const LSQ_PAGE_SIZE = 1000
// Fetches page 1 alone first (its length already tells us whether a page 2 could possibly
// exist), then -- if more might be needed -- fires pages 2..maxPages CONCURRENTLY rather
// than one at a time. Sequential looping here was a real, measured problem: a single day of
// one Activity Type took ~40s wall-clock (5 pages + up to 5 more chunked contact-name
// lookups, every one of them awaited one after another) -- close enough to the 60s function
// budget to risk timing out on a slightly wider window, and a genuinely bad "Loading..."
// wait either way. Each PageIndex is an independent, self-contained request (not a cursor
// that depends on the previous response), so requesting them in parallel is safe; the only
// correctness nuance is truncating the result at the first page (IN ORDER) that came back
// short, even if a later page in the same parallel batch happened to come back full -- that
// can only happen if data changed mid-fetch, and "trust the earliest signal of the true end"
// is the safer read.
async function fetchAllPages(fetchPage, maxPages) {
  const first = await fetchPage(1, LSQ_PAGE_SIZE)
  if (first.length < LSQ_PAGE_SIZE) return { rows: first, truncated: false } // real end of data on page 1 itself
  if (maxPages <= 1) return { rows: first, truncated: true } // page 1 was full and the cap is 1 -- more may exist, unknown
  const restIndexes = []
  for (let i = 2; i <= maxPages; i++) restIndexes.push(i)
  const rest = await Promise.all(restIndexes.map(i => fetchPage(i, LSQ_PAGE_SIZE)))
  let rows = first.slice()
  let truncated = true
  for (const page of rest) {
    rows = rows.concat(page)
    if (page.length < LSQ_PAGE_SIZE) { truncated = false; break }
  }
  return { rows, truncated }
}

// Last 7 complete days -- the default window for the by-event-code activity feed below.
function defaultRecentWindow() {
  const toIso = d => d.toISOString().slice(0, 10)
  const until = new Date()
  const since = new Date(until.getTime() - 7 * 86400000)
  return { since: toIso(since), until: toIso(until) }
}

// LeadSquared's own "Lead Capture" event (code 23) -- fires for every new lead regardless
// of source, so it's a safe, always-populated default Activity Type when the caller hasn't
// picked one yet (e.g. a bare connection test, or a fresh page load before the user has
// chosen a type from the activity_types dropdown).
const DEFAULT_ACTIVITY_EVENT_CODE = 23

// Leads.Get (advanced search by lead criteria) -- filters mirror what LeadSquared's own
// "Manage Leads" grid filters on: a field name (LookupName), an operator, and a value.
// since/until filter on CreatedOn, matching the date-range convention every other data
// source in this app already uses.
// 10 pages (10,000 rows) -- generous headroom over the old flat 1000 cap; live-tested
// against this account's default 30-day window, which already returned a full 2,000+
// (page 1 AND page 2 both came back completely full) with the OLD single-page code, so the
// old cap wasn't a rare edge case, it silently dropped real rows on an ordinary page load.
const LEADS_MAX_PAGES = 10
async function fetchLeadSquaredLeads(creds, { since, until }) {
  const fetchPage = (pageIndex, pageSize) => leadsquaredPost('/v2/LeadManagement.svc/Leads.Get', creds, {
    Parameter: since || until
      ? { LookupName: 'CreatedOn', LookupValue: (since || '1900-01-01') + ' 00:00:00', SqlOperator: '>=' }
      : { LookupName: 'CreatedOn', LookupValue: '1900-01-01 00:00:00', SqlOperator: '>=' },
    Columns: { Include_CSV: 'ProspectID,FirstName,LastName,EmailAddress,Phone,Mobile,LeadType,Source,Status,ProspectStage,Owner,CreatedOn,ModifiedOn' },
    Sorting: { ColumnName: 'CreatedOn', Direction: '1' },
    Paging: { PageIndex: pageIndex, PageSize: pageSize },
  }).then(data => Array.isArray(data) ? data : (data && data.Leads) || [])

  const { rows, truncated } = await fetchAllPages(fetchPage, LEADS_MAX_PAGES)
  // until isn't expressible as a second SqlOperator in one Parameter block (the API takes
  // one field/operator/value triple) -- filtered client-side on the returned rows instead.
  const filtered = until ? rows.filter(r => !r.CreatedOn || r.CreatedOn <= until + ' 23:59:59') : rows
  const ownerMap = await fetchLeadSquaredUsersMap(creds)
  filtered.forEach(r => { if (r.Owner) r.OwnerName = ownerMap[r.Owner] || r.Owner })
  return { rows: filtered, count: filtered.length, truncated, since, until }
}

// UserManagement.svc/Users.Get -- resolves a GUID like Owner/CreatedBy into a real display
// name. LeadSquared's own UI shows real names in these columns (verified live: "Futwork AI",
// "JULIUS ALICE MAUYON"), not raw GUIDs, so this is needed for parity, not a nice-to-have.
// Cached in-memory per cold start -- same pattern as the opportunity-metadata cache below,
// since the user list is effectively static within a session.
let _lsqUsersCache = null
async function fetchLeadSquaredUsersMap(creds) {
  if (_lsqUsersCache) return _lsqUsersCache
  const data = await leadsquaredGet('/v2/UserManagement.svc/Users.Get', creds)
  const rows = Array.isArray(data) ? data : []
  const byId = {}
  rows.forEach(u => { byId[u.ID] = [u.FirstName, u.LastName].filter(Boolean).join(' ').trim() || u.EmailAddress || u.ID })
  _lsqUsersCache = byId
  return byId
}

// Opportunity/Retrieve/BySearchParameter -- OpportunityEventCode is account-specific;
// 12003 is the code this same LeadSquared account already uses elsewhere in this app
// (see LEADSQUARED_OPPORTUNITY_EVENT in HumanQLDetailDashboard.jsx) for opportunity deep
// links, so it's reused here as the default rather than guessed fresh.
// 10 pages (10,000 rows) -- same reasoning/cap as Leads above (live-tested: 12 pages/12,000
// rows all came back completely full on this account's real Opportunity data before this
// was bounded, so the true total comfortably exceeds this cap too, but 10,000 covers any
// realistic date-window view with room to spare).
const OPPORTUNITIES_MAX_PAGES = 10
async function fetchLeadSquaredOpportunities(creds, { since, until, eventCode, status }) {
  const code = Number(eventCode) || 12003
  // First real error hit against the live account: "AdvancedSearch criteria does not match
  // ActivityEvent passed" -- this search REQUIRES the AdvancedSearch to restate the same
  // OpportunityEventCode as its own condition (LSO:"ActivityEvent"/LSO_Type:"PAEvent"), it
  // is not implied by OpportunityEventCode alone. This condition is now always present and
  // is the ONLY RowCondition sent -- it's the one shape actually confirmed to work.
  //
  // A CreatedOn "between" RowCondition was tried here next and turned out to be a wrong
  // guess -- it 400'd with "request body contains malformed or unexpected JSON" on every
  // real attempt. Root-caused by intercepting LeadSquared's OWN frontend request (its
  // internal ActivityGrid endpoint) while changing the date filter in the real UI: date
  // range there is sent as separate top-level DateRangeFrom/DateRangeTo fields, NOT as an
  // AdvancedSearch RowCondition at all -- so there was never a matching RowCondition shape
  // to find, on this endpoint, for a plain date field. Status was never verified as a
  // RowCondition either (only ActivityEvent has a confirmed-working example) so it's not
  // risked here. Both since/until and status are filtered on the returned page client-side
  // instead -- safe because Sorting below is newest-first, so the top `pageSize` rows are
  // exactly the most recent ones a date-window filter would want anyway.
  const rowCondition = [{ SubConOp: 'And', LSO: 'ActivityEvent', LSO_Type: 'PAEvent', Operator: 'eq', RSO: String(code) }]
  const advancedSearch = {
    GrpConOp: 'And',
    Conditions: [{ Type: 'Activity', ConOp: 'and', RowCondition: rowCondition }],
    QueryTimeZone: 'India Standard Time',
  }
  // Cross-checked live against LeadSquared's own internal grid (its ActivityGrid endpoint,
  // intercepted directly): with every filter genuinely cleared (Owner/Status/Stage all
  // "any", date range "All Time"), the real "University Admission Opportunity" total is
  // 4,870,025 -- not the few thousand this assumed. RecordCount here is the SAME real number
  // this endpoint's own docs promise, so it's captured once and surfaced honestly instead of
  // silently implying our bounded page-fetch (below) is anywhere close to complete.
  let totalCount = null
  const fetchPage = (pageIndex, pageSize) => leadsquaredPost('/v2/OpportunityManagement.svc/Retrieve/BySearchParameter', creds, {
    OpportunityEventCode: code,
    AdvancedSearch: JSON.stringify(advancedSearch),
    Paging: { PageIndex: pageIndex, PageSize: pageSize },
    Sorting: { ColumnName: 'CreatedOn', Direction: 1 },
  }).then(data => {
    // Response shape is {"RecordCount":N,"List":[...]} per apidocs.leadsquared.com's own
    // documented example -- the original code checked data.Opportunities/data.RecordSet,
    // neither of which the docs ever showed; that silently returned [] even when the API
    // had real matching rows under "List", which is why every prior test here only ever
    // proved "no error", never "real data comes back". Confirmed live after fixing.
    if (totalCount == null && data && typeof data.RecordCount === 'number') totalCount = data.RecordCount
    return Array.isArray(data) ? data : (data && (data.List || data.Opportunities || data.RecordSet)) || []
  })
  const { rows: fetchedRows, truncated } = await fetchAllPages(fetchPage, OPPORTUNITIES_MAX_PAGES)
  let rows = fetchedRows
  if (since) rows = rows.filter(r => !r.CreatedOn || r.CreatedOn >= since + ' 00:00:00')
  if (until) rows = rows.filter(r => !r.CreatedOn || r.CreatedOn <= until + ' 23:59:59')
  if (status) rows = rows.filter(r => r.Status === status)
  const [ownerMap, contactNames, typeMeta] = await Promise.all([
    fetchLeadSquaredUsersMap(creds),
    fetchLeadSquaredContactNames(creds, rows.map(r => r.RelatedProspectId)),
    fetchLeadSquaredOpportunityMeta(creds, { eventCode: code }).catch(() => null),
  ])

  // Same "resolve real field labels, never a raw mx_Custom_N key" treatment already proven
  // out on Activities below -- GetOpportunityTypeMetadata's Fields array (confirmed live:
  // 105 fields configured on this account's opportunity type, e.g. mx_Custom_81 => "Last
  // Disposition from Superbot", mx_Custom_100 => "Last Disposition from Futwork" -- two
  // genuinely distinct real fields the old hardcoded switch below silently merged into one
  // fake "Last Disposition" via `||`) is the only real source of truth for what "all the
  // columns" means here. Deliberately does NOT special-case mx_Custom_1 ("Opportunity
  // Name")/mx_Custom_2 ("Stage")/etc. as separate "base" columns the way the old hardcoded
  // list did -- they're just ordinary configured custom fields in LeadSquared's own data
  // model, so they flow through this same dynamic list (already sorted near the top by
  // their own real Sequence) exactly like the real product treats them.
  const fieldOrder = []
  const fieldLabels = {}
  if (typeMeta && Array.isArray(typeMeta.Fields)) {
    typeMeta.Fields
      .filter(f => f.SchemaName && f.SchemaName.startsWith('mx_Custom_'))
      .sort((a, b) => (a.Sequence || 0) - (b.Sequence || 0))
      .forEach(f => { fieldLabels[f.SchemaName] = f.DisplayName || f.SchemaName; fieldOrder.push(f.DisplayName || f.SchemaName) })
  }
  rows.forEach(r => {
    if (r.Owner) r.OwnerName = ownerMap[r.Owner] || r.Owner
    r.ContactName = contactNames[r.RelatedProspectId] || null
    const fields = {}
    Object.keys(r).forEach(k => {
      if (k.startsWith('mx_Custom_') && r[k] != null && r[k] !== '') fields[fieldLabels[k] || k] = r[k]
    })
    r.Fields = fields
  })
  // If the metadata call failed (or a key it never described shows up anyway), fall back to
  // the union of whatever custom-field keys were actually observed in the real data -- a
  // metadata hiccup should never silently hide a column real data clearly has.
  if (!fieldOrder.length) {
    const seen = new Set()
    rows.forEach(r => Object.keys(r.Fields || {}).forEach(k => seen.add(k)))
    fieldOrder.push(...seen)
  }

  // allTimeTotal is NOT scoped to the requested date window -- this endpoint's date filter
  // only ever runs client-side on whatever page(s) get fetched (see the long comment on
  // rowCondition above for why), so RecordCount here reflects every Opportunity of this
  // type ever created, account-wide. Deliberately kept separate from `truncated` (which IS
  // about this window) rather than combined into one misleading "X of Y" -- comparing a
  // few thousand windowed rows against a multi-million all-time count would make the
  // truncation banner fire on every single load regardless of whether the window itself was
  // fully captured.
  return { rows, count: rows.length, truncated, allTimeTotal: totalCount, since, until, fieldColumns: fieldOrder }
}

// ProspectActivity.svc/Retrieve -- single-lead activity timeline (leadId given), OR the
// bulk cross-lead "Manage Activity" feed (no leadId), always scoped to one Activity Type
// via CustomActivity/RetrieveByActivityEvent.
//
// RetrieveRecentlyModified (the "all activity types combined" feed) was tried first and
// DROPPED -- verified live against this real account that it fails with LeadSquared's own
// generic "There was an error processing the request. Please contact administrator." on
// EVERY window tested, including a single day, not just wide ones. CustomActivity/
// RetrieveByActivityEvent (one Activity Type + date window) works reliably and even
// handles a 7-day window fine, returning real data (verified: 78,350 rows for eventCode 23
// "Lead Capture" over 7 days) -- so this account can browse activity, just not "all types
// at once"; the caller must pick a type (via the activity_types mode) exactly like
// LeadSquared's own Manage Activity screen already requires you to filter by Activity Type.
// Also returns CreatedByName/CreatedByEmailAddress (the real actor), which the dropped
// all-types feed never carried anyway.
// CustomActivity/GetActivitySetting -- real field schema (SchemaName -> DisplayName) for
// ONE Activity Type, same idea as GetOpportunityTypeMetadata but for activities. Without
// this, custom fields only come back as raw mx_Custom_N keys, which is meaningless in a
// UI -- LeadSquared's own Manage Activities screen shows real column names ("Country
// Interested", "Disposition", "Preferred Course", ...) resolved from exactly this endpoint.
// Cached per activity type per cold start (same reasoning as the opportunity-meta cache:
// this schema is effectively static, it only changes if someone edits the activity type
// in LeadSquared's own Settings).
const _lsqActivityMetaCache = {}
async function fetchLeadSquaredActivityTypeMeta(creds, eventCode, bypassCache) {
  const code = String(eventCode)
  if (!bypassCache && _lsqActivityMetaCache[code]) return _lsqActivityMetaCache[code]
  const data = await leadsquaredGet('/v2/ProspectActivity.svc/CustomActivity/GetActivitySetting', creds, { code })
  _lsqActivityMetaCache[code] = data
  return data
}

// Same schema GetActivitySetting already returns (see fetchLeadSquaredActivityTypeMeta
// above), reshaped for the Field Schema page: DisplayName/SchemaName/DataType/IsMandatory
// per field, in Sequence order -- the exact table LeadSquared's own Settings >
// Custom Notable Activity Type screen shows. `refresh` bypasses the per-cold-start
// cache, for right after someone edits a field in LeadSquared and wants to see it
// reflected immediately rather than waiting for this container to recycle.
// LeadSquared's real GetActivitySetting response (confirmed live, not just from
// docs) carries NO per-field CreatedOn/ModifiedOn/CreatedBy/ModifiedBy at all --
// the field object's full key list is SchemaName/InternalName/DisplayName/Value/
// DataType/IsMandatory/ShowInForm/Sequence/ParentField/OptionSet/
// DependentOptionSet/IsDefault/IsReadOnly/RenderType/ExportAsPlainText/
// IsMultiSelectDropdown/IncludeOthersOption/BehaviorOnMissingDropdownOption/
// IsOthersValue/InternalSchemaName/MaxFieldLength/StringRenderType/
// IsViewRestrictedField/IsSortable/IsEncrypted/DisplayValue/IsMasked -- none of
// which is a timestamp or an author. LeadSquared's own "Get Activity Change
// History" API (RetrieveActivityChange) tracks value edits on individual
// ACTIVITY RECORDS, not schema/field definitions; its Admin Audit Logs cover only
// SLA Policies/Assignment Rules; its Lead Field Audit is Lead-entity-only with no
// API. None of the four exposes who added/changed an activity-type field, or
// when -- confirmed, not assumed. A Quantum-side "first seen" tracker was tried
// and deliberately removed: the ask was for LeadSquared's own record, not
// Quantum's guess at one, so this page has no Created/Modified columns at all.
async function fetchLeadSquaredActivitySchema(creds, { code, refresh }) {
  if (!code) throw new Error('code is required')
  const data = await fetchLeadSquaredActivityTypeMeta(creds, code, !!refresh)
  // dataType is passed through verbatim (whatever string LeadSquared's own API
  // returns, e.g. "String"/"SearchableDropdown"/"ActiveUsers") rather than
  // guessed/relabeled here -- confirmed live in Settings > Custom Notable
  // Activity Type that only Dropdown-family fields have any options concept at
  // all (a String field's own edit screen has no options UI), so the frontend
  // only offers "View options" for those.
  const fields = Array.isArray(data && data.Fields) ? data.Fields
    .slice()
    .sort((a, b) => (a.Sequence || 0) - (b.Sequence || 0))
    .map(f => ({
      schemaName: f.SchemaName, displayName: f.DisplayName || f.SchemaName,
      dataType: f.DataType || '', isMandatory: !!f.IsMandatory,
    })) : []
  return { code: String(code), displayName: (data && data.DisplayName) || '', score: (data && data.Score) || 0, fields }
}

// ActivityField/Dropdown/Options/Get -- the authoritative list of values LeadSquared
// will actually accept for one Dropdown-type custom field, straight from Settings >
// Custom Notable Activity Type's own picklist config (not guessed from past postback
// data). This is what the Futwork Errors page's "invalid dropdown option" failures are
// being rejected against -- surfacing it lets someone see, side by side, what Futwork
// sent vs. what LeadSquared will actually accept for that exact field.
async function fetchLeadSquaredDropdownOptions(creds, { code, schemaName }) {
  if (!code || !schemaName) throw new Error('code and schemaName are required')
  const data = await leadsquaredPost('/v2/ProspectActivity.svc/ActivityField/Dropdown/Options/Get', creds,
    { Parameter: { SchemaName: schemaName, ActivityEventCode: Number(code) } }, {})
  return { options: (data && data.Options) || [] }
}

// Leads/Retrieve/ByIds -- resolves RelatedProspectId GUIDs into real contact names. Same
// reasoning as the Owner-name resolution: LeadSquared's own Manage Activities screen shows
// a real "Contacts Name" column, not a bare GUID, and the activity response itself only
// ever carries the GUID.
async function fetchLeadSquaredContactNames(creds, ids) {
  const unique = Array.from(new Set(ids.filter(Boolean)))
  if (!unique.length) return {}
  // PageSize here caps the RESULT rows at 1000, same real ceiling as everywhere else in
  // this file -- with the row caps above now allowing up to 10,000 leads/opportunities or
  // 5,000 activities in one load, the number of DISTINCT contacts among them can easily
  // exceed 1000 too. Chunking the INPUT id list into groups of <=1000 guarantees each
  // chunk's own result set is small enough to fit in one un-paginated response.
  const chunks = []
  for (let i = 0; i < unique.length; i += 1000) chunks.push(unique.slice(i, i + 1000))
  // Chunks are independent lookups (no shared cursor/state) -- fired concurrently rather
  // than one at a time, same reasoning as fetchAllPages above.
  const results = await Promise.all(chunks.map(chunk => leadsquaredPost('/v2/LeadManagement.svc/Leads/Retrieve/ByIds', creds, {
    SearchParameters: { LeadIds: chunk },
    Columns: { Include_CSV: 'ProspectID,FirstName,LastName' },
    Paging: { PageIndex: 1, PageSize: 1000 },
  })))
  const map = {}
  results.forEach(data => {
    const rows = (data && data.Leads) || []
    rows.forEach(r => { if (r.ProspectID) map[r.ProspectID] = [r.FirstName, r.LastName].filter(Boolean).join(' ').trim() || null })
  })
  return map
}

// A minority of activity types carry a plain string in ActivityEvent_Note (verified live:
// "Call queued successfully at Futwork" for "Manual Lead Qualification - Futwork") rather
// than the {keyvalueinfo}{...} blob "Lead Capture" uses. Both are folded into the same
// Fields dict below so the frontend never has to know which shape a given type uses.
function parseKeyValueNote(note) {
  if (!note || typeof note !== 'string' || !note.startsWith('{keyvalueinfo}')) return {}
  const body = note.replace(/^\{keyvalueinfo\}/, '')
  const out = {}
  body.split('{next}').forEach(pair => {
    const idx = pair.indexOf('{=}')
    if (idx === -1) return
    const k = pair.slice(0, idx).replace(/^\{/, '').trim()
    const v = pair.slice(idx + 3).replace(/\}+$/, '').trim()
    if (k) out[k] = v
  })
  return out
}

// Only 5 pages (5,000 rows) here, well below the Leads/Opportunities cap -- confirmed live
// that ONE Activity Type on this account alone totals 15.8 MILLION records account-wide
// (via the real RecordCount this same endpoint returns), so "loop until done" is never the
// right move here. Real LeadSquared's own Manage Activities screen doesn't bulk-load
// millions of rows into one grid either -- it paginates and expects you to narrow the
// Activity Type/date window, which is why `totalCount` below (LeadSquared's own RecordCount
// for the full window, independent of how many rows were actually fetched) is surfaced
// honestly to the frontend rather than silently presenting 1,000 or 5,000 as if it were
// everything.
const ACTIVITIES_MAX_PAGES = 5
async function fetchLeadSquaredActivities(creds, { leadId, since, until, eventCode, pageIndex, pageSize }) {
  if (leadId) {
    const body = { Parameter: {}, Paging: { Offset: '0', RowCount: String(Math.min(pageSize || 50, 1000)) } }
    const data = await leadsquaredPost('/v2/ProspectActivity.svc/Retrieve', creds, body, { leadId })
    const rows = (data && data.ProspectActivities) || []
    return { rows, count: (data && data.RecordCount) || rows.length, leadId }
  }
  const win = (!since && !until) ? defaultRecentWindow() : { since, until }
  const fromDate = (win.since || defaultRecentWindow().since) + ' 00:00:00'
  const toDate = (win.until || defaultRecentWindow().until) + ' 23:59:59'
  const code = Number(eventCode) || DEFAULT_ACTIVITY_EVENT_CODE

  let totalCount = null
  const fetchPage = (pi, ps) => leadsquaredPost('/v2/ProspectActivity.svc/CustomActivity/RetrieveByActivityEvent', creds, {
    Parameter: { FromDate: fromDate, ToDate: toDate, ActivityEvent: code, RemoveEmptyValue: true },
    Paging: { PageIndex: pi, PageSize: ps },
    Sorting: { ColumnName: 'CreatedOn', Direction: 1 },
  }).then(data => {
    // RecordCount is the real total matching this Activity Type + date window, independent
    // of PageSize -- captured once (it's the same value on every page) so the frontend can
    // show "X of Y" honestly instead of presenting whatever we fetched as if it were all of it.
    if (totalCount == null && data && typeof data.RecordCount === 'number') totalCount = data.RecordCount
    return (data && data.List) || []
  })
  const { rows, truncated: pageCapped } = await fetchAllPages(fetchPage, ACTIVITIES_MAX_PAGES)
  const truncated = pageCapped || (totalCount != null && totalCount > rows.length)

  // Resolve everything LeadSquared's own Manage Activities screen would show, so the
  // frontend never has to render a raw GUID or a raw mx_Custom_N key.
  const [typeMeta, contactNames] = await Promise.all([
    fetchLeadSquaredActivityTypeMeta(creds, code).catch(() => null),
    fetchLeadSquaredContactNames(creds, rows.map(r => r.RelatedProspectId)),
  ])
  const fieldOrder = []
  const fieldLabels = {}
  if (typeMeta && Array.isArray(typeMeta.Fields)) {
    typeMeta.Fields
      .filter(f => f.SchemaName && f.SchemaName.startsWith('mx_Custom_'))
      .sort((a, b) => (a.Sequence || 0) - (b.Sequence || 0))
      .forEach(f => { fieldLabels[f.SchemaName] = f.DisplayName || f.SchemaName; fieldOrder.push(f.DisplayName || f.SchemaName) })
  }
  rows.forEach(r => {
    r.ContactName = contactNames[r.RelatedProspectId] || null
    const fields = { ...parseKeyValueNote(r.ActivityEvent_Note) }
    if (r.ActivityEvent_Note && !r.ActivityEvent_Note.startsWith('{keyvalueinfo}')) fields['Note'] = r.ActivityEvent_Note
    Object.keys(r).forEach(k => {
      if (k.startsWith('mx_Custom_') && r[k] != null && r[k] !== '') {
        fields[fieldLabels[k] || k] = r[k]
      }
    })
    r.Fields = fields
  })
  // If the metadata call failed, fall back to the union of custom-field keys actually
  // observed in the real data (including the ad-hoc 'Note' key plain-string types use) --
  // a metadata hiccup should never silently hide a column real data clearly has.
  if (!fieldOrder.length) {
    const seen = new Set()
    rows.forEach(r => Object.keys(r.Fields || {}).forEach(k => seen.add(k)))
    fieldOrder.push(...seen)
  }
  return {
    rows, count: rows.length, totalCount, truncated, since: win.since, until: win.until, eventCode: code,
    fieldColumns: fieldOrder,
  }
}

// ActivityTypes.Get -- lists every activity type configured on this account (code + real
// display name), used to power an Activity Type filter dropdown matching LeadSquared's own
// Manage Activity screen instead of showing raw numeric EventCodes.
async function fetchLeadSquaredActivityTypes(creds) {
  const data = await leadsquaredGet('/v2/ProspectActivity.svc/ActivityTypes.Get', creds)
  const rows = Array.isArray(data) ? data : []
  const types = rows.map(t => ({ code: t.ActivityEvent, name: t.DisplayName || t.ActivityEventName, eventType: t.EventType }))
  return { rows: types, count: types.length }
}

// GetOpportunityTypeMetadata -- real Status/Stage option lists + custom-field display names
// for this account's opportunity type, so a filter UI can show "Stage" / "Won" / "Lost"
// instead of raw mx_Custom_2 / opaque values. Cached in-memory per cold start (metadata is
// effectively static -- it only changes if someone edits Settings > Opportunities in LSQ).
let _lsqOppMetaCache = null
async function fetchLeadSquaredOpportunityMeta(creds, { eventCode }, bypassCache) {
  const code = Number(eventCode) || 12003
  if (!bypassCache && _lsqOppMetaCache && _lsqOppMetaCache.code === code) return _lsqOppMetaCache.data
  const data = await leadsquaredGet('/v2/OpportunityManagement.svc/GetOpportunityTypeMetadata', creds, { code: String(code) })
  _lsqOppMetaCache = { code, data }
  return data
}

// Field Schema page, Opportunity side. Same Field shape as GetActivitySetting
// (confirmed live: identical key list -- no field object carries a CreatedOn/
// ModifiedOn/CreatedBy/ModifiedBy PROPERTY the way Leads' own field metadata
// does), so this mirrors fetchLeadSquaredActivitySchema exactly -- EXCEPT for
// dropdown values, and one real distinction worth remembering: LeadSquared's
// Opportunity Type DOES ship real ModifiedOn/ModifiedBy/CreatedOn/CreatedBy
// FIELDS in this same Fields array (SchemaName/DisplayName exactly those,
// DataType DateTime/ActiveUsers, IsReadOnly true) -- confirmed live. They're
// just ordinary per-RECORD audit fields (same concept as any record's own
// created/modified stamp, already surfaced in the drill-down modal's "Full
// record" list), not schema-level "when was this field configured" metadata
// -- so they flow through as normal rows below, not as extra columns. Confirmed
// empirically (a real 500, not a
// guess) that Activity's dropdown-values endpoint explicitly rejects an Opportunity
// code ("Activity field should be of type independent dropdown") -- LeadSquared has
// no separate API for Opportunity dropdown values at all. The only real values
// available are whatever GetOpportunityTypeMetadata embeds directly in a field's own
// OptionSet -- confirmed populated for the built-in "Status" field (Open/Won/Lost as
// a JSON array with a Value per option) but empty for ordinary custom dropdown
// fields like "Stage" (mx_Custom_2). So each field carries its inline options when
// LeadSquared actually provides them, and null when it doesn't -- never a fake
// "View options" button pointed at a call that would 500.
async function fetchLeadSquaredOpportunitySchema(creds, { code, refresh }) {
  const data = await fetchLeadSquaredOpportunityMeta(creds, { eventCode: code }, !!refresh)
  const fields = Array.isArray(data && data.Fields) ? data.Fields
    .slice()
    .sort((a, b) => (a.Sequence || 0) - (b.Sequence || 0))
    .map(f => {
      let inlineOptions = null
      if (f.OptionSet) {
        try {
          const parsed = JSON.parse(f.OptionSet)
          if (Array.isArray(parsed)) inlineOptions = parsed.map(o => o.Value).filter(v => v != null && v !== '')
        } catch (_) { /* OptionSet isn't valid JSON for this field -- leave inlineOptions null */ }
      }
      return {
        schemaName: f.SchemaName, displayName: f.DisplayName || f.SchemaName,
        dataType: f.DataType || '', isMandatory: !!f.IsMandatory, inlineOptions,
      }
    }) : []
  const resolvedCode = (data && (data.EventCode || data.EventCode === 0)) ? data.EventCode : (Number(code) || 12003)
  return { code: String(resolvedCode), displayName: (data && data.DisplayName) || '', fields }
}

// LeadSquared serializes dates as the old ASP.NET "/Date(epochMs+tzOffset)/" format --
// confirmed live, e.g. "/Date(1785350199000+0000)/". Extracts the epoch and returns an
// ISO string, or null if the value doesn't match (blank/absent dates included).
function parseDotNetDate(v) {
  if (!v || typeof v !== 'string') return null
  const m = v.match(/\/Date\((-?\d+)/)
  return m ? new Date(Number(m[1])).toISOString() : null
}

let _lsqLeadMetaCache = null
// LeadsMetaData.Get -- the Lead-side sibling of GetActivitySetting/GetOpportunityTypeMetadata,
// and genuinely richer than either: confirmed live that every one of this account's 403 lead
// fields carries real CreatedOn/CreatedByName/ModifiedOn/ModifiedByName (unlike Activity/
// Opportunity fields, which have none of this at the schema level -- see the comment on
// fetchLeadSquaredActivitySchema). Dropdown-family fields (132 of 136 checked) carry their
// values directly in `Options[]`, no separate lookup call needed. `excludeOptionSets=1` is
// deliberately NOT passed -- this account's Options payload is small enough that fetching it
// unconditionally is simpler and avoids a second round-trip for fields that turn out to be
// dropdowns.
async function fetchLeadSquaredLeadMeta(creds, bypassCache) {
  if (!bypassCache && _lsqLeadMetaCache) return _lsqLeadMetaCache
  const data = await leadsquaredGet('/v2/LeadManagement.svc/LeadsMetaData.Get', creds)
  _lsqLeadMetaCache = Array.isArray(data) ? data : []
  return _lsqLeadMetaCache
}

async function fetchLeadSquaredLeadSchema(creds, { refresh }) {
  const raw = await fetchLeadSquaredLeadMeta(creds, !!refresh)
  const fields = raw.map(f => ({
    schemaName: f.SchemaName, displayName: f.DisplayName || f.SchemaName,
    dataType: f.RenderTypeTextValue || f.DataType || '', isMandatory: !!f.IsMandatory,
    inlineOptions: Array.isArray(f.Options) ? f.Options.map(o => o.Value).filter(v => v != null && v !== '') : null,
    createdOn: parseDotNetDate(f.CreatedOn), createdByName: f.CreatedByName || null,
    modifiedOn: parseDotNetDate(f.ModifiedOn), modifiedByName: f.ModifiedByName || null,
  }))
  return { code: 'leads', displayName: 'Leads', fields }
}

// GetOpportunityDetails -- the single-record detail view behind the Opportunities tab's
// drill-down. Returns Fields[] with each field's real current Value (the search/list
// endpoint only returns whatever Include_CSV columns were asked for), plus the record's own
// CreatedOn/CreatedByName/ModifiedOn/ModifiedByName -- audit metadata for this ONE opportunity
// instance, distinct from (and not to be confused with) the schema-level Created/Modified
// question already answered for Opportunity Types (no such data exists at the schema level).
async function fetchLeadSquaredOpportunityDetail(creds, { opportunityId }) {
  if (!opportunityId) throw new Error('opportunityId is required')
  const data = await leadsquaredGet('/v2/OpportunityManagement.svc/GetOpportunityDetails', creds, { OpportunityId: opportunityId })
  const fields = Array.isArray(data && data.Fields)
    ? data.Fields.filter(f => f.Value != null && f.Value !== '').map(f => ({ displayName: f.DisplayName || f.SchemaName, value: f.Value }))
    : []
  // GetOpportunityDetails' own top-level CreatedOn/ModifiedOn come back in the
  // .NET /Date(epochMs+tz)/ wire format (confirmed live) -- distinct from the
  // SAME info duplicated inside Fields[] as a plain, already-formatted string,
  // which is why only the header strip (not the field list) rendered a raw
  // "/Date(...)" string before this fix. parseDotNetDate() returns null for
  // anything that isn't that format, so the `||` fallback keeps working even
  // if a future response shape sends a plain string instead.
  return {
    opportunityId, displayName: (data && data.DisplayName) || '', fields,
    createdOn: parseDotNetDate(data && data.CreatedOn) || (data && data.CreatedOn) || null,
    createdByName: (data && data.CreatedByName) || null,
    modifiedOn: parseDotNetDate(data && data.ModifiedOn) || (data && data.ModifiedOn) || null,
    modifiedByName: (data && data.ModifiedByName) || null,
  }
}

// GetActivitiesOfOpportunity -- confirmed live this needs POST (a plain GET 405s, despite the
// docs listing it as GET). Powers the same drill-down's activity trail. ActivityEvent is
// resolved to a real name via the account's own ActivityTypes.Get list (same map already used
// elsewhere) so the trail reads "Manual Lead Qualification - Futwork", not a bare numeric code.
async function fetchLeadSquaredOpportunityActivities(creds, { opportunityId }) {
  if (!opportunityId) throw new Error('opportunityId is required')
  const [data, types] = await Promise.all([
    leadsquaredPost('/v2/OpportunityManagement.svc/GetActivitiesOfOpportunity', creds, {}, { OpportunityId: opportunityId }),
    fetchLeadSquaredActivityTypes(creds).catch(() => ({ rows: [] })),
  ])
  const nameByCode = {}
  ;(types.rows || []).forEach(t => { nameByCode[String(t.code)] = t.name })
  const rows = Array.isArray(data && data.List) ? data.List.map(r => ({
    activityType: nameByCode[String(r.ActivityEvent)] || ('Event ' + r.ActivityEvent),
    note: r.ActivityEvent_Note || null, createdOn: r.CreatedOn || null,
  })) : []
  return { opportunityId, count: (data && data.RecordCount) || rows.length, rows }
}

// UserManagement.svc/Users.Get -- the ONLY LeadSquared endpoint this account's API
// credentials can actually reach for user/group data (every "Sales Groups" path
// LeadSquared's own naming conventions suggest -- SalesGroup/Get, Groups.Get,
// UserGroups.Get, Team.Get, etc -- 404s live against this account; confirmed by
// probing all of them directly before writing this). It returns the FULL roster in
// one call, no pagination -- confirmed live at 3,380 rows, well under any
// page-size concern. StatusCode 0/1 = Active/Inactive, cross-checked against this
// account's own Manage Users screen (its default "Status: Active" filter's
// headcount matches the StatusCode===0 count here, not the StatusCode===1 one).
async function fetchLeadSquaredTeamUsers(creds) {
  const data = await leadsquaredGet('/v2/UserManagement.svc/Users.Get', creds)
  const rows = Array.isArray(data) ? data : []
  return rows.map(u => ({
    id: u.ID,
    name: [u.FirstName, u.LastName].filter(Boolean).join(' ').trim() || u.EmailAddress || u.ID,
    email: u.EmailAddress || null,
    role: u.Role || null,
    status: u.StatusCode === 0 ? 'Active' : 'Inactive',
    groups: Array.isArray(u.MemberOfGroups) ? u.MemberOfGroups : [],
    isPhoneCallAgent: !!u.IsPhoneCallAgent,
    tag: u.Tag || null,
  }))
}

// Sales Groups have no dedicated API resource on this account (see the comment
// above) -- the only place group membership appears at all is each user's own
// MemberOfGroups array, so the group list/roster is reconstructed by aggregating
// that across every user instead of fetched directly. Confirmed live this
// reproduces the exact group COUNT LeadSquared's own Manage > Sales Groups screen
// shows ("60 of 80 available sales groups" == 60 distinct group names found this
// way), so it's a faithful reconstruction of membership, not an approximation --
// though per-group metadata that screen also shows (Managers, Modified On) has no
// live-API source at all and isn't reproduced here.
function aggregateTeamGroups(users) {
  const byGroup = {}
  users.forEach(u => {
    ;(u.groups || []).forEach(g => {
      if (!byGroup[g]) byGroup[g] = { name: g, memberCount: 0, members: [] }
      byGroup[g].memberCount++
      byGroup[g].members.push({ id: u.id, name: u.name, email: u.email, status: u.status })
    })
  })
  return Object.values(byGroup).sort((a, b) => b.memberCount - a.memberCount)
}

// The manual, human-entered fields laid over the live roster above -- see
// supabase/sql/team_mapping_setup.sql for the full field list and the lifecycle
// rule this enforces: a manual row whose ls_email is no longer in the live
// LeadSquared roster is deleted right here, as a side effect of the normal
// real-time page load, rather than a separate cron job. The manual table is
// small (bounded by how many people someone has actually annotated) while the
// live roster is large (3,380+), so this fetches the whole manual table once and
// only issues a DELETE for the (typically empty) stale subset -- never a query
// sized to the full roster.
async function fetchTeamUsersMerged(creds) {
  const { supabaseAdmin } = await import('../lib/auth.mjs')
  const users = await fetchLeadSquaredTeamUsers(creds)
  const liveEmails = new Set(users.map(u => (u.email || '').toLowerCase()).filter(Boolean))

  const manualRes = await supabaseAdmin('team_mapping_manual?select=*')
  const manualRows = manualRes.ok ? await manualRes.json() : []

  const staleRows = manualRows.filter(r => r.ls_email && !liveEmails.has(String(r.ls_email).toLowerCase()))
  if (staleRows.length) {
    const filter = 'ls_email=in.(' + staleRows.map(r => `"${String(r.ls_email).replace(/"/g, '')}"`).join(',') + ')'
    await supabaseAdmin('team_mapping_manual?' + filter, { method: 'DELETE' }).catch(() => {})
    // Logged as 'system' -- nobody clicked anything, this is the automatic
    // lifecycle rule (a LeadSquared user disappeared, their manual notes go
    // with them) firing as a side effect of this same page load. Each row's
    // full prior values are snapshotted exactly like a manual delete, so it
    // can be restored the same way if the removal turns out to be wrong (e.g.
    // a name change in LeadSquared that looked like a departure).
    await Promise.all(staleRows.map(row => logTeamActivity({
      type: 'delete', label: row.ls_email, target_email: row.ls_email,
      detail: JSON.stringify({ snapshot: row, reason: 'left_leadsquared' }),
      status: 'done', total: 1, done: 1,
    }, { email: 'system (left LeadSquared)' }).catch(() => {})))
  }

  const manualByEmail = {}
  manualRows.forEach(r => { if (r.ls_email && liveEmails.has(String(r.ls_email).toLowerCase())) manualByEmail[String(r.ls_email).toLowerCase()] = r })

  const merged = users.map(u => ({ ...u, manual: (u.email && manualByEmail[u.email.toLowerCase()]) || null }))
  return { rows: merged, count: merged.length, staleManualDropped: staleRows.length }
}

// User/Retrieve/ByUserId -- found via LeadSquared's own public API docs
// (apidocs.leadsquared.com/get-user-by-id), NOT discoverable by guessing REST
// naming conventions off Users.Get the way every other candidate path tried
// earlier was ("Users/Retrieve/ByIds" -- plural, wrong resource name -- 404s;
// this is singular "User", singular "ByUserId"). Unlike Users.Get, this DOES
// return real phone numbers, custom fields, and the reporting-manager
// relationship -- confirmed live against 4 real accounts here, cross-checked
// field-for-field against the "Akash - Squad Mapping" sheet's own Phone
// Number / Airtel Number / LS Manager Name columns, all matching exactly
// (including a genuinely blank Airtel Number matching a genuinely absent
// mx_Custom_2). So PhoneMain / mx_Custom_2 / ManagerName are now live data,
// not manual fields -- see fetchLeadSquaredUserDetails below. Designation/
// Department/Sales Regions/Skills still didn't appear in any of the 4 test
// accounts, but those were also blank in LeadSquared's own UI for all 4, so
// whether this endpoint can return them for an account where they're actually
// filled in is still unconfirmed -- worth re-checking against a real example.
// This is a PER-USER call (LeadSquared has no bulk "by many ids" variant, and
// ReportingHierarchy/RetrieveAllReportingUsers only returns bare ids, not this
// richer shape) -- see fetchLeadSquaredUserDetails' own comment for how the
// frontend paces this to avoid the account-wide rate limit this app has hit
// before on other integrations.
async function fetchLeadSquaredUserDetail(creds, userId) {
  const data = await leadsquaredGet('/v2/UserManagement.svc/User/Retrieve/ByUserId', creds, { userId })
  return (Array.isArray(data) ? data[0] : data) || null
}

// Fetches detail for a small batch of ids in parallel (capped at 60 -- one
// Team Mapping table page's worth, never the whole 3,380-user roster in one
// call) and resolves each ManagerUserId to the manager's own email against
// `byId`, a map already built from the one bulk Users.Get roster fetch this
// same request already needed for team_users -- no extra LeadSquared call for
// that resolution.
async function fetchLeadSquaredUserDetails(creds, ids, byId) {
  const capped = (ids || []).slice(0, 60)
  const results = await Promise.all(capped.map(id =>
    fetchLeadSquaredUserDetail(creds, id).catch(() => null)
  ))
  return capped.map((id, i) => {
    const d = results[i]
    if (!d) return { id, phoneMain: null, airtelNumber: null, managerName: null, managerEmail: null }
    const mgr = d.ManagerUserId && byId[d.ManagerUserId]
    return {
      id,
      phoneMain: d.PhoneMain || null,
      // mx_Custom_2 has no human label from this endpoint (LeadSquared's admin
      // UI shows it as "DID Number") -- matched by VALUE against the sheet's
      // Airtel Number column across 4 real users, not by any documented name,
      // so this is fragile if this account's custom-field numbering ever
      // changes. Worth re-verifying if Airtel Numbers ever look wrong here.
      airtelNumber: d.mx_Custom_2 || null,
      managerName: d.ManagerName || null,
      managerEmail: (mgr && mgr.email) || null,
    }
  })
}

// employment_status was dropped -- it duplicated the live LeadSquared Status
// (Active/Inactive) already shown for every row. ls_manager_name/email and
// phone_number/airtel_number were ALSO dropped from the manual set for the
// reason above -- they're live now via fetchLeadSquaredUserDetails. tier was
// renamed to role: a business-side designation (ASM/Consultant/Manager/...),
// distinct from LeadSquared's own coarse Role (Sales_User/Administrator/...)
// which the frontend now labels "LS Role" to avoid the two being confused.
const TEAM_MANUAL_FIELDS = ['asm_sm', 'asm_sm_email', 'ssm', 'ssm_email', 'role', 'level', 'country', 'centre_name']

// Fetches the current row (if any) for one email -- used before every save/
// delete to compute a before/after diff, and before a restore to know what
// "current" looks like (not strictly needed there, but keeps the code path
// uniform).
async function fetchOneTeamManual(supabaseAdmin, email) {
  const r = await supabaseAdmin('team_mapping_manual?ls_email=eq.' + encodeURIComponent(email) + '&select=*')
  if (!r.ok) return null
  const rows = await r.json()
  return rows[0] || null
}

// { field: { from, to } } for every field that actually changed -- fields with
// no change are omitted so the History page's diff view only ever shows what
// really moved, not a wall of identical before/after pairs.
function diffTeamManualFields(existing, incoming) {
  const changes = {}
  TEAM_MANUAL_FIELDS.forEach(f => {
    const from = (existing && existing[f]) || null
    const to = (incoming && incoming[f]) || null
    if (from !== to) changes[f] = { from, to }
  })
  return changes
}

async function saveTeamManual(body, me, creds) {
  const { supabaseAdmin } = await import('../lib/auth.mjs')
  const email = String((body && body.ls_email) || '').trim().toLowerCase()
  if (!email) throw new Error('ls_email is required')
  const existing = await fetchOneTeamManual(supabaseAdmin, email)
  const payload = { ls_email: email, updated_by: me.email || null, updated_at: new Date().toISOString() }
  TEAM_MANUAL_FIELDS.forEach(f => { payload[f] = (body && body[f]) || null })
  const r = await supabaseAdmin('team_mapping_manual', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(payload),
  })
  if (!r.ok) throw new Error('Save failed: ' + (await r.text()).slice(0, 300))
  const saved = await r.json()
  const row = Array.isArray(saved) ? saved[0] : saved

  // Bulk-import rows save through this exact same function, one call per
  // person -- skipActivityLog keeps a 285-row import from writing 285 extra
  // per-person 'edit' entries on top of the ONE aggregate 'import' progress
  // row runImportInBackground already logs (and firing 285 individual
  // connector notifications would be worse -- see notifyTeamMappingConnectors
  // being called from updateTeamActivity instead, once, when that aggregate
  // row finishes). A manual Save from the Edit modal, a bulk-edit row, or a
  // restore always logs+notifies, since there each save IS the whole action a
  // person should be able to see, be notified about, and undo.
  if (!(body && body.skipActivityLog)) {
    const changes = diffTeamManualFields(existing, payload)
    if (Object.keys(changes).length) {
      const kind = (body && body.activityType) || 'edit'
      const label = (body && body.ls_name) || email
      // label prefers a human name if the caller passed one (the roster
      // already has it client-side); falls back to the email.
      await logTeamActivity({
        type: kind,
        label,
        target_email: email,
        detail: JSON.stringify({ changes, isNew: !existing }),
        status: 'done', total: 1, done: 1,
      }, me).catch(() => {})
      await notifyTeamMappingConnectors({ kind, label, target_email: email, by: me.email, changes }, creds).catch(() => {})
    }
  }
  return row
}

async function deleteTeamManual(email, me, creds) {
  const { supabaseAdmin } = await import('../lib/auth.mjs')
  const e = String(email || '').trim().toLowerCase()
  if (!e) throw new Error('ls_email is required')
  const existing = await fetchOneTeamManual(supabaseAdmin, e)
  const r = await supabaseAdmin('team_mapping_manual?ls_email=eq.' + encodeURIComponent(e), { method: 'DELETE' })
  if (!r.ok) throw new Error('Delete failed: ' + (await r.text()).slice(0, 300))
  if (existing) {
    // Snapshotting the FULL row (not just a diff, since everything is being
    // removed) is what makes "restore" possible later -- team_manual_restore
    // reads this exact snapshot back.
    await logTeamActivity({
      type: 'delete', label: e, target_email: e,
      detail: JSON.stringify({ snapshot: existing }),
      status: 'done', total: 1, done: 1,
    }, me).catch(() => {})
    await notifyTeamMappingConnectors({ kind: 'delete', label: e, target_email: e, by: me.email, snapshot: existing }, creds).catch(() => {})
  }
  return { deleted: e }
}

// Re-applies an earlier state from the activity log -- an 'edit' entry
// restores each changed field to its "from" value, a 'delete' entry restores
// the full snapshot. Goes through saveTeamManual so the restore itself is
// ALSO logged (as its own 'restore'-typed entry, diffed against whatever is
// current right now) -- a restore is a real change too, and should show up
// in the trail rather than silently rewriting history.
async function restoreTeamManual(activityId, me, creds) {
  const { supabaseAdmin } = await import('../lib/auth.mjs')
  const r = await supabaseAdmin('team_mapping_activity?id=eq.' + encodeURIComponent(activityId) + '&select=*')
  if (!r.ok) throw new Error('Could not load that history entry')
  const rows = await r.json()
  const activity = rows[0]
  if (!activity) throw new Error('History entry not found')
  const email = activity.target_email
  if (!email) throw new Error('This history entry has no person to restore')
  let detail
  try { detail = JSON.parse(activity.detail || '{}') } catch { detail = {} }
  const restoreValues = {}
  if (activity.type === 'delete' && detail.snapshot) {
    TEAM_MANUAL_FIELDS.forEach(f => { restoreValues[f] = detail.snapshot[f] || null })
  } else if (detail.changes) {
    TEAM_MANUAL_FIELDS.forEach(f => { restoreValues[f] = (detail.changes[f] && detail.changes[f].from) || null })
  } else {
    throw new Error('Nothing to restore from this history entry')
  }
  return saveTeamManual({ ls_email: email, ...restoreValues, activityType: 'restore' }, me, creds)
}

// ---------------------------------------------------------------------------
// Outbound connectors (supabase/sql/team_mapping_connectors_setup.sql) -- what
// makes this page usable as a real "source of team mapping" for other tools
// instead of a dead end. Four independent, individually-toggleable pushes fire
// on every real change (save/delete/restore/finished import): a webhook, a
// Slack notification, a live Google Sheet mirror, and (pull-based rather than
// push) an api_key-gated read-only export any external script can hit on its
// own schedule. Single fixed config row (id='default') -- this is page-level
// config, not per-person -- read/written admin-only via the service-role
// client, same as team_mapping_manual/team_mapping_activity.
async function getTeamConnectorsConfig() {
  const { supabaseAdmin } = await import('../lib/auth.mjs')
  const r = await supabaseAdmin('team_mapping_connectors?id=eq.default&select=*')
  if (!r.ok) return null
  const rows = await r.json()
  return rows[0] || null
}

// Admin-only save -- only ever writes the fields the caller actually sent, so
// e.g. saving the webhook URL from the Webhook card can't accidentally wipe
// the Slack channel typed into a different card.
async function saveTeamConnectorsConfig(body, me) {
  const { supabaseAdmin } = await import('../lib/auth.mjs')
  const ALLOWED = ['webhook_enabled', 'webhook_url', 'slack_enabled', 'slack_channel', 'sheet_enabled', 'sheet_id', 'api_enabled']
  const patch = { id: 'default', updated_by: me.email || null, updated_at: new Date().toISOString() }
  ALLOWED.forEach(k => { if (body && Object.prototype.hasOwnProperty.call(body, k)) patch[k] = body[k] })
  const r = await supabaseAdmin('team_mapping_connectors', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(patch),
  })
  if (!r.ok) throw new Error('Save failed: ' + (await r.text()).slice(0, 300))
  const saved = await r.json()
  return Array.isArray(saved) ? saved[0] : saved
}

// A fresh random key, shown once in full to the admin who generated it (same
// as this app's Slack bot token or the BigQuery refresh token -- an internal
// automation credential meant to be copied into another tool, not a login
// password), stored in plaintext -- there's no user ever "logging in" with it
// to hash against, just a string an external request has to present verbatim.
async function regenerateTeamApiKey(me) {
  // Deliberately NOT routed through saveTeamConnectorsConfig -- api_key is
  // excluded from that function's ALLOWED whitelist on purpose (an admin's
  // own browser making a raw request to team_connectors_save should never be
  // able to plant an arbitrary attacker-chosen key; only this dedicated,
  // server-generated path may set it). Writing directly here means that
  // whitelist can stay strict without this function's own key silently
  // getting dropped by it.
  const { supabaseAdmin } = await import('../lib/auth.mjs')
  const crypto = await import('crypto')
  const key = crypto.randomBytes(24).toString('hex')
  const patch = { id: 'default', api_key: key, api_enabled: true, updated_by: me.email || null, updated_at: new Date().toISOString() }
  const r = await supabaseAdmin('team_mapping_connectors', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(patch),
  })
  if (!r.ok) throw new Error('Could not save the new key: ' + (await r.text()).slice(0, 300))
  const saved = await r.json()
  return Array.isArray(saved) ? saved[0] : saved
}

// Plain, short, professional text -- this is a routine ops notification
// channel, not the CEO Slack report machinery in api/send-report.mjs (which
// this deliberately does NOT reuse: that system's guarded-channel/PIN
// ceremony exists because IT posts to a channel the CEO reads, and would be
// pure friction here). One line per event type, no emoji -- matches this
// app's own "no emoji in Quantum's UI" convention extended to its routine
// (non-report) Slack traffic too.
function teamMappingSlackText(event) {
  const who = event.by ? ` (by ${event.by})` : ''
  if (event.kind === 'delete') return `Team Mapping: removed mapping for ${event.label || event.target_email}${who}`
  if (event.kind === 'restore') return `Team Mapping: restored mapping for ${event.label || event.target_email}${who}`
  if (event.kind === 'import') {
    const s = event.summary || {}
    return `Team Mapping: bulk import "${event.label || 'import'}" finished -- ${s.done || 0} done, ${s.failed || 0} failed, ${s.skipped || 0} skipped${who}`
  }
  const fields = Object.keys(event.changes || {})
  const changeText = fields.length
    ? fields.map(f => `${f}: ${(event.changes[f].from) || '(empty)'} -> ${(event.changes[f].to) || '(empty)'}`).join(', ')
    : 'no field changes'
  return `Team Mapping: edited mapping for ${event.label || event.target_email}${who} -- ${changeText}`
}

// Same request shape as api/send-report.mjs's postToSlackBot, kept as its own
// small copy rather than a cross-file import -- this file already avoids
// every static import (including of its own siblings) to stay clear of the
// ERR_REQUIRE_ESM risk documented at the top of this file.
async function postTeamMappingSlack(channel, text) {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) throw new Error('SLACK_BOT_TOKEN is not set')
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ channel, text }),
  })
  const data = await res.json().catch(() => ({}))
  if (!data.ok) throw new Error('Slack: ' + (data.error || 'unknown error'))
}

async function postTeamMappingWebhook(url, event) {
  const res = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'quantum_team_mapping', at: new Date().toISOString(), ...event }),
  })
  if (!res.ok) throw new Error('Webhook responded ' + res.status)
}

// ---------------------------------------------------------------------------
// "Watch my team" (supabase/sql/team_mapping_watchers_setup.sql) -- an admin
// subscribes a real person (by email, not a Quantum login -- most of the
// LeadSquared roster has none) to a node in the Org Chart (an ASM/SM or SSM's
// name), and that person gets a Slack DM whenever the team under that node
// changes. node_key is normalized the same way the org chart itself groups
// near-duplicate spellings, so watching "Kartikey Kedia" keeps working even
// if a future edit types it slightly differently.
function normalizeWatchKey(s) { return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase() }

async function listTeamWatchers() {
  const { supabaseAdmin } = await import('../lib/auth.mjs')
  const r = await supabaseAdmin('team_mapping_watchers?select=*&order=created_at.desc')
  if (!r.ok) throw new Error('team_mapping_watchers may not exist yet -- run supabase/sql/team_mapping_watchers_setup.sql')
  return await r.json()
}
async function addTeamWatcher(body, me) {
  const { supabaseAdmin } = await import('../lib/auth.mjs')
  const nodeKey = normalizeWatchKey(body && body.node_key)
  const email = String((body && body.subscriber_email) || '').trim().toLowerCase()
  if (!nodeKey) throw new Error('node_key is required')
  if (!email) throw new Error('subscriber_email is required')
  const payload = { node_key: nodeKey, node_label: (body && body.node_label) || nodeKey, subscriber_email: email, created_by: me.email || null }
  const r = await supabaseAdmin('team_mapping_watchers?on_conflict=node_key,subscriber_email', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(payload),
  })
  if (!r.ok) throw new Error('Could not add watcher: ' + (await r.text()).slice(0, 300))
  const saved = await r.json()
  return Array.isArray(saved) ? saved[0] : saved
}
async function removeTeamWatcher(id) {
  const { supabaseAdmin } = await import('../lib/auth.mjs')
  if (!id) throw new Error('id is required')
  const r = await supabaseAdmin('team_mapping_watchers?id=eq.' + encodeURIComponent(id), { method: 'DELETE' })
  if (!r.ok) throw new Error('Could not remove watcher: ' + (await r.text()).slice(0, 300))
  return { deleted: id }
}

// Same lookup-then-DM pattern Slack itself recommends for bot DMs: resolve
// the person's Slack user id from their email, then chat.postMessage straight
// at that user id (Slack opens/reuses the DM channel implicitly). Requires
// the bot to have the users:read.email scope -- NOT currently granted to this
// workspace's bot per this app's own Slack setup notes (chat:write,
// channels:read, files:write only) -- so this will throw "missing_scope"
// until an admin adds that scope and reinstalls the app, same caveat this
// codebase already documents for every other "needs a new Slack scope" case.
async function postTeamMappingSlackDM(email, text) {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) throw new Error('SLACK_BOT_TOKEN is not set')
  const lookupRes = await fetch('https://slack.com/api/users.lookupByEmail?email=' + encodeURIComponent(email), {
    headers: { Authorization: `Bearer ${token}` },
  })
  const lookup = await lookupRes.json().catch(() => ({}))
  if (!lookup.ok) throw new Error('Slack: no Slack account found for ' + email + (lookup.error ? ' (' + lookup.error + ')' : ''))
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ channel: lookup.user.id, text }),
  })
  const data = await res.json().catch(() => ({}))
  if (!data.ok) throw new Error('Slack: ' + (data.error || 'unknown error'))
}

// Which watched nodes a given event actually touches -- an edit/restore's
// `changes.asm_sm`/`changes.ssm` moved someone FROM one node's team and TO
// another's (both affected); a delete's `snapshot` only had one team to leave.
function affectedWatchNodeKeys(event) {
  const keys = new Set()
  if (event.changes) {
    ;['asm_sm', 'ssm'].forEach(f => {
      const c = event.changes[f]
      if (c) {
        if (c.from) keys.add(normalizeWatchKey(c.from))
        if (c.to) keys.add(normalizeWatchKey(c.to))
      }
    })
  }
  if (event.snapshot) {
    ;['asm_sm', 'ssm'].forEach(f => { if (event.snapshot[f]) keys.add(normalizeWatchKey(event.snapshot[f])) })
  }
  keys.delete('')
  return Array.from(keys)
}

// Best-effort, never throws -- a missing table, a missing Slack scope, or one
// bad email should never be able to break the save that triggered this.
async function notifyTeamWatchers(event) {
  try {
    const keys = affectedWatchNodeKeys(event)
    if (!keys.length) return
    const { supabaseAdmin } = await import('../lib/auth.mjs')
    const filter = 'node_key=in.(' + keys.map(k => `"${k.replace(/"/g, '')}"`).join(',') + ')'
    const r = await supabaseAdmin('team_mapping_watchers?' + filter + '&select=*')
    if (!r.ok) return
    const watchers = await r.json()
    const seen = new Set()
    for (const w of watchers) {
      if (seen.has(w.subscriber_email)) continue
      seen.add(w.subscriber_email)
      await postTeamMappingSlackDM(w.subscriber_email, `You're watching ${w.node_label || w.node_key}'s team on Team Mapping.\n${teamMappingSlackText(event)}`).catch(() => {})
    }
  } catch { /* watchers are a best-effort layer on top of the real save */ }
}

// Overwrites the FIRST tab of an existing spreadsheet with the full current
// roster+manual snapshot -- a live mirror, not a fresh export-to-sheets.mjs
// file-per-click. Deliberately excludes Phone/Airtel/Reporting Manager: those
// need one LeadSquared call PER PERSON (fetchLeadSquaredUserDetails), fine for
// the ~50 rows a table page shows but far too expensive to redo for the whole
// ~3,380-person roster on every single manual edit.
async function syncTeamMappingSheet(sheetId, creds) {
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL
  const privateKey = (process.env.GOOGLE_SHEETS_PRIVATE_KEY || '').replace(/\\n/g, '\n')
  if (!clientEmail || !privateKey) throw new Error('GOOGLE_SHEETS_CLIENT_EMAIL/GOOGLE_SHEETS_PRIVATE_KEY are not set')
  const { JWT } = await import('google-auth-library')
  const auth = new JWT({ email: clientEmail, key: privateKey, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
  const { access_token } = await auth.authorize()

  const { rows } = await fetchTeamUsersMerged(creds)
  const header = ['Name', 'Email', 'LS Role', 'Status', 'Groups', 'ASM/SM', 'ASM/SM Email', 'SSM', 'SSM Email', 'Role', 'Level', 'Country', 'Centre Name']
  const grid = [header, ...rows.map(r => [
    r.name, r.email || '', (r.role || '').replace(/_/g, ' '), r.status, (r.groups || []).join('; '),
    r.manual?.asm_sm || '', r.manual?.asm_sm_email || '', r.manual?.ssm || '', r.manual?.ssm_email || '',
    r.manual?.role || '', r.manual?.level || '', r.manual?.country || '', r.manual?.centre_name || '',
  ])]

  const clearRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A1:M20000:clear`, {
    method: 'POST', headers: { Authorization: `Bearer ${access_token}` },
  })
  if (!clearRes.ok) throw new Error('Could not clear the target sheet -- check the Sheet ID and that it is shared with ' + clientEmail)
  const writeRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A1:M${grid.length}?valueInputOption=RAW`, {
    method: 'PUT', headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: grid }),
  })
  if (!writeRes.ok) {
    const e = await writeRes.json().catch(() => ({}))
    throw new Error(e.error?.message || 'Could not write to the target sheet')
  }
  return { rows: rows.length }
}

// The one function every save/delete/restore/finished-import routes through.
// Best-effort and independent per connector -- one connector failing (a dead
// webhook URL, the bot not yet invited to the Slack channel) never blocks or
// masks the other two, and never fails the actual save that triggered it
// (this is always called from inside a try/catch at the call site). Each
// connector's own last-run outcome is written back to the config row so the
// Connectors tab can show real status instead of "did it work? who knows."
async function notifyTeamMappingConnectors(event, creds) {
  const cfg = await getTeamConnectorsConfig()
  if (!cfg) return
  const now = new Date().toISOString()
  const patch = {}

  if (cfg.webhook_enabled && cfg.webhook_url) {
    try { await postTeamMappingWebhook(cfg.webhook_url, event); patch.webhook_last_status = 'ok'; patch.webhook_last_at = now }
    catch (e) { patch.webhook_last_status = 'error: ' + String((e && e.message) || e).slice(0, 200); patch.webhook_last_at = now }
  }
  if (cfg.slack_enabled && cfg.slack_channel) {
    try { await postTeamMappingSlack(cfg.slack_channel, teamMappingSlackText(event)); patch.slack_last_status = 'ok'; patch.slack_last_at = now }
    catch (e) { patch.slack_last_status = 'error: ' + String((e && e.message) || e).slice(0, 200); patch.slack_last_at = now }
  }
  if (cfg.sheet_enabled && cfg.sheet_id && creds) {
    try { const r = await syncTeamMappingSheet(cfg.sheet_id, creds); patch.sheet_last_status = `ok (${r.rows} rows)`; patch.sheet_last_at = now }
    catch (e) { patch.sheet_last_status = 'error: ' + String((e && e.message) || e).slice(0, 200); patch.sheet_last_at = now }
  }
  // Independent of the three connector toggles above -- a subscribed manager
  // gets DM'd regardless of whether the org has webhook/Slack-channel/Sheet
  // connectors turned on at all.
  await notifyTeamWatchers(event)
  if (Object.keys(patch).length) {
    const { supabaseAdmin } = await import('../lib/auth.mjs')
    await supabaseAdmin('team_mapping_connectors?id=eq.default', { method: 'PATCH', body: JSON.stringify(patch) }).catch(() => {})
  }
}

// "Test connection" for one connector at a time, regardless of that
// connector's own enabled flag -- lets an admin check a webhook URL or Slack
// channel actually works BEFORE flipping it on, same self-service pattern as
// every other "Test connection" button in Settings > Data Sources.
async function testTeamConnector(which, me, creds) {
  const cfg = await getTeamConnectorsConfig()
  if (!cfg) throw new Error('Save the connector settings first, then test them')
  const testEvent = { kind: 'edit', label: 'Test person', target_email: 'test@leverageedu.com', by: me.email, changes: { role: { from: null, to: 'Test' } } }
  const now = new Date().toISOString()
  const patch = {}
  if (which === 'webhook') {
    if (!cfg.webhook_url) throw new Error('Enter a webhook URL first')
    try { await postTeamMappingWebhook(cfg.webhook_url, { ...testEvent, test: true }); patch.webhook_last_status = 'ok (test)' }
    catch (e) { patch.webhook_last_status = 'error: ' + String((e && e.message) || e).slice(0, 200) }
    patch.webhook_last_at = now
  } else if (which === 'slack') {
    if (!cfg.slack_channel) throw new Error('Enter a Slack channel first')
    try { await postTeamMappingSlack(cfg.slack_channel, 'Team Mapping: this is a test notification -- connectors are wired up correctly.'); patch.slack_last_status = 'ok (test)' }
    catch (e) { patch.slack_last_status = 'error: ' + String((e && e.message) || e).slice(0, 200) }
    patch.slack_last_at = now
  } else if (which === 'sheet') {
    if (!cfg.sheet_id) throw new Error('Enter a Sheet ID first')
    try { const r = await syncTeamMappingSheet(cfg.sheet_id, creds); patch.sheet_last_status = `ok (${r.rows} rows)` }
    catch (e) { patch.sheet_last_status = 'error: ' + String((e && e.message) || e).slice(0, 200) }
    patch.sheet_last_at = now
  } else {
    throw new Error('Unknown connector')
  }
  const { supabaseAdmin } = await import('../lib/auth.mjs')
  const r = await supabaseAdmin('team_mapping_connectors?id=eq.default', { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) })
  const saved = r.ok ? await r.json() : null
  return Array.isArray(saved) ? saved[0] : saved
}

// The pull-based connector -- an external script/tool hits this with its own
// api_key on its own schedule, no Quantum session cookie at all. Handled
// separately, before this file's normal getSessionUser gate (see the bottom
// of this file), specifically so an automation with no human logged in can
// still reach it. Same field scope as the Sheet mirror, for the same reason
// (no per-user LeadSquared calls on a pull that could happen at any time).
async function handleTeamExportPull(req, res) {
  const apiKey = (req.query && req.query.api_key) || ''
  const cfg = await getTeamConnectorsConfig()
  if (!cfg || !cfg.api_enabled || !cfg.api_key || apiKey !== cfg.api_key) {
    return res.status(401).json({ error: 'Invalid or missing api_key' })
  }
  const creds = leadsquaredCreds()
  if (!creds.accessKey || !creds.secretKey) {
    return res.status(500).json({ error: 'LeadSquared is not configured' })
  }
  try {
    const { rows } = await fetchTeamUsersMerged(creds)
    const flat = rows.map(r => ({
      name: r.name, email: r.email, ls_role: (r.role || '').replace(/_/g, ' '), status: r.status, groups: r.groups || [],
      asm_sm: r.manual?.asm_sm || null, asm_sm_email: r.manual?.asm_sm_email || null,
      ssm: r.manual?.ssm || null, ssm_email: r.manual?.ssm_email || null,
      role: r.manual?.role || null, level: r.manual?.level || null, country: r.manual?.country || null,
      centre_name: r.manual?.centre_name || null, mapping_updated_at: r.manual?.updated_at || null,
    }))
    return res.status(200).json({ generated_at: new Date().toISOString(), count: flat.length, rows: flat })
  } catch (e) {
    return res.status(502).json({ error: String((e && e.message) || e) })
  }
}

// Import/export/edit/delete/restore activity log
// (supabase/sql/team_mapping_activity_setup.sql) -- what makes a bulk import
// genuinely survive the frontend modal closing: the frontend's own
// module-level store drives the actual row-by-row save loop (there's no real
// background worker on Vercel serverless), but every few rows it PATCHes the
// same row here, so the live progress is visible from this table regardless
// of whether the browser tab that started the import still has the modal
// open. Export events log a single already-finished row (client-side CSV
// generation is synchronous, so there's no progress to track). edit/delete/
// restore log a single already-finished row too, one per person, with the
// full before/after in `detail` -- see diffTeamManualFields/deleteTeamManual/
// restoreTeamManual above.
async function logTeamActivity(fields, me) {
  const { supabaseAdmin } = await import('../lib/auth.mjs')
  const payload = {
    type: fields.type || 'import',
    label: fields.label || null,
    target_email: fields.target_email || null,
    detail: fields.detail || null,
    status: fields.status || 'running',
    total: Number(fields.total) || 0,
    done: Number(fields.done) || 0,
    failed: Number(fields.failed) || 0,
    skipped: Number(fields.skipped) || 0,
    created_by: (me && me.email) || null,
    updated_at: new Date().toISOString(),
  }
  const r = await supabaseAdmin('team_mapping_activity', {
    method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload),
  })
  if (!r.ok) throw new Error('Could not create activity row: ' + (await r.text()).slice(0, 300))
  const saved = await r.json()
  return Array.isArray(saved) ? saved[0] : saved
}
// Kept under its original name for the two request modes that create a row
// directly from the frontend (bulk-import progress rows) rather than through
// one of the helpers above.
const createTeamActivity = logTeamActivity

async function updateTeamActivity(body, creds) {
  const { supabaseAdmin } = await import('../lib/auth.mjs')
  const id = body && body.id
  if (!id) throw new Error('id is required')
  const patch = { updated_at: new Date().toISOString() }
  ;['status', 'done', 'failed', 'skipped', 'total'].forEach(k => { if (body[k] !== undefined) patch[k] = body[k] })
  const r = await supabaseAdmin('team_mapping_activity?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch),
  })
  if (!r.ok) throw new Error('Could not update activity row: ' + (await r.text()).slice(0, 300))
  const saved = await r.json()
  const row = Array.isArray(saved) ? saved[0] : saved
  // One aggregate notification per finished import, not per row -- fired here
  // (the ONLY place that sees the transition into a terminal status) rather
  // than from the frontend's own per-row save loop, which never sees "done".
  if (row && row.type === 'import' && (patch.status === 'done' || patch.status === 'failed')) {
    await notifyTeamMappingConnectors({
      kind: 'import', label: row.label, by: row.created_by,
      summary: { done: row.done, failed: row.failed, skipped: row.skipped, total: row.total },
    }, creds).catch(() => {})
  }
  return row
}

async function listTeamActivity() {
  const { supabaseAdmin } = await import('../lib/auth.mjs')
  const r = await supabaseAdmin('team_mapping_activity?select=*&order=created_at.desc&limit=60')
  if (!r.ok) throw new Error('team_mapping_activity may not exist yet -- run supabase/sql/team_mapping_activity_setup.sql')
  return await r.json()
}

async function handleLeadSquared(req, res, me) {
  // Gated on 'leadsquared' -- the id the LeadSquared page's own route guard uses
  // (src/App.jsx). This previously checked 'lq_ops' instead, which meant the
  // Settings checkbox that grants the LeadSquared page did not actually grant its
  // data: a custom viewer given 'leadsquared' got an empty, 403-ing page, while
  // one given 'lq_ops' could read LeadSquared data through the API without being
  // able to open the page. Matching the route guard makes the grant mean what the
  // UI says it means. (Admins and plain viewers are unaffected -- both ids resolve
  // the same for them.)
  // activity_schema/activity_dropdown_options power the Field Schema page under Lead
  // Qualification, a separate sidebar item from the LeadSquared page -- gated on its
  // own id ('lq_field_schema') rather than piggybacking on 'leadsquared', so access to
  // one can be granted/revoked independently of the other, matching how every other
  // sidebar page in this app gets its own PAGE_LIST id.
  // team_users/team_groups/team_manual_* power the separate Team Mapping page --
  // gated on its own id ('team_mapping') for the same reason.
  const { mode } = req.query || {}
  const FIELD_SCHEMA_MODES = ['activity_schema', 'activity_dropdown_options', 'opportunity_schema', 'lead_schema']
  const TEAM_ACTIVITY_MODES = ['team_activity_create', 'team_activity_update', 'team_activity_list']
  const TEAM_CONNECTOR_MODES = ['team_connectors_get', 'team_connectors_save', 'team_connectors_regenerate_key', 'team_connectors_test']
  const TEAM_WATCHER_MODES = ['team_watchers_list', 'team_watchers_add', 'team_watchers_remove']
  const TEAM_MODES = ['team_users', 'team_groups', 'team_manual_save', 'team_manual_delete', 'team_manual_restore', 'team_user_detail', ...TEAM_ACTIVITY_MODES, ...TEAM_CONNECTOR_MODES, ...TEAM_WATCHER_MODES]
  const gateId = FIELD_SCHEMA_MODES.includes(mode) ? 'lq_field_schema' : TEAM_MODES.includes(mode) ? 'team_mapping' : 'leadsquared'
  if (!(await import('../lib/auth.mjs')).canAccessDashboard(me.role, gateId)) {
    return res.status(403).json({ error: 'Forbidden' })
  }
  // Writing a manual note (or logging an import/export) is admin-only regardless
  // of who else has been granted read access to the page -- matches every other
  // "view is grantable, edit is admin-only" surface in this app (e.g. Settings'
  // own per-tab admin gates). team_activity_list stays readable by anyone with
  // page access, same as team_users/team_groups. Connector config -- including
  // a webhook URL and an API key -- is admin-only end to end, both read and
  // write; the Connectors tab simply doesn't render for anyone else.
  // team_watchers_list is readable by anyone with page access (same as
  // team_activity_list) -- only adding/removing a subscription is admin-only,
  // since this is set up on someone's behalf, not day-to-day self-serve.
  if (['team_manual_save', 'team_manual_delete', 'team_manual_restore', 'team_activity_create', 'team_activity_update', 'team_watchers_add', 'team_watchers_remove', ...TEAM_CONNECTOR_MODES].includes(mode) && me.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' })
  }
  // Cheap (env-var only, no network call) -- computed up front so the finished-
  // import notification below can fire a Sheet-sync connector without a second
  // "is LeadSquared configured" branch of its own.
  const creds = leadsquaredCreds()
  // The four activity/connector mode groups are pure Supabase reads/writes --
  // they don't touch LeadSquared at all, so they're dispatched here, before the
  // "LeadSquared must be configured" check below, rather than needlessly
  // depending on it.
  try {
    if (mode === 'team_activity_create') return res.status(200).json(await createTeamActivity(req.body || req.query, me))
    if (mode === 'team_activity_update') return res.status(200).json(await updateTeamActivity(req.body || req.query, creds))
    if (mode === 'team_activity_list') return res.status(200).json({ rows: await listTeamActivity() })
    if (mode === 'team_connectors_get') return res.status(200).json((await getTeamConnectorsConfig()) || {})
    if (mode === 'team_connectors_save') return res.status(200).json(await saveTeamConnectorsConfig(req.body || req.query, me))
    if (mode === 'team_connectors_regenerate_key') return res.status(200).json(await regenerateTeamApiKey(me))
    if (mode === 'team_connectors_test') return res.status(200).json(await testTeamConnector((req.body && req.body.which) || req.query.which, me, creds))
    if (mode === 'team_watchers_list') return res.status(200).json({ rows: await listTeamWatchers() })
    if (mode === 'team_watchers_add') return res.status(200).json(await addTeamWatcher(req.body || req.query, me))
    if (mode === 'team_watchers_remove') return res.status(200).json(await removeTeamWatcher((req.body && req.body.id) || req.query.id))
  } catch (e) {
    return res.status(502).json({ error: String((e && e.message) || e) })
  }
  if (!creds.accessKey || !creds.secretKey) {
    return res.status(500).json({ error: 'LeadSquared is not configured -- set LEADSQUARED_ACCESS_KEY and LEADSQUARED_SECRET_KEY in Vercel env.' })
  }
  const { since, until, leadId, eventCode, pageIndex, pageSize, status, code, schemaName, refresh } = req.query || {}
  const p = { since, until, leadId, eventCode, status, pageIndex: Number(pageIndex) || undefined, pageSize: Number(pageSize) || undefined }
  try {
    if (mode === 'team_users') return res.status(200).json(await fetchTeamUsersMerged(creds))
    if (mode === 'team_groups') return res.status(200).json({ groups: aggregateTeamGroups(await fetchLeadSquaredTeamUsers(creds)) })
    if (mode === 'team_manual_save') return res.status(200).json(await saveTeamManual(req.body || req.query, me, creds))
    if (mode === 'team_manual_delete') return res.status(200).json(await deleteTeamManual((req.body && req.body.ls_email) || req.query.ls_email, me, creds))
    if (mode === 'team_manual_restore') return res.status(200).json(await restoreTeamManual((req.body && req.body.activity_id) || req.query.activity_id, me, creds))
    if (mode === 'team_user_detail') {
      const ids = String(req.query.ids || '').split(',').map(s => s.trim()).filter(Boolean)
      const byId = {}
      ;(await fetchLeadSquaredTeamUsers(creds)).forEach(u => { byId[u.id] = u })
      return res.status(200).json({ details: await fetchLeadSquaredUserDetails(creds, ids, byId) })
    }
    if (mode === 'opportunities') return res.status(200).json(await fetchLeadSquaredOpportunities(creds, p))
    if (mode === 'opportunity_meta') return res.status(200).json(await fetchLeadSquaredOpportunityMeta(creds, p))
    if (mode === 'activities') return res.status(200).json(await fetchLeadSquaredActivities(creds, p))
    if (mode === 'activity_types') return res.status(200).json(await fetchLeadSquaredActivityTypes(creds))
    if (mode === 'activity_schema') return res.status(200).json(await fetchLeadSquaredActivitySchema(creds, { code, refresh: refresh === '1' }))
    if (mode === 'activity_dropdown_options') return res.status(200).json(await fetchLeadSquaredDropdownOptions(creds, { code, schemaName }))
    if (mode === 'opportunity_schema') return res.status(200).json(await fetchLeadSquaredOpportunitySchema(creds, { code, refresh: refresh === '1' }))
    if (mode === 'lead_schema') return res.status(200).json(await fetchLeadSquaredLeadSchema(creds, { refresh: refresh === '1' }))
    if (mode === 'opportunity_detail') return res.status(200).json(await fetchLeadSquaredOpportunityDetail(creds, { opportunityId: req.query.opportunityId }))
    if (mode === 'opportunity_activities') return res.status(200).json(await fetchLeadSquaredOpportunityActivities(creds, { opportunityId: req.query.opportunityId }))
    return res.status(200).json(await fetchLeadSquaredLeads(creds, p)) // default: leads
  } catch (e) {
    return res.status(502).json({ error: String((e && e.message) || e) })
  }
}

// A caller-supplied date is interpolated straight into SQL below (BigQuery's
// REST query API has no bind-parameter support worth the extra round-trip for
// a single DATE literal) -- this strict YYYY-MM-DD check is what makes that
// safe, since anything that doesn't match this shape is rejected outright.
function isIsoDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) }

// Fixed, non-editable query behind the Leverage Careers page -- unlike
// mode=query (arbitrary SQL, admin-only) this is reachable by anyone with
// leverage_careers page access, so it must never take raw SQL from the request.
// Grain is (day, campaign): career_campaign_name is the LeadSquared/BigQuery
// field carrying the literal Meta ad name (confirmed 1:1 with Campaign_Name /
// lead_First_Campaign_name on this table), joined to the frontend's day-level
// Meta ad insights by exact name match -- this is what makes Trend/Compare/the
// Campaign|Month|Day table groupings possible without a second query shape.
// total_interested and won mirror the 'leverage_careers' saved query in the
// BigQuery Console (Settings > Data) as of 2026-08-13 -- ever_got_interested
// is the real interest flag (opp_stage_leverage_careers was the old, looser
// one this replaces), opp_status LIKE '%won%' is new. Date range stays
// page-driven (since/until from the request), unlike that saved query's own
// fixed '> 2025-12-31' floor.
function careersLeadsSql(since, until) {
  const clauses = ["career_campaign_name IS NOT NULL", "career_campaign_name != ''"]
  if (isIsoDate(since)) clauses.push(`DATE(opp_created_on) >= '${since}'`)
  if (isIsoDate(until)) clauses.push(`DATE(opp_created_on) <= '${until}'`)
  return `SELECT
  career_campaign_name AS campaign,
  DATE(opp_created_on) AS lead_date,
  COUNT(prospectid) AS total_leads,
  COUNT(CASE WHEN LOWER(ever_got_interested) = 'yes' THEN prospectid END) AS total_interested,
  COUNT(CASE WHEN LOWER(opp_status) LIKE '%won%' THEN prospectid END) AS won
FROM \`leverage_direct.lsq_careers_opprtunities\`
WHERE ${clauses.join(' AND ')}
GROUP BY 1, 2
ORDER BY lead_date, campaign`
}

// BigQuery lives behind this handler rather than its own file because the
// Vercel Hobby plan is pinned at 12/12 serverless functions. Reached via
// ?source=bigquery&mode=ping|datasets|query|careers_leads.
// ping/datasets/query run arbitrary read-only SQL and stay admin-only
// (configured from the Settings page). careers_leads is the one exception --
// it runs the FIXED query above only, so it's safe to gate on the
// leverage_careers page grant instead, letting a non-admin viewer of that
// page load its own data without needing Settings/admin access.
async function handleBigQuery(req, res, me) {
  const auth = await import('../lib/auth.mjs')
  const mode = (req.query && req.query.mode) || 'ping'
  const gateId = mode === 'careers_leads' ? 'leverage_careers' : 'settings'
  if (!auth.canAccessDashboard(me.role, gateId)) {
    return res.status(403).json({ error: 'Forbidden' })
  }
  const bq = await import('../lib/bigquery.mjs')
  const creds = bq.bigQueryCreds()
  if (!bq.bigQueryConfigured(creds)) {
    return res.status(500).json({
      error: 'BigQuery is not configured -- set BIGQUERY_CLIENT_ID, BIGQUERY_CLIENT_SECRET and BIGQUERY_REFRESH_TOKEN in Vercel env.',
      configured: false,
    })
  }
  try {
    if (mode === 'careers_leads') {
      // lsq_careers_opprtunities isn't partitioned in a way this filter can prune,
      // so every call scans the whole table (~11.5GB as of Aug 2026, well under
      // $0.10 at BigQuery's per-TiB rate) regardless of the since/until window --
      // same cost profile the pre-existing 'leverage_careers' saved query already
      // had. 20GB cap leaves headroom as the table grows before this needs revisiting.
      const { since, until } = req.query || {}
      const out = await bq.bigQuerySelect(careersLeadsSql(since, until), {
        maxBytes: 20_000_000_000, mode: 'careers_leads', dashboardId: 'leverage_careers', userEmail: me.email,
      })
      return res.status(200).json({ configured: true, rows: out.rows || [], totalBytesProcessed: out.totalBytesProcessed })
    }
    if (mode === 'datasets') {
      const d = await bq.bigQueryDatasets()
      return res.status(200).json({ configured: true, ...d, count: d.datasets.length })
    }
    if (mode === 'query') {
      const sql = (req.body && req.body.sql) || (req.query && req.query.sql) || ''
      const out = await bq.bigQuerySelect(sql, {
        dryRun: String((req.query && req.query.dryRun) || '') === '1',
        maxResults: req.query && req.query.maxResults,
        // Only ever a request for a TIGHTER cap: lib/bigquery.mjs clamps this
        // to BQ_BYTES_CEILING and applies that ceiling when it is absent, so a
        // hand-crafted ?maxBytes can no longer raise the billing ceiling.
        maxBytes: req.query && req.query.maxBytes,
        mode: 'query', dashboardId: 'settings', userEmail: me.email,
      })
      return res.status(200).json({ configured: true, ...out })
    }
    // Default 'ping': a dry run costs zero bytes and zero rupees, but still
    // exercises the whole chain -- refresh token, access token, project, region.
    const t0 = Date.now()
    await bq.bigQuerySelect('SELECT 1', { dryRun: true })
    return res.status(200).json({
      configured: true,
      ok: true,
      projectId: creds.projectId,
      location: creds.location,
      ms: Date.now() - t0,
    })
  } catch (e) {
    return res.status(502).json({ configured: true, ok: false, error: String((e && e.message) || e) })
  }
}

// LeadSquared's own bulk-pagination loops (fetchAllPages, above) can take several
// sequential round-trips for a single load -- explicit maxDuration rather than relying on
// the platform default, same pattern as api/send-report.js / api/ask-ai.mjs.
export const maxDuration = 60

// ---------------------------------------------------------------------------
// B2C CEO dashboard  ->  /api/crm-leads?source=b2c
// Finance owns a Google Sheet ("B2C") with one row per calendar day on the
// Consolidated tab (revenue lines, cost lines, net inflow) plus four monthly
// forecast/actual tabs. The sheet id is deliberately NOT hard-coded here --
// this repo is public and the sheet carries P&L data -- so it is read from the
// admin override app_preferences.sheet_url_b2c, else the B2C_SHEET_URL env.
// ---------------------------------------------------------------------------
const B2C_MONTH_TABS = [
  ['people', 'People'],
  ['operating', 'Operating_Cost'],
  ['corp', 'Corp_Overheads'],
  ['offline', 'Offline (rent, support staff costs, maitenance)'],
];

function b2cSheetId(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const m = s.match(/\/d\/([A-Za-z0-9_-]{20,})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{20,}$/.test(s) ? s : '';
}

async function getB2CSheetId() {
  try {
    const { supabaseAdmin } = await import('../lib/auth.mjs');
    const r = await supabaseAdmin('app_preferences?select=value&key=eq.sheet_url_b2c&limit=1');
    if (r.ok) {
      const rows = await r.json();
      const id = b2cSheetId(rows[0] && rows[0].value);
      if (id) return id;
    }
  } catch (_) {}
  return b2cSheetId(process.env.B2C_SHEET_URL || '');
}

// '1,23,456' / '(1200)' / 'Rs 40' -> number. Blank or junk -> null, never 0,
// so the UI can tell 'finance has not filled this in yet' from a real zero.
function b2cNum(v) {
  let s = String(v == null ? '' : v).replace(/[^0-9.()-]/g, '').trim();
  if (!s || s === '-' || s === '()' || s === '.') return null;
  let neg = false;
  if (s.charAt(0) === '(' && s.charAt(s.length - 1) === ')') { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[()]/g, '');
  const n = Number(s);
  if (!isFinite(n)) return null;
  return neg ? -n : n;
}

// A cell can legitimately contain a literal newline inside quotes -- e.g. the Daily
// P&L tab's own Operating Cost header spells its formula across two lines in one
// quoted cell. Splitting the whole blob on \r?\n BEFORE parsing quotes (the naive
// approach) tears a row like that in half, corrupting every column index after it.
// This walks the blob and only splits on a newline genuinely OUTSIDE a quoted field,
// so an embedded newline just becomes part of the cell instead of a false row break.
function splitCsvRows(text) {
  const rows = [];
  let cur = '';
  let q = false;
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') { q = !q; cur += ch; continue; }
    if (!q && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      rows.push(cur); cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur) rows.push(cur);
  return rows;
}

// Reads a gviz CSV tab and returns the column index map plus the raw cells.
function b2cRows(csv, cols) {
  const lines = splitCsvRows(csv).filter(function (l) { return l.trim().length > 0 });
  if (lines.length < 2) return { at: {}, rows: [] };
  const header = splitCsvLine(lines[0]).map(function (h) { return h.trim().toLowerCase() });
  const at = {};
  // The sheet decorates some headers with extra text either BEFORE or after the
  // real column name (e.g. 'Offline Revenue (AC+VAS)', or on the daily P&L/cash
  // flow tabs, a hyperlink label prefix like 'Deposit x 70% x 3.5L SR Online
  // Revenue'). Match the exact name first, then a header that STARTS with it
  // (a suffix decoration), then one that ENDS with it (a prefix decoration),
  // then finally a header that merely CONTAINS it anywhere (decoration on
  // BOTH sides -- e.g. 'Actuals PM Cost (Total)', 'AC: 25% of sales / VAS:
  // 95% of revenue Product Operating Cost (AC, VAS)') -- so a column that
  // gains a description around it degrades to a match, never to a silent
  // blank, however it gets decorated.
  Object.keys(cols).forEach(function (k) {
    let i = header.indexOf(cols[k]);
    if (i < 0) i = header.findIndex(function (h) { return h.indexOf(cols[k]) === 0 });
    if (i < 0) i = header.findIndex(function (h) { return h.length >= cols[k].length && h.slice(-cols[k].length) === cols[k]; });
    if (i < 0) i = header.findIndex(function (h) { return h.indexOf(cols[k]) >= 0 });
    at[k] = i;
  });
  return { at: at, rows: lines.slice(1).map(splitCsvLine) };
}

// Real Google Sheet tab names -- Finance's own naming for these two tabs, not
// something we control. Referenced ONLY here (the fetch URL needs the literal
// tab name); nowhere else in the app should these names appear.
const B2C_PNL_SHEET_TAB = 'Daily P&L - Yash';
const B2C_CASHFLOW_SHEET_TAB = 'Daily Cash Flow - Ramesh';

// Both tabs carry the same 6 revenue/cost line items plus a grand total and a
// net figure, just under different header wording (see CLAUDE.md for why: the
// P&L tab mixes real actuals with formula estimates and monthly-smoothed
// costs, while the Cash Flow tab is real cash, everything on actuals -- so the
// two tabs' Total/Net columns are named differently on purpose). Both maps
// resolve to the SAME internal keys so one row shape and one set of frontend
// formulas serve both statements.
// The Daily P&L tab split its single SR column into SR Online + SR Offline
// (2026-08). This app's "sr" figure is meant to be the combined total, so the
// P&L map exposes both raw columns and b2cParseDays derives 'sr' as their sum
// -- see the hasSplitSr branch below. Daily Cash Flow was NOT split; its SR
// column is already the combined total, just renamed '(Online)' -> '(Total)'
// in the same pass, which is why 'sr' there is still a direct 1:1 lookup.
//
// Same thing happened to the offline revenue column a few weeks later
// (2026-08, still P&L only -- Cash Flow's 'Offline Revenue (AC+VAS)' is still
// one combined column, confirmed against the live sheet): 'AC Offline
// Revenue' and 'VAS Offline Revenue' are now separate columns, and the old
// combined header was renamed to 'Calculated Offline Revenue' -- which is
// why offRev silently went blank on P&L until this fix (the old '(ac + vas)
// offline revenue' string no longer matches anything). Mirrors the SR
// pattern exactly: raw acOffline/vasOffline are exposed, and hasSplitOffline
// below derives offRev as their sum rather than trusting the sheet's own
// 'Calculated' column (which is kept only as a same-value fallback in case
// the split is ever reverted).
const B2C_PNL_COLS = {
  date: 'date', month: 'month',
  srOnline: 'sr online revenue', srOffline: 'sr offline revenue',
  ac: 'ac online revenue', vas: 'vas online revenue',
  acOffline: 'ac offline revenue', vasOffline: 'vas offline revenue',
  offRev: 'calculated offline revenue', totalRev: 'total revenue',
  people: 'people cost', pm: 'pm cost', op: 'operating cost',
  offCost: 'offline cost', corp: 'corp. overheads',
  totalCost: 'total cost',
  // 'Net Inflow' was renamed to 'EBITDA' in an earlier pass, then split into
  // two real columns (2026-08, confirmed against the live sheet): 'EBITDA
  // Before Corp. Overheads' and 'EBITDA After Corp. Overheads'. 'net' is
  // pinned to the exact 'after corp' string on purpose -- both headers
  // contain 'ebitda' and both start with it, so the generic tiered matcher in
  // b2cRows() would otherwise resolve 'ebitda' ambiguously to whichever of
  // the two comes first in the header row (which was 'Before Corp' -- a real,
  // live bug: every 'net'/EBITDA figure this app has ever shown was silently
  // the BEFORE-corp figure, not the after-corp bottom line the rest of the
  // page implies). ebitdaBeforeCorp is exposed as its own field so the page
  // can show both, never derived from one another.
  net: 'ebitda after corp. overheads', ebitdaBeforeCorp: 'ebitda before corp. overheads',
};
// sr and offCost were both silently reading null: the sheet's real headers
// are 'Actuals SR Revenue (Online + Offline)' (was mapped to the stale
// '...(Total)' wording) and 'Actuals Experience Centre Cost + Partner
// Payout' (contains no 'offline' text at all, unlike its P&L-tab sibling) --
// confirmed against the live sheet. Both now use a short, stable substring
// so the 4th "contains anywhere" matcher tier (api/crm-leads.js b2cRows())
// finds them regardless of the 'Actuals ...' decoration around them.
const B2C_CASHFLOW_COLS = {
  date: 'date', month: 'month',
  sr: 'sr revenue', ac: 'ac online revenue', vas: 'vas online revenue',
  offRev: 'offline revenue (ac + vas)', totalRev: 'total cash inflow',
  people: 'people cost', pm: 'pm cost', op: 'operating cost',
  offCost: 'experience centre cost', corp: 'corp. overheads',
  totalCost: 'total cash outflow', net: 'net cash inflow',
};
// ebitdaBeforeCorp only ever resolves on P&L (Cash Flow's cols has no such
// key, so at.ebitdaBeforeCorp is undefined there and this stays null on every
// Cash Flow row -- harmless, just never read by anything on that statement).
const B2C_VALUE_KEYS = ['sr', 'ac', 'vas', 'offRev', 'totalRev', 'people', 'pm', 'op', 'offCost', 'corp', 'totalCost', 'net', 'ebitdaBeforeCorp'];

function b2cParseDays(csv, cols) {
  const parsed = b2cRows(csv, cols);
  const at = parsed.at;
  // True only for the P&L map (which carries srOnline/srOffline instead of a
  // direct 'sr' column) -- Cash Flow's cols has no such keys, so at.srOnline/
  // at.srOffline are both undefined there and this stays false.
  const hasSplitSr = at.srOnline >= 0 || at.srOffline >= 0;
  // Same idea for the offline-revenue split (P&L only, see the comment on
  // B2C_PNL_COLS above) -- Cash Flow's cols has no acOffline/vasOffline keys,
  // so this stays false there and offRev keeps reading its own direct column.
  const hasSplitOffline = at.acOffline >= 0 || at.vasOffline >= 0;
  const days = [];
  let gridFrom = null;
  let gridTo = null;
  for (const row of parsed.rows) {
    const iso = toIso(String(row[at.date] == null ? '' : row[at.date]).trim());
    if (!iso) continue;
    if (!gridFrom) gridFrom = iso;
    gridTo = iso;
    const d = { date: iso, month: String(row[at.month] == null ? '' : row[at.month]).trim() };
    let any = false;
    // Expose the raw online/offline split too (P&L only) so the frontend can
    // show them as separate line items, alongside 'sr' which stays the
    // combined total for both statements (KPI cards, Slack reports, etc).
    const onlineV = at.srOnline >= 0 ? b2cNum(row[at.srOnline]) : null;
    const offlineV = at.srOffline >= 0 ? b2cNum(row[at.srOffline]) : null;
    if (hasSplitSr) {
      d.srOnline = onlineV;
      d.srOffline = offlineV;
      if (onlineV != null || offlineV != null) any = true;
    }
    const acOfflineV = at.acOffline >= 0 ? b2cNum(row[at.acOffline]) : null;
    const vasOfflineV = at.vasOffline >= 0 ? b2cNum(row[at.vasOffline]) : null;
    if (hasSplitOffline) {
      d.acOffline = acOfflineV;
      d.vasOffline = vasOfflineV;
      if (acOfflineV != null || vasOfflineV != null) any = true;
    }
    for (const k of B2C_VALUE_KEYS) {
      let v;
      if (k === 'sr' && hasSplitSr) {
        v = (onlineV == null && offlineV == null) ? null : (onlineV || 0) + (offlineV || 0);
      } else if (k === 'offRev' && hasSplitOffline) {
        v = (acOfflineV == null && vasOfflineV == null) ? null : (acOfflineV || 0) + (vasOfflineV || 0);
      } else {
        v = at[k] >= 0 ? b2cNum(row[at[k]]) : null;
      }
      d[k] = v;
      if (v != null) any = true;
    }
    if (any) days.push(d);
  }
  return { days: days, gridFrom: gridFrom, gridTo: gridTo };
}

// Pure data fetch, no req/res -- factored out of handleB2C so a server-side
// caller with no HTTP request in hand (the b2c_daily_report cron in
// api/send-report.mjs) can get the exact same {pnl, cashFlow, monthly} shape
// the CeoB2CDashboard page reads, without going through an HTTP round trip
// (which would also need a session cookie this caller doesn't have).
export async function fetchB2CData() {
  const id = await getB2CSheetId();
  if (!id) return { configured: false, pnl: { days: [] }, cashFlow: { days: [] }, monthly: {}, ts: Date.now() };
  const base = 'https://docs.google.com/spreadsheets/d/' + id + '/gviz/tq?tqx=out:csv';
  const grab = async function (u) {
    const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) throw new Error('sheet ' + r.status);
    return r.text();
  };
  const csvs = await Promise.all([
    grab(base + '&sheet=' + encodeURIComponent(B2C_PNL_SHEET_TAB)),
    grab(base + '&sheet=' + encodeURIComponent(B2C_CASHFLOW_SHEET_TAB)),
  ].concat(
    B2C_MONTH_TABS.map(function (t) { return grab(base + '&sheet=' + encodeURIComponent(t[1])) })
  ));
  const pnl = b2cParseDays(csvs[0], B2C_PNL_COLS);
  const cashFlow = b2cParseDays(csvs[1], B2C_CASHFLOW_COLS);
  const monthly = {};
  B2C_MONTH_TABS.forEach(function (t, i) {
    const p = b2cRows(csvs[i + 2], { month: 'month', actual: 'actual', forecast: 'forecast' });
    monthly[t[0]] = p.rows.map(function (r) {
      return {
        month: String(r[p.at.month] == null ? '' : r[p.at.month]).trim(),
        actual: p.at.actual >= 0 ? b2cNum(r[p.at.actual]) : null,
        forecast: p.at.forecast >= 0 ? b2cNum(r[p.at.forecast]) : null,
      };
    }).filter(function (m) { return m.month });
  });
  return { configured: true, pnl: pnl, cashFlow: cashFlow, monthly: monthly, ts: Date.now() };
}

async function handleB2C(req, res, me) {
  const { canAccessDashboard } = await import('../lib/auth.mjs');
  const canPnl = canAccessDashboard(me.role, 'ceo_b2c_pnl');
  const canCashFlow = canAccessDashboard(me.role, 'ceo_b2c_cashflow');
  if (!canPnl && !canCashFlow) return res.status(403).json({ error: 'Forbidden' });
  try {
    const data = await fetchB2CData();
    // The gate above is an OR, so someone granted only ONE of the two statements
    // still reaches this point -- and the raw payload carries both. That meant a
    // viewer granted only Daily Cash Flow could read P&L revenue, cost and EBITDA
    // straight off the API, even though the route guard hides the page itself.
    // Return only the statement(s) the caller is actually entitled to. `monthly`
    // is the shared plan/forecast series both statements render, so it follows
    // either grant.
    return res.status(200).json({
      ...data,
      pnl: canPnl ? data.pnl : { days: [] },
      cashFlow: canCashFlow ? data.cashFlow : { days: [] },
    });
  } catch (e) {
    return res.status(502).json({ error: 'sheet fetch failed', detail: String((e && e.message) || e) });
  }
}

export default async function handler(req, res) {
  // The one endpoint on this route an external, unauthenticated-to-Quantum
  // script is meant to reach -- the Team Mapping "read-only API" connector.
  // Deliberately checked BEFORE getSessionUser: an automation with no human
  // logged in has no session cookie to send, and never will.
  if ((req.query && req.query.source) === 'leadsquared' && (req.query && req.query.mode) === 'team_export_pull') {
    return handleTeamExportPull(req, res)
  }
  const { getSessionUser, canAccessDashboard } = await import('../lib/auth.mjs')
  const me = getSessionUser(req)
  if (!me) return res.status(401).json({ error: 'Not signed in' })

  if ((req.query && req.query.source) === 'leadsquared') return handleLeadSquared(req, res, me)
  if ((req.query && req.query.source) === 'bigquery') return handleBigQuery(req, res, me)
  if ((req.query && req.query.source) === 'b2c') return handleB2C(req, res, me)

  if (!canAccessDashboard(me.role, 'meta_ads') && !canAccessDashboard(me.role, 'google_ads')) {
    return res.status(403).json({ error: 'Forbidden' })
  }
  try {
    const since = (req.query && req.query.since) || null; // 'YYYY-MM-DD'
    const until = (req.query && req.query.until) || null;
    const SHEET_URL = await getSheetUrl();
    const r = await fetch(SHEET_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) return res.status(502).json({ error: 'sheet fetch failed', status: r.status });
    const text = await r.text();
    const lines = text.split(/\r?\n/).filter(l => l.length > 0);
    if (lines.length < 2) return res.status(200).json({ byName: {}, byDate: {}, humanQL: {}, aiQL: {}, humanQLByDate: {}, aiQLByDate: {}, total: 0, rows: 0, distinct: 0, since, until, ts: Date.now() });
    const header = splitCsvLine(lines[0]).map(h => h.trim().toLowerCase());
    const dateIdx = header.indexOf('lead_created_date');
    const nameIdx = header.indexOf('opp_first_campaign_name');
    const leadsIdx = header.indexOf('leads');
    const humanQlIdx = header.indexOf('fw_human_ql_count');
    const aiQlIdx = header.indexOf('fw_ai_ql_count');
    const byName = {};
    const byDate = {}; // { 'YYYY-MM-DD': totalLeadsThatDay } - lets callers roll up into month/day buckets client-side
    const humanQL = {}; // { <adName>: FW_Human_QL_Count } -- all-time, ad-level, see note above
    const aiQL = {};    // { <adName>: FW_AI_QL_Count } -- all-time, ad-level, see note above
    const humanQLByDate = {}; // { 'YYYY-MM-DD': totalHumanQLThatDay } -- account-wide, for callers with no per-ad breakdown (e.g. Day-on-Day/Month-on-Month)
    const aiQLByDate = {};
    let total = 0; let rows = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = splitCsvLine(lines[i]);
      const name = (cols[nameIdx] || '').trim();
      if (!name) continue; // skip unattributed (blank) rows
      const iso = toIso(cols[dateIdx]);
      if (since || until) {
        if (!iso) continue;
        if (since && iso < since) continue;
        if (until && iso > until) continue;
      }
      const n = parseInt((cols[leadsIdx] || '0').replace(/[^0-9-]/g, ''), 10) || 0;
      byName[name] = (byName[name] || 0) + n;
      if (iso) byDate[iso] = (byDate[iso] || 0) + n;
      total += n; rows++;
      if (humanQlIdx !== -1) {
        const hq = parseInt((cols[humanQlIdx] || '').replace(/[^0-9-]/g, ''), 10);
        if (!isNaN(hq)) {
          humanQL[name] = (humanQL[name] || 0) + hq;
          if (iso) humanQLByDate[iso] = (humanQLByDate[iso] || 0) + hq;
        }
      }
      if (aiQlIdx !== -1) {
        const aq = parseInt((cols[aiQlIdx] || '').replace(/[^0-9-]/g, ''), 10);
        if (!isNaN(aq)) {
          aiQL[name] = (aiQL[name] || 0) + aq;
          if (iso) aiQLByDate[iso] = (aiQLByDate[iso] || 0) + aq;
        }
      }
    }
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');
    return res.status(200).json({ byName, byDate, humanQL, aiQL, humanQLByDate, aiQLByDate, total, rows, distinct: Object.keys(byName).length, since, until, ts: Date.now() });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) });
  }
}
