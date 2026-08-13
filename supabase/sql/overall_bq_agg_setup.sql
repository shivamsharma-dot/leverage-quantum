-- Pre-aggregated, day + source grain companion to public.overall_bq_daily.
--
-- Written by  .github/workflows/overall-bq-sync.yml, in the SAME run that
--             writes overall_bq_daily -- it aggregates the exact rows that
--             sync already fetched from BigQuery, so there is no second
--             BigQuery query and no way for the two tables to disagree.
-- Read by     src/lib/overallBqCache.js's fetchOverallBqAggRows(), used by
--             /dashboard/overall-bigquery for every view EXCEPT the Campaign
--             and Corridor groupings (those need per-campaign rows, so they
--             fall back to the existing overall_bq_daily read).
--
-- WHY THIS EXISTS
-- overall_bq_daily is one row per date x source x campaign and only grows --
-- reading a real date range means paginating through tens of thousands of
-- rows, cursor-page by cursor-page (see overallBqCache.js's own notes on why
-- that pagination can't run in parallel). The KPI cards, the funnel chart and
-- the Source/Month/Day groupings never needed campaign-level rows in the
-- first place -- they're sums over whatever's currently filtered. Collapsing
-- campaign_name away at write time turns "tens of thousands of rows, many
-- pages" into "at most a few thousand rows for the entire history, one page",
-- which is what makes this fast regardless of the date range picked.
--
-- Run this ONCE in the Supabase SQL editor, same as overall_bq_cache_setup.sql.

CREATE TABLE IF NOT EXISTS public.overall_bq_daily_agg (
  -- Natural composite key, human-readable: "<lead_date_iso>|<Source>". No
  -- surrogate/hash needed here (unlike overall_bq_daily's row_key) because a
  -- GROUP BY (lead_date_iso, Source) is unique by construction -- there is no
  -- duplicate-collision problem to solve at this grain.
  row_key                  TEXT PRIMARY KEY,

  lead_date_iso             DATE NOT NULL,
  "Source"                  TEXT NOT NULL,
  -- Carried over verbatim from one of the raw rows in this group (all rows in
  -- a group share the same date, so either one is fine) -- kept in the exact
  -- 'DD-Mon-YYYY' / "Month'YYYY" shapes OverallDashboard.jsx's mapRow()/parseD()
  -- already parse, so no new date-format handling is needed on the client.
  "lead_date"                TEXT,
  "month"                    TEXT,

  -- Sums of the 11 metric columns across every campaign for that (date,
  -- source). NOT NULL DEFAULT 0: at raw grain a NULL means "this specific
  -- row had no value", a fact worth keeping; once summed across a whole day
  -- of campaigns that distinction no longer applies, and every KPI/chart that
  -- reads this table already treats a missing number as 0.
  "Total Leads Generated"   BIGINT  NOT NULL DEFAULT 0,
  "floor_queued"            BIGINT  NOT NULL DEFAULT 0,
  "Queued on Futwork"       BIGINT  NOT NULL DEFAULT 0,
  "Queued on Superbot"      BIGINT  NOT NULL DEFAULT 0,
  "Futwork Human QL"        BIGINT  NOT NULL DEFAULT 0,
  "Futwork AI QL"           BIGINT  NOT NULL DEFAULT 0,
  "Superbot AI QL"          BIGINT  NOT NULL DEFAULT 0,
  "Total_Spends"            NUMERIC NOT NULL DEFAULT 0,
  "Total Apps"              BIGINT  NOT NULL DEFAULT 0,
  "Total Offers"            BIGINT  NOT NULL DEFAULT 0,
  "Total Deposits"          BIGINT  NOT NULL DEFAULT 0,
  "Total RAUs"              BIGINT  NOT NULL DEFAULT 0,

  -- Prune bookkeeping, same pattern as overall_bq_daily: every row written by
  -- a sync is stamped with that sync's id, and anything still carrying an
  -- older id is deleted once all batches have landed.
  sync_id                   TEXT,
  synced_at                 TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_overall_bq_daily_agg_date   ON public.overall_bq_daily_agg(lead_date_iso);
CREATE INDEX IF NOT EXISTS idx_overall_bq_daily_agg_source ON public.overall_bq_daily_agg("Source");
CREATE INDEX IF NOT EXISTS idx_overall_bq_daily_agg_sync   ON public.overall_bq_daily_agg(sync_id);

-- RLS disabled to match overall_bq_daily and every other table the anon key
-- reads/writes in this app. When the Supabase SQL editor asks "Run" vs
-- "Enable RLS", choose Run.
ALTER TABLE public.overall_bq_daily_agg DISABLE ROW LEVEL SECURITY;
