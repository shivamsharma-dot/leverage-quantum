import React from 'react'
import { toPng } from 'html-to-image'

/*
  SnapshotTool — panel-wide screenshot capture.
  Self-contained floating control rendered from the shared Sidebar so it
  appears on every page. Captures the dashboard view to a PNG that can be
  downloaded or copied to the clipboard for sharing.
  Brand palette only: navy #1F3C84, blue #1C9FD4, cyan #29B9C3, green #4CAE6F.
*/

const FONT = "'Plus Jakarta Sans','Inter',sans-serif"
const NAVY = '#1F3C84'
const CYAN = '#29B9C3'
const GREEN = '#4CAE6F'

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

export default function SnapshotTool() {
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [toast, setToast] = React.useState(null) // {msg, ok}
  const toastTimer = React.useRef(null)

  const flash = (msg, ok = true) => {
    setToast({ msg, ok })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3200)
  }

  // Pick the panel content node to capture. Prefer the main scrollable
  // content region; fall back to the whole document body.
  const getTarget = () => {
    return (
      document.querySelector('[data-snapshot-root]') ||
      document.querySelector('main') ||
      document.body
    )
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

  const capture = async () => {
    const node = getTarget()
    if (!node) throw new Error('Nothing to capture')
    // Hide the floating tool itself so it never appears in the shot.
    return toPng(node, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: '#F4F6F9',
      filter: (el) => !(el?.dataset && el.dataset.snapshotIgnore === 'true'),
    })
  }

  const handleDownload = async () => {
    setOpen(false)
    setBusy(true)
    try {
      const url = await capture()
      const a = document.createElement('a')
      a.download = `Quantum_${pageLabel()}_${stamp()}.png`
      a.href = url
      a.click()
      flash('Snapshot downloaded')
    } catch (e) {
      flash('Capture failed, please retry', false)
    } finally {
      setBusy(false)
    }
  }

  const handleCopy = async () => {
    setOpen(false)
    setBusy(true)
    try {
      const url = await capture()
      const blob = await (await fetch(url)).blob()
      await navigator.clipboard.write([
        new window.ClipboardItem({ 'image/png': blob }),
      ])
      flash('Copied to clipboard')
    } catch (e) {
      flash('Copy unavailable, try download', false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      data-snapshot-ignore="true"
      style={{ position: 'fixed', right: 22, bottom: 22, zIndex: 9999, fontFamily: FONT }}
    >
      {toast && (
        <div
          style={{
            position: 'absolute', bottom: 64, right: 0, whiteSpace: 'nowrap',
            background: '#fff', border: '1px solid #E6EAF2',
            borderLeft: `3px solid ${toast.ok ? GREEN : NAVY}`,
            borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 600,
            color: '#0F1F4B', boxShadow: '0 10px 30px rgba(15,31,75,0.16)',
          }}
        >
          {toast.msg}
        </div>
      )}

      {open && !busy && (
        <div
          style={{
            position: 'absolute', bottom: 64, right: 0, width: 232,
            background: '#fff', border: '1px solid #E6EAF2', borderRadius: 14,
            boxShadow: '0 16px 40px rgba(15,31,75,0.20)', overflow: 'hidden',
          }}
        >
          <div style={{ padding: '12px 14px 8px', fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#94A3B8' }}>
            Capture this view
          </div>
          <button onClick={handleDownload} style={menuItem}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={NAVY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download PNG
          </button>
          <button onClick={handleCopy} style={menuItem}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={NAVY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Copy to clipboard
          </button>
        </div>
      )}

      <button
        onClick={() => (busy ? null : setOpen((o) => !o))}
        title="Capture panel snapshot"
        aria-label="Capture panel snapshot"
        style={{
          width: 52, height: 52, borderRadius: 16, border: 'none', cursor: busy ? 'wait' : 'pointer',
          background: `linear-gradient(135deg, ${NAVY} 0%, ${CYAN} 130%)`,
          boxShadow: '0 10px 26px rgba(31,60,132,0.38)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', transition: 'transform .15s ease',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-2px)')}
        onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
      >
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
  )
}

const menuItem = {
  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
  padding: '11px 14px', border: 'none', background: 'transparent',
  fontFamily: FONT, fontSize: 13.5, fontWeight: 600, color: '#0F1F4B',
  cursor: 'pointer', textAlign: 'left',
}
