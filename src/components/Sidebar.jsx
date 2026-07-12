import React from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import styles from './Sidebar.module.css'
import SnapshotTool from './SnapshotTool'

const NAV = [
  {
    label: 'Intelligence',
    items: [
      { to: '/ask-ai', icon: <AskAIIcon />, label: 'Ask AI', end: true },
    ]
  },
  {
    label: 'Overview',
    items: [
      { to: '/', icon: <HomeIcon />, label: 'Summary', end: true },
    ]
  },
  {
    label: 'Analytics',
    items: [
      {
        to: '/dashboard/meta-ads',
        icon: <MetaIcon />,
        label: 'Meta Ads',
        defaultTo: '/dashboard/meta-ads?tab=campaigns',
        end: false,
        subItems: [
          { to: '/dashboard/meta-ads?tab=creatives', label: 'Creatives', matchType: 'query', tabKey: 'creatives' },
          { to: '/dashboard/meta-ads?tab=campaigns', label: 'Campaigns', matchType: 'query', tabKey: 'campaigns' },
          { to: '/dashboard/meta-ads?tab=mom', label: 'Month on Month', matchType: 'query', tabKey: 'mom' },
          { to: '/dashboard/meta-ads?tab=dod', label: 'Day on Day', matchType: 'query', tabKey: 'dod' },
        ]
      },
      {
        to: '/dashboard/google-ads',
        icon: <GoogleAdsIcon />,
        label: 'Google Ads',
        end: false,
        subItems: [
          { to: '/dashboard/google-ads?tab=campaigns',   label: 'Campaigns',    matchType: 'query', tabKey: 'campaigns' },
          { to: '/dashboard/google-ads?tab=keywords',    label: 'Keywords',     matchType: 'query', tabKey: 'keywords' },
          { to: '/dashboard/google-ads?tab=searchTerms', label: 'Search Terms', matchType: 'query', tabKey: 'searchTerms' },
          { to: '/dashboard/google-ads?tab=adGroups',   label: 'Ad Groups',    matchType: 'query', tabKey: 'adGroups' },{ to: '/dashboard/google-ads?tab=mom', label: 'Month on Month', matchType: 'query', tabKey: 'mom' },{ to: '/dashboard/google-ads?tab=dod', label: 'Day on Day', matchType: 'query', tabKey: 'dod' },
        ]
      },
      { to: '/dashboard/bing-ads', icon: <BingAdsIcon />, label: 'Bing Ads', end: false },
      { to: '/dashboard/roas',         icon: <ChartIcon />,    label: 'ROAS',         end: false },
      { to: '/dashboard/mtd',          icon: <MTDIcon />,      label: 'MTD',          end: false },
      { to: '/dashboard/lead-quality', icon: <FunnelIcon />,   label: 'Lead Quality', end: false },
      { to: '/dashboard/channel-mix',  icon: <MixIcon />,      label: 'Channel Mix',  end: false },
      { to: '/dashboard/revenue',      icon: <RevenueIcon />,  label: 'Revenue',      end: false },
      {
        to: '/dashboard/lq-ops',
        icon: <PeopleIcon />,
        label: 'QL Ops',
        end: false,
        subItems: [
          { to: '/dashboard/lq-ops',         label: 'Daily QLs',   matchType: 'route' },
          { to: '/dashboard/lq-ops-monthly', label: 'Monthly QLs', matchType: 'route' },
        ]
      },
      { to: '/dashboard/whatsapp',     icon: <WhatsAppIcon />, label: 'WhatsApp',     end: false },
      { to: '/dashboard/referral', icon: <ReferralIcon />, label: 'Referral', end: false },
      { to: '/dashboard/leads-assigned', icon: <LeadsAssignedIcon />, label: 'Leads Assigned', end: false },
    ]
  },
]

