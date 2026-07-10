// One-time-setup helper: Microsoft's OAuth authorize flow redirects here with
// ?code=... after sign-in + consent. This page just displays the code so it can
// be copied — used only during the initial Bing/Microsoft Advertising credential
// setup (exchanging the code for a refresh token). No data is stored or logged
// server-side; the code is echoed back to the browser only.

export default function handler(req, res) {
  const { code, error, error_description } = req.query || {}
  res.setHeader('Content-Type', 'text/html; charset=utf-8')

  if (error) {
    res.status(200).send(`<!doctype html><html><body style="font-family:sans-serif;padding:40px;max-width:640px;margin:0 auto">
      <h2 style="color:#DC2626">OAuth error</h2>
      <p><b>${escapeHtml(error)}</b></p>
      <p>${escapeHtml(error_description || '')}</p>
    </body></html>`)
    return
  }

  if (!code) {
    res.status(200).send(`<!doctype html><html><body style="font-family:sans-serif;padding:40px;max-width:640px;margin:0 auto">
      <h2>No code received</h2>
      <p>This page expects a <code>?code=</code> query parameter from Microsoft's OAuth redirect.</p>
    </body></html>`)
    return
  }

  res.status(200).send(`<!doctype html><html><body style="font-family:-apple-system,sans-serif;padding:40px;max-width:640px;margin:0 auto">
    <h2 style="color:#1F3C84">Authorization code received</h2>
    <p>Copy the value below and send it back (it expires in a few minutes):</p>
    <textarea readonly style="width:100%;height:120px;font-family:monospace;font-size:13px;padding:12px;border:1px solid #ccc;border-radius:8px" onclick="this.select()">${escapeHtml(code)}</textarea>
    <p style="color:#64748B;font-size:13px">This page does not store or transmit this code anywhere — it's only shown to you in this browser tab.</p>
  </body></html>`)
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]))
}
