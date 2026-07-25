import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth'
import Sidebar from '../components/Sidebar'
import Button from '../components/Button'
import { DashboardSkeleton } from '../components/SkeletonLoader'
import { C, FONT, Card } from '../ui/dashboardKit'

const SB_URL = 'https://tsyekthwthxszmsgqfej.supabase.co'
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzeWVrdGh3dGh4c3ptc2dxZmVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NjkzMDIsImV4cCI6MjA5NTM0NTMwMn0.bdM9h5c3PDu9hgggjBdbA-eb7kfF-79c6txOnCUxRhY'
const SBH = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
async function sbGet(t, q = '') { try { const r = await fetch(`${SB_URL}/rest/v1/${t}${q}`, { headers: SBH }); return r.ok ? r.json() : [] } catch { return [] } }

// AGENTS registry mirrors api/ask-ai.js's own AGENTS map -- only the presentational
// bits (label/description/schedule) live here; the actual prompt/logic lives server-side.
const AGENTS = [
  { id: 'marketing_performance', label: 'Marketing Performance Agent', description: 'Compares the last 7 days of Total QL against the prior 7 days, ranks the campaigns driving the change, and recommends one prioritized action.', schedule: 'Daily at 8:00 AM IST' },
]

// Minimal, standalone sibling of AskAI.jsx's Markdown() -- kept local rather than
// shared/exported to avoid coupling this page's render path to Ask AI's chat UI.
function ih(t) { return String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>') }
function AgentMarkdown({ text }) {
  const out = []; const lines = String(text || '').split('\n'); let i = 0
  while (i < lines.length) {
    const l = lines[i]
    if (/^\|(.+)\|$/.test(l) && i + 1 < lines.length && /^\|[-:\s|]+\|$/.test(lines[i + 1])) {
      const head = l.split('|').slice(1, -1).map(s => s.trim()); i += 2; const rows = []
      while (i < lines.length && /^\|(.+)\|$/.test(lines[i])) { rows.push(lines[i].split('|').slice(1, -1).map(s => s.trim())); i++ }
      out.push(<div key={out.length} style={{ overflowX: 'auto', margin: '10px 0' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
          <thead><tr>{head.map((h, j) => <th key={j} style={{ border: '1px solid #E5E7EB', padding: '7px 11px', background: '#F8FAFC', textAlign: 'left', fontWeight: 700, color: C.text }}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((cc, ci) => <td key={ci} style={{ border: '1px solid #E5E7EB', padding: '7px 11px', color: C.sub }} dangerouslySetInnerHTML={{ __html: ih(cc) }} />)}</tr>)}</tbody>
        </table>
      </div>); continue
    }
    if (/^#{1,3}\s/.test(l)) { const lv = l.match(/^#+/)[0].length; const sz = lv === 1 ? 17 : lv === 2 ? 15 : 13.5
      out.push(<div key={out.length} style={{ fontSize: sz, fontWeight: 800, color: C.navy, margin: '16px 0 6px' }} dangerouslySetInnerHTML={{ __html: ih(l.replace(/^#+\s/, '')) }} />); i++; continue }
    if (/^[-•*]\s/.test(l)) { const items = []; while (i < lines.length && /^[-•*]\s/.test(lines[i])) { items.push(lines[i].replace(/^[-•*]\s/, '')); i++ }
      out.push(<ul key={out.length} style={{ margin: '8px 0', paddingLeft: 18, color: C.sub, fontSize: 13.5, lineHeight: 1.7 }}>{items.map((it, j) => <li key={j} style={{ marginBottom: 4 }} dangerouslySetInnerHTML={{ __html: ih(it) }} />)}</ul>); continue }
    if (l.trim() === '') { i++; continue }
    out.push(<p key={out.length} style={{ margin: '5px 0', color: C.text, fontSize: 13.5, lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: ih(l) }} />); i++
  }
  return <div>{out}</div>
}

const STATUS_STYLE = { ok: { bg: C.greenBg, fg: '#1F8F5B', label: 'OK' }, error: { bg: C.navyBg, fg: C.navy, label: 'ERROR' } }
function StatusPill({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.error
  return <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.04em', color: s.fg, background: s.bg, borderRadius: 6, padding: '3px 8px', fontFamily: FONT }}>{s.label}</span>
}

function fmtWhen(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
}

export default function AgentsDashboard() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [runs, setRuns] = useState(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(null) // agentId currently running, or null
  const [expanded, setExpanded] = useState(null) // run id currently expanded
  const [runError, setRunError] = useState('')

  const loadRuns = useCallback(async () => {
    const rows = await sbGet('agent_runs', '?select=*&order=created_at.desc&limit=30')
    setRuns(Array.isArray(rows) ? rows : [])
    setLoading(false)
  }, [])

  useEffect(() => { loadRuns() }, [loadRuns])

  const runAgent = async (agentId) => {
    setRunning(agentId); setRunError('')
    try {
      const r = await fetch('/api/ask-ai', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'agent_run', agent_id: agentId }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data?.error || 'Agent run failed')
      await loadRuns()
      if (data.runId) setExpanded(data.runId)
    } catch (e) {
      setRunError(e.message || 'Agent run failed')
    } finally {
      setRunning(null)
    }
  }

  const lastRunFor = (agentId) => (runs || []).find(r => r.agent_id === agentId)

  return (
    <div className="lq-page-shell" style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.bg, fontFamily: FONT }}>
      <Sidebar />
      <div style={{ margin: '12px 14px 0', borderRadius: 14, border: '1px solid #EEF1F6', boxShadow: '0 1px 3px rgba(31,60,132,0.06)', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <div style={{ background: 'var(--card)', borderBottom: '0.5px solid ' + C.border, padding: '0 28px', minHeight: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
          <div>
            <p style={{ fontSize: 10.5, color: C.muted, margin: 0, letterSpacing: '0.05em', textTransform: 'uppercase', fontFamily: FONT }}>Intelligence / Agents</p>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: '2px 0 0', letterSpacing: '-0.4px', fontFamily: FONT }}>Agents</h1>
          </div>
          <Button size="sm" variant="secondary" onClick={loadRuns} disabled={loading}>{loading ? 'Refreshing' : 'Refresh'}</Button>
        </div>

        <div className="lq-page-content" style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
          <p style={{ fontSize: 12.5, color: C.muted, margin: '0 0 16px', maxWidth: 640 }}>
            Autonomous agents run on their own schedule, investigate performance using the same tools Ask AI has, and leave a durable report behind -- no need to ask them anything.
          </p>

          {AGENTS.map(agent => {
            const last = lastRunFor(agent.id)
            return (
              <div key={agent.id} style={{ marginBottom: 20 }}>
                <Card
                  title={agent.label}
                  sub={`${agent.schedule} · Last run: ${last ? fmtWhen(last.created_at) : 'never'}${last ? ' · ' + (STATUS_STYLE[last.status]?.label || last.status) : ''}`}
                  action={isAdmin ? (
                    <Button size="sm" onClick={() => runAgent(agent.id)} disabled={running === agent.id}>
                      {running === agent.id ? 'Running… (up to a minute)' : 'Run now'}
                    </Button>
                  ) : null}
                >
                  <p style={{ margin: 0, fontSize: 13, color: C.sub, lineHeight: 1.6 }}>{agent.description}</p>
                  {runError && running !== agent.id && <p style={{ margin: '10px 0 0', fontSize: 12, color: C.navy, fontWeight: 600 }}>{runError}</p>}
                </Card>
              </div>
            )
          })}

          <div style={{ fontSize: 12.5, fontWeight: 800, color: C.text, letterSpacing: '-0.1px', margin: '4px 0 10px' }}>Run history</div>

          {loading ? <DashboardSkeleton /> : !runs || runs.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: C.muted, fontSize: 13 }}>No agent runs yet -- click "Run now" above, or wait for the next scheduled run.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {runs.map(run => {
                const isOpen = expanded === run.id
                return (
                  <div key={run.id} style={{ background: 'var(--card)', border: '1px solid #EEF1F6', borderRadius: 12, overflow: 'hidden' }}>
                    <div
                      onClick={() => setExpanded(isOpen ? null : run.id)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '13px 16px', cursor: 'pointer' }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>{run.title || run.agent_id}</span>
                          <StatusPill status={run.status} />
                        </div>
                        {run.summary && <div style={{ fontSize: 12, color: C.muted, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{run.summary}</div>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
                        <span style={{ fontSize: 11, color: C.muted }}>{run.tool_calls_count ?? 0} tool call{run.tool_calls_count === 1 ? '' : 's'}</span>
                        <span style={{ fontSize: 11, color: C.muted, fontVariantNumeric: 'tabular-nums' }}>{fmtWhen(run.created_at)}</span>
                        <span style={{ fontSize: 12, color: C.muted, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</span>
                      </div>
                    </div>
                    {isOpen && (
                      <div style={{ padding: '4px 20px 18px', borderTop: '1px solid #F1F4F9' }}>
                        {run.status === 'error' ? (
                          <p style={{ fontSize: 13, color: C.navy, margin: '10px 0 0' }}>{run.error || 'Run failed with no error detail.'}</p>
                        ) : (
                          <AgentMarkdown text={run.content} />
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
