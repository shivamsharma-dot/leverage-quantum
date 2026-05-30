import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import Sidebar from '../components/Sidebar'
import { DATA_CONTEXT } from '../data/aiContext.js'
import styles from './VasuAI.module.css'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY

function buildSystemPrompt() {
  return `You are VASU AI (Visual Analytics & Strategy Unit), the intelligent analytics assistant embedded in Leverage Quantum — an internal marketing dashboard for Leverage Edu.

You have deep expertise in performance marketing, lead generation funnels, Meta pixel tracking, and edtech growth metrics.

You have access to Leverage Edu's complete 2025 marketing data:
${DATA_CONTEXT}

Key guidelines:
- Be concise and direct. Lead with the number or insight, then explain.
- Format responses cleanly — use bullet points for lists, bold for key metrics.
- When asked about pixel/tracking, reference Meta Graph API best practices.
- Always provide actionable recommendations, not just observations.
- You are a read-only analyst — never claim to modify data.`
}

async function askGroq(messages) {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'system', content: buildSystemPrompt() }, ...messages],
      temperature: 0.4,
      max_tokens: 1024,
    })
  })
  if (!res.ok) { const err = await res.json(); throw new Error(err.error?.message || 'Groq error ' + res.status) }
  const data = await res.json()
  return data.choices?.[0]?.message?.content || '(no response)'
}

const QUICK_PROMPTS = [
  'Overall ROAS', 'CPL by channel', 'AC vs VAS revenue',
  'QL% trend', 'Funnel analysis', 'Spend efficiency',
  'Best month', 'Recommendations',
]

const INIT_MSG = {
  role: 'assistant',
  content: `Hi! I'm **VASU AI** — Visual Analytics & Strategy Unit.\n\nI have access to your complete 2025 marketing data:\n- ₹29.45 Cr total spend (Jan–Dec)\n- 18.69L OPPs, 98.6K QLs, 18.3K Apps\n- Revenue data Aug–Dec (AC + VAS)\n- Channel breakdown: Facebook, Google, Affiliate\n\nAsk me anything about ROAS, CPL, revenue, funnel, pixel tracking, or channel performance!`
}

export default function VasuAI() {
  const { user } = useAuth()
  const [messages, setMessages] = useState([INIT_MSG])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const send = async (text) => {
    const q = (text || input).trim()
    if (!q || loading) return
    setInput('')
    const updated = [...messages, { role: 'user', content: q }]
    setMessages(updated)
    setLoading(true)
    try {
      const reply = await askGroq(updated.slice(-10))
      setMessages(m => [...m, { role: 'assistant', content: reply }])
    } catch(e) {
      setMessages(m => [...m, { role: 'assistant', content: `⚠️ Error: ${e.message}` }])
    } finally { setLoading(false) }
  }

  const renderContent = (content) => {
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br/>')
  }

  return (
    <div className={styles.layout}>
      <Sidebar/>
      <div className={styles.main}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <p className={styles.breadcrumb}>Account / VASU AI</p>
            <h1 className={styles.pageTitle}>VASU AI</h1>
          </div>
          <div className={styles.headerRight}>
            <span className={styles.modelBadge}>Llama 3.3 · Groq</span>
          </div>
        </div>

        <div className={styles.content}>
          {/* Chat window */}
          <div className={styles.chatWrap}>
            <div className={styles.messages}>
              {messages.map((m, i) => (
                <div key={i} className={m.role === 'user' ? styles.userMsg : styles.asstMsg}>
                  {m.role === 'assistant' && (
                    <div className={styles.avatar}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1C9FD4" strokeWidth="2" strokeLinecap="round">
                        <rect x="3" y="3" width="4" height="18" rx="1"/>
                        <rect x="10" y="8" width="4" height="13" rx="1"/>
                        <rect x="17" y="5" width="4" height="16" rx="1"/>
                      </svg>
                    </div>
                  )}
                  <div className={styles.bubble}
                    dangerouslySetInnerHTML={{ __html: renderContent(m.content) }}/>
                </div>
              ))}
              {loading && (
                <div className={styles.asstMsg}>
                  <div className={styles.avatar}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1C9FD4" strokeWidth="2" strokeLinecap="round">
                      <rect x="3" y="3" width="4" height="18" rx="1"/>
                      <rect x="10" y="8" width="4" height="13" rx="1"/>
                      <rect x="17" y="5" width="4" height="16" rx="1"/>
                    </svg>
                  </div>
                  <div className={styles.bubble}><span className={styles.typing}><span/><span/><span/></span></div>
                </div>
              )}
              <div ref={bottomRef}/>
            </div>

            {/* Quick prompts */}
            <div className={styles.quickRow}>
              {QUICK_PROMPTS.map(p => (
                <button key={p} className={styles.quickBtn} onClick={() => send(p)} disabled={loading}>{p}</button>
              ))}
            </div>

            {/* Input */}
            <div className={styles.inputRow}>
              <input
                className={styles.input}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
                placeholder="Ask anything about your data… (Enter to send)"
                disabled={loading}/>
              <button className={styles.sendBtn} onClick={() => send()} disabled={loading || !input.trim()}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
