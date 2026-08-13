-- Holds a built B2C Slack report between "posted to the sandbox for review"
-- and "approved -- pushed to the real #b2c-leverage-core channel".
--
-- Written by: api/send-report.mjs's b2c_daily_report cron branch, one row per
-- statement (P&L / Cash Flow) per day, right before it posts the preview to
-- the #dashboard-testing sandbox channel with an Approve button attached.
-- Read/updated by: the same file's Slack Interactivity handler
-- (handleSlackBlockAction), when someone clicks that button -- looks the row
-- up by id (carried as the button's `value`), checks it is still 'pending'
-- so a second click can't double-post, then posts the SAME stored messages
-- to the real channel and marks the row 'approved'.
--
-- Run this ONCE in the Supabase SQL editor. Click "Run", not "Enable RLS".

CREATE TABLE IF NOT EXISTS public.b2c_pending_reports (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  statement    TEXT NOT NULL,                 -- 'pnl' | 'cashflow'
  messages     JSONB NOT NULL,                -- the exact messages array built for this send
  status       TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved'
  approved_by  TEXT,
  approved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_b2c_pending_reports_created ON public.b2c_pending_reports(created_at DESC);

ALTER TABLE public.b2c_pending_reports DISABLE ROW LEVEL SECURITY;
