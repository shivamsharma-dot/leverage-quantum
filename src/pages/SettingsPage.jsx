import React, { useState, useEffect, useRef } from 'react'
import Sidebar, { PAGE_LIST } from '../components/Sidebar'
import { useAuth, getAccessList, addUserAccess, removeUserAccess, updateUserRole } from '../hooks/useAuth'
import { getActivityLog } from '../components/ActivityLogger.js'
import styles from './SettingsPage.module.css'

const RL_SB_URL = 'https://tsyekthwthxszmsgqfej.supabase.co'
const RL_SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzeWVrdGh3dGh4c3ptc2dxZmVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NjkzMDIsImV4cCI6MjA5NTM0NTMwMn0.bdM9h5c3PDu9hgggjBdbA-eb7kfF-79c6txOnCUxRhY'
async function getReportLogs(limit = 200) {
  try {
    const res = await fetch(
      `${RL_SB_URL}/rest/v1/report_logs?select=*&order=sent_at.desc&limit=${limit}`,
      { headers: { apikey: RL_SB_KEY, Authorization: `Bearer ${RL_SB_KEY}` } }
    )
    if (!res.ok) return []
    return await res.json()
  } catch { return [] }
}

const getRoleMeta = (role) => {
  if (role === 'admin') return { label: 'Admin', color: '#1F3C84', bg: '#E8EFF9' }
  if (role === 'viewer') return { label: 'Viewer', color: '#1C9FD4', bg: '#E3F5FD' }
  // viewer:home,meta_ads,... or custom:... => Custom badge
  if (typeof role === 'string' && (role.startsWith('viewer:') || role.startsWith('custom:'))) {
    return { label: 'Custom', color: '#29B9C3', bg: '#E4F8F9' }
  }
  return { label: 'Viewer', color: '#1C9FD4', bg: '#E3F5FD' }
}

const DASHBOARDS = PAGE_LIST.filter(p => p.id !== 'settings')

const DATA_SOURCES = [
  { name: 'Meta Graph API',       src: 'act_641914389215638', rows: 'live' },
  { name: 'Google Ads API', src: 'Google Ads Account (env-configured)', rows: 'live' },
  { name: 'Referral Sheet',       editKey: 'sheet_url_referral', rows: 'live', defaultUrl: 'https://docs.google.com/spreadsheets/d/1r-e6pBCN5ysfeD3Eq6sxgLmf97mdeTtloMPylqnx6Ew/gviz/tq?tqx=out:csv&sheet=Referral' },
  { name: 'QL Ops Sheet (Daily)', editKey: 'sheet_url_qlops_daily', rows: 'live', defaultUrl: 'https://docs.google.com/spreadsheets/d/1r-e6pBCN5ysfeD3Eq6sxgLmf97mdeTtloMPylqnx6Ew/gviz/tq?tqx=out:csv&sheet=Qlops' },
  { name: 'QL Snapshot Sheet (Monthly)', editKey: 'sheet_url_qlops_monthly', rows: 'live', defaultUrl: 'https://docs.google.com/spreadsheets/d/1r-e6pBCN5ysfeD3Eq6sxgLmf97mdeTtloMPylqnx6Ew/gviz/tq?tqx=out:csv&sheet=QLSnapshot' },
  { name: 'WhatsApp Sheet',       editKey: 'sheet_url_whatsapp', rows: 'live', defaultUrl: 'https://docs.google.com/spreadsheets/d/1r-e6pBCN5ysfeD3Eq6sxgLmf97mdeTtloMPylqnx6Ew/gviz/tq?tqx=out:csv&sheet=whatsapp' },
  { name: 'FB Leads / CRM Sheet', editKey: 'sheet_url_fbleads', rows: 'live', defaultUrl: 'https://docs.google.com/spreadsheets/d/1r-e6pBCN5ysfeD3Eq6sxgLmf97mdeTtloMPylqnx6Ew/gviz/tq?tqx=out:csv&sheet=FBleads', apiPath: '/api/crm-leads' },
  { name: 'Leads Assigned Sheet', editKey: 'sheet_url_leads_assigned', rows: 'live', defaultUrl: 'https://docs.google.com/spreadsheets/d/1r-e6pBCN5ysfeD3Eq6sxgLmf97mdeTtloMPylqnx6Ew/gviz/tq?tqx=out:csv&sheet=Leadassigned' },  { name: 'Google Ads CRM Leads Sheet', editKey: 'sheet_url_googleleads', rows: 'live', defaultUrl: 'https://docs.google.com/spreadsheets/d/1r-e6pBCN5ysfeD3Eq6sxgLmf97mdeTtloMPylqnx6Ew/gviz/tq?tqx=out:csv&sheet=googleleads' },
  { name: 'Cross-Channel Sheet',  src: 'aiContext.js',        rows: 'live' },
    ]

// Mini SVG icon renderer for KPI icon picker
function KpiIconPreview({ name, color = '#94A3B8' }) {
  const s = { width:16, height:16, viewBox:'0 0 24 24', fill:'none', stroke: color, strokeWidth:2, strokeLinecap:'round', strokeLinejoin:'round' }
  const icons = {
    'rupee':       <svg {...s}><path d="M6 3h12M6 8h12M6 13l9 8"/><path d="M6 8a6 6 0 000 5h4"/></svg>,
    'dollar':      <svg {...s}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
    'wallet':      <svg {...s}><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
    'card':        <svg {...s}><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/><line x1="5" y1="15" x2="9" y2="15"/></svg>,
    'chart-bar':   <svg {...s}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
    'users':       <svg {...s}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
    'person':      <svg {...s}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
    'funnel':      <svg {...s}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
    'target':      <svg {...s}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
    'star':        <svg {...s}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
    'percent':     <svg {...s}><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>,
    'trending':    <svg {...s}><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>,
    'activity':    <svg {...s}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
    'pulse':       <svg {...s}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
    'zap':         <svg {...s}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
    'trending-up': <svg {...s}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
    'coin':        <svg {...s}><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>,
    'gift':        <svg {...s}><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/></svg>,
    'building':    <svg {...s}><rect x="4" y="2" width="16" height="20"/><line x1="9" y1="22" x2="9" y2="12"/><line x1="15" y1="22" x2="15" y2="12"/><rect x="9" y="7" width="2" height="2"/><rect x="13" y="7" width="2" height="2"/></svg>,
    'check':       <svg {...s}><polyline points="20 6 9 17 4 12"/></svg>,
    'message':     <svg {...s}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
    'mail':        <svg {...s}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/></svg>,
    'send':        <svg {...s}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
    'bell':        <svg {...s}><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>,
    'chat':        <svg {...s}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
    'grid':        <svg {...s}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
    'layers':      <svg {...s}><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>,
    'cube':        <svg {...s}><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
    'diamond':     <svg {...s}><path d="M6 3h12l4 6-10 13L2 9z"/><path d="M2 9h20"/></svg>,
    'eye':         <svg {...s}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  }
  return icons[name] || icons['grid']
}

