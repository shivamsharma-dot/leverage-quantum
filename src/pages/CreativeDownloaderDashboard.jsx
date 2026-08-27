import { useState, useRef } from 'react'
import Sidebar from '../components/Sidebar'
import Button from '../components/Button'
import { Card, C, FONT } from '../ui/dashboardKit'
import { toast } from '../components/ToastHost'

// Same fbcdn-hotlink workaround already used everywhere else creative
// thumbnails are shown -- also doubles as the download path below, since a
// direct fetch() from Quantum's own origin to *.fbcdn.net is blocked by CORS
// (img-proxy already sets Access-Control-Allow-Origin: '*' and the Referer
// fbcdn actually wants), so no new backend code is needed for images at all.
const proxyImg = url => (url ? `/api/img-proxy?url=${encodeURIComponent(url)}` : null)

// Below this, on either axis, something is always a UI icon or a blank
// placeholder frame -- never a real creative. Matches the same floor used
// when this was done by hand.
const MIN_DIM = 300

async function graphGet(path, token, params = {}, retries = 4) {
  const qs = new URLSearchParams({ access_token: token, ...params }).toString()
  const res = await fetch(`https://graph.facebook.com/v19.0/${path}?${qs}`)
  const d = await res.json()
  if (d.error) {
    const msg = d.error.message || ''
    const RATE_CODES = [1, 4, 17, 32, 613]
    const rateLimited = RATE_CODES.includes(d.error.code) || msg.includes('reduce') || msg.includes('too large') || msg.includes('too many')
    if (retries > 0 && rateLimited) {
      const attempt = 4 - retries
      const wait = Math.min(1500 * Math.pow(2, attempt), 20000) + Math.floor(Math.random() * 700)
      await new Promise(r => setTimeout(r, wait))
      return graphGet(path, token, params, retries - 1)
    }
    throw new Error(msg)
  }
  return d
}

async function loadTokenFromSupabase() {
  try {
    const res = await fetch('/api/meta-token', { credentials: 'include' })
    if (!res.ok) return null
    const data = await res.json()
    return data?.token || null
  } catch { return null }
}

// One canonical hash -> full-res URL lookup per ad account, built once per
// search rather than once per ad -- adimages is a real, documented, working
// endpoint (verified live against the account) that returns the actual
// uploaded asset at full resolution, keyed by the same image_hash every ad's
// creative already carries. This replaces the old technique of scraping the
// Ads Manager preview modal and picking the largest <img> on screen -- no
// browser automation needed for images at all.
async function buildImageIndex(acctId, token) {
  const idx = {}
  let after = null
  for (let page = 0; page < 10; page++) {
    const params = { fields: 'hash,url,width,height', limit: 200 }
    if (after) params.after = after
    const r = await graphGet(`${acctId}/adimages`, token, params)
    for (const img of r.data || []) {
      if ((img.width || 0) >= MIN_DIM || (img.height || 0) >= MIN_DIM) idx[img.hash] = img
    }
    after = r.paging?.cursors?.after
    if (!after || !(r.data || []).length) break
  }
  return idx
}

async function downloadBlob(url, filename) {
  const resp = await fetch(url, { cache: 'no-store' })
  if (!resp.ok) throw new Error('HTTP ' + resp.status)
  const blob = await resp.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 10000)
}

