import React from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import styles from './Sidebar.module.css'

const NAV = [
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
        end: false,
        subItems: [
          { to: '/dashboard/meta-ads?tab=creatives', label: 'Creatives', matchType: 'query', tabKey: 'creatives' },
          { to: '/dashboard/meta-ads?tab=campaigns', label: 'Campaigns', matchType: 'query', tabKey: 'campaigns' },

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
          { to: '/dashboard/google-ads?tab=search_terms',label: 'Search Terms', matchType: 'query', tabKey: 'search_terms' },
          { to: '/dashboard/google-ads?tab=ad_groups',  label: 'Ad Groups',    matchType: 'query', tabKey: 'ad_groups' },
        ]
      },
      { to: '/dashboard/roas', icon: <ChartIcon />, label: 'ROAS', end: false },
      { to: '/dashboard/mtd', icon: <MTDIcon />, label: 'MTD', end: false },
      { to: '/dashboard/lead-quality', icon: <FunnelIcon />, label: 'Lead Quality', end: false },
      { to: '/dashboard/channel-mix', icon: <MixIcon />, label: 'Channel Mix', end: false },
      { to: '/dashboard/revenue', icon: <RevenueIcon />, label: 'Revenue', end: false },
    ]
  },
  {
    label: 'Intelligence',
    items: [
      { to: '/vasu', icon: <VasuIcon />, label: 'VASU AI', end: false },
    ]
  },
]

function HomeIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> }
function ChartIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> }
function FunnelIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 3H2l8 9.46V19l4 2V12.46L22 3z"/></svg> }
function MTDIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> }
function MixIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> }
function RevenueIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg> }
function MetaIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg> }
function SettingsIcon(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg> }
function VasuIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7h1a1 1 0 010 2h-1v1a2 2 0 01-2 2H5a2 2 0 01-2-2v-1H2a1 1 0 010-2h1a7 7 0 017-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 012-2z"/><path d="M10 12v4M14 12v4"/></svg> }

const ICON_MAP = {
  'Summary': <HomeIcon/>, 'ROAS': <ChartIcon/>, 'MTD': <MTDIcon/>,
  'Lead Quality': <FunnelIcon/>, 'Channel Mix': <MixIcon/>,
  'Revenue': <RevenueIcon/>, 'Meta Ads': <MetaIcon/>,
  'VASU AI': <VasuIcon/>, 'Settings': <SettingsIcon/>
}
function GoogleAdsIcon(){
  return <svg width='16' height='16' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M21.35 11.1H12.18V13.83H18.69C18.36 17.64 15.19 19.27 12.19 19.27C8.36 19.27 5 16.25 5 12C5 7.9 8.2 4.73 12.2 4.73C15.29 4.73 17.1 6.7 17.1 6.7L19 4.72C19 4.72 16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12C2.03 17.05 6.16 22 12.25 22C17.6 22 21.5 18.33 21.5 12.91C21.5 11.76 21.35 11.1 21.35 11.1Z' fill='currentColor'/></svg>
}