export default function SettingsPage() {
  const { user } = useAuth()
  const userIsAdmin = user?.role === 'admin'
  const [activeTab, setActiveTab] = useState(userIsAdmin ? 'data' : 'profile')
  const [copied, setCopied] = useState(false)

  // Open a specific tab when navigated with ?tab=... (e.g. role badge -> profile)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('tab');
    if (requested && ['data','users','activity','reports','appearance','profile'].includes(requested)) setActiveTab(requested);
  }, []);

  const _actRef = useRef(false)
  useEffect(() => {
    if (activeTab === 'activity' && userIsAdmin && !_actRef.current) { _actRef.current=true; loadActivity() }
  }, [activeTab, userIsAdmin])

  // Activity
  const [activityLog, setActivityLog] = useState([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [actSearch, setActSearch] = useState('')
  const loadActivity = async () => {
    setActivityLoading(true)
    setActivityLog(await getActivityLog(500))
    setActivityLoading(false)
  }

  // Report Activity Log (send history — sent/skipped/failed, incl. cron + GitHub Actions triggers)
  const _rlRef = useRef(false)
  useEffect(() => {
    if (activeTab === 'reports' && userIsAdmin && !_rlRef.current) { _rlRef.current=true; loadReportLogs() }
  }, [activeTab, userIsAdmin])
  const [reportLogsList, setReportLogsList] = useState([])
  const [reportLogsLoading, setReportLogsLoading] = useState(false)
  const loadReportLogs = async () => {
    setReportLogsLoading(true)
    setReportLogsList(await getReportLogs(200))
    setReportLogsLoading(false)
  }
// Published-sheet connector (admin-configurable CSV URLs)
    const [sheetUrls, setSheetUrls] = useState({})
    const [sheetInputs, setSheetInputs] = useState({})
    const [sheetSaving, setSheetSaving] = useState({})
    const [sheetMsg, setSheetMsg] = useState({}); const [editingSheet, setEditingSheet] = useState(null)
    const [sheetTest, setSheetTest] = useState({}) // { [key]: { loading, error, columns, columnCount, rowCount, ts } }

  
  // SR Fee
  const [srFeeInput, setSrFeeInput] = useState(() => localStorage.getItem('lq_sr_fee') || '90000')

  // ── Appearance (admin only, server-backed) ────────────────────────────────
  // Server state (what's actually saved)
  const [savedHiddenPages, setSavedHiddenPages] = useState([])
  // Pending state (local changes not yet saved)
  const [hiddenPages, setHiddenPages] = useState([])
  const [prefSaving, setPrefSaving] = useState(false)
  const [prefSaveMsg, setPrefSaveMsg] = useState(null) // { type: 'ok'|'err', text }
  const [prefLoading, setPrefLoading] = useState(true)

  // Load from server on mount (admin only)
  React.useEffect(() => {
    if (!userIsAdmin) { setPrefLoading(false); return }
    fetch('/api/preferences', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { prefs: {} })
      .then(data => {
        const hp = data.prefs?.hidden_pages || []
        const pf = data.prefs || {}
        if (pf.report_from_name != null) setRcName(pf.report_from_name)
        if (pf.report_from_email != null) setRcEmail(pf.report_from_email)
        if (pf.report_subjects) setRcSubjects({ daily: pf.report_subjects.daily || '', weekly: pf.report_subjects.weekly || '', monthly: pf.report_subjects.monthly || '' })
        if (pf.auto_reports_enabled != null) setRcAuto(pf.auto_reports_enabled !== false)
        setSavedHiddenPages(hp)
        setHiddenPages(hp)
        // Also sync to localStorage so Sidebar gets it immediately
        localStorage.setItem('lq_hidden_pages', JSON.stringify(hp))
        window.dispatchEvent(new CustomEvent('lq:hidden-pages-changed', { detail: hp }))
                  const su = {}
                  ;['sheet_url_referral','sheet_url_qlops_daily','sheet_url_qlops_monthly','sheet_url_whatsapp','sheet_url_fbleads','sheet_url_leads_assigned','sheet_url_googleleads'].forEach(k => { if (pf[k]) su[k] = pf[k] })
                  setSheetUrls(su)
                  setSheetInputs(su)
      })
      .catch(() => {})
      .finally(() => setPrefLoading(false))
  }, [userIsAdmin])

  const togglePageVisibility = (pageId) => {
    setHiddenPages(prev =>
      prev.includes(pageId) ? prev.filter(id => id !== pageId) : [...prev, pageId]
    )
    setPrefSaveMsg(null) // Clear previous save message
  }

  const hasPendingChanges = JSON.stringify([...hiddenPages].sort()) !== JSON.stringify([...savedHiddenPages].sort())

  const saveHiddenPages = async () => {
    setPrefSaving(true)
    setPrefSaveMsg(null)
    try {
      const r = await fetch('/api/preferences', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'hidden_pages', value: hiddenPages }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed')
      setSavedHiddenPages(hiddenPages)
      // Sync to localStorage + broadcast to Sidebar immediately
      localStorage.setItem('lq_hidden_pages', JSON.stringify(hiddenPages))
      window.dispatchEvent(new CustomEvent('lq:hidden-pages-changed', { detail: hiddenPages }))
      setPrefSaveMsg({ type: 'ok', text: 'Saved — sidebar updated for all users' })
    } catch (e) {
      setPrefSaveMsg({ type: 'err', text: e.message })
    } finally {
      setPrefSaving(false)
    }
  }

      // Splits one CSV line respecting quoted commas (mirrors api/crm-leads.js's splitCsvLine).
      const splitCsvLineClient = (line) => {
        const out = []; let cur = ''; let q = false
        for (let i = 0; i < line.length; i++) {
          const ch = line[i]
          if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else { q = false } } else cur += ch }
          else { if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = '' } else cur += ch }
        }
        out.push(cur)
        return out
      }

      // Best-effort date parser covering the two formats seen across these sheets
      // (DD-Mon-YYYY like '02-Jul-2026', and plain YYYY-MM-DD) so date-coverage
      // diagnostics work generically without hardcoding a column format per sheet.
      const MONTH_ABBR = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 }
      const parseAnyDate = (str) => {
        const s = String(str || '').trim()
        if (!s) return null
        let m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/)
        if (m) { const mon = MONTH_ABBR[m[2].toLowerCase()]; return mon != null ? new Date(+m[3], mon, +m[1]) : null }
        m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
        if (m) return new Date(+m[1], +m[2] - 1, +m[3])
        return null
      }

      // Fetches the sheet's CSV fresh and uncached (bypasses sheetCache entirely -- the
      // whole point is to prove the connection is live *right now*, not show cached data),
      // reports header columns + row count, and -- if a date-like column is found --
      // a month-by-month row-count breakdown. This is the self-service version of the
      // manual diagnosis (raw curl vs our own API) that caught the FBleads sheet only
      // publishing one month of data: a narrow date spread now shows up here directly,
      // with a warning suggesting the likely cause (an active Filter on the sheet tab).
      // When the source also has a backend API route (apiPath, e.g. FBleads ->
      // /api/crm-leads), a second cache-busted call to that route is compared against
      // the direct-sheet numbers so a stale server-side/CDN cache is visible too --
      // exactly the Vercel edge-cache staleness that made Month-on-Month look wrong
      // even after the sheet itself was already fixed.
      const testSheetConnection = async (s) => {
        const key = s.editKey
        const url = sheetUrls[key] || s.defaultUrl
        if (!url) { setSheetTest(prev => ({ ...prev, [key]: { error: 'No sheet URL configured' } })); return }
        setSheetTest(prev => ({ ...prev, [key]: { loading: true } }))
        try {
          const bust = url + (url.includes('?') ? '&' : '?') + '_=' + Date.now()
          const r = await fetch(bust, { cache: 'no-store' })
          if (!r.ok) throw new Error('HTTP ' + r.status)
          const text = await r.text()
          const lines = text.split(/\r?\n/).filter(l => l.length > 0)
          if (lines.length < 1) throw new Error('Empty response')
          const columns = splitCsvLineClient(lines[0]).map(h => h.trim())
          const dateColIdx = columns.findIndex(c => /date/i.test(c))
          let dateCol = null, monthCounts = null, minDate = null, maxDate = null
          if (dateColIdx !== -1) {
            const counts = {}
            for (let i = 1; i < lines.length; i++) {
              const cols = splitCsvLineClient(lines[i])
              const d = parseAnyDate(cols[dateColIdx])
              if (!d) continue
              const key2 = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
              counts[key2] = (counts[key2] || 0) + 1
              if (!minDate || d < minDate) minDate = d
              if (!maxDate || d > maxDate) maxDate = d
            }
            const entries = Object.entries(counts).sort((a, b) => a[0] < b[0] ? 1 : -1)
            if (entries.length) { dateCol = columns[dateColIdx]; monthCounts = entries }
          }
          let apiCompare = null
          if (s.apiPath) {
            try {
              const ar = await fetch(s.apiPath + '?_=' + Date.now(), { credentials: 'include', cache: 'no-store' })
              if (ar.ok) {
                const aj = await ar.json()
                const apiDates = Object.keys(aj.byDate || {}).sort()
                apiCompare = { rows: aj.rows, firstDate: apiDates[0] || null, lastDate: apiDates[apiDates.length - 1] || null, distinctDates: apiDates.length }
              }
            } catch {}
          }
          setSheetTest(prev => ({ ...prev, [key]: { columns, columnCount: columns.length, rowCount: lines.length - 1, dateCol, monthCounts, minDate, maxDate, apiCompare, ts: Date.now() } }))
        } catch (e) {
          setSheetTest(prev => ({ ...prev, [key]: { error: e.message || 'Fetch failed' } }))
        }
      }

      const saveSheetUrl = async (key) => {
              const url = (sheetInputs[key] || '').trim()
              setSheetSaving(prev => ({ ...prev, [key]: true }))
              setSheetMsg(prev => ({ ...prev, [key]: null }))
              try {
                        const r = await fetch('/api/preferences', {
                                    method: 'POST',
                                    credentials: 'include',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ key, value: url }),
                        })
                        const data = await r.json()
                        if (!r.ok) throw new Error(data.error || 'Failed')
                        setSheetUrls(prev => ({ ...prev, [key]: url }))
                        setSheetMsg(prev => ({ ...prev, [key]: { type: 'ok', text: 'Saved' } }))
              } catch (e) {
                        setSheetMsg(prev => ({ ...prev, [key]: { type: 'err', text: e.message } }))
              } finally {
                        setSheetSaving(prev => ({ ...prev, [key]: false }))
              }
      }

  const [activeTheme, setActiveTheme] = useState(() => localStorage.getItem('lq_theme') || 'light')
  const applyTheme = (themeId) => {
    setActiveTheme(themeId)
    localStorage.setItem('lq_theme', themeId)
    document.documentElement.setAttribute('data-theme', themeId)
  }
  // Apply saved theme on mount
  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', activeTheme)
  }, [])

  const THEMES = [
    {
      id: 'light',
      name: 'Light',
      desc: 'Clean white — the default',
      preview: ['#F4F6F9', '#FFFFFF', '#1F3C84'],
    },
    {
      id: 'dark',
      name: 'Dark',
      desc: 'Dark slate — easy on the eyes',
      preview: ['#0F172A', '#1E293B', '#1C9FD4'],
    },
    {
      id: 'navy',
      name: 'Navy Depth',
      desc: 'Deep navy — premium dashboard look',
      preview: ['#0D1B40', '#162155', '#29B9C3'],
    },
    {
      id: 'stone',
      name: 'Stone',
      desc: 'Warm neutral — calm and focused',
      preview: ['#F5F5F0', '#FAFAF8', '#1F3C84'],
    },
  ]

  // KPI icon preferences (per metric slot)
  const [kpiIcons, setKpiIcons] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lq_kpi_icons') || '{}') } catch { return {} }
  })

  // ── Layout preferences ───────────────────────────────────────────────────
  const [sidebarMode, setSidebarMode] = useState(() => localStorage.getItem('lq_sidebar_mode') || 'default')
  const applySidebarMode = (mode) => {
    setSidebarMode(mode)
    localStorage.setItem('lq_sidebar_mode', mode)
    // Collapse state: icon-only = collapsed=true, default/wide = collapsed=false
    const collapsed = mode === 'compact'
    localStorage.setItem('lq_sidebar_collapsed', String(collapsed))
    window.dispatchEvent(new CustomEvent('lq:sidebar-mode-changed', { detail: { mode, collapsed } }))
  }

  const SIDEBAR_MODES = [
    { id: 'compact',  label: 'Compact',  desc: 'Icon-only — maximum data space',     icon: '⟵' },
    { id: 'default',  label: 'Default',  desc: '232px — labels + icons',              icon: '☰' },
    { id: 'wide',     label: 'Wide',     desc: '280px — more breathing room',          icon: '⟹' },
  ]

  // Number format
  const [numberFormat, setNumberFormat] = useState(() => localStorage.getItem('lq_number_format') || 'indian')
  const applyNumberFormat = (fmt) => {
    setNumberFormat(fmt)
    localStorage.setItem('lq_number_format', fmt)
    window.dispatchEvent(new CustomEvent('lq:number-format-changed', { detail: fmt }))
  }
  const NUMBER_FORMATS = [
    { id: 'indian',       label: 'Indian',       example: '₹1,00,000 · 6.1L · 1.2Cr',  desc: 'Lakh / Crore notation' },
    { id: 'international',label: 'International', example: '₹100,000 · 61K · 1.2M',     desc: 'Thousand / Million' },
    { id: 'compact',      label: 'Compact',       example: '₹1L · ₹1Cr · 61K',          desc: 'Always abbreviated' },
  ]

  // Default date range
  const [defaultDateRange, setDefaultDateRange] = useState(() => localStorage.getItem('lq_default_date') || 'last_7d')
  const applyDefaultDate = (range) => {
    setDefaultDateRange(range)
    localStorage.setItem('lq_default_date', range)
  }
  const DATE_RANGES = [
    { id: 'yesterday',  label: 'Yesterday',       desc: 'Prior day only' },
    { id: 'last_7d',    label: 'Last 7 days',      desc: 'Rolling 7-day window' },
    { id: 'last_30d',   label: 'Last 30 days',     desc: 'Rolling 30-day window' },
    { id: 'mtd',        label: 'Month to date',    desc: 'Current month so far' },
    { id: 'last_month', label: 'Last month',       desc: 'Previous full month' },
  ]

  // Table density
  const [tableDensity, setTableDensity] = useState(() => localStorage.getItem('lq_table_density') || 'comfortable')
  const applyDensity = (d) => {
    setTableDensity(d)
    localStorage.setItem('lq_table_density', d)
    document.documentElement.setAttribute('data-density', d)
    window.dispatchEvent(new CustomEvent('lq:density-changed', { detail: d }))
  }
  React.useEffect(() => {
    document.documentElement.setAttribute('data-density', tableDensity)
  }, [])
  const DENSITIES = [
    { id: 'compact',      label: 'Compact',      rowH: '10px 12px',  desc: 'Tight rows — show more data' },
    { id: 'comfortable',  label: 'Comfortable',  rowH: '14px 16px',  desc: 'Balanced — default' },
    { id: 'spacious',     label: 'Spacious',     rowH: '18px 20px',  desc: 'Airy rows — easier scanning' },
  ]
  const KPI_ICON_SETS = {
    spend:       { label: 'Spend / Cost',   icons: ['rupee','dollar','wallet','card','chart-bar'] },
    leads:       { label: 'Leads / Opps',   icons: ['users','person','funnel','target','star'] },
    rate:        { label: 'Rates / %',      icons: ['percent','trending','activity','pulse','zap'] },
    revenue:     { label: 'Revenue',        icons: ['trending-up','coin','gift','building','check'] },
    messaging:   { label: 'Messages',       icons: ['message','mail','send','bell','chat'] },
    misc:        { label: 'General',        icons: ['grid','layers','cube','diamond','eye'] },
  }
  const setKpiIcon = (slot, icon) => {
    setKpiIcons(prev => {
      const next = { ...prev, [slot]: icon }
      localStorage.setItem('lq_kpi_icons', JSON.stringify(next))
      return next
    })
  }
  const [srFeeSaved, setSrFeeSaved] = useState(false)
  const saveSrFee = () => {
    const v = parseInt(srFeeInput)
    if (isNaN(v) || v <= 0) return
    localStorage.setItem('lq_sr_fee', String(v))
    setSrFeeSaved(true)
    setTimeout(() => setSrFeeSaved(false), 2000)
  }

  // Users
  const [accessList, setAccessList] = useState([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [accessMsg, setAccessMsg] = useState('')
  // --- Report config (sender, subjects, auto switch) ---
  const [rcName, setRcName] = useState('')
  const [rcEmail, setRcEmail] = useState('')
  const [rcSubjects, setRcSubjects] = useState({ daily: '', weekly: '', monthly: '' })
  const [rcAuto, setRcAuto] = useState(true)
  const [rcSaving, setRcSaving] = useState(false)
  const [rcMsg, setRcMsg] = useState('')
  const [rcTesting, setRcTesting] = useState(false)
  const [rcSendType, setRcSendType] = useState('daily')
  const [rcSending, setRcSending] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [editIds, setEditIds] = useState([])
  const [editIsAdmin, setEditIsAdmin] = useState(false)
  const [editIsViewer, setEditIsViewer] = useState(false)
  const [editJobTitle, setEditJobTitle] = useState('')
  const [editDepartment, setEditDepartment] = useState('')

  const loadUsers = async () => {
    setUsersLoading(true)
    const _al = await getAccessList(); setAccessList(Array.isArray(_al) ? _al : [])
    setUsersLoading(false)
  }
  useEffect(() => { if (userIsAdmin) loadUsers() }, [userIsAdmin])

  const [userSearch, setUserSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')

  const setMsg = (m) => { setAccessMsg(m); setTimeout(() => setAccessMsg(''), 4000) }
  const isOkMsg = accessMsg.startsWith('Added') || accessMsg.startsWith('Access') || accessMsg.startsWith('Removed')

  const roleGroup = (role) => {
    if (role === 'admin') return 'admin'
    if (role === 'viewer') return 'viewer'
    return 'custom'
  }
  const filteredUsers = accessList.filter(u => {
    const q = userSearch.trim().toLowerCase()
    const matchesSearch = !q || u.email.toLowerCase().includes(q)
    const matchesRole = roleFilter === 'all' || roleGroup(u.role) === roleFilter
    return matchesSearch && matchesRole
  })
  const stats = {
    total: accessList.length,
    admins: accessList.filter(u => u.role === 'admin').length,
    members: accessList.filter(u => u.role !== 'admin').length,
    reports: accessList.filter(u => u.receive_reports).length,
  }
  const parsePermissions = (role) => {
    if (role === 'admin') return DASHBOARDS.map(d => d.id)
    // plain viewer = all dashboards except ask-ai
    if (!role || role === 'viewer') return DASHBOARDS.filter(d => d.id !== 'ask_ai').map(d => d.id)
    if (role.startsWith('viewer:')) return role.replace('viewer:', '').split(',').filter(Boolean)
    if (role.startsWith('custom:')) return role.replace('custom:', '').split(',').filter(Boolean)
    return DASHBOARDS.filter(d => d.id !== 'ask_ai').map(d => d.id)
  }
  const buildRoleString = (ids, isAdmin) => {
    if (isAdmin) return 'admin'
    // always store explicit list so access is unambiguous
    return 'viewer:' + ids.join(',')
  }

  const accessLabel = (role) => {
    if (role === 'admin' || role === 'viewer') return 'All dashboards'
    if (role === 'roas_only') return 'ROAS only'
    const n = parsePermissions(role).length
    return n + (n === 1 ? ' dashboard' : ' dashboards')
  }
  const fmtDate = (d) => {
    if (!d) return '—'
    try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) }
    catch { return '—' }
  }

  const addUser = async () => {
    const email = newEmail.trim().toLowerCase()
    if (!email.endsWith('@leverageedu.com')) { setMsg('Only @leverageedu.com emails allowed'); return }
    if (accessList.find(u => u.email === email)) { setMsg('Already has access'); return }
    setUsersLoading(true)
    if (await addUserAccess(email, 'viewer', user?.email)) { setMsg('Added: ' + email); setNewEmail(''); await loadUsers() }
    else setMsg('Failed to add')
    setUsersLoading(false)
  }
  const removeUser = async (email) => {
    if (email === user?.email) { setMsg("Can't remove yourself"); return }
    setUsersLoading(true)
    if (await removeUserAccess(email)) { setMsg('Removed: ' + email); await loadUsers() }
    else setMsg('Failed')
    setUsersLoading(false)
  }
  const startEdit = (u) => {
    setEditingUser(u.email)
    const isAdmin = u.role === 'admin'
    setEditIsAdmin(isAdmin)
    setEditIsViewer(!isAdmin)
    setEditIds(parsePermissions(u.role))
    setEditJobTitle(u.job_title || '')
    setEditDepartment(u.department || '')
  }
  const saveEdit = async (email) => {
    setUsersLoading(true)
    const role = buildRoleString(editIds, editIsAdmin)
    const ok = await updateUserRole(email, role)
    await fetch('/api/users', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, job_title: editJobTitle, department: editDepartment }) })
    if (ok) { setMsg('Access updated'); await loadUsers() } else setMsg('Failed')
    setEditingUser(null)
    setUsersLoading(false)
  }
  const toggleReports = async (u, checked) => {
    await fetch('/api/users', {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: u.email, receive_reports: checked }),
    })
    loadUsers()
  }

  const toggleReportType = async (u, type, checked) => {
    const current = Array.isArray(u.report_types) && u.report_types.length ? u.report_types : ['daily','weekly','monthly']
    const next = checked ? Array.from(new Set([...current, type])) : current.filter(t => t !== type)
    await fetch('/api/users', {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: u.email, report_types: next }),
    })
    loadUsers()
  }

  const saveReportConfig = async () => {
    setRcSaving(true); setRcMsg('')
    try {
      const subj = { daily: rcSubjects.daily || '', weekly: rcSubjects.weekly || '', monthly: rcSubjects.monthly || '' }
      const entries = [
        ['report_from_name', rcName.trim()],
        ['report_from_email', rcEmail.trim()],
        ['report_subjects', subj],
        ['auto_reports_enabled', rcAuto],
      ]
      for (const [key, value] of entries) {
        const r = await fetch('/api/preferences', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value }),
        })
        if (!r.ok) throw new Error('Failed to save ' + key)
      }
      setRcMsg('Saved \u2713 report settings updated')
    } catch (e) { setRcMsg('\u2715 ' + e.message) }
    finally { setRcSaving(false); setTimeout(() => setRcMsg(''), 5000) }
  }

  const sendTestReport = async () => {
    if (!window.confirm('Send a TEST report to only your own email (' + (user?.email || 'you') + ')? No one else will receive it.')) return
    setRcTesting(true); setRcMsg('')
    try {
      const r = await fetch('/api/send-report', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'daily', recipients: [user?.email].filter(Boolean), triggered_by: 'test' }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed')
      setRcMsg('Test sent \u2713 to ' + (d.recipients?.join(', ') || user?.email))
    } catch (e) { setRcMsg('\u2715 ' + e.message) }
    finally { setRcTesting(false); setTimeout(() => setRcMsg(''), 6000) }
  }

  const sendReportNow = async () => {
  if (!window.confirm('Send the ' + rcSendType + ' report now to ALL configured recipients?')) return
setRcSending(true); setRcMsg('')
try {
  const r = await fetch('/api/send-report', {
  method: 'POST', credentials: 'include',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ type: rcSendType, triggered_by: user?.email || 'manual' })
})
const d = await r.json()
if (!r.ok) throw new Error(d.error || 'Failed')
setRcMsg('Sent to ' + (d.recipients?.length || 0) + ' recipients')
} catch (e) { setRcMsg('\u2715 ' + e.message) }
finally { setRcSending(false); setTimeout(() => setRcMsg(''), 6000) }
}

  const TABS = [
    ...(userIsAdmin ? [{ id: 'data', label: 'Data', icon: 'layers' }] : []),
    ...(userIsAdmin ? [{ id: 'users', label: 'User Access', icon: 'users' }, { id: 'activity', label: 'Activity Log', icon: 'activity' }] : []),
    ...(userIsAdmin ? [{ id: 'reports', label: 'Reports', icon: 'mail' }] : []),
    ...(userIsAdmin ? [{ id: 'appearance', label: 'Appearance', icon: 'eye' }] : []),
    { id: 'profile', label: 'Profile', icon: 'person' },
  ]

  return (
    <div className={styles.layout}>
      <Sidebar />
      <div className={styles.main}>
        <div className={styles.header}>
          <p className={styles.breadcrumb}>Settings</p>
          <h1 className={styles.title}>Settings</h1>
          <p className={styles.titleSub}>Manage data, access, reports, and how Quantum looks for your workspace.</p>
        </div>

        <div className={styles.content}>
          <div className={styles.tabBar}>
            {TABS.map(t => (
              <button key={t.id}
                className={`${styles.tab} ${activeTab === t.id ? styles.tabActive : ''}`}
                onClick={() => setActiveTab(t.id)}>
                <KpiIconPreview name={t.icon} color="currentColor" />
                {t.label}
              </button>
            ))}
          </div>

          {/* ---------------- DATA ---------------- */}
          {activeTab === 'data' && userIsAdmin && (
            <>
              <div className={styles.card}>
                <h3 className={styles.cardTitle}>SR Revenue Assumptions</h3>
                <p className={styles.cardDesc}>SR fee per RAU used in projected revenue. Formula: RAUs × SR Fee × 0.9</p>
                <label className={styles.fieldLabel}>SR Fee per RAU</label>
                <div className={styles.inputGroup}>
                  <span className={styles.prefix}>Rs.</span>
                  <input type="number" className={styles.input} style={{ maxWidth: 220 }} value={srFeeInput}
                    onChange={e => setSrFeeInput(e.target.value)} />
                  <button className={styles.primaryBtn} onClick={saveSrFee}>{srFeeSaved ? 'Saved' : 'Save'}</button>
                </div>
                <p className={styles.note}>Current: Rs.{parseInt(srFeeInput || 90000).toLocaleString('en-IN')} per RAU</p>
              </div>

              <div className={styles.card}>
                <h3 className={styles.cardTitle}>Data Sources</h3>
                <div className={styles.dsList}>
                {DATA_SOURCES.map(s => (
                  <div key={s.name} className={styles.dsRow} style={{ flexWrap: 'wrap', rowGap: 10 }}>
                    <span className={styles.dsIcon}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/></svg>
                    </span>
                    <div className={styles.dsBody}>
                      <div className={styles.dsName}>{s.name}</div>
                      <div className={styles.dsMeta} title={s.editKey ? (sheetUrls[s.editKey] || s.defaultUrl || '') : ''} style={{ maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.editKey ? (sheetUrls[s.editKey] || s.defaultUrl || 'No default set') : (s.src + ' — ' + s.rows + ' rows')}</div>
                    </div>
                    <span className={styles.dsStatus}>{s.editKey ? (sheetUrls[s.editKey] ? 'Custom' : 'Default') : 'Connected'}</span>{s.editKey && (<button className={styles.primaryBtn} style={{ padding: '5px 11px', fontSize: 11.5, fontWeight: 700, borderRadius: 7, border: '1px solid #1F3C84', background: '#fff', color: '#1F3C84', boxShadow: 'none' }} onClick={() => testSheetConnection(s)} disabled={sheetTest[s.editKey] && sheetTest[s.editKey].loading}>{sheetTest[s.editKey] && sheetTest[s.editKey].loading ? 'Testing...' : 'Test connection'}</button>)}{s.editKey && userIsAdmin && (<button className={styles.primaryBtn} style={{ padding: '5px 11px', fontSize: 11.5, fontWeight: 700, borderRadius: 7, border: 'none', background: 'linear-gradient(135deg, #1F3C84, #1C9FD4)', color: '#fff', boxShadow: '0 4px 10px -3px rgba(31,60,132,0.5)' }} onClick={() => { const next = editingSheet === s.editKey ? null : s.editKey; if (next && !sheetInputs[s.editKey]) setSheetInputs(prev => ({ ...prev, [s.editKey]: sheetUrls[s.editKey] || s.defaultUrl || '' })); setEditingSheet(next) }}>{editingSheet === s.editKey ? 'Close' : 'Edit'}</button>)}{s.editKey && userIsAdmin && editingSheet === s.editKey && (<div className={styles.inputGroup} style={{ flexBasis: '100%', width: '100%', marginTop: 10 }}><input type="text" className={styles.input} placeholder="Paste published/gviz CSV URL" value={sheetInputs[s.editKey] || ''} onChange={e => setSheetInputs(prev => ({ ...prev, [s.editKey]: e.target.value }))} style={{ flex: 1, minWidth: 260 }} /><button className={styles.primaryBtn} style={{ padding: '5px 14px', fontSize: 11.5, fontWeight: 700, borderRadius: 7, border: 'none', background: 'linear-gradient(135deg, #1F3C84, #1C9FD4)', color: '#fff', boxShadow: '0 4px 10px -3px rgba(31,60,132,0.5)' }} onClick={() => saveSheetUrl(s.editKey)} disabled={sheetSaving[s.editKey]}>{sheetSaving[s.editKey] ? 'Saving...' : 'Save'}</button></div>)}{s.editKey && sheetMsg[s.editKey] && (<p className={styles.note} style={{ flexBasis: '100%', width: '100%', margin: '4px 0 0', color: sheetMsg[s.editKey].type === 'err' ? '#c0392b' : undefined }}>{sheetMsg[s.editKey].type === 'err' ? '✕ ' : '✓ '}{sheetMsg[s.editKey].text}</p>)}
                    {s.editKey && sheetTest[s.editKey] && !sheetTest[s.editKey].loading && (
                      <div style={{ flexBasis: '100%', width: '100%', marginTop: 8, padding: '10px 12px', borderRadius: 8, border: '1px solid ' + (sheetTest[s.editKey].error ? '#FECACA' : '#DCFCE7'), background: sheetTest[s.editKey].error ? '#FEF2F2' : '#F0FDF4' }}>
                        {sheetTest[s.editKey].error ? (
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#c0392b' }}>✕ {sheetTest[s.editKey].error}</div>
                        ) : (
                          <>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#15803D', marginBottom: 6 }}>
                              ✓ Connected — {sheetTest[s.editKey].columnCount} columns, {sheetTest[s.editKey].rowCount.toLocaleString('en-IN')} rows
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: sheetTest[s.editKey].monthCounts ? 10 : 0 }}>
                              {sheetTest[s.editKey].columns.map((c, i) => (
                                <span key={i} style={{ fontSize: 10.5, fontWeight: 600, color: '#1F3C84', background: '#E8EFF9', border: '0.5px solid #C7D7F5', borderRadius: 5, padding: '2px 7px' }}>{c || '(blank)'}</span>
                              ))}
                            </div>
                            {sheetTest[s.editKey].monthCounts && (
                              <div style={{ marginTop: 4 }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 4 }}>
                                  Date coverage ({sheetTest[s.editKey].dateCol}): {sheetTest[s.editKey].minDate && sheetTest[s.editKey].minDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} — {sheetTest[s.editKey].maxDate && sheetTest[s.editKey].maxDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </div>
                                {sheetTest[s.editKey].monthCounts.length <= 1 && sheetTest[s.editKey].rowCount > 50 && (
                                  <div style={{ fontSize: 11.5, color: '#854D0E', background: '#FEF9C3', border: '1px solid #FDE68A', borderRadius: 6, padding: '6px 9px', marginBottom: 6 }}>
                                    ⚠ Only 1 month of data is present. If you expect multi-month history, check for an active <strong>Filter</strong> (Data → Create a filter, not a Filter view) on this sheet's tab — a regular filter scopes what this live query returns for everyone, not just your own view.
                                  </div>
                                )}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                  {sheetTest[s.editKey].monthCounts.map(([m, n]) => (
                                    <span key={m} style={{ fontSize: 10.5, fontWeight: 600, color: '#374151', background: '#F3F4F6', border: '0.5px solid #E5E7EB', borderRadius: 5, padding: '2px 7px' }}>{m}: {n.toLocaleString('en-IN')}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {sheetTest[s.editKey].apiCompare && (() => {
                              const live = sheetTest[s.editKey]
                              const api = live.apiCompare
                              const liveLast = live.maxDate ? (live.maxDate.getFullYear() + '-' + String(live.maxDate.getMonth() + 1).padStart(2, '0') + '-' + String(live.maxDate.getDate()).padStart(2, '0')) : null
                              const mismatch = api.lastDate && liveLast && api.lastDate !== liveLast
                              return (
                                <div style={{ marginTop: 10, paddingTop: 8, borderTop: '0.5px solid #E5E7EB' }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Your dashboard's live API ({s.apiPath})</div>
                                  <div style={{ fontSize: 11.5, color: mismatch ? '#854D0E' : '#374151', marginBottom: mismatch ? 6 : 0 }}>
                                    Reports {api.rows != null ? api.rows.toLocaleString('en-IN') : '—'} rows, {api.firstDate || '—'} to {api.lastDate || '—'} ({api.distinctDates} dates)
                                  </div>
                                  {mismatch && (
                                    <div style={{ fontSize: 11.5, color: '#854D0E', background: '#FEF9C3', border: '1px solid #FDE68A', borderRadius: 6, padding: '6px 9px' }}>
                                      ⚠ This doesn't match the sheet's live data above. Your dashboards may still be showing a cached snapshot. Click "Test connection" again in a few minutes to re-check.
                                    </div>
                                  )}
                                </div>
                              )
                            })()}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              </div>

            </>
          )}

          {/* ---------------- USER ACCESS ---------------- */}
          {activeTab === 'users' && userIsAdmin && (
            <>
              {/* ── GLOBAL PAGE VISIBILITY ── */}
              <div className={styles.card} style={{marginBottom:0}}>
                <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:16}}>
                  <div>
                    <h3 className={styles.cardTitle} style={{marginBottom:4}}>Global Page Visibility</h3>
                    <p className={styles.cardDesc} style={{margin:0}}>Pages hidden here disappear from <strong>everyone's</strong> sidebar. Per-user access below only applies to the remaining visible pages.</p>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0,marginTop:2}}>
                    {prefSaveMsg&&<span style={{fontSize:11,fontWeight:600,color:prefSaveMsg.type==='ok'?'#16A34A':'#DC2626',background:prefSaveMsg.type==='ok'?'#F0FDF4':'#FEF2F2',border:'0.5px solid '+(prefSaveMsg.type==='ok'?'#BBF7D0':'#FECACA'),borderRadius:6,padding:'3px 10px',whiteSpace:'nowrap'}}>{prefSaveMsg.text}</span>}
                    <button onClick={saveHiddenPages} disabled={prefSaving||!hasPendingChanges||prefLoading}
                      style={{padding:'6px 16px',borderRadius:8,border:'none',cursor:hasPendingChanges&&!prefSaving?'pointer':'not-allowed',background:hasPendingChanges&&!prefSaving?'#1F3C84':'#E2E8F0',color:hasPendingChanges&&!prefSaving?'#fff':'#94A3B8',fontSize:12,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",transition:'all .15s',display:'flex',alignItems:'center',gap:6,opacity:prefSaving?0.65:1}}>
                      {prefSaving?<><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{animation:'spin .8s linear infinite'}}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>Saving…</>:<><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>{hasPendingChanges?'Save changes':'Saved'}</>}
                    </button>
                  </div>
                </div>
                {prefLoading?<div style={{fontSize:12,color:'#94A3B8'}}>Loading…</div>:
                  <div className={styles.pvGrid}>
                {DASHBOARDS.map(page=>{
                  const isHidden=hiddenPages.includes(page.id)
                  return(
                    <div key={page.id} onClick={()=>togglePageVisibility(page.id)} className={`${styles.pvCard} ${isHidden?styles.pvCardHidden:''}`}>
                      <div className={styles.pvIcon}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          {isHidden?<><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>:<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>}
                        </svg>
                      </div>
                      <div className={styles.pvBody}>
                        <div className={styles.pvName}>{page.label}</div>
                        <div className={styles.pvSub}>{isHidden?'Hidden — all users':'Visible to all'}</div>
                      </div>
                      <div className={styles.pvToggle}><div className={styles.pvKnob}/></div>
                    </div>
                  )
                })}
              </div>
                }
                {hiddenPages.length>0&&!prefLoading&&<button onClick={()=>{setHiddenPages([]);setPrefSaveMsg(null)}} style={{marginTop:10,fontSize:11.5,fontWeight:600,color:'#DC2626',background:'none',border:'none',cursor:'pointer',padding:'4px 0',display:'flex',alignItems:'center',gap:5,fontFamily:"'Plus Jakarta Sans',sans-serif"}}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>Reset — show all</button>}
              </div>
              <div style={{borderTop:'0.5px solid #F1F5F9'}}/>
              {/* page header */}
              <div className={styles.uaHeader}>
                <div>
                  <h2 className={styles.uaTitle}>User Access</h2>
                  <p className={styles.uaSubtitle}>Manage who can access Quantum and which dashboards they see.</p>
                </div>
                <div className={styles.uaHeaderActions}>
                  <button className={styles.ghostBtn} onClick={loadUsers}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                    </svg>
                    Refresh
                  </button>
                </div>
              </div>

              {/* stat strip */}
              <div className={styles.statStrip}>
                <div className={styles.statCard}>
                  <div><div className={styles.statLabel}>Total members</div><div className={styles.statValue}>{stats.total}</div></div>
                  <span className={`${styles.statIcon} ${styles.statIconNavy}`}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
                  </span>
                </div>
                <div className={styles.statCard}>
                  <div><div className={styles.statLabel}>Admins</div><div className={styles.statValue}>{stats.admins}</div></div>
                  <span className={`${styles.statIcon} ${styles.statIconBlue}`}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  </span>
                </div>
                <div className={styles.statCard}>
                  <div><div className={styles.statLabel}>Members</div><div className={styles.statValue}>{stats.members}</div></div>
                  <span className={`${styles.statIcon} ${styles.statIconCyan}`}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  </span>
                </div>
                <div className={styles.statCard}>
                  <div><div className={styles.statLabel}>Daily reports</div><div className={styles.statValue}>{stats.reports}</div></div>
                  <span className={`${styles.statIcon} ${styles.statIconGreen}`}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 4h16v16H4z"/><path d="M8 12l3 3 5-6"/></svg>
                  </span>
                </div>
              </div>

              {/* toolbar: search + role filter + add */}
              <div className={styles.toolbar}>
                <div className={styles.searchBox}>
                  <svg className={styles.searchIcon} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
                  <input className={styles.searchInput} placeholder="Search by email…" value={userSearch} onChange={e => setUserSearch(e.target.value)} />
                </div>
                <select className={styles.filterSelect} value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
                  <option value="all">All roles</option>
                  <option value="admin">Admin</option>
                  <option value="viewer">Viewer</option>
                  <option value="custom">Custom</option>
                </select>
                <input type="email" className={styles.addInput} placeholder="name@leverageedu.com"
                  value={newEmail} onChange={e => setNewEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && addUser()} />
                <button className={styles.primaryBtn} onClick={addUser} disabled={usersLoading}>
                  {usersLoading ? 'Adding…' : 'Add member'}
                </button>
              </div>

              {accessMsg && (
                <div className={`${styles.toast} ${isOkMsg ? styles.toastOk : styles.toastErr}`}>{accessMsg}</div>
              )}

              {/* table */}
              <div className={styles.tableCard}>
                <div className={styles.tableHead}>
                  <span>User</span><span>Role</span><span>Access</span><span>Reports</span><span>Added</span><span>Actions</span>
                </div>

                {filteredUsers.length === 0 && (
                  <div className={styles.empty}>{usersLoading ? 'Loading…' : 'No members match your search.'}</div>
                )}

                {filteredUsers.map((u) => {
                  const rm = getRoleMeta(u.role)
                  const isEditing = editingUser === u.email
                  const isYou = u.email === user?.email
                  return (
                    <div key={u.email}>
                      <div className={`${styles.uRow} ${isEditing ? styles.uRowEdit : ''}`}>
                        <div className={styles.uUser}>
                          <div className={styles.userAvatar} style={{
                            background:`linear-gradient(135deg,${['#1F3C84','#1C9FD4','#4CAE6F','#29B9C3','#8B5CF6'][((u.email||'').charCodeAt(0)||65)%5]},${['#1C9FD4','#29B9C3','#4CAE6F','#1F3C84','#29B9C3'][((u.email||'').charCodeAt(1)||66)%5]})`,
                            width:36,height:36,borderRadius:10,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',
                            color:'#fff',fontSize:12,fontWeight:700,letterSpacing:'0.5px',boxShadow:'0 2px 8px rgba(15,23,42,0.18)',
                          }}>
                            {u.email.split('@')[0].slice(0,2).toUpperCase()}
                          </div>
                          <div className={styles.uUserText}>
                            <span className={styles.userName}>{u.email.split('@')[0]}{isYou && <span className={styles.youTag}>YOU</span>}</span>
                            <span className={styles.uEmail}>{u.email}</span>
                            {(u.job_title||u.department)&&<span style={{fontSize:10.5,color:'#94A3B8',fontWeight:500,marginTop:1}}>{[u.job_title,u.department].filter(Boolean).join(' · ')}</span>}
                          </div>
                        </div>
                        <div><span className={styles.roleBadge} style={{background:rm.bg||'#E8EFF9',color:rm.color||'#1F3C84',borderRadius:20,padding:'3px 10px',fontSize:11,fontWeight:700}}>{rm.label}</span></div>
                        <div className={styles.uAccess}>{accessLabel(u.role)}</div>
                        <div>
                          <label className={styles.reportsToggle} title="Receive daily report">
                            <input type="checkbox" checked={!!u.receive_reports} onChange={e => toggleReports(u, e.target.checked)} />
                          </label>
                        </div>
                        <div className={styles.uAdded}>{fmtDate(u.created_at)}</div>
                        <div className={styles.rowActions}>
                          {!isYou && (
                            <>
                              <button className={`${styles.iconBtn} ${isEditing ? styles.iconBtnActive : ''}`}
                                onClick={() => isEditing ? setEditingUser(null) : startEdit(u)}>
                                {isEditing ? 'Cancel' : 'Edit'}
                              </button>
                              <button className={styles.deleteBtn} onClick={() => removeUser(u.email)} title="Remove" aria-label="Remove member">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
                                </svg>
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {isEditing && (
                        <div className={styles.editPanel}>
                          <p className={styles.editLabel}>Edit Permissions</p>
                          <div className={styles.roleOptions}>
                            <label className={`${styles.roleOption} ${editIsAdmin ? styles.roleOptionActive : ''}`}>
                              <input type="radio" name="role" checked={editIsAdmin} onChange={() => { setEditIsAdmin(true); setEditIsViewer(false) }} />
                              Admin <span className={styles.roleHint}>Full access</span>
                            </label>
                            <label className={`${styles.roleOption} ${editIsViewer ? styles.roleOptionActive : ''}`}>
                              <input type="radio" name="role" checked={editIsViewer} onChange={() => { setEditIsViewer(true); setEditIsAdmin(false) }} />
                              Viewer <span className={styles.roleHint}>Custom access</span>
                            </label>
                          </div>

                          {editIsAdmin && <p className={styles.cardDesc}>Admin has full access to all dashboards and settings.</p>}

                          {editIsViewer && (
                            <div className={styles.dashGrid}>
                              {DASHBOARDS.map(d => {
                                const checked = editIds.includes(d.id)
                                const gHidden = hiddenPages.includes(d.id)
                                return (
                                  <label key={d.id}
                                    title={gHidden?'Globally hidden — change in Global Page Visibility above':undefined}
                                    className={`${styles.dashChip} ${checked&&!gHidden?styles.dashChipActive:''}`}
                                    style={gHidden?{opacity:0.38,cursor:'not-allowed',filter:'grayscale(1)'}:{}}>
                                    <input type="checkbox" checked={checked&&!gHidden} disabled={gHidden}
                                      onChange={()=>!gHidden&&setEditIds(p=>checked?p.filter(x=>x!==d.id):[...p,d.id])} />
                                    {d.label}
                                    {gHidden&&<span style={{fontSize:9,display:'block',color:'#94A3B8',fontWeight:600,lineHeight:1,marginTop:2}}>globally off</span>}
                                  </label>
                                )
                              })}
                            </div>
                          )}

                          <div style={{marginTop:14,display:'flex',gap:10}}>
                            <div style={{flex:1}}>
                              <label style={{fontSize:11,fontWeight:600,color:'#64748B',display:'block',marginBottom:4,letterSpacing:'0.05em'}}>JOB TITLE</label>
                              <input value={editJobTitle} onChange={e=>setEditJobTitle(e.target.value)} placeholder="e.g. Data Analyst"
                                style={{width:'100%',padding:'7px 10px',borderRadius:8,border:'0.5px solid #E2E8F0',fontSize:12.5,fontFamily:"'Plus Jakarta Sans',sans-serif",outline:'none',boxSizing:'border-box'}}/>
                            </div>
                            <div style={{flex:1}}>
                              <label style={{fontSize:11,fontWeight:600,color:'#64748B',display:'block',marginBottom:4,letterSpacing:'0.05em'}}>DEPARTMENT</label>
                              <input value={editDepartment} onChange={e=>setEditDepartment(e.target.value)} placeholder="e.g. Performance Marketing"
                                style={{width:'100%',padding:'7px 10px',borderRadius:8,border:'0.5px solid #E2E8F0',fontSize:12.5,fontFamily:"'Plus Jakarta Sans',sans-serif",outline:'none',boxSizing:'border-box'}}/>
                            </div>
                          </div>

                          <div className={styles.editActions}>
                            <button className={styles.primaryBtn} onClick={() => saveEdit(u.email)} disabled={usersLoading}>
                              {usersLoading ? 'Saving…' : 'Save changes'}
                            </button>
                            <button className={styles.ghostBtn} onClick={() => setEditingUser(null)}>Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}

                <div className={styles.tableFoot}>Showing {filteredUsers.length} of {accessList.length} members</div>
              </div>
            </>
          )}

          {/* ---------------- ACTIVITY LOG ---------------- */}
          {activeTab === 'activity' && userIsAdmin && (
            <div className={styles.card}>
              <div className={styles.activityHeader}>
                <div>
                  <h3 className={styles.cardTitle}>Activity Log</h3>
                  <p className={styles.cardDesc} style={{ margin: 0 }}>See who viewed which dashboard and when.</p>
                </div>
                <button className={styles.ghostBtn} onClick={loadActivity}>
                  {activityLoading ? 'Loading…' : '↻ Refresh'}
                </button>
              </div>

              {activityLog.length > 0 && (
                <div className={styles.alSearch}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <input type="text" placeholder="Search by user..." value={actSearch} onChange={e=>setActSearch(e.target.value)} />
                  {actSearch && (<button type="button" className={styles.alSearchClear} onClick={()=>setActSearch('')} aria-label="Clear">×</button>)}
                </div>
              )}

              {activityLog.length === 0 && !activityLoading && (
                <div className={styles.empty}>
                  Click “Load log” to see activity.<br />
                  Activity is tracked when users open dashboards.
                </div>
              )}

              {activityLog.length > 0 && (
                <div className={styles.alCard}>
                  <div className={styles.tableWrap}>
                  <table className={styles.alTable}>
                    <thead className={styles.alHead}>
                      <tr>
                        {['USER','ACTION','PAGE','DETAIL','DATE','TIME','AGO'].map(h=>(
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activityLog.filter(log => { const q = actSearch.trim().toLowerCase(); if (!q) return true; const u = (log.email||'').toLowerCase(); return u.includes(q); }).map((log,idx)=>{
                        const diff = Date.now()-new Date(log.created_at)
                        const rel = diff<60000?'just now':diff<3600000?Math.round(diff/60000)+'m ago':diff<86400000?Math.round(diff/3600000)+'h ago':Math.round(diff/86400000)+'d ago'
                        const avColor = ['#1F3C84','#1C9FD4','#4CAE6F','#29B9C3','#1C9FD4'][((log.email||'').charCodeAt(0)||65)%5]
                        const avColor2 = ['#1C9FD4','#29B9C3','#4CAE6F','#1F3C84','#29B9C3'][((log.email||'').charCodeAt(1)||66)%5]
                        const pg = (log.page||'app').replace('/dashboard/','').replace('/','').split('?')[0]||'app'
                        const pgLabel = pg==='app'?'Summary':pg.split('-').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ')
                        const ACT = {
                          view: {c:'#1577A0', bg:'#E3F5FD'},
                          click: {c:'#1F3C84', bg:'#E8EFF9'},
                          tab: {c:'#16868F', bg:'#E4F8F9'},
                          login: {c:'#2E7D4F', bg:'#E9F8EF'},
                          logout: {c:'#1577A0', bg:'#E3F5FD'},
                          leave: {c:'#64748B', bg:'#F1F5F9'},
                          search: {c:'#1577A0', bg:'#E3F5FD'},
                          export: {c:'#2E7D4F', bg:'#E9F8EF'},
                        }
                        const a = ACT[log.action] || {c:'#64748B', bg:'#F1F5F9'}
                        const dt = new Date(log.created_at)
                        const dateStr = dt.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})
                        const timeStr = dt.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true})
                        return (
                          <tr key={idx} className={styles.alRow}>
                            <td className={styles.alTd}>
                              <div className={styles.alUserCell}>
                                <div className={styles.alAvatar} style={{background:`linear-gradient(135deg,${avColor},${avColor2})`}}>
                                  {(log.email||'?').split('@')[0].slice(0,2).toUpperCase()}
                                </div>
                                <span className={styles.alUserName}>{(log.email||'').split('@')[0]}</span>
                              </div>
                            </td>
                            <td className={styles.alTd}>
                              <span className={styles.alTag} style={{background:a.bg,color:a.c}}>{log.action||'view'}</span>
                            </td>
                            <td className={`${styles.alTd} ${styles.alPage}`}>{pgLabel}</td>
                            <td className={`${styles.alTd} ${styles.alDetail}`} title={log.detail||''}>{log.detail||'—'}</td>
                            <td className={styles.alTd}>{dateStr}</td>
                            <td className={styles.alTd}>{timeStr}</td>
                            <td className={`${styles.alTd} ${styles.alMuted}`}>{rel}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  </div>
                  <div className={styles.alFoot}>Showing {activityLog.length} {activityLog.length===1?'entry':'entries'}</div>
                </div>
                )}
            </div>
          )}

          {/* ---------------- PROFILE ---------------- */}
          {/* --------------- REPORTS --------------- */}
          {activeTab === 'reports' && userIsAdmin && (
            <>
              <div className={styles.card}>
                <h3 className={styles.cardTitle}>Email Sender</h3>
                <p className={styles.cardDesc}>Name and address that report emails are sent from. The address domain must be verified in Resend (currently platform.leverageedu.com).</p>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12 }}>
                  <label style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600, color: '#1F3C84' }}>Sender name
                    <input value={rcName} onChange={e => setRcName(e.target.value)} placeholder="Leverage Quantum" style={{ padding: '8px 12px', border: '1px solid #d8dded', borderRadius: 8, fontSize: 14, fontWeight: 400 }} />
                  </label>
                  <label style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600, color: '#1F3C84' }}>Sender email
                    <input value={rcEmail} onChange={e => setRcEmail(e.target.value)} placeholder="quantum@platform.leverageedu.com" style={{ padding: '8px 12px', border: '1px solid #d8dded', borderRadius: 8, fontSize: 14, fontWeight: 400 }} />
                  </label>
                </div>
                {rcEmail && !rcEmail.endsWith('@platform.leverageedu.com') && (<p style={{ color: '#8a6d1f', fontSize: 12, marginTop: 8 }}>Note: this address is not on the verified domain platform.leverageedu.com — Resend may reject it.</p>)}
              </div>
              <div className={styles.card}>
                <h3 className={styles.cardTitle}>Subject Lines</h3>
                <p className={styles.cardDesc}>Optional overrides per report type. Leave blank to use the default subject.</p>
                {['daily', 'weekly', 'monthly'].map(t => (
                  <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, fontSize: 13, fontWeight: 600, color: '#1F3C84' }}>
                    <span style={{ width: 70, textTransform: 'capitalize' }}>{t}</span>
                    <input value={rcSubjects[t]} onChange={e => setRcSubjects(prev => ({ ...prev, [t]: e.target.value }))} placeholder={'Default ' + t + ' subject'} style={{ flex: 1, padding: '8px 12px', border: '1px solid #d8dded', borderRadius: 8, fontSize: 14, fontWeight: 400 }} />
                  </label>
                ))}
              </div>
              <div className={styles.card}>
                <h3 className={styles.cardTitle}>Automatic Reports</h3>
                <p className={styles.cardDesc}>Master switch for scheduled (cron) reports. Turning this off stops all automatic sends; manual Send Report buttons still work.</p>
                <label className={styles.reportsToggle} style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                  <input type="checkbox" checked={rcAuto} onChange={e => setRcAuto(e.target.checked)} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#1F3C84' }}>{rcAuto ? 'Automatic reports enabled' : 'Automatic reports disabled'}</span>
                </label>
              </div>
              <div className={styles.card}>
                <h3 className={styles.cardTitle}>Recipients</h3>
                <p className={styles.cardDesc}>People who currently receive reports (toggled per user in the User Access tab):</p>
                <p style={{ fontSize: 13, color: '#1F3C84', fontWeight: 600, marginTop: 8, lineHeight: 1.6 }}>{accessList.filter(u => u.receive_reports).map(u => u.email).join(', ') || 'No one selected — reports fall back to ' + (user?.email || 'admin')}</p>
          <div style={{ marginTop: 14, borderTop: '0.5px solid #E2E8F0', paddingTop: 12 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#64748B', margin: '0 0 8px', letterSpacing: '0.02em' }}>Per-recipient report types</p>
            <p style={{ fontSize: 11.5, color: '#94A3B8', margin: '0 0 10px', lineHeight: 1.5 }}>Choose which scheduled reports each person receives. Unchecking all three is the same as receiving all.</p>
            {accessList.filter(u => u.receive_reports).length === 0 ? (
              <p style={{ fontSize: 12, color: '#94A3B8' }}>No recipients yet — enable people in the User Access tab.</p>
            ) : accessList.filter(u => u.receive_reports).map(u => {
              const types = Array.isArray(u.report_types) && u.report_types.length ? u.report_types : ['daily','weekly','monthly']
              return (
                <div key={u.email} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: '0.5px solid #F1F5F9', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12.5, color: '#1F3C84', fontWeight: 500 }}>{u.email}</span>
                  <div style={{ display: 'flex', gap: 14 }}>
                    {['daily','weekly','monthly'].map(t => (
                      <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#475569', cursor: 'pointer', textTransform: 'capitalize' }}>
                        <input type="checkbox" checked={types.includes(t)} onChange={e => toggleReportType(u, t, e.target.checked)} />
                        {t}
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 18 }}>
                <button className={styles.primaryBtn} onClick={saveReportConfig} disabled={rcSaving}>{rcSaving ? 'Saving\u2026' : 'Save report settings'}</button>
                <button className={styles.ghostBtn} onClick={sendTestReport} disabled={rcTesting}>{rcTesting ? 'Sending\u2026' : 'Send test to me only'}</button>
<select value={rcSendType} onChange={e => setRcSendType(e.target.value)} disabled={rcSending} style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 13, fontWeight: 600, color: '#1F3C84', background: '#fff', cursor: 'pointer' }}>
  <option value="daily">Daily report</option>
<option value="weekly">Weekly report</option>
<option value="monthly">Monthly report</option>
</select>
<button onClick={sendReportNow} disabled={rcSending} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: rcSending ? '#94A3B8' : '#1F3C84', color: '#fff', fontSize: 13, fontWeight: 700, cursor: rcSending ? 'default' : 'pointer' }}>{rcSending ? 'Sending\u2026' : 'Send now'}</button>
                {rcMsg && <span style={{ fontSize: 13, fontWeight: 600, color: rcMsg.charAt(0) === '\u2715' ? '#b4413c' : '#4CAE6F' }}>{rcMsg}</span>}
              </div>

              <div className={styles.card}>
                <div className={styles.activityHeader}>
                  <div>
                    <h3 className={styles.cardTitle}>Report Activity</h3>
                    <p className={styles.cardDesc} style={{ margin: 0 }}>Every send attempt — scheduled (GitHub Actions cron), manual, and test — with the real outcome. A skipped run (auto-reports disabled) is logged here even though GitHub Actions itself shows it as a green "success".</p>
                  </div>
                  <button className={styles.ghostBtn} onClick={loadReportLogs}>
                    {reportLogsLoading ? 'Loading\u2026' : '\u21bb Refresh'}
                  </button>
                </div>

                {reportLogsList.length === 0 && !reportLogsLoading && (
                  <div className={styles.empty}>No report activity yet.</div>
                )}

                {reportLogsList.length > 0 && (
                  <div className={styles.alCard}>
                    <div className={styles.tableWrap}>
                    <table className={styles.alTable}>
                      <thead className={styles.alHead}>
                        <tr>
                          {['TYPE','STATUS','TRIGGERED BY','RECIPIENTS','SENT AT','DETAIL'].map(h=>(
                            <th key={h}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {reportLogsList.map((log,idx)=>{
                          const STATUS = {
                            sent:    { c:'#2E7D4F', bg:'#E9F8EF', label:'Sent' },
                            skipped: { c:'#1577A0', bg:'#E3F5FD', label:'Skipped' },
                            failed:  { c:'#1F3C84', bg:'#E8EFF9', label:'Failed' },
                          }
                          const s = STATUS[log.status] || { c:'#64748B', bg:'#F1F5F9', label: log.status||'Unknown' }
                          const triggeredLabel = log.triggered_by === 'cron' ? 'Cron (GitHub Actions)' : log.triggered_by === 'test' ? 'Test' : (log.triggered_by || 'Manual')
                          const dt = log.sent_at ? new Date(log.sent_at) : null
                          const dateStr = dt ? dt.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—'
                          const timeStr = dt ? dt.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true}) : ''
                          const rcptCount = Array.isArray(log.recipients) ? log.recipients.length : 0
                          return (
                            <tr key={log.id||idx} className={styles.alRow}>
                              <td className={`${styles.alTd} ${styles.alPage}`} style={{textTransform:'capitalize'}}>{log.report_type||'—'}</td>
                              <td className={styles.alTd}>
                                <span className={styles.alTag} style={{background:s.bg,color:s.c}}>{s.label}</span>
                              </td>
                              <td className={styles.alTd}>{triggeredLabel}</td>
                              <td className={styles.alTd}>{rcptCount > 0 ? `${rcptCount} recipient${rcptCount!==1?'s':''}` : '—'}</td>
                              <td className={styles.alTd}>{dateStr}{timeStr ? ` \u00b7 ${timeStr}` : ''}</td>
                              <td className={`${styles.alTd} ${styles.alDetail}`} title={log.error||''}>{log.error || '—'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    </div>
                    <div className={styles.alFoot}>Showing {reportLogsList.length} {reportLogsList.length===1?'entry':'entries'}</div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ---------------- APPEARANCE ---------------- */}
          {activeTab === 'appearance' && userIsAdmin && (
            <>
              {/* PAGE VISIBILITY → now in User Access tab */}
              <div className={styles.card} style={{display:'flex',alignItems:'center',gap:14,padding:'14px 18px'}}>
                <div style={{width:34,height:34,borderRadius:9,background:'#E8EFF9',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1F3C84" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700,color:'#0F172A',marginBottom:2}}>Global Page Visibility</div>
                  <div style={{fontSize:12,color:'#94A3B8',lineHeight:1.5}}>Unified with per-user access in the <strong>User Access</strong> tab — manage global and individual page access together.</div>
                </div>
                <button onClick={()=>setActiveTab('users')} style={{padding:'7px 14px',borderRadius:8,background:'#F8FAFC',border:'0.5px solid #E2E8F0',fontSize:12,fontWeight:600,color:'#1F3C84',cursor:'pointer',whiteSpace:'nowrap',fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
                  User Access →
                </button>
              </div>
              <div className={styles.card}>
                <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:18}}>
                  <div>
                    <h3 className={styles.cardTitle}>Page Visibility</h3>
                    <p className={styles.cardDesc} style={{margin:0}}>Hide pages from the sidebar navigation. Hidden pages are <strong>saved globally</strong> — they apply to all users via Supabase.</p>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0,marginTop:2}}>
                    {prefSaveMsg && (
                      <span style={{fontSize:11,fontWeight:600,color:prefSaveMsg.type==='ok'?'#16A34A':'#DC2626',background:prefSaveMsg.type==='ok'?'#F0FDF4':'#FEF2F2',border:`0.5px solid ${prefSaveMsg.type==='ok'?'#BBF7D0':'#FECACA'}`,borderRadius:6,padding:'3px 10px'}}>
                        {prefSaveMsg.text}
                      </span>
                    )}
                    {!prefSaveMsg && (
                      <span style={{fontSize:11,fontWeight:600,color:'#94A3B8',background:'#F8FAFC',border:'0.5px solid #E2E8F0',borderRadius:6,padding:'3px 10px'}}>
                        {prefLoading ? 'Loading…' : hiddenPages.length > 0 ? `${hiddenPages.length} hidden` : 'All visible'}
                      </span>
                    )}
                    <button onClick={saveHiddenPages} disabled={prefSaving || !hasPendingChanges || prefLoading}
                      style={{
                        padding:'6px 16px',borderRadius:8,border:'none',cursor: hasPendingChanges&&!prefSaving?'pointer':'not-allowed',
                        background: hasPendingChanges&&!prefSaving?'#1F3C84':'#E2E8F0',
                        color: hasPendingChanges&&!prefSaving?'#fff':'#94A3B8',
                        fontSize:12,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",
                        transition:'all .15s',display:'flex',alignItems:'center',gap:6,whiteSpace:'nowrap',
                        opacity: prefSaving?0.65:1,
                      }}>
                      {prefSaving
                        ? <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{animation:'spin .8s linear infinite'}}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>Saving…</>
                        : <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>Save</>
                      }
                    </button>
                  </div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:10}}>
                  {DASHBOARDS.map(page => {
                    const isHidden = hiddenPages.includes(page.id)
                    return (
                      <div key={page.id} onClick={() => togglePageVisibility(page.id)}
                        style={{
                          display:'flex',alignItems:'center',gap:12,padding:'12px 14px',
                          borderRadius:10,border:`0.5px solid ${isHidden ? '#E2E8F0' : '#D1E9F7'}`,
                          background: isHidden ? '#F8FAFC' : '#F0FBFF',
                          cursor:'pointer',transition:'all .15s',userSelect:'none',
                        }}>
                        <div style={{
                          width:32,height:32,borderRadius:8,flexShrink:0,
                          background: isHidden ? '#F1F5F9' : '#E3F5FD',
                          display:'flex',alignItems:'center',justifyContent:'center',
                          transition:'all .15s',
                        }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isHidden ? '#94A3B8' : '#1C9FD4'} strokeWidth="2" strokeLinecap="round">
                            {isHidden
                              ? <><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>
                              : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
                            }
                          </svg>
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:600,color: isHidden ? '#94A3B8' : '#0F172A',letterSpacing:'-0.01em'}}>{page.label}</div>
                          <div style={{fontSize:11,color:'#94A3B8',marginTop:1}}>{isHidden ? 'Hidden from nav' : 'Visible in nav'}</div>
                        </div>
                        <div style={{
                          width:36,height:20,borderRadius:10,flexShrink:0,
                          background: isHidden ? '#E2E8F0' : '#1C9FD4',
                          position:'relative',transition:'background .2s',
                        }}>
                          <div style={{
                            position:'absolute',top:2,left: isHidden ? 2 : 18,
                            width:16,height:16,borderRadius:8,background:'#fff',
                            transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,0.15)',
                          }}/>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {hiddenPages.length > 0 && (
                  <button onClick={() => { setHiddenPages([]); setPrefSaveMsg(null) }}
                    style={{marginTop:16,fontSize:12,fontWeight:600,color:'#DC2626',background:'none',border:'none',cursor:'pointer',padding:'4px 0',display:'flex',alignItems:'center',gap:5}}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
                    Reset all — show all pages
                  </button>
                )}
              </div>

              {/* THEME */}
              <div className={styles.card}>
                <h3 className={styles.cardTitle}>Theme</h3>
                <p className={styles.cardDesc}>Choose a colour scheme for the entire dashboard.</p>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:12}}>
                  {THEMES.map(theme => {
                    const isActive = activeTheme === theme.id
                    return (
                      <div key={theme.id} onClick={() => applyTheme(theme.id)} className={styles.pxThemeCard}
                        style={{
                          borderRadius:12,border:`1.5px solid ${isActive ? '#1C9FD4' : '#E2E8F0'}`,
                          padding:'14px 16px',cursor:'pointer',transition:'all .15s',
                          background: isActive ? '#F0FBFF' : '#fff',
                          boxShadow: isActive ? '0 0 0 3px rgba(28,159,212,0.12)' : '0 1px 3px rgba(15,23,42,0.04)',
                          position:'relative',
                        }}>
                        {isActive && (
                          <div style={{position:'absolute',top:10,right:10,width:18,height:18,borderRadius:9,background:'#1C9FD4',display:'flex',alignItems:'center',justifyContent:'center'}}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                          </div>
                        )}
                        {/* Colour preview swatches */}
                        <div style={{display:'flex',gap:5,marginBottom:12}}>
                          {theme.preview.map((col, ci) => (
                            <div key={ci} style={{height:28,flex:1,borderRadius:6,background:col,border:'0.5px solid rgba(0,0,0,0.06)'}}/>
                          ))}
                        </div>
                        <div style={{fontSize:13,fontWeight:700,color:'#0F172A',marginBottom:2}}>{theme.name}</div>
                        <div style={{fontSize:11.5,color:'#94A3B8'}}>{theme.desc}</div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* KPI CARD ICONS */}
              <div className={styles.card}>
                <h3 className={styles.cardTitle}>KPI Card Icons</h3>
                <p className={styles.cardDesc}>Choose which icon style appears on metric cards. Changes apply across all dashboards.</p>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:16}}>
                  {Object.entries(KPI_ICON_SETS).map(([slot, cfg]) => {
                    const active = kpiIcons[slot] || cfg.icons[0]
                    return (
                      <div key={slot}>
                        <div style={{fontSize:11,fontWeight:700,color:'#94A3B8',letterSpacing:'0.07em',textTransform:'uppercase',marginBottom:8}}>{cfg.label}</div>
                        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                          {cfg.icons.map(icon => {
                            const isSelected = active === icon
                            return (
                              <button key={icon} onClick={() => setKpiIcon(slot, icon)}
                                title={icon}
                                style={{
                                  width:38,height:38,borderRadius:9,border:`1.5px solid ${isSelected ? '#1C9FD4' : '#E2E8F0'}`,
                                  background: isSelected ? '#E3F5FD' : '#F8FAFC',
                                  display:'flex',alignItems:'center',justifyContent:'center',
                                  cursor:'pointer',transition:'all .15s',
                                  boxShadow: isSelected ? '0 0 0 3px rgba(28,159,212,0.1)' : 'none',
                                }}>
                                <KpiIconPreview name={icon} color={isSelected ? '#1C9FD4' : '#94A3B8'} />
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div style={{marginTop:16,padding:'12px 14px',background:'#F8FAFC',borderRadius:9,border:'0.5px solid #E2E8F0',display:'flex',alignItems:'center',gap:10}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  <span style={{fontSize:12,color:'#94A3B8'}}>Icon preferences are saved locally. Assign icons to each metric category to match your team's mental model.</span>
                </div>
              </div>

              {/* SIDEBAR LAYOUT */}
              <div className={styles.card}>
                <h3 className={styles.cardTitle}>Sidebar Layout</h3>
                <p className={styles.cardDesc}>Control how much space the navigation takes up. Applies immediately.</p>
                <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
                  {SIDEBAR_MODES.map(mode => {
                    const isActive = sidebarMode === mode.id
                    return (
                      <div key={mode.id} onClick={() => applySidebarMode(mode.id)}
                        style={{flex:'1 1 150px',padding:'14px 16px',borderRadius:10,cursor:'pointer',transition:'all .15s',border:`1.5px solid ${isActive ? '#1C9FD4' : '#E2E8F0'}`,background:isActive?'#F0FBFF':'#fff',boxShadow:isActive?'0 0 0 3px rgba(28,159,212,0.1)':'0 1px 3px rgba(15,23,42,0.04)',position:'relative'}}>
                        {isActive && <div style={{position:'absolute',top:10,right:10,width:18,height:18,borderRadius:9,background:'#1C9FD4',display:'flex',alignItems:'center',justifyContent:'center'}}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg></div>}
                        <div style={{fontSize:13,fontWeight:700,color:'#0F172A',marginBottom:3}}>{mode.label}</div>
                        <div style={{fontSize:11.5,color:'#94A3B8'}}>{mode.desc}</div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* NUMBER FORMAT */}
              <div className={styles.card}>
                <h3 className={styles.cardTitle}>Number Format</h3>
                <p className={styles.cardDesc}>How large numbers are displayed across all dashboards.</p>
                <div style={{display:'flex',flexDirection:'column',gap:10}}>
                  {NUMBER_FORMATS.map(fmt => {
                    const isActive = numberFormat === fmt.id
                    return (
                      <div key={fmt.id} onClick={() => applyNumberFormat(fmt.id)}
                        style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'13px 16px',borderRadius:10,cursor:'pointer',transition:'all .15s',border:`1.5px solid ${isActive?'#1C9FD4':'#E2E8F0'}`,background:isActive?'#F0FBFF':'#fff'}}>
                        <div>
                          <div style={{fontSize:13,fontWeight:600,color:'#0F172A',marginBottom:2}}>{fmt.label}</div>
                          <div style={{fontSize:11.5,color:'#94A3B8'}}>{fmt.desc}</div>
                        </div>
                        <div style={{fontFamily:'monospace',fontSize:12,color:isActive?'#1C9FD4':'#94A3B8',fontWeight:600,textAlign:'right',flexShrink:0,marginLeft:12}}>{fmt.example}</div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* DEFAULT DATE RANGE */}
              <div className={styles.card}>
                <h3 className={styles.cardTitle}>Default Date Range</h3>
                <p className={styles.cardDesc}>Time period loaded by default when opening a dashboard. Overridden per-session by your manual selection.</p>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:10}}>
                  {DATE_RANGES.map(range => {
                    const isActive = defaultDateRange === range.id
                    return (
                      <div key={range.id} onClick={() => applyDefaultDate(range.id)}
                        style={{padding:'12px 14px',borderRadius:10,cursor:'pointer',transition:'all .15s',border:`1.5px solid ${isActive?'#1C9FD4':'#E2E8F0'}`,background:isActive?'#F0FBFF':'#fff',position:'relative'}}>
                        {isActive && <div style={{position:'absolute',top:10,right:10,width:16,height:16,borderRadius:8,background:'#1C9FD4',display:'flex',alignItems:'center',justifyContent:'center'}}><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg></div>}
                        <div style={{fontSize:13,fontWeight:600,color:'#0F172A',marginBottom:3}}>{range.label}</div>
                        <div style={{fontSize:11.5,color:'#94A3B8'}}>{range.desc}</div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* TABLE DENSITY */}
              <div className={styles.card}>
                <h3 className={styles.cardTitle}>Table Density</h3>
                <p className={styles.cardDesc}>Row height across all data tables. Compact shows more rows; Spacious is easier to scan quickly.</p>
                <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
                  {DENSITIES.map(den => {
                    const isActive = tableDensity === den.id
                    return (
                      <div key={den.id} onClick={() => applyDensity(den.id)}
                        style={{flex:'1 1 140px',cursor:'pointer',borderRadius:10,transition:'all .15s',overflow:'hidden',border:`1.5px solid ${isActive?'#1C9FD4':'#E2E8F0'}`,boxShadow:isActive?'0 0 0 3px rgba(28,159,212,0.1)':'none'}}>
                        <div style={{padding:'10px 12px 6px',background:isActive?'#F0FBFF':'#F8FAFC'}}>
                          {[1,2,3].map(row => (
                            <div key={row} style={{display:'flex',gap:6,padding:`${den.rowH} 0`,borderBottom:'0.5px solid #E2E8F0'}}>
                              <div style={{width:'40%',height:8,borderRadius:3,background:isActive?'#BAE3F9':'#E2E8F0'}}/>
                              <div style={{width:'30%',height:8,borderRadius:3,background:isActive?'#D1EEFB':'#EEF0F3'}}/>
                              <div style={{width:'20%',height:8,borderRadius:3,background:isActive?'#D1EEFB':'#EEF0F3'}}/>
                            </div>
                          ))}
                        </div>
                        <div style={{padding:'10px 12px',borderTop:`1.5px solid ${isActive?'#1C9FD4':'#E2E8F0'}`,background:'#fff'}}>
                          <div style={{fontSize:12,fontWeight:700,color:isActive?'#1C9FD4':'#0F172A'}}>{den.label}</div>
                          <div style={{fontSize:11,color:'#94A3B8',marginTop:2}}>{den.desc}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
          </>
        )}

                    {activeTab === 'profile' && (
              <div className={styles.pxProfileWrap}>
                <div className={styles.pxHero}>
                  <div className={styles.pxHeroGlow} />
                  <div className={styles.pxHeroInner}>
                    <div className={styles.pxAvatarRing}>
                      <div className={styles.pxAvatar}>
                        {user?.picture
                          ? <img src={user.picture} alt={user.name} className={styles.pxAvatarImg}/>
                          : <span>{(user?.name||'U').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}</span>}
                      </div>
                    </div>
                    <div className={styles.pxHeroText}>
                      <div className={styles.pxHeroName}>{user?.name || 'User'}</div>
                      <div className={styles.pxHeroEmail}>{user?.email}</div>
                      <div className={styles.pxHeroBadges}>
                        <span className={styles.pxRoleBadge}>{user?.role === 'admin' ? 'Administrator' : 'Viewer'}</span>
                        <span className={styles.pxStatusBadge}><i className={styles.pxDot}/> Active session</span>
                      </div>
                    </div>
                    <button className={styles.pxCopyBtn} onClick={()=>{ if(user?.email){navigator.clipboard?.writeText(user.email); setCopied(true); setTimeout(()=>setCopied(false),1600);} }}>
                      {copied ? 'Copied' : 'Copy email'}
                    </button>
                  </div>
                </div>

                <div className={styles.pxStatRow}>
                  <div className={styles.pxStatCard}>
                    <div className={styles.pxStatLabel}>Access level</div>
                    <div className={styles.pxStatValue}>{user?.role === 'admin' ? 'Full' : 'Standard'}</div>
                    <div className={styles.pxStatSub}>{user?.role === 'admin' ? 'All dashboards & settings' : 'Assigned dashboards'}</div>
                  </div>
                  <div className={styles.pxStatCard}>
                    <div className={styles.pxStatLabel}>Sign-in method</div>
                    <div className={styles.pxStatValue}>Google</div>
                    <div className={styles.pxStatSub}>Leverage Edu workspace</div>
                  </div>
                  <div className={styles.pxStatCard}>
                    <div className={styles.pxStatLabel}>Workspace</div>
                    <div className={styles.pxStatValue}>Quantum</div>
                    <div className={styles.pxStatSub}>leverageedu.com</div>
                  </div>
                </div>

                <div className={styles.card}>
                  <h3 className={styles.cardTitle}>Account details</h3>
                  <p className={styles.cardDesc}>Your profile is managed through your Leverage Edu Google account.</p>
                  <div className={styles.pxDetailGrid}>
                    <div className={styles.pxDetailItem}><span className={styles.pxDetailKey}>Full name</span><span className={styles.pxDetailVal}>{user?.name || '—'}</span></div>
                    <div className={styles.pxDetailItem}><span className={styles.pxDetailKey}>Email address</span><span className={styles.pxDetailVal}>{user?.email || '—'}</span></div>
                    <div className={styles.pxDetailItem}><span className={styles.pxDetailKey}>Role</span><span className={styles.pxDetailVal}>{user?.role === 'admin' ? 'Administrator' : 'Viewer'}</span></div>
                    <div className={styles.pxDetailItem}><span className={styles.pxDetailKey}>Theme</span><span className={styles.pxDetailVal} style={{textTransform:'capitalize'}}>{activeTheme || 'light'}</span></div>
                  </div>
                </div>
              </div>
              )}
        </div>
      </div>
    </div>
  )
}
