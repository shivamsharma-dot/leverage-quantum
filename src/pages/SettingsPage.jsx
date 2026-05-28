import { useState, useRef, useEffect } from 'react'
import Sidebar from '../components/Sidebar'
import { useAuth, isAdmin, getAccessList, addUserAccess, removeUserAccess } from '../hooks/useAuth'
import styles from './SettingsPage.module.css'

const SUPABASE_URL = 'https://tsyekthwthxszmsgqfej.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzeWVrdGh3dGh4c3ptc2dxZmVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NjkzMDIsImV4cCI6MjA5NTM0NTMwMn0.bdM9h5c3PDu9hgggjBdbA-eb7kfF-79c6txOnCUxRhY'
const GEMINI_KEY = 'AIzaSyDB5rRgbQV5yw_iXC-I8IbsB_G1cyOTXGo'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`

const SYSTEM_PROMPT = `You are Quantum AI, the analytics assistant for Leverage Edu's internal marketing dashboard called Leverage Quantum.

You have access to the COMPLETE 2025 marketing data below. Use it to give precise, data-driven answers.

=== FULL 2025 DATA ===
{"totals":{"total_opps":1869388,"total_qls":98607,"total_apps":18345,"total_spend":294506772,"total_ac_rev":154372047,"total_vas_rev":291519433,"total_rev":445891480,"avg_roas":1.51,"avg_cpl":2987,"avg_ql_pct":5.3,"data_period":"Jan-2025 to Dec-2025"},"monthly":[{"month":"Jan-2025","opps":187351,"qls":9650,"apps":2713,"spend":34861286,"ac_rev":0,"vas_rev":0,"total_rev":0,"roas":0,"cpl":3613,"ql_pct":5.2},{"month":"Feb-2025","opps":160123,"qls":8706,"apps":2408,"spend":31755969,"ac_rev":0,"vas_rev":0,"total_rev":0,"roas":0,"cpl":3648,"ql_pct":5.4},{"month":"Mar-2025","opps":188520,"qls":9902,"apps":2353,"spend":36198990,"ac_rev":0,"vas_rev":0,"total_rev":0,"roas":0,"cpl":3656,"ql_pct":5.3},{"month":"Apr-2025","opps":177450,"qls":9761,"apps":2363,"spend":28870684,"ac_rev":0,"vas_rev":0,"total_rev":0,"roas":0,"cpl":2958,"ql_pct":5.5},{"month":"May-2025","opps":274409,"qls":10009,"apps":1843,"spend":25079897,"ac_rev":0,"vas_rev":0,"total_rev":0,"roas":0,"cpl":2506,"ql_pct":3.6},{"month":"Jun-2025","opps":151862,"qls":7731,"apps":1031,"spend":16952827,"ac_rev":0,"vas_rev":0,"total_rev":0,"roas":0,"cpl":2193,"ql_pct":5.1},{"month":"Jul-2025","opps":123682,"qls":6093,"apps":638,"spend":13518770,"ac_rev":0,"vas_rev":0,"total_rev":0,"roas":0,"cpl":2219,"ql_pct":4.9},{"month":"Aug-2025","opps":118330,"qls":5435,"apps":447,"spend":13459560,"ac_rev":31084308,"vas_rev":58900582,"total_rev":89984890,"roas":6.69,"cpl":2476,"ql_pct":4.6},{"month":"Sep-2025","opps":125593,"qls":7365,"apps":1067,"spend":22956582,"ac_rev":27327327,"vas_rev":49381496,"total_rev":76708823,"roas":3.34,"cpl":3117,"ql_pct":5.9},{"month":"Oct-2025","opps":115599,"qls":7298,"apps":1438,"spend":24376429,"ac_rev":28673987,"vas_rev":27704839,"total_rev":56378826,"roas":2.31,"cpl":3340,"ql_pct":6.3},{"month":"Nov-2025","opps":121033,"qls":8220,"apps":1287,"spend":23749776,"ac_rev":33807274,"vas_rev":54800965,"total_rev":88608239,"roas":3.73,"cpl":2889,"ql_pct":6.8},{"month":"Dec-2025","opps":125436,"qls":8437,"apps":757,"spend":22726002,"ac_rev":33479151,"vas_rev":100731551,"total_rev":134210702,"roas":5.91,"cpl":2694,"ql_pct":6.7}],"channels":[{"channel":"Google","opps":328681,"qls":14309,"apps":5551,"spend":152195112,"ac_rev":89881228,"vas_rev":140047509,"total_rev":229928737,"cpl":10636,"roas":1.51,"ql_pct":4.4},{"channel":"Facebook","opps":324210,"qls":24488,"apps":4298,"spend":142311660,"ac_rev":82716615,"vas_rev":99456346,"total_rev":182172961,"cpl":5811,"roas":1.28,"ql_pct":7.6},{"channel":"Other","opps":544185,"qls":48764,"apps":6902,"spend":0,"ac_rev":218272892,"vas_rev":282683710,"total_rev":500956602,"cpl":0,"roas":0,"ql_pct":9.0},{"channel":"Affiliate","opps":666904,"qls":10601,"apps":1438,"spend":0,"ac_rev":19809364,"vas_rev":22307154,"total_rev":42116518,"cpl":0,"roas":0,"ql_pct":1.6},{"channel":"Bing","opps":4827,"qls":311,"apps":167,"spend":0,"ac_rev":721650,"vas_rev":7452998,"total_rev":8174648,"cpl":0,"roas":0,"ql_pct":6.4},{"channel":"LinkedIn","opps":581,"qls":134,"apps":8,"spend":0,"ac_rev":0,"vas_rev":0,"total_rev":0,"cpl":0,"roas":0,"ql_pct":23.1}]}

