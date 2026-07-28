import { JWT } from 'google-auth-library'
import { getSessionUser, canAccessDashboard } from '../lib/auth.mjs'

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

  // rawRows is optional: when the caller has both a display-formatted view and the
  // underlying numbers, the formatted one becomes the first tab (reads like the dashboard)
  // and the raw one a second tab (Excel/Sheets can actually sum and sort it, which
  // formatted strings like "₹2,15,05,881" cannot be).
  const { rows, rawRows, filename, dashboardId } = req.body || {}
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'No data to export' })
  }
  // dashboardId is a real PAGE_LIST id sent by ExportButton.jsx. Older/unrecognized
  // callers with no dashboardId fall back to admin-only rather than silently allowing.
  if (!dashboardId ? me.role !== 'admin' : !canAccessDashboard(me.role, dashboardId)) {
    return res.status(403).json({ error: 'Forbidden' })
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

    const hasRaw = Array.isArray(rawRows) && rawRows.length > 0
    const grid = list => {
      const cols = Object.keys(list[0])
      return [cols, ...list.map(r => cols.map(c => (r[c] == null ? '' : r[c])))]
    }

    // Rename the default tab and, when raw values were supplied, add a second one.
    const requests = [{ updateSheetProperties: { properties: { sheetId: 0, title: 'Report' }, fields: 'title' } }]
    if (hasRaw) requests.push({ addSheet: { properties: { title: 'Raw' } } })
    const batchRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests }),
    })
    if (!batchRes.ok) {
      const e = await batchRes.json()
      return res.status(500).json({ error: e.error?.message || 'Failed to prepare sheet tabs' })
    }

    // Formatted goes in as USER_ENTERED so Sheets still recognises percentages and dates;
    // raw goes in as RAW so numbers land as numbers and nothing gets re-interpreted.
    const data = [{ range: 'Report!A1', values: grid(rows) }]
    if (hasRaw) data.push({ range: 'Raw!A1', values: grid(rawRows) })
    const updateRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }),
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
