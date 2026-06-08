import { clearCookie } from '../../lib/auth.mjs'

export default function handler(req, res) {
  res.setHeader('Set-Cookie', clearCookie())
  return res.status(200).json({ success: true })
}
