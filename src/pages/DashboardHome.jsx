import { useState } from 'react'
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
    source: 'BigQuery · 2025',
    lastUpdated: 'Jan–Dec 2025',
    color: 'blue',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
  },
  {
    id: 'mtd',
    to: '/dashboard/mtd',
    label: 'MTD',
    description: 'Month-to-date performance focused on CPL and CPQL with AI-generated insights from live sheet.',
    metrics: ['CPL', 'CPQL', 'QLs', 'Spend'],
    source: 'Google Sheets · Live',
    lastUpdated: 'Auto-refreshes every 5 min',
    color: 'purple',
    live: true,
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
  },
  {
    id: 'lead_quality',
    to: '/dashboard/lead-quality',
    label: 'Lead Quality',
    description: 'L→QL→STU funnel conversion rates broken down by source, campaign and geography.',
    metrics: ['OPPs', 'QLs', 'STUs', 'L→Q%'],
    source: 'BigQuery · 2025',
    lastUpdated: 'Jan–Dec 2025',
    color: 'green',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 3H2l8 9.46V19l4 2V12.46L22 3z"/></svg>
  },
  {
    id: 'channel_mix',
    to: '/dashboard/channel-mix',
    label: 'Channel Mix',
    description: 'Spend allocation and performance comparison across paid, organic and affiliate channels.',
    metrics: ['Paid', 'Organic', 'Affiliate', 'Referral'],
    source: 'BigQuery + CIB · 2025',
    lastUpdated: 'Jan–Dec 2025',
    color: 'teal',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
  },
  {
    id: 'revenue',
    to: '/dashboard/revenue',
    label: 'Revenue',
    description: 'AC and VAS revenue tracking with projected vs actual comparison by month.',
    metrics: ['AC', 'VAS', 'Projected', 'Actual'],
    source: 'CIB Data · 2025',
    lastUpdated: 'Aug–Dec 2025',
    color: 'navy',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
  },
]

export default function DashboardHome() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')

  const firstName = user?.name?.split(' ')[0] || 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  const filtered = DASHBOARDS.filter(d =>
    d.label.toLowerCase().includes(search.toLowerCase()) ||
    d.description.toLowerCase().includes(search.toLowerCase()) ||
    d.metrics.some(m => m.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>

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
          <div className={styles.headerRight}>
            {/* Search bar */}
            <div className={styles.searchWrap}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" className={styles.searchIcon}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                className={styles.searchInput}
                placeholder="Search dashboards..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && <button className={styles.clearSearch} onClick={() => setSearch('')}>✕</button>}
            </div>
          </div>
        </div>

        {/* Dashboard Cards */}
        <div className={styles.grid}>
          {filtered.length === 0 ? (
            <div className={styles.noResults}>No dashboards match "{search}"</div>
          ) : filtered.map((d, i) => (
            <div
              key={d.id}
              className={`${styles.card} ${styles[`c_${d.color}`]} ${styles.cardLive}`}
              onClick={() => navigate(d.to)}
              style={{ animationDelay: `${i * 0.08}s` }}
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && navigate(d.to)}
            >
              <div className={styles.cardTop}>
                <div className={`${styles.iconWrap} ${styles[`icon_${d.color}`]}`}>
                  {d.icon}
                </div>
                <span className={d.live ? styles.liveTag : styles.dataTag}>
                  {d.live && <span className={styles.liveTagDot}/>}
                  {d.live ? 'Live' : 'BigQuery'}
                </span>
              </div>

              <h2 className={styles.cardTitle}>{d.label}</h2>
              <p className={styles.cardDesc}>{d.description}</p>

              <div className={styles.tagRow}>
                {d.metrics.map(m => (
                  <span key={m} className={styles.tag}>{m}</span>
                ))}
              </div>

              <div className={styles.cardFooter}>
                <span className={styles.dataSource}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  {d.lastUpdated}
                </span>
                <span className={styles.openBtn}>Open →</span>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
