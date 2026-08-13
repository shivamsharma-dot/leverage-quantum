// BigQuery REST helper.
//
// Mirrors the call that was verified by hand in the OAuth 2.0 Playground on
// 28 Jul 2026: POST /bigquery/v2/projects/<project>/queries with a standard-SQL
// body, authorised by a refresh-token-derived access token.
//
// Credentials live ONLY in Vercel env -- THE REPO IS PUBLIC, never inline them:
//   BIGQUERY_CLIENT_ID / BIGQUERY_CLIENT_SECRET / BIGQUERY_REFRESH_TOKEN
//
// The OAuth client is Internal on project leverage-quantum-498506, so the
// refresh token is not subject to the 7-day external-testing expiry.
// The data itself lives in a DIFFERENT project (leverage-production) that the
// authorising account only has viewer/jobUser access to -- that is fine, the
// job is billed to whichever project we name in the URL.

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const BQ_HOST = 'https://bigquery.googleapis.com/bigquery/v2'
const DEFAULT_PROJECT = 'leverage-production'
const DEFAULT_LOCATION = 'asia-south1'

export function bigQueryCreds() {
  return {
    clientId: process.env.BIGQUERY_CLIENT_ID || '',
    clientSecret: process.env.BIGQUERY_CLIENT_SECRET || '',
    refreshToken: process.env.BIGQUERY_REFRESH_TOKEN || '',
    projectId: process.env.BIGQUERY_PROJECT_ID || DEFAULT_PROJECT,
    location: process.env.BIGQUERY_LOCATION || DEFAULT_LOCATION,
  }
}

export function bigQueryConfigured(c = bigQueryCreds()) {
  return Boolean(c.clientId && c.clientSecret && c.refreshToken)
}

// Access tokens last ~1h. Cache in module scope so a warm lambda reuses one
// token instead of burning a refresh round-trip on every single invocation.
let _tok = { value: null, exp: 0 }

export async function bigQueryAccessToken(creds = bigQueryCreds()) {
  if (_tok.value && Date.now() < _tok.exp) return _tok.value
  if (!bigQueryConfigured(creds)) {
    throw new Error('BigQuery is not configured -- set BIGQUERY_CLIENT_ID, BIGQUERY_CLIENT_SECRET and BIGQUERY_REFRESH_TOKEN in Vercel env.')
  }
  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    refresh_token: creds.refreshToken,
    grant_type: 'refresh_token',
  })
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok || !d.access_token) {
    const why = d.error_description || d.error || ('HTTP ' + r.status)
    throw new Error('BigQuery token refresh failed: ' + why)
  }
  const ttl = Math.max(60, (Number(d.expires_in) || 3600) - 120)
  _tok = { value: d.access_token, exp: Date.now() + ttl * 1000 }
  return _tok.value
}

// BigQuery hands back rows as { f: [{ v }, ...] } with types described only in
// the schema, and every scalar arrives as a STRING (that is why the parity
// check showed 4.0660831692071205E8 rather than a number). Coerce here so
// callers get real JS numbers/booleans and never have to think about it.
const NUMERIC = new Set(['INTEGER', 'INT64', 'FLOAT', 'FLOAT64', 'NUMERIC', 'BIGNUMERIC'])

