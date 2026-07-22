// Supabase Edge Function: syncs Meta Ads Creatives data into meta_ads_cache /
// meta_ads_account_cache so the dashboard reads from Supabase instead of
// calling Meta's Graph API on every page load. Triggered on a schedule by
// pg_cron (see supabase/sql/meta_ads_sync_setup.sql) -- no GitHub Actions or
// Vercel involved in the recurring operation.
//
// Deliberately paced conservatively throughout (small delays between batches):
// this function has no user waiting on it, so it prioritizes never tripping
// Meta's account-level rate limit over finishing quickly.

const AD_ACCOUNT_ID = 'act_641914389215638'
const GRAPH = 'https://graph.facebook.com/v19.0'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRM_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1r-e6pBCN5ysfeD3Eq6sxgLmf97mdeTtloMPylqnx6Ew/gviz/tq?tqx=out:csv&sheet=FBleads'

function sb(path: string, options: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function graphGet(path: string, token: string, params: Record<string, any> = {}, retries = 4): Promise<any> {
  const qs = new URLSearchParams({ access_token: token, ...params }).toString()
  const res = await fetch(`${GRAPH}/${path}?${qs}`)
  const d = await res.json()
  if (d.error) {
    const msg = d.error.message || ''
    const RATE_CODES = [1, 4, 17, 32, 613]
    const rateLimited = RATE_CODES.includes(d.error.code) || msg.includes('reduce') || msg.includes('too large') || msg.includes('too many')
    if (retries > 0 && rateLimited) {
      const attempt = 4 - retries
      await sleep(Math.min(2000 * Math.pow(2, attempt), 30000))
      return graphGet(path, token, params, retries - 1)
    }
    throw new Error(msg)
  }
  return d
}

// Paginated fetch, paced (500ms between pages) -- no user is waiting on this
// function, so there's no reason to rush pagination and every reason to be
// gentle on the rate limit.
async function graphGetAll(path: string, token: string, params: Record<string, any> = {}, pageSize = 500, maxPages = 40): Promise<any[]> {
  let all: any[] = []
  const first = await graphGet(path, token, { ...params, limit: pageSize })
  all = first.data || []
  let nextUrl = first.paging?.next || null
  let page = 0
  while (nextUrl && page < maxPages) {
    page++
    await sleep(500)
    try {
      const res = await fetch(nextUrl)
      const d = await res.json()
      if (d.error) break
      all = all.concat(d.data || [])
      nextUrl = d.paging?.next || null
    } catch { break }
  }
  return all
}

function getAction(actions: any[], type: string) {
  if (!actions) return 0
  const priority = type === 'lead'
    ? ['onsite_conversion.lead_grouped', 'lead', 'onsite_web_lead', 'offsite_conversion.fb_pixel_lead']
    : [type]
  for (const p of priority) {
    const a = actions.find((x: any) => x.action_type === p)
    if (a) return parseInt(a.value) || 0
  }
  return 0
}

// ── CRM/QL sheet: ported from api/crm-leads.js (same parsing, same columns) ──
const MONTHS: Record<string, number> = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 }
function toIso(d: string | undefined) {
  if (!d) return null
  const m = String(d).trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/)
  if (!m) return null
  const mon = MONTHS[m[2].toLowerCase()]
  if (mon == null) return null
  return `${m[3]}-${String(mon + 1).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`
}
function splitCsvLine(line: string) {
  const out: string[] = []; let cur = ''; let q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (q) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else { q = false } }
      else cur += ch
    } else {
      if (ch === '"') q = true
      else if (ch === ',') { out.push(cur); cur = '' }
      else cur += ch
    }
  }
  out.push(cur)
  return out
}
async function fetchCrmData(since: string, until: string) {
  const byName: Record<string, number> = {}
  const humanQL: Record<string, number> = {}
  const aiQL: Record<string, number> = {}
  try {
    const r = await fetch(CRM_SHEET_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!r.ok) return { byName, humanQL, aiQL }
    const text = await r.text()
    const lines = text.split(/\r?\n/).filter(l => l.length > 0)
    if (lines.length < 2) return { byName, humanQL, aiQL }
    const header = splitCsvLine(lines[0]).map(h => h.trim().toLowerCase())
    const dateIdx = header.indexOf('lead_created_date')
    const nameIdx = header.indexOf('opp_first_campaign_name')
    const leadsIdx = header.indexOf('leads')
    const humanQlIdx = header.indexOf('fw_human_ql_count')
    const aiQlIdx = header.indexOf('fw_ai_ql_count')
    for (let i = 1; i < lines.length; i++) {
      const cols = splitCsvLine(lines[i])
      const name = (cols[nameIdx] || '').trim()
      if (!name) continue
      const iso = toIso(cols[dateIdx])
      if (!iso || iso < since || iso > until) continue
      const n = parseInt((cols[leadsIdx] || '0').replace(/[^0-9-]/g, ''), 10) || 0
      byName[name] = (byName[name] || 0) + n
      if (humanQlIdx !== -1) {
        const hq = parseInt((cols[humanQlIdx] || '').replace(/[^0-9-]/g, ''), 10)
        if (!isNaN(hq)) humanQL[name] = (humanQL[name] || 0) + hq
      }
      if (aiQlIdx !== -1) {
        const aq = parseInt((cols[aiQlIdx] || '').replace(/[^0-9-]/g, ''), 10)
        if (!isNaN(aq)) aiQL[name] = (aiQL[name] || 0) + aq
      }
    }
  } catch (_) { /* CRM sheet is best-effort; sync still proceeds without it */ }
  return { byName, humanQL, aiQL }
}

