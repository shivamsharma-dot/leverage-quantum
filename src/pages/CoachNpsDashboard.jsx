import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, ComposedChart, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Cell, ReferenceLine,
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
// honest "not connected yet" strip until that table exists. Who sees what is
// decided SERVER-SIDE from Team Mapping (api/crm-leads.js, handleCoachNps) -- the
// browser only ever receives rows the signed-in person is allowed to see.
//
// Reading aids on purpose: customers are called Happy (9-10) / Neutral (7-8) /
// Unhappy (0-6) instead of promoter / passive / detractor, every number is
// compared with the previous period of the same length, and an NPS built on only a
// few ratings is greyed out (min-ratings control) because it is mostly noise.
// ---------------------------------------------------------------------------

const PRESETS = [
  ['last_7', 'Last 7 days'], ['last_30', 'Last 30 days'], ['this_month', 'This month'],
  ['last_month', 'Last month'], ['all', 'All time'],
]
const MIN_OPTIONS = [1, 3, 5, 10]
const PAGE_SIZE = 25
const ORDER = ['ssm', 'manager', 'coach']
const LEVEL_NAME = { ssm: 'Senior manager', manager: 'Manager', coach: 'Coach' }
const LEVEL_PLURAL = { ssm: 'senior managers', manager: 'managers', coach: 'coaches' }
const BUCKETS = {
  happy: { label: 'Happy', range: '9–10', color: C.green, test: s => s >= 9 },
  neutral: { label: 'Neutral', range: '7–8', color: C.cyan, test: s => s === 7 || s === 8 },
  unhappy: { label: 'Unhappy', range: '0–6', color: C.navy, test: s => s <= 6 },
}

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
// The window of the same length immediately before `range` -- what every "vs previous" number compares to.
function prevRangeOf(range) {
  const s = parseYmd(range.since), e = parseYmd(range.until)
  const days = Math.round((e - s) / 86400000) + 1
  const pe = new Date(s); pe.setDate(pe.getDate() - 1)
  const ps = new Date(pe); ps.setDate(ps.getDate() - (days - 1))
  return { since: fmtYmd(ps), until: fmtYmd(pe), days }
}

// NPS = % happy (9-10) minus % unhappy (0-6), from -100 to +100.
function npsOf(p, d, total) { return total > 0 ? Math.round(((p - d) / total) * 100) : null }
const nf = v => (v === null || v === undefined ? '—' : String(v))
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthLabel = m => { const [y, mm] = m.split('-'); return `${MONTHS[Number(mm) - 1]} ${y.slice(2)}` }
const dayLabel = d => { const [, mm, dd] = d.split('-'); return `${Number(dd)} ${MONTHS[Number(mm) - 1]}` }
const longDay = d => { const dt = parseYmd(d); return dt.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }) }
const forStage = (arr, stage) => (arr || []).filter(x => x.stage === stage)
const pct = (n, t) => (t ? Math.round((n / t) * 100) : null)

function toneOf(v) {
  if (v === null || v === undefined) return { color: C.muted, bg: 'var(--bg3)', word: 'No data' }
  if (v >= 50) return { color: C.green, bg: C.greenBg, word: 'Strong' }
  if (v >= 0) return { color: C.blue, bg: C.blueBg, word: 'OK' }
  return { color: C.navy, bg: C.navyBg, word: 'Weak' }
}
function ptsText(delta, unit = 'pts') {
  if (delta === null || delta === undefined) return null
  if (delta === 0) return `no change`
  return `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)} ${unit}`
}

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

// One group (a coach, a manager or a senior manager) built from per-coach rows.
function blank() { return { total: 0, students: 0, sum: 0, promoters: 0, passives: 0, detractors: 0, scores: Array(11).fill(0) } }
function addInto(cur, x) {
  cur.total += x.total; cur.students += x.students; cur.sum += Number(x.avg) * x.total
  cur.promoters += x.promoters; cur.passives += x.passives; cur.detractors += x.detractors
  ;(x.scores || []).forEach((n, i) => { cur.scores[i] += Number(n) })
  return cur
}
function finish(s) { return s ? { ...s, avg: s.total ? s.sum / s.total : null, nps: npsOf(s.promoters, s.detractors, s.total) } : null }

// Groups per-coach rows at `level`, restricted to the drill path (e.g. only coaches under one manager).
function groupRows(byCoach, team, level, path) {
  const map = new Map()
  for (const x of byCoach || []) {
    if (x.stage === 'post') continue
    const t = team[x.coach_email] || {}
    const ssm = t.ssm || 'Unmapped', manager = t.manager || 'Unmapped'
    if (path.ssm && ssm !== path.ssm) continue
    if (path.manager && manager !== path.manager) continue
    const key = level === 'ssm' ? ssm : level === 'manager' ? manager : x.coach_email
    if (!map.has(key)) map.set(key, { key, name: level === 'coach' ? (x.coach_name || x.coach_email) : key, level, email: level === 'coach' ? x.coach_email : null, manager, ssm, coaches: new Set(), pre: blank() })
    const g = map.get(key)
    g.coaches.add(x.coach_email)
    addInto(g.pre, x)
  }
  return [...map.values()].map(g => ({ ...g, coachCount: g.coaches.size, pre: finish(g.pre) }))
}

// ---- small presentational pieces ------------------------------------------

function NpsChip({ v, total, min, big }) {
  const few = total < min
  const t = few ? { color: C.muted, bg: 'var(--bg3)' } : toneOf(v)
  return (
    <span title={few ? `Only ${total} rating${total === 1 ? '' : 's'} — fewer than ${min}, so this NPS is mostly noise` : `${toneOf(v).word}: ${v === null ? 'no ratings' : `NPS ${v}`}`}
      style={{ display: 'inline-block', minWidth: big ? 54 : 40, textAlign: 'center', padding: big ? '4px 12px' : '2px 9px', borderRadius: 99, background: t.bg, color: t.color, fontWeight: 800, fontSize: big ? 15 : 12.5, fontFamily: FONT, opacity: few ? 0.75 : 1 }}>
      {nf(v)}{few && total > 0 ? '*' : ''}
    </span>
  )
}

