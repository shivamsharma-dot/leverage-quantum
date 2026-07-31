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
const FORBIDDEN = /^\s*(INSERT|UPDATE|DELETE|MERGE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|CALL|EXPORT)\b/i

export function assertReadOnly(sql) {
  const s = String(sql || '').trim()
  if (!s) throw new Error('Empty query.')
  if (FORBIDDEN.test(s)) throw new Error('Only read-only SELECT/WITH queries are allowed.')
  if (!/^\s*(SELECT|WITH|\()/i.test(s)) throw new Error('Query must start with SELECT or WITH.')
  return s
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
  if (opts.maxBytes) payload.maximumBytesBilled = String(opts.maxBytes)
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
  return {
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
