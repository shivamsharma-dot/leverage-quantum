// 20 button visual styles, selectable live from Settings > Appearance via
// useDesignStyle('button'). Variant 10 is today's shipped default ("Embossed
// premium") -- kept byte-equivalent to the original Button.jsx implementation
// so nothing changes for anyone until they pick something else.
//
// getButtonVariantStyle(variantId, { mode, danger, hover, disabled }) returns
// { style, extra } -- `style` is a plain inline-style object for the <button>
// itself; `extra` flags ask Button.jsx to render a bit of additional wrapper
// markup for variants that need more than a single styled element (an icon
// chip, a spinning ring, a bottom accent bar, etc).
const NAVY = '#1F3C84'
const BLUE = '#1C9FD4'
const CYAN = '#29B9C3'
const GREEN = '#4CAE6F'
const RED = '#B91C1C'

export function getButtonVariantStyle(variantId, { mode = 'primary', danger = false, hover = false, disabled = false } = {}) {
  const accent = danger ? RED : BLUE
  const isGhost = mode === 'ghost'
  const isSecondary = mode === 'secondary'

  switch (variantId) {
    case 1: { // Solid navy fill
      const fill = danger ? RED : (isSecondary ? 'transparent' : NAVY)
      return {
        style: {
          background: isGhost ? 'transparent' : fill,
          border: isGhost ? '1px solid transparent' : (isSecondary ? `1px solid ${danger ? RED : NAVY}` : 'none'),
          color: isSecondary || isGhost ? (danger ? RED : NAVY) : '#fff',
          boxShadow: (!isSecondary && !isGhost) ? (hover ? '0 2px 4px rgba(15,27,51,0.18), 0 12px 24px -8px rgba(31,60,132,0.6)' : '0 1px 2px rgba(15,27,51,0.15), 0 8px 18px -8px rgba(31,60,132,0.55)') : 'none',
          transform: hover ? 'translateY(-1px)' : 'none',
        },
      }
    }
    case 2: { // Aurora gradient fill
      const grad = danger ? `linear-gradient(120deg, ${RED}, #E0524F)` : `linear-gradient(120deg, ${NAVY}, ${BLUE} 55%, ${CYAN})`
      return {
        style: {
          background: (isSecondary || isGhost) ? 'transparent' : grad,
          border: (isSecondary || isGhost) ? `1.5px solid ${accent}` : 'none',
          color: (isSecondary || isGhost) ? accent : '#fff',
          boxShadow: (!isSecondary && !isGhost) ? (hover ? `0 14px 30px -8px ${accent}66` : `0 10px 24px -10px ${accent}55`) : 'none',
          transform: hover ? 'translateY(-1px)' : 'none',
        },
      }
    }
    case 3: { // Frosted glass
      return {
        style: {
          background: hover ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.13)',
          border: `1px solid ${hover ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.26)'}`,
          color: isGhost ? accent : '#fff',
          boxShadow: '0 8px 20px -10px rgba(0,0,0,0.35)',
          backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        },
      }
    }
    case 4: { // Outline -> fill on hover
      const fillOnHover = !isGhost && hover
      return {
        style: {
          background: fillOnHover ? accent : 'transparent',
          border: `1.5px solid ${accent}`,
          color: fillOnHover ? '#fff' : accent,
        },
      }
    }
    case 5: { // Soft tint fill
      const tint = danger ? 'rgba(185,28,28,0.12)' : 'rgba(28,159,212,0.12)'
      const tintHover = danger ? 'rgba(185,28,28,0.20)' : 'rgba(28,159,212,0.20)'
      return {
        style: {
          background: isGhost ? 'transparent' : (hover ? tintHover : tint),
          border: isGhost ? '1px solid transparent' : 'none',
          color: danger ? RED : '#137AAE',
        },
      }
    }
    case 6: { // Full pill gradient
      const grad = danger ? `linear-gradient(135deg, ${RED}, #E0524F)` : `linear-gradient(135deg, ${NAVY}, ${CYAN})`
      return {
        style: {
          background: (isSecondary || isGhost) ? 'transparent' : grad,
          border: (isSecondary || isGhost) ? `1.5px solid ${accent}` : 'none',
          color: (isSecondary || isGhost) ? accent : '#fff',
          borderRadius: 999,
          boxShadow: (!isSecondary && !isGhost) ? (hover ? `0 14px 28px -8px ${accent}66` : `0 10px 22px -10px ${accent}5A`) : 'none',
          transform: hover ? 'translateY(-1px)' : 'none',
        },
      }
    }
    case 7: { // White card + left accent bar
      return {
        style: {
          background: 'var(--card, #fff)',
          border: '1px solid var(--card-border, #E2E6EF)',
          color: danger ? RED : NAVY,
          boxShadow: hover ? '0 1px 2px rgba(15,27,51,0.05), 0 10px 22px -14px rgba(15,27,51,0.25)' : '0 1px 2px rgba(15,27,51,0.04)',
          transform: hover ? 'translateY(-1px)' : 'none',
          paddingLeft: 22,
        },
        extra: { leftBar: true, barColor: danger ? RED : `linear-gradient(180deg, ${BLUE}, ${NAVY})` },
      }
    }
    case 8: { // Underline sweep, text-only
      return {
        style: {
          background: 'transparent', border: 'none', boxShadow: 'none',
          color: danger ? RED : '#137AAE', padding: '6px 2px',
        },
        extra: { underline: true, underlineColor: danger ? RED : CYAN, underlineOn: hover },
      }
    }
    case 9: { // Gradient fill, extra rounded, brightens on hover
      const grad = danger ? `linear-gradient(135deg, ${RED}, #E0524F)` : `linear-gradient(135deg, ${NAVY}, ${BLUE})`
      return {
        style: {
          background: (isSecondary || isGhost) ? 'transparent' : grad,
          border: (isSecondary || isGhost) ? `1.5px solid ${accent}` : 'none',
          color: (isSecondary || isGhost) ? accent : '#fff',
          borderRadius: 14,
          filter: (!isSecondary && !isGhost && hover) ? 'brightness(1.08)' : 'none',
        },
      }
    }
    case 10:
    default: { // Embossed premium -- today's shipped default, kept identical
      const restBorderColor = isGhost ? 'transparent' : 'var(--card-border, #E2E6EF)'
      const hoverBorderColor = isGhost ? 'var(--card-border, #E2E6EF)' : accent
      return {
        style: {
          background: 'var(--card, #fff)',
          border: `1px solid ${hover ? hoverBorderColor : restBorderColor}`,
          color: danger ? RED : (isSecondary ? 'var(--text2, #5B6577)' : NAVY),
          boxShadow: (isGhost && !hover)
            ? 'none'
            : hover
              ? `0 1px 0 rgba(255,255,255,0.6) inset, 0 0 0 3px ${accent}29, 0 12px 24px -14px rgba(31,60,132,0.32)`
              : '0 1px 0 rgba(255,255,255,0.6) inset, 0 1px 2px rgba(15,27,51,0.06), 0 8px 18px -14px rgba(15,27,51,0.28)',
          transform: hover ? 'translateY(-1px)' : 'none',
        },
      }
    }
    case 11: { // Hairline -> brand border + glow
      return {
        style: {
          background: 'var(--card, #fff)',
          border: `1px solid ${hover ? accent : 'var(--card-border, #E2E6EF)'}`,
          color: danger ? RED : NAVY,
          boxShadow: hover ? `0 8px 20px -12px ${accent}72` : '0 1px 2px rgba(15,27,51,0.04)',
          transform: hover ? 'translateY(-1px)' : 'none',
        },
      }
    }
    case 12: { // Gradient-ring border
      const ring = danger ? RED : `linear-gradient(120deg, ${NAVY}, ${BLUE}, ${CYAN})`
      return {
        style: {
          background: `linear-gradient(var(--card, #fff), var(--card, #fff)), ${typeof ring === 'string' && ring.startsWith('linear') ? ring : `linear-gradient(${ring}, ${ring})`}`,
          backgroundOrigin: 'border-box', backgroundClip: 'padding-box, border-box',
          border: '2px solid transparent',
          color: danger ? RED : NAVY,
          boxShadow: hover ? `0 10px 24px -12px ${accent}55` : '0 1px 2px rgba(15,27,51,0.04)',
          transform: hover ? 'translateY(-1px)' : 'none',
        },
      }
    }
    case 13: { // Bottom accent bar
      return {
        style: {
          background: 'var(--card, #fff)',
          border: '1px solid var(--card-border, #E2E6EF)',
          borderBottom: 'none',
          borderRadius: '11px 11px 0 0',
          color: hover ? (danger ? RED : NAVY) : 'var(--text, #0F1B33)',
          paddingBottom: 9,
        },
        extra: { bottomBar: true, barColor: danger ? RED : `linear-gradient(90deg, ${NAVY}, ${CYAN})` },
      }
    }
    case 14: { // Neutral surface, colored glow only on hover
      return {
        style: {
          background: 'var(--card, #fff)',
          border: '1px solid var(--card-border, #E2E6EF)',
          color: 'var(--text, #0F1B33)',
          boxShadow: hover ? `0 1px 2px rgba(15,27,51,0.05), 0 14px 30px -10px ${danger ? 'rgba(185,28,28,0.45)' : 'rgba(28,159,212,0.45)'}` : '0 1px 2px rgba(15,27,51,0.05)',
          transform: hover ? 'translateY(-1px)' : 'none',
        },
      }
    }
    case 15: { // Leading gradient icon chip
      return {
        style: {
          background: 'var(--card, #fff)',
          border: '1px solid var(--card-border, #E2E6EF)',
          color: 'var(--text, #0F1B33)',
          transform: hover ? 'translateY(-1px)' : 'none',
          paddingLeft: 6,
        },
        extra: { iconChip: true, chipColor: danger ? `linear-gradient(135deg, ${RED}, #E0524F)` : `linear-gradient(135deg, ${NAVY}, ${CYAN})` },
      }
    }
    case 16: { // Spinning conic-gradient ring border
      return {
        style: {
          background: 'var(--card, #fff)', border: 'none',
          color: 'var(--text, #0F1B33)',
          boxShadow: hover ? `0 10px 24px -12px ${accent}55` : 'none',
        },
        extra: { spinRing: true, spinSpeed: hover ? '1.4s' : '4s', ringDanger: danger },
      }
    }
    case 17: { // Corner-notch accent
      return {
        style: {
          background: 'var(--card, #fff)',
          border: '1px solid var(--card-border, #E2E6EF)',
          color: 'var(--text, #0F1B33)',
          transform: hover ? 'translateY(-1px)' : 'none',
          overflow: 'hidden',
        },
        extra: { cornerNotch: true, notchColor: danger ? `linear-gradient(135deg, ${RED}, #E0524F)` : `linear-gradient(135deg, ${BLUE}, ${CYAN})` },
      }
    }
    case 18: { // Status dot pill
      return {
        style: {
          background: 'var(--card, #fff)',
          border: `1px solid ${hover ? (danger ? RED : GREEN) : 'var(--card-border, #E2E6EF)'}`,
          color: 'var(--text, #0F1B33)',
          borderRadius: 999,
          transform: hover ? 'translateY(-1px)' : 'none',
        },
        extra: { statusDot: true, dotColor: danger ? RED : GREEN },
      }
    }
    case 19: { // Letterspaced uppercase + centered underline
      return {
        style: {
          background: 'var(--card, #fff)',
          border: '1px solid var(--card-border, #E2E6EF)',
          color: danger ? RED : NAVY,
          textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 13.5,
          transform: hover ? 'translateY(-1px)' : 'none',
        },
        extra: { centerUnderline: true, underlineOn: hover, underlineColor: danger ? RED : CYAN },
      }
    }
    case 20: { // Quiet embossed, no ring, deeper shadow only
      return {
        style: {
          background: 'var(--card, #fff)',
          border: `1px solid ${hover ? 'var(--text3, #94A0B4)' : 'var(--card-border, #E2E6EF)'}`,
          color: danger ? RED : 'var(--text, #0F1B33)',
          boxShadow: hover
            ? '0 1px 0 rgba(255,255,255,0.5) inset, 0 14px 28px -14px rgba(15,27,51,0.35)'
            : '0 1px 0 rgba(255,255,255,0.5) inset, 0 1px 2px rgba(15,27,51,0.06)',
          transform: hover ? 'translateY(-1px)' : 'none',
        },
      }
    }
  }
}
