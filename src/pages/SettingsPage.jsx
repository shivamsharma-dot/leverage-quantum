import { useState, useRef, useEffect } from 'react'
import Sidebar from '../components/Sidebar'
import { useAuth, isAdmin, getAccessList, addUserAccess, removeUserAccess } from '../hooks/useAuth'
import { DATA_CONTEXT } from '../data/aiContext.js'
import { getActivityLog } from '../components/ActivityLogger.js'
import styles from './SettingsPage.module.css'

const SUPABASE_URL = 'https://tsyekthwthxszmsgqfej.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzeWVrdGh3dGh4c3ptc2dxZmVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NjkzMDIsImV4cCI6MjA5NTM0NTMwMn0.bdM9h5c3PDu9hgggjBdbA-eb7kfF-79c6txOnCUxRhY'
const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

function buildSystemPrompt() {
  const t = DATA_CONTEXT.totals
  const months = DATA_CONTEXT.monthly.map(m =>
    m.month + ': spend=' + m.spend + ' opps=' + m.opps + ' qls=' + m.qls + ' apps=' + m.apps +
    ' ac_rev=' + m.ac_rev + ' vas_rev=' + m.vas_rev + ' roas=' + m.roas + ' cpl=' + m.cpl + ' ql_pct=' + m.ql_pct + '%'
  ).join('\n')
  const channels = DATA_CONTEXT.channels.map(c =>
    c.channel + ': spend=' + c.spend + ' opps=' + c.opps + ' qls=' + c.qls +
    ' cpl=' + c.cpl + ' roas=' + c.roas + ' ql_pct=' + c.ql_pct + '%'
  ).join('\n')

  return [
    'You are Quantum AI, the analytics assistant embedded in Leverage Quantum — an internal marketing dashboard for Leverage Edu.',
    '',
    '=== YOUR ROLE ===',
    'Analyse the 2025 marketing data below and answer questions about ROAS, CPL, leads, revenue, funnel performance, and channel efficiency.',
    'IMPORTANT: You are a READ-ONLY analyst. If asked to modify, fix, or change any dashboard, politely decline and say you only analyse data.',
    '',
    '=== 2025 FULL YEAR TOTALS ===',
    'Period: Jan-2025 to Dec-2025',
    'Total OPPs (leads): ' + t.total_opps.toLocaleString(),
    'Total QLs (qualified): ' + t.total_qls.toLocaleString(),
    'Total Apps/STUs: ' + t.total_apps.toLocaleString(),
    'Total Spend: Rs.' + t.total_spend.toLocaleString(),
    'AC Revenue: Rs.' + t.total_ac_rev.toLocaleString(),
    'VAS Revenue: Rs.' + t.total_vas_rev.toLocaleString(),
    'Total Revenue: Rs.' + t.total_rev.toLocaleString(),
    'Avg ROAS: ' + t.avg_roas + 'x',
    'Avg CPL: Rs.' + t.avg_cpl,
    'Avg QL%: ' + t.avg_ql_pct + '%',
    '',
    '=== MONTHLY BREAKDOWN ===',
    months,
    '',
    '=== CHANNEL BREAKDOWN ===',
    channels,
    '',
    '=== GLOSSARY ===',
    'OPPs = Raw leads from paid campaigns',
    'QLs = Leads qualified by Futwork team',
    'STUs/Apps = University applications submitted',
    'CPL = Cost per Qualified Lead = Spend / QLs',
    'AC = Admission Counselling revenue (collected)',
    'VAS = Value Added Services revenue (collected)',
    'ROAS = Total Revenue / Ad Spend',
    'QL% = Qualified leads / Total OPPs',
    'Revenue data available only Aug-Dec 2025 (CIB data)',
    'Spend data Jan-Dec 2025 (BigQuery)',
    '',
    '=== FORMAT RULES ===',
    'Use Rs. prefix for Indian currency (avoid rupee symbol for compatibility)',
    'Use L for lakhs (100K), Cr for crores (10M)',
    'Be concise, cite specific numbers, highlight month-on-month changes',
    'Never make up data not in the context above',
  ].join('\n')
}

