import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import LoginScene from '../components/LoginScene'

export default function LoginPage() {
  const { user, loginWithGoogle, requestMagicLink, verifyMagicLink } = useAuth()
  const navigate = useNavigate()

  const [error, setError] = useState('')
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

  // ── Email / magic-link sign-in ──
  const [emailMode, setEmailMode] = useState(false)
  const [magicEmail, setMagicEmail] = useState('')
  const [magicSending, setMagicSending] = useState(false)
  const [magicSent, setMagicSent] = useState(false)
  const [magicMessage, setMagicMessage] = useState('')
  const [verifying, setVerifying] = useState(false)

  // Landed here via the emailed link (?token=...) -- auto-verify and drop
  // them straight in, same as a successful Google sign-in. Strips the token
  // from the URL immediately so a refresh never re-submits it.
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token')
    if (!token) return
    window.history.replaceState({}, '', '/login')
    setVerifying(true)
    verifyMagicLink(token).then((result) => {
      setVerifying(false)
      if (result?.success) {
        setSuccess(true)
        setTimeout(() => navigate('/'), 1200)
      } else {
        setError(result?.error || 'This sign-in link is invalid or has expired.')
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  const handleMagicSubmit = async () => {
    if (!magicEmail.trim()) return
    setError('')
    setMagicSending(true)
    try {
      const result = await requestMagicLink(magicEmail.trim())
      setMagicMessage(result.message)
      if (result.success) {
        setMagicSent(true)
      } else {
        // A genuine network/server failure -- not the same as "email not on
        // the list" (that path always reports success, by design).
        setError(result.message)
      }
    } finally {
      setMagicSending(false)
    }
  }

  return (
    <LoginScene
      success={success}
      loading={loading}
      error={error}
      gsiWidth={gsiWidth}
      onGoogleSuccess={handleGoogleSuccess}
      onGoogleError={() => setError('Google sign-in failed. Please try again.')}
      verifying={verifying}
      emailMode={emailMode}
      onToggleEmailMode={() => { setError(''); setEmailMode((m) => !m) }}
      magicEmail={magicEmail}
      onMagicEmailChange={setMagicEmail}
      onMagicSubmit={handleMagicSubmit}
      magicSending={magicSending}
      magicSent={magicSent}
      magicMessage={magicMessage}
      onMagicReset={() => { setMagicSent(false); setMagicEmail(''); setError('') }}
    />
  )
}