function coerce(type, v) {
  if (v === null || v === undefined) return null
  if (NUMERIC.has(type)) {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  if (type === 'BOOLEAN' || type === 'BOOL') return v === true || v === 'true'
  return v
}

export function decodeRows(schema, rows) {
  const fields = (schema && schema.fields) || []
  return (rows || []).map(r => {
    const out = {}
    fields.forEach((f, i) => {
      const cell = (r.f || [])[i]
      out[f.name] = f.mode === 'REPEATED'
        ? ((cell && cell.v) || []).map(x => coerce(f.type, x && x.v))
        : coerce(f.type, cell ? cell.v : null)
    })
    return out
  })
}

// Defence in depth. The authorising account only holds viewer/jobUser on the
// data project so a write would fail anyway, but refusing it here means a bad
// string can never even reach Google.
const FORBIDDEN = /^(INSERT|UPDATE|DELETE|MERGE|DROP|TRUNCATE|ALTER|CREATE|REPLACE|GRANT|REVOKE|CALL|EXPORT|LOAD|BEGIN|COMMIT|ROLLBACK|DECLARE|SET|EXECUTE|ASSERT|UNDROP|IF|WHILE|LOOP|FOR|REPEAT|RAISE|RETURN|BREAK|CONTINUE)\b/i

// BigQuery accepts a multi-statement SCRIPT in a single request, so a check
// anchored to the start of the WHOLE string was bypassable: "SELECT 1 AS a;
// DELETE FROM t" starts with SELECT and sailed straight through to Google
// (only the authorising account's viewer-only IAM refused it). Strip comments
// and quoted literals, split on top-level semicolons, and judge EVERY
// statement -- verified live on 2026-08-12 with exactly that payload.
function sqlSkeleton(sql) {
  const s = String(sql || '')
  let out = ''
  let i = 0
  while (i < s.length) {
    const c = s[i]
    const two = s.slice(i, i + 2)
    if (two === '--' || c === '#') {                 // line comment
      while (i < s.length && s[i] !== '\n') i++
      continue
    }
    if (two === '/*') {                              // block comment
      i += 2
      while (i < s.length && s.slice(i, i + 2) !== '*/') i++
      i += 2
      continue
    }
    if (c === '"' || c === "'" || c === '`') {        // string literal / quoted ident
      const q = c
      const triple = s.slice(i, i + 3) === q + q + q
      i += triple ? 3 : 1
      while (i < s.length) {
        if (s[i] === '\\') { i += 2; continue }
        if (triple ? s.slice(i, i + 3) === q + q + q : s[i] === q) { i += triple ? 3 : 1; break }
        i++
      }
      out += ' '                                     // collapses to whitespace
      continue
    }
    out += c
    i++
  }
  return out
}

export function assertReadOnly(sql) {
  const s = String(sql || '').trim()
  if (!s) throw new Error('Empty query.')
  if (s.length > 100000) throw new Error('Query is too long -- 100,000 character limit.')
  const statements = sqlSkeleton(s).split(';').map(x => x.trim()).filter(Boolean)
  if (!statements.length) throw new Error('Empty query.')
  if (statements.length > 1) throw new Error('Only one statement can run at a time -- remove the extra ";".')
  for (const st of statements) {
    if (FORBIDDEN.test(st)) throw new Error('Only read-only SELECT/WITH queries are allowed.')
    if (!/^(SELECT|WITH|\()/i.test(st)) throw new Error('Query must start with SELECT or WITH.')
  }
  return s
}

// Hard server-side ceiling on bytes billed. A caller may ask for LESS (the
// Settings cost gate does); nobody can ask for more, and nobody can opt out by
// simply omitting it. api/crm-leads.js used to forward ?maxBytes straight from
// the query string into this option, which made the billing ceiling
// caller-controlled -- i.e. no ceiling at all.
export const BQ_BYTES_CEILING = 500 * 1024 * 1024 * 1024 // 500 GiB, ~USD 3 on-demand

export function bytesBilledCap(v) {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return BQ_BYTES_CEILING
  return Math.min(Math.floor(n), BQ_BYTES_CEILING)
}

// One row per REAL (non-dry-run) BigQuery job -- ping (always dryRun) and a
// plain Estimate click never reach here, since neither creates a billable job.
// Awaited (not fire-and-forget): a Vercel function can terminate the instant
// its response is sent, same reasoning as ask-ai.mjs's logToolCall/logUsage.
// Failure is swallowed -- logging must never break the real BigQuery answer.
async function logBigQueryUsage(fields) {
  const url = process.env.SUPABASE_URL || 'https://tsyekthwthxszmsgqfej.supabase.co'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) return
  try {
    await fetch(url + '/rest/v1/bigquery_jobs', {
      method: 'POST',
      headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ ...fields, created_at: new Date().toISOString() }),
      signal: AbortSignal.timeout(5000),
    })
  } catch (_) { /* logging must never break the real response */ }
}

export async function bigQuerySelect(sql, opts = {}) {
  const creds = bigQueryCreds()
  const token = await bigQueryAccessToken(creds)
  const payload = {
    query: assertReadOnly(sql),
    useLegacySql: false,
    location: opts.location || creds.location,
    timeoutMs: Math.min(Number(opts.timeoutMs) || 45000, 55000),
    maxResults: Math.min(Number(opts.maxResults) || 1000, 20000),
  }
  if (opts.dryRun) payload.dryRun = true
  // A dry run is never billed, and putting a ceiling on one makes BigQuery
  // refuse the estimate for exactly the expensive queries we most want an
  // estimate for -- so the cap goes on the real call only, and always.
  if (!payload.dryRun) payload.maximumBytesBilled = String(bytesBilledCap(opts.maxBytes))
  const t0 = Date.now()
  const url = BQ_HOST + '/projects/' + encodeURIComponent(creds.projectId) + '/queries'
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) {
    const e = (d && d.error) || {}
    throw new Error('BigQuery: ' + (e.message || ('HTTP ' + r.status)))
  }
  // A dry run returns no schema/rows -- only the byte estimate, which is what
  // the Settings 'Test connection' button wants so it costs nothing to click.
  if (opts.dryRun) {
    return {
      dryRun: true,
      totalBytesProcessed: Number(d.totalBytesProcessed || 0),
      cacheHit: Boolean(d.cacheHit),
      rows: [],
    }
  }
  const out = {
    rows: decodeRows(d.schema, d.rows),
    fields: ((d.schema && d.schema.fields) || []).map(f => ({ name: f.name, type: f.type })),
    totalRows: Number(d.totalRows || 0),
    totalBytesProcessed: Number(d.totalBytesProcessed || 0),
    cacheHit: Boolean(d.cacheHit),
    jobComplete: d.jobComplete !== false,
    jobId: (d.jobReference && d.jobReference.jobId) || null,
    projectId: creds.projectId,
    location: payload.location,
  }
  await logBigQueryUsage({
    job_id: out.jobId, project_id: out.projectId, location: out.location,
    mode: opts.mode || null, dashboard_id: opts.dashboardId || null, user_email: opts.userEmail || null,
    total_bytes_processed: out.totalBytesProcessed, total_rows: out.totalRows, cache_hit: out.cacheHit,
    latency_ms: Date.now() - t0,
  })
  return out
}

// Lists datasets the authorising account can see in the billing project. This
// is the cheapest possible proof-of-life: metadata only, zero bytes scanned.
export async function bigQueryDatasets() {
  const creds = bigQueryCreds()
  const token = await bigQueryAccessToken(creds)
  const url = BQ_HOST + '/projects/' + encodeURIComponent(creds.projectId) + '/datasets?maxResults=200'
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) {
    const e = (d && d.error) || {}
    throw new Error('BigQuery: ' + (e.message || ('HTTP ' + r.status)))
  }
  return {
    projectId: creds.projectId,
    location: creds.location,
    datasets: (d.datasets || []).map(x => (x.datasetReference && x.datasetReference.datasetId) || x.id).filter(Boolean),
  }
}
