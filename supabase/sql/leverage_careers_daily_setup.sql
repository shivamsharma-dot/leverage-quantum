-- Cache of the fixed "careers_leads" BigQuery query behind the Leverage
-- Careers page (Quantum: api/crm-leads.js, careersLeadsSql()).
--
-- Written by  api/crm-leads.js  ?source=bigquery&mode=careers_sync
--             (triggered by .github/workflows/leverage-careers-sync.yml,
--             3x/day -- 9:45am / 2:15pm / 9:30pm IST -- matching how often
--             the underlying LeadSquared export into BigQuery actually
--             refreshes, not an arbitrary hourly cadence)
-- Read by     src/lib/leverageCareersCache.js, consumed by
--             src/pages/LeverageCareersDashboard.jsx's fetchGranular() --
--             the main page, Trend Analysis and Compare all share that one
--             function, so all three read from this cache once wired up.
--
-- Run this ONCE in the Supabase SQL editor before the sync workflow first runs.
--
-- ---------------------------------------------------------------------------
-- WHY THIS EXISTS
-- ---------------------------------------------------------------------------
-- lsq_careers_opprtunities isn't partitioned in a way careersLeadsSql()'s
-- WHERE clause can prune, so EVERY call -- regardless of how narrow the
-- since/until window is -- scans the whole table (~11.5GB as of Aug 2026).
-- The Leverage Careers page's main fetch, its Trend Analysis modal, and its
-- Compare modal each independently compute their own date window and call
-- BigQuery live, so ordinary interactive use (switching Trend's dimension,
-- opening Compare, picking a custom range) was multiplying full-table-scan
-- cost by however many distinct windows got touched -- this is what produced
-- the Aug 2026 cost spikes (e.g. 22 Aug: 60 jobs / 387GB / ~Rs208 in one day,
-- traced live via Settings > Data > BigQuery Console > Job Log).
--
-- Fix: sync the FULL history (no since/until at all -- the scan costs the
-- same either way, so there's no reason to narrow it) into this table on a
-- schedule matching the real source-data refresh cadence, and have the page
-- read from here instead of BigQuery on every interaction.
--
-- ---------------------------------------------------------------------------
-- SCHEMA PROVENANCE
-- ---------------------------------------------------------------------------
-- Columns match careersLeadsSql()'s SELECT list exactly:
--   campaign           STRING   career_campaign_name
--   lead_date          DATE     DATE(opp_created_on)
--   source             STRING   career_channel_source, defaulted to 'Unknown'
--   channel            STRING   career_contacts_channel, defaulted to 'Unknown'
--   total_leads        INTEGER  COUNT(prospectid)
--   total_interested   INTEGER  COUNT(... ever_got_interested = 'yes')
--   won                INTEGER  COUNT(... opp_status LIKE '%won%')
--
-- Unlike overall_bq_daily, the natural key here IS unique: the query's own
-- GROUP BY 1, 2, 3, 4 guarantees exactly one row per
-- (campaign, lead_date, source, channel) combination, so row_key is a plain
-- md5 of those four fields with no ordinal disambiguator needed.
--
-- sync_id + the sync's own prune step (DELETE ... WHERE sync_id != this run's
-- id) handle rows disappearing from the source, same pattern as
-- overall_bq_daily.

CREATE TABLE IF NOT EXISTS public.leverage_careers_daily (
  row_key           TEXT PRIMARY KEY,
  campaign          TEXT,
  lead_date         DATE,
  source            TEXT,
  channel           TEXT,
  total_leads       BIGINT,
  total_interested  BIGINT,
  won               BIGINT,
  sync_id           TEXT,
  synced_at         TIMESTAMPTZ DEFAULT now()
);

-- The page filters by date range and optionally by source/channel/campaign.
CREATE INDEX IF NOT EXISTS idx_leverage_careers_daily_date     ON public.leverage_careers_daily(lead_date);
CREATE INDEX IF NOT EXISTS idx_leverage_careers_daily_source   ON public.leverage_careers_daily(source);
CREATE INDEX IF NOT EXISTS idx_leverage_careers_daily_channel  ON public.leverage_careers_daily(channel);
CREATE INDEX IF NOT EXISTS idx_leverage_careers_daily_campaign ON public.leverage_careers_daily(campaign);
CREATE INDEX IF NOT EXISTS idx_leverage_careers_daily_sync     ON public.leverage_careers_daily(sync_id);

-- RLS disabled to match every other table the anon key reads/writes in this
-- app (overall_bq_daily, overall_funnel_daily, source_health, report_logs, ...).
-- When the Supabase SQL editor asks "Run" vs "Enable RLS", choose Run.
ALTER TABLE public.leverage_careers_daily DISABLE ROW LEVEL SECURITY;