function sanitizeFilename(name) {
  return String(name || 'creative').replace(/[\\/:*?"<>|]/g, '_').slice(0, 180)
}

export default function CreativeDownloaderDashboard() {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [results, setResults] = useState(null)
  const [error, setError] = useState('')
  const busyRef = useRef(false)

  async function search() {
    const name = query.trim()
    if (!name) return
    setBusy(true); busyRef.current = true
    setError(''); setResults(null); setProgress('Getting Meta access token…')
    try {
      const token = await loadTokenFromSupabase()
      if (!token) throw new Error('No Meta access token on file -- connect Meta Ads first from Settings > Data.')

      setProgress('Listing ad accounts…')
      const acctRes = await graphGet('me/adaccounts', token, { fields: 'id,name,account_status', limit: 50 })
      const accounts = acctRes.data || []

      setProgress(`Searching ${accounts.length} ad accounts for "${name}"…`)
      const filt = encodeURIComponent(JSON.stringify([{ field: 'name', operator: 'CONTAIN', value: name }]))
      const perAccount = await Promise.all(accounts.map(async acct => {
        try {
          const r = await graphGet(`${acct.id}/ads`, token, {
            // Advantage+ / Dynamic Creative ads carry no single creative.image_hash at
            // all -- their images live under asset_feed_spec.images[].hash instead
            // (confirmed live: GER19 has image_hash=null but 2 real asset_feed images).
            // Both are requested so the resolver below can fall back correctly rather
            // than silently landing on the low-res thumbnail for every such ad.
            fields: 'id,name,status,creative{object_type,image_hash,thumbnail_url,video_id,asset_feed_spec{images}}',
            filtering: decodeURIComponent(filt), limit: 25,
          })
          return (r.data || []).map(ad => ({ ...ad, acctId: acct.id, acctName: acct.name }))
        } catch { return [] }
      }))
      const matched = perAccount.flat()
      if (!matched.length) { setResults([]); return }

      // Build one image-hash index per ad account actually involved, not per ad --
      // an account can hold thousands of images, so this is fetched once and reused.
      setProgress('Resolving full-resolution images…')
      const acctIdsInvolved = [...new Set(matched.map(a => a.acctId))]
      const imageIndexes = {}
      for (const acctId of acctIdsInvolved) {
        imageIndexes[acctId] = await buildImageIndex(acctId, token)
      }

      const resolved = matched.map(ad => {
        const index = imageIndexes[ad.acctId] || {}
        // Ordinary creatives carry one hash at creative.image_hash. Advantage+ /
        // Dynamic Creative ads carry none there at all -- their real images live
        // under asset_feed_spec.images[].hash instead (confirmed live against a
        // real ad: image_hash was null while asset_feed_spec had 2 real hashes).
        // Every candidate hash is tried against the same full-res index; the first
        // one that resolves wins, so this doesn't care which shape a given ad uses.
        const candidateHashes = [
          ad.creative?.image_hash,
          ...((ad.creative?.asset_feed_spec?.images || []).map(i => i.hash)),
        ].filter(Boolean)
        let fromIndex = null
        for (const h of candidateHashes) { if (index[h]) { fromIndex = index[h]; break } }
        const isVideo = ad.creative?.object_type === 'VIDEO' || !!ad.creative?.video_id
        let image = null
        if (fromIndex) {
          image = { url: fromIndex.url, width: fromIndex.width, height: fromIndex.height, source: 'adimages (full-res)' }
        } else if (!isVideo && ad.creative?.thumbnail_url) {
          // Only ever a fallback, and always labelled as one -- Meta's own
          // thumbnail_url is frequently a small placeholder (as low as 64x64),
          // exactly the "cover/thumbnail" this feature exists to NOT hand
          // someone as if it were the real creative.
          image = { url: ad.creative.thumbnail_url, width: null, height: null, source: 'thumbnail_url (low-res fallback)' }
        }
        return {
          id: ad.id, name: ad.name, status: ad.status, acctId: ad.acctId, acctName: ad.acctName,
          isVideo, image,
          adsManagerUrl: `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${ad.acctId.replace('act_', '')}&selected_ad_ids=${ad.id}&nav_source=no_referrer`,
        }
      })
      setResults(resolved)
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setBusy(false); busyRef.current = false; setProgress('')
    }
  }

  async function downloadOne(item) {
    if (!item.image) return
    try {
      await downloadBlob(proxyImg(item.image.url), sanitizeFilename(item.name) + '.jpg')
      toast(`Downloaded ${item.name}`, { type: 'success' })
    } catch (e) {
      toast(`Failed to download ${item.name}: ${e.message}`, { type: 'muted' })
    }
  }

  async function downloadAllImages() {
    const targets = (results || []).filter(r => r.image && r.image.source.includes('full-res'))
    if (!targets.length) { toast('No full-resolution images to download in this result set', { type: 'muted' }); return }
    setBusy(true)
    for (let i = 0; i < targets.length; i++) {
      setProgress(`Downloading ${i + 1} of ${targets.length}…`)
      await downloadOne(targets[i])
      await new Promise(r => setTimeout(r, 300))
    }
    setBusy(false); setProgress('')
  }

  const imageCount = (results || []).filter(r => !r.isVideo).length
  const videoCount = (results || []).filter(r => r.isVideo).length
  const fullResCount = (results || []).filter(r => r.image?.source.includes('full-res')).length

  return (
    <div className="lq-page-shell" style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)', fontFamily: FONT }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ margin: '12px 14px 0', borderRadius: 14, border: '1px solid var(--card-border)', background: 'var(--card)', boxShadow: '0 1px 3px rgba(31,60,132,0.06)', padding: '14px 24px' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Meta Ads</div>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: '2px 0 0', letterSpacing: '-0.4px' }}>Creative Downloader</h1>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px' }}>
          <Card title="Search by ad name" sub="Matches across every ad account this token can see. Video results still need a manual pull -- see the note on each row." noPad={false}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !busy && search()}
                placeholder="e.g. PMX_FB_Ger_NAS_08July2026_Ad2"
                style={{
                  flex: '1 1 360px', minWidth: 240, padding: '9px 13px', fontSize: 13.5, fontFamily: FONT,
                  border: '1px solid var(--card-border)', borderRadius: 9, background: 'var(--bg2)', color: C.text, outline: 'none',
                }}
              />
              <Button onClick={search} disabled={busy || !query.trim()} size="sm">
                {busy ? 'Searching…' : 'Search'}
              </Button>
            </div>
            {busy && progress && <div style={{ marginTop: 10, fontSize: 12.5, color: C.muted }}>{progress}</div>}
            {error && <div style={{ marginTop: 10, fontSize: 12.5, color: C.navy, background: 'var(--navy-tint)', padding: '8px 12px', borderRadius: 8 }}>{error}</div>}
          </Card>

          {results !== null && (
            <div style={{ marginTop: 14 }}>
              <Card
                title={`Results (${results.length})`}
                sub={`${imageCount} image ad${imageCount === 1 ? '' : 's'} (${fullResCount} full-res) · ${videoCount} video ad${videoCount === 1 ? '' : 's'} -- open in Ads Manager to preview & save`}
                action={<Button onClick={downloadAllImages} disabled={busy || fullResCount === 0} size="sm">Download all full-res images ({fullResCount})</Button>}
              >
                {results.length === 0 && <div style={{ fontSize: 13, color: C.muted, padding: '8px 0' }}>No ads matched that name across any account.</div>}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
                  {results.map(item => (
                    <div key={item.id} style={{ border: '1px solid var(--card-border)', borderRadius: 12, overflow: 'hidden', background: 'var(--card)' }}>
                      <div style={{ aspectRatio: '1 / 1', background: 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                        {item.image ? (
                          <img src={proxyImg(item.image.url)} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ fontSize: 12, color: C.muted, textAlign: 'center', padding: 12 }}>{item.isVideo ? 'Video -- preview in Ads Manager' : 'No preview available'}</div>
                        )}
                      </div>
                      <div style={{ padding: '10px 12px' }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, wordBreak: 'break-word', marginBottom: 4 }} title={item.name}>{item.name}</div>
                        <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>{item.acctName} · {item.status}</div>
                        {item.image && (
                          <div style={{ fontSize: 10.5, color: item.image.source.includes('full-res') ? C.green : C.navy, marginBottom: 8 }}>
                            {item.image.source}{item.image.width ? ` · ${item.image.width}×${item.image.height}` : ''}
                          </div>
                        )}
                        {item.image ? (
                          <Button onClick={() => downloadOne(item)} size="sm" style={{ width: '100%' }}>Download image</Button>
                        ) : (
                          <a href={item.adsManagerUrl} target="_blank" rel="noreferrer">
                            <Button size="sm" variant="secondary" style={{ width: '100%' }}>Open in Ads Manager</Button>
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
