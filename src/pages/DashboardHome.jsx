import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import Sidebar from '../components/Sidebar'
import styles from './DashboardHome.module.css'

const DASHBOARDS = [
  {
    id: 'roas',
    to: '/dashboard/roas',
    label: 'ROAS',
    description: 'Campaign-level spend, leads, STUs, revenue and return on ad spend across all channels.',
    metrics: ['Facebook', 'Google', 'LinkedIn', 'Bing'],
    status: 'live',
    color: 'blue',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    )
  },
  {
    id: 'mtd',
    to: '/dashboard/mtd',
    label: 'MTD',
    description: 'Month-to-date performance focused on CPL and CPQL with AI-generated insights.',
    metrics: ['CPL', 'CPQL', 'QLs', 'Spend'],
    status: 'live',
    color: 'purple',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    )
  },
  {
    id: 'leadquality',
    to: '/dashboard/lead-quality',
    label: 'Lead Quality',
    description: 'L→QL→STU funnel conversion rates broken down by source, campaign and geography.',
    metrics: ['OPPs', 'QLs', 'STUs', 'L→Q%'],
    status: 'live',
    color: 'green',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M22 3H2l8 9.46V19l4 2V12.46L22 3z"/>
      </svg>
    )
  },
  {
    id: 'channelmix',
    to: '/dashboard/channel-mix',
    label: 'Channel Mix',
    description: 'Spend allocation and performance comparison across paid, organic and affiliate channels.',
    metrics: ['Paid', 'Organic', 'Affiliate', 'Referral'],
    status: 'live',
    color: 'teal',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
      </svg>
    )
  },
  {
    id: 'revenue',
    to: '/dashboard/revenue',
    label: 'Revenue',
    description: 'AC and VAS revenue tracking with projected vs actual comparison by month.',
    metrics: ['AC', 'VAS', 'Projected', 'Actual'],
    status: 'live',
    color: 'navy',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
      </svg>
    )
  },
]

export default function DashboardHome() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const firstName = user?.name?.split(' ')[0] || 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>

        {/* Subtle swoosh in background */}
        <div className={styles.bgSwoosh}>
          <svg viewBox="0 0 600 400" fill="none" className={styles.swooshSvg}>
            <path d="M 600 50 C 450 50, 300 150, 150 200 C 50 230, -20 250, -80 280" stroke="#1C9FD4" strokeWidth="40" strokeLinecap="round" opacity="0.04"/>
            <path d="M 600 120 C 430 120, 280 200, 130 260 C 30 300, -40 320, -100 350" stroke="#4BAE8A" strokeWidth="35" strokeLinecap="round" opacity="0.04"/>
          </svg>
        </div>

        {/* Header */}
        <div className={styles.header}>
          <div>
            <p className={styles.breadcrumb}>Home</p>
            <h1 className={styles.greeting}>{greeting}, {firstName} 👋</h1>
            <p className={styles.sub}>Here are all your available dashboards.</p>
          </div>
          <div className={styles.liveChip}>
            <span className={styles.liveDot} />
            Data synced live from Google Sheets
          </div>
        </div>

        {/* Dashboard Cards */}
        <div className={styles.grid}>
          {DASHBOARDS.map((d, i) => (
            <div
              key={d.id}
              className={`${styles.card} ${styles[`c_${d.color}`]} ${d.status === 'soon' ? styles.cardSoon : styles.cardLive}`}
              onClick={() => d.status === 'live' && navigate(d.to)}
              style={{ animationDelay: `${i * 0.08}s` }}
              tabIndex={d.status === 'live' ? 0 : undefined}
              onKeyDown={e => e.key === 'Enter' && d.status === 'live' && navigate(d.to)}
            >
              <div className={styles.cardTop}>
                <div className={`${styles.iconWrap} ${styles[`icon_${d.color}`]}`}>
                  {d.icon}
                </div>
                {d.status === 'live'
                  ? <span className={styles.liveTag}><span className={styles.liveTagDot}/>Live</span>
                  : <span className={styles.soonTag}>Coming soon</span>
                }
              </div>

              <h2 className={styles.cardTitle}>{d.label}</h2>
              <p className={styles.cardDesc}>{d.description}</p>

              <div className={styles.tagRow}>
                {d.metrics.map(m => (
                  <span key={m} className={styles.tag}>{m}</span>
                ))}
              </div>

              {d.status === 'live' && (
                <div className={styles.openBtn}>Open dashboard →</div>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
