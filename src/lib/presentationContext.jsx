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

export function PresentationProvider({ children }) {
  const slidesRef = useRef([]) // [{id, title, node}], ordered by registration
  const [slideVersion, setSlideVersion] = useState(0) // bump to force a re-render when the registry changes
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

  const start = useCallback(() => { setIndex(0); setPresenting(true) }, [])
  const stop = useCallback(() => setPresenting(false), [])
  const next = useCallback(() => setIndex(i => Math.min(i + 1, Math.max(0, slidesRef.current.length - 1))), [])
  const prev = useCallback(() => setIndex(i => Math.max(i - 1, 0)), [])
  const goTo = useCallback((i) => setIndex(i), [])

  const value = useMemo(() => ({
    slides: slidesRef.current, slideVersion, register, updateNode, unregister,
    presenting, start, stop, index, next, prev, goTo,
  }), [slideVersion, presenting, index, register, updateNode, unregister, start, stop, next, prev, goTo])

  return <PresentationContext.Provider value={value}>{children}</PresentationContext.Provider>
}

// Safe to call with no Provider present (returns a no-op registry) -- so a
// stray Card rendered outside the tree (there shouldn't be one, but nothing
// should crash if there is) just never registers, rather than throwing.
export function usePresentation() {
  return useContext(PresentationContext) || {
    slides: [], slideVersion: 0, register: () => null, updateNode: () => {}, unregister: () => {},
    presenting: false, start: () => {}, stop: () => {}, index: 0, next: () => {}, prev: () => {}, goTo: () => {},
  }
}
