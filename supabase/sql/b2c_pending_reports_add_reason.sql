-- Adds Disapprove support to the existing b2c_pending_reports table
-- (b2c_pending_reports_setup.sql, already run). Additive only -- nothing
-- existing is touched.
--
-- status now also takes the value 'rejected', alongside the existing
-- 'pending' | 'approved'. reason/rejected_by/rejected_at mirror the existing
-- approved_by/approved_at columns for the reject path.
--
-- Run this ONCE in the Supabase SQL editor. Click "Run", not "Enable RLS".

ALTER TABLE public.b2c_pending_reports
  ADD COLUMN IF NOT EXISTS reason       TEXT,
  ADD COLUMN IF NOT EXISTS rejected_by  TEXT,
  ADD COLUMN IF NOT EXISTS rejected_at  TIMESTAMPTZ;
