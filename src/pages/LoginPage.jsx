import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { useAuth } from '../hooks/useAuth'
import styles from './LoginPage.module.css'

// Domain shown as a UI hint to Google. This is NOT a security control —
// `hosted_domain` only filters the account picker and can be bypassed.
// The REAL domain check must happen server-side inside loginWithGoogle
// (verify the Google ID token and confirm the verified `hd`/email domain).
const ALLOWED_DOMAIN = 'leverageedu.com'

function QuantumIcon() {
  return (
    <span className={styles.qIcon}>
      <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <rect className={styles.bar1} x="1"  y="12" width="4" height="9"  rx="1.5" />
        <rect className={styles.bar2} x="7"  y="7"  width="4" height="14" rx="1.5" />
        <rect className={styles.bar3} x="13" y="4"  width="4" height="17" rx="1.5" />
      </svg>
    </span>
  )
}

export default function LoginPage() {
  const { user, loginWithGoogle } = useAuth()
  const navigate = useNavigate()

  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  // Already authenticated → leave the login page.
  useEffect(() => {
    if (user) navigate('/')
  }, [user, navigate])

  const handleGoogleSuccess = async (credentialResponse) => {
    setError('')
    setLoading(true)
    try {
      const result = await loginWithGoogle(credentialResponse)
      if (result?.success) {
        setSuccess(true)
        setTimeout(() => navigate('/'), 1200)
      } else {
        setError(result?.error || 'Sign-in failed. Please try again.')
      }
    } catch {
      setError('Something went wrong while signing in. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.scene}>
      {/* ---------------- LEFT: form panel ---------------- */}
      <div className={styles.formPanel}>
        {!success ? (
          <div className={styles.card}>
            <div className={styles.logoRow}>
              <div className={styles.logoPill}>
                <img
                  src="https://publicassets.leverageedu.com/landing-pages-new/logo-dark.svg"
                  alt="Leverage Edu"
                  className={styles.logo}
                />
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
            <p className={styles.sub}>
              Sign in with your Leverage&nbsp;Edu Google account to access your dashboards.
            </p>

            {error && (
              <div className={styles.error} role="alert" aria-live="assertive">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <circle cx="7" cy="7" r="6.5" stroke="currentColor" />
                  <path d="M7 4v3.5M7 9.5v.5" stroke="currentColor" strokeLinecap="round" />
                </svg>
                {error}
              </div>
            )}

            <div
              className={`${styles.googleWrap} ${loading ? styles.googleLoading : ''}`}
              aria-busy={loading}
            >
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => setError('Google sign-in failed. Please try again.')}
                theme="outline"
                shape="pill"
                size="large"
                width="340"
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

            <p className={styles.footer}>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <rect x="1" y="5" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                <path d="M3.5 5V3.5a2.5 2.5 0 015 0V5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              Restricted to leverageedu.com accounts only
            </p>
          </div>
        ) : (
          <div className={styles.successCard} role="status" aria-live="polite">
            <div className={styles.successIcon}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 className={styles.heading}>You&apos;re in!</h2>
            <p className={styles.sub}>Redirecting to your dashboards…</p>
          </div>
        )}
      </div>

      {/* ---------------- RIGHT: brand panel ---------------- */}
      <aside className={styles.brandPanel}>
        <div className={styles.swooshWrap}>
          <svg className={styles.swooshSvg} viewBox="0 0 900 900" fill="none" aria-hidden="true">
            <path className={`${styles.swoosh} ${styles.s1}`} d="M 900 200 C 700 200, 500 400, 300 500 C 150 570, 50 620, -50 700" strokeWidth="28" strokeLinecap="round" />
            <path className={`${styles.swoosh} ${styles.s2}`} d="M 900 280 C 680 280, 480 460, 280 560 C 130 630, 20 670, -80 750" strokeWidth="28" strokeLinecap="round" />
            <path className={`${styles.swoosh} ${styles.s3}`} d="M 900 360 C 660 360, 460 520, 260 620 C 110 690, -10 720, -110 800" strokeWidth="28" strokeLinecap="round" />
          </svg>
        </div>
        <div className={styles.grid} />
        <div className={styles.brandContent}>
          <div className={styles.brandMark}>
            <QuantumIcon />
            <span className={styles.brandWord}>QUANTUM</span>
          </div>
          <h2 className={styles.brandTitle}>
            Every channel&apos;s performance,<br />in one command center.
          </h2>
          <p className={styles.brandSub}>
            Meta &amp; Google Ads, ROAS, MTD, lead quality, channel mix and revenue — unified, live, and built for the team.
          </p>
          <ul className={styles.brandList}>
            <li><span className={styles.brandTick} />Meta &amp; Google Ads spend and ROAS in real time</li>
            <li><span className={styles.brandTick} />Lead quality, channel mix and revenue in one view</li>
            <li><span className={styles.brandTick} />VASU AI for instant performance answers</li>
          </ul>
        </div>
      </aside>
    </div>
  )
}
