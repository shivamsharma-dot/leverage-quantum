import React, { useState, useEffect, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import Sidebar from '../components/Sidebar'
import ExportButton from '../components/ExportButton'
import Button from '../components/Button'
import { DashboardSkeleton } from '../components/SkeletonLoader'
import { resolveSheetUrl } from '../lib/dataSources'
import { C, FONT, Card, PremKPI, KPI_ICONS, RankedBars, fmtN } from '../ui/dashboardKit'

const DEFAULT_CSV = 'https://docs.google.com/spreadsheets/d/1r-e6pBCN5ysfeD3Eq6sxgLmf97mdeTtloMPylqnx6Ew/gviz/tq?tqx=out:csv&sheet=HumanDetailedQL'
const PAGE = 25
const COL_ORDER_KEY = 'lq_human_ql_col_order_v3'
const COL_PINNED_KEY = 'lq_human_ql_col_pinned'
const COL_HIDDEN_KEY = 'lq_human_ql_col_hidden'
const VIEWS_KEY = 'lq_human_ql_views'

// LeadSquared: Contact and Opportunity are distinct records -- prospect_id is the
// Contact (the person), opportunity_id_futwork is this specific pipeline instance
// for that person. opportunityEvent=12003 is fixed for this Human QL pipeline.
const LEADSQUARED_CONTACT_URL = 'https://in21.leadsquared.com/LeadManagement/LeadDetails?LeadID='
const LEADSQUARED_OPPORTUNITY_URL = 'https://in21.leadsquared.com/OpportunityManagement/OpportunityDetails?opportunityId='
const LEADSQUARED_OPPORTUNITY_EVENT = '12003'

const HOT_DISPOSITION = 'Call Transferred To Counsellor'

const HUMAN_QL_COLS = [
  { key: 'date', label: 'Date', width: 90 },
  { key: 'prospectId', label: 'Prospect ID', width: 150, mono: true },
  { key: 'opportunityId', label: 'Opportunity ID', width: 150, mono: true },
  { key: 'country', label: 'Country', width: 130 },
  { key: 'degree', label: 'Degree', width: 110 },
  { key: 'course', label: 'Course', width: 170, ellipsis: true },
  { key: 'intake', label: 'Intake', width: 120 },
  { key: 'disposition', label: 'Disposition', width: 170 },
  { key: 'budget', label: 'Budget', width: 90 },
  { key: 'campaign', label: 'Campaign', width: 190, ellipsis: true },
  { key: 'passport', label: 'Passport', width: 90 },
  { key: 'degreeStatus', label: 'Degree Status', width: 110 },
  { key: 'questionsForCounselor', label: 'Questions', width: 220, ellipsis: true },
  { key: 'callDuration', label: 'Duration', width: 80, numeric: true },
  { key: 'recordingUrl', label: 'Recording', width: 80, sortable: false },
]

const DISPOSITION_COLOR = {
  'Call Transferred To Counsellor': C.green,
  'Interested in Call Back': C.blue,
  'Interested spoken to parents': C.cyan,
  'Discover Future Intent': C.navy,
  'Low Intent Lead': '#94A3B8',
}

function lsGet(key, fallback) { try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? fallback : v } catch { return fallback } }

function parseCsvRow(line) {
  const cols = []
  let buf = '', inQ = false
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ }
    else if (ch === ',' && !inQ) { cols.push(buf.trim()); buf = '' }
    else buf += ch
  }
  cols.push(buf.trim())
  return cols
}

function parseDate(raw) {
  if (!raw) return null
  const s = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0')
  return null
}

