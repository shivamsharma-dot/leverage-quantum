import { GoogleLogin } from '@react-oauth/google'
import styles from '../pages/LoginPage.module.css'

const ALLOWED_DOMAIN = 'leverageedu.com'

// Pure presentational piece of the login page -- every one of the 20 layout
// variants, parameterized so both the real LoginPage (real auth handlers,
// real state) and Settings > Appearance's preview (no-op handlers, forced
// variant) can render the exact same markup/styles. No hooks live here.

export function QuantumIcon({ dark = true }) {
  return (
    <span className={styles.qIcon}>
      <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <rect x="1" y="12" width="4" height="9" rx="1.5" fill="#4CAE6F" />
        <rect x="7" y="7" width="4" height="14" rx="1.5" fill="#1C9FD4" />
        <rect x="13" y="4" width="4" height="17" rx="1.5" fill={dark ? '#29B9C3' : '#1F3C84'} />
      </svg>
    </span>
  )
}

function brandLogo(dark) {
  return (
    <svg width="28" height="28" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <rect x="1" y="12" width="4" height="9" rx="1.5" fill="#4CAE6F" />
      <rect x="7" y="7" width="4" height="14" rx="1.5" fill={dark ? '#fff' : '#1C9FD4'} />
      <rect x="13" y="4" width="4" height="17" rx="1.5" fill={dark ? '#29B9C3' : '#1F3C84'} />
    </svg>
  )
}

