import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PAGE_TITLES } from './pageTitles'

// Real browser-tab behaviour, built on top of the instant-revisit caching already
// shipped app-wide (sessionLoad.js) -- each dashboard you visit becomes a tab in
// the bar at the top; clicking between tabs just changes the route (React Router
// still only ever mounts one page at a time), and the already-cached data is what
// makes the switch feel instant, not a second, heavier "keep everything mounted"
// mechanism. See docs/PAGE_LOADING_STANDARD.md for the caching half of this.
const STORAGE_KEY = 'lq_open_tabs_v1'
const MAX_TABS = 8

// /settings and its two /settings/reports/* sub-routes all render one continuous
// SettingsPage tree (see App.jsx's own ProtectedRoute stableKey comment) -- treated
// as ONE tab, not three, for the same reason.
function tabKeyFor(pathname) {
  return pathname.startsWith('/settings') ? '/settings' : pathname
}

function labelFor(pathname) {
  return PAGE_TITLES[tabKeyFor(pathname)] || PAGE_TITLES[pathname] || 'Page'
}

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter(t => t && t.key && t.path) : []
  } catch (_) {
    return []
  }
}

function persist(tabs) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs)) } catch (_) { /* quota/disabled -- ignore */ }
}

const TabsContext = createContext(null)

export function TabsProvider({ children }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [tabs, setTabs] = useState(loadPersisted)

  // Keep the current route's own tab in sync on every navigation: add it if it's
  // new (appended at the end, so tab ORDER is "the order you opened them," never
  // reshuffled by revisiting one -- matching real browser tabs), or if it already
  // exists, just refresh its stored full path (so a sub-tab/query-string change,
  // e.g. Meta Ads' own Campaigns -> Creatives, is remembered) and its
  // last-visited stamp in place, without moving it.
  useEffect(() => {
    if (location.pathname === '/login') return
    const key = tabKeyFor(location.pathname)
    const fullPath = location.pathname + location.search
    const label = labelFor(location.pathname)
    const now = Date.now()
    setTabs(prev => {
      const idx = prev.findIndex(t => t.key === key)
      let next
      if (idx === -1) {
        next = [...prev, { key, path: fullPath, label, lastVisitedAt: now }]
        // Evict the single least-recently-visited tab beyond the cap -- never the
        // one just opened, which is by definition the most recent.
        if (next.length > MAX_TABS) {
          const rest = next.slice(0, -1)
          const oldest = rest.reduce((a, b) => (a.lastVisitedAt < b.lastVisitedAt ? a : b))
          next = next.filter(t => t.key !== oldest.key)
        }
      } else {
        next = prev.map((t, i) => (i === idx ? { ...t, path: fullPath, label, lastVisitedAt: now } : t))
      }
      persist(next)
      return next
    })
  }, [location.pathname, location.search])

  const activeKey = tabKeyFor(location.pathname)

  const activateTab = useCallback(tab => { navigate(tab.path) }, [navigate])

  const closeTab = useCallback(key => {
    setTabs(prev => {
      const next = prev.filter(t => t.key !== key)
      persist(next)
      if (key === activeKey) {
        // Closing the tab you're currently on -- land on whichever remaining tab
        // was visited most recently, same as a browser jumping to the next tab
        // over when you close the active one. Falls back to Summary if that was
        // the last tab open.
        const fallback = next.slice().sort((a, b) => b.lastVisitedAt - a.lastVisitedAt)[0]
        navigate(fallback ? fallback.path : '/')
      }
      return next
    })
  }, [activeKey, navigate])

  const value = useMemo(() => ({ tabs, activeKey, activateTab, closeTab }), [tabs, activeKey, activateTab, closeTab])

  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>
}

export function useTabs() {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error('useTabs must be used inside TabsProvider')
  return ctx
}
