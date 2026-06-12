import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import Sidebar from '../components/Sidebar'

/* ============================ Quantum brand tokens ============================ */
const C = {
  navy: '#1F3C84', blue: '#1C9FD4', cyan: '#29B9C3', green: '#4CAE6F',
  navyTint: '#E8EFF9', blueTint: '#E3F5FD', cyanTint: '#E4F8F9', greenTint: '#E9F8EF',
  ink: '#16203A', text2: '#5B6678', text3: '#9AA3B2',
  bg: '#FFFFFF', panel: '#F7F8FA', panel2: '#F1F3F7', line: '#E7EAF0',
}
const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif"

/* ============================ original VASU logic (unchanged) ============================ */
const TOKEN_KEY    = 'lq_meta_token'
const AD_ACCOUNT   = 'act_641914389215638'
const SUPABASE_URL = 'https://tsyekthwthxszmsgqfej.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzeWVrdGh3dGh4c3ptc2dxZmVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDc5MTI3NDMsImV4cCI6MjAyMzQ4ODc0M30.bdM9h5c3PDu9hgggjBdbA-eb7kfF-79c6txOnCUxRhY'

async function fetchTokenFromSupabase() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/meta_tokens?select=token,created_at&order=created_at.desc&limit=1`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } })
    const data = await res.json()
    return data?.[0]?.token || null
  } catch { return null }
}

async function graphGet(path, token, params = {}) {
  const qs = new URLSearchParams({ access_token: token, ...params }).toString()
  const res = await fetch(`https://graph.facebook.com/v19.0/${path}?${qs}`)
  const d = await res.json()
  if (d.error) throw new Error(d.error.message)
  return d
}

function buildSystemPrompt(metaData) {
  if (!metaData) return `You are VASU AI — the Meta Ads intelligence layer inside Leverage Quantum (Leverage Edu's internal marketing platform). No Meta data is connected yet. Ask the user to connect via the Meta Ads dashboard.`

  return `You are VASU AI (Visual Analytics & Strategy Unit) — the Meta Ads intelligence layer inside Leverage Quantum, Leverage Edu's internal marketing platform.

You have access to LIFETIME Meta Ads data for account act_641914389215638:

LIFETIME SPEND: ${metaData.spend}
IMPRESSIONS: ${metaData.impressions} | CLICKS: ${metaData.clicks} | CTR: ${metaData.ctr}% | CPM: ${metaData.cpm}
TOTAL LEADS: ${metaData.totalLeads?.toLocaleString?.() || '—'} | COST PER LEAD: ${metaData.costPerLead}
PIXEL: ${metaData.pixelName}

ALL CAMPAIGNS (lifetime):
${(metaData.campaigns||[]).slice(0,20).map(c=>{
  const ins=c.insights?.data?.[0]||{}
  return `- ${c.name} | ${c.status} | Spend: $${parseFloat(ins.spend||0).toFixed(0)} | CTR: ${parseFloat(ins.ctr||0).toFixed(2)}% | Leads: ${parseInt(ins.actions?.find(a=>a.action_type==='lead')?.value||0)}`
}).join('\n')}

TOP ADSETS:
${(metaData.adsets||[]).slice(0,10).map(a=>{
  const ins=a.insights?.data?.[0]||{}
  return `- ${a.name} | ${a.status} | Goal: ${a.optimization_goal||'—'} | Spend: $${parseFloat(ins.spend||0).toFixed(0)} | CTR: ${parseFloat(ins.ctr||0).toFixed(2)}%`
}).join('\n')}

Guidelines:
- Lead with the key metric, then the insight. Be specific and actionable.
- Flag anomalies: spend drops, CTR changes, high fatigue, paused campaigns.
- Format numbers: use ₹ (multiply USD × 83), K/L/Cr for scale.
- You are read-only — never claim to modify campaigns.`
}

