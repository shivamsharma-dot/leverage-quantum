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

// Multiple Instagram Business Accounts. Instagram Login (the flow this file
// uses) issues one access token per account -- there's no "list every account
// reachable from this token" call the way Meta Ads' shared ad-account token
// has, since the token itself IS scoped to a single account at the moment
// someone logs into that account's own username/password to generate it. So
// this is a real per-account credential set, not one shared token fanned out.
//
// The original single account (already live, key "leverageedu") keeps reading
// the legacy INSTAGRAM_ACCESS_TOKEN/INSTAGRAM_BUSINESS_ID vars untouched -- no
// migration risk to what already works. Every account after that is one more
// entry in INSTAGRAM_ACCOUNTS_JSON, a Vercel env var holding a JSON array:
//   [{"key":"compassvisas","businessId":"...","accessToken":"..."}, ...]
// appSecret is per-APP not per-account (all these accounts are Testers under
// the same "Leverage Quantum Analytics" Meta App), so an entry only needs its
// own accessToken/businessId; it falls back to the shared INSTAGRAM_APP_SECRET
// unless a specific entry ever needs a different one.
export function instagramAccounts() {
  const accounts = []
  const legacy = instagramCreds()
  if (instagramConfigured(legacy)) accounts.push({ key: 'leverageedu', ...legacy })
  try {
    const extra = JSON.parse(process.env.INSTAGRAM_ACCOUNTS_JSON || '[]')
    if (Array.isArray(extra)) {
      extra.forEach((a, i) => {
        if (a && a.accessToken && a.businessId) {
          accounts.push({
            key: a.key || ('account' + (i + 2)),
            accessToken: a.accessToken,
            businessId: a.businessId,
            appSecret: a.appSecret || legacy.appSecret,
          })
        }
      })
    }
  } catch (e) { /* malformed JSON in the env var -- ignore, legacy account still works */ }
  return accounts
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
  const url = `${GRAPH_HOST}/${API_VERSION}/${creds.businessId}?fields=id,username,name,biography,website,profile_picture_url,followers_count,follows_count,media_count&access_token=${encodeURIComponent(creds.accessToken)}`
  const r = await fetch(url)
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error('Instagram Graph API error: ' + (d.error?.message || r.status))
  return {
    id: d.id,
    username: d.username,
    name: d.name || '',
    biography: d.biography || '',
    website: d.website || '',
    profilePictureUrl: d.profile_picture_url || '',
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
// breakdown is optional -- required by Instagram for the *_demographics and
// online_followers metrics (one dimension per call: age|city|country|gender,
// or the fixed audience_type Instagram itself expects for online_followers).
// Confirmed live: without it these metrics return metadata with no total_value
// at all (silently "empty", not an error) -- so every demographics call MUST
// pass one, or it's a wasted round-trip.
export async function fetchInstagramInsights(creds, metrics, since, until, metricType = 'time_series', breakdown = null) {
  const params = new URLSearchParams({
    metric: metrics,
    period: 'day',
    metric_type: metricType,
    since: String(since),
    until: String(until),
    access_token: creds.accessToken,
  })
  if (breakdown) params.set('breakdown', breakdown)
  const url = `${GRAPH_HOST}/${API_VERSION}/${creds.businessId}/insights?${params.toString()}`
  const r = await fetch(url)
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error('Instagram Insights API error: ' + (d.error?.message || r.status))
  return d
}

// Recent media list -- most-recent-first, NOT date-filtered server-side
// (Instagram's /media edge has no since/until param the way /insights does);
// callers filter by each item's own `timestamp` against the period they want.
// `limit` capped generously (100) rather than paginated -- a business account
// posting more than 100 times inside whatever window a caller cares about
// would be unusual; revisit with cursor pagination if that's ever hit.
export async function fetchInstagramMedia(creds, limit = 100) {
  const params = new URLSearchParams({
    fields: 'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count',
    limit: String(limit),
    access_token: creds.accessToken,
  })
  const url = `${GRAPH_HOST}/${API_VERSION}/${creds.businessId}/media?${params.toString()}`
  const r = await fetch(url)
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error('Instagram Media API error: ' + (d.error?.message || r.status))
  return (d.data || []).map(m => ({
    id: m.id,
    caption: m.caption || '',
    mediaType: m.media_type || '',
    mediaProductType: m.media_product_type || '',
    mediaUrl: m.media_url || '',
    thumbnailUrl: m.thumbnail_url || m.media_url || '',
    permalink: m.permalink || '',
    timestamp: m.timestamp || '',
    likeCount: Number(m.like_count || 0),
    commentsCount: Number(m.comments_count || 0),
  }))
}

// Per-media insights -- a DIFFERENT metric vocabulary than account-level
// insights (no metric_type/period params at all; Instagram infers what's
// valid from the media's own type). `metrics` is a raw pass-through, same
// permissive design as fetchInstagramInsights, since the valid set genuinely
// differs by media_type (IMAGE/CAROUSEL vs VIDEO/REELS) and is best confirmed
// against a real call rather than hardcoded.
export async function fetchInstagramMediaInsights(creds, mediaId, metrics) {
  const params = new URLSearchParams({ metric: metrics, access_token: creds.accessToken })
  const url = `${GRAPH_HOST}/${API_VERSION}/${mediaId}/insights?${params.toString()}`
  const r = await fetch(url)
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error('Instagram Media Insights API error: ' + (d.error?.message || r.status))
  return d
}

// Business Discovery -- public stats on ANOTHER business/creator account (no
// token of theirs needed), via a field-expansion query on your OWN account.
// Not yet confirmed to work under the Instagram-Login flow this file uses
// (vs. the older Facebook-Login connection) -- callers should treat a real
// error here as evidence, not a bug, and check business_discovery is even
// present in the response before trusting it.
export async function fetchInstagramBusinessDiscovery(creds, targetUsername) {
  const fields = `business_discovery.username(${targetUsername}){username,followers_count,media_count,profile_picture_url}`
  const params = new URLSearchParams({ fields, access_token: creds.accessToken })
  const url = `${GRAPH_HOST}/${API_VERSION}/${creds.businessId}?${params.toString()}`
  const r = await fetch(url)
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error('Instagram Business Discovery error: ' + (d.error?.message || r.status))
  return d
}
