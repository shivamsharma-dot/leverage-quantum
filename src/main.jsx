import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { AuthProvider } from './hooks/useAuth'
import App from './App'
import './index.css'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'YOUR_CLIENT_ID'

// Vite code-splits each page into its own hashed JS chunk. When a new deploy
// goes out while a tab is already open, that tab's in-memory bundle still
// references the OLD chunk filenames, which no longer exist on the server.
// Navigating to a not-yet-loaded page then throws "Failed to fetch dynamically
// imported module". Vite emits this as a 'vite:preloadError' event -- the fix
// is to just reload once so the browser picks up the latest deployed assets.
window.addEventListener('vite:preloadError', () => {
    window.location.reload()
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </GoogleOAuthProvider>
  </React.StrictMode>
)
