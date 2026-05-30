import React from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import styles from './Sidebar.module.css'

const NAV = [
  {
    label: 'Dashboards',
    items: [
      { to: '/',                       icon: <HomeIcon />,    label: 'Home',         end: true  },
      { to: '/dashboard/roas',         icon: <ChartIcon />,   label: 'ROAS',         end: false },
      { to: '/dashboard/mtd',          icon: <MTDIcon />,     label: 'MTD',          end: false },
      { to: '/dashboard/lead-quality', icon: <FunnelIcon />,  label: 'Lead Quality', end: false },
      { to: '/dashboard/channel-mix',  icon: <MixIcon />,     label: 'Channel Mix',  end: false },
      { to: '/dashboard/revenue',      icon: <RevenueIcon />, label: 'Revenue',      end: false },
      {
        to: '/dashboard/meta-ads',
        icon: <MetaIcon />,
        label: 'Meta Ads',
        end: false,
        subItems: [
          { to: '/dashboard/meta-ads?tab=campaigns', label: 'Campaigns' },
          { to: '/dashboard/meta-ads?tab=creatives', label: 'Creatives' },
        ]
      },
    ]
  },
  {
    label: 'Account',
    items: [
      { to: '/vasu',      icon: <VasuIcon />,     label: 'VASU AI',  end: false },
      { to: '/settings',  icon: <SettingsIcon />, label: 'Settings', end: false },
    ]
  }
]

function HomeIcon()    { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> }
function ChartIcon()   { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> }
function FunnelIcon()  { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 3H2l8 9.46V19l4 2V12.46L22 3z"/></svg> }
function MTDIcon()     { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> }
function MixIcon()     { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> }
function RevenueIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg> }
function MetaIcon()    { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg> }
function SettingsIcon(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg> }
function VasuIcon()    { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7h1a1 1 0 010 2h-1v1a2 2 0 01-2 2H5a2 2 0 01-2-2v-1H2a1 1 0 010-2h1a7 7 0 017-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 012-2z"/><path d="M10 12v4M14 12v4"/></svg> }

// Collapsed icon map
const ICON_MAP = {
  'Home': <HomeIcon/>, 'ROAS': <ChartIcon/>, 'MTD': <MTDIcon/>,
  'Lead Quality': <FunnelIcon/>, 'Channel Mix': <MixIcon/>,
  'Revenue': <RevenueIcon/>, 'Meta Ads': <MetaIcon/>,
  'VASU AI': <VasuIcon/>, 'Settings': <SettingsIcon/>
}

export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [collapsed, setCollapsed] = React.useState(() => {
    try { return localStorage.getItem('lq_sidebar_collapsed') === 'true' } catch { return false }
  })

  // Auto-expand Meta Ads if on that route
  const onMetaRoute = location.pathname.startsWith('/dashboard/meta-ads')
  const [metaExpanded, setMetaExpanded] = React.useState(onMetaRoute)
  React.useEffect(() => { if (onMetaRoute) setMetaExpanded(true) }, [onMetaRoute])

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    try { localStorage.setItem('lq_sidebar_collapsed', String(next)) } catch {}
  }

  const handleLogout = () => { logout(); navigate('/login') }

  const userRole = user?.role || 'viewer'
  function canSee(id) {
    if (!userRole || userRole === 'admin' || userRole === 'viewer') return true
    if (userRole === 'roas_only') return id === 'roas'
    if (userRole?.startsWith('custom:')) return userRole.replace('custom:','').split(',').includes(id)
    return true
  }

  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : user?.email?.[0]?.toUpperCase() || 'LQ'

  const idMap = { 'Home':'home','ROAS':'roas','MTD':'mtd','Lead Quality':'lead_quality','Channel Mix':'channel_mix','Revenue':'revenue','Meta Ads':'meta_ads','VASU AI':'vasu','Settings':'settings' }

  // Current tab from URL
  const currentTab = new URLSearchParams(location.search).get('tab') || 'campaigns'

  if (collapsed) {
    return (
      <aside className={styles.sidebarCollapsed}>
        <button className={styles.collapseBtn} onClick={toggle} title="Expand sidebar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <div className={styles.collapsedNav}>
          {NAV.map(group => group.items.filter(item => canSee(idMap[item.label])).map(item => (
            <NavLink key={item.label} to={item.to} end={item.end}
              className={({ isActive }) => `${styles.collapsedItem} ${isActive ? styles.collapsedActive : ''}`}
              title={item.label}>
              {item.icon}
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
          <svg width="16" height="16" viewBox="0 0 22 22" fill="none">
            <rect x="1"  y="12" width="4" height="9"  rx="1.5" fill="#4BAE8A" className={styles.sbar1}/>
            <rect x="7"  y="7"  width="4" height="14" rx="1.5" fill="#1C9FD4" className={styles.sbar2}/>
            <rect x="13" y="4"  width="4" height="17" rx="1.5" fill="#4BAE8A" className={styles.sbar3}/>
          </svg>
          <span>Quantum</span>
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
                const isParentActive = location.pathname.startsWith(item.to)
                return (
                  <div key={item.label}>
                    <button
                      className={`${styles.navItem} ${isParentActive ? styles.active : ''}`}
                      onClick={() => { setMetaExpanded(e => !e); if (!isParentActive) navigate(item.to + '?tab=campaigns') }}
                      style={{width:'100%',textAlign:'left',background:'none',border:'none',cursor:'pointer',font:'inherit'}}>
                      <span className={styles.navIcon}>{item.icon}</span>
                      <span style={{flex:1}}>{item.label}</span>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                        style={{transform: metaExpanded ? 'rotate(180deg)' : 'none', transition:'transform .2s', opacity:.5}}>
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </button>
                    {metaExpanded && (
                      <div className={styles.subNav}>
                        {item.subItems.map(sub => {
                          const subTab = new URLSearchParams(sub.to.split('?')[1]).get('tab')
                          const isSubActive = isParentActive && currentTab === subTab
                          return (
                            <button key={sub.label}
                              className={`${styles.subNavItem} ${isSubActive ? styles.subNavActive : ''}`}
                              onClick={() => navigate(sub.to)}
                              style={{width:'100%',textAlign:'left',background:'none',border:'none',cursor:'pointer',font:'inherit'}}>
                              <span style={{width:5,height:5,borderRadius:'50%',background:isSubActive?'#1C9FD4':'rgba(255,255,255,0.25)',flexShrink:0,display:'inline-block'}}/>
                              <span>{sub.label}</span>
                            </button>
                          )
                        })}
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
        </div>
        <div className={styles.userInfo}>
          <p className={styles.userName}>{user?.name?.split(' ')[0] || 'User'}</p>
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
