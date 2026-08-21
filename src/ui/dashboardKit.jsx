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
// 4 brand families x 3 tiers: navy, blue, cyan, green, each lightening.
export const BRAND_RAMP = ['#1F3C84', '#1C9FD4', '#29B9C3', '#4CAE6F', '#3A5BA0', '#52B5DC', '#5BCAD2', '#73C58E', '#8AA4D8', '#8FD3F0', '#8FDCE1', '#9BD8AF']
export const brandColor = i => BRAND_RAMP[i % BRAND_RAMP.length]

/* ===== Chart bar treatment — see DESIGN_SYSTEM.md "Chart bars" =====
   One series = one hue, filled with a gradient of that hue. Never a flat fill,
   and never the ramp walked across the bars of a single series: colour encodes
   identity, not position. This is the Summary treatment, now the default. */
export const BAR_RADIUS = [5, 5, 0, 0]      // vertical bars
export const BAR_RADIUS_H = [0, 5, 5, 0]    // horizontal bars
export const BAR_MAX = 26
export const GRID_STROKE = '#EEF1F5'
// Any channel not named above still gets a stable on-brand tone: the name is hashed
// into the ramp, so the same channel is the same colour on every page even when a
// page carries extra channels of its own. Never index by sort position.
export const NEUTRAL_GREY = '#9CA3AF'
export const sourceColor = name => {
  if (!name) return NEUTRAL_GREY
  if (SOURCE_COLORS[name]) return SOURCE_COLORS[name]
  if (/^(other|others|unknown|unidentified|na|n\/a)$/i.test(String(name).trim())) return NEUTRAL_GREY
  let h = 7
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return BRAND_RAMP[h % BRAND_RAMP.length]
}
export const NEUTRAL_TRACK = '#E5E7EB'      // remainder/track bar behind a real one
export const barFill = id => 'url(#' + id + ')'
export const gradId = (slug, key) => 'g-' + String(slug).replace(/[^a-zA-Z0-9]/g, '') + '-' + key
export const BarGrad = ({ id, color, from = 0.95, to = 0.55, dir = 'v' }) => (
  <linearGradient id={id} x1="0" y1="0" x2={dir === 'h' ? "1" : "0"} y2={dir === 'h' ? "0" : "1"}>
    <stop offset="0%" stopColor={color} stopOpacity={from} />
    <stop offset="100%" stopColor={color} stopOpacity={to} />
  </linearGradient>
)
// Stable channel -> hue map so a source is the same colour on every page.
// Stable channel -> hue map, grouped by family so the channel type is readable from
// the hue: blue = paid social, green = search, navy = owned/partner, cyan = brand/
// content, grey = unknown bucket. Same source, same colour on every page.
export const SOURCE_COLORS = {
  Facebook: '#1C9FD4', Remarketing: '#52B5DC', LinkedIn: '#8FD3F0',
  Google: '#4CAE6F', 'Google MBBS': '#73C58E', Bing: '#9BD8AF',
  Referral: '#1F3C84', Affiliate: '#3A5BA0', 'Affiliate Partner': '#8AA4D8',
  'Content+Brand': '#29B9C3', Branding: '#5BCAD2', Offline: '#8FDCE1',
  Unidentified: '#9CA3AF', Others: '#9CA3AF', 'Lead Source NA': '#9CA3AF',
}
export const FONT = "'Plus Jakarta Sans','Inter',sans-serif"
export const PAGE_SIZE = 10

/* ===== Formatters ===== */
export function fmtN(n) {
  if (!n && n !== 0) return '—'
  return Math.round(n).toLocaleString('en-IN')
}
export function pct(a, b) { return b > 0 ? ((a / b) * 100).toFixed(1) + '%' : '—' }

