import { useState } from 'react'

export default function ExportButton({ data, filename, columns }) {
  const [open, setOpen] = useState(false)

  const exportCSV = () => {
    if (!data || data.length === 0) return
    const cols = columns || Object.keys(data[0])
    const header = cols.join(',')
    const rows = data.map(r => cols.map(c => {
      const v = r[c] ?? ''
      return typeof v === 'string' && v.includes(',') ? `"${v}"` : v
    }).join(','))
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename || 'export'}_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setOpen(false)
  }

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename || 'export'}_${new Date().toISOString().slice(0,10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setOpen(false)
  }

  return (
    <div style={{position:'relative'}}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display:'flex', alignItems:'center', gap:6,
          padding:'7px 13px', borderRadius:8,
          background:'#fff', border:'1px solid #E5E7EB',
          color:'#374151', fontSize:12.5, fontWeight:600,
          cursor:'pointer', fontFamily:'Inter,sans-serif',
          boxShadow:'0 1px 2px rgba(0,0,0,0.04)',
          transition:'all .15s'
        }}
        onMouseOver={e=>e.currentTarget.style.borderColor='#1C9FD4'}
        onMouseOut={e=>e.currentTarget.style.borderColor='#E5E7EB'}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Export
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{position:'fixed',inset:0,zIndex:99}}/>
          <div style={{
            position:'absolute', top:'calc(100% + 6px)', right:0, zIndex:100,
            background:'#fff', border:'1px solid #E5E7EB', borderRadius:10,
            boxShadow:'0 8px 24px rgba(0,0,0,0.12)', padding:6, minWidth:150
          }}>
            <button onClick={exportCSV} style={{
              display:'flex', alignItems:'center', gap:9, width:'100%',
              padding:'9px 14px', border:'none', background:'none',
              cursor:'pointer', fontSize:13, fontWeight:500, color:'#111827',
              borderRadius:7, fontFamily:'Inter,sans-serif', textAlign:'left',
              transition:'background .1s'
            }}
            onMouseOver={e=>e.currentTarget.style.background='#F9FAFB'}
            onMouseOut={e=>e.currentTarget.style.background='none'}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              Export as CSV
            </button>
            <button onClick={exportJSON} style={{
              display:'flex', alignItems:'center', gap:9, width:'100%',
              padding:'9px 14px', border:'none', background:'none',
              cursor:'pointer', fontSize:13, fontWeight:500, color:'#111827',
              borderRadius:7, fontFamily:'Inter,sans-serif', textAlign:'left',
              transition:'background .1s'
            }}
            onMouseOver={e=>e.currentTarget.style.background='#F9FAFB'}
            onMouseOut={e=>e.currentTarget.style.background='none'}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2" strokeLinecap="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
              Export as JSON
            </button>
          </div>
        </>
      )}
    </div>
  )
}
