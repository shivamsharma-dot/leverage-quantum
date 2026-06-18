// src/components/CommandPalette.jsx
// Cmd/Ctrl+K command palette — fast keyboard-driven navigation across the app.
// Self-contained: listens for the global shortcut, renders an overlay with a
// fuzzy-ish filtered list of destinations, supports arrow-key + Enter navigation,
// Esc / backdrop click to close. Presentational only — no data or backend changes.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

const FONT = "'Plus Jakarta Sans', sans-serif"

// Brand palette (data-safe): navy / blue / cyan / green; slate for muted.
const NAVY = '#1F3C84'
const SLATE = '#64748B'

// Navigation destinations. Keep labels in sync with the app's PAGE_TITLES.
const NAV_ITEMS = [
  { label: 'Summary',            path: '/',                       keywords: 'home dashboard overview' },
  { label: 'Meta Ads',           path: '/dashboard/meta-ads',     keywords: 'facebook instagram creatives campaigns spend' },
  { label: 'Google Ads',         path: '/dashboard/google-ads',   keywords: 'search pmax keywords clicks' },
  { label: 'ROAS',               path: '/dashboard/roas',         keywords: 'return ad spend revenue' },
  { label: 'MTD',                path: '/dashboard/mtd',          keywords: 'month to date cpl cpql' },
  { label: 'Lead Quality',       path: '/dashboard/lead-quality', keywords: 'funnel conversion source' },
  { label: 'Channel Mix',        path: '/dashboard/channel-mix',  keywords: 'allocation paid organic affiliate' },
  { label: 'Revenue',            path: '/dashboard/revenue',      keywords: 'ac vas collected projected' },
  { label: 'QL Ops',             path: '/dashboard/lq-ops',       keywords: 'lead qualification futwork superbot' },
  { label: 'Referral',           path: '/dashboard/referral',     keywords: 'employee student offers applications' },
  { label: 'WhatsApp',           path: '/dashboard/whatsapp',     keywords: 'messages templates delivered read' },
  { label: 'Ask AI',             path: '/ask-ai',                 keywords: 'assistant question chat insights' },
  { label: 'Settings',           path: '/settings',               keywords: 'preferences account config' },
]

export default function CommandPalette() {
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  // Global shortcut: Cmd+K (mac) / Ctrl+K (win/linux). Esc closes.
  useEffect(() => {
    const onKey = (e) => {
      const key = (e.key || '').toLowerCase()
      if ((e.metaKey || e.ctrlKey) && key === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      } else if (key === 'escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Reset state each time it opens; focus the input.
  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      // focus after paint
      const t = setTimeout(() => inputRef.current && inputRef.current.focus(), 0)
      return () => clearTimeout(t)
    }
  }, [open])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return NAV_ITEMS
    return NAV_ITEMS.filter((it) =>
      it.label.toLowerCase().includes(q) || (it.keywords || '').includes(q)
    )
  }, [query])

  // Keep active index within bounds when results change.
  useEffect(() => {
    setActive((a) => (a >= results.length ? 0 : a))
  }, [results.length])

  const go = (item) => {
    if (!item) return
    setOpen(false)
    if (item.path !== location.pathname) navigate(item.path)
  }

  const onInputKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(results[active])
    }
  }

  // Scroll active row into view.
  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.querySelector('[data-active="true"]')
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  if (!open) return null

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '12vh', fontFamily: FONT,
        animation: 'qcpFade 120ms ease-out',
      }}
    >
      <style>{`@keyframes qcpFade{from{opacity:0}to{opacity:1}}@keyframes qcpPop{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div
        role="dialog"
        aria-label="Command palette"
        style={{
          width: 'min(560px, 92vw)', background: '#fff', borderRadius: 16,
          border: '1px solid #EEF1F6', overflow: 'hidden',
          boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 24px 56px -20px rgba(16,24,40,0.30)',
          animation: 'qcpPop 140ms ease-out',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid #F1F4F9' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={SLATE} strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0) }}
            onKeyDown={onInputKey}
            placeholder="Jump to a dashboard…"
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15, fontFamily: FONT, color: '#0F1B33', background: 'transparent' }}
          />
          <kbd style={{ fontSize: 11, color: SLATE, border: '1px solid #E2E8F0', borderRadius: 6, padding: '2px 6px', background: '#F8FAFC' }}>Esc</kbd>
        </div>

        <div ref={listRef} style={{ maxHeight: 360, overflowY: 'auto', padding: 8 }}>
          {results.length === 0 ? (
            <div style={{ padding: '28px 18px', textAlign: 'center', color: SLATE, fontSize: 13.5 }}>
              No matches for “{query}”
            </div>
          ) : (
            results.map((it, i) => {
              const isActive = i === active
              return (
                <div
                  key={it.path}
                  data-active={isActive ? 'true' : 'false'}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => { e.preventDefault(); go(it) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '11px 12px', borderRadius: 10, cursor: 'pointer',
                    background: isActive ? '#E8EFF9' : 'transparent',
                    transition: 'background 90ms ease',
                  }}
                >
                  <span style={{
                    width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                    background: isActive ? NAVY : '#F1F5F9',
                    color: isActive ? '#fff' : SLATE,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 800,
                  }}>{it.label.charAt(0)}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#0F1B33', flex: 1 }}>{it.label}</span>
                  {location.pathname === it.path && (
                    <span style={{ fontSize: 11, color: NAVY, fontWeight: 700 }}>current</span>
                  )}
                  {isActive && location.pathname !== it.path && (
                    <span style={{ fontSize: 11, color: SLATE }}>↵</span>
                  )}
                </div>
              )
            })
          )}
        </div>

        <div style={{ padding: '9px 16px', borderTop: '1px solid #F1F4F9', display: 'flex', gap: 14, color: SLATE, fontSize: 11.5 }}>
          <span>↑↓ navigate</span><span>↵ open</span><span>⌘/Ctrl K toggle</span>
        </div>
      </div>
    </div>
  )
}
