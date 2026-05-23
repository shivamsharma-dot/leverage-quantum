import { useState, useEffect } from 'react'

const SHEET_ID = import.meta.env.VITE_ROAS_SHEET_ID || '1aL-T6sYxsonmhiFHUdoMHfr-t9dDYWtQZ-84vcZPqFg'
const API_KEY  = import.meta.env.VITE_SHEETS_API_KEY

function parseNum(val) {
  if (!val) return 0
  return parseFloat(String(val).replace(/[₹,\s]/g, '')) || 0
}

// Try Sheets API v4 first (most accurate)
async function fetchViaAPI() {
  // Get sheet metadata to find correct tab names
  const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?key=${API_KEY}`
  const metaRes = await fetch(metaUrl)
  if (!metaRes.ok) throw new Error(`Meta error: ${metaRes.status}`)
  const meta = await metaRes.json()

  // Find the Nov-2025 sheet tab
  const sheets = meta.sheets || []
  const novSheet = sheets.find(s =>
    s.properties.title.includes('Nov') ||
    s.properties.title.includes('nov') ||
    s.properties.title === 'Nov-2025'
  )

  if (!novSheet) throw new Error('Nov-2025 tab not found')

  const tabName = novSheet.properties.title
  const gid     = novSheet.properties.sheetId

  // Fetch campaign rows (row 5 onwards, headers on row 4)
  const range    = encodeURIComponent(`${tabName}!A4:Y150`)
  const dataUrl  = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?key=${API_KEY}`
  const dataRes  = await fetch(dataUrl)
  if (!dataRes.ok) throw new Error(`Data error: ${dataRes.status}`)
  const dataJson = await dataRes.json()
  const rows     = dataJson.values || []

  return { rows, tabName, gid }
}

// Fallback: CSV export (no API key needed, sheet must be public)
async function fetchViaCSV(gid = 0) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`CSV error: ${res.status}`)
  const text = await res.text()
  return parseCSV(text)
}

function parseCSV(text) {
  const lines = text.split('\n').map(l => l.split(',').map(c => c.replace(/^"|"$/g, '').trim()))
  return lines
}

function buildCampaigns(rows) {
  if (!rows || rows.length < 2) return []

  // Find header row (contains 'Channel' and 'Campaign Name')
  let headerIdx = rows.findIndex(r =>
    r.some(c => c === 'Channel') && r.some(c => c.includes('Campaign'))
  )
  if (headerIdx === -1) headerIdx = 0

  const headers = rows[headerIdx]
  const campaigns = []

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    const ch  = row[headers.indexOf('Channel')]?.trim()
    if (!ch || !['Facebook','Google','LinkedIn','Bing'].includes(ch)) continue

    const obj = {}
    headers.forEach((h, idx) => {
      obj[h] = row[idx] || ''
    })
    campaigns.push(obj)
  }

  return campaigns
}

