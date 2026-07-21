import { useState, useEffect, useCallback } from 'react'

// Shared "pick a design variant, applies everywhere instantly" system.
// Three independently selectable variants: the Button component, the shared
// KPI card, and the Login page layout. Each is just an integer id persisted
// to localStorage; every mounted component listening via useDesignStyle()
// re-renders the instant any one of them changes anywhere in the app --
// mirrors the existing 'lq:sidebar-mode-changed' / 'lq:hidden-pages-changed'
// same-tab CustomEvent pattern already used elsewhere in this codebase
// (localStorage's own 'storage' event only fires cross-tab, never same-tab).

export const DESIGN_EVENT = 'lq:design-style-changed'

export const DESIGN_KEYS = {
  button: 'lq_button_style',
  kpi: 'lq_kpi_style',
  login: 'lq_login_style',
}

// Current live defaults -- whatever is actually shipped today, so switching
// this system on never changes anyone's screen until they pick something else.
export const DESIGN_DEFAULTS = {
  button: 10, // "Embossed premium" -- already the one real Button.jsx style
  kpi: 2,     // Gradient-accent + icon chip -- closest to the existing PremKPI look
  login: 1,   // Minimal centered card -- matches the current LoginPage.jsx
}

export function getDesignStyle(kind) {
  try {
    const raw = localStorage.getItem(DESIGN_KEYS[kind])
    const n = raw != null ? parseInt(raw, 10) : NaN
    return Number.isFinite(n) ? n : DESIGN_DEFAULTS[kind]
  } catch {
    return DESIGN_DEFAULTS[kind]
  }
}

export function setDesignStyle(kind, value) {
  try { localStorage.setItem(DESIGN_KEYS[kind], String(value)) } catch { /* ignore */ }
  try {
    window.dispatchEvent(new CustomEvent(DESIGN_EVENT, { detail: { kind, value } }))
  } catch { /* ignore */ }
}

// Applies a value that just arrived from Supabase (via /api/preferences) to this
// tab's localStorage cache + live listeners, WITHOUT re-POSTing it back to the
// server -- used by AuthProvider's initial prefs fetch so every signed-in user's
// browser picks up the org-wide style, not just the admin who set it.
export function applyRemoteDesignStyle(kind, value) {
  if (value == null) return
  setDesignStyle(kind, value)
}

// Persists a pick to Supabase (app_preferences, same table/pattern as hidden_pages)
// so it applies for every signed-in user, not just this browser. Admin-only on the
// server; the Appearance tab that calls this is already admin-gated client-side.
// Falls back to a local-only apply (with a toast) if the write fails, so the picker
// still visibly responds instead of looking broken.
export async function saveDesignStyle(kind, value) {
  try {
    const r = await fetch('/api/preferences', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: DESIGN_KEYS[kind], value }),
    })
    if (!r.ok) {
      const data = await r.json().catch(() => ({}))
      throw new Error(data.error || 'Save failed')
    }
    setDesignStyle(kind, value)
    return { success: true }
  } catch (e) {
    setDesignStyle(kind, value) // still apply locally so the picker isn't unresponsive
    return { success: false, error: e.message }
  }
}

// React hook: any component (Button, KPICard, LoginPage, the Settings picker
// itself) calls this to get the live-updating current variant id for a kind.
export function useDesignStyle(kind) {
  const [value, setValue] = useState(() => getDesignStyle(kind))

  const handler = useCallback((e) => {
    if (e.detail && e.detail.kind === kind) setValue(e.detail.value)
  }, [kind])

  useEffect(() => {
    window.addEventListener(DESIGN_EVENT, handler)
    return () => window.removeEventListener(DESIGN_EVENT, handler)
  }, [handler])

  return value
}