async function askGroq(messages) {
  const systemPrompt = buildSystemPrompt()
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_KEY },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))
      ],
      temperature: 0.3,
      max_tokens: 1200
    })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || 'Groq API error ' + res.status)
  }
  const data = await res.json()
  return data.choices?.[0]?.message?.content || 'No response'
}

async function updateUserRole(email, role) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/allowed_users?email=eq.' + encodeURIComponent(email), {
    method: 'PATCH',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify({ role })
  })
  return res.ok
}

const DASHBOARDS = [
  { id:'roas',         label:'ROAS'         },
  { id:'mtd',          label:'MTD'          },
  { id:'lead_quality', label:'Lead Quality' },
  { id:'channel_mix',  label:'Channel Mix'  },
  { id:'revenue',      label:'Revenue'      },
  { id:'settings',     label:'Settings'     },
]

function parsePermissions(role) {
  if (!role || role === 'viewer' || role === 'admin') return DASHBOARDS.map(d => d.id)
  if (role === 'roas_only') return ['roas']
  if (role.startsWith('custom:')) return role.replace('custom:', '').split(',').filter(Boolean)
  return DASHBOARDS.map(d => d.id)
}
function buildRoleString(ids, isAdm) {
  if (isAdm) return 'admin'
  if (ids.length === DASHBOARDS.length) return 'viewer'
  return 'custom:' + ids.join(',')
}
function getRoleDisplay(role) {
  if (role === 'admin') return { label:'Admin', color:'#D97706', bg:'#FFFBEB', border:'#FDE68A' }
  const ids = parsePermissions(role)
  if (ids.length === DASHBOARDS.length) return { label:'Full Access', color:'#059669', bg:'#ECFDF5', border:'#A7F3D0' }
  if (ids.length === 1 && ids[0] === 'roas') return { label:'ROAS Only', color:'#6366F1', bg:'#EEF2FF', border:'#C7D2FE' }
  return { label:'Custom (' + ids.length + ')', color:'#0891B2', bg:'#ECFEFF', border:'#A5F3FC' }
}

const QUICK_PROMPTS = [
  { label:'Overall ROAS',       q:'What is our overall ROAS for 2025? Break it down by month and highlight best/worst.' },
  { label:'CPL by channel',     q:'Compare CPL across all channels. Which is most and least efficient?' },
  { label:'AC vs VAS revenue',  q:'Break down AC vs VAS revenue for Aug-Dec 2025. Which vertical is stronger?' },
  { label:'QL% trend',          q:'Analyse our QL% trend month by month. Which months were worst and why might that be?' },
  { label:'Funnel analysis',    q:'Give me a complete funnel: OPPs to QLs to Apps with conversion rates for 2025.' },
  { label:'Spend efficiency',   q:'Which months had the best spend efficiency? Show spend vs revenue vs ROAS.' },
  { label:'Best month',         q:'Which month performed best overall? Consider ROAS, CPL, and QL% together.' },
  { label:'Recommendations',    q:'Based on 2025 data, what are your top 3 recommendations for improving performance?' },
]

