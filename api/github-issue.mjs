import { getSessionUser } from '../lib/auth.mjs'

const REPO = 'shivamsharma-dot/leverage-quantum'

// Files a GitHub Issue from the in-app "Report an issue" button (ReportIssueButton.jsx).
// Requires GITHUB_ISSUE_TOKEN in Vercel env (a fine-grained PAT scoped to just this repo,
// Issues: Read and write) -- kept server-side since it's a write-capable secret, unlike
// the anon Supabase key or the public GitHub commits API used elsewhere in this app.
export default async function handler(req, res) {
  const me = getSessionUser(req)
  if (!me) return res.status(401).json({ error: 'Not signed in' })
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { description, page, url } = req.body || {}
  if (!description || !String(description).trim()) {
    return res.status(400).json({ error: 'Description is required' })
  }

  const token = process.env.GITHUB_ISSUE_TOKEN
  if (!token) {
    return res.status(500).json({ error: 'Issue reporting is not configured (missing GITHUB_ISSUE_TOKEN)' })
  }

  const trimmed = String(description).trim()
  const title = 'User report: ' + trimmed.slice(0, 70).replace(/\s+/g, ' ')
  const body = [
    trimmed,
    '',
    '---',
    'Reported by: ' + me.email,
    'Page: ' + (page || 'unknown'),
    'URL: ' + (url || 'unknown'),
    'Time: ' + new Date().toISOString(),
  ].join('\n')

  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'leverage-quantum-app',
      },
      body: JSON.stringify({ title, body, labels: ['user-report'] }),
    })
    const data = await r.json()
    if (!r.ok) return res.status(500).json({ error: data.message || 'GitHub API error' })
    return res.status(200).json({ success: true, issueUrl: data.html_url, number: data.number })
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) })
  }
}