function MixBar({ p, pa, d, height = 8, active, onPick }) {
  const t = p + pa + d
  if (!t) return <div style={{ height, borderRadius: 99, background: 'var(--bg3)' }} />
  const seg = (key, n) => (
    <span key={key} onClick={onPick ? e => { e.stopPropagation(); onPick(key) } : undefined}
      title={`${BUCKETS[key].label} (${BUCKETS[key].range}): ${n} rating${n === 1 ? '' : 's'} · ${Math.round((n / t) * 100)}%`}
      style={{ width: `${(n / t) * 100}%`, background: BUCKETS[key].color, cursor: onPick ? 'pointer' : 'default', opacity: active && active !== key ? 0.3 : 1, transition: 'opacity .12s' }} />
  )
  return <div style={{ display: 'flex', height, borderRadius: 99, overflow: 'hidden', background: 'var(--bg3)' }}>{seg('happy', p)}{seg('neutral', pa)}{seg('unhappy', d)}</div>
}

function MixLegend({ p, pa, d, active, onPick }) {
  const t = p + pa + d
  const item = (key, n) => {
    const b = BUCKETS[key]
    return (
      <button key={key} type="button" onClick={onPick ? () => onPick(key) : undefined}
        style={{ border: `0.5px solid ${active === key ? b.color : 'transparent'}`, background: active === key ? 'var(--bg2)' : 'transparent', borderRadius: 8, padding: '3px 8px', cursor: onPick ? 'pointer' : 'default', fontFamily: FONT, fontSize: 12, color: C.sub, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 9, height: 9, borderRadius: 99, background: b.color }} />
        {b.label} ({b.range}) <b style={{ color: C.text }}>{t ? Math.round((n / t) * 100) + '%' : '—'}</b>
        <span style={{ color: C.muted }}>{fmtN(n)}</span>
      </button>
    )
  }
  return <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>{item('happy', p)}{item('neutral', pa)}{item('unhappy', d)}</div>
}