function fmtDur(sec) {
  const n = parseInt(sec, 10) || 0
  const m = Math.floor(n / 60), s = n % 60
  return m + ':' + String(s).padStart(2, '0')
}
function fmtDateLabel(iso) {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

// Fetches the recording as a blob and saves it via a throwaway object-URL link, so the
// file downloads in place instead of navigating the tab (the plain <a download> approach
// gets silently ignored by the browser for this cross-origin host, which just opens the
// audio in a new tab instead of saving it). Falls back to opening in a new tab only if the
// fetch itself fails (e.g. the host doesn't allow CORS), so the user isn't left with nothing.
async function downloadRecording(url, filename) {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error('fetch failed: ' + res.status)
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000)
  } catch (err) {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

async function fetchRows() {
  const url = await resolveSheetUrl('humanQlDetail', DEFAULT_CSV)
  const res = await fetch(url + (url.includes('?') ? '&' : '?') + '_=' + Date.now(), { cache: 'no-store' })
  const text = await res.text()
  const rows = text.trim().split('\n').map(parseCsvRow)
  const [hdr, ...data] = rows
  const low = hdr.map(x => x.toLowerCase().trim())
  const h = k => low.indexOf(k)
  return data.filter(r => r.length > 1 && (r[h('prospect_id')] || '').trim()).map(r => ({
    prospectId: r[h('prospect_id')] || '',
    opportunityId: r[h('opportunity_id_futwork')] || '',
    date: parseDate(r[h('activity_date')]),
    country: (r[h('country_interested')] || '').trim() || 'Unknown',
    degree: (r[h('degree_type')] || '').trim() || 'Unknown',
    course: (r[h('preferred_course')] || '').trim(),
    intake: (r[h('preferred_intake')] || '').trim(),
    disposition: (r[h('disposition')] || '').trim() || 'Unknown',
    budget: (r[h('budget')] || '').trim(),
    campaign: (r[h('opp_first_campaign_name')] || '').trim(),
    passport: (r[h('valid_passport')] || '').trim(),
    degreeStatus: (r[h('student_current_degree_status')] || '').trim(),
    questionsForCounselor: (r[h('questions_for_counselor')] || '').trim(),
    callDuration: r[h('call_duration')] || '0',
    recordingUrl: (r[h('call_recording_url')] || '').trim(),
    futworkProject: (r[h('futwork_project')] || '').trim(),
  })).filter(r => r.date)
}

function FilterDropdown({ label, value, options, open, onToggle, onSelect }) {
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button type="button" onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 9px', borderRadius: 7, border: '0.5px solid ' + (open ? C.blue : C.border), background: 'var(--card)', cursor: 'pointer', fontSize: 11, fontWeight: 500, fontFamily: FONT, color: C.text, whiteSpace: 'nowrap' }}>
        <span style={{ color: C.muted, fontWeight: 600 }}>{label}:</span>
        <span style={{ fontWeight: 600 }}>{value === 'all' ? 'All' : value}</span>
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && <div onClick={onToggle} style={{ position: 'fixed', inset: 0, zIndex: 150 }} />}
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 200, minWidth: 160, maxHeight: 320, overflowY: 'auto', background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, boxShadow: '0 12px 32px -8px rgba(15,23,42,0.22)', padding: 4 }}>
          {options.map(o => (
            <button key={o} type="button" onClick={() => onSelect(o)}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 9px', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: value === o ? 700 : 500, fontFamily: FONT, color: value === o ? C.navy : '#374151', background: value === o ? C.navyBg : 'transparent' }}
              onMouseEnter={e => { if (value !== o) e.currentTarget.style.background = '#F3F4F6' }}
              onMouseLeave={e => { if (value !== o) e.currentTarget.style.background = 'transparent' }}>
              {o === 'all' ? 'All' : o}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function fmtClock(sec) {
  if (!isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60)
  return m + ':' + String(s).padStart(2, '0')
}

function RecordingPlayer({ row, onClose }) {
  const audioRef = React.useRef(null)
  const [playing, setPlaying] = useState(true)
  const [curTime, setCurTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [seeking, setSeeking] = useState(false)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    setPlaying(true)
    setCurTime(0)
    setDuration(0)
  }, [row?.recordingUrl])

  const togglePlay = () => {
    const el = audioRef.current
    if (!el) return
    if (el.paused) { el.play(); setPlaying(true) } else { el.pause(); setPlaying(false) }
  }
  const skip = delta => { const el = audioRef.current; if (el) el.currentTime = Math.min(Math.max(0, el.currentTime + delta), duration || Infinity) }
  const toggleMute = () => { const el = audioRef.current; if (!el) return; el.muted = !el.muted; setMuted(el.muted) }
  const handleDownload = async () => {
    if (downloading) return
    setDownloading(true)
    await downloadRecording(row.recordingUrl, (row.prospectId || 'recording') + '.mp3')
    setDownloading(false)
  }

  const pct = duration > 0 ? (curTime / duration) * 100 : 0

  if (!row) return null
  const title = [row.country, row.course].filter(Boolean).join(' — ') || row.prospectId

  return (
    <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 500, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 16, boxShadow: '0 16px 40px -8px rgba(15,23,42,0.28)', padding: '12px 18px', width: 420, fontFamily: FONT }}>
      <audio ref={audioRef} src={row.recordingUrl} autoPlay
        onTimeUpdate={e => { if (!seeking) setCurTime(e.currentTarget.currentTime) }}
        onLoadedMetadata={e => setDuration(e.currentTarget.duration)}
        onEnded={() => setPlaying(false)}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 290 }} title={title}>{title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <button type="button" onClick={handleDownload} disabled={downloading} title="Download recording" style={{ border: 'none', background: 'transparent', cursor: downloading ? 'wait' : 'pointer', color: C.muted, display: 'flex', alignItems: 'center' }}>
            {downloading
              ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ animation: 'spin 0.8s linear infinite' }}><path d="M21 12a9 9 0 1 1-9-9" /></svg>
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>}
          </button>
          <button type="button" onClick={onClose} title="Close" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.muted, display: 'flex', alignItems: 'center' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="button" onClick={() => skip(-10)} title="Back 10s" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.text, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
        </button>
        <button type="button" onClick={togglePlay} title={playing ? 'Pause' : 'Play'}
          style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: `linear-gradient(135deg, ${C.navy}, ${C.blue})`, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {playing
            ? <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
            : <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 2 }}><polygon points="5 3 19 12 5 21 5 3" /></svg>}
        </button>
        <button type="button" onClick={() => skip(10)} title="Forward 10s" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.text, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
        </button>
        <span style={{ fontSize: 11, color: C.muted, fontVariantNumeric: 'tabular-nums', width: 34, flexShrink: 0 }}>{fmtClock(curTime)}</span>
        <input type="range" min={0} max={duration || 0} step={0.1} value={curTime}
          onMouseDown={() => setSeeking(true)}
          onTouchStart={() => setSeeking(true)}
          onChange={e => setCurTime(parseFloat(e.target.value))}
          onMouseUp={e => { const el = audioRef.current; if (el) el.currentTime = parseFloat(e.target.value); setSeeking(false) }}
          onTouchEnd={e => { const el = audioRef.current; if (el) el.currentTime = parseFloat(e.target.value); setSeeking(false) }}
          style={{ flex: 1, height: 4, borderRadius: 99, accentColor: C.blue, background: `linear-gradient(to right, ${C.blue} ${pct}%, #E2E8F0 ${pct}%)`, cursor: 'pointer' }} />
        <span style={{ fontSize: 11, color: C.muted, fontVariantNumeric: 'tabular-nums', width: 34, flexShrink: 0 }}>{fmtClock(duration)}</span>
        <button type="button" onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.muted, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          {muted
            ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></svg>
            : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>}
        </button>
      </div>
    </div>
  )
}

