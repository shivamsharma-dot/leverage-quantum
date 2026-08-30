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

// A leaf element's own text is the only safe fallback title. The earlier
// "first text-bearing element" attempt produced run-ons like
// "Total People3,397 - Lead - Squared, real-time" because it read a
// CONTAINER's textContent, which glues a label, its value and its subtitle
// together; a leaf has no children to glue, so the worst case degrades to a
// single clean-but-wrong label instead of a garbled one. Restricting the
// source to real headings instead (the previous attempt) cost every title on
// Summary and 4 of 5 on Revenue, whose local cards render their titles as
// plain divs -- 9 auto slides read "Section N" with a perfectly good name
// sitting one element inside them.
const TABLEISH = 'table,thead,tbody,tfoot,tr,th,td,[role="table"],[role="grid"],[role="row"],[role="columnheader"],[role="gridcell"]'
const NOTICE_RE = /(warning|alert|notice|callout|banner|toast|snackbar|tooltip)/i

// Rejects values, not labels: "1.65 Cr", "3,397", "-26.0%" are what a KPI
// tile leads with, and none of them describe the section.
function isTitleish(t) {
  if (!t || t.length < 2 || t.length > 60) return false
  if (!/[A-Za-z]{2}/.test(t)) return false
  if (/^[\u20B9$\u20AC\u00A3]?\s*[\d.,]+\s*(cr|lac|lakh|k|m|bn?|%)?$/i.test(t)) return false
  return true
}

// A column header repeats down its own column, so its class occurs once per
// row inside the card -- which is how the Meta Ads table talked itself into
// the title "Campaign - Corridor - Status - Signal - Spend...".
function repeatsInCard(card, el) {
  const cls = String(el.className || '').trim()
  if (!cls) return false
  try {
    return card.querySelectorAll('.' + cls.split(/\s+/).join('.')).length >= 5
  } catch (e) {
    return false
  }
}

function leafTitle(card) {
  const all = card.querySelectorAll('*')
  const lim = all.length < 400 ? all.length : 400
  for (let i = 0; i < lim; i++) {
    const el = all[i]
    if (el.children.length) continue
    if (el.closest(TABLEISH)) continue
    if (repeatsInCard(card, el)) continue
    if (sharesRowWith(card, el)) continue
    const t = (el.textContent || '').replace(/\s+/g, ' ').trim()
    if (isTitleish(t)) return t
  }
  return ''
}

// A KPI/metric strip is ONE section, not N, and naming it after its first
// tile ("Total People") actively misdescribes the other four.
function isMetricStrip(node, rect) {
  // Layout, not content: an earlier content test (every tile must contain a
  // digit) silently failed whenever the scan ran before the KPI values had
  // loaded, and Google Ads' 8-tile band wraps onto two rows.
  const kids = node.children
  if (kids.length < 3 || rect.height > 220) return false
  const w0 = kids[0].getBoundingClientRect().width
  if (!w0 || w0 > rect.width * 0.45) return false
  for (let i = 1; i < kids.length; i++) {
    if (Math.abs(kids[i].getBoundingClientRect().width - w0) > 2) return false
  }
  return true
}

// A card title sits alone, or above a subtitle; a table's column header row
// has many texts sharing one baseline. Meta Ads' grid is built from divs with
// no <th> and no class on the header cells, so neither the tableish selector
// nor the repeated-class check catches it -- this is what stops that card
// from titling itself "Campaign".
function sharesRowWith(card, el) {
  const top = el.getBoundingClientRect().top
  const all = card.querySelectorAll('*')
  const lim = all.length < 300 ? all.length : 300
  let n = 0
  for (let i = 0; i < lim; i++) {
    const o = all[i]
    if (o === el || o.children.length) continue
    if (!(o.textContent || '').trim()) continue
    if (Math.abs(o.getBoundingClientRect().top - top) <= 6) n++
    if (n >= 4) return true
  }
  return false
}

