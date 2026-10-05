-- Cache of the "Careerv2" BigQuery query (Settings > Data > BigQuery Console)
-- behind the Leverage Careers page. Replaces the Meta Graph API feed + the old
-- leverage_careers_daily CRM-only cache: spend, leads, interested and won now
-- all come from leverage_direct.mis_marketing_career.
--
-- Written by  api/crm-leads.js  ?source=bigquery&mode=careers_sync
--             (triggered by .github/workflows/leverage-careers-sync.yml)
-- Read by     src/lib/leverageCareersCache.js
--
-- Run this ONCE in the Supabase SQL editor before the sync first runs.
--
-- One row per (lead_date, source, sub_source, campaign). The sync query
-- GROUP BYs those four and SUMs the metrics, so the key is unique by
-- construction and row_key is a plain md5 of them.
--   total_leads       opp_funnel
--   total_interested  ever_interested_funnel
--   won               won_funnel      (cohort: won, dated by lead creation)
--   won_snapshot      won_snapshot    (won as of the snapshot date)
--   spend             total_spends

CREATE TABLE IF NOT EXISTS public.leverage_careers_v2_daily (
  row_key           TEXT PRIMARY KEY,
  lead_date         DATE,
  source            TEXT,
  sub_source        TEXT,
  campaign          TEXT,
  total_leads       NUMERIC,
  total_interested  NUMERIC,
  won               NUMERIC,
  won_snapshot      NUMERIC,
  spend             NUMERIC,
  sync_id           TEXT,
  synced_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lc_v2_daily_date     ON public.leverage_careers_v2_daily(lead_date);
CREATE INDEX IF NOT EXISTS idx_lc_v2_daily_source   ON public.leverage_careers_v2_daily(source);
CREATE INDEX IF NOT EXISTS idx_lc_v2_daily_campaign ON public.leverage_careers_v2_daily(campaign);
CREATE INDEX IF NOT EXISTS idx_lc_v2_daily_sync     ON public.leverage_careers_v2_daily(sync_id);

-- RLS off, like every other cache table the anon key reads.
-- When the SQL editor asks "Run" vs "Enable RLS", choose Run.
ALTER TABLE public.leverage_careers_v2_daily DISABLE ROW LEVEL SECURITY;
