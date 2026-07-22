// Supabase Edge Function: syncs Meta Ads Creatives data into meta_ads_meta /
// meta_ads_daily (per-ad, per-day granularity) so the dashboard can serve ANY
// date range -- This Month, Last Month, Last 7/14/30 days, a custom range, or
// any of the last 6 calendar months -- from Supabase instead of calling
// Meta's Graph API on every page load. Triggered on a schedule by pg_cron
// (see supabase/sql/meta_ads_daily_cache_setup.sql) -- no GitHub Actions or
// Vercel involved in the recurring operation.
//
// Three request-body shapes:
//   { "mode": "incremental" }              -- default. Re-syncs only the last
//                                             3 days (today's numbers are
//                                             still moving; a couple of days
//                                             back in case Meta revises
//                                             attribution slightly late).
//                                             This is what the 30-minute cron
//                                             schedule calls.
//   { "mode": "backfill", "months": 6 }    -- one-time wide historical fetch
//                                             spanning the last N calendar
//                                             months, ending today. Not meant
//                                             to run on a tight schedule --
//                                             kept mainly for reference; the
//                                             monthOffset form below is
//                                             preferred for real backfills
//                                             (see note further down).
//   { "mode": "backfill", "monthOffset": 1 } -- single-calendar-month mode:
//                                             covers exactly ONE month per
//                                             invocation (0 = current month
//                                             to date, 1 = last full month,
//                                             2 = the month before that, ...).
//                                             A full historical backfill is
//                                             driven as several separate,
//                                             real-time-spaced Edge Function
//                                             calls (monthOffset 0,1,2,...,5
//                                             for 6 months) rather than one
//                                             giant execution -- confirmed
//                                             live that cramming many months
//                                             of per-day insight fetches into
//                                             one execution trips Meta's
//                                             "reduce the amount of data"
//                                             complexity error (code=100,
//                                             subcode=1504018) even once each
//                                             individual request's date span
//                                             is already chunked to <=7 days;
//                                             spacing the load across
//                                             separate invocations avoids it.
//
// CRM/QL data is deliberately NOT cached here -- the existing /api/crm-leads
// endpoint already serves any arbitrary date range directly from the Google
// Sheet, cheaply and fast (it's a single lightweight fetch, not part of the
// Meta rate-limit problem this cache exists to solve), so there's nothing to
// gain by duplicating it into Supabase too.
//
// Deliberately paced conservatively throughout (small delays between
// batches): this function has no user waiting on it, so it prioritizes never
// tripping Meta's account-level rate limit over finishing quickly.

const AD_ACCOUNT_ID = 'act_641914389215638'
const GRAPH = 'https://graph.facebook.com/v19.0'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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
    throw new Error(msg + ' | code=' + d.error.code + ' subcode=' + d.error.error_subcode + ' type=' + d.error.type + ' path=' + path + ' params=' + JSON.stringify(params).slice(0, 300))
  }
  return d
}

