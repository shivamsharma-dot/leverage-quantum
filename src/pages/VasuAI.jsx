import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import Sidebar from '../components/Sidebar'
import styles from './VasuAI.module.css'

// Claude API is called server-side via /api/vasu-chat to keep the key secure
const TOKEN_KEY  = 'lq_meta_token'
const AD_ACCOUNT = 'act_641914389215638'

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

// Streams Claude's reply from /api/vasu-chat, calling onText(fullSoFar) as each
// chunk arrives so the UI can render the answer live, like a typing assistant.
async function askClaude(messages, metaData, onText) {
  const res = await fetch('/api/vasu-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: messages[messages.length-1]?.content || '' }],
      systemPrompt: buildSystemPrompt(metaData),
      history: messages.slice(0, -1)
    })
  })
  if (!res.ok || !res.body) {
    let msg = 'Claude error'
    try { const e = await res.json(); msg = e.error || msg } catch {}
    throw new Error(msg)
  }

  const reader  = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full   = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (!data || data === '[DONE]') continue
      let json
      try { json = JSON.parse(data) } catch { continue }
      if (json.error) throw new Error(json.error)
      if (json.delta) { full += json.delta; onText(full) }
    }
  }
  return full || '(no response)'
}

const QUICK = [
  'Analyse campaigns', 'Why is CTR low?', 'Best performing campaign',
  'Where to cut spend?', 'High fatigue creatives', 'Scale recommendations',
  'Lead drop analysis', 'CPL this month',
]

