import React from 'react'

// 15 KPI card visual styles, selectable live from Settings > Appearance via
// useDesignStyle('kpi'). Variant 2 is today's shipped default (matches the
// existing PremKPI look). Shared by both components/KPICard.jsx and
// src/ui/dashboardKit.jsx's PremKPI so picking a variant re-skins every KPI
// card in the app at once -- each component just normalizes its own props
// into the shape below and calls renderKpiVariant.
//
// props: { label, value, sub, deltaText, isGood, icon, accent }
// Brand-only delta convention already used across this app: good = green tint,
// not-good = navy tint (never red/amber on a KPI card).
const NAVY = '#1F3C84'
const BLUE = '#1C9FD4'
const CYAN = '#29B9C3'
const GREEN = '#4CAE6F'
const FONT = "'Plus Jakarta Sans','Inter',sans-serif"

const wrap = { fontFamily: FONT, minWidth: 0 }

function DeltaPill({ deltaText, isGood, inline }) {
  if (!deltaText) return null
  return (
    <span style={{
      fontSize: 12, fontWeight: 700, flexShrink: 0,
      color: isGood ? '#15803D' : NAVY,
      background: isGood ? '#E9F8EF' : '#EEF1FB',
      padding: '2px 7px', borderRadius: 6,
      display: 'inline-flex', alignItems: 'center', gap: 2,
      marginLeft: inline ? 8 : 0,
    }}>{deltaText}</span>
  )
}

function Sparkline({ seed = 1, color }) {
  // deterministic decorative trend line -- not real data, just a visual cue
  const pts = Array.from({ length: 8 }, (_, i) => {
    const n = Math.sin(seed * (i + 2) * 1.7) * 8 + 14
    return `${i * 20},${Math.max(2, Math.min(26, n))}`
  }).join(' ')
  return (
    <svg width="100%" height="26" viewBox="0 0 140 28" preserveAspectRatio="none" style={{ display: 'block', marginTop: 6 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" />
    </svg>
  )
}

function Ring({ value, color }) {
  const pct = (() => {
    const m = /(-?\d+(\.\d+)?)\s*%/.exec(String(value))
    const n = m ? parseFloat(m[1]) : 62
    return Math.max(0, Math.min(100, n))
  })()
  const r = 20, c = 2 * Math.PI * r
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" style={{ flexShrink: 0 }}>
      <circle cx="26" cy="26" r={r} fill="none" stroke="var(--card-border,#E7EAF1)" strokeWidth="5" />
      <circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c - (c * pct) / 100} transform="rotate(-90 26 26)" />
      <text x="26" y="30" textAnchor="middle" fontSize="11" fontWeight="800" fill={NAVY} fontFamily={FONT}>{Math.round(pct)}%</text>
    </svg>
  )
}

