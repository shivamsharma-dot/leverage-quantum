-- Verbatim cache of the BigQuery saved query named "Overall"
-- (Quantum: Settings > Data > BigQuery Console > saved queries > "Overall").
--
-- Written by  .github/workflows/overall-bq-sync.yml
-- Read by     the admin-only, off-by-default "Data source: BigQuery (beta)"
--             option on /dashboard/overall (src/pages/OverallDashboard.jsx).
--
-- Run this ONCE in the Supabase SQL editor before the sync workflow first runs.
--
-- ---------------------------------------------------------------------------
-- WHY THIS EXISTS
-- ---------------------------------------------------------------------------
-- /dashboard/overall downloads the whole "Overall PM" Google Sheet (2,00,000+
-- rows, one row per campaign per day per source) and parses every row in the
-- browser. That is the documented reason the page is slow. The BigQuery saved
-- query "Overall" is the SAME query that already feeds that sheet, and it is
-- cheap: about 37 MB scanned, about Rs 0.02, about 2 seconds.
--
-- THIS IS ADDITIVE AND COMPLETELY SEPARATE. It does not replace, modify or
-- even read public.overall_funnel_daily, which Ask AI's
-- analyze_campaign_contribution tool, the Marketing Performance report and
-- both agents already depend on. Two parallel pipelines, on purpose.
--
-- ---------------------------------------------------------------------------
-- SCHEMA PROVENANCE -- read this before changing any column
-- ---------------------------------------------------------------------------
-- Every column below was read LITERALLY off a real run of the saved query on
-- 2026-08-05 (job job_-9glm1traZMfSBge9ehA2gvhco-G, project
-- leverage-production, location asia-south1, 2,05,720 rows returned). Nothing
-- here is inferred.
--
-- Names are kept EXACTLY as BigQuery returns them -- spaces and capitals
-- included -- so this table can be diffed against the query schema by name
-- with no mental mapping. Column order matches the query too.
--
--   #  BigQuery field           BigQuery type   notes
--   1  lead_date                STRING          'DD-Mon-YYYY', e.g. 20-Jun-2026
--   2  month                    STRING          "Month'YYYY", e.g. June'2026
--   3  Source                   STRING          bucketed by the query CASE
--   4  campaign_name            STRING          nullable (673 NULLs observed)
--   5  Total Leads Generated    INTEGER
--   6  floor_queued             INTEGER
--   7  Queued on Futwork        INTEGER
--   8  Queued on Superbot       INTEGER
--   9  Futwork Human QL         INTEGER         nullable
--  10  Futwork AI QL            INTEGER         nullable
--  11  Superbot AI QL           INTEGER         nullable
--  12  Total_Spends             FLOAT
--  13  Total Apps               INTEGER
--  14  Total Offers             INTEGER
--  15  Total Deposits           INTEGER
--  16  Total RAUs               INTEGER
--
-- The metric columns are deliberately NULLABLE with NO DEFAULT 0. BigQuery
-- really does return NULL for some of them and NULL is not the same fact as 0.
-- (It would not change any SUM, but it would stop the data being exact.)
--
-- Total_Spends is FLOAT64 in BigQuery but NUMERIC here on purpose: NUMERIC
-- addition in Postgres is exact and order-independent, so a fidelity SUM
-- cannot drift with row order the way a float SUM can.
--
-- ---------------------------------------------------------------------------
-- WHY NOT A NATURAL PRIMARY KEY -- the important part
-- ---------------------------------------------------------------------------
-- The obvious key would be (lead_date, Source, campaign_name). Measured
-- against real data on 2026-08-05, that key IS NOT UNIQUE:
--
--   COUNT(*)                                              = 2,05,720
--   COUNT(DISTINCT lead_date | Source | campaign_name)    = 2,03,586
--
-- 2,134 rows share a key. The cause is the query CASE itself: it buckets
-- several distinct source_1 values into one output Source (for example
-- 'lead source na', 'others' and 'offline' all become 'Others'), so two
-- genuinely different source rows can collapse to the same output triple.
--
-- Upserting on that triple would therefore SILENTLY DISCARD 2,134 rows and
-- every fidelity sum would come out short. So instead each row gets a
-- deterministic surrogate key:
--
--   row_key = md5(lead_date | Source | campaign_name | ordinal)
--
-- where ordinal is the row position within its duplicate group, assigned after
-- sorting that group by its serialised metric values. That is stable across
-- syncs (so merge-duplicates does a real in-place UPDATE rather than churning
-- rows), NULL-safe (a NULL campaign_name would defeat a normal unique
-- constraint, since Postgres treats NULLs as distinct), and it keeps every one
-- of the 2,05,720 rows as its own row. Nothing is aggregated away.
--
-- sync_id + the workflow's prune step handle rows DISAPPEARING from the source
-- (a corrected or removed source row must not linger here as a ghost):
-- every row written by a sync is stamped with that sync's id, and anything
-- still carrying an older id is deleted once all batches have landed.

CREATE TABLE IF NOT EXISTS public.overall_bq_daily (
  row_key                 TEXT PRIMARY KEY,

  -- The 16 columns of the saved query. Same names, same order, nothing
  -- dropped, nothing aggregated.
  "lead_date"             TEXT,
  "month"                 TEXT,
  "Source"                TEXT,
  "campaign_name"         TEXT,
  "Total Leads Generated" BIGINT,
  "floor_queued"          BIGINT,
  "Queued on Futwork"     BIGINT,
  "Queued on Superbot"    BIGINT,
  "Futwork Human QL"      BIGINT,
  "Futwork AI QL"         BIGINT,
  "Superbot AI QL"        BIGINT,
  "Total_Spends"          NUMERIC,
  "Total Apps"            BIGINT,
  "Total Offers"          BIGINT,
  "Total Deposits"        BIGINT,
  "Total RAUs"            BIGINT,

  -- ADDITIVE, derived from "lead_date" by the sync. Not a replacement for it:
  -- "lead_date" above stays byte-exact as BigQuery returned it. This exists
  -- only so the page can filter a date range server-side on a real DATE with
  -- an index, instead of shipping the whole table to the browser.
  lead_date_iso           DATE,

  -- Prune bookkeeping (see WHY NOT A NATURAL PRIMARY KEY above).
  sync_id                 TEXT,
  synced_at               TIMESTAMPTZ DEFAULT now()
);

-- The page filters on a date range and optionally a single Source, so those
-- are the two that need to be indexed. month/sync_id are cheap and make the
-- fidelity check and the prune fast.
CREATE INDEX IF NOT EXISTS idx_overall_bq_daily_date   ON public.overall_bq_daily(lead_date_iso);
CREATE INDEX IF NOT EXISTS idx_overall_bq_daily_source ON public.overall_bq_daily("Source");
CREATE INDEX IF NOT EXISTS idx_overall_bq_daily_month  ON public.overall_bq_daily("month");
CREATE INDEX IF NOT EXISTS idx_overall_bq_daily_sync   ON public.overall_bq_daily(sync_id);

-- RLS disabled to match every other table the anon key reads/writes in this
-- app (overall_funnel_daily, source_health, report_logs, activity_log,
-- ask_ai_tool_calls, ...). When the Supabase SQL editor asks "Run" vs
-- "Enable RLS", choose Run.
ALTER TABLE public.overall_bq_daily DISABLE ROW LEVEL SECURITY;
