import React from 'react'
import { usePresentation, neutralizeContainingBlockAncestors } from '../lib/presentationContext.jsx'

// Floating "Present" control, mounted from Sidebar.jsx the same way
// SnapshotTool.jsx is -- appears on every page with zero per-page wiring.
// Slides come from whatever Cards (src/ui/dashboardKit.jsx) are currently
// registered on the page, merged in real document order with anything found
// by presentationContext.jsx's DOM-scan fallback (this app's own rounded-
// corner/shadow "card" visual signature), so every page works with zero
// per-page code -- even a page that's only PARTLY built from Card.
const FONT = "'Plus Jakarta Sans','Inter',sans-serif"
const NAVY = '#1F3C84'
const BLUE = '#1C9FD4'
const CYAN = '#29B9C3'

const isEditableTarget = el => !!el && (
  el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
)

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

// Auto-elevated slides land 8-12px off from run to run if we let the node's
// own authored margin/width survive underneath the position:fixed override
// -- confirmed live on Settings (an 18px jump mid-deck) and Ask AI (a
// fixed-width rail staying narrow inside a much wider frame). Zeroed out
// every time, alongside the same top/bottom clearance Card uses so this
// chrome (title label above, toolbar below) can never overlap the slide.
function elevateAutoNode(node) {
  node.style.position = 'fixed'
  node.style.top = '92px'
  node.style.bottom = '96px'
  node.style.left = '6vw'
  node.style.right = '6vw'
  node.style.width = 'auto'
  node.style.maxWidth = 'none'
  // setting top+bottom is only enough to stretch the box's height when
  // nothing else pins a height -- confirmed live on the app's own home page,
  // where the matched card's own authored height (45px, meant for its
  // normal in-page size) survived right through the fixed positioning and
  // left the "elevated" slide a 45px-tall sliver despite correct insets.
  node.style.height = 'auto'
  node.style.maxHeight = 'none'
  node.style.margin = '0'
  node.style.zIndex = '9998'
  node.style.overflow = 'auto'
  node.style.borderRadius = node.style.borderRadius || '20px'
  node.style.boxShadow = '0 2px 0 rgba(28,159,212,0.35), 0 40px 100px -20px rgba(8,13,28,0.55), 0 0 0 1px rgba(28,159,212,0.18)'
  node.style.animation = 'presentSlideIn .38s cubic-bezier(.22,1,.36,1)'
}
function resetAutoNode(node) {
  ['display', 'position', 'top', 'bottom', 'left', 'right', 'width', 'maxWidth', 'height', 'maxHeight', 'margin', 'zIndex', 'overflow', 'boxShadow', 'animation']
    .forEach(prop => { node.style[prop] = '' })
  delete node.dataset.presentAuto
}

