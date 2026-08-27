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

// Video downloads have no server-side path at all -- confirmed exhaustively:
// the Marketing API's video node ((#10) no permission -- these ads aren't
// Page-owned, and this Business Manager has zero Pages attached, so no Page
// token can ever unlock it either) and Meta's own Ad Library API (its stated
// scope is political/social-issue ads worldwide, or ANY ad only for UK/EU --
// India-targeted commercial ads are excluded by design, not by a fixable
// permission -- confirmed straight off developers.facebook.com/ads/library/api,
// which itself points away from the API and at the public Ad Library page for
// exactly this case). The one thing that does work, confirmed live and
// matching how every commercial "ad downloader" tool in this space actually
// operates: Meta's public Ad Library page (facebook.com/ads/library) embeds a
// real, direct .mp4 URL in every video ad's own <video> tag -- no login, no
// API, no permission wall. Reading that DOM node requires a real, cookied,
// JS-executing browser tab, which a Vercel serverless function fundamentally
// cannot be (a plain server-side fetch of the same page gets a 403 from
// Facebook's bot detection, confirmed live). So this ships as a bookmarklet:
// real code, runs inside the admin's own already-logged-in Ad Library tab,
// installable directly from this page.
function adVideoDownloaderPanel() {
  if (!location.hostname.includes('facebook.com') || !location.pathname.includes('/ads/library')) {
    alert('Open this on facebook.com/ads/library first, then click the bookmarklet.')
    return
  }
  const existing = document.getElementById('__lqAdVidPanel')
  if (existing) existing.remove()
  const panel = document.createElement('div')
  panel.id = '__lqAdVidPanel'
  panel.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;background:#fff;border:1px solid #E5E7EB;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.18);padding:14px 16px;font:13px -apple-system,Segoe UI,Roboto,sans-serif;width:280px;color:#0F172A;'
  panel.innerHTML = '<div style="font-weight:700;margin-bottom:8px;">Leverage Quantum &mdash; Ad Video Downloader</div><div id="__lqAdVidStatus" style="color:#475569;margin-bottom:10px;">Scanning page for videos&hellip;</div><button id="__lqAdVidGo" style="width:100%;padding:8px 10px;border-radius:8px;border:none;background:#1F3C84;color:#fff;font-weight:700;cursor:pointer;">Download all visible videos</button><div style="margin-top:8px;font-size:11px;color:#94A3B8;">Downloads the videos currently rendered on screen. Scroll to load more, then run again.</div>'
  document.body.appendChild(panel)
  function findVideoCards() {
    const videos = Array.from(document.querySelectorAll('video')).filter(v => v.currentSrc)
    return videos.map((v, i) => {
      let card = v
      for (let hop = 0; hop < 8 && card; hop++) card = card.parentElement
      let label = 'ad-' + (i + 1)
      const libIdMatch = card ? (card.textContent || '').match(/Library ID:\s*(\d+)/) : null
      if (libIdMatch) label = libIdMatch[1]
      return { url: v.currentSrc, label }
    })
  }
  function sanitize(name) { return String(name).replace(/[\\/:*?"<>|]/g, '_').slice(0, 120) }
  async function downloadOne(item, idx, total) {
    const status = document.getElementById('__lqAdVidStatus')
    if (status) status.textContent = 'Downloading ' + (idx + 1) + ' of ' + total + '…'
    const res = await fetch(item.url)
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'leverage-edu-ad-' + sanitize(item.label) + '.mp4'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 30000)
  }
  document.getElementById('__lqAdVidGo').onclick = async function () {
    const items = findVideoCards()
    const status = document.getElementById('__lqAdVidStatus')
    if (!items.length) { status.textContent = 'No videos found on screen. Scroll down to load some, then try again.'; return }
    status.textContent = 'Found ' + items.length + ' video(s). Starting…'
    for (let i = 0; i < items.length; i++) {
      try { await downloadOne(items[i], i, items.length) } catch (e) { console.error('Video download failed', items[i], e) }
      await new Promise(r => setTimeout(r, 700))
    }
    status.textContent = 'Done — ' + items.length + ' video(s) sent to Downloads.'
  }
}

// Bookmarklets can only be plain top-level statements, not a named function
// declaration -- wrapping in an IIFE and URI-encoding is the standard form.
const AD_VIDEO_BOOKMARKLET = 'javascript:' + encodeURIComponent('(' + adVideoDownloaderPanel.toString() + ')();')

const AD_LIBRARY_VIDEOS_URL = 'https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&media_type=video&q=' + encodeURIComponent('Leverage Edu')

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
          <Card title="Search by ad name" sub="Matches across every ad account this token can see. Images download directly below; videos go through the Ad Library tool further down." noPad={false}>
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

          <div style={{ marginTop: 14 }}>
            <Card
              title="Video downloads"
              sub="No API can hand back a video file for these ads -- confirmed against both the Marketing API and Meta's own Ad Library API (see the note below). The one real mechanism, used by every commercial ad-downloader tool, is the public Ad Library page itself."
              noPad={false}
            >
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div style={{ flex: '1 1 280px' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, marginBottom: 6 }}>1. Install once</div>
                  <a href={AD_VIDEO_BOOKMARKLET} onClick={e => e.preventDefault()} draggable
                    style={{ display: 'inline-block', padding: '9px 16px', borderRadius: 9, background: C.navy, color: '#fff', fontWeight: 700, fontSize: 13, textDecoration: 'none', cursor: 'grab' }}>
                    📥 Download Ad Videos
                  </a>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>Drag this button to your bookmarks bar (Cmd/Ctrl+Shift+B to show it).</div>
                </div>
                <div style={{ flex: '1 1 280px' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, marginBottom: 6 }}>2. Run it on the Ad Library</div>
                  <a href={AD_LIBRARY_VIDEOS_URL} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="secondary">Open Leverage Edu video ads →</Button>
                  </a>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>Click the bookmark there, then "Download all visible videos." First time only, click <strong>Allow</strong> on Chrome's multi-download prompt.</div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--card-border)' }}>
                Why this can't be a normal button on this page: the video file only exists inside the Ad Library's own rendered page (a real, logged-in browser tab), not behind any API this app can call server-side -- a plain server request to that same page is blocked with a 403 by Facebook's own bot detection. Filenames use the ad's public Library ID so you can match a download back to its card.
              </div>
            </Card>
          </div>

          {results !== null && (
            <div style={{ marginTop: 14 }}>
              <Card
                title={`Results (${results.length})`}
                sub={`${imageCount} image ad${imageCount === 1 ? '' : 's'} (${fullResCount} full-res) · ${videoCount} video ad${videoCount === 1 ? '' : 's'} -- use the Video downloads section above`}
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
                          <div style={{ fontSize: 12, color: C.muted, textAlign: 'center', padding: 12 }}>{item.isVideo ? 'Video -- see the Video downloads section above' : 'No preview available'}</div>
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
                        ) : item.isVideo ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <a href={AD_LIBRARY_VIDEOS_URL} target="_blank" rel="noreferrer">
                              <Button size="sm" style={{ width: '100%' }}>Find & download video ↑</Button>
                            </a>
                            <a href={item.adsManagerUrl} target="_blank" rel="noreferrer">
                              <Button size="sm" variant="secondary" style={{ width: '100%' }}>Open in Ads Manager</Button>
                            </a>
                          </div>
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