export function useROASData() {
  const [data, setData]             = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [source, setSource]         = useState('demo')

  const fetchData = async () => {
    setLoading(true)
    setError(null)

    // Try 1: Sheets API v4
    try {
      const { rows } = await fetchViaAPI()
      const campaigns = buildCampaigns(rows)
      if (campaigns.length > 0) {
        setData(campaigns)
        setSource('live')
        setLastUpdated(new Date())
        setLoading(false)
        return
      }
    } catch (e) {
      console.warn('Sheets API failed:', e.message)
    }

    // Try 2: CSV export (public sheet)
    try {
      // Try common GIDs for Nov-2025 tab
      for (const gid of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
        try {
          const rows = await fetchViaCSV(gid)
          const campaigns = buildCampaigns(rows)
          if (campaigns.length > 3) {
            setData(campaigns)
            setSource('csv')
            setLastUpdated(new Date())
            setLoading(false)
            return
          }
        } catch (e) { /* try next gid */ }
      }
    } catch (e) {
      console.warn('CSV fallback failed:', e.message)
    }

    // Final fallback: demo data
    setError('Could not connect to Google Sheet')
    setData(getDemoData())
    setSource('demo')
    setLastUpdated(new Date())
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  return { data, loading, error, refetch: fetchData, lastUpdated, source }
}

function getDemoData() {
  return [
    { Channel: 'Facebook', 'Campaign Name': 'PMX_FB_UK_LeadGen_18Aug25_Leverage_RAU&Deposit_Lookalike_1%_India_Jan_2026Ad1', 'Amount Spent': '₹13,06,504', OPPs: '1477', QLs: '357', STUs: '40', 'AC Revenue': '530000', 'VAS Revenue': '0', 'L to Q%': '24.17%', CPL: '884.57' },
    { Channel: 'Facebook', 'Campaign Name': 'PMX_FB_Italy_LeadGen_8Sep25_Jan_2026_Ad3', 'Amount Spent': '₹10,41,967', OPPs: '4362', QLs: '849', STUs: '44', 'AC Revenue': '1705000', 'VAS Revenue': '0', 'L to Q%': '19.46%', CPL: '238.87' },
    { Channel: 'Facebook', 'Campaign Name': 'PMX_FB_UK_LeadGen_18Aug25_Leverage_STU_Lookalike', 'Amount Spent': '₹9,54,249', OPPs: '1067', QLs: '175', STUs: '20', 'AC Revenue': '0', 'VAS Revenue': '0', 'L to Q%': '16.40%', CPL: '894.33' },
    { Channel: 'Facebook', 'Campaign Name': 'PMX_FB_UK_LeadGen_18Aug25_RestofIndia_iOS', 'Amount Spent': '₹9,04,241', OPPs: '599', QLs: '97', STUs: '16', 'AC Revenue': '218000', 'VAS Revenue': '0', 'L to Q%': '16.19%', CPL: '1509.58' },
    { Channel: 'Facebook', 'Campaign Name': 'PMX_FB_UK_LeadGen_4Oct25_Leverage_STU_Lookalike', 'Amount Spent': '₹8,58,713', OPPs: '857', QLs: '165', STUs: '20', 'AC Revenue': '250000', 'VAS Revenue': '0', 'L to Q%': '19.25%', CPL: '1002.00' },
    { Channel: 'Google', 'Campaign Name': 'PMX_Search_UK_Non_Brand_Competitors_India', 'Amount Spent': '₹25,09,891', OPPs: '0', QLs: '580', STUs: '0', 'AC Revenue': '0', 'VAS Revenue': '0', 'L to Q%': '', CPL: '4327' },
    { Channel: 'Google', 'Campaign Name': 'PMX_Search_UK_Non_Brand_UK_only_India', 'Amount Spent': '₹11,57,000', OPPs: '0', QLs: '255', STUs: '0', 'AC Revenue': '0', 'VAS Revenue': '0', 'L to Q%': '', CPL: '4537' },
    { Channel: 'Google', 'Campaign Name': 'PMX_Search_UK_Non_Brand_Course_India', 'Amount Spent': '₹7,32,468', OPPs: '0', QLs: '180', STUs: '0', 'AC Revenue': '0', 'VAS Revenue': '0', 'L to Q%': '', CPL: '4069' },
    { Channel: 'Google', 'Campaign Name': 'PMX_Demandgen_Uk_13092024', 'Amount Spent': '₹6,78,000', OPPs: '0', QLs: '208', STUs: '0', 'AC Revenue': '0', 'VAS Revenue': '0', 'L to Q%': '', CPL: '3260' },
    { Channel: 'Facebook', 'Campaign Name': 'PMX_FB_Germany_LeadGen_12Sep25Jan_2026_NAS_Video', 'Amount Spent': '₹4,19,220', OPPs: '2335', QLs: '376', STUs: '16', 'AC Revenue': '424980', 'VAS Revenue': '0', 'L to Q%': '16.10%', CPL: '179.54' },
  ]
}
