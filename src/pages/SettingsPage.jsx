import { useState, useRef, useEffect } from 'react'
import Sidebar from '../components/Sidebar'
import { useAuth, isAdmin, getAccessList, addUserAccess, removeUserAccess } from '../hooks/useAuth'
import styles from './SettingsPage.module.css'

const SUPABASE_URL = 'https://tsyekthwthxszmsgqfej.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzeWVrdGh3dGh4c3ptc2dxZmVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NjkzMDIsImV4cCI6MjA5NTM0NTMwMn0.bdM9h5c3PDu9hgggjBdbA-eb7kfF-79c6txOnCUxRhY'

const DASHBOARDS = [{"id":"roas","label":"ROAS","icon":"\ud83d\udcc8"},{"id":"mtd","label":"MTD","icon":"\ud83d\udcc5"},{"id":"lead_quality","label":"Lead Quality","icon":"\ud83c\udfaf"},{"id":"channel_mix","label":"Channel Mix","icon":"\ud83d\udcca"},{"id":"revenue","label":"Revenue","icon":"\ud83d\udcb0"}]
const ALL_COMBOS = [{"id":"c_roas","label":"ROAS","ids":["roas"],"color":"#6366F1","bg":"#EEF2FF","border":"#C7D2FE"},{"id":"c_mtd","label":"MTD","ids":["mtd"],"color":"#10B981","bg":"#ECFDF5","border":"#A7F3D0"},{"id":"c_lead_quality","label":"Lead Quality","ids":["lead_quality"],"color":"#F59E0B","bg":"#FFFBEB","border":"#FDE68A"},{"id":"c_channel_mix","label":"Channel Mix","ids":["channel_mix"],"color":"#EF4444","bg":"#FEF2F2","border":"#FECACA"},{"id":"c_revenue","label":"Revenue","ids":["revenue"],"color":"#8B5CF6","bg":"#F5F3FF","border":"#DDD6FE"},{"id":"c_roas_mtd","label":"ROAS + MTD","ids":["roas","mtd"],"color":"#0891B2","bg":"#ECFEFF","border":"#A5F3FC"},{"id":"c_roas_lead_quality","label":"ROAS + Lead Quality","ids":["roas","lead_quality"],"color":"#F97316","bg":"#FFF7ED","border":"#FED7AA"},{"id":"c_roas_channel_mix","label":"ROAS + Channel Mix","ids":["roas","channel_mix"],"color":"#EC4899","bg":"#FDF2F8","border":"#FBCFE8"},{"id":"c_roas_revenue","label":"ROAS + Revenue","ids":["roas","revenue"],"color":"#06B6D4","bg":"#ECFEFF","border":"#A5F3FC"},{"id":"c_mtd_lead_quality","label":"MTD + Lead Quality","ids":["mtd","lead_quality"],"color":"#84CC16","bg":"#F7FEE7","border":"#BBF7D0"},{"id":"c_mtd_channel_mix","label":"MTD + Channel Mix","ids":["mtd","channel_mix"],"color":"#6366F1","bg":"#EEF2FF","border":"#C7D2FE"},{"id":"c_mtd_revenue","label":"MTD + Revenue","ids":["mtd","revenue"],"color":"#10B981","bg":"#ECFDF5","border":"#A7F3D0"},{"id":"c_lead_quality_channel_mix","label":"Lead Quality + Channel Mix","ids":["lead_quality","channel_mix"],"color":"#F59E0B","bg":"#FFFBEB","border":"#FDE68A"},{"id":"c_lead_quality_revenue","label":"Lead Quality + Revenue","ids":["lead_quality","revenue"],"color":"#EF4444","bg":"#FEF2F2","border":"#FECACA"},{"id":"c_channel_mix_revenue","label":"Channel Mix + Revenue","ids":["channel_mix","revenue"],"color":"#8B5CF6","bg":"#F5F3FF","border":"#DDD6FE"},{"id":"c_roas_mtd_lead_quality","label":"ROAS + MTD + Lead Quality","ids":["roas","mtd","lead_quality"],"color":"#0891B2","bg":"#ECFEFF","border":"#A5F3FC"},{"id":"c_roas_mtd_channel_mix","label":"ROAS + MTD + Channel Mix","ids":["roas","mtd","channel_mix"],"color":"#F97316","bg":"#FFF7ED","border":"#FED7AA"},{"id":"c_roas_mtd_revenue","label":"ROAS + MTD + Revenue","ids":["roas","mtd","revenue"],"color":"#EC4899","bg":"#FDF2F8","border":"#FBCFE8"},{"id":"c_roas_lead_quality_channel_mix","label":"ROAS + Lead Quality + Channel Mix","ids":["roas","lead_quality","channel_mix"],"color":"#06B6D4","bg":"#ECFEFF","border":"#A5F3FC"},{"id":"c_roas_lead_quality_revenue","label":"ROAS + Lead Quality + Revenue","ids":["roas","lead_quality","revenue"],"color":"#84CC16","bg":"#F7FEE7","border":"#BBF7D0"},{"id":"c_roas_channel_mix_revenue","label":"ROAS + Channel Mix + Revenue","ids":["roas","channel_mix","revenue"],"color":"#6366F1","bg":"#EEF2FF","border":"#C7D2FE"},{"id":"c_mtd_lead_quality_channel_mix","label":"MTD + Lead Quality + Channel Mix","ids":["mtd","lead_quality","channel_mix"],"color":"#10B981","bg":"#ECFDF5","border":"#A7F3D0"},{"id":"c_mtd_lead_quality_revenue","label":"MTD + Lead Quality + Revenue","ids":["mtd","lead_quality","revenue"],"color":"#F59E0B","bg":"#FFFBEB","border":"#FDE68A"},{"id":"c_mtd_channel_mix_revenue","label":"MTD + Channel Mix + Revenue","ids":["mtd","channel_mix","revenue"],"color":"#EF4444","bg":"#FEF2F2","border":"#FECACA"},{"id":"c_lead_quality_channel_mix_revenue","label":"Lead Quality + Channel Mix + Revenue","ids":["lead_quality","channel_mix","revenue"],"color":"#8B5CF6","bg":"#F5F3FF","border":"#DDD6FE"},{"id":"c_roas_mtd_lead_quality_channel_mix","label":"ROAS + MTD + Lead Quality + Channel Mix","ids":["roas","mtd","lead_quality","channel_mix"],"color":"#0891B2","bg":"#ECFEFF","border":"#A5F3FC"},{"id":"c_roas_mtd_lead_quality_revenue","label":"ROAS + MTD + Lead Quality + Revenue","ids":["roas","mtd","lead_quality","revenue"],"color":"#F97316","bg":"#FFF7ED","border":"#FED7AA"},{"id":"c_roas_mtd_channel_mix_revenue","label":"ROAS + MTD + Channel Mix + Revenue","ids":["roas","mtd","channel_mix","revenue"],"color":"#EC4899","bg":"#FDF2F8","border":"#FBCFE8"},{"id":"c_roas_lead_quality_channel_mix_revenue","label":"ROAS + Lead Quality + Channel Mix + Revenue","ids":["roas","lead_quality","channel_mix","revenue"],"color":"#06B6D4","bg":"#ECFEFF","border":"#A5F3FC"},{"id":"c_mtd_lead_quality_channel_mix_revenue","label":"MTD + Lead Quality + Channel Mix + Revenue","ids":["mtd","lead_quality","channel_mix","revenue"],"color":"#84CC16","bg":"#F7FEE7","border":"#BBF7D0"},{"id":"c_roas_mtd_lead_quality_channel_mix_revenue","label":"ROAS + MTD + Lead Quality + Channel Mix + Revenue","ids":["roas","mtd","lead_quality","channel_mix","revenue"],"color":"#6366F1","bg":"#EEF2FF","border":"#C7D2FE"}]

