import React, { useState, useEffect, useRef } from 'react'
import Sidebar, { PAGE_LIST } from '../components/Sidebar'
import { useAuth, getAccessList, addUserAccess, removeUserAccess, updateUserRole } from '../hooks/useAuth'
import { getActivityLog } from '../components/ActivityLogger.js'
import styles from './SettingsPage.module.css'


const getRoleMeta = (role) => {
  if (role === 'admin') return { label: 'Admin', color: '#1F3C84', bg: '#E8EFF9' }
  if (role === 'viewer') return { label: 'Viewer', color: '#1C9FD4', bg: '#E3F5FD' }
  // viewer:home,meta_ads,... or custom:... => Custom badge
  if (typeof role === 'string' && (role.startsWith('viewer:') || role.startsWith('custom:'))) {
    return { label: 'Custom', color: '#29B9C3', bg: '#E4F8F9' }
  }
  return { label: 'Viewer', color: '#1C9FD4', bg: '#E3F5FD' }
}

const DASHBOARDS = PAGE_LIST.filter(p => p.id !== 'settings')

const DATA_SOURCES = [
  { name: 'Meta Graph API',       src: 'act_641914389215638', rows: 'live' },
  { name: 'QL Ops Sheet',         src: 'Google Sheets CSV',   rows: 'live' },
  { name: 'WhatsApp Sheet',       src: 'Google Sheets CSV',   rows: 'live' },
  { name: 'Cross-Channel Sheet',  src: 'aiContext.js',        rows: 'live' },
]

// Mini SVG icon renderer for KPI icon picker
function KpiIconPreview({ name, color = '#94A3B8' }) {
  const s = { width:16, height:16, viewBox:'0 0 24 24', fill:'none', stroke: color, strokeWidth:2, strokeLinecap:'round', strokeLinejoin:'round' }
  const icons = {
    'rupee':       <svg {...s}><path d="M6 3h12M6 8h12M6 13l9 8"/><path d="M6 8a6 6 0 000 5h4"/></svg>,
    'dollar':      <svg {...s}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
    'wallet':      <svg {...s}><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
    'card':        <svg {...s}><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/><line x1="5" y1="15" x2="9" y2="15"/></svg>,
    'chart-bar':   <svg {...s}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
    'users':       <svg {...s}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
    'person':      <svg {...s}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
    'funnel':      <svg {...s}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
    'target':      <svg {...s}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
    'star':        <svg {...s}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
    'percent':     <svg {...s}><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>,
    'trending':    <svg {...s}><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>,
    'activity':    <svg {...s}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
    'pulse':       <svg {...s}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
    'zap':         <svg {...s}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
    'trending-up': <svg {...s}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
    'coin':        <svg {...s}><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>,
    'gift':        <svg {...s}><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/></svg>,
    'building':    <svg {...s}><rect x="4" y="2" width="16" height="20"/><line x1="9" y1="22" x2="9" y2="12"/><line x1="15" y1="22" x2="15" y2="12"/><rect x="9" y="7" width="2" height="2"/><rect x="13" y="7" width="2" height="2"/></svg>,
    'check':       <svg {...s}><polyline points="20 6 9 17 4 12"/></svg>,
    'message':     <svg {...s}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
    'mail':        <svg {...s}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/></svg>,
    'send':        <svg {...s}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
    'bell':        <svg {...s}><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>,
    'chat':        <svg {...s}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
    'grid':        <svg {...s}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
    'layers':      <svg {...s}><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>,
    'cube':        <svg {...s}><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
    'diamond':     <svg {...s}><path d="M6 3h12l4 6-10 13L2 9z"/><path d="M2 9h20"/></svg>,
    'eye':         <svg {...s}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  }
  return icons[name] || icons['grid']
}

