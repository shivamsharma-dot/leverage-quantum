import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

// Backs two things asked for on every page: a per-card "expand to full screen"
// button (real Fullscreen API, scoped to that one card's DOM node -- built
// mainly for tables, which is what people actually meant), and a "Present"
// mode that turns the current page's cards into a PowerPoint/Slides-style
// slideshow, one card at a time.
//
// Deliberately zero per-page wiring: every Card (src/ui/dashboardKit.jsx)
// registers itself here automatically on mount, in the order it renders, and
// unregisters on unmount. A page that renders 6 Cards gets a 6-slide deck for
// free; a page with no Cards (or one not wrapped in the Provider) just never
// shows the Present button. Adding a new dashboard page needs no changes here
// at all as long as it's built from the shared Card component, which is
// already the house convention.
//
// Not a slide EDITOR -- nothing is reordered/hidden/annotated for
// presentation specifically. It presents the real, live cards exactly as
// the page already renders them (so any interactive control inside a card,
// e.g. a chart tooltip or a table sort, still works while presenting).

const PresentationContext = createContext(null)

// Fallback for the ~half of pages that don't build their sections from the
// shared Card yet: finds the scrollable content area the same way
// SnapshotTool.jsx already does (widest*tallest scrollable region, which
// naturally excludes the narrow sidebar with no extra exclusion list needed),
// then keeps only the OUTERMOST elements that already carry this app's own
// card signature -- rounded corners + a shadow, the exact DESIGN_SYSTEM.md
// spec every page's local Card clone already uses. So this needs no
// per-page code at all: a page presents whatever it already visually
// renders as a "card", Card-based or not.
function findContentRoot() {
  let best = null, bestScore = 0
  const all = document.querySelectorAll('body *')
  for (let i = 0; i < all.length; i++) {
    const el = all[i]
    const cs = getComputedStyle(el)
    if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.clientWidth > 480 && el.scrollHeight > el.clientHeight) {
      const score = el.scrollHeight * el.clientWidth
      if (score > bestScore) { bestScore = score; best = el }
    }
  }
  return best || document.body
}

function scanAutoSlides() {
  const root = findContentRoot()
  if (!root) return []
  const all = root.querySelectorAll('div,section,article')
  const matches = []
  for (let i = 0; i < all.length && matches.length < 80; i++) {
    const el = all[i]
    if (el.closest('[data-presentation-ignore]')) continue
    const rect = el.getBoundingClientRect()
    if (rect.width < 280 || rect.height < 110) continue
    const cs = getComputedStyle(el)
    const radius = parseFloat(cs.borderRadius) || 0
    if (radius < 8 || !cs.boxShadow || cs.boxShadow === 'none') continue
    matches.push(el)
  }
  // keep only the outermost card in any nested chain, and cap what a
  // slideshow can reasonably hold
  const top = matches.filter(el => !matches.some(other => other !== el && other.contains(el)))
  return top.slice(0, 30).map((node, i) => {
    const headingEl = node.querySelector('h1,h2,h3,h4,[class*="title" i]')
    let title = headingEl && headingEl.textContent ? headingEl.textContent.trim().slice(0, 80) : ''
    if (!title) {
      const firstText = node.querySelector('div,span,p')
      title = ((firstText && firstText.textContent) || '').trim().slice(0, 60)
    }
    return { id: 'auto-' + i, title: title || ('Section ' + (i + 1)), node }
  })
}

export function PresentationProvider({ children }) {
  const slidesRef = useRef([]) // [{id, title, node}], ordered by registration
  const [slideVersion, setSlideVersion] = useState(0) // bump to force a re-render when the registry changes
  const [autoSlides, setAutoSlides] = useState([])
  const [presenting, setPresenting] = useState(false)
  const [index, setIndex] = useState(0)
  const nextIdRef = useRef(0)

  const register = useCallback((title, node) => {
    const id = 'slide-' + (nextIdRef.current++)
    slidesRef.current = [...slidesRef.current, { id, title, node }]
    setSlideVersion(v => v + 1)
    return id
  }, [])
  const updateNode = useCallback((id, node) => {
    const i = slidesRef.current.findIndex(s => s.id === id)
    if (i !== -1) slidesRef.current[i] = { ...slidesRef.current[i], node }
  }, [])
  const unregister = useCallback((id) => {
    slidesRef.current = slidesRef.current.filter(s => s.id !== id)
    setSlideVersion(v => v + 1)
  }, [])

  // Re-checks whether there's anything to present right now and returns the
  // count synchronously, so a click handler can decide what to show without
  // waiting a render -- registered (Card) slides always win over the DOM scan.
  const refreshAuto = useCallback(() => {
    if (slidesRef.current.length) return slidesRef.current.length
    const found = scanAutoSlides()
    setAutoSlides(found)
    return found.length
  }, [])

  const slides = slidesRef.current.length ? slidesRef.current : autoSlides
  const usingAuto = !slidesRef.current.length && autoSlides.length > 0

  const start = useCallback(() => { setIndex(0); setPresenting(true) }, [])
  const stop = useCallback(() => { setPresenting(false); setAutoSlides([]) }, [])
  const next = useCallback(() => setIndex(i => Math.min(i + 1, Math.max(0, (slidesRef.current.length ? slidesRef.current : autoSlides).length - 1))), [autoSlides])
  const prev = useCallback(() => setIndex(i => Math.max(i - 1, 0)), [])
  const goTo = useCallback((i) => setIndex(i), [])

  const value = useMemo(() => ({
    slides, slideVersion, usingAuto, register, updateNode, unregister, refreshAuto,
    presenting, start, stop, index, next, prev, goTo,
  }), [slides, slideVersion, usingAuto, register, updateNode, unregister, refreshAuto, presenting, start, stop, index, next, prev, goTo])

  return <PresentationContext.Provider value={value}>{children}</PresentationContext.Provider>
}

// Safe to call with no Provider present (returns a no-op registry) -- so a
// stray Card rendered outside the tree (there shouldn't be one, but nothing
// should crash if there is) just never registers, rather than throwing.
export function usePresentation() {
  return useContext(PresentationContext) || {
    slides: [], slideVersion: 0, usingAuto: false, register: () => null, updateNode: () => {}, unregister: () => {}, refreshAuto: () => 0,
    presenting: false, start: () => {}, stop: () => {}, index: 0, next: () => {}, prev: () => {}, goTo: () => {},
  }
}