=== KEY METRICS EXPLAINED ===
- OPPs: Raw leads generated from paid campaigns
- QLs: Leads qualified by Futwork (our outsourced qualification team)
- STUs/Apps: University applications submitted
- CPL: Cost per Qualified Lead = Spend / QLs
- CPQL: Same as CPL in this context
- AC Revenue: Admission Counselling revenue (collected)
- VAS Revenue: Value Added Services revenue (collected)  
- Total Revenue: AC + VAS collected
- ROAS: Total Revenue / Ad Spend
- Projected Revenue: SR revenue (RAUs x 90K x 0.9) + AC projected + VAS projected
- QL%: Qualified leads / Total leads
- L→Q%: Same as QL%
- Channels: Facebook (main), Google, Affiliate, Bing, LinkedIn
- Revenue data: Only available Aug-Dec 2025 (CIB data period)
- Spend data: Jan-Dec 2025 (BigQuery)

=== YOUR ROLE ===
Analyse the data and answer questions about:
- ROAS performance by month and channel
- CPL trends and which campaigns/channels are most efficient
- Lead quality (QL%) analysis
- Revenue breakdown (AC vs VAS)
- Month-over-month comparisons
- Funnel conversion rates (OPP → QL → App)
- Budget allocation recommendations based on data
- Any metric available in the dashboard

Rules:
- Be concise and data-driven
- Always cite specific numbers from the data
- Use ₹ for Indian currency
- Format large numbers: use L (lakhs) for 100K+, Cr for 10M+
- When comparing months, show the delta
- Don't make up data that isn't in the context
- If asked to "fix" or "change" the dashboard, politely say that's not your role — you only analyse`

async function askGemini(messages) {
  // Build Gemini conversation format
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }))

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      generationConfig: { temperature: 0.3, maxOutputTokens: 1000 }
    })
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error?.message || `API error ${res.status}`)
  }
  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response'
}

