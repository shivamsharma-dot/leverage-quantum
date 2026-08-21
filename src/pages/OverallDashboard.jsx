import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList,
  CartesianGrid, LineChart, Line, Legend, AreaChart, Area,
  ScatterChart, Scatter, ZAxis, ReferenceLine,
} from 'recharts'
import Sidebar from '../components/Sidebar'
import { DashboardSkeleton } from '../components/SkeletonLoader'
import ExportButton from '../components/ExportButton'
import SlackReportPanel from '../components/SlackReportPanel'
import { SlackIcon } from '../components/icons/BrandIcons'
import { CORRIDOR_MIN_QL } from '../lib/pmReport'
import {
  CpqlBySource, SpendVsQuality, CostTrendMonth, CostTrendDay,
  CorridorRanking, AdRanking, NotPerforming
} from '../components/QualitySections'
import { captureNodePng, rowsToCsv, nextPaint } from '../lib/slackShare'
import Button from '../components/Button'
import { getSession, setSession, hasLoaded, getPersisted } from '../lib/sessionLoad'
import { classifyCorridor, corridorLabel, CORRIDORS } from '../lib/corridors'
import { C, FONT, brandColor, fmtN, pct, Card, PremKPI, KPI_ICONS, RankedBars, BarGrad, barFill, BAR_RADIUS_H } from '../ui/dashboardKit'
// Data source: BigQuery -- see src/lib/overallBqCache.js for the why. Which
// source this page instance reads is now fixed by the `dataSource` prop (two
// separate routes/pages -- see App.jsx), not a per-device Settings toggle.
import {
  fetchOverallBqRows, fetchOverallBqBounds, fetchOverallBqSyncedAt,
} from '../lib/overallBqCache'

// "Overall PM" — added by the admin as a custom Data Source (Settings > Data > Google Sheets).
// Not part of the original SHEET_PREF_KEYS set, so this page resolves its own override the same
// way Settings resolves any custom source: prefs[editKey] (if the admin later edits the URL from
// Settings) falls back to the sheet's defaultUrl, falls back to this hardcoded default.
const DEFAULT_URL = 'https://docs.google.com/spreadsheets/d/1kaoWMGBbttOtaeVfaSXhrxcs0_pe5xLXltMulG8mHG4/gviz/tq?tqx=out:csv&sheet=MainData'

async function resolveOverallUrl() {
  // Server-side resolution (any signed-in user, admin or not) -- see api/preferences.mjs's
  // ?resolveOverallSheet=1 branch. Doing this server-side (rather than reading
  // custom_data_sources directly, which is admin-only) means non-admin sessions still
  // get the real admin-configured sheet instead of silently falling back to DEFAULT_URL.
  try {
    const r = await fetch('/api/preferences?resolveOverallSheet=1', { credentials: 'include' })
    if (r.ok) {
      const { url } = await r.json()
      if (url) return url
    }
  } catch (_) {}
  return DEFAULT_URL
}

const OVERALL_URL_CACHE_KEY = 'lq_overall_sheet_url'
let _overallUrlPromise = null
// A1: the CSV load used to await this preference round-trip before it even knew
// the sheet URL, putting a full serial network hop on the critical path ahead of
// the ~2-lakh-row parse. Now the lookup is memoised per module load, kicked off
// at module-eval time (the moment this route chunk lands) so it overlaps mount
// instead of blocking it, and an already-resolved URL is cached in sessionStorage
// so repeat loads in the same tab resolve with no round-trip at all.
function rememberOverallUrl(u) {
  try { if (u && u !== DEFAULT_URL) sessionStorage.setItem(OVERALL_URL_CACHE_KEY, u) } catch (_) {}
  return u
}
function resolveOverallUrlFast() {
  if (_overallUrlPromise) return _overallUrlPromise
  let cached = null
  try { cached = sessionStorage.getItem(OVERALL_URL_CACHE_KEY) } catch (_) {}
  if (cached) {
    resolveOverallUrl().then(rememberOverallUrl).catch(() => {})
    _overallUrlPromise = Promise.resolve(cached)
  } else {
    _overallUrlPromise = resolveOverallUrl().then(rememberOverallUrl)
  }
  return _overallUrlPromise
}
resolveOverallUrlFast()