// SINGLE SOURCE OF TRUTH for pages + access management.
// Add any new page here and it automatically appears in user-access management
// (and stays in sync with the sidebar id mapping). id must be stable (used for access enforcement).
export const PAGE_LIST = [
  { id:'home',         label:'Summary',      path:'/',                      adminOnly:false },
  { id:'meta_ads',     label:'Meta Ads',     path:'/dashboard/meta-ads',    adminOnly:false },
  { id:'google_ads',   label:'Google Ads',   path:'/dashboard/google-ads',  adminOnly:false },
  { id:'bing_ads',     label:'Bing Ads',     path:'/dashboard/bing-ads',   adminOnly:false },
  { id:'roas',         label:'ROAS',         path:'/dashboard/roas',        adminOnly:false },
  { id:'mtd',          label:'MTD',          path:'/dashboard/mtd',         adminOnly:false },
  { id:'lead_quality', label:'Lead Quality', path:'/dashboard/lead-quality',adminOnly:false },
  { id:'channel_mix',  label:'Channel Mix',  path:'/dashboard/channel-mix', adminOnly:false },
  { id:'revenue',      label:'Revenue',      path:'/dashboard/revenue',     adminOnly:false },
  { id:'lq_ops',         label:'Daily QLs',    path:'/dashboard/lq-ops',          adminOnly:false },
  { id:'lq_ops_monthly', label:'Monthly QLs',  path:'/dashboard/lq-ops-monthly',  adminOnly:false },
  { id:'whatsapp',     label:'WhatsApp',     path:'/dashboard/whatsapp',    adminOnly:false },
  { id:'referral', label:'Referral', path:'/dashboard/referral', adminOnly:false },
  { id:'leads_assigned', label:'Leads Assigned', path:'/dashboard/leads-assigned', adminOnly:false },
  { id:'ask_ai',         label:'Ask AI',      path:'/ask-ai',                  adminOnly:true  },
  { id:'settings',     label:'Settings',     path:'/settings',              adminOnly:true  },
]

function HomeIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> }
function ChartIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> }
function FunnelIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 3H2l8 9.46V19l4 2V12.46L22 3z"/></svg> }
function MTDIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> }
function MixIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> }
function WhatsAppIcon(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg> }
function ReferralIcon(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg> }
function LeadsAssignedIcon(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 14l2 2 4-4"/></svg> }
function PeopleIcon(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> }
function RevenueIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg> }
function MetaIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg> }
function SettingsIcon(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg> }
function AskAIIcon() { return (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ animation: 'askAiPulse 2.6s ease-in-out infinite', transformOrigin: 'center' }}><defs><linearGradient id="askAiGrad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop offset="0%" stopColor="#1F3C84"/><stop offset="45%" stopColor="#1C9FD4"/><stop offset="75%" stopColor="#29B9C3"/><stop offset="100%" stopColor="#4CAE6F"/></linearGradient></defs><path d="M12 2.2c.5 3.7 2.1 5.3 5.8 5.8-3.7.5-5.3 2.1-5.8 5.8-.5-3.7-2.1-5.3-5.8-5.8C9.9 7.5 11.5 5.9 12 2.2Z" fill="url(#askAiGrad)"/><path d="M18.5 14c.25 1.85 1.05 2.65 2.9 2.9-1.85.25-2.65 1.05-2.9 2.9-.25-1.85-1.05-2.65-2.9-2.9 1.85-.25 2.65-1.05 2.9-2.9Z" fill="#29B9C3" style={{ animation: 'askAiTwinkle 1.8s ease-in-out infinite', transformOrigin: '18.5px 16.9px' }}/></svg>); }

