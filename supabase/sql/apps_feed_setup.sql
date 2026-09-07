-- Cache for Settings > Data > BigQuery Console's "appv2" saved query
-- (replaced the earlier "Apps" query on 2026-09-07 -- same core fields, plus
-- vertical/country2/sub_source, and a real first_app_submitted_at date
-- instead of only the two derived display strings).
-- Row-level feed (one row per application), not a date-bucketed aggregate --
-- the query itself has no since/until, so every sync pulls the full current
-- table and this schema replaces it wholesale each run (see apps_sync in
-- api/crm-leads.js).
-- row_key note: appv2's own LEFT JOIN chain no longer includes
-- coach_referral_intake_funnel -- that join selected none of its columns but
-- was confirmed live (2026-09-07) to have 115 of 2,595 rows sharing a
-- user_id_uuid with another row, i.e. capable of silently fanning a dma row
-- into duplicates. It was dropped from the sync's own copy of the query for
-- exactly that reason (see the comment on APPS_SQL). row_key's ordinal
-- disambiguator is kept anyway, purely as defense in depth against any other
-- future source of duplicate rows, the same way overall_bq_daily's is.
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
  first_app_submitted_at TEXT,
  first_app_month TEXT,
  first_app_date TEXT,
  prospect_id TEXT,
  opportunity_id TEXT,
  source TEXT,
  vertical TEXT,
  country2 TEXT,
  futwork_human TEXT,
  futwork_ai TEXT,
  sub_source TEXT,
  opp_first_campaign_name TEXT,
  sync_id TEXT,
  synced_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_apps_feed_dest_group ON public.apps_feed(destination_country_group);
CREATE INDEX IF NOT EXISTS idx_apps_feed_intake ON public.apps_feed(intake_category);
CREATE INDEX IF NOT EXISTS idx_apps_feed_month ON public.apps_feed(first_app_month);
CREATE INDEX IF NOT EXISTS idx_apps_feed_submitted_at ON public.apps_feed(first_app_submitted_at);
CREATE INDEX IF NOT EXISTS idx_apps_feed_source ON public.apps_feed(source);
CREATE INDEX IF NOT EXISTS idx_apps_feed_campaign ON public.apps_feed(opp_first_campaign_name);
CREATE INDEX IF NOT EXISTS idx_apps_feed_sync ON public.apps_feed(sync_id);

-- RLS disabled to match every other cache table the anon key reads
-- (overall_bq_daily, leverage_careers_daily, team_mapping_ls_detail_cache, ...).
ALTER TABLE public.apps_feed DISABLE ROW LEVEL SECURITY;
