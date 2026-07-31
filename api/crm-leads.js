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

// Just today, when no since/until is given for the all-activity-types feed (see the cap
// below for why). This endpoint (unlike Leads/Opportunities) requires a bounded window
// rather than defaulting to all-time.
function defaultRecentWindow() {
  const toIso = d => d.toISOString().slice(0, 10)
  const today = toIso(new Date())
  return { since: today, until: today }
}

// RetrieveRecentlyModified (the all-activity-types feed, used when no eventCode narrows
// the query) genuinely 500s on this account once the window gets wide -- verified live:
// a 1-day window succeeds, a 7-day window fails with LeadSquared's own generic "There was
// an error processing the request" (their backend choking on volume, not a malformed
// request -- this account logs ~78k rows for ONE activity type alone in 7 days, so an
// all-125-types scan over the same window is plausibly in the millions). Capped here at
// 2 days -- conservative, since the real breaking point between 1 and 7 days is unknown --
// with a clear error instead of forwarding a confusing opaque 500. Narrowing to one
// Activity Type (eventCode) does NOT hit this limit -- verified live with a 7-day,
// eventCode-scoped query returning 78,350 matching rows without error -- so a wide window
// is only a problem for the "all types" case.
const ALL_TYPES_MAX_WINDOW_DAYS = 2

// Leads.Get (advanced search by lead criteria) -- filters mirror what LeadSquared's own
// "Manage Leads" grid filters on: a field name (LookupName), an operator, and a value.
// since/until filter on CreatedOn, matching the date-range convention every other data
// source in this app already uses.
async function fetchLeadSquaredLeads(creds, { since, until, pageIndex, pageSize }) {
  const body = {
    Parameter: since || until
      ? { LookupName: 'CreatedOn', LookupValue: (since || '1900-01-01') + ' 00:00:00', SqlOperator: '>=' }
      : { LookupName: 'CreatedOn', LookupValue: '1900-01-01 00:00:00', SqlOperator: '>=' },
    Columns: { Include_CSV: 'ProspectID,FirstName,LastName,EmailAddress,Phone,Mobile,LeadType,Source,Status,ProspectStage,Owner,CreatedOn,ModifiedOn' },
    Sorting: { ColumnName: 'CreatedOn', Direction: '1' },
    Paging: { PageIndex: pageIndex || 1, PageSize: Math.min(pageSize || 200, 1000) },
  }
  const data = await leadsquaredPost('/v2/LeadManagement.svc/Leads.Get', creds, body)
  const rows = Array.isArray(data) ? data : (data && data.Leads) || []
  // until isn't expressible as a second SqlOperator in one Parameter block (the API takes
  // one field/operator/value triple) -- filtered client-side on the page returned instead.
  const filtered = until ? rows.filter(r => !r.CreatedOn || r.CreatedOn <= until + ' 23:59:59') : rows
  return { rows: filtered, count: filtered.length, since, until }
}

// Opportunity/Retrieve/BySearchParameter -- OpportunityEventCode is account-specific;
// 12003 is the code this same LeadSquared account already uses elsewhere in this app
// (see LEADSQUARED_OPPORTUNITY_EVENT in HumanQLDetailDashboard.jsx) for opportunity deep
// links, so it's reused here as the default rather than guessed fresh.
async function fetchLeadSquaredOpportunities(creds, { since, until, pageIndex, pageSize, eventCode }) {
  const code = Number(eventCode) || 12003
  // First real error hit against the live account: "AdvancedSearch criteria does not match
  // ActivityEvent passed" -- this search REQUIRES the AdvancedSearch to restate the same
  // OpportunityEventCode as its own condition (LSO:"ActivityEvent"/LSO_Type:"PAEvent"), it
  // is not implied by OpportunityEventCode alone. This condition is now always present.
  // A date-range RowCondition is added alongside it on the same "and" when since/until are
  // given -- best-effort by analogy with the Activity search example in the docs, since no
  // worked date-range example exists for this specific endpoint; if the API rejects it,
  // drop back to filtering by CreatedOn client-side on the returned page instead.
  const rowCondition = [{ SubConOp: 'And', LSO: 'ActivityEvent', LSO_Type: 'PAEvent', Operator: 'eq', RSO: String(code) }]
  if (since || until) {
    rowCondition.push({
      SubConOp: 'And', LSO: 'CreatedOn', LSO_Type: 'PAField',
      Operator: 'between', RSO: (since || '1900-01-01') + ',' + (until || '2999-12-31'),
    })
  }
  const advancedSearch = {
    GrpConOp: 'And',
    Conditions: [{ Type: 'Activity', ConOp: 'and', RowCondition: rowCondition }],
    QueryTimeZone: 'India Standard Time',
  }
  const body = {
    OpportunityEventCode: code,
    AdvancedSearch: JSON.stringify(advancedSearch),
    Paging: { PageIndex: pageIndex || 1, PageSize: Math.min(pageSize || 200, 1000) },
    Sorting: { ColumnName: 'CreatedOn', Direction: 1 },
  }
  const data = await leadsquaredPost('/v2/OpportunityManagement.svc/Retrieve/BySearchParameter', creds, body)
  const rows = Array.isArray(data) ? data : (data && (data.Opportunities || data.RecordSet)) || []
  return { rows, count: rows.length, since, until }
}