// Named presets shown prominently
const NAMED_PRESETS = [
  { label:'Full Access',  ids:['roas','mtd','lead_quality','channel_mix','revenue'], color:'#059669', bg:'#ECFDF5', border:'#A7F3D0', desc:'All 5 dashboards' },
  { label:'Admin',        ids:['roas','mtd','lead_quality','channel_mix','revenue'], color:'#D97706', bg:'#FFFBEB', border:'#FDE68A', desc:'All + user management', isAdmin:true },
  { label:'Custom',       ids:[], color:'#374151', bg:'#F9FAFB', border:'#E5E7EB', desc:'Pick manually', isCustom:true },
]

function parsePermissions(role) {
  if (!role || role === 'viewer') return DASHBOARDS.map(d => d.id)
  if (role === 'admin')           return DASHBOARDS.map(d => d.id)
  if (role === 'roas_only')       return ['roas']
  if (role?.startsWith('custom:')) return role.replace('custom:', '').split(',').filter(Boolean)
  return DASHBOARDS.map(d => d.id)
}

function buildRoleString(ids, isAdm) {
  if (isAdm) return 'admin'
  const allIds = DASHBOARDS.map(d=>d.id)
  if (ids.length === allIds.length && allIds.every(id=>ids.includes(id))) return 'viewer'
  return 'custom:' + ids.join(',')
}

