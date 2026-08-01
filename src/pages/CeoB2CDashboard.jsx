import React, { useEffect, useMemo, useState } from 'react'
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer } from 'recharts'
import Sidebar from '../components/Sidebar'
import Dropdown from '../components/Dropdown'
import KPICard from '../components/KPICard'
import styles from './CeoB2CDashboard.module.css'

// Line items exactly as the finance sheet names them, in sheet order.
const REV = [['sr', 'SR Online'], ['ac', 'AC Online'], ['vas', 'VAS Online'], ['offRev', 'Offline']]
const COST = [['people', 'People'], ['pm', 'Perf. Marketing'], ['op', 'Operating'], ['offCost', 'Offline'], ['corp', 'Corp. Overheads']]
const PLAN = [['people', 'People'], ['operating', 'Operating'], ['corp', 'Corp. Overheads'], ['offline', 'Offline']]

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

export default function CeoB2CDashboard() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState('')

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
  const days = (data && data.days) || []
  const upto = useMemo(function () { return days.filter(function (d) { return d.date <= d1 }) }, [data, d1])
  const months = useMemo(function () {
    const seen = []
    upto.forEach(function (d) { if (d.month && seen.indexOf(d.month) === -1) seen.push(d.month) })
    return seen
  }, [upto])
  useEffect(function () {
    if (months.length && months.indexOf(month) === -1) setMonth(months[months.length - 1])
  }, [months, month])

  const rows = useMemo(function () { return upto.filter(function (d) { return d.month === month }) }, [upto, month])
  const last = rows.length ? rows[rows.length - 1] : null

  const mtd = useMemo(function () {
    const o = {}
    REV.concat(COST).forEach(function (d) { o[d[0]] = col(rows, d[0]) })
    o.rev = col(rows, 'totalRev'); if (o.rev == null) o.rev = roll(o, REV)
    o.cost = col(rows, 'totalCost'); if (o.cost == null) o.cost = roll(o, COST)
    o.net = col(rows, 'net'); if (o.net == null) o.net = sub(o.rev, o.cost)
    return o
  }, [rows])

  const day = useMemo(function () {
    if (!last) return null
    const o = { date: last.date }
    REV.concat(COST).forEach(function (d) { o[d[0]] = last[d[0]] })
    o.rev = last.totalRev != null ? last.totalRev : roll(o, REV)
    o.cost = last.totalCost != null ? last.totalCost : roll(o, COST)
    o.net = last.net != null ? last.net : sub(o.rev, o.cost)
    return o
  }, [last])

  const chart = useMemo(function () {
    return rows.map(function (r) {
      const o = {}
      REV.concat(COST).forEach(function (d) { o[d[0]] = r[d[0]] })
      const rev = r.totalRev != null ? r.totalRev : roll(o, REV)
      const cost = r.totalCost != null ? r.totalCost : roll(o, COST)
      const net = r.net != null ? r.net : sub(rev, cost)
      return { d: r.date.slice(8), Revenue: rev || 0, Cost: cost || 0, 'Net inflow': net || 0 }
    })
  }, [rows])

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

  const monthOpts = months.map(function (m) { return { value: m, label: m.replace('-', ' ') } })
  const margin = mtd.rev ? (mtd.net / mtd.rev) * 100 : null
  const notSet = !!(data && data.configured === false)
  const ready = !loading && !err && !notSet && rows.length > 0

  return (
    <div className={styles.layout}>
      <Sidebar />
      <div className={styles.main}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <p className={styles.breadcrumb}>Dashboards / CEO</p>
            <h1 className={styles.pageTitle}>B2C &mdash; cost, revenue and net inflow</h1>
          </div>
          <div className={styles.headerRight}>
            <span className={styles.badge}>Through {d1}</span>
            {months.length > 0 ? <Dropdown options={monthOpts} value={month} onChange={setMonth} minWidth={150} /> : null}
          </div>
        </div>
        <div className={styles.content}>
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
              <KPICard label="MTD Revenue" value={inr(mtd.rev)} sub={month.replace('-', ' ') + ', through ' + d1} />
              <KPICard label="MTD Cost" value={inr(mtd.cost)} sub="people, marketing, ops, offline, overheads" />
              <KPICard label="MTD Net Inflow" value={inr(mtd.net)} sub="revenue less cost" />
              <KPICard label="Net Margin" value={margin == null ? '\u2014' : margin.toFixed(1) + '%'} sub="net inflow over revenue" />
              <KPICard label="Latest Day Net Inflow" value={inr(day && day.net)} sub={day ? day.date : ''} />
            </div>
          ) : null}
          {ready ? (
            <div className={styles.card}>
              <div className={styles.cardHead}>
                <span className={styles.cardTitle}>Revenue &rarr; Cost &rarr; Net Inflow</span>
                <span className={styles.cardSub}>exact rupees, straight from the sheet</span>
              </div>
              <table className={styles.table}>
                <thead>
                  <tr><th>Line item</th><th>{day ? day.date : 'Latest day'}</th><th>Month to date</th><th>Share</th></tr>
                </thead>
                <tbody>
                  <tr><td className={styles.group} colSpan={4}>Revenue</td></tr>
                  {REV.map(function (r) {
                    return (
                      <tr key={r[0]}>
                        <td>{r[1]}</td>
                        <td>{full(day && day[r[0]])}</td>
                        <td>{full(mtd[r[0]])}</td>
                        <td>{mtd.rev && mtd[r[0]] != null ? ((mtd[r[0]] / mtd.rev) * 100).toFixed(1) + '%' : '\u2014'}</td>
                      </tr>
                    )
                  })}
                  <tr className={styles.total}>
                    <td>Total Revenue</td><td>{full(day && day.rev)}</td><td>{full(mtd.rev)}</td><td>100%</td>
                  </tr>
                  <tr><td className={styles.group} colSpan={4}>Cost</td></tr>
                  {COST.map(function (c) {
                    return (
                      <tr key={c[0]}>
                        <td>{c[1]}</td>
                        <td>{full(day && day[c[0]])}</td>
                        <td>{full(mtd[c[0]])}</td>
                        <td>{mtd.cost && mtd[c[0]] != null ? ((mtd[c[0]] / mtd.cost) * 100).toFixed(1) + '%' : '\u2014'}</td>
                      </tr>
                    )
                  })}
                  <tr className={styles.total}>
                    <td>Total Cost</td><td>{full(day && day.cost)}</td><td>{full(mtd.cost)}</td><td>100%</td>
                  </tr>
                  <tr className={styles.total}>
                    <td>Net Inflow</td>
                    <td className={day && day.net != null && day.net < 0 ? styles.neg : styles.pos}>{full(day && day.net)}</td>
                    <td className={mtd.net != null && mtd.net < 0 ? styles.neg : styles.pos}>{full(mtd.net)}</td>
                    <td>{margin == null ? '\u2014' : margin.toFixed(1) + '%'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : null}
          {ready ? (
            <div className={styles.card}>
              <div className={styles.cardHead}>
                <span className={styles.cardTitle}>Daily revenue, cost and net inflow</span>
                <span className={styles.cardSub}>{month.replace('-', ' ')}</span>
              </div>
              <div style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chart} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" vertical={false} />
                    <XAxis dataKey="d" tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={false} tickLine={false} tickFormatter={inr} width={78} />
                    <Tooltip formatter={function (v) { return full(v) }} contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid var(--card-border)', background: 'var(--card)', color: 'var(--text)' }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Revenue" fill="#1C9FD4" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Cost" fill="#1F3C84" radius={[4, 4, 0, 0]} />
                    <Line type="monotone" dataKey="Net inflow" stroke="#4CAE6F" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : null}
          {ready ? (
            <div className={styles.card}>
              <div className={styles.cardHead}>
                <span className={styles.cardTitle}>Monthly cost plan vs actual</span>
                <span className={styles.cardSub}>{shortMonth}</span>
              </div>
              <table className={styles.table}>
                <thead>
                  <tr><th>Cost head</th><th>Forecast</th><th>Actual</th><th>Variance</th></tr>
                </thead>
                <tbody>
                  {planRows.map(function (p) {
                    const both = p.forecast != null && p.actual != null
                    return (
                      <tr key={p.label}>
                        <td>{p.label}</td>
                        <td>{full(p.forecast)}</td>
                        <td>{full(p.actual)}</td>
                        <td className={both ? (p.actual > p.forecast ? styles.neg : styles.pos) : undefined}>
                          {both ? full(p.actual - p.forecast) : '\u2014'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className={styles.note}>
                Performance marketing has no forecast line here &mdash; it comes from the ad platforms, not from a plan.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
