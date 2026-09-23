// Every dashboard page mounts its own <Sidebar/> instance (see App.jsx's
// per-route `key={pathname}` wrapper), so the sidebar's <nav> is destroyed and
// recreated on every navigation -- a fresh DOM node always starts at
// scrollTop=0. This module is a tiny cross-mount memory: it survives for the
// life of the page (module state, not component state) so a new <nav> can
// restore the previous one's scroll offset before the browser ever paints it,
// instead of visibly resetting to the top and (at best) snapping back down.
const STORAGE_KEY = 'lq_sidebar_nav_scroll'

let memScroll = 0
try {
  const stored = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(STORAGE_KEY) : null
  if (stored) memScroll = parseInt(stored, 10) || 0
} catch { /* sessionStorage unavailable (private mode etc) -- memory-only fallback */ }

let writeScheduled = false

export function getSidebarScroll() {
  return memScroll
}

export function setSidebarScroll(value) {
  memScroll = value
  if (writeScheduled) return
  writeScheduled = true
  // Throttle the persisted (sessionStorage) copy to one write per frame --
  // memScroll itself updates every call so a same-session remount always
  // sees the latest value instantly, with no read cost at all.
  requestAnimationFrame(() => {
    writeScheduled = false
    try { sessionStorage.setItem(STORAGE_KEY, String(memScroll)) } catch { /* ignore */ }
  })
}
