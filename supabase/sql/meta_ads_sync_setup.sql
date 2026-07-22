-- Meta Ads Creatives cache: populated by the sync-meta-ads Edge Function on a
-- schedule (see the pg_cron block at the bottom), read directly by the
-- Creatives tab instead of it calling Meta's Graph API on every page load.
--
-- Run this whole file once in the Supabase SQL editor.

-- ── One row per ad, fully replaced on every sync ───────────────────────────
CREATE TABLE IF NOT EXISTS public.meta_ads_cache (
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
  spend NUMERIC DEFAULT 0,
  impressions BIGINT DEFAULT 0,
  clicks BIGINT DEFAULT 0,
  ctr NUMERIC DEFAULT 0,
  reach BIGINT DEFAULT 0,
  frequency NUMERIC DEFAULT 0,
  actions JSONB DEFAULT '[]'::jsonb,
  crm_leads INT,
  human_ql INT,
  ai_ql INT,
  range_since DATE,
  range_until DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_meta_ads_cache_updated ON public.meta_ads_cache(updated_at);
ALTER TABLE public.meta_ads_cache DISABLE ROW LEVEL SECURITY;

-- ── Single-row account-level rollup + sync bookkeeping ─────────────────────
CREATE TABLE IF NOT EXISTS public.meta_ads_account_cache (
  id TEXT PRIMARY KEY DEFAULT 'default',
  spend NUMERIC, impressions BIGINT, clicks BIGINT, ctr NUMERIC, cpm NUMERIC,
  reach BIGINT, frequency NUMERIC, leads INT,
  lifetime_spend NUMERIC, lifetime_impressions BIGINT, lifetime_clicks BIGINT, lifetime_reach BIGINT,
  active_campaign_count INT, paused_campaign_count INT,
  range_since DATE, range_until DATE,
  ad_count INT,
  sync_status TEXT,        -- 'ok' | 'error'
  sync_error TEXT,
  synced_at TIMESTAMPTZ
);
ALTER TABLE public.meta_ads_account_cache DISABLE ROW LEVEL SECURITY;
INSERT INTO public.meta_ads_account_cache (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

-- ── Scheduling: run the sync every 30 minutes, entirely inside Supabase ────
-- Requires the pg_cron and pg_net extensions (Database > Extensions in the
-- Supabase dashboard, or run the two CREATE EXTENSION lines below).
--
-- IMPORTANT: replace <PROJECT_REF> and <ANON_OR_SERVICE_KEY> below with your
-- actual project ref (from your Supabase project URL) and an API key, THEN
-- run this block -- it's commented out so the earlier table-creation part of
-- this file can be run safely on its own first.

-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- CREATE EXTENSION IF NOT EXISTS pg_net;
--
-- SELECT cron.schedule(
--   'sync-meta-ads-every-30-min',
--   '*/30 * * * *',
--   $$
--   SELECT net.http_post(
--     url := 'https://<PROJECT_REF>.supabase.co/functions/v1/sync-meta-ads',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer <ANON_OR_SERVICE_KEY>',
--       'Content-Type', 'application/json'
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );

-- To check scheduled runs later: SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
-- To remove the schedule later:  SELECT cron.unschedule('sync-meta-ads-every-30-min');
