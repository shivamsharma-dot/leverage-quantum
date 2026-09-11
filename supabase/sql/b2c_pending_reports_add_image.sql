-- Lets a pending Cash Flow report carry its own server-rendered PNG (and CSV)
-- alongside its text/blocks messages -- the b2c_daily_report job (both the
-- automated 3PM cron and the on-page "Send report now" button) now renders
-- the same 'sheet image' this app also builds client-side, so it can attach
-- it to the sandbox preview AND, on approval, to the real channel. Frozen at
-- pending-creation time, same as `messages` already is, so what the approver
-- saw is exactly what gets sent -- never re-rendered with fresher numbers at
-- approval time. Additive only -- nothing existing is touched.
--
-- Until this is run, api/send-report.mjs's savePendingB2CReport() detects the
-- missing columns (a failed insert) and falls back to storing the report
-- without the image -- the report still sends, just without the attachment,
-- exactly like the pre-image behaviour.
--
-- Run this ONCE in the Supabase SQL editor. Click "Run", not "Enable RLS".

ALTER TABLE public.b2c_pending_reports
  ADD COLUMN IF NOT EXISTS image_png_base64 TEXT,
  ADD COLUMN IF NOT EXISTS image_csv TEXT,
  ADD COLUMN IF NOT EXISTS image_filename TEXT;