function DistChart({ dist, active, onPick, height = 150 }) {
  const counts = Array.from({ length: 11 }, (_, i) => ({ r: i, n: (dist.find(x => Number(x.rating) === i) || {}).n || 0 }))
  const colorOf = r => (r >= 9 ? C.green : r >= 7 ? C.cyan : C.navy)
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={counts} margin={{ top: 14, right: 4, left: -22, bottom: 0 }} style={{ cursor: onPick ? 'pointer' : 'default' }}
          onClick={e => { if (onPick && e && e.activeLabel !== undefined && e.activeLabel !== null) onPick(Number(e.activeLabel)) }}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} />
          <XAxis dataKey="r" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip cursor={{ fill: 'rgba(31,60,132,0.06)' }} formatter={v => [fmtN(v), 'Ratings']} labelFormatter={l => `Score ${l}`} />
          <Bar dataKey="n" radius={[4, 4, 0, 0]} maxBarSize={28}>
            {counts.map(c => <Cell key={c.r} fill={colorOf(c.r)} fillOpacity={active !== null && active !== undefined && active !== c.r ? 0.28 : 1} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function TrendTip({ active, payload, label, fmtLabel, hint }) {
  if (!active || !payload || !payload.length) return null
  const row = payload[0].payload
  return (
    <div style={{ background: 'var(--card)', border: `0.5px solid ${C.border}`, borderRadius: 10, padding: '8px 12px', fontSize: 12, fontFamily: FONT, boxShadow: '0 8px 24px rgba(15,23,42,.14)' }}>
      <div style={{ fontWeight: 800, color: C.text, marginBottom: 4 }}>{fmtLabel(label)}</div>
      {row.pre !== null && row.pre !== undefined && <div style={{ color: C.navy }}>NPS <b>{row.pre}</b> from {fmtN(row.preN)} rating{row.preN === 1 ? '' : 's'}{row.preN < 5 ? ' (few ratings)' : ''}</div>}
      {row.roll !== null && row.roll !== undefined && <div style={{ color: C.text }}>7-day rolling NPS <b>{row.roll}</b></div>}
      {row.post !== null && row.post !== undefined && <div style={{ color: C.cyan }}>Post-sales NPS <b>{row.post}</b> · {fmtN(row.postN)} ratings</div>}
      {hint && <div style={{ color: C.muted, marginTop: 4, fontSize: 11 }}>{hint}</div>}
    </div>
  )
}

function TrendChart({ rows, keyName, fmtLabel, hasPost, onPick, hint, height = 230, rolling = false }) {
  if (!rows.length) return <div style={{ padding: '36px 0', textAlign: 'center', color: C.muted, fontSize: 13, fontFamily: FONT }}>No ratings in this window.</div>
  const vals = rows.flatMap(r => [r.pre, r.roll, hasPost ? r.post : null]).filter(v => v !== null && v !== undefined)
  const lo = vals.length ? Math.max(-100, Math.floor((Math.min(...vals) - 10) / 25) * 25) : -100
  const hi = vals.length ? Math.min(100, Math.ceil((Math.max(...vals) + 10) / 25) * 25) : 100
  const maxN = Math.max(1, ...rows.map(r => r.preN || 0))
  const tick = { fontSize: 10.5, fill: '#94A3B8', fontFamily: FONT }
  const dot = props => {
    const { cx, cy, payload } = props
    if (cx === undefined || cy === undefined || payload.pre === null || payload.pre === undefined) return null
    const few = (payload.preN || 0) < 5
    return <circle key={payload[keyName]} cx={cx} cy={cy} r={few ? 2.5 : 3} fill={few ? '#fff' : C.navy} stroke={C.navy} strokeWidth={1.2} opacity={rolling ? 0.7 : 1} />
  }
  return (
    <div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11, color: C.muted, fontFamily: FONT, margin: '0 0 6px 2px' }}>
        <span><i style={{ display: 'inline-block', width: 9, height: 9, background: '#CBD5E1', borderRadius: 2, marginRight: 5 }} />Ratings (right axis)</span>
        <span><i style={{ display: 'inline-block', width: 14, height: 0, borderTop: `1.5px solid ${C.navy}`, marginRight: 5, verticalAlign: 'middle' }} />{rolling ? 'Daily NPS' : 'NPS'}</span>
        {rolling && <span><i style={{ display: 'inline-block', width: 14, height: 0, borderTop: `3px solid ${C.navy}`, marginRight: 5, verticalAlign: 'middle' }} />7-day rolling NPS (from 10+ ratings)</span>}
        <span>Hollow point = fewer than 5 ratings</span>
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 6, right: 4, left: -10, bottom: 0 }} style={{ cursor: onPick ? 'pointer' : 'default' }}
            onClick={e => { if (onPick && e && e.activeLabel) onPick(e.activeLabel) }}>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeDasharray="2 4" />
            <XAxis dataKey={keyName} tickFormatter={fmtLabel} tick={tick} axisLine={{ stroke: '#E2E8F0' }} tickLine={false} minTickGap={24} />
            <YAxis yAxisId="nps" domain={[lo, hi]} tick={tick} axisLine={false} tickLine={false} width={38} tickFormatter={v => (v > 0 ? `+${v}` : v)} />
            <YAxis yAxisId="n" orientation="right" domain={[0, maxN * 4]} hide />
            <ReferenceLine yAxisId="nps" y={0} stroke="#94A3B8" strokeWidth={1} />
            <Tooltip content={<TrendTip fmtLabel={fmtLabel} hint={hint} />} cursor={{ stroke: '#CBD5E1', strokeDasharray: '3 3' }} />
            <Bar yAxisId="n" dataKey="preN" fill="#CBD5E1" radius={[2, 2, 0, 0]} maxBarSize={14} name="Ratings" />
            <Line yAxisId="nps" type="linear" dataKey="pre" stroke={C.navy} strokeWidth={rolling ? 1.2 : 2} strokeOpacity={rolling ? 0.7 : 1} dot={dot} activeDot={{ r: 5 }} connectNulls name="NPS" />
            {rolling && <Line yAxisId="nps" type="linear" dataKey="roll" stroke={C.navy} strokeWidth={2.8} dot={false} activeDot={{ r: 5 }} connectNulls name="7-day rolling" />}
            {hasPost && <Line yAxisId="nps" type="linear" dataKey="post" stroke={C.cyan} strokeWidth={2} dot={{ r: 3 }} connectNulls name="Post-sales" />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// 7-day rolling NPS, pooling the raw promoter/detractor counts (not averaging daily NPS),
// shown only once the window holds 10+ ratings so it never rides on a handful of calls.
function withRolling(data, series) {
  const raw = forStage(data.by_day, 'pre').slice().sort((a, b) => (a.d < b.d ? -1 : 1))
  const day = d => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400000
  return series.map(r => {
    const t = day(r.d)
    let n = 0, p = 0, u = 0
    for (const x of raw) { const k = day(x.d); if (k <= t && k > t - 7) { n += x.total; p += x.promoters; u += x.detractors } }
    return { ...r, roll: n >= 10 ? npsOf(p, u, n) : null }
  })
}

function seriesFor(data, field, keyName) {
  const k = keyName === 'd' ? 'd' : 'm'
  const pre = forStage(data[field], 'pre'), post = forStage(data[field], 'post')
  const keys = [...new Set([...pre, ...post].map(x => x[k]))].sort()
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
  const o = data ? forStage(data.overall, stage)[0] : null
  if (!o) return { total: 0, students: 0, avg: null, promoters: 0, passives: 0, detractors: 0, nps: null }
  return { ...o, avg: o.avg === null ? null : Number(o.avg), nps: npsOf(o.promoters, o.detractors, o.total) }
}

const chipBtn = (on, color) => ({
  padding: '6px 12px', borderRadius: 8, border: `0.5px solid ${on ? (color || C.navy) : C.border}`,
  background: on ? 'var(--navy-tint)' : 'var(--card)', color: on ? (color || C.navy) : C.text,
  fontSize: 12.5, fontWeight: 700, fontFamily: FONT, cursor: 'pointer', whiteSpace: 'nowrap',
})

// ---- coach drawer (click a coach) -----------------------------------------

function CoachDrawer({ row, range, min, onClose }) {
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
  const ov = data && data.ready !== false ? overallOf(data, 'pre') : null
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(15,23,42,.35)', display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true"
        style={{ width: 'min(600px, 100%)', height: '100%', overflowY: 'auto', background: 'var(--bg)', borderLeft: `0.5px solid ${C.border}`, boxShadow: '-20px 0 60px rgba(15,23,42,.25)', fontFamily: FONT }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg)', display: 'flex', alignItems: 'flex-start', gap: 12, padding: '18px 22px', borderBottom: `0.5px solid ${C.border}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 19, fontWeight: 800, color: C.text }}>{row.name || row.email}</div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3, lineHeight: 1.5 }}>{row.email}<br />{row.manager && row.manager !== 'Unmapped' ? `Manager: ${row.manager}` : 'Manager: not in Team Mapping'}{row.ssm && row.ssm !== 'Unmapped' ? ` · Senior manager: ${row.ssm}` : ''}</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ border: `0.5px solid ${C.border}`, background: 'var(--card)', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', color: C.sub, fontSize: 16 }}>×</button>
        </div>
        <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {err && <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--navy-tint)', color: C.navy, fontSize: 13 }}>{err}</div>}
          {!data && !err && <DashboardSkeleton />}
          {data && data.ready === false && <div style={{ color: C.muted, fontSize: 13 }}>{data.error}</div>}
          {ov && (
            <>
              <div style={{ fontSize: 12.5, color: C.muted }}>{range.since} → {range.until}</div>
              {ov.total === 0 ? (
                <div style={{ padding: '28px 12px', textAlign: 'center', color: C.muted, fontSize: 13 }}>No ratings from this coach in this window.</div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 10 }}>
                    <div style={{ background: 'var(--card)', border: `0.5px solid ${C.border}`, borderRadius: 12, padding: '10px 12px' }}>
                      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: C.muted }}>NPS</div>
                      <div style={{ marginTop: 6 }}><NpsChip v={ov.nps} total={ov.total} min={min} big /></div>
                    </div>
                    {[['Ratings', fmtN(ov.total)], ['Students', fmtN(ov.students)], ['Avg rating', ov.avg === null ? '—' : ov.avg.toFixed(2)]].map(([l, v]) => (
                      <div key={l} style={{ background: 'var(--card)', border: `0.5px solid ${C.border}`, borderRadius: 12, padding: '10px 12px' }}>
                        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: C.muted }}>{l}</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginTop: 2 }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  {ov.total < min && <div style={{ fontSize: 12, color: C.muted }}>* Only {ov.total} rating{ov.total === 1 ? '' : 's'} in this window, fewer than {min}: treat the NPS as a rough signal.</div>}
                  <Card title="How this coach's customers rated">
                    <MixBar p={ov.promoters} pa={ov.passives} d={ov.detractors} height={10} />
                    <MixLegend p={ov.promoters} pa={ov.passives} d={ov.detractors} />
                    <div style={{ marginTop: 10 }}><DistChart dist={forStage(data.distribution, 'pre')} height={130} /></div>
                  </Card>
                  <Card title="Day-on-day NPS" sub="One point per day this coach was rated"><TrendChart rows={seriesFor(data, 'by_day', 'd')} keyName="d" fmtLabel={dayLabel} hasPost={false} height={190} /></Card>
                  <Card title="Month-on-month NPS" sub="Full history, not limited to the date range"><TrendChart rows={seriesFor(data, 'by_month', 'm')} keyName="m" fmtLabel={monthLabel} hasPost={false} height={190} /></Card>
                  <div style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--bg2)', border: `0.5px dashed ${C.border}`, fontSize: 12.5, color: C.sub, lineHeight: 1.6 }}>
                    <b style={{ color: C.text }}>Call recordings</b> — a play button for each rating, so a manager can hear what went wrong, is the next step. It needs a recording link on each NPS row from the data team; it will appear here as this coach's list of ratings.
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ---- who was rated on one day (click a point on the day-on-day chart) -------

