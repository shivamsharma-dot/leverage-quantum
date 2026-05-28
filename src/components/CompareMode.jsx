import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const MONTHS = ['Jan-2025','Feb-2025','Mar-2025','Apr-2025','May-2025','Jun-2025',
  'Jul-2025','Aug-2025','Sep-2025','Oct-2025','Nov-2025','Dec-2025']

const SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const METRICS = [
  { id:'spend',     label:'Ad Spend',     format: v => v > 0 ? '₹' + (v/1e7).toFixed(2) + ' Cr' : '—' },
  { id:'opps',      label:'OPPs',         format: v => v > 0 ? (v/1e5).toFixed(2) + 'L' : '—' },
  { id:'qls',       label:'QLs',          format: v => v > 0 ? (v/1000).toFixed(1) + 'K' : '—' },
  { id:'cpl',       label:'CPL',          format: v => v > 0 ? '₹' + v.toLocaleString('en-IN') : '—' },
  { id:'roas',      label:'ROAS',         format: v => v > 0 ? v + 'x' : '—' },
  { id:'total_rev', label:'Revenue',      format: v => v > 0 ? '₹' + (v/1e7).toFixed(2) + ' Cr' : '—' },
  { id:'ql_pct',    label:'QL%',          format: v => v > 0 ? v + '%' : '—' },
]

export default function CompareMode({ monthlyData, onClose }) {
  const [m1, setM1] = useState('Jan-2025')
  const [m2, setM2] = useState('Aug-2025')
  const [metric, setMetric] = useState('spend')

  const d1 = monthlyData.find(m => m.month === m1) || {}
  const d2 = monthlyData.find(m => m.month === m2) || {}
  const sel = METRICS.find(m => m.id === metric)

  const delta = (a, b) => {
    if (!a || !b || a === 0) return null
    const pct = ((b - a) / a * 100).toFixed(1)
    return { pct, up: b > a }
  }

  const chartData = METRICS.map(m => ({
    name: m.label,
    [m1.replace('-2025','')]: d1[m.id] || 0,
    [m2.replace('-2025','')]: d2[m.id] || 0,
  }))

  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(10,22,40,0.7)', zIndex:1000,
      display:'flex', alignItems:'center', justifyContent:'center', padding:24
    }}>
      <div style={{
        background:'#fff', borderRadius:16, width:'100%', maxWidth:860,
        maxHeight:'90vh', overflow:'auto', boxShadow:'0 24px 60px rgba(0,0,0,0.25)'
      }}>
        {/* Header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'20px 24px',borderBottom:'1px solid #F3F4F6'}}>
          <div>
            <h2 style={{fontSize:16,fontWeight:700,color:'#111827',margin:0}}>Comparison Mode</h2>
            <p style={{fontSize:12,color:'#9CA3AF',margin:'3px 0 0'}}>Compare any two months side by side</p>
          </div>
          <button onClick={onClose} style={{background:'#F3F4F6',border:'none',borderRadius:8,width:32,height:32,cursor:'pointer',fontSize:16,color:'#6B7280',display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
        </div>

        <div style={{padding:24}}>
          {/* Month selectors */}
          <div style={{display:'flex',gap:12,marginBottom:20,alignItems:'center',flexWrap:'wrap'}}>
            <div>
              <p style={{fontSize:10,fontWeight:600,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:5}}>Month A</p>
              <select value={m1} onChange={e=>setM1(e.target.value)}
                style={{padding:'8px 32px 8px 12px',border:'2px solid #6366F1',borderRadius:8,fontSize:13,fontFamily:'Inter,sans-serif',color:'#111827',outline:'none',background:'#EEF2FF',fontWeight:600,appearance:'none'}}>
                {MONTHS.map(m=><option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div style={{fontSize:18,color:'#9CA3AF',marginTop:16}}>vs</div>
            <div>
              <p style={{fontSize:10,fontWeight:600,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:5}}>Month B</p>
              <select value={m2} onChange={e=>setM2(e.target.value)}
                style={{padding:'8px 32px 8px 12px',border:'2px solid #10B981',borderRadius:8,fontSize:13,fontFamily:'Inter,sans-serif',color:'#111827',outline:'none',background:'#ECFDF5',fontWeight:600,appearance:'none'}}>
                {MONTHS.map(m=><option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div style={{marginLeft:'auto'}}>
              <p style={{fontSize:10,fontWeight:600,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:5}}>Chart Metric</p>
              <select value={metric} onChange={e=>setMetric(e.target.value)}
                style={{padding:'8px 12px',border:'1px solid #E5E7EB',borderRadius:8,fontSize:13,fontFamily:'Inter,sans-serif',color:'#111827',outline:'none',background:'#fff'}}>
                {METRICS.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
          </div>

          {/* KPI comparison grid */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:24}}>
            {METRICS.map(m => {
              const v1 = d1[m.id] || 0
              const v2 = d2[m.id] || 0
              const d = delta(v1, v2)
              return (
                <div key={m.id} style={{background:'#F9FAFB',borderRadius:10,padding:'12px 14px',border:'1px solid #F3F4F6'}}>
                  <p style={{fontSize:10,fontWeight:600,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:8}}>{m.label}</p>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',gap:6}}>
                    <div>
                      <p style={{fontSize:10,color:'#6366F1',fontWeight:600,marginBottom:2}}>{m1.replace('-2025','')}</p>
                      <p style={{fontSize:14,fontWeight:700,color:'#111827'}}>{m.format(v1)}</p>
                    </div>
                    {d && <span style={{fontSize:10,fontWeight:700,padding:'2px 6px',borderRadius:4,background:d.up?'#DCFCE7':'#FEE2E2',color:d.up?'#059669':'#DC2626'}}>{d.up?'▲':'▼'}{Math.abs(d.pct)}%</span>}
                    <div style={{textAlign:'right'}}>
                      <p style={{fontSize:10,color:'#10B981',fontWeight:600,marginBottom:2}}>{m2.replace('-2025','')}</p>
                      <p style={{fontSize:14,fontWeight:700,color:'#111827'}}>{m.format(v2)}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Bar chart */}
          <div style={{background:'#F9FAFB',borderRadius:12,padding:'16px',border:'1px solid #F3F4F6'}}>
            <p style={{fontSize:12,fontWeight:600,color:'#374151',marginBottom:12}}>All metrics comparison — {m1.replace('-2025','')} vs {m2.replace('-2025','')}</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{left:0,right:0,top:0,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6"/>
                <XAxis dataKey="name" tick={{fontSize:10,fill:'#9CA3AF'}} axisLine={false} tickLine={false}/>
                <YAxis hide/>
                <Tooltip contentStyle={{borderRadius:8,border:'1px solid #E5E7EB',fontSize:11}}/>
                <Legend wrapperStyle={{fontSize:11}}/>
                <Bar dataKey={m1.replace('-2025','')} fill="#6366F1" radius={[4,4,0,0]}/>
                <Bar dataKey={m2.replace('-2025','')} fill="#10B981" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}
