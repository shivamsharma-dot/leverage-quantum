import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

// Backs two things asked for on every page: a per-card "expand to full screen"
// button (real Fullscreen API, scoped to that one card's DOM node -- built
// mainly for tables, which is what people actually meant), and a "Present"
// mode that turns the current page's cards into a PowerPoint/Slides-style
// slideshow, one card at a time.
//
// Deliberately zero per-page wiring: every Card (src/ui/dashboardKit.jsx)
// registers itself here automatically on mount, in the order it renders, and
// unregisters on unmount. A page that renders 6 Cards gets a 6-slide deck for
// free. Pages that don't build every section from Card fall back to a DOM
// scan (below) for whatever it misses, so the two sources are MERGED, not
// mutually exclusive -- a page with 3 registered Cards and 2 more plain
// sections gets a 5-slide deck, in real document order.
//
// Not a slide EDITOR -- nothing is reordered/hidden/annotated for
// presentation specifically. It presents the real, live cards exactly as
// the page already renders them (so any interactive control inside a card,
// e.g. a chart tooltip or a table sort, still works while presenting).

const PresentationContext = createContext(null)

// Routes where "present whatever looks like a card" makes no sense at all --
// Settings is a page of editable forms with Save buttons, and Ask AI's only
// "card"-shaped thing is its own conversation-history rail, not the chat
// itself. Neither builds from the shared Card, so without this the DOM scan
// would happily turn a settings form or someone's chat history into a slide.
const AUTO_SCAN_DENYLIST = ['/settings', '/ask-ai']

// Finds the scrollable content area the same way SnapshotTool.jsx already
// does, ranked by the VISIBLE viewport area of the candidate (clientWidth *
// clientHeight), not by how much off-screen content it happens to hold --
// a large virtualized/off-screen scroll buffer (seen for real on Meta Ads,
// ~980x21361px of scrollHeight) can dwarf the real on-screen content pane on
// a scrollHeight-based score despite never being what a person is looking
// at. Still requires genuine overflow (scrollHeight strictly greater than
// clientHeight) so a non-scrolling container can never win.
function findContentRoot() {
  let best = null, bestScore = 0
  const all = document.querySelectorAll('body *')
  for (let i = 0; i < all.length; i++) {
    const el = all[i]
    const cs = getComputedStyle(el)
    if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.clientWidth > 480 && el.scrollHeight > el.clientHeight) {
      const score = el.clientWidth * el.clientHeight
      if (score > bestScore) { bestScore = score; best = el }
    }
  }
  return best || document.body
}

// A concatenated "MetaAdsSpend, leads..." heading+subtitle run-on (the scan
// grabs the first heading-ish element's full textContent, which can include
// a nested subtitle span with no separating space) reads as one garbled
// word. This can't tell a real run-on from a single CamelCase word, so it
// only inserts a separator at an unambiguous case transition adjacent to a
// word boundary-ish letter run, and only ever RUNS ONCE per candidate --
// good enough to de-garble the common "Heading" + "Subtitle" concatenation
// without mangling a genuine word.
function humanizeTitle(raw) {
  let t = raw.replace(/([a-z0-9])([A-Z][a-z])/g, '$1 — $2').trim()
  if (t.length > 70) {
    const cut = t.slice(0, 70)
    const lastSpace = cut.lastIndexOf(' ')
    t = (lastSpace > 40 ? cut.slice(0, lastSpace) : cut) + '…'
  }
  return t
}