function DayPanel({ day, min, onClose, onOpenCoach }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => {
    let dead = false
    fetchJson(`/api/crm-leads?source=coach_nps&from=${day}&to=${day}`).then(d => { if (!dead) setData(d) }).catch(e => { if (!dead) setErr(e.message) })
    return () => { dead = true }
  }, [day])
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  const ov = data && data.ready !== false ? overallOf(data, 'pre') : null
  const coaches = data && data.ready !== false ? forStage(data.by_coach, 'pre').map(x => ({ ...x, nps: npsOf(x.promoters, x.detractors, x.total), avg: Number(x.avg) })).sort((a, b) => b.total - a.total || (a.nps ?? 0) - (b.nps ?? 0)) : []
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(15,23,42,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '8vh 16px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" style={{ width: 'min(640px, 100%)', background: 'var(--bg)', borderRadius: 16, border: `0.5px solid ${C.border}`, boxShadow: '0 30px 80px rgba(15,23,42,.35)', fontFamily: FONT }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: `0.5px solid ${C.border}` }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{longDay(day)}</div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{ov ? `${fmtN(ov.total)} rating${ov.total === 1 ? '' : 's'} · NPS ${nf(ov.nps)} · avg ${ov.avg === null ? '—' : ov.avg.toFixed(2)}` : 'Loading…'}</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ border: `0.5px solid ${C.border}`, background: 'var(--card)', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', color: C.sub, fontSize: 16 }}>×</button>
        </div>
        <div style={{ padding: 16 }}>
          {err && <div style={{ color: C.navy, fontSize: 13 }}>{err}</div>}
          {!data && !err && <DashboardSkeleton />}
          {data && coaches.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: C.muted, fontSize: 13 }}>No ratings on this day.</div>}
          {coaches.length > 0 && (
            <div style={{ maxHeight: '55vh', overflow: 'auto', border: `0.5px solid ${C.border}`, borderRadius: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead><tr style={{ background: 'var(--bg2)', color: C.muted, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  <th style={{ textAlign: 'left', padding: '8px 10px' }}>Coach</th><th style={{ padding: '8px 10px', textAlign: 'right' }}>Ratings</th><th style={{ padding: '8px 10px', textAlign: 'right' }}>Avg</th><th style={{ padding: '8px 10px', textAlign: 'right' }}>NPS</th><th style={{ padding: '8px 10px', minWidth: 90 }}>Mix</th>
                </tr></thead>
                <tbody>
                  {coaches.map(c => {
                    const t = (data.team || {})[c.coach_email] || {}
                    return (
                      <tr key={c.coach_email} onClick={() => onOpenCoach({ email: c.coach_email, name: c.coach_name || c.coach_email, manager: t.manager || null, ssm: t.ssm || null })}
                        style={{ cursor: 'pointer', borderTop: `0.5px solid ${C.border}` }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg2)' }} onMouseLeave={e => { e.currentTarget.style.background = '' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 700, color: C.text }}>{c.coach_name || c.coach_email}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>{c.total}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>{c.avg.toFixed(1)}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}><NpsChip v={c.nps} total={c.total} min={min} /></td>
                        <td style={{ padding: '8px 10px' }}><MixBar p={c.promoters} pa={c.passives} d={c.detractors} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
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
  const [prevData, setPrevData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [syncedAt, setSyncedAt] = useState(null)
  const [path, setPath] = useState([]) // drill-down: [{level, name}]
  const [flat, setFlat] = useState(false) // list every coach instead of drilling
  const [min, setMin] = useState(5)
  const [quick, setQuick] = useState('all') // all | attention | top
  const [bucket, setBucket] = useState(null) // happy | neutral | unhappy
  const [score, setScore] = useState(null) // 0..10
  const [moreCols, setMoreCols] = useState(false)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState({ key: 'total', dir: -1 })
  const [page, setPage] = useState(0)
  const [infoOpen, setInfoOpen] = useState(false)
  const infoRef = useClickOutside(infoOpen, () => setInfoOpen(false))
  const [drill, setDrill] = useState(null)
  const [dayOpen, setDayOpen] = useState(null)

  const range = datePreset === 'custom' && customRange ? customRange : presetRange(datePreset)
  const prevRange = datePreset === 'all' ? null : prevRangeOf(range)

  async function load(force) {
    const key = `coach_nps_v2:${range.since}:${range.until}`
    if (!force) {
      const c = getSession(key)
      if (c) { setData(c.data.result); setPrevData(c.data.prev); setSyncedAt(c.data.ts); setLoading(false); setError(null); return }
    }
    setLoading(true); setError(null)
    try {
      const [d, pd] = await Promise.all([
        fetchJson(`/api/crm-leads?source=coach_nps&from=${range.since}&to=${range.until}`),
        prevRange ? fetchJson(`/api/crm-leads?source=coach_nps&from=${prevRange.since}&to=${prevRange.until}`).catch(() => null) : Promise.resolve(null),
      ])
      setData(d); setPrevData(pd && pd.ready !== false ? pd : null)
      const ts = new Date()
      setSyncedAt(ts)
      setSession(key, { result: d, prev: pd && pd.ready !== false ? pd : null, ts })
    } catch (e) {
      setError(e.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load(false) }, [range.since, range.until]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(0) }, [search, path, flat, quick, bucket, score, min, sort, range.since, range.until])

  const ready = data && data.ready !== false
  const scopeLevel = ready && data.scope ? data.scope.level : null
  const startLevel = scopeLevel === 'admin' ? 'ssm' : scopeLevel === 'ssm' ? 'manager' : 'coach'
  const canDrill = scopeLevel === 'admin' || scopeLevel === 'ssm'
  const startIdx = ORDER.indexOf(startLevel)
  const level = flat || !canDrill ? 'coach' : ORDER[Math.min(startIdx + path.length, ORDER.length - 1)]
  const pathObj = useMemo(() => { const o = {}; path.forEach(p => { o[p.level] = p.name }); return o }, [path])
  const team = useMemo(() => ({ ...(prevData ? prevData.team || {} : {}), ...(ready ? data.team || {} : {}) }), [data, prevData, ready])

  const pre = useMemo(() => (ready ? overallOf(data, 'pre') : null), [data, ready])
  const prevPre = useMemo(() => (prevData ? overallOf(prevData, 'pre') : null), [prevData])
  const post = useMemo(() => (ready ? overallOf(data, 'post') : null), [data, ready])
  const hasPost = !!(ready && post && post.total > 0)
  const daySeries = useMemo(() => (ready ? withRolling(data, seriesFor(data, 'by_day', 'd')) : []), [data, ready])
  const monthSeries = useMemo(() => (ready ? seriesFor(data, 'by_month', 'm') : []), [data, ready])
  const distPre = useMemo(() => (ready ? forStage(data.distribution, 'pre') : []), [data, ready])

  // Every coach (for "best / needs attention" in the headline) and the current table level.
  const allCoachRows = useMemo(() => (ready ? groupRows(data.by_coach, team, 'coach', {}) : []), [data, ready, team])
  const rows = useMemo(() => (ready ? groupRows(data.by_coach, team, level, pathObj) : []), [data, ready, team, level, pathObj])
  const prevRows = useMemo(() => {
    const m = new Map()
    if (prevData) groupRows(prevData.by_coach, team, level, pathObj).forEach(r => m.set(r.key, r))
    return m
  }, [prevData, team, level, pathObj])

  const bucketCount = (r, b) => (b === 'happy' ? r.pre.promoters : b === 'neutral' ? r.pre.passives : r.pre.detractors)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let out = rows.filter(r => r.pre && r.pre.total > 0)
    if (q) out = out.filter(r => r.name.toLowerCase().includes(q) || (r.email || '').includes(q) || (r.manager || '').toLowerCase().includes(q) || (r.ssm || '').toLowerCase().includes(q))
    if (bucket) out = out.filter(r => bucketCount(r, bucket) > 0)
    if (score !== null) out = out.filter(r => (r.pre.scores[score] || 0) > 0)
    if (quick === 'attention') return out.filter(r => r.pre.total >= min).sort((a, b) => a.pre.nps - b.pre.nps || b.pre.total - a.pre.total).slice(0, 10)
    if (quick === 'top') return out.filter(r => r.pre.total >= min).sort((a, b) => b.pre.nps - a.pre.nps || b.pre.total - a.pre.total).slice(0, 10)
    const val = r => {
      const k = sort.key
      if (bucket && sort.key === 'total' && sort.auto) return bucketCount(r, bucket)
      if (k === 'name') return r.name.toLowerCase()
      if (k === 'coaches') return r.coachCount
      const v = r.pre[k]
      return v === undefined || v === null ? -Infinity : v
    }
    return out.sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir })
  }, [rows, search, sort, quick, min, bucket, score]) // eslint-disable-line react-hooks/exhaustive-deps

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pages - 1)
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  const exportRows = useMemo(() => filtered.map(r => ({
    [LEVEL_NAME[level]]: r.name,
    ...(level === 'coach' ? { Email: r.email, Manager: r.manager || '', 'Senior manager': r.ssm || '' } : { Coaches: r.coachCount }),
    'Ratings': r.pre.total, 'Unique students': r.pre.students,
    'Avg rating': r.pre.avg !== null ? Number(r.pre.avg).toFixed(2) : '',
    'Happy (9-10)': r.pre.promoters, 'Neutral (7-8)': r.pre.passives, 'Unhappy (0-6)': r.pre.detractors,
    'NPS': r.pre.nps !== null ? r.pre.nps : '',
  })), [filtered, level])

  const sortBy = key => { setQuick('all'); setSort(s => (s.key === key ? { key, dir: -s.dir } : { key, dir: key === 'name' ? 1 : -1 })) }
  const arrow = key => (sort.key === key && quick === 'all' ? (sort.dir === 1 ? ' ▲' : ' ▼') : '')
  const presetLabel = datePreset === 'custom' && customRange ? `${customRange.since} → ${customRange.until}` : (PRESETS.find(p => p[0] === datePreset) || [])[1]
  const prevLabel = prevRange ? `the previous ${prevRange.days} day${prevRange.days === 1 ? '' : 's'}` : null

  const pickBucket = b => { setBucket(x => (x === b ? null : b)); setScore(null); setQuick('all'); setSort({ key: 'total', dir: -1, auto: true }) }
  const pickScore = s => { setScore(x => (x === s ? null : s)); setBucket(null); setQuick('all') }
  const zoomMonth = m => {
    const [y, mm] = m.split('-').map(Number)
    setCustomRange({ since: `${m}-01`, until: fmtYmd(new Date(y, mm, 0)) }); setDatePreset('custom')
  }
  const openCoach = r => setDrill({ email: r.email, name: r.name, manager: r.manager, ssm: r.ssm })
  const onRowClick = r => {
    if (level === 'coach') return openCoach(r)
    setPath(p => [...p, { level, name: r.name }]); setSearch(''); setBucket(null); setScore(null); setQuick('all')
  }

  // Plain-English summary under the title.
  const headline = useMemo(() => {
    if (!pre) return null
    if (pre.total === 0) return { empty: true }
    const dN = prevPre && prevPre.total >= 1 && pre.nps !== null && prevPre.nps !== null ? pre.nps - prevPre.nps : null
    const eligible = allCoachRows.filter(r => r.pre && r.pre.total >= min)
    const best = [...eligible].sort((a, b) => b.pre.nps - a.pre.nps || b.pre.total - a.pre.total)[0]
    const worst = [...eligible].sort((a, b) => a.pre.nps - b.pre.nps || b.pre.total - a.pre.total)[0]
    return { dN, best: eligible.length > 1 ? best : null, worst: eligible.length > 1 && worst !== best ? worst : null, coaches: allCoachRows.length }
  }, [pre, prevPre, allCoachRows, min])

  const th = { padding: '9px 10px', textAlign: 'right', fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: C.muted, whiteSpace: 'nowrap', background: 'var(--bg2)', position: 'sticky', top: 0, cursor: 'pointer', userSelect: 'none', fontFamily: FONT }
  const td = { padding: '9px 10px', textAlign: 'right', fontSize: 12.5, color: C.text, whiteSpace: 'nowrap', borderTop: `0.5px solid ${C.border}`, fontFamily: FONT, fontVariantNumeric: 'tabular-nums' }
  const colCount = 6 + (level === 'coach' ? 1 : 0) + (moreCols ? 4 : 0)

  const subtitle = !scopeLevel ? 'How customers rate coaching calls, by coach.'
    : scopeLevel === 'admin' ? 'How customers rate coaching calls, across every coach. Click a senior manager to drill down.'
    : scopeLevel === 'ssm' ? `How customers rate coaching calls across your org (${data.scope.coachCount ? data.scope.coachCount - 1 : 0} coaches). Click a manager to drill down.`
    : scopeLevel === 'manager' ? `How customers rate your team's coaching calls (${data.scope.coachCount ? data.scope.coachCount - 1 : 0} coaches).`
    : 'How customers rate your coaching calls.'

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
            <div style={{ fontSize: 13, color: C.muted, marginTop: 4, maxWidth: 820 }}>{subtitle}</div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '16px 28px 0', padding: '10px 12px', background: 'var(--bg2)', border: `0.5px solid ${C.border}`, borderRadius: 12 }}>
            {PRESETS.map(([k, l]) => (
              <button key={k} onClick={() => { setDatePreset(k); setCustomRange(null) }} style={chipBtn(datePreset === k)}>{l}</button>
            ))}
            <div ref={calRef} style={{ position: 'relative' }}>
              <button onClick={() => setShowCalendar(v => !v)} style={chipBtn(datePreset === 'custom')}>{datePreset === 'custom' && customRange ? presetLabel : 'Custom range'}</button>
              {showCalendar && (
                <div style={{ position: 'absolute', left: 0, top: 'calc(100% + 8px)', zIndex: 50, background: 'var(--card)', border: `0.5px solid ${C.border}`, borderRadius: 14, boxShadow: '0 20px 60px rgba(15,23,42,0.16)', overflow: 'hidden' }}>
                  <DateRangePicker from={parseYmd(customRange && customRange.since)} to={parseYmd(customRange && customRange.until)}
                    onChange={(from, to) => { setCustomRange({ since: from, until: to }); setDatePreset('custom'); setShowCalendar(false) }} />
                </div>
              )}
            </div>
            <div style={{ flex: 1 }} />
            <Button size="sm" variant="secondary" onClick={() => load(true)} disabled={loading}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginRight: 5, animation: loading ? 'spin 1s linear infinite' : 'none' }}>
                <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              Refresh
            </Button>
            {ready && scopeLevel !== 'coach' && <ExportButton data={exportRows} filename={`coach_nps_${level}_${range.since}_${range.until}`} />}
            <div ref={infoRef} style={{ position: 'relative' }}>
              <button onClick={() => setInfoOpen(v => !v)} style={{ width: 30, height: 30, borderRadius: 8, border: `0.5px solid ${C.border}`, background: 'var(--card)', color: C.sub, fontStyle: 'italic', fontWeight: 700, fontFamily: 'Georgia, serif', cursor: 'pointer' }}>i</button>
              {infoOpen && (
                <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 50, width: 380, background: 'var(--card)', border: `0.5px solid ${C.border}`, borderRadius: 12, boxShadow: '0 20px 60px rgba(15,23,42,0.16)', padding: 14, fontSize: 12.5, color: C.sub, lineHeight: 1.6 }}>
                  <div style={{ fontWeight: 800, color: C.text, marginBottom: 6 }}>How to read this page</div>
                  <div><b>Rating</b> — the 0–10 score a customer gives after a coaching call. <b>Happy</b> = 9–10, <b>Neutral</b> = 7–8, <b>Unhappy</b> = 0–6.</div>
                  <div style={{ marginTop: 5 }}><b>NPS</b> = % happy minus % unhappy, from −100 to +100. 50+ is strong, 0–49 is OK, below 0 is weak.</div>
                  <div style={{ marginTop: 5 }}><b>* and grey</b> — fewer ratings than the "Trust NPS from" setting. With 2 ratings, one unhappy customer moves NPS by 50 points, so don't judge on it.</div>
                  <div style={{ marginTop: 5 }}><b>vs previous</b> — compared with the window of the same length right before the one you picked.</div>
                  <div style={{ marginTop: 5 }}><b>Unique students</b> — distinct students rated (a student rating twice counts once). In a manager or senior-manager row it is the sum of each coach's unique students.</div>
                  <div style={{ marginTop: 5 }}><b>Click around</b> — a row to drill down (senior manager → manager → coach → a side panel), a bar or colour segment to filter the table, a day to see who was rated that day, a month to zoom into it.</div>
                  <div style={{ marginTop: 5 }}><b>Who sees what</b> — a coach sees their own ratings, a manager their coaches, a senior manager their managers' coaches, admins everyone (from Team Mapping). Dates are India time; data refreshes once a day.</div>
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

              {/* 1. The answer in one sentence */}
              <div style={{ margin: '20px 28px 0', padding: '16px 20px', background: 'var(--card)', border: `0.5px solid ${C.border}`, borderRadius: 16, boxShadow: '0 1px 4px rgba(15,23,42,0.04)' }}>
                {headline && headline.empty ? (
                  <div style={{ fontSize: 14, color: C.sub }}>No ratings in <b>{presetLabel}</b>. Try a wider date range.</div>
                ) : headline ? (
                  <>
                    <div style={{ fontSize: 15, lineHeight: 1.65, color: C.text }}>
                      NPS is <NpsChip v={pre.nps} total={pre.total} min={1} big />
                      {headline.dN !== null && prevLabel && (
                        <span style={{ fontWeight: 800, color: headline.dN >= 0 ? C.green : C.navy }}> {headline.dN === 0 ? 'unchanged' : `${headline.dN > 0 ? 'up' : 'down'} ${Math.abs(headline.dN)} points`}</span>
                      )}
                      {headline.dN !== null && prevLabel && <span style={{ color: C.muted }}> vs {prevLabel}</span>}
                      . <b style={{ color: C.green }}>{pct(pre.promoters, pre.total)}%</b> of customers were happy (rated 9–10) and <b style={{ color: C.navy }}>{pct(pre.detractors, pre.total)}%</b> unhappy (0–6), from <b>{fmtN(pre.total)}</b> ratings by <b>{fmtN(pre.students)}</b> students{headline.coaches > 1 ? <> across <b>{fmtN(headline.coaches)}</b> coaches</> : ''}.
                    </div>
                    {(headline.best || headline.worst) && (
                      <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12.5 }}>
                        {headline.best && (
                          <button onClick={() => openCoach(headline.best)} style={{ border: `0.5px solid ${C.border}`, background: 'var(--greenBg, #E9F8EF)', color: C.text, borderRadius: 10, padding: '6px 12px', cursor: 'pointer', fontFamily: FONT, fontSize: 12.5 }}>
                            <b style={{ color: C.green }}>Best</b> · {headline.best.name} — NPS {headline.best.pre.nps} ({headline.best.pre.total} ratings)
                          </button>
                        )}
                        {headline.worst && (
                          <button onClick={() => openCoach(headline.worst)} style={{ border: `0.5px solid ${C.border}`, background: 'var(--navy-tint)', color: C.text, borderRadius: 10, padding: '6px 12px', cursor: 'pointer', fontFamily: FONT, fontSize: 12.5 }}>
                            <b style={{ color: C.navy }}>Needs attention</b> · {headline.worst.name} — NPS {headline.worst.pre.nps} ({headline.worst.pre.total} ratings)
                          </button>
                        )}
                        
                      </div>
                    )}
                  </>
                ) : null}
              </div>

              {/* 3. How customers rated (clickable) + post-sales */}
              {pre && pre.total > 0 && (
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', padding: '16px 28px 0' }}>
                  <div style={{ flex: '1 1 520px', minWidth: 0 }}>
                    <Card title="How customers rated" >
                      <MixBar p={pre.promoters} pa={pre.passives} d={pre.detractors} height={14} active={bucket} onPick={pickBucket} />
                      <MixLegend p={pre.promoters} pa={pre.passives} d={pre.detractors} active={bucket} onPick={pickBucket} />
                      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: C.muted, margin: '14px 0 0' }}>Score distribution (0–10){score !== null ? ` · showing score ${score}` : ''}</div>
                      <DistChart dist={distPre} active={score} onPick={pickScore} />
                    </Card>
                  </div>
                  {hasPost && (
                    <div style={{ flex: '1 1 380px', minWidth: 0 }}>
                      <Card title="Post-sales" sub="Read-only for now">
                        <MixBar p={post.promoters} pa={post.passives} d={post.detractors} height={14} />
                        <MixLegend p={post.promoters} pa={post.passives} d={post.detractors} />
                        <DistChart dist={forStage(data.distribution, 'post')} />
                      </Card>
                    </div>
                  )}
                </div>
              )}
              {/* 4. Trends (clickable) */}
              {pre && pre.total > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16, padding: '16px 28px 0' }}>
                  <Card title="Day-on-day NPS" sub="Click a day to see who was rated">
                    <TrendChart rows={daySeries} rolling keyName="d" fmtLabel={dayLabel} hasPost={hasPost} onPick={d => setDayOpen(d)} hint="Click to see who was rated" />
                  </Card>
                  {monthSeries.length >= 3 && <Card title="Month-on-month NPS" >
                    <TrendChart rows={monthSeries} keyName="m" fmtLabel={monthLabel} hasPost={hasPost} onPick={zoomMonth} hint="Click to zoom into this month" />
                  </Card>}
                </div>
              )}

              {/* 5. The people table: drill-down, quick filters */}
              {scopeLevel && scopeLevel !== 'coach' && (
                <div style={{ padding: '16px 28px 0' }}>
                  <Card title={`By ${LEVEL_NAME[level].toLowerCase()}`}
                    sub={`${fmtN(filtered.length)} ${LEVEL_PLURAL[level]}${level !== 'coach' ? ' · click a row to drill into it' : ' · click a coach to open their panel'}`}
                    action={
                      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email or manager…"
                        style={{ width: 230, padding: '7px 11px', borderRadius: 8, border: `0.5px solid ${C.border}`, background: 'var(--card)', color: C.text, fontSize: 12.5, fontFamily: FONT, outline: 'none' }} />
                    }>
                    {/* breadcrumb + quick filters */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                      {canDrill && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, fontFamily: FONT, marginRight: 8 }}>
                          <button onClick={() => { setPath([]); setFlat(false) }} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: path.length || flat ? C.blue : C.text, fontWeight: 800, fontFamily: FONT, fontSize: 12.5, padding: 2 }}>{scopeLevel === 'admin' ? 'All senior managers' : 'All managers'}</button>
                          {path.map((p, i) => (
                            <React.Fragment key={i}>
                              <span style={{ color: C.muted }}>›</span>
                              <button onClick={() => { setPath(path.slice(0, i + 1)); setFlat(false) }} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: i === path.length - 1 && !flat ? C.text : C.blue, fontWeight: 800, fontFamily: FONT, fontSize: 12.5, padding: 2 }}>{p.name}</button>
                            </React.Fragment>
                          ))}
                          {flat && <><span style={{ color: C.muted }}>›</span><span style={{ fontWeight: 800, color: C.text }}>all coaches</span></>}
                        </div>
                      )}
                      {[['all', 'Everyone'], ['attention', 'Needs attention'], ['top', 'Top performers']].map(([k, l]) => (
                        <button key={k} onClick={() => { setQuick(k); setBucket(null); setScore(null) }} style={chipBtn(quick === k)}
                          title={k === 'attention' ? `The 10 lowest NPS among rows with ${min}+ ratings` : k === 'top' ? `The 10 highest NPS among rows with ${min}+ ratings` : ''}>{l}</button>
                      ))}
                      {canDrill && level !== 'coach' && <button onClick={() => setFlat(true)} style={chipBtn(false)}>List all coaches</button>}
                      {bucket && <button onClick={() => setBucket(null)} style={{ ...chipBtn(true, BUCKETS[bucket].color) }}>With {BUCKETS[bucket].label.toLowerCase()} ratings ×</button>}
                      {score !== null && <button onClick={() => setScore(null)} style={{ ...chipBtn(true) }}>Rated exactly {score} ×</button>}
                      <div style={{ flex: 1 }} />
                      <button onClick={() => setMoreCols(v => !v)} style={chipBtn(moreCols)}>{moreCols ? 'Fewer columns' : 'More columns'}</button>
                    </div>

                    <div style={{ overflow: 'auto', maxHeight: 620, border: `0.5px solid ${C.border}`, borderRadius: 10 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            <th style={{ ...th, textAlign: 'left', left: 0, zIndex: 2 }} onClick={() => sortBy('name')}>{LEVEL_NAME[level]}{arrow('name')}</th>
                            {level === 'coach' && <th style={{ ...th, textAlign: 'left', cursor: 'default' }}>Manager</th>}
                            {level !== 'coach' && <th style={th} onClick={() => sortBy('coaches')}>Coaches{arrow('coaches')}</th>}
                            <th style={th} onClick={() => sortBy('total')}>Ratings{arrow('total')}</th>
                            <th style={th} onClick={() => sortBy('avg')}>Avg{arrow('avg')}</th>
                            <th style={th} onClick={() => sortBy('nps')}>NPS{arrow('nps')}</th>
                            <th style={{ ...th, cursor: 'default' }} title="Change in NPS vs the previous window of the same length (shown when both have 3+ ratings)">vs prev</th>
                            <th style={{ ...th, cursor: 'default', minWidth: 130 }}>Happy / Neutral / Unhappy</th>
                            {moreCols && <>
                              <th style={th} onClick={() => sortBy('students')}>Students{arrow('students')}</th>
                              <th style={th} onClick={() => sortBy('promoters')}>Happy{arrow('promoters')}</th>
                              <th style={th} onClick={() => sortBy('passives')}>Neutral{arrow('passives')}</th>
                              <th style={th} onClick={() => sortBy('detractors')}>Unhappy{arrow('detractors')}</th>
                            </>}
                          </tr>
                        </thead>
                        <tbody>
                          {pageRows.length === 0 && (
                            <tr><td colSpan={colCount + 1} style={{ ...td, textAlign: 'center', color: C.muted, padding: 28 }}>No {LEVEL_PLURAL[level]} match these filters.</td></tr>
                          )}
                          {pageRows.map(r => {
                            const few = r.pre.total < min
                            const pv = prevRows.get(r.key)
                            const dlt = pv && pv.pre && pv.pre.total >= 3 && r.pre.total >= 3 && r.pre.nps !== null && pv.pre.nps !== null ? r.pre.nps - pv.pre.nps : null
                            return (
                              <tr key={r.key} onClick={() => onRowClick(r)} style={{ cursor: 'pointer', opacity: few ? 0.7 : 1 }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg2)' }} onMouseLeave={e => { e.currentTarget.style.background = '' }}>
                                <td style={{ ...td, textAlign: 'left', fontWeight: 700, background: 'inherit', position: 'sticky', left: 0 }}>
                                  {r.name}{level !== 'coach' && <span style={{ color: C.blue, marginLeft: 6, fontWeight: 800 }}>›</span>}
                                </td>
                                {level === 'coach' && <td style={{ ...td, textAlign: 'left', color: C.sub }}>{r.manager || 'Unmapped'}</td>}
                                {level !== 'coach' && <td style={td}>{fmtN(r.coachCount)}</td>}
                                <td style={td}>{fmtN(r.pre.total)}</td>
                                <td style={td}>{r.pre.avg !== null ? r.pre.avg.toFixed(1) : '—'}</td>
                                <td style={td}><NpsChip v={r.pre.nps} total={r.pre.total} min={min} /></td>
                                <td style={{ ...td, color: dlt === null ? C.muted : dlt >= 0 ? C.green : C.navy, fontWeight: 700 }}>{dlt === null ? '—' : dlt === 0 ? '–' : `${dlt > 0 ? '▲' : '▼'} ${Math.abs(dlt)}`}</td>
                                <td style={{ ...td, minWidth: 130 }}><MixBar p={r.pre.promoters} pa={r.pre.passives} d={r.pre.detractors} /></td>
                                {moreCols && <>
                                  <td style={td}>{fmtN(r.pre.students)}</td>
                                  <td style={td}>{fmtN(r.pre.promoters)}</td>
                                  <td style={td}>{fmtN(r.pre.passives)}</td>
                                  <td style={td}>{fmtN(r.pre.detractors)}</td>
                                </>}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, fontSize: 12, color: C.muted, flexWrap: 'wrap' }}>
                      <span>* / greyed = fewer than {min} ratings, so the NPS is a rough signal. Post-sales columns appear here once that data is connected.</span>
                      <div style={{ flex: 1 }} />
                      {pages > 1 && (
                        <>
                          <button disabled={safePage === 0} onClick={() => setPage(safePage - 1)} style={{ padding: '5px 12px', borderRadius: 8, border: `0.5px solid ${C.border}`, background: 'var(--card)', cursor: safePage === 0 ? 'default' : 'pointer', opacity: safePage === 0 ? 0.4 : 1, fontFamily: FONT, fontWeight: 700 }}>Prev</button>
                          <span style={{ color: C.sub }}>Page {safePage + 1} of {pages}</span>
                          <button disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)} style={{ padding: '5px 12px', borderRadius: 8, border: `0.5px solid ${C.border}`, background: 'var(--card)', cursor: safePage >= pages - 1 ? 'default' : 'pointer', opacity: safePage >= pages - 1 ? 0.4 : 1, fontFamily: FONT, fontWeight: 700 }}>Next</button>
                        </>
                      )}
                    </div>
                  </Card>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
      {drill && <CoachDrawer row={drill} range={range} min={min} onClose={() => setDrill(null)} />}
      {dayOpen && <DayPanel day={dayOpen} min={min} onClose={() => setDayOpen(null)} onOpenCoach={c => { setDayOpen(null); setDrill(c) }} />}
    </div>
  )
}
