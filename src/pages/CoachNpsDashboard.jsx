import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Cell, ReferenceLine,
} from 'recharts'
import Sidebar from '../components/Sidebar'
import ExportButton from '../components/ExportButton'
import Button from '../components/Button'
import DateRangePicker from '../components/DateRangePicker'
import { DashboardSkeleton } from '../components/SkeletonLoader'
import { C, FONT, Card, PremKPI, KPI_ICONS, fmtN, GRID_STROKE } from '../ui/dashboardKit'
import { getSession, setSession } from '../lib/sessionLoad'

// ---------------------------------------------------------------------------
// Coach NPS. Pre-sales ratings come from leverage_direct.call_nps (mirrored into
// Supabase by the call_nps_sync mode); post-sales has its own slot and shows an
// honest "not connected yet" state until that table exists. Who sees what is
// decided SERVER-SIDE from Team Mapping (api/crm-leads.js, handleCoachNps) -- the
// browser only ever receives rows the signed-in person is allowed to see.
// ---------------------------------------------------------------------------

const PRESETS = [
  ['last_7', 'Last 7 days'], ['last_30', 'Last 30 days'], ['this_month', 'This month'],
  ['last_month', 'Last month'], ['all', 'All time'],
]
const PAGE_SIZE = 25

function fmtYmd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function parseYmd(s) { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
function presetRange(key) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const back = n => { const x = new Date(today); x.setDate(x.getDate() - n); return x }
  if (key === 'last_7') return { since: fmtYmd(back(6)), until: fmtYmd(today) }
  if (key === 'last_30') return { since: fmtYmd(back(29)), until: fmtYmd(today) }
  if (key === 'this_month') return { since: fmtYmd(new Date(today.getFullYear(), today.getMonth(), 1)), until: fmtYmd(today) }
  if (key === 'last_month') return { since: fmtYmd(new Date(today.getFullYear(), today.getMonth() - 1, 1)), until: fmtYmd(new Date(today.getFullYear(), today.getMonth(), 0)) }
  return { since: '2020-01-01', until: fmtYmd(today) }
}

// Promoter 9-10, Passive 7-8, Detractor 0-6. NPS = %promoters - %detractors.
function npsOf(p, d, total) { return total > 0 ? Math.round(((p - d) / total) * 100) : null }
const nf = v => (v === null || v === undefined ? '—' : String(v))
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthLabel = m => { const [y, mm] = m.split('-'); return `${MONTHS[Number(mm) - 1]} ${y.slice(2)}` }
const dayLabel = d => { const [, mm, dd] = d.split('-'); return `${Number(dd)} ${MONTHS[Number(mm) - 1]}` }
function npsColor(v) { if (v === null || v === undefined) return C.muted; if (v >= 50) return C.green; if (v >= 0) return C.blue; return C.navy }
const forStage = (arr, stage) => (arr || []).filter(x => x.stage === stage)

async function fetchJson(url) {
  const r = await fetch(url, { credentials: 'include' })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
  return d
}

function useClickOutside(open, onClose) {
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const h = e => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  return ref
}

// ---- small presentational pieces ------------------------------------------

function MixBar({ p, pa, d, height = 8 }) {
  const t = p + pa + d
  if (!t) return <div style={{ height, borderRadius: 99, background: 'var(--bg3)' }} />
  return (
    <div style={{ display: 'flex', height, borderRadius: 99, overflow: 'hidden', background: 'var(--bg3)' }} title={`${p} promoters, ${pa} passives, ${d} detractors`}>
      <span style={{ width: `${(p / t) * 100}%`, background: C.green }} />
      <span style={{ width: `${(pa / t) * 100}%`, background: C.cyan }} />
      <span style={{ width: `${(d / t) * 100}%`, background: C.navy }} />
    </div>
  )
}

function MixLegend({ p, pa, d }) {
  const t = p + pa + d
  const pc = n => (t ? Math.round((n / t) * 100) + '%' : '—')
  const dot = c => <span style={{ width: 8, height: 8, borderRadius: 99, background: c, display: 'inline-block', marginRight: 5 }} />
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11.5, color: C.sub, fontFamily: FONT, marginTop: 8 }}>
      <span>{dot(C.green)}Promoters (9–10) <b style={{ color: C.text }}>{pc(p)}</b></span>
      <span>{dot(C.cyan)}Passives (7–8) <b style={{ color: C.text }}>{pc(pa)}</b></span>
      <span>{dot(C.navy)}Detractors (0–6) <b style={{ color: C.text }}>{pc(d)}</b></span>
    </div>
  )
}

