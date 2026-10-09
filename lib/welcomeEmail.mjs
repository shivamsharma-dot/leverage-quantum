// Welcome email for a newly added Quantum user. Same visual skeleton as
// buildChatAnswerEmail in api/send-report.mjs (4-block accent stripe, logo tile,
// white card, grey footer) -- see shared/brandLogo.mjs for the logo literals.
import { PAGE_LIST } from '../src/lib/pageList.js'

const NAVY = '#1F3C84', BLUE = '#1C9FD4', CYAN = '#29B9C3', GREEN = '#4CAE6F'
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"
export const QUANTUM_URL = 'https://quantum.leverageedu.com'

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function firstNameFromEmail(email) {
  const local = String(email || '').split('@')[0].split(/[._-]/)[0] || 'there'
  return local.charAt(0).toUpperCase() + local.slice(1).toLowerCase()
}

// role: 'admin' | 'viewer' | 'viewer:id1,id2'
export function accessSummary(role) {
  const r = String(role || 'viewer')
  if (r === 'admin') return { title: 'Admin', blurb: 'Full access to every dashboard and to Settings.', chips: [] }
  if (r.startsWith('viewer:')) {
    const ids = r.slice(7).split(',').map(s => s.trim()).filter(Boolean)
    const chips = ids.map(id => (PAGE_LIST.find(p => p.id === id) || {}).label).filter(Boolean)
    return { title: 'Viewer', blurb: 'You can open these dashboards:', chips }
  }
  return { title: 'Viewer', blurb: 'You can open every standard dashboard. Admin-only pages and Settings stay hidden.', chips: [] }
}

