/**
 * Leverage Quantum — Unified KPICard component
 * Visual style is selectable live from Settings > Appearance (15 directions)
 * via useDesignStyle('kpi') -- see src/ui/kpiVariants.js for the render engine
 * shared with dashboardKit.jsx's PremKPI, so picking a variant re-skins every
 * KPI card in the app at once. This component's own prop API never changes.
 */
import React from 'react'
import { useDesignStyle } from '../lib/designSettings'
import { renderKpiVariant } from '../ui/kpiVariants.jsx'

/**
 * @param {string}  label      — metric name (shown uppercase, small)
 * @param {string}  value      — primary metric value
 * @param {string}  [sub]      — secondary line below value (context/date)
 * @param {number}  [delta]    — WoW/MoM change as a number (positive=good, negative=bad)
 * @param {boolean} [deltaInvert] — if true, negative delta is good (e.g. CPL — lower is better)
 * @param {string}  [deltaLabel]  — override delta pill text
 * @param {React.ReactNode} [icon] — optional 14x14 SVG icon (rendered as muted monochrome)
 */
export function KPICard({ label, value, sub, delta, deltaInvert = false, deltaLabel, icon }) {
  const variantId = useDesignStyle('kpi')
  const isGood = deltaInvert ? delta <= 0 : delta >= 0
  const deltaText = deltaLabel
    ? deltaLabel
    : delta != null
    ? `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(1)}%`
    : null

  return renderKpiVariant(variantId, { label, value, sub, deltaText, isGood: delta != null ? isGood : null, icon })
}

export default KPICard
