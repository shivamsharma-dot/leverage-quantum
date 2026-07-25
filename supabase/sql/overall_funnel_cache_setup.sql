-- Pre-aggregated cache of the "Overall PM" funnel sheet (one row per campaign per day),
-- synced by .github/workflows/overall-funnel-sync.yml. Exists so Ask AI's
-- analyze_campaign_contribution tool (api/ask-ai.js) can answer a "why did QLs change"
-- question by reading a small, fast Supabase table instead of re-downloading and parsing
-- the live sheet's full ~26MB / 180k+ raw rows on every single question.
--
-- Run this once in the Supabase SQL editor before the sync workflow's first run.

CREATE TABLE IF NOT EXISTS public.overall_funnel_daily (
  campaign TEXT NOT NULL,
  date DATE NOT NULL,
  leads INT DEFAULT 0,
  queued INT DEFAULT 0,
  total_ql INT DEFAULT 0,
  spend NUMERIC DEFAULT 0,
  apps INT DEFAULT 0,
  offers INT DEFAULT 0,
  deposits INT DEFAULT 0,
  raus INT DEFAULT 0,
  synced_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (campaign, date)
);

CREATE INDEX IF NOT EXISTS idx_overall_funnel_daily_date ON public.overall_funnel_daily(date);

-- RLS disabled to match every other table the anon key reads/writes in this app
-- (source_health, report_logs, activity_log, ask_ai_tool_calls, etc.).
ALTER TABLE public.overall_funnel_daily DISABLE ROW LEVEL SECURITY;
