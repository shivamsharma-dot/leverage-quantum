import React from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LabelList
} from 'recharts'
import { C, FONT, fmtN, Card } from '../ui/dashboardKit'

/* ------------------------------------------------------------------
   Marketing-quality sections for the Overall page.

   The rest of that page reads on lead volume. These read on cost and
   on qualified leads, which is what the money is actually judged on.
   They are the same cuts the CEO Slack report carries - CPQL by
   source, spend against quality, corridors and ads ranked on CPQL,
   and what is not working - minus the written insights.

   Brand colours only, and no emojis anywhere (Quantum UI rule).
   Every rupee figure is printed in full; the Cr/L short form is only
   ever a hover title, exactly as on the rest of the page.
   ------------------------------------------------------------------ */

const axis = { fontSize: 11, fill: C.muted, fontFamily: FONT }
const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }
const nums = { fontVariantNumeric: 'tabular-nums' }
const DASH = '\u2014'
const MID = '\u00b7'
const UP = '\u25b2'
const DOWN = '\u25bc'
const TRACK = '#F1F5F9'
const MANUAL = 'Affiliate (manual entry)'

const sectionTitle = (t, s) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ fontSize: 14, fontWeight: 800, color: C.text, letterSpacing: '-0.2px' }}>{t}</div>
    {s && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{s}</div>}
  </div>
)

const Th = ({ children, a, hint }) => (
  <div title={hint} style={{
    fontSize: 9.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
    color: C.muted, fontFamily: FONT, textAlign: a || 'right', whiteSpace: 'nowrap',
    overflow: 'hidden', textOverflow: 'ellipsis'
  }}>{children}</div>
)

const Cell = ({ children, a, strong, col, hint }) => (
  <div title={hint} style={{
    fontSize: 12, fontWeight: strong ? 800 : 600, color: col || C.text, fontFamily: FONT,
    textAlign: a || 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    ...nums
  }}>{children}</div>
)

const Track = ({ w, col }) => (
  <div style={{ height: 6, borderRadius: 99, background: TRACK, overflow: 'hidden' }}>
    <div style={{
      height: '100%', width: Math.max(0, Math.min(100, w || 0)) + '%', borderRadius: 99,
      background: 'linear-gradient(90deg,' + col + ',' + col + 'cc)', transition: 'width .6s cubic-bezier(.22,1,.36,1)'
    }} />
  </div>
)

const Empty = ({ children }) => (
  <div style={{ textAlign: 'center', padding: '22px 0', color: C.muted, fontSize: 12.5, fontFamily: FONT }}>{children}</div>
)

const Note = ({ children }) => (
  <div style={{
    marginTop: 12, paddingTop: 10, borderTop: '1px solid #F1F5F9',
    fontSize: 10.5, color: C.muted, fontFamily: FONT, lineHeight: 1.6
  }}>{children}</div>
)

function shareOf(a, b) { return b > 0 ? (a / b) * 100 : null }
function pctText(v) { return v == null ? DASH : v.toFixed(1) + '%' }
function isRanked(r, minQL) { return r && r.cpql != null && r.cpql > 0 && (r.totalQL || 0) >= minQL }

/* Movement against the previous period. Cost metrics pass invert, since
   for them down is the good direction. Anything inside 0.5% is flat -
   a rounding wobble is not a story. */
function Vs({ now, prev, invert, fmt }) {
  const base = { fontSize: 11, fontWeight: 700, fontFamily: FONT, whiteSpace: 'nowrap', ...nums }
  if (now == null || !(now > 0)) return <span style={{ ...base, color: C.muted }}>{DASH}</span>
  if (prev == null || !(prev > 0)) return <span style={{ ...base, color: C.muted }}>new</span>
  const d = ((now - prev) / prev) * 100
  const flat = Math.abs(d) < 0.5
  const up = d > 0
  const col = flat ? C.muted : ((invert ? !up : up) ? C.green : C.navy)
  return (
    <span style={{ ...base, color: col }}>
      {flat ? 'flat' : (up ? UP : DOWN) + ' ' + Math.abs(d).toFixed(1) + '%'}
      <span style={{ color: C.muted, fontWeight: 600 }}>{' ' + MID + ' ' + fmt(prev)}</span>
    </span>
  )
}

