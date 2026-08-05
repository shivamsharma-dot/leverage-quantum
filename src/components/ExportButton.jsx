import { useState, useRef } from 'react'
import { toast } from './ToastHost'
import Button from './Button'

export default function ExportButton({ data, filename, columns, dashboardId, extraOption, totalRow, rawData, rawTotalRow, slackRich, hideSlack }) {
  const [open, setOpen] = useState(false)
  // When this button sits near the bottom of a scrollable modal (Compare/Trend
  // Analysis, for instance), a menu that always drops DOWN renders past the
  // modal's own overflow:auto edge and gets clipped -- invisible, not just
  // cut short. Measured once at open time: if there isn't enough room below
  // in the actual viewport, flip the menu to open upward instead.
  const [openUp, setOpenUp] = useState(false)
  const wrapRef = useRef(null)
  const toggleOpen = () => {
    if (!open && wrapRef.current) {
      const rect = wrapRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      setOpenUp(spaceBelow < 320 && spaceAbove > spaceBelow)
    }
    setOpen(o => !o)
  }
  const [sheetsBusy, setSheetsBusy] = useState(false)
  const [slackBusy, setSlackBusy] = useState(false)

  // A totals row, when the caller has one, leads the export -- mirroring where it sits on
  // screen (directly under the header) rather than being buried at the bottom of the file.
  // Shared by all four export paths so CSV / JSON / Sheets / Slack can't disagree.
  const allRows = totalRow ? [totalRow, ...(data || [])] : (data || [])
  const colsOf = () => columns || (allRows[0] ? Object.keys(allRows[0]) : [])
  // Optional unformatted twin of the same rows. Display values like "₹2,15,05,881" are
  // text to a spreadsheet -- they can't be summed or sorted numerically -- so callers can
  // supply the underlying numbers alongside them.
  const rawAllRows = rawData ? (rawTotalRow ? [rawTotalRow, ...rawData] : rawData) : null

  // target is explicit rather than a single "send to Slack": an Incoming Webhook is bound to
  // one channel, so the only safe way to test is a separate test webhook, and the confirm
  // names the destination so the team channel is never hit by accident.
  const exportSlack = async (target) => {
    if (!allRows.length) return
    const where = target === 'test' ? 'the TEST Slack channel' : 'the MAIN team Slack channel'
    if (!window.confirm(`Post "${filename || 'this export'}" (${allRows.length} row${allRows.length === 1 ? '' : 's'}) to ${where}?`)) return
    setSlackBusy(true)
    try {
      const cols = colsOf()
      const rows = allRows.map(r => { const o = {}; cols.forEach(c => { o[c] = r[c] ?? '' }); return o })
      const r = await fetch('/api/send-report', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'slack_export', title: filename, columns: cols, rows, sourcePage: filename, dashboardId, slackTarget: target }),
      })
      const resData = await r.json()
      if (!r.ok) throw new Error(resData.error || 'Failed to post to Slack')
      toast('Posted to Slack ' + (resData.channel || ''), { type: 'success' })
      setOpen(false)
    } catch (e) {
      toast(e.message || 'Could not post to Slack', { type: 'muted' })
    } finally {
      setSlackBusy(false)
    }
  }

  // When the page supplies slackRich, "Send to Slack" posts the table as a real image of
  // the on-screen table plus the complete CSV, instead of a monospace code block that
  // Slack truncates on wide tables. See handleSlackExportImage in api/send-report.js.
  const exportSlackRich = async (target) => {
    const where = target === 'test' ? 'the TEST Slack channel' : 'the MAIN team Slack channel'
    if (!window.confirm(`Post "${filename || 'this export'}" as a table image + CSV (${allRows.length} row${allRows.length === 1 ? '' : 's'}) to ${where}?`)) return
    setSlackBusy(true)
    try {
      const payload = await slackRich()
      if (!payload || !payload.pngBase64) throw new Error('Could not render the table image \u2014 narrow the filter or use Export \u2192 CSV')
      const r = await fetch('/api/send-report', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'slack_export_image', dashboardId, slackTarget: target, filename, rowCount: allRows.length, ...payload }),
      })
      const resData = await r.json()
      if (!r.ok) throw new Error(resData.error || 'Failed to post to Slack')
      toast('Posted to Slack ' + (resData.channel || ''), { type: 'success' })
      setOpen(false)
    } catch (e) {
      toast(e.message || 'Could not post to Slack', { type: 'muted' })
    } finally {
      setSlackBusy(false)
    }
  }

  const sendSlack = target => (slackRich ? exportSlackRich(target) : exportSlack(target))

  const exportSheets = async () => {
    if (!allRows.length) return
    setSheetsBusy(true)
    try {
      const cols = colsOf()
      const rows = allRows.map(r => { const o = {}; cols.forEach(c => { o[c] = r[c] ?? '' }); return o })
      const r = await fetch('/api/export-to-sheets', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, rawRows: rawAllRows || undefined, filename, dashboardId }),
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
    if (!allRows.length) return
    writeCsv(colsOf(), allRows, filename)
  }

  const exportCSVRaw = () => {
    if (!rawAllRows || !rawAllRows.length) return
    writeCsv(Object.keys(rawAllRows[0]), rawAllRows, (filename || 'export') + '-raw')
  }

  const writeCsv = (cols, list, name) => {
    const esc = v => {
      const str = v == null ? '' : String(v)
      return /[",\n\r]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str
    }
    const lines = [cols.map(esc).join(','), ...list.map(r => cols.map(c => esc(r[c])).join(','))]
    // The leading \uFEFF is a UTF-8 BOM, and it is load-bearing: without it Excel opens the
    // file in the system legacy encoding, where ₹ (UTF-8 E2 82 B9) renders as "‚Çπ" and an
    // em dash as "‚Äî". The BOM is what makes Excel read it as UTF-8.
    const csv = lines.join('\r\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name || 'export'}_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setOpen(false)
  }

  const exportJSON = () => {
    if (!allRows.length) return
    const blob = new Blob([JSON.stringify(allRows, null, 2)], { type: 'application/json;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename || 'export'}_${new Date().toISOString().slice(0,10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setOpen(false)
  }

  return (
    <div style={{position:'relative'}} ref={wrapRef}>
      <Button
        size="sm" variant="secondary"
        onClick={toggleOpen}
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
            position:'absolute', right:0, zIndex:100,
            ...(openUp ? { bottom:'calc(100% + 6px)' } : { top:'calc(100% + 6px)' }),
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
            {rawAllRows && (
              <button onClick={exportCSVRaw} style={{
                display:'flex', alignItems:'center', gap:9, width:'100%',
                padding:'9px 14px', border:'none', background:'none',
                cursor:'pointer', fontSize:13, fontWeight:500, color:'#111827',
                borderRadius:7, fontFamily:'Inter,sans-serif', textAlign:'left',
                transition:'background .1s'
              }}
              title="Same rows, unformatted -- numbers a spreadsheet can sum and sort"
              onMouseOver={e=>e.currentTarget.style.background='rgba(28,159,212,0.08)'}
              onMouseOut={e=>e.currentTarget.style.background='none'}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0891B2" strokeWidth="2" strokeLinecap="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="8" y1="17" x2="16" y2="17"/>
                </svg>
                Export as CSV (raw numbers)
              </button>
            )}
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
        {!hideSlack && (<>
            <button onClick={() => sendSlack('test')} disabled={slackBusy} style={{
              display:'flex', alignItems:'center', gap:9, width:'100%',
              padding:'9px 14px', border:'none', background:'none',
              cursor: slackBusy ? 'default' : 'pointer', fontSize:13, fontWeight:500, color:'#111827',
              borderRadius:7, fontFamily:'Inter,sans-serif', textAlign:'left',
              transition:'background .1s', opacity: slackBusy ? 0.6 : 1
            }}
            title="Posts to the test channel -- safe for checking formatting"
            onMouseOver={e=>e.currentTarget.style.background='rgba(28,159,212,0.08)'}
            onMouseOut={e=>e.currentTarget.style.background='none'}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>
              </svg>
              {slackBusy ? 'Posting…' : 'Send to Slack — test channel'}
            </button>
            <button onClick={() => sendSlack('prod')} disabled={slackBusy} style={{
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
              {slackBusy ? 'Posting…' : 'Send to Slack — main channel'}
            </button>
        </>)}
            {extraOption && (
              <button onClick={extraOption.onClick} disabled={extraOption.busy} style={{
                display:'flex', alignItems:'center', gap:9, width:'100%',
                padding:'9px 14px', border:'none', background:'none',
                cursor: extraOption.busy ? 'default' : 'pointer', fontSize:13, fontWeight:500, color:'#111827',
                borderRadius:7, fontFamily:'Inter,sans-serif', textAlign:'left',
                transition:'background .1s', opacity: extraOption.busy ? 0.6 : 1
              }}
              onMouseOver={e=>e.currentTarget.style.background='rgba(28,159,212,0.08)'}
              onMouseOut={e=>e.currentTarget.style.background='none'}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1F3C84" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
                </svg>
                {extraOption.busy ? (extraOption.busyLabel || 'Working…') : extraOption.label}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
