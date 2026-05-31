export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { email, otp } = req.body || {}
  if (!email || !otp) return res.status(400).json({ error: 'Missing email or otp' })

  // Only allow leverageedu.com emails
  if (!email.endsWith('@leverageedu.com')) {
    return res.status(403).json({ error: 'Unauthorized domain' })
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY

  if (!RESEND_API_KEY) {
    // No API key configured — return success anyway (OTP shown in dev banner)
    console.log(`[OTP] ${email}: ${otp}`)
    return res.status(200).json({ ok: true, dev: true })
  }

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Quantum <noreply@leverageedu.com>',
        to: [email],
        subject: `Your Quantum login code: ${otp}`,
        html: `
          <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fff">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px">
              <img src="https://publicassets.leverageedu.com/landing-pages-new/logo-dark.svg" height="24" alt="Leverage Edu"/>
              <span style="font-size:14px;font-weight:700;color:#0F172A;border-left:1px solid #E5E7EB;padding-left:10px;margin-left:4px">Quantum</span>
            </div>
            <h2 style="font-size:22px;font-weight:700;color:#0F172A;margin:0 0 8px">Your login code</h2>
            <p style="font-size:14px;color:#6B7280;margin:0 0 24px">Use this code to sign in to Leverage Quantum. It expires in 5 minutes.</p>
            <div style="background:#F8FAFF;border:1.5px solid #E0E7FF;border-radius:10px;padding:20px;text-align:center;margin-bottom:24px">
              <span style="font-size:36px;font-weight:800;letter-spacing:10px;color:#0F172A">${otp}</span>
            </div>
            <p style="font-size:12px;color:#9CA3AF;margin:0">If you didn't request this, you can safely ignore this email.</p>
          </div>
        `
      })
    })

    const data = await r.json()
    if (!r.ok) throw new Error(data.message || 'Send failed')
    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error('OTP send failed:', e.message)
    // Still return 200 — OTP shown in dev banner as fallback
    return res.status(200).json({ ok: true, dev: true, error: e.message })
  }
}