export function renderKpiVariant(variantId, props) {
  const { label, value, sub, deltaText, isGood, icon, accent } = props
  const A = accent || NAVY

  switch (variantId) {
    case 1: // flat minimal
      return (
        <div style={{ ...wrap, background: 'var(--card,#fff)', border: '0.5px solid var(--card-border,#E7EAF1)', borderRadius: 12, padding: '16px 18px 14px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3,#94A3B8)', marginBottom: 8 }}>{label}</div>
          <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text,#0F172A)', marginBottom: 4 }}>{value}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {sub && <span style={{ fontSize: 12.5, color: 'var(--text3,#94A3B8)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</span>}
            <DeltaPill deltaText={deltaText} isGood={isGood} />
          </div>
        </div>
      )
    default:
    case 2: // gradient accent bar + icon chip -- TODAY'S DEFAULT
      return (
        <div style={{ ...wrap, position: 'relative', overflow: 'hidden', borderRadius: 16, padding: '16px 18px', background: 'var(--card,#fff)', border: '1px solid var(--card-border,#EEF1F6)', boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 8px 24px -12px rgba(16,24,40,0.18)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: `linear-gradient(90deg, ${A}, ${A}99)` }} />
          <div style={{ position: 'absolute', top: -28, right: -28, width: 96, height: 96, borderRadius: '50%', background: `linear-gradient(135deg, ${A}14, ${A}05)` }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, position: 'relative' }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: `linear-gradient(135deg, ${A}, ${A}D9)`, boxShadow: `0 4px 10px -2px ${A}66`, flexShrink: 0 }}>{icon}</div>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--text2,#64748B)', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.6px', color: 'var(--text,#0F1B33)', lineHeight: 1.05, position: 'relative' }}>{value}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7, minHeight: 18, position: 'relative' }}>
            <DeltaPill deltaText={deltaText} isGood={isGood} />
            {sub && <span style={{ fontSize: 12.5, color: 'var(--text3,#8A94A6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</span>}
          </div>
        </div>
      )
    case 3: // full gradient fill
      return (
        <div style={{ ...wrap, background: `linear-gradient(135deg, ${NAVY}, ${BLUE} 65%, ${CYAN})`, borderRadius: 14, padding: '16px 18px', boxShadow: `0 12px 26px -14px ${BLUE}80`, color: '#fff' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.72)', marginBottom: 8 }}>{label}</div>
          <div style={{ fontSize: 25, fontWeight: 800, color: '#fff', marginBottom: 4 }}>{value}</div>
          {sub && <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.6)' }}>{sub}</div>}
        </div>
      )
    case 4: // white + colored glow shadow
      return (
        <div style={{ ...wrap, background: 'var(--card,#fff)', border: '1px solid var(--card-border,#E7EAF1)', borderRadius: 14, padding: '16px 18px', boxShadow: `0 1px 2px rgba(15,27,51,0.05), 0 16px 30px -18px ${A}59` }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3,#94A3B8)', marginBottom: 8 }}>{label}</div>
          <div style={{ fontSize: 25, fontWeight: 800, color: 'var(--text,#0F172A)', marginBottom: 4 }}>{value}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {sub && <span style={{ fontSize: 12.5, color: 'var(--text3,#94A3B8)', flex: 1 }}>{sub}</span>}
            <DeltaPill deltaText={deltaText} isGood={isGood} />
          </div>
        </div>
      )
    case 5: // corner-notch accent
      return (
        <div style={{ ...wrap, position: 'relative', overflow: 'hidden', background: 'var(--card,#fff)', border: '1px solid var(--card-border,#DCE1EC)', borderRadius: 12, padding: '16px 18px' }}>
          <div style={{ position: 'absolute', top: -16, right: -16, width: 40, height: 40, borderRadius: 9, background: `linear-gradient(135deg, ${BLUE}, ${CYAN})`, transform: 'rotate(45deg)' }} />
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3,#94A3B8)', marginBottom: 8 }}>{label}</div>
          <div style={{ fontSize: 25, fontWeight: 800, color: 'var(--text,#0F172A)', marginBottom: 4 }}>{value}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {sub && <span style={{ fontSize: 12.5, color: 'var(--text3,#94A3B8)', flex: 1 }}>{sub}</span>}
            <DeltaPill deltaText={deltaText} isGood={isGood} />
          </div>
        </div>
      )
    case 6: { // embedded sparkline
      const seed = String(value).split('').reduce((a, c) => a + c.charCodeAt(0), 0) || 1
      return (
        <div style={{ ...wrap, background: 'var(--card,#fff)', border: '0.5px solid var(--card-border,#E7EAF1)', borderRadius: 14, padding: '16px 18px 10px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3,#94A3B8)', marginBottom: 8 }}>{label}</div>
          <div style={{ fontSize: 25, fontWeight: 800, color: 'var(--text,#0F172A)' }}>{value}</div>
          <Sparkline seed={seed} color={isGood === false ? NAVY : BLUE} />
        </div>
      )
    }
    case 7: // icon-left split
      return (
        <div style={{ ...wrap, display: 'flex', alignItems: 'center', gap: 12, background: 'var(--card,#fff)', border: '0.5px solid var(--card-border,#E7EAF1)', borderRadius: 14, padding: '14px 16px' }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${A}1A`, color: A }}>{icon}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3,#94A3B8)' }}>{label}</div>
            <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--text,#0F172A)' }}>{value}</div>
          </div>
        </div>
      )
    case 8: // progress ring
      return (
        <div style={{ ...wrap, display: 'flex', alignItems: 'center', gap: 14, background: 'var(--card,#fff)', border: '0.5px solid var(--card-border,#E7EAF1)', borderRadius: 14, padding: '14px 16px' }}>
          <Ring value={value} color={BLUE} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3,#94A3B8)' }}>{label}</div>
            {sub && <div style={{ fontSize: 12.5, color: 'var(--text3,#94A3B8)' }}>{sub}</div>}
          </div>
        </div>
      )
    case 9: // this-vs-last bars
      return (
        <div style={{ ...wrap, background: 'var(--card,#fff)', border: '0.5px solid var(--card-border,#E7EAF1)', borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3,#94A3B8)', marginBottom: 8 }}>{label}</div>
          <div style={{ fontSize: 25, fontWeight: 800, color: 'var(--text,#0F172A)', marginBottom: 10 }}>{value}</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 30 }}>
            <div style={{ flex: 1, height: '100%', borderRadius: '4px 4px 0 0', background: 'var(--text3,#94A0B4)', opacity: 0.4 }} />
            <div style={{ flex: 1, height: isGood === false ? '35%' : '65%', borderRadius: '4px 4px 0 0', background: `linear-gradient(180deg, ${NAVY}, ${BLUE})` }} />
          </div>
        </div>
      )
    case 10: // frosted glass
      return (
        <div style={{ ...wrap, background: 'rgba(255,255,255,0.14)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.28)', borderRadius: 14, padding: '16px 18px', color: '#0F172A' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3,#5B6577)', marginBottom: 8 }}>{label}</div>
          <div style={{ fontSize: 25, fontWeight: 800, marginBottom: 4 }}>{value}</div>
          {sub && <div style={{ fontSize: 12.5, color: 'var(--text2,#5B6577)' }}>{sub}</div>}
        </div>
      )
    case 11: // editorial oversized number
      return (
        <div style={{ ...wrap, background: 'var(--card,#fff)', border: '0.5px solid var(--card-border,#E7EAF1)', borderRadius: 14, padding: '20px 20px 16px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3,#94A3B8)', marginBottom: 6 }}>{label}</div>
          <div style={{ fontSize: 34, fontWeight: 800, color: 'var(--text,#0F172A)', letterSpacing: '-1px' }}>{value}</div>
          {sub && <div style={{ fontSize: 12.5, color: 'var(--text3,#94A3B8)', marginTop: 2 }}>{sub}</div>}
        </div>
      )
    case 12: { // goal-progress bar
      const m = /(-?\d+(\.\d+)?)/.exec(String(deltaText || ''))
      const fillPct = Math.max(4, Math.min(100, m ? Math.abs(parseFloat(m[1])) : 65))
      return (
        <div style={{ ...wrap, background: 'var(--card,#fff)', border: '0.5px solid var(--card-border,#E7EAF1)', borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3,#94A3B8)', marginBottom: 8 }}>{label}</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text,#0F172A)', marginBottom: 8 }}>{value}</div>
          <div style={{ height: 6, borderRadius: 4, background: 'var(--bg,#F4F6F9)', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 4, width: `${fillPct}%`, background: `linear-gradient(90deg, ${NAVY}, ${CYAN})` }} />
          </div>
          {sub && <div style={{ fontSize: 12, color: 'var(--text3,#94A3B8)', marginTop: 6 }}>{sub}</div>}
        </div>
      )
    }
    case 13: // executive dark -- always dark regardless of app theme
      return (
        <div style={{ ...wrap, background: '#0B1730', border: '1px solid #1E2E52', borderRadius: 13, padding: '16px 18px', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 10px 22px -14px rgba(0,0,0,0.5)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#7C8CB5', marginBottom: 8 }}>{label}</div>
          <div style={{ fontSize: 25, fontWeight: 800, color: '#EAF3FF', marginBottom: 4 }}>{value}</div>
          {sub && <div style={{ fontSize: 12.5, color: '#5A6C93' }}>{sub}</div>}
        </div>
      )
    case 14: // inline trend pill
      return (
        <div style={{ ...wrap, background: 'var(--card,#fff)', border: '0.5px solid var(--card-border,#E7EAF1)', borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3,#94A3B8)', marginBottom: 8 }}>{label}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--text,#0F172A)' }}>{value}</span>
            <DeltaPill deltaText={deltaText} isGood={isGood} inline />
          </div>
          {sub && <div style={{ fontSize: 12.5, color: 'var(--text3,#94A3B8)', marginTop: 4 }}>{sub}</div>}
        </div>
      )
    case 15: // compact dense
      return (
        <div style={{ ...wrap, background: 'var(--card,#fff)', border: '0.5px solid var(--card-border,#E7EAF1)', borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text3,#94A3B8)', marginBottom: 4 }}>{label}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--text,#0F172A)' }}>{value}</span>
            <DeltaPill deltaText={deltaText} isGood={isGood} />
          </div>
        </div>
      )
  }
}