export default function PresentationTool() {
  const { slides, presenting, usingAuto, usingMixed, registeredCount, start, stop, index, next, prev, goTo, refreshAuto } = usePresentation()
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [noSlidesHint, setNoSlidesHint] = React.useState(false)
  const [showKeyHint, setShowKeyHint] = React.useState(false)
  const overlayRef = React.useRef(null)
  const exitBtnRef = React.useRef(null)
  const autoCount = slides.length - registeredCount

  React.useEffect(() => {
    if (!presenting) return undefined
    const onKey = e => {
      // A deck-navigation key fired while someone is typing in a field would
      // otherwise both hijack the deck AND (for Space) still type into the
      // field at the same time -- ignore every shortcut while focus is on
      // anything editable and let the page handle the keystroke normally.
      if (isEditableTarget(document.activeElement)) return
      if (e.key === 'Escape') {
        // Escape used to only ever stop() -- if a card's own real Fullscreen
        // was ALSO active (independent state, its own API), the key was
        // consumed by this handler first and the person was left stranded
        // in fullscreen on a bare card with the deck silently dead.
        if (document.fullscreenElement) document.exitFullscreen()
        stop()
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); next() }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prev() }
      else if (e.key === 'Tab' && overlayRef.current) {
        // Minimal focus containment: while presenting, only the overlay's
        // own controls (toolbar buttons, dot rail) are reachable by Tab --
        // nothing usable exists behind the backdrop anyway.
        const focusable = Array.from(overlayRef.current.querySelectorAll('button:not([disabled]), [tabindex]:not([tabindex="-1"])'))
        if (!focusable.length) return
        const first = focusable[0], last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [presenting, next, prev, stop])

  React.useEffect(() => {
    if (!presenting) return undefined
    setShowKeyHint(true)
    const t = setTimeout(() => setShowKeyHint(false), 3000)
    // Moves keyboard focus into the deck's own controls the moment it opens,
    // so Tab/Escape land somewhere sensible instead of wherever focus
    // happened to be on the underlying page.
    exitBtnRef.current && exitBtnRef.current.focus()
    return () => clearTimeout(t)
  }, [presenting])

  // For slides discovered via the DOM-scan fallback (no Card wrapper to do
  // this itself): elevate the current one into a full presentation card and
  // hide the rest, imperatively, mirroring what Card does for its own
  // registered slides. Every managed node is marked with data-presentAuto
  // EVERY run (not only the current one) so cleanup can find and restore
  // every node it has ever touched -- previously only the node that
  // happened to be current at the moment presenting stopped got its inline
  // styles cleared, permanently leaving every other visited slide hidden.
  React.useEffect(() => {
    if (!presenting) return undefined
    const autoSlides = slides.filter(s => s.id.startsWith('auto-') && s.node)
    const restores = []
    autoSlides.forEach((s, i) => {
      const isCurrent = i === index
      s.node.dataset.presentAuto = '1'
      if (isCurrent) {
        elevateAutoNode(s.node)
        restores.push(neutralizeContainingBlockAncestors(s.node))
      } else {
        // clear any elevation left from when THIS node was current on a
        // previous slide, then hide it -- clearing first, hiding last, so
        // the dataset marker below survives for cleanup to find later
        resetAutoNode(s.node)
        s.node.dataset.presentAuto = '1'
        s.node.style.display = 'none'
      }
    })
    const raf1 = requestAnimationFrame(() => requestAnimationFrame(() => window.dispatchEvent(new Event('resize'))))
    return () => {
      restores.forEach(r => r())
      autoSlides.forEach(s => resetAutoNode(s.node))
      cancelAnimationFrame(raf1)
    }
  }, [presenting, index, slides])

  if (presenting) {
    const current = slides[index]
    const isCurrentAuto = !!current && current.id.startsWith('auto-')
    const pct = slides.length ? ((index + 1) / slides.length) * 100 : 0
    const showDots = slides.length > 1 && slides.length <= 10
    return (
      <div ref={overlayRef} role="dialog" aria-modal="true" aria-label={`Presenting${current ? ': ' + current.title : ''}`}
        data-presentation-ignore="true" style={{ position: 'fixed', inset: 0, zIndex: 9990, fontFamily: FONT }}>
        <style>{KEYFRAMES}</style>
        {/* layered backdrop: dark gradient + soft radial glow behind the active slide.
            pointerEvents:auto so it actually intercepts clicks -- it used to inherit
            'none' from a parent that opted the rest of this tree back in, so a click
            anywhere "dimmed" landed on the real page underneath, sidebar links
            included, with no visible sign the deck was still open. */}
        <div style={{
          position: 'absolute', inset: 0, animation: 'presentBackdropIn .3s ease-out', pointerEvents: 'auto',
          background: 'radial-gradient(120% 90% at 50% 8%, rgba(28,159,212,0.16), transparent 55%), linear-gradient(180deg, rgba(6,10,22,0.86) 0%, rgba(8,12,26,0.94) 100%)',
          backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
        }} />
        {/* top progress rail */}
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 3, background: 'rgba(255,255,255,0.08)', zIndex: 9999, pointerEvents: 'none' }}>
          <div style={{
            height: '100%', width: pct + '%', transition: 'width .3s cubic-bezier(.22,1,.36,1)',
            background: `linear-gradient(90deg, ${NAVY}, ${BLUE}, ${CYAN})`, animation: 'presentBarGlow 2.2s ease-in-out infinite',
          }} />
        </div>
        {/* slide label, top-left -- fixed at a height (92px of top clearance on the
            slide itself, matching Card/elevateAutoNode) so it can never sit behind
            the white slide regardless of viewport height */}
        {current && (
          <div style={{ position: 'fixed', top: 22, left: 28, zIndex: 9999, maxWidth: '46vw', pointerEvents: 'none' }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 3 }}>
              {isCurrentAuto ? 'Auto-detected section' : 'Presenting'} &middot; {index + 1} of {slides.length}
            </div>
            {/* the 92px top clearance on the slide is sized for exactly one
                line of this -- a long title wrapping to two (confirmed live
                on Summary) pushed its second line down into the clearance
                gap and got clipped by the white slide starting right under
                it. Clamped to one line with an ellipsis instead of trying to
                measure and grow the clearance dynamically. */}
            <div style={{ fontSize: 19, fontWeight: 800, color: '#fff', letterSpacing: '-0.3px', textShadow: '0 2px 12px rgba(0,0,0,0.4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {current.title}
            </div>
          </div>
        )}
        {/* keyboard hint toast */}
        <div style={{
          position: 'fixed', top: 22, left: '50%', zIndex: 9999, pointerEvents: 'none',
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
          <button ref={exitBtnRef} type="button" onClick={stop} title="Exit (Esc)" style={{
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
                {usingMixed
                  ? `${registeredCount} built-in + ${autoCount} more found automatically`
                  : usingAuto
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
