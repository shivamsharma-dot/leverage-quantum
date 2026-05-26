import { useState, useRef, useEffect } from 'react'
import Sidebar from '../components/Sidebar'
import { useAuth, isAdmin, getAccessList, addUserAccess, removeUserAccess } from '../hooks/useAuth'
import styles from './SettingsPage.module.css'

const SUPABASE_URL = 'https://tsyekthwthxszmsgqfej.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzeWVrdGh3dGh4c3ptc2dxZmVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NjkzMDIsImV4cCI6MjA5NTM0NTMwMn0.bdM9h5c3PDu9hgggjBdbA-eb7kfF-79c6txOnCUxRhY'

const DASHBOARDS = [
  { id: 'home',        label: 'Home',         path: '/' },
  { id: 'roas',        label: 'ROAS',         path: '/dashboard/roas' },
  { id: 'mtd',         label: 'MTD',          path: '/dashboard/mtd' },
  { id: 'lead_quality',label: 'Lead Quality', path: '/dashboard/lead-quality' },
  { id: 'channel_mix', label: 'Channel Mix',  path: '/dashboard/channel-mix' },
  { id: 'revenue',     label: 'Revenue',      path: '/dashboard/revenue' },
  { id: 'settings',    label: 'Settings',     path: '/settings' },
]

// Parse permissions from role string
// role can be: 'admin', 'viewer', 'roas_only', or 'custom:roas,mtd,lead_quality'
function parsePermissions(role) {
  if (role === 'admin')    return DASHBOARDS.map(d => d.id)
  if (role === 'viewer')   return DASHBOARDS.map(d => d.id)
  if (role === 'roas_only') return ['roas']
  if (role?.startsWith('custom:')) {
    return role.replace('custom:', '').split(',')
  }
  return DASHBOARDS.map(d => d.id)
}

function buildRole(selectedIds) {
  if (selectedIds.length === DASHBOARDS.length) return 'viewer'
  if (selectedIds.length === 1 && selectedIds[0] === 'roas') return 'roas_only'
  return 'custom:' + selectedIds.join(',')
}

