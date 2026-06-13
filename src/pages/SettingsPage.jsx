import React, { useState, useEffect, useRef } from 'react'
import Sidebar, { PAGE_LIST } from '../components/Sidebar'
import { useAuth, getAccessList, addUserAccess, removeUserAccess, updateUserRole } from '../hooks/useAuth'
import { getActivityLog } from '../components/ActivityLogger.js'
import styles from './SettingsPage.module.css'


const getRoleMeta = (role) => {
  const map = {
    admin:   { label: 'Admin',   color: '#1F3C84', bg: '#E8EFF9' },
    viewer:  { label: 'Viewer',  color: '#1C9FD4', bg: '#E3F5FD' },
    default: { label: role || 'Viewer', color: '#94A3B8', bg: '#F3F4F6', cls: '' },
  }
  return map[role] || map.default
}

const DASHBOARDS = PAGE_LIST.filter(p => p.id !== 'settings')

export default function SettingsPage() {
  const { user } = useAuth()
  const userIsAdmin = user?.role === 'admin'
  const [activeTab, setActiveTab] = useState('chat')

  const _actRef = useRef(false)
  useEffect(() => {
    if (activeTab === 'activity' && userIsAdmin && !_actRef.current) { _actRef.current=true; loadActivity() }
  }, [activeTab, userIsAdmin])

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
  const [editJobTitle, setEditJobTitle] = useState('')
  const [editDepartment, setEditDepartment] = useState('')

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
    setEditJobTitle(u.job_title || '')
    setEditDepartment(u.department || '')
  }
  const saveEdit = async (email) => {
    setUsersLoading(true)
    const role = buildRoleString(editIds, editIsAdmin, editIsViewer)
    const ok = await updateUserRole(email, role)
    await fetch('/api/users', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, job_title: editJobTitle, department: editDepartment }) })
    if (ok) { setMsg('Access updated'); await loadUsers() } else setMsg('Failed')
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

  const TABS = [
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

          {/* ---------------- CHAT ---------------- */}
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
                          <div className={styles.userAvatar} style={{
                            background:`linear-gradient(135deg,${['#1F3C84','#1C9FD4','#4CAE6F','#29B9C3','#8B5CF6'][((u.email||'').charCodeAt(0)||65)%5]},${['#1C9FD4','#29B9C3','#4CAE6F','#1F3C84','#29B9C3'][((u.email||'').charCodeAt(1)||66)%5]})`,
                            width:36,height:36,borderRadius:10,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',
                            color:'#fff',fontSize:12,fontWeight:700,letterSpacing:'0.5px',boxShadow:'0 2px 8px rgba(15,23,42,0.18)',
                          }}>
                            {u.email.split('@')[0].slice(0,2).toUpperCase()}
                          </div>
                          <div className={styles.uUserText}>
                            <span className={styles.userName}>{u.email.split('@')[0]}{isYou && <span className={styles.youTag}>YOU</span>}</span>
                            <span className={styles.uEmail}>{u.email}</span>
                            {(u.job_title||u.department)&&<span style={{fontSize:10.5,color:'#94A3B8',fontWeight:500,marginTop:1}}>{[u.job_title,u.department].filter(Boolean).join(' · ')}</span>}
                          </div>
                        </div>
                        <div><span className={styles.roleBadge} style={{background:rm.bg||'#E8EFF9',color:rm.color||'#1F3C84',borderRadius:20,padding:'3px 10px',fontSize:11,fontWeight:700}}>{rm.label}</span></div>
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

                          <div style={{marginTop:14,display:'flex',gap:10}}>
                            <div style={{flex:1}}>
                              <label style={{fontSize:11,fontWeight:600,color:'#64748B',display:'block',marginBottom:4,letterSpacing:'0.05em'}}>JOB TITLE</label>
                              <input value={editJobTitle} onChange={e=>setEditJobTitle(e.target.value)} placeholder="e.g. Data Analyst"
                                style={{width:'100%',padding:'7px 10px',borderRadius:8,border:'0.5px solid #E2E8F0',fontSize:12.5,fontFamily:"'Plus Jakarta Sans',sans-serif",outline:'none',boxSizing:'border-box'}}/>
                            </div>
                            <div style={{flex:1}}>
                              <label style={{fontSize:11,fontWeight:600,color:'#64748B',display:'block',marginBottom:4,letterSpacing:'0.05em'}}>DEPARTMENT</label>
                              <input value={editDepartment} onChange={e=>setEditDepartment(e.target.value)} placeholder="e.g. Performance Marketing"
                                style={{width:'100%',padding:'7px 10px',borderRadius:8,border:'0.5px solid #E2E8F0',fontSize:12.5,fontFamily:"'Plus Jakarta Sans',sans-serif",outline:'none',boxSizing:'border-box'}}/>
                            </div>
                          </div>

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
                  {activityLoading ? 'Loading…' : '↻ Refresh'}
                </button>
              </div>

              {activityLog.length === 0 && !activityLoading && (
                <div className={styles.empty}>
                  Click “Load log” to see activity.<br />
                  Activity is tracked when users open dashboards.
                </div>
              )}

              {activityLog.length > 0 && (
                <div style={{overflowX:'auto',marginTop:8}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:12.5}}>
                    <thead>
                      <tr style={{borderBottom:'1.5px solid #F1F5F9'}}>
                        {['USER','EMAIL','ACTION','PAGE','DATE','TIME','AGO'].map(h=>(
                          <th key={h} style={{padding:'9px 12px',textAlign:'left',fontSize:10.5,fontWeight:700,color:'#94A3B8',letterSpacing:'0.06em',whiteSpace:'nowrap'}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activityLog.map((log,idx)=>{
                        const diff = Date.now()-new Date(log.created_at)
                        const rel = diff<60000?'just now':diff<3600000?Math.round(diff/60000)+'m ago':diff<86400000?Math.round(diff/3600000)+'h ago':Math.round(diff/86400000)+'d ago'
                        const avColor = ['#1F3C84','#1C9FD4','#4CAE6F','#29B9C3','#8B5CF6'][((log.email||'').charCodeAt(0)||65)%5]
                        const avColor2 = ['#1C9FD4','#29B9C3','#4CAE6F','#1F3C84','#29B9C3'][((log.email||'').charCodeAt(1)||66)%5]
                        const pg = (log.page||'app').replace('/dashboard/','').replace('/','').split('?')[0]||'app'
                        const pgLabel = pg.split('-').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ')
                        const actionColor = log.action==='view'?'#1C9FD4':log.action==='login'?'#4CAE6F':'#94A3B8'
                        const actionBg = log.action==='view'?'#E3F5FD':log.action==='login'?'#E9F8EF':'#F3F4F6'
                        const dt = new Date(log.created_at)
                        const dateStr = dt.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})
                        const timeStr = dt.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true})
                        return (
                          <tr key={idx} style={{borderBottom:'0.5px solid #F8FAFC',background:idx%2===0?'#fff':'#FAFBFC',transition:'background .1s'}}
                            onMouseEnter={e=>e.currentTarget.style.background='#F0F4FF'}
                            onMouseLeave={e=>e.currentTarget.style.background=idx%2===0?'#fff':'#FAFBFC'}>
                            <td style={{padding:'10px 12px',whiteSpace:'nowrap'}}>
                              <div style={{display:'flex',alignItems:'center',gap:8}}>
                                <div style={{width:28,height:28,borderRadius:8,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:10,fontWeight:700,background:`linear-gradient(135deg,${avColor},${avColor2})`,boxShadow:'0 1px 4px rgba(15,23,42,0.15)'}}>
                                  {(log.email||'?').split('@')[0].slice(0,2).toUpperCase()}
                                </div>
                                <span style={{fontWeight:600,color:'#0F172A'}}>{(log.email||'').split('@')[0]}</span>
                              </div>
                            </td>
                            <td style={{padding:'10px 12px',color:'#64748B',fontSize:11.5}}>{log.email}</td>
                            <td style={{padding:'10px 12px'}}>
                              <span style={{padding:'3px 9px',borderRadius:20,fontSize:10.5,fontWeight:700,background:actionBg,color:actionColor,textTransform:'uppercase',letterSpacing:'0.04em'}}>{log.action||'view'}</span>
                            </td>
                            <td style={{padding:'10px 12px',color:'#0F172A',fontWeight:600}}>{pgLabel}</td>
                            <td style={{padding:'10px 12px',whiteSpace:'nowrap',color:'#374151'}}>{dateStr}</td>
                            <td style={{padding:'10px 12px',whiteSpace:'nowrap',color:'#374151'}}>{timeStr}</td>
                            <td style={{padding:'10px 12px',color:'#94A3B8',whiteSpace:'nowrap',fontSize:11.5}}>{rel}</td>
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
