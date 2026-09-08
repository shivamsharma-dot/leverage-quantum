-- Mirrors the BigQuery saved query "Monthly QLs (with Vertical SR/AC)"
-- (Quantum: Settings > Data > BigQuery Console) into public.monthly_qls_daily,
-- one row per (date, source) -- the exact grain the query's own all_dims/join
-- structure already guarantees is unique (built via UNION DISTINCT), so no
-- ordinal-disambiguator is needed the way overall_bq_daily's row_key needed one.
--
-- This REPLACES the Monthly QLs page's dependency on the external QLSnapshot
-- Google Sheet CSV -- see CLAUDE.md, 2026-09-08, "do not depend on sheet now".
-- Once this table is populated, LeadQualificationDashboard.jsx reads from here
-- via src/lib/monthlyQlsCache.js instead of fetching MONTHLY_CSV.
--
-- Run this once in the Supabase SQL editor before .github/workflows/
-- monthly-qls-sync.yml is triggered for the first time.

CREATE TABLE IF NOT EXISTS public.monthly_qls_daily (
  row_key                  TEXT PRIMARY KEY,
  period                   TEXT,
  lead_date                TEXT,        -- display string, DD-Mon-YYYY (the query's own "date" column)
  lead_date_iso             DATE,        -- derived, for real date-range queries
  source                   TEXT,

  opp_count                BIGINT,
  floor_queued             BIGINT,
  futwork_queued           BIGINT,
  superbot_queued          BIGINT,
  futwork_ai_queued        BIGINT,

  futwork_qualified        BIGINT,
  futwork_qualified_sr     BIGINT,
  futwork_qualified_ac     BIGINT,
  superbot_qualified       BIGINT,
  futwork_ai_qualified     BIGINT,
  futwork_ai_qualified_sr  BIGINT,
  futwork_ai_qualified_ac  BIGINT,

  sync_id                  TEXT,
  synced_at                TIMESTAMPTZ
);

-- lead_date_iso/source are what the client filters and groups on; period/sync_id
-- are cheap and make the once-daily prune/health checks fast.
CREATE INDEX IF NOT EXISTS idx_monthly_qls_daily_date   ON public.monthly_qls_daily(lead_date_iso);
CREATE INDEX IF NOT EXISTS idx_monthly_qls_daily_source ON public.monthly_qls_daily("source");
CREATE INDEX IF NOT EXISTS idx_monthly_qls_daily_period ON public.monthly_qls_daily(period);
CREATE INDEX IF NOT EXISTS idx_monthly_qls_daily_sync   ON public.monthly_qls_daily(sync_id);

-- RLS disabled to match every other cache table the anon key reads client-side
-- (overall_bq_daily, leverage_careers_daily, apps_feed, ...).
ALTER TABLE public.monthly_qls_daily DISABLE ROW LEVEL SECURITY;
