import { useEffect, useMemo, useState } from 'react'
import { chartPng, chartPngUrl } from '../lib/chartPng'
import { toast } from './ToastHost'
import { REPORT_VERSIONS, DEFAULT_VERSION_ID, buildReportMessages } from '../lib/pmReport'

// Send to Slack, with the version library and the preview living entirely inside
// Quantum. Nothing is created in Slack to keep track of layouts -- Slack only ever
// receives the one report somebody presses Send on here.

const C = { navy:'#1F3C84', blue:'#1C9FD4', cyan:'#29B9C3', green:'#4CAE6F', border:'#E2E8F0', muted:'#64748B', sub:'#475569', ink:'#0F172A' }
const FONT = 'Inter,-apple-system,BlinkMacSystemFont,sans-serif'
const LAST_KEY = 'lq_slack_report_last_sent'

// The handful of shortcodes the builders use, so the preview shows what Slack shows.
const EMOJI = {
  ':bar_chart:':'\uD83D\uDCCA', ':moneybag:':'\uD83D\uDCB0', ':earth_asia:':'\uD83C\uDF0F', ':compass:':'\uD83E\uDDED',
  ':test_tube:':'\uD83E\uDDEA', ':chart_with_upwards_trend:':'\uD83D\uDCC8', ':dart:':'\uD83C\uDFAF',
  ':zap:':'\u26A1', ':memo:':'\uD83D\uDCDD', ':trophy:':'\uD83C\uDFC6', ':dollar:':'\uD83D\uDCB5',
  ':rocket:':'\uD83D\uDE80', ':information_source:':'\u2139\uFE0F',
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

// Slack mrkdwn to preview HTML. Escaped FIRST, so no value in the data can inject
// markup into the panel.
function mrkdwn(text) {
  let s = String(text || '').replace(/[&<>]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c]))
  Object.keys(EMOJI).forEach(k => { s = s.split(k).join(EMOJI[k]) })
  s = s.replace(/\*([^*\n]+)\*/g, '<b>$1</b>')
  s = s.replace(/_([^_\n]+)_/g, '<i style="color:#64748B">$1</i>')
  return s.replace(/\n/g, '<br/>')
}

