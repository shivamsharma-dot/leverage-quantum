import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import styles from './Sidebar.module.css'

// ── WHITELIST — only these emails can access the panel ──
const ALLOWED_EMAILS = [
  'shivam.sharma@leverageedu.com',
  'ruchi.singh@leverageedu.com',
  // Add more emails here
]

export function isAllowedUser(email) {
  if (!email) return false
  return ALLOWED_EMAILS.includes(email.toLowerCase())
}

const NAV = [
  {
    label: 'Dashboards',
    items: [
      { to: '/',                      icon: <HomeIcon />,    label: 'Home',         end: true  },
      { to: '/dashboard/roas',        icon: <ChartIcon />,   label: 'ROAS',         end: false },
      { to: '/dashboard/lead-quality',icon: <FunnelIcon />,  label: 'Lead Quality', end: false },
      { to: '/dashboard/channel-mix', icon: <MixIcon />,     label: 'Channel Mix',  end: false },
      { to: '/dashboard/revenue',     icon: <RevenueIcon />, label: 'Revenue',      end: false },
    ]
  },
  {
    label: 'Account',
    items: [
      { to: '/settings', icon: <SettingsIcon />, label: 'Settings', end: false },
    ]
  }
]

function HomeIcon()    { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> }
function ChartIcon()   { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> }
function FunnelIcon()  { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 3H2l8 9.46V19l4 2V12.46L22 3z"/></svg> }
function MixIcon()     { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> }
function RevenueIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg> }
function SettingsIcon(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg> }

export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => { logout(); navigate('/login') }

  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : user?.email?.[0]?.toUpperCase() || 'LQ'

  return (
    <aside className={styles.sidebar}>

      {/* Logo */}
      <div className={styles.logoArea}>
        <div className={styles.logoPill}>
          <img src="https://publicassets.leverageedu.com/landing-pages-new/logo-dark.svg" alt="Leverage Edu" className={styles.logoImg}/>
        </div>
        <div className={styles.dividerLine}/>
        <div className={styles.quantumLabel}>
          <svg width="14" height="14" viewBox="0 0 22 22" fill="none">
            <rect x="1"  y="12" width="4" height="9"  rx="1.5" fill="#4BAE8A" className={styles.sbar1}/>
            <rect x="7"  y="7"  width="4" height="14" rx="1.5" fill="#1C9FD4" className={styles.sbar2}/>
            <rect x="13" y="4"  width="4" height="17" rx="1.5" fill="#1F3C84" className={styles.sbar3}/>
            <circle cx="19" cy="3"  r="2" fill="#4BAE8A" className={styles.sdot1}/>
            <circle cx="19" cy="10" r="2" fill="#1C9FD4" className={styles.sdot2}/>
          </svg>
          <span>Quantum</span>
        </div>
      </div>

      {/* Nav */}
      <nav className={styles.nav}>
        {NAV.map(group => (
          <div key={group.label} className={styles.group}>
            <p className={styles.groupLabel}>{group.label}</p>
            {group.items.map(item => (
              <NavLink
                key={item.label}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
              >
                <span className={styles.navIcon}>{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* User */}
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
