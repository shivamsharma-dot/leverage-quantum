import React from 'react'
import { usePresentation } from '../lib/presentationContext.jsx'

// Floating "Present" control, mounted from Sidebar.jsx the same way
// SnapshotTool.jsx is -- appears on every page with zero per-page wiring.
// Slides come from whatever Cards (src/ui/dashboardKit.jsx) are currently
// registered on the page; see presentationContext.jsx for how that works.
const FONT = "'Plus Jakarta Sans','Inter',sans-serif"
const NAVY = '#1F3C84'
const BLUE = '#1C9FD4'

const PresentIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" />
  </svg>
)

export default function PresentationTool() {
  const { slides, presenting, start, stop, index, next, prev, goTo } = usePresentation()
  const [menuOpen, setMenuOpen] = React.useState(false)

  React.useEffect(() => {
    if (!presenting) return undefined
    const onKey = e => {
      if (e.key === 'Escape') stop()
      else if (e.key === 'ArrowRight' || e.key === 'PageDown') next()
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') prev()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [presenting, next, prev, stop])

  if (presenting) {
    return (
      <div data-presentation-ignore="true" style={{ position: 'fixed', inset: 0, zIndex: 9990, pointerEvents: 'none', fontFamily: FONT }}>
        {/* dims everything except the current slide, which Card lifts to zIndex:9998 */}
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(10,16,32,0.6)' }} />
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 9999,
          display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(15,23,42,0.92)', borderRadius: 999,
          padding: '8px 10px 8px 16px', boxShadow: '0 12px 32px rgba(0,0,0,0.35)', pointerEvents: 'auto',
        }}>
          <span style={{ color: '#fff', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
            {slides.length ? `${index + 1} / ${slides.length}` : 'No slides on this page'}
          </span>
          <button type="button" onClick={prev} disabled={index === 0} title="Previous (←)"
            style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.14)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: index === 0 ? 'default' : 'pointer', opacity: index === 0 ? 0.4 : 1 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <button type="button" onClick={next} disabled={index >= slides.length - 1} title="Next (→)"
            style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.14)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: index >= slides.length - 1 ? 'default' : 'pointer', opacity: index >= slides.length - 1 ? 0.4 : 1 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
          <button type="button" onClick={stop} title="Exit (Esc)"
            style={{ marginLeft: 4, padding: '6px 14px', borderRadius: 999, border: 'none', background: BLUE, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
            Exit
          </button>
        </div>
      </div>
    )
  }

  return (
    <div data-presentation-ignore="true" style={{ position: 'fixed', right: 0, bottom: 210, zIndex: 9998, fontFamily: FONT }}>
      <button
        type="button"
        onClick={() => (slides.length ? setMenuOpen(v => !v) : null)}
        title={slides.length ? 'Present this page' : 'No presentable sections on this page yet'}
        style={{
          width: 24, height: 52, borderRadius: '14px 0 0 14px', border: '0.5px solid var(--card-border)', borderRight: 'none',
          cursor: slides.length ? 'pointer' : 'default', background: 'var(--card)', boxShadow: '-6px 4px 18px -8px rgba(15,23,42,0.22)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: slides.length ? NAVY : 'var(--text3,#94A3B8)',
          opacity: slides.length ? 1 : 0.55,
        }}
      >
        <PresentIcon />
      </button>
      {menuOpen && slides.length > 0 && (
        <>
          <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9997 }} />
          <div style={{
            position: 'absolute', right: 30, bottom: 0, width: 220, background: 'var(--card)', border: '1px solid var(--card-border)',
            borderRadius: 14, boxShadow: '0 16px 40px rgba(15,31,75,0.20)', overflow: 'hidden', zIndex: 9998,
          }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--card-border)' }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text)' }}>Present this page</div>
              <div style={{ fontSize: 11, color: 'var(--text3,#94A3B8)', marginTop: 2 }}>{slides.length} section{slides.length === 1 ? '' : 's'} → {slides.length} slide{slides.length === 1 ? '' : 's'}</div>
            </div>
            <button type="button" onClick={() => { start(); setMenuOpen(false) }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'transparent', color: NAVY, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
              ▶ Start presentation
            </button>
          </div>
        </>
      )}
    </div>
  )
}
