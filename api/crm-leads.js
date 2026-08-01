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
async function fetchLeadSquaredActivityTypeMeta(creds, eventCode) {
  const code = String(eventCode)
  if (_lsqActivityMetaCache[code]) return _lsqActivityMetaCache[code]
  const data = await leadsquaredGet('/v2/ProspectActivity.svc/CustomActivity/GetActivitySetting', creds, { code })
  _lsqActivityMetaCache[code] = data
  return data
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
async function fetchLeadSquaredOpportunityMeta(creds, { eventCode }) {
  const code = Number(eventCode) || 12003
  if (_lsqOppMetaCache && _lsqOppMetaCache.code === code) return _lsqOppMetaCache.data
  const data = await leadsquaredGet('/v2/OpportunityManagement.svc/GetOpportunityTypeMetadata', creds, { code: String(code) })
  _lsqOppMetaCache = { code, data }
  return data
}

async function handleLeadSquared(req, res, me) {
  // Opportunities and activities are pipeline/ops data, gated the same as QL Ops rather
  // than the meta_ads/google_ads gate the sheet-based CRM path below uses.
  if (!(await import('../lib/auth.mjs')).canAccessDashboard(me.role, 'lq_ops')) {
    return res.status(403).json({ error: 'Forbidden' })
  }
  const creds = leadsquaredCreds()
  if (!creds.accessKey || !creds.secretKey) {
    return res.status(500).json({ error: 'LeadSquared is not configured -- set LEADSQUARED_ACCESS_KEY and LEADSQUARED_SECRET_KEY in Vercel env.' })
  }
  const { mode, since, until, leadId, eventCode, pageIndex, pageSize, status } = req.query || {}
  const p = { since, until, leadId, eventCode, status, pageIndex: Number(pageIndex) || undefined, pageSize: Number(pageSize) || undefined }
  try {
    if (mode === 'opportunities') return res.status(200).json(await fetchLeadSquaredOpportunities(creds, p))
    if (mode === 'opportunity_meta') return res.status(200).json(await fetchLeadSquaredOpportunityMeta(creds, p))
    if (mode === 'activities') return res.status(200).json(await fetchLeadSquaredActivities(creds, p))
    if (mode === 'activity_types') return res.status(200).json(await fetchLeadSquaredActivityTypes(creds))
    return res.status(200).json(await fetchLeadSquaredLeads(creds, p)) // default: leads
  } catch (e) {
    return res.status(502).json({ error: String((e && e.message) || e) })
  }
}

// BigQuery lives behind this handler rather than its own file because the
// Vercel Hobby plan is pinned at 12/12 serverless functions. Reached via
// ?source=bigquery&mode=ping|datasets|query. Admin-only: it is configured
// from the Settings page and can run arbitrary read-only SQL.
async function handleBigQuery(req, res, me) {
  const auth = await import('../lib/auth.mjs')
  if (!auth.canAccessDashboard(me.role, 'settings')) {
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
  const mode = (req.query && req.query.mode) || 'ping'
  try {
    if (mode === 'datasets') {
      const d = await bq.bigQueryDatasets()
      return res.status(200).json({ configured: true, ...d, count: d.datasets.length })
    }
    if (mode === 'query') {
      const sql = (req.body && req.body.sql) || (req.query && req.query.sql) || ''
      const out = await bq.bigQuerySelect(sql, {
        dryRun: String((req.query && req.query.dryRun) || '') === '1',
        maxResults: req.query && req.query.maxResults,
        maxBytes: req.query && req.query.maxBytes,
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

// Reads a gviz CSV tab and returns the column index map plus the raw cells.
function b2cRows(csv, cols) {
  const lines = String(csv || '').split(/\r?\n/).filter(function (l) { return l.trim().length > 0 });
  if (lines.length < 2) return { at: {}, rows: [] };
  const header = splitCsvLine(lines[0]).map(function (h) { return h.trim().toLowerCase() });
  const at = {};
  // The sheet decorates some headers, e.g. 'Offline Revenue (AC+VAS)'. Match the
  // exact name first, then fall back to the first header that starts with it, so
  // a column that gains a suffix degrades to a match, never to a silent blank.
  Object.keys(cols).forEach(function (k) {
    let i = header.indexOf(cols[k]);
    if (i < 0) i = header.findIndex(function (h) { return h.indexOf(cols[k]) === 0 });
    at[k] = i;
  });
  return { at: at, rows: lines.slice(1).map(splitCsvLine) };
}

const B2C_COLS = {
  date: 'date', month: 'month',
  sr: 'sr online revenue', ac: 'ac online revenue', vas: 'vas online revenue',
  offRev: 'offline revenue', totalRev: 'total revenue',
  people: 'people cost', pm: 'pm cost', op: 'operating cost',
  offCost: 'offline cost', corp: 'corp. overheads',
  totalCost: 'total cost', net: 'net inflow',
};
const B2C_VALUE_KEYS = ['sr', 'ac', 'vas', 'offRev', 'totalRev', 'people', 'pm', 'op', 'offCost', 'corp', 'totalCost', 'net'];

async function handleB2C(req, res, me) {
  const { canAccessDashboard } = await import('../lib/auth.mjs');
  if (!canAccessDashboard(me.role, 'ceo_b2c')) return res.status(403).json({ error: 'Forbidden' });
  const id = await getB2CSheetId();
  if (!id) return res.status(200).json({ configured: false, days: [], monthly: {}, ts: Date.now() });
  const base = 'https://docs.google.com/spreadsheets/d/' + id + '/gviz/tq?tqx=out:csv';
  const grab = async function (u) {
    const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) throw new Error('sheet ' + r.status);
    return r.text();
  };
  try {
    const csvs = await Promise.all([grab(base + '&gid=0')].concat(
      B2C_MONTH_TABS.map(function (t) { return grab(base + '&sheet=' + encodeURIComponent(t[1])) })
    ));
    const parsed = b2cRows(csvs[0], B2C_COLS);
    const at = parsed.at;
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
      for (const k of B2C_VALUE_KEYS) {
        const v = at[k] >= 0 ? b2cNum(row[at[k]]) : null;
        d[k] = v;
        if (v != null) any = true;
      }
      if (any) days.push(d);
    }
    const monthly = {};
    B2C_MONTH_TABS.forEach(function (t, i) {
      const p = b2cRows(csvs[i + 1], { month: 'month', actual: 'actual', forecast: 'forecast' });
      monthly[t[0]] = p.rows.map(function (r) {
        return {
          month: String(r[p.at.month] == null ? '' : r[p.at.month]).trim(),
          actual: p.at.actual >= 0 ? b2cNum(r[p.at.actual]) : null,
          forecast: p.at.forecast >= 0 ? b2cNum(r[p.at.forecast]) : null,
        };
      }).filter(function (m) { return m.month });
    });
    return res.status(200).json({ configured: true, days: days, monthly: monthly, gridFrom: gridFrom, gridTo: gridTo, ts: Date.now() });
  } catch (e) {
    return res.status(502).json({ error: 'sheet fetch failed', detail: String((e && e.message) || e) });
  }
}

export default async function handler(req, res) {
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