const ICON_MAP = {
  'Summary': <HomeIcon/>, 'ROAS': <ChartIcon/>, 'MTD': <MTDIcon/>,
  'Lead Quality': <FunnelIcon/>, 'Channel Mix': <MixIcon/>,
  'Revenue': <RevenueIcon/>, 'Meta Ads': <MetaIcon/>,
  'Google Ads': <GoogleAdsIcon/>, 'QL Ops': <PeopleIcon/>, 'Daily QLs': <PeopleIcon/>, 'Monthly QLs': <MTDIcon/>,
  'Bing Ads': <BingAdsIcon/>,
  'Referral': <ReferralIcon/>, 'Leads Assigned': <LeadsAssignedIcon/>,
  'WhatsApp': <WhatsAppIcon/>,
  'Ask AI': <AskAIIcon/>, 'Settings': <SettingsIcon/>
}
function GoogleAdsIcon(){
  return <svg width='16' height='16' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M21.35 11.1H12.18V13.83H18.69C18.36 17.64 15.19 19.27 12.19 19.27C8.36 19.27 5 16.25 5 12C5 7.9 8.2 4.73 12.2 4.73C15.29 4.73 17.1 6.7 17.1 6.7L19 4.72C19 4.72 16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12C2.03 17.05 6.16 22 12.25 22C17.6 22 21.5 18.33 21.5 12.91C21.5 11.76 21.35 11.1 21.35 11.1Z' fill='currentColor'/></svg>
}
function BingAdsIcon(){
  return <svg width='16' height='16' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M6 3l4 1.4V16l4.2-2.4-1.9-.8-1.3-3.3L16 11l3 1.7-9 5.3-4-2.3V3z' fill='currentColor'/></svg>
}

