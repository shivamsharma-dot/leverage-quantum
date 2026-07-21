import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useDesignStyle, applyRemoteDesignStyle } from '../lib/designSettings'
import LoginScene from '../components/LoginScene'

export default function LoginPage() {
  const { user, loginWithGoogle } = useAuth()
  const navigate = useNavigate()
  const variant = useDesignStyle('login')

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

  // Pull the org-wide login style (set by an admin in Settings > Appearance) --
  // unauthenticated at this point, so this hits the whitelisted ?global=1 path
  // rather than the normal session-gated /api/preferences fetch.
  useEffect(() => {
    fetch('/api/preferences?global=1', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => applyRemoteDesignStyle('login', data?.prefs?.lq_login_style))
      .catch(() => {}) // fail silently -- localStorage/default fallback stays
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

  return (
    <LoginScene
      variant={variant}
      success={success}
      loading={loading}
      error={error}
      gsiWidth={gsiWidth}
      onGoogleSuccess={handleGoogleSuccess}
      onGoogleError={() => setError('Google sign-in failed. Please try again.')}
    />
  )
}