/* ===== Section card wrapper ===== */
// C11 fix: every one of these five colors was a hardcoded light-mode hex, even though
// the C token object 8 lines up this very file already defines the theme-aware
// equivalent (var(--card-border)/var(--text)/var(--text3)) for exactly this purpose --
// this component just never used them. In dark mode that meant the card's own
// background stayed a hardcoded white while text rendered inside it (via sectionTitle,
// or this component's own `title`/`sub` props) correctly resolved to a light color
// meant for a DARK background -- e.g. "Overall funnel"'s title measured #E9EEF8 on a
// hardcoded #FFFFFF card, ~1.1:1 contrast, functionally invisible. Every fallback below
// is the exact previous hardcoded value, so light mode (where the real CSS variable
// happens to resolve to an almost-identical shade already) is visually unchanged.
export const Card = ({ title, sub, children, action, noPad }) => (
  <div style={{
    background: 'var(--card,#fff)', border: '1px solid var(--card-border,#EEF1F6)', borderRadius: 16, overflow: 'hidden',
    boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 12px 28px -16px rgba(16,24,40,0.16)',
    display: 'flex', flexDirection: 'column',
  }}>
    <div style={{
      padding: '15px 20px 13px', borderBottom: '1px solid var(--card-border,#F1F4F9)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.2px', color: 'var(--text,#0F1B33)', fontFamily: FONT }}>{title}</div>
        {sub && <div style={{ fontSize: 12.5, color: 'var(--text3,#94A3B8)', marginTop: 3, fontFamily: FONT }}>{sub}</div>}
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
// prevValue (optional): a pre-formatted string of the actual prior-period
// number (e.g. "\u20B956,35,000") -- when passed, the delta pill itself becomes
// clickable and swaps its text between the percentage and "was <prevValue>"
// on tap, in place, with no extra icon added to the card. Purely additive:
// omitting it (every existing caller) leaves the pill exactly as it was.
// delta also accepts the sentinel string 'new' (any caller may pass it, e.g. when a
// percentage would be computed off a near-zero/absent prior-period baseline and would
// read as noise rather than signal, such as a five-digit percentage). Purely additive,
// same convention as prevValue above -- every existing numeric/null caller is unaffected.
export const PremKPI = ({ label, value, sub, delta, accent, accentBg, icon, invert, prevValue }) => {
  const variantId = useDesignStyle('kpi')
  const isNew = delta === 'new'
  const up = !isNew && delta != null && delta >= 0
  const deltaText = isNew ? 'New' : (delta != null ? `${up ? '\u25B2' : '\u25BC'} ${Math.abs(delta).toFixed(1)}%` : null)
  const isGood = isNew ? null : (delta == null ? null : (invert ? !up : up))
  return renderKpiVariant(variantId, { label, value, sub, deltaText, isGood, icon, accent, prevValue })
}

/* ===== Ranked horizontal bar list ===== */
export const RankedBars = ({ data, labelKey, max, total, colorFn, color, showRank }) => {
  if (!data || data.length === 0) return <div style={{ textAlign: 'center', padding: '24px 0', color: C.muted, fontSize: 13, fontFamily: FONT }}>No data</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: '2px 0' }}>
      {data.map((r, i) => {
        const w = max > 0 ? (r.count / max * 100) : 0
        const col = colorFn ? colorFn(i) : (color || C.navy)
        return (
          <div key={r[labelKey] + i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {showRank && <div style={{ width: 20, textAlign: 'center', fontSize: 12, fontWeight: 800, color: '#fff', background: col, borderRadius: 6, padding: '2px 0', flexShrink: 0, fontFamily: FONT }}>{i + 1}</div>}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, alignItems: 'baseline' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: C.text, fontFamily: FONT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                  {r[labelKey]}
                </span>
                <span style={{ fontSize: 14.5, fontWeight: 800, color: col, fontFamily: FONT, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{fmtN(r.count)}</span>
              </div>
              <div style={{ height: 7, borderRadius: 99, background: '#F1F5F9', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: w + '%', borderRadius: 99, background: `linear-gradient(90deg,${col},${col}cc)`, transition: 'width .6s cubic-bezier(.4,0,.2,1)' }} />
              </div>
            </div>
            <div style={{ fontSize: 12, color: C.muted, fontFamily: FONT, width: 36, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{pct(r.count, total)}</div>
          </div>
        )
      })}
    </div>
  )
}
