// X (Twitter) API v2 helper.
//
// Credentials live ONLY in Vercel env -- THE REPO IS PUBLIC, never inline them:
//   X_BEARER_TOKEN (app-only auth -- covers public-metrics lookups)
//   X_CONSUMER_KEY / X_CONSUMER_SECRET / X_ACCESS_TOKEN / X_ACCESS_TOKEN_SECRET
//   (OAuth 1.0a user-context -- needed for anything scoped to "me"/own-tweet
//   organic metrics, not yet used here -- first pass is just the bearer-token
//   public-metrics profile lookup, both to get real followers/tweet-count data
//   and to get a real, empirical answer on whether the account's $0 pay-per-use
//   balance blocks read calls at all.)

const API_BASE = 'https://api.twitter.com/2'

export function xCreds() {
  return {
    bearerToken: process.env.X_BEARER_TOKEN || '',
    consumerKey: process.env.X_CONSUMER_KEY || '',
    consumerSecret: process.env.X_CONSUMER_SECRET || '',
    accessToken: process.env.X_ACCESS_TOKEN || '',
    accessTokenSecret: process.env.X_ACCESS_TOKEN_SECRET || '',
  }
}

export function xConfigured(c = xCreds()) {
  return Boolean(c.bearerToken)
}

// Public profile metrics for a given handle (no "@"). Works with app-only auth.
export async function fetchXProfile(creds, username) {
  const url = `${API_BASE}/users/by/username/${encodeURIComponent(username)}?user.fields=public_metrics,name,description`
  const r = await fetch(url, { headers: { Authorization: `Bearer ${creds.bearerToken}` } })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error('X API error: ' + JSON.stringify(d.errors || d.detail || d))
  const u = d.data
  if (!u) throw new Error('No user found for @' + username)
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    followersCount: Number(u.public_metrics?.followers_count || 0),
    followingCount: Number(u.public_metrics?.following_count || 0),
    tweetCount: Number(u.public_metrics?.tweet_count || 0),
    listedCount: Number(u.public_metrics?.listed_count || 0),
  }
}
