import React, { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import { C, FONT, Card } from '../ui/dashboardKit'

const TABS = [
  { id: 'campaigns', label: 'Campaigns' },
  { id: 'keywords', label: 'Keywords' },
  { id: 'searchTerms', label: 'Search terms' },
  { id: 'adGroups', label: 'Ad groups' },
]

function BingIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M6 3l4 1.4V16l4.2-2.4-1.9-.8-1.3-3.3L16 11l3 1.7-9 5.3-4-2.3V3z" fill={C.cyan} />
    </svg>
  )
}

export default function BingAdsDashboard() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') || 'campaigns'

  const setTab = (id) => {
    const next = new URLSearchParams(searchParams)
    next.set('tab', id)
    setSearchParams(next, { replace: true })
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, fontFamily: FONT }}>
      <Sidebar />
      <main style={{ flex: 1, padding: '28px 32px', overflowX: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: C.cyanBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BingIcon />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text }}>Bing Ads</h1>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: C.muted }}>Microsoft Advertising performance</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid ' + C.border, margin: '20px 0 24px' }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontFamily: FONT,
                fontSize: 13.5,
                fontWeight: activeTab === t.id ? 700 : 500,
                color: activeTab === t.id ? C.navy : C.muted,
                padding: '10px 14px',
                borderBottom: activeTab === t.id ? '2px solid ' + C.navy : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <Card title={TABS.find((t) => t.id === activeTab)?.label || 'Bing Ads'} sub="Microsoft Advertising">
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: 15, background: C.cyanBg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
              <BingIcon size={26} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 8 }}>Bing Ads integration in progress</div>
            <div style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.6, maxWidth: 420, margin: '0 auto' }}>
              This page will show your Microsoft Advertising performance once the account is connected. Data for this view is not available yet.
            </div>
          </div>
        </Card>
      </main>
    </div>
  )
}
