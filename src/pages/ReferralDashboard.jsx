import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, CartesianGrid,
} from 'recharts';
import Sidebar from '../components/Sidebar';
import { fetchCSV } from '../lib/sheetCache';
import {
  C, FONT, BRAND_RAMP, brandColor, PAGE_SIZE,
  fmtN, pct, Card, PremKPI, KPI_ICONS, RankedBars,
} from '../ui/dashboardKit';

const SHEET_CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRVF7R3Me4QPVaRS_n_OufcMrrgYvCt3Rs7yJUG0u4gEMd0cVL9IyP2aV6J8HDjOZrvWzcemgHwZaHs/pub?gid=1233447443&single=true&output=csv';

function parseCSV(csv) {
  const rows = csv.trim().split('\n').map(r => {
    const cols = []; let buf = '', inQ = false;
    for (const ch of r) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cols.push(buf.trim()); buf = ''; }
      else buf += ch;
    }
    cols.push(buf.trim());
    return cols.map(c => c.replace(/\r/g, ''));
  });
  const h = rows[0];
  return rows.slice(1).filter(r => r.length > 1).map(r => Object.fromEntries(h.map((k, i) => [k, (r[i] || '')])));
}
const has = v => v && v !== 'FALSE' && v !== '' && v !== '#N/A';

// Sort helper for "Mon-YY" month labels
const MON = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
function monthKey(m) {
  const [mm, yy] = (m || '').split('-');
  if (yy === undefined || MON[mm] === undefined) return -1;
  return parseInt(yy, 10) * 12 + MON[mm];
}

const BrandTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{ background: '#fff', border: '0.5px solid #E5E7EB', borderRadius: 10, padding: '9px 13px', fontFamily: FONT, boxShadow: '0 8px 24px rgba(15,23,42,0.12)' }}>
      <div style={{ fontSize: 11.5, fontWeight: 800, color: '#0F1B33', marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ fontSize: 11.5, color: '#475569', display: 'flex', justifyContent: 'space-between', gap: 18 }}>
          <span style={{ color: p.color || p.fill }}>{p.name}</span>
          <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtN(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

export default function ReferralDashboard() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState('All');
  const [page, setPage] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const csv = await fetchCSV(SHEET_CSV);
        if (alive) setRows(parseCSV(csv));
      } catch (e) { console.error('Referral fetch', e); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(
    () => source === 'All' ? rows : rows.filter(r => r.source === source),
    [rows, source]
  );

  const kpis = useMemo(() => {
    const total = filtered.length;
    const emp = filtered.filter(r => r.source === 'Employee').length;
    const stu = filtered.filter(r => r.source === 'Student').length;
    const enrol = filtered.filter(r => has(r.EnrolmentDate)).length;
    const paid = filtered.filter(r => has(r.PaymentDone)).length;
    return { total, emp, stu, enrol, paid };
  }, [filtered]);

  const funnel = useMemo(() => {
    const stage = (k) => filtered.filter(r => has(r[k])).length;
    return [
      { name: 'App Created', value: stage('AppCreated') },
      { name: 'Submitted', value: stage('FirstSTU') },
      { name: 'Offer', value: stage('FirstOffer') },
      { name: 'Deposit', value: stage('FirstDeposit') },
      { name: 'Payment Done', value: stage('PaymentDone') },
      { name: 'Registered', value: stage('FirstRAU') },
    ];
  }, [filtered]);

  const sourceSplit = useMemo(() => {
    const m = {};
    filtered.forEach(r => { const s = r.source || 'Unknown'; m[s] = (m[s] || 0) + 1; });
    return Object.entries(m).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  const statusRows = useMemo(() => {
    const m = {};
    filtered.forEach(r => { const s = r.StudentStatus || '(none)'; m[s] = (m[s] || 0) + 1; });
    return Object.entries(m)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [filtered]);

  const trend = useMemo(() => {
    const m = {};
    filtered.forEach(r => { const k = r['Created Month']; if (!k) return; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => monthKey(a.name) - monthKey(b.name));
  }, [filtered]);

  const tableRows = filtered;
  const totalPages = Math.max(1, Math.ceil(tableRows.length / PAGE_SIZE));
  const pageRows = tableRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  useEffect(() => { setPage(0); }, [source]);

  const activePill = (on) => ({
    padding: '6px 14px', borderRadius: 9, fontSize: 12, fontWeight: 700, fontFamily: FONT, cursor: 'pointer',
    border: on ? 'none' : '1px solid #E6EAF1',
    background: on ? 'linear-gradient(135deg, #1F3C84, #1C9FD4)' : '#fff',
    color: on ? '#fff' : '#64748B',
    boxShadow: on ? '0 4px 10px -3px rgba(31,60,132,0.5)' : 'none',
  });

  const thS = { textAlign: 'left', padding: '10px 14px', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px', color: '#64748B', borderBottom: '1px solid #E8ECF3', whiteSpace: 'nowrap' };
  const tdS = { padding: '10px 14px', fontSize: 12, color: '#334155', borderBottom: '1px solid #F1F4F9', whiteSpace: 'nowrap' };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      <Sidebar />
      <div style={{ flex: 1, minWidth: 0, fontFamily: FONT }}>
        <div style={{ padding: '18px 22px 8px' }}>
          <p style={{ margin: 0, fontSize: 12, color: '#94A3B8', fontWeight: 600 }}>Dashboards / Referral</p>
          <h1 style={{ margin: '2px 0 0', fontSize: 22, fontWeight: 800, letterSpacing: '-0.4px', color: '#0F1B33' }}>Referral</h1>
        </div>

        <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: '#94A3B8', marginRight: 4 }}>SOURCE</span>
            {['All', 'Employee', 'Student'].map(s => (
              <button key={s} style={activePill(source === s)} onClick={() => setSource(s)}>{s}</button>
            ))}
            <span style={{ marginLeft: 'auto', fontSize: 11.5, color: '#94A3B8' }}>
              {loading ? 'Loading…' : `${fmtN(filtered.length)} referrals`}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 14 }}>
            <PremKPI label="Total Referrals" value={fmtN(kpis.total)} sub="all sources" accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.total} />
            <PremKPI label="Employee" value={fmtN(kpis.emp)} sub={pct(kpis.emp, kpis.total) + ' of total'} accent={C.blue} accentBg={C.blueBg} icon={KPI_ICONS.agent} />
            <PremKPI label="Student" value={fmtN(kpis.stu)} sub={pct(kpis.stu, kpis.total) + ' of total'} accent={C.cyan} accentBg={C.cyanBg} icon={KPI_ICONS.bot} />
            <PremKPI label="Enrolments" value={fmtN(kpis.enrol)} sub={pct(kpis.enrol, kpis.total) + ' conv.'} accent={C.green} accentBg={C.greenBg} icon={KPI_ICONS.ai} />
            <PremKPI label="Payment Done" value={fmtN(kpis.paid)} sub={pct(kpis.paid, kpis.total) + ' of total'} accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.globe} />
          </div>

          <Card title="Referral funnel" sub="how referrals progress through stages">
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={funnel} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F6" vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94A3B8', fontFamily: FONT }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94A3B8', fontFamily: FONT }} />
                  <Tooltip content={<BrandTooltip />} cursor={{ fill: 'rgba(31,60,132,0.05)' }} />
                  <Bar dataKey="value" name="Referrals" radius={[6, 6, 0, 0]}>
                    {funnel.map((e, i) => <Cell key={i} fill={brandColor(i)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <Card title="Top student statuses" sub="largest groups">
              <RankedBars data={statusRows} labelKey="name" colorFn={brandColor} />
            </Card>
            <Card title="Source split">
              <div style={{ width: '100%', height: 240, display: 'flex', alignItems: 'center' }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={sourceSplit} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={2}>
                      {sourceSplit.map((e, i) => <Cell key={i} fill={brandColor(i)} />)}
                    </Pie>
                    <Tooltip content={<BrandTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ paddingRight: 12 }}>
                  {sourceSplit.map((s, i) => (
                    <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: brandColor(i) }} />
                      <span style={{ fontSize: 12, color: '#475569' }}>{s.name}</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#0F1B33', fontVariantNumeric: 'tabular-nums' }}>{fmtN(s.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          <Card title="Referrals by created month" sub="volume over time">
            <div style={{ width: '100%', height: 240 }}>
              <ResponsiveContainer>
                <AreaChart data={trend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="refArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1C9FD4" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#1C9FD4" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F6" vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10.5, fill: '#94A3B8', fontFamily: FONT }} interval="preserveStartEnd" />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94A3B8', fontFamily: FONT }} />
                  <Tooltip content={<BrandTooltip />} cursor={{ stroke: '#1C9FD4', strokeWidth: 1 }} />
                  <Area type="monotone" dataKey="value" name="Referrals" stroke="#1C9FD4" strokeWidth={2} fill="url(#refArea)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Referral records" sub={`${fmtN(tableRows.length)} rows`} noPad>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC' }}>
                    {['Source', 'Created', 'Referred By', 'Status', 'Intake', 'Payment', 'Enrolment'].map(h => <th key={h} style={thS}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r, i) => (
                    <tr key={i} style={{ background: i % 2 ? '#FBFCFE' : '#fff' }}>
                      <td style={tdS}>{r.source}</td>
                      <td style={tdS}>{r.created_at}</td>
                      <td style={tdS}>{r['Referrred by']}</td>
                      <td style={tdS}>{r.StudentStatus || '—'}</td>
                      <td style={tdS}>{r.Intake}</td>
                      <td style={tdS}>{has(r.PaymentDone) ? r.PaymentDone : '—'}</td>
                      <td style={tdS}>{has(r.EnrolmentDate) ? r.EnrolmentDate : '—'}</td>
                    </tr>
                  ))}
                  {!pageRows.length && (
                    <tr><td style={{ ...tdS, textAlign: 'center', color: '#94A3B8' }} colSpan={7}>{loading ? 'Loading…' : 'No records'}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' }}>
              <span style={{ fontSize: 11.5, color: '#94A3B8' }}>
                {tableRows.length ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, tableRows.length)} of ${fmtN(tableRows.length)}` : '0'}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                  style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #E6EAF1', background: '#fff', fontSize: 12, fontWeight: 600, color: '#475569', cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? 0.5 : 1 }}>Prev</button>
                <span style={{ padding: '6px 12px', borderRadius: 8, background: 'linear-gradient(135deg, #1F3C84, #1C9FD4)', color: '#fff', fontSize: 12, fontWeight: 700, boxShadow: '0 4px 10px -3px rgba(31,60,132,0.5)' }}>{page + 1}</span>
                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                  style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #E6EAF1', background: '#fff', fontSize: 12, fontWeight: 600, color: '#475569', cursor: page >= totalPages - 1 ? 'default' : 'pointer', opacity: page >= totalPages - 1 ? 0.5 : 1 }}>Next</button>
              </div>
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
}
