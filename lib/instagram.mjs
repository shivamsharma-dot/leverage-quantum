// Instagram Graph API (Instagram Login flow -- graph.instagram.com host) helper.
//
// Deliberately uses its OWN dedicated Meta App ("Leverage Quantum Analytics"),
// isolated from the existing Meta Ads app/token -- adding Instagram scopes to the
// shared Ads app previously broke the shared production Meta token app-wide.
//
// Credentials live ONLY in Vercel env -- THE REPO IS PUBLIC, never inline them:
//   INSTAGRAM_ACCESS_TOKEN / INSTAGRAM_APP_SECRET / INSTAGRAM_BUSINESS_ID
//
// The access token generated via the developer console's "Generate token" tool is
// SHORT-LIVED (~1hr). exchangeForLongLivedToken() upgrades it to a 60-day token;
// refreshLongLivedToken() extends an existing long-lived token by another 60 days
// (must be called before it expires). Neither is called automatically here yet --
// first pass is verifying the whole pipeline works with whatever token is stored.

const GRAPH_HOST = 'https://graph.instagram.com'
const API_VERSION = 'v21.0'

export function instagramCreds() {
  return {
    accessToken: process.env.INSTAGRAM_ACCESS_TOKEN || '',
    appSecret: process.env.INSTAGRAM_APP_SECRET || '',
    businessId: process.env.INSTAGRAM_BUSINESS_ID || '',
  }
}

export function instagramConfigured(c = instagramCreds()) {
  return Boolean(c.accessToken && c.businessId)
}

export async function exchangeForLongLivedToken(creds = instagramCreds()) {
  if (!creds.accessToken || !creds.appSecret) {
    throw new Error('Instagram is not configured -- set INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_APP_SECRET in Vercel env.')
  }
  const url = `${GRAPH_HOST}/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(creds.appSecret)}&access_token=${encodeURIComponent(creds.accessToken)}`
  const r = await fetch(url)
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error('Instagram long-lived token exchange failed: ' + (d.error?.message || r.status))
  return d // { access_token, token_type, expires_in }
}

export async function refreshLongLivedToken(creds = instagramCreds()) {
  if (!creds.accessToken) {
    throw new Error('Instagram is not configured -- set INSTAGRAM_ACCESS_TOKEN in Vercel env.')
  }
  const url = `${GRAPH_HOST}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(creds.accessToken)}`
  const r = await fetch(url)
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error('Instagram token refresh failed: ' + (d.error?.message || r.status))
  return d // { access_token, token_type, expires_in }
}

// Profile-level snapshot: username, followers, media count -- running totals,
// no date range (mirrors fetchYoutubeChannelStats's shape/purpose).
export async function fetchInstagramProfile(creds = instagramCreds()) {
  const url = `${GRAPH_HOST}/${API_VERSION}/${creds.businessId}?fields=id,username,name,followers_count,follows_count,media_count&access_token=${encodeURIComponent(creds.accessToken)}`
  const r = await fetch(url)
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error('Instagram Graph API error: ' + (d.error?.message || r.status))
  return {
    id: d.id,
    username: d.username,
    name: d.name || '',
    followersCount: Number(d.followers_count || 0),
    followsCount: Number(d.follows_count || 0),
    mediaCount: Number(d.media_count || 0),
  }
}

// Date-ranged account insights. metrics is a comma-separated string of metric
// names (e.g. 'reach,accounts_engaged,total_interactions,profile_views') --
// left as a raw pass-through rather than a fixed list since graph.instagram.com's
// supported metric names/breakdowns have changed across API versions and are
// best confirmed against a real call rather than assumed.
export async function fetchInstagramInsights(creds, metrics, since, until) {
  const params = new URLSearchParams({
    metric: metrics,
    period: 'day',
    metric_type: 'time_series',
    since: String(since),
    until: String(until),
    access_token: creds.accessToken,
  })
  const url = `${GRAPH_HOST}/${API_VERSION}/${creds.businessId}/insights?${params.toString()}`
  const r = await fetch(url)
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error('Instagram Insights API error: ' + (d.error?.message || r.status))
  return d
}
