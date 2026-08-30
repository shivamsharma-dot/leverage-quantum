import React from 'react'
import { usePresentation } from '../lib/presentationContext.jsx'

// Floating "Present" control, mounted from Sidebar.jsx the same way
// SnapshotTool.jsx is -- appears on every page with zero per-page wiring.
// Slides come from whatever Cards (src/ui/dashboardKit.jsx) are currently
// registered on the page; if a page has none (it isn't built on the shared
// Card yet), presentationContext.jsx's DOM scan finds this app's own
// rounded-corner/shadow "card" visual signature and presents those instead,
// so every page works without per-page code.
const FONT = "'Plus Jakarta Sans','Inter',sans-serif"
const NAVY = '#1F3C84'
const BLUE = '#1C9FD4'
const CYAN = '#29B9C3'

const PresentIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="13" rx="2.5" />
    <path d="M10.5 8.2v4.6l3.6-2.3z" fill="currentColor" stroke="none" />
    <path d="M8 21h8" /><path d="M12 17v4" />
  </svg>
)
const ChevronL = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>)
const ChevronR = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>)
const CloseIcon = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18" /><path d="M6 6l12 12" /></svg>)
const SparkIcon = ({ style }) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
  </svg>
)

const KEYFRAMES = `
@keyframes presentSlideIn { from { opacity: 0; transform: scale(.97) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
@keyframes presentBackdropIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes presentHintIn { from { opacity: 0; transform: translate(-50%,6px); } to { opacity: 1; transform: translate(-50%,0); } }
@keyframes presentHintOut { from { opacity: 1; } to { opacity: 0; visibility: hidden; } }
@keyframes presentBarGlow { 0%,100% { opacity: .9; } 50% { opacity: 1; } }
`

