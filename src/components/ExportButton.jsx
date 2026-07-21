import { useState } from 'react'
import { toast } from './ToastHost'
import Button from './Button'

export default function ExportButton({ data, filename, columns, dashboardId }) {
  const [open, setOpen] = useState(false)
  const [sheetsBusy, setSheetsBusy] = useState(false)
  const [slackBusy, setSlackBusy] = useState(false)

  const exportSlack = async () => {
    if (!data || data.length === 0) return
    if (!window.confirm(`Post "${filename || 'this export'}" (${data.length} row${data.length === 1 ? '' : 's'}) to the team Slack channel?`)) return
    setSlackBusy(true)
    try {
      const cols = columns || Object.keys(data[0])
      const rows = data.map(r => { const o = {}; cols.forEach(c => { o[c] = r[c] ?? '' }); return o })
      const r = await fetch('/api/send-report', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'slack_export', title: filename, columns: cols, rows, sourcePage: filename, dashboardId }),
      })
      const resData = await r.json()
      if (!r.ok) throw new Error(resData.error || 'Failed to post to Slack')
      toast('Posted to Slack', { type: 'success' })
      setOpen(false)
    } catch (e) {
      toast(e.message || 'Could not post to Slack', { type: 'muted' })
    } finally {
      setSlackBusy(false)
    }
  }

  const exportSheets = async () => {
    if (!data || data.length === 0) return
    setSheetsBusy(true)
    try {
      const cols = columns || Object.keys(data[0])
      const rows = data.map(r => { const o = {}; cols.forEach(c => { o[c] = r[c] ?? '' }); return o })
      const r = await fetch('/api/export-to-sheets', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, filename, dashboardId }),
      })
      const resData = await r.json()
      if (!r.ok) throw new Error(resData.error || 'Failed to export to Google Sheets')
      window.open(resData.url, '_blank')
      toast('Google Sheet created', { type: 'success' })
      setOpen(false)
    } catch (e) {
      toast(e.message || 'Could not export to Google Sheets', { type: 'muted' })
    } finally {
      setSheetsBusy(false)
    }
  }

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
      <Button
        size="sm" variant="secondary"
        onClick={() => setOpen(o => !o)}
        icon={
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        }
      >
        Export
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </Button>

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
            onMouseOver={e=>e.currentTarget.style.background='rgba(28,159,212,0.08)'}
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
            onMouseOver={e=>e.currentTarget.style.background='rgba(28,159,212,0.08)'}
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
            <button onClick={exportSheets} disabled={sheetsBusy} style={{
              display:'flex', alignItems:'center', gap:9, width:'100%',
              padding:'9px 14px', border:'none', background:'none',
              cursor: sheetsBusy ? 'default' : 'pointer', fontSize:13, fontWeight:500, color:'#111827',
              borderRadius:7, fontFamily:'Inter,sans-serif', textAlign:'left',
              transition:'background .1s', opacity: sheetsBusy ? 0.6 : 1
            }}
            onMouseOver={e=>e.currentTarget.style.background='rgba(28,159,212,0.08)'}
            onMouseOut={e=>e.currentTarget.style.background='none'}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0F9D58" strokeWidth="2" strokeLinecap="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="9" y1="13" x2="15" y2="13"/>
                <line x1="9" y1="17" x2="13" y2="17"/>
              </svg>
              {sheetsBusy ? 'Creating sheet…' : 'Export to Google Sheets'}
            </button>
            <button onClick={exportSlack} disabled={slackBusy} style={{
              display:'flex', alignItems:'center', gap:9, width:'100%',
              padding:'9px 14px', border:'none', background:'none',
              cursor: slackBusy ? 'default' : 'pointer', fontSize:13, fontWeight:500, color:'#111827',
              borderRadius:7, fontFamily:'Inter,sans-serif', textAlign:'left',
              transition:'background .1s', opacity: slackBusy ? 0.6 : 1
            }}
            onMouseOver={e=>e.currentTarget.style.background='rgba(28,159,212,0.08)'}
            onMouseOut={e=>e.currentTarget.style.background='none'}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4A154B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>
              </svg>
              {slackBusy ? 'Posting…' : 'Send to Slack'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
