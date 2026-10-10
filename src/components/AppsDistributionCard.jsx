import React, { useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts'
import { C, FONT, fmtN, Card, BAR_RADIUS, GRID_STROKE } from '../ui/dashboardKit'

// Applications distribution for the Apps page, three views over the SAME rows the
// rest of the page is showing (so the filters apply):
//   Month on month      -- by first application submitted date
//   Intake on intake    -- same intake month, year vs year (intake_category, e.g. Sep'2025)
//   Half-year and year  -- H1 = Apr-Sep intakes, H2 = Oct-Mar intakes. The financial year
//                          follows the INTAKE too: a Jan 2027 intake is H2 of FY26-27, a
//                          Sep 2026 intake is H1 of FY26-27, whenever the application was
//                          submitted. Confirmed with the owner 2026-10-10.

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const SERIES = [C.navy, C.blue, C.cyan, C.green]
const VIEWS = [
  { id: 'month', label: 'Month on month' },
  { id: 'intake', label: 'Intake on intake' },
  { id: 'half', label: 'H1 / H2 and year' },
]

// "Sep'2025" -> { m: 9, y: 2025 }; falls back to intake_date (ISO-ish) when the label is odd.
function parseIntake(r) {
  const s = String(r.intake_category || '').trim()
  let m = /^([A-Za-z]{3})[a-z]*['’ ]+(\d{4})$/.exec(s)
  if (m) {
    const mi = MON.findIndex(x => x.toLowerCase() === m[1].toLowerCase())
    if (mi >= 0) return { m: mi + 1, y: Number(m[2]) }
  }
  m = /^(\d{4})-(\d{2})/.exec(String(r.intake_date || ''))
  if (m) return { m: Number(m[2]), y: Number(m[1]) }
  return null
}

// FY by intake: Apr-Sep = H1 of FY starting that year, Oct-Dec = H2 of the same FY,
// Jan-Mar = H2 of the FY that started the year before.
function fyHalf(it) {
  if (it.m >= 4 && it.m <= 9) return { fy: it.y, half: 'H1' }
  if (it.m >= 10) return { fy: it.y, half: 'H2' }
  return { fy: it.y - 1, half: 'H2' }
}
const fyLabel = fy => 'FY' + String(fy).slice(2) + '-' + String(fy + 1).slice(2)

function delta(cur, prev) {
  if (prev == null || prev === 0 || cur == null) return null
  return ((cur - prev) / prev) * 100
}
function DeltaText({ v }) {
  if (v == null) return <span style={{ color: C.muted }}>—</span>
  const up = v >= 0
  return <span style={{ color: up ? C.green : C.navy, fontWeight: 700 }}>{up ? '▲' : '▼'} {Math.abs(v).toFixed(1)}%</span>
}

const th = { padding: '8px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap', background: 'var(--card)', position: 'sticky', top: 0 }
const thR = { ...th, textAlign: 'right' }
const td = { padding: '8px 14px', fontSize: 13, color: C.text, whiteSpace: 'nowrap' }
const tdR = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
const tipStyle = { background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 10, fontFamily: FONT, fontSize: 12.5 }
const axisTick = { fontSize: 11.5, fill: C.muted, fontFamily: FONT }

function Chart({ data, keys, names }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="label" tick={axisTick} axisLine={{ stroke: GRID_STROKE }} tickLine={false} interval={0} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} tickFormatter={fmtN} width={48} />
        <Tooltip formatter={v => fmtN(v)} contentStyle={tipStyle} />
        {keys.length > 1 && <Legend wrapperStyle={{ fontSize: 12, fontFamily: FONT }} />}
        {keys.map((k, i) => <Bar key={k} dataKey={k} name={names ? names[i] : k} fill={SERIES[i % SERIES.length]} radius={BAR_RADIUS} maxBarSize={34} />)}
      </BarChart>
    </ResponsiveContainer>
  )
}