export default function PresentationTool() {
  const { slides, presenting, usingAuto, start, stop, index, next, prev, goTo, refreshAuto } = usePresentation()
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [noSlidesHint, setNoSlidesHint] = React.useState(false)
  const [showKeyHint, setShowKeyHint] = React.useState(false)

  React.useEffect(() => {
    if (!presenting) return undefined
    const onKey = e => {
      if (e.key === 'Escape') stop()
      else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') next()
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') prev()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [presenting, next, prev, stop])

  React.useEffect(() => {
    if (!presenting) return undefined
    setShowKeyHint(true)
    const t = setTimeout(() => setShowKeyHint(false), 3000)
    return () => clearTimeout(t)
  }, [presenting])

  // For slides discovered via the DOM-scan fallback (no Card wrapper to do
  // this itself): elevate the current one into a full presentation card and
  // hide the rest, imperatively, mirroring exactly what Card does for its
  // own registered slides.
  React.useEffect(() => {
    if (!presenting) return undefined
    slides.forEach((s, i) => {
      if (!s.id.startsWith('auto-') || !s.node) return
      const isCurrent = i === index
      s.node.style.display = isCurrent ? '' : 'none'
      if (isCurrent) {
        s.node.dataset.presentAuto = '1'
        s.node.style.position = 'fixed'
        s.node.style.inset = '6vh 7vw'
        s.node.style.zIndex = '9998'
        s.node.style.overflow = 'auto'
        s.node.style.boxShadow = '0 2px 0 rgba(28,159,212,0.35), 0 40px 100px -20px rgba(8,13,28,0.55), 0 0 0 1px rgba(28,159,212,0.18)'
        s.node.style.animation = 'presentSlideIn .38s cubic-bezier(.22,1,.36,1)'
      }
    })
    return () => {
      slides.forEach(s => {
        if (s.node && s.node.dataset && s.node.dataset.presentAuto) {
          s.node.style.display = ''; s.node.style.position = ''; s.node.style.inset = ''
          s.node.style.zIndex = ''; s.node.style.overflow = ''; s.node.style.boxShadow = ''; s.node.style.animation = ''
          delete s.node.dataset.presentAuto
        }
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presenting, index, slides.length])

  if (presenting) {
    const current = slides[index]
    const pct = slides.length ? ((index + 1) / slides.length) * 100 : 0
    const showDots = slides.length > 1 && slides.length <= 10
    return (
      <div data-presentation-ignore="true" style={{ position: 'fixed', inset: 0, zIndex: 9990, pointerEvents: 'none', fontFamily: FONT }}>
        <style>{KEYFRAMES}</style>
        {/* layered backdrop: dark gradient + soft radial glow behind the active slide, not a flat scrim */}
        <div style={{
          position: 'absolute', inset: 0, animation: 'presentBackdropIn .3s ease-out',
          background: 'radial-gradient(120% 90% at 50% 8%, rgba(28,159,212,0.16), transparent 55%), linear-gradient(180deg, rgba(6,10,22,0.86) 0%, rgba(8,12,26,0.94) 100%)',
          backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
        }} />
        {/* top progress rail */}
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 3, background: 'rgba(255,255,255,0.08)', zIndex: 9999 }}>
          <div style={{
            height: '100%', width: pct + '%', transition: 'width .3s cubic-bezier(.22,1,.36,1)',
            background: `linear-gradient(90deg, ${NAVY}, ${BLUE}, ${CYAN})`, animation: 'presentBarGlow 2.2s ease-in-out infinite',
          }} />
        </div>
        {/* slide label, top-left */}
        {current && (
          <div style={{ position: 'fixed', top: 22, left: 28, zIndex: 9999, maxWidth: '46vw', pointerEvents: 'none' }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 3 }}>
              {usingAuto ? 'Auto-detected section' : 'Presenting'} &middot; {index + 1} of {slides.length}
            </div>
            <div style={{ fontSize: 19, fontWeight: 800, color: '#fff', letterSpacing: '-0.3px', textShadow: '0 2px 12px rgba(0,0,0,0.4)' }}>
              {current.title}
            </div>
          </div>
        )}
        {/* keyboard hint toast */}
        <div style={{
          position: 'fixed', top: 22, left: '50%', zIndex: 9999,
          animation: showKeyHint ? 'presentHintIn .3s ease-out both' : 'presentHintOut .35s ease-in both',
          display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(15,23,42,0.88)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 999, padding: '7px 14px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        }}>
          <SparkIcon style={{ color: CYAN }} />
          <span style={{ fontSize: 11.5, fontWeight: 600, color: 'rgba(255,255,255,0.85)', whiteSpace: 'nowrap' }}>
            <kbd style={kbdStyle}>&larr;</kbd> <kbd style={kbdStyle}>&rarr;</kbd> to navigate &middot; <kbd style={kbdStyle}>Esc</kbd> to exit
          </span>
        </div>
        {/* bottom control bar */}
        <div style={{
          position: 'fixed', bottom: 26, left: '50%', transform: 'translateX(-50%)', zIndex: 9999,
          display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(15,20,38,0.86)', border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 999, padding: '7px 8px 7px 18px', boxShadow: '0 20px 50px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)',
          pointerEvents: 'auto', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
        }}>
          <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', marginRight: 4, fontVariantNumeric: 'tabular-nums' }}>
            {slides.length ? `${index + 1} / ${slides.length}` : 'No slides on this page'}
          </span>
          <button type="button" onClick={prev} disabled={index === 0} title="Previous (←)" style={navBtnStyle(index === 0)}>
            <ChevronL />
          </button>
          {showDots && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 6px' }}>
              {slides.map((s, i) => (
                <button key={s.id} type="button" onClick={() => goTo(i)} title={s.title}
                  style={{
                    width: i === index ? 18 : 6, height: 6, borderRadius: 999, border: 'none', cursor: 'pointer', padding: 0,
                    background: i === index ? `linear-gradient(90deg, ${BLUE}, ${CYAN})` : 'rgba(255,255,255,0.22)',
                    transition: 'width .25s cubic-bezier(.22,1,.36,1), background .2s',
                  }} />
              ))}
            </div>
          )}
          <button type="button" onClick={next} disabled={index >= slides.length - 1} title="Next (→)" style={navBtnStyle(index >= slides.length - 1)}>
            <ChevronR />
          </button>
          <button type="button" onClick={stop} title="Exit (Esc)" style={{
            marginLeft: 6, width: 32, height: 32, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontFamily: FONT,
          }}>
            <CloseIcon />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div data-presentation-ignore="true" style={{ position: 'fixed', right: 0, bottom: 210, zIndex: 9998, fontFamily: FONT }}>
      <button
        type="button"
        onClick={() => {
          const n = refreshAuto()
          if (n > 0) { setMenuOpen(v => !v); return }
          setNoSlidesHint(true)
          setTimeout(() => setNoSlidesHint(false), 3200)
        }}
        title="Present this page"
        style={{
          width: 26, height: 56, borderRadius: '16px 0 0 16px', border: '0.5px solid var(--card-border)', borderRight: 'none',
          cursor: 'pointer', background: `linear-gradient(160deg, var(--card) 0%, var(--card) 55%, rgba(28,159,212,0.10) 100%)`,
          boxShadow: '-8px 4px 22px -8px rgba(15,23,42,0.24)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: NAVY, transition: 'width .15s, box-shadow .15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.width = '30px'; e.currentTarget.style.boxShadow = '-10px 6px 26px -8px rgba(28,159,212,0.32)' }}
        onMouseLeave={e => { e.currentTarget.style.width = '26px'; e.currentTarget.style.boxShadow = '-8px 4px 22px -8px rgba(15,23,42,0.24)' }}
      >
        <PresentIcon />
      </button>
      {noSlidesHint && (
        <div style={{
          position: 'absolute', right: 32, bottom: 4, width: 230, background: 'var(--card)', border: '1px solid var(--card-border)',
          borderRadius: 12, boxShadow: '0 16px 40px rgba(15,31,75,0.20)', padding: '11px 14px', zIndex: 9998,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>Nothing to present here yet</div>
          <div style={{ fontSize: 11, color: 'var(--text3,#94A3B8)', lineHeight: 1.4 }}>Couldn't find any sections on this page to turn into slides.</div>
        </div>
      )}
      {menuOpen && slides.length > 0 && (
        <>
          <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9997 }} />
          <div style={{
            position: 'absolute', right: 32, bottom: 0, width: 240, background: 'var(--card)', border: '1px solid var(--card-border)',
            borderRadius: 16, boxShadow: '0 20px 50px rgba(15,31,75,0.24)', overflow: 'hidden', zIndex: 9998,
          }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--card-border)', background: 'linear-gradient(135deg, rgba(31,60,132,0.06), rgba(28,159,212,0.05))' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 26, height: 26, borderRadius: 8, background: `linear-gradient(135deg, ${NAVY}, ${BLUE})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
                  <PresentIcon />
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>Present this page</div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3,#94A3B8)', marginTop: 7, lineHeight: 1.4 }}>
                {usingAuto
                  ? `${slides.length} section${slides.length === 1 ? '' : 's'} detected automatically`
                  : `${slides.length} section${slides.length === 1 ? '' : 's'} → ${slides.length} slide${slides.length === 1 ? '' : 's'}`}
              </div>
            </div>
            <button type="button" onClick={() => { start(); setMenuOpen(false) }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: 'calc(100% - 20px)', margin: '10px', textAlign: 'center',
                padding: '10px 14px', border: 'none', borderRadius: 10, background: `linear-gradient(135deg, ${NAVY}, ${BLUE})`,
                color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, boxShadow: '0 8px 18px -6px rgba(28,159,212,0.5)',
              }}>
              <PresentIcon /> Start presentation
            </button>
          </div>
        </>
      )}
    </div>
  )
}

const kbdStyle = {
  display: 'inline-block', padding: '1px 5px', borderRadius: 4, background: 'rgba(255,255,255,0.1)',
  border: '1px solid rgba(255,255,255,0.14)', fontSize: 10.5, fontWeight: 700, fontFamily: 'inherit',
}
const navBtnStyle = (disabled) => ({
  width: 32, height: 32, borderRadius: '50%', border: 'none', background: disabled ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.12)',
  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.35 : 1,
  transition: 'background .15s',
})