async function updateUserRole(email, role) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/allowed_users?email=eq.${encodeURIComponent(email)}`, {
    method: 'PATCH',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify({ role })
  })
  return res.ok
}

const DASHBOARDS = [
  { id:'roas',         label:'ROAS',          icon:'📈' },
  { id:'mtd',          label:'MTD',           icon:'📅' },
  { id:'lead_quality', label:'Lead Quality',  icon:'🎯' },
  { id:'channel_mix',  label:'Channel Mix',   icon:'📊' },
  { id:'revenue',      label:'Revenue',       icon:'💰' },
  { id:'settings',     label:'Settings',      icon:'⚙️' },
]

function parsePermissions(role) {
  if (!role || role === 'viewer') return DASHBOARDS.map(d => d.id)
  if (role === 'admin') return DASHBOARDS.map(d => d.id)
  if (role === 'roas_only') return ['roas']
  if (role?.startsWith('custom:')) return role.replace('custom:', '').split(',').filter(Boolean)
  return DASHBOARDS.map(d => d.id)
}
function buildRoleString(ids, isAdm) {
  if (isAdm) return 'admin'
  if (ids.length === DASHBOARDS.length) return 'viewer'
  return 'custom:' + ids.join(',')
}
function matchCombo(ids) {
  const s = [...ids].sort().join(',')
  return ALL_COMBOS?.find(c => [...c.ids].sort().join(',') === s)
}
function getRoleDisplay(role) {
  if (role === 'admin') return { label:'Admin', color:'#D97706', bg:'#FFFBEB', border:'#FDE68A' }
  const ids = parsePermissions(role)
  if (ids.length === DASHBOARDS.length) return { label:'Full Access', color:'#059669', bg:'#ECFDF5', border:'#A7F3D0' }
  if (ids.length === 1 && ids[0] === 'roas') return { label:'ROAS Only', color:'#6366F1', bg:'#EEF2FF', border:'#C7D2FE' }
  return { label:`Custom (${ids.length})`, color:'#0891B2', bg:'#ECFEFF', border:'#A5F3FC' }
}

const QUICK_PROMPTS = [
  { label: 'Overall ROAS 2025', q: 'What is our overall ROAS for 2025? Break it down by month.' },
  { label: 'Best CPL channel', q: 'Which channel has the best CPL? Compare Facebook vs Google.' },
  { label: 'Revenue breakdown', q: 'Break down AC vs VAS revenue for Aug-Dec 2025.' },
  { label: 'QL% trend', q: 'Analyse our QL% trend across all months. Which months were worst?' },
  { label: 'Funnel analysis', q: 'Give me a complete funnel analysis: OPPs → QLs → Apps with conversion rates.' },
  { label: 'Spend efficiency', q: 'Which months had the best spend efficiency? Show spend vs revenue.' },
  { label: 'Peak performance', q: 'Which month and channel combination performed best overall?' },
  { label: 'Dec 2025 summary', q: 'Give me a full summary of December 2025 performance.' },
]

export default function SettingsPage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('chat')
  const userIsAdmin = isAdmin(user?.email)

  // SR Fee
  const [srFeeInput, setSrFeeInput] = useState(() => localStorage.getItem('lq_sr_fee')||'90000')
  const [srFeeSaved, setSrFeeSaved] = useState(false)
  const saveSrFee = () => {
    const v = parseInt(srFeeInput)
    if(isNaN(v)||v<=0) return
    localStorage.setItem('lq_sr_fee', String(v))
    setSrFeeSaved(true); setTimeout(()=>setSrFeeSaved(false), 2000)
  }

  // Users
  const [accessList, setAccessList]     = useState([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [newEmail, setNewEmail]         = useState('')
  const [accessMsg, setAccessMsg]       = useState('')
  const [editingUser, setEditingUser]   = useState(null)
  const [editIds, setEditIds]           = useState([])
  const [editIsAdmin, setEditIsAdmin]   = useState(false)

  const loadUsers = async () => {
    setUsersLoading(true)
    setAccessList(await getAccessList())
    setUsersLoading(false)
  }
  useEffect(() => { if(userIsAdmin) loadUsers() }, [userIsAdmin])

  const setMsg = (m) => { setAccessMsg(m); setTimeout(()=>setAccessMsg(''), 4000) }

  const addUser = async () => {
    const email = newEmail.trim().toLowerCase()
    if (!email.includes('@leverageedu.com')) { setMsg('❌ Only @leverageedu.com emails'); return }
    if (accessList.find(u=>u.email===email)) { setMsg('❌ Already has access'); return }
    setUsersLoading(true)
    if(await addUserAccess(email, 'viewer', user?.email)){ setMsg(`✅ ${email} added`); setNewEmail(''); await loadUsers() }
    else { setMsg('❌ Failed to add') }
    setUsersLoading(false)
  }
  const removeUser = async (email) => {
    if(email===user?.email){ setMsg("❌ Can't remove yourself"); return }
    setUsersLoading(true)
    if(await removeUserAccess(email)){ setMsg(`✅ ${email} removed`); await loadUsers() }
    else { setMsg('❌ Failed') }
    setUsersLoading(false)
  }
  const startEdit = (u) => {
    setEditingUser(u.email)
    setEditIsAdmin(u.role==='admin')
    setEditIds(parsePermissions(u.role))
  }
  const saveEdit = async (email) => {
    setUsersLoading(true)
    const role = buildRoleString(editIds, editIsAdmin)
    if(await updateUserRole(email, role)){ setMsg('✅ Access updated'); await loadUsers() }
    else { setMsg('❌ Failed') }
    setEditingUser(null); setUsersLoading(false)
  }

  // CHAT
  const [messages, setMessages] = useState([{
    role:'assistant',
    content:'Hi! I'm Quantum AI — powered by Gemini.\n\nI have access to your **complete 2025 marketing data** including:\n• ₹29.45 Cr total spend across Jan–Dec\n• 18.69L OPPs, 98.6K QLs, 18.3K Apps\n• Revenue data for Aug–Dec (AC + VAS)\n• Channel breakdown: Facebook, Google, Affiliate\n\nAsk me anything about your ROAS, CPL, funnel, revenue or trends!'
  }])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatError, setChatError] = useState(null)
  const bottomRef = useRef(null)
  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:'smooth'}) },[messages])

  const sendChat = async (text) => {
    const msg = (text || chatInput).trim()
    if(!msg || chatLoading) return
    setChatInput(''); setChatError(null)
    const newMessages = [...messages, {role:'user', content:msg}]
    setMessages(newMessages)
    setChatLoading(true)
    try {
      // Only send last 10 messages to avoid token limits
      const history = newMessages.slice(-10)
      const reply = await askGemini(history)
      setMessages(p=>[...p,{role:'assistant',content:reply}])
    } catch(e) {
      setChatError(`Error: ${e.message}`)
    } finally { setChatLoading(false) }
  }

  function renderMd(t){
    return t
      .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
      .replace(/\*(.*?)\*/g,'<em>$1</em>')
      .replace(/`(.*?)`/g,'<code style="background:#F3F4F6;padding:1px 5px;border-radius:3px;font-size:11.5px">$1</code>')
      .replace(/\n/g,'<br/>')
      .replace(/\n/g,'<br/>')
  }

  return (
    <div className={styles.layout}>
      <Sidebar/>
      <main className={styles.main}>
        <div className={styles.header}>
          <div>
            <p className={styles.breadcrumb}>Settings</p>
            <h1 className={styles.title}>Settings & Quantum AI</h1>
            <p className={styles.subtitle}>Analytics assistant + team access management</p>
          </div>
        </div>

        <div className={styles.tabs}>
          {[
            {id:'chat',    label:'🤖 Quantum AI'},
            {id:'data',    label:'📊 Data'},
            ...(userIsAdmin?[{id:'users',label:'👥 User Access'}]:[]),
            {id:'profile', label:'👤 Profile'},
          ].map(t=>(
            <button key={t.id} className={`${styles.tab} ${activeTab===t.id?styles.tabActive:''}`}
              onClick={()=>setActiveTab(t.id)}>{t.label}</button>
          ))}
        </div>

        {/* CHAT */}
        {activeTab==='chat'&&(
          <div className={styles.chatWrap}>
            <div className={styles.chatMessages}>
              {messages.map((m,i)=>(
                <div key={i} className={m.role==='user'?styles.userMsg:styles.aiMsg}>
                  {m.role==='assistant'&&(
                    <div className={styles.aiAvatar}>
                      <svg width="14" height="14" viewBox="0 0 22 22" fill="none">
                        <rect x="1" y="12" width="4" height="9" rx="1.5" fill="#4BAE8A"/>
                        <rect x="7" y="7" width="4" height="14" rx="1.5" fill="#1C9FD4"/>
                        <rect x="13" y="4" width="4" height="17" rx="1.5" fill="#1F3C84"/>
                      </svg>
                    </div>
                  )}
                  <div className={styles.msgBubble} dangerouslySetInnerHTML={{__html:renderMd(m.content)}}/>
                </div>
              ))}
              {chatLoading&&(
                <div className={styles.aiMsg}>
                  <div className={styles.aiAvatar}>
                    <svg width="14" height="14" viewBox="0 0 22 22" fill="none">
                      <rect x="1" y="12" width="4" height="9" rx="1.5" fill="#4BAE8A"/>
                      <rect x="7" y="7" width="4" height="14" rx="1.5" fill="#1C9FD4"/>
                      <rect x="13" y="4" width="4" height="17" rx="1.5" fill="#1F3C84"/>
                    </svg>
                  </div>
                  <div className={styles.msgBubble}>
                    <span className={styles.typing}><span/><span/><span/></span>
                  </div>
                </div>
              )}
              {chatError&&<div className={styles.errorMsg}>{chatError}</div>}
              <div ref={bottomRef}/>
            </div>

            {/* Quick prompts — auto-send on click */}
            <div className={styles.quickWrap}>
              {QUICK_PROMPTS.map(p=>(
                <button key={p.label} className={styles.quickBtn}
                  onClick={()=>sendChat(p.q)}
                  disabled={chatLoading}>
                  {p.label}
                </button>
              ))}
            </div>

            <div className={styles.inputRow}>
              <textarea className={styles.chatInput}
                placeholder="Ask anything about your data... (Enter to send)"
                value={chatInput}
                onChange={e=>setChatInput(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChat()}}}
                rows={2}/>
              <button className={styles.sendBtn} onClick={()=>sendChat()} disabled={chatLoading||!chatInput.trim()}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* DATA */}
        {activeTab==='data'&&(
          <div className={styles.settingsWrap}>
            <div className={styles.settingCard}>
              <h3 className={styles.settingTitle}>SR Revenue Assumptions</h3>
              <p className={styles.settingDesc}>SR fee per RAU. Formula: RAUs × SR Fee × 0.9</p>
              <div className={styles.settingRow}>
                <label>SR Fee per RAU (₹)</label>
                <div className={styles.inputGroup}>
                  <span className={styles.prefix}>₹</span>
                  <input type="number" className={styles.settingInput} value={srFeeInput} onChange={e=>setSrFeeInput(e.target.value)}/>
                  <button className={styles.saveBtn} onClick={saveSrFee}>{srFeeSaved?'✓ Saved':'Save'}</button>
                </div>
              </div>
              <div className={styles.settingNote}>Current: ₹{parseInt(srFeeInput||90000).toLocaleString('en-IN')} per RAU</div>
            </div>
            <div className={styles.settingCard}>
              <h3 className={styles.settingTitle}>Data Sources</h3>
              <div className={styles.dataSourceList}>
                {[
                  {name:'Leads / OPPs',   src:'BigQuery', rows:'61,184'},
                  {name:'Futwork QLs',    src:'BigQuery', rows:'4,127'},
                  {name:'Apps / STUs',    src:'BigQuery', rows:'3,170'},
                  {name:'Ad Spend',       src:'BigQuery', rows:'3,492'},
                  {name:'AC/VAS Revenue', src:'CIB Data', rows:'3,828'},
                  {name:'MTD Live',       src:'Google Sheets (Overall PM)', rows:'Live'},
                ].map(s=>(
                  <div key={s.name} className={styles.dataSourceRow}>
                    <div><div className={styles.dsName}>{s.name}</div><div className={styles.dsSrc}>{s.src} · {s.rows} rows</div></div>
                    <span className={styles.dsLive}>● Connected</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* USER ACCESS */}
        {activeTab==='users'&&userIsAdmin&&(
          <div className={styles.settingsWrap}>
            <div className={styles.settingCard}>
              <h3 className={styles.settingTitle}>User Access Management</h3>
              <p className={styles.settingDesc}>Add users and control dashboard access. Changes apply instantly.</p>
              <div style={{background:'#F9FAFB',borderRadius:10,padding:'14px',marginBottom:14,border:'1px solid #F3F4F6'}}>
                <p style={{fontSize:12,fontWeight:600,color:'#374151',marginBottom:10}}>Add New User</p>
                <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
                  <input type="email" style={{padding:'8px 12px',border:'1px solid #E5E7EB',borderRadius:8,fontSize:12.5,fontFamily:'Inter,sans-serif',color:'#111827',outline:'none',width:240}}
                    placeholder="email@leverageedu.com" value={newEmail}
                    onChange={e=>setNewEmail(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addUser()}/>
                  <button onClick={addUser} disabled={usersLoading}
                    style={{padding:'8px 18px',borderRadius:8,background:'#111827',color:'#fff',border:'none',fontSize:12.5,fontWeight:600,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>
                    {usersLoading?'...':'+ Add'}
                  </button>
                </div>
              </div>
              {accessMsg&&<div style={{padding:'9px 14px',borderRadius:8,marginBottom:12,fontSize:12.5,color:accessMsg.startsWith('✅')?'#059669':'#DC2626',background:accessMsg.startsWith('✅')?'#ECFDF5':'#FEF2F2',border:`1px solid ${accessMsg.startsWith('✅')?'#A7F3D0':'#FECACA'}`}}>{accessMsg}</div>}
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                <p style={{fontSize:11,fontWeight:600,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.05em'}}>{usersLoading?'Loading...':`${accessList.length} users`}</p>
                <button onClick={loadUsers} style={{fontSize:11,color:'#1C9FD4',background:'none',border:'none',cursor:'pointer'}}>↻ Refresh</button>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {accessList.map(u=>{
                  const rl = getRoleDisplay(u.role)
                  const isEditing = editingUser===u.email
                  return(
                    <div key={u.email} style={{background:'#fff',borderRadius:10,border:'1px solid #F3F4F6',overflow:'hidden',boxShadow:'0 1px 2px rgba(0,0,0,0.04)'}}>
                      <div style={{display:'flex',alignItems:'center',gap:10,padding:'11px 14px'}}>
                        <div style={{width:32,height:32,borderRadius:'50%',background:rl.bg,border:`1px solid ${rl.border}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:rl.color,flexShrink:0}}>
                          {u.email[0].toUpperCase()}
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:12.5,fontWeight:600,color:'#111827',display:'flex',alignItems:'center',gap:5}}>
                            {u.email}
                            {u.email===user?.email&&<span style={{fontSize:9.5,background:'#ECFDF5',color:'#059669',border:'1px solid #A7F3D0',borderRadius:4,padding:'1px 6px',fontWeight:700}}>YOU</span>}
                          </div>
                          <span style={{fontSize:11,fontWeight:600,color:rl.color,background:rl.bg,border:`1px solid ${rl.border}`,borderRadius:4,padding:'1px 7px',marginTop:3,display:'inline-block'}}>{rl.label}</span>
                        </div>
                        {u.email!==user?.email&&(
                          <div style={{display:'flex',gap:6}}>
                            <button onClick={()=>isEditing?setEditingUser(null):startEdit(u)}
                              style={{padding:'5px 11px',borderRadius:6,border:'1px solid #E5E7EB',background:'#fff',color:'#374151',fontSize:11.5,fontWeight:500,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>
                              {isEditing?'Cancel':'Edit'}
                            </button>
                            <button onClick={()=>removeUser(u.email)}
                              style={{padding:'5px 11px',borderRadius:6,border:'1px solid #FECACA',background:'#FEF2F2',color:'#DC2626',fontSize:11.5,fontWeight:500,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                      {isEditing&&(
                        <div style={{borderTop:'1px solid #F3F4F6',padding:'14px',background:'#FAFBFF'}}>
                          <p style={{fontSize:11.5,fontWeight:600,color:'#374151',marginBottom:10}}>Dashboard access for {u.email}:</p>
                          <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
                            <label style={{display:'flex',alignItems:'center',gap:5,padding:'6px 10px',borderRadius:7,border:`1.5px solid ${editIsAdmin?'#D97706':'#E5E7EB'}`,background:editIsAdmin?'#FFFBEB':'#fff',cursor:'pointer',fontSize:12,fontWeight:editIsAdmin?600:400}}>
                              <input type="checkbox" checked={editIsAdmin} onChange={e=>setEditIsAdmin(e.target.checked)} style={{accentColor:'#D97706'}}/>
                              Admin
                            </label>
                            {!editIsAdmin&&DASHBOARDS.map(d=>{
                              const checked=editIds.includes(d.id)
                              return(
                                <label key={d.id} style={{display:'flex',alignItems:'center',gap:5,padding:'6px 10px',borderRadius:7,border:`1.5px solid ${checked?'#6366F1':'#E5E7EB'}`,background:checked?'#EEF2FF':'#fff',cursor:'pointer',fontSize:12,fontWeight:checked?600:400,color:checked?'#4F46E5':'#374151'}}>
                                  <input type="checkbox" checked={checked} onChange={()=>setEditIds(p=>checked?p.filter(x=>x!==d.id):[...p,d.id])} style={{accentColor:'#6366F1'}}/>
                                  {d.label}
                                </label>
                              )
                            })}
                          </div>
                          <button onClick={()=>saveEdit(u.email)} style={{padding:'7px 16px',borderRadius:8,background:'#6366F1',color:'#fff',border:'none',fontSize:12.5,fontWeight:600,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>Save</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* PROFILE */}
        {activeTab==='profile'&&(
          <div className={styles.settingsWrap}>
            <div className={styles.settingCard}>
              <h3 className={styles.settingTitle}>Your Profile</h3>
              <div className={styles.profileRow}>
                <div className={styles.profileAvatar}>
                  {user?.picture?<img src={user.picture} alt={user.name} className={styles.profileImg}/>
                    :<span>{user?.name?.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()||'LE'}</span>}
                </div>
                <div>
                  <div className={styles.profileName}>{user?.name||'User'}</div>
                  <div className={styles.profileEmail}>{user?.email}</div>
                  <div className={styles.profileBadge}>{user?.role==='admin'?'👑 Admin':'Member'}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
