import { useEffect, useMemo, useState } from 'react'
import { chartPng, chartPngUrl } from '../lib/chartPng'
import { toast } from './ToastHost'
import PinInput from './PinInput'
import { REPORT_VERSIONS, DEFAULT_VERSION_ID, buildReportMessages, withV4AiNumbers } from '../lib/pmReport'
import { SLACK_CHANNELS, channelHandle, confirmPhrase, phraseMatches } from '../../shared/slackChannels.mjs'
import { SlackIcon } from './icons/BrandIcons'

// Send to Slack, with the version library and the preview living entirely inside
// Quantum. Nothing is created in Slack to keep track of layouts -- Slack only ever
// receives the one report somebody presses Send on here.

const C = { navy:'#1F3C84', blue:'#1C9FD4', cyan:'#29B9C3', green:'#4CAE6F', border:'#E2E8F0', muted:'#64748B', sub:'#475569', ink:'#0F172A' }
const FONT = 'Inter,-apple-system,BlinkMacSystemFont,sans-serif'
const MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace'
const LAST_KEY = 'lq_slack_report_last_sent'
// Every REAL channel Quantum can post to comes from shared/slackChannels.mjs, the
// same file the API reads. The panel can therefore never offer a room the server
// does not know about, and a channel added there shows up here with no edit at all.
// The sandbox side is different: those are admin-named in Settings > Reports and
// loaded fresh each time the panel opens (see the testChannels state below), so
// each one is offered as its own chip by its real name -- never a generic "Test
// channel" stand-in -- with one fallback entry for an account that has not named
// any yet. Nothing is pre-selected in either group: every send starts unanswered.
const LEGACY_TEST_DEST = {
  key: 'test', label: 'Test channel', name: '', guarded: false, isTest: true,
  reads: 'The one sandbox channel configured in Settings > Reports. Nobody else sees it.',
}
const NO_DEST = { key: '', label: '', name: '', guarded: false, isTest: false, reads: 'Pick a channel above before sending.' }

// A closed padlock at 9px, drawn rather than an emoji so it takes the chip's colour.
const Lock = ({ color }) => (
  <svg width="9" height="11" viewBox="0 0 9 11" fill="none" aria-hidden="true">
    <rect x="0.65" y="4.4" width="7.7" height="6" rx="1.5" stroke={color} strokeWidth="1.15" />
    <path d="M2.45 4.4V2.95a2.05 2.05 0 0 1 4.1 0V4.4" stroke={color} strokeWidth="1.15" />
  </svg>
)

const GATE_INPUT = {
  width: '100%', boxSizing: 'border-box', border: `1px solid ${C.border}`, borderRadius: 8,
  padding: '7px 10px', fontSize: 12, fontFamily: FONT, color: C.ink, background: '#fff',
  letterSpacing: 0.4, outline: 'none',
}


// The handful of shortcodes the builders use, so the preview shows what Slack shows.
const EMOJI = {
  ':bar_chart:':'\uD83D\uDCCA', ':moneybag:':'\uD83D\uDCB0', ':earth_asia:':'\uD83C\uDF0F', ':compass:':'\uD83E\uDDED',
  ':calendar:':'\uD83D\uDCC5', ':test_tube:':'\uD83E\uDDEA', ':chart_with_upwards_trend:':'\uD83D\uDCC8', ':dart:':'\uD83C\uDFAF',
  ':zap:':'\u26A1', ':memo:':'\uD83D\uDCDD', ':trophy:':'\uD83C\uDFC6', ':dollar:':'\uD83D\uDCB5',
  ':rocket:':'\uD83D\uDE80', ':information_source:':'\u2139\uFE0F',
  ':mag:':'\uD83D\uDD0D', ':bulb:':'\uD83D\uDCA1', ':ledger:':'\uD83D\uDCD2', ':pushpin:':'\uD83D\uDCCC',
  ':white_check_mark:':'\u2705', ':warning:':'\u26A0\uFE0F', ':small_blue_diamond:':'\uD83D\uDD39',
  ':bust_in_silhouette:':'\uD83D\uDC64', ':robot_face:':'\uD83E\uDD16',
}

const readLastSent = () => { try { return JSON.parse(localStorage.getItem(LAST_KEY) || '{}') } catch (_) { return {} } }
const writeLastSent = (id, entry) => {
  try { const m = readLastSent(); m[id] = entry; localStorage.setItem(LAST_KEY, JSON.stringify(m)) } catch (_) { /* private mode */ }
}
const agoLabel = iso => {
  if (!iso) return 'Never sent from this browser'
  const d = new Date(iso)
  return 'Last sent ' + d.toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })
}

// Slack mrkdwn to preview HTML. Escaped FIRST, so no value in the data can
// inject markup into the panel.
function inline(s) {
Object.keys(EMOJI).forEach(k => { s = s.split(k).join(EMOJI[k]) })
s = s.replace(/\*([^*\n]+)\*/g, '<b>$1</b>')
s = s.replace(/_([^_\n]+)_/g, '<i style="color:#64748B">$1</i>')
return s.replace(/\n/g, '<br/>')
}

