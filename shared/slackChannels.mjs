// Every Slack channel Quantum can post a report to, in one place.
//
// The API and the Send to Slack panel both read this file, and that is the whole
// point: the panel can never offer a channel the server does not know, the lock
// drawn in the picker is the lock the server actually enforces, and adding a
// channel is one entry here instead of an edit in three files.
//
// guarded   the CEO is in this channel. A send needs an admin, the exact
//           confirmation phrase for that channel, and the CEO PIN.
// pref/env  where the channel id or #name is read from, preference before env.
// fallback  used when neither is set, so a public channel works off its own
//           #name with no environment variable at all.

export const SLACK_CHANNELS = [
  {
    id: 'internal',
    name: 'team-performance-marketing',
    label: 'team channel',
    reads: 'The performance marketing team.',
    pref: 'slack_channel_internal', env: 'SLACK_CHANNEL_INTERNAL',
    altPref: 'slack_channel_main', altEnv: 'SLACK_CHANNEL_MAIN',
    hookPref: 'slack_webhook_url', hookEnv: 'SLACK_WEBHOOK_URL',
  },
  {
    id: 'ceo',
    name: 'performance_mktg_core',
    label: 'CEO channel',
    reads: 'The CEO is in this channel.',
    pref: 'slack_channel_ceo', env: 'SLACK_CHANNEL_CEO',
    guarded: true,
  },
  {
    id: 'b2c_core',
    name: 'b2c-leverage-core',
    label: 'B2C core channel',
    reads: 'The CEO is in this channel.',
    pref: 'slack_channel_b2c_core', env: 'SLACK_CHANNEL_B2C_CORE',
    fallback: '#b2c-leverage-core',
    guarded: true,
  },
]

// Anything unrecognised lands here, which is exactly where it landed before this
// file existed. The scheduler and the older callers rely on that.
export const DEFAULT_CHANNEL_ID = 'internal'

export function slackChannel(id) {
  return SLACK_CHANNELS.filter(function (c) { return c.id === id })[0] || null
}
export function isGuardedChannel(id) {
  const c = slackChannel(id)
  return !!(c && c.guarded)
}
export function channelHandle(id) {
  const c = slackChannel(id)
  return c ? '#' + c.name : String(id || '')
}

// Per channel, so the phrase names the room. Typing SEND TO #b2c-leverage-core is
// a different act from typing SEND TO #performance_mktg_core, and that is exactly
// the mistake the phrase exists to catch. Compared case-insensitively, because
// channel names are lower case and the rest of the phrase is not.
export function confirmPhrase(id) {
  const c = slackChannel(id)
  return c && c.guarded ? 'SEND TO #' + c.name : ''
}
export function phraseMatches(id, typed) {
  const want = confirmPhrase(id)
  if (!want) return false
  return String(typed || '').trim().toLowerCase() === want.toLowerCase()
}