export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [collapsed, setCollapsed] = React.useState(() => {
    if (typeof window !== 'undefined' && window.innerWidth <= 1024) return true
    try { return localStorage.getItem('lq_sidebar_collapsed') === 'true' } catch { return false }
  })
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const [hiddenPages, setHiddenPages] = React.useState(() => {
    // Start with localStorage as a best-effort value; not rendered until prefsReady is true.
    try { return JSON.parse(localStorage.getItem('lq_hidden_pages') || '[]') } catch { return [] }
  })
  // Nav items are only rendered once we KNOW the real visibility list -- never render
  // permissively while this is still loading (that was the flash-of-hidden-pages bug:
  // a page an admin hid, or a page outside a restricted viewer's grant, would briefly
  // show for every user on every login before this resolved).
  const [prefsReady, setPrefsReady] = React.useState(false)

  // On mount: fetch from server (source of truth), then keep in sync via events
  React.useEffect(() => {
    fetch('/api/preferences', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { prefs: {} })
      .then(data => {
        const hp = data.prefs?.hidden_pages || []
        setHiddenPages(hp)
        // Keep localStorage in sync so next page load is instant
        localStorage.setItem('lq_hidden_pages', JSON.stringify(hp))
      })
      .catch(() => {}) // fail silently — localStorage fallback stays
      .finally(() => setPrefsReady(true))
  }, [])

  // Real-time sync within session (from Settings page Save button)
  React.useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'lq_hidden_pages') {
        try { setHiddenPages(JSON.parse(e.newValue || '[]')) } catch { setHiddenPages([]) }
      }
    }
    const onCustom = (e) => { setHiddenPages(e.detail || []) }
    const onSidebarMode = (e) => {
      if (e.detail && e.detail.collapsed !== undefined) {
        setCollapsed(e.detail.collapsed)
      }
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('lq:hidden-pages-changed', onCustom)
    window.addEventListener('lq:sidebar-mode-changed', onSidebarMode)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('lq:hidden-pages-changed', onCustom)
      window.removeEventListener('lq:sidebar-mode-changed', onSidebarMode)
    }
  }, [])
  const isPageVisible = (label) => {
    if (!prefsReady) return false
    const pageId = idMap[label]
    return !pageId || !hiddenPages.includes(pageId)
  }
  React.useEffect(() => {
    const mq = window.matchMedia('(max-width: 1024px)')
    const handler = (e) => { if (e.matches) setCollapsed(true) }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const isMetaParentActive = location.pathname.startsWith('/dashboard/meta-ads')
  const isGoogleParentActive = location.pathname.startsWith('/dashboard/google-ads')
  const isQlOpsParentActive = location.pathname === '/dashboard/lq-ops' || location.pathname === '/dashboard/lq-ops-monthly'

  const [metaExpanded, setMetaExpanded] = React.useState(isMetaParentActive)
  React.useEffect(() => { if (isMetaParentActive) setMetaExpanded(true) }, [isMetaParentActive])

  const [googleExpanded, setGoogleExpanded] = React.useState(isGoogleParentActive)
  React.useEffect(() => { if (isGoogleParentActive) setGoogleExpanded(true) }, [isGoogleParentActive])

  const [qlOpsExpanded, setQlOpsExpanded] = React.useState(isQlOpsParentActive)
  React.useEffect(() => { if (isQlOpsParentActive) setQlOpsExpanded(true) }, [isQlOpsParentActive])

  const getExpanded = (label) => label === 'Meta Ads' ? metaExpanded : label === 'Google Ads' ? googleExpanded : label === 'QL Ops' ? qlOpsExpanded : false
  const setExpanded = (label) => label === 'Meta Ads' ? setMetaExpanded : label === 'Google Ads' ? setGoogleExpanded : label === 'QL Ops' ? setQlOpsExpanded : () => {}

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    try { localStorage.setItem('lq_sidebar_collapsed', String(next)) } catch {}
  }

  const handleLogout = () => { logout(); }

  const userRole = user?.role || 'viewer'
  const isViewerRole = userRole !== 'admin'

  function canSee(id) {
    // Auth still loading -- show nothing rather than falling back to the permissive
    // default 'viewer' role, which would briefly grant every dashboard (including ones
    // a restricted custom-viewer account was never actually given) until the real
    // role loads a moment later.
    if (!user) return false
    // Settings is always admin-only
    if (id === 'settings') return userRole === 'admin'
    // Admin sees everything
    if (userRole === 'admin') return true
    // Plain viewer = all dashboards EXCEPT ask-ai (must be explicitly granted)
    if (userRole === 'viewer') return id !== 'ask_ai'
    // Custom viewer access: "viewer:home,meta_ads,..." — only granted ids are visible
    if (userRole?.startsWith('viewer:')) {
      const granted = userRole.replace('viewer:', '').split(',').filter(Boolean)
      return granted.includes(id)
    }
    // Legacy support
    if (userRole === 'roas_only') return id === 'roas'
    if (userRole?.startsWith('custom:')) return userRole.replace('custom:', '').split(',').filter(Boolean).includes(id)
    // Fallback: treat unknown as viewer (no ask-ai)
    return id !== 'ask_ai'
  }

  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : user?.email?.[0]?.toUpperCase() || 'LQ'

  const idMap = Object.fromEntries(PAGE_LIST.map(p => [p.label, p.id]))

  const currentTab = new URLSearchParams(location.search).get('tab') || 'campaigns'

  const isSubActive = (sub) => {
    if (sub.matchType === 'route') return location.pathname === sub.to
    return location.pathname.startsWith(sub.to.split('?')[0]) && currentTab === sub.tabKey
  }

  if (collapsed) {
    return (
      <>
      <div className="lq-mobile-topbar" style={{display:'none',position:'fixed',top:0,left:0,right:0,zIndex:1000,height:52,background:'var(--sidebar-bg)',borderBottom:'0.5px solid var(--card-border)',alignItems:'center',justifyContent:'space-between',padding:'0 16px'}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <svg width="20" height="20" viewBox="0 0 22 22" fill="none"><rect x="1" y="12" width="4" height="9" rx="1.5" fill="#4CAE6F"/><rect x="7" y="7" width="4" height="14" rx="1.5" fill="#29B9C3"/><rect x="13" y="4" width="4" height="17" rx="1.5" fill="#1C9FD4"/></svg>
          <span style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:11,fontWeight:700,color:'#1C9FD4',letterSpacing:'2px',textTransform:'uppercase'}}>QUANTUM</span>
        </div>
        <button onClick={()=>setMobileOpen(o=>!o)} style={{background:'none',border:'none',cursor:'pointer',padding:6,color:'#374151',display:'flex',alignItems:'center'}}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
      </div>
      {mobileOpen && (
        <div style={{position:'fixed',inset:0,zIndex:999,display:'flex'}} onClick={()=>setMobileOpen(false)}>
          <div style={{width:240,height:'100%',background:'var(--sidebar-bg)',borderRight:'0.5px solid var(--card-border)',overflowY:'auto',paddingTop:60}} onClick={e=>e.stopPropagation()}>
            {NAV.map(group=>(
              <div key={group.label} style={{marginBottom:8,padding:'0 10px'}}>
                <div style={{fontSize:10,fontWeight:600,color:'#9CA3AF',letterSpacing:'0.08em',textTransform:'uppercase',padding:'10px 6px 4px'}}>{group.label}</div>
                {group.items.map(item=>(
                  <a key={item.to} href={item.to} onClick={()=>setMobileOpen(false)}
                    style={{display:'flex',alignItems:'center',gap:9,padding:'9px 10px',borderRadius:9,textDecoration:'none',color:'#374151',fontSize:13,fontWeight:500,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
                    {item.icon}{item.label}
                  </a>
                ))}
              </div>
            ))}
          </div>
          <div style={{flex:1,background:'rgba(0,0,0,0.3)'}}/>
        </div>
      )}
      <aside className={styles.sidebarCollapsed}>
        {/* Quantum logo mark — visible when collapsed */}
        <div style={{
          height: 52, display:'flex', alignItems:'center', justifyContent:'center',
          flexShrink: 0, borderBottom: '0.5px solid #F3F4F6', width:'100%'
        }}>
          <div style={{
            width:34, height:34, borderRadius:9, background:'#F0F4FF',
            border:'0.5px solid #E0E7FF', display:'flex', alignItems:'center', justifyContent:'center'
          }}>
            <svg width="16" height="16" viewBox="0 0 22 22" fill="none">
              <rect x="1" y="12" width="4" height="9" rx="1.5" fill="#4CAE6F"/>
              <rect x="7" y="7" width="4" height="14" rx="1.5" fill="#1C9FD4"/>
              <rect x="13" y="4" width="4" height="17" rx="1.5" fill="#1F3C84"/>
            </svg>
          </div>
        </div>
        <button className={styles.collapseBtn} onClick={toggle} title="Expand sidebar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <div className={styles.collapsedNav}>
          {NAV.map(group => group.items.filter(item => canSee(idMap[item.label]) && isPageVisible(item.label)).map(item => (
            <NavLink key={item.label} to={item.to} end={item.end}
              className={({ isActive }) => `${styles.collapsedItem} ${isActive || (item.label === 'Meta Ads' && isMetaParentActive) ? styles.collapsedActive : ''}`}
              title={item.label}>
              {ICON_MAP[item.label]}
            </NavLink>
          )))}
        </div>
        <div className={styles.collapsedAvatar} title={user?.email}>
          <div className={styles.avatar}>
            {user?.picture ? <img src={user.picture} alt={user.name}/> : initials}
          </div>
        </div>
        <SnapshotTool/>
      </aside>
      </>
    )
  }

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logoArea}>
        <div className={styles.logoPill}>
          <img src="https://publicassets.leverageedu.com/landing-pages-new/logo-dark.svg" alt="Leverage Edu" className={styles.logoImg}/>
        </div>
        <div className={styles.dividerLine}/>
        <div className={styles.quantumLabel}>
          <svg width="14" height="14" viewBox="0 0 22 22" fill="none" style={{overflow:'visible'}}>
            <rect x="1" y="12" width="4" height="9" rx="1.5" fill="#4CAE6F" style={{transformOrigin:'1px 21px',animation:'barGrow 0.6s cubic-bezier(0.34,1.56,0.64,1) 0.1s both'}}/>
            <rect x="7" y="7" width="4" height="14" rx="1.5" fill="#1C9FD4" style={{transformOrigin:'7px 21px',animation:'barGrow 0.6s cubic-bezier(0.34,1.56,0.64,1) 0.2s both'}}/>
            <rect x="13" y="4" width="4" height="17" rx="1.5" fill="#1F3C84" style={{transformOrigin:'13px 21px',animation:'barGrow 0.6s cubic-bezier(0.34,1.56,0.64,1) 0.3s both'}}/>
          </svg>
          <span>QUANTUM</span>
        </div>
        <button className={styles.collapseBtnExpanded} onClick={toggle} title="Collapse sidebar">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
      </div>

      <nav className={styles.nav}>
        {NAV.map(group => (
          <div key={group.label} className={styles.group}>
            {group.label !== 'Intelligence' && <p className={styles.groupLabel}>{group.label}</p>}
            {group.items.filter(item => canSee(idMap[item.label]) && isPageVisible(item.label)).map(item => {
              if (item.subItems) {
                const parentActive = item.label === 'Meta Ads' ? isMetaParentActive : item.label === 'Google Ads' ? isGoogleParentActive : item.label === 'QL Ops' ? isQlOpsParentActive : false
                return (
                  <div key={item.label}>
                    <button
                      className={`${styles.navItem} ${parentActive ? styles.active : ''}`}
                      onClick={() => { setExpanded(item.label)(e => !e); if (!parentActive) navigate(item.defaultTo || item.subItems[0].to) }}
                      style={{width:'100%',textAlign:'left',background:'none',border:'none',cursor:'pointer',font:'inherit'}}>
                      <span className={styles.navIcon}>{item.icon}</span>
                      <span style={{flex:1}}>{item.label}</span>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                        style={{transform: getExpanded(item.label) ? 'rotate(180deg)' : 'none', transition:'transform .2s', opacity:.4}}>
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </button>
                    {getExpanded(item.label) && (
                      <div className={styles.subNav}>
                        {item.subItems.map(sub => (
                          <button key={sub.label}
                            className={`${styles.subNavItem} ${isSubActive(sub) ? styles.subNavActive : ''}`}
                            onClick={() => navigate(sub.to)}
                            style={{width:'100%',textAlign:'left',background:'none',border:'none',cursor:'pointer',font:'inherit'}}>
                            <span style={{width:5,height:5,borderRadius:'50%',background:isSubActive(sub)?'#1F3C84':'#D1D5DB',flexShrink:0,display:'inline-block'}}/>
                            <span>{sub.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              }
              return (
                <NavLink key={item.label} to={item.to} end={item.end}
                  className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}>
                  <span className={styles.navIcon}>{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              )
            })}
          </div>
        ))}
      </nav>




      <div className={styles.userArea}>
        <div className={styles.avatar}>
          {user?.picture ? <img src={user.picture} alt={user.name}/> : initials}
          <span className={styles.statusDot} aria-hidden="true" />
        </div>
        <div className={styles.userInfo}>
          <div className={styles.userMeta}>
            <p className={styles.userName}>{user?.name?.split(' ')[0] || 'User'}</p>
            <NavLink
              to="/settings?tab=profile"
              title="View profile"
              className={`${styles.roleBadge} ${userRole==='admin' ? styles.roleBadgeAdmin : styles.roleBadgeViewer}`}
            >
              {userRole==='admin' ? 'Admin' : 'Viewer'}
            </NavLink>
          </div>
          <p className={styles.userEmail}>{user?.email}</p>
        </div>
        {canSee('settings') && (
          <NavLink to="/settings" title="Settings"
            className={({ isActive }) => `${styles.gearBtn}${isActive ? ' '+styles.gearBtnActive : ''}`}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>
          </NavLink>
        )}
        <span className={styles.footDivider} aria-hidden="true" />
        <button onClick={handleLogout} className={styles.logoutBtn} title="Sign out">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
          </svg>
        </button>
      </div>
      <SnapshotTool/>
    </aside>
  )
                                  }