// Slack renders a triple-backtick fence as a monospace block and keeps the
// spaces inside it. HTML collapses runs of spaces, so a fence has to be held
// aside and drawn as its own block, or a character-padded table looks right in
// Slack and loses its columns here, which defeats the point of a preview.
const PRE = 'margin:7px 0;padding:9px 11px;border:1px solid #E2E8F0;border-radius:8px;background:#F8FAFC;overflow-x:auto;white-space:pre;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;line-height:1.6;color:#0F172A'
const trimEdge = s => s.replace(/^\n/, '').replace(/\n$/, '')

function mrkdwn(text) {
const s = String(text || '').replace(/[&<>]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c]))
const parts = s.split('```')
// An unbalanced fence means the text is not what we think it is: draw it flat
// rather than guessing where the block was meant to end.
if (parts.length % 2 === 0) return inline(s)
return parts.map((part, i) => (
i % 2 ? '<div style="' + PRE + '">' + trimEdge(part) + '</div>' : inline(trimEdge(part))
)).join('')
}

export default function SlackReportPanel({ open, onClose, buildContext, captureFiles, dashboardId, filename, rowCount, versions, extraHeader }) {
  // A page may hand in its own report library; Overall keeps the shared one.
  const VERSIONS = versions && versions.length ? versions : REPORT_VERSIONS
  const [versionId, setVersionId] = useState(versions && versions.length ? versions[0].id : DEFAULT_VERSION_ID)
  // No destination is pre-selected -- every open, and every version switch,
  // starts from an unanswered "where does this go" rather than quietly
  // reusing whatever was picked last time.
  const [target, setTarget] = useState('')
  const [testChannels, setTestChannels] = useState([])
  const [busy, setBusy] = useState(false)
  // The main channel needs a second, deliberate click. No browser confirm dialog:
  // the preview above IS the confirmation, this just stops a stray click.
  const [armed, setArmed] = useState(false)
  const [phrase, setPhrase] = useState('')
  const [pin, setPin] = useState('')
  const [pinInfo, setPinInfo] = useState(null)
  const [gateErr, setGateErr] = useState('')
  // Nothing sends until a chip is actually clicked -- this flags the attempt so
  // the picker can say so instead of guessing a "default" nobody chose.
  const [pickErr, setPickErr] = useState(false)
  const [lastSent, setLastSent] = useState({})
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 940)

  // Browse Channel -- any channel the bot is actually in, not just the fixed
  // named destinations below. Same admin-only endpoint Settings > Reports >
  // Slack already uses (slack_channel_list -> conversations.list). Picking
  // one sets an AD-HOC target ('raw:<id>') -- never saved anywhere, just used
  // for this one send -- and the server independently refuses it if it
  // happens to resolve to one of the two CEO-guarded channels (see
  // resolveSlackTarget's own check in api/send-report.mjs), so this can never
  // be used to reach a locked room without the PIN.
  const [browseOpen, setBrowseOpen] = useState(false)
  const [allChannels, setAllChannels] = useState(null)
  const [channelsErr, setChannelsErr] = useState('')
  const [channelsLoading, setChannelsLoading] = useState(false)
  const [channelSearch, setChannelSearch] = useState('')
  const [rawDest, setRawDest] = useState(null)

  const loadChannels = () => {
    setChannelsLoading(true); setChannelsErr('')
    fetch('/api/send-report?type=slack_channel_list', { credentials: 'include' })
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => { if (ok) setAllChannels(j.channels); else setChannelsErr(j.error || 'Could not load channels') })
      .catch(e => setChannelsErr(e.message))
      .finally(() => setChannelsLoading(false))
  }
  const openBrowse = () => { setBrowseOpen(true); if (!allChannels) loadChannels() }
  const pickRawChannel = c => {
    const key = 'raw:' + c.id
    setRawDest({ key, label: '#' + c.name, name: c.name, guarded: false, isTest: false, reads: 'Picked from Browse channels — not saved, just for this send.' })
    setTarget(key)
    setBrowseOpen(false)
  }

  useEffect(() => {
    if (open) { setLastSent(readLastSent()); setArmed(false); setTarget(''); setRawDest(null); setBrowseOpen(false); setChannelSearch('') }
  }, [open])
  // Named test channels are admin-configured in Settings > Reports > Slack. Loaded
  // fresh each time the panel opens -- channel ids/names only, never a credential.
  useEffect(() => {
    if (!open) return
    setTestChannels([])
    fetch('/api/preferences', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { prefs: {} })
      .then(d => {
        const list = Array.isArray(d.prefs?.slack_test_channels) ? d.prefs.slack_test_channels : []
        setTestChannels(list.filter(c => c && c.id && c.name))
      })
      .catch(() => {})
  }, [open])
  useEffect(() => {
    setArmed(false); setPhrase(''); setPin(''); setGateErr(''); setPickErr(false)
  }, [target, versionId])

  // Sandbox chips are built fresh from whatever is actually named in Settings --
  // each named channel is its own first-class destination, not a value hidden
  // behind one generic "Test channel" pill. Falls back to that generic pill only
  // for an account that has never named a sandbox at all.
  const sandboxDests = useMemo(() => (
    testChannels.length
      ? testChannels.map(c => ({
          key: 'test:' + c.id, label: '#' + c.name, name: c.name, guarded: false, isTest: true,
          reads: 'Sandbox — only visible in #' + c.name + '.',
        }))
      : [LEGACY_TEST_DEST]
  ), [testChannels])
  const realDests = useMemo(() => SLACK_CHANNELS.map(c => ({
    key: c.id, label: c.label, name: c.name, guarded: !!c.guarded, isTest: false, reads: c.reads,
  })), [])
  const DESTS = useMemo(() => sandboxDests.concat(realDests), [sandboxDests, realDests])
  const DEST = k => (rawDest && rawDest.key === k) ? rawDest : (DESTS.find(d => d.key === k) || NO_DEST)

  // The PIN status is read fresh every time a locked channel is picked. It never
  // carries the PIN or the hash, only whether one is set and whether we are
  // locked out, so it is safe to hold in component state.
  const loadPinInfo = async () => {
    try {
      const r = await fetch('/api/send-report', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ceo_pin', action: 'status' }),
      })
      setPinInfo(r.ok ? await r.json() : { set: false, denied: true })
    } catch { setPinInfo({ set: false, denied: true }) }
  }
  useEffect(() => {
    if (!open || !DEST(target).guarded) return
    setPinInfo(null); loadPinInfo()
  }, [open, target])
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 940)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && open && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  // Preview is built from the same builders the send uses -- there is no second
  // code path that could drift from what actually gets posted.
  const rawMessages = useMemo(() => {
    if (!open) return []
    try { return buildReportMessages(versionId, { ...buildContext(), isTest: !!DEST(target).isTest }, VERSIONS) }
    catch (e) { return [{ key:'error', label:'Preview failed', text: e.message || 'Could not build this version' }] }
  }, [open, versionId, target, buildContext])

  // V4 only (rawMessages[0].aiDigest is only ever set there): asks the server to
  // rewrite "What the numbers say" into fresher-sounding prose, off exactly the same
  // facts already sitting on screen. Fires once per rawMessages identity (i.e. once
  // per version/data change), never on a re-render alone. A failure leaves aiBullets
  // null, so `messages` below just stays the deterministic, always-correct original --
  // this is purely a wording enhancement, never a requirement to send.
  const [aiBullets, setAiBullets] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  useEffect(() => {
    setAiBullets(null)
    const digest = rawMessages[0] && rawMessages[0].aiDigest
    if (!open || !Array.isArray(digest) || !digest.length) return
    let cancelled = false
    setAiLoading(true)
    fetch('/api/ask-ai', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'v4_insights', facts: digest }),
    })
      .then(r => (r.ok ? r.json() : Promise.reject(r)))
      .then(d => { if (!cancelled && Array.isArray(d.bullets) && d.bullets.length) setAiBullets(d.bullets) })
      .catch(() => { /* silent -- the deterministic sentences are already on screen */ })
      .finally(() => { if (!cancelled) setAiLoading(false) })
    return () => { cancelled = true }
  }, [open, rawMessages])

  // What actually renders in the preview AND what actually gets sent -- always the
  // same array, so "read the preview, then send" stays a real guarantee even once AI
  // rewrites message 1.
  const messages = useMemo(() => withV4AiNumbers(rawMessages, aiBullets), [rawMessages, aiBullets])

  const send = async () => {
    // An ordinary channel keeps the plain two-step. A guarded one needs that
    // channel's own confirmation phrase and the PIN typed first, and then a
    // second, separate click. The server re-checks all three, so nothing on
    // this side of the wire is the real protection.
    const spec = DEST(target)
    if (!spec.key) { setPickErr(true); return }
    if (!spec.isTest && !spec.guarded && !armed) { setArmed(true); return }
    if (spec.guarded) {
      if (!(pinInfo && pinInfo.set)) { setGateErr('No CEO PIN is set. An admin has to set it in Settings > Reports.'); return }
      if (pinInfo.locked) { setGateErr('Locked after too many wrong PINs. Try again later.'); return }
      if (!phraseMatches(target, phrase)) { setGateErr('Type ' + confirmPhrase(target) + ' exactly, to confirm.'); return }
      if (!/^[0-9]{6,12}$/.test(pin)) { setGateErr('Enter the CEO PIN.'); return }
      if (!armed) { setGateErr(''); setArmed(true); return }
    }
    setGateErr('')
    setBusy(true)
    try {
      const files = await captureFiles()
      const slackTarget = target
      const r = await fetch('/api/send-report', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'slack_report', dashboardId, slackTarget, filename, versionId, rowCount,
          rawChannelName: rawDest ? rawDest.name : undefined,
        confirm: spec.guarded ? phrase.trim() : undefined,
        ceoPin: spec.guarded ? pin : undefined,
          messages: messages.map(x => ({
            text: x.text, after: x.after || null, fields: x.fields || null,
            table: x.table || null, chart: x.chart || null, context: x.context || null,
            chartPng: chartPng(x.chart) || null,
            label: x.label || null, attach: !!x.attach,
            blocks: x.blocks || null, metadata: x.metadata || null,
          })),
          pngBase64: files ? files.pngBase64 : null,
          pixelRatio: files ? files.pixelRatio : null,
          csv: files ? files.csv : null,
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) {
        if (spec.guarded) { setPin(''); setArmed(false); loadPinInfo() }
        throw new Error([
          d.error || 'Failed to post to Slack',
          d.failsLeft != null ? d.failsLeft + ' tries left' : null,
          d.lockedForSec ? 'locked for ' + Math.ceil(d.lockedForSec / 60) + ' min' : null,
        ].filter(Boolean).join(' \u2014 '))
      }
      const entry = { at: new Date().toISOString(), channel: d.channel || target }
      writeLastSent(versionId, entry)
      setLastSent(m => ({ ...m, [versionId]: entry }))
      setPin(''); setPhrase('')
      toast('Report posted to Slack ' + (d.channel || ''), { type: 'success' })
      onClose()
    } catch (e) {
      toast(e.message || 'Could not post to Slack', { type: 'muted' })
    } finally {
      setBusy(false)
      setArmed(false)
    }
  }

  if (!open) return null
  const version = VERSIONS.find(v => v.id === versionId) || VERSIONS[0]
  const attachCount = messages.filter(m => m.attach).length
  const LABEL = { fontSize:10, fontWeight:800, letterSpacing:'0.07em', textTransform:'uppercase', color:C.muted, marginBottom:9 }
  // One channel chip. The selected one goes solid navy. A guarded channel keeps a
  // darker hairline even when it is not selected, so the locked rooms read as locked
  // before anybody clicks them. `err` tints an unselected chip red after a Send
  // attempt with nothing picked, so the whole picker visibly says "choose one".
  const chip = (active, guarded, err) => ({
    display:'flex', alignItems:'center', gap:6, padding:'6px 10px', cursor:'pointer',
    border:`1px solid ${active ? C.navy : err ? '#F1B5AC' : (guarded ? C.sub : C.border)}`,
    borderRadius:9, background: active ? C.navy : '#fff', fontFamily:FONT,
    color: active ? '#fff' : C.ink, transition:'background .12s, border-color .12s',
    boxShadow: active ? '0 1px 2px rgba(15,23,42,0.12)' : 'none'
  })
  const phraseOk = DEST(target).guarded && phraseMatches(target, phrase)

  return (
    <div
      onClick={() => { if (!busy) onClose() }}
      style={{ position:'fixed', inset:0, zIndex:900, background:'rgba(15,23,42,0.5)', display:'flex', alignItems:'center', justifyContent:'center', padding: narrow ? 0 : 24, fontFamily:FONT }}
    >
      <div onClick={e => e.stopPropagation()} style={{
        background:'#fff', width:'100%', maxWidth:1060, height: narrow ? '100%' : '88vh',
        borderRadius: narrow ? 0 : 16, boxShadow:'0 24px 64px rgba(15,23,42,0.28)',
        display:'flex', flexDirection:'column', overflow:'hidden',
      }}>

        <div style={{ padding:'15px 18px', borderBottom:`1px solid ${C.border}`, display:'flex', flexDirection:'column', gap: extraHeader ? 12 : 0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:32, height:32, borderRadius:9, background:'rgba(31,60,132,0.07)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <SlackIcon size={17} />
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:15, fontWeight:800, color:C.ink, letterSpacing:'-0.01em' }}>Send to Slack</div>
              <div style={{ fontSize:11.5, color:C.muted, marginTop:2 }}>Pick a version, read the preview, then send. The library lives here in Quantum, never in Slack.</div>
            </div>
            <button onClick={onClose} title="Close" style={{ border:'none', background:'none', cursor:'pointer', padding:6, borderRadius:7, color:C.muted, lineHeight:0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          {/* Optional page-specific controls (e.g. Super Tracker's "which week"
              picker) -- rendered here so a page can put a real control at the
              head of the modal without this shared component knowing anything
              about what that control does. */}
          {extraHeader}
        </div>

        <div style={{ flex:1, minHeight:0, display:'flex', flexDirection: narrow ? 'column' : 'row' }}>
          <div style={{
            width: narrow ? 'auto' : 300, flexShrink:0, background:'#FBFCFD', padding:14, overflowY:'auto',
            borderRight: narrow ? 'none' : `1px solid ${C.border}`, borderBottom: narrow ? `1px solid ${C.border}` : 'none',
          }}>
            <div style={LABEL}>Version</div>
            {VERSIONS.map(v => {
              const sel = v.id === versionId
              return (
                <button key={v.id} onClick={() => setVersionId(v.id)} style={{
                  display:'block', width:'100%', textAlign:'left', cursor:'pointer', fontFamily:FONT,
                  background: sel ? 'rgba(31,60,132,0.05)' : '#fff', borderRadius:11, padding:'11px 12px', marginBottom:8,
                  border: sel ? `1.5px solid ${C.navy}` : `1px solid ${C.border}`,
                  boxShadow: sel ? 'none' : '0 1px 2px rgba(15,23,42,0.03)', transition:'border .12s, background .12s',
                }}>
                  <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:3 }}>
                    <span style={{ fontSize:9.5, fontWeight:800, letterSpacing:'0.06em', color:C.navy, background:'rgba(31,60,132,0.07)', padding:'2px 6px', borderRadius:5 }}>{v.code || v.id}</span>
                    <span style={{ fontSize:12.5, fontWeight:800, color: sel ? C.navy : C.ink }}>{v.name}</span>
                    {v.recommended && (
                      <span style={{ fontSize:9, fontWeight:800, letterSpacing:'0.05em', textTransform:'uppercase', color:'#fff', background:C.cyan, padding:'2px 6px', borderRadius:4 }}>Recommended</span>
                    )}
                  </div>
                  <div style={{ fontSize:11.5, color:C.sub, lineHeight:1.5 }}>{v.tagline}</div>
                  <div style={{ fontSize:10.5, color:C.muted, marginTop:5 }}>{agoLabel(lastSent[v.id] && lastSent[v.id].at)}</div>
                </button>
              )
            })}
            <div style={{ fontSize:10.5, color:C.muted, lineHeight:1.65, marginTop:10 }}>
              Versions are never removed from this list, so an older layout can always be previewed and re-sent. Every view and every message inside it carries a fixed ID, so any change can be asked for by ID.
            </div>
          </div>

          <div style={{ flex:1, minWidth:0, overflowY:'auto', padding:16, background:'#F6F8FA' }}>
            <div style={{ background:'#fff', border:`1px solid ${C.border}`, borderRadius:12, padding:'12px 14px', marginBottom:14 }}>
              <div style={LABEL}>What this version sends</div>
              {version.what.map((w, i) => (
                <div key={i} style={{ display:'flex', gap:8, fontSize:11.5, color:C.sub, lineHeight:1.6, marginBottom: i === version.what.length - 1 ? 0 : 5 }}>
                  <span style={{ color:C.cyan, fontWeight:800 }}>&bull;</span><span>{w}</span>
                </div>
              ))}
            </div>

            <div style={LABEL}>Preview{messages.length > 1 ? ' \u00b7 ' + messages.length + ' separate messages, one click' : ''}</div>
            {messages.map((m, i) => (
              <div key={m.key} style={{ background:'#fff', border:`1px solid ${C.border}`, borderRadius:12, padding:14, marginBottom:12, boxShadow:'0 1px 2px rgba(15,23,42,0.04)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:9, flexWrap:'wrap' }}>
                  <span style={{ fontSize:9.5, fontWeight:800, letterSpacing:'0.06em', textTransform:'uppercase', color:C.navy, background:'rgba(31,60,132,0.07)', padding:'3px 7px', borderRadius:5 }}>
                    Message {i + 1} of {messages.length}
                  </span>
                  <span style={{ fontSize:10, fontWeight:800, letterSpacing:'0.06em', color:'#fff', background:C.navy, padding:'2px 7px', borderRadius:5 }}>{m.id}</span>
                    <span style={{ fontSize:11, color:C.muted, fontWeight:600 }}>{m.label}</span>
                </div>
                <div style={{ fontSize:12.5, lineHeight:1.8, color:C.ink, wordBreak:'break-word' }} dangerouslySetInnerHTML={{ __html: mrkdwn(m.text) }} />
                {Array.isArray(m.fields) && m.fields.length > 0 && <FieldGrid fields={m.fields} />}
                {m.after && <div style={{ fontSize:12.5, lineHeight:1.8, color:C.ink, wordBreak:'break-word', marginTop:11 }} dangerouslySetInnerHTML={{ __html: mrkdwn(m.after) }} />}
                {i === 0 && aiLoading && (
                  <div style={{ fontSize:10.5, color:C.muted, fontStyle:'italic', marginTop:8 }}>Rewriting "What the numbers say" with AI…</div>
                )}
                {m.table && <TablePreview table={m.table} />}
                {m.chart && <ChartImage chart={m.chart} />}
                {m.context && (
                  <div style={{ fontSize:10.5, lineHeight:1.65, color:C.muted, marginTop:11, paddingTop:9, borderTop:`1px solid ${C.border}` }} dangerouslySetInnerHTML={{ __html: mrkdwn(m.context) }} />
                )}
                {m.attach && (
                  <div style={{ display:'flex', gap:7, flexWrap:'wrap', marginTop:11, paddingTop:10, borderTop:`1px dashed ${C.border}` }}>
                    <span style={{ fontSize:10.5, color:C.muted, fontWeight:700 }}>In the thread:</span>
                    <span style={{ fontSize:10.5, color:C.sub, background:'#F1F5F9', padding:'2px 7px', borderRadius:5 }}>table image (PNG)</span>
                    <span style={{ fontSize:10.5, color:C.sub, background:'#F1F5F9', padding:'2px 7px', borderRadius:5 }}>full-column CSV</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding:'12px 16px', borderTop:`1px solid ${C.border}`, display:'flex', flexDirection:'column', gap:10 }}>
          {/* The channel picker. Two flat groups, every chip a real room spelled the
              way Slack spells it -- no "Test channel" stand-in hiding a second pick
              behind it. Nothing here is pre-selected; a send always starts unanswered. */}
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <div>
              <div style={{ ...LABEL, marginBottom:6, color: pickErr ? '#B42318' : C.muted }}>
                Sandbox — pick one to test with
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:7, flexWrap:'wrap' }}>
                {sandboxDests.map(d => {
                  const on = target === d.key
                  return (
                    <button key={d.key} onClick={() => setTarget(d.key)} style={chip(on, false, pickErr)}>
                      <span style={{ fontSize: d.name ? 11.5 : 12, fontWeight:700, fontFamily: d.name ? MONO : FONT }}>{d.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <div style={{ ...LABEL, marginBottom:6, color: pickErr ? '#B42318' : C.muted }}>Real channels</div>
              <div style={{ display:'flex', alignItems:'center', gap:7, flexWrap:'wrap' }}>
                {realDests.map(d => {
                  const on = target === d.key
                  return (
                    <button key={d.key} onClick={() => setTarget(d.key)} style={chip(on, d.guarded, pickErr)}>
                      {d.guarded && <Lock color={on ? '#fff' : C.sub} />}
                      <span style={{ fontSize:11.5, fontWeight:700, fontFamily:MONO }}>{'#' + d.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                <div style={{ ...LABEL, marginBottom:0, color: pickErr ? '#B42318' : C.muted }}>Any channel the bot is in</div>
                <button onClick={() => (browseOpen ? setBrowseOpen(false) : openBrowse())} style={{ border:'none', background:'none', cursor:'pointer', fontSize:11, fontWeight:800, color:C.blue, padding:0, fontFamily:FONT }}>
                  {browseOpen ? 'Close' : 'Browse channels'}
                </button>
              </div>
              {rawDest && !browseOpen && (
                <button onClick={() => setTarget(rawDest.key)} style={chip(target === rawDest.key, false, pickErr)}>
                  <span style={{ fontSize:11.5, fontWeight:700, fontFamily:MONO }}>{rawDest.label}</span>
                </button>
              )}
              {browseOpen && (
                <div style={{ border:`1px solid ${C.border}`, borderRadius:10, padding:'8px 9px', background:'#fff' }}>
                  <input
                    value={channelSearch} onChange={e => setChannelSearch(e.target.value)}
                    placeholder="Search channels…" autoFocus autoComplete="off" spellCheck={false}
                    style={{ width:'100%', boxSizing:'border-box', border:`1px solid ${C.border}`, borderRadius:7, padding:'6px 9px', fontSize:12, fontFamily:FONT, marginBottom:7, outline:'none' }}
                  />
                  <div style={{ maxHeight:200, overflowY:'auto' }}>
                    {channelsLoading && <div style={{ fontSize:11.5, color:C.muted, padding:'6px 4px' }}>Loading…</div>}
                    {channelsErr && (
                      <div style={{ fontSize:11.5, color:'#B42318', padding:'6px 4px' }}>
                        {channelsErr} <button onClick={loadChannels} style={{ background:'none', border:'none', color:C.navy, cursor:'pointer', fontWeight:700, fontSize:11.5, fontFamily:FONT }}>Retry</button>
                      </div>
                    )}
                    {allChannels && allChannels
                      .filter(c => c.name.toLowerCase().includes(channelSearch.trim().toLowerCase()))
                      .map(c => (
                        <button key={c.id} onClick={() => pickRawChannel(c)} style={{ display:'flex', alignItems:'center', gap:7, width:'100%', textAlign:'left', padding:'6px 8px', border:'none', background:'none', cursor:'pointer', borderRadius:7 }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#F1F5F9')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                          <span style={{ color:C.muted, fontWeight:700 }}>#</span>
                          <span style={{ flex:1, fontSize:11.5, fontFamily:MONO, color:C.ink }}>{c.name}</span>
                          {c.isPrivate && <span style={{ fontSize:9.5, fontWeight:700, color:C.muted }}>private</span>}
                          {!c.isMember && <span style={{ fontSize:9.5, fontWeight:700, color:'#B42318' }}>not invited</span>}
                        </button>
                      ))}
                    {allChannels && !allChannels.filter(c => c.name.toLowerCase().includes(channelSearch.trim().toLowerCase())).length && !channelsLoading && (
                      <div style={{ fontSize:11.5, color:C.muted, padding:'6px 4px' }}>No match.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div style={{ display:'flex', alignItems:'baseline', gap:6, fontSize:11, lineHeight:1.5, flexWrap:'wrap' }}>
              <span style={{ color: pickErr ? '#B42318' : (DEST(target).guarded ? C.navy : C.muted), fontWeight: (pickErr || DEST(target).guarded) ? 700 : 500 }}>
                {pickErr ? 'Pick a channel above before sending.' : DEST(target).reads}
              </span>
              {DEST(target).guarded && <span style={{ color:C.sub, fontWeight:600 }}>Admin, phrase and PIN.</span>}
            </div>
          </div>

          {DEST(target).guarded && (
            <div style={{ border:`1px solid ${C.border}`, borderRadius:10, padding:'10px 12px', background:'#FAFCFE', display:'flex', flexDirection:'column', gap:7 }}>
              <div style={{ display:'flex', alignItems:'center', gap:7, flexWrap:'wrap' }}>
                <Lock color={C.navy} />
                <span style={{ fontSize:11.5, fontWeight:800, color:C.navy, fontFamily:MONO }}>{channelHandle(target)}</span>
                <span style={{ fontSize:10.5, fontWeight:700, color:C.sub }}>is locked &mdash; the CEO reads it</span>
              </div>
              <div style={{ fontSize:10.5, color:C.sub, lineHeight:1.55 }}>
                {!pinInfo ? 'Checking the PIN\u2026'
                  : pinInfo.denied ? 'Only an admin can post to ' + channelHandle(target) + '.'
                  : pinInfo.invalid ? 'The PIN record does not verify. An admin has to set the PIN again in Settings \u203A Reports.'
                  : !pinInfo.set ? 'No PIN is set yet. An admin has to set one in Settings \u203A Reports first.'
                  : pinInfo.locked ? 'Locked after too many wrong PINs. Try again in ' + Math.ceil((pinInfo.lockedForSec || 0) / 60) + ' min.'
                  : 'Type the phrase, then the PIN, then confirm.' + (pinInfo.failsLeft != null ? ' ' + pinInfo.failsLeft + ' tries left before a lockout.' : '')}
              </div>
              <div style={{ position:'relative' }}>
                <input value={phrase} onChange={e => { setPhrase(e.target.value); setGateErr('') }}
                  placeholder={confirmPhrase(target)} spellCheck={false} autoComplete="off"
                  style={{ ...GATE_INPUT, paddingRight:26, borderColor: phraseOk ? C.green : C.border }} />
                {phraseOk && <span style={{ position:'absolute', right:9, top:5, fontSize:12, fontWeight:800, color:C.green }}>{'\u2713'}</span>}
              </div>
              <PinInput value={pin} onChange={v => { setPin(v); setGateErr('') }} placeholder="CEO PIN" inputStyle={GATE_INPUT} iconColor={C.muted} />
              <div style={{ fontSize:10.5, fontWeight:700, color:C.navy }}>{gateErr}</div>
            </div>
          )}

          <div style={{ display:'flex', alignItems:'center', gap:10, justifyContent:'flex-end' }}>
            <button onClick={onClose} disabled={busy} style={{
              border:`1px solid ${C.border}`, background:'#fff', borderRadius:9, padding:'8px 14px',
              fontSize:12.5, fontWeight:700, color:C.sub, cursor: busy ? 'default' : 'pointer', fontFamily:FONT,
            }}>Cancel</button>
            <button onClick={send} disabled={busy || !messages.length} style={{
              border:'none', borderRadius:9, padding:'8px 18px', fontSize:12.5, fontWeight:800, color:'#fff',
              background: busy ? C.muted : (armed ? C.green : C.navy), cursor: busy ? 'default' : 'pointer',
              fontFamily:FONT, boxShadow:'0 1px 2px rgba(15,23,42,0.10)',
            }}>
              {busy ? 'Sending\u2026'
                : armed ? 'Confirm \u2014 post to ' + channelHandle(target)
                : 'Send ' + messages.length + (messages.length === 1 ? ' message' : ' messages')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// The native Slack table, drawn the way Slack draws it: header row, right-aligned
// numbers, bold on the TOTAL and band rows.
function TablePreview({ table }) {
  const strong = new Set(table.strongRows || [])
  const cell = (v, i, isStrong) => ({
    padding:'5px 8px', fontSize:11, whiteSpace:'nowrap',
    textAlign: i === 0 ? 'left' : 'right',
    fontWeight: isStrong ? 800 : 500,
    color: isStrong ? C.ink : C.sub,
    borderBottom:`1px solid ${C.border}`,
  })
  return (
    <div style={{ marginTop:12, border:`1px solid ${C.border}`, borderRadius:9, overflow:'auto', maxHeight:290 }}>
      <table style={{ borderCollapse:'collapse', width:'100%' }}>
        <thead>
          <tr style={{ background:'#F8FAFC' }}>
            {(table.columns || []).map((c, i) => (
              <th key={i} style={{ ...cell(c, i, true), fontSize:10, letterSpacing:'0.03em', textTransform:'uppercase', color:C.muted, position:'sticky', top:0, background:'#F8FAFC' }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(table.rows || []).map((r, ri) => (
            <tr key={ri} style={{ background: strong.has(ri) ? 'rgba(31,60,132,0.035)' : '#fff' }}>
              {r.map((v, ci) => <td key={ci} style={cell(v, ci, strong.has(ri))}>{v}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Slack's two-column field grid. The whole reason the KPIs travel as fields rather
// than space-padded text is that Slack aligns them itself and keeps doing so on a
// phone, so the preview mirrors that instead of pretending they are a paragraph.
function FieldGrid({ fields }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0, 1fr))', gap:8, marginTop:11 }}>
      {fields.map((f, i) => {
        const parts = String(f).split('\n')
        const moved = /[\u25b2\u25bc]/.test(parts[2] || '')
        return (
          <div key={i} style={{ border:`1px solid ${C.border}`, borderRadius:9, padding:'8px 10px', background:'#FBFCFD' }}>
            <div style={{ fontSize:11, fontWeight:700, color:C.sub }} dangerouslySetInnerHTML={{ __html: mrkdwn(parts[0] || '') }} />
            <div style={{ fontSize:16, fontWeight:800, color:C.ink, letterSpacing:'-0.01em', margin:'3px 0 2px' }}>{parts[1] || ''}</div>
            <div style={{ fontSize:10.5, fontWeight:600, color: moved ? C.navy : C.muted }}>{parts[2] || ''}</div>
          </div>
        )
      })}
    </div>
  )
}

// The native chart Slack will draw, previewed off the very same payload that gets
// posted. Deliberately not a pixel copy of Slack's renderer -- it is here so nobody
// sends a chart they have not looked at first.
function ChartPreview({ chart }) {
  const c = chart.chart || {}
  const bars = []
  if (c.type === 'pie') {
    const segs = c.segments || []
    const total = segs.reduce((t, x) => t + (Number(x.value) || 0), 0) || 1
    segs.forEach(x => {
      const share = ((Number(x.value) || 0) / total) * 100
      bars.push({ label: x.label, pct: share, note: share.toFixed(1) + '%' })
    })
  } else {
    const series = c.series || []
    const cats = (c.axis_config && c.axis_config.categories) || []
    let max = 1
    series.forEach(sr => (sr.data || []).forEach(d => { if (Number(d.value) > max) max = Number(d.value) }))
    cats.forEach((cat, i) => series.forEach(sr => {
      const d = (sr.data || [])[i]
      if (!d) return
      bars.push({
        label: cat + (series.length > 1 ? ' \u00b7 ' + sr.name : ''),
        pct: (Number(d.value) / max) * 100,
        note: Number(d.value).toLocaleString('en-IN'),
      })
    }))
  }
  if (!bars.length) return null
  return (
    <div style={{ marginTop:12, border:`1px solid ${C.border}`, borderRadius:9, padding:'11px 12px', background:'#FBFCFD' }}>
      <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:9, flexWrap:'wrap' }}>
        <span style={{ fontSize:9.5, fontWeight:800, letterSpacing:'0.06em', textTransform:'uppercase', color:C.cyan }}>Native Slack chart</span>
        <span style={{ fontSize:11.5, fontWeight:700, color:C.ink }}>{chart.title}</span>
      </div>
      {bars.slice(0, 24).map((b, i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:9, marginBottom:5 }}>
          <div style={{ width:'38%', flexShrink:0, fontSize:10.5, color:C.sub, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{b.label}</div>
          <div style={{ flex:1, height:8, background:'#EDF1F6', borderRadius:5, overflow:'hidden' }}>
            <div style={{ width: Math.max(2, Math.min(100, b.pct)) + '%', height:'100%', background: i % 2 === 0 ? C.navy : C.cyan, borderRadius:5 }} />
          </div>
          <div style={{ width:74, textAlign:'right', flexShrink:0, fontSize:10.5, fontWeight:700, color:C.ink }}>{b.note}</div>
        </div>
      ))}
    </div>
  )
}

// The chart exactly as Slack will receive it: our own canvas render, brand ramp,
// the value written on every bar and slice, because the CEO reads this on a
// phone. If the canvas is unavailable we fall back to the plain bar list, which
// is what Slack's own chart block would show.
function ChartImage({ chart }) {
  const src = useMemo(() => chartPngUrl(chart), [chart])
  if (!src) return <ChartPreview chart={chart} />
  return (
    <div style={{ marginTop:12, border:`1px solid ${C.border}`, borderRadius:9, padding:10, background:'#FFFFFF' }}>
      <div style={{ fontSize:9.5, fontWeight:800, letterSpacing:'0.06em', textTransform:'uppercase', color:C.cyan, marginBottom:8 }}>
        Chart sent as an image
      </div>
      <img src={src} alt={chart.title || 'Chart'} style={{ display:'block', width:'100%', height:'auto', borderRadius:6 }} />
    </div>
  )
}