export default function AppsDistributionCard({ rows }) {
  const [view, setView] = useState('month')

  // ---- month on month (first application submitted date) ----
  const monthly = useMemo(() => {
    const map = new Map()
    for (const r of rows) {
      const d = r.first_app_submitted_at
      if (!d || d.length < 7) continue
      const k = d.slice(0, 7)
      map.set(k, (map.get(k) || 0) + 1)
    }
    const keys = Array.from(map.keys()).sort()
    return keys.map(k => {
      const [y, m] = k.split('-').map(Number)
      const prevKey = m === 1 ? (y - 1) + '-12' : y + '-' + String(m - 1).padStart(2, '0')
      const yoyKey = (y - 1) + '-' + String(m).padStart(2, '0')
      const count = map.get(k)
      return { key: k, label: MON[m - 1] + " '" + String(y).slice(2), count, mom: delta(count, map.get(prevKey)), yoy: delta(count, map.get(yoyKey)) }
    })
  }, [rows])

  // ---- intake and half-year views ----
  const intake = useMemo(() => {
    const byIntake = new Map() // 'y-m' -> count
    let missing = 0
    for (const r of rows) {
      const it = parseIntake(r)
      if (!it) { missing += 1; continue }
      const k = it.y + '-' + it.m
      byIntake.set(k, (byIntake.get(k) || 0) + 1)
    }
    const years = Array.from(new Set(Array.from(byIntake.keys()).map(k => Number(k.split('-')[0])))).sort((a, b) => a - b)
    const months = Array.from(new Set(Array.from(byIntake.keys()).map(k => Number(k.split('-')[1])))).sort((a, b) => a - b)
    const get = (y, m) => byIntake.get(y + '-' + m)
    return { years, months, get, missing }
  }, [rows])

  const half = useMemo(() => {
    const map = new Map() // fy -> { H1, H2 }
    for (const r of rows) {
      const it = parseIntake(r)
      if (!it) continue
      const { fy, half: h } = fyHalf(it)
      const cur = map.get(fy) || { H1: 0, H2: 0 }
      cur[h] += 1
      map.set(fy, cur)
    }
    const fys = Array.from(map.keys()).sort((a, b) => a - b)
    const now = new Date()
    return fys.map((fy, i) => {
      const v = map.get(fy), p = map.get(fy - 1)
      const total = v.H1 + v.H2
      // A half is still collecting applications until its last intake month has passed.
      const h1Open = new Date(fy, 9, 1) > now // H1 closes with Sep intakes
      const h2Open = new Date(fy + 1, 3, 1) > now // H2 closes with Mar intakes
      return {
        fy, label: fyLabel(fy), H1: v.H1, H2: v.H2, total,
        h1Open, h2Open,
        h1Yoy: delta(v.H1, p && p.H1), h2Yoy: delta(v.H2, p && p.H2), totalYoy: p ? delta(total, p.H1 + p.H2) : null,
      }
    })
  }, [rows])

  const monthChart = monthly.slice(-24)
  const intakeYearsShown = intake.years.slice(-4)
  const intakeChart = intake.months.map(m => {
    const o = { label: MON[m - 1] }
    intakeYearsShown.forEach(y => { o['y' + y] = intake.get(y, m) || 0 })
    return o
  })

  const sub = view === 'month'
    ? 'First application submitted date'
    : view === 'intake'
      ? 'Same intake, year against year (by the intake the student applied for)'
      : 'H1 = Apr to Sep intakes, H2 = Oct to Mar intakes. Financial year follows the intake, not the submitted date'

  return (
    <Card title="Applications distribution" sub={sub}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        {VIEWS.map(v => {
          const on = v.id === view
          return (
            <button key={v.id} onClick={() => setView(v.id)} style={{
              padding: '7px 14px', fontSize: 12.5, fontWeight: 700, borderRadius: 8, cursor: 'pointer', fontFamily: FONT,
              border: '0.5px solid ' + (on ? C.navy : 'var(--card-border)'), background: on ? C.navy : 'transparent', color: on ? '#fff' : C.text,
            }}>{v.label}</button>
          )
        })}
      </div>

      {view === 'month' && (
        <>
          <Chart data={monthChart.map(m => ({ label: m.label, count: m.count }))} keys={['count']} names={['Applications']} />
          <div style={{ maxHeight: 320, overflow: 'auto', marginTop: 12, border: '0.5px solid var(--card-border)', borderRadius: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FONT }}>
              <thead><tr><th style={th}>Month</th><th style={thR}>Applications</th><th style={thR}>vs previous month</th><th style={thR}>vs same month last year</th></tr></thead>
              <tbody>
                {[...monthly].reverse().map(m => (
                  <tr key={m.key} style={{ borderTop: '0.5px solid var(--card-border)' }}>
                    <td style={td}>{m.label}</td><td style={tdR}>{fmtN(m.count)}</td>
                    <td style={tdR}><DeltaText v={m.mom} /></td><td style={tdR}><DeltaText v={m.yoy} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {view === 'intake' && (
        <>
          <Chart data={intakeChart} keys={intakeYearsShown.map(y => 'y' + y)} names={intakeYearsShown.map(String)} />
          <div style={{ overflow: 'auto', marginTop: 12, border: '0.5px solid var(--card-border)', borderRadius: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FONT }}>
              <thead><tr><th style={th}>Intake</th>{intake.years.map(y => <th key={y} style={thR}>{y}</th>)}</tr></thead>
              <tbody>
                {intake.months.map(m => (
                  <tr key={m} style={{ borderTop: '0.5px solid var(--card-border)' }}>
                    <td style={td}>{MON[m - 1]}</td>
                    {intake.years.map((y, i) => {
                      const v = intake.get(y, m)
                      const p = i > 0 ? intake.get(intake.years[i - 1], m) : null
                      return (
                        <td key={y} style={tdR}>
                          {v == null ? <span style={{ color: C.muted }}>—</span> : fmtN(v)}
                          {v != null && p != null && <div style={{ fontSize: 11 }}><DeltaText v={delta(v, p)} /></div>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {intake.missing > 0 && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 8 }}>{fmtN(intake.missing)} applications have no intake and are left out here.</div>}
        </>
      )}

      {view === 'half' && (
        <>
          <Chart data={half.map(h => ({ label: h.label, H1: h.H1, H2: h.H2 }))} keys={['H1', 'H2']} names={['H1 (Apr to Sep intakes)', 'H2 (Oct to Mar intakes)']} />
          <div style={{ overflow: 'auto', marginTop: 12, border: '0.5px solid var(--card-border)', borderRadius: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FONT }}>
              <thead><tr><th style={th}>Financial year</th><th style={thR}>H1</th><th style={thR}>H1 vs last year</th><th style={thR}>H2</th><th style={thR}>H2 vs last year</th><th style={thR}>Total</th><th style={thR}>Total vs last year</th></tr></thead>
              <tbody>
                {half.map(h => (
                  <tr key={h.fy} style={{ borderTop: '0.5px solid var(--card-border)' }}>
                    <td style={td}>{h.label}</td>
                    <td style={tdR}>{fmtN(h.H1)}{h.h1Open && <span style={{ color: C.muted, fontSize: 11 }}> so far</span>}</td><td style={tdR}><DeltaText v={h.h1Yoy} /></td>
                    <td style={tdR}>{fmtN(h.H2)}{h.h2Open && <span style={{ color: C.muted, fontSize: 11 }}> so far</span>}</td><td style={tdR}><DeltaText v={h.h2Yoy} /></td>
                    <td style={{ ...tdR, fontWeight: 700 }}>{fmtN(h.total)}</td><td style={tdR}><DeltaText v={h.totalYoy} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 8 }}>A half marked "so far" still has intakes open, so its count keeps growing and the change against last year is not like for like yet.</div>
        </>
      )}
    </Card>
  )
}