// 0 = not a card, walk into it. 1 = card, present it and never look inside.
// 2 = not page content at all, skip the whole subtree.
function classifyNode(el, excludeNodes, small) {
  if (el.hasAttribute('data-presentation-ignore')) return 2
  // never re-wrap something that's already a registered Card
  if (excludeNodes && excludeNodes.some(n => n === el || (n && n.contains && n.contains(el)))) return 2
  // an advisory strip is not a section: Revenue's "Unidentified Source
  // Revenue" warning is 65px tall on desktop (under the floor) but wraps past
  // it at phone widths, where it turned into a 90%-empty slide.
  const role = el.getAttribute('role')
  if (role === 'alert' || role === 'status') return 2
  if (NOTICE_RE.test(String(el.className || ''))) return 2
  const tag = el.tagName
  if (tag !== 'DIV' && tag !== 'SECTION' && tag !== 'ARTICLE') return 0
  const rect = el.getBoundingClientRect()
  if (rect.width < 120 || rect.height < 70) return 0
  const cs = getComputedStyle(el)
  // a floating popover/menu/dropdown/toast is not part of the page's own
  // content flow, and neither is anything inside it
  if (cs.position === 'fixed') return 2
  if (cs.position === 'absolute') {
    const z = parseInt(cs.zIndex, 10)
    if (z >= 100 || role === 'dialog' || role === 'menu' || role === 'listbox') return 2
    return 0
  }
  if ((parseFloat(cs.borderRadius) || 0) < 8) return 0
  // most of this app's card treatments pair rounded corners with a real
  // shadow, but several pages (confirmed live: Meta Ads) instead frame a
  // section with just a border and no shadow -- either is accepted as the
  // card signature; a rounded corner with NEITHER is too weak a signal on its
  // own (could be a button, a pill, a badge).
  const hasShadow = cs.boxShadow && cs.boxShadow !== 'none'
  const hasBorder = parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none'
  if (!hasShadow && !hasBorder) return 0
  // 280x80 is the floor for a section worth its own slide (Team Mapping's
  // 5-tile KPI row is 951x120 and clears it). A tile that carries the card
  // signature but sits under the floor is held back for strip promotion.
  if (rect.width >= 280 && rect.height >= 80) return 1
  small.push(el)
  return 0
}

function scanAutoSlides(excludeNodes) {
  if (AUTO_SCAN_DENYLIST.some(p => window.location.pathname.startsWith(p))) return []
  const root = findContentRoot()
  if (!root) return []
  const matches = []
  const small = []
  // Explicit DFS rather than querySelectorAll('div,section,article'): only the
  // outermost card in a chain is ever presented, so there is no reason to walk
  // into one once it matches -- and not walking in is what makes this cheap on
  // Meta Ads, where the single matching card holds ~7,000 of the page's ~7,900
  // elements and the flat scan cost 58ms of layout on every Present click.
  const stack = []
  for (let i = root.children.length - 1; i >= 0; i--) stack.push(root.children[i])
  while (stack.length && matches.length < 80) {
    const el = stack.pop()
    const verdict = classifyNode(el, excludeNodes, small)
    if (verdict === 1) { matches.push(el); continue }
    if (verdict === 2) continue
    for (let i = el.children.length - 1; i >= 0; i--) stack.push(el.children[i])
  }
  // Promote a ROW of under-floor tiles to one slide. Meta Ads' header band is
  // 5 x 188px tiles inside a container carrying no card styling at all, so the
  // entire band was absent from the deck; Summary's 4-tile band is the same
  // shape. Team Mapping's band already clears the floor on its own.
  const tried = []
  const promoted = []
  for (let i = 0; i < small.length; i++) {
    const p = small[i].parentElement
    if (!p || tried.indexOf(p) !== -1) continue
    tried.push(p)
    let n = 0
    for (let j = 0; j < p.children.length; j++) {
      if (small.indexOf(p.children[j]) !== -1) n++
    }
    if (n < 3) continue
    if (matches.some(m => m === p || m.contains(p) || p.contains(m))) continue
    const pr = p.getBoundingClientRect()
    if (pr.width < 280 || pr.height < 80) continue
    promoted.push(p)
    matches.push(p)
  }
  // promoted parents are appended out of order, so sort before numbering
  const top = matches.filter(el => !matches.some(other => other !== el && other.contains(el)))
  top.sort((a, b) => byDocumentOrder({ node: a }, { node: b }))
  return top.slice(0, 30).map((node, i) => {
    const rect = node.getBoundingClientRect()
    const headingEl = node.querySelector('h1,h2,h3,h4,h5,h6,[role="heading"]')
    const heading = headingEl && headingEl.textContent ? headingEl.textContent.trim() : ''
    let title = heading
    if (!title && (promoted.indexOf(node) !== -1 || isMetricStrip(node, rect))) title = 'Key metrics'
    if (!title) title = leafTitle(node)
    // an honest placeholder still beats a confident-looking wrong answer
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