export function buildWelcomeEmail({ email, role, addedBy, jobTitle }) {
  const name = firstNameFromEmail(email)
  const acc = accessSummary(role)
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  const chips = acc.chips.map(c =>
    `<span style="display:inline-block;margin:0 6px 6px 0;padding:5px 11px;border-radius:20px;background-color:#EEF4FB;border:1px solid #DCE7F5;font-size:12px;font-weight:600;color:${NAVY}">${esc(c)}</span>`).join('')
  const step = (n, t) => `<tr>
    <td valign="top" style="padding:0 12px 12px 0"><div style="width:24px;height:24px;border-radius:12px;background-color:${NAVY};color:#ffffff;font-size:12px;font-weight:700;line-height:24px;text-align:center">${n}</div></td>
    <td valign="top" style="padding:2px 0 12px;font-size:14px;line-height:1.55;color:#334155">${t}</td></tr>`
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><meta name="color-scheme" content="light">
<title>Welcome to Leverage Quantum</title></head>
<body style="margin:0;padding:0;background-color:#F4F6F9;font-family:${FONT};color:#0F172A;-webkit-font-smoothing:antialiased">
<div style="margin:0;padding:32px 12px;background-color:#F4F6F9">
<div style="max-width:600px;margin:0 auto">

  <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:20px 20px 0 0;overflow:hidden">
    <tr>
      <td width="25%" style="background-color:${NAVY};font-size:0;line-height:0;height:5px">&nbsp;</td>
      <td width="25%" style="background-color:${BLUE};font-size:0;line-height:0;height:5px">&nbsp;</td>
      <td width="25%" style="background-color:${CYAN};font-size:0;line-height:0;height:5px">&nbsp;</td>
      <td width="25%" style="background-color:${GREEN};font-size:0;line-height:0;height:5px">&nbsp;</td>
    </tr>
  </table>

  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;box-shadow:0 24px 60px -24px rgba(15,23,42,0.18);border-left:1px solid #EEF1F6;border-right:1px solid #EEF1F6">
    <tr><td style="padding:32px 36px 24px">

      <table cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:middle;padding-right:12px">
          <table cellpadding="0" cellspacing="0" style="background-color:#ffffff;border:1px solid #EEF1F6;border-radius:10px;box-shadow:0 3px 10px rgba(15,23,42,0.10)">
            <tr><td style="padding:9px 11px">
              <table cellpadding="0" cellspacing="0"><tr>
                <td valign="bottom" style="padding-right:2px"><div style="width:4px;height:9px;background-color:${GREEN};border-radius:1.5px;font-size:0;line-height:0">&nbsp;</div></td>
                <td valign="bottom" style="padding-right:2px"><div style="width:4px;height:14px;background-color:${BLUE};border-radius:1.5px;font-size:0;line-height:0">&nbsp;</div></td>
                <td valign="bottom"><div style="width:4px;height:17px;background-color:${NAVY};border-radius:1.5px;font-size:0;line-height:0">&nbsp;</div></td>
              </tr></table>
            </td></tr>
          </table>
        </td>
        <td style="vertical-align:middle">
          <div style="font-size:16px;font-weight:800;color:${NAVY};letter-spacing:.02em;line-height:1.2">Leverage Quantum</div>
        </td>
      </tr></table>

      <div style="margin-top:22px">
        <span style="display:inline-block;padding:4px 11px;border-radius:20px;background-color:#EAF7EE;font-size:10px;font-weight:700;color:#2D8659;letter-spacing:.08em;text-transform:uppercase">Welcome</span>
      </div>
      <div style="font-size:22px;font-weight:800;color:#0F172A;letter-spacing:-.01em;line-height:1.35;margin:12px 0 6px">You now have access to Leverage Quantum</div>
      <div style="font-size:12.5px;color:#94A3B8">Added by <span style="color:#64748B;font-weight:600">${esc(addedBy || 'an admin')}</span> &middot; ${today}</div>

    </td></tr>

    <tr><td style="padding:0 36px"><div style="height:1px;background-color:#EEF1F6"></div></td></tr>

    <tr><td style="padding:24px 36px 8px">
      <div style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 14px">Hi ${esc(name)},</div>
      <div style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 20px">Quantum is Leverage's internal analytics hub. Marketing performance, lead qualification, applications and business numbers sit in one place, with the same definitions everywhere.</div>

      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F8FAFC;border:1px solid #EEF1F6;border-radius:14px">
        <tr><td style="padding:16px 18px">
          <div style="font-size:10px;font-weight:700;color:#94A3B8;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px">Your access${jobTitle ? ' &middot; ' + esc(jobTitle) : ''}</div>
          <div style="font-size:16px;font-weight:800;color:${NAVY};margin-bottom:4px">${acc.title}</div>
          <div style="font-size:13.5px;line-height:1.55;color:#475569;margin-bottom:${chips ? '12px' : '0'}">${acc.blurb}</div>
          ${chips ? `<div>${chips}</div>` : ''}
        </td></tr>
      </table>
    </td></tr>

    <tr><td style="padding:24px 36px 4px;text-align:center">
      <a href="${QUANTUM_URL}" style="display:inline-block;padding:13px 30px;border-radius:12px;background-color:${NAVY};color:#ffffff;font-size:14.5px;font-weight:700;text-decoration:none;letter-spacing:.01em">Open Leverage Quantum</a>
      <div style="font-size:12px;color:#94A3B8;margin-top:10px">${QUANTUM_URL.replace('https://', '')}</div>
    </td></tr>

    <tr><td style="padding:22px 36px 28px">
      <div style="font-size:10px;font-weight:700;color:#94A3B8;letter-spacing:.08em;text-transform:uppercase;margin-bottom:12px">How to sign in</div>
      <table cellpadding="0" cellspacing="0" width="100%">
        ${step(1, 'Open the link above.')}
        ${step(2, 'Click <b>Sign in with Google</b> and choose your <b>@leverageedu.com</b> account. If your account is outside the company, use <b>Send me a link</b> instead and open the email we send.')}
        ${step(3, 'You stay signed in for 8 hours. On your phone, use <b>Add to Home Screen</b> to keep Quantum one tap away.')}
      </table>
      <div style="font-size:13px;line-height:1.55;color:#64748B;margin-top:4px">Cannot see a page you need, or something looks wrong? Reply to the person who added you, or write to <a href="mailto:shivam.sharma@leverageedu.com" style="color:${BLUE};text-decoration:none;font-weight:600">shivam.sharma@leverageedu.com</a>.</div>
    </td></tr>
  </table>

  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F8FAFC;border-radius:0 0 20px 20px;border:1px solid #EEF1F6;border-top:none">
    <tr><td style="padding:16px 36px;text-align:center">
      <span style="font-size:10.5px;color:#94A3B8">Leverage Quantum &middot; ${today} &middot; Do not reply</span>
    </td></tr>
  </table>

</div>
</div>
</body>
</html>`
}
