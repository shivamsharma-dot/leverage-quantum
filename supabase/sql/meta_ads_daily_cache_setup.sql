-- Meta Ads Creatives cache v2: per-ad, PER-DAY granularity, so any date range
-- (This Month, Last Month, Last 7/14/30 days, a custom range, or any of the
-- last 6 calendar months) can be served from Supabase by summing whichever
-- cached days fall inside the requested range -- not just a single fixed
-- "This Month" snapshot.
--
-- Replaces the v1 tables from meta_ads_sync_setup.sql. Run this whole file
-- once in the Supabase SQL editor (safe to run even if the v1 tables were
-- never created, or already have data in them).

DROP TABLE IF EXISTS public.meta_ads_cache;
DROP TABLE IF EXISTS public.meta_ads_account_cache;

-- ── Static per-ad info (name, campaign, creative, thumbnail) -- NOT date-
-- specific, refreshed opportunistically whenever the ad is touched by a sync.
CREATE TABLE IF NOT EXISTS public.meta_ads_meta (
  ad_id TEXT PRIMARY KEY,
  name TEXT,
  status TEXT,
  effective_status TEXT,
  campaign_id TEXT,
  campaign_name TEXT,
  creative_id TEXT,
  ad_type TEXT,
  thumbnail_url TEXT,
  preview_link TEXT,
  preview_platform TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.meta_ads_meta DISABLE ROW LEVEL SECURITY;

-- ── One row per (ad, day) -- the actual daily-granularity cache. Any date
-- range is served by summing rows where date is within [since, until].
CREATE TABLE IF NOT EXISTS public.meta_ads_daily (
  ad_id TEXT NOT NULL,
  date DATE NOT NULL,
  spend NUMERIC DEFAULT 0,
  impressions BIGINT DEFAULT 0,
  clicks BIGINT DEFAULT 0,
  ctr NUMERIC DEFAULT 0,
  reach BIGINT DEFAULT 0,
  frequency NUMERIC DEFAULT 0,
  actions JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ad_id, date)
);
CREATE INDEX IF NOT EXISTS idx_meta_ads_daily_date ON public.meta_ads_daily(date);
ALTER TABLE public.meta_ads_daily DISABLE ROW LEVEL SECURITY;

-- ── Sync bookkeeping (single row) -- tracks how far back the cache actually
-- covers, so the frontend can tell "is this requested range fully cached, or
-- do I need to fall back to a live Meta fetch".
CREATE TABLE IF NOT EXISTS public.meta_ads_sync_status (
  id TEXT PRIMARY KEY DEFAULT 'default',
  oldest_synced_date DATE,
  newest_synced_date DATE,
  last_incremental_sync_at TIMESTAMPTZ,
  last_backfill_at TIMESTAMPTZ,
  sync_status TEXT,        -- 'ok' | 'error'
  sync_error TEXT,
  ad_count INT
);
ALTER TABLE public.meta_ads_sync_status DISABLE ROW LEVEL SECURITY;
INSERT INTO public.meta_ads_sync_status (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

-- ── Scheduling: keep the SAME cron job as before (it already points at
-- sync-meta-ads, which is being redeployed with new code, not a new function)
-- -- no change needed here if you already ran the v1 scheduling block.
-- If you haven't yet, or want to double check, this recreates it safely:
--
-- SELECT cron.unschedule('sync-meta-ads-every-30-min'); -- if it already exists, drop first
-- SELECT cron.schedule(
--   'sync-meta-ads-every-30-min',
--   '*/30 * * * *',
--   $$
--   SELECT net.http_post(
--     url := 'https://tsyekthwthxszmsgqfej.supabase.co/functions/v1/sync-meta-ads',
--     headers := jsonb_build_object('Authorization', 'Bearer <ANON_OR_SERVICE_KEY>', 'Content-Type', 'application/json'),
--     body := '{"mode":"incremental"}'::jsonb
--   );
--   $$
-- );
