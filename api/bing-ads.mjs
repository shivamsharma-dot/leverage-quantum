import { getSessionUser, canAccessDashboard } from '../lib/auth.mjs'

// ---- Bing Ads (Microsoft Advertising) API handler ----
// OAuth identity provider: Google (per project plan). Refresh-token flow.
// Live entities via Campaign Management REST v13; performance/search-terms via Reporting REST v13 (async submit/poll).

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const CM_BASE = 'https://campaign.api.bingads.microsoft.com/CampaignManagement/v13'
const RPT_BASE = 'https://reporting.api.bingads.microsoft.com/Reporting/v13'

async function getAccessToken() {
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.BING_ADS_CLIENT_ID,
      client_secret: process.env.BING_ADS_CLIENT_SECRET,
      refresh_token: process.env.BING_ADS_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  })
  const j = await r.json()
  if (!r.ok || !j.access_token) throw new Error('token_refresh_failed: ' + (j.error_description || j.error || r.status))
  return j.access_token
}

// Shared header set for all Microsoft Advertising REST calls.
function msHeaders(token) {
  return {
    'Authorization': 'Bearer ' + token,
    'DeveloperToken': process.env.BING_ADS_DEVELOPER_TOKEN,
    'CustomerId': process.env.BING_ADS_CUSTOMER_ID,
    'CustomerAccountId': process.env.BING_ADS_ACCOUNT_ID,
    'Content-Type': 'application/json',
  }
}

