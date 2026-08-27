// Extracted from SettingsPage.jsx (2026-08-27) so the Reports > Email/Slack
// pages get the same protection without duplicating it: an offline or
// black-holed request leaves a plain fetch() pending forever, which is how a
// save could sit on "Saving..." with no error and no way back. Every /api/
// call in these pages goes through fetchT so a dead network always surfaces
// as a real message instead of a spinner that never resolves.
export const REQ_TIMEOUT_MS = 20000

export async function fetchT(url, opts = {}, ms = REQ_TIMEOUT_MS) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), ms)
  try {
    return await fetch(url, { ...opts, signal: ac.signal })
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error('The request timed out - check your connection and try again.')
    throw new Error('Network error - check your connection and try again.')
  } finally {
    clearTimeout(timer)
  }
}

export function withTimeout(promise, ms = REQ_TIMEOUT_MS) {
  let timer
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('The request timed out - check your connection and try again.')), ms)
    }),
  ])
}
