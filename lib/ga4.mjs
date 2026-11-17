// Google Analytics 4 Data API helper.
//
// Service-account JWT auth (google-auth-library), same pattern as
// api/export-to-sheets.mjs's Sheets export -- read-only, single property.
//
// Credentials live ONLY in Vercel env -- THE REPO IS PUBLIC, never inline them:
//   GA4_CLIENT_EMAIL / GA4_PRIVATE_KEY / GA4_PROPERTY_ID
//
// Status as of 2026-09-01: LIVE. Nishant Bhatia granted the service account
// (quantum-ga4-reader@leverage-quantum-498506.iam.gserviceaccount.com) Viewer
// access on the GA4 property -- confirmed via a real API call, real non-zero
// data across 15 channels for August 2026, not just taken on his word (see the
// organic-social-analytics-buildout memory for why that check matters here).

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

// Date-ranged organic-search vs total unique website users, PLUS the full
// channel breakdown and conversions -- since/until are 'YYYY-MM-DD'.
// "Organic website users" = GA4's Organic Search channel specifically
// (sessionDefaultChannelGroup = 'Organic Search') -- a deliberate decision,
// not organic social or all-free-traffic combined (see the
// organic-social-analytics-buildout memory).
//
// Conversions here is GA4's own 'conversions' metric (renamed "key events" in
// the GA4 UI as of 2026, API metric name unchanged) -- whatever events are
// marked as a key event on this property. If none are marked, GA4 returns a
// real 0 for every row, not an error; that's a property-configuration fact,
// not a fetch failure, and the UI should say so rather than implying broken.
export async function fetchGA4WebsiteUsers(creds, since, until) {
  const token = await ga4AccessToken(creds)
  const d = await runReport(token, creds.propertyId, {
    dateRanges: [{ startDate: since, endDate: until }],
    dimensions: [{ name: 'sessionDefaultChannelGroup' }],
    metrics: [{ name: 'totalUsers' }, { name: 'conversions' }, { name: 'engagementRate' }],
  })
  const rows = d.rows || []
  let organicUsers = 0
  let totalUsers = 0
  let conversions = 0
  let organicConversions = 0
  const byChannel = []
  for (const row of rows) {
    const channel = row.dimensionValues?.[0]?.value || ''
    const users = Number(row.metricValues?.[0]?.value || 0)
    const channelConversions = Number(row.metricValues?.[1]?.value || 0)
    const engagementRate = Number(row.metricValues?.[2]?.value || 0)
    totalUsers += users
    conversions += channelConversions
    if (channel === 'Organic Search') { organicUsers += users; organicConversions += channelConversions }
    byChannel.push({ channel, users, conversions: channelConversions, engagementRate })
  }
  byChannel.sort((a, b) => b.users - a.users)
  return {
    since,
    until,
    organicUsers,
    totalUsers,
    organicPct: totalUsers > 0 ? (organicUsers / totalUsers) * 100 : 0,
    conversions,
    organicConversions,
    // A plain ratio, deliberately NOT styled as a bounded percentage -- GA4's
    // 'conversions' metric counts EVENT occurrences, not unique converting
    // users, so one user can trigger it more than once in the window. A
    // real live check on this property showed 56,464 conversions against
    // 28,405 total users -- a genuine >1 ratio, not a bug -- so "conversions
    // per user" (a number that can exceed 1) is the honest framing; calling
    // it a "rate" and formatting it with a % sign would read as broken the
    // first time this property has a busy day.
    conversionsPerUser: totalUsers > 0 ? conversions / totalUsers : 0,
    byChannel,
  }
}
