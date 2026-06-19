import React from 'react'
import { toPng } from 'html-to-image'
import { useNavigate, useLocation } from 'react-router-dom'

/*
  SnapshotTool — panel-wide screenshot capture.
  Self-contained floating control rendered from the shared Sidebar so it
  appears on every page. Three modes:
    - Full page      : the entire scrollable dashboard
    - Visible area   : just what is on screen right now (fast)
    - Select region  : drag a box, capture only that crop
  Then preview the result and Download / Copy to clipboard.
  Brand palette only: navy #1F3C84, blue #1C9FD4, cyan #29B9C3, green #4CAE6F.
*/

const FONT = "'Plus Jakarta Sans','Inter',sans-serif"
const NAVY = '#1F3C84'
const BLUE = '#1C9FD4'
const CYAN = '#29B9C3'
const GREEN = '#4CAE6F'
const INK = '#0F1F4B'
const BG = '#F4F6F9'

const PAGE_NAMES = {
  '/': 'Home',
  '/dashboard/mtd': 'MTD',
  '/dashboard/roas': 'ROAS',
  '/dashboard/lead-quality': 'Lead-Quality',
  '/dashboard/channel-mix': 'Channel-Mix',
  '/dashboard/revenue': 'Revenue',
  '/dashboard/lq-ops': 'QL-Ops',
  '/dashboard/referral': 'Referral',
  '/dashboard/whatsapp': 'WhatsApp',
  '/dashboard/meta-ads': 'Meta-Ads',
  '/dashboard/google-ads': 'Google-Ads',
  '/settings': 'Settings',
}

