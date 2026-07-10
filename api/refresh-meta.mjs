import { getSessionUser, canAccessDashboard } from '../lib/auth.mjs'
const GRAPH = 'https://graph.facebook.com/v19.0'

async function graphGet(path, token, params = {}) {
  const qs = new URLSearchParams({ access_token: token, ...params }).toString()
  const url = path ? `${GRAPH}/${path}?${qs}` : `${GRAPH}?${qs}`
  const res = await fetch(url)
  const d = await res.json()
  if (d.error) throw new Error(d.error.message)
  return d
}

export default async function handler(req, res) {
  const me = getSessionUser(req)
  if (!me) return res.status(401).json({ error: 'Not signed in' })
  if (!canAccessDashboard(me.role, 'meta_ads')) return res.status(403).json({ error: 'Forbidden' })
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-meta-token')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const token = req.headers['x-meta-token'] || req.query.token
    if (!token) return res.status(401).json({ error: 'No token provided' })

    const { account = 'act_641914389215638', preset = 'last_7d', from_date, to_date } = req.query

    // Date range logic
    const useTimeRange = ['this_month','last_month','custom_range'].includes(preset)
    let timeRange = null
    if (preset === 'this_month') {
      const now = new Date()
      const since = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`
      const until = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
      timeRange = JSON.stringify({ since, until })
    } else if (preset === 'last_month') {
      const now = new Date()
      const first = new Date(now.getFullYear(), now.getMonth()-1, 1)
      const last  = new Date(now.getFullYear(), now.getMonth(), 0)
      const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      timeRange = JSON.stringify({ since: fmt(first), until: fmt(last) })
    } else if (preset === 'custom_range' && from_date && to_date) {
      timeRange = JSON.stringify({ since: from_date, until: to_date })
    }

    const metaPreset = preset === 'yesterday' ? 'yesterday'
      : preset === 'last_7d'  ? 'last_7d'
      : preset === 'last_14d' ? 'last_14d'
      : preset === 'last_30d' ? 'last_30d'
      : 'last_7d'

    const insightParams = useTimeRange
      ? { time_range: timeRange, level: 'account' }
      : { date_preset: metaPreset, level: 'account' }

    const campaignInsightFields = `name,status,objective,created_time,insights${
      useTimeRange ? `.time_range(${timeRange})` : `.date_preset(${metaPreset})`
    }{spend,impressions,clicks,ctr,reach,frequency,actions,cost_per_action_type}`

    // Fire all 6 base calls in parallel
    const [accIns, lifetimeIns, campaignStatus, campaignsSummary, adsRaw, pixels] = await Promise.all([
      graphGet(`${account}/insights`, token, { fields: 'spend,impressions,clicks,ctr,cpm,reach,frequency,actions', ...insightParams }),
      graphGet(`${account}/insights`, token, { fields: 'spend,impressions,clicks,reach', date_preset: 'maximum', level: 'account' }),
      graphGet(`${account}/campaigns`, token, { fields: 'status', limit: 500 }),
      graphGet(`${account}/campaigns`, token, { fields: campaignInsightFields, limit: 500 }),
      graphGet(`${account}/ads`, token, { fields: 'name,status,effective_status,creative{id,name,video_id,object_story_spec},adcreatives{thumbnail_url,image_url,object_story_spec}', limit: 200, effective_status: JSON.stringify(['ACTIVE','PAUSED']) }),
      graphGet(`${account}/adspixels`, token, { fields: 'id,name,last_fired_time' })
    ])

    const account_obj   = accIns.data?.[0] || {}
    const lifetimeAccount = lifetimeIns.data?.[0] || {}
    const allCampaigns  = campaignStatus.data || []
    const activeCampaignCount = allCampaigns.filter(c => c.status === 'ACTIVE').length
    const pausedCampaignCount = allCampaigns.filter(c => c.status === 'PAUSED').length
    const totalImpressions = parseInt(account_obj.impressions || 0)
    const totalClicks      = parseInt(account_obj.clicks || 0)
    const accountAvgCTR    = totalImpressions > 0 ? totalClicks / totalImpressions : 0
    const adsRawData = adsRaw.data || []

    // Ad-level insights + previous week (parallel)
    let insightsMap = {}, prevInsightsMap = {}
    if (adsRawData.length > 0) {
      const adIds = adsRawData.map(a => a.id)
      const adInsightParams = useTimeRange ? { time_range: timeRange } : { date_preset: metaPreset }
      const now = new Date()
      const prevUntil = new Date(now); prevUntil.setDate(prevUntil.getDate() - 7)
      const prevSince = new Date(now); prevSince.setDate(prevSince.getDate() - 14)
      const fmt = d => d.toISOString().slice(0,10)
      const prevRange = JSON.stringify({ since: fmt(prevSince), until: fmt(prevUntil) })
      const filterParam = JSON.stringify([{ field: 'ad.id', operator: 'IN', value: adIds }])

      const [adInsights, prevInsights] = await Promise.all([
        graphGet(`${account}/insights`, token, { fields: 'ad_id,spend,impressions,clicks,ctr,reach,frequency,actions', level: 'ad', filtering: filterParam, limit: 500, ...adInsightParams }),
        graphGet(`${account}/insights`, token, { fields: 'ad_id,spend,impressions,clicks,ctr,reach,frequency', level: 'ad', filtering: filterParam, limit: 500, time_range: prevRange })
      ])
      ;(adInsights.data || []).forEach(r => { insightsMap[r.ad_id] = r })
      ;(prevInsights.data || []).forEach(r => { prevInsightsMap[r.ad_id] = r })
    }

    // Creative thumbnail batch
    const creativeIds = [...new Set(adsRawData.map(a => a.creative?.id).filter(Boolean))]
    const creativeThumbs = {}
    if (creativeIds.length > 0) {
      const batches = []
      for (let i = 0; i < creativeIds.length; i += 50) batches.push(creativeIds.slice(i, i+50))
      await Promise.all(batches.map(async batch => {
        try {
          const d = await graphGet('', token, { ids: batch.join(','), fields: 'id,thumbnail_url,image_url,object_story_spec' })
          Object.values(d).forEach(c => {
            if (!c.id) return
            const spec = c.object_story_spec || {}
            const specImage = spec.link_data?.picture || spec.video_data?.image_url || spec.link_data?.child_attachments?.[0]?.image_url || null
            creativeThumbs[c.id] = c.image_url || specImage || c.thumbnail_url || null
          })
        } catch (e) { console.warn('creative batch failed:', e.message) }
      }))
    }

    // Build final ads array with thumbnails
    const ads = adsRawData.map(ad => {
      const isVideo  = !!ad.creative?.video_id
      const spec     = ad.creative?.object_story_spec || {}
      const videoImg = spec.video_data?.image_url || null
      const staticImg = creativeThumbs[ad.creative?.id] || null
      const inline   = ad.adcreatives?.data?.[0] || {}
      const inlineSpec = inline.object_story_spec || {}
      const inlineImg = inline.image_url || inlineSpec.link_data?.picture || inlineSpec.video_data?.image_url || inlineSpec.link_data?.child_attachments?.[0]?.image_url || inline.thumbnail_url || null
      const carouselImg = spec.link_data?.child_attachments?.[0]?.image_url || null
      const thumbUrl = isVideo
        ? (videoImg || staticImg || inlineImg)
        : (staticImg || spec.link_data?.picture || carouselImg || inlineImg || videoImg)
      return { ...ad, creative: { ...ad.creative, _thumbUrl: thumbUrl || null }, previewLink: `https://www.facebook.com/ads/library/?id=${ad.id}` }
    })

    return res.status(200).json({
      account: account_obj, lifetimeAccount,
      activeCampaignCount, pausedCampaignCount,
      campaigns: campaignsSummary.data || [],
      ads, accountAvgCTR, insightsMap, prevInsightsMap,
      pixels: pixels.data || []
    })

  } catch (err) {
    const isTokenErr = err.message?.includes('190') || err.message?.includes('token') || err.message?.includes('OAuth')
    return res.status(isTokenErr ? 401 : 500).json({ error: err.message, tokenExpired: isTokenErr })
  }
  }
