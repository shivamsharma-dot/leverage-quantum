import { useState, useMemo, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, ScatterChart, Scatter, ZAxis } from 'recharts'
import Sidebar from '../components/Sidebar'
import ExportButton from '../components/ExportButton'
import styles from './MTDDashboard.module.css'

const SHEET_ID = '1OsMJ4QZ9XGRjvCig41zMBF0ZFKu7adeyxrmdCmCV-bk'
const API_KEY  = 'AIzaSyAcDcr-0k4W_uUv8Va62QGg5maro5vT5C8'
const CH_COLORS = { Facebook:'#6366F1', Google:'#10B981', LinkedIn:'#60A5FA', Bing:'#F59E0B' }

function parseInr(v){
  if(!v)return 0
  return parseFloat(String(v).replace(/[₹,\s]/g,''))||0
}

async function fetchLiveData(){
  try {
    // Get sheet metadata to find Summary tab
    const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?key=${API_KEY}`)
    const meta = await metaRes.json()
    const sheets = meta.sheets||[]
    
    // Find Summary or first sheet
    const sheet = sheets.find(s=>s.properties.title.toLowerCase().includes('summary'))||sheets[0]
    const tabName = sheet.properties.title
    
    // Fetch data rows
    const range = encodeURIComponent(`${tabName}!A1:S500`)
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?key=${API_KEY}`)
    const json = await res.json()
    const rows = json.values||[]
    
    if(rows.length < 3) return null
    
    // Row 0 = headers, Row 1 = alignment, Row 2 = summary, Row 3+ = campaigns
    const headers = rows[0]
    const campaigns = []
    
    for(let i=2; i<rows.length; i++){
      const row = rows[i]
      if(!row[1]||!['Facebook','Google','LinkedIn','Bing'].includes(row[1])) continue
      campaigns.push({
        name:      row[0]||'',
        source:    row[1]||'',
        spend:     parseInr(row[2]),
        leads:     parseInr(row[3]),
        floor:     parseInr(row[4]),
        queued:    parseInr(row[5]),
        qualified: parseInr(row[6]),
        lead_ql_pct: row[7]||'',
        apps:      parseInr(row[8]),
        cpl:       parseInr(row[9]),
        cpql:      parseInr(row[10]),
        cpa:       parseInr(row[11]),
        est_rau:   parseInr(row[12]),
        sr_rev:    parseInr(row[13]),
        ac_rev:    parseInr(row[14]),
        vas_rev:   parseInr(row[15]),
        total_rev: parseInr(row[16]),
        roas:      parseInr(row[17]),
      })
    }
    return campaigns.length > 0 ? campaigns : null
  } catch(e) {
    console.warn('Live fetch failed:', e.message)
    return null
  }
}

