import React, { useState, useEffect } from 'react'
import Button from '../components/Button'
import Dropdown from '../components/Dropdown'
import { SlackIcon } from '../components/icons/BrandIcons'
import { fetchT } from '../lib/fetchT'
import styles from './SettingsPage.module.css'

// Settings > Reports > Slack (2026-08-27, corrected same day): renders INLINE
// inside SettingsPage's own shell -- see ReportsEmailPage.jsx's header
// comment for the full correction. This is content, not a page: no Sidebar,
// no target=_blank, the Data/BigQuery/User Access/... tab bar stays fixed
// above it the whole time.
//
// Scoped deliberately: the CEO-locked-channel + PIN gate + B2C approval-
// destination flow is NOT moved here yet -- it's a real security surface
// and rushing that move risks breaking it silently. It still lives, working
// and untouched, on the old Reports tab content for now.

export default function ReportsSlackPage({ onBack }) {
  const [loading, setLoading] = useState(true)
  const [channelMain, setChannelMain] = useState('')
  const [testChannels, setTestChannels] = useState([])
  const [auto, setAuto] = useState(true)
  const [allChannels, setAllChannels] = useState(null)
  const [channelsErr, setChannelsErr] = useState('')
  const [channelsLoading, setChannelsLoading] = useState(false)
  const [picker, setPicker] = useState(null)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testPick, setTestPick] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    fetchT('/api/preferences', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        const pf = data.prefs || {}
        if (pf.slack_channel_main != null) setChannelMain(pf.slack_channel_main)
        if (pf.slack_test_channels) setTestChannels(pf.slack_test_channels)
        if (pf.slack_auto_reports_enabled != null) setAuto(pf.slack_auto_reports_enabled !== false)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
    loadChannels()
  }, [])

  const loadChannels = () => {
    setChannelsLoading(true); setChannelsErr('')
    fetchT('/api/send-report?type=slack_channel_list', { credentials: 'include' })
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => { if (ok) setAllChannels(j.channels); else setChannelsErr(j.error || 'Could not load channels') })
      .catch(e => setChannelsErr(e.message))
      .finally(() => setChannelsLoading(false))
  }

  const save = async () => {
    setSaving(true); setMsg('')
    try {
      const entries = [
        ['slack_channel_main', channelMain.trim()],
        ['slack_test_channels', testChannels.filter(c => c.name.trim() && c.channel.trim())],
        ['slack_auto_reports_enabled', auto],
      ]
      for (const [key, value] of entries) {
        const r = await fetchT('/api/preferences', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, value }) })
        if (!r.ok) throw new Error('Failed to save ' + key)
      }
      setMsg('Saved ✓')
    } catch (e) { setMsg('✕ ' + e.message) }
    finally { setSaving(false); setTimeout(() => setMsg(''), 5000) }
  }

  const sendTest = async () => {
    setTesting(true); setMsg('')
    try {
      const pick = testPick || (testChannels[0] && testChannels[0].id) || ''
      const r = await fetchT('/api/send-report', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'slack_test', slackTarget: pick ? 'test:' + pick : 'test' }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed')
      setMsg(`Posted to ${d.channel || 'the test channel'} ✓`)
    } catch (e) { setMsg('✕ ' + e.message) }
    finally { setTesting(false); setTimeout(() => setMsg(''), 6000) }
  }

  const pickChannel = (chan) => {
    if (picker === 'main') setChannelMain(chan.id)
    else if (picker === 'new') {
      const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 't_' + Math.random().toString(36).slice(2)
      setTestChannels(list => [...list, { id, name: newName.trim() || chan.name, channel: chan.id }])
      setNewName('')
    }
    setPicker(null)
  }

  const ChannelBrowser = () => (
    <div className={styles.dsModalOverlay} onClick={() => setPicker(null)}>
      <div className={styles.dsModal} style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <h3 className={styles.cardTitle} style={{ marginBottom: 4 }}>Every channel the bot can see</h3>
        <p className={styles.cardDesc} style={{ margin: '0 0 12px' }}>Public channels always appear here. A private one needs the bot invited to it and the app's <code>groups:read</code> scope.</p>
        {channelsLoading && <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Loading…</p>}
        {channelsErr && <p style={{ fontSize: 12.5, color: 'var(--brand-ink)' }}>{channelsErr} <button onClick={loadChannels} style={{ background: 'none', border: 'none', color: 'var(--navy)', cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}>Retry</button></p>}
        {allChannels && (
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {allChannels.map(c => (
              <button key={c.id} onClick={() => pickChannel(c)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '8px 10px', border: 'none', background: 'none', cursor: 'pointer', borderRadius: 8, fontFamily: 'inherit' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                <span style={{ color: 'var(--text-3)', fontWeight: 700 }}>#</span>
                <span style={{ flex: 1, fontSize: 13, fontFamily: 'ui-monospace,monospace' }}>{c.name}</span>
                {c.isPrivate && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)' }}>private</span>}
                {!c.isMember && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--brand-ink)' }}>not invited</span>}
              </button>
            ))}
            {!allChannels.length && <p style={{ fontSize: 12.5, color: 'var(--text-3)' }}>No channels visible to this bot token yet.</p>}
          </div>
        )}
        <div className={styles.dsModalActions}><Button size="sm" variant="secondary" onClick={() => setPicker(null)}>Close</Button></div>
      </div>
    </div>
  )

  return (
    <>
      <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 12.5, fontWeight: 700, padding: 0, marginBottom: 14 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        Back to Reports
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <span style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><SlackIcon size={22} /></span>
        <h2 style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.01em', margin: 0, color: 'var(--text)' }}>Slack</h2>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 18px' }}>Posts as @pm_analyst · CEO-locked channels are managed on the Reports tab for now</p>

      {loading ? <p style={{ color: 'var(--text-3)', fontSize: 13 }}>Loading…</p> : (
        <>
          <div className={styles.card}>
            <div className={styles.activityHeader}>
              <div>
                <h3 className={styles.cardTitle}>Team channel</h3>
                <p className={styles.cardDesc} style={{ margin: 0 }}>The whole team reads this one.</p>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700, color: 'var(--text-2)', cursor: 'pointer' }}>
                <input type="checkbox" className={styles.premToggle} checked={auto} onChange={e => setAuto(e.target.checked)} />
                Auto-post summaries {auto ? 'on' : 'off'}
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className={styles.input} value={channelMain} onChange={e => setChannelMain(e.target.value)} placeholder="Channel ID, e.g. C0B52AJS0TU" style={{ flex: 1 }} />
              <Button size="sm" variant="secondary" onClick={() => setPicker('main')}>Browse channels</Button>
            </div>
          </div>

          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Test channels</h3>
            <p className={styles.cardDesc} style={{ margin: '0 0 10px' }}>Used when something posts to "test" without a specific channel picked, and named for the Send-to-Slack picker elsewhere.</p>
            {testChannels.map((c, i) => (
              <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <input className={styles.input} value={c.name} onChange={e => setTestChannels(list => list.map(x => x.id === c.id ? { ...x, name: e.target.value } : x))} placeholder="Name" style={{ width: 160 }} />
                <input className={styles.input} value={c.channel} onChange={e => setTestChannels(list => list.map(x => x.id === c.id ? { ...x, channel: e.target.value } : x))} placeholder="Channel ID" style={{ flex: 1 }} />
                {i === 0 && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--navy)', background: 'var(--navy-tint)', padding: '3px 8px', borderRadius: 999 }}>DEFAULT</span>}
                <button onClick={() => setTestChannels(list => list.filter(x => x.id !== c.id))} aria-label="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 16 }}>×</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <input className={styles.input} value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name" style={{ width: 160 }} />
              <Button size="sm" variant="secondary" onClick={() => setPicker('new')} disabled={!newName.trim()}>+ Add from channel list</Button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Button size="sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
            {testChannels.length > 1 && (
              <Dropdown value={(testChannels.find(c => c.id === testPick) || testChannels[0]).name} onChange={label => setTestPick(testChannels.find(c => c.name === label)?.id || '')}
                options={testChannels.map(c => c.name)} minWidth={140} />
            )}
            <Button size="sm" variant="secondary" onClick={sendTest} disabled={testing}>{testing ? 'Sending…' : 'Send a test'}</Button>
            {msg && <span style={{ fontSize: 12, fontWeight: 700, color: msg.startsWith('✕') ? 'var(--brand-ink)' : '#178A54' }}>{msg}</span>}
          </div>

          <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 8 }}>
            CEO-locked channels, the PIN, and B2C approval routing are still on the old Reports tab (below) while that security-sensitive flow gets migrated separately.
          </p>
        </>
      )}
      {picker && <ChannelBrowser />}
    </>
  )
}
