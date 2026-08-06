import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import LoginScene from '../components/LoginScene'

export default function LoginPage() {
  const { user, loginWithGoogle } = useAuth()
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
      success={success}
      loading={loading}
      error={error}
      gsiWidth={gsiWidth}
      onGoogleSuccess={handleGoogleSuccess}
      onGoogleError={() => setError('Google sign-in failed. Please try again.')}
    />
  )
}
