import React, { useState, useEffect } from 'react'
import Button from '../components/Button'
import Dropdown from '../components/Dropdown'
import { GmailIcon } from '../components/icons/BrandIcons'
import { fetchT } from '../lib/fetchT'
import styles from './SettingsPage.module.css'

// Settings > Reports > Email (2026-08-27, corrected same day): this renders
// INLINE inside SettingsPage's own shell -- Sidebar and the Data/BigQuery/
// User Access/... tab bar stay exactly where they are, this is just the
// content that swaps in below the tab bar when the URL is
// /settings/reports/email. Not a separate page, no target=_blank, no own
// Sidebar -- a real route (so it's bookmarkable and the browser back button
// works) rendered by the same component tree, per explicit correction: the
// first version opened this as a genuinely separate page/tab, which is not
// what was asked for.
//
// Reuses the exact same preference keys the old inline UI already wrote --
// report_from_name, report_from_email, report_subjects,
// auto_reports_enabled -- so nothing about how a report actually sends
// changed, only where the controls for it live. New here: a real cadence
// editor per report, writing report_schedules (app_preferences), read by
// .github/workflows/report-scheduler.yml every 5 minutes.

const HOURS = Array.from({ length: 24 }, (_, h) => h)
const TIME_OPTIONS = []
for (const h of HOURS) for (const m of [0, 30]) {
  const label = new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  TIME_OPTIONS.push({ value: h * 60 + m, label })
}
const DAY_OPTIONS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((label, value) => ({ value, label }))
// Capped at 28 so a "monthly on the 31st" schedule never silently skips February.
const DOM_OPTIONS = Array.from({ length: 28 }, (_, i) => ({ value: i + 1, label: (i + 1) + (i === 0 ? 'st' : i === 1 ? 'nd' : i === 2 ? 'rd' : 'th') }))

function timeLabel(mins) { return TIME_OPTIONS.find(t => t.value === mins)?.label || '9:30 AM' }

function TimeDropdown({ minutes, onChange }) {
  return <Dropdown value={timeLabel(minutes)} onChange={label => onChange(TIME_OPTIONS.find(t => t.label === label).value)}
    options={TIME_OPTIONS.map(t => t.label)} minWidth={110} />
}

const REPORT_META = {
  daily:            { title: 'Daily Meta report', desc: 'Every day, the whole recipient list below.' },
  weekly:           { title: 'Weekly Meta report', desc: 'One day a week, the whole recipient list below.' },
  monthly:          { title: 'Monthly Meta report', desc: 'One day a month, the whole recipient list below.' },
  unassigned_leads: { title: 'Unassigned Leads Alert', desc: 'A fixed, different recipient -- an operational alert, not a digest.' },
}
const DEFAULT_SCHEDULES = {
  daily: { hour: 9, minute: 30 },
  weekly: { dayOfWeek: 1, hour: 9, minute: 30 },
  monthly: { dayOfMonth: 1, hour: 9, minute: 30 },
  unassigned_leads: { hour: 9, minute: 0 },
}

