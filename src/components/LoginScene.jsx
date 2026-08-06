import { GoogleLogin } from '@react-oauth/google'
import styles from '../pages/LoginPage.module.css'
// canonical logo geometry -- never hand-roll the mark, see shared/brandLogo.mjs
import { BRAND_LOGO_BARS, BRAND_LOGO_VIEWBOX, BRAND_LOGO_RX } from '../../shared/brandLogo.mjs'

const ALLOWED_DOMAIN = 'leverageedu.com'

// Pure presentational piece of the login page -- one design now (the "aurora
// glass" scene, formerly variant 21 of a 21-layout picker that lived in
// Settings > Appearance). That picker is gone; this is just the page.

export default function LoginScene({
  success, loading, error, gsiWidth = 300,
  onGoogleSuccess = () => {}, onGoogleError = () => {},
}) {
  // Shared, auth-critical block -- the real sign-in logic only exists once.
  // `dark` picks the Google button's own theme so it still reads correctly
  // against the light glass card (this is Google's own rendered widget --
  // its internal colors can't be restyled beyond the theme/shape/size props
  // it already exposes).
  const googleBlock = (dark = true, widthOverride) => (
    <div
      className={`${styles.googleWrap} ${loading ? styles.googleLoading : ''} ${dark ? '' : styles.googleWrapLight}`}
      aria-busy={loading}
    >
      <GoogleLogin
        onSuccess={onGoogleSuccess}
        onError={onGoogleError}
        theme={dark ? 'filled_black' : 'outline'}
        shape="pill"
        size="large"
        width={widthOverride || gsiWidth}
        text="continue_with"
        hosted_domain={ALLOWED_DOMAIN}
      />
      {loading && (
        <div className={`${styles.googleOverlay} ${dark ? '' : styles.googleOverlayLight}`} aria-hidden="true">
          <span className={`${styles.spinner} ${dark ? '' : styles.spinnerLight}`} />
          <span className={styles.googleOverlayText}>Signing you in…</span>
        </div>
      )}
    </div>
  )

  const errorBlock = (light = false) => error && (
    <div className={`${styles.error} ${light ? styles.errorLight : ''}`} role="alert" aria-live="assertive">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <circle cx="7" cy="7" r="6.5" stroke="currentColor" />
        <path d="M7 4v3.5M7 9.5v.5" stroke="currentColor" strokeLinecap="round" />
      </svg>
      {error}
    </div>
  )

  const footNote = (light = false) => (
    <p className={`${styles.footer} ${light ? styles.footerLight : ''}`}>
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <rect x="1" y="5" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M3.5 5V3.5a2.5 2.5 0 015 0V5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
      Restricted to leverageedu.com accounts only
    </p>
  )

  // ── shell, shared by the normal and success states so signing in never
  // cuts to a different background. Everything but the card body stays
  // identical across the transition. ──
  const auroraShell = (children) => (
    <div className={styles.lAuroraScene}>
      <div className={styles.lAuroraField} aria-hidden="true">
        {[1, 2, 3, 4].map(n => (
          <div key={n} className={`${styles.lAuroraRib} ${styles[`lAuroraR${n}`]}`}><span /></div>
        ))}
      </div>
      <div className={styles.lAuroraVeil} aria-hidden="true" />
      <div className={styles.lAuroraCard}>{children}</div>
    </div>
  )

  const auroraMark = (
    <div className={styles.lAuroraTile}>
      {/* 52px inside the reference's 80px tile (65% fill) -- as heavy as the mark
          can read at the matched tile size, and still a uniform scale of the
          canonical geometry (never redrawn by hand) */}
      <svg className={styles.lAuroraLogo} width="52" height="52" viewBox={BRAND_LOGO_VIEWBOX} fill="none" role="img" aria-label="Quantum">
        {/* silhouette: the mark is present from the first frame at full height,
            so nothing ever assembles or jumps */}
        {BRAND_LOGO_BARS.map((b, i) => (
          <rect key={`ghost-${i}`} x={b.x} y={b.y} width={b.w} height={b.h} rx={BRAND_LOGO_RX} fill={b.color} fillOpacity="0.15" />
        ))}
        {/* real colour rises through each bar, green -> blue -> navy */}
        {BRAND_LOGO_BARS.map((b, i) => (
          <rect
            key={`fill-${i}`}
            className={styles.lAuroraFill}
            x={b.x} y={b.y} width={b.w} height={b.h} rx={BRAND_LOGO_RX} fill={b.color}
            style={{ animationDelay: `${0.62 + i * 0.16}s` }}
          />
        ))}
      </svg>
    </div>
  )

  if (success) {
    return auroraShell(
      <div role="status" aria-live="polite">
        {auroraMark}
        <h1 className={styles.lAuroraWord}>You&apos;re in</h1>
        <p className={styles.lAuroraTag}>Taking you to your dashboards…</p>
      </div>
    )
  }

  return auroraShell(
    <>
      {auroraMark}
      <h1 className={styles.lAuroraWord}>Quantum</h1>
      <p className={styles.lAuroraTag}>Internal analytics for the marketing team.</p>
      {errorBlock(true)}
      {/* the reference's button is 432px wide; Google caps its own widget at
          400, so this is the widest match achievable with the real widget */}
      {googleBlock(false, gsiWidth >= 360 ? 400 : gsiWidth)}
      {footNote(true)}
    </>
  )
}
