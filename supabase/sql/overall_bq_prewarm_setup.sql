-- A single ready-to-serve snapshot of the Overall (BigQuery) page's own
-- DEFAULT view (current month + prior month, all sources, unfiltered --
-- exactly what bqRange computes on a plain page load with nothing else
-- open), so a user's first click of the day never has to pay the real
-- per-campaign pagination cost live.
--
-- Written by  .github/workflows/overall-bq-sync.yml, as the LAST step of the
--             same run that writes overall_bq_daily/overall_bq_daily_agg --
--             it reads back the just-synced range from overall_bq_daily
--             (a background job, no user waiting, no time pressure) and
--             writes the whole thing here as one row.
-- Read by     a new mode on api/crm-leads.js (mode=overall_bq_prewarm),
--             checked by OverallDashboard.jsx BEFORE the slow chunked fetch
--             -- used only when its own stored [since,until] exactly matches
--             what the page currently needs; anything else (a custom range,
--             a Source filter, Compare/Trend) still goes through the
--             existing live-fetch path untouched.
--
-- WHY THIS EXISTS (2026-09-19) -- a live per-campaign fetch of a normal MTD
-- view is ~50,000 rows, paginated 1,000-2,000 at a time even with the
-- existing parallel-chunk fetch: 10-45 seconds depending on real database
-- load. No amount of re-fetching FASTER removes the fact that someone has to
-- wait for it live. Precomputing it once, on a schedule, in the background,
-- is the only way the FIRST click of the day can be instant too, not just a
-- repeat visit (which already has its own separate IndexedDB-based fix).
--
-- Run this ONCE in the Supabase SQL editor, same as overall_bq_cache_setup.sql.

CREATE TABLE IF NOT EXISTS public.overall_bq_prewarm (
  -- Fixed at 'default' for now (the one unfiltered, all-sources view every
  -- plain page load computes) -- a real key, not a singleton table, so a
  -- future session could add e.g. 'default_last_90d' without a schema change.
  key         TEXT PRIMARY KEY,

  since       DATE NOT NULL,
  until       DATE NOT NULL,
  row_count   INT  NOT NULL DEFAULT 0,

  -- The exact row shape overall_bq_daily's own read path already returns
  -- (BQ_COLUMNS in overallBqCache.js) -- a JSON array of flat objects, so the
  -- client's existing `raw.map(mapRow)` needs zero changes to consume it.
  rows        JSONB NOT NULL,

  synced_at   TIMESTAMPTZ DEFAULT now()
);

-- RLS disabled to match overall_bq_daily and every other table the anon key
-- reads/writes in this app. When the Supabase SQL editor asks "Run" vs
-- "Enable RLS", choose Run.
ALTER TABLE public.overall_bq_prewarm DISABLE ROW LEVEL SECURITY;
