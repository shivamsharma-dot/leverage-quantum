import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { useAuth } from '../hooks/useAuth'
import styles from './LoginPage.module.css'

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
const [gsiWidth, setGsiWidth] = useState(360)
useEffect(() => {
const calc = () => setGsiWidth(Math.round(Math.max(220, Math.min(360, window.innerWidth - 96))))
calc()
window.addEventListener('resize', calc)
return () => window.removeEventListener('resize', calc)
}, [])

  useEffect(() => { if (user) navigate('/') }, [user, navigate])

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
      <div className={styles.grid} />

      <div className={styles.ribbonWrap}>
        <svg className={styles.ribbonSvg} viewBox="0 0 900 900" fill="none" aria-hidden="true">
          <path className={`${styles.ribbon} ${styles.r1}`} d="M -40 360 C 220 360, 420 200, 640 140 C 760 108, 850 96, 940 92" />
          <path className={`${styles.ribbon} ${styles.r2}`} d="M -40 440 C 220 440, 440 280, 660 220 C 780 188, 860 176, 940 172" />
          <path className={`${styles.ribbon} ${styles.r3}`} d="M -40 520 C 240 520, 460 360, 680 300 C 800 268, 870 256, 940 252" />
          <path className={`${styles.ribbon} ${styles.r4}`} d="M -40 600 C 260 600, 480 440, 700 380 C 820 348, 880 336, 940 332" />
        </svg>
      </div>

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
              theme="filled_black"
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

          <p className={styles.footer}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <rect x="1" y="5" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M3.5 5V3.5a2.5 2.5 0 015 0V5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            Restricted to leverageedu.com accounts only
          </p>
        </div>
      ) : (
        <div className={`${styles.card} ${styles.successCard}`} role="status" aria-live="polite">
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
  )
}
