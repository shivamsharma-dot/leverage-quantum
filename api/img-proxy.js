// Creative thumbnails on the Meta Ads page are fetched through here because
// fbcdn refuses hotlinking without a facebook.com Referer. That makes this an
// outbound fetcher, so it needs the same two guards any outbound fetcher needs:
// only signed-in callers, and a host allowlist that actually pins the host.
const ALLOWED_HOSTS = ['fbcdn.net', 'facebook.com', 'fb.com']

// Meta's adimages URLs point at hyper-regional edge hostnames (e.g.
// scontent.fdel93-1.fna.fbcdn.net -- a specific Delhi POP). Confirmed live via
// `dig`: that class of host has an AAAA (IPv6) record ONLY, no A record at
// all -- and Vercel's serverless runtime has no outbound IPv6 route, which is
// exactly what surfaces as ENOTFOUND (not a resolver misconfiguration --
// there's no IPv4 address to resolve to, and no route to the IPv6 one).
// A prior fix here tried dns.setServers() (no effect: that only patches
// dns.resolve*(), not the dns.lookup() fetch() actually uses) and then a
// manual resolve4()-and-connect-by-IP (also no effect, for the same "no A
// record" reason). Confirmed live that these signed adimages URLs do NOT
// require the facebook.com Referer this proxy spoofs for other fbcdn URLs
// (a plain no-referrer fetch succeeds) -- so on the narrow, confirmed case of
// a DNS-shaped failure, this falls back to a public dual-stack image proxy
// (images.weserv.nl) that has real IPv6 egress. This only ever runs for
// hosts Vercel's own network can't reach at all; everything else stays
// entirely first-party.
function weservFallbackUrl(urlStr) {
  const bare = urlStr.replace(/^https?:\/\//, '')
  return 'https://images.weserv.nl/?url=' + encodeURIComponent(bare)
}

// `hostname.endsWith('fb.com')` also matches "evilfb.com", and
// `.endsWith('facebook.com')` also matches "notfacebook.com" -- there is no dot
// boundary, so any attacker-registered domain ending in one of these strings was
// accepted and proxied. Match the apex exactly, or a real dot-delimited subdomain
// of it, and nothing else.
function hostAllowed(hostname) {
  const h = String(hostname || '').toLowerCase()
  return ALLOWED_HOSTS.some(d => h === d || h.endsWith('.' + d))
}

export default async function handler(req, res) {
  // Previously the only endpoint in the codebase with no auth at all, which made
  // it a free anonymous proxy on this domain for anyone who found it. Same-origin
  // <img src> loads and fetches both send the session cookie, so requiring one
  // costs the real callers nothing.
  const { getSessionUser } = await import('../lib/auth.mjs')
  if (!getSessionUser(req)) return res.status(401).send('Not signed in')

  const { url } = req.query
  if (!url) return res.status(400).send('Missing url param')

  let decoded
  try {
    decoded = decodeURIComponent(url)
    const parsed = new URL(decoded)
    if (parsed.protocol !== 'https:') return res.status(400).send('Only https is allowed')
    if (!hostAllowed(parsed.hostname)) {
      return res.status(403).send('Domain not allowed')
    }
  } catch {
    return res.status(400).send('Invalid url')
  }

  const upstreamHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.facebook.com/',
    'sec-fetch-dest': 'image',
    'sec-fetch-mode': 'no-cors',
    'sec-fetch-site': 'cross-site',
  }

  const viaFetch = async (target, headers) => {
    const r = await fetch(target, { headers, redirect: 'follow', signal: AbortSignal.timeout(15000) })
    return { statusCode: r.status, headers: { 'content-type': r.headers.get('content-type') }, buffer: Buffer.from(await r.arrayBuffer()) }
  }

  try {
    let result
    // Try direct first (fast path, works for most fbcdn hosts, stays fully
    // first-party) -- only fall back to the public proxy on a DNS-shaped
    // failure, which is specifically the IPv6-only-host case above.
    try {
      result = await viaFetch(decoded, upstreamHeaders)
    } catch (e) {
      const isDnsFailure = e && ((e.cause && e.cause.code === 'ENOTFOUND') || /ENOTFOUND/.test(e.message || ''))
      if (!isDnsFailure) throw e
      result = await viaFetch(weservFallbackUrl(decoded), { 'User-Agent': upstreamHeaders['User-Agent'] })
    }
    if (result.statusCode < 200 || result.statusCode >= 300) {
      return res.status(result.statusCode).send('Upstream ' + result.statusCode)
    }
    res.setHeader('Content-Type', result.headers['content-type'] || 'image/jpeg')
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=3600')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.send(result.buffer)
  } catch (e) {
    const cause = e && e.cause ? (e.cause.code || e.cause.message || String(e.cause)) : null
    res.status(502).send('Proxy error: ' + e.message + (cause ? ' (' + cause + ')' : ''))
  }
}