export default function SettingsPage() {
  const { user } = useAuth()
  const userIsAdmin = user?.role === 'admin'
  const [activeTab, setActiveTab] = useState('data')

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

  // ── Appearance ────────────────────────────────────────────────────────────
  const [hiddenPages, setHiddenPages] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lq_hidden_pages') || '[]') } catch { return [] }
  })
  const togglePageVisibility = (pageId) => {
    setHiddenPages(prev => {
      const next = prev.includes(pageId) ? prev.filter(id => id !== pageId) : [...prev, pageId]
      localStorage.setItem('lq_hidden_pages', JSON.stringify(next))
      // Broadcast to same-tab listeners (storage event only fires cross-tab)
      window.dispatchEvent(new CustomEvent('lq:hidden-pages-changed', { detail: next }))
      return next
    })
  }

  const [activeTheme, setActiveTheme] = useState(() => localStorage.getItem('lq_theme') || 'light')
  const applyTheme = (themeId) => {
    setActiveTheme(themeId)
    localStorage.setItem('lq_theme', themeId)
    document.documentElement.setAttribute('data-theme', themeId)
  }
  // Apply saved theme on mount
  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', activeTheme)
  }, [])

  const THEMES = [
    {
      id: 'light',
      name: 'Light',
      desc: 'Clean white — the default',
      preview: ['#F4F6F9', '#FFFFFF', '#1F3C84'],
    },
    {
      id: 'dark',
      name: 'Dark',
      desc: 'Dark slate — easy on the eyes',
      preview: ['#0F172A', '#1E293B', '#1C9FD4'],
    },
    {
      id: 'navy',
      name: 'Navy Depth',
      desc: 'Deep navy — premium dashboard look',
      preview: ['#0D1B40', '#162155', '#29B9C3'],
    },
    {
      id: 'stone',
      name: 'Stone',
      desc: 'Warm neutral — calm and focused',
      preview: ['#F5F5F0', '#FAFAF8', '#1F3C84'],
    },
  ]

  // KPI icon preferences (per metric slot)
  const [kpiIcons, setKpiIcons] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lq_kpi_icons') || '{}') } catch { return {} }
  })
  const KPI_ICON_SETS = {
    spend:       { label: 'Spend / Cost',   icons: ['rupee','dollar','wallet','card','chart-bar'] },
    leads:       { label: 'Leads / Opps',   icons: ['users','person','funnel','target','star'] },
    rate:        { label: 'Rates / %',      icons: ['percent','trending','activity','pulse','zap'] },
    revenue:     { label: 'Revenue',        icons: ['trending-up','coin','gift','building','check'] },
    messaging:   { label: 'Messages',       icons: ['message','mail','send','bell','chat'] },
    misc:        { label: 'General',        icons: ['grid','layers','cube','diamond','eye'] },
  }
  const setKpiIcon = (slot, icon) => {
    setKpiIcons(prev => {
      const next = { ...prev, [slot]: icon }
      localStorage.setItem('lq_kpi_icons', JSON.stringify(next))
      return next
    })
  }
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
  const parsePermissions = (role) => {
    if (role === 'admin') return DASHBOARDS.map(d => d.id)
    // plain viewer = all dashboards except chat/vasu
    if (!role || role === 'viewer') return DASHBOARDS.filter(d => d.id !== 'vasu').map(d => d.id)
    if (role.startsWith('viewer:')) return role.replace('viewer:', '').split(',').filter(Boolean)
    if (role.startsWith('custom:')) return role.replace('custom:', '').split(',').filter(Boolean)
    return DASHBOARDS.filter(d => d.id !== 'vasu').map(d => d.id)
  }
  const buildRoleString = (ids, isAdmin) => {
    if (isAdmin) return 'admin'
    // always store explicit list so access is unambiguous
    return 'viewer:' + ids.join(',')
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
    const isAdmin = u.role === 'admin'
    setEditIsAdmin(isAdmin)
    setEditIsViewer(!isAdmin)
    setEditIds(parsePermissions(u.role))
    setEditJobTitle(u.job_title || '')
    setEditDepartment(u.department || '')
  }
  const saveEdit = async (email) => {
    setUsersLoading(true)
    const role = buildRoleString(editIds, editIsAdmin)
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
    { id: 'data',       label: 'Data' },
    ...(userIsAdmin ? [{ id: 'users', label: 'User Access' }, { id: 'activity', label: 'Activity Log' }] : []),
    { id: 'appearance', label: 'Appearance' },
    { id: 'profile',    label: 'Profile' },
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
                  <span>User</span><span>Role</span><span>Access</span><span>Reports</span><span>Added</span><span>Actions</span>
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
          {/* ---------------- APPEARANCE ---------------- */}
          {activeTab === 'appearance' && (
            <>
              {/* PAGE VISIBILITY */}
              <div className={styles.card}>
                <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:18}}>
                  <div>
                    <h3 className={styles.cardTitle}>Page Visibility</h3>
                    <p className={styles.cardDesc} style={{margin:0}}>Hide pages from the sidebar navigation. Hidden pages remain accessible via direct URL.</p>
                  </div>
                  <span style={{fontSize:11,fontWeight:600,color:'#94A3B8',background:'#F8FAFC',border:'0.5px solid #E2E8F0',borderRadius:6,padding:'3px 10px',whiteSpace:'nowrap',marginTop:2}}>
                    {hiddenPages.length > 0 ? `${hiddenPages.length} hidden` : 'All visible'}
                  </span>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:10}}>
                  {DASHBOARDS.map(page => {
                    const isHidden = hiddenPages.includes(page.id)
                    return (
                      <div key={page.id} onClick={() => togglePageVisibility(page.id)}
                        style={{
                          display:'flex',alignItems:'center',gap:12,padding:'12px 14px',
                          borderRadius:10,border:`0.5px solid ${isHidden ? '#E2E8F0' : '#D1E9F7'}`,
                          background: isHidden ? '#F8FAFC' : '#F0FBFF',
                          cursor:'pointer',transition:'all .15s',userSelect:'none',
                        }}>
                        <div style={{
                          width:32,height:32,borderRadius:8,flexShrink:0,
                          background: isHidden ? '#F1F5F9' : '#E3F5FD',
                          display:'flex',alignItems:'center',justifyContent:'center',
                          transition:'all .15s',
                        }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isHidden ? '#94A3B8' : '#1C9FD4'} strokeWidth="2" strokeLinecap="round">
                            {isHidden
                              ? <><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>
                              : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
                            }
                          </svg>
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:600,color: isHidden ? '#94A3B8' : '#0F172A',letterSpacing:'-0.01em'}}>{page.label}</div>
                          <div style={{fontSize:11,color:'#94A3B8',marginTop:1}}>{isHidden ? 'Hidden from nav' : 'Visible in nav'}</div>
                        </div>
                        <div style={{
                          width:36,height:20,borderRadius:10,flexShrink:0,
                          background: isHidden ? '#E2E8F0' : '#1C9FD4',
                          position:'relative',transition:'background .2s',
                        }}>
                          <div style={{
                            position:'absolute',top:2,left: isHidden ? 2 : 18,
                            width:16,height:16,borderRadius:8,background:'#fff',
                            transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,0.15)',
                          }}/>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {hiddenPages.length > 0 && (
                  <button onClick={() => { setHiddenPages([]); localStorage.removeItem('lq_hidden_pages'); window.dispatchEvent(new CustomEvent('lq:hidden-pages-changed', { detail: [] })) }}
                    style={{marginTop:16,fontSize:12,fontWeight:600,color:'#DC2626',background:'none',border:'none',cursor:'pointer',padding:'4px 0',display:'flex',alignItems:'center',gap:5}}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
                    Reset all — show all pages
                  </button>
                )}
              </div>

              {/* THEME */}
              <div className={styles.card}>
                <h3 className={styles.cardTitle}>Theme</h3>
                <p className={styles.cardDesc}>Choose a colour scheme for the entire dashboard.</p>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:12}}>
                  {THEMES.map(theme => {
                    const isActive = activeTheme === theme.id
                    return (
                      <div key={theme.id} onClick={() => applyTheme(theme.id)}
                        style={{
                          borderRadius:12,border:`1.5px solid ${isActive ? '#1C9FD4' : '#E2E8F0'}`,
                          padding:'14px 16px',cursor:'pointer',transition:'all .15s',
                          background: isActive ? '#F0FBFF' : '#fff',
                          boxShadow: isActive ? '0 0 0 3px rgba(28,159,212,0.12)' : '0 1px 3px rgba(15,23,42,0.04)',
                          position:'relative',
                        }}>
                        {isActive && (
                          <div style={{position:'absolute',top:10,right:10,width:18,height:18,borderRadius:9,background:'#1C9FD4',display:'flex',alignItems:'center',justifyContent:'center'}}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                          </div>
                        )}
                        {/* Colour preview swatches */}
                        <div style={{display:'flex',gap:5,marginBottom:12}}>
                          {theme.preview.map((col, ci) => (
                            <div key={ci} style={{height:28,flex:1,borderRadius:6,background:col,border:'0.5px solid rgba(0,0,0,0.06)'}}/>
                          ))}
                        </div>
                        <div style={{fontSize:13,fontWeight:700,color:'#0F172A',marginBottom:2}}>{theme.name}</div>
                        <div style={{fontSize:11.5,color:'#94A3B8'}}>{theme.desc}</div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* KPI CARD ICONS */}
              <div className={styles.card}>
                <h3 className={styles.cardTitle}>KPI Card Icons</h3>
                <p className={styles.cardDesc}>Choose which icon style appears on metric cards. Changes apply across all dashboards.</p>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:16}}>
                  {Object.entries(KPI_ICON_SETS).map(([slot, cfg]) => {
                    const active = kpiIcons[slot] || cfg.icons[0]
                    return (
                      <div key={slot}>
                        <div style={{fontSize:11,fontWeight:700,color:'#94A3B8',letterSpacing:'0.07em',textTransform:'uppercase',marginBottom:8}}>{cfg.label}</div>
                        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                          {cfg.icons.map(icon => {
                            const isSelected = active === icon
                            return (
                              <button key={icon} onClick={() => setKpiIcon(slot, icon)}
                                title={icon}
                                style={{
                                  width:38,height:38,borderRadius:9,border:`1.5px solid ${isSelected ? '#1C9FD4' : '#E2E8F0'}`,
                                  background: isSelected ? '#E3F5FD' : '#F8FAFC',
                                  display:'flex',alignItems:'center',justifyContent:'center',
                                  cursor:'pointer',transition:'all .15s',
                                  boxShadow: isSelected ? '0 0 0 3px rgba(28,159,212,0.1)' : 'none',
                                }}>
                                <KpiIconPreview name={icon} color={isSelected ? '#1C9FD4' : '#94A3B8'} />
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div style={{marginTop:16,padding:'12px 14px',background:'#F8FAFC',borderRadius:9,border:'0.5px solid #E2E8F0',display:'flex',alignItems:'center',gap:10}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  <span style={{fontSize:12,color:'#94A3B8'}}>Icon preferences are saved locally. Assign icons to each metric category to match your team's mental model.</span>
                </div>
              </div>
            </>
          )}

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