function parseCSV(t) {
  const rows = []; let i = 0, field = '', row = [], inq = false
  while (i < t.length) {
    const c = t[i]
    if (inq) {
      if (c === '"') { if (t[i + 1] === '"') { field += '"'; i += 2; continue } inq = false; i++; continue }
      field += c; i++; continue
    } else {
      if (c === '"') { inq = true; i++; continue }
      if (c === ',') { row.push(field); field = ''; i++; continue }
      if (c === '\r') { i++; continue }
      if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue }
      field += c; i++; continue
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  const h = rows[0]
  return rows.slice(1).filter(r => r.length > 1).map(r => Object.fromEntries(h.map((k, idx) => [k, (r[idx] || '')])))
}

const MON = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 }
const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function parseD(s) {
  if (!s) return null
  const m = String(s).trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/)
  if (!m) return null
  return new Date(+m[3], MON[m[2]], +m[1])
}
const monthKey = d => d.getFullYear() * 12 + d.getMonth()
const monthLabel = k => MN[((k % 12) + 12) % 12] + "'" + String(Math.floor(k / 12)).slice(2)
const dayKey = d => { const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),dd=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}` }
const dayLabel = d => `${d.getDate()} ${MN[d.getMonth()]}`
// 'YYYY-MM-DD' -> the same integer month key monthKey() derives from a Date, plus that
// month's first/last day. Used only by the BigQuery path, which knows the cache's date
// BOUNDS without holding its rows, and so builds the Month dropdown from those.
const monthKeyFromIso = s => { const p = String(s || '').split('-'); return p.length < 2 ? null : (+p[0]) * 12 + (+p[1] - 1) }
const monthStartDate = mk => new Date(Math.floor(mk / 12), ((mk % 12) + 12) % 12, 1)
const monthEndDate = mk => new Date(Math.floor(mk / 12), ((mk % 12) + 12) % 12 + 1, 0)
// 'YYYY-MM-DD' -> a real local Date. Used to anchor Trend Analysis off the BigQuery
// cache's OWN latest date (bqBounds.max) rather than off nonDateRows -- see the
// trendAnchorDate comment below for why that distinction is load-bearing.
const dateFromIso = s => { const p = String(s || '').split('-').map(Number); return p.length < 3 ? null : new Date(p[0], p[1] - 1, p[2]) }
// A single BigQuery hiccup (rate limit, cold start, a transient network blip) used to
// fall straight back to the CSV path on the first failure -- which is the SLOW one.
// Live-verified this actually happens: a real read failed mid-session and the page fell
// back to the multi-minute sheet load, showing zero everywhere in between. Retrying a
// couple of times first, with a short backoff, absorbs exactly that kind of transient
// failure without ever dropping to the slow path over it. Only a call that's STILL
// failing after every retry falls through to the caller's own catch/fallback.
const retryFetch = (fn, attempts = 3, delay = 400) => {
  const attempt = n => fn().catch(e => {
    if (n >= attempts - 1) throw e
    return new Promise(res => setTimeout(res, delay * (n + 1))).then(() => attempt(n + 1))
  })
  return attempt(0)
}

function parseNum(v) {
  if (v == null) return 0
  const s = String(v).trim()
  if (!s || s === '—' || s === '-' || /^n\/?a$/i.test(s)) return 0
  const n = parseFloat(s.replace(/,/g, ''))
  return isNaN(n) ? 0 : n
}

function mapRow(r) {
  const d = parseD(r.lead_date)
  const humanQL = parseNum(r['Futwork Human QL'])
  const futworkAiQl = parseNum(r['Futwork AI QL'])
  const superbotAiQl = parseNum(r['Superbot AI QL'])
  return {
    date: d,
    mk: d ? monthKey(d) : null,
    source: (r.Source || '').trim() || 'Unknown',
    // Sub_Source sits between Source and campaign_name in the sheet (added 2026-08).
    // Rows from the BigQuery path share this same mapRow() but that saved query does not
    // select Sub_Source yet, so it will read 'Unknown' there until that query is updated --
    // a graceful default, not a crash.
    subSource: (r.Sub_Source || '').trim() || 'Unknown',
    campaign: (r.campaign_name || '').trim(),
    leads: parseNum(r['Total Leads Generated']),
    floorQueued: parseNum(r.floor_queued),
    // 'Queued on Futwork' was renamed to 'Queued on Futwork Human' + a new sibling
    // 'Queued on Futwork AI' column, both in the sheet and the BigQuery saved query
    // (2026-08-19). futworkQ -> futworkHumanQ everywhere in this file to match.
    futworkHumanQ: parseNum(r['Queued on Futwork Human']),
    futworkAiQ: parseNum(r['Queued on Futwork AI']),
    superbotQ: parseNum(r['Queued on Superbot']),
    humanQL, futworkAiQl, superbotAiQl,
    // Total QLs -- every qualification channel combined (Futwork Human + Futwork AI + Superbot AI).
    totalQL: humanQL + futworkAiQl + superbotAiQl,
    apps: parseNum(r['Total Apps']),
    offers: parseNum(r['Total Offers']),
    deposits: parseNum(r['Total Deposits']),
    raus: parseNum(r['Total RAUs']),
    spend: parseNum(r['Total_Spends']),
  }
}

// ── Header controls — ported verbatim (styling + behavior) from the Daily QLs
// page under QL Ops (LeadQualificationDashboard.jsx), per instruction to match
// that header exactly: pill/Dropdown/DateRangePicker components below are the
// same components, just re-declared here since they're local to that file.

function Dropdown({ options, value, onChange, label, minWidth = 120 }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6 }} ref={ref}>
      {label && <span style={{ fontSize:12.5, color:C.muted, fontFamily:FONT, whiteSpace:'nowrap' }}>{label}</span>}
      <div style={{ position:'relative' }}>
        <button onClick={() => setOpen(v => !v)} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px 6px 12px', borderRadius:8, border:`0.5px solid ${open ? C.navy : C.border}`, background: open ? C.navyBg : 'var(--card)', color:C.text, cursor:'pointer', fontFamily:FONT, fontSize:13.5, fontWeight:600, minWidth, boxShadow: open ? '0 0 0 3px rgba(31,60,132,0.08)' : 'none', transition:'all .15s', whiteSpace:'nowrap' }}>
          <span style={{ flex:1, textAlign:'left' }}>{value}</span>
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ flexShrink:0, transition:'transform .2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
            <path d="M1 1l4 4 4-4" stroke={C.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {open && (
          <div style={{ position:'absolute', top:'calc(100% + 6px)', left:0, zIndex:500, background:'var(--card)', border:`0.5px solid ${C.border}`, borderRadius:12, boxShadow:'0 16px 40px rgba(15,23,42,0.14), 0 2px 8px rgba(15,23,42,0.06)', padding:6, minWidth:Math.max(minWidth, 150), maxHeight:280, overflowY:'auto' }}>
            {options.map(opt => {
              const active = opt === value
              return (
                <button key={opt} onClick={() => { onChange(opt); setOpen(false) }} style={{ display:'block', width:'100%', textAlign:'left', padding:'8px 12px', borderRadius:8, border:'none', cursor:'pointer', fontFamily:FONT, fontSize:14, fontWeight: active ? 700 : 400, background: active ? C.navyBg : 'transparent', color: active ? C.navy : C.text }}>
                  <span style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                    {opt}
                    {active && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.navy} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// Multi-select variant of Dropdown, built ONLY for this page's Source filter (Month/
// Corridor stay single-select via the plain Dropdown above -- this is a sibling
// component, not a shared-behavior change, so nothing else on this page is affected).
// Visually matches Dropdown exactly; the two real differences are (1) a checkbox per
// row instead of a single active checkmark, and (2) the panel stays open after a click
// so multiple sources can be toggled in one interaction -- only closes on outside click.
// 'All' is mutually exclusive with everything else by construction (see toggle logic
// below), so the resulting `selected` array is always either exactly ['All'] or a set of
// real source names -- callers never need to re-derive that invariant themselves.
function SourceMultiSelect({ options, selected, onChange, label, minWidth = 120 }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  const isAll = selected.length === 0 || selected.includes('All')
  const toggleAll = () => onChange(['All'])
  const toggleOne = (opt) => {
    if (isAll) { onChange([opt]); return }
    const set = new Set(selected)
    if (set.has(opt)) set.delete(opt); else set.add(opt)
    const next = [...set]
    onChange(next.length === 0 ? ['All'] : next)
  }
  const labelText = isAll ? 'All' : selected.length === 1 ? selected[0] : selected.length + ' selected'
  const Checkbox = ({ checked }) => (
    <span style={{ width:14, height:14, borderRadius:4, border:`1.5px solid ${checked ? C.navy : C.border}`, background: checked ? C.navy : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
      {checked && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
    </span>
  )
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6 }} ref={ref}>
      {label && <span style={{ fontSize:12.5, color:C.muted, fontFamily:FONT, whiteSpace:'nowrap' }}>{label}</span>}
      <div style={{ position:'relative' }}>
        <button onClick={() => setOpen(v => !v)} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px 6px 12px', borderRadius:8, border:`0.5px solid ${open ? C.navy : C.border}`, background: open ? C.navyBg : 'var(--card)', color:C.text, cursor:'pointer', fontFamily:FONT, fontSize:13.5, fontWeight:600, minWidth, boxShadow: open ? '0 0 0 3px rgba(31,60,132,0.08)' : 'none', transition:'all .15s', whiteSpace:'nowrap' }}>
          <span style={{ flex:1, textAlign:'left' }}>{labelText}</span>
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ flexShrink:0, transition:'transform .2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
            <path d="M1 1l4 4 4-4" stroke={C.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {open && (
          <div style={{ position:'absolute', top:'calc(100% + 6px)', left:0, zIndex:500, background:'var(--card)', border:`0.5px solid ${C.border}`, borderRadius:12, boxShadow:'0 16px 40px rgba(15,23,42,0.14), 0 2px 8px rgba(15,23,42,0.06)', padding:6, minWidth:Math.max(minWidth, 170), maxHeight:280, overflowY:'auto' }}>
            <button onClick={toggleAll} style={{ display:'block', width:'100%', textAlign:'left', padding:'8px 12px', borderRadius:8, border:'none', cursor:'pointer', fontFamily:FONT, fontSize:14, fontWeight: isAll ? 700 : 400, background: isAll ? C.navyBg : 'transparent', color: isAll ? C.navy : C.text }}>
              <span style={{ display:'flex', alignItems:'center', gap:8 }}><Checkbox checked={isAll} />All</span>
            </button>
            <div style={{ height:1, background:C.border, margin:'4px 2px' }} />
            {options.map(opt => {
              const checked = !isAll && selected.includes(opt)
              return (
                <button key={opt} onClick={() => toggleOne(opt)} style={{ display:'block', width:'100%', textAlign:'left', padding:'8px 12px', borderRadius:8, border:'none', cursor:'pointer', fontFamily:FONT, fontSize:14, fontWeight: checked ? 700 : 400, background: checked ? C.navyBg : 'transparent', color: checked ? C.navy : C.text }}>
                  <span style={{ display:'flex', alignItems:'center', gap:8 }}><Checkbox checked={checked} />{opt}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// Delays adopting a fast-changing value (a search box keystroke) until it's been
// stable for `delay`ms. The INPUT stays bound to the raw value (so typing itself
// is instant/responsive) -- only the expensive row-filtering that reacts to it
// (iterating the full dataset) is deferred, so it doesn't run on every keystroke
// while someone is mid-word.
function useDebouncedValue(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

// Campaign search — free-text filter with a ranked autocomplete list (top campaigns
// by leads shown by default, narrowed by substring match as the user types) since
// campaign name is how people actually look things up on this page.
function CampaignSearch({ value, onChange, suggestions, minWidth = 210 }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div style={{ position:'relative' }} ref={ref}>
      <div style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 10px', borderRadius:8, border:`0.5px solid ${open ? C.navy : C.border}`, background: open ? C.navyBg : 'var(--card)', minWidth, boxShadow: open ? '0 0 0 3px rgba(31,60,132,0.08)' : 'none', transition:'all .15s' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
        <input
          value={value}
          onChange={e => { onChange(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="Search campaign…"
          style={{ border:'none', outline:'none', background:'transparent', fontFamily:FONT, fontSize:13.5, fontWeight:600, color:C.text, width:'100%' }}
        />
        {value && (
          <button onClick={() => { onChange(''); setOpen(false) }} style={{ border:'none', background:'transparent', cursor:'pointer', color:C.muted, display:'flex', padding:0, flexShrink:0 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        )}
      </div>
      {open && suggestions.length > 0 && (
        <div style={{ position:'absolute', top:'calc(100% + 6px)', left:0, zIndex:500, background:'var(--card)', border:`0.5px solid ${C.border}`, borderRadius:12, boxShadow:'0 16px 40px rgba(15,23,42,0.14), 0 2px 8px rgba(15,23,42,0.06)', padding:6, minWidth:Math.max(minWidth, 280), maxHeight:280, overflowY:'auto' }}>
          <div style={{ fontSize:11.5, fontWeight:700, color:C.muted, letterSpacing:'0.06em', textTransform:'uppercase', padding:'4px 8px 6px' }}>{value.trim() ? 'Matching campaigns' : 'Top campaigns'}</div>
          {suggestions.map(s => (
            <button key={s.name} onClick={() => { onChange(s.name); setOpen(false) }}
              style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, width:'100%', textAlign:'left', padding:'8px 10px', borderRadius:8, border:'none', cursor:'pointer', fontFamily:FONT, background:'transparent' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg3)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
              <span style={{ fontSize:14, fontWeight:600, color:C.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.name}</span>
              <span style={{ fontSize:12.5, fontWeight:700, color:C.navy, flexShrink:0 }}>{fmtN(s.leads)}</span>
            </button>
          ))}
        </div>
      )}
      {open && value.trim() && suggestions.length === 0 && (
        <div style={{ position:'absolute', top:'calc(100% + 6px)', left:0, zIndex:500, background:'var(--card)', border:`0.5px solid ${C.border}`, borderRadius:12, boxShadow:'0 16px 40px rgba(15,23,42,0.14)', padding:'10px 12px', minWidth:Math.max(minWidth, 280), fontSize:13.5, color:C.muted, fontFamily:FONT }}>
          No campaign names match "{value}"
        </div>
      )}
    </div>
  )
}

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAYS = ['Su','Mo','Tu','We','Th','Fr','Sa']

function CalMonth({ year, month, from, to, hovered, onSelect, onHover }) {
  const first = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0).getDate()
  const startDow = first.getDay()
  const cells = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= lastDay; d++) cells.push(new Date(year, month, d))
  return (
    <div style={{ width:220 }}>
      <div style={{ textAlign:'center', fontWeight:700, fontSize:14.5, color:C.text, marginBottom:8, fontFamily:FONT }}>{MONTHS_SHORT[month]} {year}</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2, marginBottom:4 }}>
        {DAYS.map(d => <div key={d} style={{ textAlign:'center', fontSize:11.5, fontWeight:700, color:C.muted, padding:'2px 0', fontFamily:FONT }}>{d}</div>)}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
        {cells.map((date, i) => {
          if (!date) return <div key={'e'+i} />
          const ts = date.getTime()
          const fromTs = from ? from.getTime() : null
          const toTs = (to || hovered) ? (to || hovered).getTime() : null
          const isFrom = fromTs && ts === fromTs
          const isTo = toTs && ts === toTs && from
          const inRange = fromTs && toTs && ts > Math.min(fromTs, toTs) && ts < Math.max(fromTs, toTs)
          const today = new Date(); today.setHours(0, 0, 0, 0)
          const isToday = ts === today.getTime()
          let bg = 'transparent', color = C.text
          if (isFrom || isTo) { bg = C.navy; color = 'var(--card)' }
          else if (inRange) { bg = C.navyBg; color = C.navy }
          return (
            <button key={ts} onClick={() => onSelect(date)} onMouseEnter={() => onHover(date)} onMouseLeave={() => onHover(null)}
              style={{ width:'100%', aspectRatio:'1', border:'none', cursor:'pointer', borderRadius:6, background:bg, color, fontSize:13, fontWeight: isFrom || isTo ? 700 : isToday ? 600 : 400, fontFamily:FONT, position:'relative', transition:'background .1s' }}>
              {date.getDate()}
              {isToday && !isFrom && !isTo && <span style={{ position:'absolute', bottom:2, left:'50%', transform:'translateX(-50%)', width:4, height:4, borderRadius:'50%', background:C.blue, display:'block' }} />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const fmt = d => { if (!d) return ''; const y=d.getFullYear(),mo=String(d.getMonth()+1).padStart(2,'0'),dy=String(d.getDate()).padStart(2,'0'); return `${y}-${mo}-${dy}` }

// Quick-select presets, computed relative to today — optional; only rendered
// when a `presets` array is passed (the main page's own "Custom" filter
// doesn't pass one, so its popover is unchanged).
function buildDatePresets() {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const daysAgo = n => { const d = new Date(today); d.setDate(d.getDate() - n); return d }
  const monthStart = (offset) => new Date(today.getFullYear(), today.getMonth() + offset, 1)
  const monthEnd = (offset) => new Date(today.getFullYear(), today.getMonth() + offset + 1, 0)
  return [
    { label:'Last 7 days', from: daysAgo(6), to: today },
    { label:'Last 30 days', from: daysAgo(29), to: today },
    { label:'Last 90 days', from: daysAgo(89), to: today },
    { label:'This month', from: monthStart(0), to: today },
    { label:'Last month', from: monthStart(-1), to: monthEnd(-1) },
  ]
}

function DateRangePicker({ from, to, onChange, presets }) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const [viewYear, setViewYear] = useState((from || today).getFullYear())
  const [viewMonth, setViewMonth] = useState((from || today).getMonth())
  const [hovered, setHovered] = useState(null)
  const [selFrom, setSelFrom] = useState(from || null)
  const [selTo, setSelTo] = useState(to || null)
  const [step, setStep] = useState(from ? 'to' : 'from')

  const handleSelect = date => {
    if (step === 'from' || selTo) { setSelFrom(date); setSelTo(null); setStep('to') }
    else { if (date < selFrom) { setSelFrom(date); setSelTo(selFrom) } else { setSelTo(date) }; setStep('from') }
  }
  const right = viewMonth === 11 ? { y: viewYear + 1, m: 0 } : { y: viewYear, m: viewMonth + 1 }
  const canApply = selFrom && selTo
  const NavBtn = ({ dir, onClick }) => (
    <button onClick={onClick} style={{ width:28, height:28, borderRadius:7, border:`0.5px solid ${C.border}`, background:'var(--card)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:C.sub }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">{dir === 'left' ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}</svg>
    </button>
  )
  const goLeft = () => viewMonth === 0 ? (setViewYear(y => y - 1), setViewMonth(11)) : setViewMonth(m => m - 1)
  const goRight = () => viewMonth === 11 ? (setViewYear(y => y + 1), setViewMonth(0)) : setViewMonth(m => m + 1)

  return (
    <div style={{ padding:'16px 20px', fontFamily:FONT, display:'flex', gap:16 }}>
      {presets && (
        <div style={{ display:'flex', flexDirection:'column', gap:3, paddingRight:16, borderRight:`0.5px solid ${C.border}`, minWidth:120 }}>
          {presets.map(p => {
            const active = selFrom && selTo && fmt(selFrom) === fmt(p.from) && fmt(selTo) === fmt(p.to)
            return (
              <button key={p.label}
                onClick={() => { setSelFrom(p.from); setSelTo(p.to); setViewYear(p.from.getFullYear()); setViewMonth(p.from.getMonth()); setStep('from') }}
                style={{ textAlign:'left', padding:'7px 10px', borderRadius:7, border:'none', cursor:'pointer', fontFamily:FONT, fontSize:13.5, fontWeight: active ? 700 : 500, background: active ? C.navyBg : 'transparent', color: active ? C.navy : C.sub }}>
                {p.label}
              </button>
            )
          })}
        </div>
      )}
      <div>
        <div style={{ display:'flex', gap:8, marginBottom:14, alignItems:'center' }}>
          <div style={{ flex:1, padding:'6px 10px', borderRadius:8, border:`1.5px solid ${step === 'from' ? C.navy : C.border}`, background: step === 'from' ? C.navyBg : '#FAFAFA', fontSize:13.5, fontWeight:600, color: selFrom ? C.text : C.muted, fontFamily:FONT, cursor:'pointer' }} onClick={() => setStep('from')}>{selFrom ? fmt(selFrom) : 'Start date'}</div>
          <svg width="16" height="10" viewBox="0 0 16 10" fill="none"><path d="M0 5h14M10 1l4 4-4 4" stroke={C.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <div style={{ flex:1, padding:'6px 10px', borderRadius:8, border:`1.5px solid ${step === 'to' && selFrom ? C.navy : C.border}`, background: step === 'to' && selFrom ? C.navyBg : '#FAFAFA', fontSize:13.5, fontWeight:600, color: selTo ? C.text : C.muted, fontFamily:FONT, cursor: selFrom ? 'pointer' : 'default' }} onClick={() => selFrom && setStep('to')}>{selTo ? fmt(selTo) : 'End date'}</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:4, marginBottom:12 }}>
          <NavBtn dir="left" onClick={goLeft} /><div style={{ flex:1 }} /><NavBtn dir="right" onClick={goRight} />
        </div>
        <div style={{ display:'flex', gap:24 }}>
          <CalMonth year={viewYear} month={viewMonth} from={selFrom} to={selTo} hovered={step === 'to' ? hovered : null} onSelect={handleSelect} onHover={step === 'to' ? setHovered : () => {}} />
          <CalMonth year={right.y} month={right.m} from={selFrom} to={selTo} hovered={step === 'to' ? hovered : null} onSelect={handleSelect} onHover={step === 'to' ? setHovered : () => {}} />
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:14, paddingTop:12, borderTop:'0.5px solid #F1F5F9' }}>
          <Button onClick={() => { setSelFrom(null); setSelTo(null); setStep('from') }} variant="secondary" size="sm">Clear</Button>
          <Button onClick={() => canApply && onChange(fmt(selFrom), fmt(selTo))} disabled={!canApply} size="sm">Apply range</Button>
        </div>
      </div>
    </div>
  )
}

function BrandTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null
  return (
    <div style={{ background:'#fff', border:'0.5px solid #E5E7EB', borderRadius:10, padding:'9px 13px', fontFamily:FONT, boxShadow:'0 8px 24px rgba(15,23,42,0.12)' }}>
      <div style={{ fontSize:13, fontWeight:800, color:'#0F1B33', marginBottom:4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ fontSize:13, color:'#475569', display:'flex', justifyContent:'space-between', gap:18 }}>
          <span style={{ color:p.color || p.fill }}>{p.name}</span>
          <span style={{ fontWeight:700, fontVariantNumeric:'tabular-nums' }}>{fmtN(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

// Quadrant classification for the CPQL-vs-Volume efficiency map -- brand colors only.
// High CPQL is a red flag regardless of volume; low CPQL needs sufficient QL volume
// (>= median) to count as a proven "best performer" rather than just a small, unproven sample.
const QUADRANT_COLOR = { flag:C.navy, best:C.green, promising:C.blue }
const QUADRANT_TAG = { flag:'High CPQL — red flag', best:'Best performer — scale', promising:'Promising — needs more volume' }
function EfficiencyMapTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null
  const d = payload[0].payload
  return (
    <div style={{ background:'#fff', border:'0.5px solid #E5E7EB', borderRadius:10, padding:'10px 14px', fontFamily:FONT, boxShadow:'0 8px 24px rgba(15,23,42,0.12)', maxWidth:240 }}>
      <div style={{ fontSize:13, fontWeight:800, color:'#0F1B33', marginBottom:6, wordBreak:'break-word' }}>{d.campaign}</div>
      <div style={{ fontSize:13, color:'#475569', display:'flex', justifyContent:'space-between', gap:18 }}><span>CPQL</span><span style={{ fontWeight:700 }}>₹{Math.round(d.cpql).toLocaleString('en-IN')}</span></div>
      <div style={{ fontSize:13, color:'#475569', display:'flex', justifyContent:'space-between', gap:18 }}><span>Total QLs</span><span style={{ fontWeight:700 }}>{fmtN(d.totalQL)}</span></div>
      <div style={{ fontSize:13, color:'#475569', display:'flex', justifyContent:'space-between', gap:18 }}><span>Spend</span><span style={{ fontWeight:700 }}>₹{Math.round(d.spend).toLocaleString('en-IN')}</span></div>
      <div style={{ fontSize:12, fontWeight:700, color:QUADRANT_COLOR[d.quadrant], marginTop:6 }}>{QUADRANT_TAG[d.quadrant]}</div>
    </div>
  )
}

const sectionTitle = (t, s) => (
  <div style={{ marginBottom:14 }}>
    <div style={{ fontSize:14, fontWeight:800, color:C.text, letterSpacing:'-0.2px' }}>{t}</div>
    {s && <div style={{ fontSize:12.5, color:C.muted, marginTop:2 }}>{s}</div>}
  </div>
)
const axis = { fontSize:12.5, fill:C.muted, fontFamily:FONT }
const grid2 = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }

// Heat scale for conversion rates — brand colors only (no red/amber on data), matching
// the convention used elsewhere in the app (navy = needs attention, green = strong).
const heatColor = v => v == null ? C.muted : v >= 50 ? C.green : v >= 25 ? C.cyan : v >= 10 ? C.blue : C.navy
const heatBg = v => v == null ? 'transparent' : v >= 50 ? C.greenBg : v >= 25 ? C.cyanBg : v >= 10 ? C.blueBg : C.navyBg

// ── Grouped summary table — customizable columns (show/hide + reorder, persisted to
// localStorage so the layout sticks between sessions), sortable headers, search, and a
// per-view export button — same "creative table" pattern as Meta Ads Creatives.
const SUMMARY_COLUMNS = [
  { key:'corridor', label:'Corridor' },
  // Source/Sub Source -- only meaningful (and only ever shown, see displayCols below) in
  // Campaign view, right after Corridor -- both are landed on their dominant (highest-lead)
  // Source/Sub_Source combination per campaign via byCampaign's own aggregation, since a
  // campaign name is expected to sit under one Source/Sub Source pair throughout the sheet.
  { key:'source', label:'Source' },
  { key:'subSource', label:'Sub Source' },
  { key:'spend', label:'Spend' },
  { key:'leads', label:'Leads' },
  // Contribution % -- what share of a chosen metric's grand total this row represents.
  // The metric is switchable via a small picker in the column header (default Leads);
  // see contribMetric/valueWithContrib below. Ends in "Pct" deliberately so it inherits
  // summaryFmt's percentage formatting and the heat-color treatment for free.
  { key:'contribPct', label:'Contribution %' },
  { key:'floorQueued', label:'Floor Queued' },
  { key:'queued', label:'Total Queued' },
  { key:'futworkHumanQ', label:'Futwork Human Queued' },
  { key:'futworkAiQ', label:'Futwork AI Queued' },
  { key:'superbotQ', label:'Superbot Queued' },
  { key:'humanQL', label:'Futwork Human QL' },
  { key:'futworkAiQl', label:'Futwork AI QL' },
  { key:'superbotAiQl', label:'Superbot AI QL' },
  // Single-channel queued-to-QL conversion, distinct from the whole-funnel QL %
  // below (which divides by Total Queued, i.e. all 3 channels combined).
  { key:'futworkQlPct', label:'Lead to QL %' },
  { key:'futworkHumanQlPct', label:'Lead to QL % (Human)' },
  { key:'futworkAiQlPct', label:'Lead to QL % (AI)' },
  { key:'totalQL', label:'Total QLs' },
  { key:'apps', label:'Applications' },
  { key:'offers', label:'Offers' },
  { key:'deposits', label:'Deposits' },
  { key:'raus', label:'Actual RAUs' },
  { key:'estimatedRaus', label:'Estimated RAU' },
  { key:'qlPct', label:'QL %' },
  { key:'appPct', label:'App %' },
  { key:'depositPct', label:'Deposit %' },
  { key:'cpl', label:'CPL' },
  { key:'cpql', label:'CPQL' },
  { key:'cpa', label:'CPA' },
  { key:'estSrRevenue', label:'Est. SR Revenue' },
  { key:'actSrRevenue', label:'Actual SR Revenue' },
  { key:'roas', label:'Actual ROAS' },
  { key:'estimatedRoas', label:'Est. ROAS' },
]
const SUMMARY_COLUMN_KEYS = SUMMARY_COLUMNS.map(c => c.key)
// The columns a CEO actually reads. Used ONLY for the Slack image, so the
// picture stays legible on a phone. The CSV posted next to it still carries
// every column, so nothing is lost.
const CEO_IMAGE_KEYS = ['corridor', 'spend', 'leads', 'cpl', 'totalQL', 'cpql', 'apps', 'cpa', 'deposits']
// Paid means we hand a platform money for the click. Everything else --
// remarketing, content, referral, offline, affiliate partner, NA -- is banded
// separately so paid efficiency is not diluted by organic volume.
const PAID_SOURCE_KEYS = ['facebook', 'google', 'affiliate', 'linkedin', 'bing', 'remarketing']
const isPaidSource = label => PAID_SOURCE_KEYS.includes(String(label || '').trim().toLowerCase())
const SUMMARY_COLS_STORAGE_KEY = 'lq_overall_summary_visible_cols'
const SUMMARY_ORDER_STORAGE_KEY = 'lq_overall_summary_col_order'
const PIN_COLS_STORAGE_KEY = 'lq_overall_summary_pin_cols'
// Bump this whenever SUMMARY_COLUMNS' declared order changes meaningfully (not just when a
// column is added). A saved colOrder only ever gets NEW keys appended at the end, so a real
// re-sequencing (e.g. moving Corridor next to the campaign name) would otherwise sit invisible
// behind any already-saved order on a returning browser until someone clicks "Reset". Storing a
// version alongside the saved order lets us detect that case and fall back to the fresh
// declared default instead, with no manual Reset needed.
const SUMMARY_SCHEMA_VERSION = 3
const SUMMARY_SCHEMA_VERSION_KEY = 'lq_overall_summary_schema_version'
// Shared with Settings > Data > SR Revenue Assumptions — same rate everywhere.
// RAU = "Registered At University". Estimated RAUs is a projection (Deposits x
// conversion factor); Actual RAUs is the real, already-realized count from the data.
// Revenue = RAUs (estimated or actual) x SR Fee -- no extra discount on the actual side,
// since real RAUs don't need a realization haircut.
const SR_FEE_KEY = 'lq_sr_fee'
const SR_FEE_DEFAULT = 350000
const RAU_CONVERSION_FACTOR = 0.7

// Full INR formatter — the exact figure, no Cr/L shorthand. Primary display value for
// money in the summary table and the Compare/Trend modals. On the 5 money KPI cards
// (Est. SR Revenue/Spend/CPL/CPQL/CPA) this is deliberately the OTHER way around: the
// short Cr/L form is the displayed value and this is only the hover tooltip -- a long
// value like ₹1,69,48,220 overflowed a 10-across card and got visually painted over by
// its neighbour, so those 5 cards flip which formatter is primary. See fmtINRShort.
function fmtINR(n) {
  n = parseFloat(n) || 0
  return '₹' + Math.round(n).toLocaleString('en-IN')
}
// Cr/L shorthand. Primary displayed value on the 5 money KPI cards (with the exact
// fmtINR figure in their hover tooltip); everywhere else on this page it's the reverse
// -- fmtINR is primary and this is only ever the tooltip.
function fmtINRShort(n) {
  n = parseFloat(n) || 0
  if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr'
  if (n >= 1e5) return '₹' + (n / 1e5).toFixed(1) + 'L'
  return '₹' + Math.round(n).toLocaleString('en-IN')
}

function summaryValue(g, key) {
  if (key === 'qlPct') return g.queued > 0 ? (g.totalQL / g.queued) * 100 : 0
  if (key === 'appPct') return g.totalQL > 0 ? (g.apps / g.totalQL) * 100 : 0
  if (key === 'depositPct') return g.offers > 0 ? (g.deposits / g.offers) * 100 : 0
  // Single-channel queued-to-QL rates. futworkQlPct's denominator is Futwork Human +
  // Futwork AI queued only (never Superbot) -- the Futwork channel's own subtotal,
  // distinct from qlPct above which divides by Total Queued (all 3 channels).
  if (key === 'futworkQlPct') {
    const q = (g.futworkHumanQ || 0) + (g.futworkAiQ || 0)
    return q > 0 ? ((g.humanQL + g.futworkAiQl) / q) * 100 : 0
  }
  // C4 fix: 'Queued on Futwork Human/AI' (the denominator here) was split out of a single
  // 'Queued on Futwork' column on 2026-08-19/20 and was never backfilled for anything
  // before that -- while 'Futwork Human/AI QL' (the numerator, the actual qualification
  // OUTCOME) has been correctly split since well before then. So a pre-split period
  // divides a real, non-trivial QL count by a near-zero/unbacked-filled queued figure and
  // produces a four-digit artefact (measured live: Jul'26 read 2931.5%/4487.5%, a later
  // stage rendered wider than the stage that feeds it on the funnel chart). Rather than
  // hardcode the exact cutover date -- which would need updating if the sheet's own
  // backfill history changes, and would still need per-row date logic to handle a group
  // that spans both eras (Source/Campaign/Corridor views aggregate across the whole
  // filtered window, they don't carry one single date) -- detect the SYMPTOM directly:
  // above this ceiling the ratio cannot be a real conversion rate no matter how small the
  // sample, only a missing-denominator artefact, so it renders '--' instead. Comfortably
  // above the '>100% is expected on a small/lagging row' case the info tooltip already
  // documents (a real small-sample outlier has no reason to clear 5x), comfortably below
  // the actual observed garbage values.
  const IMPLAUSIBLE_RATE_CEILING = 500
  if (key === 'futworkHumanQlPct') {
    if (!(g.futworkHumanQ > 0)) return 0
    const pct = (g.humanQL / g.futworkHumanQ) * 100
    return pct > IMPLAUSIBLE_RATE_CEILING ? null : pct
  }
  if (key === 'futworkAiQlPct') {
    if (!(g.futworkAiQ > 0)) return 0
    const pct = (g.futworkAiQl / g.futworkAiQ) * 100
    return pct > IMPLAUSIBLE_RATE_CEILING ? null : pct
  }
  // Cost metrics divide by PAID denominators only (leads/QLs/apps from rows that carried
  // spend). null -- rendered as "—" -- when a row had no paid activity, since a flat ₹0
  // reads like "free and excellent" when it actually means "no spend here at all".
  if (key === 'cpl') return (g.spend > 0 && g.paidLeads > 0) ? g.spend / g.paidLeads : null
  if (key === 'cpql') return (g.spend > 0 && g.paidQL > 0) ? g.spend / g.paidQL : null
  if (key === 'cpa') return (g.spend > 0 && g.paidApps > 0) ? g.spend / g.paidApps : null
  return g[key]
}
function summaryFmt(key, v) {
  if (v == null) return '—'
  if (key === 'corridor' || key === 'source' || key === 'subSource') return v
  if (key === 'roas' || key === 'estimatedRoas') return v.toFixed(2) + 'x'
  if (key.endsWith('Pct')) return v.toFixed(1) + '%'
  if (key.endsWith('SrRevenue') || key === 'spend' || key === 'cpl' || key === 'cpql' || key === 'cpa') return fmtINR(v)
  return fmtN(v)
}
function summaryColor(key) {
  if (key === 'raus') return C.navy
  if (key === 'estimatedRaus') return C.blue
  if (key === 'qlPct') return C.cyan
  if (key === 'appPct') return C.blue
  if (key === 'depositPct') return C.green
  if (key === 'futworkQlPct') return C.navy
  if (key === 'futworkHumanQlPct') return C.blue
  if (key === 'futworkAiQlPct') return C.cyan
  if (key === 'leads') return '#0F172A'
  if (key === 'spend') return C.navy
  if (key === 'cpl') return C.blue
  if (key === 'cpql') return C.cyan
  if (key === 'cpa') return C.green
  if (key === 'estSrRevenue') return C.blue
  if (key === 'actSrRevenue') return C.green
  if (key === 'roas') return C.green
  if (key === 'estimatedRoas') return C.blue
  return '#475569'
}
const SUMMARY_BOLD_COLS = ['leads', 'spend', 'raus', 'qlPct', 'appPct', 'depositPct', 'futworkQlPct', 'futworkHumanQlPct', 'futworkAiQlPct', 'estSrRevenue', 'actSrRevenue', 'roas', 'estimatedRoas']
// Text (not numeric) columns -- left-aligned, muted, no heat/bold treatment. Corridor/
// Source/Sub Source only ever appear together (campaign view only, see displayCols).
const TEXT_COL_KEYS = ['corridor', 'source', 'subSource']
// Summary table: only the label column (Source/Campaign/Corridor/Month/Day, whichever
// the active grouping is) stays pinned to the left edge while every other column
// (Spend included) scrolls under it horizontally.
const LABEL_COL_W = 170
// No-op (returns {}) unless `pin` is true -- pinning is an opt-in toggle (see pinCols
// state), off by default, so an unpinned table behaves exactly like a normal scrolling
// table with no sticky positioning at all.
const stickyLabelStyle = (pin, bg) => (pin ? { position:'sticky', left:0, zIndex:2, background:bg, minWidth:LABEL_COL_W, width:LABEL_COL_W, boxShadow:'2px 0 4px -2px rgba(15,23,42,0.10)' } : {})

// Small expand/collapse indicator for the Source view's tree rows (Source -> Sub Source ->
// Campaign). Rotates 90deg open, matching the caret convention already used by Dropdown.
function TreeChevron({ open }) {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition:'transform .15s', flexShrink:0 }}>
      <polyline points="9 6 15 12 9 18" />
    </svg>
  )
}

// Shared metric list for Deep Analysis (Compare's full table + Trend Analysis) --
// one definition so the two features can never disagree on what "CPQL" means or
// how it's formatted. fmt(null) must read '--', matching summaryFmt's own null rule.
const DEEP_METRICS = [
  { key:'spend', label:'Spend', fmt:v => v == null ? '—' : fmtINR(v) },
  { key:'leads', label:'Leads', fmt:v => v == null ? '—' : fmtN(v) },
  { key:'queued', label:'Total Queued', fmt:v => v == null ? '—' : fmtN(v) },
  { key:'totalQL', label:'Total QL', fmt:v => v == null ? '—' : fmtN(v) },
  { key:'apps', label:'Applications', fmt:v => v == null ? '—' : fmtN(v) },
  { key:'offers', label:'Offers', fmt:v => v == null ? '—' : fmtN(v) },
  { key:'deposits', label:'Deposits', fmt:v => v == null ? '—' : fmtN(v) },
  { key:'raus', label:'Actual RAUs', fmt:v => v == null ? '—' : fmtN(v) },
  { key:'cpl', label:'CPL', fmt:v => v == null ? '—' : fmtINR(v) },
  { key:'cpql', label:'CPQL', fmt:v => v == null ? '—' : fmtINR(v) },
  { key:'cpa', label:'CPA', fmt:v => v == null ? '—' : fmtINR(v) },
]
// Metrics the Contribution % column can be switched to via its header picker.
const CONTRIB_METRICS = [
  { key:'leads', label:'Leads' },
  { key:'queued', label:'Total Queued' },
  { key:'totalQL', label:'Total QLs' },
  { key:'apps', label:'Applications' },
  { key:'offers', label:'Offers' },
  { key:'deposits', label:'Deposits' },
  { key:'spend', label:'Spend' },
]
const CONTRIB_METRIC_STORAGE_KEY = 'lq_overall_contrib_metric'

const DEEP_DIMENSIONS = [
  { key:'corridor', label:'Corridor' },
  { key:'source', label:'Source' },
  { key:'campaign', label:'Campaign' },
  { key:'month', label:'Month' },
  { key:'day', label:'Day' },
]
// true for the three dimensions whose values are stable names that recur across any
// two periods (a campaign/source/corridor named the same thing this month and last
// month IS the same thing) -- these can be joined row-for-row into a single delta
// table. Day and Month keys never recur across two genuinely different ranges, so
// joining them would show every single row as "new" -- those two are shown as two
// separate breakdowns instead (see the Compare modal's compareJoinable branch).
const DEEP_JOINABLE_DIMS = new Set(['source', 'campaign', 'corridor'])

// C9 fix: Compare, Trend, this Columns picker, and the SR Fee popover were all plain
// fixed/absolute divs with no role, no aria-modal, no initial focus, no focus trap, and
// Escape did not close any of them -- confirmed live (opening one and pressing Tab moved
// focus into the page behind the overlay, not into the dialog). One hook, used by all
// four: moves focus into the dialog the moment it opens, traps Tab within it so it can
// never escape into the page behind, closes on Escape, and restores focus to whatever
// was focused before opening once it closes/unmounts.
//
// `open` may be a fixed `true` for a component that only ever exists in the tree while
// open (ColumnsPicker, below) -- the hook's own cleanup on unmount handles that case the
// same as a real open->false transition.
function useModalA11y(open, onClose, ref) {
  const prevFocusRef = useRef(null)
  useEffect(() => {
    if (!open) return
    prevFocusRef.current = document.activeElement
    const focusables = () => (ref.current
      ? [...ref.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled && el.offsetParent !== null)
      : [])
    const first = focusables()[0]
    ;(first || ref.current)?.focus?.()
    const onKeyDown = e => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
      else if (e.key === 'Tab') {
        const els = focusables()
        if (!els.length) { e.preventDefault(); return }
        const firstEl = els[0], lastEl = els[els.length - 1]
        if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus() }
        else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus() }
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      if (prevFocusRef.current && document.contains(prevFocusRef.current)) prevFocusRef.current.focus()
    }
  }, [open, onClose, ref])
}

// Show/hide + reorder popover for the summary table's columns.
function ColumnsPicker({ order, visible, onToggle, onMove, onClose, onReset }) {
  const panelRef = useRef(null)
  useModalA11y(true, onClose, panelRef)
  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:399 }} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Columns — show, hide, reorder" tabIndex={-1} style={{ position:'absolute', right:0, top:'calc(100% + 6px)', zIndex:400, background:'var(--card)', border:`0.5px solid ${C.border}`, borderRadius:12, boxShadow:'0 16px 40px rgba(15,23,42,0.14), 0 2px 8px rgba(15,23,42,0.06)', padding:8, minWidth:230, maxHeight:340, overflowY:'auto' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'4px 8px 8px' }}>
          <span style={{ fontSize:11.5, fontWeight:700, color:C.muted, letterSpacing:'0.06em', textTransform:'uppercase' }}>Columns — show, hide, reorder</span>
          <Button onClick={onReset} variant="ghost" size="sm" style={{ padding:'2px 8px' }}>Reset</Button>
        </div>
        {order.map((key, i) => {
          const col = SUMMARY_COLUMNS.find(c => c.key === key)
          if (!col) return null
          const isVisible = visible.includes(key)
          return (
            <div key={key} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 8px', borderRadius:8 }}>
              <label style={{ display:'flex', alignItems:'center', gap:8, flex:1, cursor:'pointer', minWidth:0 }}>
                <input type="checkbox" checked={isVisible} onChange={() => onToggle(key)} style={{ width:14, height:14, cursor:'pointer', accentColor:C.navy, flexShrink:0 }} />
                <span style={{ fontSize:14, fontWeight: isVisible ? 600 : 400, color: isVisible ? C.text : C.muted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{col.label}</span>
              </label>
              <div style={{ display:'flex', gap:2, flexShrink:0 }}>
                <button onClick={() => onMove(key, -1)} disabled={i === 0} title="Move up" style={{ width:22, height:22, borderRadius:6, border:'none', background:'transparent', color: i === 0 ? '#CBD5E1' : C.muted, cursor: i === 0 ? 'default' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
                </button>
                <button onClick={() => onMove(key, 1)} disabled={i === order.length - 1} title="Move down" style={{ width:22, height:22, borderRadius:6, border:'none', background:'transparent', color: i === order.length - 1 ? '#CBD5E1' : C.muted, cursor: i === order.length - 1 ? 'default' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

// Compact "does the funnel actually convert" strip — stage-to-stage conversion, not just
// raw counts, since that's what tells a marketer where the real leak is.
function ConversionChain({ steps }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:`repeat(${steps.length}, minmax(0,1fr))`, gap:10, marginTop:16 }}>
      {steps.map((s, i) => (
        <div key={i} style={{ padding:'10px 12px', borderRadius:10, background: heatBg(s.rate), border:'0.5px solid #EEF1F6', minWidth:0 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.05em', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{s.from} → {s.to}</div>
          <div style={{ fontSize:18, fontWeight:800, color: heatColor(s.rate), marginTop:3 }}>{s.rate == null ? '—' : s.rate.toFixed(1) + '%'}</div>
        </div>
      ))}
    </div>
  )
}

// Ranked efficiency leaderboard (percentage-based, not volume-based) — reuses the same
// visual language as RankedBars (numbered chip + bar + value) but the bar length and
// color both encode a conversion RATE (0-100%) rather than a raw count.
function EfficiencyList({ data, labelKey, rateKey, subKey }) {
  if (!data.length) return <div style={{ textAlign:'center', padding:'24px 0', color:C.muted, fontSize:14.5, fontFamily:FONT }}>Not enough volume yet</div>
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
      {data.map((r, i) => {
        const rate = r[rateKey]
        const col = heatColor(rate)
        return (
          <div key={r[labelKey] + i} style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:20, textAlign:'center', fontSize:11.5, fontWeight:800, color:'#fff', background:col, borderRadius:6, padding:'2px 0', flexShrink:0 }}>{i + 1}</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4, alignItems:'baseline', gap:8 }}>
                <span style={{ fontSize:13.5, fontWeight:600, color:C.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r[labelKey]}</span>
                <span style={{ fontSize:14, fontWeight:800, color:col, flexShrink:0, fontVariantNumeric:'tabular-nums' }}>{rate.toFixed(1)}%</span>
              </div>
              <div style={{ height:7, borderRadius:99, background:'#F1F5F9', overflow:'hidden' }}>
                <div style={{ height:'100%', width:Math.min(rate, 100) + '%', borderRadius:99, background:`linear-gradient(90deg,${col},${col}cc)` }} />
              </div>
            </div>
            <div style={{ fontSize:12, color:C.muted, width:60, textAlign:'right', flexShrink:0, fontVariantNumeric:'tabular-nums' }}>{fmtN(r[subKey])} q'd</div>
          </div>
        )
      })}
    </div>
  )
}

// Affiliate has no automated spend feed (no ad platform, no sheet) -- an admin
// enters it by month in Settings > Data, stored as { 'YYYY-MM': amount } via
// /api/preferences. Turned into one synthetic all-zero-except-spend row per
// month (anchored on the 15th so it falls inside whole-month filters) and
// merged into `rows` below -- every existing aggregation (KPIs, by-source,
// by-corridor, Compare, etc.) picks it up automatically with no special-casing.
// Manual affiliate spend is entered per month (Settings > Data > Affiliate spend), but it
// has to behave like real daily spend so every date range gets its correct slice. This
// previously emitted ONE row per month dated the 15th, which meant a range only saw
// affiliate spend if it happened to contain that single date -- "Last 7 days" and a
// 1-14 Jul window both reported zero, while MTD reported the entire month undivided.
//
// So each month is spread into one synthetic row PER DAY. The denominator differs by
// month, because the entered figure means different things:
//   - a PAST month is a completed total    -> divide by that month's calendar days
//   - the CURRENT month is spend-so-far    -> divide by days elapsed including today,
//                                             and emit nothing for days not yet reached
//   - a FUTURE month (rare, a pre-entered budget) has no elapsed days, so it falls back
//     to the full calendar month
// A range spanning two months therefore prorates each month at its own daily rate and
// sums them, which happens for free once the rows exist.
//
// perDay keeps full float precision and is only rounded at display, so the days always
// reconcile exactly back to the entered month total.
function buildSyntheticAffiliateRows(map) {
  if (!map) return []
  const now = new Date()
  const curY = now.getFullYear(), curM = now.getMonth() + 1, curD = now.getDate()
  const out = []
  Object.entries(map).forEach(([ym, rawSpend]) => {
    const [y, m] = ym.split('-').map(Number)
    const total = Number(rawSpend) || 0
    if (!y || !m || !total) return
    const daysInMonth = new Date(y, m, 0).getDate()
    const isCurrent = y === curY && m === curM
    const days = isCurrent ? Math.min(curD, daysInMonth) : daysInMonth
    if (days <= 0) return
    const perDay = total / days
    for (let d = 1; d <= days; d++) {
      const date = new Date(y, m - 1, d)
      out.push({
        date, mk: monthKey(date), source: 'Affiliate', campaign: 'Affiliate (manual entry)',
        leads: 0, floorQueued: 0, futworkHumanQ: 0, futworkAiQ: 0, superbotQ: 0, humanQL: 0, futworkAiQl: 0, superbotAiQl: 0,
        totalQL: 0, apps: 0, offers: 0, deposits: 0, raus: 0, spend: perDay,
      })
    }
  })
  return out
}

// dataSource: 'sheet' (the original CSV path, default -- /dashboard/overall) or
// 'bigquery' (/dashboard/overall-bigquery, Shivam-only -- see App.jsx/Sidebar.jsx).
// Fixed per route, not a runtime toggle -- see the CLAUDE.md entry for why the old
// per-device Settings toggle was retired in favour of two dedicated pages.
export default function OverallDashboard({ dataSource = 'sheet' }) {
  const [rawRows, setRawRows] = useState([])
  const [affiliateManual, setAffiliateManual] = useState(null)
  // ── Data source: BigQuery ─────────────────────────────────────────────
  // dataSource='bigquery' (bqMode true): this page reads public.overall_bq_daily
  // straight from Supabase with the anon key, already narrowed SERVER-SIDE to the
  // date range and the Sources selected below, instead of downloading the whole
  // "Overall PM" CSV and parsing every one of its 2,05,720 rows in the browser.
  // dataSource='sheet' (bqMode false, the default /dashboard/overall route): every
  // bqMode-gated effect below no-ops immediately, so nothing about the CSV path
  // changes -- rawRows is still the only thing feeding the page.
  //
  // The BigQuery rows are deliberately run through the SAME mapRow() as the CSV,
  // because the cache keeps BigQuery's own column names byte-for-byte. One mapping,
  // so the two paths cannot drift apart on what a column means.
  const bqMode = dataSource === 'bigquery'
  const [bqRows, setBqRows] = useState([])
  const [bqRowCount, setBqRowCount] = useState(null)   // null = no read has landed yet
  const [bqBounds, setBqBounds] = useState(null)
  const [bqSourceOpts, setBqSourceOpts] = useState(null)
  const [bqBusy, setBqBusy] = useState(false)
  const [bqError, setBqError] = useState(null)
  const [bqNonce, setBqNonce] = useState(0)            // bumped by Refresh
  // B6 fix: opening Trend widens bqRange (via trendBqSpan) and fetches the wide window;
  // closing it shrinks bqRange straight back to whatever narrower window was active a
  // moment ago -- which had ALREADY been fetched, seconds earlier, before Trend was ever
  // opened. Without this cache that immediately re-fetches it from scratch, on a page
  // where a single wide fetch already runs 70-100s -- minutes of sequential cursor-paged
  // requests for one modal open/close, and the exact same round-trip repeats every time
  // Trend is reopened+closed again. Keyed on the same (since, until, sources) triple the
  // fetch effect below already computes; capped so a long-lived tab can't grow this
  // unbounded. Cleared on Refresh (bqNonce change) -- a manual refresh means "don't trust
  // what's cached," so every window it touches should hit the network again.
  const bqRowsCacheRef = useRef(new Map())
  const BQ_ROWS_CACHE_MAX = 12
  useEffect(() => { bqRowsCacheRef.current.clear() }, [bqNonce])
  // Two-phase fetch for the "Month-on-month trend" card only (B2 fix). This is
  // DELIBERATELY a separate read from bqRows/bqRange: folding its trailing-5-month span
  // into the main bqRange union (the way trendBqSpan does for the Trend modal, which only
  // opens on demand) would make every single load of this page pay a ~5-month cursor
  // fetch even when nobody looks at this one card -- a real, permanent regression to
  // normal page-load time. Instead the main page paints on its own (narrow) selection
  // immediately, and this card's own wider window fetches in the background and fills in
  // once it lands, mirroring how the Trend modal itself behaves on open.
  const [monthTrendBqRows, setMonthTrendBqRows] = useState([])
  const [monthTrendBqBusy, setMonthTrendBqBusy] = useState(false)
  // A failed cache read must never leave this page dead, so it falls back to the sheet
  // rather than replacing it: every derivation below reverts to rawRows while bqError
  // is set. bqLive is the single test for "BQ data is what we are showing".
  const bqActive = bqMode && !bqError
  const bqLive = bqActive && bqRowCount != null
  useEffect(() => {
    fetch('/api/preferences', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { prefs: {} })
      .then(data => setAffiliateManual(data.prefs?.affiliate_spend_manual || {}))
      .catch(() => setAffiliateManual({}))
  }, [])
  // The current day is never a complete day, so it is dropped here, once,
  // before anything reads the data. Every card, chart, table and report on
  // this page therefore runs to D-1 and no further.
  const rows = useMemo(() => {
    const cut = new Date(); cut.setHours(0, 0, 0, 0)
    const t = cut.getTime()
    // Affiliate manual spend lives in app_preferences, not in either data source, so it
    // is merged in identically on both paths -- otherwise the two would disagree on
    // Spend by exactly the affiliate figure.
    //
    // Until the first BigQuery read lands (bqRowCount still null), BQ mode keeps
    // rendering whatever the CSV path already had, so flipping the toggle on never
    // flashes a screenful of zeros.
    return [...(bqLive ? bqRows : rawRows), ...buildSyntheticAffiliateRows(affiliateManual)]
      .filter(r => !(r && r.date && +r.date >= t))
  }, [bqLive, bqRows, rawRows, affiliateManual])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastSync, setLastSync] = useState(null)
  const [bqSyncUnknown, setBqSyncUnknown] = useState(false)
  // Multi-select Source filter -- ['All'] is the sentinel meaning "no filter, every
  // source". Any other array means "only these specific sources". Never store both
  // 'All' and specific names together -- toggleSource() below enforces that, so this
  // invariant never needs re-checking at each of the filter call sites.
  const [selectedSources, setSelectedSources] = useState(['All'])
  const sourceIsAll = selectedSources.length === 0 || selectedSources.includes('All')
  const selectedSourceSet = useMemo(() => new Set(selectedSources), [selectedSources])
  // The ONE predicate every row-filtering site below must use -- so "never show wrong
  // numbers" holds by construction: there is no second place a source check could drift
  // out of sync with this one.
  const matchesSource = useCallback(r => sourceIsAll || selectedSourceSet.has(r.source), [sourceIsAll, selectedSourceSet])
  const sourceLabel = sourceIsAll ? 'All' : selectedSources.length === 1 ? selectedSources[0] : selectedSources.length + ' selected'
  const [corridorFilter, setCorridorFilter] = useState('All')
  const [campaignQuery, setCampaignQuery] = useState('')
  // The search BOX stays bound to campaignQuery directly (instant keystrokes, instant
  // suggestion list). Every row-filtering memo below (filtered/prevFiltered/nonDateRows
  // -- each iterating the full, possibly 100k+-row dataset) reads the DEBOUNCED value
  // instead, so a full re-filter only runs once typing actually pauses, not per
  // keystroke -- this is what was making campaign search feel slow while typing.
  const campaignQueryDebounced = useDebouncedValue(campaignQuery, 250)
  const [showInfo, setShowInfo] = useState(false)
  const [grpBy, setGrpBy] = useState('source')

  // Compare — decision-focused period comparison. 'prev' reuses the exact same
  // previous-equivalent-period logic already computed for the KPI delta arrows
  // (prevWindow/prevFiltered/prevKpis below); 'yoy' shifts the same window back
  // exactly one year; 'custom' lets the marketer pick an arbitrary second range.
  const [compareOpen, setCompareOpen] = useState(false)
  const [compareMode, setCompareMode] = useState('prev') // 'prev' | 'yoy' | 'custom'
  const [compareCustomFrom, setCompareCustomFrom] = useState('')
  const [compareCustomTo, setCompareCustomTo] = useState('')
  // In custom mode BOTH sides must be user-editable -- otherwise "period A" silently
  // stays locked to whatever the main page filter happens to be (e.g. the whole
  // month), while only "period B" is the custom pick, comparing a full month
  // against a single day and producing a nonsense delta. Prefilled from the page's
  // active window/previous-window so the modal opens with a sane apples-to-apples
  // comparison instead of blank fields.
  const [compareCustomFromA, setCompareCustomFromA] = useState('')
  const [compareCustomToA, setCompareCustomToA] = useState('')
  const [compareGroupBy, setCompareGroupBy] = useState('corridor') // 'corridor' | 'source' | 'campaign' -- top-5 "what's driving it" movers only
  // The full, uncapped breakdown table below the movers strip supports 2 more
  // dimensions (Month/Day) that a joined "mover" delta can't meaningfully apply to
  // (see DEEP_JOINABLE_DIMS) -- kept as its own state so picking Month/Day here can
  // never feed the wrong keying into compareMovers' groupByDimRaw above.
  const [compareTableDim, setCompareTableDim] = useState('corridor')
  const [showComparePickerA, setShowComparePickerA] = useState(false)
  const [showComparePickerB, setShowComparePickerB] = useState(false)

  // Trend Analysis — a genuinely new capability alongside Compare: instead of two
  // points (A vs B), show the trajectory across N trailing periods. Same 5
  // dimensions as Compare (corridor/source/campaign/month/day). For month/day the
  // dimension IS the period axis (one line, no further breakdown); for
  // source/campaign/corridor the period axis is a separate day/week/month
  // granularity, broken down into one line per dimension value (top 8 by volume
  // charted, every value still in the export).
  const [trendOpen, setTrendOpen] = useState(false)
  const [trendDim, setTrendDim] = useState('corridor')
  const [trendGranularity, setTrendGranularity] = useState('month') // 'day' | 'week' | 'month'
  const [trendPeriods, setTrendPeriods] = useState(6)
  const [trendMetric, setTrendMetric] = useState('totalQL')
  // month/day dimensions are naturally their own period axis, so there is no separate
  // granularity to pick and no further breakdown -- one line, matching the page's own
  // byMonth/byDay charts. Declared here (not down near the rest of Trend's computation)
  // because bqRange's own trendBqSpan, much earlier in the file, needs it too.
  const trendIsSingleSeries = trendDim === 'month' || trendDim === 'day'
  const trendEffectiveGranularity = trendDim === 'month' ? 'month' : trendDim === 'day' ? 'day' : trendGranularity
  // While the wider trailing-window fetch is still in flight (the banner just above
  // the chart already says so), a period reading exactly 0 is indistinguishable from
  // "not fetched yet" -- the underlying read is all-or-nothing, not per-bucket, so
  // there's no finer signal available. Treating every zero as provisional during this
  // window is a deliberate over-approximation: a handful of genuinely-zero periods
  // will show a loading skeleton too, but that beats a confident "0" that's actually
  // just missing data, which was the whole complaint this exists to fix.
  const trendMaybeLoading = bqMode && bqBusy

  // Deep-analysis-only narrowing -- separate from the page's own toolbar filters
  // (Source/Corridor/Campaign up top) so zooming into "just Facebook" or "just this
  // corridor" inside Compare/Trend never changes the KPIs/funnel/table behind the
  // modal. Shared by both features since both read the same underlying rows.
  const [deepCorridorFilter, setDeepCorridorFilter] = useState(['All'])
  const [deepSourceFilter, setDeepSourceFilter] = useState(['All'])
  const [deepCampaignQuery, setDeepCampaignQuery] = useState('')

  // Summary table customization — search, sortable columns, show/hide + reorder columns
  // (persisted), row limit. Mirrors the Meta Ads Creatives table's "customizable" pattern.
  const [tableSearch, setTableSearch] = useState('')
  const [sortKey, setSortKey] = useState('leads')
  const [sortDir, setSortDir] = useState('desc')
  const [rowLimit, setRowLimit] = useState(25)
  const [showColsPicker, setShowColsPicker] = useState(false)
  const [showRatesPicker, setShowRatesPicker] = useState(false)
  // C9 fix -- see useModalA11y's own comment above ColumnsPicker for what this does and
  // why. compareOpen/trendOpen are declared above; the refs get attached to each dialog's
  // actual panel div (never the backdrop) further down in the render.
  const compareModalRef = useRef(null)
  const trendModalRef = useRef(null)
  const ratesPickerRef = useRef(null)
  useModalA11y(compareOpen, useCallback(() => setCompareOpen(false), []), compareModalRef)
  useModalA11y(trendOpen, useCallback(() => setTrendOpen(false), []), trendModalRef)
  useModalA11y(showRatesPicker, useCallback(() => setShowRatesPicker(false), []), ratesPickerRef)
  // Off by default -- Source/Spend only stay fixed while scrolling when the user
  // explicitly asks for it, since forcing them fixed at every table width risks the
  // sticky cell's own fixed pixel width being narrower than a genuinely long value
  // (a real spend figure truncated this way once already). Opt-in avoids that trade-off
  // entirely for anyone who doesn't need it, and the table is just as usable un-pinned
  // -- it simply scrolls like a normal wide table.
  // C13 fix: this used to reset to false on every reload while its three sibling table
  // preferences (visible cols, col order, contribution metric) all survived -- same
  // localStorage read/write pattern as CONTRIB_METRIC_STORAGE_KEY just below.
  const [pinCols, setPinCols] = useState(() => {
    try { return localStorage.getItem(PIN_COLS_STORAGE_KEY) === '1' } catch { return false }
  })
  useEffect(() => { try { localStorage.setItem(PIN_COLS_STORAGE_KEY, pinCols ? '1' : '0') } catch {} }, [pinCols])
  const [showContribPicker, setShowContribPicker] = useState(false)
  // Screen coordinates for the fixed-position Contribution % popover, computed at
  // open time from the pill's own getBoundingClientRect() -- see the click handler.
  const [contribPickerPos, setContribPickerPos] = useState(null)
  const contribPickerRef = useRef(null)
  useModalA11y(showContribPicker, useCallback(() => setShowContribPicker(false), []), contribPickerRef)
  const [contribMetric, setContribMetric] = useState(() => {
    try { return localStorage.getItem(CONTRIB_METRIC_STORAGE_KEY) || 'leads' } catch { return 'leads' }
  })
  useEffect(() => { try { localStorage.setItem(CONTRIB_METRIC_STORAGE_KEY, contribMetric) } catch {} }, [contribMetric])
  // Source view's expand/collapse tree state -- which Source rows are expanded (revealing
  // their Sub Sources) and which Source||SubSource pairs are expanded (revealing campaigns).
  // Not persisted -- a fresh page load starts fully collapsed, same as any other transient
  // UI state on this page (search, sort, row limit all reset too).
  const [expandedSources, setExpandedSources] = useState(() => new Set())
  const [expandedSubSources, setExpandedSubSources] = useState(() => new Set())
  const toggleSourceExpand = (source) => setExpandedSources(s => {
    const next = new Set(s)
    if (next.has(source)) next.delete(source); else next.add(source)
    return next
  })
  const toggleSubSourceExpand = (source, subSource) => setExpandedSubSources(s => {
    const key = source + '||' + subSource
    const next = new Set(s)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })
  const [srFee] = useState(() => {
    try { const s = localStorage.getItem(SR_FEE_KEY); const n = s ? Number(s) : SR_FEE_DEFAULT; return isNaN(n) || n <= 0 ? SR_FEE_DEFAULT : n }
    catch { return SR_FEE_DEFAULT }
  })
  const summarySchemaStale = (() => {
    try { return localStorage.getItem(SUMMARY_SCHEMA_VERSION_KEY) !== String(SUMMARY_SCHEMA_VERSION) }
    catch { return false }
  })()
  const [visibleCols, setVisibleCols] = useState(() => {
    // Newly-added columns (not in a previously-saved list) default to visible, same as
    // colOrder below -- otherwise a brand new column silently never appears for a device
    // that already has a saved visibleCols list from before that column existed.
    if (summarySchemaStale) return SUMMARY_COLUMN_KEYS
    try {
      const s = localStorage.getItem(SUMMARY_COLS_STORAGE_KEY)
      const parsed = s ? JSON.parse(s) : null
      if (!Array.isArray(parsed)) return SUMMARY_COLUMN_KEYS
      const base = parsed.filter(k => SUMMARY_COLUMN_KEYS.includes(k))
      const missing = SUMMARY_COLUMN_KEYS.filter(k => !base.includes(k))
      return [...base, ...missing]
    } catch { return SUMMARY_COLUMN_KEYS }
  })
  const [colOrder, setColOrder] = useState(() => {
    // A real re-sequencing of SUMMARY_COLUMNS (not just a new column) bumps
    // SUMMARY_SCHEMA_VERSION, so a stale saved order is discarded here instead of silently
    // keeping the old sequence forever with new columns just appended at the end.
    if (summarySchemaStale) return SUMMARY_COLUMN_KEYS
    try {
      const s = localStorage.getItem(SUMMARY_ORDER_STORAGE_KEY)
      const parsed = s ? JSON.parse(s) : null
      const base = Array.isArray(parsed) ? parsed.filter(k => SUMMARY_COLUMN_KEYS.includes(k)) : []
      const missing = SUMMARY_COLUMN_KEYS.filter(k => !base.includes(k))
      return [...base, ...missing]
    } catch { return SUMMARY_COLUMN_KEYS }
  })
  useEffect(() => { try { localStorage.setItem(SUMMARY_COLS_STORAGE_KEY, JSON.stringify(visibleCols)) } catch {} }, [visibleCols])
  useEffect(() => { try { localStorage.setItem(SUMMARY_ORDER_STORAGE_KEY, JSON.stringify(colOrder)) } catch {} }, [colOrder])
  useEffect(() => { try { localStorage.setItem(SUMMARY_SCHEMA_VERSION_KEY, String(SUMMARY_SCHEMA_VERSION)) } catch {} }, [])
  const toggleCol = key => setVisibleCols(v => v.includes(key) ? v.filter(k => k !== key) : [...v, key])
  const moveCol = (key, dir) => setColOrder(order => {
    const idx = order.indexOf(key); const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= order.length) return order
    const next = [...order];[next[idx], next[swapIdx]] = [next[swapIdx], next[idx]]
    return next
  })
  // Drag-and-drop reordering directly on the table's column headers (in addition
  // to the up/down arrows in the Columns popover) -- drag one header onto another
  // to move it there. dragOverKey drives a live insertion-point indicator so the
  // drop target is visible while dragging, not just after release.
  const [dragKey, setDragKey] = useState(null)
  const [dragOverKey, setDragOverKey] = useState(null)
  const reorderColumns = (fromKey, toKey) => {
    if (!fromKey || fromKey === toKey) return
    setColOrder(order => {
      if (!order.includes(fromKey) || !order.includes(toKey)) return order
      const next = order.filter(k => k !== fromKey)
      next.splice(next.indexOf(toKey), 0, fromKey)
      return next
    })
  }
  const handleSort = key => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }
  const resetCols = () => { setVisibleCols(SUMMARY_COLUMN_KEYS); setColOrder(SUMMARY_COLUMN_KEYS) }

  // Date filter state — mirrors Daily QLs exactly: a single "active filter" is either
  // a preset (LD/L7D/MTD), the month picker, or a custom calendar range.
  const [datePreset, setDatePreset] = useState('month') // 'LD' | 'L7D' | 'MTD' | 'custom' | 'month'
  const [selMonth, setSelMonth] = useState('') // month label e.g. "Jul'26"
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  // The popup is ~505px wide and was always anchored right:0 -- fine when the
  // "Custom" button sits far enough right, but on an ordinary wide desktop
  // window the button can land close enough to the left that a right-anchored,
  // leftward-growing popup lands its left edge underneath the 232px sidebar
  // (reproduced live: button at x=711, popup left edge at x=206). Measured at
  // open time, same pattern as ExportButton.jsx's openUp.
  const [customOpenLeft, setCustomOpenLeft] = useState(false)
  const customBtnRef = useRef(null)
  const CUSTOM_POPUP_WIDTH = 520
  const SIDEBAR_SAFE_EDGE = 248
  const [hoveredPreset, setHoveredPreset] = useState(null)
  const hasSetInitial = useRef(false)
  const CACHE_KEY = 'overall'

  const applyCsv = useCallback((txt) => {
    const mapped = parseCSV(txt).map(mapRow)
    setRawRows(mapped)
    if (!hasSetInitial.current) {
      const ms = [...new Set(mapped.filter(r => r.mk != null).map(r => r.mk))].sort((a, b) => a - b)
      if (ms.length) {
        const curKey = monthKey(new Date())
        const defMk = ms.includes(curKey) ? curKey : ms[ms.length - 1]
        setSelMonth(monthLabel(defMk))
        // Only latch once we've actually found real dated rows -- if a load ever comes
        // back with zero (e.g. a transient fetch/parse issue), leave this unset so the
        // next successful load can still self-heal instead of permanently sticking with
        // an empty selMonth for the rest of the session.
        hasSetInitial.current = true
      }
    }
  }, [])

  // Fetch-once-per-session (mirrors QL Ops/WhatsApp/Referral): if this tab already
  // loaded Overall this session, reuse it instantly instead of re-fetching+re-parsing
  // the full sheet on every SPA navigation back to this page. On a genuinely cold
  // load (fresh tab, nothing loaded yet this session) paint instantly from the last
  // known-good snapshot persisted in localStorage -- if one exists -- while a real
  // fetch runs in the background, so the page never sits on a blank spinner for as
  // long as the CSV takes to download when we already have something to show.
  const loadData = useCallback(async (bust = false) => {
    if (!bust && hasLoaded(CACHE_KEY)) {
      applyCsv(getSession(CACHE_KEY).data)
      setLastSync(new Date(getSession(CACHE_KEY).ts))
      setLoading(false)
      return
    }
    let paintedFromCache = false
    if (!bust) {
      const persisted = getPersisted(CACHE_KEY)
      if (persisted) {
        applyCsv(persisted.data)
        setLastSync(new Date(persisted.ts))
        setLoading(false)
        paintedFromCache = true
      }
    }
    if (!paintedFromCache) setLoading(true)
    try {
      const base = await resolveOverallUrlFast()
      const u = bust ? base + (base.includes('?') ? '&' : '?') + '_=' + Date.now() : base
      const res = await fetch(u)
      const txt = await res.text()
      // A2 fix: an auth/sign-in redirect or a sheet that's stopped being publicly
      // shared responds 200 with an HTML page, not the CSV -- fetch() doesn't throw on
      // that, and parseCSV() on HTML yields rows whose dates never parse, so every row
      // silently drops and the page renders all-zero with no indication anything went
      // wrong (this exact failure has bitten the client-side "Got an HTML page instead
      // of CSV" case documented in CLAUDE.md; overall-funnel-sync.yml already guards
      // for it server-side, this path didn't). Throwing here routes both cases through
      // the existing catch block below, which already has a real error-banner path.
      if (!res.ok) throw new Error('Sheet fetch failed (HTTP ' + res.status + ')')
      if (txt.trim().startsWith('<')) throw new Error('Got a webpage instead of the sheet CSV -- it may no longer be shared publicly, or the link needs re-authenticating')
      applyCsv(txt)
      setSession(CACHE_KEY, txt)
      setLastSync(new Date())
      setError(null)
    } catch (e) {
      if (!paintedFromCache) setError('Failed to load: ' + e.message)
    }
    finally { setLoading(false) }
  }, [applyCsv])
  // The CSV download is skipped entirely while the toggle is on -- that is the point of
  // it. Toggling back off calls loadData(), which finds this session's already-parsed
  // CSV in the session cache and repaints from it instantly.
  useEffect(() => { if (!bqMode) loadData() }, [loadData, bqMode])

  const months = useMemo(() => {
    // In BQ mode `rows` only ever holds the window on screen, so the Month dropdown
    // cannot be derived from it -- it comes from the cache's real min/max dates instead.
    // Before those bounds land it falls through to the rows-derived list, so the
    // dropdown never blanks out mid-flip.
    const lo = bqActive ? monthKeyFromIso(bqBounds?.min) : null
    const hi = bqActive ? monthKeyFromIso(bqBounds?.max) : null
    if (lo != null && hi != null) {
      const out = []
      for (let k = lo; k <= hi; k++) out.push(k)
      return out
    }
    const set = new Set(rows.filter(r => r.mk != null).map(r => r.mk))
    return [...set].sort((a, b) => a - b)
  }, [rows, bqActive, bqBounds])
  const monthOptions = useMemo(() => ['All months', ...[...months].reverse().map(monthLabel)], [months])
  const monthKeyByLabel = useMemo(() => new Map(months.map(mk => [monthLabel(mk), mk])), [months])

  const sources = useMemo(() => {
    // In BQ mode the Source filter is applied server-side, so once a source is picked
    // `rows` no longer contains the ones filtered OUT -- deriving the dropdown from it
    // would collapse it to the current selection and strand the user there with no way
    // back. bqSourceOpts holds the list as last seen with NO Source filter applied.
    if (bqActive && bqSourceOpts) return bqSourceOpts
    const set = new Set(rows.map(r => r.source))
    return ['All', ...[...set].sort()]
  }, [rows, bqActive, bqSourceOpts])

  // Master campaign list — scoped to the FULL dataset (not the active period/source
  // filters) so a campaign that only shows up in an earlier month is still searchable
  // right now, ranked by total leads (most-relevant / most-searched proxy) on top.
  const campaignOptions = useMemo(() => {
    const m = new Map()
    rows.forEach(r => { if (!r.campaign) return; m.set(r.campaign, (m.get(r.campaign) || 0) + r.leads) })
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, leads]) => ({ name, leads }))
  }, [rows])
  const campaignSuggestions = useMemo(() => {
    const q = campaignQuery.trim().toLowerCase()
    const list = q ? campaignOptions.filter(c => c.name.toLowerCase().includes(q)) : campaignOptions
    return list.slice(0, 8)
  }, [campaignOptions, campaignQuery])

  // Is the selected month the current calendar month?
  const isCurrentMonth = useMemo(() => {
    const mk = monthKeyByLabel.get(selMonth)
    if (mk == null) return false
    return mk === monthKey(new Date())
  }, [selMonth, monthKeyByLabel])

  const activeFilter = datePreset === 'custom' ? 'custom' : (datePreset === 'month') ? 'month' : 'preset'

  const dateWindow = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    if (datePreset === 'LD') { const y = new Date(today); y.setDate(today.getDate() - 1); return { from:y, to:y, label:'Last Day' } }
    if (datePreset === 'L7D') { const y = new Date(today); y.setDate(today.getDate() - 1); const f = new Date(y); f.setDate(y.getDate() - 6); return { from:f, to:y, label:'Last 7 days' } }
    if (datePreset === 'MTD') { const f = new Date(today.getFullYear(), today.getMonth(), 1); return { from:f, to:today, label:'MTD ' + today.toLocaleString('default', { month:'short', year:'numeric' }) } }
    if (datePreset === 'custom' && customFrom && customTo) {
      const [fy, fm, fd] = customFrom.split('-').map(Number); const cf = new Date(fy, fm - 1, fd); cf.setHours(0, 0, 0, 0)
      const [ty, tm, td] = customTo.split('-').map(Number); const ct = new Date(ty, tm - 1, td); ct.setHours(23, 59, 59, 999)
      return { from:cf, to:ct, label:customFrom + ' -> ' + customTo }
    }
    return null
  }, [datePreset, customFrom, customTo])

  const dateFilteredRows = useMemo(() => {
    if (!dateWindow) {
      const mk = monthKeyByLabel.get(selMonth)
      return mk == null ? rows : rows.filter(r => r.mk === mk)
    }
    return rows.filter(r => r.date && r.date >= dateWindow.from && r.date <= dateWindow.to)
  }, [rows, dateWindow, selMonth, monthKeyByLabel])

  const filtered = useMemo(() => {
    let rs = sourceIsAll ? dateFilteredRows : dateFilteredRows.filter(matchesSource)
    if (corridorFilter !== 'All') rs = rs.filter(r => corridorLabel(classifyCorridor(r.campaign)) === corridorFilter)
    const q = campaignQueryDebounced.trim().toLowerCase()
    if (q) rs = rs.filter(r => r.campaign.toLowerCase().includes(q))
    return rs
  }, [dateFilteredRows, selectedSources, corridorFilter, campaignQueryDebounced])

  const sumKpis = list => {
    const sum = k => list.reduce((t, r) => t + r[k], 0)
    return {
      leads: sum('leads'), floorQueued: sum('floorQueued'),
      futworkHumanQ: sum('futworkHumanQ'), futworkAiQ: sum('futworkAiQ'), superbotQ: sum('superbotQ'),
      humanQL: sum('humanQL'), futworkAiQl: sum('futworkAiQl'), superbotAiQl: sum('superbotAiQl'),
      totalQL: sum('totalQL'), apps: sum('apps'), offers: sum('offers'),
      deposits: sum('deposits'), raus: sum('raus'), spend: sum('spend'),
    }
  }
  const kpis = useMemo(() => sumKpis(filtered), [filtered])
  // Total Queued -- all 3 third-party channels combined (Futwork Human + Futwork AI +
  // Superbot), excluding Floor (handled directly, a parallel branch, see the info
  // tooltip). Distinct from totalFutworkQ below, which is Futwork's own subtotal only.
  const totalQueued = kpis.futworkHumanQ + kpis.futworkAiQ + kpis.superbotQ
  // Total Queued on Futwork -- Futwork Human + Futwork AI only (excludes Superbot),
  // its own KPI card per explicit request, and the denominator for the futworkQlPct
  // summary-table column.
  const totalFutworkQ = kpis.futworkHumanQ + kpis.futworkAiQ
  // ── Blended cost metrics are PAID-ONLY ────────────────────────────────────────
  // The denominators count only leads/QLs/apps from daily rows that actually carried
  // spend. Free channels (Referral, Content+Brand, Offline, organic...) otherwise
  // inflate the denominator and make paid acquisition look materially cheaper than it
  // is -- on real data this reported CPL ~₹151 when the true paid CPL was ~₹205, and
  // CPA ~₹40,119 against a true ~₹83,323.
  //
  // "Paid" is judged per SOURCE, not per row. Spend and leads routinely land on
  // DIFFERENT rows: manual affiliate spend arrives on synthetic rows carrying no leads
  // at all, while Affiliate's real leads sit on sheet rows with zero spend -- and
  // Remarketing behaves the same way. A row-level test therefore found zero paid leads
  // for both and showed "—" on channels that plainly did spend money.
  //
  // Because the test is evaluated per row but keyed on the row's source, summing it
  // across any grouping (Source / Campaign / Corridor / Month / Day) yields the same
  // total, so the blended figure stays identical whichever tab the table is on.
  // The numerator stays ALL spend -- identical either way, since unpaid sources
  // contribute zero spend by definition.
  const paidSources = useMemo(() => {
    const s = new Set()
    filtered.forEach(r => { if (r.spend > 0) s.add(r.source) })
    return s
  }, [filtered])
  const paidKpis = useMemo(() => sumKpis(filtered.filter(r => paidSources.has(r.source))), [filtered, paidSources])
  const cpl = paidKpis.leads > 0 ? kpis.spend / paidKpis.leads : 0
  const cpql = paidKpis.totalQL > 0 ? kpis.spend / paidKpis.totalQL : 0
  const cpa = paidKpis.apps > 0 ? kpis.spend / paidKpis.apps : 0

  // SR revenue + ROAS — Estimated RAUs projects Deposits forward at a 70% conversion
  // rate (real RAUs haven't materialized yet); Actual RAUs is the real, already-realized
  // count, so it gets no discount. Both then multiply by the same shared SR Fee.
  const estimatedRaus = kpis.deposits * RAU_CONVERSION_FACTOR
  const estSrRevenue = estimatedRaus * srFee
  const actSrRevenue = kpis.raus * srFee
  const actualRoas = kpis.spend > 0 ? actSrRevenue / kpis.spend : 0
  const estimatedRoas = kpis.spend > 0 ? estSrRevenue / kpis.spend : 0

  // Previous-equivalent-period comparison — same length window immediately before the
  // active one (or the previous calendar month, when in month mode) — so every KPI can
  // show a real vs-last-period delta instead of a static sub-label.
  const prevWindow = useMemo(() => {
    if (activeFilter === 'month') {
      const mk = monthKeyByLabel.get(selMonth)
      if (mk == null) return null
      // A closed/past month is complete on both sides, so full-month-vs-full-month
      // is already a fair comparison -- only the CURRENT, still-running month needs
      // day-matching (see below), otherwise e.g. 9 real days of August get compared
      // against all 31 days of July and every KPI reads as a collapse regardless of
      // real performance.
      if (!isCurrentMonth) return { type:'month', mk: mk - 1, calendarShift:true }
      // Day-count is taken off the month's own real data (the latest date actually
      // present), not "today" -- so this stays correct even when the sheet lags a
      // day or two behind the calendar.
      let maxDate = null
      dateFilteredRows.forEach(r => { if (r.date && (!maxDate || r.date > maxDate)) maxDate = r.date })
      if (!maxDate) return { type:'month', mk: mk - 1, calendarShift:true }
      const prevMonthLastDay = new Date(maxDate.getFullYear(), maxDate.getMonth(), 0) // last day of the previous month
      const day = Math.min(maxDate.getDate(), prevMonthLastDay.getDate())
      const from = new Date(prevMonthLastDay.getFullYear(), prevMonthLastDay.getMonth(), 1)
      const to = new Date(prevMonthLastDay.getFullYear(), prevMonthLastDay.getMonth(), day, 23, 59, 59, 999)
      return { type:'range', from, to, calendarShift:true }
    }
    if (dateWindow) {
      // Custom ranges set .to to 23:59:59.999 (end of day) while .from stays at
      // 00:00:00 -- diffing those raw timestamps gives 8.9999... days for a
      // genuine 9-day range, which rounds to 9 and then +1 overcounts to 10.
      // Stripping the time-of-day first gives the true calendar-day count on
      // every preset (LD/L7D/MTD already had no time-of-day padding, so this
      // is a no-op for them -- only custom ranges were ever affected).
      const fromMid = new Date(dateWindow.from.getFullYear(), dateWindow.from.getMonth(), dateWindow.from.getDate())
      const toMid = new Date(dateWindow.to.getFullYear(), dateWindow.to.getMonth(), dateWindow.to.getDate())
      // MTD (or a Custom range someone picked that also happens to start on the
      // 1st of a month) reads as "the month so far" -- the natural comparison is
      // the SAME day-of-month range in the PREVIOUS calendar month (1-9 Aug vs
      // 1-9 Jul), not a trailing window immediately before it (which would land
      // on 23-31 Jul and compare against days that have nothing to do with "the
      // start of the month"). This mirrors the exact day-clamp logic the Month
      // dropdown already uses for an in-progress month.
      if (datePreset === 'MTD' || (datePreset === 'custom' && fromMid.getDate() === 1)) {
        const prevMonthLastDay = new Date(fromMid.getFullYear(), fromMid.getMonth(), 0)
        const daySpan = Math.round((toMid - fromMid) / 86400000) + 1
        const day = Math.min(daySpan, prevMonthLastDay.getDate())
        const prevFrom = new Date(prevMonthLastDay.getFullYear(), prevMonthLastDay.getMonth(), 1)
        const prevTo = new Date(prevMonthLastDay.getFullYear(), prevMonthLastDay.getMonth(), day, 23, 59, 59, 999)
        return { type:'range', from:prevFrom, to:prevTo, calendarShift:true }
      }
      // Otherwise (Last Day, Last 7 Days, or a mid-month custom range) the
      // natural comparison really is the same-length window immediately before it.
      const days = Math.round((toMid - fromMid) / 86400000) + 1
      const prevTo = new Date(dateWindow.from); prevTo.setDate(prevTo.getDate() - 1); prevTo.setHours(23, 59, 59, 999)
      const prevFrom = new Date(prevTo); prevFrom.setDate(prevTo.getDate() - (days - 1)); prevFrom.setHours(0, 0, 0, 0)
      return { type:'range', from:prevFrom, to:prevTo }
    }
    return null
  }, [activeFilter, dateWindow, datePreset, selMonth, monthKeyByLabel, isCurrentMonth, dateFilteredRows])

  const prevFiltered = useMemo(() => {
    if (!prevWindow) return []
    let rs = prevWindow.type === 'month' ? rows.filter(r => r.mk === prevWindow.mk) : rows.filter(r => r.date && r.date >= prevWindow.from && r.date <= prevWindow.to)
    if (!sourceIsAll) rs = rs.filter(matchesSource)
    if (corridorFilter !== 'All') rs = rs.filter(r => corridorLabel(classifyCorridor(r.campaign)) === corridorFilter)
    const q = campaignQueryDebounced.trim().toLowerCase()
    if (q) rs = rs.filter(r => r.campaign.toLowerCase().includes(q))
    return rs
  }, [rows, prevWindow, selectedSources, corridorFilter, campaignQueryDebounced])

  const prevKpis = useMemo(() => sumKpis(prevFiltered), [prevFiltered])
  // Same paid-only basis as the current period -- otherwise the delta arrows would be
  // comparing two different definitions of CPL/CPQL/CPA against each other.
  const prevPaidKpis = useMemo(() => {
    const s = new Set()
    prevFiltered.forEach(r => { if (r.spend > 0) s.add(r.source) })
    return sumKpis(prevFiltered.filter(r => s.has(r.source)))
  }, [prevFiltered])
  const prevCpl = prevPaidKpis.leads > 0 ? prevKpis.spend / prevPaidKpis.leads : 0
  const prevCpql = prevPaidKpis.totalQL > 0 ? prevKpis.spend / prevPaidKpis.totalQL : 0
  const prevCpa = prevPaidKpis.apps > 0 ? prevKpis.spend / prevPaidKpis.apps : 0
  const prevTotalQueued = prevKpis.futworkHumanQ + prevKpis.futworkAiQ + prevKpis.superbotQ
  const prevTotalFutworkQ = prevKpis.futworkHumanQ + prevKpis.futworkAiQ
  const prevEstimatedRaus = prevKpis.deposits * RAU_CONVERSION_FACTOR
  const prevEstSrRevenue = prevEstimatedRaus * srFee
  const prevActSrRevenue = prevKpis.raus * srFee
  const prevActualRoas = prevKpis.spend > 0 ? prevActSrRevenue / prevKpis.spend : 0
  const deltaPct = (cur, prev) => (!prev ? null : ((cur - prev) / prev) * 100)
  // C12 fix: a percentage computed off a near-zero baseline is noise, not signal -- e.g.
  // "AI QUEUED ▲ 118128.0%" when the prior period's value was ~25 (exactly the shape of
  // the still-backfilling Futwork AI split, see C4). Below this floor the KPI cards show
  // a plain "New" pill instead of a percentage. Deliberately scoped to the KPI-card
  // render sites only (below) -- deltaPct itself feeds sorting/verdict logic elsewhere on
  // this page (Compare's movers list, the month-comparison table) where a string sentinel
  // in place of a number would silently break `Math.abs()`/numeric comparisons.
  const DELTA_NEW_FLOOR = 50
  const kpiDelta = (cur, prev) => (
    Math.abs(prev || 0) < DELTA_NEW_FLOOR ? (cur > 0 ? 'new' : null) : deltaPct(cur, prev)
  )

  // ── Compare — decision-focused period comparison ─────────────────────────
  // Deliberately NOT an AI call: every number here is a direct sum/delta over
  // the same rows already loaded, so it's exactly as trustworthy as the rest
  // of the page's own KPIs, just re-sliced against a second period.
  const compareWindow = useMemo(() => {
    if (!compareOpen) return null
    if (compareMode === 'prev') return prevWindow
    if (compareMode === 'yoy') {
      if (activeFilter === 'month') {
        const mk = monthKeyByLabel.get(selMonth)
        return mk == null ? null : { type:'month', mk: mk - 12 }
      }
      if (dateWindow) {
        const from = new Date(dateWindow.from); from.setFullYear(from.getFullYear() - 1)
        const to = new Date(dateWindow.to); to.setFullYear(to.getFullYear() - 1)
        return { type:'range', from, to }
      }
      return null
    }
    return null // 'custom' handled directly in compareRows below
  }, [compareOpen, compareMode, prevWindow, activeFilter, selMonth, monthKeyByLabel, dateWindow])

  const filterRowsByDateStr = (fromStr, toStr) => {
    if (!fromStr || !toStr) return null
    const [fy, fm, fd] = fromStr.split('-').map(Number); const cf = new Date(fy, fm - 1, fd); cf.setHours(0, 0, 0, 0)
    const [ty, tm, td] = toStr.split('-').map(Number); const ct = new Date(ty, tm - 1, td); ct.setHours(23, 59, 59, 999)
    let rs = rows.filter(r => r.date && r.date >= cf && r.date <= ct)
    if (!sourceIsAll) rs = rs.filter(matchesSource)
    return rs
  }

  const compareRows = useMemo(() => {
    if (!compareOpen) return []
    if (compareMode === 'custom') return filterRowsByDateStr(compareCustomFrom, compareCustomTo) || []
    if (!compareWindow) return []
    let rs = compareWindow.type === 'month' ? rows.filter(r => r.mk === compareWindow.mk) : rows.filter(r => r.date && r.date >= compareWindow.from && r.date <= compareWindow.to)
    if (!sourceIsAll) rs = rs.filter(matchesSource)
    return rs
  }, [compareOpen, compareMode, compareCustomFrom, compareCustomTo, compareWindow, rows, selectedSources])

  // ── BigQuery mode: the server-side window ────────────────────────────────────
  // What this page needs is not only the range on screen: every KPI also carries a
  // vs-previous-period delta, and Compare adds a second period on top. So the read
  // spans the union of (window on screen) + (previous equivalent window) + (Compare
  // window, while Compare is open) -- and nothing wider than that. Everything
  // downstream then slices these rows exactly the way it slices CSV rows, which is
  // what makes the two paths the same arithmetic over the same facts.
  //
  // Known and accepted narrowing, documented rather than hidden: things that
  // deliberately ignore the date filter -- the campaign search suggestion list, and
  // the day-level windows the Slack v2/v5/v6 reports build -- see only this window in
  // BQ mode, where on the CSV path they see the entire sheet.
  // Trend Analysis' own trailing window -- deliberately computed WITHOUT touching
  // nonDateRows/bqRows, so it can safely feed bqRange below without a circular
  // dependency (bqRange -> fetch -> bqRows -> nonDateRows -> trendMaxDate -> bqRange).
  // Anchored off the BigQuery cache's own latest date (bqBounds.max, fetched
  // independently of any range) rather than off whatever bqRows currently holds --
  // that's the whole bug this fixes: bqRows only ever contains what bqRange already
  // asked for, so anchoring off it can never discover that Trend needs MORE.
  const trendAnchorDate = useMemo(() => (
    bqActive && bqBounds?.max ? dateFromIso(bqBounds.max) : null
  ), [bqActive, bqBounds])
  // Trailing 5 months ending at the cache's own latest date -- same anchor as
  // trendAnchorDate, same anti-circular-dependency reasoning (must not read
  // nonDateRows/bqRows, since those are downstream of this). Deliberately NOT pushed
  // into bqRange below -- see the state comment above monthTrendBqRows for why.
  const monthTrendBqSpan = useMemo(() => {
    if (!bqActive || !trendAnchorDate) return null
    const endMk = monthKey(trendAnchorDate)
    return { from: monthStartDate(endMk - 4), to: monthEndDate(endMk) }
  }, [bqActive, trendAnchorDate])
  const trendBqSpan = useMemo(() => {
    if (!trendOpen || !bqActive || !trendAnchorDate) return null
    const end = trendAnchorDate
    if (trendEffectiveGranularity === 'month') {
      const endMk = monthKey(end)
      return { from: monthStartDate(endMk - (trendPeriods - 1)), to: monthEndDate(endMk) }
    }
    const days = trendEffectiveGranularity === 'week' ? trendPeriods * 7 : trendPeriods
    const from = new Date(end); from.setDate(from.getDate() - (days - 1)); from.setHours(0, 0, 0, 0)
    const to = new Date(end); to.setHours(23, 59, 59, 999)
    return { from, to }
  }, [trendOpen, bqActive, trendAnchorDate, trendEffectiveGranularity, trendPeriods])

  const bqRange = useMemo(() => {
    if (!bqMode) return null
    const spans = []
    const pushRange = w => { if (w && w.from && w.to) spans.push([w.from, w.to]) }
    const pushMonth = mk => { if (mk != null) spans.push([monthStartDate(mk), monthEndDate(mk)]) }
    const pushWindow = w => { if (!w) return; if (w.type === 'month') pushMonth(w.mk); else pushRange(w) }
    if (dateWindow) pushRange(dateWindow)
    else {
      const mk = monthKeyByLabel.get(selMonth)
      // 'All months' is a synthetic option (always index 0 in monthOptions) that never
      // has a real entry in monthKeyByLabel, so this always no-op'd -- the effect below
      // early-returns on a null bqSince/bqUntil and leaves whatever bqRows the PREVIOUS
      // single-month selection fetched, so "All months" silently rendered a stale
      // one-month window as if it were the full history. Fall back to the cache's own
      // known bounds (already fetched independently, same fields the Month dropdown and
      // trendAnchorDate use) so a real, full-history fetch actually fires.
      if (mk != null) pushMonth(mk)
      else if (bqBounds?.min && bqBounds?.max) pushRange({ from: dateFromIso(bqBounds.min), to: dateFromIso(bqBounds.max) })
    }
    pushWindow(prevWindow)
    pushWindow(compareWindow)
    if (compareOpen && compareMode === 'custom' && compareCustomFrom && compareCustomTo) {
      const [fy, fm, fd] = compareCustomFrom.split('-').map(Number)
      const [ty, tm, td] = compareCustomTo.split('-').map(Number)
      spans.push([new Date(fy, fm - 1, fd), new Date(ty, tm - 1, td)])
    }
    pushRange(trendBqSpan)
    if (!spans.length) return null
    let lo = spans[0][0], hi = spans[0][1]
    for (const [a, b] of spans) { if (a < lo) lo = a; if (b > hi) hi = b }
    return { since: dayKey(lo), until: dayKey(hi) }
  }, [bqMode, dateWindow, selMonth, monthKeyByLabel, bqBounds, prevWindow, compareWindow, compareOpen, compareMode, compareCustomFrom, compareCustomTo, trendBqSpan])

  // The read effect below depends on these two PRIMITIVES, never on the bqRange object
  // itself -- and that is not a style preference. `months` is derived from `rows`, so a
  // completed read hands monthKeyByLabel a new identity, which hands bqRange a new
  // identity with byte-identical contents. An effect keyed on the object would see a
  // "changed" dependency and refetch forever.
  const bqSince = bqRange ? bqRange.since : null
  const bqUntil = bqRange ? bqRange.until : null

  // Date bounds + the cache's own freshness stamp. Three single-row reads, once per
  // toggle-on (and again on Refresh). "Synced" then reports when the CACHE last ran
  // rather than when this tab happened to fetch, which is the more useful fact.
  useEffect(() => {
    if (!bqMode) return
    let dead = false
    retryFetch(fetchOverallBqBounds)
      .then(b => { if (!dead) setBqBounds(b) })
      .catch(e => { if (!dead) { setBqError('cache unavailable -- ' + e.message); setLoading(false); loadData() } })
    // fetchOverallBqSyncedAt() already swallows its own errors and resolves null on
    // any failure -- track that explicitly (bqSyncUnknown) instead of just leaving
    // lastSync at whatever it was, which on this page renders as no "Synced" line at
    // all with nothing telling the reader why. A stale/mirrored figure being mistaken
    // for a live one is exactly the kind of thing this app has a documented history of
    // (see the 2026-08-05 CLAUDE.md entry) -- say "unknown" rather than say nothing.
    setBqSyncUnknown(false)
    fetchOverallBqSyncedAt().then(ts => { if (dead) return; if (ts) setLastSync(ts); else setBqSyncUnknown(true) })
    return () => { dead = true }
  }, [bqMode, bqNonce, loadData])

  // A cold load straight into BQ mode has no selMonth yet (the CSV path is what
  // normally sets it), so default it here: the current month if the cache reaches it,
  // the newest month it has otherwise. Toggling on mid-session leaves selMonth alone --
  // which is precisely what makes the two paths comparable on identical filters.
  useEffect(() => {
    if (!bqMode || selMonth) return
    const maxKey = monthKeyFromIso(bqBounds?.max)
    if (maxKey == null) return
    const curKey = monthKey(new Date())
    setSelMonth(monthLabel(maxKey >= curKey ? curKey : maxKey))
  }, [bqMode, bqBounds, selMonth])

  // ALWAYS full per-row detail (campaign_name included), never the aggregated
  // day+Source table. Tried gating this on grpBy/trendDim/compareGroupBy first
  // (fast path unless the CURRENTLY VISIBLE view needed campaign detail), but
  // that missed a whole region of the page: reportCmp (the source for
  // CpqlBySource/SpendVsQuality/CorridorRanking/AdRanking/NotPerforming, all
  // rendered unconditionally below the main table, not gated by grpBy or any
  // open/closed panel state) classifies EVERY row's corridor from r.campaign.
  // With the aggregated table (no campaign_name) that silently collapsed the
  // whole account into a single "Unclassified" corridor holding 100% of spend
  // -- wrong, not just slow. Since that section is always on screen, there is
  // no view of this page that can safely skip campaign-level rows, so the fast
  // aggregated table (fetchOverallBqAggRows, supabase/sql/overall_bq_agg_setup.sql)
  // is left unused here for now rather than partially applied and unsafe.
  useEffect(() => {
    if (!bqMode || !bqSince || !bqUntil) return
    const cacheKey = bqSince + '|' + bqUntil + '|' + (sourceIsAll ? 'ALL' : [...selectedSources].sort().join(','))
    const cached = bqRowsCacheRef.current.get(cacheKey)
    if (cached) {
      // Re-insert to the end so this key counts as most-recently-used for the eviction
      // below, then serve it -- same branches the network path takes on success, just
      // synchronous.
      bqRowsCacheRef.current.delete(cacheKey)
      bqRowsCacheRef.current.set(cacheKey, cached)
      setBqRows(cached.raw.map(mapRow))
      setBqRowCount(cached.raw.length)
      if (sourceIsAll) setBqSourceOpts(cached.sourceOpts)
      setBqError(null)
      setBqBusy(false)
      setLoading(false)
      return
    }
    let dead = false
    setBqBusy(true)
    const fetcher = fetchOverallBqRows
    retryFetch(() => fetcher({ since: bqSince, until: bqUntil, sources: sourceIsAll ? [] : selectedSources }))
      .then(raw => {
        if (dead) return
        setBqRows(raw.map(mapRow))
        setBqRowCount(raw.length)
        // Only ever refresh the Source options from a read that had NO Source filter on
        // it, or the dropdown would shrink to whatever is currently selected.
        const sourceOpts = sourceIsAll ? ['All', ...[...new Set(raw.map(r => (r.Source || '').trim() || 'Unknown'))].sort()] : null
        if (sourceOpts) setBqSourceOpts(sourceOpts)
        setBqError(null)
        const cache = bqRowsCacheRef.current
        // sourceOpts is only ever non-null when this fetch was itself sourceIsAll (a
        // filtered fetch never recomputes the dropdown, per the comment above) -- and a
        // filtered cache entry is never read back into setBqSourceOpts on a hit (guarded
        // by `if (sourceIsAll)` there too), so null here is simply "not applicable."
        cache.set(cacheKey, { raw, sourceOpts })
        while (cache.size > BQ_ROWS_CACHE_MAX) cache.delete(cache.keys().next().value)
      })
      .catch(e => {
        if (dead) return
        // Fall back to the sheet instead of showing a broken page. loadData() is
        // session-cached, so this is instant if the CSV was already parsed once.
        setBqError(e.message)
        loadData()
      })
      .finally(() => { if (!dead) { setBqBusy(false); setLoading(false) } })
    return () => { dead = true }
  }, [bqMode, bqSince, bqUntil, sourceIsAll, selectedSources, bqNonce, loadData])

  // Same "read on primitives, not the span object" rule as bqSince/bqUntil above --
  // monthTrendBqSpan gets a new identity every time bqRange recomputes even when its
  // actual from/to dates haven't moved, which would otherwise refetch this card forever.
  const monthTrendBqSince = monthTrendBqSpan ? dayKey(monthTrendBqSpan.from) : null
  const monthTrendBqUntil = monthTrendBqSpan ? dayKey(monthTrendBqSpan.to) : null

  // Fetches ALL sources, unfiltered -- nonDateRows' own Source/Corridor/campaign-search
  // filters are applied client-side when monthTrend below builds its chart data. This is
  // deliberate: filtering server-side would mean every Source-dropdown change re-issues
  // a multi-month BigQuery read, defeating the entire point of keeping this off the main
  // page's critical path. One fetch per 5-month window; the page's own filters recompute
  // on the client for free from there.
  useEffect(() => {
    if (!bqActive || !monthTrendBqSince || !monthTrendBqUntil) return
    let dead = false
    setMonthTrendBqBusy(true)
    retryFetch(() => fetchOverallBqRows({ since: monthTrendBqSince, until: monthTrendBqUntil, sources: [] }))
      .then(raw => { if (!dead) setMonthTrendBqRows(raw.map(mapRow)) })
      .catch(() => { /* leave the card on whatever it last had; the page itself already
                        falls back to the sheet on a real BQ outage via the main effect
                        above -- this card just quietly stays stale rather than erroring
                        twice for the same underlying failure. */ })
      .finally(() => { if (!dead) setMonthTrendBqBusy(false) })
    return () => { dead = true }
  }, [bqActive, monthTrendBqSince, monthTrendBqUntil, bqNonce])

  // Period A (the "current" side) is normally whatever the main page filter is --
  // correct for 'prev'/'yoy' modes, since those are explicitly "vs the period I'm
  // looking at". But in custom mode BOTH sides need to be independently pickable
  // (see state comment above), so period A switches to its own custom range there.
  const periodARows = compareMode === 'custom' ? (filterRowsByDateStr(compareCustomFromA, compareCustomToA) || []) : filtered
  const periodAKpis = useMemo(() => sumKpis(periodARows), [periodARows])
  // CPL/CPQL/CPA everywhere else on this page divide TOTAL spend by PAID-only
  // leads/QLs/apps (see the paidKpis note above cpl/cpql/cpa) -- this modal's own
  // copy used periodAKpis.leads/totalQL (every row, free channels included), which
  // read a materially cheaper, wrong CPL/CPQL right next to the correct KPI cards
  // on the same screen. Paid-only denominators, same as the cards.
  const periodAPaidKpis = useMemo(() => sumKpis(periodARows.filter(r => paidSources.has(r.source))), [periodARows, paidSources])
  const periodACpl = periodAPaidKpis.leads > 0 ? periodAKpis.spend / periodAPaidKpis.leads : 0
  const periodACpql = periodAPaidKpis.totalQL > 0 ? periodAKpis.spend / periodAPaidKpis.totalQL : 0

  const compareLabel = useMemo(() => {
    if (compareMode === 'prev') return prevWindow ? (prevWindow.type === 'month' ? monthLabel(prevWindow.mk) : 'previous period') : '—'
    if (compareMode === 'yoy') return compareWindow ? (compareWindow.type === 'month' ? monthLabel(compareWindow.mk) : 'same period last year') : '—'
    if (compareMode === 'custom') return (compareCustomFrom && compareCustomTo) ? `${compareCustomFrom} -> ${compareCustomTo}` : 'pick a range'
    return '—'
  }, [compareMode, prevWindow, compareWindow, compareCustomFrom, compareCustomTo])

  const currentLabel = compareMode === 'custom'
    ? ((compareCustomFromA && compareCustomToA) ? `${compareCustomFromA} -> ${compareCustomToA}` : 'pick a range')
    : (activeFilter === 'month' ? (selMonth || 'this period') : (dateWindow ? dateWindow.label : 'this period'))

  const compareKpis = useMemo(() => sumKpis(compareRows), [compareRows])
  const comparePaidKpis = useMemo(() => sumKpis(compareRows.filter(r => paidSources.has(r.source))), [compareRows, paidSources])
  const compareCpl = comparePaidKpis.leads > 0 ? compareKpis.spend / comparePaidKpis.leads : 0
  const compareCpql = comparePaidKpis.totalQL > 0 ? compareKpis.spend / comparePaidKpis.totalQL : 0
  const compareCpa = comparePaidKpis.apps > 0 ? compareKpis.spend / comparePaidKpis.apps : 0

  const fmtDateInput = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  // Prefill both custom ranges the first time Custom is opened, so the modal
  // never starts on a blank/mismatched pair -- period A mirrors the page's
  // current window, period B mirrors the already-computed previous window.
  const prefillCustomRange = () => {
    if (!compareCustomFromA || !compareCustomToA) {
      if (activeFilter === 'month') {
        const mk = monthKeyByLabel.get(selMonth)
        if (mk != null) { const f = new Date(Math.floor(mk / 12), mk % 12, 1); const t = new Date(Math.floor(mk / 12), (mk % 12) + 1, 0); setCompareCustomFromA(fmtDateInput(f)); setCompareCustomToA(fmtDateInput(t)) }
      } else if (dateWindow) { setCompareCustomFromA(fmtDateInput(dateWindow.from)); setCompareCustomToA(fmtDateInput(dateWindow.to)) }
    }
    if (!compareCustomFrom || !compareCustomTo) {
      if (prevWindow && prevWindow.type === 'range') { setCompareCustomFrom(fmtDateInput(prevWindow.from)); setCompareCustomTo(fmtDateInput(prevWindow.to)) }
      else if (prevWindow && prevWindow.type === 'month') { const mk = prevWindow.mk; const f = new Date(Math.floor(mk / 12), mk % 12, 1); const t = new Date(Math.floor(mk / 12), (mk % 12) + 1, 0); setCompareCustomFrom(fmtDateInput(f)); setCompareCustomTo(fmtDateInput(t)) }
    }
  }

  // Generic grouping used by the movers list — keyed by whichever dimension the
  // marketer picks (corridor / source / campaign), so "what's driving it" isn't
  // locked to corridor only.
  function groupByDimRaw(list, dim) {
    const keyFn = dim === 'source' ? (r => r.source || 'Unknown')
      : dim === 'campaign' ? (r => r.campaign || '(no campaign)')
      : (r => classifyCorridor(r.campaign))
    const labelFn = dim === 'corridor' ? corridorLabel : (id) => id
    const m = new Map()
    list.forEach(r => {
      const id = keyFn(r)
      const e = m.get(id) || { id, corridor: labelFn(id), totalQL:0, spend:0, leads:0 }
      e.totalQL += r.totalQL; e.spend += r.spend; e.leads += r.leads
      m.set(id, e)
    })
    return m
  }

  // Ranked movers: which segment (corridor/source/campaign) contributed most to
  // the change in Total QL between the two periods — the single metric that
  // best answers "where do I put my next rupee" for a performance marketer,
  // vs a flat list of every segment's raw numbers.
  const compareMovers = useMemo(() => {
    if (!compareOpen || compareRows.length === 0 || periodARows.length === 0) return []
    const a = groupByDimRaw(periodARows, compareGroupBy)
    const b = groupByDimRaw(compareRows, compareGroupBy)
    const labelFor = id => a.get(id)?.corridor || b.get(id)?.corridor || id
    const ids = new Set([...a.keys(), ...b.keys()])
    const out = []
    ids.forEach(id => {
      const ea = a.get(id) || { totalQL:0, spend:0, leads:0 }
      const eb = b.get(id) || { totalQL:0, spend:0, leads:0 }
      if (ea.totalQL < 3 && eb.totalQL < 3) return // skip noise from near-zero segments on both sides
      out.push({
        corridor: labelFor(id),
        aQL: ea.totalQL, bQL: eb.totalQL, deltaQL: ea.totalQL - eb.totalQL,
        aCpql: ea.totalQL > 0 ? ea.spend / ea.totalQL : 0,
        bCpql: eb.totalQL > 0 ? eb.spend / eb.totalQL : 0,
      })
    })
    return out.sort((x, y) => Math.abs(y.deltaQL) - Math.abs(x.deltaQL)).slice(0, 5)
  }, [compareOpen, compareRows, periodARows, compareGroupBy])

  const compareQlDeltaPct = deltaPct(periodAKpis.totalQL, compareKpis.totalQL)
  const compareCpqlDeltaPct = deltaPct(periodACpql, compareCpql)

  const compareVerdict = useMemo(() => {
    if (!compareOpen || compareRows.length === 0 || periodARows.length === 0) return null
    const qd = compareQlDeltaPct, cd = compareCpqlDeltaPct
    const volUp = qd != null && qd > 2, volDown = qd != null && qd < -2
    const costUp = cd != null && cd > 2, costDown = cd != null && cd < -2
    if (volUp && costDown) return { tone:'good', text: `Total QL is up ${qd.toFixed(0)}% and it got cheaper — CPQL down ${Math.abs(cd).toFixed(0)}%. This is your best-case scenario.` }
    if (volUp && costUp) return { tone:'warn', text: `Total QL is up ${qd.toFixed(0)}%, but you're paying ${cd.toFixed(0)}% more per QL to get there.` }
    if (volDown && costUp) return { tone:'bad', text: `Total QL is down ${Math.abs(qd).toFixed(0)}% and CPQL is up ${cd.toFixed(0)}% — both volume and efficiency declined.` }
    if (volDown && costDown) return { tone:'warn', text: `Total QL is down ${Math.abs(qd).toFixed(0)}%, though the QLs you did get were ${Math.abs(cd).toFixed(0)}% cheaper.` }
    if (volUp) return { tone:'good', text: `Total QL is up ${qd.toFixed(0)}% with CPQL roughly flat.` }
    if (volDown) return { tone:'bad', text: `Total QL is down ${Math.abs(qd).toFixed(0)}% with CPQL roughly flat.` }
    if (costUp) return { tone:'warn', text: `Volume is flat, but CPQL rose ${cd.toFixed(0)}%.` }
    if (costDown) return { tone:'good', text: `Volume is flat, and CPQL improved ${Math.abs(cd).toFixed(0)}%.` }
    return { tone:'neutral', text: `Total QL and CPQL are both roughly flat vs ${compareLabel}.` }
  }, [compareOpen, compareRows, periodARows, compareQlDeltaPct, compareCpqlDeltaPct, compareLabel])

  const compareDimWord = compareGroupBy === 'source' ? 'source' : compareGroupBy === 'campaign' ? 'campaign' : 'corridor'

  const compareAction = useMemo(() => {
    if (!compareOpen || compareMovers.length === 0) return null
    const worst = [...compareMovers].sort((x, y) => x.deltaQL - y.deltaQL)[0]
    const best = [...compareMovers].sort((x, y) => y.deltaQL - x.deltaQL)[0]
    const overallDown = compareQlDeltaPct != null && compareQlDeltaPct < -2
    if (overallDown && worst && worst.deltaQL < 0) {
      return `${worst.corridor} accounts for the biggest drop (${fmtN(Math.abs(worst.deltaQL))} fewer QLs). Check that ${compareDimWord} first before touching anything else.`
    }
    if (best && best.deltaQL > 0 && best.bCpql > 0 && best.aCpql <= best.bCpql) {
      return `${best.corridor} grew ${fmtN(best.deltaQL)} QLs while holding or improving CPQL — the strongest candidate for more budget.`
    }
    if (best && best.deltaQL > 0) {
      return `${best.corridor} drove the largest gain (+${fmtN(best.deltaQL)} QLs) — worth a closer look at what changed there.`
    }
    return null
  }, [compareOpen, compareMovers, compareQlDeltaPct, compareDimWord])


  const funnel = useMemo(() => {
    // These 4 bars are ranked by their own value, highest first -- which one leads
    // changes with the data (e.g. a period where Floor genuinely outpaces Futwork),
    // so this is a sort every render, never a fixed order.
    const floorVsFutwork = [
      { stage:'Directly Distributed to Floor', count:kpis.floorQueued },
      { stage:'Total Futwork Queued', count:totalFutworkQ },
      { stage:'Futwork AI Queued', count:kpis.futworkAiQ },
      { stage:'Futwork Human Queued', count:kpis.futworkHumanQ },
    ].sort((a, b) => b.count - a.count)
    return [
      { stage:'Leads Generated', count:kpis.leads },
      ...floorVsFutwork,
      { stage:'Total QL', count:kpis.totalQL },
      { stage:'Futwork AI QL', count:kpis.futworkAiQl },
      { stage:'Futwork Human QL', count:kpis.humanQL },
      { stage:'Applications', count:kpis.apps },
      { stage:'Offers', count:kpis.offers },
      { stage:'Deposits', count:kpis.deposits },
      { stage:'RAUs', count:kpis.raus },
    ]
  }, [kpis, totalFutworkQ])

  // The real conversion PATH (not the parallel Floor/Queued split) — used both for the
  // conversion-chain strip and to find the biggest leak for the insights row.
  const conversionChain = useMemo(() => ([
    { from:'Leads', to:'Queued', a:kpis.leads, b:totalQueued },
    { from:'Queued', to:'Total QL', a:totalQueued, b:kpis.totalQL },
    { from:'Total QL', to:'Apps', a:kpis.totalQL, b:kpis.apps },
    { from:'Apps', to:'Offers', a:kpis.apps, b:kpis.offers },
    { from:'Offers', to:'Deposits', a:kpis.offers, b:kpis.deposits },
  ].map(s => ({ ...s, rate: s.a > 0 ? (s.b / s.a) * 100 : null }))), [kpis, totalQueued])

  const bySource = useMemo(() => {
    const m = new Map()
    filtered.forEach(r => {
      const e = m.get(r.source) || { source:r.source, paidLeads:0, paidQL:0, paidApps:0, leads:0, queued:0, floorQueued:0, futworkHumanQ:0, futworkAiQ:0, superbotQ:0, humanQL:0, futworkAiQl:0, superbotAiQl:0, totalQL:0, apps:0, offers:0, deposits:0, raus:0, spend:0 }
      e.leads += r.leads; e.queued += r.futworkHumanQ + r.futworkAiQ + r.superbotQ; e.humanQL += r.humanQL
      e.floorQueued += r.floorQueued; e.futworkHumanQ += r.futworkHumanQ; e.futworkAiQ += r.futworkAiQ; e.superbotQ += r.superbotQ
      e.futworkAiQl += r.futworkAiQl; e.superbotAiQl += r.superbotAiQl; e.totalQL += r.totalQL
      e.apps += r.apps; e.offers += r.offers; e.deposits += r.deposits; e.raus += r.raus; e.spend += r.spend
      // paid-only denominators for CPL/CPQL/CPA -- keyed on the row's SOURCE, since spend
      // and leads often sit on different rows (see the paidSources note above)
      if (paidSources.has(r.source)) { e.paidLeads += r.leads; e.paidQL += r.totalQL; e.paidApps += r.apps }
      m.set(r.source, e)
    })
    return [...m.values()].sort((a, b) => b.leads - a.leads)
  }, [filtered, paidSources])

  const bySourceEfficiency = useMemo(() => (
    bySource.filter(s => s.queued >= 10).map(s => ({ ...s, qlRate: s.queued > 0 ? (s.totalQL / s.queued) * 100 : 0 })).sort((a, b) => b.qlRate - a.qlRate).slice(0, 8)
  ), [bySource])

  const byMonth = useMemo(() => {
    const m = new Map()
    filtered.forEach(r => {
      if (r.mk == null) return
      const e = m.get(r.mk) || { mk:r.mk, label:monthLabel(r.mk), leads:0, queued:0, floorQueued:0, futworkHumanQ:0, futworkAiQ:0, superbotQ:0, humanQL:0, futworkAiQl:0, superbotAiQl:0, totalQL:0, deposits:0 }
      e.leads += r.leads; e.queued += r.futworkHumanQ + r.futworkAiQ + r.superbotQ; e.humanQL += r.humanQL
      e.floorQueued += r.floorQueued; e.futworkHumanQ += r.futworkHumanQ; e.futworkAiQ += r.futworkAiQ; e.superbotQ += r.superbotQ
      e.futworkAiQl += r.futworkAiQl; e.superbotAiQl += r.superbotAiQl; e.totalQL += r.totalQL; e.deposits += r.deposits
      m.set(r.mk, e)
    })
    return [...m.values()].sort((a, b) => a.mk - b.mk)
  }, [filtered])

  // Daily trend — last 30 days present in the active selection, gives the "what happened
  // recently" pulse a marketer checks first thing in the morning.
  const byDay = useMemo(() => {
    const m = new Map()
    filtered.forEach(r => {
      if (!r.date) return
      const key = dayKey(r.date)
      const e = m.get(key) || { key, date:r.date, leads:0, queued:0, humanQL:0, totalQL:0 }
      e.leads += r.leads; e.queued += r.futworkHumanQ + r.futworkAiQ + r.superbotQ; e.humanQL += r.humanQL; e.totalQL += r.totalQL
      m.set(key, e)
    })
    return [...m.values()].sort((a, b) => a.key < b.key ? -1 : 1).slice(-30).map(d => ({ ...d, label:dayLabel(d.date) }))
  }, [filtered])

  const byCampaign = useMemo(() => {
    const m = new Map()
    filtered.forEach(r => {
      if (!r.campaign) return
      let e = m.get(r.campaign)
      if (!e) {
        e = { campaign:r.campaign, corridor:corridorLabel(classifyCorridor(r.campaign)), paidLeads:0, paidQL:0, paidApps:0, leads:0, queued:0, floorQueued:0, futworkHumanQ:0, futworkAiQ:0, superbotQ:0, humanQL:0, futworkAiQl:0, superbotAiQl:0, totalQL:0, apps:0, offers:0, deposits:0, raus:0, spend:0, _srcLeads: new Map(), _subLeads: new Map() }
        m.set(r.campaign, e)
      }
      e.leads += r.leads; e.queued += r.futworkHumanQ + r.futworkAiQ + r.superbotQ; e.humanQL += r.humanQL
      e.floorQueued += r.floorQueued; e.futworkHumanQ += r.futworkHumanQ; e.futworkAiQ += r.futworkAiQ; e.superbotQ += r.superbotQ
      e.futworkAiQl += r.futworkAiQl; e.superbotAiQl += r.superbotAiQl; e.totalQL += r.totalQL
      e.apps += r.apps; e.offers += r.offers; e.deposits += r.deposits; e.raus += r.raus; e.spend += r.spend
      // paid-only denominators for CPL/CPQL/CPA -- keyed on the row's SOURCE, since spend
      // and leads often sit on different rows (see the paidSources note above)
      if (paidSources.has(r.source)) { e.paidLeads += r.leads; e.paidQL += r.totalQL; e.paidApps += r.apps }
      // A campaign name is expected to sit under one Source/Sub Source pair throughout the
      // sheet, but tally by leads rather than just taking the first row seen, so a genuine
      // edge case (the same campaign name reused under a different source) still resolves
      // to whichever pairing actually carries the volume instead of an arbitrary row order.
      e._srcLeads.set(r.source, (e._srcLeads.get(r.source) || 0) + r.leads)
      e._subLeads.set(r.subSource, (e._subLeads.get(r.subSource) || 0) + r.leads)
    })
    const topOf = mp => [...mp.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown'
    return [...m.values()].map(e => {
      const { _srcLeads, _subLeads, ...rest } = e
      return { ...rest, source: topOf(_srcLeads), subSource: topOf(_subLeads) }
    }).sort((a, b) => b.leads - a.leads)
  }, [filtered, paidSources])

  const byCorridor = useMemo(() => {
    const m = new Map()
    filtered.forEach(r => {
      const id = classifyCorridor(r.campaign)
      const label = corridorLabel(id)
      const e = m.get(id) || { corridor:label, paidLeads:0, paidQL:0, paidApps:0, leads:0, queued:0, floorQueued:0, futworkHumanQ:0, futworkAiQ:0, superbotQ:0, humanQL:0, futworkAiQl:0, superbotAiQl:0, totalQL:0, apps:0, offers:0, deposits:0, raus:0, spend:0 }
      e.leads += r.leads; e.queued += r.futworkHumanQ + r.futworkAiQ + r.superbotQ; e.humanQL += r.humanQL
      e.floorQueued += r.floorQueued; e.futworkHumanQ += r.futworkHumanQ; e.futworkAiQ += r.futworkAiQ; e.superbotQ += r.superbotQ
      e.futworkAiQl += r.futworkAiQl; e.superbotAiQl += r.superbotAiQl; e.totalQL += r.totalQL
      e.apps += r.apps; e.offers += r.offers; e.deposits += r.deposits; e.raus += r.raus; e.spend += r.spend
      // paid-only denominators for CPL/CPQL/CPA -- keyed on the row's SOURCE, since spend
      // and leads often sit on different rows (see the paidSources note above)
      if (paidSources.has(r.source)) { e.paidLeads += r.leads; e.paidQL += r.totalQL; e.paidApps += r.apps }
      m.set(id, e)
    })
    return [...m.values()].sort((a, b) => b.leads - a.leads)
  }, [filtered, paidSources])

  // Full day-level breakdown (all metrics, no 30-day cap) for the summary table's Day
  // grouping — distinct from `byDay` above, which is the chart's lighter/capped version.
  const byDayFull = useMemo(() => {
    const m = new Map()
    filtered.forEach(r => {
      if (!r.date) return
      const key = dayKey(r.date)
      const e = m.get(key) || { key, date:r.date, label:dayLabel(r.date), paidLeads:0, paidQL:0, paidApps:0, leads:0, queued:0, floorQueued:0, futworkHumanQ:0, futworkAiQ:0, superbotQ:0, humanQL:0, futworkAiQl:0, superbotAiQl:0, totalQL:0, apps:0, offers:0, deposits:0, raus:0, spend:0 }
      e.leads += r.leads; e.queued += r.futworkHumanQ + r.futworkAiQ + r.superbotQ; e.humanQL += r.humanQL
      e.floorQueued += r.floorQueued; e.futworkHumanQ += r.futworkHumanQ; e.futworkAiQ += r.futworkAiQ; e.superbotQ += r.superbotQ
      e.futworkAiQl += r.futworkAiQl; e.superbotAiQl += r.superbotAiQl; e.totalQL += r.totalQL
      e.apps += r.apps; e.offers += r.offers; e.deposits += r.deposits; e.raus += r.raus; e.spend += r.spend
      // paid-only denominators for CPL/CPQL/CPA -- keyed on the row's SOURCE, since spend
      // and leads often sit on different rows (see the paidSources note above)
      if (paidSources.has(r.source)) { e.paidLeads += r.leads; e.paidQL += r.totalQL; e.paidApps += r.apps }
      m.set(key, e)
    })
    return [...m.values()].sort((a, b) => b.key.localeCompare(a.key))
  }, [filtered, paidSources])

  const topCampaignsByLeads = useMemo(() => byCampaign.slice(0, 5), [byCampaign])
  const topCampaignsByEfficiency = useMemo(() => (
    byCampaign.filter(c => c.queued >= 15).map(c => ({ ...c, qlRate: c.queued > 0 ? (c.totalQL / c.queued) * 100 : 0 })).sort((a, b) => b.qlRate - a.qlRate).slice(0, 5)
  ), [byCampaign])

  // CPQL vs. Volume efficiency map -- high CPQL is a red flag regardless of volume; low
  // CPQL with sufficient QL volume marks the best performers (not low CPQL alone, since a
  // handful of QLs at a lucky-low CPQL isn't proof of real efficiency at scale). Median
  // lines (not mean) split the quadrants, since ad spend/QL volume is typically skewed by
  // a few large campaigns -- a mean would drag the "sufficient volume" bar unreasonably high.
  const median = arr => {
    if (!arr.length) return 0
    const s = [...arr].sort((a, b) => a - b)
    const mid = Math.floor(s.length / 2)
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
  }
  const campaignEfficiencyMap = useMemo(() => {
    const withCpql = byCampaign
      .filter(c => c.totalQL > 0 && c.spend > 0)
      .map(c => ({ campaign:c.campaign, totalQL:c.totalQL, cpql:c.spend / c.totalQL, spend:c.spend }))
      .sort((a, b) => b.totalQL - a.totalQL)
      .slice(0, 30)
    const medCpql = median(withCpql.map(c => c.cpql))
    const medQL = median(withCpql.map(c => c.totalQL))
    const points = withCpql.map(c => ({
      ...c,
      quadrant: c.cpql > medCpql ? 'flag' : c.totalQL >= medQL ? 'best' : 'promising',
    }))
    return { points, medCpql, medQL }
  }, [byCampaign])

  const grouped = useMemo(() => {
    if (grpBy === 'source') return bySource.map(s => ({
      label:s.source, paidLeads:s.paidLeads, paidQL:s.paidQL, paidApps:s.paidApps, leads:s.leads, queued:s.queued, floorQueued:s.floorQueued, futworkHumanQ:s.futworkHumanQ, futworkAiQ:s.futworkAiQ, superbotQ:s.superbotQ, humanQL:s.humanQL, futworkAiQl:s.futworkAiQl, superbotAiQl:s.superbotAiQl, totalQL:s.totalQL, apps:s.apps, offers:s.offers, deposits:s.deposits, raus:s.raus, spend:s.spend,
    }))
    if (grpBy === 'campaign') return byCampaign.map(c => ({
      label:c.campaign, corridor:c.corridor, source:c.source, subSource:c.subSource, paidLeads:c.paidLeads, paidQL:c.paidQL, paidApps:c.paidApps, leads:c.leads, queued:c.queued, floorQueued:c.floorQueued, futworkHumanQ:c.futworkHumanQ, futworkAiQ:c.futworkAiQ, superbotQ:c.superbotQ, humanQL:c.humanQL, futworkAiQl:c.futworkAiQl, superbotAiQl:c.superbotAiQl, totalQL:c.totalQL, apps:c.apps, offers:c.offers, deposits:c.deposits, raus:c.raus, spend:c.spend,
    }))
    if (grpBy === 'corridor') return byCorridor.map(c => ({
      label:c.corridor, paidLeads:c.paidLeads, paidQL:c.paidQL, paidApps:c.paidApps, leads:c.leads, queued:c.queued, floorQueued:c.floorQueued, futworkHumanQ:c.futworkHumanQ, futworkAiQ:c.futworkAiQ, superbotQ:c.superbotQ, humanQL:c.humanQL, futworkAiQl:c.futworkAiQl, superbotAiQl:c.superbotAiQl, totalQL:c.totalQL, apps:c.apps, offers:c.offers, deposits:c.deposits, raus:c.raus, spend:c.spend,
    }))
    if (grpBy === 'day') return byDayFull.map(d => ({
      label:d.label, dateKey:d.key, paidLeads:d.paidLeads, paidQL:d.paidQL, paidApps:d.paidApps, leads:d.leads, queued:d.queued, floorQueued:d.floorQueued, futworkHumanQ:d.futworkHumanQ, futworkAiQ:d.futworkAiQ, superbotQ:d.superbotQ, humanQL:d.humanQL, futworkAiQl:d.futworkAiQl, superbotAiQl:d.superbotAiQl, totalQL:d.totalQL, apps:d.apps, offers:d.offers, deposits:d.deposits, raus:d.raus, spend:d.spend,
    }))
    return byMonth.map(m => {
      const full = filtered.filter(r => r.mk === m.mk)
      return {
        label:m.label, mk:m.mk, leads:m.leads, queued:m.queued, floorQueued:m.floorQueued, futworkHumanQ:m.futworkHumanQ, futworkAiQ:m.futworkAiQ, superbotQ:m.superbotQ, humanQL:m.humanQL, futworkAiQl:m.futworkAiQl, superbotAiQl:m.superbotAiQl, totalQL:m.totalQL,
        apps: full.reduce((t, r) => t + r.apps, 0), offers: full.reduce((t, r) => t + r.offers, 0),
        deposits:m.deposits, raus: full.reduce((t, r) => t + r.raus, 0),
        spend: full.reduce((t, r) => t + r.spend, 0),
        // paid-only denominators for CPL/CPQL/CPA -- see the paidKpis note above
        paidLeads: full.reduce((t, r) => t + (paidSources.has(r.source) ? r.leads : 0), 0),
        paidQL: full.reduce((t, r) => t + (paidSources.has(r.source) ? r.totalQL : 0), 0),
        paidApps: full.reduce((t, r) => t + (paidSources.has(r.source) ? r.apps : 0), 0),
      }
    })
  }, [grpBy, bySource, byCampaign, byCorridor, byDayFull, byMonth, filtered, paidSources])

  const grpByLabel = grpBy === 'source' ? 'Source' : grpBy === 'campaign' ? 'Campaign' : grpBy === 'corridor' ? 'Corridor' : grpBy === 'day' ? 'Date' : 'Month'

  // SR Revenue — Estimated (Deposits × rate) and Actual (RAUs × rate). Both rates are
  // user-configurable in the toolbar below and persist to localStorage.
  // Shared by groupedWithRevenue below AND sourceSubBreakdown's tree nodes, so the Source
  // view's Sub Source/Campaign rows compute Est./Actual SR Revenue and ROAS by the exact
  // same formula as every top-level row -- one place, no risk of the two drifting apart.
  const withSrRevenue = useCallback((g) => {
    const estimatedRaus = g.deposits * RAU_CONVERSION_FACTOR
    const estSrRevenue = estimatedRaus * srFee
    const actSrRevenue = g.raus * srFee
    return {
      ...g, estimatedRaus, estSrRevenue, actSrRevenue,
      roas: g.spend > 0 ? actSrRevenue / g.spend : 0,
      estimatedRoas: g.spend > 0 ? estSrRevenue / g.spend : 0,
    }
  }, [srFee])

  const groupedWithRevenue = useMemo(() => grouped.map(withSrRevenue), [grouped, withSrRevenue])

  const maxSourceLeads = bySource.length ? Math.max(...bySource.map(s => s.leads)) : 1
  const totalSourceLeads = bySource.reduce((t, s) => t + s.leads, 0)

  // Source view's expand-on-click tree: for every Source, its Sub Sources (each carrying
  // its own Campaigns), aggregated straight from `filtered` -- kept as a SEPARATE structure
  // from `grouped`/`groupedWithRevenue` rather than replacing them, so totals/exports/sort/
  // search over the top-level Source rows are completely unaffected; this only feeds the
  // expand/collapse rows rendered inside the Source view's table body.
  const sourceSubBreakdown = useMemo(() => {
    if (grpBy !== 'source') return null
    const blank = () => ({ paidLeads:0, paidQL:0, paidApps:0, leads:0, queued:0, floorQueued:0, futworkHumanQ:0, futworkAiQ:0, superbotQ:0, humanQL:0, futworkAiQl:0, superbotAiQl:0, totalQL:0, apps:0, offers:0, deposits:0, raus:0, spend:0 })
    const add = (e, r) => {
      e.leads += r.leads; e.queued += r.futworkHumanQ + r.futworkAiQ + r.superbotQ; e.humanQL += r.humanQL
      e.floorQueued += r.floorQueued; e.futworkHumanQ += r.futworkHumanQ; e.futworkAiQ += r.futworkAiQ; e.superbotQ += r.superbotQ
      e.futworkAiQl += r.futworkAiQl; e.superbotAiQl += r.superbotAiQl; e.totalQL += r.totalQL
      e.apps += r.apps; e.offers += r.offers; e.deposits += r.deposits; e.raus += r.raus; e.spend += r.spend
      if (paidSources.has(r.source)) { e.paidLeads += r.leads; e.paidQL += r.totalQL; e.paidApps += r.apps }
    }
    const bySrc = new Map()
    filtered.forEach(r => {
      if (!bySrc.has(r.source)) bySrc.set(r.source, new Map())
      const subMap = bySrc.get(r.source)
      const subKey = r.subSource || 'Unknown'
      if (!subMap.has(subKey)) subMap.set(subKey, { label:subKey, ...blank(), campaigns: new Map() })
      const ss = subMap.get(subKey)
      add(ss, r)
      const campKey = r.campaign || '(no campaign)'
      if (!ss.campaigns.has(campKey)) ss.campaigns.set(campKey, { label:campKey, ...blank() })
      add(ss.campaigns.get(campKey), r)
    })
    const out = new Map()
    bySrc.forEach((subMap, source) => {
      out.set(source, [...subMap.values()].map(ss => ({
        ...withSrRevenue(ss),
        campaigns: [...ss.campaigns.values()].map(withSrRevenue).sort((a, b) => b.leads - a.leads),
      })).sort((a, b) => b.leads - a.leads))
    })
    return out
  }, [grpBy, filtered, paidSources, withSrRevenue])

  const displayCols = useMemo(() => (
    colOrder.filter(k => visibleCols.includes(k))
      // Corridor/Source/Sub Source only carry a value when grouping by campaign -- every
      // other grouping either has no such field on the row (source view's own label already
      // IS the source) or would just be noise (a column of "—" everywhere).
      .filter(k => (k !== 'corridor' && k !== 'source' && k !== 'subSource') || grpBy === 'campaign')
      .map(k => SUMMARY_COLUMNS.find(c => c.key === k)).filter(Boolean)
  ), [colOrder, visibleCols, grpBy])

  // Sorted + search-filtered, but NOT sliced to the on-screen row limit -- this is the set
  // that export should always draw from, so "Show 10/25/50" (a display-density control) never
  // silently truncates what you download. tableRows (below) slices this for on-screen display.
  // Sub Source/Campaign rows revealed by expanding a Source are NOT part of this set -- search,
  // sort and the row limit only ever apply to the top-level rows, matching how "Show N" and
  // search already only counted top-level rows before this feature existed.
  const sortedFilteredRows = useMemo(() => {
    let rs = groupedWithRevenue
    const q = tableSearch.trim().toLowerCase()
    if (q) rs = rs.filter(g => g.label.toLowerCase().includes(q))
    return [...rs].sort((a, b) => {
      if (sortKey === 'label') {
        // Day/Month views sort chronologically by the underlying date key / month key --
        // NOT the display label. "Apr'26"/"Aug'26"/"Mar'26" alphabetize to a scrambled
        // order (Apr, Aug, Dec, Feb, Jan...) that has nothing to do with real time.
        const cmp = (a.dateKey && b.dateKey) ? a.dateKey.localeCompare(b.dateKey)
          : (a.mk != null && b.mk != null) ? a.mk - b.mk
          : a.label.localeCompare(b.label)
        return sortDir === 'asc' ? cmp : -cmp
      }
      if (sortKey === 'corridor' || sortKey === 'source' || sortKey === 'subSource') {
        const cmp = (a[sortKey] || '').localeCompare(b[sortKey] || '')
        return sortDir === 'asc' ? cmp : -cmp
      }
      // Contribution % of any row is (its metric value / a fixed grand total) -- dividing
      // every row by the same positive constant never changes relative order, so sorting by
      // it is exactly sorting by the raw metric. This also sidesteps a real circularity: the
      // grand total (totalsRow, below) is itself built FROM this sorted array.
      if (sortKey === 'contribPct') {
        const av = summaryValue(a, contribMetric) || 0, bv = summaryValue(b, contribMetric) || 0
        return sortDir === 'asc' ? av - bv : bv - av
      }
      const av = summaryValue(a, sortKey), bv = summaryValue(b, sortKey)
      const an = av == null ? -Infinity : av, bn = bv == null ? -Infinity : bv
      return sortDir === 'asc' ? an - bn : bn - an
    })
  }, [groupedWithRevenue, tableSearch, sortKey, sortDir, contribMetric])

  const tableRows = useMemo(() => (
    rowLimit === 'all' ? sortedFilteredRows : sortedFilteredRows.slice(0, rowLimit)
  ), [sortedFilteredRows, rowLimit])

  // Totals row. Deliberately built over sortedFilteredRows (every row matching the
  // current search) rather than tableRows, so the "Show 10/25/50" display-density
  // control can never make the total silently under-report.
  //
  // Only genuinely additive fields are summed. Every ratio -- the three conversion
  // percentages, CPL/CPQL/CPA and both ROAS figures -- is RE-DERIVED from those summed
  // totals, because averaging per-row ratios gives a different (and wrong) answer:
  // a source with 3 leads and one with 30,000 would count equally.
  const SUMMARY_ADDITIVE_KEYS = ['leads', 'queued', 'floorQueued', 'futworkHumanQ', 'futworkAiQ', 'superbotQ',
    'humanQL', 'futworkAiQl', 'superbotAiQl',
    'totalQL', 'apps', 'offers', 'deposits', 'raus', 'spend', 'estimatedRaus',
    'estSrRevenue', 'actSrRevenue',
    // summed so the TOTAL row's CPL/CPQL/CPA derive off paid activity, matching the KPI cards
    'paidLeads', 'paidQL', 'paidApps']
  const aggregateRows = useCallback((rows, label) => {
    const t = { label, corridor: null }
    SUMMARY_ADDITIVE_KEYS.forEach(k => {
      t[k] = rows.reduce((sum, g) => sum + (Number(g[k]) || 0), 0)
    })
    t.roas = t.spend > 0 ? t.actSrRevenue / t.spend : 0
    t.estimatedRoas = t.spend > 0 ? t.estSrRevenue / t.spend : 0
    return t
  }, [])
  const totalsRow = useMemo(() => aggregateRows(sortedFilteredRows, 'TOTAL'), [aggregateRows, sortedFilteredRows])

  // Contribution %'s grand total for whichever metric is currently picked (default Leads).
  // A row's contribution is its own metric value divided by this fixed constant -- computed
  // once here so every render site (table cells, band row, TOTAL row, Sub Source/Campaign
  // tree rows, exports) reads the exact same denominator and can never disagree with each
  // other. summaryValue(totalsRow, key) already IS the correct grand total, since totalsRow
  // sums every additive field across the full search-filtered set.
  const contribTotal = summaryValue(totalsRow, contribMetric)
  const valueWithContrib = useCallback((g, key) => {
    if (key === 'contribPct') {
      const num = summaryValue(g, contribMetric)
      if (num == null || !contribTotal) return null
      return (num / contribTotal) * 100
    }
    return summaryValue(g, key)
  }, [contribMetric, contribTotal])

  // Paid / Non-Paid banding, source view only. Band subtotals are computed over
  // the whole filtered set -- like TOTAL, and unlike the "Show N" slice -- so a
  // band can never silently under-report what is above it.
  //
  // Source view additionally nests each Source's Sub Sources (and each Sub Source's
  // Campaigns) as expand-on-click rows, sourced from sourceSubBreakdown -- click state
  // lives in expandedSources/expandedSubSources. Sub Source/Campaign rows are NOT part of
  // tableRows/sortedFilteredRows (they're revealed on demand, not searched/sorted/limited),
  // so they're spliced in here purely for rendering.
  const tableBodyRows = useMemo(() => {
    const flat = tableRows.map((row, i) => ({ kind: 'row', row, i }))
    if (grpBy !== 'source') return flat
    const out = []
    ;[['Paid Channels', true], ['Non-Paid Channels', false]].forEach(([name, wantPaid]) => {
      const shown = tableRows.filter(r => isPaidSource(r.label) === wantPaid)
      if (!shown.length) return
      const all = sortedFilteredRows.filter(r => isPaidSource(r.label) === wantPaid)
      out.push({ kind: 'band', label: name, row: aggregateRows(all, name) })
      shown.forEach((row, i) => {
        out.push({ kind: 'source', row, i })
        if (!expandedSources.has(row.label)) return
        const subs = sourceSubBreakdown?.get(row.label) || []
        subs.forEach(ss => {
          const hasCampaigns = ss.campaigns.length > 0
          const subKey = row.label + '||' + ss.label
          out.push({ kind: 'subsource', row: ss, parentSource: row.label, hasCampaigns })
          if (hasCampaigns && expandedSubSources.has(subKey)) {
            ss.campaigns.forEach(camp => out.push({ kind: 'campaign', row: camp, parentKey: subKey }))
          }
        })
      })
    })
    return out
  }, [grpBy, tableRows, sortedFilteredRows, aggregateRows, expandedSources, expandedSubSources, sourceSubBreakdown])

  // Exports the FULL search-filtered/sorted set, not just the on-screen "Show N" slice --
  // the row-limit control is a display density preference, not a data cap. Deliberately the
  // top-level rows only (not expanded Sub Source/Campaign detail) -- same scope the table's
  // search/sort/row-limit already had before the Source tree existed.
  const tableExportRows = useMemo(() => sortedFilteredRows.map(g => {
    const o = { [grpByLabel]: g.label }
    displayCols.forEach(c => { o[c.label] = summaryFmt(c.key, valueWithContrib(g, c.key)) })
    return o
  }), [sortedFilteredRows, displayCols, grpByLabel, valueWithContrib])

  // Exports lead with the same TOTAL the table shows, built from totalsRow through the very
  // same formatters -- so a downloaded file can't disagree with what's on screen.
  const tableTotalExportRow = useMemo(() => {
    const o = { [grpByLabel]: 'TOTAL' }
    displayCols.forEach(c => { o[c.label] = summaryFmt(c.key, valueWithContrib(totalsRow, c.key)) })
    return o
  }, [totalsRow, displayCols, grpByLabel, valueWithContrib])

  // Unformatted twin of the table export: same columns and order, but the underlying
  // numbers rather than display strings, so a spreadsheet can sum/sort them. Percentages
  // stay as plain numbers (15.7, not "15.7%") and a "—" becomes an empty cell.
  const rawExportRow = (g, label) => {
    const o = { [grpByLabel]: label ?? g.label }
    displayCols.forEach(c => {
      const v = valueWithContrib(g, c.key)
      o[c.label] = v == null ? '' : (typeof v === 'number' ? Number(v.toFixed(2)) : v)
    })
    return o
  }
  const tableExportRowsRaw = useMemo(() => sortedFilteredRows.map(g => rawExportRow(g)),
    [sortedFilteredRows, displayCols, grpByLabel, valueWithContrib])
  const tableTotalExportRowRaw = useMemo(() => rawExportRow(totalsRow, 'TOTAL'),
    [totalsRow, displayCols, grpByLabel, valueWithContrib])

  // Slack share for this table. Slack has no table primitive and its text blocks cap at
  // 3000 characters, so a 24-column funnel summary can only cross over truthfully as a
  // picture of the real table plus the full CSV. The row limit is lifted to "all" for the
  // capture and restored right after, so the image always carries every row the current
  // filters matched -- never just the visible 25.
  const tableRef = useRef(null)
  // Non-null only for the one paint the Slack image is captured from.
  const [captureCols, setCaptureCols] = useState(null)
  const [slackPanelOpen, setSlackPanelOpen] = useState(false)

  // The columns a CEO actually reads, when they are on screen at all.
  const ceoCols = useMemo(() => displayCols.filter(c => CEO_IMAGE_KEYS.includes(c.key)), [displayCols])
  const shareCols = ceoCols.length ? ceoCols : displayCols

  const periodLabel = useMemo(() => (
    activeFilter === 'custom' && customFrom ? customFrom + ' to ' + customTo
      : activeFilter === 'preset' && dateWindow ? dateWindow.label
        : (selMonth || 'All time')
  ), [activeFilter, customFrom, customTo, dateWindow, selMonth])

  const filterLine = useMemo(() => (
    'Filtered by -> ' + [periodLabel, 'Source: ' + sourceLabel, 'Corridor: ' + corridorFilter].join('  \u00b7  ')
  ), [periodLabel, selectedSources, sourceLabel, corridorFilter])

  // Slack's own table block caps a row at 20 cells, so it carries the CEO column set.
  // Every ROW is included, banded into Paid / Non-Paid with a subtotal each; the CSV
  // alongside still carries all 23 metric columns.
  const slackTable = useMemo(() => {
    // Share of spend, as a column rather than a pie. It is one number per row, the
    // reader is already looking at the row, and a column survives a phone screen
    // where a second image to load does not.
    const totalSpend = Number(summaryValue(totalsRow, 'spend')) || 0
    const cols = []
    shareCols.forEach(c => {
      cols.push(c)
      if (c.key === 'spend') cols.push({ key:'__spendShare', label:'% of spend' })
    })
    const cell = (g, c) => {
      if (c.key !== '__spendShare') return summaryFmt(c.key, summaryValue(g, c.key))
      const v = Number(summaryValue(g, 'spend')) || 0
      return totalSpend > 0 ? ((v / totalSpend) * 100).toFixed(1) + '%' : '\u2014'
    }
    const t = { columns: [grpByLabel, ...cols.map(c => c.label)], rows: [], strongRows: [] }
    const push = (label, g, strong) => {
      if (strong) t.strongRows.push(t.rows.length)
      t.rows.push([label, ...cols.map(c => cell(g, c))])
    }
    push('TOTAL', totalsRow, true)
    const bands = grpBy === 'source' ? [['Paid Channels', true], ['Non-Paid Channels', false]] : [[null, null]]
    bands.forEach(([band, wantPaid]) => {
      const rows = band === null ? sortedFilteredRows : sortedFilteredRows.filter(r => isPaidSource(r.label) === wantPaid)
      if (!rows.length) return
      if (band) push(band.toUpperCase(), aggregateRows(rows, band), true)
      rows.forEach(g => push(g.label, g, false))
    })
    return t
  }, [grpByLabel, shareCols, totalsRow, grpBy, sortedFilteredRows, aggregateRows])

  // Everything the Slack report builders need, and nothing they could invent. Deltas
  // reuse the same previous-equivalent-period basis as the KPI cards, so a sentence in
  // Slack can never disagree with an arrow on this page. Floor-queued is deliberately
  // absent everywhere: it produces no QLs of its own, so it is not part of the story.
  // ── Report-only breakdowns, with the previous equivalent period joined on ────
  // The page's own byCorridor / byCampaign only ever cover the CURRENT period and
  // every source. A report that quotes movement needs the same shapes for both
  // periods, and corridors are only meaningful on the two channels whose campaign
  // names actually carry one -- affiliate and organic names do not, so including
  // them would rank a corridor called Unclassified against real ones. Cost metrics
  // keep the page's paid-only denominators, so nothing here can disagree with a
  // number on screen.
  const CORRIDOR_SCOPE_LABEL = 'Facebook + Google'
  const corridorScopeSet = useMemo(() => new Set(['facebook', 'google']), [])
  const prevPaidSources = useMemo(() => {
    const s = new Set()
    prevFiltered.forEach(r => { if (r.spend > 0) s.add(r.source) })
    return s
  }, [prevFiltered])

  const aggReport = useCallback((list, keyFn, paidSet) => {
    const m = new Map()
    list.forEach(r => {
      const k = keyFn(r)
      if (k == null || k === '') return
      const e = m.get(k) || { label:k, leads:0, queued:0, totalQL:0, apps:0, offers:0, deposits:0, raus:0, spend:0, paidLeads:0, paidQL:0, paidApps:0 }
      e.leads += r.leads; e.queued += r.futworkHumanQ + r.futworkAiQ + r.superbotQ; e.totalQL += r.totalQL
      e.apps += r.apps; e.offers += r.offers; e.deposits += r.deposits; e.raus += r.raus; e.spend += r.spend
      if (paidSet.has(r.source)) { e.paidLeads += r.leads; e.paidQL += r.totalQL; e.paidApps += r.apps }
      m.set(k, e)
    })
    return [...m.values()].map(e => ({
      ...e,
      cpl: e.paidLeads > 0 ? e.spend / e.paidLeads : null,
      cpql: e.paidQL > 0 ? e.spend / e.paidQL : null,
      cpa: e.paidApps > 0 ? e.spend / e.paidApps : null,
    }))
  }, [])

  // A row with no match in the previous period carries prev:null, which the report
  // prints as "new" rather than inventing a movement against zero.
  const joinPrev = useCallback((cur, prev) => {
    const m = new Map(prev.map(x => [x.label, x]))
    return cur.map(c => {
      const x = m.get(c.label)
      return { ...c, prev: x ? { spend:x.spend, leads:x.leads, totalQL:x.totalQL, apps:x.apps, cpl:x.cpl, cpql:x.cpql, cpa:x.cpa } : null }
    })
  }, [])

  const reportCmp = useMemo(() => {
    const corridorOf = r => corridorLabel(classifyCorridor(r.campaign))
    const inScope = r => corridorScopeSet.has(String(r.source || '').toLowerCase())
    const tagCorridor = rowsIn => rowsIn.map(c => ({ ...c, corridor: corridorLabel(classifyCorridor(c.label)) }))
    return {
      channels: joinPrev(
        aggReport(filtered, r => r.source, paidSources),
        aggReport(prevFiltered, r => r.source, prevPaidSources)),
      corridors: joinPrev(
        aggReport(filtered.filter(inScope), corridorOf, paidSources),
        aggReport(prevFiltered.filter(inScope), corridorOf, prevPaidSources)),
      ads: joinPrev(
        tagCorridor(aggReport(filtered, r => r.campaign, paidSources)),
        aggReport(prevFiltered, r => r.campaign, prevPaidSources)),
      corridorScope: CORRIDOR_SCOPE_LABEL,
    }
  }, [filtered, prevFiltered, paidSources, prevPaidSources, aggReport, joinPrev, corridorScopeSet])

  // What the deltas are measured against, spelled out, so every Slack message can
  // print it instead of leaving the reader to assume which period it is.
  const prevLabel = useMemo(() => {
    if (!prevWindow) return null
    if (prevWindow.type === 'month') return monthLabel(prevWindow.mk)
    return dayLabel(prevWindow.from) + ' to ' + dayLabel(prevWindow.to)
  }, [prevWindow])

  // --- Day-level windows for the three-message v2 report --------------------
  // "Yesterday" has to mean yesterday whatever month is picked on screen, so
  // these windows ignore the date filter. Every other filter (source, corridor,
  // campaign search) still applies, so the numbers agree with the page.
  const dayKeyOf = (d) => {
    if (!d) return ''
    const pad = n => (n < 10 ? '0' : '') + n
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
  }
  const dayLabelOf = (d) => d.toLocaleDateString('en-IN', { day:'numeric', month:'short' }) + "'" + String(d.getFullYear()).slice(2)

  const nonDateRows = useMemo(() => {
    let rs = rows
    if (!sourceIsAll) rs = rs.filter(matchesSource)
    if (corridorFilter !== 'All') rs = rs.filter(r => corridorLabel(classifyCorridor(r.campaign)) === corridorFilter)
    const q = campaignQueryDebounced.trim().toLowerCase()
    if (q) rs = rs.filter(r => r.campaign.toLowerCase().includes(q))
    return rs
  }, [rows, selectedSources, corridorFilter, campaignQueryDebounced])

  // "Month-on-month trend" chart is meant to always show the last 5 months (including
  // whatever the current month is) so it reads as a real trend line -- unlike every
  // other chart/KPI on this page, it deliberately does NOT follow the header's
  // date-range picker (Source/Corridor/campaign-search filters still apply, so it stays
  // consistent with the rest of the page on those axes).
  //
  // B2 fix: in BQ mode, nonDateRows only ever holds whatever narrow window the main
  // page's own selection fetched -- reading it here silently drew fabricated zeros for
  // any of the trailing 5 months that fell outside that window (the fetch that WOULD
  // cover them is monthTrendBqRows, above, on its own independent schedule). Apply the
  // exact same three filters nonDateRows applies, just against that separately-fetched
  // dataset, so this card and the rest of the page can never disagree about what
  // "Source: X" or a campaign search means -- only which rows they're drawn from.
  const monthTrendRows = useMemo(() => {
    if (!bqActive) return nonDateRows
    let rs = monthTrendBqRows
    if (!sourceIsAll) rs = rs.filter(matchesSource)
    if (corridorFilter !== 'All') rs = rs.filter(r => corridorLabel(classifyCorridor(r.campaign)) === corridorFilter)
    const q = campaignQueryDebounced.trim().toLowerCase()
    if (q) rs = rs.filter(r => r.campaign.toLowerCase().includes(q))
    return rs
  }, [bqActive, monthTrendBqRows, nonDateRows, sourceIsAll, selectedSources, corridorFilter, campaignQueryDebounced])
  const monthTrend = useMemo(() => {
    const m = new Map()
    monthTrendRows.forEach(r => {
      if (r.mk == null) return
      const e = m.get(r.mk) || { mk:r.mk, label:monthLabel(r.mk), leads:0, queued:0, totalQL:0, deposits:0 }
      e.leads += r.leads; e.queued += r.futworkHumanQ + r.futworkAiQ + r.superbotQ; e.totalQL += r.totalQL; e.deposits += r.deposits
      m.set(r.mk, e)
    })
    return [...m.values()].sort((a, b) => a.mk - b.mk).slice(-5)
  }, [monthTrendRows])

  // ── Deep Analysis shared plumbing ─────────────────────────────────────────────
  // One generic aggregator, keyed by dimension, used by BOTH Compare's full table
  // and Trend Analysis' per-bucket breakdown -- so "what does 'corridor' mean" can
  // never drift between the two features (or from the main summary table's own
  // grouping above, which this deliberately mirrors field-for-field).
  const paidOf = useCallback(list => {
    const s = new Set(); list.forEach(r => { if (r.spend > 0) s.add(r.source) }); return s
  }, [])
  const aggReportByDim = useCallback((list, dim, paidSet) => {
    const keyFn = dim === 'source' ? (r => r.source || 'Unknown')
      : dim === 'campaign' ? (r => r.campaign || '(no campaign)')
      : dim === 'corridor' ? (r => classifyCorridor(r.campaign))
      : dim === 'month' ? (r => r.mk == null ? null : r.mk)
      : (r => r.date ? dayKey(r.date) : null) // 'day'
    const labelFn = dim === 'corridor' ? corridorLabel : dim === 'month' ? monthLabel : (k => k)
    const m = new Map()
    list.forEach(r => {
      const k = keyFn(r)
      if (k == null || k === '') return
      const e = m.get(k) || {
        key: k, label: labelFn(k),
        corridor: dim === 'campaign' ? corridorLabel(classifyCorridor(r.campaign)) : null,
        leads:0, queued:0, humanQL:0, futworkAiQl:0, superbotAiQl:0, totalQL:0,
        apps:0, offers:0, deposits:0, raus:0, spend:0, paidLeads:0, paidQL:0, paidApps:0,
      }
      e.leads += r.leads; e.queued += r.futworkHumanQ + r.futworkAiQ + r.superbotQ; e.humanQL += r.humanQL
      e.futworkAiQl += r.futworkAiQl; e.superbotAiQl += r.superbotAiQl; e.totalQL += r.totalQL
      e.apps += r.apps; e.offers += r.offers; e.deposits += r.deposits; e.raus += r.raus; e.spend += r.spend
      if (paidSet.has(r.source)) { e.paidLeads += r.leads; e.paidQL += r.totalQL; e.paidApps += r.apps }
      m.set(k, e)
    })
    return [...m.values()]
  }, [])
  // Every additive field summed across a list of aggReportByDim-shaped entries --
  // used for bucket totals (Trend, month/day dimension) where there is no further
  // breakdown, just one grand total per period.
  const sumDeepEntries = list => {
    const t = { leads:0, queued:0, humanQL:0, futworkAiQl:0, superbotAiQl:0, totalQL:0, apps:0, offers:0, deposits:0, raus:0, spend:0, paidLeads:0, paidQL:0, paidApps:0 }
    list.forEach(e => { Object.keys(t).forEach(k => { t[k] += e[k] || 0 }) })
    return t
  }

  // Deep-analysis-only narrowing (see the state comment above) -- an ADDITIONAL
  // filter on top of whatever the page's own toolbar already applied, scoped only
  // to Compare/Trend so it never touches the KPIs/funnel/table on the page itself.
  const deepCorridorIsAll = deepCorridorFilter.length === 0 || deepCorridorFilter.includes('All')
  const deepSourceIsAll = deepSourceFilter.length === 0 || deepSourceFilter.includes('All')
  const deepCorridorSet = useMemo(() => new Set(deepCorridorFilter), [deepCorridorFilter])
  const deepSourceSet = useMemo(() => new Set(deepSourceFilter), [deepSourceFilter])
  const deepFilterActive = !deepCorridorIsAll || !deepSourceIsAll || deepCampaignQuery.trim() !== ''
  // The Campaign search box binds to the raw state (instant typing + instant
  // suggestions); matchesDeepFilter -- which re-filters every row of Compare/Trend's
  // dataset -- waits for the debounced value, so the visible lag while typing/picking
  // a campaign (which happens on every keystroke otherwise) is gone.
  const deepCampaignQueryDebounced = useDebouncedValue(deepCampaignQuery, 250)
  const matchesDeepFilter = useCallback(r => {
    if (!deepCorridorIsAll && !deepCorridorSet.has(corridorLabel(classifyCorridor(r.campaign)))) return false
    if (!deepSourceIsAll && !deepSourceSet.has(r.source)) return false
    const q = deepCampaignQueryDebounced.trim().toLowerCase()
    if (q && !(r.campaign || '').toLowerCase().includes(q)) return false
    return true
  }, [deepCorridorIsAll, deepCorridorSet, deepSourceIsAll, deepSourceSet, deepCampaignQueryDebounced])
  const clearDeepFilters = () => { setDeepCorridorFilter(['All']); setDeepSourceFilter(['All']); setDeepCampaignQuery('') }
  // Independent typeahead state for the deep-filter's own Campaign search box --
  // separate from the page's own campaignQuery/campaignSuggestions so the two
  // don't fight over one input.
  const deepCampaignSuggestions = useMemo(() => {
    const q = deepCampaignQuery.trim().toLowerCase()
    const list = q ? campaignOptions.filter(c => c.name.toLowerCase().includes(q)) : campaignOptions
    return list.slice(0, 8)
  }, [campaignOptions, deepCampaignQuery])

  const compareJoinable = DEEP_JOINABLE_DIMS.has(compareTableDim)

  // Full, UNCAPPED comparison -- every corridor/source/campaign that appears in
  // either period, not just the top-5 "what's driving it" movers above. Sorted by
  // |Δ Total QL| by default so the biggest movements still surface first.
  // The deep-filter narrows BOTH periods' rows before aggregation -- e.g. Source
  // filter='Facebook' means the full breakdown reads only Facebook's rows for
  // *both* the current and comparison period, not just one side.
  const periodARowsDeep = useMemo(() => periodARows.filter(matchesDeepFilter), [periodARows, matchesDeepFilter])
  const compareRowsDeep = useMemo(() => compareRows.filter(matchesDeepFilter), [compareRows, matchesDeepFilter])

  const compareTableRows = useMemo(() => {
    if (!compareOpen || !compareJoinable || compareRowsDeep.length === 0 || periodARowsDeep.length === 0) return []
    const a = aggReportByDim(periodARowsDeep, compareTableDim, paidOf(periodARowsDeep))
    const b = aggReportByDim(compareRowsDeep, compareTableDim, paidOf(compareRowsDeep))
    const bMap = new Map(b.map(x => [x.key, x]))
    const aKeys = new Set(a.map(x => x.key))
    const rowsOut = a.map(x => ({ label: x.label, a: x, b: bMap.get(x.key) || null }))
    // Rows that only exist in period B (e.g. a corridor active last month, silent
    // this month) still belong in an exhaustive export -- a delta report that only
    // shows what's still running would hide exactly the campaigns that stopped.
    b.forEach(x => { if (!aKeys.has(x.key)) rowsOut.push({ label: x.label, a: null, b: x }) })
    return rowsOut.sort((x, y) => {
      const dx = Math.abs((x.a?.totalQL || 0) - (x.b?.totalQL || 0))
      const dy = Math.abs((y.a?.totalQL || 0) - (y.b?.totalQL || 0))
      return dy - dx
    })
  }, [compareOpen, compareJoinable, compareRowsDeep, periodARowsDeep, compareTableDim, aggReportByDim, paidOf])

  // Day/Month dimension: period A's dates and period B's dates essentially never
  // coincide (different ranges), so there is nothing real to join row-for-row.
  // Shown instead as two independent, fully-detailed breakdowns.
  const compareBreakdownA = useMemo(() => {
    if (!compareOpen || compareJoinable || periodARowsDeep.length === 0) return []
    return aggReportByDim(periodARowsDeep, compareTableDim, paidOf(periodARowsDeep)).sort((x, y) => (x.key > y.key ? 1 : -1))
  }, [compareOpen, compareJoinable, periodARowsDeep, compareTableDim, aggReportByDim, paidOf])
  const compareBreakdownB = useMemo(() => {
    if (!compareOpen || compareJoinable || compareRowsDeep.length === 0) return []
    return aggReportByDim(compareRowsDeep, compareTableDim, paidOf(compareRowsDeep)).sort((x, y) => (x.key > y.key ? 1 : -1))
  }, [compareOpen, compareJoinable, compareRowsDeep, compareTableDim, aggReportByDim, paidOf])

  // Exact export rows for Compare -- raw (unrounded) numbers for every metric,
  // both periods, plus the delta, so the download can never disagree with what a
  // spreadsheet computes on its own.
  const compareExportRows = useMemo(() => {
    const dimLabel = DEEP_DIMENSIONS.find(d => d.key === compareTableDim)?.label || compareTableDim
    if (compareJoinable) {
      return compareTableRows.map(r => {
        const o = { [dimLabel]: r.label }
        DEEP_METRICS.forEach(m => {
          const av = r.a ? summaryValue(r.a, m.key) : null
          const bv = r.b ? summaryValue(r.b, m.key) : null
          o[m.label + ' (' + currentLabel + ')'] = av
          o[m.label + ' (' + compareLabel + ')'] = bv
          o[m.label + ' Δ'] = (av != null && bv != null) ? av - bv : null
          o[m.label + ' Δ%'] = (av != null && bv != null && bv !== 0) ? ((av - bv) / bv) * 100 : null
        })
        return o
      })
    }
    const row = (period, e) => {
      const o = { Period: period, [dimLabel]: e.label }
      DEEP_METRICS.forEach(m => { o[m.label] = summaryValue(e, m.key) })
      return o
    }
    return [
      ...compareBreakdownA.map(e => row(currentLabel, e)),
      ...compareBreakdownB.map(e => row(compareLabel, e)),
    ]
  }, [compareJoinable, compareTableRows, compareBreakdownA, compareBreakdownB, compareTableDim, currentLabel, compareLabel])
  // Formatted twin of the same rows, for the human-readable CSV/JSON -- exact
  // numbers live in compareExportRows above (ExportButton's rawData).
  const compareExportRowsFmt = useMemo(() => compareExportRows.map(r => {
    const o = {}
    Object.entries(r).forEach(([k, v]) => {
      if (typeof v !== 'number') { o[k] = v; return }
      o[k] = k.endsWith('Δ%') ? (v.toFixed(1) + '%') : (k.includes('Spend') || k.includes('CPL') || k.includes('CPQL') || k.includes('CPA')) ? fmtINR(v) : fmtN(v)
    })
    return o
  }), [compareExportRows])

  // ── Trend Analysis ────────────────────────────────────────────────────────────
  // Deep-filtered base rows for the trend -- period BOUNDARIES still anchor off the
  // whole account's latest date (trendMaxDate, below, stays unfiltered) so narrowing
  // to e.g. Source=Facebook can't shift the window if Facebook's own last active day
  // happens to be earlier; only which ROWS land in each bucket is narrowed.
  const trendBaseRows = useMemo(() => nonDateRows.filter(matchesDeepFilter), [nonDateRows, matchesDeepFilter])

  // In BQ mode, anchor off the cache's own bounds (trendAnchorDate) rather than
  // scanning nonDateRows -- nonDateRows only ever holds whatever bqRange already
  // fetched, so on the render before that wider fetch lands, a scan would find the
  // OLD narrow window's latest date and build the wrong bucket boundaries entirely.
  const trendMaxDate = useMemo(() => {
    if (trendAnchorDate) return trendAnchorDate
    let max = null
    nonDateRows.forEach(r => { if (r.date && (!max || r.date > max)) max = r.date })
    return max
  }, [nonDateRows, trendAnchorDate])

  const trendBuckets = useMemo(() => {
    if (!trendOpen || !trendMaxDate) return []
    const out = []
    if (trendEffectiveGranularity === 'month') {
      const endMk = monthKey(trendMaxDate)
      for (let i = trendPeriods - 1; i >= 0; i--) {
        const mk = endMk - i
        out.push({ key: 'm' + mk, label: monthLabel(mk), from: monthStartDate(mk), to: monthEndDate(mk) })
      }
    } else if (trendEffectiveGranularity === 'week') {
      for (let i = trendPeriods - 1; i >= 0; i--) {
        const to = new Date(trendMaxDate); to.setDate(to.getDate() - i * 7); to.setHours(23, 59, 59, 999)
        const from = new Date(to); from.setDate(from.getDate() - 6); from.setHours(0, 0, 0, 0)
        out.push({ key: 'w' + dayKey(from), label: dayLabel(from) + '–' + dayLabel(to), from, to })
      }
    } else { // 'day'
      for (let i = trendPeriods - 1; i >= 0; i--) {
        const d = new Date(trendMaxDate); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0)
        const to = new Date(d); to.setHours(23, 59, 59, 999)
        out.push({ key: 'd' + dayKey(d), label: dayLabel(d), from: d, to })
      }
    }
    return out
  }, [trendOpen, trendMaxDate, trendEffectiveGranularity, trendPeriods])

  const trendResult = useMemo(() => {
    if (!trendOpen || !trendBuckets.length) return { chartRows: [], seriesKeys: [], seriesLabels: {}, exportRows: [], grandTotal: [], shownCount: 0, totalCount: 0 }
    const bucketRows = trendBuckets.map(b => trendBaseRows.filter(r => r.date && r.date >= b.from && r.date <= b.to))
    // Grand total per period -- the WHOLE bucket's rows summed (or re-derived, for a
    // cost ratio like CPQL) BEFORE any dimension breakdown, never the sum/average of
    // the already-split-out per-row values. Summing per-source CPLs, for instance,
    // would answer a different (and wrong) question than "what was the blended CPL
    // across every source that period" -- this is the same additive-vs-ratio
    // distinction the main summary table's own TOTAL row already respects.
    const grandTotal = bucketRows.map(rs => summaryValue(sumDeepEntries(aggReportByDim(rs, 'source', paidOf(rs))), trendMetric))

    if (trendIsSingleSeries) {
      const chartRows = trendBuckets.map((b, i) => ({ period: b.label, value: grandTotal[i] }))
      const exportRows = trendBuckets.map((b, i) => {
        const t = sumDeepEntries(aggReportByDim(bucketRows[i], 'source', paidOf(bucketRows[i])))
        const o = { Period: b.label }
        DEEP_METRICS.forEach(m => { o[m.label] = summaryValue(t, m.key) })
        return o
      })
      // periodIndexes: the bucket's own chronological position (0 = oldest), kept
      // OUT of the exported row object itself (it isn't a real column) so it can
      // drive a real chronological sort on "Period" -- clicking that header can't
      // just compare the display labels ("Apr'26"/"Aug'26"/"Mar'26" alphabetize to
      // Apr, Aug, Dec, Feb... which is not real time order).
      const periodIndexes = trendBuckets.map((b, i) => i)
      return { chartRows, seriesKeys: ['value'], seriesLabels: { value: DEEP_METRICS.find(m => m.key === trendMetric)?.label || trendMetric }, exportRows, periodIndexes, grandTotal, shownCount: 1, totalCount: 1 }
    }

    // Multi-series: rank every dimension value that appears anywhere in the window
    // by its total volume (Total QL, the same yardstick the page's own "top
    // campaigns" lists use), chart only the top 8 so the legend stays legible --
    // but the export below carries every value with no cap, and states the count
    // that didn't make the chart rather than silently dropping them.
    const perBucket = bucketRows.map((rs, i) => aggReportByDim(rs, trendDim, paidOf(rs)))
    const totals = new Map()
    perBucket.forEach(entries => entries.forEach(e => {
      const t = totals.get(e.key) || { key:e.key, label:e.label, totalQL:0 }
      t.totalQL += e.totalQL
      totals.set(e.key, t)
    }))
    const ranked = [...totals.values()].sort((a, b) => b.totalQL - a.totalQL)
    const shown = ranked.slice(0, 8)
    const seriesLabels = {}
    shown.forEach(s => { seriesLabels[s.key] = s.label })

    const chartRows = trendBuckets.map((b, i) => {
      const row = { period: b.label }
      const byKey = new Map(perBucket[i].map(e => [e.key, e]))
      shown.forEach(s => { const e = byKey.get(s.key); row[s.key] = e ? summaryValue(e, trendMetric) : 0 })
      return row
    })

    const dimLabel = DEEP_DIMENSIONS.find(d => d.key === trendDim)?.label || trendDim
    const exportRows = []
    const periodIndexes = []
    trendBuckets.forEach((b, i) => {
      perBucket[i].forEach(e => {
        const o = { Period: b.label, [dimLabel]: e.label }
        DEEP_METRICS.forEach(m => { o[m.label] = summaryValue(e, m.key) })
        exportRows.push(o)
        periodIndexes.push(i)
      })
    })
    return { chartRows, seriesKeys: shown.map(s => s.key), seriesLabels, exportRows, periodIndexes, grandTotal, shownCount: shown.length, totalCount: ranked.length }
  }, [trendOpen, trendBuckets, trendBaseRows, trendIsSingleSeries, trendDim, trendMetric, aggReportByDim, paidOf])

  const trendExportRowsFmt = useMemo(() => trendResult.exportRows.map(r => {
    const o = {}
    Object.entries(r).forEach(([k, v]) => {
      if (typeof v !== 'number') { o[k] = v; return }
      o[k] = (k === 'Spend' || k === 'CPL' || k === 'CPQL' || k === 'CPA') ? fmtINR(v) : fmtN(v)
    })
    return o
  }), [trendResult.exportRows])

  // Pivoted on-screen table -- periods across the top, one row per dimension value
  // down the side (or a single "Total" row for month/day, which has no further
  // breakdown), cells holding whichever metric is currently picked. This is how a
  // trend actually gets read: one row scanned left-to-right across periods, not one
  // row per (period, value) pair scattered down a long list. The export stays in the
  // old long format regardless -- every metric, every row -- so nothing is lost by
  // the on-screen view only showing one metric at a time.
  const trendMetricDef = DEEP_METRICS.find(m => m.key === trendMetric) || DEEP_METRICS[0]
  const trendPivotDimLabel = trendIsSingleSeries ? '' : (DEEP_DIMENSIONS.find(d => d.key === trendDim)?.label || trendDim)
  const trendPivotRows = useMemo(() => {
    const periodCount = trendBuckets.length
    if (trendIsSingleSeries) {
      const values = trendBuckets.map((_, i) => trendResult.chartRows[i]?.value ?? null)
      return [{ label:'Total', values }]
    }
    const dimLabel = DEEP_DIMENSIONS.find(d => d.key === trendDim)?.label || trendDim
    const byLabel = new Map()
    trendResult.exportRows.forEach((r, i) => {
      const idx = trendResult.periodIndexes[i]
      const key = r[dimLabel]
      let arr = byLabel.get(key)
      if (!arr) { arr = new Array(periodCount).fill(null); byLabel.set(key, arr) }
      arr[idx] = r[trendMetricDef.label]
    })
    return [...byLabel.entries()].map(([label, values]) => ({ label, values }))
  }, [trendBuckets, trendIsSingleSeries, trendResult, trendDim, trendMetricDef])

  // Default sort: total across all periods, descending, so the biggest movers lead --
  // clicking the row-label header sorts alphabetically, clicking any period column
  // sorts by that period's value. Resets whenever the dimension/metric changes, since
  // a period-column sort key from a previous metric/dimension wouldn't mean the same
  // thing (or might not even exist at the new period count).
  const [trendPivotSortKey, setTrendPivotSortKey] = useState('__total')
  const [trendPivotSortDir, setTrendPivotSortDir] = useState('desc')
  useEffect(() => { setTrendPivotSortKey('__total'); setTrendPivotSortDir('desc') }, [trendDim, trendMetric])
  const handlePivotSort = key => {
    if (trendPivotSortKey === key) setTrendPivotSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setTrendPivotSortKey(key); setTrendPivotSortDir(key === 'label' ? 'asc' : 'desc') }
  }
  const trendPivotSorted = useMemo(() => {
    const rows = [...trendPivotRows]
    rows.sort((a, b) => {
      if (trendPivotSortKey === 'label') {
        const cmp = a.label.localeCompare(b.label)
        return trendPivotSortDir === 'asc' ? cmp : -cmp
      }
      const av = trendPivotSortKey === '__total' ? a.values.reduce((s, v) => s + (v || 0), 0) : a.values[trendPivotSortKey]
      const bv = trendPivotSortKey === '__total' ? b.values.reduce((s, v) => s + (v || 0), 0) : b.values[trendPivotSortKey]
      const an = av == null ? -Infinity : av, bn = bv == null ? -Infinity : bv
      return trendPivotSortDir === 'asc' ? an - bn : bn - an
    })
    return rows
  }, [trendPivotRows, trendPivotSortKey, trendPivotSortDir])

  // Only closed days count. Today is still filling up, and half a day sitting
  // next to a full one reads as a collapse that never happened.
  const daySeries = useMemo(() => {
    const m = new Map()
    for (const r of nonDateRows) {
      if (!r.date) continue
      const k = dayKeyOf(r.date)
      let e = m.get(k)
      if (!e) { e = { key:k, date:r.date, rows:[], act:0 }; m.set(k, e) }
      e.rows.push(r)
      e.act += (r.leads || 0) + (r.spend || 0)
    }
    const today = dayKeyOf(new Date())
    return [...m.values()].filter(e => e.key < today && e.act > 0).sort((a, b) => (a.key < b.key ? -1 : 1))
  }, [nonDateRows])

  // One banded comparison set: TOTAL, the paid band and its sources, then the
  // non-paid band and its sources, every row carrying its own previous figures.
  const cmpEntries = useCallback((curRows, prevRows) => {
    const paidOf = list => { const st = new Set(); list.forEach(r => { if (r.spend > 0) st.add(r.source) }); return st }
    const pc = paidOf(curRows)
    const pp = paidOf(prevRows)
    const band = (label, keep) => {
      const c = aggReport(curRows.filter(keep), () => label, pc)
      if (!c.length) return null
      return joinPrev(c, aggReport(prevRows.filter(keep), () => label, pp))[0]
    }
    const srcs = joinPrev(aggReport(curRows, r => r.source, pc), aggReport(prevRows, r => r.source, pp))
    const out = []
    const total = band('TOTAL', () => true)
    if (total) out.push({ label:'TOTAL', strong:true, g:total })
    const paidBand = band('PAID CHANNELS', r => isPaidSource(r.source))
    if (paidBand) out.push({ label:'PAID CHANNELS', strong:true, g:paidBand })
    srcs.filter(x => isPaidSource(x.label)).sort((a, b) => (b.spend || 0) - (a.spend || 0))
      .forEach(x => out.push({ label:x.label, strong:false, g:x }))
    const freeBand = band('NON-PAID CHANNELS', r => !isPaidSource(r.source))
    if (freeBand) out.push({ label:'NON-PAID CHANNELS', strong:true, g:freeBand })
    srcs.filter(x => !isPaidSource(x.label)).sort((a, b) => (b.leads || 0) - (a.leads || 0))
      .forEach(x => out.push({ label:x.label, strong:false, g:x }))
    return { rows: out, totalSpend: total ? (total.spend || 0) : 0 }
  }, [aggReport, joinPrev])

  const mtdCmp = useMemo(() => cmpEntries(filtered, prevFiltered), [cmpEntries, filtered, prevFiltered])

  const ydayCmp = useMemo(() => {
    const last = daySeries[daySeries.length - 1] || null
    if (!last) return null
    const prior = daySeries[daySeries.length - 2] || null
    const b = cmpEntries(last.rows, prior ? prior.rows : [])
    const total = b.rows.length ? b.rows[0].g : null
    const y = new Date()
    y.setDate(y.getDate() - 1)
    return {
      label: dayLabelOf(last.date),
      prevLabel: prior ? dayLabelOf(prior.date) : null,
      isYesterday: last.key === dayKeyOf(y),
      rows: b.rows,
      totalSpend: b.totalSpend,
      now: total,
      prev: total ? total.prev : null,
    }
  }, [daySeries, cmpEntries])

  // Day on day: the days inside the window on screen, each read against the
  // calendar day before it even when that day sits outside the window.
  const dowCmp = useMemo(() => {
    const inWindow = new Set()
    for (const r of filtered) { if (r.date) inWindow.add(dayKeyOf(r.date)) }
    const paidOf = list => { const st = new Set(); list.forEach(r => { if (r.spend > 0) st.add(r.source) }); return st }
    const out = []
    for (let i = 0; i < daySeries.length; i++) {
      const e = daySeries[i]
      if (!inWindow.has(e.key)) continue
      const label = dayLabelOf(e.date)
      const c = aggReport(e.rows, () => label, paidOf(e.rows))
      if (!c.length) continue
      const pr = daySeries[i - 1] || null
      const g = joinPrev(c, pr ? aggReport(pr.rows, () => label, paidOf(pr.rows)) : [])[0]
      out.push({ label, key: e.key, g })
    }
    return out.reverse().slice(0, 31)
  }, [daySeries, filtered, aggReport, joinPrev])

  // Cost per QL month on month. byMonth carries volume only, so the
  // cost series is aggregated separately over the same filtered rows.
  const costByMonth = useMemo(() => {
    const rows = aggReport(filtered, r => (r.mk == null ? null : r.mk), paidSources)
    return rows.map(r => ({
      mk: Number(r.label), label: monthLabel(Number(r.label)), spend: r.spend,
      cpql: r.cpql == null ? null : Math.round(r.cpql),
      cpl: r.cpl == null ? null : Math.round(r.cpl)
    })).sort((a, b) => a.mk - b.mk)
  }, [filtered, paidSources, aggReport])
  
  // The same one level down. Today is dropped on purpose: it is still
  // filling up, and half a day reads as a collapse that never happened.
  const costByDay = useMemo(() => {
    const t = dayKey(new Date())
    return (byDayFull || []).filter(d => d.key !== t).slice()
      .sort((a, b) => a.key.localeCompare(b.key))
      .map(d => ({
        label: d.label,
        cpql: d.paidQL > 0 ? Math.round(d.spend / d.paidQL) : null,
        cpl: d.paidLeads > 0 ? Math.round(d.spend / d.paidLeads) : null
      }))
  }, [byDayFull])
  
  // V5 report context. Built here rather than off the filtered rows for two reasons: V5 is
  // Facebook + Google only, measured against the 10 L a day budget, and it is complete days
  // only. daySeries already drops the current day, so nothing below can pick up a
  // half-finished today, and none of it moves when the date filter on screen changes.
  const v5Report = useMemo(() => {
    const BUDGET = 1000000
    const WINDOW = 30
    const SHOWN = 7
    const MIN_QUEUED = 25
    const TARGET_LOW = 550
    const TARGET_HIGH = 600
    const BREACH_MULT = 1.5
    const MIN_BREACH_SPEND = 25000
    const ZERO_QL_SPEND = 25000
    const SOURCES = new Set(['facebook', 'google'])
    const onPlatform = r => SOURCES.has(String(r.source || '').trim().toLowerCase())
    const queuedOf = r => (r.futworkHumanQ || 0) + (r.futworkAiQ || 0) + (r.superbotQ || 0)
    const roll = rows => {
      let spend = 0, leads = 0, totalQL = 0, queued = 0
      for (const r of rows) {
        spend += r.spend || 0; leads += r.leads || 0; totalQL += r.totalQL || 0
        queued += queuedOf(r)
      }
      return { spend, leads, totalQL, queued, cpql: totalQL > 0 ? spend / totalQL : null }
    }
    const rowsOf = src => src.reduce((acc, e) => acc.concat(e.rows.filter(onPlatform)), [])
    const groupBy = (rows, keyFn) => {
      const m = new Map()
      for (const r of rows) {
        const k = keyFn(r)
        if (!k) continue
        const e = m.get(k) || { label: k, spend: 0, leads: 0, totalQL: 0, queued: 0 }
        e.spend += r.spend || 0; e.leads += r.leads || 0; e.totalQL += r.totalQL || 0
        e.queued += queuedOf(r)
        m.set(k, e)
      }
      return [...m.values()].map(e => ({ ...e, cpql: e.totalQL > 0 ? e.spend / e.totalQL : null }))
    }
    const days = daySeries.map(e => ({ key: e.key, date: e.date, label: dayLabelOf(e.date), ...roll(e.rows.filter(onPlatform)) }))
    if (!days.length) return null
    const last = days[days.length - 1]
    const win = daySeries.slice(-WINDOW)
    const winRows = rowsOf(win)
    const winTot = roll(winRows)
    const blended = winTot.cpql
    // The qualifying track. A campaign only earns a cost per QL judgement if its leads were
    // actually sent for qualification: at least MIN_QUEUED of them reached Futwork or Superbot
    // inside the window. Campaigns routed straight to the floor never had a chance to produce a
    // QL, so a CPQL against them measures nothing at all. Every campaign and corridor list
    // below reads the qualifying track only, and message 1 states the rest of the spend on its
    // own line so the all-in CPQL still reconciles against the full budget.
    const queuedByCampaign = new Map()
    for (const r of winRows) {
      const k = (r.campaign || '').trim()
      if (!k) continue
      queuedByCampaign.set(k, (queuedByCampaign.get(k) || 0) + queuedOf(r))
    }
    const onTrack = r => (queuedByCampaign.get((r.campaign || '').trim()) || 0) >= MIN_QUEUED
    const trackRows = winRows.filter(onTrack)
    const trackTot = roll(trackRows)
    const trackCpql = trackTot.cpql
    const floorOnlySpend = winTot.spend - trackTot.spend
    const campaigns = groupBy(trackRows, r => (r.campaign || '').trim())
    const corridors = groupBy(trackRows, r => corridorLabel(classifyCorridor(r.campaign)))
    // Best optimised: enough QLs to be real, enough spend to be real, and cheaper than the
    // qualifying track average. The spend floor keeps out campaigns that carry QLs with no
    // spend attached, which would otherwise sit at the top of the list on a CPQL of zero.
    const qualifies = (c, base) => c.totalQL >= CORRIDOR_MIN_QL && c.spend >= MIN_BREACH_SPEND
      && c.cpql !== null && base !== null && c.cpql <= base
    const eligible = campaigns.filter(c => qualifies(c, trackCpql)).sort((a, b) => a.cpql - b.cpql)
    const eligSpend = eligible.reduce((s, c) => s + c.spend, 0)
    const eligQL = eligible.reduce((s, c) => s + c.totalQL, 0)
    const eligCpql = eligQL > 0 ? eligSpend / eligQL : null
    // The bonus benchmark is frozen on the 30 complete days that ended the moment this month
    // began, so it cannot drift day to day. It is the all-in CPQL of those days, because the
    // day being tested is also measured all-in: both sides of the test have to cover the same
    // spend or the comparison is not a comparison.
    const monthStartKey = dayKeyOf(new Date(last.date.getFullYear(), last.date.getMonth(), 1))
    const before = daySeries.filter(e => e.key < monthStartKey).slice(-WINDOW)
    const benchmarkFrozen = before.length >= 10
    const benchDays = benchmarkFrozen ? before : win
    const benchTot = roll(rowsOf(benchDays))
    const benchmarkCpql = benchTot.cpql
    const flagged = days.map((d, i) => {
      const prev = days.slice(Math.max(0, i - SHOWN), i)
      const avgQL = prev.length ? prev.reduce((s, x) => s + x.totalQL, 0) / prev.length : null
      const bonus = d.spend > 0 && d.spend < BUDGET && d.cpql !== null && benchmarkCpql !== null
        && d.cpql <= benchmarkCpql && avgQL !== null && d.totalQL >= avgQL
      return { ...d, avgQL, bonus }
    })
    // Ranked by the rupees a campaign spent above what the qualifying track would have charged
    // for the same QLs, so the list leads on money at stake rather than on a ratio. A campaign
    // on two QLs can post a huge multiple and still be a rounding error.
    const overLine = c => c.cpql !== null && trackCpql !== null
      && c.cpql > trackCpql * BREACH_MULT && c.spend >= MIN_BREACH_SPEND
    const withExcess = arr => arr
      .map(c => ({ ...c, excess: c.spend - c.totalQL * trackCpql }))
      .sort((a, b) => b.excess - a.excess)
    const breachCamp = withExcess(campaigns.filter(overLine))
    const breachCorr = withExcess(corridors.filter(overLine))
    return {
      budget: BUDGET, window: WINDOW, minQL: CORRIDOR_MIN_QL, minQueued: MIN_QUEUED,
      breachMult: BREACH_MULT, minBreachSpend: MIN_BREACH_SPEND, zeroQLFloor: ZERO_QL_SPEND,
      targetLow: TARGET_LOW, targetHigh: TARGET_HIGH,
      lastLabel: last.label,
      monthLabel: last.date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
      yday: flagged[flagged.length - 1],
      days: flagged.slice(-SHOWN).slice().reverse(),
      dayCount: Math.min(WINDOW, flagged.length),
      last7: roll(rowsOf(daySeries.slice(-SHOWN))),
      prev7: roll(rowsOf(daySeries.slice(-SHOWN * 2, -SHOWN))),
      bonus7: flagged.slice(-SHOWN).filter(d => d.bonus).length,
      bonus30: flagged.slice(-WINDOW).filter(d => d.bonus).length,
      blended, trackCpql, benchmarkCpql, benchmarkFrozen,
      benchmarkLabel: benchDays.length ? benchDays[0].key + ' to ' + benchDays[benchDays.length - 1].key : null,
      impliedQL: trackCpql > 0 ? BUDGET / trackCpql : null,
      winSpend: winTot.spend, winQL: winTot.totalQL,
      trackSpend: trackTot.spend, trackQL: trackTot.totalQL,
      trackCampaignCount: campaigns.length, floorOnlySpend,
      eligible, eligSpend, eligQL, eligCpql, campaigns, corridors,
      breachCamp, breachCorr,
      excessTotal: breachCamp.reduce((s, c) => s + c.excess, 0),
      zeroQL: campaigns.filter(c => c.totalQL === 0 && c.spend >= ZERO_QL_SPEND).sort((a, b) => b.spend - a.spend),
    }
  }, [daySeries])

  // V6 report context. Capacity arithmetic, kept for observation rather than for the CEO: if
  // the 10 L a day went to the cheapest qualifying campaigns first, and no campaign were
  // pushed past a daily spend it has already absorbed at least once, how many QLs would the
  // day produce? The ceiling per campaign is its 90th percentile daily spend across the
  // window, so every ceiling is a level that campaign actually reached rather than a
  // projection, and the answer stays inside what the accounts have already demonstrated.
  const v6Report = useMemo(() => {
    const BUDGET = 1000000
    const WINDOW = 30
    const RECENT = 7
    const MIN_QUEUED = 25
    const PCTL = 0.9
    const SOURCES = new Set(['facebook', 'google'])
    const onPlatform = r => SOURCES.has(String(r.source || '').trim().toLowerCase())
    const queuedOf = r => (r.futworkHumanQ || 0) + (r.futworkAiQ || 0) + (r.superbotQ || 0)
    const win = daySeries.slice(-WINDOW)
    if (!win.length) return null
    const lastDay = win[win.length - 1]
    const recentKeys = new Set(daySeries.slice(-RECENT).map(e => e.key))
    const byCamp = new Map()
    for (const e of win) {
      for (const r of e.rows) {
        if (!onPlatform(r)) continue
        const k = (r.campaign || '').trim()
        if (!k) continue
        const c = byCamp.get(k) || { label: k, spend: 0, totalQL: 0, queued: 0, days: new Map(), recent: false }
        c.spend += r.spend || 0
        c.totalQL += r.totalQL || 0
        c.queued += queuedOf(r)
        c.days.set(e.key, (c.days.get(e.key) || 0) + (r.spend || 0))
        if ((r.spend || 0) > 0 && recentKeys.has(e.key)) c.recent = true
        byCamp.set(k, c)
      }
    }
    // Only campaigns that were sent for qualification, produced QLs, carried spend, and were
    // still running in the last seven days. A campaign that stopped a fortnight ago cannot be
    // part of an answer about what tomorrow can deliver.
    const pool = [...byCamp.values()]
      .filter(c => c.queued >= MIN_QUEUED && c.totalQL > 0 && c.spend > 0 && c.recent)
      .map(c => {
        const daily = [...c.days.values()].filter(v => v > 0).sort((a, b) => a - b)
        const ceiling = daily.length ? (daily[Math.floor(daily.length * PCTL)] || daily[daily.length - 1]) : 0
        return {
          label: c.label, cpql: c.spend / c.totalQL, totalQL: c.totalQL,
          spend: c.spend, ceiling, activeDays: daily.length,
        }
      })
      .filter(c => c.ceiling > 0)
      .sort((a, b) => a.cpql - b.cpql)
    if (!pool.length) return null
    let left = BUDGET, modelQL = 0, used = 0
    const picks = []
    for (const c of pool) {
      if (left <= 0) break
      const allocated = Math.min(c.ceiling, left)
      const qlAt = allocated / c.cpql
      picks.push({ ...c, allocated, qlAt })
      modelQL += qlAt
      used += allocated
      left -= allocated
    }
    let actSpend = 0, actQL = 0
    for (const e of daySeries.slice(-RECENT)) {
      for (const r of e.rows) {
        if (!onPlatform(r)) continue
        actSpend += r.spend || 0
        actQL += r.totalQL || 0
      }
    }
    return {
      budget: BUDGET, window: WINDOW, recent: RECENT, minQueued: MIN_QUEUED,
      pctlLabel: '90th percentile',
      lastLabel: dayLabelOf(lastDay.date),
      poolCount: pool.length,
      usedCount: picks.length,
      modelQL, modelSpend: used, unspent: left,
      modelCpql: modelQL > 0 ? used / modelQL : null,
      picks: picks.slice(0, 12),
      actualQLPerDay: actQL / RECENT,
      actualSpendPerDay: actSpend / RECENT,
      actualCpql: actQL > 0 ? actSpend / actQL : null,
      headroomQL: modelQL - (actQL / RECENT),
    }
  }, [daySeries])

  const buildReportContext = useCallback(() => {
    const rate = (a, b) => (a > 0 ? (b / a) * 100 : null)
    const prevQueued = prevKpis.futworkHumanQ + prevKpis.futworkAiQ + prevKpis.superbotQ
    const prevChain = [
      rate(prevKpis.leads, prevQueued),
      rate(prevQueued, prevKpis.totalQL),
      rate(prevKpis.totalQL, prevKpis.apps),
      rate(prevKpis.apps, prevKpis.offers),
      rate(prevKpis.offers, prevKpis.deposits),
    ]
    const withCost = g => ({
      label: g.label, spend: g.spend, leads: g.leads, totalQL: g.totalQL, apps: g.apps, paidQL: g.paidQL,
      cpl: summaryValue(g, 'cpl'), cpql: summaryValue(g, 'cpql'), cpa: summaryValue(g, 'cpa'),
    })
    const paidRows = sortedFilteredRows.filter(r => isPaidSource(r.label))
    const freeRows = sortedFilteredRows.filter(r => !isPaidSource(r.label))
    return {
      grpByLabel, periodLabel, filterLine, rowCount: sortedFilteredRows.length,
      minQL: CORRIDOR_MIN_QL, fmtINR, fmtN,
      stat: key => summaryFmt(key, summaryValue(totalsRow, key)),
      num: key => Number(summaryValue(totalsRow, key)) || 0,
      d: {
        spend: deltaPct(kpis.spend, prevKpis.spend), leads: deltaPct(kpis.leads, prevKpis.leads),
        totalQL: deltaPct(kpis.totalQL, prevKpis.totalQL), apps: deltaPct(kpis.apps, prevKpis.apps),
        offers: deltaPct(kpis.offers, prevKpis.offers), deposits: deltaPct(kpis.deposits, prevKpis.deposits),
        raus: deltaPct(kpis.raus, prevKpis.raus),
        cpl: deltaPct(cpl, prevCpl), cpql: deltaPct(cpql, prevCpql), cpa: deltaPct(cpa, prevCpa),
      },
      chain: conversionChain.map((s, i) => ({ ...s, prevRate: prevChain[i] })),
      prevLabel,
      prev: {
        spend: prevKpis.spend, leads: prevKpis.leads, totalQL: prevKpis.totalQL, apps: prevKpis.apps,
        offers: prevKpis.offers, deposits: prevKpis.deposits, raus: prevKpis.raus,
        cpl: prevCpl, cpql: prevCpql, cpa: prevCpa,
      },
      v5: v5Report,
      v6: v6Report,
      cmp: reportCmp,
      scopeLine: 'Source: ' + sourceLabel + ' \u00b7 Corridor: ' + corridorFilter,
      now: { ...kpis, cpl, cpql, cpa },
      cmpRows: mtdCmp.rows,
      cmpTotalSpend: mtdCmp.totalSpend,
      day: ydayCmp,
      dow: { rows: dowCmp, periodLabel },
      channels: bySource.map(s => withCost({ ...s, label: s.source })),
      corridors: byCorridor.map(c => withCost({ ...c, label: c.corridor })),
      bands: {
        total: totalsRow,
        paid: paidRows.length ? aggregateRows(paidRows, 'Paid Channels') : null,
        nonPaid: freeRows.length ? aggregateRows(freeRows, 'Non-Paid Channels') : null,
      },
      table: slackTable,
      estimatedRaus,
      // Run-rate for the projected-spend line. Built off the dates actually present in
      // the filtered rows, so a month with data only to the 28th projects off 28 days
      // rather than off today's date. Null unless the whole window sits in one month.
      pace: (() => {
        let lo = Infinity, hi = -Infinity
        for (const r of filtered) { const v = r.date ? +r.date : 0; if (!v) continue; if (v < lo) lo = v; if (v > hi) hi = v }
        if (!isFinite(lo) || !isFinite(hi)) return null
        const first = new Date(lo), last = new Date(hi)
        if (first.getFullYear() !== last.getFullYear() || first.getMonth() !== last.getMonth()) return null
        const end = new Date(last.getFullYear(), last.getMonth() + 1, 0)
        return { daysDone: last.getDate(), daysInMonth: end.getDate(),
          monthEndLabel: end.toLocaleDateString('en-IN', { day:'numeric', month:'short' }) }
      })(),
      hasPrev: prevKpis.leads > 0 || prevKpis.spend > 0,
      partialPeriod: activeFilter === 'month' ? isCurrentMonth : activeFilter === 'preset',
      prevIsCalendarShift: !!(prevWindow && prevWindow.calendarShift),
    }
  }, [grpByLabel, periodLabel, filterLine, filtered, sortedFilteredRows, totalsRow, kpis, prevKpis,
    cpl, cpql, cpa, prevCpl, prevCpql, prevCpa, conversionChain, bySource, byCorridor,
    aggregateRows, slackTable, estimatedRaus, activeFilter, isCurrentMonth, prevLabel, prevWindow, reportCmp, v5Report, v6Report, selectedSources, sourceLabel, corridorFilter, mtdCmp, ydayCmp, dowCmp])

  // The picture of the table plus the all-columns CSV. The row limit is lifted to
  // "all" for the capture and restored right after, so the image always carries every
  // row the current filters matched -- never just the visible 25.
  const captureReportFiles = useCallback(async () => {
    const prevLimit = rowLimit
    if (ceoCols.length) setCaptureCols(ceoCols)
    if (prevLimit !== 'all') setRowLimit('all')
    await nextPaint()
    try {
      const node = tableRef.current
      const shot = node ? await captureNodePng(node) : null
      return {
        pngBase64: shot ? shot.base64 : null,
        pixelRatio: shot ? shot.pixelRatio : null,
        csv: rowsToCsv([grpByLabel, ...displayCols.map(c => c.label)], [tableTotalExportRowRaw, ...tableExportRowsRaw]),
      }
    } finally {
      setCaptureCols(null)
      if (prevLimit !== 'all') setRowLimit(prevLimit)
    }
  }, [rowLimit, ceoCols, grpByLabel, displayCols, tableTotalExportRowRaw, tableExportRowsRaw])

  // On screen we always render displayCols. captureCols wins only mid-capture.
  const renderCols = captureCols || displayCols

  // Shared metric-cell renderer for every row kind the summary table can show (plain row,
  // Source, Sub Source, Campaign) -- one definition so all four render identically instead
  // of four copies of the same styling logic silently drifting apart over time. `opts` lets
  // a kind override font size / a flat color (used by the Paid/Non-Paid band row only).
  const renderSummaryValueCells = (rowData, opts = {}) => renderCols.map(col => {
    const v = valueWithContrib(rowData, col.key)
    const isTextCol = TEXT_COL_KEYS.includes(col.key)
    const isPct = col.key.endsWith('Pct')
    const isMoney = col.key.endsWith('SrRevenue') || col.key === 'spend' || col.key === 'cpl' || col.key === 'cpql' || col.key === 'cpa'
    return (
      <td key={col.key} title={isMoney && v != null ? fmtINRShort(v) : undefined}
        style={{
          padding: opts.padding || '11px 10px', fontSize: opts.fontSize || 14,
          textAlign: isTextCol ? 'left' : 'right',
          color: opts.colorOverride || (isTextCol ? '#64748B' : (isPct ? heatColor(v) : summaryColor(col.key))),
          fontWeight: opts.fontWeight != null ? opts.fontWeight : (isTextCol ? 500 : (SUMMARY_BOLD_COLS.includes(col.key) ? 700 : 400)),
          background: isPct ? heatBg(v) : 'transparent',
          whiteSpace: isTextCol ? 'nowrap' : 'normal',
        }}>
        {summaryFmt(col.key, v)}
      </td>
    )
  })

  if (loading) {
    return (
      <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:C.bg, fontFamily:FONT }}>
        <Sidebar />
        <div style={{ flex:1, overflow:'auto' }}><DashboardSkeleton /></div>
      </div>
    )
  }
  if (error) {
    return (
      <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:C.bg, fontFamily:FONT }}>
        <Sidebar />
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#64748B', fontSize:14 }}>{error}</div>
      </div>
    )
  }

  const syncFmt = new Intl.DateTimeFormat('en-IN', { hour:'2-digit', minute:'2-digit', second:'2-digit' })

  return (
    <div className="lq-page-shell" style={{ display:'flex', height:'100vh', overflow:'hidden', background:C.bg, fontFamily:FONT }}>
      <Sidebar />
      <style>{`.kpiCard:hover{transform:translateY(-3px);box-shadow:0 2px 4px rgba(15,23,42,0.05),0 16px 32px -14px rgba(31,60,132,0.22)!important}`}</style>
      <div style={{ margin:'12px 14px 0', borderRadius:14, border:'1px solid #EEF1F6', boxShadow:'0 1px 3px rgba(31,60,132,0.06)', flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>

        {/* HEADER — same structure/behavior as the Daily QLs header (QL Ops): inline filter
            label in the title, LD/L7D/MTD pill group, month Dropdown, Custom calendar range,
            Source dropdown, Synced, Refresh, Export, info popover. */}
        <div style={{ background:'var(--card)', borderBottom:`0.5px solid ${C.border}`, padding:'10px 28px', minHeight:56, height:'auto', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexShrink:0, overflow:'visible', flexWrap:'wrap' }}>
          <div>
            <p style={{ fontSize:12, color:C.muted, margin:0, letterSpacing:'0.05em', textTransform:'uppercase', fontFamily:FONT }}>Dashboards / Overall{bqMode ? ' (BigQuery)' : ''}</p>
            <h1 style={{ fontSize:18, fontWeight:800, color:C.text, margin:'2px 0 0', letterSpacing:'-0.4px', fontFamily:FONT }}>
              Overall Performance{bqMode ? ' (BigQuery)' : ''}
              {' - '}
              {activeFilter === 'custom' && customFrom
                ? <span style={{ fontSize:14.5, fontWeight:600, color:C.blue }}>{customFrom} -&gt; {customTo}</span>
                : activeFilter === 'preset' && dateWindow
                  ? <span style={{ fontSize:14.5, fontWeight:600, color:C.blue }}>{dateWindow.label}</span>
                  : <span>{selMonth || '-'}</span>}
            </h1>
          </div>
          <div className="lq-header-controls" style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'nowrap', overflow:'visible', flexShrink:1, minWidth:0 }}>

            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', background:'#F8FAFC', padding:'6px 10px', borderRadius:12, border:'0.5px solid #E5E7EB' }}>
              {isCurrentMonth && (
                <div style={{ display:'flex', alignItems:'center', gap:4, background:'var(--bg3)', borderRadius:9, padding:3 }}>
                  {[['LD', 'Last Day'], ['L7D', 'Last 7D'], ['MTD', 'MTD']].map(([key, lbl2]) => {
                    const today2 = new Date(); today2.setHours(0, 0, 0, 0)
                    let tipFrom, tipTo
                    if (key === 'LD') { tipFrom = new Date(today2); tipFrom.setDate(today2.getDate() - 1); tipTo = tipFrom }
                    else if (key === 'L7D') { tipTo = new Date(today2); tipTo.setDate(today2.getDate() - 1); tipFrom = new Date(tipTo); tipFrom.setDate(tipTo.getDate() - 6) }
                    else { tipFrom = new Date(today2.getFullYear(), today2.getMonth(), 1); tipTo = today2 }
                    const fmtShort = d => `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`
                    const tipLabel = fmtShort(tipFrom) + ' - ' + fmtShort(tipTo)
                    const isHov = hoveredPreset === key
                    return (
                      <div key={key} style={{ position:'relative' }}>
                        <button
                          onClick={() => { setDatePreset(key); setCustomFrom(''); setCustomTo(''); setShowCustom(false) }}
                          onMouseEnter={() => setHoveredPreset(key)}
                          onMouseLeave={() => setHoveredPreset(null)}
                          style={{
                            padding:'5px 11px', borderRadius:7, border:'none', cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:FONT,
                            background: activeFilter === 'custom' ? 'transparent' : datePreset === key ? 'linear-gradient(135deg, #1F3C84, #1C9FD4)' : 'transparent',
                            color: activeFilter === 'custom' ? '#CBD5E1' : datePreset === key ? '#fff' : '#64748B',
                            boxShadow: activeFilter === 'custom' ? 'none' : datePreset === key ? '0 4px 10px -3px rgba(31,60,132,0.5)' : 'none',
                            opacity: activeFilter === 'custom' ? 0.5 : 1,
                            pointerEvents: activeFilter === 'custom' ? 'none' : 'auto',
                            transition:'all .15s',
                          }}>{lbl2}</button>
                        <div style={{ position:'absolute', top:'calc(100% + 7px)', left:'50%', transform:'translateX(-50%)', background:'#1E293B', color:'var(--card)', fontSize:12.5, fontWeight:500, fontFamily:FONT, padding:'5px 10px', borderRadius:7, whiteSpace:'nowrap', pointerEvents:'none', boxShadow:'0 4px 14px rgba(15,23,42,0.18)', zIndex:600, opacity: isHov ? 1 : 0, transition:'opacity .15s ease' }}>
                          {tipLabel}
                          <div style={{ position:'absolute', top:-4, left:'50%', transform:'translateX(-50%)', width:8, height:8, background:'#1E293B', borderRadius:2, clipPath:'polygon(50% 0%, 0% 100%, 100% 100%)' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {monthOptions.length > 0 && (
                <div style={{ opacity: activeFilter !== 'month' ? 0.45 : 1, transition:'opacity .15s', position:'relative', zIndex:500 }} title={activeFilter !== 'month' ? 'Click to switch to month view' : undefined}>
                  <Dropdown
                    options={monthOptions}
                    value={selMonth}
                    minWidth={110}
                    onChange={v => { setSelMonth(v); setDatePreset('month'); setCustomFrom(''); setCustomTo(''); setShowCustom(false) }}
                  />
                </div>
              )}

              <div style={{ position:'relative' }}>
                <button ref={customBtnRef} onClick={() => {
                    if (!showCustom && customBtnRef.current) {
                      const rect = customBtnRef.current.getBoundingClientRect()
                      setCustomOpenLeft(rect.right - CUSTOM_POPUP_WIDTH < SIDEBAR_SAFE_EDGE)
                    }
                    setShowCustom(v => !v); if (!showCustom) setDatePreset('month')
                  }}
                  style={{ padding:'6px 11px', borderRadius:8, border:`0.5px solid ${datePreset === 'custom' ? C.navy : C.border}`, background: datePreset === 'custom' ? C.navyBg : 'var(--card)', color: datePreset === 'custom' ? C.navy : C.sub, fontSize:13, fontWeight:600, fontFamily:FONT, cursor:'pointer', display:'flex', alignItems:'center', gap:5, boxShadow: showCustom ? '0 0 0 3px rgba(31,60,132,0.08)' : 'none', transition:'all .15s' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                  {datePreset === 'custom' && customFrom ? customFrom + ' -> ' + customTo : 'Custom'}
                </button>
                {showCustom && (
                  <>
                    <div onClick={() => setShowCustom(false)} style={{ position:'fixed', inset:0, zIndex:399 }} />
                    <div style={{ position:'absolute', ...(customOpenLeft ? { left:0 } : { right:0 }), top:'calc(100% + 8px)', zIndex:400, background:'var(--card)', border:`0.5px solid ${C.border}`, borderRadius:14, boxShadow:'0 20px 60px rgba(15,23,42,0.16), 0 4px 12px rgba(15,23,42,0.06)', overflow:'hidden' }}>
                      <DateRangePicker
                        from={customFrom ? (() => { const [y, m, d] = customFrom.split('-').map(Number); return new Date(y, m - 1, d) })() : null}
                        to={customTo ? (() => { const [y, m, d] = customTo.split('-').map(Number); return new Date(y, m - 1, d) })() : null}
                        onChange={(f, t) => { setCustomFrom(f); setCustomTo(t); setDatePreset('custom'); setShowCustom(false) }}
                      />
                    </div>
                  </>
                )}
              </div>

              <SourceMultiSelect label="Source" options={sources.filter(s => s !== 'All')} selected={selectedSources} minWidth={110} onChange={setSelectedSources} />
              <Dropdown label="Corridor" options={['All', ...CORRIDORS.map(c => c.label)]} value={corridorFilter} minWidth={140} onChange={setCorridorFilter} />
              <CampaignSearch value={campaignQuery} onChange={setCampaignQuery} suggestions={campaignSuggestions} />
            </div>

            <Button
              onClick={() => setCompareOpen(true)}
              size="sm"
              variant="secondary"
              icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 00-2 2v3m0 8v3a2 2 0 002 2h3m8 0h3a2 2 0 002-2v-3m0-8V5a2 2 0 00-2-2h-3"/><line x1="8" y1="12" x2="16" y2="12"/></svg>}
            >
              Compare
            </Button>

            <Button
              onClick={() => setTrendOpen(true)}
              size="sm"
              variant="secondary"
              icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 17 9 11 13 15 21 6"/><polyline points="15 6 21 6 21 12"/></svg>}
            >
              Trend
            </Button>

            {bqMode && (
              <span
                title={'Data source: BigQuery (beta) -- public.overall_bq_daily, dedicated page (see /dashboard/overall for the sheet)' + (bqSince ? ', ' + bqSince + ' to ' + bqUntil : '') + (bqRowCount != null ? ', ' + bqRowCount.toLocaleString('en-IN') + ' rows read' : '') + (bqError ? ' -- FAILED (' + bqError + '), showing the sheet instead' : '')}
                style={{ fontSize:11.5, fontWeight:800, letterSpacing:.4, textTransform:'uppercase', fontFamily:FONT, whiteSpace:'nowrap', borderRadius:8, padding:'5px 9px', border:'0.5px solid ' + C.border, color: bqError ? C.muted : C.navy, background: bqError ? 'var(--card)' : C.navyBg }}
              >
                {bqError ? 'BigQuery — fell back to sheet' : (bqBusy ? 'BigQuery — loading' : 'BigQuery (beta)')}
              </span>
            )}
            {lastSync && <span style={{ fontSize:12.5, color:C.muted, fontFamily:FONT }}>Synced {syncFmt.format(lastSync)}</span>}
            {!lastSync && bqMode && bqSyncUnknown && <span style={{ fontSize:12.5, color:C.muted, fontFamily:FONT }}>Sync time unknown</span>}
            <Button
              onClick={() => { if (bqMode) { setBqError(null); setBqNonce(n => n + 1) } else loadData(true) }}
              disabled={loading || bqBusy}
              size="sm"
              variant="secondary"
              icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: (loading || bqBusy) ? 'spin .8s linear infinite' : 'none' }}><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>}
            >
              {(loading || bqBusy) ? 'Refreshing' : 'Refresh'}
            </Button>
            <div style={{ position:'relative' }}>
              <button onClick={() => setShowInfo(v => !v)} title="How these metrics are calculated" style={{ width:30, height:30, borderRadius:8, border:`0.5px solid ${C.border}`, background: showInfo ? C.navyBg : 'var(--card)', color:C.navy, fontSize:14, fontWeight:700, fontStyle:'italic', fontFamily:'Georgia,serif', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>i</button>
              {showInfo && <div onClick={() => setShowInfo(false)} style={{ position:'fixed', inset:0, zIndex:150 }} />}
              {showInfo && (
                <div style={{ position:'absolute', right:0, top:'calc(100% + 8px)', zIndex:200, width:380, maxHeight:'74vh', overflowY:'auto', background:'var(--card)', border:`0.5px solid ${C.border}`, borderRadius:12, boxShadow:'0 14px 40px rgba(15,23,42,0.16)', padding:'16px 18px', textAlign:'left', fontFamily:FONT }}>
                  <div style={{ fontSize:14, fontWeight:800, color:C.text, marginBottom:8 }}>How Overall is calculated</div>
                  {bqMode && <div style={{ fontSize:12.5, color: bqError ? C.muted : C.navy, fontWeight:700, marginBottom:6 }}>{bqError ? 'This page\u2019s BigQuery read failed, so these numbers are the sheet\u2019s for now.' : 'This is the BigQuery page: these numbers come from the overall_bq_daily cache of the BigQuery saved query "Overall", read for the selected range only \u2014 same rows and same columns as the /dashboard/overall sheet page, just not downloaded whole.'}</div>}
                  <div style={{ fontSize:12.5, color:C.muted, marginBottom:10 }}>Source: the "Overall PM" sheet (Settings &gt; Data &gt; Google Sheets) — one row per lead/day/source/campaign, spanning the full acquisition-to-revenue funnel.</div>
                  <div style={{ fontSize:13, color:C.sub, lineHeight:1.7 }}>
                    <b>Leads Generated</b> is split into two paths: <b>Total Queued</b> (Futwork Human + Futwork AI + Superbot — sent to our third-party providers to get converted) and <b>Floor Queued</b> (handled directly). Futwork itself splits into <b>Queued on Futwork Human</b> and <b>Queued on Futwork AI</b> (added 2026-08-19, replacing the old single "Queued on Futwork" column) — <b>Total Queued on Futwork</b> is those two combined, excluding Superbot. From there it continues <b>Total QL</b> (Futwork Human QL + Futwork AI QL + Superbot AI QL combined) → <b>Applications</b> → <b>Offers</b> → <b>Deposits</b> → <b>RAUs</b> (Registered At University). Total Queued and Floor Queued are parallel branches of Leads Generated, not a single straight line.<br /><br />
                    <b>Lead to QL %</b> (and its Human/AI variants) is Futwork's own queued-to-QL conversion, distinct from the whole-funnel <b>QL %</b> below: <b>Lead to QL %</b> = (Futwork Human QL + Futwork AI QL) ÷ Total Queued on Futwork, <b>Lead to QL % (Human)</b> = Futwork Human QL ÷ Queued on Futwork Human, <b>Lead to QL % (AI)</b> = Futwork AI QL ÷ Queued on Futwork AI. None of these three include Superbot. The Human/AI split on the <i>queued</i> side didn't exist before 2026-08-19 and was never backfilled, while the QL <i>outcome</i> side has always been split correctly — so a period predating that split divides a real QL count by a near-zero queued figure. <b>Lead to QL % (Human/AI)</b> shows "—" rather than a four-digit artefact when that happens; the underlying Queued/QL counts themselves are shown as-is either way.<br /><br />
                    <b>Estimated RAU</b> = Deposits × 70% (a projection of how many current Deposits will go on to register). <b>Actual RAUs</b> is the real, already-registered count — no discount applied. <b>Est./Actual SR Revenue</b> = Estimated/Actual RAUs × SR Fee.<br /><br />
                    <b>CPL, CPQL and CPA count paid channels only.</b> A row shows a cost figure only if it carried spend, divided by its own leads / QLs / applications. The <b>TOTAL</b> divides all spend by the leads from <i>sources that spent</i> — so unpaid channels (Referral, Content+Brand, Offline, organic) don't dilute the blended figure, which otherwise made paid acquisition look materially cheaper than it is. "Paid" is judged per source rather than per row, because spend and leads frequently sit on different rows: manual affiliate spend arrives on rows carrying no leads, while Affiliate's actual leads sit on rows with no spend. That keeps the blended figure identical on every grouping tab. A row with no spend of its own shows "—" rather than ₹0.<br /><br />
                    In the summary table, the three whole-funnel conversion rates are each a single funnel step, not a share of all leads: <b>QL %</b> = Total QLs ÷ Total Queued, <b>App %</b> = Applications ÷ Total QLs, <b>Deposit %</b> = Deposits ÷ Offers. Because each stage is reported independently and a lead can reach a later stage in a different period from the one it was queued in, these can read above 100% on small or lagging rows. The <b>TOTAL</b> row re-derives every rate, cost and ROAS from the summed totals rather than averaging the rows, so it is weighted by volume.<br /><br />
                    <b>Executive insights</b> and <b>KPI deltas</b> compare the active period against the immediately preceding period of equal length (or the previous calendar month, in month view). <b>Biggest funnel leak</b> and campaign efficiency rankings use the real conversion path (Leads → Queued → Total QL → Apps → Offers → Deposits), skipping the parallel Floor Queued branch.<br /><br />
                    Last Day / Last 7D / MTD and Custom filter by lead date; the Month dropdown scopes to one calendar month. Source and campaign search filter everything below.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* SCROLLABLE CONTENT */}
        <div style={{ flex:1, overflowY:'auto', padding:'20px 28px' }}>

          {/* Same honesty banner the Trend modal already shows for the same reason:
              in BigQuery mode a filter/period change can kick off a real fetch that's
              still in flight, and every number below reads from whatever the PREVIOUS
              fetch returned until it lands -- silently showing that as a confident
              answer for the new selection is exactly what produced a real, live bug
              (a wide "All months" read silently reusing a stale single-month window). */}
          {bqMode && bqBusy && (
            <div style={{ display:'flex', alignItems:'center', gap:8, background:C.navyBg, border:`0.5px solid ${C.border}`, borderRadius:10, padding:'9px 12px', marginBottom:14, fontSize:14, color:C.navy, fontWeight:700 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation:'spin .8s linear infinite', flexShrink:0 }}><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
              Fetching from BigQuery -- the KPIs, funnel and table below may still show the previous selection until this finishes.
            </div>
          )}

          {/* KPI ROW 1 — funnel volume, with vs-previous-period deltas. Both rows carry
              exactly 10 cards each (rebalanced from an earlier 12/8 split that made an
              auto-fit grid size cards differently row to row — "thick vs thin"), so an
              auto-fit grid is safe again: same item count -> same column count on both
              rows at any width. A fixed repeat(10, minmax(120px,1fr)) was tried instead
              and reliably overflowed the container by 300-900px at every width between
              the 768px and ~1310px breakpoints, forcing the whole page to scroll
              sideways -- auto-fit degrades to fewer, wider columns there instead. */}
          <div className="lq-kpi-grid" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))', gap:12, marginBottom:12 }}>
            <PremKPI label="EST. SR REVENUE" value={<span title={fmtINR(estSrRevenue)}>{fmtINRShort(estSrRevenue)}</span>} sub={'Est. RAUs ' + fmtN(estimatedRaus) + ' × SR Fee'} delta={deltaPct(estSrRevenue, prevEstSrRevenue)} prevValue={fmtINR(prevEstSrRevenue)} accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.total} />
            <PremKPI label="SPEND" value={<span title={fmtINR(kpis.spend)}>{fmtINRShort(kpis.spend)}</span>} sub="total ad spend" delta={deltaPct(kpis.spend, prevKpis.spend)} prevValue={fmtINR(prevKpis.spend)} accent={C.blue} accentBg={C.blueBg} icon={KPI_ICONS.total} />
            <PremKPI label="TOTAL LEADS" value={fmtN(kpis.leads)} sub="generated" delta={kpiDelta(kpis.leads, prevKpis.leads)} prevValue={fmtN(prevKpis.leads)} accent={C.cyan} accentBg={C.cyanBg} icon={KPI_ICONS.total} />
            <PremKPI label="FLOOR QUEUED" value={fmtN(kpis.floorQueued)} sub={pct(kpis.floorQueued, kpis.leads) + ' of leads'} delta={kpiDelta(kpis.floorQueued, prevKpis.floorQueued)} prevValue={fmtN(prevKpis.floorQueued)} accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.total} />
            <PremKPI label="FUTWORK QUEUED" value={fmtN(totalFutworkQ)} sub={'Human ' + fmtN(kpis.futworkHumanQ) + ' · AI ' + fmtN(kpis.futworkAiQ)} delta={kpiDelta(totalFutworkQ, prevTotalFutworkQ)} prevValue={fmtN(prevTotalFutworkQ)} accent={C.green} accentBg={C.greenBg} icon={KPI_ICONS.agent} />
            <PremKPI label="HUMAN QUEUED" value={fmtN(kpis.futworkHumanQ)} sub={pct(kpis.futworkHumanQ, totalFutworkQ) + ' of Futwork queued'} delta={kpiDelta(kpis.futworkHumanQ, prevKpis.futworkHumanQ)} prevValue={fmtN(prevKpis.futworkHumanQ)} accent={C.blue} accentBg={C.blueBg} icon={KPI_ICONS.agent} />
            <PremKPI label="AI QUEUED" value={fmtN(kpis.futworkAiQ)} sub={pct(kpis.futworkAiQ, totalFutworkQ) + ' of Futwork queued'} delta={kpiDelta(kpis.futworkAiQ, prevKpis.futworkAiQ)} prevValue={fmtN(prevKpis.futworkAiQ)} accent={C.cyan} accentBg={C.cyanBg} icon={KPI_ICONS.ai} />
            <PremKPI label="SUPERBOT QUEUED" value={fmtN(kpis.superbotQ)} sub={pct(kpis.superbotQ, totalQueued) + ' of total queued'} delta={kpiDelta(kpis.superbotQ, prevKpis.superbotQ)} prevValue={fmtN(prevKpis.superbotQ)} accent={C.green} accentBg={C.greenBg} icon={KPI_ICONS.bot} />
            <PremKPI label="TOTAL QLs" value={fmtN(kpis.totalQL)} sub={pct(kpis.totalQL, totalQueued) + ' of queued'} delta={kpiDelta(kpis.totalQL, prevKpis.totalQL)} prevValue={fmtN(prevKpis.totalQL)} accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.ai} />
            <PremKPI label="HUMAN QLs" value={fmtN(kpis.humanQL)} sub={pct(kpis.humanQL, kpis.totalQL) + ' of total QL'} delta={kpiDelta(kpis.humanQL, prevKpis.humanQL)} prevValue={fmtN(prevKpis.humanQL)} accent={C.blue} accentBg={C.blueBg} icon={KPI_ICONS.agent} />
          </div>

          {/* KPI ROW 2 — remaining QL breakdown + cost efficiency + downstream conversion + ROAS.
              Same auto-fit grid as row 1, same 10 items, so columns match at any width. */}
          <div className="lq-kpi-grid" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))', gap:12, marginBottom:20 }}>
            <PremKPI label="AI QLs" value={fmtN(kpis.futworkAiQl)} sub={pct(kpis.futworkAiQl, kpis.totalQL) + ' of total QL'} delta={kpiDelta(kpis.futworkAiQl, prevKpis.futworkAiQl)} prevValue={fmtN(prevKpis.futworkAiQl)} accent={C.cyan} accentBg={C.cyanBg} icon={KPI_ICONS.ai} />
            <PremKPI label="SUPERBOT QLs" value={fmtN(kpis.superbotAiQl)} sub={pct(kpis.superbotAiQl, kpis.totalQL) + ' of total QL'} delta={kpiDelta(kpis.superbotAiQl, prevKpis.superbotAiQl)} prevValue={fmtN(prevKpis.superbotAiQl)} accent={C.green} accentBg={C.greenBg} icon={KPI_ICONS.bot} />
            <PremKPI label="CPL" value={<span title={fmtINR(cpl)}>{fmtINRShort(cpl)}</span>} sub="cost per lead" delta={deltaPct(cpl, prevCpl)} prevValue={fmtINR(prevCpl)} invert accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.agent} />
            <PremKPI label="CPQL" value={<span title={fmtINR(cpql)}>{fmtINRShort(cpql)}</span>} sub="cost per qualified lead" delta={deltaPct(cpql, prevCpql)} prevValue={fmtINR(prevCpql)} invert accent={C.blue} accentBg={C.blueBg} icon={KPI_ICONS.ai} />
            <PremKPI label="APPLICATIONS" value={fmtN(kpis.apps)} sub={pct(kpis.apps, kpis.totalQL) + ' of QL'} delta={kpiDelta(kpis.apps, prevKpis.apps)} prevValue={fmtN(prevKpis.apps)} accent={C.cyan} accentBg={C.cyanBg} icon={KPI_ICONS.total} />
            <PremKPI label="CPA" value={<span title={fmtINR(cpa)}>{fmtINRShort(cpa)}</span>} sub="cost per application" delta={deltaPct(cpa, prevCpa)} prevValue={fmtINR(prevCpa)} invert accent={C.green} accentBg={C.greenBg} icon={KPI_ICONS.globe} />
            <PremKPI label="OFFERS" value={fmtN(kpis.offers)} sub={pct(kpis.offers, kpis.apps) + ' of apps'} delta={kpiDelta(kpis.offers, prevKpis.offers)} prevValue={fmtN(prevKpis.offers)} accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.agent} />
            <PremKPI label="DEPOSITS" value={fmtN(kpis.deposits)} sub={pct(kpis.deposits, kpis.offers) + ' of offers'} delta={kpiDelta(kpis.deposits, prevKpis.deposits)} prevValue={fmtN(prevKpis.deposits)} accent={C.blue} accentBg={C.blueBg} icon={KPI_ICONS.globe} />
            <PremKPI label="TOTAL RAUs" value={fmtN(kpis.raus)} sub={'Est. RAUs ' + fmtN(estimatedRaus)} delta={kpiDelta(kpis.raus, prevKpis.raus)} prevValue={fmtN(prevKpis.raus)} accent={C.cyan} accentBg={C.cyanBg} icon={KPI_ICONS.bot} />
            <PremKPI label="ROAS" value={actualRoas.toFixed(2) + 'x'} sub={'Est. ROAS ' + estimatedRoas.toFixed(2) + 'x'} delta={deltaPct(actualRoas, prevActualRoas)} prevValue={prevActualRoas.toFixed(2) + 'x'} accent={C.green} accentBg={C.greenBg} icon={KPI_ICONS.total} />
          </div>

          {/* FUNNEL + STAGE CONVERSION */}
          <Card>
            {sectionTitle('Overall funnel', 'lead → revenue path for the selected period and source')}
            <ResponsiveContainer width="100%" height={460}>
              <BarChart data={funnel} layout="vertical" margin={{ left:20, right:50, top:4, bottom:4 }}>
                <defs><BarGrad id="g-ov-funnel" color={C.navy} dir="h"/></defs>
                <CartesianGrid horizontal={false} stroke={C.border} />
                <XAxis type="number" tick={axis} axisLine={false} tickLine={false} tickFormatter={fmtN} />
                <YAxis type="category" dataKey="stage" tick={axis} axisLine={false} tickLine={false} width={150} />
                <Tooltip content={<BrandTooltip />} cursor={{ fill:'rgba(31,60,132,0.04)' }} />
                <Bar dataKey="count" name="Count" fill={barFill('g-ov-funnel')} radius={BAR_RADIUS_H} barSize={20}>
                  
                  <LabelList dataKey="count" position="right" formatter={fmtN} style={{ fontSize:14, fontWeight:700, fill:C.sub }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div style={{ borderTop:'1px solid #F1F5F9', marginTop:4, paddingTop:16 }}>
              <div style={{ fontSize:12, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>Stage-to-stage conversion (the real path)</div>
              <ConversionChain steps={conversionChain} />
            </div>
          </Card>

          {/* GROUPED SUMMARY TABLE — customizable: search, sortable columns, show/hide +
              reorder columns (persisted), row limit, and a per-view export. */}
          <div style={{ marginTop:16 }}>
            <Card
              action={
                <div style={{ display:'flex', gap:6 }}>
                  {[['source', 'Source'], ['campaign', 'Campaign'], ['corridor', 'Corridor'], ['month', 'Month'], ['day', 'Day']].map(([v, l]) => (
                    <button key={v} onClick={() => setGrpBy(v)} style={{ padding:'7px 14px', borderRadius:8, border:'0.5px solid ' + (grpBy === v ? C.navy : '#E5E7EB'), background: grpBy === v ? C.navy : '#fff', color: grpBy === v ? '#fff' : '#374151', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:FONT }}>{l}</button>
                  ))}
                </div>
              }
            >
              {sectionTitle('Funnel summary by ' + grpByLabel.toLowerCase(), 'full-funnel totals and stage conversion rates — search, sort, and customize the columns below')}

              {/* TOOLBAR */}
              <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:14 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 12px', borderRadius:8, border:`0.5px solid ${C.border}`, background:'var(--card)', flex:'1 1 200px', minWidth:160, maxWidth:280 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
                  <input value={tableSearch} onChange={e => setTableSearch(e.target.value)} placeholder={`Search ${grpByLabel.toLowerCase()}…`}
                    style={{ border:'none', outline:'none', background:'transparent', fontFamily:FONT, fontSize:14, fontWeight:600, color:C.text, width:'100%' }} />
                  {tableSearch && (
                    <button onClick={() => setTableSearch('')} style={{ border:'none', background:'transparent', cursor:'pointer', color:C.muted, display:'flex', padding:0, flexShrink:0 }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                  )}
                </div>

                <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <span style={{ fontSize:13.5, color:C.muted, fontFamily:FONT }}>Show</span>
                  {[10, 25, 50, 'all'].map(n => (
                    <button key={n} onClick={() => setRowLimit(n)} style={{ padding:'7px 12px', borderRadius:7, border:'none', cursor:'pointer', fontSize:14, fontWeight:700, fontFamily:FONT, background: rowLimit === n ? C.navy : 'transparent', color: rowLimit === n ? '#fff' : '#64748B' }}>{n === 'all' ? 'All' : n}</button>
                  ))}
                </div>

                <div style={{ position:'relative' }}>
                  <Button
                    onClick={() => setShowColsPicker(v => !v)}
                    size="sm"
                    variant="secondary"
                    icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="18" rx="1" /><rect x="14" y="3" width="7" height="18" rx="1" /></svg>}
                  >
                    Columns
                  </Button>
                  {showColsPicker && (
                    <ColumnsPicker order={colOrder} visible={visibleCols} onToggle={toggleCol} onMove={moveCol} onClose={() => setShowColsPicker(false)} onReset={resetCols} />
                  )}
                </div>

                <Button
                  onClick={() => setPinCols(v => !v)}
                  size="sm"
                  variant={pinCols ? 'primary' : 'secondary'}
                  aria-pressed={pinCols}
                  title={pinCols ? `${grpByLabel} is pinned while scrolling — click to make the table scroll freely` : `Pin ${grpByLabel} so it stays visible while scrolling the table sideways`}
                  icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 17v5" /><path d="M9 3h6l1 6 3 2v2H5v-2l3-2z" /></svg>}
                >
                  {pinCols ? 'Pinned' : 'Pin columns'}
                </Button>

                <div style={{ position:'relative' }}>
                  <Button
                    onClick={() => setShowRatesPicker(v => !v)}
                    size="sm"
                    variant="secondary"
                    icon={<span style={{ fontSize:14.5, fontWeight:800, lineHeight:1, fontFamily:FONT }}>₹</span>}
                  >
                    SR Fee
                  </Button>
                  {showRatesPicker && (
                    <>
                      <div onClick={() => setShowRatesPicker(false)} style={{ position:'fixed', inset:0, zIndex:399 }} />
                      <div ref={ratesPickerRef} role="dialog" aria-modal="true" aria-labelledby="sr-fee-popover-title" tabIndex={-1} style={{ position:'absolute', left:0, top:'calc(100% + 6px)', zIndex:400, background:'var(--card)', border:`0.5px solid ${C.border}`, borderRadius:12, boxShadow:'0 16px 40px rgba(15,23,42,0.14), 0 2px 8px rgba(15,23,42,0.06)', padding:14, minWidth:270 }}>
                        <div id="sr-fee-popover-title" style={{ fontSize:11.5, fontWeight:700, color:C.muted, letterSpacing:'0.06em', textTransform:'uppercase', marginBottom:10 }}>SR revenue formula</div>
                        <div style={{ fontSize:20, fontWeight:800, color:C.navy, fontFamily:FONT, marginBottom:8 }}>₹{srFee.toLocaleString('en-IN')} <span style={{ fontSize:12.5, fontWeight:600, color:C.muted }}>per RAU (SR Fee)</span></div>
                        <div style={{ fontSize:12.5, color:C.sub, lineHeight:1.7 }}>
                          <b>Estimated RAU</b> = Deposits × 70%<br />
                          <b>Est. SR Revenue</b> = Estimated RAU × SR Fee<br />
                          <b>Actual SR Revenue</b> = Actual RAUs × SR Fee<br />
                          <b>ROAS</b> = Actual SR Revenue ÷ Spend (Est. ROAS uses Est. SR Revenue)
                        </div>
                        <div style={{ fontSize:12, color:C.muted, marginTop:10, lineHeight:1.5 }}>This rate is shared with Settings &gt; Data &gt; SR Revenue Assumptions — change it there to update it everywhere.</div>
                      </div>
                    </>
                  )}
                </div>

            <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8 }}>
              <Button size="sm" variant="secondary" onClick={() => setSlackPanelOpen(true)}
                icon={<SlackIcon size={13} />}>
                Send to Slack
              </Button>
              <ExportButton data={tableExportRows} totalRow={tableTotalExportRow}
                rawData={tableExportRowsRaw} rawTotalRow={tableTotalExportRowRaw}
                filename={'overall-' + grpBy} dashboardId="overall" hideSlack />
              <SlackReportPanel
                open={slackPanelOpen}
                onClose={() => setSlackPanelOpen(false)}
                buildContext={buildReportContext}
                captureFiles={captureReportFiles}
                dashboardId="overall"
                filename={'overall-' + grpBy}
                rowCount={sortedFilteredRows.length}
              />
            </div>
              </div>

              <div style={{ overflowX:'auto' }}>
                <table ref={tableRef} style={{ width:'100%', borderCollapse:'collapse', fontSize:14, fontFamily:FONT }}>
                  <thead>
                    <tr style={{ background:'#F8FAFC', borderBottom:'2px solid #E2E8F0' }}>
                      <th aria-sort={sortKey === 'label' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} style={{ padding:'11px 12px', fontSize:12.5, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color: sortKey === 'label' ? C.navy : '#64748B', textAlign:'left', whiteSpace:'nowrap', userSelect:'none', ...stickyLabelStyle(pinCols, '#F8FAFC') }}>
                        {/* C10 fix: was a bare onClick on the <th> itself -- no tabIndex, no role,
                            no keyboard equivalent. A real <button> is focusable and Enter/Space-
                            activatable for free; sized/styled to fill the cell so the click target
                            and appearance are unchanged for a mouse user. */}
                        <button type="button" onClick={() => handleSort('label')} style={{ display:'block', width:'100%', textAlign:'inherit', background:'none', border:'none', padding:0, margin:0, font:'inherit', color:'inherit', cursor:'pointer' }}>
                          {grpByLabel}{sortKey === 'label' && (sortDir === 'asc' ? ' ▲' : ' ▼')}
                        </button>
                      </th>
                      {renderCols.map(col => (
                        <th key={col.key}
                          aria-sort={sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                          draggable
                          onDragStart={e => { setDragKey(col.key); e.dataTransfer.effectAllowed = 'move' }}
                          onDragOver={e => { e.preventDefault(); if (dragOverKey !== col.key) setDragOverKey(col.key) }}
                          onDragLeave={() => setDragOverKey(k => (k === col.key ? null : k))}
                          onDrop={e => { e.preventDefault(); reorderColumns(dragKey, col.key); setDragKey(null); setDragOverKey(null) }}
                          onDragEnd={() => { setDragKey(null); setDragOverKey(null) }}
                          title="Click to sort — drag to reorder"
                          style={{
                            position:'relative', padding:'11px 10px', fontSize:12.5, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em',
                            color: sortKey === col.key ? C.navy : '#64748B', textAlign: TEXT_COL_KEYS.includes(col.key) ? 'left' : 'right', whiteSpace:'nowrap', cursor: 'grab', userSelect:'none',
                            opacity: dragKey === col.key ? 0.35 : 1,
                            boxShadow: dragOverKey === col.key && dragKey && dragKey !== col.key ? `inset 2px 0 0 ${C.blue}` : 'none',
                          }}>
                          {col.key === 'contribPct' ? (
                            <span style={{ display:'inline-flex', alignItems:'center', gap:5, justifyContent: TEXT_COL_KEYS.includes(col.key) ? 'flex-start' : 'flex-end' }}>
                              {/* C10 fix: this used to be a bare <th onClick> with no keyboard path at
                                  all -- clicking the metric-picker pill relied on stopPropagation to
                                  avoid also triggering a sort, which only worked for a mouse. Both
                                  triggers are now real buttons; aria-sort moved to the <th> itself. */}
                              <button type="button" onClick={() => handleSort(col.key)} style={{ background:'none', border:'none', padding:0, margin:0, font:'inherit', color:'inherit', textTransform:'inherit', letterSpacing:'inherit', cursor:'pointer' }}>
                                {col.label}{sortKey === col.key && (sortDir === 'asc' ? ' ▲' : ' ▼')}
                              </button>
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation()
                                  // position:fixed, anchored to the pill's own screen coordinates at click
                                  // time -- NOT position:absolute relative to the <th>. This header sits
                                  // inside a horizontally-scrolling table with a sticky-ish header row; an
                                  // absolute popover there rendered in the DOM with correct content (real
                                  // getBoundingClientRect, real text) but was never visually reachable --
                                  // clipped by the scroll container's overflow no matter how the page was
                                  // scrolled. Fixed positioning escapes that ancestor entirely.
                                  if (showContribPicker) { setShowContribPicker(false); return }
                                  const r = e.currentTarget.getBoundingClientRect()
                                  setContribPickerPos({ top: r.bottom + 4, left: Math.min(r.left, window.innerWidth - 260) })
                                  setShowContribPicker(true)
                                }}
                                title="Choose the metric this contribution % is based on"
                                style={{ border:'none', padding:'2px 6px', borderRadius:6, background: showContribPicker ? C.navy : '#E2E8F0', color: showContribPicker ? '#fff' : '#475569', fontSize:11, fontWeight:800, textTransform:'none', letterSpacing:0, cursor:'pointer', whiteSpace:'nowrap', fontFamily:'inherit' }}>
                                {CONTRIB_METRICS.find(m => m.key === contribMetric)?.label || 'Leads'} ▾
                              </button>
                              {showContribPicker && contribPickerPos && (
                                <>
                                  <div onClick={e => { e.stopPropagation(); setShowContribPicker(false) }} style={{ position:'fixed', inset:0, zIndex:399 }} />
                                  <div ref={contribPickerRef} role="dialog" aria-modal="true" aria-labelledby="contrib-picker-title" tabIndex={-1} onClick={e => e.stopPropagation()} style={{ position:'fixed', top:contribPickerPos.top, left:contribPickerPos.left, zIndex:400, background:'var(--card)', border:`0.5px solid ${C.border}`, borderRadius:10, boxShadow:'0 16px 40px rgba(15,23,42,0.14)', padding:6, minWidth:240 }}>
                                    <div style={{ padding:'6px 10px 10px', marginBottom:4, borderBottom:`0.5px solid ${C.border}` }}>
                                      <div id="contrib-picker-title" style={{ fontSize:11.5, fontWeight:700, color:C.muted, letterSpacing:'0.06em', textTransform:'uppercase', marginBottom:5 }}>How this is calculated</div>
                                      <div style={{ fontSize:13, color:C.sub, lineHeight:1.55, fontWeight:400 }}>
                                        Each row's <b>{(CONTRIB_METRICS.find(m => m.key === contribMetric)?.label || 'Leads')}</b> divided by the grand total {(CONTRIB_METRICS.find(m => m.key === contribMetric)?.label || 'Leads')} for the current filters, ×100.
                                      </div>
                                    </div>
                                    {CONTRIB_METRICS.map(m => (
                                      <button key={m.key} onClick={e => { e.stopPropagation(); setContribMetric(m.key); setShowContribPicker(false) }}
                                        style={{ display:'block', width:'100%', textAlign:'left', padding:'7px 10px', borderRadius:7, border:'none', cursor:'pointer', fontFamily:FONT, fontSize:13.5, fontWeight: m.key === contribMetric ? 700 : 400, textTransform:'none', letterSpacing:0, background: m.key === contribMetric ? C.navyBg : 'transparent', color: m.key === contribMetric ? C.navy : C.text }}>
                                        {m.label}
                                      </button>
                                    ))}
                                  </div>
                                </>
                              )}
                            </span>
                          ) : (
                            <button type="button" onClick={() => handleSort(col.key)} style={{ display:'block', width:'100%', textAlign:'inherit', background:'none', border:'none', padding:0, margin:0, font:'inherit', color:'inherit', textTransform:'inherit', letterSpacing:'inherit', cursor:'pointer' }}>
                              {col.label}{sortKey === col.key && (sortDir === 'asc' ? ' ▲' : ' ▼')}
                            </button>
                          )}
                        </th>
                      ))}
                    </tr>
                    {/* Totals live in the header so they stay put when the body is sorted or
                        scrolled, and land in shot without needing to scroll to the bottom. */}
                    {tableRows.length > 0 && (
                      // Deliberately quiet: a tinted, navy-underlined band here competed with
                      // the column headers directly above it and read as a slab. Neutral ink on
                      // the plain surface, at the same size as the body, lets it read as an
                      // authoritative summary line while the column headers stay the only
                      // emphasised band.
                      <tr style={{ background:'var(--card)', borderBottom:'2px solid #CBD5E1' }}>
                        <th style={{ padding:'10px 12px', fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', color:'#64748B', textAlign:'left', whiteSpace:'nowrap', ...stickyLabelStyle(pinCols, 'var(--card)') }}>
                          Total
                        </th>
                        {renderCols.map(col => {
                          const v = valueWithContrib(totalsRow, col.key)
                          const isTextCol = TEXT_COL_KEYS.includes(col.key)
                          const isMoney = col.key.endsWith('SrRevenue') || col.key === 'spend' || col.key === 'cpl' || col.key === 'cpql' || col.key === 'cpa'
                          return (
                            <th key={col.key} title={isMoney && v != null ? fmtINRShort(v) : undefined}
                              style={{ padding:'10px 10px', fontSize:14, fontWeight:800, textAlign: isTextCol ? 'left' : 'right', color: isTextCol ? '#CBD5E1' : '#0F172A', whiteSpace:'nowrap' }}>
                              {summaryFmt(col.key, v)}
                            </th>
                          )
                        })}
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {tableBodyRows.map(item => {
                      if (item.kind === 'band') { const bg = '#EEF3FA'; return (
                        <tr key={'band-' + item.label} style={{ background:bg, borderTop:'2px solid #D8E3F0', borderBottom:'1px solid #E2E8F0' }}>
                          <td style={{ padding:'9px 12px', fontSize:12, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.08em', color:C.navy, whiteSpace:'nowrap', ...stickyLabelStyle(pinCols, bg) }}>{item.label}</td>
                          {renderSummaryValueCells(item.row, { padding:'9px 10px', fontSize:14.5, fontWeight:800, colorOverride:C.navy, rowBg:bg })}
                        </tr>
                      ) }
                      if (item.kind === 'source') { const bg = item.i % 2 === 0 ? '#fff' : '#FAFBFC'; return (
                        <tr key={'src-' + item.row.label} style={{ background:bg }}>
                          <td style={{ padding:'11px 12px', fontWeight:600, color:'#0F172A', cursor:'pointer', userSelect:'none', ...stickyLabelStyle(pinCols, bg) }}
                            onClick={() => toggleSourceExpand(item.row.label)}>
                            <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                              <TreeChevron open={expandedSources.has(item.row.label)} />
                              {item.row.label}
                            </span>
                          </td>
                          {renderSummaryValueCells(item.row, { rowBg:bg })}
                        </tr>
                      ) }
                      if (item.kind === 'subsource') { const bg = '#F8FAFC'; return (
                        <tr key={'sub-' + item.parentSource + '-' + item.row.label} style={{ background:bg }}>
                          <td style={{ padding:'9px 12px 9px 32px', fontWeight:600, fontSize:14.5, color:'#334155', cursor: item.hasCampaigns ? 'pointer' : 'default', userSelect:'none', ...stickyLabelStyle(pinCols, bg) }}
                            onClick={() => item.hasCampaigns && toggleSubSourceExpand(item.parentSource, item.row.label)}>
                            <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                              {item.hasCampaigns && <TreeChevron open={expandedSubSources.has(item.parentSource + '||' + item.row.label)} />}
                              {item.row.label}
                            </span>
                          </td>
                          {renderSummaryValueCells(item.row, { fontSize:14, rowBg:bg })}
                        </tr>
                      ) }
                      if (item.kind === 'campaign') { const bg = '#fff'; return (
                        <tr key={'camp-' + item.parentKey + '-' + item.row.label} style={{ background:bg }}>
                          <td style={{ padding:'8px 12px 8px 56px', fontWeight:400, fontSize:14, color:'#64748B', ...stickyLabelStyle(pinCols, bg) }}>{item.row.label}</td>
                          {renderSummaryValueCells(item.row, { fontSize:13.5, rowBg:bg })}
                        </tr>
                      ) }
                      { const bg = item.i % 2 === 0 ? '#fff' : '#FAFBFC'; return (
                        <tr key={item.row.label} style={{ background:bg }}>
                          <td style={{ padding:'11px 12px', fontWeight:600, color:'#0F172A', ...stickyLabelStyle(pinCols, bg) }}>{item.row.label}</td>
                          {renderSummaryValueCells(item.row, { rowBg:bg })}
                        </tr>
                      ) }
                    })}
                    {tableRows.length === 0 && (
                      <tr><td colSpan={renderCols.length + 1} style={{ padding:'20px', textAlign:'center', color:'#94A3B8' }}>No data for this selection.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {grouped.length > tableRows.length && (
                <div style={{ fontSize:12.5, color:C.muted, textAlign:'center', marginTop:10 }}>Showing {tableRows.length} of {grouped.length} — increase "Show" above to see more.</div>
              )}
            </Card>
          </div>

          {/* SOURCE VOLUME + SOURCE EFFICIENCY */}
          <div className="lq-grid2" style={{ ...grid2, marginTop:16 }}>
            <Card>
              {sectionTitle('Leads by source', 'volume leaders this period')}
              <RankedBars data={bySource.slice(0, 8).map(s => ({ source:s.source, count:s.leads }))} labelKey="source" max={maxSourceLeads} total={totalSourceLeads} showRank />
            </Card>
            <Card>
              {sectionTitle('Source efficiency', 'queued → Total QL rate — where quality actually converts (min. 10 queued)')}
              <EfficiencyList data={bySourceEfficiency} labelKey="source" rateKey="qlRate" subKey="queued" />
            </Card>
          </div>

          {/* COST AND QUALITY BY SOURCE - the same cuts the CEO report carries */}
          <div style={{ marginTop:16 }}>
            <CpqlBySource cmp={reportCmp} prevLabel={prevLabel} fmtINR={fmtINR} fmtINRShort={fmtINRShort} />
          </div>
          <div className="lq-grid2" style={{ ...grid2, marginTop:16 }}>
            <SpendVsQuality cmp={reportCmp} fmtINR={fmtINR} fmtINRShort={fmtINRShort} />
            <CostTrendMonth data={costByMonth} fmtINR={fmtINR} />
          </div>

          {/* MONTH TREND + DAILY TREND */}
          <div className="lq-grid2" style={{ ...grid2, marginTop:16 }}>
            <Card>
              {sectionTitle('Month-on-month trend', bqActive && monthTrendBqBusy
                ? 'last 5 months, including the current month — fetching the trailing months from BigQuery in the background, chart fills in as it lands'
                : 'last 5 months, including the current month — not affected by the date filter above')}
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={monthTrend} margin={{ left:0, right:12, top:4, bottom:4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
                  <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={fmtN} />
                  <Tooltip content={<BrandTooltip />} />
                  <Legend wrapperStyle={{ fontSize:14, fontFamily:FONT }} />
                  <Line type="monotone" dataKey="leads" name="Leads" stroke={C.navy} strokeWidth={2.5} strokeDasharray={bqActive && monthTrendBqBusy ? '5 4' : undefined} dot={{ r:3 }} />
                  <Line type="monotone" dataKey="queued" name="Total Queued" stroke={C.blue} strokeWidth={2.5} strokeDasharray={bqActive && monthTrendBqBusy ? '5 4' : undefined} dot={{ r:3 }} />
                  <Line type="monotone" dataKey="totalQL" name="Total QL" stroke={C.cyan} strokeWidth={2.5} strokeDasharray={bqActive && monthTrendBqBusy ? '5 4' : undefined} dot={{ r:3 }} />
                  <Line type="monotone" dataKey="deposits" name="Deposits" stroke={C.green} strokeWidth={2.5} strokeDasharray={bqActive && monthTrendBqBusy ? '5 4' : undefined} dot={{ r:3 }} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
            <Card>
              {sectionTitle('Daily pulse', 'last 30 days of lead volume in the active selection')}
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={byDay} margin={{ left:0, right:12, top:4, bottom:4 }}>
                  <defs>
                    <linearGradient id="ovLeadsFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.navy} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={C.navy} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={fmtN} />
                  <Tooltip content={<BrandTooltip />} />
                  <Area type="monotone" dataKey="leads" name="Leads" stroke={C.navy} strokeWidth={2.5} fill="url(#ovLeadsFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* COST TREND, DAY BY DAY - the cost twin of the daily pulse above */}
          <div style={{ marginTop:16 }}>
            <CostTrendDay data={costByDay} fmtINR={fmtINR} />
          </div>

          {/* TOP MOVERS — what to scale, framed for decisions */}
          <div className="lq-grid2" style={{ ...grid2, marginTop:16 }}>
            <Card>
              {sectionTitle('Top campaigns by volume', 'where the leads are coming from right now')}
              <RankedBars data={topCampaignsByLeads.map(c => ({ campaign:c.campaign, count:c.leads }))} labelKey="campaign" max={topCampaignsByLeads.length ? topCampaignsByLeads[0].leads : 1} total={totalSourceLeads} showRank />
            </Card>
            <Card>
              {sectionTitle('Best campaigns to scale', 'highest Total QL rate among campaigns with real volume (min. 15 queued)')}
              <EfficiencyList data={topCampaignsByEfficiency} labelKey="campaign" rateKey="qlRate" subKey="queued" />
            </Card>
          </div>

          {/* CPQL vs. VOLUME EFFICIENCY MAP — bubble size = spend. Median lines split the
              chart into the same quadrants as the campaign-performance heuristic: high CPQL
              is a red flag no matter the volume; low CPQL only counts as a proven best
              performer once QL volume clears the median. */}
          <div style={{ marginTop:16 }}>
            <Card>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10, marginBottom:14 }}>
                {sectionTitle('Campaign efficiency map', 'CPQL vs. Total QL volume — bubble size = spend, top 30 campaigns by volume')}
                <div style={{ display:'flex', gap:14, flexWrap:'wrap' }}>
                  {[['best', 'Best — scale'], ['promising', 'Promising'], ['flag', 'High CPQL — flag']].map(([k, l]) => (
                    <div key={k} style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ width:9, height:9, borderRadius:99, background:QUADRANT_COLOR[k], flexShrink:0 }} />
                      <span style={{ fontSize:12, fontWeight:600, color:C.muted, whiteSpace:'nowrap' }}>{l}</span>
                    </div>
                  ))}
                </div>
              </div>
              {campaignEfficiencyMap.points.length === 0 ? (
                <div style={{ textAlign:'center', padding:'24px 0', color:C.muted, fontSize:14.5, fontFamily:FONT }}>Not enough volume yet</div>
              ) : (
                <ResponsiveContainer width="100%" height={340}>
                  <ScatterChart margin={{ top:8, right:24, bottom:8, left:8 }}>
                    <CartesianGrid stroke={C.border} />
                    <XAxis type="number" dataKey="totalQL" name="Total QLs" tick={axis} tickFormatter={fmtN} label={{ value:'Total QLs (volume)', position:'insideBottom', offset:-6, style:{ ...axis, fontWeight:700 } }} />
                    <YAxis type="number" dataKey="cpql" name="CPQL" tick={axis} tickFormatter={v => fmtINRShort(v)} width={70} />
                    <ZAxis type="number" dataKey="spend" range={[60, 600]} name="Spend" />
                    <ReferenceLine x={campaignEfficiencyMap.medQL} stroke={C.muted} strokeDasharray="4 4" label={{ value:'Median volume', position:'top', fontSize:13.5, fill:C.muted }} />
                    <ReferenceLine y={campaignEfficiencyMap.medCpql} stroke={C.muted} strokeDasharray="4 4" label={{ value:'Median CPQL', position:'right', fontSize:13.5, fill:C.muted }} />
                    <Tooltip content={<EfficiencyMapTooltip />} cursor={{ strokeDasharray:'3 3' }} />
                    <Scatter data={campaignEfficiencyMap.points}>
                      {campaignEfficiencyMap.points.map((p, i) => (
                        <Cell key={i} fill={QUADRANT_COLOR[p.quadrant]} fillOpacity={0.75} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          {/* CORRIDORS AND ADS ON CPQL, THEN WHAT IS NOT WORKING */}
          <div style={{ marginTop:16 }}>
            <CorridorRanking cmp={reportCmp} minQL={CORRIDOR_MIN_QL} prevLabel={prevLabel} fmtINR={fmtINR} fmtINRShort={fmtINRShort} />
          </div>
          <AdRanking cmp={reportCmp} minQL={CORRIDOR_MIN_QL} prevLabel={prevLabel} fmtINR={fmtINR} fmtINRShort={fmtINRShort} />
          <NotPerforming cmp={reportCmp} minQL={CORRIDOR_MIN_QL} prevLabel={prevLabel} fmtINR={fmtINR} fmtINRShort={fmtINRShort} />


          {compareOpen && (
            <div onClick={e => { if (e.target === e.currentTarget) setCompareOpen(false) }}
              style={{ position:'fixed', inset:0, zIndex:600, background:'rgba(15,23,42,0.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
              <div ref={compareModalRef} role="dialog" aria-modal="true" aria-labelledby="compare-modal-title" tabIndex={-1} style={{ background:'var(--card)', borderRadius:18, width:'min(1120px, 96vw)', maxHeight:'88vh', overflowY:'auto', boxShadow:'0 24px 64px rgba(15,23,42,0.28)', fontFamily:FONT }}>
                <div style={{ padding:'20px 24px', borderBottom:`0.5px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div>
                    <div id="compare-modal-title" style={{ fontSize:18, fontWeight:800, color:C.text }}>Compare periods</div>
                    <div style={{ fontSize:15, color:C.muted, marginTop:2 }}>{currentLabel} vs {compareLabel}</div>
                  </div>
                  <button onClick={() => setCompareOpen(false)} style={{ border:'none', background:'transparent', color:C.muted, cursor:'pointer', display:'flex', padding:4 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>

                <div style={{ padding:'18px 24px 24px' }}>
                  {/* Period-B selector */}
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:compareMode === 'custom' ? 10 : 16, flexWrap:'wrap' }}>
                    {[['prev', 'Previous period'], ['yoy', 'Same period last year'], ['custom', 'Custom range']].map(([m, lbl]) => (
                      <button key={m} onClick={() => { setCompareMode(m); if (m === 'custom') prefillCustomRange() }}
                        style={{ padding:'7px 13px', borderRadius:8, border:`0.5px solid ${compareMode === m ? C.navy : C.border}`, background: compareMode === m ? C.navyBg : 'var(--card)', color: compareMode === m ? C.navy : C.sub, fontSize:15, fontWeight:700, fontFamily:FONT, cursor:'pointer' }}>
                        {lbl}
                      </button>
                    ))}
                  </div>

                  {compareMode === 'custom' && (() => {
                    const parseYmd = s => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
                    const daysBetween = (fromStr, toStr) => { const f = parseYmd(fromStr), t = parseYmd(toStr); return (f && t) ? Math.round((t - f) / 86400000) + 1 : null }
                    const daysA = daysBetween(compareCustomFromA, compareCustomToA)
                    const daysB = daysBetween(compareCustomFrom, compareCustomTo)
                    const mismatch = daysA != null && daysB != null && daysA !== daysB
                    const RangeField = ({ label, fromStr, toStr, open, setOpen, onApply }) => (
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <span style={{ fontSize:14, fontWeight:700, color:C.muted, width:34, flexShrink:0 }}>{label}</span>
                        <div style={{ position:'relative' }}>
                          <button onClick={() => setOpen(v => !v)}
                            style={{ display:'flex', alignItems:'center', gap:7, padding:'7px 12px', borderRadius:8, border:`0.5px solid ${open ? C.navy : C.border}`, background: open ? C.navyBg : 'var(--card)', color: fromStr ? C.text : C.muted, cursor:'pointer', fontFamily:FONT, fontSize:15, fontWeight:600 }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                            {fromStr && toStr ? `${fromStr} -> ${toStr}` : 'Pick a range'}
                          </button>
                          {open && (
                            <>
                              <div onClick={() => setOpen(false)} style={{ position:'fixed', inset:0, zIndex:699 }} />
                              <div style={{ position:'absolute', left:0, top:'calc(100% + 8px)', zIndex:700, background:'var(--card)', border:`0.5px solid ${C.border}`, borderRadius:14, boxShadow:'0 20px 60px rgba(15,23,42,0.16), 0 4px 12px rgba(15,23,42,0.06)', overflow:'hidden' }}>
                                <DateRangePicker from={parseYmd(fromStr)} to={parseYmd(toStr)} presets={buildDatePresets()} onChange={(f, t) => { onApply(f, t); setOpen(false) }} />
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )
                    return (
                      <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:16, background:'var(--bg2)', border:`0.5px solid ${C.border}`, borderRadius:10, padding:'12px 14px' }}>
                        <RangeField label="This:" fromStr={compareCustomFromA} toStr={compareCustomToA} open={showComparePickerA} setOpen={setShowComparePickerA} onApply={(f, t) => { setCompareCustomFromA(f); setCompareCustomToA(t) }} />
                        <RangeField label="Vs:" fromStr={compareCustomFrom} toStr={compareCustomTo} open={showComparePickerB} setOpen={setShowComparePickerB} onApply={(f, t) => { setCompareCustomFrom(f); setCompareCustomTo(t) }} />
                        {daysA != null && daysB != null && (
                          <div style={{ fontSize:14, color: mismatch ? C.navy : C.muted, fontWeight: mismatch ? 700 : 400 }}>
                            {daysA} day{daysA === 1 ? '' : 's'} vs {daysB} day{daysB === 1 ? '' : 's'}
                            {mismatch && ' — different lengths, deltas may look larger/smaller than a like-for-like comparison'}
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {compareRows.length === 0 || periodARows.length === 0 ? (
                    <div style={{ textAlign:'center', padding:'32px 0', color:C.muted, fontSize:14.5 }}>
                      {compareMode === 'custom' ? 'Pick both date ranges to compare.' : 'No data available for that period.'}
                    </div>
                  ) : (
                    <>
                      {/* Verdict */}
                      {compareVerdict && (
                        <div style={{
                          padding:'12px 16px', borderRadius:10, marginBottom:16, fontSize:15, fontWeight:700, lineHeight:1.5,
                          background: compareVerdict.tone === 'good' ? C.greenBg : compareVerdict.tone === 'bad' ? C.navyBg : compareVerdict.tone === 'warn' ? '#E3F5FD' : '#F8FAFC',
                          color: compareVerdict.tone === 'good' ? '#2F7A4B' : compareVerdict.tone === 'bad' ? C.navy : compareVerdict.tone === 'warn' ? '#0C6E93' : C.sub,
                        }}>
                          {compareVerdict.text}
                        </div>
                      )}

                      {/* KPI comparison grid */}
                      <div className="lq-kpi-grid" style={{ display:'grid', gridTemplateColumns:'repeat(3, minmax(0,1fr))', gap:10, marginBottom:18 }}>
                        {[
                          { label:'Total QL', a:periodAKpis.totalQL, b:compareKpis.totalQL, fmt:fmtN },
                          { label:'Leads', a:periodAKpis.leads, b:compareKpis.leads, fmt:fmtN },
                          { label:'Spend', a:periodAKpis.spend, b:compareKpis.spend, fmt:fmtINR },
                          { label:'CPQL', a:periodACpql, b:compareCpql, fmt:fmtINR, invert:true },
                          { label:'CPL', a:periodACpl, b:compareCpl, fmt:fmtINR, invert:true },
                          { label:'Applications', a:periodAKpis.apps, b:compareKpis.apps, fmt:fmtN },
                        ].map(m => {
                          const d = deltaPct(m.a, m.b)
                          const good = d == null ? null : (m.invert ? d < 0 : d > 0)
                          return (
                            <div key={m.label} style={{ padding:'12px 14px', borderRadius:10, border:`0.5px solid ${C.border}`, background:'var(--bg2)' }}>
                              <div style={{ fontSize:13.5, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:6 }}>{m.label}</div>
                              <div style={{ fontSize:18.5, fontWeight:800, color:C.text }}>{m.fmt(m.a)}</div>
                              <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:4 }}>
                                <span style={{ fontSize:14, color:C.muted }}>was {m.fmt(m.b)}</span>
                                {d != null && (
                                  <span style={{ fontSize:14, fontWeight:700, color: good == null ? C.muted : good ? '#2F7A4B' : C.navy }}>
                                    {d > 0 ? '+' : ''}{d.toFixed(0)}%
                                  </span>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {/* Ranked movers */}
                      {compareMovers.length > 0 && (
                        <div style={{ marginBottom:16 }}>
                          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8, flexWrap:'wrap', gap:8 }}>
                            <div style={{ fontSize:14, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'0.05em' }}>What's driving it</div>
                            <div style={{ display:'flex', gap:4 }}>
                              {[['corridor', 'Corridor'], ['source', 'Source'], ['campaign', 'Campaign']].map(([g, lbl]) => (
                                <button key={g} onClick={() => setCompareGroupBy(g)}
                                  style={{ padding:'4px 10px', borderRadius:6, border:'none', cursor:'pointer', fontFamily:FONT, fontSize:14, fontWeight:700, background: compareGroupBy === g ? C.navy : 'var(--bg2)', color: compareGroupBy === g ? '#fff' : C.sub }}>
                                  {lbl}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                            {compareMovers.map(mv => (
                              <div key={mv.corridor} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', borderRadius:9, background:'var(--bg2)' }}>
                                <div style={{ flex:1, minWidth:0, fontSize:14, fontWeight:700, color:C.text, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{mv.corridor}</div>
                                <div style={{ fontSize:14, color:C.muted }}>{fmtN(mv.bQL)} → {fmtN(mv.aQL)} QL</div>
                                <div style={{ fontSize:15, fontWeight:800, color: mv.deltaQL > 0 ? '#2F7A4B' : mv.deltaQL < 0 ? C.navy : C.muted, minWidth:60, textAlign:'right' }}>
                                  {mv.deltaQL > 0 ? '+' : ''}{fmtN(mv.deltaQL)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Recommended action */}
                      {compareAction && (
                        <div style={{ background:C.greenBg, border:'0.5px solid rgba(76,174,111,0.3)', borderRadius:10, padding:'12px 14px' }}>
                          <div style={{ fontSize:13.5, fontWeight:800, letterSpacing:'0.05em', textTransform:'uppercase', color:'#2F7A4B', marginBottom:3 }}>Recommended action</div>
                          <div style={{ fontSize:14.5, fontWeight:600, color:C.text, lineHeight:1.5 }}>{compareAction}</div>
                        </div>
                      )}

                      {/* Full breakdown -- every row, every metric, any of the 5 dimensions,
                          with an exact (unrounded) CSV/JSON export. Distinct from the top-5
                          "movers" strip above: this is the exhaustive version. */}
                      <div style={{ marginTop:20, paddingTop:18, borderTop:`0.5px solid ${C.border}` }}>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10, flexWrap:'wrap', gap:8 }}>
                          <div style={{ fontSize:14, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'0.05em' }}>Full breakdown -- every {DEEP_DIMENSIONS.find(d => d.key === compareTableDim)?.label.toLowerCase()}</div>
                          <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                            {DEEP_DIMENSIONS.map(d => (
                              <button key={d.key} onClick={() => setCompareTableDim(d.key)}
                                style={{ padding:'4px 10px', borderRadius:6, border:'none', cursor:'pointer', fontFamily:FONT, fontSize:14, fontWeight:700, background: compareTableDim === d.key ? C.navy : 'var(--bg2)', color: compareTableDim === d.key ? '#fff' : C.sub }}>
                                {d.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Deep filter -- zoom into a specific corridor/source/campaign
                            within both periods, without touching the page behind this modal. */}
                        <div style={{ display:'flex', alignItems:'flex-end', gap:12, marginBottom:12, flexWrap:'wrap' }}>
                          <SourceMultiSelect label="Corridor" minWidth={130} options={CORRIDORS.map(c => c.label)} selected={deepCorridorFilter} onChange={setDeepCorridorFilter} />
                          <SourceMultiSelect label="Source" minWidth={110} options={sources.filter(s => s !== 'All')} selected={deepSourceFilter} onChange={setDeepSourceFilter} />
                          <CampaignSearch value={deepCampaignQuery} onChange={setDeepCampaignQuery} suggestions={deepCampaignSuggestions} minWidth={180} />
                          {deepFilterActive && (
                            <button onClick={clearDeepFilters} style={{ border:'none', background:'transparent', color:C.navy, cursor:'pointer', fontFamily:FONT, fontSize:15, fontWeight:700, padding:'6px 4px' }}>Clear filter</button>
                          )}
                        </div>

                        {!compareJoinable && (
                          <div style={{ fontSize:14, color:C.muted, marginBottom:10, lineHeight:1.5 }}>
                            {DEEP_DIMENSIONS.find(d => d.key === compareTableDim)?.label} values don't recur across two different ranges, so {currentLabel} and {compareLabel} are shown as two separate breakdowns rather than joined row-for-row.
                          </div>
                        )}

                        {compareJoinable ? (
                          compareTableRows.length === 0 ? (
                            <div style={{ fontSize:15, color:C.muted, padding:'12px 0' }}>No rows for this dimension in either period.</div>
                          ) : (
                            <div style={{ maxHeight:280, overflowY:'auto', border:`0.5px solid ${C.border}`, borderRadius:10 }}>
                              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:15 }}>
                                <thead style={{ position:'sticky', top:0, background:'var(--card)', zIndex:1 }}>
                                  <tr>
                                    {[DEEP_DIMENSIONS.find(d => d.key === compareTableDim)?.label, 'Spend ' + currentLabel, 'Spend ' + compareLabel, 'Total QL ' + currentLabel, 'Total QL ' + compareLabel, 'Δ Total QL', 'CPQL ' + currentLabel, 'CPQL ' + compareLabel].map((h, i) => (
                                      <th key={i} style={{ textAlign: i === 0 ? 'left' : 'right', padding:'7px 10px', borderBottom:`0.5px solid ${C.border}`, color:C.muted, fontWeight:700, fontSize:13.5, textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {compareTableRows.map((r, i) => {
                                    const av = r.a ? summaryValue(r.a, 'totalQL') : null
                                    const bv = r.b ? summaryValue(r.b, 'totalQL') : null
                                    const d = (av != null && bv != null) ? av - bv : null
                                    return (
                                      <tr key={r.label + i} style={{ background: i % 2 ? 'var(--bg2)' : 'transparent' }}>
                                        <td style={{ padding:'6px 10px', fontWeight:600, color:C.text, maxWidth:220, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.label}</td>
                                        <td style={{ padding:'6px 10px', textAlign:'right', color:C.sub }}>{r.a ? fmtINR(r.a.spend) : '—'}</td>
                                        <td style={{ padding:'6px 10px', textAlign:'right', color:C.muted }}>{r.b ? fmtINR(r.b.spend) : '—'}</td>
                                        <td style={{ padding:'6px 10px', textAlign:'right', color:C.sub }}>{av != null ? fmtN(av) : '—'}</td>
                                        <td style={{ padding:'6px 10px', textAlign:'right', color:C.muted }}>{bv != null ? fmtN(bv) : '—'}</td>
                                        <td style={{ padding:'6px 10px', textAlign:'right', fontWeight:700, color: d == null ? C.muted : d > 0 ? '#2F7A4B' : d < 0 ? C.navy : C.muted }}>{d == null ? '—' : (d > 0 ? '+' : '') + fmtN(d)}</td>
                                        <td style={{ padding:'6px 10px', textAlign:'right', color:C.sub }}>{summaryFmt('cpql', summaryValue(r.a || {}, 'cpql'))}</td>
                                        <td style={{ padding:'6px 10px', textAlign:'right', color:C.muted }}>{summaryFmt('cpql', summaryValue(r.b || {}, 'cpql'))}</td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )
                        ) : (
                          <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0,1fr))', gap:12 }} className="lq-grid2">
                            {[[currentLabel, compareBreakdownA], [compareLabel, compareBreakdownB]].map(([lbl, list]) => (
                              <div key={lbl} style={{ border:`0.5px solid ${C.border}`, borderRadius:10, overflow:'hidden' }}>
                                <div style={{ padding:'8px 10px', background:'var(--bg2)', fontSize:14, fontWeight:700, color:C.text, borderBottom:`0.5px solid ${C.border}` }}>{lbl}</div>
                                <div style={{ maxHeight:240, overflowY:'auto' }}>
                                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:15 }}>
                                    <thead style={{ position:'sticky', top:0, background:'var(--card)' }}>
                                      <tr>
                                        {['Period', 'Spend', 'Total QL', 'CPQL'].map((h, i) => (
                                          <th key={i} style={{ textAlign: i === 0 ? 'left' : 'right', padding:'6px 10px', borderBottom:`0.5px solid ${C.border}`, color:C.muted, fontWeight:700, fontSize:13.5, textTransform:'uppercase' }}>{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {list.length === 0 ? (
                                        <tr><td colSpan={4} style={{ padding:'12px 10px', color:C.muted, fontSize:15 }}>No data.</td></tr>
                                      ) : list.map((e, i) => (
                                        <tr key={e.key} style={{ background: i % 2 ? 'var(--bg2)' : 'transparent' }}>
                                          <td style={{ padding:'6px 10px', fontWeight:600, color:C.text, whiteSpace:'nowrap' }}>{e.label}</td>
                                          <td style={{ padding:'6px 10px', textAlign:'right', color:C.sub }}>{fmtINR(e.spend)}</td>
                                          <td style={{ padding:'6px 10px', textAlign:'right', color:C.sub }}>{fmtN(e.totalQL)}</td>
                                          <td style={{ padding:'6px 10px', textAlign:'right', color:C.sub }}>{summaryFmt('cpql', summaryValue(e, 'cpql'))}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        <div style={{ marginTop:10, display:'flex', justifyContent:'flex-end' }}>
                          <ExportButton
                            data={compareExportRowsFmt}
                            rawData={compareExportRows}
                            filename={'overall-compare-' + compareTableDim}
                            dashboardId="overall"
                            hideSlack
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {trendOpen && (
            <div onClick={e => { if (e.target === e.currentTarget) setTrendOpen(false) }}
              style={{ position:'fixed', inset:0, zIndex:600, background:'rgba(15,23,42,0.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
              <div ref={trendModalRef} role="dialog" aria-modal="true" aria-labelledby="trend-modal-title" tabIndex={-1} style={{ background:'var(--card)', borderRadius:18, width:'min(1320px, 96vw)', maxHeight:'88vh', overflowY:'auto', boxShadow:'0 24px 64px rgba(15,23,42,0.28)', fontFamily:FONT }}>
                <div style={{ padding:'20px 24px', borderBottom:`0.5px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div>
                    <div id="trend-modal-title" style={{ fontSize:18, fontWeight:800, color:C.text }}>Trend Analysis</div>
                    <div style={{ fontSize:15, color:C.muted, marginTop:2 }}>Trajectory across trailing periods -- not just two points</div>
                  </div>
                  <button onClick={() => setTrendOpen(false)} style={{ border:'none', background:'transparent', color:C.muted, cursor:'pointer', display:'flex', padding:4 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>

                <div style={{ padding:'18px 24px 24px' }}>
                  {/* Controls */}
                  <div style={{ display:'flex', alignItems:'flex-end', gap:12, marginBottom:16, flexWrap:'wrap' }}>
                    <div>
                      <div style={{ fontSize:13.5, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:5 }}>Dimension</div>
                      <div style={{ display:'flex', gap:4 }}>
                        {DEEP_DIMENSIONS.map(d => (
                          <button key={d.key} onClick={() => setTrendDim(d.key)}
                            style={{ padding:'6px 11px', borderRadius:7, border:'none', cursor:'pointer', fontFamily:FONT, fontSize:15, fontWeight:700, background: trendDim === d.key ? C.navy : 'var(--bg2)', color: trendDim === d.key ? '#fff' : C.sub }}>
                            {d.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {!trendIsSingleSeries && (
                      <Dropdown label="Granularity" minWidth={110}
                        value={trendGranularity === 'day' ? 'Day' : trendGranularity === 'week' ? 'Week' : 'Month'}
                        options={['Day', 'Week', 'Month']}
                        onChange={v => setTrendGranularity(v.toLowerCase())} />
                    )}
                    <Dropdown label="Trailing periods" minWidth={90} value={trendPeriods} options={[6, 12, 24, 52]} onChange={setTrendPeriods} />
                    <Dropdown label="Metric" minWidth={150}
                      value={DEEP_METRICS.find(m => m.key === trendMetric)?.label || trendMetric}
                      options={DEEP_METRICS.map(m => m.label)}
                      onChange={lbl => { const m = DEEP_METRICS.find(x => x.label === lbl); if (m) setTrendMetric(m.key) }} />
                  </div>

                  {/* Deep filter -- zoom into a specific corridor/source/campaign without
                      touching the page's own toolbar filters behind this modal. */}
                  <div style={{ display:'flex', alignItems:'flex-end', gap:12, marginBottom:16, flexWrap:'wrap', paddingBottom:14, borderBottom:`0.5px solid ${C.border}` }}>
                    <SourceMultiSelect label="Corridor" minWidth={130} options={CORRIDORS.map(c => c.label)} selected={deepCorridorFilter} onChange={setDeepCorridorFilter} />
                    <SourceMultiSelect label="Source" minWidth={110} options={sources.filter(s => s !== 'All')} selected={deepSourceFilter} onChange={setDeepSourceFilter} />
                    <CampaignSearch value={deepCampaignQuery} onChange={setDeepCampaignQuery} suggestions={deepCampaignSuggestions} minWidth={180} />
                    {deepFilterActive && (
                      <button onClick={clearDeepFilters} style={{ border:'none', background:'transparent', color:C.navy, cursor:'pointer', fontFamily:FONT, fontSize:15, fontWeight:700, padding:'6px 4px' }}>Clear filter</button>
                    )}
                  </div>

                  {/* Trend's own trailing window is usually WIDER than whatever range the
                      page itself already had loaded (e.g. 6 trailing months vs a 1-month
                      MTD view), so opening this modal can kick off a real BigQuery read that
                      is still in flight. Until it lands, nonDateRows is still the narrower
                      range from before -- silently charting that as if it were the whole
                      trailing window would show early periods as a real, confident zero
                      when they simply have not been fetched yet. Say so instead. */}
                  {bqMode && bqBusy && (
                    <div style={{ display:'flex', alignItems:'center', gap:8, background:C.navyBg, border:`0.5px solid ${C.border}`, borderRadius:10, padding:'9px 12px', marginBottom:14, fontSize:14, color:C.navy, fontWeight:700 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation:'spin .8s linear infinite', flexShrink:0 }}><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
                      Fetching the full trailing window from BigQuery -- earlier periods below may still read zero until this finishes.
                    </div>
                  )}

                  {!trendMaxDate ? (
                    <div style={{ textAlign:'center', padding:'32px 0', color:C.muted, fontSize:14.5 }}>No dated rows to trend.</div>
                  ) : (
                    <>
                      <div style={{ fontSize:14, color:C.muted, marginBottom:10 }}>
                        {trendBuckets.length} trailing {trendEffectiveGranularity === 'month' ? 'months' : trendEffectiveGranularity === 'week' ? 'weeks' : 'days'} ending {dayLabel(trendMaxDate)}, {sourceIsAll ? 'all sources' : sourceLabel}{corridorFilter !== 'All' ? ', ' + corridorFilter : ''}
                        {!deepCorridorIsAll && <> · corridor: {deepCorridorFilter.length === 1 ? deepCorridorFilter[0] : deepCorridorFilter.length + ' selected'}</>}
                        {!deepSourceIsAll && <> · source: {deepSourceFilter.length === 1 ? deepSourceFilter[0] : deepSourceFilter.length + ' selected'}</>}
                        {deepCampaignQuery.trim() && <> · campaign contains "{deepCampaignQuery.trim()}"</>}.
                        {!trendIsSingleSeries && trendResult.totalCount > trendResult.shownCount && (
                          <> Charting the top {trendResult.shownCount} of {trendResult.totalCount} by Total QL -- every one of the {trendResult.totalCount} is in the export below.</>
                        )}
                      </div>

                      <div style={{ background:'var(--bg2)', border:`0.5px solid ${C.border}`, borderRadius:12, padding:'14px 16px 6px', marginBottom:16 }}>
                        <ResponsiveContainer width="100%" height={260}>
                          {trendIsSingleSeries ? (
                            <LineChart data={trendResult.chartRows} margin={{ left:0, right:12, top:4, bottom:4 }}>
                              <CartesianGrid vertical={false} stroke={C.border} />
                              <XAxis dataKey="period" tick={{ fontSize:14, fill:C.muted }} axisLine={false} tickLine={false} />
                              <YAxis tick={{ fontSize:14, fill:C.muted }} axisLine={false} tickLine={false} width={54} />
                              <Tooltip formatter={v => DEEP_METRICS.find(m => m.key === trendMetric)?.fmt(v)} contentStyle={{ fontSize:15, borderRadius:8, border:`0.5px solid ${C.border}` }} />
                              <Line type="monotone" dataKey="value" name={DEEP_METRICS.find(m => m.key === trendMetric)?.label} stroke={C.navy} strokeWidth={2.5} strokeDasharray={trendMaybeLoading ? '5 4' : undefined} dot={{ r:3 }} />
                            </LineChart>
                          ) : (
                            <LineChart data={trendResult.chartRows} margin={{ left:0, right:12, top:4, bottom:4 }}>
                              <CartesianGrid vertical={false} stroke={C.border} />
                              <XAxis dataKey="period" tick={{ fontSize:14, fill:C.muted }} axisLine={false} tickLine={false} />
                              <YAxis tick={{ fontSize:14, fill:C.muted }} axisLine={false} tickLine={false} width={54} />
                              <Tooltip formatter={v => DEEP_METRICS.find(m => m.key === trendMetric)?.fmt(v)} contentStyle={{ fontSize:15, borderRadius:8, border:`0.5px solid ${C.border}` }} />
                              <Legend wrapperStyle={{ fontSize:14 }} />
                              {trendResult.seriesKeys.map((k, i) => (
                                <Line key={k} type="monotone" dataKey={k} name={trendResult.seriesLabels[k]} stroke={brandColor(i)} strokeWidth={2} strokeDasharray={trendMaybeLoading ? '5 4' : undefined} dot={{ r:2.5 }} />
                              ))}
                            </LineChart>
                          )}
                        </ResponsiveContainer>
                      </div>

                      {/* Pivoted table -- periods across the top, one row per dimension
                          value (or a single Total row for month/day) down the side,
                          showing whichever metric the picker above has selected. Every
                          header is click-to-sort; the row-label column sorts A-Z, a
                          period column sorts by that period's value, and the default
                          is total-across-periods so the biggest movers lead. */}
                      <div style={{ maxHeight:340, overflowY:'auto', border:`0.5px solid ${C.border}`, borderRadius:10, marginBottom:12 }}>
                        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:15 }}>
                          <thead style={{ position:'sticky', top:0, background:'var(--card)', zIndex:1 }}>
                            <tr>
                              <th onClick={() => handlePivotSort('label')}
                                style={{ textAlign:'left', padding:'7px 10px', borderBottom:`0.5px solid ${C.border}`, color: trendPivotSortKey === 'label' ? C.navy : C.muted, fontWeight:700, fontSize:13.5, textTransform:'uppercase', whiteSpace:'nowrap', cursor:'pointer', userSelect:'none' }}>
                                {trendPivotDimLabel || trendMetricDef.label}{trendPivotSortKey === 'label' ? (trendPivotSortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                              </th>
                              {trendBuckets.map((b, i) => {
                                const active = trendPivotSortKey === i
                                return (
                                  <th key={b.key} onClick={() => handlePivotSort(i)}
                                    style={{ textAlign:'right', padding:'7px 10px', borderBottom:`0.5px solid ${C.border}`, color: active ? C.navy : C.muted, fontWeight:700, fontSize:13.5, textTransform:'uppercase', whiteSpace:'nowrap', cursor:'pointer', userSelect:'none' }}>
                                    {b.label}{active ? (trendPivotSortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                                  </th>
                                )
                              })}
                            </tr>
                            {/* TOTAL row pinned in the header (not the body) so it stays
                                visible while the rows below scroll -- same convention as
                                the main Funnel Summary table's own TOTAL row. Only shown
                                for a real dimension breakdown; month/day's single "Total"
                                row already IS the total, so this would just repeat it. */}
                            {!trendIsSingleSeries && (
                              <tr>
                                <td style={{ padding:'6px 10px', fontWeight:800, color:C.text, borderBottom:`0.5px solid ${C.border}`, background:'var(--card)' }}>Total</td>
                                {trendResult.grandTotal.map((v, i) => (
                                  <td key={i} style={{ padding:'6px 10px', textAlign:'right', fontWeight:800, color:C.text, borderBottom:`0.5px solid ${C.border}`, background:'var(--card)', whiteSpace:'nowrap' }}>
                                    {trendMaybeLoading && !v ? <span className="skeleton" style={{ display:'inline-block', width:34, height:11, verticalAlign:'middle' }} /> : trendMetricDef.fmt(v)}
                                  </td>
                                ))}
                              </tr>
                            )}
                          </thead>
                          <tbody>
                            {trendPivotSorted.length === 0 ? (
                              <tr><td colSpan={trendBuckets.length + 1} style={{ padding:'12px 10px', color:C.muted }}>No rows.</td></tr>
                            ) : trendPivotSorted.map((row, i) => (
                              <tr key={row.label} style={{ background: i % 2 ? 'var(--bg2)' : 'transparent' }}>
                                <td style={{ padding:'6px 10px', fontWeight:600, color:C.text, whiteSpace:'nowrap', maxWidth:220, overflow:'hidden', textOverflow:'ellipsis' }}>{row.label}</td>
                                {row.values.map((v, j) => (
                                  <td key={j} style={{ padding:'6px 10px', textAlign:'right', color:C.sub, whiteSpace:'nowrap' }}>
                                    {trendMaybeLoading && !v ? <span className="skeleton" style={{ display:'inline-block', width:28, height:11, verticalAlign:'middle' }} /> : trendMetricDef.fmt(v)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div style={{ display:'flex', justifyContent:'flex-end' }}>
                        <ExportButton
                          data={trendExportRowsFmt}
                          rawData={trendResult.exportRows}
                          filename={'overall-trend-' + trendDim + '-' + trendEffectiveGranularity}
                          dashboardId="overall"
                          hideSlack
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
