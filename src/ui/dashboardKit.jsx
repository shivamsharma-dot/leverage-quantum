// ---------------------------------------------------------------------------
// dashboardKit.jsx — shared design-system primitives for all dashboard pages.
// Canonical reference: src/pages/LeadQualificationDashboard.jsx (QL Ops).
// See DESIGN_SYSTEM.md at repo root for the full guide.
// Import from here so every page shares identical tokens + components.
// ---------------------------------------------------------------------------
import React from 'react';
import { useDesignStyle } from '../lib/designSettings';
import { renderKpiVariant } from './kpiVariants.jsx';

/* ===== Tokens ===== */

export const C = {
  navy:'#1F3C84', blue:'#1C9FD4', cyan:'#29B9C3', green:'#4CAE6F',
  amber:'#F59E0B', navyBg:'#E8EFF9', blueBg:'#E3F5FD', cyanBg:'#E4F8F9', greenBg:'#E9F8EF',
  border:'var(--card-border)', text:'var(--text)', muted:'var(--text3)', sub:'var(--text2)', bg:'var(--bg)',
}
export const PROVIDER_COLORS = { Futwork: C.navy, 'Futwork AI': C.cyan, Superbot: C.blue }

// On-brand ordered palette — navy → blue → cyan → green, then tinted repeats.
// Used for multi-category bars so everything stays within brand colors.
export const BRAND_RAMP = ['#1F3C84', '#1C9FD4', '#29B9C3', '#4CAE6F', '#3A5BA0', '#52B5DC', '#5BCAD2', '#73C58E']
export const brandColor = i => BRAND_RAMP[i % BRAND_RAMP.length]
export const FONT = "'Plus Jakarta Sans','Inter',sans-serif"
export const PAGE_SIZE = 10

/* ===== Formatters ===== */
export function fmtN(n) {
  if (!n && n !== 0) return '—'
  return Math.round(n).toLocaleString('en-IN')
}
export function pct(a, b) { return b > 0 ? ((a / b) * 100).toFixed(1) + '%' : '—' }

/* ===== Section card wrapper ===== */
export const Card = ({ title, sub, children, action, noPad }) => (
  <div style={{
    background: '#fff', border: '1px solid #EEF1F6', borderRadius: 16, overflow: 'hidden',
    boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 12px 28px -16px rgba(16,24,40,0.16)',
    display: 'flex', flexDirection: 'column',
  }}>
    <div style={{
      padding: '15px 20px 13px', borderBottom: '1px solid #F1F4F9',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 800, letterSpacing: '-0.2px', color: '#0F1B33', fontFamily: FONT }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 3, fontFamily: FONT }}>{sub}</div>}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', ...(noPad ? {} : { padding: '16px 20px' }) }}>{children}</div>
  </div>
)

/* ===== KPI icons (monochrome SVG set) ===== */
export const KPI_ICONS = {
  total: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>,
  agent: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  bot:   <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>,
  ai:    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4"/><path d="m6.4 6.4 2.8 2.8"/><path d="M2 12h4"/><circle cx="12" cy="13" r="5"/><path d="M12 18v4"/></svg>,
  globe: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/></svg>,
}

/* ===== Premium KPI card (Meta Ads main-card standard) ===== */
// Visual style selectable live from Settings > Appearance (15 directions) via
// useDesignStyle('kpi') -- shared render engine with components/KPICard.jsx
// at src/ui/kpiVariants.js, so picking a variant re-skins every KPI card in
// the app at once. This component's own prop API never changes.
export const PremKPI = ({ label, value, sub, delta, accent, accentBg, icon, invert }) => {
  const variantId = useDesignStyle('kpi')
  const up = delta != null && delta >= 0
  const deltaText = delta != null ? `${up ? '\u25B2' : '\u25BC'} ${Math.abs(delta).toFixed(1)}%` : null
  const isGood = delta == null ? null : (invert ? !up : up)
  return renderKpiVariant(variantId, { label, value, sub, deltaText, isGood, icon, accent })
}

/* ===== Ranked horizontal bar list ===== */
export const RankedBars = ({ data, labelKey, max, total, colorFn, showRank }) => {
  if (!data || data.length === 0) return <div style={{ textAlign: 'center', padding: '24px 0', color: C.muted, fontSize: 13, fontFamily: FONT }}>No data</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: '2px 0' }}>
      {data.map((r, i) => {
        const w = max > 0 ? (r.count / max * 100) : 0
        const col = colorFn ? colorFn(i) : BRAND_RAMP[i % BRAND_RAMP.length]
        return (
          <div key={r[labelKey] + i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {showRank && <div style={{ width: 20, textAlign: 'center', fontSize: 10, fontWeight: 800, color: '#fff', background: col, borderRadius: 6, padding: '2px 0', flexShrink: 0, fontFamily: FONT }}>{i + 1}</div>}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, alignItems: 'baseline' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.text, fontFamily: FONT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                  {r[labelKey]}
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: col, fontFamily: FONT, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{fmtN(r.count)}</span>
              </div>
              <div style={{ height: 7, borderRadius: 99, background: '#F1F5F9', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: w + '%', borderRadius: 99, background: `linear-gradient(90deg,${col},${col}cc)`, transition: 'width .6s cubic-bezier(.4,0,.2,1)' }} />
              </div>
            </div>
            <div style={{ fontSize: 10.5, color: C.muted, fontFamily: FONT, width: 36, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{pct(r.count, total)}</div>
          </div>
        )
      })}
    </div>
  )
}
