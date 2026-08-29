// YouTube Data API v3 + YouTube Analytics API helper.
//
// Same refresh-token-derived-access-token pattern as lib/bigquery.mjs -- the
// OAuth client is the same one already used for Google Ads/BigQuery (Internal
// user type on project leverage-quantum-498506, so no 7-day test-token expiry),
// duplicated under its own YOUTUBE_* env var names so this integration doesn't
// depend on the Google Ads naming.
//
// Credentials live ONLY in Vercel env -- THE REPO IS PUBLIC, never inline them:
//   YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET / YOUTUBE_REFRESH_TOKEN / YOUTUBE_CHANNEL_ID
//
// No native "organic" field exists on YouTube Analytics -- organic views/watch
// time are computed as total minus whatever the `ADVERTISING` traffic-source
// bucket reports, via a dimensions=insightTrafficSourceType breakdown.

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const DATA_API = 'https://www.googleapis.com/youtube/v3'
const ANALYTICS_API = 'https://youtubeanalytics.googleapis.com/v2/reports'

export function youtubeCreds() {
  return {
    clientId: process.env.YOUTUBE_CLIENT_ID || '',
    clientSecret: process.env.YOUTUBE_CLIENT_SECRET || '',
    refreshToken: process.env.YOUTUBE_REFRESH_TOKEN || '',
    channelId: process.env.YOUTUBE_CHANNEL_ID || '',
  }
}

export function youtubeConfigured(c = youtubeCreds()) {
  return Boolean(c.clientId && c.clientSecret && c.refreshToken && c.channelId)
}

// Access tokens last ~1h. Cache in module scope so a warm lambda reuses one
// token instead of burning a refresh round-trip on every single invocation.
let _tok = { value: null, exp: 0 }

export async function youtubeAccessToken(creds = youtubeCreds()) {
  if (_tok.value && Date.now() < _tok.exp) return _tok.value
  if (!creds.clientId || !creds.clientSecret || !creds.refreshToken) {
    throw new Error('YouTube is not configured -- set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET and YOUTUBE_REFRESH_TOKEN in Vercel env.')
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
    throw new Error('YouTube token refresh failed: ' + why)
  }
  const ttl = Math.max(60, (Number(d.expires_in) || 3600) - 120)
  _tok = { value: d.access_token, exp: Date.now() + ttl * 1000 }
  return _tok.value
}

// Channel-level snapshot: subscriber count, lifetime view count, video count.
// (No date range -- these are running totals YouTube maintains itself.)
export async function fetchYoutubeChannelStats(creds = youtubeCreds()) {
  const token = await youtubeAccessToken(creds)
  const url = `${DATA_API}/channels?part=snippet,statistics&id=${encodeURIComponent(creds.channelId)}`
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error('YouTube Data API error: ' + (d.error?.message || r.status))
  const item = (d.items || [])[0]
  if (!item) throw new Error('No channel found for id ' + creds.channelId)
  return {
    channelId: creds.channelId,
    title: item.snippet?.title || '',
    subscriberCount: Number(item.statistics?.subscriberCount || 0),
    viewCount: Number(item.statistics?.viewCount || 0),
    videoCount: Number(item.statistics?.videoCount || 0),
    hiddenSubscriberCount: Boolean(item.statistics?.hiddenSubscriberCount),
  }
}

async function analyticsReport(token, params) {
  const url = `${ANALYTICS_API}?${new URLSearchParams(params).toString()}`
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error('YouTube Analytics API error: ' + (d.error?.message || r.status))
  return d
}

// Date-ranged views/watch-time for the whole channel, plus an organic/paid
// split derived from a separate insightTrafficSourceType breakdown for the
// SAME window. since/until are 'YYYY-MM-DD'.
export async function fetchYoutubeAnalyticsRange(creds, since, until) {
  const token = await youtubeAccessToken(creds)

  const totals = await analyticsReport(token, {
    ids: 'channel==MINE',
    startDate: since,
    endDate: until,
    metrics: 'views,estimatedMinutesWatched,averageViewDuration,likes,comments,shares',
  })
  const totalsRow = (totals.rows || [])[0] || []
  const colIndex = (name) => (totals.columnHeaders || []).findIndex(h => h.name === name)
  const totalViews = Number(totalsRow[colIndex('views')] || 0)
  const totalMinutes = Number(totalsRow[colIndex('estimatedMinutesWatched')] || 0)
  const avgViewDurationSec = Number(totalsRow[colIndex('averageViewDuration')] || 0)
  const likes = Number(totalsRow[colIndex('likes')] || 0)
  const comments = Number(totalsRow[colIndex('comments')] || 0)
  const shares = Number(totalsRow[colIndex('shares')] || 0)

  const bySource = await analyticsReport(token, {
    ids: 'channel==MINE',
    startDate: since,
    endDate: until,
    metrics: 'views,estimatedMinutesWatched',
    dimensions: 'insightTrafficSourceType',
  })
  const srcViewsIdx = (bySource.columnHeaders || []).findIndex(h => h.name === 'views')
  const srcMinutesIdx = (bySource.columnHeaders || []).findIndex(h => h.name === 'estimatedMinutesWatched')
  const srcTypeIdx = (bySource.columnHeaders || []).findIndex(h => h.name === 'insightTrafficSourceType')
  let advertisingViews = 0, advertisingMinutes = 0
  for (const row of (bySource.rows || [])) {
    if (row[srcTypeIdx] === 'ADVERTISING') {
      advertisingViews += Number(row[srcViewsIdx] || 0)
      advertisingMinutes += Number(row[srcMinutesIdx] || 0)
    }
  }
  const organicViews = Math.max(0, totalViews - advertisingViews)
  const organicMinutes = Math.max(0, totalMinutes - advertisingMinutes)

  return {
    since, until,
    totalViews, totalMinutesWatched: totalMinutes, avgViewDurationSec,
    likes, comments, shares,
    advertisingViews, organicViews,
    advertisingMinutesWatched: advertisingMinutes, organicMinutesWatched: organicMinutes,
    engagementRate: totalViews > 0 ? (likes + comments + shares) / totalViews : 0,
    trafficSourceBreakdown: (bySource.rows || []).map(row => ({
      type: row[srcTypeIdx],
      views: Number(row[srcViewsIdx] || 0),
      minutesWatched: Number(row[srcMinutesIdx] || 0),
    })),
  }
}
