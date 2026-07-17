import React from 'react'

// Single shared button used everywhere in Quantum -- "Embossed premium" style
// (picked from a 10-direction gallery): white surface at rest, a soft inner
// highlight for depth, and a brand-blue focus ring that appears on hover.
// No fill-color change on hover -- brand color only ever elevates, never fills.
// Variants: primary (default border weight) / secondary (lighter border,
// muted text) / danger (red ring on hover instead of blue, for destructive
// actions) / ghost (no border/shadow until hovered -- for toolbars).
const NAVY = '#1F3C84'
const BLUE = '#1C9FD4'
const RED = '#B91C1C'
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
  const s = SIZES[size] || SIZES.md
  const ringColor = danger ? RED : BLUE
  const [hover, setHover] = React.useState(false)

  const base = {
    fontFamily: FONT, cursor: disabled ? 'default' : 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: s.gap,
    padding: s.padding, fontSize: s.fontSize, fontWeight: 700,
    borderRadius: 11, whiteSpace: 'nowrap',
    background: 'var(--card, #fff)',
    color: danger ? RED : (variant === 'secondary' ? 'var(--text-2, #5B6577)' : NAVY),
    border: variant === 'ghost'
      ? '1px solid transparent'
      : `1px solid ${variant === 'secondary' ? 'var(--card-border, #E7EAF1)' : 'var(--card-border, #E2E6EF)'}`,
    boxShadow: (variant === 'ghost' && !hover)
      ? 'none'
      : '0 1px 0 rgba(255,255,255,0.6) inset, 0 1px 2px rgba(15,27,51,0.06), 0 8px 18px -14px rgba(15,27,51,0.28)',
    opacity: disabled ? 0.5 : 1,
    pointerEvents: disabled ? 'none' : 'auto',
    transition: 'box-shadow .18s ease, transform .15s ease, border-color .15s ease',
    transform: hover && !disabled ? 'translateY(-1px)' : 'translateY(0)',
    ...(hover && !disabled ? {
      boxShadow: `0 1px 0 rgba(255,255,255,0.6) inset, 0 0 0 3px ${ringColor}29, 0 12px 24px -14px rgba(31,60,132,0.32)`,
      borderColor: variant === 'ghost' ? 'var(--card-border, #E2E6EF)' : (danger ? RED : BLUE),
    } : {}),
    ...style,
  }

  return (
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
      {icon && <span style={{ display: 'flex', width: s.iconSize, height: s.iconSize, flexShrink: 0 }}>{icon}</span>}
      {children}
    </button>
  )
}
