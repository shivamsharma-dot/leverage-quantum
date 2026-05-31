export default async function handler(req, res) {
  const { url } = req.query
  if (!url) return res.status(400).send('Missing url param')

  // Only allow Meta/Facebook CDN domains
  const allowed = ['fbcdn.net', 'facebook.com', 'fb.com']
  try {
    const parsed = new URL(decodeURIComponent(url))
    if (!allowed.some(d => parsed.hostname.endsWith(d))) {
      return res.status(403).send('Domain not allowed')
    }
  } catch {
    return res.status(400).send('Invalid url')
  }

  try {
    const imgRes = await fetch(decodeURIComponent(url), {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://www.facebook.com/'
      }
    })
    if (!imgRes.ok) return res.status(imgRes.status).send('Upstream error')
    const contentType = imgRes.headers.get('content-type') || 'image/jpeg'
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=86400')
    const buf = await imgRes.arrayBuffer()
    res.send(Buffer.from(buf))
  } catch (e) {
    res.status(500).send('Proxy error: ' + e.message)
  }
}