function DistChart({ dist }) {
  const counts = Array.from({ length: 11 }, (_, i) => ({ r: i, n: (dist.find(x => Number(x.rating) === i) || {}).n || 0 }))
  return (
    <div style={{ height: 150 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={counts} margin={{ top: 14, right: 4, left: -22, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} />
          <XAxis dataKey="r" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip cursor={{ fill: 'rgba(31,60,132,0.05)' }} formatter={v => [fmtN(v), 'Ratings']} labelFormatter={l => `Score ${l}`} />
          <Bar dataKey="n" radius={[4, 4, 0, 0]} maxBarSize={26}>
            {counts.map(c => <Cell key={c.r} fill={c.r >= 9 ? C.green : c.r >= 7 ? C.cyan : C.navy} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function StagePanel({ title, tag, ov, dist, available, note }) {
  return (
    <div style={{ flex: '1 1 420px', minWidth: 0, background: 'var(--card)', border: `0.5px solid ${C.border}`, borderRadius: 16, padding: 18, boxShadow: '0 1px 4px rgba(15,23,42,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.text, fontFamily: FONT }}>{title}</div>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', padding: '2px 8px', borderRadius: 99, background: available ? 'var(--navy-tint)' : 'var(--bg3)', color: available ? C.navy : C.muted, fontFamily: FONT }}>{tag}</span>
      </div>
      {!available ? (
        <div style={{ padding: '38px 12px', textAlign: 'center', color: C.muted, fontSize: 13, fontFamily: FONT, lineHeight: 1.6 }}>
          <div style={{ fontWeight: 800, color: C.sub, marginBottom: 4 }}>Not connected yet</div>
          {note}
        </div>
      ) : ov.total === 0 ? (
        <div style={{ padding: '38px 12px', textAlign: 'center', color: C.muted, fontSize: 13, fontFamily: FONT }}>No ratings in this window.</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 10 }}>
            {[
              ['NPS', nf(ov.nps), npsColor(ov.nps)],
              ['Ratings', fmtN(ov.total), C.text],
              ['Unique students', fmtN(ov.students), C.text],
              ['Avg rating', ov.avg === null ? '—' : Number(ov.avg).toFixed(2), C.text],
            ].map(([l, v, col]) => (
              <div key={l} style={{ background: 'var(--bg2)', borderRadius: 12, padding: '10px 12px', minWidth: 0 }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: C.muted, fontFamily: FONT }}>{l}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: col, letterSpacing: '-.5px', fontFamily: FONT, marginTop: 2 }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14 }}>
            <MixBar p={ov.promoters} pa={ov.passives} d={ov.detractors} height={10} />
            <MixLegend p={ov.promoters} pa={ov.passives} d={ov.detractors} />
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: C.muted, margin: '16px 0 2px', fontFamily: FONT }}>Rating distribution (0–10)</div>
          <DistChart dist={dist} />
        </>
      )}
    </div>
  )
}

function TrendTip({ active, payload, label, fmtLabel }) {
  if (!active || !payload || !payload.length) return null
  const row = payload[0].payload
  return (
    <div style={{ background: 'var(--card)', border: `0.5px solid ${C.border}`, borderRadius: 10, padding: '8px 12px', fontSize: 12, fontFamily: FONT, boxShadow: '0 8px 24px rgba(15,23,42,.14)' }}>
      <div style={{ fontWeight: 800, color: C.text, marginBottom: 4 }}>{fmtLabel(label)}</div>
      {row.pre !== null && row.pre !== undefined && <div style={{ color: C.navy }}>Pre-sales NPS <b>{row.pre}</b> · {fmtN(row.preN)} ratings</div>}
      {row.post !== null && row.post !== undefined && <div style={{ color: C.cyan }}>Post-sales NPS <b>{row.post}</b> · {fmtN(row.postN)} ratings</div>}
    </div>
  )
}

function TrendChart({ rows, keyName, fmtLabel, hasPost }) {
  if (!rows.length) return <div style={{ padding: '36px 0', textAlign: 'center', color: C.muted, fontSize: 13, fontFamily: FONT }}>No ratings in this window.</div>
  return (
    <div style={{ height: 230 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 10, right: 12, left: -14, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} />
          <XAxis dataKey={keyName} tickFormatter={fmtLabel} tick={{ fontSize: 10.5, fill: '#94A3B8' }} axisLine={false} tickLine={false} minTickGap={18} />
          <YAxis domain={[-100, 100]} ticks={[-100, -50, 0, 50, 100]} tick={{ fontSize: 10.5, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
          <ReferenceLine y={0} stroke="#CBD5E1" />
          <Tooltip content={<TrendTip fmtLabel={fmtLabel} />} />
          <Line type="monotone" dataKey="pre" stroke={C.navy} strokeWidth={2.4} dot={{ r: 3 }} connectNulls name="Pre-sales" />
          {hasPost && <Line type="monotone" dataKey="post" stroke={C.cyan} strokeWidth={2.4} dot={{ r: 3 }} connectNulls name="Post-sales" />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function seriesFor(data, field, keyName) {
  const pre = forStage(data[field], 'pre'), post = forStage(data[field], 'post')
  const keys = [...new Set([...pre, ...post].map(x => x[keyName === 'd' ? 'd' : 'm']))].sort()
  const k = keyName === 'd' ? 'd' : 'm'
  return keys.map(key => {
    const a = pre.find(x => x[k] === key), b = post.find(x => x[k] === key)
    return {
      [keyName]: key,
      pre: a ? npsOf(a.promoters, a.detractors, a.total) : null, preN: a ? a.total : 0,
      post: b ? npsOf(b.promoters, b.detractors, b.total) : null, postN: b ? b.total : 0,
    }
  })
}

function overallOf(data, stage) {
  const o = forStage(data.overall, stage)[0]
  if (!o) return { total: 0, students: 0, avg: null, promoters: 0, passives: 0, detractors: 0, nps: null }
  return { ...o, avg: o.avg === null ? null : Number(o.avg), nps: npsOf(o.promoters, o.detractors, o.total) }
}

// ---- coach drill-down ------------------------------------------------------

function CoachDrill({ row, range, onClose }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => {
    let dead = false
    fetchJson(`/api/crm-leads?source=coach_nps&from=${range.since}&to=${range.until}&coach=${encodeURIComponent(row.email)}`)
      .then(d => { if (!dead) setData(d) }).catch(e => { if (!dead) setErr(e.message) })
    return () => { dead = true }
  }, [row.email, range.since, range.until])
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  const pre = data ? overallOf(data, 'pre') : null
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(15,23,42,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 16px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true"
        style={{ width: 'min(980px, 100%)', background: 'var(--bg)', borderRadius: 18, border: `0.5px solid ${C.border}`, boxShadow: '0 30px 80px rgba(15,23,42,.35)', fontFamily: FONT }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '18px 22px', borderBottom: `0.5px solid ${C.border}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{row.name || row.email}</div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{row.email}{row.manager ? ` · Manager: ${row.manager}` : ''}{row.ssm ? ` · SSM: ${row.ssm}` : ''} · {range.since} → {range.until}</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ border: `0.5px solid ${C.border}`, background: 'var(--card)', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', color: C.sub, fontSize: 16 }}>×</button>
        </div>
        <div style={{ padding: 22 }}>
          {err && <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--navy-tint)', color: C.navy, fontSize: 13 }}>{err}</div>}
          {!data && !err && <DashboardSkeleton />}
          {data && data.ready === false && <div style={{ color: C.muted, fontSize: 13 }}>{data.error}</div>}
          {data && data.ready !== false && (
            <>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <StagePanel title="Pre-sales" tag="Live" ov={pre} dist={forStage(data.distribution, 'pre')} available />
                <StagePanel title="Post-sales" tag="Soon" ov={overallOf(data, 'post')} dist={[]} available={false} note="Post-sales ratings will appear here once that data source is connected." />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16, marginTop: 16 }}>
                <Card title="Day-on-day NPS" sub="Each point is one day's NPS from that day's ratings"><TrendChart rows={seriesFor(data, 'by_day', 'd')} keyName="d" fmtLabel={dayLabel} hasPost={false} /></Card>
                <Card title="Month-on-month NPS" sub="Full history, not limited to the date range"><TrendChart rows={seriesFor(data, 'by_month', 'm')} keyName="m" fmtLabel={monthLabel} hasPost={false} /></Card>
              </div>
              <div style={{ marginTop: 16, padding: '14px 16px', borderRadius: 12, background: 'var(--bg2)', border: `0.5px dashed ${C.border}`, fontSize: 12.5, color: C.sub, lineHeight: 1.6 }}>
                <b style={{ color: C.text }}>Call recordings</b> — a playable recording per rating, so a manager can hear what went wrong, is the next phase. It needs a recording URL on each NPS row from the data team; it will appear here as a list of this coach's ratings with a play button.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ---- page ------------------------------------------------------------------

export default function CoachNpsDashboard() {
  const [datePreset, setDatePreset] = useState('last_30')
  const [customRange, setCustomRange] = useState(null)
  const [showCalendar, setShowCalendar] = useState(false)
  const calRef = useClickOutside(showCalendar, () => setShowCalendar(false))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [syncedAt, setSyncedAt] = useState(null)
  const [level, setLevel] = useState('coach')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState({ key: 'total', dir: -1 })
  const [page, setPage] = useState(0)
  const [infoOpen, setInfoOpen] = useState(false)
  const infoRef = useClickOutside(infoOpen, () => setInfoOpen(false))
  const [drill, setDrill] = useState(null)

  const range = datePreset === 'custom' && customRange ? customRange : presetRange(datePreset)

  async function load(force) {
    const key = `coach_nps_v1:${range.since}:${range.until}`
    if (!force) {
      const c = getSession(key)
      if (c) { setData(c.data.result); setSyncedAt(c.data.ts); setLoading(false); setError(null); return }
    }
    setLoading(true); setError(null)
    try {
      const d = await fetchJson(`/api/crm-leads?source=coach_nps&from=${range.since}&to=${range.until}`)
      setData(d)
      const ts = new Date()
      setSyncedAt(ts)
      setSession(key, { result: d, ts })
    } catch (e) {
      setError(e.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load(false) }, [range.since, range.until]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(0) }, [search, level, sort, range.since, range.until])

  const scopeLevel = data && data.scope ? data.scope.level : null
  const levels = useMemo(() => {
    if (scopeLevel === 'admin') return [['coach', 'Coach'], ['manager', 'Manager'], ['ssm', 'Senior manager']]
    if (scopeLevel === 'ssm') return [['coach', 'Coach'], ['manager', 'Manager']]
    return []
  }, [scopeLevel])
  useEffect(() => { if (levels.length && !levels.find(l => l[0] === level)) setLevel('coach') }, [levels]) // eslint-disable-line react-hooks/exhaustive-deps

  const ready = data && data.ready !== false
  const pre = useMemo(() => (ready ? overallOf(data, 'pre') : null), [data, ready])
  const post = useMemo(() => (ready ? overallOf(data, 'post') : null), [data, ready])
  const hasPost = !!(ready && post && post.total > 0)
  const daySeries = useMemo(() => (ready ? seriesFor(data, 'by_day', 'd') : []), [data, ready])
  const monthSeries = useMemo(() => (ready ? seriesFor(data, 'by_month', 'm') : []), [data, ready])

  // One row per coach (or per manager / SSM when rolled up), pre + post side by side.
  const rows = useMemo(() => {
    if (!ready) return []
    const team = data.team || {}
    const map = new Map()
    for (const x of data.by_coach || []) {
      const t = team[x.coach_email] || {}
      let key, name, extra = {}
      if (level === 'manager') { key = t.manager || 'Unmapped'; name = key }
      else if (level === 'ssm') { key = t.ssm || 'Unmapped'; name = key }
      else { key = x.coach_email; name = x.coach_name || x.coach_email; extra = { email: x.coach_email, manager: t.manager || null, ssm: t.ssm || null } }
      if (!map.has(key)) map.set(key, { key, name, coaches: new Set(), pre: null, post: null, ...extra })
      const g = map.get(key)
      g.coaches.add(x.coach_email)
      const slot = x.stage === 'post' ? 'post' : 'pre'
      const cur = g[slot] || { total: 0, students: 0, sum: 0, promoters: 0, passives: 0, detractors: 0 }
      cur.total += x.total; cur.students += x.students; cur.sum += Number(x.avg) * x.total
      cur.promoters += x.promoters; cur.passives += x.passives; cur.detractors += x.detractors
      g[slot] = cur
    }
    const fin = s => (s ? { ...s, avg: s.total ? s.sum / s.total : null, nps: npsOf(s.promoters, s.detractors, s.total) } : null)
    return [...map.values()].map(g => ({ ...g, pre: fin(g.pre), post: fin(g.post), coachCount: g.coaches.size }))
  }, [data, ready, level])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const out = rows.filter(r => !q || r.name.toLowerCase().includes(q) || (r.email || '').includes(q) || (r.manager || '').toLowerCase().includes(q) || (r.ssm || '').toLowerCase().includes(q))
    const val = r => {
      const k = sort.key
      if (k === 'name') return r.name.toLowerCase()
      if (k === 'coaches') return r.coachCount
      const p = r.pre || {}
      return p[k] === undefined || p[k] === null ? -Infinity : p[k]
    }
    return out.sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir })
  }, [rows, search, sort])

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pages - 1)
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  const exportRows = useMemo(() => filtered.map(r => ({
    [level === 'coach' ? 'Coach' : level === 'manager' ? 'Manager' : 'Senior manager']: r.name,
    ...(level === 'coach' ? { Email: r.email, Manager: r.manager || '', 'Senior manager': r.ssm || '' } : { Coaches: r.coachCount }),
    'Pre-sales ratings': r.pre ? r.pre.total : 0, 'Pre-sales unique students': r.pre ? r.pre.students : 0,
    'Pre-sales avg rating': r.pre && r.pre.avg !== null ? Number(r.pre.avg).toFixed(2) : '',
    'Pre-sales promoters': r.pre ? r.pre.promoters : 0, 'Pre-sales passives': r.pre ? r.pre.passives : 0, 'Pre-sales detractors': r.pre ? r.pre.detractors : 0,
    'Pre-sales NPS': r.pre && r.pre.nps !== null ? r.pre.nps : '',
    'Post-sales ratings': r.post ? r.post.total : 0, 'Post-sales NPS': r.post && r.post.nps !== null ? r.post.nps : '',
  })), [filtered, level])

  const sortBy = key => setSort(s => (s.key === key ? { key, dir: -s.dir } : { key, dir: key === 'name' ? 1 : -1 }))
  const arrow = key => (sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : '')
  const presetLabel = datePreset === 'custom' && customRange ? `${customRange.since} → ${customRange.until}` : (PRESETS.find(p => p[0] === datePreset) || [])[1]

  const subtitle = !scopeLevel ? 'Customer ratings of coaching calls, by coach.'
    : scopeLevel === 'admin' ? 'Every coach across the org, with manager and senior-manager roll-ups.'
    : scopeLevel === 'ssm' ? `Your senior-manager view: ${data.scope.coachCount ? data.scope.coachCount - 1 : 0} coaches across your managers.`
    : scopeLevel === 'manager' ? `Your team: ${data.scope.coachCount ? data.scope.coachCount - 1 : 0} coaches.`
    : 'Your own ratings.'

  const th = { padding: '9px 10px', textAlign: 'right', fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: C.muted, whiteSpace: 'nowrap', background: 'var(--bg2)', position: 'sticky', top: 0, cursor: 'pointer', userSelect: 'none', fontFamily: FONT }
  const td = { padding: '9px 10px', textAlign: 'right', fontSize: 12.5, color: C.text, whiteSpace: 'nowrap', borderTop: `0.5px solid ${C.border}`, fontFamily: FONT }

  return (
    <div className="lq-page-shell" style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)', fontFamily: FONT }}>
      <Sidebar />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flexShrink: 0, padding: '28px 0 0' }}>
          <div style={{ padding: '0 28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.text }}>Coach NPS</div>
              {scopeLevel && (
                <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', padding: '3px 9px', borderRadius: 99, background: 'var(--navy-tint)', color: C.navy }}>
                  {scopeLevel === 'admin' ? 'All coaches' : scopeLevel === 'ssm' ? 'Your org' : scopeLevel === 'manager' ? 'Your team' : 'You'}
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 4, maxWidth: 760 }}>{subtitle}</div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '16px 28px 0', padding: '10px 12px', background: 'var(--bg2)', border: `0.5px solid ${C.border}`, borderRadius: 12 }}>
            {PRESETS.map(([k, l]) => (
              <button key={k} onClick={() => { setDatePreset(k); setCustomRange(null) }} style={{
                padding: '7px 14px', borderRadius: 8, border: `0.5px solid ${datePreset === k ? C.navy : C.border}`,
                background: datePreset === k ? 'var(--navy-tint)' : 'var(--card)', color: datePreset === k ? C.navy : C.text,
                fontSize: 12.5, fontWeight: 700, fontFamily: FONT, cursor: 'pointer', whiteSpace: 'nowrap',
              }}>{l}</button>
            ))}
            <div ref={calRef} style={{ position: 'relative' }}>
              <button onClick={() => setShowCalendar(v => !v)} style={{
                padding: '7px 14px', borderRadius: 8, border: `0.5px solid ${datePreset === 'custom' ? C.navy : C.border}`,
                background: datePreset === 'custom' ? 'var(--navy-tint)' : 'var(--card)', color: datePreset === 'custom' ? C.navy : C.text,
                fontSize: 12.5, fontWeight: 700, fontFamily: FONT, cursor: 'pointer', whiteSpace: 'nowrap',
              }}>{datePreset === 'custom' && customRange ? presetLabel : 'Custom range'}</button>
              {showCalendar && (
                <div style={{ position: 'absolute', left: 0, top: 'calc(100% + 8px)', zIndex: 50, background: 'var(--card)', border: `0.5px solid ${C.border}`, borderRadius: 14, boxShadow: '0 20px 60px rgba(15,23,42,0.16)', overflow: 'hidden' }}>
                  <DateRangePicker from={parseYmd(customRange && customRange.since)} to={parseYmd(customRange && customRange.until)}
                    onChange={(from, to) => { setCustomRange({ since: from, until: to }); setDatePreset('custom'); setShowCalendar(false) }} />
                </div>
              )}
            </div>
            {levels.length > 0 && (
              <>
                <div style={{ width: 1, alignSelf: 'stretch', background: C.border, margin: '0 2px' }} />
                <span style={{ fontSize: 11.5, fontWeight: 800, color: C.muted, letterSpacing: '.06em', textTransform: 'uppercase' }}>Roll up by</span>
                {levels.map(([k, l]) => (
                  <button key={k} onClick={() => setLevel(k)} style={{
                    padding: '7px 12px', borderRadius: 8, border: `0.5px solid ${level === k ? C.navy : C.border}`,
                    background: level === k ? 'var(--navy-tint)' : 'var(--card)', color: level === k ? C.navy : C.text,
                    fontSize: 12.5, fontWeight: 700, fontFamily: FONT, cursor: 'pointer',
                  }}>{l}</button>
                ))}
              </>
            )}
            <div style={{ flex: 1 }} />
            {syncedAt && <span style={{ fontSize: 11.5, color: C.muted }} title={syncedAt.toLocaleString()}>Loaded {syncedAt.toLocaleTimeString()}</span>}
            <Button size="sm" variant="secondary" onClick={() => load(true)} disabled={loading}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginRight: 5, animation: loading ? 'spin 1s linear infinite' : 'none' }}>
                <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              Refresh
            </Button>
            {level !== undefined && scopeLevel && scopeLevel !== 'coach' && <ExportButton data={exportRows} filename={`coach_nps_${level}_${range.since}_${range.until}`} />}
            <div ref={infoRef} style={{ position: 'relative' }}>
              <button onClick={() => setInfoOpen(v => !v)} style={{ width: 30, height: 30, borderRadius: 8, border: `0.5px solid ${C.border}`, background: 'var(--card)', color: C.sub, fontStyle: 'italic', fontWeight: 700, fontFamily: 'Georgia, serif', cursor: 'pointer' }}>i</button>
              {infoOpen && (
                <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 50, width: 360, background: 'var(--card)', border: `0.5px solid ${C.border}`, borderRadius: 12, boxShadow: '0 20px 60px rgba(15,23,42,0.16)', padding: 14, fontSize: 12.5, color: C.sub, lineHeight: 1.6 }}>
                  <div style={{ fontWeight: 800, color: C.text, marginBottom: 6 }}>How these numbers are calculated</div>
                  <div><b>Rating</b> — the 0–10 score a customer gives right after a coaching call.</div>
                  <div style={{ marginTop: 5 }}><b>Promoter</b> 9–10 · <b>Passive</b> 7–8 · <b>Detractor</b> 0–6.</div>
                  <div style={{ marginTop: 5 }}><b>NPS</b> = % promoters − % detractors, from −100 to +100. A day or coach with only a few ratings swings a lot, so check the rating count next to it.</div>
                  <div style={{ marginTop: 5 }}><b>Unique students</b> — distinct students rated, so a student rating twice counts once. In a manager or senior-manager roll-up this is the sum of each coach's unique students.</div>
                  <div style={{ marginTop: 5 }}><b>Dates</b> are the day the rating was given, India time. Month-on-month always shows the full history.</div>
                  <div style={{ marginTop: 5 }}><b>Pre-sales</b> comes from call-level NPS. <b>Post-sales</b> isn't connected yet.</div>
                  <div style={{ marginTop: 5 }}><b>Who sees what:</b> a coach sees their own ratings, a manager their coaches, a senior manager their managers' coaches, admins everyone — set from Team Mapping. Data refreshes once a day.</div>
                </div>
              )}
            </div>
          </div>
          {error && <div style={{ margin: '16px 28px 0', padding: '10px 14px', borderRadius: 10, background: 'var(--navy-tint)', border: `0.5px solid ${C.navy}`, color: C.navy, fontSize: 13 }}>{error}</div>}
          {data && data.ready === false && <div style={{ margin: '16px 28px 0', padding: '12px 14px', borderRadius: 10, background: 'var(--navy-tint)', border: `0.5px solid ${C.navy}`, color: C.navy, fontSize: 13 }}>{data.error}</div>}
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && !data ? (
            <div style={{ padding: '0 28px', marginTop: 20 }}><DashboardSkeleton /></div>
          ) : ready ? (
            <div style={{ opacity: loading ? 0.45 : 1, pointerEvents: loading ? 'none' : 'auto', transition: 'opacity .15s', paddingBottom: 40 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, padding: '20px 28px 0' }}>
                <PremKPI label="Pre-sales NPS" value={nf(pre.nps)} sub={`${fmtN(pre.total)} ratings`} accent={npsColor(pre.nps)} icon={KPI_ICONS.total} />
                <PremKPI label="Average rating" value={pre.avg === null ? '—' : pre.avg.toFixed(2)} sub="out of 10" accent={C.navy} icon={KPI_ICONS.total} />
                <PremKPI label="Total ratings" value={fmtN(pre.total)} sub="pre-sales" accent={C.navy} icon={KPI_ICONS.agent} />
                <PremKPI label="Unique students" value={fmtN(pre.students)} sub="distinct students rated" accent={C.navy} icon={KPI_ICONS.agent} />
                <PremKPI label="Promoters" value={pre.total ? Math.round((pre.promoters / pre.total) * 100) + '%' : '—'} sub={`${fmtN(pre.promoters)} ratings of 9–10`} accent={C.green} icon={KPI_ICONS.total} />
                <PremKPI label="Detractors" value={pre.total ? Math.round((pre.detractors / pre.total) * 100) + '%' : '—'} sub={`${fmtN(pre.detractors)} ratings of 0–6`} accent={C.navy} icon={KPI_ICONS.total} />
              </div>

              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', padding: '20px 28px 0' }}>
                <StagePanel title="Pre-sales" tag="Live" ov={pre} dist={forStage(data.distribution, 'pre')} available />
                <StagePanel title="Post-sales" tag={hasPost ? 'Live' : 'Soon'} ov={post} dist={forStage(data.distribution, 'post')} available={hasPost}
                  note="Post-sales ratings will show here, side by side with pre-sales, once that data source is connected." />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16, padding: '20px 28px 0' }}>
                <Card title="Day-on-day NPS" sub={`${range.since} → ${range.until} · hover a point for the rating count`}>
                  <TrendChart rows={daySeries} keyName="d" fmtLabel={dayLabel} hasPost={hasPost} />
                </Card>
                <Card title="Month-on-month NPS" sub="Full history for the coaches you can see">
                  <TrendChart rows={monthSeries} keyName="m" fmtLabel={monthLabel} hasPost={hasPost} />
                </Card>
              </div>

              {scopeLevel !== 'coach' && (
                <div style={{ padding: '20px 28px 0' }}>
                  <Card title={level === 'coach' ? 'By coach' : level === 'manager' ? 'By manager' : 'By senior manager'}
                    sub={`${fmtN(filtered.length)} ${level === 'coach' ? 'coaches' : level === 'manager' ? 'managers' : 'senior managers'} · pre-sales and post-sales side by side${level === 'coach' ? ' · click a coach for their day-on-day and month-on-month' : ''}`}
                    action={
                      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email or manager…"
                        style={{ width: 240, padding: '7px 11px', borderRadius: 8, border: `0.5px solid ${C.border}`, background: 'var(--card)', color: C.text, fontSize: 12.5, fontFamily: FONT, outline: 'none' }} />
                    }>
                    <div style={{ overflow: 'auto', maxHeight: 620, border: `0.5px solid ${C.border}`, borderRadius: 10 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            <th style={{ ...th, textAlign: 'left', left: 0, zIndex: 2 }} onClick={() => sortBy('name')}>{level === 'coach' ? 'Coach' : level === 'manager' ? 'Manager' : 'Senior manager'}{arrow('name')}</th>
                            {level === 'coach' && <th style={{ ...th, textAlign: 'left', cursor: 'default' }}>Manager</th>}
                            {level !== 'coach' && <th style={th} onClick={() => sortBy('coaches')}>Coaches{arrow('coaches')}</th>}
                            <th style={th} onClick={() => sortBy('total')}>Pre ratings{arrow('total')}</th>
                            <th style={th} onClick={() => sortBy('students')}>Pre students{arrow('students')}</th>
                            <th style={th} onClick={() => sortBy('avg')}>Pre avg{arrow('avg')}</th>
                            <th style={{ ...th, cursor: 'default', minWidth: 130 }}>Pre mix</th>
                            <th style={th} onClick={() => sortBy('nps')}>Pre NPS{arrow('nps')}</th>
                            <th style={{ ...th, cursor: 'default', borderLeft: `0.5px solid ${C.border}` }}>Post ratings</th>
                            <th style={{ ...th, cursor: 'default' }}>Post NPS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pageRows.length === 0 && (
                            <tr><td colSpan={10} style={{ ...td, textAlign: 'center', color: C.muted, padding: 28 }}>No ratings match.</td></tr>
                          )}
                          {pageRows.map(r => (
                            <tr key={r.key} onClick={level === 'coach' ? () => setDrill(r) : undefined}
                              style={{ cursor: level === 'coach' ? 'pointer' : 'default' }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg2)' }} onMouseLeave={e => { e.currentTarget.style.background = '' }}>
                              <td style={{ ...td, textAlign: 'left', fontWeight: 700, background: 'inherit', position: 'sticky', left: 0 }}>{r.name}</td>
                              {level === 'coach' && <td style={{ ...td, textAlign: 'left', color: C.sub }}>{r.manager || 'Unmapped'}</td>}
                              {level !== 'coach' && <td style={td}>{fmtN(r.coachCount)}</td>}
                              <td style={td}>{r.pre ? fmtN(r.pre.total) : '—'}</td>
                              <td style={td}>{r.pre ? fmtN(r.pre.students) : '—'}</td>
                              <td style={td}>{r.pre && r.pre.avg !== null ? r.pre.avg.toFixed(2) : '—'}</td>
                              <td style={{ ...td, minWidth: 130 }}>{r.pre ? <MixBar p={r.pre.promoters} pa={r.pre.passives} d={r.pre.detractors} /> : '—'}</td>
                              <td style={{ ...td, fontWeight: 800, color: npsColor(r.pre ? r.pre.nps : null) }}>{r.pre ? nf(r.pre.nps) : '—'}</td>
                              <td style={{ ...td, color: C.muted, borderLeft: `0.5px solid ${C.border}` }}>{r.post ? fmtN(r.post.total) : '—'}</td>
                              <td style={{ ...td, color: C.muted }}>{r.post ? nf(r.post.nps) : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {pages > 1 && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 10, fontSize: 12.5, color: C.sub }}>
                        <button disabled={safePage === 0} onClick={() => setPage(safePage - 1)} style={{ padding: '5px 12px', borderRadius: 8, border: `0.5px solid ${C.border}`, background: 'var(--card)', cursor: safePage === 0 ? 'default' : 'pointer', opacity: safePage === 0 ? 0.4 : 1, fontFamily: FONT, fontWeight: 700 }}>Prev</button>
                        <span>Page {safePage + 1} of {pages}</span>
                        <button disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)} style={{ padding: '5px 12px', borderRadius: 8, border: `0.5px solid ${C.border}`, background: 'var(--card)', cursor: safePage >= pages - 1 ? 'default' : 'pointer', opacity: safePage >= pages - 1 ? 0.4 : 1, fontFamily: FONT, fontWeight: 700 }}>Next</button>
                      </div>
                    )}
                  </Card>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
      {drill && <CoachDrill row={drill} range={range} onClose={() => setDrill(null)} />}
    </div>
  )
}