// Fallback embedded data
const FALLBACK = [{"name":"PMX_FB_Direct_MBBS_LeadGen_Euope_09Apr26_Ad2-MBBS_EU3","source":"Facebook","spend":172371.0,"leads":619.0,"floor":619.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":278.47,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Direct_MBBS_LeadGen_Euope_09Apr26_Ad2-MBBS_EU5","source":"Facebook","spend":209924.0,"leads":615.0,"floor":615.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":341.34,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Direct_MBBS_LeadGen_Euope_16Mar26_Ad2-MBBS_EU2","source":"Facebook","spend":48189.0,"leads":168.0,"floor":168.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":286.84,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Direct_MBBS_LeadGen_Europe_16Mar26_Ad1-MBBS_EU1","source":"Facebook","spend":72338.0,"leads":270.0,"floor":270.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":267.92,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Direct_MBBS_LeadGen_Italy_9Dec25_Ad1","source":"Facebook","spend":99094.0,"leads":641.0,"floor":641.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":154.59,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Direct_MBBS_LeadGen_Italy_9Dec25_Ad2","source":"Facebook","spend":48678.0,"leads":267.0,"floor":267.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":182.31,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Direct_MBBS_LeadGen_Italy_9Dec25_Ad3","source":"Facebook","spend":103564.0,"leads":276.0,"floor":276.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":375.23,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Direct_MBBS_LeadGen_Video_4Apr26_Ad1-Simora_MBBS_Vid1","source":"Facebook","spend":74052.0,"leads":299.0,"floor":299.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":247.67,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Dubai_Lead_India_Sep_2026_Video_17Mar26_Ad2-DVasu1","source":"Facebook","spend":36250.0,"leads":153.0,"floor":153.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":236.93,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Dubai_LeadGen_May_2026_7May26_Ad6-D20","source":"Facebook","spend":209997.0,"leads":1056.0,"floor":1056.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":9.0,"cpl":198.86,"cpql":0.0,"cpa":23332.99,"est_rau":0.81,"sr_rev":283500.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":283500.0,"roas":1.4},{"name":"PMX_FB_Dubai_LeadGen_Sep_2026_12Jan26_Ad5-D19","source":"Facebook","spend":69705.0,"leads":247.0,"floor":247.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":7.0,"cpl":282.21,"cpql":0.0,"cpa":9957.87,"est_rau":0.63,"sr_rev":220500.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":220500.0,"roas":3.2},{"name":"PMX_FB_final_form_study_abroad_consultant","source":"Facebook","spend":0.0,"leads":3.0,"floor":1.0,"queued":2.0,"qualified":3.0,"lead_ql_pct":"150%","apps":1.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.09,"sr_rev":31500.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":31500.0,"roas":0.0},{"name":"PMX_FB_final_form_study_abroad_consultant_Germany","source":"Facebook","spend":0.0,"leads":216.0,"floor":27.0,"queued":189.0,"qualified":64.0,"lead_ql_pct":"34%","apps":2.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.18,"sr_rev":63000.0,"ac_rev":0.0,"vas_rev":51200.0,"total_rev":114200.0,"roas":0.0},{"name":"PMX_FB_final_form_study_abroad_consultant_Ireland","source":"Facebook","spend":0.0,"leads":1.0,"floor":0.0,"queued":1.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_final_form_study_abroad_consultant_Italy","source":"Facebook","spend":0.0,"leads":1520.0,"floor":361.0,"queued":1159.0,"qualified":318.0,"lead_ql_pct":"27%","apps":3.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.27,"sr_rev":94500.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":94500.0,"roas":0.0},{"name":"PMX_FB_final_form_study_abroad_consultant_MBBS","source":"Facebook","spend":0.0,"leads":526.0,"floor":526.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_final_form_study_abroad_consultant_Nigeria","source":"Facebook","spend":0.0,"leads":1168.0,"floor":847.0,"queued":321.0,"qualified":2.0,"lead_ql_pct":"1%","apps":13.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":1.17,"sr_rev":409500.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":409500.0,"roas":0.0},{"name":"PMX_FB_final_form_study_abroad_consultant_OEuropeC","source":"Facebook","spend":0.0,"leads":6.0,"floor":0.0,"queued":6.0,"qualified":2.0,"lead_ql_pct":"33%","apps":0.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_final_form_study_abroad_consultant_UK","source":"Facebook","spend":0.0,"leads":1029.0,"floor":169.0,"queued":860.0,"qualified":204.0,"lead_ql_pct":"24%","apps":8.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.72,"sr_rev":252000.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":252000.0,"roas":0.0},{"name":"PMX_FB_final_form_study-abroad-consultant-dubai","source":"Facebook","spend":0.0,"leads":310.0,"floor":310.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Ger_Shafein_LeadGen_Sep_2026_31Mar26_Ad3-GER20","source":"Facebook","spend":28108.0,"leads":99.0,"floor":99.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":283.92,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Ger_Shafein_LeadGen_Sep_2026_5Jan26_Ad1-GER9 - Copy","source":"Facebook","spend":0.0,"leads":45.0,"floor":45.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Ger_Shafein_LeadGen_Sep_2026_5Jan26_Ad2-GER10","source":"Facebook","spend":399172.0,"leads":1140.0,"floor":1140.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":5.0,"cpl":350.15,"cpql":0.0,"cpa":79834.33,"est_rau":0.45,"sr_rev":157500.0,"ac_rev":220000.0,"vas_rev":0.0,"total_rev":377500.0,"roas":0.9},{"name":"PMX_FB_Ger_Shafein_LeadGen_Sep_2026_5Jan26_Ad2-GER10 - Copy","source":"Facebook","spend":0.0,"leads":4.0,"floor":4.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Germany_LeadGen_12Sep25Jan_2026_NAS_Video_Edushala","source":"Facebook","spend":0.0,"leads":3.0,"floor":1.0,"queued":2.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Germany_LeadGen_18Aug25_RestofIndia_Jan_2026_Video_Ad2","source":"Facebook","spend":0.0,"leads":1.0,"floor":0.0,"queued":1.0,"qualified":0.0,"lead_ql_pct":"0%","apps":1.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.09,"sr_rev":31500.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":31500.0,"roas":0.0},{"name":"PMX_FB_Germany_LeadGen_25Aug25_RestofIndia_Jan_2026_Ad5","source":"Facebook","spend":0.0,"leads":1.0,"floor":0.0,"queued":1.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Germany_LeadGen_India_Sep_2026_Lookalike1%_16Feb26_Ad6-GER16","source":"Facebook","spend":0.0,"leads":1.0,"floor":1.0,"queued":0.0,"qualified":13.0,"lead_ql_pct":"0%","apps":6.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.54,"sr_rev":189000.0,"ac_rev":0.0,"vas_rev":304442.0,"total_rev":493442.0,"roas":0.0},{"name":"PMX_FB_Germany_LeadGen_India_Sep_2026_Lookalike1%_20Mar26_Ad8-GER19","source":"Facebook","spend":0.0,"leads":1.0,"floor":1.0,"queued":0.0,"qualified":3.0,"lead_ql_pct":"0%","apps":7.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.63,"sr_rev":220500.0,"ac_rev":470000.0,"vas_rev":0.0,"total_rev":690500.0,"roas":0.0},{"name":"PMX_FB_Germany_LeadGen_India_Sep_2026_Lookalike1%_21Jan26_Ad3-GER11","source":"Facebook","spend":0.0,"leads":1.0,"floor":1.0,"queued":0.0,"qualified":2.0,"lead_ql_pct":"0%","apps":1.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.09,"sr_rev":31500.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":31500.0,"roas":0.0},{"name":"PMX_FB_Germany_LeadGen_India_Sep_2026_Mohammad_Lookalike1%_8May26_Ad10-GER21","source":"Facebook","spend":86667.0,"leads":326.0,"floor":51.0,"queued":275.0,"qualified":82.0,"lead_ql_pct":"30%","apps":1.0,"cpl":265.85,"cpql":1056.91,"cpa":86666.51,"est_rau":0.09,"sr_rev":31500.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":31500.0,"roas":0.4},{"name":"PMX_FB_Germany_LeadGen_India_Sep_2026_Mohammad_Lookalike1%_8May26_Ad9-GER20","source":"Facebook","spend":2223.0,"leads":10.0,"floor":3.0,"queued":7.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":222.27,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Germany_LeadGen_ROI_Sep_2026_1Jan26_27Mar26_Ad8-GER19","source":"Facebook","spend":0.0,"leads":1.0,"floor":1.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Germany_LeadGen_Video_Infu_AP_TG_Sep_2026_12Mar26-Ger_Prudvi","source":"Facebook","spend":0.0,"leads":1.0,"floor":1.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":2.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.18,"sr_rev":63000.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":63000.0,"roas":0.0},{"name":"PMX_FB_IGF_KD_LeadGen_Sep_2026_13Mar26_UK_RG1","source":"Facebook","spend":3578.0,"leads":15.0,"floor":15.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":238.54,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_IGF_KD_LeadGen_Sep_2026_16Feb26_Ad2-GER10","source":"Facebook","spend":1645.0,"leads":6.0,"floor":6.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":2.0,"cpl":274.15,"cpql":0.0,"cpa":822.45,"est_rau":0.18,"sr_rev":63000.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":63000.0,"roas":38.3},{"name":"PMX_FB_IGF_KD_LeadGen_Sep_2026_16Feb26_Ad2-ITA12","source":"Facebook","spend":3134.0,"leads":9.0,"floor":9.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":1.0,"cpl":348.24,"cpql":0.0,"cpa":3134.13,"est_rau":0.09,"sr_rev":31500.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":31500.0,"roas":10.1},{"name":"PMX_FB_IGF_KD_LeadGen_Sep_2026_16Feb26_Ad3-GER16","source":"Facebook","spend":1633.0,"leads":9.0,"floor":9.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":181.47,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_IRL_Srishti_LeadGen_Sep_2026_2Feb26_Ad1-IRE1","source":"Facebook","spend":1547.0,"leads":10.0,"floor":10.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":154.66,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_IRL_Srishti_LeadGen_Sep_2026_2Feb26_Ad1-IRE3","source":"Facebook","spend":1946.0,"leads":11.0,"floor":11.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":176.95,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_IRL_Srishti_LeadGen_Sep_2026_2Mar26_Ad1-IRE5","source":"Facebook","spend":907.0,"leads":1.0,"floor":1.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":906.61,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_IRL_Srishti_LeadGen_Sep_2026_2Mar26_Ad1-IRE6","source":"Facebook","spend":624.0,"leads":5.0,"floor":5.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":124.79,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_ITA_Krishna_LeadGen_12Apr26_LE_Exp_New_Geo1_Ad1-ITA1_KK","source":"Facebook","spend":8202.0,"leads":45.0,"floor":45.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":182.26,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_ITA_Krishna_LeadGen_12Apr26_LE_Exp_New_Geo1_Ad5-ITA5_KK","source":"Facebook","spend":140844.0,"leads":817.0,"floor":817.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":1.0,"cpl":172.39,"cpql":0.0,"cpa":140843.58,"est_rau":0.09,"sr_rev":31500.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":31500.0,"roas":0.2},{"name":"PMX_FB_ITA_Krishna_LeadGen_12Apr26_LE_Exp_New_Geo1_Ad6-ITA6_KK","source":"Facebook","spend":74.0,"leads":1.0,"floor":1.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":74.27,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_ITA_Krishna_LeadGen_18May26_LE_Exp_New_Geo1_Ad5-ITA7_KK","source":"Facebook","spend":87711.0,"leads":223.0,"floor":223.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":393.32,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_ITA_Krishna_LeadGen_Parents_13Apr26_LE_Exp_New_Ad6-ITA7_KK","source":"Facebook","spend":63090.0,"leads":97.0,"floor":97.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":650.41,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_ITA_Shafein_LeadGen_Sep_2026_12Feb26_Ad3-ITA17","source":"Facebook","spend":49822.0,"leads":162.0,"floor":162.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":307.55,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_ITA_Shafein_LeadGen_Sep_2026_12Feb26_Ad4-ITA20","source":"Facebook","spend":149876.0,"leads":659.0,"floor":659.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":227.43,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_ITA_Shafein_LeadGen_Sep_2026_12Feb26_Ad5-ITA19","source":"Facebook","spend":300077.0,"leads":931.0,"floor":931.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":322.32,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_ITA_Shafein_LeadGen_Sep_2026_5Jan26_Ad2-ITA12","source":"Facebook","spend":0.0,"leads":1.0,"floor":1.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_ITA_Shafein_LeadGen_Sep_2026_5Jan26_Video_Ad1-ITA_Inhouse","source":"Facebook","spend":463.0,"leads":3.0,"floor":3.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":154.3,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Italy_LeadGen_10Oct25_Jan_2026_Ad5_28Nov25_ITA5 - Copy","source":"Facebook","spend":0.0,"leads":1.0,"floor":0.0,"queued":1.0,"qualified":1.0,"lead_ql_pct":"100%","apps":0.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Italy_LeadGen_4Sep25_Jan_2026_Ad3","source":"Facebook","spend":0.0,"leads":1.0,"floor":0.0,"queued":1.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Italy_LeadGen_8Sep25_Jan_2026_Ad8_22Dec25_ITA10","source":"Facebook","spend":0.0,"leads":37.0,"floor":5.0,"queued":32.0,"qualified":13.0,"lead_ql_pct":"41%","apps":0.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Italy_LeadGen_Sep_2026_1Jan26_Ad1-ITA11","source":"Facebook","spend":642743.0,"leads":1823.0,"floor":352.0,"queued":1471.0,"qualified":401.0,"lead_ql_pct":"27%","apps":6.0,"cpl":352.57,"cpql":1602.85,"cpa":107123.76,"est_rau":0.54,"sr_rev":189000.0,"ac_rev":297871.0,"vas_rev":0.0,"total_rev":486871.0,"roas":0.8},{"name":"PMX_FB_Italy_LeadGen_Sep_2026_1Jan26_Ad1-ITA11 - Copy","source":"Facebook","spend":0.0,"leads":24.0,"floor":6.0,"queued":18.0,"qualified":6.0,"lead_ql_pct":"33%","apps":0.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Italy_LeadGen_Sep_2026_1Jan26_Ad1-ITA23","source":"Facebook","spend":472220.0,"leads":2085.0,"floor":193.0,"queued":1892.0,"qualified":440.0,"lead_ql_pct":"23%","apps":8.0,"cpl":226.48,"cpql":1073.23,"cpa":59027.44,"est_rau":0.72,"sr_rev":252000.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":252000.0,"roas":0.5},{"name":"PMX_FB_Italy_LeadGen_Sep_2026_26Feb26_Ad7-ITA21 - Copy","source":"Facebook","spend":0.0,"leads":3.0,"floor":0.0,"queued":3.0,"qualified":1.0,"lead_ql_pct":"33%","apps":0.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Italy_LeadGen_Sep_2026_2Jan26_Ad1-ITA12 - Copy","source":"Facebook","spend":0.0,"leads":2.0,"floor":1.0,"queued":1.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Italy_LeadGen_Sep_2026_2Jan26_Ad1-ITA13 - Copy","source":"Facebook","spend":0.0,"leads":1.0,"floor":0.0,"queued":1.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Italy_LeadGen_Sep_2026_2Jan26_Ad6-ITA14","source":"Facebook","spend":0.0,"leads":3.0,"floor":2.0,"queued":1.0,"qualified":4.0,"lead_ql_pct":"400%","apps":0.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Italy_LeadGen_Sep_2026_4April26_Ad7-ITA21","source":"Facebook","spend":21689.0,"leads":65.0,"floor":11.0,"queued":54.0,"qualified":15.0,"lead_ql_pct":"28%","apps":1.0,"cpl":333.67,"cpql":1445.92,"cpa":21688.78,"est_rau":0.09,"sr_rev":31500.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":31500.0,"roas":1.5},{"name":"PMX_FB_Italy_LeadGen_Sep_2026_9Jan26_Test_Ad1-ITA17 - Copy","source":"Facebook","spend":0.0,"leads":4.0,"floor":0.0,"queued":4.0,"qualified":1.0,"lead_ql_pct":"25%","apps":0.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Italy_LeadGen_Sep_2026_9Jan26_Test_Ad4-ITA19 - Copy","source":"Facebook","spend":0.0,"leads":12.0,"floor":1.0,"queued":11.0,"qualified":3.0,"lead_ql_pct":"27%","apps":1.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.09,"sr_rev":31500.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":31500.0,"roas":0.0},{"name":"PMX_FB_Italy_LeadGen_Sep_2026_9Jan26_Test_Ad4-ITA20 - Copy","source":"Facebook","spend":0.0,"leads":16.0,"floor":0.0,"queued":16.0,"qualified":5.0,"lead_ql_pct":"31%","apps":0.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Italy_Leadgen_Sep_2026_CTWA_13Mar26_Ad1_ITA11","source":"Facebook","spend":5766.0,"leads":497.0,"floor":497.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":11.6,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Italy_LeadGen_Sep_2026_LeadFormSubmitted_Lookalike_1%_11Mar26_Ad3-ITA11","source":"Facebook","spend":89633.0,"leads":357.0,"floor":121.0,"queued":236.0,"qualified":65.0,"lead_ql_pct":"28%","apps":1.0,"cpl":251.07,"cpql":1378.97,"cpa":89632.99,"est_rau":0.09,"sr_rev":31500.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":31500.0,"roas":0.4},{"name":"PMX_FB_Italy_LeadGen_Sep_2026_LeadFormSubmitted_Lookalike_1%_11Mar26_Ad3-ITA15","source":"Facebook","spend":71888.0,"leads":434.0,"floor":109.0,"queued":325.0,"qualified":111.0,"lead_ql_pct":"34%","apps":0.0,"cpl":165.64,"cpql":647.64,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Italy_LeadGen_Sep_2026_LeadFormSubmitted_Lookalike_1%_11Mar26_Ad4-ITA12","source":"Facebook","spend":12581.0,"leads":57.0,"floor":21.0,"queued":36.0,"qualified":12.0,"lead_ql_pct":"33%","apps":0.0,"cpl":220.72,"cpql":1048.43,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Italy_LeadGen_Sep_2026_LeadFormSubmitted_Lookalike_1%_11Mar26_Ad5-ITA13","source":"Facebook","spend":671.0,"leads":2.0,"floor":1.0,"queued":1.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":335.54,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Italy_LeadGen_Sep_2026_LeadFormSubmitted_Lookalike_1%_11Mar26_Ad6-ITA14","source":"Facebook","spend":682.0,"leads":2.0,"floor":1.0,"queued":1.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":341.1,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Italy_LeadGen_Sep_2026_Lookalike1%_12Jan26_Ad3-ITA11","source":"Facebook","spend":479784.0,"leads":1390.0,"floor":433.0,"queued":957.0,"qualified":298.0,"lead_ql_pct":"31%","apps":11.0,"cpl":345.17,"cpql":1610.01,"cpa":43616.7,"est_rau":0.99,"sr_rev":346500.0,"ac_rev":20000.0,"vas_rev":5000.0,"total_rev":371500.0,"roas":0.8},{"name":"PMX_FB_Italy_LeadGen_Sep_2026_Lookalike1%_12Jan26_Ad3-ITA15","source":"Facebook","spend":212912.0,"leads":981.0,"floor":150.0,"queued":831.0,"qualified":219.0,"lead_ql_pct":"26%","apps":1.0,"cpl":217.04,"cpql":972.2,"cpa":212912.47,"est_rau":0.09,"sr_rev":31500.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":31500.0,"roas":0.1},{"name":"PMX_FB_Italy_LeadGen_Sep_2026_Lookalike1%_12Jan26_Ad4-ITA12","source":"Facebook","spend":213810.0,"leads":624.0,"floor":275.0,"queued":349.0,"qualified":103.0,"lead_ql_pct":"30%","apps":1.0,"cpl":342.64,"cpql":2075.83,"cpa":213810.44,"est_rau":0.09,"sr_rev":31500.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":31500.0,"roas":0.1},{"name":"PMX_FB_Italy_LeadGen_Sep_2026_Lookalike1%_12Jan26_Ad6-ITA14","source":"Facebook","spend":67186.0,"leads":191.0,"floor":80.0,"queued":111.0,"qualified":20.0,"lead_ql_pct":"18%","apps":0.0,"cpl":351.76,"cpql":3359.31,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":425624.0,"vas_rev":0.0,"total_rev":425624.0,"roas":6.3},{"name":"PMX_FB_Italy_LeadGen_Sep_2026_tCPA_1Jan26_Ad2-ITA5","source":"Facebook","spend":34445.0,"leads":144.0,"floor":38.0,"queued":106.0,"qualified":7.0,"lead_ql_pct":"7%","apps":0.0,"cpl":239.2,"cpql":4920.68,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Italy_LeadGen_Sep_2026_tCPA_1Jan26_Ad3-ITA11","source":"Facebook","spend":365181.0,"leads":1193.0,"floor":396.0,"queued":797.0,"qualified":205.0,"lead_ql_pct":"26%","apps":5.0,"cpl":306.1,"cpql":1781.37,"cpa":73036.1,"est_rau":0.45,"sr_rev":157500.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":157500.0,"roas":0.4},{"name":"PMX_FB_Italy_LeadGen_Sep_2026_tCPA_1Jan26_Ad3-ITA16","source":"Facebook","spend":421196.0,"leads":1946.0,"floor":334.0,"queued":1612.0,"qualified":391.0,"lead_ql_pct":"24%","apps":4.0,"cpl":216.44,"cpql":1077.23,"cpa":105299.0,"est_rau":0.36,"sr_rev":126000.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":126000.0,"roas":0.3},{"name":"PMX_FB_Italy_LeadGen_Sep_2026_tCPA_2Jan26_Ad4-ITA12","source":"Facebook","spend":119750.0,"leads":331.0,"floor":118.0,"queued":213.0,"qualified":52.0,"lead_ql_pct":"24%","apps":1.0,"cpl":361.78,"cpql":2302.88,"cpa":119749.78,"est_rau":0.09,"sr_rev":31500.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":31500.0,"roas":0.3},{"name":"PMX_FB_Italy_LeadGen_Sep_2026_tCPA_2Jan26_Ad5-ITA13","source":"Facebook","spend":27108.0,"leads":100.0,"floor":35.0,"queued":65.0,"qualified":9.0,"lead_ql_pct":"14%","apps":1.0,"cpl":271.08,"cpql":3012.01,"cpa":27108.11,"est_rau":0.09,"sr_rev":31500.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":31500.0,"roas":1.2},{"name":"PMX_FB_Italy_LeadGen_Sep_2026_tCPA_2Jan26_Ad6-ITA14","source":"Facebook","spend":29549.0,"leads":102.0,"floor":38.0,"queued":64.0,"qualified":12.0,"lead_ql_pct":"19%","apps":0.0,"cpl":289.69,"cpql":2462.39,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Italy_LeadGen_Sep_2026_Video_3Jan26-ITA_Inhouse - Copy","source":"Facebook","spend":0.0,"leads":2.0,"floor":0.0,"queued":2.0,"qualified":1.0,"lead_ql_pct":"50%","apps":0.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Italy_LeadGen_Sep_2026_Video_9Apr26-ItalySimoraVid1","source":"Facebook","spend":24791.0,"leads":69.0,"floor":16.0,"queued":53.0,"qualified":24.0,"lead_ql_pct":"45%","apps":0.0,"cpl":359.29,"cpql":1032.97,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_IVY100_22May26_Masters_Ad1-video","source":"Facebook","spend":14734.0,"leads":1.0,"floor":1.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":14734.4,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_IVY100_28Jan26_Masters_Ad1","source":"Facebook","spend":108139.0,"leads":1.0,"floor":1.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":108139.31,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_IVY100_MBA1_30Mar26_Ad1-IVY_MBA_ISB1","source":"Facebook","spend":138599.0,"leads":1.0,"floor":1.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":138598.75,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_IVY100_UG_Parents_28Mar26_Ad1","source":"Facebook","spend":118012.0,"leads":2.0,"floor":2.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":59006.22,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_LeadGen_UK_Accelerator_18Apr26_LE_Exp_Ad1-UK_Acc1","source":"Facebook","spend":173060.0,"leads":680.0,"floor":679.0,"queued":1.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":254.5,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_LeadGen_UK_Accelerator_18Apr26_LE_Exp_Ad1-UK_Acc3","source":"Facebook","spend":85043.0,"leads":91.0,"floor":91.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":2.0,"cpl":934.54,"cpql":0.0,"cpa":42521.62,"est_rau":0.18,"sr_rev":63000.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":63000.0,"roas":0.7},{"name":"PMX_FB_LeadGen_UK_Accelerator_18Apr26_LE_Exp_Ad1-UK_Acc4","source":"Facebook","spend":896.0,"leads":2.0,"floor":2.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":448.09,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_LeadGen_UK_Accelerator_18Apr26_LE_Exp_Ad1-UK_Acc5","source":"Facebook","spend":103296.0,"leads":120.0,"floor":120.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":1.0,"cpl":860.8,"cpql":0.0,"cpa":103296.19,"est_rau":0.09,"sr_rev":31500.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":31500.0,"roas":0.3},{"name":"PMX_FB_LeadGen_UK_Accelerator_20May26_LE_Exp_New-Ad1","source":"Facebook","spend":21868.0,"leads":25.0,"floor":25.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":874.71,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_LevCareers_Nursing_19Feb26_RJ_Adv+_19Feb'26_Ad6-Nur12","source":"Facebook","spend":0.0,"leads":1.0,"floor":0.0,"queued":1.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_LevCareers_Nursing_24Dec25_Lookalike_Intrested_1%_Ad3-Nur1","source":"Facebook","spend":0.0,"leads":1.0,"floor":1.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_LevCareers_Nursing_26Feb25_Adv+_TG_26Feb25_Ad3-Nur1","source":"Facebook","spend":0.0,"leads":3.0,"floor":3.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_LevCareers_Nursing_26Feb25_Adv+_TG_26Feb25_Ad6-Nur12","source":"Facebook","spend":0.0,"leads":1.0,"floor":1.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_LevCareers_Nursing_26Feb25_Adv+_TG_26Feb25_Ad7-Nur13","source":"Facebook","spend":0.0,"leads":2.0,"floor":2.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_LevCareers_Nursing_27Feb25_Punjab_tCPA_27Feb25_Ad6-Nur12","source":"Facebook","spend":0.0,"leads":1.0,"floor":1.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_LevCareers_Nursing_3Oct25_Delhi_NCR_Bsc_Nursing_Ad1_w/o_ANM","source":"Facebook","spend":0.0,"leads":1.0,"floor":1.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_LevCareers_Nursing_CTWA_India_LC1_9Apr26-Nur_SimoraVideo1","source":"Facebook","spend":0.0,"leads":1.0,"floor":1.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_LevCareers_Nursing_LC1_29Apr26_India_Adv+_Ad10-Nur10","source":"Facebook","spend":0.0,"leads":3.0,"floor":3.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_LevCareers_Nursing_LC1_India_Adv+_28thMar26_video1","source":"Facebook","spend":0.0,"leads":1.0,"floor":1.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_LevCareers_Nursing_LC1_India_Adv+_28thMar26_video1_New","source":"Facebook","spend":0.0,"leads":3.0,"floor":3.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_LevOnline_UG_Online_India_Lead_Form_29Apr26-Ad1","source":"Facebook","spend":0.0,"leads":370.0,"floor":19.0,"queued":351.0,"qualified":7.0,"lead_ql_pct":"2%","apps":0.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_MBBS","source":"Facebook","spend":0.0,"leads":1.0,"floor":1.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Nigeria_Ghana_LeadGen_18Aug25_Jan_2026_Ad1","source":"Facebook","spend":0.0,"leads":1.0,"floor":1.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":1.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.09,"sr_rev":31500.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":31500.0,"roas":0.0},{"name":"PMX_FB_Nigeria_LeadGen_UK_Adset_Sep_2026_13Feb26_Test_Ad1-N8","source":"Facebook","spend":263163.0,"leads":2294.0,"floor":2294.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":18.0,"cpl":114.72,"cpql":0.0,"cpa":14620.15,"est_rau":1.62,"sr_rev":567000.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":567000.0,"roas":2.2},{"name":"PMX_FB_Nigeria_LeadGen_UK_Adset_Sep_2026_13Feb26_Test_Ad1-N9","source":"Facebook","spend":716.0,"leads":6.0,"floor":6.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":119.25,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Nigeria_LeadGen_UK_Adset_Sep_2026_13Mar26_Test2_Ad1-N10","source":"Facebook","spend":120709.0,"leads":940.0,"floor":940.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":3.0,"cpl":128.41,"cpql":0.0,"cpa":40236.25,"est_rau":0.27,"sr_rev":94500.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":94500.0,"roas":0.8},{"name":"PMX_FB_Nigeria_LeadGen_UK_Adset_Sep_2026_13Mar26_Test2_Ad1-N11","source":"Facebook","spend":55945.0,"leads":439.0,"floor":439.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":127.44,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Nigeria_LeadGen_UK_Adset_Sep_2026_13Mar26_Test2_Ad1-N6","source":"Facebook","spend":770.0,"leads":7.0,"floor":7.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":110.01,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Nigeria_LeadGen_UK_Adset_Sep_2026_13Mar26_Test2_Ad1-N7","source":"Facebook","spend":517.0,"leads":4.0,"floor":4.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":129.25,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Nigeria_LeadGen_UK_Adset_Sep_2026_13Mar26_Test2_Ad1-N8","source":"Facebook","spend":204864.0,"leads":2111.0,"floor":2111.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":8.0,"cpl":97.05,"cpql":0.0,"cpa":25607.98,"est_rau":0.72,"sr_rev":252000.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":252000.0,"roas":1.2},{"name":"PMX_FB_Nigeria_LeadGen_UK_Adset_Sep_2026_13Mar26_Test2_Ad1-N9","source":"Facebook","spend":256.0,"leads":3.0,"floor":3.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":85.4,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Nigeria_LeadGen_UK_Adset_Sep_2026_15Jan26_Test_Ad1-N6","source":"Facebook","spend":1005.0,"leads":2.0,"floor":2.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":502.33,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":454400.0,"total_rev":454400.0,"roas":452.3},{"name":"PMX_FB_Nigeria_LeadGen_UK_Adset_Sep_2026_15Jan26_Test_Ad1-N7","source":"Facebook","spend":1143.0,"leads":7.0,"floor":7.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":1.0,"cpl":163.34,"cpql":0.0,"cpa":1143.41,"est_rau":0.09,"sr_rev":31500.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":31500.0,"roas":27.5},{"name":"PMX_FB_Nigeria_LeadGen_UK_Adset_Sep_2026_16May26_Test_New_Creative_AD1_N10","source":"Facebook","spend":856.0,"leads":1.0,"floor":1.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":856.06,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Nigeria_LeadGen_UK_Adset_Sep_2026_22May26_Test-Video_Man","source":"Facebook","spend":18357.0,"leads":234.0,"floor":234.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":78.45,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Nigeria_LeadGen_UK_Adset_Sep_2026_22May26_Test-Video_Woman","source":"Facebook","spend":1752.0,"leads":18.0,"floor":18.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":97.32,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Nigeria_LeadGen_UK_Adset_Sep_2026_23Apr26_Ad2-Simora_Video","source":"Facebook","spend":148324.0,"leads":702.0,"floor":702.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":6.0,"cpl":211.29,"cpql":0.0,"cpa":24720.61,"est_rau":0.54,"sr_rev":189000.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":189000.0,"roas":1.3},{"name":"PMX_FB_Nigeria_LeadGen_UK_Adset_Sep_2026_27Feb26_New_Geo_Ad1-N6","source":"Facebook","spend":591.0,"leads":2.0,"floor":2.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":295.65,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Nigeria_LeadGen_UK_Adset_Sep_2026_27Feb26_New_Geo_Ad1-N7","source":"Facebook","spend":1323.0,"leads":7.0,"floor":7.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":188.95,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Nigeria_LeadGen_UK_Adset_Sep_2026_27Feb26_New_Geo_Ad1-N8","source":"Facebook","spend":207812.0,"leads":1648.0,"floor":1648.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":10.0,"cpl":126.1,"cpql":0.0,"cpa":20781.21,"est_rau":0.9,"sr_rev":315000.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":315000.0,"roas":1.5},{"name":"PMX_FB_Nigeria_LeadGen_UK_Adset_Sep_2026_27Feb26_New_Geo_Ad1-N9","source":"Facebook","spend":2186.0,"leads":5.0,"floor":5.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":437.18,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Nigeria_LeadGen_UK_Adset_Sep_2026_28Jan26_VideoAd1-NVid1","source":"Facebook","spend":34631.0,"leads":172.0,"floor":172.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":3.0,"cpl":201.34,"cpql":0.0,"cpa":11543.59,"est_rau":0.27,"sr_rev":94500.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":94500.0,"roas":2.7},{"name":"PMX_FB_Nigeria_LeadGen_UK_Adset_Sep_2026_28Jan26_VideoAd1-NVid2","source":"Facebook","spend":47024.0,"leads":135.0,"floor":135.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":348.33,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Nigeria_LeadGen_UK_Adset_Sep_2026_7Apr26_Ad1-Simora_Video","source":"Facebook","spend":3785.0,"leads":12.0,"floor":12.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":1.0,"cpl":315.4,"cpql":0.0,"cpa":3784.79,"est_rau":0.09,"sr_rev":31500.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":31500.0,"roas":8.3},{"name":"PMX_FB_OEuropeC_LeadGen_Gaurav_Gupta_Video_10Apr26-GGVid1_High_Hoke","source":"Facebook","spend":4302.0,"leads":17.0,"floor":1.0,"queued":16.0,"qualified":3.0,"lead_ql_pct":"19%","apps":2.0,"cpl":253.07,"cpql":1434.06,"cpa":2151.1,"est_rau":0.18,"sr_rev":63000.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":63000.0,"roas":14.6},{"name":"PMX_FB_OEuropeC_LeadGen_Gaurav_Gupta_Video_10Apr26-GGVid4_Galgotia","source":"Facebook","spend":4172.0,"leads":10.0,"floor":1.0,"queued":9.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":417.17,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_OEuropeC_LeadGen_Gaurav_Gupta_Video_8Apr26-GGVid1","source":"Facebook","spend":890.0,"leads":4.0,"floor":1.0,"queued":3.0,"qualified":3.0,"lead_ql_pct":"100%","apps":2.0,"cpl":222.57,"cpql":296.75,"cpa":445.13,"est_rau":0.18,"sr_rev":63000.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":63000.0,"roas":70.8},{"name":"PMX_FB_OEuropeC_LeadGen_Gaurav_Gupta_Video_8Apr26-GGVid3_Lund_Univ","source":"Facebook","spend":4625.0,"leads":11.0,"floor":2.0,"queued":9.0,"qualified":5.0,"lead_ql_pct":"56%","apps":4.0,"cpl":420.43,"cpql":924.94,"cpa":1156.17,"est_rau":0.36,"sr_rev":126000.0,"ac_rev":686000.0,"vas_rev":0.0,"total_rev":812000.0,"roas":175.6},{"name":"PMX_FB_Rahul","source":"Facebook","spend":0.0,"leads":1.0,"floor":0.0,"queued":1.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0},{"name":"PMX_FB_Rahul_LeadGen_GER_Sep_2026_11Apr26_Ad4-GER21","source":"Facebook","spend":12733.0,"leads":34.0,"floor":15.0,"queued":19.0,"qualified":5.0,"lead_ql_pct":"26%","apps":1.0,"cpl":374.51,"cpql":2546.64,"cpa":12733.18,"est_rau":0.09,"sr_rev":31500.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":31500.0,"roas":2.5},{"name":"PMX_FB_Srishti_ESP_LeadGen_14Apr26_Ad5-ESP5","source":"Facebook","spend":3706.0,"leads":11.0,"floor":11.0,"queued":0.0,"qualified":0.0,"lead_ql_pct":"0%","apps":1.0,"cpl":336.87,"cpql":0.0,"cpa":3705.61,"est_rau":0.09,"sr_rev":31500.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":31500.0,"roas":8.5},{"name":"PMX_FB_UK_LeadGen_12Sep25_Study_Abroad_Jan_2026_NAS_Video_Edushala","source":"Facebook","spend":0.0,"leads":1.0,"floor":0.0,"queued":1.0,"qualified":0.0,"lead_ql_pct":"0%","apps":0.0,"cpl":0.0,"cpql":0.0,"cpa":0.0,"est_rau":0.0,"sr_rev":0.0,"ac_rev":0.0,"vas_rev":0.0,"total_rev":0.0,"roas":0.0}]

function fmt(n){
  if(!n||isNaN(n))return'₹0'
  if(n>=1e7)return'₹'+(n/1e7).toFixed(2)+' Cr'
  if(n>=1e5)return'₹'+(n/1e5).toFixed(1)+'L'
  if(n>=1e3)return'₹'+(n/1e3).toFixed(1)+'K'
  return'₹'+Math.round(n).toLocaleString('en-IN')
}
function fn(n){return(n&&n>0)?n.toLocaleString('en-IN'):'–'}

function generateInsights(tot, bySource, topCPL, worstCPL){
  const insights = []
  
  // Overall health
  if(tot.roas >= 1){
    insights.push({type:'positive', icon:'↑', text:`Overall ROAS is ${tot.roas.toFixed(2)}x — revenue exceeds ad spend this month.`})
  } else {
    insights.push({type:'warning', icon:'!', text:`ROAS is ${tot.roas.toFixed(2)}x — spending more than earning. Revenue pipeline needs attention.`})
  }

  // CPL insight
  const avgCPL = tot.spend > 0 && tot.qualified > 0 ? tot.spend/tot.qualified : 0
  if(avgCPL > 0 && avgCPL < 1500){
    insights.push({type:'positive', icon:'↓', text:`Avg CPL of ₹${Math.round(avgCPL).toLocaleString()} is healthy. Top campaign: ${topCPL?.name?.slice(0,40)} at ₹${Math.round(topCPL?.cpl||0).toLocaleString()}/QL.`})
  } else if(avgCPL >= 1500) {
    insights.push({type:'warning', icon:'!', text:`Avg CPL of ₹${Math.round(avgCPL).toLocaleString()} is high. Review underperforming campaigns to reduce cost.`})
  }

  // QL conversion
  const qlPct = tot.leads > 0 ? (tot.qualified/tot.leads*100) : 0
  if(qlPct >= 15){
    insights.push({type:'positive', icon:'↑', text:`QL rate of ${qlPct.toFixed(1)}% is strong — Futwork qualification is performing well.`})
  } else if(qlPct > 0 && qlPct < 10){
    insights.push({type:'warning', icon:'↓', text:`QL rate is only ${qlPct.toFixed(1)}%. Large volume of leads not qualifying — check targeting quality.`})
  }

  // Spend concentration
  Object.entries(bySource).forEach(([src, v])=>{
    const pct = tot.spend > 0 ? v.spend/tot.spend*100 : 0
    if(pct > 60){
      insights.push({type:'info', icon:'i', text:`${src} accounts for ${pct.toFixed(0)}% of total spend. Consider diversifying to reduce channel risk.`})
    }
  })

  // Zero QL campaigns
  const zeroQL = Object.values(bySource).filter(v=>v.spend>100000&&v.qualified===0)
  if(zeroQL.length > 0){
    const totalWasted = zeroQL.reduce((s,v)=>s+v.spend,0)
    insights.push({type:'warning', icon:'!', text:`${zeroQL.length} source(s) have spent ${fmt(totalWasted)} with 0 qualified leads this month. Immediate review needed.`})
  }

  // Best performing source
  const bestSrc = Object.entries(bySource).sort((a,b)=>
    (b[1].qualified>0?b[1].spend/b[1].qualified:999999)-(a[1].qualified>0?a[1].spend/a[1].qualified:999999)
  ).reverse()[0]
  if(bestSrc && bestSrc[1].qualified > 0){
    const cpl = bestSrc[1].spend/bestSrc[1].qualified
    insights.push({type:'positive', icon:'↑', text:`${bestSrc[0]} has the best CPL at ₹${Math.round(cpl).toLocaleString()} with ${bestSrc[1].qualified.toLocaleString()} QLs generated.`})
  }

  return insights
}

export default function MTDDashboard(){
  const [campaigns, setCampaigns] = useState(FALLBACK)
  const [loading, setLoading]     = useState(true)
  const [isLive, setIsLive]       = useState(false)
  const [lastSync, setLastSync]   = useState(null)
  const [selSource, setSelSource] = useState('All')
  const [sortBy, setSortBy]       = useState('spend')
  const [search, setSearch]       = useState('')

  const loadData = async () => {
    setLoading(true)
    const live = await fetchLiveData()
    if(live && live.length > 0){
      setCampaigns(live)
      setIsLive(true)
    } else {
      setCampaigns(FALLBACK)
      setIsLive(false)
    }
    setLastSync(new Date())
    setLoading(false)
  }

  useEffect(()=>{ loadData() },[])
  // Auto refresh every 5 minutes
  useEffect(()=>{
    const t = setInterval(loadData, 5*60*1000)
    return ()=>clearInterval(t)
  },[])

  const filtered = useMemo(()=>{
    let rows = campaigns.filter(r=>
      (selSource==='All'||r.source===selSource)&&
      (!search||r.name.toLowerCase().includes(search.toLowerCase()))
    )
    rows.sort((a,b)=>{
      if(sortBy==='cpl')  return (a.cpl||9999)-(b.cpl||9999)
      if(sortBy==='cpql') return (a.cpql||9999)-(b.cpql||9999)
      return (b[sortBy]||0)-(a[sortBy]||0)
    })
    return rows
  },[campaigns,selSource,search,sortBy])

  const tot = useMemo(()=>{
    const t={spend:0,leads:0,floor:0,queued:0,qualified:0,apps:0,ac_rev:0,vas_rev:0,total_rev:0,est_rau:0,sr_rev:0}
    filtered.forEach(r=>{ Object.keys(t).forEach(k=>{ t[k]+=(r[k]||0) }) })
    t.cpl   = t.qualified>0 ? t.spend/t.qualified : 0
    t.cpql  = t.qualified>0 ? t.spend/t.qualified : 0
    t.cpa   = t.apps>0 ? t.spend/t.apps : 0
    t.ltq   = t.leads>0 ? (t.qualified/t.leads*100) : 0
    t.roas  = t.spend>0&&t.total_rev>0 ? t.total_rev/t.spend : 0
    return t
  },[filtered])

  const bySource = useMemo(()=>{
    const map={}
    campaigns.forEach(r=>{
      if(!map[r.source])map[r.source]={source:r.source,spend:0,leads:0,qualified:0,apps:0,total_rev:0}
      map[r.source].spend+=r.spend; map[r.source].leads+=r.leads
      map[r.source].qualified+=r.qualified; map[r.source].apps+=r.apps
      map[r.source].total_rev+=r.total_rev
    })
    return map
  },[campaigns])

  const sourceChart = useMemo(()=>
    Object.values(bySource).map(v=>({
      ...v,
      cpl: v.qualified>0?Math.round(v.spend/v.qualified):0,
      roas: v.spend>0&&v.total_rev>0?+(v.total_rev/v.spend).toFixed(2):0,
    })).sort((a,b)=>b.spend-a.spend)
  ,[bySource])

  // Top 10 by CPL (with QLs > 0)
  const topByCPL = useMemo(()=>
    [...filtered].filter(r=>r.qualified>0&&r.cpl>0).sort((a,b)=>a.cpl-b.cpl).slice(0,10)
  ,[filtered])

  // Worst 10 by CPQL
  const worstByCPQL = useMemo(()=>
    [...filtered].filter(r=>r.cpql>0).sort((a,b)=>b.cpql-a.cpql).slice(0,8)
  ,[filtered])

  const insights = useMemo(()=>generateInsights(tot, bySource, topByCPL[0], worstByCPQL[0]),[tot,bySource,topByCPL,worstByCPQL])
  const sources = useMemo(()=>['All',...new Set(campaigns.map(r=>r.source))]  ,[campaigns])

  const TT = ({active,payload,label})=>{
    if(!active||!payload?.length)return null
    return(
      <div style={{background:'#fff',border:'1px solid #E5E7EB',borderRadius:10,padding:'10px 14px',boxShadow:'0 4px 16px rgba(0,0,0,0.08)'}}>
        <p style={{fontSize:11,fontWeight:700,color:'#111827',marginBottom:6}}>{label}</p>
        {payload.map((p,i)=>(
          <p key={i} style={{fontSize:11,color:p.color||'#374151',margin:'2px 0'}}>
            {p.name}: <strong>{p.name.includes('CPL')||p.name.includes('CPQL')||p.name.includes('Spend')||p.name.includes('Rev')?fmt(p.value):p.value.toLocaleString()}</strong>
          </p>
        ))}
      </div>
    )
  }

  return(
    <div className={styles.layout}>
      <Sidebar/>
      <main className={styles.main}>

        {/* Header */}
        <div className={styles.topBar}>
          <div>
            <p className={styles.breadcrumb}>Dashboards / MTD</p>
            <h1 className={styles.pageTitle}>MTD Dashboard — May 2026</h1>
            <p className={styles.pageSub}>
              Month-to-date performance · Focus: CPL & CPQL · {' '}
              {lastSync && <span style={{color:isLive?'#059669':'#F59E0B'}}>{isLive?'🟢 Live':'🟡 Cached'} · Synced {lastSync.toLocaleTimeString()}</span>}
            </p>
          </div>
          <div className={styles.topRight}>
            <select className={styles.fsel} value={selSource} onChange={e=>setSelSource(e.target.value)}>
              {sources.map(s=><option key={s} value={s}>{s==='All'?'All Sources':s}</option>)}
            </select>
            <input className={styles.fsearch} placeholder="Search campaign..." value={search} onChange={e=>setSearch(e.target.value)}/>
            <ExportButton data={filtered} filename="mtd_campaigns"/>
              <button className={styles.refreshBtn} onClick={loadData} disabled={loading}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"
                style={{animation:loading?'spin 1s linear infinite':'none'}}>
                <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
              </svg>
              {loading?'Syncing...':'Refresh'}
            </button>
          </div>
        </div>

        {/* AI Insights */}
        <div className={styles.insightsBox}>
          <div className={styles.insightsHead}>
            <svg width="16" height="16" viewBox="0 0 22 22" fill="none">
              <rect x="1" y="12" width="4" height="9" rx="1.5" fill="#4BAE8A"/>
              <rect x="7" y="7" width="4" height="14" rx="1.5" fill="#1C9FD4"/>
              <rect x="13" y="4" width="4" height="17" rx="1.5" fill="#1F3C84"/>
            </svg>
            <span>Quantum AI Insights — Auto-generated from live data</span>
          </div>
          <div className={styles.insightsList}>
            {insights.map((ins,i)=>(
              <div key={i} className={`${styles.insight} ${styles['ins_'+ins.type]}`}>
                <span className={styles.insIcon}>{ins.icon}</span>
                <span>{ins.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* KPI Cards — CPL focus */}
        <div className={styles.kpiGrid}>
          {[
            {l:'Total Spend',    v:fmt(tot.spend),           s:'MTD Ad Spend',        c:'#6366F1', big:true},
            {l:'Total Leads',    v:fn(tot.leads),            s:'Raw OPPs generated',  c:'#3B82F6'},
            {l:'Qualified Leads',v:fn(tot.qualified),        s:'QLs via Futwork',     c:'#10B981', big:true},
            {l:'CPL ⭐',         v:fmt(tot.cpl),             s:'Cost per QL',         c: tot.cpl<1500?'#10B981':tot.cpl<3000?'#F59E0B':'#EF4444', big:true},
            {l:'CPQL',           v:fmt(tot.cpql),            s:'Cost per Qual. Lead', c: tot.cpql<2000?'#10B981':tot.cpql<4000?'#F59E0B':'#EF4444'},
            {l:'L→QL%',          v:tot.ltq.toFixed(1)+'%',  s:'Lead to QL rate',     c:'#F59E0B'},
            {l:'Apps (STUs)',     v:fn(tot.apps),            s:'Uni applications',    c:'#8B5CF6'},
            {l:'CPA',            v:tot.cpa>0?fmt(tot.cpa):'–',s:'Cost per App',      c:'#F97316'},
            {l:'AC Revenue',     v:fmt(tot.ac_rev),          s:'Collected',           c:'#10B981'},
            {l:'VAS Revenue',    v:fmt(tot.vas_rev),         s:'Collected',           c:'#10B981'},
            {l:'Total Revenue',  v:fmt(tot.total_rev),       s:'AC + VAS',            c:'#10B981', big:true},
            {l:'ROAS',           v:tot.roas>0?tot.roas.toFixed(2)+'x':'–', s:'Rev/Spend', c:tot.roas>=1?'#10B981':tot.roas>=0.5?'#F59E0B':'#EF4444', big:true},
          ].map(k=>(
            <div key={k.l} className={`${styles.kpi} ${k.big?styles.kpiBig:''}`}>
              <div className={styles.kpiAccent} style={{background:k.c}}/>
              <div className={styles.kpiVal} style={{color:k.big&&k.c!=='#6366F1'&&k.c!=='#3B82F6'?k.c:'#111827'}}>{k.v}</div>
              <div className={styles.kpiLbl}>{k.l}</div>
              <div className={styles.kpiSub}>{k.s}</div>
            </div>
          ))}
        </div>

        {/* Charts Row 1 — CPL Focus */}
        <div className={styles.grid2}>
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <span className={styles.cardTitle}>Top 10 Campaigns by CPL (Lowest = Best)</span>
              <span className={styles.cardSub}>Only campaigns with QLs</span>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={topByCPL.map(r=>({name:r.name.slice(0,24)+'…',cpl:Math.round(r.cpl),qls:r.qualified,source:r.source}))} layout="vertical" margin={{top:4,right:60,left:0,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false}/>
                <XAxis type="number" tick={{fontSize:10,fill:'#9CA3AF'}} tickFormatter={v=>fmt(v)} axisLine={false} tickLine={false}/>
                <YAxis type="category" dataKey="name" tick={{fontSize:9.5,fill:'#6B7280'}} width={175} axisLine={false} tickLine={false}/>
                <Tooltip content={<TT/>}/>
                <Bar dataKey="cpl" name="CPL" radius={[0,4,4,0]}>
                  {topByCPL.map((e,i)=><Cell key={i} fill={CH_COLORS[e.source]||'#6366F1'} fillOpacity={0.85}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className={styles.card}>
            <div className={styles.cardHead}>
              <span className={styles.cardTitle}>Source Performance — CPL vs QLs</span>
              <span className={styles.cardSub}>Bubble size = Spend</span>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:12,paddingTop:8}}>
              {sourceChart.map(s=>(
                <div key={s.source}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                    <span style={{fontSize:12,fontWeight:600,color:'#111827',display:'flex',alignItems:'center',gap:6}}>
                      <span style={{width:8,height:8,borderRadius:'50%',background:CH_COLORS[s.source]||'#9CA3AF'}}/>
                      {s.source}
                    </span>
                    <div style={{display:'flex',gap:16}}>
                      <span style={{fontSize:11,color:'#6B7280'}}>Spend: <strong style={{color:'#111827'}}>{fmt(s.spend)}</strong></span>
                      <span style={{fontSize:11,color:'#6B7280'}}>QLs: <strong style={{color:'#111827'}}>{fn(s.qualified)}</strong></span>
                      <span style={{fontSize:11,color:s.cpl<1500?'#059669':s.cpl<3000?'#D97706':'#DC2626',fontWeight:700}}>CPL: {s.cpl>0?fmt(s.cpl):'–'}</span>
                    </div>
                  </div>
                  <div style={{height:6,background:'#F3F4F6',borderRadius:3,overflow:'hidden'}}>
                    <div style={{width:`${Math.min(s.spend/Math.max(...sourceChart.map(x=>x.spend),1)*100,100)}%`,height:'100%',background:CH_COLORS[s.source]||'#9CA3AF',borderRadius:3}}/>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Charts Row 2 */}
        <div className={styles.grid2}>
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <span className={styles.cardTitle}>Highest CPQL Campaigns (Worst performers)</span>
              <span className={styles.cardSub}>Review these campaigns</span>
            </div>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={worstByCPQL.map(r=>({name:r.name.slice(0,22)+'…',cpql:Math.round(r.cpql),source:r.source}))} layout="vertical" margin={{top:4,right:16,left:0,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false}/>
                <XAxis type="number" tick={{fontSize:10,fill:'#9CA3AF'}} tickFormatter={v=>fmt(v)} axisLine={false} tickLine={false}/>
                <YAxis type="category" dataKey="name" tick={{fontSize:9.5,fill:'#6B7280'}} width={165} axisLine={false} tickLine={false}/>
                <Tooltip content={<TT/>}/>
                <Bar dataKey="cpql" name="CPQL" radius={[0,4,4,0]}>
                  {worstByCPQL.map((e,i)=><Cell key={i} fill="#EF4444" fillOpacity={0.7+i*0.03}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className={styles.card}>
            <div className={styles.cardHead}>
              <span className={styles.cardTitle}>Spend Distribution by Source</span>
              <span className={styles.cardSub}>MTD</span>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:16}}>
              <ResponsiveContainer width={180} height={200}>
                <PieChart>
                  <Pie data={sourceChart.filter(s=>s.spend>0)} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="spend" strokeWidth={0}>
                    {sourceChart.map((e,i)=><Cell key={i} fill={CH_COLORS[e.source]||'#9CA3AF'}/>)}
                  </Pie>
                  <Tooltip formatter={v=>[fmt(v),'Spend']}/>
                </PieChart>
              </ResponsiveContainer>
              <div style={{flex:1,display:'flex',flexDirection:'column',gap:8}}>
                {sourceChart.filter(s=>s.spend>0).map(s=>(
                  <div key={s.source} style={{display:'flex',alignItems:'center',gap:7}}>
                    <span style={{width:8,height:8,borderRadius:'50%',background:CH_COLORS[s.source]||'#9CA3AF',flexShrink:0}}/>
                    <span style={{fontSize:11.5,color:'#374151',flex:1}}>{s.source}</span>
                    <span style={{fontSize:11.5,fontWeight:700,color:'#111827'}}>{fmt(s.spend)}</span>
                    <span style={{fontSize:10,color:s.roas>=1?'#059669':'#9CA3AF',fontWeight:600}}>{s.roas>0?s.roas+'x':''}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Full Campaign Table */}
        <div className={styles.tableWrap}>
          <div className={styles.tableHead}>
            <div>
              <h3 className={styles.tableTitle}>All Campaigns — MTD</h3>
              <p className={styles.tableSub}>{filtered.length} campaigns · Sorted by {sortBy.toUpperCase()}</p>
            </div>
            <select className={styles.fsel} value={sortBy} onChange={e=>setSortBy(e.target.value)}>
              <option value="spend">Sort: Spend ↓</option>
              <option value="cpl">Sort: CPL ↑ (Best first)</option>
              <option value="cpql">Sort: CPQL ↑</option>
              <option value="qualified">Sort: QLs ↓</option>
              <option value="total_rev">Sort: Revenue ↓</option>
            </select>
          </div>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead><tr>
                <th>Source</th><th>Campaign</th>
                <th>Spend</th><th>Leads</th><th>QLs</th>
                <th style={{background:'#FEF9C3',color:'#92400E'}}>CPL ⭐</th>
                <th style={{background:'#FEF9C3',color:'#92400E'}}>CPQL</th>
                <th>L→QL%</th><th>Apps</th><th>CPA</th>
                <th>AC Rev</th><th>VAS Rev</th><th>ROAS</th>
              </tr></thead>
              <tbody>
                {filtered.length===0?(
                  <tr><td colSpan="13" style={{textAlign:'center',padding:32,color:'#9CA3AF'}}>No campaigns found</td></tr>
                ):filtered.map((r,i)=>{
                  const cplColor = r.cpl===0?'#9CA3AF':r.cpl<1000?'#059669':r.cpl<2500?'#D97706':'#DC2626'
                  const cpqlColor= r.cpql===0?'#9CA3AF':r.cpql<2000?'#059669':r.cpql<4000?'#D97706':'#DC2626'
                  return(
                    <tr key={i}>
                      <td><span style={{fontWeight:600,color:CH_COLORS[r.source]||'#374151',fontSize:11}}>{r.source}</span></td>
                      <td style={{maxWidth:260,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:11.5,color:'#111827',fontWeight:500}} title={r.name}>{r.name.slice(0,50)}{r.name.length>50?'…':''}</td>
                      <td>{fmt(r.spend)}</td>
                      <td>{fn(r.leads)}</td>
                      <td><strong>{fn(r.qualified)}</strong></td>
                      <td><span style={{fontWeight:700,color:cplColor}}>{r.cpl>0?fmt(r.cpl):'–'}</span></td>
                      <td><span style={{fontWeight:700,color:cpqlColor}}>{r.cpql>0?fmt(r.cpql):'–'}</span></td>
                      <td>{r.lead_ql_pct||'–'}</td>
                      <td>{fn(r.apps)}</td>
                      <td>{r.cpa>0?fmt(r.cpa):'–'}</td>
                      <td>{r.ac_rev>0?fmt(r.ac_rev):'–'}</td>
                      <td>{r.vas_rev>0?fmt(r.vas_rev):'–'}</td>
                      <td><span style={{fontWeight:700,color:r.roas>=1?'#059669':r.roas>=0.5?'#D97706':'#9CA3AF'}}>{r.roas>0?r.roas.toFixed(2)+'x':'–'}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}
