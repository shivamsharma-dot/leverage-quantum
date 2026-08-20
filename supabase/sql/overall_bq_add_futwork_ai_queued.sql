-- The BigQuery saved query "Overall" gained a new column, fut_ai_queued (aliased
-- 'Queued on Futwork AI'), and its existing fut_human_queued column was renamed
-- from feeding 'Queued on Futwork' to feeding 'Queued on Futwork Human' -- the
-- underlying leads never moved provider, only the label describing which Futwork
-- channel queued them. See .github/workflows/overall-bq-sync.yml's own comment
-- on this same change (added 2026-08-20) for the full context.
--
-- Non-destructive, unlike overall_funnel_add_source.sql's TRUNCATE:
--   - overall_bq_daily's row_key is (lead_date, Source, campaign_name, ordinal)
--     and does not include this column, so a plain RENAME COLUMN preserves every
--     existing row_key and every existing row's history.
--   - overall_bq_daily_agg has no historical value worth preserving under the
--     old name (it's a derived, sum-per-day-per-source cache the sync run fully
--     rebuilds anyway), but RENAME COLUMN is still correct and cheaper than a
--     drop+recreate.
--
-- Run this ONCE in the Supabase SQL editor, then trigger the sync workflow once
-- (workflow_dispatch) rather than waiting for its next scheduled run, so both
-- tables are populated with real 'Queued on Futwork AI' values immediately
-- instead of within the next few hours.

ALTER TABLE public.overall_bq_daily
  RENAME COLUMN "Queued on Futwork" TO "Queued on Futwork Human";
ALTER TABLE public.overall_bq_daily
  ADD COLUMN IF NOT EXISTS "Queued on Futwork AI" BIGINT;

ALTER TABLE public.overall_bq_daily_agg
  RENAME COLUMN "Queued on Futwork" TO "Queued on Futwork Human";
ALTER TABLE public.overall_bq_daily_agg
  ADD COLUMN IF NOT EXISTS "Queued on Futwork AI" BIGINT NOT NULL DEFAULT 0;
