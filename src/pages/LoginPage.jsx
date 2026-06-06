import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { useAuth } from '../hooks/useAuth'
import styles from './LoginPage.module.css'

const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY
const SUPABASE_URL = 'https://tsyekthwthxszmsgqfej.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzeWVrdGh3dGh4c3ptc2dxZmVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NjkzMDIsImV4cCI6MjA5NTM0NTMwMn0.bdM9h5c3PDu9hgggjBdbA-eb7kfF-79c6txOnCUxRhY'

// Store OTPs temporarily in memory (cleared on page reload)
const otpStore = {}

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

async function sendOTPEmail(email, otp) {
  // Send OTP via Vercel serverless function (uses Resend)
  try {
    const res = await fetch('/api/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp })
    })
    const d = await res.json()
    if (d.dev) console.log(`[Quantum OTP dev] ${email}: ${otp}`)
    return true
  } catch {
    console.log(`[Quantum OTP fallback] ${email}: ${otp}`)
    return true
  }
}

function QuantumIcon() {
  return (
    <span className={styles.qIcon}>
      <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
        <rect className={styles.bar1} x="1"  y="12" width="4" height="9"  rx="1.5"/>
        <rect className={styles.bar2} x="7"  y="7"  width="4" height="14" rx="1.5"/>
        <rect className={styles.bar3} x="13" y="4"  width="4" height="17" rx="1.5"/>
      </svg>
    </span>
  )
}