// askClaude — SSE streaming, calls onChunk for each delta, returns full text
async function askClaude(messages, metaToken, onChunk) {
  const res = await fetch('/api/vasu-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: messages.slice(-1).map(m => ({ role: m.role||'user', content: m.content })),
      history:  messages.slice(0, -1).map(m => ({ role: m.role, content: m.content })),
      metaToken,
    })
  })
  if (!res.ok) {
    const e = await res.json().catch(()=>({error:'Server error'}))
    throw new Error(e.error || `HTTP ${res.status}`)
  }
  // Handle SSE stream
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = '', fullText = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      try {
        const parsed = JSON.parse(data)
        if (parsed.error) throw new Error(parsed.error)
        if (parsed.delta) { fullText += parsed.delta; onChunk?.(fullText) }
        if (parsed.done) return parsed.content || fullText
      } catch(e) { if (e.message && !e.message.includes('JSON')) throw e }
    }
  }
  return fullText
}

const QUICK = [
  '📊 Generate weekly performance report',
  '📋 Generate monthly executive summary',
  '🎯 QL Ops digest — Futwork vs Superbot this month',
  'Why did CPL change vs last month?',
  'Which campaigns should I scale or pause?',
  'Compare Meta Ads CPL vs CRM CPL',
  'High fatigue creatives — what to refresh?',
  'Where are leads dropping in the funnel?',
]

/* ============================ inline icon set ============================ */
function Ico({ n, s = 17, c = 'currentColor', fill = 'none', sw = 2 }) {
  const p = {
    pen: <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></>,
    chat: <><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></>,
    bot: <><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4M8 16h.01M16 16h.01"/></>,
    notebook: <><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></>,
    brain: <><path d="M9.5 2A2.5 2.5 0 0112 4.5v15a2.5 2.5 0 01-4.96.44 2.5 2.5 0 01-2.5-4.34A2.5 2.5 0 014 11a2.5 2.5 0 01.96-4.78A2.5 2.5 0 019.5 2z"/><path d="M14.5 2A2.5 2.5 0 0012 4.5v15a2.5 2.5 0 004.96.44 2.5 2.5 0 002.5-4.34A2.5 2.5 0 0020 11a2.5 2.5 0 00-.96-4.78A2.5 2.5 0 0014.5 2z"/></>,
    bookmark: <><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></>,
    clip: <><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></>,
    sliders: <><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></>,
    server: <><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    chevron: <><polyline points="6 9 12 15 18 9"/></>,
    copy: <><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></>,
    edit: <><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4z"/></>,
    branch: <><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 01-9 9"/></>,
    up: <><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></>,
    down: <><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></>,
    refresh: <><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></>,
    speaker: <><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14"/></>,
    mic: <><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4"/></>,
    arrowup: <><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></>,
    check: <><polyline points="20 6 9 17 4 12"/></>,
  }[n]
  return <svg width={s} height={s} viewBox="0 0 24 24" fill={fill} stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{p}</svg>
}
function QMark({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <rect x="1" y="12" width="4" height="9" rx="1.5" fill={C.green} />
      <rect x="7" y="7" width="4" height="14" rx="1.5" fill={C.cyan} />
      <rect x="13" y="4" width="4" height="17" rx="1.5" fill={C.blue} />
    </svg>
  )
}