export default function SlackReportPanel({ open, onClose, buildContext, captureFiles, dashboardId, filename, rowCount }) {
  const [versionId, setVersionId] = useState(DEFAULT_VERSION_ID)
  const [target, setTarget] = useState('test')
  const [busy, setBusy] = useState(false)
  // The main channel needs a second, deliberate click. No browser confirm dialog:
  // the preview above IS the confirmation, this just stops a stray click.
  const [armed, setArmed] = useState(false)
  const [lastSent, setLastSent] = useState({})
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 940)

  useEffect(() => { if (open) { setLastSent(readLastSent()); setArmed(false) } }, [open])
  useEffect(() => { setArmed(false) }, [target, versionId])
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
  const messages = useMemo(() => {
    if (!open) return []
    try { return buildReportMessages(versionId, { ...buildContext(), isTest: target === 'test' }) }
    catch (e) { return [{ key:'error', label:'Preview failed', text: e.message || 'Could not build this version' }] }
  }, [open, versionId, target, buildContext])

  const send = async () => {
    if (target === 'prod' && !armed) { setArmed(true); return }
    setBusy(true)
    try {
      const files = await captureFiles()
      const r = await fetch('/api/send-report', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'slack_report', dashboardId, slackTarget: target, filename, versionId, rowCount,
          messages: messages.map(x => ({
            text: x.text, after: x.after || null, fields: x.fields || null,
            table: x.table || null, chart: x.chart || null, context: x.context || null,
            chartPng: chartPng(x.chart) || null,
            label: x.label || null, attach: !!x.attach,
          })),
          pngBase64: files ? files.pngBase64 : null,
          pixelRatio: files ? files.pixelRatio : null,
          csv: files ? files.csv : null,
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Failed to post to Slack')
      const entry = { at: new Date().toISOString(), channel: d.channel || target }
      writeLastSent(versionId, entry)
      setLastSent(m => ({ ...m, [versionId]: entry }))
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
  const version = REPORT_VERSIONS.find(v => v.id === versionId) || REPORT_VERSIONS[0]
  const attachCount = messages.filter(m => m.attach).length
  const LABEL = { fontSize:10, fontWeight:800, letterSpacing:'0.07em', textTransform:'uppercase', color:C.muted, marginBottom:9 }
  const pill = active => ({
    flex:1, padding:'7px 10px', border:'none', borderRadius:7, cursor:'pointer', fontFamily:FONT,
    fontSize:12, fontWeight:700, color: active ? '#fff' : C.sub, background: active ? C.navy : 'transparent',
    transition:'background .12s',
  })

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

        <div style={{ padding:'15px 18px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:32, height:32, borderRadius:9, background:'rgba(31,60,132,0.07)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.navy} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>
            </svg>
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:15, fontWeight:800, color:C.ink, letterSpacing:'-0.01em' }}>Send to Slack</div>
            <div style={{ fontSize:11.5, color:C.muted, marginTop:2 }}>Pick a version, read the preview, then send. The library lives here in Quantum, never in Slack.</div>
          </div>
          <button onClick={onClose} title="Close" style={{ border:'none', background:'none', cursor:'pointer', padding:6, borderRadius:7, color:C.muted, lineHeight:0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div style={{ flex:1, minHeight:0, display:'flex', flexDirection: narrow ? 'column' : 'row' }}>
          <div style={{
            width: narrow ? 'auto' : 300, flexShrink:0, background:'#FBFCFD', padding:14, overflowY:'auto',
            borderRight: narrow ? 'none' : `1px solid ${C.border}`, borderBottom: narrow ? `1px solid ${C.border}` : 'none',
          }}>
            <div style={LABEL}>Version</div>
            {REPORT_VERSIONS.map(v => {
              const sel = v.id === versionId
              return (
                <button key={v.id} onClick={() => setVersionId(v.id)} style={{
                  display:'block', width:'100%', textAlign:'left', cursor:'pointer', fontFamily:FONT,
                  background: sel ? 'rgba(31,60,132,0.05)' : '#fff', borderRadius:11, padding:'11px 12px', marginBottom:8,
                  border: sel ? `1.5px solid ${C.navy}` : `1px solid ${C.border}`,
                  boxShadow: sel ? 'none' : '0 1px 2px rgba(15,23,42,0.03)', transition:'border .12s, background .12s',
                }}>
                  <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:3 }}>
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
              Versions are never removed from this list, so an older layout can always be previewed and re-sent.
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
                  <span style={{ fontSize:11, color:C.muted, fontWeight:600 }}>{m.label}</span>
                </div>
                <div style={{ fontSize:12.5, lineHeight:1.8, color:C.ink, wordBreak:'break-word' }} dangerouslySetInnerHTML={{ __html: mrkdwn(m.text) }} />
                {Array.isArray(m.fields) && m.fields.length > 0 && <FieldGrid fields={m.fields} />}
                {m.after && <div style={{ fontSize:12.5, lineHeight:1.8, color:C.ink, wordBreak:'break-word', marginTop:11 }} dangerouslySetInnerHTML={{ __html: mrkdwn(m.after) }} />}
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

        <div style={{ padding:'12px 16px', borderTop:`1px solid ${C.border}`, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
          <div style={{ display:'flex', background:'#F1F5F9', borderRadius:9, padding:3, minWidth:230 }}>
            <button onClick={() => setTarget('test')} style={pill(target === 'test')}>Test channel</button>
            <button onClick={() => setTarget('prod')} style={pill(target === 'prod')}>Main channel</button>
          </div>
          <div style={{ fontSize:11, color: target === 'prod' ? C.navy : C.muted, fontWeight: target === 'prod' ? 700 : 500, flex:1, minWidth:180 }}>
            {target === 'prod'
              ? (armed ? 'Click Confirm to post to the main channel.' : 'This posts to the team channel everyone reads.')
              : 'Safe: posts to the test channel only.'}
          </div>
          <button onClick={onClose} disabled={busy} style={{
            border:`1px solid ${C.border}`, background:'#fff', borderRadius:9, padding:'8px 14px',
            fontSize:12.5, fontWeight:700, color:C.sub, cursor: busy ? 'default' : 'pointer', fontFamily:FONT,
          }}>Cancel</button>
          <button onClick={send} disabled={busy || !messages.length} style={{
            border:'none', borderRadius:9, padding:'8px 18px', fontSize:12.5, fontWeight:800, color:'#fff',
            background: busy ? C.muted : (armed ? C.green : C.navy), cursor: busy ? 'default' : 'pointer',
            fontFamily:FONT, boxShadow:'0 1px 2px rgba(15,23,42,0.10)',
          }}>
            {busy ? 'Sending\u2026' : armed ? 'Confirm \u2014 post to main' : 'Send ' + messages.length + (messages.length === 1 ? ' message' : ' messages')}
          </button>
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
