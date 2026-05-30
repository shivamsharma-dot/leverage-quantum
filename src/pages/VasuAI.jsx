import { useState, useRef, useEffect } from 'react'
import Sidebar from '../components/Sidebar'
import styles from './VasuAI.module.css'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY
const TOKEN_KEY = 'lq_meta_token'
const AD_ACCOUNT = 'act_641914389215638'

function buildSystemPrompt(metaData) {
  const dataSection = metaData ? `
You have access to the following LIVE Meta Ads data for Leverage Edu (act_641914389215638):

AD SPEND last 7d: ${metaData.spend}
IMPRESSIONS: ${metaData.impressions}
CLICKS: ${metaData.clicks}
CTR: ${metaData.ctr}%
PIXEL: ${metaData.pixelName} (${metaData.pixelId})

LEAD EVENTS last 7d vs prev 7d:
${Object.entries(metaData.pixelEvents||{}).map(([k,v])=>`- ${k}: ${v.curr.toLocaleString()} vs ${v.prev.toLocaleString()} (${v.prev>0?((v.curr-v.prev)/v.prev*100).toFixed(1)+'%':'new'})`).join('\n')}

TOP CAMPAIGNS last 7d:
${(metaData.campaigns||[]).slice(0,15).map(c=>{
  const ins = c.insights?.data?.[0]||{}
  return `- ${c.name} | ${c.status} | Spend: $${parseFloat(ins.spend||0).toFixed(0)} | Impr: ${parseInt(ins.impressions||0).toLocaleString()} | Clicks: ${parseInt(ins.clicks||0).toLocaleString()}`
}).join('\n')}
` : 'No Meta Ads data loaded. User needs to connect their Meta account on the Meta Ads dashboard first.'

  return `You are VASU AI (Visual Analytics & Strategy Unit) — the Meta Ads intelligence layer inside Leverage Quantum, Leverage Edu's internal marketing platform.

Your entire focus is Meta Ads: campaign performance, pixel integrity, lead funnel health, CPL optimization, and ROAS improvement for Leverage Edu.

${dataSection}

Guidelines:
- Lead with the key metric or finding, then explain why it matters.
- Always give specific, actionable next steps — not generic advice.
- Flag anomalies: pixel drops, CTR spikes, CPL changes, paused campaigns.
- Format numbers: ₹ for INR (multiply USD × 83), K/L/Cr for scale.
- If pixel events show 0, diagnose: wrong event name, pixel not installed, wrong ad account, permission issue.
- You are read-only — never claim to make changes to campaigns.`
}

async function askGroq(messages, metaData) {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'system', content: buildSystemPrompt(metaData) }, ...messages],
      temperature: 0.3,
      max_tokens: 1024,
    })
  })
  if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || 'Groq error') }
  const d = await res.json()
  return d.choices?.[0]?.message?.content || '(no response)'
}

async function graphGet(path, token, params={}) {
  const qs = new URLSearchParams({ access_token: token, ...params }).toString()
  const res = await fetch(`https://graph.facebook.com/v19.0/${path}?${qs}`)
  const d = await res.json()
  if (d.error) throw new Error(d.error.message)
  return d
}

const QUICK_PROMPTS = [
  'Analyse my campaigns', 'Why is CPL high?', 'Pixel health check',
  'Best performing campaign', 'Where to cut spend?', 'Lead drop analysis',
  'CTR benchmark', 'Recommendations this week',
]

