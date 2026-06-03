import { useState, useEffect, useRef } from 'react'

const SUPABASE_URL = 'https://tsyekthwthxszmsgqfej.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzeWVrdGh3dGh4c3ptc2dxZmVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NjkzMDIsImV4cCI6MjA5NTM0NTMwMn0.bdM9h5c3PDu9hgggjBdbA-eb7kfF-79c6txOnCUxRhY'
const HEARTBEAT_MS = 45_000
const ACTIVE_WINDOW = 2 * 60

async function upsertPresence(user) {
  await fetch(`${SUPABASE_URL}/rest/v1/presence`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify({ email: user.email, name: user.name, picture: user.picture || null, last_seen: new Date().toISOString() })
  })
}

async function fetchActive() {
  const since = new Date(Date.now() - ACTIVE_WINDOW * 1000).toISOString()
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/presence?last_seen=gte.${since}&select=email,name,picture,last_seen&order=last_seen.desc`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  )
  if (!res.ok) return []
  return res.json()
}

export function usePresence(user) {
  const [activeUsers, setActiveUsers] = useState([])
  const timerRef = useRef(null)

  useEffect(() => {
    if (!user?.email) return
    const tick = async () => {
      try {
        await upsertPresence(user)
        const users = await fetchActive()
        setActiveUsers(users)
      } catch {}
    }
    tick()
    timerRef.current = setInterval(tick, HEARTBEAT_MS)
    return () => clearInterval(timerRef.current)
  }, [user?.email])

  return activeUsers
}
