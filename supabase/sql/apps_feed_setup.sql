-- Cache for Settings > Data > BigQuery Console's "Apps" saved query.
-- Row-level feed (one row per application), not a date-bucketed aggregate --
-- the query itself has no since/until, so every sync pulls the full current
-- table and this schema replaces it wholesale each run (see apps_sync in
-- api/crm-leads.js). row_key disambiguates any accidental duplicate rows
-- (the query's own coach_referral_intake_funnel LEFT JOIN selects no columns
-- from that table but could still fan out a row if a user has more than one
-- referral-funnel match) the same way overall_bq_daily's row_key does.
CREATE TABLE IF NOT EXISTS public.apps_feed (
  row_key TEXT PRIMARY KEY,
  user_id_uuid TEXT,
  destination_country TEXT,
  destination_country_group TEXT,
  destination_country_original TEXT,
  intake_category TEXT,
  intake_date TEXT,
  school_name TEXT,
  course_name TEXT,
  first_app_month TEXT,
  first_app_date TEXT,
  prospect_id TEXT,
  opportunity_id TEXT,
  source TEXT,
  futwork_human TEXT,
  futwork_ai TEXT,
  opp_first_campaign_name TEXT,
  sync_id TEXT,
  synced_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_apps_feed_dest_group ON public.apps_feed(destination_country_group);
CREATE INDEX IF NOT EXISTS idx_apps_feed_intake ON public.apps_feed(intake_category);
CREATE INDEX IF NOT EXISTS idx_apps_feed_month ON public.apps_feed(first_app_month);
CREATE INDEX IF NOT EXISTS idx_apps_feed_source ON public.apps_feed(source);
CREATE INDEX IF NOT EXISTS idx_apps_feed_campaign ON public.apps_feed(opp_first_campaign_name);
CREATE INDEX IF NOT EXISTS idx_apps_feed_sync ON public.apps_feed(sync_id);

-- RLS disabled to match every other cache table the anon key reads
-- (overall_bq_daily, leverage_careers_daily, team_mapping_ls_detail_cache, ...).
ALTER TABLE public.apps_feed DISABLE ROW LEVEL SECURITY;
