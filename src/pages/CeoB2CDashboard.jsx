import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer } from 'recharts'
import Sidebar from '../components/Sidebar'
import Dropdown from '../components/Dropdown'
import DateRangePicker from '../components/DateRangePicker'
import KPICard from '../components/KPICard'
import Button from '../components/Button'
import SlackReportPanel from '../components/SlackReportPanel'
import { captureNodePng, rowsToCsv, nextPaint } from '../lib/slackShare'
import { B2C_REPORT_VERSIONS, B2C_FULL_TABLE_VERSIONS, B2C_CASHFLOW_TABLE_VERSIONS, DEFAULT_REV_VS_CASHFLOW_NOTE } from '../lib/b2cReport'
import { B2C_LEDGER_VERSIONS } from '../lib/b2cLedger'
import { CEO_BRIEF_VERSIONS } from '../lib/ceoBrief'
import styles from './CeoB2CDashboard.module.css'
import { BarGrad, barFill, BAR_RADIUS, BAR_RADIUS_H, BAR_MAX, NEUTRAL_TRACK } from '../ui/dashboardKit'
import { SlackIcon } from '../components/icons/BrandIcons'
import { channelHandle } from '../../shared/slackChannels.mjs'
import { useAuth } from '../hooks/useAuth'

// Line items exactly as the finance sheet names them, in sheet order. The
// Daily P&L tab splits SR into Online/Offline (2026-08); Daily Cash Flow does
// not -- its SR column was always a single combined total -- so each
// statement gets its own revenue-line list rather than sharing one.
// The same tab later split its combined offline-revenue column into AC
// Offline / Leverage One Offline too (still P&L only) -- shown here the same way SR
// was, as two separate lines rather than one combined row. 'offRev' (their
// sum, derived server-side) still exists on each row for anything that wants
// the combined total (Slack reports etc.) -- just no longer rendered as its
// own table row here. A third new line, 'Upskilling Revenue' (2026-09, P&L
// only), is deliberately kept OUT of this array too -- it isn't part of the
// Online/Offline split, and REV is sliced positionally (REV.slice(0,3) /
// REV.slice(3)) for those two subgroups, so appending it here would silently
// fold it into "Offline". It's handled as its own explicit field instead --
// see totals()/day's own comments below -- and rendered as its own row.
const REV_PNL = [['srOnline', 'SR Online'], ['ac', 'AC Online'], ['vas', 'Leverage One Online'], ['srOffline', 'SR Offline'], ['acOffline', 'AC Offline'], ['vasOffline', 'Leverage One Offline']]
// Verbatim off the Daily Cash Flow - Ramesh tab, C2:F2 -- shown exactly as
// Finance titled them, not shortened like the P&L page's Online/Offline split.
const REV_CASHFLOW = [
  ['sr', 'Actuals SR Revenue (Online + Offline)'], ['ac', 'Actuals AC Online Revenue'],
  ['vas', 'Actuals Leverage One Online Revenue'], ['offRev', 'Actuals Offline Revenue (AC + Leverage One)'],
]
// 'Corp. Salary' -- a new cost line Finance added alongside 'Corp. Overheads'
// (2026-09, api/crm-leads.js's B2C_PNL_COLS has the full story), P&L only --
// Cash Flow rows carry no such field, so it resolves to null there and never
// shows on that statement's own separate table (COST_CASHFLOW below, unchanged).
const COST = [['people', 'People'], ['pm', 'Performance Marketing'], ['op', 'Product Operating Cost (AC, Leverage One)'], ['offCost', 'Offline Cost (partner payout + experience centre)'], ['corp', 'Corp. Overheads'], ['corpSalary', 'Corp. Salary']]
// Verbatim off the same tab, H2:L2 -- Cash Flow's own wording, which differs
// slightly from the P&L labels above (e.g. "Actuals PM Cost" vs "Performance
// Marketing (Total)"), so it needs its own array rather than sharing COST.
const COST_CASHFLOW = [
  ['people', 'Actuals People Cost (incl. corporate people)'], ['pm', 'Actuals PM Cost'],
  ['op', 'Actuals Operating Cost (AC + Leverage One)'], ['offCost', 'Actuals Experience Centre Cost + Partner Payout'],
  ['corp', 'Actuals Corp. Overheads'],
]
const PLAN = [['people', 'People'], ['operating', 'Operating'], ['corp', 'Corp. Overheads'], ['offline', 'Offline (rent + staff)']]
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

function inr(n) {
  if (n == null || !isFinite(n)) return '\u2014'
  const a = Math.abs(n)
  const sg = n < 0 ? '-' : ''
  if (a >= 1e7) return sg + '\u20B9' + (a / 1e7).toFixed(2) + ' Cr'
  if (a >= 1e5) return sg + '\u20B9' + (a / 1e5).toFixed(2) + ' L'
  return sg + '\u20B9' + Math.round(a).toLocaleString('en-IN')
}
function full(n) {
  if (n == null || !isFinite(n)) return '\u2014'
  return (n < 0 ? '-' : '') + '\u20B9' + Math.round(Math.abs(n)).toLocaleString('en-IN')
}
// null + null stays null so a blank sheet never shows a confident zero.
function plus(a, b) { if (a == null && b == null) return null; return (a == null ? 0 : a) + (b == null ? 0 : b) }
function sub(a, b) { if (a == null && b == null) return null; return (a == null ? 0 : a) - (b == null ? 0 : b) }
function col(rows, k) { let t = null; for (const r of rows) { if (r[k] != null) t = (t == null ? 0 : t) + r[k] } return t }
function roll(o, defs) { return defs.reduce(function (a, d) { return plus(a, o[d[0]]) }, null) }
function ist(off) { return new Date(Date.now() + (off || 0) * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) }
// Pure calendar-date arithmetic on 'YYYY-MM-DD' strings -- Date.UTC keeps this
// immune to local-timezone/DST shifts, since these are already plain calendar
// dates with no time component to get confused about.
function shiftDate(iso, days) {
  const p = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(p[0], p[1] - 1, p[2]))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}
function daysBetweenIncl(fromIso, toIso) {
  const f = fromIso.split('-').map(Number)
  const t = toIso.split('-').map(Number)
  const a = Date.UTC(f[0], f[1] - 1, f[2])
  const b = Date.UTC(t[0], t[1] - 1, t[2])
  return Math.round((b - a) / 86400000) + 1
}

