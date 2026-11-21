import React, { useState, useEffect, useMemo, useCallback } from 'react'
import Sidebar from '../components/Sidebar'
import ExportButton from '../components/ExportButton'
import Button from '../components/Button'
import Dropdown from '../components/Dropdown'
import { DashboardSkeleton } from '../components/SkeletonLoader'
import { C, FONT, Card, PremKPI, KPI_ICONS, fmtN } from '../ui/dashboardKit'
import { getSession, setSession } from '../lib/sessionLoad'

// Sales data check (2026-11-21). Compares the Source wise CIB sheet (typed by the sales team, via B2C-OND)
// with the Student Portal's own tables in BigQuery (pp_orders + pp_order_payments), month by month, student
// by student, so we can decide whether the tables can replace the sheet. The server returns raw rows
// (api/crm-leads.js, mode=cib_vs_portal); all matching happens here.

const SESSION_KEY = 'lq_sales_data_check_v1'
const GST = 1.18
const BAD_STATUS = /reject|fail/i
const IN_PROCESS = /in process/i

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthLabel = mk => (mk ? MON[Number(mk.slice(5, 7)) - 1] + ' ' + mk.slice(2, 4) : '')
const cr = n => '₹' + (Math.round((n || 0) / 1e5) / 100).toFixed(2) + ' Cr'
const inr = n => '₹' + Math.round(n || 0).toLocaleString('en-IN')
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 + '%' : '-')

// Sheet-side status of one student in one month.
const SHEET_STATUS = {
  matched: { label: 'In both, same month', tone: 'green' },
  other_month: { label: 'Portal has them, different month', tone: 'blue' },
  order_no_payment: { label: 'Portal order, no payment', tone: 'cyan' },
  no_order: { label: 'Student exists, no portal order', tone: 'navy' },
  not_found: { label: 'Not found in portal users', tone: 'grey' },
}
const PORTAL_STATUS = {
  matched: { label: 'In both, same month', tone: 'green' },
  sheet_other_month: { label: 'In sheet, different month', tone: 'blue' },
  never_in_sheet: { label: 'Never in the sheet', tone: 'navy' },
}
const AMT_STATUS = {
  same: 'Same amount',
  same_ex_gst: 'Same once GST is removed',
  sheet_higher: 'Sheet higher',
  portal_higher: 'Portal higher',
}
const TONE = {
  green: { bg: 'rgba(76,174,111,0.12)', fg: '#2F7F4F' },
  blue: { bg: 'rgba(28,159,212,0.12)', fg: '#1478A3' },
  cyan: { bg: 'rgba(41,185,195,0.14)', fg: '#1E8A92' },
  navy: { bg: 'rgba(31,60,132,0.10)', fg: '#1F3C84' },
  grey: { bg: 'rgba(100,116,139,0.12)', fg: '#475569' },
}

const Pill = ({ tone, children }) => {
  const t = TONE[tone] || TONE.grey
  return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, background: t.bg, color: t.fg, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{children}</span>
}

const thS = { textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `0.5px solid ${C.border}`, whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1 }
const tdS = { padding: '8px 10px', fontSize: 12.5, color: C.text, borderBottom: `0.5px solid ${C.border}`, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }
const numTd = { ...tdS, textAlign: 'right' }

// A bar that splits one total into coloured parts, with a legend underneath.
const SplitBar = ({ parts, total }) => (
  <div>
    <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', background: 'var(--bg2)' }}>
      {parts.filter(p => p.value > 0).map(p => (
        <div key={p.key} title={p.label + ': ' + cr(p.value)} style={{ width: (total ? (p.value / total) * 100 : 0) + '%', background: TONE[p.tone].fg, opacity: 0.85 }} />
      ))}
    </div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', marginTop: 10 }}>
      {parts.map(p => (
        <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.sub }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: TONE[p.tone].fg, opacity: 0.85 }} />
          {p.label} <b style={{ color: C.text }}>{cr(p.value)}</b> <span style={{ color: C.muted }}>({pct(p.value, total)})</span>
        </div>
      ))}
    </div>
  </div>
)

