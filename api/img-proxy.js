export default async function handler(req, res) {
  const { url } = req.query
  if (!url) return res.status(400).send('Missing url param')

  const allowed = ['fbcdn.net', 'facebook.com', 'fb.com']
  let decoded
  try {
    decoded = decodeURIComponent(url)
    const parsed = new URL(decoded)
    if (!allowed.some(d => parsed.hostname.endsWith(d))) {
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
