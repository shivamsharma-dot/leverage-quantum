import React, { useState, useMemo, useEffect } from 'react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts'
import Sidebar from '../components/Sidebar'
import Dropdown from '../components/Dropdown'
import KPICard from '../components/KPICard'
import ExportButton from '../components/ExportButton'
import { DashboardSkeleton } from '../components/SkeletonLoader'
import styles from './LeadQualityDashboard.module.css'
import { BarGrad, barFill, BAR_RADIUS, BAR_RADIUS_H, BAR_MAX, NEUTRAL_TRACK } from '../ui/dashboardKit'

const RAW = [{"month":"Jan-2025","channel":"Bing","opps":533,"floor":63,"futwork":470,"qls":0,"apps":34},{"month":"Jan-2025","channel":"WhatsApp","opps":26224,"floor":1777,"futwork":24447,"qls":0,"apps":0},{"month":"Jan-2025","channel":"Other","opps":9039,"floor":1865,"futwork":7174,"qls":9650,"apps":123},{"month":"Jan-2025","channel":"Leverage App","opps":15654,"floor":188,"futwork":15466,"qls":0,"apps":0},{"month":"Jan-2025","channel":"Affiliate","opps":46850,"floor":2214,"futwork":44636,"qls":0,"apps":170},{"month":"Jan-2025","channel":"Google","opps":38871,"floor":11957,"futwork":26914,"qls":0,"apps":904},{"month":"Jan-2025","channel":"Content+Brand","opps":0,"floor":0,"futwork":0,"qls":0,"apps":470},{"month":"Jan-2025","channel":"Facebook","opps":21618,"floor":2506,"futwork":19112,"qls":0,"apps":591},{"month":"Jan-2025","channel":"Inbound","opps":6228,"floor":1772,"futwork":4456,"qls":0,"apps":0},{"month":"Jan-2025","channel":"Organic","opps":21385,"floor":3011,"futwork":18374,"qls":0,"apps":0},{"month":"Jan-2025","channel":"Referral","opps":0,"floor":0,"futwork":0,"qls":0,"apps":397},{"month":"Jan-2025","channel":"Remarketing","opps":949,"floor":3,"futwork":946,"qls":0,"apps":24},{"month":"Feb-2025","channel":"WhatsApp","opps":14227,"floor":1285,"futwork":12942,"qls":0,"apps":0},{"month":"Feb-2025","channel":"Other","opps":6293,"floor":1031,"futwork":5262,"qls":8706,"apps":112},{"month":"Feb-2025","channel":"Remarketing","opps":2,"floor":2,"futwork":0,"qls":0,"apps":19},{"month":"Feb-2025","channel":"Leverage App","opps":6151,"floor":126,"futwork":6025,"qls":0,"apps":0},{"month":"Feb-2025","channel":"Affiliate","opps":61001,"floor":3114,"futwork":57887,"qls":0,"apps":196},{"month":"Feb-2025","channel":"Google","opps":37319,"floor":10741,"futwork":26578,"qls":0,"apps":824},{"month":"Feb-2025","channel":"Content+Brand","opps":0,"floor":0,"futwork":0,"qls":0,"apps":309},{"month":"Feb-2025","channel":"Facebook","opps":18980,"floor":1802,"futwork":17178,"qls":0,"apps":456},{"month":"Feb-2025","channel":"Inbound","opps":6804,"floor":2955,"futwork":3849,"qls":0,"apps":0},{"month":"Feb-2025","channel":"Organic","opps":8965,"floor":2375,"futwork":6590,"qls":0,"apps":0},{"month":"Feb-2025","channel":"Referral","opps":0,"floor":0,"futwork":0,"qls":0,"apps":468},{"month":"Feb-2025","channel":"Bing","opps":381,"floor":10,"futwork":371,"qls":0,"apps":24},{"month":"Mar-2025","channel":"WhatsApp","opps":26721,"floor":2607,"futwork":24114,"qls":0,"apps":0},{"month":"Mar-2025","channel":"Other","opps":6322,"floor":2696,"futwork":3626,"qls":9902,"apps":72},{"month":"Mar-2025","channel":"Remarketing","opps":0,"floor":0,"futwork":0,"qls":0,"apps":37},{"month":"Mar-2025","channel":"Leverage App","opps":11521,"floor":106,"futwork":11415,"qls":0,"apps":0},{"month":"Mar-2025","channel":"Affiliate","opps":56212,"floor":3733,"futwork":52479,"qls":0,"apps":177},{"month":"Mar-2025","channel":"Google","opps":44254,"floor":19010,"futwork":25244,"qls":0,"apps":775},{"month":"Mar-2025","channel":"Content+Brand","opps":0,"floor":0,"futwork":0,"qls":0,"apps":275},{"month":"Mar-2025","channel":"Facebook","opps":24520,"floor":3821,"futwork":20699,"qls":0,"apps":477},{"month":"Mar-2025","channel":"Inbound","opps":9097,"floor":3260,"futwork":5837,"qls":0,"apps":0},{"month":"Mar-2025","channel":"Organic","opps":9245,"floor":3199,"futwork":6046,"qls":0,"apps":0},{"month":"Mar-2025","channel":"Referral","opps":0,"floor":0,"futwork":0,"qls":0,"apps":512},{"month":"Mar-2025","channel":"Bing","opps":628,"floor":59,"futwork":569,"qls":0,"apps":28},{"month":"Apr-2025","channel":"WhatsApp","opps":21867,"floor":2674,"futwork":19193,"qls":0,"apps":0},{"month":"Apr-2025","channel":"Other","opps":4224,"floor":956,"futwork":3268,"qls":9761,"apps":57},{"month":"Apr-2025","channel":"Remarketing","opps":0,"floor":0,"futwork":0,"qls":0,"apps":67},{"month":"Apr-2025","channel":"Leverage App","opps":10451,"floor":103,"futwork":10348,"qls":0,"apps":0},{"month":"Apr-2025","channel":"Affiliate","opps":74111,"floor":7272,"futwork":66839,"qls":0,"apps":200},{"month":"Apr-2025","channel":"Google","opps":36239,"floor":18007,"futwork":18232,"qls":0,"apps":812},{"month":"Apr-2025","channel":"Content+Brand","opps":0,"floor":0,"futwork":0,"qls":0,"apps":294},{"month":"Apr-2025","channel":"Facebook","opps":15384,"floor":1385,"futwork":13999,"qls":0,"apps":437},{"month":"Apr-2025","channel":"Inbound","opps":6348,"floor":2248,"futwork":4100,"qls":0,"apps":0},{"month":"Apr-2025","channel":"Organic","opps":8281,"floor":2704,"futwork":5577,"qls":0,"apps":0},{"month":"Apr-2025","channel":"Referral","opps":0,"floor":0,"futwork":0,"qls":0,"apps":478},{"month":"Apr-2025","channel":"Bing","opps":545,"floor":50,"futwork":495,"qls":0,"apps":18},{"month":"May-2025","channel":"WhatsApp","opps":21281,"floor":1817,"futwork":19464,"qls":0,"apps":0},{"month":"May-2025","channel":"Other","opps":5420,"floor":1307,"futwork":4113,"qls":6242,"apps":59},{"month":"May-2025","channel":"Remarketing","opps":0,"floor":0,"futwork":0,"qls":86,"apps":38},{"month":"May-2025","channel":"Leverage App","opps":10575,"floor":98,"futwork":10477,"qls":0,"apps":0},{"month":"May-2025","channel":"Affiliate","opps":67846,"floor":4269,"futwork":63577,"qls":795,"apps":211},{"month":"May-2025","channel":"Google","opps":35243,"floor":13847,"futwork":21396,"qls":1481,"apps":615},{"month":"May-2025","channel":"LinkedIn","opps":1,"floor":1,"futwork":0,"qls":0,"apps":1},{"month":"May-2025","channel":"Facebook","opps":15349,"floor":2807,"futwork":12542,"qls":1003,"apps":330},{"month":"May-2025","channel":"Inbound","opps":7651,"floor":3500,"futwork":4151,"qls":0,"apps":0},{"month":"May-2025","channel":"Content+Brand","opps":0,"floor":0,"futwork":0,"qls":356,"apps":268},{"month":"May-2025","channel":"Organic","opps":110422,"floor":104483,"futwork":5939,"qls":0,"apps":0},{"month":"May-2025","channel":"Referral","opps":0,"floor":0,"futwork":0,"qls":0,"apps":304},{"month":"May-2025","channel":"Bing","opps":621,"floor":74,"futwork":547,"qls":46,"apps":17},{"month":"Jun-2025","channel":"WhatsApp","opps":17587,"floor":2057,"futwork":15530,"qls":0,"apps":0},{"month":"Jun-2025","channel":"Other","opps":3361,"floor":912,"futwork":2449,"qls":56,"apps":51},{"month":"Jun-2025","channel":"Remarketing","opps":0,"floor":0,"futwork":0,"qls":110,"apps":19},{"month":"Jun-2025","channel":"Leverage App","opps":5924,"floor":76,"futwork":5848,"qls":0,"apps":0},{"month":"Jun-2025","channel":"Affiliate","opps":68780,"floor":2129,"futwork":66651,"qls":1373,"apps":89},{"month":"Jun-2025","channel":"Google","opps":26260,"floor":13098,"futwork":13162,"qls":2468,"apps":361},{"month":"Jun-2025","channel":"Content+Brand","opps":0,"floor":0,"futwork":0,"qls":828,"apps":138},{"month":"Jun-2025","channel":"Facebook","opps":18266,"floor":4610,"futwork":13656,"qls":2793,"apps":231},{"month":"Jun-2025","channel":"Inbound","opps":6726,"floor":3525,"futwork":3201,"qls":0,"apps":0},{"month":"Jun-2025","channel":"Organic","opps":4497,"floor":1177,"futwork":3320,"qls":0,"apps":0},{"month":"Jun-2025","channel":"Referral","opps":0,"floor":0,"futwork":0,"qls":4,"apps":131},{"month":"Jun-2025","channel":"Bing","opps":461,"floor":46,"futwork":415,"qls":99,"apps":11},{"month":"Jul-2025","channel":"WhatsApp","opps":7015,"floor":1546,"futwork":5469,"qls":0,"apps":0},{"month":"Jul-2025","channel":"Other","opps":2078,"floor":507,"futwork":1571,"qls":27,"apps":24},{"month":"Jul-2025","channel":"Remarketing","opps":2,"floor":2,"futwork":0,"qls":75,"apps":4},{"month":"Jul-2025","channel":"Affiliate","opps":67053,"floor":2632,"futwork":64421,"qls":1384,"apps":60},{"month":"Jul-2025","channel":"Leverage App","opps":684,"floor":60,"futwork":624,"qls":0,"apps":0},{"month":"Jul-2025","channel":"Google","opps":20969,"floor":2095,"futwork":18874,"qls":1832,"apps":177},{"month":"Jul-2025","channel":"LinkedIn","opps":3,"floor":3,"futwork":0,"qls":0,"apps":0},{"month":"Jul-2025","channel":"Facebook","opps":16263,"floor":4903,"futwork":11360,"qls":2383,"apps":181},{"month":"Jul-2025","channel":"Inbound","opps":5983,"floor":3217,"futwork":2766,"qls":0,"apps":0},{"month":"Jul-2025","channel":"Content+Brand","opps":0,"floor":0,"futwork":0,"qls":318,"apps":93},{"month":"Jul-2025","channel":"Organic","opps":3290,"floor":1042,"futwork":2248,"qls":0,"apps":0},{"month":"Jul-2025","channel":"Referral","opps":0,"floor":0,"futwork":0,"qls":2,"apps":95},{"month":"Jul-2025","channel":"Bing","opps":342,"floor":23,"futwork":319,"qls":72,"apps":4},{"month":"Aug-2025","channel":"WhatsApp","opps":9534,"floor":1527,"futwork":8007,"qls":0,"apps":0},{"month":"Aug-2025","channel":"Other","opps":2494,"floor":534,"futwork":1960,"qls":17,"apps":21},{"month":"Aug-2025","channel":"Remarketing","opps":0,"floor":0,"futwork":0,"qls":229,"apps":1},{"month":"Aug-2025","channel":"Affiliate","opps":55890,"floor":1590,"futwork":54300,"qls":1070,"apps":19},{"month":"Aug-2025","channel":"Leverage App","opps":1441,"floor":65,"futwork":1376,"qls":0,"apps":0},{"month":"Aug-2025","channel":"Google","opps":21763,"floor":2261,"futwork":19502,"qls":1667,"apps":117},{"month":"Aug-2025","channel":"LinkedIn","opps":24,"floor":23,"futwork":1,"qls":1,"apps":0},{"month":"Aug-2025","channel":"Facebook","opps":17860,"floor":6211,"futwork":11649,"qls":2119,"apps":103},{"month":"Aug-2025","channel":"Inbound","opps":6288,"floor":3325,"futwork":2963,"qls":0,"apps":0},{"month":"Aug-2025","channel":"Content+Brand","opps":0,"floor":0,"futwork":0,"qls":281,"apps":74},{"month":"Aug-2025","channel":"Organic","opps":2800,"floor":886,"futwork":1914,"qls":0,"apps":0},{"month":"Aug-2025","channel":"Referral","opps":0,"floor":0,"futwork":0,"qls":1,"apps":107},{"month":"Aug-2025","channel":"Bing","opps":236,"floor":26,"futwork":210,"qls":50,"apps":5},{"month":"Sep-2025","channel":"WhatsApp","opps":9944,"floor":2004,"futwork":7940,"qls":0,"apps":0},{"month":"Sep-2025","channel":"Other","opps":2613,"floor":570,"futwork":2043,"qls":12,"apps":37},{"month":"Sep-2025","channel":"Remarketing","opps":0,"floor":0,"futwork":0,"qls":310,"apps":28},{"month":"Sep-2025","channel":"Affiliate","opps":50437,"floor":1940,"futwork":48497,"qls":1434,"apps":87},{"month":"Sep-2025","channel":"Leverage App","opps":1046,"floor":74,"futwork":972,"qls":0,"apps":0},{"month":"Sep-2025","channel":"Google","opps":19725,"floor":2103,"futwork":17622,"qls":1512,"apps":239},{"month":"Sep-2025","channel":"Content+Brand","opps":0,"floor":0,"futwork":0,"qls":373,"apps":156},{"month":"Sep-2025","channel":"Facebook","opps":32297,"floor":12357,"futwork":19940,"qls":3685,"apps":346},{"month":"Sep-2025","channel":"Inbound","opps":6377,"floor":3479,"futwork":2898,"qls":0,"apps":0},{"month":"Sep-2025","channel":"Organic","opps":2932,"floor":1024,"futwork":1908,"qls":0,"apps":0},{"month":"Sep-2025","channel":"Referral","opps":0,"floor":0,"futwork":0,"qls":0,"apps":169},{"month":"Sep-2025","channel":"Bing","opps":222,"floor":84,"futwork":138,"qls":39,"apps":5},{"month":"Oct-2025","channel":"WhatsApp","opps":4838,"floor":1256,"futwork":3582,"qls":0,"apps":0},{"month":"Oct-2025","channel":"Other","opps":1802,"floor":508,"futwork":1294,"qls":9,"apps":60},{"month":"Oct-2025","channel":"Remarketing","opps":0,"floor":0,"futwork":0,"qls":113,"apps":21},{"month":"Oct-2025","channel":"Affiliate","opps":35553,"floor":1538,"futwork":34015,"qls":1081,"apps":93},{"month":"Oct-2025","channel":"Leverage App","opps":497,"floor":58,"futwork":439,"qls":0,"apps":0},{"month":"Oct-2025","channel":"Google","opps":21897,"floor":2142,"futwork":19755,"qls":1681,"apps":279},{"month":"Oct-2025","channel":"LinkedIn","opps":92,"floor":32,"futwork":60,"qls":24,"apps":0},{"month":"Oct-2025","channel":"Facebook","opps":40775,"floor":14767,"futwork":26008,"qls":4062,"apps":483},{"month":"Oct-2025","channel":"Inbound","opps":7435,"floor":5016,"futwork":2419,"qls":0,"apps":0},{"month":"Oct-2025","channel":"Content+Brand","opps":0,"floor":0,"futwork":0,"qls":323,"apps":209},{"month":"Oct-2025","channel":"Organic","opps":2370,"floor":1033,"futwork":1337,"qls":0,"apps":0},{"month":"Oct-2025","channel":"Referral","opps":0,"floor":0,"futwork":0,"qls":3,"apps":287},{"month":"Oct-2025","channel":"Bing","opps":340,"floor":340,"futwork":0,"qls":2,"apps":6},{"month":"Nov-2025","channel":"WhatsApp","opps":3766,"floor":992,"futwork":2774,"qls":0,"apps":0},{"month":"Nov-2025","channel":"Other","opps":1560,"floor":362,"futwork":1198,"qls":22,"apps":48},{"month":"Nov-2025","channel":"Remarketing","opps":0,"floor":0,"futwork":0,"qls":82,"apps":18},{"month":"Nov-2025","channel":"Affiliate","opps":39657,"floor":1215,"futwork":38442,"qls":1778,"apps":83},{"month":"Nov-2025","channel":"Leverage App","opps":582,"floor":62,"futwork":520,"qls":0,"apps":0},{"month":"Nov-2025","channel":"Google","opps":15594,"floor":3591,"futwork":12003,"qls":1817,"apps":274},{"month":"Nov-2025","channel":"LinkedIn","opps":198,"floor":46,"futwork":152,"qls":48,"apps":4},{"month":"Nov-2025","channel":"Facebook","opps":48652,"floor":16634,"futwork":32018,"qls":4126,"apps":416},{"month":"Nov-2025","channel":"Inbound","opps":8433,"floor":5938,"futwork":2495,"qls":0,"apps":0},{"month":"Nov-2025","channel":"Content+Brand","opps":0,"floor":0,"futwork":0,"qls":346,"apps":189},{"month":"Nov-2025","channel":"Organic","opps":2303,"floor":991,"futwork":1312,"qls":0,"apps":0},{"month":"Nov-2025","channel":"Referral","opps":0,"floor":0,"futwork":0,"qls":1,"apps":246},{"month":"Nov-2025","channel":"Bing","opps":288,"floor":288,"futwork":0,"qls":0,"apps":9},{"month":"Dec-2025","channel":"WhatsApp","opps":6296,"floor":1568,"futwork":4728,"qls":0,"apps":0},{"month":"Dec-2025","channel":"Other","opps":1453,"floor":246,"futwork":1207,"qls":10,"apps":27},{"month":"Dec-2025","channel":"Remarketing","opps":0,"floor":0,"futwork":0,"qls":215,"apps":8},{"month":"Dec-2025","channel":"Affiliate","opps":43519,"floor":3032,"futwork":40487,"qls":1686,"apps":51},{"month":"Dec-2025","channel":"Leverage App","opps":549,"floor":37,"futwork":512,"qls":0,"apps":0},{"month":"Dec-2025","channel":"Google","opps":10547,"floor":2785,"futwork":7762,"qls":1851,"apps":170},{"month":"Dec-2025","channel":"LinkedIn","opps":263,"floor":60,"futwork":203,"qls":61,"apps":3},{"month":"Dec-2025","channel":"Facebook","opps":54246,"floor":16849,"futwork":37397,"qls":4317,"apps":244},{"month":"Dec-2025","channel":"Inbound","opps":6378,"floor":3604,"futwork":2774,"qls":0,"apps":0},{"month":"Dec-2025","channel":"Content+Brand","opps":0,"floor":0,"futwork":0,"qls":291,"apps":111},{"month":"Dec-2025","channel":"Organic","opps":1955,"floor":760,"futwork":1195,"qls":0,"apps":0},{"month":"Dec-2025","channel":"Referral","opps":0,"floor":0,"futwork":0,"qls":3,"apps":138},{"month":"Dec-2025","channel":"Bing","opps":230,"floor":230,"futwork":0,"qls":3,"apps":5}]
const MONTHS = ["Jan-2025","Feb-2025","Mar-2025","Apr-2025","May-2025","Jun-2025","Jul-2025","Aug-2025","Sep-2025","Oct-2025","Nov-2025","Dec-2025"]
const ALL_CHANNELS = ["Affiliate","Bing","Content+Brand","Facebook","Google","Inbound","Leverage App","LinkedIn","Organic","Other","Referral","Remarketing","WhatsApp"]