// Paginated fetch, paced (500ms between pages) -- no user is waiting on this
// function, so there's no reason to rush and every reason to be gentle on
// the rate limit. Used both for the ad-list join and for time_increment=1
// insight queries, which can return many rows (one per ad per day) for a
// wide backfill window.
async function graphGetAll(path: string, token: string, params: Record<string, any> = {}, pageSize = 500, maxPages = 60): Promise<any[]> {
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

function fmtDate(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

Deno.serve(async (req) => {
  const startedAt = new Date().toISOString()
  try {
    const body = await req.json().catch(() => ({}))
    const mode = body.mode === 'backfill' ? 'backfill' : 'incremental'
    const months = Number(body.months) > 0 ? Number(body.months) : 6

    const today = new Date()
    let since: string, until: string
    if (mode === 'backfill') {
      if (Number.isFinite(body.monthOffset)) {
        // Single-calendar-month mode: covers exactly ONE month per
        // invocation, so a full historical backfill can be driven as
        // several separate, real-time-spaced Edge Function calls
        // (monthOffset 0,1,2,...) instead of one giant execution -- see the
        // header comment above for why.
        const offset = Number(body.monthOffset)
        const target = new Date(today.getFullYear(), today.getMonth() - offset, 1)
        const monthEnd = new Date(today.getFullYear(), today.getMonth() - offset + 1, 0)
        const cappedEnd = monthEnd > today ? today : monthEnd
        since = fmtDate(target)
        until = fmtDate(cappedEnd)
      } else {
        const start = new Date(today.getFullYear(), today.getMonth() - (months - 1), 1)
        since = fmtDate(start)
        until = fmtDate(today)
      }
    } else {
      const start = new Date(today); start.setDate(start.getDate() - 2)
      since = fmtDate(start)
      until = fmtDate(today)
    }

    const tokRes = await sb('meta_tokens?select=token,created_at&order=created_at.desc&limit=1')
    const tokRows = await tokRes.json()
    const token = tokRows?.[0]?.token
    if (!token) throw new Error('No Meta token found in meta_tokens')

    // Date windows (<=7 days each) reused for BOTH step 1 and step 3 below --
    // Meta's Graph API rejects the unfiltered, all-ads, level=ad insights scan
    // (step 1) once the requested time_range exceeds roughly a month, with a
    // "reduce the amount of data you're asking for" complexity error --
    // confirmed live: a 22-day window succeeded, a 30-day window failed on
    // this exact call shape. Chopping the date span into week-sized windows
    // keeps each individual request's size in the same safe class as the
    // 3-day incremental window, while still covering the full range across
    // multiple requests.
    const dateWindows: { since: string; until: string }[] = []
    {
      let winStart = new Date(since + 'T00:00:00')
      const rangeEnd = new Date(until + 'T00:00:00')
      while (winStart <= rangeEnd) {
        const winEnd = new Date(winStart)
        winEnd.setDate(winEnd.getDate() + 6)
        if (winEnd > rangeEnd) winEnd.setTime(rangeEnd.getTime())
        dateWindows.push({ since: fmtDate(winStart), until: fmtDate(winEnd) })
        winStart = new Date(winEnd)
        winStart.setDate(winStart.getDate() + 1)
      }
    }

    // 1. Every ad with real spend anywhere in [since, until] -- paginated, no
    // cap -- chunked into the same date windows as step 3 (see note above).
    const topAdIdSet = new Set<string>()
    for (const win of dateWindows) {
      const winTimeRangeStep1 = JSON.stringify(win)
      const allAdsIns = await graphGetAll(`${AD_ACCOUNT_ID}/insights`, token, { fields: 'ad_id,spend', level: 'ad', time_range: winTimeRangeStep1 })
      allAdsIns.filter((x: any) => parseFloat(x.spend || 0) > 0).map((x: any) => x.ad_id).filter(Boolean).forEach((id: string) => topAdIdSet.add(id))
      await sleep(400)
    }
    const topAdIds = [...topAdIdSet]

    // 2. Ad + creative/campaign join, chunked IN-filter (500 ids/chunk), paced.
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

    // 3. Per-ad PER-DAY insights (time_increment=1), chunked by BOTH ad ids
    // (20/request) AND date sub-range (<=7 days/request, see dateWindows
    // above). Each response can hold many rows (one per ad per day) --
    // graphGetAll's own pagination handles that transparently.
    const dailyRows: any[] = []
    const adIds = adsRaw.map(a => a.id)
    // dateWindows already computed above (reused here for the per-day insights loop).
    for (const win of dateWindows) {
      const winTimeRange = JSON.stringify(win)
      for (let i = 0; i < adIds.length; i += 20) {
        const chunk = adIds.slice(i, i + 20)
        const rows = await graphGetAll(`${AD_ACCOUNT_ID}/insights`, token, {
          fields: 'ad_id,spend,impressions,clicks,ctr,reach,frequency,actions',
          level: 'ad',
          time_range: winTimeRange,
          time_increment: '1',
          filtering: JSON.stringify([{ field: 'ad.id', operator: 'IN', value: chunk }]),
        })
        dailyRows.push(...rows)
        await sleep(400)
      }
    }

    // 4. Creative thumbnails, chunked 50/request, paced.
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

    // 5. Upsert static per-ad metadata into meta_ads_meta
    const metaRows = adsRaw.map(ad => {
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
        updated_at: startedAt,
      }
    })
    for (let i = 0; i < metaRows.length; i += 200) {
      const batch = metaRows.slice(i, i + 200)
      const res = await sb('meta_ads_meta', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(batch) })
      if (!res.ok) throw new Error(`meta upsert failed: ${res.status} ${await res.text()}`)
    }

    // 6. Upsert per-(ad,day) rows into meta_ads_daily
    const dayRowsToUpsert = dailyRows.map((r: any) => ({
      ad_id: r.ad_id,
      date: r.date_start,
      spend: parseFloat(r.spend) || 0,
      impressions: parseInt(r.impressions) || 0,
      clicks: parseInt(r.clicks) || 0,
      ctr: parseFloat(r.ctr) || 0,
      reach: parseInt(r.reach) || 0,
      frequency: parseFloat(r.frequency) || 0,
      actions: r.actions || [],
      updated_at: startedAt,
    }))
    for (let i = 0; i < dayRowsToUpsert.length; i += 500) {
      const batch = dayRowsToUpsert.slice(i, i + 500)
      const res = await sb('meta_ads_daily', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(batch) })
      if (!res.ok) throw new Error(`daily upsert failed: ${res.status} ${await res.text()}`)
    }

    // 7. Update sync bookkeeping -- widen the covered range, never shrink it.
    const statusRes = await sb('meta_ads_sync_status?id=eq.default&select=*')
    const statusRows = await statusRes.json()
    const prev = statusRows?.[0] || {}
    const oldest = prev.oldest_synced_date && prev.oldest_synced_date < since ? prev.oldest_synced_date : since
    const newest = prev.newest_synced_date && prev.newest_synced_date > until ? prev.newest_synced_date : until
    await sb('meta_ads_sync_status?id=eq.default', {
      method: 'PATCH',
      body: JSON.stringify({
        oldest_synced_date: oldest,
        newest_synced_date: newest,
        ...(mode === 'backfill' ? { last_backfill_at: new Date().toISOString() } : { last_incremental_sync_at: new Date().toISOString() }),
        sync_status: 'ok',
        sync_error: null,
        ad_count: adsRaw.length,
      }),
    })

    return new Response(JSON.stringify({ ok: true, mode, since, until, adCount: adsRaw.length, dailyRowCount: dayRowsToUpsert.length }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    await sb('meta_ads_sync_status?id=eq.default', {
      method: 'PATCH',
      body: JSON.stringify({ sync_status: 'error', sync_error: String(e?.message || e) }),
    }).catch(() => {})
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
