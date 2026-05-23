import { useState, useRef, useEffect } from 'react'
import Sidebar from '../components/Sidebar'
import { useAuth } from '../hooks/useAuth'
import styles from './SettingsPage.module.css'

// Claude API call
async function askClaude(messages) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: `You are Quantum AI, an intelligent assistant embedded inside Leverage Quantum — an internal analytics platform for Leverage Edu.
You help the team understand their ROAS data, lead quality metrics, and marketing performance.

Key context:
- Leverage Edu is a study abroad company
- Key metrics: OPPs (leads), QLs (qualified leads via Futwork), STUs/Apps (university applications)
- Revenue verticals: AC (Admission Counselling) and VAS (Value Added Services)  
- ROAS = Total Revenue / Ad Spend
- Main paid channels: Facebook and Google
- Data covers Jan-Dec 2025

You can help with:
1. Explaining metrics and formulas
2. Interpreting ROAS and lead quality data
3. Suggesting optimizations based on channel performance
4. Answering questions about the dashboard
5. Helping update SR fee assumptions or other settings

Be concise, data-driven, and use ₹ for Indian currency.`,
      messages
    })
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  const data = await res.json()
  return data.content[0].text
}

const SR_FEE_KEY = 'lq_sr_fee'
const DEFAULT_SR_FEE = 90000