// ProspectActivity.svc/Retrieve -- single-lead activity timeline (leadId given), OR the
// bulk cross-lead "Manage Activity" feed (no leadId) -- two real LeadSquared endpoints:
//  - RetrieveRecentlyModified: all activity types in one date window, standard creds.
//  - CustomActivity/RetrieveByActivityEvent: one specific type (eventCode) + date window,
//    also returns CreatedByName/CreatedByEmailAddress (the real actor) which the all-types
//    feed does not carry -- used when the caller narrows to a single Activity Type.
// Verified against apidocs.leadsquared.com before building (not guessed): both bulk
// endpoints need Parameter{FromDate,ToDate,...} + Paging{PageIndex,PageSize} +
// Sorting{ColumnName,Direction} as three separate top-level objects.
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
  const paging = { PageIndex: pageIndex || 1, PageSize: Math.min(pageSize || 200, 1000) }
  const sorting = { ColumnName: 'CreatedOn', Direction: 1 }
  if (!eventCode) {
    const spanDays = (new Date(toDate) - new Date(fromDate)) / 86400000
    if (spanDays > ALL_TYPES_MAX_WINDOW_DAYS) {
      throw new Error(`The all-activity-types feed is limited to a ${ALL_TYPES_MAX_WINDOW_DAYS}-day window on this account (LeadSquared's own backend errors on a wider all-type scan at this account's volume) -- narrow the date range, or pick a specific Activity Type (eventCode) instead, which has no such limit.`)
    }
  }
  if (eventCode) {
    const body = { Parameter: { FromDate: fromDate, ToDate: toDate, ActivityEvent: Number(eventCode), RemoveEmptyValue: true }, Paging: paging, Sorting: sorting }
    const data = await leadsquaredPost('/v2/ProspectActivity.svc/CustomActivity/RetrieveByActivityEvent', creds, body)
    const rows = (data && data.List) || []
    return { rows, count: (data && data.RecordCount) || rows.length, since: win.since, until: win.until, eventCode: Number(eventCode) }
  }
  const body = { Parameter: { FromDate: fromDate, ToDate: toDate, IncludeCustomFields: 0 }, Paging: paging, Sorting: sorting }
  const data = await leadsquaredPost('/v2/ProspectActivity.svc/RetrieveRecentlyModified', creds, body)
  const rows = (data && data.ProspectActivities) || []
  return { rows, count: (data && data.RecordCount) || rows.length, since: win.since, until: win.until }
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
  const { mode, since, until, leadId, eventCode, pageIndex, pageSize } = req.query || {}
  const p = { since, until, leadId, eventCode, pageIndex: Number(pageIndex) || undefined, pageSize: Number(pageSize) || undefined }
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

export default async function handler(req, res) {
  const { getSessionUser, canAccessDashboard } = await import('../lib/auth.mjs')
  const me = getSessionUser(req)
  if (!me) return res.status(401).json({ error: 'Not signed in' })

  if ((req.query && req.query.source) === 'leadsquared') return handleLeadSquared(req, res, me)

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