const SmallTable = ({ rows, cols }) => (
  <div style={{ overflowX: 'auto' }}>
    <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FONT }}>
      <thead><tr>{cols.map(c => <th key={c.key} style={{ ...thS, textAlign: c.num ? 'right' : 'left' }}>{c.label}</th>)}</tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={r._total ? { background: 'var(--bg2)', fontWeight: 700 } : undefined}>
            {cols.map(c => <td key={c.key} style={c.num ? numTd : tdS}>{c.render ? c.render(r) : r[c.key]}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)

// Portal orders carry no AC/VAS flag. The sheet files Accommodation and L1E2E under VAS, so the same products count as VAS here.
const portalType = product => (/accommodation|l1\s*e2e/i.test(product || '') ? 'VAS' : 'AC')

function buildModel(data, typeFilter = 'all') {
  const keyMap = data.keyMap || {}
  const sheet = (data.sheetRows || []).map(r => ({ ...r, uid: keyMap['e:' + r.email] || (r.pid && keyMap['p:' + r.pid]) || null })).filter(r => typeFilter === 'all' || r.type === typeFilter)
  const portalAll = data.portalRows || []
  const pays = portalAll.filter(r => r.kind === 'pay' && (typeFilter === 'all' || portalType(r.product) === typeFilter)).map(r => ({ ...r, mk: String(r.d || '').slice(0, 7) })).filter(r => r.mk >= '2026-04')
  const counted = pays.filter(r => !BAD_STATUS.test(r.status || ''))
  const orders = portalAll.filter(r => r.kind === 'order')
  const orderUids = new Set(orders.map(o => o.uid).filter(Boolean))
  const productOfUid = {}
  orders.forEach(o => { if (o.uid && !productOfUid[o.uid]) productOfUid[o.uid] = o.product })

  const months = [...new Set([...sheet.map(r => r.mk), ...counted.map(r => r.mk)])].filter(Boolean).sort()

  // student-month keys
  const skey = r => (r.uid ? 'u:' + r.uid : 'e:' + (r.email || 'row' + r.tab + r.row))
  const sheetSM = new Map() // mk|key -> agg
  for (const r of sheet) {
    const k = r.mk + '|' + skey(r)
    const e = sheetSM.get(k) || { mk: r.mk, key: skey(r), uid: r.uid, email: r.email, name: r.name, rows: 0, amt: 0, types: new Set(), pkgs: new Set(), tabs: new Set() }
    e.rows++; e.amt += r.amt; if (r.type) e.types.add(r.type); if (r.pkg) e.pkgs.add(r.pkg); e.tabs.add(r.tab); if (!e.name && r.name) e.name = r.name
    sheetSM.set(k, e)
  }
  const portalSM = new Map()
  const portalMonthsOfUid = new Map()
  for (const p of counted) {
    const k = p.mk + '|u:' + p.uid
    const e = portalSM.get(k) || { mk: p.mk, key: 'u:' + p.uid, uid: p.uid, email: p.e1 || p.e2 || '', pays: 0, amt: 0, inProcess: 0, products: new Set() }
    e.pays++; e.amt += p.amt; if (IN_PROCESS.test(p.status || '')) e.inProcess += p.amt; if (p.product) e.products.add(p.product)
    portalSM.set(k, e)
    if (!portalMonthsOfUid.has(p.uid)) portalMonthsOfUid.set(p.uid, new Set())
    portalMonthsOfUid.get(p.uid).add(p.mk)
  }
  const sheetMonthsOfUid = new Map()
  for (const e of sheetSM.values()) if (e.uid) { if (!sheetMonthsOfUid.has(e.uid)) sheetMonthsOfUid.set(e.uid, new Set()); sheetMonthsOfUid.get(e.uid).add(e.mk) }

  const sheetStudents = []
  for (const e of sheetSM.values()) {
    let status
    const p = e.uid ? portalSM.get(e.mk + '|u:' + e.uid) : null
    if (p) status = 'matched'
    else if (!e.uid) status = 'not_found'
    else if (portalMonthsOfUid.has(e.uid)) status = 'other_month'
    else if (orderUids.has(e.uid)) status = 'order_no_payment'
    else status = 'no_order'
    let amtStatus = null
    if (p) {
      const near = (a, b) => b > 0 && Math.abs(a - b) / b <= 0.05
      amtStatus = near(e.amt, p.amt) ? 'same' : near(e.amt, p.amt / GST) ? 'same_ex_gst' : e.amt > p.amt ? 'sheet_higher' : 'portal_higher'
    }
    sheetStudents.push({
      mk: e.mk, name: e.name, email: e.email, uid: e.uid, rows: e.rows, sheetAmt: e.amt, type: [...e.types].join(', '), pkg: [...e.pkgs].join(', '),
      portalAmt: p ? p.amt : 0, portalPays: p ? p.pays : 0, portalProduct: p ? [...p.products].join(', ') : (e.uid && productOfUid[e.uid]) || '',
      otherPortalMonths: e.uid && portalMonthsOfUid.has(e.uid) ? [...portalMonthsOfUid.get(e.uid)].filter(m => m !== e.mk).map(monthLabel).join(', ') : '',
      status, amtStatus,
    })
  }
  const portalStudents = []
  for (const p of portalSM.values()) {
    const inSheetSame = sheetSM.has(p.mk + '|u:' + p.uid)
    const status = inSheetSame ? 'matched' : sheetMonthsOfUid.has(p.uid) ? 'sheet_other_month' : 'never_in_sheet'
    portalStudents.push({ mk: p.mk, email: p.email, uid: p.uid, pays: p.pays, amt: p.amt, inProcess: p.inProcess, product: [...p.products].join(', '), status,
      sheetMonths: sheetMonthsOfUid.has(p.uid) ? [...sheetMonthsOfUid.get(p.uid)].map(monthLabel).join(', ') : '' })
  }

  const rejected = pays.filter(r => BAD_STATUS.test(r.status || ''))
  return { months, sheet, pays, counted, rejected, sheetStudents, portalStudents }
}

function summarise(model, mk) {
  const ss = model.sheetStudents.filter(s => mk === 'all' || s.mk === mk)
  const ps = model.portalStudents.filter(s => mk === 'all' || s.mk === mk)
  const sum = (a, f) => a.reduce((t, x) => t + (f(x) || 0), 0)
  const by = (a, st, f) => sum(a.filter(x => x.status === st), f)
  const sheetAmt = sum(ss, s => s.sheetAmt)
  const portalAmt = sum(ps, s => s.amt)
  const matchedSheetAmt = by(ss, 'matched', s => s.sheetAmt)
  const matchedPortalAmt = by(ps, 'matched', s => s.amt)
  const amtCounts = {}
  ss.filter(s => s.status === 'matched').forEach(s => { amtCounts[s.amtStatus] = (amtCounts[s.amtStatus] || 0) + 1 })
  return {
    ss, ps, sheetAmt, portalAmt, matchedSheetAmt, matchedPortalAmt,
    sheetStudents: ss.length, portalStudents: ps.length,
    matchedStudents: ss.filter(s => s.status === 'matched').length,
    sheetRows: sum(ss, s => s.rows), portalPays: sum(ps, s => s.pays),
    inProcess: sum(ps, s => s.inProcess),
    sheetParts: Object.keys(SHEET_STATUS).map(k => ({ key: k, label: SHEET_STATUS[k].label, tone: SHEET_STATUS[k].tone, value: by(ss, k, s => s.sheetAmt), n: ss.filter(s => s.status === k).length })),
    portalParts: Object.keys(PORTAL_STATUS).map(k => ({ key: k, label: PORTAL_STATUS[k].label, tone: PORTAL_STATUS[k].tone, value: by(ps, k, s => s.amt), n: ps.filter(s => s.status === k).length })),
    amtCounts,
  }
}

function groupTop(rows, keyFn, valFn, n = 8) {
  const m = new Map()
  rows.forEach(r => { const k = keyFn(r) || '(blank)'; const e = m.get(k) || { k, n: 0, v: 0 }; e.n++; e.v += valFn(r) || 0; m.set(k, e) })
  return [...m.values()].sort((a, b) => b.v - a.v).slice(0, n)
}

export default function SalesDataCheckDashboard() {
  const cached = getSession(SESSION_KEY)
  const [data, setData] = useState(cached ? cached.data : null)
  const [loading, setLoading] = useState(!cached)
  const [error, setError] = useState(null)
  const [month, setMonth] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [side, setSide] = useState('sheet')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [infoOpen, setInfoOpen] = useState(false)
  const [limit, setLimit] = useState(100)

  const load = useCallback(async force => {
    setLoading(true); setError(null)
    try {
      const r = await fetch('/api/crm-leads?source=bigquery&mode=cib_vs_portal' + (force ? '&refresh=1' : ''), { credentials: 'same-origin' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) throw new Error(j.error || ('Request failed (' + r.status + ')'))
      setData(j); setSession(SESSION_KEY, j)
    } catch (e) {
      setError(String((e && e.message) || e))
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { if (!cached) load(false) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const model = useMemo(() => (data ? buildModel(data, typeFilter) : null), [data, typeFilter])
  const s = useMemo(() => (model ? summarise(model, month) : null), [model, month])
  const monthRows = useMemo(() => {
    if (!model) return []
    const rows = model.months.map(mk => ({ mk, ...summarise(model, mk) }))
    const all = summarise(model, 'all')
    return [...rows, { mk: 'Total', _total: true, ...all }]
  }, [model])

  const tableRows = useMemo(() => {
    if (!s) return []
    const q = search.trim().toLowerCase()
    const src = side === 'sheet' ? s.ss : s.ps
    return src
      .filter(r => statusFilter === 'all' || r.status === statusFilter || r.amtStatus === statusFilter)
      .filter(r => !q || [r.name, r.email, r.pkg, r.product, r.portalProduct].some(v => String(v || '').toLowerCase().includes(q)))
      .sort((a, b) => (side === 'sheet' ? b.sheetAmt - a.sheetAmt : b.amt - a.amt))
  }, [s, side, statusFilter, search])

  const exportRows = useMemo(() => tableRows.map(r => side === 'sheet'
    ? { Month: monthLabel(r.mk), Student: r.name, Email: r.email, 'AC/VAS': r.type, Package: r.pkg, 'Sheet rows': r.rows, 'Sheet CIB': Math.round(r.sheetAmt), 'Portal paid': Math.round(r.portalAmt), Status: SHEET_STATUS[r.status].label, Amount: r.amtStatus ? AMT_STATUS[r.amtStatus] : '', 'Portal product': r.portalProduct, 'Portal months': r.otherPortalMonths }
    : { Month: monthLabel(r.mk), Email: r.email, Product: r.product, Payments: r.pays, 'Portal paid': Math.round(r.amt), 'In process': Math.round(r.inProcess), Status: PORTAL_STATUS[r.status].label, 'Sheet months': r.sheetMonths }), [tableRows, side])

  const verdict = useMemo(() => {
    if (!s || !s.sheetAmt) return null
    const sheetCover = s.matchedSheetAmt / s.sheetAmt
    const portalCover = s.portalAmt ? s.matchedPortalAmt / s.portalAmt : 0
    const missingInPortal = s.sheetAmt - s.matchedSheetAmt
    const missingInSheet = s.portalAmt - s.matchedPortalAmt
    const ok = sheetCover >= 0.95 && portalCover >= 0.95
    return { ok, sheetCover, portalCover, missingInPortal, missingInSheet }
  }, [s])

  const monthOptions = useMemo(() => [{ value: 'all', label: 'All months (Apr 26 to date)' }, ...(model ? model.months.map(mk => ({ value: mk, label: monthLabel(mk) })) : [])], [model])
  const statusOptions = side === 'sheet'
    ? [{ value: 'all', label: 'All statuses' }, ...Object.entries(SHEET_STATUS).map(([k, v]) => ({ value: k, label: v.label })), ...Object.entries(AMT_STATUS).map(([k, v]) => ({ value: k, label: 'Amount: ' + v }))]
    : [{ value: 'all', label: 'All statuses' }, ...Object.entries(PORTAL_STATUS).map(([k, v]) => ({ value: k, label: v.label }))]

  const sheetOnly = s ? s.ss.filter(x => x.status !== 'matched') : []
  const portalOnly = s ? s.ps.filter(x => x.status !== 'matched') : []

  return (
    <div className="lq-page-shell" style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)', fontFamily: FONT }}>
      <Sidebar />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flexShrink: 0, padding: '28px 0 0' }}>
          <div style={{ padding: '0 28px' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.text }}>Sales Data Check</div>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 4, maxWidth: 820 }}>
              The Source wise CIB sheet (typed by the sales team) against the Student Portal's own order tables in BigQuery, student by student. Use it to decide whether the tables can replace the sheet.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '16px 28px 0', padding: '10px 12px', background: 'var(--bg2)', border: `0.5px solid ${C.border}`, borderRadius: 12 }}>
            <Dropdown options={monthOptions} value={month} onChange={v => { setMonth(v); setLimit(100) }} minWidth={210} />
            <Dropdown options={[{ value: 'all', label: 'AC + VAS' }, { value: 'AC', label: 'AC only' }, { value: 'VAS', label: 'VAS only' }]} value={typeFilter} onChange={v => { setTypeFilter(v); setLimit(100) }} minWidth={130} />
            <div style={{ flex: 1 }} />
            {data && <span style={{ fontSize: 11.5, color: C.muted }} title={data.builtAt}>Built {new Date(data.builtAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
            <Button size="sm" variant="secondary" onClick={() => load(true)} disabled={loading}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginRight: 5, animation: loading ? 'spin 1s linear infinite' : 'none' }}><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
              Refresh
            </Button>
            <div style={{ position: 'relative' }}>
              <button onClick={() => setInfoOpen(v => !v)} style={{ width: 30, height: 30, borderRadius: 8, border: `0.5px solid ${C.border}`, background: 'var(--card)', color: C.sub, fontStyle: 'italic', fontWeight: 700, fontFamily: 'Georgia, serif', cursor: 'pointer' }}>i</button>
              {infoOpen && (
                <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 50, width: 380, background: 'var(--card)', border: `0.5px solid ${C.border}`, borderRadius: 12, boxShadow: '0 20px 60px rgba(15,23,42,0.16)', padding: 14, fontSize: 12.5, color: C.sub, lineHeight: 1.6 }}>
                  <div style={{ fontWeight: 800, color: C.text, marginBottom: 6 }}>How this is built</div>
                  <div><b>Sheet:</b> Source wise CIB workbook. "FY 2027" tab for Apr to Sep 2026 (rows "Added by Quantum" skipped), "Oct Live 2026" onward for later months. Amount = CIB Amount / Net CIB.</div>
                  <div style={{ marginTop: 6 }}><b>Portal:</b> leverage_direct.pp_order_payments joined to pp_orders. Month = payment date (else the date the payment was entered), IST. Rejected and failed payments are left out; "Payment In Process" counts and is shown separately.</div>
                  <div style={{ marginTop: 6 }}><b>Matching:</b> each sheet email (or prospect ID) is looked up in users_meta to find the portal student, then compared by student and month. Amounts within 5% are "same"; "same once GST is removed" means the sheet equals the portal amount divided by 1.18.</div>
                  <div style={{ marginTop: 6 }}><b>AC / VAS:</b> the sheet's own AC/VAS column. Portal orders have no such flag, so Accommodation and L1 E2E products count as VAS (the sheet files them there) and everything else as AC.</div>
                  <div style={{ marginTop: 6 }}>Data is cached for 30 minutes; Refresh rebuilds it (about ₹1 of BigQuery).</div>
                </div>
              )}
            </div>
          </div>
          {error && <div style={{ margin: '16px 28px 0', padding: '10px 14px', borderRadius: 10, background: 'var(--navy-tint)', border: `0.5px solid ${C.navy}`, color: C.navy, fontSize: 13 }}>{error}</div>}
          {data && Object.entries(data.tabs || {}).some(([, t]) => t.error) && (
            <div style={{ margin: '12px 28px 0', padding: '10px 14px', borderRadius: 10, background: 'var(--navy-tint)', border: `0.5px solid ${C.navy}`, color: C.navy, fontSize: 12.5 }}>
              Some sheet tabs could not be read: {Object.entries(data.tabs).filter(([, t]) => t.error).map(([k, t]) => k + ' (' + t.error + ')').join('; ')}
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 40 }}>
          {loading && !data ? (
            <div style={{ padding: '0 28px', marginTop: 20 }}><DashboardSkeleton label="Reading the sheet and BigQuery (about 20 seconds)" /></div>
          ) : !s ? null : (
            <div style={{ opacity: loading ? 0.45 : 1, transition: 'opacity .15s' }}>
              {verdict && (
                <div style={{ margin: '20px 28px 0', padding: '14px 16px', borderRadius: 12, border: `0.5px solid ${C.border}`, background: 'var(--card)', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <div style={{ width: 10, alignSelf: 'stretch', borderRadius: 5, background: verdict.ok ? TONE.green.fg : TONE.navy.fg, opacity: 0.85 }} />
                  <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.6 }}>
                    <div style={{ fontWeight: 800, marginBottom: 2 }}>{verdict.ok ? 'The tables match the sheet closely enough to switch.' : 'Keep using the sheet for now: the tables are not a complete copy of it.'}</div>
                    The portal finds <b>{pct(s.matchedSheetAmt, s.sheetAmt)}</b> of the sheet's money for the same students in the same month, and <b>{pct(s.matchedPortalAmt, s.portalAmt)}</b> of the portal's money is in the sheet.
                    {' '}<b>{cr(verdict.missingInPortal)}</b> of sheet sales has no matching portal payment, and <b>{cr(verdict.missingInSheet)}</b> of portal payments is not in the sheet ({monthOptions.find(o => o.value === month)?.label}).
                  </div>
                </div>
              )}

              <div className="lq-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, padding: '16px 28px 0' }}>
                <PremKPI label="Sheet CIB" value={cr(s.sheetAmt)} sub={fmtN(s.sheetRows) + ' rows, ' + fmtN(s.sheetStudents) + ' students'} accent={C.navy} icon={KPI_ICONS.total} />
                <PremKPI label="Portal paid" value={cr(s.portalAmt)} sub={fmtN(s.portalPays) + ' payments, ' + fmtN(s.portalStudents) + ' students'} accent={C.navy} icon={KPI_ICONS.total} />
                <PremKPI label="Students in both" value={pct(s.matchedStudents, s.sheetStudents)} sub={fmtN(s.matchedStudents) + ' of ' + fmtN(s.sheetStudents) + ' sheet students'} accent={C.navy} icon={KPI_ICONS.agent} />
                <PremKPI label="Sheet money found" value={pct(s.matchedSheetAmt, s.sheetAmt)} sub={cr(s.matchedSheetAmt) + ' matched'} accent={C.navy} icon={KPI_ICONS.total} />
                <PremKPI label="Only in sheet" value={cr(s.sheetAmt - s.matchedSheetAmt)} sub={fmtN(sheetOnly.length) + ' students'} accent={C.navy} icon={KPI_ICONS.total} />
                <PremKPI label="Only in portal" value={cr(s.portalAmt - s.matchedPortalAmt)} sub={fmtN(portalOnly.length) + ' students'} accent={C.navy} icon={KPI_ICONS.total} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16, padding: '16px 28px 0' }}>
                <Card title="Where the sheet's money is in the portal" sub="Sheet CIB split by what the portal shows for the same student">
                  <SplitBar parts={s.sheetParts} total={s.sheetAmt} />
                </Card>
                <Card title="Where the portal's money is in the sheet" sub="Portal payments split by what the sheet shows for the same student">
                  <SplitBar parts={s.portalParts} total={s.portalAmt} />
                  {s.inProcess > 0 && <div style={{ marginTop: 10, fontSize: 12, color: C.muted }}>Includes {cr(s.inProcess)} still "Payment In Process".</div>}
                </Card>
              </div>

              <div style={{ padding: '16px 28px 0' }}>
                <Card title="Month by month" sub="Sheet vs portal per month. Matched = same student, same month.">
                  <SmallTable rows={monthRows} cols={[
                    { key: 'mk', label: 'Month', render: r => (r._total ? 'Total' : monthLabel(r.mk)) },
                    { key: 'sheetAmt', label: 'Sheet CIB', num: true, render: r => cr(r.sheetAmt) },
                    { key: 'sheetStudents', label: 'Sheet students', num: true, render: r => fmtN(r.sheetStudents) },
                    { key: 'portalAmt', label: 'Portal paid', num: true, render: r => cr(r.portalAmt) },
                    { key: 'portalStudents', label: 'Portal students', num: true, render: r => fmtN(r.portalStudents) },
                    { key: 'm', label: 'Students in both', num: true, render: r => fmtN(r.matchedStudents) + ' (' + pct(r.matchedStudents, r.sheetStudents) + ')' },
                    { key: 'f', label: 'Sheet money found', num: true, render: r => pct(r.matchedSheetAmt, r.sheetAmt) },
                    { key: 'so', label: 'Only in sheet', num: true, render: r => cr(r.sheetAmt - r.matchedSheetAmt) },
                    { key: 'po', label: 'Only in portal', num: true, render: r => cr(r.portalAmt - r.matchedPortalAmt) },
                  ]} />
                </Card>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16, padding: '16px 28px 0' }}>
                <Card title="Only in the sheet, by package" sub="Sheet sales with no portal payment for that student that month">
                  <SmallTable rows={groupTop(sheetOnly, r => r.pkg, r => r.sheetAmt)} cols={[
                    { key: 'k', label: 'Package' }, { key: 'n', label: 'Students', num: true, render: r => fmtN(r.n) }, { key: 'v', label: 'Sheet CIB', num: true, render: r => cr(r.v) },
                  ]} />
                </Card>
                <Card title="Only in the portal, by product" sub="Portal payments with no sheet sale for that student that month">
                  <SmallTable rows={groupTop(portalOnly, r => r.product, r => r.amt)} cols={[
                    { key: 'k', label: 'Product' }, { key: 'n', label: 'Students', num: true, render: r => fmtN(r.n) }, { key: 'v', label: 'Portal paid', num: true, render: r => cr(r.v) },
                  ]} />
                </Card>
              </div>

              {s.matchedStudents > 0 && (
                <div style={{ padding: '16px 28px 0' }}>
                  <Card title="Students in both: do the amounts agree?" sub="Same student, same month, sheet CIB vs portal payments">
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      {Object.entries(AMT_STATUS).map(([k, label]) => (
                        <button key={k} onClick={() => { setSide('sheet'); setStatusFilter(k) }} style={{ padding: '10px 14px', borderRadius: 10, border: `0.5px solid ${C.border}`, background: 'var(--card)', cursor: 'pointer', textAlign: 'left', fontFamily: FONT }}>
                          <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{fmtN(s.amtCounts[k] || 0)}</div>
                          <div style={{ fontSize: 11.5, color: C.muted }}>{pct(s.amtCounts[k] || 0, s.matchedStudents)} of students in both</div>
                        </button>
                      ))}
                    </div>
                  </Card>
                </div>
              )}

              <div style={{ padding: '16px 28px 0' }}>
                <Card title="Students" sub={fmtN(tableRows.length) + ' rows. Click a status above, or filter here.'}
                  action={<ExportButton data={exportRows} filename={'sales_data_check_' + side + '_' + typeFilter + '_' + month} />}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
                    {[['sheet', 'Sheet side'], ['portal', 'Portal side']].map(([k, l]) => (
                      <button key={k} onClick={() => { setSide(k); setStatusFilter('all'); setLimit(100) }} style={{ padding: '7px 14px', borderRadius: 8, border: `0.5px solid ${side === k ? C.navy : C.border}`, background: side === k ? 'var(--navy-tint)' : 'var(--card)', color: side === k ? C.navy : C.sub, fontSize: 12.5, fontWeight: 700, fontFamily: FONT, cursor: 'pointer' }}>{l}</button>
                    ))}
                    <Dropdown options={statusOptions} value={statusFilter} onChange={v => { setStatusFilter(v); setLimit(100) }} minWidth={240} />
                    <input value={search} onChange={e => { setSearch(e.target.value); setLimit(100) }} placeholder="Search name, email, package" style={{ padding: '7px 12px', borderRadius: 8, border: `0.5px solid ${C.border}`, background: 'var(--card)', color: C.text, fontSize: 12.5, fontFamily: FONT, minWidth: 220 }} />
                  </div>
                  <div style={{ overflow: 'auto', maxHeight: 560, border: `0.5px solid ${C.border}`, borderRadius: 10 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FONT }}>
                      <thead>
                        {side === 'sheet' ? (
                          <tr>{['Month', 'Student', 'Email', 'AC/VAS', 'Package', 'Sheet CIB', 'Portal paid', 'Status', 'Amount', 'Portal product', 'Portal months'].map(h => <th key={h} style={{ ...thS, textAlign: /CIB|paid/.test(h) ? 'right' : 'left' }}>{h}</th>)}</tr>
                        ) : (
                          <tr>{['Month', 'Email', 'Product', 'Payments', 'Portal paid', 'In process', 'Status', 'Sheet months'].map(h => <th key={h} style={{ ...thS, textAlign: /paid|process|Payments/.test(h) ? 'right' : 'left' }}>{h}</th>)}</tr>
                        )}
                      </thead>
                      <tbody>
                        {tableRows.slice(0, limit).map((r, i) => side === 'sheet' ? (
                          <tr key={i}>
                            <td style={tdS}>{monthLabel(r.mk)}</td>
                            <td style={tdS}>{r.name || '-'}</td>
                            <td style={tdS}>{r.email || '-'}</td>
                            <td style={tdS}>{r.type}</td>
                            <td style={tdS}>{r.pkg || '-'}</td>
                            <td style={numTd}>{inr(r.sheetAmt)}</td>
                            <td style={numTd}>{r.portalAmt ? inr(r.portalAmt) : '-'}</td>
                            <td style={tdS}><Pill tone={SHEET_STATUS[r.status].tone}>{SHEET_STATUS[r.status].label}</Pill></td>
                            <td style={tdS}>{r.amtStatus ? AMT_STATUS[r.amtStatus] : '-'}</td>
                            <td style={tdS}>{r.portalProduct || '-'}</td>
                            <td style={tdS}>{r.otherPortalMonths || '-'}</td>
                          </tr>
                        ) : (
                          <tr key={i}>
                            <td style={tdS}>{monthLabel(r.mk)}</td>
                            <td style={tdS}>{r.email || '-'}</td>
                            <td style={tdS}>{r.product || '-'}</td>
                            <td style={numTd}>{fmtN(r.pays)}</td>
                            <td style={numTd}>{inr(r.amt)}</td>
                            <td style={numTd}>{r.inProcess ? inr(r.inProcess) : '-'}</td>
                            <td style={tdS}><Pill tone={PORTAL_STATUS[r.status].tone}>{PORTAL_STATUS[r.status].label}</Pill></td>
                            <td style={tdS}>{r.sheetMonths || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {tableRows.length > limit && (
                    <div style={{ marginTop: 10, textAlign: 'center' }}>
                      <Button size="sm" variant="secondary" onClick={() => setLimit(l => l + 200)}>Show more ({fmtN(tableRows.length - limit)} left)</Button>
                    </div>
                  )}
                </Card>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
