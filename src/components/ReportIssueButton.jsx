import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { toast } from './ToastHost'

const NAVY = '#1F3C84'
const BLUE = '#1C9FD4'

// Floating "Report an issue" button, available on every page. Files directly into
// GitHub Issues via api/github-issue.mjs (kept server-side since it needs a token) --
// gives any user a way to flag a problem from wherever they noticed it, instead of a
// Slack message that gets lost. Positioned bottom-left so it never overlaps
// SnapshotTool's bottom-right camera FAB.
export default function ReportIssueButton() {
  const { user } = useAuth()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  if (!user) return null

  const submit = async () => {
    const description = text.trim()
    if (!description) return
    setBusy(true)
    try {
      const r = await fetch('/api/github-issue', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, page: location.pathname + location.search, url: window.location.href }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed to file issue')
      toast('Reported — issue #' + data.number + ' created', { type: 'success' })
      setText('')
      setOpen(false)
    } catch (e) {
      toast(e.message || 'Could not file the issue', { type: 'muted' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div data-snapshot-ignore="true" style={{ position: 'fixed', left: 22, bottom: 22, zIndex: 9999, fontFamily: "'Plus Jakarta Sans','Inter',sans-serif" }}>
      {open && (
        <div style={{ position: 'absolute', bottom: 56, left: 0, width: 300, background: '#fff', border: '1px solid #E6EAF2', borderRadius: 14, boxShadow: '0 16px 40px rgba(15,31,75,0.20)', padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0F1B33', marginBottom: 8 }}>Report an issue</div>
          <textarea
            autoFocus
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="What's wrong? e.g. 'CPL on this page looks off for July'"
            rows={4}
            style={{ width: '100%', resize: 'vertical', padding: '8px 10px', borderRadius: 8, border: '0.5px solid #E2E8F0', fontSize: 12.5, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
          />
          <div style={{ fontSize: 10.5, color: '#94A3B8', margin: '6px 0 10px' }}>Filed as a GitHub issue with this page + your account attached automatically.</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setOpen(false)} style={{ padding: '6px 12px', borderRadius: 7, border: '0.5px solid #E2E8F0', background: '#fff', color: '#6B7280', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            <button type="button" onClick={submit} disabled={busy || !text.trim()} style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: busy || !text.trim() ? '#94A3B8' : `linear-gradient(135deg, ${NAVY}, ${BLUE})`, color: '#fff', fontSize: 12, fontWeight: 700, cursor: busy || !text.trim() ? 'default' : 'pointer' }}>{busy ? 'Sending...' : 'Send'}</button>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        title="Report an issue"
        style={{ width: 44, height: 44, borderRadius: '50%', cursor: 'pointer', background: open ? '#fff' : `linear-gradient(135deg, ${NAVY}, ${BLUE})`, color: open ? NAVY : '#fff', boxShadow: '0 8px 22px rgba(31,60,132,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: open ? `1px solid ${NAVY}33` : 'none' }}
      >
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22V4a2 2 0 012-2h9l5 5v9a2 2 0 01-2 2H6a2 2 0 01-2-2z"/><path d="M14 2v5h5"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>
      </button>
    </div>
  )
}