export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [collapsed, setCollapsed] = React.useState(() => {
    try { return localStorage.getItem('lq_sidebar_collapsed') === 'true' } catch { return false }
  })

  const isMetaParentActive = location.pathname.startsWith('/dashboard/meta-ads')
  const isGoogleParentActive = location.pathname.startsWith('/dashboard/google-ads')

  const [metaExpanded, setMetaExpanded] = React.useState(isMetaParentActive)
  React.useEffect(() => { if (isMetaParentActive) setMetaExpanded(true) }, [isMetaParentActive])

  const [googleExpanded, setGoogleExpanded] = React.useState(isGoogleParentActive)
  React.useEffect(() => { if (isGoogleParentActive) setGoogleExpanded(true) }, [isGoogleParentActive])

  const getExpanded = (label) => label === 'Meta Ads' ? metaExpanded : label === 'Google Ads' ? googleExpanded : false
  const setExpanded = (label) => label === 'Meta Ads' ? setMetaExpanded : label === 'Google Ads' ? setGoogleExpanded : () => {}

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    try { localStorage.setItem('lq_sidebar_collapsed', String(next)) } catch {}
  }

  const handleLogout = () => { logout(); navigate('/login') }

  const userRole = user?.role || 'viewer'
  const isViewerRole = userRole === 'viewer'

  function canSee(id) {
    if (isViewerRole && (id === 'settings' || id === 'vasu')) return false
    if (!userRole || userRole === 'admin' || userRole === 'viewer') return true
    if (userRole === 'roas_only') return id === 'roas'
    if (userRole?.startsWith('custom:')) return userRole.replace('custom:','').split(',').includes(id)
    return true
  }

  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : user?.email?.[0]?.toUpperCase() || 'LQ'

  const idMap = {
    'Summary':'home','ROAS':'roas','MTD':'mtd','Lead Quality':'lead_quality',
    'Channel Mix':'channel_mix','Revenue':'revenue','Meta Ads':'meta_ads',
    'VASU AI':'vasu','Settings':'settings'
  }

  const currentTab = new URLSearchParams(location.search).get('tab') || 'campaigns'

  const isSubActive = (sub) => {
    if (sub.matchType === 'route') return location.pathname === sub.to
    return location.pathname.startsWith('/dashboard/meta-ads') && currentTab === sub.tabKey
  }

  if (collapsed) {
    return (
      <aside className={styles.sidebarCollapsed}>
        <button className={styles.collapseBtn} onClick={toggle} title="Expand sidebar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <div className={styles.collapsedNav}>
          {NAV.map(group => group.items.filter(item => canSee(idMap[item.label])).map(item => (
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
      </aside>
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
          <svg width="14" height="14" viewBox="0 0 22 22" fill="none">
            <rect x="1" y="12" width="4" height="9" rx="1.5" fill="#4CAE6F" className={styles.sbar1}/>
            <rect x="7" y="7" width="4" height="14" rx="1.5" fill="#1C9FD4" className={styles.sbar2}/>
            <rect x="13" y="4" width="4" height="17" rx="1.5" fill="#1F3C84" className={styles.sbar3}/>
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
            <p className={styles.groupLabel}>{group.label}</p>
            {group.items.filter(item => canSee(idMap[item.label])).map(item => {
              if (item.subItems) {
                return (
                  <div key={item.label}>
                    <button
                      className={`${styles.navItem} ${(item.label === 'Meta Ads' ? isMetaParentActive : isGoogleParentActive) ? styles.active : ''}`}
                      onClick={() => { setExpanded(item.label)(e => !e); if (!isMetaParentActive) navigate(item.to + '?tab=campaigns') }}
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

      {canSee('settings') && (
        <div className={styles.settingsArea}>
          <NavLink to="/settings"
            className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}>
            <span className={styles.navIcon}><SettingsIcon /></span>
            <span>Settings</span>
          </NavLink>
        </div>
      )}

      <div className={styles.userArea}>
        <div className={styles.avatar}>
          {user?.picture ? <img src={user.picture} alt={user.name}/> : initials}
        </div>
        <div className={styles.userInfo}>
          <div style={{display:'flex',alignItems:'center',gap:5}}>
            <p className={styles.userName}>{user?.name?.split(' ')[0] || 'User'}</p>
            <span style={{fontSize:9,fontWeight:700,padding:'1px 6px',borderRadius:10,
              background: userRole==='admin' ? '#E8EFF9' : '#F3F4F6',
              color: userRole==='admin' ? '#1F3C84' : '#6B7280',
              textTransform:'uppercase',letterSpacing:.04}}>
              {userRole==='admin' ? 'Admin' : 'Viewer'}
            </span>
          </div>
          <p className={styles.userEmail}>{user?.email}</p>
        </div>
        <button onClick={handleLogout} className={styles.logoutBtn} title="Sign out">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
          </svg>
        </button>
      </div>
    </aside>
  )
                                  }