function thisMonthRange() {
  const now = new Date()
  const f = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  return { since: f(firstOfMonth), until: f(now) }
}

Deno.serve(async (_req) => {
  const startedAt = new Date().toISOString()
  try {
    // 1. Token
    const tokRes = await sb('meta_tokens?select=token,created_at&order=created_at.desc&limit=1')
    const tokRows = await tokRes.json()
    const token = tokRows?.[0]?.token
    if (!token) throw new Error('No Meta token found in meta_tokens')

    const { since, until } = thisMonthRange()
    const timeRange = JSON.stringify({ since, until })

    // 2. Account-level + lifetime + campaign status summary
    const [accIns, lifetimeIns, campaignsSummary] = await Promise.all([
      graphGet(`${AD_ACCOUNT_ID}/insights`, token, { fields: 'spend,impressions,clicks,ctr,cpm,reach,frequency,actions', time_range: timeRange, level: 'account' }),
      graphGet(`${AD_ACCOUNT_ID}/insights`, token, { fields: 'spend,impressions,clicks,reach', date_preset: 'maximum', level: 'account' }),
      graphGet(`${AD_ACCOUNT_ID}/campaigns`, token, { fields: 'status', limit: 500 }),
    ])
    const account = accIns.data?.[0] || {}
    const lifetimeAccount = lifetimeIns.data?.[0] || {}
    const allCampaigns = campaignsSummary.data || []
    const activeCampaignCount = allCampaigns.filter((c: any) => c.status === 'ACTIVE').length
    const pausedCampaignCount = allCampaigns.filter((c: any) => c.status === 'PAUSED').length

    // 3. Every ad's spend this period -- paginated, no cap. Keep spend>0 only.
    const allAdsIns = await graphGetAll(`${AD_ACCOUNT_ID}/insights`, token, { fields: 'ad_id,spend', level: 'ad', time_range: timeRange })
    const topAdIds = allAdsIns.filter((x: any) => parseFloat(x.spend || 0) > 0).map((x: any) => x.ad_id).filter(Boolean)

    // 4. Ad + creative/campaign join, chunked IN-filter (500 ids/chunk) so the
    // filter itself never gets too large for one request, paced between chunks.
    let adsRaw: any[] = []
    for (let i = 0; i < topAdIds.length; i += 500) {
      const idChunk = topAdIds.slice(i, i + 500)
      const chunkAds = await graphGetAll(`${AD_ACCOUNT_ID}/ads`, token, {
        fields: 'name,status,effective_status,creative{id,name,video_id,object_story_id,instagram_permalink_url,effective_object_story_id},campaign{id,name}',
        filtering: JSON.stringify([{ field: 'id', operator: 'IN', value: idChunk }]),
      })
      adsRaw = adsRaw.concat(chunkAds)
      if (i + 500 < topAdIds.length) await sleep(500)
    }

    // 5. Per-ad insights, current period only, chunked 50/request, paced.
    const insightsMap: Record<string, any> = {}
    const adIds = adsRaw.map(a => a.id)
    for (let i = 0; i < adIds.length; i += 50) {
      const chunk = adIds.slice(i, i + 50)
      const ins = await graphGet(`${AD_ACCOUNT_ID}/insights`, token, {
        fields: 'ad_id,spend,impressions,clicks,ctr,reach,frequency,actions',
        level: 'ad', time_range: timeRange,
        filtering: JSON.stringify([{ field: 'ad.id', operator: 'IN', value: chunk }]),
        limit: 50,
      })
      ;(ins.data || []).forEach((row: any) => { insightsMap[row.ad_id] = row })
      if (i + 50 < adIds.length) await sleep(400)
    }

    // 6. Creative thumbnails, chunked 50/request, paced.
    const creativeIds = [...new Set(adsRaw.map(a => a.creative?.id).filter(Boolean))]
    const creativeThumbs: Record<string, string | null> = {}
    for (let i = 0; i < creativeIds.length; i += 50) {
      const chunk = creativeIds.slice(i, i + 50)
      try {
        const qs = new URLSearchParams({ access_token: token, ids: chunk.join(','), fields: 'id,thumbnail_url,image_url' }).toString()
        const res = await fetch(`${GRAPH}?${qs}`)
        const d = await res.json()
        if (!d.error) Object.entries(d).forEach(([id, c]: [string, any]) => { creativeThumbs[id] = c.image_url || c.thumbnail_url || null })
      } catch (_) { /* best-effort */ }
      if (i + 50 < creativeIds.length) await sleep(400)
    }

    // 7. CRM/QL sheet, same window
    const { byName: crmByName, humanQL: humanQLByName, aiQL: aiQLByName } = await fetchCrmData(since, until)

    // 8. Build final rows
    const rows = adsRaw.map(ad => {
      const ins = insightsMap[ad.id] || {}
      const igPerma = ad.creative?.instagram_permalink_url || null
      const objectStoryId = ad.creative?.effective_object_story_id || ad.creative?.object_story_id || null
      const fbPostUrl = objectStoryId
        ? (() => { const parts = objectStoryId.split('_'); return parts.length === 2 ? `https://www.facebook.com/${parts[0]}/posts/${parts[1]}` : null })()
        : null
      const previewLink = igPerma || fbPostUrl || `https://www.facebook.com/ads/library/?id=${ad.id}`
      const previewPlatform = igPerma ? 'instagram' : fbPostUrl ? 'facebook' : 'library'
      const adType = ad.creative?.video_id ? 'video' : (ad.name?.toLowerCase().includes('carousel') ? 'carousel' : 'image')
      return {
        ad_id: ad.id,
        name: ad.name || null,
        status: ad.status || null,
        effective_status: ad.effective_status || null,
        campaign_id: ad.campaign?.id || null,
        campaign_name: ad.campaign?.name || null,
        creative_id: ad.creative?.id || null,
        ad_type: adType,
        thumbnail_url: creativeThumbs[ad.creative?.id] || null,
        preview_link: previewLink,
        preview_platform: previewPlatform,
        spend: parseFloat(ins.spend) || 0,
        impressions: parseInt(ins.impressions) || 0,
        clicks: parseInt(ins.clicks) || 0,
        ctr: parseFloat(ins.ctr) || 0,
        reach: parseInt(ins.reach) || 0,
        frequency: parseFloat(ins.frequency) || 0,
        actions: ins.actions || [],
        crm_leads: ad.name && crmByName[ad.name] != null ? crmByName[ad.name] : null,
        human_ql: ad.name && humanQLByName[ad.name] != null ? humanQLByName[ad.name] : null,
        ai_ql: ad.name && aiQLByName[ad.name] != null ? aiQLByName[ad.name] : null,
        range_since: since,
        range_until: until,
        updated_at: startedAt,
      }
    })

    // 9. Upsert in batches of 200
    for (let i = 0; i < rows.length; i += 200) {
      const batch = rows.slice(i, i + 200)
      const res = await sb('meta_ads_cache', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(batch),
      })
      if (!res.ok) throw new Error(`Upsert failed: ${res.status} ${await res.text()}`)
    }

    // 10. Remove ads that no longer have real spend this period (weren't
    // touched by this sync -- 'fully replace' semantics, not accumulate).
    await sb(`meta_ads_cache?updated_at=lt.${encodeURIComponent(startedAt)}`, { method: 'DELETE' })

    // 11. Account-level rollup
    await sb('meta_ads_account_cache?id=eq.default', {
      method: 'PATCH',
      body: JSON.stringify({
        spend: parseFloat(account.spend) || 0,
        impressions: parseInt(account.impressions) || 0,
        clicks: parseInt(account.clicks) || 0,
        ctr: parseFloat(account.ctr) || 0,
        cpm: parseFloat(account.cpm) || 0,
        reach: parseInt(account.reach) || 0,
        frequency: parseFloat(account.frequency) || 0,
        leads: getAction(account.actions, 'lead'),
        lifetime_spend: parseFloat(lifetimeAccount.spend) || 0,
        lifetime_impressions: parseInt(lifetimeAccount.impressions) || 0,
        lifetime_clicks: parseInt(lifetimeAccount.clicks) || 0,
        lifetime_reach: parseInt(lifetimeAccount.reach) || 0,
        active_campaign_count: activeCampaignCount,
        paused_campaign_count: pausedCampaignCount,
        range_since: since,
        range_until: until,
        ad_count: rows.length,
        sync_status: 'ok',
        sync_error: null,
        synced_at: new Date().toISOString(),
      }),
    })

    return new Response(JSON.stringify({ ok: true, adCount: rows.length, since, until }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    await sb('meta_ads_account_cache?id=eq.default', {
      method: 'PATCH',
      body: JSON.stringify({ sync_status: 'error', sync_error: String(e?.message || e), synced_at: new Date().toISOString() }),
    }).catch(() => {})
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