export default function VasuAI() {
  const { user } = useAuth()
  const HISTORY_KEY = 'lq_vasu_history'

  const [messages, setMessages]     = useState(() => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY)
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [input, setInput]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [metaData, setMetaData]     = useState(null)
  const [metaLoading, setMetaLoading] = useState(false)
  const [connected, setConnected]   = useState(false)
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  useEffect(() => {
    if (messages.length > 0) {
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-50))) } catch {}
    }
  }, [messages])

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (token) loadMetaContext(token)
    else if (messages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: `Hi! I'm **VASU AI** — your Meta Ads intelligence layer.\n\nTo get started, go to **Meta Ads** in the sidebar and connect your account. Once connected, I'll have full lifetime access to your campaigns, adsets, creatives and pixel data.`
      }])
    }
  }, [])

  const loadMetaContext = async (token) => {
    setMetaLoading(true)
    try {
      const getAction = (actions, type) => parseInt(actions?.find(a => a.action_type === type)?.value || 0)

      const [insLife, campaigns, adsets, ads, pixels] = await Promise.all([
        graphGet(`${AD_ACCOUNT}/insights`, token, { fields: 'spend,impressions,clicks,ctr,cpm,actions', date_preset: 'maximum', level: 'account' }),
        graphGet(`${AD_ACCOUNT}/campaigns`, token, { fields: 'name,status,objective,insights{spend,impressions,clicks,ctr,actions}', limit: 50, date_preset: 'maximum' }),
        graphGet(`${AD_ACCOUNT}/adsets`,    token, { fields: 'name,status,optimization_goal,insights{spend,impressions,clicks,ctr,actions}', limit: 50, date_preset: 'maximum' }).catch(() => ({ data: [] })),
        graphGet(`${AD_ACCOUNT}/ads`,       token, { fields: 'name,status,insights{spend,impressions,clicks,ctr}', limit: 50, date_preset: 'maximum' }).catch(() => ({ data: [] })),
        graphGet(`${AD_ACCOUNT}/adspixels`, token, { fields: 'id,name,last_fired_time' }),
      ])

      const acc  = insLife.data?.[0] || {}
      const na   = acc.actions || []
      const totalLeads = getAction(na, 'lead')

      const data = {
        spend:       `$${parseFloat(acc.spend||0).toFixed(2)} (~₹${(parseFloat(acc.spend||0)/1e7).toFixed(2)} Cr)`,
        impressions: parseInt(acc.impressions||0).toLocaleString(),
        clicks:      parseInt(acc.clicks||0).toLocaleString(),
        ctr:         parseFloat(acc.ctr||0).toFixed(2),
        cpm:         `$${parseFloat(acc.cpm||0).toFixed(2)}`,
        costPerLead: totalLeads > 0 ? `₹${(parseFloat(acc.spend||0)/totalLeads).toFixed(0)}` : 'N/A',
        pixelName:   pixels.data?.[0]?.name || 'Unknown',
        campaigns:   campaigns.data || [],
        adsets:      adsets.data   || [],
        ads:         ads.data      || [],
        totalLeads,
      }
      setMetaData(data)
      setConnected(true)
      // Only set welcome message if no existing history
      if (messages.length === 0) {
        setMessages([{
          role: 'assistant',
          content: `Connected to your Meta Ads account ✅\n\n**Lifetime snapshot:**\n- Spend: ${data.spend}\n- Impressions: ${data.impressions} · Clicks: ${data.clicks} · CTR: ${data.ctr}%\n- Total Leads: ${totalLeads.toLocaleString()} · Cost per Lead: ${data.costPerLead}\n- Pixel: ${data.pixelName}\n- ${data.campaigns.length} campaigns · ${data.adsets.length} adsets · ${data.ads.length} ads loaded\n\nI have your full lifetime Meta Ads data. Ask me anything.`
        }])
      }
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
    // Append an empty assistant turn that we stream Claude's reply into.
    setMessages([...updated, { role: 'assistant', content: '' }])
    setLoading(true)

    const setLastAssistant = (content) => setMessages(m => {
      const copy = m.slice()
      copy[copy.length - 1] = { role: 'assistant', content }
      return copy
    })

    try {
      await askClaude(updated.slice(-14), metaData, setLastAssistant)
    } catch (e) {
      setLastAssistant(`⚠️ ${e.message}`)
    } finally { setLoading(false) }
  }

  // Render markdown-lite: bold, code, newlines, bullet lists
  const renderContent = (text) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code style="background:#F3F4F6;padding:1px 5px;border-radius:4px;font-size:12px;font-family:monospace">$1</code>')
      .split('\n')
      .map(line => {
        if (line.match(/^[-•]\s/)) return `<div style="display:flex;gap:8px;margin:2px 0"><span style="color:#9CA3AF;flex-shrink:0">•</span><span>${line.replace(/^[-•]\s/, '')}</span></div>`
        return line || '<br/>'
      })
      .join('\n')
      .replace(/\n(<br\/>)\n/g, '<br/>')
  }

  // Get user initials
  const initials = 'SS' // Shivam Sharma

  return (
    <div className={styles.layout}>
      <Sidebar/>
      <div className={styles.main}>

        {/* Top bar — minimal, just model badge */}
        <div className={styles.topBar}>
          <div className={styles.modelTag}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="3" width="4" height="18" rx="1"/><rect x="10" y="8" width="4" height="13" rx="1"/><rect x="17" y="5" width="4" height="16" rx="1"/>
            </svg>
            VASU AI · Claude Sonnet 4.6
          </div>
          {connected && <div className={styles.connectedPill}>● Meta Ads connected</div>}
          <div style={{flex:1}}/>
          {messages.length > 1 && (
            <button onClick={() => { setMessages([]); localStorage.removeItem(HISTORY_KEY) }}
              style={{background:'none',border:'none',color:'#9CA3AF',fontSize:12,cursor:'pointer',fontFamily:'Inter,sans-serif',display:'flex',alignItems:'center',gap:4}}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
              Clear history
            </button>
          )}
        </div>

        {/* Messages area — full height, no box */}
        <div className={styles.messagesArea}>
          {metaLoading ? (
            <div className={styles.loadingCenter}>
              <div className={styles.loadSpinner}/>
              <p>Connecting to Meta Ads…</p>
            </div>
          ) : messages.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round">
                  <rect x="3" y="3" width="4" height="18" rx="1"/><rect x="10" y="8" width="4" height="13" rx="1"/><rect x="17" y="5" width="4" height="16" rx="1"/>
                </svg>
              </div>
              <p>Ask me anything about your Meta Ads</p>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? styles.userTurn : styles.asstTurn}>
                <div className={styles.turnAvatar}>
                  {m.role === 'user'
                    ? <div className={styles.userAvatar}>{initials}</div>
                    : <div className={styles.vasuAvatar}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1C9FD4" strokeWidth="2" strokeLinecap="round">
                          <rect x="3" y="3" width="4" height="18" rx="1"/><rect x="10" y="8" width="4" height="13" rx="1"/><rect x="17" y="5" width="4" height="16" rx="1"/>
                        </svg>
                      </div>
                  }
                </div>
                <div className={styles.turnBody}>
                  <p className={styles.turnName}>{m.role === 'user' ? 'You' : 'VASU AI'}</p>
                  {m.role === 'assistant' && !m.content && loading
                    ? <div className={styles.typing}><span/><span/><span/></div>
                    : <div className={styles.turnContent} dangerouslySetInnerHTML={{ __html: renderContent(m.content) }}/>}
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef}/>
        </div>

        {/* Quick prompts — only when no messages or first load */}
        {messages.length <= 1 && !loading && connected && (
          <div className={styles.quickRow}>
            {QUICK.map(p => (
              <button key={p} className={styles.quickBtn} onClick={() => send(p)}>{p}</button>
            ))}
          </div>
        )}

        {/* Input box — large, floating style */}
        <div className={styles.inputWrap}>
          <div className={styles.inputBox}>
            <textarea
              ref={textareaRef}
              className={styles.inputField}
              value={input}
              onChange={e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 180) + 'px' }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="Message VASU AI..."
              disabled={loading}
              rows={1}
              style={{ resize: 'none', overflowY: 'auto' }}
            />
            <div className={styles.inputFooter}>
              <div className={styles.metaBadge}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg>
                Meta Ads
              </div>
              <button
                className={`${styles.sendBtn} ${input.trim() && !loading ? styles.sendActive : ''}`}
                onClick={() => send()}
                disabled={!input.trim() || loading}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
