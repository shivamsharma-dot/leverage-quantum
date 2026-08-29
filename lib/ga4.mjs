// Google Analytics 4 Data API helper.
//
// Service-account JWT auth (google-auth-library), same pattern as
// api/export-to-sheets.mjs's Sheets export -- read-only, single property.
//
// Credentials live ONLY in Vercel env -- THE REPO IS PUBLIC, never inline them:
//   GA4_CLIENT_EMAIL / GA4_PRIVATE_KEY / GA4_PROPERTY_ID
//
// Status as of 2026-08: BLOCKED. The service account
// (quantum-ga4-reader@leverage-quantum-498506.iam.gserviceaccount.com) has
// valid credentials but has never been granted access inside GA4 itself
// (Admin -> Property access management) -- every call below will 403
// PERMISSION_DENIED until that's granted. Handed off to Nishant Bhatia; see
// the organic-social-analytics-buildout memory for the exact handoff steps.
// Written now so the page just starts working the moment access is granted --
// no further code change needed.

import { JWT } from 'google-auth-library'

const DATA_API = 'https://analyticsdata.googleapis.com/v1beta'

export function ga4Creds() {
  return {
    clientEmail: process.env.GA4_CLIENT_EMAIL || '',
    privateKey: (process.env.GA4_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    propertyId: process.env.GA4_PROPERTY_ID || '',
  }
}

export function ga4Configured(c = ga4Creds()) {
  return Boolean(c.clientEmail && c.privateKey && c.propertyId)
}

// Access tokens last ~1h -- cache in module scope so a warm lambda reuses one
// instead of re-signing a JWT on every invocation (same pattern as
// lib/youtube.mjs's _tok cache).
let _tok = { value: null, exp: 0 }

async function ga4AccessToken(creds = ga4Creds()) {
  if (_tok.value && Date.now() < _tok.exp) return _tok.value
  if (!creds.clientEmail || !creds.privateKey) {
    throw new Error('GA4 is not configured -- set GA4_CLIENT_EMAIL and GA4_PRIVATE_KEY in Vercel env.')
  }
  const auth = new JWT({
    email: creds.clientEmail,
    key: creds.privateKey,
    scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
  })
  const { access_token, expiry_date } = await auth.authorize()
  _tok = { value: access_token, exp: expiry_date ? expiry_date - 60000 : Date.now() + 3300000 }
  return _tok.value
}

async function runReport(token, propertyId, body) {
  const url = `${DATA_API}/properties/${propertyId}:runReport`
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error('GA4 Data API error: ' + (d.error?.message || r.status))
  return d
}

// Date-ranged organic-search vs total unique website users. since/until are
// 'YYYY-MM-DD'. "Organic website users" = GA4's Organic Search channel
// specifically (sessionDefaultChannelGroup = 'Organic Search') -- a deliberate
// decision, not organic social or all-free-traffic combined (see the
// organic-social-analytics-buildout memory).
export async function fetchGA4WebsiteUsers(creds, since, until) {
  const token = await ga4AccessToken(creds)
  const d = await runReport(token, creds.propertyId, {
    dateRanges: [{ startDate: since, endDate: until }],
    dimensions: [{ name: 'sessionDefaultChannelGroup' }],
    metrics: [{ name: 'totalUsers' }],
  })
  const rows = d.rows || []
  let organicUsers = 0
  let totalUsers = 0
  const byChannel = []
  for (const row of rows) {
    const channel = row.dimensionValues?.[0]?.value || ''
    const users = Number(row.metricValues?.[0]?.value || 0)
    totalUsers += users
    if (channel === 'Organic Search') organicUsers += users
    byChannel.push({ channel, users })
  }
  return {
    since,
    until,
    organicUsers,
    totalUsers,
    organicPct: totalUsers > 0 ? (organicUsers / totalUsers) * 100 : 0,
    byChannel,
  }
}