function matchCombo(ids) {
  const s = [...ids].sort().join(',')
  return ALL_COMBOS.find(c => [...c.ids].sort().join(',') === s)
}

function getRoleDisplay(role) {
  if (role === 'admin') return { label:'Admin', color:'#D97706', bg:'#FFFBEB', border:'#FDE68A' }
  const ids = parsePermissions(role)
  if (ids.length === DASHBOARDS.length) return { label:'Full Access', color:'#059669', bg:'#ECFDF5', border:'#A7F3D0' }
  const combo = matchCombo(ids)
  if (combo) return { label: combo.label, color: combo.color, bg: combo.bg, border: combo.border }
  return { label:'Custom', color:'#6B7280', bg:'#F9FAFB', border:'#E5E7EB' }
}

async function updateUserRole(email, role) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/allowed_users?email=eq.${encodeURIComponent(email)}`, {
    method:'PATCH',
    headers:{ 'apikey':SUPABASE_KEY, 'Authorization':`Bearer ${SUPABASE_KEY}`, 'Content-Type':'application/json', 'Prefer':'return=minimal' },
    body: JSON.stringify({ role })
  })
  return res.ok
}

async function askClaude(messages) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({
      model:'claude-sonnet-4-20250514', max_tokens:1000,
      system:`You are Quantum AI for Leverage Edu analytics. OPPs=leads, QLs=qualified leads, STUs=uni apps, AC=Admission Counselling, VAS=Value Added Services. Be concise, use ₹ for currency.`,
      messages
    })
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return (await res.json()).content[0].text
}

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

  // New user access selection
  const [newSelection, setNewSelection] = useState({ type:'combo', comboId:null, customIds:[], isAdmin:false })
  // Edit access selection  
  const [editSelection, setEditSelection] = useState({ type:'combo', comboId:null, customIds:[], isAdmin:false })

  const loadUsers = async () => {
    setUsersLoading(true)
    setAccessList(await getAccessList())
    setUsersLoading(false)
  }
  useEffect(() => { if(userIsAdmin) loadUsers() }, [userIsAdmin])

  const setMsg = (m) => { setAccessMsg(m); setTimeout(()=>setAccessMsg(''), 4000) }

  const selectionToRole = (sel) => {
    if (sel.isAdmin) return 'admin'
    if (sel.type === 'full') return 'viewer'
    if (sel.type === 'custom') return buildRoleString(sel.customIds, false)
    if (sel.type === 'combo' && sel.comboId) {
      const combo = ALL_COMBOS.find(c=>c.id===sel.comboId)
      return combo ? buildRoleString(combo.ids, false) : 'viewer'
    }
    return 'viewer'
  }

  const addUser = async () => {
    const email = newEmail.trim().toLowerCase()
    if (!email.includes('@leverageedu.com')) { setMsg('❌ Only @leverageedu.com emails'); return }
    if (accessList.find(u=>u.email===email)) { setMsg('❌ Already has access'); return }
    if (!newSelection.isAdmin && newSelection.type==='combo' && !newSelection.comboId && newSelection.type!=='full') {
      setMsg('❌ Please select an access level'); return
    }
    setUsersLoading(true)
    const role = selectionToRole(newSelection)
    const ok = await addUserAccess(email, role, user?.email)
    if(ok){ setMsg(`✅ ${email} added`); setNewEmail(''); await loadUsers() }
    else   { setMsg('❌ Failed to add') }
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
    const ids = parsePermissions(u.role)
    if (u.role === 'admin') {
      setEditSelection({ type:'admin', comboId:null, customIds:[], isAdmin:true })
    } else if (ids.length === DASHBOARDS.length) {
      setEditSelection({ type:'full', comboId:null, customIds:[], isAdmin:false })
    } else {
      const combo = matchCombo(ids)
      if (combo) setEditSelection({ type:'combo', comboId:combo.id, customIds:[], isAdmin:false })
      else       setEditSelection({ type:'custom', comboId:null, customIds:ids, isAdmin:false })
    }
  }

  const saveEdit = async (email) => {
    setUsersLoading(true)
    const role = selectionToRole(editSelection)
    if(await updateUserRole(email, role)){ setMsg(`✅ Access updated`); await loadUsers() }
    else { setMsg('❌ Failed') }
    setEditingUser(null); setUsersLoading(false)
  }

  // Chat
  const [messages, setMessages] = useState([{role:'assistant',content:`Hi! I'm Quantum AI 👋\n\nAsk me anything about ROAS, leads, revenue or marketing data.`}])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatError, setChatError] = useState(null)
  const bottomRef = useRef(null)
  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:'smooth'}) },[messages])

  const sendChat = async () => {
    if(!chatInput.trim()||chatLoading) return
    const msg=chatInput.trim(); setChatInput(''); setChatError(null)
    setMessages(p=>[...p,{role:'user',content:msg}])
    setChatLoading(true)
    try {
      const history=[...messages,{role:'user',content:msg}].map(m=>({role:m.role,content:m.content}))
      const reply = await askClaude(history.slice(-10))
      setMessages(p=>[...p,{role:'assistant',content:reply}])
    } catch(e){ setChatError('Could not reach Claude API.') }
    finally { setChatLoading(false) }
  }

  function renderMd(t){ return t.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/`(.*?)`/g,'<code>$1</code>').replace(/\n/g,'<br/>') }

  // Access selector component (reused for both Add and Edit)
  const AccessSelector = ({ sel, setSel }) => {
    const activeCombo = sel.type==='combo' ? ALL_COMBOS.find(c=>c.id===sel.comboId) : null
    return (
      <div>
        {/* Top row: Full, Admin, Custom */}
        <div style={{display:'flex',gap:6,marginBottom:10,flexWrap:'wrap'}}>
          <button onClick={()=>setSel({type:'full',comboId:null,customIds:[],isAdmin:false})}
            style={{padding:'7px 14px',borderRadius:8,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'Inter,sans-serif',
              border:`1.5px solid ${sel.type==='full'?'#059669':'#E5E7EB'}`,
              background:sel.type==='full'?'#ECFDF5':'#fff',color:sel.type==='full'?'#059669':'#374151'}}>
            ✅ Full Access
          </button>
          <button onClick={()=>setSel({type:'admin',comboId:null,customIds:[],isAdmin:true})}
            style={{padding:'7px 14px',borderRadius:8,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'Inter,sans-serif',
              border:`1.5px solid ${sel.isAdmin?'#D97706':'#E5E7EB'}`,
              background:sel.isAdmin?'#FFFBEB':'#fff',color:sel.isAdmin?'#D97706':'#374151'}}>
            👑 Admin
          </button>
          <button onClick={()=>setSel({type:'custom',comboId:null,customIds:sel.customIds,isAdmin:false})}
            style={{padding:'7px 14px',borderRadius:8,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'Inter,sans-serif',
              border:`1.5px solid ${sel.type==='custom'?'#6366F1':'#E5E7EB'}`,
              background:sel.type==='custom'?'#EEF2FF':'#fff',color:sel.type==='custom'?'#6366F1':'#374151'}}>
            🎛 Custom
          </button>
        </div>

        {/* All 31 combos */}
        {!sel.isAdmin && sel.type!=='custom' && sel.type!=='full' && (
          <div>
            <p style={{fontSize:10,fontWeight:600,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:6}}>
              All {ALL_COMBOS.length} combinations
            </p>
            <div style={{display:'flex',flexWrap:'wrap',gap:5,maxHeight:220,overflowY:'auto',padding:'2px 0'}}>
              {ALL_COMBOS.map(c=>{
                const active = sel.type==='combo' && sel.comboId===c.id
                return(
                  <button key={c.id} onClick={()=>setSel({type:'combo',comboId:c.id,customIds:[],isAdmin:false})}
                    style={{
                      padding:'5px 10px',borderRadius:7,fontSize:11.5,fontWeight:active?700:500,
                      cursor:'pointer',fontFamily:'Inter,sans-serif',transition:'all .12s',
                      border:`1.5px solid ${active?c.color:c.border}`,
                      background:active?c.bg:'#fff',
                      color:active?c.color:'#374151',
                      boxShadow:active?`0 0 0 2px ${c.color}22`:'none',
                    }}>
                    {c.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Custom checkboxes */}
        {sel.type==='custom' && (
          <div>
            <p style={{fontSize:10,fontWeight:600,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:6}}>
              Select dashboards ({sel.customIds.length} selected)
            </p>
            <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
              {DASHBOARDS.map(d=>{
                const checked = sel.customIds.includes(d.id)
                return(
                  <label key={d.id} style={{
                    display:'flex',alignItems:'center',gap:6,padding:'8px 12px',borderRadius:8,cursor:'pointer',
                    border:`1.5px solid ${checked?'#6366F1':'#E5E7EB'}`,
                    background:checked?'#EEF2FF':'#F9FAFB',
                    fontSize:12.5,fontWeight:checked?600:400,
                    color:checked?'#4F46E5':'#374151',transition:'all .12s'
                  }}>
                    <input type="checkbox" checked={checked} onChange={()=>{
                      const next = checked ? sel.customIds.filter(x=>x!==d.id) : [...sel.customIds,d.id]
                      setSel({...sel, customIds:next})
                    }} style={{accentColor:'#6366F1'}}/>
                    {d.icon} {d.label}
                  </label>
                )
              })}
            </div>
          </div>
        )}

        {/* Preview */}
        {(sel.type==='combo'&&sel.comboId) && (
          <div style={{marginTop:8,padding:'7px 12px',background:'#F0F9FF',borderRadius:7,border:'1px solid #BAE6FD',fontSize:11.5,color:'#0369A1'}}>
            ✓ Will have access to: <strong>{activeCombo?.label}</strong>
          </div>
        )}
        {sel.type==='full' && <div style={{marginTop:8,padding:'7px 12px',background:'#ECFDF5',borderRadius:7,border:'1px solid #A7F3D0',fontSize:11.5,color:'#059669'}}>✓ Will have access to all 5 dashboards</div>}
        {sel.isAdmin && <div style={{marginTop:8,padding:'7px 12px',background:'#FFFBEB',borderRadius:7,border:'1px solid #FDE68A',fontSize:11.5,color:'#D97706'}}>✓ Admin — all dashboards + User Access management</div>}
        {sel.type==='custom' && sel.customIds.length>0 && (
          <div style={{marginTop:8,padding:'7px 12px',background:'#EEF2FF',borderRadius:7,border:'1px solid #C7D2FE',fontSize:11.5,color:'#4F46E5'}}>
            ✓ Access to: {sel.customIds.map(id=>DASHBOARDS.find(d=>d.id===id)?.label).filter(Boolean).join(', ')}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={styles.layout}>
      <Sidebar/>
      <main className={styles.main}>
        <div className={styles.header}>
          <div>
            <p className={styles.breadcrumb}>Settings</p>
            <h1 className={styles.title}>Settings & AI Assistant</h1>
            <p className={styles.subtitle}>Manage team access and preferences</p>
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
                  {m.role==='assistant'&&<div className={styles.aiAvatar}><svg width="14" height="14" viewBox="0 0 22 22" fill="none"><rect x="1" y="12" width="4" height="9" rx="1.5" fill="#4BAE8A"/><rect x="7" y="7" width="4" height="14" rx="1.5" fill="#1C9FD4"/><rect x="13" y="4" width="4" height="17" rx="1.5" fill="#1F3C84"/></svg></div>}
                  <div className={styles.msgBubble} dangerouslySetInnerHTML={{__html:renderMd(m.content)}}/>
                </div>
              ))}
              {chatLoading&&<div className={styles.aiMsg}><div className={styles.aiAvatar}><svg width="14" height="14" viewBox="0 0 22 22" fill="none"><rect x="1" y="12" width="4" height="9" rx="1.5" fill="#4BAE8A"/><rect x="7" y="7" width="4" height="14" rx="1.5" fill="#1C9FD4"/><rect x="13" y="4" width="4" height="17" rx="1.5" fill="#1F3C84"/></svg></div><div className={styles.msgBubble}><span className={styles.typing}><span/><span/><span/></span></div></div>}
              {chatError&&<div className={styles.errorMsg}>{chatError}</div>}
              <div ref={bottomRef}/>
            </div>
            <div className={styles.quickWrap}>
              {['Overall ROAS 2025?','Best CPL campaign?','AC vs VAS revenue?','QL% trend?'].map(q=>(
                <button key={q} className={styles.quickBtn} onClick={()=>setChatInput(q)}>{q}</button>
              ))}
            </div>
            <div className={styles.inputRow}>
              <textarea className={styles.chatInput} placeholder="Ask anything... (Enter to send)" value={chatInput}
                onChange={e=>setChatInput(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChat()}}} rows={2}/>
              <button className={styles.sendBtn} onClick={sendChat} disabled={chatLoading||!chatInput.trim()}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
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
          </div>
        )}

        {/* USER ACCESS */}
        {activeTab==='users'&&userIsAdmin&&(
          <div className={styles.settingsWrap}>
            <div className={styles.settingCard}>
              <h3 className={styles.settingTitle}>User Access Management</h3>
              <p className={styles.settingDesc}>
                Choose from <strong>31 combinations</strong> of dashboard access, select Full Access, Admin, or build a Custom combination. Changes apply instantly.
              </p>

              {/* Add user section */}
              <div style={{background:'#F9FAFB',borderRadius:12,padding:'16px',marginBottom:16,border:'1px solid #F3F4F6'}}>
                <p style={{fontSize:12.5,fontWeight:700,color:'#111827',marginBottom:12}}>➕ Add New User</p>
                <div style={{marginBottom:12}}>
                  <p style={{fontSize:10,fontWeight:600,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:5}}>Email</p>
                  <input type="email"
                    style={{padding:'9px 13px',border:'1px solid #E5E7EB',borderRadius:8,fontSize:13,fontFamily:'Inter,sans-serif',color:'#111827',outline:'none',width:280}}
                    placeholder="email@leverageedu.com" value={newEmail}
                    onChange={e=>setNewEmail(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addUser()}/>
                </div>
                <div style={{marginBottom:12}}>
                  <p style={{fontSize:10,fontWeight:600,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:8}}>Access Level</p>
                  <AccessSelector sel={newSelection} setSel={setNewSelection}/>
                </div>
                <button onClick={addUser} disabled={usersLoading}
                  style={{padding:'9px 20px',borderRadius:8,background:'#111827',color:'#fff',border:'none',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>
                  {usersLoading?'Adding...':'+ Add User'}
                </button>
              </div>

              {accessMsg&&(
                <div style={{padding:'10px 14px',borderRadius:8,marginBottom:12,fontSize:12.5,fontWeight:500,
                  color:accessMsg.startsWith('✅')?'#059669':'#DC2626',
                  background:accessMsg.startsWith('✅')?'#ECFDF5':'#FEF2F2',
                  border:`1px solid ${accessMsg.startsWith('✅')?'#A7F3D0':'#FECACA'}`
                }}>{accessMsg}</div>
              )}

              {/* Users list */}
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                <p style={{fontSize:11,fontWeight:600,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.05em'}}>
                  {usersLoading?'Loading...':`${accessList.length} users with access`}
                </p>
                <button onClick={loadUsers} style={{fontSize:11,color:'#1C9FD4',background:'none',border:'none',cursor:'pointer'}}>↻ Refresh</button>
              </div>

              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {accessList.map(u=>{
                  const rl = getRoleDisplay(u.role)
                  const isEditing = editingUser===u.email
                  const currentIds = parsePermissions(u.role)

                  return(
                    <div key={u.email} style={{background:'#fff',borderRadius:12,border:'1px solid #F3F4F6',overflow:'hidden',boxShadow:'0 1px 3px rgba(0,0,0,0.05)'}}>
                      <div style={{display:'flex',alignItems:'center',gap:10,padding:'13px 16px'}}>
                        <div style={{width:36,height:36,borderRadius:'50%',background:rl.bg,border:`1.5px solid ${rl.border}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,color:rl.color,flexShrink:0}}>
                          {u.email[0].toUpperCase()}
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:600,color:'#111827',display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                            {u.email}
                            {u.email===user?.email&&<span style={{fontSize:9.5,background:'#ECFDF5',color:'#059669',border:'1px solid #A7F3D0',borderRadius:4,padding:'1px 6px',fontWeight:700}}>YOU</span>}
                          </div>
                          <div style={{display:'flex',alignItems:'center',gap:5,marginTop:4,flexWrap:'wrap'}}>
                            <span style={{fontSize:11,fontWeight:700,color:rl.color,background:rl.bg,border:`1px solid ${rl.border}`,borderRadius:5,padding:'2px 8px'}}>{rl.label}</span>
                            {u.role!=='admin'&&currentIds.map(id=>{
                              const d=DASHBOARDS.find(x=>x.id===id)
                              return d?<span key={id} style={{fontSize:10,color:'#6B7280',background:'#F3F4F6',borderRadius:4,padding:'1px 6px'}}>{d.icon}</span>:null
                            })}
                          </div>
                        </div>
                        {u.email!==user?.email&&(
                          <div style={{display:'flex',gap:6,flexShrink:0}}>
                            <button onClick={()=>isEditing?setEditingUser(null):startEdit(u)}
                              style={{padding:'6px 13px',borderRadius:7,border:`1px solid ${isEditing?'#6366F1':'#E5E7EB'}`,background:isEditing?'#EEF2FF':'#fff',color:isEditing?'#6366F1':'#374151',fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>
                              {isEditing?'✕ Cancel':'✏️ Edit'}
                            </button>
                            <button onClick={()=>removeUser(u.email)}
                              style={{padding:'6px 13px',borderRadius:7,border:'1px solid #FECACA',background:'#FEF2F2',color:'#DC2626',fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>
                              Remove
                            </button>
                          </div>
                        )}
                      </div>

                      {isEditing&&(
                        <div style={{borderTop:'1px solid #F3F4F6',padding:'16px',background:'#FAFBFF'}}>
                          <p style={{fontSize:12.5,fontWeight:700,color:'#111827',marginBottom:12}}>Change access for <span style={{color:'#6366F1'}}>{u.email}</span></p>
                          <AccessSelector sel={editSelection} setSel={setEditSelection}/>
                          <div style={{display:'flex',gap:8,marginTop:14}}>
                            <button onClick={()=>saveEdit(u.email)} disabled={usersLoading}
                              style={{padding:'8px 20px',borderRadius:8,background:'#6366F1',color:'#fff',border:'none',fontSize:12.5,fontWeight:600,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>
                              {usersLoading?'Saving...':'Save Changes'}
                            </button>
                            <button onClick={()=>setEditingUser(null)}
                              style={{padding:'8px 14px',borderRadius:8,background:'#F3F4F6',color:'#374151',border:'none',fontSize:12.5,fontWeight:500,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>
                              Cancel
                            </button>
                          </div>
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
