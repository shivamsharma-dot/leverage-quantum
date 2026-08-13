-- BigQuery job/usage log -- one row per real BigQuery job Quantum triggers.
--
-- Written by:
--   lib/bigquery.mjs's bigQuerySelect(), via logBigQueryUsage() -- covers every
--   REAL (non-dry-run) query: the Leverage Careers page (mode=careers_leads,
--   fires on every load/date-change) and the Settings BigQuery Console
--   (mode=query, admin only, when "Run" -- not "Estimate" -- is pressed).
--   A dry run (Estimate, and the zero-cost ?mode=ping health check) creates no
--   billable BigQuery job and is deliberately NOT logged here.
--
--   .github/workflows/overall-bq-sync.yml -- the separate cron that populates
--   overall_bq_daily/overall_bq_daily_agg by calling BigQuery directly (its own
--   Python script, not lib/bigquery.mjs). Without this second writer, "whole
--   history of job runs" would silently miss a real job this repo fires 3x/day.
--
-- Read by: Settings > Data > "BigQuery Usage" (admin only), via the anon key --
-- same RLS-disabled / anon-read / service-role-write pattern as every other
-- table in this app (ask_ai_usage, report_logs, source_health, ...).
--
-- Run this ONCE in the Supabase SQL editor. Click "Run", not "Enable RLS".

CREATE TABLE IF NOT EXISTS public.bigquery_jobs (
  id                       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id                   TEXT,
  project_id               TEXT,
  location                 TEXT,
  -- 'careers_leads' | 'query' | 'cron_sync' -- the caller/site, not a BigQuery
  -- concept; lets the usage view answer "who/what is actually running this".
  mode                     TEXT,
  dashboard_id             TEXT,
  user_email               TEXT,
  total_bytes_processed    BIGINT,
  total_rows               BIGINT,
  cache_hit                BOOLEAN DEFAULT false,
  latency_ms               INT,
  created_at               TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bigquery_jobs_created ON public.bigquery_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bigquery_jobs_mode     ON public.bigquery_jobs(mode);

ALTER TABLE public.bigquery_jobs DISABLE ROW LEVEL SECURITY;