async function updateUserRole(email, role) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/allowed_users?email=eq.${encodeURIComponent(email)}`,
    {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ role })
    }
  )
  return res.ok
}

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
  const userIsAdmin = isAdmin(user?.email)

  // SR Fee
  const [srFee, setSrFee]       = useState(() => { try { return parseInt(localStorage.getItem(SR_FEE_KEY))||DEFAULT_SR_FEE } catch { return DEFAULT_SR_FEE } })
  const [srFeeInput, setSrFeeInput] = useState(String(srFee))
  const [srFeeSaved, setSrFeeSaved] = useState(false)

  const saveSrFee = () => {
    const val = parseInt(srFeeInput)
    if (isNaN(val)||val<=0) return
    setSrFee(val)
    localStorage.setItem(SR_FEE_KEY, String(val))
    setSrFeeSaved(true)
    setTimeout(()=>setSrFeeSaved(false), 2000)
  }

  // User management
  const [accessList, setAccessList]     = useState([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [newEmail, setNewEmail]         = useState('')
  const [newRole, setNewRole]           = useState('viewer')
  const [accessMsg, setAccessMsg]       = useState('')
  const [editingUser, setEditingUser]   = useState(null) // email being edited
  const [editPerms, setEditPerms]       = useState([])   // selected dashboard ids

  const loadUsers = async () => {
    setUsersLoading(true)
    const list = await getAccessList()
    setAccessList(list)
    setUsersLoading(false)
  }

  useEffect(() => { if (userIsAdmin) loadUsers() }, [userIsAdmin])

  const addUser = async () => {
    const email = newEmail.trim().toLowerCase()
    if (!email.includes('@leverageedu.com')) { setAccessMsg('❌ Only @leverageedu.com emails allowed'); return }
    if (accessList.find(u=>u.email===email))  { setAccessMsg('❌ User already has access'); return }
    setUsersLoading(true)
    const ok = await addUserAccess(email, newRole, user?.email)
    if (ok) { setAccessMsg(`✅ ${email} added`); setNewEmail(''); setNewRole('viewer'); await loadUsers() }
    else    { setAccessMsg('❌ Failed to add. Try again.') }
    setUsersLoading(false)
    setTimeout(()=>setAccessMsg(''), 4000)
  }

  const removeUser = async (email) => {
    if (email===user?.email) { setAccessMsg("❌ You can't remove yourself"); return }
    setUsersLoading(true)
    const ok = await removeUserAccess(email)
    if (ok) { setAccessMsg(`✅ ${email} removed`); await loadUsers() }
    else    { setAccessMsg('❌ Failed to remove.') }
    setUsersLoading(false)
    setTimeout(()=>setAccessMsg(''), 4000)
  }

  const startEditPerms = (u) => {
    setEditingUser(u.email)
    setEditPerms(parsePermissions(u.role))
  }

  const savePerms = async (email) => {
    const role = buildRole(editPerms)
    setUsersLoading(true)
    const ok = await updateUserRole(email, role)
    if (ok) { setAccessMsg(`✅ Permissions updated for ${email}`); await loadUsers() }
    else    { setAccessMsg('❌ Failed to update. Try again.') }
    setEditingUser(null)
    setUsersLoading(false)
    setTimeout(()=>setAccessMsg(''), 4000)
  }

  const togglePerm = (id) => {
    setEditPerms(prev => prev.includes(id) ? prev.filter(p=>p!==id) : [...prev, id])
  }

  // Claude chat
  const [messages, setMessages] = useState([
    { role:'assistant', content:`Hi! I'm Quantum AI 👋\n\nI can help you:\n\n• **Understand your ROAS data** — metrics, formulas, channel performance\n• **Interpret lead quality** — OPP→QL→STU funnel insights\n• **Answer questions** about your marketing data\n\nWhat would you like to know?` }
  ])
  const [input, setInput]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState(null)
  const bottomRef = useRef(null)

  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:'smooth'}) }, [messages])

  const sendMessage = async () => {
    if (!input.trim()||loading) return
    const userMsg = input.trim()
    setInput(''); setError(null)
    setMessages(prev=>[...prev,{role:'user',content:userMsg}])
    setLoading(true)
    try {
      const history = [...messages,{role:'user',content:userMsg}].map(m=>({role:m.role,content:m.content}))
      const reply = await askClaude(history.slice(-10))
      setMessages(prev=>[...prev,{role:'assistant',content:reply}])
    } catch(e) { setError('Could not reach Claude API.') }
    finally { setLoading(false) }
  }

  const handleKey = (e) => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage()} }

  const QUICK = [
    'What is our overall ROAS for 2025?',
    'Which channel has the best CPL?',
    'Explain AC vs VAS revenue',
    'Why is QL% low in Jul-Aug 2025?',
  ]

  function renderMd(text){
    return text
      .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
      .replace(/\*(.*?)\*/g,'<em>$1</em>')
      .replace(/`(.*?)`/g,'<code>$1</code>')
      .replace(/\n/g,'<br/>')
  }

  const getRoleLabel = (role) => {
    if (role==='admin')    return {label:'Admin',   color:'#D97706', bg:'#FFFBEB', border:'#FDE68A'}
    if (role==='viewer')   return {label:'Full Access', color:'#059669', bg:'#ECFDF5', border:'#A7F3D0'}
    if (role==='roas_only') return {label:'ROAS Only', color:'#6366F1', bg:'#EEF2FF', border:'#C7D2FE'}
    if (role?.startsWith('custom:')) {
      const count = role.replace('custom:','').split(',').length
      return {label:`Custom (${count} dashboards)`, color:'#0891B2', bg:'#ECFEFF', border:'#A5F3FC'}
    }
    return {label:role, color:'#6B7280', bg:'#F9FAFB', border:'#E5E7EB'}
  }

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
        <div className={styles.header}>
          <div>
            <p className={styles.breadcrumb}>Settings</p>
            <h1 className={styles.title}>Settings & AI Assistant</h1>
            <p className={styles.subtitle}>Manage preferences and team access</p>
          </div>
        </div>

        <div className={styles.tabs}>
          {[
            {id:'chat',    label:'🤖 Quantum AI'},
            {id:'data',    label:'📊 Data Settings'},
            ...(userIsAdmin?[{id:'users',label:'👥 User Access'}]:[]),
            {id:'profile', label:'👤 Profile'},
          ].map(t=>(
            <button key={t.id} className={`${styles.tab} ${activeTab===t.id?styles.tabActive:''}`}
              onClick={()=>setActiveTab(t.id)}>{t.label}</button>
          ))}
        </div>

        {/* CHAT TAB */}
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
              {loading&&(
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
              {error&&<div className={styles.errorMsg}>{error}</div>}
              <div ref={bottomRef}/>
            </div>
            <div className={styles.quickWrap}>
              {QUICK.map(q=><button key={q} className={styles.quickBtn} onClick={()=>setInput(q)}>{q}</button>)}
            </div>
            <div className={styles.inputRow}>
              <textarea className={styles.chatInput} placeholder="Ask about ROAS, leads, revenue... (Enter to send)"
                value={input} onChange={e=>setInput(e.target.value)} onKeyDown={handleKey} rows={2}/>
              <button className={styles.sendBtn} onClick={sendMessage} disabled={loading||!input.trim()}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* DATA SETTINGS TAB */}
        {activeTab==='data'&&(
          <div className={styles.settingsWrap}>
            <div className={styles.settingCard}>
              <h3 className={styles.settingTitle}>SR Revenue Assumptions</h3>
              <p className={styles.settingDesc}>SR fee per RAU for Estimated SR Revenue. Formula: RAUs × SR Fee × 0.9</p>
              <div className={styles.settingRow}>
                <label>SR Fee per RAU (₹)</label>
                <div className={styles.inputGroup}>
                  <span className={styles.prefix}>₹</span>
                  <input type="number" className={styles.settingInput} value={srFeeInput}
                    onChange={e=>setSrFeeInput(e.target.value)} placeholder="90000"/>
                  <button className={styles.saveBtn} onClick={saveSrFee}>{srFeeSaved?'✓ Saved':'Save'}</button>
                </div>
              </div>
              <div className={styles.settingNote}>Current: ₹{srFee.toLocaleString('en-IN')} per RAU</div>
            </div>
            <div className={styles.settingCard}>
              <h3 className={styles.settingTitle}>Data Sources</h3>
              <div className={styles.dataSourceList}>
                {[
                  {name:'Leads / OPPs',   src:'BigQuery → bquxjob_43e7ac2d', rows:'61,184'},
                  {name:'Futwork QLs',    src:'BigQuery → bquxjob_fae89e6',  rows:'4,127'},
                  {name:'Apps / STUs',    src:'BigQuery → bquxjob_3e9855ab', rows:'3,170'},
                  {name:'Ad Spend',       src:'BigQuery → bquxjob_7f12611f', rows:'3,492'},
                  {name:'AC/VAS Revenue', src:'CIB Sourcewise Data',         rows:'3,828'},
                  {name:'MTD Live',       src:'Overall PM Google Sheet',     rows:'Live'},
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

        {/* USER ACCESS TAB */}
        {activeTab==='users'&&userIsAdmin&&(
          <div className={styles.settingsWrap}>
            <div className={styles.settingCard}>
              <h3 className={styles.settingTitle}>User Access Management</h3>
              <p className={styles.settingDesc}>Add users and control which dashboards they can access. Changes apply instantly across all devices.</p>

              {/* Add user */}
              <div className={styles.settingRow}>
                <label>Add User</label>
                <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
                  <div className={styles.inputGroup}>
                    <input type="email" className={styles.settingInput} style={{width:220}}
                      placeholder="email@leverageedu.com" value={newEmail}
                      onChange={e=>setNewEmail(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addUser()}/>
                  </div>
                  <select value={newRole} onChange={e=>setNewRole(e.target.value)}
                    style={{padding:'8px 12px',border:'1px solid #E5E7EB',borderRadius:8,fontSize:12,fontFamily:'Inter,sans-serif',color:'#374151',background:'#fff',cursor:'pointer',outline:'none'}}>
                    <option value="viewer">Full Access</option>
                    <option value="roas_only">ROAS Only</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button className={styles.saveBtn} style={{borderRadius:8,padding:'8px 18px'}} onClick={addUser} disabled={usersLoading}>
                    {usersLoading?'...':'+ Add'}
                  </button>
                </div>
              </div>

              {accessMsg&&(
                <div className={styles.settingNote} style={{
                  color:accessMsg.startsWith('✅')?'#059669':'#DC2626',
                  background:accessMsg.startsWith('✅')?'#ECFDF5':'#FEF2F2',
                  border:`1px solid ${accessMsg.startsWith('✅')?'#A7F3D0':'#FECACA'}`
                }}>{accessMsg}</div>
              )}

              {/* User list */}
              <div style={{marginTop:16}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                  <p style={{fontSize:11,fontWeight:600,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.06em'}}>
                    {usersLoading?'Loading...':`${accessList.length} users`}
                  </p>
                  <button onClick={loadUsers} style={{fontSize:11,color:'#1C9FD4',background:'none',border:'none',cursor:'pointer'}}>↻ Refresh</button>
                </div>

                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {accessList.map(u=>{
                    const rl = getRoleLabel(u.role)
                    const isEditing = editingUser===u.email
                    return(
                      <div key={u.email} style={{background:'#F9FAFB',borderRadius:10,border:'1px solid #F3F4F6',overflow:'hidden'}}>
                        {/* User row */}
                        <div style={{display:'flex',alignItems:'center',gap:10,padding:'11px 14px'}}>
                          <div style={{width:32,height:32,borderRadius:'50%',background:rl.bg,border:`1px solid ${rl.border}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:rl.color,flexShrink:0}}>
                            {u.email[0].toUpperCase()}
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:12.5,fontWeight:600,color:'#111827',display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                              {u.email}
                              {u.email===user?.email&&<span style={{fontSize:9.5,background:'#ECFDF5',color:'#059669',border:'1px solid #A7F3D0',borderRadius:4,padding:'1px 6px',fontWeight:700}}>YOU</span>}
                            </div>
                            <div style={{display:'flex',alignItems:'center',gap:6,marginTop:3}}>
                              <span style={{fontSize:10.5,fontWeight:600,color:rl.color,background:rl.bg,border:`1px solid ${rl.border}`,borderRadius:4,padding:'1px 7px'}}>{rl.label}</span>
                              <span style={{fontSize:10,color:'#9CA3AF'}}>Added {new Date(u.created_at).toLocaleDateString('en-IN')}</span>
                            </div>
                          </div>
                          <div style={{display:'flex',gap:6}}>
                            {u.email!==user?.email&&(
                              <>
                                <button onClick={()=>isEditing?setEditingUser(null):startEditPerms(u)}
                                  style={{padding:'5px 10px',borderRadius:6,border:'1px solid #E5E7EB',background:'#fff',color:'#6B7280',fontSize:11,fontWeight:500,cursor:'pointer'}}>
                                  {isEditing?'Cancel':'Edit Access'}
                                </button>
                                <button onClick={()=>removeUser(u.email)}
                                  style={{padding:'5px 10px',borderRadius:6,border:'1px solid #FECACA',background:'#FEF2F2',color:'#DC2626',fontSize:11,fontWeight:500,cursor:'pointer'}}>
                                  Remove
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Dashboard permission checkboxes */}
                        {isEditing&&(
                          <div style={{borderTop:'1px solid #F3F4F6',padding:'12px 14px',background:'#fff'}}>
                            <p style={{fontSize:11,fontWeight:600,color:'#374151',marginBottom:10}}>Select dashboards this user can access:</p>
                            <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:12}}>
                              {DASHBOARDS.map(d=>(
                                <label key={d.id} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 12px',borderRadius:7,border:`1px solid ${editPerms.includes(d.id)?'#6366F1':'#E5E7EB'}`,background:editPerms.includes(d.id)?'#EEF2FF':'#F9FAFB',cursor:'pointer',fontSize:12,fontWeight:500,color:editPerms.includes(d.id)?'#4F46E5':'#374151',transition:'all .15s'}}>
                                  <input type="checkbox" checked={editPerms.includes(d.id)} onChange={()=>togglePerm(d.id)} style={{accentColor:'#6366F1'}}/>
                                  {d.label}
                                </label>
                              ))}
                            </div>
                            <div style={{display:'flex',alignItems:'center',gap:8}}>
                              <button onClick={()=>savePerms(u.email)}
                                style={{padding:'7px 16px',borderRadius:8,background:'#6366F1',color:'#fff',border:'none',fontSize:12,fontWeight:600,cursor:'pointer'}}>
                                Save Permissions
                              </button>
                              <span style={{fontSize:11,color:'#9CA3AF'}}>{editPerms.length} of {DASHBOARDS.length} dashboards selected</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PROFILE TAB */}
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
                  <div className={styles.profileBadge}>{user?.role==='admin'?'👑 Admin':'@leverageedu.com'}</div>
                </div>
              </div>
            </div>
            <div className={styles.settingCard}>
              <h3 className={styles.settingTitle}>Platform Info</h3>
              <div className={styles.infoGrid}>
                {[
                  {l:'Version',     v:'1.0.0'},
                  {l:'Data Period', v:'Jan – Dec 2025'},
                  {l:'Channels',    v:'Facebook, Google'},
                  {l:'Last Updated',v:new Date().toLocaleDateString('en-IN')},
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