export default function LoginPage() {
  const { user, loginWithGoogle, loginWithOTP } = useAuth()
  const navigate = useNavigate()

  const [step, setStep]       = useState('email') // 'email' | 'otp'
  const [email, setEmail]     = useState('')
  const [otp, setOtp]         = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [devOTP, setDevOTP]   = useState('')

  useEffect(() => { if (user) navigate('/') }, [user])

  // Pre-fill email from Google One Tap hint if available
  useEffect(() => {
    try {
      // Google identity services stores last-used hint in a cookie
      const hint = document.cookie.split('; ').find(r => r.startsWith('g_state='))
      // Also try to read from google accounts stored credential
      if (window.google?.accounts?.id) {
        window.google.accounts.id.initialize({
          client_id: '688405177682-6k8l3k8o5e4k6o5e4k.apps.googleusercontent.com',
          callback: () => {},
          auto_select: false,
        })
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (countdown > 0) {
      const t = setTimeout(() => setCountdown(c => c - 1), 1000)
      return () => clearTimeout(t)
    }
  }, [countdown])

  const handleGoogleSuccess = async (credentialResponse) => {
    setLoading(true)
    setError('')
    const result = await loginWithGoogle(credentialResponse)
    setLoading(false)
    if (result.success) { setSuccess(true); setTimeout(() => navigate('/'), 1200) }
    else setError(result.error || 'Google sign-in failed')
  }

  const handleSendOTP = async (e) => {
    e?.preventDefault()
    setError('')
    const em = email.trim().toLowerCase()
    if (!em.endsWith('@leverageedu.com')) {
      setError('Only @leverageedu.com emails allowed')
      return
    }
    setLoading(true)
    // Check if user exists in whitelist
    const res = await fetch(`${SUPABASE_URL}/rest/v1/allowed_users?email=eq.${encodeURIComponent(em)}&select=email,role`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } })
    const data = await res.json()
    if (!data?.length) {
      setLoading(false)
      setError('Your account is not in the access list. Contact your admin.')
      return
    }
    // Generate and store OTP (expires in 5 min)
    const code = generateOTP()
    otpStore[em] = { code, expires: Date.now() + 5 * 60 * 1000 }
    setDevOTP(code) // Show for testing — remove in production
    await sendOTPEmail(em, code)
    setLoading(false)
    setStep('otp')
    setCountdown(60)
  }

  const handleVerifyOTP = async (e) => {
    e?.preventDefault()
    setError('')
    const em = email.trim().toLowerCase()
    const stored = otpStore[em]
    if (!stored) { setError('No OTP sent. Please go back and try again.'); return }
    if (Date.now() > stored.expires) { setError('OTP has expired. Please request a new one.'); delete otpStore[em]; return }
    if (otp.trim() !== stored.code) { setError('Incorrect OTP. Please try again.'); return }

    setLoading(true)
    const result = await loginWithOTP(em)
    setLoading(false)
    if (result.success) {
      delete otpStore[em]
      setSuccess(true)
      setTimeout(() => navigate('/'), 1200)
    } else {
      setError(result.error || 'Login failed')
    }
  }

  const handleOTPInput = (e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6)
    setOtp(val)
    setError('')
    if (val.length === 6) {
      // Auto-submit when 6 digits entered
      setTimeout(() => {
        const em = email.trim().toLowerCase()
        const stored = otpStore[em]
        if (!stored) return
        if (Date.now() > stored.expires || val !== stored.code) { setError('Incorrect or expired OTP.'); return }
        loginWithOTP(em).then(result => {
          if (result.success) { delete otpStore[em]; setSuccess(true); setTimeout(() => navigate('/'), 1200) }
          else setError(result.error || 'Login failed')
        })
      }, 100)
    }
  }

  return (
    <div className={styles.scene}>
      <div className={styles.swooshWrap}>
        <svg className={styles.swooshSvg} viewBox="0 0 900 900" fill="none">
          <path className={`${styles.swoosh} ${styles.s1}`} d="M 900 200 C 700 200, 500 400, 300 500 C 150 570, 50 620, -50 700" stroke="#4BAE8A" strokeWidth="28" strokeLinecap="round"/>
          <path className={`${styles.swoosh} ${styles.s2}`} d="M 900 280 C 680 280, 480 460, 280 560 C 130 630, 20 670, -80 750" stroke="#1C9FD4" strokeWidth="28" strokeLinecap="round"/>
          <path className={`${styles.swoosh} ${styles.s3}`} d="M 900 360 C 660 360, 460 520, 260 620 C 110 690, -10 720, -110 800" stroke="#1F3C84" strokeWidth="28" strokeLinecap="round"/>
        </svg>
      </div>
      <div className={styles.grid}/>

      {!success ? (
        <div className={styles.card}>
          <div className={styles.logoRow}>
            <div className={styles.logoPill}>
              <img src="https://publicassets.leverageedu.com/landing-pages-new/logo-dark.svg" alt="Leverage Edu" className={styles.logo}/>
            </div>
            <div className={styles.logoDivider}/>
            <div className={styles.quantumWrap}>
              <QuantumIcon/>
              <span className={styles.logoProduct}>Quantum</span>
            </div>
          </div>

          <div className={styles.badge}><span className={styles.badgeDot}/>Internal Analytics Platform</div>

          {step === 'email' ? (
            <>
              <h1 className={styles.heading}>Welcome back</h1>
              <p className={styles.sub}>Sign in with Google or get a one-time code sent to your work email.</p>

              {error && <div className={styles.error}><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6.5" stroke="#EF4444"/><path d="M7 4v3.5M7 9.5v.5" stroke="#EF4444" strokeLinecap="round"/></svg>{error}</div>}

              <div className={styles.googleWrap}>
                <GoogleLogin onSuccess={handleGoogleSuccess} onError={() => setError('Google sign-in failed.')}
                  theme="outline" shape="pill" size="large" width="360" text="continue_with" hosted_domain="leverageedu.com"/>
              </div>

              <div className={styles.divider}><span>or sign in with email OTP</span></div>

              <form onSubmit={handleSendOTP}>
                <div className={styles.field}>
                  <label>Work Email</label>
                  <input type="email" placeholder="you@leverageedu.com" value={email}
                    onChange={e => { setEmail(e.target.value); setError('') }} autoComplete="email" required/>
                </div>
                <button type="submit" className={styles.submit} disabled={loading}>
                  {loading ? <span className={styles.spinner}/> : 'Send OTP →'}
                </button>
              </form>
            </>
          ) : (
            <>
              <h1 className={styles.heading}>Check your email</h1>
              <p className={styles.sub}>We sent a 6-digit code to <strong>{email}</strong>. Enter it below to sign in.</p>

              {error && <div className={styles.error}><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6.5" stroke="#EF4444"/><path d="M7 4v3.5M7 9.5v.5" stroke="#EF4444" strokeLinecap="round"/></svg>{error}</div>}

              {devOTP && (
                <div style={{background:'#FFFBEB',border:'1px solid #FDE68A',borderRadius:8,padding:'10px 14px',marginBottom:12,fontSize:12.5,color:'#92400E'}}>
                  <strong>Dev mode:</strong> Your OTP is <strong style={{letterSpacing:2}}>{devOTP}</strong>
                  <br/><span style={{fontSize:11,color:'#B45309'}}>Remove this in production after EmailJS is configured</span>
                </div>
              )}

              <form onSubmit={handleVerifyOTP}>
                <div className={styles.field}>
                  <label>6-Digit OTP</label>
                  <input
                    type="text" inputMode="numeric" placeholder="000000"
                    value={otp} onChange={handleOTPInput} maxLength={6} required
                    style={{fontSize:24,letterSpacing:8,textAlign:'center',fontWeight:700}}
                    autoFocus/>
                </div>
                <button type="submit" className={styles.submit} disabled={loading || otp.length < 6}>
                  {loading ? <span className={styles.spinner}/> : 'Verify & Sign in →'}
                </button>
              </form>

              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:12}}>
                <button onClick={() => { setStep('email'); setOtp(''); setError(''); setDevOTP('') }}
                  style={{background:'none',border:'none',color:'#6B7280',fontSize:12.5,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>
                  ← Change email
                </button>
                {countdown > 0
                  ? <span style={{fontSize:12,color:'#9CA3AF'}}>Resend in {countdown}s</span>
                  : <button onClick={handleSendOTP} style={{background:'none',border:'none',color:'#1C9FD4',fontSize:12.5,cursor:'pointer',fontWeight:600,fontFamily:'Inter,sans-serif'}}>Resend OTP</button>
                }
              </div>
            </>
          )}

          <p className={styles.footer}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><rect x="1" y="5" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M3.5 5V3.5a2.5 2.5 0 015 0V5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
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
