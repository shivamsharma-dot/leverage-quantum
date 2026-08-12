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

// --- Text-safe brand inks --------------------------------------------------
// NAVY/BLUE/RED above are tuned for white surfaces. Used as *text* they break
// on the dark and navy themes: #1F3C84 on --card (#1E293B) measures 1.42:1,
// i.e. an unreadable ghost/secondary button on every page that uses one.
// The --*-ink tokens in src/index.css are redefined per [data-theme] and clear
// 4.5:1 against that theme's --card in all four themes -- measured navy/blue/
// red: light 10.3/5.2/5.0, stone 9.9/5.0/4.8, dark 8.4/8.8/7.7, navy 10.0/9.0/
// 8.8. So text -- and any border drawn over a transparent surface -- uses
// these, while fills, gradients and `${accent}66` shadow alphas keep the raw
// hexes: var() cannot be string-concatenated, and those are not text surfaces.
// Fallbacks equal the light-theme token values, so nothing shifts pre-CSS.
const NAVY_INK = 'var(--navy-ink, #1F3C84)'
const BLUE_INK = 'var(--blue-ink, #15749B)'
const RED_INK  = 'var(--red-ink, #B42318)'

export function getButtonVariantStyle(variantId, { mode = 'primary', danger = false, hover = false, disabled = false } = {}) {
  const accent = danger ? RED : BLUE
  const ink = danger ? RED_INK : BLUE_INK
  const navyInk = danger ? RED_INK : NAVY_INK
  const isGhost = mode === 'ghost'
  const isSecondary = mode === 'secondary'

  switch (variantId) {
    case 1: { // Solid navy fill
      const fill = danger ? RED : (isSecondary ? 'transparent' : NAVY)
      return {
        style: {
          background: isGhost ? 'transparent' : fill,
          border: isGhost ? '1px solid transparent' : (isSecondary ? `1px solid ${navyInk}` : 'none'),
          color: isSecondary || isGhost ? navyInk : '#fff',
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
          border: (isSecondary || isGhost) ? `1.5px solid ${ink}` : 'none',
          color: (isSecondary || isGhost) ? ink : '#fff',
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
          color: isGhost ? ink : '#fff',
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
          border: `1.5px solid ${fillOnHover ? accent : ink}`,
          color: fillOnHover ? '#fff' : ink,
        },
      }
    }
    case 5: { // Soft tint fill
      // The tint has to be the *paired* token for `ink`, not an ad-hoc rgba.
      // The old rgba(28,159,212,0.12 / 0.20) composited to #DFEFF4 at rest and
      // #CEE8F1 on hover over the stone card, dropping --blue-ink to 4.45:1 and
      // 4.10:1 -- both measured live on the deployed app, not derived on paper.
      // --*-tint is the exact surface --*-ink was chosen against, so the pair
      // clears 4.5:1 in every theme (blue 4.67 light / 4.59 stone / 6.69 dark,
      // red 6.01 / 5.66 / 6.51). Hover therefore signals with the --*-line
      // hairline rather than by deepening the fill, because deepening the fill
      // is exactly what broke the contrast on the two light themes.
      const tint = danger ? 'var(--red-tint)' : 'var(--blue-tint)'
      const line = danger ? 'var(--red-line)' : 'var(--blue-line)'
      return {
        style: {
          background: isGhost ? 'transparent' : tint,
          border: `1px solid ${(isGhost || !hover) ? 'transparent' : line}`,
          color: ink,
        },
      }
    }
    case 6: { // Full pill gradient
      const grad = danger ? `linear-gradient(135deg, ${RED}, #E0524F)` : `linear-gradient(135deg, ${NAVY}, ${CYAN})`
      return {
        style: {
          background: (isSecondary || isGhost) ? 'transparent' : grad,
          border: (isSecondary || isGhost) ? `1.5px solid ${ink}` : 'none',
          color: (isSecondary || isGhost) ? ink : '#fff',
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
          color: navyInk,
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
          color: ink, padding: '6px 2px',
        },
        extra: { underline: true, underlineColor: danger ? RED : CYAN, underlineOn: hover },
      }
    }
    case 9: { // Gradient fill, extra rounded, brightens on hover
      const grad = danger ? `linear-gradient(135deg, ${RED}, #E0524F)` : `linear-gradient(135deg, ${NAVY}, ${BLUE})`
      return {
        style: {
          background: (isSecondary || isGhost) ? 'transparent' : grad,
          border: (isSecondary || isGhost) ? `1.5px solid ${ink}` : 'none',
          color: (isSecondary || isGhost) ? ink : '#fff',
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
          color: danger ? RED_INK : (isSecondary ? 'var(--text2, #5B6577)' : NAVY_INK),
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
          color: navyInk,
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
          color: navyInk,
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
          color: hover ? navyInk : 'var(--text, #0F1B33)',
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
          color: navyInk,
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
          color: danger ? RED_INK : 'var(--text, #0F1B33)',
          boxShadow: hover
            ? '0 1px 0 rgba(255,255,255,0.5) inset, 0 14px 28px -14px rgba(15,27,51,0.35)'
            : '0 1px 0 rgba(255,255,255,0.5) inset, 0 1px 2px rgba(15,27,51,0.06)',
          transform: hover ? 'translateY(-1px)' : 'none',
        },
      }
    }
  }
}
