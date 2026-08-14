-- Adds an optional note to the Approve path of b2c_pending_reports, mirroring
-- the existing reason/rejected_by/rejected_at columns on the Disapprove side
-- (see b2c_pending_reports_add_reason.sql). Additive only -- nothing existing
-- is touched.
--
-- Until this is run, approving a report with NO note still works exactly as
-- before (api/send-report.mjs only includes approve_note in the PATCH body
-- when a note was actually typed) -- only an approval that includes a note
-- needs this column to exist.
--
-- Run this ONCE in the Supabase SQL editor. Click "Run", not "Enable RLS".

ALTER TABLE public.b2c_pending_reports
  ADD COLUMN IF NOT EXISTS approve_note TEXT;
