/**
 * Leverage Quantum — Unified KPICard component
 * Design standard: minimal, no color accents, pure data-forward
 * All dashboard pages must use this component.
 */
import React from 'react'

const FONT = "'Plus Jakarta Sans', sans-serif"

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
  const isGood = deltaInvert ? delta <= 0 : delta >= 0
  const deltaText = deltaLabel
    ? deltaLabel
    : delta != null
    ? `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(1)}%`
    : null

  return (
    <div style={{
      background: '#fff',
      border: '0.5px solid #E2E8F0',
      borderRadius: 12,
      padding: '16px 20px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: 0,
      boxShadow: '0 1px 4px rgba(15,23,42,0.04)',
      fontFamily: FONT,
      minWidth: 0,
    }}>
      {/* Label row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
      }}>
        <div style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#94A3B8',
          fontFamily: FONT,
          lineHeight: 1,
        }}>
          {label}
        </div>
        {icon && (
          <div style={{ color: '#CBD5E1', display: 'flex', alignItems: 'center' }}>
            {icon}
          </div>
        )}
      </div>

      {/* Value */}
      <div style={{
        fontSize: 26,
        fontWeight: 800,
        color: '#0F172A',
        letterSpacing: '-0.04em',
        lineHeight: 1,
        fontFamily: FONT,
        marginBottom: 6,
      }}>
        {value}
      </div>

      {/* Sub + delta row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        minHeight: 18,
      }}>
        {sub && (
          <div style={{
            fontSize: 11.5,
            color: '#94A3B8',
            fontFamily: FONT,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {sub}
          </div>
        )}
        {deltaText && (
          <span style={{
            fontSize: 10.5,
            fontWeight: 700,
            color: isGood ? '#16A34A' : '#DC2626',
            fontFamily: FONT,
            flexShrink: 0,
          }}>
            {deltaText}
          </span>
        )}
      </div>
    </div>
  )
}

export default KPICard
