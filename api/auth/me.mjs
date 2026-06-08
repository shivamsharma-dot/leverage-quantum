import { getSessionUser } from '../../lib/auth.mjs'

export default function handler(req, res) {
  const user = getSessionUser(req)
  if (!user) return res.status(401).json({ user: null })
  return res.status(200).json({
    user: { email: user.email, name: user.name, picture: user.picture, role: user.role },
  })
}