/* ============================ markdown renderer (display only) ============================ */
function CodeBlock({ lang, code }) {
  const [copied, setCopied] = useState(false)
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, overflow: 'hidden', margin: '10px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', background: C.panel2, borderBottom: `1px solid ${C.line}` }}>
        <span style={{ fontSize: 11, color: C.text2, fontFamily: 'monospace' }}>{lang || 'code'}</span>
        <button onClick={() => { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1200) }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: FONT, fontSize: 11, color: C.text2 }}>
          <Ico n={copied ? 'check' : 'copy'} s={12} c={copied ? C.green : C.text2} />{copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre style={{ margin: 0, padding: 12, fontSize: 12.5, fontFamily: 'monospace', color: C.ink, overflowX: 'auto', background: '#fff' }}><code>{code}</code></pre>
    </div>
  )
}
function inlineHtml(t) {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, `<code style="background:${C.panel2};padding:1px 5px;border-radius:4px;font-size:12px;font-family:monospace">$1</code>`)
}
function Markdown({ text }) {
  const out = []; const lines = (text || '').split('\n'); let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim(); const buf = []; i++
      while (i < lines.length && !lines[i].startsWith('```')) { buf.push(lines[i]); i++ }
      i++; out.push(<CodeBlock key={out.length} lang={lang} code={buf.join('\n')} />); continue
    }
    if (/^\|(.+)\|$/.test(line) && i + 1 < lines.length && /^\|[-:\s|]+\|$/.test(lines[i + 1])) {
      const head = line.split('|').slice(1, -1).map(s => s.trim()); i += 2; const rows = []
      while (i < lines.length && /^\|(.+)\|$/.test(lines[i])) { rows.push(lines[i].split('|').slice(1, -1).map(s => s.trim())); i++ }
      out.push(
        <div key={out.length} style={{ overflowX: 'auto', margin: '10px 0' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead><tr>{head.map((h, j) => <th key={j} style={{ border: `1px solid ${C.line}`, padding: '7px 10px', background: C.panel2, textAlign: 'left', fontWeight: 700, color: C.ink }}>{h}</th>)}</tr></thead>
            <tbody>{rows.map((r, ri) => <tr key={ri} style={{ background: ri % 2 ? C.panel : '#fff' }}>{r.map((cc, ci) => <td key={ci} style={{ border: `1px solid ${C.line}`, padding: '7px 10px', color: C.text2 }} dangerouslySetInnerHTML={{ __html: inlineHtml(cc) }} />)}</tr>)}</tbody>
          </table>
        </div>); continue
    }
    if (/^#{1,3}\s/.test(line)) {
      const lvl = line.match(/^#+/)[0].length; const sz = lvl === 1 ? 19 : lvl === 2 ? 16 : 14.5
      out.push(<div key={out.length} style={{ fontSize: sz, fontWeight: 800, color: C.ink, margin: '14px 0 6px' }} dangerouslySetInnerHTML={{ __html: inlineHtml(line.replace(/^#+\s/, '')) }} />); i++; continue
    }
    if (/^>\s/.test(line)) {
      out.push(<div key={out.length} style={{ borderLeft: `3px solid ${C.blue}`, padding: '4px 12px', margin: '8px 0', color: C.text2, background: C.blueTint, borderRadius: '0 8px 8px 0' }} dangerouslySetInnerHTML={{ __html: inlineHtml(line.replace(/^>\s/, '')) }} />); i++; continue
    }
    if (/^[-•*]\s/.test(line)) {
      const items = []
      while (i < lines.length && /^[-•*]\s/.test(lines[i])) { items.push(lines[i].replace(/^[-•*]\s/, '')); i++ }
      out.push(<ul key={out.length} style={{ margin: '8px 0', paddingLeft: 20, color: C.ink, fontSize: 14, lineHeight: 1.65 }}>{items.map((it, j) => <li key={j} style={{ marginBottom: 3 }} dangerouslySetInnerHTML={{ __html: inlineHtml(it) }} />)}</ul>); continue
    }
    if (/^\d+\.\s/.test(line)) {
      const items = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) { items.push(lines[i].replace(/^\d+\.\s/, '')); i++ }
      out.push(<ol key={out.length} style={{ margin: '8px 0', paddingLeft: 20, color: C.ink, fontSize: 14, lineHeight: 1.65 }}>{items.map((it, j) => <li key={j} style={{ marginBottom: 3 }} dangerouslySetInnerHTML={{ __html: inlineHtml(it) }} />)}</ol>); continue
    }
    if (/^(---|___|\*\*\*)\s*$/.test(line)) { out.push(<hr key={out.length} style={{ border: 'none', borderTop: `1px solid ${C.line}`, margin: '14px 0' }} />); i++; continue }
    if (line.trim() === '') { i++; continue }
    out.push(<p key={out.length} style={{ margin: '6px 0', color: C.ink, fontSize: 14, lineHeight: 1.65 }} dangerouslySetInnerHTML={{ __html: inlineHtml(line) }} />); i++
  }
  return <div>{out}</div>
}

/* ============================ side panels (UI shells) ============================ */
function PanelHeader({ title, placeholder }) {
  return (
    <div style={{ padding: '14px 14px 10px' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 12 }}>{title}</div>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }}><Ico n="search" s={14} c={C.text3} /></span>
        <input placeholder={placeholder} style={{ width: '100%', fontFamily: FONT, fontSize: 13, color: C.ink, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 9, padding: '8px 10px 8px 32px', outline: 'none', boxSizing: 'border-box' }} />
      </div>
    </div>
  )
}
function ShellPanel({ title, placeholder, empty }) {
  return <div><PanelHeader title={title} placeholder={placeholder} /><div style={{ padding: '36px 20px', textAlign: 'center', color: C.text3, fontSize: 12.5, lineHeight: 1.6 }}>{empty}</div></div>
}
function McpPanel({ connected }) {
  const servers = [{ name: 'Meta Ads', on: connected }, { name: 'Google Ads', on: true }]
  return (
    <div>
      <PanelHeader title="MCP Servers" placeholder="Filter MCP servers by name" />
      {servers.map((s, k) => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', borderTop: `1px solid ${C.line}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.on ? C.green : C.text3 }} />
            <span style={{ fontSize: 13, color: C.ink, fontWeight: 500 }}>{s.name}</span>
          </div>
          <span style={{ fontSize: 11, color: s.on ? C.green : C.text3, fontWeight: 600 }}>{s.on ? 'Connected' : 'Off'}</span>
        </div>
      ))}
    </div>
  )
}

const RAIL = [
  { id: 'new', label: 'New chat', icon: 'pen' },
  { id: 'history', label: 'Chat History', icon: 'chat' },
  { id: 'agent', label: 'Agent Builder', icon: 'bot' },
  { id: 'prompts', label: 'Prompts', icon: 'notebook' },
  { id: 'memories', label: 'Memories', icon: 'brain' },
  { id: 'bookmarks', label: 'Bookmarks', icon: 'bookmark' },
  { id: 'files', label: 'Attach Files', icon: 'clip' },
  { id: 'params', label: 'Parameters', icon: 'sliders' },
  { id: 'mcp', label: 'MCP Settings', icon: 'server' },
]

/* ============================ component ============================ */
export default function VasuAI() {
  const { user } = useAuth()
  const HISTORY_KEY = 'lq_vasu_history'

  const [messages, setMessages] = useState(() => {
    try { const saved = localStorage.getItem(HISTORY_KEY); return saved ? JSON.parse(saved) : [] } catch { return [] }
  })
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [metaData, setMetaData] = useState(null)
  const [metaLoading, setMetaLoading] = useState(false)
  const [connected, setConnected] = useState(false)
  const [metaToken, setMetaToken]   = useState(() => { try { return localStorage.getItem('lq_meta_token') || '' } catch { return '' } })
  const [rail, setRail] = useState('history')
  const [historyOpen, setHistoryOpen] = useState(true)
  const [mcpOpen, setMcpOpen] = useState(false)
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])
  useEffect(() => { if (messages.length > 0) { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-50))) } catch {} } }, [messages])

  useEffect(() => {
    const init = async () => {
      // Try localStorage first, then Supabase
      let token = localStorage.getItem(TOKEN_KEY)
      if (!token) {
        token = await fetchTokenFromSupabase()
        if (token) localStorage.setItem(TOKEN_KEY, token)
      }
      if (token) { setMetaToken(token); loadMetaContext(token) }
    }
    init()
  }, [])

  const loadMetaContext = async (token) => {
    setMetaLoading(true)
    try {
      const getAction = (actions, type) => parseInt(actions?.find(a => a.action_type === type)?.value || 0)
      const [insLife, campaigns, adsets, ads, pixels] = await Promise.all([
        graphGet(`${AD_ACCOUNT}/insights`, token, { fields: 'spend,impressions,clicks,ctr,cpm,actions', date_preset: 'maximum', level: 'account' }),
        graphGet(`${AD_ACCOUNT}/campaigns`, token, { fields: 'name,status,objective,insights{spend,impressions,clicks,ctr,actions}', limit: 50, date_preset: 'maximum' }),
        graphGet(`${AD_ACCOUNT}/adsets`, token, { fields: 'name,status,optimization_goal,insights{spend,impressions,clicks,ctr,actions}', limit: 50, date_preset: 'maximum' }).catch(() => ({ data: [] })),
        graphGet(`${AD_ACCOUNT}/ads`, token, { fields: 'name,status,insights{spend,impressions,clicks,ctr}', limit: 50, date_preset: 'maximum' }).catch(() => ({ data: [] })),
        graphGet(`${AD_ACCOUNT}/adspixels`, token, { fields: 'id,name,last_fired_time' }),
      ])
      const acc = insLife.data?.[0] || {}
      const na = acc.actions || []
      const totalLeads = getAction(na, 'lead')
      const data = {
        spend: `$${parseFloat(acc.spend||0).toFixed(2)} (~₹${(parseFloat(acc.spend||0)/1e7).toFixed(2)} Cr)`,
        impressions: parseInt(acc.impressions||0).toLocaleString(),
        clicks: parseInt(acc.clicks||0).toLocaleString(),
        ctr: parseFloat(acc.ctr||0).toFixed(2),
        cpm: `$${parseFloat(acc.cpm||0).toFixed(2)}`,
        costPerLead: totalLeads > 0 ? `₹${(parseFloat(acc.spend||0)/totalLeads).toFixed(0)}` : 'N/A',
        pixelName: pixels.data?.[0]?.name || 'Unknown',
        campaigns: campaigns.data || [], adsets: adsets.data || [], ads: ads.data || [], totalLeads,
      }
      setMetaData(data)
      setConnected(true)
    } catch (e) {
      setMessages([{ role: 'assistant', content: `⚠️ Couldn't load Meta Ads data: ${e.message}\n\nPlease go to **Meta Ads** dashboard, disconnect and reconnect your account.` }])
    } finally { setMetaLoading(false) }
  }

  const send = async (text) => {
    const q = (text || input).trim()
    if (!q || loading) return
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    const updated = [...messages, { role: 'user', content: q }]
    // Add placeholder assistant message that streams in
    setMessages([...updated, { role: 'assistant', content: '', streaming: true }])
    setLoading(true)
    try {
      const reply = await askClaude(updated, metaToken, (partial) => {
        setMessages(m => {
          const copy = [...m]
          copy[copy.length-1] = { role: 'assistant', content: partial, streaming: true }
          return copy
        })
      })
      setMessages(m => {
        const copy = [...m]
        copy[copy.length-1] = { role: 'assistant', content: reply }
        return copy
      })
    } catch (e) {
      setMessages(m => {
        const copy = [...m]
        copy[copy.length-1] = { role: 'assistant', content: '⚠️ ' + e.message }
        return copy
      })
    } finally { setLoading(false) }
  }

  const newChat = () => { setMessages([]); localStorage.removeItem(HISTORY_KEY); setInput('') }
  const railClick = (id) => {
    if (id === 'new') { newChat(); return }
    if (id === 'history') { setHistoryOpen(o => !o); setRail('history'); return }
    setRail(id); setHistoryOpen(true)
  }

  const initials = (user?.name || 'You').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const firstName = (user?.name || 'there').split(' ')[0]
  const greeting = (() => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 21 ? 'Good evening' : 'Happy late night' })()

  const railPanel = () => {
    switch (rail) {
      case 'mcp': return <McpPanel connected={connected} />
      case 'agent': return <ShellPanel title="Agent Builder" placeholder="Filter agents…" empty="Agent presets aren't enabled for VASU yet." />
      case 'prompts': return <ShellPanel title="Prompts" placeholder="Filter prompts by name" empty="No saved prompts yet." />
      case 'memories': return <ShellPanel title="Memories" placeholder="Filter memories…" empty="No memories yet." />
      case 'bookmarks': return <ShellPanel title="Bookmarks" placeholder="Filter bookmarks…" empty="No bookmarks yet." />
      case 'files': return <ShellPanel title="Files" placeholder="Filter files…" empty="No files uploaded yet." />
      case 'params': return <ShellPanel title="Parameters" placeholder="" empty="VASU runs on managed defaults." />
      default: return (
        <div>
          <div style={{ padding: '14px 14px 8px' }}>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }}><Ico n="search" s={14} c={C.text3} /></span>
              <input placeholder="Search messages" style={{ width: '100%', fontFamily: FONT, fontSize: 13, color: C.ink, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 9, padding: '8px 10px 8px 32px', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 16px' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>Chats</span>
            <Ico n="chevron" s={15} c={C.text3} />
          </div>
          {messages.length > 0 ? (
            <button onClick={() => {}} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', cursor: 'pointer', fontFamily: FONT, background: C.blueTint, borderLeft: `2px solid ${C.blue}` }}>
              <span style={{ width: 20, height: 20, borderRadius: 6, background: C.navy, color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>V</span>
              <span style={{ fontSize: 13, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{messages.find(m => m.role === 'user')?.content?.slice(0, 30) || 'Current chat'}</span>
            </button>
          ) : (
            <div style={{ padding: '30px 20px', textAlign: 'center', color: C.text3, fontSize: 12.5 }}>No chat yet. Start by asking VASU a question.</div>
          )}
        </div>
      )
    }
  }

  const iconBtn = (size = 30) => ({ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', borderRadius: 8, cursor: 'pointer', flex: 'none' })
  const pill = { display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FONT, fontSize: 12.5, fontWeight: 500, color: C.text2, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 999, padding: '6px 11px', cursor: 'pointer' }

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: FONT, background: C.bg, color: C.ink }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap'); .vasu-scroll::-webkit-scrollbar{width:8px;height:8px} .vasu-scroll::-webkit-scrollbar-thumb{background:#D7DCE5;border-radius:8px} .vasu-scroll::-webkit-scrollbar-track{background:transparent} @keyframes vspin{to{transform:rotate(360deg)}} @keyframes vblink{0%,80%,100%{opacity:.25}40%{opacity:1}}`}</style>

      <Sidebar />

      {/* console = chat-history panel + icon rail + main chat */}
      <div style={{ flex: 1, display: 'flex', minWidth: 0 }}>

        {/* chat history / rail panel */}
        {historyOpen && (
          <div className="vasu-scroll" style={{ width: 290, background: '#fff', borderRight: `1px solid ${C.line}`, borderLeft: `1px solid ${C.line}`, overflowY: 'auto', flex: 'none' }}>
            {railPanel()}
          </div>
        )}

        {/* icon rail */}
        <div style={{ width: 48, background: C.panel, borderRight: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 0', gap: 4, flex: 'none' }}>
          {RAIL.map(r => {
            const on = (r.id === 'history' && historyOpen && rail === 'history') || (rail === r.id && r.id !== 'history' && r.id !== 'new')
            return (
              <button key={r.id} onClick={() => railClick(r.id)} title={r.label}
                style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 9, cursor: 'pointer', background: on ? C.blueTint : 'transparent' }}>
                <Ico n={r.icon} s={17} c={on ? C.blue : C.text2} />
              </button>
            )
          })}
        </div>

        {/* main chat */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#fff' }}>
          {/* header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderBottom: `1px solid ${C.line}` }}>
            <QMark size={16} />
            <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>VASU AI · Claude Sonnet 4.5</span>
            <button style={iconBtn(28)} onClick={newChat} title="New chat"><Ico n="plus" s={16} c={C.text3} /></button>
            <div style={{ flex: 1 }} />
            {connected
              ? <span style={{ fontSize: 12, fontWeight: 600, color: C.green, background: C.greenTint, borderRadius: 999, padding: '4px 11px' }}>● Meta Ads connected</span>
              : <span style={{ fontSize: 12, fontWeight: 600, color: C.text2, background: C.panel2, borderRadius: 999, padding: '4px 11px' }}>Not connected</span>}
          </div>

          {/* messages */}
          <div className="vasu-scroll" style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>
            {metaLoading ? (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, color: C.text2 }}>
                <span style={{ width: 26, height: 26, border: `2.5px solid ${C.line}`, borderTopColor: C.blue, borderRadius: '50%', animation: 'vspin .7s linear infinite' }} />
                <span style={{ fontSize: 13 }}>Connecting to Meta Ads…</span>
              </div>
            ) : messages.length === 0 ? (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
                <div style={{ width: 52, height: 52, borderRadius: 16, background: C.navyTint, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><QMark size={26} /></div>
                <div style={{ fontSize: 25, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em' }}>{greeting}, {firstName}</div>
                <div style={{ fontSize: 14, color: C.text2, textAlign: 'center' }}>Ask anything about Meta Ads, QL Ops, or WhatsApp performance.<br/>Or generate a report — weekly digest, monthly summary, campaign analysis.</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 620, marginTop: 8 }}>
                    {QUICK.map(s => (
                      <button key={s} onClick={() => send(s)}
                        style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 500, color: C.text2, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 999, padding: '7px 13px', cursor: 'pointer', transition: 'all .15s' }}
                        onMouseOver={e=>{e.currentTarget.style.borderColor='#1F3C84';e.currentTarget.style.color='#1F3C84'}}
                        onMouseOut={e=>{e.currentTarget.style.borderColor=C.line;e.currentTarget.style.color=C.text2}}>
                        {s}
                      </button>
                    ))}
                  </div>
              </div>
            ) : (
              <div style={{ maxWidth: 760, margin: '0 auto' }}>
                {messages.map((m, k) => (
                  <div key={k} style={{ marginBottom: 22 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
                      {m.role === 'user'
                        ? <span style={{ width: 24, height: 24, borderRadius: '50%', background: C.cyan, color: '#fff', fontSize: 10.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{initials}</span>
                        : <span style={{ width: 24, height: 24, borderRadius: '50%', background: C.navyTint, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><QMark size={13} /></span>}
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{m.role === 'user' ? (user?.name || 'You') : 'VASU AI'}</span>
                    </div>
                    <div style={{ paddingLeft: 33 }}>
                      {m.role === 'user'
                        ? <div style={{ fontSize: 14, color: C.ink, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{m.content}</div>
                        : <><Markdown text={m.content + (m.streaming && m.content ? '▍' : '')} />
                            <div style={{ display: 'flex', gap: 2, marginTop: 8 }}>
                              {['speaker', 'copy', 'edit', 'branch', 'up', 'down', 'refresh'].map((ic, j) => (
                                <button key={j} style={iconBtn(28)}
                                  onClick={() => { if (ic === 'copy') navigator.clipboard?.writeText(m.content); if (ic === 'refresh') {} }}>
                                  <Ico n={ic} s={14} c={C.text3} />
                                </button>
                              ))}
                            </div>
                          </>}
                    </div>
                  </div>
                ))}
{/* streaming indicator shown inline in the message — no separate loader needed */}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {/* input */}
          <div style={{ padding: '0 22px 18px' }}>
            <div style={{ maxWidth: 760, margin: '0 auto', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 10, boxShadow: '0 1px 3px rgba(16,24,40,.05)' }}>
              <textarea ref={textareaRef} value={input} disabled={loading} rows={1}
                onChange={e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px' }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                placeholder="Message VASU AI…"
                style={{ width: '100%', border: 'none', outline: 'none', resize: 'none', fontFamily: FONT, fontSize: 14, color: C.ink, background: 'transparent', padding: '6px 8px', maxHeight: 160, boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button style={iconBtn(30)} title="Attach"><Ico n="clip" s={16} c={C.text3} /></button>
                  <button style={pill} onClick={() => railClick('prompts')}><Ico n="notebook" s={13} c={C.text2} />Prompts</button>
                  <button style={iconBtn(30)} title="Parameters" onClick={() => railClick('params')}><Ico n="sliders" s={16} c={C.text3} /></button>
                  <div style={{ position: 'relative' }}>
                    <button onClick={() => setMcpOpen(o => !o)} style={pill}><Ico n="server" s={13} c={C.text2} />MCP Servers<span style={{ fontSize: 10.5, color: C.text3 }}>{connected ? '2 selected' : '1 selected'}</span><Ico n="chevron" s={13} c={C.text3} /></button>
                    {mcpOpen && (
                      <div style={{ position: 'absolute', bottom: 38, left: 0, width: 200, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, boxShadow: '0 8px 24px -8px rgba(16,24,40,.18)', padding: 6, zIndex: 10 }}>
                        {[{ n: 'Meta Ads', on: connected }, { n: 'Google Ads', on: true }].map(s => (
                          <div key={s.n} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 9px' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: s.on ? C.green : C.text3 }} /><span style={{ fontSize: 13, color: C.ink }}>{s.n}</span></span>
                            {s.on && <Ico n="check" s={14} c={C.blue} />}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button style={iconBtn(30)} title="Voice"><Ico n="mic" s={16} c={C.text3} /></button>
                  <button onClick={() => send()} disabled={!input.trim() || loading}
                    style={{ width: 34, height: 34, borderRadius: 10, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: input.trim() && !loading ? 'pointer' : 'not-allowed', background: input.trim() && !loading ? C.navy : '#D7DCE5' }}>
                    <Ico n="arrowup" s={17} c="#fff" sw={2.5} />
                  </button>
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'center', fontSize: 11, color: C.text3, marginTop: 8 }}>VASU can make mistakes. Verify important numbers.</div>
          </div>
        </div>
      </div>
    </div>
  )
}