function scanAutoSlides(excludeNodes) {
  if (AUTO_SCAN_DENYLIST.some(p => window.location.pathname.startsWith(p))) return []
  const root = findContentRoot()
  if (!root) return []
  const all = root.querySelectorAll('div,section,article')
  const matches = []
  for (let i = 0; i < all.length && matches.length < 80; i++) {
    const el = all[i]
    if (el.closest('[data-presentation-ignore]')) continue
    // never re-wrap something that's already a registered Card, or a floating
    // popover/menu/dropdown/toast sitting open on top of the page (position:
    // fixed content isn't part of the page's own content flow)
    if (excludeNodes && excludeNodes.some(n => n === el || (n && n.contains && n.contains(el)))) continue
    const rect = el.getBoundingClientRect()
    // 110px excluded a real KPI strip (confirmed live on Team Mapping: its
    // whole 5-tile "Total People / Active / Sales Groups / ..." row is 102px
    // tall) -- a strip that wide is exactly the kind of section worth its
    // own slide, not the small pill/badge/button this threshold exists to
    // filter out, so it comes down to a floor that still excludes those.
    if (rect.width < 280 || rect.height < 80) continue
    const cs = getComputedStyle(el)
    if (cs.position === 'fixed' || cs.position === 'absolute') continue
    const radius = parseFloat(cs.borderRadius) || 0
    if (radius < 8) continue
    // most of this app's card treatments pair rounded corners with a real
    // shadow, but several pages (confirmed live: Meta Ads) instead frame a
    // section with just a border and no shadow at all -- either is accepted
    // as this app's card signature; a rounded corner with NEITHER is too
    // weak a signal on its own (could be a button, a pill, a badge).
    const hasShadow = cs.boxShadow && cs.boxShadow !== 'none'
    const hasBorder = parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none'
    if (!hasShadow && !hasBorder) continue
    matches.push(el)
  }
  // keep only the outermost card in any nested chain, and cap what a
  // slideshow can reasonably hold
  const top = matches.filter(el => !matches.some(other => other !== el && other.contains(el)))
  return top.slice(0, 30).map((node, i) => {
    const headingEl = node.querySelector('h1,h2,h3,h4') || node.querySelector('[class*="title" i]')
    let title = headingEl && headingEl.textContent ? headingEl.textContent.trim() : ''
    if (!title) {
      const firstText = node.querySelector('div,span,p')
      title = ((firstText && firstText.textContent) || '').trim()
    }
    return { id: 'auto-' + i, title: title ? humanizeTitle(title) : ('Section ' + (i + 1)), node }
  })
}

function byDocumentOrder(a, b) {
  if (!a.node || !b.node || a.node === b.node) return 0
  const pos = a.node.compareDocumentPosition(b.node)
  if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1
  if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1
  return 0
}

// position:fixed is supposed to escape any ancestor and cover the viewport,
// but per spec ANY ancestor with a transform/filter/perspective/will-change
// (even an inert identity transform left behind by a finished page-enter
// animation -- confirmed live on the app's own route-transition wrapper)
// becomes the containing block instead, so "inset: 6vh 7vw" resolves against
// that ancestor's box, not the viewport -- the elevated slide collapses to a
// sliver wherever it sits. Rather than migrate to a React portal (which
// would unmount/remount the slide's own children every time presenting
// starts/stops, losing e.g. a table's live sort/filter state), this walks up
// and neutralizes whichever ancestor is doing it for as long as we're
// presenting, restoring the exact inline value it had before.
export function neutralizeContainingBlockAncestors(node) {
  const touched = []
  let el = node && node.parentElement
  while (el && el !== document.body) {
    const cs = getComputedStyle(el)
    const makesContainingBlock = (cs.transform && cs.transform !== 'none')
      || (cs.filter && cs.filter !== 'none')
      || (cs.perspective && cs.perspective !== 'none')
      || (cs.willChange && /transform|filter|perspective/.test(cs.willChange))
      || (cs.contain && /layout|paint|strict|content/.test(cs.contain))
    if (makesContainingBlock) {
      // Confirmed live: on the app's home page the offending ancestor's
      // transform was still a live, moving value (a translateY mid-flight),
      // not an inert leftover -- its page-enter @keyframes animation was
      // STILL RUNNING, and a running CSS animation overrides an inline
      // style on the exact property it's animating every single frame, so
      // "el.style.transform = 'none'" alone was being silently clobbered
      // 60 times a second. Cancelling the animation itself is what actually
      // stops it from fighting back.
      touched.push({ el, transform: el.style.transform, filter: el.style.filter, willChange: el.style.willChange, contain: el.style.contain, animation: el.style.animation })
      el.style.animation = 'none'
      el.style.transform = 'none'
      el.style.filter = 'none'
      el.style.willChange = 'auto'
      el.style.contain = 'none'
    }
    el = el.parentElement
  }
  return () => {
    touched.forEach(t => {
      t.el.style.animation = t.animation
      t.el.style.transform = t.transform
      t.el.style.filter = t.filter
      t.el.style.willChange = t.willChange
      t.el.style.contain = t.contain
    })
  }
}