export default function SettingsPage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('chat')
  const userIsAdmin = isAdmin(user?.email)
  const [activityLog, setActivityLog] = useState([])
  const [activityLoading, setActivityLoading] = useState(false)

  const loadActivity = async () => {
    setActivityLoading(true)
    const logs = await getActivityLog(200)
    setActivityLog(logs)
    setActivityLoading(false)
  }

  // SR Fee
  const [srFeeInput, setSrFeeInput] = useState(() => localStorage.getItem('lq_sr_fee') || '90000')
  const [srFeeSaved, setSrFeeSaved] = useState(false)
  const saveSrFee = () => {
    const v = parseInt(srFeeInput)
    if (isNaN(v) || v <= 0) return
    localStorage.setItem('lq_sr_fee', String(v))
    setSrFeeSaved(true)
    setTimeout(() => setSrFeeSaved(false), 2000)
  }

  // Users
  const [accessList, setAccessList] = useState([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [accessMsg, setAccessMsg] = useState('')
  const [editingUser, setEditingUser] = useState(null)
  const [editIds, setEditIds] = useState([])
  const [editIsAdmin, setEditIsAdmin] = useState(false)

  const loadUsers = async () => {
    setUsersLoading(true)
    setAccessList(await getAccessList())
    setUsersLoading(false)
  }
  useEffect(() => { if (userIsAdmin) loadUsers() }, [userIsAdmin])

  const setMsg = (m) => { setAccessMsg(m); setTimeout(() => setAccessMsg(''), 4000) }

  const addUser = async () => {
    const email = newEmail.trim().toLowerCase()
    if (!email.includes('@leverageedu.com')) { setMsg('No @leverageedu.com email'); return }
    if (accessList.find(u => u.email === email)) { setMsg('Already has access'); return }
    setUsersLoading(true)
    if (await addUserAccess(email, 'viewer', user?.email)) { setMsg('Added: ' + email); setNewEmail(''); await loadUsers() }
    else setMsg('Failed to add')
    setUsersLoading(false)
  }
  const removeUser = async (email) => {
    if (email === user?.email) { setMsg("Can't remove yourself"); return }
    setUsersLoading(true)
    if (await removeUserAccess(email)) { setMsg('Removed: ' + email); await loadUsers() }
    else setMsg('Failed')
    setUsersLoading(false)
  }
  const startEdit = (u) => {
    setEditingUser(u.email)
    setEditIsAdmin(u.role === 'admin')
    setEditIds(parsePermissions(u.role))
  }
  const saveEdit = async (email) => {
    setUsersLoading(true)
    const role = buildRoleString(editIds, editIsAdmin)
    if (await updateUserRole(email, role)) { setMsg('Access updated'); await loadUsers() }
    else setMsg('Failed')
    setEditingUser(null)
    setUsersLoading(false)
  }

  // Chat
  const [messages, setMessages] = useState([{
    role: 'assistant',
    content: 'Hi! I am Quantum AI, powered by Llama 3 (Groq).\n\nI have access to your complete 2025 marketing data:\n- Rs.29.45 Cr total spend (Jan-Dec)\n- 18.69L OPPs, 98.6K QLs, 18.3K Apps\n- Revenue data Aug-Dec (AC + VAS)\n- Channel breakdown: Facebook, Google, Affiliate\n\nAsk me anything about ROAS, CPL, revenue, funnel, or channel performance!'
  }])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatError, setChatError] = useState(null)
  const bottomRef = useRef(null)
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const sendChat = async (overrideText) => {
    const msg = (overrideText || chatInput).trim()
    if (!msg || chatLoading) return
    setChatInput('')
    setChatError(null)
    const updated = [...messages, { role: 'user', content: msg }]
    setMessages(updated)
    setChatLoading(true)
    try {
      const reply = await askGroq(updated.slice(-10), buildSystemPrompt())
      setMessages(p => [...p, { role: 'assistant', content: reply }])
    } catch (e) {
      setChatError('Error: ' + e.message)
    } finally {
      setChatLoading(false)
    }
  }

  function renderMd(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code style="background:#F3F4F6;padding:1px 5px;border-radius:3px;font-size:11.5px;font-family:monospace">$1</code>')
      .replace(/\n/g, '<br/>')
  }

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
        <div className={styles.header}>
          <div>
            <p className={styles.breadcrumb}>Settings</p>
            <h1 className={styles.title}>Settings & Quantum AI</h1>
            <p className={styles.subtitle}>Analytics assistant and team access management</p>
          </div>
        </div>

        <div className={styles.tabs}>
          {[
            { id:'chat',    label:'Quantum AI' },
            { id:'data',    label:'Data'       },
            ...(userIsAdmin ? [{ id:'users', label:'User Access' }, { id:'activity', label:'Activity Log' }] : []),
            { id:'profile', label:'Profile'    },
          ].map(t => (
            <button key={t.id}
              className={styles.tab + (activeTab === t.id ? ' ' + styles.tabActive : '')}
              onClick={() => setActiveTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* CHAT */}
        {activeTab === 'chat' && (
          <div className={styles.chatWrap}>
            <div className={styles.chatMessages}>
              {messages.map((m, i) => (
                <div key={i} className={m.role === 'user' ? styles.userMsg : styles.aiMsg}>
                  {m.role === 'assistant' && (
                    <div className={styles.aiAvatar}>
                      <svg width="14" height="14" viewBox="0 0 22 22" fill="none">
                        <rect x="1" y="12" width="4" height="9" rx="1.5" fill="#4BAE8A"/>
                        <rect x="7" y="7" width="4" height="14" rx="1.5" fill="#1C9FD4"/>
                        <rect x="13" y="4" width="4" height="17" rx="1.5" fill="#1F3C84"/>
                      </svg>
                    </div>
                  )}
                  <div className={styles.msgBubble}
                    dangerouslySetInnerHTML={{ __html: renderMd(m.content) }}/>
                </div>
              ))}
              {chatLoading && (
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
              {chatError && <div className={styles.errorMsg}>{chatError}</div>}
              <div ref={bottomRef}/>
            </div>

            <div className={styles.quickWrap}>
              {QUICK_PROMPTS.map(p => (
                <button key={p.label} className={styles.quickBtn}
                  onClick={() => sendChat(p.q)}
                  disabled={chatLoading}>
                  {p.label}
                </button>
              ))}
            </div>

            <div className={styles.inputRow}>
              <textarea className={styles.chatInput}
                placeholder="Ask anything about your data... (Enter to send)"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }}
                rows={2}/>
              <button className={styles.sendBtn}
                onClick={() => sendChat()}
                disabled={chatLoading || !chatInput.trim()}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* DATA */}
        {activeTab === 'data' && (
          <div className={styles.settingsWrap}>
            <div className={styles.settingCard}>
              <h3 className={styles.settingTitle}>SR Revenue Assumptions</h3>
              <p className={styles.settingDesc}>SR fee per RAU used in projected revenue. Formula: RAUs x SR Fee x 0.9</p>
              <div className={styles.settingRow}>
                <label>SR Fee per RAU</label>
                <div className={styles.inputGroup}>
                  <span className={styles.prefix}>Rs.</span>
                  <input type="number" className={styles.settingInput} value={srFeeInput}
                    onChange={e => setSrFeeInput(e.target.value)}/>
                  <button className={styles.saveBtn} onClick={saveSrFee}>
                    {srFeeSaved ? 'Saved' : 'Save'}
                  </button>
                </div>
              </div>
              <div className={styles.settingNote}>
                Current: Rs.{parseInt(srFeeInput || 90000).toLocaleString('en-IN')} per RAU
              </div>
            </div>
            <div className={styles.settingCard}>
              <h3 className={styles.settingTitle}>Data Sources</h3>
              <div className={styles.dataSourceList}>
                {[
                  { name:'Leads / OPPs',   src:'BigQuery',              rows:'61,184' },
                  { name:'Futwork QLs',    src:'BigQuery',              rows:'4,127'  },
                  { name:'Apps / STUs',    src:'BigQuery',              rows:'3,170'  },
                  { name:'Ad Spend',       src:'BigQuery',              rows:'3,492'  },
                  { name:'AC/VAS Revenue', src:'CIB Data',              rows:'3,828'  },
                  { name:'MTD Live',       src:'Overall PM Google Sheet', rows:'Live' },
                ].map(s => (
                  <div key={s.name} className={styles.dataSourceRow}>
                    <div>
                      <div className={styles.dsName}>{s.name}</div>
                      <div className={styles.dsSrc}>{s.src} — {s.rows} rows</div>
                    </div>
                    <span className={styles.dsLive}>Connected</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* USER ACCESS */}
        {activeTab === 'users' && userIsAdmin && (
          <div className={styles.settingsWrap}>
            <div className={styles.settingCard}>
              <h3 className={styles.settingTitle}>User Access Management</h3>
              <p className={styles.settingDesc}>Add users and control which dashboards they can access. Changes apply instantly.</p>

              <div style={{background:'#F9FAFB',borderRadius:10,padding:'14px',marginBottom:14,border:'1px solid #F3F4F6'}}>
                <p style={{fontSize:12,fontWeight:600,color:'#374151',marginBottom:10}}>Add New User</p>
                <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
                  <input type="email"
                    style={{padding:'8px 12px',border:'1px solid #E5E7EB',borderRadius:8,fontSize:12.5,fontFamily:'Inter,sans-serif',color:'#111827',outline:'none',width:240}}
                    placeholder="email@leverageedu.com"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addUser()}/>
                  <button onClick={addUser} disabled={usersLoading}
                    style={{padding:'8px 18px',borderRadius:8,background:'#111827',color:'#fff',border:'none',fontSize:12.5,fontWeight:600,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>
                    {usersLoading ? '...' : '+ Add'}
                  </button>
                </div>
              </div>

              {accessMsg && (
                <div style={{padding:'9px 14px',borderRadius:8,marginBottom:12,fontSize:12.5,
                  color: accessMsg.startsWith('Added') || accessMsg.startsWith('Access') ? '#059669' : '#DC2626',
                  background: accessMsg.startsWith('Added') || accessMsg.startsWith('Access') ? '#ECFDF5' : '#FEF2F2',
                  border: '1px solid ' + (accessMsg.startsWith('Added') || accessMsg.startsWith('Access') ? '#A7F3D0' : '#FECACA')
                }}>{accessMsg}</div>
              )}

              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                <p style={{fontSize:11,fontWeight:600,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.05em'}}>
                  {usersLoading ? 'Loading...' : accessList.length + ' users'}
                </p>
                <button onClick={loadUsers}
                  style={{fontSize:11,color:'#1C9FD4',background:'none',border:'none',cursor:'pointer'}}>
                  Refresh
                </button>
              </div>

              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {accessList.map(u => {
                  const rl = getRoleDisplay(u.role)
                  const isEditing = editingUser === u.email
                  return (
                    <div key={u.email} style={{background:'#fff',borderRadius:10,border:'1px solid #F3F4F6',overflow:'hidden',boxShadow:'0 1px 2px rgba(0,0,0,0.04)'}}>
                      <div style={{display:'flex',alignItems:'center',gap:10,padding:'11px 14px'}}>
                        <div style={{width:32,height:32,borderRadius:'50%',background:rl.bg,border:'1px solid '+rl.border,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:rl.color,flexShrink:0}}>
                          {u.email[0].toUpperCase()}
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:12.5,fontWeight:600,color:'#111827',display:'flex',alignItems:'center',gap:5,flexWrap:'wrap'}}>
                            {u.email}
                            {u.email === user?.email && (
                              <span style={{fontSize:9.5,background:'#ECFDF5',color:'#059669',border:'1px solid #A7F3D0',borderRadius:4,padding:'1px 6px',fontWeight:700}}>YOU</span>
                            )}
                          </div>
                          <span style={{fontSize:11,fontWeight:600,color:rl.color,background:rl.bg,border:'1px solid '+rl.border,borderRadius:4,padding:'1px 7px',marginTop:3,display:'inline-block'}}>
                            {rl.label}
                          </span>
                        </div>
                        {u.email !== user?.email && (
                          <div style={{display:'flex',gap:6}}>
                            <button onClick={() => isEditing ? setEditingUser(null) : startEdit(u)}
                              style={{padding:'5px 11px',borderRadius:6,border:'1px solid #E5E7EB',background:'#fff',color:'#374151',fontSize:11.5,fontWeight:500,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>
                              {isEditing ? 'Cancel' : 'Edit'}
                            </button>
                            <button onClick={() => removeUser(u.email)}
                              style={{padding:'5px 11px',borderRadius:6,border:'1px solid #FECACA',background:'#FEF2F2',color:'#DC2626',fontSize:11.5,fontWeight:500,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                      {isEditing && (
                        <div style={{borderTop:'1px solid #F3F4F6',padding:'14px',background:'#FAFBFF'}}>
                          <p style={{fontSize:11.5,fontWeight:600,color:'#374151',marginBottom:10}}>
                            Dashboard access for {u.email}:
                          </p>
                          <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
                            <label style={{display:'flex',alignItems:'center',gap:5,padding:'6px 10px',borderRadius:7,border:'1.5px solid '+(editIsAdmin?'#D97706':'#E5E7EB'),background:editIsAdmin?'#FFFBEB':'#fff',cursor:'pointer',fontSize:12,fontWeight:editIsAdmin?600:400}}>
                              <input type="checkbox" checked={editIsAdmin} onChange={e => setEditIsAdmin(e.target.checked)} style={{accentColor:'#D97706'}}/>
                              Admin
                            </label>
                            {!editIsAdmin && DASHBOARDS.map(d => {
                              const checked = editIds.includes(d.id)
                              return (
                                <label key={d.id} style={{display:'flex',alignItems:'center',gap:5,padding:'6px 10px',borderRadius:7,border:'1.5px solid '+(checked?'#6366F1':'#E5E7EB'),background:checked?'#EEF2FF':'#fff',cursor:'pointer',fontSize:12,fontWeight:checked?600:400,color:checked?'#4F46E5':'#374151'}}>
                                  <input type="checkbox" checked={checked}
                                    onChange={() => setEditIds(p => checked ? p.filter(x => x !== d.id) : [...p, d.id])}
                                    style={{accentColor:'#6366F1'}}/>
                                  {d.label}
                                </label>
                              )
                            })}
                          </div>
                          <button onClick={() => saveEdit(u.email)}
                            style={{padding:'7px 16px',borderRadius:8,background:'#6366F1',color:'#fff',border:'none',fontSize:12.5,fontWeight:600,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>
                            Save Changes
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ACTIVITY LOG */}
        {activeTab === 'activity' && userIsAdmin && (
          <div className={styles.settingsWrap}>
            <div className={styles.settingCard}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
                <div>
                  <h3 className={styles.settingTitle}>Activity Log</h3>
                  <p className={styles.settingDesc}>See who viewed which dashboard and when.</p>
                </div>
                <button onClick={loadActivity}
                  style={{padding:'7px 14px',borderRadius:8,background:'#F3F4F6',border:'none',fontSize:12.5,fontWeight:500,cursor:'pointer',fontFamily:'Inter,sans-serif',color:'#374151'}}>
                  {activityLoading ? 'Loading...' : '↻ Load Log'}
                </button>
              </div>

              {activityLog.length === 0 && !activityLoading && (
                <div style={{textAlign:'center',padding:'40px 20px',color:'#9CA3AF',fontSize:13}}>
                  Click "Load Log" to see activity.<br/>
                  <span style={{fontSize:11,marginTop:4,display:'block'}}>Activity is tracked when users navigate to dashboards.</span>
                </div>
              )}

              {activityLog.length > 0 && (
                <div style={{overflowX:'auto'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:12.5}}>
                    <thead>
                      <tr>
                        {['User','Action','Page','Time'].map(h => (
                          <th key={h} style={{padding:'9px 14px',textAlign:'left',fontSize:10,fontWeight:700,letterSpacing:'0.05em',textTransform:'uppercase',color:'#9CA3AF',background:'#FAFBFC',borderBottom:'1px solid #F3F4F6',whiteSpace:'nowrap'}}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activityLog.map((log, i) => (
                        <tr key={i} style={{borderBottom:'1px solid #F9FAFB'}}>
                          <td style={{padding:'9px 14px',color:'#111827',fontWeight:500}}>{log.email?.split('@')[0]}</td>
                          <td style={{padding:'9px 14px'}}>
                            <span style={{fontSize:11,fontWeight:600,padding:'2px 8px',borderRadius:4,
                              background: log.action==='view'?'#EEF2FF':log.action==='login'?'#ECFDF5':'#FEF3C7',
                              color: log.action==='view'?'#4F46E5':log.action==='login'?'#059669':'#D97706'
                            }}>{log.action}</span>
                          </td>
                          <td style={{padding:'9px 14px',color:'#6B7280'}}>{log.page}</td>
                          <td style={{padding:'9px 14px',color:'#9CA3AF',whiteSpace:'nowrap'}}>
                            {new Date(log.created_at).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* PROFILE */}
        {activeTab === 'profile' && (
          <div className={styles.settingsWrap}>
            <div className={styles.settingCard}>
              <h3 className={styles.settingTitle}>Your Profile</h3>
              <div className={styles.profileRow}>
                <div className={styles.profileAvatar}>
                  {user?.picture
                    ? <img src={user.picture} alt={user.name} className={styles.profileImg}/>
                    : <span>{user?.name?.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() || 'LE'}</span>
                  }
                </div>
                <div>
                  <div className={styles.profileName}>{user?.name || 'User'}</div>
                  <div className={styles.profileEmail}>{user?.email}</div>
                  <div className={styles.profileBadge}>{user?.role === 'admin' ? 'Admin' : 'Member'}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