// Single-day picker for the Daily Report control below -- house rule is no
// native <input type="date">, and DateRangePicker (imported above, used for
// "Custom range") is a genuine two-endpoint range picker with its own
// two-click flow, not a fit for "pick exactly one day". Same visual language
// (tokens, cell rendering, nav arrows, today dot) as DateRangePicker's own
// CalMonth, just a single month, single click, and a real max-date cap
// instead of a range -- picking a day disables it here rather than only via
// an <input max=> attribute, which a user could otherwise type past.
const SDP_C = { navy: '#1F3C84', navyBg: 'var(--navy-tint)', blue: '#1C9FD4', border: 'var(--card-border)', text: 'var(--text)', muted: 'var(--text3)', sub: 'var(--text2)' }
const SDP_FONT = "'Plus Jakarta Sans','Inter',sans-serif"
const SDP_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const SDP_DAYS = ['Su','Mo','Tu','We','Th','Fr','Sa']
function isoOf(y, m, d) { return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0') }
function SingleDatePicker({ value, max, onChange, onClose }) {
  const parsed = value ? value.split('-').map(Number) : null
  const [viewYear, setViewYear] = React.useState(parsed ? parsed[0] : new Date().getFullYear())
  const [viewMonth, setViewMonth] = React.useState(parsed ? parsed[1] - 1 : new Date().getMonth())
  const first = new Date(viewYear, viewMonth, 1)
  const lastDay = new Date(viewYear, viewMonth + 1, 0).getDate()
  const startDow = first.getDay()
  const cells = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= lastDay; d++) cells.push(d)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const goLeft = function () { viewMonth === 0 ? (setViewYear(function (y) { return y - 1 }), setViewMonth(11)) : setViewMonth(function (m) { return m - 1 }) }
  const goRight = function () { viewMonth === 11 ? (setViewYear(function (y) { return y + 1 }), setViewMonth(0)) : setViewMonth(function (m) { return m + 1 }) }
  const NavBtn = function (p) {
    return (
      <button onClick={p.onClick} style={{
        width: 28, height: 28, borderRadius: 7, border: '0.5px solid ' + SDP_C.border,
        background: 'var(--card)', cursor: 'pointer', display: 'flex', alignItems: 'center',
        justifyContent: 'center', color: SDP_C.sub,
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          {p.dir === 'left' ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
        </svg>
      </button>
    )
  }
  return (
    <div style={{ padding: '16px 18px', fontFamily: SDP_FONT, width: 240 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10 }}>
        <NavBtn dir="left" onClick={goLeft} />
        <div style={{ flex: 1, textAlign: 'center', fontWeight: 700, fontSize: 13, color: SDP_C.text }}>{SDP_MONTHS[viewMonth]} {viewYear}</div>
        <NavBtn dir="right" onClick={goRight} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 4 }}>
        {SDP_DAYS.map(function (d) { return <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: SDP_C.muted, padding: '2px 0' }}>{d}</div> })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
        {cells.map(function (d, i) {
          if (!d) return <div key={'e' + i} />
          const iso = isoOf(viewYear, viewMonth, d)
          const disabled = !!max && iso > max
          const isSel = iso === value
          const cellDate = new Date(viewYear, viewMonth, d); cellDate.setHours(0, 0, 0, 0)
          const isToday = cellDate.getTime() === today.getTime()
          return (
            <button key={iso}
              onClick={function () { if (!disabled) { onChange(iso); onClose() } }}
              disabled={disabled}
              style={{
                width: '100%', aspectRatio: '1', border: 'none', cursor: disabled ? 'default' : 'pointer',
                borderRadius: 6, background: isSel ? SDP_C.navy : 'transparent',
                color: disabled ? SDP_C.muted : (isSel ? 'var(--card)' : SDP_C.text),
                opacity: disabled ? 0.4 : 1,
                fontSize: 11.5, fontWeight: isSel ? 700 : (isToday ? 600 : 400),
                fontFamily: SDP_FONT, position: 'relative',
              }}
              onMouseOver={function (e) { if (!disabled && !isSel) e.currentTarget.style.background = 'var(--bg3)' }}
              onMouseOut={function (e) { if (!disabled && !isSel) e.currentTarget.style.background = 'transparent' }}>
              {d}
              {isToday && !isSel && (
                <span style={{ position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: '50%', background: SDP_C.blue, display: 'block' }} />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Every total on this page is built the same way: trust the sheet's own total
// column when it is filled, otherwise add the line items up.
function totals(rs, revDefs) {
  const o = {}
  revDefs.concat(COST).forEach(function (d) { o[d[0]] = col(rs, d[0]) })
  o.rev = col(rs, 'totalRev'); if (o.rev == null) o.rev = roll(o, revDefs)
  o.cost = col(rs, 'totalCost'); if (o.cost == null) o.cost = roll(o, COST)
  o.net = col(rs, 'net'); if (o.net == null) o.net = sub(o.rev, o.cost)
  // P&L only -- the sheet's own 'EBITDA Before Corp. Overheads' column, summed
  // the same way as every other total; if a row is blank, derive it by adding
  // Corp. Overheads back onto the after-corp EBITDA above (the exact inverse
  // of what 'net' subtracts). Cash Flow rows carry no such field at all, so
  // this stays null there and is never rendered on that statement.
  o.ebitdaBeforeCorp = col(rs, 'ebitdaBeforeCorp'); if (o.ebitdaBeforeCorp == null) o.ebitdaBeforeCorp = plus(o.net, o.corp)
  // 'sr' is always the combined online+offline total regardless of whether
  // revDefs shows it split into two lines -- the backend already computed it
  // per row (api/crm-leads.js), so just sum that field directly rather than
  // deriving it from whichever line items happen to be in revDefs.
  o.sr = col(rs, 'sr')
  // Same idea for 'offRev' (combined AC + Leverage One Offline, also
  // precomputed per row). REV_PNL lists the two raw halves separately for the
  // page's own Online/Offline split, so this key was never in revDefs and
  // stayed undefined on every P&L ctx.rev.off -- meaning the "Offline"
  // revenue line on the Performance Brief / phone report / full ledger (the
  // three Slack versions that read a single combined Offline figure rather
  // than the page's own split rows) always showed a dash. Fixed here rather
  // than adding 'offRev' into REV_PNL itself, which would incorrectly fold
  // it into the last-3 slice the JSX below uses for the "Offline" subgroup.
  o.offRev = col(rs, 'offRev')
  // 'Upskilling Revenue' -- a brand-new revenue line Finance added to the
  // sheet (2026-09), not part of the Online/Offline split, so it lives
  // outside revDefs entirely too, same as 'sr'/'offRev' above.
  o.upskilling = col(rs, 'upskilling')
  return o
}
function chg(now, was) {
  if (now == null || was == null || !was) return null
  return ((now - was) / Math.abs(was)) * 100
}
function monthDays(m) {
  const p = String(m || '').split('-')
  const i = MONTHS.indexOf(String(p[0]).toLowerCase())
  const y = parseInt(p[1], 10)
  return i < 0 || !isFinite(y) ? null : new Date(y, i + 1, 0).getDate()
}
function shortOf(m) { const p = String(m || '').split('-'); return p.length === 2 ? p[0].slice(0, 3) : m }
// A signed, colour-coded change cell. Costs invert: spending more is not good news.
function dcell(v, invert) {
  if (v == null) return <td>{'\u2014'}</td>
  const good = invert ? v <= 0 : v >= 0
  return <td className={good ? styles.pos : styles.neg}>{(v >= 0 ? '+' : '') + v.toFixed(1) + '%'}</td>
}

// The two statements read from the same fetch (their days already share one
// internal row shape -- sr/ac/vas/offRev/totalRev/people/pm/op/offCost/corp/
// totalCost/net -- built server-side in api/crm-leads.js), so every formula
// below (totals/chart/trend/fy/dayStats) runs unchanged for both. Only the
// words on screen differ.
const STATEMENT_LABELS = {
  pnl: {
    dataKey: 'pnl', pageTitle: 'Daily P&L',
    revGroup: 'Revenue', costGroup: 'Cost',
    // The sheet's own bottom line here is EBITDA, not a cash concept -- see
    // api/crm-leads.js's net column mapping. Named exactly as the sheet's own
    // header ('EBITDA After Corp. Overheads') now that the Before/Corp split
    // row sits right above it in the table -- plain 'EBITDA' alone would be
    // ambiguous next to it. kpiNet below stays the short 'EBITDA' on purpose
    // (KPI cards are meant to be terse); every P&L-only label below says so;
    // Cash Flow's own net/kpiNet/etc. (below) are untouched.
    totalRev: 'Total Revenue', totalCost: 'Total Cost', net: 'EBITDA After Corp. Overheads',
    // Root words for the KPI cards -- the active date preset (MTD/Last Day/
    // Last 7D/Range) prefixes these at render time instead of hardcoding MTD.
    kpiRev: 'Revenue', kpiCost: 'Cost', kpiNet: 'EBITDA',
    tableTitle: 'Revenue → Cost → EBITDA',
    chartTitleDaily: 'Daily revenue, cost and EBITDA',
    chartTitleCum: 'Cumulative revenue, cost and EBITDA',
    fyWords: ['revenue', 'cost', 'EBITDA'],
  },
  cashflow: {
    dataKey: 'cashFlow', pageTitle: 'Daily Cash Flow',
    revGroup: 'Cash Inflow', costGroup: 'Cash Outflow',
    totalRev: 'Total Cash Inflow', totalCost: 'Total Cash Outflow', net: 'Net Cash Inflow',
    kpiRev: 'Cash Inflow', kpiCost: 'Cash Outflow', kpiNet: 'Net Cash Inflow',
    tableTitle: 'Cash Inflow → Cash Outflow → Net Cash Inflow',
    chartTitleDaily: 'Daily cash inflow, outflow and net cash inflow',
    chartTitleCum: 'Cumulative cash inflow, outflow and net cash inflow',
    fyWords: ['cash inflow', 'cash outflow', 'net cash inflow'],
  },
}

// Pixel-exact replica of the 'CF' tab's own Cash Flow statement layout, used
// only by the 'B2C - Daily Cashflow (sheet image)' Slack version
// (src/lib/b2cReport.js's buildB2CCashflowImage) -- rendered off-screen and
// screenshotted via captureNodePng, never shown to the user. A native Slack
// table block cannot merge cells, right-align just the item rows, or leave
// off its own default full grid border, so this exists purely to match the
// sheet exactly where the native table (b2cReport.js's buildB2CCashflowTable)
// can only approximate it. Every visual rule here was confirmed against the
// live sheet's real cell formatting (a direct XLSX export + openpyxl
// inspection, 2026-09-10), not eyeballed from a screenshot: Arial, a merged
// title, blank spacer rows before -- and only before -- a section-total row
// (never after the very first row), bold+underlined section totals, plain
// right-aligned item labels indented under them, and plain 2-decimal
// numbers with no rupee sign or 'Cr' suffix (the header cell already states
// the unit, exactly as the sheet itself does).
const CF_IMG_BOLD_LABELS = new Set(['Opening Balance :', 'Cash Inflow', 'Cash Outflow :', 'Closing Balance'])
function cfImgAmt(n) { return (n == null || !isFinite(n)) ? '' : n.toFixed(2) }
const CF_IMG_CELL = { border: '1px solid #000', padding: '5px 10px', fontSize: 13, lineHeight: 1.3, boxSizing: 'border-box' }
const CF_IMG_W = { label: 320, mtd: 180, ytd: 200 }
// slackShare.js's captureNodePng unconditionally adds `style:{padding:'18px'}`
// to the clone it rasterizes (all 4 sides), but sizes the capture canvas
// from THIS node's own pre-padding box -- so the padded clone is reliably
// ~18-36px bigger on the RIGHT and BOTTOM than what was measured, and
// whatever sits at those edges gets clipped. Caught live 2026-09-11 in two
// separate rounds: first the YTD column's right edge, then (after fixing
// only the width) the Closing Balance row's bottom edge -- same bug, the
// other axis, because the first fix only reserved slack horizontally.
// Confirmed by reading captureNodePng's call in html-to-image's own source
// (getImageSize measures the node BEFORE cloning/padding; applyStyle adds
// the padding only to the clone afterward). Real fix belongs in
// captureNodePng itself (every page that calls it is exposed to the same
// silent clip whenever content already runs edge-to-edge on either axis),
// but that's shared by every other Slack image export in the app -- safer
// to reserve slack locally here than risk changing shared capture math no
// other page has actually hit yet. A blank 48px buffer on BOTH the outer
// node's width AND its height (never the inner columns/rows) gives the
// padding room to grow into on every edge without ever touching real
// content.
const CF_IMG_SAFETY_MARGIN = 48
// Plain <div> rows/cells, not a real <table> -- html-to-image's foreignObject
// capture has known, real problems reproducing <table>/border-collapse
// exactly (a first version of this component used a table and the resulting
// PNG posted to Slack came out blank -- caught live 2026-09-11). Div rows +
// fixed pixel widths sidestep that whole class of bug and look identical.
const CashflowStatementImage = React.forwardRef(function CashflowStatementImage({ cf }, ref) {
  const rows = (cf && cf.rows) || []
  const groupHeader = (cf && cf.groupHeader && cf.groupHeader.length) ? cf.groupHeader : ['', 'MTD', 'YTD']
  const subHeader = (cf && cf.subHeader && cf.subHeader.length) ? cf.subHeader : ['Particulars', 'Amount (INR CR.)', 'Amount (INR CR.)']
  const title = (cf && cf.title) || 'B2C Student Mobility'
  const totalW = CF_IMG_W.label + CF_IMG_W.mtd + CF_IMG_W.ytd
  const cellStyle = function (bold) { return { ...CF_IMG_CELL, fontWeight: bold ? 700 : 400, textDecoration: bold ? 'underline' : 'none' } }
  return (
    // Zero-size, overflow:hidden ancestor at the real page origin (0,0) --
    // NOT `position:fixed; left:-99999px` on the captured node itself. Some
    // browsers skip painting content translated tens of thousands of pixels
    // off-screen as a compositing optimization, which is the other real
    // candidate for the same blank-PNG bug; clipping via a 0x0 ancestor
    // instead keeps the captured node's own layout/paint completely normal
    // (html-to-image serializes the target node's subtree directly -- an
    // ancestor's overflow:hidden doesn't affect that serialization at all,
    // it only keeps this invisible to a real user).
    <div style={{ position: 'fixed', top: 0, left: 0, width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <div ref={ref} style={{ width: totalW + CF_IMG_SAFETY_MARGIN, background: '#fff', fontFamily: 'Arial, Helvetica, sans-serif', color: '#000', whiteSpace: 'nowrap' }}>
        <div style={{ ...CF_IMG_CELL, width: totalW, textAlign: 'center', fontWeight: 700, textDecoration: 'underline' }}>{title}</div>
        <div style={{ height: 10 }} />
        <div style={{ display: 'flex' }}>
          <div style={{ width: CF_IMG_W.label }} />
          <div style={{ ...CF_IMG_CELL, width: CF_IMG_W.mtd, textAlign: 'center', fontWeight: 700 }}>{groupHeader[1] || 'MTD'}</div>
          <div style={{ ...CF_IMG_CELL, width: CF_IMG_W.ytd, textAlign: 'center', fontWeight: 700 }}>{groupHeader[2] || 'YTD'}</div>
        </div>
        <div style={{ display: 'flex' }}>
          <div style={{ ...CF_IMG_CELL, width: CF_IMG_W.label, textAlign: 'left' }}>{subHeader[0] || 'Particulars'}</div>
          <div style={{ ...CF_IMG_CELL, width: CF_IMG_W.mtd, textAlign: 'center' }}>{subHeader[1] || 'Amount (INR CR.)'}</div>
          <div style={{ ...CF_IMG_CELL, width: CF_IMG_W.ytd, textAlign: 'center' }}>{subHeader[2] || 'Amount (INR CR.)'}</div>
        </div>
        {rows.map(function (r, i) {
          const bold = CF_IMG_BOLD_LABELS.has(r.label)
          const c = cellStyle(bold)
          return (
            <React.Fragment key={i}>
              {bold && i > 0 ? <div style={{ height: 10 }} /> : null}
              <div style={{ display: 'flex' }}>
                <div style={{ ...c, width: CF_IMG_W.label, textAlign: bold ? 'left' : 'right' }}>{r.label}</div>
                <div style={{ ...c, width: CF_IMG_W.mtd, textAlign: 'right' }}>{cfImgAmt(r.mtd)}</div>
                <div style={{ ...c, width: CF_IMG_W.ytd, textAlign: 'right' }}>{cfImgAmt(r.ytd)}</div>
              </div>
            </React.Fragment>
          )
        })}
        <div style={{ height: CF_IMG_SAFETY_MARGIN }} />
      </div>
    </div>
  )
})

// Compact read-only render of a Slack native-table message's plain-value
// mirror ({columns, rows, strongRows} -- b2cReport.js builds this on every
// message alongside the real Slack blocks specifically so a preview like
// this one never needs to understand Slack's rich_text/raw_text cell shapes).
// Used by the Daily Report popover's preview only.
function DailyPreviewTable({ table }) {
  if (!table || !Array.isArray(table.columns)) return null
  const strong = new Set(table.strongRows || [])
  return (
    <div style={{ overflowX: 'auto', border: '1px solid var(--card-border)', borderRadius: 8 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
        <thead>
          <tr>
            {table.columns.map(function (c, i) {
              return <th key={i} style={{ textAlign: i === 0 ? 'left' : 'right', padding: '5px 8px', background: 'var(--bg2)', fontWeight: 700, whiteSpace: 'nowrap', borderBottom: '1px solid var(--card-border)' }}>{c}</th>
            })}
          </tr>
        </thead>
        <tbody>
          {(table.rows || []).map(function (r, ri) {
            const bold = strong.has(ri)
            return (
              <tr key={ri}>
                {r.map(function (v, ci) {
                  return <td key={ci} style={{ textAlign: ci === 0 ? 'left' : 'right', padding: '4px 8px', fontWeight: bold ? 700 : 400, whiteSpace: 'nowrap', borderBottom: '1px solid var(--card-border)' }}>{v}</td>
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function CeoB2CDashboard({ statement = 'pnl' }) {
  const { user } = useAuth()
  const isCashFlow = statement === 'cashflow'
  const L = STATEMENT_LABELS[isCashFlow ? 'cashflow' : 'pnl']
  const REV = isCashFlow ? REV_CASHFLOW : REV_PNL
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState('')
  const [mode, setMode] = useState('daily')
  // Date-range preset, alongside the existing Month dropdown. 'mtd' (the
  // default) preserves today's exact behaviour -- month-to-date, unchanged.
  // The other three scope the table/KPIs/chart to a rolling or custom window
  // instead, independent of which month happens to be selected.
  const [preset, setPreset] = useState('mtd')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [customOpen, setCustomOpen] = useState(false)
  // Editable "Revenue vs Cash Flow" note (Settings > Data > "B2C Report Note"),
  // shared with both Slack report versions via ctx.revVsCashflowNote -- one
  // saved value now drives the on-page note AND both Slack messages, instead
  // of three copies that could each say something different.
  const [revVsCashflowNote, setRevVsCashflowNote] = useState('')

  useEffect(function () {
    let alive = true
    fetch('/api/preferences', { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : { prefs: {} } })
      .then(function (d) { if (alive) setRevVsCashflowNote((d.prefs && d.prefs.b2c_rev_vs_cashflow_note) || '') })
      .catch(function () { if (alive) setRevVsCashflowNote('') })
    return function () { alive = false }
  }, [])

  useEffect(function () {
    let alive = true
    fetch('/api/crm-leads?source=b2c', { credentials: 'include' })
      .then(function (r) { return r.json() })
      .then(function (j) {
        if (!alive) return
        if (j && j.error) setErr(j.error); else setData(j)
        setLoading(false)
      })
      .catch(function (e) { if (alive) { setErr(String((e && e.message) || e)); setLoading(false) } })
    return function () { alive = false }
  }, [])

  // House rule for every CEO-facing surface: the current day is excluded, the
  // page always stops at D-1. The sheet is filled a day late anyway.
  const d1 = ist(-1)
  const statementData = data && data[L.dataKey]
  const days = (statementData && statementData.days) || []
  const upto = useMemo(function () { return days.filter(function (d) { return d.date <= d1 }) }, [data, d1])
  const months = useMemo(function () {
    const seen = []
    upto.forEach(function (d) { if (d.month && seen.indexOf(d.month) === -1) seen.push(d.month) })
    return seen
  }, [upto])
  useEffect(function () {
    if (months.length && months.indexOf(month) === -1) setMonth(months[months.length - 1])
  }, [months, month])

  // null means "use the Month dropdown, month-to-date" (today's original
  // behaviour); any other preset scopes both `rows` and the comparison window
  // to a real date range instead.
  const activeWindow = useMemo(function () {
    if (preset === 'ld') return { from: d1, to: d1 }
    if (preset === 'l7d') return { from: shiftDate(d1, -6), to: d1 }
    if (preset === 'custom' && customFrom && customTo) {
      return customFrom <= customTo ? { from: customFrom, to: customTo } : { from: customTo, to: customFrom }
    }
    return null
  }, [preset, d1, customFrom, customTo])

  const rows = useMemo(function () {
    if (activeWindow) return upto.filter(function (d) { return d.date >= activeWindow.from && d.date <= activeWindow.to })
    return upto.filter(function (d) { return d.month === month })
  }, [upto, month, activeWindow])
  const last = rows.length ? rows[rows.length - 1] : null
  const mtd = useMemo(function () { return totals(rows, REV) }, [rows, REV])

  // Compare like with like: a 12-day month to date is measured against the
  // first 12 days of the month before, never against its finished total. A
  // preset window instead compares against the immediately preceding window
  // of the exact same length (e.g. Last 7D vs the 7 days before that).
  const prevMonth = useMemo(function () {
    const i = months.indexOf(month)
    return i > 0 ? months[i - 1] : ''
  }, [months, month])
  const comparePrevWindow = useMemo(function () {
    if (!activeWindow) return null
    const n = daysBetweenIncl(activeWindow.from, activeWindow.to)
    const to = shiftDate(activeWindow.from, -1)
    return { from: shiftDate(to, -(n - 1)), to: to }
  }, [activeWindow])
  const prevRows = useMemo(function () {
    if (comparePrevWindow) return upto.filter(function (d) { return d.date >= comparePrevWindow.from && d.date <= comparePrevWindow.to })
    if (!prevMonth) return []
    return upto.filter(function (d) { return d.month === prevMonth }).slice(0, rows.length)
  }, [upto, comparePrevWindow, prevMonth, rows.length])
  const prev = useMemo(function () { return totals(prevRows, REV) }, [prevRows, REV])
  const hasPrev = prevRows.length > 0
  const prevLab = comparePrevWindow
    ? (comparePrevWindow.from === comparePrevWindow.to ? comparePrevWindow.from : comparePrevWindow.from + ' to ' + comparePrevWindow.to)
    : (hasPrev ? shortOf(prevMonth) + ' 1\u2013' + prevRows.length : '')

  // What to call the active window everywhere it needs a human label -- KPI
  // card sub-lines, the table's period column, the empty state.
  const periodLabel = preset === 'ld' ? 'Last Day' : preset === 'l7d' ? 'Last 7D' : preset === 'custom' ? 'Range' : 'MTD'
  const windowLabel = activeWindow
    ? (activeWindow.from === activeWindow.to ? activeWindow.from : activeWindow.from + ' to ' + activeWindow.to)
    : (month ? month.replace('-', ' ') + ', through ' + d1 : '')

  const day = useMemo(function () {
    if (!last) return null
    // offRev/upskilling: same reasoning as totals() above -- explicit, outside
    // the REV.concat(COST) loop, so they're never folded into a slice(0,3)/
    // slice(3) subgroup.
    const o = { date: last.date, sr: last.sr, offRev: last.offRev, upskilling: last.upskilling }
    REV.concat(COST).forEach(function (d) { o[d[0]] = last[d[0]] })
    o.rev = last.totalRev != null ? last.totalRev : roll(o, REV)
    o.cost = last.totalCost != null ? last.totalCost : roll(o, COST)
    o.net = last.net != null ? last.net : sub(o.rev, o.cost)
    o.ebitdaBeforeCorp = last.ebitdaBeforeCorp != null ? last.ebitdaBeforeCorp : plus(o.net, o.corp)
    return o
  }, [last, REV])

  // One chart, two readings: the daily bars answer "what happened yesterday",
  // the cumulative view answers "where is the month going to land".
  const chart = useMemo(function () {
    const base = rows.map(function (r) {
      const o = {}
      REV.concat(COST).forEach(function (d) { o[d[0]] = r[d[0]] })
      const rev = r.totalRev != null ? r.totalRev : roll(o, REV)
      const cost = r.totalCost != null ? r.totalCost : roll(o, COST)
      const net = r.net != null ? r.net : sub(rev, cost)
      const p = { d: r.date.slice(8) }
      p[L.totalRev] = rev || 0; p[L.totalCost] = cost || 0; p[L.net] = net || 0
      return p
    })
    if (mode !== 'cum') return base
    let a = 0, b = 0, c = 0
    return base.map(function (p) {
      a += p[L.totalRev]; b += p[L.totalCost]; c += p[L.net]
      const o = { d: p.d }
      o[L.totalRev] = a; o[L.totalCost] = b; o[L.net] = c
      return o
    })
  }, [rows, mode, L, REV])

  // The one extra chart worth having: the last four months side by side, so
  // the month in progress has something to be judged against.
  const trend = useMemo(function () {
    return months.slice(-4).map(function (m) {
      const t = totals(upto.filter(function (d) { return d.month === m }), REV)
      const o = { d: shortOf(m) }
      o[L.totalRev] = t.rev || 0; o[L.totalCost] = t.cost || 0; o[L.net] = t.net || 0
      return o
    })
  }, [months, upto, L, REV])

  // Indian financial year: 1 April to 31 March. It stops at exactly the same
  // cut-off as the month-to-date figures, so the two can never disagree.
  // This is what "YTD" means on this page -- year here is the fiscal year,
  // not the calendar year, which is the standard Indian-business reading.
  const fy = useMemo(function () {
    if (!rows.length) return null
    // Anchored on the latest date actually in view, not on the Month dropdown
    // -- this way it stays correct however `rows` got scoped (MTD, LD, L7D,
    // or a custom range), always stopping at exactly the same cut-off.
    const to = rows[rows.length - 1].date
    const y = parseInt(to.slice(0, 4), 10)
    const mo = parseInt(to.slice(5, 7), 10)
    if (!isFinite(y) || !isFinite(mo)) return null
    const sy = mo >= 4 ? y : y - 1
    const from = sy + '-04-01'
    const t = totals(upto.filter(function (d) { return d.date >= from && d.date <= to }), REV)
    t.from = from
    t.to = to
    t.label = 'FY ' + sy + '-' + String((sy + 1) % 100).padStart(2, '0')
    return t
  }, [rows, upto, REV])
  const fyMargin = fy && fy.rev ? (fy.net / fy.rev) * 100 : null

  // H1 of that same fiscal year: 1 April to 30 September. Capped at whatever
  // the YTD window has actually reached -- while we're still inside H1 (as
  // now, in August) the two figures are numerically identical, both starting
  // 1 April and both stopping at the same cut-off day. Once the year moves
  // past 30 September, YTD keeps growing into H2 while H1 becomes a closed,
  // complete window of its own -- that's the point of tracking it separately.
  const h1 = useMemo(function () {
    if (!fy) return null
    const h1To = fy.from.slice(0, 4) + '-09-30'
    const complete = fy.to >= h1To
    const to = complete ? h1To : fy.to
    const t = totals(upto.filter(function (d) { return d.date >= fy.from && d.date <= to }), REV)
    t.from = fy.from
    t.to = to
    t.complete = complete
    t.label = 'H1 ' + fy.label.replace('FY ', '')
    return t
  }, [fy, upto, REV])
  const h1Margin = h1 && h1.rev ? (h1.net / h1.rev) * 100 : null

  // H2 of the same fiscal year: 1 October to 31 March. null until the YTD
  // window actually reaches October -- there's nothing to show for a half
  // that hasn't started yet. Once inside it, same in-progress/complete split
  // as H1 above, just for the second half.
  const h2 = useMemo(function () {
    if (!fy) return null
    const h2From = fy.from.slice(0, 4) + '-10-01'
    if (fy.to < h2From) return null
    const h2To = (parseInt(fy.from.slice(0, 4), 10) + 1) + '-03-31'
    const complete = fy.to >= h2To
    const to = complete ? h2To : fy.to
    const t = totals(upto.filter(function (d) { return d.date >= h2From && d.date <= to }), REV)
    t.from = h2From
    t.to = to
    t.complete = complete
    t.label = 'H2 ' + fy.label.replace('FY ', '')
    return t
  }, [fy, upto, REV])
  const h2Margin = h2 && h2.rev ? (h2.net / h2.rev) * 100 : null

  // Consolidated says 'August-2026'; the cost tabs say 'Aug-2026'.
  const shortMonth = useMemo(function () {
    const p = String(month || '').split('-')
    return p.length === 2 ? p[0].slice(0, 3) + '-' + p[1] : month
  }, [month])

  const planRows = useMemo(function () {
    return PLAN.map(function (p) {
      const arr = (data && data.monthly && data.monthly[p[0]]) || []
      const hit = arr.filter(function (x) { return x.month.toLowerCase() === String(shortMonth).toLowerCase() })[0] || {}
      return { label: p[1], forecast: hit.forecast == null ? null : hit.forecast, actual: hit.actual == null ? null : hit.actual }
    })
  }, [data, shortMonth])
  // An all-blank forecast column is noise, so it only appears once the plan is filled in.
  const hasPlan = planRows.some(function (p) { return p.forecast != null })

  const monthOpts = months.map(function (m) { return { value: m, label: m.replace('-', ' ') } })
  const modeOpts = [{ value: 'daily', label: 'Daily' }, { value: 'cum', label: 'Cumulative' }]
  const margin = mtd.rev ? (mtd.net / mtd.rev) * 100 : null
  const prevMargin = prev.rev ? (prev.net / prev.rev) * 100 : null
  const notSet = !!(data && data.configured === false)
  const ready = !loading && !err && !notSet && rows.length > 0

  // Where the month lands if the days still to come look like the days so far.
  // Only shown mid-month; on the last day it would just repeat the MTD figure.
  // Doesn't apply to a rolling/custom window (LD, L7D, Custom) -- there's no
  // "month" for a 7-day window to run-rate against, so this stays MTD-only.
  const dim = activeWindow ? null : monthDays(month)
  const runRate = useCallback(function (v) {
    if (v == null || !rows.length || !dim || rows.length >= dim) return null
    return (v / rows.length) * dim
  }, [rows.length, dim])
  const ctx = useCallback(function (v, was) {
    const bits = []
    const rr = runRate(v)
    if (rr != null) bits.push('run-rate ' + inr(rr))
    if (was != null) bits.push(prevLab + ' ' + inr(was))
    return bits.join('  \u00B7  ')
  }, [runRate, prevLab])
  const mgDelta = margin == null || prevMargin == null ? null : margin - prevMargin

  // How many of the days so far actually lost money, and which was the worst.
  // Counted off exactly the rows the table above is built from.
  const dayStats = useMemo(function () {
    let neg = 0
    let worst = null
    rows.forEach(function (r) {
      const o = {}
      REV.concat(COST).forEach(function (d) { o[d[0]] = r[d[0]] })
      const rv = r.totalRev != null ? r.totalRev : roll(o, REV)
      const ct = r.totalCost != null ? r.totalCost : roll(o, COST)
      const n = r.net != null ? r.net : sub(rv, ct)
      if (n == null) return
      if (n < 0) neg += 1
      if (worst == null || n < worst.net) worst = { date: r.date, net: n }
    })
    return { days: rows.length, neg: neg, worst: worst }
  }, [rows, REV])

  // Slack: the CEO gets exactly the numbers the page shows. Nothing is
  // recomputed for the message, and the table image rides along in the thread.
  const tableRef = useRef(null)
  // Cash Flow only -- the hidden CashflowStatementImage node captured for
  // the 'b2c_cashflow_image' Slack version (see captureSlackFiles below).
  const cfImageRef = useRef(null)
  const [slackOpen, setSlackOpen] = useState(false)

  // Daily Report -- the scheduled 3 PM IST approval pipeline (posts a native
  // Slack table for BOTH P&L and Cash Flow, with Approve/Disapprove buttons,
  // to the sandbox channel first), now triggerable from either dashboard
  // page instead of only from Settings > Reports > Slack. Moved wholesale --
  // Settings no longer has its own copy of this control.
  const [dailyOpen, setDailyOpen] = useState(false)
  const [dailyLoaded, setDailyLoaded] = useState(false)
  const [dailyTestChannels, setDailyTestChannels] = useState([])
  const [dailyApproveDest, setDailyApproveDest] = useState('')
  // Defaults to D-1 (the real last complete day) every time the popover opens
  // -- never carries a stale pick from a previous open, and can never be
  // pushed later than d1 (see the max attribute on the input below), since
  // today's row in the sheet is still filling in.
  const [dailyThroughDate, setDailyThroughDate] = useState(d1)
  const [dailyDateOpen, setDailyDateOpen] = useState(false)
  const [dailySending, setDailySending] = useState(false)
  const [dailyMsg, setDailyMsg] = useState('')
  // Preview -- built server-side by the SAME code the real send uses
  // (api/send-report.mjs's buildB2CDailyMessages, via a preview-only
  // endpoint that never touches Slack or b2c_pending_reports), so what's
  // shown here can never disagree with what "Send report now" actually
  // posts. Reloaded on open and whenever the through-date changes.
  const [dailyPreview, setDailyPreview] = useState(null)
  const [dailyPreviewLoading, setDailyPreviewLoading] = useState(false)
  const [dailyPreviewErr, setDailyPreviewErr] = useState('')

  const openDaily = useCallback(function () {
    setDailyOpen(true)
    setDailyThroughDate(d1)
    if (dailyLoaded) return
    fetch('/api/preferences', { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : { prefs: {} } })
      .then(function (d) {
        const pf = d.prefs || {}
        if (Array.isArray(pf.slack_test_channels)) setDailyTestChannels(pf.slack_test_channels)
        if (pf.b2c_approve_destination != null) setDailyApproveDest(pf.b2c_approve_destination)
        setDailyLoaded(true)
      })
      .catch(function () { setDailyLoaded(true) })
  }, [dailyLoaded, d1])

  useEffect(function () {
    if (!dailyOpen) return
    let alive = true
    setDailyPreviewLoading(true); setDailyPreviewErr('')
    fetch('/api/send-report?type=b2c_daily_preview', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'b2c_daily_preview', throughDate: dailyThroughDate }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d } }) })
      .then(function (res) {
        if (!alive) return
        if (!res.ok) throw new Error(res.d.error || 'Could not load preview')
        setDailyPreview(res.d.jobs || [])
      })
      .catch(function (e) { if (alive) { setDailyPreviewErr(e.message); setDailyPreview(null) } })
      .finally(function () { if (alive) setDailyPreviewLoading(false) })
    return function () { alive = false }
  }, [dailyOpen, dailyThroughDate])

  useEffect(function () {
    function onKey(e) { if (e.key === 'Escape' && dailyOpen && !dailySending) setDailyOpen(false) }
    window.addEventListener('keydown', onKey)
    return function () { window.removeEventListener('keydown', onKey) }
  }, [dailyOpen, dailySending])

  const saveDailyApproveDest = useCallback(function (value) {
    setDailyApproveDest(value)
    fetch('/api/preferences', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'b2c_approve_destination', value }),
    }).catch(function () {})
  }, [])

  const sendDailyReportNow = async function () {
    setDailySending(true); setDailyMsg('')
    try {
      const r = await fetch('/api/send-report?type=b2c_daily_report', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'b2c_daily_report', triggered_by: (user && user.email) || 'manual', throughDate: dailyThroughDate }),
      })
      const dd = await r.json()
      if (!r.ok) throw new Error(dd.error || 'Failed')
      setDailyMsg('Posted to #dashboard-testing (through ' + dailyThroughDate + ') — check Slack to Approve/Disapprove')
    } catch (e) { setDailyMsg('✕ ' + e.message) }
    finally { setDailySending(false); setTimeout(function () { setDailyMsg('') }, 12000) }
  }
  const peopleMonthly = useMemo(function () {
    const p = planRows.filter(function (r) { return r.label === 'People' })[0]
    return p ? p.actual : null
  }, [planRows])
  const buildSlackContext = useCallback(function () {
    return {
      monthLabel: activeWindow ? windowLabel : String(month || '').replace('-', ' '),
      through: d1,
      rev: { sr: mtd.sr, ac: mtd.ac, vas: mtd.vas, off: mtd.offRev, upskilling: mtd.upskilling, total: mtd.rev },
      cost: { pm: mtd.pm, op: mtd.op, off: mtd.offCost, corp: mtd.corp, people: mtd.people, corpSalary: mtd.corpSalary, total: mtd.cost },
      net: mtd.net,
      margin: margin,
      // The last completed day now carries its line items too, so the Slack ledger
      // can print last day, month to date and year to date in the same columns.
      // Additive: the existing B2C builder only ever reads date, rev, cost and net.
      day: day ? {
        date: day.date,
        sr: day.sr, ac: day.ac, vas: day.vas, offRev: day.offRev, upskilling: day.upskilling,
        pm: day.pm, op: day.op, offCost: day.offCost, corp: day.corp, people: day.people, corpSalary: day.corpSalary,
        rev: day.rev, cost: day.cost, net: day.net,
      } : null,
      // Full day/mtd/fy objects, untouched -- P&L-only, they already carry the
      // Online/Offline split (srOnline/ac/vas/srOffline/acOffline/vasOffline)
      // via `totals()` summing every REV_PNL key. The native full-particulars
      // Slack table reads these directly instead of the narrower rev/cost
      // slices above (which only ever carried the combined sr/offRev totals).
      raw: { day: day, mtd: mtd, fy: fy },
      // Cash Flow's native table (only) reads this instead of raw/day/mtd/fy
      // above -- Finance's own pre-aggregated MTD/YTD statement off the 'CF'
      // tab (api/crm-leads.js), fetched as part of the same /api/crm-leads
      // response this page already loads into `data`. Additive: the P&L
      // builder never reads this key.
      cfStatement: data && data.cashflowStatement,
      peopleMonthly: peopleMonthly,
      ytd: fy,
      // The closing sections of the message are arithmetic on these two windows.
      // The page hands over the comparison it has already drawn rather than letting
      // the builder re-derive it, so the message can never disagree with the table.
      prev: hasPrev ? {
        label: prevLab,
        // How many days that window actually holds. A 31 day month read against
        // a 30 day one is a calendar artefact, and a builder cannot see that
        // without the count, so it travels with the comparison.
        days: prevRows.length,
        rev: { sr: prev.sr, ac: prev.ac, vas: prev.vas, off: prev.offRev, upskilling: prev.upskilling, total: prev.rev },
        cost: { pm: prev.pm, op: prev.op, off: prev.offCost, corp: prev.corp, people: prev.people, corpSalary: prev.corpSalary, total: prev.cost },
        net: prev.net
      } : null,
      days: dayStats.days,
      negDays: dayStats.neg,
      worstDay: dayStats.worst,
      // Whatever is currently saved (or the shared default) -- read live so an
      // edit made in Settings takes effect on the very next send/preview
      // without needing this page reloaded.
      revVsCashflowNote: revVsCashflowNote || DEFAULT_REV_VS_CASHFLOW_NOTE,
      // Extra keys for the Quantum Brief builder. The existing B2C builders read
      // none of these, so they are additive and change nothing for them.
      partial: !!(dim && rows.length < dim),
      throughTs: Math.floor(new Date(d1 + 'T00:00:00+05:30').getTime() / 1000),
      d: hasPrev ? { rev: chg(mtd.rev, prev.rev), cost: chg(mtd.cost, prev.cost), net: chg(mtd.net, prev.net) } : {},
      notes: [
        mgDelta == null || margin == null ? null
          : 'Net margin ' + margin.toFixed(1) + '%, ' + (mgDelta >= 0 ? 'up ' : 'down ') + Math.abs(mgDelta).toFixed(1) + ' pp on ' + prevLab + '.',
        mtd.pm == null || !mtd.rev ? null
          : 'Performance marketing is ' + ((mtd.pm / mtd.rev) * 100).toFixed(1) + '% of revenue.',
        !dim || rows.length >= dim || mtd.net == null ? null
          : 'At the run rate of the ' + rows.length + ' days so far, the month lands near ' + inr((mtd.net / rows.length) * dim) + ' net.',
      ].filter(Boolean),
      sources: [
        {
          id: 'src_sheet', title: 'Daily P&L tab', status: 'complete',
          details: rows.length + ' completed day(s) read for ' + (activeWindow ? windowLabel : String(month || '').replace('-', ' ') + ', up to ' + d1) + '. The current day is never included.',
          output: 'Revenue ' + inr(mtd.rev) + ' \u00b7 cost ' + inr(mtd.cost) + ' \u00b7 net ' + inr(mtd.net),
          url: 'https://quantum.leverageedu.com/dashboard/ceo-b2c-pnl', label: 'Daily P&L',
        },
        {
          id: 'src_prev', title: 'Like-for-like comparison', status: hasPrev ? 'complete' : 'error',
          details: hasPrev ? prevLab + ' read over the same ' + prevRows.length + ' day(s), never against its finished total.' : 'No earlier month in the sheet to read this one against.',
          output: hasPrev ? 'Net ' + inr(prev.net) + ' \u00b7 margin ' + (prevMargin == null ? '\u2014' : prevMargin.toFixed(1) + '%') : 'Not available',
        },
        {
          id: 'src_plan', title: 'Monthly cost plan', status: hasPlan ? 'complete' : 'error',
          details: hasPlan ? 'Forecast against actual for ' + shortMonth + '.' : 'No forecast has been entered for ' + shortMonth + ' yet, so only actuals are shown.',
          output: peopleMonthly == null ? 'People cost not booked yet' : 'People ' + inr(peopleMonthly) + ', booked monthly',
        },
        {
          id: 'src_fy', title: fy ? fy.label + ' to date' : 'Financial year to date', status: fy ? 'complete' : 'error',
          details: fy ? fy.from + ' to ' + fy.to + ', cut off at exactly the same day as the month to date.' : 'Could not resolve the financial year window.',
          output: fy ? 'Revenue ' + inr(fy.rev) + ' \u00b7 net ' + inr(fy.net) : 'Not available',
        },
      ]
    }
  }, [month, d1, mtd, margin, day, peopleMonthly, fy, dim, rows.length, hasPrev, prev, prevRows.length, prevLab, prevMargin, mgDelta, hasPlan, shortMonth, dayStats, activeWindow, windowLabel, revVsCashflowNote, data])
  const captureSlackFiles = useCallback(async function (versionId) {
    await nextPaint()
    // Cash Flow's 'sheet image' version screenshots the hidden
    // CashflowStatementImage replica instead of the on-page revenue/cost
    // table below (which shows this page's own daily-derived MTD, not the
    // 'CF' tab's own MTD/YTD statement that version is reporting on).
    if (versionId === 'b2c_cashflow_image') {
      // Image only -- no CSV. The sheet image already IS the whole report
      // for this version (per its own imageIsMessage note above); a
      // separate CSV of the same 16 rows was requested removed, 2026-09-12.
      const cfNode = cfImageRef.current
      const cfShot = cfNode ? await captureNodePng(cfNode, { ratios: [3, 2, 1.5, 1] }) : null
      return { pngBase64: cfShot ? cfShot.base64 : null, pixelRatio: cfShot ? cfShot.pixelRatio : null, csv: null }
    }
    const node = tableRef.current
    // Shot at 3x first: the CEO reads this table as an image in Slack, and it has
    // to survive being opened on a phone. captureNodePng walks the ratio down on
    // its own if the PNG comes out too big for the request body.
    const shot = node ? await captureNodePng(node, { ratios: [3, 2, 1.5, 1] }) : null
    const cols = ['Line item', day ? day.date : 'Latest day', periodLabel]
    if (hasPrev) cols.push(prevLab)
    const spec = REV.concat(isCashFlow ? [] : [['upskilling', 'Upskilling']]).concat([['rev', L.totalRev]]).concat(isCashFlow ? COST_CASHFLOW : COST).concat([['cost', L.totalCost]])
      .concat(isCashFlow ? [] : [['ebitdaBeforeCorp', 'EBITDA Before Corp. Overheads']])
      .concat([['net', L.net]])
    const body = spec.map(function (d) {
      const r = {}
      r[cols[0]] = d[1]
      r[cols[1]] = day ? day[d[0]] : null
      r[cols[2]] = mtd[d[0]]
      if (hasPrev) r[cols[3]] = prev[d[0]]
      return r
    })
    return { pngBase64: shot ? shot.base64 : null, pixelRatio: shot ? shot.pixelRatio : null, csv: rowsToCsv(cols, body) }
  }, [day, mtd, prev, hasPrev, prevLab, REV, periodLabel, data])

  // One row-renderer shared by the (P&L-only) Online/Offline revenue
  // subgroups below and by Cash Flow's flat revenue list -- same markup
  // either way, just called over a different slice of REV.
  function revRow(r) {
    return (
      <tr key={r[0]}>
        <td>{r[1]}</td>
        <td>{full(day && day[r[0]])}</td>
        <td>{full(mtd[r[0]])}</td>
        {hasPrev ? <td>{full(prev[r[0]])}</td> : null}
        {hasPrev ? dcell(chg(mtd[r[0]], prev[r[0]]), false) : null}
        <td>{mtd.rev && mtd[r[0]] != null ? ((mtd[r[0]] / mtd.rev) * 100).toFixed(1) + '%' : '—'}</td>
      </tr>
    )
  }

  return (
    <div className={'lq-page-shell ' + styles.layout}>
      <Sidebar />
      {/* Same shell as OverallDashboard (the app's reference header): a floating
          rounded/bordered/shadowed card inset from the viewport edge, with the
          header as a normal child of it and a separate scroll region below. */}
      <div className={styles.main}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <p className={styles.breadcrumb}>Dashboards / B2C / {L.pageTitle}</p>
            <h1 className={styles.pageTitle}>{L.pageTitle} &mdash; {isCashFlow ? 'cash inflow, outflow and net cash inflow' : 'revenue, cost and EBITDA'}<sup style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 2 }}>*</sup></h1>
          </div>
          <div className={'lq-header-controls ' + styles.headerRight}>
            <span className={styles.badge}>Through {d1}</span>
            {/* Filter bar laid out exactly like Overall's: the three presets in an
                inset track, then Custom range and the month dropdown alongside
                them, all inside one rounded panel. */}
            <div className={styles.filterBar}>
              <div className={styles.presetRow}>
                <button type="button" className={preset === 'ld' ? styles.presetPillActive : styles.presetPill} onClick={function () { setPreset('ld') }}>Last Day</button>
                <button type="button" className={preset === 'l7d' ? styles.presetPillActive : styles.presetPill} onClick={function () { setPreset('l7d') }}>Last 7D</button>
                <button type="button" className={preset === 'mtd' ? styles.presetPillActive : styles.presetPill} onClick={function () { setPreset('mtd') }}>MTD</button>
              </div>
              <div style={{ position: 'relative' }}>
                <button type="button" className={preset === 'custom' ? styles.customBtnActive : styles.customBtn}
                  onClick={function () { setPreset('custom'); setCustomOpen(true) }}>
                  {preset === 'custom' && customFrom && customTo ? customFrom + ' → ' + customTo : 'Custom range'}
                </button>
                {customOpen ? (
                  <>
                    <div onClick={function () { setCustomOpen(false); if (!(customFrom && customTo)) setPreset('mtd') }} style={{ position: 'fixed', inset: 0, zIndex: 399 }} />
                    <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 400, background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 14, boxShadow: '0 20px 60px rgba(15,23,42,0.16), 0 4px 12px rgba(15,23,42,0.06)', overflow: 'hidden' }}>
                      <DateRangePicker
                        from={customFrom ? (function () { const p = customFrom.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]) })() : null}
                        to={customTo ? (function () { const p = customTo.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]) })() : null}
                        onChange={function (f, t) { setCustomFrom(f || ''); setCustomTo(t || ''); setCustomOpen(false); if (!(f && t)) setPreset('mtd') }}
                        onClose={function () { setCustomOpen(false); if (!(customFrom && customTo)) setPreset('mtd') }}
                      />
                    </div>
                  </>
                ) : null}
              </div>
              {preset === 'mtd' && months.length > 0 ? <Dropdown options={monthOpts} value={month} onChange={setMonth} minWidth={150} /> : null}
            </div>
            {/* CEO_BRIEF_VERSIONS/B2C_REPORT_VERSIONS/B2C_LEDGER_VERSIONS hardcode
                "Revenue"/"Cost" wording throughout, so they stay P&L-only. Cash
                Flow gets its own single native-table version instead. */}
            {ready ? (
              <Button size="sm" variant="secondary" onClick={function () { setSlackOpen(true) }}
                icon={<SlackIcon size={13} />}>
                Send to Slack
              </Button>
            ) : null}
            {ready ? (
              <Button size="sm" variant="secondary" onClick={openDaily} icon={<SlackIcon size={13} />}>
                Daily Report
              </Button>
            ) : null}
            {dailyOpen ? (
              <div
                onClick={function () { if (!dailySending) setDailyOpen(false) }}
                style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
              >
                <div onClick={function (e) { e.stopPropagation() }} style={{
                  background: 'var(--card)', width: '100%', maxWidth: 640, maxHeight: '88vh',
                  borderRadius: 16, boxShadow: '0 24px 64px rgba(15,23,42,0.28)',
                  display: 'flex', flexDirection: 'column', overflow: 'hidden',
                }}>
                  <div style={{ padding: '15px 18px', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(31,60,132,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <SlackIcon size={17} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em' }}>Daily Report</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 2 }}>Daily P&amp;L + Cash Flow, together -- posted to the sandbox for Approve/Disapprove.</div>
                    </div>
                    <button onClick={function () { setDailyOpen(false) }} title="Close" disabled={dailySending} style={{ border: 'none', background: 'none', cursor: dailySending ? 'default' : 'pointer', padding: 6, borderRadius: 7, color: 'var(--text3)', lineHeight: 0, opacity: dailySending ? 0.5 : 1 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                  </div>

                  <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 18 }}>
                    <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                      Send through
                    </label>
                    <div style={{ position: 'relative', marginBottom: 10, maxWidth: 260 }}>
                      <button type="button" onClick={function () { setDailyDateOpen(function (v) { return !v }) }} style={{
                        width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 8,
                        border: '1px solid ' + (dailyDateOpen ? '#1F3C84' : 'var(--card-border)'),
                        background: 'var(--bg2)', color: 'var(--text)', fontSize: 12.5, fontFamily: 'inherit',
                        cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      }}>
                        <span>{dailyThroughDate}</span>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
                        </svg>
                      </button>
                      {dailyDateOpen ? (
                        <>
                          <div onClick={function () { setDailyDateOpen(false) }} style={{ position: 'fixed', inset: 0, zIndex: 901 }} />
                          <div style={{
                            position: 'absolute', left: 0, top: 'calc(100% + 6px)', zIndex: 902,
                            background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 14,
                            boxShadow: '0 20px 60px rgba(15,23,42,0.16), 0 4px 12px rgba(15,23,42,0.06)',
                          }}>
                            <SingleDatePicker
                              value={dailyThroughDate} max={d1}
                              onChange={setDailyThroughDate}
                              onClose={function () { setDailyDateOpen(false) }}
                            />
                          </div>
                        </>
                      ) : null}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--text3)', marginBottom: 14 }}>
                      Can't go later than {d1} &mdash; today's row is still filling in. Cash Flow ignores this date -- it always shows the CF tab's current MTD/YTD figures, which have no daily grain to cut off.
                    </div>
                    <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                      Approval sends to
                    </label>
                    <Dropdown
                      value={dailyApproveDest || (dailyTestChannels[0] ? 'test:' + dailyTestChannels[0].id : 'test')}
                      onChange={saveDailyApproveDest}
                      fullWidth
                      options={[
                        ...dailyTestChannels.map(function (c) { return { value: 'test:' + c.id, label: '#dashboard-testing  →  #' + c.name } }),
                        { value: 'b2c_core', label: '#dashboard-testing  →  ' + channelHandle('b2c_core') + '  (guarded)' },
                      ]}
                    />
                    <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '16px 0 6px' }}>
                      Preview
                    </label>
                    <div style={{ border: '1px solid var(--card-border)', borderRadius: 10, padding: 12, background: 'var(--bg2)' }}>
                      {dailyPreviewLoading ? (
                        <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>Building preview…</div>
                      ) : dailyPreviewErr ? (
                        <div style={{ fontSize: 11.5, color: '#B42318' }}>{dailyPreviewErr}</div>
                      ) : Array.isArray(dailyPreview) && dailyPreview.length ? (
                        dailyPreview.map(function (job, i) {
                          const msg = (job.messages || [])[0]
                          return (
                            <div key={job.statement} style={{ marginBottom: i < dailyPreview.length - 1 ? 18 : 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
                                {job.statement === 'pnl' ? 'Daily P&L' : 'Cash Flow'}
                              </div>
                              {msg && msg.table ? <DailyPreviewTable table={msg.table} /> : null}
                              {job.image && job.image.pngBase64 ? (
                                <div style={{ marginTop: 10 }}>
                                  <div style={{ fontSize: 10.5, color: 'var(--text3)', marginBottom: 4 }}>Sheet image, attached alongside the table above:</div>
                                  <img
                                    src={'data:image/png;base64,' + job.image.pngBase64}
                                    alt="Cash Flow statement"
                                    style={{ maxWidth: '100%', border: '1px solid var(--card-border)', borderRadius: 6, display: 'block' }}
                                  />
                                </div>
                              ) : job.statement === 'cashflow' ? (
                                <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 6 }}>Image could not be rendered for this preview -- the table above still sends normally.</div>
                              ) : null}
                            </div>
                          )
                        })
                      ) : (
                        <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>Nothing to preview yet.</div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderTop: '1px solid var(--card-border)', flexWrap: 'wrap' }}>
                    <Button size="sm" variant="secondary" onClick={sendDailyReportNow} disabled={dailySending}>
                      {dailySending ? 'Sending…' : 'Send report now'}
                    </Button>
                    {dailyMsg ? (
                      <span style={{ fontSize: 11, fontWeight: 600, color: dailyMsg.charAt(0) === '✕' ? '#B42318' : 'var(--green-ink, #2E7D4F)' }}>{dailyMsg}</span>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
            <SlackReportPanel
              open={slackOpen}
              onClose={function () { setSlackOpen(false) }}
              versions={isCashFlow ? B2C_CASHFLOW_TABLE_VERSIONS : [...B2C_FULL_TABLE_VERSIONS, ...CEO_BRIEF_VERSIONS, ...B2C_REPORT_VERSIONS, ...B2C_LEDGER_VERSIONS]}
              buildContext={buildSlackContext}
              captureFiles={captureSlackFiles}
              dashboardId={isCashFlow ? 'ceo_b2c_cashflow' : 'ceo_b2c_pnl'}
              filename={(isCashFlow ? 'ceo-b2c-cashflow-' : 'ceo-b2c-pnl-') + (month || '')}
              rowCount={rows.length}
            />
            {isCashFlow ? <CashflowStatementImage cf={data && data.cashflowStatement} ref={cfImageRef} /> : null}
          </div>
        </div>
        <div className={styles.scroll}>
        <div className={styles.content}>
          <p className={styles.defNote}>
            <b>* Revenue vs Cash Flow</b> &mdash; {revVsCashflowNote || DEFAULT_REV_VS_CASHFLOW_NOTE}
          </p>
          {loading ? <div className={styles.card}><div className={styles.empty}>Reading the finance sheet&hellip;</div></div> : null}
          {!loading && err ? (
            <div className={styles.card}><div className={styles.empty}>Could not read the finance sheet. {err}</div></div>
          ) : null}
          {!loading && !err && notSet ? (
            <div className={styles.card}>
              <div className={styles.empty}>
                No B2C sheet is connected yet.<br />
                Add its link in Settings &rsaquo; Data &rsaquo; Data Sources under &ldquo;B2C Finance Sheet (CEO)&rdquo;.
              </div>
            </div>
          ) : null}
          {!loading && !err && !notSet && rows.length === 0 ? (
            <div className={styles.card}>
              <div className={styles.empty}>
                The sheet is connected, but no day up to {d1} has been filled in yet.
              </div>
            </div>
          ) : null}
          {ready ? (
            <div className={styles.kpis}>
              <KPICard label={periodLabel + ' ' + L.kpiRev} value={inr(mtd.rev)}
                sub={ctx(mtd.rev, hasPrev ? prev.rev : null) || windowLabel}
                delta={hasPrev ? chg(mtd.rev, prev.rev) : null} />
              <KPICard label={periodLabel + ' ' + L.kpiCost} value={inr(mtd.cost)}
                sub={ctx(mtd.cost, hasPrev ? prev.cost : null) || 'people, marketing, ops, offline, overheads'}
                delta={hasPrev ? chg(mtd.cost, prev.cost) : null} deltaInvert />
              <KPICard label={periodLabel + ' ' + L.kpiNet} value={inr(mtd.net)}
                sub={ctx(mtd.net, hasPrev ? prev.net : null) || (isCashFlow ? 'cash inflow less cash outflow' : 'revenue less cost')}
                delta={hasPrev ? chg(mtd.net, prev.net) : null} />
              <KPICard label="Net Margin" value={margin == null ? '\u2014' : margin.toFixed(1) + '%'}
                sub={prevMargin == null ? (L.net + ' over ' + L.totalRev) : prevLab + ' ' + prevMargin.toFixed(1) + '%'}
                delta={mgDelta}
                deltaLabel={mgDelta == null ? null : (mgDelta >= 0 ? '\u25B2 ' : '\u25BC ') + Math.abs(mgDelta).toFixed(1) + ' pp'} />
            </div>
          ) : null}
          {ready ? (
            <div className={styles.card} ref={tableRef}>
              <div className={styles.cardHead}>
                <span className={styles.cardTitle}>{L.tableTitle}</span>
                <span className={styles.cardSub}>exact rupees &middot; every share is a % of {isCashFlow ? 'cash inflow' : 'revenue'}</span>
              </div>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Line item</th>
                    <th>{day ? day.date : 'Latest day'}</th>
                    <th>{periodLabel}</th>
                    {hasPrev ? <th>{prevLab}</th> : null}
                    {hasPrev ? <th>Change</th> : null}
                    <th>Share</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td className={styles.group} colSpan={hasPrev ? 6 : 4}>{L.revGroup}</td></tr>
                  {isCashFlow ? REV.map(revRow) : (
                    <>
                      <tr><td className={styles.subgroup} colSpan={hasPrev ? 6 : 4}>Online</td></tr>
                      {REV.slice(0, 3).map(revRow)}
                      <tr><td className={styles.subgroup} colSpan={hasPrev ? 6 : 4}>Offline</td></tr>
                      {REV.slice(3).map(revRow)}
                      {/* A new revenue line Finance added to the sheet (2026-09) --
                          not part of the Online/Offline split, so it sits outside REV
                          entirely (see the 'day'/'totals' comments above) and gets its
                          own row here rather than being folded into either subgroup. */}
                      {revRow(['upskilling', 'Upskilling'])}
                    </>
                  )}
                  <tr className={styles.total}>
                    <td>{L.totalRev}</td>
                    <td>{full(day && day.rev)}</td>
                    <td>{full(mtd.rev)}</td>
                    {hasPrev ? <td>{full(prev.rev)}</td> : null}
                    {hasPrev ? dcell(chg(mtd.rev, prev.rev), false) : null}
                    <td>100%</td>
                  </tr>
                  <tr><td className={styles.group} colSpan={hasPrev ? 6 : 4}>{L.costGroup}</td></tr>
                  {(isCashFlow ? COST_CASHFLOW : COST).map(function (c) {
                    return (
                      <tr key={c[0]}>
                        <td>{c[1]}</td>
                        <td>{full(day && day[c[0]])}</td>
                        <td>{full(mtd[c[0]])}</td>
                        {hasPrev ? <td>{full(prev[c[0]])}</td> : null}
                        {hasPrev ? dcell(chg(mtd[c[0]], prev[c[0]]), true) : null}
                        <td>{mtd.rev && mtd[c[0]] != null ? ((mtd[c[0]] / mtd.rev) * 100).toFixed(1) + '%' : '\u2014'}</td>
                      </tr>
                    )
                  })}
                  <tr className={styles.total}>
                    <td>{L.totalCost}</td>
                    <td>{full(day && day.cost)}</td>
                    <td>{full(mtd.cost)}</td>
                    {hasPrev ? <td>{full(prev.cost)}</td> : null}
                    {hasPrev ? dcell(chg(mtd.cost, prev.cost), true) : null}
                    <td>{mtd.rev && mtd.cost != null ? ((mtd.cost / mtd.rev) * 100).toFixed(1) + '%' : '\u2014'}</td>
                  </tr>
                  {!isCashFlow ? (
                    <tr className={styles.total}>
                      <td>EBITDA Before Corp. Overheads</td>
                      <td className={day && day.ebitdaBeforeCorp != null && day.ebitdaBeforeCorp < 0 ? styles.neg : styles.pos}>{full(day && day.ebitdaBeforeCorp)}</td>
                      <td className={mtd.ebitdaBeforeCorp != null && mtd.ebitdaBeforeCorp < 0 ? styles.neg : styles.pos}>{full(mtd.ebitdaBeforeCorp)}</td>
                      {hasPrev ? <td>{full(prev.ebitdaBeforeCorp)}</td> : null}
                      {hasPrev ? dcell(chg(mtd.ebitdaBeforeCorp, prev.ebitdaBeforeCorp), false) : null}
                      <td>{mtd.rev && mtd.ebitdaBeforeCorp != null ? ((mtd.ebitdaBeforeCorp / mtd.rev) * 100).toFixed(1) + '%' : '\u2014'}</td>
                    </tr>
                  ) : null}
                  <tr className={styles.total}>
                    <td>{L.net}</td>
                    <td className={day && day.net != null && day.net < 0 ? styles.neg : styles.pos}>{full(day && day.net)}</td>
                    <td className={mtd.net != null && mtd.net < 0 ? styles.neg : styles.pos}>{full(mtd.net)}</td>
                    {hasPrev ? <td>{full(prev.net)}</td> : null}
                    {hasPrev ? dcell(chg(mtd.net, prev.net), false) : null}
                    <td>{margin == null ? '\u2014' : margin.toFixed(1) + '%'}</td>
                  </tr>
                </tbody>
              </table>
              {fy ? (
                <>
                  <div style={{ marginTop: 20, marginBottom: 10 }}>
                    <span className={styles.cardTitle}>{fy.label} view &mdash; YTD, H1, H2</span>
                  </div>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Period</th>
                        <th>Range</th>
                        <th>{L.totalRev}</th>
                        <th>{L.totalCost}</th>
                        <th>{L.net}</th>
                        <th>Margin</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>YTD</td>
                        <td>{fy.from} to {fy.to}</td>
                        <td>{full(fy.rev)}</td>
                        <td>{full(fy.cost)}</td>
                        <td className={fy.net != null && fy.net < 0 ? styles.neg : styles.pos}>{full(fy.net)}</td>
                        <td>{fyMargin == null ? '—' : fyMargin.toFixed(1) + '%'}</td>
                      </tr>
                      {h1 ? (
                        <tr>
                          <td>H1{h1.complete ? '' : ' (in progress)'}</td>
                          <td>{h1.from} to {h1.to}</td>
                          <td>{full(h1.rev)}</td>
                          <td>{full(h1.cost)}</td>
                          <td className={h1.net != null && h1.net < 0 ? styles.neg : styles.pos}>{full(h1.net)}</td>
                          <td>{h1Margin == null ? '—' : h1Margin.toFixed(1) + '%'}</td>
                        </tr>
                      ) : null}
                      {h2 ? (
                        <tr>
                          <td>H2{h2.complete ? '' : ' (in progress)'}</td>
                          <td>{h2.from} to {h2.to}</td>
                          <td>{full(h2.rev)}</td>
                          <td>{full(h2.cost)}</td>
                          <td className={h2.net != null && h2.net < 0 ? styles.neg : styles.pos}>{full(h2.net)}</td>
                          <td>{h2Margin == null ? '—' : h2Margin.toFixed(1) + '%'}</td>
                        </tr>
                      ) : (
                        <tr>
                          <td>H2</td>
                          <td colSpan={5} className={styles.empty} style={{ padding: '10px 14px', textAlign: 'left' }}>Not started yet &mdash; begins {fy.from.slice(0, 4)}-10-01</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </>
              ) : null}
              {isCashFlow ? (
                <p className={styles.note}>
                  This page is real cash moved &mdash; every line here is an actual, not an estimate or a monthly average. It will often differ from Daily P&amp;L, which mixes real actuals with a formula estimate for SR and monthly-smoothed figures for People, Offline and Corp. Overheads.
                </p>
              ) : null}
            </div>
          ) : null}
          {ready ? (
            <div className={styles.card}>
              <div className={styles.cardHead}>
                <span className={styles.cardTitle}>{mode === 'cum' ? L.chartTitleCum : L.chartTitleDaily}</span>
                <div className={styles.cardTools}>
                  <span className={styles.cardSub}>{activeWindow ? windowLabel : month.replace('-', ' ')}</span>
                  <Dropdown options={modeOpts} value={mode} onChange={setMode} minWidth={128} />
                </div>
              </div>
              <div style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chart} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <defs><BarGrad id="g-b0-3" color="#1F3C84"/><BarGrad id="g-b0-4" color="#1C9FD4"/></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" vertical={false} />
                    <XAxis dataKey="d" tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={false} tickLine={false} tickFormatter={inr} width={78} />
                    <Tooltip formatter={function (v) { return full(v) }} contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid var(--card-border)', background: 'var(--card)', color: 'var(--text)' }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey={L.totalRev} fill={barFill('g-b0-4')} radius={BAR_RADIUS} maxBarSize={BAR_MAX} />
                    <Bar dataKey={L.totalCost} fill={barFill('g-b0-3')} radius={BAR_RADIUS} maxBarSize={BAR_MAX} />
                    <Line type="monotone" dataKey={L.net} stroke="#4CAE6F" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : null}
          {ready && trend.length > 1 ? (
            <div className={styles.card}>
              <div className={styles.cardHead}>
                <span className={styles.cardTitle}>Month on month</span>
                <span className={styles.cardSub}>{shortOf(month)} is still in progress, up to {d1}</span>
              </div>
              <div style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={trend} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <defs><BarGrad id="g-b1-1" color="#1F3C84"/><BarGrad id="g-b1-2" color="#1C9FD4"/></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" vertical={false} />
                    <XAxis dataKey="d" tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={false} tickLine={false} tickFormatter={inr} width={78} />
                    <Tooltip formatter={function (v) { return full(v) }} contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid var(--card-border)', background: 'var(--card)', color: 'var(--text)' }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey={L.totalRev} fill={barFill('g-b1-2')} radius={BAR_RADIUS} maxBarSize={BAR_MAX} />
                    <Bar dataKey={L.totalCost} fill={barFill('g-b1-1')} radius={BAR_RADIUS} maxBarSize={BAR_MAX} />
                    <Line type="monotone" dataKey={L.net} stroke="#4CAE6F" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : null}
          {ready && !isCashFlow ? (
            <div className={styles.card}>
              <div className={styles.cardHead}>
                <span className={styles.cardTitle}>Monthly cost plan vs actual</span>
                <span className={styles.cardSub}>{shortMonth}</span>
              </div>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Cost head</th>
                    {hasPlan ? <th>Forecast</th> : null}
                    <th>Actual</th>
                    {hasPlan ? <th>Variance</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {planRows.map(function (p) {
                    const both = p.forecast != null && p.actual != null
                    return (
                      <tr key={p.label}>
                        <td>{p.label}</td>
                        {hasPlan ? <td>{full(p.forecast)}</td> : null}
                        <td>{full(p.actual)}</td>
                        {hasPlan ? (
                          <td className={both ? (p.actual > p.forecast ? styles.neg : styles.pos) : undefined}>
                            {both ? full(p.actual - p.forecast) : '\u2014'}
                          </td>
                        ) : null}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className={styles.note}>
                {hasPlan
                  ? 'Performance marketing has no forecast line here \u2014 it comes from the ad platforms, not from a plan.'
                  : 'No forecast has been entered for ' + shortMonth + ' yet, so only the actuals are shown. Performance marketing never carries a forecast here \u2014 it comes from the ad platforms.'}
              </p>
            </div>
          ) : null}
        </div>
        </div>
      </div>
    </div>
  )
}