function MoneyTip({ active, payload, label, fmtINR }) {
  if (!active || !payload || !payload.length) return null
  return (
    <div style={{
      background: '#fff', border: '1px solid ' + C.border, borderRadius: 10, padding: '9px 11px',
      boxShadow: '0 8px 20px -8px rgba(16,24,40,0.18)', fontFamily: FONT
    }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: C.text, marginBottom: 5 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ fontSize: 11, color: C.sub, display: 'flex', gap: 10, justifyContent: 'space-between' }}>
          <span style={{ color: p.color, fontWeight: 700 }}>{p.name}</span>
          <span style={{ fontWeight: 800, color: C.text, ...nums }}>{p.value == null ? DASH : fmtINR(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

/* ===== 1. Cost per qualified lead by source ===== */
export function CpqlBySource({ cmp, prevLabel, fmtINR, fmtINRShort }) {
  const paid = ((cmp && cmp.channels) || []).filter(r => (r.spend || 0) > 0)
  const cols = 'minmax(110px,1fr) 132px 74px 70px 70px 100px 168px 60px'
  if (!paid.length) {
    return <Card>{sectionTitle('Cost per qualified lead by source', 'no paid spend in this selection')}<Empty>No spend to cost out.</Empty></Card>
  }
  const rows = paid.slice().sort((a, b) =>
    (a.cpql == null ? Infinity : a.cpql) - (b.cpql == null ? Infinity : b.cpql))
  const totSpend = rows.reduce((t, r) => t + (r.spend || 0), 0)
  const totQL = rows.reduce((t, r) => t + (r.totalQL || 0), 0)
  const pSpend = rows.reduce((t, r) => t + ((r.prev && r.prev.spend) || 0), 0)
  const pQL = rows.reduce((t, r) => t + ((r.prev && r.prev.totalQL) || 0), 0)
  const blended = totQL > 0 ? totSpend / totQL : null
  const pBlended = pQL > 0 && pSpend > 0 ? pSpend / pQL : null
  const maxCpql = Math.max(1, ...rows.map(r => r.cpql || 0))
  const head = (
    <div style={{ display: 'grid', gridTemplateColumns: cols, gap: '0 12px', paddingBottom: 8, borderBottom: '1px solid #EEF1F6' }}>
      <Th a="left">Source</Th>
      <Th>Spend</Th>
      <Th>% of spend</Th>
      <Th>QLs</Th>
      <Th>% of QLs</Th>
      <Th>CPQL</Th>
      <Th>{'CPQL vs ' + (prevLabel || 'last')}</Th>
      <Th hint="Share of qualified leads divided by share of spend. Above 1.00x means the channel returns more quality than the money it takes.">Index</Th>
    </div>
  )
  return (
    <Card>
      {sectionTitle(
        'Cost per qualified lead by source',
        'paid sources only ' + MID + ' cheapest CPQL first ' + MID + ' quality share read against spend share'
      )}
      {head}
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: '0 12px', alignItems: 'center', padding: '11px 0', borderBottom: '1px solid #EEF1F6', background: 'transparent' }}>
        <Cell a="left" strong col={C.navy}>ALL PAID</Cell>
        <Cell strong hint={fmtINRShort(totSpend)}>{fmtINR(totSpend)}</Cell>
        <Cell col={C.muted}>100.0%</Cell>
        <Cell strong>{fmtN(totQL)}</Cell>
        <Cell col={C.muted}>100.0%</Cell>
        <Cell strong>{blended == null ? DASH : fmtINR(Math.round(blended))}</Cell>
        <div style={{ textAlign: 'right' }}><Vs now={blended} prev={pBlended} invert fmt={v => fmtINR(Math.round(v))} /></div>
        <Cell col={C.muted}>{DASH}</Cell>
      </div>
      {rows.map((r, i) => {
        const sp = shareOf(r.spend, totSpend)
        const qp = shareOf(r.totalQL, totQL)
        const idx = sp > 0 && qp != null ? qp / sp : null
        const cheap = r.cpql != null && blended != null && r.cpql <= blended
        return (
          <div key={r.label} style={{ padding: '10px 0', borderBottom: i === rows.length - 1 ? 'none' : '1px solid #F8FAFC' }}>
            <div style={{ display: 'grid', gridTemplateColumns: cols, gap: '0 12px', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span style={{
                  width: 18, height: 18, borderRadius: 5, flexShrink: 0, fontSize: 9.5, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT,
                  background: cheap ? C.greenBg : C.navyBg, color: cheap ? C.green : C.navy
                }}>{i + 1}</span>
                <Cell a="left" strong hint={r.label}>{r.label}</Cell>
              </div>
              <Cell hint={fmtINRShort(r.spend)}>{fmtINR(r.spend)}</Cell>
              <Cell col={C.muted}>{pctText(sp)}</Cell>
              <Cell strong>{fmtN(r.totalQL)}</Cell>
              <Cell col={C.muted}>{pctText(qp)}</Cell>
              <Cell strong col={r.cpql == null ? C.muted : (cheap ? C.green : C.text)}>{r.cpql == null ? DASH : fmtINR(Math.round(r.cpql))}</Cell>
              <div style={{ textAlign: 'right' }}><Vs now={r.cpql} prev={r.prev ? r.prev.cpql : null} invert fmt={v => fmtINR(Math.round(v))} /></div>
              <Cell strong col={idx == null ? C.muted : (idx >= 1.05 ? C.green : (idx <= 0.95 ? C.navy : C.muted))}>{idx == null ? DASH : idx.toFixed(2) + 'x'}</Cell>
            </div>
            <div style={{ marginTop: 7 }}>
              <Track w={r.cpql != null ? (r.cpql / maxCpql) * 100 : 0} col={cheap ? C.green : C.navy} />
            </div>
          </div>
        )
      })}
      <Note>
        CPQL divides spend by qualified leads on paid sources only, so free channels never make acquisition look cheaper than it was.
        Index is QL share divided by spend share. Green is at or below the blended paid CPQL, navy is above it.
      </Note>
    </Card>
  )
}

/* ===== 2. Spend against qualified leads ===== */
export function SpendVsQuality({ cmp, fmtINR, fmtINRShort }) {
  const paid = ((cmp && cmp.channels) || []).filter(r => (r.spend || 0) > 0)
  if (!paid.length) {
    return <Card>{sectionTitle('Spend against qualified leads', 'no paid spend in this selection')}<Empty>Nothing to compare.</Empty></Card>
  }
  const rows = paid.slice().sort((a, b) => (b.spend || 0) - (a.spend || 0))
  const totSpend = rows.reduce((t, r) => t + (r.spend || 0), 0)
  const totQL = rows.reduce((t, r) => t + (r.totalQL || 0), 0)
  return (
    <Card>
      {sectionTitle('Spend against qualified leads', 'where the money went, read against where the quality came from')}
      <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
        {[['Share of spend', C.navy], ['Share of QLs', C.cyan]].map(([l, col]) => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 9, height: 9, borderRadius: 99, background: col }} />
            <span style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, fontFamily: FONT }}>{l}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
        {rows.map(r => {
          const sp = shareOf(r.spend, totSpend) || 0
          const qp = shareOf(r.totalQL, totQL) || 0
          const idx = sp > 0 ? qp / sp : null
          const good = idx != null && idx >= 1.05
          const bad = idx != null && idx <= 0.95
          return (
            <div key={r.label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5, gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: FONT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.label}>{r.label}</span>
                <span style={{ fontSize: 11, fontWeight: 800, fontFamily: FONT, flexShrink: 0, color: good ? C.green : (bad ? C.navy : C.muted), ...nums }}>
                  {idx == null ? DASH : idx.toFixed(2) + 'x'}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 52px', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                <Track w={sp} col={C.navy} />
                <span style={{ fontSize: 10.5, fontWeight: 700, color: C.sub, fontFamily: FONT, textAlign: 'right', ...nums }} title={fmtINRShort(r.spend)}>{pctText(sp)}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 52px', gap: 8, alignItems: 'center' }}>
                <Track w={qp} col={C.cyan} />
                <span style={{ fontSize: 10.5, fontWeight: 700, color: C.sub, fontFamily: FONT, textAlign: 'right', ...nums }} title={fmtN(r.totalQL) + ' QLs'}>{pctText(qp)}</span>
              </div>
            </div>
          )
        })}
      </div>
      <Note>
        The multiple on the right is QL share divided by spend share. Above 1.00x the channel is pulling more than its weight in quality, below it the channel is taking money it has not earned yet.
      </Note>
    </Card>
  )
}

/* ===== 3. Cost trend, month on month ===== */
export function CostTrendMonth({ data, fmtINR }) {
  const rows = (data || []).filter(d => d.cpql != null || d.cpl != null)
  return (
    <Card>
      {sectionTitle('Cost per QL, month on month', 'paid sources, inside the current filters ' + MID + ' CPQL on the left axis, CPL on the right')}
      {!rows.length ? <Empty>No paid spend in this selection.</Empty> : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={rows} margin={{ left: 0, right: 8, top: 18, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
            <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
            <YAxis yAxisId="l" tick={axis} axisLine={false} tickLine={false} width={66} tickFormatter={v => fmtINR(v)} />
            <YAxis yAxisId="r" orientation="right" tick={axis} axisLine={false} tickLine={false} width={56} tickFormatter={v => fmtINR(v)} />
            <Tooltip content={<MoneyTip fmtINR={fmtINR} />} />
            <Legend wrapperStyle={{ fontSize: 11, fontFamily: FONT }} />
            <Line yAxisId="l" type="monotone" dataKey="cpql" name="CPQL" stroke={C.navy} strokeWidth={2.5} dot={{ r: 3 }} connectNulls>
              <LabelList dataKey="cpql" position="top" formatter={v => (v == null ? '' : fmtINR(v))} style={{ fontSize: 10, fontWeight: 700, fill: C.sub }} />
            </Line>
            <Line yAxisId="r" type="monotone" dataKey="cpl" name="CPL" stroke={C.cyan} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}

/* ===== 4. Cost trend, day by day ===== */
export function CostTrendDay({ data, fmtINR }) {
  const rows = (data || []).filter(d => d.cpql != null || d.cpl != null)
  return (
    <Card>
      {sectionTitle('Cost per QL, day by day', 'closed days only, so a half-finished today never reads as a collapse ' + MID + ' CPQL on the left axis, CPL on the right')}
      {!rows.length ? <Empty>No closed day with paid spend in this selection.</Empty> : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={rows} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
            <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis yAxisId="l" tick={axis} axisLine={false} tickLine={false} width={66} tickFormatter={v => fmtINR(v)} />
            <YAxis yAxisId="r" orientation="right" tick={axis} axisLine={false} tickLine={false} width={56} tickFormatter={v => fmtINR(v)} />
            <Tooltip content={<MoneyTip fmtINR={fmtINR} />} />
            <Legend wrapperStyle={{ fontSize: 11, fontFamily: FONT }} />
            <Line yAxisId="l" type="monotone" dataKey="cpql" name="CPQL" stroke={C.navy} strokeWidth={2.5} dot={false} connectNulls />
            <Line yAxisId="r" type="monotone" dataKey="cpl" name="CPL" stroke={C.cyan} strokeWidth={2.5} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}

/* ===== 5. Corridors ranked on CPQL ===== */
export function CorridorRanking({ cmp, minQL, prevLabel, fmtINR, fmtINRShort }) {
  const all = (cmp && cmp.corridors) || []
  const scope = (cmp && cmp.corridorScope) || 'Paid'
  const cols = 'minmax(120px,1fr) 132px 84px 74px 100px 168px'
  const ranked = all.filter(c => isRanked(c, minQL)).sort((a, b) => a.cpql - b.cpql)
  const rest = all.filter(c => !isRanked(c, minQL))
  const below = rest.reduce((t, c) => t + (c.spend || 0), 0)
  const biggest = rest.slice().sort((a, b) => (b.spend || 0) - (a.spend || 0))[0]
  const tSpend = ranked.reduce((t, c) => t + (c.spend || 0), 0)
  const tLeads = ranked.reduce((t, c) => t + (c.leads || 0), 0)
  const tQL = ranked.reduce((t, c) => t + (c.totalQL || 0), 0)
  const tPrevSpend = ranked.reduce((t, c) => t + ((c.prev && c.prev.spend) || 0), 0)
  const tPrevQL = ranked.reduce((t, c) => t + ((c.prev && c.prev.totalQL) || 0), 0)
  const tCpql = tQL > 0 ? tSpend / tQL : null
  const tPrevCpql = tPrevQL > 0 && tPrevSpend > 0 ? tPrevSpend / tPrevQL : null
  const maxCpql = Math.max(1, ...ranked.map(c => c.cpql || 0))
  const sub = scope + ' campaigns only ' + MID + ' cheapest CPQL first ' + MID + ' a corridor needs at least ' + minQL + ' QLs to be ranked'
  return (
    <Card>
      {sectionTitle('Corridors ranked on CPQL', sub)}
      {!ranked.length ? <Empty>{'No corridor reached ' + minQL + ' qualified leads in this selection.'}</Empty> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: cols, gap: '0 12px', paddingBottom: 8, borderBottom: '1px solid #EEF1F6' }}>
            <Th a="left">Corridor</Th>
            <Th>Spend</Th>
            <Th>Leads</Th>
            <Th>QLs</Th>
            <Th>CPQL</Th>
            <Th>{'CPQL vs ' + (prevLabel || 'last')}</Th>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: cols, gap: '0 12px', alignItems: 'center', padding: '11px 0', borderBottom: '1px solid #EEF1F6' }}>
            <Cell a="left" strong col={C.navy}>{'ALL ' + ranked.length + ' RANKED'}</Cell>
            <Cell strong hint={fmtINRShort(tSpend)}>{fmtINR(tSpend)}</Cell>
            <Cell strong>{fmtN(tLeads)}</Cell>
            <Cell strong>{fmtN(tQL)}</Cell>
            <Cell strong>{tCpql == null ? DASH : fmtINR(Math.round(tCpql))}</Cell>
            <div style={{ textAlign: 'right' }}><Vs now={tCpql} prev={tPrevCpql} invert fmt={v => fmtINR(Math.round(v))} /></div>
          </div>
          {ranked.map((c, i) => {
            const cheap = tCpql != null && c.cpql <= tCpql
            return (
              <div key={c.label} style={{ padding: '10px 0', borderBottom: i === ranked.length - 1 ? 'none' : '1px solid #F8FAFC' }}>
                <div style={{ display: 'grid', gridTemplateColumns: cols, gap: '0 12px', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{
                      width: 18, height: 18, borderRadius: 5, flexShrink: 0, fontSize: 9.5, fontWeight: 800,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT,
                      background: cheap ? C.greenBg : C.navyBg, color: cheap ? C.green : C.navy
                    }}>{i + 1}</span>
                    <Cell a="left" strong hint={c.label}>{c.label}</Cell>
                  </div>
                  <Cell hint={fmtINRShort(c.spend)}>{fmtINR(c.spend)}</Cell>
                  <Cell>{fmtN(c.leads)}</Cell>
                  <Cell strong>{fmtN(c.totalQL)}</Cell>
                  <Cell strong col={cheap ? C.green : C.text}>{fmtINR(Math.round(c.cpql))}</Cell>
                  <div style={{ textAlign: 'right' }}><Vs now={c.cpql} prev={c.prev ? c.prev.cpql : null} invert fmt={v => fmtINR(Math.round(v))} /></div>
                </div>
                <div style={{ marginTop: 7 }}>
                  <Track w={(c.cpql / maxCpql) * 100} col={cheap ? C.green : C.navy} />
                </div>
              </div>
            )
          })}
        </>
      )}
      {rest.length > 0 && (
        <Note>
          {rest.length + ' smaller ' + (rest.length === 1 ? 'corridor is' : 'corridors are') + ' not ranked '}
          {MID + ' ' + fmtINR(below) + ' of spend sits below the cut-off'}
          {biggest ? ' ' + MID + ' the largest is ' + biggest.label + ' at ' + fmtINR(biggest.spend) + ' for ' + fmtN(biggest.totalQL) + ' QLs' : ''}
          {'. Every corridor is still in the table further down and in the CSV export.'}
        </Note>
      )}
    </Card>
  )
}

/* Shared ad row. Kept narrow on purpose - these cards sit two to a line. */
function AdRow({ r, i, last, tone, fmtINR, fmtINRShort, right }) {
  return (
    <div style={{ padding: '10px 0', borderBottom: last ? 'none' : '1px solid #F8FAFC' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span style={{
          width: 18, height: 18, borderRadius: 5, flexShrink: 0, fontSize: 9.5, fontWeight: 800, marginTop: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT,
          background: tone === 'good' ? C.greenBg : C.navyBg, color: tone === 'good' ? C.green : C.navy
        }}>{i + 1}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div title={r.label} style={{
            fontSize: 12, fontWeight: 700, color: C.text, fontFamily: FONT,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
          }}>{r.label}</div>
          <div style={{ fontSize: 10.5, color: C.muted, fontFamily: FONT, marginTop: 3, ...nums }}>
            {(r.corridor ? r.corridor + ' ' + MID + ' ' : '') + fmtN(r.totalQL) + ' QLs ' + MID + ' '}
            <span title={fmtINRShort(r.spend)}>{fmtINR(r.spend)}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>{right}</div>
      </div>
    </div>
  )
}

/* ===== 6. Ads ranked on CPQL - the cheapest band and the dearest band ===== */
export function AdRanking({ cmp, minQL, prevLabel, fmtINR, fmtINRShort }) {
  const all = (cmp && cmp.ads) || []
  const eligible = all.filter(a => isRanked(a, minQL)).sort((a, b) => a.cpql - b.cpql)
  const skipped = all.length - eligible.length
  /* Four ranked rows is the least that is worth splitting into a cheapest
     and a dearest band. Below that a dearest band would just restate the
     row above it, so the whole ranking is shown as one list. */
  const single = eligible.length < 4
  const half = Math.min(5, Math.ceil(eligible.length / 2))
  const best = single ? eligible : eligible.slice(0, half)
  const worst = single ? [] : eligible.slice(half).reverse().slice(0, 5)
  const sub = 'an ad needs at least ' + minQL + ' QLs to be ranked'
    + (skipped > 0 ? ' ' + MID + ' ' + fmtN(skipped) + ' smaller ads are not ranked' : '')
  const money = v => fmtINR(Math.round(v))
  const price = (r, tone) => (
    <>
      <div style={{ fontSize: 13, fontWeight: 800, fontFamily: FONT, color: tone === 'good' ? C.green : C.navy, ...nums }}>{money(r.cpql)}</div>
      <div style={{ marginTop: 2 }}><Vs now={r.cpql} prev={r.prev ? r.prev.cpql : null} invert fmt={money} /></div>
    </>
  )
  return (
    <div className="lq-grid2" style={{ ...grid2, marginTop: 16 }}>
      <Card>
        {sectionTitle('Ads we buy QLs cheapest from', sub)}
        {!best.length ? <Empty>{'No ad reached ' + minQL + ' qualified leads.'}</Empty> : best.map((r, i) => (
          <AdRow key={r.label} r={r} i={i} last={i === best.length - 1} tone="good" fmtINR={fmtINR} fmtINRShort={fmtINRShort} right={price(r, 'good')} />
        ))}
      </Card>
      <Card>
        {sectionTitle('Ads we buy QLs dearest from', single ? 'not enough ranked ads to split a dearest band yet' : sub)}
        {!worst.length ? <Empty>{'Fewer than four ads cleared the ' + minQL + ' QL cut-off, so there is no dearest band to show.'}</Empty> : worst.map((r, i) => (
          <AdRow key={r.label} r={r} i={i} last={i === worst.length - 1} tone="bad" fmtINR={fmtINR} fmtINRShort={fmtINRShort} right={price(r, 'bad')} />
        ))}
      </Card>
    </div>
  )
}

/* ===== 7. What is not working ===== */
export function NotPerforming({ cmp, minQL, prevLabel, fmtINR, fmtINRShort }) {
  const all = (cmp && cmp.ads) || []
  const money = v => fmtINR(Math.round(v))
  const dead = all.filter(a => (a.spend || 0) > 0 && a.label !== MANUAL && !isRanked(a, minQL))
    .sort((a, b) => (b.spend || 0) - (a.spend || 0))
  const deadSpend = dead.reduce((t, a) => t + (a.spend || 0), 0)
  const deadTop = dead.slice(0, 8)
  const maxDead = Math.max(1, ...deadTop.map(a => a.spend || 0))
  const risers = all.filter(a => isRanked(a, minQL) && a.prev && a.prev.cpql > 0)
    .map(a => ({ ...a, d: ((a.cpql - a.prev.cpql) / a.prev.cpql) * 100 }))
    .filter(a => a.d >= 0.5)
    .sort((a, b) => b.d - a.d)
    .slice(0, 8)
  return (
    <div className="lq-grid2" style={{ ...grid2, marginTop: 16 }}>
      <Card>
        {sectionTitle(
          'Spend that has not produced enough QLs',
          fmtN(dead.length) + ' ads carry ' + fmtINR(deadSpend) + ' and have not cleared ' + minQL + ' QLs ' + MID + ' largest first'
        )}
        {!deadTop.length ? <Empty>Every ad with spend cleared the cut-off.</Empty> : deadTop.map((r, i) => (
          <div key={r.label} style={{ padding: '10px 0', borderBottom: i === deadTop.length - 1 ? 'none' : '1px solid #F8FAFC' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', justifyContent: 'space-between' }}>
              <div style={{ minWidth: 0 }}>
                <div title={r.label} style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: FONT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</div>
                <div style={{ fontSize: 10.5, color: C.muted, fontFamily: FONT, marginTop: 3, ...nums }}>
                  {(r.corridor ? r.corridor + ' ' + MID + ' ' : '') + fmtN(r.totalQL) + ' QLs from ' + fmtN(r.leads) + ' leads'}
                </div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.navy, fontFamily: FONT, flexShrink: 0, ...nums }} title={fmtINRShort(r.spend)}>{fmtINR(r.spend)}</div>
            </div>
            <div style={{ marginTop: 7 }}><Track w={(r.spend / maxDead) * 100} col={C.navy} /></div>
          </div>
        ))}
        <Note>
          Below the cut-off a CPQL is not a number worth quoting, so these ads are read on the money they have taken instead.
          Affiliate spend is booked as a single manual entry at source level, not against an ad, so it is left out of this list.
        </Note>
      </Card>
      <Card>
        {sectionTitle('Ads whose cost per QL rose the most', 'ranked ads only ' + MID + ' against ' + (prevLabel || 'the previous period'))}
        {!risers.length ? <Empty>{'No ranked ad got dearer against ' + (prevLabel || 'the previous period') + '.'}</Empty> : risers.map((r, i) => (
          <AdRow key={r.label} r={r} i={i} last={i === risers.length - 1} tone="bad" fmtINR={fmtINR} fmtINRShort={fmtINRShort} right={
            <>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.navy, fontFamily: FONT, ...nums }}>{money(r.cpql)}</div>
              <div style={{ marginTop: 2 }}><Vs now={r.cpql} prev={r.prev.cpql} invert fmt={money} /></div>
            </>
          } />
        ))}
        <Note>
          Movement is measured on the same length of period immediately before this one, on the same Source and Corridor filters.
        </Note>
      </Card>
    </div>
  )
}
