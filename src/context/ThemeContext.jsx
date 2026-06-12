// src/context/ThemeContext.jsx
// Auto dark mode: 8 PM – 7 AM IST (UTC+5:30). Manual toggle overrides.
import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const ThemeContext = createContext({ theme: 'light', toggle: () => {}, auto: true })

export function useTheme() { return useContext(ThemeContext) }

function getISTHour() {
  // IST = UTC + 5:30
  const now = new Date()
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000
  const istMs = utcMs + (5.5 * 3600000)
  return new Date(istMs).getHours()
}

function shouldBeDark() {
  const h = getISTHour()
  return h >= 20 || h < 7  // 8 PM to 7 AM IST
}

const STORAGE_KEY = 'lq_theme_override' // 'light' | 'dark' | null (auto)

export function ThemeProvider({ children }) {
  const [override, setOverride]   = useState(() => localStorage.getItem(STORAGE_KEY))
  const [autoDark, setAutoDark]   = useState(shouldBeDark)

  // Re-check auto every minute
  useEffect(() => {
    const tick = () => setAutoDark(shouldBeDark())
    const id = setInterval(tick, 60000)
    return () => clearInterval(id)
  }, [])

  const theme = override || (autoDark ? 'dark' : 'light')
  const isAuto = !override

  // Apply to <html> data-theme attribute
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    // also store for persistence
    if (override) localStorage.setItem(STORAGE_KEY, override)
  }, [theme, override])

  const toggle = useCallback(() => {
    setOverride(prev => {
      const next = prev === 'dark' ? 'light' : prev === 'light' ? null : (autoDark ? 'light' : 'dark')
      if (next === null) localStorage.removeItem(STORAGE_KEY)
      else localStorage.setItem(STORAGE_KEY, next)
      return next
    })
  }, [autoDark])

  return (
    <ThemeContext.Provider value={{ theme, toggle, auto: isAuto, autoDark }}>
      {children}
    </ThemeContext.Provider>
  )
}
