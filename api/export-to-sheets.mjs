import { JWT } from 'google-auth-library'
import { getSessionUser } from '../lib/auth.mjs'

// Creates a real Google Sheet from any export-shaped dataset (array of flat objects,
// same shape the CSV/JSON export already uses) via a dedicated service account --
// separate from the app's login OAuth client, which only has profile/email scope.
// Requires GOOGLE_SHEETS_CLIENT_EMAIL + GOOGLE_SHEETS_PRIVATE_KEY in Vercel env.
export default async function handler(req, res) {
  const me = getSessionUser(req)
  if (!me) return res.status(401).json({ error: 'Not signed in' })
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { rows, filename } = req.body || {}
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'No data to export' })
  }

  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL
  const privateKey = (process.env.GOOGLE_SHEETS_PRIVATE_KEY || '').replace(/\\n/g, '\n')
  if (!clientEmail || !privateKey) {
    return res.status(500).json({ error: 'Google Sheets export is not configured (missing GOOGLE_SHEETS_CLIENT_EMAIL/GOOGLE_SHEETS_PRIVATE_KEY)' })
  }

  try {
    const auth = new JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.file'],
    })
    const { access_token } = await auth.authorize()

    const title = (filename || 'export') + '_' + new Date().toISOString().slice(0, 10)
    const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties: { title } }),
    })
    const created = await createRes.json()
    if (!createRes.ok) return res.status(500).json({ error: created.error?.message || 'Failed to create spreadsheet' })
    const spreadsheetId = created.spreadsheetId

    const cols = Object.keys(rows[0])
    const values = [cols, ...rows.map(r => cols.map(c => r[c] ?? ''))]
    const updateRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1?valueInputOption=RAW`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values }),
      }
    )
    if (!updateRes.ok) {
      const e = await updateRes.json()
      return res.status(500).json({ error: e.error?.message || 'Failed to write data' })
    }

    // Service account owns the file by default -- share it with the requesting user so they can actually open/edit it.
    await fetch(`https://www.googleapis.com/drive/v3/files/${spreadsheetId}/permissions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'writer', type: 'user', emailAddress: me.email }),
    })

    return res.status(200).json({ success: true, url: created.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` })
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) })
  }
}
