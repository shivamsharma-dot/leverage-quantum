import React from 'react'
import { useDesignStyle } from '../lib/designSettings'
import { getButtonVariantStyle } from '../ui/buttonVariants'

// Single shared button used everywhere in Quantum. The visual style is
// selectable live from Settings > Appearance (20 directions) via
// useDesignStyle('button') -- picking one there re-skins every button in
// the app instantly, no reload. Variant 10 ("Embossed premium") is today's
// default. Component API below never changes regardless of the selected
// variant: variant='primary'|'secondary'|'ghost' controls emphasis, danger
// swaps the accent to red for destructive actions.
const FONT = "'Plus Jakarta Sans','Inter',sans-serif"

const SIZES = {
  sm: { padding: '7px 14px', fontSize: 12.5, gap: 6, iconSize: 14 },
  md: { padding: '10px 20px', fontSize: 13.5, gap: 8, iconSize: 15 },
  lg: { padding: '12px 24px', fontSize: 14.5, gap: 9, iconSize: 17 },
}

export default function Button({
  children, icon, size = 'md', variant = 'primary', danger = false,
  disabled = false, type = 'button', style, onClick, title, ...rest
}) {
  const variantId = useDesignStyle('button')
  const s = SIZES[size] || SIZES.md
  const [hover, setHover] = React.useState(false)
  const isHovering = hover && !disabled

  const { style: variantStyle, extra } = getButtonVariantStyle(variantId, {
    mode: variant, danger, hover: isHovering, disabled,
  })

  const base = {
    fontFamily: FONT, cursor: disabled ? 'default' : 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: s.gap,
    padding: s.padding, fontSize: s.fontSize, fontWeight: 700,
    borderRadius: 11, whiteSpace: 'nowrap', position: 'relative', overflow: 'visible',
    opacity: disabled ? 0.5 : 1,
    pointerEvents: disabled ? 'none' : 'auto',
    transition: 'box-shadow .18s ease, transform .15s ease, border-color .15s ease, background .18s ease',
    ...variantStyle,
    ...style,
  }

  const wrapperStyle = extra?.spinRing
    ? {
        display: 'inline-block', borderRadius: 12, padding: 2,
        background: extra.ringDanger
          ? '#B91C1C'
          : `conic-gradient(from 0deg, #1F3C84, #1C9FD4, #29B9C3, #4CAE6F, #1F3C84)`,
        animation: `qBtnSpin ${extra.spinSpeed} linear infinite`,
      }
    : null

  const btn = (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={base}
      {...rest}
    >
      {extra?.leftBar && (
        <span style={{ position: 'absolute', left: 0, top: '10%', bottom: '10%', width: 3, borderRadius: '0 3px 3px 0', background: extra.barColor }} />
      )}
      {extra?.bottomBar && (
        <span style={{ position: 'absolute', left: 0, right: 0, bottom: -3, height: 3, borderRadius: '0 0 3px 3px', background: extra.barColor }} />
      )}
      {extra?.cornerNotch && (
        <span style={{ position: 'absolute', top: -14, right: -14, width: 34, height: 34, borderRadius: 8, background: extra.notchColor, transform: 'rotate(45deg)' }} />
      )}
      {extra?.iconChip ? (
        <span style={{ width: 26, height: 26, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', background: extra.chipColor, color: '#fff', flexShrink: 0 }}>
          {icon || <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
        </span>
      ) : (
        icon && <span style={{ display: 'flex', width: s.iconSize, height: s.iconSize, flexShrink: 0 }}>{icon}</span>
      )}
      {extra?.statusDot && (
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: extra.dotColor, flexShrink: 0, boxShadow: `0 0 0 3px ${extra.dotColor}2E` }} />
      )}
      {children}
      {(extra?.underline || extra?.centerUnderline) && (
        <span style={{
          position: 'absolute', bottom: extra.centerUnderline ? 4 : 2,
          left: extra.centerUnderline ? '50%' : 2, right: extra.centerUnderline ? 'auto' : 2,
          height: 2, background: extra.underlineColor,
          width: extra.centerUnderline ? (extra.underlineOn ? 26 : 0) : 'auto',
          transform: extra.centerUnderline ? 'translateX(-50%)' : (extra.underlineOn ? 'scaleX(1)' : 'scaleX(0)'),
          transformOrigin: 'left', transition: 'width .2s ease, transform .2s ease',
        }} />
      )}
    </button>
  )

  if (!wrapperStyle) return btn
  return <span style={wrapperStyle}>{btn}</span>
}
