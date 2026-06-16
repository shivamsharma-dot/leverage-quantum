import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, CartesianGrid,
  LineChart, Line, Legend, LabelList,
} from 'recharts';
import Sidebar from '../components/Sidebar';
import { fetchCSV } from '../lib/sheetCache';
import {
  C, FONT, BRAND_RAMP, brandColor, PAGE_SIZE,
  fmtN, pct, Card, PremKPI, KPI_ICONS, RankedBars,
} from '../ui/dashboardKit';

const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRVF7R3Me4QPVaRS_n_OufcMrrgYvCt3Rs7yJUG0u4gEMd0cVL9IyP2aV6J8HDjOZrvWzcemgHwZaHs/pub?gid=1233447443&single=true&output=csv';

function parseCSV(t) {
  const rows = []; let i = 0, field = '', row = [], inq = false;
  while (i < t.length) {
    const c = t[i];
    if (inq) {
      if (c === '\"') { if (t[i + 1] === '\"') { field += '\"'; i += 2; continue; } inq = false; i++; continue; }
      field += c; i++; continue;
    } else {
      if (c === '\"') { inq = true; i++; continue; }
      if (c === ',') { row.push(field); field = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
      field += c; i++; continue;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const h = rows[0];
  return rows.slice(1).filter(r => r.length > 1).map(r => Object.fromEntries(h.map((k, idx) => [k, (r[idx] || '')])));
}

const MON = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function parseD(s) {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return null;
  return new Date(+m[3], MON[m[2]], +m[1]);
}
const ne = v => v != null && String(v).trim() !== '';
const ym = d => d.getFullYear() * 12 + d.getMonth();
const mLabel = k => MN[((k % 12) + 12) % 12] + "'" + String(Math.floor(k / 12)).slice(2);
function iKey(s) {
  const m = String(s).match(/^([A-Za-z]{3})'?(\d{4})$/);
  if (!m) return 9999999;
  return +m[2] * 12 + MON[m[1]];
}
const iLabel = s => s.replace(/'?(\d{2})(\d{2})$/, "-$2");

function BrandTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{ background:'#fff', border:'0.5px solid #E5E7EB', borderRadius:10, padding:'9px 13px', fontFamily:FONT, boxShadow:'0 8px 24px rgba(15,23,42,0.12)' }}>
      <div style={{ fontSize:11.5, fontWeight:800, color:'#0F1B33', marginBottom:4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ fontSize:11.5, color:'#475569', display:'flex', justifyContent:'space-between', gap:18 }}>
          <span style={{ color:p.color || p.fill }}>{p.name}</span>
          <span style={{ fontWeight:700, fontVariantNumeric:'tabular-nums' }}>{p.dataKey && /[%]|pct|rate|ratio/i.test(p.dataKey) ? p.value + '%' : fmtN(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function ReferralDashboard() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState('All');
  const [page, setPage] = useState(0);

  useEffect(() => {
    let alive = true;
    fetchCSV(CSV_URL).then(txt => { if (alive) { setRows(parseCSV(txt)); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(
    () => source === 'All' ? rows : rows.filter(r => r.source === source),
    [rows, source]
  );

  const M = useMemo(() => {
    const all = filtered;
    const n = all.length;
    const cnt = c => all.filter(r => ne(r[c])).length;
    const emp = all.filter(r => r.source === 'Employee').length;
    const stu = all.filter(r => r.source === 'Student').length;
    const pd = cnt('PaymentDone'), ec = cnt('EnrolmentDate');

    // 1) KPIs
    const kpis = { total:n, emp, stu, pd, ec };

    // 2) Referral funnel (overall stages)
    const funnel = [
      { stage:'Total Referral', count:n },
      { stage:'PD', count:pd },
      { stage:'EC', count:ec },
      { stage:'STU', count:cnt('FirstSTU') },
      { stage:'Offer Received', count:cnt('FirstOffer') },
      { stage:'Deposit Made', count:cnt('FirstDeposit') },
    ];

    // 3) Source-wise lead gen rate (by created_at: Yesterday / Last 7 days / This Month)
    let maxd = null;
    all.forEach(r => { const d = parseD(r.created_at); if (d && (!maxd || d > maxd)) maxd = d; });
    const today = maxd || new Date();
    const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const yest = new Date(t0); yest.setDate(yest.getDate() - 1);
    const last7 = new Date(t0); last7.setDate(last7.getDate() - 7);
    const sMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lg = { Yesterday:{Student:0,EMP:0}, 'Last 7 days':{Student:0,EMP:0}, 'This Month':{Student:0,EMP:0} };
    all.forEach(r => {
      const d = parseD(r.created_at); if (!d) return;
      const k = r.source === 'Student' ? 'Student' : 'EMP';
      if (d.getTime() === yest.getTime()) lg.Yesterday[k]++;
      if (d > last7 && d <= t0) lg['Last 7 days'][k]++;
      if (d >= sMonth && d <= today) lg['This Month'][k]++;
    });
    const leadgen = Object.keys(lg).map(p => ({ period:p, Student:lg[p].Student, EMP:lg[p].EMP, Total:lg[p].Student + lg[p].EMP }));

    // 4) Monthly App Cohort Performance (by AppCreated month) - Lead->STU, STU->Offer, Offer->Deposit %
    const coh = {};
    all.forEach(r => {
      const a = parseD(r.AppCreated); if (!a) return;
      const k = ym(a);
      if (!coh[k]) coh[k] = { app:0, stu:0, offer:0, dep:0, label:mLabel(k) };
      coh[k].app++;
      if (ne(r.FirstSTU)) coh[k].stu++;
      if (ne(r.FirstOffer)) coh[k].offer++;
      if (ne(r.FirstDeposit)) coh[k].dep++;
    });
    const cohort = Object.keys(coh).map(Number).sort((x, y) => x - y).slice(-14).map(k => {
      const c = coh[k];
      return {
        month:c.label,
        leadStu: c.app ? Math.round(c.stu / c.app * 100) : 0,
        stuOffer: c.stu ? Math.round(c.offer / c.stu * 100) : 0,
        offerDep: c.offer ? Math.round(c.dep / c.offer * 100) : 0,
      };
    });

    // 5) Current vs Last month (by created_at) - Leads, EC, STU, Deposit
    const curK = maxd ? ym(maxd) : ym(new Date());
    const ms = k => {
      let leads = 0, e = 0, s = 0, dep = 0;
      all.forEach(r => { const d = parseD(r.created_at); if (d && ym(d) === k) { leads++; if (ne(r.EnrolmentDate)) e++; if (ne(r.FirstSTU)) s++; if (ne(r.FirstDeposit)) dep++; } });
      return { leads, ec:e, stu:s, dep };
    };
    const cur = ms(curK), prev = ms(curK - 1);
    const cvl = [
      { metric:'Leads', last:prev.leads, current:cur.leads },
      { metric:'EC', last:prev.ec, current:cur.ec },
      { metric:'STU', last:prev.stu, current:cur.stu },
      { metric:'Deposit', last:prev.dep, current:cur.dep },
    ];
    const cvlLabels = { last:mLabel(curK - 1), current:mLabel(curK) };

    // 6) Intake-wise funnel + conversion ratios
    const intk = {};
    all.forEach(r => {
      const iv = (r.Intake || '').trim(); if (!iv) return;
      if (!intk[iv]) intk[iv] = { app:0, offer:0, dep:0 };
      if (ne(r.AppCreated)) intk[iv].app++;
      if (ne(r.FirstOffer)) intk[iv].offer++;
      if (ne(r.FirstDeposit)) intk[iv].dep++;
    });
    const intakeKeys = Object.keys(intk).sort((a, b) => iKey(a) - iKey(b)).filter(k => intk[k].app >= 50).slice(-6);
    const intakeFunnel = intakeKeys.map(k => ({ intake:iLabel(k), firstApp:intk[k].app, firstOffer:intk[k].offer, firstDep:intk[k].dep }));
    const intakeConv = intakeKeys.map(k => {
      const v = intk[k];
      return {
        intake:iLabel(k),
        appOffer: v.app ? Math.round(v.offer / v.app * 1000) / 10 : 0,
        offerDep: v.offer ? Math.round(v.dep / v.offer * 1000) / 10 : 0,
        appDep: v.app ? Math.round(v.dep / v.app * 1000) / 10 : 0,
      };
    });

    // 7) Source split + status + month trend
    const split = [
      { name:'Employee', value:emp },
      { name:'Student', value:stu },
    ].filter(d => d.value > 0);
    const stMap = {};
    all.forEach(r => { const s = (r.StudentStatus || '').trim() || '(none)'; stMap[s] = (stMap[s] || 0) + 1; });
    const statusRows = Object.keys(stMap).map(s => ({ status:s, count:stMap[s] })).sort((a, b) => b.count - a.count).slice(0, 8);
    const trMap = {};
    all.forEach(r => { const d = parseD(r.created_at); if (!d) return; const k = ym(d); trMap[k] = (trMap[k] || 0) + 1; });
    const trend = Object.keys(trMap).map(Number).sort((a, b) => a - b).slice(-14).map(k => ({ month:mLabel(k), referrals:trMap[k] }));

    return { kpis, funnel, leadgen, cohort, cvl, cvlLabels, intakeFunnel, intakeConv, split, statusRows, trend };
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  useEffect(() => { setPage(0); }, [source]);

  const PILLS = ['All', 'Employee', 'Student'];
  const pillStyle = active => ({
    padding:'5px 14px', borderRadius:999, fontSize:12, fontWeight:700, cursor:'pointer',
    fontFamily:FONT, border:'1px solid ' + (active ? C.navy : '#E2E8F0'),
    background: active ? C.navy : '#fff', color: active ? '#fff' : '#475569', transition:'all .15s',
  });
  const sectionTitle = (t, s) => (
    <div style={{ marginBottom:14 }}>
      <div style={{ fontSize:14.5, fontWeight:800, color:'#0F1B33' }}>{t}</div>
      {s && <div style={{ fontSize:11.5, color:'#94A3AF', marginTop:2 }}>{s}</div>}
    </div>
  );
  const axis = { fontSize:11, fill:'#64748B', fontFamily:FONT };
  const grid2 = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:18, marginTop:18 };

  if (loading) {
    return (
      <div style={{ display:'flex', minHeight:'100vh', fontFamily:FONT, background:'var(--bg, #F6F8FC)' }}>
        <Sidebar />
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#94A3AF', fontSize:14 }}>Loading referral data…</div>
      </div>
    );
  }

  return (
    <div style={{ display:'flex', minHeight:'100vh', fontFamily:FONT, background:'var(--bg, #F6F8FC)' }}>
      <Sidebar />
      <div style={{ flex:1, padding:'26px 30px', overflowX:'hidden' }}>
        <div style={{ fontSize:12, color:'#94A3AF', marginBottom:4 }}>Dashboards / Referral</div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
          <h1 style={{ fontSize:26, fontWeight:800, color:'#0F1B33', margin:0 }}>Referral</h1>
          <div style={{ fontSize:12.5, color:'#64748B', fontWeight:600 }}>{fmtN(filtered.length)} referrals</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:14, marginBottom:18 }}>
          <span style={{ fontSize:11, fontWeight:700, color:'#94A3AF', letterSpacing:0.5 }}>SOURCE</span>
          {PILLS.map(p => <div key={p} style={pillStyle(source === p)} onClick={() => setSource(p)}>{p}</div>)}
        </div>

        {/* KPI ROW */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:14 }}>
          <PremKPI label='TOTAL REFERRALS' value={fmtN(M.kpis.total)} sub='all sources' accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.users} />
          <PremKPI label='EMPLOYEE' value={fmtN(M.kpis.emp)} sub={pct(M.kpis.emp, M.kpis.total) + ' of total'} accent={C.blue} accentBg={C.blueBg} icon={KPI_ICONS.users} />
          <PremKPI label='STUDENT' value={fmtN(M.kpis.stu)} sub={pct(M.kpis.stu, M.kpis.total) + ' of total'} accent={C.cyan} accentBg={C.cyanBg} icon={KPI_ICONS.target} />
          <PremKPI label='ENROLMENTS' value={fmtN(M.kpis.ec)} sub={pct(M.kpis.ec, M.kpis.total) + ' conv.'} accent={C.green} accentBg={C.greenBg} icon={KPI_ICONS.check} />
          <PremKPI label='PAYMENT DONE' value={fmtN(M.kpis.pd)} sub={pct(M.kpis.pd, M.kpis.total) + ' of total'} accent={C.amber} accentBg={C.amberBg} icon={KPI_ICONS.globe} />
        </div>

        {/* REFERRAL FUNNEL */}
        <Card style={{ marginTop:18 }}>
          {sectionTitle('Referral funnel', 'how referrals progress through stages')}
          <ResponsiveContainer width='100%' height={300}>
            <BarChart data={M.funnel} layout='vertical' margin={{ left:30, right:40, top:4, bottom:4 }}>
              <CartesianGrid horizontal={false} stroke='#EEF2F7' />
              <XAxis type='number' tick={axis} axisLine={false} tickLine={false} tickFormatter={fmtN} />
              <YAxis type='category' dataKey='stage' tick={axis} axisLine={false} tickLine={false} width={110} />
              <Tooltip content={<BrandTooltip />} cursor={{ fill:'rgba(31,60,132,0.04)' }} />
              <Bar dataKey='count' name='Referrals' radius={[0, 6, 6, 0]} barSize={22}>
                {M.funnel.map((e, i) => <Cell key={i} fill={brandColor(i)} />)}
                <LabelList dataKey='count' position='right' formatter={fmtN} style={{ fontSize:11, fontWeight:700, fill:'#475569' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* ROW: leadgen + current vs last */}
        <div style={grid2}>
          <Card>
            {sectionTitle('Source-wise lead gen rate', 'leads created · yesterday / last 7 days / this month')}
            <ResponsiveContainer width='100%' height={280}>
              <BarChart data={M.leadgen} margin={{ left:0, right:10, top:10, bottom:4 }} barGap={4} barCategoryGap='22%'>
                <CartesianGrid vertical={false} stroke='#EEF2F7' />
                <XAxis dataKey='period' tick={axis} axisLine={false} tickLine={false} />
                <YAxis tick={axis} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<BrandTooltip />} cursor={{ fill:'rgba(31,60,132,0.04)' }} />
                <Legend wrapperStyle={{ fontSize:11.5, fontFamily:FONT }} iconType='circle' />
                <Bar dataKey='Student' name='Student' fill={C.cyan} radius={[4,4,0,0]} barSize={18}><LabelList dataKey='Student' position='top' style={{ fontSize:10, fontWeight:700, fill:'#64748B' }} /></Bar>
                <Bar dataKey='EMP' name='EMP' fill={C.amber} radius={[4,4,0,0]} barSize={18}><LabelList dataKey='EMP' position='top' style={{ fontSize:10, fontWeight:700, fill:'#64748B' }} /></Bar>
                <Bar dataKey='Total' name='Total' fill={C.navy} radius={[4,4,0,0]} barSize={18}><LabelList dataKey='Total' position='top' style={{ fontSize:10, fontWeight:700, fill:'#64748B' }} /></Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card>
            {sectionTitle('Current vs last month', M.cvlLabels.last + ' vs ' + M.cvlLabels.current)}
            <ResponsiveContainer width='100%' height={280}>
              <BarChart data={M.cvl} layout='vertical' margin={{ left:20, right:30, top:10, bottom:4 }} barGap={3}>
                <CartesianGrid horizontal={false} stroke='#EEF2F7' />
                <XAxis type='number' tick={axis} axisLine={false} tickLine={false} />
                <YAxis type='category' dataKey='metric' tick={axis} axisLine={false} tickLine={false} width={60} />
                <Tooltip content={<BrandTooltip />} cursor={{ fill:'rgba(31,60,132,0.04)' }} />
                <Legend wrapperStyle={{ fontSize:11.5, fontFamily:FONT }} iconType='circle' />
                <Bar dataKey='last' name={M.cvlLabels.last} fill={C.blue} radius={[0,4,4,0]} barSize={13}><LabelList dataKey='last' position='right' formatter={fmtN} style={{ fontSize:10, fontWeight:700, fill:'#64748B' }} /></Bar>
                <Bar dataKey='current' name={M.cvlLabels.current} fill={C.navy} radius={[0,4,4,0]} barSize={13}><LabelList dataKey='current' position='right' formatter={fmtN} style={{ fontSize:10, fontWeight:700, fill:'#64748B' }} /></Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* MONTHLY APP COHORT PERFORMANCE */}
        <Card style={{ marginTop:18 }}>
          {sectionTitle('Monthly app cohort performance', 'conversion % by app-created month cohort')}
          <ResponsiveContainer width='100%' height={300}>
            <LineChart data={M.cohort} margin={{ left:0, right:20, top:10, bottom:4 }}>
              <CartesianGrid vertical={false} stroke='#EEF2F7' />
              <XAxis dataKey='month' tick={axis} axisLine={false} tickLine={false} />
              <YAxis tick={axis} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={v => v + '%'} />
              <Tooltip content={<BrandTooltip />} />
              <Legend wrapperStyle={{ fontSize:11.5, fontFamily:FONT }} iconType='circle' />
              <Line type='monotone' dataKey='leadStu' name='Lead-STU %' stroke={C.blue} strokeWidth={2.5} dot={{ r:3 }} />
              <Line type='monotone' dataKey='stuOffer' name='STU-Offer %' stroke={C.amber} strokeWidth={2.5} dot={{ r:3 }} />
              <Line type='monotone' dataKey='offerDep' name='Offer-Deposit %' stroke={C.green} strokeWidth={2.5} dot={{ r:3 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* ROW: intake funnel + intake conversion */}
        <div style={grid2}>
          <Card>
            {sectionTitle('Intake-wise funnel', 'first app / offer received / deposit made')}
            <ResponsiveContainer width='100%' height={300}>
              <BarChart data={M.intakeFunnel} margin={{ left:0, right:10, top:10, bottom:4 }} barGap={3} barCategoryGap='20%'>
                <CartesianGrid vertical={false} stroke='#EEF2F7' />
                <XAxis dataKey='intake' tick={axis} axisLine={false} tickLine={false} />
                <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={fmtN} />
                <Tooltip content={<BrandTooltip />} cursor={{ fill:'rgba(31,60,132,0.04)' }} />
                <Legend wrapperStyle={{ fontSize:11.5, fontFamily:FONT }} iconType='circle' />
                <Bar dataKey='firstApp' name='First App' fill={C.navy} radius={[4,4,0,0]} barSize={16} />
                <Bar dataKey='firstOffer' name='First Offer received' fill={C.blue} radius={[4,4,0,0]} barSize={16} />
                <Bar dataKey='firstDep' name='First Deposit made' fill={C.amber} radius={[4,4,0,0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card>
            {sectionTitle('Intake-wise funnel conversion ratio', 'app-offer / offer-deposit / app-deposit %')}
            <ResponsiveContainer width='100%' height={300}>
              <LineChart data={M.intakeConv} margin={{ left:0, right:20, top:10, bottom:4 }}>
                <CartesianGrid vertical={false} stroke='#EEF2F7' />
                <XAxis dataKey='intake' tick={axis} axisLine={false} tickLine={false} />
                <YAxis tick={axis} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={v => v + '%'} />
                <Tooltip content={<BrandTooltip />} />
                <Legend wrapperStyle={{ fontSize:11.5, fontFamily:FONT }} iconType='circle' />
                <Line type='monotone' dataKey='appOffer' name='App-Offer %' stroke={C.navy} strokeWidth={2.5} dot={{ r:3 }} />
                <Line type='monotone' dataKey='offerDep' name='Offer-Deposit %' stroke={C.cyan} strokeWidth={2.5} dot={{ r:3 }} />
                <Line type='monotone' dataKey='appDep' name='App-Deposit %' stroke={C.amber} strokeWidth={2.5} dot={{ r:3 }} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* ROW: source split donut + status bars */}
        <div style={grid2}>
          <Card>
            {sectionTitle('Source split', 'employee vs student referrals')}
            <ResponsiveContainer width='100%' height={280}>
              <PieChart>
                <Pie data={M.split} dataKey='value' nameKey='name' innerRadius={62} outerRadius={100} paddingAngle={2}>
                  {M.split.map((e, i) => <Cell key={i} fill={e.name === 'Employee' ? C.blue : C.cyan} />)}
                </Pie>
                <Tooltip content={<BrandTooltip />} />
                <Legend wrapperStyle={{ fontSize:11.5, fontFamily:FONT }} iconType='circle' />
              </PieChart>
            </ResponsiveContainer>
          </Card>
          <Card>
            {sectionTitle('Top student statuses', 'distribution across the funnel')}
            <RankedBars data={M.statusRows} labelKey='status' max={M.statusRows[0]?.count || 0} total={M.statusRows.reduce((a, b) => a + b.count, 0)} colorFn={brandColor} showRank />
          </Card>
        </div>

        {/* MONTH TREND */}
        <Card style={{ marginTop:18 }}>
          {sectionTitle('Referrals by month', 'volume of new referrals created over time')}
          <ResponsiveContainer width='100%' height={260}>
            <AreaChart data={M.trend} margin={{ left:0, right:20, top:10, bottom:4 }}>
              <defs><linearGradient id='refArea' x1='0' y1='0' x2='0' y2='1'><stop offset='5%' stopColor={C.blue} stopOpacity={0.35} /><stop offset='95%' stopColor={C.blue} stopOpacity={0.02} /></linearGradient></defs>
              <CartesianGrid vertical={false} stroke='#EEF2F7' />
              <XAxis dataKey='month' tick={axis} axisLine={false} tickLine={false} />
              <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={fmtN} />
              <Tooltip content={<BrandTooltip />} />
              <Area type='monotone' dataKey='referrals' name='Referrals' stroke={C.blue} strokeWidth={2.5} fill='url(#refArea)' />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        {/* RECORDS TABLE */}
        <Card style={{ marginTop:18 }}>
          {sectionTitle('Referral records', fmtN(filtered.length) + ' rows')}
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:FONT }}>
              <thead>
                <tr>
                  {['Source', 'Created', 'Referred By', 'Status', 'Intake', 'Payment', 'Enrolment'].map(h => (
                    <th key={h} style={{ textAlign:'left', fontSize:10.5, fontWeight:700, color:'#94A3AF', letterSpacing:0.4, padding:'10px 12px', borderBottom:'1px solid #EEF2F7', textTransform:'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r, i) => {
                  const tdS = { fontSize:12, color:'#475569', padding:'10px 12px', borderBottom:'1px solid #F4F6FB', whiteSpace:'nowrap' };
                  return (
                    <tr key={i}>
                      <td style={tdS}>{r.source || '-'}</td>
                      <td style={tdS}>{r.created_at || '-'}</td>
                      <td style={tdS}>{r['Referrred by'] || '-'}</td>
                      <td style={tdS}>{r.StudentStatus || '-'}</td>
                      <td style={tdS}>{r.Intake || '-'}</td>
                      <td style={tdS}>{r.PaymentDone || '-'}</td>
                      <td style={tdS}>{r.EnrolmentDate || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:14, fontSize:12, color:'#64748B' }}>
            <span>{fmtN(page * PAGE_SIZE + 1)}–{fmtN(Math.min((page + 1) * PAGE_SIZE, filtered.length))} of {fmtN(filtered.length)}</span>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                style={{ padding:'6px 14px', borderRadius:8, border:'1px solid #E2E8F0', background:'#fff', color: page === 0 ? '#CBD5E1' : '#475569', fontWeight:600, cursor: page === 0 ? 'default' : 'pointer', fontFamily:FONT }}>Prev</button>
              <span style={{ padding:'6px 14px', borderRadius:8, background:'linear-gradient(135deg,' + C.navy + ',' + C.blue + ')', color:'#fff', fontWeight:700 }}>{page + 1}</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                style={{ padding:'6px 14px', borderRadius:8, border:'1px solid #E2E8F0', background:'#fff', color: page >= totalPages - 1 ? '#CBD5E1' : '#475569', fontWeight:600, cursor: page >= totalPages - 1 ? 'default' : 'pointer', fontFamily:FONT }}>Next</button>
            </div>
          </div>
        </Card>

      </div>
    </div>
  );
}
