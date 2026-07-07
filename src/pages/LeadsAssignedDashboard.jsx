import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getSession, setSession } from '../lib/sessionLoad';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, CartesianGrid, Legend,
} from 'recharts';
import Sidebar from '../components/Sidebar';
import { DashboardSkeleton } from '../components/SkeletonLoader'
import {
  C, FONT, brandColor, PAGE_SIZE,
  fmtN, pct, Card, PremKPI, KPI_ICONS, RankedBars,
} from '../ui/dashboardKit';

const CSV_URL = 'https://docs.google.com/spreadsheets/d/1r-e6pBCN5ysfeD3Eq6sxgLmf97mdeTtloMPylqnx6Ew/gviz/tq?tqx=out:csv&sheet=Leadassigned';

function parseCSV(t) {
  const rows = []; let i = 0, field = '', row = [], inq = false;
  while (i < t.length) {
    const c = t[i];
    if (inq) {
      if (c === '"') { if (t[i + 1] === '"') { field += '"'; i += 2; continue; } inq = false; i++; continue; }
      field += c; i++; continue;
    } else {
      if (c === '"') { inq = true; i++; continue; }
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

const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function parseD(s) {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(+m[3], +m[1] - 1, +m[2]);
}
const num = v => { const n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; };
const norm = v => String(v == null ? '' : v).trim().toLowerCase();
const isQualified = r => norm(r.futwork_disposition) === 'qualified' || norm(r.superbot_disposition) === 'superbotqualified';
const dKey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const dLabel = d => d.getDate() + ' ' + MN[d.getMonth()];
const SYSTEM_OWNERS = ['futwork@leverageedu.com', 'superbot@leverageedu.com', 'futwork.ai@leverageedu.com', 'leverage@leadsquared.com'];
const isSystem = e => SYSTEM_OWNERS.includes(String(e).toLowerCase());
const ownerName = e => {
  if (!e) return 'Unassigned';
  const local = String(e).split('@')[0];
  return local.replace(/\./g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

function BrandTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{ background:'#fff', border:'0.5px solid #E5E7EB', borderRadius:10, padding:'9px 13px', fontFamily:FONT, boxShadow:'0 8px 24px rgba(15,23,42,0.12)' }}>
      <div style={{ fontSize:11.5, fontWeight:800, color:'#0F1B33', marginBottom:4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ fontSize:11.5, color:'#475569', display:'flex', justifyContent:'space-between', gap:18 }}>
          <span style={{ color:p.color || p.fill }}>{p.name}</span>
          <span style={{ fontWeight:700, fontVariantNumeric:'tabular-nums' }}>{fmtN(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function LeadsAssignedDashboard() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState('All');
  const [scope, setScope] = useState('All');
  const [dateRange, setDateRange] = useState('all');
  const [cStart, setCStart] = useState('');
  const [cEnd, setCEnd] = useState('');
  const [page, setPage] = useState(1);

  const loadData = useCallback(async (bust = false) => {
    setLoading(true);
    try {
      const cached = getSession('leads_assigned');
      let txt;
      if (!bust && cached) {
        txt = cached.data;
      } else {
        const u = bust ? CSV_URL + (CSV_URL.includes('?') ? '&' : '?') + '_=' + Date.now() : CSV_URL;
        const res = await fetch(u);
        txt = await res.text();
        setSession('leads_assigned', txt);
      }
      setRows(parseCSV(txt));
    } catch (e) { console.error('LeadsAssigned fetch', e); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { setPage(1); }, [source, scope, dateRange, cStart, cEnd]);

  const filtered = useMemo(() => {
    let rs = rows;
    if (source !== 'All') rs = rs.filter(r => (r.lead_source || '').toLowerCase() === source.toLowerCase());
    if (scope === 'Agents') rs = rs.filter(r => !isSystem(r.opportunity_owner_email));
    else if (scope === 'System') rs = rs.filter(r => isSystem(r.opportunity_owner_email));
    if (dateRange !== 'all') {
      let maxd = null;
      rows.forEach(r => { const d = parseD(r.opportunity_created_date); if (d && (!maxd || d > maxd)) maxd = d; });
      const anchor = maxd || new Date();
      const a0 = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
      let cut = null, end = a0;
      if (dateRange === 'L7D') { cut = new Date(a0); cut.setDate(cut.getDate() - 6); }
      else if (dateRange === 'L30D') { cut = new Date(a0); cut.setDate(cut.getDate() - 29); }
      else if (dateRange === 'MTD') { cut = new Date(a0.getFullYear(), a0.getMonth(), 1); }
      else if (dateRange === 'custom') {
        if (cStart) { const p = cStart.split('-'); cut = new Date(+p[0], +p[1] - 1, +p[2]); }
        if (cEnd) { const q = cEnd.split('-'); end = new Date(+q[0], +q[1] - 1, +q[2]); }
      }
      if (cut || dateRange === 'custom') {
        rs = rs.filter(r => { const d = parseD(r.opportunity_created_date); if (!d) return false; if (cut && d < cut) return false; if (end && d > end) return false; return true; });
      }
    }
    return rs;
  }, [rows, source, scope, dateRange, cStart, cEnd]);

  const M = useMemo(() => {
    const all = filtered;
    let total = 0, qualified = 0;
    const byOwner = {}, srcAssigned = {}, srcQualified = {}, byDate = {};
    all.forEach(r => {
      const c = num(r.opp_count);
      total += c;
      const oe = r.opportunity_owner_email || 'Unassigned';
      if (!byOwner[oe]) byOwner[oe] = { email: oe, count: 0, qualified: 0, system: isSystem(oe) };
      byOwner[oe].count += c;
      const src = (r.lead_source || 'unknown').toLowerCase();
      srcAssigned[src] = (srcAssigned[src] || 0) + c;
      const d = parseD(r.opportunity_created_date);
      const q = isQualified(r);
      if (q) {
        qualified += c;
        byOwner[oe].qualified += c;
        srcQualified[src] = (srcQualified[src] || 0) + c;
        if (d) { const k = dKey(d); if (!byDate[k]) byDate[k] = { d, count: 0 }; byDate[k].count += c; }
      }
    });

    const ownerArr = Object.values(byOwner).sort((a, b) => b.qualified - a.qualified || b.count - a.count);
    const agentArr = ownerArr.filter(o => !o.system);
    const owners = ownerArr.length;
    const agents = agentArr.length;
    const qualifiedOwners = ownerArr.filter(o => o.qualified > 0).length;
    const topOwner = ownerArr[0];

    const leaderboard = ownerArr.filter(o => o.qualified > 0).slice(0, 10).map(o => ({ name: ownerName(o.email), count: o.qualified }));

    const split = Object.keys(srcAssigned).map(s => ({
      name: s.charAt(0).toUpperCase() + s.slice(1),
      value: srcQualified[s] || 0,
    })).sort((a, b) => b.value - a.value);

    const trend = Object.values(byDate).sort((a, b) => a.d - b.d).map(x => ({ date: dLabel(x.d), count: x.count }));

    const activeAgents = agentArr.filter(o => o.qualified > 0).length;
    const avgQualPerAgent = activeAgents ? agentArr.reduce((s, o) => s + o.qualified, 0) / activeAgents : 0;
    const qualRate = total ? (qualified / total) * 100 : 0;

    return { total, qualified, qualRate, owners, agents, qualifiedOwners, topOwner, leaderboard, split, trend, ownerArr, avgQualPerAgent };
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(M.ownerArr.length / PAGE_SIZE));
  const pageRows = M.ownerArr.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const axis = { fontSize:11, fill:C.muted, fontFamily:FONT };
  const grid2 = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginTop:16 };
  const sectionTitle = (t, s) => (
    <div style={{ marginBottom:14 }}>
      <div style={{ fontSize:14, fontWeight:800, color:C.text, letterSpacing:'-0.2px' }}>{t}</div>
      {s && <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{s}</div>}
    </div>
  );
  const pillStyle = active => ({
    padding:'5px 14px', borderRadius:999, fontSize:12, fontWeight:700, cursor:'pointer',
    fontFamily:FONT, border:'0.5px solid ' + (active ? C.navy : C.border),
    background: active ? C.navy : 'var(--card)', color: active ? '#fff' : C.sub, transition:'all .15s',
  });
  const SRC_PILLS = ['All', 'Futwork', 'Floor'];
  const SCOPE_PILLS = [['All','All'], ['Agents','Agents'], ['System','System / pools']];

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
      <div style={{ margin:'12px 14px 0', borderRadius:14, border:'1px solid #EEF1F6', boxShadow:'0 1px 3px rgba(31,60,132,0.06)', flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>
        <div style={{ background:'var(--card)', borderBottom:'0.5px solid ' + C.border, padding:'10px 28px', minHeight:56, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap', flexShrink:0 }}>
          <div>
            <p style={{ fontSize:10.5, color:C.muted, margin:0, letterSpacing:'0.05em', textTransform:'uppercase', fontFamily:FONT }}>Dashboards / Leads Assigned</p>
            <h1 style={{ fontSize:18, fontWeight:800, color:C.text, margin:'2px 0 0', letterSpacing:'-0.4px', fontFamily:FONT }}>Leads Assigned</h1>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
            <button onClick={() => loadData(true)} disabled={loading} title="Refresh data"
              style={{ padding:'6px 14px', borderRadius:8, border:'1px solid #e5e7eb', fontSize:12, fontWeight:500, cursor: loading ? 'wait' : 'pointer', fontFamily:FONT, background:'#fff', color:'#374151', display:'flex', alignItems:'center', gap:6, opacity: loading ? 0.65 : 1 }}>
              {loading ? 'Refreshing' : 'Refresh'}
            </button>
            <span style={{ fontSize:10.5, fontWeight:700, color:C.muted, letterSpacing:0.5 }}>DATE</span>
            {[['all','All'],['MTD','MTD'],['L7D','7D'],['L30D','30D'],['custom','Custom']].map(([v,lab]) => <div key={v} style={pillStyle(dateRange === v)} onClick={() => setDateRange(v)}>{lab}</div>)}
            {dateRange === 'custom' && <div style={{ display:'flex', alignItems:'center', gap:6, marginLeft:2 }}><input type="date" value={cStart} max={cEnd || undefined} onChange={e => setCStart(e.target.value)} style={{ fontFamily:FONT, fontSize:12, color:C.text, border:'0.5px solid ' + C.border, borderRadius:8, padding:'5px 8px', background:'var(--card)', outline:'none' }} /><span style={{ fontSize:11, color:C.muted }}>to</span><input type="date" value={cEnd} min={cStart || undefined} onChange={e => setCEnd(e.target.value)} style={{ fontFamily:FONT, fontSize:12, color:C.text, border:'0.5px solid ' + C.border, borderRadius:8, padding:'5px 8px', background:'var(--card)', outline:'none' }} /></div>}
            <span style={{ width:1, height:18, background:C.border, margin:'0 4px' }} />
            <span style={{ fontSize:10.5, fontWeight:700, color:C.muted, letterSpacing:0.5 }}>SOURCE</span>
            {SRC_PILLS.map(p => <div key={p} style={pillStyle(source === p)} onClick={() => setSource(p)}>{p}</div>)}
            <span style={{ width:1, height:18, background:C.border, margin:'0 4px' }} />
            <span style={{ fontSize:10.5, fontWeight:700, color:C.muted, letterSpacing:0.5 }}>OWNER</span>
            {SCOPE_PILLS.map(([v,lab]) => <div key={v} style={pillStyle(scope === v)} onClick={() => setScope(v)}>{lab}</div>)}
          </div>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'20px 28px' }}>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(5, minmax(0, 1fr))', gap:14, marginBottom:20 }}>
            <PremKPI label='QUALIFIED LEADS' value={fmtN(M.qualified)} sub='qualified assignments' accent={C.green} accentBg={C.greenBg} icon={KPI_ICONS.ai} />
            <PremKPI label='QUALIFICATION RATE' value={M.qualRate.toFixed(1) + '%'} sub={fmtN(M.qualified) + ' of ' + fmtN(M.total)} accent={C.cyan} accentBg={C.cyanBg} icon={KPI_ICONS.globe} />
            <PremKPI label='LEADS ASSIGNED' value={fmtN(M.total)} sub='total opportunities' accent={C.navy} accentBg={C.navyBg} icon={KPI_ICONS.total} />
            <PremKPI label='QUALIFIED OWNERS' value={fmtN(M.qualifiedOwners)} sub={'of ' + fmtN(M.owners) + ' owners'} accent={C.blue} accentBg={C.blueBg} icon={KPI_ICONS.agent} />
            <PremKPI label='AVG QUALIFIED / AGENT' value={fmtN(Math.round(M.avgQualPerAgent))} sub='per active agent' accent={C.blue} accentBg={C.blueBg} icon={KPI_ICONS.bot} />
          </div>

          <Card>
            {sectionTitle('Qualified leads per day', 'daily volume of qualified assignments')}
            <ResponsiveContainer width='100%' height={280}>
              <AreaChart data={M.trend} margin={{ left:0, right:20, top:10, bottom:4 }}>
                <defs><linearGradient id='laArea' x1='0' y1='0' x2='0' y2='1'><stop offset='5%' stopColor={C.green} stopOpacity={0.32} /><stop offset='95%' stopColor={C.green} stopOpacity={0.02} /></linearGradient></defs>
                <CartesianGrid vertical={false} stroke={C.border} />
                <XAxis dataKey='date' tick={axis} axisLine={false} tickLine={false} />
                <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={fmtN} />
                <Tooltip content={<BrandTooltip />} />
                <Area type='monotone' dataKey='count' name='Qualified leads' stroke={C.green} strokeWidth={2.5} fill='url(#laArea)' />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          <div style={grid2}>
            <Card>
              {sectionTitle('Top owners by qualified leads', 'highest qualified assignments (agents + pools)')}
              <RankedBars data={M.leaderboard} labelKey='name' max={M.leaderboard[0]?.count || 0} total={M.leaderboard.reduce((a, b) => a + b.count, 0)} colorFn={brandColor} showRank />
            </Card>
            <Card>
              {sectionTitle('Qualified by source', 'futwork vs floor qualified leads')}
              <ResponsiveContainer width='100%' height={280}>
                <PieChart>
                  <Pie data={M.split} dataKey='value' nameKey='name' innerRadius={62} outerRadius={100} paddingAngle={2}>
                    {M.split.map((e, i) => <Cell key={i} fill={brandColor(i)} />)}
                  </Pie>
                  <Tooltip content={<BrandTooltip />} />
                  <Legend wrapperStyle={{ fontSize:11.5, fontFamily:FONT }} iconType='circle' />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <Card style={{ marginTop:16 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10, marginBottom:14 }}>
              <div>
                <div style={{ fontSize:14, fontWeight:800, color:C.text, letterSpacing:'-0.2px' }}>Leads by owner</div>
                <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{fmtN(M.ownerArr.length)} owners · {fmtN(M.qualified)} qualified of {fmtN(M.total)} assigned · ranked by qualified</div>
              </div>
            </div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:FONT }}>
                <thead>
                  <tr>
                    {['#', 'Owner', 'Type', 'Qualified', 'Assigned', 'Qual %', 'Share of Qual'].map((h, hi) => (
                      <th key={h} style={{ textAlign: hi <= 2 ? 'left' : 'right', fontSize:10.5, fontWeight:700, color:C.muted, letterSpacing:0.4, padding:'10px 12px', borderBottom:'0.5px solid ' + C.border, textTransform:'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((o, i) => {
                    const rank = (page - 1) * PAGE_SIZE + i + 1;
                    const tdR = { fontSize:12.5, color:C.sub, padding:'10px 12px', borderBottom:'0.5px solid ' + C.border, textAlign:'right', fontVariantNumeric:'tabular-nums' };
                    return (
                      <tr key={o.email}>
                        <td style={{ fontSize:11.5, color:C.muted, padding:'10px 12px', borderBottom:'0.5px solid ' + C.border, fontWeight:700 }}>{rank}</td>
                        <td style={{ fontSize:12.5, color:C.text, fontWeight:600, padding:'10px 12px', borderBottom:'0.5px solid ' + C.border, maxWidth:260, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={o.email}>{ownerName(o.email)}</td>
                        <td style={{ fontSize:11, padding:'10px 12px', borderBottom:'0.5px solid ' + C.border }}>
                          <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:6, color: o.system ? C.blue : C.navy, background: o.system ? C.blueBg : C.navyBg }}>{o.system ? 'Pool' : 'Agent'}</span>
                        </td>
                        <td style={{ ...tdR, fontWeight:800, color:C.green }}>{fmtN(o.qualified)}</td>
                        <td style={tdR}>{fmtN(o.count)}</td>
                        <td style={{ ...tdR, color:C.text, fontWeight:700 }}>{pct(o.qualified, o.count)}</td>
                        <td style={{ ...tdR, color:C.navy, fontWeight:700 }}>{pct(o.qualified, M.qualified)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:14, flexWrap:'wrap', gap:10 }}>
              <span style={{ fontSize:11.5, color:C.muted, fontFamily:FONT }}>Page {page} of {totalPages}</span>
              <div style={{ display:'flex', gap:6 }}>
                <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} style={{ padding:'6px 14px', borderRadius:8, border:'0.5px solid ' + C.border, background:'var(--card)', color: page <= 1 ? C.muted : C.text, fontSize:12, fontWeight:600, cursor: page <= 1 ? 'default' : 'pointer', fontFamily:FONT, opacity: page <= 1 ? 0.5 : 1 }}>Prev</button>
                <button disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} style={{ padding:'6px 14px', borderRadius:8, border:'0.5px solid ' + C.border, background: page >= totalPages ? 'var(--card)' : C.navy, color: page >= totalPages ? C.muted : '#fff', fontSize:12, fontWeight:600, cursor: page >= totalPages ? 'default' : 'pointer', fontFamily:FONT, opacity: page >= totalPages ? 0.5 : 1 }}>Next</button>
              </div>
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
}
