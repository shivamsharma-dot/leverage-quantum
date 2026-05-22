import { useState, useEffect, createContext, useContext } from 'react'
import { jwtDecode } from 'jwt-decode'

const AuthContext = createContext(null)

const ALLOWED_DOMAIN = 'leverageedu.com'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    // Check if user already logged in (persisted in localStorage)
    try {
      const saved = localStorage.getItem('lq_user')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })

  const loginWithGoogle = (credentialResponse) => {
    try {
      const decoded = jwtDecode(credentialResponse.credential)
      const email = decoded.email || ''

      // Enforce domain restriction
      if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
        throw new Error(`Access denied. Only @${ALLOWED_DOMAIN} accounts are allowed.`)
      }

      const userData = {
        name: decoded.name,
        email: decoded.email,
        picture: decoded.picture,
        token: credentialResponse.credential,
        loginTime: Date.now()
      }

      setUser(userData)
      localStorage.setItem('lq_user', JSON.stringify(userData))
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  const loginWithEmail = (email, password) => {
    // Enforce domain restriction
    if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
      return { success: false, error: `Only @${ALLOWED_DOMAIN} emails are allowed.` }
    }
    if (!password || password.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters.' }
    }

    // For email login, in production you'd call your backend API here
    // For now we create a session with the email
    const userData = {
      name: email.split('@')[0].replace('.', ' '),
      email,
      picture: null,
      token: btoa(email + ':' + Date.now()),
      loginTime: Date.now()
    }

    setUser(userData)
    localStorage.setItem('lq_user', JSON.stringify(userData))
    return { success: true }
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('lq_user')
  }

  return (
    <AuthContext.Provider value={{ user, loginWithGoogle, loginWithEmail, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
