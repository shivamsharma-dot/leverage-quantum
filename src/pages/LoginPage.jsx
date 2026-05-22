import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { useAuth } from '../hooks/useAuth'
import styles from './LoginPage.module.css'

function QuantumIcon() {
  return (
    <span className={styles.qIcon}>
      <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
        <rect className={styles.bar1} x="1"  y="12" width="4" height="9"  rx="1.5"/>
        <rect className={styles.bar2} x="7"  y="7"  width="4" height="14" rx="1.5"/>
        <rect className={styles.bar3} x="13" y="4"  width="4" height="17" rx="1.5"/>
        <circle className={styles.dot1} cx="19" cy="3"  r="2"/>
        <circle className={styles.dot2} cx="19" cy="10" r="2"/>
      </svg>
    </span>
  )
}

export default function LoginPage() {
  const { user, loginWithGoogle, loginWithEmail } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [success, setSuccess]   = useState(false)
  const [showPass, setShowPass] = useState(false)

  useEffect(() => { if (user) navigate('/') }, [user])

  const handleGoogleSuccess = (credentialResponse) => {
    const result = loginWithGoogle(credentialResponse)
    if (result.success) { setSuccess(true); setTimeout(() => navigate('/'), 1200) }
    else setError(result.error)
  }

  const handleEmailLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    await new Promise(r => setTimeout(r, 800))
    const result = loginWithEmail(email, password)
    setLoading(false)
    if (result.success) { setSuccess(true); setTimeout(() => navigate('/'), 1200) }
    else setError(result.error)
  }

  return (
    <div className={styles.scene}>
      {/* Brand swoosh lines */}
      <div className={styles.swooshWrap}>
        <svg className={styles.swooshSvg} viewBox="0 0 900 900" fill="none">
          <path className={`${styles.swoosh} ${styles.s1}`} d="M 900 200 C 700 200, 500 400, 300 500 C 150 570, 50 620, -50 700" stroke="#4BAE8A" strokeWidth="28" strokeLinecap="round"/>
          <path className={`${styles.swoosh} ${styles.s2}`} d="M 900 280 C 680 280, 480 460, 280 560 C 130 630, 20 670, -80 750" stroke="#1C9FD4" strokeWidth="28" strokeLinecap="round"/>
          <path className={`${styles.swoosh} ${styles.s3}`} d="M 900 360 C 660 360, 460 520, 260 620 C 110 690, -10 720, -110 800" stroke="#1F3C84" strokeWidth="28" strokeLinecap="round"/>
          <path className={`${styles.swoosh} ${styles.s4}`} d="M 900 440 C 640 440, 440 580, 240 680 C 90 750, -30 770, -130 850" stroke="#5BB8D4" strokeWidth="22" strokeLinecap="round" opacity="0.6"/>
        </svg>
      </div>
      <div className={styles.grid} />

      {!success ? (
        <div className={styles.card}>

          {/* LOGO SECTION — white pill so dark logo is visible */}
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
          <p className={styles.sub}>Sign in with your Leverage Edu account to access your dashboards.</p>

          {error && (
            <div className={styles.error}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="6.5" stroke="#EF4444"/>
                <path d="M7 4v3.5M7 9.5v.5" stroke="#EF4444" strokeLinecap="round"/>
              </svg>
              {error}
            </div>
          )}

          <div className={styles.googleWrap}>
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => setError('Google sign-in failed. Please try again.')}
              theme="filled_black"
              shape="rectangular"
              size="large"
              width="360"
              text="continue_with"
              hosted_domain="leverageedu.com"
            />
          </div>

          <div className={styles.divider}><span>or sign in with email</span></div>

          <form onSubmit={handleEmailLogin}>
            <div className={styles.field}>
              <label>Work Email</label>
              <input type="email" placeholder="you@leverageedu.com" value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                autoComplete="email" required />
            </div>
            <div className={styles.field}>
              <label>Password</label>
              <div className={styles.passWrap}>
                <input type={showPass ? 'text' : 'password'} placeholder="••••••••••" value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }}
                  autoComplete="current-password" required />
                <button type="button" className={styles.eye} onClick={() => setShowPass(v => !v)}>
                  {showPass
                    ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
            </div>
            <button type="submit" className={styles.submit} disabled={loading}>
              {loading ? <span className={styles.spinner} /> : 'Sign in →'}
            </button>
          </form>

          <p className={styles.footer}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <rect x="1" y="5" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M3.5 5V3.5a2.5 2.5 0 015 0V5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            Restricted to leverageedu.com accounts only
          </p>
        </div>
      ) : (
        <div className={styles.successCard}>
          <div className={styles.successIcon}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#4BAE8A" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h2 className={styles.heading}>You're in!</h2>
          <p className={styles.sub}>Redirecting to your dashboards…</p>
        </div>
      )}
    </div>
  )
}
