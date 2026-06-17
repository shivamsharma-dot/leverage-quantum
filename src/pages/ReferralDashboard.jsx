import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getSession, setSession } from '../lib/sessionLoad';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, CartesianGrid,
  LineChart, Line, Legend, LabelList,
} from 'recharts';
import Sidebar from '../components/Sidebar';
import { DashboardSkeleton, InlineLoader } from '../components/SkeletonLoader'
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
  const [grpBy, setGrpBy] = useState('status');

  const loadData = useCallback(async (bust = false) => {
    setLoading(true);
    try {
      const cached = getSession('referral');
      let txt;
      if (!bust && cached) {
        txt = cached.data;
      } else {
        const u = bust ? CSV_URL + (CSV_URL.includes('?') ? '&' : '?') + '_=' + Date.now() : CSV_URL;
        const res = await fetch(u);
        txt = await res.text();
        setSession('referral', txt);
      }
      setRows(parseCSV(txt));
    } catch (e) { console.error('Referral fetch', e); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { loadData(); }, [loadData]);

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
    const firstStu = cnt('FirstSTU'), offers = cnt('FirstOffer'), deposits = cnt('FirstDeposit');

    const kpis = { total:n, emp, stu, firstStu, offers };

    const funnel = [
      { stage:'Total Referral', count:n },
      { stage:'PD', count:pd },
      { stage:'EC', count:ec },
      { stage:'STU', count:firstStu },
      { stage:'Offer Received', count:offers },
      { stage:'Deposit Made', count:deposits },
    ];

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

    const curK = maxd ? ym(maxd) : ym(new Date());
    const msf = k => {
      let leads = 0, e = 0, s = 0, dep = 0;
      all.forEach(r => { const d = parseD(r.created_at); if (d && ym(d) === k) { leads++; if (ne(r.EnrolmentDate)) e++; if (ne(r.FirstSTU)) s++; if (ne(r.FirstDeposit)) dep++; } });
      return { leads, ec:e, stu:s, dep };
    };
    const cur = msf(curK), prev = msf(curK - 1);
    const cvl = [
      { metric:'Leads', last:prev.leads, current:cur.leads },
      { metric:'EC', last:prev.ec, current:cur.ec },
      { metric:'STU', last:prev.stu, current:cur.stu },
      { metric:'Deposit', last:prev.dep, current:cur.dep },
    ];
    const cvlLabels = { last:mLabel(curK - 1), current:mLabel(curK) };

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

    const split = [
      { name:'Employee', value:emp },
      { name:'Student', value:stu },
    ].filter(d => d.value > 0);
    const stMap = {};
    all.forEach(r => { const s = (r.StudentStatus || '').trim() || 'Unspecified'; stMap[s] = (stMap[s] || 0) + 1; });
    const statusRows = Object.keys(stMap).map(s => ({ status:s, count:stMap[s] })).sort((a, b) => b.count - a.count).slice(0, 8);
    const trMap = {};
    all.forEach(r => { const d = parseD(r.created_at); if (!d) return; const k = ym(d); trMap[k] = (trMap[k] || 0) + 1; });
    const trend = Object.keys(trMap).map(Number).sort((a, b) => a - b).slice(-14).map(k => ({ month:mLabel(k), referrals:trMap[k] }));

    // Grouped records summary (replaces 24k-row table)
    const buildGroup = (keyFn) => {
      const g = {};
      all.forEach(r => {
        const key = keyFn(r) || 'Unspecified';
        if (!g[key]) g[key] = { key, total:0, stu:0, offer:0, ec:0, dep:0 };
        g[key].total++;
        if (ne(r.FirstSTU)) g[key].stu++;
        if (ne(r.FirstOffer)) g[key].offer++;
        if (ne(r.EnrolmentDate)) g[key].ec++;
        if (ne(r.FirstDeposit)) g[key].dep++;
      });
      return Object.values(g).sort((a, b) => b.total - a.total);
    };
    const groups = {
      status: buildGroup(r => (r.StudentStatus || '').trim()),
      referredBy: buildGroup(r => (r['Referrred by'] || '').trim()),
      intake: buildGroup(r => (r.Intake || '').trim()),
    };

    return { kpis, funnel, leadgen, cohort, cvl, cvlLabels, intakeFunnel, intakeConv, split, statusRows, trend, groups };
  }, [filtered]);

  const PILLS = ['All', 'Employee', 'Student'];
  const pillStyle = active => ({
    padding:'5px 14px', borderRadius:999, fontSize:12, fontWeight:700, cursor:'pointer',
    fontFamily:FONT, border:'0.5px solid ' + (active ? C.navy : C.border),
    background: active ? C.navy : 'var(--card)', color: active ? '#fff' : C.sub, transition:'all .15s',
  });
  const sectionTitle = (t, s) => (
    <div style={{ marginBottom:14 }}>
      <div style={{ fontSize:14, fontWeight:800, color:C.text, letterSpacing:'-0.2px' }}>{t}</div>
      {s && <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{s}</div>}
    </div>
  );
  const axis = { fontSize:11, fill:C.muted, fontFamily:FONT };
  const grid2 = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginTop:16 };

  if (loading) {
    return (
      <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:C.bg, fontFamily:FONT }}>
        <Sidebar />
        <div style={{ flex:1, overflow:'auto' }}><DashboardSkeleton/></div>
      </div>
    );
  }

  return (
    <div className='lq-page-shell' style={{ display:'flex', height:'100vh', overflow:'hidden', background:C.bg, fontFamily:FONT }}>
      <Sidebar />
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>
        {/* HEADER BAR */}
        <div style={{ background:'var(--card)', padding:'0 22px', minHeight:56, height:'auto', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexShrink:0, margin:'12px 12px 0', borderRadius:14, border:'0.5px solid ' + C.border, boxShadow:'0 1px 2px rgba(15,23,42,0.04), 0 8px 24px -14px rgba(31,60,132,0.18)' }}>
          <div>
            <p style={{ fontSize:10.5, color:C.muted, margin:0, letterSpacing:'0.05em', textTransform:'uppercase', fontFamily:FONT }}>Dashboards / Referral</p>
            <h1 style={{ fontSize:18, fontWeight:800, color:C.text, margin:'2px 0 0', letterSpacing:'-0.4px', fontFamily:FONT }}>Referral</h1>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <button onClick={() => loadData(true)} disabled={loading} title="Refresh data"
            style={{ padding:'6px 14px', borderRadius:8, border:'1px solid #e5e7eb', fontSize:12, fontWeight:500, cursor: loading ? 'wait' : 'pointer', fontFamily:FONT, background:'#fff', color:'#374151', display:'flex', alignItems:'center', gap:6, opacity: loading ? 0.65 : 1 }}>
            {loading ? 'Refreshing' : 'Refresh'}
          </button>
            <span style={{ fontSize:10.5, fontWeight:700, color:C.muted, letterSpacing:0.5 }}>SOURCE</span>
            {PILLS.map(p => <div key={p} style={pillStyle(source === p)} onClick={() => setSource(p)}>{p}</div>)}
          </div>
        </div>

        {/* SCROLLABLE CONTENT */}
        <div style={{ flex:1, overflowY:'auto', padding:'20px 28px' }}>
          <div style={{ display:'flex', justifyContent:'flex-end', fontSize:11.5, color:C.muted, fontWeight:600, marginBottom:14 }}>{fmtN(filtered.length)} referrals</div>

          {/* KPI ROW */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(5, minmax(0, 1fr))', gap:14 }}>
            <PremKPI label='TOTAL REFERRALS' value={fmtN(M.kpis.total)} sub='all sources' accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.total} />
            <PremKPI label='EMPLOYEE' value={fmtN(M.kpis.emp)} sub={pct(M.kpis.emp, M.kpis.total) + ' of total'} accent={C.blue} accentBg={C.blueBg} icon={KPI_ICONS.agent} />
            <PremKPI label='STUDENT' value={fmtN(M.kpis.stu)} sub={pct(M.kpis.stu, M.kpis.total) + ' of total'} accent={C.cyan} accentBg={C.cyanBg} icon={KPI_ICONS.bot} />
            <PremKPI label='APPLICATIONS (STUs)' value={fmtN(M.kpis.firstStu)} sub={pct(M.kpis.firstStu, M.kpis.total) + ' conv.'} accent={C.green} accentBg={C.greenBg} icon={KPI_ICONS.ai} />
            <PremKPI label='OFFERS' value={fmtN(M.kpis.offers)} sub={pct(M.kpis.offers, M.kpis.total) + ' of total'} accent={C.green} accentBg={C.greenBg} icon={KPI_ICONS.globe} />
          </div>

          {/* REFERRAL FUNNEL */}
          <Card style={{ marginTop:16 }}>
            {sectionTitle('Referral funnel', 'how referrals progress through stages')}
            <ResponsiveContainer width='100%' height={300}>
              <BarChart data={M.funnel} layout='vertical' margin={{ left:30, right:40, top:4, bottom:4 }}>
                <CartesianGrid horizontal={false} stroke={C.border} />
                <XAxis type='number' tick={axis} axisLine={false} tickLine={false} tickFormatter={fmtN} />
                <YAxis type='category' dataKey='stage' tick={axis} axisLine={false} tickLine={false} width={110} />
                <Tooltip content={<BrandTooltip />} cursor={{ fill:'rgba(31,60,132,0.04)' }} />
                <Bar dataKey='count' name='Referrals' radius={[0, 6, 6, 0]} barSize={22}>
                  {M.funnel.map((e, i) => <Cell key={i} fill={brandColor(i)} />)}
                  <LabelList dataKey='count' position='right' formatter={fmtN} style={{ fontSize:11, fontWeight:700, fill:C.sub }} />
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
                  <CartesianGrid vertical={false} stroke={C.border} />
                  <XAxis dataKey='period' tick={axis} axisLine={false} tickLine={false} />
                  <YAxis tick={axis} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<BrandTooltip />} cursor={{ fill:'rgba(31,60,132,0.04)' }} />
                  <Legend wrapperStyle={{ fontSize:11.5, fontFamily:FONT }} iconType='circle' />
                  <Bar dataKey='Student' name='Student' fill={C.cyan} radius={[4,4,0,0]} barSize={18}><LabelList dataKey='Student' position='top' style={{ fontSize:10, fontWeight:700, fill:C.muted }} /></Bar>
                  <Bar dataKey='EMP' name='EMP' fill={C.blue} radius={[4,4,0,0]} barSize={18}><LabelList dataKey='EMP' position='top' style={{ fontSize:10, fontWeight:700, fill:C.muted }} /></Bar>
                  <Bar dataKey='Total' name='Total' fill={C.navy} radius={[4,4,0,0]} barSize={18}><LabelList dataKey='Total' position='top' style={{ fontSize:10, fontWeight:700, fill:C.muted }} /></Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
            <Card>
              {sectionTitle('Current vs last month', M.cvlLabels.last + ' vs ' + M.cvlLabels.current)}
              <ResponsiveContainer width='100%' height={280}>
                <BarChart data={M.cvl} layout='vertical' margin={{ left:20, right:30, top:10, bottom:4 }} barGap={3}>
                  <CartesianGrid horizontal={false} stroke={C.border} />
                  <XAxis type='number' tick={axis} axisLine={false} tickLine={false} />
                  <YAxis type='category' dataKey='metric' tick={axis} axisLine={false} tickLine={false} width={60} />
                  <Tooltip content={<BrandTooltip />} cursor={{ fill:'rgba(31,60,132,0.04)' }} />
                  <Legend wrapperStyle={{ fontSize:11.5, fontFamily:FONT }} iconType='circle' />
                  <Bar dataKey='last' name={M.cvlLabels.last} fill={C.blue} radius={[0,4,4,0]} barSize={13}><LabelList dataKey='last' position='right' formatter={fmtN} style={{ fontSize:10, fontWeight:700, fill:C.muted }} /></Bar>
                  <Bar dataKey='current' name={M.cvlLabels.current} fill={C.navy} radius={[0,4,4,0]} barSize={13}><LabelList dataKey='current' position='right' formatter={fmtN} style={{ fontSize:10, fontWeight:700, fill:C.muted }} /></Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* MONTHLY APP COHORT PERFORMANCE */}
          <Card style={{ marginTop:16 }}>
            {sectionTitle('Monthly app cohort performance', 'conversion % by app-created month cohort')}
            <ResponsiveContainer width='100%' height={300}>
              <LineChart data={M.cohort} margin={{ left:0, right:20, top:10, bottom:4 }}>
                <CartesianGrid vertical={false} stroke={C.border} />
                <XAxis dataKey='month' tick={axis} axisLine={false} tickLine={false} />
                <YAxis tick={axis} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={v => v + '%'} />
                <Tooltip content={<BrandTooltip />} />
                <Legend wrapperStyle={{ fontSize:11.5, fontFamily:FONT }} iconType='circle' />
                <Line type='monotone' dataKey='leadStu' name='Lead-STU %' stroke={C.blue} strokeWidth={2.5} dot={{ r:3 }} />
                <Line type='monotone' dataKey='stuOffer' name='STU-Offer %' stroke={C.navy} strokeWidth={2.5} dot={{ r:3 }} />
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
                  <CartesianGrid vertical={false} stroke={C.border} />
                  <XAxis dataKey='intake' tick={axis} axisLine={false} tickLine={false} />
                  <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={fmtN} />
                  <Tooltip content={<BrandTooltip />} cursor={{ fill:'rgba(31,60,132,0.04)' }} />
                  <Legend wrapperStyle={{ fontSize:11.5, fontFamily:FONT }} iconType='circle' />
                  <Bar dataKey='firstApp' name='First App' fill={C.navy} radius={[4,4,0,0]} barSize={16} />
                  <Bar dataKey='firstOffer' name='First Offer received' fill={C.blue} radius={[4,4,0,0]} barSize={16} />
                  <Bar dataKey='firstDep' name='First Deposit made' fill={C.cyan} radius={[4,4,0,0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
            <Card>
              {sectionTitle('Intake-wise funnel conversion ratio', 'app-offer / offer-deposit / app-deposit %')}
              <ResponsiveContainer width='100%' height={300}>
                <LineChart data={M.intakeConv} margin={{ left:0, right:30, top:16, bottom:4 }}>
                  <CartesianGrid vertical={false} stroke={C.border} />
                  <XAxis dataKey='intake' tick={axis} axisLine={false} tickLine={false} />
                  <YAxis tick={axis} axisLine={false} tickLine={false} domain={[0, 100]} ticks={[0,25,50,75,100]} tickFormatter={v => v + '%'} />
                  <Tooltip content={<BrandTooltip />} />
                  <Legend wrapperStyle={{ fontSize:11.5, fontFamily:FONT }} iconType='circle' />
                  <Line type='monotone' dataKey='appOffer' name='App-Offer %' stroke={C.navy} strokeWidth={2.5} dot={{ r:3 }}><LabelList dataKey='appOffer' position='top' formatter={v => v + '%'} style={{ fontSize:9.5, fontWeight:700, fill:C.navy }} /></Line>
                  <Line type='monotone' dataKey='offerDep' name='Offer-Deposit %' stroke={C.cyan} strokeWidth={2.5} dot={{ r:3 }} />
                  <Line type='monotone' dataKey='appDep' name='App-Deposit %' stroke={C.green} strokeWidth={2.5} strokeDasharray='4 3' dot={{ r:3 }} />
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
          <Card style={{ marginTop:16 }}>
            {sectionTitle('Referrals by month', 'volume of new referrals created over time')}
            <ResponsiveContainer width='100%' height={260}>
              <AreaChart data={M.trend} margin={{ left:0, right:20, top:10, bottom:4 }}>
                <defs><linearGradient id='refArea' x1='0' y1='0' x2='0' y2='1'><stop offset='5%' stopColor={C.blue} stopOpacity={0.35} /><stop offset='95%' stopColor={C.blue} stopOpacity={0.02} /></linearGradient></defs>
                <CartesianGrid vertical={false} stroke={C.border} />
                <XAxis dataKey='month' tick={axis} axisLine={false} tickLine={false} />
                <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={fmtN} />
                <Tooltip content={<BrandTooltip />} />
                <Area type='monotone' dataKey='referrals' name='Referrals' stroke={C.blue} strokeWidth={2.5} fill='url(#refArea)' />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          {/* GROUPED RECORDS SUMMARY */}
          <Card style={{ marginTop:16 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10, marginBottom:14 }}>
              <div>
                <div style={{ fontSize:14, fontWeight:800, color:C.text, letterSpacing:'-0.2px' }}>Referral summary</div>
                <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{fmtN(filtered.length)} referrals grouped by {grpBy === 'referredBy' ? 'referred by' : grpBy}</div>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                {[['status','Status'], ['referredBy','Referred By'], ['intake','Intake']].map(([k, lbl]) => (
                  <div key={k} onClick={() => setGrpBy(k)} style={{ padding:'5px 13px', borderRadius:999, fontSize:11.5, fontWeight:700, cursor:'pointer', fontFamily:FONT, border:'0.5px solid ' + (grpBy === k ? C.navy : C.border), background: grpBy === k ? C.navy : 'var(--card)', color: grpBy === k ? '#fff' : C.sub }}>{lbl}</div>
                ))}
              </div>
            </div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:FONT }}>
                <thead>
                  <tr>
                    {[grpBy === 'referredBy' ? 'Referred By' : grpBy === 'intake' ? 'Intake' : 'Status', 'Total', 'STUs', 'Offers', 'EC', 'Deposits', 'STU %'].map((h, hi) => (
                      <th key={h} style={{ textAlign: hi === 0 ? 'left' : 'right', fontSize:10.5, fontWeight:700, color:C.muted, letterSpacing:0.4, padding:'10px 12px', borderBottom:'0.5px solid ' + C.border, textTransform:'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {M.groups[grpBy].map((g, i) => {
                    const tdL = { fontSize:12.5, color:C.text, fontWeight:600, padding:'10px 12px', borderBottom:'0.5px solid ' + C.border, maxWidth:240, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' };
                    const tdR = { fontSize:12.5, color:C.sub, padding:'10px 12px', borderBottom:'0.5px solid ' + C.border, textAlign:'right', fontVariantNumeric:'tabular-nums' };
                    return (
                      <tr key={i}>
                        <td style={tdL} title={g.key}>{g.key}</td>
                        <td style={{ ...tdR, fontWeight:800, color:C.text }}>{fmtN(g.total)}</td>
                        <td style={tdR}>{fmtN(g.stu)}</td>
                        <td style={tdR}>{fmtN(g.offer)}</td>
                        <td style={tdR}>{fmtN(g.ec)}</td>
                        <td style={tdR}>{fmtN(g.dep)}</td>
                        <td style={{ ...tdR, color:C.navy, fontWeight:700 }}>{pct(g.stu, g.total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
}