export default function LoginScene({
  variant, success, loading, error, gsiWidth = 300,
  onGoogleSuccess = () => {}, onGoogleError = () => {},
}) {
  // Shared, auth-critical block -- reused by every variant below so the real
  // sign-in logic only exists once, no matter which visual layout is
  // selected. `dark` picks the Google button's own theme so it still reads
  // correctly against a light or dark background (this is Google's own
  // rendered widget -- its internal colors can't be restyled beyond the
  // theme/shape/size props it already exposes).
  const googleBlock = (dark = true) => (
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
        width={gsiWidth}
        text="continue_with"
        hosted_domain={ALLOWED_DOMAIN}
      />
      {loading && (
        <div className={styles.googleOverlay} aria-hidden="true">
          <span className={styles.spinner} />
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

  if (success) {
    return (
      <div className={variant >= 11 ? styles.lScene : styles.scene}>
        {variant < 11 && <div className={styles.grid} />}
        <div className={`${variant >= 11 ? styles.lCard : styles.card} ${styles.successCard}`} role="status" aria-live="polite">
          <div className={styles.successIcon}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 className={variant >= 11 ? styles.lHeading : styles.heading}>You&apos;re in!</h2>
          <p className={variant >= 11 ? styles.lSub : styles.sub}>Redirecting to your dashboards…</p>
        </div>
      </div>
    )
  }

  // ── Variant 1: today's shipped design, byte-for-byte, so nothing changes
  // for anyone until they explicitly pick a different one in Settings. ──
  if (variant === 1 || !variant) {
    return (
      <div className={styles.scene}>
        <div className={styles.grid} />
        <div className={styles.ribbonWrap}>
          <svg className={styles.ribbonSvg} viewBox="0 0 900 900" fill="none" aria-hidden="true">
            <path className={`${styles.ribbon} ${styles.r1}`} d="M -40 360 C 220 360, 420 200, 640 140 C 760 108, 850 96, 940 92" />
            <path className={`${styles.ribbon} ${styles.r2}`} d="M -40 440 C 220 440, 440 280, 660 220 C 780 188, 860 176, 940 172" />
            <path className={`${styles.ribbon} ${styles.r3}`} d="M -40 520 C 240 520, 460 360, 680 300 C 800 268, 870 256, 940 252" />
            <path className={`${styles.ribbon} ${styles.r4}`} d="M -40 600 C 260 600, 480 440, 700 380 C 820 348, 880 336, 940 332" />
          </svg>
        </div>
        <div className={styles.card}>
          <div className={styles.logoRow}>
            <div className={styles.logoPill}>
              <img src="https://publicassets.leverageedu.com/landing-pages-new/logo-dark.svg" alt="Leverage Edu" className={styles.logo} />
            </div>
            <div className={styles.logoDivider} />
            <div className={styles.quantumWrap}>
              <QuantumIcon />
              <span className={styles.logoProduct}>Quantum</span>
            </div>
          </div>
          <div className={styles.badge}>
            <span className={styles.badgeDot} />
            Internal Analytics Platform
          </div>
          <h1 className={styles.heading}>Welcome back</h1>
          <p className={styles.sub}>Sign in with your Leverage&nbsp;Edu Google account to access your dashboards.</p>
          {errorBlock()}
          {googleBlock(true)}
          {footNote()}
        </div>
      </div>
    )
  }

  // ── Variants 2-20: lighter, simpler layouts sharing the same auth block. ──
  switch (variant) {
    case 2: // split screen
      return (
        <div className={styles.lFullScene}>
          <div className={styles.lSplit}>
            <div className={styles.lBrandPanel}>
              <div>
                <div className={styles.lTag}>Leverage Quantum</div>
                <h2 className={styles.lBrandHeading}>All your marketing data, in one place.</h2>
              </div>
              <div className={styles.lStatRow}>
                <div><b>12</b><span>Live sources</span></div>
                <div><b>4</b><span>Ad channels</span></div>
                <div><b>24/7</b><span>Synced</span></div>
              </div>
            </div>
            <div className={styles.lFormPanel}>
              <div className={styles.lFormInner}>
                <h2 className={styles.lHeading}>Welcome back</h2>
                <p className={styles.lSub}>Sign in with your work account to continue.</p>
                {errorBlock(true)}
                {googleBlock(false)}
                {footNote(true)}
              </div>
            </div>
          </div>
        </div>
      )
    case 3: // full-bleed gradient + frosted card
      return (
        <div className={styles.lGradientScene}>
          <div className={styles.lFrostedCard}>
            {brandLogo(true)}
            <h1 className={styles.lHeadingWhite}>Sign in to Quantum</h1>
            <p className={styles.lSubWhite}>Internal analytics for the marketing team.</p>
            {errorBlock()}
            {googleBlock(true)}
            {footNote()}
          </div>
        </div>
      )
    case 4: // product preview + narrow sign-in
      return (
        <div className={styles.lFullScene}>
          <div className={styles.lPreviewSplit}>
            <div className={styles.lPreviewPanel}>
              <div className={styles.lKpiRow}>
                <div className={styles.lKpiTile}><span>Total Leads</span><b>84,848</b></div>
                <div className={styles.lKpiTile}><span>ROAS</span><b>3.8x</b></div>
                <div className={styles.lKpiTile}><span>QL Rate</span><b>42.9%</b></div>
              </div>
            </div>
            <div className={styles.lFormPanel}>
              <div className={styles.lFormInner}>
                <h2 className={styles.lHeading}>Sign in</h2>
                <p className={styles.lSub}>Continue with your Leverage Edu Google account.</p>
                {errorBlock(true)}
                {googleBlock(false)}
                {footNote(true)}
              </div>
            </div>
          </div>
        </div>
      )
    case 5: // ultra-minimal quiet
      return (
        <div className={styles.lScene}>
          <div className={styles.lQuietInner}>
            {brandLogo(false)}
            <h2 className={styles.lHeading}>Welcome to Quantum</h2>
            <p className={styles.lSub}>Sign in with your Leverage Edu account to view your marketing dashboards.</p>
            {errorBlock(true)}
            {googleBlock(false)}
            {footNote(true)}
          </div>
        </div>
      )
    case 6: // dark console
      return (
        <div className={styles.lConsoleScene}>
          <div className={styles.lConsoleCard}>
            {brandLogo(true)}
            <h2 className={styles.lConsoleHeading}>quantum --sign-in</h2>
            <p className={styles.lConsoleSub}>auth required · leverageedu.com only</p>
            {errorBlock()}
            {googleBlock(true)}
          </div>
        </div>
      )
    case 7: // bento grid brand panel
      return (
        <div className={styles.lFullScene}>
          <div className={styles.lSplit}>
            <div className={styles.lBento}>
              <div className={`${styles.lBentoTile} ${styles.lBentoBrand}`}>{brandLogo(true)}<span>QUANTUM</span></div>
              <div className={styles.lBentoTile}><span>Spend Today</span><b>₹7.6L</b></div>
              <div className={styles.lBentoTile}><span>Leads</span><b>4,201</b></div>
              <div className={`${styles.lBentoTile} ${styles.lBentoWide}`}><span>Channels connected</span><b>Meta · Google · Bing</b></div>
            </div>
            <div className={styles.lFormPanel}>
              <div className={styles.lFormInner}>
                <h2 className={styles.lHeading}>Sign in to continue</h2>
                <p className={styles.lSub}>Your team's marketing dashboard.</p>
                {errorBlock(true)}
                {googleBlock(false)}
                {footNote(true)}
              </div>
            </div>
          </div>
        </div>
      )
    case 8: // animated gradient orb
      return (
        <div className={styles.lScene}>
          <div className={styles.lQuietInner}>
            <div className={styles.lOrb}><div className={styles.lOrbCore}>{brandLogo(false)}</div></div>
            <h2 className={styles.lHeading}>Sign in to Quantum</h2>
            <p className={styles.lSub}>Internal analytics for the marketing team.</p>
            {errorBlock(true)}
            {googleBlock(false)}
            {footNote(true)}
          </div>
        </div>
      )
    case 9: // top bar + centered form
      return (
        <div className={styles.lTopBarScene}>
          <div className={styles.lTopBar}><QuantumIcon dark={false} /><span className={styles.lTopBarWord}>QUANTUM</span></div>
          <div className={styles.lTopBarBody}>
            <div className={styles.lQuietInner}>
              <h2 className={styles.lHeading}>Sign in to your workspace</h2>
              <p className={styles.lSub}>Use your Leverage Edu Google account.</p>
              {errorBlock(true)}
              {googleBlock(false)}
            </div>
          </div>
        </div>
      )
    case 10: // dot-grid background
      return (
        <div className={styles.lDotScene}>
          <div className={styles.lCard}>
            {brandLogo(false)}
            <h2 className={styles.lHeading}>Sign in to Quantum</h2>
            <p className={styles.lSub}>Internal analytics for the marketing team.</p>
            {errorBlock(true)}
            {googleBlock(false)}
            {footNote(true)}
          </div>
        </div>
      )
    case 11: // testimonial split
      return (
        <div className={styles.lFullScene}>
          <div className={styles.lSplit}>
            <div className={styles.lQuotePanel}>
              <blockquote>"Quantum is the first place I check every morning — everything's already there."</blockquote>
              <div className={styles.lWho}>— Growth Marketing, Leverage Edu</div>
            </div>
            <div className={styles.lFormPanel}>
              <div className={styles.lFormInner}>
                <h2 className={styles.lHeading}>Sign in</h2>
                {errorBlock(true)}
                {googleBlock(false)}
                {footNote(true)}
              </div>
            </div>
          </div>
        </div>
      )
    case 12: // numbered onboarding steps
      return (
        <div className={styles.lScene}>
          <div className={styles.lStepsRow}>
            <div className={styles.lSteps}>
              <div className={styles.lStep}><span>1</span>Sign in with Google</div>
              <div className={styles.lStep}><span>2</span>Data syncs automatically</div>
              <div className={styles.lStep}><span>3</span>See your dashboards live</div>
            </div>
            <div className={styles.lCard} style={{ width: 280 }}>
              {brandLogo(false)}
              <h2 className={styles.lHeading}>Get started</h2>
              {errorBlock(true)}
              {googleBlock(false)}
            </div>
          </div>
        </div>
      )
    case 13: // vertical brand ribbon
      return (
        <div className={styles.lRibbonScene}>
          <div className={styles.lRibbonBar} />
          <div className={styles.lRibbonBody}>
            <div className={styles.lQuietInnerLeft}>
              {brandLogo(false)}
              <h2 className={styles.lHeading}>Sign in to Quantum</h2>
              <p className={styles.lSub}>Internal analytics for the marketing team.</p>
              {errorBlock(true)}
              {googleBlock(false)}
            </div>
          </div>
        </div>
      )
    case 14: // diagonal split
      return (
        <div className={styles.lDiagScene}>
          <div className={styles.lDiag}>
            {brandLogo(true)}
            <h2 className={styles.lHeadingWhite}>All your marketing data, one place.</h2>
          </div>
          <div className={styles.lDiagForm}>
            <div className={styles.lFormInner}>
              <h2 className={styles.lHeading}>Sign in</h2>
              {errorBlock(true)}
              {googleBlock(false)}
            </div>
          </div>
        </div>
      )
    case 15: // floating ghost cards behind form
      return (
        <div className={styles.lGhostScene}>
          <div className={styles.lGhostTile} style={{ width: 160, height: 90, top: '14%', left: '8%', transform: 'rotate(-6deg)' }} />
          <div className={styles.lGhostTile} style={{ width: 140, height: 100, bottom: '12%', right: '10%', transform: 'rotate(8deg)' }} />
          <div className={styles.lGhostTile} style={{ width: 120, height: 70, top: '20%', right: '14%', transform: 'rotate(4deg)' }} />
          <div className={styles.lCard}>
            {brandLogo(false)}
            <h2 className={styles.lHeading}>Sign in to Quantum</h2>
            <p className={styles.lSub}>Internal analytics for the marketing team.</p>
            {errorBlock(true)}
            {googleBlock(false)}
            {footNote(true)}
          </div>
        </div>
      )
    case 16: // badge-topped card
      return (
        <div className={styles.lScene}>
          <div className={styles.lCard}>
            <span className={styles.lBadgeLight}>Internal tool</span>
            {brandLogo(false)}
            <h2 className={styles.lHeading}>Sign in to Quantum</h2>
            <p className={styles.lSub}>Leverage Edu marketing analytics.</p>
            {errorBlock(true)}
            {googleBlock(false)}
          </div>
        </div>
      )
    case 17: // illustration-hero stacked
      return (
        <div className={styles.lStackedScene}>
          <div className={styles.lStackedHero}>{brandLogo(true)}</div>
          <div className={styles.lStackedBody}>
            <div className={styles.lQuietInner}>
              <h2 className={styles.lHeading}>Sign in to Quantum</h2>
              <p className={styles.lSub}>Internal analytics for the marketing team.</p>
              {errorBlock(true)}
              {googleBlock(false)}
            </div>
          </div>
        </div>
      )
    case 18: // ghost dashboard behind modal
      return (
        <div className={styles.lModalScene}>
          <div className={styles.lModalBehind}>
            <div className={styles.lModalRow}><div /><div /><div /><div /></div>
            <div className={styles.lModalBig} />
          </div>
          <div className={styles.lModalOverlay}>
            <div className={styles.lCard}>
              {brandLogo(true)}
              <h2 className={styles.lHeadingWhite}>Sign in to continue</h2>
              <p className={styles.lSubWhite}>Your dashboards are ready.</p>
              {errorBlock()}
              {googleBlock(true)}
            </div>
          </div>
        </div>
      )
    case 19: { // dual action
      const learnMore = () => window.open('https://leverageedu.com', '_blank', 'noopener,noreferrer')
      return (
        <div className={styles.lScene}>
          <div className={styles.lCard}>
            {brandLogo(false)}
            <h2 className={styles.lHeading}>Sign in to Quantum</h2>
            <p className={styles.lSub}>Internal analytics for the marketing team.</p>
            {errorBlock(true)}
            {googleBlock(false)}
            <button type="button" className={styles.lLinkBtn} onClick={learnMore}>What is Quantum?</button>
          </div>
        </div>
      )
    }
    case 21: // ambient aurora -- soft drifting brand-color light behind a glassy centered card
      return (
        <div className={styles.lAuroraScene}>
          <div className={styles.lAuroraOrb} aria-hidden="true" />
          <div className={`${styles.lAuroraOrb} ${styles.lAuroraOrb2}`} aria-hidden="true" />
          <div className={`${styles.lAuroraOrb} ${styles.lAuroraOrb3}`} aria-hidden="true" />
          <div className={styles.lAuroraFade} aria-hidden="true" />
          <div className={styles.lAuroraCard}>
            <div className={styles.lAuroraLogoWrap}>
              <span className={styles.lAuroraGlow} aria-hidden="true" />
              <span className={styles.lAuroraIconBox}>{brandLogo(false)}</span>
            </div>
            <h1 className={styles.lAuroraHeading}>Quantum</h1>
            <p className={styles.lAuroraSub}>Marketing intelligence, unified.</p>
            {errorBlock(true)}
            {googleBlock(false)}
            {footNote(true)}
          </div>
        </div>
      )
    case 20: // dynamic warm greeting
    default: {
      const hour = new Date().getHours()
      const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
      return (
        <div className={styles.lScene}>
          <div className={styles.lQuietInner}>
            <span className={styles.lWave} aria-hidden="true">👋</span>
            <h2 className={styles.lHeading}>{greeting}</h2>
            <p className={styles.lSub}>Sign in with your Leverage Edu account to pick up where you left off.</p>
            {errorBlock(true)}
            {googleBlock(false)}
          </div>
        </div>
      )
    }
  }
}