const pageLabel = () => {
  const p = window.location.pathname
  return PAGE_NAMES[p] || (p.split('/').filter(Boolean).pop() || 'panel')
}
const stamp = () => {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`
}
const ignoreFilter = (el) => !(el?.dataset && el.dataset.snapshotIgnore === 'true')

// The full scrollable content region (flex:1 / overflowY:auto), so a full-page
// shot includes everything below the fold. Falls back to the document body.
const getContentRoot = () => {
  const explicit = document.querySelector('[data-snapshot-root]')
  if (explicit) return explicit
  let best = null
  document.querySelectorAll('div').forEach((d) => {
    const cs = getComputedStyle(d)
    if (cs.overflowY !== 'auto' && cs.overflowY !== 'scroll') return
    const r = d.getBoundingClientRect()
    if (r.width < 700) return
    if (d.scrollHeight < window.innerHeight - 40) return
    if (!best || d.scrollHeight > best.scrollHeight) best = d
  })
  return best || document.querySelector('main') || document.body
}

// Capture an element fully (its whole scrollHeight) to a PNG data URL.
async function captureNode(node) {
  return toPng(node, {
    cacheBust: true,
    pixelRatio: 2,
    backgroundColor: BG,
    width: node.scrollWidth,
    height: node.scrollHeight,
    filter: ignoreFilter,
  })
}

// Capture only the current viewport (fast). Renders the content root but clips
// to what is scrolled into view.
async function captureViewport() {
  const root = getContentRoot()
  const r = root.getBoundingClientRect()
  const scrollTop = root.scrollTop || 0
  const scrollLeft = root.scrollLeft || 0
  return toPng(root, {
    cacheBust: true,
    pixelRatio: 2,
    backgroundColor: BG,
    width: Math.min(r.width, root.clientWidth),
    height: Math.min(r.height, window.innerHeight),
    filter: ignoreFilter,
    style: { transform: `translate(${-scrollLeft}px, ${-scrollTop}px)`, transformOrigin: 'top left' },
  })
}

// Crop a region (viewport coordinates) out of a freshly captured viewport image.
function cropDataUrl(dataUrl, rect, srcW, srcH) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      // True pixel scale derived from the captured image itself -> correct at any devicePixelRatio.
      const ratioX = srcW > 0 ? img.naturalWidth / srcW : 2
      const ratioY = srcH > 0 ? img.naturalHeight / srcH : 2
      canvas.width = Math.max(1, Math.round(rect.w * ratioX))
      canvas.height = Math.max(1, Math.round(rect.h * ratioY))
      const ctx = canvas.getContext('2d')
      ctx.drawImage(
        img,
        Math.round(rect.x * ratioX), Math.round(rect.y * ratioY),
        Math.round(rect.w * ratioX), Math.round(rect.h * ratioY),
        0, 0,
        canvas.width, canvas.height,
      )
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = reject
    img.src = dataUrl
  })
}

// Composite a branded footer onto a captured PNG: navy strip with the QUANTUM
// wordmark, the page title and a timestamp. Returns a new PNG data URL.
function brandImage(dataUrl, title) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const W = img.width
      const bar = Math.max(64, Math.round(W * 0.045))
      const canvas = document.createElement('canvas')
      canvas.width = W
      canvas.height = img.height + bar
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      // footer gradient
      const g = ctx.createLinearGradient(0, img.height, W, canvas.height)
      g.addColorStop(0, NAVY); g.addColorStop(1, '#16306B')
      ctx.fillStyle = g
      ctx.fillRect(0, img.height, W, bar)
      // cyan accent line
      ctx.fillStyle = CYAN
      ctx.fillRect(0, img.height, W, Math.max(2, Math.round(bar * 0.05)))
      const cy = img.height + bar / 2
      const pad = Math.round(bar * 0.5)
      // wordmark dot + QUANTUM
      const fs = Math.round(bar * 0.30)
      ctx.fillStyle = CYAN
      ctx.beginPath(); ctx.arc(pad, cy, fs * 0.34, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.font = `800 ${fs}px ${FONT}`
      ctx.textBaseline = 'middle'
      ctx.fillText('QUANTUM', pad + fs * 0.7, cy)
      const wm = ctx.measureText('QUANTUM').width
      ctx.fillStyle = 'rgba(255,255,255,0.55)'
      ctx.font = `600 ${Math.round(fs * 0.78)}px ${FONT}`
      ctx.fillText('· ' + (title || pageLabel()), pad + fs * 0.7 + wm + fs * 0.5, cy)
      // right-aligned timestamp
      const ts = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
      ctx.textAlign = 'right'
      ctx.fillStyle = 'rgba(255,255,255,0.75)'
      ctx.font = `600 ${Math.round(fs * 0.72)}px ${FONT}`
      ctx.fillText(ts, W - pad, cy)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

// Stack several branded PNGs into one tall sheet for batch capture. Caps the
// final canvas to a browser-safe height by scaling everything down uniformly.
const MAX_SHEET = 15000
function stitchVertical(dataUrls) {
  return new Promise(async (resolve) => {
    const imgs = await Promise.all(dataUrls.map((u) => new Promise((r) => {
      const im = new Image(); im.onload = () => r(im); im.onerror = () => r(null); im.src = u
    })))
    const ok = imgs.filter(Boolean)
    if (!ok.length) return resolve(null)
    const gap = 28
    const baseW = Math.max(...ok.map((i) => i.width))
    const baseH = ok.reduce((a, i) => a + i.height, 0) + gap * (ok.length + 1)
    const scale = Math.min(1, MAX_SHEET / baseH)
    const W = Math.round(baseW * scale)
    const H = Math.round(baseH * scale)
    const canvas = document.createElement('canvas')
    canvas.width = W; canvas.height = H
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H)
    let y = Math.round(gap * scale)
    ok.forEach((i) => {
      const w = Math.round(i.width * scale)
      const h = Math.round(i.height * scale)
      ctx.drawImage(i, Math.round((W - w) / 2), y, w, h)
      y += h + Math.round(gap * scale)
    })
    try { resolve(canvas.toDataURL('image/png')) } catch { resolve(null) }
  })
}

// Pages included in a full-panel batch capture (path + label).
const BATCH_PAGES = [
  ['/dashboard/mtd', 'MTD'],
  ['/dashboard/lq-ops', 'QL-Ops'],
  ['/dashboard/roas', 'ROAS'],
  ['/dashboard/revenue', 'Revenue'],
  ['/dashboard/referral', 'Referral'],
  ['/dashboard/whatsapp', 'WhatsApp'],
]

// Module-level store so batch progress + result survive the SnapshotTool
// REMOUNTING that happens on every route change (each page renders its own
// <Sidebar/>, hence a fresh SnapshotTool). Components subscribe to this.
const snapStore = {
  batch: null,
  result: null,
  listeners: new Set(),
  set(patch) { Object.assign(this, patch); this.listeners.forEach((l) => l()) },
  subscribe(l) { this.listeners.add(l); return () => this.listeners.delete(l) },
  running: false,
}

// Standalone batch runner (not tied to any component instance). Uses the global
// `nav` setter registered by the mounted component to change routes.
let navRef = null
async function runBatchGlobal() {
  if (snapStore.running) return
  snapStore.running = true
  const startPath = window.location.pathname
  const shots = []
  const waitTall = (ms = 5000) => new Promise((res) => {
    const start = Date.now()
    let lastH = -1, stableCount = 0
    const tick = () => {
      let best = null
      document.querySelectorAll('div').forEach((d) => {
        const cs = getComputedStyle(d)
        if (cs.overflowY !== 'auto' && cs.overflowY !== 'scroll') return
        const r = d.getBoundingClientRect()
        if (r.width < 700) return
        if (!best || d.scrollHeight > best.scrollHeight) best = d
      })
      const elapsed = Date.now() - start
      const h = best ? best.scrollHeight : 0
      const tall = best && h > window.innerHeight * 1.1
      // still showing the unified loading skeleton? keep waiting
      const stillLoading = document.querySelector('[class*="bone"], [class*="Skeleton"]')
      // height stable across consecutive ticks = layout settled
      if (h === lastH && h > 0) stableCount++; else stableCount = 0
      lastH = h
      const settled = tall && !stillLoading && stableCount >= 2
      if (settled || elapsed > ms) {
        // give charts a beat to finish their entrance animation
        return setTimeout(res, 650)
      }
      setTimeout(tick, 200)
    }
    setTimeout(tick, 500)
  })
  try {
    for (let i = 0; i < BATCH_PAGES.length; i++) {
      const [path, label] = BATCH_PAGES[i]
      snapStore.set({ batch: { done: i, total: BATCH_PAGES.length, label } })
      if (navRef) navRef(path)
      await waitTall()
      const raw = await captureNode(getContentRoot())
      shots.push(await brandImage(raw, label))
    }
    snapStore.set({ batch: { done: BATCH_PAGES.length, total: BATCH_PAGES.length, label: 'Stitching' } })
    const sheet = await stitchVertical(shots)
    if (navRef) navRef(startPath)
    snapStore.set({ batch: null, result: sheet || shots[0] || null })
  } catch (e) {
    if (navRef) navRef(startPath)
    snapStore.set({ batch: null })
  } finally {
    snapStore.running = false
  }
}

export default function SnapshotTool() {
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [toast, setToast] = React.useState(null)
  const [result, setResultState] = React.useState(snapStore.result) // data URL of finished shot
  const setResult = (v) => { snapStore.set({ result: v }) }
  const [cropping, setCropping] = React.useState(false)
  const [sel, setSel] = React.useState(null) // {x,y,w,h} live drag rect (screen coords)
  const dragRef = React.useRef(null)
  const toastTimer = React.useRef(null)
  const [batch, setBatchState] = React.useState(snapStore.batch) // {done,total,label} progress
  const navigate = useNavigate()
  const location = useLocation()

  // wait until the page content has grown (charts rendered) or timeout
  const waitForRender = (ms = 2600) => new Promise((res) => {
    const start = Date.now()
    const tick = () => {
      const root = getContentRoot()
      const tall = root && root.scrollHeight > window.innerHeight * 1.1
      if (tall || Date.now() - start > ms) return res()
      setTimeout(tick, 200)
    }
    setTimeout(tick, 400)
  })

  // Keep this instance in sync with the module store (survives remounts).
  React.useEffect(() => {
    navRef = navigate
    const sync = () => { setResultState(snapStore.result); setBatchState(snapStore.batch); setBusy(snapStore.running) }
    const unsub = snapStore.subscribe(sync)
    sync()
    return () => { unsub() }
  }, [navigate])

  const runBatch = () => { setOpen(false); runBatchGlobal() }

  const flash = (msg, ok = true) => {
    setToast({ msg, ok })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3200)
  }

  const runFull = async () => {
    setOpen(false); setBusy(true)
    try {
      const url = await captureNode(getContentRoot())
      setResult(await brandImage(url)); flash('Full page captured')
    } catch { flash('Capture failed, please retry', false) }
    finally { setBusy(false) }
  }

  const runVisible = async () => {
    setOpen(false); setBusy(true)
    try {
      const url = await captureViewport()
      setResult(await brandImage(url)); flash('Visible area captured')
    } catch { flash('Capture failed, please retry', false) }
    finally { setBusy(false) }
  }

  const startCrop = () => { setOpen(false); setSel(null); setCropping(true) }

  // mouse handlers for the crop overlay
  const onCropDown = (e) => {
    dragRef.current = { x: e.clientX, y: e.clientY }
    setSel({ x: e.clientX, y: e.clientY, w: 0, h: 0 })
  }
  const onCropMove = (e) => {
    if (!dragRef.current) return
    const s = dragRef.current
    setSel({
      x: Math.min(s.x, e.clientX), y: Math.min(s.y, e.clientY),
      w: Math.abs(e.clientX - s.x), h: Math.abs(e.clientY - s.y),
    })
  }
  const onCropUp = async () => {
    const rect = sel
    dragRef.current = null
    if (!rect || rect.w < 8 || rect.h < 8) { setCropping(false); setSel(null); return }
    setCropping(false); setSel(null); setBusy(true)
    try {
      const root = getContentRoot()
      const rr = root.getBoundingClientRect()
      // Capture the FULL content (reliable, no transform hack), then crop in content
      // coordinates = screen rect translated by the root's box AND its scroll offset.
      // This works whether the page is scrolled to top or anywhere in the middle.
      const sLeft = root.scrollLeft || 0
      const sTop = root.scrollTop || 0
      const local = { x: rect.x - rr.left + sLeft, y: rect.y - rr.top + sTop, w: rect.w, h: rect.h }
      const full = await captureNode(root)
      const cropped = await cropDataUrl(full, local, root.scrollWidth, root.scrollHeight)
      setResult(await brandImage(cropped)); flash('Region captured')
    } catch { flash('Capture failed, please retry', false) }
    finally { setBusy(false) }
  }

  React.useEffect(() => {
    if (!cropping) return
    const onKey = (e) => { if (e.key === 'Escape') { dragRef.current = null; setCropping(false); setSel(null) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cropping])

  const download = () => {
    if (!result) return
    const a = document.createElement('a')
    a.download = `Quantum_${pageLabel()}_${stamp()}.png`
    a.href = result
    a.click()
    flash('Snapshot downloaded')
  }
  const copy = async () => {
    if (!result) return
    try {
      const blob = await (await fetch(result)).blob()
      await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })])
      flash('Copied to clipboard')
    } catch { flash('Copy unavailable, use download', false) }
  }

  return (
    <>
      {/* Crop overlay */}
      {cropping && (
        <div
          data-snapshot-ignore="true"
          onMouseDown={onCropDown}
          onMouseMove={onCropMove}
          onMouseUp={onCropUp}
          style={{ position: 'fixed', inset: 0, zIndex: 10000, cursor: 'crosshair', background: 'rgba(15,31,75,0.30)', fontFamily: FONT }}
        >
          <div style={{ position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)', background: '#fff', borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 700, color: INK, boxShadow: '0 8px 24px rgba(15,31,75,0.25)' }}>
            Drag to select an area &nbsp;·&nbsp; <span style={{ color: '#94A3B8', fontWeight: 600 }}>Esc to cancel</span>
          </div>
          {sel && sel.w > 0 && (
            <div style={{ position: 'absolute', left: sel.x, top: sel.y, width: sel.w, height: sel.h, border: `2px solid ${CYAN}`, background: 'rgba(41,185,195,0.12)', boxShadow: '0 0 0 9999px rgba(15,31,75,0.10)' }}>
              <span style={{ position: 'absolute', top: -22, left: 0, fontSize: 11, fontWeight: 700, color: '#fff', background: NAVY, borderRadius: 5, padding: '1px 6px' }}>
                {Math.round(sel.w)} × {Math.round(sel.h)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Batch progress */}
      {batch && (
        <div data-snapshot-ignore="true" style={{ position: 'fixed', inset: 0, zIndex: 10002, background: 'rgba(15,31,75,0.62)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '26px 30px', minWidth: 280, textAlign: 'center', boxShadow: '0 24px 70px rgba(15,31,75,0.45)' }}>
            <svg width="34" height="34" viewBox="0 0 24 24" style={{ animation: 'qspin 0.8s linear infinite', margin: '0 auto 14px', display: 'block' }}>
              <circle cx="12" cy="12" r="9" fill="none" stroke="#E6EAF2" strokeWidth="2.5"/>
              <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke={NAVY} strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
            <div style={{ fontSize: 15, fontWeight: 800, color: INK }}>Capturing all pages</div>
            <div style={{ fontSize: 13, color: '#64748B', fontWeight: 600, marginTop: 4 }}>
              {Math.min(batch.done + 1, batch.total)} of {batch.total} · {batch.label}
            </div>
            <div style={{ height: 6, width: 220, background: '#EEF1F6', borderRadius: 99, marginTop: 14, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.round((batch.done / batch.total) * 100)}%`, background: `linear-gradient(90deg, ${NAVY}, ${CYAN})`, transition: 'width .3s ease' }} />
            </div>
          </div>
        </div>
      )}

      {/* Result preview modal */}
      {result && (
        <div data-snapshot-ignore="true" style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(15,31,75,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: FONT }} onClick={() => setResult(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, boxShadow: '0 24px 70px rgba(15,31,75,0.40)', maxWidth: 'min(880px, 92vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #EEF1F6' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: INK }}>Snapshot ready</div>
                <div style={{ fontSize: 12, color: '#94A3B8', fontWeight: 600 }}>{pageLabel()} · {stamp().replace('_', ' ')}</div>
              </div>
              <button onClick={() => setResult(null)} aria-label="Close" style={{ border: 'none', background: '#F4F6F9', width: 32, height: 32, borderRadius: 9, cursor: 'pointer', fontSize: 17, color: '#64748B', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: 18, overflow: 'auto', background: BG }}>
              <img src={result} alt="snapshot preview" style={{ display: 'block', maxWidth: '100%', borderRadius: 10, border: '1px solid #E6EAF2', boxShadow: '0 8px 24px rgba(15,31,75,0.12)' }} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 20px', borderTop: '1px solid #EEF1F6' }}>
              <button onClick={copy} style={btnGhost}>Copy</button>
              <button onClick={download} style={btnPrimary}>Download PNG</button>
            </div>
          </div>
        </div>
      )}

      {/* Floating control */}
      <div data-snapshot-ignore="true" style={{ position: 'fixed', right: 22, bottom: 22, zIndex: 9999, fontFamily: FONT }}>
        {toast && (
          <div style={{ position: 'absolute', bottom: 64, right: 0, whiteSpace: 'nowrap', background: '#fff', border: '1px solid #E6EAF2', borderLeft: `3px solid ${toast.ok ? GREEN : NAVY}`, borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 600, color: INK, boxShadow: '0 10px 30px rgba(15,31,75,0.16)' }}>
            {toast.msg}
          </div>
        )}

        {open && !busy && (
          <div style={{ position: 'absolute', bottom: 64, right: 0, width: 248, background: '#fff', border: '1px solid #E6EAF2', borderRadius: 14, boxShadow: '0 16px 40px rgba(15,31,75,0.20)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 14px 8px', fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#94A3B8' }}>Capture</div>
            <button onClick={runFull} style={menuItem}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={NAVY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/></svg>
              <span><b>Full page</b><i style={subTxt}>entire dashboard</i></span>
            </button>
            <button onClick={runVisible} style={menuItem}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={NAVY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="13" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/></svg>
              <span><b>Visible area</b><i style={subTxt}>what is on screen</i></span>
            </button>
            <button onClick={startCrop} style={menuItem}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={NAVY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>
              <span><b>Select region</b><i style={subTxt}>drag to crop</i></span>
            </button>
            <button onClick={runBatch} style={{...menuItem, borderTop: '1px solid #F0F2F7'}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={NAVY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
              <span><b>All pages</b><i style={subTxt}>branded multi-page sheet</i></span>
            </button>
          </div>
        )}

        <button onClick={() => (busy ? null : setOpen((o) => !o))} title="Capture panel snapshot" aria-label="Capture panel snapshot"
          style={{ width: 52, height: 52, borderRadius: 16, border: 'none', cursor: busy ? 'wait' : 'pointer', background: `linear-gradient(135deg, ${NAVY} 0%, ${CYAN} 130%)`, boxShadow: '0 10px 26px rgba(31,60,132,0.38)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform .15s ease' }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-2px)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}>
          {busy ? (
            <svg width="22" height="22" viewBox="0 0 24 24" style={{ animation: 'qspin 0.8s linear infinite' }}>
              <circle cx="12" cy="12" r="9" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2.5"/>
              <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          ) : (
            <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          )}
        </button>
        <style>{`@keyframes qspin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </>
  )
}

const menuItem = { display: 'flex', alignItems: 'center', gap: 11, width: '100%', padding: '11px 14px', border: 'none', background: 'transparent', fontFamily: FONT, fontSize: 13.5, fontWeight: 600, color: INK, cursor: 'pointer', textAlign: 'left' }
const subTxt = { display: 'block', fontSize: 11, fontWeight: 500, fontStyle: 'normal', color: '#94A3B8', marginTop: 1 }
const btnGhost = { padding: '9px 18px', borderRadius: 10, border: '1px solid #D8DEEA', background: '#fff', color: NAVY, fontFamily: FONT, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }
const btnPrimary = { padding: '9px 18px', borderRadius: 10, border: 'none', background: `linear-gradient(135deg, ${NAVY}, ${BLUE})`, color: '#fff', fontFamily: FONT, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }
