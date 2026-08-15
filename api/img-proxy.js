// Creative thumbnails on the Meta Ads page are fetched through here because
// fbcdn refuses hotlinking without a facebook.com Referer. That makes this an
// outbound fetcher, so it needs the same two guards any outbound fetcher needs:
// only signed-in callers, and a host allowlist that actually pins the host.
const ALLOWED_HOSTS = ['fbcdn.net', 'facebook.com', 'fb.com']

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

  try {
    const imgRes = await fetch(decoded, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.facebook.com/',
        'sec-fetch-dest': 'image',
        'sec-fetch-mode': 'no-cors',
        'sec-fetch-site': 'cross-site',
      },
      redirect: 'follow'
    })
    if (!imgRes.ok) return res.status(imgRes.status).send('Upstream ' + imgRes.status)
    const contentType = imgRes.headers.get('content-type') || 'image/jpeg'
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=3600')
    res.setHeader('Access-Control-Allow-Origin', '*')
    const buf = await imgRes.arrayBuffer()
    res.send(Buffer.from(buf))
  } catch (e) {
    res.status(500).send('Proxy error: ' + e.message)
  }
}