const CH_COLORS = {
  Facebook:'#1C9FD4', Google:'#4CAE6F', Affiliate:'#F59E0B',
  Inbound:'#DC2626', WhatsApp:'#4CAE6F', 'Leverage App':'#1C9FD4',
  Organic:'#1C9FD4', Referral:'#F59E0B', 'Content+Brand':'#29B9C3',
  Remarketing:'#29B9C3', LinkedIn:'#0EA5E9', Bing:'#4CAE6F', Other:'#9CA3AF'
}

function fmt(n) {
  if (!n) return '0'
  if (n >= 1e6) return (n/1e6).toFixed(2) + 'M'
  if (n >= 1e3) return (n/1e3).toFixed(1) + 'K'
  return Math.round(n).toLocaleString('en-IN')
}

function pct(a, b) { return b > 0 ? (a/b*100).toFixed(1) + '%' : '–' }

const TOOLTIP = {
  contentStyle: { background:'#fff', border:'1px solid #E5E7EB', borderRadius: 12, fontSize:12 },
  labelStyle: { color:'#111827', fontWeight:600 }
}


function InfoTooltip({ items }) {
  const [show, setShow] = React.useState(false)
  return (
    <div style={{ position:'relative', flexShrink:0 }}>
      <button onClick={() => setShow(v => !v)}
        style={{ width:30, height:30, borderRadius:8, border:'0.5px solid #E5E7EB', background:show?'#E8EFF9':'#fff', color:'#1F3C84', fontSize:14, fontWeight:700, fontStyle:'italic', fontFamily:'Georgia,serif', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
        i
      </button>
      {show && <div onClick={() => setShow(false)} style={{ position:'fixed', inset:0, zIndex:150 }}/>}
      {show && (
        <div style={{ position:'absolute', right:0, top:'calc(100% + 8px)', zIndex:200, width:360, background:'#fff', border:'0.5px solid #E5E7EB', borderRadius:12, boxShadow:'0 14px 40px rgba(15,23,42,0.16)', padding:'16px 18px', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#0F172A', marginBottom:8 }}>How metrics are calculated</div>
          {items.map(([label, desc]) => (
            <div key={label} style={{ display:'flex', gap:10, padding:'6px 0', borderTop:'0.5px solid #F3F4F6' }}>
              <div style={{ fontSize:11.5, fontWeight:700, color:'#1F3C84', width:120, flexShrink:0 }}>{label}</div>
              <div style={{ fontSize:11.5, color:'#475569', lineHeight:1.5 }}>{desc}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


const C_KPI = { navy:'#1F3C84', blue:'#1C9FD4', cyan:'#29B9C3', green:'#4CAE6F', amber:'#F59E0B',
  navyBg:'#E8EFF9', blueBg:'#E3F5FD', cyanBg:'#E4F8F9', greenBg:'#E9F8EF', amberBg:'#FEF9C3',
  border:'#E5E7EB', text:'#0F172A', muted:'#94A3B8' }

export default function LeadQualityDashboard() {
  const [pageLoading, setPageLoading] = React.useState(true)
  React.useEffect(() => { const t = setTimeout(() => setPageLoading(false), 600); return () => clearTimeout(t) }, [])
  const [selMonth,   setSelMonth]   = useState('All')
  const [selChannel, setSelChannel] = useState('All')

  const filtered = useMemo(() => {
    return RAW.filter(r =>
      (selMonth   === 'All' || r.month   === selMonth) &&
      (selChannel === 'All' || r.channel === selChannel)
    )
  }, [selMonth, selChannel])

  const totals = useMemo(() => {
    return filtered.reduce((acc, r) => ({
      opps:    acc.opps    + r.opps,
      floor:   acc.floor   + r.floor,
      futwork: acc.futwork + r.futwork,
      qls:     acc.qls     + r.qls,
      apps:    acc.apps    + r.apps,
    }), { opps:0, floor:0, futwork:0, qls:0, apps:0 })
  }, [filtered])

  // Monthly trend data (always all months for trend charts)
  const monthlyTrend = useMemo(() => {
    return MONTHS.map(m => {
      const rows = RAW.filter(r => r.month === m && (selChannel === 'All' || r.channel === selChannel))
      const opps    = rows.reduce((s,r) => s+r.opps, 0)
      const futwork = rows.reduce((s,r) => s+r.futwork, 0)
      const qls     = rows.reduce((s,r) => s+r.qls, 0)
      const apps    = rows.reduce((s,r) => s+r.apps, 0)
      return {
        month: m.replace('-2025',''),
        opps, futwork, qls, apps,
        qlPct: futwork > 0 ? +(qls/futwork*100).toFixed(1) : 0,
        appPct: qls > 0 ? +(apps/qls*100).toFixed(1) : 0,
      }
    })
  }, [selChannel])

  // Channel breakdown table
  const channelBreakdown = useMemo(() => {
    const map = {}
    filtered.forEach(r => {
      if (!map[r.channel]) map[r.channel] = {channel:r.channel,opps:0,floor:0,futwork:0,qls:0,apps:0}
      map[r.channel].opps    += r.opps
      map[r.channel].floor   += r.floor
      map[r.channel].futwork += r.futwork
      map[r.channel].qls     += r.qls
      map[r.channel].apps    += r.apps
    })
    return Object.values(map).sort((a,b) => b.opps - a.opps)
  }, [filtered])

  const qlRate   = totals.futwork > 0 ? (totals.qls/totals.futwork*100).toFixed(1) : '0'
  const appRate  = totals.qls > 0     ? (totals.apps/totals.qls*100).toFixed(1) : '0'
  const e2eRate  = totals.opps > 0    ? (totals.apps/totals.opps*100).toFixed(2) : '0'

  const kpis = [
    { label:'Total OPPs',    value: fmt(totals.opps),    sub:'All leads',           cls:'kbl' },
    { label:'Futwork Sent',  value: fmt(totals.futwork), sub:'For qualification',   cls:'kbl' },
    { label:'Floor Direct',  value: fmt(totals.floor),   sub:'Direct to counselor', cls:'kam' },
    { label:'QLs',           value: fmt(totals.qls),     sub:'Qualified leads',     cls:'kgn' },
    { label:'QL Rate',       value: qlRate+'%',           sub:'QLs / Futwork',       cls: parseFloat(qlRate)>=8?'kgn':parseFloat(qlRate)>=5?'kam':'krd' },
    { label:'Apps (STUs)',   value: fmt(totals.apps),    sub:'Uni applications',    cls:'kgn' },
    { label:'App / QL%',     value: appRate+'%',          sub:'Apps / QLs',          cls: parseFloat(appRate)>=20?'kgn':parseFloat(appRate)>=10?'kam':'krd' },
    { label:'OPP → App%',    value: e2eRate+'%',          sub:'End-to-end',          cls:'kor' },
  ]

  if (pageLoading) return (
    <div className={styles.layout}>
      <Sidebar/>
      <DashboardSkeleton/>
    </div>
  )

  return (
    <div className={styles.layout}>
      <Sidebar />
      <div className={styles.main}>

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <p className={styles.breadcrumb}>Dashboards / Lead Quality</p>
            <h1 className={styles.title}>Lead Quality</h1>
          </div>
          <div className={styles.headerRight}>
          <Dropdown minWidth={130} value={selMonth} options={[{ value: 'All', label: 'All Months' }].concat(MONTHS.map((m) => ({ value: m, label: m })))} onChange={(v) => setSelMonth(v)} />
            <Dropdown minWidth={140} value={selChannel} options={[{ value: 'All', label: 'All Channels' }].concat(ALL_CHANNELS.map((c) => ({ value: c, label: c })))} onChange={(v) => setSelChannel(v)} />
          <ExportButton data={channelBreakdown} filename="lead_quality_channels" dashboardId="lead_quality"/>
            <InfoTooltip items={[['Total OPPs','Total raw leads from all sources.'],['Futwork Sent','Leads sent to Futwork agents for qualification.'],['Floor Direct','Leads handled directly by counsellors.'],['QLs','Leads that passed qualification.'],['QL Rate','QLs ÷ Futwork Sent. Benchmark 35–45%.'],['Apps (STUs)','University applications submitted.'],['App/QL%','Applications ÷ Qualified Leads.'],['OPP→APP%','Applications ÷ Total Leads (end-to-end).']]}/>
          <div className={styles.liveChip}>
            <span className={styles.liveDot} />
            BigQuery Data
          </div>
          </div>{/* headerRight */}
        </div>

        <div className={styles.content}>
        <div style={{animation:'fadeUp .3s ease'}}>
        {/* KPIs */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
          {kpis.slice(0,4).map(k => {
            const accentMap = { kbl:C_KPI.navy, kam:C_KPI.amber, kgn:C_KPI.green, krd:'#DC2626' }
            const bgMap     = { kbl:C_KPI.navyBg, kam:C_KPI.amberBg, kgn:C_KPI.greenBg, krd:'#FEF2F2' }
            return <KPICard key={k.label} label={k.label} value={k.value} sub={k.sub}
              accent={accentMap[k.cls]||C_KPI.navy} accentBg={bgMap[k.cls]||C_KPI.navyBg}/>
          })}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
          {kpis.slice(4).map(k => {
            const accentMap = { kbl:C_KPI.blue, kam:C_KPI.amber, kgn:C_KPI.green, krd:'#DC2626' }
            const bgMap     = { kbl:C_KPI.blueBg, kam:C_KPI.amberBg, kgn:C_KPI.greenBg, krd:'#FEF2F2' }
            return <KPICard key={k.label} label={k.label} value={k.value} sub={k.sub}
              accent={accentMap[k.cls]||C_KPI.blue} accentBg={bgMap[k.cls]||C_KPI.blueBg}/>
          })}
        </div>

        {/* Charts Row 1 */}
        <div className={styles.chartsRow}>
          <div className={styles.chartCard}>
            <h3 className={styles.chartTitle}>Monthly OPPs vs Futwork</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyTrend}>
                <defs><BarGrad id="g-b0-1" color="#1C9FD4"/><BarGrad id="g-b0-2" color="#1C9FD4"/></defs>
                <XAxis dataKey="month" tick={{fontSize:10,fill:'#9CA3AF'}} />
                <YAxis tick={{fontSize:10,fill:'#9CA3AF'}} tickFormatter={fmt} />
                <Tooltip {...TOOLTIP} formatter={v => fmt(v)} />
                <Legend wrapperStyle={{fontSize:11}} />
                <Bar dataKey="opps"    name="OPPs"    fill={barFill('g-b0-2')} radius={BAR_RADIUS} fillOpacity={0.85} maxBarSize={BAR_MAX} />
                <Bar dataKey="futwork" name="Futwork" fill={barFill('g-b0-1')} radius={BAR_RADIUS} fillOpacity={0.85} maxBarSize={BAR_MAX} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className={styles.chartCard}>
            <h3 className={styles.chartTitle}>Monthly Apps (STUs) Trend</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={monthlyTrend}>
                <XAxis dataKey="month" tick={{fontSize:10,fill:'#9CA3AF'}} />
                <YAxis tick={{fontSize:10,fill:'#9CA3AF'}} />
                <Tooltip {...TOOLTIP} />
                <Line type="monotone" dataKey="apps" name="Apps" stroke="#4CAE6F" strokeWidth={2.5} dot={{r:4,fill:'#4CAE6F'}} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Charts Row 2 */}
        <div className={styles.chartsRow}>
          <div className={styles.chartCard}>
            <h3 className={styles.chartTitle}>Conversion Funnel</h3>
            <div className={styles.funnel}>
              {[
                {l:'Total OPPs',   v:totals.opps,    c:'#1C9FD4', sub:''},
                {l:'Futwork Sent', v:totals.futwork, c:'#1C9FD4', sub: pct(totals.futwork,totals.opps)+' of OPPs'},
                {l:'Floor Direct', v:totals.floor,   c:'#1C9FD4', sub: pct(totals.floor,totals.opps)+' of OPPs'},
                {l:'QLs',          v:totals.qls,     c:'#F59E0B', sub: pct(totals.qls,totals.futwork)+' of Futwork'},
                {l:'Apps (STUs)',  v:totals.apps,    c:'#4CAE6F', sub: pct(totals.apps,totals.qls)+' of QLs'},
              ].map(s => (
                <div key={s.l} className={styles.fStep}>
                  <span className={styles.fLabel} style={{color:s.c}}>{s.l}</span>
                  <div className={styles.fTrack}>
                    <div className={styles.fBar} style={{
                      width: `${Math.max(s.v/Math.max(totals.opps,1)*100, 3)}%`,
                      background: s.c+'22',
                      borderLeft: `3px solid ${s.c}`
                    }}>
                      <span>{fmt(s.v)}</span>
                    </div>
                  </div>
                  {s.sub && <span className={styles.fPct}>{s.sub}</span>}
                </div>
              ))}
            </div>
          </div>
          <div className={styles.chartCard}>
            <h3 className={styles.chartTitle}>QL Rate by Month</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={monthlyTrend}>
                <XAxis dataKey="month" tick={{fontSize:10,fill:'#9CA3AF'}} />
                <YAxis tick={{fontSize:10,fill:'#9CA3AF'}} tickFormatter={v => v+'%'} />
                <Tooltip {...TOOLTIP} formatter={v => [v+'%','QL Rate']} />
                <Line type="monotone" dataKey="qlPct" name="QL%" stroke="#F59E0B" strokeWidth={2.5} dot={{r:4,fill:'#F59E0B'}} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Channel Table */}
        <div className={styles.tableSection}>
          <div className={styles.tableCard}>
            <div className={styles.tableHeader}>
              <h3 className={styles.tableTitle}>Channel Breakdown</h3>
              <span className={styles.tableCount}>{channelBreakdown.length} channels</span>
            </div>
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Channel</th>
                    <th className={styles.r}>OPPs</th>
                    <th className={styles.r}>Floor</th>
                    <th className={styles.r}>Futwork</th>
                    <th className={styles.r}>QLs</th>
                    <th className={styles.r}>QL%</th>
                    <th className={styles.r}>Apps</th>
                    <th className={styles.r}>App/QL%</th>
                    <th className={styles.r}>OPP→App%</th>
                  </tr>
                </thead>
                <tbody>
                  {channelBreakdown.map(r => {
                    const qlP  = r.futwork > 0 ? (r.qls/r.futwork*100).toFixed(1) : 0
                    const apP  = r.qls     > 0 ? (r.apps/r.qls*100).toFixed(1) : 0
                    const oaP  = r.opps    > 0 ? (r.apps/r.opps*100).toFixed(2) : 0
                    const qlCls = parseFloat(qlP)>=8?styles.pillGn:parseFloat(qlP)>=5?styles.pillAm:styles.pillRd
                    const apCls = parseFloat(apP)>=20?styles.pillGn:parseFloat(apP)>=10?styles.pillAm:styles.pillRd
                    return (
                      <tr key={r.channel}>
                        <td>
                          <span className={styles.chBadge} style={{color:CH_COLORS[r.channel]||'#6B7280',background:(CH_COLORS[r.channel]||'#9CA3AF')+'18'}}>
                            {r.channel}
                          </span>
                        </td>
                        <td className={styles.r}>{fmt(r.opps)}</td>
                        <td className={styles.r}>{fmt(r.floor)}</td>
                        <td className={styles.r}>{fmt(r.futwork)}</td>
                        <td className={styles.r}>{fmt(r.qls)}</td>
                        <td className={styles.r}><span className={qlCls}>{qlP}%</span></td>
                        <td className={styles.r}>{fmt(r.apps)}</td>
                        <td className={styles.r}><span className={apCls}>{apP}%</span></td>
                        <td className={styles.r}>{oaP}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        </div></div>{/* end content */}
      </div>{/* end main */}
    </div>
  )
}
