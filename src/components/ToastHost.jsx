import React, { useEffect, useState, useCallback } from 'react'

// Lightweight global toast system. Decoupled via a window CustomEvent so any
// module can fire a toast without prop drilling or context:
//   import { toast } from './components/ToastHost'
//   toast('Saved', { type: 'success' })
// Presentational only — no data or backend changes. Brand palette only
// (navy/blue/cyan/green); slate for neutral/negative. Never amber/red.

const NAVY = '#1F3C84'
const BLUE = '#1C9FD4'
const GREEN = '#4CAE6F'
const SLATE = '#647488'

const TONES = {
  success: { bar: GREEN, label: 'Done' },
  info: { bar: BLUE, label: 'Info' },
  neutral: { bar: NAVY, label: '' },
  muted: { bar: SLATE, label: '' },
}

const EVT = 'quantum:toast'
let SEQ = 0

export function toast(message, opts = {}) {
  if (typeof window === 'undefined') return
  const detail = {
    id: ++SEQ,
    message: String(message == null ? '' : message),
    type: TONES[opts.type] ? opts.type : 'neutral',
    duration: typeof opts.duration === 'number' ? opts.duration : 3800,
  }
  window.dispatchEvent(new CustomEvent(EVT, { detail }))
}

export default function ToastHost() {
  const [items, setItems] = useState([])

  const remove = useCallback((id) => {
    setItems((list) => list.filter((t) => t.id !== id))
  }, [])

  useEffect(() => {
    const onToast = (e) => {
      const t = e && e.detail
      if (!t || !t.message) return
      setItems((list) => [...list.slice(-3), t])
      if (t.duration > 0) {
        setTimeout(() => remove(t.id), t.duration)
      }
    }
    window.addEventListener(EVT, onToast)
    return () => window.removeEventListener(EVT, onToast)
  }, [remove])

  if (items.length === 0) return null

  return (
    <div
      style={{
        position: 'fixed', top: 18, right: 18, zIndex: 10000,
        display: 'flex', flexDirection: 'column', gap: 10,
        pointerEvents: 'none', maxWidth: 360,
      }}>
      <style>{'@keyframes qtoastIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}'}</style>
      {items.map((t) => {
        const tone = TONES[t.type] || TONES.neutral
        return (
          <div
            key={t.id}
            role="status"
            style={{
              pointerEvents: 'auto',
              display: 'flex', alignItems: 'flex-start', gap: 10,
              background: '#fff', color: '#0F1B33',
              border: '1px solid #E3E8F2', borderLeft: '3px solid ' + tone.bar,
              borderRadius: 10, padding: '11px 12px 11px 13px',
              boxShadow: '0 6px 22px rgba(31,60,132,0.16)',
              fontSize: 13, lineHeight: 1.4, fontWeight: 500,
              animation: 'qtoastIn 0.18s ease',
            }}>
            <span style={{ flex: 1 }}>{t.message}</span>
            <button
              type="button"
              onClick={() => remove(t.id)}
              aria-label="Dismiss"
              style={{
                border: 'none', background: 'transparent', cursor: 'pointer',
                color: SLATE, fontSize: 15, lineHeight: 1, padding: 0,
                marginTop: 1, fontWeight: 600,
              }}>{'\u00d7'}</button>
          </div>
        )
      })}
    </div>
  )
}