export function PresentationProvider({ children }) {
  const location = useLocation()
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
  // waiting a render. Registered (Card) slides are always kept; the DOM scan
  // only fills in whatever ISN'T already a registered Card, and the two are
  // merged back into real document order rather than "all Cards, then
  // whatever else" -- so a page that mixes both reads top-to-bottom.
  const refreshAuto = useCallback(() => {
    const registeredNodes = slidesRef.current.map(s => s.node).filter(Boolean)
    const found = scanAutoSlides(registeredNodes)
    setAutoSlides(found)
    return slidesRef.current.length + found.length
  }, [])

  const registeredCount = slidesRef.current.length
  const slides = useMemo(() => {
    if (!autoSlides.length) return slidesRef.current
    return [...slidesRef.current, ...autoSlides].sort(byDocumentOrder)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideVersion, autoSlides])
  const usingAuto = autoSlides.length > 0
  const usingMixed = usingAuto && registeredCount > 0

  const start = useCallback(() => { setIndex(0); setPresenting(true) }, [])
  const stop = useCallback(() => { setPresenting(false); setAutoSlides([]) }, [])
  const next = useCallback(() => setIndex(i => Math.min(i + 1, Math.max(0, slides.length - 1))), [slides.length])
  const prev = useCallback(() => setIndex(i => Math.max(i - 1, 0)), [])
  const goTo = useCallback((i) => setIndex(i), [])

  // A page navigation (sidebar click, back/forward, a route-level redirect)
  // never used to stop an active presentation -- the overlay just kept
  // floating over whatever page loaded next, still holding the OLD page's
  // slide list with no way to reach it (the backdrop didn't block clicks
  // either, which is its own fix below, but this is the real fix: a deck
  // this page's node references can never make sense of on another route).
  const pathKey = location.pathname + location.search
  const firstPathKey = useRef(pathKey)
  useEffect(() => {
    if (pathKey === firstPathKey.current) return
    firstPathKey.current = pathKey
    setPresenting(false)
    setAutoSlides([])
  }, [pathKey])

  const value = useMemo(() => ({
    slides, slideVersion, usingAuto, usingMixed, registeredCount, register, updateNode, unregister, refreshAuto,
    presenting, start, stop, index, next, prev, goTo,
  }), [slides, slideVersion, usingAuto, usingMixed, registeredCount, register, updateNode, unregister, refreshAuto, presenting, start, stop, index, next, prev, goTo])

  return <PresentationContext.Provider value={value}>{children}</PresentationContext.Provider>
}

// Safe to call with no Provider present (returns a no-op registry) -- so a
// stray Card rendered outside the tree (there shouldn't be one, but nothing
// should crash if there is) just never registers, rather than throwing.
export function usePresentation() {
  return useContext(PresentationContext) || {
    slides: [], slideVersion: 0, usingAuto: false, usingMixed: false, registeredCount: 0,
    register: () => null, updateNode: () => {}, unregister: () => {}, refreshAuto: () => 0,
    presenting: false, start: () => {}, stop: () => {}, index: 0, next: () => {}, prev: () => {}, goTo: () => {},
  }
}
