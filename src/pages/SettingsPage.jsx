import { useState, useRef, useEffect } from 'react'
import Sidebar, { PAGE_LIST } from '../components/Sidebar'
import { useAuth, getAccessList, addUserAccess, removeUserAccess, updateUserRole } from '../hooks/useAuth'
import { DATA_CONTEXT } from '../data/aiContext.js'
import { getActivityLog } from '../components/ActivityLogger.js'
import styles from './SettingsPage.module.css'

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
    'You are VASU AI, the internal analytics assistant inside Leverage Quantum — Leverage Edu\'s marketing dashboard.',
    '',
    '=== YOUR ROLE ===',
    'You answer questions about Leverage Edu\'s 2025 marketing performance across all internal dashboards: ROAS, MTD, Lead Quality, Channel Mix, and Revenue.',
    'You have deep access to BigQuery data — monthly breakdowns, channel splits, funnel metrics, and revenue.',
    'IMPORTANT: You are READ-ONLY. Decline any requests to modify dashboards or data.',
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

const DASHBOARDS = PAGE_LIST.filter(p => p.id !== 'settings').map(p => ({ id: p.id, label: p.label }))

function parsePermissions(role) {
  if (!role || role === 'viewer' || role === 'admin') return DASHBOARDS.map(d => d.id)
  if (role === 'roas_only') return ['roas']
  if (role.startsWith('custom:')) return role.replace('custom:', '').split(',').filter(Boolean)
  return DASHBOARDS.map(d => d.id)
}
function buildRoleString(ids, isAdm, isView) {
  if (isAdm) return 'admin'
  if (isView) return 'viewer'
  if (ids.length === DASHBOARDS.length) return 'viewer'
  return 'custom:' + ids.join(',')
}
function getRoleMeta(role) {
  if (role === 'admin')  return { label: 'Admin',  cls: styles.roleAdmin }
  if (role === 'viewer') return { label: 'Viewer', cls: styles.roleViewer }
  const ids = parsePermissions(role)
  if (ids.length === DASHBOARDS.length) return { label: 'Full Access', cls: styles.roleFull }
  if (ids.length === 1 && ids[0] === 'roas') return { label: 'ROAS Only', cls: styles.roleRoas }
  return { label: 'Custom (' + ids.length + ')', cls: styles.roleCustom }
}

const QUICK_PROMPTS = [
  { label: 'Overall ROAS',      q: 'What is our overall ROAS for 2025? Break it down by month and highlight best/worst.' },
  { label: 'CPL by channel',    q: 'Compare CPL across all channels. Which is most and least efficient?' },
  { label: 'AC vs VAS revenue', q: 'Break down AC vs VAS revenue for Aug-Dec 2025. Which vertical is stronger?' },
  { label: 'QL% trend',         q: 'Analyse our QL% trend month by month. Which months were worst and why might that be?' },
  { label: 'Funnel analysis',   q: 'Give me a complete funnel: OPPs to QLs to Apps with conversion rates for 2025.' },
  { label: 'Spend efficiency',  q: 'Which months had the best spend efficiency? Show spend vs revenue vs ROAS.' },
  { label: 'Best month',        q: 'Which month performed best overall? Consider ROAS, CPL, and QL% together.' },
  { label: 'Recommendations',   q: 'Based on 2025 data, what are your top 3 recommendations for improving performance?' },
]

const DATA_SOURCES = [
  { name: 'Leads / OPPs',   src: 'BigQuery',               rows: '61,184' },
  { name: 'Futwork QLs',    src: 'BigQuery',               rows: '4,127'  },
  { name: 'Apps / STUs',    src: 'BigQuery',               rows: '3,170'  },
  { name: 'Ad Spend',       src: 'BigQuery',               rows: '3,492'  },
  { name: 'AC/VAS Revenue', src: 'CIB Data',               rows: '3,828'  },
  { name: 'MTD Live',       src: 'Overall PM Google Sheet', rows: 'Live'  },
]

function QIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <rect x="1" y="12" width="4" height="9" rx="1.5" fill="#4CAE6F" />
      <rect x="7" y="7" width="4" height="14" rx="1.5" fill="#1C9FD4" />
      <rect x="13" y="4" width="4" height="17" rx="1.5" fill="#1F3C84" />
    </svg>
  )
}

export default function SettingsPage() {
  const { user } = useAuth()
  const userIsAdmin = user?.role === 'admin'
  const [activeTab, setActiveTab] = useState('chat')

  // Activity
  const [activityLog, setActivityLog] = useState([])
  const [activityLoading, setActivityLoading] = useState(false)
  const loadActivity = async () => {
    setActivityLoading(true)
    setActivityLog(await getActivityLog(200))
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
  const [editIsViewer, setEditIsViewer] = useState(false)

  const loadUsers = async () => {
    setUsersLoading(true)
    setAccessList(await getAccessList())
    setUsersLoading(false)
  }
  useEffect(() => { if (userIsAdmin) loadUsers() }, [userIsAdmin])

  const [userSearch, setUserSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')

  const setMsg = (m) => { setAccessMsg(m); setTimeout(() => setAccessMsg(''), 4000) }
  const isOkMsg = accessMsg.startsWith('Added') || accessMsg.startsWith('Access') || accessMsg.startsWith('Removed')

  const roleGroup = (role) => {
    if (role === 'admin') return 'admin'
    if (role === 'viewer') return 'viewer'
    return 'custom'
  }
  const filteredUsers = accessList.filter(u => {
    const q = userSearch.trim().toLowerCase()
    const matchesSearch = !q || u.email.toLowerCase().includes(q)
    const matchesRole = roleFilter === 'all' || roleGroup(u.role) === roleFilter
    return matchesSearch && matchesRole
  })
  const stats = {
    total: accessList.length,
    admins: accessList.filter(u => u.role === 'admin').length,
    members: accessList.filter(u => u.role !== 'admin').length,
    reports: accessList.filter(u => u.receive_reports).length,
  }
  const accessLabel = (role) => {
    if (role === 'admin' || role === 'viewer') return 'All dashboards'
    if (role === 'roas_only') return 'ROAS only'
    const n = parsePermissions(role).length
    return n + (n === 1 ? ' dashboard' : ' dashboards')
  }
  const fmtDate = (d) => {
    if (!d) return '—'
    try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) }
    catch { return '—' }
  }

  const addUser = async () => {
    const email = newEmail.trim().toLowerCase()
    if (!email.includes('@leverageedu.com')) { setMsg('Only @leverageedu.com emails allowed'); return }
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
    setEditIsViewer(u.role === 'viewer')
    setEditIds(parsePermissions(u.role))
  }
  const saveEdit = async (email) => {
    setUsersLoading(true)
    const role = buildRoleString(editIds, editIsAdmin, editIsViewer)
    if (await updateUserRole(email, role)) { setMsg('Access updated'); await loadUsers() }
    else setMsg('Failed')
    setEditingUser(null)
    setUsersLoading(false)
  }
  const toggleReports = async (u, checked) => {
    await fetch('/api/users', {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: u.email, receive_reports: checked }),
    })
    loadUsers()
  }

  // Chat
  const [messages, setMessages] = useState([{
    role: 'assistant',
    content: 'Hi! I am VASU AI, powered by Llama 3 (Groq).\n\nI have access to your complete 2025 marketing data:\n- Rs.29.45 Cr total spend (Jan-Dec)\n- 18.69L OPPs, 98.6K QLs, 18.3K Apps\n- Revenue data Aug-Dec (AC + VAS)\n- Channel breakdown: Facebook, Google, Affiliate\n\nAsk me anything about ROAS, CPL, revenue, funnel, or channel performance!'
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
      const reply = await askGroq(updated.slice(-10))
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
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br/>')
  }

  const TABS = [
    { id: 'chat',    label: 'Chat' },
    { id: 'data',    label: 'Data' },
    ...(userIsAdmin ? [{ id: 'users', label: 'User Access' }, { id: 'activity', label: 'Activity Log' }] : []),
    { id: 'profile', label: 'Profile' },
  ]

  return (
    <div className={styles.layout}>
      <Sidebar />
      <div className={styles.main}>
        <div className={styles.header}>
          <p className={styles.breadcrumb}>Settings</p>
          <h1 className={styles.title}>Settings</h1>
        </div>

        <div className={styles.content}>
          <div className={styles.tabBar}>
            {TABS.map(t => (
              <button key={t.id}
                className={`${styles.tab} ${activeTab === t.id ? styles.tabActive : ''}`}
                onClick={() => setActiveTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ---------------- VASU AI ---------------- */}
          {activeTab === 'chat' && (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'60px 20px', gap:20 }}>
              <div style={{ width:64, height:64, borderRadius:18, background:'var(--navy-tint)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <svg width="28" height="28" viewBox="0 0 22 22" fill="none">
                  <rect x="1" y="12" width="4" height="9" rx="1.5" fill="#4CAE6F"/>
                  <rect x="7" y="7" width="4" height="14" rx="1.5" fill="#1C9FD4"/>
                  <rect x="13" y="4" width="4" height="17" rx="1.5" fill="#1F3C84"/>
                </svg>
              </div>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:18, fontWeight:800, color:'var(--text)', marginBottom:8, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>Chat has moved</div>
                <div style={{ fontSize:13.5, color:'var(--text2)', maxWidth:380, lineHeight:1.6, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
                  The AI marketing analyst is now a dedicated page with conversation history, prompt library, and memories.
                </div>
              </div>
              <a href="/vasu" style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'10px 22px', borderRadius:10, background:'#1F3C84', color:'#fff', fontSize:13.5, fontWeight:700, fontFamily:"'Plus Jakarta Sans',sans-serif", textDecoration:'none', boxShadow:'0 2px 8px rgba(31,60,132,0.3)' }}>
                Open Chat →
              </a>
            </div>
          )}

          {/* ---------------- DATA ---------------- */}
          {activeTab === 'data' && (
            <>
              <div className={styles.card}>
                <h3 className={styles.cardTitle}>SR Revenue Assumptions</h3>
                <p className={styles.cardDesc}>SR fee per RAU used in projected revenue. Formula: RAUs × SR Fee × 0.9</p>
                <label className={styles.fieldLabel}>SR Fee per RAU</label>
                <div className={styles.inputGroup}>
                  <span className={styles.prefix}>Rs.</span>
                  <input type="number" className={styles.input} style={{ maxWidth: 220 }} value={srFeeInput}
                    onChange={e => setSrFeeInput(e.target.value)} />
                  <button className={styles.primaryBtn} onClick={saveSrFee}>{srFeeSaved ? 'Saved' : 'Save'}</button>
                </div>
                <p className={styles.note}>Current: Rs.{parseInt(srFeeInput || 90000).toLocaleString('en-IN')} per RAU</p>
              </div>

              <div className={styles.card}>
                <h3 className={styles.cardTitle}>Data Sources</h3>
                <div className={styles.sourceList}>
                  {DATA_SOURCES.map(s => (
                    <div key={s.name} className={styles.sourceRow}>
                      <div>
                        <div className={styles.sourceName}>{s.name}</div>
                        <div className={styles.sourceMeta}>{s.src} — {s.rows} rows</div>
                      </div>
                      <span className={styles.sourceStatus}>Connected</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ---------------- USER ACCESS ---------------- */}
          {activeTab === 'users' && userIsAdmin && (
            <>
              {/* page header */}
              <div className={styles.uaHeader}>
                <div>
                  <h2 className={styles.uaTitle}>User Access</h2>
                  <p className={styles.uaSubtitle}>Manage who can access Quantum and which dashboards they see.</p>
                </div>
                <div className={styles.uaHeaderActions}>
                  <button className={styles.ghostBtn} onClick={loadUsers}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                    </svg>
                    Refresh
                  </button>
                </div>
              </div>

              {/* stat strip */}
              <div className={styles.statStrip}>
                <div className={styles.statCard}>
                  <div><div className={styles.statLabel}>Total members</div><div className={styles.statValue}>{stats.total}</div></div>
                  <span className={`${styles.statIcon} ${styles.statIconNavy}`}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
                  </span>
                </div>
                <div className={styles.statCard}>
                  <div><div className={styles.statLabel}>Admins</div><div className={styles.statValue}>{stats.admins}</div></div>
                  <span className={`${styles.statIcon} ${styles.statIconBlue}`}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  </span>
                </div>
                <div className={styles.statCard}>
                  <div><div className={styles.statLabel}>Members</div><div className={styles.statValue}>{stats.members}</div></div>
                  <span className={`${styles.statIcon} ${styles.statIconCyan}`}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  </span>
                </div>
                <div className={styles.statCard}>
                  <div><div className={styles.statLabel}>Daily reports</div><div className={styles.statValue}>{stats.reports}</div></div>
                  <span className={`${styles.statIcon} ${styles.statIconGreen}`}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 4h16v16H4z"/><path d="M8 12l3 3 5-6"/></svg>
                  </span>
                </div>
              </div>

              {/* toolbar: search + role filter + add */}
              <div className={styles.toolbar}>
                <div className={styles.searchBox}>
                  <svg className={styles.searchIcon} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
                  <input className={styles.searchInput} placeholder="Search by email…" value={userSearch} onChange={e => setUserSearch(e.target.value)} />
                </div>
                <select className={styles.filterSelect} value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
                  <option value="all">All roles</option>
                  <option value="admin">Admin</option>
                  <option value="viewer">Viewer</option>
                  <option value="custom">Custom</option>
                </select>
                <input type="email" className={styles.addInput} placeholder="name@leverageedu.com"
                  value={newEmail} onChange={e => setNewEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && addUser()} />
                <button className={styles.primaryBtn} onClick={addUser} disabled={usersLoading}>
                  {usersLoading ? 'Adding…' : 'Add member'}
                </button>
              </div>

              {accessMsg && (
                <div className={`${styles.toast} ${isOkMsg ? styles.toastOk : styles.toastErr}`}>{accessMsg}</div>
              )}

              {/* table */}
              <div className={styles.tableCard}>
                <div className={styles.tableHead}>
                  <span>User</span><span>Role</span><span>Access</span><span>Reports</span><span>Added</span><span></span>
                </div>

                {filteredUsers.length === 0 && (
                  <div className={styles.empty}>{usersLoading ? 'Loading…' : 'No members match your search.'}</div>
                )}

                {filteredUsers.map((u) => {
                  const rm = getRoleMeta(u.role)
                  const isEditing = editingUser === u.email
                  const isYou = u.email === user?.email
                  return (
                    <div key={u.email}>
                      <div className={`${styles.uRow} ${isEditing ? styles.uRowEdit : ''}`}>
                        <div className={styles.uUser}>
                          <div className={styles.userAvatar}>{u.email[0].toUpperCase()}</div>
                          <div className={styles.uUserText}>
                            <span className={styles.userName}>{u.email.split('@')[0]}{isYou && <span className={styles.youTag}>YOU</span>}</span>
                            <span className={styles.uEmail}>{u.email}</span>
                          </div>
                        </div>
                        <div><span className={`${styles.roleBadge} ${rm.cls}`}>{rm.label}</span></div>
                        <div className={styles.uAccess}>{accessLabel(u.role)}</div>
                        <div>
                          <label className={styles.reportsToggle} title="Receive daily report">
                            <input type="checkbox" checked={!!u.receive_reports} onChange={e => toggleReports(u, e.target.checked)} />
                          </label>
                        </div>
                        <div className={styles.uAdded}>{fmtDate(u.created_at)}</div>
                        <div className={styles.rowActions}>
                          {!isYou && (
                            <>
                              <button className={`${styles.iconBtn} ${isEditing ? styles.iconBtnActive : ''}`}
                                onClick={() => isEditing ? setEditingUser(null) : startEdit(u)}>
                                {isEditing ? 'Cancel' : 'Edit'}
                              </button>
                              <button className={styles.deleteBtn} onClick={() => removeUser(u.email)} title="Remove" aria-label="Remove member">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
                                </svg>
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {isEditing && (
                        <div className={styles.editPanel}>
                          <p className={styles.editLabel}>Edit Permissions</p>
                          <div className={styles.roleOptions}>
                            <label className={`${styles.roleOption} ${editIsAdmin ? styles.roleOptionActive : ''}`}>
                              <input type="radio" name="role" checked={editIsAdmin} onChange={() => { setEditIsAdmin(true); setEditIsViewer(false) }} />
                              Admin <span className={styles.roleHint}>Full access</span>
                            </label>
                            <label className={`${styles.roleOption} ${editIsViewer ? styles.roleOptionActive : ''}`}>
                              <input type="radio" name="role" checked={editIsViewer} onChange={() => { setEditIsViewer(true); setEditIsAdmin(false) }} />
                              Viewer <span className={styles.roleHint}>Custom access</span>
                            </label>
                          </div>

                          {editIsAdmin && <p className={styles.cardDesc}>Admin has full access to all dashboards and settings.</p>}

                          {editIsViewer && (
                            <div className={styles.dashGrid}>
                              {DASHBOARDS.map(d => {
                                const checked = editIds.includes(d.id)
                                return (
                                  <label key={d.id} className={`${styles.dashChip} ${checked ? styles.dashChipActive : ''}`}>
                                    <input type="checkbox" checked={checked}
                                      onChange={() => setEditIds(p => checked ? p.filter(x => x !== d.id) : [...p, d.id])} />
                                    {d.label}
                                  </label>
                                )
                              })}
                            </div>
                          )}

                          <div className={styles.editActions}>
                            <button className={styles.primaryBtn} onClick={() => saveEdit(u.email)} disabled={usersLoading}>
                              {usersLoading ? 'Saving…' : 'Save changes'}
                            </button>
                            <button className={styles.ghostBtn} onClick={() => setEditingUser(null)}>Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}

                <div className={styles.tableFoot}>Showing {filteredUsers.length} of {accessList.length} members</div>
              </div>
            </>
          )}

          {/* ---------------- ACTIVITY LOG ---------------- */}
          {activeTab === 'activity' && userIsAdmin && (
            <div className={styles.card}>
              <div className={styles.activityHeader}>
                <div>
                  <h3 className={styles.cardTitle}>Activity Log</h3>
                  <p className={styles.cardDesc} style={{ margin: 0 }}>See who viewed which dashboard and when.</p>
                </div>
                <button className={styles.ghostBtn} onClick={loadActivity}>
                  {activityLoading ? 'Loading…' : '↻ Load log'}
                </button>
              </div>

              {activityLog.length === 0 && !activityLoading && (
                <div className={styles.empty}>
                  Click “Load log” to see activity.<br />
                  Activity is tracked when users open dashboards.
                </div>
              )}

              {activityLog.length > 0 && (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>{['User', 'Action', 'Page', 'Time'].map(h => <th key={h} className={styles.th}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {activityLog.map((log, i) => {
                        const tagCls = log.action === 'view' ? styles.actView : log.action === 'login' ? styles.actLogin : styles.actOther
                        return (
                          <tr key={i}>
                            <td className={`${styles.td} ${styles.tdUser}`}>{log.email?.split('@')[0]}</td>
                            <td className={styles.td}><span className={`${styles.actionTag} ${tagCls}`}>{log.action}</span></td>
                            <td className={styles.td}>{log.page}</td>
                            <td className={styles.td}>
                              {new Date(log.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ---------------- PROFILE ---------------- */}
          {activeTab === 'profile' && (
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>Your Profile</h3>
              <p className={styles.cardDesc}>Signed in with your Leverage Edu Google account.</p>
              <div className={styles.profileRow}>
                <div className={styles.profileAvatar}>
                  {user?.picture
                    ? <img src={user.picture} alt={user.name} className={styles.profileImg} />
                    : <span>{user?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'LE'}</span>}
                </div>
                <div>
                  <div className={styles.profileName}>{user?.name || 'User'}</div>
                  <div className={styles.profileEmail}>{user?.email}</div>
                  <div className={styles.profileBadge}>{user?.role === 'admin' ? 'Admin' : 'Member'}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
