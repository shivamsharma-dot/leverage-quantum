import { useState, useEffect } from 'react'

const SHEET_ID = import.meta.env.VITE_ROAS_SHEET_ID
const API_KEY  = import.meta.env.VITE_SHEETS_API_KEY

// Fetch a named range from Google Sheets
async function fetchSheetRange(sheetName, range) {
  const fullRange = `${sheetName}!${range}`
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(fullRange)}?key=${API_KEY}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Sheets API error: ${res.status}`)
  const data = await res.json()
  return data.values || []
}

// Parse the ROAS sheet into usable objects
function parseROASData(rows) {
  if (!rows || rows.length < 2) return []

  const headers = rows[0]
  return rows.slice(1).map(row => {
    const obj = {}
    headers.forEach((h, i) => {
      obj[h] = row[i] || ''
    })
    return obj
  })
}

export function useROASData() {
  const [data, setData]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      // Fetches the main campaign data from Nov-2025 sheet
      // Adjust sheet name and range to match your actual sheet
      const rows = await fetchSheetRange('Nov-2025', 'A4:Y200')
      const parsed = parseROASData(rows)
      setData(parsed)
      setLastUpdated(new Date())
    } catch (err) {
      setError(err.message)
      // Fall back to demo data so the UI still renders
      setData(getDemoData())
      setLastUpdated(new Date())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  return { data, loading, error, refetch: fetchData, lastUpdated }
}

// Demo data — shown when Sheets API isn't configured yet
// Mirrors the structure of your actual ROAS sheet
function getDemoData() {
  return [
    { Channel: 'Facebook', 'Campaign Name': 'PMX_FB_UK_LeadGen_18Aug25_Leverage_RAU', 'Amount Spent': '₹13,06,504', OPPs: '1477', QLs: '357', STUs: '40', 'AC Revenue': '530000', 'VAS Revenue': '0', 'L to Q%': '24.17%', 'Ql to App': '11.20%', CPL: '884.57', CPQL: '3,659.67', ROAS: '0.41' },
    { Channel: 'Facebook', 'Campaign Name': 'PMX_FB_Italy_LeadGen_8Sep25_Jan_2026_Ad3', 'Amount Spent': '₹10,41,967', OPPs: '4362', QLs: '849', STUs: '44', 'AC Revenue': '1705000', 'VAS Revenue': '0', 'L to Q%': '19.46%', 'Ql to App': '5.18%', CPL: '238.87', CPQL: '1,227.29', ROAS: '1.64' },
    { Channel: 'Facebook', 'Campaign Name': 'PMX_FB_UK_LeadGen_18Aug25_Leverage_STU', 'Amount Spent': '₹9,54,249', OPPs: '1067', QLs: '175', STUs: '20', 'AC Revenue': '0', 'VAS Revenue': '0', 'L to Q%': '16.40%', 'Ql to App': '11.43%', CPL: '894.33', CPQL: '5,452.85', ROAS: '0.00' },
    { Channel: 'Google', 'Campaign Name': 'PMX_Search_UK_Brand_Exact_21062024', 'Amount Spent': '₹8,23,441', OPPs: '2341', QLs: '412', STUs: '38', 'AC Revenue': '890000', 'VAS Revenue': '210000', 'L to Q%': '17.60%', 'Ql to App': '9.22%', CPL: '351.75', CPQL: '1,998.64', ROAS: '1.34' },
    { Channel: 'Google', 'Campaign Name': 'PMX_Search_UK_Non_Brand_Competitors_Delhi_NCR', 'Amount Spent': '₹7,82,867', OPPs: '1890', QLs: '322', STUs: '29', 'AC Revenue': '620000', 'VAS Revenue': '0', 'L to Q%': '17.04%', 'Ql to App': '9.01%', CPL: '414.22', CPQL: '2,431.57', ROAS: '0.79' },
    { Channel: 'Google', 'Campaign Name': 'PMX_PerformanceMax_Uk_Footwork_QL', 'Amount Spent': '₹6,91,234', OPPs: '1420', QLs: '280', STUs: '25', 'AC Revenue': '540000', 'VAS Revenue': '185000', 'L to Q%': '19.72%', 'Ql to App': '8.93%', CPL: '486.79', CPQL: '2,468.69', ROAS: '1.05' },
    { Channel: 'Facebook', 'Campaign Name': 'PMX_FB_Germany_LeadGen_12Sep25', 'Amount Spent': '₹4,19,220', OPPs: '2335', QLs: '376', STUs: '16', 'AC Revenue': '424980', 'VAS Revenue': '0', 'L to Q%': '16.10%', 'Ql to App': '4.26%', CPL: '179.54', CPQL: '1,114.95', ROAS: '1.01' },
    { Channel: 'LinkedIn', 'Campaign Name': 'PMX_Linkedin_Germany2026_6thOct', 'Amount Spent': '₹3,20,000', OPPs: '412', QLs: '88', STUs: '9', 'AC Revenue': '195000', 'VAS Revenue': '0', 'L to Q%': '21.36%', 'Ql to App': '10.23%', CPL: '776.70', CPQL: '3,636.36', ROAS: '0.61' },
    { Channel: 'Facebook', 'Campaign Name': 'PMX_FB_UK_LeadGen_RestofIndia_iOS', 'Amount Spent': '₹9,04,241', OPPs: '599', QLs: '97', STUs: '16', 'AC Revenue': '218000', 'VAS Revenue': '0', 'L to Q%': '16.19%', 'Ql to App': '16.49%', CPL: '1509.58', CPQL: '9,322.07', ROAS: '0.24' },
    { Channel: 'Google', 'Campaign Name': 'PMX_Search_UK_Non_Brand_Course_India', 'Amount Spent': '₹7,32,468', OPPs: '1678', QLs: '298', STUs: '27', 'AC Revenue': '580000', 'VAS Revenue': '120000', 'L to Q%': '17.76%', 'Ql to App': '9.06%', CPL: '436.51', CPQL: '2,457.61', ROAS: '0.96' },
  ]
}
