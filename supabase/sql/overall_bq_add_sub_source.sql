-- Adds Sub_Source to overall_bq_daily -- the BigQuery saved query "Overall" gained
-- a Sub_Source column (sub_source_updated) on 2026-08-17, matching the Overall PM
-- sheet's own Sub_Source column added the same day. This lets the Overall (BigQuery)
-- page's Source-view drill-down tree (Source -> Sub Source -> Campaign) show real
-- sub-source data instead of always falling back to 'Unknown'.
--
-- Non-destructive, unlike overall_funnel_add_source.sql's TRUNCATE: row_key is
-- computed from (lead_date, Source, campaign_name, ordinal) and does NOT include
-- Sub_Source (see the sync workflow's own comment on this), so every existing
-- row_key stays valid. The very next sync run (scheduled or workflow_dispatch)
-- upserts Sub_Source into every existing row in place -- no rebuild needed.
--
-- Run this ONCE in the Supabase SQL editor, then trigger the workflow once
-- (workflow_dispatch) rather than waiting for its next scheduled run, if you want
-- Sub_Source populated immediately instead of within the next few hours.

ALTER TABLE public.overall_bq_daily ADD COLUMN IF NOT EXISTS "Sub_Source" TEXT;