export default function HumanQLDetailDashboard() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [monthDay, setMonthDay] = useState('all')
  const [search, setSearch] = useState('')
  const [countryFilter, setCountryFilter] = useState('all')
  const [dispositionFilter, setDispositionFilter] = useState('all')
  const [openMenu, setOpenMenu] = useState(null)
  const [page, setPage] = useState(1)
  const [playingRow, setPlayingRow] = useState(null)
  const [sortKey, setSortKey] = useState('date')
  const [sortDir, setSortDir] = useState('desc')
  const [downloadingIds, setDownloadingIds] = useState(() => new Set())

  const handleRowDownload = async r => {
    const id = r.prospectId
    setDownloadingIds(prev => new Set(prev).add(id))
    await downloadRecording(r.recordingUrl, (r.prospectId || 'recording') + '.mp3')
    setDownloadingIds(prev => { const next = new Set(prev); next.delete(id); return next })
  }

  const [colOrder, setColOrder] = useState(() => {
    const saved = lsGet(COL_ORDER_KEY, null)
    const keys = HUMAN_QL_COLS.map(c => c.key)
    return (Array.isArray(saved) && saved.length === keys.length && saved.every(k => keys.includes(k))) ? saved : keys
  })
  const [pinnedCols, setPinnedCols] = useState(() => lsGet(COL_PINNED_KEY, []))
  const [hiddenCols, setHiddenCols] = useState(() => lsGet(COL_HIDDEN_KEY, []))
  const [colsOpen, setColsOpen] = useState(false)
  const [dragKey, setDragKey] = useState(null)
  useEffect(() => { try { localStorage.setItem(COL_ORDER_KEY, JSON.stringify(colOrder)) } catch {} }, [colOrder])
  useEffect(() => { try { localStorage.setItem(COL_PINNED_KEY, JSON.stringify(pinnedCols)) } catch {} }, [pinnedCols])
  useEffect(() => { try { localStorage.setItem(COL_HIDDEN_KEY, JSON.stringify(hiddenCols)) } catch {} }, [hiddenCols])
  const reorderTo = (key, targetKey) => setColOrder(prev => {
    if (key === targetKey) return prev
    const next = prev.filter(k => k !== key)
    const idx = next.indexOf(targetKey)
    next.splice(idx, 0, key)
    return next
  })
  const togglePin = key => setPinnedCols(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  const toggleHidden = key => setHiddenCols(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  const resetCols = () => { setColOrder(HUMAN_QL_COLS.map(c => c.key)); setPinnedCols([]); setHiddenCols([]) }

  const [views, setViews] = useState(() => lsGet(VIEWS_KEY, {}))
  useEffect(() => { try { localStorage.setItem(VIEWS_KEY, JSON.stringify(views)) } catch {} }, [views])
  const saveView = () => {
    const name = window.prompt('Name this view:')
    if (!name || !name.trim()) return
    setViews(prev => ({ ...prev, [name.trim()]: { countryFilter, dispositionFilter, search, monthDay } }))
  }
  const loadView = name => {
    const v = views[name]
    if (!v) return
    setCountryFilter(v.countryFilter || 'all')
    setDispositionFilter(v.dispositionFilter || 'all')
    setSearch(v.search || '')
    setMonthDay(v.monthDay || 'all')
  }
  const deleteView = name => setViews(prev => { const next = { ...prev }; delete next[name]; return next })
  const visibleOrder = colOrder.filter(k => !hiddenCols.includes(k))
  const displayOrder = [...visibleOrder.filter(k => pinnedCols.includes(k)), ...visibleOrder.filter(k => !pinnedCols.includes(k))]
  const colWidthOf = k => (HUMAN_QL_COLS.find(c => c.key === k) || {}).width || 120
  const pinnedLeftMap = (() => {
    let acc = 0
    const map = {}
    displayOrder.filter(k => pinnedCols.includes(k)).forEach(k => { map[k] = acc; acc += colWidthOf(k) })
    return map
  })()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchRows().then(r => { if (!cancelled) { setRows(r); setLoading(false) } }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const reload = () => {
    setLoading(true)
    fetchRows().then(r => { setRows(r); setLoading(false) }).catch(() => setLoading(false))
  }

  const scoped = useMemo(() => monthDay === 'all' ? rows : rows.filter(r => r.date === monthDay), [rows, monthDay])

  const filtered = useMemo(() => {
    let out = scoped
    if (countryFilter !== 'all') out = out.filter(r => r.country === countryFilter)
    if (dispositionFilter !== 'all') out = out.filter(r => r.disposition === dispositionFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      out = out.filter(r => r.course.toLowerCase().includes(q) || r.country.toLowerCase().includes(q) || r.campaign.toLowerCase().includes(q) || r.prospectId.toLowerCase().includes(q) || r.opportunityId.toLowerCase().includes(q))
    }
    return out
  }, [scoped, countryFilter, dispositionFilter, search])

  const sorted = useMemo(() => {
    const col = HUMAN_QL_COLS.find(c => c.key === sortKey)
    const arr = [...filtered]
    arr.sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey]
      if (col && col.numeric) { av = parseInt(av, 10) || 0; bv = parseInt(bv, 10) || 0 }
      else { av = (av || '').toString().toLowerCase(); bv = (bv || '').toString().toLowerCase() }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return arr
  }, [filtered, sortKey, sortDir])

  useEffect(() => { setPage(1) }, [countryFilter, dispositionFilter, search, monthDay])

  const availableDays = useMemo(() => [...new Set(rows.map(r => r.date))].filter(Boolean).sort(), [rows])
  const countryOptions = useMemo(() => ['all', ...[...new Set(scoped.map(r => r.country))].sort()], [scoped])
  const dispositionOptions = useMemo(() => ['all', ...[...new Set(scoped.map(r => r.disposition))].sort()], [scoped])

  const kpi = useMemo(() => {
    const total = filtered.length
    const countByCountry = {}
    const countByDisposition = {}
    let durSum = 0, durN = 0
    filtered.forEach(r => {
      countByCountry[r.country] = (countByCountry[r.country] || 0) + 1
      countByDisposition[r.disposition] = (countByDisposition[r.disposition] || 0) + 1
      const d = parseInt(r.callDuration, 10)
      if (d > 0) { durSum += d; durN++ }
    })
    const topCountry = Object.entries(countByCountry).sort((a, b) => b[1] - a[1])[0]
    const topDisposition = Object.entries(countByDisposition).sort((a, b) => b[1] - a[1])[0]
    return {
      total, topCountry: topCountry ? topCountry[0] : '—', topCountryN: topCountry ? topCountry[1] : 0,
      topDisposition: topDisposition ? topDisposition[0] : '—',
      avgDur: durN ? Math.round(durSum / durN) : 0,
      distinctDays: [...new Set(filtered.map(r => r.date))].length,
    }
  }, [filtered])

  const byCountry = useMemo(() => {
    const counts = {}
    filtered.forEach(r => { counts[r.country] = (counts[r.country] || 0) + 1 })
    return Object.entries(counts).map(([country, count]) => ({ country, count })).sort((a, b) => b.count - a.count).slice(0, 8)
  }, [filtered])

  const byDisposition = useMemo(() => {
    const counts = {}
    filtered.forEach(r => { counts[r.disposition] = (counts[r.disposition] || 0) + 1 })
    return Object.entries(counts).map(([disposition, count]) => ({ disposition, count })).sort((a, b) => b.count - a.count)
  }, [filtered])

  const dailyTrend = useMemo(() => {
    const counts = {}
    scoped.forEach(r => { counts[r.date] = (counts[r.date] || 0) + 1 })
    return Object.keys(counts).sort().map(d => ({ date: d, label: fmtDateLabel(d), count: counts[d] }))
  }, [scoped])

  const exportRows = useMemo(() => sorted.map(r => ({
    Date: fmtDateLabel(r.date), Country: r.country, Degree: r.degree, Course: r.course, Intake: r.intake,
    Disposition: r.disposition, Budget: r.budget, Campaign: r.campaign, Passport: r.passport,
    'Degree Status': r.degreeStatus, Questions: r.questionsForCounselor,
    'Duration (sec)': r.callDuration, 'Recording URL': r.recordingUrl,
    'Prospect ID': r.prospectId, 'Opportunity ID': r.opportunityId,
  })), [sorted])

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE))
  const safePage = Math.min(page, pageCount)
  const pageItems = sorted.slice((safePage - 1) * PAGE, safePage * PAGE)

  const toggleSort = key => {
    const col = HUMAN_QL_COLS.find(c => c.key === key)
    if (col && col.sortable === false) return
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const copy = (e, text) => { e.stopPropagation(); navigator.clipboard?.writeText(text) }

  function cell(r, key) {
    switch (key) {
      case 'date': return fmtDateLabel(r.date)
      case 'country': return r.country
      case 'degree': return r.degree
      case 'course': return <span title={r.course}>{r.course || '—'}</span>
      case 'intake': return r.intake || '—'
      case 'disposition': return <span style={{ color: DISPOSITION_COLOR[r.disposition] || C.text, fontWeight: 600 }}>{r.disposition}</span>
      case 'budget': return r.budget || '—'
      case 'campaign': return <span title={r.campaign}>{r.campaign || '—'}</span>
      case 'passport': return r.passport || '—'
      case 'degreeStatus': return r.degreeStatus || '—'
      case 'questionsForCounselor': return <span title={r.questionsForCounselor}>{r.questionsForCounselor || '—'}</span>
      case 'callDuration': return fmtDur(r.callDuration)
      case 'recordingUrl': return r.recordingUrl ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <button type="button" onClick={e => { e.stopPropagation(); setPlayingRow(r) }}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.blue, fontWeight: 600, fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg> Play
          </button>
          <button type="button" onClick={e => { e.stopPropagation(); handleRowDownload(r) }} disabled={downloadingIds.has(r.prospectId)}
            title="Download recording" style={{ border: 'none', background: 'transparent', cursor: downloadingIds.has(r.prospectId) ? 'wait' : 'pointer', color: C.muted, display: 'inline-flex', alignItems: 'center' }}>
            {downloadingIds.has(r.prospectId)
              ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ animation: 'spin 0.8s linear infinite' }}><path d="M21 12a9 9 0 1 1-9-9" /></svg>
              : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>}
          </button>
        </span>
      ) : '—'
      case 'prospectId': return r.prospectId ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'monospace', fontSize: 11 }} title={'Open Contact in LeadSquared: ' + r.prospectId}>
          <a href={LEADSQUARED_CONTACT_URL + encodeURIComponent(r.prospectId)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ color: C.blue, textDecoration: 'none' }}>{r.prospectId.slice(0, 8)}…</a>
          <button type="button" onClick={e => copy(e, r.prospectId)} title="Copy" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.muted, display: 'inline-flex' }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
          </button>
        </span>
      ) : '—'
      case 'opportunityId': return r.opportunityId ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'monospace', fontSize: 11 }} title={'Open Opportunity in LeadSquared: ' + r.opportunityId}>
          <a href={LEADSQUARED_OPPORTUNITY_URL + encodeURIComponent(r.opportunityId) + '&opportunityEvent=' + LEADSQUARED_OPPORTUNITY_EVENT} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ color: C.blue, textDecoration: 'none' }}>{r.opportunityId.slice(0, 8)}…</a>
          <button type="button" onClick={e => copy(e, r.opportunityId)} title="Copy" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.muted, display: 'inline-flex' }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
          </button>
        </span>
      ) : '—'
      default: return '—'
    }
  }

  const th = { padding: '10px 12px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', cursor: 'grab', userSelect: 'none' }
  const td = { padding: '9px 12px', fontSize: 12.5, color: C.text, borderTop: '0.5px solid #F1F4F9', whiteSpace: 'nowrap' }

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.bg, fontFamily: FONT }}>
        <Sidebar />
        <div style={{ flex: 1, overflow: 'auto' }}><DashboardSkeleton /></div>
      </div>
    )
  }

  return (
    <div className="lq-page-shell" style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.bg, fontFamily: FONT }}>
      <Sidebar />
      <div style={{ margin: '12px 14px 0', borderRadius: 14, border: '1px solid #EEF1F6', boxShadow: '0 1px 3px rgba(31,60,132,0.06)', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <div style={{ background: 'var(--card)', borderBottom: '0.5px solid ' + C.border, padding: '0 28px', minHeight: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0, flexWrap: 'wrap' }}>
          <div style={{ padding: '10px 0' }}>
            <p style={{ fontSize: 10.5, color: C.muted, margin: 0, letterSpacing: '0.05em', textTransform: 'uppercase' }}>QL Ops / Human QL Detail</p>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: '2px 0 0', letterSpacing: '-0.4px' }}>Human QL Detail</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FilterDropdown label="Day" value={monthDay} options={['all', ...availableDays]}
              open={openMenu === 'day'} onToggle={() => setOpenMenu(v => v === 'day' ? null : 'day')}
              onSelect={v => { setMonthDay(v); setOpenMenu(null) }} />
            <Button onClick={reload} disabled={loading} title="Refresh data" size="sm">
              {loading ? 'Refreshing' : 'Refresh'}
            </Button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
          <div className="lq-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14, marginBottom: 20 }}>
            <PremKPI label={monthDay === 'all' ? 'Total QLs (Month)' : 'QLs on ' + fmtDateLabel(monthDay)} value={fmtN(kpi.total)} sub="Human-qualified leads" accent={C.navy} icon={KPI_ICONS.total} />
            <PremKPI label="Top Country" value={kpi.topCountry} sub={fmtN(kpi.topCountryN) + ' leads'} accent={C.blue} icon={KPI_ICONS.globe} />
            <PremKPI label="Top Disposition" value={kpi.topDisposition} sub="Most common outcome" accent={C.cyan} icon={KPI_ICONS.agent} />
            <PremKPI label="Avg Call Duration" value={fmtDur(kpi.avgDur)} sub={kpi.distinctDays + ' days covered'} accent={C.green} icon={KPI_ICONS.bot} />
          </div>

          <div className="lq-grid3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
            <Card title="By Country" sub="Top destination countries">
              <RankedBars data={byCountry} labelKey="country" max={byCountry[0]?.count || 0} total={kpi.total} showRank />
            </Card>
            <Card title="By Disposition" sub="Call outcome breakdown">
              <RankedBars data={byDisposition} labelKey="disposition" max={byDisposition[0]?.count || 0} total={kpi.total} colorFn={i => DISPOSITION_COLOR[byDisposition[i]?.disposition] || C.navy} />
            </Card>
            <Card title="Daily Trend" sub="QLs per day this month" noPad>
              <div style={{ height: 220, padding: '12px 12px 4px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyTrend} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#EEF1F5" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.muted }} axisLine={false} tickLine={false} interval={dailyTrend.length > 10 ? 1 : 0} />
                    <YAxis hide />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 10, border: '0.5px solid ' + C.border }} />
                    <Bar dataKey="count" fill={C.navy} radius={[4, 4, 0, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <Card title={'Lead detail — ' + fmtN(sorted.length) + ' records'} sub="Search by course, country, campaign or ID · drag column headers to reorder" noPad
            action={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', position: 'relative' }}>
                <input type="text" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
                  style={{ padding: '5px 10px', border: '0.5px solid ' + C.border, borderRadius: 7, fontSize: 12, fontFamily: FONT, outline: 'none', width: 140, background: 'var(--card)', color: C.text }} />
                <FilterDropdown label="Country" value={countryFilter} options={countryOptions}
                  open={openMenu === 'country'} onToggle={() => setOpenMenu(v => v === 'country' ? null : 'country')}
                  onSelect={v => { setCountryFilter(v); setOpenMenu(null) }} />
                <FilterDropdown label="Disposition" value={dispositionFilter} options={dispositionOptions}
                  open={openMenu === 'disposition'} onToggle={() => setOpenMenu(v => v === 'disposition' ? null : 'disposition')}
                  onSelect={v => { setDispositionFilter(v); setOpenMenu(null) }} />
                <button type="button" onClick={() => setColsOpen(v => !v)} title="Views &amp; Columns"
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, border: '0.5px solid ' + C.border, cursor: 'pointer', flexShrink: 0, background: colsOpen ? C.navy : '#fff', color: colsOpen ? '#fff' : '#6B7280' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h18M3 6h18M3 18h18" /></svg>
                </button>
                <ExportButton data={exportRows} filename="human_ql_detail" dashboardId="lq_ops_detail" />
                {colsOpen && (
                  <>
                    <div onClick={() => setColsOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 98 }} />
                    <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 99, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 4, minWidth: 240, maxHeight: 420, overflowY: 'auto' }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '2px 10px 6px' }}>Saved views</div>
                      <div style={{ padding: '0 10px 8px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {Object.keys(views).length === 0 && <span style={{ fontSize: 11.5, color: '#9CA3AF' }}>None yet</span>}
                        {Object.keys(views).map(name => (
                          <span key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#F3F4F6', borderRadius: 7, padding: '3px 4px 3px 9px' }}>
                            <button type="button" onClick={() => { loadView(name); setColsOpen(false) }} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, color: '#374151', padding: 0 }}>{name}</button>
                            <button type="button" onClick={() => deleteView(name)} title="Delete view" style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, color: '#9CA3AF', padding: '0 4px', lineHeight: 1 }}>×</button>
                          </span>
                        ))}
                      </div>
                      <div style={{ margin: '0 10px 10px' }}>
                        <Button onClick={saveView} size="sm" variant="secondary" style={{ width: '100%' }}>+ Save current filters as view</Button>
                      </div>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '6px 10px 8px', borderTop: '0.5px solid #F3F4F6' }}>Columns (drag to reorder)</div>
                      {colOrder.map(key => {
                        const c = HUMAN_QL_COLS.find(cc => cc.key === key)
                        const isPinned = pinnedCols.includes(key)
                        const isHidden = hiddenCols.includes(key)
                        return (
                          <div key={key} draggable
                            onDragStart={() => setDragKey(key)}
                            onDragOver={e => e.preventDefault()}
                            onDrop={e => { e.preventDefault(); if (dragKey) reorderTo(dragKey, key); setDragKey(null) }}
                            onDragEnd={() => setDragKey(null)}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', opacity: isHidden ? 0.45 : 1, cursor: 'grab', background: dragKey === key ? '#F3F4F6' : 'transparent', borderRadius: 6 }}>
                            <span style={{ color: '#9CA3AF', flexShrink: 0, display: 'flex' }}><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="7" cy="5" r="1.5" /><circle cx="7" cy="12" r="1.5" /><circle cx="7" cy="19" r="1.5" /><circle cx="14" cy="5" r="1.5" /><circle cx="14" cy="12" r="1.5" /><circle cx="14" cy="19" r="1.5" /></svg></span>
                            <span style={{ flex: 1, fontSize: 12.5, color: '#374151', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c ? c.label : key}</span>
                            <button type="button" onClick={() => togglePin(key)} title={isPinned ? 'Unpin' : 'Pin column'} style={{ width: 22, height: 22, borderRadius: 5, border: '0.5px solid #E5E7EB', background: isPinned ? '#EEF1FB' : '#fff', color: isPinned ? '#1F3C84' : '#9CA3AF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="17" x2="12" y2="22" /><path d="M5 17h14l-1.4-6.6A2 2 0 0015.6 9H8.4a2 2 0 00-2 1.4L5 17z" /><path d="M9 9V4h6v5" /></svg>
                            </button>
                            <button type="button" onClick={() => toggleHidden(key)} title={isHidden ? 'Show column' : 'Hide column'} style={{ width: 22, height: 22, borderRadius: 5, border: '0.5px solid #E5E7EB', background: '#fff', color: isHidden ? '#9CA3AF' : '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {isHidden
                                ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                                : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>}
                            </button>
                          </div>
                        )
                      })}
                      <div style={{ borderTop: '0.5px solid #F3F4F6', marginTop: 6, paddingTop: 6 }}>
                        <Button onClick={resetCols} size="sm" variant="ghost" style={{ width: '100%', justifyContent: 'flex-start', color: '#1C9FD4' }}>Reset to default (clears pins &amp; hidden)</Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            }>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  {displayOrder.map(key => {
                    const c = HUMAN_QL_COLS.find(cc => cc.key === key)
                    const sortable = !c || c.sortable !== false
                    const isPinned = pinnedCols.includes(key)
                    const thStyle = { ...th, ...(isPinned ? { position: 'sticky', left: pinnedLeftMap[key], zIndex: 3, background: '#F9FAFB', borderRight: pinnedCols[pinnedCols.length - 1] === key ? '1px solid #E5E7EB' : 'none' } : {}) }
                    return (
                      <th key={key} style={thStyle}
                        draggable={!isPinned}
                        onDragStart={() => setDragKey(key)}
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => { e.preventDefault(); if (dragKey) reorderTo(dragKey, key); setDragKey(null) }}
                        onDragEnd={() => setDragKey(null)}>
                        <span onClick={() => sortable && toggleSort(key)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: sortable ? 'pointer' : (isPinned ? 'default' : 'grab') }}>
                          {c ? c.label : key}
                          {sortable && sortKey === key && <span style={{ color: C.blue }}>{sortDir === 'asc' ? '▲' : '▼'}</span>}
                        </span>
                      </th>
                    )
                  })}
                </tr></thead>
                <tbody>
                  {pageItems.map((r, i) => {
                    const isHot = r.disposition === HOT_DISPOSITION
                    return (
                      <tr key={r.prospectId || i} style={{ background: isHot ? C.greenBg : 'transparent' }} title={isHot ? 'Call transferred to counsellor -- hot lead' : undefined}>
                        {displayOrder.map((key, colIdx) => {
                          const isPinned = pinnedCols.includes(key)
                          const tdStyle = {
                            ...td,
                            background: isPinned ? (isHot ? C.greenBg : '#fff') : 'transparent',
                            borderLeft: colIdx === 0 && isHot ? '3px solid ' + C.green : 'none',
                            ...(isPinned ? { position: 'sticky', left: pinnedLeftMap[key], zIndex: 1, borderRight: pinnedCols[pinnedCols.length - 1] === key ? '1px solid #F3F4F6' : 'none' } : {}),
                          }
                          return <td key={key} style={tdStyle}>{cell(r, key)}</td>
                        })}
                      </tr>
                    )
                  })}
                  {pageItems.length === 0 && (
                    <tr><td colSpan={displayOrder.length} style={{ ...td, textAlign: 'center', color: C.muted, padding: '24px 12px' }}>No leads match these filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {pageCount > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 12px', borderTop: '0.5px solid #F1F4F9' }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1}
                  style={{ padding: '5px 12px', borderRadius: 7, border: '0.5px solid ' + C.border, background: '#fff', fontSize: 12, cursor: safePage === 1 ? 'default' : 'pointer', opacity: safePage === 1 ? 0.5 : 1 }}>Prev</button>
                <span style={{ fontSize: 12, color: C.muted }}>Page {safePage} of {pageCount}</span>
                <button onClick={() => setPage(p => Math.min(pageCount, p + 1))} disabled={safePage === pageCount}
                  style={{ padding: '5px 12px', borderRadius: 7, border: '0.5px solid ' + C.border, background: '#fff', fontSize: 12, cursor: safePage === pageCount ? 'default' : 'pointer', opacity: safePage === pageCount ? 0.5 : 1 }}>Next</button>
              </div>
            )}
          </Card>
        </div>
      </div>

      {playingRow && <RecordingPlayer row={playingRow} onClose={() => setPlayingRow(null)} />}
    </div>
  )
}