async function cm(token, path, body) {
  const r = await fetch(CM_BASE + path, { method: 'POST', headers: msHeaders(token), body: JSON.stringify(body) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error('cm_error ' + r.status + ': ' + JSON.stringify(j).slice(0, 300))
  return j
}

async function rpt(token, path, body) {
  const r = await fetch(RPT_BASE + path, { method: 'POST', headers: msHeaders(token), body: JSON.stringify(body) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error('rpt_error ' + r.status + ': ' + JSON.stringify(j).slice(0, 300))
  return j
}

export default async function handler(req, res) {
  const me = getSessionUser(req)
  if (!me) return res.status(401).json({ error: 'Not signed in' })
  if (!canAccessDashboard(me.role, 'bing_ads')) return res.status(403).json({ error: 'Forbidden' })
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const miss = ['BING_ADS_CLIENT_ID','BING_ADS_CLIENT_SECRET','BING_ADS_REFRESH_TOKEN','BING_ADS_DEVELOPER_TOKEN','BING_ADS_CUSTOMER_ID','BING_ADS_ACCOUNT_ID'].filter(k => !process.env[k])
  if (miss.length) return res.status(200).json({ error: 'missing_credentials', missing: miss })

  const accountId = process.env.BING_ADS_ACCOUNT_ID
  const mode = (req.query.mode || 'campaigns').toString()

  try {
    const token = await getAccessToken()

    // ---------- LIVE ENTITIES ----------
    if (mode === 'campaigns') {
      const j = await cm(token, '/Campaigns/QueryByAccountId', { AccountId: Number(accountId), CampaignType: 'Search Shopping DynamicSearchAds' })
      const campaigns = (j.Campaigns || []).map(c => ({ id: c.Id, name: c.Name, status: c.Status, type: c.CampaignType, budget: c.DailyBudget }))
      return res.status(200).json({ campaigns, total: campaigns.length, tab: 'campaigns' })
    }

    if (mode === 'ad_groups') {
      // account -> campaigns -> ad groups (fan-out)
      const cj = await cm(token, '/Campaigns/QueryByAccountId', { AccountId: Number(accountId), CampaignType: 'Search Shopping DynamicSearchAds' })
      const campaigns = cj.Campaigns || []
      const results = await Promise.all(campaigns.map(async c => {
        const aj = await cm(token, '/AdGroups/QueryByCampaignId', { CampaignId: c.Id })
        return (aj.AdGroups || []).map(a => ({ id: a.Id, name: a.Name, status: a.Status, campaignId: c.Id, campaignName: c.Name }))
      }))
      const adGroups = results.flat()
      return res.status(200).json({ adGroups, total: adGroups.length, tab: 'ad_groups' })
    }

    if (mode === 'keywords') {
      // account -> campaigns -> ad groups -> keywords (fan-out; may be many calls)
      const cj = await cm(token, '/Campaigns/QueryByAccountId', { AccountId: Number(accountId), CampaignType: 'Search' })
      const campaigns = cj.Campaigns || []
      const agLists = await Promise.all(campaigns.map(c => cm(token, '/AdGroups/QueryByCampaignId', { CampaignId: c.Id }).then(aj => (aj.AdGroups || []).map(a => ({ ...a, _campaign: c })))))
      const adGroups = agLists.flat()
      const kwLists = await Promise.all(adGroups.map(a => cm(token, '/Keywords/QueryByAdGroupId', { AdGroupId: a.Id }).then(kj => (kj.Keywords || []).map(k => ({ id: k.Id, text: k.Text, matchType: k.MatchType, bid: k.Bid && k.Bid.Amount, status: k.Status, adGroupId: a.Id, adGroupName: a.Name, campaignName: a._campaign.Name })))))
      const keywords = kwLists.flat()
      return res.status(200).json({ keywords, total: keywords.length, tab: 'keywords' })
    }

    // ---------- REPORTING (async: frontend orchestrates submit -> poll) ----------
    if (mode === 'report-submit') {
      const reportType = (req.query.report || 'search_terms').toString()
      const days = Math.max(1, Math.min(90, Number(req.query.days) || 30))
      // Build a SearchQueryPerformanceReportRequest (search terms) or CampaignPerformanceReportRequest (metrics)
      let ReportRequest
      if (reportType === 'search_terms') {
        ReportRequest = {
          Type: 'SearchQueryPerformanceReportRequest',
          Format: 'Csv',
          ReturnOnlyCompleteData: false,
          Aggregation: 'Summary',
          Columns: ['SearchQuery','CampaignName','AdGroupName','Keyword','Impressions','Clicks','Spend','Ctr','AverageCpc','Conversions'],
          Scope: { AccountIds: [Number(accountId)] },
          Time: { PredefinedTime: days <= 7 ? 'LastSevenDays' : days <= 30 ? 'LastThirtyDays' : 'LastThreeMonths' },
        }
      } else {
        ReportRequest = {
          Type: 'CampaignPerformanceReportRequest',
          Format: 'Csv',
          ReturnOnlyCompleteData: false,
          Aggregation: 'Daily',
          Columns: ['TimePeriod','CampaignName','Impressions','Clicks','Spend','Ctr','AverageCpc','Conversions'],
          Scope: { AccountIds: [Number(accountId)] },
          Time: { PredefinedTime: days <= 7 ? 'LastSevenDays' : days <= 30 ? 'LastThirtyDays' : 'LastThreeMonths' },
        }
      }
      const j = await rpt(token, '/GenerateReport/Submit', { ReportRequest })
      return res.status(200).json({ reportRequestId: j.ReportRequestId, tab: 'report' })
    }

    if (mode === 'report-poll') {
      const id = (req.query.id || '').toString()
      if (!id) return res.status(400).json({ error: 'missing report id' })
      const j = await rpt(token, '/GenerateReport/Poll', { ReportRequestId: id })
      const st = j.ReportRequestStatus || {}
      // status: Pending | Success | Error. When Success, ReportDownloadUrl is a ZIP of CSV.
      if (st.Status !== 'Success' || !st.ReportDownloadUrl) {
        return res.status(200).json({ status: st.Status || 'Pending', tab: 'report' })
      }
      // Download + unzip + parse CSV
      const rows = await downloadAndParse(st.ReportDownloadUrl)
      return res.status(200).json({ status: 'Success', rows, total: rows.length, tab: 'report' })
    }

    return res.status(200).json({ error: 'unknown tab' })
  } catch (e) {
    return res.status(200).json({ error: e.message })
  }
}

// Report download is a ZIP containing one CSV. Unzip with the Node zlib/inflate via the 'unzipper'-free approach:
// Vercel Node runtime has no zip lib by default, so we use the fflate package (add to deps) if present, else fail gracefully.
async function downloadAndParse(url) {
  const resp = await fetch(url)
  const buf = Buffer.from(await resp.arrayBuffer())
  let csv
  try {
    const { unzipSync } = await import('fflate')
    const files = unzipSync(new Uint8Array(buf))
    const name = Object.keys(files).find(n => n.toLowerCase().endsWith('.csv')) || Object.keys(files)[0]
    csv = Buffer.from(files[name]).toString('utf8')
  } catch (e) {
    throw new Error('unzip_failed (is fflate installed?): ' + e.message)
  }
  return parseBingCsv(csv)
}

// Bing report CSVs have preamble lines before the header row; the header row is the first line containing commas that matches known columns.
function parseBingCsv(csv) {
  const lines = csv.split(/\r?\n/).filter(l => l.trim().length)
  const headerIdx = lines.findIndex(l => /(SearchQuery|CampaignName|TimePeriod)/.test(l) && l.includes(','))
  if (headerIdx < 0) return []
  const headers = splitCsvLine(lines[headerIdx])
  const rows = []
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i])
    if (cells.length < 2) continue
    // stop at footer (e.g. copyright / blank markers)
    if (/^©|^Microsoft/i.test(cells[0])) break
    const row = {}
    headers.forEach((h, idx) => { row[h] = cells[idx] })
    rows.push(row)
  }
  return rows
}

function splitCsvLine(line) {
  const out = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++ } else inQ = !inQ }
    else if (ch === ',' && !inQ) { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}