export default function VasuAI() {
  const [messages, setMessages]   = useState([])
  const [input, setInput]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [metaData, setMetaData]   = useState(null)
  const [metaLoading, setMetaLoading] = useState(false)
  const [connected, setConnected] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (token) loadMetaContext(token)
    else {
      setMessages([{
        role: 'assistant',
        content: `Hi! I'm **VASU AI** — your Meta Ads intelligence layer.\n\nI need your Meta Ads data to analyse. Please go to the **Meta Ads** dashboard first and connect your account. Once connected, come back here and I'll have full access to your campaigns, pixel events and lead data.`
      }])
    }
  }, [])

  const loadMetaContext = async (token) => {
    setMetaLoading(true)
    try {
      const getDateRange = (daysAgo, len=7) => {
        const e = new Date(); e.setDate(e.getDate()-daysAgo)
        const s = new Date(e); s.setDate(s.getDate()-len+1)
        const f = d => d.toISOString().slice(0,10)
        return { since:f(s), until:f(e) }
      }
      const thisWeek = getDateRange(0,7), lastWeek = getDateRange(7,7)
      const getAction = (actions,type) => parseInt(actions?.find(a=>a.action_type===type)?.value||0)

      const [insNow, insPrev, campaigns, pixels] = await Promise.all([
        graphGet(`${AD_ACCOUNT}/insights`, token, { fields:'spend,impressions,clicks,ctr,actions', time_range:JSON.stringify(thisWeek), level:'account' }),
        graphGet(`${AD_ACCOUNT}/insights`, token, { fields:'spend,impressions,clicks,ctr,actions', time_range:JSON.stringify(lastWeek), level:'account' }),
        graphGet(`${AD_ACCOUNT}/campaigns`, token, { fields:'name,status,objective,insights{spend,impressions,clicks}', limit:20, date_preset:'last_7d' }),
        graphGet(`${AD_ACCOUNT}/adspixels`, token, { fields:'id,name' }),
      ])

      const now  = insNow.data?.[0]  || {}
      const prev = insPrev.data?.[0] || {}
      const na = now.actions||[], pa = prev.actions||[]

      const data = {
        spend:      `$${parseFloat(now.spend||0).toFixed(2)} (~₹${(parseFloat(now.spend||0)*83/1e7).toFixed(2)} Cr)`,
        impressions: parseInt(now.impressions||0).toLocaleString(),
        clicks:     parseInt(now.clicks||0).toLocaleString(),
        ctr:        parseFloat(now.ctr||0).toFixed(2),
        pixelName:  pixels.data?.[0]?.name || 'Unknown',
        pixelId:    pixels.data?.[0]?.id || '—',
        campaigns:  campaigns.data || [],
        pixelEvents: {
          'Leads (Total)':      { curr:getAction(na,'lead'), prev:getAction(pa,'lead') },
          'Pixel Leads':        { curr:getAction(na,'offsite_conversion.fb_pixel_lead'), prev:getAction(pa,'offsite_conversion.fb_pixel_lead') },
          'Web Leads (Onsite)': { curr:getAction(na,'onsite_web_lead'), prev:getAction(pa,'onsite_web_lead') },
        }
      }

      setMetaData(data)
      setConnected(true)
      setMessages([{
        role: 'assistant',
        content: `Hi! I'm **VASU AI** — connected to your Meta Ads account ✅\n\n**Quick snapshot (last 7 days):**\n- Spend: ${data.spend}\n- Impressions: ${data.impressions} | Clicks: ${data.clicks} | CTR: ${data.ctr}%\n- Leads: ${data.pixelEvents['Leads (Total)'].curr.toLocaleString()} total\n- Pixel: ${data.pixelName}\n- ${data.campaigns.length} campaigns loaded\n\nAsk me anything — campaign analysis, pixel health, CPL optimisation, or what to do this week.`
      }])
    } catch(e) {
      setMessages([{ role:'assistant', content:`⚠️ Couldn't load Meta Ads data: ${e.message}\n\nGo to **Meta Ads** dashboard, disconnect and reconnect your account.` }])
    } finally { setMetaLoading(false) }
  }

  const send = async (text) => {
    const q = (text||input).trim()
    if (!q || loading) return
    setInput('')
    const updated = [...messages, { role:'user', content:q }]
    setMessages(updated)
    setLoading(true)
    try {
      const reply = await askGroq(updated.slice(-12), metaData)
      setMessages(m => [...m, { role:'assistant', content:reply }])
    } catch(e) {
      setMessages(m => [...m, { role:'assistant', content:`⚠️ ${e.message}` }])
    } finally { setLoading(false) }
  }

  const render = c => c.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br/>')

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
            {connected
              ? <span className={styles.connectedBadge}>● Meta Ads connected</span>
              : <span className={styles.disconnectedBadge}>○ Not connected</span>
            }
            <span className={styles.modelBadge}>Llama 3.3 · Groq</span>
          </div>
        </div>

        <div className={styles.content}>
          <div className={styles.chatWrap}>
            <div className={styles.messages}>
              {metaLoading ? (
                <div style={{textAlign:'center',padding:40,color:'#9CA3AF',fontSize:13}}>
                  <div className={styles.bigSpinner}/>
                  <p style={{marginTop:12}}>Loading Meta Ads context…</p>
                </div>
              ) : messages.map((m,i) => (
                <div key={i} className={m.role==='user' ? styles.userMsg : styles.asstMsg}>
                  {m.role==='assistant' && (
                    <div className={styles.avatar}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1C9FD4" strokeWidth="2" strokeLinecap="round">
                        <rect x="3" y="3" width="4" height="18" rx="1"/><rect x="10" y="8" width="4" height="13" rx="1"/><rect x="17" y="5" width="4" height="16" rx="1"/>
                      </svg>
                    </div>
                  )}
                  <div className={styles.bubble} dangerouslySetInnerHTML={{__html:render(m.content)}}/>
                </div>
              ))}
              {loading && (
                <div className={styles.asstMsg}>
                  <div className={styles.avatar}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1C9FD4" strokeWidth="2" strokeLinecap="round">
                      <rect x="3" y="3" width="4" height="18" rx="1"/><rect x="10" y="8" width="4" height="13" rx="1"/><rect x="17" y="5" width="4" height="16" rx="1"/>
                    </svg>
                  </div>
                  <div className={styles.bubble}><span className={styles.typing}><span/><span/><span/></span></div>
                </div>
              )}
              <div ref={bottomRef}/>
            </div>

            <div className={styles.quickRow}>
              {QUICK_PROMPTS.map(p => (
                <button key={p} className={styles.quickBtn} onClick={()=>send(p)} disabled={loading||!connected}>{p}</button>
              ))}
            </div>

            <div className={styles.inputRow}>
              <textarea className={styles.input} value={input}
                onChange={e => { setInput(e.target.value); e.target.style.height='auto'; e.target.style.height=Math.min(e.target.scrollHeight,160)+'px' }}
                onKeyDown={e => { if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); send() } }}
                placeholder={connected ? "Ask about your Meta Ads campaigns… (Shift+Enter for new line)" : "Connect Meta Ads first to start chatting…"}
                disabled={loading||!connected}
                rows={1}
                style={{resize:'none',overflowY:'auto'}}
              />
              <button className={styles.sendBtn} onClick={()=>send()} disabled={loading||!input.trim()||!connected}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