export default function ReportsEmailPage({ userEmail, accessList, onBack }) {
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subjects, setSubjects] = useState({ daily: '', weekly: '', monthly: '' })
  const [auto, setAuto] = useState(true)
  const [schedules, setSchedules] = useState(DEFAULT_SCHEDULES)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [sendingTest, setSendingTest] = useState(false)

  const recipients = (accessList || []).filter(u => u.receive_reports)

  useEffect(() => {
    fetchT('/api/preferences', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        const pf = data.prefs || {}
        if (pf.report_from_name != null) setName(pf.report_from_name)
        if (pf.report_from_email != null) setEmail(pf.report_from_email)
        if (pf.report_subjects) setSubjects({ daily: pf.report_subjects.daily || '', weekly: pf.report_subjects.weekly || '', monthly: pf.report_subjects.monthly || '' })
        if (pf.auto_reports_enabled != null) setAuto(pf.auto_reports_enabled !== false)
        if (pf.report_schedules) setSchedules(prev => ({
          daily: { ...prev.daily, ...pf.report_schedules.daily },
          weekly: { ...prev.weekly, ...pf.report_schedules.weekly },
          monthly: { ...prev.monthly, ...pf.report_schedules.monthly },
          unassigned_leads: { ...prev.unassigned_leads, ...pf.report_schedules.unassigned_leads },
        }))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true); setMsg('')
    try {
      const entries = [
        ['report_from_name', name.trim()],
        ['report_from_email', email.trim()],
        ['report_subjects', { daily: subjects.daily || '', weekly: subjects.weekly || '', monthly: subjects.monthly || '' }],
        ['auto_reports_enabled', auto],
        ['report_schedules', schedules],
      ]
      for (const [key, value] of entries) {
        const r = await fetchT('/api/preferences', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, value }) })
        if (!r.ok) throw new Error('Failed to save ' + key)
      }
      setMsg('Saved ✓ -- report-scheduler.yml picks up the new time on its next 5-minute check')
    } catch (e) { setMsg('✕ ' + e.message) }
    finally { setSaving(false); setTimeout(() => setMsg(''), 6000) }
  }

  const sendTest = async (type) => {
    setSendingTest(type)
    try {
      const body = type === 'daily' ? { triggered_by: 'test', recipients: [userEmail] } : { type, triggered_by: 'test', recipients: [userEmail] }
      const r = await fetchT('/api/send-report', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json().catch(() => ({}))
      setMsg(r.ok ? `Test ${type} report sent to ${userEmail} ✓` : '✕ ' + (j.error || 'Send failed'))
    } catch (e) { setMsg('✕ ' + e.message) }
    finally { setSendingTest(false); setTimeout(() => setMsg(''), 6000) }
  }

  return (
    <>
      <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 12.5, fontWeight: 700, padding: 0, marginBottom: 14 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        Back to Reports
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <GmailIcon size={24} />
        <h2 style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.01em', margin: 0, color: 'var(--text)' }}>Email reports</h2>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 18px' }}>{email || 'quantum@leverageedu.com'}{recipients.length ? ` · ${recipients.length} ${recipients.length === 1 ? 'recipient' : 'recipients'}` : ''}</p>

      {loading ? <p style={{ color: 'var(--text-3)', fontSize: 13 }}>Loading…</p> : (
        <>
          <div className={styles.card}>
            <div className={styles.activityHeader}>
              <div>
                <h3 className={styles.cardTitle}>Sender & automatic sending</h3>
                <p className={styles.cardDesc} style={{ margin: 0 }}>Applies to every report below.</p>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700, color: 'var(--text-2)', cursor: 'pointer' }}>
                <input type="checkbox" className={styles.premToggle} checked={auto} onChange={e => setAuto(e.target.checked)} />
                Automatic sending {auto ? 'on' : 'off'}
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 4 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>From name</div>
                <input className={styles.input} value={name} onChange={e => setName(e.target.value)} placeholder="Quantum" style={{ width: '100%' }} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>From address</div>
                <input className={styles.input} value={email} onChange={e => setEmail(e.target.value)} placeholder="quantum@leverageedu.com" style={{ width: '100%' }} />
              </div>
            </div>
          </div>

          {['daily', 'weekly', 'monthly', 'unassigned_leads'].map(type => {
            const sch = schedules[type]
            const set = (patch) => setSchedules(prev => ({ ...prev, [type]: { ...prev[type], ...patch } }))
            return (
              <div className={styles.card} key={type}>
                <h3 className={styles.cardTitle}>{REPORT_META[type].title}</h3>
                <p className={styles.cardDesc} style={{ margin: '0 0 12px' }}>{REPORT_META[type].desc}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                  {type === 'weekly' && <Dropdown value={DAY_OPTIONS.find(d => d.value === sch.dayOfWeek)?.label} onChange={l => set({ dayOfWeek: DAY_OPTIONS.find(d => d.label === l).value })} options={DAY_OPTIONS.map(d => d.label)} minWidth={130} />}
                  {type === 'monthly' && <Dropdown value={DOM_OPTIONS.find(d => d.value === sch.dayOfMonth)?.label} onChange={l => set({ dayOfMonth: DOM_OPTIONS.find(d => d.label === l).value })} options={DOM_OPTIONS.map(d => d.label)} minWidth={90} />}
                  <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>at</span>
                  <TimeDropdown minutes={sch.hour * 60 + sch.minute} onChange={mins => set({ hour: Math.floor(mins / 60), minute: mins % 60 })} />
                  <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>IST</span>
                  {type !== 'unassigned_leads' && (
                    <input className={styles.input} value={subjects[type]} onChange={e => setSubjects(prev => ({ ...prev, [type]: e.target.value }))}
                      placeholder={'Default ' + type + ' subject'} style={{ flex: 1, minWidth: 180 }} />
                  )}
                  <Button size="sm" variant="secondary" disabled={sendingTest === type} onClick={() => sendTest(type)}>
                    {sendingTest === type ? 'Sending…' : 'Send a test'}
                  </Button>
                </div>
                {type === 'unassigned_leads' && (
                  <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '10px 0 0' }}>To akash.saxena@leverageedu.com, always CC shivam.sharma@leverageedu.com -- fixed, not the recipient list below.</p>
                )}
              </div>
            )
          })}

          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Recipients ({recipients.length})</h3>
            <p className={styles.cardDesc} style={{ margin: '0 0 10px' }}>The daily/weekly/monthly Meta report only. Managed in User Access, not here.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {recipients.map(u => (
                <span key={u.email} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, background: 'var(--navy-tint)', color: 'var(--brand-ink)', fontWeight: 600 }}>{u.email}</span>
              ))}
              {!recipients.length && <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Nobody has "Receive reports" on -- falls back to {userEmail}.</span>}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
            <Button size="sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
            {msg && <span style={{ fontSize: 12, fontWeight: 700, color: msg.startsWith('✕') ? 'var(--brand-ink)' : '#178A54' }}>{msg}</span>}
          </div>
        </>
      )}
    </>
  )
}