export default function SettingsPage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('chat')

  // SR Fee setting
  const [srFee, setSrFee] = useState(() => {
    const stored = localStorage.getItem(SR_FEE_KEY)
    return stored ? parseInt(stored) : DEFAULT_SR_FEE
  })
  const [srFeeInput, setSrFeeInput] = useState(String(srFee))
  const [srFeeSaved, setSrFeeSaved] = useState(false)

  const saveSrFee = () => {
    const val = parseInt(srFeeInput)
    if (isNaN(val) || val <= 0) return
    setSrFee(val)
    localStorage.setItem(SR_FEE_KEY, String(val))
    setSrFeeSaved(true)
    setTimeout(() => setSrFeeSaved(false), 2000)
  }

  // Claude chat
  const [messages, setMessages] = useState([
    { role: 'assistant', content: `Hi! I'm Quantum AI 👋\n\nI'm connected to your Leverage Quantum dashboard and can help you:\n\n• **Understand your ROAS data** — explain metrics, formulas, channel performance\n• **Interpret lead quality** — OPP→QL→STU funnel insights\n• **Update assumptions** — like SR fee per RAU\n• **Answer any questions** about your marketing data\n\nWhat would you like to know?` }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async () => {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    setError(null)
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setLoading(true)
    try {
      const history = [...messages, { role: 'user', content: userMsg }]
        .filter(m => m.role !== 'assistant' || messages.indexOf(m) > 0 || m.content.includes('Hi!') === false)
        .map(m => ({ role: m.role, content: m.content }))
      const reply = await askClaude(history.slice(-10))
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    } catch (e) {
      setError('Could not reach Claude API. Check your network or API key.')
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const QUICK = [
    'What is our overall ROAS for 2025?',
    'Which channel has the best CPL?',
    'Explain the difference between AC and VAS revenue',
    'Why is QL% low in Jul-Aug 2025?',
    'What is the SR fee formula used here?',
  ]

  function renderMd(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br/>')
  }

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>

        <div className={styles.header}>
          <div>
            <p className={styles.breadcrumb}>Settings</p>
            <h1 className={styles.title}>Settings & AI Assistant</h1>
            <p className={styles.subtitle}>Manage your preferences and chat with Quantum AI</p>
          </div>
        </div>

        {/* Tabs */}
        <div className={styles.tabs}>
          {[
            { id:'chat',    label:'🤖 Quantum AI Chat' },
            { id:'data',    label:'📊 Data Settings' },
            { id:'profile', label:'👤 Profile' },
          ].map(t => (
            <button key={t.id} className={`${styles.tab} ${activeTab===t.id?styles.tabActive:''}`}
              onClick={()=>setActiveTab(t.id)}>{t.label}</button>
          ))}
        </div>

        {/* CLAUDE CHAT TAB */}
        {activeTab === 'chat' && (
          <div className={styles.chatWrap}>
            <div className={styles.chatMessages}>
              {messages.map((m, i) => (
                <div key={i} className={m.role==='user'?styles.userMsg:styles.aiMsg}>
                  {m.role==='assistant' && (
                    <div className={styles.aiAvatar}>
                      <svg width="14" height="14" viewBox="0 0 22 22" fill="none">
                        <rect x="1" y="12" width="4" height="9" rx="1.5" fill="#4BAE8A"/>
                        <rect x="7" y="7" width="4" height="14" rx="1.5" fill="#1C9FD4"/>
                        <rect x="13" y="4" width="4" height="17" rx="1.5" fill="#1F3C84"/>
                      </svg>
                    </div>
                  )}
                  <div className={styles.msgBubble} dangerouslySetInnerHTML={{__html: renderMd(m.content)}}/>
                </div>
              ))}
              {loading && (
                <div className={styles.aiMsg}>
                  <div className={styles.aiAvatar}>
                    <svg width="14" height="14" viewBox="0 0 22 22" fill="none">
                      <rect x="1" y="12" width="4" height="9" rx="1.5" fill="#4BAE8A"/>
                      <rect x="7" y="7" width="4" height="14" rx="1.5" fill="#1C9FD4"/>
                      <rect x="13" y="4" width="4" height="17" rx="1.5" fill="#1F3C84"/>
                    </svg>
                  </div>
                  <div className={styles.msgBubble}><span className={styles.typing}><span/><span/><span/></span></div>
                </div>
              )}
              {error && <div className={styles.errorMsg}>{error}</div>}
              <div ref={bottomRef}/>
            </div>

            {/* Quick prompts */}
            <div className={styles.quickWrap}>
              {QUICK.map(q => (
                <button key={q} className={styles.quickBtn} onClick={()=>{setInput(q);}}>{q}</button>
              ))}
            </div>

            <div className={styles.inputRow}>
              <textarea
                className={styles.chatInput}
                placeholder="Ask about your ROAS, leads, revenue... (Enter to send)"
                value={input}
                onChange={e=>setInput(e.target.value)}
                onKeyDown={handleKey}
                rows={2}
              />
              <button className={styles.sendBtn} onClick={sendMessage} disabled={loading||!input.trim()}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* DATA SETTINGS TAB */}
        {activeTab === 'data' && (
          <div className={styles.settingsWrap}>
            <div className={styles.settingCard}>
              <h3 className={styles.settingTitle}>SR Revenue Assumptions</h3>
              <p className={styles.settingDesc}>SR (Student Recruitment) fee per RAU used to calculate Estimated SR Revenue. Formula: RAUs × SR Fee × 0.9</p>
              <div className={styles.settingRow}>
                <label>SR Fee per RAU (₹)</label>
                <div className={styles.inputGroup}>
                  <span className={styles.prefix}>₹</span>
                  <input
                    type="number"
                    className={styles.settingInput}
                    value={srFeeInput}
                    onChange={e=>setSrFeeInput(e.target.value)}
                    placeholder="90000"
                  />
                  <button className={styles.saveBtn} onClick={saveSrFee}>
                    {srFeeSaved ? '✓ Saved' : 'Save'}
                  </button>
                </div>
              </div>
              <div className={styles.settingNote}>
                Current: ₹{srFee.toLocaleString('en-IN')} per RAU · Est SR Rev = RAUs × ₹{srFee.toLocaleString('en-IN')} × 0.9
              </div>
            </div>

            <div className={styles.settingCard}>
              <h3 className={styles.settingTitle}>Data Sources</h3>
              <p className={styles.settingDesc}>Currently connected BigQuery tables and CIB data.</p>
              <div className={styles.dataSourceList}>
                {[
                  { name:'Leads / OPPs',    src:'BigQuery → bquxjob_43e7ac2d',  status:'live', rows:'61,184' },
                  { name:'Futwork QLs',     src:'BigQuery → bquxjob_fae89e6',   status:'live', rows:'4,127'  },
                  { name:'Apps / STUs',     src:'BigQuery → bquxjob_3e9855ab',  status:'live', rows:'3,170'  },
                  { name:'Ad Spend',        src:'BigQuery → bquxjob_7f12611f',  status:'live', rows:'3,492'  },
                  { name:'AC/VAS Revenue',  src:'CIB Sourcewise Data',          status:'live', rows:'3,828'  },
                ].map(s=>(
                  <div key={s.name} className={styles.dataSourceRow}>
                    <div>
                      <div className={styles.dsName}>{s.name}</div>
                      <div className={styles.dsSrc}>{s.src} · {s.rows} rows</div>
                    </div>
                    <span className={styles.dsLive}>● Live</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* PROFILE TAB */}
        {activeTab === 'profile' && (
          <div className={styles.settingsWrap}>
            <div className={styles.settingCard}>
              <h3 className={styles.settingTitle}>Your Profile</h3>
              <div className={styles.profileRow}>
                <div className={styles.profileAvatar}>
                  {user?.picture
                    ? <img src={user.picture} alt={user.name} className={styles.profileImg}/>
                    : <span>{user?.name?.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()||'LE'}</span>
                  }
                </div>
                <div>
                  <div className={styles.profileName}>{user?.name || 'User'}</div>
                  <div className={styles.profileEmail}>{user?.email}</div>
                  <div className={styles.profileBadge}>@leverageedu.com</div>
                </div>
              </div>
            </div>

            <div className={styles.settingCard}>
              <h3 className={styles.settingTitle}>Platform Info</h3>
              <div className={styles.infoGrid}>
                {[
                  {l:'Version',      v:'1.0.0'},
                  {l:'Data Period',  v:'Jan – Dec 2025'},
                  {l:'Channels',     v:'Facebook, Google'},
                  {l:'Last Updated', v:new Date().toLocaleDateString('en-IN')},
                ].map(i=>(
                  <div key={i.l} className={styles.infoRow}>
                    <span className={styles.infoLabel}>{i.l}</span>
                    <span className={styles.infoVal}>{i.v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
